// ===== TRUCK =====
// Who's doing truck (the delivery) that morning, so leaders can see it at a
// glance (Tim, Oct 2026: a morning went by with nobody on it). The scheduler
// assigns truck in HotSchedules as an off-floor shift (Schedule "Other", Job
// "Truck", usually 5:30–8:30a); the roster import keeps those here instead
// of dropping them. Leaders don't assign it in the hub: the schedule is the
// only source (Tim).
//
// It shows on the Set Ups roster, at the top as its own row, marked apart
// from the people working positions: who has the Truck shift and when, or a
// red "No truck shift on the schedule". The truck comes every open day
// (Monday–Saturday; Tim), so a day without a Truck shift is always flagged.
// Today's roster also says who has it tomorrow, so a gap is caught the night
// before.
//
// truckShifts {date: [{name, start, end}]} lives in the rosters section,
// replaced by each import.

// The truck comes every day the store is open (closed Sundays).
function truckIsTruckDay(iso){ return new Date(iso + 'T00:00:00').getDay() !== 0; }

function truckFor(iso){ return Array.isArray(truckShifts[iso]) ? truckShifts[iso] : []; }

// The next open day (the store's closed Sundays skipped).
function truckNextOpenDay(iso){
  const d = new Date(iso + 'T00:00:00');
  do { d.setDate(d.getDate() + 1); } while(d.getDay() === 0);
  return toLocalISODate(d);
}

const TRUCK_ICON = '<svg class="su-truck-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h11v10H2z"/><path d="M13 9h4.5L21 12.5V16h-8"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>';

function truckBadge(){
  return `<span class="su-truck-badge">${TRUCK_ICON}Truck${esHtml('Truck')}</span>`;
}

// The truck rows at the top of the roster for `date`: one per person with
// the Truck shift, or the red missing row; on today's roster, a line for
// tomorrow.
function truckRosterHtml(date){
  if(!date || !truckIsTruckDay(date)) return '';
  const people = truckFor(date);
  const rows = people.length
    ? people.map(t => `
      <div class="su-roster-row su-roster-truck">
        <div class="su-roster-main">
          <div class="su-roster-name">${escapeHtml(t.name)}${truckBadge()}</div>
          <div class="su-roster-time">${escapeHtml(`${t.start} - ${t.end}`)} · off the floor${esHtml('off the floor')}</div>
        </div>
      </div>`).join('')
    : `
      <div class="su-roster-row su-roster-truck is-missing" role="status">
        <div class="su-roster-main">
          <div class="su-roster-name">${truckBadge()}<span class="su-truck-miss">No truck shift on the schedule${esHtml('No truck shift on the schedule')}</span></div>
        </div>
      </div>`;
  let next = '';
  if(date === today){
    const n = truckNextOpenDay(date), np = truckFor(n);
    const day = new Date(n + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'short'});
    next = `<div class="su-truck-next ${np.length ? '' : 'is-missing'}">${TRUCK_ICON}<span>Tomorrow${esHtml('Tomorrow')} · ${escapeHtml(day)}: ${np.length
      ? escapeHtml(np.map(t => `${t.name} ${t.start} - ${t.end}`).join(', '))
      : `no truck shift on the schedule${esHtml('No truck shift on the schedule')}`}</span></div>`;
  }
  return `<div class="su-truck-group">${rows}${next}</div>`;
}
