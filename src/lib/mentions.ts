/**
 * Who a piece of text names (roadmap B2).
 *
 * This is deliberately *mentions*, not a cast list. We have no per-episode cast data: the only
 * source is Wikipedia's summary, and a character can appear in an episode without being named in
 * two sentences of prose. Pages that use this say "mentioned in the summary" rather than implying
 * a credit, because a derived list presented as a cast would be wrong about seven episodes in fifty-nine.
 */
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface Mentionable {
  slug: string;
  /** Full name as written, e.g. "Satoru Gojo". */
  name: string;
  aliases?: string[];
}

/**
 * Names to match for one person: the full name, any alias, and each part of the name on its own.
 *
 * Both parts are needed, not just the family name: these summaries call the same character "Yuji"
 * in one sentence and "Itadori" in the next. Fragments of three characters or fewer are dropped,
 * because a short name matches far too much ordinary prose.
 */
export function spellingsFor(entry: Mentionable): string[] {
  const parts = entry.name.split(/\s+/).filter(Boolean);
  const nameParts = parts.length > 1 ? parts : [];
  return [entry.name, ...(entry.aliases ?? []), ...nameParts]
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
}

/** Entries named in `text`, in the order they are first named. */
export function mentionedIn<T extends Mentionable>(text: string, entries: T[]): T[] {
  const found: { entry: T; at: number }[] = [];
  for (const entry of entries) {
    let earliest = Infinity;
    for (const spelling of spellingsFor(entry)) {
      const m = new RegExp(`\\b${escapeRegExp(spelling)}\\b`, 'i').exec(text);
      if (m && m.index < earliest) earliest = m.index;
    }
    if (earliest !== Infinity) found.push({ entry, at: earliest });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.entry);
}
