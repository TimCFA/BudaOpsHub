// ===== CHANGE ORDER (Safe Count page, directors) =====
// Aaliyah orders the change fund's bills and coin from the bank (Tim, Oct
// 20 2026). The leaders' counts already say how many of each bill and roll
// the safe holds; this card turns them into her order:
//  - On hand: the latest count, per bill and coin roll.
//  - Build-to: the dollars of each the change fund should hold: the store's
//    sheet (SO_BUILD_TO_STORE) until a director saves others on the card
//    (safeOrderSettings, manager section).
//  - At delivery: what will be left when the order arrives, using the pace
//    below over the days from ordering to delivery (also set once; Tim,
//    Oct 20 2026: the bills keep going out while the order is on its way).
//  - Order: build-to minus what's left at delivery, rounded up to how the
//    bank sells it (straps, rolls, boxes: "order in multiples of").
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
  {key: 'Nickels', label: 'Nickels', unit: 'roll', value: 2},
  {key: 'Dimes', label: 'Dimes', unit: 'roll', value: 5},
  {key: 'Quarters', label: 'Quarters', unit: 'roll', value: 10}
];
const SO_WINDOW_DAYS = 28;
const SO_LEAD_DEFAULT = 2;      // days from ordering to delivery: the store's (Tim, Oct 20 2026) until a director saves another
// The store's change fund build-tos, in dollars (Tim's sheet, Oct 20 2026;
// pennies $0, and no $10s or $20s ordered). They stand until a director
// saves others on the card.
const SO_BUILD_TO_STORE = {'5': 1000, '1': 520, Quarters: 300, Dimes: 200, Nickels: 80};
// How the bank sells them (Tim, Oct 20 2026): $1s only in bundles of 100;
// $5s and coin in any amount. Ordering steps stand until a director saves
// others. The order reads in dollars only (Tim: no bundles).
const SO_STEP_STORE = {'1': 100};
let soDetailsOpen = false;    // "How it's worked out" opened
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
  const S = settings || {};
  const par = S.par || {}, step = S.step || {};
  const saved = S.buildTo && Object.keys(S.buildTo).length;
  const buildTo = saved ? S.buildTo : Object.keys(par).length ? {} : SO_BUILD_TO_STORE;
  const lead = soLeadDays(S);
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
    // The build-to in dollars, as bills or rolls (an older par was a count).
    const target = Number(buildTo[item.key]) > 0 ? Math.floor(Number(buildTo[item.key]) / item.value)
      : Number(par[item.key]) > 0 ? Math.floor(Number(par[item.key])) : 0;
    const steps = S.step && Object.keys(S.step).length ? step : SO_STEP_STORE;
    const s = Number(steps[item.key]) > 0 ? Math.floor(Number(steps[item.key])) : 1;
    const atDelivery = onHand === null ? null : Math.max(0, Math.floor(onHand - (perDay || 0) * lead));
    const need = atDelivery === null || !target ? 0 : Math.max(0, target - atDelivery);
    const order = need ? Math.ceil(need / s) * s : 0;
    const daysLeft = onHand === null || !perDay ? null : onHand / perDay;
    return {...item, onHand, perDay, most, target, buildTo: target * item.value, atDelivery, step: s, order, dollars: order * item.value, daysLeft};
  });
  return {latest, rows, lead, total: rows.reduce((t, r) => t + r.dollars, 0), counts: recent.length};
}

function soLeadDays(S){
  const n = Number(S && S.leadDays);
  return S && S.leadDays !== undefined && S.leadDays !== '' && Number.isFinite(n) && n >= 0 ? Math.min(n, 30) : SO_LEAD_DEFAULT;
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
  const lines = m.rows.filter(r => r.order).map(r => `${r.label}: ${soMoney(r.dollars)}`);
  return lines.length ? `Change order, Chick-fil-A Buda, ${dateLabel}\n${lines.join('\n')}\nTotal: ${soMoney(m.total)}` : '';
}

function renderSafeOrder(){
  const root = document.getElementById('safeOrderRoot');
  if(!root) return;
  if(typeof launchManager === 'undefined' || !launchManager){ root.innerHTML = ''; return; }
  const now = Date.now();
  const m = soModel(safeCounts, safeOrderSettings, now);
  // An order on its way counts as coming in: the next order is what's left.
  const open = soOpenOrder(safeOrders), status = soStatusHtml(open || soLatestOrder(safeOrders), true);
  Object.assign(m, soLessOpen(m, open));
  if(!m.latest){
    root.innerHTML = `<section class="so-card"><h3 class="so-title">Change order</h3>${status}<p class="so-note">The order sheet fills in once leaders log a safe count.</p></section>`;
    return;
  }
  const at = new Date(m.latest.timestamp);
  const asOf = `${m.latest.shift || 'Count'}, ${at.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'})} ${at.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'})}`;
  const noPars = !m.rows.some(r => r.target);
  const shown = m.rows.filter(r => soEditing || r.target || r.onHand || r.order || r.key === '1' || r.key === '5' || r.unit === 'roll');
  const leadText = `${m.lead} day${m.lead === 1 ? '' : 's'}`;
  const row = r => {
    const tone = r.daysLeft === null ? '' : r.daysLeft < 3 ? 'is-bad' : r.daysLeft < 7 ? 'is-warn' : 'is-ok';
    const lasts = r.perDay ? `${soRunsOut(r.daysLeft, now)} · uses ~${r.perDay < 10 ? r.perDay.toFixed(1) : Math.round(r.perDay)}/day` : r.perDay === 0 ? 'not running down' : 'not enough counts yet for a pace';
    if(soEditing) return `
      <div class="so-row so-edit">
        <b class="so-label">${escapeHtml(r.label)} <small>${r.unit}s</small></b>
        <label>Build to ($) <input type="number" min="0" step="${r.value}" inputmode="numeric" data-so-par="${r.key}" value="${r.buildTo || ''}" placeholder="${r.most === null ? '' : r.most * r.value}"></label>
        <label>Order in ${r.unit}s, multiples of <input type="number" min="1" step="1" inputmode="numeric" data-so-step="${r.key}" value="${r.step > 1 ? r.step : ''}" placeholder="1"></label>
      </div>`;
    return `
      <div class="so-row">
        <div class="so-main">
          <b class="so-label">${escapeHtml(r.label)}</b>
          <span class="so-have">${r.onHand === null ? 'not counted' : `${soUnits(r.onHand, r.unit)} on hand${r.target ? ` · build to ${soMoney(r.buildTo)}` : ''}`}</span>
          ${r.target && r.perDay && r.atDelivery !== null ? `<span class="so-have so-at">~${r.atDelivery.toLocaleString('en-US')} left when the order arrives</span>` : ''}
          <span class="so-lasts ${tone}">${escapeHtml(lasts)}</span>
        </div>
        ${r.order ? `<span class="so-order"><b>${soMoney(r.dollars)}</b><small>${soUnits(r.order, r.unit)}</small></span>` : r.target ? '<span class="so-order is-none">Full</span>' : ''}
      </div>`;
  };
  if(!soEditing){
    // Tim (Oct 20 2026): the page was too much; what Aaliyah needs is the cash
    // to order, each bill and coin in dollars. The working sits folded below.
    const orderRows = m.rows.filter(r => r.order);
    root.innerHTML = `
    <section class="so-card so-simple">
      <div class="so-kicker">Change order</div>
      ${status}
      ${noPars ? '<p class="so-note so-hint">Set the build-to for each bill and coin and the order works itself out. <button type="button" class="ld-link" data-so-edit>Set build-tos</button></p>'
        : m.total ? `<div class="so-big">${soMoney(m.total)}</div><p class="so-note">to order now${open ? ', on top of the order on its way' : ''}. It arrives in ${leadText} and brings the change fund back up to its build-to.</p>
          <ul class="so-lines">${orderRows.map(r => `<li><span>${escapeHtml(r.label)}</span><b>${soMoney(r.dollars)}</b></li>`).join('')}</ul>
          ${soPlacing ? soPlaceFormHtml(m.total) : '<div class="so-go"><button type="button" class="btn btn-primary" data-so-copy>Copy order</button><button type="button" class="btn btn-ghost" data-so-place>Mark as ordered</button></div>'}`
        : `<div class="so-big is-none">Nothing to order</div><p class="so-note">${open ? 'The order on its way brings the change fund back up to its build-to.' : 'The change fund will still be at its build-to when an order would arrive.'}</p>`}
      <p class="so-note so-asof">From the ${escapeHtml(asOf)} count${m.latest.countedBy ? ` by ${escapeHtml(m.latest.countedBy)}` : ''}.</p>
      <details class="so-more" data-so-more${soDetailsOpen ? ' open' : ''}>
        <summary>How it’s worked out</summary>
        <p class="so-note">Each bill and coin is ordered back up to its build-to, less what goes out over the ${leadText} until delivery (at the pace the last ${SO_WINDOW_DAYS} days of counts show). $1s come in bundles of 100.</p>
        <div class="so-list">${shown.map(row).join('')}</div>
        <div class="so-go"><button type="button" class="btn btn-ghost" data-so-edit>Edit build-tos</button></div>
      </details>
    </section>`;
    return;
  }
  root.innerHTML = `
    <section class="so-card">
      <div class="so-head">
        <div><h3 class="so-title">Change order</h3><p class="so-note">On hand as of the ${escapeHtml(asOf)}${m.latest.countedBy ? `, counted by ${escapeHtml(m.latest.countedBy)}` : ''}.</p></div>
      </div>
      ${noPars && !soEditing ? '<p class="so-note so-hint">Set the build-to for each bill and roll (the dollars the change fund should hold) and the order works itself out. <button type="button" class="ld-link" data-so-edit>Set build-tos</button></p>' : ''}
      ${soEditing
        ? `<label class="so-lead">Days from placing the order to delivery <input type="number" min="0" max="30" step="1" inputmode="numeric" id="soLeadDays" value="${m.lead}"></label>`
        : noPars ? '' : `<p class="so-note">Orders back up to each build-to, counting what goes out over the ${leadText} until delivery. <button type="button" class="ld-link" data-so-edit>Change</button></p>`}
      <div class="so-list">${shown.map(row).join('')}</div>
      <div class="so-go">
        ${soEditing
          ? `<button type="button" class="btn btn-primary" data-so-save>Save</button><button type="button" class="btn btn-ghost" data-so-suggest>Use the most held in ${SO_WINDOW_DAYS} days</button><button type="button" class="ld-link" data-so-cancel>Cancel</button>`
          : `${m.total ? '<button type="button" class="btn btn-primary" data-so-copy>Copy order</button>' : ''}<button type="button" class="btn btn-ghost" data-so-edit>${noPars ? 'Set build-tos' : 'Edit build-tos'}</button>`}
      </div>
      <p class="so-note so-foot">Pace and run-out days come from the last ${SO_WINDOW_DAYS} days of counts (${m.counts}). Bills coming in from an order or a swap don't count as use.</p>
    </section>`;
}

document.getElementById('safeOrderRoot').addEventListener('toggle', e => {
  if(e.target.matches && e.target.matches('[data-so-more]')) soDetailsOpen = e.target.open;
}, true);

document.getElementById('safeOrderRoot').addEventListener('click', async e => {
  const t = e.target.closest('button');
  if(!t) return;
  if(t.hasAttribute('data-so-edit')){ soEditing = true; renderSafeOrder(); return; }
  if(t.hasAttribute('data-so-place')){ soPlacing = true; renderSafeOrder(); return; }
  if(t.hasAttribute('data-so-place-cancel')){ soPlacing = false; renderSafeOrder(); return; }
  if(t.hasAttribute('data-so-place-save')){
    const m = soModel(safeCounts, safeOrderSettings, Date.now());
    const {rows, total} = soLessOpen(m, soOpenOrder(safeOrders));
    const lines = {};
    rows.filter(r => r.order).forEach(r => { lines[r.key] = r.dollars; });
    const exp = document.getElementById('soExpected'), note = document.getElementById('soOrderNote');
    const by = (typeof acUser !== 'undefined' && acUser && acUser.name) || (typeof getInitials === 'function' && getInitials()) || 'Director';
    safeOrders = [...(safeOrders || []), {id: 'co-' + Date.now().toString(36), placedAt: new Date().toISOString(), by, lines, total,
      expected: exp && exp.value ? exp.value : soAddDaysIso(today, soLeadDays(safeOrderSettings || {})), note: note ? note.value.trim().slice(0, 140) : '', status: 'ordered'}];
    soPlacing = false;
    renderSafeOrder();
    await saveState();
    showToast('Change order marked as ordered');
    return;
  }
  if(t.hasAttribute('data-so-cancel')){ soEditing = false; renderSafeOrder(); return; }
  if(t.hasAttribute('data-so-suggest')){
    document.querySelectorAll('#safeOrderRoot [data-so-par]').forEach(inp => { if(inp.placeholder !== '') inp.value = inp.placeholder; });
    return;
  }
  if(t.hasAttribute('data-so-save')){
    const buildTo = {}, step = {};
    document.querySelectorAll('#safeOrderRoot [data-so-par]').forEach(inp => { const n = Math.round(Number(inp.value) * 100) / 100; if(n > 0) buildTo[inp.dataset.soPar] = n; });
    document.querySelectorAll('#safeOrderRoot [data-so-step]').forEach(inp => { const n = Math.floor(Number(inp.value)); if(n > 1) step[inp.dataset.soStep] = n; });
    const leadIn = document.getElementById('soLeadDays');
    const lead = leadIn && leadIn.value !== '' ? Math.max(0, Math.min(30, Math.floor(Number(leadIn.value)) || 0)) : SO_LEAD_DEFAULT;
    safeOrderSettings = {buildTo, step, leadDays: lead};
    soEditing = false;
    renderSafeOrder();
    await saveState();
    showToast('Build-tos saved');
    return;
  }
  if(t.hasAttribute('data-so-copy')){
    const m = soModel(safeCounts, safeOrderSettings, Date.now());
    const text = soOrderText(m, new Date().toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'}));
    try{ await navigator.clipboard.writeText(text); showToast('Order copied'); }
    catch(err){ prompt('Copy the order:', text); }
  }
});

// ----- The order on its way (Tim, Oct 23 2026) -----
// "Communication around what change fund was most recently ordered and when
// it is expected to arrive." A director marks the order placed (what, by
// whom, the day it's expected: today plus the lead days, changeable); the
// card and the Team Leads' Safe Count page show it until someone marks it
// arrived. While it's on its way, the next order counts it as coming in.
// safeOrders lives in its own private section; a Team Lead gets the latest
// with their counts (/api/safe-counts/recent) and marks it arrived through
// /api/safe-orders/received. If it isn't what was ordered, they put in what
// came, per bill and coin, and a note (Tim, Oct 30 2026); the banner then
// says it came short (or over) and by what.
let soPlacing = false;        // the "Mark as ordered" form open
let soArriving = null;        // {id, custom}: "It arrived" tapped, choosing all or a different amount
let safeOrderLead = null;     // a Team Lead's copy of the latest order (scLoadToday)

function soLatestOrder(list){
  return (Array.isArray(list) ? list : []).filter(o => o && o.placedAt).sort((a, b) => String(a.placedAt).localeCompare(String(b.placedAt))).pop() || null;
}
function soOpenOrder(list){ const o = soLatestOrder(list); return o && o.status !== 'received' ? o : null; }
// A day as "Thu, Oct 23": a date, or a time stamp read in the store's own day.
function soDayText(iso){
  if(!iso) return '';
  const day = String(iso).length > 10 && typeof toLocalISODate === 'function' ? toLocalISODate(new Date(iso)) : String(iso).slice(0, 10);
  return new Date(day + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
}
function soAddDaysIso(iso, n){ const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return toLocalISODate(d); }

// The order rows less what's already on its way: {rows, total}.
function soLessOpen(m, open){
  if(!open || !open.lines) return {rows: m.rows, total: m.total};
  const rows = m.rows.map(r => {
    const coming = Number(open.lines[r.key]) || 0;
    if(!r.order || !coming) return r;
    const left = Math.max(0, r.dollars - coming), step = r.step > 1 ? r.step : 1;
    const units = left ? Math.ceil(left / r.value / step) * step : 0;
    return {...r, order: units, dollars: units * r.value};
  });
  return {rows, total: rows.reduce((s, r) => s + (r.order ? r.dollars : 0), 0)};
}

// The banner: on its way (or arrived lately). `canMark`: show "It arrived".
function soStatusHtml(o, canMark){
  if(!o) return '';
  // Bills then coin, smallest first, whatever order they came back in.
  const rank = k => { const i = SO_ITEMS.findIndex(x => x.key === k); return i === -1 ? 99 : i; };
  const lines = Object.entries(o.lines || {}).filter(([, v]) => v > 0).sort((a, b) => rank(a[0]) - rank(b[0])).map(([k, v]) => {
    const item = SO_ITEMS.find(i => i.key === k);
    return `<li><span>${escapeHtml(item ? item.label : k)}</span><b>${soMoney(v)}</b></li>`;
  }).join('');
  const placed = `${soMoney(o.total || 0)} ordered ${escapeHtml(soDayText(o.placedAt))}${o.by ? ` by ${escapeHtml(o.by)}` : ''}`;
  if(o.status === 'received'){
    const days = o.receivedAt ? (Date.now() - o.receivedAt) / SO_DAY_MS : 99;
    if(days > 7) return '';
    const diff = soReceivedDiff(o);
    const day = escapeHtml(soDayText(toLocalISODate(new Date(o.receivedAt))));
    return `<div class="so-status is-in${diff ? ' is-short' : ''}"><div class="so-status-t">
        <b>${!diff ? `Last change order arrived ${day}` : Number(o.receivedTotal) !== Number(o.total) ? `Last change order arrived ${day}: ${soMoney(o.receivedTotal)} of ${soMoney(o.total || 0)} ordered` : `Last change order arrived ${day}, not as ordered`}</b>
        <small>${placed}${o.receivedBy ? ` · marked arrived by ${escapeHtml(o.receivedBy)}` : ''}</small>
        ${o.receivedNote ? `<small class="so-status-note">${escapeHtml(o.receivedNote)}</small>` : ''}
      </div>${diff ? `<ul class="so-lines">${diff}</ul>` : ''}</div>`;
  }
  const late = o.expected && o.expected < today;
  return `<div class="so-status ${late ? 'is-late' : ''}">
    <div class="so-status-t">
      <b>${late ? `Change order expected ${escapeHtml(soDayText(o.expected))}: not marked arrived yet` : `Change order on its way: arriving ${o.expected === today ? 'today' : escapeHtml(soDayText(o.expected))}`}</b>
      <small>${placed}</small>
      ${o.note ? `<small class="so-status-note">${escapeHtml(o.note)}</small>` : ''}
    </div>
    ${lines ? `<ul class="so-lines">${lines}</ul>` : ''}
    ${canMark ? soArriveHtml(o) : ''}
  </div>`;
}

// The ordered lines, bills then coin, smallest first: [[key, item, dollars]].
function soOrderedLines(o){
  const rank = k => { const i = SO_ITEMS.findIndex(x => x.key === k); return i === -1 ? 99 : i; };
  return Object.entries(o.lines || {}).filter(([, v]) => v > 0).sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([k, v]) => [k, SO_ITEMS.find(i => i.key === k) || {key: k, label: k}, Number(v)]);
}
// What came that wasn't what was ordered, line by line ('' when it all came).
function soReceivedDiff(o){
  if(!o.receivedLines) return '';
  const keys = [...new Set([...Object.keys(o.lines || {}), ...Object.keys(o.receivedLines)])];
  return SO_ITEMS.filter(i => keys.includes(i.key)).map(i => {
    const want = Number((o.lines || {})[i.key]) || 0, got = Number(o.receivedLines[i.key]) || 0;
    return want === got ? '' : `<li><span>${escapeHtml(i.label)}</span><b>${soMoney(got)} <small>of ${soMoney(want)}</small></b></li>`;
  }).join('');
}

// "It arrived": all of it, or what came if it's different.
function soArriveHtml(o){
  const id = escapeHtml(o.id);
  if(!soArriving || soArriving.id !== o.id) return `<button type="button" class="btn btn-ghost so-arrived" data-so-arrived="${id}">It arrived</button>`;
  if(!soArriving.custom) return `<div class="so-arrive">
      <p class="so-arrive-q">Did all of it come?</p>
      <div class="so-go">
        <button type="button" class="btn btn-primary" data-so-all="${id}">Yes, all ${soMoney(o.total || 0)}</button>
        <button type="button" class="btn btn-ghost" data-so-diff="${id}">A different amount</button>
        <button type="button" class="ld-link" data-so-arrive-cancel>Cancel</button>
      </div>
    </div>`;
  return `<div class="so-arrive" data-so-form="${id}">
      <p class="so-arrive-q">What came, in dollars</p>
      ${soOrderedLines(o).map(([k, item, v]) => `<label class="so-arrive-row"><span>${escapeHtml(item.label)}<small>ordered ${soMoney(v)}</small></span>
        <input type="number" inputmode="decimal" min="0" step="1" data-so-got="${escapeHtml(k)}" value="${v}" aria-label="${escapeHtml(item.label)} that came"></label>`).join('')}
      <p class="so-arrive-sum" data-so-sum>${soArriveSumText(o)}</p>
      <label class="so-lead">What was different? <input type="text" data-so-got-note maxlength="140" placeholder="Optional, e.g. the bank was out of quarters"></label>
      <div class="so-go">
        <button type="button" class="btn btn-primary" data-so-arrive-save="${id}">Save what came</button>
        <button type="button" class="ld-link" data-so-arrive-cancel>Cancel</button>
      </div>
    </div>`;
}
function soArriveGot(){
  const lines = {};
  document.querySelectorAll('#safecountView [data-so-got]').forEach(inp => { const n = Math.round(Number(inp.value) * 100) / 100; lines[inp.dataset.soGot] = n > 0 ? n : 0; });
  return lines;
}
function soArriveSumText(o){
  const got = document.querySelector('#safecountView [data-so-got]') ? Object.values(soArriveGot()).reduce((s, v) => s + v, 0) : Number(o.total) || 0;
  const want = Number(o.total) || 0;
  return got === want ? `${soMoney(got)}, the whole order` : `${soMoney(got)} of ${soMoney(want)} ordered: ${got < want ? soMoney(want - got) + ' short' : soMoney(got - want) + ' over'}`;
}
function soArriveOrder(id){ return [...(safeOrders || []), safeOrderLead].find(o => o && o.id === id) || null; }

function soPlaceFormHtml(total){
  const lead = soLeadDays(safeOrderSettings || {});
  return `<div class="so-place">
    <p class="so-note">Mark the ${soMoney(total)} order placed, so the leaders know it's coming.</p>
    <label class="so-lead">Expected to arrive <input type="date" id="soExpected" value="${soAddDaysIso(today, lead)}" min="${today}"></label>
    <label class="so-lead">Note for the leaders <input type="text" id="soOrderNote" maxlength="140" placeholder="Optional, e.g. delivered with the morning drop"></label>
    <div class="so-go"><button type="button" class="btn btn-primary" data-so-place-save>Mark as ordered</button><button type="button" class="ld-link" data-so-place-cancel>Cancel</button></div>
  </div>`;
}

// A Team Lead's Safe Count page: the latest order from their counts' reply.
function renderSafeOrderStatus(){
  const root = document.getElementById('safeOrderStatusRoot');
  if(!root) return;
  const manager = typeof launchManager !== 'undefined' && launchManager;
  root.innerHTML = !manager && typeof scIsLead === 'function' && scIsLead() ? soStatusHtml(safeOrderLead, true) : '';
}

async function soMarkArrived(id, got){
  try{
    const res = await fetch(`${API_BASE}/api/safe-orders/received`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(Object.assign({id}, got || {}))});
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(data.error || 'Couldn’t mark it arrived. Try again.');
    const apply = o => { if(o && o.id === id) Object.assign(o, data.order); };
    (safeOrders || []).forEach(apply);
    apply(safeOrderLead);
    soArriving = null;
    renderSafeOrder(); renderSafeOrderStatus();
    showToast(data.order && data.order.receivedLines && data.order.receivedTotal !== soArriveTotal(id) ? 'Change order marked arrived, with what came' : 'Change order marked arrived');
    if(typeof syncState === 'function') syncState();
  }catch(err){ showToast(err.message); }
}

function soArriveTotal(id){ const o = soArriveOrder(id); return o ? Number(o.total) || 0 : 0; }
function soArriveRender(){ renderSafeOrder(); renderSafeOrderStatus(); }

document.getElementById('safecountView').addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('button');
  if(!t) return;
  const d = t.dataset;
  if(d.soArrived){ soArriving = {id: d.soArrived, custom: false}; soArriveRender(); }
  else if(d.soAll){ t.disabled = true; soMarkArrived(d.soAll); }
  else if(d.soDiff){ soArriving = {id: d.soDiff, custom: true}; soArriveRender(); const first = document.querySelector('#safecountView [data-so-got]'); if(first) first.select(); }
  else if(t.hasAttribute('data-so-arrive-cancel')){ soArriving = null; soArriveRender(); }
  else if(d.soArriveSave){
    const note = document.querySelector('#safecountView [data-so-got-note]');
    t.disabled = true;
    soMarkArrived(d.soArriveSave, {lines: soArriveGot(), note: note ? note.value.trim().slice(0, 140) : ''});
  }
});
// The total under the amounts follows what's typed.
document.getElementById('safecountView').addEventListener('input', e => {
  if(!e.target.matches || !e.target.matches('[data-so-got]')) return;
  const form = e.target.closest('[data-so-form]'), sum = form && form.querySelector('[data-so-sum]'), o = form && soArriveOrder(form.dataset.soForm);
  if(sum && o) sum.textContent = soArriveSumText(o);
});
