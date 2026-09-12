// ===== WEEKLY ROSTER IMPORT (CSV) =====
// HotSchedules exports the full week as a structured CSV — one row per employee,
// per-day Shift/Schedule/Job columns. This is plain, deterministic text parsing:
// no AI call, no cost, no risk of a misread name or time. Sunday and Other/Truck
// shifts are intentionally excluded, per decision. Manually-added roster entries
// (source: 'manual') are always preserved and never overwritten by an import.

let weeklyImportOffset = 0;
let weeklyImportParsed = null; // {Mon: {foh:[], boh:[]}, Tue: {...}, ...}
let weeklyImportUnrecognized = [];
let weeklyImportActiveDay = 'Mon';

document.querySelectorAll('[data-weekly-offset]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('[data-weekly-offset]').forEach(b=>{
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    weeklyImportOffset = parseInt(btn.dataset.weeklyOffset, 10);
  });
});

function parseCsv(text){
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if(c === '"') inQuotes = true;
      else if(c === ',') { row.push(field); field = ''; }
      else if(c === '\r') { /* skip, handled by \n below */ }
      else if(c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if(field.length > 0 || row.length > 0){ row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

function convertHsTime(str){
  const m = String(str).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if(!m) return null;
  return `${m[1]}:${m[2]}${m[3].toLowerCase()[0]}`;
}

function parseHsShiftRange(str){
  if(!str || str === '-') return null;
  const parts = str.split(' - ');
  if(parts.length !== 2) return null;
  const start = convertHsTime(parts[0]);
  const end = convertHsTime(parts[1]);
  if(!start || !end) return null;
  return {start, end};
}

const HS_DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; // Sunday intentionally excluded
const HS_DAY_TO_WEEKDAY = {Mon:'Monday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday', Sat:'Saturday'};

function parseWeeklyRosterCsv(text){
  const rows = parseCsv(text);
  if(rows.length < 2) throw new Error('CSV appears to be empty');
  const header = rows[0].map(h => h.trim());
  const nameIdx = header.findIndex(h => h.toLowerCase() === 'employee');
  if(nameIdx === -1) throw new Error('Could not find an "Employee" column in this file');

  const dayCols = {};
  HS_DAY_ORDER.forEach(day=>{
    dayCols[day] = {
      shift: header.indexOf(`${day} Shift`),
      schedule: header.indexOf(`${day} Schedule`),
      job: header.indexOf(`${day} Job`)
    };
  });

  const result = {};
  HS_DAY_ORDER.forEach(day => { result[day] = {foh: [], boh: []}; });
  const unrecognized = [];

  for(let r = 1; r < rows.length; r++){
    const row = rows[r];
    const name = (row[nameIdx] || '').trim();
    if(!name) continue;

    HS_DAY_ORDER.forEach(day=>{
      const cols = dayCols[day];
      if(cols.shift === -1) return;
      const shiftStr = (row[cols.shift] || '').trim();
      const range = parseHsShiftRange(shiftStr);
      if(!range) return;

      const schedule = (row[cols.schedule] || '').trim();
      const job = (row[cols.job] || '').trim();

      let section = null;
      if(schedule === 'Front of House') section = 'foh';
      else if(schedule === 'Back of House') section = 'boh';
      else if(schedule === 'Leadership'){
        if(/FOH/i.test(job)) section = 'foh';
        else if(/BOH/i.test(job)) section = 'boh';
      } else if(schedule === 'Other'){
        return; // Truck/Other shifts excluded from the roster entirely, per decision
      }

      if(!section){
        unrecognized.push({name, day, schedule, job, shift: shiftStr});
        return;
      }

      const bucket = result[day][section];
      const existing = bucket.find(p => p.name.toLowerCase() === name.toLowerCase());
      if(existing){
        // Same person, same day, same section, two separate blocks (rare) —
        // merge into the widest span so nothing gets silently dropped
        if(parseShiftTimeToMinutes(range.start) < parseShiftTimeToMinutes(existing.start)) existing.start = range.start;
        if(parseShiftTimeToMinutes(range.end) > parseShiftTimeToMinutes(existing.end)) existing.end = range.end;
      } else {
        bucket.push({name, start: range.start, end: range.end});
      }
    });
  }

  return {result, unrecognized};
}

// Manual entries always win — anything with source:'manual' is preserved untouched.
// Everything else for that day (previously imported, or legacy untagged data) is
// replaced wholesale by whatever the new file says.
function mergeImportedDayRoster(existingList, importedList){
  const manual = (existingList || []).filter(p => p.source === 'manual');
  const manualNames = new Set(manual.map(p => p.name.toLowerCase()));
  const importedFiltered = importedList
    .filter(p => !manualNames.has(p.name.toLowerCase()))
    .map(p => ({...p, source: 'import'}));
  return [...manual, ...importedFiltered];
}

document.getElementById('btnImportWeeklyRoster').addEventListener('click', ()=>{
  const file = document.getElementById('weeklyRosterUpload').files[0];
  const status = document.getElementById('weeklyImportStatus');
  if(!file){
    status.textContent = '❌ Choose a CSV file first';
    status.style.color = 'var(--cfa-red)';
    return;
  }
  status.textContent = '⏳ Reading roster...';
  status.style.color = 'var(--text-secondary)';

  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const {result, unrecognized} = parseWeeklyRosterCsv(e.target.result);
      weeklyImportParsed = result;
      weeklyImportUnrecognized = unrecognized;
      weeklyImportActiveDay = HS_DAY_ORDER[0];
      showWeeklyImportPreview();
      const totalFoh = HS_DAY_ORDER.reduce((sum,d)=> sum + result[d].foh.length, 0);
      const totalBoh = HS_DAY_ORDER.reduce((sum,d)=> sum + result[d].boh.length, 0);
      status.textContent = `✓ Parsed ${totalFoh} FOH + ${totalBoh} BOH shifts across the week. Review below and confirm.`;
      status.style.color = 'var(--success)';
    }catch(err){
      status.textContent = '❌ ' + err.message;
      status.style.color = 'var(--cfa-red)';
      console.error(err);
    }
  };
  reader.readAsText(file);
});

function createWeeklyImportPreviewModal(){
  const html = `
    <div class="overlay" id="weeklyImportPreviewModal">
      <div class="sheet" style="max-width:560px;">
        <h2>Review Weekly Roster</h2>
        <div class="sub" id="weeklyImportWeekLabel"></div>
        <div class="day-picker" id="weeklyImportDayTabs" style="margin-bottom:14px;"></div>
        <div id="weeklyImportUnrecognizedWarning" style="display:none;background:#FFF3CD;border:1px solid #FFE69C;border-radius:var(--radius);padding:10px 12px;margin-bottom:14px;font-size:11px;color:#856404;"></div>
        <div id="weeklyImportDayContent" style="max-height:400px;overflow-y:auto;margin-bottom:20px;"></div>
        <button id="btnConfirmWeeklyImport" class="btn btn-primary">Confirm & Save Whole Week</button>
        <button id="btnCancelWeeklyImport" class="btn btn-ghost">Cancel</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);

  document.getElementById('btnCancelWeeklyImport').addEventListener('click', ()=>{
    document.getElementById('weeklyImportPreviewModal').classList.remove('active');
  });
  document.getElementById('weeklyImportPreviewModal').addEventListener('click', (e)=>{
    if(e.target === document.getElementById('weeklyImportPreviewModal')) document.getElementById('weeklyImportPreviewModal').classList.remove('active');
  });
  document.getElementById('btnConfirmWeeklyImport').addEventListener('click', confirmWeeklyImport);
}

function showWeeklyImportPreview(){
  if(!document.getElementById('weeklyImportPreviewModal')) createWeeklyImportPreviewModal();

  const weekDays = getWeekDays(weeklyImportOffset);
  const rangeLabel = weekDays.length ? `${weekDays[0].label} – ${weekDays[weekDays.length-1].label}` : '';
  document.getElementById('weeklyImportWeekLabel').textContent = `Applying to: ${weeklyImportOffset === 0 ? 'This Week' : 'Next Week'} (${rangeLabel})`;

  const tabsEl = document.getElementById('weeklyImportDayTabs');
  tabsEl.innerHTML = HS_DAY_ORDER.map(day=>`<div class="day-pill ${day===weeklyImportActiveDay?'active':''}" data-hsday="${day}">${day}</div>`).join('');
  tabsEl.querySelectorAll('.day-pill').forEach(pill=>{
    pill.addEventListener('click', ()=>{
      weeklyImportActiveDay = pill.dataset.hsday;
      showWeeklyImportPreview();
    });
  });

  const warn = document.getElementById('weeklyImportUnrecognizedWarning');
  if(weeklyImportUnrecognized.length > 0){
    warn.style.display = 'block';
    warn.innerHTML = `⚠️ ${weeklyImportUnrecognized.length} shift(s) had an unrecognized Schedule/Job value and were skipped: ` +
      weeklyImportUnrecognized.slice(0,5).map(u => escapeHtml(`${u.name} (${u.day}, ${u.schedule})`)).join(', ') +
      (weeklyImportUnrecognized.length > 5 ? `, +${weeklyImportUnrecognized.length - 5} more` : '');
  } else {
    warn.style.display = 'none';
  }

  const day = weeklyImportActiveDay;
  const dayData = weeklyImportParsed[day];
  const wd = weekDays.find(d => d.weekday === HS_DAY_TO_WEEKDAY[day]);
  const existingFoh = wd ? (fohRoster[wd.date] || []).filter(p => p.source === 'manual') : [];
  const existingBoh = wd ? (bohRoster[wd.date] || []).filter(p => p.source === 'manual') : [];

  const renderList = (list) => list.length === 0
    ? '<div style="font-size:11px;color:var(--text-tertiary);padding:4px 0;">None</div>'
    : list.map(p => `<div style="font-size:11px;padding:4px 0;">${escapeHtml(p.name)} — ${escapeHtml(p.start)}-${escapeHtml(p.end)}</div>`).join('');

  document.getElementById('weeklyImportDayContent').innerHTML = `
    <div style="font-weight:700;font-size:12px;color:var(--cfa-red);margin-bottom:6px;">🔴 FOH (${dayData.foh.length} from file)</div>
    ${renderList(dayData.foh)}
    ${existingFoh.length ? `<div style="margin-top:8px;font-size:10px;color:#1565C0;font-weight:600;">✏️ Preserved (manually added, not overwritten):</div>${renderList(existingFoh)}` : ''}
    <div style="font-weight:700;font-size:12px;color:#FF6600;margin:14px 0 6px;">🟠 BOH (${dayData.boh.length} from file)</div>
    ${renderList(dayData.boh)}
    ${existingBoh.length ? `<div style="margin-top:8px;font-size:10px;color:#1565C0;font-weight:600;">✏️ Preserved (manually added, not overwritten):</div>${renderList(existingBoh)}` : ''}
  `;

  document.getElementById('weeklyImportPreviewModal').classList.add('active');
}

async function confirmWeeklyImport(){
  const weekDays = getWeekDays(weeklyImportOffset);
  HS_DAY_ORDER.forEach(hsDay=>{
    const wd = weekDays.find(d => d.weekday === HS_DAY_TO_WEEKDAY[hsDay]);
    if(!wd) return;
    const dateISO = wd.date;
    const dayData = weeklyImportParsed[hsDay];
    fohRoster[dateISO] = mergeImportedDayRoster(fohRoster[dateISO], dayData.foh);
    bohRoster[dateISO] = mergeImportedDayRoster(bohRoster[dateISO], dayData.boh);
    touchLastUpdated(dateISO);
  });
  await saveState();
  document.getElementById('weeklyImportPreviewModal').classList.remove('active');
  document.getElementById('weeklyRosterUpload').value = '';
  renderRoster();
  renderAllDayparts();
  updateSelectedDayInfo('daySelect', 'daySelectedInfo');
  showToast('✓ Weekly Roster Imported!');
}
