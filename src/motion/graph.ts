import { createAnimatable } from 'animejs/animatable';
import type { AnimatableObject } from 'animejs';
import { animate } from 'animejs/animation';
import { createDraggable, type Draggable } from 'animejs/draggable';
import { createDrawable } from 'animejs/svg';
import { createTimer } from 'animejs/timer';
import { createTimeline } from 'animejs/timeline';
import { stagger } from 'animejs/utils';
import { durations, eases } from './tokens';
import { springs } from './interactions';

/** viewBox of the edge layer; node positions are percentages of the same box. */
export const GRAPH_VIEW = { width: 1000, height: 640 } as const;

/** How strongly neighbours follow a dragged node (0 = not at all, 1 = rigidly). */
const FOLLOW = 0.32;
/** Keep redrawing edges this long after the last release, while springs settle. */
const SETTLE_MS = 1400;

interface Parts {
  root: HTMLElement;
  nodes: Map<string, HTMLElement>;
  lines: SVGLineElement[];
}

function collect(root: HTMLElement): Parts {
  const nodes = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>('[data-node]').forEach((n) => nodes.set(n.dataset.node!, n));
  return { root, nodes, lines: [...root.querySelectorAll<SVGLineElement>('line[data-from]')] };
}

/** Neighbour slugs per node, from the rendered edges (hidden edges included: they still pull). */
function adjacency(lines: SVGLineElement[]) {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
  for (const l of lines) {
    add(l.dataset.from!, l.dataset.to!);
    add(l.dataset.to!, l.dataset.from!);
  }
  return adj;
}

/** A node's live translation away from its resting place, in CSS pixels. */
type OffsetOf = (slug: string) => { x: number; y: number };

interface Rest {
  /** Node centres at rest, in viewBox units. */
  base: Map<string, { x: number; y: number }>;
  /** CSS pixels → viewBox units. */
  sx: number;
  sy: number;
}

/**
 * Measures where every node sits at rest, in viewBox units, plus the px → viewBox scale.
 * Only called when nothing is moving (first paint, resize), so live drag and follow
 * transforms are zero and don't pollute the baseline.
 */
function measure({ root, nodes }: Parts): Rest {
  const box = root.getBoundingClientRect();
  const sx = box.width ? GRAPH_VIEW.width / box.width : 0;
  const sy = box.height ? GRAPH_VIEW.height / box.height : 0;
  const base = new Map<string, { x: number; y: number }>();
  for (const [slug, node] of nodes) {
    const dot = node.querySelector<HTMLElement>('[data-dot]') ?? node;
    const r = dot.getBoundingClientRect();
    base.set(slug, { x: (r.left + r.width / 2 - box.left) * sx, y: (r.top + r.height / 2 - box.top) * sy });
  }
  return { base, sx, sy };
}

/**
 * Repositions every edge from numbers already held in memory: the resting centres from `measure`
 * plus each node's live offset, read from its Draggable and follow Animatable. Deliberately reads
 * no layout — this runs every frame of a drag, and a getBoundingClientRect() per edge endpoint
 * here meant a forced reflow per edge per frame.
 */
function redraw({ lines }: Parts, rest: Rest, offsetOf: OffsetOf) {
  const point = (slug: string) => {
    const b = rest.base.get(slug);
    if (!b) return undefined;
    const o = offsetOf(slug);
    return { x: b.x + o.x * rest.sx, y: b.y + o.y * rest.sy };
  };
  for (const line of lines) {
    const p = point(line.dataset.from!);
    const q = point(line.dataset.to!);
    if (!p || !q) continue;
    line.setAttribute('x1', String(p.x));
    line.setAttribute('y1', String(p.y));
    line.setAttribute('x2', String(q.x));
    line.setAttribute('y2', String(q.y));
  }
}

/** Entrance: edges draw from their source while nodes bloom out from the centre of the graph. */
export function graphIntro(root: HTMLElement) {
  const lines = root.querySelectorAll<SVGLineElement>('line[data-from]');
  const dots = root.querySelectorAll<HTMLElement>('[data-node] [data-drag]');
  return createTimeline()
    .add(dots, { scale: [0, 1], opacity: [0, 1], duration: durations.md, ease: eases.enter, delay: stagger(35, { from: 'center' }) })
    .add(createDrawable(lines), { draw: ['0 0', '0 1'], duration: durations.lg, ease: eases.move, delay: stagger(25) }, '-=300');
}

/**
 * Rubber-band physics: drag any node and it stretches its edges, its neighbours lean after it,
 * and on release everything springs home. Returns a cleanup function.
 */
export function graphPhysics(root: HTMLElement): () => void {
  const parts = collect(root);
  const adj = adjacency(parts.lines);
  const follow = new Map<string, AnimatableObject>();
  const dragging = new Map<string, Draggable>();
  const draggables: Draggable[] = [];
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let rest = measure(parts);

  // Drag offset and neighbour-follow offset compose: [data-follow] wraps [data-drag], and both
  // carry plain translations. Both are read straight off the anime.js objects.
  const offsetOf: OffsetOf = (slug) => {
    const f = follow.get(slug);
    const d = dragging.get(slug);
    return { x: (f ? Number(f.x()) : 0) + (d ? d.x : 0), y: (f ? Number(f.y()) : 0) + (d ? d.y : 0) };
  };

  const ticker = createTimer({ autoplay: false, loop: true, duration: 1000, onUpdate: () => redraw(parts, rest, offsetOf) });
  const wake = () => {
    clearTimeout(settleTimer);
    ticker.play();
  };
  const sleep = () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      ticker.pause();
      redraw(parts, rest, offsetOf);
    }, SETTLE_MS);
  };

  for (const [slug, node] of parts.nodes) {
    const wrapper = node.querySelector<HTMLElement>('[data-follow]');
    if (wrapper) follow.set(slug, createAnimatable(wrapper, { x: { duration: durations.md, ease: eases.enter }, y: { duration: durations.md, ease: eases.enter } }));
  }

  for (const [slug, node] of parts.nodes) {
    const handle = node.querySelector<HTMLElement>('[data-drag]');
    if (!handle) continue;
    let moved = false;
    const neighbours = [...(adj.get(slug) ?? [])].map((s) => follow.get(s)).filter((a): a is AnimatableObject => !!a);

    const draggable = createDraggable(handle, {
        container: root,
        x: { snap: [0] },
        y: { snap: [0] },
        releaseEase: springs.soft,
        cursor: { onHover: 'grab', onGrab: 'grabbing' },
        onGrab: () => {
          moved = false;
          node.dataset.dragging = '';
          wake();
        },
        onDrag: (d) => {
          moved = true;
          for (const n of neighbours) {
            n.x(d.x * FOLLOW);
            n.y(d.y * FOLLOW);
          }
        },
        onRelease: () => {
          delete node.dataset.dragging;
          for (const n of neighbours) {
            n.x(0, durations.lg, springs.soft);
            n.y(0, durations.lg, springs.soft);
          }
          sleep();
        },
    });
    dragging.set(slug, draggable);
    draggables.push(draggable);

    // A drag must not also follow the link.
    node.addEventListener('click', (e) => {
      if (moved) {
        e.preventDefault();
        moved = false;
      }
    });
  }

  // The resting baseline is layout-dependent, so it is re-measured here and nowhere else.
  const onResize = () => {
    rest = measure(parts);
    redraw(parts, rest, offsetOf);
  };
  addEventListener('resize', onResize);
  redraw(parts, rest, offsetOf);

  return () => {
    clearTimeout(settleTimer);
    removeEventListener('resize', onResize);
    ticker.revert();
    draggables.forEach((d) => d.revert());
    follow.forEach((a) => a.revert());
  };
}

/** Pulse the edges touching a node when it is focused or hovered. */
export function pulseEdges(lines: Element[]) {
  if (!lines.length) return;
  animate(lines, { strokeWidth: [1, 3, 1.5], duration: durations.md, ease: eases.surge });
}
