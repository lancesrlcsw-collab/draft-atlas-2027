import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, type Focus, type Panel } from '../store'
import { LENSES, lensById, lensContext, lensText, moveColor, trendOf } from '../lib/lens'
import type { Arrangement } from '../lib/layout'
import { SITE_MARK, classShort, height, moveText, timeAgo } from '../lib/format'
import { IconCalendar, IconField, IconInfo, IconNews, IconPulse, IconSearch } from './icons'

export function Brand() {
  const [a, b] = SITE_MARK
  const draft = useStore((s) => s.draft)
  return (
    <button className="brand" onClick={() => { const s = useStore.getState(); s.openPanel(null, false); s.select(null); s.setFocus('all') }} aria-label="Back to the full class">
      <span className="mark full">{a} <span>{b}</span></span>
      <span className="mark short" aria-hidden="true">{a.split(' ').map((w) => w[0]).join('')}<span>{b[0]}</span></span>
      <span className="sub">{draft?.draftYear} draft class · unofficial</span>
    </button>
  )
}

export function TopBar() {
  const draft = useStore((s) => s.draft)!
  const board = useStore((s) => s.board)
  const openPanel = useStore((s) => s.openPanel)
  const select = useStore((s) => s.select)
  const setSearch = useStore((s) => s.setSearch)
  const top = board[0]
  const first = draft.order.picks[0]
  const club = first ? draft.nflTeams[first.team] : null
  const counted = draft.sources.filter((s) => s.counted).length
  return (
    <header className="topbar">
      <Brand />
      <div className="scorebug glass">
        {top && (
          <button className="cell" onClick={() => select(top.slug)} title="Open the consensus No. 1 player">
            <span className="k">Consensus No. 1</span>
            <span className="v">{top.name}<span className="long faint"> · {top.pos}, {top.school?.name}</span></span>
          </button>
        )}
        {club && (
          <button className="cell wide" onClick={() => openPanel('order')} title="The pick order if the season ended today">
            <span className="k">On the clock today</span>
            <span className="v">{club.nickname} <span className="faint">· {club.record}</span></span>
          </button>
        )}
        <button className="cell" onClick={() => openPanel('about')} title="Sources and method">
          <span className="k">{counted} lists<span className="long"> counted</span></span>
          <span className="v"><span className="long">Updated </span>{timeAgo(draft.generatedAt)}</span>
        </button>
      </div>
      <div className="top-actions">
        <button className="btn primary" onClick={() => setSearch(true)} aria-label="Search players"><IconSearch /><span className="txt">Find a player</span><kbd>/</kbd></button>
      </div>
    </header>
  )
}

const RAIL: { id: Panel | null; label: string; icon: typeof IconField }[] = [
  { id: null, label: 'Stage', icon: IconField },
  { id: 'order', label: 'Picks', icon: IconCalendar },
  { id: 'tracker', label: 'Board', icon: IconPulse },
  { id: 'news', label: 'News', icon: IconNews },
  { id: 'about', label: 'About', icon: IconInfo },
]

export function Rail() {
  const panel = useStore((s) => s.panel)
  const openPanel = useStore((s) => s.openPanel)
  const select = useStore((s) => s.select)
  return (
    <nav className="rail glass" aria-label="Sections">
      {RAIL.map((r) => (
        <button key={r.label} className={panel === r.id ? 'on' : ''} onClick={() => { if (r.id === null) { openPanel(null, false); select(null) } else openPanel(r.id) }}>
          <r.icon />
          {r.label}
        </button>
      ))}
    </nav>
  )
}

const FOCI: { id: Focus; label: string }[] = [{ id: 'all', label: 'Everyone' }, { id: 'round1', label: 'Round 1' }, { id: 'round2', label: 'Round 2' }, { id: 'watch', label: '65–150' }]
const SETS: { id: Arrangement; label: string }[] = [{ id: 'stage', label: 'Draft stage' }, { id: 'field', label: 'By position' }]

export function Dock() {
  const lens = useStore((s) => s.lens)
  const focus = useStore((s) => s.focus)
  const arrangement = useStore((s) => s.arrangement)
  const selected = useStore((s) => s.selected)
  const panel = useStore((s) => s.panel)
  const setLens = useStore((s) => s.setLens)
  const setFocus = useStore((s) => s.setFocus)
  const setArrangement = useStore((s) => s.setArrangement)
  return (
    <div className={`dock glass${selected ? ' shifted' : ''}${panel ? ' hidden' : ''}`}>
      <span className="label">Scene</span>
      <div className="seg" role="tablist" aria-label="Arrangement">
        {SETS.map((a) => <button key={a.id} role="tab" aria-selected={arrangement === a.id} className={arrangement === a.id ? 'on' : ''} onClick={() => setArrangement(a.id)}>{a.label}</button>)}
      </div>
      <span className="divider" />
      <span className="label">Lens</span>
      <div className="seg" role="tablist" aria-label="Data lens">
        {LENSES.map((l) => <button key={l.id} role="tab" aria-selected={lens === l.id} className={lens === l.id ? 'on' : ''} onClick={() => setLens(l.id)}>{l.name}</button>)}
      </div>
      {!selected && (
        <>
          <span className="divider" />
          <span className="label">Show</span>
          <div className="seg">
            {FOCI.map((f) => <button key={f.id} className={focus === f.id ? 'on' : ''} onClick={() => setFocus(f.id)}>{f.label}</button>)}
          </div>
        </>
      )}
    </div>
  )
}

export function Legend() {
  const lens = lensById(useStore((s) => s.lens))
  const panel = useStore((s) => s.panel)
  const selected = useStore((s) => s.selected)
  const board = useStore((s) => s.board)
  const draft = useStore((s) => s.draft)
  const ctx = useMemo(() => lensContext(board, draft?.movement), [board, draft])
  const note = lensText(lens.note, ctx)
  return (
    <aside className={`legend glass${panel || selected ? ' hidden' : ''}`}>
      <h3>{lens.name}</h3>
      <p>{lensText(lens.blurb, ctx)}</p>
      <ul>{lens.legend.map((l) => <li key={l.label}><i style={{ background: l.color }} />{l.label}</li>)}</ul>
      {note && <div className="note">{note}</div>}
    </aside>
  )
}

export function HoverCard() {
  const hovered = useStore((s) => s.hovered)
  const board = useStore((s) => s.board)
  const draft = useStore((s) => s.draft)
  const lensId = useStore((s) => s.lens)
  const selected = useStore((s) => s.selected)
  const ref = useRef<HTMLDivElement>(null)
  const pos = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const move = (e: PointerEvent) => {
      pos.current = { x: e.clientX, y: e.clientY }
      const el = ref.current
      if (!el) return
      const w = el.offsetWidth, h = el.offsetHeight
      const x = Math.min(window.innerWidth - w - 12, e.clientX + 18)
      const y = Math.min(window.innerHeight - h - 12, Math.max(12, e.clientY - h - 14))
      el.style.transform = `translate(${x}px, ${y}px)`
    }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [])
  const p = useMemo(() => board.find((x) => x.id === hovered), [board, hovered])
  const ctx = useMemo(() => lensContext(board, draft?.movement), [board, draft])
  if (!p || !draft || p.slug === selected) return <div ref={ref} className="hovercard" style={{ opacity: 0 }} />
  const lens = lensById(lensId)
  const v = lens.value(p, ctx)
  const club = p.pick ? draft.nflTeams[p.pick.team] : null
  const t = trendOf(p)
  return (
    <div ref={ref} className="hovercard glass" style={{ left: 0, top: 0, transform: `translate(${pos.current.x + 18}px, ${Math.max(12, pos.current.y - 150)}px)` }}>
      <div className="row1">
        <span className="no">{p.rank}</span>
        <span className="nm">{p.name}</span>
      </div>
      <div className="meta">
        {p.pos} · {p.school?.name ?? 'School not listed'}{p.cls ? ` · ${classShort(p.cls)}` : ''}{p.height ? ` · ${height(p.height)}, ${p.weight} lb` : ''}
      </div>
      {p.line && p.line.length > 0 && (
        <div className="stats">{p.line.map((l) => <div key={l.label}><b>{l.value}</b><span>{l.label}</span></div>)}</div>
      )}
      {club && p.pick && <div className="lensline"><i style={{ background: club.color, outline: '1px solid rgba(255,255,255,.45)' }} />Slotted at pick {p.pick.pick} · {club.name}</div>}
      {lens.id !== 'projection' && lens.id !== 'movement' && <div className="lensline"><i style={{ background: v.color }} />{lens.name}: {v.tag ?? 'no figure'}</div>}
      {t !== null && t !== 0 && <div className="lensline"><i style={{ background: moveColor(t) }} />{moveText(t)} {p.trend?.basis === 'drafttek' ? 'on Drafttek’s board' : 'since last week'}</div>}
      <div className="hint">Click for the full player file</div>
    </div>
  )
}

export function Search() {
  const open = useStore((s) => s.searchOpen)
  const setSearch = useStore((s) => s.setSearch)
  const board = useStore((s) => s.board)
  const draft = useStore((s) => s.draft)
  const select = useStore((s) => s.select)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => input.current?.focus(), 30) } }, [open])
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return board.slice(0, 40)
    const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '')
    const n = norm(s)
    return board.filter((p) => {
      const club = p.pick ? draft?.nflTeams[p.pick.team] : null
      return norm(p.name).includes(n) || String(p.rank) === s || p.pos.toLowerCase() === s || (p.position || '').toLowerCase() === s
        || norm(p.school?.name || '').includes(n) || (p.school?.abbr || '').toLowerCase() === s || norm(p.school?.conference || '') === n
        || (club ? norm(club.name).includes(n) || club.abbr.toLowerCase() === s : false) || classShort(p.cls).toLowerCase() === s
    }).slice(0, 60)
  }, [board, draft, q])
  if (!open) return null
  return (
    <div className="scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) setSearch(false) }}>
      <div className="search glass" role="dialog" aria-label="Find a player">
        <input
          ref={input} value={q} placeholder="Name, school, position, rank or NFL club" aria-label="Search players"
          onChange={(e) => { setQ(e.target.value); setIdx(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)) }
            else if (e.key === 'Enter' && results[idx]) select(results[idx].slug)
            else if (e.key === 'Escape') setSearch(false)
          }}
        />
        <div className="results scroll">
          {results.length === 0 && <div className="empty">No one on the board matches “{q}”.</div>}
          {results.map((p, i) => (
            <button key={p.id} className={`result${i === idx ? ' on' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => select(p.slug)}>
              <span className="no">{p.rank}</span>
              <span><div className="nm">{p.name}</div><div className="sm">{p.pos} · {p.school?.name}{p.cls ? ` · ${p.cls}` : ''}{p.pick ? ` · pick ${p.pick.pick} (${p.pick.team})` : ''}</div></span>
              <span className="sm">{p.line?.map((l) => `${l.value} ${l.label}`).slice(0, 2).join(' · ')}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
