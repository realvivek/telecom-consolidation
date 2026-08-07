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

// Set by the bubble view once it loads, so the same controls drive both.
let onFilterChange = () => {};
let onJump = () => {};

function applyLineageFilter() {
  const q = $('#ln-search').value.trim().toLowerCase();
  onFilterChange(q, sectorFilter);
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
    if (!e.target.value) return;
    onJump(e.target.value);
    const target = lnBody.querySelector(`#${CSS.escape(e.target.value)}`);
    if (!target || document.querySelector('.lineage-frame').hidden) return;
    scrollTo({ top: target.getBoundingClientRect().top + scrollY - navHeight() - 40, behavior: 'smooth' });
  });

  // The key, grouped. Seven items in one wrapping row read as a run-on
  // sentence; two labelled groups with the glyphs on a shared column read as
  // something you can scan.
  const KEY = [
    ['A thread', false, [
      ['<line x1="1" y1="7" x2="27" y2="7" stroke="var(--alive)" stroke-width="3" stroke-linecap="round"/>',
        'Still independent today'],
      ['<line x1="1" y1="7" x2="27" y2="7" stroke="var(--dead)" stroke-width="1.6" stroke-linecap="round"/>',
        'Absorbed — it stops where it was bought'],
    ]],
    ['What happens along it', true, [
      ['<path d="M1 2C9 2 13 12 20 12" fill="none" stroke="var(--dead)" stroke-width="1.4"/><circle cx="22" cy="12" r="3.6" fill="var(--ink-2)" stroke="var(--surface)" stroke-width="2"/>',
        'Merger — the dot grows with deal value'],
      ['<path d="M1 2C9 2 13 12 18 12" fill="none" stroke="var(--dead)" stroke-width="1.1"/><rect x="19" y="8.8" width="6.4" height="6.4" fill="var(--surface)" stroke="var(--ink-2)" stroke-width="1.7"/>',
        'Part of the business sold'],
      ['<path d="M1 11C8 11 11 5 16 5" fill="none" stroke="var(--critical)" stroke-width="1.3"/><path d="M14 3l6 6M20 3l-6 6" stroke="var(--critical)" stroke-width="2" stroke-linecap="round"/>',
        'Blocked or abandoned'],
      ['<path d="M1 2C9 2 13 12 20 12" fill="none" stroke="var(--ink-2)" stroke-width="1.4" stroke-dasharray="5 4"/><circle cx="22" cy="12" r="3.6" fill="var(--surface)" stroke="var(--ink-2)" stroke-width="1.8" stroke-dasharray="3 2.4"/>',
        'Announced, not yet closed'],
      ['<path d="M12 3l4 4-4 4-4-4z" fill="var(--axis)"/><line x1="14" y1="7" x2="27" y2="7" stroke="var(--dead)" stroke-width="1.6"/>',
        'Spun out of a parent company'],
    ]],
  ];
  $('#ln-legend').innerHTML = KEY.map(([title, wide, items]) => `
    <section class="key-group${wide ? ' key-group--wide' : ''}">
      <h3 class="key-title">${esc(title)}</h3>
      <ul class="key-list">${items.map(([glyph, label]) => `<li>
        <span class="key-glyph"><svg width="28" height="15" viewBox="0 0 28 15" aria-hidden="true">${glyph}</svg></span>
        <span>${esc(label)}</span>
      </li>`).join('')}</ul>
    </section>`).join('');
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

// ------------------------------------------------------------ story mode --
// The 3D scene is a second way into the same data, not a replacement for the
// chart — so it is loaded only when someone asks for it.
(function storyMode() {
  const launch = $('#launch-story');
  const root = $('#story');

  const supportsWebGL = (() => {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  })();
  if (!supportsWebGL) return;   // leave the button hidden; the chart is the whole story anyway
  launch.hidden = false;
  $('#nav-story').hidden = false;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let story = null;
  let fired = new Set();
  const feed = $('#story-feed');
  const card = $('#story-card');
  const scrub = $('#story-scrub');
  const playBtn = $('#story-play');

  function setPlayLabel() {
    playBtn.textContent = story && story.state.playing ? 'Pause' : 'Play';
  }

  // The phone card is collapsed to a caption; this opens it out. Reset on every
  // chapter so a new chapter never arrives already expanded over the city.
  const panelEl = $('#story-panel');
  const moreBtn = $('#story-more');
  moreBtn.addEventListener('click', () => {
    const open = !panelEl.classList.contains('is-open');
    panelEl.classList.toggle('is-open', open);
    moreBtn.setAttribute('aria-expanded', String(open));
    moreBtn.textContent = open ? 'Show less' : 'Read more';
  });

  function collapsePanel() {
    panelEl.classList.remove('is-open');
    moreBtn.setAttribute('aria-expanded', 'false');
    moreBtn.textContent = 'Read more';
  }

  function showChapter(ch, i) {
    collapsePanel();
    $('#story-kicker').textContent = `Chapter ${i + 1} of ${story.chapters.length} · ${ch.kicker}`;
    $('#story-title').textContent = ch.title.replace(/\.$/, '');
    $('#story-body').textContent = ch.body;
    $('#story-dots').querySelectorAll('.story-dot').forEach((d, n) =>
      d.setAttribute('aria-current', String(n === i)));
    $('#story-prev').disabled = i === 0;
    $('#story-next').disabled = i === story.chapters.length - 1;
    feed.replaceChildren();
    fired = new Set(DEALS.filter((d) => d.year < ch.yearFrom).map((d) => d.id));
    setPlayLabel();
  }

  function pushFeed(d) {
    const li = document.createElement('li');
    li.className = d.type === 'failed' ? 'is-failed' : d.type === 'pending' ? 'is-pending' : '';
    li.innerHTML = `<span class="feed-year">${yr(d.year)} · ${esc(DEAL_KIND[d.type].label)}</span>
      <span class="feed-title">${esc(d.title)}</span>
      ${d.valueB ? `<span class="feed-value">${money(d.valueB)}</span>` : ''}`;
    feed.prepend(li);
    while (feed.children.length > 3) feed.lastElementChild.remove();
  }

  function cardFor(found) {
    if (found.deal) {
      const d = dealById.get(found.deal);
      const floor = d.type === 'failed' ? 'A floor that was never built.'
        : d.type === 'pending' ? 'Still under construction.'
        : d.type === 'external' ? 'A change of owner — no floor, just a beacon.'
        : `One storey, ${money(d.valueB)} tall.`;
      return `<span class="card-kind" data-kind="${d.type}">${esc(DEAL_KIND[d.type].label)}</span>
        <h4>${esc(d.title)}</h4>
        <p class="card-meta">${yr(d.year)} · ${money(d.valueB)} · ${esc(parties(d))}</p>
        ${d.note ? `<p class="card-note">${esc(d.note)}</p>` : ''}
        <p class="card-foot">${esc(floor)}</p>`;
    }
    if (found.tower) {
      const t = found.tower;
      const bits = [`${t.floors} ${t.floors === 1 ? 'storey' : 'storeys'}`];
      if (t.absorbed) bits.push(`${t.absorbed} companies inside`);
      if (t.blocked) bits.push(`${t.blocked} blocked`);
      if (t.pending) bits.push(`${t.pending} pending`);
      return `<span class="card-kind">Still standing</span>
        <h4>${esc(t.name)}</h4>
        <p class="card-meta">${t.total ? `${money(t.total)} of acquisitions` : 'Never bought another tracked company'} · on the plaza since ${yr(t.since)}</p>
        <p class="card-note">${esc(bits.join(' · '))}</p>
        <p class="card-foot">${esc(t.style)} — architecture, not data</p>`;
    }
    const id = found.company;
    const c = byId.get(id);
    const out = mergedInto.get(id);
    return `<span class="card-kind">${esc(SECTORS[c.sector].name)}</span>
      <h4>${esc(finalName(id))}</h4>
      <p class="card-meta">${yr(c.born)}–${isAlive(id) ? 'today' : yr(endYear(id))} · ${
        out ? `absorbed by ${esc(nameAt(out.acquirer, out.year))} for ${money(out.valueB)}`
            : id === 'bellsystem' ? 'broken up in 1984' : 'still independent'}</p>
      ${c.note ? `<p class="card-note">${esc(c.note)}</p>` : ''}`;
  }

  function placeCard(evt) {
    const box = card.getBoundingClientRect();
    card.style.left = `${Math.min(evt.clientX + 16, innerWidth - box.width - 12)}px`;
    card.style.top = `${Math.min(evt.clientY + 16, innerHeight - box.height - 12)}px`;
  }

  async function open() {
    root.hidden = false;
    document.body.style.overflow = 'hidden';
    if (!story) {
      launch.disabled = true;
      launch.querySelector('.btn-sub').textContent = 'Loading the scene…';
      const { createStory } = await import('./story.js');
      story = createStory(root);

      $('#story-dots').innerHTML = story.chapters.map((c, i) =>
        `<li><button class="story-dot" type="button" data-i="${i}">${esc(c.kicker)}</button></li>`).join('');
      $('#story-dots').addEventListener('click', (e) => {
        const b = e.target.closest('.story-dot');
        if (b) story.setChapter(+b.dataset.i, { play: !reduceMotion });
      });

      story.on('chapter', showChapter);
      story.on('chapterEnd', (i) => {
        setPlayLabel();
        if (reduceMotion || i >= story.chapters.length - 1) return;
        setTimeout(() => { if (!story.state.playing) story.setChapter(i + 1); }, 1800);
      });
      story.on('year', (year) => {
        $('#story-clock').textContent = yr(year);
        scrub.value = String(year);
        const ch = story.chapters[story.state.chapter];
        if (ch) {
          const k = (year - ch.yearFrom) / Math.max(0.001, ch.yearTo - ch.yearFrom);
          $('#story-fill').style.width = `${Math.max(0, Math.min(1, k)) * 100}%`;
        }
        for (const d of DEALS) {
          if (d.hideNode || fired.has(d.id) || d.year > year) continue;
          fired.add(d.id);
          pushFeed(d);
        }
      });
      story.on('hover', (found, e) => {
        if (!found) { card.hidden = true; return; }
        card.innerHTML = cardFor(found);
        card.hidden = false;
        placeCard(e);
      });
      story.on('pick', (found, e) => {
        if (!found) { card.hidden = true; return; }
        card.innerHTML = cardFor(found);
        card.hidden = false;
        placeCard(e);
      });

      story.start();
      story.setChapter(0, { play: !reduceMotion });
      launch.disabled = false;
      launch.querySelector('.btn-sub').textContent = 'Eight chapters, in 3D';
    } else {
      story.start();
    }
  }

  function close() {
    root.hidden = true;
    document.body.style.overflow = '';
    story?.pause();
    story?.stop();
    launch.focus();
  }

  $('#story-read').addEventListener('click', (e) => { e.preventDefault(); close(); location.hash = '#top'; });

  launch.addEventListener('click', open);
  $('#nav-story').addEventListener('click', open);
  $('#story-close').addEventListener('click', close);
  $('#story-reset').addEventListener('click', () => story?.resetView());
  $('#story-prev').addEventListener('click', () => story?.setChapter(story.state.chapter - 1, { play: !reduceMotion }));
  $('#story-next').addEventListener('click', () => story?.setChapter(story.state.chapter + 1, { play: !reduceMotion }));
  playBtn.addEventListener('click', () => {
    if (!story) return;
    if (story.state.playing) story.pause(); else story.play();
    setPlayLabel();
  });
  scrub.addEventListener('input', () => {
    story?.scrubTo(+scrub.value);
    $('#story-clock').textContent = yr(+scrub.value);
    setPlayLabel();
  });

  addEventListener('keydown', (e) => {
    if (root.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') $('#story-next').click();
    else if (e.key === 'ArrowLeft') $('#story-prev').click();
    else if (e.key === ' ') { e.preventDefault(); playBtn.click(); }
  });
  addEventListener('resize', () => { if (!root.hidden) story?.resize(); });

  // The city is the front door on a desktop. Not on a phone: a WebGL scene is
  // the most expensive thing here and the smallest screen is where it reads
  // worst, so a phone lands on the page and opens the city only if asked.
  // A hash in the URL opts out everywhere — a shared link to the ledger, or the
  // jump back from "Read the full story", asked for that section instead.
  if (!location.hash && innerWidth > 860) open();
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

// ------------------------------------------------------------- bubble map --
// The default view of the lineage: containment for "inside whom", the clock for
// "when". The thread chart stays one click away as the precise reference.
(function bubbles() {
  const holder = $('#bubble-holder');
  if (!holder) return;
  const view = $('#bubble-view');
  const frame = document.querySelector('.lineage-frame');
  const legend = $('#ln-legend');
  const count = $('#ln-count');
  const scrub = $('#bub-scrub');
  const playBtn = $('#bub-play');
  const yearOut = $('#bub-year');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let map = null;

  function showYear(y) {
    yearOut.textContent = yr(y);
    scrub.value = String(y);
  }

  import('./bubbles.js').then(({ createBubbles }) => {
    map = createBubbles(document);
    map.on('year', showYear);
    showYear(map.year);
    if (!reduceMotion) map.play();
    playBtn.textContent = map.playing ? 'Pause' : 'Play';

    // The same search box and sector chips that fade threads now fade bubbles.
    onFilterChange = (q, sector) => {
      if (!q && sector === 'all') { map.setFilter(null); return; }
      map.setFilter((c) => (sector === 'all' || c.sector === sector)
        && (!q || `${c.name} ${c.short || ''} ${finalName(c.id)}`.toLowerCase().includes(q)));
    };
    // "Jump to" names a company group; in the bubble view that means select its
    // trunk. Two entries are headings rather than companies — leave those alone
    // rather than clearing whatever the reader had selected.
    onJump = (domId) => {
      const id = domId.replace(/^fam-/, '');
      if (byId.has(id)) map.select(id);
    };
    addEventListener('keydown', (e) => { if (e.key === 'Escape') map.select(null); });

    scrub.addEventListener('input', () => {
      map.pause();
      map.setYear(+scrub.value);
      showYear(+scrub.value);
      playBtn.textContent = 'Play';
    });
    playBtn.addEventListener('click', () => {
      if (map.playing) map.pause(); else map.play();
      playBtn.textContent = map.playing ? 'Pause' : 'Play';
    });
    addEventListener('resize', () => { clearTimeout(bt); bt = setTimeout(() => map.resize(), 180); });
  }).catch(() => {
    // No bubble view — fall back to the chart that never needed JS modules.
    pick('threads');
    $('.viewswitch').hidden = true;
  });

  let bt;
  function pick(which) {
    const bub = which === 'bubbles';
    view.hidden = !bub;
    frame.hidden = bub;
    legend.hidden = bub;
    count.hidden = bub;
    $('#vs-bubbles').setAttribute('aria-pressed', String(bub));
    $('#vs-threads').setAttribute('aria-pressed', String(!bub));
    if (bub) { map?.resize(); } else { map?.pause(); if (playBtn) playBtn.textContent = 'Play'; }
    if (!bub) drawLineage();
  }
  $('#vs-bubbles').addEventListener('click', () => pick('bubbles'));
  $('#vs-threads').addEventListener('click', () => pick('threads'));
})();
