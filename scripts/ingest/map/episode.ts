/**
 * Episodes, from the English Wikipedia season pages (roadmap A1).
 *
 * This is the first Wikipedia mapping in the ingest (doc 03 noted none existed). Those pages carry
 * one `{{Episode list}}` / `{{Episode list/sublist}}` per episode, with named parameters, so this
 * reads the templates directly rather than the prose.
 */
import type { SpoilerLevel } from '../../../src/content/schemas/index.ts';

export interface EpisodeDraft {
  season: number;
  numberInSeason: number;
  number?: number;
  title: { en: string; ja?: string };
  airedAt?: string;
  summary?: string;
  level: SpoilerLevel;
}

/** Strips wiki markup from a parameter's value: links, bold/italics, refs, notes and templates. */
export function plain(value: string): string {
  return value
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[\s\S]*?<\/ref>/gi, '')
    .replace(/\{\{\s*efn[\s\S]*?\}\}/gi, '')
    // {{Nihongo|English|漢字|romaji}} keeps the first argument.
    .replace(/\{\{\s*nihongo\s*\|([^|}]*)[^}]*\}\}/gi, '$1')
    // Any other template: keep the last argument, which is usually the display text.
    .replace(/\{\{[^{}]*\}\}/g, (m) => m.slice(2, -2).split('|').pop() ?? '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `{{Start date|2020|10|3}}` → `2020-10-03`. Returns undefined when there is no usable date. */
export function airDate(value: string): string | undefined {
  const m = /\{\{\s*start date\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i.exec(value);
  if (!m) return undefined;
  const [, y, mo, d] = m;
  return `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
}

/**
 * Splits a template body into named parameters. Done by hand rather than with a regex per
 * parameter because values contain nested templates and `|` inside them.
 */
export function templateParams(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  let depth = 0;
  let current = '';
  const parts: string[] = [];
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      current += two;
      i++;
      continue;
    }
    if (two === '}}' || two === ']]') {
      depth--;
      current += two;
      i++;
      continue;
    }
    if (body[i] === '|' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += body[i];
  }
  parts.push(current);
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    if (key) out[key] = part.slice(eq + 1).trim();
  }
  return out;
}

/** Every `{{Episode list…}}` body on a page, braces balanced. */
export function episodeTemplates(wikitext: string): string[] {
  const out: string[] = [];
  const re = /\{\{\s*Episode list(?:\/sublist)?\s*(?=[|\n])/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext))) {
    let depth = 1;
    let i = m.index + 2;
    const start = i;
    while (i < wikitext.length && depth > 0) {
      const two = wikitext.slice(i, i + 2);
      if (two === '{{') {
        depth++;
        i += 2;
        continue;
      }
      if (two === '}}') {
        depth--;
        i += 2;
        continue;
      }
      i++;
    }
    if (depth === 0) out.push(wikitext.slice(start, i - 2));
  }
  return out;
}

/**
 * Maps one season page. `season` and `level` come from the caller, which knows which page it
 * asked for; the page itself does not state its season number in a dependable place.
 */
export function mapEpisodes(wikitext: string, season: number, level: SpoilerLevel): EpisodeDraft[] {
  const drafts: EpisodeDraft[] = [];
  for (const body of episodeTemplates(wikitext)) {
    const p = templateParams(body);
    // EpisodeNumber is the series-wide number on these pages and EpisodeNumber2 the one within the
    // season; a season page that numbers only from 1 gives EpisodeNumber alone.
    const overall = Number(plain(p.episodenumber ?? ''));
    const within = Number(plain(p.episodenumber2 ?? '')) || overall;
    const title = plain(p.title ?? p.rtitle ?? '');
    if (!Number.isInteger(within) || within <= 0 || !title) continue;
    const ja = plain(p.nativetitle ?? '');
    const summary = plain(p.shortsummary ?? '');
    drafts.push({
      season,
      numberInSeason: within,
      number: Number.isInteger(overall) && overall > 0 ? overall : undefined,
      title: { en: title, ja: ja || undefined },
      airedAt: airDate(p.originalairdate ?? ''),
      summary: summary || undefined,
      level,
    });
  }
  // A season page can list an episode twice (a cour split repeats the table); keep the first.
  const seen = new Set<number>();
  return drafts.filter((d) => !seen.has(d.numberInSeason) && seen.add(d.numberInSeason));
}
