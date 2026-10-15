import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { demoStore } from '../lib/demoStore'
import { supabase, supabaseStore } from '../lib/supabaseStore'
import type { ClosetData, Item, ItemPatch, Outfit, OutfitItem, OutfitPatch, SaveOutfitInput } from '../lib/types'

type Status = 'loading' | 'signed-out' | 'ready' | 'error'

interface ClosetValue {
  mode: 'cloud' | 'demo'
  status: Status
  error: string | null
  userEmail: string | null
  outfits: Outfit[]
  items: Item[]
  links: OutfitItem[]
  /** Viewable URL for a stored image path (signed URL or blob URL). */
  imageUrl: (path: string | null) => string | undefined
  itemsInOutfit: (outfitId: string) => Item[]
  outfitsWithItem: (itemId: string) => Outfit[]
  reload: () => void
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  saveOutfit: (input: SaveOutfitInput) => Promise<Outfit>
  updateOutfit: (id: string, patch: OutfitPatch) => Promise<void>
  deleteOutfit: (outfit: Outfit) => Promise<void>
  updateItem: (id: string, patch: ItemPatch) => Promise<void>
  deleteItem: (item: Item) => Promise<void>
}

const ClosetContext = createContext<ClosetValue | null>(null)

const paths = (data: Pick<ClosetData, 'outfits' | 'items'>) => [...data.outfits.map((o) => o.photoPath), ...data.items.flatMap((i) => (i.cutoutPath ? [i.cutoutPath] : []))]

export function ClosetProvider({ children }: { children: ReactNode }) {
  const mode = supabase ? 'cloud' : 'demo'
  const store = useMemo(() => (supabase ? supabaseStore(supabase) : demoStore()), [])
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [links, setLinks] = useState<OutfitItem[]>([])
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const loadRun = useRef(0)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  const checkingLogin = session === undefined
  const signedIn = mode === 'demo' || Boolean(userId)

  const load = useCallback(() => {
    const run = ++loadRun.current
    setStatus('loading')
    setError(null)
    ;(async () => {
      const data = await store.load()
      const signed = await store.imageUrls(paths(data))
      if (run !== loadRun.current) return
      setOutfits(data.outfits)
      setItems(data.items)
      setLinks(data.links)
      setUrls(signed)
      setStatus('ready')
    })().catch((e: Error) => {
      if (run !== loadRun.current) return
      setError(e.message)
      setStatus('error')
    })
  }, [store])

  useEffect(() => {
    if (checkingLogin) return
    if (!signedIn) {
      loadRun.current++
      setOutfits([])
      setItems([])
      setLinks([])
      setUrls(new Map())
      setStatus('signed-out')
      return
    }
    load()
  }, [checkingLogin, signedIn, userId, load])

  const addUrls = async (newPaths: string[]) => {
    const signed = await store.imageUrls(newPaths)
    setUrls((current) => new Map([...current, ...signed]))
  }

  const value: ClosetValue = {
    mode,
    status,
    error,
    userEmail: session?.user.email ?? null,
    outfits,
    items,
    links,
    imageUrl: (path) => (path ? urls.get(path) : undefined),
    itemsInOutfit: (outfitId) => {
      const ids = new Set(links.filter((l) => l.outfitId === outfitId).map((l) => l.itemId))
      return items.filter((i) => ids.has(i.id))
    },
    outfitsWithItem: (itemId) => {
      const ids = new Set(links.filter((l) => l.itemId === itemId).map((l) => l.outfitId))
      return outfits.filter((o) => ids.has(o.id))
    },
    reload: load,
    async signIn(email, password) {
      if (!supabase) return
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) throw new Error(authError.message === 'Invalid login credentials' ? 'That email and password don’t match.' : authError.message)
    },
    async signOut() {
      if (!supabase) return
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) await supabase.auth.signOut({ scope: 'local' })
    },
    async saveOutfit(input) {
      const saved = await store.saveOutfit(input)
      await addUrls(paths({ outfits: [saved.outfit], items: saved.items }))
      setOutfits((list) => [saved.outfit, ...list])
      setItems((list) => [...saved.items, ...list])
      setLinks((list) => [...list, ...saved.links])
      return saved.outfit
    },
    async updateOutfit(id, patch) {
      const outfit = await store.updateOutfit(id, patch)
      setOutfits((list) => list.map((o) => (o.id === id ? outfit : o)))
    },
    async deleteOutfit(outfit) {
      await store.deleteOutfit(outfit)
      setOutfits((list) => list.filter((o) => o.id !== outfit.id))
      setLinks((list) => list.filter((l) => l.outfitId !== outfit.id))
    },
    async updateItem(id, patch) {
      const item = await store.updateItem(id, patch)
      setItems((list) => list.map((i) => (i.id === id ? item : i)))
    },
    async deleteItem(item) {
      await store.deleteItem(item)
      setItems((list) => list.filter((i) => i.id !== item.id))
      setLinks((list) => list.filter((l) => l.itemId !== item.id))
    },
  }

  return <ClosetContext.Provider value={value}>{children}</ClosetContext.Provider>
}

export function useCloset() {
  const value = useContext(ClosetContext)
  if (!value) throw new Error('useCloset must be used inside ClosetProvider')
  return value
}
