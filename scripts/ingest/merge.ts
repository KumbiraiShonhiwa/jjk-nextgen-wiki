/**
 * Merging sourced fields into existing records.
 *
 * - Fields the source does not provide are kept as they are (accent, palette, order,
 *   episodes, the record's own level, hand-written refs, ...).
 * - Sourced gated text and enum lists replace the old values (fixture text goes away).
 * - Slug-reference lists are unioned: hand-curated refs survive, sourced ones are added.
 * - `name.en` and an arc's `name` stay as curated; `ja`/`romaji` are filled from the source.
 * - `fixture` becomes false and the provenance entry for this source page is replaced.
 * - Key order of the existing file is preserved; new keys are appended.
 */
import type { SpoilerLevel } from '../../src/content/schemas/index.ts';
import type { SiteInfo } from './mediawiki.ts';
import { pageUrl } from './mediawiki.ts';

export type Licence = 'CC BY-SA 3.0' | 'CC BY-SA 4.0';
export type Source = 'wikipedia' | 'fandom';

export interface Provenance {
  source: Source;
  title: string;
  url: string;
  revisionId: number;
  fetchedAt: string;
  licence: Licence;
}

/** Never taken from a source, even if a mapper produced them. */
export const CURATED_FIELDS = new Set(['slug', 'level', 'accent', 'palette', 'order', 'episodes', 'events', 'fixture']);
/** Slug-reference lists: unioned. */
export const REF_LISTS = new Set(['affiliations', 'techniques', 'users', 'characters', 'locations']);

const clone = <T>(v: T): T => structuredClone(v);

export interface MergeInput {
  existing: Record<string, unknown> | undefined;
  /** Sourced fields with references already resolved to slugs. */
  sourced: Record<string, unknown>;
  slug: string;
  /** Level for a new record. */
  level: SpoilerLevel;
  provenance: Provenance;
}

export function mergeRecord({ existing, sourced, slug, level, provenance }: MergeInput): Record<string, unknown> {
  const out: Record<string, unknown> = existing ? clone(existing) : { slug, level };
  for (const [key, value] of Object.entries(sourced)) {
    if (CURATED_FIELDS.has(key) || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    const old = out[key];
    if (REF_LISTS.has(key) && Array.isArray(old)) {
      out[key] = [...new Set([...(old as string[]), ...(value as string[])])];
    } else if (key === 'name' && old && typeof old === 'object' && value && typeof value === 'object') {
      const o = old as Record<string, string>;
      const v = value as Record<string, string>;
      out[key] = { ...o, ...(v.ja ? { ja: v.ja } : {}), ...(v.romaji ? { romaji: v.romaji } : {}), en: o.en ?? v.en };
    } else if (key === 'name' && typeof old === 'string') {
      // Arc names are curated strings.
      continue;
    } else if (key === 'aliases' && Array.isArray(old)) {
      out[key] = [...new Set([...(old as string[]), ...(value as string[])])];
    } else {
      out[key] = clone(value);
    }
  }
  out.fixture = false;
  const list = (out.provenance as Provenance[] | undefined) ?? [];
  const same = list.find((p) => p.source === provenance.source && p.title === provenance.title);
  // Re-mapping the same revision (e.g. --force) keeps the original fetch time, so the diff stays empty.
  const entry = same && same.revisionId === provenance.revisionId ? { ...provenance, fetchedAt: same.fetchedAt } : provenance;
  out.provenance = same ? list.map((p) => (p === same ? entry : p)) : [...list, entry];
  return out;
}

export interface EdgeRecord {
  id: string;
  from: string;
  to: string;
  kind: string;
  label?: string;
  level: SpoilerLevel;
  provenance?: Provenance[];
}

/**
 * Hand-written edges are kept verbatim; sourced edges are appended only when no edge of
 * the same kind already joins the same pair (in either direction).
 */
export function mergeEdges(existing: EdgeRecord[], sourced: EdgeRecord[]): { edges: EdgeRecord[]; added: EdgeRecord[] } {
  const pairKey = (e: { from: string; to: string; kind: string }) => `${e.kind}:${[e.from, e.to].sort().join('|')}`;
  const seen = new Set(existing.map(pairKey));
  const ids = new Set(existing.map((e) => e.id));
  const added: EdgeRecord[] = [];
  for (const e of sourced) {
    if (seen.has(pairKey(e)) || ids.has(e.id) || e.from === e.to) continue;
    seen.add(pairKey(e));
    ids.add(e.id);
    added.push(e);
  }
  return { edges: [...existing, ...added], added };
}

/**
 * siteinfo rightsinfo → our licence enum. Fandom often reports a URL/text without a
 * version; Fandom text is CC BY-SA 3.0, so that is the fallback (reported as a warning).
 * Anything that is not BY-SA is an error: we must not ingest it.
 */
export function licenceFromRights(rights: SiteInfo['rights'], source: Source): { licence: Licence; inferred: boolean } {
  const s = `${rights.url} ${rights.text}`.toLowerCase();
  const nonBySa = /\bnc\b|non-?commercial|\bnd\b|no-?deriv|all rights reserved|gfdl only/.test(s);
  if (nonBySa) throw new Error(`Refusing to ingest: source licence is not CC BY-SA (${rights.text} ${rights.url})`);
  const isBySa = /by-sa|by_sa|attribution[- ]share ?alike|attribution-sharealike/.test(s) || s.trim() === '' || /fandom\.com\/licensing/.test(s);
  if (!isBySa) throw new Error(`Refusing to ingest: unrecognised source licence (${rights.text} ${rights.url})`);
  if (/4\.0/.test(s)) return { licence: 'CC BY-SA 4.0', inferred: false };
  if (/3\.0/.test(s)) return { licence: 'CC BY-SA 3.0', inferred: false };
  return { licence: source === 'wikipedia' ? 'CC BY-SA 4.0' : 'CC BY-SA 3.0', inferred: true };
}

export function provenanceFor(site: SiteInfo, source: Source, licence: Licence, page: { title: string; revid: number; fetchedAt: string }): Provenance {
  return { source, title: page.title, url: pageUrl(site, page.title), revisionId: page.revid, fetchedAt: page.fetchedAt, licence };
}
