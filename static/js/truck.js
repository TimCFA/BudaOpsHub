// ===== TRUCK =====
// Who's doing truck (the delivery) that morning, so leaders can see it at a
// glance (Tim, Oct 2026: a morning went by with nobody on it). The scheduler
// assigns truck in HotSchedules as an off-floor shift (Schedule "Other", Job
// "Truck", usually 5:30–8:30a); the roster import keeps those here instead
// of dropping them. Leaders don't assign it in the hub: the schedule is the
// only source (Tim).
//
// Set Ups shows it at the top of the day: who's on truck and when, or, on a
// truck day with no truck shift, a red "No truck shift on the schedule"; on
// today's page the same for tomorrow, so it's caught the night before.
//
// truckShifts {date: [{name, start, end}]} lives in the rosters section,
// replaced by each import; truckDays, the weekdays the truck comes, is a
// manager setting.

// The weekdays with a truck shift on the Sept 20–26 2026 schedule: Monday,
// Tuesday, Thursday, Friday, Saturday. Managers change it in Manage.
const TRUCK_DEFAULT_DAYS = [1, 2, 4, 5, 6];
const TRUCK_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

function truckName(name){
  return typeof suDisplayName === 'function' ? suDisplayName(name) : name;
}

function truckPeopleHtml(people){
  return people.map(t => `<span class="su-truck-who"><b>${escapeHtml(truckName(t.name))}</b> ${escapeHtml(`${t.start}–${t.end}`)}</span>`).join('');
}

const TRUCK_ICON = '<svg class="su-truck-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h11v10H2z"/><path d="M13 9h4.5L21 12.5V16h-8"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>';

// The line at the top of Set Ups for `date`.
function truckStripHtml(date){
  if(!date) return '';
  const people = truckFor(date), due = truckIsTruckDay(date);
  const next = date === today ? truckNextOpenDay(date) : null;
  const nextPeople = next ? truckFor(next) : [];
  const nextDue = next ? truckIsTruckDay(next) : false;
  const showNext = next && (nextPeople.length || nextDue);
  if(!people.length && !due && !showNext) return '';
  const missing = '<span class="su-truck-miss">No truck shift on the schedule' + esHtml('No truck shift on the schedule') + '</span>';
  const nextLabel = next ? new Date(next + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'short'}) : '';
  return `<div class="su-truck ${due && !people.length ? 'is-missing' : ''}" role="status">
      ${people.length || due ? `<div class="su-truck-row">
        ${TRUCK_ICON}
        <span class="su-truck-k">Truck${esHtml('Truck')}</span>
        ${people.length ? truckPeopleHtml(people) : missing}
      </div>` : ''}
      ${showNext ? `<div class="su-truck-row su-truck-next ${nextDue && !nextPeople.length ? 'is-missing' : ''}">
        ${people.length || due ? '' : TRUCK_ICON}
        <span class="su-truck-k">Truck${esHtml('Truck')} · Tomorrow${esHtml('Tomorrow')} · ${escapeHtml(nextLabel)}</span>
        ${nextPeople.length ? truckPeopleHtml(nextPeople) : missing}
      </div>` : ''}
    </div>`;
}

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
  if(typeof renderAllDayparts === 'function') renderAllDayparts();
  showToast('Truck days saved');
  await saveState();
});
