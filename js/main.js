// Bootstrap: renderer, scene, scroll rig, UI, render loop, quality guard.

import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildLineage, yearToZ } from './lineage.js';
import { buildScene, qualityProfile, BG } from './scene.js';
import { createScrollRig, observeChapters } from './scroll.js';
import { buildChapters, buildHud, buildDetailCard, bindPicking, showFallback } from './ui.js';

function initWebGL() {
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    if (!renderer.getContext()) throw new Error('no context');
    return renderer;
  } catch {
    return null;
  }
}

const renderer = initWebGL();
if (!renderer) {
  showFallback();
} else {
  start(renderer);
}

function start(renderer) {
  const quality = qualityProfile();
  renderer.setPixelRatio(quality.dpr);
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(BG);
  renderer.domElement.id = 'gl';
  document.body.appendChild(renderer.domElement);

  const css2d = new CSS2DRenderer();
  css2d.setSize(innerWidth, innerHeight);
  css2d.domElement.id = 'labels';
  css2d.domElement.style.pointerEvents = 'none';
  document.body.appendChild(css2d.domElement);

  buildChapters();
  observeChapters();
  const hud = buildHud();
  const detail = buildDetailCard();

  const lineage = buildLineage();
  const kit = buildScene(renderer, lineage, quality);
  const rig = createScrollRig(quality.reduced);
  bindPicking(renderer, kit.camera, kit.nodeMesh, detail);

  // ---- explore mode ----
  let controls = null;
  let savedScroll = 0;
  function setExplore(on) {
    rig.state.exploring = on;
    document.body.classList.toggle('exploring', on);
    if (on) {
      savedScroll = scrollY;
      if (!controls) {
        controls = new OrbitControls(kit.camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.maxDistance = 900;
      }
      controls.target.set(0, 0, yearToZ(2005));
      controls.enabled = true;
      exitBtn.style.display = 'block';
    } else {
      if (controls) controls.enabled = false;
      exitBtn.style.display = 'none';
      scrollTo(0, savedScroll);
    }
  }
  const exitBtn = document.createElement('button');
  exitBtn.id = 'exit-explore';
  exitBtn.className = 'btn';
  exitBtn.textContent = '← Back to the story';
  exitBtn.style.display = 'none';
  exitBtn.addEventListener('click', () => setExplore(false));
  document.body.appendChild(exitBtn);
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'explore-btn') setExplore(true);
  });

  // ---- burst triggers: fire when the camera crosses a deal's year ----
  let prevYear = 1983;

  // ---- label fading ----
  const camPos = new THREE.Vector3();
  function updateLabels(frame) {
    if (frame % 3 !== 0) return;
    kit.camera.getWorldPosition(camPos);
    for (const obj of kit.labelObjs) {
      const d = obj.position.distanceTo(camPos);
      const behind = obj.position.z < camPos.z - 24;
      const major = obj.userData.label.major;
      const maxD = major ? 175 : 105;
      const o = behind || d > maxD ? 0 : Math.min(1, (maxD - d) / 60);
      obj.element.style.opacity = o.toFixed(2);
      obj.element.style.visibility = o <= 0.01 ? 'hidden' : 'visible';
    }
  }

  // ---- FPS guard: keep the bloom look, trade resolution & strength ----
  let frames = 0, fpsAccum = 0, degradeStep = 0;
  function fpsGuard(dt) {
    if (degradeStep >= 2) return;
    frames++; fpsAccum += dt;
    if (fpsAccum >= 5) {
      const fps = frames / fpsAccum;
      if (fps < 22) {
        degradeStep++;
        if (degradeStep === 1) {
          renderer.setPixelRatio(Math.min(quality.dpr, 1.2));
          if (kit.bloomPass) kit.bloomPass.strength = quality.bloomStrength * 0.75;
        } else {
          renderer.setPixelRatio(1);
          kit.disableBloom(); // last resort only
        }
      }
      frames = 0; fpsAccum = 0;
    }
  }

  // ---- resize ----
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    css2d.setSize(innerWidth, innerHeight);
    kit.resize(innerWidth, innerHeight);
  });

  // ---- loop ----
  const clock = new THREE.Clock();
  let frame = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    frame++;

    rig.update(kit.camera, dt);
    if (controls && controls.enabled) controls.update();

    const year = rig.currentYear(kit.camera);
    hud.set(year, rig.state.smoothed);

    // epilogue (and explore mode): push the fog out so the whole river shows
    const t = rig.state.smoothed;
    const wide = rig.state.exploring ? 1 : Math.min(1, Math.max(0, (t - 0.845) / 0.13));
    kit.scene.fog.near = 60 + wide * 500;
    kit.scene.fog.far = 310 + wide * 1750;

    // bursts on year crossings (forward only, skipped for reduced motion)
    if (!quality.reduced && year > prevYear) {
      for (const n of kit.nodeMesh.userData.nodes) {
        const y = n.deal.year;
        if (y > prevYear && y <= year && Math.abs(n.position.z - (kit.camera.position.z + 46)) < 240) {
          kit.emitBurst(n.position, kit.colorOf(n), n.kind === 'split' ? 90 : 34);
        }
      }
    }
    prevYear = year;

    kit.updateBursts(dt);
    updateLabels(frame);
    fpsGuard(dt);

    if (kit.composer) kit.composer.render();
    else renderer.render(kit.scene, kit.camera);
    css2d.render(kit.scene, kit.camera);

    if (frame === 2) document.body.classList.add('ready');
  });

  // minimal handle for automated tests
  window.__cons = { kit, rig, THREE };
}
