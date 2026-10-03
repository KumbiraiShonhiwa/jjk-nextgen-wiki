# 05 · Tech Stack & Architecture Decision Records

Status: Draft v1 · 2026-10-03 · Versions checked on npm the same day.

## System architecture

```
 Wikipedia API ─┐                                          ┌─> Cloudflare Pages (CDN)
                ├─> scripts/ingest (TS CLI) ─> content/*.json ─> Astro build ─┤
 Fandom API ────┘     weekly GitHub Action        (git, PR-reviewed)          └─> Pagefind index
```

Fully static output. No server, no database at runtime. All interactivity is client-side islands.

---

## ADR-001 · Framework: Astro

- **Context:** read-heavy encyclopedia with rich motion on top; JS budget ≤ 120 KB gzip per route (doc 10).
- **Decision:** Astro 7.3, static output, content collections, View Transitions.
- **Alternatives:** Next.js 16 + React 19 (bigger runtime, hydration of whole trees, Strict Mode double-invokes effects that create animations); SvelteKit 3 (strong, but weaker content tooling).
- **Consequences:** pages are HTML-first; animated parts are islands. Team must think in islands. Moving to app-like features (accounts) later would favour adding a server adapter, not a rewrite.

## ADR-002 · Animation: Anime.js 4.5 as the only motion engine

- **Context:** the project's defining goal is expert-level Anime.js motion.
- **Decision:** Anime.js 4.5.0, ES-module subpath imports (`animejs/timeline`, `animejs/svg`, `animejs/text`, `animejs/layout`, `animejs/draggable`, `animejs/scope`, `animejs/waapi`, `animejs/adapters/three`), wrapped by an in-repo `src/motion/` library.
- **Alternatives:** GSAP (would split the motion system); Motion/Framer Motion (React-bound); CSS-only (no timelines, scroll scrubbing, SVG morphing or draggable physics).
- **Consequences:** one engine, one easing vocabulary. v5 (beta 5.0.0-beta.2) is evaluated when stable; the wrapper limits upgrade blast radius to `src/motion/`.

## ADR-003 · Interactive islands: Svelte 5

- **Context:** a few components need state (filters, spoiler control, search palette, graph).
- **Decision:** Svelte 5.57 islands; plain Astro components plus vanilla TS for everything else.
- **Rule:** Anime.js instances are created inside `createScope({ root })` in a Svelte `$effect` (or an Astro `<script>`), and reverted in its cleanup / on `astro:before-swap`.
- **Alternatives:** React islands (larger runtime), Preact (smaller, but React-style effect pitfalls), vanilla web components (more boilerplate).

## ADR-004 · Styling: Tailwind CSS 4 + CSS custom-property tokens

- **Decision:** Tailwind 4.3 with the design tokens (doc 06) defined once as CSS variables, consumed by Tailwind's theme and read by Anime.js.
- **Alternatives:** vanilla CSS modules (fine, more verbose); CSS-in-JS (runtime cost).

## ADR-005 · Content storage and validation

- **Decision:** JSON files in `content/`, committed to git, validated by Zod 4.6 schemas, loaded as Astro content collections.
- **Alternatives:** headless CMS (no editors need it), SQLite at build time (overkill), fetching live from the wikis at build (non-reproducible, hammers the APIs).
- **Consequences:** every content change is a reviewable diff; builds are reproducible offline.

## ADR-006 · Search: Pagefind

- **Decision:** Pagefind 1.5 static index generated after the Astro build; one index per spoiler level via filters.
- **Alternatives:** Algolia (hosted, cost, external dependency); Fuse.js (whole index in JS bundle).

## ADR-007 · 3D: Three.js in the home hero only

- **Decision:** Three.js r186, loaded lazily on the home page after LCP, driven by the Anime.js Three adapter so DOM and WebGL share one timeline. Disabled under `prefers-reduced-motion` and on low-memory devices (`navigator.deviceMemory < 4`), with a static SVG fallback.
- **Alternatives:** no 3D (simpler); 3D on domain pages (budget risk, revisit after v1).

## ADR-008 · Hosting: Cloudflare Pages

- **Decision:** static deploy to Cloudflare Pages from `main`; preview deploys per PR.
- **Alternatives:** Vercel, Netlify (equivalent for static sites).

## ADR-009 · Language and tooling

- TypeScript 6 in strict mode (7 once `@astrojs/svelte` supports it), pnpm, ESLint + Prettier, Vitest (unit), Playwright (e2e, visual), Lighthouse CI and a bundle-size check in GitHub Actions.

## ADR-010 · Code and content licences

- Code under MIT; `content/` and rendered text under CC BY-SA 4.0 (doc 03).

---

## Repository layout

```
docs/                    these documents
scripts/ingest/          scraper CLI
content/                 validated JSON (CC BY-SA)
src/
  content/schemas/       Zod schemas
  motion/                Anime.js wrapper: presets, eases, reduced-motion fallbacks
  components/            Astro + Svelte components
  layouts/  pages/  styles/
tests/                   unit, e2e, visual
.github/workflows/       ci.yml, content-sync.yml
```

## Pending

Any ADR changes status from Proposed to Accepted once the related open question in the foundation plan is answered.
