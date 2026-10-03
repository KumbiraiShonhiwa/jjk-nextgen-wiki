import type { Arc, Character, Domain, Edge, Location, Organization, SpoilerLevel, Technique } from '../content/schemas';
import { isVisible } from '../content/schemas/common';

export type EntityType = 'characters' | 'techniques' | 'domains' | 'arcs' | 'organizations' | 'locations';

export interface Dataset {
  characters: Character[];
  techniques: Technique[];
  domains: Domain[];
  arcs: Arc[];
  organizations: Organization[];
  locations: Location[];
  edges: Edge[];
}

export interface Index {
  characters: Map<string, Character>;
  techniques: Map<string, Technique>;
  domains: Map<string, Domain>;
  arcs: Map<string, Arc>;
  organizations: Map<string, Organization>;
  locations: Map<string, Location>;
  edges: Edge[];
}

const bySlug = <T extends { slug: string }>(items: T[]) => new Map(items.map((i) => [i.slug, i]));

export function buildIndex(data: Dataset): Index {
  return {
    characters: bySlug(data.characters),
    techniques: bySlug(data.techniques),
    domains: bySlug(data.domains),
    arcs: bySlug([...data.arcs].sort((a, b) => a.order - b.order)),
    organizations: bySlug(data.organizations),
    locations: bySlug(data.locations),
    edges: data.edges,
  };
}

export interface DanglingRef {
  from: string;
  field: string;
  to: string;
  expected: EntityType | 'character|organization';
}

/** Every slug reference must resolve. Run at build time and in unit tests. */
export function findDanglingRefs(ix: Index): DanglingRef[] {
  const out: DanglingRef[] = [];
  const check = (from: string, field: string, to: string | undefined, expected: EntityType) => {
    if (to && !ix[expected].has(to)) out.push({ from, field, to, expected });
  };
  for (const c of ix.characters.values()) {
    c.affiliations.forEach((s) => check(c.slug, 'affiliations', s, 'organizations'));
    c.techniques.forEach((s) => check(c.slug, 'techniques', s, 'techniques'));
    check(c.slug, 'domain', c.domain, 'domains');
  }
  for (const t of ix.techniques.values()) {
    t.users.forEach((s) => check(t.slug, 'users', s, 'characters'));
    check(t.slug, 'domain', t.domain, 'domains');
    check(t.slug, 'clan', t.clan, 'organizations');
  }
  for (const d of ix.domains.values()) {
    check(d.slug, 'user', d.user, 'characters');
    check(d.slug, 'technique', d.technique, 'techniques');
  }
  for (const a of ix.arcs.values()) {
    a.characters.forEach((s) => check(a.slug, 'characters', s, 'characters'));
    a.locations.forEach((s) => check(a.slug, 'locations', s, 'locations'));
  }
  for (const o of ix.organizations.values()) check(o.slug, 'location', o.location, 'locations');
  for (const e of ix.edges) {
    const known = (s: string) => ix.characters.has(s) || ix.organizations.has(s);
    if (!known(e.from)) out.push({ from: e.id, field: 'from', to: e.from, expected: 'character|organization' });
    if (!known(e.to)) out.push({ from: e.id, field: 'to', to: e.to, expected: 'character|organization' });
  }
  return out;
}

/** Edges touching `slug`, oriented so `other` is the neighbour. */
export function neighbours(ix: Index, slug: string) {
  return ix.edges
    .filter((e) => e.from === slug || e.to === slug)
    .map((e) => ({ edge: e, other: e.from === slug ? e.to : e.from, outgoing: e.from === slug }));
}

/** Arcs a character appears in, in story order. */
export function arcsFor(ix: Index, slug: string): Arc[] {
  return [...ix.arcs.values()].filter((a) => a.characters.includes(slug));
}

/** Keep only gated values a visitor at `setting` may see. */
export function visibleValues<T>(values: { value: T; level: SpoilerLevel }[], setting: SpoilerLevel): T[] {
  return values.filter((v) => isVisible(v.level, setting)).map((v) => v.value);
}

/** The value safe for anyone: used for titles, meta descriptions and link previews. */
export function safeValue<T>(values: { value: T; level: SpoilerLevel }[]): T | undefined {
  return values.find((v) => v.level === 'none')?.value;
}
