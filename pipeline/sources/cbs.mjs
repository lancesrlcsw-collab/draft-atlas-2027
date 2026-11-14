// CBS Sports' free prospect rankings table.
import { getText } from '../lib/http.mjs'
import { text } from '../lib/html.mjs'

const URL = 'https://www.cbssports.com/nfl/draft/prospect-rankings/'

export async function load() {
  const html = await getText(URL)
  const entries = []
  for (const row of html.matchAll(/<td[^>]*class="[^"]*cell-rank[^"]*"[^>]*>\s*(\d+)\s*<\/td>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]))
    // player, school, class, position, position rank, height, weight
    const [name, school, cls, pos, , ht, wt] = cells
    const h = (ht || '').match(/(\d)-(\d{1,2})/)
    if (name) entries.push({ rank: Number(row[1]), name, school, pos, cls: cls || null, height: h ? Number(h[1]) * 12 + Number(h[2]) : null, weight: Number(wt) || null })
  }
  return { id: 'cbs', name: 'CBS Sports', author: 'CBS Sports draft staff', kind: 'board', url: URL, updated: null, entries }
}
