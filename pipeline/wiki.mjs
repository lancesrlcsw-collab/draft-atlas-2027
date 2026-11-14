// Biographical background from English Wikipedia (sourced prose, CC BY-SA 4.0) and Wikidata.
//
// These are college students, so the rules are tighter than for professionals:
//   - only the introduction, early-life / high-school, college-career and honors sections are kept;
//     "personal life" sections are not collected at all
//   - any sentence that mentions a relative is dropped
//   - relatives who are public figures with a Wikipedia article of their own are listed
//     separately, as links, from Wikidata
import { getJSON } from './lib/http.mjs'

const SPARQL = 'https://query.wikidata.org/sparql'
const WP = 'https://en.wikipedia.org/w/api.php'
const RELATION = { P22: 'Father', P25: 'Mother', P3373: 'Sibling', P1038: 'Relative' }

const SECTION_RULES = [
  ['early', /^(early (life|years).*|high school.*|background|youth|early life and high school.*)$/i],
  ['college', /^(college.*|collegiate career|amateur career)$/i],
  ['awards', /^(awards.*|honors.*|career highlights.*|records.*|accolades.*)$/i],
]
const LIMIT = { early: 1600, college: 5200, awards: 1200 }

const FAMILY = /\b(father|mother|mom|dad|parents?|step-?(father|mother|brother|sister|dad|mom)|brothers?|sisters?|siblings?|twin|cousins?|uncles?|aunts?|grand(father|mother|parents?|son)|nephews?|nieces?|girlfriend|boyfriend|fianc[ée]e?|wife|husband|married|engaged|son of|daughter of|sons?|daughters?|child(ren)?|born to|raised by|famil(y|ies)|relatives?)\b/i

/**
 * Remove what is said about relatives. A paragraph is cut from its first sentence that mentions a
 * relative through to its end, never just that one sentence: the sentences that follow often go on
 * about the same person ("He was ..."), and left behind they would read as if they were about the
 * player. For the same reason a following paragraph that opens with a pronoun is dropped too.
 */
export function scrubFamily(text) {
  const out = []
  let cut = false
  for (const para of text.split('\n')) {
    if (!para.trim()) { out.push(''); continue }
    // Sub-headings ("2024 SEASON") pass through and reset the carry-over.
    if (/^[A-Z0-9 ,.'’&()–-]{4,}$/.test(para.trim())) { out.push(para); cut = false; continue }
    if (cut && /^\s*(He|His|She|Her|They|Their|The pair|The two|Both)\b/.test(para)) continue
    // Split only at whitespace that follows closing punctuation, so every character is kept
    // ("A. J.", "6.5 sacks") and the pieces can be put back together exactly.
    const sentences = para.split(/(?<=[.!?]["”’)]?)\s+(?=["“(]?[A-Z0-9])/)
    const at = sentences.findIndex((x) => FAMILY.test(x))
    cut = at >= 0
    const kept = (at < 0 ? sentences : sentences.slice(0, at)).join(' ').trim()
    if (kept) out.push(kept)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function parseExtract(text) {
  const parts = text.split(/^==\s*([^=].*?)\s*==\s*$/m)
  const intro = scrubFamily(parts[0].trim())
  const sections = []
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i].trim()
    const rule = SECTION_RULES.find(([, re]) => re.test(title))
    if (!rule) continue
    let body = parts[i + 1]
      .replace(/^={3,}\s*(.+?)\s*={3,}\s*$/gm, (_, h) => `\n${h.toUpperCase()}`)
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    // Drop sub-headings left with nothing under them (statistics tables do not survive as text).
    body = scrubFamily(body).replace(/(^|\n)[A-Z0-9 ,.'’&()–-]{4,}(?=\n\s*\n?[A-Z0-9 ,.'’&()–-]{4,}(\n|$)|\s*$)/g, '').trim()
    if (body.length < 40) continue
    const max = LIMIT[rule[0]]
    if (body.length > max) body = `${body.slice(0, body.lastIndexOf('. ', max) + 1 || max).trim()} …`
    sections.push({ key: rule[0], title, text: body })
  }
  return { intro: intro.length > 1400 ? `${intro.slice(0, intro.lastIndexOf('. ', 1400) + 1)}` : intro, sections }
}

async function fetchPage(title) {
  const u = `${WP}?action=query&prop=extracts%7Cinfo%7Cdescription&explaintext=1&exsectionformat=wiki&inprop=url&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(title)}`
  const j = await getJSON(u, { ttlHours: 24, politeMs: 400, retries: 1, maxWaitS: 5 })
  const page = j?.query?.pages?.[0]
  if (!page || page.missing || !page.extract) return null
  return { title: page.title, url: page.fullurl, description: page.description || null, touched: page.touched || null, extract: page.extract }
}

const bare = (name) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s*\(.*\)\s*$/, '').replace(/\b(Jr|Sr|II|III|IV|V)\b\.?/g, '').replace(/[^A-Za-z' -]/g, '').trim().toLowerCase()

/**
 * The article must clearly be this player: an article under his own name (same surname, and a first
 * name that matches or shares its initial), about a football player, that names one of his schools.
 * Lists of people who share a name are never accepted.
 */
export function isThisPlayer(page, player) {
  if (/may refer to|refer to:/i.test(page.extract.slice(0, 200)) || /disambiguation|same term/i.test(page.description || '')) return false
  const head = page.extract.slice(0, 900)
  if (!/football/i.test(head)) return false
  const title = bare(page.title).split(' '), name = bare(player.name).split(' ')
  if (title[title.length - 1] !== name[name.length - 1]) return false
  const a = title[0].replace(/[^a-z]/g, ''), b = name[0].replace(/[^a-z]/g, '')
  if (!(a === b || a[0] === b[0] || a.includes(b) || b.includes(a))) return false
  return (player.schools || []).some((x) => x && page.extract.includes(x))
}

async function searchPage(player) {
  const u = `${WP}?action=query&list=search&srlimit=5&format=json&formatversion=2&srsearch=${encodeURIComponent(`"${player.name}" American football ${player.schools?.[0] || ''}`)}`
  const j = await getJSON(u, { ttlHours: 24, politeMs: 400, retries: 1, maxWaitS: 5 })
  for (const hit of j?.query?.search || []) {
    const page = await fetchPage(hit.title)
    if (page && isThisPlayer(page, player)) return page
  }
  return null
}

/** Relatives who have an English Wikipedia article of their own, by the player's article title. */
async function publicRelatives(titles) {
  const out = {}
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40)
    const q = `SELECT ?title ?prop ?relLabel ?relDesc ?relArticle WHERE {
  VALUES ?title { ${batch.map((t) => `${JSON.stringify(t)}@en`).join(' ')} }
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title .
  VALUES ?prop { wdt:P22 wdt:P25 wdt:P3373 wdt:P1038 }
  ?item ?prop ?rel .
  ?relArticle schema:about ?rel ; schema:isPartOf <https://en.wikipedia.org/> .
  OPTIONAL { ?rel schema:description ?relDesc . FILTER(LANG(?relDesc) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`
    const j = await getJSON(`${SPARQL}?format=json&query=${encodeURIComponent(q)}`, { ttlHours: 24, headers: { accept: 'application/sparql-results+json' }, retries: 1, maxWaitS: 5 })
    for (const b of j?.results?.bindings || []) {
      const relation = RELATION[b.prop.value.split('/').pop()]
      const name = b.relLabel?.value
      if (!relation || !name || /^Q\d+$/.test(name)) continue
      const list = (out[b.title.value] ||= [])
      if (!list.some((f) => f.name === name)) list.push({ relation, name, description: b.relDesc?.value || null, url: b.relArticle.value })
    }
  }
  return out
}

/** Bumped whenever the matching or filtering rules change, so text kept from an earlier build under older rules is not carried forward. */
export const WIKI_RULES = 4

/** Seconds one build may spend asking Wikipedia. Answers are cached for a day, so later builds carry on from here. */
const BUDGET_MS = Number(process.env.PIPELINE_WIKI_BUDGET_S || 300) * 1000

/**
 * @param {{key:string, name:string, schools:string[]}[]} players
 * @param {Record<string, object>} previous background text from the last build, kept for anyone Wikipedia could not be asked about this time
 */
export async function loadWiki(players, previousAll = {}) {
  const previous = Object.fromEntries(Object.entries(previousAll).filter(([, w]) => w?.rules === WIKI_RULES))
  const out = {}
  const pages = {}
  const asked = new Set()
  const started = Date.now()
  let failures = 0
  let reached = false
  let stopped = null
  // Players with nothing on file yet go first, so every build makes progress on the gaps.
  const order = [...players.filter((p) => !previous[p.key]), ...players.filter((p) => previous[p.key])]
  for (const p of order) {
    if (failures >= 4) { stopped = 'Wikipedia kept refusing requests'; break }
    if (Date.now() - started > BUDGET_MS) { stopped = `the ${Math.round(BUDGET_MS / 1000)}-second allowance ran out`; break }
    try {
      const prev = previous[p.key]
      let page = prev?.title ? await fetchPage(prev.title) : null
      if (page && !isThisPlayer(page, p)) page = null
      if (!page) page = await searchPage(p)
      reached = true
      failures = 0
      asked.add(p.key)
      if (page) pages[p.key] = page
    } catch (err) {
      failures++
      // The first refusal is always worth a line; after that only when some requests are getting through.
      if (reached || failures === 1) console.warn(`  wiki: ${p.name}: ${err.message}`)
    }
  }
  if (stopped) console.warn(`  wiki: stopped after ${asked.size} of ${players.length} players (${stopped}); the rest keep what was on file`)
  let relatives = {}
  if (Object.keys(pages).length) { try { relatives = await publicRelatives(Object.values(pages).map((p) => p.title)) } catch (err) { console.warn(`  wikidata: ${err.message}`) } }
  for (const p of players) {
    const page = pages[p.key]
    if (!page) {
      // Not asked this time (or the request failed): keep what the last build had.
      if (!asked.has(p.key) && previous[p.key]) out[p.key] = previous[p.key]
      continue
    }
    const parsed = parseExtract(page.extract)
    if (!parsed.intro) continue
    out[p.key] = { rules: WIKI_RULES, title: page.title, url: page.url, description: page.description, touched: page.touched, ...parsed, family: relatives[page.title] || [] }
  }
  return { wiki: out, reached, asked: asked.size }
}
