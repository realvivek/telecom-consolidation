// Two supporting charts: how many companies were still independent each year,
// and how much deal value each surviving trunk pulled in.

import { CHAPTERS, START_YEAR, END_YEAR, independentSeries, FAMILIES, STATS, money, yr } from './model.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// The consolidation curve
// ---------------------------------------------------------------------------
const CURVE_PAD = { top: 62, right: 128, bottom: 34, left: 40 };

export function renderCurve(width) {
  const w = Math.max(width, 560);
  const h = 330;
  const plotW = w - CURVE_PAD.left - CURVE_PAD.right;
  const plotH = h - CURVE_PAD.top - CURVE_PAD.bottom;
  const yMax = 40;
  const X = (year) => CURVE_PAD.left + ((year - START_YEAR) / (END_YEAR - START_YEAR)) * plotW;
  const Y = (n) => CURVE_PAD.top + plotH - (n / yMax) * plotH;

  const pts = independentSeries;
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${r1(X(p.year))} ${r1(Y(p.count))}`).join('');
  const area = `${line}L${r1(X(pts[pts.length - 1].year))} ${r1(Y(0))}L${r1(X(pts[0].year))} ${r1(Y(0))}Z`;

  const gridY = [0, 10, 20, 30, 40].map((n) =>
    `<line class="ch-grid" x1="${CURVE_PAD.left}" y1="${r1(Y(n))}" x2="${r1(CURVE_PAD.left + plotW)}" y2="${r1(Y(n))}"/>` +
    `<text class="ch-tick" x="${CURVE_PAD.left - 10}" y="${r1(Y(n) + 4)}" text-anchor="end">${n}</text>`
  ).join('');

  const gridX = [];
  for (let year = 1985; year <= 2025; year += 5) {
    gridX.push(`<text class="ch-tick" x="${r1(X(year))}" y="${r1(h - 12)}" text-anchor="middle">${year}</text>`);
  }

  // Era boundaries as context behind the curve. Labels alternate between two
  // rows so neighbouring eras never overprint each other.
  const eras = CHAPTERS.filter((c) => c.id !== 'epilogue' && c.id !== 'prologue').map((c, i) => {
    const labelY = i % 2 ? CURVE_PAD.top - 10 : CURVE_PAD.top - 30;
    return `<line class="ch-era" x1="${r1(X(c.yearFrom))}" y1="${r1(labelY - 10)}" x2="${r1(X(c.yearFrom))}" y2="${r1(CURVE_PAD.top + plotH)}"/>` +
      `<text class="ch-era-label" x="${r1(X(c.yearFrom) + 5)}" y="${r1(labelY)}">${esc(c.title.replace(/\.$/, ''))}</text>`;
  }).join('');

  const peak = STATS.peakIndependent;
  const last = pts[pts.length - 1];

  return `<svg class="ch-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img"
    aria-label="Line chart: companies still independent each year, rising from 19 in 1983 to a peak of ${peak.count} in ${yr(peak.year)}, then falling to ${last.count} in 2026.">
    <g class="ch-eras">${eras}</g>
    ${gridY}
    <path class="ch-area" d="${area}"/>
    <path class="ch-line" d="${line}"/>
    <circle class="ch-dot" cx="${r1(X(peak.year))}" cy="${r1(Y(peak.count))}" r="4.5"/>
    <text class="ch-annot" x="${r1(X(peak.year) + 11)}" y="${r1(Y(peak.count) - 6)}">peak: ${peak.count} in ${yr(peak.year)}</text>
    <circle class="ch-dot" cx="${r1(X(last.year))}" cy="${r1(Y(last.count))}" r="4.5"/>
    <text class="ch-annot ch-annot--end" x="${r1(X(last.year) + 12)}" y="${r1(Y(last.count) + 4)}">${last.count} today</text>
    <g class="ch-xaxis">${gridX.join('')}</g>
    <rect class="ch-hit" x="${CURVE_PAD.left}" y="${CURVE_PAD.top}" width="${r1(plotW)}" height="${r1(plotH)}"/>
    <g class="ch-cursor" style="display:none">
      <line class="ch-cursor-line" y1="${CURVE_PAD.top}" y2="${r1(CURVE_PAD.top + plotH)}"/>
      <circle class="ch-cursor-dot" r="5"/>
    </g>
  </svg>`;
}

/** Nearest series point for a pointer x, in svg user units. */
export function curveProbe(x, width) {
  const w = Math.max(width, 560);
  const plotW = w - CURVE_PAD.left - CURVE_PAD.right;
  const plotH = 330 - CURVE_PAD.top - CURVE_PAD.bottom;
  const t = (x - CURVE_PAD.left) / plotW;
  if (t < 0 || t > 1) return null;
  const year = START_YEAR + t * (END_YEAR - START_YEAR);
  let best = independentSeries[0];
  for (const p of independentSeries) if (Math.abs(p.year - year) < Math.abs(best.year - year)) best = p;
  return {
    point: best,
    x: CURVE_PAD.left + ((best.year - START_YEAR) / (END_YEAR - START_YEAR)) * plotW,
    y: CURVE_PAD.top + plotH - (best.count / 40) * plotH,
  };
}

// ---------------------------------------------------------------------------
// Deal value pulled in by each surviving trunk
// ---------------------------------------------------------------------------
export function renderTrunkBars() {
  const fams = FAMILIES.filter((f) => !f.standalone && f.valueB > 0).sort((a, b) => b.valueB - a.valueB);
  const max = fams[0].valueB;
  return `<ol class="bars">` + fams.map((f) => `
    <li class="bar-row">
      <span class="bar-label">${esc(f.name)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${r1((f.valueB / max) * 100)}%"></span></span>
      <span class="bar-value">${money(f.valueB)}</span>
      <span class="bar-sub">${f.absorbed} absorbed</span>
    </li>`).join('') + `</ol>`;
}
