import { animate } from 'animejs/animation';
import { createTimeline, type Timeline } from 'animejs/timeline';
import { scrambleText, splitText } from 'animejs/text';
import { stagger } from 'animejs/utils';
import { durations, eases } from './tokens';

export interface Takeover {
  /** Resolves with the timeline so callers can await or revert it. */
  timeline: Timeline;
  /** Undo splits and animation state; call after the overlay is closed. */
  cleanup: () => void;
}

/**
 * Domain Expansion takeover (docs/08, domain-takeover): the barrier opens as an iris from where the
 * visitor clicked, concentric rings collapse inward, the name rises letter by letter and the
 * Japanese name resolves out of redacted glyphs.
 *
 * Expects `overlay` to contain [data-takeover-ring] (several), [data-takeover-name] and optionally
 * [data-takeover-ja] and [data-takeover-hint].
 */
export function playTakeover(overlay: HTMLElement, origin: { x: number; y: number }): Takeover {
  const rings = overlay.querySelectorAll<HTMLElement>('[data-takeover-ring]');
  const name = overlay.querySelector<HTMLElement>('[data-takeover-name]')!;
  const ja = overlay.querySelector<HTMLElement>('[data-takeover-ja]');
  const hint = overlay.querySelector<HTMLElement>('[data-takeover-hint]');
  const jaText = ja?.textContent ?? '';
  // Keep the splitter: revert() is a method and needs its own `this`.
  const split = splitText(name, { chars: { wrap: 'clip' } });

  const at = `${Math.round(origin.x)}px ${Math.round(origin.y)}px`;
  const tl = createTimeline({ defaults: { ease: eases.enter } })
    .add(overlay, { clipPath: [`circle(0px at ${at})`, `circle(150vmax at ${at})`], duration: durations.lg, ease: eases.surge }, 0)
    .add(rings, { scale: [2.4, 1], opacity: [0, 1], duration: durations.lg * 1.6, delay: stagger(110, { reversed: true }) }, 150)
    .add(split.chars, { y: ['115%', '0%'], rotate: [10, 0], duration: durations.lg, delay: stagger(40, { from: 'center' }) }, 500);

  if (ja) tl.add(ja, { innerHTML: scrambleText({ text: jaText, chars: 'blocks' }), opacity: [0, 1], duration: durations.lg }, 900);
  if (hint) tl.add(hint, { opacity: [0, 0.8], duration: durations.md }, 1500);

  // Rings keep breathing while the overlay is open.
  const breathe = animate(rings, { scale: [1, 1.04], duration: 2600, alternate: true, loop: true, delay: stagger(180), ease: 'inOutSine' });

  return {
    timeline: tl,
    cleanup: () => {
      breathe.revert();
      tl.revert();
      split.revert();
      if (ja) ja.textContent = jaText;
    },
  };
}
