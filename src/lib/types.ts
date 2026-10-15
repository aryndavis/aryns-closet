export const CATEGORIES = ['top', 'jacket', 'bottom', 'dress', 'shoes', 'accessory'] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_LABELS: Record<Category, string> = {
  top: 'Tops',
  jacket: 'Jackets',
  bottom: 'Bottoms',
  dress: 'Dresses',
  shoes: 'Shoes',
  accessory: 'Accessories',
}

/** One of a category, for labels like "What is it? Jacket". */
export const CATEGORY_NAMES: Record<Category, string> = {
  top: 'Top',
  jacket: 'Jacket',
  bottom: 'Bottom',
  dress: 'Dress',
  shoes: 'Shoes',
  accessory: 'Accessory',
}

/** A photo in the lookbook. */
export interface Outfit {
  id: string
  photoPath: string
  /** ISO date (YYYY-MM-DD) the outfit was worn. */
  wornOn: string
  caption: string
  createdAt: string
}

/** A single piece of clothing in the closet, shown as a cut-out sticker. */
export interface Item {
  id: string
  category: Category
  name: string
  colorHex: string | null
  colorName: string
  cutoutPath: string | null
  notes: string
  createdAt: string
}

/** Which items appear in which outfit photo. */
export interface OutfitItem {
  outfitId: string
  itemId: string
}

export interface NewItemInput {
  category: Category
  name: string
  colorHex: string | null
  colorName: string
  cutout: Blob | null
}

export interface SaveOutfitInput {
  photo: Blob
  wornOn: string
  caption: string
  newItems: NewItemInput[]
  /** Items already in the closet that also appear in this photo. */
  existingItemIds: string[]
}

export type ItemPatch = Pick<Item, 'category' | 'name' | 'notes'>
export type OutfitPatch = Pick<Outfit, 'wornOn' | 'caption'>

export interface ClosetData {
  outfits: Outfit[]
  items: Item[]
  links: OutfitItem[]
}

/** Where the closet lives: Supabase in real use, or this browser (IndexedDB) in demo mode. */
export interface ClosetStore {
  load(): Promise<ClosetData>
  /** Viewable URLs for stored images, keyed by storage path. */
  imageUrls(paths: string[]): Promise<Map<string, string>>
  saveOutfit(input: SaveOutfitInput): Promise<{ outfit: Outfit; items: Item[]; links: OutfitItem[] }>
  updateOutfit(id: string, patch: OutfitPatch): Promise<Outfit>
  deleteOutfit(outfit: Outfit): Promise<void>
  updateItem(id: string, patch: ItemPatch): Promise<Item>
  deleteItem(item: Item): Promise<void>
}
