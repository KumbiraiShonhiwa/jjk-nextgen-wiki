import { z } from 'astro/zod';
import { gated, provenance, slug, spoilerLevel } from './common';

/**
 * Anime episodes (doc 02, roadmap A1). One record per broadcast episode, ingested from the English
 * Wikipedia season pages, which carry `{{Episode list}}` rows.
 *
 * Everything about an episode past its number is a spoiler at its own season's level: a title names
 * what happens, and a summary says it outright. Only `season`, `numberInSeason` and `number` are
 * ungated, because `/media/anime` has to be able to say how long a season is without describing it.
 */
export const episode = z.object({
  /** `s2e13`. Derived from the season and the number within it, so it is stable across renumbering. */
  slug,
  /** The level at which the episode's existence becomes visible; its season's level. */
  level: spoilerLevel.default('manga'),
  season: z.number().int().positive(),
  /** Position within the season, as the broadcast numbers it. */
  numberInSeason: z.number().int().positive(),
  /** Position across the whole series, where Wikipedia gives one. */
  number: z.number().int().positive().optional(),
  title: z.object({ en: z.string().min(1), ja: z.string().optional() }),
  /** ISO date of the original Japanese broadcast. */
  airedAt: z.iso.date().optional(),
  /** Wikipedia's short summary, gated. */
  summary: z.array(gated(z.string())).default([]),
  /** The arc this episode belongs to, when one covers it. */
  arc: slug.optional(),
  fixture: z.boolean().default(false),
  provenance: z.array(provenance).default([]),
});

export type Episode = z.infer<typeof episode>;

/** `s1e1`, used as both the record slug and the route segment. */
export const episodeSlug = (season: number, numberInSeason: number) => `s${season}e${numberInSeason}`;
