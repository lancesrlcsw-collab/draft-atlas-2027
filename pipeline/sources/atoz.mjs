// A to Z Sports publishes a fresh two-round mock draft most weeks. The newest one is found
// through the site's draft feed, then read for "pick. team: player, position, school".
import { getText } from '../lib/http.mjs'
import { decode, pageDate, plain, text } from '../lib/html.mjs'
import { parsePickLine } from '../nfl-teams.mjs'
import { DRAFT_YEAR } from '../config.mjs'

const FEED = 'https://atozsports.com/nfl-draft/feed/'

export function parsePicks(html) {
  const picks = new Map()
  for (const line of html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|h\d|li)>/gi, '\n').split('\n')) {
    const m = plain(text(line)).match(/^(\d{1,2})\.\s*(.+)$/)
    if (!m) continue
    const pick = Number(m[1])
    if (pick < 1 || pick > 64 || picks.has(pick)) continue
    const parsed = parsePickLine(m[2])
    if (parsed) picks.set(pick, { rank: pick, ...parsed })
  }
  return [...picks.values()].sort((a, b) => a.rank - b.rank)
}

export async function load() {
  const feed = await getText(FEED, { ttlHours: 3 })
  const items = [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => ({
    title: decode(m[1].match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, ''),
    link: (m[1].match(/<link>([\s\S]*?)<\/link>/)?.[1] || '').trim(),
    author: (m[1].match(/<dc:creator>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/dc:creator>/)?.[1] || '').trim(),
    date: new Date(m[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || 0),
  }))
  const mocks = items.filter((i) => new RegExp(`${DRAFT_YEAR} NFL Mock Draft`, 'i').test(i.title)).sort((a, b) => b.date - a.date)
  // Prefer the newest two-round edition; a one-round mock still counts if that is all there is.
  const ordered = [...mocks.filter((i) => /2-Round|two-round/i.test(i.title)), ...mocks.filter((i) => !/2-Round|two-round/i.test(i.title))]
  for (const item of ordered.slice(0, 3)) {
    const html = await getText(item.link, { ttlHours: 12, politeMs: 800 })
    if (!html) continue
    const entries = parsePicks(html)
    if (entries.length >= 28) {
      return { id: 'atoz', name: 'A to Z Sports', author: item.author || 'A to Z Sports', kind: 'mock', url: item.link, title: item.title, updated: pageDate(html) || item.date.toISOString().slice(0, 10), entries }
    }
  }
  throw new Error('no readable mock draft in the A to Z Sports feed')
}
