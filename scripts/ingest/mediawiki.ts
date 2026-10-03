/**
 * A polite MediaWiki Action API client (doc 03 § Politeness):
 * one request at a time, ≥ minIntervalMs apart, descriptive User-Agent, maxlag on
 * Wikipedia, exponential backoff honouring Retry-After, formatversion=2, 50-title
 * batches, continuation, and a disk cache under .cache/raw/ keyed by request.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const USER_AGENT = 'JJKNextGenWiki/0.1 (+https://github.com/KumbiraiShonhiwa/jjk-nextgen-wiki)';
export const BATCH_SIZE = 50;

export type Params = Record<string, string | number | undefined>;

export interface FetchResponse {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}
export type FetchLike = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<FetchResponse>;

/** What the cache stores per request; fixture files use the same shape. */
export interface CacheEntry {
  url: string;
  params: Record<string, string>;
  fetchedAt: string;
  response: ApiResponse;
}

// The API's JSON is loosely typed; callers narrow what they read.
export type ApiResponse = Record<string, any>;

/** Consulted on a cache miss in offline mode (see fixtures.ts). */
export interface ResponseSource {
  lookup(endpoint: string, params: Record<string, string>): ApiResponse | undefined;
}

export interface ClientOptions {
  endpoint: string;
  /** Set to 5 for Wikimedia wikis. */
  maxlag?: number;
  fetch?: FetchLike;
  /** Defaults to `.cache/raw`. `null` disables the cache. */
  cacheDir?: string | null;
  offline?: boolean;
  fixtures?: ResponseSource;
  minIntervalMs?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  userAgent?: string;
  log?: (msg: string) => void;
}

export class MediaWikiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'MediaWikiError';
  }
}

export class OfflineMissError extends Error {
  constructor(url: string) {
    super(`--offline: no cached or fixture response for ${url}`);
    this.name = 'OfflineMissError';
  }
}

/** Cache policy per request: `immutable` responses (by revid) are served from cache even online. */
export type CacheMode = 'fresh' | 'immutable';

export interface Result {
  data: ApiResponse;
  fetchedAt: string;
  fromCache: boolean;
}

export interface PageInfo {
  /** The title we asked for. */
  requested: string;
  /** Canonical title after normalization and redirects. */
  title: string;
  pageid?: number;
  ns?: number;
  lastrevid?: number;
  missing: boolean;
  redirect: boolean;
}

export interface PageRevision {
  pageid: number;
  ns: number;
  title: string;
  revid: number;
  timestamp: string;
  content: string;
  fetchedAt: string;
}

export interface SiteInfo {
  server: string;
  articlepath: string;
  sitename: string;
  rights: { url: string; text: string };
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Canonical params: stringified, undefined dropped, keys sorted. */
export function canonicalParams(params: Params): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(params).sort()) {
    const v = params[k];
    if (v !== undefined) out[k] = String(v);
  }
  return out;
}

export function buildUrl(endpoint: string, params: Record<string, string>): string {
  const u = new URL(endpoint);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

export const cacheKey = (url: string) => createHash('sha256').update(url).digest('hex').slice(0, 32);

/** Seconds or HTTP-date → milliseconds; undefined if absent or unparseable. */
export function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  const s = Number(value.trim());
  if (Number.isFinite(s)) return Math.max(0, s * 1000);
  const d = Date.parse(value);
  return Number.isNaN(d) ? undefined : Math.max(0, d - now);
}

export function chunk<T>(items: T[], size = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export class MediaWikiClient {
  readonly endpoint: string;
  readonly host: string;
  private opts: ClientOptions;
  private fetchImpl: FetchLike;
  private sleep: (ms: number) => Promise<void>;
  private now: () => number;
  private lastRequestAt = Number.NEGATIVE_INFINITY;
  /** Network requests actually sent (including retries). */
  requests = 0;
  cacheHits = 0;

  constructor(opts: ClientOptions) {
    this.opts = opts;
    this.endpoint = opts.endpoint;
    this.host = new URL(opts.endpoint).host;
    this.fetchImpl = opts.fetch ?? ((url, init) => fetch(url, init));
    this.sleep = opts.sleep ?? realSleep;
    this.now = opts.now ?? Date.now;
  }

  private cachePath(url: string): string | undefined {
    const dir = this.opts.cacheDir === undefined ? '.cache/raw' : this.opts.cacheDir;
    return dir === null ? undefined : join(dir, this.host, `${cacheKey(url)}.json`);
  }

  private async readCache(url: string): Promise<CacheEntry | undefined> {
    const path = this.cachePath(url);
    if (!path) return undefined;
    try {
      return JSON.parse(await readFile(path, 'utf8')) as CacheEntry;
    } catch {
      return undefined;
    }
  }

  private async writeCache(entry: CacheEntry): Promise<void> {
    const path = this.cachePath(entry.url);
    if (!path) return;
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, `${JSON.stringify(entry)}\n`);
  }

  /** One API GET. Adds format/formatversion (and maxlag when configured). */
  async get(input: Params, mode: CacheMode = 'fresh'): Promise<Result> {
    const params = canonicalParams({ ...input, format: 'json', formatversion: 2, maxlag: this.opts.maxlag });
    const url = buildUrl(this.endpoint, params);

    if (this.opts.offline || mode === 'immutable') {
      const hit = await this.readCache(url);
      if (hit) {
        this.cacheHits++;
        return { data: hit.response, fetchedAt: hit.fetchedAt, fromCache: true };
      }
    }
    if (this.opts.offline) {
      const fixture = this.opts.fixtures?.lookup(this.endpoint, params);
      if (fixture) return { data: fixture, fetchedAt: new Date(this.now()).toISOString(), fromCache: true };
      throw new OfflineMissError(url);
    }

    const data = await this.send(url);
    const fetchedAt = new Date(this.now()).toISOString();
    await this.writeCache({ url, params, fetchedAt, response: data });
    return { data, fetchedAt, fromCache: false };
  }

  private async throttle(): Promise<void> {
    const min = this.opts.minIntervalMs ?? 500;
    const wait = this.lastRequestAt + min - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastRequestAt = this.now();
  }

  private backoff(attempt: number, retryAfter: number | undefined): number {
    const base = this.opts.baseBackoffMs ?? 1000;
    const max = this.opts.maxBackoffMs ?? 60_000;
    const exp = Math.min(max, base * 2 ** attempt);
    return retryAfter === undefined ? exp : Math.min(max, Math.max(retryAfter, 0));
  }

  private async send(url: string): Promise<ApiResponse> {
    const maxRetries = this.opts.maxRetries ?? 5;
    const log = this.opts.log ?? (() => {});
    for (let attempt = 0; ; attempt++) {
      await this.throttle();
      this.requests++;
      const res = await this.fetchImpl(url, {
        headers: { 'User-Agent': this.opts.userAgent ?? USER_AGENT, 'Api-User-Agent': this.opts.userAgent ?? USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 30_000),
      });
      const retryAfter = parseRetryAfter(res.headers.get('retry-after'), this.now());
      if (res.status === 429 || res.status === 503) {
        if (attempt >= maxRetries) throw new MediaWikiError(`http-${res.status}`, `HTTP ${res.status} after ${attempt + 1} attempts: ${url}`);
        const wait = this.backoff(attempt, retryAfter);
        log(`HTTP ${res.status}; retrying in ${wait} ms`);
        await this.sleep(wait);
        continue;
      }
      if (res.status < 200 || res.status >= 300) throw new MediaWikiError(`http-${res.status}`, `HTTP ${res.status}: ${url}`);
      const body = await res.text();
      let data: ApiResponse;
      try {
        data = JSON.parse(body) as ApiResponse;
      } catch {
        throw new MediaWikiError('bad-json', `Non-JSON response from ${url}: ${body.slice(0, 120)}`);
      }
      if (data.error) {
        const code = String(data.error.code ?? 'unknown');
        if (code === 'maxlag' || code === 'ratelimited') {
          if (attempt >= maxRetries) throw new MediaWikiError(code, `${code} after ${attempt + 1} attempts: ${url}`);
          const wait = this.backoff(attempt, retryAfter ?? (code === 'maxlag' ? 5000 : undefined));
          log(`API ${code}; retrying in ${wait} ms`);
          await this.sleep(wait);
          continue;
        }
        throw new MediaWikiError(code, `API error ${code}: ${data.error.info ?? ''} (${url})`);
      }
      if (data.warnings) log(`API warnings: ${JSON.stringify(data.warnings)}`);
      return data;
    }
  }

  /** Follows `continue` until exhausted, yielding each page of results. */
  async *paginate(params: Params, mode: CacheMode = 'fresh'): AsyncGenerator<Result> {
    let cont: Record<string, string> = {};
    for (let guard = 0; guard < 10_000; guard++) {
      const res = await this.get({ ...params, ...cont }, mode);
      yield res;
      const next = res.data.continue as Record<string, string> | undefined;
      if (!next) return;
      cont = next;
    }
    throw new Error('Continuation did not terminate');
  }

  async categoryMembers(category: string, namespace = 0): Promise<{ pageid: number; ns: number; title: string }[]> {
    const out: { pageid: number; ns: number; title: string }[] = [];
    const cmtitle = category.startsWith('Category:') ? category : `Category:${category}`;
    for await (const res of this.paginate({ action: 'query', list: 'categorymembers', cmtitle, cmnamespace: namespace, cmtype: 'page', cmlimit: 500 })) {
      out.push(...((res.data.query?.categorymembers ?? []) as { pageid: number; ns: number; title: string }[]));
    }
    return out;
  }

  async allPages(namespace = 0): Promise<{ pageid: number; ns: number; title: string }[]> {
    const out: { pageid: number; ns: number; title: string }[] = [];
    for await (const res of this.paginate({ action: 'query', list: 'allpages', apnamespace: namespace, apfilterredir: 'nonredirects', aplimit: 500 })) {
      out.push(...((res.data.query?.allpages ?? []) as { pageid: number; ns: number; title: string }[]));
    }
    return out;
  }

  /** Current revision ids for titles (batched), following normalization and redirects. */
  async pageInfo(titles: string[]): Promise<PageInfo[]> {
    const out: PageInfo[] = [];
    for (const batch of chunk([...new Set(titles)])) {
      const { data } = await this.get({ action: 'query', prop: 'info', titles: batch.join('|'), redirects: 1 });
      const q = data.query ?? {};
      const norm = new Map<string, string>(((q.normalized ?? []) as { from: string; to: string }[]).map((n) => [n.from, n.to]));
      const redir = new Map<string, string>(((q.redirects ?? []) as { from: string; to: string }[]).map((r) => [r.from, r.to]));
      const pages = new Map<string, ApiResponse>(((q.pages ?? []) as ApiResponse[]).map((p) => [p.title as string, p]));
      for (const requested of batch) {
        const n = norm.get(requested) ?? requested;
        const title = redir.get(n) ?? n;
        const p = pages.get(title);
        out.push({
          requested,
          title,
          pageid: p?.pageid,
          ns: p?.ns,
          lastrevid: p?.lastrevid,
          missing: !p || p.missing === true || p.invalid === true,
          redirect: redir.has(n),
        });
      }
    }
    return out;
  }

  /** Wikitext for exact revisions (batched). Revisions are immutable, so the cache answers repeats. */
  async revisions(revids: number[]): Promise<PageRevision[]> {
    const out: PageRevision[] = [];
    for (const batch of chunk([...new Set(revids)].sort((a, b) => a - b))) {
      const { data, fetchedAt } = await this.get(
        { action: 'query', prop: 'revisions', rvprop: 'content|ids|timestamp', rvslots: 'main', revids: batch.join('|') },
        'immutable',
      );
      for (const p of (data.query?.pages ?? []) as ApiResponse[]) {
        for (const r of (p.revisions ?? []) as ApiResponse[]) {
          const content = r.slots?.main?.content;
          if (typeof content !== 'string') continue;
          out.push({ pageid: p.pageid, ns: p.ns, title: p.title, revid: r.revid, timestamp: r.timestamp, content, fetchedAt });
        }
      }
    }
    return out;
  }

  async siteInfo(): Promise<SiteInfo> {
    const { data } = await this.get({ action: 'query', meta: 'siteinfo', siprop: 'general|rightsinfo' });
    const g = data.query?.general ?? {};
    const r = data.query?.rightsinfo ?? {};
    return {
      server: String(g.server ?? new URL(this.endpoint).origin).replace(/^\/\//, 'https://'),
      articlepath: String(g.articlepath ?? '/wiki/$1'),
      sitename: String(g.sitename ?? this.host),
      rights: { url: String(r.url ?? ''), text: String(r.text ?? '') },
    };
  }
}

/** Public page URL for a title, from siteinfo's server + articlepath. */
export function pageUrl(site: Pick<SiteInfo, 'server' | 'articlepath'>, title: string): string {
  const path = encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':');
  return site.server + site.articlepath.replace('$1', path);
}
