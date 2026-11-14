// Shapes of the JSON files in public/data, as written by the pipeline.

export type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'OT' | 'IOL' | 'DL' | 'EDGE' | 'LB' | 'CB' | 'S' | 'ST'
export type Unit = 'offense' | 'defense' | 'special'

export interface Trend { value: number | null; basis: 'consensus' | 'drafttek' | 'new' }
export interface PickRef { pick: number; round: number; team: string; via?: string; provisional?: boolean }

/** One row of board.json: enough to draw a player in the scene and on the board. */
export interface BoardPlayer {
  id: string
  slug: string
  name: string
  first: string
  last: string
  number?: number
  pos: Pos
  position?: string
  unit: Unit
  school?: { name: string; abbr?: string; color?: string; conference?: string }
  cls?: string
  clsYear?: number
  height?: number
  weight?: number
  rank: number
  avg: number
  high: number
  low: number
  spread: number
  sources: number
  move?: number
  trend?: Trend
  pick?: PickRef
  stars?: number
  recruitRank?: number
  line?: { label: string; value: string }[]
}

export interface Spot { source: string; name: string; author?: string; kind: 'board' | 'mock'; rank: number; team?: string; move?: number; url: string; updated?: string }

export interface StatCategory {
  key: string
  title: string
  labels: string[]
  names: string[]
  displayNames: string[]
  seasons: { year: number; team?: string; school?: string; position?: string; values: (number | string | null)[] }[]
  totals?: (number | string | null)[]
}

export interface GameLog {
  labels: string[]
  names: string[]
  displayNames: string[]
  groups: { title: string; count: number }[]
  games: { id: string; date?: string; week?: number; type: 'reg' | 'post'; home: boolean; opp?: string; oppName?: string; result?: string; score?: string; values: (number | string | null)[] }[]
}

export interface Article { headline: string; description?: string; published?: string; url: string; type?: string; byline?: string; source: string; players?: string[] }

export interface Dossier {
  id: string
  slug: string
  name: string
  first: string
  last: string
  number?: number
  pos: Pos
  boardPos?: string
  position?: string
  positionName?: string
  unit: Unit
  school?: { id: string; name: string; mascot?: string; abbr?: string; color?: string; altColor?: string; conference?: string; record?: string }
  cls?: string
  clsYear?: number
  height?: number
  weight?: number
  consensus: {
    rank: number; avg: number; high: number; low: number; spread: number; sources: number
    spots: Spot[]
    unlisted?: { source: string; name: string; depth: number }[]
    history?: { week: string; date: string; rank: number }[]
  }
  move?: number
  trend?: Trend
  pick?: PickRef
  mocks?: { source: string; pick: number; team?: string; url: string; updated?: string }[]
  line?: { label: string; name: string; value: string; rank?: string }[]
  insights?: string[]
  bio: { birthPlace?: string; hometown?: string; highSchool?: string; previousSchools?: string[] }
  recruiting?: { classYear: number; grade?: number; stars?: number; rank?: number; positionRank?: number; stateRank?: number; position?: string; url?: string }
  stats: StatCategory[]
  logs: Record<string, GameLog>
  summaryLabel?: string
  news: Article[]
  links: { espn?: string; wikipedia?: string }
  wiki?: {
    title: string; url: string; description?: string; touched?: string; intro: string
    sections?: { key: string; title: string; text: string }[]
    family?: { relation: string; name: string; description?: string; url: string }[]
  }
}

export interface SourceMeta { id: string; name: string; author?: string; kind: 'board' | 'mock'; url: string; title?: string; note?: string; updated?: string; stale: boolean; depth: number; error?: string; counted: boolean }
export interface OrderPick { pick: number; round: number; slot: number; original: string; team: string; via?: { from: string; note?: string; source?: { label: string; url: string }; conditional?: boolean }; record: string; provisional: boolean; slug?: string }
export interface NflTeam { abbr: string; name: string; nickname: string; color: string; altColor: string; record?: string; sos?: number }
export interface Mover { slug: string; name: string; pos: Pos; school?: string; rank: number; move: number }
export interface Tally { name: string; count: number }

export interface DraftData {
  generatedAt: string
  season: number
  draftYear: number
  boardSize: number
  picks: number
  method: { minSources: number; staleDays: number; considered: number; ranked: number }
  sources: SourceMeta[]
  linkOnly: { name: string; url: string; why: string }[]
  dataSources: { id: string; name: string; what: string; url: string; license?: string }[]
  order: {
    picks: OrderPick[]
    crossCheck?: { against: string; url: string; agrees: boolean; issues?: string[] }
    trades: { round: number; from: string; to: string; note?: string; source?: { label: string; url: string }; conditional?: boolean }[]
    tradesChecked?: string
    playoffField: string[]
  }
  nflTeams: Record<string, NflTeam>
  movement: { basis: 'consensus' | 'drafttek'; since?: string; started: string; weeks: number; risers: Mover[]; fallers: Mover[]; added?: Mover[]; dropped?: { slug: string; rank: number }[] }
  breakdown: { positions: { picks: Tally[]; board: Tally[] }; schools: Tally[]; conferences: Tally[]; classes: Tally[] }
  headlines: Article[]
  coverage: { matched: number; withStats: number; withLogs: number; withRecruiting: number; withBackground: number; withHeadlines: number; unmatched?: string[] }
}
