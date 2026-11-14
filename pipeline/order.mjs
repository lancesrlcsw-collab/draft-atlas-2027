// The order NFL clubs would pick in if the season ended today.
//
// Clubs outside the playoff field pick first, worst record first; ties go to the club that has
// faced the weaker schedule. Clubs currently holding a playoff seed fill the rest, again by
// record. The real order of those last picks depends on playoff results, so it is provisional.
// From the second round on, clubs with the same record take turns at the front of their group.
import fs from 'node:fs/promises'
import { round } from './lib/util.mjs'
import { PICKS } from './config.mjs'

const pct = (t) => (t.wins + t.ties * 0.5) / Math.max(1, t.wins + t.losses + t.ties)

export function strengthOfSchedule(teams, schedules) {
  const rec = Object.fromEntries(teams.map((t) => [t.abbr, t]))
  const out = {}
  for (const t of teams) {
    let w = 0, g = 0
    for (const opp of schedules[t.abbr] || []) {
      const o = rec[opp]
      if (!o) continue
      w += o.wins + o.ties * 0.5
      g += o.wins + o.losses + o.ties
    }
    out[t.abbr] = g ? round(w / g, 4) : 0.5
  }
  return out
}

function rotate(group, by) {
  const k = by % group.length
  return [...group.slice(k), ...group.slice(0, k)]
}

export function buildOrder({ standings, schedules, trades, conditional = [] }) {
  const sos = strengthOfSchedule(standings, schedules)
  const sorter = (a, b) => pct(a) - pct(b) || sos[a.abbr] - sos[b.abbr] || a.pointDiff - b.pointDiff || a.abbr.localeCompare(b.abbr)
  const inField = (t) => t.seed !== null && t.seed !== undefined && t.seed <= 7
  const out = standings.filter((t) => !inField(t)).sort(sorter)
  const field = standings.filter(inField).sort(sorter)
  const rounds = Math.ceil(PICKS / 32)
  const picks = []
  for (let r = 1; r <= rounds; r++) {
    const order = []
    for (const block of [out, field]) {
      let i = 0
      while (i < block.length) {
        let j = i
        while (j < block.length && Math.abs(pct(block[j]) - pct(block[i])) < 1e-9) j++
        order.push(...rotate(block.slice(i, j), r - 1))
        i = j
      }
    }
    order.forEach((t, i) => {
      const trade = trades.find((x) => x.round === r && x.original === t.abbr)
      picks.push({
        pick: (r - 1) * 32 + i + 1, round: r, slot: i + 1, original: t.abbr, team: trade ? trade.owner : t.abbr,
        via: trade ? { from: t.abbr, note: trade.note || null, source: trade.source || null } : null,
        record: `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ''}`, provisional: inField(t),
      })
    })
  }
  // "The better of two picks" deals: decided by where the two picks stand today.
  for (const c of conditional) {
    const pair = picks.filter((p) => p.round === c.round && c.from.includes(p.original)).sort((a, b) => a.pick - b.pick)
    if (pair.length < 2) continue
    const goes = c.takes === 'earlier' ? pair[0] : pair[pair.length - 1]
    goes.viaChain = goes.via
    goes.team = c.owner
    goes.via = { from: goes.original, note: c.note || null, source: c.source || null, conditional: true }
  }
  for (const p of picks) delete p.viaChain
  return { picks: picks.slice(0, PICKS), sos, playoffField: field.map((t) => t.abbr) }
}

export async function loadTrades(file) {
  const j = JSON.parse(await fs.readFile(file, 'utf8'))
  return { trades: j.trades || [], conditional: j.conditional || [], checked: j.checked || null, method: j.method || null }
}

/** Compare who holds how many picks in each round with a published mock that lists a club per pick. */
export function crossCheck(picks, mock) {
  if (!mock?.entries?.length) return null
  const issues = []
  for (const r of [1, 2]) {
    const ours = {}, theirs = {}
    for (const p of picks.filter((x) => x.round === r)) ours[p.team] = (ours[p.team] || 0) + 1
    const listed = mock.entries.filter((e) => Math.ceil(e.rank / 32) === r && e.team)
    if (listed.length < 32) continue
    for (const e of listed) theirs[e.team] = (theirs[e.team] || 0) + 1
    for (const t of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
      if ((ours[t] || 0) !== (theirs[t] || 0)) issues.push(`Round ${r}: this site gives ${t} ${ours[t] || 0} pick(s), ${mock.name} lists ${theirs[t] || 0}`)
    }
  }
  return { against: mock.name, url: mock.url, agrees: issues.length === 0, issues }
}
