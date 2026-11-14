import { useEffect, useMemo, useState } from 'react'
import { HASH_ROUTING, useStore, type DossierTab } from '../store'
import type { BoardPlayer, Dossier as DossierData, GameLog, StatCategory } from '../types'
import { POS_NAME, SITE_NAME, classShort, dateLong, dateShort, height, moveText, ordinal, stat, timeAgo } from '../lib/format'
import { moveColor, trendOf } from '../lib/lens'
import { IconChevronLeft, IconChevronRight, IconClose, IconExternal, IconShare } from './icons'
import { SpotRows, TrendLine } from './charts'

const TABS: { id: DossierTab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'stats', label: 'Stats' }, { id: 'games', label: 'Game log' },
  { id: 'rankings', label: 'Rankings' }, { id: 'story', label: 'Background' }, { id: 'news', label: 'Headlines' },
]

const UNIT_NAME = { offense: 'Offense', defense: 'Defense', special: 'Special teams' } as const

function Header({ p, d }: { p: BoardPlayer; d: DossierData | null }) {
  const step = useStore((s) => s.step)
  const select = useStore((s) => s.select)
  const draft = useStore((s) => s.draft)!
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) await navigator.share({ title: `${p.name} — ${SITE_NAME}`, url })
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600) }
    } catch { /* dismissed */ }
  }
  const club = p.pick ? draft.nflTeams[p.pick.team] : null
  const facts = [p.cls, p.height ? height(p.height) : null, p.weight ? `${p.weight} lb` : null, p.number !== undefined ? `No. ${p.number}` : null, p.school?.conference].filter(Boolean)
  const t = trendOf(p)
  return (
    <header className="dz-head">
      <div className="dz-bar">
        <div className="dz-nav">
          <button onClick={() => step(-1)} aria-label="Previous player on the board" title="Previous on the board (←)"><IconChevronLeft /></button>
          <button onClick={() => step(1)} aria-label="Next player on the board" title="Next on the board (→)"><IconChevronRight /></button>
        </div>
        <span className="eyebrow">{POS_NAME[p.pos] ?? p.pos} · {UNIT_NAME[p.unit]}</span>
        <div className="dz-nav">
          {!HASH_ROUTING && <button onClick={share} aria-label="Copy a link to this player" title="Copy link"><IconShare />{copied && <span className="copied">Link copied</span>}</button>}
          <button onClick={() => select(null)} aria-label="Close" title="Close (Esc)"><IconClose /></button>
        </div>
      </div>
      <div className="dz-id">
        <div className="dz-num" aria-hidden="true">{p.rank}</div>
        <div className="dz-who">
          <h2><span>{p.first}</span> {p.last}</h2>
          <div className="dz-role">{p.pos} · {p.school?.name ?? 'School not listed'}</div>
          <div className="dz-facts">{facts.join(' · ')}</div>
        </div>
      </div>
      <div className="dz-status">
        <span className="pill ok"><span className="dot" />Consensus No. {p.rank}</span>
        {p.pick && club && <span className="pill"><i className="swatch" style={{ background: club.color }} />Pick {p.pick.pick} · {club.nickname}{p.pick.provisional ? ' *' : ''}</span>}
        {!p.pick && <span className="pill muted">Tracking board</span>}
        {t !== null && t !== 0 && <span className="pill"><i className="swatch round" style={{ background: moveColor(t) }} />{moveText(t)} {p.trend?.basis === 'drafttek' ? 'on Drafttek' : 'this week'}</span>}
        {p.trend?.basis === 'new' && <span className="pill">New this week</span>}
        <span className="pill muted">{p.sources} lists</span>
      </div>
      {(d?.line?.length ?? p.line?.length ?? 0) > 0 && (
        <div className="dz-line">{(d?.line || p.line || []).map((l) => <div key={l.label}><b>{l.value}</b><span>{l.label}</span></div>)}<em>{d?.summaryLabel?.replace(' stats', '') || `${draft.season} season`}</em></div>
      )}
    </header>
  )
}

/** Others on the board from the same school, at the same position, or slotted to the same club. */
function Connections({ d }: { d: DossierData }) {
  const board = useStore((s) => s.board)
  const draft = useStore((s) => s.draft)!
  const select = useStore((s) => s.select)
  const others = board.filter((p) => p.slug !== d.slug)
  const groups: { label: string; people: BoardPlayer[] }[] = []
  const school = others.filter((p) => p.school?.name && p.school.name === d.school?.name)
  if (school.length) groups.push({ label: `Also from ${d.school!.name}`, people: school })
  const near = others.filter((p) => p.pos === d.pos).sort((a, b) => Math.abs(a.rank - d.consensus.rank) - Math.abs(b.rank - d.consensus.rank)).slice(0, 8).sort((a, b) => a.rank - b.rank)
  if (near.length) groups.push({ label: `${POS_NAME[d.pos] ?? d.pos}s ranked near him`, people: near })
  const club = d.pick ? others.filter((p) => p.pick?.team === d.pick!.team) : []
  if (club.length && d.pick) groups.push({ label: `Also slotted to the ${draft.nflTeams[d.pick.team]?.nickname}`, people: club })
  if (!groups.length) return null
  return (
    <section className="card">
      <h3>Connections on the board</h3>
      {groups.map((g) => (
        <div className="conn" key={g.label}>
          <span className="eyebrow">{g.label}</span>
          <div className="chips tight">{g.people.slice(0, 14).map((p) => <button key={p.slug} className="chip small" onClick={() => select(p.slug)}><b>{p.rank}</b>{p.name}</button>)}</div>
        </div>
      ))}
    </section>
  )
}

function Overview({ d }: { d: DossierData }) {
  const draft = useStore((s) => s.draft)!
  const openPanel = useStore((s) => s.openPanel)
  const setTab = useStore((s) => s.setTab)
  const club = d.pick ? draft.nflTeams[d.pick.team] : null
  const slot = d.pick ? draft.order.picks.find((k) => k.pick === d.pick!.pick) : null
  const r = d.recruiting
  const hist = d.consensus.history || []
  return (
    <>
      {d.insights && d.insights.length > 0 && (
        <section className="card">
          <h3>At a glance</h3>
          <ul className="insights">{d.insights.map((t) => <li key={t}>{t}</li>)}</ul>
        </section>
      )}

      {d.pick && club && slot && (
        <section className="card accent">
          <h3>Projected slot</h3>
          <div className="slot">
            <div className="slot-pick"><b>{d.pick.pick}</b><span>Round {d.pick.round}</span></div>
            <div className="slot-club">
              <span className="club-chip" style={{ background: club.color }}>{club.abbr}</span>
              <div><b>{club.name}</b><span>{slot.record}{slot.via ? ` · pick from ${draft.nflTeams[slot.via.from]?.nickname ?? slot.via.from}` : ''}</span></div>
            </div>
          </div>
          <p className="faint small">The consensus No. {d.consensus.rank} player is placed at pick {d.pick.pick}, which the {club.nickname} would hold if the season ended today. This lines the board up against the order; it is not a prediction of what a club needs or will do.{d.pick.provisional ? ' * This club currently holds a playoff seed, so its real slot depends on playoff results.' : ''}</p>
          {d.mocks && d.mocks.length > 0 && <p className="small muted">Published mock drafts: {d.mocks.map((m, i) => <span key={m.source}>{i ? '; ' : ''}<a href={m.url} target="_blank" rel="noreferrer">{m.source}</a> has him at No. {m.pick}{m.team ? ` to the ${draft.nflTeams[m.team]?.nickname ?? m.team}` : ''}</span>)}.</p>}
          <div className="chips"><button className="chip" onClick={() => openPanel('order')}>See the full pick order</button></div>
        </section>
      )}

      <section className="card">
        <div className="card-head"><h3>Where the lists have him</h3><button className="chip small" onClick={() => setTab('rankings')}>Details</button></div>
        <SpotRows spots={d.consensus.spots} avg={d.consensus.avg} max={Math.min(draft.boardSize, Math.max(40, d.consensus.low + 10))} />
      </section>

      <section className="card">
        <h3>Movement</h3>
        {hist.length >= 2
          ? <TrendLine history={hist} max={draft.boardSize} />
          : <p className="muted">This board began tracking the week of {dateLong(draft.movement.started)}. A week-by-week line appears here once there is a second week to compare.{d.trend?.basis === 'drafttek' && d.trend.value ? ` In the meantime: Drafttek moved him ${d.trend.value > 0 ? 'up' : 'down'} ${Math.abs(d.trend.value)} in its latest update.` : ''}</p>}
      </section>

      <section className="card">
        <h3>Profile</h3>
        <dl className="facts">
          {d.school && <><dt>School</dt><dd>{d.school.name}{d.school.conference ? <span className="faint"> · {d.school.conference}</span> : null}{d.school.record ? <span className="faint"> · {d.school.record} this season</span> : null}</dd></>}
          {d.bio.previousSchools && d.bio.previousSchools.length > 0 && <><dt>Before</dt><dd>{d.bio.previousSchools.join(', ')}</dd></>}
          <dt>Position</dt><dd>{POS_NAME[d.pos] ?? d.pos}{d.positionName && d.positionName !== POS_NAME[d.pos] ? <span className="faint"> · listed by his school as {d.positionName.toLowerCase()}</span> : null}</dd>
          {d.cls && <><dt>Class</dt><dd>{d.cls} <span className="faint">({classShort(d.cls)})</span></dd></>}
          {(d.height || d.weight) && <><dt>Size</dt><dd>{height(d.height)}{d.weight ? `, ${d.weight} lb` : ''}</dd></>}
          {(d.bio.hometown || d.bio.birthPlace) && <><dt>Hometown</dt><dd>{d.bio.hometown || d.bio.birthPlace}</dd></>}
          {d.bio.highSchool && <><dt>High school</dt><dd>{d.bio.highSchool}</dd></>}
        </dl>
        <div className="links">
          {d.links.espn && <a href={d.links.espn} target="_blank" rel="noreferrer">ESPN player page<IconExternal /></a>}
          {d.links.wikipedia && <a href={d.links.wikipedia} target="_blank" rel="noreferrer">Wikipedia<IconExternal /></a>}
        </div>
      </section>

      {r && (
        <section className="card">
          <h3>Recruiting background</h3>
          <div className="tiles three">
            <div className="tile"><span>ESPN stars</span><b>{r.stars ? '★'.repeat(r.stars) : '—'}</b><em>Grade {r.grade ?? '—'}</em></div>
            <div className="tile"><span>National rank</span><b>{r.rank ? `No. ${r.rank}` : '—'}</b><em>Class of {r.classYear}</em></div>
            <div className="tile"><span>At his position</span><b>{r.positionRank ? ordinal(r.positionRank) : '—'}</b><em>{r.stateRank ? `${ordinal(r.stateRank)} in his state` : r.position ?? ''}</em></div>
          </div>
          <p className="faint small">Recruiting grade and ranks are ESPN’s evaluation of him as a high-school prospect.{r.url ? <> <a href={r.url} target="_blank" rel="noreferrer">His ESPN recruiting page</a>.</> : null}</p>
        </section>
      )}

      <Connections d={d} />
    </>
  )
}

function seasonTable(c: StatCategory, season: number) {
  // ESPN repeats a label (YDS, TD) inside one category for different things; the full name disambiguates on hover.
  return (
    <section className="card flush" key={c.key}>
      <div className="card-head"><h3>{c.title}</h3><span className="faint small">by season · ESPN</span></div>
      <div className="table-wrap scroll">
        <table className="stat-table">
          <thead><tr><th className="lead">Season</th><th className="lead">Team</th>{c.labels.map((l, i) => <th key={i} title={c.displayNames[i]}>{l}</th>)}</tr></thead>
          <tbody>
            {c.seasons.map((s) => (
              <tr key={`${s.year}${s.team}`} className={s.year === season ? 'current' : ''}>
                <td className="lead">{s.year}</td><td className="lead" title={s.school}>{s.team ?? '—'}</td>
                {s.values.map((v, i) => <td key={i}>{stat(v)}</td>)}
              </tr>
            ))}
          </tbody>
          {c.totals && c.seasons.length > 1 && <tfoot><tr><td className="lead" colSpan={2}>Career</td>{c.totals.map((v, i) => <td key={i}>{stat(v)}</td>)}</tr></tfoot>}
        </table>
      </div>
    </section>
  )
}

function StatsTab({ d }: { d: DossierData }) {
  const draft = useStore((s) => s.draft)!
  if (!d.stats.length) {
    return <section className="card"><h3>Statistics</h3><p className="muted">ESPN lists no individual statistics for {d.first}. That is normal for offensive linemen, whose work does not show up in the box score, and for players who have not appeared in a game.</p></section>
  }
  return (
    <>
      {d.stats.map((c) => seasonTable(c, draft.season))}
      <p className="source">Season and career statistics: ESPN. Columns follow ESPN’s own stat tables; hover a heading for its full name.</p>
    </>
  )
}

function LogTable({ log }: { log: GameLog }) {
  // Column headings repeat across groups (YDS under Receiving and Rushing), so show the groups too.
  return (
    <div className="table-wrap scroll">
      <table className="stat-table">
        <thead>
          {log.groups.length > 1 && <tr className="groups"><th className="lead" colSpan={3} />{log.groups.map((g) => <th key={g.title} colSpan={g.count}>{g.title}</th>)}</tr>}
          <tr><th className="lead">Date</th><th className="lead">Opp</th><th>Result</th>{log.labels.map((l, i) => <th key={i} title={log.displayNames[i]}>{l}</th>)}</tr>
        </thead>
        <tbody>
          {log.games.map((g) => (
            <tr key={g.id} className={g.type === 'post' ? 'post' : ''}>
              <td className="lead">{dateShort(g.date)}</td>
              <td className="lead" title={g.oppName}>{g.home ? 'vs' : 'at'} {g.opp}</td>
              <td><span className={`res ${g.result ?? ''}`}>{g.result}</span> {g.score}</td>
              {g.values.map((v, i) => <td key={i}>{stat(v)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GamesTab({ d }: { d: DossierData }) {
  const seasons = useMemo(() => Object.keys(d.logs).sort((a, b) => Number(b) - Number(a)), [d])
  const [season, setSeason] = useState(seasons[0])
  useEffect(() => { setSeason(seasons[0]) }, [seasons])
  if (!seasons.length) {
    return <section className="card"><h3>Game log</h3><p className="muted">ESPN has no game-by-game statistics for {d.first}. Offensive linemen are not credited with individual statistics.</p></section>
  }
  const log = d.logs[season] || d.logs[seasons[0]]
  return (
    <>
      <section className="card flush">
        <div className="card-head">
          <h3>{season} game log</h3>
          {seasons.length > 1 && <div className="toggle">{seasons.map((s) => <button key={s} className={s === season ? 'on' : ''} onClick={() => setSeason(s)}>{s}</button>)}</div>}
        </div>
        <LogTable log={log} />
      </section>
      <p className="source">Game logs: ESPN. {log.games.length} games listed for {season}; games in which he recorded no statistic may be missing.</p>
    </>
  )
}

function RankingsTab({ d }: { d: DossierData }) {
  const draft = useStore((s) => s.draft)!
  const c = d.consensus
  const stale = draft.sources.filter((s) => s.stale)
  return (
    <>
      <section className="tiles three">
        <div className="tile"><span>Consensus</span><b>No. {c.rank}</b><em>Average spot {c.avg}</em></div>
        <div className="tile"><span>Range</span><b>{c.high}–{c.low}</b><em>Best and worst rank</em></div>
        <div className="tile"><span>Lists</span><b>{c.sources}</b><em>of {draft.sources.filter((s) => s.counted).length} counted</em></div>
      </section>
      <section className="card flush">
        <div className="card-head"><h3>Every list</h3><span className="faint small">each links to its source</span></div>
        <div className="table-wrap scroll">
          <table className="stat-table wide-lead">
            <thead><tr><th className="lead">Published by</th><th>Type</th><th>Rank</th><th>Club</th><th>Dated</th></tr></thead>
            <tbody>
              {c.spots.map((s) => (
                <tr key={s.source}>
                  <td className="lead"><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a>{s.author && s.author !== s.name ? <span className="faint"> · {s.author}</span> : null}</td>
                  <td>{s.kind === 'mock' ? 'Mock draft' : 'Big board'}</td><td><b>{s.rank}</b></td><td>{s.team ?? '–'}</td><td>{s.updated ? dateShort(s.updated) : '–'}</td>
                </tr>
              ))}
              {(c.unlisted || []).map((u) => (
                <tr key={u.source} className="post"><td className="lead">{u.name}</td><td>Big board</td><td>not in its top {u.depth}</td><td>–</td><td>–</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <h3>How the number is made</h3>
        <p className="prose">His consensus number is the average of his spot on each list above. When a board runs deep enough that he should appear on it and he does not, that board counts as one spot past its last player ({(c.unlisted || []).length ? `this applies to ${c.unlisted!.map((u) => u.name).join(' and ')} here` : 'that did not apply here'}). Players are then ordered by that average. Only rank numbers are used: no outlet’s grades, write-ups or player comparisons are copied.</p>
        {stale.length > 0 && <p className="faint small">Not counted because it is more than {draft.method.staleDays} days old: {stale.map((s) => s.name).join(', ')}.</p>}
      </section>
    </>
  )
}

function StoryTab({ d }: { d: DossierData }) {
  const w = d.wiki
  if (!w) {
    return (
      <section className="card">
        <h3>Background</h3>
        <p className="muted">No sourced background text is on file for {d.name} yet. This page only carries biography that Wikipedia has published with citations; many college players do not have an article until later in their careers. It is checked again at every data refresh.</p>
        <dl className="facts">
          {(d.bio.hometown || d.bio.birthPlace) && <><dt>Hometown</dt><dd>{d.bio.hometown || d.bio.birthPlace}</dd></>}
          {d.bio.highSchool && <><dt>High school</dt><dd>{d.bio.highSchool}</dd></>}
          {d.school && <><dt>College</dt><dd>{[...(d.bio.previousSchools || []), d.school.name].join(' → ')}</dd></>}
        </dl>
      </section>
    )
  }
  return (
    <>
      <section className="card">
        <h3>{w.title.replace(/\s*\(.*\)$/, '')}</h3>
        {w.description && <p className="eyebrow">{w.description}</p>}
        {w.intro.split('\n').filter(Boolean).map((t, i) => <p className="prose" key={i}>{t}</p>)}
      </section>
      {w.sections.map((s) => (
        <section className="card" key={s.title}>
          <h3>{s.title}</h3>
          {s.text.split('\n').filter(Boolean).map((t, i) => (/^[A-Z0-9 –-]{4,}$/.test(t) ? <h4 key={i}>{t}</h4> : <p className="prose" key={i}>{t}</p>))}
        </section>
      ))}
      {w.family && w.family.length > 0 && (
        <section className="card">
          <h3>Relatives who are public figures</h3>
          <ul className="family">{w.family.map((f) => <li key={f.name}><span className="eyebrow">{f.relation}</span><a href={f.url} target="_blank" rel="noreferrer">{f.name}</a>{f.description ? <span className="faint"> · {f.description}</span> : null}</li>)}</ul>
          <p className="faint small">Only relatives with a Wikipedia article of their own are listed.</p>
        </section>
      )}
      <p className="source">Text from <a href={w.url} target="_blank" rel="noreferrer">“{w.title}” on Wikipedia</a>, used under CC BY-SA 4.0 and shortened{w.touched ? `; article last edited ${timeAgo(w.touched)}` : ''}. Sentences about family members have been left out, and personal-life sections are not collected.</p>
    </>
  )
}

function NewsTab({ d }: { d: DossierData }) {
  if (!d.news.length) return <section className="card"><h3>Headlines</h3><p className="muted">ESPN has no recent stories tagged to {d.name}.</p></section>
  return (
    <>
      <section className="card">
        <h3>Recent headlines</h3>
        <ul className="news">
          {d.news.map((n) => (
            <li key={n.url}>
              <a href={n.url} target="_blank" rel="noreferrer">{n.headline}</a>
              {n.description && <p className="muted">{n.description}</p>}
              <span className="faint small">{n.source}{n.byline ? ` · ${n.byline}` : ''}{n.published ? ` · ${timeAgo(n.published)}` : ''}</span>
            </li>
          ))}
        </ul>
      </section>
      <p className="source">Headlines and summaries are ESPN’s, for stories ESPN tagged to this player. Each links to the full story.</p>
    </>
  )
}

export function Dossier() {
  const selected = useStore((s) => s.selected)
  const p = useStore((s) => (s.selected ? s.bySlug.get(s.selected) : undefined))
  const entry = useStore((s) => (s.selected ? s.dossiers[s.selected] : undefined))
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const [tall, setTall] = useState(false)
  useEffect(() => { document.querySelector('.dz-body')?.scrollTo({ top: 0 }) }, [selected, tab])
  if (!selected || !p) return null
  const d = entry && typeof entry !== 'string' ? entry : null
  return (
    <aside className={`dossier glass${tall ? ' tall' : ''}`} aria-label={`${p.name} player file`}>
      <button className="dz-grip" onClick={() => setTall((t) => !t)} aria-label={tall ? 'Shrink panel' : 'Expand panel'}><i /></button>
      <Header p={p} d={d} />
      <nav className="dz-tabs" role="tablist">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </nav>
      <div className="dz-body scroll">
        {entry === 'error' && <div className="card"><p>Could not load this player’s file. Check your connection and try again.</p></div>}
        {!d && entry !== 'error' && <div className="skeleton"><i /><i /><i /></div>}
        {d && tab === 'overview' && <Overview d={d} />}
        {d && tab === 'stats' && <StatsTab d={d} />}
        {d && tab === 'games' && <GamesTab d={d} />}
        {d && tab === 'rankings' && <RankingsTab d={d} />}
        {d && tab === 'story' && <StoryTab d={d} />}
        {d && tab === 'news' && <NewsTab d={d} />}
      </div>
    </aside>
  )
}
