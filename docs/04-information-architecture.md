# 04 · Information Architecture

Status: Draft v1 · 2026-10-03

## Sitemap and URLs

```
/                                   Home: hero, featured characters, arc timeline teaser, search
/characters                         Filterable grid (grade, affiliation, status, species)
/characters/<slug>                  Character page
/techniques                         Grid grouped by technique type
/techniques/<slug>                  Technique page
/domains                            Domain Expansion gallery
/domains/<slug>                     Domain page (signature takeover animation)
/arcs                               Scroll-driven timeline of all arcs
/arcs/<slug>                        Arc page: summary, chapters, episodes, cast
/media/manga                        Chapter list by volume
/media/anime                        Episode list by season
/organizations/<slug>               School, clan or faction page
/graph                              Full relationship graph
/search?q=                          Search results (Pagefind)
/about                              About, sources and licence, disclaimer
```

Rules: lowercase kebab-case slugs, no trailing slash, one canonical URL per entity, redirects for aliases (`/characters/gojo` → `/characters/gojo-satoru`).

## Global navigation

| Element | Behaviour |
| --- | --- |
| Top bar | Logo, Characters, Techniques, Arcs, Media, Graph; search field; spoiler control |
| Spoiler control | Segmented control: Anime S1 · S2 · S3 · Manga. Stored in `localStorage`, default Anime S1. Changing it re-reveals gated text with a scramble animation |
| Search | `/` shortcut opens a command-palette overlay; results grouped by entity type |
| Mobile | Bottom tab bar (Home, Characters, Arcs, Search) plus a menu sheet |
| Footer | Sources and licence, disclaimer, report a problem |

## Page templates

| Template | Sections, in order |
| --- | --- |
| Character | Header (name, Japanese name, grade badge, status, accent colour) · Summary · Techniques (cards linking to technique pages) · Domain Expansion · Connections (mini graph of first-degree edges) · Arc appearances (horizontal timeline) · Trivia · Sources |
| Technique | Header (name, type) · How it works · Applications (stepped explainer) · Users · Related domain · Sources |
| Domain | Full-screen intro · Sure-hit effect · User · Appearances · Sources |
| Arc | Header with chapter and episode ranges · Summary · Key events (scroll timeline) · Cast · Chapters and episodes · Previous / next arc |
| Grid (characters, techniques) | Filters · result count · grid · empty state |
| Media list | Volume/season groups · item rows linking to arcs |

## Cross-linking rules

- The first mention of any entity in a summary links to it; later mentions don't.
- Every entity page has a Connections block generated from `edges.json`.
- Arc pages link previous/next arc; character pages link the arcs they appear in.
- Links whose target is above the visitor's spoiler level render as a redacted chip ("hidden: manga spoiler") rather than disappearing, so layout doesn't shift.

## Spoiler gating

- Gated text renders server-side for every level, hidden with `hidden` + `data-level`; the client reveals by level. No content is fetched later, so toggling is instant and works offline.
- Page titles, URLs and meta descriptions only use `none`-level data, so search engines and link previews never spoil.
- Search indexes each level separately; results respect the current level.

## Core user journeys

1. **New viewer looks up a character after an episode.** Search `gojo` → character page at Anime S1 level → reads summary and techniques → follows Limitless → technique page.
2. **Manga reader explores relationships.** Switches to Manga → opens Graph → filters by Tokyo Jujutsu High → drags nodes, clicks a teacher-student edge → lands on a character page.
3. **Lore hunter compares domains.** Domains gallery → opens Unlimited Void → takeover intro → sure-hit effect → user → back to gallery with layout transition preserved.

## Search

Pagefind index built at deploy time. Ranking: exact name or alias match first, then entity type (character > technique > arc > other), then text relevance. Filters: entity type, spoiler level (implicit).

## Open items

- Whether `/graph` ships in v1 or v1.1, depending on performance on mid-range phones.
