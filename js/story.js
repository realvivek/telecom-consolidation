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
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
const FACADE_TILE = 0.85;    // world units per 4×4 window tile — sets storey scale

const GRID_COLS = 4;
const GRID_STEP = 9.2;       // block pitch: building + pavement + street
const BLOCK_W = 6.4;         // pavement slab around each building
const ROAD_W = 2.8;
const MONUMENT_Z = -27.5;   // behind the plaza, so the empty 1983 city still has a subject

const RISE_YEARS = 0.55;     // how long a storey takes to slide into place

const TAU = Math.PI * 2;
const SKY_TOP = 0x2f74c8;
const SKY_MID = 0x74a9dd;
const SKY_HORIZON = 0xd3e6f6;
// Low and a little behind the default view, so the sun is actually in frame and
// the buildings throw long afternoon shadows across the plaza.
const SUN_DIR = new THREE.Vector3(0.402, 0.156, -0.903).normalize();
const RIDGES = [
  { radius: 400, min: 14, max: 40, seed: 8.9, peak: '#93aec6', haze: '#c6dbee' },
  { radius: 345, min: 11, max: 32, seed: 4.2, peak: '#7c9ab6', haze: '#bcd4ea' },
  { radius: 300, min: 8, max: 25, seed: 1.7, peak: '#6787a6', haze: '#b0cbe4' },
];

const COLOR = {
  ground: 0xc3cbbe,
  pavement: 0xdedbd2,
  roof: 0x9a9c9f,
  ghost: 0xd03b3b,
  pending: 0x6f7480,
  beacon: 0x2a78d6,
  stone: 0xbfc0b8,
};

// Architecture, borrowed from Chicago. Massing, façade and crown are decoration
// — only storey HEIGHT carries data. `profile` returns the width multiplier at a
// given fraction of the finished height, which is what gives each building its
// setbacks and taper.
const STYLES = {
  bundle: {
    label: 'Bundled tube, after the Sears Tower',
    wall: '#98a0a8', glass: '#44505d', plan: 'box', mullions: true,
    profile: (f) => (f < 0.40 ? 1 : f < 0.64 ? 0.84 : f < 0.84 ? 0.64 : 0.46),
    crown: 'antennas',
  },
  taper: {
    label: 'Tapered tube, after the John Hancock Center',
    wall: '#5e6167', glass: '#323a45', plan: 'box', mullions: true,
    profile: (f) => 1 - f * 0.44,
    crown: 'antennas',
  },
  limestone: {
    label: 'Limestone slab, after the Aon Center',
    wall: '#ece7dc', glass: '#93a7bb', plan: 'slab', piers: true,
    profile: () => 1,
    crown: 'parapet',
  },
  deco: {
    label: 'Art-deco setbacks, after the Board of Trade',
    wall: '#e1d7c0', glass: '#7f8c9b', plan: 'box', piers: true,
    profile: (f) => (f < 0.48 ? 1 : f < 0.76 ? 0.79 : 0.58),
    crown: 'pyramid',
  },
  gothic: {
    label: 'Neo-Gothic, after the Tribune Tower',
    wall: '#dcd2bd', glass: '#87867c', plan: 'box', piers: true,
    profile: (f) => (f < 0.85 ? 1 : 0.7),
    crown: 'pinnacles',
  },
  terracotta: {
    label: 'White terracotta, after the Wrigley Building',
    wall: '#f7f2e7', glass: '#a3b6c7', plan: 'box', piers: true,
    profile: (f) => (f < 0.7 ? 1 : 0.76),
    crown: 'clocktower',
  },
  glassbox: {
    label: 'Steel and glass, after 860–880 Lake Shore Drive',
    wall: '#41454b', glass: '#90b3cd', plan: 'slab', mullions: true,
    profile: () => 1,
    crown: 'parapet',
  },
  round: {
    label: 'Cylindrical, after Marina City',
    wall: '#ded8cc', glass: '#8f96a2', plan: 'round',
    profile: () => 1,
    crown: 'disc',
  },
  masonry: {
    label: 'Chicago School masonry, after the Monadnock Building',
    wall: '#a8735b', glass: '#cfdae4', plan: 'slab', brick: true,
    profile: () => 1,
    crown: 'cornice',
  },
};
// The tallest buildings get the styles that were invented for tall buildings.
const TALL_ORDER = ['bundle', 'taper', 'limestone', 'deco', 'gothic', 'terracotta', 'glassbox', 'round'];
const LOW_ORDER = ['masonry', 'round', 'terracotta', 'glassbox', 'gothic', 'deco'];

/** Footprint in x and z for a given style at a given width. */
function planDims(style, w) {
  return style.plan === 'slab' ? { x: w * 1.34, z: w * 0.66 } : { x: w, z: w };
}

const CAR_COLORS = [0xd8d8d8, 0x33507a, 0x8c2f2f, 0x2f5c46, 0xe0e0e0, 0x4a4a52, 0xb9743a];
const CLOTHES = [0x3d5a80, 0x8a4b3c, 0x445a44, 0x6b5b8a, 0x9a6a3c, 0x50535c, 0xa04a5a];

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

// -------------------------------------------------------------- textures ---
// Deterministic patterns — no RNG, so the city looks the same every visit.
function facadeTexture(style) {
  const { wall, glass, piers, mullions, brick } = style;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = wall;
  g.fillRect(0, 0, 64, 64);

  // Masonry reads as small punched openings in a load-bearing wall; the curtain
  // walls read as glass held in a grid.
  const winW = brick ? 7 : 10;
  const winX = brick ? 5 : 3;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const bright = (col * 5 + row * 11) % 7 > 4;   // a few panes catching the sun
      g.fillStyle = bright ? '#cfe0ee' : glass;
      g.fillRect(col * 16 + winX, row * 16 + 4, winW, brick ? 9 : 8);
      g.fillStyle = 'rgba(255,255,255,0.35)';        // sill highlight
      g.fillRect(col * 16 + winX, row * 16 + 12, winW, 1);
    }
    g.fillStyle = brick ? 'rgba(70,45,35,0.14)' : 'rgba(90,90,95,0.10)';
    g.fillRect(0, row * 16 + 14, 64, 2);             // floor band
  }
  if (piers) {                                       // deep vertical piers
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (let col = 0; col < 4; col++) g.fillRect(col * 16 + 13, 0, 3, 64);
    g.fillStyle = 'rgba(60,55,45,0.10)';
    for (let col = 0; col < 4; col++) g.fillRect(col * 16 + 16, 0, 1, 64);
  }
  if (mullions) {                                    // slim steel mullions
    g.fillStyle = 'rgba(20,22,26,0.55)';
    for (let col = 0; col < 4; col++) g.fillRect(col * 16 + 14, 0, 2, 64);
  }
  if (brick) {                                       // course lines
    g.fillStyle = 'rgba(255,255,255,0.07)';
    for (let y = 2; y < 64; y += 4) g.fillRect(0, y, 64, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#4c4f57';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#53565f';
  for (let i = 0; i < 64; i += 9) g.fillRect(i, 0, 3, 64);   // faint surface grain
  g.fillStyle = '#ece7d8';
  g.fillRect(30, 6, 4, 22);                                   // dashed centre line
  g.fillRect(30, 38, 4, 22);
  g.fillStyle = '#c8ccc8';
  g.fillRect(1, 0, 2, 64);
  g.fillRect(61, 0, 2, 64);                                   // kerb lines
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft radial falloff for the sun's halo. */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,250,236,0.95)');
  grad.addColorStop(0.14, 'rgba(255,243,213,0.55)');
  grad.addColorStop(0.42, 'rgba(255,238,205,0.14)');
  grad.addColorStop(1, 'rgba(255,238,205,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A ring of hills on the horizon. Unlit and unfogged — this is scenery, so it
 *  is painted with aerial perspective (hazy at the base, cooler at the peaks)
 *  rather than dropped into the lighting model. */
function makeRidge({ radius, min, max, seed, peak, haze }) {
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

// ================================================================== engine ==
export function createStory(root) {
  const stage = root.querySelector('#story-stage');
  const labelLayer = root.querySelector('#story-labels');
  const towers = buildTowers();
  const disposables = [];
  const track = (x) => { disposables.push(x); return x; };

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY_HORIZON, 110, 340);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 900);
  camera.position.set(0, 30, 70);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
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

  scene.add(new THREE.HemisphereLight(0xdcecff, 0x9aa08e, 1.5));
  const sun = new THREE.DirectionalLight(0xfff3dd, 2.4);
  sun.position.copy(SUN_DIR).multiplyScalar(260);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
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
  const fill = new THREE.DirectionalLight(0xd8e8ff, 0.75);
  fill.position.set(-0.3, 0.55, 1).multiplyScalar(80);
  scene.add(fill);

  // The sun itself, with a halo, so the light has a source you can see.
  {
    const sunAt = SUN_DIR.clone().multiplyScalar(430);
    const disc = new THREE.Mesh(
      track(new THREE.CircleGeometry(9, 40)),
      track(new THREE.MeshBasicMaterial({ color: 0xfffaf0, fog: false })),
    );
    disc.position.copy(sunAt);
    disc.lookAt(0, 0, 0);
    scene.add(disc);

    const halo = new THREE.Sprite(track(new THREE.SpriteMaterial({
      map: track(glowTexture()),
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })));
    halo.position.copy(sunAt);
    halo.scale.setScalar(78);
    scene.add(halo);
  }

  // Mountains on the horizon, painted rather than lit — near ridges darker,
  // far ones hazier, each fading into the sky along its base.
  for (const r of RIDGES) {
    const mesh = makeRidge(r);
    track(mesh.geometry);
    track(mesh.material);
    scene.add(mesh);
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.13, 0.32, 0.97);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ------------------------------------------------------------ the ground --
  const span = GRID_STEP * GRID_COLS;

  {
    const ground = new THREE.Mesh(
      track(new THREE.PlaneGeometry(1400, 1400)),
      track(new THREE.MeshStandardMaterial({ color: COLOR.ground, roughness: 1 })),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // Streets along every block line, running the full width of the plaza.
  {
    const base = track(roadTexture());
    const length = span + GRID_STEP * 2;
    const roadGeo = track(new THREE.PlaneGeometry(ROAD_W, length));
    const lines = [];
    for (let i = 0; i <= GRID_COLS; i++) lines.push((i - GRID_COLS / 2) * GRID_STEP);

    const makeRoad = (horizontal, at) => {
      const tex = track(base.clone());
      tex.needsUpdate = true;
      tex.anisotropy = maxAnisotropy;
      tex.repeat.set(1, Math.round(length / ROAD_W));
      const mesh = new THREE.Mesh(roadGeo, track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })));
      mesh.rotation.x = -Math.PI / 2;
      if (horizontal) mesh.rotation.z = Math.PI / 2;
      mesh.position.set(horizontal ? 0 : at, 0.02, horizontal ? at : 0);
      mesh.receiveShadow = true;
      scene.add(mesh);
    };
    for (const at of lines) { makeRoad(false, at); makeRoad(true, at); }
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

  // ---------------------------------------------------------------- trees ---
  {
    const trunkGeo = track(new THREE.CylinderGeometry(0.06, 0.09, 0.55, 6));
    const leafGeo = track(new THREE.ConeGeometry(0.45, 1.15, 8));
    const trunkMat = track(new THREE.MeshStandardMaterial({ color: 0x7a5c42, roughness: 1 }));
    const leafMat = track(new THREE.MeshStandardMaterial({ color: 0x5f8352, roughness: 0.95 }));
    const spots = [[-2.55, -2.55], [2.55, -2.55], [-2.55, 2.55], [2.55, 2.55]];
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, towers.length * 4);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, towers.length * 4);
    leaves.castShadow = true;
    const m = new THREE.Object3D();
    let n = 0;
    for (const t of towers) {
      for (const [dx, dz] of spots) {
        const s = 0.85 + ((n * 7) % 5) * 0.08;
        m.scale.setScalar(s);
        m.position.set(t.x + dx, 0.16 + 0.27 * s, t.z + dz);
        m.updateMatrix();
        trunks.setMatrixAt(n, m.matrix);
        m.position.y = 0.16 + (0.55 + 0.5) * s;
        m.updateMatrix();
        leaves.setMatrixAt(n, m.matrix);
        n++;
      }
    }
    scene.add(trunks, leaves);
  }

  // ----------------------------------------------------------------- cars ---
  const cars = [];
  {
    const bodyGeo = track(new THREE.BoxGeometry(0.66, 0.26, 1.45));
    const cabGeo = track(new THREE.BoxGeometry(0.58, 0.24, 0.68));
    const glassMat = track(new THREE.MeshStandardMaterial({ color: 0x9fb4c6, roughness: 0.25, metalness: 0.5 }));
    const lines = [];
    for (let i = 0; i <= GRID_COLS; i++) lines.push((i - GRID_COLS / 2) * GRID_STEP);
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

  // -------------------------------------------------------------- people ----
  const PEOPLE_PER_BLOCK = 9;
  const peopleCount = towers.length * PEOPLE_PER_BLOCK;
  const walkers = [];
  const bodies = new THREE.InstancedMesh(
    track(new THREE.CapsuleGeometry(0.08, 0.2, 3, 6)),
    track(new THREE.MeshStandardMaterial({ roughness: 0.9 })),
    peopleCount,
  );
  const heads = new THREE.InstancedMesh(
    track(new THREE.SphereGeometry(0.082, 6, 5)),
    track(new THREE.MeshStandardMaterial({ color: 0xdcb79a, roughness: 0.9 })),
    peopleCount,
  );
  {
    bodies.castShadow = true;
    bodies.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(peopleCount * 3), 3);
    const tint = new THREE.Color();
    let n = 0;
    for (const t of towers) {
      for (let i = 0; i < PEOPLE_PER_BLOCK; i++) {
        walkers.push({
          x: t.x, z: t.z,
          s: (i / PEOPLE_PER_BLOCK) * (BLOCK_W * 4) + ((n * 11) % 7) * 0.3,
          speed: (0.55 + ((n * 17) % 6) * 0.1) * (n % 3 ? 1 : -1),
        });
        tint.setHex(CLOTHES[n % CLOTHES.length]);
        bodies.instanceColor.setXYZ(n, tint.r, tint.g, tint.b);
        n++;
      }
    }
    scene.add(bodies, heads);
  }

  // ------------------------------------------------------------ buildings --
  const boxGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const cylGeo = track(new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1));
  const edgeGeo = track(new THREE.EdgesGeometry(boxGeo));

  /** What a building wears on its head. Pure decoration — it sits above the
   *  parapet and is never a storey, so it never stands for a deal. */
  function makeCrown(style, w, keep) {
    const group = new THREE.Group();
    const stone = keep(new THREE.MeshStandardMaterial({ color: COLOR.roof, roughness: 0.85 }));
    const metal = keep(new THREE.MeshStandardMaterial({ color: 0x8d9298, roughness: 0.4, metalness: 0.6 }));
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

  function facade(tower, width, height, depth) {
    const round = tower.style.plan === 'round';
    const tex = track(tower.tex.clone());
    tex.needsUpdate = true;
    tex.anisotropy = maxAnisotropy;
    tex.repeat.set(
      Math.max(1, Math.round(width / FACADE_TILE)),
      Math.max(1, Math.round(height / FACADE_TILE)),
    );
    const mesh = new THREE.Mesh(round ? cylGeo : boxGeo, track(new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.72, metalness: 0.12,
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
    const lines = new THREE.LineSegments(edgeGeo, track(new THREE.LineBasicMaterial({ color })));
    lines.scale.set(width, height, depth);
    group.add(shell, lines);
    return group;
  }

  for (const t of towers) {
    t.tex = track(facadeTexture(t.style));
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
    const plinth = facade(t, baseDims.x, PLINTH_H, baseDims.z);
    plinth.position.y = 0.16 + PLINTH_H / 2;
    plinth.userData.tower = t;
    group.add(plinth);
    picks.push(plinth);

    for (const f of t.floors) {
      const w = widthAt(f.base) * (f.narrow ? 0.78 : 1);
      const dims = planDims(t.style, w);
      f.dx = dims.x / 2;
      f.dz = dims.z / 2;
      const mesh = facade(t, dims.x, f.h, dims.z);
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
      const node = outlineBox(TOWER_W * 0.94, h, TOWER_W * 0.94, COLOR.ghost, 0.16);
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
      const node = outlineBox(t.topWidth, h, t.topWidth, COLOR.pending, 0.12);
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
          color: COLOR.beacon, emissive: COLOR.beacon, emissiveIntensity: 0.7, roughness: 0.4,
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
  }

  function traffic(dt) {
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
    const h = BLOCK_W / 2 - 0.5;
    walkers.forEach((w, i) => {
      w.s += w.speed * dt;
      loopPoint(w.s, h, walkPoint);
      dummy.position.set(w.x + walkPoint.x, 0.16 + 0.22, w.z + walkPoint.z);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 0.16 + 0.42;
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
    });
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
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
    if (sx < 560 && sy > stageH - 400) return true;
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
        || floorPlaced.some((p) => Math.abs(p.sy - c.sy) < 31 && Math.abs(p.sx - c.sx) < 180);
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
        || placed.some((p) => Math.abs(p.sy - c.sy) < 34 && Math.abs(p.sx - c.sx) < 150);
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
    composer.render();
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
    composer.setSize(w, h);
    bloom.setSize(w, h);
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
