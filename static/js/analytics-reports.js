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
const anIsDashboardPdf = name => /(Daily[_ ]?Detail|Sales[_ ]?Data)[^/]*\.pdf$/i.test(String(name || ''));

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

async function anFileQuarter(file, text){
  const q = anParseQuarter(text);
  const iso = anDateQuarter(q.total);
  if(!iso){
    const err = new Error(`Not filed yet: its day’s total (${fcMoney(q.total)}) matches no day’s sales on file. Upload that week’s Daily Detail or Sales Data with it.`);
    err.waiting = true;
    throw err;
  }
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
  return `${new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'})}: ${parts} → Know the Numbers${kaFillText(filled) ? ` (${kaFillText(filled)})` : ' (already had these actuals)'}`;
}
