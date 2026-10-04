import { z } from 'astro/zod';

/** Ordered spoiler levels (doc 02). A visitor at level N sees everything at or below N. */
export const SPOILER_LEVELS = ['none', 'anime-s1', 'anime-s2', 'anime-s3', 'manga'] as const;
export const spoilerLevel = z.enum(SPOILER_LEVELS);
export type SpoilerLevel = z.infer<typeof spoilerLevel>;

export const gated = <T extends z.ZodType>(value: T) => z.object({ value, level: spoilerLevel });

/** Text adapted from a wiki page (written by `scripts/ingest`). */
export const sourcedProvenance = z.object({
  source: z.enum(['wikipedia', 'fandom']),
  title: z.string(),
  url: z.url(),
  revisionId: z.number().int().nonnegative(),
  fetchedAt: z.iso.datetime(),
  licence: z.enum(['CC BY-SA 4.0', 'CC BY-SA 3.0']),
});

/** Text written for this wiki. Never derived from Reddit or any source we do not credit; released under the repo's content licence. */
export const originalProvenance = z.object({
  source: z.literal('original'),
  writtenAt: z.iso.datetime(),
  licence: z.literal('CC BY-SA 4.0'),
});

export const provenance = z.union([sourcedProvenance, originalProvenance]);

export const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'kebab-case slug');

export const grade = z.enum(['special', 'semi-1', '1', 'semi-2', '2', '3', '4', 'ungraded']);

/** Is `level` visible to a visitor whose setting is `setting`? */
export function isVisible(level: SpoilerLevel, setting: SpoilerLevel): boolean {
  return SPOILER_LEVELS.indexOf(level) <= SPOILER_LEVELS.indexOf(setting);
}
