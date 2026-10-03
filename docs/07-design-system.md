# 07 · Design System

Status: v1 · 2026-10-03 · Source of truth: `src/styles/global.css` (tokens), `src/components/` (components).

Manga ink with cursed-energy accents: near-black ink surfaces with a faint paper grain, warm off-white type, and blue/violet cursed energy used sparingly for focus, interaction and meaning. Light "paper" mode follows the OS preference.

## Tokens

All tokens are CSS custom properties on `:root`, exposed to Tailwind through `@theme inline`, so `bg-ink-2`, `text-paper-dim`, `text-step-3` and Anime.js (`animate(el, { color: 'var(--ce-blue)' })`) read the same values.

| Group | Tokens | Notes |
| --- | --- | --- |
| Surfaces | `--ink`, `--ink-2`, `--ink-3`, `--line` | Three elevation steps plus hairline borders |
| Text | `--paper`, `--paper-dim` | Body ≥ 4.5:1 contrast on every surface in both themes |
| Cursed energy | `--ce-blue`, `--ce-violet`, `--ce-red`, `--ce-glow` | Blue = interactive/focus, violet = techniques, red = danger/special grade |
| Type scale | `--step--1` … `--step-5` | 1.25 modular scale; steps 3–5 are fluid with `clamp()` |
| Radius | `--radius-sm/md/lg` | 6 / 12 / 20 px |
| Elevation | `--shadow-1`, `--shadow-glow` | Inset highlight + soft drop; glow only on focus/active |
| Motion | `--dur-xs/sm/md/lg`, `--ease-enter` | Mirrors `src/motion/tokens.ts` |

Per-entity theming: each character carries an `accent` colour (ours, not sourced) set as `--accent` on the page and its cards.

## Typography

- **Display:** Zen Antique (self-hosted via `@fontsource/zen-antique`): brush-like serif for names and headings, Latin and Japanese.
- **Body:** Inter Variable (`@fontsource-variable/inter`) with `cv11`/`ss01` for a cleaner single-storey a.
- Japanese names render with `lang="ja"`; headings never go below `--step-2`.
- Fonts are self-hosted: no third-party requests, no layout shift from late font swaps.

## Layout

- Max content width 72rem (`max-w-6xl`), 16 px side gutters.
- Entity pages: two columns on `lg` (content 2fr, aside 1fr), single column below.
- Grids: 1 → 2 (`sm`) → 4 (`lg`) columns for cards.

## Components

| Component | Purpose | States |
| --- | --- | --- |
| `Gated` | Wraps any content at a spoiler level; renders a dashed placeholder when hidden | visible, redacted, revealing (animated) |
| `GatedText` | A list of gated paragraphs | per paragraph |
| `EntityCard` | Link card for any entity; accent bar, cursor-tracking glow, 3D tilt | rest, hover (glow + tilt), focus ring, gated |
| `Badge` | Grades, kinds, status | neutral, blue, violet, red |
| `SiteHeader` | Primary nav, spoiler control, mobile menu | current page via `aria-current` |
| `SpoilerControl` | Segmented radio group for the spoiler level; sliding indicator | per option; arrow keys move selection |
| `Sources` | CC BY-SA attribution from provenance; placeholder note for fixtures | sourced, fixture |
| `Sigil` | Original line-art seal drawn stroke by stroke | drawn, static (reduced motion) |

## Spoiler gating

Every level ships in the HTML. An inline head script sets `html[data-spoiler]` from `localStorage` before first paint (and again after every client-side navigation), and CSS rules hide `[data-level]` above the setting while showing the matching `[data-redacted]` placeholder. With JavaScript off, the default is Anime S1. Page titles, descriptions and link previews only ever use level `none` values.

## Accessibility rules

- Visible focus ring (`--ce-blue`, 2 px, offset 3 px) on every interactive element; skip link to `#main`.
- The spoiler control is a proper `radiogroup` with roving tabindex and arrow-key support.
- Split text keeps an accessible copy (Anime.js `splitText` adds a visually hidden original and marks pieces `aria-hidden`).
- Placeholders carry a `title` explaining how to reveal; hidden content is `display: none`, so screen readers never read spoilers either.

## Character art

Every character shows a 3:4 portrait (`CharacterArt.astro`).

- **Placeholder:** until real art exists, a deterministic generative portrait is drawn from the slug (rings, crossing blade lines, monogram) in the character's accent colour. It is decorative (`aria-hidden`).
- **AI-generated art:** `OPENAI_API_KEY=... pnpm art` (optionally `--only=slug,slug`, `--force`, `--dry-run`) generates `public/art/<slug>.webp` and writes an `art` record (`src`, `alt`, `model`, `prompt`, `generatedAt`) into the character JSON. Prompts are built only from our own records (`src/lib/art.ts`). Failures never touch `content/`.
- **Labelling:** real art always carries an "AI-generated" caption, and the record keeps the model and prompt as provenance.
- **Provider:** `OpenAIProvider` in `scripts/art/generate.ts` implements the small `ImageProvider` interface; swap it to change provider.
