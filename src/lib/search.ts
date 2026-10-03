import { SPOILER_LEVELS, type SpoilerLevel } from '../content/schemas';

/** Page levels a visitor at `setting` may see in search results: everything up to and including it. */
export function allowedLevels(setting: SpoilerLevel): SpoilerLevel[] {
  return SPOILER_LEVELS.slice(0, SPOILER_LEVELS.indexOf(setting) + 1);
}

/** Pagefind reports `/arcs/x/`; the site's canonical form has no trailing slash (docs/04). */
export function canonicalUrl(url: string): string {
  const path = url.replace(/(index)?\.html$/, '');
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

export interface Hit {
  url: string;
  title: string;
  type: string;
  /** Pagefind excerpt: escaped text with <mark> around matches. */
  excerpt: string;
}

/** Ranking from docs/04: exact title match first, then entity type, then Pagefind's relevance order. */
const TYPE_ORDER = ['Character', 'Technique', 'Domain', 'Arc', 'Organization'];

export function rank(hits: Hit[], query: string): Hit[] {
  const q = query.trim().toLowerCase();
  const typeRank = (t: string) => {
    const i = TYPE_ORDER.indexOf(t);
    return i === -1 ? TYPE_ORDER.length : i;
  };
  return hits
    .map((hit, relevance) => ({ hit, relevance, exact: hit.title.toLowerCase() === q ? 0 : hit.title.toLowerCase().startsWith(q) ? 1 : 2 }))
    .sort((a, b) => a.exact - b.exact || (a.exact < 2 ? 0 : typeRank(a.hit.type) - typeRank(b.hit.type)) || a.relevance - b.relevance)
    .map((x) => x.hit);
}

/** The subset of the Pagefind browser API we use. */
export interface Pagefind {
  init(): Promise<void>;
  options(o: Record<string, unknown>): Promise<void>;
  debouncedSearch(
    q: string,
    o: { filters?: Record<string, { any: string[] }> },
    ms?: number,
  ): Promise<{ results: { data(): Promise<{ url: string; excerpt: string; meta: Record<string, string> }> }[] } | null>;
}
