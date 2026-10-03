export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** True when the visitor asked for reduced motion (or when there is no window, e.g. at build time). */
export function prefersReducedMotion(win: Pick<Window, 'matchMedia'> | null = globalThis.window ?? null): boolean {
  if (!win?.matchMedia) return true;
  return win.matchMedia(REDUCED_MOTION_QUERY).matches;
}
