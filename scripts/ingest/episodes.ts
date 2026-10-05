#!/usr/bin/env tsx
/**
 * Ingests anime episodes from the English Wikipedia season pages into content/episodes/.
 *
 * Separate from the Fandom run in run.ts: that one discovers pages by category and merges entity
 * records, while this reads three known pages and writes one record per episode. Run:
 *
 *   pnpm ingest:episodes            # fetch and write
 *   pnpm ingest:episodes --dry-run  # report only, touch nothing
 *
 * Wikipedia text is CC BY-SA 4.0, recorded in each record's provenance alongside the revision id
 * the summary came from, so a later sync can tell what changed.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchPage, wikipediaProvenance } from './wikipedia-page.ts';
import { mapEpisodes } from './map/episode.ts';
import { episodeSlug, spoilerBoundaries, type SpoilerLevel } from '../../src/content/schemas/index.ts';
import { levelForSeason } from '../../src/content/schemas/boundaries.ts';

const CONTENT = 'content';
const SEASON_PAGES = [1, 2, 3].map((season) => ({ season, title: `Jujutsu Kaisen season ${season}` }));

/** The arc covering an episode, from the arcs' own `[season, first, last]`. */
function arcsBySeason() {
  const dir = join(CONTENT, 'arcs');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as { slug: string; episodes?: [number, number, number] })
    .filter((a): a is { slug: string; episodes: [number, number, number] } => Array.isArray(a.episodes));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const boundaries = spoilerBoundaries.parse(JSON.parse(readFileSync(join(CONTENT, 'meta', 'spoiler-boundaries.json'), 'utf8')));
  const arcs = arcsBySeason();
  const outDir = join(CONTENT, 'episodes');
  if (!dryRun) mkdirSync(outDir, { recursive: true });

  let written = 0;
  for (const { season, title } of SEASON_PAGES) {
    const page = await fetchPage(title);
    if (!page) {
      console.warn(`::warning::${title} has no content; skipped (an unaired season is expected here).`);
      continue;
    }
    const level: SpoilerLevel = levelForSeason(boundaries, season);
    const drafts = mapEpisodes(page.wikitext, season, level);
    if (!drafts.length) {
      console.warn(`::warning::${title}: no {{Episode list}} rows found.`);
      continue;
    }
    const fetchedAt = new Date().toISOString();
    for (const d of drafts) {
      const slug = episodeSlug(d.season, d.numberInSeason);
      const arc = arcs.find((a) => a.episodes[0] === d.season && d.numberInSeason >= a.episodes[1] && d.numberInSeason <= a.episodes[2]);
      const record = {
        slug,
        level,
        season: d.season,
        numberInSeason: d.numberInSeason,
        ...(d.number ? { number: d.number } : {}),
        title: d.title,
        ...(d.airedAt ? { airedAt: d.airedAt } : {}),
        // The summary describes the episode, so it is gated at the episode's own level.
        summary: d.summary ? [{ value: d.summary, level }] : [],
        ...(arc ? { arc: arc.slug } : {}),
        fixture: false,
        provenance: [wikipediaProvenance(page, fetchedAt)],
      };
      if (!dryRun) writeFileSync(join(outDir, `${slug}.json`), JSON.stringify(record, null, 2) + '\n', 'utf8');
      written++;
    }
    console.log(`${title}: ${drafts.length} episodes at level ${level} (rev ${page.revisionId})`);
  }
  console.log(`${dryRun ? 'Would write' : 'Wrote'} ${written} episode records.`);
}

await main();
