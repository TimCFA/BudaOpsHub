function renderGrid(){
  const grid = document.getElementById('grid');
  const filtered = products.filter(p=>p.section===currentSection);
  if(filtered.length===0){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><b>No products</b></div>`;
    return;
  }
  grid.innerHTML = filtered.map(p=>`
    <div class="tile" data-id="${p.id}">
      <div>
        <div class="cat">${p.cat}</div>
        <div class="name">${p.name}</div>
        ${p.es ? `<div class="name-es">${p.es}</div>` : ''}
      </div>
      <div class="cost">${p.cost>0?'$'+p.cost.toFixed(2):'—'}</div>
    </div>
  `).join('');
  grid.querySelectorAll('.tile').forEach(tile=>{
    tile.addEventListener('click',()=>openLogModal(tile.dataset.id));
  });
}

let selectedProd = null;
function openLogModal(prodId){
  selectedProd = products.find(p=>p.id===prodId);
  if(!selectedProd) return;
  document.getElementById('modalProduct').textContent = selectedProd.name + ' @ $' + selectedProd.cost.toFixed(2);
  document.getElementById('qty').value = 1;
  updateCostPreview();
  document.getElementById('logModal').classList.add('active');
}

document.getElementById('logModal').addEventListener('click',(e)=>{
  if(e.target===document.getElementById('logModal')) document.getElementById('logModal').classList.remove('active');
});

document.getElementById('btnCancelLog').addEventListener('click',()=>document.getElementById('logModal').classList.remove('active'));

document.getElementById('incQty').addEventListener('click',()=>{
  document.getElementById('qty').value = parseInt(document.getElementById('qty').value||0)+1;
  updateCostPreview();
});

document.getElementById('decQty').addEventListener('click',()=>{
  const v = Math.max(1, parseInt(document.getElementById('qty').value||1)-1);
  document.getElementById('qty').value = v;
  updateCostPreview();
});

document.getElementById('qty').addEventListener('change',updateCostPreview);

function updateCostPreview(){
  const qty = parseInt(document.getElementById('qty').value)||1;
  const cost = qty * selectedProd.cost;
  document.getElementById('costPreview').innerHTML = `Cost: <b>$${cost.toFixed(2)}</b>`;
}

document.getElementById('btnSubmitLog').addEventListener('click', async ()=>{
  const who = getInitials();
  if(!who){
    showToast('Set your initials first (top right)');
    beginEditInitials();
    return;
  }
  const qty = parseInt(document.getElementById('qty').value)||1;
  const entry = {
    ts: Date.now(),
    prodId: selectedProd.id,
    name: selectedProd.name,
    qty: qty,
    unit: selectedProd.unit,
    unitCost: selectedProd.cost,
    cost: qty * selectedProd.cost,
    who: who,
    section: currentSection
  };
  entries.push(entry);
  
  if(getTodayTotal() < wasteTarget){
    if(!wasteDays.includes(today)){
      wasteDays.push(today);
      calcStreak();
    }
  }
  
  await saveState();
  renderTape();
  renderScoreboardView();
  showToast('✓ Logged!');
  document.getElementById('logModal').classList.remove('active');
});

function showToast(msg){
  const t = document.querySelector('.toast') || document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  if(!document.querySelector('.toast')) document.body.appendChild(t);
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}

function renderTape(){
  const tape = document.getElementById('tape');
  const filtered = entries.filter(e=>e.section===currentSection);
  if(filtered.length===0){
    tape.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:12px;">No entries yet</div>`;
    return;
  }
  tape.innerHTML = [...filtered].sort((a,b)=>b.ts-a.ts).slice(0,20).map(e=>`
    <div class="tape-row">
      <span class="l">${new Date(e.ts).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})} · ${e.name}</span>
      <span class="r">${e.qty}${e.unit} · $${e.cost.toFixed(2)}</span>
    </div>
  `).join('');
}

// Scoreboard: combined waste totals, target status, and streaks all in one place.
// Not filtered by currentSection (that toggle only affects the Log Waste grid/tape).
function renderScoreboardView(){
  const total = entries.reduce((sum,e)=>sum+e.cost,0);
  const fohTotal = entries.filter(e=>e.section==='foh').reduce((sum,e)=>sum+e.cost,0);
  const bohTotal = entries.filter(e=>e.section==='boh').reduce((sum,e)=>sum+e.cost,0);

  document.getElementById('statTotal').textContent = '$' + total.toFixed(2);
  document.getElementById('statEntries').textContent = entries.length;
  document.getElementById('statFohSubtotal').textContent = '$' + fohTotal.toFixed(2);
  document.getElementById('statBohSubtotal').textContent = '$' + bohTotal.toFixed(2);

  const byProduct = {};
  entries.forEach(e=>{
    byProduct[e.name] = (byProduct[e.name]||0) + e.cost;
  });
  const sorted = Object.entries(byProduct).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxVal = sorted[0]?sorted[0][1]:1;

  document.getElementById('barList').innerHTML = sorted.map(([name,cost])=>`
    <div class="bar-item">
      <div class="bi-top">
        <span class="bn">${name}</span>
        <span class="bv">$${cost.toFixed(2)}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(cost/maxVal)*100}%"></div>
      </div>
    </div>
  `).join('');

  // Today's Waste Target status
  const todayTotal = getTodayTotal();
  document.getElementById('standupTotal').textContent = '$' + todayTotal.toFixed(2);
  document.getElementById('standupTarget').textContent = '$' + wasteTarget.toFixed(2);
  document.getElementById('standupStatus').style.display = (todayTotal < wasteTarget) ? 'block' : 'none';

  // Active Streaks
  document.getElementById('foodSafetyStreakNum').textContent = foodSafetyStreak;
  document.getElementById('foodSafetyStreakLabel').textContent = 'consecutive ' + (foodSafetyStreak === 1 ? 'day' : 'days');
  document.getElementById('wasteStreakNum').textContent = wasteStreak;
  document.getElementById('wasteStreakLabel').textContent = 'consecutive ' + (wasteStreak === 1 ? 'day' : 'days');
  document.getElementById('fohOEStreakNum').textContent = fohOEStreak;
  document.getElementById('fohOEStreakLabel').textContent = 'consecutive ' + (fohOEStreak === 1 ? 'day' : 'days');
}

function renderFoodSafety(){
  const formBtn = document.getElementById('btnMarkFormDone');
  if(formDone){
    formBtn.textContent = '✓ Completed Today';
    formBtn.disabled = true;
  } else {
    formBtn.textContent = 'Mark Complete';
    formBtn.disabled = false;
  }
}

document.getElementById('btnMarkFormDone').addEventListener('click', async ()=>{
  formDone = true;
  if(!foodSafetyDays.includes(today)){
    foodSafetyDays.push(today);
    calcStreak();
  }
  await saveState();
  renderFoodSafety();
  renderScoreboardView();
  showToast('✓ Food Safety Marked Complete!');
});
