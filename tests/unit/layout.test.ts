import { describe, expect, it } from 'vitest';
import { forceLayout, random } from '../../src/lib/layout';

const OPTS = { width: 1000, height: 640, padding: 40 };
const ring = (n: number) => Array.from({ length: n }, (_, i) => `n${i}`);

describe('random', () => {
  it('is deterministic per seed and in [0, 1)', () => {
    const a = random(42);
    const b = random(42);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(random(1)()).not.toBe(random(2)());
  });
});

describe('forceLayout', () => {
  const nodes = ring(14);
  const links: [string, string][] = nodes.map((n, i) => [n, nodes[(i + 1) % nodes.length]!]);

  it('is deterministic and independent of input order', () => {
    const a = forceLayout(nodes, links, OPTS);
    const b = forceLayout([...nodes].reverse(), [...links].reverse(), OPTS);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });

  it('places every node inside the padded bounds', () => {
    for (const { x, y } of forceLayout(nodes, links, OPTS).values()) {
      expect(x).toBeGreaterThanOrEqual(40);
      expect(x).toBeLessThanOrEqual(960);
      expect(y).toBeGreaterThanOrEqual(40);
      expect(y).toBeLessThanOrEqual(600);
    }
  });

  it('keeps nodes apart', () => {
    const pts = [...forceLayout(nodes, links, OPTS).values()];
    let min = Infinity;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) min = Math.min(min, Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y));
    expect(min).toBeGreaterThan(60);
  });

  it('pulls linked nodes closer than unlinked ones on average', () => {
    // Two triangles joined by nothing: within-triangle distances should be shorter.
    const tri: [string, string][] = [['a', 'b'], ['b', 'c'], ['c', 'a'], ['d', 'e'], ['e', 'f'], ['f', 'd']];
    const p = forceLayout(['a', 'b', 'c', 'd', 'e', 'f'], tri, OPTS);
    const d = (u: string, v: string) => Math.hypot(p.get(u)!.x - p.get(v)!.x, p.get(u)!.y - p.get(v)!.y);
    const linked = (d('a', 'b') + d('b', 'c') + d('d', 'e')) / 3;
    const unlinked = (d('a', 'd') + d('b', 'e') + d('c', 'f')) / 3;
    expect(linked).toBeLessThan(unlinked);
  });

  it('ignores self-links and links to unknown nodes, and handles empty input', () => {
    expect(forceLayout([], [], OPTS).size).toBe(0);
    expect(forceLayout(['a'], [['a', 'a'], ['a', 'zz']], OPTS).size).toBe(1);
  });
});
