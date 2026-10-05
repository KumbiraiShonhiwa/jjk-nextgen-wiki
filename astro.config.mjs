// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import { aliasRedirects } from './scripts/aliases.mjs';

export default defineConfig({
  site: 'https://jjk-nextgen-wiki.pages.dev',
  output: 'static',
  // Doc 04: an alias is a second URL for a record, so /characters/gojo reaches Satoru Gojo.
  // Built from each record's `aliases`; throws on a collision rather than dropping a redirect.
  redirects: aliasRedirects(),
  integrations: [svelte()],
  vite: { plugins: [tailwindcss()] },
});
