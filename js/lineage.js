// Lineage engine: turns companies + deals into positioned 3D thread paths.
// Time runs along +z. Each sector owns an angular wedge around the axis;
// each company holds a "home" polar slot inside its wedge. Mergers ease the
// target's path into the acquirer's position, ending in a node.

import * as THREE from 'three';
import { SECTORS, COMPANIES, DEALS, START_YEAR, END_YEAR } from './data.js';

export const UNITS_PER_YEAR = 24;
export const yearToZ = (y) => (y - START_YEAR) * UNITS_PER_YEAR;
export const zToYear = (z) => START_YEAR + z / UNITS_PER_YEAR;

const DEG = Math.PI / 180;
const byId = new Map(COMPANIES.map((c) => [c.id, c]));

// Deterministic per-company hash for wobble phase (stable layout, no RNG).
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

// ---- home slots -----------------------------------------------------------
// Companies in each sector get evenly spaced angles inside the wedge, with
// radius alternating over three shells so neighbors don't overlap.
const homes = new Map();
{
  const bySector = {};
  for (const c of COMPANIES) (bySector[c.sector] ||= []).push(c);
  for (const [key, list] of Object.entries(bySector)) {
    const s = SECTORS[key];
    list.forEach((c, i) => {
      const t = list.length === 1 ? 0.5 : i / (list.length - 1);
      const angle = (s.angle - s.spread / 2 + s.spread * t) * DEG;
      const shell = 15 + (i % 3) * 6 + hash(c.id) * 2.5;
      homes.set(c.id, { angle, radius: shell });
    });
  }
  homes.set('bellsystem', { angle: SECTORS.wireline.angle * DEG, radius: 0 }); // the monopoly sits on the axis
}

// ---- event index ----------------------------------------------------------
const endOf = new Map();      // companyId -> {year, deal} thread termination
const absorptionsOf = new Map(); // companyId -> [{year, valueB}] (thickens thread)
for (const d of DEALS) {
  if (d.type === 'merge') {
    endOf.set(d.target, { year: d.year, deal: d });
    (absorptionsOf.get(d.acquirer) || absorptionsOf.set(d.acquirer, []).get(d.acquirer)).push(d);
  }
  if (d.type === 'split' && d.target) endOf.set(d.target, { year: d.year, deal: d });
}

function companyEnd(id) {
  const e = endOf.get(id);
  return e ? e.year : END_YEAR;
}

// ---- position field -------------------------------------------------------
// pos(id, year): where company id's thread is at a given year, in xy.
// Handles spawn-in easing (from parent) and merge-out easing (to acquirer).
const EASE_IN = 1.5;   // years to drift out from parent after a spawn
const EASE_OUT = 1.7;  // years to converge into the acquirer before a merge
const smooth = (t) => t * t * (3 - 2 * t); // smoothstep

function homeXY(id, year) {
  const h = homes.get(id);
  const p = hash(id) * Math.PI * 2;
  const wob = h.radius === 0 ? 0 : 1.1;
  const x = Math.cos(h.angle) * h.radius + Math.sin(year * 0.55 + p * 6) * wob;
  const y = Math.sin(h.angle) * h.radius + Math.cos(year * 0.42 + p * 4) * wob;
  return new THREE.Vector2(x, y);
}

export function pos(id, year, depth = 0) {
  const c = byId.get(id);
  const base = homeXY(id, year);
  if (!c || depth > 4) return base;

  // spawn-in: emerge from the parent's position
  if (c.spawnedFrom && year < c.born + EASE_IN) {
    const from = pos(c.spawnedFrom, c.born, depth + 1);
    const t = smooth(Math.max(0, (year - c.born) / EASE_IN));
    return from.clone().lerp(base, t);
  }
  // merge-out: converge into the acquirer
  const end = endOf.get(id);
  if (end && end.deal.type === 'merge' && year > end.year - EASE_OUT) {
    const to = pos(end.deal.acquirer, end.year, depth + 1);
    const t = smooth(Math.min(1, (year - (end.year - EASE_OUT)) / EASE_OUT));
    return base.clone().lerp(to, t);
  }
  return base;
}

// ---- thread radii ---------------------------------------------------------
export function radiusAt(id, year) {
  const c = byId.get(id);
  let r = 0.34 + (c.weight || 1) * 0.17;
  const abs = absorptionsOf.get(id) || [];
  for (const d of abs) if (d.year <= year) r += 0.1 + Math.log10(1 + (d.valueB || 1)) * 0.13;
  return r;
}

// ---- public build ---------------------------------------------------------
const STEP = 0.2; // years per sample

export function buildLineage() {
  const threads = [];
  const tributaries = [];
  const nodes = [];
  const labels = [];

  for (const c of COMPANIES) {
    const start = Math.max(c.born, START_YEAR);
    const end = companyEnd(c.id);
    const points = [];
    const radii = [];
    for (let y = start; y <= end + 1e-6; y += STEP) {
      const yr = Math.min(y, end);
      const p = pos(c.id, yr);
      points.push(new THREE.Vector3(p.x, p.y, yearToZ(yr)));
      radii.push(radiusAt(c.id, yr));
    }
    // ensure the exact endpoint is present
    const pEnd = pos(c.id, end);
    const last = points[points.length - 1];
    if (Math.abs(last.z - yearToZ(end)) > 0.01) {
      points.push(new THREE.Vector3(pEnd.x, pEnd.y, yearToZ(end)));
      radii.push(radiusAt(c.id, end));
    }
    const sector = SECTORS[c.sector];
    threads.push({ company: c, points, radii, sector, active: !endOf.has(c.id) });

    // labels: birth + renames (staggered along z by a per-company hash so
    // companies born the same year don't stack their labels)
    const labelYear = Math.min(start + EASE_IN + 0.4 + hash(c.id) * 3.2, end);
    const lp = pos(c.id, labelYear);
    labels.push({ year: start, name: c.name, companyId: c.id, sector: c.sector, major: (c.weight || 1) >= 2,
      position: new THREE.Vector3(lp.x, lp.y, yearToZ(labelYear)) });
    for (const r of c.renames || []) {
      if (r.year > end) continue;
      const rp = pos(c.id, r.year + 0.4);
      labels.push({ year: r.year, name: r.name, companyId: c.id, sector: c.sector, major: true, rename: true,
        position: new THREE.Vector3(rp.x, rp.y, yearToZ(Math.min(r.year + 0.4, end))) });
    }
  }

  for (const d of DEALS) {
    if (d.hideNode) continue;
    const kind = d.type;
    let position;

    if (kind === 'merge') {
      const p = pos(d.acquirer, d.year);
      position = new THREE.Vector3(p.x, p.y, yearToZ(d.year));
    } else if (kind === 'split') {
      const src = d.target || d.spawn;
      const p = d.target ? pos(d.target, d.year) : pos(byId.get(d.spawn).spawnedFrom, d.year);
      position = new THREE.Vector3(p.x, p.y, yearToZ(d.year));
      void src;
    } else if (kind === 'asset') {
      // tributary: seller -> acquirer
      const from = pos(d.target, d.year - 1.2);
      const to = pos(d.acquirer, d.year);
      const pts = [];
      const N = 14;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const yr = d.year - 1.2 + 1.2 * t;
        const xy = from.clone().lerp(to, smooth(t));
        pts.push(new THREE.Vector3(xy.x, xy.y, yearToZ(yr)));
      }
      tributaries.push({ deal: d, points: pts, sector: SECTORS[byId.get(d.target).sector], kind: 'asset' });
      position = pts[pts.length - 1];
    } else if (kind === 'failed') {
      // approach then snap back
      const from = pos(d.target, d.year - 1.1);
      const to = pos(d.acquirer, d.year);
      const back = pos(d.target, d.year + 0.9);
      const pts = [];
      const N = 20;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const yr = d.year - 1.1 + 2.0 * t;
        const reach = t < 0.55 ? smooth(t / 0.55) * 0.72 : smooth(1 - (t - 0.55) / 0.45) * 0.72;
        const basePt = t < 0.55 ? from : back;
        const xy = basePt.clone().lerp(to, reach);
        pts.push(new THREE.Vector3(xy.x, xy.y, yearToZ(yr)));
      }
      tributaries.push({ deal: d, points: pts, kind: 'failed' });
      const apex = from.clone().lerp(to, 0.72);
      position = new THREE.Vector3(apex.x, apex.y, yearToZ(d.year));
    } else if (kind === 'pending') {
      const from = pos(d.target, END_YEAR);
      const to = pos(d.acquirer, END_YEAR);
      const pts = [];
      const N = 12;
      const z0 = yearToZ(d.year - 1.0), z1 = yearToZ(Math.min(d.year + 0.6, END_YEAR + 0.4));
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const xy = from.clone().lerp(to, smooth(t));
        pts.push(new THREE.Vector3(xy.x, xy.y, z0 + (z1 - z0) * t));
      }
      tributaries.push({ deal: d, points: pts, kind: 'pending' });
      position = pts[Math.floor(N / 2)];
    } else { // external
      const p = pos(d.target, d.year);
      position = new THREE.Vector3(p.x, p.y, yearToZ(d.year));
    }

    const v = d.valueB || 0;
    nodes.push({ deal: d, position, kind,
      radius: (kind === 'split' ? 2.6 : 0.55) + Math.log10(1 + v) * 0.85 });
  }

  // year gates every 5 years
  const yearGates = [];
  for (let y = 1985; y <= 2025; y += 5) yearGates.push({ year: y, z: yearToZ(y) });

  return { threads, tributaries, nodes, labels, yearGates };
}
