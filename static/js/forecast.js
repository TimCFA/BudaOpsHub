// ===== SALES & LABOR FORECAST =====
// The Forecast tab: what sales to expect each day ahead and the labor hours
// that fit, worked out from this store's own history. A manager uploads the
// Analytics Hub sales-by-day export (the same one Guest Obsession uses) and
// a labor-by-day export through Data Uploads; every day lands in
// salesHistory, keyed by date, and keeps accumulating across uploads.
//
// The model, kept deliberately simple so a leader can explain it:
//   baseline  = the average for that weekday over the look-back window
//   trend     = a straight-line fit through the window's full weeks, applied
//               as a % per week for the weeks between the last day of
//               history and the forecast day (capped so a noisy fit can't
//               run away)
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
let forecastSettings = {};  // {method, splh, pct, wage, lookback, days, adjustments: {iso: pct}}

const FC_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FC_DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FC_DEFAULTS = {method: 'splh', splh: null, pct: null, wage: null, lookback: 8, days: 7, adjustments: {}};
const FC_MAX_TREND_PCT = 5;      // % per week the projection will follow, at most
const FC_FULL_WEEK_DAYS = 5;     // a week with fewer days of data is left out of weekly trends
const FC_CLOSED_SPAN_DAYS = 21;  // a weekday never seen across this many days is taken as closed
const FC_CHANNEL_ORDER = ['Drive Thru', 'Dine In', '3PD', 'Carry Out', 'Catering', 'Curbside'];

// The columns a file can carry, with the header words that identify each.
// `not` keeps a near-miss (Labor Cost % for labor cost $) from being picked.
const FC_FIELDS = [
  {key: 'date', label: 'Date', kws: ['business date', 'current year', 'date', 'day']},
  {key: 'sales', label: 'Sales $', kws: ['net sales', 'sales amount', 'total sales', 'sales metric', 'revenue', 'sales'], not: /%|pct|percent|secondary|per labor|splh|productiv/i},
  {key: 'transactions', label: 'Transactions', kws: ['transaction', 'trans count', 'ticket count', 'guest count', 'checks', 'trans']},
  {key: 'hours', label: 'Labor hours', kws: ['timekeeping hours', 'labor hours', 'worked hours', 'total hours', 'hours'], not: /%|pct|percent|per labor|splh|productiv/i},
  {key: 'cost', label: 'Labor cost $', kws: ['labor cost $', 'total labor cost', 'labor $', 'labor dollars', 'labor cost'], not: /%|pct|percent/i},
  {key: 'pct', label: 'Labor % of sales', kws: ['labor cost %', 'labor %', 'labor pct', 'labor percent']},
  {key: 'wage', label: 'Average wage $/hr', kws: ['effective wage', 'average wage', 'avg wage', 'wage rate', 'wage']}
];
const FC_FIELD_TO_KEY = {sales: 'sales', transactions: 'transactions', hours: 'laborHours', cost: 'laborCost', pct: 'laborPct', wage: 'wage'};

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
    if(f.key === 'date' && idx === -1) idx = fcSniffDateColumn(headers, rows);
    if(idx > -1) map[f.key] = idx;
  });
  return map;
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
    Object.values(FC_FIELD_TO_KEY).forEach(key => { if(rec[key] != null) day[key] = rec[key]; });
    if(rec.channels){ day.channels = {...(day.channels || {})}; Object.entries(rec.channels).forEach(([name, v]) => { if(v != null) day.channels[name] = v; }); }
    n++;
  });
  return n;
}

// The Analytics Hub sales-by-day export, as rpParseSales reads it: every
// day's total and its sales by destination.
function fcMergeSalesExport(parsed, hist){
  if(!parsed || !Array.isArray(parsed.days)) return 0;
  const records = parsed.days.map(([iso, sales]) => ({date: iso, sales, channels: (parsed.channelDays || {})[iso] || null}));
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
  const fields = ['laborHours', 'laborCost', 'laborPct', 'wage', 'sales', 'transactions'].filter(k => records.some(r => r[k] != null));
  duRecord('labor', {file: file.name, summary: `${range} · ${n} day${n === 1 ? '' : 's'}`, periodEnd: dates[dates.length - 1]});
  await saveState();
  fcRerender();
  const names = {laborHours: 'labor hours', laborCost: 'labor cost', laborPct: 'labor %', wage: 'wage', sales: 'sales', transactions: 'transactions'};
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

// Per weekday: average sales, transactions and labor hours. A weekday that
// never appears across three weeks or more of history is a closed day (the
// sales export leaves Sundays out instead of logging $0).
function fcDowStats(rows){
  const b = Array.from({length: 7}, () => ({sales: [], trans: [], labor: []}));
  rows.forEach(r => {
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
    const v = pick ? pick(r) : r.sales;
    if(v == null || isNaN(v)) return;
    const w = fcWeekOf(r.date);
    const e = byWeek[w] = byWeek[w] || {week: w, sales: 0, days: 0};
    e.sales += v; e.days++;
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
function fcAnalysis(hist, weeks, cutoff){
  const rows = fcHistoryRows(hist, weeks, cutoff);
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
  return {rows, dow, weekly, trend, avgSPLH, avgLaborPct, avgWage, hasTransactions: rows.some(r => r.transactions != null), hasLabor: withHours.length > 0};
}

// The model's own expectation for one day: the weekday average carried
// forward by the trend.
function fcBaseline(iso, a){
  const dow = fcDow(iso);
  const stat = a.dow[dow];
  if(!stat || stat.sales == null) return {sales: null, transactions: null, dow, closed: false};
  if(stat.closed) return {sales: 0, transactions: 0, dow, closed: true};
  const last = a.rows.length ? a.rows[a.rows.length - 1].date : iso;
  const weeksAhead = Math.max(0, (fcToDate(iso) - fcToDate(last)) / (7 * 86400000));
  const g = Math.max(-FC_MAX_TREND_PCT, Math.min(FC_MAX_TREND_PCT, a.trend.weeklyGrowthPct || 0));
  const sales = stat.sales * Math.pow(1 + g / 100, weeksAhead);
  const ratio = stat.transactions && stat.sales ? stat.transactions / stat.sales : null;
  return {sales, transactions: ratio != null ? sales * ratio : stat.transactions, dow, closed: false};
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
function fcBacktest(hist, testDays, weeks){
  const all = fcHistoryRows(hist, 0);
  const out = [];
  all.slice(-testDays).forEach(row => {
    const a = fcAnalysis(hist, weeks, row.date);
    if(a.rows.length < 7) return;
    const base = fcBaseline(row.date, a);
    const acc = fcAccuracy(row.sales, base.sales);
    if(acc == null) return;
    out.push({date: row.date, dow: row.dow, actual: row.sales, forecast: base.sales, accuracy: acc});
  });
  return out;
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
  const weeks = +s.lookback;
  return weeks > 0 ? `last ${weeks} weeks` : 'all history';
}

// --- Forecast tab ---
function fcRenderForecast(){
  const panel = document.getElementById('fcPanelForecast');
  const s = fcSettings();
  const a = fcAnalysis(salesHistory, +s.lookback);
  // Targets start from the history's own numbers the first time.
  const splh = s.splh != null ? s.splh : (a.avgSPLH ? Math.round(a.avgSPLH) : '');
  const pct = s.pct != null ? s.pct : (a.avgLaborPct ? +a.avgLaborPct.toFixed(1) : '');
  const wage = s.wage != null ? s.wage : (a.avgWage ? +a.avgWage.toFixed(2) : '');
  const dates = fcDates();
  const pctMethod = s.method === 'pct';
  const lookbackOpts = [[4, '4 weeks'], [8, '8 weeks'], [12, '12 weeks'], [26, '26 weeks'], [0, 'All history']];

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
    return `<tr class="${adj ? 'is-adjusted' : ''} ${base.closed ? 'is-closed' : ''}">
      <td><b>${FC_DOW[base.dow]}</b> <span class="fc-muted">${fcShort(iso)}</span></td>
      <td class="fc-num">${base.sales == null ? '<span class="fc-muted">no history</span>' : fcMoney(base.sales)}</td>
      <td>${adjCell}</td>
      <td class="fc-num fc-strong ${adj > 0 ? 'is-up' : adj < 0 ? 'is-down' : ''}">${adjSales == null ? '—' : fcMoney(adjSales)}</td>
      ${a.hasTransactions ? `<td class="fc-num">${adjTrans == null ? '—' : fcNumFmt(adjTrans)}</td>` : ''}
      <td class="fc-num">${hrs == null ? '—' : fcNumFmt(hrs, 1)}</td>
    </tr>`;
  }).join('');

  const trendPct = Math.max(-FC_MAX_TREND_PCT, Math.min(FC_MAX_TREND_PCT, a.trend.weeklyGrowthPct || 0));
  const openDays = dates.filter(d => !fcBaseline(d, a).closed && fcBaseline(d, a).sales != null).length;
  const laborNote = !a.hasLabor && pctMethod ? 'Enter a labor % and wage, or upload labor by day' : !a.hasLabor && !splh ? 'Enter a $ per labor hour target, or upload labor by day' : '';
  panel.innerHTML = `
    <div class="standup-card fc-controls">
      <div class="fc-field"><label for="fcStart">Start</label><input type="date" id="fcStart" value="${fcStart}"></div>
      <div class="fc-field"><label for="fcDays">Days</label><select id="fcDays">${[7, 14].map(n => `<option value="${n}" ${+s.days === n ? 'selected' : ''}>${n} days</option>`).join('')}</select></div>
      <div class="fc-field"><label for="fcLookback">Based on</label><select id="fcLookback">${lookbackOpts.map(([v, l]) => `<option value="${v}" ${+s.lookback === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
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
        <thead><tr><th>Day</th><th class="fc-num">Baseline</th><th>Adjustment</th><th class="fc-num">Forecast</th>${a.hasTransactions ? '<th class="fc-num">Transactions</th>' : ''}<th class="fc-num">Labor hrs</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr><td>Total</td><td class="fc-num">${fcMoney(totalBase)}</td><td></td><td class="fc-num">${fcMoney(totalAdj)}</td>${a.hasTransactions ? '<td></td>' : ''}<td class="fc-num">${anyHrs ? fcNumFmt(totalHrs, 1) : '—'}</td></tr></tfoot>
      </table>
    </div>
    <div class="fc-actions">
      <button type="button" class="btn btn-ghost" id="fcCopy">Copy as CSV</button>
      <button type="button" class="btn btn-ghost" id="fcDownload">Download CSV</button>
      <span class="fc-muted">Baseline = that weekday's average over ${fcLookbackLabel(a, s)}, carried forward by the weekly trend.</span>
    </div>`;

  const wire = (id, ev, fn) => { const el = document.getElementById(id); if(el) el.addEventListener(ev, fn); };
  wire('fcStart', 'change', e => { if(fcValidIso(e.target.value)) fcStart = e.target.value; fcRenderForecast(); });
  wire('fcDays', 'change', e => { fcSaveSettings({days: +e.target.value}); fcRenderForecast(); });
  wire('fcLookback', 'change', e => { fcSaveSettings({lookback: +e.target.value}); fcRenderForecast(); });
  wire('fcMethod', 'change', e => { fcSaveSettings({method: e.target.value}); fcRenderForecast(); });
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
}
function fcBulkAdjust(pct){
  const adjustments = {...fcSettings().adjustments};
  const a = fcAnalysis(salesHistory, +fcSettings().lookback);
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
  const a = fcAnalysis(salesHistory, +s.lookback);
  const weeklyAvg = a.weekly.length ? a.weekly.reduce((t, w) => t + w.sales, 0) / a.weekly.length : null;
  const g = a.trend.weeklyGrowthPct || 0;
  const first = a.rows[0], last = a.rows[a.rows.length - 1];
  panel.innerHTML = `
    <div class="fc-panel-head"><p class="fc-lede">${a.rows.length} day${a.rows.length === 1 ? '' : 's'} · ${first ? `${fcShort(first.date)} – ${fcShort(last.date)}` : ''} · ${fcLookbackLabel(a, s)} <select id="fcLookback2" class="fc-inline-select" aria-label="Look back">${[[4, '4 weeks'], [8, '8 weeks'], [12, '12 weeks'], [26, '26 weeks'], [0, 'All history']].map(([v, l]) => `<option value="${v}" ${+s.lookback === v ? 'selected' : ''}>${l}</option>`).join('')}</select></p></div>
    <div class="fc-kpis">
      ${fcKpi(FC_ICON.dollar, 'Avg weekly sales', fcMoney(weeklyAvg), a.weekly.length ? `${a.weekly.length} full week${a.weekly.length === 1 ? '' : 's'}` : 'no full week yet')}
      ${fcKpi(g >= 0 ? FC_ICON.trendUp : FC_ICON.trendDown, 'Weekly trend', fcPctFmt(g), g >= 0 ? 'trending up' : 'trending down', g >= 0 ? 'is-up' : 'is-down')}
      ${fcKpi(FC_ICON.clock, 'Avg $ / labor hour', a.avgSPLH != null ? fcMoney(a.avgSPLH) : '—', a.avgSPLH != null ? 'sales ÷ labor hours' : 'upload labor by day')}
      ${fcKpi(FC_ICON.percent, 'Labor % of sales', a.avgLaborPct != null ? a.avgLaborPct.toFixed(1) + '%' : '—', a.avgLaborPct != null ? 'labor cost ÷ sales' : 'needs labor cost')}
    </div>
    <div class="standup-card fc-chart-card"><h3>Sales by week</h3><p class="fc-muted">Full weeks only (Sunday to Saturday). The dashed line is the trend the forecast follows.</p><div id="fcTrendChart" class="fc-chart"></div></div>
    <div class="fc-two">
      <div class="standup-card fc-chart-card"><h3>Average sales by weekday</h3><div id="fcDowSales" class="fc-chart"></div></div>
      <div class="standup-card fc-chart-card"><h3>Average labor hours by weekday</h3><div id="fcDowLabor" class="fc-chart"></div></div>
    </div>`;
  document.getElementById('fcLookback2').addEventListener('change', e => { fcSaveSettings({lookback: +e.target.value}); fcRenderPatterns(); });
  fcTrendChart(document.getElementById('fcTrendChart'), a.weekly, a.trend);
  fcBarChart(document.getElementById('fcDowSales'), FC_DOW, a.dow.map(d => d.sales), 'var(--cfa-navy)', fcMoney);
  if(a.dow.some(d => d.laborHours != null)) fcBarChart(document.getElementById('fcDowLabor'), FC_DOW, a.dow.map(d => d.laborHours), 'var(--fc-labor)', v => fcNumFmt(v));
  else document.getElementById('fcDowLabor').innerHTML = '<p class="fc-empty">No labor hours yet — upload a labor by day export.</p>';
}

// --- Accuracy tab ---
function fcRenderAccuracy(){
  const panel = document.getElementById('fcPanelAccuracy');
  const s = fcSettings();
  const results = fcBacktest(salesHistory, fcBacktestDays, +s.lookback);
  const sel = `<select id="fcBacktestDays" class="fc-inline-select" aria-label="Days to test">${[7, 14, 28].map(n => `<option value="${n}" ${fcBacktestDays === n ? 'selected' : ''}>last ${n} days</option>`).join('')}</select>`;
  if(!results.length){
    panel.innerHTML = `<div class="fc-panel-head"><p class="fc-lede">How the model would have done on days already lived, forecasting each from only the history before it: ${sel}</p></div><p class="fc-empty">Not enough history to test yet — the backtest needs at least a week before each day it scores.</p>`;
    document.getElementById('fcBacktestDays').addEventListener('change', e => { fcBacktestDays = +e.target.value; fcRenderAccuracy(); });
    return;
  }
  const avg = results.reduce((t, r) => t + r.accuracy, 0) / results.length;
  const best = results.reduce((x, y) => y.accuracy > x.accuracy ? y : x);
  const worst = results.reduce((x, y) => y.accuracy < x.accuracy ? y : x);
  const miss = results.reduce((t, r) => t + Math.abs(r.actual - r.forecast), 0) / results.length;
  const tier = acc => acc >= 90 ? 'is-good' : acc >= 75 ? 'is-warn' : 'is-bad';
  panel.innerHTML = `
    <div class="fc-panel-head"><p class="fc-lede">How the model would have done on days already lived, forecasting each from only the history before it: ${sel}</p></div>
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
  const a = fcAnalysis(salesHistory, +s.lookback);
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
      <p class="fc-muted">Two files keep it current, and Data Uploads in Manage takes both: the Analytics Hub <b>sales by day</b> export (sales and destinations) and a <b>labor by day</b> export (hours, cost, labor %). Days already saved are updated, never doubled. Nothing but the numbers is kept.</p>
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
        <thead><tr><th>Day</th><th class="fc-num">Sales</th><th class="fc-num">Trans.</th><th class="fc-num">Labor hrs</th><th class="fc-num">$ / labor hr</th><th class="fc-num">Labor %</th></tr></thead>
        <tbody>${recent.map(r => { const splh = r.laborHours > 0 && r.sales ? r.sales / r.laborHours : null; const pct = r.laborPct != null ? r.laborPct : (r.laborCost != null && r.sales ? r.laborCost / r.sales * 100 : null); return `<tr><td><b>${FC_DOW[r.dow]}</b> <span class="fc-muted">${fcShort(r.date)}</span></td><td class="fc-num">${fcMoney(r.sales)}</td><td class="fc-num">${r.transactions != null ? fcNumFmt(r.transactions) : '—'}</td><td class="fc-num">${r.laborHours != null ? fcNumFmt(r.laborHours, 1) : '—'}</td><td class="fc-num">${splh != null ? fcMoney(splh) : '—'}</td><td class="fc-num">${pct != null ? pct.toFixed(1) + '%' : '—'}</td></tr>`; }).join('')}</tbody>
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
      fcPendingFile = {name: file.name, salesExport: rpParseSales(pbDecodeText(reader.result))};
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
  let fcResizeTimer = null;
  window.addEventListener('resize', () => {
    const view = document.getElementById('forecastView');
    if(!view.classList.contains('active') || fcTab === 'forecast' || fcTab === 'data') return;
    clearTimeout(fcResizeTimer);
    fcResizeTimer = setTimeout(renderForecastView, 150);
  });
}
