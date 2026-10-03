#!/usr/bin/env node
/**
 * Security lint for .github/workflows/*.yml: every workflow needs top-level `permissions`,
 * every third-party action must be pinned to a full commit SHA, and `pull_request_target`
 * is forbidden. Run:  pnpm workflows   (optionally: node scripts/check-workflows.mjs [dir])
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lintWorkflow } from './workflow-lint.mjs';

const dir = resolve(process.argv[2] ?? '.github/workflows');
const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort();
const problems = files.flatMap((f) => lintWorkflow(readFileSync(join(dir, f), 'utf8'), f));

if (problems.length) {
  for (const p of problems) console.error(`::error::${p}`);
  console.error(`\n${problems.length} workflow problem(s) in ${files.length} file(s).`);
  process.exit(1);
}
console.log(`${files.length} workflows OK (permissions set, actions pinned, no pull_request_target).`);
