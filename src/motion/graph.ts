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

/** Centre of a node's dot, in viewBox units. */
function centre(node: HTMLElement, box: DOMRect) {
  const dot = node.querySelector<HTMLElement>('[data-dot]') ?? node;
  const r = dot.getBoundingClientRect();
  return {
    x: ((r.left + r.width / 2 - box.left) / box.width) * GRAPH_VIEW.width,
    y: ((r.top + r.height / 2 - box.top) / box.height) * GRAPH_VIEW.height,
  };
}

function redraw({ root, nodes, lines }: Parts) {
  const box = root.getBoundingClientRect();
  for (const line of lines) {
    const a = nodes.get(line.dataset.from!);
    const b = nodes.get(line.dataset.to!);
    if (!a || !b) continue;
    const p = centre(a, box);
    const q = centre(b, box);
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
  const draggables: Draggable[] = [];
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  const ticker = createTimer({ autoplay: false, loop: true, duration: 1000, onUpdate: () => redraw(parts) });
  const wake = () => {
    clearTimeout(settleTimer);
    ticker.play();
  };
  const sleep = () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      ticker.pause();
      redraw(parts);
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

    draggables.push(
      createDraggable(handle, {
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
      }),
    );

    // A drag must not also follow the link.
    node.addEventListener('click', (e) => {
      if (moved) {
        e.preventDefault();
        moved = false;
      }
    });
  }

  const onResize = () => redraw(parts);
  addEventListener('resize', onResize);
  redraw(parts);

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
