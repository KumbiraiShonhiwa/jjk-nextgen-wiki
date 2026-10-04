// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { licenceFromRights, mergeEdges, mergeRecord, type Provenance } from '../../scripts/ingest/merge.ts';

const prov = (revisionId: number, fetchedAt = '2026-10-01T00:00:00.000Z'): Provenance => ({
  source: 'fandom', title: 'Unlimited Void', url: 'https://jujutsu-kaisen.fandom.com/wiki/Unlimited_Void', revisionId, fetchedAt, licence: 'CC BY-SA 3.0',
});

const existing = {
  slug: 'unlimited-void',
  name: { en: 'Unlimited Void', ja: '無量空処' },
  user: 'gojo-satoru',
  level: 'anime-s1',
  palette: ['#0b1030', '#7cc4ff'],
  summary: [{ value: 'Fixture text.', level: 'anime-s1' }],
  fixture: true,
};

describe('mergeRecord', () => {
  it('keeps curated fields, replaces sourced text, unions refs, keeps key order', () => {
    const out = mergeRecord({
      existing,
      sourced: { name: { en: 'Unlimited Void (Domain)', romaji: 'Muryōkūsho' }, summary: [{ value: 'Sourced.', level: 'none' }], level: 'none', palette: ['#000000', '#ffffff'], sureHit: [] },
      slug: 'unlimited-void',
      level: 'manga',
      provenance: prov(1),
    });
    expect(out.palette).toEqual(existing.palette);
    expect(out.level).toBe('anime-s1');
    expect(out.name).toEqual({ en: 'Unlimited Void', ja: '無量空処', romaji: 'Muryōkūsho' });
    expect(out.summary).toEqual([{ value: 'Sourced.', level: 'none' }]);
    expect(out.sureHit).toBeUndefined();
    expect(out.fixture).toBe(false);
    expect(Object.keys(out)).toEqual(['slug', 'name', 'user', 'level', 'palette', 'summary', 'fixture', 'provenance']);
    expect(existing.fixture).toBe(true); // input not mutated
  });

  it('unions slug lists and aliases', () => {
    const out = mergeRecord({
      existing: { slug: 'x', affiliations: ['a', 'b'], aliases: ['One'] },
      sourced: { affiliations: ['b', 'c'], aliases: ['One', 'Two'] },
      slug: 'x', level: 'none', provenance: prov(1),
    });
    expect(out.affiliations).toEqual(['a', 'b', 'c']);
    expect(out.aliases).toEqual(['One', 'Two']);
  });

  it('creates new records with the given level and replaces provenance per source page', () => {
    const created = mergeRecord({ existing: undefined, sourced: { name: { en: 'N' } }, slug: 'n', level: 'manga', provenance: prov(1) });
    expect(created).toMatchObject({ slug: 'n', level: 'manga', fixture: false });
    const again = mergeRecord({ existing: created, sourced: {}, slug: 'n', level: 'manga', provenance: prov(2, '2026-10-02T00:00:00.000Z') });
    expect(again.provenance).toEqual([prov(2, '2026-10-02T00:00:00.000Z')]);
    const same = mergeRecord({ existing: again, sourced: {}, slug: 'n', level: 'manga', provenance: prov(2, '2026-12-31T00:00:00.000Z') });
    expect((same.provenance as Provenance[])[0].fetchedAt).toBe('2026-10-02T00:00:00.000Z');
  });

  it('keeps the text of a record written for this wiki, and does not credit a page it took nothing from', () => {
    const original = { source: 'original', writtenAt: '2026-10-04T00:00:00.000Z', licence: 'CC BY-SA 4.0' };
    const arc = { slug: 'a', name: 'Arc', order: 1, summary: [{ value: 'Ours.', level: 'none' }], chapters: [1, 5], characters: ['x'], fixture: false, provenance: [original] };
    const out = mergeRecord({
      existing: arc,
      sourced: { summary: [{ value: 'Theirs.', level: 'none' }], chapters: [1, 9], characters: ['y'] },
      slug: 'a', level: 'none', provenance: prov(1),
    });
    expect(out.summary).toEqual(arc.summary);
    expect(out.chapters).toEqual([1, 5]);
    expect(out.characters).toEqual(['x', 'y']); // reference lists still union
    expect(out.provenance).toEqual([original, prov(1)]); // something was taken, so the page is credited
    const untouched = mergeRecord({ existing: arc, sourced: { summary: [{ value: 'Theirs.', level: 'none' }] }, slug: 'a', level: 'none', provenance: prov(1) });
    expect(untouched).toEqual(arc);
  });

  it('arc names stay curated', () => {
    const out = mergeRecord({ existing: { slug: 'a', name: 'Shibuya Incident' }, sourced: { name: { en: 'Shibuya Incident Arc' } }, slug: 'a', level: 'none', provenance: prov(1) });
    expect(out.name).toBe('Shibuya Incident');
  });
});

describe('mergeEdges', () => {
  it('keeps hand-written edges and skips sourced duplicates in either direction', () => {
    const mine = [{ id: 'a--family--b', from: 'a', to: 'b', kind: 'family', label: 'brother', level: 'none' as const }];
    const { edges, added } = mergeEdges(mine, [
      { id: 'b--family--a', from: 'b', to: 'a', kind: 'family', level: 'manga' },
      { id: 'a--rival--b', from: 'a', to: 'b', kind: 'rival', level: 'manga' },
      { id: 'c--family--c', from: 'c', to: 'c', kind: 'family', level: 'manga' },
    ]);
    expect(edges[0]).toBe(mine[0]);
    expect(added.map((e) => e.id)).toEqual(['a--rival--b']);
  });
});

describe('licenceFromRights', () => {
  it('maps rightsinfo to our licence enum', () => {
    expect(licenceFromRights({ url: 'https://creativecommons.org/licenses/by-sa/4.0/', text: 'Creative Commons Attribution-Share Alike 4.0' }, 'wikipedia')).toEqual({ licence: 'CC BY-SA 4.0', inferred: false });
    expect(licenceFromRights({ url: 'https://creativecommons.org/licenses/by-sa/3.0/', text: 'CC-BY-SA' }, 'fandom')).toEqual({ licence: 'CC BY-SA 3.0', inferred: false });
    expect(licenceFromRights({ url: 'https://www.fandom.com/licensing', text: 'CC-BY-SA' }, 'fandom')).toEqual({ licence: 'CC BY-SA 3.0', inferred: true });
  });

  it('refuses non-BY-SA licences', () => {
    expect(() => licenceFromRights({ url: 'https://creativecommons.org/licenses/by-nc-sa/3.0/', text: 'CC BY-NC-SA' }, 'fandom')).toThrow(/not CC BY-SA/);
    expect(() => licenceFromRights({ url: '', text: 'All rights reserved' }, 'fandom')).toThrow();
  });
});
