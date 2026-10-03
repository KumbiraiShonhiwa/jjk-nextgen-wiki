import { createLayout } from 'animejs/layout';
import { durations, eases } from './tokens';

export interface Reflow {
  /** Hide every item that fails `keep`; survivors glide to their new grid cells. */
  filter: (keep: (item: HTMLElement) => boolean) => void;
  revert: () => void;
}

/**
 * Filterable grid with animated reflow (docs/08, grid-reflow). Anime.js records the layout, the
 * callback toggles `hidden`, and the layout animates every item from its old box to its new one.
 * With `reduced`, the same filtering happens instantly.
 */
export function gridReflow(grid: HTMLElement, reduced: boolean): Reflow {
  const items = [...grid.querySelectorAll<HTMLElement>('[data-grid-item]')];
  const apply = (keep: (item: HTMLElement) => boolean) => items.forEach((el) => el.toggleAttribute('hidden', !keep(el)));
  if (reduced) return { filter: apply, revert: () => {} };

  const layout = createLayout(grid, {
    children: '[data-grid-item]',
    duration: durations.md,
    ease: eases.enter,
    enterFrom: { opacity: 0, scale: 0.85 },
    leaveTo: { opacity: 0, scale: 0.85 },
  });
  return { filter: (keep) => void layout.update(() => apply(keep)), revert: () => void layout.revert() };
}
