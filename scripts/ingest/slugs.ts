/** Slugs and name → slug resolution across existing content and this run's pages. */

export const ENTITY_TYPES = ['characters', 'techniques', 'domains', 'arcs', 'organizations', 'locations'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** "Satoru Gojō (anime)" → "satoru-gojo". Empty if nothing slug-worthy remains. */
export function slugify(s: string): string {
  return fold(s)
    .replace(/\s*\([^)]*\)\s*$/, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Comparison key for names: folded, lower-case, punctuation-free. */
export const nameKey = (s: string) =>
  fold(s)
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Default slug for a new character: our slugs use Japanese order (family name first).
 * Prefer the romaji from the infobox (already family-first on the source), else reverse a
 * two-word English title ("Satoru Gojo" → "gojo-satoru"), else slugify the title.
 */
export function characterSlug(title: string, romaji?: string): string {
  if (romaji) {
    const s = slugify(romaji);
    if (s) return s;
  }
  const words = fold(title).replace(/\s*\([^)]*\)\s*$/, '').trim().split(/\s+/);
  if (words.length === 2) return slugify(`${words[1]} ${words[0]}`);
  return slugify(title);
}

/** Per-type name index. Later registrations do not override earlier ones (existing content wins). */
export class NameIndex {
  private maps = new Map<EntityType, Map<string, string>>();
  private slugs = new Map<EntityType, Set<string>>();

  constructor() {
    for (const t of ENTITY_TYPES) {
      this.maps.set(t, new Map());
      this.slugs.set(t, new Set());
    }
  }

  add(type: EntityType, slug: string, names: (string | undefined)[]): void {
    this.slugs.get(type)!.add(slug);
    const m = this.maps.get(type)!;
    const add = (n: string) => {
      const k = nameKey(n);
      if (k && !m.has(k)) m.set(k, slug);
    };
    add(slug.replace(/-/g, ' '));
    for (const n of names) {
      if (!n) continue;
      add(n);
      if (type === 'characters') {
        const words = nameKey(n).split(' ');
        if (words.length === 2) add(`${words[1]} ${words[0]}`);
      }
    }
  }

  has(type: EntityType, slug: string): boolean {
    return this.slugs.get(type)!.has(slug);
  }

  resolve(type: EntityType, name: string): string | undefined {
    return this.maps.get(type)!.get(nameKey(name));
  }
}
