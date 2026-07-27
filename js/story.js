// Story mode — the same lineage, flown through in 3D.
//
// The layout is deliberately the same one the flat chart uses: time along X,
// one lane per company stacked in Y and grouped by the trunk it ended up
// inside, sector as a small offset in Z. Depth and motion are added on top of
// that order rather than replacing it, so a thread you follow here is the same
// thread you can find in the chart. Names are real DOM text, and only the
// companies the current chapter is about are labelled — that is what keeps a
// scene with sixty-six threads in it readable.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import {
  CHAPTERS, COMPANIES, DEALS, START_YEAR,
  byId, nameAt, shortOf, mergedInto,
  endYear, isAlive, widthAt, FAMILIES,
} from './model.js';

// --------------------------------------------------------------- constants --
const TAU = Math.PI * 2;
const YEAR_X = 2.6;                 // world units per year
const RING_R = 6.8;                 // radius the family strands ride at
const EASE = 2.2;                   // years a thread takes to converge on its buyer
const SAMPLES_PER_YEAR = 4;
/** How long a chapter takes to play. Scaled to the years it covers, so the
 *  one-year prologue is not held on screen as long as the eleven-year breakup. */
const chapterSeconds = (ch) => Math.min(16, Math.max(5, 4.5 + (ch.yearTo - ch.yearFrom) * 1.05));

const FOCUS_DIM = 0.26;             // how far the rest of the scene recedes

const COLOR = {
  bg: 0x080810,
  alive: 0x4a9bff,
  dead: 0x6f6d67,
  failed: 0xd03b3b,
  pending: 0xc3c2b7,
  node: 0xf0efec,
};

const X = (year) => (year - START_YEAR) * YEAR_X;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const SPIN_AXIS = new THREE.Vector3(1, 0, 0);

// ------------------------------------------------------------------ layout --
// Time runs along X. The other two axes are a ring: each surviving company owns
// an angular wedge, and everything that ended up inside it rides in that wedge.
// A stack sixty-six rows tall would need the camera so far back that nothing
// was legible; a ring keeps the whole cross-section in frame, and turns each
// family into a visible braid of strands twisting into one.
// The Bell System sits on the axis itself — the monopoly at the centre — so the
// 1984 breakup reads as threads thrown outward to every wedge at once.

/** Reorder a family so its surviving trunk sits in the middle of the fan. */
function centreTrunk(lanes) {
  const out = [];
  lanes.forEach((id, k) => {
    const entry = { id, k };
    if (k === 0) out.push(entry);
    else if (k % 2) out.push(entry);
    else out.unshift(entry);
  });
  return out;
}

const slot = new Map();   // companyId -> { y, z }
{
  slot.set('bellsystem', { y: 0, z: 0 });
  FAMILIES.forEach((fam, f) => {
    const centre = (f / FAMILIES.length) * TAU;
    const wedge = (TAU / FAMILIES.length) * 0.68;
    const fan = centreTrunk(fam.lanes);
    fan.forEach((entry, i) => {
      const t = fan.length === 1 ? 0 : i / (fan.length - 1) - 0.5;
      const angle = centre + t * wedge;
      // The trunk rides a little inside its tributaries, so they flow inward.
      const r = RING_R + (entry.k === 0 ? -1.1 : 0.5 + (entry.k % 3) * 0.6);
      slot.set(entry.id, { y: Math.sin(angle) * r, z: Math.cos(angle) * r });
    });
  });
}

/** Where a thread is at a given year, including its spawn-in and merge-out. */
function posAt(id, year, depth = 0, out = new THREE.Vector3()) {
  const c = byId.get(id);
  const home = slot.get(id) || { y: 0, z: 0 };
  out.set(X(year), home.y, home.z);
  if (!c || depth > 3) return out;

  if (c.spawnedFrom && slot.has(c.spawnedFrom) && year < c.born + EASE) {
    const from = posAt(c.spawnedFrom, c.born, depth + 1, new THREE.Vector3());
    from.x = out.x;
    return out.lerp(from, 1 - smooth(clamp01((year - c.born) / EASE)));
  }
  const d = mergedInto.get(id);
  if (d && slot.has(d.acquirer) && year > d.year - EASE) {
    const to = posAt(d.acquirer, d.year, depth + 1, new THREE.Vector3());
    to.x = out.x;
    return out.lerp(to, smooth(clamp01((year - (d.year - EASE)) / EASE)));
  }
  return out;
}

// ------------------------------------------------------- ribbon geometry ---
// A tube of varying radius built straight from the sampled points, so a trunk
// visibly thickens each time it swallows something. Index order runs along the
// length, which lets setDrawRange grow the thread as the years advance.
function ribbon(points, radii, radial = 6) {
  const seg = points.length - 1;
  const position = [];
  const normal = [];
  const index = [];
  const up = new THREE.Vector3(0, 1, 0);
  const alt = new THREE.Vector3(0, 0, 1);
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), v = new THREE.Vector3();

  for (let i = 0; i <= seg; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(seg, i + 1)];
    T.subVectors(next, prev).normalize();
    const reference = Math.abs(T.dot(up)) > 0.9 ? alt : up;
    N.crossVectors(T, reference).normalize();
    B.crossVectors(N, T).normalize();
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      v.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      normal.push(v.x, v.y, v.z);
      position.push(points[i].x + v.x * radii[i], points[i].y + v.y * radii[i], points[i].z + v.z * radii[i]);
    }
  }
  for (let i = 1; i <= seg; i++) {
    for (let j = 1; j <= radial; j++) {
      const a = (radial + 1) * (i - 1) + (j - 1);
      const b = (radial + 1) * i + (j - 1);
      const c = (radial + 1) * i + j;
      const d = (radial + 1) * (i - 1) + j;
      index.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(index);
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  g.userData.perStep = radial * 6;   // indices consumed by one step along the length
  g.userData.steps = seg;
  return g;
}

// ------------------------------------------------------------- the chapters --
// What each chapter frames. Kept to neighbouring blocks so the shot stays tight
// enough to read; the last two are deliberately wide — that is their point.
const FOCUS = {
  prologue: ['bellsystem'],
  breakup: ['bellsystem', 'sbc', 'pactel', 'ameritech', 'bellsouth', 'attcorp', 'bellatlantic', 'nynex'],
  freeforall: ['sbc', 'pactel', 'ameritech', 'snet', 'attcorp', 'tci', 'bellatlantic', 'nynex', 'gte', 'worldcom', 'mci'],
  reassembly: ['sbc', 'attcorp', 'cingular', 'attwireless', 'bellsouth', 'mccaw', 'tci', 'mediaone', 'leap'],
  wireless: ['bellatlantic', 'alltel', 'worldcom', 'voicestream', 'metropcs', 'sprint', 'nextel', 'clearwire'],
  cable: ['charter', 'twc', 'brighthouse', 'cox', 'libertybb', 'comcast', 'attbroadband', 'adelphia', 'altice', 'cablevision', 'suddenlink'],
  // The last two are the wide shots: every surviving trunk at once, which is
  // the whole point of the chapter and frames the entire ring by itself.
  endgame: COMPANIES.filter((c) => isAlive(c.id)).map((c) => c.id),
  epilogue: COMPANIES.filter((c) => isAlive(c.id)).map((c) => c.id),
};

// The angle each chapter is shot from. Roomier chapters get a little more air.
const VIEW = {
  prologue:   { dir: [0.35, 0.26, 1], pad: 1.35 },
  breakup:    { dir: [0.52, 0.40, 1], pad: 1.20 },
  freeforall: { dir: [0.40, 0.28, 1], pad: 1.15 },
  reassembly: { dir: [-0.32, 0.32, 1], pad: 1.15 },
  wireless:   { dir: [0.28, 0.42, 1], pad: 1.15 },
  cable:      { dir: [-0.38, 0.24, 1], pad: 1.15 },
  endgame:    { dir: [0.20, 0.30, 1], pad: 1.55 },
  epilogue:   { dir: [0.12, 0.18, 1], pad: 1.85 },
};

// ================================================================== engine ==
export function createStory(root) {
  const stage = root.querySelector('#story-stage');
  const labelLayer = root.querySelector('#story-labels');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOR.bg);
  scene.fog = new THREE.Fog(COLOR.bg, 42, 190);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 600);
  camera.position.set(X(1984) + 30, 12, 46);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  stage.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer({ element: labelLayer });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 6;
  controls.maxDistance = 320;
  controls.maxPolarAngle = Math.PI * 0.86;

  scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x14141c, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(1, 2, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6ea8ff, 0.8);
  rim.position.set(-2, -1, -2);
  scene.add(rim);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.62, 0.7, 0.72);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ------------------------------------------------------------- year grid --
  // A hoop every five years: the time scale you fly through.
  const gridGroup = new THREE.Group();
  scene.add(gridGroup);
  const hoopR = RING_R + 2.6;
  const gridMat = new THREE.LineBasicMaterial({ color: 0x39395a, transparent: true, opacity: 0.32 });
  for (let year = 1985; year <= 2025; year += 5) {
    const pts = [];
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * TAU;
      pts.push(new THREE.Vector3(X(year), Math.sin(a) * hoopR, Math.cos(a) * hoopR));
    }
    gridGroup.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    const el = document.createElement('span');
    el.className = 'story-year';
    el.textContent = String(year);
    const tag = new CSS2DObject(el);
    tag.position.set(X(year), hoopR + 1.1, 0);
    gridGroup.add(tag);
  }

  // ---------------------------------------------------------------- threads --
  const threads = new Map();   // id -> { mesh, points, years, label, ... }
  const raycastTargets = [];

  for (const c of COMPANIES) {
    const start = Math.max(c.born, START_YEAR);
    const stop = endYear(c.id);
    const steps = Math.max(2, Math.round((stop - start) * SAMPLES_PER_YEAR));
    const points = [];
    const years = [];
    const radii = [];
    for (let i = 0; i <= steps; i++) {
      const year = start + ((stop - start) * i) / steps;
      points.push(posAt(c.id, year, 0, new THREE.Vector3()));
      years.push(year);
      radii.push(Math.min(0.30, 0.085 + widthAt(c.id, year) * 0.075));
    }

    const alive = isAlive(c.id);
    const geometry = ribbon(points, radii);
    const material = new THREE.MeshStandardMaterial({
      color: alive ? COLOR.alive : COLOR.dead,
      emissive: alive ? COLOR.alive : 0x101014,
      emissiveIntensity: alive ? 0.55 : 0.12,
      roughness: 0.42,
      metalness: 0.08,
      transparent: true,
      opacity: alive ? 1 : 0.85,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.company = c.id;
    mesh.frustumCulled = false;
    scene.add(mesh);
    raycastTargets.push(mesh);

    const el = document.createElement('span');
    el.className = `story-label${alive ? ' is-alive' : ''}`;
    el.textContent = shortOf(c.id);
    const label = new CSS2DObject(el);
    label.visible = false;
    scene.add(label);

    threads.set(c.id, { company: c, mesh, material, geometry, points, years, label, el, start, stop, alive, level: 1, target: 1 });
  }

  // ------------------------------------------------------------------ nodes --
  const nodeGeo = new THREE.IcosahedronGeometry(1, 1);
  const nodes = [];
  for (const d of DEALS) {
    if (d.hideNode) continue;
    const anchor = d.type === 'merge' || d.type === 'pending' ? d.acquirer
      : d.type === 'split' && !d.target ? byId.get(d.spawn)?.spawnedFrom
      : d.target;
    if (!anchor || !slot.has(anchor)) continue;
    const at = posAt(anchor, Math.min(d.year, endYear(anchor)), 0, new THREE.Vector3());
    const failed = d.type === 'failed';
    const pending = d.type === 'pending';
    const size = 0.16 + Math.log10(1 + (d.valueB || 0)) * 0.19 + (d.type === 'split' ? 0.5 : 0);
    const material = new THREE.MeshStandardMaterial({
      color: failed ? COLOR.failed : pending ? COLOR.pending : COLOR.node,
      emissive: failed ? COLOR.failed : pending ? 0x333330 : 0xfff4d6,
      emissiveIntensity: failed ? 1.5 : 1.1,
      roughness: 0.3,
    });
    const mesh = new THREE.Mesh(nodeGeo, material);
    mesh.position.copy(at);
    if (failed) mesh.position.y += 0.9;
    mesh.scale.setScalar(0.001);
    mesh.userData.deal = d.id;
    mesh.frustumCulled = false;
    scene.add(mesh);
    raycastTargets.push(mesh);
    nodes.push({ deal: d, mesh, size });
  }

  // --------------------------------------------------------------- playback --
  const chapters = CHAPTERS.map((ch) => ({
    ...ch,
    focus: (FOCUS[ch.id] || []).filter((id) => threads.has(id)),
    view: VIEW[ch.id] || VIEW.endgame,
  }));

  const state = {
    chapter: 0,
    year: START_YEAR,
    playing: false,
    userMoved: false,
    hovered: null,
    pinned: null,
  };

  const camGoal = new THREE.Vector3();
  const lookGoal = new THREE.Vector3();
  // The chapter fixes how far back and at what angle the camera sits, and which
  // horizontal band it watches; the year then carries it along the timeline.
  const shot = { y: 0, z: 0, dist: 40, base: new THREE.Vector3(0, 0, 1), dir: new THREE.Vector3(0, 0, 1) };
  let spin = 0;   // a slow orbit around the rope, so a paused scene still breathes

  function frameChapter(ch, instant = false) {
    const box = new THREE.Box3();
    const p = new THREE.Vector3();
    const ids = ch.focus.length ? ch.focus : [...threads.keys()];
    for (const id of ids) {
      const t = threads.get(id);
      for (const year of [ch.yearFrom, (ch.yearFrom + ch.yearTo) / 2, ch.yearTo]) {
        box.expandByPoint(posAt(id, Math.min(Math.max(year, t.start), t.stop), 0, p).clone());
      }
    }
    if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(14, 14, 14));
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Fit the focus band in both directions rather than guessing a distance.
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(camera.aspect, 1));
    const fitY = (size.y / 2 + 1.2) / Math.tan(vFov / 2);
    const fitX = (Math.min(size.x, 44) / 2 + 3) / Math.tan(hFov / 2);
    shot.y = centre.y;
    shot.z = centre.z;
    shot.dist = Math.max(fitY, fitX, 10) * ch.view.pad + 4;
    shot.base.set(...ch.view.dir).normalize();
    spin = 0;
    aimCamera();
    if (instant) {
      camera.position.copy(camGoal);
      controls.target.copy(lookGoal);
    }
    state.userMoved = false;
  }

  /** Where the camera wants to be right now, given the year on the clock.
   *  Nothing has happened to the right of the clock, so the view hugs the years
   *  that exist: centred while the story is short, trailing the clock once it
   *  outgrows the frame. */
  function aimCamera() {
    const vFov = (camera.fov * Math.PI) / 180;
    const halfW = shot.dist * Math.tan(vFov / 2) * Math.max(camera.aspect, 1);
    const left = X(START_YEAR) - 3;
    const right = X(state.year) + 4;
    const cx = right - left < halfW * 1.7 ? (left + right) / 2 : right - halfW * 0.74;
    lookGoal.set(cx, shot.y, shot.z);
    shot.dir.copy(shot.base).applyAxisAngle(SPIN_AXIS, spin);
    camGoal.copy(lookGoal).addScaledVector(shot.dir, shot.dist);
  }

  function setChapter(i, { play = true } = {}) {
    state.chapter = Math.min(chapters.length - 1, Math.max(0, i));
    const ch = chapters[state.chapter];
    state.year = ch.yearFrom;
    state.playing = play && ch.yearTo > ch.yearFrom;
    frameChapter(ch);
    setEmphasis(ch);
    onChapterChange(ch, state.chapter);
    refresh();
  }

  /** Everything the chapter is not about recedes, so its subject reads first. */
  function setEmphasis(ch) {
    const focus = new Set(ch.focus);
    for (const [id, t] of threads) {
      t.target = focus.size === 0 || focus.has(id) ? 1 : FOCUS_DIM;
    }
  }

  function applyEmphasis(dt) {
    const k = Math.min(1, dt * 3.2);
    for (const t of threads.values()) {
      const want = t.target ?? 1;
      t.level += (want - t.level) * k;
      t.material.opacity = (t.alive ? 1 : 0.85) * t.level;
      t.material.emissiveIntensity = (t.alive ? 0.55 : 0.12) * t.level;
    }
  }

  // --------------------------------------------------------------- per-frame --
  const tmp = new THREE.Vector3();

  function revealThreads() {
    for (const t of threads.values()) {
      const { geometry } = t;
      if (state.year <= t.start) { t.mesh.visible = false; continue; }
      t.mesh.visible = true;
      const grown = clamp01((state.year - t.start) / (t.stop - t.start || 1));
      const steps = Math.max(1, Math.round(grown * geometry.userData.steps));
      geometry.setDrawRange(0, steps * geometry.userData.perStep);
    }
  }

  function revealNodes(dt) {
    for (const n of nodes) {
      const on = state.year >= n.deal.year;
      const target = on ? n.size : 0.001;
      const s = n.mesh.scale.x;
      n.mesh.scale.setScalar(s + (target - s) * Math.min(1, dt * 6));
      n.mesh.visible = n.mesh.scale.x > 0.01;
      if (on) n.mesh.rotation.y += dt * 0.4;
    }
  }

  // Labels are the part that decides whether a scene this dense is readable, so
  // they are capped twice: only the chapter's own companies are candidates, and
  // any that would overprint a nearer one is dropped rather than nudged.
  const projected = new THREE.Vector3();
  const candidates = [];
  const placed = [];

  function placeLabels() {
    const ch = chapters[state.chapter];
    const focus = new Set(ch.focus);
    if (state.hovered) focus.add(state.hovered);
    if (state.pinned) focus.add(state.pinned);

    candidates.length = 0;
    for (const [id, t] of threads) {
      if (!focus.has(id) || state.year <= t.start + 0.02) { t.label.visible = false; continue; }
      const year = Math.min(state.year, t.stop);
      posAt(id, year, 0, tmp);
      tmp.y += 0.42;
      t.label.position.copy(tmp);
      projected.copy(tmp).project(camera);
      if (projected.z > 1 || Math.abs(projected.x) > 1.15 || Math.abs(projected.y) > 1.15) {
        t.label.visible = false;
        continue;
      }
      candidates.push({
        t, id,
        sx: (projected.x * 0.5 + 0.5) * stageW,
        sy: (-projected.y * 0.5 + 0.5) * stageH,
        depth: camera.position.distanceToSquared(tmp),
        priority: id === state.hovered || id === state.pinned ? -1 : 0,
      });
    }

    candidates.sort((a, b) => a.priority - b.priority || a.depth - b.depth);
    placed.length = 0;
    // The deal feed owns the top-right corner; labels stay out of it rather than
    // printing over it.
    const feedX = stageW - 360;
    const feedY = 400;
    for (const c of candidates) {
      const clash = (c.sx > feedX && c.sy < feedY && stageW > 860)
        || placed.some((p) => Math.abs(p.sy - c.sy) < 20 && Math.abs(p.sx - c.sx) < 98);
      c.t.label.visible = !clash;
      if (clash) continue;
      placed.push(c);
      const year = Math.min(state.year, c.t.stop);
      const current = nameAt(c.id, year);
      if (c.t.el.textContent !== current) c.t.el.textContent = current;
      c.t.el.classList.toggle('is-focus', c.priority < 0);
      c.t.el.classList.toggle('is-ending', !c.t.alive && state.year >= c.t.stop - 0.4);
    }
  }

  let last = performance.now();
  let running = false;

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const ch = chapters[state.chapter];
    if (state.playing) {
      const speed = (ch.yearTo - ch.yearFrom) / chapterSeconds(ch);
      state.year = Math.min(ch.yearTo, state.year + speed * dt);
      if (state.year >= ch.yearTo - 1e-6) {
        state.playing = false;
        onChapterEnd(state.chapter);
      }
      onYear(state.year);
    }

    if (!state.userMoved) {
      spin += dt * 0.028;
      aimCamera();
      camera.position.lerp(camGoal, 1 - Math.pow(0.0022, dt));
      controls.target.lerp(lookGoal, 1 - Math.pow(0.0022, dt));
    }
    controls.update();

    revealThreads();
    revealNodes(dt);
    applyEmphasis(dt);
    placeLabels();

    composer.render();
    labelRenderer.render(scene, camera);
  }

  function refresh() {
    revealThreads();
    placeLabels();
    for (const n of nodes) {
      const on = state.year >= n.deal.year;
      n.mesh.scale.setScalar(on ? n.size : 0.001);
      n.mesh.visible = on;
    }
    onYear(state.year);
  }

  // ------------------------------------------------------------ interaction --
  const ray = new THREE.Raycaster();
  ray.params.Line = { threshold: 0.4 };
  const pointer = new THREE.Vector2();

  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(pointer, camera);
    for (const hit of ray.intersectObjects(raycastTargets, false)) {
      if (!hit.object.visible) continue;
      return hit.object.userData;
    }
    return null;
  }

  renderer.domElement.addEventListener('pointermove', (e) => {
    const found = pick(e);
    state.hovered = found?.company || null;
    renderer.domElement.style.cursor = found ? 'pointer' : 'grab';
    onHover(found, e);
  });
  renderer.domElement.addEventListener('pointerdown', () => { state.userMoved = true; });
  renderer.domElement.addEventListener('pointerleave', () => {
    state.hovered = null;
    onHover(null);
  });
  renderer.domElement.addEventListener('click', (e) => {
    const found = pick(e);
    state.pinned = found?.company || null;
    onPick(found, e);
  });

  // ----------------------------------------------------------------- resize --
  let stageW = 1;
  let stageH = 1;

  function resize() {
    const w = stage.clientWidth || innerWidth;
    const h = stage.clientHeight || innerHeight;
    stageW = w;
    stageH = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    labelRenderer.setSize(w, h);
  }

  // ------------------------------------------------------------------- hooks --
  let onChapterChange = () => {};
  let onChapterEnd = () => {};
  let onYear = () => {};
  let onHover = () => {};
  let onPick = () => {};

  return {
    chapters,
    state,
    threads,
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
    resetView() { frameChapter(chapters[state.chapter]); },
    dispose() {
      running = false;
      controls.dispose();
      renderer.dispose();
      for (const t of threads.values()) { t.geometry.dispose(); t.material.dispose(); }
      nodeGeo.dispose();
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

export { X as storyX, slot as storySlot };
