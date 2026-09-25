// ===== CEM TRENDS =====
// Ported from a standalone React artifact Tim built (Buda CEM Scoreboard). Reimplemented as
// plain JS/DOM template rendering to match this app's pattern (no React/JSX/build step
// anywhere else here — see trainer-trial.js) and persisted through this app's real
// Firebase-backed saveState()/loadState(). This is a SEPARATE tool from the existing GX
// Manage "Import CEM Report" feature (management-views.js's CEM_FIELD_MAP/parseCemCsv),
// which only updates this month's live scoreboard tiles from a single snapshot. CEM Trends
// instead keeps a multi-period history (monthly/quarterly) and computes trend/correlation/
// significance insights across it — by design they coexist rather than merge (per Tim).
// All function/constant names use a CT_/ct prefix specifically to avoid colliding with the
// existing CEM_FIELD_MAP importer's globals of the same shape.

const CT_METRICS = [
  { key: 'overall', label: 'OSAT', short: 'OSAT' },
  { key: 'taste', label: 'Taste of Food', short: 'Taste' },
  { key: 'fastService', label: 'Fast Service', short: 'Speed' },
  { key: 'attentive', label: 'Attentive / Friendly', short: 'Attentive' },
  { key: 'cleanliness', label: 'Cleanliness', short: 'Clean' },
  { key: 'orderAccuracy', label: 'Order Accuracy', short: 'Accuracy' }
];
const CT_DAYPART_ORDER = ['Breakfast', 'Lunch', 'Afternoon', 'Early Dinner', 'Late Dinner'];
const CT_DOW_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CT_DAYPART_COLORS = { Breakfast:'#7fb0d8', Lunch:'#e0824f', Afternoon:'#8fbf8a', 'Early Dinner':'#c98fd0', 'Late Dinner':'#c8483c' };
const CT_DOW_COLORS = { Monday:'#7fb0d8', Tuesday:'#e0824f', Wednesday:'#8fbf8a', Thursday:'#c98fd0', Friday:'#e8b93f', Saturday:'#c8483c', Sunday:'#9b9fef' };
const CT_VIEW_OPTIONS = [ { value:'total', label:'Overall' }, { value:'daypart', label:'By Daypart' }, { value:'dow', label:'By Day of Week' } ];

// persisted
let cemEntries = [];

// session-only
let cemTab = 'scoreboard';
let cemSelPeriod = null;
let cemSelView = 'total';
let cemSelSegment = null;
let cemTrendMetric = 'overall';
let cemTrendView = 'total';
let cemVisibleSegments = new Set([...CT_DAYPART_ORDER, ...CT_DOW_ORDER]);
let cemFocusPeriod = null;
// Insights scope: rolling window of the latest N logged months, all months, or one month.
const CT_SCOPE_OPTIONS = [
  { value:'3', label:'Last 3 months' }, { value:'6', label:'Last 6 months' }, { value:'12', label:'Last 12 months' },
  { value:'all', label:'All logged' }, { value:'month', label:'One month' }
];
let cemInsightScope = 'all';
let cemScopeMonth = null;
let cemImportText = '';
let cemImportMsg = null;

function ctPad(n){ return String(n).padStart(2, '0'); }
function ctToISO(d){ return `${d.getFullYear()}-${ctPad(d.getMonth() + 1)}-${ctPad(d.getDate())}`; }
function ctIsLastDayOfMonth(d){ return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() === d.getDate(); }
function ctShortDate(d){ return d.toLocaleString('default', { month: 'short', day: 'numeric' }); }
function ctMonthShortLabel(periodKey){
  const [y, m] = periodKey.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return `${d.toLocaleString('default', { month: 'short' })} '${y.slice(2)}`;
}

function ctDescribePeriod(startStr, endStr){
  const start = new Date(startStr);
  const end = new Date(endStr);
  const startISO = ctToISO(start);
  const endISO = ctToISO(end);
  const isSingleMonth = start.getDate() === 1 && start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();

  if(isSingleMonth){
    const periodKey = `${start.getFullYear()}-${ctPad(start.getMonth() + 1)}`;
    const monthName = start.toLocaleString('default', { month: 'long', year: 'numeric' });
    const partial = !ctIsLastDayOfMonth(end);
    const periodLabel = partial ? `${monthName} (through ${ctShortDate(end)})` : monthName;
    return { periodKey, periodLabel, periodStart: startISO, periodEnd: endISO, periodType: 'month', partial };
  }

  const q = Math.floor(start.getMonth() / 3);
  const qStart = new Date(start.getFullYear(), q * 3, 1);
  const qEnd = new Date(start.getFullYear(), q * 3 + 3, 0);
  const isQuarter = ctToISO(qStart) === startISO && ctToISO(qEnd) === endISO;
  const periodKey = `${startISO}_${endISO}`;
  let periodLabel;
  if(isQuarter) periodLabel = `Q${q + 1} ${start.getFullYear()} (${ctShortDate(start)}–${ctShortDate(end)})`;
  else if(start.getFullYear() === end.getFullYear()) periodLabel = `${ctShortDate(start)}–${ctShortDate(end)}, ${end.getFullYear()}`;
  else periodLabel = `${ctShortDate(start)} ${start.getFullYear()}–${ctShortDate(end)} ${end.getFullYear()}`;
  return { periodKey, periodLabel, periodStart: startISO, periodEnd: endISO, periodType: 'range', partial: false };
}

function ctNormalizeMetricKey(rawName){
  const name = (rawName || '').toLowerCase().trim();
  if(name === 'overall satisfaction') return 'overall';
  if(name === 'taste of food') return 'taste';
  if(name === 'fast service') return 'fastService';
  if(name === 'attentive/friendly') return 'attentive';
  if(name === 'cleanliness') return 'cleanliness';
  if(name.startsWith('order accuracy')) return 'orderAccuracy';
  return null;
}
function ctCleanSegmentLabel(raw){
  if(!raw || !raw.toString().trim()) return '';
  return raw.toString().replace(/\s*\(.*\)\s*$/, '').trim();
}

function ctParseCsv(text){
  const cleaned = text.replace(/^﻿/, '').trim();
  return ctParseRows(parseCsv(cleaned));
}

function ctParseRows(rows){
  let period = null;
  for(const row of rows){
    if(row[0] && row[0].toString().startsWith('Comparison:')){
      const match = row[0].match(/Comparison:\s*([\d/]+)\s*-\s*([\d/]+)/);
      if(match){
        const start = new Date(match[1]);
        const end = new Date(match[2]);
        if(!isNaN(start.getTime()) && !isNaN(end.getTime())) period = ctDescribePeriod(match[1], match[2]);
      }
      break;
    }
  }
  if(!period) throw new Error("Couldn't find a 'Comparison: <date> - <date>' line to identify the period. Is this a CEM comparison report export?");

  const isBlank = (row) => !row || row.every((c) => !c || !c.toString().trim());
  const headerIdxs = [];
  rows.forEach((row, i) => { if(row[0] && row[0].toString().trim() === 'Store') headerIdxs.push(i); });
  if(headerIdxs.length === 0) throw new Error("Couldn't find a 'Store' header row — is this a CEM comparison report export?");

  const buckets = new Map();
  const getBucket = (dimension, segment) => {
    const fullKey = `${dimension}::${segment}`;
    if(!buckets.has(fullKey)) buckets.set(fullKey, { dimension, segment, n: null, scores: {}, benchmark: {} });
    return buckets.get(fullKey);
  };

  headerIdxs.forEach((hIdx, blockIdx) => {
    const headerRow = rows[hIdx];
    const dimHeader = (headerRow[2] || '').toString().trim();
    const hasSegmentCol = dimHeader === 'Time of Day Extended' || dimHeader === 'Day of Visit';
    const fileDim = dimHeader === 'Time of Day Extended' ? 'daypart' : dimHeader === 'Day of Visit' ? 'dow' : null;
    const scoreCol = hasSegmentCol ? 3 : 2;
    const countCol = hasSegmentCol ? 4 : 3;
    const blockEnd = blockIdx + 1 < headerIdxs.length ? headerIdxs[blockIdx + 1] : rows.length;

    for(let r = hIdx + 1; r < blockEnd; r++){
      const row = rows[r];
      if(isBlank(row)) continue;
      const storeLabel = (row[0] || '').toString().trim();
      if(!storeLabel) continue;
      const isBenchmark = storeLabel.toLowerCase().startsWith('top 5%');
      const measureName = (row[1] || '').toString().trim();
      const metricKey = ctNormalizeMetricKey(measureName);
      if(!metricKey) continue;
      const rawSegment = hasSegmentCol ? ctCleanSegmentLabel(row[2]) : '';
      const dimension = rawSegment ? fileDim : 'total';
      const segment = rawSegment || 'Overall';
      const bucket = getBucket(dimension, segment);

      const scoreRaw = row[scoreCol];
      if(scoreRaw === undefined || scoreRaw === null || scoreRaw.toString().trim() === '') continue;
      const scoreText = scoreRaw.toString();
      let val = parseFloat(scoreText.replace('%', ''));
      if(isNaN(val)) continue;
      if(val <= 1 && !scoreText.includes('%')) val *= 100;
      val = Math.min(100, Math.max(0, Math.round(val * 100) / 100));

      if(isBenchmark){
        bucket.benchmark[metricKey] = val;
      } else {
        bucket.scores[metricKey] = val;
        const n = parseInt(row[countCol], 10);
        if(!isNaN(n)) bucket.n = n;
      }
    }
  });

  if(buckets.size === 0) throw new Error("Found a 'Store' header row but no recognizable metric rows underneath it.");

  const entries = Array.from(buckets.values()).map((b) => ({
    key: `${period.periodKey}::${b.dimension}::${b.segment}`,
    periodKey: period.periodKey, periodLabel: period.periodLabel, periodStart: period.periodStart,
    periodEnd: period.periodEnd, periodType: period.periodType, dimension: b.dimension, segment: b.segment,
    n: b.n, scores: b.scores, benchmark: b.benchmark
  }));
  return { period, entries };
}

function ctParseWorkbook(arrayBuffer){
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  const collected = [];
  let lastPeriod = null, anySuccess = false;
  const sheetErrors = [];
  wb.SheetNames.forEach((name) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    try{
      const { period, entries } = ctParseRows(rows);
      collected.push(...entries);
      lastPeriod = period;
      anySuccess = true;
    }catch(err){ sheetErrors.push(`${name}: ${err.message}`); }
  });
  if(!anySuccess) throw new Error(sheetErrors.length ? `No CEM data found (${sheetErrors.join(' | ')}).` : 'No CEM data found in this workbook.');
  return { period: lastPeriod, entries: ctMergeEntries([], collected) };
}

function ctMergeEntries(existing, incoming){
  const map = new Map(existing.map((e) => [e.key, e]));
  incoming.forEach((e) => {
    const prev = map.get(e.key);
    if(prev){
      const benchmark = { ...prev.benchmark, ...e.benchmark };
      const scores = { ...prev.scores, ...e.scores };
      const n = e.n != null ? e.n : prev.n;
      map.set(e.key, { ...e, scores, benchmark, n });
    } else {
      map.set(e.key, e);
    }
  });
  return Array.from(map.values());
}

function ctSortWithOrder(order){
  return (a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  };
}

// ---------- stats ----------

function ctErf(x){
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t) * Math.exp(-x*x);
  return sign * y;
}
function ctNormalCdf(z){ return 0.5 * (1 + ctErf(z / Math.SQRT2)); }
function ctTwoPropZTest(x1, n1, x2, n2){
  if(!n1 || !n2 || n1 <= 0 || n2 <= 0) return null;
  const p1 = x1/n1, p2 = x2/n2;
  const pooled = (x1+x2)/(n1+n2);
  const se = Math.sqrt(pooled * (1-pooled) * (1/n1 + 1/n2));
  if(se === 0) return { z:0, p:1, p1, p2 };
  const z = (p1-p2)/se;
  const p = 2 * (1 - ctNormalCdf(Math.abs(z)));
  return { z, p, p1, p2 };
}
function ctPearsonCorr(xs, ys){
  const n = xs.length;
  if(n < 3) return null;
  const meanX = xs.reduce((a,b)=>a+b,0)/n, meanY = ys.reduce((a,b)=>a+b,0)/n;
  let num=0, denX=0, denY=0;
  for(let i=0;i<n;i++){ const dx=xs[i]-meanX, dy=ys[i]-meanY; num+=dx*dy; denX+=dx*dx; denY+=dy*dy; }
  if(denX===0 || denY===0) return null;
  return num / Math.sqrt(denX*denY);
}
function ctOrdinal(n){
  const v = n % 100;
  if(v >= 11 && v <= 13) return n + 'th';
  switch(n % 10){ case 1: return n+'st'; case 2: return n+'nd'; case 3: return n+'rd'; default: return n+'th'; }
}

// ---------- derived data (recomputed per render — dataset is small) ----------

function ctPeriods(){
  const map = new Map();
  cemEntries.forEach((e) => {
    if(!map.has(e.periodKey)) map.set(e.periodKey, { periodKey:e.periodKey, periodLabel:e.periodLabel, periodStart:e.periodStart, periodEnd:e.periodEnd, periodType:e.periodType });
  });
  return Array.from(map.values()).sort((a,b) => a.periodStart !== b.periodStart ? a.periodStart.localeCompare(b.periodStart) : a.periodEnd.localeCompare(b.periodEnd));
}
function ctMonthPeriods(){ return ctPeriods().filter((p) => p.periodType === 'month'); }

// Months the Insights tab is currently looking at (see CT_SCOPE_OPTIONS).
function ctScopedMonths(){
  const months = ctMonthPeriods();
  if(cemInsightScope === 'month'){
    const m = months.find((p) => p.periodKey === cemScopeMonth) || months[months.length-1];
    return m ? [m] : [];
  }
  if(cemInsightScope === 'all') return months;
  return months.slice(-parseInt(cemInsightScope, 10));
}
function ctScopeDescription(scoped){
  if(scoped.length === 0) return 'no months';
  if(cemInsightScope === 'month') return `${scoped[0].periodLabel} only`;
  const span = scoped.length === 1 ? scoped[0].periodLabel : `${scoped[0].periodLabel} – ${scoped[scoped.length-1].periodLabel}`;
  const wanted = parseInt(cemInsightScope, 10);
  const short = !isNaN(wanted) && scoped.length < wanted ? ` (only ${scoped.length} logged so far)` : '';
  return `${span} · ${scoped.length} logged month${scoped.length!==1?'s':''}${short}`;
}

function ctEntriesForPeriod(periodKey){ return cemEntries.filter((e) => e.periodKey === periodKey); }
function ctTotalEntry(periodKey){ return ctEntriesForPeriod(periodKey).find((e) => e.dimension === 'total'); }

function ctSegmentsForView(periodKey, view){
  if(view === 'total') return [];
  const order = view === 'daypart' ? CT_DAYPART_ORDER : CT_DOW_ORDER;
  const present = ctEntriesForPeriod(periodKey).filter((e) => e.dimension === view).map((e) => e.segment);
  return order.filter((s) => present.includes(s));
}

function ctActiveEntry(){
  if(cemSelView === 'total') return ctTotalEntry(cemSelPeriod);
  return ctEntriesForPeriod(cemSelPeriod).find((e) => e.dimension === cemSelView && e.segment === cemSelSegment);
}

function ctTrendData(){
  const order = cemTrendView === 'daypart' ? CT_DAYPART_ORDER : cemTrendView === 'dow' ? CT_DOW_ORDER : [];
  return ctMonthPeriods().map((p) => {
    const point = { periodKey: p.periodKey, periodLabel: p.periodLabel };
    const periodEntries = ctEntriesForPeriod(p.periodKey);
    if(cemTrendView === 'total'){
      const t = periodEntries.find((e) => e.dimension === 'total');
      if(t && t.scores[cemTrendMetric] != null) point['Overall'] = t.scores[cemTrendMetric];
      if(t && t.benchmark[cemTrendMetric] != null) point['Top 5%'] = t.benchmark[cemTrendMetric];
    } else {
      order.forEach((seg) => {
        const e = periodEntries.find((en) => en.dimension === cemTrendView && en.segment === seg);
        if(e && e.scores[cemTrendMetric] != null) point[seg] = e.scores[cemTrendMetric];
      });
      const t = periodEntries.find((e) => e.dimension === 'total');
      if(t && t.benchmark[cemTrendMetric] != null) point['Top 5%'] = t.benchmark[cemTrendMetric];
    }
    return point;
  });
}
function ctTrendSeriesKeys(){
  if(cemTrendView === 'total') return ['Overall'];
  const order = cemTrendView === 'daypart' ? CT_DAYPART_ORDER : CT_DOW_ORDER;
  return order.filter((s) => cemVisibleSegments.has(s));
}
function ctColorFor(key){
  if(key === 'Overall') return '#e8b93f';
  return (cemTrendView === 'daypart' ? CT_DAYPART_COLORS : CT_DOW_COLORS)[key] || '#999';
}

function ctAllEntriesSorted(){
  return [...cemEntries].sort((a,b) => {
    if(a.periodStart !== b.periodStart) return b.periodStart.localeCompare(a.periodStart);
    if(a.dimension !== b.dimension) return a.dimension.localeCompare(b.dimension);
    const order = a.dimension === 'daypart' ? CT_DAYPART_ORDER : a.dimension === 'dow' ? CT_DOW_ORDER : [];
    return ctSortWithOrder(order)(a.segment, b.segment);
  });
}

function ctMonthlyTotalSeries(months){
  months = months || ctMonthPeriods();
  const out = {};
  CT_METRICS.forEach((m) => {
    out[m.key] = months.map((p) => {
      const t = cemEntries.find((e) => e.periodKey === p.periodKey && e.dimension === 'total' && e.segment === 'Overall');
      return t && t.scores[m.key] != null ? { periodKey:p.periodKey, periodLabel:p.periodLabel, value:t.scores[m.key] } : null;
    }).filter(Boolean);
  });
  return out;
}

// Per-metric movement within the insight scope. Rolling windows: first → last
// month in the window. One month: vs the previous logged month and vs the same
// month a year earlier (when logged).
function ctMetricTrends(){
  const scoped = ctScopedMonths();
  const full = ctMonthlyTotalSeries();
  const round = (v) => Math.round(v*10)/10;
  return CT_METRICS.map((m) => {
    const all = full[m.key];
    if(cemInsightScope === 'month'){
      const focus = scoped[0];
      const idx = focus ? all.findIndex((x) => x.periodKey === focus.periodKey) : -1;
      if(idx < 0) return { metricKey:m.key, metricLabel:m.label, series:[], insufficient:true };
      const cur = all[idx];
      const rows = [];
      if(idx > 0) rows.push({ delta: round(cur.value - all[idx-1].value), text: `vs ${all[idx-1].periodLabel}` });
      const [y, mo] = focus.periodKey.split('-');
      const lastYearKey = `${parseInt(y,10)-1}-${mo}`;
      const ly = all.find((x) => x.periodKey === lastYearKey);
      if(ly) rows.push({ delta: round(cur.value - ly.value), text: `vs same month last year (${ly.periodLabel})` });
      if(rows.length === 0) return { metricKey:m.key, metricLabel:m.label, series:all.slice(Math.max(0, idx-5), idx+1), insufficient:true };
      return { metricKey:m.key, metricLabel:m.label, series: all.slice(Math.max(0, idx-5), idx+1), rows };
    }
    const keys = new Set(scoped.map((p) => p.periodKey));
    const s = all.filter((x) => keys.has(x.periodKey));
    if(s.length < 2) return { metricKey:m.key, metricLabel:m.label, series:s, insufficient:true };
    const first = s[0], last = s[s.length-1];
    return { metricKey:m.key, metricLabel:m.label, series:s,
      rows: [{ delta: round(last.value - first.value), text: `over ${s.length} logged months (${s.map((x) => x.periodLabel).join(' → ')})` }] };
  });
}

function ctMonthComparison(){
  if(!cemFocusPeriod) return [];
  const series = ctMonthlyTotalSeries();
  return CT_METRICS.map((m) => {
    const s = series[m.key];
    const focus = s.find((x) => x.periodKey === cemFocusPeriod);
    if(!focus || s.length < 2) return null;
    const sorted = [...s].sort((a,b) => b.value-a.value);
    const rank = sorted.findIndex((x) => x.periodKey === cemFocusPeriod) + 1;
    const avg = s.reduce((sum,x) => sum+x.value, 0) / s.length;
    return { metricKey:m.key, metricLabel:m.label, value:focus.value, rank, count:s.length, vsAvg: Math.round((focus.value-avg)*10)/10, isHigh: rank===1, isLow: rank===s.length };
  }).filter(Boolean);
}

function ctNotableExtremes(){
  if(!cemFocusPeriod) return [];
  const months = ctMonthPeriods();
  const combos = [ { dimension:'total', segments:['Overall'] }, { dimension:'daypart', segments:CT_DAYPART_ORDER }, { dimension:'dow', segments:CT_DOW_ORDER } ];
  const out = [];
  combos.forEach(({ dimension, segments }) => {
    segments.forEach((segment) => {
      CT_METRICS.forEach((m) => {
        const series = months.map((p) => {
          const e = cemEntries.find((en) => en.periodKey === p.periodKey && en.dimension === dimension && en.segment === segment);
          return e && e.scores[m.key] != null ? { periodKey:p.periodKey, periodLabel:p.periodLabel, value:e.scores[m.key] } : null;
        }).filter(Boolean);
        if(series.length < 3) return;
        const focus = series.find((s) => s.periodKey === cemFocusPeriod);
        if(!focus) return;
        const max = series.reduce((a,b) => b.value>a.value?b:a);
        const min = series.reduce((a,b) => b.value<a.value?b:a);
        const isUniqueMax = focus.value === max.value && series.filter((s)=>s.value===max.value).length === 1;
        const isUniqueMin = focus.value === min.value && series.filter((s)=>s.value===min.value).length === 1;
        if(!isUniqueMax && !isUniqueMin) return;
        const rest = series.filter((s) => s.periodKey !== cemFocusPeriod);
        const prev = isUniqueMax ? rest.reduce((a,b)=>b.value>a.value?b:a) : rest.reduce((a,b)=>b.value<a.value?b:a);
        out.push({ kind: isUniqueMax?'high':'low', dimension, segment, metricKey:m.key, metricLabel:m.label, value:focus.value, count:series.length, prevValue:prev.value, prevLabel:prev.periodLabel, gap: Math.round((focus.value-prev.value)*10)/10 });
      });
    });
  });
  return out.sort((a,b) => Math.abs(b.gap)-Math.abs(a.gap)).slice(0, 12);
}

function ctPersistentPatterns(){
  const monthKeys = ctScopedMonths().map((p) => p.periodKey);
  const results = [];
  [ { dimension:'daypart', order:CT_DAYPART_ORDER }, { dimension:'dow', order:CT_DOW_ORDER } ].forEach(({ dimension, order }) => {
    order.forEach((segment) => {
      CT_METRICS.forEach((m) => {
        let xSeg=0, nSeg=0, xRest=0, nRest=0, periodsUsed=0;
        monthKeys.forEach((pk) => {
          const total = cemEntries.find((e) => e.periodKey===pk && e.dimension==='total' && e.segment==='Overall');
          const seg = cemEntries.find((e) => e.periodKey===pk && e.dimension===dimension && e.segment===segment);
          if(!total || !seg) return;
          const nT=total.n, pT=total.scores[m.key], nS=seg.n, pS=seg.scores[m.key];
          if(nT==null || pT==null || nS==null || pS==null) return;
          const nR = nT - nS;
          if(nR <= 0) return;
          const xT=(pT/100)*nT, xS=(pS/100)*nS;
          xSeg+=xS; nSeg+=nS; xRest+=xT-xS; nRest+=nR; periodsUsed+=1;
        });
        if(periodsUsed===0 || nSeg===0 || nRest===0) return;
        const test = ctTwoPropZTest(xSeg, nSeg, xRest, nRest);
        if(!test || test.p >= 0.05) return;
        const clampPct = (p) => Math.min(100, Math.max(0, Math.round(p*1000)/10));
        const segPct = clampPct(test.p1), restPct = clampPct(test.p2);
        results.push({ dimension, segment, metricKey:m.key, metricLabel:m.label, segPct, restPct, gap: Math.round((segPct-restPct)*10)/10, pValue:test.p, nSeg, nRest, periodsUsed, direction: test.p1>test.p2 ? 'up':'down' });
      });
    });
  });
  return results.sort((a,b) => a.pValue-b.pValue).slice(0, 10);
}

function ctDriverCorrelations(){
  const monthKeys = new Set(ctScopedMonths().map((p) => p.periodKey));
  const rows = cemEntries.filter((e) => monthKeys.has(e.periodKey) && (e.dimension==='daypart' || e.dimension==='dow'));
  const others = CT_METRICS.filter((m) => m.key !== 'overall');
  const out = [];
  others.forEach((m) => {
    const xs=[], ys=[];
    rows.forEach((r) => { if(r.scores.overall!=null && r.scores[m.key]!=null){ xs.push(r.scores[m.key]); ys.push(r.scores.overall); } });
    const r = ctPearsonCorr(xs, ys);
    if(r != null) out.push({ metricKey:m.key, metricLabel:m.label, r, n:xs.length });
  });
  return out.sort((a,b) => b.r-a.r);
}

function ctStateOfTheUnion(){
  const months = ctMonthPeriods();
  if(!cemFocusPeriod || months.length === 0) return null;
  const focusIdx = months.findIndex((p) => p.periodKey === cemFocusPeriod);
  const focusLabel = focusIdx >= 0 ? months[focusIdx].periodLabel : '';
  const prevPeriod = focusIdx > 0 ? months[focusIdx-1] : null;
  const prevTotal = prevPeriod ? cemEntries.find((e) => e.periodKey===prevPeriod.periodKey && e.dimension==='total' && e.segment==='Overall') : null;
  const focusTotal = cemEntries.find((e) => e.periodKey===cemFocusPeriod && e.dimension==='total' && e.segment==='Overall');
  const monthComparison = ctMonthComparison();
  const persistentPatterns = ctPersistentPatterns();
  const driverCorrelations = ctDriverCorrelations();
  const notableExtremes = ctNotableExtremes();

  const osatComparison = monthComparison.find((c) => c.metricKey === 'overall') || null;
  const benchGap = osatComparison && focusTotal && focusTotal.benchmark.overall != null ? Math.round((osatComparison.value - focusTotal.benchmark.overall)*10)/10 : null;

  const metricLines = CT_METRICS.map((m) => {
    const cmp = monthComparison.find((c) => c.metricKey === m.key);
    if(!cmp) return { metricKey:m.key, metricLabel:m.label, insufficient:true };
    const prevValue = prevTotal ? prevTotal.scores[m.key] : null;
    const momDelta = prevValue != null ? Math.round((cmp.value-prevValue)*10)/10 : null;
    return { metricKey:m.key, metricLabel:m.label, value:cmp.value, momDelta, prevLabel: prevPeriod ? prevPeriod.periodLabel : null, rank:cmp.rank, count:cmp.count, isHigh:cmp.isHigh, isLow:cmp.isLow };
  });

  const worstPattern = persistentPatterns.filter((p) => p.direction==='down').sort((a,b) => a.pValue-b.pValue)[0] || null;
  const bestPattern = persistentPatterns.filter((p) => p.direction==='up').sort((a,b) => a.pValue-b.pValue)[0] || null;
  const topDriver = driverCorrelations[0] || null;

  return { focusLabel, osatComparison, benchGap, metricLines, worstPattern, bestPattern, topDriver, extremes: notableExtremes };
}

// ---------- SVG charts ----------

function ctTrendChartSvg(){
  const data = ctTrendData();
  const seriesKeys = ctTrendSeriesKeys();
  const width = 760, height = 320, marginLeft = 40, marginRight = 14, marginTop = 14, marginBottom = 30;
  const plotW = width - marginLeft - marginRight, plotH = height - marginTop - marginBottom;
  const n = data.length;
  const xFor = (i) => marginLeft + (n <= 1 ? plotW/2 : (i/(n-1))*plotW);
  const yFor = (v) => marginTop + (1 - (Math.min(100, Math.max(50, v)) - 50) / 50) * plotH;
  const buildPath = (key) => {
    const pts = [];
    data.forEach((d,i) => { if(d[key] != null) pts.push([xFor(i), yFor(d[key])]); });
    return { pts, path: pts.map((p,i) => (i===0?'M':'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') };
  };
  const seriesPaths = seriesKeys.map((key) => ({ key, ...buildPath(key) }));
  const bench = buildPath('Top 5%');
  const gridValues = [50,60,70,80,90,100];

  let svg = `<svg viewBox="0 0 ${width} ${height}" class="ct-chart-svg">`;
  gridValues.forEach((v) => {
    svg += `<line x1="${marginLeft}" x2="${width-marginRight}" y1="${yFor(v)}" y2="${yFor(v)}" class="ct-chart-grid"></line>`;
    svg += `<text x="${marginLeft-8}" y="${yFor(v)+4}" class="ct-chart-axis-label" text-anchor="end">${v}%</text>`;
  });
  data.forEach((d,i) => { svg += `<text x="${xFor(i)}" y="${height-marginBottom+18}" class="ct-chart-axis-label" text-anchor="middle">${escapeHtml(ctMonthShortLabel(d.periodKey))}</text>`; });
  if(bench.path) svg += `<path d="${bench.path}" class="ct-chart-line-bench" fill="none"></path>`;
  seriesPaths.forEach(({ key, path, pts }) => {
    if(path) svg += `<path d="${path}" fill="none" stroke="${ctColorFor(key)}" stroke-width="2.5"></path>`;
    pts.forEach((p, i) => {
      const d = data[i];
      const tip = `${d.periodLabel}: ${key} ${d[key]}%${d['Top 5%']!=null ? ' · Top 5%: ' + d['Top 5%'] + '%' : ''}`;
      svg += `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${ctColorFor(key)}"><title>${escapeHtml(tip)}</title></circle>`;
    });
  });
  svg += '</svg>';
  return svg;
}

function ctSparklineSvg(series, color){
  const width=110, height=28, pad=4;
  const values = series.map((s) => s.value);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const xFor = (i) => pad + (series.length<=1 ? 0 : (i/(series.length-1))*(width-pad*2));
  const yFor = (v) => pad + (1 - (v-min)/range) * (height-pad*2);
  const path = series.map((s,i) => (i===0?'M':'L') + xFor(i).toFixed(1) + ',' + yFor(s.value).toFixed(1)).join(' ');
  const last = series[series.length-1];
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="ct-sparkline"><path d="${path}" fill="none" stroke="${color}" stroke-width="1.75"></path><circle cx="${xFor(series.length-1)}" cy="${yFor(last.value)}" r="2.5" fill="${color}"></circle></svg>`;
}

// ---------- rendering ----------

function ctDeltaHtml(value, benchmark){
  if(value == null || benchmark == null) return `<span class="ct-delta ct-flat">no benchmark</span>`;
  const diff = Math.round((value - benchmark) * 10) / 10;
  if(diff === 0) return `<span class="ct-delta ct-flat">even with Top 5%</span>`;
  if(diff > 0) return `<span class="ct-delta ct-up">▲ +${diff} vs Top 5%</span>`;
  return `<span class="ct-delta ct-down">▼ ${diff} vs Top 5%</span>`;
}

function ctRenderScoreboardTab(){
  const periods = ctPeriods();
  if(periods.length === 0) return `<div class="ct-empty">No data yet. Head to "Log Data" to import a CEM comparison report.</div>`;
  if(!cemSelPeriod || !periods.find((p) => p.periodKey === cemSelPeriod)) cemSelPeriod = periods[periods.length-1].periodKey;
  const segmentsForView = ctSegmentsForView(cemSelPeriod, cemSelView);
  if(cemSelView !== 'total' && segmentsForView.length > 0 && !segmentsForView.includes(cemSelSegment)) cemSelSegment = segmentsForView[0];
  const activeEntry = ctActiveEntry();
  const totalEntry = ctTotalEntry(cemSelPeriod);

  let html = `
    <div class="ct-controls">
      <label class="ct-select"><span>Period</span><select data-ct-sel-period>${periods.map((p) => `<option value="${p.periodKey}" ${p.periodKey===cemSelPeriod?'selected':''}>${escapeHtml(p.periodLabel)}</option>`).join('')}</select></label>
      <label class="ct-select"><span>View</span><select data-ct-sel-view>${CT_VIEW_OPTIONS.map((o) => `<option value="${o.value}" ${o.value===cemSelView?'selected':''}>${o.label}</option>`).join('')}</select></label>
      ${cemSelView !== 'total' && segmentsForView.length > 0 ? `<label class="ct-select"><span>${cemSelView==='daypart'?'Daypart':'Day'}</span><select data-ct-sel-segment>${segmentsForView.map((s) => `<option value="${escapeHtml(s)}" ${s===cemSelSegment?'selected':''}>${escapeHtml(s)}</option>`).join('')}</select></label>` : ''}
      ${activeEntry ? `<div class="ct-sample-size"><span>${activeEntry.n ?? '—'}</span> responses</div>` : ''}
    </div>
  `;
  if(cemSelView !== 'total' && segmentsForView.length === 0){
    html += `<div class="ct-empty">No ${cemSelView === 'daypart' ? 'daypart' : 'day-of-week'} breakdown imported for this period yet.</div>`;
  } else if(activeEntry){
    html += `<div class="ct-tile-grid">${CT_METRICS.map((m) => {
      const val = activeEntry.scores[m.key];
      const bench = totalEntry ? totalEntry.benchmark[m.key] : null;
      return `
        <div class="ct-tile">
          <div class="ct-tile-label">${m.label}</div>
          <div class="ct-tile-score">${val != null ? val + '%' : '—'}</div>
          ${ctDeltaHtml(val, bench)}
        </div>
      `;
    }).join('')}</div>`;
  }
  return html;
}

function ctRenderTrendsTab(){
  const months = ctMonthPeriods();
  let html = `
    <div class="ct-controls ct-controls-wrap">
      <div class="ct-metric-toggle">${CT_METRICS.map((m) => `<button class="ct-chip ${cemTrendMetric===m.key?'active':''}" data-ct-set-trend-metric="${m.key}">${m.short}</button>`).join('')}</div>
      <label class="ct-select"><span>Break down by</span><select data-ct-sel-trend-view>${CT_VIEW_OPTIONS.map((o) => `<option value="${o.value}" ${o.value===cemTrendView?'selected':''}>${o.label}</option>`).join('')}</select></label>
    </div>
  `;
  if(cemTrendView !== 'total'){
    const order = cemTrendView === 'daypart' ? CT_DAYPART_ORDER : CT_DOW_ORDER;
    const colors = cemTrendView === 'daypart' ? CT_DAYPART_COLORS : CT_DOW_COLORS;
    html += `<div class="ct-legend">${order.map((seg) => `<button class="ct-legend-item ${cemVisibleSegments.has(seg)?'':'off'}" data-ct-toggle-segment="${escapeHtml(seg)}"><span class="ct-legend-dot" style="background:${colors[seg]};"></span>${escapeHtml(seg)}</button>`).join('')}</div>`;
  }
  if(months.length < 1){
    html += `<div class="ct-empty">Import at least one monthly report to see trends. (Multi-month rollups like a quarter aren't plotted here — check them in the Scoreboard tab instead.)</div>`;
  } else {
    html += `<div class="ct-chart-wrap">${ctTrendChartSvg()}</div>`;
  }
  return html;
}

function ctRenderInsightsTab(){
  const months = ctMonthPeriods();
  if(months.length === 0) return `<div class="ct-empty">Import at least one month of data to generate insights.</div>`;
  if(!cemScopeMonth || !months.find((p) => p.periodKey === cemScopeMonth)) cemScopeMonth = months[months.length-1].periodKey;
  const scoped = ctScopedMonths();
  // The headline month is the latest month in scope (or the one picked).
  cemFocusPeriod = scoped[scoped.length-1].periodKey;
  const scopeDesc = ctScopeDescription(scoped);
  const focusLabel = scoped[scoped.length-1].periodLabel;

  const sotu = ctStateOfTheUnion();
  const metricTrends = ctMetricTrends();
  const monthComparison = ctMonthComparison();
  const notableExtremes = ctNotableExtremes();
  const driverCorrelations = ctDriverCorrelations();
  const persistentPatterns = ctPersistentPatterns();

  let html = `
    <div class="ct-scope-bar">
      <span class="ct-scope-label">Insights for</span>
      <div class="ct-metric-toggle">${CT_SCOPE_OPTIONS.map((o) => `<button class="ct-chip ${cemInsightScope===o.value?'active':''}" data-ct-set-scope="${o.value}">${o.label}</button>`).join('')}</div>
      ${cemInsightScope === 'month' ? `<label class="ct-select ct-scope-month"><select data-ct-scope-month>${[...months].reverse().map((p) => `<option value="${p.periodKey}" ${p.periodKey===cemScopeMonth?'selected':''}>${escapeHtml(p.periodLabel)}</option>`).join('')}</select></label>` : ''}
    </div>
    <p class="ct-scope-desc">Using <b>${escapeHtml(scopeDesc)}</b> for trends, patterns and drivers. Rankings and records still compare against every logged month.</p>
  `;

  if(sotu){
    html += `
      <div class="ct-insight-block ct-sotu">
        <h3>State of the Union — ${escapeHtml(sotu.focusLabel)}</h3>
        ${cemInsightScope !== 'month' ? `<p class="ct-hint" style="margin-top:-4px;">Latest month in ${escapeHtml(scopeDesc)}. Concerns, strengths and drivers below are pooled across that range.</p>` : ''}
        <p class="ct-sotu-headline">
          OSAT is ${sotu.osatComparison ? sotu.osatComparison.value + '%' : '—'}
          ${sotu.osatComparison ? ` (${ctOrdinal(sotu.osatComparison.rank)} of ${sotu.osatComparison.count} logged months)` : ''}
          ${sotu.benchGap != null ? `, ${sotu.benchGap > 0 ? '+' : ''}${sotu.benchGap} pts vs the Top 5% benchmark` : ''}
          ${sotu.osatComparison && sotu.osatComparison.isLow ? ' — the worst logged month on record.' : ''}
          ${sotu.osatComparison && sotu.osatComparison.isHigh ? ' — the best logged month on record.' : ''}
          ${!sotu.osatComparison ? 'Import a second month to unlock ranking.' : ''}
        </p>
        <div class="ct-sotu-metric-list">
          ${sotu.metricLines.map((l) => `
            <div class="ct-sotu-metric-row">
              <span class="ct-sotu-label">${l.metricLabel}</span>
              <span class="ct-sotu-value">${l.insufficient ? '—' : l.value + '%'}</span>
              <span class="ct-sotu-delta">${l.insufficient ? 'not enough logged months' : (l.momDelta == null ? 'no prior logged month' : `${l.momDelta > 0 ? '+' : ''}${l.momDelta} vs ${l.prevLabel}`)}</span>
              <span class="ct-sotu-rank">${l.insufficient ? '' : (l.isHigh ? 'Year high' : l.isLow ? 'Year low' : `${ctOrdinal(l.rank)} of ${l.count}`)}</span>
            </div>
          `).join('')}
        </div>
        <ul class="ct-sotu-callouts">
          <li><strong>Biggest concern:</strong> ${sotu.worstPattern ? `${escapeHtml(sotu.worstPattern.segment)} ${sotu.worstPattern.metricLabel} runs ${Math.abs(sotu.worstPattern.gap)} pts below everywhere else, pooled across ${sotu.worstPattern.periodsUsed} month${sotu.worstPattern.periodsUsed!==1?'s':''} (p=${sotu.worstPattern.pValue.toFixed(3)}).` : 'Nothing clears statistical significance yet.'}</li>
          <li><strong>Biggest strength:</strong> ${sotu.bestPattern ? `${escapeHtml(sotu.bestPattern.segment)} ${sotu.bestPattern.metricLabel} runs +${Math.abs(sotu.bestPattern.gap)} pts above everywhere else, pooled across ${sotu.bestPattern.periodsUsed} month${sotu.bestPattern.periodsUsed!==1?'s':''} (p=${sotu.bestPattern.pValue.toFixed(3)}).` : 'Nothing clears statistical significance yet.'}</li>
          <li><strong>Biggest driver of OSAT:</strong> ${sotu.topDriver ? `${sotu.topDriver.metricLabel} (r=${sotu.topDriver.r.toFixed(2)}).` : 'Not enough data yet.'}</li>
          <li><strong>New this month:</strong> ${sotu.extremes.length === 0 ? 'No new highs or lows.' : sotu.extremes.slice(0,3).map((e) => `${e.dimension==='total'?'Store-wide':escapeHtml(e.segment)} ${e.metricLabel} ${e.kind==='high'?'high':'low'} (${e.value}%)`).join('; ') + (sotu.extremes.length > 3 ? `; +${sotu.extremes.length-3} more below.` : '.')}</li>
        </ul>
      </div>
    `;
  }

  const trendHint = cemInsightScope === 'month'
    ? `How ${escapeHtml(focusLabel)} compares with the month before it and with the same month last year, using logged monthly totals.`
    : `How each metric moved across ${escapeHtml(scopeDesc)}, using logged monthly totals — the quarter rollup is left out so visits aren't counted twice.`;
  html += `<div class="ct-insight-block"><h3>Trend</h3><p class="ct-hint">${trendHint}</p>`;
  html += `<div class="ct-trend-list">${metricTrends.map((t) => `
    <div class="ct-trend-row">
      <div class="ct-trend-label">${t.metricLabel}</div>
      ${t.insufficient ? `<div class="ct-trend-note">${cemInsightScope === 'month' ? 'No earlier month logged to compare with' : 'Needs at least 2 logged months in this range'}</div>` : `
        ${ctSparklineSvg(t.series, '#e8b93f')}
        <div class="ct-trend-stats">
          ${t.rows.map((r) => `<div class="ct-trend-stat ${r.delta>0?'up':r.delta<0?'down':'flat'}">${r.delta>0?'▲':r.delta<0?'▼':'—'} ${r.delta>0?'+':''}${r.delta} pts ${escapeHtml(r.text)}</div>`).join('')}
        </div>
      `}
    </div>
  `).join('')}</div>`;
  html += '</div>';

  html += `<div class="ct-insight-block"><h3>${escapeHtml(focusLabel)} vs every logged month</h3>`;
  html += `<p class="ct-hint">Store-wide totals for ${escapeHtml(focusLabel)}, ranked against every other logged month.</p>`;
  if(months.length < 2){
    html += `<div class="ct-empty">Import at least two months to compare.</div>`;
  } else {
    html += `<div class="ct-compare-list">${monthComparison.map((c) => `
      <div class="ct-compare-row">
        <div class="ct-compare-label">${c.metricLabel}</div>
        <div class="ct-compare-value">${c.value}%</div>
        <div class="ct-compare-detail">
          ${c.isHigh ? '<span class="ct-badge high">Year high</span>' : ''}
          ${c.isLow ? '<span class="ct-badge low">Year low</span>' : ''}
          ${!c.isHigh && !c.isLow ? `${ctOrdinal(c.rank)} of ${c.count} logged months` : ''}
          · ${c.vsAvg>0?'+':''}${c.vsAvg} pts vs the ${c.count}-month average
        </div>
      </div>
    `).join('')}</div>`;
  }
  html += '</div>';

  html += `<div class="ct-insight-block"><h3>Notable highs &amp; lows</h3><p class="ct-hint">Where ${escapeHtml((months.find((p) => p.periodKey === cemFocusPeriod) || {}).periodLabel || 'the selected month')} set a new record for that specific daypart, day of week, or store-wide metric, judged only against its own history.</p>`;
  if(notableExtremes.length === 0){
    html += `<div class="ct-empty">No records yet — each segment needs at least 3 logged months of its own history before "record" means anything.</div>`;
  } else {
    html += `<div class="ct-pattern-list">${notableExtremes.map((e) => `
      <div class="ct-pattern-row ${e.kind==='low'?'down':'up'}">
        <div class="ct-pattern-icon">${e.kind==='low'?'▼':'▲'}</div>
        <div class="ct-pattern-body">
          <div class="ct-pattern-title">${e.dimension==='total'?'Store-wide':escapeHtml(e.segment)} · ${e.metricLabel} — ${e.kind==='high'?'new high':'new low'}</div>
          <div class="ct-pattern-detail">${e.value}% vs previous ${e.kind==='high'?'best':'worst'} of ${e.prevValue}% (${escapeHtml(e.prevLabel)}) · ${e.count} logged months of history</div>
        </div>
      </div>
    `).join('')}</div>`;
  }
  html += '</div>';

  html += `<div class="ct-insight-block"><h3>What drives OSAT</h3><p class="ct-hint">Correlation between each metric and OSAT across every daypart / day-of-week reading in ${escapeHtml(scopeDesc)} (${driverCorrelations.length > 0 ? driverCorrelations[0].n : 0} data points).</p>`;
  if(driverCorrelations.length === 0){
    html += `<div class="ct-empty">Not enough daypart or day-of-week data yet to compute this.</div>`;
  } else {
    html += `<div class="ct-corr-list">${driverCorrelations.map((d) => `
      <div class="ct-corr-row">
        <div class="ct-corr-label">${d.metricLabel}</div>
        <div class="ct-corr-track"><div class="ct-corr-fill" style="width:${Math.max(Math.abs(d.r)*100, 2)}%;"></div></div>
        <div class="ct-corr-value">${d.r.toFixed(2)}</div>
      </div>
    `).join('')}</div>`;
  }
  html += '</div>';

  html += `<div class="ct-insight-block"><h3>Persistent patterns</h3><p class="ct-hint">Dayparts and days of the week statistically different from every other visit, pooled across ${escapeHtml(scopeDesc)}.</p>`;
  if(persistentPatterns.length === 0){
    html += `<div class="ct-empty">Nothing clears statistical significance yet — import more months to sharpen this.</div>`;
  } else {
    html += `<div class="ct-pattern-list">${persistentPatterns.map((p) => `
      <div class="ct-pattern-row ${p.direction}">
        <div class="ct-pattern-icon">${p.direction==='down'?'▼':'▲'}</div>
        <div class="ct-pattern-body">
          <div class="ct-pattern-title">${escapeHtml(p.segment)} · ${p.metricLabel}</div>
          <div class="ct-pattern-detail">${p.segPct}% vs ${p.restPct}% everywhere else (${p.gap>0?'+':''}${p.gap} pts) · pooled across ${p.periodsUsed} month${p.periodsUsed!==1?'s':''} · n=${p.nSeg} vs ${p.nRest} · p=${p.pValue.toFixed(3)}</div>
        </div>
      </div>
    `).join('')}</div>`;
  }
  html += '</div>';

  return html;
}

function ctRenderDataTab(){
  const rows = ctAllEntriesSorted();
  let html = `
    <div class="ct-import-box">
      <h3>Import a comparison report</h3>
      <p class="ct-hint">Drop one or more CEM Comparison Report exports below — CSV or Excel (.xlsx/.xls) both work — or paste raw CSV text. Monthly totals, daypart breakdowns, day-of-week breakdowns, and multi-month rollups (like a quarter) are all supported.</p>
      <div class="ct-dropzone" data-ct-dropzone>⬆️ Drop CSV or Excel file(s) here, or click to choose</div>
      <input type="file" data-ct-file-input accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" multiple style="display:none;">
      <details style="margin-top:12px;">
        <summary style="cursor:pointer;color:var(--text-tertiary);font-size:12.5px;">Or paste CSV text instead</summary>
        <textarea data-ct-import-text rows="6" placeholder="Paste CSV contents here…" style="margin-top:10px;">${escapeHtml(cemImportText)}</textarea>
        <div class="ct-import-actions"><button class="btn btn-primary" style="width:auto;padding:9px 16px;" data-ct-import-pasted>⬆️ Import pasted text</button></div>
      </details>
      ${cemImportMsg ? `<div class="ct-import-msg ${cemImportMsg.type}">${escapeHtml(cemImportMsg.text)}</div>` : ''}
    </div>
    <div class="ct-table-wrap">
      <h3>Logged data</h3>
      <table>
        <thead><tr><th>Period</th><th>View</th><th>Segment</th><th>n</th>${CT_METRICS.map((m) => `<th>${m.short}</th>`).join('')}<th></th></tr></thead>
        <tbody>
          ${rows.length === 0 ? `<tr><td colspan="10" class="ct-empty-row">No data logged yet.</td></tr>` : rows.map((e) => `
            <tr>
              <td>${escapeHtml(e.periodLabel)}</td>
              <td>${e.dimension==='total'?'Overall':e.dimension==='daypart'?'Daypart':'Day of Week'}</td>
              <td>${escapeHtml(e.segment)}</td>
              <td>${e.n ?? '—'}</td>
              ${CT_METRICS.map((m) => `<td>${e.scores[m.key] != null ? e.scores[m.key] + '%' : '—'}</td>`).join('')}
              <td><button class="ct-icon-btn" data-ct-delete-entry="${e.key}" title="Delete row">✕</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  return html;
}

function renderCemTrends(){
  const root = document.getElementById('cemTrendsRoot');
  if(!root) return;
  const tabs = [ { id:'scoreboard', label:'Scoreboard' }, { id:'trends', label:'Trends' }, { id:'insights', label:'Insights' }, { id:'data', label:'Log Data' } ];
  let html = `
    <div class="ct-header-row"><h2 class="ct-title">📈 CEM Trends</h2></div>
    <p class="ct-subtitle">Multi-month guest experience trends &amp; statistical insights — separate from this month's live scoreboard above</p>
    <nav class="ct-tabs">${tabs.map((t) => `<button class="ct-tab ${cemTab===t.id?'active':''}" data-ct-set-tab="${t.id}">${t.label}</button>`).join('')}</nav>
    <div class="ct-panel">
  `;
  if(cemTab === 'scoreboard') html += ctRenderScoreboardTab();
  else if(cemTab === 'trends') html += ctRenderTrendsTab();
  else if(cemTab === 'insights') html += ctRenderInsightsTab();
  else if(cemTab === 'data') html += ctRenderDataTab();
  html += '</div>';
  root.innerHTML = html;
}

// ---------- mutations ----------

async function ctApplyImport(period, incoming){
  const merged = ctMergeEntries(cemEntries, incoming);
  cemEntries = merged;
  await saveState();
  cemSelPeriod = period.periodKey;
  return incoming.length;
}

async function ctDeleteEntry(key){
  cemEntries = cemEntries.filter((e) => e.key !== key);
  await saveState();
  renderCemTrends();
}

async function ctProcessFiles(fileList){
  const files = Array.from(fileList || []);
  if(files.length === 0) return;
  const isExcel = (file) => /\.(xlsx|xls)$/i.test(file.name);
  const readOne = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => resolve(evt.target.result);
    reader.onerror = () => reject(new Error("Couldn't read the file."));
    if(isExcel(file)) reader.readAsArrayBuffer(file); else reader.readAsText(file);
  });
  let successCount = 0, lastLabel = '';
  const errors = [];
  for(const file of files){
    try{
      const result = await readOne(file);
      const { period, entries } = isExcel(file) ? ctParseWorkbook(result) : ctParseCsv(result);
      await ctApplyImport(period, entries);
      successCount += 1;
      lastLabel = period.periodLabel;
    }catch(err){ errors.push(`${file.name}: ${err.message}`); }
  }
  cemImportMsg = errors.length === 0
    ? { type:'success', text:`Imported ${successCount} file${successCount!==1?'s':''}. Most recent: ${lastLabel}.` }
    : { type:'error', text:`Imported ${successCount} of ${files.length} file(s). Problems: ${errors.join(' | ')}` };
  renderCemTrends();
}

// ---------- events ----------

document.getElementById('cemTrendsRoot').addEventListener('click', function(e){
  const tabBtn = e.target.closest('[data-ct-set-tab]');
  if(tabBtn){ cemTab = tabBtn.dataset.ctSetTab; renderCemTrends(); return; }

  const scopeChip = e.target.closest('[data-ct-set-scope]');
  if(scopeChip){ cemInsightScope = scopeChip.dataset.ctSetScope; renderCemTrends(); return; }

  const metricChip = e.target.closest('[data-ct-set-trend-metric]');
  if(metricChip){ cemTrendMetric = metricChip.dataset.ctSetTrendMetric; renderCemTrends(); return; }

  const legendItem = e.target.closest('[data-ct-toggle-segment]');
  if(legendItem){
    const seg = legendItem.dataset.ctToggleSegment;
    if(cemVisibleSegments.has(seg)) cemVisibleSegments.delete(seg); else cemVisibleSegments.add(seg);
    renderCemTrends();
    return;
  }

  const dropzone = e.target.closest('[data-ct-dropzone]');
  if(dropzone){ document.querySelector('[data-ct-file-input]').click(); return; }

  const importPasted = e.target.closest('[data-ct-import-pasted]');
  if(importPasted){
    const text = document.querySelector('[data-ct-import-text]').value;
    if(!text.trim()){ cemImportMsg = { type:'error', text:'Paste CSV text first.' }; renderCemTrends(); return; }
    try{
      const { period, entries } = ctParseCsv(text);
      ctApplyImport(period, entries).then((count) => {
        cemImportMsg = { type:'success', text:`Imported ${count} row(s) for ${period.periodLabel}.` };
        cemImportText = '';
        renderCemTrends();
      });
    }catch(err){ cemImportMsg = { type:'error', text: err.message || "Couldn't parse that text." }; renderCemTrends(); }
    return;
  }

  const deleteBtn = e.target.closest('[data-ct-delete-entry]');
  if(deleteBtn){ ctDeleteEntry(deleteBtn.dataset.ctDeleteEntry); return; }
});

document.getElementById('cemTrendsRoot').addEventListener('change', function(e){
  if(e.target.matches('[data-ct-sel-period]')){ cemSelPeriod = e.target.value; renderCemTrends(); return; }
  if(e.target.matches('[data-ct-sel-view]')){ cemSelView = e.target.value; cemSelSegment = null; renderCemTrends(); return; }
  if(e.target.matches('[data-ct-sel-segment]')){ cemSelSegment = e.target.value; renderCemTrends(); return; }
  if(e.target.matches('[data-ct-sel-trend-view]')){ cemTrendView = e.target.value; renderCemTrends(); return; }
  if(e.target.matches('[data-ct-scope-month]')){ cemScopeMonth = e.target.value; renderCemTrends(); return; }
  if(e.target.matches('[data-ct-file-input]')){ ctProcessFiles(e.target.files); e.target.value = ''; return; }
});

document.getElementById('cemTrendsRoot').addEventListener('input', function(e){
  if(e.target.matches('[data-ct-import-text]')) cemImportText = e.target.value;
});

document.getElementById('cemTrendsRoot').addEventListener('dragover', function(e){
  if(e.target.closest('[data-ct-dropzone]')){ e.preventDefault(); e.target.closest('[data-ct-dropzone]').classList.add('active'); }
});
document.getElementById('cemTrendsRoot').addEventListener('dragleave', function(e){
  const dz = e.target.closest('[data-ct-dropzone]');
  if(dz) dz.classList.remove('active');
});
document.getElementById('cemTrendsRoot').addEventListener('drop', function(e){
  const dz = e.target.closest('[data-ct-dropzone]');
  if(!dz) return;
  e.preventDefault();
  dz.classList.remove('active');
  ctProcessFiles(e.dataTransfer.files);
});
