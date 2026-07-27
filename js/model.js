// Derives the consolidation graph from the raw dataset: who ended up inside whom,
// when each company's thread starts and stops, and the summary figures.
// Everything downstream (lineage chart, curve, ledger) reads from here.

import { COMPANIES, DEALS, SECTORS, START_YEAR, END_YEAR } from './data.js';

const push = (map, key, value) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

export const byId = new Map(COMPANIES.map((c) => [c.id, c]));
export const nameOf = (id) => byId.get(id)?.name ?? id;
export const shortOf = (id) => byId.get(id)?.short ?? byId.get(id)?.name ?? id;

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------
export const mergedInto = new Map();     // target -> deal   (closed, thread ends)
export const pendingInto = new Map();    // target -> deal   (announced, thread continues)
export const acquisitionsOf = new Map(); // acquirer -> [deal] (merge + pending)
export const assetsInto = new Map();     // acquirer -> [deal] (partial asset buys)
export const assetsOutOf = new Map();    // seller -> [deal]
export const eventsOn = new Map();       // company -> [deal] (external / failed markers)

for (const d of DEALS) {
  switch (d.type) {
    case 'merge':
      mergedInto.set(d.target, d);
      push(acquisitionsOf, d.acquirer, d);
      break;
    case 'pending':
      pendingInto.set(d.target, d);
      push(acquisitionsOf, d.acquirer, d);
      break;
    case 'asset':
      push(assetsInto, d.acquirer, d);
      push(assetsOutOf, d.target, d);
      break;
    case 'failed':
      push(eventsOn, d.target, d);
      break;
    case 'external':
      if (!d.hideNode) push(eventsOn, d.target, d);
      break;
    default:
      break;
  }
}

export const spawnsOf = new Map();       // parent -> [child company]
for (const c of COMPANIES) if (c.spawnedFrom) push(spawnsOf, c.spawnedFrom, c);

// ---------------------------------------------------------------------------
// Thread extent
// ---------------------------------------------------------------------------
export const BREAKUP_YEAR = 1984;

export function endYear(id) {
  const d = mergedInto.get(id);
  if (d) return d.year;
  if (id === 'bellsystem') return BREAKUP_YEAR;
  return END_YEAR;
}

export const isAbsorbed = (id) => mergedInto.has(id) || id === 'bellsystem';
export const isAlive = (id) => !isAbsorbed(id);

/** Display name as of a given year, following the rename list. */
export function nameAt(id, year) {
  const c = byId.get(id);
  if (!c) return id;
  let name = c.name;
  for (const r of c.renames || []) if (year >= r.year) name = r.name;
  return name;
}

export const finalName = (id) => nameAt(id, END_YEAR);

// ---------------------------------------------------------------------------
// Families — follow the merge chain forward until it stops. Pending deals count
// for grouping (Cox belongs with Charter) but never end a thread.
// ---------------------------------------------------------------------------
export function rootOf(id) {
  const seen = new Set();
  let cur = id;
  while (!seen.has(cur)) {
    seen.add(cur);
    const d = mergedInto.get(cur) || pendingInto.get(cur);
    if (!d) break;
    cur = d.acquirer;
  }
  return cur;
}

/** Depth-first lane order: trunk first, then each thread that flowed into it,
 *  earliest deal first, recursively — so sub-trees stay contiguous. */
function laneOrder(rootId, members) {
  const kids = new Map();
  for (const c of members) {
    const d = mergedInto.get(c.id) || pendingInto.get(c.id);
    if (d) push(kids, d.acquirer, { id: c.id, year: d.year });
  }
  const out = [];
  const walk = (id) => {
    out.push(id);
    for (const k of (kids.get(id) || []).sort((a, b) => a.year - b.year)) walk(k.id);
  };
  walk(rootId);
  return out;
}

/** Every closed deal value this family pulled in, across the whole tree. */
function familyValue(memberIds) {
  const set = new Set(memberIds);
  let total = 0;
  for (const d of DEALS) {
    if (d.type !== 'merge' && d.type !== 'asset') continue;
    if (!set.has(d.acquirer)) continue;
    total += d.valueB || 0;
  }
  return total;
}

export const FAMILIES = (() => {
  const grouped = new Map();
  for (const c of COMPANIES) {
    if (c.id === 'bellsystem') continue;
    push(grouped, rootOf(c.id), c);
  }

  const families = [];
  const loners = [];
  for (const [rootId, members] of grouped) {
    if (members.length < 2) { loners.push(members[0]); continue; }
    const lanes = laneOrder(rootId, members);
    families.push({
      id: rootId,
      name: finalName(rootId),
      lanes,
      absorbed: lanes.length - 1,
      valueB: familyValue(lanes),
      sector: byId.get(rootId).sector,
    });
  }
  families.sort((a, b) => b.lanes.length - a.lanes.length || b.valueB - a.valueB);

  if (loners.length) {
    loners.sort((a, b) => a.born - b.born);
    families.push({
      id: '__independent',
      name: 'Never merged, never acquired',
      lanes: loners.map((c) => c.id),
      absorbed: 0,
      valueB: 0,
      standalone: true,
    });
  }
  return families;
})();

export const familyOf = new Map();
for (const f of FAMILIES) for (const id of f.lanes) familyOf.set(id, f);

// ---------------------------------------------------------------------------
// Thread weight — a trunk thickens each time it swallows something.
// ---------------------------------------------------------------------------
export function absorptionYears(id) {
  const years = [];
  for (const d of acquisitionsOf.get(id) || []) if (d.type === 'merge') years.push(d.year);
  for (const d of assetsInto.get(id) || []) years.push(d.year);
  return years.sort((a, b) => a - b);
}

const MIN_W = 1.5;
const MAX_W = 5.5;
export function widthAt(id, year) {
  let w = MIN_W;
  for (const y of absorptionYears(id)) if (y <= year) w += 0.42;
  return Math.min(w, MAX_W);
}

// ---------------------------------------------------------------------------
// Series: how many of the tracked companies were still independent each year
// ---------------------------------------------------------------------------
export const independentSeries = (() => {
  const pts = [];
  for (let y = START_YEAR; y <= END_YEAR + 1e-9; y += 0.25) {
    const year = Math.min(y, END_YEAR);
    let n = 0;
    for (const c of COMPANIES) {
      if (c.id === 'bellsystem' && year >= BREAKUP_YEAR) continue;
      if (c.born > year) continue;
      if (endYear(c.id) <= year && isAbsorbed(c.id)) continue;
      n++;
    }
    pts.push({ year, count: n });
  }
  return pts;
})();

// ---------------------------------------------------------------------------
// Headline figures
// ---------------------------------------------------------------------------
export const STATS = (() => {
  const closed = DEALS.filter((d) => d.type === 'merge' || d.type === 'asset' || d.type === 'external');
  const blocked = DEALS.filter((d) => d.type === 'failed');
  const pending = DEALS.filter((d) => d.type === 'pending');
  const closedValue = closed.reduce((s, d) => s + (d.valueB || 0), 0);
  const blockedValue = blocked.reduce((s, d) => s + (d.valueB || 0), 0);
  const survivors = COMPANIES.filter((c) => isAlive(c.id));
  const peak = independentSeries.reduce((m, p) => (p.count > m.count ? p : m), independentSeries[0]);
  const now = independentSeries[independentSeries.length - 1];
  return {
    companies: COMPANIES.length,
    deals: DEALS.length,
    closedDeals: closed.length,
    closedValue,
    blockedDeals: blocked.length,
    blockedValue,
    pendingDeals: pending.length,
    survivors: survivors.length,
    absorbed: COMPANIES.length - survivors.length,
    peakIndependent: peak,
    nowIndependent: now.count,
  };
})();

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
export function money(valueB, { compact = false } = {}) {
  if (valueB == null) return '—';
  if (valueB >= 1000) return `$${(valueB / 1000).toFixed(valueB >= 10000 ? 0 : 2)}T`;
  if (valueB >= 100) return `$${Math.round(valueB)}B`;
  if (valueB >= 10) return `$${valueB.toFixed(compact ? 0 : 1).replace(/\.0$/, '')}B`;
  return `$${valueB.toFixed(2).replace(/\.?0+$/, '')}B`;
}

/** 2005.9 -> "2005"; used everywhere a year is shown to a reader. */
export const yr = (year) => String(Math.floor(year));

export const DEAL_KIND = {
  merge:    { label: 'Merger',      blurb: 'Target absorbed; its thread ends' },
  asset:    { label: 'Asset sale',  blurb: 'Part of the seller changes hands; the seller survives' },
  external: { label: 'Outside buyer', blurb: 'Bought by a company outside this dataset' },
  split:    { label: 'Breakup / spin-off', blurb: 'One company becomes several' },
  failed:   { label: 'Blocked',     blurb: 'Announced, then killed by regulators or the parties' },
  pending:  { label: 'Pending',     blurb: 'Announced, not yet closed' },
};

export { SECTORS, COMPANIES, DEALS, START_YEAR, END_YEAR };
export { CHAPTERS, META } from './data.js';
