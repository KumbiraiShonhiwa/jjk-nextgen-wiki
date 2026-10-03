import type { Character } from '../content/schemas';

/** Stable 32-bit FNV-1a hash, so a character always gets the same placeholder. */
export function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** "Megumi Fushiguro" -> "MF"; one name -> first two letters. */
export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts.slice(0, 2).map((p) => p[0]) : [...(parts[0] ?? '?')].slice(0, 2);
  return letters.join('').toUpperCase();
}

export interface PortraitSpec {
  /** Rotation of the crossing blade lines, degrees. */
  angle: number;
  /** Ring radii in viewBox units. */
  rings: number[];
  /** Centre of the sigil, in viewBox units (viewBox is 120 x 160). */
  cx: number;
  cy: number;
  initials: string;
}

/** Deterministic generative portrait, shown until real art is generated. */
export function portraitSpec(slug: string, name: string): PortraitSpec {
  const h = hash(slug);
  const count = 3 + (h % 3);
  const base = 18 + ((h >>> 3) % 8);
  return {
    angle: (h >>> 6) % 180,
    rings: Array.from({ length: count }, (_, i) => base + i * (9 + ((h >>> (9 + i)) % 4))),
    cx: 50 + ((h >>> 12) % 21),
    cy: 62 + ((h >>> 17) % 17),
    initials: initials(name),
  };
}

const STYLE =
  'Stylised dark-fantasy anime key art, dramatic rim lighting, deep ink-black background with a single cursed-energy glow, ' +
  'three-quarter portrait, painterly, original composition, no text, no logo, no watermark.';

/** Prompt for the image model. Built only from our own records, never from scraped prose. */
export function artPrompt(c: Pick<Character, 'name' | 'accent'>): string {
  const glow = c.accent ? ` The glow colour is ${c.accent}.` : '';
  return `Portrait of ${c.name.en}, a character from the anime Jujutsu Kaisen (fan illustration).${glow} ${STYLE}`;
}

export const artAlt = (c: Pick<Character, 'name'>) => `AI-generated portrait of ${c.name.en}`;
