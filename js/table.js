// The deal ledger — every transaction as readable text, filterable and sortable.
// This is the table-view twin of the lineage chart: nothing is locked behind a
// hover, and every value in the visualization is also written out here.

import { DEALS, byId, nameAt, money, yr, DEAL_KIND, SECTORS } from './model.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MAX_VALUE = DEALS.reduce((m, d) => Math.max(m, d.valueB || 0), 0);

export function parties(d) {
  const target = d.target ? nameAt(d.target, d.year) : null;
  const acquirer = d.acquirer ? nameAt(d.acquirer, d.year) : d.buyer || null;
  switch (d.type) {
    case 'split':
      return d.target ? `${target} splits apart` : `Spun out of AT&T`;
    case 'external':
      return d.buyer ? `${d.buyer} → ${target}` : `${target}`;
    case 'asset':
      return `${target} → ${acquirer} (part of the business)`;
    case 'failed':
      return `${acquirer} ✕ ${target}`;
    default:
      return acquirer && target ? `${acquirer} → ${target}` : target || '';
  }
}

function sectorOf(d) {
  const c = byId.get(d.target) || byId.get(d.acquirer);
  return c ? c.sector : null;
}

export const ROWS = DEALS.map((d) => {
  const sector = sectorOf(d);
  return {
    deal: d,
    sector,
    parties: parties(d),
    haystack: [d.title, d.note, parties(d), sector && SECTORS[sector].name].filter(Boolean).join(' ').toLowerCase(),
  };
});

export function renderRows(rows) {
  if (!rows.length) return `<p class="ledger-empty">No deals match that filter.</p>`;
  return rows.map(({ deal: d, parties: p }) => {
    const kind = DEAL_KIND[d.type];
    const pct = d.valueB ? Math.max(1.5, (d.valueB / MAX_VALUE) * 100) : 0;
    return `<li class="row row--${d.type}">
      <button class="row-main" type="button" aria-expanded="false">
        <span class="row-year">${yr(d.year)}</span>
        <span class="row-body">
          <span class="row-title">${esc(d.title)}</span>
          <span class="row-parties">${esc(p)}</span>
        </span>
        <span class="row-kind" data-kind="${d.type}">${d.type === 'failed' ? '✕ ' : d.type === 'pending' ? '◌ ' : ''}${esc(kind.label)}</span>
        <span class="row-track">${pct ? `<span class="row-value-bar" style="width:${pct.toFixed(1)}%"></span>` : ''}</span>
        <span class="row-value">${money(d.valueB)}</span>
      </button>
      ${d.note ? `<div class="row-note" hidden><p>${esc(d.note)}</p><p class="row-note-meta">${esc(kind.blurb)}.</p></div>` : ''}
    </li>`;
  }).join('');
}

export function filterRows({ query = '', type = 'all', sector = 'all', sort = 'year' } = {}) {
  const q = query.trim().toLowerCase();
  let out = ROWS.filter((r) => {
    if (type === 'closed' && !(r.deal.type === 'merge' || r.deal.type === 'asset' || r.deal.type === 'external' || r.deal.type === 'split')) return false;
    if (type !== 'all' && type !== 'closed' && r.deal.type !== type) return false;
    if (sector !== 'all' && r.sector !== sector) return false;
    if (q && !r.haystack.includes(q)) return false;
    return true;
  });
  if (sort === 'value') out = [...out].sort((a, b) => (b.deal.valueB || -1) - (a.deal.valueB || -1));
  else if (sort === 'year-desc') out = [...out].sort((a, b) => b.deal.year - a.deal.year);
  else out = [...out].sort((a, b) => a.deal.year - b.deal.year);
  return out;
}
