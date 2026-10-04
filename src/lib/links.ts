import type { CommunityLink } from '../content/schemas';
import type { Index } from './graph';

/** The community links listed on the page for `slug` (an arc or a character). */
export function linksFor(links: CommunityLink[], slug: string): CommunityLink[] {
  return links.filter((l) => l.targets.includes(slug));
}

export interface DanglingLink {
  id: string;
  target: string;
}

/** Targets that are neither an arc nor a character, so no page would ever list the link. */
export function findDanglingLinks(links: CommunityLink[], ix: Pick<Index, 'arcs' | 'characters'>): DanglingLink[] {
  return links.flatMap((l) => l.targets.filter((t) => !ix.arcs.has(t) && !ix.characters.has(t)).map((target) => ({ id: l.id, target })));
}

/** Duplicate ids or URLs, which would list the same thread twice. */
export function findDuplicateLinks(links: CommunityLink[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const l of links) {
    for (const key of [`id:${l.id}`, `url:${l.url.replace(/\/+$/, '').toLowerCase()}`]) {
      if (seen.has(key)) dupes.add(key);
      seen.add(key);
    }
  }
  return [...dupes];
}
