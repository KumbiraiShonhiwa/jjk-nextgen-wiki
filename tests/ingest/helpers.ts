import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SpoilerPolicy, type ArcRef } from '../../scripts/ingest/spoilers.ts';

export const FIXTURES = join(import.meta.dirname, 'fixtures');
export const API_FIXTURES = join(FIXTURES, 'api');
export const FANDOM_FIXTURES = join(API_FIXTURES, 'jujutsu-kaisen.fandom.com');
/** A frozen copy of content/ as of the base branch, so these tests still pass after a real ingest has changed content/. */
export const BASE_CONTENT = join(FIXTURES, 'content');

interface RecordedPage {
  title: string;
  revisions: { revid: number; slots: { main: { content: string } } }[];
}

/** Wikitext of a page from the recorded prop=revisions fixtures. */
export function fixturePage(title: string): { wikitext: string; revid: number } {
  for (const file of readdirSync(FANDOM_FIXTURES).filter((f) => f.startsWith('revisions-'))) {
    const rec = JSON.parse(readFileSync(join(FANDOM_FIXTURES, file), 'utf8')) as { response: { query: { pages: RecordedPage[] } } };
    const page = rec.response.query.pages.find((p) => p.title === title);
    if (page) return { wikitext: page.revisions[0].slots.main.content, revid: page.revisions[0].revid };
  }
  throw new Error(`No fixture page "${title}"`);
}

/** The policy built from the repository's real arcs and alias table. */
export function realPolicy(): SpoilerPolicy {
  const arcsDir = join(BASE_CONTENT, 'arcs');
  const arcs: ArcRef[] = readdirSync(arcsDir).map((f) => {
    const a = JSON.parse(readFileSync(join(arcsDir, f), 'utf8')) as { slug: string; name: string; level?: ArcRef['level'] };
    return { slug: a.slug, name: a.name, level: a.level ?? 'none' };
  });
  const table = JSON.parse(readFileSync(join(import.meta.dirname, '../../scripts/ingest/arc-aliases.json'), 'utf8'));
  return new SpoilerPolicy(arcs, { extra: [], ...table });
}
