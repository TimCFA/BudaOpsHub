// ===== FIREBASE (via Flask proxy) =====
const API_BASE = window.location.origin === 'file://' ? 'http://localhost:5000' : window.location.origin;

// The saved data is split into sections (state/<name> on the server), and a
// save sends only the sections that changed since the last save — a Set Ups
// tap sends the set ups, not PEA ratings, history and Sales Mix too. Must
// match STATE_SECTIONS in app.py (tests/test_state.py checks); a key in no
// section goes to 'misc'.
const STATE_SECTIONS = {
  manager: ['wasteTarget', 'safeTarget', 'products', 'deletedProductIds', 'productFixesVersion',
            'productCategoryOrder', 'lxPillars', 'lxMetrics', 'lxLastUpdated', 'gxData', 'txData',
            'homeData', 'dataUploadLog', 'dataUploadSettings', 'productivityProfiles'],
  pea: ['peaRatings', 'peaNameAliases'],
  rosters: ['fohRoster', 'bohRoster'],
  setups: ['posAssignments', 'posVacancyFlags', 'setupDayTypes', 'lastUpdated',
           'breakCountdowns', 'completedBreaks'],
  history: ['setupHistory', 'numbersHistory', 'wasteMonthlyHistory', 'zoneChecklistHistory'],
  waste: ['entries', 'wasteDays', 'formDone', 'formDoneDate', 'wasteLogLastClosedOut'],
  ops: ['foodSafetyDays', 'foodSafetyWalkthroughs', 'fohOEDays', 'fohOEChecked', 'fohOECheckedDate',
        'fohLeaderTransitionChecked', 'fohLeaderTransitionDate', 'zoneChecklistState',
        'numbersData', 'safeCounts'],
  people: ['eoiSubmissions', 'trainerTrainees', 'trainerProgress', 'teamLeadTrainees',
           'teamLeadProgress', 'scoreboardItems'],
  prep: ['prepBuffers', 'prepSoldEntries', 'prepWasteEntries', 'prepStockoutEvents', 'prepHistorySeeded'],
  prepTimes: ['prepTimes', 'prepTimers'],
  cem: ['cemEntries'],
  misc: []
};
const STATE_SECTION_OF = {};
Object.entries(STATE_SECTIONS).forEach(([name, keys]) => keys.forEach(k => { STATE_SECTION_OF[k] = name; }));

// What the server has for each section, as this page last saw it.
let savedSections = {};

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
    fohRoster, bohRoster, lxPillars, lxMetrics, lxLastUpdated, gxData, txData, homeData,
    fohOEDays, fohOEChecked, fohOECheckedDate,
    fohLeaderTransitionChecked, fohLeaderTransitionDate,
    eoiSubmissions, zoneChecklistState, zoneChecklistHistory, numbersData, lastUpdated,
    safeCounts, trainerTrainees, trainerProgress, teamLeadTrainees, teamLeadProgress, scoreboardItems, posVacancyFlags, wasteLogLastClosedOut, deletedProductIds, productFixesVersion, productCategoryOrder, wasteMonthlyHistory,
    prepBuffers, prepSoldEntries, prepWasteEntries, prepStockoutEvents, prepHistorySeeded, cemEntries, foodSafetyWalkthroughs, setupHistory, peaRatings, peaNameAliases, numbersHistory, setupDayTypes, dataUploadLog, dataUploadSettings, productivityProfiles, prepTimes, prepTimers
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
  const changed = {};
  Object.keys(sections).forEach(name => { if(sections[name] !== savedSections[name]) changed[name] = sections[name]; });
  if(!Object.keys(changed).length){ setSyncStatus('Synced', 'ok'); return; }
  const result = await statePost('/api/state/save', {sections: changed});
  if(result) Object.assign(savedSections, changed);
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

function exportBackup(){
  const snapshot = stateSnapshot();
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cfa-buda-ops-backup-${today}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('✓ Backup downloaded');
}

document.getElementById('btnExportBackup').addEventListener('click', exportBackup);

async function loadState(){
  let data = null;
  const loaded = await statePost('/api/state/load', {});
  if(loaded && loaded.sections && Object.keys(loaded.sections).length){
    data = {};
    Object.entries(loaded.sections).forEach(([name, str])=>{
      try{
        const part = JSON.parse(str);
        Object.assign(data, part);
        // Remember it as this page serializes it, so an unchanged section
        // isn't re-sent on the first save.
        savedSections[name] = stateSectionString(name, part);
      }catch(e){ console.warn(`Could not read saved section ${name}:`, e); }
    });
  }
  if(!data){
    const saved = localStorage.getItem('cfaBudaOps');
    if(saved) data = JSON.parse(saved);
  }
  if(data){
    entries = data.entries || [];
    // Tracks products the user has explicitly deleted, so a default item never
    // silently reappears on the next load just because it's "missing" from
    // their saved list — missing now means "deleted", not "needs restoring".
    deletedProductIds = data.deletedProductIds || [];
    const defaultProducts = [...fohProducts, ...bohProducts];
    if(data.products){
      const savedIds = new Set(data.products.map(p=>p.id));
      const missingDefaults = defaultProducts.filter(p=>!savedIds.has(p.id) && !deletedProductIds.includes(p.id));
      products = [...data.products, ...missingDefaults];
      // Each fix runs once per saved list, so later edits in Manage (renames,
      // category moves) aren't overwritten on the next load.
      const fixesDone = data.productFixesVersion || 0;
      if(fixesDone < 1){
        const renameFixes = {foh26:'5 ct Grilled Nugget', foh27:'8 ct Grilled Nugget', foh28:'12 ct Grilled Nugget'};
        products.forEach(p=>{ if(renameFixes[p.id]) p.name = renameFixes[p.id]; });
      }
      if(fixesDone < 2){
        const sideIds = ['foh6','foh7','foh8','foh9','foh10','foh11','foh15','foh18','foh19','foh20'];
        products.forEach(p=>{ if(sideIds.includes(p.id)) p.cat = 'Sides'; });
      }
      if(fixesDone < 3){
        // Count items become "Base (N ct)" so they share one row of option
        // buttons on Log Waste. Only renamed if still at their old default name.
        const optionRenames = {
          foh25: ['5 ct Nugget', 'Nuggets (5 ct)'], foh4: ['8 ct Nugget', 'Nuggets (8 ct)'], foh5: ['12 ct Nugget', 'Nuggets (12 ct)'],
          foh26: ['5 ct Grilled Nugget', 'Grilled Nuggets (5 ct)'], foh27: ['8 ct Grilled Nugget', 'Grilled Nuggets (8 ct)'], foh28: ['12 ct Grilled Nugget', 'Grilled Nuggets (12 ct)'],
          boh18: ['Strip', 'Strips (1 ct)']
        };
        products.forEach(p=>{
          const fix = optionRenames[p.id];
          if(fix && p.name === fix[0]){
            p.name = fix[1];
            const def = defaultProducts.find(d=>d.id===p.id);
            if(def) p.es = def.es;
          }
        });
      }
    } else {
      products = defaultProducts;
    }
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
    if(data.fohRoster) Object.assign(fohRoster, data.fohRoster);
    if(data.bohRoster) Object.assign(bohRoster, data.bohRoster);
    if(data.formDoneDate === today) formDone = data.formDone || false;
    fohOEDays = data.fohOEDays || [];
    fohOECheckedDate = data.fohOECheckedDate || null;
    fohOEChecked = (fohOECheckedDate === today) ? (data.fohOEChecked || {}) : {};
    fohLeaderTransitionDate = data.fohLeaderTransitionDate || null;
    fohLeaderTransitionChecked = (fohLeaderTransitionDate === today) ? (data.fohLeaderTransitionChecked || {}) : {};
    eoiSubmissions = data.eoiSubmissions || [];
    zoneChecklistState = data.zoneChecklistState || {};
    zoneChecklistHistory = data.zoneChecklistHistory || {};
    numbersData = data.numbersData || {};
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
    scoreboardItems = data.scoreboardItems || [];
    posVacancyFlags = data.posVacancyFlags || {};
    setupHistory = normalizeSetupHistory(data.setupHistory);
    peaRatings = normalizePeaRatings(data.peaRatings);
    peaNameAliases = (data.peaNameAliases && typeof data.peaNameAliases === 'object') ? data.peaNameAliases : {};
    const migrated = migrateLegacyWeekdayKeys();
    numbersHistory = (data.numbersHistory && typeof data.numbersHistory === 'object') ? data.numbersHistory : {};
    setupDayTypes = (data.setupDayTypes && typeof data.setupDayTypes === 'object') ? data.setupDayTypes : {};
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

function calcStreak(){
  if(foodSafetyDays.length === 0){ foodSafetyStreak = 0; }
  else {
    const sorted = [...foodSafetyDays].sort().reverse();
    let c = 1;
    for(let i = 1; i < sorted.length; i++){
      const d1 = new Date(sorted[i-1]);
      const d2 = new Date(sorted[i]);
      if((d1 - d2) / (1000*60*60*24) === 1) c++;
      else break;
    }
    foodSafetyStreak = c;
  }
  
  if(wasteDays.length === 0){ wasteStreak = 0; }
  else {
    const sorted = [...wasteDays].sort().reverse();
    let c = 1;
    for(let i = 1; i < sorted.length; i++){
      const d1 = new Date(sorted[i-1]);
      const d2 = new Date(sorted[i]);
      if((d1 - d2) / (1000*60*60*24) === 1) c++;
      else break;
    }
    wasteStreak = c;
  }

  if(fohOEDays.length === 0){ fohOEStreak = 0; }
  else {
    const sorted = [...fohOEDays].sort().reverse();
    let c = 1;
    for(let i = 1; i < sorted.length; i++){
      const d1 = new Date(sorted[i-1]);
      const d2 = new Date(sorted[i]);
      if((d1 - d2) / (1000*60*60*24) === 1) c++;
      else break;
    }
    fohOEStreak = c;
  }
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
