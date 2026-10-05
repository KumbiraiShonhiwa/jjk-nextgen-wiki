import { levelForProgress, parseProgress, progressCss, PROGRESS_EVENT, PROGRESS_KEY, PROGRESS_STYLE_ID, type Progress } from './progress';
import { readLevel, setLevel } from './spoiler';
import { spoilerBoundaries } from '../content/schemas/boundaries';
import boundariesJson from '../../content/meta/spoiler-boundaries.json';
import { SPOILER_LEVELS } from '../content/schemas/common';

/**
 * Applying episode/chapter progress in the browser (roadmap B1).
 *
 * Kept apart from `progress.ts`, which is pure and testable; this half touches storage, the DOM and
 * the boundary table.
 */
const boundaries = spoilerBoundaries.parse(boundariesJson);

export function readProgress(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Progress {
  try {
    return parseProgress(storage?.getItem(PROGRESS_KEY));
  } catch {
    return {};
  }
}

/** The episode and chapter numbers present on this page, so the rule is no longer than it must be. */
function markedOnPage(doc: Document) {
  const read = (attribute: string, pattern: RegExp) =>
    [...doc.querySelectorAll<HTMLElement>(`[${attribute}]`)]
      .map((el) => pattern.exec(el.getAttribute(attribute) ?? ''))
      .filter((m): m is RegExpExecArray => !!m);
  return {
    episodes: read('data-ep', /^s(\d+)e(\d+)$/).map((m) => ({ season: Number(m[1]), number: Number(m[2]) })),
    chapters: read('data-ch', /^ch(\d+)$/).map((m) => Number(m[1])),
  };
}

/** Writes (or clears) the single generated rule that hides everything past the reader's progress. */
export function applyProgress(doc: Document = document): void {
  const progress = readProgress();
  const css = progressCss(progress, markedOnPage(doc));
  let style = doc.getElementById(PROGRESS_STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    style?.remove();
    doc.documentElement.dataset.progress = '';
    return;
  }
  if (!style) {
    style = doc.createElement('style');
    style.id = PROGRESS_STYLE_ID;
    doc.head.append(style);
  }
  style.textContent = css;
  doc.documentElement.dataset.progress = progress.chapter ? `ch${progress.chapter}` : `s${progress.episode!.season}e${progress.episode!.number}`;
}

/**
 * Stores progress, raises the bucket to match, and re-applies.
 *
 * The bucket only ever moves up. Progress is a finer filter layered on top of it, so the bucket has
 * to be at least as far along or the page would hide things the reader has explicitly reached.
 */
export function setProgress(progress: Progress, doc: Document = document): void {
  const value = progress.chapter ? `ch${progress.chapter}` : progress.episode ? `s${progress.episode.season}e${progress.episode.number}` : '';
  try {
    if (value) localStorage.setItem(PROGRESS_KEY, value);
    else localStorage.removeItem(PROGRESS_KEY);
  } catch {}

  const implied = levelForProgress(boundaries, progress);
  if (implied && SPOILER_LEVELS.indexOf(implied) > SPOILER_LEVELS.indexOf(readLevel())) setLevel(implied);

  applyProgress(doc);
  doc.dispatchEvent(new CustomEvent(PROGRESS_EVENT, { detail: progress }));
}

/** Clears the finer setting, returning to bucket-only gating. */
export const clearProgress = (doc: Document = document) => setProgress({}, doc);
