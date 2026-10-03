// @vitest-environment node
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FixtureStore } from '../../scripts/ingest/fixtures.ts';
import { chunk, MediaWikiClient, MediaWikiError, OfflineMissError, pageUrl, parseRetryAfter, USER_AGENT, type FetchLike, type FetchResponse } from '../../scripts/ingest/mediawiki.ts';
import { API_FIXTURES } from './helpers.ts';

const ENDPOINT = 'https://jujutsu-kaisen.fandom.com/api.php';

interface Call {
  url: URL;
  at: number;
  headers: Record<string, string>;
}

/** A fake clock + fetch: `sleep` advances time instantly, `fetch` replays scripted responses. */
function harness(responses: ((url: URL) => { status?: number; body?: unknown; headers?: Record<string, string> })[]) {
  let clock = 1_000_000;
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const fetch: FetchLike = async (url, init) => {
    const u = new URL(url);
    calls.push({ url: u, at: clock, headers: init.headers });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request ${url}`);
    const r = next(u);
    const headers = new Map(Object.entries(r.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const res: FetchResponse = { status: r.status ?? 200, headers: { get: (n) => headers.get(n.toLowerCase()) ?? null }, text: async () => JSON.stringify(r.body ?? {}) };
    return res;
  };
  return {
    calls,
    sleeps,
    fetch,
    now: () => clock,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      clock += ms;
    },
  };
}

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'jjk-mw-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('MediaWikiClient requests', () => {
  it('sends the descriptive User-Agent, formatversion=2 and json format; maxlag only when configured', async () => {
    const h = harness([() => ({ body: { query: {} } }), () => ({ body: { query: {} } })]);
    await new MediaWikiClient({ endpoint: ENDPOINT, fetch: h.fetch, sleep: h.sleep, now: h.now, cacheDir: null }).get({ action: 'query', meta: 'siteinfo' });
    await new MediaWikiClient({ endpoint: 'https://en.wikipedia.org/w/api.php', maxlag: 5, fetch: h.fetch, sleep: h.sleep, now: h.now, cacheDir: null }).get({ action: 'query' });
    const [fandom, wp] = h.calls;
    expect(fandom.headers['User-Agent']).toBe(USER_AGENT);
    expect(USER_AGENT).toBe('JJKNextGenWiki/0.1 (+https://github.com/KumbiraiShonhiwa/jjk-nextgen-wiki)');
    expect(fandom.url.searchParams.get('formatversion')).toBe('2');
    expect(fandom.url.searchParams.get('format')).toBe('json');
    expect(fandom.url.searchParams.has('maxlag')).toBe(false);
    expect(wp.url.searchParams.get('maxlag')).toBe('5');
  });

  it('keeps serial requests at least 500 ms apart', async () => {
    const h = harness(Array.from({ length: 3 }, () => () => ({ body: { query: {} } })));
    const c = new MediaWikiClient({ endpoint: ENDPOINT, fetch: h.fetch, sleep: h.sleep, now: h.now, cacheDir: null });
    for (let i = 0; i < 3; i++) await c.get({ action: 'query', titles: `T${i}` });
    const gaps = h.calls.slice(1).map((c2, i) => c2.at - h.calls[i].at);
    expect(gaps.every((g) => g >= 500)).toBe(true);
  });

  it('honours Retry-After (seconds) on 429 and 503', async () => {
    const h = harness([
      () => ({ status: 429, headers: { 'Retry-After': '7' } }),
      () => ({ status: 503, headers: { 'Retry-After': '2' } }),
      () => ({ body: { query: { ok: true } } }),
    ]);
    const c = new MediaWikiClient({ endpoint: ENDPOINT, fetch: h.fetch, sleep: h.sleep, now: h.now, cacheDir: null });
    const res = await c.get({ action: 'query' });
    expect(res.data.query.ok).toBe(true);
    expect(h.sleeps).toContain(7000);
    expect(h.sleeps).toContain(2000);
    expect(h.calls).toHaveLength(3);
  });

  it('backs off exponentially without Retry-After, and gives up after maxRetries', async () => {
    const h = harness(Array.from({ length: 4 }, () => () => ({ status: 503 })));
    const c = new MediaWikiClient({ endpoint: ENDPOINT, fetch: h.fetch, sleep: h.sleep, now: h.now, cacheDir: null, maxRetries: 3, baseBackoffMs: 1000, minIntervalMs: 0 });
    await expect(c.get({ action: 'query' })).rejects.toThrow(MediaWikiError);
    expect(h.sleeps).toEqual([1000, 2000, 4000]);
    expect(h.calls).toHaveLength(4);
  });

  it('retries the maxlag API error (HTTP 200) using Retry-After', async () => {
    const h = harness([
      () => ({ body: { error: { code: 'maxlag', info: 'Waiting for db: 6 seconds lagged' } }, headers: { 'Retry-After': '5' } }),
      () => ({ body: { query: { pages: [] } } }),
    ]);
    const c = new MediaWikiClient({ endpoint: ENDPOINT, maxlag: 5, fetch: h.fetch, sleep: h.sleep, now: h.now, cacheDir: null, minIntervalMs: 0 });
    await c.get({ action: 'query' });
    expect(h.sleeps).toEqual([5000]);
  });

  it('throws other API errors without retrying', async () => {
    const h = harness([() => ({ body: { error: { code: 'badvalue', info: 'nope' } } })]);
    const c = new MediaWikiClient({ endpoint: ENDPOINT, fetch: h.fetch, sleep: h.sleep, now: h.now, cacheDir: null });
    await expect(c.get({ action: 'query' })).rejects.toThrow(/badvalue/);
  });

  it('parses Retry-After as seconds or an HTTP date', () => {
    expect(parseRetryAfter('3', 0)).toBe(3000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(parseRetryAfter(null, 0)).toBeUndefined();
    expect(parseRetryAfter('soon', 0)).toBeUndefined();
  });
});

describe('continuation and batching', () => {
  it('follows categorymembers continuation until exhausted', async () => {
    const h = harness([
      () => ({ body: { continue: { cmcontinue: 'page|B|2', continue: '-||' }, query: { categorymembers: [{ pageid: 1, ns: 0, title: 'A' }] } } }),
      (u) => {
        expect(u.searchParams.get('cmcontinue')).toBe('page|B|2');
        expect(u.searchParams.get('continue')).toBe('-||');
        return { body: { continue: { cmcontinue: 'page|C|3', continue: '-||' }, query: { categorymembers: [{ pageid: 2, ns: 0, title: 'B' }] } } };
      },
      () => ({ body: { batchcomplete: true, query: { categorymembers: [{ pageid: 3, ns: 0, title: 'C' }] } } }),
    ]);
    const c = new MediaWikiClient({ endpoint: ENDPOINT, fetch: h.fetch, sleep: h.sleep, now: h.now, cacheDir: null });
    const members = await c.categoryMembers('Characters');
    expect(members.map((m) => m.title)).toEqual(['A', 'B', 'C']);
    expect(h.calls[0].url.searchParams.get('cmtitle')).toBe('Category:Characters');
    expect(h.calls[0].url.searchParams.get('cmlimit')).toBe('500');
  });

  it('follows allpages continuation', async () => {
    const h = harness([
      () => ({ body: { continue: { apcontinue: 'M', continue: '-||' }, query: { allpages: [{ pageid: 1, ns: 0, title: 'A' }] } } }),
      () => ({ body: { query: { allpages: [{ pageid: 2, ns: 0, title: 'M' }] } } }),
    ]);
    const c = new MediaWikiClient({ endpoint: ENDPOINT, fetch: h.fetch, sleep: h.sleep, now: h.now, cacheDir: null });
    expect((await c.allPages()).map((p) => p.title)).toEqual(['A', 'M']);
    expect(h.calls[1].url.searchParams.get('apcontinue')).toBe('M');
  });

  it('batches titles 50 at a time and maps normalization and redirects back', async () => {
    const titles = Array.from({ length: 120 }, (_, i) => `Page ${i}`);
    titles[0] = 'ryomen_Sukuna';
    const respond = (u: URL) => {
      const asked = u.searchParams.get('titles')!.split('|');
      const pages = asked.filter((t) => t !== 'ryomen_Sukuna').map((t, i) => ({ pageid: i + 1, ns: 0, title: t, lastrevid: 100 + i }));
      const extra = asked.includes('ryomen_Sukuna')
        ? { normalized: [{ from: 'ryomen_Sukuna', to: 'Ryomen Sukuna' }], redirects: [{ from: 'Ryomen Sukuna', to: 'Sukuna' }] }
        : {};
      if (asked.includes('ryomen_Sukuna')) pages.push({ pageid: 999, ns: 0, title: 'Sukuna', lastrevid: 5 });
      return { body: { query: { ...extra, pages } } };
    };
    const h = harness([respond, respond, respond]);
    const c = new MediaWikiClient({ endpoint: ENDPOINT, fetch: h.fetch, sleep: h.sleep, now: h.now, cacheDir: null });
    const info = await c.pageInfo(titles);
    expect(h.calls.map((x) => x.url.searchParams.get('titles')!.split('|').length)).toEqual([50, 50, 20]);
    expect(h.calls[0].url.searchParams.get('redirects')).toBe('1');
    expect(info[0]).toMatchObject({ requested: 'ryomen_Sukuna', title: 'Sukuna', lastrevid: 5, redirect: true, missing: false });
    expect(info).toHaveLength(120);
  });

  it('chunk splits into 50s by default', () => {
    expect(chunk(Array.from({ length: 101 }, (_, i) => i)).map((c) => c.length)).toEqual([50, 50, 1]);
  });
});

describe('disk cache and offline mode', () => {
  const revBody = { query: { pages: [{ pageid: 1, ns: 0, title: 'A', revisions: [{ revid: 7, timestamp: '2026-01-01T00:00:00Z', slots: { main: { content: 'x' } } }] }] } };

  it('caches every response under <cacheDir>/<host>/ and serves immutable (revid) requests from it', async () => {
    const cacheDir = tmp();
    const h = harness([() => ({ body: revBody })]);
    const c = new MediaWikiClient({ endpoint: ENDPOINT, fetch: h.fetch, sleep: h.sleep, now: h.now, cacheDir });
    const first = await c.revisions([7]);
    const second = await c.revisions([7]);
    expect(first[0].content).toBe('x');
    expect(second).toEqual(first);
    expect(h.calls).toHaveLength(1);
    expect(c.cacheHits).toBe(1);
    expect(readdirSync(join(cacheDir, 'jujutsu-kaisen.fandom.com'))).toHaveLength(1);
  });

  it('refetches "fresh" requests online but replays them offline', async () => {
    const cacheDir = tmp();
    const h = harness([() => ({ body: { query: { n: 1 } } }), () => ({ body: { query: { n: 2 } } })]);
    const online = new MediaWikiClient({ endpoint: ENDPOINT, fetch: h.fetch, sleep: h.sleep, now: h.now, cacheDir });
    await online.get({ action: 'query', list: 'x' });
    expect((await online.get({ action: 'query', list: 'x' })).data.query.n).toBe(2);
    const offline = new MediaWikiClient({ endpoint: ENDPOINT, fetch: () => Promise.reject(new Error('network used')), cacheDir, offline: true });
    const res = await offline.get({ action: 'query', list: 'x' });
    expect(res.data.query.n).toBe(2);
    expect(res.fromCache).toBe(true);
  });

  it('errors on an offline cache miss without touching the network', async () => {
    let used = false;
    const c = new MediaWikiClient({ endpoint: ENDPOINT, fetch: async () => { used = true; throw new Error('x'); }, cacheDir: tmp(), offline: true });
    await expect(c.get({ action: 'query', list: 'nothing' })).rejects.toThrow(OfflineMissError);
    expect(used).toBe(false);
  });

  it('falls back to recorded fixtures offline, including continuation and revid lookups', async () => {
    const c = new MediaWikiClient({ endpoint: ENDPOINT, cacheDir: tmp(), offline: true, fixtures: new FixtureStore(API_FIXTURES), fetch: () => Promise.reject(new Error('network')) });
    const members = await c.categoryMembers('Category:Characters');
    expect(members.map((m) => m.title)).toContain('Toji Fushiguro');
    expect(members).toHaveLength(7);
    const info = await c.pageInfo(['Ryomen Sukuna', 'Nobody Here']);
    expect(info[0]).toMatchObject({ title: 'Sukuna', redirect: true, lastrevid: 412400 });
    expect(info[1].missing).toBe(true);
    const revs = await c.revisions([412400]);
    expect(revs[0].title).toBe('Sukuna');
    const site = await c.siteInfo();
    expect(pageUrl(site, 'Satoru Gojo')).toBe('https://jujutsu-kaisen.fandom.com/wiki/Satoru_Gojo');
  });
});
