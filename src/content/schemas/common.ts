import { z } from 'astro/zod';

/** Ordered spoiler levels (doc 02). A visitor at level N sees everything at or below N. */
export const SPOILER_LEVELS = ['none', 'anime-s1', 'anime-s2', 'anime-s3', 'manga'] as const;
export const spoilerLevel = z.enum(SPOILER_LEVELS);
export type SpoilerLevel = z.infer<typeof spoilerLevel>;

export const gated = <T extends z.ZodType>(value: T) => z.object({ value, level: spoilerLevel });

export const provenance = z.object({
  source: z.enum(['wikipedia', 'fandom']),
  title: z.string(),
  url: z.url(),
  revisionId: z.number().int().nonnegative(),
  fetchedAt: z.iso.datetime(),
  licence: z.enum(['CC BY-SA 4.0', 'CC BY-SA 3.0']),
});

export const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'kebab-case slug');

export const grade = z.enum(['special', 'semi-1', '1', 'semi-2', '2', '3', '4', 'ungraded']);

/** Is `level` visible to a visitor whose setting is `setting`? */
export function isVisible(level: SpoilerLevel, setting: SpoilerLevel): boolean {
  return SPOILER_LEVELS.indexOf(level) <= SPOILER_LEVELS.indexOf(setting);
}
