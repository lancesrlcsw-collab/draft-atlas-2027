// Build every JSON file the site reads, from live sources.  Usage: npm run data
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { SEASON, DRAFT_YEAR, BOARD_SIZE, PICKS, LINK_ONLY, DATA_SOURCES, STALE_DAYS, MIN_SOURCES, GROUP_UNIT, ARTICLE_URLS, posGroup } from './config.mjs'
import * as espn from './espn.mjs'
import { buildConsensus } from './consensus.mjs'
import { buildOrder, crossCheck, loadTrades } from './order.mjs'
import { loadWiki, WIKI_RULES } from './wiki.mjs'
import { NFL_TEAMS } from './nfl-teams.mjs'
import { compact, nameKey, ordinal, round, slugify } from './lib/util.mjs'
import { load as loadDrafttek } from './sources/drafttek.mjs'
import { load as loadCbs } from './sources/cbs.mjs'
import { load as loadSttm } from './sources/sttm.mjs'
import { load as loadAtoz } from './sources/atoz.mjs'
import { load as loadWalter } from './sources/walter.mjs'
import { loadFox, loadDraftCountdown } from './sources/articles.mjs'

const OUT = path.resolve('public/data')
const now = new Date()
const today = now.toISOString().slice(0, 10)
const t0 = Date.now()
const log = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${msg}`)
const readJson = async (file) => { try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { return null } }

// ---------------------------------------------------------------- published boards and mocks
log('Reading published boards and mock drafts')
const LOADERS = [
  { id: 'drafttek', name: 'Drafttek', kind: 'board', url: 'https://www.drafttek.com/', load: loadDrafttek },
  { id: 'cbs', name: 'CBS Sports', kind: 'board', url: 'https://www.cbssports.com/nfl/draft/prospect-rankings/', load: loadCbs },
  { id: 'sttm', name: 'Stick to the Model', kind: 'board', url: 'https://sticktothemodel.com/draft/prospect-overview/big-board', load: loadSttm },
  { id: 'atoz', name: 'A to Z Sports', kind: 'mock', url: 'https://atozsports.com/nfl-draft/', load: loadAtoz },
  { id: 'walter', name: 'Walter Football', kind: 'mock', url: `https://walterfootball.com/draft${DRAFT_YEAR}.php`, load: loadWalter },
  { id: 'fox', name: 'Fox Sports', kind: 'board', url: ARTICLE_URLS.fox, load: loadFox },
  { id: 'draftcountdown', name: 'NFL Draft Countdown', kind: 'board', url: ARTICLE_URLS.draftcountdown, load: loadDraftCountdown },
]
const sources = []
for (const l of LOADERS) {
  try {
    const s = await l.load()
    if (!s.entries.length) throw new Error('no players could be read from the page')
    sources.push(s)
    log(`  ${s.name}: ${s.entries.length} players${s.updated ? `, dated ${s.updated}` : ''}`)
  } catch (err) {
    sources.push({ id: l.id, name: l.name, kind: l.kind, url: l.url, updated: null, entries: [], error: String(err.message || err) })
    log(`  ${l.name}: FAILED (${err.message})`)
  }
}

log('Loading college teams')
const [teams, conferences] = await Promise.all([espn.loadCollegeTeams(), espn.loadConferences(SEASON).catch(() => new Map())])
let consensus = buildConsensus(sources, teams, now)

// ---------------------------------------------------------------- who each player is on ESPN
log('Matching players to ESPN rosters')
const rosters = new Map()
const lastOf = (name) => nameKey(name.replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/gi, '').trim().split(' ').slice(1).join(' ') || name)
const firstOf = (name) => nameKey(name.trim().split(' ')[0])
const FAMILY_OF_GROUPS = [['CB', 'S'], ['DL', 'EDGE', 'LB'], ['OT', 'IOL'], ['WR', 'TE'], ['RB'], ['QB'], ['ST']]
const sameArea = (a, b) => !a || !b || a === b || FAMILY_OF_GROUPS.some((g) => g.includes(a) && g.includes(b))

async function resolve(players) {
  const teamIds = [...new Set(players.map((p) => p.teamId).filter((id) => id && !rosters.has(id)))]
  for (let i = 0; i < teamIds.length; i += 6) {
    await Promise.all(teamIds.slice(i, i + 6).map(async (id) => { try { rosters.set(id, await espn.loadCollegeRoster(id)) } catch (err) { log(`  roster ${id}: ${err.message}`) } }))
  }
  const found = new Map()
  for (const p of players) {
    const roster = rosters.get(p.teamId) || []
    const sameLast = roster.filter((a) => lastOf(a.name) === lastOf(p.name))
    const one = (list) => (list.length === 1 ? list[0] : null)
    let hit = roster.find((a) => a.key === p.key)
      // "Cam" for "Cameron": same surname and first initial
      || one(sameLast.filter((a) => a.key[0] === p.key[0]))
      // a nickname inside the given name ("Tae" for "Brauntae")
      || one(sameLast.filter((a) => { const x = firstOf(a.name), y = firstOf(p.name); return y.length >= 3 && (x.includes(y) || y.includes(x)) }))
      // the only player with that surname in that part of the roster ("O.J." for "Romanas")
      || one(sameLast.filter((a) => sameArea(posGroup(a.position), p.group)))
    if (!hit) {
      // Not on the listed school's roster: look the name up. Several players can share a name,
      // so a match must also be at the listed school, unless he is the only one by that name.
      try {
        const cands = (await espn.searchAthlete(p.name)).filter((a) => a.key === p.key)
        const placed = []
        for (const c of cands.slice(0, 4)) placed.push({ ...c, ...(await espn.athleteTeam(c.espnId)) })
        const here = placed.filter((c) => c.teamId && c.teamId === p.teamId)
        const pick = one(here) || (placed.length === 1 && sameArea(posGroup(placed[0].position), p.group) ? placed[0] : null)
        if (pick) hit = { espnId: pick.espnId, name: pick.name, viaSearch: true }
      } catch { /* leave unmatched */ }
    }
    if (hit) found.set(p.key, hit)
  }
  return found
}

// First pass: identify a wider pool, so the same player under a nickname on one list and his
// full name on another is counted once.
const firstPass = await resolve(consensus.ranked.slice(0, BOARD_SIZE + 80))
const alias = {}
for (const [key, hit] of firstPass) { const full = nameKey(hit.name); if (full && full !== key) alias[key] = full }
if (Object.keys(alias).length) consensus = buildConsensus(sources, teams, now, alias)
const byEspnName = new Map([...firstPass].map(([key, hit]) => [alias[key] || key, hit]))
const board = consensus.ranked.slice(0, BOARD_SIZE)
log(`  consensus: ${consensus.sources.filter((s) => s.counted).length} lists counted, ${consensus.considered} names seen, ${consensus.ranked.length} ranked, ${board.length} on the board`)
const missing = board.filter((p) => !byEspnName.has(p.key))
const secondPass = missing.length ? await resolve(missing) : new Map()
const unmatched = []
for (const p of board) {
  const hit = byEspnName.get(p.key) || secondPass.get(p.key)
  if (hit) p.espn = hit
  else unmatched.push(p.name)
}
log(`  ${board.length - unmatched.length} of ${board.length} matched to an ESPN player${Object.keys(alias).length ? `; ${Object.keys(alias).length} listed under more than one name` : ''}${unmatched.length ? `; not found: ${unmatched.join(', ')}` : ''}`)

log('Loading profiles, statistics, game logs and headlines')
const athletes = await espn.loadAthletes(board.map((p) => p.espn?.espnId).filter(Boolean), SEASON)
const failed = Object.values(athletes).filter((a) => a.error).length
if (failed) log(`  ${failed} player files could not be loaded from ESPN`)

log('Loading recruiting classes')
const recruitYears = [SEASON - 5, SEASON - 4, SEASON - 3, SEASON - 2, SEASON - 1]
const recruits = []
for (const y of recruitYears) { try { recruits.push(await espn.loadRecruits(y)) } catch (err) { log(`  recruiting ${y}: ${err.message}`) } }
function recruitFor(p) {
  const id = p.espn?.espnId
  for (const r of [...recruits].reverse()) { const hit = id && r.byAthlete.get(String(id)); if (hit) return hit }
  // Older classes are not linked to college ids; fall back to a unique name match.
  const hits = recruits.flatMap((r) => r.byName.get(p.key) || [])
  return hits.length === 1 ? hits[0] : null
}

// ---------------------------------------------------------------- NFL pick order
log('Working out the pick order')
const [nflTeams, standings, tradeFile] = await Promise.all([espn.loadNflTeams(), espn.loadNflStandings(SEASON), loadTrades(path.resolve('pipeline/traded-picks.json'))])
const schedules = await espn.loadNflSchedules(SEASON, standings)
const order = buildOrder({ standings, schedules, trades: tradeFile.trades, conditional: tradeFile.conditional })
const mockForCheck = sources.find((s) => s.id === 'atoz' && s.entries.length >= 64) || null
const check = crossCheck(order.picks, mockForCheck)
if (check && !check.agrees) log(`  pick ownership differs from ${check.against}: ${check.issues.join('; ')}`)

// ---------------------------------------------------------------- week-over-week movement
const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y = t.getUTCFullYear()
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)
  return `${y}-W${String(w).padStart(2, '0')}`
}
const history = (await readJson(path.join(OUT, 'history.json'))) || { started: today, weeks: [] }
const week = isoWeek(now)

// ---------------------------------------------------------------- assemble
const CLASS = {
  fr: ['Freshman', 1], rfr: ['Redshirt freshman', 2], so: ['Sophomore', 2], soph: ['Sophomore', 2], rso: ['Redshirt sophomore', 3], rssoph: ['Redshirt sophomore', 3],
  jr: ['Junior', 3], rjr: ['Redshirt junior', 4], rsjr: ['Redshirt junior', 4], sr: ['Senior', 4], rsr: ['Redshirt senior', 5], rssr: ['Redshirt senior', 5], gr: ['Graduate', 5],
  freshman: ['Freshman', 1], sophomore: ['Sophomore', 2], junior: ['Junior', 3], senior: ['Senior', 4],
}
const classOf = (...labels) => { for (const l of labels) { const c = CLASS[String(l || '').toLowerCase().replace(/[^a-z]/g, '')]; if (c) return c } return [null, null] }

const STAT_PHRASE = {
  passingyards: 'passing yards', passingtouchdowns: 'touchdown passes', qbr: 'Total QBR', espnqbrating: 'Total QBR', qbrating: 'passer rating',
  rushingyards: 'rushing yards', rushingtouchdowns: 'rushing touchdowns', rushingattempts: 'carries',
  receptions: 'receptions', receivingyards: 'receiving yards', receivingtouchdowns: 'touchdown catches',
  sacks: 'sacks', solotackles: 'solo tackles', totaltackles: 'tackles', interceptions: 'interceptions', passesdefended: 'passes defended', fumblesforced: 'forced fumbles',
}
const sourceById = Object.fromEntries(consensus.sources.map((s) => [s.id, s]))
const usedSlugs = new Set()
const slugFor = (p, school) => {
  let s = slugify(p.name)
  if (usedSlugs.has(s)) s = slugify(`${p.name} ${school || p.rank}`)
  usedSlugs.add(s)
  return s
}

const prevWeek = [...history.weeks].reverse().find((w) => w.week !== week) || null
const dossiers = board.map((p) => {
  const team = teams.byId.get(p.teamId) || null
  const a = p.espn?.espnId ? athletes[p.espn.espnId] : null
  const prof = a && !a.error ? a : null
  const rosterRow = p.espn && !p.espn.viaSearch ? p.espn : null
  // A player found by name search may have moved: trust ESPN's current school for him.
  const school = (prof?.teamId && teams.byId.get(prof.teamId)) || team
  const slug = slugFor(p, school?.school)
  const [cls, clsYear] = classOf(p.facts.cls, rosterRow?.clsAbbr, prof?.cls, rosterRow?.cls)
  const height = rosterRow?.height || p.facts.height || null
  const weight = rosterRow?.weight || p.facts.weight || null
  const first = prof?.first || rosterRow?.first || p.name.split(' ')[0]
  const last = prof?.last || rosterRow?.last || p.name.split(' ').slice(1).join(' ')
  const conf = school ? conferences.get(school.id) : null

  const spots = Object.entries(p.spots).map(([id, v]) => ({ source: id, name: sourceById[id].name, author: sourceById[id].author || null, kind: sourceById[id].kind, rank: v.rank, team: v.team || null, move: v.move || null, url: sourceById[id].url, updated: sourceById[id].updated }))
    .sort((x, y) => x.rank - y.rank)
  const before = prevWeek?.ranks?.[slug] ?? null
  const move = prevWeek ? (before ? before - p.rank : null) : null
  const drafttekMove = p.spots.drafttek?.move ?? null
  const trend = prevWeek ? (before ? { value: move, basis: 'consensus' } : { value: null, basis: 'new' }) : (p.spots.drafttek ? { value: drafttekMove || 0, basis: 'drafttek' } : null)

  const rec = recruitFor(p)
  const stats = (prof?.stats || []).filter((c) => c.seasons.length && (c.totals || []).some((v) => typeof v === 'number' && v !== 0))
    .map((c) => ({ ...c, seasons: c.seasons.map(({ teamId, ...x }) => ({ ...x, team: teams.byId.get(String(teamId))?.abbr || null, school: teams.byId.get(String(teamId))?.school || null })) }))
  const previousSchools = [...new Set(stats.flatMap((c) => c.seasons.map((x) => x.school)).filter(Boolean))].filter((x) => x !== school?.school)
  const line = (prof?.summary || []).slice(0, 4).map((s) => ({ label: s.abbr || s.label, name: s.label, value: s.value, rank: s.rank }))

  const high = spots[0], low = spots[spots.length - 1]
  const insights = []
  insights.push(`Consensus No. ${p.rank} across ${p.sources} published lists (average spot ${p.avg}).`)
  if (spots.length > 1 && high.rank !== low.rank) insights.push(`Highest at No. ${high.rank} (${high.name}), lowest at No. ${low.rank} (${low.name}).`)
  if (trend?.basis === 'consensus' && move) insights.push(`${move > 0 ? 'Up' : 'Down'} ${Math.abs(move)} ${Math.abs(move) === 1 ? 'spot' : 'spots'} on this board since last week.`)
  if (trend?.basis === 'new') insights.push('New to the board this week.')
  if (trend?.basis === 'drafttek' && drafttekMove) insights.push(`Drafttek moved him ${drafttekMove > 0 ? 'up' : 'down'} ${Math.abs(drafttekMove)} in its latest update.`)
  for (const s of (prof?.summary || [])) {
    const phrase = STAT_PHRASE[String(s.key || '').toLowerCase()]
    const m = /^(?:Tied-)?(\d+)(st|nd|rd|th)$/.exec(s.rank || '')
    if (!phrase || !m || Number(m[1]) > 10 || (p.group === 'QB' && /interception/i.test(s.key))) continue
    insights.push(`${s.rank.replace('Tied-', 'Tied for ')} in the FBS in ${phrase} (${s.value}), per ESPN.`)
  }
  if (rec?.rank) insights.push(`ESPN ranked him the No. ${rec.rank} recruit in the ${rec.classYear} class${rec.positionRank ? ` and No. ${rec.positionRank} at his position` : ''}.`)
  if (previousSchools.length) insights.push(`Transferred from ${previousSchools.join(' and ')}.`)

  return {
    id: p.espn?.espnId ? String(p.espn.espnId) : `c-${p.key}`, slug, name: p.name, first, last,
    number: prof?.jersey ?? rosterRow?.jersey ?? null,
    pos: p.group, boardPos: p.boardPos, position: prof?.position || rosterRow?.position || null, positionName: prof?.positionName || rosterRow?.positionName || null,
    unit: GROUP_UNIT[p.group] || 'offense',
    school: school ? { id: school.id, name: school.school, mascot: school.mascot, abbr: school.abbr, color: school.color, altColor: school.altColor, conference: conf?.conference || null, record: conf?.record || null } : null,
    cls, clsYear, height, weight,
    consensus: { rank: p.rank, avg: p.avg, high: p.high, low: p.low, spread: p.spread, sources: p.sources, spots, unlisted: p.unlisted.map((id) => ({ source: id, name: sourceById[id].name, depth: sourceById[id].depth })) },
    move, trend,
    mocks: spots.filter((s) => s.kind === 'mock').map((s) => ({ source: s.name, pick: s.rank, team: s.team, url: s.url, updated: s.updated })),
    line, insights,
    bio: {
      birthPlace: prof?.birthPlaceText || (rosterRow?.birthPlace ? [rosterRow.birthPlace.city, rosterRow.birthPlace.state].filter(Boolean).join(', ') : null),
      hometown: rec?.hometown || null, highSchool: rec?.highSchool || null, previousSchools,
    },
    recruiting: rec ? { classYear: rec.classYear, grade: rec.grade, stars: rec.stars, rank: rec.rank, positionRank: rec.positionRank, stateRank: rec.stateRank, position: rec.position, url: rec.url } : null,
    stats, logs: prof?.logs || {}, summaryLabel: prof?.summaryLabel || null,
    news: prof?.news || [],
    links: compact({ espn: prof?.url || p.espn?.url || null }),
  }
})

// Slot the consensus order into the pick order: pick 1 gets the consensus No. 1, and so on.
const picks = order.picks.map((k, i) => ({ ...k, slug: dossiers[i]?.slug || null }))
for (const k of picks) { const d = dossiers.find((x) => x.slug === k.slug); if (d) d.pick = { pick: k.pick, round: k.round, team: k.team, via: k.via?.from || null, provisional: k.provisional } }

// Rank history: this week's snapshot replaces itself until the week ends.
const ranksNow = Object.fromEntries(dossiers.map((d) => [d.slug, d.consensus.rank]))
const existing = history.weeks.find((w) => w.week === week)
if (!existing) history.weeks.push({ week, date: today, ranks: ranksNow })
else if (JSON.stringify(existing.ranks) !== JSON.stringify(ranksNow)) { existing.ranks = ranksNow; existing.date = today }
history.weeks = history.weeks.slice(-40)
for (const d of dossiers) d.consensus.history = history.weeks.map((w) => ({ week: w.week, date: w.date, rank: w.ranks[d.slug] ?? null })).filter((x) => x.rank !== null)

// ---------------------------------------------------------------- background text
const previousWiki = {}
for (const d of dossiers) { const old = await readJson(path.join(OUT, 'players', `${d.slug}.json`)); if (old?.wiki) previousWiki[d.slug] = old.wiki }
let wikiReached = false
if (process.env.PIPELINE_SKIP_WIKI === '1') {
  log('Skipping Wikipedia (PIPELINE_SKIP_WIKI); keeping existing background text')
  for (const d of dossiers) if (previousWiki[d.slug]?.rules === WIKI_RULES) d.wiki = previousWiki[d.slug]
} else {
  log('Loading Wikipedia backgrounds')
  const res = await loadWiki(dossiers.map((d) => ({ key: d.slug, name: d.name, schools: [d.school?.name, ...d.bio.previousSchools].filter(Boolean) })), previousWiki)
  wikiReached = res.reached
  for (const d of dossiers) if (res.wiki[d.slug]) { d.wiki = res.wiki[d.slug]; d.links.wikipedia = res.wiki[d.slug].url }
  log(`  ${Object.keys(res.wiki).length} of ${dossiers.length} players have background text (${res.reached ? `${res.asked} looked up this run` : 'Wikipedia could not be reached; carried over'})`)
}
for (const d of dossiers) if (d.wiki?.url) d.links.wikipedia = d.wiki.url

// ---------------------------------------------------------------- site-level file
const light = (d) => compact({
  id: d.id, slug: d.slug, name: d.name, first: d.first, last: d.last, number: d.number, pos: d.pos, position: d.position, unit: d.unit,
  school: d.school ? { name: d.school.name, abbr: d.school.abbr, color: d.school.color, conference: d.school.conference } : null,
  cls: d.cls, clsYear: d.clsYear, height: d.height, weight: d.weight,
  rank: d.consensus.rank, avg: d.consensus.avg, high: d.consensus.high, low: d.consensus.low, spread: d.consensus.spread, sources: d.consensus.sources,
  move: d.move, trend: d.trend, pick: d.pick || null, stars: d.recruiting?.stars ?? null, recruitRank: d.recruiting?.rank ?? null,
  line: d.line.map(({ label, value }) => ({ label, value })),
})
const boardList = dossiers.map(light)

const trendValue = (d) => (d.trend && (d.trend.basis === 'consensus' || d.trend.basis === 'drafttek') ? d.trend.value || 0 : 0)
const moverRow = (d) => ({ slug: d.slug, name: d.name, pos: d.pos, school: d.school?.name || null, rank: d.consensus.rank, move: trendValue(d) })
const moving = dossiers.filter((d) => trendValue(d) !== 0)
const tally = (list, keyFn) => Object.entries(list.reduce((m, d) => { const k = keyFn(d); if (k) m[k] = (m[k] || 0) + 1; return m }, {})).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))

const headlines = []
const seenUrl = new Set()
for (const d of dossiers) for (const n of d.news) { if (!n.url || seenUrl.has(n.url)) { const h = headlines.find((x) => x.url === n.url); if (h && !h.players.includes(d.slug)) h.players.push(d.slug); continue } seenUrl.add(n.url); headlines.push({ ...n, players: [d.slug] }) }
headlines.sort((a, b) => String(b.published).localeCompare(String(a.published)))

const nflRecord = Object.fromEntries(standings.map((t) => [t.abbr, t]))
const draft = {
  generatedAt: now.toISOString(), season: SEASON, draftYear: DRAFT_YEAR, boardSize: dossiers.length, picks: PICKS,
  method: { minSources: MIN_SOURCES, staleDays: STALE_DAYS, considered: consensus.considered, ranked: consensus.ranked.length },
  sources: consensus.sources.map(({ ageDays, ...s }) => s),
  linkOnly: LINK_ONLY, dataSources: DATA_SOURCES,
  order: {
    picks,
    crossCheck: check,
    trades: [...tradeFile.trades.map((t) => ({ round: t.round, from: t.original, to: t.owner, note: t.note, source: t.source })), ...tradeFile.conditional.map((t) => ({ round: t.round, from: t.from.join(' or '), to: t.owner, note: t.note, source: t.source, conditional: true }))],
    tradesChecked: tradeFile.checked,
    playoffField: order.playoffField,
  },
  nflTeams: Object.fromEntries(Object.keys(NFL_TEAMS).map((abbr) => {
    const t = nflTeams[abbr] || {}, r = nflRecord[abbr]
    return [abbr, { abbr, name: NFL_TEAMS[abbr], nickname: t.nickname || NFL_TEAMS[abbr].split(' ').pop(), color: t.color || '#5b6878', altColor: t.altColor || '#c3ccd4', record: r ? `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}` : null, sos: order.sos[abbr] ?? null }]
  })),
  movement: {
    basis: prevWeek ? 'consensus' : 'drafttek', since: prevWeek?.date || null, started: history.started, weeks: history.weeks.length,
    risers: [...moving].filter((d) => trendValue(d) > 0).sort((a, b) => trendValue(b) - trendValue(a) || a.consensus.rank - b.consensus.rank).slice(0, 12).map(moverRow),
    fallers: [...moving].filter((d) => trendValue(d) < 0).sort((a, b) => trendValue(a) - trendValue(b) || a.consensus.rank - b.consensus.rank).slice(0, 12).map(moverRow),
    added: prevWeek ? dossiers.filter((d) => d.trend?.basis === 'new').map(moverRow) : [],
    dropped: prevWeek ? Object.entries(prevWeek.ranks).filter(([slug]) => !ranksNow[slug]).sort((a, b) => a[1] - b[1]).map(([slug, rank]) => ({ slug, rank })) : [],
  },
  breakdown: {
    positions: { picks: tally(dossiers.slice(0, PICKS), (d) => d.pos), board: tally(dossiers, (d) => d.pos) },
    schools: tally(dossiers, (d) => d.school?.name).slice(0, 16),
    conferences: tally(dossiers, (d) => d.school?.conference).slice(0, 10),
    classes: tally(dossiers, (d) => d.cls),
  },
  headlines: headlines.slice(0, 40),
  coverage: {
    matched: dossiers.filter((d) => !d.id.startsWith('c-')).length, withStats: dossiers.filter((d) => d.stats.length).length, withLogs: dossiers.filter((d) => Object.keys(d.logs).length).length,
    withRecruiting: dossiers.filter((d) => d.recruiting).length, withBackground: dossiers.filter((d) => d.wiki?.intro).length, withHeadlines: dossiers.filter((d) => d.news.length).length,
    unmatched,
  },
}

// ---------------------------------------------------------------- write
// Skip the write when nothing but the timestamp would change, so scheduled runs only
// produce a commit (and a redeploy) when the data really moved.
const files = new Map([
  ['draft.json', draft],
  ['board.json', boardList],
  ['history.json', history],
  ...dossiers.map((d) => [`players/${d.slug}.json`, d]),
])
const stable = (obj) => JSON.stringify(compact(obj), (k, v) => (k === 'generatedAt' ? undefined : v))
const hash = crypto.createHash('sha256')
for (const [name, data] of [...files].sort((a, b) => a[0].localeCompare(b[0]))) hash.update(name).update(stable(data))
const contentHash = hash.digest('hex').slice(0, 20)
const previous = await readJson(path.join(OUT, 'meta.json'))
if (previous?.contentHash === contentHash && process.env.PIPELINE_FORCE !== '1') {
  log(`No changes since ${previous.generatedAt}; nothing written`)
} else {
  log('Writing files')
  await fs.mkdir(path.join(OUT, 'players'), { recursive: true })
  const write = (file, data) => fs.writeFile(path.join(OUT, file), JSON.stringify(compact(data)))
  await Promise.all([...files].map(([name, data]) => write(name, data)))
  // Remove the files of players who have dropped off the board.
  for (const f of await fs.readdir(path.join(OUT, 'players'))) {
    if (!files.has(`players/${f}`)) await fs.rm(path.join(OUT, 'players', f))
  }
  await write('meta.json', { generatedAt: draft.generatedAt, contentHash, season: SEASON, draftYear: DRAFT_YEAR, players: dossiers.length, wikipediaReached: wikiReached })
  const size = async (f) => (await fs.stat(path.join(OUT, f))).size
  log(`Done: ${dossiers.length} player files, draft.json ${(await size('draft.json') / 1024).toFixed(0)} KB, board.json ${(await size('board.json') / 1024).toFixed(0)} KB`)
}
void ordinal; void round
