import { z } from 'astro/zod';
import { gated, provenance, slug, spoilerLevel } from './common';

/** Fields shared by every entity record. */
const base = {
  slug,
  /** Spoiler level of the entity's existence itself (e.g. a manga-only arc). */
  level: spoilerLevel.default('none'),
  /** Hand-written placeholder until the scraper produces real records. */
  fixture: z.boolean().default(false),
  provenance: z.array(provenance).default([]),
};

const name = z.object({ en: z.string().min(1), ja: z.string().optional(), romaji: z.string().optional() });
const gatedText = z.array(gated(z.string().min(1)));

export const TECHNIQUE_KINDS = ['innate', 'inherited', 'extension', 'reverse', 'barrier', 'shikigami', 'cursed-tool', 'other'] as const;

export const technique = z.object({
  ...base,
  name,
  kind: z.enum(TECHNIQUE_KINDS),
  summary: gatedText.min(1),
  mechanics: gatedText.default([]),
  users: z.array(slug).default([]),
  domain: slug.optional(),
  clan: slug.optional(),
});

export const domain = z.object({
  ...base,
  name,
  summary: gatedText.min(1),
  sureHit: gatedText.default([]),
  user: slug,
  technique: slug.optional(),
  /** Our own palette for the takeover animation, not from the source. */
  palette: z.tuple([z.string().regex(/^#[0-9a-f]{6}$/i), z.string().regex(/^#[0-9a-f]{6}$/i)]).optional(),
});

const range = z.tuple([z.number().int().positive(), z.number().int().positive()]).refine(([a, b]) => a <= b, 'range start must not exceed end');

export const arc = z.object({
  ...base,
  name: z.string().min(1),
  order: z.number().int().positive(),
  chapters: range.optional(),
  /** [season, first episode, last episode] */
  episodes: z.tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive()]).optional(),
  summary: gatedText.min(1),
  events: z
    .array(z.object({ title: z.string().min(1), detail: z.string().optional(), level: spoilerLevel }))
    .default([]),
  characters: z.array(slug).default([]),
  locations: z.array(slug).default([]),
});

export const ORGANIZATION_KINDS = ['school', 'clan', 'faction', 'group'] as const;

export const organization = z.object({
  ...base,
  name,
  kind: z.enum(ORGANIZATION_KINDS),
  summary: gatedText.min(1),
  location: slug.optional(),
});

export const location = z.object({
  ...base,
  name,
  summary: gatedText.min(1),
});

export const EDGE_KINDS = [
  'family',
  'teacher-student',
  'classmate',
  'ally',
  'rival',
  'enemy',
  'vessel-of',
  'member-of',
] as const;

export const edge = z.object({
  /** Stable id: `${from}--${kind}--${to}` */
  id: z.string().regex(/^[a-z0-9-]+--[a-z-]+--[a-z0-9-]+$/),
  from: slug,
  to: slug,
  kind: z.enum(EDGE_KINDS),
  label: z.string().optional(),
  level: spoilerLevel,
  provenance: z.array(provenance).default([]),
});

export type Technique = z.infer<typeof technique>;
export type Domain = z.infer<typeof domain>;
export type Arc = z.infer<typeof arc>;
export type Organization = z.infer<typeof organization>;
export type Location = z.infer<typeof location>;
export type Edge = z.infer<typeof edge>;
