// Small charts, drawn with HTML and SVG. Marks are thin, labels stay in text colors, and every
// mark has a hover or focus readout.
import { useState } from 'react'
import type { Mover, Spot, Tally } from '../types'
import { dateShort, moveText } from '../lib/format'
import { moveColor } from '../lib/lens'

/** Each list's rank for one player on a shared axis, best first. One hue: the lists are peers. */
export function SpotRows({ spots, avg, max }: { spots: Spot[]; avg: number; max: number }) {
  const scale = Math.max(max, ...spots.map((s) => s.rank), 10)
  const x = (r: number) => `${((r - 1) / (scale - 1)) * 100}%`
  const ticks = [1, Math.round(scale / 2), scale]
  return (
    <div className="spots" role="table" aria-label="Rank on each published list">
      <div className="spot-row head" role="row"><span /><span className="spot-axis">{ticks.map((t) => <em key={t} style={{ left: x(t) }}>{t}</em>)}</span><span /></div>
      {spots.map((s) => (
        <div className="spot-row" role="row" key={s.source} title={`${s.name}: No. ${s.rank}${s.team ? ` (to ${s.team})` : ''}${s.updated ? `, ${dateShort(s.updated)}` : ''}`}>
          <a className="spot-name" role="rowheader" href={s.url} target="_blank" rel="noreferrer">{s.name}<small>{s.kind === 'mock' ? 'mock draft' : 'big board'}{s.updated ? ` · ${dateShort(s.updated)}` : ''}</small></a>
          <span className="spot-track" role="cell">
            <i className="avg" style={{ left: x(Math.min(scale, avg)) }} />
            <i className="stem" style={{ width: x(s.rank) }} />
            <i className="dot" style={{ left: x(s.rank) }} />
          </span>
          <span className="spot-val mono" role="cell">{s.rank}{s.team ? <small>{s.team}</small> : null}</span>
        </div>
      ))}
      <div className="viz-legend spaced"><span><i className="dot" style={{ background: 'var(--viz-1)' }} />Rank on that list</span><span><i className="line" style={{ background: 'var(--text-2)' }} />Consensus average ({avg})</span></div>
    </div>
  )
}

/** Consensus rank week by week. Rank 1 is at the top, so the line rises when a player rises. */
export function TrendLine({ history, max }: { history: { week: string; date: string; rank: number }[]; max: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 440, H = 120, padL = 30, padR = 12, padT = 10, padB = 20
  const lo = Math.max(1, Math.min(...history.map((h) => h.rank)) - 3)
  const hi = Math.min(max, Math.max(...history.map((h) => h.rank)) + 3)
  const xs = (i: number) => padL + (history.length === 1 ? 0.5 : i / (history.length - 1)) * (W - padL - padR)
  const ys = (r: number) => padT + ((r - lo) / Math.max(1, hi - lo)) * (H - padT - padB)
  const path = history.map((h, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(h.rank).toFixed(1)}`).join(' ')
  const h = hover !== null ? history[hover] : null
  return (
    <div className="trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Consensus rank by week: ${history.map((x) => `${dateShort(x.date)} No. ${x.rank}`).join(', ')}`}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; let best = 0; history.forEach((_, i) => { if (Math.abs(xs(i) - px) < Math.abs(xs(best) - px)) best = i }); setHover(best) }}
        onPointerLeave={() => setHover(null)}>
        {[lo, hi].map((r) => <g key={r}><line x1={padL} x2={W - padR} y1={ys(r)} y2={ys(r)} stroke="var(--viz-grid)" /><text x={padL - 6} y={ys(r) + 3.5} textAnchor="end" className="tick">{r}</text></g>)}
        {h && <line x1={xs(hover!)} x2={xs(hover!)} y1={padT} y2={H - padB} stroke="var(--viz-axis)" />}
        <path d={path} fill="none" stroke="var(--viz-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {history.map((x, i) => <circle key={x.week} cx={xs(i)} cy={ys(x.rank)} r={i === hover || i === history.length - 1 ? 4.5 : 3} fill="var(--viz-1)" stroke="var(--viz-surface)" strokeWidth={2} />)}
        <text x={xs(0)} y={H - 5} textAnchor="start" className="tick">{dateShort(history[0].date)}</text>
        {history.length > 1 && <text x={xs(history.length - 1)} y={H - 5} textAnchor="end" className="tick">{dateShort(history[history.length - 1].date)}</text>}
        <text x={xs(history.length - 1) - 8} y={ys(history[history.length - 1].rank) - 9} textAnchor="end" className="val">No. {history[history.length - 1].rank}</text>
      </svg>
      {h && <div className="viz-tip" style={{ left: `${(xs(hover!) / W) * 100}%`, top: `${(ys(h.rank) / H) * 100}%` }}><b>Week of {dateShort(h.date)}</b><div className="row">Consensus<u>No. {h.rank}</u></div></div>}
    </div>
  )
}

/** Ranked horizontal bars in one hue, largest first. */
export function Bars({ items, unit, onPick }: { items: Tally[]; unit: string; onPick?: (name: string) => void }) {
  const max = Math.max(1, ...items.map((i) => i.count))
  return (
    <div className="hbars">
      {items.map((it) => (
        <button key={it.name} className="hbar" disabled={!onPick} onClick={() => onPick?.(it.name)} title={`${it.name}: ${it.count} ${unit}`}>
          <span className="hbar-label">{it.name}</span>
          <span className="hbar-track"><i style={{ width: `${(it.count / max) * 100}%` }} /></span>
          <span className="hbar-val mono">{it.count}</span>
        </button>
      ))}
    </div>
  )
}

/** Movers as bars growing from a center line: risers to the right, fallers to the left. */
export function MoveBars({ movers, onPick }: { movers: Mover[]; onPick: (slug: string) => void }) {
  const max = Math.max(1, ...movers.map((m) => Math.abs(m.move)))
  return (
    <div className="mbars">
      {movers.map((m) => (
        <button key={m.slug} className="mbar" onClick={() => onPick(m.slug)} title={`${m.name}: ${moveText(m.move)} to No. ${m.rank}`}>
          <span className="mbar-label"><b>{m.name}</b><small>{m.pos} · {m.school}</small></span>
          <span className="mbar-track">
            <i className="mid" />
            <i className="fill" style={m.move > 0 ? { left: '50%', width: `${(m.move / max) * 50}%`, background: moveColor(m.move), borderRadius: '0 4px 4px 0' } : { right: '50%', width: `${(-m.move / max) * 50}%`, background: moveColor(m.move), borderRadius: '4px 0 0 4px' }} />
          </span>
          <span className="mbar-val mono">{moveText(m.move)}<small>No. {m.rank}</small></span>
        </button>
      ))}
    </div>
  )
}
