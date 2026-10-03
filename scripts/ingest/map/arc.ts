import { findInfobox } from '../wikitext.ts';
import { P, pageSkipReason, ParamReader, sectionParagraphs, sections as splitSections, type Draft, type MapInput, type Skip } from './common.ts';
import { truncate } from '../wikitext.ts';

/** "1–7", "Chapters 1 - 7", "1-7 (Volume 1)" → [1, 7]. */
export function parseChapterRange(text: string | undefined): [number, number] | undefined {
  const m = /(\d+)\s*(?:-|–|—|to)\s*(\d+)/.exec(text ?? '');
  if (!m) return undefined;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a > 0 && a <= b ? [a, b] : undefined;
}

/**
 * Arc pages only update arcs we already curate: order and level are ours, so a new arc
 * on the source is reported rather than created. All of the page's text is at the arc's level.
 */
export function mapArc({ title, wikitext, policy }: MapInput): Draft | Skip {
  const skip = pageSkipReason(wikitext);
  if (skip) return { skip: true, reason: skip };
  const match = policy.matchArc(title);
  if (!match?.arc) return { skip: true, reason: 'arc not in content/arcs (new arcs need a curated order and level)' };
  const r = new ParamReader(findInfobox(wikitext));
  r.raw(P.name); // the arc's name is curated; read so it is not reported as unmapped
  const secs = splitSections(wikitext);
  const summary = sectionParagraphs(secs[0]).slice(0, 2).map((p) => ({ value: truncate(p), level: match.level }));
  if (!summary.length) return { skip: true, reason: 'no lead text' };
  const chapters = parseChapterRange(r.text(P.chapters));
  const fields: Record<string, unknown> = { summary };
  if (chapters) fields.chapters = chapters;
  return {
    type: 'arcs',
    title,
    slug: match.arc,
    fields,
    refs: [],
    edges: [],
    level: match.level,
    infobox: r.template?.name,
    unmapped: r.unmapped(),
    notes: [],
  };
}
