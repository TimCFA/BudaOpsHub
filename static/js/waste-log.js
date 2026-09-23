// A product named "X (Small)" / "X (Medium)" / "X (Large)" is a size variant
// of the same item — group those into one stacked tile instead of scattering
// them across the grid, purely for visual/aesthetic grouping.
const SIZE_SUFFIX_RE = /^(.*)\s\((Small|Medium|Large)\)$/;

function groupProductsByCategory(list){
  const order = [];
  const byCat = {};
  list.forEach(p=>{
    if(!byCat[p.cat]){ byCat[p.cat] = []; order.push(p.cat); }
    byCat[p.cat].push(p);
  });
  return order.map(cat => ({cat, items: byCat[cat]}));
}

function groupSizeVariants(items){
  const sizeOrder = {Small:0, Medium:1, Large:2};
  const bases = {};
  const order = [];
  const seenBase = new Set();
  items.forEach(p=>{
    const m = p.name.match(SIZE_SUFFIX_RE);
    if(m){
      const base = m[1];
      if(!bases[base]) bases[base] = [];
      bases[base].push({size: m[2], product: p});
      if(!seenBase.has(base)){ seenBase.add(base); order.push({type:'sizegroup', base}); }
    } else {
      order.push({type:'single', product: p});
    }
  });
  return order.map(entry=>{
    if(entry.type !== 'sizegroup') return entry;
    const variants = bases[entry.base].slice().sort((a,b)=>sizeOrder[a.size]-sizeOrder[b.size]);
    if(variants.length < 2) return {type:'single', product: variants[0].product};
    return {type:'sizegroup', base: entry.base, variants};
  });
}

function renderTile(p){
  return `
    <div class="tile" data-id="${p.id}">
      <div>
        <div class="name">${p.name}</div>
        ${p.es ? `<div class="name-es">${p.es}</div>` : ''}
      </div>
      <div class="cost">${p.cost>0?'$'+p.cost.toFixed(2):'—'}</div>
    </div>
  `;
}

function renderSizeGroupTile(base, variants){
  return `
    <div class="tile-sizegroup">
      <div class="tile-sizegroup-name">${base}</div>
      <div class="tile-sizegroup-sizes">
        ${variants.map(v => `
          <div class="tile-sizegroup-row" data-id="${v.product.id}" title="${v.product.name}">
            <span class="tile-sizegroup-size">${v.size.charAt(0)}</span>
            <span class="tile-sizegroup-cost">${v.product.cost>0?'$'+v.product.cost.toFixed(2):'—'}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderGrid(){
  const grid = document.getElementById('grid');
  const filtered = products.filter(p=>p.section===currentSection);
  if(filtered.length===0){
    grid.innerHTML = `<div class="empty-state"><b>No products</b></div>`;
    return;
  }
  const groups = groupProductsByCategory(filtered);
  grid.innerHTML = groups.map(({cat, items})=>{
    // Three-size items (S/M/L) lead their category so they line up together.
    const grouped = groupSizeVariants(items);
    const entries = [...grouped.filter(e=>e.type==='sizegroup'), ...grouped.filter(e=>e.type!=='sizegroup')];
    const tilesHtml = entries.map(entry =>
      entry.type === 'sizegroup' ? renderSizeGroupTile(entry.base, entry.variants) : renderTile(entry.product)
    ).join('');
    return `
      <div class="waste-cat-group">
        <div class="waste-cat-heading">${cat}</div>
        <div class="grid">${tilesHtml}</div>
      </div>
    `;
  }).join('');
  grid.querySelectorAll('.tile, .tile-sizegroup-row').forEach(el=>{
    el.addEventListener('click',()=>openLogModal(el.dataset.id));
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

// Recent Entries is a rolling 15-minute display window, NOT a data deletion —
// entries stay in the underlying `entries` array (and count toward totals,
// exports, etc.) long after they scroll out of this list.
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
      <span class="l">${new Date(e.ts).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})} · ${e.name}</span>
      <span class="r">${e.qty}${e.unit} · $${e.cost.toFixed(2)}</span>
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
  const todayEntries = entries.filter(e => toLocalISODate(new Date(e.ts)) === today);
  const total = todayEntries.reduce((sum,e)=>sum+e.cost,0);
  const fohTotal = todayEntries.filter(e=>e.section==='foh').reduce((sum,e)=>sum+e.cost,0);
  const bohTotal = todayEntries.filter(e=>e.section==='boh').reduce((sum,e)=>sum+e.cost,0);

  document.getElementById('statEntries').textContent = todayEntries.length;
  document.getElementById('statFohSubtotal').textContent = '$' + fohTotal.toFixed(2);
  document.getElementById('statBohSubtotal').textContent = '$' + bohTotal.toFixed(2);

  const byProduct = {};
  todayEntries.forEach(e=>{
    byProduct[e.name] = (byProduct[e.name]||0) + e.cost;
  });
  const sorted = Object.entries(byProduct).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxVal = sorted[0]?sorted[0][1]:1;

  document.getElementById('barList').innerHTML = sorted.length ? sorted.map(([name,cost])=>`
    <div class="bar-item">
      <div class="bi-top">
        <span class="bn">${name}</span>
        <span class="bv">$${cost.toFixed(2)}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(cost/maxVal)*100}%"></div>
      </div>
    </div>
  `).join('') : '<div style="text-align:center;color:var(--text-secondary);font-size:12px;padding:12px 0;">No waste logged yet today</div>';

  // Today's Waste hero
  document.getElementById('wasteTodayDate').textContent = formatVerboseDate(today);
  document.getElementById('wasteTodayTotal').textContent = '$' + total.toFixed(2);
  document.getElementById('wasteTodayTarget').textContent = '$' + wasteTarget.toFixed(2);
  const pct = Math.min(100, (total / wasteTarget) * 100);
  const fillEl = document.getElementById('wasteProgressFill');
  const pill = document.getElementById('wasteStatusPill');
  fillEl.style.width = pct + '%';
  if(total < wasteTarget){
    pill.textContent = '✓ On Track';
    pill.className = 'waste-status-pill on-track';
    fillEl.className = 'waste-progress-fill on-track';
  } else {
    pill.textContent = '⚠ Over Target';
    pill.className = 'waste-status-pill over-target';
    fillEl.className = 'waste-progress-fill over-target';
  }

  // Active Streaks
  document.getElementById('foodSafetyStreakNum').textContent = foodSafetyStreak;
  document.getElementById('foodSafetyStreakLabel').textContent = 'consecutive ' + (foodSafetyStreak === 1 ? 'day' : 'days');
  document.getElementById('wasteStreakNum').textContent = wasteStreak;
  document.getElementById('wasteStreakLabel').textContent = 'consecutive ' + (wasteStreak === 1 ? 'day' : 'days');
  document.getElementById('fohOEStreakNum').textContent = fohOEStreak;
  document.getElementById('fohOEStreakLabel').textContent = 'consecutive ' + (fohOEStreak === 1 ? 'day' : 'days');
}
