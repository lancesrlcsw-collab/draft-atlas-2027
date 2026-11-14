import { useEffect, useMemo, useState } from 'react'
import { useStore, type Panel } from '../store'
import type { BoardPlayer, DraftData } from '../types'
import { POS_ORDER, POS_PLURAL, SITE_NAME, classShort, dateLong, dateShort, height, moveText, timeAgo } from '../lib/format'
import { moveColor, trendOf } from '../lib/lens'
import { IconClose, IconExternal } from './icons'
import { Bars, MoveBars } from './charts'

const TITLES: Record<Panel, [string, string]> = {
  order: ['If the season ended today', 'First two rounds'],
  tracker: ['Top 150 prospects', 'Tracking board'],
  news: ['Stories about players on the board', 'Headlines'],
  about: ['About this site', 'Sources and method'],
}

export function PlayerLink({ slug, children }: { slug?: string; children: React.ReactNode }) {
  const select = useStore((s) => s.select)
  const known = useStore((s) => (slug ? s.bySlug.has(slug) : false))
  if (!slug || !known) return <>{children}</>
  return <button className="plink" onClick={() => select(slug)}>{children}</button>
}

function ClubChip({ abbr, draft }: { abbr: string; draft: DraftData }) {
  const t = draft.nflTeams[abbr]
  return <span className="club-chip sm" style={{ background: t?.color }} title={t?.name}>{abbr}</span>
}

// ---------------------------------------------------------------- pick order

function OrderPanel({ draft }: { draft: DraftData }) {
  const bySlug = useStore((s) => s.bySlug)
  const [round, setRound] = useState<1 | 2>(1)
  const picks = draft.order.picks.filter((k) => k.round === round)
  const cc = draft.order.crossCheck
  const multi = Object.entries(draft.order.picks.filter((k) => k.round === 1).reduce<Record<string, number>>((m, k) => { m[k.team] = (m[k.team] || 0) + 1; return m }, {})).filter(([, n]) => n > 1)
  return (
    <>
      <section className="tiles three">
        <div className="tile"><span>First overall today</span><b>{draft.nflTeams[draft.order.picks[0].team]?.nickname}</b><em>{draft.order.picks[0].record} · {bySlug.get(draft.order.picks[0].slug || '')?.name}</em></div>
        <div className="tile"><span>Traded picks in rounds 1–2</span><b>{draft.order.picks.filter((k) => k.via).length}</b><em>{multi.length ? `${multi.map(([t, n]) => `${draft.nflTeams[t]?.nickname} ${n}`).join(', ')} first-rounders` : 'No club holds two first-rounders'}</em></div>
        <div className="tile"><span>Order check</span><b>{cc ? (cc.agrees ? 'Agrees' : 'Differs') : '—'}</b><em>{cc ? `Pick counts by club vs. the ${cc.against} mock` : 'No two-round mock to compare'}</em></div>
      </section>

      <section className="card flush">
        <div className="card-head">
          <h3>Round {round}</h3>
          <div className="toggle">{[1, 2].map((r) => <button key={r} className={round === r ? 'on' : ''} onClick={() => setRound(r as 1 | 2)}>Round {r}</button>)}</div>
        </div>
        <ol className="picks">
          {picks.map((k) => {
            const p = bySlug.get(k.slug || '')
            const club = draft.nflTeams[k.team]
            return (
              <li key={k.pick}>
                <span className="pk-no">{k.pick}</span>
                <span className="pk-club"><ClubChip abbr={k.team} draft={draft} /><span><b>{club?.name}</b><em>{k.record}{k.via ? ` · from ${draft.nflTeams[k.via.from]?.nickname ?? k.via.from}` : ''}{k.provisional ? ' · playoff seed *' : ''}</em></span></span>
                <span className="pk-player">{p ? <><PlayerLink slug={p.slug}>{p.name}</PlayerLink><em>{p.pos} · {p.school?.name} · {classShort(p.cls)}</em></> : '—'}</span>
                <span className="pk-meta mono">{p ? <>avg {p.avg}<em>{p.high}–{p.low}</em></> : null}</span>
              </li>
            )
          })}
        </ol>
      </section>

      <div className="two-col">
        <section className="card">
          <h3>How this order is built</h3>
          <ul className="insights">
            <li>Clubs outside the playoff field pick first, worst record first. Ties go to the club that has faced the weaker schedule.</li>
            <li>Clubs holding a playoff seed today fill the remaining picks by record. Their real order depends on playoff results, so those slots are marked * and are provisional.</li>
            <li>In round 2, clubs with the same record take turns at the front of their group, as the league’s rules do.</li>
            <li>The player at each pick is simply the consensus board in order. It is the board laid over the order, not a forecast of what each club needs.</li>
          </ul>
        </section>
        <section className="card">
          <h3>Traded picks applied</h3>
          <ul className="trades">
            {draft.order.trades.map((t) => (
              <li key={`${t.round}${t.from}${t.to}`}>
                <span className="mono">R{t.round}</span>
                <span><b>{t.from.split(' or ').map((a) => draft.nflTeams[a]?.nickname ?? a).join(' or ')}</b> → <b>{draft.nflTeams[t.to]?.nickname ?? t.to}</b><em>{t.note}{t.source ? <> · <a href={t.source.url} target="_blank" rel="noreferrer">{t.source.label}</a></> : null}</em></span>
              </li>
            ))}
          </ul>
          <p className="faint small">Checked by hand on {dateLong(draft.order.tradesChecked)}.{cc ? <> Every refresh compares each club’s pick count with <a href={cc.url} target="_blank" rel="noreferrer">the newest {cc.against} two-round mock</a>: {cc.agrees ? 'they agree.' : `they differ (${(cc.issues || []).join('; ')}), so a recent trade may be missing here.`}</> : null}</p>
        </section>
      </div>
      <p className="source">Records and schedules: ESPN. Compensatory picks begin in round 3 and do not affect this list. For a maintained order with every round, see <a href="https://www.tankathon.com/nfl/full_draft" target="_blank" rel="noreferrer">Tankathon</a>.</p>
    </>
  )
}

// ---------------------------------------------------------------- tracking board

type SortKey = 'rank' | 'move' | 'spread' | 'name'

function TrackerPanel({ draft }: { draft: DraftData }) {
  const board = useStore((s) => s.board)
  const select = useStore((s) => s.select)
  const [pos, setPos] = useState<string>('ALL')
  const [sort, setSort] = useState<SortKey>('rank')
  const mv = draft.movement
  const positions = POS_ORDER.filter((p) => board.some((x) => x.pos === p))
  const rows = useMemo(() => {
    const list = board.filter((p) => pos === 'ALL' || p.pos === pos)
    const t = (p: BoardPlayer) => trendOf(p) ?? 0
    if (sort === 'move') return [...list].sort((a, b) => t(b) - t(a) || a.rank - b.rank)
    if (sort === 'spread') return [...list].sort((a, b) => b.spread - a.spread)
    if (sort === 'name') return [...list].sort((a, b) => a.last.localeCompare(b.last))
    return list
  }, [board, pos, sort])
  const basis = mv.basis === 'consensus' ? `since the week of ${dateShort(mv.since)}` : 'in Drafttek’s latest update'
  return (
    <>
      <div className="two-col">
        <section className="card">
          <h3>Rising</h3>
          <p className="muted small">Biggest climbs {basis}.</p>
          {mv.risers.length ? <MoveBars movers={mv.risers.slice(0, 8)} onPick={select} /> : <p className="muted">No one moved up.</p>}
        </section>
        <section className="card">
          <h3>Falling</h3>
          <p className="muted small">Biggest drops {basis}.</p>
          {mv.fallers.length ? <MoveBars movers={mv.fallers.slice(0, 8)} onPick={select} /> : <p className="muted">No one moved down.</p>}
        </section>
      </div>
      {mv.basis === 'drafttek' && <p className="source">This board began tracking the week of {dateLong(mv.started)}, so it has no earlier ranking of its own to compare against yet. Until next week, movement shown here is Drafttek’s own change between its last two updates, credited to <a href="https://www.drafttek.com/" target="_blank" rel="noreferrer">Drafttek</a>. From the second week on it will be this board’s own week-over-week change.</p>}
      {mv.basis === 'consensus' && ((mv.added?.length ?? 0) > 0 || (mv.dropped?.length ?? 0) > 0) && (
        <section className="card">
          <h3>On and off the board this week</h3>
          {mv.added && mv.added.length > 0 && <div className="conn"><span className="eyebrow">Joined the top {draft.boardSize}</span><div className="chips tight">{mv.added.map((m) => <button key={m.slug} className="chip small" onClick={() => select(m.slug)}><b>{m.rank}</b>{m.name}</button>)}</div></div>}
          {mv.dropped && mv.dropped.length > 0 && <div className="conn"><span className="eyebrow">Dropped out</span><div className="chips tight">{mv.dropped.map((m) => <span key={m.slug} className="chip small ghost">{m.slug.replace(/-/g, ' ')} (was {m.rank})</span>)}</div></div>}
        </section>
      )}

      <section className="card flush">
        <div className="card-head wrap">
          <h3>{pos === 'ALL' ? `All ${board.length}` : POS_PLURAL[pos]} <span className="faint">· {rows.length}</span></h3>
          <div className="toggle">{([['rank', 'Rank'], ['move', 'Movement'], ['spread', 'Disagreement'], ['name', 'A–Z']] as [SortKey, string][]).map(([k, l]) => <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>)}</div>
        </div>
        <div className="pos-filter">
          <button className={`chip small${pos === 'ALL' ? ' on' : ''}`} onClick={() => setPos('ALL')}>All</button>
          {positions.map((p) => <button key={p} className={`chip small${pos === p ? ' on' : ''}`} onClick={() => setPos(p)}>{p}</button>)}
        </div>
        <div className="table-wrap scroll">
          <table className="stat-table tracker">
            <thead><tr><th className="lead">#</th><th className="lead">Player</th><th>Pos</th><th>Move</th><th title="Average spot across the lists that include him">Avg</th><th title="Best and worst rank on any list">Range</th><th title="How many lists include him">Lists</th><th>Class</th><th>Size</th><th title="Slot in the first two rounds">Pick</th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const t = trendOf(p)
                return (
                  <tr key={p.slug} className={p.pick?.pick === 32 && sort === 'rank' && pos === 'ALL' ? 'sep-after' : p.rank === 64 && sort === 'rank' && pos === 'ALL' ? 'sep-after' : ''}>
                    <td className="lead rk">{p.rank}</td>
                    <td className="lead"><PlayerLink slug={p.slug}>{p.name}</PlayerLink><em className="sub">{p.school?.name}</em></td>
                    <td>{p.pos}</td>
                    <td>{p.trend?.basis === 'new' ? 'new' : t ? <span className="mv"><i style={{ background: moveColor(t) }} />{moveText(t)}</span> : '–'}</td>
                    <td>{p.avg.toFixed(1)}</td><td>{p.high}–{p.low}</td><td>{p.sources}</td><td>{classShort(p.cls)}</td>
                    <td>{p.height ? `${height(p.height)} ${p.weight ?? ''}` : '–'}</td>
                    <td>{p.pick ? `${p.pick.pick} ${p.pick.team}` : '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="two-col">
        <section className="card"><h3>First two rounds by position</h3><Bars items={draft.breakdown.positions.picks} unit="of the 64 picks" onPick={(n) => setPos(n)} /></section>
        <section className="card"><h3>Schools with the most players on the board</h3><Bars items={draft.breakdown.schools.slice(0, 11)} unit={`of the top ${draft.boardSize}`} /></section>
      </div>
      <p className="source">Underclassmen have until January to declare for the draft, so this board includes players who may return to school. Height, weight and class are as listed by ESPN and the boards.</p>
    </>
  )
}

// ---------------------------------------------------------------- headlines

function NewsPanel({ draft }: { draft: DraftData }) {
  const bySlug = useStore((s) => s.bySlug)
  const select = useStore((s) => s.select)
  return (
    <>
      <section className="card">
        <h3>Latest</h3>
        <ul className="news">
          {draft.headlines.map((n) => (
            <li key={n.url}>
              <a href={n.url} target="_blank" rel="noreferrer">{n.headline}</a>
              {n.description && <p className="muted">{n.description}</p>}
              <span className="faint small">{n.source}{n.byline ? ` · ${n.byline}` : ''}{n.published ? ` · ${timeAgo(n.published)}` : ''}</span>
              <div className="chips tight">{(n.players || []).slice(0, 6).map((s) => { const p = bySlug.get(s); return p ? <button key={s} className="chip small" onClick={() => select(s)}><b>{p.rank}</b>{p.name}</button> : null })}</div>
            </li>
          ))}
        </ul>
      </section>
      <p className="source">Headlines and summaries are ESPN’s, gathered from the stories ESPN has tagged to players on this board. Each links to the full story.</p>
    </>
  )
}

// ---------------------------------------------------------------- about

function AboutPanel({ draft }: { draft: DraftData }) {
  const c = draft.coverage
  const counted = draft.sources.filter((s) => s.counted)
  return (
    <>
      <section className="card">
        <h3>What this is</h3>
        <p className="prose">{SITE_NAME} is an independent fan project: a 3D model of the {draft.draftYear} NFL draft class. The projected first two rounds stand on the stage in pick order, the rest of a {draft.boardSize}-player tracking board stands behind them, and every figure opens into a player file. It is not affiliated with or endorsed by the NFL, the NCAA, any conference, school or club, or any outlet whose rankings it cites, and it uses no official logos or photographs.</p>
        <p className="prose">Data was last rebuilt {timeAgo(draft.generatedAt)} ({new Date(draft.generatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}). It refreshes automatically several times a day.</p>
      </section>

      <section className="card">
        <h3>The lists behind the consensus</h3>
        <p className="muted">The board is an average of freely published big boards and mock drafts. Only each player’s rank number is used. Please read the originals: the evaluation is theirs.</p>
        <ul className="sources">
          {draft.sources.map((s) => (
            <li key={s.id}>
              <a href={s.url} target="_blank" rel="noreferrer">{s.name}<IconExternal /></a>
              <span>{s.kind === 'mock' ? 'Mock draft' : 'Big board'}{s.author && s.author !== s.name ? ` by ${s.author}` : ''} · {s.depth} players read{s.updated ? ` · dated ${dateShort(s.updated)}` : ''}{s.note ? ` · ${s.note}` : ''}{s.error ? ' · could not be read at the last refresh' : s.stale ? ` · older than ${draft.method.staleDays} days, so not counted` : ''}</span>
            </li>
          ))}
        </ul>
        <p className="faint small">{counted.length} lists counted at the last refresh; {draft.method.considered} different players appeared on at least one, and {draft.method.ranked} on at least {draft.method.minSources}. A player needs {draft.method.minSources} lists to be ranked.</p>
      </section>

      <section className="card">
        <h3>Rankings that are linked, not collected</h3>
        <ul className="sources">
          {draft.linkOnly.map((s) => <li key={s.name}><a href={s.url} target="_blank" rel="noreferrer">{s.name}<IconExternal /></a><span>{s.why}</span></li>)}
        </ul>
      </section>

      <section className="card">
        <h3>Where the player data comes from</h3>
        <ul className="sources">
          {draft.dataSources.map((s) => <li key={s.id}><a href={s.url} target="_blank" rel="noreferrer">{s.name}<IconExternal /></a><span>{s.what}{s.license ? ` · ${s.license}` : ''}</span></li>)}
        </ul>
        <p className="faint small">At the last refresh, of {draft.boardSize} players: {c.matched} matched to an ESPN profile, {c.withStats} with statistics, {c.withLogs} with game logs, {c.withRecruiting} with an ESPN recruiting record, {c.withHeadlines} with headlines and {c.withBackground} with Wikipedia background text.</p>
      </section>

      <div className="two-col">
        <section className="card">
          <h3>How to read the numbers</h3>
          <dl className="glossary">
            <dt>Consensus rank</dt><dd>A player’s place when everyone is ordered by average spot across the counted lists. If a board is deep enough that he should be on it and is not, it counts as one spot past its last player.</dd>
            <dt>Range and disagreement</dt><dd>His best and worst rank on any list, and the standard deviation of his ranks. A wide spread means the outlets do not agree.</dd>
            <dt>Movement</dt><dd>The change in consensus rank from one week’s board to the next. In the first week it is Drafttek’s own published change, labeled as such.</dd>
            <dt>Projected slot</dt><dd>The consensus board laid over the pick order as it stands today. It ignores what clubs need.</dd>
            <dt>Class</dt><dd>As listed this season. Underclassmen may return to school; nothing here says a player has declared.</dd>
          </dl>
        </section>
        <section className="card">
          <h3>What is deliberately left out</h3>
          <ul className="insights">
            <li>Paid and licensed evaluations: PFF grades, ESPN and The Athletic subscriber boards. They are linked above instead.</li>
            <li>Any outlet’s scouting write-ups, grades, tiers or player comparisons. Only rank numbers are used.</li>
            <li>Rumors and unsourced claims. Background text comes from Wikipedia with a link; headlines link to ESPN’s reporting.</li>
            <li>Anything about family members who are not public figures. These are college students: sentences mentioning relatives are removed and personal-life sections are not collected.</li>
            <li>Official school, conference, NCAA, NFL and club logos, and player photographs. Figures wear a plain kit in a school color.</li>
          </ul>
        </section>
      </div>
      <p className="source">Spotted something wrong? Statistics and rankings come straight from the sources above and are rebuilt on a schedule, so most errors correct themselves at the next refresh.</p>
    </>
  )
}

export function BoardPanel() {
  const panel = useStore((s) => s.panel)
  const draft = useStore((s) => s.draft)
  const openPanel = useStore((s) => s.openPanel)
  useEffect(() => { document.querySelector('.tp-body')?.scrollTo({ top: 0 }) }, [panel])
  if (!panel || !draft) return null
  const [eyebrow, title] = TITLES[panel]
  return (
    <section className="teampanel glass" aria-label={title}>
      <header className="tp-head">
        <div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div>
        <button onClick={() => openPanel(null)} aria-label="Close" title="Close (Esc)"><IconClose /></button>
      </header>
      <div className="tp-body scroll">
        {panel === 'order' && <OrderPanel draft={draft} />}
        {panel === 'tracker' && <TrackerPanel draft={draft} />}
        {panel === 'news' && <NewsPanel draft={draft} />}
        {panel === 'about' && <AboutPanel draft={draft} />}
      </div>
    </section>
  )
}
