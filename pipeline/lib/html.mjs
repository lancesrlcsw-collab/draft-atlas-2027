// Small helpers for reading published HTML pages without a DOM library.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—', hellip: '…', middot: '·' }

export function decode(text) {
  return String(text ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
}

/** Strip tags and collapse whitespace. */
export const text = (html) => decode(String(html ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

/** Straighten typographic apostrophes so names join across sources. */
export const plain = (s) => String(s ?? '').replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim()

/** First ISO date found in a page's structured data (dateModified wins over datePublished). */
export function pageDate(html) {
  const mod = html.match(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})/)
  const pub = html.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})/)
  return (mod || pub)?.[1] || null
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
/** "November 9, 2026" -> "2026-11-09". */
export function longDate(str) {
  const m = String(str || '').match(/([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/)
  if (!m) return null
  const mo = MONTHS.indexOf(m[1].toLowerCase())
  if (mo < 0) return null
  return `${m[3]}-${String(mo + 1).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`
}
