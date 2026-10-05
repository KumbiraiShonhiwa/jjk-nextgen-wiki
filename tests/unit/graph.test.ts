import { describe, expect, it } from 'vitest';
import { adjacentArcs, buildIndex, findDanglingRefs, maxLevel, membersOf, neighbours, relationshipGraph, safeValue, visibleValues, type Dataset } from '../../src/lib/graph';

const empty: Dataset = { characters: [], techniques: [], domains: [], arcs: [], organizations: [], locations: [], edges: [] };
const person = (slug: string, extra = {}) =>
  ({ slug, level: 'none', name: { en: slug }, aliases: [], species: [], summary: [{ value: 'x', level: 'none' }], status: [], grade: [], affiliations: [], techniques: [], firstAppearance: [], fixture: true, provenance: [], ...extra }) as Dataset['characters'][number];

describe('findDanglingRefs', () => {
  it('reports references to missing entities', () => {
    const ix = buildIndex({ ...empty, characters: [person('a', { techniques: ['nope'], domain: 'gone' })] });
    expect(findDanglingRefs(ix)).toEqual([
      { from: 'a', field: 'techniques', to: 'nope', expected: 'techniques' },
      { from: 'a', field: 'domain', to: 'gone', expected: 'domains' },
    ]);
  });

  it('checks both ends of an edge', () => {
    const ix = buildIndex({ ...empty, characters: [person('a')], edges: [{ id: 'a--ally--b', from: 'a', to: 'b', kind: 'ally', level: 'none', provenance: [] }] });
    expect(findDanglingRefs(ix)).toHaveLength(1);
  });
});

describe('neighbours', () => {
  it('orients edges from the point of view of the given slug', () => {
    const ix = buildIndex({ ...empty, characters: [person('a'), person('b')], edges: [{ id: 'a--ally--b', from: 'a', to: 'b', kind: 'ally', level: 'none', provenance: [] }] });
    expect(neighbours(ix, 'b')).toEqual([expect.objectContaining({ other: 'a', outgoing: false })]);
  });
});

describe('spoiler helpers', () => {
  const values = [
    { value: 'safe', level: 'none' as const },
    { value: 's2', level: 'anime-s2' as const },
  ];
  it('filters by level', () => {
    expect(visibleValues(values, 'anime-s1')).toEqual(['safe']);
    expect(visibleValues(values, 'manga')).toEqual(['safe', 's2']);
  });
  it('picks the spoiler-free value for metadata', () => {
    expect(safeValue(values)).toBe('safe');
    expect(safeValue([values[1]!])).toBeUndefined();
  });
});

describe('membersOf', () => {
  it('lists affiliated characters in name order', () => {
    const ix = buildIndex({ ...empty, characters: [person('zed', { affiliations: ['school'] }), person('amy', { affiliations: ['school'] }), person('out')] });
    expect(membersOf(ix, 'school').map((c) => c.slug)).toEqual(['amy', 'zed']);
  });
});

describe('adjacentArcs', () => {
  const arcOf = (slug: string, order: number) => ({ slug, order, level: 'none', name: slug, summary: [{ value: 'x', level: 'none' }], events: [], characters: [], locations: [], fixture: true, provenance: [] }) as Dataset['arcs'][number];
  // Deliberately out of order: buildIndex sorts arcs by `order`.
  const ix = buildIndex({ ...empty, arcs: [arcOf('c', 3), arcOf('a', 1), arcOf('b', 2)] });

  it('finds both neighbours in story order', () => {
    const { prev, next } = adjacentArcs(ix, 'b');
    expect([prev?.slug, next?.slug]).toEqual(['a', 'c']);
  });
  it('has no previous arc at the start and no next arc at the end', () => {
    expect(adjacentArcs(ix, 'a').prev).toBeUndefined();
    expect(adjacentArcs(ix, 'c').next).toBeUndefined();
  });
  it('returns nothing for an unknown arc', () => expect(adjacentArcs(ix, 'zz')).toEqual({}));
});

describe('maxLevel', () => {
  it('returns the stricter level in either order', () => {
    expect(maxLevel('none', 'manga')).toBe('manga');
    expect(maxLevel('anime-s3', 'anime-s1')).toBe('anime-s3');
    expect(maxLevel('anime-s2', 'anime-s2')).toBe('anime-s2');
  });
});

describe('relationshipGraph', () => {
  const ix = buildIndex({
    ...empty,
    characters: [person('a'), person('b', { level: 'anime-s2' }), person('c')],
    organizations: [{ slug: 'org', level: 'none', name: { en: 'Org' }, kind: 'school', summary: [{ value: 'x', level: 'none' }], fixture: true, provenance: [] }],
    edges: [
      { id: 'a--ally--b', from: 'a', to: 'b', kind: 'ally', level: 'none', provenance: [] },
      { id: 'a--rival--c', from: 'a', to: 'c', kind: 'rival', label: 'old rival', level: 'anime-s1', provenance: [] },
      { id: 'a--member-of--org', from: 'a', to: 'org', kind: 'member-of', level: 'none', provenance: [] },
    ],
  });
  const { nodes, links } = relationshipGraph(ix);

  it('has a node per character and drops edges to non-characters', () => {
    expect(nodes.map((n) => n.slug)).toEqual(['a', 'b', 'c']);
    expect(links.map((l) => l.id)).toEqual(['a--ally--b', 'a--rival--c']);
  });

  it('gates a link at the stricter of its own level and its endpoints', () => {
    expect(links.find((l) => l.id === 'a--ally--b')!.level).toBe('anime-s2');
    expect(links.find((l) => l.id === 'a--rival--c')!.level).toBe('anime-s1');
  });

  it('labels links, falling back to the kind', () => {
    expect(links.map((l) => l.label)).toEqual(['ally', 'old rival']);
  });
});
