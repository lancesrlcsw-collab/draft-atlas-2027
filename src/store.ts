import { create } from 'zustand'
import type { BoardPlayer, Dossier, DraftData } from './types'
import type { LensId } from './lib/lens'
import type { Arrangement } from './lib/layout'

export type Focus = 'all' | 'round1' | 'round2' | 'watch'
export type Panel = 'order' | 'tracker' | 'news' | 'about'
export type DossierTab = 'overview' | 'stats' | 'games' | 'rankings' | 'story' | 'news'

interface State {
  status: 'loading' | 'ready' | 'error'
  error?: string
  draft: DraftData | null
  board: BoardPlayer[]
  bySlug: Map<string, BoardPlayer>
  dossiers: Record<string, Dossier | 'loading' | 'error'>

  selected: string | null // slug
  hovered: string | null // id
  lens: LensId
  focus: Focus
  arrangement: Arrangement
  panel: Panel | null
  tab: DossierTab
  searchOpen: boolean
  introDone: boolean
  touring: boolean

  load: () => Promise<void>
  select: (slug: string | null, opts?: { tab?: DossierTab; push?: boolean }) => void
  hover: (id: string | null) => void
  setLens: (lens: LensId) => void
  setFocus: (focus: Focus) => void
  setArrangement: (a: Arrangement) => void
  openPanel: (panel: Panel | null, push?: boolean) => void
  setTab: (tab: DossierTab) => void
  setSearch: (open: boolean) => void
  finishIntro: () => void
  setTouring: (on: boolean) => void
  step: (dir: 1 | -1) => void
}

const PANELS: Panel[] = ['order', 'tracker', 'news', 'about']

/** Hosted as a Claude artifact the page cannot own URL paths, so views are named in the hash instead. */
export const HASH_ROUTING = import.meta.env.VITE_TARGET === 'artifact'
const DATA = `${import.meta.env.BASE_URL}data/`

function parseLocation(): { selected: string | null; panel: Panel | null } {
  if (HASH_ROUTING) {
    const h = window.location.hash.replace(/^#/, '')
    if (h.startsWith('p-')) return { selected: h.slice(2), panel: null }
    if (h.startsWith('b-') && PANELS.includes(h.slice(2) as Panel)) return { selected: null, panel: h.slice(2) as Panel }
    return { selected: null, panel: null }
  }
  const parts = window.location.pathname.split('/').filter(Boolean)
  if (parts[0] === 'player' && parts[1]) return { selected: decodeURIComponent(parts[1]), panel: null }
  if (parts[0] === 'board' && PANELS.includes(parts[1] as Panel)) return { selected: null, panel: parts[1] as Panel }
  return { selected: null, panel: null }
}

function pushUrl(path: string) {
  if (HASH_ROUTING) {
    const parts = path.split('/').filter(Boolean)
    const hash = parts[0] === 'player' ? `p-${parts[1]}` : parts[0] === 'board' ? `b-${parts[1]}` : ''
    if (window.location.hash.replace(/^#/, '') !== hash) {
      try { window.location.hash = hash } catch { /* some hosts lock the hash */ }
    }
    return
  }
  if (window.location.pathname !== path) window.history.pushState({}, '', path)
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res.json()
}

export const useStore = create<State>((set, get) => ({
  status: 'loading',
  draft: null,
  board: [],
  bySlug: new Map(),
  dossiers: {},
  selected: null,
  hovered: null,
  lens: 'projection',
  focus: 'all',
  arrangement: 'stage',
  panel: null,
  tab: 'overview',
  searchOpen: false,
  introDone: false,
  touring: false,

  async load() {
    try {
      const [draft, board] = await Promise.all([fetchJson<DraftData>(`${DATA}draft.json`), fetchJson<BoardPlayer[]>(`${DATA}board.json`)])
      const bySlug = new Map(board.map((p) => [p.slug, p]))
      const loc = parseLocation()
      set({ status: 'ready', draft, board, bySlug, panel: loc.panel })
      if (loc.selected && bySlug.has(loc.selected)) get().select(loc.selected, { push: false })
      window.addEventListener(HASH_ROUTING ? 'hashchange' : 'popstate', () => {
        const l = parseLocation()
        if (l.selected && get().bySlug.has(l.selected)) { if (get().selected !== l.selected) get().select(l.selected, { push: false }) }
        else { if (get().selected) get().select(null, { push: false }); if (get().panel !== l.panel) get().openPanel(l.panel, false) }
      })
    } catch (err) {
      set({ status: 'error', error: String((err as Error).message || err) })
    }
  },

  select(slug, opts = {}) {
    const { dossiers } = get()
    if (!slug) {
      set({ selected: null })
      if (opts.push !== false) pushUrl(get().panel ? `/board/${get().panel}` : '/')
      return
    }
    set({ selected: slug, panel: null, tab: opts.tab || (get().selected ? get().tab : 'overview'), searchOpen: false, touring: false })
    if (opts.push !== false) pushUrl(`/player/${slug}`)
    if (!dossiers[slug]) {
      set({ dossiers: { ...dossiers, [slug]: 'loading' } })
      fetchJson<Dossier>(`${DATA}players/${slug}.json`)
        .then((d) => set((s) => ({ dossiers: { ...s.dossiers, [slug]: d } })))
        .catch(() => set((s) => ({ dossiers: { ...s.dossiers, [slug]: 'error' } })))
    }
  },

  hover: (id) => { if (get().hovered !== id) set({ hovered: id }) },
  setLens: (lens) => set({ lens }),
  setFocus: (focus) => set({ focus, touring: false }),
  setArrangement: (arrangement) => set({ arrangement, touring: false }),
  openPanel(panel, push = true) {
    set({ panel, selected: panel ? null : get().selected, searchOpen: false })
    if (push) pushUrl(panel ? `/board/${panel}` : get().selected ? `/player/${get().selected}` : '/')
  },
  setTab: (tab) => set({ tab }),
  setSearch: (searchOpen) => set({ searchOpen }),
  finishIntro: () => set({ introDone: true }),
  setTouring: (touring) => set({ touring }),

  /** Arrow keys walk the board in consensus order. */
  step(dir) {
    const { board, selected } = get()
    if (!board.length) return
    const i = board.findIndex((p) => p.slug === selected)
    const next = board[(i + dir + board.length) % board.length]
    get().select(next.slug)
  },
}))
