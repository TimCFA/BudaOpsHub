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
