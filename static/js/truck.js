// ===== TRUCK =====
// Who's doing truck (the delivery) that morning (Tim, Oct 2026: a morning
// went by with nobody scheduled for it). HotSchedules schedules truck as an
// off-floor shift (Schedule "Other", Job "Truck", usually 5:30–8:30a); the
// roster import keeps those here instead of dropping them, and a leader can
// assign someone by hand. Set Ups shows it at the top of the day: who's on
// truck, or a red "No one on truck yet" on a truck day, and on today's page
// the same for tomorrow, so the closing leader catches it the night before.
//
// truckShifts {date: [{name, start, end, source, addedBy, addedAt}]} lives
// in the rosters section (anyone can assign, like adding a team member);
// truckDays, the weekdays the truck comes, is a manager setting.

// The weekdays with a truck shift on the Sept 20–26 2026 schedule: Monday,
// Tuesday, Thursday, Friday, Saturday. Managers change it in Manage.
const TRUCK_DEFAULT_DAYS = [1, 2, 4, 5, 6];
const TRUCK_DEFAULT_TIME = ['5:30a', '8:30a'];
const TRUCK_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let truckModalDate = null;

function truckDaysList(){
  return Array.isArray(truckDays) ? truckDays : TRUCK_DEFAULT_DAYS;
}

function truckWeekday(iso){ return new Date(iso + 'T00:00:00').getDay(); }

function truckIsTruckDay(iso){ return truckDaysList().includes(truckWeekday(iso)); }

function truckFor(iso){ return Array.isArray(truckShifts[iso]) ? truckShifts[iso] : []; }

// The next open day (the store's closed Sundays skipped).
function truckNextOpenDay(iso){
  const d = new Date(iso + 'T00:00:00');
  do { d.setDate(d.getDate() + 1); } while(d.getDay() === 0);
  return toLocalISODate(d);
}

// Imported shifts replace the day's scheduled ones; ones a leader added by
// hand stay (and win over a scheduled one for the same person).
function truckMergeImported(existing, imported){
  const manual = (Array.isArray(existing) ? existing : []).filter(t => t.source === 'manual');
  const names = new Set(manual.map(t => t.name.toLowerCase()));
  return [...manual, ...(imported || []).filter(t => !names.has(t.name.toLowerCase())).map(t => ({name: t.name, start: t.start, end: t.end, source: 'schedule'}))];
}

function truckName(name){
  return typeof suDisplayName === 'function' ? suDisplayName(name) : name;
}

function truckPeopleHtml(iso, people){
  return people.map((t, i) => `<span class="su-truck-who"><b>${escapeHtml(truckName(t.name))}</b> ${escapeHtml(`${t.start}–${t.end}`)}<button type="button" class="su-truck-x" data-truck-remove="${escapeHtml(iso)}" data-truck-i="${i}" aria-label="${escapeHtml(`Remove ${t.name} from truck`)}">×</button></span>`).join('');
}

const TRUCK_ICON = '<svg class="su-truck-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h11v10H2z"/><path d="M13 9h4.5L21 12.5V16h-8"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>';

// The line at the top of Set Ups for `date`.
function truckStripHtml(date){
  if(!date) return '';
  const people = truckFor(date), due = truckIsTruckDay(date);
  const next = date === today ? truckNextOpenDay(date) : null;
  const nextPeople = next ? truckFor(next) : [];
  const nextDue = next ? truckIsTruckDay(next) : false;
  if(!people.length && !due && !nextPeople.length && !nextDue) return '';
  const missing = due && !people.length;
  const assignBtn = (iso, label) => `<button type="button" class="su-truck-btn" data-truck-assign="${escapeHtml(iso)}">${escapeHtml(label)}${esHtml(label)}</button>`;
  const nextLabel = next ? new Date(next + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'short'}) : '';
  return `<div class="su-truck ${missing ? 'is-missing' : ''}" role="status">
      <div class="su-truck-row">
        ${TRUCK_ICON}
        <span class="su-truck-k">Truck${esHtml('Truck')}</span>
        ${people.length ? truckPeopleHtml(date, people) : missing ? `<span class="su-truck-miss">No one on truck yet${esHtml('No one on truck yet')}</span>` : `<span class="su-truck-none">No truck today${esHtml('No truck today')}</span>`}
        ${assignBtn(date, people.length ? 'Add' : 'Assign')}
      </div>
      ${next && (nextPeople.length || nextDue) ? `<div class="su-truck-row su-truck-next ${nextDue && !nextPeople.length ? 'is-missing' : ''}">
        <span class="su-truck-k">Tomorrow${esHtml('Tomorrow')} · ${escapeHtml(nextLabel)}</span>
        ${nextPeople.length ? truckPeopleHtml(next, nextPeople) : `<span class="su-truck-miss">No one on truck yet${esHtml('No one on truck yet')}</span>`}
        ${nextPeople.length ? '' : assignBtn(next, 'Assign')}
      </div>` : ''}
    </div>`;
}

function truckRerender(){
  if(typeof renderAllDayparts === 'function') renderAllDayparts();
}

// ----- The assign form -----

function truckOpenModal(iso){
  truckModalDate = iso;
  const label = new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'});
  document.getElementById('truckContext').textContent = `Truck · ${label}`;
  // Everyone on that day's roster (both sides), morning people first.
  const day = [...(fohRoster[iso] || []), ...(bohRoster[iso] || [])];
  const seen = new Set();
  const names = day.sort((a, b) => (parseShiftTimeToMinutes(a.start) ?? 9999) - (parseShiftTimeToMinutes(b.start) ?? 9999))
    .filter(p => { const k = p.name.toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; });
  document.getElementById('truckNames').innerHTML = names.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(`${p.start}–${p.end}`)}</option>`).join('');
  document.getElementById('truckName').value = '';
  document.getElementById('truckStart').value = TRUCK_DEFAULT_TIME[0];
  document.getElementById('truckEnd').value = TRUCK_DEFAULT_TIME[1];
  if(typeof shiftFormHint === 'function') shiftFormHint('truck');
  document.getElementById('truckModal').classList.add('active');
  document.getElementById('truckName').focus();
}

function truckCloseModal(){
  document.getElementById('truckModal').classList.remove('active');
  truckModalDate = null;
}

async function truckSaveModal(){
  const iso = truckModalDate;
  if(!iso) return;
  const name = document.getElementById('truckName').value.trim();
  const times = shiftTimesRead(document.getElementById('truckStart').value, document.getElementById('truckEnd').value);
  if(!name){ showToast('Who is doing truck?'); return; }
  if(times.error || times.start === null || times.end === null){ showToast(times.error || 'Fill in the start and end time'); return; }
  const initials = getInitials();
  if(!initials){
    showToast('Set your initials first (top right)');
    beginEditInitials();
    return;
  }
  const list = truckFor(iso).filter(t => t.name.toLowerCase() !== name.toLowerCase());
  list.push({name, start: times.start, end: times.end, source: 'manual', addedBy: initials, addedAt: Date.now()});
  truckShifts[iso] = list;
  truckCloseModal();
  truckRerender();
  showToast(`${truckName(name)} is on truck ${iso === today ? 'today' : new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'long'})}`);
  await saveState();
}

async function truckRemove(iso, i){
  const t = truckFor(iso)[i];
  if(!t || !confirm(`Take ${t.name} off truck for ${new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'long', month: 'short', day: 'numeric'})}?`)) return;
  truckShifts[iso] = truckFor(iso).filter((x, j) => j !== i);
  if(!truckShifts[iso].length) delete truckShifts[iso];
  truckRerender();
  await saveState();
}

document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t) return;
  const assign = t.closest('[data-truck-assign]');
  if(assign){ truckOpenModal(assign.dataset.truckAssign); return; }
  const rm = t.closest('[data-truck-remove]');
  if(rm){ truckRemove(rm.dataset.truckRemove, +rm.dataset.truckI); return; }
  if(t.id === 'truckModal' || t.closest('#btnTruckCancel')){ truckCloseModal(); return; }
  if(t.closest('#btnTruckSave')) truckSaveModal();
});

// ----- Manage: the days the truck comes -----

function renderTruckDaysManage(){
  const root = document.getElementById('truckDaysRoot');
  if(!root) return;
  const days = truckDaysList();
  root.innerHTML = `<div class="truck-days">${TRUCK_WEEKDAYS.map((d, i) => i === 0 ? '' : `<label><input type="checkbox" data-truck-day="${i}" ${days.includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div>`;
}

document.addEventListener('change', async e => {
  const box = e.target.closest && e.target.closest('[data-truck-day]');
  if(!box) return;
  truckDays = [...document.querySelectorAll('[data-truck-day]')].filter(c => c.checked).map(c => +c.dataset.truckDay);
  truckRerender();
  showToast('Truck days saved');
  await saveState();
});
