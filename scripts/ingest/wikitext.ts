/**
 * A small wikitext reader: just enough MediaWiki syntax to pull infobox parameters
 * and readable prose out of a page. It is deliberately conservative: anything it does
 * not understand (unknown templates, tables, galleries) is dropped rather than leaked.
 */

export interface Template {
  /** Name as written, trimmed (comments removed). */
  name: string;
  /** Lower-cased, `_`→space, collapsed whitespace: use for comparisons. */
  key: string;
  /** Named params keyed by normalized name; positional params as "1", "2", ... */
  params: Map<string, string>;
  /** Param names in source order, as normalized keys. */
  order: string[];
  raw: string;
  start: number;
  end: number;
}

export interface Section {
  /** Plain-text heading; '' for the lead. */
  heading: string;
  /** 0 for the lead, else the number of `=` signs. */
  depth: number;
  /** Headings from the outermost ancestor down to this one (empty for the lead). */
  path: string[];
  /** The section's own wikitext, excluding subsections. */
  wikitext: string;
}

export interface Link {
  target: string;
  label: string;
}

export const normalizeKey = (s: string) =>
  s.replace(/<!--[\s\S]*?(?:-->|$)/g, '').replace(/[_\s]+/g, ' ').trim().toLowerCase();

/** Index just past the end of an HTML comment starting at `i`, or -1 if none starts there. */
function skipComment(text: string, i: number): number {
  if (!text.startsWith('<!--', i)) return -1;
  const end = text.indexOf('-->', i + 4);
  return end === -1 ? text.length : end + 3;
}

const NOWIKI_RE = /^<(nowiki|pre|math|syntaxhighlight|source)\b[^>]*?(\/)?>/i;
const REF_OPEN_RE = /^<ref\b[^>]*?(\/)?>/i;

/** Skips <nowiki>…</nowiki> (and friends) or a <ref>…</ref> block starting at `i`. */
function skipOpaque(text: string, i: number, includeRefs: boolean): number {
  if (text[i] !== '<') return -1;
  const rest = text.slice(i, i + 200);
  const m = NOWIKI_RE.exec(rest) ?? (includeRefs ? REF_OPEN_RE.exec(rest) : null);
  if (!m) return -1;
  if (m[0].endsWith('/>')) return i + m[0].length;
  const name = /^<(\w+)/.exec(m[0])![1].toLowerCase();
  const close = text.toLowerCase().indexOf(`</${name}`, i + m[0].length);
  if (close === -1) return text.length;
  const gt = text.indexOf('>', close);
  return gt === -1 ? text.length : gt + 1;
}

/**
 * Splits `text` on `sep` at the top level only: separators inside {{templates}},
 * [[links]], {{{params}}}, comments, <nowiki> or <ref> blocks are ignored.
 */
export function splitTopLevel(text: string, sep = '|'): string[] {
  const out: string[] = [];
  let braces = 0;
  let brackets = 0;
  let last = 0;
  let i = 0;
  while (i < text.length) {
    const c = skipComment(text, i);
    if (c !== -1) { i = c; continue; }
    const o = skipOpaque(text, i, true);
    if (o !== -1) { i = o; continue; }
    if (text.startsWith('{{', i)) { braces++; i += 2; continue; }
    if (text.startsWith('}}', i) && braces > 0) { braces--; i += 2; continue; }
    if (text.startsWith('[[', i)) { brackets++; i += 2; continue; }
    if (text.startsWith(']]', i) && brackets > 0) { brackets--; i += 2; continue; }
    if (braces === 0 && brackets === 0 && text.startsWith(sep, i)) {
      out.push(text.slice(last, i));
      i += sep.length;
      last = i;
      continue;
    }
    i++;
  }
  out.push(text.slice(last));
  return out;
}

/** Finds the end (exclusive) of the template opening at `start` (`{{`), or -1 if unbalanced. */
function matchBraces(text: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const c = skipComment(text, i);
    if (c !== -1) { i = c; continue; }
    const o = skipOpaque(text, i, false);
    if (o !== -1) { i = o; continue; }
    if (text.startsWith('{{', i)) { depth++; i += 2; continue; }
    if (text.startsWith('}}', i)) {
      depth--;
      i += 2;
      if (depth === 0) return i;
      continue;
    }
    i++;
  }
  return -1;
}

export function parseTemplate(raw: string, start = 0): Template {
  const inner = raw.slice(2, -2);
  const parts = splitTopLevel(inner, '|');
  const name = parts[0].replace(/<!--[\s\S]*?-->/g, '').trim();
  const params = new Map<string, string>();
  const order: string[] = [];
  let pos = 0;
  for (const part of parts.slice(1)) {
    const eq = splitTopLevel(part, '=');
    let key: string;
    let value: string;
    if (eq.length > 1 && normalizeKey(eq[0]) !== '') {
      key = normalizeKey(eq[0]);
      value = eq.slice(1).join('=');
    } else {
      key = String(++pos);
      value = part;
    }
    value = value.trim();
    if (!params.has(key)) order.push(key);
    params.set(key, value);
  }
  return { name, key: normalizeKey(name), params, order, raw, start, end: start + raw.length };
}

/** Top-level templates in document order (templates nested inside others are not listed). */
export function findTemplates(text: string): Template[] {
  const out: Template[] = [];
  let i = 0;
  while (i < text.length) {
    const c = skipComment(text, i);
    if (c !== -1) { i = c; continue; }
    const o = skipOpaque(text, i, false);
    if (o !== -1) { i = o; continue; }
    if (text.startsWith('{{', i) && !text.startsWith('{{{', i)) {
      const end = matchBraces(text, i);
      if (end === -1) break;
      out.push(parseTemplate(text.slice(i, end), i));
      i = end;
      continue;
    }
    if (text.startsWith('{{{', i)) {
      const end = text.indexOf('}}}', i);
      i = end === -1 ? text.length : end + 3;
      continue;
    }
    i++;
  }
  return out;
}

/**
 * The page's infobox: the first top-level template whose name contains "infobox"
 * (either word order), else the first top-level template with at least three named params.
 */
export function findInfobox(text: string): Template | undefined {
  const templates = findTemplates(text);
  return (
    templates.find((t) => t.key.includes('infobox')) ??
    templates.find((t) => t.order.filter((k) => !/^\d+$/.test(k)).length >= 3)
  );
}

/** The first non-empty value among candidate param names (normalized comparison). */
export function param(t: Template | undefined, candidates: readonly string[]): { key: string; value: string } | undefined {
  if (!t) return undefined;
  for (const c of candidates) {
    const key = normalizeKey(c);
    const v = t.params.get(key);
    if (v !== undefined && toPlainText(v) !== '') return { key, value: v };
  }
  return undefined;
}

const HEADING_RE = /^(={1,6})(.+?)\1\s*(?:<!--.*?-->\s*)*$/;

/** Splits a page into the lead plus one entry per `==`/`===`… heading. */
export function splitSections(text: string): Section[] {
  const lines = stripComments(text).split('\n');
  const sections: Section[] = [{ heading: '', depth: 0, path: [], wikitext: '' }];
  const stack: { depth: number; heading: string }[] = [];
  let buf: string[] = [];
  const flush = () => {
    sections[sections.length - 1].wikitext = buf.join('\n').trim();
    buf = [];
  };
  for (const line of lines) {
    const m = HEADING_RE.exec(line.trim());
    if (m && m[2].trim() !== '') {
      flush();
      const depth = m[1].length;
      const heading = toPlainText(m[2]).trim();
      while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
      stack.push({ depth, heading });
      sections.push({ heading, depth, path: stack.map((s) => s.heading), wikitext: '' });
    } else {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

export const stripComments = (text: string) => text.replace(/<!--[\s\S]*?(?:-->|$)/g, '');

/** Removes <ref>…</ref> and <ref … /> (nested templates inside refs are removed with them). */
export function stripRefs(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '<' && /^<ref\b/i.test(text.slice(i, i + 5))) {
      const end = skipOpaque(text, i, true);
      if (end !== -1) { i = end; continue; }
    }
    out += text[i];
    i++;
  }
  return out.replace(/<\/ref>/gi, '');
}

const NIHONGO = new Set(['nihongo', 'nihongo2', 'nihongo3', 'nihongo4', 'nihongo foot', 'nihongo core', 'nihongo krt']);
/** Templates rendered as their first positional parameter. */
const FIRST_PARAM = new Set([
  'nowrap', 'small', 'big', 'sic', 'w', 'wp', 'tooltip', 'abbr', 'lang-ja', 'ruby', 'ruby-ja', 'nobold', 'smallcaps',
  'em', 'strong', 'nobr', 'color', 'colour', 'highlight', 'pagename',
]);
/** Templates whose parameters are list items. */
const LIST_TEMPLATES = new Set(['ubl', 'unbulleted list', 'plainlist', 'flatlist', 'hlist', 'bulleted list', 'ublist', 'plain list']);

function templateToText(t: Template): string {
  const p = (k: string) => t.params.get(k) ?? '';
  const k = t.key;
  if (k === '!') return '|';
  if (k === "'" ) return "'";
  if (k === '=') return '=';
  if (NIHONGO.has(k)) {
    // {{nihongo|English|漢字|romaji}}: keep the English, falling back to romaji then kanji.
    return p('1') || p('3') || p('2');
  }
  if (k === 'lang') return p('2');
  if (k === 'color' || k === 'colour') return p('2');
  if (FIRST_PARAM.has(k)) return p('1');
  if (LIST_TEMPLATES.has(k)) {
    const items = t.order.filter((x) => /^\d+$/.test(x)).map((x) => t.params.get(x)!);
    return items.join('\n');
  }
  // Citations, notes, navigation, maintenance and anything unknown: dropped.
  return '';
}

/** Expands (or drops) every template, innermost first. */
export function expandTemplates(text: string): string {
  const templates = findTemplates(text);
  if (!templates.length) return text;
  let out = '';
  let last = 0;
  for (const t of templates) {
    out += text.slice(last, t.start);
    const inner: Template = { ...t, params: new Map([...t.params].map(([k, v]) => [k, expandTemplates(v)])) };
    out += templateToText(inner);
    last = t.end;
  }
  return out + text.slice(last);
}

const NON_ARTICLE_PREFIX = /^\s*:?\s*(file|image|media|category|datei|imagen|fichier|template|special|user|help|wikipedia|w|wikt|[a-z]{2}(-[a-z]+)?)\s*:/i;
const DROP_LINK_PREFIX = /^\s*(file|image|media|category|datei|imagen|fichier|[a-z]{2}(-[a-z]+)?)\s*:/i;

/** Replaces [[links]]: files, categories and interlanguage links are removed, others become their label. */
export function replaceLinks(text: string, onLink?: (l: Link) => void): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('[[', i)) {
      // Find the matching ]] accounting for nesting (file captions contain links).
      let depth = 0;
      let j = i;
      while (j < text.length) {
        if (text.startsWith('[[', j)) { depth++; j += 2; continue; }
        if (text.startsWith(']]', j)) { depth--; j += 2; if (depth === 0) break; continue; }
        j++;
      }
      if (depth !== 0) { out += text.slice(i); break; }
      const inner = text.slice(i + 2, j - 2);
      const parts = splitTopLevel(inner, '|');
      const rawTarget = parts[0];
      if (DROP_LINK_PREFIX.test(rawTarget) && !/^\s*:/.test(rawTarget)) {
        i = j;
        continue;
      }
      const target = rawTarget.replace(/^\s*:/, '').split('#')[0].replace(/_/g, ' ').trim();
      let label = parts.length > 1 ? parts.slice(1).join('|') : rawTarget.replace(/^\s*:/, '');
      if (parts.length > 1 && label.trim() === '') label = target.replace(/\s*\([^)]*\)\s*$/, ''); // pipe trick
      label = replaceLinks(label).trim();
      if (target && !NON_ARTICLE_PREFIX.test(target)) onLink?.({ target: target[0].toUpperCase() + target.slice(1), label });
      out += label;
      i = j;
      continue;
    }
    out += text[i];
    i++;
  }
  return out;
}

/** Internal article links in `text`, in order. */
export function extractLinks(text: string): Link[] {
  const links: Link[] = [];
  replaceLinks(expandTemplates(stripRefs(stripComments(text))), (l) => links.push(l));
  return links;
}

function stripTables(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let depth = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('{|')) { depth++; continue; }
    if (depth > 0) {
      if (t.startsWith('|}')) depth--;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', hellip: '…', thinsp: ' ', ensp: ' ', emsp: ' ' };

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/**
 * Converts wikitext to plain text. Paragraphs are separated by a blank line; single
 * newlines inside a paragraph become spaces, as MediaWiki renders them.
 */
export function toPlainText(wikitext: string): string {
  let t = stripComments(wikitext);
  t = t.replace(/<(gallery|tabber|imagemap|timeline|score|graph|references)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  t = t.replace(/<references\s*\/>/gi, '');
  t = stripRefs(t);
  t = t.replace(/<(nowiki)>([\s\S]*?)<\/nowiki>/gi, (_, __, inner: string) => inner.replace(/\[/g, '&#91;').replace(/\{/g, '&#123;'));
  t = expandTemplates(t);
  t = stripTables(t);
  t = replaceLinks(t);
  t = t.replace(/\[(?:https?:)?\/\/[^\s\]]+(?:\s+([^\]]*))?\]/g, (_, label?: string) => label ?? '');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<\/?[a-z][a-z0-9]*\b[^>]*>/gi, '');
  t = t.replace(/'{2,}/g, '');
  t = t.replace(/__[A-Z]+__/g, '');
  t = decodeEntities(t);
  const paragraphs: string[] = [];
  let cur: string[] = [];
  for (const raw of t.split('\n')) {
    const line = raw.replace(/^[*#:;]+\s*/, '').replace(/^-{4,}$/, '').trim();
    if (line === '') {
      if (cur.length) paragraphs.push(cur.join(' '));
      cur = [];
    } else if (/^[*#]/.test(raw.trim())) {
      // List items stay on their own line inside the paragraph block.
      if (cur.length) paragraphs.push(cur.join(' '));
      cur = [];
      paragraphs.push(line);
    } else {
      cur.push(line);
    }
  }
  if (cur.length) paragraphs.push(cur.join(' '));
  return paragraphs
    .map((p) =>
      p
        .replace(/[ \t\u00a0]+/g, ' ')
        // "Unlimited Void (Unlimited Void)": a nihongo template repeating the bolded name.
        .replace(/(^|[\s(])([^\s()][^()]{0,80}?) \(\2\)/g, '$1$2')
        .replace(/\(\s*[,;]?\s*\)/g, '')
        .replace(/\(\s*[,;]\s*/g, '(')
        .replace(/\s+([,.;:!?)])/g, '$1')
        .replace(/\(\s+/g, '(')
        .replace(/ {2,}/g, ' ')
        .trim(),
    )
    .filter((p) => p !== '')
    .join('\n\n');
}

export const paragraphs = (plain: string) => plain.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

export interface ListItem {
  /** Plain text of the item. */
  text: string;
  /** Article links in the item. */
  links: Link[];
  /** Text of a trailing parenthetical, e.g. "formerly" in "Grade 1 (formerly)". */
  note?: string;
}

/**
 * Splits an infobox value into items on <br>, newlines, bullets and list templates.
 * `[[A]], [[B]]` style comma lists are split only when every part is a link.
 */
export function splitList(value: string): ListItem[] {
  let v = stripRefs(stripComments(value));
  // Unwrap list templates first so their params become lines.
  v = v.replace(/\{\{\s*(ubl|unbulleted list|plainlist|flatlist|hlist|bulleted list|ublist|plain list)\s*\|([\s\S]*)\}\}/i, (_, __, inner: string) =>
    splitTopLevel(inner, '|').join('\n'),
  );
  const pieces = v.split(/<br\s*\/?>|\n/i).flatMap((p) => {
    const trimmed = p.replace(/^[*#:]+\s*/, '').trim();
    const commaParts = splitTopLevel(trimmed, ',').map((x) => x.trim());
    if (commaParts.length > 1 && commaParts.every((x) => /^\[\[[^\]]+\]\]\s*(\([^)]*\))?$/.test(x))) return commaParts;
    return [trimmed];
  });
  const out: ListItem[] = [];
  for (const piece of pieces) {
    if (!piece) continue;
    const links = extractLinks(piece);
    const text = toPlainText(piece).replace(/\n+/g, ' ').trim();
    if (!text) continue;
    const m = /\(([^()]*)\)\s*$/.exec(text);
    out.push({ text, links, note: m ? m[1].trim() : undefined });
  }
  return out;
}

/** Trims a paragraph to at most `max` characters, cutting at a sentence boundary when possible. */
export function truncate(text: string, max = 700): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const cut = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  return cut > max / 3 ? slice.slice(0, cut + 1) : `${slice.slice(0, slice.lastIndexOf(' '))}…`;
}
