// ===== STORE EVENTS CALENDAR =====
// The store's marketing / events calendar (Tim, Oct 2026): promos, samples,
// community outreach, family nights and heads-ups like "No School". Shown on
// Home (this week), on Set Ups (each event on the daypart cards it overlaps)
// and edited in Manage. Saved as storeEvents in the manager section
// (manager-only, like the scoreboards).
//
// An event: {id, title, detail, kind, date, end, days, from, to, notes}
//   date / end  'YYYY-MM-DD', end inclusive (a one-day event has no end)
//   days        weekdays it runs on within date..end (0 = Sunday), or none
//               for every day
//   from / to   'HH:MM' (24-hour) when it runs; none for all day
//   kind        the calendar's color key (EVENT_KINDS); 'goal' is the
//               month's focus and 'note' a heads-up
//   notes       bullet lines

let storeEvents = null;   // null until a manager first edits: EVENTS_SEED shows

const EVENT_KINDS = {
  app: {label: 'App', color: '#C8102E'},
  food: {label: 'Food Distribution', color: '#2A9FB8'},
  cow: {label: 'Cow in Community', color: '#7A3E8E'},
  instore: {label: 'In-Store Event', color: '#D9531E'},
  drivethru: {label: 'Drive Thru Event', color: '#2E8B57'},
  social: {label: 'Social', color: '#1C1B19'},
  note: {label: 'Heads-up', color: '#7C766C'},
  goal: {label: 'Monthly goal', color: '#004F71'},
};

// October 2026, typed in from the store's calendar (Tim, Oct 6 2026): its
// wording kept as written. Shown until a manager edits the calendar, when
// it's copied into storeEvents.
const EVENTS_FREE_BREAKFAST_NOTES = ['DT Only (all Drive Thru)', 'Mobile Thru orders – extra treat sent to app within 48 hrs', 'Treat added to bag (1 per transaction)', 'Every Tuesday in October', 'Both stores'];
const EVENTS_DT_PUSH_NOTES = ['Every Friday from 12-1 PM only', 'Stores alternate dates!', 'Mobile Thru Bonus Points 12-1 PM', 'CFA Sandwich added to bag for ALL Drive Thru orders (1 per transaction)'];
const EVENTS_SEED = [
  {id: 'oct26-goals', kind: 'goal', title: 'Monthly Goals', detail: 'Catering · CFA One App Usage · Drive Thru', date: '2026-10-01', end: '2026-10-31'},
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
  // The month's goals only when asked (Home's header line), never as an event.
  const all = eventsList().filter(ev => eventOnDate(ev, iso) && ((opts && opts.goals) || ev.kind !== 'goal'));
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

// ----- Home: this week -----

function evDayLabel(iso){
  if(iso === today) return 'Today';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
}

function evAddDays(iso, n){
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toLocalISODate(d);
}

let evOpenId = null;   // the event whose notes are showing on Home

function renderHomeEvents(){
  const root = document.getElementById('homeEvents');
  if(!root) return;
  const goals = eventsOn(today, {goals: true}).filter(ev => ev.kind === 'goal');
  // Something that runs for days (the month's samples, Halloween week) shows
  // once, under "Running now", not again under every day.
  const multi = ev => ev.end && ev.end !== ev.date;
  const running = new Map();
  const days = [];
  for(let i = 0; i < 7; i++){
    const iso = evAddDays(today, i);
    if(evWeekday(iso) === 0) continue;   // closed Sundays
    const all = eventsOn(iso);
    all.filter(multi).forEach(ev => { if(!running.has(ev.id)) running.set(ev.id, {ev, iso}); });
    const list = all.filter(ev => !multi(ev));
    if(list.length) days.push({iso, list});
  }
  const span = ev => {
    const d = x => new Date(x + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
    const wk = Array.isArray(ev.days) && ev.days.length && ev.days.length < 7 ? (ev.days.join() === '1,2,3,4,5,6' ? ' · Mon–Sat' : ` · ${ev.days.map(n => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][n]).join(', ')}`) : '';
    return `${ev.date <= today ? 'through' : `${d(ev.date)} –`} ${d(ev.end)}${wk}`;
  };
  const item = (ev, iso) => {
    const key = `${ev.id}|${iso}`, open = evOpenId === key, notes = Array.isArray(ev.notes) ? ev.notes : [];
    return `<li class="ev-item ${open ? 'is-open' : ''}">
        <button type="button" class="ev-item-head" ${notes.length ? `data-ev-open="${escapeHtml(key)}" aria-expanded="${open}"` : 'disabled'}>
          ${evDot(ev)}<span class="ev-item-title">${escapeHtml(ev.title)}${ev.detail ? ` <span class="ev-item-detail">${escapeHtml(ev.detail)}</span>` : ''}</span>
          ${ev.from ? `<span class="ev-item-time">${escapeHtml(evTimeText(ev))}</span>` : ''}
          ${notes.length ? '<span class="ev-item-chev" aria-hidden="true">▾</span>' : ''}
        </button>
        ${open ? `<ul class="ev-notes">${notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : ''}
      </li>`;
  };
  root.innerHTML = `
    ${goals.length ? `<div class="ev-goals">${goals.map(g => `<span class="ev-goals-k">${escapeHtml(g.title)}</span><span>${escapeHtml(g.detail || '')}</span>`).join('')}</div>` : ''}
    ${running.size ? `<section class="ev-day ev-running"><h3>Running now</h3><ul class="ev-list">${[...running.values()].map(({ev, iso}) => item({...ev, detail: [ev.detail, span(ev)].filter(Boolean).join(' · ')}, iso)).join('')}</ul></section>` : ''}
    ${days.length ? days.map(d => `
      <section class="ev-day ${d.iso === today ? 'is-today' : ''}">
        <h3>${escapeHtml(evDayLabel(d.iso))}</h3>
        <ul class="ev-list">${d.list.map(ev => item(ev, d.iso)).join('')}</ul>
      </section>`).join('') : running.size ? '' : '<p class="ev-empty">Nothing on the calendar this week.</p>'}
    <div class="ev-key">${Object.entries(EVENT_KINDS).filter(([k]) => k !== 'goal' && k !== 'note').map(([, k]) => `<span><i style="background:${k.color}"></i>${escapeHtml(k.label)}</span>`).join('')}</div>`;
}

document.addEventListener('click', e => {
  const open = e.target.closest && e.target.closest('#homeEvents [data-ev-open]');
  if(!open) return;
  evOpenId = evOpenId === open.dataset.evOpen ? null : open.dataset.evOpen;
  renderHomeEvents();
});

// ----- Home: guest focus, from the Guest Obsession scoreboard -----
// What the team should work on, from the scoreboard's latest numbers
// (gxData, filled by the CEM upload and Manage). Only once real numbers are
// in: the scoreboard's sample figures never show.
function renderHomeGuestFocus(){
  const root = document.getElementById('homeGuestFocus'), wrap = document.getElementById('homeGuestFocusWrap');
  if(!root || !wrap) return;
  const gx = typeof gxData !== 'undefined' ? gxData : null;
  if(!gx || !gx.lastUpdated){ root.innerHTML = ''; wrap.hidden = true; return; }
  wrap.hidden = false;
  const list = arr => (Array.isArray(arr) ? arr : []).filter(x => String(x || '').trim());
  const coaching = list(gx.teamMembers && gx.teamMembers.coachingFocus);
  const second = list(gx.secondMile && gx.secondMile.opportunities);
  const sat = gx.satisfaction && gx.satisfaction.highlySatisfied ? gx.satisfaction.highlySatisfied.value : '';
  const updated = new Date(gx.lastUpdated).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  root.innerHTML = `
    <div class="gf-top">
      ${sat ? `<div class="gf-stat"><b>${escapeHtml(sat)}</b><span>Highly Satisfied</span></div>` : ''}
      <span class="gf-updated">Guest Obsession scoreboard · ${escapeHtml(updated)}</span>
    </div>
    <div class="gf-grid">
      ${coaching.length ? `<div class="gf-col"><h3>Top coaching focus</h3><ul>${coaching.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>` : ''}
      ${second.length ? `<div class="gf-col"><h3>Second Mile opportunities</h3><ul>${second.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>` : ''}
    </div>`;
}

// ----- Manage: the editor -----

let evEditId = null;     // the event open in the form ('new' for a new one)
let evManageMonth = null; // 'YYYY-MM' shown in the list

function evMonthOf(iso){ return String(iso || '').slice(0, 7); }
function evMonthLabel(ym){ return new Date(ym + '-01T00:00:00').toLocaleDateString('en-US', {month: 'long', year: 'numeric'}); }

function evEnsureOwnList(){
  if(!Array.isArray(storeEvents)) storeEvents = JSON.parse(JSON.stringify(EVENTS_SEED));
}

function renderEventsManage(){
  const root = document.getElementById('eventsManageRoot');
  if(!root) return;
  if(!evManageMonth) evManageMonth = evMonthOf(today);
  const list = eventsList().filter(ev => evMonthOf(ev.date) === evManageMonth || (ev.end && evMonthOf(ev.end) === evManageMonth) || (ev.date < evManageMonth && (ev.end || ev.date) > evManageMonth + '-31'))
    .sort((a, b) => a.date.localeCompare(b.date) || (evMinutes(a.from) ?? -1) - (evMinutes(b.from) ?? -1));
  const editing = evEditId === 'new' ? {id: 'new', kind: 'instore', date: today} : eventsList().find(ev => ev.id === evEditId);
  const range = ev => {
    const d = x => new Date(x + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
    const days = Array.isArray(ev.days) && ev.days.length && ev.days.length < 7 ? ` (${ev.days.map(n => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][n]).join(', ')})` : '';
    return `${d(ev.date)}${ev.end && ev.end !== ev.date ? ` – ${d(ev.end)}` : ''}${days}`;
  };
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
        <div class="ev-m-main"><b>${escapeHtml(ev.title)}</b>${ev.detail ? `<span>${escapeHtml(ev.detail)}</span>` : ''}<small>${escapeHtml(range(ev))}${ev.from ? ` · ${escapeHtml(evTimeText(ev))}` : ' · all day'}</small></div>
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

function evAfterChange(msg){
  evEditId = null;
  renderEventsManage();
  renderHomeEvents();
  if(typeof renderAllDayparts === 'function') renderAllDayparts();
  showToast(msg);
  saveState();
}

document.addEventListener('click', e => {
  const t = e.target.closest ? e.target : null;
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
    evManageMonth = evMonthOf(ev.date);
    evAfterChange('Event added');
  } else {
    storeEvents = storeEvents.map(x => x.id === id ? {id, ...ev} : x);
    evAfterChange('Event saved');
  }
});
