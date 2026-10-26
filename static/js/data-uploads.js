// ===== DATA UPLOADS (TIM-46) =====
// One checklist at the top of Manage: every data source the site runs on,
// how often it's due, what the last upload covered, and whether it's up to
// date. One drop zone takes any of the files; each is recognized from its
// contents and filed where it belongs, and every tool reads from that one
// copy. CEM is the main case: one Comparison Report upload updates CEM Trends
// (cemEntries) AND the Guest Obsession scoreboard (gxData) together.
//
// Only what's read out of a file is kept, never the file itself. Phone
// numbers in the HotSchedules roster are never read.

const DU_FREQUENCIES = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly'
};

const DU_SOURCES = [
  {
    key: 'cem', short: 'CEM reports', icon: '', name: 'CEM guest scores', freq: 'weekly', accept: '.csv,.xlsx,.xls', multiple: true,
    how: 'CEM → Comparison Report for this month to date (the 1st through yesterday). Export it twice — Time of Day, and Day of Visit — as CSV or Excel.',
    feeds: 'Guest Obsession scoreboard · CEM Trends · CEM insights'
  },
  {
    key: 'roster', short: 'roster CSV', icon: '', name: 'HotSchedules weekly roster', freq: 'weekly', fixedFreq: true, accept: '.csv',
    how: 'Easiest: the Ops Hub Sync bookmark above — click it on HotSchedules → Scheduling (week view). Or HotSchedules → Weekly Roster CSV for next week; keep the file name — it carries the dates.',
    feeds: 'Set Ups · Fill · Evaluate · Lead Captain · shift changes'
  },
  {
    key: 'pea', short: 'PEA PDFs', icon: '', name: 'PEA ratings (Levelset)', freq: 'weekly', accept: '.pdf', multiple: true,
    how: 'Sync from Levelset pulls the last 90 days on its own. Backup: Levelset → Positional Excellence Ratings PDF, FOH and BOH. Overlapping dates are fine — ratings already saved are skipped.',
    feeds: 'Strength map · Coverage Check · Set Ups Fill, Evaluate, Plan B, Develop'
  },
  {
    key: 'numbers', short: 'numbers file', icon: '', name: 'Projected sales & productivity goals', freq: 'weekly', accept: '.csv,.xlsx,.xls,.txt',
    how: 'Nothing to do: the Forecast fills Know the Numbers on its own (today and the days ahead) from the DayTrack and sales uploads. Only to override it: a spreadsheet (Excel or CSV) with a Date column, a Daypart column (Breakfast, Lunch, Afternoon, Dinner), and Projected Sales / Productivity Goal columns, or one row per day with a column per daypart; the template is here. Special events come from the Events calendar; actuals are typed in Manage → Numbers.',
    feeds: 'Know the Numbers · Set Ups game plan · Game Day / Practice Day'
  },
  {
    key: 'punch', short: 'punch report', icon: '', name: 'Punch report (Actual vs. Scheduled)', freq: 'daily', accept: '.pdf', multiple: true,
    how: 'The Actual vs. Scheduled PDF for yesterday, the same one Directors → Points reads. Drop it here or there; overlapping days are fine, anything already recorded is skipped.',
    feeds: 'Accountability points · Know the Numbers actual productivity (hours clocked in each daypart) · weekly leader report'
  },
  {
    key: 'productivity', short: 'productivity reports', icon: '', name: 'Productivity, labor cost & sales curve', freq: 'monthly', accept: '.pdf,.csv,.txt', multiple: true,
    how: 'Easiest: the Productivity, Labor Cost and Sales Curve PDFs in the Schedule Builder’s zip — drop the whole zip. Or from Analytics Hub, month to date: Productivity (Display Hours, and Display Daypart), Labor Cost (Display Hours) and Sales Curve, each saved as PDF. The older CSV export (Total | Daypart | Productivity, one per weekday) still works.',
    feeds: 'Break planner (breaks stay out of each day’s busiest hours) · Forecast daypart productivity goals · labor % by hour'
  },
  {
    key: 'salesMix', short: 'Sales Mix', icon: '', name: 'Sales Mix (items sold)', freq: 'weekly', accept: '.csv,.xlsx,.xls,.txt', multiple: true,
    how: 'Sales Mix Items Totals report, one file per day (the date in the file name is used). Drop several days at once.',
    feeds: 'Prep Board build-to and sold history'
  },
  {
    key: 'sales', short: 'sales export', icon: '', name: 'Sales by destination (Analytics Hub)', freq: 'monthly', accept: '.csv,.txt',
    how: 'Analytics Hub → sales by day by destination, export as CSV (CSV_DOWNLOAD). With a weekly DayTrack upload the WIG stays current on its own, and this export only feeds the channel mix — monthly is enough. Without DayTrack it carries the WIG: month to date for MTD, the same report from Jan 1 for YTD.',
    feeds: 'Forecast channel mix (sales by destination) and last year’s sales for every day it covers · Guest Obsession WIG when it reaches a later day than DayTrack'
  },
  {
    key: 'dayparts', short: 'weekly daypart export', icon: '', name: 'Sales by weekday and daypart (Analytics Hub)', freq: 'weekly', accept: '.csv,.txt', multiple: true,
    how: 'Analytics Hub → sales by destination, broken out by weekday and daypart (rows read “Mon, Breakfast”), one week an export. Upload each week as it lands; the hub keeps the last 12 and, once a weekday has 3, splits that weekday’s projected sales by its own usual shape (Saturday lunch-heavy, Wednesday dinner-heavy).',
    feeds: 'Forecast → Know the Numbers: each weekday’s daypart mix'
  },
  {
    key: 'labor', short: 'DayTrack export', icon: '', name: 'DayTrack Table (sales & labor by day)', freq: 'weekly', accept: '.csv,.txt,.xlsx,.xls',
    how: 'Analytics Hub → DayTrack → Table, export as CSV, with a row per business date. Carries this year’s and last year’s sales, timekeeping and benchmark hours, effective wage, labor cost % and check average. Export a range that reaches back a year once, so the forecast has last year’s figure for every day ahead; after that a few weeks at a time keeps it current. Any other export with a date column and labor columns works too; the Forecast page’s Data tab shows which column was taken for what.',
    feeds: 'Forecast — sales history, last year’s sales, labor hours, $ per labor hour and labor % targets · Guest Obsession WIG (sales MTD / YTD and % vs last year)'
  },
  {
    key: 'dtRank', short: 'rankings', icon: '', name: 'Drive-thru rankings (Analytics Hub)', freq: 'monthly', accept: '.csv,.txt', multiple: true,
    how: 'Analytics Hub → DT rankings → Detailed Rankings (or Composite Rank), export as CSV — once per comparison group. A chain-wide ranking is recognized on its own; for the others the upload asks Region, Market or State.',
    feeds: 'Guest Obsession DT ranking'
  },
  {
    key: 'sos', short: 'speed of service export', icon: '', name: 'Speed of service (Analytics Hub)', freq: 'monthly', accept: '.csv,.txt',
    how: 'Analytics Hub → speed of service, Custom by Day, export as CSV (month to date). A good export counts about 1,000–1,400 drive-thru transactions a day; one that counts millions a day was exported with other settings and is refused.',
    feeds: 'Guest Obsession Speed of Service (drive-thru, every car)'
  },
  {
    key: 'smartShop', short: 'Smart Shop PDFs', icon: '', name: 'Smart Shop visits (Ops Hub)', freq: 'monthly', accept: '.pdf,.zip', multiple: true,
    how: 'Ops Hub → Assessments → Smart Shop → download the report (a PDF, or the zip Ops Hub gives you). Upload every visit for the month.',
    feeds: 'Guest Obsession Manage — Smart Shop results and the standards missed most'
  },
  {
    key: 'foodSafety', short: 'food safety PDF', icon: '', name: 'Food safety assessment (Ops Hub)', freq: 'monthly', fixedFreq: true, accept: '.pdf',
    how: 'After each assessment, the visit’s SAFE report PDF from Ops Hub (the one headed SAFE with the performance levels; "Show only Noncompliant Responses" is fine), or Food Safety → All Findings saved as PDF. Either files the quarter’s findings; the SAFE report also carries the visit date and the quarterly performance levels.',
    feeds: 'Food Safety Walkthrough — the findings to check first'
  },
  {
    key: 'qiv', short: 'QIV PDF', icon: '', name: 'QIV visit (Ops Hub)', freq: 'quarterly', fixedFreq: true, accept: '.pdf',
    how: 'Ops Hub → QIV → the quarter’s Icon Report (QIV_QTR_…pdf), after each scored visit.',
    feeds: 'Guest Obsession Most Recent QIV · QIV panel under Operational Excellence'
  }
];

let dataUploadLog = {};        // {sourceKey: [{at, file, summary, periodEnd?}]} newest last
let dataUploadSettings = {};   // {freq: {sourceKey: 'weekly' | ...}}
let duResults = [];            // session-only: what the last drop did
let duPending = [];            // session-only: files waiting for a day / weekday
let duPendingSeq = 0;

function duFreq(src){
  const f = dataUploadSettings.freq && dataUploadSettings.freq[src.key];
  return !src.fixedFreq && DU_FREQUENCIES[f] ? f : src.freq;
}

function duRecord(key, entry){
  if(!dataUploadLog || typeof dataUploadLog !== 'object' || Array.isArray(dataUploadLog)) dataUploadLog = {};
  const list = dataUploadLog[key] = dataUploadLog[key] || [];
  list.push({at: new Date().toISOString(), ...entry});
  dataUploadLog[key] = list.slice(-8);
}

function duLastLog(key){
  const list = (dataUploadLog && dataUploadLog[key]) || [];
  return list[list.length - 1] || null;
}

// ----- Dates -----

function duStartOfDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function duMonday(d){ const x = duStartOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function duAddDays(d, n){ const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function duISO(d){ return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function duShort(iso){ return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}); }

// The current period for a frequency, and the one before it.
function duPeriods(freq, now){
  const day = duStartOfDay(now);
  if(freq === 'daily') return {start: day, prev: duAddDays(day, -1)};
  if(freq === 'monthly') return {start: new Date(now.getFullYear(), now.getMonth(), 1), prev: new Date(now.getFullYear(), now.getMonth() - 1, 1)};
  if(freq === 'quarterly'){ const q = Math.floor(now.getMonth() / 3) * 3; return {start: new Date(now.getFullYear(), q, 1), prev: new Date(now.getFullYear(), q - 3, 1)}; }
  const mon = duMonday(now);
  if(freq === 'biweekly') return {start: duAddDays(mon, -7), prev: duAddDays(mon, -21)};
  return {start: mon, prev: duAddDays(mon, -7)};
}

// fresh | due | overdue, from the last time this source was brought up to date.
function duStatusFromTime(last, freq, now){
  if(!last) return 'overdue';
  const {start, prev} = duPeriods(freq, now);
  return last >= start ? 'fresh' : last >= prev ? 'due' : 'overdue';
}

// ----- Per-source status -----

function duRosterWeekLoaded(monday){
  for(let i = 0; i < 6; i++){
    const iso = duISO(duAddDays(monday, i));
    if((fohRoster[iso] || []).length || (bohRoster[iso] || []).length) return true;
  }
  return false;
}

function duCemLatest(){
  const periods = ctPeriods();
  const months = periods.filter(p => p.periodType === 'month');
  const pool = months.length ? months : periods;
  return pool.slice().sort((a, b) => a.periodEnd.localeCompare(b.periodEnd) || b.periodStart.localeCompare(a.periodStart)).pop() || null;
}

function duSourceState(src, now){
  const freq = duFreq(src);
  const log = duLastLog(src.key);
  const logAt = log ? new Date(log.at) : null;
  if(RP_KEYS.includes(src.key)) return rpSourceState(src, now, freq, logAt);

  if(src.key === 'roster'){
    const thisWeek = duMonday(now), nextWeek = duAddDays(thisWeek, 7);
    const hasThis = duRosterWeekLoaded(thisWeek), hasNext = duRosterWeekLoaded(nextWeek);
    const lateInWeek = ((now.getDay() + 6) % 7) >= 3; // Thursday on
    const status = !hasThis ? 'overdue' : (lateInWeek && !hasNext) ? 'due' : 'fresh';
    const cover = [hasThis ? `This week (${duShort(duISO(thisWeek))}) ✓` : `This week (${duShort(duISO(thisWeek))}) missing`, hasNext ? `next week ✓` : 'next week not yet'].join(' · ');
    const note = status === 'due' ? 'Upload next week’s roster before Monday.' : status === 'overdue' ? 'This week has no roster — Set Ups can’t see who’s on.' : '';
    return {status, freq, cover, note, last: logAt};
  }

  if(src.key === 'cem'){
    const latest = duCemLatest();
    if(!latest) return {status: 'overdue', freq, cover: 'No CEM data yet', note: '', last: logAt};
    const entries = ctEntriesForPeriod(latest.periodKey);
    const has = dim => entries.some(e => e.dimension === dim);
    const total = entries.find(e => e.dimension === 'total');
    const missing = [!has('daypart') && 'Time of Day', !has('dow') && 'Day of Visit'].filter(Boolean);
    // Current when the latest month reaches the end of the last period (CEM
    // runs a day or two behind, so a two-day grace), not just when a file
    // went up recently — an old month uploaded today is still behind.
    const {start, prev} = duPeriods(freq, now);
    const end = new Date(latest.periodEnd + 'T00:00:00');
    let status = end >= duAddDays(start, -2) ? 'fresh' : end >= duAddDays(prev, -2) ? 'due' : 'overdue';
    const cover = `${latest.periodLabel}${total && total.n ? ` · ${total.n} surveys` : ''} · by daypart ${has('daypart') ? '✓' : '—'} · by day ${has('dow') ? '✓' : '—'}`;
    let note = status === 'fresh' ? '' : `Latest is ${latest.periodLabel} — upload ${now.toLocaleDateString('en-US', {month: 'long'})} month to date.`;
    if(missing.length){
      note = (note ? note + ' ' : '') + `Also upload the ${missing.join(' and ')} export for ${latest.periodLabel}.`;
      if(status === 'fresh') status = 'due';
    }
    return {status, freq, cover, note, last: logAt};
  }

  if(src.key === 'pea'){
    const up = (peaRatings.uploads || []).slice(-1)[0] || null;
    const last = [logAt, up ? new Date(up.at) : null].filter(Boolean).sort((a, b) => a - b).pop() || null;
    const rows = peaRatings.rows || [];
    const cover = rows.length ? `Ratings through ${duShort(rows[rows.length - 1][0].slice(0, 10))} · ${rows.length} saved` : 'No PEA ratings yet';
    const areas = up && up.areas && up.areas.length < PEA_AREAS.length ? `Last upload only covered ${up.areas.join(', ')} — upload ${PEA_AREAS.filter(a => !up.areas.includes(a)).join(', ')} too.` : '';
    return {status: duStatusFromTime(last, freq, now), freq, cover, note: areas, last};
  }

  if(src.key === 'productivity'){
    const days = Object.keys(productivityProfiles || {});
    const order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'All'];
    days.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const last = days.map(d => new Date(productivityProfiles[d].at)).sort((a, b) => a - b).pop() || logAt;
    const status = duStatusFromTime(last, freq, now);
    const missing = order.slice(0, 6).filter(d => !productivityProfiles[d]);
    return {status, freq, cover: days.length ? `Profiles: ${days.join(', ')}` : 'No productivity report yet — breaks use default rush hours', note: days.length && missing.length ? `Days without their own profile borrow the closest one (${missing.join(', ')}).` : '', last};
  }

  if(src.key === 'numbers'){
    // Current when the rest of this week has projected sales; due from
    // Thursday until next week's are in.
    const has = iso => Object.values(numbersData[iso] || {}).some(e => e && e.projectedSales);
    const ahead = Object.keys(numbersData).filter(d => isSetupDateKey(d) && d >= duISO(now) && has(d)).sort();
    const monday = duMonday(now), saturday = duISO(duAddDays(monday, 5)), nextSaturday = duISO(duAddDays(monday, 12));
    const latest = ahead[ahead.length - 1] || null;
    const lateInWeek = ((now.getDay() + 6) % 7) >= 3;
    const status = !latest || latest < duISO(now) ? 'overdue' : latest < saturday ? 'due' : lateInWeek && latest < nextSaturday ? 'due' : 'fresh';
    const viaForecast = typeof salesHistory !== 'undefined' && Object.keys(salesHistory || {}).length > 0;
    const ask = lateInWeek ? 'next week’s numbers before Monday' : 'this week’s numbers';
    const note = status === 'fresh' ? '' : viaForecast ? `The Forecast fills ${ask} on its own once a manager is signed in; if it hasn't, upload this week's DayTrack export.` : `Upload ${ask}, or the DayTrack export and the Forecast fills them.`;
    return {status, freq, cover: latest ? `Projected sales through ${duShort(latest)}` : 'No projected sales ahead of today', note, last: logAt};
  }

  if(src.key === 'salesMix'){
    const dates = (prepSoldEntries || []).map(e => e.date).filter(Boolean).sort();
    const latest = dates[dates.length - 1] || null;
    // A day's Sales Mix can only exist once the day is over, so the data is
    // current when it reaches the day before this period began.
    const {start, prev} = duPeriods(freq, now);
    const d = latest ? new Date(latest + 'T00:00:00') : null;
    const status = !d ? 'overdue' : d >= duAddDays(start, -1) ? 'fresh' : d >= duAddDays(prev, -1) ? 'due' : 'overdue';
    return {status, freq, cover: latest ? `Latest day: ${duShort(latest)} · ${dates.length} days saved` : 'No Sales Mix yet', note: '', last: logAt};
  }
  if(src.key === 'labor' && typeof fcLaborSourceState === 'function') return fcLaborSourceState(freq, now, logAt);
  if(src.key === 'dayparts' && typeof fcDaypartWeeksState === 'function') return fcDaypartWeeksState(freq, now, logAt);
  if(src.key === 'punch'){
    // Current once the last open day (yesterday; Saturday on a Monday) has its hours in.
    const hrs = typeof laborByDaypart === 'object' && laborByDaypart ? Object.keys(laborByDaypart).sort() : [];
    const latest = hrs[hrs.length - 1] || null;
    const d = duAddDays(duStartOfDay(now), -1);
    if(d.getDay() === 0) d.setDate(d.getDate() - 1);
    const want = duISO(d);
    const status = latest && latest >= want ? 'fresh' : latest && latest >= duISO(duAddDays(d, -2)) ? 'due' : 'overdue';
    return {status, freq, cover: latest ? `Hours through ${duShort(latest)}` : 'No punch report yet', note: status === 'fresh' ? '' : `Add ${duShort(want)}’s report.`, last: logAt};
  }

  return {status: 'overdue', freq, cover: '', note: '', last: logAt};
}

// ----- CEM → Guest Obsession scoreboard -----

// CEM measure name → Guest Obsession scoreboard field (value, and Top 5%).
const DU_GX_CEM_FIELDS = {
  'Overall Satisfaction': ['satisfaction.highlySatisfied', 'satisfaction.top5Satisfied'],
  'Taste of Food': ['craveable.overallTaste'],
  'Fast Service': ['service.fastService'],
  'Attentive/Friendly': ['teamMembers.attentiveCourteous'],
  'Cleanliness': ['welcoming.cleanliness'],
  'Order Accuracy Y/N': ['service.orderAccuracy'],
  'Portion Size of Food': ['craveable.portionSize'],
  'Taste of Waffle Potato Fries': ['craveable.tasteFries'],
  'Taste of Nuggets': ['craveable.tasteNuggets'],
  'Taste of Chicken Sandwich': ['craveable.tasteCFA'],
  'Taste of Spicy Chicken Sandwich': ['craveable.tasteSpicy'],
  'Temperature of Waffle Potato Fries': ['craveable.tempFries'],
  'Temperature of Nuggets': ['craveable.tempNuggets'],
  'Temperature of Chicken Sandwich': ['craveable.tempCFA'],
  'Temperature of Spicy Chicken Sandwich': ['craveable.tempSpicy']
};
const DU_CT_METRIC_NAMES = {
  overall: 'Overall Satisfaction', taste: 'Taste of Food', fastService: 'Fast Service',
  attentive: 'Attentive/Friendly', cleanliness: 'Cleanliness', orderAccuracy: 'Order Accuracy Y/N'
};

// Point the scoreboard at the latest month in CEM Trends (a quarter or other
// range only when no month is logged). Returns the period used, or null.
function cemSyncScoreboard(){
  const latest = duCemLatest();
  const total = latest ? ctTotalEntry(latest.periodKey) : null;
  if(!total) return null;
  const measures = {};
  Object.keys(DU_CT_METRIC_NAMES).forEach(k=>{
    if(total.scores[k] != null) measures[DU_CT_METRIC_NAMES[k]] = {value: total.scores[k], top5: total.benchmark[k]};
  });
  Object.entries(total.more || {}).forEach(([name, m]) => { measures[name] = m; });
  const pct = v => v == null ? null : `${Math.round(v)}%`;
  const setField = (path, prop, v)=>{
    const [group, key] = path.split('.');
    if(v == null || !gxData[group] || !gxData[group][key]) return;
    gxData[group][key][prop] = v;
  };
  Object.entries(measures).forEach(([name, m])=>{
    const f = DU_GX_CEM_FIELDS[name.trim()];
    if(!f) return;
    setField(f[0], 'value', pct(m.value));
    if(f[1]) setField(f[1], 'value', pct(m.top5));
    else setField(f[0], 'top5', pct(m.top5));
  });
  if(total.scores.overall != null && gxData.satisfaction && gxData.satisfaction.notSatisfied) gxData.satisfaction.notSatisfied.value = pct(100 - total.scores.overall);
  gxData.cemSource = {periodKey: latest.periodKey, label: latest.periodLabel, n: total.n || null};
  gxData.lastUpdated = new Date().toISOString();
  return latest;
}

// ----- Recognizing a file -----

function duReadFile(file, asBuffer){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Couldn’t read the file.'));
    if(asBuffer) reader.readAsArrayBuffer(file); else reader.readAsText(file);
  });
}

// 'cem' | 'roster' | 'pea' | 'salesMix' | 'productivity' | null
function duDetect(file, text, workbook){
  // Levelset exports are named positional-ratings-…; any other PDF (or zip)
  // is asked of the server first, and tried as PEA if it isn't Ops Hub's.
  if(/\.(pdf|zip)$/i.test(file.name)){
    if(/positional|rating|levelset/i.test(file.name)) return 'pea';
    if(/\.pdf$/i.test(file.name) && /actual|schedul|punch|timecard/i.test(file.name)) return 'punch';
    return 'opsPdf';
  }
  // Analytics Hub's 15-minute sales (rows "1130 | 11:30 AM"), analytics-reports.js.
  if(typeof anIsQuarterCsv === 'function' && anIsQuarterCsv(text)) return 'salesQuarter';
  // The weekly daypart file shares the sales export's header; its rows tell them apart.
  if(typeof fcLooksLikeDaypartWeek === 'function' && fcLooksLikeDaypartWeek(text)) return 'dayparts';
  const report = rpDetect(text);
  if(report) return report;
  const firstSheetText = workbook ? workbook.SheetNames.map(n => XLSX.utils.sheet_to_csv(workbook.Sheets[n])).join('\n').slice(0, 4000) : '';
  const head = (text || firstSheetText).slice(0, 4000);
  if(/Comparison:\s*[\d/]+\s*-\s*[\d/]+/.test(head)) return 'cem';
  const firstLine = head.split(/\r?\n/)[0] || '';
  if(/(^|,)"?Employee"?(,|$)/.test(firstLine) && /Mon Shift/.test(firstLine)) return 'roster';
  if(/Daypart Hours Swap/i.test(head)) return 'productivity';
  if(/Daypart\s*Hours\s*Swap/i.test(head.replace(/\u0000/g, ''))) return 'productivity';
  if(/sales[\s_-]*mix/i.test(file.name) || /Sold Count/i.test(firstLine)) return 'salesMix';
  if(/projected|forecast/i.test(head) && /productivity|goal|splh/i.test(head)) return 'numbers';
  if(typeof fcLooksLikeLabor === 'function' && fcLooksLikeLabor(text || firstSheetText)) return 'labor';
  return null;
}

// ----- Handlers: each files the data where every tool reads it -----

async function duImportCem(file, text, buffer){
  const excel = /\.(xlsx|xls)$/i.test(file.name);
  const {period, entries} = excel ? ctParseWorkbook(buffer) : ctParseCsv(text);
  cemEntries = ctMergeEntries(cemEntries, entries);
  cemSelPeriod = period.periodKey;
  const dims = [...new Set(entries.map(e => e.dimension))].map(d => d === 'daypart' ? 'by daypart' : d === 'dow' ? 'by day of week' : 'store total');
  const synced = cemSyncScoreboard();
  duRecord('cem', {file: file.name, summary: `${period.periodLabel} · ${dims.join(', ')}`, periodEnd: period.periodEnd});
  await saveState();
  renderCemTrends();
  renderGXScoreboard();
  renderGXManage();
  const where = synced ? (synced.periodKey === period.periodKey ? 'CEM Trends + Guest Obsession scoreboard' : `CEM Trends (scoreboard stays on ${synced.periodLabel}, the latest month)`) : 'CEM Trends';
  return `${period.periodLabel} (${dims.join(', ')}) → ${where}`;
}

function duImportRoster(file, text){
  const {result, unrecognized, offFloor, truck, admin} = parseWeeklyRosterCsv(text);
  weeklyImportParsed = result;
  weeklyImportTruck = truck || {};
  weeklyImportAdmin = admin || {};
  weeklyImportUnrecognized = unrecognized;
  weeklyImportOffFloor = offFloor;
  weeklyImportFileStart = weeklyRosterStartFromFileName(file.name);
  weeklyImportActiveDay = HS_DAY_ORDER[0];
  weeklyImportPendingFile = file.name;
  showWeeklyImportPreview();
  return 'Review the week in the window that opened, then Confirm & Save.';
}

async function duImportPea(file){
  const before = (peaRatings.uploads || []).length;
  const beforeLast = (peaRatings.uploads || [])[before - 1];
  await peaHandleUpload(file);
  const up = (peaRatings.uploads || []).slice(-1)[0];
  if(!up || up === beforeLast) throw new Error(document.getElementById('peaUploadStatus').textContent || 'PEA upload failed.');
  return `${up.read} ratings read · ${up.added} new${up.rangeStart ? ` · ${duShort(up.rangeStart)}–${duShort(up.rangeEnd)}` : ''} (${(up.areas || []).join(', ')})`;
}

// Safeguard against the same file going to two days: before saving, compare
// the counts with the days saved within two weeks of it (a handful of small
// entries, so it costs nothing). Files uploaded together are saved one at a
// time, so they're checked against each other too.
const DU_SM_TWIN_DAYS = 14;
function duSalesMixTwin(items, iso){
  const key = JSON.stringify(Object.keys(items || {}).sort().map(n => [n, items[n]]));
  const day = new Date(iso + 'T00:00:00');
  return (prepSoldEntries || []).find(e => e.date && e.date !== iso
    && Math.abs(new Date(e.date + 'T00:00:00') - day) <= DU_SM_TWIN_DAYS * 86400000
    && JSON.stringify(Object.keys(e.items || {}).sort().map(n => [n, e.items[n]])) === key) || null;
}

// A Sales Mix report is one business day. The day comes from the file name
// (…_2026-09-19.csv); without one the file waits for the leader to pick it.
// Rejects with err.twin when the counts match another recent day, unless
// `force` (the leader chose "Save anyway").
function duImportSalesMix(file, iso, force){
  return new Promise((resolve, reject)=>{
    pbReadWorkbookRows(file, async (err, rows)=>{
      if(err || !rows || !rows.length) return reject(new Error('Couldn’t read that file.'));
      const parsed = pbRowsToDateEntries(rows, iso);
      if(!Object.keys(parsed.byDate).length) return reject(new Error('No prep items found in it.'));
      const twin = force ? null : duSalesMixTwin(parsed.byDate[iso], iso);
      if(twin){
        const dup = new Error(`Identical to ${duLongDay(twin.date)}`);
        dup.twin = twin;
        return reject(dup);
      }
      const result = pbAddDatedEntries(prepSoldEntries, parsed.byDate, 'import');
      // Keep the file name on the day so Verify can catch a file saved to
      // the wrong day.
      prepSoldEntries.forEach(e => { if(result.ids.includes(e.id)) e.file = file.name; });
      duRecord('salesMix', {file: file.name, summary: `${duShort(iso)} · ${result.items} prep items`});
      await saveState();
      if(typeof renderPrepBoard === 'function') renderPrepBoard();
      resolve(`${duShort(iso)} · ${result.items} prep items sold${result.replaced ? ' (replaced that day)' : ''} → Prep Board`);
    });
  });
}

// Tab-separated rows; quoted cells can hold line breaks (Tableau exports).
function duParseTsv(text){
  const rows = [];
  let row = [], field = '', q = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(q){
      if(c === '"'){ if(text[i + 1] === '"'){ field += '"'; i++; } else q = false; }
      else field += c;
    } else if(c === '"') q = true;
    else if(c === '\t'){ row.push(field); field = ''; }
    else if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
    else if(c !== '\r') field += c;
  }
  if(field || row.length){ row.push(field); rows.push(row); }
  return rows;
}

function duHourToMin(label){
  const m = String(label).trim().match(/^(\d{1,2})\s*(AM|PM)$/i);
  if(!m) return null;
  let h = parseInt(m[1], 10) % 12;
  if(/pm/i.test(m[2])) h += 12;
  return h * 60;
}

const duNum = v => { const n = parseFloat(String(v).replace(/[$,\s]/g, '')); return isNaN(n) ? null : n; };

// Total | Daypart | Productivity export → one profile per weekday: for each
// hour, sales per labor hour, labor hours, and (from the Sales/Transactions
// variant) average sales per day.
// Weekday the export was filtered to ("…time of day for Tuesday"), if any.
function duProductivityDay(text){
  const m = text.match(/time of day for (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i);
  return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : null;
}

async function duImportProductivity(file, text, dayChoice){
  const rows = duParseTsv(text.replace(/^\uFEFF/, ''));
  const header = rows[0].map(h => h.trim());
  const hourCol = header.findIndex(h => /Daypart Hours Swap/i.test(h));
  const valCol = header.length - 1, nameCol = header.length - 2;
  if(hourCol === -1) throw new Error('This productivity export doesn’t have the hour column it should.');
  const day = dayChoice || duProductivityDay(text) || 'All';
  const hours = {};
  rows.slice(1).forEach(r=>{
    const h = duHourToMin(r[hourCol]);
    if(h === null) return;
    const name = String(r[nameCol] || '').trim(), v = duNum(r[valCol]);
    if(v === null) return;
    const rec = hours[h] = hours[h] || {};
    if(/^Value: Sales \| Transactions Productivity/i.test(name)) rec.prod = v;
    else if(/Timekeeping Hours/i.test(name)) rec.labor = v;
    else if(/COUNTD\(\[business_date\]\)/i.test(name)) rec.salesPerDay = v;
  });
  // Label: $ column carries the productivity value when a row has no
  // "Value:" measure (Sales/Transactions export).
  if(!Object.values(hours).some(r => r.prod != null)){
    const prodCol = header.findIndex(h => /^Label: Sales \| Transactions Productivity$/i.test(h));
    if(prodCol !== -1) rows.slice(1).forEach(r => { const h = duHourToMin(r[hourCol]); const v = duNum(r[prodCol]); if(h !== null && v !== null) (hours[h] = hours[h] || {}).prod = v; });
  }
  const n = Object.keys(hours).length;
  if(!n) throw new Error('No hourly numbers found in this productivity export.');
  const prev = productivityProfiles[day] || {};
  const merged = {};
  new Set([...Object.keys(prev.hours || {}), ...Object.keys(hours)]).forEach(h => { merged[h] = {...((prev.hours || {})[h] || {}), ...(hours[h] || {})}; });
  productivityProfiles[day] = {hours: merged, file: file.name, at: new Date().toISOString()};
  duRecord('productivity', {file: file.name, summary: `${day} · ${n} hours`});
  await saveState();
  breakPlanReset();
  const peak = Object.entries(merged).filter(([, r]) => r.prod != null).sort((a, b) => b[1].prod - a[1].prod)[0];
  return `${day === 'All' ? 'All days' : day} · ${n} hours${peak ? ` · busiest hour ${suClock(+peak[0])}` : ''} → break planner`;
}

// `hint`: the report row the files were uploaded from. A file that's
// clearly something else is still filed where it belongs.
async function duHandleFiles(fileList, hint){
  let files = Array.from(fileList || []);
  if(!files.length) return;
  // A bundle zip (the schedule build's reports, upload-bundle.js): its files,
  // each filed as if it had been dropped on its own.
  const fromBundle = new Set();
  let bundleName = '';
  if(typeof duOpenBundle === 'function' && files.some(f => /\.zip$/i.test(f.name))){
    const out = [];
    for(const f of files){
      if(!/\.zip$/i.test(f.name)){ out.push(f); continue; }
      let inner = null;
      try{ inner = await duOpenBundle(f); }
      catch(err){ duResults = [{file: f.name, state: 'error', text: err.message}]; renderDataUploads(); showToast(err.message); return; }
      if(!inner){ out.push(f); continue; }
      inner.forEach(x => { fromBundle.add(x); out.push(x); });
      bundleName = f.name;
    }
    files = out;
  }
  duResults = files.map(f => ({file: f.name, state: 'working', text: 'Reading…'}));
  renderDataUploads();
  // CEM files first so the scoreboard ends on the newest month; 15-minute
  // sales after the PDFs whose daily sales date them; the roster last
  // because it opens a review window.
  const order = {cem: 0, pea: 1, salesMix: 2, numbers: 2, sales: 2, labor: 2, dtRank: 2, sos: 2, dayparts: 2, punch: 2, opsPdf: 2, productivity: 3, salesQuarter: 3, roster: 4};
  const jobs = [];
  for(let i = 0; i < files.length; i++){
    const file = files[i];
    if(fromBundle.has(file) && /\.(png|jpe?g|webp)$/i.test(file.name)){
      duResults[i] = {file: file.name, state: 'waiting', kind: 'Picture', text: 'If it’s the month’s marketing calendar, read it into Events. The reader shows what it found before anything is added.', action: {key: duBundleImage(file), label: 'Read into Events'}};
      continue;
    }
    try{
      const isPdf = /\.(pdf|zip)$/i.test(file.name);
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const buffer = isPdf ? null : await duReadFile(file, true);
      const text = buffer && !isExcel ? pbDecodeText(buffer) : '';
      if(isExcel) await xlsxReady();
      const workbook = isExcel ? XLSX.read(new Uint8Array(buffer), {type: 'array'}) : null;
      const aside = fromBundle.has(file) ? duScheduleOnly(file, text) : null;
      if(aside){ duResults[i] = {file: file.name, state: 'skip', kind: aside.skip, text: aside.why}; continue; }
      jobs.push({i, file, kind: hint === 'punch' ? 'punch' : (duDetect(file, text, workbook) || hint || null), text, buffer});
    }catch(err){
      duResults[i] = {file: file.name, state: 'error', text: err.message};
    }
  }
  // Rosters in week order, so their reviews open earliest week first.
  jobs.sort((a, b) => ((order[a.kind] ?? 9) - (order[b.kind] ?? 9)) || (a.kind === 'roster' && b.kind === 'roster' ? String(weeklyRosterStartFromFileName(a.file.name) || '').localeCompare(String(weeklyRosterStartFromFileName(b.file.name) || '')) : 0));
  const quarterDays = new Set();   // days the 15-minute files in this upload were matched to
  for(const job of jobs){
    const src = DU_SOURCES.find(s => s.key === job.kind);
    try{
      let text;
      if(job.kind === 'cem') text = await duImportCem(job.file, job.text, job.buffer);
      else if(job.kind === 'pea') text = await duImportPea(job.file);
      else if(job.kind === 'salesMix'){
        const iso = pbDateFromFileName(job.file.name);
        if(!iso){ duWait(job, 'date'); continue; }
        try{ text = await duImportSalesMix(job.file, iso); }
        catch(err){ if(!err.twin) throw err; duWaitTwin(job.i, job.file, iso, err.twin); continue; }
      }
      else if(job.kind === 'roster'){
        if(fromBundle.has(job.file) && duRosterWeekOver(job.file)){
          duResults[job.i] = {file: job.file.name, state: 'skip', kind: 'HotSchedules weekly roster', text: 'That week is over; nothing to update.'};
          continue;
        }
        // One review at a time: the next roster opens when this one is saved or
        // skipped; one waiting its turn can be skipped from here.
        const kind = src ? src.name : 'HotSchedules weekly roster';
        if(duRosterReviewOpen()){
          duRosterQueue.push({file: job.file, text: job.text, i: job.i});
          if(typeof weeklyImportSyncQueue === 'function') weeklyImportSyncQueue();   // the open review counts it
          duResults[job.i] = {file: job.file.name, state: 'waiting', kind, text: 'Waiting its turn: opens after the week before it is saved or skipped.', action: {skipRoster: true, key: String(job.i), label: 'Skip this roster'}};
        } else {
          duResults[job.i] = {file: job.file.name, state: 'waiting', kind, text: ''};
          duOpenRoster(job);
        }
        continue;
      }
      else if(job.kind === 'numbers') text = await knImportFile(job.file);
      else if(job.kind === 'sales') text = await rpImportSales(job.file, job.text);
      else if(job.kind === 'dayparts') text = await fcImportDaypartWeek(job.file, job.text);
      else if(job.kind === 'labor') text = await fcImportLaborFile(job.file, job.text, job.buffer);
      else if(job.kind === 'sos'){
        try{ text = await rpImportSos(job.file, job.text); }
        catch(err){
          if(!err.needRange) throw err;
          duPending.push({id: ++duPendingSeq, kind: 'sos', need: 'range', file: job.file, text: job.text});
          duResults[job.i] = {file: job.file.name, state: 'waiting', kind: 'Speed of service (Analytics Hub)', text: err.message};
          renderDataUploads();
          continue;
        }
      }
      else if(job.kind === 'dtRank'){
        const d = rpParseDtRank(job.text);
        if(d.count >= RP_DT_CHAIN_MIN) text = await rpImportDtRank(job.file, job.text, 'chain');
        else { duWait(job, 'dtGroup'); continue; }
      }
      else if(job.kind === 'punch') text = await kaImportPunchReport(job.file);
      else if(job.kind === 'salesQuarter'){
        try{
          text = await anFileQuarter(job.file, job.text, null, quarterDays);
        }
        catch(err){
          if(!err.waiting) throw err;
          // Which day it is: picked in the daypart row, with the likely day first.
          duPending.push({id: ++duPendingSeq, kind: 'dayparts', need: 'date', file: job.file, text: job.text, total: err.total, suggestFrom: quarterDays});
          duResults[job.i] = {file: job.file.name, state: 'waiting', kind: '15-minute sales (Analytics Hub)', text: err.message};
          renderDataUploads();
          continue;
        }
      }
      else if(job.kind === 'opsPdf'){
        // The Analytics Hub dashboard PDFs in the schedule bundle (analytics-reports.js).
        const dash = typeof anIsDashboardPdf === 'function' && anIsDashboardPdf(job.file.name) ? await anReadPdf(job.file) : null;
        // A punch report under another name: read it first (kn-actuals.js).
        const punch = !dash && /\.pdf$/i.test(job.file.name) ? await duTryPunch(job.file) : null;
        if(dash && dash.kind === 'dailyDetail'){ job.kind = 'labor'; text = await anFileDailyDetail(job.file, dash.rows); }
        else if(dash && ['productivity', 'laborCost', 'salesCurve'].includes(dash.kind)){ job.kind = 'productivity'; text = await anFileDashboard(job.file, dash); }
        else if(dash && dash.kind === 'salesData'){ job.kind = 'sales'; text = await rpFileSales(job.file, dash.sales); }
        else if(punch){ job.kind = 'punch'; text = await kaImportPunchReport(job.file, punch); }
        else {
        const report = await rpImportOpsPdf(job.file);
        if(report === null){
          if(/\.zip$/i.test(job.file.name)) throw new Error('No Smart Shop, food safety or QIV report in this zip.');
          const asked = ['smartShop', 'foodSafety', 'qiv'].includes(hint) ? DU_SOURCES.find(s => s.key === hint) : null;
          if(asked) throw new Error(`Couldn’t read this as ${asked.name.replace(/ \(Ops Hub\)$/, '')} — it isn’t the report Ops Hub gives for it. ${asked.how}`);
          job.kind = 'pea';
          text = await duImportPea(job.file);
        } else {
          text = report.text;
          job.kind = report.kind;
        }
        }
      }
      else if(job.kind === 'productivity'){
        if(!duProductivityDay(job.text)){ duWait(job, 'weekday'); continue; }
        text = await duImportProductivity(job.file, job.text);
      }
      else throw new Error('Didn’t recognize this file. Expected a CEM Comparison Report, HotSchedules roster CSV, Levelset PEA PDF, Sales Mix report, productivity report, projected sales & productivity goals, an Analytics Hub sales, labor, rankings or speed of service export, or an Ops Hub Smart Shop, food safety or QIV report.');
      const filed = DU_SOURCES.find(s => s.key === job.kind) || (job.kind === 'opsPdf' ? {name: 'Ops Hub report'} : job.kind === 'salesQuarter' ? {name: '15-minute sales (Analytics Hub)'} : null);
      duResults[job.i] = {file: job.file.name, state: 'ok', kind: filed ? filed.name : job.kind, text};
    }catch(err){
      duResults[job.i] = {file: job.file.name, state: 'error', kind: src ? src.name : '', text: err.message};
    }
    renderDataUploads();
  }
  renderDataUploads();
  const ok = duResults.filter(r => r.state === 'ok').length;
  const aside = duResults.filter(r => r.state === 'skip').length;
  if(bundleName){
    const pics = duResults.filter(r => r.action).length;
    showToast(`${duBundleBaseName(bundleName)}: ${ok} filed${aside ? ` · ${aside} set aside` : ''}${pics ? ` · ${pics} picture${pics === 1 ? '' : 's'} to check` : ''}`);
    return;
  }
  const twins = duResults.filter(r => r.state === 'waiting' && /^Not saved yet — identical/.test(r.text)).length;
  const waiting = duResults.filter(r => r.state === 'waiting').length - twins;
  if(twins) showToast(`⚠ ${twins} file${twins === 1 ? ' matches' : 's match'} another day’s counts — not saved. Check Data Uploads.`);
  else showToast(waiting ? `${waiting} file${waiting === 1 ? '' : 's'} need${waiting === 1 ? 's' : ''} a day — pick it in Data Uploads` : ok === files.length ? `✓ ${ok} file${ok === 1 ? '' : 's'} filed` : `${ok} of ${files.length} files filed — see Data Uploads`);
}

// A PDF read as a punch report (Actual vs. Scheduled), or null if it isn't one.
async function duTryPunch(file){
  if(typeof ptReadPdf !== 'function' || typeof APS === 'undefined') return null;
  try{
    const parsed = APS.parseReport(await ptReadPdf(file));
    return parsed && parsed.shifts && parsed.shifts.length ? parsed : null;
  }catch(e){ return null; }
}

// Hold a Sales Mix file whose counts match another recent day, until the
// leader says save it anyway or skip it.
function duWaitTwin(resultIndex, file, iso, twin){
  duPending.push({id: ++duPendingSeq, kind: 'salesMix', need: 'twin', file, iso, twin: {date: twin.date, file: twin.file || ''}});
  const r = {file: file.name, state: 'waiting', kind: 'Sales Mix (items sold)', text: `Not saved yet — identical to ${duLongDay(twin.date)}. Check it below.`};
  if(resultIndex !== null && resultIndex !== undefined) duResults[resultIndex] = r;
  else {
    const i = duResults.findIndex(x => x.file === file.name);
    if(i === -1) duResults.push(r); else duResults[i] = r;
  }
}

// Park a file that needs a day (Sales Mix) or weekday (productivity).
function duWait(job, need){
  duPending.push({id: ++duPendingSeq, kind: job.kind, need, file: job.file, text: job.text});
  const src = DU_SOURCES.find(s => s.key === job.kind);
  duResults[job.i] = {file: job.file.name, state: 'waiting', kind: src ? src.name : job.kind, text: need === 'date' ? 'No date in this file: pick the day below.' : need === 'dtGroup' ? 'Which ranking is this? Pick Region, Market, State or Chain below.' : 'No weekday in this export: pick it below.'};
}

async function duResolvePending(id, value){
  const item = duPending.find(p => p.id === id);
  if(!item) return;
  duPending = duPending.filter(p => p !== item);
  const r = duResults.find(x => x.file === item.file.name && x.state === 'waiting');
  const src = DU_SOURCES.find(s => s.key === item.kind);
  try{
    let text;
    if(item.kind === 'salesMix'){
      const force = item.need === 'twin';
      const iso = force ? item.iso : value;
      try{ text = await duImportSalesMix(item.file, iso, force); }
      catch(err){ if(!err.twin) throw err; duWaitTwin(null, item.file, iso, err.twin); renderDataUploads(); return; }
    } else if(item.kind === 'dtRank'){
      text = await rpImportDtRank(item.file, item.text, value);
    } else if(item.kind === 'sos'){
      const [from, to] = String(value).split('|');
      text = await rpImportSos(item.file, item.text, {from, to});
    } else if(item.kind === 'dayparts'){
      text = await anFileQuarter(item.file, item.text, value);
    } else {
      text = await duImportProductivity(item.file, item.text, value);
    }
    if(r) Object.assign(r, {state: 'ok', text});
    else duResults.push({file: item.file.name, state: 'ok', kind: src ? src.name : item.kind, text});
    showToast(`✓ ${item.file.name} filed`);
  }catch(err){
    if(r) Object.assign(r, {state: 'error', text: err.message});
  }
  renderDataUploads();
}

// The day picker for a waiting Sales Mix file: the last week's open days as
// one-tap chips (yesterday first), plus a calendar for anything older.
function duPendingHtml(item, underFile){
  const name = underFile ? '' : `<div class="du-pending-file">${escapeHtml(item.file.name)}</div>`;
  if(item.need === 'twin'){
    return `<div class="du-pending is-twin">${name}
      <div class="du-pending-q">⚠ Identical to ${escapeHtml(duLongDay(item.twin.date))}${item.twin.file ? ` (${escapeHtml(item.twin.file)})` : ''}</div>
      <p class="du-pending-note">Every count matches that day, so this is probably the same report uploaded twice. Nothing has been saved for ${escapeHtml(duLongDay(item.iso))} yet.</p>
      <div class="du-pending-row">
        <button type="button" class="du-chip is-wide" data-du-pending="${item.id}" data-du-value="force">Save to ${escapeHtml(duLongDay(item.iso))} anyway</button>
        <button type="button" class="du-pending-skip" data-du-pending-skip="${item.id}">Skip this file</button>
      </div>
    </div>`;
  }
  if(item.need === 'range'){
    // The dates a Custom by Hour export covers: this month so far, last
    // month, or any range.
    const t0 = duStartOfDay(new Date()), y = duAddDays(t0, -1);
    const mtd = [duISO(new Date(y.getFullYear(), y.getMonth(), 1)), duISO(y)];
    const last = [duISO(new Date(t0.getFullYear(), t0.getMonth() - 1, 1)), duISO(new Date(t0.getFullYear(), t0.getMonth(), 0))];
    const chip = ([a, b], label) => `<button type="button" class="du-chip is-wide" data-du-pending="${item.id}" data-du-value="${a}|${b}"><span>${label}</span><b>${escapeHtml(rpRange(a, b))}</b></button>`;
    return `<div class="du-pending">${name}
      <div class="du-pending-q">Which dates did you export?</div>
      <div class="du-chips">${chip(mtd, 'This month so far')}${chip(last, 'Last month')}</div>
      <div class="du-pending-row du-range">
        <label class="du-date-other">From <input type="date" max="${duISO(y)}" data-du-range-from="${item.id}"></label>
        <label class="du-date-other">To <input type="date" max="${duISO(y)}" data-du-range-to="${item.id}"></label>
        <button type="button" class="du-chip" data-du-range-save="${item.id}">Use these dates</button>
        <button type="button" class="du-pending-skip" data-du-pending-skip="${item.id}">Skip</button>
      </div>
    </div>`;
  }
  if(item.need === 'dtGroup'){
    let rank = '';
    try{ const d = rpParseDtRank(item.text); rank = ` (rank #${d.rank}${d.count ? ` of ${d.count.toLocaleString('en-US')}` : ''}, composite ${d.composite})`; }catch(e){}
    return `<div class="du-pending">${name}
      <div class="du-pending-q">Which comparison group was this ranking${escapeHtml(rank)} filtered to?</div>
      <div class="du-chips">${Object.entries(RP_DT_GROUPS).map(([k, v]) => `<button type="button" class="du-chip" data-du-pending="${item.id}" data-du-value="${k}">${v}</button>`).join('')}</div>
      <button type="button" class="du-pending-skip" data-du-pending-skip="${item.id}">Skip this file</button>
    </div>`;
  }
  if(item.need === 'weekday' && item.choices){
    return `<div class="du-pending">${name}
      <div class="du-pending-q">The report says ${escapeHtml(item.choices[1])}. Which day is it?</div>
      <div class="du-chips">${item.choices.map((d, i) => `<button type="button" class="du-chip is-wide" data-du-pending="${item.id}" data-du-value="${d}"><span>${i ? 'The report' : 'Day you tapped'}</span><b>${d}</b></button>`).join('')}</div>
      <button type="button" class="du-pending-skip" data-du-pending-skip="${item.id}">Skip</button>
    </div>`;
  }
  if(item.need === 'weekday'){
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `<div class="du-pending">${name}
      <div class="du-pending-q">Which day of the week is this report for?</div>
      <div class="du-chips">${days.map(d => `<button type="button" class="du-chip" data-du-pending="${item.id}" data-du-value="${d}">${d.slice(0, 3)}</button>`).join('')}<button type="button" class="du-chip" data-du-pending="${item.id}" data-du-value="All">All days</button></div>
      <button type="button" class="du-pending-skip" data-du-pending-skip="${item.id}">Skip this file</button>
    </div>`;
  }
  if(item.choices){
    // Tapped a day on the calendar, but the file name says another day.
    return `<div class="du-pending">${name}
      <div class="du-pending-q">The file name says ${escapeHtml(duLongDay(item.choices[1]))}. Which day is it?</div>
      <div class="du-chips">${item.choices.map((iso, i) => `<button type="button" class="du-chip is-wide" data-du-pending="${item.id}" data-du-value="${iso}"><span>${i ? 'File name' : 'Day you tapped'}</span><b>${escapeHtml(duLongDay(iso))}</b></button>`).join('')}</div>
      <button type="button" class="du-pending-skip" data-du-pending-skip="${item.id}">Skip</button>
    </div>`;
  }
  const today0 = duStartOfDay(new Date());
  // The last six open days (closed Sundays), newest first.
  const days = [];
  for(let n = 1; days.length < 6 && n < 14; n++){ const d = duAddDays(today0, -n); if(d.getDay() !== 0) days.push({n, d}); }
  const suggest = item.suggestFrom && typeof anQuarterSuggest === 'function' ? anQuarterSuggest(item.suggestFrom) : null;
  const chips = (suggest ? `<button type="button" class="du-chip is-wide is-suggest" data-du-pending="${item.id}" data-du-value="${suggest}"><span>Likely: next after the other files</span><b>${escapeHtml(duLongDay(suggest))}</b></button>` : '') + days.filter(({d}) => duISO(d) !== suggest).map(({n, d})=>{
    const top = n === 1 ? 'Yesterday' : d.toLocaleDateString('en-US', {weekday: 'short'});
    return `<button type="button" class="du-chip" data-du-pending="${item.id}" data-du-value="${duISO(d)}"><span>${top}</span><b>${d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}</b></button>`;
  }).join('');
  return `<div class="du-pending">${name}
    <div class="du-pending-q">What day are these sales from?${item.total ? ` <span class="du-pending-sub">Day total ${escapeHtml(fcMoney(item.total))}</span>` : ''}</div>
    <div class="du-chips is-days">${chips}</div>
    <div class="du-pending-row">
      <label class="du-date-other">Another day <input type="date" max="${duISO(duAddDays(today0, -1))}" data-du-pending-date="${item.id}"></label>
      <button type="button" class="du-pending-skip" data-du-pending-skip="${item.id}">Skip</button>
    </div>
  </div>`;
}

// ----- Sales Mix: which days are saved, and a check of each -----
// A calendar of the last five weeks (Mon–Sat; closed Sundays): saved days
// shaded, missing days highlighted and tappable to upload that day. Tapping a
// saved day shows what was saved so a leader can verify it, with checks for
// the usual mistakes: the same file saved to two days, a file saved to a day
// other than the one in its name, and a total far from that weekday's norm.

const DU_SM_WEEKS = 5;
let duSmOpen = null;        // ISO date whose saved data is showing
let duSmUploadFor = null;   // ISO date a calendar tap is uploading to

function duLongDay(iso){
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
}

function duSmTotal(e){ return Object.values(e.items || {}).reduce((a, b) => a + (+b || 0), 0); }

// {iso: [reason, ...]} for saved days that look wrong.
function duSalesMixFlags(){
  const dated = (prepSoldEntries || []).filter(e => e.date);
  const flags = {};
  const add = (iso, text) => { (flags[iso] = flags[iso] || []).push(text); };
  const byCounts = {};
  dated.forEach(e=>{
    const k = JSON.stringify(Object.keys(e.items || {}).sort().map(n => [n, e.items[n]]));
    (byCounts[k] = byCounts[k] || []).push(e.date);
  });
  Object.values(byCounts).filter(ds => ds.length > 1).forEach(ds => ds.forEach(iso => add(iso, `Same counts as ${ds.filter(d => d !== iso).map(duLongDay).join(', ')} — the same file may have been saved to both days.`)));
  dated.forEach(e=>{
    const named = e.file ? pbDateFromFileName(e.file) : null;
    if(named && named !== e.date) add(e.date, `Saved to ${duLongDay(e.date)}, but the file name says ${duLongDay(named)}.`);
    const wd = new Date(e.date + 'T00:00:00').getDay();
    const peers = dated.filter(o => o !== e && new Date(o.date + 'T00:00:00').getDay() === wd).map(duSmTotal).sort((a, b) => a - b);
    if(peers.length >= 2){
      const med = peers[Math.floor(peers.length / 2)];
      const tot = duSmTotal(e);
      if(med > 0 && (tot < med * 0.5 || tot > med * 1.8)){
        add(e.date, `${tot} items sold vs about ${med} on a usual ${new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'long'})} — check it’s the right day’s report.`);
      }
    }
  });
  return flags;
}

function duSalesMixCalendarHtml(){
  const today0 = duStartOfDay(new Date());
  const start = duAddDays(duMonday(today0), -7 * (DU_SM_WEEKS - 1));
  const byDate = {};
  (prepSoldEntries || []).forEach(e => { if(e.date) byDate[e.date] = e; });
  const flags = duSalesMixFlags();
  const missing = [];
  let saved = 0, expected = 0;
  const weeks = [];
  for(let w = 0; w < DU_SM_WEEKS; w++){
    const cells = [];
    for(let i = 0; i < 6; i++){
      const d = duAddDays(start, w * 7 + i);
      const iso = duISO(d);
      const past = d < today0;
      const has = !!byDate[iso];
      const flag = has && flags[iso];
      if(past){ expected++; if(has) saved++; else missing.push(iso); }
      const state = has ? (flag ? 'is-flag' : 'is-has') : past ? 'is-missing' : 'is-future';
      const label = `${duLongDay(iso)}: ${has ? (flag ? 'saved — check it' : 'saved') : past ? 'missing — tap to upload' : 'not yet'}`;
      cells.push(`<button type="button" class="du-cal-day ${state} ${duSmOpen === iso ? 'is-open' : ''}" ${past || has ? `data-du-sm-day="${iso}"` : 'disabled'} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><span>${d.getDate()}</span><i aria-hidden="true">${has ? (flag ? '!' : '✓') : past ? '+' : ''}</i></button>`);
    }
    // Month label on the first row and on the row where a new month starts.
    const firstOfMonth = [0, 1, 2, 3, 4, 5].map(i => duAddDays(start, w * 7 + i)).find(d => d.getDate() === 1);
    const monthDay = w === 0 ? duAddDays(start, 0) : firstOfMonth;
    weeks.push(`<div class="du-cal-week"><span class="du-cal-month">${monthDay ? monthDay.toLocaleDateString('en-US', {month: 'short'}) : ''}</span>${cells.join('')}</div>`);
  }
  const flagged = Object.keys(flags).filter(iso => byDate[iso] && iso >= duISO(start));
  const detail = duSmOpen && byDate[duSmOpen] ? duSalesMixDayHtml(byDate[duSmOpen], flags[duSmOpen] || []) : '';
  return `
    <div class="du-cal" aria-label="Sales Mix days saved">
      <div class="du-cal-sum">${saved} of ${expected} days saved in the last ${DU_SM_WEEKS} weeks${missing.length ? ` · <b>${missing.length} missing</b>` : ''}${flagged.length ? ` · <b class="is-flag">${flagged.length} to check</b>` : ''}</div>
      <div class="du-cal-head"><span></span>${['M', 'T', 'W', 'T', 'F', 'S'].map(x => `<span>${x}</span>`).join('')}</div>
      ${weeks.join('')}
      <div class="du-cal-legend"><span><i class="is-has">✓</i>saved</span><span><i class="is-flag">!</i>check</span><span><i class="is-missing">+</i>missing — tap to upload</span></div>
      <input type="file" accept=".csv,.xlsx,.xls,.txt" data-du-sm-file hidden>
      ${detail}
    </div>`;
}

function duSalesMixDayHtml(e, flags){
  const items = Object.entries(e.items || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const src = e.file ? `from ${e.file}` : e.source === 'manual' ? 'typed in on the Prep Board' : 'uploaded (file name not recorded)';
  return `
    <div class="du-day">
      <div class="du-day-head"><b>${escapeHtml(duLongDay(e.date))}</b><span>${escapeHtml(src)}</span></div>
      <div class="du-day-sum">${items.length} prep items · ${duSmTotal(e)} sold</div>
      ${flags.map(f => `<div class="du-day-flag">⚠ ${escapeHtml(f)}</div>`).join('')}
      <ul class="du-day-items">${items.map(([n, c]) => `<li><span>${escapeHtml(n)}</span><b>${c}</b></li>`).join('')}</ul>
      <div class="du-day-actions">
        <button type="button" class="du-chip is-wide" data-du-sm-replace="${escapeHtml(e.date)}">Replace this day’s file</button>
        <button type="button" class="du-pending-skip" data-du-sm-remove="${escapeHtml(e.date)}">Remove this day</button>
      </div>
    </div>`;
}

async function duSalesMixUploadFor(iso, file){
  const named = pbDateFromFileName(file.name);
  if(named && named !== iso){
    duPending.push({id: ++duPendingSeq, kind: 'salesMix', need: 'date', file, choices: [iso, named]});
    duResults = [{file: file.name, state: 'waiting', kind: 'Sales Mix (items sold)', text: `You tapped ${duLongDay(iso)}, but the file name says ${duLongDay(named)} — pick one below.`}];
    renderDataUploads();
    return;
  }
  try{
    let text;
    try{ text = await duImportSalesMix(file, iso); }
    catch(err){
      if(!err.twin) throw err;
      duResults = [];
      duWaitTwin(null, file, iso, err.twin);
      renderDataUploads();
      return;
    }
    duResults = [{file: file.name, state: 'ok', kind: 'Sales Mix (items sold)', text}];
    duSmOpen = iso;
    showToast(`✓ ${duLongDay(iso)} saved`);
  }catch(err){
    duResults = [{file: file.name, state: 'error', kind: 'Sales Mix (items sold)', text: err.message}];
  }
  renderDataUploads();
}

// ----- CEM: which months and breakdowns are saved -----
// One row per month (last six), one square per export: the store total
// ("Overall", in every export), by Time of Day, and by Day of Visit. Tap a
// saved square to see the scores that were saved; tap a missing one to upload.

const DU_CEM_MONTHS = 6;
const DU_CEM_DIMS = [{key: 'total', label: 'Overall'}, {key: 'daypart', label: 'Time of Day'}, {key: 'dow', label: 'Day of Visit'}];
let duCemOpen = null;   // 'YYYY-MM::dimension'

function duCemGridHtml(){
  const now = new Date();
  const months = [];
  for(let i = DU_CEM_MONTHS - 1; i >= 0; i--){
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-US', {month: 'short', year: '2-digit'}).replace(' ', " '"), current: i === 0});
  }
  const rows = months.map(m=>{
    const entries = ctEntriesForPeriod(m.key);
    const total = entries.find(e => e.dimension === 'total');
    const period = ctPeriods().find(p => p.periodKey === m.key);
    const through = period && period.periodEnd && m.current ? `thru ${new Date(period.periodEnd + 'T00:00:00').getDate()}` : '';
    const cells = DU_CEM_DIMS.map(dim=>{
      const has = entries.some(e => e.dimension === dim.key);
      const id = `${m.key}::${dim.key}`;
      const sub = has ? (dim.key === 'total' && total && total.n ? `${total.n} surveys` : '✓') : '+';
      return `<button type="button" class="du-cal-day du-grid-cell ${has ? 'is-has' : 'is-missing'} ${duCemOpen === id ? 'is-open' : ''}" data-du-cem-cell="${id}" aria-label="${escapeHtml(`${m.label} ${dim.label}: ${has ? 'saved' : 'missing — tap to upload'}`)}"><i>${escapeHtml(sub)}</i></button>`;
    }).join('');
    return `<div class="du-grid-row"><span class="du-grid-label">${escapeHtml(m.label)}${through ? `<small>${through}</small>` : ''}</span>${cells}</div>`;
  }).join('');
  const others = ctPeriods().filter(p => p.periodType !== 'month');
  let detail = '';
  if(duCemOpen){
    const [key, dim] = duCemOpen.split('::');
    const entries = ctEntriesForPeriod(key).filter(e => e.dimension === dim);
    if(entries.length) detail = duCemDetailHtml(key, dim, entries);
  }
  return `
    <div class="du-cal">
      <div class="du-grid-head"><span></span>${DU_CEM_DIMS.map(d => `<span>${d.label}</span>`).join('')}</div>
      ${rows}
      ${others.length ? `<div class="du-cal-sum" style="margin:8px 0 0">Other periods: ${others.map(p => escapeHtml(p.periodLabel)).join(' · ')}</div>` : ''}
      <div class="du-cal-legend"><span><i class="is-has">✓</i>saved (tap to check)</span><span><i class="is-missing">+</i>missing — tap to upload</span></div>
      <input type="file" accept=".csv,.xlsx,.xls" multiple data-du-cem-file hidden>
      ${detail}
    </div>`;
}

function duCemDetailHtml(key, dim, entries){
  const order = dim === 'daypart' ? CT_DAYPART_ORDER : dim === 'dow' ? CT_DOW_ORDER : ['Overall'];
  entries = entries.slice().sort((a, b) => order.indexOf(a.segment) - order.indexOf(b.segment));
  const period = ctPeriods().find(p => p.periodKey === key);
  const head = `<tr><th></th>${CT_METRICS.map(m => `<th>${escapeHtml(m.short)}</th>`).join('')}<th>n</th></tr>`;
  const body = entries.map(e => `<tr><td>${escapeHtml(e.segment)}</td>${CT_METRICS.map(m => `<td>${e.scores[m.key] != null ? Math.round(e.scores[m.key]) : '—'}</td>`).join('')}<td>${e.n ?? '—'}</td></tr>`).join('');
  return `
    <div class="du-day">
      <div class="du-day-head"><b>${escapeHtml(period ? period.periodLabel : key)}</b><span>${escapeHtml(DU_CEM_DIMS.find(d => d.key === dim).label)}</span></div>
      <div class="du-table-wrap"><table class="du-table">${head}${body}</table></div>
      <div class="du-day-sum">Scores are % of guests who gave the top score. Compare with the CEM report you exported.</div>
    </div>`;
}

// ----- Productivity: which weekdays have a report -----
// Mon–Sat squares. A missing weekday borrows the closest one's hours. Tap a
// saved day to see its hours (busiest shaded darker); tap a missing day to
// upload that weekday's export.

const DU_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
let duProdOpen = null;       // weekday showing its hours
let duProdUploadFor = null;  // weekday a tap is uploading to

function duProdGridHtml(){
  const profiles = productivityProfiles || {};
  const cells = DU_WEEKDAYS.map(day=>{
    const has = !!profiles[day];
    const at = has ? new Date(profiles[day].at).toLocaleDateString('en-US', {month: 'numeric', day: 'numeric'}) : '';
    return `<button type="button" class="du-cal-day ${has ? 'is-has' : 'is-missing'} ${duProdOpen === day ? 'is-open' : ''}" data-du-prod-day="${day}" aria-label="${escapeHtml(`${day}: ${has ? `report saved ${at}` : 'missing — tap to upload'}`)}"><span>${day.slice(0, 3)}</span><i>${has ? escapeHtml(at) : '+'}</i></button>`;
  }).join('');
  const all = profiles.All ? `<div class="du-cal-sum" style="margin:8px 0 0">Also saved: an all-days report (used for any day without its own).</div>` : '';
  const detail = duProdOpen && profiles[duProdOpen] ? duProdDetailHtml(duProdOpen, profiles[duProdOpen]) : '';
  return `
    <div class="du-cal">
      <div class="du-prod-row">${cells}</div>
      ${all}
      <div class="du-cal-legend"><span><i class="is-has">✓</i>saved (date uploaded)</span><span><i class="is-missing">+</i>missing — borrows the closest day; tap to upload</span></div>
      <input type="file" accept=".csv,.txt" data-du-prod-file hidden>
      ${detail}
    </div>`;
}

function duProdDetailHtml(day, prof){
  const hours = Object.entries(prof.hours || {}).map(([h, v]) => [+h, v]).filter(([h, v]) => h >= 300 && h <= 1380 && v.prod != null).sort((a, b) => a[0] - b[0]);
  const max = Math.max(1, ...hours.map(([, v]) => v.prod));
  const bars = hours.map(([h, v]) => `<li><span>${suClock(h)}</span><div class="du-bar"><i style="width:${Math.round(v.prod / max * 100)}%;opacity:${(0.35 + 0.65 * v.prod / max).toFixed(2)}"></i></div><b>$${Math.round(v.prod)}</b></li>`).join('');
  return `
    <div class="du-day">
      <div class="du-day-head"><b>${escapeHtml(day)}</b><span>${escapeHtml(prof.file || '')}</span></div>
      <div class="du-day-sum">Sales per labor hour, by hour. The darker the bar, the busier — breaks stay out of those hours.</div>
      <ul class="du-bars">${bars}</ul>
    </div>`;
}

// Tapped a missing weekday: save the file as that day, unless the export
// names a different weekday — then ask which is right.
async function duProdUploadForDay(file, day){
  let text;
  try{ text = pbDecodeText(await duReadFile(file, true)); }
  catch(err){ duResults = [{file: file.name, state: 'error', text: err.message}]; renderDataUploads(); return; }
  const named = duProductivityDay(text);
  if(named && named !== day){
    duPending.push({id: ++duPendingSeq, kind: 'productivity', need: 'weekday', file, text, choices: [day, named]});
    duResults = [{file: file.name, state: 'waiting', kind: 'Productivity, labor cost & sales curve', text: `You tapped ${day}, but the report says ${named} — pick one below.`}];
  } else {
    try{
      const out = await duImportProductivity(file, text, day);
      duResults = [{file: file.name, state: 'ok', kind: 'Productivity by hour', text: out}];
      duProdOpen = day;
    }catch(err){ duResults = [{file: file.name, state: 'error', text: err.message}]; }
  }
  renderDataUploads();
}

// ----- Rendering -----

const DU_STATUS = {
  fresh: {label: 'Up to date', cls: 'is-fresh', icon: '✓'},
  due: {label: 'Due', cls: 'is-due', icon: '•'},
  overdue: {label: 'Overdue', cls: 'is-overdue', icon: '!'}
};

// ----- Restore from the backup -----
// When saving moved to sections (late September) the server kept a full copy
// of the data as it was then. If uploads from before that have since gone
// missing (an old tab saving its stale copy could do it, before old tabs
// were limited to adding), this finds them and puts them back. Checked once
// per visit to Manage, managers only.
let duBackup = null;          // what the backup has that's missing now
let duBackupChecked = false;

async function duCheckBackup(){
  if(duBackupChecked) return;
  duBackupChecked = true;
  try{
    const res = await fetch(`${API_BASE}/api/state/backup`, {method: 'POST'});
    if(!res.ok) return;
    const body = await res.json();
    if(!body.exists) return;
    const missing = duBackupMissing(body.data || {});
    if(missing.count){ duBackup = missing; renderDataUploads(); }
  }catch(e){ console.warn('Backup check failed:', e); }
}

function duBackupMissing(d){
  const out = {cem: [], salesMix: [], productivity: [], pea: [], log: d.dataUploadLog || {}, profiles: d.productivityProfiles || {}};
  const cemKeys = new Set(cemEntries.map(e => e.key));
  (Array.isArray(d.cemEntries) ? d.cemEntries : []).forEach(e => { if(e && e.key && !cemKeys.has(e.key)) out.cem.push(e); });
  const smDays = new Set(prepSoldEntries.map(e => e.date));
  (Array.isArray(d.prepSoldEntries) ? d.prepSoldEntries : []).forEach(e => { if(e && e.date && !smDays.has(e.date)) out.salesMix.push(e); });
  Object.keys(out.profiles).forEach(day => { if(!productivityProfiles[day]) out.productivity.push(day); });
  if(d.peaRatings && Array.isArray(d.peaRatings.rows)){
    const saved = new Set(peaAllRatings().map(r => peaRowKey(r.at, r.employee, r.leader, r.position, r.criteria)));
    out.pea = peaAllRatings(normalizePeaRatings(d.peaRatings)).filter(r => !saved.has(peaRowKey(r.at, r.employee, r.leader, r.position, r.criteria)));
  }
  out.count = out.cem.length + out.salesMix.length + out.productivity.length + out.pea.length;
  return out;
}

function duBackupSummary(b){
  const parts = [];
  if(b.cem.length){
    const dim = k => (DU_CEM_DIMS.find(x => x.key === k) || {label: k}).label;
    const groups = {};
    b.cem.forEach(e => { const g = `${e.periodLabel} (${dim(e.dimension)})`; groups[g] = (groups[g] || 0) + 1; });
    parts.push(`CEM: ${Object.keys(groups).join(', ')}`);
  }
  if(b.salesMix.length) parts.push(`Sales Mix: ${b.salesMix.map(e => duShort(e.date)).join(', ')}`);
  if(b.productivity.length) parts.push(`Productivity: ${b.productivity.join(', ')}`);
  if(b.pea.length) parts.push(`${b.pea.length} PEA rating${b.pea.length === 1 ? '' : 's'}`);
  return parts;
}

function duRestoreHtml(){
  if(!duBackup || !duBackup.count) return '';
  return `<div class="du-restore" role="status">
    <b>Found in the backup, missing now</b>
    <ul>${duBackupSummary(duBackup).map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
    <p>The server kept a full copy of the data when saving changed in late September. These uploads are in it but not in the saved data now — restoring adds them back and changes nothing else.</p>
    <button type="button" class="du-sync-btn" data-du-restore>Restore these</button>
  </div>`;
}

async function duRestoreBackup(){
  const b = duBackup;
  if(!b) return;
  if(b.cem.length){ cemEntries = ctMergeEntries(cemEntries, b.cem); cemSyncScoreboard(); }
  b.salesMix.forEach(e => prepSoldEntries.push(e));
  b.productivity.forEach(day => { productivityProfiles[day] = b.profiles[day]; });
  if(b.pea.length) peaMergeRatings(b.pea);
  // The upload history too, so each source's status reflects what's back.
  Object.entries(b.log).forEach(([key, list])=>{
    if(!Array.isArray(list)) return;
    const mine = dataUploadLog[key] = dataUploadLog[key] || [];
    const seen = new Set(mine.map(x => x.at));
    list.forEach(x => { if(x && x.at && !seen.has(x.at)) mine.push(x); });
    mine.sort((x, y) => String(x.at).localeCompare(String(y.at)));
    dataUploadLog[key] = mine.slice(-8);
  });
  const n = b.count;
  duBackup = null;
  await saveState();
  showToast(`✓ Restored ${n} item${n === 1 ? '' : 's'} from the backup`);
  renderDataUploads();
  if(typeof renderPeaManage === 'function') renderPeaManage();
  if(typeof renderGXScoreboard === 'function') renderGXScoreboard();
}

// PEA: sync straight from Levelset (pea-ratings.js); the PDF upload is the backup.
function duLevelsetHtml(){
  const last = typeof peaLastSync === 'function' ? peaLastSync() : null;
  const when = last ? new Date(last.at).toLocaleString('en-US', {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}) : '';
  const note = peaSyncUnavailable || (last ? `Last synced ${when} · ${last.read} ratings · ${last.added} new` : 'Pulls the last 90 days of FOH and BOH ratings. Runs on its own every 12 hours when a manager opens Manage.');
  return `<div class="du-sync">
    <button type="button" class="du-sync-btn" data-du-levelset ${peaSyncing ? 'disabled' : ''}>${peaSyncing ? 'Syncing…' : '⟳ Sync from Levelset'}</button>
    <span class="du-sync-note">${escapeHtml(note)}</span>
  </div>`;
}

// The tab (Tim, Oct 22 2026: elite, clear, easy, and worth opening): a
// header that says where things stand, one drop zone that takes the
// Schedule Builder's whole zip, what the last drop did (what needs a tap
// first), what the uploads say, then each report that needs an upload with
// what it feeds; the ones up to date fold into a short list.
let duShowAll = false;
let duDoneOpen = false;            // the up-to-date list, unfolded
let duCurrentKeys = [];            // the up-to-date reports, as last rendered
const duOpenRows = new Set();      // up-to-date rows opened in full
// Most-used first when several are due together.
const DU_PRIORITY = ['roster', 'punch', 'labor', 'salesMix', 'cem', 'dayparts', 'productivity', 'sales', 'numbers', 'pea', 'sos', 'dtRank', 'smartShop', 'foodSafety', 'qiv'];
// What one Schedule Builder zip brings in (upload-bundle.js, analytics-reports.js).
const DU_ZIP_COVERS = {roster: 'rosters', punch: 'punch report', labor: 'Daily Detail', sales: 'Sales Data', dayparts: '15-minute sales', productivity: 'productivity & labor PDFs'};

const DU_ICON = {
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0-5 5m5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5m0 3.5v.01M10.3 3.9 2.6 17.3A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.7L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19 9.5 12l4 3.5L20 6"/><path d="M15 6h5v5"/></svg>'
};

// What needs a look first: problems, then what's waiting on a tap, then
// what was filed; files set aside (a bundle's schedule-only reports) last.
function duResultsShown(){
  const rank = {error: 0, waiting: 1, working: 2, ok: 2, skip: 3};
  return duResults.map((r, i) => ({r, i})).sort((a, b) => ((rank[a.r.state] ?? 2) - (rank[b.r.state] ?? 2)) || a.i - b.i).map(x => x.r);
}
// A file waiting on a choice shows the choice right under it.
const duPendingFor = r => r.state === 'waiting' ? duPending.find(p => p.file && p.file.name === r.file) : null;
function duResultHtml(r){
  const pending = duPendingFor(r);
  return `<li class="du-result is-${r.state}"><b>${escapeHtml(String(r.file).replace(/^[0-9a-f]{8}-/i, ''))}</b>${r.kind ? ` <span>${escapeHtml(r.kind)}</span>` : ''}<div>${escapeHtml(r.text)}</div>${r.action ? `<button type="button" class="du-sync-btn du-result-act" ${r.action.skipRoster ? 'data-du-skip-roster' : 'data-du-evi'}="${escapeHtml(r.action.key)}">${escapeHtml(r.action.label)}</button>` : ''}${pending ? duPendingHtml(pending, true) : ''}</li>`;
}
// Choices not already shown with the last drop's results, for a report's row.
const duRowPending = key => duPending.filter(p => p.kind === key && !duResults.some(r => duPendingFor(r) === p));
// The last drop: a count, then what needs you, what was filed, what was set aside.
function duResultsHtml(){
  if(!duResults.length) return '';
  const shown = duResultsShown();
  const need = shown.filter(r => r.state === 'error' || r.state === 'waiting');
  const busy = shown.filter(r => r.state === 'working');
  const ok = shown.filter(r => r.state === 'ok');
  const skip = shown.filter(r => r.state === 'skip');
  const parts = [ok.length && `${ok.length} filed`, need.length && `${need.length} need${need.length === 1 ? 's' : ''} you`, busy.length && `${busy.length} reading`, skip.length && `${skip.length} set aside`].filter(Boolean);
  return `<section class="du-run" aria-label="What the last upload did">
    <div class="du-run-head"><b>${duResults.length} file${duResults.length === 1 ? '' : 's'}</b><span>${parts.join(' · ')}</span>${busy.length ? '' : '<button type="button" class="du-run-clear" data-du-clear>Clear</button>'}</div>
    ${need.length ? `<h5 class="du-run-h is-need">${DU_ICON.alert}Needs you</h5><ul class="du-results">${need.map(duResultHtml).join('')}</ul>` : ''}
    ${busy.length ? `<ul class="du-results">${busy.map(duResultHtml).join('')}</ul>` : ''}
    ${ok.length ? `<h5 class="du-run-h is-ok">${DU_ICON.check}Filed</h5><ul class="du-results">${ok.map(duResultHtml).join('')}</ul>` : ''}
    ${skip.length ? `<details class="du-run-skip"><summary>${skip.length} set aside, and why</summary><ul class="du-results">${skip.map(duResultHtml).join('')}</ul></details>` : ''}
  </section>`;
}

// ----- What the uploads say -----
// A few lines worth acting on, from what's on file: sales against last year
// this month, each weekday's busiest hour, the hours labor runs heaviest,
// and the strongest and weakest daypart.
const DU_LABOR_HOT = 30;          // % of sales
function duInsights(now){
  const out = [];
  const month = duISO(new Date(now.getFullYear(), now.getMonth(), 1)), todayIso = duISO(now);
  if(typeof salesHistory !== 'undefined' && salesHistory){
    const days = Object.keys(salesHistory).filter(d => d >= month && d < todayIso && salesHistory[d].sales > 0 && salesHistory[d].lastYearSales > 0);
    if(days.length >= 3){
      const ty = days.reduce((t, d) => t + salesHistory[d].sales, 0), ly = days.reduce((t, d) => t + salesHistory[d].lastYearSales, 0);
      const pct = (ty / ly - 1) * 100;
      out.push({tone: pct < 0 ? 'down' : 'up', text: `Sales this month are ${Math.abs(pct).toFixed(1)}% ${pct < 0 ? 'below' : 'above'} last year (${days.length} days, $${Math.round(ty).toLocaleString('en-US')}).`, go: 'forecast', label: 'Forecast'});
    }
  }
  const profiles = typeof productivityProfiles !== 'undefined' && productivityProfiles ? productivityProfiles : {};
  const busy = DU_WEEKDAYS.map(day => {
    const hours = Object.entries((profiles[day] || {}).hours || {}).filter(([h, v]) => v && v.prod != null && +h >= 360 && +h <= 1260);
    if(!hours.length) return null;
    const [h] = hours.sort((a, b) => b[1].prod - a[1].prod)[0];
    return `${day.slice(0, 3)} ${duHour(+h)}`;
  }).filter(Boolean);
  if(busy.length >= 3) out.push({tone: 'info', text: `Busiest hour by sales per labor hour: ${busy.join(' · ')}. Breaks are planned around these.`, go: 'positions', label: 'Set Ups'});
  const hot = [];
  DU_WEEKDAYS.forEach(day => Object.entries((profiles[day] || {}).hours || {}).forEach(([h, v]) => {
    if(v && v.laborPct != null && +h >= 360 && +h <= 1260 && v.laborPct >= DU_LABOR_HOT) hot.push({day, h: +h, pct: v.laborPct});
  }));
  if(hot.length){
    hot.sort((a, b) => b.pct - a.pct);
    out.push({tone: 'down', text: `Labor runs heaviest (over ${DU_LABOR_HOT}% of sales) at ${hot.slice(0, 4).map(x => `${x.day.slice(0, 3)} ${duHour(x.h)} (${Math.round(x.pct)}%)`).join(', ')}${hot.length > 4 ? ` and ${hot.length - 4} more hour${hot.length - 4 === 1 ? '' : 's'}` : ''}: the first places to look at who’s on.`, go: 'forecast', label: 'Forecast'});
  }
  const dps = [];
  DU_WEEKDAYS.forEach(day => Object.entries((profiles[day] || {}).dayparts || {}).forEach(([dp, v]) => { if(v && v.prod > 0) dps.push({day, dp, prod: v.prod}); }));
  if(dps.length >= 8){
    dps.sort((a, b) => b.prod - a.prod);
    const hi = dps[0], lo = dps[dps.length - 1];
    out.push({tone: 'info', text: `Strongest daypart: ${hi.day} ${hi.dp.toLowerCase()} at $${Math.round(hi.prod)} a labor hour; weakest: ${lo.day} ${lo.dp.toLowerCase()} at $${Math.round(lo.prod)}. Each weekday’s daypart goals now follow its own numbers.`, go: 'forecast', label: 'Forecast'});
  }
  return out;
}
function duHour(m){ const h = Math.floor(m / 60) % 24; return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`; }
function duInsightsHtml(now){
  const list = duInsights(now);
  if(!list.length) return '';
  return `<section class="du-insights" aria-label="What the uploads say">
    <h4>${DU_ICON.spark}What your uploads say</h4>
    <ul>${list.map(x => `<li class="is-${x.tone}"><span>${escapeHtml(x.text)}</span>${x.go ? `<button type="button" class="du-insight-go full-only" data-du-go="${x.go}">${escapeHtml(x.label)} ${DU_ICON.arrow}</button>` : ''}</li>`).join('')}</ul>
  </section>`;
}

// foldable: an up-to-date row opened from its one-line form; a Fold button folds it back.
function duRowHtml(src, st, foldable){
  const s = DU_STATUS[st.status];
  const log = duLastLog(src.key);
  const lastText = st.last ? `Last upload ${st.last.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}${log && log.file ? ` · ${log.file}` : ''}` : 'No upload logged here yet';
  const icon = st.status === 'fresh' ? DU_ICON.check : st.status === 'due' ? DU_ICON.clock : DU_ICON.alert;
  return `
    <li class="du-row is-${st.status}" id="du-row-${src.key}">
      <div class="du-row-head">
        <span class="du-row-icon" aria-hidden="true">${src.icon}</span>
        <span class="du-row-name">${escapeHtml(src.name)}</span>
        <span class="du-cadence">${escapeHtml(DU_FREQUENCIES[st.freq])}</span>
        <span class="du-status ${s.cls}">${icon} ${s.label}</span>
        ${foldable ? `<button type="button" class="du-row-fold" data-du-close="${escapeHtml(src.key)}" aria-expanded="true" title="Fold ${escapeHtml(src.name)}">${DU_ICON.up}<span>Fold</span></button>` : ''}
      </div>
      <div class="du-cover">${escapeHtml(st.cover)}</div>
      ${st.note ? `<div class="du-note">${escapeHtml(st.note)}</div>` : ''}
      <div class="du-feeds-line">${DU_ICON.arrow}<span>${escapeHtml(src.feeds)}</span></div>
      ${src.key === 'salesMix' ? duSalesMixCalendarHtml() : src.key === 'cem' ? duCemGridHtml() : src.key === 'productivity' ? duProdGridHtml() : ''}
      ${duRowPending(src.key).map(duPendingHtml).join('')}
      ${src.key === 'pea' ? duLevelsetHtml() : ''}
      ${src.key === 'roster' && typeof hsSyncInstallHtml === 'function' ? hsSyncInstallHtml() : ''}
      <div class="du-row-actions">
        <label class="du-row-upload"><input type="file" accept="${src.accept}" ${src.multiple ? 'multiple' : ''} data-du-row-input="${src.key}"><span>${DU_ICON.upload} Upload ${escapeHtml(src.short || src.name.split(' (')[0])}${src.key === 'pea' ? ' (backup)' : ''}</span></label>
        ${src.key === 'numbers' && typeof salesHistory !== 'undefined' && Object.keys(salesHistory || {}).length ? '<button type="button" class="du-sync-btn full-only" data-du-forecast="1">See the forecast split</button>' : ''}
        ${src.key === 'numbers' ? '<button type="button" class="du-sync-btn" data-du-template="1">Download template</button>' : ''}
      </div>
      <details class="du-more">
        <summary>How to get it</summary>
        <p>${escapeHtml(src.how)}</p>
        <p class="du-feeds">${escapeHtml(lastText)}</p>
        ${src.fixedFreq ? '' : `<label class="du-freq">Due <select data-du-freq="${src.key}">${Object.entries(DU_FREQUENCIES).map(([k, v]) => `<option value="${k}" ${k === st.freq ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`}
      </details>
    </li>`;
}
// An up-to-date report, folded to one line; tap to open it in full.
function duMiniHtml(src, st){
  return `<li><button type="button" class="du-mini" data-du-open="${src.key}" aria-expanded="false">
    <span class="du-mini-dot" aria-hidden="true">${DU_ICON.check}</span>
    <b>${escapeHtml(src.name)}</b>
    <span>${escapeHtml(st.cover)}</span>
  </button></li>`;
}

// ----- Today's uploads (Tim, Oct 23 2026) -----
// The admin team's list for the day: every report due or behind, plus the
// ones already brought in today, ticked. When nothing's left, a word of
// encouragement in the house style: one a day, the same all day.
const DU_CAUGHT_UP = [
  'Every report is in. That’s second-mile service on the spreadsheets.',
  'All caught up. Somebody’s earned a waffle fry break.',
  'Nothing left to file. The numbers are as fresh as a just-breaded filet.',
  'Clean sweep. Even the cows would be impressed.',
  'All in. Today’s reports, served with a smile.',
  'Caught up! You just made every leader’s day a little easier.',
  'That’s a wrap. The hub is humming because of you.',
  'Winning hearts every day, one report at a time. Thank you!',
  'All caught up. Now that’s a my-pleasure kind of day.',
  'Done and filed. That’s how Buda does it.'
];
function duCaughtUpLine(iso){
  let h = 0;
  for(const ch of String(iso)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DU_CAUGHT_UP[h % DU_CAUGHT_UP.length];
}
// When this source was uploaded today (a Date), or null.
function duUploadedToday(key){
  const at = ((dataUploadLog || {})[key] || []).map(e => e && e.at).filter(Boolean).sort().pop();
  if(!at) return null;
  const d = new Date(at);
  return toLocalISODate(d) === today ? d : null;
}
const DU_ICON_CHEER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 4M17 6h2.5a2.5 2.5 0 0 1-2.6 4"/></svg>';
let duTodayDoneOpen = false;   // the day's done list, unfolded
// Up-to-date reports, the one uploaded most recently first (then the usual order).
function duByLastUpload(rows, rank){
  const at = r => r.st.last ? new Date(r.st.last).getTime() : 0;
  return rows.slice().sort((a, b) => (at(b) - at(a)) || rank(a.src.key) - rank(b.src.key));
}
function duTodayHtml(rows, counts, lastText){
  const items = rows.map(r => ({...r, at: duUploadedToday(r.src.key)}))
    .filter(r => r.pending || r.st.status !== 'fresh' || r.at)
    .map(r => ({...r, done: !r.pending && r.st.status === 'fresh' && !!r.at}));
  const left = items.filter(r => !r.done).length, total = items.length;
  const clock = d => d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
  const note = r => r.done ? `Done ${clock(r.at)}` : r.pending ? 'Waiting on a tap below' : r.st.status === 'overdue' ? 'Behind' : `Due ${r.st.freq === 'daily' ? 'today' : r.st.freq === 'monthly' ? 'this month' : r.st.freq === 'quarterly' ? 'this quarter' : 'this week'}`;
  const pct = total ? Math.round((total - left) / total * 100) : 100;
  // Each line is a button: tap it to go to that report's card below.
  const item = r => `
        <li class="${r.done ? 'is-done' : `is-${r.st.status}`}"><button type="button" class="du-today-item" data-du-goto="${escapeHtml(r.src.key)}" title="Go to ${escapeHtml(r.src.name)}">
          <span class="du-today-box" aria-hidden="true">${r.done ? DU_ICON.check : ''}</span>
          <span class="du-today-name">${escapeHtml(r.src.name)}</span>
          <small>${escapeHtml(note(r))}</small>
        </button></li>`;
  const todo = items.filter(r => !r.done).sort((a, b) => (a.st.status === 'overdue' ? 0 : 1) - (b.st.status === 'overdue' ? 0 : 1));
  // Done ones fold away under a toggle, the most recent upload first.
  const done = items.filter(r => r.done).sort((a, b) => b.at - a.at);
  const doneList = done.length ? `<details class="du-today-fold" ${duTodayDoneOpen ? 'open' : ''}><summary>${left ? `${done.length} done today` : `${total} uploaded today`}</summary><ul class="du-today-list">${done.map(item).join('')}</ul></details>` : '';
  return `
    <section class="du-today ${left ? '' : 'is-done'}" aria-live="polite">
      <div class="du-today-head">
        <span class="du-today-ring" style="--p:${pct}" aria-hidden="true">${left ? `<b>${total - left}/${total}</b>` : DU_ICON_CHEER}</span>
        <div class="du-today-t">
          <h3>${left ? 'Today’s uploads' : 'All caught up!'}</h3>
          <p>${left ? `${left} to go${total - left ? `, ${total - left} done` : ''}. Drop them below and each one ticks off. Tap a report to go to its card.` : escapeHtml(duCaughtUpLine(today))}</p>
        </div>
      </div>
      ${todo.length ? `<ul class="du-today-list">${todo.map(item).join('')}</ul>` : ''}
      ${doneList}
      <div class="du-today-foot">
        ${counts.overdue ? `<span class="du-pill is-overdue">${counts.overdue} overdue</span>` : ''}${counts.due ? `<span class="du-pill is-due">${counts.due} due</span>` : ''}<span class="du-pill is-fresh">${counts.fresh} current</span>
        <span class="du-head-last">${escapeHtml(lastText)}</span>
      </div>
    </section>`;
}

function renderDataUploads(){
  const root = document.getElementById('dataUploadsRoot');
  if(!root) return;
  const now = new Date();
  const rank = k => { const i = DU_PRIORITY.indexOf(k); return i === -1 ? 99 : i; };
  const rows = DU_SOURCES.map(src => ({src, st: duSourceState(src, now), pending: duRowPending(src.key).length > 0}));
  const count = st => rows.filter(r => r.st.status === st).length;
  const overdue = count('overdue'), due = count('due'), fresh = count('fresh');
  // A report waiting on a tap is shown first whatever its status.
  const needs = rows.filter(r => r.pending || r.st.status !== 'fresh')
    .sort((a, b) => (b.pending - a.pending) || ((a.st.status === 'overdue' ? 0 : 1) - (b.st.status === 'overdue' ? 0 : 1)) || rank(a.src.key) - rank(b.src.key));
  const current = duByLastUpload(rows.filter(r => !r.pending && r.st.status === 'fresh'), rank);
  duCurrentKeys = current.map(r => r.src.key);
  const lastAt = Object.entries(dataUploadLog || {}).map(([k, list]) => ({k, e: (list || [])[list.length - 1]})).filter(x => x.e && x.e.at).sort((a, b) => String(b.e.at).localeCompare(String(a.e.at)))[0];
  const lastText = lastAt ? `Last upload ${new Date(lastAt.e.at).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})} · ${(DU_SOURCES.find(s => s.key === lastAt.k) || {name: lastAt.k}).name}` : 'Nothing uploaded yet';
  const zipNeeds = Object.keys(DU_ZIP_COVERS).filter(k => needs.some(r => r.src.key === k));
  root.innerHTML = `
    ${duRestoreHtml()}
    ${duTodayHtml(rows, {overdue, due, fresh}, lastText)}
    <label class="du-drop" data-du-drop>
      <input type="file" multiple accept=".csv,.xlsx,.xls,.pdf,.zip,.txt,.tsv,.png,.jpg,.jpeg" data-du-input>
      <span class="du-drop-icon" aria-hidden="true">${DU_ICON.upload}</span>
      <span class="du-drop-main">Drop the Schedule Builder zip or any report</span>
      <span class="du-drop-sub">PDF, CSV, Excel or a whole zip, several at once. Each file is recognized and filed where it belongs.</span>
      ${zipNeeds.length ? `<span class="du-drop-zip">The zip alone brings ${zipNeeds.length === 1 ? 'this one' : `${zipNeeds.length} of these`} up to date: ${zipNeeds.map(k => escapeHtml(DU_ZIP_COVERS[k])).join(', ')}.</span>` : ''}
    </label>
    ${duResultsHtml()}
    ${duInsightsHtml(now)}
    ${needs.length ? `<h4 class="du-section-h">Needs an upload</h4><ul class="du-list">${needs.map(r => duRowHtml(r.src, r.st)).join('')}</ul>` : ''}
    ${current.length ? `<details class="du-done" ${duDoneOpen ? 'open' : ''}>
      <summary class="du-section-h">${current.length} up to date <span>· most recent upload first</span></summary>
      <ul class="du-list is-current">${current.map(r => duShowAll || duOpenRows.has(r.src.key) ? duRowHtml(r.src, r.st, true) : duMiniHtml(r.src, r.st)).join('')}</ul>
      <button type="button" class="du-showall" data-du-showall="${duShowAll ? 0 : 1}">${duShowAll ? 'Fold the up-to-date reports' : `Open all ${current.length} in full`}</button>
    </details>` : ''}`;
}
// A tap on the day's list: that report's card, opened in full and scrolled to.
function duGoToRow(key){
  if(!document.getElementById(`du-row-${key}`)){
    // Folded away in the up-to-date list: unfold it and open the row.
    duDoneOpen = true;
    duOpenRows.add(key);
    renderDataUploads();
  }
  const row = document.getElementById(`du-row-${key}`);
  if(!row) return;
  row.scrollIntoView({behavior: 'smooth', block: 'start'});
  row.classList.add('is-found');
  setTimeout(() => row.classList.remove('is-found'), 1800);
}
// The two folds keep their state across re-renders (toggle doesn't bubble).
document.getElementById('dataUploadsRoot').addEventListener('toggle', e=>{
  if(e.target.matches('details.du-done')) duDoneOpen = e.target.open;
  else if(e.target.matches('details.du-today-fold')) duTodayDoneOpen = e.target.open;
}, true);
document.getElementById('dataUploadsRoot').addEventListener('click', e=>{
  const sa = e.target.closest('[data-du-showall]');
  if(sa){ duShowAll = sa.dataset.duShowall === '1'; if(!duShowAll) duOpenRows.clear(); renderDataUploads(); return; }
  const open = e.target.closest('[data-du-open]');
  if(open){ duOpenRows.add(open.dataset.duOpen); renderDataUploads(); return; }
  const close = e.target.closest('[data-du-close]');
  if(close){
    // Folding one row while "all open": the others stay open on their own.
    if(duShowAll){ duShowAll = false; duCurrentKeys.forEach(k => duOpenRows.add(k)); }
    duOpenRows.delete(close.dataset.duClose);
    renderDataUploads();
    const mini = document.querySelector(`[data-du-open="${close.dataset.duClose}"]`);
    if(mini && mini.scrollIntoView) mini.scrollIntoView({block: 'nearest'});
    return;
  }
  const goto = e.target.closest('[data-du-goto]');
  if(goto){ duGoToRow(goto.dataset.duGoto); return; }
  if(e.target.closest('[data-du-clear]')){ duResults = []; renderDataUploads(); return; }
  const go = e.target.closest('[data-du-go]');
  if(go){ launchShowTab(go.dataset.duGo); window.scrollTo(0, 0); return; }
  if(e.target.closest('[data-du-levelset]')) peaLevelsetSync(false);
  if(e.target.closest('[data-du-forecast]')){ fcTab = 'forecast'; fcNumbersOpen = true; launchShowTab('forecast'); const c = document.getElementById('fcNumbersCard'); if(c && c.scrollIntoView) c.scrollIntoView({block: 'start'}); }
  if(e.target.closest('[data-du-restore]')) duRestoreBackup();
  const skip = e.target.closest('[data-du-skip-roster]');
  if(skip && typeof duRosterSkipQueued === 'function'){ duRosterSkipQueued(Number(skip.dataset.duSkipRoster)); return; }
  const evi = e.target.closest('[data-du-evi]');
  if(evi && typeof duReadBundleImage === 'function') duReadBundleImage(evi.dataset.duEvi);
});

document.getElementById('dataUploadsRoot').addEventListener('change', async e=>{
  if(e.target.matches('[data-du-input]')){
    const files = e.target.files;
    await duHandleFiles(files);
    return;
  }
  if(e.target.matches('[data-du-row-input]')){
    await duHandleFiles(e.target.files, e.target.dataset.duRowInput);
    return;
  }
  if(e.target.matches('[data-du-cem-file]')){
    await duHandleFiles(e.target.files, 'cem');
    return;
  }
  if(e.target.matches('[data-du-prod-file]')){
    const file = e.target.files[0];
    e.target.value = '';
    const day = duProdUploadFor;
    duProdUploadFor = null;
    if(file && day) await duProdUploadForDay(file, day);
    return;
  }
  if(e.target.matches('[data-du-sm-file]')){
    const file = e.target.files[0];
    e.target.value = '';
    if(file && duSmUploadFor) await duSalesMixUploadFor(duSmUploadFor, file);
    duSmUploadFor = null;
    return;
  }
  if(e.target.matches('[data-du-pending-date]') && e.target.value){
    await duResolvePending(+e.target.dataset.duPendingDate, e.target.value);
    return;
  }
  const freq = e.target.closest('[data-du-freq]');
  if(freq){
    dataUploadSettings.freq = dataUploadSettings.freq || {};
    dataUploadSettings.freq[freq.dataset.duFreq] = freq.value;
    await saveState();
    renderDataUploads();
  }
});

['dragenter', 'dragover'].forEach(type => document.getElementById('dataUploadsRoot').addEventListener(type, e=>{
  const drop = e.target.closest('[data-du-drop]');
  if(!drop) return;
  e.preventDefault();
  drop.classList.add('is-over');
}));
document.getElementById('dataUploadsRoot').addEventListener('dragleave', e=>{
  const drop = e.target.closest('[data-du-drop]');
  if(drop) drop.classList.remove('is-over');
});
document.getElementById('dataUploadsRoot').addEventListener('drop', e=>{
  const drop = e.target.closest('[data-du-drop]');
  if(!drop) return;
  e.preventDefault();
  drop.classList.remove('is-over');
  duHandleFiles(e.dataTransfer.files);
});

document.getElementById('dataUploadsRoot').addEventListener('click', async e=>{
  const cem = e.target.closest('[data-du-cem-cell]');
  if(cem){
    const [key, dim] = cem.dataset.duCemCell.split('::');
    if(ctEntriesForPeriod(key).some(x => x.dimension === dim)){ duCemOpen = duCemOpen === cem.dataset.duCemCell ? null : cem.dataset.duCemCell; renderDataUploads(); }
    else document.querySelector('[data-du-cem-file]').click();
    return;
  }
  const prod = e.target.closest('[data-du-prod-day]');
  if(prod){
    const d = prod.dataset.duProdDay;
    if(productivityProfiles[d]){ duProdOpen = duProdOpen === d ? null : d; renderDataUploads(); }
    else { duProdUploadFor = d; document.querySelector('[data-du-prod-file]').click(); }
    return;
  }
  const day = e.target.closest('[data-du-sm-day]');
  if(day){
    const iso = day.dataset.duSmDay;
    if(prepSoldEntries.some(x => x.date === iso)){ duSmOpen = duSmOpen === iso ? null : iso; renderDataUploads(); }
    else { duSmUploadFor = iso; document.querySelector('[data-du-sm-file]').click(); }
    return;
  }
  const replace = e.target.closest('[data-du-sm-replace]');
  if(replace){ duSmUploadFor = replace.dataset.duSmReplace; document.querySelector('[data-du-sm-file]').click(); return; }
  const remove = e.target.closest('[data-du-sm-remove]');
  if(remove){
    const iso = remove.dataset.duSmRemove;
    if(!confirm(`Remove the Sales Mix saved for ${duLongDay(iso)}?`)) return;
    prepSoldEntries = prepSoldEntries.filter(x => x.date !== iso);
    duSmOpen = null;
    renderDataUploads();
    if(typeof renderPrepBoard === 'function') renderPrepBoard();
    showToast(`${duLongDay(iso)} removed`);
    await saveState();
    return;
  }
  const range = e.target.closest('[data-du-range-save]');
  if(range){
    const id = range.dataset.duRangeSave, box = range.closest('.du-pending');
    const from = box.querySelector(`[data-du-range-from="${id}"]`).value, to = box.querySelector(`[data-du-range-to="${id}"]`).value;
    if(!from || !to || from > to){ showToast('Pick a From date on or before the To date'); return; }
    duResolvePending(+id, `${from}|${to}`);
    return;
  }
  const pick = e.target.closest('[data-du-pending]');
  if(pick){ duResolvePending(+pick.dataset.duPending, pick.dataset.duValue); return; }
  const skip = e.target.closest('[data-du-pending-skip]');
  if(skip){
    const id = +skip.dataset.duPendingSkip;
    const item = duPending.find(p => p.id === id);
    duPending = duPending.filter(p => p.id !== id);
    const r = item && duResults.find(x => x.file === item.file.name && x.state === 'waiting');
    if(r) Object.assign(r, {state: 'error', text: 'Skipped.'});
    renderDataUploads();
  }
});
