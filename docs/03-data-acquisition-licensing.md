# 03 · Data Acquisition & Licensing Plan

Status: Draft v2 · 2026-10-03 (pipeline built; live API not yet exercised)

We collect text through the MediaWiki Action API (never by scraping rendered HTML), validate it against doc 02, and commit it to the repo as JSON. Images are never collected.

## Sources

| Source | API endpoint | Used for | Text licence |
| --- | --- | --- | --- |
| English Wikipedia | `https://en.wikipedia.org/w/api.php` | Series overview, publication history, reception, chapter and episode lists, film and game articles | CC BY-SA 4.0 |
| Jujutsu Kaisen Fandom wiki | `https://jujutsu-kaisen.fandom.com/api.php` | Characters, techniques, domains, arcs, organizations, locations | CC BY-SA (version read at build time from `meta=siteinfo&siprop=rightsinfo`) |
| Wikidata (optional) | `https://www.wikidata.org/w/api.php` | Stable IDs, release dates | CC0 |

## Pipeline (as built)

The ingest CLI lives in `scripts/ingest/` and is run locally and by the weekly `content-sync` workflow (doc 06). It is plain TypeScript with no new runtime dependencies. It runs under `tsx` (a dev dependency) because the Zod schemas in `src/content/schemas/` use extensionless relative imports, which Node's built-in type stripping cannot resolve. The pipeline's own modules use `.ts` specifiers and only erasable syntax (no enums, namespaces or parameter properties), so they would run under plain `node` once the schemas do.

| Step | What it does | API call / module |
| --- | --- | --- |
| 0. Site info | Read the licence and URL pattern; refuse anything that is not CC BY-SA | `meta=siteinfo&siprop=general\|rightsinfo` |
| 1. Discover | Seed titles from existing records (provenance titles, `name.en`, `scripts/ingest/title-aliases.json`, arc aliases), then list category members per entity type (`config.ts`) | `list=categorymembers&cmtitle=Category:<X>&cmtype=page&cmlimit=500`, following `continue` |
| 2. Diff | Current revision ids for all titles, following normalization and redirects; skip pages whose `lastrevid` equals the one in `content/meta/sources.json` | `prop=info&titles=<50>&redirects=1` |
| 3. Fetch | Wikitext of the changed **revisions** (by revid, so responses are immutable and cacheable) | `prop=revisions&rvprop=content\|ids\|timestamp&rvslots=main&revids=<50>` |
| 4. Cache | Every response is stored under `.cache/raw/<host>/<sha256(url)>.json` (git-ignored); revid requests are served from it even online | `mediawiki.ts` |
| 5. Parse | Templates (nested braces, `{{{params}}}`), links, refs, comments, `<br>`, tables, galleries, sections by `==` heading, plain text | `wikitext.ts` (our own parser, not `wtf_wikipedia`) |
| 6. Map | Infobox params and sections → doc 02 entities, spoiler levels, family edges from `relatives`; references resolved by name to slugs | `map/*.ts`, `spoilers.ts`, `slugs.ts` |
| 7. Merge | Into the existing JSON, keeping hand-curated fields (see below) | `merge.ts` |
| 8. Validate | Every record against the Zod schemas, then the whole dataset with `findDanglingRefs`. A reference to a record that failed is pruned and reported; a record that still fails is not written | `run.ts` |
| 9. Write | 2-space JSON with a trailing newline into `content/`; `content/meta/sources.json` (`{ "<source>": { "<title>": <revisionId> } }`); `reports/ingest-<date>.md` (git-ignored) | `run.ts`, `report.ts` |
| 10. Propose | The workflow opens or updates a PR "Content sync <date>" from `content/sync` into `develop` | `.github/workflows/content-sync.yml` |

Fandom is ingested by `run.ts`. Wikipedia is now ingested too, by `episodes.ts` (`pnpm ingest:episodes`): it reads the per-season pages (`Jujutsu Kaisen season 1`–3), which carry one `{{Episode list}}` per episode, and writes `content/episodes/*.json` with CC BY-SA 4.0 provenance. `chapters.ts` (`pnpm ingest:chapters`) does the same for `List of Jujutsu Kaisen chapters`, whose `{{Graphic novel list}}` templates give 271 chapters across 30 volumes. Both are separate entry points from the Fandom run, which discovers pages by category.

### What the mappers read

Infobox parameter names and category names on the live wiki are **unverified**: the sandbox that built this could not reach Fandom or Wikipedia. Each field therefore accepts several candidate parameter names (`P` in `map/common.ts`), for example `kanji`/`japanese`/`jname` for the Japanese name and `affiliation`/`affiliations`/`organization` for affiliations. Every non-empty parameter that no mapper reads is listed in the report's "Unmapped infobox parameters" table, with the pages that use it. `gender`, `birthday`, `height` and the debuts used to show up there; they are mapped as of roadmap A5. A category that returns no pages is reported as a warning.

| Entity | Created from the source? | Fields taken from the source |
| --- | --- | --- |
| Character | yes | `name.ja`/`romaji`, aliases, species, status, grade, summary (lead plus one paragraph per arc section), affiliations, techniques, domain; family edges from `relatives` |
| Technique | yes (`kind` defaults to `other`) | name, kind, summary (lead), mechanics (first paragraph per section), users, domain, clan |
| Domain | yes, if `user` resolves to a character | name, summary, sure-hit (infobox and "Sure-hit"/"Effect" sections), user, technique |
| Arc | **no**: only arcs already in `content/arcs/` are updated, because order and level are ours | summary (lead), chapters |
| Organization | yes | name, kind, summary, location |
| Location | yes | name, summary |

Slugs: an existing record matched by provenance title, title alias, `name.en` or alias keeps its slug. A new character gets a family-name-first slug from its infobox romaji (`Gojō Satoru` → `gojo-satoru`), or else from reversing a two-word title. Other entities slugify the title.

### Merge rules

- Kept as curated, never taken from the source: `slug`, `level`, `accent`, `palette`, `order`, `episodes`, `events`, `name.en`, an arc's `name`, and every field the source does not provide.
- Replaced by the source when it provides a non-empty value: gated text (`summary`, `mechanics`, `sureHit`), `species`, `status`, `grade`, `kind`, `chapters` and single references.
- Unioned: reference lists (`affiliations`, `techniques`, `users`, `characters`, `locations`) and `aliases`.
- `edges.json`: hand-written edges are kept verbatim. A sourced edge is appended only when no edge of the same kind already joins the same pair. The relative is `from`, so the label (`"father"`) describes `from`, as in our hand-written edges.
- A record with an `original` provenance entry (written for this wiki, such as the arcs) keeps its own `summary`, `mechanics`, `sureHit` and `chapters`; the source can still add references and aliases. If the source supplies nothing a written record can take, the page is not credited and the record is left untouched.
- `fixture` becomes `false`. The provenance entry for that source page is replaced (`source`, `title`, `url` from siteinfo's `server` + `articlepath`, `revisionId`, `fetchedAt`, `licence`). Re-mapping the same revision keeps the original `fetchedAt`, so `--force` produces no diff.
- The licence comes from `rightsinfo`: a URL or text naming 4.0 or 3.0 maps to `CC BY-SA 4.0` or `CC BY-SA 3.0`. If Fandom reports `https://www.fandom.com/licensing` with no version, its text is recorded as `CC BY-SA 3.0` and the report says the version was inferred. NC, ND or unrecognised licences abort the run.

## Spoiler policy

The sources carry no spoiler levels, so the mapper assigns them (`scripts/ingest/spoilers.ts`):

| Text or value | Level |
| --- | --- |
| Lead text, and sections under **Appearance** or **Personality** | `none` |
| Text under a heading that names an arc (the deepest such heading wins) | that arc's `level` from `content/arcs/*.json`. Heading aliases (e.g. "Introduction Arc", "Gojo's Past Arc") live in `scripts/ingest/arc-aliases.json`, whose `extra` list also covers arcs we have no record for: Jujutsu Kaisen 0 → `anime-s1`; Itadori's Extermination, Perfect Preparation and Execution → `manga` until verified |
| Grade and species list items | the arc's level if the item names an arc (e.g. "Semi-Grade 1 (after the Shibuya Incident)"); otherwise `none` for the first listed value and `manga` for the rest |
| Infobox status, infobox sure-hit text, family edges, and anything else that cannot be attributed to an arc | `manga` (safe default) |
| A new record's own `level` | characters: the level of the earliest arc-named section on their page; otherwise `manga` |

Two rules apply after mapping and merging:

1. **Overrides.** `content/meta/spoiler-overrides.json` is curated by hand (an empty object to start). Keys are `<type>/<slug>` or `edges/<edge id>`. Values map a field to a level: `"level"` sets the record level, `"<field>"` sets every entry of a gated list, and `"<field>.<n>"` sets one entry. Overrides are applied on every run to every record, including records the source did not touch, so editing the file takes effect without a refetch. An override path that matches nothing is reported as a warning.

   ```json
   { "characters/itadori-yuji": { "species.1": "none" }, "characters/gojo-satoru": { "status": "manga" } }
   ```

2. **Clamp.** No gated value may sit below its record's level (the content tests enforce this), so lower values are raised to the record level. This stops a manga-only character's lead from leaking at a lower setting.

Known weakness: Fandom leads are written for readers who have finished the story and can contain late spoilers. The policy still treats lead text as `none`, so review new lead text in the sync PR and add overrides where needed.

## Running it

```sh
pnpm ingest                         # network run: fetch changed pages, write content/ and the report
pnpm ingest --dry-run               # map and validate only; writes the report, not content/
pnpm ingest --only=characters,techniques --limit=20
pnpm ingest --force                 # re-map unchanged revisions (e.g. after changing a mapper)
pnpm ingest:offline                 # replay .cache/raw only; any cache miss is an error
pnpm ingest:offline --fixtures=tests/ingest/fixtures/api --content-dir=/tmp/jjk/content
```

Other flags: `--content-dir`, `--report-dir` and `--cache-dir`. The exit code is non-zero only for a fatal error (licence refusal, network failure, offline cache miss). Per-record failures are listed in the report and those records are left unchanged. A failed page is not recorded in `sources.json`, so it is retried on the next run.

The tests (`tests/ingest/`, part of `pnpm test`) run entirely offline:

- parser cases;
- mappers over recorded `formatversion=2` API responses in `tests/ingest/fixtures/api/`;
- the client against a fake `fetch` (backoff, `Retry-After`, continuation, batching, cache);
- an end-to-end run into a temp copy of a frozen snapshot of `content/` (`tests/ingest/fixtures/content/`).

The fixture pages were written by hand to mimic Fandom's markup. **The live API has not been exercised yet.** Check the first real run's report for empty categories, unmapped parameters and unresolved references, then adjust `config.ts`, the candidate names in `map/common.ts`, and `title-aliases.json`.

## Politeness

- `User-Agent: JJKNextGenWiki/0.1 (+https://github.com/KumbiraiShonhiwa/jjk-nextgen-wiki)` (also sent as `Api-User-Agent`), as the [Wikimedia User-Agent policy](https://meta.wikimedia.org/wiki/User-Agent_policy) requires; the repository URL is the contact.
- One request at a time, minimum 500 ms apart; `maxlag=5` on Wikipedia, and the `maxlag` API error is retried.
- Honour `Retry-After` (seconds or HTTP date) on `429`/`503`; otherwise back off exponentially (1 s, 2 s, 4 s, … capped at 60 s, at most 5 retries).
- Batch titles and revids 50 per request, and rely on the revision diff so a weekly sync touches only changed pages.
- Development reads from `.cache/raw/`; `--offline` forbids network calls.

## Refresh

Weekly, Monday 03:00 UTC, via the `content-sync` workflow (doc 06). A human merges the content PR, so bad upstream edits never deploy automatically.

## Licensing obligations

| Obligation | How we meet it |
| --- | --- |
| Attribution | Every entity page renders a "Sources" block: page title linked to the source page, "from Wikipedia" or "from the Jujutsu Kaisen Wiki", the licence name linked, and a link to the page history (which lists the authors). Generated from `provenance`. |
| Indicate changes | The block states "Adapted and restructured from…". |
| Share-alike | All text in `content/` and on the site is released under CC BY-SA 4.0 (`content/LICENSE`). Code is MIT (`LICENSE`). The README explains the split. |
| Licence version | Fandom text under CC BY-SA 3.0 may be adapted under 4.0 (3.0 → 4.0 is a permitted compatible upgrade per Creative Commons' compatibility rules); we keep the original version in provenance. |
| Original text | Arcs, events and their summaries are written for this wiki and carry `source: 'original'` provenance, shown as "Written for this wiki", released under CC BY-SA 4.0. Facts such as chapter and episode ranges are checked against Wikipedia and the wiki's episode pages. |
| Reddit and other community sites | Never a text source: posts belong to their authors, are not CC BY-SA, and Reddit's terms restrict scraping and reuse. The ingest refuses any source that is not CC BY-SA, and the `provenance` schema has no Reddit source. Community discussion may only be linked to, not copied or paraphrased. |
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
