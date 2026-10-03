import { TECHNIQUE_KINDS } from '../../../src/content/schemas/index.ts';
import { slugify } from '../slugs.ts';
import { normalizeHeading } from '../spoilers.ts';
import { findInfobox } from '../wikitext.ts';
import { leadText, nameFields, P, pageSkipReason, ParamReader, refItems, sectionFirstParagraphs, sections as splitSections, type Draft, type MapInput, type Skip } from './common.ts';

type Kind = (typeof TECHNIQUE_KINDS)[number];

export function parseTechniqueKind(text: string | undefined, title: string): Kind | undefined {
  const t = `${text ?? ''}`.toLowerCase();
  const ti = title.toLowerCase();
  if (/reverse/.test(t) || /reverse cursed technique/.test(ti)) return 'reverse';
  if (/extension/.test(t)) return 'extension';
  if (/barrier|domain amplification|simple domain|curtain/.test(t)) return 'barrier';
  if (/shikigami/.test(t)) return 'shikigami';
  if (/cursed tool|cursed object/.test(t)) return 'cursed-tool';
  if (/inherit|hereditary|clan/.test(t)) return 'inherited';
  if (/innate/.test(t)) return 'innate';
  if (t.trim()) return 'other';
  return undefined;
}

export function mapTechnique({ title, wikitext, policy }: MapInput): Draft | Skip {
  const skip = pageSkipReason(wikitext);
  if (skip) return { skip: true, reason: skip };
  const infobox = findInfobox(wikitext);
  const r = new ParamReader(infobox);
  const secs = splitSections(wikitext);
  const summary = leadText(secs, policy);
  if (!summary.length) return { skip: true, reason: 'no lead text' };

  const kind = parseTechniqueKind(r.text(P.techKind), title);
  const mechanics = sectionFirstParagraphs(secs, policy, (s) => !/^(history|plot|background)$/.test(normalizeHeading(s.path[0] ?? '')));

  const fields: Record<string, unknown> = { name: nameFields(r, title), summary };
  if (kind) fields.kind = kind;
  if (mechanics.length) fields.mechanics = mechanics;

  return {
    type: 'techniques',
    title,
    slug: slugify(title),
    fields,
    refs: [
      { field: 'users', expected: 'characters', items: refItems(r.list(P.users)), single: false },
      { field: 'domain', expected: 'domains', items: refItems(r.list(P.domain)), single: true },
      { field: 'clan', expected: 'organizations', items: refItems(r.list(P.clan)), single: true },
    ],
    edges: [],
    level: 'manga',
    infobox: infobox?.name,
    unmapped: r.unmapped(),
    notes: kind ? [] : ['technique kind not in infobox; defaulting to existing value or "other"'],
  };
}
