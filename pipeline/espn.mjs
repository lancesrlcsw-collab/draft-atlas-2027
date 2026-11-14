// ESPN's public JSON endpoints: college rosters, player profiles, statistics, game logs,
// headlines and recruiting grades, plus the NFL standings that set the pick order.
import { getJSON, pool } from './lib/http.mjs'
import { nameKey } from './lib/util.mjs'

const CFB = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football'
const CFB_WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/football/college-football'
const CFB_CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football'
const NFL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'

// ---------------------------------------------------------------- schools

/** Spellings the boards use that differ from ESPN's school names. */
const SCHOOL_ALIAS = {
  miamifl: 'miami', miamiflorida: 'miami', miamifla: 'miami', missstate: 'mississippistate', missst: 'mississippistate', uga: 'georgia', pitt: 'pittsburgh', ncstate: 'ncstate', northcarolinastate: 'ncstate', mississippi: 'olemiss',
  southerncalifornia: 'usc', southerncal: 'usc', centralflorida: 'ucf', brighamyoung: 'byu', texaschristian: 'tcu', southernmethodist: 'smu', louisianastate: 'lsu',
  pennst: 'pennstate', ohiost: 'ohiostate', michiganst: 'michiganstate', floridast: 'floridastate', arizonast: 'arizonastate', oklahomast: 'oklahomastate',
  oregonst: 'oregonstate', iowast: 'iowastate', kansasst: 'kansasstate', mississippist: 'mississippistate', washingtonst: 'washingtonstate', boisest: 'boisestate',
  sandiegost: 'sandiegostate', fresnost: 'fresnostate', coloradost: 'coloradostate', utahst: 'utahstate', appalachianstate: 'appstate', connecticut: 'uconn',
  hawaii: 'hawaii', usf: 'southflorida', umass: 'massachusetts', fiu: 'floridainternational', utsa: 'utsa', unlv: 'unlv', cal: 'california', bc: 'bostoncollege',
  texasam: 'texasam', texasaandm: 'texasam', tamu: 'texasam', nd: 'notredame', bama: 'alabama', louisianalafayette: 'louisiana', ulm: 'ulmonroe',
  southernmississippi: 'southernmiss', army: 'army', armywestpoint: 'army', miamioh: 'miamioh', miamiohio: 'miamioh', sanjosestate: 'sanjosestate',
}

export function schoolKey(name) {
  const k = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '')
  const base = k.replace(/^the/, '')
  return SCHOOL_ALIAS[base] || SCHOOL_ALIAS[base.replace(/and/g, '')] || base
}

export async function loadCollegeTeams() {
  const out = { byKey: new Map(), byId: new Map(), byFullKey: new Map() }
  for (let page = 1; page <= 6; page++) {
    const j = await getJSON(`${CFB}/teams?limit=500&page=${page}`, { ttlHours: 24 * 7 })
    const list = j?.sports?.[0]?.leagues?.[0]?.teams || []
    for (const { team: t } of list) {
      const team = { id: t.id, school: t.location, mascot: t.name, name: t.displayName, abbr: t.abbreviation, color: t.color ? `#${t.color}` : null, altColor: t.alternateColor ? `#${t.alternateColor}` : null }
      if (out.byId.has(team.id)) continue
      out.byId.set(team.id, team)
      for (const k of new Set([schoolKey(t.location), schoolKey(t.shortDisplayName), schoolKey(t.nickname)])) if (k && !out.byKey.has(k)) out.byKey.set(k, team)
      out.byFullKey.set(schoolKey(t.displayName), team)
    }
    if (list.length < 500) break
  }
  return out
}

/** Conference names for each school, from the standings tree. */
export async function loadConferences(season) {
  const out = new Map()
  const j = await getJSON(`https://site.api.espn.com/apis/v2/sports/football/college-football/standings?season=${season}&group=80`, { ttlHours: 24 })
  const walk = (node, conf) => {
    const here = node.standings?.entries?.length ? (node.shortName || node.name || conf) : conf
    for (const e of node.standings?.entries || []) {
      const s = Object.fromEntries((e.stats || []).map((x) => [x.name || x.type, x]))
      out.set(e.team.id, { conference: conf || here, record: s.overall?.displayValue || s.total?.displayValue || null })
    }
    for (const c of node.children || []) walk(c, node.isConference || !conf ? (c.shortName || c.name) : conf)
  }
  for (const c of j?.children || []) walk(c, c.shortName || c.name)
  return out
}

export async function loadCollegeRoster(teamId) {
  const j = await getJSON(`${CFB}/teams/${teamId}/roster?limit=300`, { ttlHours: 12 })
  const athletes = []
  for (const group of j?.athletes || []) {
    for (const a of group.items || []) {
      athletes.push({
        espnId: a.id, name: a.fullName || a.displayName, first: a.firstName, last: a.lastName, key: nameKey(a.fullName || a.displayName),
        jersey: a.jersey != null && a.jersey !== '' ? Number(a.jersey) : null, position: a.position?.abbreviation || null, positionName: a.position?.displayName || null,
        height: a.height ?? null, weight: a.weight ?? null,
        cls: a.experience?.displayValue || null, clsAbbr: a.experience?.abbreviation || null, years: a.experience?.years ?? null,
        birthPlace: a.birthPlace ? { city: a.birthPlace.city || null, state: a.birthPlace.state || null, country: a.birthPlace.country || null } : null,
        url: a.links?.find((l) => l.rel?.includes('playercard'))?.href || null,
      })
    }
  }
  return athletes
}

/** Fallback when a player is not on the roster his board lists (a transfer, or a spelling). */
export async function searchAthlete(name) {
  const j = await getJSON(`https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(name)}&limit=8&type=player&sport=football&league=college-football`, { ttlHours: 24 })
  return (j?.items || []).filter((i) => i.league === 'college-football').map((i) => ({ espnId: i.id, name: i.displayName, key: nameKey(i.displayName) }))
}

/** The school a player is currently listed with. */
export async function athleteTeam(id) {
  const j = await getJSON(`${CFB_WEB}/athletes/${id}`, { ttlHours: 6 })
  return { teamId: j?.athlete?.team?.id || null, position: j?.athlete?.position?.abbreviation || null }
}

const article = (a) => ({
  headline: a.headline, description: a.description || null, published: a.published || a.lastModified || null,
  url: a.links?.web?.href || null, type: a.type || null, byline: a.byline || null, source: 'ESPN',
})

const numeric = (v) => {
  if (v === null || v === undefined || v === '' || v === '-' || v === '--') return null
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : String(v)
}

/** Season-by-season statistics, one table per category (passing, rushing, defense ...). */
function parseStats(j) {
  const teams = j?.teams || {}
  return (j?.categories || []).filter((c) => c.statistics?.length).map((c) => ({
    key: c.name, title: c.displayName, labels: c.labels || [], names: c.names || [], displayNames: c.displayNames || [],
    seasons: c.statistics.map((s) => ({ year: s.season?.year, team: teams[s.teamId]?.abbreviation || s.teamSlug || null, teamId: s.teamId || null, position: s.position || null, values: (s.stats || []).map(numeric) })),
    totals: c.totals ? c.totals.map(numeric) : null,
  }))
}

/** Kickoff times arrive in UTC; a Saturday night game is still Saturday where it was played. */
const easternDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

/** One season's game log: every game with its opponent, result and the stat columns ESPN lists. */
function parseGameLog(j) {
  if (!j?.labels?.length) return null
  const events = j.events || {}
  const games = []
  for (const st of j.seasonTypes || []) {
    for (const cat of st.categories || []) {
      for (const e of cat.events || []) {
        const ev = events[e.eventId]
        if (!ev) continue
        games.push({
          id: e.eventId, date: ev.gameDate ? easternDate(ev.gameDate) : null, week: ev.week ?? null, type: /post|bowl|playoff/i.test(st.displayName || '') ? 'post' : 'reg',
          home: ev.atVs === 'vs', opp: ev.opponent?.abbreviation || null, oppName: ev.opponent?.displayName || null,
          result: ev.gameResult || null, score: ev.score || null, values: (e.stats || []).map(numeric),
        })
      }
    }
  }
  games.sort((a, b) => String(a.date).localeCompare(String(b.date)))
  // ESPN groups columns under category headings (Receiving, Rushing ...).
  const groups = (j.categories || []).map((c) => ({ title: c.displayName, count: c.count }))
  return { labels: j.labels, names: j.names || [], displayNames: j.displayNames || [], groups, games }
}

/** Everything ESPN carries for one college player. */
export async function loadAthlete(id, season) {
  const [a, o, s, g] = await Promise.all([
    getJSON(`${CFB_WEB}/athletes/${id}`, { ttlHours: 6 }),
    getJSON(`${CFB_WEB}/athletes/${id}/overview`, { ttlHours: 3 }),
    getJSON(`${CFB_WEB}/athletes/${id}/stats`, { ttlHours: 3 }),
    getJSON(`${CFB_WEB}/athletes/${id}/gamelog?season=${season}`, { ttlHours: 3 }),
  ])
  const ath = a?.athlete || {}
  const stats = parseStats(s)
  // Earlier seasons' game logs are final, so they can be cached for a long time.
  const earlier = [...new Set(stats.flatMap((c) => c.seasons.map((x) => x.year)))].filter((y) => y && y < season).sort((x, y) => y - x).slice(0, 2)
  const past = await Promise.all(earlier.map((y) => getJSON(`${CFB_WEB}/athletes/${id}/gamelog?season=${y}`, { ttlHours: 24 * 14 })))
  const logs = {}
  const cur = parseGameLog(g)
  if (cur?.games.length) logs[season] = cur
  earlier.forEach((y, i) => { const l = parseGameLog(past[i]); if (l?.games.length) logs[y] = l })
  return {
    espnId: String(id), name: ath.displayName || ath.fullName || null, first: ath.firstName || null, last: ath.lastName || null,
    jersey: ath.jersey != null && ath.jersey !== '' ? Number(ath.jersey) : null,
    position: ath.position?.abbreviation || null, positionName: ath.position?.displayName || null,
    teamId: ath.team?.id || null, cls: ath.displayExperience || null, birthPlaceText: ath.displayBirthPlace || null,
    heightText: ath.displayHeight || null, weightText: ath.displayWeight || null, status: ath.status?.name || null,
    summary: (ath.statsSummary?.statistics || []).map((x) => ({ key: x.name, name: x.name, label: x.shortDisplayName || x.displayName, abbr: x.abbreviation, value: x.displayValue, rank: x.rankDisplayValue || null })),
    summaryLabel: ath.statsSummary?.displayName || null,
    url: ath.links?.find((l) => l.rel?.includes('playercard'))?.href || `https://www.espn.com/college-football/player/_/id/${id}`,
    news: (o?.news || []).filter((n) => n.links?.web?.href && n.type !== 'Media').slice(0, 10).map(article),
    stats, logs,
  }
}

export async function loadAthletes(ids, season) {
  const out = {}
  await pool(ids, 4, async (id) => {
    try { out[id] = await loadAthlete(id, season) } catch (err) { out[id] = { error: String(err.message || err) } }
  })
  return out
}

/** ESPN's recruiting database for one signing class, keyed by the player's later college id. */
export async function loadRecruits(year) {
  const byAthlete = new Map()
  const byName = new Map()
  let page = 1, pages = 1
  while (page <= pages && page <= 12) {
    const j = await getJSON(`${CFB_CORE}/recruiting/${year}/athletes?limit=500&page=${page}`, { ttlHours: 24 * 30 })
    if (!j) break
    pages = j.pageCount || 1
    for (const r of j.items || []) {
      const a = r.athlete || {}
      const attr = Object.fromEntries((r.attributes || []).map((x) => [x.name, x.value]))
      const rec = {
        classYear: r.recruitingClass || year, name: a.fullName, position: a.position?.abbreviation || null,
        highSchool: a.highSchool?.name || null, hometown: a.hometown ? [a.hometown.city, a.hometown.stateAbbreviation || a.hometown.state].filter(Boolean).join(', ') : null,
        grade: r.grade ?? null, stars: null, rank: attr.rank || null, positionRank: attr.positionRank || null, stateRank: attr.stateRank || null,
        url: a.links?.find((l) => l.rel?.includes('playercard'))?.href || (a.id ? `https://www.espn.com/college-sports/football/recruiting/player/_/id/${a.id}` : null),
      }
      // ESPN's published star bands for its recruiting grades.
      if (rec.grade) rec.stars = rec.grade >= 90 ? 5 : rec.grade >= 80 ? 4 : rec.grade >= 70 ? 3 : rec.grade >= 60 ? 2 : 1
      if (a.alternateId) byAthlete.set(String(a.alternateId), rec)
      const k = nameKey(a.fullName)
      if (!byName.has(k)) byName.set(k, [])
      byName.get(k).push(rec)
    }
    page++
  }
  return { byAthlete, byName }
}

// ---------------------------------------------------------------- NFL

export async function loadNflTeams() {
  const j = await getJSON(`${NFL}/teams?limit=40`, { ttlHours: 24 * 7 })
  const out = {}
  for (const { team: t } of j?.sports?.[0]?.leagues?.[0]?.teams || []) {
    out[t.abbreviation] = { abbr: t.abbreviation, espnId: t.id, name: t.displayName, location: t.location, nickname: t.name, color: `#${t.color}`, altColor: `#${t.alternateColor}` }
  }
  return out
}

export async function loadNflStandings(season) {
  const j = await getJSON(`https://site.api.espn.com/apis/v2/sports/football/nfl/standings?season=${season}&level=3`, { ttlHours: 2 })
  const teams = []
  for (const conf of j?.children || []) {
    for (const d of conf.children || []) {
      for (const e of d.standings?.entries || []) {
        const s = Object.fromEntries((e.stats || []).map((x) => [x.name || x.type, x]))
        const val = (k) => s[k]?.value ?? null
        teams.push({
          abbr: e.team.abbreviation, espnId: e.team.id, name: e.team.displayName, conference: conf.abbreviation, division: d.name,
          wins: val('wins') ?? 0, losses: val('losses') ?? 0, ties: val('ties') ?? 0, pct: val('winPercent') ?? 0,
          seed: val('playoffSeed'), pointDiff: val('pointDifferential') ?? val('differential') ?? 0,
          divisionLeader: false,
        })
      }
    }
  }
  return teams
}

/** Each club's season schedule with results so far, for the strength-of-schedule tiebreak. */
export async function loadNflSchedules(season, teams) {
  const out = {}
  await pool(teams, 4, async (t) => {
    const j = await getJSON(`${NFL}/teams/${t.espnId}/schedule?season=${season}`, { ttlHours: 6 })
    out[t.abbr] = (j?.events || []).map((e) => {
      const c = e.competitions?.[0] || {}
      const them = c.competitors?.find((x) => x.team?.id !== t.espnId)
      return them?.team?.abbreviation || null
    }).filter(Boolean)
  })
  return out
}
