// ===== WALKTHROUGHS (OE Walkthrough + Leader Transition List + Food Safety summary card) =====

let currentWalkthroughCat = '';
let currentOEWalkthroughDaypart = '';
let currentLeaderTransitionDaypart = '';

// fohOEChecked is keyed [daypart][cat][itemIndex] — same daypart set as Zone
// Reset (getZoneDayparts()), so a leader picks a daypart the same way a TM
// picks one for zone resets.
function getOEWalkthroughCompletion(daypart, cat){
  const group = fohOEChecklistData.find(g => g.cat === cat);
  if(!group) return {checked:0, total:0};
  const state = (fohOEChecked[daypart] && fohOEChecked[daypart][cat]) || {};
  let checked = 0;
  group.items.forEach((item,i)=>{ if(state[i]) checked++; });
  return {checked, total: group.items.length};
}

function getOEWalkthroughOverall(){
  let checked = 0, total = 0;
  getZoneDayparts().forEach(daypart=>{
    fohOEChecklistData.forEach(group=>{
      const c = getOEWalkthroughCompletion(daypart, group.cat);
      checked += c.checked;
      total += c.total;
    });
  });
  return total > 0 ? Math.round((checked/total)*100) : 0;
}

function renderOEDaypartPicker(){
  const dayparts = getZoneDayparts();
  const picker = document.getElementById('oeDaypartPicker');
  picker.innerHTML = dayparts.map(dp=>`<div class="day-pill ${dp === currentOEWalkthroughDaypart ? 'active' : ''}" data-daypart="${dp.replace(/"/g, '&quot;')}">${dp}</div>`).join('');

  picker.querySelectorAll('.day-pill').forEach(pill=>{
    pill.addEventListener('click', ()=>{
      picker.querySelectorAll('.day-pill').forEach(p=>p.classList.remove('active'));
      pill.classList.add('active');
      currentOEWalkthroughDaypart = pill.dataset.daypart;
      renderOEWalkthroughCard();
    });
  });
}

function renderOEWalkthroughCard(){
  if(!currentOEWalkthroughDaypart){
    renderChecklistTiles('oeWalkthroughButtonRow', null, null, "Pick a daypart above to see that walkthrough's categories");
  } else {
    const tiles = fohOEChecklistData.map(group=>{
      const {checked, total} = getOEWalkthroughCompletion(currentOEWalkthroughDaypart, group.cat);
      return {key: group.cat, icon: OE_CATEGORY_ICONS[group.cat], name: group.cat, checked, total};
    });
    renderChecklistTiles('oeWalkthroughButtonRow', tiles, 'openWalkthroughCategory');
  }

  const overall = getOEWalkthroughOverall();
  const pctEl = document.getElementById('oeWalkthroughOverallPct');
  pctEl.textContent = overall + '%';
  pctEl.classList.toggle('high', overall >= 95);

  const oeBtn = document.getElementById('btnMarkFOHOEDone');
  const oeCompletedToday = fohOEDays.includes(today);
  if(oeCompletedToday){
    oeBtn.textContent = '✓ Completed Today';
    oeBtn.disabled = true;
  } else {
    oeBtn.textContent = 'Mark Complete';
    oeBtn.disabled = overall < 100;
  }
}

// ===== Leader Transition List =====
// Same daypart set and daily reset as the OE Walkthrough:
// fohLeaderTransitionChecked is keyed [daypart][itemIndex] = {initials, ts}.
function getLeaderTransitionCompletion(daypart){
  const state = fohLeaderTransitionChecked[daypart] || {};
  const checked = fohLeaderTransitionItems.filter((_, i) => state[i]).length;
  return {checked, total: fohLeaderTransitionItems.length};
}

function getLeaderTransitionOverall(){
  let checked = 0, total = 0;
  getZoneDayparts().forEach(daypart=>{
    const c = getLeaderTransitionCompletion(daypart);
    checked += c.checked;
    total += c.total;
  });
  return total > 0 ? Math.round((checked/total)*100) : 0;
}

let leaderHandoffChosen = false;

// Same handoff banners as Zone Reset; the open one shows its checklist.
function renderLeaderTransitionCard(){
  const container = document.getElementById('fohLeaderTransitionChecklist');
  const daypart = currentLeaderTransitionDaypart;
  const state = (daypart && fohLeaderTransitionChecked[daypart]) || {};
  const listHtml = daypart ? fohLeaderTransitionItems.map((item,i)=>{
    const entry = state[i];
    const isChecked = !!entry;
    const stamp = isChecked ? `<span style="font-size:10px;color:var(--text-tertiary);font-style:italic;margin-left:auto;white-space:nowrap;">${escapeHtml(entry.initials)} · ${formatShortTime(entry.ts)}</span>` : '';
    return `<div class="checklist-item-elevated ${isChecked?'checked':''}" data-lidx="${i}">
      <input type="checkbox" ${isChecked?'checked':''}>
      <span>${escapeHtml(item)}</span>
      ${stamp}
    </div>`;
  }).join('') : '';
  container.innerHTML = zrHandoffBannersHtml('leader', daypart, getLeaderTransitionCompletion, listHtml);
  const overall = getLeaderTransitionOverall();
  const badge = document.getElementById('leaderTransitionBadge');
  badge.textContent = overall + '%';
  badge.classList.toggle('high', overall >= 95);
}

function renderWalkthroughsPage(){
  if(fohOECheckedDate !== today){ fohOEChecked = {}; fohOECheckedDate = today; }
  // Older saves kept one flat list ({itemIndex: ...}); per-daypart state is
  // keyed by daypart name, so a flat entry means old data — start fresh.
  const ltIsOldFormat = Object.values(fohLeaderTransitionChecked).some(v => v && v.initials);
  if(fohLeaderTransitionDate !== today || ltIsOldFormat){ fohLeaderTransitionChecked = {}; fohLeaderTransitionDate = today; }

  renderOEDaypartPicker();
  renderOEWalkthroughCard();

  if(!leaderHandoffChosen) currentLeaderTransitionDaypart = zrCurrentHandoff();
  renderLeaderTransitionCard();

  // --- Food Safety Walkthrough (full checklist lives on its own page) ---
  fsRenderSummaryCard();
}

window.openWalkthroughCategory = function(cat){
  currentWalkthroughCat = cat;
  renderWalkthroughModal();
  document.getElementById('walkthroughTaskModal').classList.add('active');
};

function renderWalkthroughModal(){
  const daypart = currentOEWalkthroughDaypart;
  const cat = currentWalkthroughCat;
  const group = fohOEChecklistData.find(g => g.cat === cat);
  if(!group || !daypart) return;
  const {checked, total} = getOEWalkthroughCompletion(daypart, cat);
  document.getElementById('wtModalTitle').textContent = cat;
  document.getElementById('wtModalProgress').textContent = `${checked}/${total} complete • ${daypart}`;
  document.getElementById('wtModalList').innerHTML = group.items.map((item,i)=>{
    const entry = fohOEChecked[daypart] && fohOEChecked[daypart][cat] && fohOEChecked[daypart][cat][i];
    const isChecked = !!entry;
    const stamp = isChecked ? `<span style="font-size:10px;color:var(--text-tertiary);font-style:italic;white-space:nowrap;">${escapeHtml(entry.initials)} · ${formatShortTime(entry.ts)}</span>` : '';
    return `
      <label style="display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid var(--border);cursor:pointer;">
        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleWalkthroughItem(${jsArg(cat)}, ${i})" style="width:18px;height:18px;flex-shrink:0;">
        <span style="${isChecked ? 'text-decoration:line-through;color:var(--text-tertiary);' : ''}font-size:13px;flex:1;">${escapeHtml(item)}</span>
        ${stamp}
      </label>
    `;
  }).join('');
}

window.toggleWalkthroughItem = async function(cat, i){
  const daypart = currentOEWalkthroughDaypart;
  if(!daypart) return;
  if(!fohOEChecked[daypart]) fohOEChecked[daypart] = {};
  if(!fohOEChecked[daypart][cat]) fohOEChecked[daypart][cat] = {};
  const bucket = fohOEChecked[daypart][cat];
  if(bucket[i]){
    delete bucket[i];
  } else {
    const initials = getInitials();
    if(!initials){ showToast('Set your initials first (top right)'); beginEditInitials(); renderWalkthroughModal(); return; }
    bucket[i] = {initials, ts: Date.now()};
  }
  fohOECheckedDate = today;
  await saveState();
  renderWalkthroughModal();
  renderOEWalkthroughCard();
};

document.getElementById('wtModalClose').addEventListener('click', ()=>{
  document.getElementById('walkthroughTaskModal').classList.remove('active');
});
document.getElementById('walkthroughTaskModal').addEventListener('click', (e)=>{
  if(e.target === document.getElementById('walkthroughTaskModal')) document.getElementById('walkthroughTaskModal').classList.remove('active');
});

document.getElementById('btnMarkFOHOEDone').addEventListener('click', async ()=>{
  if(!fohOEDays.includes(today)){
    fohOEDays.push(today);
    calcStreak();
  }
  await saveState();
  renderWalkthroughsPage();
  showToast('✓ OE Walkthrough Marked Complete!');
});

document.getElementById('fohLeaderTransitionChecklist').addEventListener('click', async (e)=>{
  const handoff = e.target.closest('[data-zr-handoff]');
  if(handoff){
    const name = handoff.dataset.zrHandoff;
    currentLeaderTransitionDaypart = currentLeaderTransitionDaypart === name ? '' : name;
    leaderHandoffChosen = true;
    renderLeaderTransitionCard();
    const head = [...document.querySelectorAll('#fohLeaderTransitionChecklist [data-zr-handoff]')].find(h => h.dataset.zrHandoff === name);
    if(currentLeaderTransitionDaypart && head) head.scrollIntoView({block: 'nearest'});
    return;
  }
  const row = e.target.closest('.checklist-item-elevated');
  const daypart = currentLeaderTransitionDaypart;
  if(!row || !daypart) return;
  const idx = row.dataset.lidx;
  if(!fohLeaderTransitionChecked[daypart]) fohLeaderTransitionChecked[daypart] = {};
  const bucket = fohLeaderTransitionChecked[daypart];
  if(bucket[idx]){
    delete bucket[idx];
  } else {
    const initials = getInitials();
    if(!initials){ showToast('Set your initials first (top right)'); beginEditInitials(); renderLeaderTransitionCard(); return; }
    bucket[idx] = {initials, ts: Date.now()};
  }
  fohLeaderTransitionDate = today;
  await saveState();
  renderLeaderTransitionCard();
});

// ===== DAILY SAFE COUNT =====
const SAFE_COUNT_ENTRY_TYPES = ['Opening Count', 'Transition Count', 'Closing Count', 'Additional Count'];
const SAFE_COUNT_TYPE_ICONS = {'Opening Count': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M4.2 4.2l2.1 2.1"/><path d="M17.7 17.7l2.1 2.1"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="M4.2 19.8l2.1-2.1"/><path d="M17.7 6.3l2.1-2.1"/></svg>', 'Transition Count': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></svg>', 'Closing Count': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>', 'Additional Count': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>'};
let currentSafeCountEntryType = '';

function renderSafeCountEntryPicker(){
  const picker = document.getElementById('safeCountEntryPicker');
  picker.innerHTML = SAFE_COUNT_ENTRY_TYPES.map(type => `<div class="day-pill ${type === currentSafeCountEntryType ? 'active' : ''}" data-type="${type}"><span class="sc-ic" aria-hidden="true">${SAFE_COUNT_TYPE_ICONS[type] || ''}</span><span>${type}</span></div>`).join('');
  picker.querySelectorAll('.day-pill').forEach(pill=>{
    pill.addEventListener('click', ()=>{
      currentSafeCountEntryType = pill.dataset.type;
      openSafeCountEntry();
    });
  });
}

function openSafeCountEntry(){
  renderSafeCountEntryPicker();
  document.getElementById('safeCountEntryTitle').textContent = currentSafeCountEntryType;
  document.getElementById('safeCountShift').value = currentSafeCountEntryType;
  document.getElementById('safeCountFormWrap').style.display = currentSafeCountEntryType ? 'block' : 'none';
}

document.getElementById('btnSafeCountChangeEntry').addEventListener('click', ()=>{
  currentSafeCountEntryType = '';
  openSafeCountEntry();
});

function renderSafeCount(){
  const safeDateInput = document.getElementById('safeCountDate');
  if(safeDateInput) safeDateInput.value = new Date().toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', year:'numeric'});
  openSafeCountEntry();
  renderSafeCountLog();
  scLoadToday();
}

// Team devices aren't sent the safe count log (TIM-48), only today's counts
// on request, so a leader can check the opening count. null = not asked yet.
let safeCountsToday = null;

async function scLoadToday(){
  if(typeof launchManager !== 'undefined' && launchManager) return;
  try{
    const res = await fetch(`${API_BASE}/api/safe-counts/today?date=${encodeURIComponent(today)}`);
    if(!res.ok) return;
    safeCountsToday = (await res.json()).counts || [];
    renderSafeCountLog();
  }catch(err){ /* offline: show what this device logged */ }
}

function calcSafeCountTotal(){
  let total = 0;
  const tills = parseFloat(document.getElementById('safeCountTills').value) || 0;
  total += tills;
  document.querySelectorAll('.denom-input').forEach(inp=>{
    const qty = parseInt(inp.value) || 0;
    const val = parseFloat(inp.dataset.value);
    const sub = qty * val;
    total += sub;
    const subEl = inp.parentElement.querySelector('.denom-sub');
    subEl.textContent = qty > 0 ? '$' + sub.toFixed(2) : '';
  });
  document.querySelectorAll('.coin-input').forEach(inp=>{
    const qty = parseInt(inp.value) || 0;
    const val = parseFloat(inp.dataset.value);
    const sub = qty * val;
    total += sub;
    const subEl = inp.parentElement.querySelector('.denom-sub');
    subEl.textContent = qty > 0 ? '$' + sub.toFixed(2) : '';
  });
  const coin = parseFloat(document.getElementById('safeCountCoin').value) || 0;
  total += coin;
  document.getElementById('safeCountTotal').textContent = '$' + total.toFixed(2);
  const variance = total - safeTarget;
  const varEl = document.getElementById('safeCountVarianceDisplay');
  if(Math.abs(variance) < 0.01){
    varEl.textContent = `✓ Matches target ($${safeTarget.toFixed(2)})`;
  } else if(variance > 0){
    varEl.textContent = `$${variance.toFixed(2)} over target ($${safeTarget.toFixed(2)})`;
  } else {
    varEl.textContent = `$${Math.abs(variance).toFixed(2)} short of target ($${safeTarget.toFixed(2)})`;
  }
  return total;
}

document.getElementById('safeCountForm').addEventListener('input', calcSafeCountTotal);

document.getElementById('safeCountForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const total = calcSafeCountTotal();
  const denoms = {};
  document.querySelectorAll('.denom-input').forEach(inp=>{
    const qty = parseInt(inp.value) || 0;
    if(qty > 0) denoms[inp.dataset.value] = qty;
  });
  const coinRollLabels = {10:'Quarters', 5:'Dimes', 2:'Nickels'};
  const coinRolls = {};
  document.querySelectorAll('.coin-input').forEach(inp=>{
    const qty = parseInt(inp.value) || 0;
    if(qty > 0) coinRolls[coinRollLabels[inp.dataset.value]] = qty;
  });
  const entry = {
    id: 'safe' + Date.now(),
    timestamp: Date.now(),
    date: today,
    shift: document.getElementById('safeCountShift').value,
    countedBy: document.getElementById('safeCountBy').value,
    witness: document.getElementById('safeCountWitness').value,
    tills: parseFloat(document.getElementById('safeCountTills').value) || 0,
    denoms,
    coinRolls,
    coin: parseFloat(document.getElementById('safeCountCoin').value) || 0,
    total,
    target: safeTarget,
    variance: total - safeTarget,
    notes: document.getElementById('safeCountNotes').value
  };
  safeCounts.push(entry);
  await saveState();
  renderSafeCountLog();
  scLoadToday();
  document.getElementById('safeCountForm').reset();
  document.getElementById('safeCountDate').value = new Date().toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', year:'numeric'});
  calcSafeCountTotal();
  currentSafeCountEntryType = '';
  openSafeCountEntry();
  showToast('✓ Safe Count Submitted!');
});

function renderSafeCountLog(){
  const container = document.getElementById('safeCountLogContainer');
  if(!container) return;
  // Safe counts reach manager sessions only (TIM-48). Other devices see
  // today's counts (fetched) plus any logged here.
  const manager = typeof launchManager !== 'undefined' && launchManager;
  const note = manager ? '' : '<div class="safe-log-private">🔒 Today\'s counts. The full history is for managers (sign in on Manage).</div>';
  let list = safeCounts;
  if(!manager){
    const seen = new Set();
    list = [...(safeCountsToday || []), ...safeCounts.filter(e => e.date === today)].filter(e=>{
      const k = `${e.timestamp}|${e.countedBy}|${e.total}`;
      if(seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  if(list.length === 0){
    container.innerHTML = note + `<div style="text-align:center;color:var(--text-secondary);padding:20px;font-size:12px;">${manager ? 'No safe counts logged yet' : 'No counts logged yet today'}</div>`;
    return;
  }
  const sorted = [...list].sort((a,b)=> b.timestamp - a.timestamp);
  container.innerHTML = note + sorted.map(entry => {
    const variance = Number(entry.variance) || 0;
    const varClass = Math.abs(variance) < 0.01 ? 'balanced' : (variance > 0 ? 'over' : 'short');
    const varText = Math.abs(variance) < 0.01 ? '✓ Balanced' : (variance > 0 ? `+$${variance.toFixed(2)} over` : `-$${Math.abs(variance).toFixed(2)} short`);
    return `
      <div class="safe-log-entry">
        <div class="safe-log-top">
          <span class="safe-log-shift">${escapeHtml(entry.shift)}</span>
          <span class="safe-log-date">${escapeHtml(entry.date)}</span>
        </div>
        <div class="safe-log-total">$${(Number(entry.total) || 0).toFixed(2)}</div>
        <div class="safe-log-variance ${varClass}">${varText}</div>
        <div class="safe-log-meta">Counted by ${escapeHtml(entry.countedBy)}${entry.witness ? ' · Witnessed by ' + escapeHtml(entry.witness) : ''}</div>
        ${entry.tills ? `<div class="safe-log-meta"><b>Cashier tills:</b> $${(Number(entry.tills) || 0).toFixed(2)}</div>` : ''}
        ${entry.coinRolls && Object.keys(entry.coinRolls).length ? `<div class="safe-log-meta"><b>Coin rolls:</b> ${Object.entries(entry.coinRolls).map(([k,v])=>`${escapeHtml(v)} ${escapeHtml(k)}`).join(', ')}</div>` : ''}
        ${entry.notes ? `<div class="safe-log-meta"><b>Notes:</b> ${escapeHtml(entry.notes)}</div>` : ''}
      </div>
    `;
  }).join('');
}

// POSITIONS & BREAKS
document.querySelectorAll('#posToggle .toggle-btn').forEach(t=>{
  t.addEventListener('click',()=>{
    document.querySelectorAll('#posToggle .toggle-btn').forEach(x=>{x.classList.remove('active'); x.setAttribute('aria-pressed', 'false');});
    t.classList.add('active');
    t.setAttribute('aria-pressed', 'true');
    currentPosSection = t.dataset.section;
    renderAllDayparts();
    updateSelectedDayInfo('daySelect', 'daySelectedInfo');
  });
});
