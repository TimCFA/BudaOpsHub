// ===== FIREBASE (via Flask proxy) =====
const API_BASE = window.location.origin === 'file://' ? 'http://localhost:5000' : window.location.origin;

async function dbRead(path){
  try{
    const response = await fetch(`${API_BASE}/api/firebase/read`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({path})
    });
    if(response.status === 404) return null;
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }catch(err){
    console.warn(`Firebase read at ${path} failed:`, err);
    return null;
  }
}

async function dbWrite(path, data){
  try{
    const response = await fetch(`${API_BASE}/api/firebase/write`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({path, value: data})
    });
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }catch(err){
    console.error(`Firebase write at ${path} failed:`, err);
    return null;
  }
}

async function saveState(){
  const snapshot = {
    entries, products, teamMembers, wasteTarget, formDone,
    formDoneDate: formDone ? today : null, foodSafetyDays, wasteDays, breakCountdowns, completedBreaks, posAssignments,
    fohRoster, bohRoster, lxPillars, lxMetrics, lxLastUpdated, gxData, txData, homeData,
    fohOEDays, fohOEChecked, fohOECheckedDate,
    fohLeaderTransitionChecked, fohLeaderTransitionDate,
    fohPositionTransitionChecked, fohPositionTransitionDate,
    eoiSubmissions, zoneChecklistState, zoneChecklistHistory, numbersData, lastUpdated,
    safeTarget, safeCounts, trainerTrainees, trainerProgress, scoreboardItems
  };
  const serialized = JSON.stringify(snapshot);
  // Local cache first, so the app still works instantly / offline even if the network write below fails
  localStorage.setItem('cfaBudaOps', serialized);
  // Stored as a single JSON string (not a nested object) so data-driven keys like
  // position names containing "/" never get interpreted as Firebase path separators
  const result = await dbWrite('appState', serialized);
  setSyncStatus(result ? 'Synced' : 'Saved locally — sync failed', result ? 'ok' : 'error');
}

function exportBackup(){
  // Mirrors saveState's exact snapshot, so this backup always covers everything
  // actually persisted — nothing more, nothing less
  const snapshot = {
    entries, products, teamMembers, wasteTarget, formDone,
    formDoneDate: formDone ? today : null, foodSafetyDays, wasteDays, breakCountdowns, completedBreaks, posAssignments,
    fohRoster, bohRoster, lxPillars, lxMetrics, lxLastUpdated, gxData, txData, homeData,
    fohOEDays, fohOEChecked, fohOECheckedDate,
    fohLeaderTransitionChecked, fohLeaderTransitionDate,
    fohPositionTransitionChecked, fohPositionTransitionDate,
    eoiSubmissions, zoneChecklistState, zoneChecklistHistory, numbersData, lastUpdated,
    safeTarget, safeCounts, trainerTrainees, trainerProgress, scoreboardItems
  };
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
  let raw = await dbRead('appState');
  let data = null;
  if(typeof raw === 'string'){
    try{ data = JSON.parse(raw); }catch(e){ console.warn('Could not parse Firebase appState:', e); }
  } else if(raw && typeof raw === 'object'){
    // Backward compatibility with the old nested-object format, if any old data is still there
    data = raw;
  }
  if(!data){
    // Fall back to whatever's cached locally (e.g. first load with no network, or nothing in Firebase yet)
    const saved = localStorage.getItem('cfaBudaOps');
    if(saved) data = JSON.parse(saved);
  }
  if(data){
    entries = data.entries || [];
    const defaultProducts = [...fohProducts, ...bohProducts];
    if(data.products){
      const savedIds = new Set(data.products.map(p=>p.id));
      const missingDefaults = defaultProducts.filter(p=>!savedIds.has(p.id));
      products = [...data.products, ...missingDefaults];
      // fix renamed grilled nugget products even if already saved
      const renameFixes = {foh26:'5 ct Grilled Nugget', foh27:'8 ct Grilled Nugget', foh28:'12 ct Grilled Nugget'};
      products.forEach(p=>{ if(renameFixes[p.id]) p.name = renameFixes[p.id]; });
    } else {
      products = defaultProducts;
    }
    teamMembers = data.teamMembers || [...fohLeads, ...bohLeads];
    wasteTarget = data.wasteTarget || 100;
    safeTarget = data.safeTarget || 4500;
    safeCounts = data.safeCounts || [];
    foodSafetyDays = data.foodSafetyDays || [];
    wasteDays = data.wasteDays || [];
    breakCountdowns = data.breakCountdowns || {};
    completedBreaks = data.completedBreaks || {};
    posAssignments = data.posAssignments || {};
    lxPillars = data.lxPillars || defaultPillars;
    lxMetrics = data.lxMetrics || defaultMetrics;
    lxLastUpdated = data.lxLastUpdated || null;
    gxData = data.gxData || JSON.parse(JSON.stringify(defaultGXData));
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
    fohPositionTransitionDate = data.fohPositionTransitionDate || null;
    fohPositionTransitionChecked = (fohPositionTransitionDate === today) ? (data.fohPositionTransitionChecked || {}) : {};
    eoiSubmissions = data.eoiSubmissions || [];
    zoneChecklistState = data.zoneChecklistState || {};
    zoneChecklistHistory = data.zoneChecklistHistory || {};
    numbersData = data.numbersData || {};
    lastUpdated = data.lastUpdated || {};
    trainerTrainees = data.trainerTrainees || [];
    trainerProgress = data.trainerProgress || {};
    scoreboardItems = data.scoreboardItems || [];
    const migrated = migrateLegacyWeekdayKeys();
    const prunedDates = pruneOldDateData();
    const prunedChecklists = pruneZoneChecklistData();
    if(migrated || prunedDates || prunedChecklists) await saveState();
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

function getTodayTotal(){
  return entries.reduce((sum,e)=>sum+e.cost,0);
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
