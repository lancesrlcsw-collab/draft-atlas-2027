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

/** Drop every sentence that mentions a relative. */
export function scrubFamily(text) {
  const keep = (sentence) => !FAMILY.test(sentence)
  return text
    .split('\n')
    .map((para) => (para.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || [para]).filter((s) => keep(s)).join('').trim())
    .filter((para, i, all) => para || (i > 0 && all[i - 1]))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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
    body = scrubFamily(body)
    if (body.length < 40) continue
    const max = LIMIT[rule[0]]
    if (body.length > max) body = `${body.slice(0, body.lastIndexOf('. ', max) + 1 || max).trim()} …`
    sections.push({ key: rule[0], title, text: body })
  }
  return { intro: intro.length > 1400 ? `${intro.slice(0, intro.lastIndexOf('. ', 1400) + 1)}` : intro, sections }
}

async function fetchPage(title) {
  const u = `${WP}?action=query&prop=extracts%7Cinfo%7Cdescription&explaintext=1&exsectionformat=wiki&inprop=url&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(title)}`
  const j = await getJSON(u, { ttlHours: 24, politeMs: 400 })
  const page = j?.query?.pages?.[0]
  if (!page || page.missing || !page.extract) return null
  return { title: page.title, url: page.fullurl, description: page.description || null, touched: page.touched || null, extract: page.extract }
}

/** The article must clearly be this player: a football biography that names one of his schools. */
export function isThisPlayer(page, player) {
  const head = page.extract.slice(0, 900)
  if (!/football/i.test(head)) return false
  const last = player.name.replace(/\b(Jr|Sr|II|III|IV|V)\b\.?/g, '').trim().split(' ').pop()
  if (!page.title.includes(last) && !head.includes(last)) return false
  return (player.schools || []).some((s) => s && page.extract.includes(s))
}

async function searchPage(player) {
  const u = `${WP}?action=query&list=search&srlimit=3&format=json&formatversion=2&srsearch=${encodeURIComponent(`"${player.name}" American football ${player.schools?.[0] || ''}`)}`
  const j = await getJSON(u, { ttlHours: 24, politeMs: 400 })
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
    const j = await getJSON(`${SPARQL}?format=json&query=${encodeURIComponent(q)}`, { ttlHours: 24, headers: { accept: 'application/sparql-results+json' } })
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

/**
 * @param {{key:string, name:string, schools:string[]}[]} players
 * @param {Record<string, object>} previous background text from the last build, kept when Wikipedia cannot be reached
 */
export async function loadWiki(players, previous = {}) {
  const out = {}
  const pages = {}
  let failures = 0
  let reached = false
  for (const p of players) {
    if (failures >= 3 && !reached) break // Wikipedia is refusing this machine; stop asking
    try {
      const prev = previous[p.key]
      let page = prev?.title ? await fetchPage(prev.title) : null
      if (page && !isThisPlayer(page, p)) page = null
      if (!page) page = await searchPage(p)
      reached = true
      failures = 0
      if (page) pages[p.key] = page
    } catch (err) {
      failures++
      if (reached) console.warn(`  wiki: ${p.name}: ${err.message}`)
    }
  }
  if (!reached) {
    console.warn('  wiki: Wikipedia could not be reached; keeping the background text from the last build')
    return { wiki: Object.fromEntries(players.filter((p) => previous[p.key]).map((p) => [p.key, previous[p.key]])), reached: false }
  }
  let relatives = {}
  try { relatives = await publicRelatives(Object.values(pages).map((p) => p.title)) } catch (err) { console.warn(`  wikidata: ${err.message}`) }
  for (const p of players) {
    const page = pages[p.key]
    if (!page) continue
    const family = relatives[page.title] || []
    const parsed = parseExtract(page.extract)
    if (!parsed.intro) continue
    out[p.key] = { title: page.title, url: page.url, description: page.description, touched: page.touched, ...parsed, family }
  }
  return { wiki: out, reached: true }
}
