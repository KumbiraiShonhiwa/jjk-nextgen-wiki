import { animate } from 'animejs/animation';
import { onScroll } from 'animejs/events';
import { durations, eases } from './tokens';

/**
 * Scroll-scrubbed arc timeline (docs/08, arc-timeline). A rail fills as the reader moves down the
 * list and each arc's marker lights up as the rail reaches it. Both are driven directly by scroll
 * position, so scrolling back up rewinds them. Everything is created inside the caller's scope.
 *
 * Expects [data-rail-fill] inside `list`, and one [data-marker] inside each direct item.
 * `label`, if given, is a sticky element whose [data-arc-current-name] is swapped for the arc the
 * rail is currently passing. It is driven by the same scroll observers as the markers, so it
 * rewinds on the way back up; the page is fully readable without it (see arcRailStatic and the
 * [data-arc-current] rules in global.css).
 */
export function arcRail(list: HTMLElement, label?: HTMLElement | null): void {
  const slot = label?.querySelector<HTMLElement>('[data-arc-current-name]') ?? null;
  const items = [...list.querySelectorAll<HTMLElement>('[data-arc]')];

  /**
   * Swap the sticky label. Guarded on the text, so scrubbing never writes the same string twice.
   * The name is only used when the item's own name is actually on screen: spoiler gating hides it
   * with `display: none`, and the label must not be the one place a hidden arc title leaks. The
   * item's [data-arc] is the redacted stand-in, and because the check is live the label starts
   * showing real names as soon as the visitor raises their spoiler level.
   */
  const setCurrent = (i: number) => {
    const item = items[Math.max(0, Math.min(i, items.length - 1))];
    if (!slot || !item) return;
    const named = item.querySelector<HTMLElement>('[data-arc-name]');
    const name = (named?.offsetParent ? named.textContent?.trim() : '') || item.dataset.arc;
    if (!name || slot.textContent === name) return;
    slot.textContent = name;
    animate(slot, { opacity: [0, 1], y: [6, 0], duration: durations.sm, ease: eases.enter });
  };

  // Where each arc starts, as a fraction of the rail. Measured once here and on resize, never
  // while scrolling, so the per-frame handler below does no layout reads.
  let starts: number[] = [];
  const measure = () => {
    const base = list.getBoundingClientRect();
    starts = base.height ? items.map((li) => (li.getBoundingClientRect().top - base.top) / base.height) : [];
  };
  /** The rail's own progress is the scrub line, so the label can never disagree with the rail. */
  const trackLabel = (progress: number) => {
    let i = 0;
    while (i + 1 < starts.length && starts[i + 1]! <= progress) i++;
    setCurrent(i);
  };

  const fill = list.querySelector<HTMLElement>('[data-rail-fill]');
  if (fill) {
    animate(fill, {
      scaleY: [0, 1],
      ease: 'linear',
      autoplay: onScroll({
        target: list,
        enter: '55% top',
        leave: '55% bottom',
        sync: true,
        // The sticky label rides the same observer as the rail: one scroll-driven source of
        // truth, so it rewinds exactly when the rail does, including instant scroll jumps that
        // skip past several markers in a single frame.
        onUpdate: slot ? (self) => trackLabel(self.progress) : undefined,
        onResize: slot ? measure : undefined,
      }),
    });
    if (slot) measure();
  }

  list.querySelectorAll<HTMLElement>('[data-marker]').forEach((marker) => {
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
  });
}

/** Reduced-motion and no-JS state: the rail is full and every marker is lit. */
export function arcRailStatic(list: HTMLElement): void {
  const fill = list.querySelector<HTMLElement>('[data-rail-fill]');
  if (fill) fill.style.transform = 'scaleY(1)';
  list.querySelectorAll<HTMLElement>('[data-marker]').forEach((m) => {
    m.style.backgroundColor = 'var(--ce-blue)';
  });
}
