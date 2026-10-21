import { describe, expect, it } from 'vitest'
import { EDGE_TOLERANCE, assessItems, cleanMask, measure } from './masks'

// A 100×100 photo: 10,000 pixels, so 1 pixel = 0.0001 of the photo.
const W = 100
const H = 100

/** A mask with filled rectangles [x0, y0, x1, y1] (inclusive). */
function rects(...boxes: [number, number, number, number][]) {
  const mask = new Uint8Array(W * H)
  for (const [x0, y0, x1, y1] of boxes) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) mask[y * W + x] = 1
  return mask
}

const masks = (entries: Record<string, Uint8Array>) => new Map(Object.entries(entries))

describe('assessItems: the happy path', () => {
  it('catalogs a fully visible item with its area and bounding box', () => {
    // Arrange: a top well inside the frame
    const labels = masks({ 'Upper-clothes': rects([20, 20, 59, 59]) })

    // Act
    const { visible, rejections } = assessItems(labels, W, H)

    // Assert
    expect(rejections).toEqual([])
    expect(visible).toHaveLength(1)
    expect(visible[0].group.kind).toBe('top')
    expect(visible[0].area).toBe(1600)
    expect(visible[0].share).toBeCloseTo(0.16)
    expect(visible[0].box).toEqual({ minX: 20, minY: 20, maxX: 59, maxY: 59 })
  })

  it('counts left and right shoes as one pair', () => {
    const labels = masks({ Pants: rects([40, 40, 60, 80]), 'Left-shoe': rects([38, 84, 46, 90]), 'Right-shoe': rects([54, 84, 62, 90]) })
    const { visible } = assessItems(labels, W, H)
    expect(visible.map((v) => v.group.kind)).toEqual(['pants', 'shoes'])
  })
})

describe('assessItems: items that are not visible enough', () => {
  it('rejects an item cut off at the bottom of the photo', () => {
    const { visible, rejections } = assessItems(masks({ Pants: rects([30, 50, 70, 99]) }), W, H)
    expect(visible).toEqual([])
    expect(rejections).toEqual([{ kind: 'pants', reason: 'cut off at the bottom of the photo' }])
  })

  it('names every side an item is cut off on', () => {
    const { rejections } = assessItems(masks({ Dress: rects([0, 0, 40, 60]) }), W, H)
    expect(rejections).toEqual([{ kind: 'dress', reason: 'cut off at the top and left of the photo' }])
  })

  it('rejects an item that is too small or mostly hidden, but larger than noise', () => {
    // A hat needs 0.3% of the photo; this one is 0.2% (20 px).
    const { visible, rejections } = assessItems(masks({ Hat: rects([40, 10, 44, 13]) }), W, H)
    expect(visible).toEqual([])
    expect(rejections).toEqual([{ kind: 'hat', reason: 'too small or mostly hidden in the photo' }])
  })

  it('ignores model noise without an error popup', () => {
    // 4 px is under the 0.08% noise floor (8 px).
    expect(assessItems(masks({ Belt: rects([50, 50, 51, 51]) }), W, H)).toEqual({ visible: [], rejections: [] })
  })

  it('skips "shoes" when the legs run off the bottom (the feet are not in frame)', () => {
    const labels = masks({ Pants: rects([30, 40, 70, 99]), 'Left-shoe': rects([10, 60, 18, 66]) })
    const { visible, rejections } = assessItems(labels, W, H)
    expect(visible).toEqual([])
    expect(rejections.map((r) => r.kind)).toEqual(['pants']) // no shoe popup
  })
})

describe('assessItems: edge boundaries', () => {
  // The border is 2 pixels deep, so an item touching the bottom with width n puts 2n pixels there.
  it.each([
    { width: 6, borderPixels: 12, cutOff: false },
    { width: 7, borderPixels: 14, cutOff: true },
  ])('an item with $borderPixels pixels in the border is cut off: $cutOff', ({ width, borderPixels, cutOff }) => {
    // Arrange: a tall bag whose base touches the bottom edge
    const bag = rects([50, 70, 50 + width - 1, 99])
    expect(measure(bag, W, H).edges.bottom).toBe(borderPixels)
    expect(EDGE_TOLERANCE).toBe(12)

    // Act
    const { rejections } = assessItems(masks({ Bag: bag }), W, H)

    // Assert
    expect(rejections.length > 0).toBe(cutOff)
  })

  it('handles a photo where the model found nothing', () => {
    expect(assessItems(new Map(), W, H)).toEqual({ visible: [], rejections: [] })
    expect(assessItems(masks({ Background: rects([0, 0, 99, 99]) }), W, H)).toEqual({ visible: [], rejections: [] })
  })

  it('handles a 1×1 photo', () => {
    expect(() => assessItems(new Map([['Upper-clothes', new Uint8Array([1])]]), 1, 1)).not.toThrow()
  })
})

describe('cleanMask', () => {
  it('drops specks smaller than 15% of the main blob, keeps sizable second blobs', () => {
    // Arrange: main blob 400 px, a 30 px speck (7.5%), and a 100 px blob (25%)
    const mask = rects([10, 10, 29, 29], [60, 60, 65, 64], [70, 10, 79, 19])

    // Act
    const cleaned = cleanMask(mask, W, H)

    // Assert
    expect(measure(cleaned, W, H).area).toBe(400 + 100)
    expect(cleaned[62 * W + 62]).toBe(0)
  })

  it('treats only up/down/left/right neighbors as connected (diagonals are separate)', () => {
    const mask = rects([10, 10, 29, 29])
    mask[30 * W + 30] = 1 // touches the blob only diagonally, and is a 1 px speck
    expect(cleanMask(mask, W, H)[30 * W + 30]).toBe(0)
  })

  it('does not overflow the stack on a very noisy mask', () => {
    const noisy = new Uint8Array(W * H).map((_, i) => ((i % W) + Math.floor(i / W)) % 2)
    expect(() => cleanMask(noisy, W, H)).not.toThrow()
  })
})
