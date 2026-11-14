// Data lenses: each one re-colours the class and raises every player on a column whose
// height encodes one number, so the whole board can be read at a glance.
import type { BoardPlayer } from '../types'
import { classShort } from './format'
import { zoneOf } from './layout'

export type LensId = 'projection' | 'consensus' | 'movement' | 'spread' | 'class' | 'recruiting'

export interface LensValue {
  color: string
  /** Column height, 0..1 of the lens maximum. */
  height: number
  /** Short value tag shown above the player, or null when the lens has nothing to say. */
  tag: string | null
  /** True when the player has no value for this lens (drawn dimmed). */
  empty?: boolean
}

export interface LensContext { boardSize: number; maxSpread: number; maxMove: number; movementBasis: 'consensus' | 'drafttek'; movementSince?: string }

export interface Lens {
  id: LensId
  name: string
  blurb: string | ((ctx: LensContext) => string)
  /** World-unit height of a full column. */
  maxHeight: number
  legend: { color: string; label: string }[]
  note?: string | ((ctx: LensContext) => string | undefined)
  value(p: BoardPlayer, ctx: LensContext): LensValue
}

export const ZONE_COLOR = { round1: '#5fe3b1', round2: '#dfe9f1', watch: '#6f93b8' } as const
const EMPTY = '#3a4a5a'

function ramp(stops: [number, string][], t: number): string {
  const x = Math.max(0, Math.min(1, t))
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i]
      const k = (x - t0) / (t1 - t0 || 1)
      const a = parseInt(c0.slice(1), 16), b = parseInt(c1.slice(1), 16)
      const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * k)
      return `#${((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1)}`
    }
  }
  return stops[stops.length - 1][1]
}

// One-hue ramps (validated light-to-dark steps): the lighter end is always the larger value.
const BLUE: [number, string][] = [[0, '#184f95'], [0.5, '#3987e5'], [1, '#cde2fb']]
const GOLD: [number, string][] = [[0, '#7a5a1c'], [0.4, '#d99a2b'], [1, '#ffe08a']]
export const ORDINAL_BLUE = ['#1c5cab', '#3987e5', '#86b6ef', '#cde2fb']

// Movement is a polarity around "no change": two opposite hues with a neutral grey between.
export const MOVE_BANDS = [
  { min: 6, color: '#4f97ea', label: 'Rising six spots or more' },
  { min: 1, color: '#2f6fb8', label: 'Rising' },
  { min: 0, color: '#5b6878', label: 'Holding' },
  { min: -5, color: '#a8573f', label: 'Falling' },
  { min: -Infinity, color: '#e8684a', label: 'Falling six spots or more' },
]
export const moveColor = (v?: number | null) => (v === null || v === undefined ? EMPTY : MOVE_BANDS.find((b) => v >= b.min)!.color)

export const trendOf = (p: BoardPlayer): number | null => (p.trend && p.trend.basis !== 'new' ? p.trend.value ?? 0 : null)

export const LENSES: Lens[] = [
  {
    id: 'projection', name: 'Projection', blurb: 'Where the consensus puts each player: the first two rounds on their marks, the rest of the board behind them.', maxHeight: 0,
    legend: [{ color: ZONE_COLOR.round1, label: 'Round 1 · picks 1–32' }, { color: ZONE_COLOR.round2, label: 'Round 2 · picks 33–64' }, { color: ZONE_COLOR.watch, label: 'Tracking board · 65–150' }],
    value: (p) => ({ color: ZONE_COLOR[zoneOf(p)], height: 0, tag: null }),
  },
  {
    id: 'consensus', name: 'Consensus', blurb: 'Column height follows consensus rank: the taller the column, the higher the published lists have him.', maxHeight: 15,
    legend: [{ color: '#cde2fb', label: 'Top of the board' }, { color: '#3987e5', label: 'Middle' }, { color: '#184f95', label: 'Back of the board' }],
    note: 'An average of freely published boards and mock drafts. Each one is credited in the player file.',
    value: (p, ctx) => {
      const t = 1 - (p.rank - 1) / Math.max(1, ctx.boardSize - 1)
      return { color: ramp(BLUE, t), height: 0.06 + 0.94 * t ** 1.6, tag: `#${p.rank}` }
    },
  },
  {
    id: 'movement', name: 'Movement', maxHeight: 9,
    blurb: (ctx) => (ctx.movementBasis === 'consensus' ? 'Who moved on this board since last week. Column height is the size of the move.' : 'Who moved in Drafttek’s latest update. Column height is the size of the move.'),
    legend: MOVE_BANDS.map((b) => ({ color: b.color, label: b.label })).concat([{ color: EMPTY, label: 'No earlier ranking to compare' }]),
    note: (ctx) => (ctx.movementBasis === 'consensus' ? `Compared with this board’s ranking from the week of ${ctx.movementSince}.` : 'This board began tracking this week, so it has no earlier ranking of its own yet. Until it does, movement is Drafttek’s own week-over-week change.'),
    value: (p, ctx) => {
      const v = trendOf(p)
      if (v === null) return { color: EMPTY, height: 0, tag: p.trend?.basis === 'new' ? 'NEW' : null, empty: p.trend?.basis !== 'new' }
      return { color: moveColor(v), height: v === 0 ? 0 : 0.08 + 0.92 * Math.min(1, Math.abs(v) / Math.max(8, ctx.maxMove)), tag: v === 0 ? null : `${v > 0 ? '▲' : '▼'}${Math.abs(v)}` }
    },
  },
  {
    id: 'spread', name: 'Disagreement', blurb: 'How far apart the lists are on each player. A tall column means the outlets do not agree.', maxHeight: 11,
    legend: [{ color: '#ffe08a', label: 'Wide disagreement' }, { color: '#d99a2b', label: 'Some' }, { color: '#7a5a1c', label: 'Close agreement' }],
    note: 'The standard deviation of a player’s ranks across the lists that include him.',
    value: (p, ctx) => {
      const t = Math.min(1, p.spread / Math.max(1, ctx.maxSpread))
      return { color: ramp(GOLD, Math.sqrt(t)), height: Math.max(0.03, t), tag: `±${Math.round(p.spread)}` }
    },
  },
  {
    id: 'class', name: 'Class', blurb: 'Years since high school. Third-year players may enter the draft early; everyone else is in a final or extra season.', maxHeight: 7,
    legend: [{ color: ORDINAL_BLUE[3], label: 'Third year · junior or redshirt sophomore' }, { color: ORDINAL_BLUE[1], label: 'Fourth year · senior or redshirt junior' }, { color: ORDINAL_BLUE[0], label: 'Fifth year or more' }, { color: EMPTY, label: 'Class not listed' }],
    note: 'Underclassmen have until January to declare, so some players here may return to school.',
    value: (p) => {
      if (!p.clsYear) return { color: EMPTY, height: 0, tag: null, empty: true }
      const y = Math.max(3, Math.min(5, p.clsYear))
      return { color: y === 3 ? ORDINAL_BLUE[3] : y === 4 ? ORDINAL_BLUE[1] : ORDINAL_BLUE[0], height: (y - 2) / 3, tag: classShort(p.cls) }
    },
  },
  {
    id: 'recruiting', name: 'Recruiting', blurb: 'How ESPN graded each player coming out of high school. Column height is the star rating.', maxHeight: 9,
    legend: [{ color: ORDINAL_BLUE[3], label: 'Five stars' }, { color: ORDINAL_BLUE[2], label: 'Four stars' }, { color: ORDINAL_BLUE[1], label: 'Three stars' }, { color: ORDINAL_BLUE[0], label: 'Two stars or fewer' }, { color: EMPTY, label: 'Not in ESPN’s recruiting database' }],
    note: 'Recruiting grades and ranks are ESPN’s. Each player file links to his ESPN recruiting page.',
    value: (p) => {
      if (!p.stars) return { color: EMPTY, height: 0, tag: null, empty: true }
      const color = p.stars >= 5 ? ORDINAL_BLUE[3] : p.stars === 4 ? ORDINAL_BLUE[2] : p.stars === 3 ? ORDINAL_BLUE[1] : ORDINAL_BLUE[0]
      return { color, height: p.stars / 5, tag: `${p.stars}★${p.recruitRank ? ` #${p.recruitRank}` : ''}` }
    },
  },
]

export const lensById = (id: LensId) => LENSES.find((l) => l.id === id)!
export const lensText = (v: Lens['blurb'] | Lens['note'], ctx: LensContext) => (typeof v === 'function' ? v(ctx) : v)

export function lensContext(board: BoardPlayer[], movement?: { basis: 'consensus' | 'drafttek'; since?: string }): LensContext {
  return {
    boardSize: board.length,
    maxSpread: Math.max(1, ...board.map((p) => p.spread || 0)),
    maxMove: Math.max(1, ...board.map((p) => Math.abs(trendOf(p) ?? 0))),
    movementBasis: movement?.basis || 'drafttek',
    movementSince: movement?.since,
  }
}
