import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { arc, character, domain, edge, location, organization, technique } from '../../src/content/schemas';
import { buildIndex, findDanglingRefs, type Dataset } from '../../src/lib/graph';

const root = join(import.meta.dirname, '../../content');
const schemas = { characters: character, techniques: technique, domains: domain, arcs: arc, organizations: organization, locations: location };

function loadDir<K extends keyof typeof schemas>(name: K) {
  return readdirSync(join(root, name))
    .filter((f) => f.endsWith('.json'))
    .map((file) => ({ file, data: schemas[name].parse(JSON.parse(readFileSync(join(root, name, file), 'utf8'))) }));
}

describe.each(Object.keys(schemas) as (keyof typeof schemas)[])('%s records', (name) => {
  const records = loadDir(name);

  it('has at least one record', () => expect(records.length).toBeGreaterThan(0));

  it.each(records.map((r) => [r.file, r] as const))('%s: slug matches filename', (file, r) => {
    expect(`${r.data.slug}.json`).toBe(file);
  });
});

describe('edges.json', () => {
  const edges = (JSON.parse(readFileSync(join(root, 'edges.json'), 'utf8')) as unknown[]).map((e) => edge.parse(e));

  it('ids are unique and match from--kind--to', () => {
    expect(new Set(edges.map((e) => e.id)).size).toBe(edges.length);
    for (const e of edges) expect(e.id).toBe(`${e.from}--${e.kind}--${e.to}`);
  });
});

describe('content graph', () => {
  const data = Object.fromEntries(Object.keys(schemas).map((k) => [k, loadDir(k as keyof typeof schemas).map((r) => r.data)])) as unknown as Dataset;
  data.edges = (JSON.parse(readFileSync(join(root, 'edges.json'), 'utf8')) as unknown[]).map((e) => edge.parse(e));
  const ix = buildIndex(data);

  it('has no dangling references', () => {
    expect(findDanglingRefs(ix)).toEqual([]);
  });

  it('arc order values are unique', () => {
    const orders = data.arcs.map((a) => a.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('a record is never visible earlier than its own content', () => {
    // An entity marked anime-s2 must not carry a summary visible at a lower level, or the page title would leak it.
    const order = ['none', 'anime-s1', 'anime-s2', 'anime-s3', 'manga'];
    for (const list of [data.characters, data.techniques, data.domains, data.arcs]) {
      for (const r of list as { slug: string; level: string; summary: { level: string }[] }[]) {
        for (const s of r.summary) expect(order.indexOf(s.level), r.slug).toBeGreaterThanOrEqual(order.indexOf(r.level));
      }
    }
  });
});

describe('spoiler depth', () => {
  const levels = ['anime-s2', 'anime-s3', 'manga'] as const;
  const texts = (r: { summary: { level: string }[]; events?: { level: string }[] }) => [...r.summary, ...(r.events ?? [])];

  it.each(levels)('characters and arcs both carry content at %s', (level) => {
    const hasLevel = (rs: { summary: { level: string }[]; events?: { level: string }[] }[]) =>
      rs.some((r) => texts(r).some((t) => t.level === level));
    expect(hasLevel(loadDir('characters').map((r) => r.data))).toBe(true);
    expect(hasLevel(loadDir('arcs').map((r) => r.data))).toBe(true);
  });
});
