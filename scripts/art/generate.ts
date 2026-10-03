import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { artAlt, artPrompt } from '../../src/lib/art';
import { character } from '../../src/content/schemas';

export interface ImageProvider {
  readonly model: string;
  /** Returns encoded image bytes (webp). */
  generate(prompt: string): Promise<Buffer>;
}

/** OpenAI Images API. Swap this class to change provider; nothing else depends on it. */
export class OpenAIProvider implements ImageProvider {
  constructor(
    private apiKey: string,
    readonly model = process.env.ART_MODEL ?? 'gpt-image-1',
  ) {}

  async generate(prompt: string): Promise<Buffer> {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, prompt, size: '1024x1536', n: 1, output_format: 'webp', output_compression: 82 }),
    });
    if (!res.ok) throw new Error(`Image API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = body.data?.[0]?.b64_json;
    if (!b64) throw new Error('Image API returned no image');
    return Buffer.from(b64, 'base64');
  }
}

export interface Options {
  root: string;
  provider?: ImageProvider;
  only?: string[];
  force?: boolean;
  dryRun?: boolean;
  log?: (line: string) => void;
}

export interface Result {
  generated: string[];
  skipped: string[];
  failed: { slug: string; error: string }[];
}

/** Generates portraits for characters without one, writing public/art/<slug>.webp and the `art` field. */
export async function generateArt(opts: Options): Promise<Result> {
  const log = opts.log ?? console.log;
  const dir = path.join(opts.root, 'content/characters');
  const result: Result = { generated: [], skipped: [], failed: [] };
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();

  for (const file of files) {
    const full = path.join(dir, file);
    const raw = JSON.parse(await readFile(full, 'utf8'));
    const c = character.parse(raw);
    if ((opts.only && !opts.only.includes(c.slug)) || (c.art && !opts.force)) {
      result.skipped.push(c.slug);
      continue;
    }
    const prompt = artPrompt(c);
    if (opts.dryRun || !opts.provider) {
      log(`[dry-run] ${c.slug}: ${prompt}`);
      result.skipped.push(c.slug);
      continue;
    }
    try {
      const bytes = await opts.provider.generate(prompt);
      const src = `/art/${c.slug}.webp`;
      await mkdir(path.join(opts.root, 'public/art'), { recursive: true });
      await writeFile(path.join(opts.root, 'public', src), bytes);
      raw.art = { src, alt: artAlt(c), model: opts.provider.model, prompt, generatedAt: new Date().toISOString() };
      await writeFile(full, JSON.stringify(raw, null, 2) + '\n');
      result.generated.push(c.slug);
      log(`generated ${c.slug}`);
    } catch (e) {
      // A failed image never touches content/: the placeholder keeps working.
      result.failed.push({ slug: c.slug, error: (e as Error).message });
      log(`failed ${c.slug}: ${(e as Error).message}`);
    }
  }
  return result;
}
