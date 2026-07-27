// DOM overlays: HUD (year + progress), legend, deal detail card, explore
// toggle, chapter injection, epilogue stats, and the no-WebGL fallback.

import * as THREE from 'three';
import { SECTORS, DEALS, COMPANIES, CHAPTERS, META, FAILED_COLOR, PENDING_COLOR } from './data.js';

const $ = (sel) => document.querySelector(sel);

export function fmtValue(v) {
  if (v == null) return 'undisclosed';
  if (v >= 1) return '$' + (v % 1 === 0 ? v : v.toFixed(1)) + 'B';
  return '$' + Math.round(v * 1000) + 'M';
}

export function buildChapters() {
  const track = $('#track');
  // Spacing is derived so that chapter i's text is on screen exactly when the
  // camera reaches keyframe i (progress i/(n-1)): maxScroll = (n-1)*S, so each
  // keyframe lands at a scroll offset of i*S, and text sits ~30vh below that.
  const S = 200; // vh between chapter keyframes
  const n = CHAPTERS.length;
  track.style.height = (n - 1) * S + 100 + 'vh';
  CHAPTERS.forEach((ch, i) => {
    const el = document.createElement('section');
    el.className = 'chapter' + (i % 2 ? ' right' : '') + (ch.id === 'prologue' ? ' prologue' : '') + (ch.id === 'epilogue' ? ' epilogue' : '');
    el.style.top = i * S + (ch.id === 'prologue' ? 12 : 28) + 'vh';
    el.innerHTML = `
      <div class="kicker">${ch.kicker}</div>
      <h2>${ch.title}</h2>
      <p>${ch.body}</p>
      ${ch.id === 'prologue' ? '<div class="scroll-hint">Scroll<span class="arrow">↓</span></div>' : ''}
      ${ch.id === 'epilogue' ? epilogueExtras() : ''}`;
    track.appendChild(el);
  });
}

function epilogueExtras() {
  const total = DEALS.reduce((s, d) => s + (d.valueB || 0), 0);
  const failed = DEALS.filter((d) => d.type === 'failed');
  return `
    <div class="stats">
      <div class="stat"><span class="v">$${(total / 1000).toFixed(2)}T</span><span class="k">in announced deal value</span></div>
      <div class="stat"><span class="v">${COMPANIES.length}</span><span class="k">companies traced</span></div>
      <div class="stat"><span class="v">${DEALS.length}</span><span class="k">deals, spin-offs & breakups</span></div>
      <div class="stat"><span class="v">${failed.length}</span><span class="k">blocked or abandoned</span></div>
    </div>
    <div class="epilogue-actions">
      <button id="explore-btn" class="btn">✦ Explore the structure freely</button>
    </div>
    <p class="data-note">${META.dataNote}</p>`;
}

export function buildHud() {
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `
    <div id="hud-year">1983</div>
    <div id="hud-bar"><div id="hud-fill"></div></div>`;
  document.body.appendChild(hud);

  const legend = document.createElement('div');
  legend.id = 'legend';
  legend.innerHTML =
    Object.values(SECTORS).map((s) => `<span class="chip"><i style="background:${s.ui}"></i>${s.name}</span>`).join('') +
    `<span class="chip"><i style="background:${FAILED_COLOR}"></i>Blocked / failed</span>` +
    `<span class="chip"><i style="border:1px dashed ${PENDING_COLOR};background:transparent"></i>Pending</span>`;
  document.body.appendChild(legend);

  const yearEl = $('#hud-year'), fillEl = $('#hud-fill');
  return {
    set(year, progress) {
      yearEl.textContent = year >= 2026.5 ? 'Today' : String(Math.floor(year));
      fillEl.style.width = (progress * 100).toFixed(2) + '%';
    },
  };
}

// ---- deal detail card -----------------------------------------------------
export function buildDetailCard() {
  const card = document.createElement('aside');
  card.id = 'deal-card';
  card.innerHTML = '<button id="deal-close" aria-label="Close">×</button><div id="deal-body"></div>';
  document.body.appendChild(card);
  $('#deal-close').addEventListener('click', () => card.classList.remove('open'));

  const nameOf = (id) => {
    const c = COMPANIES.find((x) => x.id === id);
    return c ? c.name : id || '';
  };

  return {
    show(node) {
      const d = node.deal;
      const kindLabel = { merge: 'Acquisition', asset: 'Asset sale', external: 'Outside buyer', failed: 'Blocked / abandoned', pending: 'Pending', split: 'Breakup / spin-off' }[node.kind];
      const parties =
        node.kind === 'external' ? `${d.buyer ?? ''} → ${nameOf(d.target)}` :
        node.kind === 'split' ? nameOf(d.target || d.spawn) :
        `${nameOf(d.acquirer)} ← ${nameOf(d.target)}`;
      $('#deal-body').innerHTML = `
        <div class="deal-kind ${node.kind}">${kindLabel} · ${Math.floor(d.year)}</div>
        <h3>${d.title}</h3>
        <div class="deal-parties">${parties}</div>
        <div class="deal-value">${fmtValue(d.valueB)}</div>
        ${d.note ? `<p>${d.note}</p>` : ''}`;
      card.classList.add('open');
    },
    hide() { card.classList.remove('open'); },
  };
}

// ---- node picking ---------------------------------------------------------
export function bindPicking(renderer, camera, nodeMesh, detail) {
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let downAt = null;

  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
    downAt = null;
    if (moved > 6) return; // it was a drag
    ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    ray.params.Points = { threshold: 2 };
    const hits = ray.intersectObject(nodeMesh, false);
    if (hits.length && hits[0].instanceId != null) {
      detail.show(nodeMesh.userData.nodes[hits[0].instanceId]);
    } else {
      detail.hide();
    }
  });

  // hover cursor
  let hoverRaf = 0;
  canvas.addEventListener('pointermove', (e) => {
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      ray.setFromCamera(ptr, camera);
      const hits = ray.intersectObject(nodeMesh, false);
      canvas.style.cursor = hits.length ? 'pointer' : '';
    });
  });
}

// ---- no-WebGL fallback ----------------------------------------------------
export function showFallback() {
  document.body.classList.add('no-webgl');
  const wrap = document.createElement('main');
  wrap.id = 'fallback';
  const rows = [...DEALS].sort((a, b) => a.year - b.year).map((d) => {
    const badge = d.type === 'failed' ? '<em class="f">blocked</em>' : d.type === 'pending' ? '<em class="p">pending</em>' : '';
    return `<li><span class="y">${Math.floor(d.year)}</span><span class="t">${d.title} ${badge}</span><span class="v">${fmtValue(d.valueB)}</span></li>`;
  }).join('');
  wrap.innerHTML = `
    <h1>${META.title}</h1>
    <p class="sub">${META.subtitle}</p>
    <p class="note">This experience needs WebGL for its 3D visualization — your browser doesn't support it. Here is the full deal chronology instead:</p>
    <ul class="deal-list">${rows}</ul>
    <p class="note">${META.dataNote}</p>`;
  document.body.appendChild(wrap);
}
