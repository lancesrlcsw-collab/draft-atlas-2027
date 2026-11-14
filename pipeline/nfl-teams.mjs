// The 32 NFL clubs, by the abbreviations ESPN uses. Colors come from ESPN at build time.
export const NFL_TEAMS = {
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills', CAR: 'Carolina Panthers', CHI: 'Chicago Bears',
  CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns', DAL: 'Dallas Cowboys', DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers',
  HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', KC: 'Kansas City Chiefs', LV: 'Las Vegas Raiders', LAC: 'Los Angeles Chargers',
  LAR: 'Los Angeles Rams', MIA: 'Miami Dolphins', MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants',
  NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers', SF: 'San Francisco 49ers', SEA: 'Seattle Seahawks', TB: 'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans', WSH: 'Washington Commanders',
}
const BY_NAME = Object.fromEntries(Object.entries(NFL_TEAMS).map(([abbr, name]) => [name.toLowerCase(), abbr]))
const NAMES = Object.values(NFL_TEAMS).sort((a, b) => b.length - a.length)

export const nflAbbr = (name) => BY_NAME[String(name || '').toLowerCase().replace(/\s+/g, ' ').trim()] || null

const POSITION = /^(QB|RB|HB|FB|WR|TE|OT|T|OL|IOL|OG|G|C|OC|DL|DT|NT|IDL|DI|DE|EDGE|ED|LB|ILB|OLB|MLB|CB|DB|NB|S|FS|SS|K|P|LS|[A-Z0-9-]+\/[A-Z0-9-]+|\d-\dDE|\d-\dOLB)$/

/**
 * Read one mock-draft line that starts with a club name: "Tennessee Titans: Colin Simmons, LB, Texas".
 * Writers punctuate these loosely, so commas and the colon are all optional.
 */
export function parsePickLine(line) {
  const t = String(line || '').replace(/\s+/g, ' ').trim()
  const team = NAMES.find((n) => t.toLowerCase().startsWith(n.toLowerCase()))
  if (!team) return null
  const rest = t.slice(team.length).replace(/^\s*[:,–-]\s*/, '').trim()
  let parts = rest.split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length < 3) {
    // No commas: find the position token and split around it.
    const words = rest.replace(/,/g, ' ').split(' ').filter(Boolean)
    const i = words.findIndex((w, k) => k >= 2 && POSITION.test(w))
    if (i < 0) return null
    parts = [words.slice(0, i).join(' '), words[i], words.slice(i + 1).join(' ')]
  }
  const [name, pos, ...school] = parts
  if (!name || !pos || !school.length) return null
  return { team: nflAbbr(team), teamName: team, name, pos, school: school.join(', ').replace(/\s*\(.*$/, '').trim() }
}
