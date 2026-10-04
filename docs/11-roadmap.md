# 11 · Roadmap: finishing v1, then v2

Status: Draft v1 · 2026-10-04 · Owner: project lead

This doc picks up from `docs/10`. Part A lists what the v1 scope (doc 01) and the IA (doc 04) promise but the code does not have yet. Part B adds new features for the next version. Part C puts both into milestones. Every feature follows the doc 01 principles: static output, spoilers are opt-in, motion explains, no accounts.

## Part A · Gaps in v1 (promised, not built)

Checked against the code on `develop` at `5b81408`.

| # | Gap | Promised in | What exists today | Work |
|---|-----|-------------|-------------------|------|
| A1 | **Chapters and episodes** | doc 01 scope, doc 02 entities, doc 04 `/media/*` | No `chapter` or `episode` schema, collection or page. Arcs only hold a chapter range and `[season, first, last]` episodes | Add both schemas and collections. Add `/media/manga` (by volume) and `/media/anime` (by season). Ingest from Wikipedia's chapter and episode lists, the first Wikipedia mapping (doc 03 notes none exists yet) |
| A2 | **Spoiler boundaries file** | doc 02 | `content/meta/spoiler-boundaries.json` does not exist, so chapter-cited facts can't get a level automatically | Write the chapter → level table, verify it against the episode lists from A1, and make `scripts/ingest/spoilers.ts` read it |
| A3 | **Location pages** | doc 04 | The `locations` collection exists with 3 records, but there are no routes. Arc pages can't link to them | `/locations` and `/locations/<slug>`: summary, arcs set there, organizations based there |
| A4 | **Alias redirects** | doc 04 ("`/characters/gojo` → `/characters/gojo-satoru`") | None | Generate Astro `redirects` from each record's `aliases` at build time. Add a unit test that fails if two records claim the same alias |
| A5 | **Missing character fields** | doc 02 | `gender`, `birthday`, `height` and `firstAppearance` aren't in the schema, so the ingest report lists them as unmapped | Add them to `src/content/schemas/character.ts` (gate `firstAppearance` by level) and map them in `scripts/ingest/map/character.ts` |
| A6 | **Mobile bottom tab bar** | doc 04 | The header has a mobile menu only | Bottom tab bar (Home, Characters, Arcs, Search) with a safe-area inset. Add Media to `NAV` once A1 lands |
| A7 | **Footer "Report a problem"** | doc 04 | Missing | A link to a GitHub issue form, pre-filled with the page URL and spoiler level. Add an issue template to `.github/ISSUE_TEMPLATE/` |
| A8 | ~~**Home hero and Three.js hero**~~ **Done** | doc 08, ADR-007, doc 10 next steps 3 and 6 | Full-bleed hero with a stat row, edge-bled sigil, and the lazy WebGL field at 130.5 KiB gzip behind ADR-007's guards | — |
| A9 | **Page transitions** | doc 10 next step 4 | `ClientRouter` is mounted but there's no custom transition motion | Use `transition:name` on entity cards and headers so card → page morphs. Keep `motionScope` cleanup on `astro:before-swap` |
| A10 | ~~**Doc and config drift**~~ **Done** | doc 10 | README lists 01–11; doc 08 no longer marks `graph-physics` as planned; `.github/rulesets/*.json` now mirror the live rulesets (the security checks and `require_extra_approval_for_unattributed_changes` were live but unrecorded). Note: the committed `develop` ruleset declared a `merge_queue` rule that is **not** enabled live — the file now matches reality, so re-enable it in the GitHub UI if it is wanted | — |
| A11 | **Visual and Lighthouse checks** | ADR-009 | Left out on purpose (doc 10) | Add Playwright screenshot tests for the five templates. Revisit Lighthouse CI after B10 (PWA) lands |

## Part B · New features

Sorted by audience (doc 01). Each feature lists its data, route, signature motion and spoiler behaviour.

### For new anime viewers

**B1 · Episode-precise spoiler progress.** The five spoiler buckets are coarse: someone at S2E5 has to choose between seeing too little and seeing Shibuya. Add a second, finer control: "I've watched up to S2 E5" or "I've read up to ch. 120".
- Data: gated values may carry an optional `at: { chapter?: number; episode?: [season, number] }` next to `level`. The ingest fills it from citations, and `level` stays the fallback, so nothing breaks.
- Gating stays CSS-first. The build emits `data-ch` on gated nodes, and the head script injects one generated `<style>` rule for the visitor's chapter. Without JavaScript, the bucket rules still apply.
- Motion: the existing `spoiler-reveal` scramble, played only on the newly crossed facts.
- Depends on A1 and A2.

**B2 · Episode companion.** On each `/media/anime/s<n>e<m>`, list who appeared, the techniques shown, new glossary terms (B4) and the arc's position, all gated at that episode. Add a "Just watched this" button that sets the spoiler progress (B1) to this episode in one tap.

**B3 · "Previously on" recaps.** On arc pages, a short "before this arc" summary built from the previous arc's gated `events`, so returning viewers catch up without scrolling back.

### For lore hunters

**B4 · Glossary with inline definitions.** Jujutsu terms (cursed energy, Binding Vow, Black Flash, Reverse Cursed Technique, Simple Domain, Heavenly Restriction, Domain Amplification) are the main obstacle for new readers.
- Data: a new `term` collection (slug, name, gated definition, related techniques).
- Route: `/glossary` with an A–Z index and `/glossary/<slug>`.
- In body text, the first mention of a term gets a dotted underline and a popover definition: CSS `popover`, keyboard reachable, no JavaScript required.
- Uses doc 04's first-mention linking rule, so a page links a term once.

**B5 · Technique explainers.** Doc 04 already specifies "Applications (stepped explainer)" on technique pages, but it isn't built. Add one interactive stepped diagram per flagship technique: Limitless (Infinity, Blue, Red, Hollow Purple), Ten Shadows (a shikigami tree that unlocks by spoiler level), Ratio (the 7:3 strike point), Idle Transfiguration.
- Built from SVG plus `createTimeline`. Each step is gated, and the steps are buttons, so a step can be read without animation.
- Signature motion: `technique-steps`, which morphs between step diagrams with `svg.morphTo`.

**B6 · Fights.** Battles are the spine of JJK and currently live only as arc `events`. Fight records are hand-curated (see Decisions).
- Data: a new `fight` collection (slug, arc, chapter/episode, participants, techniques used, location, gated outcome).
- Routes: `/fights` and `/fights/<slug>`. Add a "Fights" section to character pages and a fight list to arc pages.
- Graph: participants get a derived `fought` edge that is not stored in `edges.json`. It shows in B8 as a toggle.
- Outcomes are always gated at the fight's own level, never `none`. A unit test enforces this.

**B7 · Compare.** `/compare?a=gojo-satoru&b=ryomen-sukuna`: two characters (or two domains) side by side, covering grade, techniques, domain, shared arcs, fights between them (B6) and their shortest path in the graph.
- Static page plus a small Svelte island reading a build-time JSON index (`/compare-index.json`, `none`-level fields plus gated ones tagged by level). The island never shows fields above the visitor's level.
- Motion: the two columns slide in from opposite edges, and matching rows connect with a drawn line.

**B8 · Graph v2.** This expands doc 10's next step 5.
- Filter by organization, arc and edge kind (the filters exist in the URL so a view can be shared).
- **Arc scrubber**: drag through the arcs and watch edges appear, change (ally → enemy) and disappear. Edges need an optional `arcs: [from, to]` validity range.
- **"How are they connected?"**: pick two characters and the graph highlights the shortest path (BFS in `src/lib/graph.ts`), drawn with `svg.createMotionPath`.
- Performance: render nodes only above a degree threshold on small screens, with the list fallback that already exists.

**B9 · Bestiary.** A gallery of cursed spirits and shikigami (species already exists on characters), with filters for grade, origin (natural, man-made, disaster) and summoner. This is mostly a filtered view over existing data, so it's cheap.

### For everyone

**B10 · Offline and installable (PWA).** The site is static and gating needs no network, so it can work fully offline. Add a manifest and a service worker that precaches the shell, fonts and the pages already visited, with Pagefind chunks cached on first use. Count the service worker toward the JS budget.

**B11 · Share cards.** Generate an Open Graph image per entity at build time (Satori to SVG to PNG), using only `none`-level data, the accent colour and the generated portrait. Link previews stay spoiler-free (doc 04's rule) and look like the site. The images are original, so principle 6 holds.

**B12 · Keyboard power use.** Extend the `/` search palette with commands: "go to random character", "set spoiler level", "toggle reduced motion", "compare with…". Add `j`/`k` to move between cards in grids.

**B13 · Content coverage page.** `/about/coverage` lists records still marked `fixture`, empty fields, last sync date and source revision per page. It makes the content-sync backlog visible and helps reviewers of the weekly sync PR.

### Explicitly still out (from doc 01)

Accounts, comments, editing, languages other than English, official artwork. B10 and B12 keep all state in `localStorage`, so none of them needs a server.

## Part C · Milestones

| Milestone | Contents | Exit criteria |
|-----------|----------|---------------|
| **v1.0 · Complete** | A1–A7, A10, plus real content from the first full content sync | Every route in doc 04 exists. Zero `fixture` records for the 11 core characters. Budgets and axe still green |
| **v1.1 · Polish** | A8, A9, A11, B4 glossary, B11 share cards, B12 | Lighthouse mobile ≥ 90 on the home page with the Three.js hero |
| **v2.0 · Depth** (built in parallel with v1.0) | B1, B2, B5, B6, B7, B8 | Episode-precise gating works with JS off at bucket granularity. Fights and Compare are linked from every character page |
| **v2.x · Reach** | B3, B9, B10, B13 | Site loads offline after one visit |

Suggested build order inside v1.0: A10 (cheap, unblocks clean diffs) → A5 → A1 + A2 together → A3 → A4 → A6 + A7.

## Schema changes at a glance

| Change | Files | Breaking? |
|--------|-------|-----------|
| `chapter`, `episode`, `term`, `fight` schemas and collections | `src/content/schemas/`, `src/content.config.ts`, `content/<type>/` | No (new) |
| Character `gender`, `birthday`, `height`, `firstAppearance` | `character.ts`, ingest mapper | No (optional) |
| Optional `at` on `Gated<T>` | `common.ts`, every gated renderer | No (optional, `level` stays) |
| Optional `arcs` validity range on edges | `entities.ts`, `src/lib/graph.ts` | No (optional) |
| `fought` derived edge kind | `src/lib/graph.ts` only, not `EDGE_KINDS` | No |

## Decisions (owner, 2026-10-04)

1. **Parallel tracks.** Part A (finishing v1) and Part B (v2 features) go ahead side by side. Milestones still order the releases, but v2 work doesn't wait for v1.0 to ship, as long as it doesn't block a Part A item.
2. **Episode-precise spoilers (B1) are in.** Episode-level precision is worth the extra ingest work and override curation. A1 and A2 are prerequisites, so they come first on the v1 track.
3. **Fights (B6) are hand-curated.** `content/fights/` is written by hand, like arc `order` and `level`. The ingest never creates or changes fight records, and `merge.ts` must leave the directory alone. A unit test checks that an ingest run doesn't touch `content/fights/`.
4. **Share cards (B11) are in.** The build-time image dependency (Satori plus resvg) and the extra build time are acceptable. Record the measured build time in the PR that adds it.
