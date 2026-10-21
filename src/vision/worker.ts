/// <reference lib="webworker" />
// Runs the clothing scanner off the main thread so the page stays responsive.
import { env, pipeline, RawImage, type ImageSegmentationPipeline } from '@huggingface/transformers'
import { colorName, dominantColor, toHex } from './colors'
import { assessItems, type Box } from './masks'
import modelConfig from './model.json'
import type { Detection, ScanMessage, WorkerRequest } from './protocol'

const MODEL = modelConfig.model
const base = import.meta.env.BASE_URL
// Files live under the pinned revision (see scripts/fetch-model.mjs), so the library's browser cache,
// which is keyed by URL, can never serve an old revision's model after an update.
const modelsRoot = `${base}models/${modelConfig.revision}/`
const modelDir = `${modelsRoot}${MODEL}/`
/** The only model files that exist (downloaded and checksummed by scripts/fetch-model.mjs). */
const MODEL_FILES = new Set(Object.keys(modelConfig.files))

// Everything is served by this app; never fetch models or code from elsewhere.
env.allowRemoteModels = false
env.allowLocalModels = true
// A path, not a full URL: the library only checks whether local files exist when given a path.
env.localModelPath = modelsRoot
env.useWasmCache = false
// The library probes for optional files (tokenizer, processor config…). Static hosts answer unknown paths
// with the app's index.html and a 200, which would be mistaken for those files, so only the known model
// files are fetched and everything else is a 404 without touching the network.
env.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input), self.location.origin)
  const known = url.origin === self.location.origin && url.pathname.startsWith(modelDir) && MODEL_FILES.has(url.pathname.slice(modelDir.length))
  return known ? fetch(url, init) : Promise.resolve(new Response(null, { status: 404 }))
}
const wasm = env.backends.onnx.wasm!
// Full URLs (with the origin) on purpose: Vite's dev server rewrites root-relative dynamic imports
// and refuses to serve files from public/ that way, which broke the scanner in `npm run dev`.
const ortBase = new URL(`${base}ort/`, self.location.origin).href
const [ortMjs, ortWasm] = modelConfig.ortFiles
wasm.wasmPaths = { mjs: `${ortBase}${ortMjs}`, wasm: `${ortBase}${ortWasm}` }
wasm.numThreads = 1
wasm.proxy = false

/** Longest side of the image the model sees. Bigger is slower and barely more accurate. */
const SCAN_SIZE = 640

let segmenter: Promise<ImageSegmentationPipeline> | null = null
/** Scans waiting for the model to load; each one is sent the download progress. */
const waitingForModel = new Set<number>()

const createPipeline = () =>
  pipeline('image-segmentation', MODEL, {
    device: 'wasm',
    dtype: 'fp32',
    progress_callback: (event: { status: string; progress?: number }) => {
      // 'progress_total' covers all model files; per-file 'progress' events restart at 0 for each file.
      if (event.status !== 'progress_total') return
      for (const waiting of waitingForModel) post({ id: waiting, type: 'progress', stage: 'loading-model', percent: event.progress ?? null })
    },
  }) as Promise<ImageSegmentationPipeline>

async function loadModel(id: number) {
  segmenter ??= createPipeline()
    // A dropped connection or a half-written cache entry can break the first load. Clear the library's
    // browser cache and try once more before giving up.
    .catch(async () => {
      await self.caches?.delete('transformers-cache').catch(() => false)
      return createPipeline()
    })
    .catch((error: unknown) => {
      // Don't keep a failed load: the next scan should try again.
      segmenter = null
      throw error
    })
  waitingForModel.add(id)
  try {
    return await segmenter
  } finally {
    waitingForModel.delete(id)
  }
}

const post = (message: ScanMessage) => self.postMessage(message)

/** Scans the page no longer wants (a new photo was picked, or the page closed). */
const cancelled = new Set<number>()
class Cancelled extends Error {}
const stopIfCancelled = (id: number) => {
  if (cancelled.has(id)) throw new Cancelled()
}

async function makeCutout(bitmap: ImageBitmap, mask: Uint8Array, w: number, h: number, box: Box) {
  const pad = 4
  const x0 = Math.max(0, box.minX - pad)
  const y0 = Math.max(0, box.minY - pad)
  const x1 = Math.min(w - 1, box.maxX + pad)
  const y1 = Math.min(h - 1, box.maxY + pad)
  const bw = x1 - x0 + 1
  const bh = y1 - y0 + 1

  // Mask for just the item's box, as an alpha channel.
  const maskCanvas = new OffscreenCanvas(bw, bh)
  const maskData = new ImageData(bw, bh)
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (mask[(y + y0) * w + (x + x0)]) maskData.data[(y * bw + x) * 4 + 3] = 255
    }
  }
  maskCanvas.getContext('2d')!.putImageData(maskData, 0, 0)

  // Cut the same region from the full-resolution photo, capped at 640px.
  // Separate x/y scales: the scan size was rounded per side, so the two ratios can differ.
  const scaleX = bitmap.width / w
  const scaleY = bitmap.height / h
  const sx = x0 * scaleX
  const sy = y0 * scaleY
  const sw = bw * scaleX
  const sh = bh * scaleY
  const outScale = Math.min(1, 640 / Math.max(sw, sh))
  const out = new OffscreenCanvas(Math.max(1, Math.round(sw * outScale)), Math.max(1, Math.round(sh * outScale)))
  const ctx = out.getContext('2d')!
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, out.width, out.height)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(maskCanvas, 0, 0, out.width, out.height)
  return out.convertToBlob({ type: 'image/png' })
}

async function scan(id: number, image: ImageBitmap) {
  const model = await loadModel(id)
  stopIfCancelled(id)
  post({ id, type: 'progress', stage: 'scanning', percent: null })

  const scale = Math.min(1, SCAN_SIZE / Math.max(image.width, image.height))
  const w = Math.max(1, Math.round(image.width * scale))
  const h = Math.max(1, Math.round(image.height * scale))
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0, w, h)
  const pixels = ctx.getImageData(0, 0, w, h)

  const segments = await model(new RawImage(pixels.data, w, h, 4).rgb())
  stopIfCancelled(id)
  const labelMasks = new Map<string, Uint8Array>()
  for (const segment of segments) {
    const data = segment.mask.data
    const binary = new Uint8Array(w * h)
    for (let i = 0; i < binary.length; i++) binary[i] = data[i] > 127 ? 1 : 0
    labelMasks.set(segment.label ?? '', binary)
  }

  const { visible, rejections } = assessItems(labelMasks, w, h)
  const detections: Detection[] = []

  for (const { group, mask, area, share, box } of visible) {
    // Sample up to ~3000 of the item's pixels for its main color.
    const step = Math.max(1, Math.floor(area / 3000))
    const samples: [number, number, number][] = []
    let seen = 0
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue
      if (seen++ % step === 0) samples.push([pixels.data[i * 4], pixels.data[i * 4 + 1], pixels.data[i * 4 + 2]])
    }
    const color = dominantColor(samples)
    stopIfCancelled(id)

    detections.push({
      category: group.category,
      kind: group.kind,
      cutout: await makeCutout(image, mask, w, h, box),
      colorHex: toHex(color),
      colorName: colorName(color),
      area: share,
    })
  }

  post({ id, type: 'result', detections, rejections })
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  if (request.type === 'cancel') {
    cancelled.add(request.id)
    return
  }
  const { id, image } = request
  scan(id, image)
    .catch((error: unknown) => {
      // A cancelled scan's page has already moved on, so it gets no reply.
      if (error instanceof Cancelled) return
      post({ id, type: 'error', message: error instanceof Error ? error.message : String(error) })
    })
    .finally(() => {
      // Release the decoded photo whether or not the scan worked.
      image.close()
      cancelled.delete(id)
    })
}
