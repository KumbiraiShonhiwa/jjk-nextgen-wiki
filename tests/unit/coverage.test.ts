import { describe, expect, it } from 'vitest';
import { coverageByCollection, coveragePercent, sourcePages, type CoverageRecord } from '../../src/lib/coverage';

const wiki = (revisionId: number, fetchedAt: string, title = 'List of X', url = 'https://en.wikipedia.org/wiki/List_of_X') => ({
  source: 'wikipedia',
  title,
  url,
  revisionId,
  fetchedAt,
});

const sample: Record<string, CoverageRecord[]> = {
  characters: [
    { slug: 'a', level: 'none', fixture: true },
    { slug: 'b', level: 'manga', fixture: true },
    { slug: 'c', level: 'none', provenance: [wiki(1, '2026-01-02T00:00:00.000Z')] },
  ],
  chapters: [{ slug: 'ch-1', level: 'anime-s1', provenance: [wiki(9, '2026-02-01T00:00:00.000Z')] }],
};

describe('coverageByCollection', () => {
  const rows = coverageByCollection(sample);

  it('counts totals, fixtures and sourced records per collection', () => {
    expect(rows.find((r) => r.collection === 'characters')).toMatchObject({ total: 3, fixtures: 2, sourced: 1 });
    expect(rows.find((r) => r.collection === 'chapters')).toMatchObject({ total: 1, fixtures: 0, sourced: 1 });
  });

  it('puts the least-covered collection first, so the backlog leads', () => {
    expect(rows[0]!.collection).toBe('characters');
  });

  it('reports the most recent sync, not the first', () => {
    expect(rows.find((r) => r.collection === 'chapters')!.lastSynced).toBe('2026-02-01T00:00:00.000Z');
  });

  it('lists the backlog with each record level, so the page can gate it', () => {
    expect(rows[0]!.backlog).toEqual([
      { slug: 'a', level: 'none' },
      { slug: 'b', level: 'manga' },
    ]);
  });

  it('leaves lastSynced undefined when nothing is sourced', () => {
    expect(coverageByCollection({ x: [{ slug: 'y', fixture: true }] })[0]!.lastSynced).toBeUndefined();
  });
});

describe('sourcePages', () => {
  it('groups records by source page and counts them', () => {
    const pages = sourcePages(sample);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ records: 2, source: 'wikipedia' });
  });

  it('keeps the newest revision when a page was re-read', () => {
    const pages = sourcePages({
      a: [
        { slug: 'a', provenance: [wiki(1, '2026-01-01T00:00:00.000Z')] },
        { slug: 'b', provenance: [wiki(5, '2026-03-01T00:00:00.000Z')] },
      ],
    });
    expect(pages[0]).toMatchObject({ revisionId: 5, fetchedAt: '2026-03-01T00:00:00.000Z', records: 2 });
  });

  it('ignores original text, which has no page to cite', () => {
    expect(sourcePages({ a: [{ slug: 'a', provenance: [{ source: 'original' }] }] })).toEqual([]);
  });
});

describe('coveragePercent', () => {
  it('is the share of records that are not placeholders', () => {
    expect(coveragePercent(coverageByCollection(sample))).toBe(50); // 2 of 4 are fixtures
  });
  it('is 0 rather than NaN with nothing to measure', () => {
    expect(coveragePercent([])).toBe(0);
  });
});
