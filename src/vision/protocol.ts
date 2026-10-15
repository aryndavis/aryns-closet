import type { Category } from '../lib/types'

/** A clothing item the scanner found and fully saw, cut out as a transparent PNG sticker. */
export interface Detection {
  category: Category
  /** What the model called it, e.g. "pants", "skirt", "hat". */
  kind: string
  cutout: Blob
  colorHex: string
  colorName: string
  /** Share of the photo the item covers (0 to 1). */
  area: number
}

/** Something that looked like clothing but wasn't visible enough to add to the closet. */
export interface Rejection {
  kind: string
  reason: string
}

export type ScanRequest = { id: number; image: ImageBitmap }

export type ScanMessage =
  | { id: number; type: 'progress'; stage: 'loading-model' | 'scanning'; percent: number | null }
  | { id: number; type: 'result'; detections: Detection[]; rejections: Rejection[] }
  | { id: number; type: 'error'; message: string }
