// ===== WASTE TRACKER (Track tab) =====
// Tim's tile tracker, on Ops Hub's shared data. One tile per item with
// today's count at the side being logged (FOH or BOH): tap adds 1, the −
// corner takes 1 away, press and hold types an exact count. Items and prices
// come from the catalog (waste-catalog.js) as saved in Manage.
//
// Entries stay the shape the rest of the hub reads (scoreboard, Operational
// Intelligence, the monthly close-out): {id, ts, day, prodId, name, qty,
// unit, unitCost, cost (qty × unitCost), who, section}. Quick taps on the
// same tile by the same person within WASTE_MERGE_MS become one entry.

const WASTE_MERGE_MS = 10 * 60 * 1000;
const WASTE_HOLD_MS = 550;
let wasteCat = 'All';
let wasteQuery = '';

const wasteMoney = n => '$' + (Number(n) || 0).toFixed(2);
function wasteEntryDay(e){ return e.day || toLocalISODate(new Date(e.ts)); }
function wasteItemId(e){ return WASTE_LEGACY_MAP[e.prodId] || e.prodId; }

// Today's entries at this side, as {itemId: qty}.
function wasteTodayCounts(section){
  const out = {};
  entries.forEach(e => { if(e.section === section && wasteEntryDay(e) === today) out[wasteItemId(e)] = (out[wasteItemId(e)] || 0) + (Number(e.qty) || 0); });
  return out;
}
function wasteTodayTotal(section){
  return entries.reduce((t, e) => t + (e.section === section && wasteEntryDay(e) === today ? (Number(e.cost) || 0) : 0), 0);
}

function wasteAdd(item, qty, who){
  if(qty <= 0) return;
  const now = Date.now();
  // A tap on the same tile by the same person a moment ago: one entry.
  for(let i = entries.length - 1; i >= 0; i--){
    const e = entries[i];
    if(now - e.ts > WASTE_MERGE_MS) break;
    if(wasteItemId(e) === item.id && e.section === currentSection && e.who === who && e.unitCost === item.cost && wasteEntryDay(e) === today){
      e.qty += qty; e.cost = Math.round(e.qty * e.unitCost * 100) / 100;
      return;
    }
  }
  entries.push({id: 'w' + now.toString(36) + Math.random().toString(36).slice(2, 6), ts: now, day: today, prodId: item.id, name: item.name,
    qty, unit: item.unit, unitCost: item.cost, cost: Math.round(qty * item.cost * 100) / 100, who, section: currentSection});
}
function wasteRemove(item, qty){
  for(let i = entries.length - 1; i >= 0 && qty > 0; i--){
    const e = entries[i];
    if(wasteItemId(e) !== item.id || e.section !== currentSection || wasteEntryDay(e) !== today) continue;
    const take = Math.min(e.qty, qty);
    e.qty -= take; qty -= take;
    if(e.qty <= 0) entries.splice(i, 1);
    else e.cost = Math.round(e.qty * (Number(e.unitCost) || 0) * 100) / 100;
  }
}

function wasteRequireInitials(){
  const who = getInitials();
  if(!who){ showToast('Set your initials first (top right)'); beginEditInitials(); }
  return who;
}

// Today counts toward the under-limit streak only while today's total stays
// under the limit, so it's re-checked on every entry and when the limit
// changes (a later entry can push the day over). With no entries today
// (nothing logged yet, or just closed out) it's left as it is.
function syncTodayWasteDay(){
  if(!entries.some(e => wasteEntryDay(e) === today)) return;
  const has = wasteDays.includes(today);
  const under = getTodayTotal() < wasteTarget;
  if(under === has) return;
  wasteDays = under ? [...wasteDays, today] : wasteDays.filter(d => d !== today);
  calcStreak();
}

async function wasteAfterChange(item){
  syncTodayWasteDay();
  wasteRefreshTile(item.id);
  renderTape();
  renderWasteMeters();
  renderScoreboardView();
  await saveState();
}

// ---------- today's waste meters ----------
// The team's scoreboard: today's waste, FOH and BOH together, against the
// daily limit — on the Waste tab (big) and in the header (tiny, every page).
// Same zones as the Scoreboard thermometer; the scale runs to 125% of the
// limit, so the limit line sits at 80% of the tube.
function renderWasteMeters(){
  const limit = Number(wasteTarget) || 0;
  const foh = wasteTodayTotal('foh'), boh = wasteTodayTotal('boh'), total = foh + boh;
  const state = wasteThermoState(total, limit);
  const level = Math.min(1, state.ratio / WT_SCALE_MAX);
  const money = n => '$' + n.toFixed(2);
  const short = n => n >= 100 ? '$' + Math.round(n) : money(n);
  const fill = (tube, cls) => {
    if(!tube) return;
    tube.className = `hw-tube ${cls || ''} is-${state.key}`;
    tube.style.setProperty('--lv', level);
  };

  const hdr = document.getElementById('hdrWaste');
  if(hdr){
    hdr.className = 'hdr-waste is-' + state.key;
    document.getElementById('hdrWasteAmt').textContent = short(total);
    document.getElementById('hdrWasteOf').textContent = ` of ${short(limit)}`;
    hdr.title = `${money(total)} wasted today of the ${money(limit)} daily limit — tap for the Waste tab`;
    fill(hdr.querySelector('.hw-tube'), '');
  }

  const card = document.getElementById('wasteTodayCard');
  if(!card) return;
  document.getElementById('wasteTodayAmt').textContent = money(total);
  document.getElementById('wasteTodaySub').innerHTML = `wasted today of the <b>${money(limit)}</b> limit <i>· desperdicio de hoy</i>`;
  const pill = document.getElementById('wasteTrackPill');
  pill.textContent = state.pill;
  pill.className = 'waste-status-pill is-' + state.key;
  fill(card.querySelector('.hw-tube'), 'is-big');
  document.getElementById('wasteTrackTicks').innerHTML = WT_TICKS.map(f =>
    `<span class="${f === 1 ? 'is-limit' : ''}" style="left:${f / WT_SCALE_MAX * 100}%">${f === 1 ? 'Limit ' : ''}$${Math.round(limit * f)}</span>`).join('');
  document.getElementById('wasteTrackLeft').innerHTML = total > limit
    ? `<b>${money(total - limit)}</b> over the limit`
    : total === limit ? '<b>Right at</b> the limit'
    : `<b>${money(limit - total)}</b> of room left · lower is better`;
  document.getElementById('wasteTrackSides').innerHTML = [['foh', 'FOH', foh], ['boh', 'BOH', boh]]
    .map(([k, l, v]) => `<span class="${k === currentSection ? 'is-on' : ''}">${l} ${money(v)}</span>`).join('');
}

document.getElementById('hdrWaste').addEventListener('click', ()=>{
  if(typeof launchShowTab === 'function') launchShowTab('wastelog');
  window.scrollTo({top: 0, behavior: 'smooth'});
});

// ---------- tiles ----------

function wasteTileHtml(p, n){
  const c = wasteItemColor(p), ink = wasteTextOn(c);
  const over = p.ceil > 0 && n >= p.ceil;
  return `<div class="wt-tile ${n ? '' : 'is-zero'} ${over ? 'is-over' : ''} ${ink !== '#ffffff' ? 'is-light' : ''}" data-wt-id="${escapeHtml(p.id)}" style="--c:${c};--t:${ink}" role="button" tabindex="0" aria-label="${escapeHtml(p.name)}: ${n} today">
    <span class="wt-flag">At ceiling</span>
    <button type="button" class="wt-minus" data-wt-minus="${escapeHtml(p.id)}" aria-label="Remove one ${escapeHtml(p.name)}">−</button>
    <div class="wt-n">${n}</div><div class="wt-u">${escapeHtml(p.unit)}</div>
    <div class="wt-nm">${escapeHtml(p.name)}</div>
    ${p.es ? `<div class="wt-es">${escapeHtml(p.es)}</div>` : ''}
    <div class="wt-p">${wasteMoney(n * (Number(p.cost) || 0))}</div>
  </div>`;
}

function wasteVisibleItems(){
  const q = wasteQuery.trim().toLowerCase();
  return products.filter(p => p.active !== false && wasteItemShows(p, currentSection) && (wasteCat === 'All' || p.cat === wasteCat)
    && (!q || p.name.toLowerCase().includes(q) || (p.es || '').toLowerCase().includes(q) || p.cat.toLowerCase().includes(q)))
    .sort((a, b) => ((a.ord || 1000) - (b.ord || 1000)) || a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'}));
}

// The whole Track tab (also called when the saved items change).
function renderGrid(){
  const grid = document.getElementById('grid');
  if(!grid) return;
  // Chips only for categories this side actually has: no empty pills.
  const cats = wasteCategories(products.filter(p => p.active !== false && wasteItemShows(p, currentSection)));
  if(wasteCat !== 'All' && !cats.includes(wasteCat)) wasteCat = 'All';
  const chips = document.getElementById('wasteChips');
  if(chips) chips.innerHTML = ['All', ...cats].map(c => `<button type="button" class="wt-chip ${wasteCat === c ? 'is-on' : ''}" data-wt-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('');
  const search = document.getElementById('wasteSearch');
  if(search && search.value !== wasteQuery) search.value = wasteQuery;
  renderWasteMeters();

  const counts = wasteTodayCounts(currentSection);
  const items = wasteVisibleItems();
  if(!items.length){ grid.innerHTML = `<div class="empty-state"><b>No items match</b></div>`; return; }
  if(wasteCat === 'All'){
    grid.innerHTML = cats.map(c => {
      const list = items.filter(p => p.cat === c);
      return list.length ? `<div class="wt-cat-h">${escapeHtml(c)}</div><div class="wt-grid">${list.map(p => wasteTileHtml(p, counts[p.id] || 0)).join('')}</div>` : '';
    }).join('');
  } else {
    grid.innerHTML = `<div class="wt-grid">${items.map(p => wasteTileHtml(p, counts[p.id] || 0)).join('')}</div>`;
  }
}

function wasteRefreshTile(id){
  const p = products.find(x => x.id === id);
  const el = document.querySelector(`.wt-tile[data-wt-id="${CSS.escape(id)}"]`);
  const n = wasteTodayCounts(currentSection)[id] || 0;
  if(p && el){
    el.querySelector('.wt-n').textContent = n;
    el.querySelector('.wt-p').textContent = wasteMoney(n * (Number(p.cost) || 0));
    el.classList.toggle('is-zero', !n);
    el.classList.toggle('is-over', p.ceil > 0 && n >= p.ceil);
    el.setAttribute('aria-label', `${p.name}: ${n} today`);
  }
  renderWasteMeters();
}

// ---------- exact count (press and hold) ----------

function wasteCountModal(id){
  const p = products.find(x => x.id === id);
  if(!p) return;
  let modal = document.getElementById('wasteCountModal');
  if(!modal){
    document.body.insertAdjacentHTML('beforeend', `
      <div class="overlay" id="wasteCountModal">
        <div class="sheet">
          <h2 id="wasteCountTitle"></h2>
          <div class="sub" id="wasteCountSub"></div>
          <div class="stepper">
            <button type="button" data-wt-step="-1" aria-label="One less">−</button>
            <input type="number" id="wasteCountN" min="0" step="1" inputmode="numeric">
            <button type="button" data-wt-step="1" aria-label="One more">+</button>
          </div>
          <div class="wt-quick"><button type="button" data-wt-step="5">+5</button><button type="button" data-wt-step="10">+10</button><button type="button" data-wt-step="20">+20</button></div>
          <div class="cost-preview" id="wasteCountCost"></div>
          <button type="button" id="wasteCountSave" class="btn btn-primary">Save count</button>
          <button type="button" id="wasteCountCancel" class="btn btn-ghost">Cancel</button>
        </div>
      </div>`);
    modal = document.getElementById('wasteCountModal');
    const input = document.getElementById('wasteCountN');
    const preview = () => {
      const item = products.find(x => x.id === modal.dataset.id) || {};
      const n = Math.max(0, parseInt(input.value, 10) || 0);
      document.getElementById('wasteCountCost').innerHTML = `Today: <b>${wasteMoney(n * (Number(item.cost) || 0))}</b>`;
    };
    modal.addEventListener('click', e => {
      if(e.target === modal || e.target.id === 'wasteCountCancel'){ modal.classList.remove('active'); return; }
      const step = e.target.closest('[data-wt-step]');
      if(step){ input.value = Math.max(0, (parseInt(input.value, 10) || 0) + parseInt(step.dataset.wtStep, 10)); preview(); }
    });
    input.addEventListener('input', preview);
    input.addEventListener('keydown', e => { if(e.key === 'Enter') document.getElementById('wasteCountSave').click(); });
    document.getElementById('wasteCountSave').addEventListener('click', async ()=>{
      const item = products.find(x => x.id === modal.dataset.id);
      if(!item) return;
      const who = wasteRequireInitials();
      if(!who) return;
      const want = Math.max(0, parseInt(input.value, 10) || 0);
      const cur = wasteTodayCounts(currentSection)[item.id] || 0;
      if(want > cur) wasteAdd(item, want - cur, who);
      else if(want < cur) wasteRemove(item, cur - want);
      modal.classList.remove('active');
      await wasteAfterChange(item);
    });
  }
  modal.dataset.id = id;
  document.getElementById('wasteCountTitle').textContent = p.name;
  document.getElementById('wasteCountSub').textContent = `Today's count at ${currentSection.toUpperCase()} · ${wasteMoney(p.cost)} per ${p.unit}`;
  const input = document.getElementById('wasteCountN');
  input.value = wasteTodayCounts(currentSection)[id] || 0;
  input.dispatchEvent(new Event('input'));
  modal.classList.add('active');
  setTimeout(() => { input.focus(); input.select(); }, 40);
}

// ---------- events ----------

(function(){
  const view = document.getElementById('wastelogView');
  if(!view) return;
  let holdTimer = null, held = false;

  view.addEventListener('click', async e => {
    const chip = e.target.closest('[data-wt-cat]');
    if(chip){ wasteCat = chip.dataset.wtCat; renderGrid(); return; }
    const minus = e.target.closest('[data-wt-minus]');
    if(minus){
      const item = products.find(x => x.id === minus.dataset.wtMinus);
      if(!item) return;
      wasteRemove(item, 1);
      await wasteAfterChange(item);
      return;
    }
    const tile = e.target.closest('[data-wt-id]');
    if(!tile) return;
    if(held){ held = false; return; }   // the press-and-hold already opened the count
    const item = products.find(x => x.id === tile.dataset.wtId);
    if(!item) return;
    const who = wasteRequireInitials();
    if(!who) return;
    wasteAdd(item, 1, who);
    if(navigator.vibrate) navigator.vibrate(8);
    await wasteAfterChange(item);
  });
  view.addEventListener('keydown', e => {
    const tile = e.target.closest('[data-wt-id]');
    if(tile && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); tile.click(); }
  });
  view.addEventListener('pointerdown', e => {
    const tile = e.target.closest('[data-wt-id]');
    if(!tile || e.target.closest('[data-wt-minus]')) return;
    held = false; clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      held = true;
      if(navigator.vibrate) navigator.vibrate(15);
      if(wasteRequireInitials()) wasteCountModal(tile.dataset.wtId);
    }, WASTE_HOLD_MS);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => view.addEventListener(ev, () => clearTimeout(holdTimer), true));
  document.addEventListener('scroll', () => clearTimeout(holdTimer), true);
  view.addEventListener('contextmenu', e => { if(e.target.closest('[data-wt-id]')) e.preventDefault(); });
  view.addEventListener('input', e => { if(e.target.id === 'wasteSearch'){ wasteQuery = e.target.value; renderGrid(); } });
})();

function showToast(msg){
  const t = document.querySelector('.toast') || document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  if(!document.querySelector('.toast')) document.body.appendChild(t);
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}

const RECENT_ENTRIES_WINDOW_MS = 15 * 60 * 1000;

function renderTape(){
  const tape = document.getElementById('tape');
  const cutoff = Date.now() - RECENT_ENTRIES_WINDOW_MS;
  const filtered = entries.filter(e=>e.section===currentSection && e.ts >= cutoff);
  if(filtered.length===0){
    tape.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:12px;">No entries in the last 15 minutes</div>`;
    return;
  }
  tape.innerHTML = [...filtered].sort((a,b)=>b.ts-a.ts).map(e=>`
    <div class="tape-row">
      <span class="l">${new Date(e.ts).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})} · ${escapeHtml(e.name)}${e.who ? ` <span class="tape-who">· ${escapeHtml(e.who)}</span>` : ''}</span>
      <span class="r">${escapeHtml(e.qty)}${escapeHtml(e.unit)} · $${(Number(e.cost) || 0).toFixed(2)}</span>
    </div>
  `).join('');
}

// Keeps the rolling window current even if nobody touches the page — an
// entry silently drops off the list once it ages past 15 minutes.
setInterval(()=>{
  if(document.getElementById('wastelogView').classList.contains('active')) renderTape();
}, 30000);

// Scoreboard: combined waste totals, target status, and streaks all in one place.
// Not filtered by currentSection (that toggle only affects the Log Waste grid/tape).
// Everything here is scoped to TODAY only — the monthly running total lives
// on in the underlying `entries` array (nothing is deleted), ready for
// whichever future leadership-only scoreboard reads across the full month.
// The manual monthly close-out (Manage tab) is the only thing that clears it.
function renderScoreboardView(){
  // Entries from other devices may have pushed today over the limit.
  syncTodayWasteDay();
  const todayEntries = entries.filter(e => toLocalISODate(new Date(e.ts)) === today);
  const total = todayEntries.reduce((sum,e)=>sum+e.cost,0);
  const fohTotal = todayEntries.filter(e=>e.section==='foh').reduce((sum,e)=>sum+e.cost,0);
  const bohTotal = todayEntries.filter(e=>e.section==='boh').reduce((sum,e)=>sum+e.cost,0);

  document.getElementById('statEntries').textContent = todayEntries.length;
  document.getElementById('statFohSubtotal').textContent = '$' + fohTotal.toFixed(2);
  document.getElementById('statBohSubtotal').textContent = '$' + bohTotal.toFixed(2);

  const byProduct = {};
  todayEntries.forEach(e=>{
    byProduct[e.name] = (byProduct[e.name]||0) + (Number(e.cost) || 0);
  });
  const sorted = Object.entries(byProduct).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxVal = sorted[0]?sorted[0][1]:1;

  document.getElementById('barList').innerHTML = sorted.length ? sorted.map(([name,cost])=>`
    <div class="bar-item">
      <div class="bi-top">
        <span class="bn">${escapeHtml(name)}</span>
        <span class="bv">$${cost.toFixed(2)}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(cost/maxVal)*100}%"></div>
      </div>
    </div>
  `).join('') : '<div style="text-align:center;color:var(--text-secondary);font-size:12px;padding:12px 0;">No waste logged yet today</div>';

  document.getElementById('wasteTodayDate').textContent = formatVerboseDate(today);
  renderWasteThermo(total);

  // Active Streaks
  document.getElementById('foodSafetyStreakNum').textContent = foodSafetyStreak;
  document.getElementById('foodSafetyStreakLabel').textContent = 'consecutive ' + (foodSafetyStreak === 1 ? 'day' : 'days');
  document.getElementById('wasteStreakNum').textContent = wasteStreak;
  document.getElementById('wasteStreakLabel').textContent = 'consecutive ' + (wasteStreak === 1 ? 'day' : 'days');
  document.getElementById('fohOEStreakNum').textContent = fohOEStreak;
  document.getElementById('fohOEStreakLabel').textContent = 'consecutive ' + (fohOEStreak === 1 ? 'day' : 'days');
  if(typeof renderWasteDashboard === 'function') renderWasteDashboard();
}

// ===== WASTE THERMOMETER =====
// Today's waste against the daily limit (the Manage "Daily Waste Limit"),
// FOH and BOH together. Waste is bad, so this is a ceiling to stay under, not
// a goal to reach: the tube is tinted green / amber / red with a solid limit
// line, and the red zone above it is "over". The scale runs to 125% of the
// limit; past that the mercury stays pinned at the top and "boils". Green
// until 75% of the limit, amber from there, red once today reaches it.
const WT_SCALE_MAX = 1.25;
const WT_TICKS = [0, 0.25, 0.5, 0.75, 1, 1.25];
let wtShownTotal = null;    // what the thermometer last showed on screen

function wasteThermoState(total, limit){
  const ratio = limit > 0 ? total / limit : 0;
  if(total >= limit) return {key: 'over', pill: total > limit ? '⚠ Over limit' : '⚠ At the limit', ratio};
  if(ratio >= 0.75) return {key: 'close', pill: 'Near the limit', ratio};
  return {key: 'under', pill: '✓ Under limit', ratio};
}

function renderWasteThermo(total){
  const limit = wasteTarget;
  const state = wasteThermoState(total, limit);
  const money = n => '$' + n.toFixed(2);

  document.getElementById('wasteTodayTotal').textContent = money(total);
  document.getElementById('wasteTodayTarget').textContent = money(limit);
  const pill = document.getElementById('wasteStatusPill');
  pill.textContent = state.pill;
  pill.className = 'waste-status-pill is-' + state.key;
  document.getElementById('wasteThermoLeft').innerHTML = total > limit
    ? `<b>${money(total - limit)}</b> over the limit`
    : total === limit ? '<b>Right at</b> the limit'
    : `<b>${money(limit - total)}</b> of room left`;

  const thermo = document.getElementById('wasteThermo');
  document.getElementById('wasteThermoScale').innerHTML = WT_TICKS.map(f =>
    `<span class="wt-tick${f === 1 ? ' is-limit' : ''}" style="--f:${f / WT_SCALE_MAX}">${f === 1 ? 'Limit ' : ''}$${Math.round(limit * f)}</span>`
  ).join('');

  // Only move the mercury while it's on screen, so the rise plays when
  // someone is looking (waste logged elsewhere rises on the next visit).
  if(!thermo.offsetParent) return;
  const gauge = document.getElementById('wasteThermoGauge');
  gauge.offsetHeight;   // settle the old level first so the change animates
  const level = Math.min(1, state.ratio / WT_SCALE_MAX);
  gauge.style.setProperty('--wt-level', level);
  gauge.style.setProperty('--wt-bump', Math.min(level, 0.85));   // keeps the +$ tag inside the card
  gauge.className = 'wt-gauge is-' + state.key + (state.ratio > WT_SCALE_MAX ? ' is-boiling' : '');

  const bump = document.getElementById('wasteThermoBump');
  const added = wtShownTotal === null ? 0 : total - wtShownTotal;
  wtShownTotal = total;
  if(added > 0.004){
    bump.textContent = '+' + money(added);
    bump.classList.remove('is-on');
    bump.offsetWidth;   // restart the float-up
    bump.classList.add('is-on');
  }
}
