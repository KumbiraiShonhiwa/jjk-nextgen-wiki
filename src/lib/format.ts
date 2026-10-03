import type { Character } from '../content/schemas';
import { safeValue } from './graph';

const GRADE_LABELS: Record<string, string> = {
  special: 'Special grade',
  'semi-1': 'Semi-grade 1',
  '1': 'Grade 1',
  'semi-2': 'Semi-grade 2',
  '2': 'Grade 2',
  '3': 'Grade 3',
  '4': 'Grade 4',
  ungraded: 'Ungraded',
};

export const gradeLabel = (g: string) => GRADE_LABELS[g] ?? g;

/** Spoiler-free one-line meta for cards and previews. */
export function characterMeta(c: Character): string | undefined {
  const grade = safeValue(c.grade);
  return grade ? gradeLabel(grade) : undefined;
}

export const titleCase = (s: string) => s.replace(/(^|-)([a-z])/g, (_, sep: string, ch: string) => (sep ? ' ' : '') + ch.toUpperCase());

/** "Chapters 1–7", "Chapter 9" */
export function chapterRange(range?: [number, number]): string | undefined {
  if (!range) return undefined;
  const [a, b] = range;
  return a === b ? `Chapter ${a}` : `Chapters ${a}–${b}`;
}

/** "Season 1 · Episodes 1–5" */
export function episodeRange(eps?: [number, number, number]): string | undefined {
  if (!eps) return undefined;
  const [season, a, b] = eps;
  return `Season ${season} · ${a === b ? `Episode ${a}` : `Episodes ${a}–${b}`}`;
}
