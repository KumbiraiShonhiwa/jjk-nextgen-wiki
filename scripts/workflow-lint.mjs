/**
 * Pure logic for scripts/check-workflows.mjs: static security checks on a GitHub Actions
 * workflow file. Text based (no YAML dependency); workflows here are plain block-style YAML.
 */

const SHA = /^[0-9a-f]{40}$/;

/**
 * Drop a trailing `# comment` and whole-line comments.
 *
 * The CR is removed first. These files are checked out CRLF on Windows (git `core.autocrlf`), and
 * `.` does not match `\r` while `$` without the `m` flag only matches end-of-string, so
 * `/\s+#.*$/` silently failed to match on a CRLF line. Every pinned `uses:` then kept its
 * `# v7.0.1` comment and was reported as unpinned — green on CI, red for every Windows checkout.
 */
function stripComment(line) {
  const clean = line.replace(/\r$/, '');
  const t = clean.trim();
  if (t.startsWith('#')) return '';
  return clean.replace(/\s+#.*$/, '');
}

/** True when the workflow has a top-level `permissions:` key (column 0). */
export function hasTopLevelPermissions(text) {
  return text.split('\n').some((l) => /^permissions\s*:/.test(l));
}

/** True when any non-comment line mentions the pull_request_target trigger. */
export function usesPullRequestTarget(text) {
  return text.split('\n').some((l) => /\bpull_request_target\b/.test(stripComment(l)));
}

/** Every `uses:` reference as { ref, line }. */
export function findUses(text) {
  const out = [];
  text.split('\n').forEach((raw, i) => {
    const m = /^\s*(?:-\s+)?uses\s*:\s*(.+?)\s*$/.exec(stripComment(raw));
    if (m) out.push({ ref: m[1].replace(/^['"]|['"]$/g, ''), line: i + 1 });
  });
  return out;
}

/** A `uses:` ref is acceptable when local (./) or pinned to a full 40-char commit SHA. */
export function isPinned(ref) {
  if (ref.startsWith('./')) return true;
  const at = ref.lastIndexOf('@');
  return at !== -1 && SHA.test(ref.slice(at + 1));
}

/** Returns a list of human-readable problems (empty when the workflow is fine). */
export function lintWorkflow(text, name = 'workflow') {
  const problems = [];
  if (!hasTopLevelPermissions(text)) problems.push(`${name}: missing top-level \`permissions:\` (use \`contents: read\`).`);
  if (usesPullRequestTarget(text)) problems.push(`${name}: uses \`pull_request_target\`, which is forbidden.`);
  for (const { ref, line } of findUses(text)) {
    if (!isPinned(ref)) problems.push(`${name}:${line}: \`${ref}\` is not pinned to a full 40-character commit SHA.`);
  }
  return problems;
}
