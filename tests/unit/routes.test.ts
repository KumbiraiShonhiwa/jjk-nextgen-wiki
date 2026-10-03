import { describe, expect, it } from 'vitest';
import { arcTitle, domainTitle, hrefFor, safeTitle } from '../../src/lib/routes';
import { chapterRange, episodeRange } from '../../src/lib/format';
import type { Arc, Domain } from '../../src/content/schemas';

describe('hrefFor', () => {
  it('builds canonical lowercase URLs without a trailing slash', () => {
    expect(hrefFor('techniques', 'limitless')).toBe('/techniques/limitless');
    expect(hrefFor('organizations', 'zenin-clan')).toBe('/organizations/zenin-clan');
  });
});

describe('spoiler-safe titles', () => {
  it('names an entity only when its existence is spoiler-free', () => {
    expect(safeTitle({ level: 'none' }, 'Gojo Satoru', 'Character')).toBe('Gojo Satoru');
    expect(safeTitle({ level: 'anime-s1' }, 'Nanami Kento', 'Character')).toBe('Character');
  });
  it('falls back to the arc number for gated arcs', () => {
    expect(arcTitle({ level: 'manga', name: 'Shinjuku Showdown', order: 8 } as Arc)).toBe('Story arc 8');
    expect(arcTitle({ level: 'none', name: 'Prologue', order: 1 } as Arc)).toBe('Prologue');
  });
  it('never names a gated domain', () => {
    expect(domainTitle({ level: 'anime-s2', name: { en: 'Malevolent Shrine' } } as Domain)).toBe('Domain Expansion');
  });
});

describe('media ranges', () => {
  it('formats chapter ranges', () => {
    expect(chapterRange([79, 136])).toBe('Chapters 79–136');
    expect(chapterRange([9, 9])).toBe('Chapter 9');
    expect(chapterRange(undefined)).toBeUndefined();
  });
  it('formats episode ranges with their season', () => {
    expect(episodeRange([2, 6, 23])).toBe('Season 2 · Episodes 6–23');
    expect(episodeRange([1, 1, 1])).toBe('Season 1 · Episode 1');
  });
});
