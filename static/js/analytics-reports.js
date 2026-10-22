// ===== THE SCHEDULE BUILDER'S SALES AND LABOR REPORTS (Tim, Oct 20 2026) =====
// The Schedule Builder's upload bundle carries the week's numbers as
// Analytics Hub dashboard PDFs and 15-minute CSVs, not the CSV exports Data
// Uploads read, so Know the Numbers and the Forecast went without new sales
// and labor. These file them where the old exports went:
//  - Daily Detail PDF → each day's sales, last year's sales, labor hours,
//    benchmark hours, wage, labor % and check average (salesHistory), like
//    DayTrack. Read on the server (analytics_pdf.py).
//  - Sales Data PDF → month-to-date sales and each day's sales by
//    destination, like the sales-by-day export (rpFileSales).
//  - 15-minute sales CSV → one day's sales in 15-minute steps, dated by
//    matching its total against the day's sales on file (so a bundle files
//    its PDFs first), summed into Know the Numbers' four dayparts and kept
//    with the weekly daypart files (daypartWeeks, key q:<Monday>), where
//    Know the Numbers' actual sales and productivity come from (kaFill).

const AN_MATCH_DOLLARS = 1;        // a 15-minute file's total within $1 of the day's sales (Daily Detail rounds to the dollar)
const AN_MATCH_DAYS = 120;

// The dashboard PDFs by name; any other PDF keeps its old path.
const anIsDashboardPdf = name => /(Daily[_ ]?Detail|Sales[_ ]?Data|Productivity|Labor[_ ]?Cost|Sales[_ ]?Curve)[^/]*\.pdf$/i.test(String(name || ''));

// → {kind, rows | sales}, or null when it isn't one of these PDFs.
async function anReadPdf(file){
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE}/api/reports/analytics-pdf`, {method: 'POST', body: fd});
  const data = await res.json().catch(() => ({}));
  if(res.ok) return data;
  if(data.notAnalytics) return null;
  throw new Error(data.error || 'Couldn’t read that PDF.');
}

// Daily Detail rows → salesHistory. Its sales are whole dollars: a day
// already on file to the cent keeps its cents.
async function anFileDailyDetail(file, rows){
  const records = rows.map(r => {
    const rec = {...r};
    const day = salesHistory[r.date];
    if(day && day.sales != null && Math.abs(day.sales - r.sales) <= 0.5) delete rec.sales;
    if(!rec.lastYearDate && typeof fcAddDays === 'function' && typeof FC_YEAR_DAYS !== 'undefined') rec.lastYearDate = fcAddDays(r.date, -FC_YEAR_DAYS);
    return rec;
  });
  const n = fcMergeRecords(records);
  const dates = rows.map(r => r.date).sort();
  const range = `${fcShort(dates[0])} – ${fcShort(dates[dates.length - 1])}`;
  duRecord('labor', {file: file.name, summary: `${range} · ${n} day${n === 1 ? '' : 's'} (Daily Detail)`, periodEnd: dates[dates.length - 1]});
  if(typeof rpApplyToScoreboard === 'function') rpApplyToScoreboard();
  const filled = typeof kaFill === 'function' ? kaFill() : null;
  await saveState();
  fcRerender();
  return `${range}: ${n} day${n === 1 ? '' : 's'} of sales, last year's sales, labor hours, benchmark hours, wage, labor % and check average → Forecast${filled && kaFillText(filled) ? ` · ${kaFillText(filled)} → Know the Numbers` : ''}`;
}

// ----- 15-minute sales -----
// Rows "1130 | 11:30 AM | total | change | Dine In | …"; the Total row is the day's.
function anIsQuarterCsv(text){
  return /Sales Metric/.test(text) && /^\s*\d{3,4}\t\s*\d{1,2}:\d{2} [AP]M/m.test(text);
}
function anParseQuarter(text){
  const rows = duParseTsv(text);
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isNaN(n) ? null : n; };
  const totalRow = rows.find(r => String(r[0] || '').trim() === 'Total' && String(r[1] || '').trim() === 'Total');
  const slots = [];
  rows.forEach(r => {
    const m = String(r[1] || '').trim().match(/^(\d{1,2}):(\d{2}) ([AP])M$/i);
    const v = num(r[2]);
    if(!m || v === null) return;
    let h = +m[1] % 12;
    if(/p/i.test(m[3])) h += 12;
    slots.push([h * 60 + +m[2], v]);
  });
  if(!slots.length) throw new Error('No 15-minute rows in this export.');
  const total = totalRow && num(totalRow[2]) !== null ? num(totalRow[2]) : slots.reduce((t, s) => t + s[1], 0);
  return {total, slots};
}
// The one day whose sales match the file's total, or null.
function anDateQuarter(total){
  const since = kaAddDays(today, -AN_MATCH_DAYS);
  const near = Object.keys(salesHistory || {}).filter(iso => iso >= since && iso < today && salesHistory[iso] && salesHistory[iso].sales > 0
    && Math.abs(salesHistory[iso].sales - total) <= AN_MATCH_DOLLARS);
  if(near.length === 1) return near[0];
  const exact = near.filter(iso => Math.abs(salesHistory[iso].sales - total) < 0.01);
  return exact.length === 1 ? exact[0] : null;
}
// The day's 15-minute sales summed into Know the Numbers' dayparts.
function anDayparts(slots){
  const out = {};
  kaWindows().forEach(w => { out[w.key] = Math.round(slots.filter(s => s[0] >= w.start && s[0] < w.end).reduce((t, s) => t + s[1], 0) * 100) / 100; });
  return out;
}

// `day`: the day a leader picked for a file that matched none; `filedDays`
// (a Set) collects the day filed, for the next file's suggestion.
async function anFileQuarter(file, text, day, filedDays){
  const q = anParseQuarter(text);
  const iso = day || anDateQuarter(q.total);
  if(!iso){
    const err = new Error(`Its total (${fcMoney(q.total)}) matches no day’s sales on file, so the hub can’t tell which day it is. Pick the day below.`);
    err.waiting = true;
    err.total = q.total;
    throw err;
  }
  // A picked day with no sales on file takes the file's total as its sales.
  let addedSales = false;
  if(day && !(salesHistory[iso] && salesHistory[iso].sales > 0) && q.total > 0){
    fcMergeRecords([{date: iso, sales: Math.round(q.total * 100) / 100}]);
    addedSales = true;
  }
  if(filedDays) filedDays.add(iso);
  const dps = anDayparts(q.slots);
  const monday = kaMonday(iso);
  const dow = KA_DOWS[(new Date(iso + 'T12:00:00').getDay() + 6) % 7];
  const key = 'q:' + monday;
  const w = daypartWeeks[key] = daypartWeeks[key] || {days: {}, week: monday, file: '15-minute sales'};
  w.days = {...(w.days || {}), [dow]: dps};
  w.week = monday;
  w.at = new Date().toISOString();
  w.total = Math.round(Object.values(w.days).reduce((t, d) => t + Object.values(d).reduce((a, b) => a + b, 0), 0) * 100) / 100;
  const keys = Object.keys(daypartWeeks).sort((a, b) => String(daypartWeeks[a].at).localeCompare(String(daypartWeeks[b].at)));
  keys.slice(0, Math.max(0, keys.length - FC_WEEKS_KEEP)).forEach(k => { if(k !== key) delete daypartWeeks[k]; });
  const filled = kaFill();
  duRecord('dayparts', {file: file.name, summary: `${fcShort(iso)} · 15-minute sales`, periodEnd: iso});
  await saveState();
  fcRerender();
  if(document.getElementById('numbersContent') && typeof renderNumbersContent === 'function') renderNumbersContent();
  const parts = Object.entries(dps).map(([k, v]) => `${k} ${fcMoney(v)}`).join(' · ');
  return `${new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'})}: ${parts} → Know the Numbers${kaFillText(filled) ? ` (${kaFillText(filled)})` : ' (already had these actuals)'}${addedSales ? ` · ${fcMoney(q.total)} day’s sales → Forecast` : ''}`;
}

// ----- Productivity, Labor Cost and Sales Curve dashboards (Tim, Oct 22 2026) -----
// The bundle's other dashboard PDFs, read on the server, into the weekday
// profiles the break planner and the Forecast use (productivityProfiles):
//  - Productivity by hour → each weekday's sales per labor hour, hour by hour
//    (breaks stay out of the busiest).
//  - Productivity by daypart → each weekday's sales, hours and sales per
//    labor hour per daypart (the Forecast's daypart productivity goals).
//  - Labor Cost → each weekday's labor % hour by hour.
//  - Sales Curve → the average hour, all days: sales, hours, productivity
//    (the profile any day without its own borrows).
const AN_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const AN_DAYPARTS = ['Breakfast', 'Lunch', 'Afternoon', 'Dinner'];

function anProfile(day){
  const p = productivityProfiles[day] = productivityProfiles[day] || {hours: {}};
  p.hours = p.hours || {};
  return p;
}
function anSetHour(day, min, field, v){
  if(v == null || !isFinite(v)) return;
  const hours = anProfile(day).hours;
  hours[min] = {...(hours[min] || {}), [field]: v};
}
function anRangeText(d){
  if(d.from && d.to) return `${fcShort(d.from)} – ${fcShort(d.to)}`;
  if(d.range === 'month to date') return d.updated ? `month to date, as of ${fcShort(d.updated)}` : 'month to date';
  return d.range || '';
}
// 'Mon–Fri' for days in a row, else 'Mon, Wed, Fri'.
function anDayShort(days){
  const idx = days.map(d => AN_WEEKDAYS.indexOf(d));
  if(days.length >= 3 && idx.every((v, i) => v >= 0 && (i === 0 || v === idx[i - 1] + 1))) return `${days[0].slice(0, 3)}–${days[days.length - 1].slice(0, 3)}`;
  return days.map(d => d.slice(0, 3)).join(', ');
}
const anHour = m => { const h = Math.floor(m / 60) % 24; return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`; };

// → the line shown for the file.
async function anFileDashboard(file, d){
  const at = new Date().toISOString(), range = anRangeText(d);
  const days = new Set();
  let what = '', feeds = 'break planner';
  if(d.kind === 'productivity' && d.by === 'hour'){
    Object.entries(d.tables.prod || {}).forEach(([row, cells]) => {
      if(row === 'AVERAGE') return;
      AN_WEEKDAYS.forEach(day => { if(cells[day] != null){ anSetHour(day, +row, 'prod', cells[day]); days.add(day); } });
    });
    what = 'sales per labor hour, hour by hour';
  } else if(d.kind === 'productivity'){
    const t = d.tables;
    AN_WEEKDAYS.forEach(day => {
      const dps = {};
      AN_DAYPARTS.forEach(dp => {
        const v = {prod: (t.prod[dp] || {})[day], sales: ((t.sales || {})[dp] || {})[day], labor: ((t.hours || {})[dp] || {})[day]};
        if(v.prod != null) dps[dp] = Object.fromEntries(Object.entries(v).filter(([, x]) => x != null));
      });
      if(Object.keys(dps).length < 2) return;
      const p = anProfile(day);
      p.dayparts = dps;
      if((t.prod.AVERAGE || {})[day] != null) p.dayProd = t.prod.AVERAGE[day];
      days.add(day);
    });
    what = 'sales, hours and sales per labor hour by daypart';
    feeds = 'Forecast daypart productivity goals';
  } else if(d.kind === 'laborCost'){
    Object.entries(d.tables.pct || {}).forEach(([row, cells]) => {
      if(row === 'AVERAGE') return;
      AN_WEEKDAYS.forEach(day => { if(cells[day] != null){ anSetHour(day, +row, 'laborPct', cells[day]); days.add(day); } });
    });
    what = 'labor % hour by hour';
    feeds = 'labor by hour';
  } else if(d.kind === 'salesCurve'){
    Object.entries(d.hours || {}).forEach(([min, v]) => {
      anSetHour('All', +min, 'prod', v.prod);
      anSetHour('All', +min, 'labor', v.labor);
      anSetHour('All', +min, 'salesPerDay', v.sales);
    });
    days.add('All');
    what = 'the average hour: sales, hours and sales per labor hour';
    feeds = 'break planner and Forecast for any day without its own report';
  }
  if(!days.size) throw new Error('Nothing by weekday found in this PDF.');
  days.forEach(day => {
    const p = productivityProfiles[day];
    p.file = file.name;
    p.at = at;
    p.sources = {...(p.sources || {}), [d.kind === 'productivity' ? `productivity-${d.by}` : d.kind]: {file: file.name, at, range}};
  });
  const list = [...days].sort((a, b) => (AN_WEEKDAYS.indexOf(a) + 1 || 9) - (AN_WEEKDAYS.indexOf(b) + 1 || 9));
  duRecord('productivity', {file: file.name, summary: `${list.includes('All') ? 'All days' : anDayShort(list)} · ${what}${range ? ` (${range})` : ''}`});
  await saveState();
  if(typeof breakPlanReset === 'function') breakPlanReset();
  fcRerender();
  const busiest = d.kind === 'productivity' && d.by === 'hour' ? anBusiestText(list) : '';
  return `${list.includes('All') ? 'All days' : anDayShort(list)}: ${what}${range ? ` (${range})` : ''} → ${feeds}${busiest ? ` · busiest: ${busiest}` : ''}`;
}

// "Mon 12 PM, Tue 1 PM, …": each weekday's busiest hour.
function anBusiestText(days){
  return days.map(day => {
    const hours = Object.entries((productivityProfiles[day] || {}).hours || {}).filter(([h, v]) => v.prod != null && +h >= 360 && +h <= 1260);
    if(!hours.length) return '';
    const [h] = hours.sort((a, b) => b[1].prod - a[1].prod)[0];
    return `${day.slice(0, 3)} ${anHour(+h)}`;
  }).filter(Boolean).join(', ');
}

// A 15-minute file whose total matches no day on file: the day after the
// latest 15-minute day filed in the same upload (they're downloaded a day
// at a time, in order), if it's an open day before today with no 15-minute
// sales yet.
function anQuarterSuggest(filedDays){
  const last = [...filedDays].sort().pop();
  if(!last) return null;
  let next = kaAddDays(last, 1);
  if(new Date(next + 'T12:00:00').getDay() === 0) next = kaAddDays(next, 1);
  if(next >= today) return null;
  const monday = kaMonday(next);
  const dow = KA_DOWS[(new Date(next + 'T12:00:00').getDay() + 6) % 7];
  const w = daypartWeeks['q:' + monday];
  return w && w.days && w.days[dow] ? null : next;
}
