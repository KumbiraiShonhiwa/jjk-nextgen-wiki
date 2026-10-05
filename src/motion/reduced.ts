export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** localStorage key for the site's own motion preference (roadmap B12). */
export const MOTION_KEY = 'jjk:motion';
/** Set on <html> when the visitor has asked this site to keep motion down. */
export const MOTION_ATTRIBUTE = 'motion';
export const MOTION_EVENT = 'jjk:motion';

/**
 * True when the visitor asked for reduced motion, by the operating system or by this site's own
 * toggle (or when there is no window, e.g. at build time).
 *
 * The site preference can only ever *add* reduction. There is deliberately no way to force full
 * motion from here: someone whose OS asks for reduced motion has given an accessibility answer
 * already, and a page should not talk them out of it.
 */
export function prefersReducedMotion(win: Pick<Window, 'matchMedia'> | null = globalThis.window ?? null): boolean {
  if (!win?.matchMedia) return true;
  if (globalThis.document?.documentElement.dataset[MOTION_ATTRIBUTE] === 'reduced') return true;
  return win.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** Whether the site toggle is on, independent of what the OS asks for. */
export function siteMotionReduced(doc: Document = document): boolean {
  return doc.documentElement.dataset[MOTION_ATTRIBUTE] === 'reduced';
}

/** Turns the site toggle on or off, stores it, and tells the page. */
export function setSiteMotionReduced(reduced: boolean, doc: Document = document): void {
  if (reduced) doc.documentElement.dataset[MOTION_ATTRIBUTE] = 'reduced';
  else delete doc.documentElement.dataset[MOTION_ATTRIBUTE];
  try {
    if (reduced) localStorage.setItem(MOTION_KEY, 'reduced');
    else localStorage.removeItem(MOTION_KEY);
  } catch {}
  doc.dispatchEvent(new CustomEvent(MOTION_EVENT, { detail: { reduced } }));
}
