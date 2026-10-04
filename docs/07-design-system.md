# 07 · Design System

Status: v2 · 2026-10-04 · Source of truth: `src/styles/global.css` (tokens), `src/components/` (components).

Two themes, graded separately rather than one inverted into the other.

**Ink (default, dark).** A cinema grade: surfaces carry a cool teal cast (hue 190–194) and type is
warm off-white, the teal/orange split that makes the dark theme read as a graded frame rather than
flat grey. Blue/violet cursed energy is used sparingly for focus, interaction and meaning, and the
home hero adds a WebGL energy field on desktop (ADR-007, doc 08 `hero-field`).

**Paper (light).** Manga ink on paper, and deliberately *not* the ink grade lightened: one flat
paper surface, structure drawn with near-black hairlines instead of filled panels, no gradients,
and the accent spent as a single stroke. `--ink-2` is identical to `--ink` by design, so a card
separates from the page by its rule, not by a tint. Gradients that belong to ink mode — the card
accent wash, the pointer sheen, the hero bloom — are switched off rather than recoloured.

## Tokens

All tokens are CSS custom properties on `:root`, exposed to Tailwind through `@theme inline`, so `bg-ink-2`, `text-paper-dim`, `text-step-3` and Anime.js (`animate(el, { color: 'var(--ce-blue)' })`) read the same values.

| Group | Tokens | Notes |
| --- | --- | --- |
| Surfaces | `--ink`, `--ink-2`, `--ink-3`, `--line` | Ink: three elevation steps plus hairline borders. Paper: `--ink-2` equals `--ink`; `--line` is a near-black hairline (11.9:1) |
| Text | `--paper`, `--paper-dim` | Body ≥ 4.5:1 contrast on every surface in both themes |
| Cursed energy | `--ce-blue`, `--ce-violet`, `--ce-red`, `--ce-glow` | Blue = interactive/focus, violet = techniques, red = danger/special grade |
| Type scale | `--step--1` … `--step-5` | 1.25 modular scale; steps 3–5 are fluid with `clamp()` |
| Radius | `--radius-sm/md/lg` | 6 / 12 / 20 px |
| Elevation | `--shadow-1`, `--shadow-glow` | Ink: inset highlight + soft drop; glow only on focus/active. Paper: `--shadow-1` is `none` — ink does not bloom |
| Texture | `--grain-opacity` | 0.05 on ink, 0.10 on paper where it reads as newsprint tooth |
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
- **Contrast is checked against every surface in both themes, not just the page background.** Body
  text needs 4.5:1. The worst pairing is currently 4.80:1 (ink) and 4.88:1 (paper). Accents are a
  few percent darker on paper for this reason: at the ink values, `--ce-blue` measured 4.01:1 and
  `--ce-red` 4.17:1 on `--ink-3`, both under AA.
- The spoiler control is a proper `radiogroup` with roving tabindex and arrow-key support.
- Split text keeps an accessible copy (Anime.js `splitText` adds a visually hidden original and marks pieces `aria-hidden`).
- Placeholders carry a `title` explaining how to reveal; hidden content is `display: none`, so screen readers never read spoilers either.

## Character art

Every character shows a 3:4 portrait (`CharacterArt.astro`).

- **Placeholder:** until real art exists, a deterministic generative portrait is drawn from the slug (rings, crossing blade lines, monogram) in the character's accent colour. It is decorative (`aria-hidden`).
- **AI-generated art:** `OPENAI_API_KEY=... pnpm art` (optionally `--only=slug,slug`, `--force`, `--dry-run`) generates `public/art/<slug>.webp` and writes an `art` record (`src`, `alt`, `model`, `prompt`, `generatedAt`) into the character JSON. Prompts are built only from our own records (`src/lib/art.ts`). Failures never touch `content/`.
- **Labelling:** real art always carries an "AI-generated" caption, and the record keeps the model and prompt as provenance.
- **Provider:** `OpenAIProvider` in `scripts/art/generate.ts` implements the small `ImageProvider` interface; swap it to change provider.
