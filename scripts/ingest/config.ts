import type { EntityType } from './slugs.ts';

export interface WikiConfig {
  source: 'fandom' | 'wikipedia';
  endpoint: string;
  maxlag?: number;
}

export const FANDOM: WikiConfig = { source: 'fandom', endpoint: 'https://jujutsu-kaisen.fandom.com/api.php' };
/** Not mapped yet: our schema has no series entity (see docs/03). Kept for the client's maxlag path. */
export const WIKIPEDIA: WikiConfig = { source: 'wikipedia', endpoint: 'https://en.wikipedia.org/w/api.php', maxlag: 5 };

/**
 * Fandom categories to discover pages from, per entity type. The names are unverified
 * (the sandbox that wrote this could not reach Fandom); a category that returns nothing is
 * reported as a warning, and seed titles from existing content are fetched regardless.
 */
export const CATEGORIES: Record<EntityType, string[]> = {
  domains: ['Category:Domain Expansions'],
  arcs: ['Category:Story Arcs', 'Category:Arcs'],
  organizations: ['Category:Organizations', 'Category:Clans', 'Category:Schools'],
  locations: ['Category:Locations'],
  techniques: ['Category:Cursed Techniques', 'Category:Techniques'],
  characters: ['Category:Characters'],
};

/** When a page sits in several categories, the first type here wins (seeds always win). */
export const TYPE_PRIORITY: EntityType[] = ['domains', 'arcs', 'organizations', 'locations', 'techniques', 'characters'];
