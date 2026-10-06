// ===== STORE EVENTS CALENDAR =====
// The store's marketing / events calendar (Tim, Oct 2026): promos, samples,
// community outreach, family nights and heads-ups like "No School". Its own
// Calendar tab, drawn like the store's printed calendar, to look at only;
// it's added to and changed in Manage → Events Calendar, behind the PIN
// (Tim). Set Ups shows each event on the daypart cards it overlaps. Managers
// only for now: the tab and the chips show once the PIN is entered. Saved
// as storeEvents in the manager section (manager-only on the server, like
// the scoreboards).
//
// An event: {id, title, detail, kind, date, end, days, from, to, notes}
//   date / end  'YYYY-MM-DD', end inclusive (a one-day event has no end)
//   days        weekdays it runs on within date..end (0 = Sunday), or none
//               for every day
//   from / to   'HH:MM' (24-hour) when it runs; none for all day
//   kind        the calendar's color key (EVENT_KINDS); 'note' is a
//               heads-up, and 'goal' / 'checklist' belong to the month (the
//               goals box and the Pre-Checklist), never a day
//   notes       bullet lines

let storeEvents = null;   // null until a manager first edits: EVENTS_SEED shows

const EVENT_KINDS = {
  app: {label: 'App', color: '#C8102E', name: 'Red'},
  food: {label: 'Food Distribution', color: '#2A9FB8', name: 'Blue'},
  cow: {label: 'Cow in Community', color: '#8E4A8F', name: 'Purple'},
  instore: {label: 'In-Store Event', color: '#D9531E', name: 'Orange'},
  drivethru: {label: 'Drive Thru Event', color: '#2E8B57', name: 'Green'},
  social: {label: 'Social', color: '#1C1B19', name: 'Black'},
  note: {label: 'Heads-up', color: '#4A4640'},
  goal: {label: 'Monthly goals', color: '#004F71'},
  checklist: {label: 'Pre-Checklist (the month)', color: '#7C766C'},
};
const EVENT_MONTH_KINDS = ['goal', 'checklist'];

// October 2026, typed in from the store's calendar (Tim, Oct 6 2026): its
// wording kept as written. Shown until a manager edits the calendar, when
// it's copied into storeEvents.
const EVENTS_FREE_BREAKFAST_NOTES = ['DT Only (all Drive Thru)', 'Mobile Thru orders – extra treat sent to app within 48 hrs', 'Treat added to bag (1 per transaction)', 'Every Tuesday in October', 'Both stores'];
const EVENTS_DT_PUSH_NOTES = ['Every Friday from 12-1 PM only', 'Stores alternate dates!', 'Mobile Thru Bonus Points 12-1 PM', 'CFA Sandwich added to bag for ALL Drive Thru orders (1 per transaction)'];
const EVENTS_SEED = [
  {id: 'oct26-goals', kind: 'goal', title: 'Monthly Goals', detail: 'Catering · CFA One App Usage · Drive Thru', date: '2026-10-01', end: '2026-10-31'},
  {id: 'oct26-checklist', kind: 'checklist', title: 'Pre-Checklist', date: '2026-10-01', end: '2026-10-31',
    notes: ['Internal Calendar', 'Guest Facing Calendar', 'Spotlight Emails Scheduled', 'Bag stuffers for BIG 3 in restaurant', 'Banners in restaurant and ready for rotation']},
  {id: 'sep26-outreach-30', kind: 'food', title: 'Community Outreach', date: '2026-09-30'},
  {id: 'oct26-sample', kind: 'food', title: 'Sample: Chicken & Waffles, S’mores Milkshake, Coffee Platform', date: '2026-10-05', end: '2026-10-31', days: [1, 2, 3, 4, 5, 6]},
  ...['2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28'].map(d => ({id: `oct26-outreach-${d.slice(8)}`, kind: 'food', title: 'Community Outreach', date: d})),
  ...[['2026-10-06', 'Chicken Biscuit'], ['2026-10-13', '4ct Minis'], ['2026-10-20', 'Sausage Biscuit'], ['2026-10-27', 'Chicken Biscuit']].map(([d, item]) => ({
    id: `oct26-freebkfst-${d.slice(8)}`, kind: 'instore', title: 'Free Breakfast Tuesday', detail: item, date: d, from: '06:00', to: '10:30', notes: EVENTS_FREE_BREAKFAST_NOTES})),
  ...['2026-10-09', '2026-10-16', '2026-10-23'].map(d => ({
    id: `oct26-dtpush-${d.slice(8)}`, kind: 'drivethru', title: 'Pack the Drive Thru', detail: 'drive thru push -WB (200) · drive thru +bonus points for mobile 12-1', date: d, from: '12:00', to: '13:00', notes: EVENTS_DT_PUSH_NOTES})),
  {id: 'oct26-dtpush-30', kind: 'drivethru', title: 'Pack the Drive Thru', detail: 'drive thru push Buda (300) · drive thru +bonus points for mobile 12-1', date: '2026-10-30', from: '12:00', to: '13:00', notes: EVENTS_DT_PUSH_NOTES},
  ...['2026-10-09', '2026-10-12', '2026-10-30'].map(d => ({id: `oct26-noschool-${d.slice(8)}`, kind: 'note', title: 'No School', date: d})),
  {id: 'oct26-familynight', kind: 'instore', title: 'Family Night: Pumpkins & Play', date: '2026-10-22', from: '17:00', to: '19:00',
    notes: ['Paint pumpkins, coloring sheets, photo ops, pumpkin ring toss, samples', 'Admin Logistics: Bag stuffers', 'Ops Team: OE']},
  {id: 'oct26-halloweenpromo', kind: 'instore', title: 'Halloween Week Promo', detail: '30 COUNT = FREE 6 COUNT COOKIE; BOGO Trays (Small nugget tray = Free Small Cookie Tray; Large nugget tray = Large Cookie Tray)', date: '2026-10-28', end: '2026-10-31',
    notes: ['Catering Promo Halloween Week', 'Wed-Sat, all day', '30 ct gets a 6ct cookie', 'BOGO Tray - buy a nugget tray, get a cookie tray', 'Small nug tray = small cookie tray', 'Large nug tray = large cookie tray', 'Must mention offer']},
  {id: 'oct26-halloween', kind: 'note', title: 'Halloween', detail: 'Regular Store Hours', date: '2026-10-31'},
];

function eventsList(){
  return Array.isArray(storeEvents) ? storeEvents : EVENTS_SEED;
}

const evMinutes = t => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/); return m ? +m[1] * 60 + +m[2] : null; };
const evWeekday = iso => new Date(iso + 'T00:00:00').getDay();

// Does an event run on this date?
function eventOnDate(ev, iso){
  if(!ev || !ev.date) return false;
  const end = ev.end || ev.date;
  if(iso < ev.date || iso > end) return false;
  return !Array.isArray(ev.days) || !ev.days.length || ev.days.includes(evWeekday(iso));
}

function eventsOn(iso, opts){
  // The month's goals and Pre-Checklist only when asked, never as a day's event.
  const all = eventsList().filter(ev => eventOnDate(ev, iso) && ((opts && opts.goals) || !EVENT_MONTH_KINDS.includes(ev.kind)));
  return all.sort((a, b) => (evMinutes(a.from) ?? -1) - (evMinutes(b.from) ?? -1) || String(a.title).localeCompare(String(b.title)));
}

// Timed events overlapping [startMin, endMin) on a date (a daypart's window).
function eventsInWindow(iso, startMin, endMin){
  return eventsOn(iso).filter(ev => {
    const s = evMinutes(ev.from), e = evMinutes(ev.to);
    return s !== null && e !== null && s < endMin && e > startMin;
  });
}

// All-day events on a date (no time): the strip above the Set Ups cards.
function eventsAllDay(iso){
  return eventsOn(iso).filter(ev => evMinutes(ev.from) === null);
}

function evClock(t){
  const m = evMinutes(t);
  if(m === null) return '';
  const h = Math.floor(m / 60), mm = m % 60;
  return `${(h + 11) % 12 + 1}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
}
function evTimeText(ev){ return ev.from ? `${evClock(ev.from)}–${evClock(ev.to)}` : ''; }

function evDot(ev){
  const k = EVENT_KINDS[ev.kind] || EVENT_KINDS.note;
  return `<span class="ev-dot" style="background:${k.color}" title="${escapeHtml(k.label)}"></span>`;
}

// A compact chip for a Set Ups card: the title, the time, the detail.
function eventChipHtml(ev){
  return `<span class="ev-chip ev-${escapeHtml(ev.kind || 'note')}">${evDot(ev)}<b>${escapeHtml(ev.title)}</b>${ev.from ? `<span class="ev-chip-time">${escapeHtml(evTimeText(ev))}</span>` : ''}${ev.detail ? `<span class="ev-chip-detail">${escapeHtml(ev.detail)}</span>` : ''}</span>`;
}

// ----- The Calendar tab -----
// Drawn like the store's printed calendar: the month in big coral type, the
// week grid (Sundays shaded, closed), each event in its key color, events
// that run several days as a bar across the week, the month's goals in the
// first Sunday, the Pre-Checklist and the events' notes beside the grid and
// the key under it. Tap a day for everything on it. Nothing is changed
// here: that's Manage → Events Calendar.

let calMonth = null;   // 'YYYY-MM' on screen
let calDay = null;     // the day picked: its events under the grid
let evEditId = null;   // Manage: the event open in the form ('new' for a new one)
let evManageMonth = null; // Manage: 'YYYY-MM' listed

const EV_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Managers only for now (Tim, Oct 2026): the tab and the Set Ups chips show
// with the PIN session (launch-mode.js).
function evCalendarShown(){
  return typeof launchManager === 'undefined' || !!launchManager;
}

function evAddDays(iso, n){
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toLocalISODate(d);
}
function evMonthOf(iso){ return String(iso || '').slice(0, 7); }
function evMonthLabel(ym){ return new Date(ym + '-01T00:00:00').toLocaleDateString('en-US', {month: 'long', year: 'numeric'}); }
function evMonthEnd(ym){
  const d = new Date(ym + '-01T00:00:00');
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return toLocalISODate(d);
}

function evEnsureOwnList(){
  if(!Array.isArray(storeEvents)) storeEvents = JSON.parse(JSON.stringify(EVENTS_SEED));
}

// The month's own items of a kind (goals, Pre-Checklist): any that touch it.
function eventsForMonth(ym, kind){
  const first = ym + '-01', last = evMonthEnd(ym);
  return eventsList().filter(ev => ev.kind === kind && ev.date <= last && (ev.end || ev.date) >= first);
}

// The weeks on the page: the Sunday on or before the 1st through the
// Saturday on or after the last day.
function evMonthWeeks(ym){
  let iso = evAddDays(ym + '-01', -evWeekday(ym + '-01'));
  const last = evMonthEnd(ym), weeks = [];
  while(iso <= last){
    const week = [];
    for(let i = 0; i < 7; i++){ week.push(iso); iso = evAddDays(iso, 1); }
    weeks.push(week);
  }
  return weeks;
}

// One week laid out. An event running several days in a row becomes a bar
// across them (the shorter ones on top, like the printed calendar); the rest
// sit in their day.
function evWeekLayout(week){
  const multi = new Map();
  week.forEach((iso, c) => eventsOn(iso).forEach(ev => {
    if(!ev.end || ev.end === ev.date) return;
    if(!multi.has(ev.id)) multi.set(ev.id, {ev, cols: []});
    multi.get(ev.id).cols.push(c);
  }));
  const bars = [...multi.values()]
    .filter(m => m.cols.length > 1 && m.cols[m.cols.length - 1] - m.cols[0] === m.cols.length - 1)
    .sort((x, y) => x.cols.length - y.cols.length || x.ev.date.localeCompare(y.ev.date))
    .map(m => ({ev: m.ev, a: m.cols[0], b: m.cols[m.cols.length - 1]}));
  const lanes = [];
  bars.forEach(bar => {
    let lane = lanes.findIndex(l => l.every(o => o.b < bar.a || o.a > bar.b));
    if(lane < 0){ lanes.push([]); lane = lanes.length - 1; }
    lanes[lane].push(bar);
    bar.lane = lane;
  });
  const inBars = new Set(bars.map(b => b.ev.id));
  return {bars, lanes: lanes.length, days: week.map(iso => eventsOn(iso).filter(ev => !inBars.has(ev.id)))};
}

// The events with notes this month, once each (the four Free Breakfast
// Tuesdays share one list): the Notes box.
function evNotesForMonth(ym){
  const first = ym + '-01', last = evMonthEnd(ym), seen = new Set();
  return eventsList()
    .filter(ev => !EVENT_MONTH_KINDS.includes(ev.kind) && Array.isArray(ev.notes) && ev.notes.length && ev.date <= last && (ev.end || ev.date) >= first)
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter(ev => { const k = `${ev.kind}|${ev.title}|${ev.notes.join('|')}`; if(seen.has(k)) return false; seen.add(k); return true; });
}

function evWhenText(ev){
  const d = x => new Date(x + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
  const days = Array.isArray(ev.days) && ev.days.length && ev.days.length < 7 ? ` (${ev.days.map(n => EV_WEEKDAYS[n]).join(', ')})` : '';
  return `${d(ev.date)}${ev.end && ev.end !== ev.date ? ` – ${d(ev.end)}` : ''}${days} · ${ev.from ? evTimeText(ev) : 'all day'}`;
}

function evKind(ev){ return EVENT_KINDS[ev.kind] || EVENT_KINDS.note; }

// An event in its day, as the printed calendar writes it: the title, the
// time, then the detail a line at a time.
function evCellHtml(ev){
  const lines = [ev.from ? evTimeText(ev).replace('–', ' - ') : '', ...String(ev.detail || '').split(' · ')].map(s => s.trim()).filter(Boolean);
  return `<div class="cal-ev ${ev.kind === 'note' ? 'is-note' : ''}" style="color:${evKind(ev).color}">${escapeHtml(ev.title)}${lines.map(l => `<span>${escapeHtml(l)}</span>`).join('')}</div>`;
}

function evWeekHtml(week, w, goals){
  const L = evWeekLayout(week);
  const rows = `minmax(var(--cal-day-h),auto)${L.lanes ? ` repeat(${L.lanes},auto)` : ''} 4px`;
  const goalLines = goals.flatMap(g => String(g.detail || '').split(' · ')).map(s => s.trim()).filter(Boolean);
  const cells = week.map((iso, c) => {
    const titles = eventsOn(iso).map(ev => ev.title);
    const label = new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'}) + (titles.length ? ': ' + titles.join(', ') : '');
    return `<button type="button" class="cal-cell ${c === 0 ? 'is-sun' : ''} ${iso === calDay ? 'is-sel' : ''}" style="grid-column:${c + 1};grid-row:1 / -1" data-cal-day="${iso}" aria-label="${escapeHtml(label)}" aria-pressed="${iso === calDay}"></button>`;
  }).join('');
  const days = week.map((iso, c) => `<div class="cal-day ${evMonthOf(iso) !== calMonth ? 'is-out' : ''}" style="grid-column:${c + 1};grid-row:1">
      <span class="cal-num ${c === 0 || c === 6 ? 'is-wkend' : ''} ${iso === today ? 'is-today' : ''}">${+iso.slice(8)}</span>
      ${w === 0 && c === 0 && goals.length ? `<div class="cal-goals"><b>${escapeHtml(goals[0].title)}</b>${goalLines.map(l => `${escapeHtml(l)}<br>`).join('')}</div>` : ''}
      ${L.days[c].map(evCellHtml).join('')}
    </div>`).join('');
  const bars = L.bars.map(bar => `<div class="cal-bar" style="grid-column:${bar.a + 1} / ${bar.b + 2};grid-row:${bar.lane + 2};background:${evKind(bar.ev).color}">${escapeHtml(bar.ev.title + (bar.ev.detail ? ': ' + bar.ev.detail : ''))}</div>`).join('');
  return `<div class="cal-week" style="grid-template-rows:${rows}">${cells}${days}${bars}</div>`;
}

function evDayPanelHtml(){
  const label = new Date(calDay + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'});
  const list = eventsOn(calDay);
  return `<section class="cal-dayp" id="calDayPanel">
      <div class="cal-dayp-head"><h3>${escapeHtml(label)}</h3></div>
      ${list.length ? `<ul class="cal-dayp-list">${list.map(ev => `
        <li class="cal-dayp-item">
          ${evDot(ev)}
          <div class="cal-dayp-main">
            <b>${escapeHtml(ev.title)}</b>
            ${ev.detail ? `<small>${escapeHtml(ev.detail)}</small>` : ''}
            <small>${escapeHtml(evWhenText(ev))}</small>
            ${Array.isArray(ev.notes) && ev.notes.length ? `<ul>${ev.notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : ''}
          </div>
        </li>`).join('')}</ul>` : `<p class="ev-empty">${evWeekday(calDay) === 0 ? 'Closed Sunday. ' : ''}Nothing on the calendar this day.</p>`}
      <p class="cal-dayp-month">To add or change events: Manage → Events Calendar.</p>
    </section>`;
}

function renderCalendarView(){
  const root = document.getElementById('calendarRoot');
  if(!root) return;
  if(!evCalendarShown()){ root.innerHTML = ''; return; }
  if(!calMonth) calMonth = evMonthOf(today);
  if(!calDay || evMonthOf(calDay) !== calMonth) calDay = evMonthOf(today) === calMonth ? today : calMonth + '-01';
  const goals = eventsForMonth(calMonth, 'goal');
  const checklist = eventsForMonth(calMonth, 'checklist');
  const notes = evNotesForMonth(calMonth);
  const goalText = goals.flatMap(g => String(g.detail || '').split(' · ')).map(s => s.trim()).filter(Boolean).join(' · ');
  root.innerHTML = `
    <div class="cal-head">
      <h2 class="cal-title">${escapeHtml(evMonthLabel(calMonth))}</h2>
      <div class="cal-nav">
        <button type="button" class="btn btn-ghost cal-step" data-cal-month="-1" aria-label="Previous month">‹</button>
        ${calMonth !== evMonthOf(today) ? '<button type="button" class="btn btn-ghost" data-cal-today="1">This month</button>' : ''}
        <button type="button" class="btn btn-ghost cal-step" data-cal-month="1" aria-label="Next month">›</button>
      </div>
    </div>
    <div class="cal-body">
      <div class="cal-main">
        ${goals.length ? `<p class="cal-goals-line"><b>${escapeHtml(goals[0].title)}</b>${escapeHtml(goalText)}</p>` : ''}
        <div class="cal-wdays" aria-hidden="true">${EV_WEEKDAYS.map((d, i) => `<span class="${i === 0 || i === 6 ? 'is-wkend' : ''}">${d}</span>`).join('')}</div>
        <div class="cal-grid">${evMonthWeeks(calMonth).map((week, w) => evWeekHtml(week, w, goals)).join('')}</div>
        <div class="cal-key"><b>Key:</b>${Object.values(EVENT_KINDS).filter(k => k.name).map(k => `<span style="color:${k.color}">${escapeHtml(k.name)} = ${escapeHtml(k.label)}</span>`).join('')}</div>
        ${evDayPanelHtml()}
      </div>
      <aside class="cal-side">
        ${checklist.length ? `<h3 class="cal-side-h">${escapeHtml(checklist[0].title)}</h3>
          <div class="cal-box"><ol>${checklist.flatMap(c => c.notes || []).map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ol></div>` : ''}
        ${notes.length ? `<h3 class="cal-side-h">Notes</h3>
          <div class="cal-box">${notes.map(ev => `<div class="cal-note" style="color:${evKind(ev).color}"><b>${escapeHtml(ev.title)}</b><ul>${ev.notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul></div>`).join('')}</div>` : ''}
      </aside>
    </div>`;
}

// New data from another device: redraw the Calendar (Manage redraws itself
// in refreshManage, unless the form is open).
function evRerender(){
  const view = document.getElementById('calendarView');
  if(view && view.classList.contains('active')) renderCalendarView();
}

// On a phone the day's panel sits under the grid: bring it up.
function evShowDayPanel(){
  const p = document.getElementById('calDayPanel');
  if(p && p.getBoundingClientRect().top > window.innerHeight - 120) p.scrollIntoView({behavior: 'smooth', block: 'start'});
}

// ----- Manage → Events Calendar: the only place events change -----

function renderEventsManage(){
  const root = document.getElementById('eventsManageRoot');
  if(!root) return;
  if(!evManageMonth) evManageMonth = evMonthOf(today);
  const first = evManageMonth + '-01', last = evMonthEnd(evManageMonth);
  const list = eventsList().filter(ev => ev.date <= last && (ev.end || ev.date) >= first)
    .sort((a, b) => EVENT_MONTH_KINDS.includes(b.kind) - EVENT_MONTH_KINDS.includes(a.kind) || a.date.localeCompare(b.date) || (evMinutes(a.from) ?? -1) - (evMinutes(b.from) ?? -1));
  const editing = evEditId === 'new' ? {id: 'new', kind: 'instore', date: evMonthOf(today) === evManageMonth ? today : first} : evEditId ? eventsList().find(ev => ev.id === evEditId) : null;
  root.innerHTML = `
    <div class="ev-m-bar">
      <button type="button" class="btn btn-ghost ev-m-step" data-ev-month="-1" aria-label="Previous month">‹</button>
      <b>${escapeHtml(evMonthLabel(evManageMonth))}</b>
      <button type="button" class="btn btn-ghost ev-m-step" data-ev-month="1" aria-label="Next month">›</button>
      <button type="button" class="btn btn-primary ev-m-add" data-ev-edit="new">+ Add event</button>
    </div>
    ${editing ? evFormHtml(editing) : ''}
    ${list.length ? `<ul class="ev-m-list">${list.map(ev => `
      <li class="ev-m-row">
        ${evDot(ev)}
        <div class="ev-m-main"><b>${escapeHtml(ev.title)}</b>${ev.detail ? `<span>${escapeHtml(ev.detail)}</span>` : ''}<small>${EVENT_MONTH_KINDS.includes(ev.kind) ? escapeHtml(evKind(ev).label) + (ev.notes ? ` · ${ev.notes.length} items` : '') : escapeHtml(evWhenText(ev))}</small></div>
        <button type="button" class="btn btn-ghost ev-m-btn" data-ev-edit="${escapeHtml(ev.id)}">Edit</button>
      </li>`).join('')}</ul>` : '<p class="ev-empty">No events this month yet.</p>'}`;
}

function evFormHtml(ev){
  const days = Array.isArray(ev.days) ? ev.days : [];
  const opt = (v, label, cur) => `<option value="${escapeHtml(v)}" ${v === cur ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  return `<form class="ev-form" id="evForm" data-ev-id="${escapeHtml(ev.id)}">
      <div class="field"><label for="evTitle">Event</label><input type="text" id="evTitle" maxlength="120" value="${escapeHtml(ev.title || '')}" placeholder="e.g. Free Breakfast Tuesday" required></div>
      <div class="field"><label for="evDetail">Detail (optional)</label><input type="text" id="evDetail" maxlength="240" value="${escapeHtml(ev.detail || '')}" placeholder="e.g. Chicken Biscuit"></div>
      <div class="ev-form-row">
        <div class="field"><label for="evKind">Type</label><select id="evKind">${Object.entries(EVENT_KINDS).map(([k, v]) => opt(k, v.label, ev.kind || 'instore')).join('')}</select></div>
        <div class="field"><label for="evDate">Date</label><input type="date" id="evDate" value="${escapeHtml(ev.date || today)}" required></div>
        <div class="field"><label for="evEnd">Through (optional)</label><input type="date" id="evEnd" value="${escapeHtml(ev.end || '')}"></div>
      </div>
      <div class="ev-form-row">
        <div class="field"><label for="evFrom">From (blank = all day)</label><input type="time" id="evFrom" value="${escapeHtml(ev.from || '')}"></div>
        <div class="field"><label for="evTo">To</label><input type="time" id="evTo" value="${escapeHtml(ev.to || '')}"></div>
      </div>
      <fieldset class="ev-days"><legend>Only on (for a date range; none = every day)</legend>${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => `<label><input type="checkbox" data-ev-day="${i}" ${days.includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</fieldset>
      <div class="field"><label for="evNotes">Notes (one per line)</label><textarea id="evNotes" rows="4" maxlength="2000">${escapeHtml((ev.notes || []).join('\n'))}</textarea></div>
      <div class="ev-form-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn btn-ghost" data-ev-cancel="1">Cancel</button>
        ${ev.id !== 'new' ? '<button type="button" class="btn btn-ghost ev-delete" data-ev-delete="1">Delete</button>' : ''}
      </div>
    </form>`;
}

function evReadForm(form){
  const val = id => (document.getElementById(id).value || '').trim();
  const title = val('evTitle'), date = val('evDate');
  if(!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return {error: 'An event needs a name and a date.'};
  let end = val('evEnd');
  if(end && end < date) return {error: '"Through" is before the start date.'};
  const from = val('evFrom'), to = val('evTo');
  if((from && !to) || (!from && to)) return {error: 'Give both a start and an end time, or neither for all day.'};
  if(from && to && evMinutes(to) <= evMinutes(from)) return {error: 'The end time is before the start time.'};
  const days = [...form.querySelectorAll('[data-ev-day]')].filter(c => c.checked).map(c => +c.dataset.evDay);
  const ev = {title, kind: val('evKind') || 'instore', date};
  const detail = val('evDetail');
  if(detail) ev.detail = detail;
  if(end && end !== date) ev.end = end;
  if(ev.end && days.length) ev.days = days;
  if(from) { ev.from = from; ev.to = to; }
  const notes = val('evNotes').split('\n').map(s => s.trim()).filter(Boolean);
  if(notes.length) ev.notes = notes;
  return {ev};
}

function evAfterChange(msg, date){
  evEditId = null;
  if(date){ evManageMonth = evMonthOf(date); calMonth = evMonthOf(date); calDay = date; }
  renderEventsManage();
  renderCalendarView();
  if(typeof renderAllDayparts === 'function') renderAllDayparts();
  showToast(msg);
  saveState();
}

// The Calendar tab: look only.
document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t || !t.closest('#calendarRoot')) return;
  const step = t.closest('[data-cal-month]');
  if(step){
    const d = new Date(calMonth + '-01T00:00:00');
    d.setMonth(d.getMonth() + +step.dataset.calMonth);
    calMonth = toLocalISODate(d).slice(0, 7);
    calDay = null;
    renderCalendarView();
    return;
  }
  if(t.closest('[data-cal-today]')){ calMonth = evMonthOf(today); calDay = today; renderCalendarView(); return; }
  const day = t.closest('[data-cal-day]');
  if(day){
    calDay = day.dataset.calDay;
    calMonth = evMonthOf(calDay);
    renderCalendarView();
    evShowDayPanel();
  }
});

// Manage → Events Calendar.
document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t || !t.closest('#eventsManageRoot')) return;
  const step = t.closest('[data-ev-month]');
  if(step){
    const d = new Date(evManageMonth + '-01T00:00:00');
    d.setMonth(d.getMonth() + +step.dataset.evMonth);
    evManageMonth = toLocalISODate(d).slice(0, 7);
    evEditId = null;
    renderEventsManage();
    return;
  }
  const edit = t.closest('[data-ev-edit]');
  if(edit){ evEditId = edit.dataset.evEdit; renderEventsManage(); const f = document.getElementById('evTitle'); if(f) f.focus(); return; }
  if(t.closest('[data-ev-cancel]')){ evEditId = null; renderEventsManage(); return; }
  if(t.closest('[data-ev-delete]')){
    const ev = eventsList().find(x => x.id === evEditId);
    if(!ev || !confirm(`Delete "${ev.title}" (${ev.date}${ev.end ? ` to ${ev.end}` : ''}) from the calendar?`)) return;
    evEnsureOwnList();
    storeEvents = storeEvents.filter(x => x.id !== ev.id);
    evAfterChange('Event deleted');
  }
});

document.addEventListener('submit', e => {
  if(e.target.id !== 'evForm') return;
  e.preventDefault();
  const {ev, error} = evReadForm(e.target);
  if(error){ showToast(error); return; }
  evEnsureOwnList();
  const id = e.target.dataset.evId;
  if(id === 'new'){
    storeEvents.push({id: 'ev-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...ev});
    evAfterChange('Event added', ev.date);
  } else {
    storeEvents = storeEvents.map(x => x.id === id ? {id, ...ev} : x);
    evAfterChange('Event saved', ev.date);
  }
});
