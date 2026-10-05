/**
 * Spoiler policy (documented in docs/03 § Spoiler policy).
 *
 * - Lead text and Appearance / Personality sections: `none`.
 * - Text under a heading that names an arc (arc name or an alias in arc-aliases.json):
 *   that arc's level, taken from content/arcs/*.json (or the alias table's `extra` levels).
 * - Text that cites a chapter or an anime season, with no arc heading above it: the level from
 *   content/meta/spoiler-boundaries.json, so a fact cited to chapter 12 is anime-s1 rather than
 *   falling all the way to the safe default.
 * - Everything else, including infobox status: `manga` (safe default).
 * - Grades / species without arc context: the first listed value is `none`, the rest `manga`.
 * - Gated values are never below the record's own level (clamp), so a manga-only
 *   character's lead cannot leak through a lower setting.
 * - content/meta/spoiler-overrides.json can set any field's level by hand.
 */
import { z } from 'astro/zod';
import { SPOILER_LEVELS, spoilerLevel, type SpoilerLevel } from '../../src/content/schemas/index.ts';
import { levelForChapter, levelForSeason, type SpoilerBoundaries } from '../../src/content/schemas/boundaries.ts';
import type { Section } from './wikitext.ts';

export const rank = (l: SpoilerLevel) => SPOILER_LEVELS.indexOf(l);
export const maxLevel = (...ls: SpoilerLevel[]): SpoilerLevel => ls.reduce((a, b) => (rank(b) > rank(a) ? b : a), 'none');
export const minLevel = (...ls: SpoilerLevel[]): SpoilerLevel => ls.reduce((a, b) => (rank(b) < rank(a) ? b : a), 'manga');

export const arcAliasTable = z.object({
  /** Arc slug (content/arcs) → headings that name it, besides its own name. */
  arcs: z.record(z.string(), z.array(z.string())),
  /** Arcs we have no record for, with a fixed level. */
  extra: z.array(z.object({ aliases: z.array(z.string()).min(1), level: spoilerLevel })).default([]),
});
export type ArcAliasTable = z.infer<typeof arcAliasTable>;

export interface ArcRef {
  slug: string;
  name: string;
  level: SpoilerLevel;
}

export interface ArcMatch {
  arc?: string;
  level: SpoilerLevel;
  alias: string;
}

/** Lower-cased, punctuation-free, without a trailing "arc"/"saga" and a leading "the". */
export function normalizeHeading(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the /, '')
    .replace(/ (arc|saga|part \d+|arc part \d+)$/, '')
    .trim();
}

export const SAFE_HEADINGS = ['appearance', 'personality'] as const;
export const SAFE_LEAD: SpoilerLevel = 'none';
export const DEFAULT_LEVEL: SpoilerLevel = 'manga';

/** "Chapter 136", "chapters 54-56", "ch. 12". The first number is the one that dates the fact. */
const CHAPTER_RE = /\bch(?:apter)?s?\.?\s*(\d{1,3})\b/i;
/** "Season 2", "S2". Episode numbers need the episode list (A1) to resolve, so they are left alone. */
const SEASON_RE = /\bseason\s*(\d)\b|\bs(\d)\b(?!\d)/i;

export class SpoilerPolicy {
  private aliases: { norm: string; alias: string; arc?: string; level: SpoilerLevel }[] = [];
  private boundaries?: SpoilerBoundaries;

  constructor(arcs: ArcRef[], table: ArcAliasTable, boundaries?: SpoilerBoundaries) {
    this.boundaries = boundaries;
    const add = (alias: string, level: SpoilerLevel, arc?: string) => {
      const norm = normalizeHeading(alias);
      if (norm) this.aliases.push({ norm, alias, arc, level });
    };
    for (const a of arcs) {
      add(a.name, a.level, a.slug);
      for (const alias of table.arcs[a.slug] ?? []) add(alias, a.level, a.slug);
    }
    for (const e of table.extra) for (const alias of e.aliases) add(alias, e.level);
    // Longest alias first so "Culling Game" does not shadow a longer, more specific name.
    this.aliases.sort((x, y) => y.norm.length - x.norm.length);
  }

  /** The arc a heading or phrase names, matching whole words. */
  matchArc(text: string): ArcMatch | undefined {
    const norm = ` ${normalizeHeading(text)} `;
    const hits = this.aliases.filter((a) => norm.includes(` ${a.norm} `));
    if (!hits.length) return undefined;
    // Several arcs named at once (e.g. "Shibuya Incident and Culling Game"): the most spoilery wins.
    const worst = hits.reduce((a, b) => (rank(b.level) > rank(a.level) ? b : a));
    return { arc: worst.arc, level: worst.level, alias: worst.alias };
  }

  /**
   * The level a chapter or season citation implies, from the boundary table. Returns undefined when
   * there is no table loaded or nothing cited, so callers keep their existing fallback.
   */
  matchCitation(text: string): SpoilerLevel | undefined {
    if (!this.boundaries) return undefined;
    const chapter = CHAPTER_RE.exec(text);
    if (chapter) return levelForChapter(this.boundaries, Number(chapter[1]));
    const season = SEASON_RE.exec(text);
    if (season) return levelForSeason(this.boundaries, Number(season[1] ?? season[2]));
    return undefined;
  }

  /** Level for a section's text: deepest arc-named heading, else safe headings, else manga. */
  sectionLevel(section: Pick<Section, 'path'>): SpoilerLevel {
    if (section.path.length === 0) return SAFE_LEAD;
    for (let i = section.path.length - 1; i >= 0; i--) {
      const m = this.matchArc(section.path[i]);
      if (m) return m.level;
    }
    const top = normalizeHeading(section.path[0]);
    if ((SAFE_HEADINGS as readonly string[]).includes(top)) return 'none';
    // No arc named anywhere above: a chapter or season cited in a heading still dates the section.
    return this.matchCitation(section.path.join(' ')) ?? DEFAULT_LEVEL;
  }

  /** Level for the i-th item of an infobox list (grade, species). */
  listItemLevel(text: string, index: number): SpoilerLevel {
    const m = this.matchArc(text);
    if (m) return m.level;
    const cited = this.matchCitation(text);
    if (cited) return cited;
    return index === 0 ? 'none' : DEFAULT_LEVEL;
  }
}

/* ------------------------------------------------------------------ overrides */

const overrideKey = z.string().regex(/^(characters|techniques|domains|arcs|organizations|locations|edges)\/[a-z0-9-]+$/, '"<type>/<slug-or-edge-id>"');
/** `{ "characters/gojo-satoru": { "status": "manga", "grade.0": "none", "level": "anime-s1" } }` */
export const spoilerOverrides = z.record(overrideKey, z.record(z.string().regex(/^[a-zA-Z]+(\.\d+)?$/), spoilerLevel));
export type SpoilerOverrides = z.infer<typeof spoilerOverrides>;

type Gated = { value: unknown; level: SpoilerLevel };
const isGatedList = (v: unknown): v is Gated[] =>
  Array.isArray(v) && v.every((x) => x && typeof x === 'object' && 'level' in x && 'value' in x);

/**
 * Applies overrides for one record in place. Returns the override paths that matched nothing.
 * `level` sets the record level; `<field>` sets every gated entry; `<field>.<n>` one entry.
 */
export function applyOverrides(record: Record<string, unknown>, overrides: Record<string, SpoilerLevel> | undefined): string[] {
  const unused: string[] = [];
  for (const [path, level] of Object.entries(overrides ?? {})) {
    const [field, idx] = path.split('.');
    if (field === 'level' && idx === undefined) {
      record.level = level;
      continue;
    }
    const v = record[field];
    if (!isGatedList(v)) {
      // Arc events carry their own level too.
      if (Array.isArray(v) && v.every((x) => x && typeof x === 'object' && 'level' in x)) {
        const list = v as { level: SpoilerLevel }[];
        if (idx === undefined) list.forEach((x) => (x.level = level));
        else if (list[Number(idx)]) list[Number(idx)].level = level;
        else unused.push(path);
        continue;
      }
      unused.push(path);
      continue;
    }
    if (idx === undefined) v.forEach((x) => (x.level = level));
    else if (v[Number(idx)]) v[Number(idx)].level = level;
    else unused.push(path);
  }
  return unused;
}

/** Raises every gated value below the record's level up to it. Returns the paths that changed. */
export function clampToRecordLevel(record: Record<string, unknown>): string[] {
  const floor = (record.level as SpoilerLevel | undefined) ?? 'none';
  const changed: string[] = [];
  for (const [field, v] of Object.entries(record)) {
    if (!Array.isArray(v)) continue;
    v.forEach((x, i) => {
      if (x && typeof x === 'object' && 'level' in x && rank((x as Gated).level) < rank(floor)) {
        (x as Gated).level = floor;
        changed.push(`${field}.${i}`);
      }
    });
  }
  return changed;
}
