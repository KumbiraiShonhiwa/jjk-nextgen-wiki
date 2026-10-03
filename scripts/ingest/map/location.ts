import { slugify } from '../slugs.ts';
import { findInfobox } from '../wikitext.ts';
import { leadText, nameFields, pageSkipReason, ParamReader, sections as splitSections, type Draft, type MapInput, type Skip } from './common.ts';

export function mapLocation({ title, wikitext, policy }: MapInput): Draft | Skip {
  const skip = pageSkipReason(wikitext);
  if (skip) return { skip: true, reason: skip };
  const infobox = findInfobox(wikitext);
  const r = new ParamReader(infobox);
  const secs = splitSections(wikitext);
  const summary = leadText(secs, policy);
  if (!summary.length) return { skip: true, reason: 'no lead text' };
  return {
    type: 'locations',
    title,
    slug: slugify(title),
    fields: { name: nameFields(r, title), summary },
    refs: [],
    edges: [],
    level: 'manga',
    infobox: infobox?.name,
    unmapped: r.unmapped(),
    notes: [],
  };
}
