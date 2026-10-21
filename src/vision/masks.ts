// Decides which clothing items in a photo are fully visible, from the segmentation model's per-label masks.
// Pure functions (no model, no canvas), so the rules can be tested directly. The worker uses these.
import type { Category } from '../lib/types'
import type { Rejection } from './protocol'

/** Mask pixels allowed in the photo's border before an item counts as cut off. */
export const EDGE_TOLERANCE = 12

/** Anything smaller than this share of the photo is model noise, not a half-hidden item. */
export const NOISE_AREA = 0.0008

export type Group = { kind: string; category: Category; labels: string[]; minArea: number }

export const GROUPS: Group[] = [
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

export type Box = { minX: number; minY: number; maxX: number; maxY: number }

/** Keep only sizable connected blobs, dropping specks the model mislabels. */
export function cleanMask(mask: Uint8Array, w: number, h: number) {
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

/** Area, bounding box, and how many pixels sit in each 2-pixel border of the photo. */
export function measure(mask: Uint8Array, w: number, h: number) {
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
  return { area, box: { minX, minY, maxX, maxY } as Box, edges }
}

export interface VisibleItem {
  group: Group
  mask: Uint8Array
  area: number
  /** Share of the photo the item covers (0 to 1). */
  share: number
  box: Box
}

/**
 * Splits what the model found into items that are fully visible (worth cataloging) and rejections
 * (cut off at the photo's edge, or too small / mostly hidden). Noise is dropped silently.
 */
export function assessItems(labelMasks: Map<string, Uint8Array>, w: number, h: number): { visible: VisibleItem[]; rejections: Rejection[] } {
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

  const visible: VisibleItem[] = []
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
    visible.push({ group, mask, area, share, box })
  }
  return { visible, rejections }
}
