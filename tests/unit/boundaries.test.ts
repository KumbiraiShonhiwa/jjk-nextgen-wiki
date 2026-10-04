import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { arc, levelForChapter, levelForSeason, provenance, spoilerBoundaries } from '../../src/content/schemas';

const root = join(import.meta.dirname, '../../content');
const boundaries = spoilerBoundaries.parse(JSON.parse(readFileSync(join(root, 'meta/spoiler-boundaries.json'), 'utf8')));

describe('spoiler boundaries', () => {
  it('maps chapters to the first level that has reached them', () => {
    expect(levelForChapter(boundaries, 1)).toBe('anime-s1');
    expect(levelForChapter(boundaries, 63)).toBe('anime-s1');
    expect(levelForChapter(boundaries, 64)).toBe('anime-s2');
    expect(levelForChapter(boundaries, 137)).toBe('anime-s2');
    expect(levelForChapter(boundaries, 138)).toBe('anime-s3');
    expect(levelForChapter(boundaries, 180)).toBe('anime-s3');
    expect(levelForChapter(boundaries, 181)).toBe('manga');
    expect(levelForChapter(boundaries, 271)).toBe('manga');
  });

  it('maps anime seasons, and treats an unknown season as manga', () => {
    expect(levelForSeason(boundaries, 1)).toBe('anime-s1');
    expect(levelForSeason(boundaries, 2)).toBe('anime-s2');
    expect(levelForSeason(boundaries, 3)).toBe('anime-s3');
    expect(levelForSeason(boundaries, 4)).toBe('manga');
  });

  it('rejects boundaries that do not increase with the level', () => {
    const bad = { ...boundaries, levels: { ...boundaries.levels, 'anime-s2': { throughChapter: 10, season: 2 } } };
    expect(spoilerBoundaries.safeParse(bad).success).toBe(false);
  });

  const arcs = readdirSync(join(root, 'arcs'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f, arc.parse(JSON.parse(readFileSync(join(root, 'arcs', f), 'utf8')))] as const);

  it.each(arcs)('%s: its level matches where its first chapter and season fall', (_file, a) => {
    if (a.chapters) expect(a.level).toBe(levelForChapter(boundaries, a.chapters[0]));
    if (a.episodes) expect(a.level).toBe(levelForSeason(boundaries, a.episodes[0]));
  });
});

describe('provenance', () => {
  it('accepts a sourced entry and an original entry, and nothing else', () => {
    const sourced = {
      source: 'fandom',
      title: 'Satoru Gojo',
      url: 'https://jujutsu-kaisen.fandom.com/wiki/Satoru_Gojo',
      revisionId: 1,
      fetchedAt: '2026-10-04T00:00:00.000Z',
      licence: 'CC BY-SA 3.0',
    };
    const original = { source: 'original', writtenAt: '2026-10-04T00:00:00.000Z', licence: 'CC BY-SA 4.0' };
    expect(provenance.safeParse(sourced).success).toBe(true);
    expect(provenance.safeParse(original).success).toBe(true);
    expect(provenance.safeParse({ ...original, licence: 'CC BY-SA 3.0' }).success).toBe(false);
    expect(provenance.safeParse({ source: 'reddit', title: 'x', url: 'https://reddit.com/r/x', revisionId: 1, fetchedAt: sourced.fetchedAt, licence: 'CC BY-SA 4.0' }).success).toBe(false);
  });
});
