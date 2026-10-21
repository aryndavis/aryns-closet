import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { newId } from './ids'
import type { ClosetStore, Item, Outfit, OutfitItem } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

export const supabase: SupabaseClient | null =
  url && key && url.startsWith('https://')
    ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
    : null

const BUCKET = 'closet'
/** Signed photo links last 12 hours; the app re-signs them on the next load. */
const URL_LIFETIME = 12 * 60 * 60

type OutfitRow = { id: string; photo_path: string; worn_on: string; caption: string; created_at: string }
type ItemRow = {
  id: string
  category: Item['category']
  name: string
  color_hex: string | null
  color_name: string
  cutout_path: string | null
  notes: string
  created_at: string
}
type LinkRow = { outfit_id: string; item_id: string }

const outfitColumns = 'id,photo_path,worn_on,caption,created_at'
const itemColumns = 'id,category,name,color_hex,color_name,cutout_path,notes,created_at'

const fromOutfit = (r: OutfitRow): Outfit => ({ id: r.id, photoPath: r.photo_path, wornOn: r.worn_on, caption: r.caption, createdAt: r.created_at })
const fromItem = (r: ItemRow): Item => ({
  id: r.id,
  category: r.category,
  name: r.name,
  colorHex: r.color_hex,
  colorName: r.color_name,
  cutoutPath: r.cutout_path,
  notes: r.notes,
  createdAt: r.created_at,
})
const fromLink = (r: LinkRow): OutfitItem => ({ outfitId: r.outfit_id, itemId: r.item_id })

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message)
}

// Supabase returns at most 1000 rows per request by default, so read whole tables page by page.
const PAGE_SIZE = 1000

/**
 * Every row of a table, newest first by `newestFirst`. `unique` lists columns that together identify a row:
 * they break ties (many outfits share a day), so pages don't overlap or skip rows.
 */
async function selectAll<Row>(client: SupabaseClient, table: string, columns: string, newestFirst: string, unique: string[]): Promise<Row[]> {
  const rows: Row[] = []
  for (;;) {
    let query = client.from(table).select(columns, { count: 'exact' }).order(newestFirst, { ascending: false })
    for (const column of unique) query = query.order(column)
    const { data, error, count } = await query.range(rows.length, rows.length + PAGE_SIZE - 1)
    fail(error)
    rows.push(...((data ?? []) as unknown as Row[]))
    // Stop on the total, not on a short page: the project's "Max rows" setting can make every page shorter than PAGE_SIZE.
    if (!data || data.length === 0 || rows.length >= (count ?? 0)) return rows
  }
}

export function supabaseStore(client: SupabaseClient): ClosetStore {
  const userId = async () => {
    const { data } = await client.auth.getSession()
    if (!data.session) throw new Error('Please sign in again.')
    return data.session.user.id
  }

  const upload = async (path: string, blob: Blob) => {
    const { error } = await client.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false })
    fail(error)
  }

  return {
    async load() {
      const [outfits, items, links] = await Promise.all([
        selectAll<OutfitRow>(client, 'outfits', outfitColumns, 'worn_on', ['id']),
        selectAll<ItemRow>(client, 'items', itemColumns, 'created_at', ['id']),
        selectAll<LinkRow>(client, 'outfit_items', 'outfit_id,item_id', 'outfit_id', ['item_id']),
      ])
      return { outfits: outfits.map(fromOutfit), items: items.map(fromItem), links: links.map(fromLink) }
    },

    async imageUrls(paths) {
      const urls = new Map<string, string>()
      for (let i = 0; i < paths.length; i += 100) {
        const { data, error } = await client.storage.from(BUCKET).createSignedUrls(paths.slice(i, i + 100), URL_LIFETIME)
        fail(error)
        for (const entry of data ?? []) if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl)
      }
      return urls
    },

    async saveOutfit(input) {
      const uid = await userId()
      const outfitId = newId()
      const photoPath = `${uid}/outfits/${outfitId}.jpg`
      const uploaded: string[] = []
      let insertedItemIds: string[] = []
      try {
        await upload(photoPath, input.photo)
        uploaded.push(photoPath)

        const itemRows = []
        for (const item of input.newItems) {
          const id = newId()
          let cutoutPath: string | null = null
          if (item.cutout) {
            cutoutPath = `${uid}/items/${id}.png`
            await upload(cutoutPath, item.cutout)
            uploaded.push(cutoutPath)
          }
          itemRows.push({ id, category: item.category, name: item.name, color_hex: item.colorHex, color_name: item.colorName, cutout_path: cutoutPath })
        }

        const outfit = await client
          .from('outfits')
          .insert({ id: outfitId, photo_path: photoPath, worn_on: input.wornOn, caption: input.caption })
          .select(outfitColumns)
          .single()
        fail(outfit.error)

        let items: Item[] = []
        if (itemRows.length) {
          const inserted = await client.from('items').insert(itemRows).select(itemColumns)
          fail(inserted.error)
          items = (inserted.data as unknown as ItemRow[]).map(fromItem)
          insertedItemIds = items.map((i) => i.id)
        }

        const linkRows = [...items.map((i) => i.id), ...input.existingItemIds].map((itemId) => ({ outfit_id: outfitId, item_id: itemId }))
        if (linkRows.length) fail((await client.from('outfit_items').insert(linkRows)).error)

        return { outfit: fromOutfit(outfit.data as unknown as OutfitRow), items, links: linkRows.map(fromLink) }
      } catch (error) {
        // Don't leave orphaned photos behind if saving fails partway. Deleting the outfit cascades to its links.
        await client.from('outfits').delete().eq('id', outfitId)
        if (insertedItemIds.length) await client.from('items').delete().in('id', insertedItemIds)
        if (uploaded.length) await client.storage.from(BUCKET).remove(uploaded)
        throw error
      }
    },

    async updateOutfit(id, patch) {
      const { data, error } = await client.from('outfits').update({ worn_on: patch.wornOn, caption: patch.caption }).eq('id', id).select(outfitColumns).single()
      fail(error)
      return fromOutfit(data as unknown as OutfitRow)
    },

    async deleteOutfit(outfit) {
      fail((await client.from('outfits').delete().eq('id', outfit.id)).error)
      await client.storage.from(BUCKET).remove([outfit.photoPath])
    },

    async updateItem(id, patch) {
      const { data, error } = await client.from('items').update({ category: patch.category, name: patch.name, notes: patch.notes }).eq('id', id).select(itemColumns).single()
      fail(error)
      return fromItem(data as unknown as ItemRow)
    },

    async deleteItem(item) {
      fail((await client.from('items').delete().eq('id', item.id)).error)
      if (item.cutoutPath) await client.storage.from(BUCKET).remove([item.cutoutPath])
    },
  }
}
