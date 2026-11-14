// Sanity checks on the generated data. Run after `npm run data`; a failure stops a scheduled
// refresh from publishing a broken build when a source has a bad day.
import fs from 'node:fs/promises'
import path from 'node:path'

const DIR = path.resolve('public/data')
const read = async (f) => JSON.parse(await fs.readFile(path.join(DIR, f), 'utf8'))
const problems = []
const check = (ok, message) => { if (!ok) problems.push(message) }

const draft = await read('draft.json')
const board = await read('board.json')
const history = await read('history.json')
const counted = draft.sources.filter((s) => s.counted)
const picks = draft.order?.picks || []

check(board.length >= 140 && board.length <= 150, `board size looks wrong: ${board.length}`)
check(counted.length >= 4, `only ${counted.length} published lists counted toward the consensus`)
check(counted.filter((s) => s.kind === 'board' && s.depth >= 140).length >= 2, 'fewer than two deep boards were readable')
check(board.every((p) => p.name && p.slug && p.pos && p.rank), 'a board entry is missing its name, slug, position or rank')
check(new Set(board.map((p) => p.slug)).size === board.length, 'duplicate player slugs')
check(new Set(board.map((p) => p.id)).size === board.length, 'the same player appears twice on the board')
check(board.every((p, i) => p.rank === i + 1), 'board ranks are not consecutive')
check(board.every((p) => p.sources >= 2), 'a player is ranked on fewer than two lists')
check(board.slice(0, 32).every((p) => p.sources >= 3), 'a first-round projection rests on fewer than three lists')
check(board.filter((p) => p.school).length >= board.length - 3, 'several players have no school')
check(board.filter((p) => p.height && p.weight).length >= board.length * 0.9, 'many players are missing height or weight')
check(picks.length === 64, `expected 64 picks, found ${picks.length}`)
check(picks.every((k) => k.team && k.slug && draft.nflTeams[k.team]), 'a pick is missing its club or player')
check(new Set(picks.map((k) => k.slug)).size === picks.length, 'a player is slotted at two picks')
check(Object.keys(draft.nflTeams).length === 32, 'the club list does not cover 32 teams')
check(draft.coverage.matched >= board.length * 0.9, `only ${draft.coverage.matched} players matched an ESPN profile`)
check(draft.coverage.withStats >= board.length * 0.7, `only ${draft.coverage.withStats} players have statistics`)
check(history.weeks?.length >= 1, 'rank history is empty')

let files = 0
for (const p of board) {
  try {
    const d = await read(`players/${p.slug}.json`)
    files++
    check(d.name === p.name && d.consensus?.rank === p.rank, `player file / board mismatch for ${p.slug}`)
    check((d.consensus?.spots || []).every((s) => s.url && s.name), `a ranking for ${p.slug} has no source link`)
  } catch {
    problems.push(`missing player file for ${p.slug}`)
  }
}

if (problems.length) {
  console.error(`Data check failed:\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
const cross = draft.order.crossCheck
console.log(`Data check passed: ${board.length} players from ${counted.length} lists, ${picks.length} picks, ${files} player files, ${draft.coverage.withBackground} with background text, ${history.weeks.length} week(s) of history.${cross ? ` Pick ownership ${cross.agrees ? 'agrees' : 'DIFFERS'} with ${cross.against}.` : ''}`)
if (cross && !cross.agrees) console.warn(`Pick ownership differences (a trade may be missing from pipeline/traded-picks.json):\n- ${cross.issues.join('\n- ')}`)
