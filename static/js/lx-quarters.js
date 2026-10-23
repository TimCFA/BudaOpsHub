// ===== LX BY QUARTER (Tim, Oct 23 2026) =====
// Evaluations score each leader on the quarter just ended, so the LX
// scoreboard keeps every quarter. This quarter is the live board (lxMetrics,
// updating as the uploads come in); when a quarter ends, the first manager
// page after it freezes the board into lxQuarters. OSAT follows the CEM
// uploads for any past quarter they cover (the quarter's total, else its
// months weighted by surveys) unless a manager typed it. A manager can type
// or correct any past quarter's values and statuses. Year to date puts the
// year's quarters side by side, with how many met each standard.
//
// lxQuarters {open: '2026-Q4', quarters: {'2026-Q3': {metrics: [{id, name,
// standard, value, rating, typed, source}], closedAt}}}: its own saved
// section ('lx'), changed only from a manager session like the rest of LX.
// Declared in zone-reset.js with lxMetrics.

let lxQView = 'live';   // 'live' | a quarter ('2026-Q3') | 'ytd'

function lxQuarterOf(iso){
  const [y, m] = String(iso).split('-').map(Number);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}
function lxQuarterBounds(q){
  const y = +q.slice(0, 4), n = +q.slice(6), m0 = (n - 1) * 3 + 1;
  const last = new Date(y, m0 + 2, 0).getDate();
  return {start: `${y}-${String(m0).padStart(2, '0')}-01`, end: `${y}-${String(m0 + 2).padStart(2, '0')}-${last}`, label: `Q${n} ${y}`, short: `Q${n}`};
}
function lxPrevQuarter(q){
  let y = +q.slice(0, 4), n = +q.slice(6) - 1;
  if(!n){ n = 4; y--; }
  return `${y}-Q${n}`;
}
// The four quarters before this one, the latest first.
function lxPastQuarters(){
  const out = [];
  let q = lxQuarterOf(today);
  for(let i = 0; i < 4; i++){ q = lxPrevQuarter(q); out.push(q); }
  return out;
}
function lxRecord(q){ return lxQuarters && lxQuarters.quarters ? lxQuarters.quarters[q] || null : null; }
function lxSnapshot(){ return lxMetrics.map(m => ({id: m.id, name: m.name, standard: m.standard, value: m.value || '', rating: m.rating})); }

// OSAT for a quarter from the CEM uploads, with its top 5%: {osat, top5, n, note} or null.
function lxCemOsat(q){
  if(typeof ctPeriods !== 'function' || typeof ctTotalEntry !== 'function') return null;
  const b = lxQuarterBounds(q);
  const total = p => { const t = ctTotalEntry(p.periodKey); return t && t.scores && t.scores.overall != null ? t : null; };
  const periods = ctPeriods();
  const whole = periods.find(p => p.periodType !== 'month' && p.periodStart === b.start && p.periodEnd === b.end && total(p));
  const top5Of = t => t.benchmark && t.benchmark.overall != null ? t.benchmark.overall : null;
  if(whole){ const t = total(whole); return {osat: t.scores.overall, top5: top5Of(t), n: t.n || null, note: whole.periodLabel}; }
  const months = periods.filter(p => p.periodType === 'month' && p.periodStart >= b.start && p.periodStart <= b.end)
    .map(p => ({p, t: total(p)})).filter(x => x.t);
  if(!months.length) return null;
  const n = months.reduce((s, x) => s + (x.t.n || 1), 0);
  const benched = months.filter(x => top5Of(x.t) != null), bn = benched.reduce((s, x) => s + (x.t.n || 1), 0);
  return {osat: months.reduce((s, x) => s + x.t.scores.overall * (x.t.n || 1), 0) / n,
    top5: bn ? benched.reduce((s, x) => s + top5Of(x.t) * (x.t.n || 1), 0) / bn : null, n, note: `${b.label}, ${months.length} of 3 months`};
}

// On a manager's page: freeze a quarter that's ended, and keep the CEM's
// OSAT on the past quarters. Returns whether anything changed.
function lxQuartersSync(){
  if(!lxQuarters || typeof lxQuarters !== 'object' || Array.isArray(lxQuarters)) lxQuarters = {};
  let changed = false;
  const now = lxQuarterOf(today);
  if(!lxQuarters.quarters){ lxQuarters.quarters = {}; changed = true; }
  if(!lxQuarters.open){ lxQuarters.open = now; changed = true; }
  else if(lxQuarters.open < now){
    if(!lxQuarters.quarters[lxQuarters.open]) lxQuarters.quarters[lxQuarters.open] = {metrics: lxSnapshot(), closedAt: new Date().toISOString()};
    lxQuarters.open = now;
    changed = true;
  }
  lxPastQuarters().forEach(q => {
    const cem = lxCemOsat(q);
    if(!cem) return;
    let rec = lxQuarters.quarters[q];
    if(!rec){ rec = lxQuarters.quarters[q] = {metrics: lxSnapshot().map(m => ({...m, value: '', rating: null}))}; changed = true; }
    const m = rec.metrics.find(x => /osat/i.test(x.name));
    if(!m || m.typed) return;
    // Against the top 5% (Tim, Oct 23 2026: the goal, and the CEM's benchmark).
    const o = {osat: Math.round(cem.osat), top5: cem.top5 != null ? Math.round(cem.top5) : null};
    const value = typeof rpLxOsatValue === 'function' ? rpLxOsatValue(o) : `OSAT ${o.osat}%${o.top5 != null ? ` · top 5% ${o.top5}%` : ''}`;
    const rating = o.top5 == null ? m.rating : o.osat >= o.top5 ? 2 : 1;
    const source = `From the CEM upload: ${cem.note}`;
    const name = typeof RP_LX_OSAT_NAME !== 'undefined' ? RP_LX_OSAT_NAME : 'OSAT · Top 5%', standard = typeof RP_LX_OSAT_STANDARD !== 'undefined' ? RP_LX_OSAT_STANDARD : 'Top 5%';
    if(m.value !== value || m.rating !== rating || m.source !== source || m.name !== name || m.standard !== standard){ Object.assign(m, {value, rating, source, name, standard}); changed = true; }
  });
  return changed;
}

// ----- The scoreboard's quarter bar and the past / year-to-date tables -----
const LX_STATUS = {1: 'Below', 2: 'Meets', 3: 'Exceeding'};
const LX_ICON = {
  1: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/></svg>',
  2: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  3: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>'
};
function lxBadge(r){ return r ? `<span class="rating-badge rating-${r}">${LX_ICON[r]} ${LX_STATUS[r]}</span>` : '<span class="lxq-none">—</span>'; }
function lxCanEdit(){ return typeof launchManager !== 'undefined' && !!launchManager; }

function lxQuarterBarHtml(){
  const now = lxQuarterOf(today);
  const chip = (id, label, sub) => `<button type="button" class="lxq-chip" data-lxq="${id}" aria-pressed="${lxQView === id}">${label}${sub ? `<small>${sub}</small>` : ''}</button>`;
  return `<div class="lxq-bar" role="group" aria-label="Quarter">
    ${chip('live', lxQuarterBounds(now).short, 'live')}
    ${lxPastQuarters().map(q => chip(q, lxQuarterBounds(q).short + (q.slice(0, 4) !== now.slice(0, 4) ? ` ’${q.slice(2, 4)}` : ''), lxRecord(q) ? '' : 'not saved')).join('')}
    ${chip('ytd', 'Year to date', now.slice(0, 4))}
  </div>`;
}

function lxPastTableHtml(q){
  const rec = lxRecord(q), b = lxQuarterBounds(q), edit = lxCanEdit();
  const rows = rec ? rec.metrics : lxSnapshot().map(m => ({...m, value: '', rating: null}));
  const head = rec && rec.closedAt
    ? `Saved from the live board ${new Date(rec.closedAt).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}.`
    : rec ? 'Filled in from the uploads that cover it, and anything typed.' : 'Nothing saved for this quarter yet.';
  return `<p class="lxq-note">${escapeHtml(b.label)} (${escapeHtml(new Date(b.start + 'T12:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'}))} – ${escapeHtml(new Date(b.end + 'T12:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'}))}). ${head}${edit ? ' Type a value or pick a status to correct it.' : ''}</p>
    <div class="lxq-scroll"><table class="metrics-table lxq-past">
      <thead><tr><th>Business Metrics</th><th>Standard</th><th>${escapeHtml(b.short)} Value</th><th>Status</th></tr></thead>
      <tbody>${rows.map((m, i) => `
        <tr>
          <td class="metric-name">${escapeHtml(m.name)}${m.source && !m.typed ? `<small class="lxq-src">${escapeHtml(m.source)}</small>` : ''}${m.typed ? '<small class="lxq-src">Typed by a manager</small>' : ''}</td>
          <td>${escapeHtml(m.standard)}</td>
          <td>${edit ? `<input type="text" class="lxq-input" data-lxq-val="${i}" data-lxq-q="${escapeHtml(q)}" value="${escapeHtml(m.value || '')}" placeholder="—" aria-label="${escapeHtml(m.name)} for ${escapeHtml(b.short)}">` : `<span class="metric-value">${escapeHtml(m.value || '—')}</span>`}</td>
          <td>${edit ? `<select class="lxq-select" data-lxq-rating="${i}" data-lxq-q="${escapeHtml(q)}" aria-label="${escapeHtml(m.name)} status for ${escapeHtml(b.short)}">
              <option value="" ${!m.rating ? 'selected' : ''}>—</option>${[1, 2, 3].map(r => `<option value="${r}" ${m.rating === r ? 'selected' : ''}>${LX_STATUS[r]}</option>`).join('')}</select>` : lxBadge(m.rating)}</td>
        </tr>`).join('')}</tbody>
    </table></div>`;
}

function lxYtdHtml(){
  const now = lxQuarterOf(today), y = now.slice(0, 4);
  const qs = [1, 2, 3, 4].map(n => `${y}-Q${n}`).filter(q => q <= now);
  const cell = (q, m) => {
    if(q === now) return m;
    const rec = lxRecord(q);
    return rec ? (rec.metrics.find(x => x.id === m.id) || rec.metrics.find(x => x.name === m.name) || null) : null;
  };
  const rows = lxMetrics.map(m => {
    const cells = qs.map(q => cell(q, m));
    // A status with no value (the live board's default) isn't a result yet.
    const rated = cells.filter(c => c && c.rating && String(c.value || '').trim());
    const met = rated.filter(c => c.rating >= 2).length;
    return `<tr>
      <td class="metric-name">${escapeHtml(m.name)}<small class="lxq-src">${escapeHtml(m.standard)}</small></td>
      ${cells.map(c => { const r = c && c.rating && String(c.value || '').trim() ? c.rating : null; return `<td class="lxq-cell ${r ? `is-r${r}` : ''}">${c && c.value ? escapeHtml(c.value) : '—'}${r ? `<small>${LX_ICON[r]} ${LX_STATUS[r]}</small>` : ''}</td>`; }).join('')}
      <td class="lxq-met">${rated.length ? `<b>${met} of ${rated.length}</b><small>met</small>` : '—'}</td>
    </tr>`;
  }).join('');
  return `<p class="lxq-note">${escapeHtml(y)} so far, quarter by quarter. ${escapeHtml(lxQuarterBounds(now).short)} is live and still moving.</p>
    <div class="lxq-scroll"><table class="metrics-table lxq-ytd">
      <thead><tr><th>Business Metrics</th>${qs.map(q => `<th>${escapeHtml(lxQuarterBounds(q).short)}${q === now ? ' <small>live</small>' : ''}</th>`).join('')}<th>Met</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

// The quarter bar, and the past quarter or year to date in place of the live
// table. → whether it took over the table (false: the live board shows).
function lxRenderQuarterView(){
  const bar = document.getElementById('lxQuarterBar'), past = document.getElementById('lxQuarterRoot');
  if(!bar || !past) return false;
  if(lxQView !== 'live' && lxQView !== 'ytd' && !lxPastQuarters().includes(lxQView)) lxQView = 'live';
  bar.innerHTML = lxQuarterBarHtml();
  const live = lxQView === 'live';
  past.hidden = live;
  document.getElementById('lxLiveRoot').hidden = !live;
  if(!live) past.innerHTML = lxQView === 'ytd' ? lxYtdHtml() : lxPastTableHtml(lxQView);
  return !live;
}

document.addEventListener('click', e => {
  const chip = e.target.closest && e.target.closest('[data-lxq]');
  if(!chip) return;
  lxQView = chip.dataset.lxq;
  renderLXScoreboard();
});
// A manager's correction to a past quarter: kept, and marked as typed so the
// uploads never overwrite it.
document.addEventListener('change', e => {
  const el = e.target;
  if(!el || !el.dataset || !el.dataset.lxqQ || !lxCanEdit()) return;
  const q = el.dataset.lxqQ;
  lxQuarters.quarters = lxQuarters.quarters || {};
  const rec = lxQuarters.quarters[q] = lxQuarters.quarters[q] || {metrics: lxSnapshot().map(m => ({...m, value: '', rating: null}))};
  const i = +(el.dataset.lxqVal ?? el.dataset.lxqRating);
  const m = rec.metrics[i];
  if(!m) return;
  if(el.dataset.lxqVal !== undefined) m.value = el.value.trim();
  else m.rating = el.value ? +el.value : null;
  m.typed = true;
  saveState();
  renderLXScoreboard();
  showToast(`${lxQuarterBounds(q).short}: ${m.name} saved`);
});
