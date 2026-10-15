import { newId } from './ids'
import type { ClosetData, ClosetStore, Item, Outfit } from './types'

// Demo mode: used until Supabase is configured. Photos and records stay in this browser (IndexedDB).
const DB_NAME = 'arynscloset-demo'
const RECORDS = 'records'
const BLOBS = 'blobs'
const DATA_KEY = 'closet'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(RECORDS)
      request.result.createObjectStore(BLOBS)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('This browser won’t let the closet save photos (private browsing?).'))
  })
}

function run<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const request = action(tx.objectStore(store))
    tx.oncomplete = () => resolve(request ? request.result : undefined)
    tx.onerror = () => reject(tx.error ?? new Error('Couldn’t save to this browser.'))
  })
}

const empty = (): ClosetData => ({ outfits: [], items: [], links: [] })
const now = () => new Date().toISOString()

export async function resetDemo() {
  const db = await openDb()
  await run(db, RECORDS, 'readwrite', (s) => s.clear())
  await run(db, BLOBS, 'readwrite', (s) => s.clear())
}

export function demoStore(): ClosetStore {
  const db = openDb()
  // Blob URLs are made once per stored image and reused.
  const objectUrls = new Map<string, string>()

  const read = async (): Promise<ClosetData> => {
    const data = await run<ClosetData>(await db, RECORDS, 'readonly', (s) => s.get(DATA_KEY))
    return data && Array.isArray(data.outfits) && Array.isArray(data.items) && Array.isArray(data.links) ? data : empty()
  }
  const write = async (data: ClosetData) => {
    await run(await db, RECORDS, 'readwrite', (s) => s.put(data, DATA_KEY))
  }
  const putBlob = async (path: string, blob: Blob) => {
    await run(await db, BLOBS, 'readwrite', (s) => s.put(blob, path))
  }
  const removeBlob = async (path: string) => {
    await run(await db, BLOBS, 'readwrite', (s) => s.delete(path))
    const url = objectUrls.get(path)
    if (url) URL.revokeObjectURL(url)
    objectUrls.delete(path)
  }

  return {
    load: read,

    async imageUrls(paths) {
      const urls = new Map<string, string>()
      for (const path of paths) {
        let url = objectUrls.get(path)
        if (!url) {
          const blob = await run<Blob>(await db, BLOBS, 'readonly', (s) => s.get(path))
          if (!blob) continue
          url = URL.createObjectURL(blob)
          objectUrls.set(path, url)
        }
        urls.set(path, url)
      }
      return urls
    },

    async saveOutfit(input) {
      const data = await read()
      const outfitId = newId()
      const outfit: Outfit = { id: outfitId, photoPath: `demo/outfits/${outfitId}.jpg`, wornOn: input.wornOn, caption: input.caption, createdAt: now() }
      await putBlob(outfit.photoPath, input.photo)
      const items: Item[] = []
      for (const newItem of input.newItems) {
        const id = newId()
        const cutoutPath = newItem.cutout ? `demo/items/${id}.png` : null
        if (newItem.cutout && cutoutPath) await putBlob(cutoutPath, newItem.cutout)
        items.push({ id, category: newItem.category, name: newItem.name, colorHex: newItem.colorHex, colorName: newItem.colorName, cutoutPath, notes: '', createdAt: now() })
      }
      const links = [...items.map((i) => i.id), ...input.existingItemIds].map((itemId) => ({ outfitId, itemId }))
      await write({ outfits: [outfit, ...data.outfits], items: [...items, ...data.items], links: [...data.links, ...links] })
      return { outfit, items, links }
    },

    async updateOutfit(id, patch) {
      const data = await read()
      const existing = data.outfits.find((o) => o.id === id)
      if (!existing) throw new Error('Outfit not found.')
      const updated = { ...existing, ...patch }
      await write({ ...data, outfits: data.outfits.map((o) => (o.id === id ? updated : o)) })
      return updated
    },

    async deleteOutfit(outfit) {
      const data = await read()
      await write({ ...data, outfits: data.outfits.filter((o) => o.id !== outfit.id), links: data.links.filter((l) => l.outfitId !== outfit.id) })
      await removeBlob(outfit.photoPath)
    },

    async updateItem(id, patch) {
      const data = await read()
      const existing = data.items.find((i) => i.id === id)
      if (!existing) throw new Error('Item not found.')
      const updated = { ...existing, ...patch }
      await write({ ...data, items: data.items.map((i) => (i.id === id ? updated : i)) })
      return updated
    },

    async deleteItem(item) {
      const data = await read()
      await write({ ...data, items: data.items.filter((i) => i.id !== item.id), links: data.links.filter((l) => l.itemId !== item.id) })
      if (item.cutoutPath) await removeBlob(item.cutoutPath)
    },
  }
}
