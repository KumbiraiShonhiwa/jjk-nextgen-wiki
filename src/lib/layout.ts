/**
 * Deterministic force-directed layout (Fruchterman–Reingold), run at build time so the graph page
 * ships final positions: no layout work on the client and no jump on load.
 */

export interface Point {
  x: number;
  y: number;
}

export interface LayoutOptions {
  width: number;
  height: number;
  iterations?: number;
  /** Seed for the initial placement; same seed and input give the same layout. */
  seed?: number;
  /** Keep nodes this far from the edges. */
  padding?: number;
}

/** Small, fast, seedable PRNG (mulberry32). */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function forceLayout(nodes: string[], links: [string, string][], opts: LayoutOptions): Map<string, Point> {
  const { width, height, iterations = 400, seed = 7, padding = 40 } = opts;
  const rand = random(seed);
  const ids = [...new Set(nodes)].sort();
  const n = ids.length;
  const out = new Map<string, Point>();
  if (n === 0) return out;

  const index = new Map(ids.map((id, i) => [id, i]));
  const edges = links
    .map(([a, b]) => [index.get(a), index.get(b)] as const)
    .filter((e): e is readonly [number, number] => e[0] !== undefined && e[1] !== undefined && e[0] !== e[1])
    // Canonical order, so the same graph given in a different order sums forces identically.
    .map(([a, b]) => (a < b ? ([a, b] as const) : ([b, a] as const)))
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);

  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const k = Math.sqrt((innerW * innerH) / n) * 0.9; // ideal edge length
  const pos = ids.map(() => ({ x: padding + rand() * innerW, y: padding + rand() * innerH }));

  let temperature = innerW / 8;
  const cooling = temperature / (iterations + 1);

  for (let iter = 0; iter < iterations; iter++) {
    const disp = ids.map(() => ({ x: 0, y: 0 }));

    // Every pair repels.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i]!.x - pos[j]!.x;
        let dy = pos[i]!.y - pos[j]!.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          dx = rand() - 0.5;
          dy = rand() - 0.5;
          dist = 0.01;
        }
        const force = (k * k) / dist;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        disp[i]!.x += fx;
        disp[i]!.y += fy;
        disp[j]!.x -= fx;
        disp[j]!.y -= fy;
      }
    }

    // Linked nodes attract.
    for (const [a, b] of edges) {
      const dx = pos[a]!.x - pos[b]!.x;
      const dy = pos[a]!.y - pos[b]!.y;
      const dist = Math.max(Math.hypot(dx, dy), 0.01);
      const force = (dist * dist) / k;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      disp[a]!.x -= fx;
      disp[a]!.y -= fy;
      disp[b]!.x += fx;
      disp[b]!.y += fy;
    }

    // Weak pull to the centre keeps disconnected parts on screen.
    for (let i = 0; i < n; i++) {
      disp[i]!.x += (width / 2 - pos[i]!.x) * 0.02 * k;
      disp[i]!.y += (height / 2 - pos[i]!.y) * 0.02 * k;
    }

    for (let i = 0; i < n; i++) {
      const d = disp[i]!;
      const len = Math.max(Math.hypot(d.x, d.y), 0.01);
      const step = Math.min(len, temperature);
      pos[i]!.x = clamp(pos[i]!.x + (d.x / len) * step, padding, width - padding);
      pos[i]!.y = clamp(pos[i]!.y + (d.y / len) * step, padding, height - padding);
    }
    temperature = Math.max(temperature - cooling, 0.5);
  }

  ids.forEach((id, i) => out.set(id, { x: round(pos[i]!.x), y: round(pos[i]!.y) }));
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 10) / 10;
