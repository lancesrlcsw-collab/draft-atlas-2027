// Where every player stands. One world unit is one yard.
//
// There are two arrangements of the same 150 figures:
//   stage - the projected first two rounds in pick order on numbered marks, four rows of
//           sixteen, with the rest of the tracking board lined up behind them
//   field - everyone at his position on a football field, offense left of the line of
//           scrimmage and defense right, best-ranked nearest the line
import type { BoardPlayer } from '../types'

export const FIELD = { length: 120, width: 53.333, half: 60, halfWidth: 26.667, endZone: 10 }
export type Arrangement = 'stage' | 'field'
export type Zone = 'round1' | 'round2' | 'watch'

export interface Placement {
  x: number
  /** Height of the surface he stands on (the stage is tiered; the field is flat). */
  y: number
  z: number
  /** Rotation about Y so the figure faces the audience or its opponent. */
  facing: number
  zone: Zone
}

export const zoneOf = (p: BoardPlayer): Zone => (p.pick ? (p.pick.round === 1 ? 'round1' : 'round2') : 'watch')

// ---------------------------------------------------------------- stage

const PER_ROW = 16
const MARK = 5 // yards between marks along a row
/** Z of the four pick rows, front to back, and where the tracking-board rows begin. */
export const STAGE = { rows: [15, 6.5, -4.5, -13], rowY: [0, 1.5, 3.3, 4.8], watchZ: -24.5, watchStep: 5.2, watchPerRow: 22, watchGap: 3.6, watchRows: 4, watchY: 6.8, watchRise: 1.4, depthFront: 22, depthBack: -46 }

export function stageSlot(pick: number): { x: number; y: number; z: number } {
  const row = Math.floor((pick - 1) / PER_ROW)
  const col = (pick - 1) % PER_ROW
  return { x: (col - (PER_ROW - 1) / 2) * MARK, y: STAGE.rowY[row], z: STAGE.rows[row] }
}

function placeStage(players: BoardPlayer[]): Map<string, Placement> {
  const out = new Map<string, Placement>()
  const watch: BoardPlayer[] = []
  for (const p of players) {
    if (p.pick) out.set(p.id, { ...stageSlot(p.pick.pick), facing: Math.PI / 2, zone: zoneOf(p) })
    else watch.push(p)
  }
  watch.sort((a, b) => a.rank - b.rank).forEach((p, i) => {
    const row = Math.floor(i / STAGE.watchPerRow)
    const inRow = Math.min(STAGE.watchPerRow, watch.length - row * STAGE.watchPerRow)
    const col = i % STAGE.watchPerRow
    out.set(p.id, { x: (col - (inRow - 1) / 2) * STAGE.watchGap, y: STAGE.watchY + row * STAGE.watchRise, z: STAGE.watchZ - row * STAGE.watchStep, facing: Math.PI / 2, zone: 'watch' })
  })
  return out
}

// ---------------------------------------------------------------- field

/** Lanes run away from the line of scrimmage; a position's players fill its lanes in rank order. */
const LANES: { side: -1 | 1; lanes: number[]; groups: string[] }[] = [
  { side: -1, lanes: [-23.2, 23.2, -19.4, 19.4], groups: ['WR'] },
  { side: -1, lanes: [14.4, -14.4], groups: ['TE'] },
  { side: -1, lanes: [-9.6, 9.6], groups: ['OT'] },
  { side: -1, lanes: [0, -4.8, 4.8], groups: ['IOL', 'QB', 'RB'] },
  { side: 1, lanes: [23.2, -23.2, 19.4, -19.4], groups: ['CB', 'S'] },
  { side: 1, lanes: [9.6, -9.6, 14.4, -14.4], groups: ['EDGE'] },
  { side: 1, lanes: [0, 4.8, -4.8], groups: ['DL', 'LB'] },
]
const LINE_GAP = 2.6 // first man's distance from the line of scrimmage
const DEPTH_STEP = 4.3
const BLOCK_GAP = 6.5

export interface FieldLabel { text: string; x: number; z: number }

function placeField(players: BoardPlayer[]): { places: Map<string, Placement>; labels: FieldLabel[] } {
  const places = new Map<string, Placement>()
  const labels: FieldLabel[] = []
  const byGroup = new Map<string, BoardPlayer[]>()
  for (const p of [...players].sort((a, b) => a.rank - b.rank)) {
    if (!byGroup.has(p.pos)) byGroup.set(p.pos, [])
    byGroup.get(p.pos)!.push(p)
  }
  for (const set of LANES) {
    let start = LINE_GAP
    for (const g of set.groups) {
      const list = byGroup.get(g) || []
      if (!list.length) continue
      // Use fewer lanes for a short list so it stays a tidy block.
      const lanes = set.lanes.slice(0, Math.max(1, Math.min(set.lanes.length, Math.ceil(list.length / 2))))
      const depth = Math.ceil(list.length / lanes.length)
      list.forEach((p, i) => {
        const lane = lanes[i % lanes.length]
        const row = Math.floor(i / lanes.length)
        places.set(p.id, { x: set.side * (start + row * DEPTH_STEP), y: 0, z: lane, facing: set.side < 0 ? 0 : Math.PI, zone: zoneOf(p) })
      })
      const zs = [...lanes].sort((a, b) => a - b)
      // One label per cluster of adjacent lanes (receivers and corners line up on both sidelines).
      const clusters: number[][] = []
      for (const z of zs) { const last = clusters[clusters.length - 1]; if (last && z - last[last.length - 1] < 6) last.push(z); else clusters.push([z]) }
      for (const c of clusters) labels.push({ text: g, x: set.side * (start + depth * DEPTH_STEP + 0.2), z: (c[0] + c[c.length - 1]) / 2 })
      start += depth * DEPTH_STEP + BLOCK_GAP
    }
  }
  // Specialists, and anyone without a lane, wait on the near sideline.
  const stray = players.filter((p) => !places.has(p.id)).sort((a, b) => a.rank - b.rank)
  stray.forEach((p, i) => places.set(p.id, { x: (i - (stray.length - 1) / 2) * 3.6, y: 0, z: FIELD.halfWidth + 5.5, facing: -Math.PI / 2, zone: zoneOf(p) }))
  return { places, labels }
}

export interface Layouts { stage: Map<string, Placement>; field: Map<string, Placement>; fieldLabels: FieldLabel[] }

export function buildLayouts(players: BoardPlayer[]): Layouts {
  const f = placeField(players)
  return { stage: placeStage(players), field: f.places, fieldLabels: f.labels }
}

/** Scale a figure from listed height/weight. Returns [height in yards, girth factor]. */
export function bodyScale(heightIn?: number, weightLb?: number): [number, number] {
  const h = (heightIn || 74) / 36
  const bmi = ((weightLb || 225) / ((heightIn || 74) ** 2)) * 703
  // 26 BMI (a lean corner) -> 0.86 ; 40 BMI (a nose tackle) -> 1.42
  const girth = Math.max(0.8, Math.min(1.5, 0.86 + (bmi - 26) * 0.04))
  return [h, girth]
}
