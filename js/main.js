// Wiring: render each view, then attach the reading aids — a year rail that
// follows you down the lineage chart, hover detail, search, and filters.

import {
  CHAPTERS, DEALS, SECTORS, META, STATS,
  byId, nameAt, finalName, mergedInto, pendingInto, endYear, isAlive,
  familyOf, money, yr, DEAL_KIND,
} from './model.js';
import { renderLineage, axisTicks, yearAt, MIN_WIDTH } from './lineage.js';
import { renderCurve, curveProbe, renderTrunkBars } from './charts.js';
import { renderRows, filterRows, parties, ROWS } from './table.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dealById = new Map(DEALS.map((d) => [d.id, d]));
const navHeight = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 56;

// ------------------------------------------------------------------ theme --
$('.theme-toggle').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.getAttribute('data-theme')
    ? root.getAttribute('data-theme') === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch (e) { /* no storage — this session only */ }
});

// ------------------------------------------------------------------ stats --
(function stats() {
  const tiles = [
    { value: String(STATS.companies), label: 'companies tracked', sub: `${STATS.absorbed} of them no longer exist on their own` },
    { value: money(STATS.closedValue), label: 'of closed deals', sub: `across ${STATS.closedDeals} transactions, in nominal dollars` },
    { value: String(STATS.peakIndependent.count), label: `independent at the ${yr(STATS.peakIndependent.year)} peak`, sub: `down to ${STATS.nowIndependent} today` },
    { value: money(STATS.blockedValue), label: 'blocked or abandoned', sub: `${STATS.blockedDeals} deals died, including the largest ever proposed` },
  ];
  $('#stats').innerHTML = tiles.map((t) => `<li class="stat">
    <span class="stat-value">${esc(t.value)}</span>
    <span class="stat-label">${esc(t.label)}</span>
    <span class="stat-sub">${esc(t.sub)}</span>
  </li>`).join('');
  $('#foot-note').textContent = META.dataNote;
})();

// ------------------------------------------------------------------- eras --
$('#eras-list').innerHTML = CHAPTERS
  .filter((c) => c.id !== 'prologue' && c.id !== 'epilogue')
  .map((c) => `<li class="era">
    <span class="era-year">${esc(c.kicker)}</span>
    <h3>${esc(c.title.replace(/\.$/, ''))}</h3>
    <p>${esc(c.body)}</p>
  </li>`).join('');

// ---------------------------------------------------------------- tooltip --
const tip = $('#tip');
let tipPinned = false;

function showTip(evt, html) {
  tip.innerHTML = html;
  tip.hidden = false;
  if (evt) positionTip(evt);
}
function positionTip(evt) {
  const pad = 14;
  const box = tip.getBoundingClientRect();
  let x = evt.clientX + pad;
  let y = evt.clientY + pad;
  if (x + box.width > innerWidth - 8) x = evt.clientX - box.width - pad;
  if (y + box.height > innerHeight - 8) y = Math.max(8, evt.clientY - box.height - pad);
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${y}px`;
}
function hideTip() { if (!tipPinned) tip.hidden = true; }

function dealTip(d) {
  const kind = DEAL_KIND[d.type];
  return `<span class="tip-kind" data-kind="${d.type}">${esc(kind.label)}</span>
    <h4>${esc(d.title)}</h4>
    <p class="tip-meta">${yr(d.year)} · <span class="tip-value">${money(d.valueB)}</span></p>
    <p class="tip-meta">${esc(parties(d))}</p>
    ${d.note ? `<p class="tip-note">${esc(d.note)}</p>` : ''}`;
}

function companyTip(id) {
  const c = byId.get(id);
  const out = mergedInto.get(id);
  const pend = pendingInto.get(id);
  const fam = familyOf.get(id);
  const span = `${yr(c.born)}–${isAlive(id) ? 'today' : yr(endYear(id))}`;
  let fate;
  if (out) fate = `absorbed by ${esc(nameAt(out.acquirer, out.year))} in ${yr(out.year)} for ${money(out.valueB)}`;
  else if (id === 'bellsystem') fate = 'broken up by court order in 1984';
  else if (pend) fate = `agreed to merge with ${esc(nameAt(pend.acquirer, pend.year))}, not yet closed`;
  else fate = 'still an independent company';
  const now = finalName(id);
  return `<span class="tip-kind">${esc(SECTORS[c.sector].name)}</span>
    <h4>${esc(c.name)}${now !== c.name ? ` <span class="tip-meta">→ ${esc(now)}</span>` : ''}</h4>
    <p class="tip-meta">${span} · ${fate}</p>
    ${fam && !fam.standalone && fam.id !== id ? `<p class="tip-meta">Part of ${esc(fam.name)} today.</p>` : ''}
    ${c.note ? `<p class="tip-note">${esc(c.note)}</p>` : ''}`;
}

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { tipPinned = false; tip.hidden = true; }
});

// ------------------------------------------------------------------ curve --
const curveHolder = $('#curve-holder');
function drawCurve() {
  const width = curveHolder.clientWidth || 720;
  curveHolder.innerHTML = renderCurve(width);
  const svg = curveHolder.querySelector('svg');
  const cursor = svg.querySelector('.ch-cursor');
  const cLine = svg.querySelector('.ch-cursor-line');
  const cDot = svg.querySelector('.ch-cursor-dot');

  svg.querySelector('.ch-hit').addEventListener('pointermove', (e) => {
    const box = svg.getBoundingClientRect();
    const probe = curveProbe((e.clientX - box.left) * (svg.viewBox.baseVal.width / box.width), width);
    if (!probe) return;
    cursor.style.display = '';
    cLine.setAttribute('x1', probe.x); cLine.setAttribute('x2', probe.x);
    cDot.setAttribute('cx', probe.x); cDot.setAttribute('cy', probe.y);
    showTip(e, `<h4>${yr(probe.point.year)}</h4>
      <p class="tip-meta"><span class="tip-value">${probe.point.count}</span> companies still independent</p>`);
  });
  svg.querySelector('.ch-hit').addEventListener('pointerleave', () => {
    cursor.style.display = 'none';
    hideTip();
  });
}

// ------------------------------------------------------------------- bars --
$('#trunk-bars').innerHTML = renderTrunkBars();

// ---------------------------------------------------------------- lineage --
const lnScroll = $('#ln-scroll');
const lnBody = $('#ln-body');
const lnRail = $('#ln-rail');
const lnAxis = $('#ln-axis-static');
const lnCount = $('#ln-count');
let sectorFilter = 'all';
let lnWidth = 0;

const axisHTML = () => `<div class="rail-inner" style="width:${lnWidth}px">${axisTicks().map((t) =>
  `<span class="rail-tick${t.edge ? ' rail-tick--edge' : ''}" style="left:${t.x}px">${yr(t.year)}</span>`
).join('')}<span class="rail-now"></span></div>`;

function drawLineage() {
  lnWidth = Math.max(lnScroll.clientWidth, MIN_WIDTH);
  lnBody.innerHTML = renderLineage(lnBody, lnWidth);
  lnAxis.innerHTML = axisHTML();
  lnRail.innerHTML = axisHTML();
  attachLineage();
  buildJumpList();
  applyLineageFilter();
  syncRail();
}

function attachLineage() {
  const svg = lnBody.querySelector('svg');
  const cursor = svg.querySelector('.ln-cursor');
  const railNow = () => lnRail.querySelector('.rail-now');

  svg.addEventListener('pointermove', (e) => {
    const box = svg.getBoundingClientRect();
    const x = (e.clientX - box.left) * (svg.viewBox.baseVal.width / box.width);
    const year = yearAt(x);
    cursor.style.display = year == null ? 'none' : '';
    if (year != null) { cursor.setAttribute('x1', x); cursor.setAttribute('x2', x); }
    const now = railNow();
    if (now) {
      now.classList.toggle('is-on', year != null && lnRail.classList.contains('is-on'));
      if (year != null) { now.style.left = `${x}px`; now.textContent = yr(year); }
    }
    if (tipPinned) return;
    const mark = e.target.closest('[data-deal]');
    if (mark) return showTip(e, dealTip(dealById.get(mark.dataset.deal)));
    const lane = e.target.closest('[data-company]');
    if (lane) return showTip(e, companyTip(lane.dataset.company));
    hideTip();
  });

  svg.addEventListener('pointerleave', () => {
    cursor.style.display = 'none';
    railNow()?.classList.remove('is-on');
    hideTip();
  });

  svg.addEventListener('click', (e) => {
    const mark = e.target.closest('[data-deal]');
    const lane = e.target.closest('[data-company]');
    if (!mark && !lane) return;
    tipPinned = false;
    showTip(e, mark ? dealTip(dealById.get(mark.dataset.deal)) : companyTip(lane.dataset.company));
    tipPinned = true;
  });

  svg.addEventListener('focusin', (e) => {
    const mark = e.target.closest('[data-deal]');
    if (!mark) return;
    const box = mark.getBoundingClientRect();
    tipPinned = false;
    showTip({ clientX: box.left + box.width / 2, clientY: box.bottom + 4 }, dealTip(dealById.get(mark.dataset.deal)));
  });
  svg.addEventListener('focusout', hideTip);
}

// The year rail rides the top of the viewport for as long as the chart is in view.
function syncRail() {
  const frame = $('.lineage-frame');
  const rect = frame.getBoundingClientRect();
  const navH = navHeight();
  const onScreen = rect.top < navH && rect.bottom > navH + 90;
  lnRail.classList.toggle('is-on', onScreen);
  if (!onScreen) return;
  lnRail.style.top = `${navH}px`;
  lnRail.style.left = `${rect.left + 1}px`;
  lnRail.style.width = `${rect.width - 2}px`;
  lnRail.firstElementChild.style.transform = `translateX(${-lnScroll.scrollLeft}px)`;
}
addEventListener('scroll', syncRail, { passive: true });
lnScroll.addEventListener('scroll', syncRail, { passive: true });

function applyLineageFilter() {
  const q = $('#ln-search').value.trim().toLowerCase();
  const lanes = lnBody.querySelectorAll('.ln-lane');
  let shown = 0;
  lanes.forEach((el) => {
    const on = (sectorFilter === 'all' || el.dataset.sector === sectorFilter)
      && (!q || el.dataset.search.includes(q));
    el.classList.toggle('is-dim', !on);
    if (on) shown++;
  });
  const bits = [];
  if (sectorFilter !== 'all') bits.push(SECTORS[sectorFilter].name.toLowerCase());
  if (q) bits.push(`“${q}”`);
  lnCount.textContent = bits.length
    ? `${shown} of ${lanes.length} threads match ${bits.join(' and ')}. The rest are faded rather than removed, so the shape of the chart stays put.`
    : `All ${lanes.length} threads shown. Point at any thread for its story, or at a marker for the deal behind it; click to pin, Escape to close.`;
}

function buildJumpList() {
  const jump = $('#ln-jump');
  jump.innerHTML = `<option value="">A company group…</option>` +
    [...lnBody.querySelectorAll('.ln-head')].map((g) =>
      `<option value="${g.id}">${esc(g.querySelector('.ln-head-name').textContent)}</option>`).join('');
}

(function lineageControls() {
  const chips = $('#sector-chips');
  chips.innerHTML =
    `<button class="chip" type="button" data-sector="all" aria-pressed="true">All sectors</button>` +
    Object.entries(SECTORS).map(([k, s]) =>
      `<button class="chip" type="button" data-sector="${k}" aria-pressed="false">${esc(s.name)}</button>`).join('');

  chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    sectorFilter = chip.dataset.sector;
    chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    applyLineageFilter();
  });

  let t;
  $('#ln-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(applyLineageFilter, 120); });

  $('#ln-jump').addEventListener('change', (e) => {
    const target = e.target.value && lnBody.querySelector(`#${CSS.escape(e.target.value)}`);
    if (!target) return;
    scrollTo({ top: target.getBoundingClientRect().top + scrollY - navHeight() - 40, behavior: 'smooth' });
  });

  $('#ln-legend').innerHTML = [
    ['<line x1="1" y1="7" x2="27" y2="7" stroke="var(--alive)" stroke-width="3" stroke-linecap="round"/>', 'Still independent today'],
    ['<line x1="1" y1="7" x2="27" y2="7" stroke="var(--dead)" stroke-width="1.6" stroke-linecap="round"/>', 'Absorbed — the thread stops where it was bought'],
    ['<path d="M1 2C9 2 13 12 20 12" fill="none" stroke="var(--dead)" stroke-width="1.4"/><circle cx="22" cy="12" r="3.6" fill="var(--ink-2)" stroke="var(--surface)" stroke-width="2"/>', 'Merger — dot grows with deal value'],
    ['<path d="M1 2C9 2 13 12 18 12" fill="none" stroke="var(--dead)" stroke-width="1.1"/><rect x="19" y="8.8" width="6.4" height="6.4" fill="var(--surface)" stroke="var(--ink-2)" stroke-width="1.7"/>', 'Part of the business sold'],
    ['<path d="M1 11C8 11 11 5 16 5" fill="none" stroke="var(--critical)" stroke-width="1.3"/><path d="M14 3l6 6M20 3l-6 6" stroke="var(--critical)" stroke-width="2" stroke-linecap="round"/>', 'Blocked or abandoned'],
    ['<path d="M1 2C9 2 13 12 20 12" fill="none" stroke="var(--ink-2)" stroke-width="1.4" stroke-dasharray="5 4"/><circle cx="22" cy="12" r="3.6" fill="var(--surface)" stroke="var(--ink-2)" stroke-width="1.8" stroke-dasharray="3 2.4"/>', 'Announced, not yet closed'],
    ['<path d="M12 3l4 4-4 4-4-4z" fill="var(--axis)"/><line x1="14" y1="7" x2="27" y2="7" stroke="var(--dead)" stroke-width="1.6"/>', 'Spun out of a parent company'],
  ].map(([svg, label]) => `<li><svg width="28" height="15" viewBox="0 0 28 15" aria-hidden="true">${svg}</svg>${esc(label)}</li>`).join('');
})();

// ----------------------------------------------------------------- ledger --
(function ledger() {
  const rows = $('#dl-rows');
  const count = $('#dl-count');
  const sectorSel = $('#dl-sector');
  sectorSel.innerHTML = `<option value="all">All sectors</option>` +
    Object.entries(SECTORS).map(([k, s]) => `<option value="${k}">${esc(s.name)}</option>`).join('');

  function update() {
    const list = filterRows({
      query: $('#dl-search').value,
      type: $('#dl-type').value,
      sector: sectorSel.value,
      sort: $('#dl-sort').value,
    });
    rows.innerHTML = renderRows(list);
    const value = list.reduce((s, r) => s + (r.deal.valueB || 0), 0);
    count.textContent = `${list.length} of ${ROWS.length} deals · ${money(value)} announced, across every outcome shown`;
  }

  rows.addEventListener('click', (e) => {
    const btn = e.target.closest('.row-main');
    const note = btn && btn.nextElementSibling;
    if (!note || !note.classList.contains('row-note')) return;
    const open = !note.hidden;
    note.hidden = open;
    btn.setAttribute('aria-expanded', String(!open));
  });

  let t;
  $('#dl-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(update, 120); });
  for (const id of ['#dl-type', '#dl-sector', '#dl-sort']) $(id).addEventListener('change', update);
  update();
})();

// ----------------------------------------------------------------- resize --
let rt;
let lastWidth = innerWidth;
addEventListener('resize', () => {
  if (innerWidth === lastWidth) return;   // ignore mobile URL-bar height changes
  lastWidth = innerWidth;
  clearTimeout(rt);
  rt = setTimeout(() => { drawCurve(); drawLineage(); }, 180);
});

drawCurve();
drawLineage();
