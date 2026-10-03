import { mkdtemp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { artAlt, artPrompt, hash, initials, portraitSpec } from '../../src/lib/art';
import { generateArt, type ImageProvider } from '../../scripts/art/generate';

describe('placeholder portraits', () => {
  it('is deterministic per slug and varies between slugs', () => {
    expect(portraitSpec('gojo-satoru', 'Satoru Gojo')).toEqual(portraitSpec('gojo-satoru', 'Satoru Gojo'));
    expect(hash('a')).not.toBe(hash('b'));
    expect(portraitSpec('a', 'A B')).not.toEqual(portraitSpec('b', 'A B'));
  });

  it('keeps the sigil inside the 120x160 viewBox', () => {
    for (const slug of ['a', 'gojo-satoru', 'x'.repeat(40), 'ryomen-sukuna']) {
      const s = portraitSpec(slug, 'Test Name');
      expect(s.cx).toBeGreaterThanOrEqual(50);
      expect(s.cx).toBeLessThanOrEqual(70);
      expect(s.cy).toBeGreaterThanOrEqual(62);
      expect(s.cy).toBeLessThanOrEqual(78);
      expect(s.rings.length).toBeGreaterThanOrEqual(3);
      expect(s.rings).toEqual([...s.rings].sort((a, b) => a - b));
    }
  });

  it('builds initials', () => {
    expect(initials('Megumi Fushiguro')).toBe('MF');
    expect(initials('Mahito')).toBe('MA');
    expect(initials('')).toBe('?');
  });
});

describe('art prompt', () => {
  const c = { name: { en: 'Megumi Fushiguro' }, accent: '#5b8cff' };
  it('is built from our own record only and forbids text', () => {
    const p = artPrompt(c);
    expect(p).toContain('Megumi Fushiguro');
    expect(p).toContain('#5b8cff');
    expect(p).toContain('no text');
    expect(artAlt(c)).toBe('AI-generated portrait of Megumi Fushiguro');
  });
});

describe('generateArt', () => {
  async function setup() {
    const root = await mkdtemp(path.join(tmpdir(), 'art-'));
    await mkdir(path.join(root, 'content/characters'), { recursive: true });
    for (const slug of ['aaa', 'bbb']) {
      await writeFile(
        path.join(root, `content/characters/${slug}.json`),
        JSON.stringify({ slug, name: { en: slug.toUpperCase() }, summary: [{ value: 'x', level: 'none' }] }),
      );
    }
    return root;
  }
  const ok: ImageProvider = { model: 'test-model', generate: async () => Buffer.from('img') };

  it('writes the image and the art field, then skips on the next run', async () => {
    const root = await setup();
    const log = () => {};
    const first = await generateArt({ root, provider: ok, log });
    expect(first.generated).toEqual(['aaa', 'bbb']);
    const rec = JSON.parse(await readFile(path.join(root, 'content/characters/aaa.json'), 'utf8'));
    expect(rec.art).toMatchObject({ src: '/art/aaa.webp', model: 'test-model' });
    await access(path.join(root, 'public/art/aaa.webp'));
    const second = await generateArt({ root, provider: ok, log });
    expect(second.generated).toEqual([]);
  });

  it('dry run writes nothing', async () => {
    const root = await setup();
    const result = await generateArt({ root, provider: ok, dryRun: true, log: () => {} });
    expect(result.generated).toEqual([]);
    await expect(access(path.join(root, 'public/art'))).rejects.toThrow();
  });

  it('a provider failure leaves content untouched and is reported', async () => {
    const root = await setup();
    const bad: ImageProvider = { model: 'm', generate: async () => { throw new Error('boom'); } };
    const result = await generateArt({ root, provider: bad, only: ['aaa'], log: () => {} });
    expect(result.failed).toEqual([{ slug: 'aaa', error: 'boom' }]);
    const rec = JSON.parse(await readFile(path.join(root, 'content/characters/aaa.json'), 'utf8'));
    expect(rec.art).toBeUndefined();
  });
});
