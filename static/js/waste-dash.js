// ===== WASTE DASHBOARD + SUMMARY (managers) =====
// The tracker's Dashboard and Summary pages, on the Scoreboard tab's Waste
// panel for manager sessions: any date range, totals, the top 10 items,
// waste by category, by day and by Ops Hub daypart; a per-item summary that
// opens to its entries (each can be deleted), and a CSV export of the range.
//
// The server sends the full log (90 days) to manager sessions only; team
// devices get recent entries, enough for the tracker's counts. Entries
// older than WASTE_KEEP_DAYS are pruned here, by a manager, on render.

const WASTE_KEEP_DAYS = 90;
const WD_PIE = ['#c9541a', '#1b9a82', '#5b4bd6', '#d97a1d', '#c026d3', '#2f5bd8', '#d4a017', '#b91c3c', '#2e8b3d', '#6b7280', '#e08a99', '#14907f'];
const WD_PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7', 'Last 7 days'], ['14', 'Last 14 days'], ['30', 'Last 30 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['custom', 'Custom range…']];
let wdPreset = '7', wdFrom = '', wdTo = '', wdLoc = 'all';
let wdQuery = '', wdCat = 'All', wdSort = 'cost', wdOpen = null;
let wdFix = null;          // the entry being corrected: its key (id or ts)

// Correct an entry logged as the wrong item (Tim, Oct 20 2026: 167 logged as
// 5 Count Nugget boxes were 167 single nuggets). Its day, time, quantity and
// who logged it stay; the item and the cost change, and the entry keeps what
// it was before and who corrected it.
function wdFixOptions(en){
  const words = String(en.name || '').toLowerCase().replace(/\b\d+\b|\bcount\b|\bct\b/g, ' ').split(/\s+/).filter(w => w.length > 2);
  const all = (Array.isArray(products) ? products : []).filter(p => p && p.id && p.name).sort((a, b) => a.name.localeCompare(b.name));
  const near = all.filter(p => p.id !== en.prodId && words.some(w => p.name.toLowerCase().includes(w)));
  const opt = p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} · $${Number(p.cost || 0).toFixed(2)}/${escapeHtml(p.unit || 'ea')}</option>`;
  return `<option value="">Pick the right item…</option>${near.length ? `<optgroup label="Similar">${near.map(opt).join('')}</optgroup>` : ''}<optgroup label="All items">${all.filter(p => p.id !== en.prodId).map(opt).join('')}</optgroup>`;
}
function wdFixHtml(en){
  return `<div class="wd-fix" data-wd-fix-row="${escapeHtml(String(en.id || en.ts))}">
    <label>Should have been <select data-wd-fix-prod>${wdFixOptions(en)}</select></label>
    <label>Quantity <input type="number" min="1" step="1" inputmode="numeric" data-wd-fix-qty value="${escapeHtml(en.qty)}"></label>
    <div class="wd-fix-go"><button type="button" class="btn btn-primary" data-wd-fix-save>Save the correction</button><button type="button" class="btn btn-ghost" data-wd-fix-cancel>Cancel</button></div>
  </div>`;
}

// ---------- pure helpers (tests/test_waste_dash.py runs these) ----------

function wdRange(preset, from, to, now){
  const t = toLocalISODate(now || new Date());
  const d = n => isoAddDays(t, n);
  const base = new Date(t + 'T00:00:00');
  const first = (y, m) => toLocalISODate(new Date(y, m, 1));
  switch(preset){
    case 'today': return [t, t];
    case 'yesterday': return [d(-1), d(-1)];
    case '14': return [d(-13), t];
    case '30': return [d(-29), t];
    case 'month': return [first(base.getFullYear(), base.getMonth()), t];
    case 'lastmonth': return [first(base.getFullYear(), base.getMonth() - 1), toLocalISODate(new Date(base.getFullYear(), base.getMonth(), 0))];
    case 'custom': { let f = from || t, e = to || t; if(f > e){ const x = f; f = e; e = x; } return [f, e]; }
    default: return [d(-6), t];
  }
}

function wdDays(from, to){
  const out = [];
  for(let d = from; d <= to && out.length < 400; d = isoAddDays(d, 1)) out.push(d);
  return out;
}

// Which Ops Hub daypart an entry falls in (FOH windows, Transition folded
// into Lunch): 'Before open', then Early Breakfast … Close.
function wdDayparts(){
  return [{name: 'Before open', start: 0}].concat(fohDayparts.filter(dp => !/transition/i.test(dp.name)).map(dp => {
    const [h, m] = dp.time.split(':').map(Number);
    return {name: dp.name.replace(/\s*\(.*\)$/, ''), start: h * 60 + m};
  }));
}
function wdDaypartOf(ts){
  const t = new Date(ts), m = t.getHours() * 60 + t.getMinutes();
  let cur = 'Before open';
  wdDayparts().forEach(dp => { if(m >= dp.start) cur = dp.name; });
  return cur;
}

function wdEntriesIn(range, loc){
  return entries.filter(e => { const day = wasteEntryDay(e); return day >= range[0] && day <= range[1] && (loc === 'all' || e.section === loc); });
}

function wdAggregate(rows){
  const byItem = {}, byCat = {}, byDay = {}, byPart = {};
  let total = 0, units = 0;
  rows.forEach(e => {
    const it = wasteItemFor(e), c = Number(e.cost) || 0, q = Number(e.qty) || 0;
    total += c; units += q;
    const b = byItem[it.id] || (byItem[it.id] = {id: it.id, it, qty: 0, cost: 0, entries: []});
    b.qty += q; b.cost += c; b.entries.push(e);
    byCat[it.cat] = (byCat[it.cat] || 0) + c;
    const day = wasteEntryDay(e); byDay[day] = (byDay[day] || 0) + c;
    const part = wdDaypartOf(e.ts); byPart[part] = (byPart[part] || 0) + c;
  });
  return {byItem, byCat, byDay, byPart, total, units};
}

function wdCsv(rows){
  const cell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const out = [['Date', 'Time', 'Location', 'Item', 'Category', 'Qty', 'Unit', 'Unit cost', 'Total', 'Initials'].join(',')];
  rows.slice().sort((a, b) => a.ts - b.ts).forEach(e => {
    const it = wasteItemFor(e), d = new Date(e.ts);
    out.push([wasteEntryDay(e), String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), String(e.section || '').toUpperCase(),
      it.name, it.cat, e.qty, e.unit || it.unit, (Number(e.unitCost) || 0).toFixed(2), (Number(e.cost) || 0).toFixed(2), e.who || ''].map(cell).join(','));
  });
  return out.join('\n');
}

// Entries older than WASTE_KEEP_DAYS go; true when any did.
function wastePruneOld(keepDays, now){
  const cutoff = isoAddDays(toLocalISODate(now || new Date()), -(keepDays || WASTE_KEEP_DAYS));
  const before = entries.length;
  entries = entries.filter(e => wasteEntryDay(e) >= cutoff);
  return entries.length !== before;
}

// ---------- rendering ----------

const wdMoney = n => '$' + (Number(n) || 0).toFixed(2);
const wdMoney0 = n => '$' + Math.round(Number(n) || 0);
function wdShortDay(iso){ const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('en-US', {weekday: 'short'}) + ' ' + (d.getMonth() + 1) + '/' + d.getDate(); }

// Each bar is its share of the total (Tim, Oct 20 2026: scaled to the
// biggest, the top day or daypart always read as a full bar), with the share.
function wdBars(rows, wide){
  const total = rows.reduce((s, r) => s + Math.max(0, r.value), 0);
  return rows.map(r => {
    const share = total > 0 && r.value > 0 ? r.value / total * 100 : 0;
    return `<div class="wd-bar-row ${wide ? 'is-wide' : ''}"><div class="wd-bar-label">${escapeHtml(r.label)}</div>
    <div class="wd-bar-track"><div class="wd-bar-fill" style="width:${share ? Math.max(1, share).toFixed(1) : 0}%"></div></div>
    <div class="wd-bar-val">${wdMoney0(r.value)}${share ? ` <small>${Math.round(share)}%</small>` : ''}</div></div>`;
  }).join('');
}

function wdDonut(parts, total){
  const R = 70, C = 2 * Math.PI * R;
  let off = 0;
  const segs = total > 0 ? parts.map(p => {
    const len = p.value / total * C;
    const s = `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${p.color}" stroke-width="28" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 100 100)"/>`;
    off += len; return s;
  }).join('') : `<circle cx="100" cy="100" r="${R}" fill="none" stroke="var(--border)" stroke-width="28"/>`;
  return `<svg viewBox="0 0 200 200" class="wd-donut" role="img" aria-label="Waste by category">${segs}
    <text x="100" y="96" text-anchor="middle" class="wd-d-sub">Total</text>
    <text x="100" y="120" text-anchor="middle" class="wd-d-val">${wdMoney0(total)}</text></svg>`;
}

function wdRangeBarHtml(range){
  return `<div class="wd-rbar">
    <label>Date range<select data-wd-preset>${WD_PRESETS.map(p => `<option value="${p[0]}" ${wdPreset === p[0] ? 'selected' : ''}>${p[1]}</option>`).join('')}</select></label>
    ${wdPreset === 'custom' ? `<label>From<input type="date" data-wd-from value="${range[0]}"></label><label>To<input type="date" data-wd-to value="${range[1]}"></label>` : ''}
    <label>Location<select data-wd-loc><option value="all" ${wdLoc === 'all' ? 'selected' : ''}>FOH + BOH</option><option value="foh" ${wdLoc === 'foh' ? 'selected' : ''}>FOH</option><option value="boh" ${wdLoc === 'boh' ? 'selected' : ''}>BOH</option></select></label>
    <span class="wd-spacer"></span>
    <button type="button" class="wd-pill" data-wd-export>Export CSV</button>
  </div>`;
}

function renderWasteDashboard(){
  const root = document.getElementById('wasteDashRoot');
  if(!root) return;
  if(typeof launchManager === 'undefined' || !launchManager){ root.innerHTML = ''; return; }
  if(wastePruneOld()) saveState();

  const range = wdRange(wdPreset, wdFrom, wdTo);
  const rows = wdEntriesIn(range, wdLoc);
  const A = wdAggregate(rows);
  const days = wdDays(range[0], range[1] > today ? today : range[1]).length || 1;
  const top = Object.values(A.byItem).sort((a, b) => b.cost - a.cost).slice(0, 10);
  const cats = Object.keys(A.byCat).map(c => ({label: c, value: A.byCat[c]})).sort((a, b) => b.value - a.value).map((c, i) => ({...c, color: WD_PIE[i % WD_PIE.length]}));
  const dl = wdDays(range[0], range[1]);
  let dayRows;
  if(dl.length <= 45) dayRows = dl.map(d => ({label: wdShortDay(d), value: A.byDay[d] || 0}));
  else {
    const wk = {};
    dl.forEach(d => { const dt = new Date(d + 'T00:00:00'); const mon = isoAddDays(d, -((dt.getDay() + 6) % 7)); wk[mon] = (wk[mon] || 0) + (A.byDay[d] || 0); });
    dayRows = Object.keys(wk).sort().map(m => { const dt = new Date(m + 'T00:00:00'); return {label: 'Wk of ' + (dt.getMonth() + 1) + '/' + dt.getDate(), value: wk[m]}; });
  }
  const partRows = wdDayparts().map(p => ({label: p.name, value: A.byPart[p.name] || 0})).filter(r => r.value > 0 || r.label !== 'Before open');

  // Summary list
  const q = wdQuery.trim().toLowerCase();
  const sumCats = ['All', ...wasteCategories(Object.values(A.byItem).map(b => b.it))];
  let list = Object.values(A.byItem).filter(b => (wdCat === 'All' || b.it.cat === wdCat) && (!q || b.it.name.toLowerCase().includes(q) || b.it.cat.toLowerCase().includes(q)));
  list.sort((a, b) => wdSort === 'name' ? a.it.name.localeCompare(b.it.name, undefined, {numeric: true, sensitivity: 'base'}) : wdSort === 'qty' ? b.qty - a.qty : b.cost - a.cost);
  const shown = list.reduce((s, b) => s + b.cost, 0);

  root.innerHTML = `
    <div class="standup-card wd-card">
      <h3>Waste Dashboard</h3>
      ${wdRangeBarHtml(range)}
      <div class="wd-stats">
        <div class="wd-stat"><div class="l">Total waste</div><div class="v">${wdMoney(A.total)}</div></div>
        <div class="wd-stat"><div class="l">Average per day</div><div class="v">${wdMoney(A.total / days)}</div></div>
        <div class="wd-stat"><div class="l">Units wasted</div><div class="v">${A.units.toLocaleString('en-US')}</div></div>
      </div>
      <div class="wd-cols">
        <div class="wd-box"><h4>Top 10 wasted items</h4>
          ${top.length ? top.map(t => `<div class="wd-row"><span class="wd-dot" style="--c:${wasteItemColor(t.it)}"></span><span class="wd-nm">${escapeHtml(t.it.name)}</span><span class="wd-q">Qty ${t.qty}</span><span class="wd-m">${wdMoney(t.cost)}</span></div>`).join('') : '<div class="wd-empty">Nothing logged in this range.</div>'}
        </div>
        <div class="wd-box"><h4>Waste by category</h4>
          <div class="wd-donut-wrap">${wdDonut(cats, A.total)}
            <div class="wd-legend">${cats.map(c => `<div class="wd-row"><span class="wd-dot" style="--c:${c.color}"></span><span class="wd-nm">${escapeHtml(c.label)}</span><span class="wd-m">${wdMoney(c.value)}</span><span class="wd-q wd-pct">${A.total ? Math.round(c.value / A.total * 100) : 0}%</span></div>`).join('')}</div>
          </div>
        </div>
        <div class="wd-box"><h4>Waste by day <small>share of the total</small></h4>${wdBars(dayRows, true)}</div>
        <div class="wd-box"><h4>Waste by daypart <small>share of the total</small></h4>${wdBars(partRows)}<div class="wd-note">Ops Hub dayparts (FOH windows; Transition counts in Lunch).</div></div>
      </div>
    </div>
    <div class="standup-card wd-card">
      <h3>Waste Summary <span class="wd-h-total">${wdMoney(shown)}</span></h3>
      <div class="wd-sumtop">
        <input type="search" class="wd-search" data-wd-q placeholder="Search items or categories" value="${escapeHtml(wdQuery)}" autocomplete="off" aria-label="Search">
        <select data-wd-cat aria-label="Category">${sumCats.map(c => `<option value="${escapeHtml(c)}" ${wdCat === c ? 'selected' : ''}>${c === 'All' ? 'All categories' : escapeHtml(c)}</option>`).join('')}</select>
        <select data-wd-sort aria-label="Sort"><option value="cost" ${wdSort === 'cost' ? 'selected' : ''}>$ high → low</option><option value="qty" ${wdSort === 'qty' ? 'selected' : ''}>Quantity</option><option value="name" ${wdSort === 'name' ? 'selected' : ''}>Name</option></select>
      </div>
      <div class="wd-list">${list.length ? list.map(b => {
        const open = wdOpen === b.id;
        const ent = !open ? '' : `<div class="wd-entries">${b.entries.slice().sort((x, y) => y.ts - x.ts).map(e => {
          const when = new Date(e.ts).toLocaleString('en-US', {weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit'});
          const key = String(e.id || e.ts);
          const fixed = e.fixed && e.fixed.from ? ` · corrected from ${escapeHtml(e.fixed.from.name)}${e.fixed.by ? ' by ' + escapeHtml(e.fixed.by) : ''}` : '';
          return `<div class="wd-entry"><span>${escapeHtml(when)} · ${escapeHtml(String(e.section || '').toUpperCase())}${e.who ? ' · ' + escapeHtml(e.who) : ''} · ${escapeHtml(e.qty)} ${escapeHtml(e.unit || b.it.unit)} · ${wdMoney(e.cost)}${fixed}</span>
            <span class="wd-entry-go"><button type="button" class="wd-entry-fix" data-wd-fix="${escapeHtml(key)}">Change item</button><button type="button" data-wd-del="${escapeHtml(key)}" aria-label="Delete entry">×</button></span></div>${wdFix === key ? wdFixHtml(e) : ''}`;
        }).join('')}</div>`;
        return `<div class="wd-srow"><button type="button" class="wd-srow-btn" data-wd-open="${escapeHtml(b.id)}" aria-expanded="${open}">
          <span class="wd-dot" style="--c:${wasteItemColor(b.it)}"></span>
          <span class="wd-nm"><b>${escapeHtml(b.it.name)}</b><span>${escapeHtml(b.it.cat)}${b.it.legacy ? ' · old item' : ''}</span></span>
          <span class="wd-q">${b.qty} ${escapeHtml(b.it.unit)}</span><span class="wd-m">${wdMoney(b.cost)}</span></button>${ent}</div>`;
      }).join('') : '<div class="wd-empty">Nothing logged for this range.</div>'}</div>
    </div>`;
}

function wdExport(){
  const range = wdRange(wdPreset, wdFrom, wdTo);
  const blob = new Blob([wdCsv(wdEntriesIn(range, wdLoc))], {type: 'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `waste-log_${range[0]}_to_${range[1]}${wdLoc === 'all' ? '' : '_' + wdLoc}.csv`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

(function(){
  const root = document.getElementById('wasteDashRoot');
  if(!root) return;
  root.addEventListener('change', e => {
    const t = e.target;
    if(t.matches('[data-wd-preset]')) wdPreset = t.value;
    else if(t.matches('[data-wd-from]')) wdFrom = t.value;
    else if(t.matches('[data-wd-to]')) wdTo = t.value;
    else if(t.matches('[data-wd-loc]')) wdLoc = t.value;
    else if(t.matches('[data-wd-cat]')) wdCat = t.value;
    else if(t.matches('[data-wd-sort]')) wdSort = t.value;
    else return;
    renderWasteDashboard();
  });
  root.addEventListener('input', e => {
    if(!e.target.matches('[data-wd-q]')) return;
    wdQuery = e.target.value;
    renderWasteDashboard();
    const s = root.querySelector('[data-wd-q]');
    if(s){ s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  });
  root.addEventListener('click', async e => {
    if(e.target.closest('[data-wd-export]')){ wdExport(); return; }
    const open = e.target.closest('[data-wd-open]');
    if(open){ wdOpen = wdOpen === open.dataset.wdOpen ? null : open.dataset.wdOpen; wdFix = null; renderWasteDashboard(); return; }
    const fix = e.target.closest('[data-wd-fix]');
    if(fix){ wdFix = wdFix === fix.dataset.wdFix ? null : fix.dataset.wdFix; renderWasteDashboard(); return; }
    if(e.target.closest('[data-wd-fix-cancel]')){ wdFix = null; renderWasteDashboard(); return; }
    if(e.target.closest('[data-wd-fix-save]')){
      const row = e.target.closest('[data-wd-fix-row]');
      const en = entries.find(x => String(x.id || x.ts) === row.dataset.wdFixRow);
      const p = (products || []).find(x => x.id === row.querySelector('[data-wd-fix-prod]').value);
      const qty = Math.floor(Number(row.querySelector('[data-wd-fix-qty]').value));
      if(!en) return;
      if(!p){ showToast('Pick the item it should have been'); return; }
      if(!(qty > 0)){ showToast('Enter the quantity'); return; }
      const cost = Math.round(qty * (Number(p.cost) || 0) * 100) / 100;
      if(!confirm(`Change ${en.qty} ${en.unit || ''} ${en.name} (${wdMoney(en.cost)}) to ${qty} ${p.unit || ''} ${p.name} (${wdMoney(cost)})? It stays on ${new Date(en.ts).toLocaleDateString('en-US', {weekday: 'short', month: 'numeric', day: 'numeric'})}.`)) return;
      const by = (typeof acUser !== 'undefined' && acUser && acUser.name) || (typeof getInitials === 'function' ? getInitials() : '') || 'Director';
      en.fixed = {from: {name: en.name, prodId: en.prodId, qty: en.qty, cost: en.cost}, by, at: Date.now()};
      Object.assign(en, {name: p.name, prodId: p.id, unit: p.unit, unitCost: Number(p.cost) || 0, qty, cost});
      wdFix = null;
      wdOpen = p.id;
      syncTodayWasteDay();
      renderGrid(); renderTape(); renderScoreboardView(); renderWasteDashboard();
      await saveState();
      showToast(`Corrected: now ${qty} ${p.name}`);
      return;
    }
    const del = e.target.closest('[data-wd-del]');
    if(del){
      const key = del.dataset.wdDel;
      const i = entries.findIndex(x => String(x.id || x.ts) === key);
      if(i === -1) return;
      const en = entries[i];
      if(!confirm(`Delete this entry? ${en.qty} ${en.unit || ''} ${en.name} · ${wdMoney(en.cost)}. This can’t be undone.`)) return;
      entries.splice(i, 1);
      syncTodayWasteDay();
      renderGrid(); renderTape(); renderScoreboardView();
      await saveState();
      showToast('Entry deleted');
    }
  });
})();
