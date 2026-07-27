// The lineage chart: one horizontal thread per company, time running left to
// right, threads that were bought sweeping into the thread that bought them.
// Every thread carries its name in a fixed left gutter, so nothing depends on
// colour or on hunting for a label.

import {
  COMPANIES, DEALS, SECTORS, START_YEAR, END_YEAR,
  byId, shortOf, nameAt, finalName,
  mergedInto, pendingInto, assetsOutOf, eventsOn, spawnsOf,
  endYear, isAlive, widthAt, absorptionYears,
  FAMILIES, familyOf, money, yr, BREAKUP_YEAR,
} from './model.js';

// ---- geometry -------------------------------------------------------------
export const ROW = 24;
const GROUP_HEAD = 42;
const GROUP_GAP = 14;
const TOP_PAD = 10;
const BOTTOM_PAD = 24;
const GUTTER = 166;
const RIGHT_PAD = 132;
/** Past this vertical distance a connector would cross half the chart, so it
 *  becomes a labelled stub instead of a line you have to trace. */
const STUB_ABOVE = 210;
export const MIN_WIDTH = 980;

const SPAN = END_YEAR - START_YEAR;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n) => Math.round(n * 10) / 10;

let layout = null;

/** Assign every company a row, grouped by the trunk it flowed into. */
function buildLayout(width) {
  const plotW = width - GUTTER - RIGHT_PAD;
  const X = (year) => GUTTER + ((year - START_YEAR) / SPAN) * plotW;

  const rows = new Map();  // companyId -> y
  const groups = [];
  let y = TOP_PAD;

  // The Bell System sits above everything — it is where the story starts.
  groups.push({ id: '__bell', name: 'Where it starts', meta: 'One regulated monopoly', headY: y, lanes: ['bellsystem'] });
  y += GROUP_HEAD;
  rows.set('bellsystem', y + ROW / 2);
  y += ROW + GROUP_GAP;

  for (const fam of FAMILIES) {
    const meta = fam.standalone
      ? `${fam.lanes.length} companies · neither absorbed a tracked company nor were absorbed by one`
      : `${fam.absorbed} ${fam.absorbed === 1 ? 'company' : 'companies'} flowed in · ${money(fam.valueB)} of deals`;
    groups.push({ id: fam.id, name: fam.standalone ? fam.name : `${fam.name} — ${fam.lanes.length} threads`, meta, headY: y, lanes: fam.lanes, family: fam });
    y += GROUP_HEAD;
    for (const id of fam.lanes) { rows.set(id, y + ROW / 2); y += ROW; }
    y += GROUP_GAP;
  }

  layout = { width, plotW, X, rows, groups, height: y + BOTTOM_PAD };
  return layout;
}

export const getLayout = () => layout;

// ---- path helpers ---------------------------------------------------------

/** Smooth S-curve leaving horizontally and arriving horizontally. */
function flow(x0, y0, x1, y1) {
  const dx = x1 - x0;
  return `M${r1(x0)} ${r1(y0)}C${r1(x0 + dx * 0.5)} ${r1(y0)},${r1(x1 - dx * 0.5)} ${r1(y1)},${r1(x1)} ${r1(y1)}`;
}

const reach = (dy) => Math.min(92, Math.max(22, Math.abs(dy) * 0.3));
const dotR = (v) => Math.min(6.5, 2.3 + Math.log10(1 + (v || 0)) * 1.5);

// ---- render ---------------------------------------------------------------

export function renderLineage(container, width) {
  const L = buildLayout(Math.max(width, MIN_WIDTH));
  const { X, rows, groups, plotW } = L;
  const xStart = X(START_YEAR);
  const xEnd = X(END_YEAR);

  const grid = [];
  for (let year = 1985; year <= 2025; year += 5) {
    grid.push(`<line class="ln-grid" x1="${r1(X(year))}" y1="0" x2="${r1(X(year))}" y2="${L.height}"/>`);
  }

  const heads = [];
  const lanes = [];

  for (const g of groups) {
    heads.push(
      `<g class="ln-head" id="fam-${esc(g.id)}">` +
      `<text class="ln-head-name" x="0" y="${r1(g.headY + 17)}">${esc(g.name)}</text>` +
      `<text class="ln-head-meta" x="0" y="${r1(g.headY + 32)}">${esc(g.meta)}</text>` +
      `<line class="ln-head-rule" x1="0" y1="${r1(g.headY + 38)}" x2="${r1(L.width)}" y2="${r1(g.headY + 38)}"/>` +
      `</g>`
    );

    for (const id of g.lanes) lanes.push(lane(id, L));
  }

  return `<svg class="ln-svg" viewBox="0 0 ${L.width} ${L.height}" width="${L.width}" height="${L.height}" role="img"
     aria-label="Lineage of ${COMPANIES.length} US telecom companies from 1983 to 2026, grouped by the company each one ended up inside.">
  <g class="ln-grid-layer">${grid.join('')}
    <line class="ln-axis-rule" x1="${r1(xStart)}" y1="0" x2="${r1(xStart)}" y2="${L.height}"/>
  </g>
  <line class="ln-cursor" x1="0" y1="0" x2="0" y2="${L.height}" style="display:none"/>
  <g class="ln-heads">${heads.join('')}</g>
  <g class="ln-lanes">${lanes.join('')}</g>
</svg>`;
}

function lane(id, L) {
  const { X, rows } = L;
  const c = byId.get(id);
  const y = rows.get(id);
  const alive = isAlive(id);
  const out = mergedInto.get(id);
  const start = Math.max(c.born, START_YEAR);
  const stop = endYear(id);

  const parts = [];

  // --- where the thread stops drawing (a merge sweeps out of it early) ---
  let lineEnd = X(stop);
  let sweep = null;
  if (out) {
    const yTo = rows.get(out.acquirer);
    if (yTo != null) {
      const d = reach(yTo - y);
      lineEnd = Math.max(X(start) + 4, X(stop) - d);
      sweep = { deal: out, x0: lineEnd, x1: X(stop), yTo };
    }
  }

  // --- the thread itself, thickening at every absorption ---
  const marks = absorptionYears(id).filter((a) => a > start && a < stop);
  const bps = [start, ...marks, stop];
  for (let i = 0; i < bps.length - 1; i++) {
    const x1 = i === bps.length - 2 ? lineEnd : X(bps[i + 1]);
    const x0 = Math.min(X(bps[i]), x1);
    parts.push(`<line class="ln-thread" x1="${r1(x0)}" y1="${r1(y)}" x2="${r1(x1)}" y2="${r1(y)}" stroke-width="${widthAt(id, bps[i] + 1e-6)}"/>`);
  }

  // --- origin ---
  if (c.spawnedFrom) {
    const yFrom = L.rows.get(c.spawnedFrom);
    const near = yFrom != null && Math.abs(yFrom - y) < 260;
    if (near) {
      parts.push(`<path class="ln-spawn" d="${flow(X(c.born) - reach(y - yFrom) * 0.7, yFrom, X(c.born), y)}"/>`);
    } else {
      parts.push(`<path class="ln-spawn ln-spawn--stub" d="${flow(X(c.born) - 26, y - 16, X(c.born), y)}"/>`);
    }
    parts.push(`<path class="ln-origin" d="M${r1(X(c.born))} ${r1(y - 3.6)}l3.6 3.6-3.6 3.6-3.6-3.6z"/>`);
  } else if (c.born > START_YEAR) {
    parts.push(`<circle class="ln-origin-dot" cx="${r1(X(c.born))}" cy="${r1(y)}" r="2.6"/>`);
  }

  // --- renames along the thread ---
  for (const rn of c.renames || []) {
    if (rn.year >= stop) continue;
    parts.push(`<line class="ln-tick" x1="${r1(X(rn.year))}" y1="${r1(y - 5)}" x2="${r1(X(rn.year))}" y2="${r1(y + 5)}"/>`);
    parts.push(`<text class="ln-rename" x="${r1(X(rn.year) + 5)}" y="${r1(y - 6)}">→ ${esc(rn.name)}</text>`);
  }

  // --- partial asset sales leaving this thread ---
  for (const d of assetsOutOf.get(id) || []) {
    const yTo = L.rows.get(d.acquirer);
    if (yTo == null) continue;
    const x1 = X(d.year);
    const far = Math.abs(yTo - y) > STUB_ABOVE;
    const yLand = far ? y + Math.sign(yTo - y) * 13 : yTo;
    const x0 = Math.max(X(start), x1 - (far ? 26 : reach(yTo - y) * 0.8));
    parts.push(
      `<g class="ln-mark ln-mark--asset" data-deal="${esc(d.id)}" tabindex="0" role="button" aria-label="${esc(d.title)}, ${yr(d.year)}">` +
      `<path class="ln-asset-flow" d="${flow(x0, y, x1, yLand)}"/>` +
      `<rect class="ln-glyph-asset" x="${r1(x1 - 3.2)}" y="${r1(yLand - 3.2)}" width="6.4" height="6.4"/>` +
      (far ? `<text class="ln-annot" x="${r1(x1 + 7)}" y="${r1(yLand + 3.5)}">→ ${esc(nameAt(d.acquirer, d.year))}</text>` : '') +
      `</g>`
    );
  }

  // --- blocked deals: the thread reaches for another and snaps back ---
  for (const d of eventsOn.get(id) || []) {
    const x = X(d.year);
    if (d.type === 'failed') {
      const yTo = L.rows.get(d.acquirer);
      const dir = yTo == null ? -1 : Math.sign(yTo - y) || -1;
      const yMid = y + dir * 13;
      parts.push(
        `<g class="ln-mark ln-mark--failed" data-deal="${esc(d.id)}" tabindex="0" role="button" aria-label="Blocked: ${esc(d.title)}, ${yr(d.year)}">` +
        `<path class="ln-failed-flow" d="${flow(x - 26, y, x, yMid)}"/>` +
        `<path class="ln-glyph-x" d="M${r1(x - 4)} ${r1(yMid - 4)}l8 8M${r1(x + 4)} ${r1(yMid - 4)}l-8 8"/>` +
        `</g>`
      );
    } else {
      parts.push(
        `<g class="ln-mark ln-mark--external" data-deal="${esc(d.id)}" tabindex="0" role="button" aria-label="${esc(d.title)}, ${yr(d.year)}">` +
        `<circle class="ln-glyph-ext" cx="${r1(x)}" cy="${r1(y)}" r="4.4"/>` +
        `</g>`
      );
    }
  }

  // --- pending: a dashed branch that has not closed ---
  const pend = pendingInto.get(id);
  if (pend) {
    const yTo = L.rows.get(pend.acquirer);
    if (yTo != null) {
      const x1 = X(pend.year);
      parts.push(
        `<g class="ln-mark ln-mark--pending" data-deal="${esc(pend.id)}" tabindex="0" role="button" aria-label="Pending: ${esc(pend.title)}">` +
        `<path class="ln-pending-flow" d="${flow(x1 - reach(yTo - y) * 0.8, y, x1, yTo)}"/>` +
        `<circle class="ln-glyph-pending" cx="${r1(x1)}" cy="${r1(yTo)}" r="4"/>` +
        `</g>`
      );
    }
  }

  // --- the merge that ends this thread ---
  if (sweep) {
    const d = sweep.deal;
    parts.push(
      `<g class="ln-mark ln-mark--merge" data-deal="${esc(d.id)}" tabindex="0" role="button" aria-label="${esc(d.title)}, ${yr(d.year)}, ${money(d.valueB)}">` +
      `<path class="ln-merge-flow" d="${flow(sweep.x0, y, sweep.x1, sweep.yTo)}"/>` +
      `<circle class="ln-glyph-merge" cx="${r1(sweep.x1)}" cy="${r1(sweep.yTo)}" r="${r1(dotR(d.valueB))}"/>` +
      `</g>`
    );
  }

  // --- the Bell System shatters ---
  if (id === 'bellsystem') {
    const x = X(BREAKUP_YEAR);
    const kids = spawnsOf.get('bellsystem') || [];
    kids.forEach((_, i) => {
      const spread = 10 + i * 5.5;
      parts.push(`<path class="ln-shatter" d="${flow(x, y, x + 30 + i * 3, y + spread)}"/>`);
    });
    parts.push(`<circle class="ln-glyph-split" cx="${r1(x)}" cy="${r1(y)}" r="5.5"/>`);
    parts.push(`<text class="ln-annot" x="${r1(x + 12)}" y="${r1(y - 9)}">1984: shatters into AT&amp;T Corp. and seven Baby Bells — every thread below</text>`);
  }

  // --- names ---
  const gutter = shortOf(id);
  const label = alive
    ? `<text class="ln-end-name" x="${r1(X(END_YEAR) + 10)}" y="${r1(y + 4)}">${esc(finalName(id))}</text>`
    : '';

  const fam = familyOf.get(id);
  const fate = out
    ? `Absorbed by ${nameAt(out.acquirer, out.year)} in ${yr(out.year)}`
    : id === 'bellsystem' ? 'Broken up in 1984'
    : 'Still an independent company';

  return (
    `<g class="ln-lane" data-company="${esc(id)}" data-sector="${esc(c.sector)}" data-alive="${alive ? '1' : '0'}"` +
    ` data-search="${esc([c.name, ...(c.renames || []).map((r) => r.name), fam?.name, SECTORS[c.sector].name, c.note]
      .filter(Boolean).join(' ').toLowerCase())}">` +
    `<rect class="ln-hit" x="0" y="${r1(y - ROW / 2)}" width="${L.width}" height="${ROW}"/>` +
    `<text class="ln-name" x="${GUTTER - 12}" y="${r1(y + 4)}">${esc(gutter)}</text>` +
    parts.join('') + label +
    `<title>${esc(c.name)} — ${esc(fate)}</title>` +
    `</g>`
  );
}

// ---- the sticky year rail -------------------------------------------------

export function axisTicks() {
  const L = layout;
  if (!L) return [];
  const ticks = [];
  for (let year = 1985; year <= 2025; year += 5) ticks.push({ year, x: L.X(year) });
  ticks.unshift({ year: START_YEAR, x: L.X(START_YEAR), edge: true });
  ticks.push({ year: 2026, x: L.X(END_YEAR), edge: true });
  return ticks;
}

/** Year under a given x, or null outside the plot. */
export function yearAt(x) {
  const L = layout;
  if (!L) return null;
  const t = (x - L.X(START_YEAR)) / L.plotW;
  if (t < -0.02 || t > 1.02) return null;
  return START_YEAR + Math.min(1, Math.max(0, t)) * SPAN;
}

export { GUTTER };
