// Scroll → camera flight. Chapter keyframes form a smooth spiral path down the
// timeline; scroll progress drives position along it with exponential damping.

import * as THREE from 'three';
import { CHAPTERS, END_YEAR } from './data.js';
import { yearToZ, zToYear } from './lineage.js';

const DEG = Math.PI / 180;

// Camera keyframes: one per chapter, spiraling around the cable of threads.
function buildKeyframes() {
  const frames = [];
  CHAPTERS.forEach((ch, i) => {
    if (ch.id === 'prologue') {
      frames.push({
        pos: new THREE.Vector3(27, 12, yearToZ(1983) - 42),
        look: new THREE.Vector3(0, 2, yearToZ(1987)),
      });
      return;
    }
    if (ch.id === 'epilogue') {
      // side-on pull-back: the whole 43-year river in one frame (fog is
      // pushed out for this view in the render loop)
      frames.push({
        pos: new THREE.Vector3(430, 215, yearToZ(2007)),
        look: new THREE.Vector3(0, 0, yearToZ(2006)),
      });
      return;
    }
    // spiral around the cable, staying well OUTSIDE the thread bundle
    // (threads live at radius ≤ ~30) and above its midplane
    const angle = (-30 + i * 52) * DEG;
    const radius = 96 + (i % 2) * 14;
    const zMid = yearToZ(ch.yearFrom) - 30;
    frames.push({
      pos: new THREE.Vector3(Math.cos(angle) * radius, 30 + Math.sin(angle) * radius * 0.32, zMid),
      look: new THREE.Vector3(0, 0, zMid + 120),
    });
  });
  return frames;
}

export function createScrollRig(reduced) {
  const frames = buildKeyframes();
  const posCurve = new THREE.CatmullRomCurve3(frames.map((f) => f.pos), false, 'centripetal', 0.4);
  const lookCurve = new THREE.CatmullRomCurve3(frames.map((f) => f.look), false, 'centripetal', 0.4);

  const state = {
    progress: 0,          // raw scroll progress 0..1
    smoothed: 0,          // damped
    pos: new THREE.Vector3(),
    look: new THREE.Vector3(),
    exploring: false,
  };

  function readScroll() {
    const doc = document.documentElement;
    const max = doc.scrollHeight - innerHeight;
    state.progress = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  }
  addEventListener('scroll', readScroll, { passive: true });
  readScroll();

  function update(camera, dt) {
    if (state.exploring) return;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 3.2);
    state.smoothed += (state.progress - state.smoothed) * k;
    const t = state.smoothed;
    posCurve.getPoint(t, state.pos);
    lookCurve.getPoint(t, state.look);
    camera.position.copy(state.pos);
    camera.lookAt(state.look);
  }

  // The "narrative year" — from progress through the chapters, not camera z
  // (the epilogue camera leaves the axis, so z stops meaning "now").
  function currentYear(camera) {
    if (state.exploring) return Math.max(1983, Math.min(2026.6, zToYear(camera.position.z + 46)));
    // keyframe i ≈ the start of chapter i, so interpolate yearFrom → yearFrom
    const t = Math.max(0, Math.min(1, state.smoothed)) * (CHAPTERS.length - 1);
    const i = Math.min(CHAPTERS.length - 2, Math.floor(t));
    const f = t - i;
    return CHAPTERS[i].yearFrom + (CHAPTERS[i + 1].yearFrom - CHAPTERS[i].yearFrom) * f;
  }

  return { state, update, currentYear, frames };
}

// Chapter text reveal via IntersectionObserver.
export function observeChapters() {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle('visible', e.isIntersecting)),
    { threshold: 0.25 }
  );
  document.querySelectorAll('.chapter').forEach((el) => io.observe(el));
}
