// @vitest-environment node
/**
 * End-to-end offline run: the recorded Fandom fixtures are ingested into a temp copy of
 * content/, and the result must validate exactly as the site's own content tests demand.
 */
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { arc, character, domain, edge, location, organization, technique, type SpoilerLevel } from '../../src/content/schemas';
import { buildIndex, findDanglingRefs, type Dataset } from '../../src/lib/graph';
import type { FetchLike } from '../../scripts/ingest/mediawiki.ts';
import { counts } from '../../scripts/ingest/report.ts';
import { runIngest, type RunOptions, type RunResult } from '../../scripts/ingest/run.ts';
import { API_FIXTURES, BASE_CONTENT } from './helpers.ts';

const schemas = { characters: character, techniques: technique, domains: domain, arcs: arc, organizations: organization, locations: location };
type Type = keyof typeof schemas;
const LEVELS = ['none', 'anime-s1', 'anime-s2', 'anime-s3', 'manga'];

const noNetwork: FetchLike = () => Promise.reject(new Error('network access in an offline test'));
const read = (dir: string, ...p: string[]) => JSON.parse(readFileSync(join(dir, ...p), 'utf8'));
const snapshot = (dir: string) =>
  Object.fromEntries(
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => {
        const p = join(d.parentPath, d.name);
        return [p.slice(dir.length), readFileSync(p, 'utf8')];
      }),
  );

function loadDataset(dir: string): Dataset {
  const data = {} as Record<string, unknown[]>;
  for (const t of Object.keys(schemas) as Type[]) {
    data[t] = readdirSync(join(dir, t)).map((f) => {
      const rec = schemas[t].parse(read(dir, t, f));
      expect(`${rec.slug}.json`, `${t}/${f}`).toBe(f);
      return rec;
    });
  }
  data.edges = (read(dir, 'edges.json') as unknown[]).map((e) => edge.parse(e));
  return data as unknown as Dataset;
}

describe('offline ingest into a temp content dir', () => {
  let root: string;
  let content: string;
  let result: RunResult;
  let opts: RunOptions;
  const handEdge = { id: 'gojo-satoru--ally--nanami-kento', from: 'gojo-satoru', to: 'nanami-kento', kind: 'ally', label: 'colleague', level: 'none' };

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'jjk-ingest-'));
    content = join(root, 'content');
    cpSync(BASE_CONTENT, content, { recursive: true });
    // A hand-written edge and spoiler overrides, as a curator would add them.
    const edges = read(content, 'edges.json');
    writeFileSync(join(content, 'edges.json'), `${JSON.stringify([...edges, handEdge], null, 2)}\n`);
    writeFileSync(
      join(content, 'meta', 'spoiler-overrides.json'),
      `${JSON.stringify({ 'characters/itadori-yuji': { 'species.1': 'none' }, 'characters/panda': { level: 'anime-s1' } }, null, 2)}\n`,
    );
    opts = {
      contentDir: content,
      reportDir: join(root, 'reports'),
      cacheDir: join(root, 'cache'),
      offline: true,
      fixturesDir: API_FIXTURES,
      fetch: noNetwork,
      now: () => Date.parse('2026-10-05T03:00:00Z'),
      log: () => {},
    };
    result = await runIngest(opts);
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('finishes and reports the expected counts', () => {
    expect(result.report.fatal).toBeUndefined();
    expect(result.ok).toBe(true);
    const c = counts(result.report);
    expect(c.created).toBe(2);
    expect(c.updated).toBe(10); // 9 sourced + panda (override only)
    expect(c.failed).toBe(2);
    expect(result.report.edgesAdded).toEqual(['fushiguro-toji--family--fushiguro-megumi']);
    expect(result.report.records.filter((r) => r.status === 'failed').map((r) => r.title).sort()).toEqual(['Coffin of the Iron Mountain', 'Mystery Person']);
  });

  it('writes only valid records with no dangling references', () => {
    const ds = loadDataset(content);
    expect(findDanglingRefs(buildIndex(ds))).toEqual([]);
    for (const list of [ds.characters, ds.techniques, ds.domains, ds.arcs] as { slug: string; level: string; summary: { level: string }[] }[][]) {
      for (const r of list) for (const s of r.summary) expect(LEVELS.indexOf(s.level), r.slug).toBeGreaterThanOrEqual(LEVELS.indexOf(r.level));
    }
    expect(existsSync(join(content, 'domains', 'coffin-of-the-iron-mountain.json'))).toBe(false);
    expect(readdirSync(join(content, 'characters')).some((f) => f.includes('mystery'))).toBe(false);
  });

  it('writes 2-space JSON with a trailing newline', () => {
    const text = readFileSync(join(content, 'characters', 'fushiguro-toji.json'), 'utf8');
    expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
  });

  it('preserves hand-curated fields and replaces fixture text', () => {
    const gojo = read(content, 'characters', 'gojo-satoru.json');
    expect(gojo.accent).toBe('#7cc4ff');
    expect(gojo.affiliations).toEqual(['tokyo-jujutsu-high', 'gojo-clan']);
    expect(gojo.fixture).toBe(false);
    expect(gojo.summary[0].value).toMatch(/^Satoru Gojo is one of the main characters/);
    expect(gojo.provenance).toEqual([
      { source: 'fandom', title: 'Satoru Gojo', url: 'https://jujutsu-kaisen.fandom.com/wiki/Satoru_Gojo', revisionId: 412345, fetchedAt: '2026-10-05T03:00:00.000Z', licence: 'CC BY-SA 3.0' },
    ]);

    const uv = read(content, 'domains', 'unlimited-void.json');
    expect(uv.palette).toEqual(['#0b1030', '#7cc4ff']);
    expect(uv.level).toBe('anime-s1');
    expect(uv.summary.every((s: { level: SpoilerLevel }) => s.level !== 'none')).toBe(true);

    const shibuya = read(content, 'arcs', 'shibuya-incident.json');
    expect(shibuya).toMatchObject({ order: 6, level: 'anime-s2', name: 'Shibuya Incident', chapters: [79, 136], locations: ['shibuya'] });

    const org = read(content, 'organizations', 'tokyo-jujutsu-high.json');
    expect(org.name.en).toBe('Tokyo Jujutsu High');
    expect(org.provenance[0].title).toBe('Tokyo Prefectural Jujutsu High School');

    // Seeded through a redirect: "Ryomen Sukuna" → "Sukuna".
    expect(read(content, 'characters', 'ryomen-sukuna.json').provenance[0].title).toBe('Sukuna');

    // Untouched records stay byte-identical.
    expect(readFileSync(join(content, 'characters', 'inumaki-toge.json'), 'utf8')).toBe(readFileSync(join(BASE_CONTENT, 'characters', 'inumaki-toge.json'), 'utf8'));
  });

  it('keeps hand-written edges and appends sourced ones', () => {
    const edges = read(content, 'edges.json') as { id: string }[];
    const original = read(BASE_CONTENT, 'edges.json') as unknown[];
    expect(edges.slice(0, original.length)).toEqual(original);
    expect(edges.find((e) => e.id === handEdge.id)).toEqual(handEdge);
    expect(edges.at(-1)).toMatchObject({ id: 'fushiguro-toji--family--fushiguro-megumi', label: 'father', level: 'manga' });
  });

  it('applies spoiler overrides, including to records the source did not touch', () => {
    expect(read(content, 'characters', 'itadori-yuji.json').species).toEqual([{ value: 'human', level: 'none' }, { value: 'vessel', level: 'none' }]);
    const panda = read(content, 'characters', 'panda.json');
    expect(panda.level).toBe('anime-s1');
    expect(panda.summary.every((s: { level: string }) => s.level === 'anime-s1')).toBe(true);
  });

  it('records revisions for change detection and writes the report', () => {
    const sources = read(content, 'meta', 'sources.json');
    expect(sources.fandom['Satoru Gojo']).toBe(412345);
    expect(sources.fandom['List of Characters']).toBe(410001); // skipped pages too, so they are not refetched
    expect(sources.fandom['Mystery Person']).toBeUndefined(); // failures are retried next run
    expect(result.reportPath).toBe(join(root, 'reports', 'ingest-2026-10-05.md'));
    const md = readFileSync(result.reportPath!, 'utf8');
    expect(md).toContain('## Unmapped infobox parameters');
    expect(md).toMatch(/Character Infobox · occupation \| 2 \|/);
    // gender, birthday, height and manga debut are mapped as of A5, so they must not be listed here.
    for (const mapped of ['gender', 'birthday', 'height', 'manga debut']) {
      expect(md).not.toContain(`Character Infobox · ${mapped} |`);
    }
    expect(md).toContain('| characters/gojo-satoru | techniques | Six Eyes |');
    expect(md).toContain('Licence version not stated by siteinfo');
  });

  it('a second run changes nothing', async () => {
    const before = snapshot(content);
    const again = await runIngest(opts);
    expect(again.ok).toBe(true);
    expect(counts(again.report).created + counts(again.report).updated).toBe(0);
    expect(snapshot(content)).toEqual(before);
  });

  it('--force re-maps unchanged revisions without producing a diff', async () => {
    const before = snapshot(content);
    const again = await runIngest({ ...opts, force: true, now: () => Date.parse('2026-10-12T03:00:00Z') });
    expect(counts(again.report).updated).toBe(0);
    expect(snapshot(content)).toEqual(before);
  });
});

describe('run options', () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'jjk-ingest-opts-'));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const base = (name: string): RunOptions => {
    const content = join(root, name, 'content');
    cpSync(BASE_CONTENT, content, { recursive: true });
    return { contentDir: content, reportDir: join(root, name, 'reports'), cacheDir: join(root, name, 'cache'), offline: true, fixturesDir: API_FIXTURES, fetch: noNetwork, log: () => {} };
  };

  it('--dry-run writes nothing to content/', async () => {
    const opts = { ...base('dry'), dryRun: true };
    const before = snapshot(opts.contentDir!);
    const r = await runIngest(opts);
    expect(r.ok).toBe(true);
    expect(counts(r.report).created).toBe(2);
    expect(snapshot(opts.contentDir!)).toEqual(before);
    expect(existsSync(r.reportPath!)).toBe(true);
  });

  it('--only and --limit restrict the pages processed', async () => {
    const r = await runIngest({ ...base('only'), only: ['techniques'], limit: 1 });
    const touched = r.report.records.filter((l) => l.revision);
    expect(touched).toHaveLength(1);
    expect(touched[0].type).toBe('techniques');
  });

  it('--offline without a cache or fixtures fails cleanly and writes nothing', async () => {
    const opts = { ...base('miss'), fixturesDir: undefined };
    const before = snapshot(opts.contentDir!);
    const r = await runIngest(opts);
    expect(r.ok).toBe(false);
    expect(r.report.fatal).toMatch(/OfflineMissError/);
    expect(snapshot(opts.contentDir!)).toEqual(before);
  });
});
