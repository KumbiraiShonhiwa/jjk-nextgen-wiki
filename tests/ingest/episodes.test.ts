import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { airDate, episodeTemplates, mapEpisodes, plain, templateParams } from '../../scripts/ingest/map/episode.ts';
import { episodeSlug } from '../../src/content/schemas';

const excerpt = readFileSync(join(import.meta.dirname, 'fixtures/wikipedia/season-1-excerpt.wikitext'), 'utf8');

describe('plain', () => {
  it('unwraps links, templates, refs and notes', () => {
    expect(plain('[[Yuji Itadori]] is a student')).toBe('Yuji Itadori is a student');
    expect(plain('[[Jujutsu Kaisen (manga)|the manga]] run')).toBe('the manga run');
    expect(plain("'''bold''' and ''italic''")).toBe('bold and italic');
    expect(plain('text<ref name="x"/> more')).toBe('text more');
    expect(plain('text<ref>a citation</ref> more')).toBe('text more');
    expect(plain('aired{{efn|with a note}} then')).toBe('aired then');
    expect(plain('{{Nihongo|Ryomen Sukuna|両面宿儺|Ryōmen Sukuna}}')).toBe('Ryomen Sukuna');
  });
});

describe('airDate', () => {
  it('reads the Start date template and pads to ISO', () => {
    expect(airDate('{{Start date|2020|10|3}}')).toBe('2020-10-03');
    expect(airDate('{{start date|2023|12|28}}')).toBe('2023-12-28');
  });
  it('returns undefined when there is no usable date', () => {
    expect(airDate('TBA')).toBeUndefined();
    expect(airDate('')).toBeUndefined();
  });
});

describe('templateParams', () => {
  it('splits on pipes at depth zero only, so nested templates survive', () => {
    const p = templateParams('X | A = 1 | B = {{T|x|y}} | C = [[Page|label]]');
    expect(p.a).toBe('1');
    expect(p.b).toBe('{{T|x|y}}');
    expect(p.c).toBe('[[Page|label]]');
  });
});

describe('episodeTemplates', () => {
  it('finds each template and balances its braces', () => {
    expect(episodeTemplates(excerpt)).toHaveLength(2);
    expect(episodeTemplates('no templates here')).toEqual([]);
  });
});

describe('mapEpisodes against a real Wikipedia excerpt', () => {
  const eps = mapEpisodes(excerpt, 1, 'anime-s1');

  it('maps the rows to episodes', () => {
    expect(eps).toHaveLength(2);
    expect(eps[0]).toMatchObject({
      season: 1,
      numberInSeason: 1,
      number: 1,
      title: { en: 'Ryomen Sukuna', ja: '両面宿儺' },
      airedAt: '2020-10-03',
      level: 'anime-s1',
    });
    expect(eps[0]!.summary).toContain('Yuji Itadori');
    // The summary must come out as prose, not wiki markup.
    expect(eps[0]!.summary).not.toMatch(/\[\[|\{\{|<ref/);
  });

  it('numbers within the season, not across the series', () => {
    expect(eps.map((e) => e.numberInSeason)).toEqual([1, 2]);
  });

  it('skips a row with no usable number or title', () => {
    expect(mapEpisodes('{{Episode list|EpisodeNumber=|Title=}}', 1, 'anime-s1')).toEqual([]);
  });

  it('keeps the first of a repeated episode number, since a cour split repeats the table', () => {
    const doubled = excerpt + '\n' + excerpt;
    expect(mapEpisodes(doubled, 1, 'anime-s1')).toHaveLength(2);
  });
});

describe('episodeSlug', () => {
  it('is stable and route-shaped', () => {
    expect(episodeSlug(2, 13)).toBe('s2e13');
    expect(episodeSlug(1, 1)).toBe('s1e1');
  });
});
