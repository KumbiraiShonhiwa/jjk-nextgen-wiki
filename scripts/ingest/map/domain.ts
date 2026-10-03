import { slugify } from '../slugs.ts';
import { normalizeHeading } from '../spoilers.ts';
import { findInfobox, toPlainText, truncate } from '../wikitext.ts';
import { leadText, nameFields, P, pageSkipReason, ParamReader, refItems, sectionFirstParagraphs, sections as splitSections, type Draft, type Gated, type MapInput, type Skip } from './common.ts';

const SURE_HIT_HEADING = /sure hit|effect|abilit/;

export function mapDomain({ title, wikitext, policy }: MapInput): Draft | Skip {
  const skip = pageSkipReason(wikitext);
  if (skip) return { skip: true, reason: skip };
  const infobox = findInfobox(wikitext);
  const r = new ParamReader(infobox);
  const secs = splitSections(wikitext);
  const summary = leadText(secs, policy);
  if (!summary.length) return { skip: true, reason: 'no lead text' };

  const sureHit: Gated<string>[] = [];
  const effect = r.raw(P.sureHit);
  if (effect) {
    const text = toPlainText(effect).replace(/\s*\n+\s*/g, ' ').trim();
    // Infobox text has no arc context: safe default.
    if (text) sureHit.push({ value: truncate(text), level: 'manga' });
  }
  sureHit.push(...sectionFirstParagraphs(secs, policy, (s) => s.path.some((h) => SURE_HIT_HEADING.test(normalizeHeading(h))), 3));

  const fields: Record<string, unknown> = { name: nameFields(r, title), summary };
  if (sureHit.length) fields.sureHit = sureHit;

  return {
    type: 'domains',
    title,
    slug: slugify(title),
    fields,
    refs: [
      { field: 'user', expected: 'characters', items: refItems(r.list(P.owner)), single: true, required: true },
      { field: 'technique', expected: 'techniques', items: refItems(r.list(P.technique)), single: true },
    ],
    edges: [],
    level: 'manga',
    infobox: infobox?.name,
    unmapped: r.unmapped(),
    notes: [],
  };
}
