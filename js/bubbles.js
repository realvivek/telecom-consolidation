// The bubble map, on a clock.
//
// Every tracked company is one bubble, sized by what was paid for it. Bubbles
// live inside the bubble of whoever owns them *in the year you are looking at*,
// so dragging the year makes companies migrate into their acquirer and the
// acquirer swell. Containment answers "who ended up inside whom" without
// tracing anything; the clock answers "when".
//
// The layout is one continuous relaxation rather than a fresh pack per year —
// a re-pack every frame would teleport every bubble on every tick, which is
// exactly what makes most of these charts unreadable. Positions carry over, so
// a merge reads as a movement you can follow.

import {
  COMPANIES, DEALS, byId, mergedInto, endYear, finalName, nameAt,
  money, yr, START_YEAR, END_YEAR,
} from './model.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => {
  const e = document.createElementNS(NS, n);
  for (const k in a) e.setAttribute(k, a[k]);
  return e;
};

const MERGES = DEALS.filter((d) => d.type === 'merge');
const PRICE = new Map();
for (const d of DEALS) {
  if ((d.type === 'merge' || d.type === 'asset') && d.target && d.valueB) {
    PRICE.set(d.target, Math.max(PRICE.get(d.target) || 0, d.valueB));
  }
}

/** Who owns this company in a given year — follow only deals that had closed. */
function ownerAt(id, year) {
  let cur = id;
  for (let guard = 0; guard < 40; guard++) {
    const d = MERGES.find((x) => x.target === cur && x.year <= year);
    if (!d) return cur;
    cur = d.acquirer;
  }
  return cur;
}

/** On screen at all yet? Born, and not dissolved by something other than a merger. */
function present(c, year) {
  if (c.id === 'bellsystem' || c.born > year) return false;
  const e = endYear(c.id);
  return !(e != null && e < year && !mergedInto.get(c.id));
}

export function createBubbles(root) {
  const holder = root.querySelector('#bubble-holder');
  const svg = el('svg', {
    class: 'bub-svg', role: 'img',
    'aria-label': 'Bubble map of 66 telecom companies grouped by who owns them. '
      + 'Every company and deal is also listed in the deal ledger below.',
  });
  const gLinks = el('g');
  const gHulls = el('g');
  const gNodes = el('g');
  const gLabels = el('g');
  svg.append(gHulls, gLinks, gNodes, gLabels);
  holder.appendChild(svg);

  const tip = root.querySelector('#bub-tip');

  // A bubble per company. Radius is the price paid, with a floor so a company
  // nobody ever bought is still a visible dot rather than nothing.
  const nodes = COMPANIES.filter((c) => c.id !== 'bellsystem').map((c, i) => ({
    id: c.id,
    company: c,
    r: Math.max(6, Math.sqrt(PRICE.get(c.id) || 1.2) * 3.1),
    // Seeded on a phyllotaxis spiral so the opening frame is already tidy.
    x: Math.cos(i * 2.399) * Math.sqrt(i + 0.5) * 26,
    y: Math.sin(i * 2.399) * Math.sqrt(i + 0.5) * 26,
    vis: 0,
    owner: c.id,
  }));
  const byNode = new Map(nodes.map((n) => [n.id, n]));

  const clusters = new Map();   // ownerId → { x, y, tx, ty }
  const H_MAX = 700;
  let W = 900;
  let H = 560;
  let scale = 1;
  let year = START_YEAR;
  let hovered = null;
  let selected = null;
  let filter = null;   // (company) => boolean, or null for "everything matches"
  let raf = 0;
  let playing = false;
  let last = 0;
  const listeners = { year: [] };

  const emit = (k, v) => listeners[k].forEach((fn) => fn(v));

  /* ------------------------------------------------------------- layout -- */

  function regroup() {
    const live = nodes.filter((n) => present(n.company, year));
    for (const n of live) n.owner = ownerAt(n.id, year);

    // Cluster targets: relax the owner blobs against each other, sized by the
    // area they have to hold. Recomputed each tick but seeded from the previous
    // positions, so the arrangement drifts rather than jumping.
    const groups = new Map();
    for (const n of live) {
      let g = groups.get(n.owner);
      if (!g) {
        const prev = clusters.get(n.owner);
        g = { id: n.owner, area: 0, x: prev ? prev.x : 0, y: prev ? prev.y : 0, n: 0 };
        groups.set(n.owner, g);
      }
      g.area += n.r * n.r;
      g.n++;
    }
    for (const g of groups.values()) g.R = Math.sqrt(g.area) * 1.42 + 12;

    const list = [...groups.values()];
    // Seed anything new near its acquirer's old spot, or the middle.
    for (const g of list) {
      if (g.x === 0 && g.y === 0) {
        g.x = (Math.random() - 0.5) * 40;
        g.y = (Math.random() - 0.5) * 40;
      }
    }
    for (let it = 0; it < 8; it++) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]; const b = list[j];
          let dx = b.x - a.x; let dy = b.y - a.y;
          let d = Math.hypot(dx, dy) || 0.01;
          const need = a.R + b.R + 10;
          if (d < need) {
            const p = ((need - d) / d) * 0.5;
            dx *= p; dy *= p;
            a.x -= dx; a.y -= dy; b.x += dx; b.y += dy;
          }
        }
      }
      for (const g of list) { g.x *= 0.97; g.y *= 0.97; }
    }

    clusters.clear();
    for (const g of list) clusters.set(g.id, g);
    return { live, list };
  }

  function step(dt) {
    const { live, list } = regroup();

    for (const n of nodes) {
      const on = present(n.company, year);
      n.vis += ((on ? 1 : 0) - n.vis) * Math.min(1, dt * 6);
    }

    // Pull each bubble to its owner's centre, then push overlapping pairs apart.
    for (const n of live) {
      const g = clusters.get(n.owner);
      if (!g) continue;
      n.x += (g.x - n.x) * Math.min(1, dt * 2.4);
      n.y += (g.y - n.y) * Math.min(1, dt * 2.4);
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i]; const b = live[j];
          let dx = b.x - a.x; let dy = b.y - a.y;
          let d = Math.hypot(dx, dy);
          if (d < 0.01) { dx = (i % 2 ? 0.4 : -0.4); dy = 0.3; d = 0.5; }
          // Bubbles in different families keep more room between them, which is
          // what makes the family blobs read as separate objects.
          const need = a.r + b.r + (a.owner === b.owner ? 1.4 : 9);
          if (d < need) {
            const p = ((need - d) / d) * 0.5;
            a.x -= dx * p; a.y -= dy * p;
            b.x += dx * p; b.y += dy * p;
          }
        }
      }
    }

    // Fit everything on screen without ever cropping a bubble.
    let R = 1;
    for (const n of live) R = Math.max(R, Math.hypot(n.x, n.y) + n.r + 4);
    // The label sits two lines above its hull, so the vertical fit has to leave
    // that much headroom or the biggest cluster loses its name off the top.
    // Fit on width, then let the frame hug the content vertically — a fixed
    // aspect left a third of the card empty, since a circle pack is square.
    // Clamped: a holder measured mid-layout can be narrower than the padding,
    // which would make the fit negative and mirror the whole map.
    // Width fits, but the tallest frame we allow still bounds the scale — drop
    // that and a year full of separate companies spills off the top and bottom.
    // The side margin exists to keep long names on screen; on a phone that
    // margin is most of the frame, so it scales with the width.
    const padX = Math.max(16, Math.min(78, W * 0.075));
    const want = Math.max(0.04, Math.min((W / 2 - padX) / R, (H_MAX / 2 - 42) / R));
    scale += (want - scale) * Math.min(1, dt * 3);
    const fitH = Math.max(320, Math.min(H_MAX, Math.round(R * scale * 2 + 84)));
    if (Math.abs(fitH - H) > 6) {
      H = fitH;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('height', H);
    }
    draw(live, list);
  }

  /* --------------------------------------------------------------- draw -- */

  function draw(live, list) {
    const cx = W / 2;
    const cy = H / 2;
    const P = (n) => [cx + n.x * scale, cy + n.y * scale];

    gHulls.replaceChildren();
    gNodes.replaceChildren();
    gLabels.replaceChildren();

    list.sort((a, b) => b.R - a.R);
    for (const g of list) {
      if (g.n < 2) continue;
      gHulls.appendChild(el('circle', {
        cx: cx + g.x * scale, cy: cy + g.y * scale, r: Math.max(0, g.R * scale),
        class: 'bub-hull',
      }));
    }

    const chain = selected ? chainOf(selected) : null;
    for (const n of live) {
      if (n.vis < 0.02) continue;
      const [x, y] = P(n);
      const isTrunk = n.owner === n.id;
      const dim = (filter && !filter(n.company)) || (chain && !chain.has(n.id));
      const c = el('circle', {
        cx: x, cy: y, r: Math.max(0, n.r * scale * n.vis),
        class: `bub${isTrunk ? ' is-trunk' : ''}${hovered === n.id ? ' is-hover' : ''}`
          + `${dim ? ' is-dim' : ''}${selected === n.id ? ' is-sel' : ''}`,
      });
      c.dataset.id = n.id;
      gNodes.appendChild(c);
    }

    // Only the trunks get a permanent name; everything else is on hover, which
    // is what keeps sixty-six labels from turning back into the old mess.
    const placed = [];
    const nameSingles = list.length <= 20;
    for (const g of list) {
      if (g.n < 2 && !nameSingles) continue;
      const name = finalName(g.id);
      const x = cx + g.x * scale;
      const y = cy + g.y * scale - g.R * scale - 8;
      const hw = name.length * 3.7 + 8;
      if (y < 15 || x - hw < 1 || x + hw > W - 1) continue;
      // Bigger clusters are drawn first and win the space; a name that would
      // print across one already placed is dropped rather than stacked on it.
      if (placed.some((p) => Math.abs(p.x - x) < p.hw + hw && Math.abs(p.y - y) < 26)) continue;
      placed.push({ x, y, hw });
      const t = el('text', { x, y, class: 'bub-name' });
      t.textContent = name;
      gLabels.appendChild(t);
      if (g.n < 2) continue;
      const sub = el('text', { x, y: y + 13, class: 'bub-sub' });
      sub.textContent = `${g.n} companies`;
      gLabels.appendChild(sub);
    }
  }

  /** Every step from this company up to whoever holds it now, with the deal
   *  that moved it each time. This is the answer the thread chart made you
   *  trace by eye. */
  function chainOf(id) {
    const out = new Set([id]);
    let cur = id;
    for (let guard = 0; guard < 40; guard++) {
      const d = MERGES.find((x) => x.target === cur && x.year <= year);
      if (!d) break;
      cur = d.acquirer;
      out.add(cur);
    }
    return out;
  }

  function chainSteps(id) {
    const steps = [];
    let cur = id;
    for (let guard = 0; guard < 40; guard++) {
      const d = MERGES.find((x) => x.target === cur && x.year <= year);
      if (!d) break;
      steps.push({ from: cur, deal: d });
      cur = d.acquirer;
    }
    return { steps, owner: cur };
  }

  /* ------------------------------------------------------------- events -- */

  function nodeAt(evt) {
    const b = svg.getBoundingClientRect();
    const mx = evt.clientX - b.left - W / 2;
    const my = evt.clientY - b.top - H / 2;
    let best = null;
    let bd = Infinity;
    for (const n of nodes) {
      if (n.vis < 0.5) continue;
      const d = Math.hypot(mx / scale - n.x, my / scale - n.y);
      if (d < n.r && d < bd) { bd = d; best = n; }
    }
    return best;
  }

  function onMove(evt) {
    const n = nodeAt(evt);
    hovered = n ? n.id : null;
    if (!n) { tip.hidden = true; return; }
    const d = mergedInto.get(n.id);
    const price = PRICE.get(n.id);
    tip.innerHTML = `<b>${finalName(n.id)}</b>`
      + `<span>${yr(n.company.born)}–${d ? yr(d.year) : 'today'}</span>`
      + (d
        ? `<span>Bought by ${nameAt(d.acquirer, d.year)}${price ? ` for ${money(price)}` : ''}</span>`
        : '<span>Still independent</span>');
    tip.hidden = false;
    const b = holder.getBoundingClientRect();
    tip.style.left = `${Math.min(evt.clientX - b.left + 14, b.width - tip.offsetWidth - 8)}px`;
    tip.style.top = `${Math.min(evt.clientY - b.top + 14, b.height - tip.offsetHeight - 8)}px`;
  }

  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerleave', () => { hovered = null; tip.hidden = true; });
  svg.addEventListener('click', (evt) => {
    const n = nodeAt(evt);
    select(n ? n.id : null);
  });

  /* --------------------------------------------------------------- loop -- */

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (playing) {
      year += dt * 4.2;
      if (year >= END_YEAR) { year = END_YEAR; playing = false; emit('year', year); }
      emit('year', year);
    }
    step(dt);
  }

  function resize() {
    W = Math.max(260, holder.clientWidth || 900);
    H = Math.max(440, Math.min(700, Math.round(W * 0.6)));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
  }

  resize();
  // Settle the opening frame so the first paint is not a scatter.
  for (let i = 0; i < 90; i++) step(0.05);
  last = performance.now();
  raf = requestAnimationFrame(frame);

  /** The detail card: the whole ownership chain, in one place. */
  function select(id) {
    selected = id;
    const panel = root.querySelector('#bub-detail');
    if (!panel) return;
    if (!id) { panel.hidden = true; panel.replaceChildren(); return; }
    const { steps, owner } = chainSteps(id);
    const c = byId.get(id);
    const bits = [`<button class="bub-close" type="button" aria-label="Clear selection">×</button>`
      + `<h4>${finalName(id)}</h4>`
      + `<p class="bub-meta">${yr(c.born)}–${
        steps.length ? yr(steps[0].deal.year) : 'today'}</p>`];
    if (!steps.length) {
      bits.push('<p class="bub-none">Never acquired — still its own company in '
        + `${yr(year)}.</p>`);
    } else {
      bits.push('<ol class="bub-chain">' + steps.map((s2) =>
        `<li><span class="bub-step-year">${yr(s2.deal.year)}</span>`
        + `<span class="bub-step-body"><b>${nameAt(s2.deal.acquirer, s2.deal.year)}</b> buys `
        + `${nameAt(s2.from, s2.deal.year)}${s2.deal.valueB ? ` · ${money(s2.deal.valueB)}` : ''}</span></li>`
      ).join('') + '</ol>');
      bits.push(`<p class="bub-now">Inside <b>${finalName(owner)}</b> today.</p>`);
    }
    panel.innerHTML = bits.join('');
    panel.hidden = false;
    panel.querySelector('.bub-close').addEventListener('click', () => select(null));
  }

  return {
    resize,
    select,
    get selected() { return selected; },
    setFilter(fn) { filter = fn; },
    setYear(y) { year = Math.max(START_YEAR, Math.min(END_YEAR, y)); },
    get year() { return year; },
    play() { if (year >= END_YEAR) year = START_YEAR; playing = true; },
    pause() { playing = false; },
    get playing() { return playing; },
    on(k, fn) { listeners[k].push(fn); },
    destroy() { cancelAnimationFrame(raf); holder.replaceChildren(); },
  };
}
