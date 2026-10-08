// Resolves once loadState() (bottom of this file) has the saved data. Manage
// must not render before then: it would show — and edit — the built-in
// defaults instead of the saved products, team, targets and scoreboards.
let resolveStateLoaded;
const stateLoaded = new Promise(resolve => { resolveStateLoaded = resolve; });

document.getElementById('btnPinGo').addEventListener('click',checkPin);
document.getElementById('pinInput').addEventListener('keydown',(e)=>{ if(e.key==='Enter') checkPin(); });

async function checkPin(){
  const pin = document.getElementById('pinInput').value;
  try{
    const res = await fetch(`${API_BASE}/api/manager/login`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({pin})
    });
    const result = await res.json();
    if(res.ok && result.success){
      await stateLoaded;
      await launchSetManager(true);
      document.getElementById('pinGate').style.display = 'none';
      document.getElementById('manageContent').style.display = 'block';
      renderManage();
    } else {
      document.getElementById('pinInput').value = '';
      document.getElementById('pinInput').placeholder = result.error || 'Wrong PIN';
      setTimeout(()=>{ document.getElementById('pinInput').placeholder = '••••'; }, 2000);
    }
  }catch(err){
    document.getElementById('pinInput').placeholder = 'Connection error';
  }
}

document.getElementById('btnLock').addEventListener('click', async ()=>{
  try{ await saveState(); }catch(err){ /* still lock */ }
  let signedOut = false;
  try{
    const res = await fetch(`${API_BASE}/api/manager/logout`, {method: 'POST'});
    signedOut = res.ok;
  }catch(err){ /* offline */ }
  if(signedOut){
    // Start over as a team member's device: private data (PEA, people) is
    // cleared from the page, and launch mode applies again.
    location.reload();
    return;
  }
  // The server didn't hear it, so the session is still open there. Close
  // Manage on this screen anyway and say so, rather than leave it unlocked.
  document.getElementById('manageContent').style.display = 'none';
  document.getElementById('pinGate').style.display = '';
  showToast("Couldn't reach the server to sign out. Manage is closed here; tap Lock again once you're back online.");
});

(async function checkManagerStatus(){
  try{
    const res = await fetch(`${API_BASE}/api/manager/status`);
    const {isManager} = await res.json();
    if(isManager){
      await stateLoaded;
      await launchSetManager(true);
      document.getElementById('pinGate').style.display = 'none';
      document.getElementById('manageContent').style.display = 'block';
      renderManage();
    }
  }catch(err){ /* stay locked if the status check fails */ }
})();

// ---- One section at a time (Tim, Oct 2026) ----
// Manage was nine stacked groups, thirty screens tall on a phone. Now the
// chips at the top pick one section and only it shows; the device remembers
// the last one picked.
const MANAGE_TAB_KEY = 'cfaBudaManageTab';
function manageShowTab(key){
  const groups = [...document.querySelectorAll('#manageContent .manage-group')];
  if(!groups.some(g => g.dataset.manageTab === key)) key = 'uploads';
  groups.forEach(g => g.classList.toggle('is-active', g.dataset.manageTab === key));
  document.querySelectorAll('[data-manage-go]').forEach(b => {
    const on = b.dataset.manageGo === key;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  });
  try{ localStorage.setItem(MANAGE_TAB_KEY, key); }catch(err){ /* private mode */ }
}
function manageCurrentTab(){
  try{ return localStorage.getItem(MANAGE_TAB_KEY) || 'uploads'; }catch(err){ return 'uploads'; }
}
document.getElementById('manageTabs').addEventListener('click', e=>{
  const b = e.target.closest('[data-manage-go]');
  if(!b) return;
  manageShowTab(b.dataset.manageGo);
  const top = document.getElementById('manageContent').getBoundingClientRect().top + window.scrollY - 8;
  if(window.scrollY > top) window.scrollTo({top});
});

// ---- Saves as you go (Tim, Oct 2026) ----
// No Save buttons: each Manage form saves on its own, when a field is left
// and 1.5 s after the last keystroke. A save takes only the fields that
// differ from what the form was drawn with (mvTake, TIM-53), so two managers
// editing different fields never undo each other, and a redraw from another
// device's changes waits while a field is being typed in (refreshManage).
// Each card's note says when it last saved.
const MV_AUTOSAVE = {
  pillarsManageList: () => savePillars(true),
  metricsManageList: () => saveLXScoreboard(true),
  gxManageList: () => saveGXScoreboard(true),
  homeManageList: () => saveHomeScoreboard(true),
  txManageList: () => saveTXScoreboard(true),
};
const mvTimers = {};
function mvSavedNote(el){
  const card = el && el.closest ? el.closest('.standup-card') : null;
  const note = card && card.querySelector('[data-mv-saved]');
  if(note) note.textContent = 'Saved · ' + new Date().toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
}
async function mvAutosave(id){
  clearTimeout(mvTimers[id]);
  const root = document.getElementById(id);
  if(!root || !MV_AUTOSAVE[id]) return;
  await MV_AUTOSAVE[id]();
  mvSavedNote(root);
}
window.txAutosave = () => mvAutosave('txManageList');
Object.keys(MV_AUTOSAVE).forEach(id=>{
  const root = document.getElementById(id);
  if(!root) return;
  root.addEventListener('change', () => mvAutosave(id));
  root.addEventListener('input', e=>{
    if(!e.target.matches('input[type="text"], textarea')) return;
    clearTimeout(mvTimers[id]);
    mvTimers[id] = setTimeout(() => mvAutosave(id), 1500);
  });
});

// The daily waste limit saves when the field is left.
document.getElementById('targetInput').addEventListener('change', async e=>{
  const input = e.target;
  const v = parseInt(input.value, 10);
  if(isNaN(v) || v <= 0){ input.value = wasteTarget; showToast('The limit needs to be a number of dollars'); return; }
  if(v !== wasteTarget){
    wasteTarget = v;
    syncTodayWasteDay();
    await saveState();
    renderScoreboardView();
  }
  input.defaultValue = input.value;
  mvSavedNote(input);
});

async function renderManage(){
  manageShowTab(manageCurrentTab());
  renderDataUploads();
  renderPeaManage();
  if(document.getElementById('manageContent').style.display === 'block'){ peaAutoSync(); duCheckBackup(); }
  renderNumbersTab();
  if(typeof renderEventsManage === 'function') renderEventsManage();
  if(typeof renderUniformCatalogManage === 'function') renderUniformCatalogManage();
  refreshManage(true);
}

// Redraws Manage from the current data: when it opens, and when another
// device's changes (or an upload) arrive while it's on screen, so it never
// shows (and saves back) old numbers. Forms that only save from the screen
// (waste limit, LX, GX, Home) are skipped while they hold unsaved typing; the
// rest write to the data as they're edited, so redrawing keeps those edits.
function refreshManage(opening){
  if(!opening && document.getElementById('manageContent').style.display !== 'block') return;
  const clean = (...ids) => ids.every(id => !mvDirty(document.getElementById(id)));
  const target = document.getElementById('targetInput');
  if(opening || !mvEdited(target)) target.value = target.defaultValue = wasteTarget;
  wasteExportStatus();
  document.getElementById('setupHistoryStatus').textContent = setupHistoryStatusText();

  if(opening || clean('pillarsManageList', 'metricsManageList')) renderLXManage();
  if(opening || clean('gxManageList')) renderGXManage();
  if(opening || clean('homeManageList')) renderHomeManage();
  if(typeof renderEventsManage === 'function' && (opening || !evEditId)) renderEventsManage();
  if(typeof renderUniformCatalogManage === 'function' && (opening || !uoEditId)) renderUniformCatalogManage();
  renderTXManage();
  renderEOISubmissions();
  renderScoreboardManage(opening);
  renderProductManager();
}

// ---- Waste tracker items (Manage → Waste Tracking) ----
// The saved item list, one row each; tapping a row opens the editor. The
// catalog (waste-catalog.js) is the default; every change here is what the
// tracker shows from then on. An item with waste history is hidden rather
// than deleted so the history keeps its name and price.

let wiQuery = '', wiCat = 'All', wiUnpriced = false, wiColor = '';
// The list starts at 20 items (Tim, Oct 2026: a hundred rows ran eight
// screens); search, a category or "Show all" opens the rest.
const WI_FIRST = 20;
let wiShowAll = false;

async function saveProductsAndRefresh(){
  await saveState();
  renderProductManager();
  renderGrid();
}

function wasteSideLabel(side){ return side === 'foh' ? 'FOH' : side === 'boh' ? 'BOH' : 'FOH + BOH'; }

function wasteItemUsed(id){
  return entries.some(e => wasteItemId(e) === id);
}

function renderProductManager(){
  const list = document.getElementById('prodList');
  if(!list) return;
  const q = wiQuery.trim().toLowerCase();
  const cats = wasteCategories();
  if(wiCat !== 'All' && !cats.includes(wiCat)) wiCat = 'All';
  const rows = products.filter(p => (wiCat === 'All' || p.cat === wiCat) && (!wiUnpriced || !(Number(p.cost) > 0))
    && (!q || p.name.toLowerCase().includes(q) || (p.es || '').toLowerCase().includes(q) || p.cat.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'}));
  const unpriced = products.filter(p => !(Number(p.cost) > 0)).length;
  const filtered = !!q || wiCat !== 'All' || wiUnpriced || wiShowAll;
  const shown = filtered ? rows : rows.slice(0, WI_FIRST);
  list.innerHTML = `
    <div class="wi-tools">
      <input type="search" class="wi-search" data-wi-search placeholder="Search items" value="${escapeHtml(wiQuery)}" autocomplete="off" aria-label="Search items">
      <select data-wi-cat aria-label="Category">${['All', ...cats].map(c => `<option value="${escapeHtml(c)}" ${wiCat === c ? 'selected' : ''}>${c === 'All' ? 'All categories' : escapeHtml(c)}</option>`).join('')}</select>
      <button type="button" class="wi-filter ${wiUnpriced ? 'is-on' : ''}" data-wi-unpriced aria-pressed="${wiUnpriced}">No price set${unpriced ? ` (${unpriced})` : ''}</button>
      <button type="button" class="wi-add" data-wi-add>+ Add item</button>
    </div>
    <div class="wi-count">${shown.length < rows.length ? `First ${shown.length} of ${rows.length} items, A to Z` : `${rows.length} of ${products.length} items`}</div>
    <div class="wi-list">${shown.length ? shown.map(p => `
      <button type="button" class="wi-row ${p.active === false ? 'is-off' : ''}" data-wi-edit="${escapeHtml(p.id)}">
        <span class="wi-dot" style="--c:${wasteItemColor(p)}"></span>
        <span class="wi-nm"><b>${escapeHtml(p.name)}${p.active === false ? '<span class="wi-tag">Hidden</span>' : ''}</b><span>${escapeHtml(p.es || '')}${p.es ? ' · ' : ''}${escapeHtml(p.cat)} · ${wasteSideLabel(p.side)}${p.ceil > 0 ? ` · Ceiling ${p.ceil}` : ''}</span></span>
        <span class="wi-un">${escapeHtml(p.unit)}</span>
        <span class="wi-pr ${Number(p.cost) > 0 ? '' : 'is-none'}">${Number(p.cost) > 0 ? wasteMoney(p.cost) : 'no price'}</span>
      </button>`).join('') : '<div class="empty-state">No items match.</div>'}</div>
    ${shown.length < rows.length ? `<button type="button" class="wi-more" data-wi-more>Show all ${rows.length} items</button>` : ''}`;
}

function wasteItemModal(id){
  const p = id ? products.find(x => x.id === id) : null;
  if(id && !p) return;
  const it = p || {name: '', es: '', cat: wiCat !== 'All' ? wiCat : 'Proteins', unit: 'pc', cost: 0, color: '', ceil: 0, active: true, side: 'both'};
  const side = WASTE_SIDES.includes(it.side) ? it.side : 'both';
  wiColor = wasteValidColor(it.color);
  let modal = document.getElementById('wasteItemModal');
  if(!modal){
    document.body.insertAdjacentHTML('beforeend', '<div class="overlay" id="wasteItemModal"><div class="sheet wi-sheet"></div></div>');
    modal = document.getElementById('wasteItemModal');
    modal.addEventListener('change', e => {
      if(e.target.name === 'wiSide') modal.querySelectorAll('.wi-side').forEach(l => l.classList.toggle('is-on', l.querySelector('input').checked));
    });
    modal.addEventListener('click', e => {
      if(e.target === modal || e.target.closest('[data-wi-cancel]')){ modal.classList.remove('active'); return; }
      const sw = e.target.closest('[data-wi-color]');
      if(sw){
        wiColor = sw.dataset.wiColor;
        modal.querySelectorAll('[data-wi-color]').forEach(b => b.classList.toggle('is-on', b.dataset.wiColor === wiColor));
        return;
      }
      if(e.target.closest('[data-wi-save]')) wasteItemSave(modal.dataset.id);
      if(e.target.closest('[data-wi-delete]')) wasteItemDelete(modal.dataset.id);
    });
  }
  modal.dataset.id = id || '';
  const swatches = Object.keys(WASTE_COLORS).map(k => `<button type="button" class="wi-sw ${WASTE_COLORS[k] === wiColor ? 'is-on' : ''}" style="--c:${WASTE_COLORS[k]}" data-wi-color="${WASTE_COLORS[k]}" aria-label="${k}"></button>`).join('');
  modal.querySelector('.sheet').innerHTML = `
    <h2>${id ? 'Edit item' : 'Add item'}</h2>
    <label class="wi-field">Name<input type="text" id="wiName" value="${escapeHtml(it.name)}" autocomplete="off"></label>
    <label class="wi-field">Spanish name · Nombre<input type="text" id="wiEs" value="${escapeHtml(it.es || '')}" autocomplete="off"></label>
    <div class="wi-row2">
      <label class="wi-field">Category<input type="text" id="wiCat" list="wiCatList" value="${escapeHtml(it.cat)}" autocomplete="off"></label>
      <label class="wi-field">Unit<input type="text" id="wiUnit" list="wiUnitList" value="${escapeHtml(it.unit)}" autocomplete="off"></label>
    </div>
    <div class="wi-row2">
      <label class="wi-field">Cost per unit ($)<input type="number" id="wiCost" inputmode="decimal" step="0.01" min="0" value="${Number(it.cost) || 0}"></label>
      <label class="wi-field">Daily ceiling (0 = none)<input type="number" id="wiCeil" inputmode="numeric" step="1" min="0" value="${Number(it.ceil) || 0}"></label>
    </div>
    <div class="wi-lbl">Shows at</div>
    <div class="wi-sides">${[['foh', 'FOH'], ['boh', 'BOH'], ['both', 'Both']].map(([v, l]) => `<label class="wi-side ${side === v ? 'is-on' : ''}"><input type="radio" name="wiSide" value="${v}" ${side === v ? 'checked' : ''}> ${l}</label>`).join('')}</div>
    <div class="wi-lbl">Tile color</div>
    <div class="wi-swatches"><button type="button" class="wi-sw wi-sw-auto ${wiColor ? '' : 'is-on'}" data-wi-color="">Auto</button>${swatches}</div>
    <label class="wi-check"><input type="checkbox" id="wiActive" ${it.active !== false ? 'checked' : ''}> Show on the Waste tracker</label>
    <datalist id="wiCatList">${wasteCategories().map(c => `<option value="${escapeHtml(c)}">`).join('')}</datalist>
    <datalist id="wiUnitList"><option value="pc"><option value="portion"><option value="bun"><option value="cup"><option value="quart"><option value="each"></datalist>
    <div class="wi-btns">
      ${id ? `<button type="button" class="wi-danger" data-wi-delete>${wasteItemUsed(id) ? 'Hide' : 'Delete'}</button>` : ''}
      <span class="wi-grow"></span>
      <button type="button" class="btn btn-ghost" data-wi-cancel>Cancel</button>
      <button type="button" class="btn btn-primary" data-wi-save>Save</button>
    </div>`;
  modal.classList.add('active');
  if(!id) setTimeout(() => document.getElementById('wiName').focus(), 40);
}

async function wasteItemSave(id){
  const name = document.getElementById('wiName').value.trim();
  const cat = document.getElementById('wiCat').value.trim();
  if(!name){ showToast('Give the item a name'); return; }
  if(!cat){ showToast('Pick a category'); return; }
  const fields = {
    name, cat, es: document.getElementById('wiEs').value.trim(),
    unit: document.getElementById('wiUnit').value.trim() || 'pc',
    cost: Math.max(0, Math.round((parseFloat(document.getElementById('wiCost').value) || 0) * 100) / 100),
    ceil: Math.max(0, parseInt(document.getElementById('wiCeil').value, 10) || 0),
    active: document.getElementById('wiActive').checked,
    color: wasteValidColor(wiColor),
    side: (document.querySelector('input[name="wiSide"]:checked') || {}).value || 'both'
  };
  if(id){
    Object.assign(products.find(x => x.id === id), fields);
  } else {
    let nid = wasteSlug(name), n = 2;
    while(products.some(x => x.id === nid)) nid = wasteSlug(name) + '-' + (n++);
    products.push({id: nid, ...fields, ord: 1000});
  }
  document.getElementById('wasteItemModal').classList.remove('active');
  await saveProductsAndRefresh();
  showToast('✓ Saved');
}

async function wasteItemDelete(id){
  const p = products.find(x => x.id === id);
  if(!p) return;
  if(wasteItemUsed(id)){
    if(!confirm(`"${p.name}" has waste history, so it's hidden from the tracker instead of deleted. Continue?`)) return;
    p.active = false;
  } else {
    if(!confirm(`Delete "${p.name}"? It won't come back on future updates.`)) return;
    products = products.filter(x => x.id !== id);
    if(!deletedProductIds.includes(id)) deletedProductIds.push(id);
  }
  document.getElementById('wasteItemModal').classList.remove('active');
  await saveProductsAndRefresh();
}

document.getElementById('prodList').addEventListener('click', e => {
  if(e.target.closest('[data-wi-add]')){ wasteItemModal(null); return; }
  const row = e.target.closest('[data-wi-edit]');
  if(row){ wasteItemModal(row.dataset.wiEdit); return; }
  if(e.target.closest('[data-wi-unpriced]')){ wiUnpriced = !wiUnpriced; renderProductManager(); }
  if(e.target.closest('[data-wi-more]')){ wiShowAll = true; renderProductManager(); }
});
document.getElementById('prodList').addEventListener('input', e => {
  if(e.target.matches('[data-wi-search]')){ wiQuery = e.target.value; renderProductManager(); const s = document.querySelector('[data-wi-search]'); if(s){ s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }
});
document.getElementById('prodList').addEventListener('change', e => {
  if(e.target.matches('[data-wi-cat]')){ wiCat = e.target.value; renderProductManager(); }
});

document.addEventListener('click', (e) => {
  if(e.target && e.target.id === 'btnAddTXEvent'){
    txData.events.push({id: 'evt' + Date.now(), name: 'New Event', date: toLocalISODate(new Date())});
    renderTXManage(); txAutosave();
  }
  if(e.target && e.target.id === 'btnAddTXTrial'){
    txData.trialTrainers.push({id: 'trial' + Date.now(), name: 'New Trainer', startDate: toLocalISODate(new Date())});
    renderTXManage(); txAutosave();
  }
  if(e.target && e.target.id === 'btnAddTXCert'){
    txData.certCompetitive.push({id: 'cert' + Date.now(), name: 'New Person', level: 'Trainer', targetDate: toLocalISODate(new Date())});
    renderTXManage(); txAutosave();
  }
  if(e.target && e.target.id === 'btnAddTXCeleb'){
    txData.celebrations.push({id: 'celeb' + Date.now(), name: 'New Person', date: '01-01', type: 'birthday'});
    renderTXManage(); txAutosave();
  }
});

function wasteExportStatus(){
  const el = document.getElementById('monthCloseStatus');
  if(typeof renderWasteExport === 'function') renderWasteExport();
  if(el) el.textContent = wasteLogLastClosedOut
    ? `Last export: ${new Date(wasteLogLastClosedOut).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})} · ${entries.length} entries on file (the last ${WASTE_KEEP_DAYS} days)`
    : `${entries.length} entries on file (the last ${WASTE_KEEP_DAYS} days)`;
}

function generateWastePdf(list, label, fileName){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text('CFA Buda — Waste Log', 14, 18);
  doc.setFontSize(10);
  doc.text(label, 14, 25);

  const sorted = [...list].sort((a,b)=>a.ts-b.ts);
  let y = 38;
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text('Date/Time', 14, y);
  doc.text('Product', 55, y);
  doc.text('Qty', 118, y);
  doc.text('Cost', 138, y);
  doc.text('By', 160, y);
  doc.text('Section', 178, y);
  doc.setFont(undefined, 'normal');
  y += 5;
  doc.setLineWidth(0.2);
  doc.line(14, y - 3, 196, y - 3);
  y += 3;

  sorted.forEach(e=>{
    if(y > 280){ doc.addPage(); y = 20; }
    doc.text(new Date(e.ts).toLocaleString('en-US', {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'}), 14, y);
    doc.text(String(wasteItemFor(e).name).slice(0, 32), 55, y);
    doc.text(`${e.qty}${e.unit || ''}`, 118, y);
    doc.text(`$${(Number(e.cost) || 0).toFixed(2)}`, 138, y);
    doc.text(e.who || '', 160, y);
    doc.text(String(e.section || '').toUpperCase(), 178, y);
    y += 6;
  });

  const total = list.reduce((sum,e)=>sum+(Number(e.cost) || 0),0);
  y += 3;
  doc.setLineWidth(0.4);
  doc.line(14, y - 3, 196, y - 3);
  y += 4;
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text(`Total Waste: $${total.toFixed(2)}`, 14, y);
  doc.text(`Entries: ${list.length}`, 110, y);
  const side = s => list.filter(e => e.section === s).reduce((sum, e) => sum + (Number(e.cost) || 0), 0);
  if(list.some(e => e.section === 'foh') && list.some(e => e.section === 'boh')){
    y += 6;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`FOH $${side('foh').toFixed(2)} · BOH $${side('boh').toFixed(2)}`, 14, y);
  }

  doc.save(fileName || `cfa-buda-waste-log-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`);
}

function setSyncStatus(msg, cls){
  const el = document.getElementById('syncStatus');
  if(!el) return; // defensive: this fires on every save app-wide, never let a missing element crash a save
  el.textContent = msg;
  el.className = 'sync-status' + (cls?(' '+cls):'');
}

document.getElementById('btnDownloadTodayCsv').addEventListener('click', ()=>{
  const todayEntries = entries.filter(e => toLocalISODate(new Date(e.ts)) === today);
  if(todayEntries.length === 0){ showToast('No entries logged yet today'); return; }
  const rows = [['Date/Time','Product','Qty','Unit','Unit Cost','Total Cost','Logged By','Section']];
  [...todayEntries].sort((a,b)=>b.ts-a.ts).forEach(e=>{
    rows.push([new Date(e.ts).toLocaleString(), e.name, e.qty, e.unit, e.unitCost.toFixed(2), e.cost.toFixed(2), e.who, e.section.toUpperCase()]);
  });
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cfa-buda-waste-today-${today}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

(async function(){
  try{
    await loadState();
  } finally {
    resolveStateLoaded();
  }
  renderGrid();
  renderTape();
  renderScoreboardView();
  renderLXScoreboard();
  renderGXScoreboard();
  renderTXScoreboard();
  renderHomeScoreboard();
  renderTrainingGuides('bohTrainingGuidesContainer', bohTrainingGuidesData, true);
  renderTrainingGuides('fohTrainingGuidesContainer', fohTrainingGuidesData, false);
  // The page on screen (Set Ups, for the team) was drawn before the saved
  // data arrived, so its roster and assignments were empty: draw it again.
  stateRerender();
})();
