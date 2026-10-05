import { levelForChapter, levelForSeason, type SpoilerBoundaries } from '../content/schemas/boundaries';
import type { SpoilerLevel } from '../content/schemas/common';

/**
 * Episode- and chapter-precise spoiler progress (roadmap B1).
 *
 * The five buckets are coarse: someone at season 2 episode 5 has to choose between seeing too
 * little and seeing Shibuya. Progress is a second, finer setting that sits *on top* of the bucket:
 * it can only ever hide more, never less, so turning it on cannot leak anything and turning it off
 * returns to the bucket behaviour exactly.
 *
 * Gating stays CSS-first. Nodes carry `data-ep` / `data-ch`, and the head script writes one
 * generated rule listing the values beyond the reader's progress. CSS cannot compare numbers, so
 * the comparison happens once, in JavaScript, and the result is expressed as a plain selector list.
 * With no JavaScript nothing is generated and the bucket rules alone apply.
 */

export const PROGRESS_KEY = 'jjk:progress';
export const PROGRESS_EVENT = 'jjk:progress';
/** The id of the generated <style> element, so it can be replaced rather than stacked. */
export const PROGRESS_STYLE_ID = 'jjk-progress-style';

export interface Progress {
  /** Watched up to and including this episode. */
  episode?: { season: number; number: number };
  /** Read up to and including this chapter. */
  chapter?: number;
}

/** `s2e5`, `ch120`, or empty for "no finer setting than the bucket". */
export function formatProgress(progress: Progress): string {
  if (progress.chapter) return `ch${progress.chapter}`;
  if (progress.episode) return `s${progress.episode.season}e${progress.episode.number}`;
  return '';
}

export function parseProgress(value: unknown): Progress {
  if (typeof value !== 'string') return {};
  const chapter = /^ch(\d{1,4})$/.exec(value);
  if (chapter) return { chapter: Number(chapter[1]) };
  const episode = /^s(\d{1,2})e(\d{1,3})$/.exec(value);
  if (episode) return { episode: { season: Number(episode[1]), number: Number(episode[2]) } };
  return {};
}

/** Attribute value for an episode node, matching `formatProgress`. */
export const episodeKey = (season: number, number: number) => `s${season}e${number}`;
/** Attribute value for a chapter node. */
export const chapterKey = (number: number) => `ch${number}`;

/** Is this episode at or before the reader's progress? */
export function episodeReached(progress: Progress, season: number, number: number): boolean {
  if (!progress.episode) return true;
  if (season !== progress.episode.season) return season < progress.episode.season;
  return number <= progress.episode.number;
}

/** Is this chapter at or before the reader's progress? */
export function chapterReached(progress: Progress, chapter: number): boolean {
  if (!progress.chapter) return true;
  return chapter <= progress.chapter;
}

/**
 * The bucket a progress point implies, so the coarse setting can follow the fine one.
 * Returns undefined when there is no progress set.
 */
export function levelForProgress(boundaries: SpoilerBoundaries, progress: Progress): SpoilerLevel | undefined {
  if (progress.chapter) return levelForChapter(boundaries, progress.chapter);
  if (progress.episode) return levelForSeason(boundaries, progress.episode.season);
  return undefined;
}

export interface Markable {
  episodes: { season: number; number: number }[];
  chapters: number[];
}

/**
 * The CSS that hides everything beyond the reader's progress.
 *
 * One rule, built from the values that exist on the page's collections rather than from a range, so
 * the selector list stays exactly as long as the content and no number comparison is asked of CSS.
 * Returns an empty string when there is no progress, which is what makes the setting purely additive.
 */
export function progressCss(progress: Progress, known: Markable): string {
  const selectors: string[] = [];
  if (progress.episode) {
    for (const e of known.episodes) {
      if (!episodeReached(progress, e.season, e.number)) selectors.push(`[data-ep="${episodeKey(e.season, e.number)}"]`);
    }
  }
  if (progress.chapter) {
    for (const c of known.chapters) {
      if (!chapterReached(progress, c)) selectors.push(`[data-ch="${chapterKey(c)}"]`);
    }
  }
  if (!selectors.length) return '';
  return `${selectors.join(',')}{display:none !important}`;
}
