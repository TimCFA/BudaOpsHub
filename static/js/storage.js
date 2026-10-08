// ===== FIREBASE (via Flask proxy) =====
const API_BASE = window.location.origin === 'file://' ? 'http://localhost:5000' : window.location.origin;

// The saved data is split into sections (state/<name> on the server). A save
// sends only what changed — "Drinks 1 = Avah", "add this waste entry" — and
// the server applies it to the latest data (see state-patch.js), so two
// people saving at once both keep their changes. Other people's changes
// arrive on their own: when the page comes back into view and every 30
// seconds while it's open. Must match STATE_SECTIONS in app.py
// (tests/test_state.py checks); a key in no section goes to 'misc'.
const STATE_SECTIONS = {
  manager: ['wasteTarget', 'safeTarget', 'products', 'deletedProductIds', 'productFixesVersion',
            'productCategoryOrder', 'lxPillars', 'lxMetrics', 'lxLastUpdated', 'gxData', 'txData',
            'homeData', 'dataUploadLog', 'dataUploadSettings', 'productivityProfiles', 'reportData',
            'launchMode', 'storeEvents'],
  pea: ['peaRatings', 'peaNameAliases'],
  rosters: ['fohRoster', 'bohRoster', 'rosterPosted', 'truckShifts'],
  setups: ['posAssignments', 'posVacancyFlags', 'setupDayTypes', 'lastUpdated',
           'breakCountdowns', 'completedBreaks', 'zoneOwners', 'posNotes'],
  history: ['setupHistory', 'numbersHistory', 'wasteMonthlyHistory', 'zoneChecklistHistory'],
  waste: ['entries', 'wasteDays', 'formDone', 'formDoneDate', 'wasteLogLastClosedOut'],
  ops: ['foodSafetyDays', 'foodSafetyWalkthroughs', 'fohOEDays', 'fohOEChecked', 'fohOECheckedDate',
        'fohLeaderTransitionChecked', 'fohLeaderTransitionDate', 'zoneChecklistState',
        'numbersData'],
  safe: ['safeCounts'],
  people: ['eoiSubmissions', 'trainerTrainees', 'trainerProgress', 'teamLeadTrainees',
           'teamLeadProgress', 'scoreboardItems'],
  prep: ['prepBuffers', 'prepSoldEntries', 'prepWasteEntries', 'prepStockoutEvents', 'prepHistorySeeded'],
  prepTimes: ['prepTimes', 'prepTimers'],
  cem: ['cemEntries'],
  forecast: ['salesHistory', 'forecastSettings', 'forecastLog', 'daypartWeeks'],
  misc: []
};
const STATE_SECTION_OF = {};
Object.entries(STATE_SECTIONS).forEach(([name, keys]) => keys.forEach(k => { STATE_SECTION_OF[k] = name; }));

// What the server has for each section, as this page last heard: the data
// (stateBase, a separate copy — never the live objects), the same as a string
// (savedSections, for a quick "anything changed?"), and its version tag
// ('?' when unknown, e.g. the server couldn't be reached at load).
let stateBase = {};
let savedSections = {};
let stateVersions = {};

async function statePost(path, body){
  try{
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    });
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }catch(err){
    console.error(`${path} failed:`, err);
    return null;
  }
}

// Everything the app saves, in one place (saves and the backup file).
function stateSnapshot(){
  return {
    entries, products, wasteTarget, formDone,
    formDoneDate: formDone ? today : null, foodSafetyDays, wasteDays, breakCountdowns, completedBreaks, posAssignments,
    fohRoster, bohRoster, rosterPosted, lxPillars, lxMetrics, lxLastUpdated, gxData, txData, homeData,
    fohOEDays, fohOEChecked, fohOECheckedDate,
    fohLeaderTransitionChecked, fohLeaderTransitionDate,
    eoiSubmissions, zoneChecklistState, zoneChecklistHistory, numbersData, lastUpdated,
    safeCounts, trainerTrainees, trainerProgress, teamLeadTrainees, teamLeadProgress, scoreboardItems, posVacancyFlags, wasteLogLastClosedOut, deletedProductIds, productFixesVersion, productCategoryOrder, wasteMonthlyHistory,
    prepBuffers, prepSoldEntries, prepWasteEntries, prepStockoutEvents, prepHistorySeeded, cemEntries, foodSafetyWalkthroughs, setupHistory, peaRatings, peaNameAliases, numbersHistory, setupDayTypes, dataUploadLog, dataUploadSettings, productivityProfiles, reportData, launchMode, prepTimes, prepTimers,
    salesHistory, forecastSettings, forecastLog, daypartWeeks, zoneOwners, posNotes, storeEvents, truckShifts
  };
}

// {section: JSON string}, keys in a fixed order so an unchanged section
// always serializes the same way.
function stateSections(snapshot){
  const out = {};
  Object.entries(STATE_SECTIONS).forEach(([name, keys])=>{
    const part = {};
    keys.forEach(k => { if(k in snapshot) part[k] = snapshot[k] === undefined ? null : snapshot[k]; });
    if(name === 'misc') Object.keys(snapshot).forEach(k => { if(!STATE_SECTION_OF[k]) part[k] = snapshot[k] === undefined ? null : snapshot[k]; });
    out[name] = JSON.stringify(part);
  });
  return out;
}

// One section's saved form, keys in the fixed order (for comparing).
function stateSectionString(name, part){
  if(name === 'misc' || !STATE_SECTIONS[name]) return JSON.stringify(part);
  const ordered = {};
  STATE_SECTIONS[name].forEach(k => { if(k in part) ordered[k] = part[k]; });
  return JSON.stringify(ordered);
}

async function saveOnce(){
  const snapshot = stateSnapshot();
  // The phone's own copy (for when the server can't be reached). Browsers
  // cap this at ~5 MB; if it's full, saving to the server still goes ahead.
  try{ localStorage.setItem('cfaBudaOps', JSON.stringify(snapshot)); }catch(e){ console.warn('Local copy not saved:', e); }
  const sections = stateSections(snapshot);
  const patches = {}, sent = {};
  Object.keys(sections).forEach(name=>{
    if(sections[name] === savedSections[name]) return;
    const mine = JSON.parse(sections[name]);
    if(!(name in stateBase)){
      // Never heard what the server has (the load broke): start from here,
      // so this page can't replace the server's copy with its own.
      stateBase[name] = mine; savedSections[name] = sections[name]; stateVersions[name] = '?';
      return;
    }
    const ops = stateDiff(stateBase[name] || {}, mine);
    if(!ops.length){ stateBase[name] = mine; savedSections[name] = sections[name]; return; }
    patches[name] = {ver: stateVersions[name] || '?', ops};
    sent[name] = sections[name];
  });
  if(!Object.keys(patches).length){ setSyncStatus('Synced', 'ok'); return; }
  const result = await statePost('/api/state/patch', {patches});
  if(result){
    Object.keys(sent).forEach(name=>{
      if(result.sections && name in result.sections) return;   // someone else changed it too: merged below
      stateBase[name] = JSON.parse(sent[name]);
      savedSections[name] = sent[name];
      stateVersions[name] = result.versions[name];
    });
    stateAdoptServer(result.sections, result.versions, sent);
    stateNoteBuild(result.build);
  }
  setSyncStatus(result ? 'Synced' : 'Saved locally — sync failed', result ? 'ok' : 'error');
  // The server saved everything except manager-only fields (products, team,
  // targets, hub content) because there's no manager session. Harmless for
  // team members; if Manage is open, the manager's sign-in has expired and
  // their edits there didn't save, so say so and lock Manage again.
  if(result && result.managerFieldsIgnored && document.getElementById('manageContent').style.display === 'block'){
    document.getElementById('manageContent').style.display = 'none';
    document.getElementById('pinGate').style.display = 'block';
    showToast('Manager sign-in expired — sign in again and redo your Manage changes');
  }
}

// The server's latest copy of some sections: keep this page's changes the
// server hasn't seen yet (made since `sent`, or since the last copy we had)
// on top of it, and put the result on screen.
function stateAdoptServer(serverSections, versions, sent){
  const names = Object.keys(serverSections || {}).filter(n => STATE_SECTIONS[n]);
  if(!names.length) return false;
  const current = stateSections(stateSnapshot());
  const parts = {};
  names.forEach(name=>{
    let latest;
    try{ latest = JSON.parse(serverSections[name]); }catch(e){ return; }
    // A section this page never had (a private one arriving after a manager
    // signs in): the server's copy as it is. What the page holds for it is
    // only defaults, never changes to keep.
    const since = sent && sent[name] ? JSON.parse(sent[name]) : stateBase[name];
    const pending = since ? stateDiff(since, JSON.parse(current[name])) : [];
    parts[name] = pending.length ? stateApplyOps(latest, pending) : latest;
    stateBase[name] = JSON.parse(serverSections[name]);
    savedSections[name] = stateSectionString(name, stateBase[name]);
    stateVersions[name] = versions[name];
  });
  stateAdoptLocal(parts);
  return true;
}

// Make these section values the page's own, keeping the objects already on
// screen where nothing changed (so anything holding one stays in step).
function stateAdoptLocal(parts){
  const data = stateSnapshot();
  Object.entries(parts).forEach(([name, part])=>{
    STATE_SECTIONS[name].forEach(k => { data[k] = stateReconcile(data[k], part[k]); });
  });
  applyStateData(data);
  calcStreak();
}

function stateReconcile(cur, next){
  if(stateIsObj(cur) && stateIsObj(next)){
    Object.keys(cur).forEach(k => { if(!stateHas(next, k)) delete cur[k]; });
    Object.keys(next).forEach(k => { cur[k] = stateReconcile(stateHas(cur, k) ? cur[k] : undefined, next[k]); });
    return cur;
  }
  if(Array.isArray(cur) && Array.isArray(next)){
    const pool = new Map();
    cur.forEach(item => { const k = stateCanon(item); if(!pool.has(k)) pool.set(k, []); pool.get(k).push(item); });
    const items = next.map(item => { const same = pool.get(stateCanon(item)); return same && same.length ? same.shift() : item; });
    cur.length = 0;
    items.forEach(item => cur.push(item));
    return cur;
  }
  return next;
}

// One save at a time, so an older save can never land after a newer one.
// Saves asked for meanwhile are folded into one more pass, and every caller's
// promise resolves once its change has gone out.
let saveInFlight = null;
let saveAgain = false;
function saveState(){
  if(saveInFlight){ saveAgain = true; return saveInFlight; }
  saveInFlight = (async ()=>{
    try{
      do { saveAgain = false; await saveOnce(); } while(saveAgain);
    } finally {
      saveInFlight = null;
    }
  })();
  return saveInFlight;
}

// The full backup comes from the server, read fresh from the database:
// every section, including what other devices saved a moment ago and the
// manager-only ones this page may not have loaded. If the server can't be
// reached it says so and downloads nothing, rather than a partial file that
// looks complete. When it was last downloaded is remembered on this device.
const FULL_BACKUP_KEY = 'cfaBudaLastFullBackup';

function fullBackupStatusText(){
  let at = null;
  try{ at = Number(localStorage.getItem(FULL_BACKUP_KEY)) || null; }catch(e){}
  return at ? `Last full backup on this device: ${new Date(at).toLocaleString('en-US', {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})}` : 'No full backup downloaded on this device yet.';
}

function renderFullBackupStatus(){
  const el = document.getElementById('fullBackupStatus');
  if(el) el.textContent = fullBackupStatusText();
}

async function exportBackup(){
  const btn = document.getElementById('btnExportBackup');
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Preparing backup…';
  try{
    const res = await fetch(`${API_BASE}/api/state/export`, {method: 'POST'});
    if(res.status === 403){ showToast('Sign in to Manage again, then download the backup'); return; }
    if(!res.ok){ showToast('Couldn’t get the backup from the server. Nothing was downloaded; try again.'); return; }
    const blob = await res.blob();
    const name = ((res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/) || [])[1] || `budaopshub-full-backup-${today}.json`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    try{ localStorage.setItem(FULL_BACKUP_KEY, String(Date.now())); }catch(e){}
    renderFullBackupStatus();
    showToast(`✓ Full backup downloaded (${Math.max(1, Math.round(blob.size / 1024)).toLocaleString('en-US')} KB)`);
  }catch(e){
    console.warn('Full backup failed:', e);
    showToast('Couldn’t reach the server. Nothing was downloaded; check the connection and try again.');
  }finally{
    btn.disabled = false;
    btn.textContent = label;
  }
}

document.getElementById('btnExportBackup').addEventListener('click', exportBackup);
renderFullBackupStatus();

async function loadState(){
  // Every script must have run first: the data goes into variables some of
  // them declare (a quick answer could otherwise arrive before they exist).
  if(document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, {once: true}));
  stateStartSync();
  let data = null;
  const loaded = await statePost('/api/state/load', {});
  if(loaded && loaded.sections && Object.keys(loaded.sections).length){
    data = {};
    Object.entries(loaded.sections).forEach(([name, str])=>{
      try{
        const part = JSON.parse(str);
        Object.assign(data, part);
        stateBase[name] = JSON.parse(str);
        // Remember it as this page serializes it, so an unchanged section
        // isn't re-sent on the first save.
        savedSections[name] = stateSectionString(name, part);
        stateVersions[name] = (loaded.versions || {})[name] || '?';
      }catch(e){ console.warn(`Could not read saved section ${name}:`, e); }
    });
    stateNoteBuild(loaded.build);
  }
  if(!data){
    const saved = localStorage.getItem('cfaBudaOps');
    if(saved) data = JSON.parse(saved);
  }
  if(data) applyStateData(data);
  if(Object.keys(stateVersions).length){
    // Sections the server holds back from this device (private ones, without
    // a manager session): start from the page's empty defaults, so what's
    // added here (a leader's safe count) is sent as an addition the server
    // merges in. The server never lets such a device change or remove them.
    const start = stateSections(stateSnapshot());
    Object.keys(STATE_SECTIONS).forEach(name=>{
      if(name in stateBase) return;
      stateBase[name] = JSON.parse(start[name]);
      savedSections[name] = start[name];
      stateVersions[name] = '?';
    });
  } else {
    // The server couldn't be reached: count what this page starts with as
    // the base, so only changes made here are sent once it's back (merged
    // into whatever the server has, never replacing it).
    const start = stateSections(stateSnapshot());
    Object.keys(start).forEach(name=>{
      stateBase[name] = JSON.parse(start[name]);
      savedSections[name] = start[name];
      stateVersions[name] = '?';
    });
  }
  if(data){
    const migrated = migrateLegacyWeekdayKeys();
    // Log finished set ups and numbers before the two-week prune removes them.
    const archivedSetups = archiveSetupHistory();
    const archivedNumbers = archiveNumbersHistory();
    const prunedDayTypes = pruneSetupDayTypes();
    const prunedDates = pruneOldDateData();
    const prunedChecklists = pruneZoneChecklistData();
    const prunedFoodSafety = fsPruneOldWalkthroughs();
    if(migrated || archivedSetups || archivedNumbers || prunedDayTypes || prunedDates || prunedChecklists || prunedFoodSafety) await saveState();
    calcStreak();
  }
}

// Puts saved data into the page's variables (at load, and when other
// people's changes arrive). `data` holds every saved key.
function applyStateData(data){
  entries = data.entries || [];
  // Tracks products the user has explicitly deleted, so a default item never
  // silently reappears on the next load just because it's "missing" from
  // their saved list — missing now means "deleted", not "needs restoring".
  deletedProductIds = data.deletedProductIds || [];
  const defaultProducts = wasteDefaultProducts();
  const fixesDone = data.productFixesVersion || 0;
  if(data.products && fixesDone >= 4){
    const savedIds = new Set(data.products.map(p=>p.id));
    const missingDefaults = defaultProducts.filter(p=>!savedIds.has(p.id) && !deletedProductIds.includes(p.id));
    products = [...data.products, ...missingDefaults];
    if(fixesDone < 5){
      // Fix 5: costs from the Menu Details report. An item still at its old
      // catalog cost (or with none) takes the new one; a typed-in cost stays.
      products.forEach(p=>{
        const fix = WASTE_PRICE_FIX_5[p.id];
        if(fix && (!(Number(p.cost) > 0) || Math.abs(Number(p.cost) - fix[0]) < 0.005)) p.cost = fix[1];
      });
    }
    if(fixesDone < 6){
      // Fix 6: each item gets its side (FOH / BOH); items added in Manage
      // that the catalog doesn't know show on both.
      products.forEach(p=>{ if(!WASTE_SIDES.includes(p.side)) p.side = WASTE_CATALOG_IDS.has(p.id) ? wasteDefaultSide(p.id) : 'both'; });
    }
  } else if(data.products){
    // Fix 4: the Waste tracker's catalog replaces the old Log Waste list.
    // A price a manager had typed in for an old item carries to the item it
    // became (WASTE_LEGACY_MAP); every other price is the catalog's.
    products = defaultProducts;
    data.products.forEach(old=>{
      const id = WASTE_LEGACY_MAP[old.id];
      const p = id && products.find(x => x.id === id);
      if(p && Number(old.cost) > 0) p.cost = Number(old.cost);
    });
    deletedProductIds = [];
  } else {
    products = defaultProducts;
  }
  products.forEach(p=>{ p.ceil = Number(p.ceil) || 0; p.cost = Number(p.cost) || 0; if(p.active === undefined) p.active = true; });
  productFixesVersion = PRODUCT_FIXES_VERSION;
  productCategoryOrder = Object.assign({foh: [], boh: []}, data.productCategoryOrder || {});
  wasteTarget = data.wasteTarget || 100;
  safeCounts = data.safeCounts || [];
  foodSafetyDays = data.foodSafetyDays || [];
  foodSafetyWalkthroughs = data.foodSafetyWalkthroughs || {};
  wasteDays = data.wasteDays || [];
  breakCountdowns = data.breakCountdowns || {};
  completedBreaks = data.completedBreaks || {};
  posAssignments = data.posAssignments || {};
  lxPillars = data.lxPillars || defaultPillars;
  lxMetrics = data.lxMetrics || defaultMetrics;
  lxLastUpdated = data.lxLastUpdated || null;
  gxData = data.gxData || JSON.parse(JSON.stringify(defaultGXData));
  // Backfill any sub-fields added to defaultGXData since this store's gxData
  // was last saved (e.g. a new CEM metric breakdown) — never overwrites a
  // value already there, just adds what's missing, so a newly-added field
  // actually shows up on an already-saved scoreboard instead of silently
  // not existing until the next full re-save.
  if(data.gxData){
    Object.keys(defaultGXData).forEach(section=>{
      const def = defaultGXData[section];
      if(!def || typeof def !== 'object' || Array.isArray(def)) return;
      if(!gxData[section]) gxData[section] = {};
      Object.keys(def).forEach(key=>{
        if(!(key in gxData[section])) gxData[section][key] = JSON.parse(JSON.stringify(def[key]));
      });
    });
  }
  txData = data.txData || JSON.parse(JSON.stringify(defaultTXData));
  homeData = data.homeData || JSON.parse(JSON.stringify(defaultHomeData));
  storeEvents = Array.isArray(data.storeEvents) ? data.storeEvents : null;   // null: October's calendar as typed in (events.js)
  truckShifts = (data.truckShifts && typeof data.truckShifts === 'object' && !Array.isArray(data.truckShifts)) ? data.truckShifts : {};
  if(typeof evRerender === 'function') evRerender();
  if(data.fohRoster) Object.assign(fohRoster, data.fohRoster);
  if(data.bohRoster) Object.assign(bohRoster, data.bohRoster);
  rosterPosted = (data.rosterPosted && typeof data.rosterPosted === 'object' && !Array.isArray(data.rosterPosted)) ? data.rosterPosted : {};
  formDone = data.formDoneDate === today ? !!data.formDone : false;
  fohOEDays = data.fohOEDays || [];
  fohOECheckedDate = data.fohOECheckedDate || null;
  fohOEChecked = (fohOECheckedDate === today) ? (data.fohOEChecked || {}) : {};
  fohLeaderTransitionDate = data.fohLeaderTransitionDate || null;
  fohLeaderTransitionChecked = (fohLeaderTransitionDate === today) ? (data.fohLeaderTransitionChecked || {}) : {};
  eoiSubmissions = data.eoiSubmissions || [];
  zoneChecklistState = data.zoneChecklistState || {};
  zoneChecklistHistory = data.zoneChecklistHistory || {};
  numbersData = data.numbersData || {};
  if(typeof knNormalizeAll === 'function') knNormalizeAll();   // the four dayparts (know-numbers.js)
  lastUpdated = data.lastUpdated || {};
  trainerTrainees = data.trainerTrainees || [];
  trainerProgress = data.trainerProgress || {};
  teamLeadTrainees = data.teamLeadTrainees || [];
  teamLeadProgress = data.teamLeadProgress || {};
  prepBuffers = Object.assign({}, PB_DEFAULT_BUFFERS, data.prepBuffers || {});
  prepSoldEntries = data.prepSoldEntries || [];
  prepWasteEntries = data.prepWasteEntries || [];
  prepStockoutEvents = data.prepStockoutEvents || [];
  prepHistorySeeded = data.prepHistorySeeded || false;
  prepTimes = Array.isArray(data.prepTimes) ? data.prepTimes : [];
  prepTimers = Array.isArray(data.prepTimers) ? data.prepTimers : [];
  cemEntries = data.cemEntries || [];
  dataUploadLog = (data.dataUploadLog && typeof data.dataUploadLog === 'object' && !Array.isArray(data.dataUploadLog)) ? data.dataUploadLog : {};
  dataUploadSettings = (data.dataUploadSettings && typeof data.dataUploadSettings === 'object') ? data.dataUploadSettings : {};
  productivityProfiles = (data.productivityProfiles && typeof data.productivityProfiles === 'object' && !Array.isArray(data.productivityProfiles)) ? data.productivityProfiles : {};
  reportData = (data.reportData && typeof data.reportData === 'object' && !Array.isArray(data.reportData)) ? data.reportData : {};
  // Launch mode is on unless a manager turned it off. Only "off" is saved
  // (undefined isn't), so pages without a manager never send the setting.
  launchMode = data.launchMode === false ? false : undefined;
  if(typeof launchApply === 'function') launchApply();
  scoreboardItems = data.scoreboardItems || [];
  posVacancyFlags = data.posVacancyFlags || {};
  // Zone resets handed to extra people, and signed position notes (zone-reset.js).
  zoneOwners = (data.zoneOwners && typeof data.zoneOwners === 'object' && !Array.isArray(data.zoneOwners)) ? data.zoneOwners : {};
  posNotes = (data.posNotes && typeof data.posNotes === 'object' && !Array.isArray(data.posNotes)) ? data.posNotes : {};
  setupHistory = normalizeSetupHistory(data.setupHistory);
  peaRatings = normalizePeaRatings(data.peaRatings);
  peaNameAliases = (data.peaNameAliases && typeof data.peaNameAliases === 'object') ? data.peaNameAliases : {};
  numbersHistory = (data.numbersHistory && typeof data.numbersHistory === 'object') ? data.numbersHistory : {};
  // The monthly waste close-out: its date and each closed month's summary.
  // (Saved all along but never read back, so a reload then a save wiped them.)
  wasteLogLastClosedOut = data.wasteLogLastClosedOut || null;
  wasteMonthlyHistory = (data.wasteMonthlyHistory && typeof data.wasteMonthlyHistory === 'object' && !Array.isArray(data.wasteMonthlyHistory)) ? data.wasteMonthlyHistory : {};
  setupDayTypes = (data.setupDayTypes && typeof data.setupDayTypes === 'object') ? data.setupDayTypes : {};
  if(typeof suMigrateDaypartNames === 'function') suMigrateDaypartNames();   // renamed dayparts, after everything it moves has loaded (zone-reset.js)
  // Daily sales and labor history and the Forecast page's settings
  // (manager sessions only — a page without one keeps them empty).
  salesHistory = (data.salesHistory && typeof data.salesHistory === 'object' && !Array.isArray(data.salesHistory)) ? data.salesHistory : {};
  forecastSettings = (data.forecastSettings && typeof data.forecastSettings === 'object' && !Array.isArray(data.forecastSettings)) ? data.forecastSettings : {};
  forecastLog = (data.forecastLog && typeof data.forecastLog === 'object' && !Array.isArray(data.forecastLog)) ? data.forecastLog : {};
  daypartWeeks = (data.daypartWeeks && typeof data.daypartWeeks === 'object' && !Array.isArray(data.daypartWeeks)) ? data.daypartWeeks : {};
}

// ===== OTHER PEOPLE'S CHANGES =====
// Asks the server "anything new?" when the page comes back into view and
// every 30 seconds while it's on screen. The answer is tiny unless something
// changed, and then it's only the sections that did.
const STATE_SYNC_EVERY = 30000;
let stateSyncing = false;
let stateLastSync = 0;
let stateRerenderPending = false;
let stateBuild = null;

async function syncState(){
  if(stateSyncing || saveInFlight || !Object.keys(stateVersions).length) return;
  stateSyncing = true;
  try{
    const reply = await statePost('/api/state/sync', {versions: stateVersions});
    // A save that started meanwhile brings the news itself.
    if(!reply || saveInFlight) return;
    stateLastSync = Date.now();
    stateNoteBuild(reply.build);
    if(stateAdoptServer(reply.sections, reply.versions, null)) stateRerender();
    else if(stateRerenderPending) stateRerender();
  } finally {
    stateSyncing = false;
  }
}

// Set Ups' Refresh: a leader checking their set up is the latest. Asks the
// server for just the set up and roster sections (a tiny reply when nothing
// changed, and served from the server's memory, so no database read), after
// any save of this page's own has gone out. Resolves to {ok, changed}.
const SETUP_REFRESH_SECTIONS = ['setups', 'rosters'];
async function refreshSetups(){
  if(saveInFlight){ try{ await saveInFlight; }catch(e){} }
  if(!Object.keys(stateVersions).length) return {ok: false, changed: false};
  const reply = await statePost('/api/state/sync', {versions: stateVersions, only: SETUP_REFRESH_SECTIONS});
  if(!reply) return {ok: false, changed: false};
  stateNoteBuild(reply.build);
  const changed = stateAdoptServer(reply.sections, reply.versions, null);
  return {ok: true, changed};
}

function stateStartSync(){
  if(stateStartSync.started) return;
  stateStartSync.started = true;
  const soon = () => { if(document.visibilityState === 'visible' && Date.now() - stateLastSync > 5000) syncState(); };
  setInterval(() => { if(document.visibilityState === 'visible') syncState(); }, STATE_SYNC_EVERY);
  document.addEventListener('visibilitychange', soon);
  window.addEventListener('focus', soon);
  window.addEventListener('online', soon);
  // Redraw held back while someone was typing or had a window open.
  document.addEventListener('focusout', () => setTimeout(() => { if(stateRerenderPending) stateRerender(); }, 300));
  document.addEventListener('click', () => setTimeout(() => { if(stateRerenderPending) stateRerender(); }, 300));
}

// A dialog that's actually showing. The person picker's sheet is in the
// page all the time (hidden until a spot is tapped), so an attribute alone
// doesn't count — it has to be on screen.
function stateDialogOpen(){
  return [...document.querySelectorAll('.overlay.active, [aria-modal="true"]')].some(el => el.offsetParent !== null || (el.classList.contains('overlay') && el.classList.contains('active')));
}

// Someone typing, or a pop-up open: redrawing now would wipe what they're
// doing, so it waits. A box that merely has focus with nothing typed (the
// initials box after a page load, a field a tablet was left on) doesn't
// hold the page — that's how Set Ups stayed empty until the next tap.
function stateUserBusy(){
  if(stateDialogOpen()) return true;
  const el = document.activeElement;
  if(el && el.matches && el.matches('textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"])')){
    if(el.isContentEditable) return true;
    return el.value !== el.defaultValue;
  }
  return false;
}

// ===== NEW DAY =====
// `today` is worked out once when the page loads, and screens all over the
// app file things under it (waste days, checklists, safe counts, breaks,
// history). A tablet left open past midnight would keep using yesterday. So
// once the date changes, the page reloads itself (fresh date, fresh data)
// as soon as that's safe: every change is on the server, nothing is saving,
// nobody is mid-typing and no pop-up is open. Until then it checks again
// every minute and whenever the page comes back into view.
function stateEverythingSaved(){
  if(saveInFlight || stateSyncing) return false;
  const current = stateSections(stateSnapshot());
  return Object.keys(current).every(name => current[name] === savedSections[name]);
}

function stateMidEdit(){
  if(stateDialogOpen()) return true;
  // A box that's focused but untouched (a tablet left sitting on an empty
  // field overnight) doesn't count; one with something typed in it does.
  const el = document.activeElement;
  if(el && el.matches && el.matches('textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"])')){
    if(el.isContentEditable) return true;
    return el.value !== el.defaultValue;
  }
  return false;
}

function stateReloadIfNewDay(){
  if(toLocalISODate(new Date()) === today) return;
  if(navigator.onLine === false) return;   // a reload offline would show an error page
  if(stateMidEdit() || !stateEverythingSaved()) return;
  location.reload();
}

setInterval(stateReloadIfNewDay, 60000);
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') stateReloadIfNewDay(); });
window.addEventListener('focus', stateReloadIfNewDay);
window.addEventListener('online', stateReloadIfNewDay);

function stateRerender(){
  if(stateUserBusy()){ stateRerenderPending = true; return; }
  stateRerenderPending = false;
  const view = document.querySelector('.view.active');
  if(view && typeof activateView === 'function') activateView(view.id.replace(/View$/, ''));
  if(typeof renderWasteMeters === 'function') renderWasteMeters();   // the header meter is on every page
}

// A new version of the hub went live: offer a reload (never forced — it
// could interrupt someone mid-task).
function stateNoteBuild(build){
  if(!build) return;
  if(stateBuild === null){ stateBuild = build; return; }
  if(build === stateBuild || document.getElementById('updateBanner')) return;
  const bar = document.createElement('div');
  bar.id = 'updateBanner';
  bar.className = 'update-banner';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<span>A new version of the hub is ready.</span><button type="button">Reload</button>';
  bar.querySelector('button').addEventListener('click', () => location.reload());
  document.body.appendChild(bar);
}

// Streaks count open days in a row. The store is closed Sundays, so
// Saturday → Monday still counts as "in a row". Today doesn't have to be
// earned yet, but a streak whose last day is before the last open day has
// lapsed and shows 0 rather than an old number.
function isoAddDays(iso, n){
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toLocalISODate(d);
}
function prevOpenDay(iso){
  const p = isoAddDays(iso, -1);
  return new Date(p + 'T00:00:00').getDay() === 0 ? isoAddDays(p, -1) : p;
}
function openDayStreak(days){
  const set = new Set(days);
  let d = set.has(today) ? today : prevOpenDay(today);
  let c = 0;
  while(set.has(d)){ c++; d = prevOpenDay(d); }
  return c;
}

function calcStreak(){
  foodSafetyStreak = openDayStreak(foodSafetyDays);
  wasteStreak = openDayStreak(wasteDays);
  fohOEStreak = openDayStreak(fohOEDays);
}

// Fixed: this used to sum EVERY entry ever logged, not just today's — meaning
// "Today's Waste Target" was actually showing a lifetime running total, and
// the under-target streak could never increment again once lifetime waste
// passed the target. Now correctly scoped to today's date only.
function getTodayTotal(){
  return entries.filter(e => toLocalISODate(new Date(e.ts)) === today).reduce((sum,e)=>sum+e.cost,0);
}

function updateClock(){
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
setInterval(updateClock, 1000);
updateClock();

const pillarStyles = {
  pillar1: {color: '#6A4C93', tint: '#F1ECFA', icon: '🎯'},
  pillar2: {color: '#1B9AAA', tint: '#E6F6F8', icon: '🤝'},
  pillar3: {color: '#C41E3A', tint: '#FBE9EB', icon: '⚡'},
  pillar4: {color: '#FF6F61', tint: '#FFEEEC', icon: '💰'},
  pillar5: {color: '#F5A623', tint: '#FFF6E6', icon: '📈'},
  pillar6: {color: '#B5838D', tint: '#F9EEF0', icon: '❤️'}
};
const ratingIcons = {1: '⚠️', 2: '✓', 3: '🌟'};
