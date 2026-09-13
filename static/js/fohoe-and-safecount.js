function renderWalkthroughsPage(){
  if(fohOECheckedDate !== today){ fohOEChecked = {}; fohOECheckedDate = today; }
  if(fohLeaderTransitionDate !== today){ fohLeaderTransitionChecked = {}; fohLeaderTransitionDate = today; }

  renderOEWalkthroughCard();
  renderLeaderTransitionCard();
  renderFoodSafety();
}

// ===== OE WALKTHROUGH (category pills → modal, matching Zone Reset's pattern) =====
function getOEWalkthroughCompletion(catName){
  const group = fohOEChecklistData.find(g => g.cat === catName);
  if(!group) return {checked: 0, total: 0};
  let checked = 0;
  group.items.forEach((item, i) => {
    if(fohOEChecked[catName + '::' + i]) checked++;
  });
  return {checked, total: group.items.length};
}

function getOEWalkthroughOverall(){
  let checked = 0, total = 0;
  fohOEChecklistData.forEach(g => {
    const c = getOEWalkthroughCompletion(g.cat);
    checked += c.checked;
    total += c.total;
  });
  return total > 0 ? Math.round((checked / total) * 100) : 0;
}

let currentOEWalkthroughCat = '';

function renderOEWalkthroughCard(){
  const overall = getOEWalkthroughOverall();
  const pctEl = document.getElementById('oeWalkthroughPct');
  pctEl.textContent = overall + '%';
  pctEl.classList.toggle('high', overall >= 95);

  const row = document.getElementById('oeWalkthroughCatRow');
  row.innerHTML = fohOEChecklistData.map(g => {
    const {checked, total} = getOEWalkthroughCompletion(g.cat);
    const done = total > 0 && checked === total;
    const escapedCat = g.cat.replace(/'/g, "\\'");
    return `<button class="zone-btn ${done ? 'zone-btn-done' : ''}" onclick="openOEWalkthroughModal('${escapedCat}')">${g.cat}<span class="zone-btn-count">${checked}/${total}</span></button>`;
  }).join('');

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

window.openOEWalkthroughModal = function(catName){
  currentOEWalkthroughCat = catName;
  renderOEWalkthroughModalContent();
  document.getElementById('walkthroughTaskModal').classList.add('active');
};

function renderOEWalkthroughModalContent(){
  const group = fohOEChecklistData.find(g => g.cat === currentOEWalkthroughCat);
  if(!group) return;
  const {checked, total} = getOEWalkthroughCompletion(currentOEWalkthroughCat);
  document.getElementById('walkthroughTaskModalTitle').textContent = currentOEWalkthroughCat;
  document.getElementById('walkthroughTaskModalProgress').textContent = `${checked}/${total} complete`;
  document.getElementById('walkthroughTaskModalList').innerHTML = group.items.map((item, i) => {
    const id = currentOEWalkthroughCat + '::' + i;
    const entry = fohOEChecked[id];
    const isChecked = !!entry;
    const stamp = isChecked ? `<span style="font-size:10px;color:var(--text-tertiary);font-style:italic;white-space:nowrap;">${escapeHtml(entry.initials)} · ${formatShortTime(entry.ts)}</span>` : '';
    const escapedId = id.replace(/'/g, "\\'");
    return `
      <label style="display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid var(--border);cursor:pointer;">
        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleOEWalkthroughItem('${escapedId}')" style="width:18px;height:18px;flex-shrink:0;">
        <span style="${isChecked ? 'text-decoration:line-through;color:var(--text-tertiary);' : ''}font-size:13px;flex:1;">${item}</span>
        ${stamp}
      </label>
    `;
  }).join('');
}

window.toggleOEWalkthroughItem = async function(id){
  if(fohOEChecked[id]){
    delete fohOEChecked[id];
  } else {
    const initials = getInitials();
    if(!initials){
      showToast('Set your initials first (top right)');
      beginEditInitials();
      renderOEWalkthroughModalContent();
      return;
    }
    fohOEChecked[id] = {initials, ts: Date.now()};
  }
  fohOECheckedDate = today;
  await saveState();
  renderOEWalkthroughModalContent();
  renderOEWalkthroughCard();
};

document.getElementById('walkthroughTaskModalClose').addEventListener('click', ()=>{
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
  renderOEWalkthroughCard();
  renderScoreboardView();
  showToast('✓ OE Walkthrough Marked Complete!');
});

// ===== LEADER TRANSITION LIST (unchanged content, new header badge) =====
function renderLeaderTransitionCard(){
  const leaderContainer = document.getElementById('fohLeaderTransitionChecklist');
  let lDone = 0;
  leaderContainer.innerHTML = fohLeaderTransitionItems.map((item, i) => {
    const entry = fohLeaderTransitionChecked[i];
    const checked = !!entry;
    if(checked) lDone++;
    const stamp = checked ? `<span style="font-size:10px;color:var(--text-tertiary);font-style:italic;margin-left:auto;white-space:nowrap;">${escapeHtml(entry.initials)} · ${formatShortTime(entry.ts)}</span>` : '';
    return `<div class="checklist-item ${checked?'checked':''}" data-lidx="${i}">
      <input type="checkbox" ${checked?'checked':''}>
      <span>${item}</span>
      ${stamp}
    </div>`;
  }).join('');

  const pct = fohLeaderTransitionItems.length > 0 ? Math.round((lDone / fohLeaderTransitionItems.length) * 100) : 0;
  const pctEl = document.getElementById('leaderTransitionPct');
  pctEl.textContent = pct + '%';
  pctEl.classList.toggle('high', pct >= 95);
  document.getElementById('fohLeaderTransitionProgress').textContent = `${lDone} / ${fohLeaderTransitionItems.length} complete`;
}

document.getElementById('fohLeaderTransitionChecklist').addEventListener('click', async (e)=>{
  const row = e.target.closest('.checklist-item');
  if(!row) return;
  const idx = row.dataset.lidx;
  if(fohLeaderTransitionChecked[idx]){
    delete fohLeaderTransitionChecked[idx];
  } else {
    const initials = getInitials();
    if(!initials){ showToast('Set your initials first (top right)'); beginEditInitials(); return; }
    fohLeaderTransitionChecked[idx] = {initials, ts: Date.now()};
  }
  fohLeaderTransitionDate = today;
  await saveState();
  renderLeaderTransitionCard();
});

document.getElementById('btnResetLeaderTransition').addEventListener('click', async ()=>{
  fohLeaderTransitionChecked = {};
  fohLeaderTransitionDate = today;
  await saveState();
  renderLeaderTransitionCard();
  showToast('✓ Leader Transition List Reset');
});

// ===== DAILY SAFE COUNT (unchanged, still its own OE dropdown item) =====
function renderSafeCount(){
  const safeDateInput = document.getElementById('safeCountDate');
  if(safeDateInput) safeDateInput.value = new Date().toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', year:'numeric'});
  renderSafeCountLog();
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
  document.getElementById('safeCountForm').reset();
  document.getElementById('safeCountDate').value = new Date().toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', year:'numeric'});
  calcSafeCountTotal();
  showToast('✓ Safe Count Submitted!');
});

function renderSafeCountLog(){
  const container = document.getElementById('safeCountLogContainer');
  if(!container) return;
  if(safeCounts.length === 0){
    container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px;font-size:12px;">No safe counts logged yet</div>';
    return;
  }
  const sorted = [...safeCounts].sort((a,b)=> b.timestamp - a.timestamp);
  container.innerHTML = sorted.map(entry => {
    const varClass = Math.abs(entry.variance) < 0.01 ? 'balanced' : (entry.variance > 0 ? 'over' : 'short');
    const varText = Math.abs(entry.variance) < 0.01 ? '✓ Balanced' : (entry.variance > 0 ? `+$${entry.variance.toFixed(2)} over` : `-$${Math.abs(entry.variance).toFixed(2)} short`);
    return `
      <div class="safe-log-entry">
        <div class="safe-log-top">
          <span class="safe-log-shift">${escapeHtml(entry.shift)}</span>
          <span class="safe-log-date">${escapeHtml(entry.date)}</span>
        </div>
        <div class="safe-log-total">$${entry.total.toFixed(2)}</div>
        <div class="safe-log-variance ${varClass}">${varText}</div>
        <div class="safe-log-meta">Counted by ${escapeHtml(entry.countedBy)}${entry.witness ? ' · Witnessed by ' + escapeHtml(entry.witness) : ''}</div>
        ${entry.tills ? `<div class="safe-log-meta"><b>Cashier tills:</b> $${entry.tills.toFixed(2)}</div>` : ''}
        ${entry.coinRolls && Object.keys(entry.coinRolls).length ? `<div class="safe-log-meta"><b>Coin rolls:</b> ${Object.entries(entry.coinRolls).map(([k,v])=>`${v} ${escapeHtml(k)}`).join(', ')}</div>` : ''}
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
