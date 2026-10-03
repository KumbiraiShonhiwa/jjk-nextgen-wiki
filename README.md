# jjk-nextgen-wiki

An unofficial, motion-first Jujutsu Kaisen encyclopedia built with Astro and Anime.js.

> Unofficial fan project. Jujutsu Kaisen © Gege Akutami / Shueisha, MAPPA. Not affiliated with or endorsed by the rights holders.

## Status

Foundation phase. See [`docs/`](docs/):

| # | Document |
| --- | --- |
| 01 | [Product Vision & Principles](docs/01-product-vision.md) |
| 02 | [Content & Data Model](docs/02-content-data-model.md) |
| 03 | [Data Acquisition & Licensing Plan](docs/03-data-acquisition-licensing.md) |
| 04 | [Information Architecture](docs/04-information-architecture.md) |
| 05 | [Tech Stack & ADRs](docs/05-tech-stack-adrs.md) |
| 06 | [CI/CD & Branching](docs/06-ci-cd-and-branching.md) |
| 07 | [Design System](docs/07-design-system.md) |
| 08 | [Motion Language & Anime.js Spec](docs/08-motion-language.md) |

## Licences

- **Code** is released under the [MIT licence](LICENSE).
- **Content** in `content/` and text rendered on the site is adapted from English Wikipedia and the Jujutsu Kaisen Fandom wiki and released under [CC BY-SA 4.0](content/LICENSE). Each page credits its source article and authors.
- No images from either wiki are used.

## Development

Requires Node 22.12+ and pnpm 10.

```sh
pnpm install
pnpm dev      # http://localhost:4321
pnpm check    # Astro + TypeScript diagnostics
pnpm test     # unit tests (Vitest)
pnpm build    # static site in dist/
pnpm test:e2e # Playwright smoke tests against the built site
```

Branching, CI checks, promotion and deploy are described in [docs/06](docs/06-ci-cd-and-branching.md).

Animations live in `src/motion/` (Anime.js 4.5 presets, tokens and reduced-motion handling). Pages call presets such as `kineticHeading`, `drawSigil` and `revealCascade` inside `motionScope`, which reverts everything on page change.
