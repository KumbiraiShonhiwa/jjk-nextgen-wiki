/**
 * Fetching one Wikipedia page's current wikitext, shared by the Wikipedia ingests.
 *
 * Separate from `mediawiki.ts`, which carries the Fandom run's caching, throttling and category
 * discovery. These ingests read a handful of known pages, so they need the revision and the text
 * and nothing else.
 */
import { WIKIPEDIA } from './config.ts';

export const USER_AGENT = 'jjk-nextgen-wiki/0.1 (https://github.com/KumbiraiShonhiwa/jjk-nextgen-wiki; content ingest)';

export interface Revision {
  title: string;
  revisionId: number;
  wikitext: string;
}

/** Returns undefined for a page that does not exist, which is expected for an unaired season. */
export async function fetchPage(title: string): Promise<Revision | undefined> {
  const url = `${WIKIPEDIA.endpoint}?action=query&prop=revisions&rvprop=content|ids&rvslots=main&format=json&formatversion=2&maxlag=${WIKIPEDIA.maxlag}&titles=${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${title}: HTTP ${res.status}`);
  const body = (await res.json()) as {
    query?: { pages?: { title: string; missing?: boolean; revisions?: { revid: number; slots: { main: { content: string } } }[] }[] };
  };
  const page = body.query?.pages?.[0];
  if (!page || page.missing || !page.revisions?.length) return undefined;
  return { title: page.title, revisionId: page.revisions[0]!.revid, wikitext: page.revisions[0]!.slots.main.content };
}

/** The provenance entry for text taken from a Wikipedia page. */
export const wikipediaProvenance = (page: Revision, fetchedAt: string) => ({
  source: 'wikipedia' as const,
  title: page.title,
  url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
  revisionId: page.revisionId,
  fetchedAt,
  licence: 'CC BY-SA 4.0' as const,
});
