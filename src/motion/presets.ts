import { animate, type JSAnimation } from 'animejs/animation';
import { createTimeline, type Timeline } from 'animejs/timeline';
import { stagger } from 'animejs/utils';
import { splitText, scrambleText } from 'animejs/text';
import { createDrawable } from 'animejs/svg';
import { onScroll } from 'animejs/events';
import { durations, eases, staggers } from './tokens';

/**
 * Kinetic heading: a discharge of characters out of an ink baseline, centre first.
 *
 * `eases.surge` (outExpo) gives the hard attack and long tail of a cursed-energy burst instead of
 * the even drift of `out(4)`, and the shorter `durations.md` keeps the whole h1 under ~600 ms.
 * The clip wrapper that splitText adds is only as tall as the line box and would shear j/p/g;
 * that is fixed by the `[data-kinetic] :has(> [data-char])` rule in global.css rather than by
 * writing paddingBottom/marginBottom inline on every character, which forced a layout per glyph
 * on every page's title.
 */
export function kineticHeading(el: HTMLElement): Timeline {
  const { chars } = splitText(el, { chars: { wrap: 'clip' } });
  return createTimeline().add(chars, {
    y: ['110%', '0%'],
    rotate: [10, 0],
    duration: durations.md,
    ease: eases.surge,
    delay: stagger(staggers.char, { from: 'center' }),
  });
}

/** Line-draws every stroke in an SVG sigil, then pulses cursed energy through it. */
export function drawSigil(svg: SVGSVGElement): Timeline {
  const strokes = createDrawable(svg.querySelectorAll('path, circle, line, polyline'));
  return createTimeline()
    .add(strokes, {
      draw: ['0 0', '0 1'],
      duration: durations.lg * 1.6,
      ease: eases.move,
      delay: stagger(90),
    })
    .add(svg, {
      filter: ['drop-shadow(0 0 0px var(--ce-blue))', 'drop-shadow(0 0 14px var(--ce-blue))', 'drop-shadow(0 0 4px var(--ce-blue))'],
      duration: durations.lg,
      ease: eases.surge,
    }, '-=300');
}

/**
 * How long to wait for the scroll trigger before revealing the content anyway.
 * Long enough that a normal in-view cascade always wins the race.
 */
const CASCADE_FALLBACK_MS = 1200;

/**
 * Ink-spreading wipe. Each item is revealed by a clip-path that opens from its top-left corner
 * (right and down at once), and the items are staggered along the grid's diagonal: `grid: true`
 * makes Anime.js measure the laid-out positions itself and stagger by 2D distance from the first
 * card, so the reveal travels across the grid like ink soaking through paper rather than
 * row-by-row. The measuring pass happens once, when the animation is created.
 */
const WIPE_FROM = 'inset(0% 100% 100% 0%)';
const WIPE_TO = 'inset(0% 0% 0% 0%)';

/** Grid or list cascade, triggered when the container scrolls into view. */
export function revealCascade(container: Element, selector = '[data-reveal]'): JSAnimation {
  let began = false;
  // Declared before animate(): an in-view container can fire the scroll trigger synchronously
  // here, and onBegin would otherwise touch `net` inside its temporal dead zone.
  let net: ReturnType<typeof setTimeout> | undefined;
  const items = container.querySelectorAll<HTMLElement>(selector);

  const animation = animate(items, {
    clipPath: [WIPE_FROM, WIPE_TO],
    // Opacity only takes the hard edge off the wipe, so it finishes early.
    opacity: { to: 1, duration: durations.sm, ease: eases.enter },
    duration: durations.md,
    ease: eases.enter,
    delay: stagger(staggers.item, { grid: true, from: 'first' }),
    onBegin: () => {
      began = true;
      if (net) clearTimeout(net);
    },
    // Drop the clip once it has served its purpose: a resting inset() would keep clipping the
    // card's shadow and its 3D tilt.
    onComplete: () => items.forEach((el) => el.style.removeProperty('clip-path')),
    autoplay: onScroll({ target: container, enter: 'bottom-=10% top' }),
  });

  // Safety net. The CSS in global.css pre-hides [data-reveal] as soon as JS is available, so if the
  // scroll trigger never fires — container already scrolled past, a restored scroll position, an
  // observer edge case — this content would stay invisible with no way back. Reveal it regardless.
  // The wipe deliberately leaves the hiding mechanism as opacity alone, so showAll() is still a
  // complete recovery: no clip-path is ever set unless this animation actually runs.
  if (!began) net = setTimeout(() => showAll(container, selector), CASCADE_FALLBACK_MS);

  return animation;
}

/** Spoiler unlock: text scrambles from redacted glyphs into the real words. */
export function scrambleReveal(el: HTMLElement, text: string): JSAnimation {
  return animate(el, {
    innerHTML: scrambleText({ text, chars: 'blocks' }),
    duration: durations.lg,
    ease: eases.enter,
  });
}

/** Reduced-motion fallback: make everything visible, no movement. */
export function showAll(root: Element, selector = '[data-reveal]'): void {
  root.querySelectorAll<HTMLElement>(selector).forEach((el) => (el.style.opacity = '1'));
}
