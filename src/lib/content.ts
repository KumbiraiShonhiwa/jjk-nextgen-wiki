import { getCollection } from 'astro:content';
import type { CommunityLink } from '../content/schemas';
import { buildIndex, findDanglingRefs, type Index } from './graph';
import { findDanglingLinks, findDuplicateLinks } from './links';

let cached: Promise<Index> | undefined;
let cachedLinks: Promise<CommunityLink[]> | undefined;

const data = <T extends { data: unknown }>(entries: T[]) => entries.map((e) => e.data as T['data']);

/** Loads every collection once per build and verifies that all references resolve. */
export function loadIndex(): Promise<Index> {
  cached ??= (async () => {
    const ix = buildIndex({
      characters: data(await getCollection('characters')),
      techniques: data(await getCollection('techniques')),
      domains: data(await getCollection('domains')),
      arcs: data(await getCollection('arcs')),
      organizations: data(await getCollection('organizations')),
      locations: data(await getCollection('locations')),
      edges: data(await getCollection('edges')),
    });
    const dangling = findDanglingRefs(ix);
    if (dangling.length) {
      const lines = dangling.map((d) => `  ${d.from}.${d.field} -> ${d.to} (${d.expected})`);
      throw new Error(`Dangling content references:\n${lines.join('\n')}`);
    }
    return ix;
  })();
  return cached;
}

/** The curated community links, checked against the content so no link points at a page that does not exist. */
export function loadLinks(): Promise<CommunityLink[]> {
  cachedLinks ??= (async () => {
    const links = data(await getCollection('links'));
    const ix = await loadIndex();
    const problems = [
      ...findDanglingLinks(links, ix).map((d) => `  ${d.id} targets unknown slug ${d.target}`),
      ...findDuplicateLinks(links).map((d) => `  duplicate ${d}`),
    ];
    if (problems.length) throw new Error(`Invalid community links:\n${problems.join('\n')}`);
    return links;
  })();
  return cachedLinks;
}
