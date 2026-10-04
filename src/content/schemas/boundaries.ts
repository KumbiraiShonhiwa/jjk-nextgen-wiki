import { z } from 'astro/zod';
import type { SpoilerLevel } from './common';

const boundary = z.object({
  /** Last chapter that is *fully* adapted at this level. A partly adapted chapter belongs to the next level. */
  throughChapter: z.number().int().positive(),
  /** Anime season whose episodes end here (absent for the manga level). */
  season: z.number().int().positive().optional(),
});

/** Where each spoiler level ends, in manga chapters (doc 02). Hand-verified against the episode pages. */
export const spoilerBoundaries = z
  .object({
    verifiedAt: z.iso.date(),
    source: z.string().min(1),
    note: z.string().min(1),
    levels: z.object({ 'anime-s1': boundary, 'anime-s2': boundary, 'anime-s3': boundary, manga: boundary }),
  })
  .refine(
    ({ levels: l }) =>
      l['anime-s1'].throughChapter < l['anime-s2'].throughChapter &&
      l['anime-s2'].throughChapter < l['anime-s3'].throughChapter &&
      l['anime-s3'].throughChapter < l.manga.throughChapter,
    'chapter boundaries must increase with the spoiler level',
  );

export type SpoilerBoundaries = z.infer<typeof spoilerBoundaries>;

/** The level at which a chapter's content becomes visible: the first level whose boundary has reached it. */
export function levelForChapter(b: SpoilerBoundaries, chapter: number): SpoilerLevel {
  for (const level of ['anime-s1', 'anime-s2', 'anime-s3'] as const) {
    if (chapter <= b.levels[level].throughChapter) return level;
  }
  return 'manga';
}

/** The level at which an anime season becomes visible. A season beyond those we know is `manga`. */
export function levelForSeason(b: SpoilerBoundaries, season: number): SpoilerLevel {
  for (const level of ['anime-s1', 'anime-s2', 'anime-s3'] as const) {
    if (b.levels[level].season === season) return level;
  }
  return 'manga';
}
