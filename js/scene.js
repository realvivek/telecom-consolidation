// Scene construction: luminous threads, merger nodes, tributaries, starfield,
// year gates, bloom pipeline, and the particle-burst pool.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { SECTORS, FAILED_COLOR, PENDING_COLOR, START_YEAR, END_YEAR } from './data.js';
import { yearToZ } from './lineage.js';

export const BG = 0x050510;

// ---- variable-radius tube -------------------------------------------------
// Parallel-transport frames along a polyline; one ring of vertices per point.
function buildTube(points, radii, segments = 7) {
  const n = points.length;
  const verts = new Float32Array(n * (segments + 1) * 3);
  const idx = [];
  let normal = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3(), binormal = new THREE.Vector3(), tmp = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (i === 0) tangent.subVectors(points[1], points[0]).normalize();
    else if (i === n - 1) tangent.subVectors(points[i], points[i - 1]).normalize();
    else tangent.subVectors(points[i + 1], points[i - 1]).normalize();
    // parallel transport: keep normal roughly stable
    tmp.crossVectors(tangent, normal);
    if (tmp.lengthSq() < 1e-8) tmp.set(1, 0, 0);
    binormal.copy(tmp).normalize();
    normal.crossVectors(binormal, tangent).normalize();

    const r = Array.isArray(radii) ? radii[i] : radii;
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const vx = p.x + (Math.cos(a) * normal.x + Math.sin(a) * binormal.x) * r;
      const vy = p.y + (Math.cos(a) * normal.y + Math.sin(a) * binormal.y) * r;
      const vz = p.z + (Math.cos(a) * normal.z + Math.sin(a) * binormal.z) * r;
      const o = (i * (segments + 1) + s) * 3;
      verts[o] = vx; verts[o + 1] = vy; verts[o + 2] = vz;
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < segments; s++) {
      const a = i * (segments + 1) + s;
      const b = a + segments + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Soft round sprite for stars & particles (points render as squares otherwise).
function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeLabelEl(text, sectorKey, opts = {}) {
  const el = document.createElement('div');
  el.className = 'thread-label' + (opts.major ? ' major' : '') + (opts.rename ? ' rename' : '');
  el.textContent = text;
  if (sectorKey) el.style.setProperty('--c', SECTORS[sectorKey].ui);
  return el;
}

export function buildScene(renderer, lineage, quality) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 60, 310);

  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 2400);
  camera.position.set(0, 8, -60);

  const root = new THREE.Group();
  scene.add(root);

  // ---- threads ----
  const threadGroup = new THREE.Group();
  for (const t of lineage.threads) {
    const geo = buildTube(t.points, t.radii, quality.tubeSegments);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(t.sector.glow) });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.thread = t;
    threadGroup.add(mesh);
  }
  root.add(threadGroup);

  // ---- tributaries ----
  for (const tr of lineage.tributaries) {
    if (tr.kind === 'pending') {
      const g = new THREE.BufferGeometry().setFromPoints(tr.points);
      const m = new THREE.LineDashedMaterial({ color: new THREE.Color(PENDING_COLOR), dashSize: 2.2, gapSize: 1.6, transparent: true, opacity: 0.85 });
      const line = new THREE.Line(g, m);
      line.computeLineDistances();
      root.add(line);
    } else {
      const color = tr.kind === 'failed' ? FAILED_COLOR : tr.sector.glow;
      const geo = buildTube(tr.points, tr.kind === 'failed' ? 0.2 : 0.26, 5);
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: tr.kind === 'failed' ? 0.85 : 0.95 });
      root.add(new THREE.Mesh(geo, mat));
    }
  }

  // ---- nodes (instanced spheres) ----
  const nodeGeo = new THREE.SphereGeometry(1, 18, 14);
  const nodeMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.96 });
  const nodeMesh = new THREE.InstancedMesh(nodeGeo, nodeMat, lineage.nodes.length);
  const m4 = new THREE.Matrix4();
  const colorOf = (n) => {
    if (n.kind === 'failed') return new THREE.Color(FAILED_COLOR);
    if (n.kind === 'pending') return new THREE.Color(PENDING_COLOR);
    if (n.kind === 'split') return new THREE.Color('#ffffff');
    const c = n.deal.target || n.deal.acquirer;
    const comp = lineage.threads.find((t) => t.company.id === c);
    return new THREE.Color(comp ? comp.sector.glow : '#ffffff');
  };
  lineage.nodes.forEach((n, i) => {
    m4.makeScale(n.radius, n.radius, n.radius).setPosition(n.position);
    nodeMesh.setMatrixAt(i, m4);
    nodeMesh.setColorAt(i, colorOf(n));
  });
  nodeMesh.instanceMatrix.needsUpdate = true;
  if (nodeMesh.instanceColor) nodeMesh.instanceColor.needsUpdate = true;
  nodeMesh.userData.nodes = lineage.nodes;
  root.add(nodeMesh);

  // ---- year gates ----
  const gateMat = new THREE.MeshBasicMaterial({ color: 0x2b2b45, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const gateGeo = new THREE.TorusGeometry(37, 0.09, 6, 72);
  for (const g of lineage.yearGates) {
    const ring = new THREE.Mesh(gateGeo, gateMat);
    ring.position.z = g.z;
    root.add(ring);
    const el = document.createElement('div');
    el.className = 'year-label';
    el.textContent = String(g.year);
    const obj = new CSS2DObject(el);
    obj.position.set(26.5, -26.5, g.z);
    root.add(obj);
  }

  // ---- company labels ----
  const labelObjs = [];
  for (const l of lineage.labels) {
    if (!l.major && quality.tier === 'low') continue;
    const el = makeLabelEl(l.name, l.sector, l);
    const obj = new CSS2DObject(el);
    obj.position.copy(l.position).add(new THREE.Vector3(0, 2.2, 0));
    obj.userData.label = l;
    root.add(obj);
    labelObjs.push(obj);
  }

  // ---- starfield ----
  const starCount = quality.stars;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    // deterministic-ish scatter using low-discrepancy-style math (no RNG needed for stability)
    const t = i / starCount;
    const a = i * 2.39996; // golden angle
    const r = 55 + (i % 97) * 1.9;
    starPos[i * 3] = Math.cos(a) * r;
    starPos[i * 3 + 1] = Math.sin(a * 1.7) * r * 0.7;
    starPos[i * 3 + 2] = t * (yearToZ(END_YEAR) + 500) - 250;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const dotTex = makeDotTexture();
  const starMat = new THREE.PointsMaterial({ color: 0x8a8ab8, size: 1.1, map: dotTex, sizeAttenuation: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  root.add(new THREE.Points(starGeo, starMat));

  // ---- particle-burst pool ----
  const POOL = quality.burstPool;
  const bPos = new Float32Array(POOL * 3);
  const bVel = new Float32Array(POOL * 3);
  const bLife = new Float32Array(POOL); // 0 = dead
  const bColor = new Float32Array(POOL * 3);
  const burstGeo = new THREE.BufferGeometry();
  burstGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  burstGeo.setAttribute('color', new THREE.BufferAttribute(bColor, 3));
  const burstMat = new THREE.PointsMaterial({ size: 1.6, map: dotTex, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const burstPts = new THREE.Points(burstGeo, burstMat);
  burstPts.frustumCulled = false;
  root.add(burstPts);
  let poolCursor = 0;

  function emitBurst(position, color, count = 36) {
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = poolCursor = (poolCursor + 1) % POOL;
      bPos[i * 3] = position.x; bPos[i * 3 + 1] = position.y; bPos[i * 3 + 2] = position.z;
      // spherical spray, deterministic fan
      const a = (k / count) * Math.PI * 2, b = ((k * 7) % count) / count * Math.PI - Math.PI / 2;
      const sp = 6 + (k % 5) * 2.2;
      bVel[i * 3] = Math.cos(a) * Math.cos(b) * sp;
      bVel[i * 3 + 1] = Math.sin(b) * sp;
      bVel[i * 3 + 2] = Math.sin(a) * Math.cos(b) * sp * 0.6;
      bLife[i] = 1.0;
      bColor[i * 3] = c.r; bColor[i * 3 + 1] = c.g; bColor[i * 3 + 2] = c.b;
    }
  }

  function updateBursts(dt) {
    let any = false;
    for (let i = 0; i < POOL; i++) {
      if (bLife[i] <= 0) { bPos[i * 3 + 1] = -10000; continue; }
      any = true;
      bLife[i] -= dt * 0.9;
      const drag = Math.pow(0.14, dt);
      bVel[i * 3] *= drag; bVel[i * 3 + 1] *= drag; bVel[i * 3 + 2] *= drag;
      bPos[i * 3] += bVel[i * 3] * dt;
      bPos[i * 3 + 1] += bVel[i * 3 + 1] * dt;
      bPos[i * 3 + 2] += bVel[i * 3 + 2] * dt;
      const fade = Math.max(0, bLife[i]);
      bColor[i * 3] *= (0.5 + 0.5 * fade) ** (dt * 3);
    }
    burstGeo.attributes.position.needsUpdate = true;
    burstGeo.attributes.color.needsUpdate = true;
    return any;
  }

  // ---- bloom pipeline ----
  let composer = null;
  let bloomPass = null;
  if (quality.bloom) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), quality.bloomStrength, 0.45, 0.3);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }

  return {
    scene, camera, root, nodeMesh, labelObjs, composer, bloomPass,
    emitBurst, updateBursts, colorOf,
    disableBloom() {
      composer = null; this.composer = null;
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (this.composer) this.composer.setSize(w, h);
      if (bloomPass) bloomPass.resolution.set(w, h);
    },
  };
}

export function qualityProfile() {
  const small = Math.min(innerWidth, innerHeight) < 700 || /Mobi|Android/i.test(navigator.userAgent);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return small
    ? { tier: 'low', tubeSegments: 5, stars: 700, burstPool: 240, bloom: true, bloomStrength: 0.5, dpr: Math.min(devicePixelRatio, 1.6), reduced }
    : { tier: 'high', tubeSegments: 8, stars: 1600, burstPool: 600, bloom: true, bloomStrength: 0.58, dpr: Math.min(devicePixelRatio, 2), reduced };
}

export { START_YEAR, END_YEAR };
