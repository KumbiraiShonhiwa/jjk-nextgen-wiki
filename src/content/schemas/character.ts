import { z } from 'astro/zod';
import { gated, grade, provenance, slug, spoilerLevel } from './common';

export const SPECIES = ['human', 'cursed-spirit', 'vessel', 'incarnated-sorcerer', 'cursed-womb', 'shikigami', 'other'] as const;

/** AI-generated portrait, written by `pnpm art`. Always shown with an "AI-generated" label. */
export const characterArt = z.object({
  src: z.string().regex(/^\/art\/[a-z0-9-]+\.(webp|png|jpg)$/),
  alt: z.string().min(1),
  model: z.string().min(1),
  prompt: z.string().min(1),
  generatedAt: z.string(),
});

export const character = z.object({
  slug,
  level: spoilerLevel.default('none'),
  name: z.object({ en: z.string(), ja: z.string().optional(), romaji: z.string().optional() }),
  aliases: z.array(z.string()).default([]),
  species: z.array(gated(z.enum(SPECIES))).default([]),
  summary: z.array(gated(z.string())).min(1),
  status: z.array(gated(z.enum(['alive', 'deceased', 'unknown']))).default([]),
  grade: z.array(gated(grade)).default([]),
  /*
   * Profile fields from the source infobox (doc 02). Free text rather than enums or numbers: the
   * wikis write "190 cm", "6'3\"", "December 7" and "Male" inconsistently, and normalising them
   * would invent precision the source does not have.
   */
  gender: z.string().optional(),
  birthday: z.string().optional(),
  height: z.string().optional(),
  /*
   * Gated, unlike the three above: when a character first appears names the arc they show up in,
   * which tells a reader that someone they have not met yet exists, and roughly when.
   */
  firstAppearance: z.array(gated(z.string())).default([]),
  affiliations: z.array(slug).default([]),
  techniques: z.array(slug).default([]),
  domain: slug.optional(),
  /** Our own theming colour, not from the source. */
  accent: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  art: characterArt.optional(),
  /** Hand-written placeholder until the scraper produces real records. */
  fixture: z.boolean().default(false),
  provenance: z.array(provenance).default([]),
});

export type Character = z.infer<typeof character>;
