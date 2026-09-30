// ===== GUEST OBSESSION REPORTS (TIM-30 … TIM-34) =====
// Five more reports go through the Data Uploads drop zone, so the Guest
// Obsession scoreboard stops being typed in by hand:
//   sales       Analytics Hub sales by day (CSV_DOWNLOAD): total sales and
//               % change vs last year for the dates exported → WIG MTD (or
//               YTD when the export starts in the first week of January)
//   dtRank      Analytics Hub Detailed Rankings: drive-thru composite score
//               and rank → Market, State or Chain (the file doesn't say which
//               comparison group it was filtered to, so the upload asks)
//   sos         Analytics Hub speed of service by day (Custom by Day):
//               average total time per destination → Speed of Service
//               (drive-thru, every car including mobile orders)
//   smartShop   Ops Hub Smart Shop PDFs (or the zip Ops Hub downloads):
//               compliance per visit and every standard missed
//   foodSafety  Ops Hub food safety "All Findings" PDF: the quarter's findings
// PDFs are read on the server (/api/reports/parse). What's read is kept in
// reportData; files aren't. Location and operator names in the exports are
// never kept.

let reportData = {};   // {sales: {mtd, ytd}, dtRank: {market, state, chain}, sos, smartShop: {visits}, foodSafety: {quarters}}

const RP_KEYS = ['sales', 'dtRank', 'sos', 'smartShop', 'foodSafety'];
const RP_DT_GROUPS = {market: 'Market', state: 'State', chain: 'Chain'};
const RP_SS_KEEP = 24;   // Smart Shop visits kept

const rpNum = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[$,%\s]/g, '')); return isNaN(n) ? null : n; };
const rpMoney = n => '$' + Math.round(n).toLocaleString('en-US');
const rpPct = (fraction, digits = 1, plus = true) => `${plus && fraction > 0 ? '+' : ''}${(fraction * 100).toFixed(digits)}%`;
const rpClock = secs => `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}`;
function rpRange(from, to){ return from === to ? duShort(from) : `${duShort(from)} – ${duShort(to)}`; }

// ----- Recognizing the files -----

function rpDetect(text){
  const head = String(text || '').slice(0, 3000);
  if(/Sales Metric \(Export\)/.test(head)) return 'sales';
  if(/Ranking - Composite Score/.test(head)) return 'dtRank';
  if(/Trans Count Sos/i.test(String(text || '').slice(0, 20000))) return 'sos';
  return null;
}

// ----- Sales by day -----

// → {from, to, total, change, channels: {name: {sales, change}}, days: [[iso, sales, change]]}
function rpParseSales(text){
  const rows = duParseTsv(text);
  const channels = rows[0] || [];
  const totalRow = rows.find(r => (r[0] || '').trim() === 'Total');
  if(!totalRow) throw new Error('No Total row in this sales export.');
  const days = [];
  rows.forEach(r=>{
    const m = String(r[1] || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const sales = rpNum(r[2]);
    if(m && sales !== null) days.push([`${m[3]}-${m[1]}-${m[2]}`, sales, rpNum(r[3])]);
  });
  if(!days.length) throw new Error('No days found in this sales export.');
  days.sort((a, b) => a[0].localeCompare(b[0]));
  const out = {from: days[0][0], to: days[days.length - 1][0], total: rpNum(totalRow[2]), change: rpNum(totalRow[3]), channels: {}, days};
  for(let c = 2; c + 1 < channels.length; c += 2){
    const name = String(channels[c] || '').trim();
    if(name && name !== 'Total') out.channels[name] = {sales: rpNum(totalRow[c]), change: rpNum(totalRow[c + 1])};
  }
  if(out.total === null) throw new Error('No total sales in this export.');
  return out;
}

async function rpImportSales(file, text){
  const s = rpParseSales(text);
  // Starts in the first week of January → year to date; otherwise month to date.
  const ytd = /-01-0[1-7]$/.test(s.from) && s.from.slice(0, 4) === s.to.slice(0, 4);
  const which = ytd ? 'ytd' : 'mtd';
  const sales = reportData.sales = reportData.sales || {};
  sales[which] = {...s, file: file.name, at: new Date().toISOString()};
  rpApplyToScoreboard();
  duRecord('sales', {file: file.name, summary: `${which.toUpperCase()} ${rpRange(s.from, s.to)}`, periodEnd: s.to});
  await saveState();
  rpRerender();
  return `${ytd ? 'Year' : 'Month'} to date ${rpRange(s.from, s.to)}: ${rpMoney(s.total)} (${s.change === null ? 'no change %' : rpPct(s.change) + ' vs last year'}) → Guest Obsession WIG`;
}

// ----- Drive-thru ranking -----

// Values line up with their headers from the right (the location columns
// on the left don't).
function rpParseDtRank(text){
  const rows = duParseTsv(text).filter(r => r.some(c => String(c).trim()));
  if(rows.length < 2) throw new Error('No ranking row in this export.');
  const header = rows[0].map(h => String(h).trim());
  const row = rows.slice(1).find(r => r.some(c => String(c).trim() === 'Selected Location')) || rows[1];
  const n = Math.min(header.length, row.length);
  const h = header.slice(-n), v = row.slice(-n);
  const get = re => { const i = h.findIndex(x => re.test(x)); return i === -1 ? null : rpNum(v[i]); };
  const out = {
    composite: get(/^Composite Score/i), rank: get(/^Ranking - Composite Score$/i),
    dtSales: get(/^Avg DT Daily Sales$/i), dtSalesRank: get(/^Avg DT Daily Sales Rank$/i),
    dtCars: get(/^Avg DT Daily TCnt$/i), dtCarsRank: get(/TCnt Rank$/i),
    fastService: get(/Fast Service %$/i), fastServiceRank: get(/Fast Service % Rank$/i),
    orderAcc: get(/Order Acc %$/i), orderAccRank: get(/Order Acc % Rank$/i)
  };
  if(out.rank === null) throw new Error('No composite rank in this export.');
  return out;
}

async function rpImportDtRank(file, text, group){
  const d = rpParseDtRank(text);
  const ranks = reportData.dtRank = reportData.dtRank || {};
  ranks[group] = {...d, file: file.name, at: new Date().toISOString()};
  rpApplyToScoreboard();
  duRecord('dtRank', {file: file.name, summary: `${RP_DT_GROUPS[group]} #${d.rank}`});
  await saveState();
  rpRerender();
  return `${RP_DT_GROUPS[group]} rank #${d.rank} (composite ${d.composite}) → Guest Obsession DT ranking`;
}

// ----- Speed of service by day -----

// Rows are keyed by the day's average order / payment / total / fulfillment
// times, then destination and measure, with the value under the day's
// column. → {from, to, destinations: {name: {cars, total, order, fulfill}}}
function rpParseSos(text, now){
  const rows = duParseTsv(text);
  const hi = rows.findIndex(r => r.some(c => /Destination Type/i.test(c)));
  if(hi === -1) throw new Error('No destination column in this speed of service export.');
  const header = rows[hi].map(c => String(c).trim());
  const col = re => header.findIndex(c => re.test(c));
  const destCol = col(/Destination Type/i), measureCol = destCol + 1;
  const orderCol = col(/^Avg Order Time$/i), totalCol = col(/^Avg Total Time$/i), fulfillCol = col(/^Avg Fulfillment Time$/i);
  if(totalCol === -1) throw new Error('No Avg Total Time column in this speed of service export.');
  const secs = s => { const m = String(s).match(/(\d+)\s*min\s*(\d+)\s*sec/); return m ? +m[1] * 60 + +m[2] : null; };
  const today0 = duStartOfDay(now || new Date());
  // Day columns say "Sep 01" with no year: this year, unless that's in the future.
  const dayIso = label=>{
    const d = new Date(`${label} ${today0.getFullYear()}`);
    if(isNaN(d)) return null;
    if(d > duAddDays(today0, 1)) d.setFullYear(d.getFullYear() - 1);
    return duISO(d);
  };
  const days = header.map((c, i) => i > measureCol ? dayIso(c) : null);
  const byDest = {};   // dest → iso → {total, order, fulfill, cars}
  rows.slice(hi + 1).forEach(r=>{
    const dest = String(r[destCol] || '').trim(), measure = String(r[measureCol] || '').trim();
    if(!dest) return;
    r.forEach((cell, i)=>{
      if(!days[i] || !String(cell).trim()) return;
      const perDay = byDest[dest] = byDest[dest] || {};
      const rec = perDay[days[i]] = perDay[days[i]] || {};
      rec.total = secs(r[totalCol]);
      rec.order = orderCol === -1 ? null : secs(r[orderCol]);
      rec.fulfill = fulfillCol === -1 ? null : secs(r[fulfillCol]);
      if(/^Trans Count Sos$/i.test(measure)) rec.cars = rpNum(cell);
    });
  });
  const destinations = {};
  const allDays = [];
  Object.entries(byDest).forEach(([dest, perDay])=>{
    let cars = 0, total = 0, order = 0, fulfill = 0;
    Object.entries(perDay).forEach(([iso, d])=>{
      if(!d.cars || d.total === null) return;
      allDays.push(iso);
      cars += d.cars; total += d.total * d.cars; order += (d.order || 0) * d.cars; fulfill += (d.fulfill || 0) * d.cars;
    });
    if(cars) destinations[dest] = {cars, total: total / cars, order: order / cars, fulfill: fulfill / cars};
  });
  if(!Object.keys(destinations).length) throw new Error('No speed of service numbers in this export.');
  allDays.sort();
  return {from: allDays[0], to: allDays[allDays.length - 1], destinations};
}

// Drive-thru, every car: regular and mobile-order lanes together.
function rpSosDriveThru(sos){
  const lanes = Object.entries(sos.destinations).filter(([name]) => /^(M:\s*)?Drive Thru$/i.test(name)).map(([, d]) => d);
  const cars = lanes.reduce((s, d) => s + d.cars, 0);
  return cars ? {cars, total: lanes.reduce((s, d) => s + d.total * d.cars, 0) / cars} : null;
}

async function rpImportSos(file, text){
  const s = rpParseSos(text, new Date());
  reportData.sos = {...s, file: file.name, at: new Date().toISOString()};
  rpApplyToScoreboard();
  const dt = rpSosDriveThru(s);
  duRecord('sos', {file: file.name, summary: rpRange(s.from, s.to), periodEnd: s.to});
  await saveState();
  rpRerender();
  return `${rpRange(s.from, s.to)} · drive-thru ${dt ? `${rpClock(dt.total)} average (${dt.cars.toLocaleString('en-US')} cars)` : 'not in this export'} → Speed of Service`;
}

// ----- Ops Hub PDFs (Smart Shop, food safety) -----

// Returns {text, kind}, or null when the PDF isn't an Ops Hub report (the
// caller then tries it as a PEA export).
async function rpImportOpsPdf(file){
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/reports/parse`, {method: 'POST', body: form});
  const data = await res.json().catch(() => ({}));
  if(res.status === 403) throw new Error('Manager sign-in expired — lock Manage, sign in again, and re-upload.');
  if(!res.ok) throw new Error(data.error || `Couldn’t read that file (HTTP ${res.status}).`);
  const reports = data.reports || [];
  const shops = reports.filter(r => r.kind === 'smartShop');
  const safety = reports.filter(r => r.kind === 'foodSafety');
  if(!shops.length && !safety.length) return null;
  const out = [];
  if(shops.length){
    const ss = reportData.smartShop = reportData.smartShop || {visits: []};
    shops.forEach(v=>{
      const visit = {file: v.file, visit: v.visit, month: v.month, dayOfWeek: v.dayOfWeek, daypart: v.daypart,
        score: v.score, compliant: v.compliant, scored: v.scored, sections: v.sections, misses: v.misses, at: new Date().toISOString()};
      ss.visits = ss.visits.filter(x => x.file !== v.file).concat(visit);
    });
    ss.visits.sort((a, b) => (a.month || '').localeCompare(b.month || '') || a.at.localeCompare(b.at));
    ss.visits = ss.visits.slice(-RP_SS_KEEP);
    duRecord('smartShop', {file: file.name, summary: shops.map(v => `${v.dayOfWeek} ${v.daypart} ${v.score}%`).join(' · ')});
    out.push(shops.map(v => `${v.visit} · ${v.dayOfWeek} ${v.daypart}: ${v.score}% (${v.scored - v.compliant} missed)`).join(' | '));
  }
  if(safety.length){
    const fs = reportData.foodSafety = reportData.foodSafety || {quarters: {}};
    safety.forEach(r => { fs.quarters[r.quarter || 'unknown'] = {quarter: r.quarter, total: r.total, findings: r.findings, file: r.file, at: new Date().toISOString()}; });
    const r = safety[safety.length - 1];
    duRecord('foodSafety', {file: file.name, summary: `${r.quarter} · ${r.total} findings`});
    out.push(`${r.quarter}: ${r.total} findings (${rpFindingCounts(r.findings)}) → Food Safety`);
  }
  await saveState();
  rpRerender();
  return {text: out.join(' · '), kind: shops.length && safety.length ? 'opsPdf' : shops.length ? 'smartShop' : 'foodSafety'};
}

function rpFindingCounts(findings){
  const by = k => findings.filter(f => f.risk === k).length;
  const repeat = findings.filter(f => f.repeat).length;
  return [['high', by('high')], ['medium', by('medium')], ['low', by('low')]].filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(' · ') + (repeat ? ` · ${repeat} repeat` : '');
}

function rpLatestFoodSafety(){
  const qs = Object.values((reportData.foodSafety || {}).quarters || {});
  const key = q => { const m = String(q.quarter || '').match(/Q(\d)-(\d{4})/); return m ? m[2] + m[1] : ''; };
  return qs.sort((a, b) => key(a).localeCompare(key(b))).pop() || null;
}

// The latest month's Smart Shop visits, with the standards missed most often.
function rpSmartShopMonth(){
  const visits = ((reportData.smartShop || {}).visits || []).filter(v => v.month);
  if(!visits.length) return null;
  const month = visits.map(v => v.month).sort().pop();
  const list = visits.filter(v => v.month === month);
  const compliant = list.reduce((s, v) => s + v.compliant, 0), scored = list.reduce((s, v) => s + v.scored, 0);
  const missed = {};
  list.forEach(v => (v.misses || []).filter(m => m.scored).forEach(m=>{
    const k = m.id || m.standard;
    const e = missed[k] = missed[k] || {standard: m.standard, count: 0, visits: new Set()};
    e.count++; e.visits.add(v.file);
  }));
  const top = Object.values(missed).sort((a, b) => b.visits.size - a.visits.size || b.count - a.count).slice(0, 5);
  return {month, label: list[0].visit, visits: list, score: scored ? Math.round(compliant / scored * 1000) / 10 : null, top};
}

// ----- Scoreboard -----

// Fills the Guest Obsession fields these reports cover.
function rpApplyToScoreboard(){
  const set = (group, key, v) => { if(v != null && gxData[group] && gxData[group][key]) gxData[group][key].value = v; };
  const s = reportData.sales || {};
  if(s.mtd){ set('wig', 'mtdSales', rpMoney(s.mtd.total)); if(s.mtd.change != null) set('wig', 'mtdSalesChange', rpPct(s.mtd.change, 2, false)); }
  if(s.ytd){ set('wig', 'ytdSales', rpMoney(s.ytd.total)); if(s.ytd.change != null) set('wig', 'ytdSalesChange', rpPct(s.ytd.change, 2, false)); }
  Object.entries(reportData.dtRank || {}).forEach(([group, d]) => set('dt', group, String(d.rank)));
  const dt = reportData.sos ? rpSosDriveThru(reportData.sos) : null;
  if(dt) set('service', 'speedOfService', rpClock(dt.total));
  gxData.lastUpdated = new Date().toISOString();
}

// Guest Obsession Manage: which inputs these reports fill ({id: title}).
function rpGxAutoFields(){
  const ids = {};
  const s = reportData.sales || {};
  if(s.mtd) ['gx-mtd-sales', 'gx-mtd-change'].forEach(id => { ids[id] = `From the sales upload (${rpRange(s.mtd.from, s.mtd.to)})`; });
  if(s.ytd) ['gx-ytd-sales', 'gx-ytd-change'].forEach(id => { ids[id] = `From the sales upload (${rpRange(s.ytd.from, s.ytd.to)})`; });
  Object.keys(reportData.dtRank || {}).forEach(g => { ids[`gx-dt-${g}`] = 'From the Detailed Rankings upload'; });
  if(reportData.sos && rpSosDriveThru(reportData.sos)) ids['gx-service-speedOfService'] = `From the speed of service upload (${rpRange(reportData.sos.from, reportData.sos.to)})`;
  return ids;
}

// Lines for the Guest Obsession Manage note: what each report says.
function rpGxSummaryHtml(){
  const lines = [];
  const s = reportData.sales || {};
  ['mtd', 'ytd'].forEach(k => { if(s[k]) lines.push(`<b>Sales ${k.toUpperCase()}</b> ${escapeHtml(rpRange(s[k].from, s[k].to))}: ${rpMoney(s[k].total)}${s[k].change != null ? ` (${rpPct(s[k].change)} vs last year)` : ''}`); });
  Object.entries(reportData.dtRank || {}).forEach(([g, d]) => lines.push(`<b>DT ${RP_DT_GROUPS[g]}</b> #${d.rank} · composite ${d.composite}${d.fastService != null ? ` · fast service ${d.fastService}% (#${d.fastServiceRank})` : ''}${d.orderAcc != null ? ` · order accuracy ${d.orderAcc}% (#${d.orderAccRank})` : ''}`));
  if(reportData.sos){
    const dt = rpSosDriveThru(reportData.sos), d = reportData.sos.destinations;
    const lane = name => d[name] ? `${name.replace(/^M:\s*/, 'mobile ')} ${rpClock(d[name].total)}` : '';
    lines.push(`<b>Speed of service</b> ${escapeHtml(rpRange(reportData.sos.from, reportData.sos.to))}: drive-thru ${dt ? rpClock(dt.total) : '—'} (${[lane('Drive Thru'), lane('M: Drive Thru'), lane('Dine In'), lane('Carry Out')].filter(Boolean).map(escapeHtml).join(' · ')})`);
  }
  const ss = rpSmartShopMonth();
  if(ss) lines.push(`<b>Smart Shop ${escapeHtml(ss.label)}</b>: ${ss.visits.length} visit${ss.visits.length === 1 ? '' : 's'}, ${ss.score}% of scored standards met (${ss.visits.map(v => `${escapeHtml(v.dayOfWeek)} ${escapeHtml(v.daypart)} ${v.score}%`).join(' · ')})${ss.top.length ? `<br><span class="rp-sub">Missed most: ${ss.top.map(t => `${escapeHtml(t.standard)}${t.visits.size > 1 ? ` (${t.visits.size} visits)` : ''}`).join(' · ')}</span>` : ''}`);
  const fs = rpLatestFoodSafety();
  if(fs) lines.push(`<b>Food safety ${escapeHtml(fs.quarter)}</b>: ${fs.total} findings (${escapeHtml(rpFindingCounts(fs.findings))})`);
  return lines.length ? `<div class="rp-summary">${lines.map(l => `<div>${l}</div>`).join('')}</div>` : '';
}

// Food Safety page: the latest Ops Hub assessment's findings, to walk first.
function rpFoodSafetyFindingsHtml(){
  const fs = rpLatestFoodSafety();
  if(!fs) return '';
  const order = {high: 0, medium: 1, low: 2};
  const findings = fs.findings.slice().sort((a, b) => order[a.risk] - order[b.risk] || (b.repeat - a.repeat));
  return `<details class="rp-fs-card standup-card" open>
    <summary><b>Last food safety assessment · ${escapeHtml(fs.quarter)}</b> <span class="rp-sub">${fs.total} findings · ${escapeHtml(rpFindingCounts(fs.findings))}</span></summary>
    <ul class="rp-fs-list">${findings.map(f => `<li class="is-${f.risk}"><span class="rp-risk">${f.risk}</span><div><b>${escapeHtml(f.category)}${f.repeat ? ' · repeat' : ''}</b>${f.items.map(i => `<div>${escapeHtml(i)}</div>`).join('')}</div></li>`).join('')}</ul>
  </details>`;
}

function rpRenderFoodSafetyFindings(){
  const root = document.getElementById('rpFoodSafetyFindings');
  if(root) root.innerHTML = rpFoodSafetyFindingsHtml();
}

function rpRerender(){
  if(typeof renderGXScoreboard === 'function') renderGXScoreboard();
  if(typeof renderGXManage === 'function' && document.getElementById('gxManageList')) renderGXManage();
  rpRenderFoodSafetyFindings();
}

// ----- Data Uploads status -----

function rpSourceState(src, now, freq, logAt){
  const {start, prev} = duPeriods(freq, now);
  // Current when the data reaches the day before this period began.
  const byEnd = iso=>{
    if(!iso) return 'overdue';
    const d = new Date(iso + 'T00:00:00');
    return d >= duAddDays(start, -1) ? 'fresh' : d >= duAddDays(prev, -1) ? 'due' : 'overdue';
  };
  if(src.key === 'sales'){
    const s = reportData.sales || {};
    const cover = [s.mtd ? `MTD ${rpRange(s.mtd.from, s.mtd.to)}` : 'No MTD yet', s.ytd ? `YTD ${rpRange(s.ytd.from, s.ytd.to)}` : 'no YTD yet'].join(' · ');
    const status = s.mtd ? byEnd(s.mtd.to) : 'overdue';
    return {status, freq, cover, note: s.mtd && !s.ytd ? 'For YTD, export the same report from Jan 1 and upload it too.' : '', last: logAt};
  }
  if(src.key === 'dtRank'){
    const r = reportData.dtRank || {};
    const have = Object.keys(RP_DT_GROUPS).filter(g => r[g]);
    const cover = have.length ? have.map(g => `${RP_DT_GROUPS[g]} #${r[g].rank}`).join(' · ') : 'No rankings yet';
    return {status: duStatusFromTime(logAt, freq, now), freq, cover, note: have.length && have.length < 3 ? `Still typed in: ${Object.keys(RP_DT_GROUPS).filter(g => !r[g]).map(g => RP_DT_GROUPS[g]).join(', ')}.` : '', last: logAt};
  }
  if(src.key === 'sos'){
    const s = reportData.sos;
    const dt = s ? rpSosDriveThru(s) : null;
    return {status: s ? byEnd(s.to) : 'overdue', freq, cover: s ? `${rpRange(s.from, s.to)} · drive-thru ${dt ? rpClock(dt.total) : '—'}` : 'No speed of service yet', note: '', last: logAt};
  }
  if(src.key === 'smartShop'){
    const m = rpSmartShopMonth();
    return {status: duStatusFromTime(logAt, freq, now), freq, cover: m ? `${m.label} · ${m.visits.length} visit${m.visits.length === 1 ? '' : 's'} · ${m.score}% met` : 'No Smart Shops yet', note: '', last: logAt};
  }
  if(src.key === 'foodSafety'){
    // Assessments come per visit, not on a schedule: never "overdue".
    const fs = rpLatestFoodSafety();
    return {status: fs ? 'fresh' : 'due', freq, cover: fs ? `${fs.quarter} · ${fs.total} findings` : 'No assessment yet', note: '', last: logAt};
  }
  return {status: 'overdue', freq, cover: '', note: '', last: logAt};
}
