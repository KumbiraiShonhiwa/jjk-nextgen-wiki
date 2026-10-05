import { isVisible, type SpoilerLevel } from '../content/schemas/common';

/**
 * First-mention glossary linking (roadmap B4, doc 04's first-mention rule).
 *
 * Body text is plain strings in the records, so marking a term means producing HTML. Everything
 * from a record is escaped first and the markup is assembled from our own values afterwards, so no
 * record can inject an element. The output is inserted with `set:html`, which does not escape.
 */

export interface GlossaryTerm {
  slug: string;
  name: string;
  aliases: string[];
  level: SpoilerLevel;
  /** Already resolved to the sentence's level by the caller. */
  definition: string;
}

/** Escapes text for insertion into HTML, including the quotes used in attribute values. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every spelling a term answers to, longest first so "Domain Expansion" wins over "domain". */
function spellings(terms: GlossaryTerm[]): { term: GlossaryTerm; pattern: string }[] {
  return terms
    .flatMap((term) => [term.name, ...term.aliases].map((s) => ({ term, pattern: s })))
    .filter((s) => s.pattern.trim().length > 2)
    .sort((a, b) => b.pattern.length - a.pattern.length);
}

/**
 * Marks the first mention of each term in `text` and returns HTML.
 *
 * `seen` carries across calls so a page links a term once, however many paragraphs it spans, per
 * doc 04. A term is only linked in text the reader can already see: linking a manga-level term
 * inside an anime-s1 sentence would say that the mechanic exists.
 */
export function linkFirstMentions(text: string, terms: GlossaryTerm[], seen: Set<string>, textLevel: SpoilerLevel = 'manga'): string {
  const usable = terms.filter((t) => isVisible(t.level, textLevel) && !seen.has(t.slug));
  if (!usable.length) return escapeHtml(text);

  let out = '';
  let rest = text;
  // One spelling at a time, re-scanning the remainder, so an earlier match cannot be re-marked and
  // the output is assembled only from escaped text plus our own markup.
  for (;;) {
    const candidates = spellings(usable.filter((t) => !seen.has(t.slug)));
    let best: { index: number; length: number; term: GlossaryTerm } | undefined;
    for (const { term, pattern } of candidates) {
      const re = new RegExp(`\\b${escapeRegExp(pattern)}\\b`, 'i');
      const m = re.exec(rest);
      if (m && (best === undefined || m.index < best.index)) best = { index: m.index, length: m[0].length, term };
    }
    if (!best) break;
    const matched = rest.slice(best.index, best.index + best.length);
    out += escapeHtml(rest.slice(0, best.index)) + mention(best.term, matched);
    rest = rest.slice(best.index + best.length);
    seen.add(best.term.slug);
  }
  return out + escapeHtml(rest);
}

/**
 * A mention: a button that opens a popover, plus the popover. Native `popover`, so it is keyboard
 * reachable and needs no JavaScript; the link to the full entry lives inside it.
 */
function mention(term: GlossaryTerm, matched: string): string {
  const id = `gloss-${escapeHtml(term.slug)}`;
  return (
    `<span class="term"><button type="button" class="term-trigger" popovertarget="${id}">${escapeHtml(matched)}</button>` +
    `<span popover id="${id}" class="term-popover">` +
    `<span class="term-name">${escapeHtml(term.name)}</span>` +
    `<span class="term-definition">${escapeHtml(term.definition)}</span>` +
    `<a class="term-more" href="/glossary/${escapeHtml(term.slug)}">Full entry</a>` +
    `</span></span>`
  );
}
