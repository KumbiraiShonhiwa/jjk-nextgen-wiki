import { createScope, type Scope } from 'animejs/scope';
import { prefersReducedMotion, REDUCED_MOTION_QUERY } from './reduced';

export type MotionSetup = (ctx: { scope: Scope; reduced: boolean }) => void | (() => void);

/**
 * Runs Anime.js setup inside a scope rooted at `root`.
 * Re-runs when reduced-motion preference changes, and reverts everything
 * before Astro swaps the page (View Transitions), so nothing leaks between pages.
 */
export function motionScope(root: HTMLElement | SVGElement, setup: MotionSetup): Scope {
  const scope = createScope({
    root,
    mediaQueries: { reduced: REDUCED_MOTION_QUERY },
  })    // The media query covers the OS setting; prefersReducedMotion also reads the site toggle.
    .add((self) => setup({ scope: self!, reduced: Boolean(self?.matches.reduced) || prefersReducedMotion() }));

  document.addEventListener('astro:before-swap', () => scope.revert(), { once: true });
  return scope;
}
