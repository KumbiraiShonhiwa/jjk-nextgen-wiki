import { z } from 'astro/zod';
import { gated, provenance, slug, spoilerLevel } from './common';

/**
 * A jujutsu term (doc 11, B4). The vocabulary is the main obstacle for a new reader: a summary can
 * say "he used a Binding Vow" long before anything explains what one is.
 *
 * Definitions are written for this wiki, not adapted from a source, so they carry `original`
 * provenance. The `level` is editorial: it is when the term is first *explained* on screen, chosen
 * conservatively, because naming a mechanic can give away that it exists.
 */
export const term = z.object({
  slug,
  /** When the term becomes safe to show. */
  level: spoilerLevel.default('none'),
  name: z.object({ en: z.string().min(1), ja: z.string().optional() }),
  /** Other spellings to match in prose, e.g. "binding vows". Lower-cased on use. */
  aliases: z.array(z.string()).default([]),
  /** One or two sentences. Gated, so a later nuance can be held back from an early reader. */
  definition: z.array(gated(z.string())).min(1),
  /** Techniques that are examples of the term. */
  techniques: z.array(slug).default([]),
  provenance: z.array(provenance).default([]),
});

export type Term = z.infer<typeof term>;
