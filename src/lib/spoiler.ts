import { SPOILER_LEVELS, type SpoilerLevel } from '../content/schemas/common';

export const SPOILER_KEY = 'jjk:spoiler-level';
export const DEFAULT_LEVEL: SpoilerLevel = 'anime-s1';
export const SPOILER_EVENT = 'jjk:spoiler';

export const LEVEL_LABELS: Record<SpoilerLevel, { short: string; long: string }> = {
  none: { short: 'Safe', long: 'No spoilers' },
  'anime-s1': { short: 'S1', long: 'Anime season 1 and the movie' },
  'anime-s2': { short: 'S2', long: 'Anime season 2' },
  'anime-s3': { short: 'S3', long: 'Anime season 3' },
  manga: { short: 'Manga', long: 'The full manga' },
};

export function parseLevel(value: unknown): SpoilerLevel {
  return typeof value === 'string' && (SPOILER_LEVELS as readonly string[]).includes(value) && value !== 'none'
    ? (value as SpoilerLevel)
    : DEFAULT_LEVEL;
}

export function readLevel(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): SpoilerLevel {
  try {
    return parseLevel(storage?.getItem(SPOILER_KEY));
  } catch {
    return DEFAULT_LEVEL;
  }
}

/** Persists and applies a level, then notifies listeners (e.g. the reveal animation). */
export function setLevel(level: SpoilerLevel, doc: Document = document): void {
  const previous = parseLevel(doc.documentElement.dataset.spoiler);
  try {
    localStorage.setItem(SPOILER_KEY, level);
  } catch {}
  doc.documentElement.dataset.spoiler = level;
  doc.dispatchEvent(new CustomEvent(SPOILER_EVENT, { detail: { level, previous } }));
}

/** Levels that became visible when moving from `previous` to `next`. */
export function newlyVisible(previous: SpoilerLevel, next: SpoilerLevel): SpoilerLevel[] {
  const a = SPOILER_LEVELS.indexOf(previous);
  const b = SPOILER_LEVELS.indexOf(next);
  return b > a ? SPOILER_LEVELS.slice(a + 1, b + 1) : [];
}
