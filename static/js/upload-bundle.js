// ===== UPLOAD BUNDLE (Tim, Oct 19 2026) =====
// The schedule is built in a Claude project from a stack of reports
// (HotSchedules rosters, availability and time off, Analytics Hub sales and
// labor, Levelset PEAs, the punch report, the marketing calendar). Several of
// them used to be uploaded twice: once to build the schedule, once here. Now
// the same stack can come here as one zip: Manage → Uploads opens it on this
// device and files each report where it belongs, exactly as if it had been
// dropped on its own.
//
// What happens to each file in a bundle:
//  - a report the hub reads (rosters, the punch report, Sales Mix, DayTrack,
//    CEM, ...) is filed by the reader it always had;
//  - several weekly rosters queue: each opens its review after the one before
//    it is saved or cancelled; a week that's already over is left out;
//  - the marketing calendar picture waits for a tap to be read into Events
//    (the reader there shows what it found before anything is added);
//  - a report only the schedule build uses (availability, time off, the
//    Analytics Hub dashboard PDFs, the 15-minute sales curves) is set aside
//    by name, and so is the Levelset PEA PDF (the Levelset sync brings PEAs
//    in on its own);
//  - README and checksum files are skipped.
// The zip never leaves the device; each report goes on as its own upload
// would. A zip of only PDFs (the Smart Shop zip from Ops Hub) is left for
// the reader it already had.

const DU_JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const DU_BUNDLE_MAX_FILES = 80;
const DU_BUNDLE_MAX_BYTES = 40 * 1024 * 1024;
let duJsZip = null;
let duBundleImages = {};      // key → the calendar picture waiting to be read
let duRosterQueue = [];       // [{file, text, i}] rosters waiting their turn
let duRosterOpen = null;      // {i, file}: the upload row whose roster review is open

function duLoadJsZip(){
  if(window.JSZip) return Promise.resolve(window.JSZip);
  if(duJsZip) return duJsZip;
  duJsZip = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = DU_JSZIP;
    s.onload = () => window.JSZip ? resolve(window.JSZip) : reject(new Error('The zip reader didn’t load.'));
    s.onerror = () => { duJsZip = null; reject(new Error('The zip reader didn’t load. Check the connection and try again.')); };
    document.head.appendChild(s);
  });
  return duJsZip;
}

// "1454f331-Sales_Curve_11.pdf" → "Sales_Curve_11.pdf" (the upload ID a
// Claude project puts in front of each file name).
function duBundleBaseName(path){
  const base = String(path || '').split('/').pop();
  return base.replace(/^[0-9a-f]{8}-/i, '');
}

const DU_BUNDLE_MIME = {pdf: 'application/pdf', csv: 'text/csv', txt: 'text/plain', tsv: 'text/tab-separated-values', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel'};

// A dropped zip → its files, or null when it isn't a bundle (only PDFs: the
// Smart Shop zip, read as before).
async function duOpenBundle(zipFile){
  const JSZip = await duLoadJsZip();
  const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
  const entries = Object.values(zip.files).filter(e => !e.dir && !/(^|\/)(__MACOSX|\.)/.test(e.name));
  if(!entries.length || entries.every(e => /\.pdf$/i.test(e.name))) return null;
  if(entries.length > DU_BUNDLE_MAX_FILES) throw new Error(`That zip has ${entries.length} files; the hub takes up to ${DU_BUNDLE_MAX_FILES} at once.`);
  const files = [];
  let total = 0;
  for(const e of entries){
    const blob = await e.async('blob');
    total += blob.size;
    if(total > DU_BUNDLE_MAX_BYTES) throw new Error('That zip is over 40 MB unpacked.');
    const ext = (e.name.match(/\.([a-z0-9]+)$/i) || [])[1] || '';
    files.push(new File([blob], e.name.split('/').pop(), {type: DU_BUNDLE_MIME[ext.toLowerCase()] || '', lastModified: e.date ? e.date.getTime() : Date.now()}));
  }
  return files;
}

// Bundle files the hub has nothing to do with, by name or by shape: what
// they are, so the results say "set aside" rather than "didn't recognize".
// null when the hub should read it.
function duScheduleOnly(file, text){
  const n = duBundleBaseName(file.name);
  if(/^(README|SHA256|MANIFEST|CHECKSUM)/i.test(n) || /\.(md|sha256)$/i.test(n)) return {skip: 'Bundle notes', why: 'Not a report.'};
  if(/availability/i.test(n)) return {skip: 'HotSchedules availability', why: 'Used to build the schedule; the hub gets the finished schedule from the roster.'};
  if(/time.?off|HotSchedules_-_Online/i.test(n)) return {skip: 'HotSchedules time off & requests', why: 'Used to build the schedule; the hub gets the finished schedule from the roster.'};
  // Daily Detail and Sales Data PDFs and the 15-minute sales CSVs are read
  // (analytics-reports.js); the other dashboard pictures are set aside.
  const dash = n.match(/^(Sales_Curve|Labor_Cost|Productivity)(_\d+)?\.pdf$/i);
  if(dash) return {skip: `Analytics Hub ${dash[1].replace(/_/g, ' ')} (PDF)`, why: 'A picture of the dashboard, used to build the schedule. The hub reads these numbers from the Daily Detail and Sales Data PDFs and the 15-minute sales.'};
  if(/positional-ratings.*\.pdf$/i.test(n)) return {skip: 'Levelset PEA ratings (PDF)', why: 'The Levelset sync brings PEAs in on its own.'};
  return null;
}

// A roster from a bundle: a week that's over is left out; while one roster's
// review is open, the next waits its turn.
function duRosterWeekOver(file){
  const start = typeof weeklyRosterStartFromFileName === 'function' ? weeklyRosterStartFromFileName(file.name) : null;
  if(!start) return false;
  const end = new Date(start + 'T12:00:00');
  end.setDate(end.getDate() + 6);
  return toLocalISODate(end) < today;
}
function duRosterReviewOpen(){
  const m = document.getElementById('weeklyImportPreviewModal');
  return !!(m && m.classList.contains('active'));
}
function duRosterNext(){
  const next = duRosterQueue.shift();
  if(!next) return;
  setTimeout(() => { duOpenRoster(next); renderDataUploads(); }, 250);
}

// Open a roster's review from an upload; its row waits until it's saved or
// skipped (Tim, Oct 20 2026: a bundle can carry an outdated roster he doesn't
// want applied, while everything else in it should be).
function duOpenRoster(job){
  duRosterOpen = {i: job.i, file: job.file.name};
  duImportRoster(job.file, job.text);
  const r = duResults[job.i];
  if(r && r.file === job.file.name) duResults[job.i] = {...r, state: 'waiting', action: null, text: 'Open for review: Confirm & Save to apply this week, or Skip to leave it out.'};
}
function duRosterRow(i, file, state, text){
  if(duResults[i] && duResults[i].file === file) duResults[i] = {...duResults[i], state, text, action: null};
}
// The open review was saved (true) or skipped (false).
function duRosterDone(saved, label){
  const open = duRosterOpen;
  duRosterOpen = null;
  if(!open) return;
  duRosterRow(open.i, open.file, saved ? 'ok' : 'skip', saved ? `Saved${label ? ': ' + label : ''}.` : 'Skipped: not applied.');
  renderDataUploads();
}
// A roster still waiting its turn, left out before it opens.
function duRosterSkipQueued(i){
  const at = duRosterQueue.findIndex(q => q.i === i);
  if(at < 0) return;
  const [q] = duRosterQueue.splice(at, 1);
  duRosterRow(q.i, q.file.name, 'skip', 'Skipped: not applied.');
  renderDataUploads();
  if(typeof weeklyImportSyncQueue === 'function') weeklyImportSyncQueue();
}
// Skip the open one and every one still waiting.
function duRosterSkipAll(){
  duRosterQueue.splice(0).forEach(q => duRosterRow(q.i, q.file.name, 'skip', 'Skipped: not applied.'));
  duRosterDone(false);
}

// The calendar picture: read into Events when a manager taps it.
function duBundleImage(file){
  const key = 'img' + Object.keys(duBundleImages).length + '-' + Date.now().toString(36);
  duBundleImages[key] = file;
  return key;
}
function duReadBundleImage(key){
  const file = duBundleImages[key];
  if(!file || typeof eviStart !== 'function') return;
  if(typeof manageShowTab === 'function') manageShowTab('events');
  const root = document.getElementById('eventsImportRoot');
  if(root && root.scrollIntoView) root.scrollIntoView({block: 'start'});
  eviStart(file);
}
