// Two analysts' top-50 lists, each published as an article.
import { getText } from '../lib/http.mjs'
import { pageDate, plain, text } from '../lib/html.mjs'
import { ARTICLE_URLS } from '../config.mjs'

/** Fox Sports (Rob Rang): "<h2>1. Name, POS</h2>" followed by the school's team page link. */
export async function loadFox() {
  const url = ARTICLE_URLS.fox
  const html = await getText(url, { ttlHours: 12 })
  const entries = []
  for (const m of html.matchAll(/<h2[^>]*>\s*(?:<a[^>]*>)?\s*(\d{1,2})\.\s*([^<,]+),\s*([A-Za-z/]+)\s*(?:<\/a>)?\s*<\/h2>\s*<p[^>]*>\s*(?:<a[^>]*>)?([^<]*)/g)) {
    const rank = Number(m[1])
    if (entries.some((e) => e.rank === rank)) continue
    entries.push({ rank, name: plain(text(m[2])), pos: m[3].trim(), schoolFull: plain(text(m[4])) })
  }
  entries.sort((a, b) => a.rank - b.rank)
  return { id: 'fox', name: 'Fox Sports', author: 'Rob Rang', kind: 'board', url, updated: pageDate(html), entries }
}

/** DraftCountdown (Brian Lamb): "<p>1. <a>Name, POS, School</a></p>". */
export async function loadDraftCountdown() {
  const url = ARTICLE_URLS.draftcountdown
  const html = await getText(url, { ttlHours: 12 })
  const entries = []
  for (const m of html.matchAll(/<p>\s*(\d{1,2})\.\s*(?:<a[^>]*>)?([^<]+?)(?:<\/a>)?\s*<\/p>/g)) {
    const parts = plain(text(m[2])).split(',').map((s) => s.trim())
    const rank = Number(m[1])
    if (parts.length < 3 || entries.some((e) => e.rank === rank)) continue
    entries.push({ rank, name: parts[0], pos: parts[1], school: parts.slice(2).join(', ') })
  }
  entries.sort((a, b) => a.rank - b.rank)
  return { id: 'draftcountdown', name: 'NFL Draft Countdown', author: 'Brian Lamb', kind: 'board', url, updated: pageDate(html), entries }
}
