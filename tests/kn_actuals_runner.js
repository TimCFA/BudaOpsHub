// Runs Know the Numbers actuals from the uploads (static/js/kn-actuals.js, on
// know-numbers.js, points-engine.js and points.js) on cases from
// tests/test_kn_actuals_uploads.py: reads {cases: [{op}]} on stdin. "today" is
// Monday Oct 12 2026. Punch reports are built as pdf.js text items in the
// Actual vs. Scheduled layout (as tests/points_runner.js does). Made-up names.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const js = n => fs.readFileSync(path.join(__dirname, '..', 'static', 'js', n), 'utf8');
const grab = (src, name) => src.match(new RegExp('(?:^|\\n)function ' + name + '\\([\\s\\S]*?\\n}\\n'))[0];
const ctx = {console, today: '2026-10-12', document: {addEventListener(){}, querySelector(){ return null; }, getElementById(){ return null; }}, window: {},
  escapeHtml: s => (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch])),
  parseMoney: v => { const n = parseFloat(String(v || '').replace(/[^0-9.]/g, '')); return isNaN(n) ? null : n; },
  formatAsCurrency: n => n === '' || n == null ? '' : '$' + (+n).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}),
  toLocalISODate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  getInitials: () => 'TL', showToast(){}, renderDirectorsView(){}, leaderListed: () => false};
vm.createContext(ctx);
const zr = js('zone-reset.js');
vm.runInContext(zr.slice(zr.indexOf('const fohDayparts'), zr.indexOf('// leadFrom:')), ctx);
vm.runInContext(js('know-numbers.js'), ctx);
vm.runInContext(`let numbersData = {}, numbersHistory = {}, salesHistory = {}, daypartWeeks = {};
  let pointsRecords = {}, pointsUploads = [], pointsSettings = {}, pointsTeam = {}, pointsMemos = {};
  let leaderRoster = []; function dirList(){ return [{name: 'Timothy Lane'}]; }
  let saves = 0; async function saveState(){ saves++; }
  let logs = []; function duRecord(key, entry){ logs.push([key, entry.summary]); }`, ctx);
vm.runInContext(js('points-engine.js'), ctx);
vm.runInContext(js('points.js'), ctx);
vm.runInContext(js('kn-actuals.js'), ctx);
// duDetect, with the readers it asks first stubbed out.
const du = js('data-uploads.js');
vm.runInContext('function rpDetect(){ return null; }\nfunction fcLooksLikeDaypartWeek(){ return false; }\nfunction fcLooksLikeLabor(){ return false; }\n' + grab(du, 'duDetect'), ctx);
vm.runInContext(`
  // One punch report page: rows of [employee, date, actualIn, scheduledIn, actualOut, scheduledOut]
  // (times as "06:08 AM", '' for none). A row with only a date and actual times is a later segment.
  function punch(rows, location){
    const items = [['Actual Vs. Scheduled', 200, 790], [location || 'Chick-fil-A Buda (04066)', 200, 780], ['10/05/2026 - 10/11/2026', 200, 770], ['10/12/2026 3:00:00 AM', 400, 760]];
    let y = 700, last = null;
    rows.forEach(([emp, date, ai, si, ao, so]) => {
      if(emp && emp !== last){ items.push([emp, 10, y]); y -= 10; last = emp; }
      items.push([date, 150, y]);
      if(ai) items.push([ai, 200, y]); if(si) items.push([si, 260, y]);
      if(ao) items.push([ao, 200, y - 9]); if(so) items.push([so, 260, y - 9]);
      y -= 20;
    });
    return [{items: items.map(([s, x, y]) => ({s, x, y}))}];
  }
  const L = n => numbersDayparts.find(d => d.name.startsWith(n)).name;
  // Tuesday Oct 6: Maya 6:08–11:00 and 11:30–2:00 (scheduled 6–2), Ana 5–10pm, Ben 10–2 unscheduled,
  // Aurora clocked in at 6:30 and never out.
  const REPORT = punch([
    ['Torres, Maya', '10/06/2026', '06:08 AM', '06:00 AM', '11:00 AM', '02:00 PM'],
    ['Torres, Maya', '10/06/2026', '11:30 AM', '', '02:00 PM', ''],
    ['Ruiz, Ana', '10/06/2026', '05:00 PM', '05:00 PM', '10:00 PM', '10:00 PM'],
    ['Cole, Ben', '10/06/2026', '10:00 AM', '', '02:00 PM', ''],
    ['Diaz, Aurora', '10/06/2026', '06:30 AM', '06:30 AM', '', '02:30 PM']]);
`, ctx);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
Promise.all(input.cases.map(c => vm.runInContext(`(${c.op})`, ctx)(c))).then(out => process.stdout.write(JSON.stringify(out)));
