// ===== KNOW THE NUMBERS: THE FOUR DAYPARTS =====
// Projected sales and productivity goals are kept for the four major
// dayparts only, on Analytics Hub's hours so projections line up with the
// actuals the team compares them to (Tim): Breakfast to 10:30, Lunch 10:30
// to 2, Afternoon 2 to 5, Dinner 5 to close. Breakfast takes in Early
// Breakfast and Dinner takes in Close, so a day's dayparts add up to the
// day; Transition sits inside Lunch. On Set Ups, the Early Breakfast,
// Transition and Close cards show no numbers.

const numbersDayparts = [
  {name: 'Breakfast (6:00-10:30)', time: '6:00'},
  {name: 'Lunch (10:30-2:00)', time: '10:30'},
  {name: 'Afternoon (2:00-5:00)', time: '14:00'},
  {name: 'Dinner (5:00-10:00)', time: '17:00'},
];

// Where a daypart key starts, in minutes: the hub's own lists give the
// 24-hour time; any other key ("Breakfast (6:00-11:00)", an earlier
// layout) is read from its name, morning up to 5:59, afternoon from 1:00.
function knStartOf(key){
  const known = [...fohDayparts, ...bohDayparts, ...numbersDayparts].find(d => d.name === key);
  if(known) return knWindowOf(known).start;
  const m = String(key).match(/\((\d{1,2}):(\d{2})\s*-/);
  if(!m) return -1;
  return (+m[1] + (+m[1] < 6 ? 12 : 0)) * 60 + +m[2];
}

// {start, end} in minutes from midnight: the start from `time` (24-hour),
// the end from the name ("(5:00-10:00)" → 10 PM).
function knWindowOf(dp){
  const [sh, sm] = String(dp.time || '0:00').split(':').map(Number);
  const start = sh * 60 + (sm || 0);
  const m = String(dp.name).match(/\(\d{1,2}:\d{2}\s*-\s*(\d{1,2}):(\d{2})\)/);
  let end = m ? (+m[1]) * 60 + (+m[2]) : start + 180;
  while(end <= start) end += 720;
  return {start, end};
}

// The numbers daypart a minute of the day falls in, or null.
function knDaypartAt(min){
  return numbersDayparts.find(n => { const w = knWindowOf(n); return min >= w.start && min < w.end; }) || null;
}

// The numbers daypart a Set Ups daypart (FOH or BOH) reads from: the one
// its middle falls in (BOH's Mid reads Lunch). Early Breakfast, Transition
// and Close read none.
function knDaypartOf(dp){
  if(!dp || !dp.name) return null;
  const own = numbersDayparts.find(n => n.name === dp.name);
  if(own) return own;
  if(/^(early|transition|close)/i.test(dp.name)) return null;
  const w = knWindowOf(dp);
  return knDaypartAt(Math.floor((w.start + w.end) / 2));
}

// A day's numbers typed under an earlier layout (the seven FOH dayparts,
// or the four on 11:00 hours) → the four. Early Breakfast adds into
// Breakfast and Close into Dinner (their sales add up; the main daypart's
// goal wins). Transition's sales are already inside Lunch's, so only its
// event text carries over.
function knNormalizeDay(day){
  if(!day || typeof day !== 'object') return day;
  Object.keys(day).forEach(key=>{
    if(numbersDayparts.some(n => n.name === key)) return;
    const e = day[key];
    delete day[key];
    if(!e || typeof e !== 'object') return;
    const target = knDaypartAt(knStartOf(key));
    if(!target) return;
    const t = day[target.name] = day[target.name] || {};
    const inside = /^transition/i.test(key);
    const main = /^(breakfast|lunch|afternoon|dinner|mid)/i.test(key);
    if(!inside && parseMoney(e.projectedSales) !== null){
      t.projectedSales = formatAsCurrency((parseMoney(t.projectedSales) || 0) + parseMoney(e.projectedSales));
    }
    if(!inside && e.productivityGoal && (main || !t.productivityGoal)) t.productivityGoal = e.productivityGoal;
    const ev = String(e.specialEvents || '').trim();
    if(ev && !String(t.specialEvents || '').includes(ev)) t.specialEvents = [String(t.specialEvents || '').trim(), ev].filter(Boolean).join(' · ');
  });
  return day;
}

function knNormalizeAll(){
  Object.values(numbersData || {}).forEach(knNormalizeDay);
}

// The numbers a Set Ups daypart shows on a date, from the live fortnight.
function getNumbersForDaypart(dayName, dp){
  const day = numbersData[dayName];
  if(!day) return null;
  knNormalizeDay(day);
  const n = knDaypartOf(dp);
  return n ? (day[n.name] || null) : null;
}

// ----- Actuals -----
// After a daypart, a leader types what actually happened (Analytics Hub's
// sales and sales per labor hour), next to what was planned (Tim):
// actualSales against projectedSales, actualProductivity against
// productivityGoal. {actual, plan, diff, pct} for one pair, or null until
// both are there.
function knVersus(actualRaw, planRaw){
  const actual = parseMoney(actualRaw), plan = parseMoney(planRaw);
  if(actual === null || plan === null) return null;
  return {actual, plan, diff: actual - plan, pct: plan ? (actual - plan) / plan * 100 : null};
}

const knMoneyText = v => '$' + Math.round(v).toLocaleString('en-US');
const knSignedMoney = v => (v < 0 ? '−' : '+') + knMoneyText(Math.abs(v));

// The "how did we do" lines under a Know the Numbers daypart.
function knActualsHtml(entry){
  const e = entry || {};
  const sales = knVersus(e.actualSales, e.projectedSales);
  const prod = knVersus(e.actualProductivity, e.productivityGoal);
  const line = (label, v, planWord, pct) => {
    const cls = Math.round(v.diff) === 0 ? 'is-even' : v.diff > 0 ? 'is-up' : 'is-down';
    const delta = Math.round(v.diff) === 0 ? 'on target' : `${knSignedMoney(v.diff)}${pct && v.pct !== null ? ` (${v.pct < 0 ? '−' : '+'}${Math.abs(v.pct).toFixed(1)}%)` : ''}`;
    return `<div class="kn-vs-row"><span class="kn-vs-k">${label}</span><span class="kn-vs-v"><b>${escapeHtml(knMoneyText(v.actual))}</b> vs ${escapeHtml(knMoneyText(v.plan))} ${planWord}</span><span class="kn-vs-d ${cls}">${escapeHtml(delta)}</span></div>`;
  };
  const rows = [sales && line('Sales', sales, 'projected', true), prod && line('Productivity', prod, 'goal', false)].filter(Boolean);
  return rows.join('');
}

// ----- Manage → Numbers: a month calendar of actuals -----
// The projections come from the Forecast or the numbers file, and special
// events from the Events calendar, so the only thing typed here is what
// actually happened: each daypart's sales and productivity (Tim, Oct 2026).
// The month shows Monday to Saturday (closed Sundays); each day says
// whether its actuals are in, and tapping it opens its four dayparts. The
// last two weeks are live and can be typed in; older days are read from
// numbersHistory (kept a year) and only shown.

let knMonth = null;   // 'YYYY-MM' on screen
let knDay = null;     // the day open under the grid

const KN_CHECK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function knIsoOf(d){ return toLocalISODate(d); }
function knLiveCutoff(){ const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() - 14); return knIsoOf(d); }
function knIsLive(iso){ return iso >= knLiveCutoff(); }
function knDefaultDay(){
  const d = new Date(today + 'T00:00:00');
  if(d.getDay() === 0) d.setDate(d.getDate() - 1);   // closed Sunday: Saturday
  return knIsoOf(d);
}

// A day's four dayparts as {name: entry}, from the live numbers or, for an
// older day, from numbersHistory ([projected, goal, events, actual sales,
// actual productivity]).
function knDayEntries(iso){
  if(numbersData[iso]){ knNormalizeDay(numbersData[iso]); return numbersData[iso]; }
  const h = (typeof numbersHistory !== 'undefined' && numbersHistory) ? numbersHistory[iso] : null;
  if(!h) return {};
  const money = v => (v === null || v === undefined) ? '' : formatAsCurrency(v);
  const out = {};
  Object.entries(h).forEach(([dp, r]) => {
    if(!Array.isArray(r)) return;
    out[dp] = {projectedSales: money(r[0]), productivityGoal: money(r[1]), specialEvents: r[2] || '', actualSales: money(r[3]), actualProductivity: money(r[4])};
  });
  return out;
}

// The dayparts whose actuals are due on `iso` (all of them for a past day,
// the ones already over for today, none ahead).
function knDueDayparts(iso, nowMin){
  if(iso > today) return [];
  if(iso < today) return numbersDayparts;
  return numbersDayparts.filter(dp => knWindowOf(dp).end <= nowMin);
}

// 'done' | 'part' | 'due' | 'plan' | 'empty' for a day's square.
function knDayState(iso, nowMin){
  const entries = knDayEntries(iso);
  const has = (e, f) => parseMoney(e && e[f]) !== null;
  const planned = numbersDayparts.some(dp => has(entries[dp.name], 'projectedSales'));
  const due = knDueDayparts(iso, nowMin).filter(dp => { const e = entries[dp.name]; return has(e, 'projectedSales') || has(e, 'actualSales') || has(e, 'actualProductivity'); });
  if(!due.length) return planned ? 'plan' : 'empty';
  const done = due.filter(dp => has(entries[dp.name], 'actualSales') && has(entries[dp.name], 'actualProductivity')).length;
  const some = due.some(dp => has(entries[dp.name], 'actualSales') || has(entries[dp.name], 'actualProductivity'));
  return done === due.length ? 'done' : some ? 'part' : 'due';
}

function knCompactMoney(v){ return v >= 1000 ? '$' + (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : '$' + Math.round(v); }

function knNowMin(){ const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }

// The month's weeks, Monday to Saturday, as ISO dates (null outside the month).
function knMonthWeeks(ym){
  const first = new Date(ym + '-01T00:00:00');
  const start = new Date(first);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));   // back to Monday
  const weeks = [];
  for(const d = new Date(start); knIsoOf(d).slice(0, 7) <= ym; d.setDate(d.getDate() + 1)){
    if(d.getDay() === 1) weeks.push([]);
    if(d.getDay() === 0) continue;
    const iso = knIsoOf(d);
    weeks[weeks.length - 1].push(iso.slice(0, 7) === ym ? iso : null);
  }
  return weeks.filter(w => w.some(Boolean));
}

const KN_STATE_TEXT = {done: 'actuals in', part: 'some actuals in', due: 'actuals needed', plan: 'projected', empty: 'nothing yet'};

function knGridHtml(){
  const nowMin = knNowMin();
  return knMonthWeeks(knMonth).map(week => `<div class="kn-mcal-week">${week.map(iso => {
    if(!iso) return '<span class="kn-mcal-day is-out" aria-hidden="true"></span>';
    const state = knDayState(iso, nowMin);
    const entries = knDayEntries(iso);
    const proj = numbersDayparts.reduce((s, dp) => s + (parseMoney(entries[dp.name] && entries[dp.name].projectedSales) || 0), 0);
    const mark = state === 'done' ? KN_CHECK_ICON : state === 'part' || state === 'due' ? '+' : state === 'plan' && proj ? escapeHtml(knCompactMoney(proj)) : '';
    const label = `${new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'long', month: 'short', day: 'numeric'})}: ${KN_STATE_TEXT[state]}`;
    return `<button type="button" class="kn-mcal-day is-${state} ${iso === today ? 'is-today' : ''} ${iso === knDay ? 'is-open' : ''}" data-kn-day="${iso}" aria-label="${escapeHtml(label)}" aria-pressed="${iso === knDay}"><span>${+iso.slice(8)}</span><i>${mark}</i></button>`;
  }).join('')}</div>`).join('');
}

function knSplitName(name){
  const m = String(name).match(/^(.*?)\s*\((.*)\)$/);
  return m ? [m[1], m[2].replace('-', '–')] : [name, ''];
}

function knDayPanelHtml(){
  const iso = knDay;
  const live = knIsLive(iso);
  const entries = knDayEntries(iso);
  const nowMin = knNowMin();
  const due = knDueDayparts(iso, nowMin);
  const title = new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'});
  const stamp = lastUpdated[iso] && typeof formatLastUpdated === 'function' ? formatLastUpdated(lastUpdated[iso]) : '';
  const parts = numbersDayparts.map((dp, i) => {
    const e = entries[dp.name] || {};
    const [name, hours] = knSplitName(dp.name);
    const proj = parseMoney(e.projectedSales), goal = parseMoney(e.productivityGoal);
    const events = typeof knSpecialEventsText === 'function' ? knSpecialEventsText(e.specialEvents || '', iso, dp) : String(e.specialEvents || '');
    const plan = proj !== null || goal !== null
      ? `<p class="kn-dp-plan">Projected <b>${proj !== null ? escapeHtml(knMoneyText(proj)) : '—'}</b> · Goal <b>${goal !== null ? escapeHtml(knMoneyText(goal)) : '—'}</b></p>`
      : '<p class="kn-dp-plan is-none">No projection yet</p>';
    const open = live && iso <= today;
    const input = (field, label) => `<label class="kn-dp-field"><span>${label}</span><input type="text" inputmode="decimal" placeholder="$0.00" value="${escapeHtml(e[field] || '')}" data-kn-field="${field}" data-kn-dp="${escapeHtml(dp.name)}"></label>`;
    const later = iso === today && !due.includes(dp) ? '<small class="kn-dp-later">after the daypart</small>' : '';
    const actuals = open
      ? `<div class="kn-dp-actuals">${input('actualSales', 'Actual sales')}${input('actualProductivity', 'Actual productivity')}</div>`
      : iso > today ? '<p class="kn-dp-note">Actuals open on the day.</p>'
      : (e.actualSales || e.actualProductivity) ? '' : '<p class="kn-dp-note">No actuals were typed.</p>';
    return `
      <div class="kn-dp">
        <div class="kn-dp-head"><b>${escapeHtml(name)}</b><small>${escapeHtml(hours)}</small>${later}</div>
        ${plan}
        ${events ? `<p class="kn-cal-events">${escapeHtml(events)}</p>` : ''}
        ${actuals}
        <div class="kn-vs" id="knVs${i}">${knActualsHtml(e)}</div>
      </div>`;
  }).join('');
  return `
    <section class="kn-day-panel" id="knDayPanel" aria-label="${escapeHtml(title)}">
      <div class="kn-day-head"><h4>${escapeHtml(title)}</h4>${stamp ? `<small>Updated ${escapeHtml(stamp)}</small>` : ''}</div>
      ${!live && iso < today ? '<p class="kn-dp-note">More than two weeks ago: shown as saved, no longer typed in.</p>' : ''}
      <div class="kn-dps">${parts}</div>
    </section>`;
}

function knRenderManage(){
  const root = document.getElementById('numbersContent');
  if(!root) return;
  if(!knDay) knDay = knDefaultDay();
  if(!knMonth) knMonth = knDay.slice(0, 7);
  const label = new Date(knMonth + '-01T00:00:00').toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
  root.innerHTML = `
    <div class="kn-mcal">
      <div class="kn-mcal-bar">
        <button type="button" class="btn btn-ghost kn-mcal-step" data-kn-month="-1" aria-label="Previous month">‹</button>
        <b>${escapeHtml(label)}</b>
        <button type="button" class="btn btn-ghost kn-mcal-step" data-kn-month="1" aria-label="Next month">›</button>
        ${knMonth !== today.slice(0, 7) ? '<button type="button" class="btn btn-ghost kn-mcal-today" data-kn-today="1">Today</button>' : ''}
      </div>
      <div class="kn-mcal-head" aria-hidden="true">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<span>${d}</span>`).join('')}</div>
      <div class="kn-mcal-grid" id="knMcalGrid">${knGridHtml()}</div>
      <div class="kn-mcal-legend"><span><i class="is-done">${KN_CHECK_ICON}</i>actuals in</span><span><i class="is-due">+</i>actuals needed</span><span><i class="is-plan">$</i>projected</span></div>
    </div>
    ${knDay.slice(0, 7) === knMonth ? knDayPanelHtml() : ''}`;
}

// After an actual is typed: its planned-vs-actual line and the day's square.
function knAfterEdit(dayName, dpName){
  const i = numbersDayparts.findIndex(d => d.name === dpName);
  const vs = document.getElementById('knVs' + i);
  if(vs && dayName === knDay && numbersData[dayName]) vs.innerHTML = knActualsHtml(numbersData[dayName][dpName]);
  const grid = document.getElementById('knMcalGrid');
  if(grid) grid.innerHTML = knGridHtml();
}

document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t || !t.closest('#numbersContent')) return;
  const step = t.closest('[data-kn-month]');
  if(step){
    const d = new Date(knMonth + '-01T00:00:00');
    d.setMonth(d.getMonth() + +step.dataset.knMonth);
    knMonth = knIsoOf(d).slice(0, 7);
    knRenderManage();
    return;
  }
  if(t.closest('[data-kn-today]')){ knDay = knDefaultDay(); knMonth = knDay.slice(0, 7); knRenderManage(); return; }
  const day = t.closest('[data-kn-day]');
  if(day){
    knDay = day.dataset.knDay;
    knRenderManage();
    const p = document.getElementById('knDayPanel');
    if(p && p.getBoundingClientRect().top > window.innerHeight - 120) p.scrollIntoView({behavior: 'smooth', block: 'start'});
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if(!t || !t.dataset || !t.dataset.knField || !t.closest('#numbersContent')) return;
  if(!knIsLive(knDay) || knDay > today) return;
  t.value = formatAsCurrency(t.value);
  updateNumbersField(knDay, t.dataset.knDp, t.dataset.knField, t.value);
});
