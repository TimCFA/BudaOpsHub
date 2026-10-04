// ===== WEEKLY ROSTER IMPORT (CSV) =====
// HotSchedules exports the full week as a structured CSV — one row per shift
// block, per-day Shift/Schedule/Job columns. Plain, deterministic parsing: no
// AI call, no risk of a misread name or time. This is the only roster import.
//
// - FOH/BOH comes from Schedule ("Front of House"/"Back of House"), or for
//   Leadership shifts from the Job ("FOH - Team Leader"). Team Leader shifts
//   mark the person as a leader for that day (Lead Captain, leader coverage).
// - Off-floor shifts (Other: Administrative/Truck/Maintenance, Training, and
//   Leadership · Administrative) are left out; the preview counts them.
// - A split shift keeps its separate blocks, so a 5:30–8:00 + 10:00–3:30 day
//   doesn't count someone on the floor during their 8–10 admin time.
// - Sunday is skipped (closed). The week comes from the file name
//   (Weekly_Roster_09202026_09262026.csv) when it has one.
// - Phone numbers are never read. Manually added roster entries
//   (source: 'manual') are always preserved.

let weeklyImportOffset = 0;
let weeklyImportParsed = null; // {Mon: {foh:[], boh:[]}, Tue: {...}, ...}
let weeklyImportUnrecognized = [];
let weeklyImportActiveDay = 'Mon';
let weeklyImportFileStart = null;   // Sunday ISO from the file name, if any
let weeklyImportOffFloor = {};

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
  const header = rows[0].map(h => h.replace(/^\uFEFF/, '').trim());
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
  const offFloor = {};

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

      let section = null, leader = false;
      if(schedule === 'Front of House') section = 'foh';
      else if(schedule === 'Back of House') section = 'boh';
      else if(schedule === 'Leadership' && /FOH/i.test(job)){ section = 'foh'; leader = /leader/i.test(job); }
      else if(schedule === 'Leadership' && /BOH/i.test(job)){ section = 'boh'; leader = /leader/i.test(job); }
      else if(schedule === 'Other' || schedule === 'Training' || schedule === 'Leadership'){
        const kind = job || schedule;
        offFloor[kind] = (offFloor[kind] || 0) + 1;
        return;
      }

      if(!section){
        unrecognized.push({name, day, schedule, job, shift: shiftStr});
        return;
      }

      const bucket = result[day][section];
      let person = bucket.find(p => p.name.toLowerCase() === name.toLowerCase());
      if(!person){
        person = {name, start: range.start, end: range.end, blocks: []};
        bucket.push(person);
      }
      person.blocks.push({start: range.start, end: range.end});
      if(leader) person.leader = true;
      if(parseShiftTimeToMinutes(range.start) < parseShiftTimeToMinutes(person.start)) person.start = range.start;
      if(parseShiftTimeToMinutes(range.end) > parseShiftTimeToMinutes(person.end)) person.end = range.end;
    });
  }
  // Back-to-back or overlapping blocks are one stretch on the floor; keep
  // blocks only when there's a real gap (a split shift).
  HS_DAY_ORDER.forEach(day => ['foh', 'boh'].forEach(sec => result[day][sec].forEach(p=>{
    const mins = t => parseShiftTimeToMinutes(t);
    const merged = [];
    p.blocks.sort((a, b) => mins(a.start) - mins(b.start)).forEach(b=>{
      const last = merged[merged.length - 1];
      if(last && mins(b.start) <= mins(last.end)){ if(mins(b.end) > mins(last.end)) last.end = b.end; }
      else merged.push({...b});
    });
    if(merged.length < 2) delete p.blocks;
    else p.blocks = merged;
  })));

  return {result, unrecognized, offFloor};
}

// "Weekly_Roster_09202026_09262026.csv" → the Sunday it starts on, as ISO.
function weeklyRosterStartFromFileName(fileName){
  const m = String(fileName || '').match(/(\d{2})(\d{2})(\d{4})_(\d{2})(\d{2})(\d{4})/);
  if(!m) return null;
  const d = new Date(+m[3], +m[1] - 1, +m[2]);
  return isNaN(d) ? null : toLocalISODate(d);
}

// The Monday–Saturday dates the import applies to: from the file name when it
// has one, else the This Week / Next Week toggle.
function weeklyImportDays(){
  if(weeklyImportFileStart){
    const sunday = new Date(weeklyImportFileStart + 'T00:00:00');
    return WEEKDAY_NAMES.map((name, i)=>{
      const d = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 1 + i);
      return {weekday: name, date: toLocalISODate(d), label: name.slice(0, 3) + ' ' + d.toLocaleDateString('en-US', {month: 'numeric', day: 'numeric'})};
    });
  }
  return getWeekDays(weeklyImportOffset);
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

let weeklyImportPendingFile = null;   // file name, for the Data Uploads log

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

  const weekDays = weeklyImportDays();
  const rangeLabel = weekDays.length ? `${weekDays[0].label} – ${weekDays[weekDays.length-1].label}` : '';
  document.getElementById('weeklyImportWeekLabel').textContent = weeklyImportFileStart
    ? `Applying to: ${rangeLabel} (dates from ${/^HotSchedules_Sync_/.test(weeklyImportPendingFile || '') ? 'HotSchedules' : 'the file name'})`
    : `Applying to: ${weeklyImportOffset === 0 ? 'This Week' : 'Next Week'} (${rangeLabel}) — the file name has no dates`;
  // No dates in the file name: let the leader pick the week here.
  let weekPick = document.getElementById('weeklyImportWeekPick');
  if(!weekPick){
    weekPick = document.createElement('div');
    weekPick.id = 'weeklyImportWeekPick';
    weekPick.className = 'week-toggle';
    weekPick.style.margin = '8px 0 12px';
    document.getElementById('weeklyImportWeekLabel').after(weekPick);
    weekPick.addEventListener('click', e=>{
      const b = e.target.closest('[data-weekly-offset]');
      if(!b) return;
      weeklyImportOffset = parseInt(b.dataset.weeklyOffset, 10);
      showWeeklyImportPreview();
    });
  }
  weekPick.style.display = weeklyImportFileStart ? 'none' : '';
  weekPick.innerHTML = [0, 1].map(o => `<button type="button" class="wri-week-btn ${weeklyImportOffset === o ? 'active' : ''}" aria-pressed="${weeklyImportOffset === o}" data-weekly-offset="${o}">${o ? 'Next Week' : 'This Week'}</button>`).join('');

  const tabsEl = document.getElementById('weeklyImportDayTabs');
  tabsEl.innerHTML = HS_DAY_ORDER.map(day=>`<div class="day-pill ${day===weeklyImportActiveDay?'active':''}" data-hsday="${day}">${day}</div>`).join('');
  tabsEl.querySelectorAll('.day-pill').forEach(pill=>{
    pill.addEventListener('click', ()=>{
      weeklyImportActiveDay = pill.dataset.hsday;
      showWeeklyImportPreview();
    });
  });

  const warn = document.getElementById('weeklyImportUnrecognizedWarning');
  const offFloorText = Object.entries(weeklyImportOffFloor).map(([k, n]) => `${n} ${k}`).join(', ');
  const parts = [];
  if(weeklyImportUnrecognized.length > 0){
    parts.push(`⚠️ ${weeklyImportUnrecognized.length} shift(s) had an unrecognized Schedule/Job value and were skipped: ` +
      weeklyImportUnrecognized.slice(0,5).map(u => escapeHtml(`${u.name} (${u.day}, ${u.schedule})`)).join(', ') +
      (weeklyImportUnrecognized.length > 5 ? `, +${weeklyImportUnrecognized.length - 5} more` : ''));
  }
  if(offFloorText) parts.push(`Off the floor, not added: ${escapeHtml(offFloorText)} shift${Object.values(weeklyImportOffFloor).reduce((a, b) => a + b, 0) === 1 ? '' : 's'}.`);
  warn.style.display = parts.length ? 'block' : 'none';
  warn.innerHTML = parts.join('<br>');

  const day = weeklyImportActiveDay;
  const dayData = weeklyImportParsed[day];
  const wd = weekDays.find(d => d.weekday === HS_DAY_TO_WEEKDAY[day]);
  const existingFoh = wd ? (fohRoster[wd.date] || []).filter(p => p.source === 'manual') : [];
  const existingBoh = wd ? (bohRoster[wd.date] || []).filter(p => p.source === 'manual') : [];

  const renderList = (list) => list.length === 0
    ? '<div style="font-size:11px;color:var(--text-tertiary);padding:4px 0;">None</div>'
    : list.map(p => `<div style="font-size:11px;padding:4px 0;">${escapeHtml(p.name)}${p.leader ? ' <b style="color:#1C1B19;">· Team Leader</b>' : ''} — ${escapeHtml(rosterTimeText(p))}</div>`).join('');

  document.getElementById('weeklyImportDayContent').innerHTML = `
    <div style="font-weight:700;font-size:12px;color:var(--cfa-red);margin-bottom:6px;">FOH (${dayData.foh.length} from file)</div>
    ${renderList(dayData.foh)}
    ${existingFoh.length ? `<div style="margin-top:8px;font-size:10px;color:#1565C0;font-weight:600;">Preserved (manually added, not overwritten):</div>${renderList(existingFoh)}` : ''}
    <div style="font-weight:700;font-size:12px;color:#FF6600;margin:14px 0 6px;">BOH (${dayData.boh.length} from file)</div>
    ${renderList(dayData.boh)}
    ${existingBoh.length ? `<div style="margin-top:8px;font-size:10px;color:#1565C0;font-weight:600;">Preserved (manually added, not overwritten):</div>${renderList(existingBoh)}` : ''}
  `;

  document.getElementById('weeklyImportPreviewModal').classList.add('active');
}

async function confirmWeeklyImport(){
  const weekDays = weeklyImportDays();
  const changeCount = () => weekDays.filter(d => d.date >= today).reduce((n, d) => n + rosterDayChanges(d.date, 'foh').length + rosterDayChanges(d.date, 'boh').length, 0);
  HS_DAY_ORDER.forEach(hsDay=>{
    const wd = weekDays.find(d => d.weekday === HS_DAY_TO_WEEKDAY[hsDay]);
    if(!wd) return;
    const dateISO = wd.date;
    const dayData = weeklyImportParsed[hsDay];
    // Keep the day's posted schedule before it's replaced (shift changes).
    rosterNotePosted(dateISO, 'foh', fohRoster[dateISO]);
    rosterNotePosted(dateISO, 'boh', bohRoster[dateISO]);
    fohRoster[dateISO] = mergeImportedDayRoster(fohRoster[dateISO], dayData.foh);
    bohRoster[dateISO] = mergeImportedDayRoster(bohRoster[dateISO], dayData.boh);
    touchLastUpdated(dateISO);
  });
  rosterPrunePosted();
  const changesNow = changeCount();
  duRecord('roster', {file: weeklyImportPendingFile, summary: `${weekDays[0].label} – ${weekDays[weekDays.length - 1].label}`});
  await saveState();
  document.getElementById('weeklyImportPreviewModal').classList.remove('active');
  weeklyImportFileStart = null;
  renderRoster();
  renderAllDayparts();
  updateSelectedDayInfo('daySelect', 'daySelectedInfo');
  renderDataUploads();
  showToast(changesNow ? `✓ Roster saved · ${changesNow} shift change${changesNow === 1 ? '' : 's'}` : '✓ Weekly Roster Imported!');
}
