# 03 · Data Acquisition & Licensing Plan

Status: Draft v1 · 2026-10-03

We collect text through the MediaWiki Action API (never by scraping rendered HTML), validate it against doc 02, and commit it to the repo as JSON. Images are never collected.

## Sources

| Source | API endpoint | Used for | Text licence |
| --- | --- | --- | --- |
| English Wikipedia | `https://en.wikipedia.org/w/api.php` | Series overview, publication history, reception, chapter and episode lists, film and game articles | CC BY-SA 4.0 |
| Jujutsu Kaisen Fandom wiki | `https://jujutsu-kaisen.fandom.com/api.php` | Characters, techniques, domains, arcs, organizations, locations | CC BY-SA (version read at build time from `meta=siteinfo&siprop=rightsinfo`) |
| Wikidata (optional) | `https://www.wikidata.org/w/api.php` | Stable IDs, release dates | CC0 |

## Pipeline

The scraper is a TypeScript CLI in `scripts/ingest/`, run locally and by a scheduled GitHub Action.

| Step | What it does | API call |
| --- | --- | --- |
| 1. Discover | List candidate pages per entity type | `action=query&list=categorymembers&cmtitle=Category:<X>&cmlimit=500` with `cmcontinue` paging; Fandom also `list=allpages` |
| 2. Diff | Skip pages whose revision hasn't changed | `action=query&prop=info&titles=<50 titles>` → compare `lastrevid` with `content/meta/sources.json` |
| 3. Fetch | Get wikitext for changed pages | `action=query&prop=revisions&rvprop=content\|ids\|timestamp&rvslots=main&titles=<up to 50>&formatversion=2` |
| 4. Cache | Save raw responses under `.cache/raw/` (git-ignored) | — |
| 5. Parse | Extract infobox parameters and sections | `wtf_wikipedia` (wikitext → JSON); `action=parse&prop=text` only for awkward tables |
| 6. Normalize | Map to doc 02 entities, assign spoiler levels, build edges | — |
| 7. Validate | Zod schemas; failures go to `reports/ingest-<date>.md`, never to `content/` | — |
| 8. Write | JSON into `content/`, update `content/meta/sources.json` | — |
| 9. Propose | The Action opens a PR titled "Content sync <date>" with the diff | — |

Fandom category names (e.g. `Category:Characters`, `Category:Cursed Techniques`) are **to be confirmed** in the spike; the sandbox could not reach either API.

## Politeness

- `User-Agent: JJKNextGenUI/0.1 (+<repo URL>; <contact email>)`, as the [Wikimedia User-Agent policy](https://meta.wikimedia.org/wiki/User-Agent_policy) requires.
- One request at a time, minimum 500 ms apart; `maxlag=5` on Wikipedia.
- Honour `Retry-After` and back off exponentially on `429`/`503`.
- Batch titles (50 per request) and rely on the revision diff so a weekly sync touches only changed pages.
- Development reads from `.cache/raw/`; a `--offline` flag forbids network calls.

## Refresh

Weekly, Monday 03:00 UTC, via GitHub Actions cron. A human merges the content PR, so bad upstream edits never deploy automatically.

## Licensing obligations

| Obligation | How we meet it |
| --- | --- |
| Attribution | Every entity page renders a "Sources" block: page title linked to the source page, "from Wikipedia" or "from the Jujutsu Kaisen Wiki", the licence name linked, and a link to the page history (which lists the authors). Generated from `provenance`. |
| Indicate changes | The block states "Adapted and restructured from…". |
| Share-alike | All text in `content/` and on the site is released under CC BY-SA 4.0 (`content/LICENSE`). Code is MIT (`LICENSE`). The README explains the split. |
| Licence version | Fandom text under CC BY-SA 3.0 may be adapted under 4.0 (3.0 → 4.0 is a permitted compatible upgrade per Creative Commons' compatibility rules); we keep the original version in provenance. |
| Images | None collected. Fandom and Wikipedia JJK images are copyrighted or non-free fair use and are not covered by CC BY-SA. |
| Trademarks | Footer: "Unofficial fan project. Jujutsu Kaisen © Gege Akutami / Shueisha, MAPPA." No logos. |
| Corrections and takedowns | Footer contact link and a `CONTENT_ISSUES.md` process; any takedown is handled within 7 days. |

## Risks

| Risk | Mitigation |
| --- | --- |
| Fandom blocks or rate-limits the scraper | Low request rate, caching, clear User-Agent; fall back to Fandom's database dumps (`Special:Statistics` → dumps) if available |
| Infobox templates change upstream | Parser snapshot tests; validation failures reported, never shipped |
| Spoiler levels wrong | Override file plus a "report spoiler" link on every page |
| Licence misunderstanding | Attribution generated from data, reviewed once by a human before launch |
