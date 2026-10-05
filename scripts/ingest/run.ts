/**
 * The ingest pipeline (docs/03 § Pipeline): discover → diff → fetch → parse → map →
 * merge → validate → write → report. `runIngest` is what the CLI and the e2e test call.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { z } from 'astro/zod';
import { arc, character, domain, edge, location, organization, technique, type SpoilerLevel } from '../../src/content/schemas/index.ts';
import { buildIndex, findDanglingRefs, type Dataset } from '../../src/lib/graph.ts';
import { CATEGORIES, FANDOM, TYPE_PRIORITY, type WikiConfig } from './config.ts';
import { FixtureStore } from './fixtures.ts';
import { isSkip, MAPPERS, type Draft } from './map/index.ts';
import { MediaWikiClient, type FetchLike, type PageInfo } from './mediawiki.ts';
import { licenceFromRights, mergeEdges, mergeRecord, provenanceFor, type EdgeRecord, type Provenance } from './merge.ts';
import { newReport, renderReport, type RecordLine, type Report } from './report.ts';
import { ENTITY_TYPES, NameIndex, type EntityType } from './slugs.ts';
import { applyOverrides, arcAliasTable, clampToRecordLevel, SpoilerPolicy, spoilerOverrides, type SpoilerOverrides } from './spoilers.ts';
import { spoilerBoundaries, type SpoilerBoundaries } from '../../src/content/schemas/boundaries.ts';

export const SCHEMAS: Record<EntityType, z.ZodType> = {
  characters: character,
  techniques: technique,
  domains: domain,
  arcs: arc,
  organizations: organization,
  locations: location,
};

const HERE = import.meta.dirname;

export interface RunOptions {
  contentDir?: string;
  reportDir?: string;
  /** `null` disables the disk cache. */
  cacheDir?: string | null;
  offline?: boolean;
  fixturesDir?: string;
  only?: EntityType[];
  limit?: number;
  dryRun?: boolean;
  /** Re-map pages even when their revision matches content/meta/sources.json. */
  force?: boolean;
  fetch?: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  minIntervalMs?: number;
  wiki?: WikiConfig;
  categories?: Partial<Record<EntityType, string[]>>;
  arcAliasesPath?: string;
  titleAliasesPath?: string;
  log?: (msg: string) => void;
}

export interface RunResult {
  report: Report;
  reportPath?: string;
  markdown: string;
  ok: boolean;
}

type Json = Record<string, unknown>;
type Sources = Record<string, Record<string, number>>;

interface Existing {
  records: Record<EntityType, Map<string, { file: string; text: string; data: Json }>>;
  edges: EdgeRecord[];
  edgesText: string;
}

export const toJson = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

async function readJson<T>(path: string, fallback: T): Promise<T> {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function loadExisting(contentDir: string): Promise<Existing> {
  const records = Object.fromEntries(ENTITY_TYPES.map((t) => [t, new Map()])) as Existing['records'];
  for (const type of ENTITY_TYPES) {
    const dir = join(contentDir, type);
    if (!existsSync(dir)) continue;
    for (const file of (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()) {
      const text = await readFile(join(dir, file), 'utf8');
      const data = JSON.parse(text) as Json;
      records[type].set(String(data.slug ?? file.replace(/\.json$/, '')), { file, text, data });
    }
  }
  const edgesPath = join(contentDir, 'edges.json');
  const edgesText = existsSync(edgesPath) ? await readFile(edgesPath, 'utf8') : '[]\n';
  return { records, edges: JSON.parse(edgesText) as EdgeRecord[], edgesText };
}

const today = (now: number) => new Date(now).toISOString().slice(0, 10);

export async function runIngest(opts: RunOptions = {}): Promise<RunResult> {
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((m: string) => console.error(m));
  const contentDir = opts.contentDir ?? 'content';
  const reportDir = opts.reportDir ?? 'reports';
  const wiki = opts.wiki ?? FANDOM;
  const only = opts.only?.length ? opts.only : [...ENTITY_TYPES];
  const mode = [
    opts.offline ? 'offline' : 'online',
    ...(opts.fixturesDir ? [`fixtures=${opts.fixturesDir}`] : []),
    ...(opts.only?.length ? [`only=${only.join(',')}`] : []),
    ...(opts.limit ? [`limit=${opts.limit}`] : []),
    ...(opts.dryRun ? ['dry-run'] : []),
    ...(opts.force ? ['force'] : []),
  ];
  const report = newReport(new Date(now()).toISOString(), mode);

  const client = new MediaWikiClient({
    endpoint: wiki.endpoint,
    maxlag: wiki.maxlag,
    fetch: opts.fetch,
    cacheDir: opts.cacheDir,
    offline: opts.offline,
    fixtures: opts.fixturesDir ? new FixtureStore(opts.fixturesDir) : undefined,
    sleep: opts.sleep,
    now,
    minIntervalMs: opts.minIntervalMs,
    log,
  });

  const finish = async (ok: boolean): Promise<RunResult> => {
    report.finishedAt = ok ? new Date(now()).toISOString() : undefined;
    report.requests = client.requests;
    report.cacheHits = client.cacheHits;
    const markdown = renderReport(report);
    await mkdir(reportDir, { recursive: true });
    const reportPath = join(reportDir, `ingest-${today(now())}.md`);
    await writeFile(reportPath, markdown);
    return { report, reportPath, markdown, ok };
  };

  try {
    await pipeline(opts, { contentDir, wiki, only, client, report, log, now });
    return await finish(true);
  } catch (err) {
    report.fatal = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return await finish(false);
  }
}

interface Ctx {
  contentDir: string;
  wiki: WikiConfig;
  only: EntityType[];
  client: MediaWikiClient;
  report: Report;
  log: (msg: string) => void;
  now: () => number;
}

interface Candidate {
  type: EntityType;
  /** Slug of the existing record this title was seeded from. */
  slug?: string;
  seed: boolean;
}

async function pipeline(opts: RunOptions, { contentDir, wiki, only, client, report, log }: Ctx): Promise<void> {
  const metaDir = join(contentDir, 'meta');
  const existing = await loadExisting(contentDir);
  const sources = await readJson<Sources>(join(metaDir, 'sources.json'), {});
  const overrides: SpoilerOverrides = spoilerOverrides.parse(await readJson(join(metaDir, 'spoiler-overrides.json'), {}));
  const aliases = arcAliasTable.parse(await readJson(opts.arcAliasesPath ?? join(HERE, 'arc-aliases.json'), { arcs: {} }));
  // Optional: without the table the policy just keeps its arc-heading rules and the manga default.
  const boundariesRaw = await readJson<unknown>(join(metaDir, 'spoiler-boundaries.json'), null as unknown);
  const boundaries: SpoilerBoundaries | undefined = boundariesRaw ? spoilerBoundaries.parse(boundariesRaw) : undefined;
  const titleAliases = await readJson<Record<string, string[]>>(opts.titleAliasesPath ?? join(HERE, 'title-aliases.json'), {});

  const arcs = [...existing.records.arcs.values()].map((r) => ({ slug: String(r.data.slug), name: String(r.data.name), level: (r.data.level as SpoilerLevel) ?? 'none' }));
  const policy = new SpoilerPolicy(arcs, aliases, boundaries);

  // 1. Site info and licence.
  const site = await client.siteInfo();
  const { licence, inferred } = licenceFromRights(site.rights, wiki.source);
  report.licence = `${licence}${inferred ? ' (inferred: siteinfo gave no version)' : ''} · rightsinfo: ${site.rights.text || '(empty)'} ${site.rights.url}`.trim();
  if (inferred) report.warnings.push(`Licence version not stated by siteinfo (${site.rights.url || 'no url'}); recorded as ${licence}.`);

  // 2. Discover: seeds from existing content, then categories.
  const candidates = new Map<string, Candidate>();
  for (const type of only) {
    for (const [slug, r] of existing.records[type]) {
      const prov = ((r.data.provenance as Provenance[] | undefined) ?? []).filter((p) => p.source === wiki.source).map((p) => p.title);
      const name = r.data.name as { en?: string } | string | undefined;
      const en = typeof name === 'string' ? name : name?.en;
      const titles = [...prov, ...(titleAliases[`${type}/${slug}`] ?? []), ...(en ? [en] : []), ...(type === 'arcs' ? aliases.arcs[slug] ?? [] : [])];
      for (const t of titles) if (!candidates.has(t)) candidates.set(t, { type, slug, seed: true });
    }
  }
  const categories = { ...CATEGORIES, ...opts.categories };
  for (const type of TYPE_PRIORITY.filter((t) => only.includes(t))) {
    for (const cat of categories[type] ?? []) {
      const members = await client.categoryMembers(cat);
      if (!members.length) report.warnings.push(`${cat} returned no pages (missing or renamed category?).`);
      for (const m of members) if (m.ns === 0 && !candidates.has(m.title)) candidates.set(m.title, { type, seed: false });
    }
  }

  // 3. Diff: current revision ids, following redirects.
  const infos = await client.pageInfo([...candidates.keys()]);
  const pages = new Map<string, { info: PageInfo; cand: Candidate; requested: string[] }>();
  for (const info of infos) {
    const cand = candidates.get(info.requested)!;
    if (info.missing || !info.lastrevid) continue;
    if (info.ns !== undefined && info.ns !== 0) continue;
    const prev = pages.get(info.title);
    if (prev) {
      prev.requested.push(info.requested);
      // A seeded record outranks a category guess for the same page.
      if (cand.seed && !prev.cand.seed) prev.cand = cand;
      continue;
    }
    pages.set(info.title, { info, cand, requested: [info.requested] });
  }
  // Records whose seeds all came back missing.
  for (const type of only) {
    for (const slug of existing.records[type].keys()) {
      if (![...pages.values()].some((p) => p.cand.type === type && p.cand.slug === slug)) {
        report.records.push({ type, slug, status: 'skipped', reason: 'no source page found for any seed title (kept as is)' });
      }
    }
  }

  let selected = [...pages.values()];
  if (opts.limit) {
    selected = only.flatMap((t) => selected.filter((p) => p.cand.type === t).slice(0, opts.limit));
  }
  const changed = selected.filter((p) => opts.force || sources[wiki.source]?.[p.info.title] !== p.info.lastrevid);
  for (const p of selected) {
    if (!changed.includes(p)) report.records.push({ type: p.cand.type, slug: p.cand.slug, title: p.info.title, revision: p.info.lastrevid, status: 'unchanged', reason: 'revision unchanged since last sync' });
  }
  log(`${selected.length} pages selected, ${changed.length} changed`);

  // 4. Fetch wikitext for changed revisions.
  const revs = await client.revisions(changed.map((p) => p.info.lastrevid!));
  const byTitle = new Map(revs.map((r) => [r.title, r]));

  // 5. Map.
  const nextSources: Sources = structuredClone(sources);
  nextSources[wiki.source] ??= {};
  const index = new NameIndex();
  for (const type of ENTITY_TYPES) {
    for (const [slug, r] of existing.records[type]) {
      const name = r.data.name as { en?: string; romaji?: string } | string;
      // Entries written for this wiki (`source: 'original'`) have no page title.
      const prov = ((r.data.provenance as Provenance[] | undefined) ?? []).flatMap((p) => (p.title ? [p.title] : []));
      index.add(type, slug, [
        ...(typeof name === 'string' ? [name] : [name?.en, name?.romaji]),
        ...((r.data.aliases as string[] | undefined) ?? []),
        ...prov,
        ...(titleAliases[`${type}/${slug}`] ?? []),
      ]);
    }
  }

  const drafts: { draft: Draft; page: (typeof changed)[number]; revid: number; fetchedAt: string }[] = [];
  const usedSlugs = new Map<string, string>();
  for (const p of changed) {
    const rev = byTitle.get(p.info.title);
    const line: Omit<RecordLine, 'status'> = { type: p.cand.type, slug: p.cand.slug, title: p.info.title, revision: p.info.lastrevid };
    if (!rev) {
      report.records.push({ ...line, status: 'failed', reason: 'revision content not returned' });
      continue;
    }
    let result;
    try {
      result = MAPPERS[p.cand.type]({ title: rev.title, wikitext: rev.content, policy });
    } catch (err) {
      report.records.push({ ...line, status: 'failed', reason: `mapper error: ${(err as Error).message}` });
      continue;
    }
    if (isSkip(result)) {
      report.records.push({ ...line, status: 'skipped', reason: result.reason });
      nextSources[wiki.source][rev.title] = rev.revid;
      continue;
    }
    const draft = result;
    draft.slug = p.cand.slug ?? index.resolve(draft.type, rev.title) ?? draft.slug;
    if (!draft.slug) {
      report.records.push({ ...line, status: 'failed', reason: 'could not derive a slug from the title' });
      continue;
    }
    const key = `${draft.type}/${draft.slug}`;
    if (usedSlugs.has(key)) {
      // E.g. two arc-alias pages ("Introduction Arc", "Cursed Womb Arc") for one curated arc: the first wins.
      report.records.push({ ...line, slug: draft.slug, status: 'skipped', reason: `"${usedSlugs.get(key)}" already maps to this slug` });
      continue;
    }
    usedSlugs.set(key, rev.title);
    for (const k of draft.unmapped) {
      const id = `${draft.infobox ?? '(no infobox)'} · ${k}`;
      report.unmapped.set(id, [...(report.unmapped.get(id) ?? []), rev.title]);
    }
    const name = draft.fields.name as { en?: string; romaji?: string } | undefined;
    index.add(draft.type, draft.slug, [rev.title, ...p.requested, name?.en, name?.romaji, ...((draft.fields.aliases as string[] | undefined) ?? [])]);
    drafts.push({ draft, page: p, revid: rev.revid, fetchedAt: rev.fetchedAt });
  }

  // 6. Resolve references, merge, apply overrides, validate.
  const out = new Map<string, { type: EntityType; slug: string; data: Json; title: string; revid: number }>();
  const sourcedEdges: EdgeRecord[] = [];
  for (const { draft, revid, fetchedAt } of drafts) {
    const line: Omit<RecordLine, 'status'> = { type: draft.type, slug: draft.slug, title: draft.title, revision: revid };
    const sourced: Json = { ...draft.fields };
    let failed: string | undefined;
    for (const ref of draft.refs) {
      const resolved: string[] = [];
      for (const names of ref.items) {
        const slug = names.map((n) => index.resolve(ref.expected, n)).find(Boolean);
        if (slug) {
          if (!resolved.includes(slug)) resolved.push(slug);
        } else report.unresolved.push({ type: draft.type, slug: draft.slug, field: ref.field, name: names[names.length - 1] ?? names[0] });
      }
      if (ref.single) {
        if (resolved[0]) sourced[ref.field] = resolved[0];
        else if (ref.required && !existing.records[draft.type].get(draft.slug)?.data[ref.field]) failed = `required reference "${ref.field}" did not resolve`;
      } else if (resolved.length) sourced[ref.field] = resolved;
    }
    if (failed) {
      report.records.push({ ...line, status: 'failed', reason: failed });
      continue;
    }
    const prov = provenanceFor(site, wiki.source, licence, { title: draft.title, revid, fetchedAt });
    const prior = existing.records[draft.type].get(draft.slug)?.data;
    const merged = mergeRecord({ existing: prior, sourced, slug: draft.slug, level: draft.level, provenance: prov });
    if (draft.type === 'techniques' && !merged.kind) merged.kind = 'other';
    out.set(`${draft.type}/${draft.slug}`, { type: draft.type, slug: draft.slug, data: merged, title: draft.title, revid });
    for (const e of draft.edges) {
      const to = e.to.map((n) => index.resolve('characters', n)).find(Boolean);
      if (!to) {
        report.unresolved.push({ type: draft.type, slug: draft.slug, field: `edge:${e.kind}`, name: e.to[0] });
        continue;
      }
      // The label names the relative's role ("father"), and our labels describe `from`
      // (cf. "gojo-satoru--teacher-student--itadori-yuji", label "teacher"): the relative is `from`.
      sourcedEdges.push({ id: `${to}--${e.kind}--${draft.slug}`, from: to, to: draft.slug, kind: e.kind, ...(e.label ? { label: e.label } : {}), level: e.level, provenance: [prov] });
    }
  }

  // Overrides apply to every record, so editing the file takes effect without a refetch.
  for (const type of ENTITY_TYPES) {
    for (const [slug, r] of existing.records[type]) {
      if (overrides[`${type}/${slug}`] && !out.has(`${type}/${slug}`)) out.set(`${type}/${slug}`, { type, slug, data: structuredClone(r.data), title: '', revid: 0 });
    }
  }
  for (const [key, rec] of out) {
    const unused = applyOverrides(rec.data, overrides[key]);
    for (const u of unused) report.warnings.push(`Override ${key} → ${u} matched nothing.`);
    const clamped = clampToRecordLevel(rec.data);
    if (clamped.length && rec.revid) log(`${key}: raised ${clamped.length} value(s) to the record level`);
  }

  const failRecord = (key: string, reason: string) => {
    const rec = out.get(key)!;
    out.delete(key);
    report.records.push({ type: rec.type, slug: rec.slug, title: rec.title || undefined, revision: rec.revid || undefined, status: 'failed', reason });
  };
  const validate = () => {
    for (const [key, rec] of [...out]) {
      const res = SCHEMAS[rec.type].safeParse(rec.data);
      if (!res.success) failRecord(key, `schema: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    }
  };
  validate();

  // Edges: hand-written ones are kept; sourced ones appended, then overrides.
  let { edges, added } = mergeEdges(existing.edges, sourcedEdges);
  for (const e of edges) {
    const o = overrides[`edges/${e.id}`];
    if (o?.level) e.level = o.level;
  }

  // 7. Whole-dataset check: references must resolve. Prune refs that point at records that failed.
  for (let round = 0; round < 10; round++) {
    const dataset = buildDataset(existing, out, edges);
    const dangling = findDanglingRefs(buildIndex(dataset));
    if (!dangling.length) break;
    let pruned = false;
    for (const d of dangling) {
      const edgeHit = added.find((e) => e.id === d.from);
      if (edgeHit) {
        edges = edges.filter((e) => e !== edgeHit);
        added = added.filter((e) => e !== edgeHit);
        report.unresolved.push({ type: 'characters', slug: edgeHit.from, field: `edge:${edgeHit.kind}`, name: d.to });
        pruned = true;
        continue;
      }
      for (const [key, rec] of out) {
        if (rec.slug !== d.from || !(d.field in rec.data)) continue;
        const v = rec.data[d.field];
        if (Array.isArray(v)) rec.data[d.field] = v.filter((x) => x !== d.to);
        else if (v === d.to) {
          if (rec.type === 'domains' && d.field === 'user') {
            failRecord(key, `user "${d.to}" is not a known character`);
            pruned = true;
            continue;
          }
          delete rec.data[d.field];
        } else continue;
        report.unresolved.push({ type: rec.type, slug: rec.slug, field: d.field, name: d.to });
        pruned = true;
      }
    }
    if (!pruned) {
      for (const d of dangling) report.warnings.push(`Pre-existing dangling reference ${d.from}.${d.field} → ${d.to}`);
      break;
    }
    validate();
  }

  // 8. Write.
  for (const [, rec] of out) {
    const prior = existing.records[rec.type].get(rec.slug);
    const text = toJson(rec.data);
    const line: RecordLine = { type: rec.type, slug: rec.slug, title: rec.title || undefined, revision: rec.revid || undefined, status: 'created' };
    if (prior && prior.text === text) line.status = 'unchanged';
    else if (prior) line.status = 'updated';
    if (!rec.revid) line.reason = 'spoiler override applied';
    report.records.push(line);
    if (rec.revid) nextSources[wiki.source][rec.title] = rec.revid;
    if (line.status !== 'unchanged' && !opts.dryRun) {
      await mkdir(join(contentDir, rec.type), { recursive: true });
      await writeFile(join(contentDir, rec.type, prior?.file ?? `${rec.slug}.json`), text);
    }
  }
  report.edgesAdded = added.map((e) => e.id);
  const edgesText = toJson(edges);
  if (!opts.dryRun) {
    if (edgesText !== existing.edgesText) await writeFile(join(contentDir, 'edges.json'), edgesText);
    await mkdir(metaDir, { recursive: true });
    const sorted = Object.fromEntries(Object.entries(nextSources).sort(([a], [b]) => a.localeCompare(b)).map(([s, m]) => [s, Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)))]));
    await writeFile(join(metaDir, 'sources.json'), toJson(sorted));
  }
}

function buildDataset(existing: Existing, out: Map<string, { type: EntityType; slug: string; data: Json }>, edges: EdgeRecord[]): Dataset {
  const ds = { edges: edges.map((e) => edge.parse(e)) } as unknown as Record<string, unknown[]>;
  for (const type of ENTITY_TYPES) {
    const merged = new Map<string, Json>();
    for (const [slug, r] of existing.records[type]) merged.set(slug, r.data);
    for (const rec of out.values()) if (rec.type === type) merged.set(rec.slug, rec.data);
    ds[type] = [...merged.values()].map((d) => SCHEMAS[type].parse(d));
  }
  return ds as unknown as Dataset;
}
