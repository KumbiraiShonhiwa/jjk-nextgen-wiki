import type { SpoilerLevel } from '../content/schemas';

/**
 * Content coverage (roadmap B13): what is still a hand-written placeholder, what came from a
 * source and when, so the weekly sync PR has something to be reviewed against.
 *
 * Pure functions over plain records, so this is unit-testable without the content layer.
 */

export interface CoverageRecord {
  slug: string;
  level?: SpoilerLevel;
  fixture?: boolean;
  provenance?: { source: string; title?: string; url?: string; revisionId?: number; fetchedAt?: string }[];
  /** Any other field; used to spot records that carry nothing but a name. */
  [key: string]: unknown;
}

export interface CollectionCoverage {
  collection: string;
  total: number;
  fixtures: number;
  sourced: number;
  /** Most recent `fetchedAt` across the collection, or undefined when nothing is sourced. */
  lastSynced?: string;
  /** Slugs still marked `fixture`, with their level so the page can gate them. */
  backlog: { slug: string; level: SpoilerLevel }[];
}

export interface SourcePage {
  source: string;
  title: string;
  url: string;
  revisionId?: number;
  fetchedAt?: string;
  /** How many records cite this page. */
  records: number;
}

const isSourced = (r: CoverageRecord) => (r.provenance ?? []).some((p) => p.source !== 'original');

/** Per-collection totals and the fixture backlog, sorted with the least-covered collection first. */
export function coverageByCollection(byCollection: Record<string, CoverageRecord[]>): CollectionCoverage[] {
  return Object.entries(byCollection)
    .map(([collection, records]) => {
      const dates = records.flatMap((r) => (r.provenance ?? []).map((p) => p.fetchedAt).filter((d): d is string => !!d));
      return {
        collection,
        total: records.length,
        fixtures: records.filter((r) => r.fixture).length,
        sourced: records.filter(isSourced).length,
        lastSynced: dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : undefined,
        backlog: records
          .filter((r) => r.fixture)
          .map((r) => ({ slug: r.slug, level: (r.level ?? 'none') as SpoilerLevel }))
          .sort((a, b) => a.slug.localeCompare(b.slug)),
      };
    })
    .sort((a, b) => b.fixtures - a.fixtures || a.collection.localeCompare(b.collection));
}

/** Every source page cited by any record, with the revision we read and how many records cite it. */
export function sourcePages(byCollection: Record<string, CoverageRecord[]>): SourcePage[] {
  const pages = new Map<string, SourcePage>();
  for (const records of Object.values(byCollection)) {
    for (const record of records) {
      for (const p of record.provenance ?? []) {
        if (p.source === 'original' || !p.url || !p.title) continue;
        const existing = pages.get(p.url);
        if (existing) {
          existing.records++;
          // Keep the newest revision seen, so a partially re-synced collection reports the latest.
          if ((p.fetchedAt ?? '') > (existing.fetchedAt ?? '')) {
            existing.fetchedAt = p.fetchedAt;
            existing.revisionId = p.revisionId;
          }
          continue;
        }
        pages.set(p.url, { source: p.source, title: p.title, url: p.url, revisionId: p.revisionId, fetchedAt: p.fetchedAt, records: 1 });
      }
    }
  }
  return [...pages.values()].sort((a, b) => b.records - a.records || a.title.localeCompare(b.title));
}

/** Share of records that are not placeholders, as a percentage rounded to a whole number. */
export function coveragePercent(rows: CollectionCoverage[]): number {
  const total = rows.reduce((n, r) => n + r.total, 0);
  if (!total) return 0;
  const fixtures = rows.reduce((n, r) => n + r.fixtures, 0);
  return Math.round(((total - fixtures) / total) * 100);
}
