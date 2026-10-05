import { describe, expect, it } from 'vitest';
import { escapeHtml, linkFirstMentions, type GlossaryTerm } from '../../src/lib/glossary';

const term = (slug: string, name: string, level: GlossaryTerm['level'] = 'none', aliases: string[] = []): GlossaryTerm => ({
  slug,
  name,
  aliases,
  level,
  definition: `What ${name} means.`,
});

const TERMS = [
  term('cursed-energy', 'Cursed energy'),
  term('domain-expansion', 'Domain Expansion', 'anime-s1', ['domain']),
  term('binding-vow', 'Binding Vow', 'anime-s1', ['binding vows']),
  term('heavenly-restriction', 'Heavenly Restriction', 'manga'),
];

describe('escapeHtml', () => {
  it('escapes everything that could start an element or break an attribute', () => {
    expect(escapeHtml(`<img src="x" onerror='y'>&`)).toBe('&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt;&amp;');
  });
});

describe('linkFirstMentions', () => {
  it('marks a term and leaves the rest of the sentence as text', () => {
    const html = linkFirstMentions('He spends cursed energy freely.', TERMS, new Set());
    expect(html).toContain('popovertarget="gloss-cursed-energy"');
    expect(html).toContain('>cursed energy</button>');
    expect(html).toContain('He spends ');
    expect(html).toContain(' freely.');
  });

  it('links a term once per page, across paragraphs', () => {
    const seen = new Set<string>();
    const first = linkFirstMentions('Cursed energy is everywhere.', TERMS, seen);
    const second = linkFirstMentions('More cursed energy here.', TERMS, seen);
    expect(first).toContain('term-trigger');
    expect(second).not.toContain('term-trigger');
    expect(second).toBe('More cursed energy here.');
  });

  it('prefers the longest spelling, so "Domain Expansion" beats "domain"', () => {
    const html = linkFirstMentions('He opened a Domain Expansion.', TERMS, new Set(), 'manga');
    expect(html).toContain('>Domain Expansion</button>');
    expect(html).not.toContain('>Domain</button>');
  });

  it('matches an alias and keeps the text as written', () => {
    const html = linkFirstMentions('They traded binding vows.', TERMS, new Set(), 'manga');
    expect(html).toContain('>binding vows</button>');
  });

  it('matches whole words only', () => {
    expect(linkFirstMentions('Undomainlike behaviour.', TERMS, new Set(), 'manga')).toBe('Undomainlike behaviour.');
  });

  it('never links a term above the level of the text it appears in', () => {
    // Naming the mechanic would tell an anime-s1 reader that it exists.
    const html = linkFirstMentions('A Heavenly Restriction explains it.', TERMS, new Set(), 'anime-s1');
    expect(html).not.toContain('term-trigger');
    expect(html).toBe('A Heavenly Restriction explains it.');
  });

  it('escapes the record text, so content cannot inject an element', () => {
    const html = linkFirstMentions('<script>alert(1)</script> cursed energy', TERMS, new Set());
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes around a match as well as before it', () => {
    const html = linkFirstMentions('a <b> cursed energy <i> b', TERMS, new Set());
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('&lt;i&gt;');
  });

  it('returns escaped text unchanged when nothing matches', () => {
    expect(linkFirstMentions('Nothing to see.', TERMS, new Set())).toBe('Nothing to see.');
  });
});
