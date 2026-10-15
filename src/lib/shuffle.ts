import type { Category, Item } from './types'

export type Slot = 'jacket' | 'top' | 'bottom' | 'dress' | 'shoes' | 'accessory'
export type Look = Partial<Record<Slot, Item>>
export type Shape = 'separates' | 'dress'

export const SLOT_ORDER: Record<Shape, Slot[]> = {
  separates: ['jacket', 'top', 'bottom', 'shoes', 'accessory'],
  dress: ['jacket', 'dress', 'shoes', 'accessory'],
}

/** Slots you can switch off; the others are always part of an outfit. */
export const OPTIONAL_SLOTS: Slot[] = ['jacket', 'accessory']

const pick = <T,>(list: T[], avoid?: T) => {
  const pool = list.length > 1 && avoid ? list.filter((x) => x !== avoid) : list
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * A random outfit from the closet: top + bottom (or a dress), shoes, and optionally a jacket and an accessory.
 * Locked slots keep their item; others get a different item than last time when there's a choice.
 */
export function randomLook(items: Item[], shape: Shape, enabled: Set<Slot>, locked: Look, previous: Look): Look {
  const byCategory = (category: Category) => items.filter((i) => i.category === category)
  const look: Look = {}
  for (const slot of SLOT_ORDER[shape]) {
    if (OPTIONAL_SLOTS.includes(slot) && !enabled.has(slot)) continue
    if (locked[slot]) {
      look[slot] = locked[slot]
      continue
    }
    const options = byCategory(slot)
    if (options.length) look[slot] = pick(options, previous[slot])
  }
  return look
}

/** Which required slots have nothing in the closet yet. */
export function missingSlots(items: Item[], shape: Shape): Slot[] {
  return SLOT_ORDER[shape].filter((slot) => !OPTIONAL_SLOTS.includes(slot) && !items.some((i) => i.category === slot))
}
