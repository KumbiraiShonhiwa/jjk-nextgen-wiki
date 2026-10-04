/**
 * Cursed-energy field: the home hero's WebGL layer (ADR-007, roadmap A8).
 *
 * A single `Points` cloud driven by one `ShaderMaterial`. Everything the hero animates lives in
 * that material's uniforms, so Anime.js can own them through `animejs/adapters/three` and the
 * WebGL layer and the DOM heading sit on the same timeline rather than two clocks that drift.
 *
 * This module is only ever reached through a dynamic `import()` from the home page, behind the
 * guards in `shouldMount()`. It is counted against the `lazy` budget in budgets.json, not `js`.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
} from 'three';
import 'animejs/adapters/three';

/** Particle counts per quality tier. Small enough that this is never the frame's bottleneck. */
const COUNT = { high: 2600, low: 1100 } as const;

/** Drop a tier after this many consecutive slow frames (~20 ms, i.e. under 50 fps). */
const SLOW_FRAME_MS = 20;
const SLOW_FRAME_LIMIT = 30;

export interface Field {
  /** The material whose uniforms Anime.js animates. */
  material: ShaderMaterial;
  /** Stop rendering and release every GPU resource. */
  dispose: () => void;
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSize;
  attribute float aScale;
  attribute float aPhase;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    // Slow drift plus a per-particle bob, so the field breathes instead of sliding as one sheet.
    float t = uTime * 0.12 + aPhase;
    p.x += sin(t) * 0.22;
    p.y += cos(t * 0.8) * 0.18 + uTime * 0.015;
    // Wrap vertically so the column never empties out.
    p.y = mod(p.y + 3.0, 6.0) - 3.0;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // Perspective-correct point size, scaled by the intensity the timeline drives.
    gl_PointSize = uSize * aScale * uIntensity * (1.0 / -mv.z);
    vAlpha = aScale * uIntensity;
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying float vAlpha;

  void main() {
    // Round, soft-edged point. The glow is baked here rather than added with a bloom pass:
    // a post-processing chain would cost more than the whole field does.
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = dot(d, d);
    if (r > 0.25) discard;
    float falloff = 1.0 - smoothstep(0.0, 0.25, r);
    // Weighted toward blue: violet is the highlight on the brightest motes, not the body colour.
    vec3 colour = mix(uColorA, uColorB, clamp(vAlpha * 0.45, 0.0, 1.0));
    gl_FragColor = vec4(colour, falloff * falloff * vAlpha * 0.72);
  }
`;

function buildGeometry(count: number): BufferGeometry {
  const position = new Float32Array(count * 3);
  const scale = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    position[i * 3] = (Math.random() - 0.5) * 7;
    position[i * 3 + 1] = (Math.random() - 0.5) * 6;
    // Pushed back and spread deeper: near particles were rendering as large bokeh discs.
    position[i * 3 + 2] = (Math.random() - 0.5) * 3.5 - 1.6;
    scale[i] = 0.35 + Math.random() * 0.65;
    phase[i] = Math.random() * Math.PI * 2;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('aScale', new Float32BufferAttribute(scale, 1));
  g.setAttribute('aPhase', new Float32BufferAttribute(phase, 1));
  return g;
}

/** Reads a CSS custom property off the document so the field uses the same tokens as everything else. */
function token(name: string, fallback: string): Color {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  try {
    return new Color(raw || fallback);
  } catch {
    return new Color(fallback);
  }
}

/**
 * Mounts the field onto `canvas`. Returns null when a WebGL context cannot be created, which is
 * normal in headless browsers and on blocked GPUs — the caller keeps the static SVG hero.
 */
export function mountField(canvas: HTMLCanvasElement): Field | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
  } catch {
    return null;
  }

  let tier: keyof typeof COUNT = 'high';
  const scene = new Scene();
  const camera = new PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.z = 4;

  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      // The timeline fades this from 0, so the field never pops in at full strength.
      uIntensity: { value: 0 },
      uSize: { value: 68 },
      uColorA: { value: token('--ce-blue', '#5b8cff') },
      uColorB: { value: token('--ce-violet', '#b06cff') },
      uResolution: { value: new Vector2(1, 1) },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  let geometry = buildGeometry(COUNT[tier]);
  let points = new Points(geometry, material);
  scene.add(points);

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    // Cap the pixel ratio: a 3x phone would quadruple the fill cost for no visible gain.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    material.uniforms.uResolution!.value.set(w, h);
  };
  resize();

  /** Swap to a cheaper geometry in place, keeping the material (and its live tweens) intact. */
  const downgrade = () => {
    if (tier === 'low') return;
    tier = 'low';
    scene.remove(points);
    geometry.dispose();
    geometry = buildGeometry(COUNT.low);
    points = new Points(geometry, material);
    scene.add(points);
  };

  // performance.now() rather than three's Clock, which is deprecated as of r186.
  let last = performance.now();
  let slowFrames = 0;
  let frame = 0;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    frame = requestAnimationFrame(tick);
    const now = performance.now();
    const delta = Math.min((now - last) / 1000, 0.1); // clamp: a backgrounded tab must not jump the field
    last = now;
    // uTime is advanced here rather than tweened: it is a clock, not a property with a target.
    material.uniforms.uTime!.value += delta;
    renderer.render(scene, camera);

    if (delta * 1000 > SLOW_FRAME_MS) {
      if (++slowFrames >= SLOW_FRAME_LIMIT) {
        downgrade();
        slowFrames = 0;
      }
    } else if (slowFrames > 0) {
      slowFrames--;
    }
  };
  frame = requestAnimationFrame(tick);

  const onResize = () => resize();
  window.addEventListener('resize', onResize, { passive: true });

  // Never burn a frame on a hidden tab.
  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
    } else if (!stopped) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    material,
    dispose: () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      scene.remove(points);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
