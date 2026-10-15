/// <reference lib="webworker" />
// Runs the clothing scanner off the main thread so the page stays responsive.
import { env, pipeline, RawImage, type ImageSegmentationPipeline } from '@huggingface/transformers'
import type { Category } from '../lib/types'
import { colorName, dominantColor, toHex } from './colors'
import type { Detection, Rejection, ScanMessage, ScanRequest } from './protocol'

const MODEL = 'Xenova/segformer_b0_clothes'
const base = import.meta.env.BASE_URL
const modelDir = `${base}models/${MODEL}/`
/** The only model files that exist (downloaded and checksummed by scripts/fetch-model.mjs). */
const MODEL_FILES = new Set(['config.json', 'preprocessor_config.json', 'onnx/model.onnx'])

// Everything is served by this app; never fetch models or code from elsewhere.
env.allowRemoteModels = false
env.allowLocalModels = true
// A path, not a full URL: the library only checks whether local files exist when given a path.
env.localModelPath = `${base}models/`
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
wasm.wasmPaths = { mjs: `${base}ort/ort-wasm-simd-threaded.mjs`, wasm: `${base}ort/ort-wasm-simd-threaded.wasm` }
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

function loadModel(id: number) {
  segmenter ??= pipeline('image-segmentation', MODEL, {
    device: 'wasm',
    dtype: 'fp32',
    progress_callback: (event: { status: string; progress?: number }) => {
      if (event.status === 'progress') post({ id, type: 'progress', stage: 'loading-model', percent: event.progress ?? null })
    },
  }) as Promise<ImageSegmentationPipeline>
  return segmenter
}

const post = (message: ScanMessage) => self.postMessage(message)

/** Keep only sizable connected blobs, dropping specks the model mislabels. */
function cleanMask(mask: Uint8Array, w: number, h: number) {
  const component = new Int32Array(w * h).fill(-1)
  const sizes: number[] = []
  const stack: number[] = []
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || component[start] !== -1) continue
    const label = sizes.length
    let size = 0
    stack.push(start)
    component[start] = label
    while (stack.length) {
      const p = stack.pop()!
      size++
      const x = p % w
      const neighbors = [p - w, p + w, x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1]
      for (const n of neighbors) {
        if (n >= 0 && n < mask.length && mask[n] && component[n] === -1) {
          component[n] = label
          stack.push(n)
        }
      }
    }
    sizes.push(size)
  }
  const largest = Math.max(0, ...sizes)
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
  const scale = bitmap.width / w
  const sx = x0 * scale
  const sy = y0 * scale
  const sw = bw * scale
  const sh = bh * scale
  const outScale = Math.min(1, 640 / Math.max(sw, sh))
  const out = new OffscreenCanvas(Math.max(1, Math.round(sw * outScale)), Math.max(1, Math.round(sh * outScale)))
  const ctx = out.getContext('2d')!
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, out.width, out.height)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(maskCanvas, 0, 0, out.width, out.height)
  return out.convertToBlob({ type: 'image/png' })
}

async function scan({ id, image }: ScanRequest) {
  const model = await loadModel(id)
  post({ id, type: 'progress', stage: 'scanning', percent: null })

  const scale = Math.min(1, SCAN_SIZE / Math.max(image.width, image.height))
  const w = Math.max(1, Math.round(image.width * scale))
  const h = Math.max(1, Math.round(image.height * scale))
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0, w, h)
  const pixels = ctx.getImageData(0, 0, w, h)

  const segments = await model(new RawImage(pixels.data, w, h, 4).rgb())
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
  const lowerBody = measure(union(['Pants', 'Skirt', 'Dress', 'Left-leg', 'Right-leg']), w, h)
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

    detections.push({
      category: group.category,
      kind: group.kind,
      cutout: await makeCutout(image, mask, w, h, box),
      colorHex: toHex(color),
      colorName: colorName(color),
      area: share,
    })
  }

  image.close()
  post({ id, type: 'result', detections, rejections })
}

self.onmessage = (event: MessageEvent<ScanRequest>) => {
  scan(event.data).catch((error: unknown) => {
    post({ id: event.data.id, type: 'error', message: error instanceof Error ? error.message : String(error) })
  })
}
