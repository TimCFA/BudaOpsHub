// ===== KNOW THE NUMBERS: THE FOUR DAYPARTS =====
// Projected sales and productivity goals are kept for the four major
// dayparts only: Breakfast, Lunch, Afternoon and Dinner (Tim). Breakfast
// takes in Early Breakfast and Dinner takes in Close, so a day's dayparts
// add up to the day; Transition sits inside Lunch. On Set Ups, the Early
// Breakfast, Transition and Close cards show no numbers.

const numbersDayparts = [
  {name: 'Breakfast (6:00-11:00)', time: '6:00'},
  {name: 'Lunch (11:00-2:00)', time: '11:00'},
  {name: 'Afternoon (2:00-5:00)', time: '14:00'},
  {name: 'Dinner (5:00-10:00)', time: '17:00'},
];

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

// A day's numbers typed under the older seven FOH dayparts → the four.
// Early Breakfast adds into Breakfast and Close into Dinner (their sales
// add up; the main daypart's goal wins). Transition's sales are already
// inside Lunch's, so only its event text carries over.
function knNormalizeDay(day){
  if(!day || typeof day !== 'object') return day;
  Object.keys(day).forEach(key=>{
    if(numbersDayparts.some(n => n.name === key)) return;
    const e = day[key];
    delete day[key];
    if(!e || typeof e !== 'object') return;
    const old = [...fohDayparts, ...bohDayparts].find(d => d.name === key);
    const target = old ? knDaypartAt(knWindowOf(old).start) : null;
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
