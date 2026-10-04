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
  monthly: 'Monthly'
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
    how: 'A spreadsheet (Excel or CSV) with a Date column, a Daypart column, and Projected Sales / Productivity Goal columns — or one row per day with a column per daypart. Download the template in Know the Numbers. Special events stay typed in there.',
    feeds: 'Know the Numbers · Set Ups game plan · Game Day / Practice Day'
  },
  {
    key: 'productivity', short: 'productivity reports', icon: '', name: 'Productivity by hour', freq: 'monthly', accept: '.csv,.txt', multiple: true,
    how: 'Productivity dashboard → Total | Daypart | Productivity, export as CSV, one per weekday (it says “for Tuesday” etc.). Month to date or longer.',
    feeds: 'Break planner — keeps breaks out of each day’s busiest hours'
  },
  {
    key: 'salesMix', short: 'Sales Mix', icon: '', name: 'Sales Mix (items sold)', freq: 'weekly', accept: '.csv,.xlsx,.xls,.txt', multiple: true,
    how: 'Sales Mix Items Totals report, one file per day (the date in the file name is used). Drop several days at once.',
    feeds: 'Prep Board build-to and sold history'
  },
  {
    key: 'sales', short: 'sales export', icon: '', name: 'Sales MTD / YTD (Analytics Hub)', freq: 'weekly', accept: '.csv,.txt',
    how: 'Analytics Hub → sales by day by destination, export as CSV (CSV_DOWNLOAD). Month to date for MTD; the same report from Jan 1 for YTD.',
    feeds: 'Guest Obsession WIG — sales and % change vs last year · Forecast (sales history by day and destination)'
  },
  {
    key: 'labor', short: 'DayTrack export', icon: '', name: 'DayTrack Table (sales & labor by day)', freq: 'weekly', accept: '.csv,.txt,.xlsx,.xls',
    how: 'Analytics Hub → DayTrack → Table, export as CSV, with a row per business date. Carries this year’s and last year’s sales, timekeeping and benchmark hours, effective wage, labor cost % and check average. Export a range that reaches back a year once, so the forecast has last year’s figure for every day ahead; after that a few weeks at a time keeps it current. Any other export with a date column and labor columns works too; the Forecast page’s Data tab shows which column was taken for what.',
    feeds: 'Forecast — sales history, last year’s sales, labor hours, $ per labor hour and labor % targets'
  },
  {
    key: 'dtRank', short: 'rankings', icon: '', name: 'Drive-thru rankings (Analytics Hub)', freq: 'monthly', accept: '.csv,.txt', multiple: true,
    how: 'Analytics Hub → DT rankings → Detailed Rankings (or Composite Rank), export as CSV — once per comparison group. A chain-wide ranking is recognized on its own; for the others the upload asks Region, Market or State.',
    feeds: 'Guest Obsession DT ranking'
  },
  {
    key: 'sos', short: 'speed of service export', icon: '', name: 'Speed of service (Analytics Hub)', freq: 'monthly', accept: '.csv,.txt',
    how: 'Analytics Hub → speed of service, Custom by Day, export as CSV (month to date).',
    feeds: 'Guest Obsession Speed of Service (drive-thru, every car)'
  },
  {
    key: 'smartShop', short: 'Smart Shop PDFs', icon: '', name: 'Smart Shop visits (Ops Hub)', freq: 'monthly', accept: '.pdf,.zip', multiple: true,
    how: 'Ops Hub → Assessments → Smart Shop → download the report (a PDF, or the zip Ops Hub gives you). Upload every visit for the month.',
    feeds: 'Guest Obsession Manage — Smart Shop results and the standards missed most'
  },
  {
    key: 'foodSafety', short: 'food safety PDF', icon: '', name: 'Food safety assessment (Ops Hub)', freq: 'monthly', fixedFreq: true, accept: '.pdf',
    how: 'Ops Hub → Food Safety → All Findings, print or save as PDF after each assessment.',
    feeds: 'Food Safety Walkthrough — the findings to check first'
  },
  {
    key: 'qiv', short: 'QIV PDF', icon: '', name: 'QIV visit (Ops Hub)', freq: 'monthly', fixedFreq: true, accept: '.pdf',
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
    return {status, freq, cover: latest ? `Projected sales through ${duShort(latest)}` : 'No projected sales ahead of today', note: status === 'fresh' ? '' : lateInWeek ? 'Upload next week’s numbers before Monday.' : 'Upload this week’s numbers.', last: logAt};
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
  if(/\.(pdf|zip)$/i.test(file.name)) return /positional|rating|levelset/i.test(file.name) ? 'pea' : 'opsPdf';
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
  const {result, unrecognized, offFloor} = parseWeeklyRosterCsv(text);
  weeklyImportParsed = result;
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
  const files = Array.from(fileList || []);
  if(!files.length) return;
  duResults = files.map(f => ({file: f.name, state: 'working', text: 'Reading…'}));
  renderDataUploads();
  // CEM files first so the scoreboard ends on the newest month; the roster
  // last because it opens a review window.
  const order = {cem: 0, pea: 1, salesMix: 2, numbers: 2, sales: 2, labor: 2, dtRank: 2, sos: 2, opsPdf: 2, productivity: 3, roster: 4};
  const jobs = [];
  for(let i = 0; i < files.length; i++){
    const file = files[i];
    try{
      const isPdf = /\.(pdf|zip)$/i.test(file.name);
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const buffer = isPdf ? null : await duReadFile(file, true);
      const text = buffer && !isExcel ? pbDecodeText(buffer) : '';
      const workbook = isExcel ? XLSX.read(new Uint8Array(buffer), {type: 'array'}) : null;
      jobs.push({i, file, kind: duDetect(file, text, workbook) || hint || null, text, buffer});
    }catch(err){
      duResults[i] = {file: file.name, state: 'error', text: err.message};
    }
  }
  jobs.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
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
      else if(job.kind === 'roster') text = duImportRoster(job.file, job.text);
      else if(job.kind === 'numbers') text = await knImportFile(job.file);
      else if(job.kind === 'sales') text = await rpImportSales(job.file, job.text);
      else if(job.kind === 'labor') text = await fcImportLaborFile(job.file, job.text, job.buffer);
      else if(job.kind === 'sos') text = await rpImportSos(job.file, job.text);
      else if(job.kind === 'dtRank'){
        const d = rpParseDtRank(job.text);
        if(d.count >= RP_DT_CHAIN_MIN) text = await rpImportDtRank(job.file, job.text, 'chain');
        else { duWait(job, 'dtGroup'); continue; }
      }
      else if(job.kind === 'opsPdf'){
        const report = await rpImportOpsPdf(job.file);
        if(report === null){
          if(/\.zip$/i.test(job.file.name)) throw new Error('No Smart Shop or food safety report in this zip.');
          job.kind = 'pea';
          text = await duImportPea(job.file);
        } else {
          text = report.text;
          job.kind = report.kind;
        }
      }
      else if(job.kind === 'productivity'){
        if(!duProductivityDay(job.text)){ duWait(job, 'weekday'); continue; }
        text = await duImportProductivity(job.file, job.text);
      }
      else throw new Error('Didn’t recognize this file. Expected a CEM Comparison Report, HotSchedules roster CSV, Levelset PEA PDF, Sales Mix report, productivity report, projected sales & productivity goals, an Analytics Hub sales, labor, rankings or speed of service export, or an Ops Hub Smart Shop / food safety report.');
      const filed = DU_SOURCES.find(s => s.key === job.kind) || (job.kind === 'opsPdf' ? {name: 'Ops Hub report'} : null);
      duResults[job.i] = {file: job.file.name, state: 'ok', kind: filed ? filed.name : job.kind, text};
    }catch(err){
      duResults[job.i] = {file: job.file.name, state: 'error', kind: src ? src.name : '', text: err.message};
    }
    renderDataUploads();
  }
  renderDataUploads();
  const ok = duResults.filter(r => r.state === 'ok').length;
  const twins = duResults.filter(r => r.state === 'waiting' && /^Not saved yet — identical/.test(r.text)).length;
  const waiting = duResults.filter(r => r.state === 'waiting').length - twins;
  if(twins) showToast(`⚠ ${twins} file${twins === 1 ? ' matches' : 's match'} another day’s counts — not saved. Check Data Uploads.`);
  else showToast(waiting ? `${waiting} file${waiting === 1 ? '' : 's'} need${waiting === 1 ? 's' : ''} a day — pick it in Data Uploads` : ok === files.length ? `✓ ${ok} file${ok === 1 ? '' : 's'} filed` : `${ok} of ${files.length} files filed — see Data Uploads`);
}

// Hold a Sales Mix file whose counts match another recent day, until the
// leader says save it anyway or skip it.
function duWaitTwin(resultIndex, file, iso, twin){
  duPending.push({id: ++duPendingSeq, kind: 'salesMix', need: 'twin', file, iso, twin: {date: twin.date, file: twin.file || ''}});
  const r = {file: file.name, state: 'waiting', kind: 'Sales Mix (items sold)', text: `Not saved yet — identical to ${duLongDay(twin.date)}. Check it in the Sales Mix row.`};
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
  duResults[job.i] = {file: job.file.name, state: 'waiting', kind: src ? src.name : job.kind, text: need === 'date' ? 'No date in this file — pick the day in the Sales Mix row below.' : need === 'dtGroup' ? 'Which ranking is this? Pick Region, Market, State or Chain in the Drive-thru rankings row below.' : 'No weekday in this export — pick it in the Productivity row below.'};
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
function duPendingHtml(item){
  const name = `<div class="du-pending-file">${escapeHtml(item.file.name)}</div>`;
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
  const chips = days.map(({n, d})=>{
    const top = n === 1 ? 'Yesterday' : d.toLocaleDateString('en-US', {weekday: 'short'});
    return `<button type="button" class="du-chip" data-du-pending="${item.id}" data-du-value="${duISO(d)}"><span>${top}</span><b>${d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}</b></button>`;
  }).join('');
  return `<div class="du-pending">${name}
    <div class="du-pending-q">What day are these sales from?</div>
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
    duResults = [{file: file.name, state: 'waiting', kind: 'Sales Mix (items sold)', text: `You tapped ${duLongDay(iso)}, but the file name says ${duLongDay(named)} — pick one in the Sales Mix row.`}];
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
    duResults = [{file: file.name, state: 'waiting', kind: 'Productivity by hour', text: `You tapped ${day}, but the report says ${named} — pick one in the Productivity row.`}];
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

function renderDataUploads(){
  const root = document.getElementById('dataUploadsRoot');
  if(!root) return;
  const now = new Date();
  const rows = DU_SOURCES.map(src => ({src, st: duSourceState(src, now)}));
  const dueCount = rows.filter(r => r.st.status !== 'fresh').length;
  root.innerHTML = `
    ${duRestoreHtml()}
    <div class="du-summary ${dueCount ? 'has-due' : ''}">${dueCount ? `${dueCount} of ${rows.length} need an upload` : `All ${rows.length} data sources are up to date`}</div>
    <label class="du-drop" data-du-drop>
      <input type="file" multiple accept=".csv,.xlsx,.xls,.pdf,.zip,.txt,.tsv" data-du-input>
      <span class="du-drop-main">Drop files here or tap to choose</span>
      <span class="du-drop-sub">Any of the reports below, several at once — each is recognized and filed where it belongs.</span>
    </label>
    ${duResults.length ? `<ul class="du-results">${duResults.map(r => `<li class="du-result is-${r.state}"><b>${escapeHtml(r.file)}</b>${r.kind ? ` <span>${escapeHtml(r.kind)}</span>` : ''}<div>${escapeHtml(r.text)}</div></li>`).join('')}</ul>` : ''}
    <ul class="du-list">
      ${rows.map(({src, st}) => {
        const s = DU_STATUS[st.status];
        const log = duLastLog(src.key);
        const lastText = st.last ? `Last upload ${st.last.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}${log && log.file ? ` · ${log.file}` : ''}` : 'No upload logged here yet';
        return `
        <li class="du-row">
          <div class="du-row-head">
            <span class="du-row-icon" aria-hidden="true">${src.icon}</span>
            <span class="du-row-name">${escapeHtml(src.name)}</span>
            <span class="du-status ${s.cls}"><span aria-hidden="true">${s.icon}</span> ${s.label}</span>
          </div>
          <div class="du-cover">${escapeHtml(st.cover)}</div>
          ${st.note ? `<div class="du-note">${escapeHtml(st.note)}</div>` : ''}
          ${src.key === 'salesMix' ? duSalesMixCalendarHtml() : src.key === 'cem' ? duCemGridHtml() : src.key === 'productivity' ? duProdGridHtml() : ''}
          ${duPending.filter(p => p.kind === src.key).map(duPendingHtml).join('')}
          ${src.key === 'pea' ? duLevelsetHtml() : ''}
          ${src.key === 'roster' && typeof hsSyncInstallHtml === 'function' ? hsSyncInstallHtml() : ''}
          <label class="du-row-upload"><input type="file" accept="${src.accept}" ${src.multiple ? 'multiple' : ''} data-du-row-input="${src.key}"><span>⬆ Upload ${escapeHtml(src.short || src.name.split(' (')[0])}${src.key === 'pea' ? ' (backup)' : ''}</span></label>
          <details class="du-more">
            <summary>How to get it · ${src.fixedFreq ? DU_FREQUENCIES[st.freq] : `<span>${DU_FREQUENCIES[st.freq]}</span>`}</summary>
            <p>${escapeHtml(src.how)}</p>
            <p class="du-feeds">Updates: ${escapeHtml(src.feeds)}</p>
            <p class="du-feeds">${escapeHtml(lastText)}</p>
            ${src.fixedFreq ? '' : `<label class="du-freq">Due <select data-du-freq="${src.key}">${Object.entries(DU_FREQUENCIES).map(([k, v]) => `<option value="${k}" ${k === st.freq ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`}
          </details>
        </li>`;
      }).join('')}
    </ul>`;
}

document.getElementById('dataUploadsRoot').addEventListener('click', e=>{
  if(e.target.closest('[data-du-levelset]')) peaLevelsetSync(false);
  if(e.target.closest('[data-du-restore]')) duRestoreBackup();
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
