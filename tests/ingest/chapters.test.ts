import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapChapters, nihongoTitle, volumeChapters } from '../../scripts/ingest/map/chapter.ts';
import { positionalItems, splitTopLevel, templateParams, templatesNamed } from '../../scripts/ingest/map/wikitemplate.ts';
import { chapterSlug } from '../../src/content/schemas';

const volume1 = readFileSync(join(import.meta.dirname, 'fixtures/wikipedia/chapters-volume-1.wikitext'), 'utf8');

describe('wikitemplate scanning', () => {
  it('splits only at top-level pipes', () => {
    expect(splitTopLevel('a|b{{T|x}}|[[P|q]]').map((s) => s.trim())).toEqual(['a', 'b{{T|x}}', '[[P|q]]']);
  });

  it('separates named parameters from positional items', () => {
    const body = 'start=5|{{Nihongo|"A"|あ}}|{{Nihongo|"B"|い}}';
    expect(templateParams(body)).toEqual({ start: '5' });
    expect(positionalItems(body)).toEqual(['{{Nihongo|"A"|あ}}', '{{Nihongo|"B"|い}}']);
  });

  it('returns a template body without its name', () => {
    // Including the name made it the first positional item, which turned every chapter title
    // into the literal string "Nihongo".
    expect(templatesNamed('{{Nihongo|"A"|あ}}', 'Nihongo')).toEqual(['|"A"|あ']);
  });
});

describe('nihongoTitle', () => {
  it('takes the English and Japanese titles and drops the quotes', () => {
    expect(nihongoTitle('{{Nihongo|"Ryomen Sukuna"|両面宿儺|Ryōmen Sukuna}}')).toEqual({ en: 'Ryomen Sukuna', ja: '両面宿儺' });
  });
  it('falls back to plain text when there is no template', () => {
    expect(nihongoTitle('"Just A Title"')).toEqual({ en: 'Just A Title' });
  });
  it('is undefined for an empty item', () => {
    expect(nihongoTitle('')).toBeUndefined();
  });
});

describe('volumeChapters against a real volume', () => {
  const chapters = volumeChapters(templatesNamed(volume1, 'Graphic novel list')[0]!);

  it('numbers chapters from each column start, across both columns', () => {
    expect(chapters.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(chapters.every((c) => c.volume === 1)).toBe(true);
  });

  it('reads the titles', () => {
    expect(chapters[0]).toEqual({ number: 1, title: { en: 'Ryomen Sukuna', ja: '両面宿儺' }, volume: 1 });
    expect(chapters.at(-1)!.title.en).toBe('Fearsome Womb, Part 2');
  });
});

describe('mapChapters', () => {
  it('sorts by number and drops duplicates when a chapter is listed twice', () => {
    const doubled = volume1 + '\n' + volume1;
    const chapters = mapChapters(doubled);
    expect(chapters.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('is empty rather than throwing when the page has no volume templates', () => {
    expect(mapChapters('nothing here')).toEqual([]);
  });
});

describe('chapterSlug', () => {
  it('is stable', () => {
    expect(chapterSlug(271)).toBe('ch-271');
  });
});
