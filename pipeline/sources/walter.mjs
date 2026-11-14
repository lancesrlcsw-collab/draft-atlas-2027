// Walter Football's mock draft. Only the first round is read: the second round sits partly
// behind the site's membership, so it is left alone.
import { getText } from '../lib/http.mjs'
import { plain, text } from '../lib/html.mjs'
import { DRAFT_YEAR } from '../config.mjs'
import { parsePickLine } from '../nfl-teams.mjs'

const PAGES = [`https://walterfootball.com/draft${DRAFT_YEAR}.php`, `https://walterfootball.com/draft${DRAFT_YEAR}_1.php`]

export async function load() {
  const entries = []
  let updated = null
  for (const [i, url] of PAGES.entries()) {
    const html = await getText(url, { politeMs: i ? 1500 : 0 })
    if (!html) continue
    if (!updated) {
      const m = text(html).match(/Walt[^|]{0,40}?Updated\s+(\d{1,2})\/(\d{1,2})|Updated\s+(\d{1,2})\/(\d{1,2})/)
      if (m) {
        const mo = Number(m[1] || m[3]), day = Number(m[2] || m[4])
        const now = new Date()
        // The page gives month and day only; a date "in the future" belongs to last year.
        let year = now.getUTCFullYear()
        if (new Date(Date.UTC(year, mo - 1, day)) > new Date(now.getTime() + 864e5)) year--
        updated = `${year}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      }
    }
    for (const m of html.matchAll(/<div class="player-info article" data-number="(\d+)">([\s\S]*?)<\/strong>/g)) {
      const pick = Number(m[1])
      const parsed = parsePickLine(plain(text(m[2])))
      if (!parsed || pick < 1 || pick > 32 || entries.some((e) => e.rank === pick)) continue
      entries.push({ rank: pick, ...parsed })
    }
  }
  entries.sort((a, b) => a.rank - b.rank)
  return { id: 'walter', name: 'Walter Football', author: 'Walter Cherepinsky', kind: 'mock', url: PAGES[0], updated, entries, note: 'First round only' }
}
