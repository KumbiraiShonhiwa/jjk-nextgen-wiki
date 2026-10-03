
## Static preview bundle

`pnpm build && pnpm preview:static` writes `preview/site/` (git-ignored): a copy of `dist/` where every URL is relative and every directory link points at an explicit `index.html`, so it works from any folder on a plain file host with no directory-index support. It also drops the client-side router (relative URLs break when documents are swapped at different depths), so navigation is a full page load.

`node scripts/preview/verify.mjs` serves the bundle from a nested path with no index fallback and drives it (home, navigation, a character page, the graph, search). It fails on any 404 or any request outside the prefix. Run it with `PW_CHROMIUM_PATH=/path/to/chromium` if Playwright's own Chromium is not installed.

Hosts that only serve web file types (no `.pf_*` Pagefind index files) cannot run search from this bundle; everything else works.
