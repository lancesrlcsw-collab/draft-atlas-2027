// Drafttek's big board: a staff ranking published as plain tables, 150 players to a page.
import { getText } from '../lib/http.mjs'
import { decode, longDate, text } from '../lib/html.mjs'
import { DRAFT_YEAR } from '../config.mjs'

const page = (n) => `https://www.drafttek.com/${DRAFT_YEAR}-NFL-Draft-Big-Board/Top-NFL-Draft-Prospects-${DRAFT_YEAR}-Page-${n}.asp`

export async function load() {
  const entries = []
  let updated = null
  for (const n of [1, 2]) {
    const html = await getText(page(n), { politeMs: n > 1 ? 1500 : 0 })
    if (!html) break
    if (!updated) updated = longDate(text(html.match(/Big Board[\s\S]{0,600}?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4})/)?.[1] || ''))
    for (const row of html.matchAll(/<tr[^>]*data-rank="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cell = (cls) => text(row[2].match(new RegExp(`<td class="${cls}"[^>]*>([\\s\\S]*?)</td>`))?.[1] || '')
      const move = cell('change-cell').match(/([+-]\d+)/)
      const ht = decode(cell('ht-cell')).match(/(\d)'\s*(\d{1,2})/)
      entries.push({
        rank: Number(row[1]), name: cell('player-cell'), school: text(row[2].match(/class="college-name">([^<]*)</)?.[1] || ''), pos: cell('pos-cell'),
        height: ht ? Number(ht[1]) * 12 + Number(ht[2]) : null, weight: Number(cell('wt-cell')) || null, cls: cell('cls-cell') || null,
        move: move ? Number(move[1]) : 0,
      })
    }
  }
  return { id: 'drafttek', name: 'Drafttek', author: 'Drafttek scouting staff', kind: 'board', url: page(1), updated, entries }
}
