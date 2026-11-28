# Green Room Atlas

An unofficial, interactive 3D model of the 2027 NFL draft class. The projected first two rounds stand on a tiered stage in pick order, the rest of a 150-player tracking board stands behind them, and every figure opens into a full player file: school, position, class, height and weight, season and career statistics, game log, recruiting background, sourced biography, headlines, and where every published list ranks him.

This is an independent fan project. It is not affiliated with or endorsed by the NFL, the NCAA, any conference, school or club, or any outlet whose rankings it cites, and it uses no official logos or photography.

## What is in it

- **3D scene** — a draft stage with a numbered mark for each of the 64 picks (pick number and the club holding that slot), and a one-tap switch that walks the same 150 figures onto a football field at their positions.
- **Data lenses** — re-color the class and raise each player on a column for consensus rank, week-to-week movement, disagreement between the lists, class year, or recruiting grade.
- **Player file** — at-a-glance notes, projected slot, each list's rank on one axis, rank history, profile, recruiting background, season and career statistics, game logs for up to three seasons, Wikipedia background, and headlines.
- **Board views** — the first two rounds by club, the 150-player tracking board with risers and fallers, headlines, and a sources page.
- **Search** — by name, school, position, rank, class or NFL club.

## How the projection is made

The board is a consensus of freely published big boards and mock drafts. Each list is read as "this outlet put this player at this spot", and a player's consensus number is the average of his spots across the lists that are still current (45 days). When a board runs deep enough that a player should be on it and he is not, that board counts as one spot past its last player. A player needs two lists to be ranked. Only rank numbers are used; no outlet's grades, write-ups or player comparisons are collected.

The top 64 are then laid over the pick order as it would stand if the NFL season ended today: clubs outside the playoff field by record (ties to the weaker schedule), then clubs holding a playoff seed, with round-two rotation among tied clubs. Traded first- and second-round picks come from `pipeline/traded-picks.json`, each with the report it was taken from. Every refresh compares the resulting pick counts per club with the newest published two-round mock and records any disagreement, which is the signal that a new trade needs adding.

Movement is the change in consensus rank from one week's snapshot to the next (`public/data/history.json`). In the first week, before a second snapshot exists, the site shows Drafttek's own published change and says so.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check and build to dist/
npm run preview    # serve the production build
```

The site reads static JSON from `public/data`. A snapshot is committed, so it runs without rebuilding the data.

## Refreshing the data

```bash
npm run data        # rebuild public/data from the live sources
npm run data:check  # sanity-check the result
```

`npm run data` writes nothing when the content has not changed. `.github/workflows/refresh-data.yml` runs both commands twice a week (Sunday and Wednesday mornings, US Eastern) and commits when something moved, which triggers a redeploy. It can also be started by hand at any time from the repository's Actions tab ("Refresh data", then "Run workflow"). Scheduled workflows only run from a repository's default branch.

The data script starts Node with `--use-env-proxy`, so it also works behind an HTTP proxy such as a Claude Code cloud session. That flag needs Node 22.21 or newer. If Wikipedia cannot be reached (it refuses some shared cloud addresses), the build keeps the background text from the last successful run rather than dropping it; `PIPELINE_SKIP_WIKI=1` skips that step outright.

| Source | Used for |
| --- | --- |
| Drafttek, CBS Sports, Stick to the Model, Fox Sports (Rob Rang), NFL Draft Countdown (Brian Lamb) | Big-board rank numbers |
| A to Z Sports, Walter Football (round 1 only) | Mock-draft pick numbers |
| ESPN | College rosters, class, height and weight, statistics, game logs, headlines, recruiting grades, NFL standings and schedules |
| Wikipedia (CC BY-SA 4.0) and Wikidata (CC0) | Biographical background, relatives who are public figures |

Two of the lists (Fox Sports and NFL Draft Countdown) are single articles; when their authors publish a new edition, its address goes in `ARTICLE_URLS` in `pipeline/config.mjs`.

Deliberately not included: paid or licensed evaluations (PFF grades, ESPN and The Athletic subscriber boards — these are linked instead), sites that do not allow automated reading (NFL Mock Draft Database, NFL Draft Buzz, Tankathon — also linked), rumors or unsourced claims, anything about family members who are not public figures (sentences mentioning relatives are removed from the background text and personal-life sections are not collected), and official logos or player photographs.

## Layout

```
pipeline/           data build: published boards, ESPN, Wikipedia/Wikidata -> public/data
pipeline/sources/   one reader per published board or mock draft
public/data/        generated JSON the site reads
src/scene/          three.js scene: arena, stage and field, player figures, camera
src/ui/             HUD, player file, board panels, charts
src/lib/            stage and field layouts, data lenses, formatting
```

## Deploying

The project is a Vite single-page app; `vercel.json` configures the build, the SPA routes (`/player/:slug`, `/board/:panel`) and caching. It needs no environment variables.

### As a Claude artifact

```bash
npm run build:artifact   # writes dist-artifact/: page.html plus assets/ and data/
```

This packages the same app for publishing as a Claude artifact: asset and data paths are relative, and links use the hash (`#p-<slug>`, `#b-<panel>`) because an artifact cannot own URL paths. `dist-artifact/files.json` lists the supporting files to publish alongside `page.html`. An artifact is a snapshot: it shows the data as of the build, and is refreshed by building and publishing again.

### As a desktop app

The website carries a web app manifest, so Chrome and Edge offer to install it: open the site, then use the install icon at the right of the address bar (or the browser menu, "Install Green Room Atlas"). On a Mac in Safari, use File > Add to Dock. The installed app opens in its own window with its own icon and always shows the same live data as the website.
