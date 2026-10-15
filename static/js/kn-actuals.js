// ===== KNOW THE NUMBERS ACTUALS FROM THE UPLOADS (Tim, Oct 14 2026) =====
// Actual sales and actual productivity for each daypart, filled from files
// the hub already gets, wherever nobody typed them:
//  - Actual sales: the weekly sales-by-weekday-and-daypart export (Data
//    Uploads → "Sales by weekday and daypart"). Its rows say "Mon, Lunch"
//    with no dates, so a week is dated by matching each day's total against
//    the daily sales on file (DayTrack or the sales export); a week that
//    matches no week on file waits until the sales it matches arrive.
//  - Actual productivity: the daypart's actual sales ÷ the hours clocked in
//    it, from the punch report (Actual vs. Scheduled, Points' daily PDF):
//    every clock-in to clock-out, cut to each daypart's hours. Time before
//    6:00 or after the Dinner window isn't in any daypart.
// A number a leader typed is never replaced; only finished days are filled.
// Days older than Know the Numbers' two weeks go into its archive
// (numbersHistory), where Game Day and the history read them.
//
// laborByDaypart (private forecast section): {iso: {Breakfast: hrs, …,
// total, people, missingOut, at}} — hours only, no names.

let laborByDaypart = {};
const KA_LABOR_KEEP_DAYS = 120;
const KA_WEEK_MATCH = 0.03;      // a day's daypart total within 3% of its daily sales
const KA_WEEK_LOOKBACK = 16;     // weeks back a daypart export is matched against

const kaPad = n => String(n).padStart(2, '0');
function kaAddDays(iso, n){ const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${kaPad(d.getMonth() + 1)}-${kaPad(d.getDate())}`; }
function kaMonday(iso){ const d = new Date(iso + 'T00:00:00'); return kaAddDays(iso, -((d.getDay() + 6) % 7)); }
const kaMin = hhmm => { const m = String(hhmm || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
const KA_DOWS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// The four Know the Numbers dayparts as minute windows: [{key, name, start, end}].
function kaWindows(){
  return numbersDayparts.map((dp, i) => {
    const start = kaMin(dp.time), next = numbersDayparts[i + 1];
    let end = next ? kaMin(next.time) : null;
    if(end == null){
      const m = dp.name.match(/-(\d{1,2}):(\d{2})\)/);
      end = m ? +m[1] * 60 + +m[2] : start + 300;
      while(end <= start) end += 720;
    }
    return {key: dp.name.replace(/\s*\(.*$/, ''), name: dp.name, start, end};
  });
}

// ----- Labor hours by daypart, from a punch report -----
// {iso: {Breakfast: hrs, …, total, people, missingOut}} for the finished days
// the report covers. A segment with no clock-out isn't counted (missingOut).
function kaLaborFromShifts(shifts, beforeIso){
  const wins = kaWindows(), out = {}, people = {};
  (shifts || []).forEach(s => {
    if(!s || !s.date || s.date >= beforeIso || s.actIn == null) return;
    const day = out[s.date] = out[s.date] || Object.assign({total: 0, missingOut: 0}, ...wins.map(w => ({[w.key]: 0})));
    if(s.actOut == null){ day.missingOut++; return; }
    let a = s.actIn, b = s.actOut;
    if(b < a) b += 1440;
    (people[s.date] = people[s.date] || new Set()).add(s.emp);
    day.total += (b - a) / 60;
    wins.forEach(w => { const o = Math.max(0, Math.min(b, w.end) - Math.max(a, w.start)); day[w.key] += o / 60; });
  });
  Object.keys(out).forEach(iso => {
    const day = out[iso];
    Object.keys(day).forEach(k => { if(k !== 'missingOut') day[k] = Math.round(day[k] * 100) / 100; });
    day.people = people[iso] ? people[iso].size : 0;
  });
  return out;
}

// Saves a punch report's hours. Returns the dates recorded.
function kaRecordLabor(parsed){
  if(!laborByDaypart || typeof laborByDaypart !== 'object' || Array.isArray(laborByDaypart)) laborByDaypart = {};
  // Every day before today: a report run late at night still has that day's punches.
  const days = kaLaborFromShifts(parsed && parsed.shifts, today);
  const at = new Date().toISOString();
  Object.keys(days).forEach(iso => { if(days[iso].total > 0 || days[iso].missingOut) laborByDaypart[iso] = Object.assign(days[iso], {at}); });
  const cutoff = kaAddDays(today, -KA_LABOR_KEEP_DAYS);
  Object.keys(laborByDaypart).forEach(iso => { if(iso < cutoff) delete laborByDaypart[iso]; });
  return Object.keys(days).filter(iso => laborByDaypart[iso]).sort();
}

// ----- Dating a weekly daypart export -----
// The Monday of the week whose daily sales match the file's day totals, or
// null. Every weekday with sales in the file must match a day on file.
function kaDateWeek(w){
  const hist = typeof salesHistory === 'object' && salesHistory ? salesHistory : {};
  const totals = {};
  Object.entries((w && w.days) || {}).forEach(([dow, dps]) => {
    const t = Object.values(dps || {}).reduce((a, v) => a + (+v || 0), 0);
    if(t > 0) totals[dow] = t;
  });
  const dows = Object.keys(totals).filter(d => KA_DOWS.includes(d));
  if(!dows.length) return null;
  let best = null;
  for(let k = 0; k <= KA_WEEK_LOOKBACK; k++){
    const monday = kaAddDays(kaMonday(today), -7 * k);
    let worst = 0, ok = true;
    for(const dow of dows){
      const day = hist[kaAddDays(monday, KA_DOWS.indexOf(dow))];
      const sales = day && +day.sales;
      if(!(sales > 0)){ ok = false; break; }
      const err = Math.abs(totals[dow] - sales) / sales;
      if(err > KA_WEEK_MATCH){ ok = false; break; }
      worst = Math.max(worst, err);
    }
    if(ok && (!best || worst < best.worst)) best = {monday, worst};
  }
  return best ? best.monday : null;
}

// ----- Writing into Know the Numbers -----
// Live days (the last two weeks) are in numbersData; older ones in the
// archive as [projected, goal, events, actualSales, actualProductivity].
function kaGetActual(iso, dpName, field){
  if(typeof knIsLive === 'function' && knIsLive(iso)){
    const e = numbersData[iso] && numbersData[iso][dpName];
    return e ? parseMoney(e[field]) : null;
  }
  const rec = numbersHistory && numbersHistory[iso] && numbersHistory[iso][dpName];
  const v = rec ? rec[field === 'actualSales' ? 3 : 4] : null;
  return v === undefined || v === null || v === '' ? null : +v;
}
// Writes a value where none is; true when it did.
function kaSetActual(iso, dpName, field, value){
  if(!(value >= 0) || kaGetActual(iso, dpName, field) !== null) return false;
  if(typeof knIsLive === 'function' && knIsLive(iso)){
    const day = numbersData[iso] = numbersData[iso] || {};
    const e = day[dpName] = day[dpName] || {};
    e[field] = formatAsCurrency(Math.round(value * 100) / 100);
    return true;
  }
  if(!numbersHistory || typeof numbersHistory !== 'object') numbersHistory = {};
  const rec = numbersHistory[iso] = numbersHistory[iso] || {};
  const arr = rec[dpName] = Array.isArray(rec[dpName]) ? rec[dpName] : [null, null, ''];
  while(arr.length < 5) arr.push(null);
  arr[field === 'actualSales' ? 3 : 4] = Math.round(value * 100) / 100;
  return true;
}

// Fills every empty actual it can. Returns {sales, productivity, undated}.
function kaFill(){
  const wins = kaWindows(), done = {sales: 0, productivity: 0, undated: 0};
  Object.values(typeof daypartWeeks === 'object' && daypartWeeks ? daypartWeeks : {}).forEach(w => {
    if(!w || !w.days) return;
    if(!w.week){ const m = kaDateWeek(w); if(m) w.week = m; }
    if(!w.week){ done.undated++; return; }
    Object.entries(w.days).forEach(([dow, dps]) => {
      const i = KA_DOWS.indexOf(dow);
      if(i < 0) return;
      const iso = kaAddDays(w.week, i);
      if(iso >= today) return;
      wins.forEach(win => { if(dps[win.key] != null && kaSetActual(iso, win.name, 'actualSales', +dps[win.key])) done.sales++; });
    });
  });
  Object.entries(laborByDaypart || {}).forEach(([iso, hrs]) => {
    if(!hrs || iso >= today) return;
    wins.forEach(win => {
      const h = +hrs[win.key];
      if(!(h > 0)) return;
      const sales = kaGetActual(iso, win.name, 'actualSales');
      if(sales !== null && kaSetActual(iso, win.name, 'actualProductivity', sales / h)) done.productivity++;
    });
  });
  if((done.sales || done.productivity) && typeof touchLastUpdated === 'function') touchLastUpdated(today);
  return done;
}
const kaFillText = f => [f.sales ? `${f.sales} daypart${f.sales === 1 ? '' : 's'} of actual sales` : '', f.productivity ? `${f.productivity} of actual productivity` : ''].filter(Boolean).join(' and ');

// ----- The punch report from Data Uploads (or Points) -----
// Hours for Know the Numbers, events for Points. Throws if it isn't one.
async function kaImportPunchReport(file, parsed){
  if(!parsed){
    if(typeof ptReadPdf !== 'function' || typeof APS === 'undefined') throw new Error('The punch report reader isn’t loaded. Reload the page and try again.');
    parsed = APS.parseReport(await ptReadPdf(file));
  }
  if(!parsed || !parsed.shifts || !parsed.shifts.length) throw new Error('No shifts found. Is this the Actual vs. Scheduled report?');
  if(typeof ptIsOtherStore === 'function' && ptIsOtherStore(parsed)) throw new Error(`This report is for ${parsed.location}. Only Chick-fil-A Buda reports are read here.`);
  const dates = kaRecordLabor(parsed);
  let added = 0, review = 0;
  if(typeof ptPrepare === 'function' && typeof ptCommit === 'function'){
    const prep = ptPrepare(parsed);
    review = prep.fresh.filter(e => e.status === 'review').length;
    added = prep.fresh.length ? ptCommit(prep, file.name) : 0;
  }
  const filled = kaFill();
  const short = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  const range = parsed.range ? `${short(parsed.range[0])} – ${short(parsed.range[1])}` : '';
  // (ptCommit logs the checklist row when it adds events; otherwise it's logged here.)
  if(!added && typeof duRecord === 'function') duRecord('punch', {file: file.name, summary: `${dates.length} day${dates.length === 1 ? '' : 's'} · ${added} points event${added === 1 ? '' : 's'}`, periodEnd: dates[dates.length - 1] || null});
  await saveState();
  if(typeof dirRerender === 'function') dirRerender();
  if(document.getElementById('numbersContent') && typeof renderNumbersContent === 'function') renderNumbersContent();
  const parts = [`${added} event${added === 1 ? '' : 's'} → Points${review ? ` (${review} need${review === 1 ? 's' : ''} a leader’s call)` : ''}`,
    `hours for ${dates.length} day${dates.length === 1 ? '' : 's'}${kaFillText(filled) ? `, ${kaFillText(filled)}` : ''} → Know the Numbers`];
  return `${range ? range + ': ' : ''}${parts.join(' · ')}`;
}
