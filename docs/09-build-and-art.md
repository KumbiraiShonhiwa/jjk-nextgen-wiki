# 09 · Build, run and art guide

How to run the site locally, build it, ship it, and generate character art. Keep this as the single "how do I" page; the other docs explain *why*.

## Requirements

- Node 22, pnpm 10 (`corepack enable` picks the pinned version).
- Chromium for the browser tests: `pnpm exec playwright install chromium` (once).

## Run it

```sh
pnpm install
pnpm dev                 # http://localhost:4321, hot reload; search is disabled (no index yet)
pnpm build               # astro build, then Pagefind indexes dist/
pnpm preview             # serves dist/ at http://localhost:4321 with working search
```

`pnpm build` is what CI and the deploy run. Always check search and anything involving spoiler levels against `pnpm preview`, not `pnpm dev`.

## Check it

```sh
pnpm check               # Astro + TypeScript
pnpm test                # unit tests (Vitest)
pnpm budgets             # per-route bundle budgets, after a build
pnpm test:e2e            # Playwright incl. axe accessibility; needs a build first
```

If a preinstalled Chromium does not match Playwright, point `PW_CHROMIUM_PATH` at its binary. See doc 06 for what each CI job enforces.

## Content

- `pnpm ingest` pulls from the Fandom API into `content/` with provenance; `pnpm ingest:offline` uses fixtures. A weekly workflow opens a PR with the result (doc 03, doc 06).
- Review spoiler levels of new text in `content/meta/spoiler-overrides.json`.

## Generating character art

Characters show a 3:4 portrait. Until real art exists, a deterministic generative portrait is drawn instead. Real art is AI-generated and always labelled "AI-generated" on the page.

### One-time setup

1. Create an API key with an image-capable account (the built-in adapter is OpenAI's Images API, model `gpt-image-1`).
2. Export it in your shell only. Never commit it, never put it in a workflow file or in `content/`:

   ```sh
   export OPENAI_API_KEY=sk-...
   ```

### Generate

```sh
pnpm art --dry-run                 # print the prompts, write nothing (default when no key is set)
pnpm art --only=gojo-satoru        # one character
pnpm art                              # every character without art
pnpm art --force --only=mahito     # regenerate an existing portrait
```

Optional: `ART_MODEL=<model>` overrides the model.

What it does for each character:

1. Builds the prompt from our own record only (`artPrompt` in `src/lib/art.ts`): name, accent colour and a fixed house style (dark-fantasy key art, ink background, one cursed-energy glow, no text or logos). Scraped prose is never fed to the model.
2. Calls the provider, writes `public/art/<slug>.webp` (1024x1536, compressed).
3. Writes an `art` record into `content/characters/<slug>.json`: `src`, `alt`, `model`, `prompt`, `generatedAt`. That record is the provenance.
4. On any error it reports the failure, writes nothing, and the placeholder keeps working. The command exits non-zero if any character failed.

### Review and ship

1. `pnpm build && pnpm preview` and look at `/characters` and a few character pages.
2. Reject poor results: delete the `art` block from the JSON and the file in `public/art/`, then regenerate that one with `--force --only=<slug>`.
3. Check the images for anything that looks like a copy of official artwork, embedded text or a watermark. The site is an unofficial fan encyclopedia; only publish art you are comfortable standing behind.
4. Commit `public/art/` and `content/characters/` on a feature branch and open a PR like any other change. Keep each PR small (a handful of characters) because images are large.

### Notes

- Cost scales with the number of characters; use `--only` while you iterate on the prompt style.
- To change the house style, edit `STYLE` in `src/lib/art.ts`; unit tests cover the prompt contract.
- To use another provider, implement the small `ImageProvider` interface in `scripts/art/generate.ts` (`model` and `generate(prompt): Promise<Buffer>`) and construct it in `scripts/art/cli.ts`. Nothing else depends on the provider.
- Add an image size or count budget to CI later if `public/art/` grows large.

## Deploying

Merging `stable → main` triggers the deploy workflow, which publishes `dist/` to Cloudflare Pages when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set (doc 06).


## Static preview bundle

`pnpm build && pnpm preview:static` writes `preview/site/` (git-ignored): a copy of `dist/` where every URL is relative and every directory link points at an explicit `index.html`, so it works from any folder on a plain file host with no directory-index support. It also drops the client-side router (relative URLs break when documents are swapped at different depths), so navigation is a full page load.

`node scripts/preview/verify.mjs` serves the bundle from a nested path with no index fallback and drives it (home, navigation, a character page, the graph, search). It fails on any 404 or any request outside the prefix. Run it with `PW_CHROMIUM_PATH=/path/to/chromium` if Playwright's own Chromium is not installed.

Hosts that only serve web file types (no `.pf_*` Pagefind index files) cannot run search from this bundle; everything else works.
