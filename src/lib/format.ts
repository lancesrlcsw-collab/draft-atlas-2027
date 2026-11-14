export const SITE_NAME = 'Green Room Atlas'
/** The wordmark in two parts: the lead words, then the last word, which is set in the accent color. */
export const SITE_MARK: [string, string] = (() => {
  const upper = SITE_NAME.toUpperCase()
  const cut = upper.lastIndexOf(' ')
  return cut < 0 ? [upper, ''] : [upper.slice(0, cut), upper.slice(cut + 1)]
})()

export function height(inches?: number | null): string {
  if (!inches) return '—'
  return `${Math.floor(inches / 12)}′${Math.round(inches % 12)}″`
}

export function num(v: unknown, digits = 0): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v !== 'number') return String(v)
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** A statistic as ESPN lists it: whole numbers plain, rates to one decimal. */
export const stat = (v: unknown): string => (typeof v === 'number' ? num(v, Number.isInteger(v) ? 0 : 1) : v === null || v === undefined || v === '' ? '—' : String(v))

export function ordinal(n?: number | null): string {
  if (n === null || n === undefined) return '—'
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function dateShort(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: iso.length === 10 ? 'UTC' : undefined })
}

export function dateLong(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: iso.length === 10 ? 'UTC' : undefined })
}

export function timeAgo(iso?: string): string {
  if (!iso) return ''
  const mins = Math.round((Date.now() - new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  if (h < 36) return `${h} hr ago`
  return `${Math.round(h / 24)} days ago`
}

/** "▲ 4", "▼ 2" or "—". */
export function moveText(v?: number | null): string {
  if (v === null || v === undefined || v === 0) return '—'
  return `${v > 0 ? '▲' : '▼'} ${Math.abs(v)}`
}

export const POS_NAME: Record<string, string> = {
  QB: 'Quarterback', RB: 'Running back', WR: 'Wide receiver', TE: 'Tight end', OT: 'Offensive tackle', IOL: 'Interior offensive line',
  DL: 'Defensive line', EDGE: 'Edge rusher', LB: 'Linebacker', CB: 'Cornerback', S: 'Safety', ST: 'Specialist',
}
export const POS_PLURAL: Record<string, string> = {
  QB: 'Quarterbacks', RB: 'Running backs', WR: 'Wide receivers', TE: 'Tight ends', OT: 'Offensive tackles', IOL: 'Interior linemen',
  DL: 'Defensive linemen', EDGE: 'Edge rushers', LB: 'Linebackers', CB: 'Cornerbacks', S: 'Safeties', ST: 'Specialists',
}
export const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'DL', 'EDGE', 'LB', 'CB', 'S', 'ST']

const CLASS_SHORT: Record<string, string> = {
  Freshman: 'FR', 'Redshirt freshman': 'RS-FR', Sophomore: 'SO', 'Redshirt sophomore': 'RS-SO', Junior: 'JR', 'Redshirt junior': 'RS-JR', Senior: 'SR', 'Redshirt senior': 'RS-SR', Graduate: 'GR',
}
export const classShort = (cls?: string) => (cls ? CLASS_SHORT[cls] || cls : '—')
