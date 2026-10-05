/**
 * Manga chapters, from the English Wikipedia chapter list (roadmap A1).
 *
 * The page carries one `{{Graphic novel list}}` per volume. Each holds the volume's number and
 * release date, plus one or two `{{Numbered list|start=N|…}}` columns whose items are
 * `{{Nihongo|"English title"|漢字|romaji}}` — so a chapter's number comes from its column's `start`
 * plus its position, not from anything written next to it.
 */
import { plain } from './episode.ts';
import { positionalItems, templateParams, templatesNamed } from './wikitemplate.ts';

export interface ChapterDraft {
  number: number;
  title: { en: string; ja?: string };
  volume: number;
}

/** `{{Nihongo|"Ryomen Sukuna"|両面宿儺|Ryōmen Sukuna}}` → the English and Japanese titles. */
export function nihongoTitle(item: string): { en: string; ja?: string } | undefined {
  const body = templatesNamed(item, 'Nihongo')[0];
  if (!body) {
    const en = plain(item).replace(/^"|"$/g, '').trim();
    return en ? { en } : undefined;
  }
  const parts = positionalItems(body);
  const en = plain(parts[0] ?? '').replace(/^"|"$/g, '').trim();
  const ja = plain(parts[1] ?? '').trim();
  if (!en) return undefined;
  return { en, ja: ja || undefined };
}

/** Chapters of one `{{Graphic novel list}}` body. */
export function volumeChapters(body: string): ChapterDraft[] {
  const params = templateParams(body);
  const volume = Number(plain(params.volumenumber ?? ''));
  if (!Number.isInteger(volume) || volume <= 0) return [];
  const out: ChapterDraft[] = [];
  // Columns are separate parameters; a volume may use one or two.
  for (const key of Object.keys(params).filter((k) => k.startsWith('chapterlist'))) {
    for (const listBody of templatesNamed(params[key] ?? '', 'Numbered list')) {
      const start = Number(/(?:^|\|)\s*start\s*=\s*(\d+)/i.exec(listBody)?.[1] ?? '1');
      positionalItems(listBody).forEach((item, index) => {
        const title = nihongoTitle(item);
        if (title) out.push({ number: start + index, title, volume });
      });
    }
  }
  return out;
}

/** Every chapter on the list page, in number order, with duplicates dropped. */
export function mapChapters(wikitext: string): ChapterDraft[] {
  const all = templatesNamed(wikitext, 'Graphic novel list').flatMap(volumeChapters);
  const seen = new Set<number>();
  return all
    .filter((c) => !seen.has(c.number) && seen.add(c.number))
    .sort((a, b) => a.number - b.number);
}
