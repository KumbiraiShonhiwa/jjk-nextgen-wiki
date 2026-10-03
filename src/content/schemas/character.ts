import { z } from 'astro/zod';
import { gated, grade, provenance, slug } from './common';

export const character = z.object({
  slug,
  name: z.object({ en: z.string(), ja: z.string().optional(), romaji: z.string().optional() }),
  aliases: z.array(z.string()).default([]),
  summary: z.array(gated(z.string())).min(1),
  status: z.array(gated(z.enum(['alive', 'deceased', 'unknown']))).default([]),
  grade: z.array(gated(grade)).default([]),
  affiliations: z.array(slug).default([]),
  techniques: z.array(slug).default([]),
  domain: slug.optional(),
  /** Our own theming colour, not from the source. */
  accent: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  /** Hand-written placeholder until the scraper produces real records. */
  fixture: z.boolean().default(false),
  provenance: z.array(provenance).default([]),
});

export type Character = z.infer<typeof character>;
