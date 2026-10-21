import { describe, expect, it } from 'vitest'
import { missingSlots, randomLook, type Slot } from './shuffle'
import type { Category, Item } from './types'

const item = (id: string, category: Category): Item => ({ id, category, name: id, colorHex: null, colorName: '', cutoutPath: null, notes: '', createdAt: '' })

const closet = [item('t1', 'top'), item('t2', 'top'), item('b1', 'bottom'), item('s1', 'shoes'), item('j1', 'jacket'), item('a1', 'accessory'), item('d1', 'dress')]
const all = new Set<Slot>(['jacket', 'accessory'])

describe('randomLook', () => {
  it('fills top, bottom and shoes for separates, plus enabled optional slots', () => {
    const look = randomLook(closet, 'separates', all, {}, {})
    expect(Object.keys(look).sort()).toEqual(['accessory', 'bottom', 'jacket', 'shoes', 'top'])
    expect(look.dress).toBeUndefined()
  })

  it('uses a dress instead of top and bottom for the dress shape', () => {
    const look = randomLook(closet, 'dress', new Set(), {}, {})
    expect(Object.keys(look).sort()).toEqual(['dress', 'shoes'])
  })

  it('keeps locked pieces and skips disabled optional slots', () => {
    const look = randomLook(closet, 'separates', new Set(), { top: closet[1] }, {})
    expect(look.top?.id).toBe('t2')
    expect(look.jacket).toBeUndefined()
    expect(look.accessory).toBeUndefined()
  })

  it('picks a different piece than last time when there is a choice', () => {
    for (let i = 0; i < 20; i++) expect(randomLook(closet, 'separates', all, {}, { top: closet[0] }).top?.id).toBe('t2')
  })

  it('leaves a slot empty when the closet has nothing for it', () => {
    const look = randomLook([item('t1', 'top')], 'separates', new Set(), {}, {})
    expect(look).toEqual({ top: expect.objectContaining({ id: 't1' }) })
  })
})

describe('missingSlots', () => {
  it('lists required slots with nothing in the closet', () => {
    expect(missingSlots([item('t1', 'top')], 'separates')).toEqual(['bottom', 'shoes'])
    expect(missingSlots(closet, 'dress')).toEqual([])
  })
})
