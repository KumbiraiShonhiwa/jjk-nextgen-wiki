import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { spoilerBoundaries } from '../../src/content/schemas';
import {
  chapterReached,
  episodeReached,
  formatProgress,
  levelForProgress,
  parseProgress,
  progressCss,
} from '../../src/lib/progress';

const boundaries = spoilerBoundaries.parse(JSON.parse(readFileSync('content/meta/spoiler-boundaries.json', 'utf8')));

describe('parseProgress / formatProgress', () => {
  it('round-trips an episode and a chapter', () => {
    expect(parseProgress('s2e5')).toEqual({ episode: { season: 2, number: 5 } });
    expect(formatProgress({ episode: { season: 2, number: 5 } })).toBe('s2e5');
    expect(parseProgress('ch120')).toEqual({ chapter: 120 });
    expect(formatProgress({ chapter: 120 })).toBe('ch120');
  });

  it('is empty for anything it does not recognise, rather than guessing', () => {
    for (const bad of ['', 'nonsense', 's2', 'e5', 'ch', null, undefined, 42]) {
      expect(parseProgress(bad)).toEqual({});
    }
    expect(formatProgress({})).toBe('');
  });
});

describe('episodeReached', () => {
  const progress = { episode: { season: 2, number: 5 } };

  it('includes everything up to and including the episode', () => {
    expect(episodeReached(progress, 2, 5)).toBe(true);
    expect(episodeReached(progress, 2, 4)).toBe(true);
    expect(episodeReached(progress, 1, 24)).toBe(true);
  });

  it('excludes later episodes and later seasons', () => {
    expect(episodeReached(progress, 2, 6)).toBe(false);
    expect(episodeReached(progress, 3, 1)).toBe(false);
  });

  it('reaches everything when no progress is set, so the setting is purely additive', () => {
    expect(episodeReached({}, 3, 12)).toBe(true);
  });
});

describe('chapterReached', () => {
  it('includes up to and including the chapter, excludes beyond', () => {
    expect(chapterReached({ chapter: 120 }, 120)).toBe(true);
    expect(chapterReached({ chapter: 120 }, 121)).toBe(false);
  });
  it('reaches everything with no progress set', () => {
    expect(chapterReached({}, 271)).toBe(true);
  });
});

describe('levelForProgress', () => {
  it('derives the bucket a progress point implies', () => {
    expect(levelForProgress(boundaries, { episode: { season: 2, number: 5 } })).toBe('anime-s2');
    expect(levelForProgress(boundaries, { chapter: 12 })).toBe('anime-s1');
    expect(levelForProgress(boundaries, { chapter: 271 })).toBe('manga');
  });
  it('is undefined with no progress, so the bucket is left alone', () => {
    expect(levelForProgress(boundaries, {})).toBeUndefined();
  });
});

describe('progressCss', () => {
  const known = {
    episodes: [
      { season: 2, number: 4 },
      { season: 2, number: 5 },
      { season: 2, number: 6 },
      { season: 3, number: 1 },
    ],
    chapters: [119, 120, 121],
  };

  it('hides only what is beyond the progress point', () => {
    const css = progressCss({ episode: { season: 2, number: 5 } }, known);
    expect(css).toContain('[data-ep="s2e6"]');
    expect(css).toContain('[data-ep="s3e1"]');
    expect(css).not.toContain('[data-ep="s2e5"]');
    expect(css).not.toContain('[data-ep="s2e4"]');
  });

  it('is one rule, so the head script writes a single style element', () => {
    expect(progressCss({ chapter: 120 }, known).match(/\{/g)).toHaveLength(1);
    expect(progressCss({ chapter: 120 }, known)).toContain('[data-ch="ch121"]');
  });

  it('is empty with no progress, which is what makes it additive', () => {
    expect(progressCss({}, known)).toBe('');
  });

  it('is empty when progress is past everything known', () => {
    expect(progressCss({ chapter: 999 }, known)).toBe('');
  });

  it('only touches the axis that is set', () => {
    // Watching to s2e5 says nothing about how far someone has read.
    const css = progressCss({ episode: { season: 2, number: 5 } }, known);
    expect(css).not.toContain('data-ch');
  });
});
