/**
 * Pure logic for scripts/check-workflows.mjs: static security checks on a GitHub Actions
 * workflow file. Text based (no YAML dependency); workflows here are plain block-style YAML.
 */

const SHA = /^[0-9a-f]{40}$/;

/** Drop a trailing `# comment` and whole-line comments. */
function stripComment(line) {
  const t = line.trim();
  if (t.startsWith('#')) return '';
  return line.replace(/\s+#.*$/, '');
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
