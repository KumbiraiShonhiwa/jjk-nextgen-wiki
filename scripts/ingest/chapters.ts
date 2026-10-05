#!/usr/bin/env tsx
/**
 * Ingests manga chapters from the English Wikipedia chapter list into content/chapters/.
 *
 *   pnpm ingest:chapters            # fetch and write
 *   pnpm ingest:chapters --dry-run  # report only, touch nothing
 *
 * Each chapter's level comes from the boundary table rather than the page: that table is the one
 * place the project decides what a chapter number means for spoilers.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapChapters } from './map/chapter.ts';
import { fetchPage, wikipediaProvenance } from './wikipedia-page.ts';
import { chapterSlug, levelForChapter, spoilerBoundaries } from '../../src/content/schemas/index.ts';

const CONTENT = 'content';
const PAGE = 'List of Jujutsu Kaisen chapters';

/** Arcs with a chapter range, so a chapter can name the arc it belongs to. */
function arcRanges() {
  const dir = join(CONTENT, 'arcs');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as { slug: string; chapters?: [number, number] })
    .filter((a): a is { slug: string; chapters: [number, number] } => Array.isArray(a.chapters));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const boundaries = spoilerBoundaries.parse(JSON.parse(readFileSync(join(CONTENT, 'meta', 'spoiler-boundaries.json'), 'utf8')));
  const arcs = arcRanges();
  const outDir = join(CONTENT, 'chapters');
  if (!dryRun) mkdirSync(outDir, { recursive: true });

  const page = await fetchPage(PAGE);
  if (!page) throw new Error(`${PAGE}: not found`);
  const drafts = mapChapters(page.wikitext);
  if (!drafts.length) throw new Error(`${PAGE}: no {{Graphic novel list}} rows found`);

  const fetchedAt = new Date().toISOString();
  for (const d of drafts) {
    const arc = arcs.find((a) => d.number >= a.chapters[0] && d.number <= a.chapters[1]);
    const record = {
      slug: chapterSlug(d.number),
      level: levelForChapter(boundaries, d.number),
      number: d.number,
      title: d.title,
      volume: d.volume,
      ...(arc ? { arc: arc.slug } : {}),
      fixture: false,
      provenance: [wikipediaProvenance(page, fetchedAt)],
    };
    if (!dryRun) writeFileSync(join(outDir, `${record.slug}.json`), JSON.stringify(record, null, 2) + '\n', 'utf8');
  }

  const volumes = new Set(drafts.map((d) => d.volume)).size;
  const byLevel = drafts.reduce<Record<string, number>>((acc, d) => {
    const l = levelForChapter(boundaries, d.number);
    acc[l] = (acc[l] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`${PAGE}: ${drafts.length} chapters across ${volumes} volumes (rev ${page.revisionId})`);
  console.log(`levels: ${Object.entries(byLevel).map(([l, n]) => `${l} ${n}`).join(' · ')}`);
  console.log(`${dryRun ? 'Would write' : 'Wrote'} ${drafts.length} chapter records.`);
}

await main();
