import { animate } from 'animejs/animation';
import { onScroll } from 'animejs/events';
import { durations } from './tokens';

/**
 * Scroll-scrubbed arc timeline (docs/08, arc-timeline). A rail fills as the reader moves down the
 * list and each arc's marker lights up as the rail reaches it. Both are driven directly by scroll
 * position, so scrolling back up rewinds them. Everything is created inside the caller's scope.
 *
 * Expects [data-rail-fill] inside `list`, and one [data-marker] inside each direct item.
 */
export function arcRail(list: HTMLElement): void {
  const fill = list.querySelector<HTMLElement>('[data-rail-fill]');
  if (fill) {
    animate(fill, {
      scaleY: [0, 1],
      ease: 'linear',
      autoplay: onScroll({ target: list, enter: '55% top', leave: '55% bottom', sync: true }),
    });
  }

  for (const marker of list.querySelectorAll<HTMLElement>('[data-marker]')) {
    const item = marker.closest<HTMLElement>('li') ?? marker;
    animate(marker, {
      scale: [1, 1.7],
      backgroundColor: ['var(--ink)', 'var(--ce-blue)'],
      boxShadow: ['0 0 0 0 transparent', '0 0 18px 2px var(--ce-blue)'],
      duration: durations.sm,
      ease: 'outBack',
      // Thresholds read "<container position> <target position>". A short band around the rail's
      // position, scrubbed by scroll rather than timed.
      autoplay: onScroll({ target: item, enter: '58% top', leave: '50% top', sync: true }),
    });
  }
}

/** Reduced-motion and no-JS state: the rail is full and every marker is lit. */
export function arcRailStatic(list: HTMLElement): void {
  const fill = list.querySelector<HTMLElement>('[data-rail-fill]');
  if (fill) fill.style.transform = 'scaleY(1)';
  list.querySelectorAll<HTMLElement>('[data-marker]').forEach((m) => {
    m.style.backgroundColor = 'var(--ce-blue)';
  });
}
