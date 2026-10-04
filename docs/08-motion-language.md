# 08 · Motion Language & Anime.js Spec

Status: v1 · 2026-10-03 · Code: `src/motion/` · Engine: Anime.js 4.5.0 (only motion engine, see ADR-002).

## Principles

1. **Motion explains.** Every animation shows hierarchy (cascade order), relationship (connections drawing in), cause (spoilers revealing) or state (indicator sliding).
2. **Fast in, gentle out.** Entrances use `out(4)`; nothing blocks reading for more than 900 ms.
3. **Direct manipulation feels physical.** Anything under the pointer uses springs, never fixed durations.
4. **One signature per page.** A page gets at most one large moment (kinetic title, sigil, domain takeover); everything else is small.
5. **Reduced motion is a first-class design**, not a disabled state: content appears immediately, state changes are instant, nothing is split or scrambled.

## Vocabulary (`src/motion/tokens.ts`, `interactions.ts`)

| Token | Value | Use |
| --- | --- | --- |
| `durations.xs` | 120 ms | Pointer-follow updates |
| `durations.sm` | 240 ms | Indicators, hover |
| `durations.md` | 480 ms | Card and block entrances |
| `durations.lg` | 900 ms | Signature moments, kinetic type |
| `eases.enter` | `out(4)` | Entrances |
| `eases.exit` | `in(3)` | Exits |
| `eases.move` | `inOut(4)` | On-screen state changes |
| `eases.surge` | `outExpo` | Cursed-energy bursts |
| `springs.soft` | stiffness 120, damping 14 | Hover lift, release |
| `springs.snappy` | stiffness 260, damping 20 | Drag snap |
| `staggers.item` / `char` | 40 / 18 ms | Lists / letters |

## Lifecycle rules

- All page motion is created inside `motionScope(root, setup)` (wraps `createScope` with a `reduced` media query). Scopes re-run when the preference changes and `revert()` on `astro:before-swap`, so nothing leaks across View Transitions.
- Islands create animations in `$effect` and pause/revert in the cleanup.
- Only `transform`, `opacity`, `filter` and CSS variables are animated on the main path; layout properties are never animated per frame.
- Pointer-driven effects use one `createAnimatable` per element, updated on `pointermove`: no animation objects are created per frame.

## Animation catalogue

| ID | Where | Trigger | Anime.js modules | Reduced motion |
| --- | --- | --- | --- | --- |
| `kinetic-heading` | Page titles | Page load | `splitText` (chars, clip wrap), `createTimeline`, `stagger` from center, `eases.surge` | Plain text, not split |
| `sigil-draw` | Home hero | Page load | `svg.createDrawable`, `createTimeline`, drop-shadow surge | Static, fully drawn |
| `reveal-cascade` | Card grids | Scrolled into view | `animate` (`clip-path` wipe), `stagger({ grid: true, from: 'first' })`, `onScroll` | Shown immediately |
| `card-tilt` | Every `EntityCard` (fine pointers) | Pointer move | `createAnimatable` (rotateX/Y on the card, x/y on the pre-painted `[data-sheen]` disc) | Off |
| `spoiler-indicator` | Spoiler control | Level change | `animate` (x, width) | Jumps |
| `spoiler-reveal` | Newly visible gated content | Level raised | `scrambleText` on text leaves; blur/opacity/y with `stagger` for blocks | Appears instantly |
| `arc-timeline` | Arcs page | Scroll | `onScroll` with `sync` (scrubbed rail and per-arc markers), `animate`; the rail's `onUpdate` drives the sticky "now reading" label | Full rail, lit markers, no label |
| `graph-physics` (planned) | Relationship graph | Drag | `createDraggable`, `createSpring`, `svg.createMotionPath` | Static layout, keyboard list |
| `domain-takeover` | Domain pages | Click "Expand the domain" | `createTimeline` (clip-path iris from the click point, ring collapse, letter rise, `scrambleText`), looping `animate` breathing, `splitText` | Overlay appears without animation |
| `grid-reflow` (implemented) | Filtering grids | Filter change | `createLayout` | Instant |
