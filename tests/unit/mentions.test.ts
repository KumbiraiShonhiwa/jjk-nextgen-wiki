import { describe, expect, it } from 'vitest';
import { mentionedIn, spellingsFor } from '../../src/lib/mentions';

const people = [
  { slug: 'gojo-satoru', name: 'Satoru Gojo', aliases: ['The Strongest'] },
  { slug: 'itadori-yuji', name: 'Yuji Itadori' },
  { slug: 'panda', name: 'Panda' },
];

describe('spellingsFor', () => {
  it('matches the full name, any alias and each part of the name', () => {
    // Both parts matter: the summaries say "Yuji" in one sentence and "Itadori" in the next.
    expect(spellingsFor(people[0]!)).toEqual(['Satoru Gojo', 'The Strongest', 'Satoru', 'Gojo']);
  });

  it('keeps a single-word name as itself, with no family name to split off', () => {
    expect(spellingsFor(people[2]!)).toEqual(['Panda']);
  });

  it('drops fragments too short to be safe', () => {
    // A three-letter name matches far too much ordinary prose.
    expect(spellingsFor({ slug: 'x', name: 'Mei Mei' })).toEqual(['Mei Mei']);
  });
});

describe('mentionedIn', () => {
  it('finds people named anywhere in the text', () => {
    const found = mentionedIn('Yuji Itadori meets Satoru Gojo.', people);
    expect(found.map((p) => p.slug)).toEqual(['itadori-yuji', 'gojo-satoru']);
  });

  it('returns them in the order they are first named', () => {
    const found = mentionedIn('Gojo arrives. Later, Yuji follows.', people);
    expect(found.map((p) => p.slug)).toEqual(['gojo-satoru', 'itadori-yuji']);
  });

  it('matches either part of a name on its own, as the summaries do', () => {
    expect(mentionedIn('Gojo blocks the attack.', people).map((p) => p.slug)).toEqual(['gojo-satoru']);
    expect(mentionedIn('Satoru blocks the attack.', people).map((p) => p.slug)).toEqual(['gojo-satoru']);
  });

  it('matches an alias', () => {
    expect(mentionedIn('They call him The Strongest.', people).map((p) => p.slug)).toEqual(['gojo-satoru']);
  });

  it('matches whole words only', () => {
    expect(mentionedIn('The pandas escaped.', people)).toEqual([]);
    expect(mentionedIn('Gojoesque behaviour.', people)).toEqual([]);
  });

  it('is case insensitive', () => {
    expect(mentionedIn('gojo did it.', people).map((p) => p.slug)).toEqual(['gojo-satoru']);
  });

  it('is empty when nobody is named', () => {
    expect(mentionedIn('A quiet episode.', people)).toEqual([]);
  });
});
