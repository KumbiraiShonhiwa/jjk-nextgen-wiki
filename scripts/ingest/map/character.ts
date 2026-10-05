import { SPECIES } from '../../../src/content/schemas/index.ts';
import { characterSlug } from '../slugs.ts';
import { findInfobox } from '../wikitext.ts';
import {
  arcParagraphs, earliestArcLevel, leadText, nameFields, P, pageSkipReason, ParamReader, refItems, sections as splitSections,
  type Draft, type DraftEdge, type Gated, type MapInput, type Skip,
} from './common.ts';

type Species = (typeof SPECIES)[number];
type Grade = 'special' | 'semi-1' | '1' | 'semi-2' | '2' | '3' | '4' | 'ungraded';

const ORDINAL: Record<string, string> = { first: '1', second: '2', third: '3', fourth: '4', '1st': '1', '2nd': '2', '3rd': '3', '4th': '4', one: '1', two: '2', three: '3', four: '4' };

/** "Special Grade", "Grade 1", "Semi-Grade 1", "1st Grade", "Semi-1st Grade", "Ungraded" → Grade. */
export function parseGrade(text: string): Grade | undefined {
  const t = text.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[–—_]/g, '-').trim();
  if (/\bspecial\b/.test(t)) return 'special';
  if (/\bun-?graded\b|\bno grade\b|\bnone\b/.test(t)) return 'ungraded';
  const semi = /\bsemi\b|semi-/.test(t);
  const num = /(?:grade|class)\s*-?\s*([1-4])\b/.exec(t)?.[1] ?? /\b([1-4])(?:st|nd|rd|th)?\s*-?\s*(?:grade|class)\b/.exec(t)?.[1] ?? Object.entries(ORDINAL).find(([w]) => new RegExp(`\\b${w}\\b`).test(t) && /grade|class/.test(t))?.[1];
  if (!num) return undefined;
  if (semi) return num === '1' ? 'semi-1' : num === '2' ? 'semi-2' : undefined;
  return num as Grade;
}

export function parseSpecies(text: string): Species | undefined {
  const t = text.toLowerCase();
  if (/incarnat/.test(t)) return 'incarnated-sorcerer';
  if (/cursed womb|death painting/.test(t)) return 'cursed-womb';
  if (/shikigami/.test(t)) return 'shikigami';
  if (/vessel/.test(t)) return 'vessel';
  if (/cursed spirit|curse\b|spirit/.test(t)) return 'cursed-spirit';
  if (/human/.test(t)) return 'human';
  return undefined;
}

export function parseStatus(text: string): 'alive' | 'deceased' | 'unknown' {
  const t = text.toLowerCase();
  if (/deceased|dead|died|killed|exorcised|destroyed/.test(t)) return 'deceased';
  if (/alive|active|living/.test(t)) return 'alive';
  return 'unknown';
}

/** A list of gated enum values, one per parseable item, without duplicates. */
function gatedList<T>(items: { text: string }[], parse: (s: string) => T | undefined, level: (text: string, index: number) => Gated<T>['level']): Gated<T>[] {
  const out: Gated<T>[] = [];
  for (const item of items) {
    const v = parse(item.text);
    if (v === undefined || out.some((o) => o.value === v)) continue;
    out.push({ value: v, level: level(item.text, out.length) });
  }
  return out;
}

export function mapCharacter({ title, wikitext, policy }: MapInput): Draft | Skip {
  const skip = pageSkipReason(wikitext);
  if (skip) return { skip: true, reason: skip };
  const infobox = findInfobox(wikitext);
  if (!infobox) return { skip: true, reason: 'no infobox (not a character page?)' };
  const r = new ParamReader(infobox);
  const secs = splitSections(wikitext);

  const name = nameFields(r, title);
  const aliases = r.list(P.aliases).map((i) => i.text).filter((a) => a !== name.en);
  const species = gatedList(r.list(P.species), parseSpecies, (t, i) => policy.listItemLevel(t, i));
  const statusText = r.text(P.status);
  // Status is the classic spoiler: always manga unless overridden by hand.
  const status: Gated<'alive' | 'deceased' | 'unknown'>[] = statusText ? [{ value: parseStatus(statusText), level: 'manga' }] : [];
  const grade = gatedList(r.list(P.grade), parseGrade, (t, i) => policy.listItemLevel(t, i));

  const summary = [...leadText(secs, policy), ...arcParagraphs(secs, policy)];

  const edges: DraftEdge[] = r.list(P.relatives).flatMap((item) => {
    const to = [...item.links.map((l) => l.target), item.text.replace(/\s*\([^)]*\)\s*$/, '')].filter(Boolean);
    if (!item.links.length) return [];
    return [{ kind: 'family' as const, to, label: item.note?.toLowerCase(), level: policy.matchArc(item.text)?.level ?? 'manga' }];
  });

  /*
   * Profile fields, kept as the source wrote them. `firstAppearance` is gated by the arc its text
   * names, falling back to manga: naming a debut tells a reader that a character exists and
   * roughly when, which is a spoiler on its own.
   */
  const firstAppearance = r.list(P.firstAppearance).map((item) => ({
    value: item.text,
    level: policy.matchArc(item.text)?.level ?? ('manga' as const),
  }));

  const fields: Record<string, unknown> = { name };
  if (aliases.length) fields.aliases = aliases;
  for (const [key, param] of [
    ['gender', P.gender],
    ['birthday', P.birthday],
    ['height', P.height],
  ] as const) {
    const value = r.text(param)?.trim();
    if (value) fields[key] = value;
  }
  if (firstAppearance.length) fields.firstAppearance = firstAppearance;
  if (species.length) fields.species = species;
  if (summary.length) fields.summary = summary;
  if (status.length) fields.status = status;
  if (grade.length) fields.grade = grade;

  return {
    type: 'characters',
    title,
    slug: characterSlug(title, name.romaji),
    fields,
    refs: [
      { field: 'affiliations', expected: 'organizations', items: refItems(r.list(P.affiliations)), single: false },
      { field: 'techniques', expected: 'techniques', items: refItems(r.list(P.techniques)), single: false },
      { field: 'domain', expected: 'domains', items: refItems(r.list(P.domain)), single: true },
    ],
    edges,
    level: earliestArcLevel(secs, policy) ?? 'manga',
    infobox: infobox.name,
    unmapped: r.unmapped(),
    notes: summary.length ? [] : ['no summary text found'],
  };
}
