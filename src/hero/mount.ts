/**
 * Decides whether the home hero gets its WebGL layer, and loads it if so (ADR-007).
 *
 * Only this file is part of the home route's `js` budget; `./field` and three.js itself sit
 * behind the dynamic import below and are measured as `lazy`. The guards therefore run before a
 * single byte of three.js is fetched: a phone, a low-memory machine or a visitor who asked for
 * reduced motion never downloads it at all and keeps the static SVG sigil, which is the designed
 * fallback rather than a degraded state.
 */
import { prefersReducedMotion } from '../motion/reduced';

/** Below this the device is treated as low-memory. `deviceMemory` is Chromium-only; absent means "assume fine". */
const MIN_DEVICE_MEMORY = 4;
/** The hero is a desktop flourish; phones get the SVG. */
const MIN_WIDTH = 1024;

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

/** Every reason the field must not mount, checked before the dynamic import. */
export function shouldMount(win: Window = window): boolean {
  if (prefersReducedMotion(win)) return false;
  if (win.innerWidth < MIN_WIDTH) return false;
  // Coarse pointers are phones and tablets regardless of how wide they report.
  if (win.matchMedia('(pointer: coarse)').matches) return false;
  const memory = (win.navigator as NavigatorWithMemory).deviceMemory;
  if (typeof memory === 'number' && memory < MIN_DEVICE_MEMORY) return false;
  if (win.matchMedia('(prefers-reduced-data: reduce)').matches) return false;
  return true;
}

/** Runs `fn` once the page is idle, so the hero never competes with LCP. */
function whenIdle(fn: () => void): () => void {
  let idle: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const start = () => {
    const ric = window.requestIdleCallback;
    if (ric) idle = ric(fn, { timeout: 2000 });
    else timer = setTimeout(fn, 200);
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
  return () => {
    if (idle !== undefined) window.cancelIdleCallback?.(idle);
    if (timer) clearTimeout(timer);
  };
}

/**
 * Mounts the field behind the hero and hands its uniforms to Anime.js. Returns a cleanup that is
 * safe to call at any point, including before the import has resolved.
 */
export function mountHero(canvas: HTMLCanvasElement): () => void {
  let dispose: (() => void) | undefined;
  let cancelled = false;

  const cancelIdle = whenIdle(async () => {
    if (cancelled) return;
    try {
      const [{ mountField }, { animate }, { eases, durations }] = await Promise.all([
        import('./field'),
        import('animejs/animation'),
        import('../motion/tokens'),
      ]);
      if (cancelled) return;

      const field = mountField(canvas);
      if (!field) return; // No WebGL context: the SVG hero is already on screen.

      canvas.dataset.heroField = 'on';
      dispose = field.dispose;

      // The adapter exposes the ShaderMaterial's uniforms by name on the material itself, so the
      // field's rise is an ordinary Anime.js tween in the same vocabulary as the DOM motion.
      animate(field.material, {
        uIntensity: 1,
        duration: durations.lg * 2,
        ease: eases.surge,
      });
    } catch {
      // A failed chunk or a refused GPU must never break the page; the SVG hero stands alone.
    }
  });

  return () => {
    cancelled = true;
    cancelIdle();
    dispose?.();
    dispose = undefined;
    delete canvas.dataset.heroField;
  };
}
