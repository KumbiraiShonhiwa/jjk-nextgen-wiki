import { describe, expect, it } from 'vitest';
import { prefersReducedMotion } from '../../src/motion/reduced';

const fakeWindow = (matches: boolean) => ({ matchMedia: () => ({ matches }) as MediaQueryList });

describe('prefersReducedMotion', () => {
  it('follows the media query', () => {
    expect(prefersReducedMotion(fakeWindow(true))).toBe(true);
    expect(prefersReducedMotion(fakeWindow(false))).toBe(false);
  });

  it('treats a missing window as reduced, so build-time code never animates', () => {
    expect(prefersReducedMotion(null)).toBe(true);
  });
});
