import { getCollection } from 'astro:content';
import { buildIndex, findDanglingRefs, type Index } from './graph';

let cached: Promise<Index> | undefined;

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
