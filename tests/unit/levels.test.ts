import { describe, expect, it } from 'vitest';
import { isVisible } from '../../src/content/schemas/common';

describe('isVisible', () => {
  it('shows content at or below the chosen level', () => {
    expect(isVisible('none', 'anime-s1')).toBe(true);
    expect(isVisible('anime-s1', 'anime-s1')).toBe(true);
    expect(isVisible('manga', 'anime-s2')).toBe(false);
  });
});
