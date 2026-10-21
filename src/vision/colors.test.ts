import { describe, expect, it } from 'vitest'
import { colorName, dominantColor, toHex } from './colors'

describe('colorName', () => {
  it('names common clothing colors', () => {
    expect(colorName([18, 18, 20])).toBe('black')
    expect(colorName([250, 250, 248])).toBe('white')
    expect(colorName([30, 40, 80])).toBe('navy')
    expect(colorName([85, 110, 150])).toBe('denim')
    expect(colorName([236, 62, 150])).toBe('hot pink')
    expect(colorName([112, 72, 42])).toBe('brown')
  })
})

describe('toHex', () => {
  it('rounds and pads channels', () => {
    expect(toHex([255, 0, 15.6])).toBe('#ff0010')
  })
})

describe('dominantColor', () => {
  it('returns gray when there are no samples', () => {
    expect(dominantColor([])).toEqual([128, 128, 128])
  })

  it('finds the main color and ignores dark shadows', () => {
    const red: [number, number, number][] = Array.from({ length: 70 }, () => [200, 30, 40])
    const shadow: [number, number, number][] = Array.from({ length: 30 }, () => [10, 5, 5])
    const [r, g, b] = dominantColor([...red, ...shadow])
    expect(colorName([r, g, b])).toBe('red')
  })
})
