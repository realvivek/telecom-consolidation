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
  CHAPTERS, DEALS, START_YEAR, END_YEAR,
  byId, finalName, nameAt, FAMILIES, money, yr,
} from './model.js';

// --------------------------------------------------------------- constants --
const VALUE_SCALE = 0.049;   // world units per $B
const MIN_FLOOR = 0.55;      // so a $1B deal is still a visible storey
const FLOOR_GAP = 0.06;
const PLINTH_H = 1.2;
const TOWER_W = 3.0;
const ASSET_W = 2.25;        // partial asset buys are set back from the façade

const GRID_COLS = 3;
// Block pitch: building + pavement + street. Generous, because the labels need
// somewhere to stand as much as the buildings do — shoulder to shoulder, a
// nameplate could not sit over its own roof without landing on its neighbour's.
const GRID_STEP = 13.6;
const FAB_BLOCKS = 8;        // how far the street grid and its blocks run out
const BLOCK_W = 7.6;         // pavement slab around each building
const ROAD_W = 2.8;
const MONUMENT_Z = 0;   // the middle block of the plaza — the city grows around it

const RISE_YEARS = 0.55;     // how long a storey takes to slide into place

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// How long a blocked deal stands in the sky: announced a year out, collapsing
// over the year after. Both the animation and the camera framing read this, so
// a deal can never be in shot for one and out of shot for the other.
const GHOST_BEFORE = 1.1;
const GHOST_AFTER = 0.85;
/** Deterministic 0..1 — the surroundings must look the same on every visit. */
const noise = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
// Night. A near-black zenith falling to the sodium wash a city throws on its
// own sky — the horizon is the brightest part, which is what makes it read as
// a city at night rather than open country in the dark.
const SKY_TOP = 0x0a1326;
const SKY_MID = 0x1a2c47;
const SKY_HORIZON = 0x46495a;
// Low and a little behind the default view, so the moon is in frame and the
// buildings throw long shadows across the plaza.
const SUN_DIR = new THREE.Vector3(0.402, 0.186, -0.903).normalize();
const RIDGES = [
  { radius: 400, min: 14, max: 40, seed: 8.9, peak: '#28334a', haze: '#46495a' },
  { radius: 345, min: 11, max: 32, seed: 4.2, peak: '#222c42', haze: '#46495a' },
  { radius: 300, min: 8, max: 25, seed: 1.7, peak: '#1c2539', haze: '#46495a' },
  { radius: 232, min: 5, max: 15, seed: 6.4, peak: '#171f30', haze: '#46495a' },
];

// The city sits on a paved plaza, inside a wider low-rise city that fades into
// haze. At night the ground is nearly all reflected light, so the neutrals are
// cool and close together — contrast comes from the windows, not the paving.
const COLOR = {
  land: 0x1b2430,       // open country around the city
  plaza: 0x2b3341,      // the paved ground the blocks sit on
  street: 0x353d4d,     // soft bands, no asphalt and no lane markings
  pavement: 0x39424f,   // block plinths, a shade lighter so they read as raised
  leafA: 0x2c4033,
  leafB: 0x354b3c,
  trunk: 0x241f1c,
  ghost: 0xff6b5a,
  pending: 0x7c8798,
  beacon: 0x4da3ff,
  stone: 0x2a3543,
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
    wall: '#93a3bd', plan: 'box',
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
    wall: '#a2bcc0', plan: 'slab',
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
// Reveal and sill are derived from the wall so a style only declares one hue.
// Glazing is a lerp toward a single cool dark rather than a multiply: a
// multiply gives a pale limestone plenty of contrast but crushes a dark blue
// tube to a silhouette, and one near-black building in a pastel city reads as
// a hole punched in it.
const GLAZE = new THREE.Color('#2f3a49');
const SHADE = new THREE.Color('#232b36');
for (const st of Object.values(STYLES)) {
  const wall = new THREE.Color(st.wall);
  st.glass = `#${wall.clone().lerp(GLAZE, 0.56).getHexString()}`;
  st.reveal = `#${wall.clone().lerp(SHADE, 0.74).getHexString()}`;
  st.sill = `#${wall.clone().lerp(new THREE.Color(0xffffff), 0.42).getHexString()}`;
}

const TALL_ORDER = ['bundle', 'taper', 'limestone', 'deco', 'gothic', 'terracotta', 'glassbox', 'round'];
const LOW_ORDER = ['masonry', 'round', 'terracotta', 'glassbox', 'gothic', 'deco'];

const WIN_COLS = 8;   // windows per tile — wide enough that the lit pattern
                      // does not obviously repeat across a façade

/** Windows drawn with a recess, a sill and a lintel rather than a flat swatch.
 *  One window row per tile vertically, so the repeat can be set per storey and
 *  a tall storey gets more rows instead of a squashed grid.
 *
 *  `lit` returns the emissive companion instead: black wall, and each window
 *  filled at its own brightness. Some are dark, a few are bright, most are in
 *  between — a façade where every pane matches reads as a light box, not an
 *  office block at night. */
function facadeTexture({ wall, glass, reveal, sill }, lit = false, seed = 0) {
  const c = document.createElement('canvas');
  c.width = 16 * WIN_COLS;
  c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = lit ? '#000' : wall;
  g.fillRect(0, 0, c.width, 16);
  for (let col = 0; col < WIN_COLS; col++) {
    const x = col * 16;
    if (lit) {
      const r = noise(seed * 31.4 + col * 7.3);
      // A third of the panes are dark, and the rest range from a dim desk lamp
      // to a fully lit floorplate.
      if (r < 0.24) continue;
      const v = 0.34 + ((r - 0.24) / 0.76) ** 1.5 * 0.66;
      const warm = noise(seed * 12.9 + col * 3.1);
      const rr = Math.round(255 * v);
      const gg = Math.round((208 + warm * 34) * v);
      const bb = Math.round((150 + warm * 76) * v);
      g.fillStyle = `rgb(${rr},${gg},${bb})`;
      g.fillRect(x + 4, 3, 8, 9);
      continue;
    }
    g.fillStyle = reveal;                       // the opening, in shadow
    g.fillRect(x + 3, 2, 10, 11);
    g.fillStyle = glass;                        // glazing, set back
    g.fillRect(x + 4, 3, 8, 9);
    g.fillStyle = sill;                         // sill catching the light
    g.fillRect(x + 2, 12, 12, 2);
    g.fillStyle = reveal;                       // lintel above
    g.fillRect(x + 3, 1, 10, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Box-project UVs onto a unit-cube geometry, choosing the plane from the
 *  dominant normal axis. ExtrudeGeometry's own UVs are laid out for a flat
 *  shape, so a façade mapped with them smears; this gives every side face a
 *  clean 0–1 sweep in x/z and 0–1 up in y. `zx` is depth ÷ width, which keeps
 *  windows the same size on the short faces of a slab as on the long ones. */
function boxUV(geo, zx = 1) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) {          // roof and soffit
      u = pos.getX(i) + 0.5;
      v = pos.getZ(i) + 0.5;
    } else if (nx >= nz) {               // the two short faces of a slab
      u = (pos.getZ(i) + 0.5) * zx;
      v = pos.getY(i) + 0.5;
    } else {                             // the two long faces
      u = pos.getX(i) + 0.5;
      v = pos.getY(i) + 0.5;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

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
  return boxUV(geo);
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
//
// A company that never bid for anything gets no building. It used to get a plot
// on the grounds that a low-rise is an honest picture of a company that did not
// spend its way anywhere — but this city is about the deals, and a plot with no
// storeys and no failed bids is a building the story never has a reason to name.
// Standing dark in the middle of the plaza, arriving in some year for no stated
// reason, those read as clutter around the buildings that mean something. They
// are in the ledger and the bubble map, where a company with no acquisitions is
// still a company.
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

  // Only the companies that tried something get a building — a closed deal or a
  // blocked one. A bid that died is a storey the company never got to build, and
  // it still needs a roof to stand over.
  const built = towers.filter((t) => t.floors.length || t.ghosts.length);
  // Tallest at the back so nothing important hides behind anything else.
  built.sort((a, b) => b.height - a.height);
  /*  The Bell System's footprint takes the middle block and the city is laid out
   *  around it. It used to stand on its own behind the plaza, which read as a
   *  grey box outside the square — a thing with no relationship to the city in
   *  front of it. In the middle it is what the caption says it is: the ground
   *  the rest of this was built on. */
  const rows = Math.ceil((built.length + 1) / GRID_COLS);
  const centre = Math.floor(rows / 2) * GRID_COLS + Math.floor(GRID_COLS / 2);
  built.forEach((t, k) => {
    const i = k >= centre ? k + 1 : k;
    const row = Math.floor(i / GRID_COLS);
    const col = i % GRID_COLS;
    t.x = (col - (GRID_COLS - 1) / 2) * GRID_STEP;
    t.z = (row - (rows - 1) / 2) * GRID_STEP;
    t.style = STYLES[k < 8 ? TALL_ORDER[k] : LOW_ORDER[(k - 8) % LOW_ORDER.length]];
    t.allDeals = [...t.floors.map((f) => f.deal), ...t.ghosts, ...t.pending, ...t.ownership];
  });
  return built;
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
    uExposure: { value: 1.5 },
    uProjInv: { value: new THREE.Matrix4() },
    uResolution: { value: new THREE.Vector2() },
    uProjScale: { value: 1 },
    uRadius: { value: 0.85 },
    uIntensity: { value: 0.72 },
    uBias: { value: 0.09 },
    uTint: { value: new THREE.Color(0x232f42) },
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
  // Declared up here because the camera fit reads them, and that runs before
  // the declutter pass these used to sit beside.
  let stageW = 1;
  let stageH = 1;
  let lastPad = { x: -1, y: -1, w: -1, h: -1 };
  // The part of the frame the narration card leaves for the city, in NDC.
  const freeNdc = { cx: 0, cy: 0, hx: 1, hy: 1 };
  /*  Room kept around the city for its nameplates, in pixels: above the skyline
   *  for a plate and its leader, and at each side, because a building standing
   *  at the edge of the frame has nowhere to put its name and loses it.
   *
   *  The headroom has to clear the toolbar as well as the plate. Sixty pixels of
   *  sky above the tallest roof sounds generous until you notice the toolbar is
   *  fifty-six pixels of it, which leaves four — so AT&T, whose roof is at the
   *  top of the shot by definition, had nowhere to put its name in any chapter
   *  where its plate carried a second line. */
  const LABEL_HEADROOM = () => (stageW < 760 ? 92 : 88);
  const LABEL_MARGIN = 52;
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

  // Sky glow above, almost nothing bouncing off the ground: at night the ambient
  // term has to stay low or every window stops reading as lit.
  scene.add(new THREE.HemisphereLight(0x4a648c, 0x14202c, 1.05));
  const sun = new THREE.DirectionalLight(0xb6cdf0, 1.35);
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

  // A fill from the camera side, so a façade turned away from the moon still has
  // a readable edge rather than going to pure black.
  const fill = new THREE.DirectionalLight(0x6d8fb5, 0.55);
  fill.position.set(-0.3, 0.55, 1).multiplyScalar(80);
  scene.add(fill);

  // The moon, with a halo, so the light has a source you can see. Tighter and
  // far dimmer than the sun it replaced — a night sky's glare is a small hard
  // disc with a thin bloom, not a wide wash.
  {
    const sunAt = SUN_DIR.clone().multiplyScalar(430);
    const glare = track(blobTexture(1, [
      [0, 0.9], [0.045, 0.72], [0.08, 0.22], [0.2, 0.06], [0.5, 0.012], [1, 0],
    ]));
    for (const [size, opacity] of [[150, 0.4], [58, 0.44], [21, 0.85]]) {
      const halo = new THREE.Sprite(track(new THREE.SpriteMaterial({
        map: glare,
        color: 0xe6eeff,
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

  // Stars — a single additive point cloud on the sky dome, thinning towards the
  // horizon where the city's own glow washes them out.
  {
    const n = 700;
    const pos = new Float32Array(n * 3);
    const alpha = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = noise(i * 1.7) * TAU;
      const y = 0.06 + noise(i * 5.3) ** 1.6 * 0.94;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      pos[i * 3] = Math.cos(a) * r * 540;
      pos[i * 3 + 1] = y * 540;
      pos[i * 3 + 2] = Math.sin(a) * r * 540;
      alpha[i] = (0.25 + noise(i * 9.1) * 0.75) * Math.min(1, y * 2.4);
    }
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    scene.add(new THREE.Points(geo, track(new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uSize: { value: Math.min(2.4, renderer.getPixelRatio() * 1.6) } },
      vertexShader: `attribute float aAlpha; varying float vA; uniform float uSize;
        void main(){ vA = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * (0.6 + aAlpha); }`,
      fragmentShader: `varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), vA * smoothstep(0.5, 0.0, d));
        }`,
    }))));
  }

  // A few soft clouds, drifting. At night they are darker than the sky they sit
  // in except where the city lights their undersides, so they read as mass
  // rather than as the smoke the white daytime version turned into.
  const clouds = [];
  {
    const tex = track(blobTexture(0.9, [[0, 1], [0.45, 0.62], [1, 0]]));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.4;
      const r = 150 + ((i * 37) % 90);
      const puff = new THREE.Group();
      for (let b = 0; b < 3; b++) {
        const sprite = new THREE.Sprite(track(new THREE.SpriteMaterial({
          map: tex, transparent: true, opacity: 0.2 + ((i + b) % 3) * 0.05,
          color: 0x243040,
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

  // Open country, the paving that runs the whole grid, then the brighter plaza
  // the data blocks stand on.
  flat(1600, 1600, COLOR.land, 0);
  flat(FAB_BLOCKS * 2 * GRID_STEP, FAB_BLOCKS * 2 * GRID_STEP, COLOR.land, 0.005);
  flat(span + GRID_STEP * 2.4, span + GRID_STEP * 2.4, COLOR.plaza, 0.01);


  // Streets: soft bands a shade lighter than the ground. No asphalt, no lane
  // markings — the markings were most of what made the ground look busy. The
  // grid runs the full extent of the city, not just the data blocks, so the
  // surroundings stand on streets like everything else.
  {
    const length = FAB_BLOCKS * 2 * GRID_STEP;
    const roadGeo = track(new THREE.PlaneGeometry(ROAD_W, length));
    const roadMat = track(new THREE.MeshStandardMaterial({ color: COLOR.street, roughness: 1 }));
    const lines = [];
    for (let i = -FAB_BLOCKS; i <= FAB_BLOCKS; i++) lines.push(i * GRID_STEP);
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

  // Windows on the surrounding fabric too. A field of blank boxes standing next
  // to windowed towers is what made the outskirts read as packaging foam, and
  // it is the first thing the eye picks up in a wide shot. Instances vary in
  // size, so the shader divides the instance's own scale by the window pitch —
  // one window is the same size on a two-storey shed as on a ten-storey block.
  // Declared before buildSurround() runs, since that is what reads them.
  const FAB_W = 2.7;    // world units per pair of windows
  const FAB_H = 1.15;   // world units per storey
  const FAB_COLS = 6;   // windows per tile, same reasoning as the towers

  function fabricFacade(hex) {
    const wall = new THREE.Color(hex);
    // Glazing but no glow. The surroundings used to carry an emissive map of
    // their own, which made a lit window mean nothing — the eye had to read the
    // labels to find out which buildings the chapter was about. Now only the
    // story's own towers are lit, and the fabric catches the moon and the
    // street lamps and nothing else.
    const paint = () => {
      const c = document.createElement('canvas');
      c.width = 16 * FAB_COLS;
      c.height = 16;
      const g = c.getContext('2d');
      g.fillStyle = `#${wall.getHexString()}`;
      g.fillRect(0, 0, c.width, 16);
      for (let col = 0; col < FAB_COLS; col++) {
        const x = col * 16;
        g.fillStyle = `#${wall.clone().lerp(GLAZE, 0.5).getHexString()}`;
        g.fillRect(x + 4, 3, 9, 8);
        g.fillStyle = `#${wall.clone().lerp(new THREE.Color(0xffffff), 0.3).getHexString()}`;
        g.fillRect(x + 3, 11, 11, 1);
      }
      const t = track(new THREE.CanvasTexture(c));
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return t;
    };
    const tex = paint();

    const mat = track(new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.94,
    }));
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `
        #include <uv_vertex>
        #if defined( USE_MAP ) && defined( USE_INSTANCING )
          float ax = abs( normal.x ), ay = abs( normal.y ), az = abs( normal.z );
          if ( ay >= ax && ay >= az ) {
            vMapUv = vec2( 0.02, 0.02 );   // roofs and soffits stay blank
            #ifdef USE_EMISSIVEMAP
              vEmissiveMapUv = vec2( 0.02, 0.02 );
            #endif
          } else {
            vec3 iS = vec3(
              length( instanceMatrix[ 0 ].xyz ),
              length( instanceMatrix[ 1 ].xyz ),
              length( instanceMatrix[ 2 ].xyz ) );
            vec2 fs = ax >= az ? vec2( iS.z, iS.y ) : vec2( iS.x, iS.y );
            vec2 fScale = fs / vec2( ${FAB_W.toFixed(2)}, ${FAB_H.toFixed(2)} );
            vMapUv *= fScale;
            #ifdef USE_EMISSIVEMAP
              vEmissiveMapUv *= fScale;
            #endif
          }
        #endif
      `);
    };
    return mat;
  }

  buildSurround();

  function buildSurround() {
    // Which block indices the data city already occupies — the fabric fills
    // every other block on the same grid, so no building stands in a field.
    const rows = Math.ceil(towers.length / GRID_COLS);
    const usedBlock = new Set();
    let minBX = Infinity; let maxBX = -Infinity; let minBZ = Infinity; let maxBZ = -Infinity;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const bx = c - (GRID_COLS - 1) / 2 - 0.5;
        const bz = r - (rows - 1) / 2 - 0.5;
        usedBlock.add(`${bx},${bz}`);
        minBX = Math.min(minBX, bx); maxBX = Math.max(maxBX, bx);
        minBZ = Math.min(minBZ, bz); maxBZ = Math.max(maxBZ, bz);
      }
    }
    const nearData = (bx, bz) => bx >= minBX - 1 && bx <= maxBX + 1
      && bz >= minBZ - 1 && bz <= maxBZ + 1;

    {
      // Night walls: cool and dark, barely separated. All the variation the eye
      // gets out here comes from which windows are lit.
      const tones = [0x2b3441, 0x323b49, 0x28313d, 0x353f4d, 0x2e3744, 0x242c37];
      const geo = track(chamferedBox(0.05, 0.07, 2));
      const banks = tones.map((c) => {
        const m = new THREE.InstancedMesh(geo, fabricFacade(c), 260);
        m.castShadow = true;
        m.receiveShadow = true;
        m.count = 0;
        scene.add(m);
        return m;
      });
      const used = tones.map(() => 0);
      const d3 = new THREE.Object3D();
      let i = 0;
      // One block at a time, on the same lattice as the streets. Each block gets
      // one building or a pair sharing the plot — never a scatter across the
      // roadway, which is what made the old surroundings read as noise.
      for (let gx = -FAB_BLOCKS; gx < FAB_BLOCKS; gx++) {
        for (let gz = -FAB_BLOCKS; gz < FAB_BLOCKS; gz++) {
          const key = `${gx + 0.5},${gz + 0.5}`;
          if (usedBlock.has(key)) continue;
          // Leave a ring of empty blocks around the data city. In 1983 its
          // buildings are a single storey tall, and anything built right up
          // against the plaza hides them completely.
          if (nearData(gx + 0.5, gz + 0.5)) continue;
          const cx = (gx + 0.5) * GRID_STEP;
          const cz = (gz + 0.5) * GRID_STEP;
          const away = Math.hypot(cx, cz);
          i++;
          // Thin out with distance so the far grid dissolves into haze rather
          // than ending in a wall.
          if (noise(i * 2.3) > 1.05 - away / 96) continue;

          const pair = noise(i * 7.7) > 0.62;
          const plots = pair
            ? [[-BLOCK_W * 0.24, BLOCK_W * 0.44], [BLOCK_W * 0.24, BLOCK_W * 0.44]]
            : [[0, BLOCK_W * 0.92]];
          for (const [ox, w] of plots) {
            i++;
            const b = Math.floor(noise(i * 3 + 1) * tones.length);
            if (used[b] >= 260) continue;
            // Low against the plaza, rising with distance. It was the other way
          // round — the tallest fabric stood closest — so the surroundings
          // buried the very buildings the story is about.
          const h = 0.8 + noise(i * 11) * (away < 46 ? 1.5 : away < 74 ? 2.8 : 3.8);
            d3.position.set(cx + ox, h / 2, cz + (noise(i * 17) - 0.5) * 0.8);
            d3.scale.set(w, h, BLOCK_W * (0.62 + noise(i * 7) * 0.3));
            d3.updateMatrix();
            banks[b].setMatrixAt(used[b]++, d3.matrix);
          }
        }
      }
      banks.forEach((m, k) => { m.count = used[k]; m.instanceMatrix.needsUpdate = true; });
    }
  }

  // -------------------------------------------------------------- street ---
  // The things that make a street look inhabited: a kerb to stand the pavement
  // off the road, crossings at the junctions, lamps, and props along the edge.
  const steam = [];
  const steamTex = track(blobTexture(0.85, [[0, 1], [0.5, 0.5], [1, 0]]));
  {
    const lines = [];
    for (let i = 0; i <= GRID_COLS; i++) lines.push((i - GRID_COLS / 2) * GRID_STEP);

    // Kerbs — a lip around each block, one shade under the pavement.
    const kerbMat = track(new THREE.MeshStandardMaterial({ color: 0xcbbb9c, roughness: 1 }));
    const kerbGeo = track(new THREE.BoxGeometry(1, 0.19, 1));
    for (const t of towers) {
      const kerb = new THREE.Mesh(kerbGeo, kerbMat);
      kerb.scale.set(BLOCK_W + 0.5, 1, BLOCK_W + 0.5);
      kerb.position.set(t.x, 0.075, t.z);
      kerb.receiveShadow = true;
      scene.add(kerb);
    }

    // Zebra crossings on the approaches to every junction.
    const zebraGeo = track(new THREE.PlaneGeometry(0.42, 2.1));
    const zebraMat = track(new THREE.MeshStandardMaterial({ color: 0xf7efdc, roughness: 1 }));
    const zebras = new THREE.InstancedMesh(zebraGeo, zebraMat, lines.length * lines.length * 16);
    let zn = 0;
    const zd = new THREE.Object3D();
    zd.rotation.x = -Math.PI / 2;
    for (const cx of lines) {
      for (const cz of lines) {
        for (const [ox, oz, turn] of [[0, -1, 0], [0, 1, 0], [-1, 0, 1], [1, 0, 1]]) {
          for (let k = 0; k < 4; k++) {
            const off = (k - 1.5) * 0.62;
            zd.position.set(
              cx + ox * (ROAD_W / 2 + 1.3) + (turn ? 0 : off), 0.03,
              cz + oz * (ROAD_W / 2 + 1.3) + (turn ? off : 0),
            );
            zd.rotation.z = turn ? Math.PI / 2 : 0;
            zd.updateMatrix();
            zebras.setMatrixAt(zn++, zd.matrix);
          }
        }
      }
    }
    zebras.count = zn;
    zebras.receiveShadow = true;
    scene.add(zebras);

    // Lamp posts along every kerb, with a warm globe.
    const postGeo = track(new THREE.CylinderGeometry(0.045, 0.06, 2.6, 6));
    const armGeo = track(new THREE.SphereGeometry(0.13, 8, 6));
    const postMat = track(new THREE.MeshStandardMaterial({ color: 0x4e4a44, roughness: 0.6, metalness: 0.3 }));
    const globeMat = track(new THREE.MeshStandardMaterial({
      color: 0xfff4dc, emissive: 0xffd79a, emissiveIntensity: 0.55, roughness: 0.4,
    }));
    const spots = [];
    for (const t of towers) {
      const e = BLOCK_W / 2 - 0.35;
      spots.push([t.x - e, t.z - e], [t.x + e, t.z + e]);
    }
    const posts = new THREE.InstancedMesh(postGeo, postMat, spots.length);
    const globes = new THREE.InstancedMesh(armGeo, globeMat, spots.length);
    posts.castShadow = true;
    const pd = new THREE.Object3D();
    spots.forEach(([x, z], i) => {
      pd.position.set(x, 1.46, z);
      pd.updateMatrix();
      posts.setMatrixAt(i, pd.matrix);
      pd.position.y = 2.85;
      pd.updateMatrix();
      globes.setMatrixAt(i, pd.matrix);
    });
    scene.add(posts, globes);

    // A pool of sodium light on the pavement under each lamp. Real point lights
    // at this count would cost more than the whole rest of the frame, and an
    // additive decal is what actually reads — an unlit street under a lit lamp
    // is most of why the ground looked dead.
    {
      const pool = track(blobTexture(0.95, [[0, 0.5], [0.35, 0.26], [0.7, 0.06], [1, 0]]));
      const geo = track(new THREE.PlaneGeometry(1, 1));
      geo.rotateX(-Math.PI / 2);
      const mat = track(new THREE.MeshBasicMaterial({
        // Dimmer than they were: the lamp pools were the brightest thing on
        // screen, which is a poor place for the eye to go when the subject of
        // the frame is whichever three buildings have their lights on.
        map: pool, color: 0xffc987, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      }));
      const pools = new THREE.InstancedMesh(geo, mat, spots.length);
      pools.renderOrder = 2;
      const q = new THREE.Object3D();
      spots.forEach(([x, z], i) => {
        q.position.set(x, 0.185, z);
        q.scale.setScalar(6.4);
        q.updateMatrix();
        pools.setMatrixAt(i, q.matrix);
      });
      scene.add(pools);
    }

    // Street furniture along the kerbs, placed deterministically: planters with
    // a clipped hedge, benches, and bins.
    const propBox = track(new THREE.BoxGeometry(1, 1, 1));
    const stoneMat = track(new THREE.MeshStandardMaterial({ color: 0xd6c7a8, roughness: 1 }));
    const hedgeMat = track(new THREE.MeshStandardMaterial({ color: 0x7d9b6a, roughness: 1, flatShading: true }));
    const woodMat = track(new THREE.MeshStandardMaterial({ color: 0xa9825c, roughness: 0.9 }));
    const metalMat = track(new THREE.MeshStandardMaterial({ color: 0x5b5750, roughness: 0.6, metalness: 0.35 }));

    const sites = [];
    towers.forEach((t, i) => {
      const e = BLOCK_W / 2 - 0.4;
      sites.push({ x: t.x + e, z: t.z - e * 0.35, kind: i % 3 });
      sites.push({ x: t.x - e * 0.35, z: t.z + e, kind: (i + 2) % 3 });
    });

    const planters = new THREE.InstancedMesh(propBox, stoneMat, sites.length);
    const hedges = new THREE.InstancedMesh(propBox, hedgeMat, sites.length);
    const seats = new THREE.InstancedMesh(propBox, woodMat, sites.length);
    const bins = new THREE.InstancedMesh(propBox, metalMat, sites.length);
    for (const m of [planters, hedges, seats, bins]) { m.castShadow = true; m.count = 0; }
    const n = [0, 0, 0, 0];
    const pd2 = new THREE.Object3D();
    const put = (mesh, slot, x, y, z, sx, sy, sz, ry) => {
      pd2.position.set(x, y, z);
      pd2.scale.set(sx, sy, sz);
      pd2.rotation.y = ry;
      pd2.updateMatrix();
      mesh.setMatrixAt(n[slot]++, pd2.matrix);
    };
    sites.forEach((p, i) => {
      const turn = (i % 2) * Math.PI / 2;
      if (p.kind === 0) {                       // planter with a hedge in it
        put(planters, 0, p.x, 0.34, p.z, 1.05, 0.36, 1.05, turn);
        put(hedges, 1, p.x, 0.62, p.z, 0.86, 0.34, 0.86, turn);
      } else if (p.kind === 1) {                // bench
        put(seats, 2, p.x, 0.38, p.z, 1.5, 0.09, 0.42, turn);
        put(seats, 2, p.x - Math.sin(turn) * 0.18, 0.55, p.z - Math.cos(turn) * 0.18, 1.5, 0.36, 0.08, turn);
      } else {                                  // bin
        put(bins, 3, p.x, 0.36, p.z, 0.42, 0.56, 0.42, turn);
      }
    });
    planters.count = n[0]; hedges.count = n[1]; seats.count = n[2]; bins.count = n[3];
    scene.add(planters, hedges, seats, bins);

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

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const boxGeo = track(chamferedBox());
  // Same volume, UVs pre-squeezed for the 1.34 : 0.66 slab footprint so its
  // short faces get windows of the same size as its long ones.
  const slabGeo = track(boxUV(chamferedBox(), 0.66 / 1.34));
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

  // The texture carries the hue — wall, glazing, sill — and the material colour
  // carries only the value gradient, each storey a shade lighter than the one
  // below it. Keeping those two jobs apart is what stops a dark brick style
  // going to mud while a limestone one stays paper-white.
  const WIN_W = 0.6 * WIN_COLS;   // world units per tile of windows
  const WIN_H = 0.62;             // world units per window row

  /*  A city where every window is lit has no subject. The chapter names the
   *  companies it is about, and only those buildings keep their lights on —
   *  everything else stands in the dark with the surrounding fabric, so the eye
   *  goes to the three or four towers the narration is actually talking about.
   *  Not quite to black: a trace of glow keeps glass reading as glass rather
   *  than as a hole cut out of the skyline.
   *
   *  Killing the windows is not enough on its own. A limestone slab is a pale
   *  stone whether or not anyone is home, so with its lights out it still
   *  caught the moon and stood in front of AT&T looking like the brightest
   *  thing on the plaza — a hero object with no name on it. The walls go down
   *  with the windows, toward the same cool tone the surrounding fabric is
   *  painted in, so an unlit building recedes into the fabric instead of
   *  competing with the story from the front row. */
  const LIT_ON = 2.4;
  const LIT_OFF = 0.04;
  const NIGHT_TONE = new THREE.Color(0x2b3441);

  function collectMaterials(group) {
    const out = [];
    group.traverse((o) => {
      const m = o.material;
      if (m && m.isMeshStandardMaterial && !out.includes(m)) out.push(m);
    });
    return out;
  }

  function facade(tower, width, height, depth, lift, seed = 0) {
    const round = tower.style.plan === 'round';
    // Walls are barely lit at night, so the value gradient that gave the massing
    // depth by day is compressed — the light now comes out of the windows.
    const colour = new THREE.Color().setScalar(0.66 + 0.16 * lift);
    const repX = Math.max(1, Math.round((round ? width * Math.PI : width) / WIN_W));
    const repY = Math.max(1, Math.round(height / WIN_H));
    const tex = track(tower.tex.clone());
    tex.needsUpdate = true;
    tex.anisotropy = maxAniso;
    tex.repeat.set(repX, repY);
    // Each storey draws a different one of the tower's lit variants, so the
    // pattern of lit panes changes as the eye goes up the building.
    const lit = track(tower.litTex[Math.abs(Math.round(seed)) % tower.litTex.length].clone());
    lit.needsUpdate = true;
    lit.anisotropy = maxAniso;
    lit.repeat.set(repX, repY);
    const geo = round ? cylGeo : (tower.style.plan === 'slab' ? slabGeo : boxGeo);
    const mesh = new THREE.Mesh(geo, track(new THREE.MeshStandardMaterial({
      color: colour, map: tex, roughness: 0.82, metalness: 0.02,
      emissive: 0xffffff, emissiveMap: lit, emissiveIntensity: LIT_ON,
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
    t.tex = track(facadeTexture(t.style));
    t.mats = [];
    t.glow = 1;
    // Six lit patterns per tower, dealt out storey by storey.
    t.litTex = Array.from({ length: 6 }, (_, k) =>
      track(facadeTexture(t.style, true, t.x * 0.37 + t.z * 0.11 + k * 4.7)));
    t.trim = track(new THREE.MeshStandardMaterial({
      color: new THREE.Color(t.style.wall).multiplyScalar(0.7), roughness: 0.85,
    }));
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
    const plinth = facade(t, baseDims.x, PLINTH_H, baseDims.z, 0, 0);
    plinth.position.y = 0.16 + PLINTH_H / 2;
    plinth.userData.tower = t;
    group.add(plinth);
    picks.push(plinth);
    t.plinth = plinth;

    let fi = 0;
    for (const f of t.floors) {
      fi++;
      const w = widthAt(f.base) * (f.narrow ? 0.78 : 1);
      const dims = planDims(t.style, w);
      f.dx = dims.x / 2;
      f.dz = dims.z / 2;
      const mesh = facade(t, dims.x, f.h, dims.z, Math.min(1, f.base / Math.max(t.height, 0.001)), fi);
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
      f.label.position.set(f.dx + 0.7, 0.16 + f.base + f.h / 2, f.dz - 0.2);
      f.label.visible = false;
      group.add(f.label);

      // A string course at the head of each storey that is tall enough to carry
      // one. Strong horizontal banding is what stops a stack of blocks reading
      // as a stack of blocks.
      if (f.h > 0.72) {
        const band = new THREE.Mesh(t.style.plan === 'round' ? cylGeo : boxGeo, t.trim);
        band.scale.set(dims.x + 0.13, 0.09, dims.z + 0.13);
        band.castShadow = true;
        band.receiveShadow = true;
        group.add(band);
        f.band = band;
      }
    }

    // The crown: a parapet plus whatever the style tops itself off with.
    t.roof = makeCrown(t.style, t.topWidth, track);
    group.add(t.roof);

    // A deal that died is the storey this building never got to build, so it
    // belongs on top of the building at the height it stood that year — not
    // floating off to one side, which is what made these read as stray boxes
    // with no owner. It rises out of the roof as the deal is announced, then
    // collapses back into it when the deal is blocked, and afterwards leaves
    // only a thin mark on the parapet.
    t.ghostParts = t.ghosts.map((d) => {
      const h = floorHeight(d.valueB);
      const node = new THREE.Group();
      const dims = planDims(t.style, t.topWidth);
      const shell = new THREE.Mesh(boxGeo, track(new THREE.MeshBasicMaterial({
        color: COLOR.ghost, transparent: true, opacity: 0.07,
        depthWrite: false, side: THREE.DoubleSide,
      })));
      shell.scale.set(dims.x, h, dims.z);
      const lines = new THREE.LineSegments(edgeGeo, track(new THREE.LineBasicMaterial({
        color: COLOR.ghost, transparent: true, opacity: 0.85,
      })));
      lines.scale.copy(shell.scale);
      node.add(shell, lines);
      node.visible = false;
      group.add(node);
      const hit = new THREE.Mesh(boxGeo, track(new THREE.MeshBasicMaterial({ visible: false })));
      hit.scale.set(dims.x, h, dims.z);
      group.add(hit);
      hit.userData.deal = d.id;
      hit.visible = false;
      picks.push(hit);

      // The scar: once the deal is dead, a short red band sits on the parapet
      // for good, so the building still says "something was tried here".
      const scar = new THREE.Mesh(boxGeo, track(new THREE.MeshBasicMaterial({
        color: COLOR.ghost, transparent: true, opacity: 0.9,
      })));
      scar.scale.set(dims.x + 0.16, 0.07, dims.z + 0.16);
      scar.visible = false;
      group.add(scar);

      /*  No second label. A blocked deal used to get a red box of its own, and
       *  on a narrow screen that box had to displace a nameplate to stand
       *  anywhere — so the company it belonged to lost its name for the two
       *  years the bid was in the sky, and got it back afterwards. That is the
       *  "labels come and go" flicker, and it is not a placement problem: two
       *  labels were competing to point at one building. The failed bid is a
       *  line inside that building's own nameplate instead. One building, one
       *  label, one stem — nothing to displace and nothing to lose. */
      // Short name: the plate is already carrying a company name, and "Sprint
      // (United Telecom)" on a second line makes the box wider than a third of
      // a phone — which costs some other building its name entirely.
      const target = (d.target ? nameAt(d.target, d.year) : d.title).replace(/\s*\(.*\)$/, '');
      const caption = `✕ ${target} · ${money(d.valueB)} blocked`;

      return { deal: d, node, shell, lines, hit, scar, caption, h };
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
    // A company whose deals had no headline price is not a company that spent
    // nothing, so it gets the count on its own rather than "$0B".
    const deals = `${t.floors.length} ${t.floors.length === 1 ? 'deal' : 'deals'}`;
    t.plate = `<b>${t.name}</b><i>${t.floors.length
      ? (t.total ? `${money(t.total)} · ${deals}` : deals)
      : 'never bought anyone'}</i>`;
    el.innerHTML = t.plate;
    t.label = new CSS2DObject(el);
    t.labelEl = el;
    t.label.visible = false;
    group.add(t.label);

    // The bid that needs the most room, since the box is sized for the chapter
    // rather than for the moment.
    t.ghostCaption = t.ghostParts.map((g) => g.caption).sort((a, b) => b.length - a.length)[0] || '';

    // Everything the chapter can put out, gathered once the group is complete
    // so no crown or string course is missed. Each keeps its own colour, so
    // the dimming is a fade between two known states rather than a repaint.
    for (const o of collectMaterials(group)) {
      t.mats.push({
        mat: o,
        lit: o.color.clone(),
        dark: o.color.clone().multiplyScalar(0.34).lerp(NIGHT_TONE, 0.45),
        glow: o.emissiveIntensity,
      });
    }
  }

  // Rooftop plant, and a wisp of steam from a couple of them, which is most of
  // what makes a roofline look like a roof rather than a lid.
  {
    const ventGeo = track(new THREE.BoxGeometry(1, 1, 1));
    const ventMat = track(new THREE.MeshStandardMaterial({ color: 0x9a958c, roughness: 0.8, metalness: 0.2 }));
    towers.forEach((t, i) => {
    if (t.floors.length < 2) return;
    const w = t.topWidth;
    for (let k = 0; k < 3; k++) {
      const vent = new THREE.Mesh(ventGeo, ventMat);
      const s = 0.26 + ((i * 5 + k * 3) % 4) * 0.09;
      vent.scale.set(s, s * (0.6 + (k % 2) * 0.5), s);
      vent.position.set((k - 1) * w * 0.26, 0, ((i + k) % 3 - 1) * w * 0.22);
      vent.castShadow = true;
      t.roof.add(vent);
      vent.position.y = 0.18 + vent.scale.y / 2;
    }
    if (i % 4 !== 1) return;
    const puff = new THREE.Sprite(track(new THREE.SpriteMaterial({
      map: steamTex, transparent: true, opacity: 0.34, depthWrite: false,
    })));
    puff.scale.setScalar(2.2);
    t.roof.add(puff);
    steam.push({ node: puff, phase: i * 0.7, base: 0.4 });
    });
  }

  // ------------------------------------------------------------- monument --
  // The Bell System made no acquisitions, so it gets no storeys. It is the
  // ground the rest of the city was built on, and reads as a footprint.
  const monument = new THREE.Group();
  monument.position.set(0, 0, MONUMENT_Z);
  scene.add(monument);
  {
    // Lit like a monument is lit, from the ground. It is the only subject the
    // first two years have, and in a fixed wide shot of a dark plaza an unlit
    // slab is a shape you cannot find.
    const slab = new THREE.Mesh(boxGeo, track(new THREE.MeshStandardMaterial({
      color: COLOR.stone, roughness: 0.9,
      emissive: 0xbcd0ea, emissiveIntensity: 0.22,
    })));
    slab.scale.set(BLOCK_W * 0.82, 1.6, BLOCK_W * 0.5);
    slab.position.y = 0.8;
    slab.castShadow = true;
    slab.receiveShadow = true;
    slab.userData.company = 'bellsystem';
    monument.userData.stone = new THREE.Color(COLOR.stone);
    monument.userData.paving = new THREE.Color(COLOR.plaza).multiplyScalar(0.9);
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
  const chapters = CHAPTERS.map((ch) => {
    // Which buildings this chapter is about, straight from the deal years.
    const active = towers.filter((t) =>
      t.allDeals.some((d) => d.year >= ch.yearFrom && d.year <= ch.yearTo));
    // Plus any building whose blocked deal stands in the sky at some point in
    // the chapter. A deal that fails is a beat in the story, and it cannot be
    // one if the camera frames it out of shot — which is what happened to
    // EchoStar's bid for DirecTV.
    const ghostOwners = new Set(towers.filter((t) =>
      t.ghosts.some((d) => d.year - GHOST_BEFORE <= ch.yearTo
        && d.year + GHOST_AFTER >= ch.yearFrom)));
    // Which bid, so the plate can name it for the whole chapter rather than for
    // the two years the outline is in the sky. Showing it only in that window
    // meant the box changed height halfway through a chapter — and a plate that
    // changes height is a plate that moves. The chapter is about the bid; the
    // plate can say so throughout it, and the outline still rises and collapses
    // in the year it actually happened.
    const ghostCaption = new Map();
    for (const t of ghostOwners) {
      const p = t.ghostParts.find((g) => g.deal.year - GHOST_BEFORE <= ch.yearTo
        && g.deal.year + GHOST_AFTER >= ch.yearFrom);
      if (p) ghostCaption.set(t, p.caption);
    }
    const framed = [...new Set([...active, ...ghostOwners])];
    // A chapter with no deals of its own is either the prologue or the finale,
    // and the city itself says which: whatever is standing when it ends. In
    // 1983 that is nothing, so the plaza stays dark behind the monument; in
    // 2026 it is everything, so the last chapter gets the whole skyline lit.
    if (!framed.length) {
      framed.push(...towers.filter((t) => t.floors.some((f) => f.deal.year <= ch.yearTo)));
    }
    return { ...ch, active, framed, ghostOwners, ghostCaption };
  });

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
    // The monument stands on the middle block, so the plaza's own bounds already
    // contain it.
    shot.centre.set((minX + maxX) / 2, maxH * 0.46, (minZ + maxZ) / 2);

    // Fit against the area actually left over for the city, not the whole
    // canvas: the frustum is offset to clear the narration card, so part of the
    // frame is spoken for. Clamping the horizontal term to a square frame —
    // which is what this used to do — fits a portrait phone as though it were
    // as wide as it is tall, and the city spills off both sides.
    const vFov = (camera.fov * Math.PI) / 180;
    const fullH = stageH + lastPad.y;
    const freeW = Math.max(120, stageW - lastPad.x);
    const freeH = Math.max(120, stageH - lastPad.y);
    const tanV = Math.tan(vFov / 2) * (freeH / fullH);
    const tanH = Math.tan(vFov / 2) * (freeW / fullH);
    // Labels stand above the roofs and off the sides, so a narrow frame needs
    // more room than the buildings alone would ask for.
    const room = stageW < 760 ? 7 : 5;
    const fitY = (maxH / 2 + room) / tanV;
    const fitX = ((maxX - minX) / 2 + room) / tanH;
    const fitZ = ((maxZ - minZ) / 2 + room) / tanH;
    shot.dist = Math.max(fitY, fitX, fitZ, 20) * pad * (stageW < 760 ? 1.1 : 1);
    refineFit(list, year);
  }

  /** The estimate above treats the city as a flat box, which perspective does
   *  not: a near, short building foreshortens downward and can drop out of
   *  frame while the arithmetic says it fits. So check the answer — project
   *  every building the chapter is about and pull back until each lands inside
   *  the region the narration card leaves free. A building framed out cannot be
   *  labelled, which is how a blocked deal went unnamed. */
  function refineFit(list, year) {
    if (!list.length) return;
    const pos = camera.position.clone();
    const quat = camera.quaternion.clone();
    // Converge both ways. The estimate above fits the city's depth against the
    // horizontal angle, which badly overshoots — a camera looking down at a
    // shallow pitch foreshortens depth into a fraction of the screen — so
    // trusting it left the city a smudge in the middle of the frame. Measuring
    // the projection and closing on a target fill makes the estimate a starting
    // guess rather than the answer.
    // Centring the city's bounding box in the frame wastes the half of the
    // screen it does not use: a plaza seen at a shallow angle is a wide, shallow
    // band, so a fit that centres it leaves a dead strip above and another
    // below. Measure the projected extent instead and solve for two things at
    // once — a distance that fills the free region, and a look-at height that
    // puts the city in the middle of it. Fitted at the city's final height, so
    // the frame is built for the skyline that will be there in 2026 and nothing
    // ever grows out of it.
    const TARGET = stageW < 760 ? 0.95 : 0.93;
    const e = BLOCK_W / 2;
    const vTan = Math.tan((camera.fov * Math.PI) / 360);
    for (let pass = 0; pass < 14; pass++) {
      aimCamera();
      camera.position.copy(camGoal);
      camera.lookAt(lookGoal);
      camera.updateMatrixWorld(true);
      let wide = 0;
      let lo = Infinity;
      let hi = -Infinity;
      // The corners of the block, not its centre: a building is wide, and
      // fitting its centre lets half of it hang off the edge of the frame.
      for (const t of list) {
        for (const y of [0.2, t.heightAt(year) + 2.2]) {
          for (const dx of [-e, e]) {
            for (const dz of [-e, e]) {
              probe.set(t.x + dx, y, t.z + dz).project(camera);
              wide = Math.max(wide, Math.abs(probe.x - freeNdc.cx) / freeNdc.hx);
              const ny = (probe.y - freeNdc.cy) / freeNdc.hy;
              lo = Math.min(lo, ny);
              hi = Math.max(hi, ny);
            }
          }
        }
      }
      if (!Number.isFinite(lo)) break;
      const worst = Math.max(wide, (hi - lo) / 2);
      const mid = (hi + lo) / 2;
      // Raising the look-at point pushes the scene down the screen, so the sign
      // is straight: a city sitting too high wants a higher look-at.
      shot.centre.y += mid * freeNdc.hy * shot.dist * vTan * 1.1;
      if (worst > 0.02) shot.dist = Math.max(18, shot.dist * Math.min(1.7, Math.max(0.62, worst / TARGET)));
      if (Math.abs(worst - TARGET) < 0.015 && Math.abs(mid) < 0.02) break;
    }
    camera.position.copy(pos);
    camera.quaternion.copy(quat);
    camera.updateMatrixWorld(true);
  }

  /*  One shot, held for the whole story.
   *
   *  Re-framing on every chapter meant the city jumped from one composition to
   *  another eight times, and each jump moved every label on the screen — which
   *  is what made names come and go as the timeline ran. Worse, a shot composed
   *  for a chapter's own buildings would be cut off by the next chapter's, so
   *  AT&T grew straight off the top of a phone.
   *
   *  So the camera is fitted once, to the whole plaza at its final height, and
   *  then left alone. Nothing can ever grow out of frame, because the frame was
   *  built for the finished city; every building keeps the same place on the
   *  screen from 1983 to 2026; and the story is told by which buildings are lit
   *  and named, not by where the camera is pointing. The city fills a frame that
   *  was always waiting for it. */
  function frameCity() {
    fitTo(towers, END_YEAR, 1.04);
    shot.azimuth = 0;
    // Higher than a street-level shot. The one fixed frame has to hold both the
    // empty plaza of 1983 and AT&T's finished tower, and at a shallow angle the
    // plaza collapses to a thin band with two-thirds of the screen reserved as
    // sky for a skyline that will not arrive for thirty years. Looking further
    // down spreads the plaza across the frame and foreshortens the towers, so
    // both ends of the story get a composition.
    shot.pitch = 0.4;
    spin = 0;
    state.selected = null;
    aimCamera();
    // Take the shot, do not glide into it. There is one shot for the whole
    // story, so the only glide there could be is the one at the start — and
    // for as long as it lasts every label on the screen is a pixel or two out
    // from where it will finally sit.
    if (!state.userMoved) {
      camera.position.copy(camGoal);
      controls.target.copy(lookGoal);
      camera.lookAt(lookGoal);
      camera.updateMatrixWorld(true);
    }
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
    // Orbiting holds within a chapter but does not survive one: a new chapter
    // returns to the city shot, so a single drag in 1984 cannot leave the next
    // four decades looking at the back of a building.
    state.userMoved = false;
    frameCity();
    onChapterChange(ch, state.chapter);
    refresh();
  }

  // ------------------------------------------------------------- per-frame --
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const dummy = new THREE.Object3D();
  const walkPoint = new THREE.Vector3();

  // Which buildings are lit right now, recomputed only when the answer can have
  // changed — the set is the chapter's cast, or the one building you walked up to.
  let litKey = '';
  let litSet = new Set();

  /*  The chapter's cast: the buildings that are lit, and the buildings that are
   *  named. It is deliberately one list and not two.
   *
   *  A phone has room for about six nameplates. Letting all fourteen try meant
   *  the ones that lost were lit but nameless, and which ones lost changed as
   *  companies were founded mid-chapter — a building going dark halfway through
   *  a paragraph. So the cast is capped up front, by what each company spent,
   *  and it does not change until the chapter does. */
  function castTowers() {
    const ch = chapters[state.chapter];
    const room = stageW < 760 ? 6 : 99;
    const key = `${state.chapter}|${state.selected ? state.selected.id : ''}|${room}`;
    if (key !== litKey) {
      litKey = key;
      // A chapter with no cast is the prologue: nothing in the plaza is the
      // story yet, so the plaza stays dark and the monument has the stage.
      litSet = new Set(state.selected ? [state.selected] : ch.framed.slice()
        // A company whose bid was blocked in this chapter is the beat of the
        // chapter, so it keeps its place whatever it spent.
        .sort((a, b) => (ch.ghostOwners.has(a) ? 0 : 1) - (ch.ghostOwners.has(b) ? 0 : 1)
          || (b.total || 0) - (a.total || 0))
        .slice(0, room));
    }
    return litSet;
  }

  // Lit is the cast minus anything the declutter pass could not find room to
  // name, so a lit window always has a name over it. The cast itself is never
  // narrowed: a building that loses its slot has to be able to win it back, and
  // it cannot do that if losing once takes it out of the running.
  function litNow() {
    const cast = castTowers();
    if (!unplaceable.size) return cast;
    const out = new Set(cast);
    for (const t of unplaceable) out.delete(t);
    return out;
  }

  function build(dt = 0) {
    const lit = litNow();
    for (const t of towers) {
      // Fade rather than switch, so a chapter change reads as the city handing
      // the story on rather than as a light being flicked.
      const goal = lit.has(t) ? 1 : 0;
      t.glow += (goal - t.glow) * (dt ? 1 - Math.pow(0.004, dt) : 0);
      if (Math.abs(t.glow - t.lastGlow) > 0.004 || t.lastGlow === undefined) {
        t.lastGlow = t.glow;
        const k = LIT_OFF / LIT_ON + (1 - LIT_OFF / LIT_ON) * t.glow;
        for (const m of t.mats) {
          m.mat.emissiveIntensity = m.glow * k;
          m.mat.color.copy(m.dark).lerp(m.lit, t.glow);
        }
      }
      const alive = state.year >= t.born - 0.01;
      t.group.visible = alive;
      if (!alive) continue;

      // A company arriving used to snap a whole plinth into the plaza in one
      // frame, which reads as the background flickering rather than as a
      // founding. It grows out of the ground on the same curve a storey does.
      const birth = Math.max(0.001, easeOut(clamp01((state.year - t.born) / RISE_YEARS)));
      t.plinth.scale.y = PLINTH_H * birth;
      t.plinth.position.y = 0.16 + (PLINTH_H * birth) / 2;

      let top = PLINTH_H * birth;
      for (const f of t.floors) {
        const g = Math.min(1, Math.max(0, (state.year - f.deal.year) / RISE_YEARS));
        if (g <= 0) {
          f.mesh.visible = false;
          if (f.band) f.band.visible = false;
          continue;
        }
        const k = easeOut(g);
        f.mesh.visible = true;
        f.mesh.scale.y = f.h * k;
        f.mesh.position.y = 0.16 + f.base + (f.h * k) / 2;
        top = f.base + f.h * k;
        if (f.band) {
          f.band.visible = k > 0.98;
          f.band.position.y = 0.16 + f.base + f.h * k - 0.045;
        }
      }
      t.roof.position.y = 0.16 + top + 0.09;
      // Announced a year out, blocked on the year itself, gone a year after —
      // so at any moment only the deals actually in play are in the sky.
      t.liveGhost = null;
      for (const p of t.ghostParts) {
        const dy = state.year - p.deal.year;
        const rise = clamp01((dy + GHOST_BEFORE) / GHOST_BEFORE);
        const fall = clamp01(dy / GHOST_AFTER);
        /*  Whether the bid is in play is a fact about the year, not about
         *  whether the label fitted. Tying it to the lighting made a loop: a
         *  plate that failed to place turned its building off, which cleared its
         *  bid line, which made the plate smaller, which let it place, which
         *  turned the building on — and round again, reshuffling the chapter
         *  every few frames. The sky is still gated on being named, below; only
         *  the caption is not. */
        const live = rise > 0 && fall < 1;
        if (live) t.liveGhost = p;
        p.node.visible = live && lit.has(t);
        p.hit.visible = p.node.visible;
        if (live) {
          const k = Math.max(0.001, rise * (1 - fall));
          p.shell.scale.y = p.h * k;
          p.lines.scale.y = p.h * k;
          p.node.position.y = 0.16 + top + (p.h * k) / 2 + 0.2;
          p.shell.material.opacity = 0.07 * (1 - fall);
          p.lines.material.opacity = 0.85 * (1 - fall * 0.7);
          p.hit.scale.y = p.h * k;
          p.hit.position.copy(p.node.position);
        }
        p.scar.visible = dy >= 0.85 && lit.has(t);
        if (p.scar.visible) p.scar.position.y = 0.16 + top + 0.035;
      }
      for (const p of t.pendingParts) p.node.visible = state.year >= p.deal.year - 0.6;
      for (const b of t.beaconParts) b.mesh.visible = state.year >= b.deal.year && lit.has(t);
    }

    // The monument stands until the breakup, then leaves its footprint behind.
    // Its light goes out with it: lit while it is the subject of the story, and
    // paving afterwards. Left glowing it was a pale slab sitting in the middle
    // of the plaza for forty years with no name on it and no reason to be there
    // — a grey box, which is exactly what it looked like.
    const gone = Math.min(1, Math.max(0, (state.year - 1984) / 0.8));
    const slab = monument.userData.slab;
    slab.scale.y = 1.6 * (1 - gone * 0.88);
    slab.position.y = (1.6 * (1 - gone * 0.88)) / 2;
    if (Math.abs(gone - (monument.userData.gone ?? -1)) > 0.004) {
      monument.userData.gone = gone;
      slab.material.emissiveIntensity = 0.22 * (1 - gone);
      slab.material.color.copy(monument.userData.stone).lerp(monument.userData.paving, gone);
    }
    // Once the city has grown past it the plaque is just something in the way.
    monument.userData.label.visible = state.year < 1986;
  }

  function traffic(dt) {
    for (const s of steam) {
      s.phase += dt * 0.55;
      const t = s.phase % 1;
      s.node.position.y = s.base + t * 3.4;
      s.node.scale.setScalar(1.4 + t * 2.6);
      s.node.material.opacity = 0.32 * (1 - t) * Math.min(1, t * 5);
    }
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
  const probe = new THREE.Vector3();
  // How far a tower label may be raised to clear a neighbour, in order of
  /*  Where a label is allowed to stand, relative to the roof it names: a ring of
   *  eight directions at four distances, nearest first. Above is still the
   *  preference — that leader is shortest and reads most naturally — then
   *  beside, then below. Searching only upwards ignored three quarters of the
   *  frame and dropped names for want of room that was there the whole time. */
  const SLOTS = [];
  for (let r = 1; r <= 4; r++) {
    for (const [ux, uy] of [[0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1], [0, 1]]) {
      SLOTS.push({ ux, uy, r, cost: r + (uy > 0 ? 0.7 : uy === 0 ? 0.35 : 0) + Math.abs(ux) * 0.12 });
    }
  }
  SLOTS.sort((a, b) => a.cost - b.cost);

  /** Do two segments cross? A leader running through another leader — or through
   *  another label's box — makes the reader guess which name belongs to which
   *  roof, which is the one thing a leader exists to prevent. */
  function crosses(a, b) {
    const side = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
    return side(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1) !== side(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2)
      && side(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1) !== side(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
  }

  /** Does a leader pass through a box? Its four edges, tested as segments. */
  function throughBox(line, b) {
    const x0 = b.sx - b.hw; const x1 = b.sx + b.hw;
    const y0 = b.sy - b.hh; const y1 = b.sy + b.hh;
    return crosses(line, { x1: x0, y1: y0, x2: x1, y2: y0 })
      || crosses(line, { x1: x1, y1: y0, x2: x1, y2: y1 })
      || crosses(line, { x1: x1, y1: y1, x2: x0, y2: y1 })
      || crosses(line, { x1: x0, y1: y1, x2: x0, y2: y0 });
  }
  const leaders = [];

  // One candidate list and one occupied list for every kind of label.
  const floorCandidates = [];
  const placed = [];
  // Cast buildings whose nameplate could not be placed at all. They lose their
  // lights too, so "lit" and "named" never disagree — see `litTowers`.
  const unplaceable = new Set();
  const namedNow = new Set();
  const unnamedNow = new Set();

  /** The narration panel, the deal feed, the deal card and the transport bar own
   *  their corners; a label that would land on one is dropped rather than
   *  printed over it. The panels are measured rather than guessed at — the deal
   *  card in particular moves and resizes with its contents, and hard-coded
   *  rectangles are exactly how labels ended up printed across it. */
  const chromeEls = ['#story-top', '.story-top', '#story-panel', '#story-feed', '#story-card', '.story-bar']
    .map((sel) => root.querySelector(sel))
    .filter((el, i, all) => el && all.indexOf(el) === i);
  let chromeRects = [];
  let chromeAt = -1e9;

  function measureChrome(now) {
    if (now - chromeAt < 220) return;
    chromeAt = now;
    const base = root.getBoundingClientRect();
    chromeRects = [];
    for (const el of chromeEls) {
      if (el.hidden) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      chromeRects.push({
        x0: r.left - base.left - 8, y0: r.top - base.top - 8,
        x1: r.right - base.left + 8, y1: r.bottom - base.top + 8,
      });
    }
    applyViewOffset();
  }

  /** Labels are drawn centred on their anchor, so the test is box against box.
   *  A label running off the side of the stage is dropped too — on a phone that
   *  is most of them, and half a company name is worse than none. */
  function inChrome(sx, sy, hw, hh) {
    if (sx - hw < 4 || sx + hw > stageW - 4) return true;
    if (sy - hh < 4 || sy + hh > stageH - 4) return true;
    for (const r of chromeRects) {
      if (sx + hw > r.x0 && sx - hw < r.x1 && sy + hh > r.y0 && sy - hh < r.y1) return true;
    }
    return false;
  }

  /** Every label's box, measured in one pass with all of them shown.
   *
   *  Measuring lazily as each label appeared could not work: a hidden label is
   *  display:none, so it reports zero and falls back to an assumed size. On a
   *  phone that assumption was nearly twice the real box, so labels collided
   *  against a size they never had and almost none of them ever appeared — no
   *  amount of zooming out helped, because the camera was never the constraint.
   *  One forced layout on open and on resize is the whole cost. */
  let needMeasure = true;

  function measureLabels() {
    const pairs = [];
    for (const t of towers) {
      if (t.labelEl) pairs.push([t, t.labelEl]);
      for (const f of t.floors) if (f.label) pairs.push([f, f.label.element]);
    }
    if (!pairs.length) return false;
    /*  A label that is not on screen is not in the document either — the CSS2D
     *  renderer only attaches an element while its object is visible. So the
     *  labels that most needed measuring, the ones the declutter pass had not
     *  found room for, were the ones it could never measure, and every one of
     *  them was laid out against a 150x42 guess instead of its real box. That
     *  guess is nearly twice the width of a real nameplate, which is why plates
     *  collided with neighbours they did not touch, wandered half a frame to
     *  find room that was already there, and vanished for want of space they did
     *  not need. Attach whatever is missing, measure, put it back. */
    const layer = labelRenderer.domElement;
    const added = [];
    const was = pairs.map(([, el]) => [el.style.display, el.style.position]);
    for (const [, el] of pairs) {
      el.style.display = '';
      el.style.position = 'absolute';
      if (!el.isConnected) { layer.appendChild(el); added.push(el); }
    }
    for (const [store, el] of pairs) {
      if (el.offsetWidth) { store.lw = el.offsetWidth; store.lh = el.offsetHeight; }
    }
    if (!pairs.some(([store]) => store.lw)) {
      for (const el of added) el.remove();
      return false;
    }
    /*  A company with a failed bid grows a line in its plate for the two years
     *  the bid is in the sky. Both sizes are measured, because the layout has to
     *  be the same size in every year of a chapter or it is not a layout: a
     *  plate that grows mid-chapter bumps a neighbour off the screen, and one
     *  that shrinks lets it back on. The chapter picks which size to reserve —
     *  reserving the tall one always would cost some other building its name in
     *  every chapter, to hold room for a bid that is not in this one. */
    for (const t of towers) {
      t.lwPlain = t.lw; t.lhPlain = t.lh;
      t.lwGhost = t.lw; t.lhGhost = t.lh;
      if (!t.ghostParts.length || !t.labelEl.offsetWidth) continue;
      const now = t.labelEl.innerHTML;
      // Every bid it ever made, since any of them could be the one on screen.
      for (const p of t.ghostParts) {
        t.labelEl.innerHTML = t.plate + `<s>${p.caption}</s>`;
        t.lwGhost = Math.max(t.lwGhost, t.labelEl.offsetWidth);
        t.lhGhost = Math.max(t.lhGhost, t.labelEl.offsetHeight);
      }
      t.labelEl.innerHTML = now;
      // The plain size may have been measured with a caption already in place.
      t.labelEl.innerHTML = t.plate;
      t.lwPlain = t.labelEl.offsetWidth || t.lwPlain;
      t.lhPlain = t.labelEl.offsetHeight || t.lhPlain;
      t.labelEl.innerHTML = now;
    }
    for (const el of added) el.remove();
    pairs.forEach(([, el], i) => { el.style.display = was[i][0]; el.style.position = was[i][1]; });
    return true;
  }

  function sizeOf(store, el, w, h) {
    return store.lw ? store : { lw: w, lh: h };
  }

  function placeLabels(now = performance.now()) {
    measureChrome(now);
    const ch = chapters[state.chapter];
    // Only the chapter's own companies are named. Naming all sixty-six in the
    // prologue put "$125B · 7 deals" over a one-storey plinth in 1983, decades
    // before any of it happened — a caption for a building that is not yet the
    // story. The Bell System's own caption carries that moment.
    // The same cast that is lit, so the two can never disagree.
    const show = new Set(castTowers());
    if (state.hovered) show.add(state.hovered);
    namedNow.clear();
    unnamedNow.clear();

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
        const size = sizeOf(f, f.label.element, 150, 36);
        floorCandidates.push({
          label: f.label,
          el: f.label.element,
          rank: 3,
          key: -f.h,          // the deals that shaped the company go first
          lift: false,        // the leader line is horizontal, so it cannot move
          // The box hangs to the right of the anchor — see .floor-label.
          sx: (projected.x * 0.5 + 0.5) * stageW + size.lw / 2 + 4,
          sy: (-projected.y * 0.5 + 0.5) * stageH,
          hw: size.lw / 2 + 5,
          hh: size.lh / 2 + 5,
        });
      }

    }

    /*  Tower nameplates, pinned to where the roof will be at the end of this
     *  chapter.
     *
     *  Anchoring to the roof the building has *today* meant every plate crept up
     *  the screen for as long as the story ran, and a plate creeping past its
     *  neighbour gets bumped sideways and comes back. Anchoring to the roof it
     *  will have in 2026 was the other extreme: perfectly still, and in 1993 a
     *  plate floating two hundred pixels above a two-storey building.
     *
     *  The chapter is the right unit. Every input to the layout is drawn from
     *  the chapter — the cast, the plate sizes, and now the heights — so within
     *  a chapter the layout is not merely stable, it is the same arithmetic
     *  every frame and cannot move. The leader carries the change instead: it
     *  starts as long as the building has left to grow and shortens to nothing
     *  as the storeys arrive. */
    for (const t of towers) {
      if (!show.has(t)) { t.label.visible = false; continue; }
      // A company founded halfway through a chapter used to arrive as an extra
      // box that had to be fitted in, and fitting it in pushed somebody else
      // off the screen. Its slot is reserved from the start of the chapter and
      // simply stands empty until the company exists.
      const unborn = !t.group.visible;
      /*  A failed bid is a line inside the plate, not a plate of its own. In a
       *  chapter where this company has one, the line is in the box for the
       *  whole chapter and merely invisible until the bid goes up — otherwise
       *  the box changes height halfway through and the plate, which is centred
       *  on its anchor, moves. The layout has to be the same in every frame of a
       *  chapter, and that includes the size of what it is laying out. */
      const caption = ch.ghostCaption.get(t) || '';
      if (caption !== t.captionNow) {
        t.captionNow = caption;
        t.labelEl.innerHTML = t.plate + (caption ? `<s>${caption}</s>` : '');
        t.labelEl.classList.toggle('has-ghost', !!caption);
        needMeasure = true;   // the box just changed size
      }
      t.label.position.set(0, 0.16 + t.heightAt(ch.yearTo) + 1.4, 0);
      t.group.getWorldPosition(worldPos);
      worldPos.y = t.label.position.y;
      projected.copy(worldPos).project(camera);
      if (projected.z > 1 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1) {
        t.label.visible = false;
        unnamedNow.add(t);
        continue;
      }
      /*  Where the building has actually reached, so the leader can run down to
       *  it — both coordinates, not just the height. The dot used to take its x
       *  from the anchor and its y from the roof, and a point directly above a
       *  tower does not project to the same x as the tower's roof unless the
       *  camera happens to be aligned with it. So the leader landed beside the
       *  building rather than on it, by more the shorter the building was. */
      worldPos.y = 0.16 + t.heightAt(state.year) + 0.25;
      probe.copy(worldPos).project(camera);
      const roofX = (probe.x * 0.5 + 0.5) * stageW;
      const roofY = (-probe.y * 0.5 + 0.5) * stageH;
      // The size this chapter reserves: with room for a blocked-bid line only
      // in the chapters where this company has one.
      const ghosty = ch.ghostOwners.has(t);
      const size = t.lwPlain
        ? { lw: ghosty ? t.lwGhost : t.lwPlain, lh: ghosty ? t.lhGhost : t.lhPlain }
        : sizeOf(t, t.labelEl, 150, 42);
      const focus = t === state.hovered || t === state.selected;
      t.labelEl.classList.toggle('is-focus', focus);
      floorCandidates.push({
        label: t.label,
        el: t.labelEl,
        tower: t,
        roofX,
        roofY,
        boxH: size.lh,
        hidden: unborn,
        rank: focus ? 0 : 2,
        // When there is not room for every nameplate, the companies the story is
        // about keep theirs: the ones whose bid was blocked in this chapter
        // first, then the biggest spenders. Ordering by distance gave the front
        // row to whoever happened to stand nearest the camera, so Verizon lost
        // its name on a phone to a company that never bought anyone. The order
        // is drawn from the chapter, not from the year, so it holds still while
        // the chapter runs.
        key: (ch.ghostOwners.has(t) ? -1e12 : 0) - (t.total || 0),
        lift: true,
        sx: (projected.x * 0.5 + 0.5) * stageW,
        sy: (-projected.y * 0.5 + 0.5) * stageH,
        hw: size.lw / 2 + 7,
        hh: size.lh / 2 + 9,   // room for the stem under the box
      });
    }

    // One pass, one occupied list. Nameplates, storey names and blocked deals
    // were each decluttered against their own kind, so a blocked deal could
    // print straight across a nameplate — which is exactly what it did.
    placed.length = 0;
    leaders.length = 0;

    // The Bell System's caption is the widest box in the scene and it is the
    // only thing the first two years have to look at, so it is placed first —
    // through the same search as everything else, with a stem down to the slab.
    // Reserving its box where it happened to project meant the box landed on
    // top of the monument and hid it.
    const mono = monument.userData.label;
    if (mono.visible && mono.element.offsetWidth) {
      monument.getWorldPosition(worldPos);
      worldPos.y += mono.position.y;
      projected.copy(worldPos).project(camera);
      worldPos.y = 1.7;
      probe.copy(worldPos).project(camera);
      if (projected.z <= 1) {
        floorCandidates.push({
          label: mono,
          el: mono.element,
          roofY: (-probe.y * 0.5 + 0.5) * stageH,
          boxH: mono.element.offsetHeight,
          rank: -1,
          key: 0,
          lift: true,
          sx: (projected.x * 0.5 + 0.5) * stageW,
          sy: (-projected.y * 0.5 + 0.5) * stageH,
          hw: mono.element.offsetWidth / 2 + 8,
          hh: mono.element.offsetHeight / 2 + 9,
        });
      }
    }

    /*  The buildings themselves are obstacles.
     *
     *  The declutter pass had only ever known about other labels and about the
     *  interface, so a nameplate was free to sit squarely across the tower next
     *  to it — which is how a chapter about six companies ended up with three of
     *  them behind captions. Only the lit ones count: the dark fabric is a
     *  backdrop and a label may cross it freely, but nothing the chapter is
     *  about should have a box printed over it. */
    for (const t of show) {
      // Every cast building, whether or not it has been founded yet, at the
      // height it will have when the chapter ends. A company arriving mid-
      // chapter used to add an obstacle nobody had planned around, and the
      // packing came out different from that frame on.
      const top = 0.16 + t.heightAt(ch.yearTo);
      const e = TOWER_W * 0.62;
      let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
      for (const dx of [-e, e]) {
        for (const dz of [-e, e]) {
          for (const y of [0.1, top]) {
            probe.set(t.x + dx, y, t.z + dz).project(camera);
            if (probe.z > 1) { x0 = Infinity; break; }
            const sx = (probe.x * 0.5 + 0.5) * stageW;
            const sy = (-probe.y * 0.5 + 0.5) * stageH;
            x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
            y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
          }
        }
      }
      // Tagged with its tower, because a building must not block its own name —
      // a tall tower's box reaches from the pavement to the roof, and the one
      // place its label belongs is directly above that. AT&T, the tallest
      // building in the city, was censoring itself out of three chapters.
      if (Number.isFinite(x0)) {
        placed.push({ tower: t, soft: true, sx: (x0 + x1) / 2, sy: (y0 + y1) / 2, hw: (x1 - x0) / 2, hh: (y1 - y0) / 2 });
      }
    }

    /*  Solve on a coarse grid. Every input to the layout is now chapter-constant
     *  in principle, but the camera converges on its goal asymptotically and the
     *  projected anchors wander a pixel or two while it does — and a pixel is
     *  enough to flip a slot that only just fitted, which cascades into a
     *  different answer for the whole chapter. Rounding the anchors to four
     *  pixels makes the solve deaf to that. The leader is still drawn from the
     *  exact roof, so nothing is lost but the jitter. */
    for (const c of floorCandidates) {
      c.ax = c.sx; c.ay = c.sy;                 // exact, for the leader
      c.sx = Math.round(c.sx / 4) * 4;
      c.sy = Math.round(c.sy / 4) * 4;
    }
    floorCandidates.sort((a, b) => a.rank - b.rank || a.key - b.key);
    for (const c of floorCandidates) {
      /*  A label goes next to the thing it names, or it does not go at all.
       *
       *  The old search asked for the nearest free point on a row and took it,
       *  however far away that turned out to be. On a narrow screen the nearest
       *  free point is routinely most of a frame away, so AT&T's name ended up
       *  on the right of the shot joined by a long diagonal to a building on the
       *  left, crossing two other leaders on the way. Every one of those layouts
       *  passed a no-overlap test. None of them was readable.
       *
       *  So the search is over a short list of places a label is allowed to be:
       *  directly above its roof, then stacked a box higher, then half a box to
       *  either side — nearest first, and nothing beyond. If none of them is
       *  free the label is not placed, and its building's lights go out with it.
       *  Four clear names beat six that have to be puzzled out. */
      /*  Two passes. The first keeps the box off the lit buildings as well as off
       *  the other labels; the second drops that and asks only that no two
       *  labels overlap. Standing clear of the buildings is worth a lot, but it
       *  is not worth what a hard rule was costing: on a narrow screen the
       *  tallest building in the city is also the one with the most obstacles
       *  around it, so AT&T kept losing its name to a rule meant to protect it.
       *  Overlapping the side of a tower is a blemish. Having no name is a
       *  missing fact. */
      let best = null;
      // However crowded it gets, a box has a distance from its own anchor past
      // which the leader stops joining two things and starts crossing a picture.
      // Beyond it the label is not drawn at all and its building goes dark —
      // which at least says something true, where a line trailing off across
      // the city does not. Measured anchor to box, not box to roof: the gap a
      // building has left to grow is honest length, not stray length.
      const leaderMax = 120 + stageW * 0.14;
      // Three passes, each giving up one thing: first clear of the buildings, the
      // other labels and every other leader; then allowing a building to be
      // crossed; then allowing a leader to be crossed. A blemish beats a missing
      // name and a crossing beats a missing name, but neither is free.
      for (const relax of [0, 1, 2]) {
        for (const slot of (c.lift ? SLOTS : [{ ux: 0, uy: 0, r: 0 }])) {
          const sx = c.sx + slot.ux * (c.hw + 12) * slot.r;
          const sy = c.sy + slot.uy * (c.hh + 12) * slot.r;
          if (c.lift && Math.hypot(c.sx - sx, c.sy - sy) > leaderMax) continue;
          if (sx - c.hw < 4 || sx + c.hw > stageW - 4) continue;
          if (sy - c.hh < 4 || sy + c.hh > stageH - 4) continue;
          if (inChrome(sx, sy, c.hw, c.hh)) continue;
          if (placed.some((p) => p.tower !== c.tower && (relax < 1 || !p.soft)
            && Math.abs(p.sx - sx) < p.hw + c.hw
            && Math.abs(p.sy - sy) < p.hh + c.hh)) continue;
          // The anchor, not the roof as it stands this year. The drawn leader
          // still runs to the roof, but if the layout is solved against a point
          // that moves, the layout moves — which is how a whole chapter's
          // labels reshuffled the moment one building finished growing.
          const line = { x1: sx, y1: sy, x2: c.sx, y2: c.sy };
          if (c.lift && relax < 2) {
            // Not through another leader, and not through another label either
            // — a line entering a box and coming out the far side is the same
            // ambiguity drawn a different way.
            if (leaders.some((l) => crosses(l, line))) continue;
            if (placed.some((p) => !p.soft && throughBox(line, p))) continue;
          }
          best = { sx, sy, line };
          break;
        }
        if (best) break;
      }

      if (best) {
        if (c.lift) {
          // Offsets from the exact anchor, so the box lands on the grid the
          // layout was solved on and stays there.
          c.el.style.setProperty('--lift', `${Math.round(c.ay - best.sy)}px`);
          c.el.style.setProperty('--shift', `${Math.round(best.sx - c.ax)}px`);
          // The leader, from the foot of the box to the roof as it stands this
          // year, at whatever angle joins the two.
          if (c.roofY !== undefined) {
            const dx = (c.roofX ?? c.sx) - best.sx;
            const dy = Math.max(8, c.roofY - best.sy - c.boxH / 2);
            c.el.style.setProperty('--stem-dx', `${Math.round(dx)}px`);
            c.el.style.setProperty('--stem-dy', `${Math.round(dy)}px`);
            c.el.style.setProperty('--stem-len', `${Math.round(Math.hypot(dx, dy))}px`);
            c.el.style.setProperty('--stem-ang', `${(Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1)}deg`);
          }
        }
        if (c.lift) leaders.push(best.line);
        c.sx = best.sx;
        c.sy = best.sy;
        placed.push(c);
      }
      c.label.visible = !!best && !c.hidden;
      if (c.tower) (best ? namedNow : unnamedNow).add(c.tower);
    }

    for (const t of unnamedNow) unplaceable.add(t);
    for (const t of namedNow) unplaceable.delete(t);
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
      // No drift. A slow orbit looks alive standing still, but it moves every
      // label on the screen every frame, and a label near a neighbour crosses
      // and re-crosses it — which reads as names flickering on and off rather
      // than as a camera moving. A still frame is worth more than a live one.
      aimCamera();
      // Snap the last fraction. An asymptote never arrives, and while it is
      // arriving every label on the screen is a pixel out from where it was.
      if (camera.position.distanceToSquared(camGoal) < 0.06) {
        camera.position.copy(camGoal);
        controls.target.copy(lookGoal);
      } else {
        camera.position.lerp(camGoal, 1 - Math.pow(0.002, dt));
        controls.target.lerp(lookGoal, 1 - Math.pow(0.002, dt));
      }
    }
    controls.update();
    build(dt);
    traffic(dt);
    placeLabels();
    ao.uProjInv.value.copy(camera.projectionMatrixInverse);
    renderer.setRenderTarget(sceneTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(resolveScene, resolveCam);
    labelRenderer.render(scene, camera);
    if (needMeasure && measureLabels()) needMeasure = false;
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

  /*  Taking the camera means dragging it, not touching it. Any pointerdown used
   *  to count, so on a phone — where a tap is how you interact with anything at
   *  all — the first touch froze the framing for the rest of the story, and
   *  every later chapter kept a shot composed for an earlier one while the
   *  buildings grew off the top of the screen. A drag past a few pixels is the
   *  gesture that actually means "I want to look somewhere else". */
  let dragFrom = null;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    dragFrom = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!dragFrom) return;
    if (Math.abs(e.clientX - dragFrom.x) + Math.abs(e.clientY - dragFrom.y) > 8) {
      state.userMoved = true;
      dragFrom = null;
    }
  });
  addEventListener('pointerup', () => { dragFrom = null; });
  renderer.domElement.addEventListener('wheel', () => { state.userMoved = true; }, { passive: true });
  renderer.domElement.addEventListener('click', (e) => {
    const found = pick(e);
    if (!found) { state.selected = null; frameCity(); onPick(null, e); return; }
    if (found.tower) focusTower(found.tower);
    onPick(describe(found), e);
  });

  // -------------------------------------------------------------- resize --
  // The narration panel owns part of the screen, so the frustum's centre is
  // pushed away from it and the city composes into what is left. On a desktop
  // the panel sits beside the city, so that push is sideways; on a phone it is
  // underneath, so the push is upward instead. Cheaper and steadier than moving
  // the camera, which would swing the whole scene whenever the panel resized —
  // and the panel does resize, since every chapter's text is a different length.
  function applyViewOffset() {
    const w = stageW;
    const h = stageH;
    const panel = root.querySelector('#story-panel');
    const box = panel && !panel.hidden ? panel.getBoundingClientRect() : null;
    // Which way to push is decided by the panel's own shape, not the viewport's:
    // a card spanning most of the width sits under the city and pushes it up, a
    // narrow one sits beside it and pushes it sideways. That way a phone turned
    // on its side gets the right answer without a second breakpoint to keep in
    // step with the stylesheet.
    // The offset must equal the edge the card occupies, not a fraction of the
    // card's size. Shifting the frustum by `pad` puts the scene's centre at
    // (size + pad) / 2, so pad has to be the card's far edge for the scene to
    // land centred in what is left. A fraction of the width left the centre too
    // far over, and buildings sat behind the card where their labels were then
    // dropped for overprinting it — which is how a blocked deal went unnamed
    // while the camera believed it was framing the building.
    const base = root.getBoundingClientRect();
    const band = box ? box.width > w * 0.6 : false;
    const padX = box && !band
      ? Math.round(Math.max(0, Math.min(w * 0.52, box.right - base.left + 18)))
      : 0;
    const padY = box && band
      ? Math.round(Math.max(0, Math.min(h * 0.6, h - (box.top - base.top) + 12)))
      : 0;
    if (padX === lastPad.x && padY === lastPad.y && w === lastPad.w && h === lastPad.h) return;
    const refit = Math.abs(padY - lastPad.y) > 12 || Math.abs(padX - lastPad.x) > 12
      || w !== lastPad.w || h !== lastPad.h;
    lastPad = { x: padX, y: padY, w, h };
    camera.aspect = (w + padX) / (h + padY);
    if (padX || padY) camera.setViewOffset(w + padX, h + padY, 0, padY, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    ao.uProjInv.value.copy(camera.projectionMatrixInverse);
    // Same region, in NDC, for the fit to aim at. The top of it is held back by
    // one nameplate: a building's name stands above its roof, so a fit that puts
    // the roof at the top of the frame has, by construction, put the name off
    // the screen — which is how the tallest building in the city, the one the
    // whole chart is about, was the one that lost its label on a phone.
    const m = (2 * LABEL_MARGIN) / w;
    const left = (padX ? (2 * padX) / w - 1 : -1) + m;
    const right = 1 - m;
    const bottom = padY ? 1 - (2 * (h - padY)) / h : -1;
    const top = 1 - (2 * LABEL_HEADROOM()) / h;
    freeNdc.cx = (left + right) / 2;
    freeNdc.hx = Math.max(0.12, (right - left) / 2);
    freeNdc.cy = (bottom + top) / 2;
    freeNdc.hy = Math.max(0.12, (top - bottom) / 2);
    if (refit && !state.userMoved && chapters[state.chapter]) frameCity();
  }

  function resize() {
    const w = stage.clientWidth || innerWidth;
    const h = stage.clientHeight || innerHeight;
    stageW = w; stageH = h;
    // The narration panel owns the left of the screen, so push the frustum's
    // centre right by half its width and the city composes into what is left.
    // Cheaper and steadier than moving the camera, which would swing the whole
    // scene every time the panel resized.
    applyViewOffset();
    renderer.setSize(w, h);
    const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
    sceneTarget.setSize(buf.x, buf.y);
    ao.uResolution.value.copy(buf);
    ao.uProjScale.value = 0.5 * buf.y * camera.projectionMatrix.elements[5];
    ao.uProjInv.value.copy(camera.projectionMatrixInverse);
    labelRenderer.setSize(w, h);
    // Media queries change the label type sizes, so the boxes need re-reading.
    for (const t of towers) {
      t.lw = 0;
      for (const f of t.floors) f.lw = 0;
      for (const p of t.ghostParts) p.lw = 0;
    }
    needMeasure = true;
    // A resize changes the free area, so the shot has to be recomputed — unless
    // the reader has taken the camera somewhere themselves.
    if (!state.userMoved && chapters[state.chapter]) frameCity();
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
        state.userMoved = false;
        frameCity();
        onChapterChange(chapters[idx], idx);
      }
      refresh();
    },
    resetView() { state.userMoved = false; frameCity(); },
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
