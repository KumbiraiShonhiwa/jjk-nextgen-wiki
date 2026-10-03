/**
 * Offline answers from recorded API responses (`--fixtures=<dir>`).
 *
 * Each `*.json` file under `<dir>/<host>/` is a CacheEntry-like recording
 * `{ "params": {...}, "response": {...} }` (the same shape as `.cache/raw/` entries).
 * Lookups try, in order:
 *   1. an exact match on the request params (ignoring format/formatversion/maxlag);
 *   2. for `prop=info` and `prop=revisions&revids=`, a response assembled from every page
 *      found in recorded `prop=revisions` responses, so fixture batches need not match the
 *      CLI's batching exactly.
 * A recorded page may list `fixtureRedirects: ["Old title"]` (not a MediaWiki field) so that
 * `prop=info&redirects=1` answers for those titles with a `redirects` entry, as the API would.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ApiResponse, ResponseSource } from './mediawiki.ts';

const IGNORED = new Set(['format', 'formatversion', 'maxlag', 'continue']);

interface Recording {
  params: Record<string, string>;
  response: ApiResponse;
}

const comparable = (p: Record<string, string>) =>
  JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k]) => !IGNORED.has(k)).sort(([a], [b]) => a.localeCompare(b))));

export class FixtureStore implements ResponseSource {
  private byHost = new Map<string, Recording[]>();
  /** Pages from recorded prop=revisions responses, by host. */
  private pages = new Map<string, ApiResponse[]>();

  constructor(dir: string) {
    for (const host of readdirSync(dir)) {
      const hostDir = join(dir, host);
      if (!statSync(hostDir).isDirectory()) continue;
      const recs: Recording[] = [];
      const pages: ApiResponse[] = [];
      for (const file of readdirSync(hostDir).filter((f) => f.endsWith('.json')).sort()) {
        const rec = JSON.parse(readFileSync(join(hostDir, file), 'utf8')) as Recording;
        if (!rec.params || !rec.response) throw new Error(`Fixture ${host}/${file} needs "params" and "response"`);
        const params = Object.fromEntries(Object.entries(rec.params).map(([k, v]) => [k, String(v)]));
        recs.push({ params, response: rec.response });
        if (params.prop === 'revisions') pages.push(...((rec.response.query?.pages ?? []) as ApiResponse[]));
      }
      this.byHost.set(host, recs);
      this.pages.set(host, pages);
    }
  }

  lookup(endpoint: string, params: Record<string, string>): ApiResponse | undefined {
    const host = new URL(endpoint).host;
    const recs = this.byHost.get(host) ?? [];
    const key = comparable(params);
    const exact = recs.find((r) => comparable(r.params) === key);
    if (exact) return exact.response;

    const pages = this.pages.get(host) ?? [];
    if (params.action === 'query' && params.prop === 'info' && params.titles) {
      return { batchcomplete: true, query: this.info(params.titles.split('|'), pages, params.redirects === '1') };
    }
    if (params.action === 'query' && params.prop === 'revisions' && params.revids) {
      const wanted = new Set(params.revids.split('|').map(Number));
      const found = pages.filter((p) => (p.revisions ?? []).some((r: ApiResponse) => wanted.has(r.revid)));
      const badrevids = [...wanted].filter((id) => !found.some((p) => p.revisions.some((r: ApiResponse) => r.revid === id)));
      return {
        batchcomplete: true,
        query: { ...(badrevids.length ? { badrevids: Object.fromEntries(badrevids.map((r) => [r, { revid: r, missing: true }])) } : {}), pages: found },
      };
    }
    return undefined;
  }

  private info(titles: string[], pages: ApiResponse[], followRedirects: boolean) {
    const normalized: { fromencoded: boolean; from: string; to: string }[] = [];
    const redirects: { from: string; to: string }[] = [];
    const out: ApiResponse[] = [];
    const seen = new Set<string>();
    for (const requested of titles) {
      let title = requested.replace(/_/g, ' ');
      title = title.charAt(0).toUpperCase() + title.slice(1);
      if (title !== requested) normalized.push({ fromencoded: false, from: requested, to: title });
      let page = pages.find((p) => p.title === title);
      if (!page && followRedirects) {
        // Fixture pages may declare redirects that point at them.
        const target = pages.find((p) => ((p.fixtureRedirects ?? []) as string[]).includes(title));
        if (target) {
          redirects.push({ from: title, to: target.title });
          page = target;
          title = target.title;
        }
      }
      if (seen.has(title)) continue;
      seen.add(title);
      if (!page) {
        out.push({ ns: 0, title, missing: true });
        continue;
      }
      const rev = page.revisions[page.revisions.length - 1];
      out.push({ pageid: page.pageid, ns: page.ns, title: page.title, contentmodel: 'wikitext', pagelanguage: 'en', touched: rev.timestamp, lastrevid: rev.revid, length: rev.slots.main.content.length });
    }
    return { ...(normalized.length ? { normalized } : {}), ...(redirects.length ? { redirects } : {}), pages: out };
  }
}
