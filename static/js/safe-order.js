// ===== CHANGE ORDER (Safe Count page, directors) =====
// Aaliyah orders the change fund's bills and coin from the bank (Tim, Oct
// 20 2026). The leaders' counts already say how many of each bill and roll
// the safe holds; this card turns them into her order:
//  - On hand: the latest count, per bill and coin roll.
//  - Par: what a full safe should hold of each, set once (safeOrderSettings,
//    manager section; a suggestion is the most the last four weeks held).
//  - Order: par minus on hand, rounded up to how the bank sells it (straps,
//    rolls, boxes: "order in multiples of", also set once).
//  - Lasts: how fast each runs down, from the counts' drops over the last
//    four weeks, and the day it would run out at that pace. A stretch
//    between two counts where it rose (an order or a swap came in) hides
//    that stretch's use, so it's left out: its days as well as its change.
// Copy order puts the order in words on the clipboard for the bank.

const SO_ITEMS = [
  {key: '1', label: '$1', unit: 'bill', value: 1},
  {key: '5', label: '$5', unit: 'bill', value: 5},
  {key: '10', label: '$10', unit: 'bill', value: 10},
  {key: '20', label: '$20', unit: 'bill', value: 20},
  {key: '50', label: '$50', unit: 'bill', value: 50},
  {key: '100', label: '$100', unit: 'bill', value: 100},
  {key: 'Quarters', label: 'Quarters', unit: 'roll', value: 10},
  {key: 'Dimes', label: 'Dimes', unit: 'roll', value: 5},
  {key: 'Nickels', label: 'Nickels', unit: 'roll', value: 2}
];
const SO_WINDOW_DAYS = 28;
const SO_DAY_MS = 86400000;
let soEditing = false;

// How many of an item a count holds (bills from the dollar amounts, or the
// older bill counts; coin in rolls). null when the count didn't record it.
function soHeld(entry, item){
  if(!entry) return null;
  if(item.unit === 'roll'){
    if(!entry.coinRolls || typeof entry.coinRolls !== 'object') return null;
    return Math.max(0, Math.floor(Number(entry.coinRolls[item.key]) || 0));
  }
  if(entry.bills && typeof entry.bills === 'object') return Math.max(0, Math.floor((Number(entry.bills[item.key]) || 0) / item.value));
  if(entry.denoms && typeof entry.denoms === 'object') return Math.max(0, Math.floor(Number(entry.denoms[item.key]) || 0));
  return null;
}

function soCounts(list){
  return (Array.isArray(list) ? list : []).filter(e => e && Number(e.timestamp) > 0).sort((a, b) => a.timestamp - b.timestamp);
}

// Per item: on hand, the pace it runs down (per day) and the most held.
function soModel(list, settings, now){
  const counts = soCounts(list);
  const latest = counts[counts.length - 1] || null;
  const recent = counts.filter(e => e.timestamp >= now - SO_WINDOW_DAYS * SO_DAY_MS);
  const par = (settings && settings.par) || {}, step = (settings && settings.step) || {};
  const rows = SO_ITEMS.map(item => {
    const onHand = soHeld(latest, item);
    let drop = 0, days = 0, stretches = 0, prev = null, most = null;
    recent.forEach(e => {
      const n = soHeld(e, item);
      if(n === null) return;
      if(prev !== null && n <= prev.n){
        drop += prev.n - n;
        days += (e.timestamp - prev.at) / SO_DAY_MS;
        stretches++;
      }
      prev = {n, at: e.timestamp};
      most = most === null ? n : Math.max(most, n);
    });
    // A pace needs a couple of stretches covering at least two days; one
    // that only ever rose (twenties coming in as change goes out) isn't used.
    const perDay = stretches >= 2 && days >= 2 ? drop / days : recent.length >= 3 && !stretches ? 0 : null;
    const p = Number(par[item.key]) > 0 ? Math.floor(Number(par[item.key])) : 0;
    const s = Number(step[item.key]) > 0 ? Math.floor(Number(step[item.key])) : 1;
    const need = onHand === null || !p ? 0 : Math.max(0, p - onHand);
    const order = need ? Math.ceil(need / s) * s : 0;
    const daysLeft = onHand === null || !perDay ? null : onHand / perDay;
    return {...item, onHand, perDay, most, par: p, step: s, order, dollars: order * item.value, daysLeft};
  });
  return {latest, rows, total: rows.reduce((t, r) => t + r.dollars, 0), counts: recent.length};
}

function soMoney(n){ return '$' + Math.round(n).toLocaleString('en-US'); }
function soUnits(n, unit){ return `${n.toLocaleString('en-US')} ${unit}${n === 1 ? '' : 's'}`; }
function soRunsOut(daysLeft, now){
  if(daysLeft === null) return '';
  if(daysLeft < 1) return 'out today';
  const d = new Date(now + daysLeft * SO_DAY_MS);
  return `~${Math.floor(daysLeft)} day${Math.floor(daysLeft) === 1 ? '' : 's'} (${d.toLocaleDateString('en-US', {weekday: 'short'})})`;
}

// The order in words, for the bank.
function soOrderText(m, dateLabel){
  const lines = m.rows.filter(r => r.order).map(r => `${r.label}: ${soUnits(r.order, r.unit)} (${soMoney(r.dollars)})`);
  return lines.length ? `Change order, Chick-fil-A Buda, ${dateLabel}\n${lines.join('\n')}\nTotal: ${soMoney(m.total)}` : '';
}

function renderSafeOrder(){
  const root = document.getElementById('safeOrderRoot');
  if(!root) return;
  if(typeof launchManager === 'undefined' || !launchManager){ root.innerHTML = ''; return; }
  const now = Date.now();
  const m = soModel(safeCounts, safeOrderSettings, now);
  if(!m.latest){
    root.innerHTML = `<section class="so-card"><h3 class="so-title">Change order</h3><p class="so-note">The order sheet fills in once leaders log a safe count.</p></section>`;
    return;
  }
  const at = new Date(m.latest.timestamp);
  const asOf = `${m.latest.shift || 'Count'}, ${at.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'})} ${at.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'})}`;
  const noPars = !m.rows.some(r => r.par);
  const shown = m.rows.filter(r => soEditing || r.par || r.onHand || r.order || r.key === '1' || r.key === '5' || r.unit === 'roll');
  const row = r => {
    const tone = r.daysLeft === null ? '' : r.daysLeft < 3 ? 'is-bad' : r.daysLeft < 7 ? 'is-warn' : 'is-ok';
    const lasts = r.perDay ? `${soRunsOut(r.daysLeft, now)} · uses ~${r.perDay < 10 ? r.perDay.toFixed(1) : Math.round(r.perDay)}/day` : r.perDay === 0 ? 'not running down' : 'not enough counts yet for a pace';
    if(soEditing) return `
      <div class="so-row so-edit">
        <b class="so-label">${escapeHtml(r.label)} <small>${r.unit}s</small></b>
        <label>Par <input type="number" min="0" step="1" inputmode="numeric" data-so-par="${r.key}" value="${r.par || ''}" placeholder="${r.most === null ? '' : r.most}"></label>
        <label>Order in multiples of <input type="number" min="1" step="1" inputmode="numeric" data-so-step="${r.key}" value="${r.step > 1 ? r.step : ''}" placeholder="1"></label>
      </div>`;
    return `
      <div class="so-row">
        <div class="so-main">
          <b class="so-label">${escapeHtml(r.label)}</b>
          <span class="so-have">${r.onHand === null ? 'not counted' : `${soUnits(r.onHand, r.unit)} on hand${r.par ? ` of ${r.par}` : ''}`}</span>
          <span class="so-lasts ${tone}">${escapeHtml(lasts)}</span>
        </div>
        ${r.order ? `<span class="so-order"><b>${soUnits(r.order, r.unit)}</b><small>${soMoney(r.dollars)}</small></span>` : r.par ? '<span class="so-order is-none">Full</span>' : ''}
      </div>`;
  };
  root.innerHTML = `
    <section class="so-card">
      <div class="so-head">
        <div><h3 class="so-title">Change order</h3><p class="so-note">On hand as of the ${escapeHtml(asOf)}${m.latest.countedBy ? `, counted by ${escapeHtml(m.latest.countedBy)}` : ''}.</p></div>
        ${soEditing ? '' : `<div class="so-total"><span>To order</span><b>${soMoney(m.total)}</b></div>`}
      </div>
      ${noPars && !soEditing ? '<p class="so-note so-hint">Set a par for each bill and roll (what a full safe holds) and the order works itself out. <button type="button" class="ld-link" data-so-edit>Set pars</button></p>' : ''}
      <div class="so-list">${shown.map(row).join('')}</div>
      <div class="so-go">
        ${soEditing
          ? `<button type="button" class="btn btn-primary" data-so-save>Save pars</button><button type="button" class="btn btn-ghost" data-so-suggest>Use the most held in ${SO_WINDOW_DAYS} days</button><button type="button" class="ld-link" data-so-cancel>Cancel</button>`
          : `${m.total ? '<button type="button" class="btn btn-primary" data-so-copy>Copy order</button>' : ''}<button type="button" class="btn btn-ghost" data-so-edit>${noPars ? 'Set pars' : 'Edit pars'}</button>`}
      </div>
      <p class="so-note so-foot">Pace and run-out days come from the last ${SO_WINDOW_DAYS} days of counts (${m.counts}). Bills coming in from an order or a swap don't count as use.</p>
    </section>`;
}

document.getElementById('safeOrderRoot').addEventListener('click', async e => {
  const t = e.target.closest('button');
  if(!t) return;
  if(t.hasAttribute('data-so-edit')){ soEditing = true; renderSafeOrder(); return; }
  if(t.hasAttribute('data-so-cancel')){ soEditing = false; renderSafeOrder(); return; }
  if(t.hasAttribute('data-so-suggest')){
    document.querySelectorAll('#safeOrderRoot [data-so-par]').forEach(inp => { if(inp.placeholder !== '') inp.value = inp.placeholder; });
    return;
  }
  if(t.hasAttribute('data-so-save')){
    const par = {}, step = {};
    document.querySelectorAll('#safeOrderRoot [data-so-par]').forEach(inp => { const n = Math.floor(Number(inp.value)); if(n > 0) par[inp.dataset.soPar] = n; });
    document.querySelectorAll('#safeOrderRoot [data-so-step]').forEach(inp => { const n = Math.floor(Number(inp.value)); if(n > 1) step[inp.dataset.soStep] = n; });
    safeOrderSettings = {par, step};
    soEditing = false;
    renderSafeOrder();
    await saveState();
    showToast('Pars saved');
    return;
  }
  if(t.hasAttribute('data-so-copy')){
    const m = soModel(safeCounts, safeOrderSettings, Date.now());
    const text = soOrderText(m, new Date().toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'}));
    try{ await navigator.clipboard.writeText(text); showToast('Order copied'); }
    catch(err){ prompt('Copy the order:', text); }
  }
});
