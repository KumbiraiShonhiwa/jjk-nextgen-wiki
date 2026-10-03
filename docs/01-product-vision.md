# 01 · Product Vision & Principles

Status: Draft v1 · 2026-10-03 · Owner: project lead

## One line

An unofficial Jujutsu Kaisen encyclopedia that feels like opening a Domain Expansion: every page is readable in seconds, and motion explains how the world connects.

## Problem

Existing JJK references are thorough but hard to enjoy:

- **Dense and static.** Long scroll-of-text pages with infoboxes; relationships between characters, techniques and arcs are buried in prose.
- **Spoilers everywhere.** Anime-only viewers hit manga spoilers in the first paragraph or the infobox.
- **Noisy.** Ad-heavy layouts, slow pages on phones.
- **No sense of the world.** The source material is visually striking; the references look like spreadsheets.

## Audiences

| Audience | What they want | What we give them |
| --- | --- | --- |
| New anime viewer | Who is this character, without spoilers | Spoiler toggle defaulting to anime-only; short summaries first |
| Manga reader | Full lore, cross-references, arc timeline | Full-manga mode, relationship graph, arc timeline |
| Lore hunter | Technique mechanics, domain details, grades | Structured technique pages, comparisons, search |
| Design-curious visitor | A showcase of modern web motion | Signature Anime.js moments, polished micro-interactions |

## Principles

1. **Motion explains, never decorates.** Every animation reveals structure (hierarchy, relationship, sequence, cause). If it doesn't, it's cut.
2. **Spoilers are opt-in.** Every field carries a spoiler level; the default view is anime-only.
3. **Readable first, then spectacular.** Content is server-rendered HTML and fully usable with JS disabled or reduced motion on.
4. **Fast on a mid-range phone.** Performance budgets are release blockers, not goals (see doc 10).
5. **Credit the community.** Every page attributes its source wiki and authors under CC BY-SA.
6. **Original visuals.** No copied artwork; the look comes from typography, ink-style SVG and generated cursed-energy effects.

## Success measures (first 3 months after launch)

| Measure | Target |
| --- | --- |
| Lighthouse performance (mobile) | ≥ 90 on every template |
| LCP / INP / CLS (p75, field data) | < 2.0 s / < 200 ms / < 0.05 |
| Pages per visit | ≥ 3 |
| Search-to-click rate | ≥ 60% |
| Accessibility | WCAG 2.2 AA, zero axe-core violations in CI |

## Scope of v1

In: characters, cursed techniques, domain expansions, arcs, chapters, episodes, organizations, search, spoiler toggle, relationship graph, arc timeline.

## Non-goals for v1

- User accounts, editing or comments (we are a reader, not a wiki host).
- Forums, news, merchandise.
- Languages other than English.
- Official artwork or screenshots.

## Assumed decisions (from the foundation plan; change here if they change)

Sources: English Wikipedia + Jujutsu Kaisen Fandom wiki · spoilers: full manga, gated, default anime-only · images: original only · framework: Astro · Anime.js 4.5 · 3D: hero only · look: manga ink with cursed-energy accents · hosting: Cloudflare Pages · English only.

## Disclaimer

Unofficial fan project. Jujutsu Kaisen and its characters belong to Gege Akutami, Shueisha and MAPPA.
