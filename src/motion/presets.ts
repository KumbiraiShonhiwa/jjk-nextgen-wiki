import { animate, type JSAnimation } from 'animejs/animation';
import { createTimeline, type Timeline } from 'animejs/timeline';
import { stagger } from 'animejs/utils';
import { splitText, scrambleText } from 'animejs/text';
import { createDrawable } from 'animejs/svg';
import { onScroll } from 'animejs/events';
import { durations, eases, staggers } from './tokens';

/** Kinetic heading: characters rise out of an ink baseline, centre first. */
export function kineticHeading(el: HTMLElement): Timeline {
  const { chars } = splitText(el, { chars: { wrap: 'clip' } });
  // The clip wrapper is as tall as the line box; with tight leading it shears descenders (j, p, g). Grow it downwards without moving the text.
  for (const c of chars) {
    const wrap = c.parentElement;
    if (wrap) Object.assign(wrap.style, { paddingBottom: '0.25em', marginBottom: '-0.25em' });
  }
  return createTimeline().add(chars, {
    y: ['110%', '0%'],
    rotate: [8, 0],
    duration: durations.lg,
    ease: eases.enter,
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

/** Grid or list cascade, triggered when the container scrolls into view. */
export function revealCascade(container: Element, selector = '[data-reveal]'): JSAnimation {
  return animate(container.querySelectorAll(selector), {
    opacity: [0, 1],
    y: [24, 0],
    duration: durations.md,
    ease: eases.enter,
    delay: stagger(staggers.item),
    autoplay: onScroll({ target: container, enter: 'bottom-=10% top' }),
  });
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
