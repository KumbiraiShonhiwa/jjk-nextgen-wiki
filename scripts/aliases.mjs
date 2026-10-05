/**
 * Alias redirects (doc 04: `/characters/gojo` -> `/characters/gojo-satoru`).
 *
 * Read straight off the JSON in `content/` rather than through `astro:content`, because this runs
 * inside astro.config.mjs, before the content layer exists. Pure logic is separated from the file
 * reading so the collision rules can be unit tested without a fixture directory.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Collections whose records may carry `aliases`, mapped to their route base. */
export const ALIASED = { characters: '/characters' };

/**
 * Builds the redirect map and reports every collision instead of throwing on the first one, so a
 * broken content PR shows all of its problems at once.
 *
 * @param {Record<string, {slug: string, aliases?: string[]}[]>} byCollection
 * @returns {{ redirects: Record<string, string>, problems: string[] }}
 */
export function collectAliases(byCollection) {
  /** @type {Record<string, string>} */
  const redirects = {};
  const problems = [];
  /** Every real page path, so an alias can never shadow one. */
  const slugs = new Set();
  for (const [collection, records] of Object.entries(byCollection)) {
    const base = ALIASED[collection];
    if (!base) continue;
    for (const r of records) slugs.add(`${base}/${r.slug}`);
  }
  /** Which record claimed an alias first, for a useful message on the second. */
  const claimed = new Map();

  for (const [collection, records] of Object.entries(byCollection)) {
    const base = ALIASED[collection];
    if (!base) continue;
    for (const record of records) {
      for (const alias of record.aliases ?? []) {
        const from = `${base}/${alias}`;
        const to = `${base}/${record.slug}`;
        if (slugs.has(from)) {
          problems.push(`${collection}: alias "${alias}" (${record.slug}) collides with a real page at ${from}.`);
          continue;
        }
        const first = claimed.get(from);
        if (first) {
          problems.push(`${collection}: alias "${alias}" is claimed by both ${first} and ${record.slug}.`);
          continue;
        }
        claimed.set(from, record.slug);
        redirects[from] = to;
      }
    }
  }
  return { redirects, problems };
}

/** Reads `content/<collection>/*.json` for every aliased collection. */
export function readRecords(root = 'content') {
  /** @type {Record<string, any[]>} */
  const out = {};
  for (const collection of Object.keys(ALIASED)) {
    const dir = join(root, collection);
    out[collection] = existsSync(dir)
      ? readdirSync(dir)
          .filter((f) => f.endsWith('.json'))
          .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
      : [];
  }
  return out;
}

/**
 * The redirect map for astro.config.mjs. Throws on a collision: a silently dropped redirect would
 * be a 404 that nobody notices until a reader hits it.
 */
export function aliasRedirects(root = 'content') {
  const { redirects, problems } = collectAliases(readRecords(root));
  if (problems.length) throw new Error(`Alias problems:\n  ${problems.join('\n  ')}`);
  return redirects;
}
