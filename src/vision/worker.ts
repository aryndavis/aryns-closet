/// <reference lib="webworker" />
// Runs the clothing scanner off the main thread so the page stays responsive.
import { env, pipeline, RawImage, type ImageSegmentationPipeline } from '@huggingface/transformers'
import type { Category } from '../lib/types'
import { colorName, dominantColor, toHex } from './colors'
import modelConfig from './model.json'
import type { Detection, Rejection, ScanMessage, WorkerRequest } from './protocol'

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
/** Mask pixels allowed in the photo's border before an item counts as cut off. */
const EDGE_TOLERANCE = 12

type Group = { kind: string; category: Category; labels: string[]; minArea: number }

const GROUPS: Group[] = [
  { kind: 'top', category: 'top', labels: ['Upper-clothes'], minArea: 0.008 },
  { kind: 'pants', category: 'bottom', labels: ['Pants'], minArea: 0.008 },
  { kind: 'skirt', category: 'bottom', labels: ['Skirt'], minArea: 0.006 },
  { kind: 'dress', category: 'dress', labels: ['Dress'], minArea: 0.01 },
  { kind: 'shoes', category: 'shoes', labels: ['Left-shoe', 'Right-shoe'], minArea: 0.002 },
  { kind: 'hat', category: 'accessory', labels: ['Hat'], minArea: 0.003 },
  { kind: 'bag', category: 'accessory', labels: ['Bag'], minArea: 0.003 },
  { kind: 'scarf', category: 'accessory', labels: ['Scarf'], minArea: 0.003 },
  { kind: 'belt', category: 'accessory', labels: ['Belt'], minArea: 0.002 },
  { kind: 'sunglasses', category: 'accessory', labels: ['Sunglasses'], minArea: 0.001 },
]

/** Anything smaller than this share of the photo is model noise, not a half-hidden item. */
const NOISE_AREA = 0.0008

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

/** Keep only sizable connected blobs, dropping specks the model mislabels. */
function cleanMask(mask: Uint8Array, w: number, h: number) {
  const component = new Int32Array(w * h).fill(-1)
  const sizes: number[] = []
  const stack: number[] = []
  const visit = (n: number, label: number) => {
    if (mask[n] && component[n] === -1) {
      component[n] = label
      stack.push(n)
    }
  }
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || component[start] !== -1) continue
    const label = sizes.length
    let size = 0
    visit(start, label)
    while (stack.length) {
      const p = stack.pop()!
      size++
      const x = p % w
      if (p >= w) visit(p - w, label)
      if (p + w < mask.length) visit(p + w, label)
      if (x > 0) visit(p - 1, label)
      if (x < w - 1) visit(p + 1, label)
    }
    sizes.push(size)
  }
  // A loop, not Math.max(...sizes): spreading a very noisy mask's components can overflow the call stack.
  const largest = sizes.reduce((a, b) => Math.max(a, b), 0)
  const keep = sizes.map((s) => s >= largest * 0.15 && s >= w * h * NOISE_AREA)
  const cleaned = new Uint8Array(w * h)
  for (let i = 0; i < mask.length; i++) if (component[i] >= 0 && keep[component[i]]) cleaned[i] = 1
  return cleaned
}

function measure(mask: Uint8Array, w: number, h: number) {
  let area = 0
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  const edges = { top: 0, bottom: 0, left: 0, right: 0 }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue
      area++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (y < 2) edges.top++
      if (y >= h - 2) edges.bottom++
      if (x < 2) edges.left++
      if (x >= w - 2) edges.right++
    }
  }
  return { area, box: { minX, minY, maxX, maxY }, edges }
}

async function makeCutout(bitmap: ImageBitmap, mask: Uint8Array, w: number, h: number, box: { minX: number; minY: number; maxX: number; maxY: number }) {
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

  const union = (labels: string[]) => {
    const merged = new Uint8Array(w * h)
    for (const label of labels) {
      const mask = labelMasks.get(label)
      if (mask) for (let i = 0; i < merged.length; i++) merged[i] |= mask[i]
    }
    return merged
  }

  // If anything worn on the legs runs off the bottom of the photo, the feet aren't in frame,
  // so any "shoes" the model sees are something else (bags, cameras, hands…).
  const lowerBody = measure(cleanMask(union(['Pants', 'Skirt', 'Dress', 'Left-leg', 'Right-leg']), w, h), w, h)
  const feetOutOfFrame = lowerBody.edges.bottom > EDGE_TOLERANCE

  const detections: Detection[] = []
  const rejections: Rejection[] = []
  const total = w * h

  for (const group of GROUPS) {
    if (!group.labels.some((label) => labelMasks.has(label))) continue
    const mask = cleanMask(union(group.labels), w, h)
    const { area, box, edges } = measure(mask, w, h)
    const share = area / total
    if (share < NOISE_AREA) continue
    if (group.category === 'shoes' && feetOutOfFrame) continue

    const cutSides = (Object.keys(edges) as (keyof typeof edges)[]).filter((side) => edges[side] > EDGE_TOLERANCE)
    if (cutSides.length > 0) {
      rejections.push({ kind: group.kind, reason: `cut off at the ${cutSides.join(' and ')} of the photo` })
      continue
    }
    if (share < group.minArea) {
      rejections.push({ kind: group.kind, reason: 'too small or mostly hidden in the photo' })
      continue
    }

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
