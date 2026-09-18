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
  await fetch(`${API_BASE}/api/manager/logout`, {method: 'POST'});
  document.getElementById('pinGate').style.display = 'block';
  document.getElementById('manageContent').style.display = 'none';
  document.getElementById('pinInput').value = '';
});

(async function checkManagerStatus(){
  try{
    const res = await fetch(`${API_BASE}/api/manager/status`);
    const {isManager} = await res.json();
    if(isManager){
      document.getElementById('pinGate').style.display = 'none';
      document.getElementById('manageContent').style.display = 'block';
      renderManage();
    }
  }catch(err){ /* stay locked if the status check fails */ }
})();

// Collapsible accordion groups in Manage. Only "General Settings" starts open
// (matches the .open class already on that group in the HTML).
window.toggleManageGroup = function(headerEl){
  headerEl.closest('.manage-group').classList.toggle('open');
};

document.getElementById('btnUpdateTarget').addEventListener('click', async ()=>{
  const v = parseInt(document.getElementById('targetInput').value);
  if(!isNaN(v) && v > 0){
    wasteTarget = v;
    await saveState();
    renderScoreboardView();
    showToast('✓ Target Updated');
  }
});

async function renderManage(){
  document.getElementById('targetInput').value = wasteTarget;
  document.getElementById('monthCloseStatus').textContent = wasteLogLastClosedOut
    ? `Last closed out: ${new Date(wasteLogLastClosedOut).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})} · ${entries.length} entries since`
    : `Never closed out yet · ${entries.length} entries logged so far`;

  renderLXManage();
  renderGXManage();
  renderTXManage();
  renderHomeManage();
  renderEOISubmissions();
  renderNumbersTab();
  renderScoreboardManage();
  
  const list = document.getElementById('prodList');
  const prodGroups = {};
  const prodGroupOrder = [];
  products.forEach(p=>{
    const key = p.section + '||' + p.cat;
    if(!prodGroups[key]){ prodGroups[key] = {section: p.section, cat: p.cat, items: []}; prodGroupOrder.push(key); }
    prodGroups[key].items.push(p);
  });
  list.innerHTML = prodGroupOrder.map(key=>{
    const g = prodGroups[key];
    const sectionLabel = g.section === 'foh' ? '🔴 FOH' : '🟠 BOH';
    return `
      <div class="prod-group">
        <div class="prod-group-header">${sectionLabel} · ${escapeHtml(g.cat)}</div>
        ${g.items.map(p=>`
          <div class="prod-row" data-id="${p.id}">
            <input class="prod-input prod-input-name" value="${escapeHtml(p.name)}" data-f="name" placeholder="Name">
            <input class="prod-input prod-input-unit" value="${escapeHtml(p.unit)}" data-f="unit" placeholder="Unit">
            <div class="prod-cost-wrap">
              <span class="prod-cost-sign">$</span>
              <input class="prod-input prod-input-cost" type="number" step="0.01" value="${p.cost}" data-f="cost" placeholder="0.00">
            </div>
            <button class="prod-del" title="Delete permanently">✕</button>
          </div>
        `).join('')}
      </div>
    `;
  }).join('');
  list.querySelectorAll('.prod-row').forEach(row=>{
    const id = row.dataset.id;
    row.querySelectorAll('.prod-input').forEach(inp=>{
      inp.addEventListener('change', async ()=>{
        const prod = products.find(p=>p.id===id);
        const f = inp.dataset.f;
        prod[f] = f==='cost' ? parseFloat(inp.value)||0 : inp.value;
        await saveState();
        renderGrid();
      });
    });
    row.querySelector('.prod-del').addEventListener('click', async ()=>{
      if(!confirm('Remove this product? It will not come back on future updates.')) return;
      products = products.filter(p=>p.id!==id);
      if(!deletedProductIds.includes(id)) deletedProductIds.push(id);
      await saveState();
      renderManage(); renderGrid();
    });
  });

  const tlist = document.getElementById('teamList');
  tlist.innerHTML = teamMembers.map((tm,i)=>`
    <div style="display:flex;justify-content:space-between;align-items:center;background:var(--cfa-light);padding:8px 12px;border-radius:6px;margin-bottom:6px;">
      <span style="font-size:12px;">${tm}</span>
      <button onclick="deleteTeam(${i})" style="background:none;border:none;color:var(--cfa-red);cursor:pointer;font-weight:bold;">✕</button>
    </div>
  `).join('');
}

window.deleteTeam = async function(i){
  teamMembers.splice(i,1);
  await saveState();
  renderManage();
};

document.getElementById('btnAddProd').addEventListener('click', async ()=>{
  const section = document.getElementById('newSection').value;
  const name = document.getElementById('newName').value.trim();
  const unit = document.getElementById('newUnit').value.trim() || 'each';
  const cost = parseFloat(document.getElementById('newCost').value)||0;
  if(!name) return;
  products.push({id:'p'+Date.now(), section, cat:'Custom', name, unit, cost});
  document.getElementById('newName').value='';
  document.getElementById('newUnit').value='';
  document.getElementById('newCost').value='';
  await saveState();
  renderManage(); renderGrid();
  showToast('✓ Product Added');
});

document.getElementById('btnAddTeam').addEventListener('click', async ()=>{
  const name = document.getElementById('newTeamName').value.trim();
  if(name && !teamMembers.includes(name)){
    teamMembers.push(name);
    document.getElementById('newTeamName').value='';
    await saveState();
    renderManage();
    showToast('✓ Team Member Added');
  }
});

document.getElementById('btnSaveLX').addEventListener('click', saveLXScoreboard);

document.addEventListener('click', (e) => {
  if(e.target && e.target.id === 'btnSavePillars'){
    savePillars();
  }
  if(e.target && e.target.id === 'btnSaveGX'){
    saveGXScoreboard();
  }
  if(e.target && e.target.id === 'btnSaveTX'){
    saveTXScoreboard();
  }
  if(e.target && e.target.id === 'btnSaveHome'){
    saveHomeScoreboard();
  }
  if(e.target && e.target.id === 'btnAddTXEvent'){
    txData.events.push({id: 'evt' + Date.now(), name: 'New Event', date: new Date().toISOString().split('T')[0]});
    renderTXManage();
  }
  if(e.target && e.target.id === 'btnAddTXTrial'){
    txData.trialTrainers.push({id: 'trial' + Date.now(), name: 'New Trainer', startDate: new Date().toISOString().split('T')[0]});
    renderTXManage();
  }
  if(e.target && e.target.id === 'btnAddTXCert'){
    txData.certCompetitive.push({id: 'cert' + Date.now(), name: 'New Person', level: 'Trainer', targetDate: new Date().toISOString().split('T')[0]});
    renderTXManage();
  }
  if(e.target && e.target.id === 'btnAddTXCeleb'){
    txData.celebrations.push({id: 'celeb' + Date.now(), name: 'New Person', date: '01-01', type: 'birthday'});
    renderTXManage();
  }
});

document.getElementById('btnImportSchedule').addEventListener('click', importSchedule);

async function importSchedule(){
  const file = document.getElementById('scheduleUpload').files[0];
  const dayToImport = document.getElementById('importDaySelect').value;
  const status = document.getElementById('importStatus');
  
  if(!file){
    status.textContent = '❌ Please select a roster file';
    status.style.color = 'var(--cfa-red)';
    return;
  }
  
  if(!dayToImport){
    status.textContent = '❌ Please select a day';
    status.style.color = 'var(--cfa-red)';
    return;
  }
  
  status.textContent = '⏳ Reading roster...';
  status.style.color = 'var(--text-secondary)';
  
  try {
    const reader = new FileReader();
    reader.onload = async (e)=>{
      const base64Data = e.target.result.split(',')[1];
      
      try {
        const response = await fetch(`${API_BASE}/api/import-roster`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            fileData: base64Data,
            fileType: file.type
          })
        });
        
        const parsed = await response.json();
        
        if(!response.ok){
          throw new Error(parsed.error || 'Import failed');
        }
        
        const fohCount = (parsed.foh || []).length;
        const bohCount = (parsed.boh || []).length;
        
        if(fohCount > 0 || bohCount > 0){
          showRosterPreview(parsed, dayToImport);
          status.textContent = `✓ Found ${fohCount} FOH + ${bohCount} BOH. Review below and confirm.`;
          status.style.color = 'var(--success)';
        } else {
          throw new Error('No roster data found');
        }
      } catch(err){
        status.textContent = '❌ ' + err.message;
        status.style.color = 'var(--cfa-red)';
        console.error(err);
      }
    };
    
    reader.readAsDataURL(file);
  } catch(err){
    status.textContent = '❌ ' + err.message;
    status.style.color = 'var(--cfa-red)';
  }
}

let pendingFOH = [];
let pendingBOH = [];
function renderImportDaySelect(){
  const select = document.getElementById('importDaySelect');
  const thisWeek = getWeekDays(0);
  const nextWeek = getWeekDays(1);
  const optionsFor = days => days.map(d=>`<option value="${d.date}">${d.weekday} (${d.label.split(' ')[1]})</option>`).join('');
  select.innerHTML = '<option value="">Choose a day</option>' +
    '<optgroup label="This Week">' + optionsFor(thisWeek) + '</optgroup>' +
    '<optgroup label="Next Week">' + optionsFor(nextWeek) + '</optgroup>';
}

let pendingDay = '';

function showRosterPreview(data, day){
  pendingFOH = data.foh || [];
  pendingBOH = data.boh || [];
  pendingDay = day;
  
  const modal = document.getElementById('rosterPreviewModal');
  if(!modal) createRosterPreviewModal();
  
  const preview = document.getElementById('rosterPreviewList');
  let html = '<div style="font-weight:600;color:var(--cfa-red);margin-bottom:12px;">🔴 FOH (' + pendingFOH.length + ' people)</div>';
  html += pendingFOH.map((p, i)=>`
    <div style="background:var(--cfa-light);padding:10px;border-radius:6px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;font-size:11px;">
      <div>
        <div style="font-weight:600;">${p.name}</div>
        <div style="color:var(--text-secondary);">${p.start} - ${p.end}</div>
      </div>
      <button onclick="removeFOH(${i})" style="background:none;border:none;color:var(--cfa-red);cursor:pointer;font-weight:bold;">✕</button>
    </div>
  `).join('');
  
  html += '<div style="font-weight:600;color:#FF6600;margin-top:16px;margin-bottom:12px;">🟠 BOH (' + pendingBOH.length + ' people)</div>';
  html += pendingBOH.map((p, i)=>`
    <div style="background:var(--cfa-light);padding:10px;border-radius:6px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;font-size:11px;">
      <div>
        <div style="font-weight:600;">${p.name}</div>
        <div style="color:var(--text-secondary);">${p.start} - ${p.end}</div>
      </div>
      <button onclick="removeBOH(${i})" style="background:none;border:none;color:var(--cfa-red);cursor:pointer;font-weight:bold;">✕</button>
    </div>
  `).join('');
  
  preview.innerHTML = html;
  document.getElementById('rosterPreviewTitle').textContent = 'Review ' + formatVerboseDate(day) + ' Roster';
  document.getElementById('rosterPreviewModal').classList.add('active');
}

window.removeFOH = function(i){
  pendingFOH.splice(i, 1);
  showRosterPreview({foh: pendingFOH, boh: pendingBOH}, pendingDay);
};

window.removeBOH = function(i){
  pendingBOH.splice(i, 1);
  showRosterPreview({foh: pendingFOH, boh: pendingBOH}, pendingDay);
};

function createRosterPreviewModal(){
  const html = `
    <div class="overlay" id="rosterPreviewModal">
      <div class="sheet" style="max-width:500px;">
        <h2 id="rosterPreviewTitle">Review Roster</h2>
        <div id="rosterPreviewList" style="max-height:450px;overflow-y:auto;margin-bottom:20px;"></div>
        <button id="btnConfirmRoster" class="btn btn-primary">Confirm & Save</button>
        <button id="btnCancelRoster" class="btn btn-ghost">Cancel</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  
  document.getElementById('btnConfirmRoster').addEventListener('click', confirmRoster);
  document.getElementById('btnCancelRoster').addEventListener('click', ()=>document.getElementById('rosterPreviewModal').classList.remove('active'));
}

async function confirmRoster(){
  const fohTagged = pendingFOH.map(p => ({...p, source: 'import'}));
  const bohTagged = pendingBOH.map(p => ({...p, source: 'import'}));
  fohRoster[pendingDay] = mergeImportedDayRoster(fohRoster[pendingDay], fohTagged);
  bohRoster[pendingDay] = mergeImportedDayRoster(bohRoster[pendingDay], bohTagged);
  touchLastUpdated(pendingDay);
  await saveState();
  document.getElementById('rosterPreviewModal').classList.remove('active');
  document.getElementById('scheduleUpload').value = '';
  document.getElementById('importDaySelect').value = '';
  const dayLabel = formatVerboseDate(pendingDay);
  document.getElementById('importStatus').textContent = '✓ ' + dayLabel + ' roster saved! (' + pendingFOH.length + ' FOH + ' + pendingBOH.length + ' BOH)';
  document.getElementById('importStatus').style.color = 'var(--success)';
  showToast('✓ ' + dayLabel + ' Roster Updated!');
}

function generateWastePdf(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const throughDate = new Date().toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'});

  doc.setFontSize(16);
  doc.text('CFA Buda — Waste Log', 14, 18);
  doc.setFontSize(10);
  doc.text(`Export through ${throughDate}`, 14, 25);

  const sorted = [...entries].sort((a,b)=>a.ts-b.ts);
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
    doc.text(String(e.name).slice(0, 32), 55, y);
    doc.text(`${e.qty}${e.unit}`, 118, y);
    doc.text(`$${e.cost.toFixed(2)}`, 138, y);
    doc.text(e.who || '', 160, y);
    doc.text(e.section.toUpperCase(), 178, y);
    y += 6;
  });

  const total = entries.reduce((sum,e)=>sum+e.cost,0);
  y += 3;
  doc.setLineWidth(0.4);
  doc.line(14, y - 3, 196, y - 3);
  y += 4;
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text(`Total Waste: $${total.toFixed(2)}`, 14, y);
  doc.text(`Entries: ${entries.length}`, 110, y);

  doc.save(`cfa-buda-waste-log-through-${today}.pdf`);
}

document.getElementById('btnCloseOutMonth').addEventListener('click', async ()=>{
  if(entries.length === 0){
    showToast('No waste entries to export yet');
    return;
  }
  const confirmed = confirm(
    `This will download a CSV and a PDF covering all ${entries.length} waste entries logged since the last close-out, then permanently clear the waste log to start fresh. This can't be undone. Continue?`
  );
  if(!confirmed) return;

  const csv = buildCsvContent();
  const csvBlob = new Blob([csv], {type: 'text/csv'});
  const csvUrl = URL.createObjectURL(csvBlob);
  const csvLink = document.createElement('a');
  csvLink.href = csvUrl;
  csvLink.download = `cfa-buda-waste-log-through-${today}.csv`;
  csvLink.click();
  URL.revokeObjectURL(csvUrl);

  generateWastePdf();

  // Save a lightweight permanent summary before wiping raw entries — this is
  // what lets month-over-month trends on Scoreboard keep working after a
  // close-out, without needing to keep every raw entry around forever.
  const monthKey = today.slice(0, 7); // YYYY-MM
  const closingFohTotal = entries.filter(e=>e.section==='foh').reduce((s,e)=>s+e.cost,0);
  const closingBohTotal = entries.filter(e=>e.section==='boh').reduce((s,e)=>s+e.cost,0);
  const closingByProduct = {};
  entries.forEach(e=>{ closingByProduct[e.name] = (closingByProduct[e.name]||0) + e.cost; });
  const closingTopProducts = Object.entries(closingByProduct).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,cost])=>({name, cost}));
  wasteMonthlyHistory[monthKey] = {
    total: entries.reduce((s,e)=>s+e.cost,0),
    fohTotal: closingFohTotal,
    bohTotal: closingBohTotal,
    entryCount: entries.length,
    topProducts: closingTopProducts,
    closedOutAt: Date.now()
  };

  entries = [];
  wasteLogLastClosedOut = Date.now();
  await saveState();
  renderGrid();
  renderTape();
  renderScoreboardView();
  renderManage();
  showToast('✓ Waste log exported and reset');
});

document.getElementById('btnExportCsv').addEventListener('click',()=>{
  const rows = [['Date/Time','Product','Qty','Unit','Unit Cost','Total Cost','Logged By','Section']];
  [...entries].sort((a,b)=>b.ts-a.ts).forEach(e=>{
    rows.push([new Date(e.ts).toISOString(), e.name, e.qty, e.unit, e.unitCost.toFixed(2), e.cost.toFixed(2), e.who, e.section.toUpperCase()]);
  });
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cfa-buda-operational-log.csv';
  a.click();
});

function buildCsvContent(){
  const rows = [['Date/Time','Product','Qty','Unit','Unit Cost','Total Cost','Logged By','Section']];
  [...entries].sort((a,b)=>b.ts-a.ts).forEach(e=>{
    rows.push([new Date(e.ts).toLocaleString(), e.name, e.qty, e.unit, e.unitCost.toFixed(2), e.cost.toFixed(2), e.who, e.section.toUpperCase()]);
  });
  return rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
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
  await loadState();
  renderGrid();
  renderTape();
  renderScoreboardView();
  renderLXScoreboard();
  renderGXScoreboard();
  renderTXScoreboard();
  renderHomeScoreboard();
  renderImportDaySelect();
  renderTrainingGuides('bohTrainingGuidesContainer', bohTrainingGuidesData, true);
  renderTrainingGuides('fohTrainingGuidesContainer', fohTrainingGuidesData, false);
})();
