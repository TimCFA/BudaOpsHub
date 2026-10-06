// ===== SALES & LABOR FORECAST =====
// The Forecast tab: what sales to expect each day ahead and the labor hours
// that fit, worked out from this store's own history. A manager uploads the
// Analytics Hub sales-by-day export (the same one Guest Obsession uses) and
// a labor-by-day export through Data Uploads; every day lands in
// salesHistory, keyed by date, and keeps accumulating across uploads.
//
// The model, kept deliberately simple so a leader can explain it:
//   weekday   = the average for that weekday over the look-back window,
//               carried forward by a straight-line trend through the
//               window's full weeks (a % per week, capped so a noisy fit
//               can't run away)
//   last year = the same weekday a year ago (364 days back) × how this year
//               is running against last year over the window — the part
//               that knows about back-to-school, holidays, spring break
//   baseline  = a blend of the two; the weight comes from the backtest
//               (which mix would have been closest lately) unless the
//               leader picks one
//   adjusted  = baseline × (1 + the leader's adjustment %), for a game,
//               a holiday, weather, a promotion
//   labor     = adjusted sales ÷ the $-per-labor-hour target, or
//               adjusted sales × labor % ÷ average wage
// Accuracy backtests the same model against days already lived.
//
// Sales and labor history is manager-only (app.py PRIVATE_SECTIONS); a page
// without a manager session never receives it. Nothing here is ever made up:
// an empty history shows an empty page, never sample numbers.

let salesHistory = {};      // {iso: {sales, transactions, laborHours, laborCost, laborPct, wage, channels: {name: $}}}
let forecastSettings = {};  // {method, splh, pct, wage, lookback, days, model, unusual, adjustments: {iso: pct}}
let forecastLog = {};       // {iso: {sales, baseline, adj, model, at}} — what was sent to Know the Numbers, scored once the day's actual lands
let daypartWeeks = {};      // {key: {at, file, total, days: {Mon: {Breakfast: $, …}}}} — Analytics Hub sales by weekday and daypart, a week a file

const FC_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FC_DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FC_DEFAULTS = {method: 'splh', splh: null, pct: null, wage: null, lookback: 'auto', days: 7, model: 'auto', adjustments: {}, daypartMix: null, goalByDaypart: true};
// How a day's sales fall across the four Know the Numbers dayparts when
// nothing better is on file: Buda's typical mix on Analytics Hub's hours,
// from four weeks of its sales-by-weekday-and-daypart exports (Sept 2026).
// Breakfast and the afternoon are the quiet dayparts, dinner the biggest.
const FC_DEFAULT_MIX = {Breakfast: 16, Lunch: 30, Afternoon: 19, Dinner: 35};
// How each daypart's productivity compares with the day's ($/labor hour,
// 1 = the day's), from Buda's Tuesday and Saturday hourly exports.
const FC_DEFAULT_PROD_RATIO = {Breakfast: 0.75, Lunch: 1.16, Afternoon: 1.03, Dinner: 1.06};
// The weekly daypart file: weeks kept, and weeks of a weekday needed
// before its own learned mix is used.
const FC_WEEKS_KEEP = 12;
const FC_MIX_MIN_WEEKS = 3;
const FC_LOOKBACKS = [4, 8, 12, 26];           // the windows Best fit chooses between, per weekday
const FC_LOOKBACK_MIN_DAYS = 3;                // scored days of a weekday before it gets its own window
const FC_LOG_KEEP_DAYS = 120;                  // how long a sent forecast is kept
const FC_YEAR_DAYS = 364;                      // the same weekday a year ago
const FC_YOY_WEIGHTS = [0, 0.25, 0.5, 0.75, 1];  // share of the baseline that comes from last year
const FC_YOY_MIN_DAYS = 6;                     // days with both years before the run-rate is trusted
const FC_AUTO_TEST_DAYS = 28;                  // the backtest that picks the blend
const FC_OUTLIER_PCT = 30;                     // a day this far from its weekday's median is left out
const FC_OUTLIER_MIN_DAYS = 4;                 // open days of a weekday before any can be called unusual
const FC_MAX_TREND_PCT = 5;      // % per week the projection will follow, at most
const FC_FULL_WEEK_DAYS = 5;     // a week with fewer days of data is left out of weekly trends
const FC_CLOSED_SPAN_DAYS = 21;  // a weekday never seen across this many days is taken as closed
const FC_CHANNEL_ORDER = ['Drive Thru', 'Dine In', '3PD', 'Carry Out', 'Catering', 'Curbside'];

// The columns a file can carry, with the header words that identify each.
// `not` keeps a near-miss (Labor Cost % for labor cost $) from being picked.
// The DayTrack Table export (Analytics Hub) carries most of them: this
// year's and last year's sales with last year's date, timekeeping and
// benchmark hours, effective wage, labor cost % and check average.
const FC_FIELDS = [
  {key: 'date', label: 'Date', kws: ["current year's date", 'business date', 'current year', 'date', 'day'], not: /last year|prior year|ly date/i, isDate: true},
  {key: 'sales', label: 'Sales $', kws: ["this year's sales", 'net sales', 'sales amount', 'total sales', 'sales metric', 'revenue', 'sales'], not: /%|pct|percent|secondary|per labor|splh|productiv|last year|prior year|benchmark|opportunit/i},
  {key: 'transactions', label: 'Transactions', kws: ['transaction', 'trans count', 'ticket count', 'guest count', 'checks', 'trans']},
  {key: 'hours', label: 'Labor hours', kws: ['timekeeping hours', 'labor hours', 'worked hours', 'total hours', 'hours'], not: /%|pct|percent|per labor|splh|productiv|benchmark|difference|opportunit/i},
  {key: 'cost', label: 'Labor cost $', kws: ['labor cost $', 'total labor cost', 'labor $', 'labor dollars', 'labor cost'], not: /%|pct|percent|opportunit|benchmark|difference/i},
  {key: 'pct', label: 'Labor % of sales', kws: ['labor cost %', 'labor %', 'labor pct', 'labor percent'], not: /opportunit|benchmark|difference/i},
  {key: 'wage', label: 'Average wage $/hr', kws: ['effective wage', 'average wage', 'avg wage', 'wage rate', 'wage']},
  {key: 'lastYearSales', label: "Last year's sales $", kws: ["last year's sales", 'last year sales', 'prior year sales', 'ly sales'], not: /%|pct|percent|chg|change/i},
  {key: 'lastYearDate', label: "Last year's date", kws: ["last year's date", 'last year date', 'prior year date', 'ly date'], isDate: true},
  {key: 'benchmarkHours', label: 'Benchmark hours', kws: ['benchmark hours'], not: /difference|%/i},
  {key: 'checkAvg', label: 'Check average $', kws: ['check average', 'average check', 'avg check', 'avg ticket', 'average ticket']}
];
const FC_FIELD_TO_KEY = {sales: 'sales', transactions: 'transactions', hours: 'laborHours', cost: 'laborCost', pct: 'laborPct', wage: 'wage', lastYearSales: 'lastYearSales', benchmarkHours: 'benchmarkHours', checkAvg: 'checkAverage'};
const FC_DAY_KEYS = [...Object.values(FC_FIELD_TO_KEY), 'lastYearDate'];

// ----- Small helpers -----

const fcPad = n => String(n).padStart(2, '0');
function fcIso(d){ return `${d.getFullYear()}-${fcPad(d.getMonth() + 1)}-${fcPad(d.getDate())}`; }
function fcToDate(iso){ const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
function fcAddDays(iso, n){ const d = fcToDate(iso); d.setDate(d.getDate() + n); return fcIso(d); }
function fcDow(iso){ return fcToDate(iso).getDay(); }
function fcWeekOf(iso){ const d = fcToDate(iso); d.setDate(d.getDate() - d.getDay()); return fcIso(d); }
function fcValidIso(iso){ return /^\d{4}-\d{2}-\d{2}$/.test(iso) && fcIso(fcToDate(iso)) === iso; }
function fcMoney(n){ return n == null || isNaN(n) ? '—' : '$' + Math.round(n).toLocaleString('en-US'); }
function fcNumFmt(n, dp){ return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-US', {minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0}); }
function fcPctFmt(n, dp){ return n == null || isNaN(n) ? '—' : (n > 0 ? '+' : '') + n.toFixed(dp == null ? 1 : dp) + '%'; }
function fcShort(iso){ return fcToDate(iso).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}); }
function fcEsc(s){ return typeof escapeHtml === 'function' ? escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])); }

// "$1,234.50", "(12.5)", "12.5%" → number, or null.
function fcNum(raw){
  if(raw == null) return null;
  const cleaned = String(raw).replace(/[$,%\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if(!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// A date cell → 'YYYY-MM-DD': 2026-09-01, 20260901, 9/1/2026, 9/1/26, an
// Excel serial, "Sep 1, 2026". Anything else → null.
function fcDate(raw){
  if(raw instanceof Date) return isNaN(raw) ? null : fcIso(raw);
  const s = String(raw == null ? '' : raw).trim();
  if(!s) return null;
  const mk = (y, m, d) => { if(y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null; const iso = `${y}-${fcPad(m)}-${fcPad(d)}`; return fcValidIso(iso) ? iso : null; };
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m) return mk(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if(m) return mk(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if(m){ let y = +m[3]; if(y < 100) y += 2000; return mk(y, +m[1], +m[2]); }
  if(/^\d{5}(\.\d+)?$/.test(s)){
    const serial = Math.floor(+s);
    if(serial > 30000 && serial < 80000){ const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000); return mk(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
    return null;
  }
  if(/[a-z]/i.test(s) && s.length > 5){ const d = new Date(s); if(!isNaN(d.getTime())) return fcIso(d); }
  return null;
}

// ----- Reading a file -----

// CSV or tab-separated text → {headers, rows}. An export that stacks a
// second header row ("Sales Metric (Export)" / "Secondary Metric" under
// each destination) has the two folded into one label per column, so
// "Drive Thru — Sales Metric (Export)" can be recognized.
function fcParseTable(text){
  const src = String(text || '').replace(/^﻿/, '');
  const firstLine = (src.split(/\r?\n/).find(l => l.trim()) || '');
  const delim = (firstLine.match(/\t/g) || []).length >= (firstLine.match(/,/g) || []).length ? '\t' : ',';
  const rows = [];
  let row = [], field = '', q = false;
  for(let i = 0; i < src.length; i++){
    const c = src[i];
    if(q){
      if(c === '"'){ if(src[i + 1] === '"'){ field += '"'; i++; } else q = false; }
      else field += c;
    } else if(c === '"') q = true;
    else if(c === delim){ row.push(field); field = ''; }
    else if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
    else if(c !== '\r') field += c;
  }
  if(field || row.length){ row.push(field); rows.push(row); }
  const kept = rows.filter(r => r.some(c => c.trim() !== ''));
  if(!kept.length) return {headers: [], rows: []};
  const width = Math.max(...kept.map(r => r.length));
  const pad = r => { const a = r.slice(0, width); while(a.length < width) a.push(''); return a; };
  let headers = pad(kept[0]).map(h => h.trim());
  let data = kept.slice(1).map(pad);
  if(data.length && fcLooksLikeHeaderRow(data[0])){
    headers = headers.map((h, i) => { const b = data[0][i].trim(); return h && b ? `${h} — ${b}` : (h || b); });
    data = data.slice(1);
  }
  return {headers, rows: data};
}
function fcLooksLikeHeaderRow(row){
  let nonBlank = 0, words = 0;
  row.forEach(c => { const t = (c || '').trim(); if(!t) return; nonBlank++; if(fcNum(t) === null && fcDate(t) === null) words++; });
  return nonBlank >= 3 && words / nonBlank >= 0.6;
}

// Which column holds each field, guessed from the headers (and, for the
// date, from the values when no header says so). A "Total — …" column wins
// over a per-destination one for the same metric.
function fcGuessMap(headers, rows){
  const lower = headers.map(h => (h || '').toLowerCase());
  const map = {};
  FC_FIELDS.forEach(f => {
    let idx = -1;
    for(const kw of f.kws){
      const ok = i => lower[i].includes(kw) && !(f.not && f.not.test(lower[i]));
      idx = lower.findIndex((h, i) => h.startsWith('total') && ok(i));
      if(idx === -1) idx = lower.findIndex((h, i) => ok(i));
      if(idx > -1) break;
    }
    // A header can say "date" without holding one (a Tableau week code
    // built from [Business Date], say): the values have to parse.
    if(f.isDate && idx > -1 && !fcColumnHoldsDates(rows, idx)) idx = -1;
    if(f.key === 'date' && idx === -1) idx = fcSniffDateColumn(headers, rows);
    if(idx > -1) map[f.key] = idx;
  });
  return map;
}
function fcColumnHoldsDates(rows, c){
  let hits = 0, total = 0;
  rows.slice(0, 30).forEach(r => { const v = (r[c] || '').trim(); if(!v) return; total++; if(fcDate(v)) hits++; });
  return total >= 1 && hits / total > 0.5;
}
function fcSniffDateColumn(headers, rows){
  const sample = rows.slice(0, 30);
  let best = -1, bestScore = 0;
  for(let c = 0; c < headers.length; c++){
    let hits = 0, total = 0;
    sample.forEach(r => { const v = (r[c] || '').trim(); if(!v) return; total++; if(fcDate(v)) hits++; });
    const score = total ? hits / total : 0;
    if(total >= 3 && score > 0.7 && score > bestScore){ bestScore = score; best = c; }
  }
  return best;
}

// Per-destination sales columns from folded headers like
// "Drive Thru — Sales Metric (Export)": the dollar column for each
// destination, never the Total or the paired % change ("Secondary Metric").
function fcChannelColumns(headers){
  const out = [];
  headers.forEach((h, i) => {
    const parts = String(h || '').split(' — ');
    if(parts.length < 2) return;
    const name = parts[0].trim(), metric = parts.slice(1).join(' — ').toLowerCase();
    if(!name || name.toLowerCase() === 'total' || /secondary/.test(metric)) return;
    if(/sales|metric|amount|revenue/.test(metric)) out.push({index: i, name});
  });
  return out;
}

// A parsed table + column map → one record per dated row.
function fcRecordsFromTable(table, map){
  if(map.date == null) return [];
  const channelCols = fcChannelColumns(table.headers);
  const out = [];
  table.rows.forEach(r => {
    const date = fcDate(r[map.date]);
    if(!date) return;
    const rec = {date};
    let any = false;
    Object.entries(FC_FIELD_TO_KEY).forEach(([field, key]) => {
      if(map[field] == null) return;
      const v = fcNum(r[map[field]]);
      if(v !== null){ rec[key] = v; any = true; }
    });
    if(map.lastYearDate != null){ const ly = fcDate(r[map.lastYearDate]); if(ly) rec.lastYearDate = ly; }
    channelCols.forEach(c => { const v = fcNum(r[c.index]); if(v !== null){ rec.channels = rec.channels || {}; rec.channels[c.name] = v; any = true; } });
    if(any) out.push(rec);
  });
  return out;
}

// Records → salesHistory, by date. A field in the file replaces the stored
// one; fields the file doesn't carry are kept. Returns the days touched.
function fcMergeRecords(records, hist){
  const h = hist || salesHistory;
  let n = 0;
  records.forEach(rec => {
    if(!rec || !fcValidIso(rec.date)) return;
    const day = h[rec.date] = (h[rec.date] && typeof h[rec.date] === 'object') ? h[rec.date] : {};
    FC_DAY_KEYS.forEach(key => { if(rec[key] != null) day[key] = rec[key]; });
    if(rec.channels){ day.channels = {...(day.channels || {})}; Object.entries(rec.channels).forEach(([name, v]) => { if(v != null) day.channels[name] = v; }); }
    n++;
  });
  return n;
}

// The Analytics Hub sales-by-day export, as rpParseSales reads it: every
// day's total and its sales by destination.
function fcMergeSalesExport(parsed, hist){
  if(!parsed || !Array.isArray(parsed.days)) return 0;
  const records = parsed.days.map(([iso, sales, change]) => {
    const rec = {date: iso, sales, channels: (parsed.channelDays || {})[iso] || null};
    // The export's change vs last year gives last year's figure for the
    // same weekday a year back (the comparison Analytics Hub makes).
    if(sales != null && change != null && change > -1 && fcValidIso(iso)){ rec.lastYearSales = sales / (1 + change); rec.lastYearDate = fcAddDays(iso, -FC_YEAR_DAYS); }
    return rec;
  });
  const n = fcMergeRecords(records, hist);
  if(n && typeof fcRerender === 'function') fcRerender();
  return n;
}

// Is this text a labor-by-day export? (Hours or cost by date, not the
// hourly productivity report, which Data Uploads recognizes first.)
function fcLooksLikeLabor(text){
  const head = String(text || '').replace(/\u0000/g, '').slice(0, 4000);
  if(/Daypart Hours Swap/i.test(head)) return false;
  return /(timekeeping|labor\s*(hours|cost|%|pct|percent|dollars)|effective wage|worked hours)/i.test(head);
}

// A record's last-year figure only counts when the day lacks one.
// Data Uploads handler for a labor (or any sales/labor) file.
async function fcImportLaborFile(file, text, buffer){
  let table;
  if(/\.(xlsx|xls)$/i.test(file.name)){
    const wb = XLSX.read(new Uint8Array(buffer), {type: 'array'});
    table = fcParseTable(XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]));
  } else table = fcParseTable(text);
  if(!table.headers.length) throw new Error('Couldn’t find any rows in this file.');
  const map = fcGuessMap(table.headers, table.rows);
  if(map.date == null) throw new Error('Couldn’t find the date column in this file. Open Forecast → Data and pick the columns by hand.');
  const records = fcRecordsFromTable(table, map);
  if(!records.length) throw new Error('No dated rows with numbers in this file. Open Forecast → Data to check which column is which.');
  const n = fcMergeRecords(records);
  const dates = records.map(r => r.date).sort();
  const range = dates[0] === dates[dates.length - 1] ? fcShort(dates[0]) : `${fcShort(dates[0])} – ${fcShort(dates[dates.length - 1])}`;
  const fields = ['sales', 'lastYearSales', 'laborHours', 'laborCost', 'laborPct', 'wage', 'checkAverage', 'transactions'].filter(k => records.some(r => r[k] != null));
  duRecord('labor', {file: file.name, summary: `${range} · ${n} day${n === 1 ? '' : 's'}`, periodEnd: dates[dates.length - 1]});
  if(typeof rpApplyToScoreboard === 'function') rpApplyToScoreboard();
  await saveState();
  fcRerender();
  const names = {laborHours: 'labor hours', laborCost: 'labor cost', laborPct: 'labor %', wage: 'wage', sales: 'sales', lastYearSales: "last year's sales", checkAverage: 'check average', transactions: 'transactions'};
  return `${range}: ${n} day${n === 1 ? '' : 's'} (${fields.map(f => names[f]).join(', ') || 'no labor columns found'}) → Forecast`;
}

// Data Uploads row for "Labor by day".
function fcLaborSourceState(freq, now, logAt){
  const days = Object.keys(salesHistory).filter(iso => fcValidIso(iso) && (salesHistory[iso].laborHours != null || salesHistory[iso].laborCost != null)).sort();
  const latest = days[days.length - 1] || null;
  if(!latest) return {status: 'overdue', freq, cover: 'No labor by day yet — the forecast shows sales only', note: 'Upload a labor export so the forecast can turn sales into labor hours.', last: logAt};
  const {start, prev} = duPeriods(freq, now);
  const d = fcToDate(latest);
  const status = d >= duAddDays(start, -1) ? 'fresh' : d >= duAddDays(prev, -1) ? 'due' : 'overdue';
  return {status, freq, cover: `Labor through ${fcShort(latest)} · ${days.length} days`, note: status === 'fresh' ? '' : 'Upload the latest labor by day so $ per labor hour stays current.', last: logAt};
}

// ----- The model -----

// Dated rows with sales, oldest first; before `cutoff` (exclusive) when
// given; only the last `weeks` weeks of what's there when weeks > 0.
function fcHistoryRows(hist, weeks, cutoff){
  const h = hist || salesHistory;
  let rows = Object.keys(h).filter(iso => fcValidIso(iso) && h[iso] && h[iso].sales != null && !isNaN(h[iso].sales) && (!cutoff || iso < cutoff))
    .sort().map(iso => ({...h[iso], date: iso, dow: fcDow(iso)}));
  if(weeks > 0 && rows.length){
    const from = fcAddDays(rows[rows.length - 1].date, -(weeks * 7) + 1);
    rows = rows.filter(r => r.date >= from);
  }
  return rows;
}

// Per weekday: average sales, transactions and labor hours over the days
// the store was open. A $0 day is a closed day (DayTrack logs Sundays that
// way; the sales export leaves them out), so it never drags a weekday's
// average; a weekday with no open day across three weeks or more is closed.
function fcDowStats(rows){
  const b = Array.from({length: 7}, () => ({sales: [], trans: [], labor: []}));
  rows.forEach(r => {
    if(!(r.sales > 0) || r.unusual) return;
    b[r.dow].sales.push(r.sales);
    if(r.transactions != null) b[r.dow].trans.push(r.transactions);
    if(r.laborHours != null) b[r.dow].labor.push(r.laborHours);
  });
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  let span = 0;
  if(rows.length) span = (fcToDate(rows[rows.length - 1].date) - fcToDate(rows[0].date)) / 86400000;
  return b.map(x => {
    const closed = x.sales.length === 0 && span >= FC_CLOSED_SPAN_DAYS;
    return {sales: closed ? 0 : avg(x.sales), transactions: closed ? 0 : avg(x.trans), laborHours: avg(x.labor), days: x.sales.length, closed};
  });
}

// Sales by week (Sunday start), full weeks only — a week that's still in
// progress, or that an export only caught the end of, would drag the trend.
function fcWeeklySeries(rows, pick){
  const byWeek = {};
  rows.forEach(r => {
    const v = pick ? pick(r) : (r.salesForTrend != null ? r.salesForTrend : r.sales);
    if(v == null || isNaN(v)) return;
    const w = fcWeekOf(r.date);
    const e = byWeek[w] = byWeek[w] || {week: w, sales: 0, days: 0};
    e.sales += v; if(r.sales > 0) e.days++;
  });
  return Object.values(byWeek).filter(w => w.days >= FC_FULL_WEEK_DAYS).sort((a, b) => a.week.localeCompare(b.week));
}

function fcLinearTrend(series){
  const n = series.length;
  if(n < 2) return {slope: 0, intercept: n ? series[0].sales : 0, weeklyGrowthPct: 0, n};
  const xs = series.map((_, i) => i), ys = series.map(s => s.sales);
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for(let i = 0; i < n; i++){ num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = den ? num / den : 0;
  return {slope, intercept: my - slope * mx, weeklyGrowthPct: my ? (slope / my) * 100 : 0, n};
}

// Everything the forecast needs from a window of history.
// ----- Unusual days -----
// A day that isn't a normal day shouldn't shape the forecast of normal
// days: one with a special event typed into Know the Numbers, or one far
// from its weekday's median (a storm, a one-off catering day). They're left
// out of the weekday averages and the run-rate, and the weekday median
// stands in for them in the weekly trend. Patterns lists them.

function fcMedian(arr){
  if(!arr.length) return null;
  const a = arr.slice().sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// The special event(s) typed into Know the Numbers for a day, from the
// current fortnight or the year of finished days it keeps, and the
// calendar's short events that count as one (events.js); null if none.
function fcEventFor(iso){
  const texts = [];
  const cur = typeof numbersData !== 'undefined' && numbersData ? numbersData[iso] : null;
  if(cur && typeof cur === 'object') Object.values(cur).forEach(e => { const t = e && String(e.specialEvents || '').trim(); if(t) texts.push(t); });
  const past = typeof numbersHistory !== 'undefined' && numbersHistory ? numbersHistory[iso] : null;
  if(past && typeof past === 'object') Object.values(past).forEach(rec => { const t = Array.isArray(rec) ? String(rec[2] || '').trim() : ''; if(t) texts.push(t); });
  if(typeof eventsForNumbers === 'function') eventsForNumbers(iso).forEach(t => { if(!texts.some(x => x.toLowerCase().includes(t.toLowerCase()))) texts.push(t); });
  return texts.length ? [...new Set(texts)].join(' · ') : null;
}

// Marks rows: r.unusual = {kind: 'event', text} | {kind: 'outlier', pct},
// and r.salesForTrend. Returns the rows left out. `on` false clears marks.
function fcMarkUnusual(rows, on){
  rows.forEach(r => { delete r.unusual; r.salesForTrend = r.sales; });
  if(on === false) return [];
  const left = [];
  rows.forEach(r => { if(!(r.sales > 0)) return; const ev = fcEventFor(r.date); if(ev){ r.unusual = {kind: 'event', text: ev}; left.push(r); } });
  const byDow = Array.from({length: 7}, () => []);
  rows.forEach(r => { if(r.sales > 0 && !r.unusual) byDow[r.dow].push(r.sales); });
  const med = byDow.map(fcMedian);
  rows.forEach(r => {
    if(!(r.sales > 0) || r.unusual) return;
    const m = med[r.dow];
    if(!(m > 0) || byDow[r.dow].length < FC_OUTLIER_MIN_DAYS) return;
    const pct = (r.sales / m - 1) * 100;
    if(Math.abs(pct) > FC_OUTLIER_PCT){ r.unusual = {kind: 'outlier', pct}; left.push(r); }
  });
  rows.forEach(r => { if(r.unusual && med[r.dow] > 0) r.salesForTrend = med[r.dow]; });
  return left.sort((x, y) => x.date.localeCompare(y.date));
}
function fcOpts(){ const s = fcSettings(); return {unusual: s.unusual !== false}; }

function fcAnalysis(hist, weeks, cutoff, opts){
  const rows = fcHistoryRows(hist, weeks, cutoff);
  const left = fcMarkUnusual(rows, (opts || fcOpts()).unusual);
  const dow = fcDowStats(rows);
  const weekly = fcWeeklySeries(rows);
  const trend = fcLinearTrend(weekly);
  const sum = (arr, f) => arr.reduce((a, r) => a + f(r), 0);
  const withHours = rows.filter(r => r.laborHours > 0 && r.sales > 0);
  const avgSPLH = withHours.length ? sum(withHours, r => r.sales) / sum(withHours, r => r.laborHours) : null;
  const withCost = rows.filter(r => r.laborCost != null && r.sales > 0);
  const withPct = rows.filter(r => r.laborPct != null);
  let avgLaborPct = null;
  if(withCost.length) avgLaborPct = sum(withCost, r => r.laborCost) / sum(withCost, r => r.sales) * 100;
  else if(withPct.length) avgLaborPct = sum(withPct, r => r.laborPct) / withPct.length;
  const costHours = rows.filter(r => r.laborCost != null && r.laborHours > 0);
  const withWage = rows.filter(r => r.wage != null);
  let avgWage = null;
  if(costHours.length) avgWage = sum(costHours, r => r.laborCost) / sum(costHours, r => r.laborHours);
  else if(withWage.length) avgWage = sum(withWage, r => r.wage) / withWage.length;
  const lastYear = fcLastYearMap(hist, cutoff);
  const yoy = fcYoyRatio(rows, lastYear);
  const vsLastYearPct = yoy.ratio != null ? (yoy.ratio - 1) * 100 : null;
  return {rows, left, dow, weekly, trend, avgSPLH, avgLaborPct, avgWage, lastYear, yoyRatio: yoy.ratio, yoyDays: yoy.days, vsLastYearPct, lastYearDays: yoy.days,
    hasLastYear: Object.keys(lastYear).length > 0, yoyWeight: 0, hasTransactions: rows.some(r => r.transactions != null), hasLabor: withHours.length > 0};
}

// ----- Last year -----

// Last year's sales by date: the figure each DayTrack row carries for its
// own day a year earlier, and, when the history reaches back that far, the
// day's own row (which wins). Rows on or after `cutoff` don't count as
// this year's data, but the last-year figure they carry is a year old and
// always fair to use.
function fcLastYearMap(hist, cutoff){
  const h = hist || salesHistory;
  const out = {};
  Object.keys(h).forEach(iso => {
    const d = h[iso];
    if(!d || !fcValidIso(iso)) return;
    if(d.lastYearSales != null && fcValidIso(String(d.lastYearDate || ''))) out[d.lastYearDate] = d.lastYearSales;
  });
  Object.keys(h).forEach(iso => {
    const d = h[iso];
    if(d && fcValidIso(iso) && d.sales != null && !isNaN(d.sales) && (!cutoff || iso < cutoff)) out[iso] = d.sales;
  });
  return out;
}

// This year against the same days last year over the window — the
// run-rate last year's figure is scaled by. Needs a week of paired days.
function fcYoyRatio(rows, lastYear){
  let ty = 0, ly = 0, n = 0;
  rows.forEach(r => {
    if(!(r.sales > 0) || r.unusual) return;
    const prev = r.lastYearSales > 0 ? r.lastYearSales : (lastYear || {})[fcAddDays(r.date, -FC_YEAR_DAYS)];
    if(!(prev > 0)) return;
    ty += r.sales; ly += prev; n++;
  });
  return {ratio: n >= FC_YOY_MIN_DAYS && ly > 0 ? ty / ly : null, days: n};
}

// The share of the baseline that comes from last year, for the chosen
// model: a fixed mix, or whichever mix the backtest scores best.
function fcModelWeight(model, hist, weeks){
  if(model === 'weekday') return 0;
  if(model === 'lastyear') return 1;
  if(model === 'blend') return 0.5;
  return fcBestYoyWeight(hist, weeks);
}
// `weeks` is a number, or an array of seven (one window per weekday).
function fcWeeksFor(weeks, dow){ return Array.isArray(weeks) ? weeks[dow] : weeks; }
function fcBestYoyWeight(hist, weeks){
  const scores = fcBacktestScores(hist, FC_AUTO_TEST_DAYS, weeks);
  if(!scores || !scores.days) return 0;
  let best = 0, bestAcc = -1;
  FC_YOY_WEIGHTS.forEach(w => { const acc = scores.byWeight[w]; if(acc != null && acc > bestAcc + 1e-9){ bestAcc = acc; best = w; } });
  return best;
}
function fcModelLabel(model, weight){
  if(model === 'weekday' || weight === 0) return 'weekday average';
  if(model === 'lastyear' || weight === 1) return 'last year × run-rate';
  return `${Math.round(weight * 100)}% last year · ${Math.round((1 - weight) * 100)}% weekday`;
}

// The analysis for the current settings, with the model's blend weight.
function fcAnalysisFor(s){
  const pick = s.lookback === 'auto' ? fcLookbackPick(salesHistory, FC_AUTO_TEST_DAYS) : null;
  const weeks = pick ? pick.overall : +s.lookback;
  const a = fcAnalysis(salesHistory, weeks);
  if(pick){
    // One analysis per distinct window; weekdays whose window differs from
    // the overall one read their averages from it.
    const byWindow = {[weeks]: a};
    a.perDow = pick.perDow.map(w => { if(w === weeks) return null; byWindow[w] = byWindow[w] || fcAnalysis(salesHistory, w); return byWindow[w]; });
    a.lookbackPick = pick;
  }
  a.yoyWeight = a.hasLastYear ? fcModelWeight(s.model, salesHistory, pick ? pick.perDow : weeks) : 0;
  return a;
}

// ----- Look-back window -----
// How many weeks of history each weekday's average should use is a
// question the backtest can answer: score the weekday model under each
// window on the last 28 open days, and give every weekday the window that
// was closest for it (the overall best until a weekday has 3 scored days).
let fcLookbackMemo = null;
function fcLookbackPick(hist, testDays){
  const h = hist || salesHistory;
  const keys = Object.keys(h);
  const key = `${keys.length}|${keys.sort().slice(-1)[0] || ''}|${Object.values(h).reduce((t, d) => t + (d && d.sales > 0 ? d.sales : 0), 0)}|${fcOpts().unusual}|${testDays}`;
  if(fcLookbackMemo && fcLookbackMemo.key === key && fcLookbackMemo.hist === h) return fcLookbackMemo.pick;
  const all = fcHistoryRows(h, 0).filter(r => r.sales > 0).slice(-testDays);
  const score = {};   // window → {acc, n, byDow: [{acc, n}]}
  FC_LOOKBACKS.forEach(w => { score[w] = {acc: 0, n: 0, byDow: Array.from({length: 7}, () => ({acc: 0, n: 0}))}; });
  all.forEach(row => {
    FC_LOOKBACKS.forEach(w => {
      const a = fcAnalysis(h, w, row.date);
      if(a.rows.length < 7) return;
      const acc = fcAccuracy(row.sales, fcBaseline(row.date, a, 0).sales);
      if(acc == null) return;
      const sc = score[w]; sc.acc += acc; sc.n++; sc.byDow[row.dow].acc += acc; sc.byDow[row.dow].n++;
    });
  });
  const best = (get) => { let bw = FC_LOOKBACKS[1], bv = -1; FC_LOOKBACKS.forEach(w => { const x = get(score[w]); if(x.n && x.acc / x.n > bv + 1e-9){ bv = x.acc / x.n; bw = w; } }); return {w: bw, acc: bv < 0 ? null : bv, n: get(score[bw]).n}; };
  const overallPick = best(sc => sc);
  const perDow = [], perDowAcc = [];
  for(let d = 0; d < 7; d++){
    const pickD = best(sc => sc.byDow[d]);
    const own = pickD.n >= FC_LOOKBACK_MIN_DAYS;
    perDow.push(own ? pickD.w : overallPick.w);
    perDowAcc.push(own ? pickD.acc : null);
  }
  const pick = {overall: overallPick.w, overallAcc: overallPick.acc, days: overallPick.n, perDow, perDowAcc,
    byWindow: Object.fromEntries(FC_LOOKBACKS.map(w => [w, score[w].n ? score[w].acc / score[w].n : null]))};
  fcLookbackMemo = {key, hist: h, pick};
  return pick;
}
// "Mon, Tue: 8 wks · Wed: 4 wks …", leaving closed weekdays out.
function fcLookbackText(pick, a){
  if(!pick) return '';
  const groups = {};
  pick.perDow.forEach((w, d) => { if(a && a.dow[d] && a.dow[d].closed) return; (groups[w] = groups[w] || []).push(FC_DOW[d]); });
  return Object.entries(groups).sort((x, y) => +x[0] - +y[0]).map(([w, days]) => `${days.join(', ')}: ${w} wks`).join(' · ');
}

// The model's own expectation for one day: the weekday average carried
// forward by the trend.
// The model's own expectation for one day: the weekday average carried
// forward by the trend, blended with the same day last year × the
// run-rate when last year's figure is there. `weight` (0–1) is the share
// from last year; it defaults to the analysis's. A day the store was
// closed a year ago is flagged, and the weekday figure stands.
function fcBaseline(iso, src, weight){
  const dow = fcDow(iso);
  const a = src.perDow && src.perDow[dow] ? src.perDow[dow] : src;
  const stat = a.dow[dow];
  if(!stat || stat.sales == null) return {sales: null, transactions: null, dow, closed: false};
  if(stat.closed) return {sales: 0, transactions: 0, dow, closed: true};
  const last = a.rows.length ? a.rows[a.rows.length - 1].date : iso;
  const weeksAhead = Math.max(0, (fcToDate(iso) - fcToDate(last)) / (7 * 86400000));
  const g = Math.max(-FC_MAX_TREND_PCT, Math.min(FC_MAX_TREND_PCT, a.trend.weeklyGrowthPct || 0));
  const dowSales = stat.sales * Math.pow(1 + g / 100, weeksAhead);
  const lastYearDate = fcAddDays(iso, -FC_YEAR_DAYS);
  const ly = a.lastYear ? a.lastYear[lastYearDate] : undefined;
  const w = weight != null ? weight : (src.yoyWeight || 0);
  let sales = dowSales, yoySales = null, yoyWeight = 0, closedLastYear = false;
  if(ly != null && a.yoyRatio != null){
    if(ly > 0){ yoySales = ly * a.yoyRatio; sales = w * yoySales + (1 - w) * dowSales; yoyWeight = w; }
    else closedLastYear = true;
  }
  const ratio = stat.transactions && stat.sales ? stat.transactions / stat.sales : null;
  return {sales, dowSales, yoySales, lastYear: ly == null ? null : ly, lastYearDate, closedLastYear, yoyWeight,
    transactions: ratio != null ? sales * ratio : stat.transactions, dow, closed: false};
}

// Labor hours for a day's adjusted sales under the chosen target.
function fcLaborHours(sales, s){
  if(sales == null) return null;
  if(s.method === 'pct'){
    const pct = +s.pct, wage = +s.wage;
    return pct > 0 && wage > 0 ? (sales * pct / 100) / wage : null;
  }
  const splh = +s.splh;
  return splh > 0 ? sales / splh : null;
}

// 100% when the forecast lands on the day's actual sales, 0% when it's off
// by the whole amount.
function fcAccuracy(actual, forecast){
  if(actual == null || forecast == null || isNaN(actual) || isNaN(forecast)) return null;
  const denom = Math.max(Math.abs(actual), Math.abs(forecast));
  if(!denom) return 100;
  return Math.max(0, (1 - Math.abs(actual - forecast) / denom) * 100);
}

// Forecast each of the last `testDays` days using only the history before
// it, and score the result.
// `weight` is the share from last year (the analysis's model weight when
// omitted). Each result also carries the forecast under every mix, so the
// Accuracy tab can show which would have been closest.
function fcBacktest(hist, testDays, weeks, weight){
  const all = fcHistoryRows(hist, 0);
  const out = [];
  all.filter(r => r.sales > 0).slice(-testDays).forEach(row => {
    const a = fcAnalysis(hist, fcWeeksFor(weeks, row.dow), row.date);
    if(a.rows.length < 7) return;
    const base = fcBaseline(row.date, a, weight == null ? 0 : weight);
    const acc = fcAccuracy(row.sales, base.sales);
    if(acc == null) return;
    const byWeight = {};
    FC_YOY_WEIGHTS.forEach(w => { byWeight[w] = fcBaseline(row.date, a, w).sales; });
    out.push({date: row.date, dow: row.dow, actual: row.sales, forecast: base.sales, accuracy: acc, byWeight, hadLastYear: base.yoySales != null});
  });
  return out;
}
// Average accuracy under each mix over the last `testDays` open days, or
// null when no day had a last-year figure (every mix is then the same).
function fcBacktestScores(hist, testDays, weeks){
  const results = fcBacktest(hist, testDays, weeks, 0);
  if(!results.length || !results.some(r => r.hadLastYear)) return null;
  const byWeight = {}, miss = {};
  FC_YOY_WEIGHTS.forEach(w => {
    byWeight[w] = results.reduce((t, r) => t + fcAccuracy(r.actual, r.byWeight[w]), 0) / results.length;
    miss[w] = results.reduce((t, r) => t + Math.abs(r.actual - r.byWeight[w]), 0) / results.length;
  });
  return {days: results.length, withLastYear: results.filter(r => r.hadLastYear).length, byWeight, miss};
}

// Sales by destination over the window: total, average per day, share.
function fcChannelStats(rows){
  const totals = {}, counts = {};
  rows.forEach(r => {
    if(!r.channels) return;
    Object.entries(r.channels).forEach(([name, v]) => { if(v == null || isNaN(v)) return; totals[name] = (totals[name] || 0) + v; counts[name] = (counts[name] || 0) + 1; });
  });
  const names = Object.keys(totals);
  if(!names.length) return null;
  const grand = names.reduce((s, n) => s + totals[n], 0);
  const channels = names.map(name => ({name, total: totals[name], avgPerDay: totals[name] / counts[name], share: grand ? totals[name] / grand : 0, color: fcChannelColor(name)})).sort((a, b) => b.total - a.total);
  return {channels, grandTotal: grand};
}
function fcChannelColor(name){
  let idx = FC_CHANNEL_ORDER.indexOf(name);
  if(idx === -1){ let h = 0; for(let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; idx = h % 6; }
  return `var(--fc-chan-${(idx % 6) + 1})`;
}

// ----- The WIG from DayTrack -----
// Month-to-date and year-to-date sales with the change against last year,
// from the DayTrack rows, so the Guest Obsession WIG keeps up with the
// weekly DayTrack upload and the sales-by-destination export only has to
// serve the channel mix. A period is exact when every open weekday from
// its start is there and every day has last year's figure; otherwise the
// change is estimated from the days that have one and marked so. Year to
// date needs history reaching back to the start of the year.
function fcWigFromHistory(hist, nowIso){
  const h = hist || salesHistory;
  const rows = fcHistoryRows(h, 0).filter(r => r.date <= nowIso);
  if(!rows.length) return null;
  const period = from => {
    const inP = rows.filter(r => r.date >= from);
    if(!inP.length) return null;
    const to = inP[inP.length - 1].date;
    let total = 0, open = 0, withLy = 0, lyTotal = 0, tyWithLy = 0;
    inP.forEach(r => { total += r.sales; if(r.sales > 0){ open++; if(r.lastYearSales > 0){ withLy++; lyTotal += r.lastYearSales; tyWithLy += r.sales; } } });
    let gaps = 0;
    for(let d = from; d <= to; d = fcAddDays(d, 1)) if(fcDow(d) !== 0 && !h[d]) gaps++;
    const change = withLy && lyTotal > 0 ? tyWithLy / lyTotal - 1 : null;
    return {from, to, total, change, days: inP.length, gaps, estimated: gaps > 0 || withLy < open, source: 'daytrack'};
  };
  const month = nowIso.slice(0, 8) + '01', jan1 = nowIso.slice(0, 4) + '-01-01';
  const mtd = period(month);
  // Year to date only when the year is really covered: a row in its first
  // days and no more than a handful of missing weekdays (holiday closures).
  const startsAtJan = rows.some(r => r.date >= jan1 && r.date <= fcAddDays(jan1, 3));
  let ytd = startsAtJan ? period(jan1) : null;
  if(ytd && ytd.gaps > 4) ytd = null;
  return {mtd, ytd};
}

// ----- Know the Numbers feed -----
// Know the Numbers holds projected sales and a productivity goal ($ per
// labor hour) per FOH daypart. A forecast day is split into dayparts by the
// weekday's hourly sales shape from the productivity-by-hour report (break
// planner's profiles); without one, evenly by hour. Transition (1:00–2:00)

// numbersDayparts (the four Know the Numbers dayparts) → [{name, start,
// end}] in minutes from midnight. `time` is the 24-hour start; the end
// comes from the name ("(11:00-2:00)" → 2:00 PM).
function fcDaypartWindows(dayparts){
  return (dayparts || (typeof numbersDayparts !== 'undefined' ? numbersDayparts : fohDayparts)).map(dp => {
    const [sh, sm] = String(dp.time || '0:00').split(':').map(Number);
    const start = sh * 60 + (sm || 0);
    const m = String(dp.name).match(/\(\d{1,2}:\d{2}\s*-\s*(\d{1,2}):(\d{2})\)/);
    let end = m ? (+m[1]) * 60 + (+m[2]) : start + 180;
    while(end <= start) end += 720;
    return {name: dp.name, start, end};
  });
}

// Sales weight per hour from a productivity profile's hours
// ({hourMin: {prod, labor, salesPerDay}}): that hour's average sales, or
// $/labor hour × labor hours. Null when the profile has neither.
function fcHourWeights(hours){
  const out = {};
  let any = false;
  Object.entries(hours || {}).forEach(([h, v]) => {
    if(!v) return;
    const w = v.salesPerDay != null ? v.salesPerDay : (v.prod != null && v.labor != null ? v.prod * v.labor : null);
    if(w != null && w >= 0){ out[Math.floor(+h / 60) * 60] = (out[Math.floor(+h / 60) * 60] || 0) + w; any = true; }
  });
  return any ? out : null;
}

// 'Breakfast (6:00-11:00)' → 'Breakfast'
function fcDaypartKey(name){ return String(name).replace(/\s*\(.*$/, ''); }

// A mix ({Breakfast: 18.5, Lunch: 27, …} in %) → shares summing to 1 for
// the windows, or null when it doesn't cover them.
function fcMixShares(mix, wins){
  if(!mix || typeof mix !== 'object') return null;
  const vals = wins.map(w => +mix[fcDaypartKey(w.name)]);
  if(vals.some(v => !(v >= 0)) || !vals.some(v => v > 0)) return null;
  const total = vals.reduce((a, b) => a + b, 0);
  const out = {};
  wins.forEach((w, i) => { out[w.name] = vals[i] / total; });
  return out;
}

// A day's sales → {daypart name: $}. A mix set by hand wins; else the hour
// weights (the weekday's productivity report) over the day's open span; else
// Buda's typical mix; else every hour counts the same.
function fcSplitDay(sales, weights, windows, mix){
  const wins = windows || fcDaypartWindows();
  const fixed = fcMixShares(mix, wins) || (weights ? null : fcMixShares(FC_DEFAULT_MIX, wins));
  const out = {};
  if(fixed){
    wins.forEach(w => { out[w.name] = sales * fixed[w.name]; });
    return out;
  }
  // Hour weights sit on the hour; a window ending at 10:30 takes half of
  // the 10 o'clock hour.
  const lo = Math.min(...wins.map(w => w.start)), hi = Math.max(...wins.map(w => w.end));
  const hours = Object.keys(weights || {}).map(Number);
  const weighed = (a, b) => hours.reduce((t, h) => t + fcHourOverlap(h, a, b) * (weights[h] || 0), 0);
  const total = weights ? weighed(lo, hi) : 0;
  const even = !weights || total <= 0;
  wins.forEach(w => {
    out[w.name] = even ? sales * (w.end - w.start) / (hi - lo) : sales * weighed(w.start, w.end) / total;
  });
  return out;
}
// How much of the hour starting at `h` (minutes) falls inside [a, b): 0–1.
function fcHourOverlap(h, a, b){ return Math.max(0, Math.min(b, h + 60) - Math.max(a, h)) / 60; }

// Each daypart's productivity against the day's (1 = the day's $/labor
// hour) from a profile's hours ({hourMin: {prod, labor}}); null without
// $/labor hour and hours. A daypart with no hours reads 1.
function fcDaypartRatios(hours, windows){
  const wins = windows || fcDaypartWindows();
  const acc = {};
  let S = 0, L = 0;
  Object.entries(hours || {}).forEach(([h, v]) => {
    if(!v || v.prod == null || v.labor == null || !(v.labor > 0)) return;
    wins.forEach(w => {
      const f = fcHourOverlap(+h, w.start, w.end);
      if(f <= 0) return;
      const a = acc[w.name] = acc[w.name] || {s: 0, l: 0};
      a.s += v.prod * v.labor * f; a.l += v.labor * f; S += v.prod * v.labor * f; L += v.labor * f;
    });
  });
  if(!(S > 0) || !(L > 0)) return null;
  const day = S / L, out = {};
  wins.forEach(w => { const a = acc[w.name]; out[w.name] = a && a.l > 0 ? (a.s / a.l) / day : 1; });
  return out;
}
function fcDefaultRatios(windows){
  const out = {};
  (windows || fcDaypartWindows()).forEach(w => { const r = FC_DEFAULT_PROD_RATIO[fcDaypartKey(w.name)]; out[w.name] = r > 0 ? r : 1; });
  return out;
}

// ----- Sales by weekday and daypart (Analytics Hub, a week a file) -----
// Rows read "Mon, Breakfast" with the week's sales by destination; no
// dates, so a week is known by its day totals and kept by upload time.

function fcLooksLikeDaypartWeek(text){
  const head = String(text || '').replace(/\u0000/g, '').slice(0, 8000);
  return /Sales Metric \(Export\)/.test(head) && /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*(Breakfast|Lunch|Afternoon|Dinner)\b/i.test(head);
}

// → {key, total, days: {Mon: {Breakfast: $, Lunch: $, …}, …}}
function fcParseDaypartWeek(text){
  const rows = duParseTsv(text);
  const days = {};
  let total = null;
  rows.forEach(r => {
    if(String(r[0] || '').trim() === 'Total'){ total = fcNum(r[2]); return; }
    const m = String(r[1] || '').trim().match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*(Breakfast|Lunch|Afternoon|Dinner)$/i);
    const v = m ? fcNum(r[2]) : null;
    if(!m || v == null) return;
    const dow = m[1][0].toUpperCase() + m[1].slice(1, 3).toLowerCase();
    const dp = m[2][0].toUpperCase() + m[2].slice(1).toLowerCase();
    (days[dow] = days[dow] || {})[dp] = v;
  });
  if(!Object.keys(days).length) throw new Error('No weekday-by-daypart rows ("Mon, Breakfast" …) in this export.');
  const dayTotal = d => Object.values(d).reduce((a, b) => a + b, 0);
  const key = Object.keys(days).sort().map(d => `${d}:${Math.round(dayTotal(days[d]))}`).join('|');
  return {key, days, total: total != null ? total : Object.values(days).reduce((t, d) => t + dayTotal(d), 0)};
}

async function fcImportDaypartWeek(file, text){
  const w = fcParseDaypartWeek(text);
  daypartWeeks[w.key] = {at: new Date().toISOString(), file: file.name, total: w.total, days: w.days};
  const keys = Object.keys(daypartWeeks).sort((a, b) => String(daypartWeeks[a].at).localeCompare(String(daypartWeeks[b].at)));
  keys.slice(0, Math.max(0, keys.length - FC_WEEKS_KEEP)).forEach(k => { delete daypartWeeks[k]; });
  const n = Object.keys(daypartWeeks).length;
  duRecord('dayparts', {file: file.name, summary: `${fcMoney(w.total)} week · ${n} week${n === 1 ? '' : 's'} on file`});
  await saveState();
  fcRerender();
  const fri = fcWeekdayMix(5);
  return `${fcMoney(w.total)} for the week · ${n} week${n === 1 ? '' : 's'} on file${n < FC_MIX_MIN_WEEKS ? ` (${FC_MIX_MIN_WEEKS} needed before each weekday's own mix is used)` : fri ? ` · Fridays run ${fcMixText(fri.mix)}` : ''} → Forecast`;
}
function fcMixText(mix){ return Object.keys(FC_DEFAULT_MIX).map(k => `${k.toLowerCase()} ${Math.round(mix[k] || 0)}%`).join(', '); }

// A weekday's daypart shares across the weeks on file (each week weighs
// the same), as a mix in % → {mix, weeks}; null under FC_MIX_MIN_WEEKS.
function fcWeekdayMix(dow, weeks){
  const name = FC_DOW[dow];
  const sums = {};
  let n = 0;
  Object.values(weeks || daypartWeeks || {}).forEach(w => {
    const d = w && w.days && w.days[name];
    if(!d) return;
    const t = Object.values(d).reduce((a, b) => a + b, 0);
    if(!(t > 0)) return;
    n++;
    Object.entries(d).forEach(([k, v]) => { sums[k] = (sums[k] || 0) + 100 * v / t; });
  });
  if(n < FC_MIX_MIN_WEEKS) return null;
  const mix = {};
  Object.entries(sums).forEach(([k, v]) => { mix[k] = v / n; });
  return {mix, weeks: n};
}

// Data Uploads row state for the weekly daypart file.
function fcDaypartWeeksState(freq, now, logAt){
  const list = Object.values(daypartWeeks || {});
  if(!list.length) return {status: 'overdue', freq, cover: 'No weeks on file — the split uses Buda\'s typical mix', note: `Upload a week at a time; after ${FC_MIX_MIN_WEEKS} each weekday takes its own shape.`, last: logAt};
  const latest = list.slice().sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
  const learned = [1, 2, 3, 4, 5, 6].filter(d => fcWeekdayMix(d)).length;
  return {status: duStatusFromTime(logAt, freq, now), freq, cover: `${list.length} week${list.length === 1 ? '' : 's'} on file · latest ${fcMoney(latest.total)}${learned ? ` · ${learned} weekday${learned === 1 ? '' : 's'} with their own mix` : ''}`,
    note: list.length < FC_MIX_MIN_WEEKS ? `${FC_MIX_MIN_WEEKS - list.length} more week${FC_MIX_MIN_WEEKS - list.length === 1 ? '' : 's'} before each weekday's own mix is used.` : '', last: logAt};
}

// The productivity goal Know the Numbers gets: the $ per labor hour target,
// or the one a labor % and wage imply.
function fcGoalSplh(s, a){
  if(s.method === 'pct'){
    const pct = s.pct != null ? +s.pct : (a.avgLaborPct || 0), wage = s.wage != null ? +s.wage : (a.avgWage || 0);
    return pct > 0 && wage > 0 ? wage / (pct / 100) : null;
  }
  const splh = s.splh != null ? +s.splh : (a.avgSPLH ? Math.round(a.avgSPLH) : null);
  return splh > 0 ? splh : null;
}

// One entry per open forecast day: the adjusted sales, the day's goal, the
// split by daypart and each daypart's goal, with where the shape came from
// (source: 'mix' set by hand, the weekday of the productivity report, or
// 'default' for Buda's typical mix; goalSource likewise, or 'flat').
function fcNumbersPlan(){
  const s = fcSettings();
  const a = fcAnalysisFor(s);
  const goal = fcGoalSplh(s, a);
  const windows = fcDaypartWindows();
  const mix = fcMixShares(s.daypartMix, windows) ? s.daypartMix : null;
  const byDaypart = s.goalByDaypart !== false;
  return fcDates().map(iso => {
    const base = fcBaseline(iso, a);
    if(base.sales == null || base.closed) return null;
    const adj = +s.adjustments[iso] || 0;
    const sales = base.sales * (1 + adj / 100);
    const prof = typeof breakProfileFor === 'function' ? breakProfileFor(iso) : null;
    const weights = prof ? fcHourWeights(prof.hours) : null;
    // The split: a mix set by hand, else the weekday's own mix learned from
    // the weekly daypart files, else the weekday's hourly report, else
    // Buda's typical mix.
    const learned = mix ? null : fcWeekdayMix(base.dow);
    const useMix = mix || (learned && fcMixShares(learned.mix, windows) ? learned.mix : null);
    const profRatios = byDaypart && prof ? fcDaypartRatios(prof.hours, windows) : null;
    const ratios = byDaypart ? (profRatios || fcDefaultRatios(windows)) : null;
    const goals = {};
    windows.forEach(w => { goals[w.name] = goal == null ? null : goal * (ratios ? ratios[w.name] : 1); });
    return {date: iso, dow: base.dow, sales, baseline: base.sales, adj, model: fcModelLabel(s.model, base.yoyWeight), goal, goals,
      split: fcSplitDay(sales, useMix ? null : weights, windows, useMix), source: mix ? 'mix' : useMix ? `${learned.weeks} weeks` : weights ? prof.day : 'default',
      goalSource: !byDaypart ? 'flat' : profRatios ? prof.day : 'default'};
  }).filter(Boolean);
}

// Write the plan into Know the Numbers. Projected sales and goals for these
// days are replaced; special events are never touched.
async function fcApplyNumbers(plan){
  let cells = 0;
  plan.forEach(p => {
    const day = knNormalizeDay(numbersData[p.date] = numbersData[p.date] || {});
    Object.entries(p.split).forEach(([dp, v]) => {
      const entry = day[dp] = day[dp] || {};
      entry.projectedSales = formatAsCurrency(Math.round(v)); cells++;
      const g = p.goals && p.goals[dp] != null ? p.goals[dp] : p.goal;
      if(g != null){ entry.productivityGoal = formatAsCurrency(Math.round(g)); cells++; }
    });
    if(typeof touchLastUpdated === 'function') touchLastUpdated(p.date);
  });
  if(plan.length){
    const dates = plan.map(p => p.date);
    duRecord('numbers', {file: 'Forecast tab', summary: `${fcShort(dates[0])} – ${fcShort(dates[dates.length - 1])} · ${dates.length} day${dates.length === 1 ? '' : 's'} from the forecast`, periodEnd: dates[dates.length - 1]});
    fcLogPlan(plan, forecastLog, today);
  }
  await saveState();
  if(document.getElementById('numbersContent') && document.getElementById('numbersDaySelect') && document.getElementById('numbersDaySelect').value) renderNumbersContent();
  return cells;
}

// ----- Track record -----
// What was actually sent to Know the Numbers, kept so the Accuracy tab can
// score the real forecast (adjustments included) against the day once its
// actual lands — and show whether the adjustments helped.

// Records each planned day (today or later). A day sent again is replaced
// until it arrives; entries older than FC_LOG_KEEP_DAYS fall away.
function fcLogPlan(plan, log, todayIso){
  const now = new Date().toISOString();
  let n = 0;
  plan.forEach(p => {
    if(!fcValidIso(p.date) || p.date < todayIso || !(p.sales >= 0)) return;
    log[p.date] = {sales: Math.round(p.sales), baseline: Math.round(p.baseline), adj: p.adj || 0, model: p.model || '', at: now};
    n++;
  });
  const cutoff = fcAddDays(todayIso, -FC_LOG_KEEP_DAYS);
  Object.keys(log).forEach(iso => { if(!fcValidIso(iso) || iso < cutoff) delete log[iso]; });
  return n;
}

// Sent forecasts against actuals: per-day rows (newest first) and the
// summary — accuracy of what was sent, of the model's baseline at the
// time, how the adjusted days fared, and which way the forecast leans.
function fcTrackRecord(log, hist){
  const rows = [], waiting = [];
  Object.keys(log || {}).filter(fcValidIso).sort().forEach(iso => {
    const e = log[iso];
    if(!e || !(e.sales >= 0)) return;
    const day = (hist || {})[iso];
    const actual = day && day.sales > 0 ? day.sales : null;
    if(actual == null){ waiting.push(iso); return; }
    rows.push({date: iso, dow: fcDow(iso), sent: e.sales, baseline: e.baseline, adj: e.adj || 0, model: e.model || '', actual,
      accuracy: fcAccuracy(actual, e.sales), baselineAccuracy: fcAccuracy(actual, e.baseline), errorPct: (e.sales / actual - 1) * 100});
  });
  const avg = (arr, f) => arr.length ? arr.reduce((t, r) => t + f(r), 0) / arr.length : null;
  const adjusted = rows.filter(r => r.adj);
  return {
    rows: rows.slice().reverse(), waiting,
    days: rows.length,
    accuracy: avg(rows, r => r.accuracy),
    baselineAccuracy: avg(rows, r => r.baselineAccuracy),
    miss: avg(rows, r => Math.abs(r.actual - r.sent)),
    bias: avg(rows, r => r.errorPct),
    adjustedDays: adjusted.length,
    adjustedHelped: adjusted.filter(r => r.accuracy > r.baselineAccuracy + 1e-9).length
  };
}

function fcTrackRecordHtml(){
  const t = fcTrackRecord(forecastLog, salesHistory);
  const tier = acc => acc >= 90 ? 'is-good' : acc >= 75 ? 'is-warn' : 'is-bad';
  if(!t.days && !t.waiting.length) return `<div class="standup-card fc-compare"><h3>Your track record</h3><p class="fc-muted">Nothing sent yet. Press <b>Send to Know the Numbers</b> on the Forecast tab: each day you send is kept, and scored here once its actual sales land from the DayTrack export.</p></div>`;
  const head = t.days ? `<div class="fc-kpis">
      ${fcKpi(FC_ICON.percent, 'Sent forecasts', t.accuracy.toFixed(1) + '%', `${t.days} day${t.days === 1 ? '' : 's'} scored · avg miss ${fcMoney(t.miss)}`, tier(t.accuracy))}
      ${fcKpi(FC_ICON.trendUp, 'Model alone', t.baselineAccuracy.toFixed(1) + '%', t.accuracy > t.baselineAccuracy + 0.05 ? 'your adjustments beat it' : t.accuracy < t.baselineAccuracy - 0.05 ? 'the model alone did better' : 'about the same')}
      ${fcKpi(FC_ICON.check, 'Adjusted days', t.adjustedDays ? `${t.adjustedHelped} of ${t.adjustedDays}` : '—', t.adjustedDays ? 'helped vs the model alone' : 'no adjustments sent yet')}
      ${fcKpi(t.bias >= 0 ? FC_ICON.trendUp : FC_ICON.trendDown, 'Leans', fcPctFmt(t.bias), t.bias > 1 ? 'the sent forecast runs high' : t.bias < -1 ? 'the sent forecast runs low' : 'no lean to speak of')}
    </div>` : '';
  const rows = t.rows.map(r => `<tr class="${r.adj ? 'is-adjusted' : ''}"><td><b>${FC_DOW[r.dow]}</b> <span class="fc-muted">${fcShort(r.date)}</span></td><td class="fc-num">${fcMoney(r.sent)}${r.adj ? `<span class="fc-muted"> (${fcPctFmt(r.adj, 0)})</span>` : ''}</td><td class="fc-num">${fcMoney(r.baseline)}</td><td class="fc-num">${fcMoney(r.actual)}</td><td><span class="fc-pill ${tier(r.accuracy)}">${r.accuracy.toFixed(1)}%</span></td><td class="fc-num">${r.baselineAccuracy.toFixed(1)}%</td></tr>`).join('');
  return `<div class="standup-card fc-compare"><h3>Your track record <span class="sub">what was sent to Know the Numbers, against what happened</span></h3>
    ${head}
    ${t.days ? `<div class="fc-table-wrap"><table class="fc-table fc-table-sm"><thead><tr><th>Day</th><th class="fc-num">Sent</th><th class="fc-num">Model alone</th><th class="fc-num">Actual</th><th>Accuracy</th><th class="fc-num">Model alone</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
    ${t.waiting.length ? `<p class="fc-muted">${t.waiting.length} day${t.waiting.length === 1 ? '' : 's'} sent and waiting for actuals (${fcShort(t.waiting[0])}${t.waiting.length > 1 ? ` – ${fcShort(t.waiting[t.waiting.length - 1])}` : ''}) — they score once the DayTrack export covering them is uploaded.</p>` : ''}
  </div>`;
}

// ----- Settings -----

function fcSettings(){
  const s = {...FC_DEFAULTS, ...(forecastSettings && typeof forecastSettings === 'object' ? forecastSettings : {})};
  s.adjustments = (s.adjustments && typeof s.adjustments === 'object') ? s.adjustments : {};
  return s;
}
function fcSaveSettings(patch){
  const s = {...fcSettings(), ...patch};
  // Adjustments are for days ahead; past ones fall away.
  const kept = {};
  Object.entries(s.adjustments || {}).forEach(([iso, v]) => { if(fcValidIso(iso) && iso >= today && +v) kept[iso] = +v; });
  s.adjustments = kept;
  forecastSettings = s;
  if(typeof saveState === 'function') saveState();
}
function fcSetAdjustment(iso, pct){
  const adjustments = {...fcSettings().adjustments};
  const v = Math.max(-90, Math.min(200, Math.round(+pct || 0)));
  if(v) adjustments[iso] = v; else delete adjustments[iso];
  fcSaveSettings({adjustments});
}

// Session-only: the forecast's first day (tomorrow) and the open sub-tab.
let fcStart = null;
let fcTab = 'forecast';
let fcBacktestDays = 14;
let fcPendingFile = null;   // {name, table, map} chosen on the Data tab, before saving
let fcNumbersOpen = false;  // the Know the Numbers preview under the forecast table

function fcDates(){
  const s = fcSettings();
  if(!fcStart) fcStart = fcAddDays(today, 1);
  const out = [];
  for(let i = 0; i < (+s.days || 7); i++) out.push(fcAddDays(fcStart, i));
  return out;
}

// ----- Rendering -----

function renderForecastView(){
  const view = document.getElementById('forecastView');
  if(!view) return;
  const gate = document.getElementById('fcGate');
  const hasSession = typeof launchManager === 'undefined' || launchManager;
  const hist = fcHistoryRows(salesHistory, 0);
  view.querySelectorAll('.fc-tab').forEach(b => b.classList.toggle('active', b.dataset.fcTab === fcTab));
  view.querySelectorAll('.fc-panel').forEach(p => p.classList.toggle('active', p.id === 'fcPanel' + fcTab.charAt(0).toUpperCase() + fcTab.slice(1)));
  if(!hasSession){
    gate.hidden = false;
    gate.innerHTML = `<h3>Managers only</h3><p>Sales and labor history is private. Unlock <b>Manage</b> with the manager PIN on this device to see the forecast.</p>`;
    view.querySelectorAll('.fc-panel').forEach(p => { p.innerHTML = ''; });
    return;
  }
  if(!hist.length && fcTab !== 'data'){
    gate.hidden = false;
    gate.innerHTML = `<h3>No sales history yet</h3><p>Upload the Analytics Hub <b>sales by day</b> export (Manage → Data Uploads, or the Data tab here). Every day in it joins the history, and the forecast starts from three weeks of days. Add a <b>labor by day</b> export to turn sales into labor hours.</p><button type="button" class="btn btn-primary" id="fcGoData">Go to Data</button>`;
    view.querySelectorAll('.fc-panel').forEach(p => { p.innerHTML = ''; });
    document.getElementById('fcGoData').addEventListener('click', () => { fcTab = 'data'; renderForecastView(); });
    return;
  }
  gate.hidden = true;
  if(fcTab === 'forecast') fcRenderForecast();
  if(fcTab === 'patterns') fcRenderPatterns();
  if(fcTab === 'accuracy') fcRenderAccuracy();
  if(fcTab === 'channels') fcRenderChannels();
  if(fcTab === 'data') fcRenderData();
}
function fcRerender(){
  const view = typeof document !== 'undefined' ? document.getElementById('forecastView') : null;
  if(view && view.classList.contains('active')) renderForecastView();
}

const FC_ICON = {
  dollar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.2c0 3 6 1.5 6 4.5 0 1.3-1.3 2.3-3 2.3s-3-1-3-2.3"/></svg>',
  trendUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-9"/><path d="M14 6h7v7"/></svg>',
  trendDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l6 6 4-4 8 9"/><path d="M14 18h7v-7"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>',
  percent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5L5 19"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>'
};

function fcKpi(icon, label, value, note, tone){
  return `<div class="fc-kpi"><div class="fc-kpi-ic">${icon}</div><div class="fc-kpi-label">${label}</div><div class="fc-kpi-value">${value}</div>${note ? `<div class="fc-kpi-note ${tone || ''}">${note}</div>` : ''}</div>`;
}
function fcLookbackLabel(a, s){
  if(s.lookback === 'auto') return a && a.lookbackPick ? `best-fit window (${a.lookbackPick.overall} weeks overall)` : 'best-fit window';
  const weeks = +s.lookback;
  return weeks > 0 ? `last ${weeks} weeks` : 'all history';
}
const FC_LOOKBACK_OPTS = [['auto', 'Best fit (per weekday)'], [4, '4 weeks'], [8, '8 weeks'], [12, '12 weeks'], [26, '26 weeks'], [0, 'All history']];
function fcLookbackOptions(s){ return FC_LOOKBACK_OPTS.map(([v, l]) => `<option value="${v}" ${String(s.lookback) === String(v) ? 'selected' : ''}>${l}</option>`).join(''); }
function fcLookbackValue(v){ return v === 'auto' ? 'auto' : +v; }

// --- Forecast tab ---
function fcRenderForecast(){
  const panel = document.getElementById('fcPanelForecast');
  const s = fcSettings();
  const a = fcAnalysisFor(s);
  // Targets start from the history's own numbers the first time.
  const splh = s.splh != null ? s.splh : (a.avgSPLH ? Math.round(a.avgSPLH) : '');
  const pct = s.pct != null ? s.pct : (a.avgLaborPct ? +a.avgLaborPct.toFixed(1) : '');
  const wage = s.wage != null ? s.wage : (a.avgWage ? +a.avgWage.toFixed(2) : '');
  const dates = fcDates();
  const pctMethod = s.method === 'pct';

  let totalBase = 0, totalAdj = 0, totalHrs = 0, anyHrs = false, anyAdj = false;
  const rowsHtml = dates.map(iso => {
    const base = fcBaseline(iso, a);
    const adj = base.closed ? 0 : (+s.adjustments[iso] || 0);
    const adjSales = base.sales == null ? null : base.sales * (1 + adj / 100);
    const adjTrans = base.transactions == null ? null : base.transactions * (1 + adj / 100);
    const hrs = base.closed ? 0 : fcLaborHours(adjSales, {...s, splh, pct, wage});
    if(base.sales != null){ totalBase += base.sales; totalAdj += adjSales; }
    if(hrs != null){ totalHrs += hrs; anyHrs = true; }
    if(adj) anyAdj = true;
    const adjCell = base.closed
      ? `<span class="fc-pill is-neutral">${FC_ICON.lock} closed</span>`
      : `<div class="fc-adjcell"><button type="button" class="fc-step" data-fc-step="-5" data-date="${iso}" aria-label="5% less">&minus;</button><input type="number" class="fc-adj" data-fc-adj="${iso}" value="${adj}" step="5" inputmode="numeric" aria-label="Adjustment %"><span class="fc-adj-suffix">%</span><button type="button" class="fc-step" data-fc-step="5" data-date="${iso}" aria-label="5% more">+</button></div>`;
    const lyCell = base.closed ? '' : base.closedLastYear ? `<span class="fc-pill is-warn">closed last year</span>` : base.lastYear != null ? `${fcMoney(base.lastYear)}<span class="fc-muted"> ${fcShort(base.lastYearDate)}</span>` : '<span class="fc-muted">—</span>';
    return `<tr class="${adj ? 'is-adjusted' : ''} ${base.closed ? 'is-closed' : ''}">
      <td><b>${FC_DOW[base.dow]}</b> <span class="fc-muted">${fcShort(iso)}</span>${(() => { const ev = base.closed ? null : fcEventFor(iso); return ev ? `<span class="fc-event" title="Special event in Know the Numbers">${fcEsc(ev)}</span>` : ''; })()}</td>
      ${a.hasLastYear ? `<td class="fc-num">${lyCell}</td>` : ''}
      <td class="fc-num">${base.sales == null ? '<span class="fc-muted">no history</span>' : fcMoney(base.sales)}</td>
      <td>${adjCell}</td>
      <td class="fc-num fc-strong ${adj > 0 ? 'is-up' : adj < 0 ? 'is-down' : ''}">${adjSales == null ? '—' : fcMoney(adjSales)}</td>
      ${a.hasTransactions ? `<td class="fc-num">${adjTrans == null ? '—' : fcNumFmt(adjTrans)}</td>` : ''}
      <td class="fc-num">${hrs == null ? '—' : fcNumFmt(hrs, 1)}</td>
    </tr>`;
  }).join('');

  const trendPct = Math.max(-FC_MAX_TREND_PCT, Math.min(FC_MAX_TREND_PCT, a.trend.weeklyGrowthPct || 0));
  const openDays = dates.filter(d => !fcBaseline(d, a).closed && fcBaseline(d, a).sales != null).length;
  // Last year's figure for a day ahead comes from a DayTrack row dated a
  // year back (that row's own sales) — not from this year's rows, which
  // only carry last year's figure for their own date.
  const lyMissing = a.hasLastYear ? dates.filter(d => { const b = fcBaseline(d, a); return b.sales != null && !b.closed && b.lastYear == null; }) : [];
  const lyNote = lyMissing.length ? `No last-year figure for ${lyMissing.length === dates.length ? 'these days' : `${lyMissing.length} of these days`} yet, so they use the weekday average. Export DayTrack Table from ${fcShort(fcAddDays(lyMissing[0], -FC_YEAR_DAYS))} ${fcAddDays(lyMissing[0], -FC_YEAR_DAYS).slice(0, 4)} onward once and they'll have one.` : '';
  const laborNote = !a.hasLabor && pctMethod ? 'Enter a labor % and wage, or upload labor by day' : !a.hasLabor && !splh ? 'Enter a $ per labor hour target, or upload labor by day' : '';
  panel.innerHTML = `
    <div class="standup-card fc-controls">
      <div class="fc-field"><label for="fcStart">Start</label><input type="date" id="fcStart" value="${fcStart}"></div>
      <div class="fc-field"><label for="fcDays">Days</label><select id="fcDays">${[7, 14].map(n => `<option value="${n}" ${+s.days === n ? 'selected' : ''}>${n} days</option>`).join('')}</select></div>
      <div class="fc-field"><label for="fcLookback">Based on</label><select id="fcLookback">${fcLookbackOptions(s)}</select></div>
      ${a.hasLastYear ? `<div class="fc-field"><label for="fcModel">Model</label><select id="fcModel">${[['auto', 'Best fit (backtest picks)'], ['blend', 'Half last year, half weekday'], ['lastyear', 'Last year × run-rate'], ['weekday', 'Weekday average only']].map(([v, l]) => `<option value="${v}" ${s.model === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
      <div class="fc-field"><label for="fcMethod">Labor target</label><select id="fcMethod"><option value="splh" ${!pctMethod ? 'selected' : ''}>$ per labor hour</option><option value="pct" ${pctMethod ? 'selected' : ''}>Labor % of sales</option></select></div>
      <div class="fc-field" ${pctMethod ? 'hidden' : ''}><label for="fcSplh">$ / labor hour</label><input type="number" id="fcSplh" value="${splh}" min="1" step="1" inputmode="decimal" placeholder="${a.avgSPLH ? Math.round(a.avgSPLH) : 'e.g. 170'}"></div>
      <div class="fc-field" ${pctMethod ? '' : 'hidden'}><label for="fcPct">Labor %</label><input type="number" id="fcPct" value="${pct}" min="1" max="60" step="0.1" inputmode="decimal" placeholder="${a.avgLaborPct ? a.avgLaborPct.toFixed(1) : 'e.g. 22'}"></div>
      <div class="fc-field" ${pctMethod ? '' : 'hidden'}><label for="fcWage">Avg wage $/hr</label><input type="number" id="fcWage" value="${wage}" min="1" step="0.25" inputmode="decimal" placeholder="${a.avgWage ? a.avgWage.toFixed(2) : 'e.g. 15.50'}"></div>
    </div>
    <div class="fc-summary">
      <div class="fc-sum-main">
        <div class="fc-sum-label">Next ${dates.length} days · ${fcShort(dates[0])} – ${fcShort(dates[dates.length - 1])}</div>
        <div class="fc-sum-hero">${fcMoney(totalAdj)}</div>
        <div class="fc-sum-foot">${anyAdj ? `Baseline ${fcMoney(totalBase)} · with adjustments ${fcPctFmt(totalBase ? (totalAdj / totalBase - 1) * 100 : 0)}` : `${openDays} open day${openDays === 1 ? '' : 's'} · no adjustments`}</div>
      </div>
      <div class="fc-sum-stats">
        <div class="fc-sum-stat"><div class="label">Labor hours</div><div class="value">${anyHrs ? fcNumFmt(totalHrs) : '—'}</div>${laborNote ? `<div class="note">${laborNote}</div>` : ''}</div>
        <div class="fc-sum-stat"><div class="label">${pctMethod ? 'Labor %' : '$ / labor hr'}</div><div class="value">${pctMethod ? (pct ? pct + '%' : '—') : (splh ? fcMoney(splh) : '—')}</div></div>
        <div class="fc-sum-stat"><div class="label">Weekly trend</div><div class="value">${fcPctFmt(trendPct)}</div><div class="note">${a.weekly.length} full week${a.weekly.length === 1 ? '' : 's'} · ${fcLookbackLabel(a, s)}</div></div>
        ${a.hasLastYear ? `<div class="fc-sum-stat"><div class="label">vs last year</div><div class="value">${a.yoyRatio != null ? fcPctFmt(a.vsLastYearPct) : '—'}</div><div class="note">${a.yoyRatio != null ? `model: ${fcModelLabel(s.model, a.yoyWeight)}` : `needs ${FC_YOY_MIN_DAYS} days with both years`}</div></div>` : ''}
      </div>
    </div>
    <div class="standup-card fc-adjust">
      <div class="fc-adjust-head"><h3>Adjust every day</h3><span class="fc-muted">A game, a holiday, weather, a promotion. Per-day changes are in the table.</span></div>
      <div class="fc-adjust-row">
        ${[-15, -10, -5, 0, 5, 10, 15].map(v => `<button type="button" class="fc-chip" data-fc-bulk="${v}">${v > 0 ? '+' : ''}${v}%</button>`).join('')}
        <span class="fc-adjust-custom"><input type="number" id="fcBulkCustom" placeholder="custom" inputmode="numeric" aria-label="Custom adjustment %"><span class="fc-adj-suffix">%</span><button type="button" class="fc-chip" id="fcBulkApply">Apply</button></span>
        <button type="button" class="fc-chip is-ghost" id="fcAdjReset">Reset</button>
      </div>
    </div>
    <div class="fc-table-wrap">
      <table class="fc-table">
        <thead><tr><th>Day</th>${a.hasLastYear ? '<th class="fc-num">Last year</th>' : ''}<th class="fc-num">Baseline</th><th>Adjustment</th><th class="fc-num">Forecast</th>${a.hasTransactions ? '<th class="fc-num">Transactions</th>' : ''}<th class="fc-num">Labor hrs</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr><td>Total</td>${a.hasLastYear ? '<td></td>' : ''}<td class="fc-num">${fcMoney(totalBase)}</td><td></td><td class="fc-num">${fcMoney(totalAdj)}</td>${a.hasTransactions ? '<td></td>' : ''}<td class="fc-num">${anyHrs ? fcNumFmt(totalHrs, 1) : '—'}</td></tr></tfoot>
      </table>
    </div>
    <div class="fc-actions">
      <button type="button" class="btn ${fcNumbersOpen ? 'btn-ghost' : 'btn-primary'}" id="fcToNumbers">${fcNumbersOpen ? 'Hide the Know the Numbers preview' : 'Send to Know the Numbers'}</button>
      <button type="button" class="btn btn-ghost" id="fcCopy">Copy as CSV</button>
      <button type="button" class="btn btn-ghost" id="fcDownload">Download CSV</button>
      ${(() => { const sent = dates.filter(d => forecastLog[d]); if(!sent.length) return ''; const last = sent.map(d => forecastLog[d].at).sort().pop(); return `<span class="fc-muted fc-note-wide is-info">Sent to Know the Numbers ${fcShort(last.slice(0, 10))} for ${sent.length === dates.length ? 'every day here' : `${sent.length} of these days`}. Sending again replaces those.</span>`; })()}
      ${lyNote ? `<span class="fc-muted fc-note-wide">${lyNote}</span>` : ''}
      <span class="fc-muted">${a.yoyWeight > 0 ? `Baseline = ${fcModelLabel(s.model, a.yoyWeight)}: the same weekday a year ago × this year's run-rate (${fcPctFmt(a.vsLastYearPct)}), and that weekday's average over ${fcLookbackLabel(a, s)} carried forward by the trend.` : `Baseline = that weekday's average over ${fcLookbackLabel(a, s)}, carried forward by the weekly trend.`}</span>
    </div>
    <div id="fcNumbersCard">${fcNumbersOpen ? fcNumbersPreviewHtml() : ''}</div>`;

  const wire = (id, ev, fn) => { const el = document.getElementById(id); if(el) el.addEventListener(ev, fn); };
  wire('fcStart', 'change', e => { if(fcValidIso(e.target.value)) fcStart = e.target.value; fcRenderForecast(); });
  wire('fcDays', 'change', e => { fcSaveSettings({days: +e.target.value}); fcRenderForecast(); });
  wire('fcLookback', 'change', e => { fcSaveSettings({lookback: fcLookbackValue(e.target.value)}); fcRenderForecast(); });
  wire('fcMethod', 'change', e => { fcSaveSettings({method: e.target.value}); fcRenderForecast(); });
  wire('fcModel', 'change', e => { fcSaveSettings({model: e.target.value}); fcRenderForecast(); });
  wire('fcSplh', 'change', e => { fcSaveSettings({splh: fcNum(e.target.value)}); fcRenderForecast(); });
  wire('fcPct', 'change', e => { fcSaveSettings({pct: fcNum(e.target.value)}); fcRenderForecast(); });
  wire('fcWage', 'change', e => { fcSaveSettings({wage: fcNum(e.target.value)}); fcRenderForecast(); });
  panel.querySelectorAll('[data-fc-bulk]').forEach(b => b.addEventListener('click', () => fcBulkAdjust(+b.dataset.fcBulk)));
  wire('fcBulkApply', 'click', () => { const v = fcNum(document.getElementById('fcBulkCustom').value); if(v !== null) fcBulkAdjust(v); });
  wire('fcAdjReset', 'click', () => { fcSaveSettings({adjustments: {}}); fcRenderForecast(); });
  panel.querySelectorAll('[data-fc-adj]').forEach(inp => inp.addEventListener('change', e => { fcSetAdjustment(e.target.dataset.fcAdj, fcNum(e.target.value) || 0); fcRenderForecast(); }));
  panel.querySelectorAll('[data-fc-step]').forEach(b => b.addEventListener('click', () => { const cur = +fcSettings().adjustments[b.dataset.date] || 0; fcSetAdjustment(b.dataset.date, cur + +b.dataset.fcStep); fcRenderForecast(); }));
  wire('fcCopy', 'click', () => fcExportCsv('copy'));
  wire('fcDownload', 'click', () => fcExportCsv('download'));
  wire('fcToNumbers', 'click', () => { fcNumbersOpen = !fcNumbersOpen; fcRenderForecast(); if(fcNumbersOpen){ const c = document.getElementById('fcNumbersCard'); if(c && c.scrollIntoView) c.scrollIntoView({behavior: 'smooth', block: 'start'}); } });
  wire('fcNumbersSave', 'click', async () => {
    const plan = fcNumbersPlan();
    const cells = await fcApplyNumbers(plan);
    fcNumbersOpen = false;
    if(typeof showToast === 'function') showToast(`Know the Numbers filled: ${plan.length} day${plan.length === 1 ? '' : 's'}, ${cells} numbers`);
    fcRenderForecast();
  });
  wire('fcNumbersCancel', 'click', () => { fcNumbersOpen = false; fcRenderForecast(); });
  // The daypart mix: saved once the four add up to 100 (give or take one).
  const mixInputs = [...panel.querySelectorAll('[data-fc-mix]')];
  let mixTouched = false;
  const mixSum = () => {
    const el = document.getElementById('fcMixSum');
    if(!el) return;
    // Automatic values are shown rounded, so their sum is only read once edited.
    if(!mixTouched && !fcSettings().daypartMix){ el.textContent = 'Change a figure to set your own mix'; el.classList.remove('is-warn'); return true; }
    const t = mixInputs.reduce((a, i) => a + (fcNum(i.value) || 0), 0);
    const ok = Math.abs(t - 100) <= 1;
    el.textContent = `${Math.round(t * 10) / 10}% of the day${ok ? '' : ' — make it 100%'}`;
    el.classList.toggle('is-warn', !ok);
    return ok;
  };
  mixSum();
  mixInputs.forEach(i => {
    i.addEventListener('input', () => { mixTouched = true; mixSum(); });
    i.addEventListener('change', () => {
      if(!mixSum()) return;
      const mix = {};
      mixInputs.forEach(x => { mix[x.dataset.fcMix] = fcNum(x.value) || 0; });
      fcSaveSettings({daypartMix: mix});
      fcRenderForecast();
    });
  });
  wire('fcMixReset', 'click', () => { fcSaveSettings({daypartMix: null}); fcRenderForecast(); });
  wire('fcGoalByDaypart', 'change', e => { fcSaveSettings({goalByDaypart: !!e.target.checked}); fcRenderForecast(); });
}

// The split by daypart for every open day in the window, to check before
// it goes into Know the Numbers.
function fcNumbersPreviewHtml(){
  const plan = fcNumbersPlan();
  if(!plan.length) return `<div class="standup-card fc-numbers"><h3>Know the Numbers</h3><p class="fc-empty">No open days with a forecast in this window.</p></div>`;
  const windows = fcDaypartWindows();
  const s = fcSettings();
  const isWeeks = x => /\d+ weeks$/.test(x);
  const weekdays = [...new Set(plan.map(p => p.source).filter(x => x !== 'mix' && x !== 'default' && !isWeeks(x)))];
  const learnedDays = plan.filter(p => isWeeks(p.source)).length;
  const rest = plan.some(p => p.source === 'default') ? ', and by Buda\'s typical mix where a weekday has too few' : '';
  const shapeNote = plan[0].source === 'mix'
    ? 'Split by your daypart mix below, the same every day.'
    : learnedDays
      ? `Split by each weekday's own shape, learned from the weeks of sales by weekday and daypart on file${learnedDays < plan.length ? ` where a weekday has ${FC_MIX_MIN_WEEKS} or more` : ''}${weekdays.length ? `, by the hourly report for ${weekdays.join(', ')}` : ''}${rest}.`
      : weekdays.length
        ? `Split by each weekday's hourly sales shape from the productivity report (${weekdays.join(', ')})${rest}.`
        : 'Split by Buda\'s typical mix (breakfast and the afternoon quiet, dinner the biggest) — upload the weekly sales by weekday and daypart export (Data Uploads) and each weekday takes its own shape.';
  const goalNote = s.goalByDaypart === false
    ? 'The same productivity goal every daypart.'
    : 'Each daypart\'s goal follows its usual productivity: breakfast below the day\'s target, lunch above.';
  // The mix shown: Tim's, or the shares the first day uses.
  const first = plan[0];
  const shown = windows.map(w => ({key: fcDaypartKey(w.name), pct: s.daypartMix && fcMixShares(s.daypartMix, windows) ? +s.daypartMix[fcDaypartKey(w.name)] : Math.round(first.split[w.name] / first.sales * 1000) / 10}));
  const mixFields = shown.map(m => `<label class="fc-mix-field"><span>${fcEsc(m.key)}</span><span class="fc-mix-input"><input type="number" min="0" max="100" step="0.5" inputmode="decimal" data-fc-mix="${fcEsc(m.key)}" value="${m.pct}"><i>%</i></span></label>`).join('');
  const goal = plan[0].goal;
  const dayHead = plan.map(p => `<th class="fc-num">${FC_DOW[p.dow]}<span class="fc-muted"> ${fcShort(p.date)}</span></th>`).join('');
  const rows = windows.map(w => `<tr><td>${fcEsc(fcDaypartKey(w.name))}<small>${fcEsc(w.name.replace(/^[^(]*/, ''))}</small></td>${plan.map(p => `<td class="fc-num">${fcMoney(p.split[w.name])}${p.goals && p.goals[w.name] != null ? `<small>${fcMoney(p.goals[w.name])}/hr</small>` : ''}</td>`).join('')}</tr>`).join('');
  return `<div class="standup-card fc-numbers">
    <h3>Know the Numbers <span class="sub">what each daypart will show</span></h3>
    <p class="fc-muted">${shapeNote} ${goalNote} Projected sales and goals already there for these days are replaced; special events stay.</p>
    <div class="fc-mix">
      <div class="fc-mix-head"><span>Daypart mix</span><em>${s.daypartMix ? 'Set by hand' : `Automatic · ${first.source === 'default' ? 'Buda\'s typical mix' : isWeeks(first.source) ? `${FC_DOW_LONG[first.dow]}s, learned from ${first.source}` : `the ${first.source} hourly report`}`}</em></div>
      <div class="fc-mix-grid">${mixFields}</div>
      <div class="fc-mix-foot"><span id="fcMixSum"></span>${s.daypartMix ? '<button type="button" class="fc-link" id="fcMixReset">Back to automatic</button>' : ''}</div>
      <label class="fc-check"><input type="checkbox" id="fcGoalByDaypart" ${s.goalByDaypart === false ? '' : 'checked'}> Goal follows each daypart's usual productivity (breakfast lower, lunch higher) instead of one goal for the whole day</label>
    </div>
    <div class="fc-table-wrap"><table class="fc-table fc-table-sm fc-table-numbers">
      <thead><tr><th>Daypart</th>${dayHead}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Day total</td>${plan.map(p => `<td class="fc-num">${fcMoney(p.sales)}</td>`).join('')}</tr>
      <tr><td>Day target</td>${plan.map(p => `<td class="fc-num">${p.goal != null ? fcMoney(p.goal) + '/hr' : '—'}</td>`).join('')}</tr></tfoot>
    </table></div>
    ${goal == null ? '<p class="fc-muted">No productivity goal yet: set a $ per labor hour target (or labor % and wage) above and it fills in too.</p>' : ''}
    <div class="fc-actions"><button type="button" class="btn btn-primary" id="fcNumbersSave">Save to Know the Numbers</button><button type="button" class="btn btn-ghost" id="fcNumbersCancel">Cancel</button></div>
  </div>`;
}
function fcBulkAdjust(pct){
  const adjustments = {...fcSettings().adjustments};
  const a = fcAnalysisFor(fcSettings());
  fcDates().forEach(iso => { if(fcBaseline(iso, a).closed) return; const v = Math.round(pct); if(v) adjustments[iso] = v; else delete adjustments[iso]; });
  fcSaveSettings({adjustments});
  fcRenderForecast();
}
function fcTableCsv(){
  const table = document.querySelector('#fcPanelForecast .fc-table');
  if(!table) return '';
  return Array.from(table.querySelectorAll('tr')).map(tr => Array.from(tr.querySelectorAll('th,td')).map(cell => {
    const inp = cell.querySelector('input');
    const text = inp ? inp.value + '%' : cell.textContent.replace(/\s+/g, ' ').trim();
    return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(',')).join('\n');
}
function fcExportCsv(how){
  const csv = fcTableCsv();
  const btn = document.getElementById(how === 'copy' ? 'fcCopy' : 'fcDownload');
  if(how === 'copy'){
    const orig = btn.textContent;
    const done = ok => { btn.textContent = ok ? 'Copied' : 'Copy failed — select the table instead'; setTimeout(() => { btn.textContent = orig; }, 1600); };
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(csv).then(() => done(true), () => done(false));
    else done(false);
    return;
  }
  const blob = new Blob([csv], {type: 'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `forecast-${fcStart}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// --- Patterns tab ---
function fcRenderPatterns(){
  const panel = document.getElementById('fcPanelPatterns');
  const s = fcSettings();
  const a = fcAnalysisFor(s);
  const weeklyAvg = a.weekly.length ? a.weekly.reduce((t, w) => t + w.sales, 0) / a.weekly.length : null;
  const g = a.trend.weeklyGrowthPct || 0;
  const first = a.rows[0], last = a.rows[a.rows.length - 1];
  panel.innerHTML = `
    <div class="fc-panel-head"><p class="fc-lede">${a.rows.length} day${a.rows.length === 1 ? '' : 's'} · ${first ? `${fcShort(first.date)} – ${fcShort(last.date)}` : ''} · ${fcLookbackLabel(a, s)} <select id="fcLookback2" class="fc-inline-select" aria-label="Look back">${fcLookbackOptions(s)}</select>${a.lookbackPick ? `<span class="fc-pickline">Windows the backtest picked: ${fcLookbackText(a.lookbackPick, a)}</span>` : ''}</p></div>
    <div class="fc-kpis">
      ${fcKpi(FC_ICON.dollar, 'Avg weekly sales', fcMoney(weeklyAvg), a.weekly.length ? `${a.weekly.length} full week${a.weekly.length === 1 ? '' : 's'}` : 'no full week yet')}
      ${fcKpi(g >= 0 ? FC_ICON.trendUp : FC_ICON.trendDown, 'Weekly trend', fcPctFmt(g), g >= 0 ? 'trending up' : 'trending down', g >= 0 ? 'is-up' : 'is-down')}
      ${fcKpi(FC_ICON.clock, 'Avg $ / labor hour', a.avgSPLH != null ? fcMoney(a.avgSPLH) : '—', a.avgSPLH != null ? 'sales ÷ labor hours' : 'upload labor by day')}
      ${fcKpi(FC_ICON.percent, 'Labor % of sales', a.avgLaborPct != null ? a.avgLaborPct.toFixed(1) + '%' : '—', a.avgLaborPct != null ? 'labor cost ÷ sales' : 'needs labor cost')}
      ${a.vsLastYearPct != null ? fcKpi(a.vsLastYearPct >= 0 ? FC_ICON.trendUp : FC_ICON.trendDown, 'vs last year', fcPctFmt(a.vsLastYearPct), `${a.lastYearDays} day${a.lastYearDays === 1 ? '' : 's'} with last year's sales`, a.vsLastYearPct >= 0 ? 'is-up' : 'is-down') : ''}
    </div>
    <div class="standup-card fc-chart-card"><h3>Sales by week</h3><p class="fc-muted">Full weeks only (Sunday to Saturday). The dashed line is the trend the forecast follows.${a.left.length ? ' Unusual days count at their weekday median here.' : ''}</p><div id="fcTrendChart" class="fc-chart"></div></div>
    <div class="standup-card fc-left">
      <h3>Days left out <span class="sub">${s.unusual === false ? 'off' : a.left.length ? `${a.left.length} of ${a.rows.filter(r => r.sales > 0).length} open days` : 'none in this window'}</span></h3>
      <label class="fc-check"><input type="checkbox" id="fcUnusual" ${s.unusual === false ? '' : 'checked'}> Leave unusual days out of the averages: days with a special event in Know the Numbers, and days more than ${FC_OUTLIER_PCT}% from their weekday's median.</label>
      ${a.left.length ? `<div class="fc-table-wrap"><table class="fc-table fc-table-sm"><thead><tr><th>Day</th><th class="fc-num">Sales</th><th>Why</th></tr></thead><tbody>${a.left.map(r => `<tr><td><b>${FC_DOW[r.dow]}</b> <span class="fc-muted">${fcShort(r.date)}</span></td><td class="fc-num">${fcMoney(r.sales)}</td><td>${r.unusual.kind === 'event' ? `<span class="fc-pill is-neutral">event</span> ${fcEsc(r.unusual.text)}` : `<span class="fc-pill is-warn">${fcPctFmt(r.unusual.pct, 0)}</span> vs the ${FC_DOW_LONG[r.dow]} median`}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </div>
    <div class="fc-two">
      <div class="standup-card fc-chart-card"><h3>Average sales by weekday</h3><div id="fcDowSales" class="fc-chart"></div></div>
      <div class="standup-card fc-chart-card"><h3>Average labor hours by weekday</h3><div id="fcDowLabor" class="fc-chart"></div></div>
    </div>`;
  document.getElementById('fcLookback2').addEventListener('change', e => { fcSaveSettings({lookback: fcLookbackValue(e.target.value)}); fcRenderPatterns(); });
  document.getElementById('fcUnusual').addEventListener('change', e => { fcSaveSettings({unusual: !!e.target.checked}); fcRenderPatterns(); });
  fcTrendChart(document.getElementById('fcTrendChart'), a.weekly, a.trend);
  fcBarChart(document.getElementById('fcDowSales'), FC_DOW, a.dow.map(d => d.sales), 'var(--cfa-navy)', fcMoney);
  if(a.dow.some(d => d.laborHours != null)) fcBarChart(document.getElementById('fcDowLabor'), FC_DOW, a.dow.map(d => d.laborHours), 'var(--fc-labor)', v => fcNumFmt(v));
  else document.getElementById('fcDowLabor').innerHTML = '<p class="fc-empty">No labor hours yet — upload a labor by day export.</p>';
}

// --- Accuracy tab ---
function fcRenderAccuracy(){
  const panel = document.getElementById('fcPanelAccuracy');
  const s = fcSettings();
  const a0 = fcAnalysisFor(s);
  const weeks0 = a0.lookbackPick ? a0.lookbackPick.perDow : +s.lookback;
  const results = fcBacktest(salesHistory, fcBacktestDays, weeks0, a0.yoyWeight);
  // In Best fit the mix is picked over a fixed window, so the comparison
  // shows that same window; otherwise it follows the days selected above.
  const compareDays = s.model === 'auto' ? FC_AUTO_TEST_DAYS : fcBacktestDays;
  const scores = a0.hasLastYear ? fcBacktestScores(salesHistory, compareDays, weeks0) : null;
  const sel = `<select id="fcBacktestDays" class="fc-inline-select" aria-label="Days to test">${[7, 14, 28].map(n => `<option value="${n}" ${fcBacktestDays === n ? 'selected' : ''}>last ${n} days</option>`).join('')}</select>`;
  if(!results.length){
    panel.innerHTML = `${fcTrackRecordHtml()}<div class="fc-panel-head"><p class="fc-lede">How the model would have done on days already lived, forecasting each from only the history before it: ${sel}</p></div><p class="fc-empty">Not enough history to test yet — the backtest needs at least a week before each day it scores.</p>`;
    document.getElementById('fcBacktestDays').addEventListener('change', e => { fcBacktestDays = +e.target.value; fcRenderAccuracy(); });
    return;
  }
  const avg = results.reduce((t, r) => t + r.accuracy, 0) / results.length;
  const best = results.reduce((x, y) => y.accuracy > x.accuracy ? y : x);
  const worst = results.reduce((x, y) => y.accuracy < x.accuracy ? y : x);
  const miss = results.reduce((t, r) => t + Math.abs(r.actual - r.forecast), 0) / results.length;
  const tier = acc => acc >= 90 ? 'is-good' : acc >= 75 ? 'is-warn' : 'is-bad';
  let compareHtml = '';
  if(a0.lookbackPick){
    const pk = a0.lookbackPick;
    compareHtml += `<div class="standup-card fc-compare"><h3>Which window fits <span class="sub">weekday model, last ${pk.days} open days</span></h3>
      <div class="fc-table-wrap"><table class="fc-table fc-table-sm"><thead><tr><th>Look back</th><th class="fc-num">Avg accuracy</th><th></th></tr></thead><tbody>
      ${FC_LOOKBACKS.map(w => `<tr class="${w === pk.overall ? 'is-adjusted' : ''}"><td>${w} weeks</td><td class="fc-num">${pk.byWindow[w] == null ? '—' : `<span class="fc-pill ${tier(pk.byWindow[w])}">${pk.byWindow[w].toFixed(1)}%</span>`}</td><td>${w === pk.overall ? 'best overall' : ''}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="fc-muted">Per weekday: ${fcLookbackText(pk, a0)}. A weekday takes its own window once it has ${FC_LOOKBACK_MIN_DAYS} scored days; until then it uses the best overall.</p></div>`;
  }
  if(scores){
    const bestW = FC_YOY_WEIGHTS.reduce((b, w) => scores.byWeight[w] > scores.byWeight[b] + 1e-9 ? w : b, 0);
    compareHtml += `<div class="standup-card fc-compare"><h3>Which mix fits <span class="sub">last ${scores.days} open days · ${scores.withLastYear} had a last-year figure</span></h3>
      <div class="fc-table-wrap"><table class="fc-table fc-table-sm"><thead><tr><th>Model</th><th class="fc-num">Avg accuracy</th><th class="fc-num">Avg miss</th><th></th></tr></thead><tbody>
      ${FC_YOY_WEIGHTS.map(w => `<tr class="${w === a0.yoyWeight ? 'is-adjusted' : ''}"><td>${fcModelLabel(w === 0 ? 'weekday' : w === 1 ? 'lastyear' : 'blend', w)}</td><td class="fc-num"><span class="fc-pill ${tier(scores.byWeight[w])}">${scores.byWeight[w].toFixed(1)}%</span></td><td class="fc-num">${fcMoney(scores.miss[w])}</td><td>${[w === bestW ? 'best' : '', w === a0.yoyWeight ? 'in use' : ''].filter(Boolean).join(' · ')}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="fc-muted">${s.model === 'auto' ? `Best fit is on: the forecast uses whichever mix scored best over the last ${FC_AUTO_TEST_DAYS} open days, and follows it as the weeks go by.` : 'Change the model on the Forecast tab, or pick Best fit to let the backtest choose.'}</p></div>`;
  }
  panel.innerHTML = `
    ${fcTrackRecordHtml()}
    <div class="fc-panel-head"><p class="fc-lede">How the model would have done on days already lived, forecasting each from only the history before it: ${sel}</p></div>
    ${compareHtml}
    <div class="fc-kpis">
      ${fcKpi(FC_ICON.percent, 'Average accuracy', avg.toFixed(1) + '%', `${results.length} days tested`, tier(avg))}
      ${fcKpi(FC_ICON.trendUp, 'Best day', best.accuracy.toFixed(1) + '%', `${FC_DOW[best.dow]} ${fcShort(best.date)}`)}
      ${fcKpi(FC_ICON.trendDown, 'Worst day', worst.accuracy.toFixed(1) + '%', `${FC_DOW[worst.dow]} ${fcShort(worst.date)}`)}
      ${fcKpi(FC_ICON.dollar, 'Average miss', fcMoney(miss), 'per day, either direction')}
    </div>
    <div class="standup-card fc-chart-card"><h3>Actual vs forecast</h3><p class="fc-muted">Navy is what happened; the dashed red line is what the model would have said.</p><div id="fcCompareChart" class="fc-chart"></div></div>
    <div class="fc-table-wrap"><table class="fc-table">
      <thead><tr><th>Day</th><th class="fc-num">Actual</th><th class="fc-num">Forecast</th><th>Accuracy</th></tr></thead>
      <tbody>${results.slice().reverse().map(r => `<tr><td><b>${FC_DOW[r.dow]}</b> <span class="fc-muted">${fcShort(r.date)}</span></td><td class="fc-num">${fcMoney(r.actual)}</td><td class="fc-num">${fcMoney(r.forecast)}</td><td><span class="fc-pill ${tier(r.accuracy)}">${r.accuracy.toFixed(1)}%</span></td></tr>`).join('')}</tbody>
    </table></div>`;
  document.getElementById('fcBacktestDays').addEventListener('change', e => { fcBacktestDays = +e.target.value; fcRenderAccuracy(); });
  fcCompareChart(document.getElementById('fcCompareChart'), results);
}

// --- Channels tab ---
function fcRenderChannels(){
  const panel = document.getElementById('fcPanelChannels');
  const s = fcSettings();
  const a = fcAnalysisFor(s);
  const stats = fcChannelStats(a.rows);
  if(!stats){
    panel.innerHTML = '<p class="fc-empty">No sales by destination yet. The Analytics Hub sales-by-day export carries Drive Thru, Dine In, Carry Out and the rest — upload it and they show here.</p>';
    return;
  }
  panel.innerHTML = `
    <div class="fc-panel-head"><p class="fc-lede">Where the sales come from, over ${fcLookbackLabel(a, s)}.</p></div>
    <div class="standup-card">
      <h3>Sales mix</h3>
      <div class="fc-mixbar">${stats.channels.map(c => `<div class="fc-seg" style="background:${c.color};width:${(c.share * 100).toFixed(2)}%" data-fc-tip="${fcEsc(c.name)}: ${fcMoney(c.avgPerDay)} a day (${(c.share * 100).toFixed(1)}%)"></div>`).join('')}</div>
      <div class="fc-mixtable">${stats.channels.map(c => `<div class="fc-mixrow"><span class="fc-dot" style="background:${c.color}"></span><span class="fc-mixname">${fcEsc(c.name)}</span><span class="fc-num">${fcMoney(c.avgPerDay)}<span class="fc-muted"> / day</span></span><span class="fc-num fc-strong">${(c.share * 100).toFixed(1)}%</span></div>`).join('')}</div>
    </div>
    <div class="fc-minis">${stats.channels.map((c, i) => `<div class="standup-card fc-chart-card"><h3><span class="fc-dot" style="background:${c.color}"></span>${fcEsc(c.name)}</h3><div class="fc-chart fc-chart-mini" id="fcMini${i}"></div></div>`).join('')}</div>`;
  stats.channels.forEach((c, i) => {
    const weekly = fcWeeklySeries(a.rows, r => r.channels ? r.channels[c.name] : null).slice(-8);
    const el = document.getElementById('fcMini' + i);
    if(weekly.length) fcBarChart(el, weekly.map(w => fcShort(w.week)), weekly.map(w => w.sales), c.color, fcMoney);
    else el.innerHTML = '<p class="fc-empty">Not a full week yet.</p>';
  });
  fcWireTips(panel);
}

// --- Data tab ---
function fcRenderData(){
  const panel = document.getElementById('fcPanelData');
  const all = fcHistoryRows(salesHistory, 0);
  const laborDays = all.filter(r => r.laborHours != null || r.laborCost != null).length;
  const chanDays = all.filter(r => r.channels).length;
  const recent = all.slice(-14).reverse();
  const hasLY = recent.some(r => r.lastYearSales != null);
  const laborLog = (dataUploadLog.labor || []).slice(-1)[0];
  const salesLog = (dataUploadLog.sales || []).slice(-1)[0];
  panel.innerHTML = `
    <div class="fc-kpis fc-kpis-3">
      ${fcKpi(FC_ICON.dollar, 'Days of sales', String(all.length), all.length ? `${fcShort(all[0].date)} – ${fcShort(all[all.length - 1].date)}` : 'none yet')}
      ${fcKpi(FC_ICON.clock, 'Days with labor', String(laborDays), laborLog ? `last upload ${fcShort(laborLog.at.slice(0, 10))}` : laborDays ? 'hours, cost or labor %' : 'no labor export yet')}
      ${fcKpi(FC_ICON.percent, 'Days by destination', String(chanDays), salesLog ? `last sales upload ${fcShort(salesLog.at.slice(0, 10))}` : 'from the sales export')}
    </div>
    <div class="standup-card">
      <h3>Add to the history</h3>
      <p class="fc-muted">Two files keep it current, and Data Uploads in Manage takes both: the Analytics Hub <b>DayTrack Table</b> export (sales this year and last, labor hours, wage, labor %, check average) and the <b>sales by day</b> export (sales by destination). Days already saved are updated, never doubled. Nothing but the numbers is kept.</p>
      <label class="du-drop fc-drop" data-fc-drop>
        <input type="file" id="fcFile" accept=".csv,.txt,.tsv,.xlsx,.xls" hidden>
        <span class="du-drop-main">Drop a file here or tap to choose</span>
        <span class="du-drop-sub">Columns are read from the headers; check them below before saving.</span>
      </label>
      <div id="fcMapArea"></div>
    </div>
    <div class="standup-card">
      <h3>Most recent days</h3>
      ${recent.length ? `<div class="fc-table-wrap"><table class="fc-table fc-table-sm">
        <thead><tr><th>Day</th><th class="fc-num">Sales</th>${hasLY ? '<th class="fc-num">vs last year</th>' : ''}<th class="fc-num">Trans.</th><th class="fc-num">Labor hrs</th><th class="fc-num">$ / labor hr</th><th class="fc-num">Labor %</th></tr></thead>
        <tbody>${recent.map(r => { const splh = r.laborHours > 0 && r.sales ? r.sales / r.laborHours : null; const pct = r.laborPct != null ? r.laborPct : (r.laborCost != null && r.sales ? r.laborCost / r.sales * 100 : null); const ly = r.lastYearSales > 0 && r.sales > 0 ? (r.sales / r.lastYearSales - 1) * 100 : null; return `<tr class="${r.sales > 0 ? '' : 'is-closed'}"><td><b>${FC_DOW[r.dow]}</b> <span class="fc-muted">${fcShort(r.date)}</span></td><td class="fc-num">${r.sales > 0 ? fcMoney(r.sales) : '<span class="fc-muted">closed</span>'}</td>${hasLY ? `<td class="fc-num ${ly > 0 ? 'is-up' : ly < 0 ? 'is-down' : ''}">${ly != null ? fcPctFmt(ly) : '—'}</td>` : ''}<td class="fc-num">${r.transactions != null ? fcNumFmt(r.transactions) : '—'}</td><td class="fc-num">${r.laborHours != null ? fcNumFmt(r.laborHours, 1) : '—'}</td><td class="fc-num">${splh != null ? fcMoney(splh) : '—'}</td><td class="fc-num">${pct != null ? pct.toFixed(1) + '%' : '—'}</td></tr>`; }).join('')}</tbody>
      </table></div>` : '<p class="fc-empty">Nothing saved yet.</p>'}
    </div>
    ${all.length ? `<div class="fc-actions"><button type="button" class="btn btn-ghost fc-danger" id="fcClear">Remove all sales history</button><span class="fc-muted">Every device loses it. The uploads can be dropped again.</span></div>` : ''}`;
  const drop = panel.querySelector('[data-fc-drop]');
  const input = document.getElementById('fcFile');
  input.addEventListener('change', e => { if(e.target.files[0]) fcPickFile(e.target.files[0]); });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('is-over'); if(e.dataTransfer.files[0]) fcPickFile(e.dataTransfer.files[0]); });
  const clear = document.getElementById('fcClear');
  if(clear) clear.addEventListener('click', async () => {
    if(!confirm('Remove all sales and labor history from every device? The exports can be uploaded again.')) return;
    Object.keys(salesHistory).forEach(k => { delete salesHistory[k]; });
    await saveState();
    renderForecastView();
  });
  if(fcPendingFile) fcRenderMap();
}

// A file chosen on the Data tab: read it, show which column was taken for
// what, and save on confirmation.
function fcPickFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    let table;
    try{
      if(/\.(xlsx|xls)$/i.test(file.name)){
        const wb = XLSX.read(new Uint8Array(reader.result), {type: 'array'});
        table = fcParseTable(XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]));
      } else table = fcParseTable(pbDecodeText(reader.result));
    }catch(e){ fcPendingFile = {name: file.name, error: 'Couldn’t read this file.'}; fcRenderMap(); return; }
    if(!table.headers.length){ fcPendingFile = {name: file.name, error: 'Couldn’t find any rows in this file.'}; fcRenderMap(); return; }
    // The Analytics Hub sales export is read the way Guest Obsession reads it.
    if(typeof rpDetect === 'function' && !/\.(xlsx|xls)$/i.test(file.name) && rpDetect(pbDecodeText(reader.result)) === 'sales'){
      try{ fcPendingFile = {name: file.name, salesExport: rpParseSales(pbDecodeText(reader.result))}; }
      catch(e){ fcPendingFile = {name: file.name, error: `${e.message} The sales export needs a row per day (business date); a by-weekday or by-daypart version can't be filed by date.`}; }
      fcRenderMap();
      return;
    }
    fcPendingFile = {name: file.name, table, map: fcGuessMap(table.headers, table.rows)};
    fcRenderMap();
  };
  reader.onerror = () => { fcPendingFile = {name: file.name, error: 'Couldn’t read this file.'}; fcRenderMap(); };
  reader.readAsArrayBuffer(file);
}
function fcRenderMap(){
  const area = document.getElementById('fcMapArea');
  if(!area || !fcPendingFile) return;
  const p = fcPendingFile;
  if(p.error){ area.innerHTML = `<p class="fc-map-error">${fcEsc(p.name)} — ${fcEsc(p.error)}</p>`; return; }
  if(p.salesExport){
    const n = p.salesExport.days.length;
    area.innerHTML = `<div class="fc-map"><p><b>${fcEsc(p.name)}</b> — Analytics Hub sales by day, ${n} day${n === 1 ? '' : 's'} (${fcShort(p.salesExport.from)} – ${fcShort(p.salesExport.to)}) with sales by destination.</p><div class="fc-actions"><button type="button" class="btn btn-primary" id="fcMapSave">Save to history</button><button type="button" class="btn btn-ghost" id="fcMapCancel">Cancel</button></div></div>`;
    document.getElementById('fcMapSave').addEventListener('click', async () => {
      const added = fcMergeSalesExport(p.salesExport);
      duRecord('sales', {file: p.name, summary: `${fcShort(p.salesExport.from)} – ${fcShort(p.salesExport.to)} · ${added} days → Forecast`, periodEnd: p.salesExport.to});
      fcPendingFile = null;
      await saveState();
      if(typeof showToast === 'function') showToast(`${added} day${added === 1 ? '' : 's'} saved to the sales history`);
      renderForecastView();
    });
    document.getElementById('fcMapCancel').addEventListener('click', () => { fcPendingFile = null; area.innerHTML = ''; });
    return;
  }
  const labels = p.table.headers.map((h, i) => { const sample = p.table.rows.find(r => r[i] && r[i].trim()); return `${h || `Column ${i + 1}`}${sample ? `  —  e.g. "${sample[i].trim().slice(0, 18)}"` : ''}`; });
  const records = fcRecordsFromTable(p.table, p.map);
  const dates = records.map(r => r.date).sort();
  area.innerHTML = `<div class="fc-map">
    <p><b>${fcEsc(p.name)}</b> — ${p.table.rows.length} rows. Which column is which:</p>
    <div class="fc-mapgrid">${FC_FIELDS.map(f => `<label class="fc-field"><span>${f.label}${f.key === 'date' ? '' : ' <i>(optional)</i>'}</span><select data-fc-map="${f.key}">${f.key === 'date' ? '' : '<option value="">(none)</option>'}${p.table.headers.map((h, i) => `<option value="${i}" ${p.map[f.key] === i ? 'selected' : ''}>${fcEsc(labels[i])}</option>`).join('')}</select></label>`).join('')}</div>
    <p class="fc-muted">${records.length ? `${records.length} dated row${records.length === 1 ? '' : 's'}, ${fcShort(dates[0])} – ${fcShort(dates[dates.length - 1])}.` : 'No dated rows with that date column — pick another.'}</p>
    <div class="fc-actions"><button type="button" class="btn btn-primary" id="fcMapSave" ${records.length ? '' : 'disabled'}>Save to history</button><button type="button" class="btn btn-ghost" id="fcMapCancel">Cancel</button></div>
  </div>`;
  area.querySelectorAll('[data-fc-map]').forEach(sel => sel.addEventListener('change', e => { const v = e.target.value; if(v === '') delete p.map[e.target.dataset.fcMap]; else p.map[e.target.dataset.fcMap] = +v; fcRenderMap(); }));
  document.getElementById('fcMapSave').addEventListener('click', async () => {
    const n = fcMergeRecords(fcRecordsFromTable(p.table, p.map));
    duRecord('labor', {file: p.name, summary: `${fcShort(dates[0])} – ${fcShort(dates[dates.length - 1])} · ${n} day${n === 1 ? '' : 's'}`, periodEnd: dates[dates.length - 1]});
    fcPendingFile = null;
    if(typeof rpApplyToScoreboard === 'function') rpApplyToScoreboard();
    await saveState();
    if(typeof showToast === 'function') showToast(`${n} day${n === 1 ? '' : 's'} saved to the sales history`);
    renderForecastView();
  });
  document.getElementById('fcMapCancel').addEventListener('click', () => { fcPendingFile = null; area.innerHTML = ''; });
}

// ----- Charts (inline SVG, no library) -----

function fcSvg(tag, attrs){ const el = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v)); return el; }
function fcTip(x, y, text){
  const tip = document.getElementById('fcTip');
  if(!tip) return;
  tip.textContent = text;
  tip.hidden = false;
  const w = tip.offsetWidth;
  tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2)) + 'px';
  tip.style.top = (y - 36) + 'px';
}
function fcHideTip(){ const tip = document.getElementById('fcTip'); if(tip) tip.hidden = true; }
function fcTipOn(el, text){
  el.addEventListener('mousemove', ev => fcTip(ev.clientX, ev.clientY, text));
  el.addEventListener('mouseleave', fcHideTip);
  el.addEventListener('touchstart', ev => { const t = ev.touches[0]; fcTip(t.clientX, t.clientY, text); setTimeout(fcHideTip, 1800); }, {passive: true});
}
function fcWireTips(root){ root.querySelectorAll('[data-fc-tip]').forEach(el => fcTipOn(el, el.dataset.fcTip)); }

function fcBarChart(container, labels, values, color, fmt){
  container.innerHTML = '';
  const W = container.clientWidth || 340, H = 190, padL = 50, padB = 26, padT = 12, padR = 8;
  const svg = fcSvg('svg', {viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': 'bar chart'});
  const maxV = Math.max(...values.filter(v => v != null), 1) * 1.15;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  for(let i = 0; i <= 3; i++){
    const y = padT + plotH - (i / 3) * plotH;
    svg.appendChild(fcSvg('line', {x1: padL, x2: W - padR, y1: y, y2: y, class: 'fc-grid'}));
    const t = fcSvg('text', {x: padL - 6, y: y + 4, class: 'fc-axis', 'text-anchor': 'end'}); t.textContent = fmt(maxV * (i / 3)); svg.appendChild(t);
  }
  const bw = plotW / labels.length;
  const every = Math.max(1, Math.ceil(44 / bw));   // labels that would overlap are thinned
  labels.forEach((lab, i) => {
    const v = values[i];
    const x = padL + i * bw + bw * 0.18, w = bw * 0.64;
    const h = v != null ? (v / maxV) * plotH : 0;
    const rect = fcSvg('rect', {x, y: padT + plotH - h, width: w, height: Math.max(h, 0), rx: 4, fill: color, class: 'fc-bar'});
    fcTipOn(rect, `${lab}: ${v != null ? fmt(v) : 'no data'}`);
    svg.appendChild(rect);
    if(i % every === 0 || (every > 1 && i === labels.length - 1 && (labels.length - 1) % every >= every / 2)){
      const t = fcSvg('text', {x: x + w / 2, y: H - 8, class: 'fc-axis', 'text-anchor': 'middle'}); t.textContent = lab; svg.appendChild(t);
    }
  });
  container.appendChild(svg);
}
function fcTrendChart(container, weekly, trend){
  container.innerHTML = '';
  if(weekly.length < 2){ container.innerHTML = '<p class="fc-empty">Not enough full weeks yet to draw a trend.</p>'; return; }
  const W = container.clientWidth || 700, H = 220, padL = 58, padB = 30, padT = 14, padR = 16;
  const svg = fcSvg('svg', {viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': 'weekly sales trend'});
  const vals = weekly.map(w => w.sales);
  const fitted = weekly.map((_, i) => trend.intercept + trend.slope * i);
  const maxV = Math.max(...vals, ...fitted) * 1.08, minV = Math.min(0, ...vals, ...fitted);
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xFor = i => padL + (i / (weekly.length - 1)) * plotW;
  const yFor = v => padT + plotH - ((v - minV) / (maxV - minV || 1)) * plotH;
  for(let i = 0; i <= 3; i++){
    const y = padT + plotH - (i / 3) * plotH;
    svg.appendChild(fcSvg('line', {x1: padL, x2: W - padR, y1: y, y2: y, class: 'fc-grid'}));
    const t = fcSvg('text', {x: padL - 6, y: y + 4, class: 'fc-axis', 'text-anchor': 'end'}); t.textContent = fcMoney(minV + (maxV - minV) * (i / 3)); svg.appendChild(t);
  }
  const path = (arr, attrs) => { let d = ''; arr.forEach((v, i) => { d += (i ? 'L' : 'M') + xFor(i) + ',' + yFor(v) + ' '; }); svg.appendChild(fcSvg('path', {d, fill: 'none', ...attrs})); };
  path(fitted, {stroke: 'var(--cfa-red)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4', opacity: 0.8});
  path(vals, {stroke: 'var(--cfa-navy)', 'stroke-width': 2.5});
  vals.forEach((v, i) => {
    const c = fcSvg('circle', {cx: xFor(i), cy: yFor(v), r: 4, fill: 'var(--cfa-white)', stroke: 'var(--cfa-navy)', 'stroke-width': 2, class: 'fc-bar'});
    fcTipOn(c, `Week of ${fcShort(weekly[i].week)}: ${fcMoney(v)}`);
    svg.appendChild(c);
    if(i === 0 || i === vals.length - 1 || i % Math.max(1, Math.ceil(vals.length / 6)) === 0){
      const t = fcSvg('text', {x: xFor(i), y: H - 8, class: 'fc-axis', 'text-anchor': 'middle'}); t.textContent = fcShort(weekly[i].week); svg.appendChild(t);
    }
  });
  container.appendChild(svg);
}
function fcCompareChart(container, results){
  container.innerHTML = '';
  if(results.length < 2){ container.innerHTML = '<p class="fc-empty">Not enough backtested days to chart yet.</p>'; return; }
  const W = container.clientWidth || 700, H = 220, padL = 58, padB = 30, padT = 14, padR = 16;
  const svg = fcSvg('svg', {viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': 'actual vs forecast'});
  const actuals = results.map(r => r.actual), forecasts = results.map(r => r.forecast);
  const maxV = Math.max(...actuals, ...forecasts) * 1.08, minV = 0;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xFor = i => padL + (i / (results.length - 1)) * plotW;
  const yFor = v => padT + plotH - ((v - minV) / (maxV - minV || 1)) * plotH;
  for(let i = 0; i <= 3; i++){
    const y = padT + plotH - (i / 3) * plotH;
    svg.appendChild(fcSvg('line', {x1: padL, x2: W - padR, y1: y, y2: y, class: 'fc-grid'}));
    const t = fcSvg('text', {x: padL - 6, y: y + 4, class: 'fc-axis', 'text-anchor': 'end'}); t.textContent = fcMoney(minV + (maxV - minV) * (i / 3)); svg.appendChild(t);
  }
  const path = (arr, attrs) => { let d = ''; arr.forEach((v, i) => { d += (i ? 'L' : 'M') + xFor(i) + ',' + yFor(v) + ' '; }); svg.appendChild(fcSvg('path', {d, fill: 'none', ...attrs})); };
  path(actuals, {stroke: 'var(--cfa-navy)', 'stroke-width': 2.5});
  path(forecasts, {stroke: 'var(--cfa-red)', 'stroke-width': 2, 'stroke-dasharray': '4 4'});
  results.forEach((r, i) => {
    const c = fcSvg('circle', {cx: xFor(i), cy: yFor(r.actual), r: 3.5, fill: 'var(--cfa-navy)', class: 'fc-bar'});
    fcTipOn(c, `${FC_DOW[r.dow]} ${fcShort(r.date)}: actual ${fcMoney(r.actual)}, forecast ${fcMoney(r.forecast)} (${r.accuracy.toFixed(0)}%)`);
    svg.appendChild(c);
    if(i === 0 || i === results.length - 1 || i % Math.max(1, Math.ceil(results.length / 6)) === 0){
      const t = fcSvg('text', {x: xFor(i), y: H - 8, class: 'fc-axis', 'text-anchor': 'middle'}); t.textContent = fcShort(r.date); svg.appendChild(t);
    }
  });
  container.appendChild(svg);
}

// ----- Wiring -----

if(typeof document !== 'undefined' && document.getElementById('forecastView')){
  document.querySelector('#forecastView .fc-tabs').addEventListener('click', e => {
    const btn = e.target.closest('[data-fc-tab]');
    if(!btn) return;
    fcTab = btn.dataset.fcTab;
    renderForecastView();
  });
  // Manage → Know the Numbers: "Fill from the Forecast" opens the preview here.
  const knBtn = document.getElementById('knFromForecast');
  if(knBtn) knBtn.addEventListener('click', () => { fcTab = 'forecast'; fcNumbersOpen = true; launchShowTab('forecast'); const c = document.getElementById('fcNumbersCard'); if(c && c.scrollIntoView) c.scrollIntoView({block: 'start'}); });
  let fcResizeTimer = null;
  window.addEventListener('resize', () => {
    const view = document.getElementById('forecastView');
    if(!view.classList.contains('active') || fcTab === 'forecast' || fcTab === 'data') return;
    clearTimeout(fcResizeTimer);
    fcResizeTimer = setTimeout(renderForecastView, 150);
  });
}
