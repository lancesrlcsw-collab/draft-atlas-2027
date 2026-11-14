// Turn several published boards and mock drafts into one consensus order.
//
// Method, in plain terms:
//   1. Every list is read as "this outlet put this player at this spot".
//   2. A player's consensus number is the average of his spots across the lists that are
//      still current. If a board runs deep enough that he should be on it and he is not,
//      that board counts as one spot past its last player.
//   3. Players are ordered by that average. Only rank numbers are used; no outlet's
//      grades, write-ups or comparisons are collected.
import { nameKey, round } from './lib/util.mjs'
import { plain } from './lib/html.mjs'
import { MIN_SOURCES, STALE_DAYS, posGroup } from './config.mjs'
import { schoolKey } from './espn.mjs'


const firstInitial = (name) => nameKey(name.split(' ')[0])[0] || ''
const lastKey = (name) => nameKey(name.replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/gi, '').trim().split(' ').slice(1).join(' ') || name)

/** @param alias name keys that are known to be the same player under another spelling or a nickname */
export function buildConsensus(sources, teams, now = new Date(), alias = {}) {
  const today = now.toISOString().slice(0, 10)
  const meta = sources.map((s) => {
    const ageDays = s.updated ? Math.round((Date.parse(today) - Date.parse(s.updated)) / 864e5) : null
    const stale = ageDays !== null && ageDays > STALE_DAYS
    return { id: s.id, name: s.name, author: s.author, kind: s.kind, url: s.url, title: s.title || null, note: s.note || null, updated: s.updated || null, ageDays, stale, depth: s.entries.length, error: s.error || null, counted: !stale && s.entries.length > 0 }
  })
  const counted = sources.filter((s) => meta.find((m) => m.id === s.id).counted)

  const entities = []
  const byName = new Map()
  const byLoose = new Map()
  const teamOf = (e) => (e.schoolFull ? teams.byFullKey.get(schoolKey(e.schoolFull)) : teams.byKey.get(schoolKey(e.school))) || null

  for (const s of counted) {
    for (const e of s.entries) {
      const name = plain(e.name)
      const key = alias[nameKey(name)] || nameKey(name)
      if (!key) continue
      const team = teamOf(e)
      const group = posGroup(e.pos)
      const loose = `${lastKey(name)}|${team?.id || '?'}|${group}|${firstInitial(name)}`
      let ent = (byName.get(key) || []).find((x) => !team || !x.teamId || x.teamId === team.id || x.group === group)
      // "Cam" on one board and "Cameron" on another: same surname, school, position and initial.
      if (!ent && team && group) { const c = byLoose.get(loose) || []; if (c.length === 1) ent = c[0] }
      if (!ent) {
        ent = { key, names: new Map(), teamVotes: new Map(), teamId: null, groupVotes: new Map(), group: null, posVotes: new Map(), spots: {}, facts: {} }
        entities.push(ent)
        if (!byName.has(key)) byName.set(key, [])
        byName.get(key).push(ent)
      }
      if (ent.spots[s.id]) continue // a list names a player once
      ent.spots[s.id] = { rank: e.rank, ...(e.team ? { team: e.team } : {}), ...(e.move ? { move: e.move } : {}) }
      ent.names.set(name, (ent.names.get(name) || 0) + 1)
      if (team) { ent.teamVotes.set(team.id, (ent.teamVotes.get(team.id) || 0) + 1); ent.teamId = [...ent.teamVotes].sort((a, b) => b[1] - a[1])[0][0] }
      if (group) { ent.groupVotes.set(group, (ent.groupVotes.get(group) || 0) + 1); ent.group = [...ent.groupVotes].sort((a, b) => b[1] - a[1])[0][0] }
      if (e.pos) ent.posVotes.set(e.pos, (ent.posVotes.get(e.pos) || 0) + 1)
      for (const f of ['height', 'weight', 'cls']) if (e[f] && !ent.facts[f]) ent.facts[f] = e[f]
      if (team && group) { if (!byLoose.has(loose)) byLoose.set(loose, []); if (!byLoose.get(loose).includes(ent)) byLoose.get(loose).push(ent) }
    }
  }

  const boards = counted.filter((s) => s.kind === 'board')
  const ranked = []
  for (const ent of entities) {
    const listed = Object.entries(ent.spots)
    if (listed.length < MIN_SOURCES) continue
    const ranks = listed.map(([, v]) => v.rank)
    const provisional = ranks.reduce((a, b) => a + b, 0) / ranks.length
    const imputed = []
    for (const b of boards) {
      if (ent.spots[b.id]) continue
      const depth = b.entries.length
      if (depth >= provisional) imputed.push({ id: b.id, rank: depth + 1 })
    }
    const all = [...ranks, ...imputed.map((i) => i.rank)]
    const avg = all.reduce((a, b) => a + b, 0) / all.length
    const mean = ranks.reduce((a, b) => a + b, 0) / ranks.length
    const sd = Math.sqrt(ranks.reduce((a, b) => a + (b - mean) ** 2, 0) / ranks.length)
    const name = [...ent.names].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0]
    ranked.push({
      key: ent.key, name, teamId: ent.teamId, group: ent.group, boardPos: [...ent.posVotes].sort((a, b) => b[1] - a[1])[0]?.[0] || null,
      avg: round(avg, 2), high: Math.min(...ranks), low: Math.max(...ranks), spread: round(sd, 1), sources: listed.length,
      spots: ent.spots, unlisted: imputed.map((i) => i.id), facts: ent.facts,
    })
  }
  ranked.sort((a, b) => a.avg - b.avg || b.sources - a.sources || a.high - b.high || a.name.localeCompare(b.name))
  ranked.forEach((p, i) => { p.rank = i + 1 })
  return { sources: meta, ranked, considered: entities.length }
}
