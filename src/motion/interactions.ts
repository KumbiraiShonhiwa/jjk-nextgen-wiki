import { createAnimatable } from 'animejs/animatable';
import { animate } from 'animejs/animation';
import { createSpring } from 'animejs/easings';
import { scrambleText } from 'animejs/text';
import { stagger } from 'animejs/utils';
import { durations, eases } from './tokens';

/** Spring used for every direct-manipulation interaction (hover lift, drag release). */
export const springs = {
  soft: createSpring({ stiffness: 120, damping: 14 }),
  snappy: createSpring({ stiffness: 260, damping: 20 }),
};

/**
 * Cursor-reactive tilt and cursed-energy glow for a card.
 * One Animatable per card: pointer moves update targets, no animation objects are created per frame.
 */
export function tiltCard(card: HTMLElement, maxDeg = 6): () => void {
  const tilt = createAnimatable(card, {
    rotateX: { duration: durations.sm, ease: eases.enter },
    rotateY: { duration: durations.sm, ease: eases.enter },
    '--glow-x': { duration: durations.xs, unit: '%' },
    '--glow-y': { duration: durations.xs, unit: '%' },
  });
  const onMove = (e: PointerEvent) => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    tilt.rotateY((px - 0.5) * maxDeg * 2);
    tilt.rotateX((0.5 - py) * maxDeg * 2);
    tilt['--glow-x'](px * 100);
    tilt['--glow-y'](py * 100);
  };
  const onLeave = () => {
    tilt.rotateX(0);
    tilt.rotateY(0);
  };
  card.addEventListener('pointermove', onMove);
  card.addEventListener('pointerleave', onLeave);
  return () => {
    card.removeEventListener('pointermove', onMove);
    card.removeEventListener('pointerleave', onLeave);
    tilt.revert();
  };
}

/** Animates content revealed by raising the spoiler level: text scrambles in, blocks unblur. */
export function revealSpoilers(elements: HTMLElement[]): void {
  // Scramble only text leaves, so links and other markup inside gated content survive.
  const text = elements
    .filter((el) => el.matches('[data-scramble]'))
    .flatMap((el) => (el.children.length === 0 ? [el] : [...el.querySelectorAll<HTMLElement>('*')].filter((c) => c.children.length === 0)));
  const blocks = elements.filter((el) => !el.matches('[data-scramble]'));
  text.forEach((el) =>
    animate(el, {
      innerHTML: scrambleText({ text: el.textContent ?? '', chars: 'blocks' }),
      duration: durations.lg,
      ease: eases.enter,
    }),
  );
  if (blocks.length) {
    animate(blocks, {
      opacity: [0, 1],
      filter: ['blur(8px)', 'blur(0px)'],
      y: [8, 0],
      duration: durations.md,
      ease: eases.enter,
      delay: stagger(30),
    });
  }
}
