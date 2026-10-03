import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { rewriteCss, rewriteHtml } from './relativize.mjs';

/** Copies dist/ to preview/site with every URL made relative. Run after `pnpm build`. */
const src = path.resolve('dist');
const out = path.resolve('preview/site');

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

await stat(src).catch(() => {
  console.error('dist/ not found. Run `pnpm build` first.');
  process.exit(1);
});
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(src, out, { recursive: true });

let html = 0;
let css = 0;
for await (const file of walk(out)) {
  const rel = path.relative(out, file).split(path.sep).join('/');
  if (file.endsWith('.html')) {
    await writeFile(file, rewriteHtml(await readFile(file, 'utf8'), rel));
    html++;
  } else if (file.endsWith('.css')) {
    await writeFile(file, rewriteCss(await readFile(file, 'utf8'), rel));
    css++;
  }
}
console.log(`preview/site ready: ${html} pages, ${css} stylesheets rewritten`);
