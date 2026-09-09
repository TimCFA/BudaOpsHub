function renderFOHOE(){
  // Safe count date default (ported from Kianna's version)
  const safeDateInput = document.getElementById('safeCountDate');
  if(safeDateInput) safeDateInput.value = new Date().toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', year:'numeric'});
  renderSafeCountLog();

  // reset checklists if date rolled over
  if(fohOECheckedDate !== today){ fohOEChecked = {}; fohOECheckedDate = today; }
  if(fohLeaderTransitionDate !== today){ fohLeaderTransitionChecked = {}; fohLeaderTransitionDate = today; }
  if(fohPositionTransitionDate !== today){ fohPositionTransitionChecked = {}; fohPositionTransitionDate = today; }

  // OE Walkthrough checklist
  const oeContainer = document.getElementById('fohOEChecklist');
  let oeTotal = 0, oeDone = 0;
  oeContainer.innerHTML = fohOEChecklistData.map(group => {
    return `<div class="checklist-cat">${group.cat}</div>` + group.items.map((item,i)=>{
      const id = group.cat + '::' + i;
      oeTotal++;
      const entry = fohOEChecked[id];
      const checked = !!entry;
      if(checked) oeDone++;
      const stamp = checked ? `<span style="font-size:10px;color:var(--text-tertiary);font-style:italic;margin-left:auto;white-space:nowrap;">${escapeHtml(entry.initials)} · ${formatShortTime(entry.ts)}</span>` : '';
      return `<div class="checklist-item ${checked?'checked':''}" data-id="${id.replace(/"/g,'&quot;')}">
        <input type="checkbox" ${checked?'checked':''}>
        <span>${item}</span>
        ${stamp}
      </div>`;
    }).join('');
  }).join('');
  document.getElementById('fohOEProgress').textContent = `${oeDone} / ${oeTotal} complete`;
  const oeBtn = document.getElementById('btnMarkFOHOEDone');
  const oeCompletedToday = fohOEDays.includes(today);
  if(oeCompletedToday){
    oeBtn.textContent = '✓ Completed Today';
    oeBtn.disabled = true;
  } else {
    oeBtn.textContent = 'Mark Complete';
    oeBtn.disabled = oeDone < oeTotal;
  }

  document.getElementById('fohOEStreakNum').textContent = fohOEStreak;
  document.getElementById('fohOEStreakLabel').textContent = 'consecutive ' + (fohOEStreak === 1 ? 'day' : 'days');

  // Leader Transition List
  const leaderContainer = document.getElementById('fohLeaderTransitionChecklist');
  let lDone = 0;
  leaderContainer.innerHTML = fohLeaderTransitionItems.map((item,i)=>{
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
  document.getElementById('fohLeaderTransitionProgress').textContent = `${lDone} / ${fohLeaderTransitionItems.length} complete`;

  // Position transition select + checklist
  const posSelect = document.getElementById('fohPositionSelect');
  if(posSelect.options.length === 0){
    posSelect.innerHTML = Object.keys(fohPositionTransitionItems).map(p=>`<option value="${p}">${p}</option>`).join('');
    posSelect.value = currentFOHPosition;
  }
  renderFOHPositionTransition();
}

function renderFOHPositionTransition(){
  const items = fohPositionTransitionItems[currentFOHPosition] || [];
  const container = document.getElementById('fohPositionTransitionChecklist');
  const posChecked = fohPositionTransitionChecked[currentFOHPosition] || {};
  let pDone = 0;
  container.innerHTML = items.map((item,i)=>{
    const entry = posChecked[i];
    const checked = !!entry;
    if(checked) pDone++;
    const stamp = checked ? `<span style="font-size:10px;color:var(--text-tertiary);font-style:italic;margin-left:auto;white-space:nowrap;">${escapeHtml(entry.initials)} · ${formatShortTime(entry.ts)}</span>` : '';
    return `<div class="checklist-item ${checked?'checked':''}" data-pidx="${i}">
      <input type="checkbox" ${checked?'checked':''}>
      <span>${item}</span>
      ${stamp}
    </div>`;
  }).join('');
  document.getElementById('fohPositionTransitionProgress').textContent = `${pDone} / ${items.length} complete`;
}

document.getElementById('fohOEChecklist').addEventListener('click', async (e)=>{
  const row = e.target.closest('.checklist-item');
  if(!row) return;
  const id = row.dataset.id;
  if(fohOEChecked[id]){
    delete fohOEChecked[id];
  } else {
    const initials = getInitials();
    if(!initials){ showToast('Set your initials first (top right)'); beginEditInitials(); return; }
    fohOEChecked[id] = {initials, ts: Date.now()};
  }
  fohOECheckedDate = today;
  await saveState();
  renderFOHOE();
});

document.getElementById('btnMarkFOHOEDone').addEventListener('click', async ()=>{
  if(!fohOEDays.includes(today)){
    fohOEDays.push(today);
    calcStreak();
  }
  await saveState();
  renderFOHOE();
  showToast('✓ OE Walkthrough Marked Complete!');
});

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
  renderFOHOE();
});

document.getElementById('btnResetLeaderTransition').addEventListener('click', async ()=>{
  fohLeaderTransitionChecked = {};
  fohLeaderTransitionDate = today;
  await saveState();
  renderFOHOE();
  showToast('✓ Leader Transition List Reset');
});

document.getElementById('fohPositionSelect').addEventListener('change', (e)=>{
  currentFOHPosition = e.target.value;
  renderFOHPositionTransition();
});

document.getElementById('fohPositionTransitionChecklist').addEventListener('click', async (e)=>{
  const row = e.target.closest('.checklist-item');
  if(!row) return;
  const idx = row.dataset.pidx;
  if(!fohPositionTransitionChecked[currentFOHPosition]) fohPositionTransitionChecked[currentFOHPosition] = {};
  const bucket = fohPositionTransitionChecked[currentFOHPosition];
  if(bucket[idx]){
    delete bucket[idx];
  } else {
    const initials = getInitials();
    if(!initials){ showToast('Set your initials first (top right)'); beginEditInitials(); return; }
    bucket[idx] = {initials, ts: Date.now()};
  }
  fohPositionTransitionDate = today;
  await saveState();
  renderFOHPositionTransition();
});

document.getElementById('btnResetPositionTransition').addEventListener('click', async ()=>{
  fohPositionTransitionChecked[currentFOHPosition] = {};
  fohPositionTransitionDate = today;
  await saveState();
  renderFOHPositionTransition();
  showToast('✓ Position Transition List Reset');
});

// ===== Ported from Kianna's version: DAILY SAFE COUNT =====
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

// Builds a week's worth of date-based pills into pickerId, wires their clicks, and
// keeps selectId's hidden <select> in sync so all existing dayName-keyed lookups
// throughout the app keep working unchanged (they now just receive an ISO date
// instead of a weekday name)
