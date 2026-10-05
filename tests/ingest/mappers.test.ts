// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mapArc, parseChapterRange } from '../../scripts/ingest/map/arc.ts';
import { mapCharacter, parseGrade, parseSpecies, parseStatus } from '../../scripts/ingest/map/character.ts';
import type { Draft } from '../../scripts/ingest/map/common.ts';
import { mapDomain } from '../../scripts/ingest/map/domain.ts';
import { isSkip } from '../../scripts/ingest/map/index.ts';
import { mapOrganization, parseOrganizationKind } from '../../scripts/ingest/map/organization.ts';
import { mapTechnique, parseTechniqueKind } from '../../scripts/ingest/map/technique.ts';
import { characterSlug, NameIndex, slugify } from '../../scripts/ingest/slugs.ts';
import { applyOverrides, clampToRecordLevel, normalizeHeading, spoilerOverrides } from '../../scripts/ingest/spoilers.ts';
import { fixturePage, realPolicy } from './helpers.ts';

const policy = realPolicy();
const map = (fn: typeof mapCharacter, title: string): Draft => {
  const r = fn({ title, wikitext: fixturePage(title).wikitext, policy });
  if (isSkip(r)) throw new Error(`skipped: ${r.reason}`);
  return r;
};

describe('spoiler policy', () => {
  it('normalizes arc headings', () => {
    expect(normalizeHeading('Vs. Mahito Arc')).toBe('vs mahito');
    expect(normalizeHeading("Gojo's Past Arc")).toBe('gojo s past');
    expect(normalizeHeading('The Culling Game Arc Part 2')).toBe('culling game');
  });

  it('gates sections by arc heading, lead/appearance/personality as none, everything else manga', () => {
    expect(policy.sectionLevel({ path: [] })).toBe('none');
    expect(policy.sectionLevel({ path: ['Appearance'] })).toBe('none');
    expect(policy.sectionLevel({ path: ['Personality', 'As a child'] })).toBe('none');
    expect(policy.sectionLevel({ path: ['History', 'Introduction Arc'] })).toBe('anime-s1');
    expect(policy.sectionLevel({ path: ['History', "Gojo's Past Arc", 'Star Plasma Vessel'] })).toBe('anime-s2');
    expect(policy.sectionLevel({ path: ['History', 'Shinjuku Showdown Arc'] })).toBe('manga');
    expect(policy.sectionLevel({ path: ['History', 'Jujutsu Kaisen 0'] })).toBe('anime-s1');
    expect(policy.sectionLevel({ path: ['History', 'Perfect Preparation Arc'] })).toBe('manga');
    expect(policy.sectionLevel({ path: ['History', 'Background'] })).toBe('manga');
    expect(policy.sectionLevel({ path: ['Abilities and Powers'] })).toBe('manga');
  });

  it('first listed grade is none, later ones manga, unless they name an arc', () => {
    expect(policy.listItemLevel('Grade 2', 0)).toBe('none');
    expect(policy.listItemLevel('Grade 1', 1)).toBe('manga');
    expect(policy.listItemLevel('Semi-Grade 1 (after the Shibuya Incident)', 1)).toBe('anime-s2');
  });

  it('applies overrides by field, by index and to the record level, reporting unknown paths', () => {
    const rec = { level: 'none', status: [{ value: 'deceased', level: 'manga' }], grade: [{ value: '2', level: 'none' }, { value: 'semi-1', level: 'manga' }] };
    const unused = applyOverrides(rec, { status: 'anime-s3', 'grade.1': 'anime-s2', level: 'anime-s1', 'grade.9': 'none', missing: 'none' });
    expect(rec.status[0].level).toBe('anime-s3');
    expect(rec.grade.map((g) => g.level)).toEqual(['none', 'anime-s2']);
    expect(rec.level).toBe('anime-s1');
    expect(unused).toEqual(['grade.9', 'missing']);
  });

  it('clamps gated values to the record level', () => {
    const rec = { level: 'anime-s2', summary: [{ value: 'a', level: 'none' }, { value: 'b', level: 'manga' }] };
    expect(clampToRecordLevel(rec)).toEqual(['summary.0']);
    expect(rec.summary.map((s) => s.level)).toEqual(['anime-s2', 'manga']);
  });

  it('validates the overrides file shape', () => {
    expect(spoilerOverrides.safeParse({ 'characters/gojo-satoru': { 'grade.0': 'none' } }).success).toBe(true);
    expect(spoilerOverrides.safeParse({ 'edges/a--family--b': { level: 'manga' } }).success).toBe(true);
    expect(spoilerOverrides.safeParse({ 'gojo-satoru': { level: 'none' } }).success).toBe(false);
    expect(spoilerOverrides.safeParse({ 'characters/gojo-satoru': { level: 'season-9' } }).success).toBe(false);
  });
});

describe('field parsers', () => {
  it.each([
    ['Special Grade', 'special'], ['Grade 1', '1'], ['Grade 4', '4'], ['Semi-Grade 1', 'semi-1'], ['Semi-Grade 2', 'semi-2'],
    ['1st Grade', '1'], ['Semi-1st Grade', 'semi-1'], ['Grade 1 (formerly)', '1'], ['Ungraded', 'ungraded'], ['Unknown', undefined],
  ])('grade %s → %s', (text, want) => expect(parseGrade(text)).toBe(want));

  it('species, status, technique and organization kinds', () => {
    expect(parseSpecies('Cursed Spirit')).toBe('cursed-spirit');
    expect(parseSpecies('Vessel of Sukuna')).toBe('vessel');
    expect(parseSpecies('Incarnated Sorcerer')).toBe('incarnated-sorcerer');
    expect(parseSpecies('Death Painting')).toBe('cursed-womb');
    expect(parseSpecies('Robot')).toBeUndefined();
    expect(parseStatus('Deceased')).toBe('deceased');
    expect(parseStatus('Alive')).toBe('alive');
    expect(parseStatus('Sealed')).toBe('unknown');
    expect(parseTechniqueKind('Inherited Technique', 'Limitless')).toBe('inherited');
    expect(parseTechniqueKind('Extension Technique', 'Blue')).toBe('extension');
    expect(parseTechniqueKind(undefined, 'Reverse Cursed Technique')).toBe('reverse');
    expect(parseTechniqueKind(undefined, 'Foo')).toBeUndefined();
    expect(parseOrganizationKind('School', 'X')).toBe('school');
    expect(parseOrganizationKind(undefined, 'Zenin Clan')).toBe('clan');
    expect(parseOrganizationKind(undefined, 'Kyoto Jujutsu High')).toBe('school');
    expect(parseOrganizationKind(undefined, 'Disasters Curses')).toBe('group');
    expect(parseChapterRange('79–136')).toEqual([79, 136]);
    expect(parseChapterRange('Chapters 1 to 7')).toEqual([1, 7]);
    expect(parseChapterRange('9–3')).toBeUndefined();
  });

  it('slugs follow Japanese name order for characters', () => {
    expect(characterSlug('Satoru Gojo', 'Gojō Satoru')).toBe('gojo-satoru');
    expect(characterSlug('Satoru Gojo')).toBe('gojo-satoru');
    expect(characterSlug('Mahito')).toBe('mahito');
    expect(slugify("Gojo's Past Arc")).toBe('gojos-past-arc');
    expect(slugify('Kyoto (location)')).toBe('kyoto');
  });

  it('name index resolves titles, aliases and either name order', () => {
    const ix = new NameIndex();
    ix.add('characters', 'gojo-satoru', ['Satoru Gojo', 'Gojō Satoru']);
    expect(ix.resolve('characters', 'Satoru Gojo')).toBe('gojo-satoru');
    expect(ix.resolve('characters', 'Gojo Satoru')).toBe('gojo-satoru');
    expect(ix.resolve('characters', 'satoru gojō')).toBe('gojo-satoru');
    expect(ix.resolve('techniques', 'Satoru Gojo')).toBeUndefined();
  });
});

describe('character mapper (recorded Fandom pages)', () => {
  it('maps Satoru Gojo: names, aliases, grade, status, summary levels, refs, unmapped params', () => {
    const d = map(mapCharacter, 'Satoru Gojo');
    expect(d.slug).toBe('gojo-satoru');
    expect(d.fields.name).toEqual({ en: 'Satoru Gojo', ja: '五条 悟', romaji: 'Gojō Satoru' });
    expect(d.fields.aliases).toEqual(['The Strongest', 'Gojo-sensei']);
    expect(d.fields.grade).toEqual([{ value: 'special', level: 'none' }]);
    expect(d.fields.status).toEqual([{ value: 'deceased', level: 'manga' }]);
    expect(d.fields.species).toEqual([{ value: 'human', level: 'none' }]);
    const summary = d.fields.summary as { value: string; level: string }[];
    expect(summary.map((s) => s.level)).toEqual(['none', 'none', 'anime-s2', 'anime-s2', 'manga']);
    expect(summary[0].value).toBe(
      'Satoru Gojo is one of the main characters of the Jujutsu Kaisen series. He is a special grade jujutsu sorcerer and a teacher at Tokyo Jujutsu High. Widely recognized as the strongest jujutsu sorcerer in the world, he is the heir of the Gojo Clan.',
    );
    expect(summary.some((s) => /<ref|\[\[|\{\{|blindfold/.test(s.value))).toBe(false);
    const refs = Object.fromEntries(d.refs.map((r) => [r.field, r.items.map((i) => i[0])]));
    expect(refs).toEqual({
      affiliations: ['Tokyo Prefectural Jujutsu High School', 'Gojo Clan'],
      techniques: ['Limitless', 'Six Eyes'],
      domain: ['Unlimited Void'],
    });
    // Profile fields (A5) are kept verbatim; only `firstAppearance` is gated.
    expect(d.fields.gender).toBe('Male');
    expect(d.fields.birthday).toBe('December 7, 1989');
    expect(d.fields.height).toBe('190 cm');
    expect(d.fields.firstAppearance).toEqual([{ value: 'Chapter 1', level: 'manga' }]);
    // Shorter than it was: gender, birthday, height and manga debut are now mapped.
    expect(d.unmapped).toEqual(['age', 'occupation', 'anime debut', 'japanese voice', 'english voice']);
    expect(d.level).toBe('anime-s2');
  });

  it('maps Megumi Fushiguro: alternative param names, {{ubl}} grades gated by arc, relatives as edges', () => {
    const d = map(mapCharacter, 'Megumi Fushiguro');
    expect(d.fields.name).toEqual({ en: 'Megumi Fushiguro', ja: '伏黒 恵', romaji: 'Fushiguro Megumi' });
    expect(d.fields.grade).toEqual([{ value: '2', level: 'none' }, { value: 'semi-1', level: 'anime-s2' }]);
    expect(d.edges).toEqual([
      { kind: 'family', to: ['Toji Fushiguro', 'Toji Fushiguro'], label: 'father', level: 'manga' },
      { kind: 'family', to: ['Tsumiki Fushiguro', 'Tsumiki Fushiguro'], label: 'step-sister', level: 'manga' },
    ]);
    // `family` is empty in the infobox: neither mapped nor reported.
    expect(d.unmapped).toEqual([]);
  });

  it('derives a new character’s slug from romaji and its level from the earliest arc section', () => {
    const d = map(mapCharacter, 'Toji Fushiguro');
    expect(d.slug).toBe('fushiguro-toji');
    expect(d.level).toBe('anime-s2');
    expect((d.fields.summary as { value: string }[])[0].value).toBe(
      'Toji Fushiguro is a sorcerer killer born into the Zenin Clan without any cursed energy, granting him an extraordinary physique.',
    );
  });

  it('species after the first are manga; a page without an infobox is skipped', () => {
    expect(map(mapCharacter, 'Yuji Itadori').fields.species).toEqual([{ value: 'human', level: 'none' }, { value: 'vessel', level: 'manga' }]);
    const r = mapCharacter({ title: 'List of Characters', wikitext: fixturePage('List of Characters').wikitext, policy });
    expect(isSkip(r) && r.reason).toMatch(/no infobox/);
    expect(isSkip(mapCharacter({ title: 'X', wikitext: '#REDIRECT [[Y]]', policy }))).toBe(true);
  });
});

describe('other mappers', () => {
  it('technique: kind, users, clan, domain, mechanics gated as manga', () => {
    const d = map(mapTechnique, 'Limitless');
    expect(d.fields.kind).toBe('inherited');
    expect(d.fields.name).toEqual({ en: 'Limitless', ja: '無下限呪術', romaji: 'Mukagen Jujutsu' });
    expect((d.fields.summary as { value: string }[])[0].value).toBe('Limitless (Mukagen Jujutsu) is an inherited cursed technique of the Gojo Clan, wielded in the present day by Satoru Gojo.');
    expect((d.fields.mechanics as { level: string }[]).map((m) => m.level)).toEqual(['manga', 'manga', 'manga']);
    expect(d.refs.map((r) => [r.field, r.items.map((i) => i[0])])).toEqual([['users', ['Satoru Gojo']], ['domain', ['Unlimited Void']], ['clan', ['Gojo Clan']]]);
    expect(d.unmapped).toEqual(['range']);
  });

  it('domain: required user ref, sure-hit from infobox and section', () => {
    const d = map(mapDomain, 'Unlimited Void');
    expect(d.refs.find((r) => r.field === 'user')).toMatchObject({ required: true, items: [['Satoru Gojo', 'Satoru Gojo', 'Satoru Gojo']] });
    expect(d.fields.sureHit).toEqual([
      { value: 'Overloads the target with infinite information.', level: 'manga' },
      { value: 'Anyone trapped inside the domain is bombarded with an endless amount of information, leaving them unable to act.', level: 'manga' },
    ]);
  });

  it('arc: only known arcs, text at the arc level, chapters parsed', () => {
    const d = map(mapArc, 'Shibuya Incident Arc');
    expect(d.slug).toBe('shibuya-incident');
    expect((d.fields.summary as { level: string }[])[0].level).toBe('anime-s2');
    expect(d.fields.chapters).toEqual([79, 136]);
    const skip = mapArc({ title: 'Perfect Preparation Arc', wikitext: fixturePage('Perfect Preparation Arc').wikitext, policy });
    expect(isSkip(skip) && skip.reason).toMatch(/curated order/);
  });

  it('organization: kind from infobox, location ref', () => {
    const d = map(mapOrganization, 'Tokyo Prefectural Jujutsu High School');
    expect(d.fields.kind).toBe('school');
    expect(d.refs[0].items).toEqual([['Tokyo', 'Tokyo', 'Tokyo']]);
    expect(d.unmapped).toEqual(['leader']);
  });
});
