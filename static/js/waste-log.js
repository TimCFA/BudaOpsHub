// Products named "Base (Option)" in the same category — "Waffle Fries (Small)",
// "Nuggets (5 ct)", "Hash Browns (Regular)" — collapse into one row with a
// button per option, so adding "Nuggets (30 ct)" in Manage just adds a button.
const VARIANT_SUFFIX_RE = /^(.*)\s\(([^)]+)\)$/;
const VARIANT_SIZE_RANK = {Small:0, Regular:0, Medium:1, Large:2};
const VARIANT_SIZE_SHORT = {Small:'S', Regular:'R', Medium:'M', Large:'L'};

function variantCount(option){
  const m = option.match(/^(\d+)\s*ct$/i);
  return m ? parseInt(m[1], 10) : null;
}

// Button text: sizes as one letter (S/M/L/R), counts as the number ("5 ct" -> "5").
function variantLabel(option){
  if(VARIANT_SIZE_SHORT[option]) return VARIANT_SIZE_SHORT[option];
  const n = variantCount(option);
  return n !== null ? String(n) : option;
}

// Sizes small→large, counts low→high, anything else keeps its list order.
function variantRank(option, index){
  if(option in VARIANT_SIZE_RANK) return VARIANT_SIZE_RANK[option];
  const n = variantCount(option);
  return n !== null ? n : 1000 + index;
}

function groupProductsByCategory(list){
  const byCat = {};
  const seen = [];
  list.forEach(p=>{
    if(!byCat[p.cat]){ byCat[p.cat] = []; seen.push(p.cat); }
    byCat[p.cat].push(p);
  });
  const section = list.length ? list[0].section : currentSection;
  return sortCategories(section, seen).map(cat => ({cat, items: byCat[cat]}));
}

function groupVariants(items){
  const bases = {};
  const order = [];
  items.forEach((p, index)=>{
    const m = p.name.match(VARIANT_SUFFIX_RE);
    if(m){
      const base = m[1];
      if(!bases[base]){ bases[base] = []; order.push({type:'variants', base}); }
      bases[base].push({option: m[2], rank: variantRank(m[2], index), product: p});
    } else {
      order.push({type:'single', product: p});
    }
  });
  return order.map(entry=>{
    if(entry.type !== 'variants') return entry;
    const variants = bases[entry.base].slice().sort((a,b)=>a.rank-b.rank);
    if(variants.length < 2) return {type:'single', product: variants[0].product};
    return {type:'variants', base: entry.base, variants};
  });
}

function wasteCostLabel(cost){
  return cost>0 ? '$'+cost.toFixed(2) : '';
}

function renderItemRow(p){
  const cost = wasteCostLabel(p.cost);
  return `
    <div class="waste-item" data-id="${p.id}">
      <div class="waste-item-text">
        <div class="waste-item-name">${escapeHtml(p.name)}</div>
        ${p.es ? `<div class="waste-item-es">${escapeHtml(p.es)}</div>` : ''}
      </div>
      ${cost ? `<span class="waste-item-cost">${cost}</span>` : ''}
    </div>
  `;
}

// Option variants share one row: the item name, then a button per option.
function renderVariantRow(base, variants){
  const es = (variants[0].product.es || '').replace(/\s*\([^)]*\)$/, '');
  return `
    <div class="waste-item">
      <div class="waste-item-text">
        <div class="waste-item-name">${escapeHtml(base)}</div>
        ${es ? `<div class="waste-item-es">${escapeHtml(es)}</div>` : ''}
      </div>
      <div class="waste-sizes${variants.some(v=>variantLabel(v.option).length > 2) ? ' waste-sizes-words' : ''}">
        ${variants.map(v => {
          const cost = wasteCostLabel(v.product.cost);
          return `<button type="button" class="waste-size-btn" data-id="${v.product.id}" title="${escapeHtml(v.product.name)}" aria-label="${escapeHtml(v.product.name)}">${escapeHtml(variantLabel(v.option))}${cost ? `<small>${cost}</small>` : ''}</button>`;
        }).join('')}
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
    // Option rows lead their category so their buttons line up together.
    const grouped = groupVariants(items);
    const entries = [...grouped.filter(e=>e.type==='variants'), ...grouped.filter(e=>e.type!=='variants')];
    const rowsHtml = entries.map(entry =>
      entry.type === 'variants' ? renderVariantRow(entry.base, entry.variants) : renderItemRow(entry.product)
    ).join('');
    return `
      <section class="waste-cat-card">
        <div class="waste-cat-heading"><span>${escapeHtml(cat)}</span><span class="waste-cat-count">${items.length}</span></div>
        ${rowsHtml}
      </section>
    `;
  }).join('');
  grid.querySelectorAll('[data-id]').forEach(el=>{
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
