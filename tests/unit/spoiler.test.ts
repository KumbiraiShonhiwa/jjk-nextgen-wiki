import { describe, expect, it } from 'vitest';
import { DEFAULT_LEVEL, newlyVisible, parseLevel, readLevel } from '../../src/lib/spoiler';

describe('parseLevel', () => {
  it('accepts known levels except none', () => {
    expect(parseLevel('manga')).toBe('manga');
    expect(parseLevel('none')).toBe(DEFAULT_LEVEL);
    expect(parseLevel('season-9')).toBe(DEFAULT_LEVEL);
    expect(parseLevel(null)).toBe(DEFAULT_LEVEL);
  });
});

describe('readLevel', () => {
  it('falls back when storage throws (private mode)', () => {
    expect(readLevel({ getItem: () => { throw new Error('blocked'); } })).toBe(DEFAULT_LEVEL);
  });
});

describe('newlyVisible', () => {
  it('lists the levels unlocked by raising the setting', () => {
    expect(newlyVisible('anime-s1', 'anime-s3')).toEqual(['anime-s2', 'anime-s3']);
    expect(newlyVisible('manga', 'anime-s1')).toEqual([]);
  });
});
