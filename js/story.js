// Story mode — the industry as a city.
//
// One building per company that is still standing today. One storey per
// acquisition it made, stacked in the order the deals closed, with storey
// height set by the announced price — so a building's total height is the money
// it spent buying its way to where it is. Press play and the city builds itself
// between 1983 and 2026.
//
// Deals that never closed are here too, as ghost storeys: red outlines hanging
// beside the building at the height they would have occupied. The largest of
// them, WorldCom's $129B bid for Sprint, is taller than most finished buildings
// on the plaza.
//
// Height is linear in deal value with a minimum, so the smallest deals are
// visible at all; exact figures ride on the labels and in the ledger. The
// architecture is borrowed from Chicago — bundled tubes, art-deco setbacks,
// terracotta, Chicago School masonry — and carries no meaning at all: massing,
// façade and crown are decoration, and only storey height is data. Perspective
// makes 3D heights hard to compare precisely, so the flat bar chart on the page
// stays the accurate view and this is the one you walk around.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import {
  CHAPTERS, DEALS, START_YEAR,
  byId, finalName, nameAt, FAMILIES, money, yr,
} from './model.js';

// --------------------------------------------------------------- constants --
const VALUE_SCALE = 0.049;   // world units per $B
const MIN_FLOOR = 0.55;      // so a $1B deal is still a visible storey
const FLOOR_GAP = 0.06;
const PLINTH_H = 1.2;
const TOWER_W = 3.0;
const ASSET_W = 2.25;        // partial asset buys are set back from the façade

const GRID_COLS = 4;
const GRID_STEP = 9.2;       // block pitch: building + pavement + street
const BLOCK_W = 6.4;         // pavement slab around each building
const ROAD_W = 2.8;
const MONUMENT_Z = -27.5;   // behind the plaza, so the empty 1983 city still has a subject

const RISE_YEARS = 0.55;     // how long a storey takes to slide into place

const TAU = Math.PI * 2;
/** Deterministic 0..1 — the surroundings must look the same on every visit. */
const noise = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
// A warm horizon under a soft blue zenith. Grey is the thing that made the
// earlier version feel like a simulation rather than a designed scene, so there
// is none of it in the palette — the neutrals are all warm.
const SKY_TOP = 0x4d86c6;
const SKY_MID = 0xa6c9e6;
const SKY_HORIZON = 0xf1e4cf;
// Low and a little behind the default view, so the sun is actually in frame and
// the buildings throw long afternoon shadows across the plaza.
const SUN_DIR = new THREE.Vector3(0.402, 0.156, -0.903).normalize();
const RIDGES = [
  { radius: 400, min: 14, max: 40, seed: 8.9, peak: '#a9b3cd', haze: '#f1e4cf' },
  { radius: 345, min: 11, max: 32, seed: 4.2, peak: '#98a5c4', haze: '#f1e4cf' },
  { radius: 300, min: 8, max: 25, seed: 1.7, peak: '#8493b8', haze: '#f1e4cf' },
  { radius: 232, min: 5, max: 15, seed: 6.4, peak: '#7d8a9e', haze: '#f1e4cf' },
];

// The city sits on a paved plaza, inside a wider low-rise city that fades into
// haze.
const COLOR = {
  land: 0x9db07f,       // open country around the city
  plaza: 0xdbcaa6,      // the paved ground the blocks sit on
  street: 0xeadcba,     // soft bands, no asphalt and no lane markings
  pavement: 0xf2e6cc,   // block plinths, a shade lighter so they read as raised
  leafA: 0x7f9f6b,
  leafB: 0x94b07a,
  trunk: 0xa08a6d,
  ghost: 0xd03b3b,
  pending: 0x8d8578,
  beacon: 0x2a78d6,
  stone: 0xd2c0a2,
};

const OUTSKIRTS = 26;   // where the plaza ends and the surroundings begin

// Architecture, borrowed from Chicago. Massing, façade and crown are decoration
// — only storey HEIGHT carries data. `profile` returns the width multiplier at a
// given fraction of the finished height, which is what gives each building its
// setbacks and taper.
const STYLES = {
  bundle: {
    label: 'Bundled tube, after the Sears Tower',
    wall: '#f0e7d8', plan: 'box',
    profile: (f) => (f < 0.40 ? 1 : f < 0.64 ? 0.84 : f < 0.84 ? 0.64 : 0.46),
    crown: 'antennas',
  },
  taper: {
    label: 'Tapered tube, after the John Hancock Center',
    wall: '#5b6b86', plan: 'box',
    profile: (f) => 1 - f * 0.44,
    crown: 'antennas',
  },
  limestone: {
    label: 'Limestone slab, after the Aon Center',
    wall: '#f6efe2', plan: 'slab',
    profile: () => 1,
    crown: 'parapet',
  },
  deco: {
    label: 'Art-deco setbacks, after the Board of Trade',
    wall: '#dcc59a', plan: 'box',
    profile: (f) => (f < 0.48 ? 1 : f < 0.76 ? 0.79 : 0.58),
    crown: 'pyramid',
  },
  gothic: {
    label: 'Neo-Gothic, after the Tribune Tower',
    wall: '#e7dbc4', plan: 'box',
    profile: (f) => (f < 0.85 ? 1 : 0.7),
    crown: 'pinnacles',
  },
  terracotta: {
    label: 'White terracotta, after the Wrigley Building',
    wall: '#faf4e9', plan: 'box',
    profile: (f) => (f < 0.7 ? 1 : 0.76),
    crown: 'clocktower',
  },
  glassbox: {
    label: 'Steel and glass, after 860–880 Lake Shore Drive',
    wall: '#6b8a90', plan: 'slab',
    profile: () => 1,
    crown: 'parapet',
  },
  round: {
    label: 'Cylindrical, after Marina City',
    wall: '#e5c9bd', plan: 'round',
    profile: () => 1,
    crown: 'disc',
  },
  masonry: {
    label: 'Chicago School masonry, after the Monadnock Building',
    wall: '#b06d4d', plan: 'slab',
    profile: () => 1,
    crown: 'cornice',
  },
};
// The tallest buildings get the styles that were invented for tall buildings.
const TALL_ORDER = ['bundle', 'taper', 'limestone', 'deco', 'gothic', 'terracotta', 'glassbox', 'round'];
const LOW_ORDER = ['masonry', 'round', 'terracotta', 'glassbox', 'gothic', 'deco'];

/** A unit cube with chamfered edges and slightly rounded vertical corners.
 *  Hard 90-degree edges are the giveaway that something was thrown together —
 *  a chamfer a few centimetres wide catches the sun along every arris and is
 *  most of the difference between "boxes" and "buildings". */
function chamferedBox(bevel = 0.028, radius = 0.05, curve = 3) {
  const hw = 0.5 - bevel;
  const r = Math.min(radius, hw * 0.9);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hw);
  shape.lineTo(hw - r, -hw);
  shape.quadraticCurveTo(hw, -hw, hw, -hw + r);
  shape.lineTo(hw, hw - r);
  shape.quadraticCurveTo(hw, hw, hw - r, hw);
  shape.lineTo(-hw + r, hw);
  shape.quadraticCurveTo(-hw, hw, -hw, hw - r);
  shape.lineTo(-hw, -hw + r);
  shape.quadraticCurveTo(-hw, -hw, -hw + r, -hw);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 1 - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: curve,
  });
  geo.rotateX(-Math.PI / 2);
  geo.center();
  geo.computeVertexNormals();
  geo.deleteAttribute('uv');
  return geo;
}

/** Footprint in x and z for a given style at a given width. */
function planDims(style, w) {
  return style.plan === 'slab' ? { x: w * 1.34, z: w * 0.66 } : { x: w, z: w };
}

const CAR_COLORS = [0xf2ece1, 0x8fa5ab, 0xc98d6f, 0x9cba91, 0xe9d9bd, 0x6d7d94];

const floorHeight = (valueB) => Math.max(MIN_FLOOR, (valueB || 0) * VALUE_SCALE);

/** How long a chapter plays, scaled to the years it covers. */
const chapterSeconds = (ch) => Math.min(16, Math.max(5, 4.5 + (ch.yearTo - ch.yearFrom) * 1.05));

// ------------------------------------------------------------------ towers --
// A building is one surviving company plus everything that ended up inside it.
// Companies that never bought anyone still get a plot — a low-rise is an honest
// picture of a company that did not spend its way anywhere.
function buildTowers() {
  const groups = [];
  for (const fam of FAMILIES) {
    if (fam.standalone) {
      for (const id of fam.lanes) groups.push({ id, lanes: [id], name: finalName(id), absorbed: 0 });
    } else {
      groups.push({ id: fam.id, lanes: fam.lanes, name: fam.name, absorbed: fam.absorbed });
    }
  }

  const towers = groups.map((g) => {
    const inside = new Set(g.lanes);
    const acquisitions = DEALS
      .filter((d) => (d.type === 'merge' || d.type === 'asset') && inside.has(d.acquirer))
      .sort((a, b) => a.year - b.year);

    let top = PLINTH_H;
    const floors = acquisitions.map((d) => {
      const h = floorHeight(d.valueB);
      const floor = { deal: d, base: top, h, narrow: d.type === 'asset' };
      top += h + FLOOR_GAP;
      return floor;
    });

    const founder = byId.get(g.id);
    const heightAt = (year) => floors.reduce(
      (h, f) => (f.deal.year <= year ? f.base + f.h + FLOOR_GAP : h), PLINTH_H);

    return {
      ...g,
      founder,
      born: founder ? Math.max(founder.born, START_YEAR) : START_YEAR,
      floors,
      height: top,
      total: acquisitions.reduce((t, d) => t + (d.valueB || 0), 0),
      heightAt,
      ghosts: DEALS.filter((d) => d.type === 'failed' && inside.has(d.acquirer)),
      pending: DEALS.filter((d) => d.type === 'pending' && inside.has(d.acquirer)),
      ownership: DEALS.filter((d) => d.type === 'external' && !d.hideNode && inside.has(d.target)),
    };
  });

  // Tallest at the back so nothing important hides behind anything else.
  towers.sort((a, b) => b.height - a.height);
  const rows = Math.ceil(towers.length / GRID_COLS);
  towers.forEach((t, i) => {
    const row = Math.floor(i / GRID_COLS);
    const col = i % GRID_COLS;
    t.x = (col - (GRID_COLS - 1) / 2) * GRID_STEP;
    t.z = (row - (rows - 1) / 2) * GRID_STEP;
    t.style = STYLES[i < 8 ? TALL_ORDER[i] : LOW_ORDER[(i - 8) % LOW_ORDER.length]];
    t.allDeals = [...t.floors.map((f) => f.deal), ...t.ghosts, ...t.pending, ...t.ownership];
  });
  return towers;
}

/** A soft elliptical smudge, used as a contact shadow under each building.
 *  Shadow maps alone leave everything looking like it is hovering; a short
 *  ambient-occlusion falloff at the base is what actually sets an object down. */
function contactTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 62);
  grad.addColorStop(0, 'rgba(60,46,28,0.55)');
  grad.addColorStop(0.42, 'rgba(60,46,28,0.28)');
  grad.addColorStop(0.72, 'rgba(60,46,28,0.08)');
  grad.addColorStop(1, 'rgba(60,46,28,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft flat blob — used for the sun's halo and for the clouds. */
function blobTexture(alpha, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 62);
  for (const [at, mul] of stops) grad.addColorStop(at, `rgba(255,255,255,${(alpha * mul).toFixed(3)})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A ring of hills on the horizon. Unlit and unfogged — this is scenery, so it
 *  is painted with aerial perspective (hazy at the base, cooler at the peaks)
 *  rather than dropped into the lighting model. */
function makeRidge({ radius, min, max, seed, peak, haze }, gapAt, gapHalf) {
  const segments = 200;
  const position = [];
  const color = [];
  const heightAt = (a) => {
    const n = 0.5 + 0.5 * (
      Math.sin(a * 3 + seed) * 0.44
      + Math.sin(a * 7 + seed * 2.3) * 0.28
      + Math.sin(a * 13 + seed * 4.1) * 0.18
      + Math.sin(a * 23 + seed * 1.7) * 0.1);
    return min + (max - min) * n;
  };
  const base = -1;
  const p = new THREE.Color(peak);
  const h = new THREE.Color(haze);
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * TAU;
    const a1 = ((i + 1) / segments) * TAU;
    // Leave the water's quarter open, so that horizon is lake meeting sky.
    const off = Math.abs(((a0 - gapAt + Math.PI) % TAU + TAU) % TAU - Math.PI);
    if (off < gapHalf) continue;
    const x0 = Math.sin(a0) * radius, z0 = Math.cos(a0) * radius;
    const x1 = Math.sin(a1) * radius, z1 = Math.cos(a1) * radius;
    const y0 = heightAt(a0), y1 = heightAt(a1);
    position.push(x0, base, z0, x1, base, z1, x1, y1, z1);
    position.push(x0, base, z0, x1, y1, z1, x0, y0, z0);
    color.push(h.r, h.g, h.b, h.r, h.g, h.b, p.r, p.g, p.b);
    color.push(h.r, h.g, h.b, p.r, p.g, p.b, p.r, p.g, p.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, fog: false,
  }));
}

/** A point walking clockwise round a square loop of half-size h. */
function loopPoint(s, h, out) {
  const side = h * 2;
  const p = ((s % (side * 4)) + side * 4) % (side * 4);
  if (p < side) out.set(-h + p, 0, h);
  else if (p < side * 2) out.set(h, 0, h - (p - side));
  else if (p < side * 3) out.set(h - (p - side * 2), 0, -h);
  else out.set(-h, 0, -h + (p - side * 3));
  return out;
}

// ------------------------------------------------------------------- AO ----
// Screen-space ambient occlusion off the depth buffer. Shadow maps give you the
// sun; this gives you the darkening where surfaces meet — inside setbacks, where
// a building lands on its plinth, along a street. It is the difference between
// a scene that is lit and a scene that is modelled.
const AO_SAMPLES = 16;
const RESOLVE_SHADER = {
  uniforms: {
    tColor: { value: null },
    tDepth: { value: null },
    uExposure: { value: 1.14 },
    uProjInv: { value: new THREE.Matrix4() },
    uResolution: { value: new THREE.Vector2() },
    uProjScale: { value: 1 },
    uRadius: { value: 0.85 },
    uIntensity: { value: 0.72 },
    uBias: { value: 0.09 },
    uTint: { value: new THREE.Color(0x4a3a26) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tColor;
    uniform sampler2D tDepth;
    uniform float uExposure;
    uniform mat4 uProjInv;
    uniform vec2 uResolution;
    uniform float uProjScale;
    uniform float uRadius;
    uniform float uIntensity;
    uniform float uBias;
    uniform vec3 uTint;
    varying vec2 vUv;

    // The scene is rendered to a linear target, so this pass owns exposure,
    // tone mapping and the transfer function as well as the occlusion.
    vec3 aces(vec3 c) {
      const mat3 IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
      const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
      c = IN * c;
      vec3 a = c * (c + 0.0245786) - 0.000090537;
      vec3 b = c * (0.983729 * c + 0.432951) + 0.238081;
      return clamp(OUT * (a / b), 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(pow(c, vec3(0.4166667)) * 1.055 - 0.055, c * 12.92, step(c, vec3(0.0031308)));
    }

    vec3 viewPos(vec2 uv, float d) {
      vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      vec4 v = uProjInv * ndc;
      return v.xyz / v.w;
    }

    void main() {
      vec4 base = texture2D(tColor, vUv);
      float d = texture2D(tDepth, vUv).x;
      if (d >= 0.9999) {                                  // sky: no occlusion
        gl_FragColor = vec4(toSRGB(aces(base.rgb * uExposure)), 1.0);
        return;
      }

      vec2 texel = 1.0 / uResolution;
      vec3 P = viewPos(vUv, d);

      // Normal from neighbouring depth, picking the nearer side of each axis so
      // silhouette edges do not smear the basis.
      float dxr = texture2D(tDepth, vUv + vec2(texel.x, 0.0)).x;
      float dxl = texture2D(tDepth, vUv - vec2(texel.x, 0.0)).x;
      float dyu = texture2D(tDepth, vUv + vec2(0.0, texel.y)).x;
      float dyd = texture2D(tDepth, vUv - vec2(0.0, texel.y)).x;
      vec3 ddx = abs(dxr - d) < abs(dxl - d)
        ? viewPos(vUv + vec2(texel.x, 0.0), dxr) - P
        : P - viewPos(vUv - vec2(texel.x, 0.0), dxl);
      vec3 ddy = abs(dyu - d) < abs(dyd - d)
        ? viewPos(vUv + vec2(0.0, texel.y), dyu) - P
        : P - viewPos(vUv - vec2(0.0, texel.y), dyd);
      vec3 N = normalize(cross(ddx, ddy));

      // Ring samples, rotated per pixel so the pattern never bands.
      float ang = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
      float px = uRadius * uProjScale / max(-P.z, 0.001);
      float occ = 0.0;
      for (int i = 0; i < ${AO_SAMPLES}; i++) {
        float fi = float(i);
        float a = ang + fi * 2.3999632;                    // golden angle
        float rr = px * (0.28 + 0.72 * sqrt((fi + 0.5) / float(${AO_SAMPLES})));
        vec2 uv2 = vUv + vec2(cos(a), sin(a)) * rr * texel;
        float d2 = texture2D(tDepth, uv2).x;
        if (d2 >= 0.9999) continue;
        vec3 diff = viewPos(uv2, d2) - P;
        float dist = length(diff);
        if (dist < 1e-4) continue;
        float fall = smoothstep(uRadius * 1.25, uRadius * 0.2, dist);
        occ += max(0.0, dot(diff / dist, N) - uBias) * fall;
      }
      float ao = clamp(1.0 - (occ / float(${AO_SAMPLES})) * uIntensity * 3.4, 0.0, 1.0);
      base.rgb *= mix(uTint, vec3(1.0), 0.5 + 0.5 * ao);
      gl_FragColor = vec4(toSRGB(aces(base.rgb * uExposure)), 1.0);
    }
  `,
};

// ================================================================== engine ==
export function createStory(root) {
  const stage = root.querySelector('#story-stage');
  const labelLayer = root.querySelector('#story-labels');
  const towers = buildTowers();
  const disposables = [];
  const track = (x) => { disposables.push(x); return x; };

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(SKY_HORIZON, 0.0042);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 900);
  camera.position.set(0, 30, 70);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  // Supersample: the composer means MSAA no longer reaches the canvas, and
  // rendering above the display's own ratio is better anti-aliasing anyway.
  renderer.setPixelRatio(Math.min(devicePixelRatio * 1.3, 2));

  // The scene renders into a linear target that carries its own depth; the
  // resolve pass then reads colour and depth together and writes the canvas.
  // Ping-ponging a composer over a shared depth texture is a feedback loop.
  const sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
  });
  renderer.toneMapping = THREE.NoToneMapping;   // the resolve pass owns it

  const resolve = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial(RESOLVE_SHADER),
  );
  resolve.frustumCulled = false;
  const resolveScene = new THREE.Scene().add(resolve);
  const resolveCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  resolve.material.uniforms.tColor.value = sceneTarget.texture;
  resolve.material.uniforms.tDepth.value = sceneTarget.depthTexture;
  const ao = resolve.material.uniforms;

  const labelRenderer = new CSS2DRenderer({ element: labelLayer });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 9;
  controls.maxDistance = 240;
  controls.maxPolarAngle = Math.PI * 0.485;   // never below street level

  // -------------------------------------------------------------- daylight --
  const sky = new THREE.Mesh(
    track(new THREE.SphereGeometry(560, 32, 16)),
    track(new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(SKY_TOP) },
        mid: { value: new THREE.Color(SKY_MID) },
        horizon: { value: new THREE.Color(SKY_HORIZON) },
      },
      vertexShader: `varying vec3 vPos;
        void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; varying vec3 vPos;
        void main(){
          float h = clamp(normalize(vPos).y, -0.1, 1.0);
          vec3 lower = mix(horizon, mid, smoothstep(0.0, 0.045, h));
          gl_FragColor = vec4(mix(lower, top, smoothstep(0.03, 0.34, h)), 1.0);
        }`,
    })),
  );
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xe2edff, 0xa89b7c, 1.02));
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.9);
  sun.position.copy(SUN_DIR).multiplyScalar(260);
  sun.castShadow = true;
  sun.shadow.mapSize.set(3072, 3072);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 520;
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 176;
  sun.shadow.camera.bottom = -110;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);

  // A fill from the camera side, so a backlit façade is still a pale stone wall.
  const fill = new THREE.DirectionalLight(0xdce9ff, 0.62);
  fill.position.set(-0.3, 0.55, 1).multiplyScalar(80);
  scene.add(fill);

  // The sun itself, with a halo, so the light has a source you can see.
  {
    const sunAt = SUN_DIR.clone().multiplyScalar(430);
    // Glare, not a sticker: a wide, very gradual falloff with a small bright
    // core. A hard-edged disc was the single most artificial thing in the sky.
    const glare = track(blobTexture(1, [
      [0, 0.62], [0.05, 0.42], [0.13, 0.2], [0.28, 0.07], [0.55, 0.015], [1, 0],
    ]));
    for (const [size, opacity] of [[210, 0.85], [92, 0.6], [30, 0.55]]) {
      const halo = new THREE.Sprite(track(new THREE.SpriteMaterial({
        map: glare,
        color: 0xfff3dd,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })));
      halo.position.copy(sunAt);
      halo.scale.setScalar(size);
      scene.add(halo);
    }
  }

  // A few soft clouds, drifting. Cheap, and the sky stops being an empty field.
  const clouds = [];
  {
    const tex = track(blobTexture(0.9, [[0, 1], [0.45, 0.62], [1, 0]]));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.4;
      const r = 150 + ((i * 37) % 90);
      const puff = new THREE.Group();
      for (let b = 0; b < 3; b++) {
        const sprite = new THREE.Sprite(track(new THREE.SpriteMaterial({
          map: tex, transparent: true, opacity: 0.5 + ((i + b) % 3) * 0.1,
          depthWrite: false, fog: false,
        })));
        sprite.scale.set(34 + b * 9, 17 + b * 4, 1);
        sprite.position.set((b - 1) * 17, (b % 2) * 4, 0);
        puff.add(sprite);
      }
      puff.position.set(Math.sin(a) * r, 62 + ((i * 19) % 34), Math.cos(a) * r);
      scene.add(puff);
      clouds.push({ node: puff, r, a, speed: 0.006 + (i % 4) * 0.0015 });
    }
  }

  // Mountains on the horizon, painted rather than lit — near ridges darker,
  // far ones hazier, each fading into the sky along its base.
  for (const r of RIDGES) {
    const mesh = makeRidge(r, Math.PI / 2, 0);
    track(mesh.geometry);
    track(mesh.material);
    scene.add(mesh);
  }

  // ------------------------------------------------------------ the ground --
  const span = GRID_STEP * GRID_COLS;

  const flat = (w, d, colour, y, extra = {}) => {
    const mesh = new THREE.Mesh(
      track(new THREE.PlaneGeometry(w, d)),
      track(new THREE.MeshStandardMaterial({ color: colour, roughness: 1, ...extra })),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };

  // Open country, then the paved plaza the city stands on.
  flat(1600, 1600, COLOR.land, 0);
  flat(span + GRID_STEP * 2.4, span + GRID_STEP * 2.4, COLOR.plaza, 0.01);


  // Streets: soft bands a shade lighter than the ground. No asphalt, no lane
  // markings — the markings were most of what made the ground look busy.
  {
    const length = span + GRID_STEP * 2;
    const roadGeo = track(new THREE.PlaneGeometry(ROAD_W, length));
    const roadMat = track(new THREE.MeshStandardMaterial({ color: COLOR.street, roughness: 1 }));
    const lines = [];
    for (let i = 0; i <= GRID_COLS; i++) lines.push((i - GRID_COLS / 2) * GRID_STEP);
    for (const at of lines) {
      for (const horizontal of [false, true]) {
        const mesh = new THREE.Mesh(roadGeo, roadMat);
        mesh.rotation.x = -Math.PI / 2;
        if (horizontal) mesh.rotation.z = Math.PI / 2;
        mesh.position.set(horizontal ? 0 : at, 0.02, horizontal ? at : 0);
        mesh.receiveShadow = true;
        scene.add(mesh);
      }
    }
  }

  // A pavement slab under every building.
  {
    const geo = track(new THREE.BoxGeometry(BLOCK_W, 0.16, BLOCK_W));
    const mat = track(new THREE.MeshStandardMaterial({ color: COLOR.pavement, roughness: 0.95 }));
    for (const t of towers) {
      const slab = new THREE.Mesh(geo, mat);
      slab.position.set(t.x, 0.08, t.z);
      slab.receiveShadow = true;
      scene.add(slab);
    }
  }

  // ------------------------------------------------------------ outskirts ---
  // The city we care about, sitting inside an ordinary one that fades into
  // haze. Nothing out here is labelled, so the data buildings stay the heroes
  // while the skyline stops ending in mid-air.
  const extraTrees = [];
  buildSurround();

  function buildSurround() {
    const inner = span / 2 + GRID_STEP * 0.6;
    const clearOfCity = (x, z) => Math.abs(x) > inner || Math.abs(z) > inner;

    {
      const tones = [0xe8dcc4, 0xdccdb0, 0xe3d3bc, 0xcfc0a6, 0xd8cbb4, 0xc4b39a];
      const geo = track(chamferedBox(0.05, 0.07, 2));
      const banks = tones.map((c) => {
        const m = new THREE.InstancedMesh(geo, track(new THREE.MeshStandardMaterial({
          color: c, roughness: 0.92,
        })), 420);
        m.castShadow = true;
        m.receiveShadow = true;
        m.count = 0;
        scene.add(m);
        return m;
      });
      const used = tones.map(() => 0);
      const d3 = new THREE.Object3D();
      let i = 0;
      for (let gx = -10; gx <= 10; gx++) {
        for (let gz = -10; gz <= 10; gz++) {
          const cx = gx * 11.5;
          const cz = gz * 11.5;
          if (!clearOfCity(cx, cz)) continue;
          const away = Math.hypot(cx, cz);
          if (away > 118) continue;
          const n = 2 + Math.floor(noise(i) * 2);
          for (let k = 0; k < n; k++, i++) {
            const b = Math.floor(noise(i * 3 + 1) * tones.length);
            if (used[b] >= 420) continue;
            const h = 0.9 + noise(i * 11) * (away > 62 ? 2.0 : 4.2);
            d3.position.set(
              cx + (noise(i * 13) - 0.5) * 5.2, h / 2,
              cz + (noise(i * 17) - 0.5) * 5.2,
            );
            d3.scale.set(2.2 + noise(i * 5) * 2.8, h, 2.2 + noise(i * 7) * 2.8);
            d3.updateMatrix();
            banks[b].setMatrixAt(used[b]++, d3.matrix);
          }
        }
      }
      banks.forEach((m, k) => { m.count = used[k]; m.instanceMatrix.needsUpdate = true; });
    }
  }

  // ---------------------------------------------------------------- trees ---
  // Trees as clustered low-poly canopies rather than cones on sticks — three
  // overlapping blobs at slightly different scales read as foliage; one cone
  // reads as a toy.
  {
    const canopy = track(new THREE.IcosahedronGeometry(0.5, 0));
    const trunkGeo = track(new THREE.CylinderGeometry(0.055, 0.08, 0.5, 5));
    const trunkMat = track(new THREE.MeshStandardMaterial({ color: COLOR.trunk, roughness: 1 }));
    const leafMats = [
      track(new THREE.MeshStandardMaterial({ color: COLOR.leafA, roughness: 1, flatShading: true })),
      track(new THREE.MeshStandardMaterial({ color: COLOR.leafB, roughness: 1, flatShading: true })),
    ];

    const sites = [];
    for (const t of towers) {
      sites.push([t.x - 2.7, t.z + 2.7], [t.x + 2.7, t.z - 2.7]);
    }
    // A belt of planting around the plaza, so the city sits in something.
    const edge = span / 2 + GRID_STEP * 0.75;
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * TAU;
      const r = edge + 2 + ((i * 13) % 7);
      sites.push([Math.sin(a) * r * 1.05, Math.cos(a) * r]);
    }
    sites.push(...extraTrees);

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, sites.length);
    const blobs = leafMats.map((m) => new THREE.InstancedMesh(canopy, m, sites.length * 2));
    for (const b of blobs) b.castShadow = true;
    const m = new THREE.Object3D();
    const counts = [0, 0];
    sites.forEach(([x, z], i) => {
      const s = 0.9 + ((i * 7) % 5) * 0.1;
      m.scale.setScalar(s);
      m.position.set(x, 0.25 * s, z);
      m.rotation.set(0, 0, 0);
      m.updateMatrix();
      trunks.setMatrixAt(i, m.matrix);
      for (let b = 0; b < 2; b++) {
        const which = (i + b) % 2;
        const k = counts[which]++;
        m.scale.set(s * (b ? 0.78 : 1.05), s * (b ? 0.7 : 0.92), s * (b ? 0.78 : 1.05));
        m.position.set(x + (b ? 0.22 : -0.1), (b ? 0.86 : 0.66) * s, z + (b ? -0.18 : 0.12));
        m.rotation.set(i * 0.7, i * 1.3, b * 0.5);
        m.updateMatrix();
        blobs[which].setMatrixAt(k, m.matrix);
      }
    });
    for (const b of blobs) b.count = Math.max(...counts);
    scene.add(trunks, ...blobs);
  }

  // ----------------------------------------------------------------- cars ---
  const cars = [];
  {
    const bodyGeo = track(new THREE.BoxGeometry(0.66, 0.26, 1.45));
    const cabGeo = track(new THREE.BoxGeometry(0.58, 0.24, 0.68));
    const glassMat = track(new THREE.MeshStandardMaterial({ color: 0x9fb4c6, roughness: 0.25, metalness: 0.5 }));
    // Only the two inner streets carry traffic: enough to feel alive, few enough
    // that the ground stays calm.
    const lines = [1, 3].map((i) => (i - GRID_COLS / 2) * GRID_STEP);
    let k = 0;
    for (const at of lines) {
      for (const horizontal of [false, true]) {
        for (const dir of [1, -1]) {
          const mat = track(new THREE.MeshStandardMaterial({
            color: CAR_COLORS[k % CAR_COLORS.length], roughness: 0.45, metalness: 0.35,
          }));
          const node = new THREE.Group();
          const body = new THREE.Mesh(bodyGeo, mat);
          body.position.y = 0.18;
          body.castShadow = true;
          const cab = new THREE.Mesh(cabGeo, glassMat);
          cab.position.set(0, 0.4, -0.12);
          node.add(body, cab);
          scene.add(node);
          cars.push({
            node, horizontal, at, dir,
            offset: dir > 0 ? -0.72 : 0.72,
            s: (((k * 37) % 100) / 100) * (span + GRID_STEP * 2),
            speed: 3.6 + ((k * 13) % 5) * 0.55,
          });
          k++;
        }
      }
    }
  }

  // ------------------------------------------------------------ buildings --
  // One shared plane and texture for every contact shadow.
  const contactTex = track(contactTexture());
  const contactGeo = track(new THREE.PlaneGeometry(1, 1));
  const contactMat = track(new THREE.MeshBasicMaterial({
    map: contactTex, transparent: true, depthWrite: false, opacity: 0.9,
  }));
  function groundShadow(parent, w, d, y) {
    const mesh = new THREE.Mesh(contactGeo, contactMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(w * 2.3, d * 2.3, 1);
    mesh.position.y = y;
    mesh.renderOrder = 1;
    parent.add(mesh);
    return mesh;
  }

  const boxGeo = track(chamferedBox());
  const cylGeo = track(new THREE.CylinderGeometry(0.5, 0.5, 1, 40, 1));
  const edgeGeo = track(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)));

  /** What a building wears on its head. Pure decoration — it sits above the
   *  parapet and is never a storey, so it never stands for a deal. */
  function makeCrown(style, w, keep) {
    const group = new THREE.Group();
    // A crown in a deeper tone of the building's own colour, never a grey cap.
    const stone = keep(new THREE.MeshStandardMaterial({
      color: new THREE.Color(style.wall).multiplyScalar(0.88), roughness: 0.9,
    }));
    const metal = keep(new THREE.MeshStandardMaterial({
      color: new THREE.Color(style.wall).multiplyScalar(0.7), roughness: 0.55, metalness: 0.3,
    }));
    const add = (mesh, y) => { mesh.position.y = y; mesh.castShadow = true; group.add(mesh); return mesh; };

    const parapet = new THREE.Mesh(style.plan === 'round' ? cylGeo : boxGeo, stone);
    const pd = planDims(style, w + 0.26);
    parapet.scale.set(pd.x, 0.18, pd.z);
    add(parapet, 0.09);

    switch (style.crown) {
      case 'antennas': {
        for (const [dx, h] of [[-w * 0.16, 2.6], [w * 0.16, 1.9]]) {
          const mast = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.045, 0.06, h, 6)), metal);
          mast.position.x = dx;
          add(mast, 0.18 + h / 2);
        }
        break;
      }
      case 'pyramid': {
        const step = new THREE.Mesh(boxGeo, stone);
        step.scale.set(w * 0.62, 0.5, w * 0.62);
        add(step, 0.43);
        const cap = new THREE.Mesh(keep(new THREE.ConeGeometry(w * 0.34, 1.1, 4)), stone);
        cap.rotation.y = Math.PI / 4;
        add(cap, 1.23);
        break;
      }
      case 'pinnacles': {
        const spike = keep(new THREE.ConeGeometry(0.16, 0.95, 5));
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const m = new THREE.Mesh(spike, stone);
          m.position.set(dx * w * 0.36, 0, dz * w * 0.36);
          add(m, 0.65);
        }
        const centre = new THREE.Mesh(keep(new THREE.ConeGeometry(w * 0.22, 1.6, 8)), stone);
        add(centre, 0.98);
        break;
      }
      case 'clocktower': {
        const shaft = new THREE.Mesh(boxGeo, stone);
        shaft.scale.set(w * 0.46, 1.5, w * 0.46);
        add(shaft, 0.93);
        const cupola = new THREE.Mesh(keep(new THREE.CylinderGeometry(w * 0.16, w * 0.24, 0.5, 10)), stone);
        add(cupola, 1.93);
        break;
      }
      case 'disc': {
        const roof = new THREE.Mesh(cylGeo, stone);
        roof.scale.set(w * 1.14, 0.22, w * 1.14);
        add(roof, 0.28);
        break;
      }
      case 'cornice': {
        const cornice = new THREE.Mesh(boxGeo, stone);
        const cd = planDims(style, w + 0.9);
        cornice.scale.set(cd.x, 0.4, cd.z);
        add(cornice, 0.34);
        break;
      }
      default:
        break;
    }
    return group;
  }
  const picks = [];

  // Flat matte volumes, shaded by height: each storey is a little lighter than
  // the one below it. A window grid at this scale was sub-pixel speckle; a
  // value gradient is what actually gives a massed form depth.
  function facade(tower, width, height, depth, lift) {
    const round = tower.style.plan === 'round';
    const colour = new THREE.Color(tower.style.wall).multiplyScalar(0.88 + 0.16 * lift);
    const mesh = new THREE.Mesh(round ? cylGeo : boxGeo, track(new THREE.MeshStandardMaterial({
      color: colour, roughness: 0.82, metalness: 0.02, flatShading: false,
    })));
    mesh.scale.set(width, height, depth);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function outlineBox(width, height, depth, color, opacity) {
    const group = new THREE.Group();
    const shell = new THREE.Mesh(boxGeo, track(new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false,
    })));
    shell.scale.set(width, height, depth);
    const lines = new THREE.LineSegments(edgeGeo, track(new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.75,
    })));
    lines.scale.set(width, height, depth);
    group.add(shell, lines);
    return group;
  }

  for (const t of towers) {
    const group = new THREE.Group();
    group.position.set(t.x, 0, t.z);
    scene.add(group);
    t.group = group;

    // The width at a given height comes from the style, so setbacks and taper
    // are architecture; the height of each storey is still the deal value.
    const widthAt = (base) => TOWER_W * t.style.profile(Math.min(1, base / Math.max(t.height, 0.001)));
    t.topWidth = widthAt(t.height);

    // The plinth is the founding company itself — it appears the year it did.
    const baseDims = planDims(t.style, widthAt(0) + 0.4);
    groundShadow(group, baseDims.x, baseDims.z, 0.17);
    const plinth = facade(t, baseDims.x, PLINTH_H, baseDims.z, 0);
    plinth.position.y = 0.16 + PLINTH_H / 2;
    plinth.userData.tower = t;
    group.add(plinth);
    picks.push(plinth);

    for (const f of t.floors) {
      const w = widthAt(f.base) * (f.narrow ? 0.78 : 1);
      const dims = planDims(t.style, w);
      f.dx = dims.x / 2;
      f.dz = dims.z / 2;
      const mesh = facade(t, dims.x, f.h, dims.z, Math.min(1, f.base / Math.max(t.height, 0.001)));
      mesh.position.y = 0.16 + f.base + f.h / 2;
      mesh.userData.deal = f.deal.id;
      mesh.userData.tower = t;
      group.add(mesh);
      picks.push(mesh);
      f.mesh = mesh;

      // Walking up to a building is what makes its storeys readable, so each one
      // carries a name that only appears once you have selected it.
      const el = document.createElement('span');
      el.className = 'floor-label';
      el.innerHTML = `<b>${f.deal.target ? nameAt(f.deal.target, f.deal.year) : f.deal.title}</b>`
        + `<i>${yr(f.deal.year)} · ${money(f.deal.valueB)}</i>`;
      f.label = new CSS2DObject(el);
      f.label.position.set(f.dx + 1.9, 0.16 + f.base + f.h / 2, f.dz - 0.2);
      f.label.visible = false;
      group.add(f.label);
    }

    // The crown: a parapet plus whatever the style tops itself off with.
    t.roof = makeCrown(t.style, t.topWidth, track);
    group.add(t.roof);

    // Deals that died, at the height they would have reached.
    t.ghostParts = t.ghosts.map((d) => {
      const h = floorHeight(d.valueB);
      const node = outlineBox(TOWER_W * 0.94, h, TOWER_W * 0.94, COLOR.ghost, 0.13);
      node.position.set(TOWER_W * 1.1 + 1.7, 0.16 + t.heightAt(d.year) + h / 2, 0);
      node.visible = false;
      group.add(node);
      const hit = new THREE.Mesh(boxGeo, track(new THREE.MeshBasicMaterial({ visible: false })));
      hit.scale.set(TOWER_W, h, TOWER_W);
      hit.position.copy(node.position);
      hit.userData.deal = d.id;
      group.add(hit);
      picks.push(hit);
      return { deal: d, node };
    });

    // Announced, not yet closed: scaffolding on the roof.
    let pendingBase = t.height;
    t.pendingParts = t.pending.map((d) => {
      const h = floorHeight(d.valueB);
      const node = outlineBox(t.topWidth, h, t.topWidth, COLOR.pending, 0.1);
      node.position.set(0, 0.16 + pendingBase + h / 2, 0);
      pendingBase += h + FLOOR_GAP;
      node.visible = false;
      group.add(node);
      const hit = new THREE.Mesh(boxGeo, track(new THREE.MeshBasicMaterial({ visible: false })));
      hit.scale.set(TOWER_W, h, TOWER_W);
      hit.position.copy(node.position);
      hit.userData.deal = d.id;
      group.add(hit);
      picks.push(hit);
      return { deal: d, node };
    });

    // A company changing hands doesn't add a storey — it changes the nameplate.
    t.beaconParts = t.ownership.map((d) => {
      const mesh = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.24, 12, 10)),
        track(new THREE.MeshStandardMaterial({
          color: COLOR.beacon, emissive: COLOR.beacon, emissiveIntensity: 0.35, roughness: 0.5,
        })),
      );
      mesh.position.set(TOWER_W / 2 + 0.3, 0.16 + t.heightAt(d.year) - 0.35, TOWER_W / 2 + 0.3);
      mesh.visible = false;
      mesh.userData.deal = d.id;
      group.add(mesh);
      picks.push(mesh);
      return { deal: d, mesh };
    });

    const el = document.createElement('span');
    el.className = 'tower-label';
    el.innerHTML = `<b>${t.name}</b>${t.total || t.floors.length
      ? `<i>${money(t.total)} · ${t.floors.length} ${t.floors.length === 1 ? 'deal' : 'deals'}</i>`
      : '<i>never bought anyone</i>'}`;
    t.label = new CSS2DObject(el);
    t.labelEl = el;
    t.label.visible = false;
    group.add(t.label);
  }

  // ------------------------------------------------------------- monument --
  // The Bell System made no acquisitions, so it gets no storeys. It is the
  // ground the rest of the city was built on, and reads as a footprint.
  const monument = new THREE.Group();
  monument.position.set(0, 0, MONUMENT_Z);
  scene.add(monument);
  {
    const slab = new THREE.Mesh(boxGeo, track(new THREE.MeshStandardMaterial({
      color: COLOR.stone, roughness: 0.9,
    })));
    slab.scale.set(13, 1.6, 6.5);
    slab.position.y = 0.8;
    slab.castShadow = true;
    slab.receiveShadow = true;
    slab.userData.company = 'bellsystem';
    monument.add(slab);
    picks.push(slab);
    monument.userData.slab = slab;

    const el = document.createElement('span');
    el.className = 'tower-label tower-label--monument';
    el.innerHTML = '<b>The Bell System</b><i>Broken up 1 January 1984 — every building here is a piece of it, or grew in the space it left</i>';
    const label = new CSS2DObject(el);
    label.position.set(0, 2.8, 0);
    monument.add(label);
    monument.userData.label = label;
  }

  // -------------------------------------------------------------- playback --
  const chapters = CHAPTERS.map((ch) => ({
    ...ch,
    // Which buildings this chapter is about, straight from the deal years.
    active: towers.filter((t) => t.allDeals.some((d) => d.year >= ch.yearFrom && d.year <= ch.yearTo)),
  }));

  const state = {
    chapter: 0,
    year: START_YEAR,
    playing: false,
    userMoved: false,
    hovered: null,
    selected: null,
  };

  const camGoal = new THREE.Vector3();
  const lookGoal = new THREE.Vector3();
  const shot = { centre: new THREE.Vector3(), dist: 80, azimuth: 0, pitch: 0.44 };
  let spin = 0;

  function fitTo(list, year, pad) {
    if (!list.length) list = towers;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxH = 6;
    for (const t of list) {
      minX = Math.min(minX, t.x - BLOCK_W / 2); maxX = Math.max(maxX, t.x + BLOCK_W / 2);
      minZ = Math.min(minZ, t.z - BLOCK_W / 2); maxZ = Math.max(maxZ, t.z + BLOCK_W / 2);
      maxH = Math.max(maxH, t.heightAt(year));
    }
    // Before the breakup the plaza is nearly empty, so keep the monument in shot.
    if (year < 1985.5) { minZ = Math.min(minZ, MONUMENT_Z - 5); maxZ = Math.max(maxZ, MONUMENT_Z + 5); }
    shot.centre.set((minX + maxX) / 2, maxH * 0.46, (minZ + maxZ) / 2);
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(camera.aspect, 1));
    const fitY = (maxH / 2 + 4) / Math.tan(vFov / 2);
    const fitX = ((maxX - minX) / 2 + 5) / Math.tan(hFov / 2);
    const fitZ = ((maxZ - minZ) / 2 + 5) / Math.tan(hFov / 2);
    shot.dist = Math.max(fitY, fitX, fitZ, 20) * pad;
  }

  function frameChapter(ch) {
    fitTo(ch.active, ch.yearTo, ch.active.length ? 1.35 : 1.2);
    shot.azimuth = 0;
    shot.pitch = 0.21;
    spin = 0;
    state.selected = null;
    aimCamera();
  }

  function focusTower(t) {
    state.selected = t;
    const h = t.heightAt(state.year);
    shot.centre.set(t.x, h * 0.52, t.z);
    const vFov = (camera.fov * Math.PI) / 180;
    shot.dist = Math.max((h / 2 + 4) / Math.tan(vFov / 2), 16) * 1.36;
    shot.azimuth = Math.atan2(t.x, t.z + 30);
    shot.pitch = 0.17;
    spin = 0;
    state.userMoved = false;
    aimCamera();
  }

  function aimCamera() {
    lookGoal.copy(shot.centre);
    const a = shot.azimuth + spin;
    camGoal.set(
      lookGoal.x + Math.sin(a) * shot.dist * Math.cos(shot.pitch),
      Math.max(4, lookGoal.y + Math.sin(shot.pitch) * shot.dist),
      lookGoal.z + Math.cos(a) * shot.dist * Math.cos(shot.pitch),
    );
  }

  function setChapter(i, { play = true } = {}) {
    state.chapter = Math.min(chapters.length - 1, Math.max(0, i));
    const ch = chapters[state.chapter];
    state.year = ch.yearFrom;
    state.playing = play && ch.yearTo > ch.yearFrom;
    frameChapter(ch);
    onChapterChange(ch, state.chapter);
    refresh();
  }

  // ------------------------------------------------------------- per-frame --
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const dummy = new THREE.Object3D();
  const walkPoint = new THREE.Vector3();

  function build() {
    for (const t of towers) {
      const alive = state.year >= t.born - 0.01;
      t.group.visible = alive;
      if (!alive) continue;

      let top = PLINTH_H;
      for (const f of t.floors) {
        const g = Math.min(1, Math.max(0, (state.year - f.deal.year) / RISE_YEARS));
        if (g <= 0) { f.mesh.visible = false; continue; }
        const k = easeOut(g);
        f.mesh.visible = true;
        f.mesh.scale.y = f.h * k;
        f.mesh.position.y = 0.16 + f.base + (f.h * k) / 2;
        top = f.base + f.h * k;
      }
      t.roof.position.y = 0.16 + top + 0.09;
      for (const p of t.ghostParts) p.node.visible = state.year >= p.deal.year;
      for (const p of t.pendingParts) p.node.visible = state.year >= p.deal.year - 0.6;
      for (const b of t.beaconParts) b.mesh.visible = state.year >= b.deal.year;
    }

    // The monument stands until the breakup, then leaves its footprint behind.
    const gone = Math.min(1, Math.max(0, (state.year - 1984) / 0.8));
    monument.userData.slab.scale.y = 1.6 * (1 - gone * 0.88);
    monument.userData.slab.position.y = (1.6 * (1 - gone * 0.88)) / 2;
    // Once the city has grown past it the plaque is just something in the way.
    monument.userData.label.visible = state.year < 1986;
  }

  function traffic(dt) {
    for (const c of clouds) {
      c.a += c.speed * dt;
      c.node.position.set(Math.sin(c.a) * c.r, c.node.position.y, Math.cos(c.a) * c.r);
    }
    const length = span + GRID_STEP * 2;
    for (const c of cars) {
      c.s = (c.s + c.speed * dt) % length;
      const along = c.s - length / 2;
      const p = c.dir > 0 ? along : -along;
      if (c.horizontal) {
        c.node.position.set(p, 0.02, c.at + c.offset);
        c.node.rotation.y = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        c.node.position.set(c.at + c.offset, 0.02, p);
        c.node.rotation.y = c.dir > 0 ? 0 : Math.PI;
      }
    }
  }

  const projected = new THREE.Vector3();
  const worldPos = new THREE.Vector3();
  const candidates = [];
  const placed = [];
  const floorCandidates = [];
  const floorPlaced = [];
  let stageW = 1;
  let stageH = 1;

  /** The narration panel, the deal feed and the transport bar own their corners;
   *  a label that lands on one is dropped rather than printed over it. */
  function inChrome(sx, sy) {
    if (sy < 66 || sy > stageH - 96) return true;
    if (stageW > 860 && sx > stageW - 360 && sy < 400) return true;
    if (sx < 590 && sy > stageH - 436) return true;
    return false;
  }

  function placeLabels() {
    const ch = chapters[state.chapter];
    const show = new Set(state.selected ? [state.selected] : ch.active);
    if (state.hovered) show.add(state.hovered);
    if (!show.size) for (const t of towers) show.add(t);

    // Storey names, for the building you have walked up to. Tall storeys — the
    // deals that actually shaped the company — keep their label when short ones
    // would collide with them; the rest stay in the card and the ledger.
    floorCandidates.length = 0;
    for (const t of towers) {
      const on = t === state.selected && t.group.visible;
      for (const f of t.floors) {
        if (!on || !f.mesh.visible || f.mesh.scale.y < f.h * 0.9) { f.label.visible = false; continue; }
        worldPos.set(t.x + f.label.position.x, f.label.position.y, t.z + f.label.position.z);
        projected.copy(worldPos).project(camera);
        if (projected.z > 1 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1) {
          f.label.visible = false;
          continue;
        }
        floorCandidates.push({
          f,
          sx: (projected.x * 0.5 + 0.5) * stageW,
          sy: (-projected.y * 0.5 + 0.5) * stageH,
        });
      }
    }
    floorCandidates.sort((a, b) => b.f.h - a.f.h);
    floorPlaced.length = 0;
    for (const c of floorCandidates) {
      const clash = inChrome(c.sx, c.sy)
        || floorPlaced.some((p) => Math.abs(p.sy - c.sy) < 36 && Math.abs(p.sx - c.sx) < 200);
      c.f.label.visible = !clash;
      if (!clash) floorPlaced.push(c);
    }

    candidates.length = 0;
    for (const t of towers) {
      if (!show.has(t) || !t.group.visible) { t.label.visible = false; continue; }
      t.label.position.set(0, 0.16 + t.heightAt(state.year) + 1.3, 0);
      t.group.getWorldPosition(worldPos);
      worldPos.y = t.label.position.y;
      projected.copy(worldPos).project(camera);
      if (projected.z > 1 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1) {
        t.label.visible = false;
        continue;
      }
      candidates.push({
        t,
        sx: (projected.x * 0.5 + 0.5) * stageW,
        sy: (-projected.y * 0.5 + 0.5) * stageH,
        depth: camera.position.distanceToSquared(worldPos),
        priority: t === state.hovered || t === state.selected ? -1 : 0,
      });
    }

    candidates.sort((a, b) => a.priority - b.priority || a.depth - b.depth);
    placed.length = 0;
    for (const c of candidates) {
      const clash = inChrome(c.sx, c.sy)
        || placed.some((p) => Math.abs(p.sy - c.sy) < 46 && Math.abs(p.sx - c.sx) < 176);
      c.t.label.visible = !clash;
      c.t.labelEl.classList.toggle('is-focus', c.priority < 0);
      if (!clash) placed.push(c);
    }
  }

  let running = false;
  let last = performance.now();

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const ch = chapters[state.chapter];
    if (state.playing) {
      state.year = Math.min(ch.yearTo, state.year + ((ch.yearTo - ch.yearFrom) / chapterSeconds(ch)) * dt);
      if (state.year >= ch.yearTo - 1e-6) { state.playing = false; onChapterEnd(state.chapter); }
      onYear(state.year);
    }

    if (!state.userMoved) {
      spin += dt * 0.03;
      aimCamera();
      camera.position.lerp(camGoal, 1 - Math.pow(0.002, dt));
      controls.target.lerp(lookGoal, 1 - Math.pow(0.002, dt));
    }
    controls.update();
    build();
    traffic(dt);
    placeLabels();
    ao.uProjInv.value.copy(camera.projectionMatrixInverse);
    renderer.setRenderTarget(sceneTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(resolveScene, resolveCam);
    labelRenderer.render(scene, camera);
  }

  function refresh() {
    build();
    traffic(0);
    placeLabels();
    onYear(state.year);
  }

  // ---------------------------------------------------------- interaction --
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(pointer, camera);
    for (const hit of ray.intersectObjects(picks, false)) {
      if (hit.object.parent?.visible === false) continue;
      if (!hit.object.visible && !hit.object.userData.deal) continue;
      return hit.object.userData;
    }
    return null;
  }

  const describe = (data) => (!data ? null : {
    deal: data.deal,
    company: data.company,
    tower: data.tower && !data.deal ? {
      name: data.tower.name,
      total: data.tower.total,
      floors: data.tower.floors.length,
      absorbed: data.tower.absorbed,
      since: data.tower.born,
      pending: data.tower.pending.length,
      blocked: data.tower.ghosts.length,
      style: data.tower.style.label,
    } : undefined,
  });

  renderer.domElement.addEventListener('pointermove', (e) => {
    const found = pick(e);
    state.hovered = found?.tower || null;
    renderer.domElement.style.cursor = found ? 'pointer' : 'grab';
    onHover(describe(found), e);
  });
  renderer.domElement.addEventListener('pointerleave', () => { state.hovered = null; onHover(null); });
  renderer.domElement.addEventListener('pointerdown', () => { state.userMoved = true; });
  renderer.domElement.addEventListener('click', (e) => {
    const found = pick(e);
    if (!found) { state.selected = null; frameChapter(chapters[state.chapter]); onPick(null, e); return; }
    if (found.tower) focusTower(found.tower);
    onPick(describe(found), e);
  });

  // -------------------------------------------------------------- resize --
  function resize() {
    const w = stage.clientWidth || innerWidth;
    const h = stage.clientHeight || innerHeight;
    stageW = w; stageH = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
    sceneTarget.setSize(buf.x, buf.y);
    ao.uResolution.value.copy(buf);
    ao.uProjScale.value = 0.5 * buf.y * camera.projectionMatrix.elements[5];
    ao.uProjInv.value.copy(camera.projectionMatrixInverse);
    labelRenderer.setSize(w, h);
  }

  // --------------------------------------------------------------- hooks --
  let onChapterChange = () => {};
  let onChapterEnd = () => {};
  let onYear = () => {};
  let onHover = () => {};
  let onPick = () => {};

  return {
    chapters,
    state,
    towers,
    start() { running = true; last = performance.now(); resize(); loop(); },
    stop() { running = false; },
    resize,
    setChapter,
    play() {
      const ch = chapters[state.chapter];
      if (state.year >= ch.yearTo - 1e-6) state.year = ch.yearFrom;
      state.playing = true;
    },
    pause() { state.playing = false; },
    scrubTo(year) {
      state.playing = false;
      state.year = year;
      const idx = chapters.findIndex((c, i) => year <= c.yearTo || i === chapters.length - 1);
      if (idx >= 0 && idx !== state.chapter) {
        state.chapter = idx;
        frameChapter(chapters[idx]);
        onChapterChange(chapters[idx], idx);
      }
      refresh();
    },
    resetView() { state.userMoved = false; frameChapter(chapters[state.chapter]); },
    dispose() {
      running = false;
      controls.dispose();
      sceneTarget.dispose();
      resolve.geometry.dispose();
      resolve.material.dispose();
      renderer.dispose();
      for (const d of disposables) d.dispose?.();
      stage.replaceChildren();
      labelLayer.replaceChildren();
    },
    on(name, fn) {
      if (name === 'chapter') onChapterChange = fn;
      else if (name === 'chapterEnd') onChapterEnd = fn;
      else if (name === 'year') onYear = fn;
      else if (name === 'hover') onHover = fn;
      else if (name === 'pick') onPick = fn;
    },
  };
}
