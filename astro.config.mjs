// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://jjk-nextgen-wiki.pages.dev',
  output: 'static',
  integrations: [svelte()],
  vite: { plugins: [tailwindcss()] },
});
