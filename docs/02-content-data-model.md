# 02 · Content & Data Model

Status: Draft v1 · 2026-10-03

Our own model of the JJK world, independent of how either source wiki structures pages. The scraper maps source data **into** this model; components only ever read this model.

## Principles

- **Stable slugs** are the primary key (`gojo-satoru`, `limitless`, `shibuya-incident`). Japanese name order (family name first) for characters.
- **Every spoilable value carries a spoiler level.** A field is either a plain value or a list of `Gated<T>` values, so one character can show different text per mode.
- **Every record carries provenance**: source wiki, page title, revision id, fetched timestamp, licence.
- **References by slug, not by embedding.** Relationships are resolved at build time.

## Spoiler levels

Ordered; a visitor at level N sees everything ≤ N.

| Level | Key | Covers |
| --- | --- | --- |
| 0 | `none` | Safe for anyone (name, school, first appearance) |
| 1 | `anime-s1` | Anime season 1 + movie 0 |
| 2 | `anime-s2` | Anime season 2 (Hidden Inventory, Shibuya Incident) |
| 3 | `anime-s3` | Anime season 3 (Culling Game), as episodes air |
| 4 | `manga` | Everything to the manga's final chapter |

Anime boundaries are mapped to chapter numbers in `content/meta/spoiler-boundaries.json` so a chapter-referenced fact gets its level automatically (`levelForChapter`, `levelForSeason` in `src/content/schemas/boundaries.ts`). Each level's `throughChapter` is the last chapter *fully* adapted at that level; a chapter an episode adapts only in part belongs to the next level. Verified 2026-10-04 against the Jujutsu Kaisen Wiki's per-episode "adapted from" fields: season 1 ends at chapter 63, season 2 at 137, season 3 (Culling Game Part 1, 12 episodes) at 180, and the manga at 271. A test checks that every arc's `level` matches the level of its first chapter and season. Raise `anime-s3` when Part 2 airs.

## Entities

```ts
// Shared
type Slug = string;                       // kebab-case, unique per entity type
type SpoilerLevel = 'none' | 'anime-s1' | 'anime-s2' | 'anime-s3' | 'manga';
type Gated<T> = { value: T; level: SpoilerLevel };
type Provenance =
  | {                                     // adapted from a wiki page (scripts/ingest)
      source: 'wikipedia' | 'fandom';
      title: string; url: string; revisionId: number;
      fetchedAt: string;                  // ISO date
      licence: 'CC BY-SA 4.0' | 'CC BY-SA 3.0';
    }
  | {                                     // written for this wiki
      source: 'original';
      writtenAt: string;                  // ISO date
      licence: 'CC BY-SA 4.0';
    };
```

| Entity | Key fields | Relationships |
| --- | --- | --- |
| **Character** | slug, name (en, ja, romaji), aliases, summary `Gated<string>[]`, status `Gated<'alive'\|'deceased'\|'unknown'>[]`, species (human, cursed spirit, vessel, incarnated sorcerer…), grade `Gated<Grade>[]`, gender, birthday, height, firstAppearance (chapter, episode), accent colour (ours, for theming) | affiliations → Organization; techniques → CursedTechnique; domain → DomainExpansion; relatives / allies / rivals → Character (typed edges); arcs → Arc |
| **CursedTechnique** | slug, name, type (innate, inherited, extension, reverse, barrier, shikigami…), summary, mechanics `Gated<string>[]`, notable applications | users → Character; domain → DomainExpansion; clan → Organization |
| **DomainExpansion** | slug, name (en, ja), sure-hit effect, appearance description (text only), first shown | user → Character; technique → CursedTechnique |
| **Arc** | slug, name, order, chapter range, episode range, summary `Gated<string>[]`, spoiler level of the arc itself | characters → Character; locations → Location; parent / child arcs |
| **Chapter** | number, title, release date, volume | arc → Arc; characters introduced |
| **Episode** | season, number, title, air date, adapted chapters | arc → Arc |
| **Organization** | slug, name, kind (school, clan, faction, group), summary | members → Character; location → Location |
| **Location** | slug, name, summary | arcs → Arc |
| **Grade** | enum: `special`, `semi-1`, `1`, `semi-2`, `2`, `3`, `4`, `ungraded` | used by Character and cursed spirits |

## Relationship edges

Stored as one list so the relationship graph and per-page "connections" use the same data.

```ts
type Edge = {
  from: Slug; to: Slug;
  kind: 'family' | 'teacher-student' | 'classmate' | 'ally' | 'rival' | 'enemy' | 'vessel-of' | 'member-of';
  label?: string;                         // e.g. "brother", "sensei"
  level: SpoilerLevel;
  provenance: Provenance;
};
```

## Storage layout (in the repo)

```
content/
  characters/<slug>.json
  techniques/<slug>.json
  domains/<slug>.json
  arcs/<slug>.json
  chapters/<number>.json
  episodes/s<season>e<number>.json
  organizations/<slug>.json
  locations/<slug>.json
  edges.json
  links/community.json                    # curated outbound community links (see below)
  meta/spoiler-boundaries.json
  meta/sources.json                       # licence + attribution per source page
```

Each file is validated by a Zod schema in `src/content/schemas/` and exposed as an Astro content collection.

## Community links

`content/links/community.json` is a list of curated outbound links to community discussion (`communityLink` in `src/content/schemas/links.ts`). They are links only: no thread text is copied, fetched or embedded, because posts belong to their authors and often spoil.

```ts
type CommunityLink = {
  id: Slug;                  // unique
  url: string;               // https, on reddit.com, under /r/<community>/
  label: string;             // OUR neutral description, at most 100 chars; never the thread title
  note: string;              // one sentence in our words, at most 200 chars
  community: string;         // e.g. 'r/JuJutsuKaisen'
  targets: Slug[];           // arcs and characters whose pages list it (at least one)
  level: SpoilerLevel;       // how much the thread reveals; the link is gated at this level
  addedAt: string;           // ISO date
  verifiedAt: string;        // when a person last opened it and confirmed it; never before addedAt
};
```

`ReadingList.astro` renders them on arc and character pages as external links (`target="_blank"`, `rel="noopener noreferrer nofollow ugc"`), each wrapped in `Gated`. The build fails on an unknown target or a duplicate id or URL. Reddit is never fetched in CI (it blocks bots), so freshness comes from `verifiedAt`. To add one: open the thread, write the label and note yourself, set `level` by what the thread reveals (when unsure, use `manga`), and add the entry.

## Example record (illustrative, values to be filled by the scraper)

```json
{
  "slug": "gojo-satoru",
  "name": { "en": "Satoru Gojo", "ja": "五条 悟", "romaji": "Gojō Satoru" },
  "grade": [{ "value": "special", "level": "none" }],
  "affiliations": ["tokyo-jujutsu-high", "gojo-clan"],
  "techniques": ["limitless", "six-eyes"],
  "domain": "unlimited-void",
  "accent": "#7cc4ff",
  "summary": [
    { "value": "Special grade sorcerer and teacher at Tokyo Jujutsu High.", "level": "none" }
  ],
  "provenance": [{ "source": "fandom", "title": "Satoru Gojo", "url": "…", "revisionId": 0, "fetchedAt": "…", "licence": "CC BY-SA 3.0" }]
}
```

## Mapping from sources (to verify in the scraper spike)

The thread session could not reach either API from its sandbox, so these mappings are expectations to confirm:

- Fandom character pages use a portable infobox template; its parameters (name, kanji, romaji, gender, age, birthday, height, affiliation, occupation, grade, status, relatives, manga/anime debut) map onto Character fields.
- Spoiler level per fact is **not** in the source. v1 assigns it from the chapter/episode a fact cites, falling back to `manga` when unknown, plus a hand-curated override file `content/meta/spoiler-overrides.json`.
- Wikipedia supplies series-level facts (publication, chapter and episode lists, reception) rather than per-character detail.

## Open items

- Confirm the Fandom infobox parameter names.
- Decide how much summary text we rewrite versus quote (rewritten text is still a CC BY-SA adaptation).
