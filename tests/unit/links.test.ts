import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { communityLink, type CommunityLink } from '../../src/content/schemas';
import { findDanglingLinks, findDuplicateLinks, linksFor } from '../../src/lib/links';

const valid = {
  id: 'shibuya-discussion',
  url: 'https://www.reddit.com/r/JuJutsuKaisen/comments/abc123/example_thread/',
  label: 'Reactions to the Shibuya Incident finale',
  note: 'A long thread of first-watch reactions, useful for a sense of how the arc landed.',
  community: 'r/JuJutsuKaisen',
  targets: ['shibuya-incident'],
  level: 'anime-s2',
  addedAt: '2026-10-04',
  verifiedAt: '2026-10-04',
};
const link = (over: Record<string, unknown> = {}) => communityLink.parse({ ...valid, ...over });
const rejects = (over: Record<string, unknown>) => communityLink.safeParse({ ...valid, ...over }).success;

describe('communityLink schema', () => {
  it('accepts a well-formed Reddit link', () => {
    expect(communityLink.safeParse(valid).success).toBe(true);
  });

  it('only allows https links to Reddit', () => {
    expect(rejects({ url: 'http://www.reddit.com/r/JuJutsuKaisen/comments/abc123/x/' })).toBe(false);
    expect(rejects({ url: 'https://example.com/r/JuJutsuKaisen/comments/abc123/x/' })).toBe(false);
    expect(rejects({ url: 'https://www.reddit.com.evil.example/r/JuJutsuKaisen/' })).toBe(false);
    expect(rejects({ url: 'https://twitter.com/someone/status/1' })).toBe(false);
  });

  it('requires the URL to sit under the stated subreddit, ignoring case', () => {
    expect(rejects({ community: 'r/manga' })).toBe(false);
    expect(rejects({ url: 'https://www.reddit.com/user/someone/comments/abc123/x/' })).toBe(false);
    expect(rejects({ url: 'https://www.reddit.com/r/jujutsukaisen/comments/abc123/x/' })).toBe(true);
  });

  it('needs at least one target, a valid level and sane dates', () => {
    expect(rejects({ targets: [] })).toBe(false);
    expect(rejects({ level: 'everything' })).toBe(false);
    expect(rejects({ addedAt: '2026-10-05', verifiedAt: '2026-10-04' })).toBe(false);
    expect(rejects({ verifiedAt: 'yesterday' })).toBe(false);
  });

  it('bounds our own wording so a thread title or excerpt is not pasted in whole', () => {
    expect(rejects({ label: 'x'.repeat(101) })).toBe(false);
    expect(rejects({ note: 'x'.repeat(201) })).toBe(false);
  });
});

describe('link helpers', () => {
  const links: CommunityLink[] = [link(), link({ id: 'gojo-thread', url: 'https://www.reddit.com/r/JuJutsuKaisen/comments/def456/y/', targets: ['gojo-satoru', 'shibuya-incident'] })];

  it('lists a link on every page it targets', () => {
    expect(linksFor(links, 'shibuya-incident').map((l) => l.id)).toEqual(['shibuya-discussion', 'gojo-thread']);
    expect(linksFor(links, 'gojo-satoru').map((l) => l.id)).toEqual(['gojo-thread']);
    expect(linksFor(links, 'mahito')).toEqual([]);
  });

  it('finds targets that are neither an arc nor a character', () => {
    const ix = { arcs: new Map([['shibuya-incident', {}]]), characters: new Map([['gojo-satoru', {}]]) } as never;
    expect(findDanglingLinks(links, ix)).toEqual([]);
    expect(findDanglingLinks([link({ targets: ['nowhere'] })], ix)).toEqual([{ id: 'shibuya-discussion', target: 'nowhere' }]);
  });

  it('flags a duplicate id or the same thread listed twice', () => {
    expect(findDuplicateLinks(links)).toEqual([]);
    expect(findDuplicateLinks([link(), link()])).toEqual(['id:shibuya-discussion', 'url:https://www.reddit.com/r/jujutsukaisen/comments/abc123/example_thread']);
    const sameThread = link({ id: 'other', url: 'https://WWW.reddit.com/r/JuJutsuKaisen/comments/abc123/example_thread' });
    expect(findDuplicateLinks([link(), sameThread]).some((d) => d.startsWith('url:'))).toBe(true);
  });
});

describe('content/links/community.json', () => {
  const root = join(import.meta.dirname, '../../content');
  const raw = JSON.parse(readFileSync(join(root, 'links/community.json'), 'utf8')) as unknown[];
  const links = raw.map((l) => communityLink.parse(l));
  const known = new Set(
    ['arcs', 'characters'].flatMap((dir) =>
      readdirSync(join(root, dir))
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, '')),
    ),
  );

  it('is a list of valid links', () => expect(Array.isArray(raw)).toBe(true));
  it('has unique ids and URLs', () => expect(findDuplicateLinks(links)).toEqual([]));
  it('only targets arcs and characters that exist', () => {
    for (const l of links) for (const t of l.targets) expect(known.has(t), `${l.id} -> ${t}`).toBe(true);
  });
});
