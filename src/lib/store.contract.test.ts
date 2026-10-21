// Conformance: the demo store (this browser's IndexedDB) and the Supabase store must behave the same,
// so the app can swap them freely. The Supabase store runs against an in-memory fake client (src/test).
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeSupabase } from '../test/fakeSupabase'
import { demoStore } from './demoStore'
import { supabaseStore } from './supabaseStore'
import type { ClosetStore, SaveOutfitInput } from './types'

const OWNER = '11111111-1111-1111-1111-111111111111'
// Mirrors supabase/schema.sql: outfit_items rows are deleted with their outfit or item.
const cascades = { outfits: [{ table: 'outfit_items', column: 'outfit_id' }], items: [{ table: 'outfit_items', column: 'item_id' }] }
const jpeg = () => new Blob(['photo'], { type: 'image/jpeg' })
const png = () => new Blob(['cutout'], { type: 'image/png' })

const outfitInput = (patch: Partial<SaveOutfitInput> = {}): SaveOutfitInput => ({
  photo: jpeg(),
  wornOn: '2026-10-17',
  caption: 'Brooklyn museum!',
  newItems: [
    { category: 'jacket', name: 'letterman', colorHex: '#1f2a44', colorName: 'navy', cutout: png() },
    { category: 'shoes', name: 'tabis', colorHex: null, colorName: '', cutout: null },
  ],
  existingItemIds: [],
  ...patch,
})

const implementations: [string, () => ClosetStore][] = [
  [
    'demo store',
    () => {
      globalThis.indexedDB = new IDBFactory() // a fresh, empty browser database for each test
      return demoStore()
    },
  ],
  ['Supabase store', () => supabaseStore(fakeSupabase({ userId: OWNER, cascades }).client)],
]

describe.each(implementations)('%s', (_name, makeStore) => {
  let store: ClosetStore
  beforeEach(() => {
    store = makeStore()
  })

  it('starts empty', async () => {
    expect(await store.load()).toEqual({ outfits: [], items: [], links: [] })
  })

  it('saves an outfit with new pieces and links, and loads it back', async () => {
    // Act
    const saved = await store.saveOutfit(outfitInput())
    const data = await store.load()

    // Assert: the returned records
    expect(saved.outfit).toMatchObject({ wornOn: '2026-10-17', caption: 'Brooklyn museum!' })
    expect(saved.items.map((i) => [i.category, i.name, i.colorName])).toEqual([
      ['jacket', 'letterman', 'navy'],
      ['shoes', 'tabis', ''],
    ])
    expect(saved.items[1].cutoutPath).toBeNull()
    expect(saved.links).toEqual(saved.items.map((i) => ({ outfitId: saved.outfit.id, itemId: i.id })))
    // Assert: what a later load sees
    expect(data.outfits.map((o) => o.id)).toEqual([saved.outfit.id])
    expect(data.items.map((i) => i.id).sort()).toEqual(saved.items.map((i) => i.id).sort())
    expect(data.links).toHaveLength(2)
  })

  it('tags pieces that are already in the closet instead of duplicating them', async () => {
    const first = await store.saveOutfit(outfitInput())
    const jacket = first.items[0]

    const second = await store.saveOutfit(outfitInput({ caption: 'teal day', newItems: [], existingItemIds: [jacket.id] }))
    const data = await store.load()

    expect(second.items).toEqual([])
    expect(second.links).toEqual([{ outfitId: second.outfit.id, itemId: jacket.id }])
    expect(data.items).toHaveLength(2)
    expect(data.links.filter((l) => l.itemId === jacket.id)).toHaveLength(2)
  })

  it('gives viewable links for stored photos, and none for paths that do not exist', async () => {
    const { outfit, items } = await store.saveOutfit(outfitInput())
    const urls = await store.imageUrls([outfit.photoPath, items[0].cutoutPath!, 'missing/photo.jpg'])
    expect([...urls.keys()].sort()).toEqual([outfit.photoPath, items[0].cutoutPath].sort())
    for (const url of urls.values()) expect(url).toMatch(/^(blob:|https:)/)
  })

  it('edits an outfit and a piece', async () => {
    const { outfit, items } = await store.saveOutfit(outfitInput())

    const editedOutfit = await store.updateOutfit(outfit.id, { wornOn: '2026-10-18', caption: 'museum day' })
    const editedItem = await store.updateItem(items[0].id, { category: 'top', name: 'varsity', notes: 'vintage' })
    const data = await store.load()

    expect(editedOutfit).toMatchObject({ id: outfit.id, wornOn: '2026-10-18', caption: 'museum day' })
    expect(editedItem).toMatchObject({ id: items[0].id, category: 'top', name: 'varsity', notes: 'vintage' })
    expect(data.outfits[0].caption).toBe('museum day')
    expect(data.items.find((i) => i.id === items[0].id)?.name).toBe('varsity')
  })

  it('deleting an outfit keeps its pieces but removes its photo and tags', async () => {
    const { outfit } = await store.saveOutfit(outfitInput())

    await store.deleteOutfit(outfit)
    const data = await store.load()

    expect(data.outfits).toEqual([])
    expect(data.links).toEqual([])
    expect(data.items).toHaveLength(2)
    expect((await store.imageUrls([outfit.photoPath])).size).toBe(0)
  })

  it('deleting a piece removes its cutout and its tags', async () => {
    const { items } = await store.saveOutfit(outfitInput())

    await store.deleteItem(items[0])
    const data = await store.load()

    expect(data.items.map((i) => i.id)).toEqual([items[1].id])
    expect(data.links.map((l) => l.itemId)).toEqual([items[1].id])
    expect((await store.imageUrls([items[0].cutoutPath!])).size).toBe(0)
  })

  it('refuses to edit an outfit or piece that does not exist', async () => {
    await expect(store.updateOutfit('no-such-outfit', { wornOn: '2026-10-18', caption: '' })).rejects.toThrow()
    await expect(store.updateItem('no-such-item', { category: 'top', name: '', notes: '' })).rejects.toThrow()
  })
})

describe('Supabase store: a failed save leaves nothing half-saved', () => {
  it.each([
    ['the outfit photo upload fails', 'storage', 'upload', 0],
    ['the cutout upload fails (after the photo uploaded)', 'storage', 'upload', 1],
    ['the outfit row cannot be saved', 'outfits', 'insert', 0],
    ['the pieces cannot be saved', 'items', 'insert', 0],
    ['the tags cannot be saved', 'outfit_items', 'insert', 0],
  ] as const)('when %s', async (_case, table, op, after) => {
    // Arrange: let `after` matching calls succeed, then fail one
    const fake = fakeSupabase({ userId: OWNER, cascades })
    const store = supabaseStore(fake.client)
    fake.failNext(table, op, { after })

    // Act
    const outcome = store.saveOutfit(outfitInput())

    // Assert
    await expect(outcome).rejects.toThrow('simulated failure')
    expect(await store.load()).toEqual({ outfits: [], items: [], links: [] })
    expect(fake.files.size).toBe(0)
  })

  it('asks you to sign in again when the session has expired', async () => {
    const store = supabaseStore(fakeSupabase().client)
    await expect(store.saveOutfit(outfitInput())).rejects.toThrow('Please sign in again.')
  })
})

describe('demo store: damaged browser data', () => {
  it('starts fresh instead of crashing when saved data is malformed', async () => {
    globalThis.indexedDB = new IDBFactory()
    const store = demoStore()
    await store.saveOutfit(outfitInput())
    // Overwrite the record with something that isn't closet data.
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('arynscloset-demo', 1)
      open.onsuccess = () => {
        const tx = open.result.transaction('records', 'readwrite')
        tx.objectStore('records').put({ outfits: 'oops' }, 'closet')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }
    })
    expect(await store.load()).toEqual({ outfits: [], items: [], links: [] })
  })
})
