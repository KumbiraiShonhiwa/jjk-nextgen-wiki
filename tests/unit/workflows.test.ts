import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findUses, hasTopLevelPermissions, isPinned, lintWorkflow, usesPullRequestTarget } from '../../scripts/workflow-lint.mjs';

const SHA = '11d5960a326750d5838078e36cf38b85af677262';

const good = `
name: Good
on: [push]
permissions:
  contents: read
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${SHA} # v4.4.0
      - uses: ./.github/actions/local
      - name: x
        uses: "actions/cache@${SHA}"
`;

describe('lintWorkflow', () => {
  it('accepts a least-privilege, pinned workflow', () => {
    expect(lintWorkflow(good, 'good.yml')).toEqual([]);
  });

  it('flags a missing top-level permissions block (job-level does not count)', () => {
    const bad = good.replace('permissions:\n  contents: read\n', '').replace('    runs-on', '    permissions:\n      contents: read\n    runs-on');
    expect(hasTopLevelPermissions(bad)).toBe(false);
    expect(lintWorkflow(bad, 'bad.yml')).toHaveLength(1);
  });

  it('flags tag and branch refs as unpinned, including short SHAs', () => {
    for (const ref of ['actions/checkout@v4', 'actions/checkout@main', 'actions/checkout@11d5960', 'actions/checkout']) {
      const out = lintWorkflow(good.replace(`actions/checkout@${SHA}`, ref), 'bad.yml');
      expect(out).toHaveLength(1);
      expect(out[0]).toContain(ref);
    }
  });

  it('flags pull_request_target but ignores it in comments', () => {
    expect(lintWorkflow(good.replace('[push]', '[pull_request_target]'), 'bad.yml')).toHaveLength(1);
    expect(usesPullRequestTarget('# never use pull_request_target\non: push\n')).toBe(false);
    expect(usesPullRequestTarget('on:\n  pull_request_target:\n')).toBe(true);
  });

  it('reports every problem', () => {
    const bad = 'on: pull_request_target\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n';
    expect(lintWorkflow(bad, 'bad.yml')).toHaveLength(3);
  });
});

describe('helpers', () => {
  it('ignores local actions and requires a 40-char hex SHA', () => {
    expect(isPinned('./local')).toBe(true);
    expect(isPinned(`a/b@${SHA}`)).toBe(true);
    expect(isPinned(`a/b@${SHA}0`)).toBe(false);
    expect(isPinned('a/b@ZZZ5960a326750d5838078e36cf38b85af677262')).toBe(false);
  });

  it('reads uses lines with line numbers and strips trailing comments', () => {
    expect(findUses(good).map((u) => u.ref)).toEqual([`actions/checkout@${SHA}`, './.github/actions/local', `actions/cache@${SHA}`]);
  });
});

describe('repository workflows', () => {
  it('all pass the checker', () => {
    const dir = '.github/workflows';
    const problems = readdirSync(dir)
      .filter((f) => /\.ya?ml$/.test(f))
      .flatMap((f) => lintWorkflow(readFileSync(`${dir}/${f}`, 'utf8'), f));
    expect(problems).toEqual([]);
  });
});
