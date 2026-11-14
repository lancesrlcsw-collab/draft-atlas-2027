// Stick to the Model's big board. Only the rank order is read; its scores, tiers and
// player comparisons are its own work and stay on its site.
import { getText } from '../lib/http.mjs'
import { decode, text } from '../lib/html.mjs'

const URL = 'https://sticktothemodel.com/draft/prospect-overview/big-board'

export async function load() {
  const html = await getText(URL)
  const entries = []
  const seen = new Set()
  for (const m of html.matchAll(/<tr data-rank="(\d+)" data-pos="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const rank = Number(m[1])
    const name = text(m[3].match(/<a href="\/player\/[^"]*">([^<]*)<\/a>/)?.[1] || '')
    const school = text(m[3].match(/class="nm-sub">([^<]*)</)?.[1] || '').split('·').pop().trim()
    if (!name || seen.has(rank)) continue
    seen.add(rank)
    entries.push({ rank, name, pos: decode(m[2]), school })
  }
  entries.sort((a, b) => a.rank - b.rank)
  return { id: 'sttm', name: 'Stick to the Model', author: 'Stick to the Model', kind: 'board', url: URL, updated: null, entries, note: 'Blends other published boards with its own statistical model' }
}
