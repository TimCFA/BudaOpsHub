// ===== KNOW THE NUMBERS — FILE UPLOAD =====
// Projected sales and productivity goals come from a spreadsheet (Excel or
// CSV) instead of being typed in; special events stay typed in Know the
// Numbers for now. Either layout works:
//   long — one row per day and daypart: Date | Daypart | Projected Sales | Productivity Goal
//   wide — one row per day: Date | Lunch Sales | Lunch Productivity | Dinner Sales | …
// A blank date cell repeats the one above (merged cells in Excel). Days and
// dayparts already typed in are updated; special events are never touched.

const KN_TEMPLATE_HEADERS = ['Date', 'Daypart', 'Projected Sales', 'Productivity Goal'];

// A daypart name from a cell ("Lunch", "LUNCH 11-2", "Early Bkfst") → the
// FOH daypart it means, or null.
function knDaypartFor(text){
  const t = String(text || '').toLowerCase().replace(/[^a-z0-9: ]/g, ' ');
  if(!t.trim()) return null;
  const find = re => (fohDayparts.find(dp => re.test(dp.name.toLowerCase())) || {}).name || null;
  if(/early/.test(t)) return find(/^early breakfast/);
  if(/b(rea)?kfst|breakfast/.test(t)) return find(/^breakfast/);
  if(/lunch/.test(t)) return find(/^lunch/);
  if(/transition/.test(t)) return find(/^transition/);
  if(/afternoon|mid ?day|snack/.test(t)) return find(/^afternoon/);
  if(/dinner/.test(t)) return find(/^dinner/);
  if(/clos|late ?night/.test(t)) return find(/^close/);
  return null;
}

// A date cell → 'YYYY-MM-DD' (Excel serial numbers, 9/30/2026, 2026-09-30).
function knDate(v){
  if(v === null || v === undefined || v === '') return null;
  if(v instanceof Date && !isNaN(v)) return toLocalISODate(v);
  const s = String(v).trim();
  if(/^\d{5}(\.\d+)?$/.test(s)){
    const serial = Math.floor(+s);
    if(serial > 30000 && serial < 80000) return toLocalISODate(new Date(Date.UTC(1899, 11, 30) + serial * 86400000 + new Date().getTimezoneOffset() * 60000));
  }
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if(m){
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return null;
}

function knMoney(v){
  if(v === null || v === undefined) return null;
  const cleaned = String(v).replace(/[^0-9.\-]/g, '');
  if(!cleaned || cleaned === '.' || cleaned === '-') return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// rows (arrays of cells) → {byDate: {iso: {daypart: {projectedSales, productivityGoal}}}, unknown: [...]}
function knParseRows(rows){
  const isSales = h => /proj|forecast|sales/.test(h) && !/productiv|splh|goal/.test(h);
  const isGoal = h => /productiv|splh|goal/.test(h);
  for(let hi = 0; hi < Math.min(rows.length, 12); hi++){
    const header = (rows[hi] || []).map(c => String(c || '').toLowerCase().trim());
    const dateCol = header.findIndex(h => /\bdate\b|^day$|^date/.test(h));
    if(dateCol === -1) continue;
    const dpCol = header.findIndex((h, i) => i !== dateCol && /day ?part|shift|period|meal/.test(h));
    const byDate = {}, unknown = new Set();
    let lastDate = null, count = 0;
    const put = (iso, dp, field, value)=>{
      if(value === null) return;
      ((byDate[iso] = byDate[iso] || {})[dp] = byDate[iso][dp] || {})[field] = value;
      count++;
    };
    if(dpCol !== -1){
      // Long layout.
      const salesCol = header.findIndex(isSales), goalCol = header.findIndex(isGoal);
      if(salesCol === -1 && goalCol === -1) continue;
      rows.slice(hi + 1).forEach(r=>{
        const iso = knDate(r[dateCol]) || (String(r[dateCol] || '').trim() ? null : lastDate);
        if(!iso) return;
        lastDate = iso;
        const cell = String(r[dpCol] || '').trim();
        if(!cell) return;
        const dp = knDaypartFor(cell);
        if(!dp){ unknown.add(cell); return; }
        if(salesCol !== -1) put(iso, dp, 'projectedSales', knMoney(r[salesCol]));
        if(goalCol !== -1) put(iso, dp, 'productivityGoal', knMoney(r[goalCol]));
      });
    } else {
      // Wide layout: a column per daypart and measure.
      const cols = header.map((h, i) => ({i, dp: knDaypartFor(h), field: isGoal(h) ? 'productivityGoal' : isSales(h) ? 'projectedSales' : null}))
        .filter(c => c.i !== dateCol && c.dp && c.field);
      if(!cols.length) continue;
      rows.slice(hi + 1).forEach(r=>{
        const iso = knDate(r[dateCol]);
        if(!iso) return;
        cols.forEach(c => put(iso, c.dp, c.field, knMoney(r[c.i])));
      });
    }
    if(count) return {byDate, unknown: [...unknown]};
  }
  throw new Error('Couldn’t find the columns. Use a Date column, a Daypart column, and Projected Sales / Productivity Goal columns — or download the template in Know the Numbers.');
}

function knImportFile(file){
  return new Promise((resolve, reject)=>{
    pbReadWorkbookRows(file, async (err, rows)=>{
      if(err || !rows || !rows.length) return reject(new Error('Couldn’t read that file.'));
      let parsed;
      try{ parsed = knParseRows(rows); }catch(e){ return reject(e); }
      const dates = Object.keys(parsed.byDate).sort();
      let cells = 0;
      dates.forEach(iso=>{
        const day = numbersData[iso] = numbersData[iso] || {};
        Object.entries(parsed.byDate[iso]).forEach(([dp, v])=>{
          const entry = day[dp] = day[dp] || {};
          if(v.projectedSales !== undefined){ entry.projectedSales = formatAsCurrency(v.projectedSales); cells++; }
          if(v.productivityGoal !== undefined){ entry.productivityGoal = formatAsCurrency(v.productivityGoal); cells++; }
        });
      });
      const range = dates.length ? `${duShort(dates[0])}${dates.length > 1 ? `–${duShort(dates[dates.length - 1])}` : ''}` : '';
      duRecord('numbers', {file: file.name, summary: `${range} · ${dates.length} day${dates.length === 1 ? '' : 's'}`, periodEnd: dates[dates.length - 1] || null});
      await saveState();
      if(document.getElementById('numbersContent')) renderNumbersContent();
      const skipped = parsed.unknown.length ? ` · skipped rows for “${parsed.unknown.slice(0, 3).join('”, “')}” (not a daypart)` : '';
      resolve(`${range} · ${dates.length} day${dates.length === 1 ? '' : 's'}, ${cells} numbers → Know the Numbers${skipped}`);
    });
  });
}

// A CSV with the next two weeks of FOH dayparts, ready to fill in.
function knDownloadTemplate(){
  const lines = [KN_TEMPLATE_HEADERS.join(',')];
  const start = new Date(today + 'T00:00:00');
  for(let i = 0; i < 14; i++){
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    if(d.getDay() === 0) continue;   // closed Sundays
    fohDayparts.filter(dp => !/^transition/i.test(dp.name)).forEach(dp => lines.push(`${toLocalISODate(d)},${suShortDaypart(dp.name)},,`));
  }
  const blob = new Blob([lines.join('\n') + '\n'], {type: 'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `know-the-numbers-template-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

document.addEventListener('click', e=>{
  if(e.target.closest('#knTemplate')) knDownloadTemplate();
});
document.addEventListener('change', async e=>{
  if(!e.target.matches('#knFile')) return;
  const files = e.target.files;
  if(!files || !files.length) return;
  await duHandleFiles(files, 'numbers');
  const r = duResults[duResults.length - 1];
  const status = document.getElementById('knStatus');
  if(status && r) status.textContent = `${r.state === 'ok' ? '✓' : '⚠'} ${r.text}`;
  e.target.value = '';
});
