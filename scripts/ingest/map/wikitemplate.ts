/**
 * Brace-aware wikitext template scanning, shared by the Wikipedia mappers.
 *
 * Template values contain nested templates and links, both of which contain `|`, so nothing here
 * can be done with a flat regex: every split tracks `{{`/`[[` depth and only breaks at depth zero.
 */

/** Splits a template body at top-level pipes, keeping nested templates and links intact. */
export function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      current += two;
      i++;
      continue;
    }
    if (two === '}}' || two === ']]') {
      depth--;
      current += two;
      i++;
      continue;
    }
    if (body[i] === '|' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += body[i];
  }
  parts.push(current);
  return parts;
}

/** The `name = value` parameters of a template body, keyed by lower-cased name. */
export function templateParams(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of splitTopLevel(body)) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    // A `=` inside a nested template is not a parameter separator.
    if (key && !/[{}[\]|]/.test(key)) out[key] = part.slice(eq + 1).trim();
  }
  return out;
}

/** The positional items of a template body: the parts that are not `name=value`. */
export function positionalItems(body: string): string[] {
  return splitTopLevel(body)
    .map((p) => p.trim())
    .filter((p) => p && !/^[A-Za-z][A-Za-z0-9 _-]*=/.test(p));
}

/**
 * Bodies of every `{{<name> …}}` in `text`, braces balanced.
 * `name` is used in a regex, so callers pass a literal, never user input.
 */
export function templatesNamed(text: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`\\{\\{\\s*${name}\\s*(?=[|\\n}])`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let depth = 1;
    // Start after the name, not after `{{`: otherwise the name itself is read as the template's
    // first positional item, which silently turned every chapter title into "Nihongo".
    let i = m.index + m[0].length;
    const start = i;
    while (i < text.length && depth > 0) {
      const two = text.slice(i, i + 2);
      if (two === '{{') {
        depth++;
        i += 2;
        continue;
      }
      if (two === '}}') {
        depth--;
        i += 2;
        continue;
      }
      i++;
    }
    if (depth === 0) out.push(text.slice(start, i - 2));
  }
  return out;
}
