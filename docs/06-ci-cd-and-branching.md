# 06 · CI/CD & Branching

Pipeline-as-code in the Jenkins style, implemented with GitHub Actions (there is no Jenkins server). Everything lives in `.github/workflows/`:

| Workflow | File | Runs on |
| --- | --- | --- |
| CI | `ci.yml` | every PR (opened, edited, synchronize, reopened), the merge queue (`merge_group`), pushes to `develop`/`stable`/`main` |
| Promote | `promote.yml` | manual (`workflow_dispatch`) |
| Deploy | `deploy.yml` | pushes to `main` |
| Content sync | `content-sync.yml` | weekly cron (Monday 03:00 UTC) and manual (`workflow_dispatch`) |

## Branching model

```
feature/fix branches ──squash PR──▶ develop ──merge PR──▶ stable ──merge PR──▶ main (live)
```

| Branch | Role | What may merge into it | Merge method |
| --- | --- | --- | --- |
| `develop` | Integration | any feature/fix branch (never `stable` or `main`) | squash, via merge queue |
| `stable` | Release candidate | `develop` only | merge commit |
| `main` | Live site | `stable` only | merge commit |

Branch names for work: `feat/<topic>`, `fix/<topic>`, `chore/<topic>`, `docs/<topic>`, `ci/<topic>`. Branch from the latest `develop`.

## Stacked PRs

Use a stack when one change builds on another that is still in review.

```sh
git switch -c feat/a origin/develop       # first change
git push -u origin feat/a
gh pr create --base develop --head feat/a

git switch -c feat/b feat/a               # second change, based on the first
git push -u origin feat/b
gh pr create --base feat/a --head feat/b  # PR targets its predecessor, not develop
```

- While `feat/a` is unmerged, `feat/b`'s **merge-order** check fails with *"Stacked on feat/a; merge that PR first. This PR is retargeted to develop automatically when it lands."* Reviewers still see only `feat/b`'s own diff.
- When `feat/a` merges and its branch is deleted (enable *Settings → General → Automatically delete head branches*), GitHub retargets `feat/b` to `develop`. The retarget fires `pull_request: edited`, so **merge-order** re-runs and passes.
- Because `feat/a` was squashed, `feat/b` still carries `feat/a`'s original commits. If the PR shows them or conflicts, drop them:

  ```sh
  git fetch origin
  git rebase --onto origin/develop <last-commit-of-feat/a> feat/b
  git push --force-with-lease
  ```

- Deeper stacks work the same way: each PR targets the one below it and lands in order.

## CI jobs (`ci.yml`, workflow `CI`)

The three job names are the required status checks. Do not rename them without updating the rulesets.

| Check | What it does | What it blocks |
| --- | --- | --- |
| `verify` | `pnpm install --frozen-lockfile`, `pnpm check` (Astro + TS), `pnpm test` (Vitest, `tests/unit` and `tests/ingest`), `pnpm build`; uploads `dist/` as an artifact | type errors, failing unit tests, a broken build, or a lockfile that is out of sync |
| `e2e` | Downloads `dist/`, installs Chromium, runs Playwright (`tests/e2e`) against `pnpm preview`, in normal **and** reduced-motion modes | runtime page errors, an empty character grid, broken card → character page navigation, a spoiler switch that does not persist, and motion running under `prefers-reduced-motion` (the heading must not be split into letters) |
| `merge-order` | On PRs: checks base/head against the branching model. On `merge_group` and `push` it passes immediately so the required check is always satisfied | `main` ← anything but `stable`; `stable` ← anything but `develop`; `develop` ← `stable`/`main`; any PR whose base is another feature branch (unmerged stack) |

Runs on the same PR cancel each other; pushes to long-lived branches never cancel.

Run the same checks locally:

```sh
pnpm check && pnpm test && pnpm build
pnpm test:e2e      # serves dist/ with `pnpm preview`; needs `pnpm exec playwright install chromium` once
```

If a preinstalled Chromium does not match the Playwright version, point `PW_CHROMIUM_PATH` at its binary. CI never sets it. Web-font requests are stubbed in the tests, so they run offline.

## Promotion (`promote.yml`)

*Actions → Promote → Run workflow*, choose `target`:

- `stable`: opens `develop → stable`
- `main`: opens `stable → main`

If a promotion PR is already open, the job reports its URL. If the source has nothing new, it says so and stops.

PRs opened with `GITHUB_TOKEN` do not trigger `pull_request` workflows, so the required checks would never run on them. So there are two paths:

1. **`PROMOTE_TOKEN` secret set** (recommended): a fine-grained PAT for this repository with *Pull requests: read and write* and *Contents: read*. The workflow opens the PR with it, and CI runs normally.
2. **No `PROMOTE_TOKEN`**: the job succeeds without opening anything and writes the exact command and the compare URL to the job summary, for example:

   ```sh
   gh pr create --repo <owner>/<repo> --base stable --head develop --title "Promote develop -> stable" --body "..."
   ```

   Run it yourself (or open the compare URL) so the PR is authored by you and CI runs.

Merge promotion PRs with a **merge commit** so `stable` and `main` share history with `develop`.

## Deploy (`deploy.yml`)

Every push to `main` (that is, every merged `stable → main` PR) builds the site and deploys `dist/` to Cloudflare Pages project `jjk-nextgen-wiki` with `cloudflare/wrangler-action`.

Required repository secrets: `CLOUDFLARE_API_TOKEN` (Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`. If either is missing, a first step sets an output and the remaining steps are skipped. The job logs a notice and still succeeds.

## Content sync (`content-sync.yml`)

Runs the ingest pipeline from doc 03 against the live Fandom API and proposes the result as a PR. Triggers:

- **Schedule**: Mondays 03:00 UTC.
- **Manual**: *Actions → Content sync → Run workflow*. Optional inputs are `only` (comma-separated entity types, e.g. `characters,techniques`) and `limit` (at most N pages per type). Both are validated before use. The job always checks out `develop`, so a manual run uses `develop`'s ingest code, whichever branch is selected in the dialog.

Steps:

1. Install, restore `.cache/raw` from the Actions cache (revision content is immutable, so a warm cache saves requests), then `pnpm ingest` with the inputs.
2. Print `reports/ingest-<date>.md` to the job summary and upload it as the `ingest-report` artifact (kept 30 days). Both happen even when the ingest fails.
3. `pnpm check`, `pnpm test` and `pnpm build`. Any failure stops the job before a PR is opened.
4. If anything under `content/` changed, `peter-evans/create-pull-request` opens or updates the PR **"Content sync <date>"** from branch `content/sync` into `develop`. The PR body carries the report, trimmed to GitHub's size limit. If `content/` is unchanged, nothing is opened.

A human reviews and squash-merges the PR like any other change into `develop`. Check the spoiler levels of new text and add entries to `content/meta/spoiler-overrides.json` where needed.

**Token.** The PR is created with `secrets.PROMOTE_TOKEN || secrets.GITHUB_TOKEN`. Because a PR opened or updated with `GITHUB_TOKEN` does not trigger `pull_request` workflows, **without `PROMOTE_TOKEN` the required checks (`verify`, `e2e`, `merge-order`) will not run on the sync PR automatically**. The job then logs a notice; to start CI, close and reopen the PR or push a commit to `content/sync` yourself. For this workflow, `PROMOTE_TOKEN` also needs *Contents: read and write*, since it pushes the `content/sync` branch (Promote only needs *Contents: read*).

Run the same steps locally with `pnpm ingest --dry-run` (no writes to `content/`) or `pnpm ingest`, followed by `pnpm check && pnpm test && pnpm build`.

## Branch rules

Rulesets are kept as JSON, one per branch, in `.github/rulesets/`, so they can be reviewed and re-imported (*Settings → Rules → Rulesets → Import*).

**`develop`**

- Pull request required before merging
- Required status checks: `verify`, `e2e`, `merge-order`
- Branches must be up to date before merging
- Merge queue enabled (CI runs again on `merge_group`)
- Allowed merge method: squash only
- No force pushes, no deletion
- All conversations must be resolved

**`stable`** and **`main`**

- Pull request required before merging
- Required status checks: `verify`, `e2e`, `merge-order`
- Branches must be up to date before merging
- No merge queue
- Allowed merge method: merge commit only
- No force pushes, no deletion
- All conversations must be resolved

## One-time repository setup

Import the rulesets only after this pipeline is on `develop`; until then the required checks don't exist and every PR would be blocked.

1. *Settings → General*: default branch `develop`; tick **Automatically delete head branches** and **Allow auto-merge**; untick **Allow rebase merging**.
2. *Settings → Rules → Rulesets → New ruleset → Import a ruleset*: import `develop.json`, `stable.json` and `main.json` from `.github/rulesets/`.
3. Optional: add `PROMOTE_TOKEN` (*Pull requests: read and write*, *Contents: read and write* so it can serve both Promote and Content sync), `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` under *Settings → Secrets and variables → Actions*.
4. For Content sync: *Settings → Actions → General → Workflow permissions*, tick **Allow GitHub Actions to create and approve pull requests** (needed when `PROMOTE_TOKEN` is not set). Create the `content` label, or the action creates it on first use.
