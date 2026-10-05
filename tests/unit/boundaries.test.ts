import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { arc, levelForChapter, levelForSeason, provenance, spoilerBoundaries } from '../../src/content/schemas';
import { SpoilerPolicy } from '../../scripts/ingest/spoilers.ts';

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

describe('SpoilerPolicy reads the boundary table', () => {
  const policy = new SpoilerPolicy([], { arcs: {}, extra: [] }, boundaries);

  it('reads a chapter citation in the shapes the wikis use', () => {
    // These pin the word boundaries in CHAPTER_RE. Lose one and every call returns undefined,
    // so the table silently stops affecting anything while every other test still passes.
    expect(policy.matchCitation('Chapter 12')).toBe('anime-s1');
    expect(policy.matchCitation('chapter 136')).toBe('anime-s2');
    expect(policy.matchCitation('ch. 200')).toBe('manga');
    expect(policy.matchCitation('Chapters 54-56')).toBe('anime-s1');
  });

  it('reads a season citation', () => {
    expect(policy.matchCitation('Season 2 adaptation')).toBe('anime-s2');
    expect(policy.matchCitation('S3')).toBe('anime-s3');
  });

  it('returns undefined when nothing is cited, so callers keep their own fallback', () => {
    expect(policy.matchCitation('Appearance and personality')).toBeUndefined();
    expect(policy.matchCitation('')).toBeUndefined();
  });

  it('does nothing at all when no table is supplied, rather than guessing', () => {
    expect(new SpoilerPolicy([], { arcs: {}, extra: [] }).matchCitation('Chapter 12')).toBeUndefined();
  });

  it('dates a section from a cited chapter instead of falling back to manga', () => {
    expect(policy.sectionLevel({ path: ['Trivia'] })).toBe('manga');
    expect(policy.sectionLevel({ path: ['Debut in chapter 3'] })).toBe('anime-s1');
    // Lead text and the safe headings keep their own rules.
    expect(policy.sectionLevel({ path: [] })).toBe('none');
    expect(policy.sectionLevel({ path: ['Personality'] })).toBe('none');
  });
});
