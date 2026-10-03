import { describe, expect, it } from 'vitest';
import { allowedLevels, canonicalUrl, rank, type Hit } from '../../src/lib/search';

describe('allowedLevels', () => {
  it('includes spoiler-free pages and every level up to the setting', () => {
    expect(allowedLevels('anime-s1')).toEqual(['none', 'anime-s1']);
    expect(allowedLevels('manga')).toEqual(['none', 'anime-s1', 'anime-s2', 'anime-s3', 'manga']);
  });
});

describe('canonicalUrl', () => {
  it.each([
    ['/arcs/culling-game/', '/arcs/culling-game'],
    ['/arcs/culling-game/index.html', '/arcs/culling-game'],
    ['/about.html', '/about'],
    ['/', '/'],
  ])('%s → %s', (input, out) => expect(canonicalUrl(input)).toBe(out));
});

describe('rank', () => {
  const hit = (title: string, type: string): Hit => ({ title, type, url: `/${title}`, excerpt: '' });

  it('puts an exact title match first, then prefix matches', () => {
    const hits = [hit('Gojo Clan', 'Organization'), hit('Satoru Gojo', 'Character'), hit('Gojo', 'Technique')];
    expect(rank(hits, 'gojo').map((h) => h.title)).toEqual(['Gojo', 'Gojo Clan', 'Satoru Gojo']);
  });

  it('orders the remaining hits by entity type, keeping relevance within a type', () => {
    const hits = [hit('Zenin Clan', 'Organization'), hit('Ten Shadows', 'Technique'), hit('Maki Zenin', 'Character'), hit('Megumi', 'Character')];
    expect(rank(hits, 'shadow').map((h) => h.title)).toEqual(['Maki Zenin', 'Megumi', 'Ten Shadows', 'Zenin Clan']);
  });
});
