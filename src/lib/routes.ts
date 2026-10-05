import type { Arc, Domain, Location, Organization, SpoilerLevel, Technique } from '../content/schemas';
import type { EntityType } from './graph';

const BASE: Record<EntityType, string> = {
  characters: '/characters',
  techniques: '/techniques',
  domains: '/domains',
  arcs: '/arcs',
  organizations: '/organizations',
  locations: '/locations',
};

/** Canonical URL of an entity page (docs/04: lowercase slugs, no trailing slash). */
export const hrefFor = (type: EntityType, slug: string) => `${BASE[type]}/${slug}`;

/**
 * Shared-element name for the card -> page view transition (docs/08 `page-morph`). One helper so a
 * grid and the page it links to cannot drift apart. A name has to be unique within a document, so
 * only index grids set it; entity pages can list the same entity twice.
 */
export const morphName = (type: EntityType, slug: string) => `morph-${type}-${slug}`;

/**
 * Page titles and meta descriptions are seen by search engines and link previews, so they may only
 * name an entity whose existence is spoiler-free (docs/04). Gated entities get a neutral title.
 */
export function safeTitle(entity: { level: SpoilerLevel }, name: string, neutral: string): string {
  return entity.level === 'none' ? name : neutral;
}

export const techniqueTitle = (t: Technique) => safeTitle(t, t.name.en, 'Cursed technique');
export const domainTitle = (d: Domain) => safeTitle(d, d.name.en, 'Domain Expansion');
export const arcTitle = (a: Arc) => safeTitle(a, a.name, `Story arc ${a.order}`);
export const organizationTitle = (o: Organization) => safeTitle(o, o.name.en, 'Organization');
export const locationTitle = (l: Location) => safeTitle(l, l.name.en, 'Location');
