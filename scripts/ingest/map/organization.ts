import { ORGANIZATION_KINDS } from '../../../src/content/schemas/index.ts';
import { slugify } from '../slugs.ts';
import { findInfobox } from '../wikitext.ts';
import { leadText, nameFields, P, pageSkipReason, ParamReader, refItems, sections as splitSections, type Draft, type MapInput, type Skip } from './common.ts';

type Kind = (typeof ORGANIZATION_KINDS)[number];

export function parseOrganizationKind(text: string | undefined, title: string): Kind {
  const t = `${text ?? ''} ${title}`.toLowerCase();
  if (/\bclan\b|\bfamily\b|\bhouse\b/.test(t)) return 'clan';
  if (/school|high\b|academy|college/.test(t)) return 'school';
  if (/faction|alliance|association|\bunion\b/.test(t)) return 'faction';
  return 'group';
}

export function mapOrganization({ title, wikitext, policy }: MapInput): Draft | Skip {
  const skip = pageSkipReason(wikitext);
  if (skip) return { skip: true, reason: skip };
  const infobox = findInfobox(wikitext);
  const r = new ParamReader(infobox);
  const secs = splitSections(wikitext);
  const summary = leadText(secs, policy);
  if (!summary.length) return { skip: true, reason: 'no lead text' };
  return {
    type: 'organizations',
    title,
    slug: slugify(title),
    fields: { name: nameFields(r, title), kind: parseOrganizationKind(r.text(P.orgKind), title), summary },
    refs: [{ field: 'location', expected: 'locations', items: refItems(r.list(P.location)), single: true }],
    edges: [],
    level: 'manga',
    infobox: infobox?.name,
    unmapped: r.unmapped(),
    notes: [],
  };
}
