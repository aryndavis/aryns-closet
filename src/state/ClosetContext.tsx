import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { demoStore } from '../lib/demoStore'
import { supabase, supabaseStore } from '../lib/supabaseStore'
import type { ClosetData, Item, ItemPatch, Outfit, OutfitItem, OutfitPatch, SaveOutfitInput } from '../lib/types'

// 'signed-out' only happens when the public view isn't set up (supabase/public-view.sql not run yet):
// then the app falls back to asking for a login before showing anything.
type Status = 'loading' | 'signed-out' | 'ready' | 'error'

interface ClosetValue {
  mode: 'cloud' | 'demo'
  status: Status
  /** True when the owner is signed in (or in demo mode). Visitors can only look. */
  canEdit: boolean
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
  // Bumped on every load, so a slow response (or a save that finishes after sign-out) can't land in the wrong view.
  const loadRun = useRef(0)
  // Who the loaded closet belongs to (null = signed out), so token refreshes for the same user are ignored.
  const currentUser = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      currentUser.current ??= data.session?.user.id ?? null
      setSession(data.session)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      const nextUser = next?.user.id ?? null
      if (currentUser.current !== undefined && nextUser !== currentUser.current) {
        // Signed in, out, or as someone else: show the loading screen, and clear right away so nothing
        // from the previous view stays on screen.
        loadRun.current++
        setOutfits([])
        setItems([])
        setLinks([])
        setUrls(new Map())
        setError(null)
        setStatus('loading')
      }
      currentUser.current = nextUser
      setSession(next)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  const checkingLogin = session === undefined
  const signedIn = mode === 'demo' || Boolean(userId)

  // Fetches the closet. Whatever starts a load (signing in or out, or Try again) shows the loading screen;
  // this only fills in the result.
  const fetchCloset = useCallback((asVisitor: boolean) => {
    const run = ++loadRun.current
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
      if (asVisitor) {
        // The public view isn't set up yet, so ask for a login like before.
        setOutfits([])
        setItems([])
        setLinks([])
        setUrls(new Map())
        return setStatus('signed-out')
      }
      setError(e.message)
      setStatus('error')
    })
  }, [store])

  useEffect(() => {
    if (checkingLogin) return
    // Signed out: show the public, read-only closet.
    fetchCloset(!signedIn)
    // Keyed on the user id, so token refreshes don't trigger a reload.
  }, [checkingLogin, signedIn, userId, fetchCloset])

  // Runs a change, then applies its result only if the view hasn't changed meanwhile (for example, a sign-out).
  const commit = async <T,>(change: Promise<T>, apply: (result: T) => void) => {
    const run = loadRun.current
    const result = await change
    if (run === loadRun.current) apply(result)
    return result
  }

  const value: ClosetValue = {
    mode,
    status,
    canEdit: signedIn,
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
    reload: () => {
      setError(null)
      setStatus('loading')
      fetchCloset(!signedIn)
    },
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
      const saving = (async () => {
        const saved = await store.saveOutfit(input)
        return { saved, signed: await store.imageUrls(paths({ outfits: [saved.outfit], items: saved.items })) }
      })()
      const { saved } = await commit(saving, ({ saved, signed }) => {
        setUrls((current) => new Map([...current, ...signed]))
        setOutfits((list) => [saved.outfit, ...list])
        setItems((list) => [...saved.items, ...list])
        setLinks((list) => [...list, ...saved.links])
      })
      return saved.outfit
    },
    async updateOutfit(id, patch) {
      await commit(store.updateOutfit(id, patch), (outfit) => setOutfits((list) => list.map((o) => (o.id === id ? outfit : o))))
    },
    async deleteOutfit(outfit) {
      await commit(store.deleteOutfit(outfit), () => {
        setOutfits((list) => list.filter((o) => o.id !== outfit.id))
        setLinks((list) => list.filter((l) => l.outfitId !== outfit.id))
      })
    },
    async updateItem(id, patch) {
      await commit(store.updateItem(id, patch), (item) => setItems((list) => list.map((i) => (i.id === id ? item : i))))
    },
    async deleteItem(item) {
      await commit(store.deleteItem(item), () => {
        setItems((list) => list.filter((i) => i.id !== item.id))
        setLinks((list) => list.filter((l) => l.itemId !== item.id))
      })
    },
  }

  return <ClosetContext.Provider value={value}>{children}</ClosetContext.Provider>
}

export function useCloset() {
  const value = useContext(ClosetContext)
  if (!value) throw new Error('useCloset must be used inside ClosetProvider')
  return value
}
