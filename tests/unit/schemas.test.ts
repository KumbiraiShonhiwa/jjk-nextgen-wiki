import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { character } from '../../src/content/schemas/character';
import { isVisible } from '../../src/content/schemas/common';

describe('isVisible', () => {
  it('shows content at or below the chosen level', () => {
    expect(isVisible('none', 'anime-s1')).toBe(true);
    expect(isVisible('anime-s1', 'anime-s1')).toBe(true);
    expect(isVisible('manga', 'anime-s2')).toBe(false);
  });
});

describe('character records', () => {
  const dir = join(import.meta.dirname, '../../content/characters');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    it(`${file} matches the schema and its slug matches the filename`, () => {
      const parsed = character.parse(JSON.parse(readFileSync(join(dir, file), 'utf8')));
      expect(`${parsed.slug}.json`).toBe(file);
    });
  }
});
