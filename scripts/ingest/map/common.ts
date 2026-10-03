import type { SpoilerLevel } from '../../../src/content/schemas/index.ts';
import type { EntityType } from '../slugs.ts';
import type { SpoilerPolicy } from '../spoilers.ts';
import { normalizeHeading } from '../spoilers.ts';
import { normalizeKey, paragraphs, splitList, splitSections, toPlainText, truncate, type ListItem, type Section, type Template } from '../wikitext.ts';

export type Gated<T> = { value: T; level: SpoilerLevel };

/** A reference to another entity, by source name; resolved to a slug after all pages are mapped. */
export interface RefRequest {
  field: string;
  expected: EntityType;
  /** Candidate names per referenced entity (link targets first, then the item's text). */
  items: string[][];
  single: boolean;
  required?: boolean;
}

export interface DraftEdge {
  kind: 'family' | 'teacher-student' | 'classmate' | 'ally' | 'rival' | 'enemy' | 'vessel-of' | 'member-of';
  /** Candidate names of the other character. */
  to: string[];
  label?: string;
  level: SpoilerLevel;
}

export interface Draft {
  type: EntityType;
  title: string;
  slug: string;
  /** Fields the source provides, in our schema's shape (refs excluded). */
  fields: Record<string, unknown>;
  refs: RefRequest[];
  edges: DraftEdge[];
  /** Level for a record we are creating (existing records keep their own). */
  level: SpoilerLevel;
  infobox?: string;
  /** Infobox params no mapper consumed (normalized keys). */
  unmapped: string[];
  notes: string[];
}

export interface Skip {
  skip: true;
  reason: string;
}

export interface MapInput {
  title: string;
  wikitext: string;
  policy: SpoilerPolicy;
}

/** Params that are presentation only: consumed silently, never reported as unmapped. */
const PRESENTATION = new Set(['image', 'image1', 'image2', 'caption', 'imagecaption', 'image caption', 'imagewidth', 'image size', 'size', 'width', 'gallery', 'title1', 'tabs', 'color', 'colour', 'theme']);

/** Reads infobox params by candidate names and remembers which ones were used. */
export class ParamReader {
  private used = new Set<string>();
  readonly template: Template | undefined;

  constructor(template: Template | undefined) {
    this.template = template;
  }

  /** Raw wikitext of the first candidate present with a non-empty value. */
  raw(candidates: readonly string[]): string | undefined {
    if (!this.template) return undefined;
    for (const c of candidates) {
      const key = normalizeKey(c);
      const v = this.template.params.get(key);
      if (v === undefined) continue;
      this.used.add(key);
      if (toPlainText(v) !== '') return v;
    }
    return undefined;
  }

  text(candidates: readonly string[]): string | undefined {
    const v = this.raw(candidates);
    return v === undefined ? undefined : toPlainText(v).replace(/\s*\n+\s*/g, ' ').trim() || undefined;
  }

  list(candidates: readonly string[]): ListItem[] {
    const v = this.raw(candidates);
    return v === undefined ? [] : splitList(v);
  }

  unmapped(): string[] {
    if (!this.template) return [];
    return this.template.order.filter((k) => !this.used.has(k) && !PRESENTATION.has(k) && !/^\d+$/.test(k) && toPlainText(this.template!.params.get(k) ?? '') !== '');
  }
}

/** Candidate infobox parameter names per field (we cannot see the live templates; see docs/03). */
export const P = {
  name: ['name', 'english name', 'english', 'title', 'eng name'],
  ja: ['kanji', 'japanese', 'japanese name', 'jname', 'ja', 'name ja', 'jpname', 'kanji name'],
  romaji: ['romaji', 'rōmaji', 'romanji', 'rname', 'romanization', 'romaji name', 'romanized'],
  aliases: ['alias', 'aliases', 'nickname', 'nicknames', 'epithet', 'epithets', 'other names', 'also known as'],
  species: ['species', 'race', 'classification', 'kind'],
  status: ['status', 'state'],
  grade: ['grade', 'grades', 'rank', 'sorcerer grade', 'curse grade'],
  affiliations: ['affiliation', 'affiliations', 'organization', 'organizations', 'organisation', 'group', 'groups', 'school'],
  techniques: ['technique', 'techniques', 'cursed technique', 'cursed techniques', 'abilities', 'innate technique'],
  domain: ['domain', 'domain expansion', 'domains'],
  relatives: ['relatives', 'family', 'relative', 'relationships'],
  techKind: ['type', 'technique type', 'kind', 'classification', 'category'],
  users: ['user', 'users', 'wielder', 'wielders', 'practitioner', 'practitioners', 'used by'],
  clan: ['clan', 'family', 'inherited by', 'lineage'],
  owner: ['user', 'users', 'owner', 'caster'],
  technique: ['technique', 'cursed technique', 'base technique', 'associated technique'],
  sureHit: ['sure-hit', 'sure hit', 'sure-hit effect', 'sure hit effect', 'effect', 'effects'],
  orgKind: ['type', 'kind', 'classification', 'category'],
  location: ['location', 'locations', 'headquarters', 'base', 'hq', 'region'],
  chapters: ['chapters', 'chapter range', 'manga chapters'],
} as const;

/** Headings whose content never goes into summaries or mechanics. */
const SKIP_HEADINGS = new Set(['trivia', 'references', 'notes', 'gallery', 'navigation', 'site navigation', 'see also', 'external links', 'quotes', 'appearances in other media', 'battles', 'relationships', 'images', 'videos', 'sources']);

export const isSkippedSection = (s: Section) => s.path.some((h) => SKIP_HEADINGS.has(normalizeHeading(h)));

/** Plain-text paragraphs of a section, without list-like fragments. */
export function sectionParagraphs(s: Section): string[] {
  return paragraphs(toPlainText(s.wikitext)).filter((p) => p.length >= 40 && /[.!?…]$/.test(p));
}

/** Lead paragraphs (level from policy: `none`), at most `max`. */
export function leadText(sections: Section[], policy: SpoilerPolicy, max = 2): Gated<string>[] {
  const lead = sections[0];
  if (!lead) return [];
  const level = policy.sectionLevel(lead);
  return sectionParagraphs(lead).slice(0, max).map((p) => ({ value: truncate(p), level }));
}

/**
 * One paragraph per arc-named section, in document order, each at its arc's level.
 * Gives a summary that grows as the visitor's spoiler setting rises.
 */
export function arcParagraphs(sections: Section[], policy: SpoilerPolicy): Gated<string>[] {
  const seen = new Set<string>();
  const out: Gated<string>[] = [];
  for (const s of sections.slice(1)) {
    if (isSkippedSection(s)) continue;
    const m = [...s.path].reverse().map((h) => policy.matchArc(h)).find(Boolean);
    if (!m) continue;
    const key = m.arc ?? m.alias;
    if (seen.has(key)) continue;
    const first = sectionParagraphs(s)[0];
    if (!first) continue;
    seen.add(key);
    out.push({ value: truncate(first), level: m.level });
  }
  return out;
}

/** First paragraph of each non-lead section (mechanics-style), each gated by the policy. */
export function sectionFirstParagraphs(sections: Section[], policy: SpoilerPolicy, filter: (s: Section) => boolean = () => true, max = 8): Gated<string>[] {
  const out: Gated<string>[] = [];
  for (const s of sections.slice(1)) {
    if (isSkippedSection(s) || !filter(s)) continue;
    const first = sectionParagraphs(s)[0];
    if (first) out.push({ value: truncate(first), level: policy.sectionLevel(s) });
    if (out.length >= max) break;
  }
  return out;
}

/** Earliest arc level among arc-named headings: when the entity first shows up. */
export function earliestArcLevel(sections: Section[], policy: SpoilerPolicy): SpoilerLevel | undefined {
  let best: SpoilerLevel | undefined;
  const order = ['none', 'anime-s1', 'anime-s2', 'anime-s3', 'manga'];
  for (const s of sections.slice(1)) {
    for (const h of s.path) {
      const m = policy.matchArc(h);
      if (m && (best === undefined || order.indexOf(m.level) < order.indexOf(best))) best = m.level;
    }
  }
  return best;
}

/** Ref candidates for list items: link targets first, then the text without a trailing note. */
export function refItems(items: ListItem[]): string[][] {
  return items.map((i) => [...i.links.map((l) => l.target), ...i.links.map((l) => l.label), i.text.replace(/\s*\([^)]*\)\s*$/, '').trim()].filter(Boolean));
}

export const sections = (wikitext: string) => splitSections(wikitext);

/** Page-level guards shared by every mapper. */
export function pageSkipReason(wikitext: string): string | undefined {
  if (/^\s*#redirect/i.test(wikitext)) return 'redirect';
  if (/\{\{\s*(disambig|disambiguation)\b/i.test(wikitext)) return 'disambiguation page';
  return undefined;
}

export function nameFields(r: ParamReader, title: string) {
  const en = r.text(P.name) ?? title.replace(/\s*\([^)]*\)\s*$/, '');
  const ja = r.text(P.ja);
  const romaji = r.text(P.romaji);
  return { en, ...(ja ? { ja } : {}), ...(romaji ? { romaji } : {}) };
}
