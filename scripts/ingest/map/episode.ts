/**
 * Episodes, from the English Wikipedia season pages (roadmap A1).
 *
 * This is the first Wikipedia mapping in the ingest (doc 03 noted none existed). Those pages carry
 * one `{{Episode list}}` / `{{Episode list/sublist}}` per episode, with named parameters, so this
 * reads the templates directly rather than the prose.
 */
import type { SpoilerLevel } from '../../../src/content/schemas/index.ts';
import { templateParams, templatesNamed } from './wikitemplate.ts';

export { templateParams } from './wikitemplate.ts';

export interface EpisodeDraft {
  season: number;
  numberInSeason: number;
  number?: number;
  title: { en: string; ja?: string };
  airedAt?: string;
  summary?: string;
  level: SpoilerLevel;
}

/**
 * Removes every HTML-ish tag, repeatedly, then drops any angle bracket left over.
 *
 * A single pass is not enough: `<<ref>script>` leaves `<script` behind once the inner `<ref>` is
 * removed, which is CodeQL's js/incomplete-multi-character-sanitization. Looping to a fixed point
 * and then removing stray brackets means no element can survive, whatever the input.
 */
function stripTags(value: string): string {
  let previous: string;
  let out = value;
  do {
    previous = out;
    out = out.replace(/<[^<>]*>/g, '');
  } while (out !== previous);
  return out.replace(/[<>]/g, '');
}

/** Strips wiki markup from a parameter's value: links, bold/italics, refs, notes and templates. */
export function plain(value: string): string {
  let out = value;
  // <ref>…</ref> takes its contents with it; done before the general tag strip so citation text goes too.
  let previous: string;
  do {
    previous = out;
    out = out.replace(/<ref[^<>]*>[\s\S]*?<\/ref\s*>/gi, '').replace(/<ref[^<>]*\/>/gi, '');
  } while (out !== previous);
  return stripTags(
    out
      .replace(/\{\{\s*efn[\s\S]*?\}\}/gi, '')
      // {{Nihongo|English|漢字|romaji}} keeps the first argument.
      .replace(/\{\{\s*nihongo\s*\|([^|}]*)[^}]*\}\}/gi, '$1')
      // Any other template: keep the last argument, which is usually the display text.
      .replace(/\{\{[^{}]*\}\}/g, (m) => m.slice(2, -2).split('|').pop() ?? '')
      .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
      .replace(/'{2,}/g, ''),
  )
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

/** Every `{{Episode list}}` / `{{Episode list/sublist}}` body on a page. */
export function episodeTemplates(wikitext: string): string[] {
  return templatesNamed(wikitext, 'Episode list(?:\/sublist)?');
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
