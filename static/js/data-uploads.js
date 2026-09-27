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
    key: 'cem', icon: '⭐', name: 'CEM guest scores', freq: 'weekly',
    how: 'CEM → Comparison Report for this month to date (the 1st through yesterday). Export it twice — Time of Day, and Day of Visit — as CSV or Excel.',
    feeds: 'Guest Obsession scoreboard · CEM Trends · CEM insights'
  },
  {
    key: 'roster', icon: '🗓️', name: 'HotSchedules weekly roster', freq: 'weekly', fixedFreq: true,
    how: 'HotSchedules → Weekly Roster CSV for next week. Keep the file name — it carries the dates.',
    feeds: 'Set Ups · Fill · Evaluate · Lead Captain · shift changes'
  },
  {
    key: 'pea', icon: '📊', name: 'PEA ratings (Levelset)', freq: 'weekly',
    how: 'Levelset → Positional Excellence Ratings PDF, FOH and BOH. Overlapping dates are fine — ratings already saved are skipped.',
    feeds: 'Strength map · Coverage Check · Set Ups Fill, Evaluate, Plan B, Develop'
  },
  {
    key: 'salesMix', icon: '🧾', name: 'Sales Mix (items sold)', freq: 'weekly',
    how: 'Sales Mix Items Totals report, one file per day (the date in the file name is used). Drop several days at once.',
    feeds: 'Prep Board build-to and sold history'
  }
];

let dataUploadLog = {};        // {sourceKey: [{at, file, summary, periodEnd?}]} newest last
let dataUploadSettings = {};   // {freq: {sourceKey: 'weekly' | ...}}
let duResults = [];            // session-only: what the last drop did

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
    const up = (peaRatings.uploads || [])[peaRatings.uploads.length - 1] || null;
    const last = [logAt, up ? new Date(up.at) : null].filter(Boolean).sort((a, b) => a - b).pop() || null;
    const rows = peaRatings.rows || [];
    const cover = rows.length ? `Ratings through ${duShort(rows[rows.length - 1][0].slice(0, 10))} · ${rows.length} saved` : 'No PEA ratings yet';
    const areas = up && up.areas && up.areas.length < PEA_AREAS.length ? `Last upload only covered ${up.areas.join(', ')} — upload ${PEA_AREAS.filter(a => !up.areas.includes(a)).join(', ')} too.` : '';
    return {status: duStatusFromTime(last, freq, now), freq, cover, note: areas, last};
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
  if(/\.pdf$/i.test(file.name)) return 'pea';
  const firstSheetText = workbook ? workbook.SheetNames.map(n => XLSX.utils.sheet_to_csv(workbook.Sheets[n])).join('\n').slice(0, 4000) : '';
  const head = (text || firstSheetText).slice(0, 4000);
  if(/Comparison:\s*[\d/]+\s*-\s*[\d/]+/.test(head)) return 'cem';
  const firstLine = head.split(/\r?\n/)[0] || '';
  if(/(^|,)"?Employee"?(,|$)/.test(firstLine) && /Mon Shift/.test(firstLine)) return 'roster';
  if(/Daypart Hours Swap/i.test(head)) return 'productivity';
  if(/sales[\s_-]*mix/i.test(file.name) || /Sold Count/i.test(firstLine)) return 'salesMix';
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
  const up = (peaRatings.uploads || [])[peaRatings.uploads.length - 1];
  if(!up || up === beforeLast) throw new Error(document.getElementById('peaUploadStatus').textContent || 'PEA upload failed.');
  return `${up.read} ratings read · ${up.added} new${up.rangeStart ? ` · ${duShort(up.rangeStart)}–${duShort(up.rangeEnd)}` : ''} (${(up.areas || []).join(', ')})`;
}

function duImportSalesMix(file){
  return new Promise((resolve, reject)=>{
    const iso = pbDateFromFileName(file.name);
    if(!iso) return reject(new Error('No date in the file name (…_2026-09-19.csv) — add this one from the Prep Board with its date picked.'));
    pbReadWorkbookRows(file, async (err, rows)=>{
      if(err || !rows || !rows.length) return reject(new Error('Couldn’t read that file.'));
      const parsed = pbRowsToDateEntries(rows, iso);
      if(!Object.keys(parsed.byDate).length) return reject(new Error('No prep items found in it.'));
      const result = pbAddDatedEntries(prepSoldEntries, parsed.byDate, 'import');
      duRecord('salesMix', {file: file.name, summary: `${duShort(iso)} · ${result.items} prep items`});
      await saveState();
      if(typeof renderPrepBoard === 'function') renderPrepBoard();
      resolve(`${duShort(iso)} · ${result.items} prep items sold${result.replaced ? ' (replaced that day)' : ''} → Prep Board`);
    });
  });
}

async function duHandleFiles(fileList){
  const files = Array.from(fileList || []);
  if(!files.length) return;
  duResults = files.map(f => ({file: f.name, state: 'working', text: 'Reading…'}));
  renderDataUploads();
  // CEM files first so the scoreboard ends on the newest month; the roster
  // last because it opens a review window.
  const order = {cem: 0, pea: 1, salesMix: 2, productivity: 3, roster: 4};
  const jobs = [];
  for(let i = 0; i < files.length; i++){
    const file = files[i];
    try{
      const isPdf = /\.pdf$/i.test(file.name);
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const buffer = isPdf ? null : await duReadFile(file, true);
      const text = buffer && !isExcel ? pbDecodeText(buffer) : '';
      const workbook = isExcel ? XLSX.read(new Uint8Array(buffer), {type: 'array'}) : null;
      jobs.push({i, file, kind: duDetect(file, text, workbook), text, buffer});
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
      else if(job.kind === 'salesMix') text = await duImportSalesMix(job.file);
      else if(job.kind === 'roster') text = duImportRoster(job.file, job.text);
      else if(job.kind === 'productivity') throw new Error('Productivity reports aren’t stored yet — they come with the break planner (TIM-44).');
      else throw new Error('Didn’t recognize this file. Expected a CEM Comparison Report, HotSchedules roster CSV, Levelset PEA PDF, or Sales Mix report.');
      duResults[job.i] = {file: job.file.name, state: 'ok', kind: src ? src.name : job.kind, text};
    }catch(err){
      duResults[job.i] = {file: job.file.name, state: 'error', kind: src ? src.name : '', text: err.message};
    }
    renderDataUploads();
  }
  const ok = duResults.filter(r => r.state === 'ok').length;
  showToast(ok === files.length ? `✓ ${ok} file${ok === 1 ? '' : 's'} filed` : `${ok} of ${files.length} files filed — see Data Uploads`);
}

// ----- Rendering -----

const DU_STATUS = {
  fresh: {label: 'Up to date', cls: 'is-fresh', icon: '✓'},
  due: {label: 'Due', cls: 'is-due', icon: '•'},
  overdue: {label: 'Overdue', cls: 'is-overdue', icon: '!'}
};

function renderDataUploads(){
  const root = document.getElementById('dataUploadsRoot');
  if(!root) return;
  const now = new Date();
  const rows = DU_SOURCES.map(src => ({src, st: duSourceState(src, now)}));
  const dueCount = rows.filter(r => r.st.status !== 'fresh').length;
  root.innerHTML = `
    <div class="du-summary ${dueCount ? 'has-due' : ''}">${dueCount ? `${dueCount} of ${rows.length} need an upload` : `All ${rows.length} data sources are up to date`}</div>
    <label class="du-drop" data-du-drop>
      <input type="file" multiple accept=".csv,.xlsx,.xls,.pdf,.txt,.tsv" data-du-input>
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

document.getElementById('dataUploadsRoot').addEventListener('change', async e=>{
  if(e.target.matches('[data-du-input]')){
    const files = e.target.files;
    await duHandleFiles(files);
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
