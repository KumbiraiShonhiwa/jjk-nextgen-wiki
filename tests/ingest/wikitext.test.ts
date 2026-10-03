// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  extractLinks, findInfobox, findTemplates, paragraphs, parseTemplate, splitList, splitSections, splitTopLevel, stripRefs, toPlainText, truncate,
} from '../../scripts/ingest/wikitext.ts';
import { fixturePage } from './helpers.ts';

describe('splitTopLevel', () => {
  it('ignores pipes inside templates, links, comments, nowiki and refs', () => {
    const s = 'a|{{t|x|y}}|[[L|label]]|<!-- c|d -->e|<nowiki>|</nowiki>|<ref>r|s</ref>f|g';
    expect(splitTopLevel(s)).toEqual(['a', '{{t|x|y}}', '[[L|label]]', '<!-- c|d -->e', '<nowiki>|</nowiki>', '<ref>r|s</ref>f', 'g']);
  });
});

describe('templates', () => {
  it('parses named and positional params, with nested templates and links in values', () => {
    const t = parseTemplate('{{Character Infobox\n|name = Satoru Gojo\n| Japanese_Name = {{lang|ja|五条 悟}}\n|affiliation=[[A|B]]<br>[[C]]\n|positional\n|eq = a=b\n}}');
    expect(t.name).toBe('Character Infobox');
    expect(t.key).toBe('character infobox');
    expect(t.params.get('name')).toBe('Satoru Gojo');
    expect(t.params.get('japanese name')).toBe('{{lang|ja|五条 悟}}');
    expect(t.params.get('affiliation')).toBe('[[A|B]]<br>[[C]]');
    expect(t.params.get('1')).toBe('positional');
    expect(t.params.get('eq')).toBe('a=b');
  });

  it('does not treat = inside a nested template or link as the param separator', () => {
    const t = parseTemplate('{{X|{{Y|k=v}}|[[a=b|c]]}}');
    expect(t.params.get('1')).toBe('{{Y|k=v}}');
    expect(t.params.get('2')).toBe('[[a=b|c]]');
  });

  it('finds top-level templates only, skipping comments and triple-brace params', () => {
    const text = '{{A|{{B}}}} <!-- {{C}} --> {{{param|x}}} {{D}}';
    expect(findTemplates(text).map((t) => t.name)).toEqual(['A', 'D']);
  });

  it('picks the infobox over a leading maintenance template', () => {
    const { wikitext } = fixturePage('Satoru Gojo');
    const ib = findInfobox(wikitext)!;
    expect(ib.name).toBe('Character Infobox');
    expect(ib.params.get('kanji')).toBe('五条 悟');
    // The <gallery> in |image= contains pipes; they must not split the infobox.
    expect(ib.params.get('romaji')).toBe('Gojō Satoru');
    expect(ib.params.get('height')).toMatch(/^190 cm<ref/);
  });

  it('accepts "Infobox character" word order', () => {
    expect(findInfobox(fixturePage('Megumi Fushiguro').wikitext)!.name).toBe('Infobox character');
  });

  it('falls back to the first template with three named params', () => {
    expect(findInfobox('{{Stub}}\n{{Card|a=1|b=2|c=3}}')!.name).toBe('Card');
    expect(findInfobox('{{Stub}} text')).toBeUndefined();
  });
});

describe('toPlainText', () => {
  it('renders links, drops refs, files, categories and interlanguage links', () => {
    const w = "He is a [[Jujutsu Sorcerer#Grades|special grade]] [[jujutsu sorcerer]]s.<ref name=\"a\">Ch. 1 {{cite|x}}</ref><ref name=\"a\" /> [[File:X.png|thumb|A [[nested]] caption]][[Category:Characters]][[es:Satoru Gojo]]";
    expect(toPlainText(w)).toBe('He is a special grade jujutsu sorcerers.');
  });

  it('expands nihongo and lang sensibly', () => {
    expect(toPlainText("{{Nihongo|'''Satoru Gojo'''|五条 悟|Gojō Satoru}} is a sorcerer.")).toBe('Satoru Gojo is a sorcerer.');
    expect(toPlainText('Limitless ({{nihongo||無下限呪術|Mukagen Jujutsu}}) is')).toBe('Limitless (Mukagen Jujutsu) is');
    expect(toPlainText("'''Unlimited Void''' ({{nihongo|Unlimited Void|無量空処|Muryōkūsho}}) is")).toBe('Unlimited Void is');
    expect(toPlainText('Yuji ({{lang|ja|虎杖 悠仁}}, \'\'Itadori Yūji\'\') is')).toBe('Yuji (虎杖 悠仁, Itadori Yūji) is');
  });

  it('drops unknown and citation templates without leaving stray spaces', () => {
    expect(toPlainText('A clan.{{Citation needed|date=May 2024}} Next {{Main|X}}sentence , here .')).toBe('A clan. Next sentence, here.');
  });

  it('handles <br>, comments, bold/italic, entities, tables and external links', () => {
    const w = "''Italic'' and '''bold'''<!-- hidden -->&nbsp;&amp; [https://example.org site] [https://bare.example]<br/>next\n{| class=\"wikitable\"\n| cell\n|}\nafter";
    expect(toPlainText(w)).toBe('Italic and bold & site\nnext after'.replace('\n', ' '));
  });

  it('keeps paragraphs apart and joins wrapped lines', () => {
    expect(paragraphs(toPlainText('one\ntwo\n\nthree'))).toEqual(['one two', 'three']);
  });

  it('removes <references/> and galleries', () => {
    expect(toPlainText('x<references/><gallery>\nA.png|cap\n</gallery>y')).toBe('xy');
  });
});

describe('stripRefs', () => {
  it('removes paired, self-closing and attribute refs', () => {
    expect(stripRefs('a<ref>1</ref>b<ref name="n"/>c<REF group="g">2</REF>d')).toBe('abcd');
  });
});

describe('extractLinks', () => {
  it('returns article links with labels and skips namespaces', () => {
    expect(extractLinks('[[Tokyo Prefectural Jujutsu High School|Tokyo Jujutsu High]]<br>[[gojo Clan]] [[File:x.png]] [[Category:Y]]')).toEqual([
      { target: 'Tokyo Prefectural Jujutsu High School', label: 'Tokyo Jujutsu High' },
      { target: 'Gojo Clan', label: 'gojo Clan' },
    ]);
  });
});

describe('splitList', () => {
  it('splits on <br> variants and notes trailing parentheticals', () => {
    const items = splitList('[[Zenin Clan]] (formerly)<br />Grade 1<BR>[[A]], [[B]]');
    expect(items.map((i) => i.text)).toEqual(['Zenin Clan (formerly)', 'Grade 1', 'A', 'B']);
    expect(items[0].note).toBe('formerly');
    expect(items[0].links[0].target).toBe('Zenin Clan');
  });

  it('unwraps {{ubl}} and keeps commas inside plain text', () => {
    expect(splitList('{{ubl|Grade 2|Semi-Grade 1 (after the [[Shibuya Incident Arc|Shibuya Incident]])}}').map((i) => i.text)).toEqual([
      'Grade 2',
      'Semi-Grade 1 (after the Shibuya Incident)',
    ]);
    expect(splitList('December 7, 1989').map((i) => i.text)).toEqual(['December 7, 1989']);
  });

  it('drops refs inside values', () => {
    expect(splitList('Deceased<ref>Chapter 236</ref>').map((i) => i.text)).toEqual(['Deceased']);
  });
});

describe('splitSections', () => {
  it('splits lead and nested headings with their ancestor path', () => {
    const secs = splitSections(fixturePage('Satoru Gojo').wikitext);
    expect(secs[0].heading).toBe('');
    expect(secs.map((s) => s.heading)).toEqual([
      '', 'Appearance', 'Personality', 'History', 'Hidden Inventory Arc', 'Shibuya Incident Arc', 'Shinjuku Showdown Arc', 'Abilities and Powers', 'Trivia', 'References',
    ]);
    expect(secs.find((s) => s.heading === 'Shibuya Incident Arc')!.path).toEqual(['History', 'Shibuya Incident Arc']);
    expect(secs.find((s) => s.heading === 'Abilities and Powers')!.path).toEqual(['Abilities and Powers']);
  });

  it('ignores = signs that are not headings and headings inside comments', () => {
    const secs = splitSections('lead a = b\n<!--\n==Hidden==\n-->\n== Real ==\nbody\n=== Sub ===   <!-- c -->\nsub');
    expect(secs.map((s) => [s.heading, s.depth])).toEqual([['', 0], ['Real', 2], ['Sub', 3]]);
    expect(secs[0].wikitext).toBe('lead a = b');
  });
});

describe('truncate', () => {
  it('cuts at a sentence boundary', () => {
    const s = `${'A'.repeat(300)}. ${'B'.repeat(300)}. ${'C'.repeat(300)}.`;
    expect(truncate(s, 700)).toBe(`${'A'.repeat(300)}. ${'B'.repeat(300)}.`);
    expect(truncate('short', 700)).toBe('short');
  });
});
