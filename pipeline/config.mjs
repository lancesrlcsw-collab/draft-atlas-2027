// Project-level constants for the data build.
export const SEASON = Number(process.env.SEASON || 2026) // the college and NFL season being played
export const DRAFT_YEAR = SEASON + 1
export const BOARD_SIZE = 150 // players tracked on the board
export const PICKS = 64 // the first two rounds
/** A published list older than this no longer counts toward the consensus (it is still linked). */
export const STALE_DAYS = 45
/** A player needs this many independent lists behind him to be ranked. */
export const MIN_SOURCES = 2

// Articles are single pages that their authors replace with a new edition now and then.
// When a new edition appears, its address goes here.
export const ARTICLE_URLS = {
  fox: 'https://www.foxsports.com/stories/nfl/2027-nfl-draft-big-board-6-qbs-rank-among-top-50-overall-prospects',
  draftcountdown: 'https://www.draftcountdown.com/rankings/2027-nfl-draft-big-board-top-50-prospect-rankings-brian-lamb/',
}

/** Rankings that are not collected, with the reason, so the site can link to them instead. */
export const LINK_ONLY = [
  { name: 'NFL Mock Draft Database consensus board', url: `https://www.nflmockdraftdatabase.com/big-boards/${DRAFT_YEAR}/consensus-big-board-${DRAFT_YEAR}`, why: 'Does not allow automated reading' },
  { name: 'Tankathon big board and draft order', url: 'https://www.tankathon.com/nfl/big_board', why: 'Its robots file bars AI crawlers, so it is linked rather than collected' },
  { name: 'NFL Draft Buzz big board', url: 'https://www.nfldraftbuzz.com/buzzbigboard', why: 'Does not allow automated reading' },
  { name: 'ESPN draft rankings (Reid, Kiper, Miller, Yates)', url: `https://www.espn.com/nfl/draft${DRAFT_YEAR}/`, why: 'Subscriber content' },
  { name: 'The Athletic (Dane Brugler)', url: 'https://www.nytimes.com/athletic/football/nfl-draft/', why: 'Subscriber content' },
  { name: 'PFF big board and grades', url: 'https://www.pff.com/draft/big-board', why: 'Licensed product' },
]

export const DATA_SOURCES = [
  { id: 'espn', name: 'ESPN', what: 'College rosters, class year, height and weight, season and career statistics, game logs, headlines, recruiting grades, and the NFL standings behind the pick order', url: 'https://www.espn.com/college-football/' },
  { id: 'wikipedia', name: 'Wikipedia', what: 'Biographical background text', url: 'https://en.wikipedia.org', license: 'CC BY-SA 4.0' },
  { id: 'wikidata', name: 'Wikidata', what: 'Links to relatives who are public figures in their own right', url: 'https://www.wikidata.org', license: 'CC0' },
]

/** Position labels used by the various boards, folded into one set of groups. */
const POS = {
  QB: 'QB', RB: 'RB', HB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE',
  OT: 'OT', T: 'OT', LT: 'OT', RT: 'OT',
  IOL: 'IOL', OG: 'IOL', G: 'IOL', OC: 'IOL', C: 'IOL', OL: 'IOL', LG: 'IOL', RG: 'IOL',
  DL: 'DL', DT: 'DL', NT: 'DL', IDL: 'DL', DI: 'DL', DL1T: 'DL', DL3T: 'DL', DL5T: 'DL',
  EDGE: 'EDGE', DE: 'EDGE', ED: 'EDGE',
  LB: 'LB', ILB: 'LB', OLB: 'LB', MLB: 'LB',
  CB: 'CB', DB: 'CB', NB: 'CB',
  S: 'S', FS: 'S', SS: 'S', SAF: 'S',
  K: 'ST', PK: 'ST', P: 'ST', LS: 'ST',
}
export const posGroup = (p) => POS[String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '')] || null

export const GROUP_UNIT = { QB: 'offense', RB: 'offense', WR: 'offense', TE: 'offense', OT: 'offense', IOL: 'offense', DL: 'defense', EDGE: 'defense', LB: 'defense', CB: 'defense', S: 'defense', ST: 'special' }
