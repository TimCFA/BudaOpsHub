// Runs the weekly leader report (static/js/leader-report.js) on cases from
// tests/test_leader_report.py: reads {cases: [{op, ...}]} on stdin. The real
// dayparts, handoffs, Know the Numbers, set-up history and Directors helpers
// load; the checklists are cut down to two short zones.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const js = n => fs.readFileSync(path.join(__dirname, '..', 'static', 'js', n), 'utf8');
const grab = (src, name) => src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n}\\n'))[0];
const ctx = {console, today: '2026-10-12', document: {addEventListener(){}, getElementById(){ return null; }}, window: {}, navigator: {},
  escapeHtml: s => (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch])),
  toLocalISODate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  parseMoney: v => { const n = parseFloat(String(v || '').replace(/[^0-9.]/g, '')); return isNaN(n) ? null : n; },
  formatAsCurrency: n => n === '' || n == null ? '' : '$' + (+n).toFixed(2),
  suDisplayName: n => n, SU_LEAD_CAPTAIN: 'Lead Captain', UO_X_ICON: '', showToast(){}, saveState(){}, getInitials: () => 'TL',
  fcMoney: n => '$' + n, fcPctFmt: n => n + '%'};
vm.createContext(ctx);
const zr = js('zone-reset.js');
vm.runInContext(zr.slice(zr.indexOf('const fohDayparts'), zr.indexOf('// FOH positions per daypart')), ctx);
vm.runInContext(`
  const ZONE_CHECKLISTS = {'Drinks Zone': ['Wipe counters', 'Restock cups']};
  const FINAL_CHECK_ITEMS = ['Floors swept', 'Trash out'];
  const ALL_ZONE_NAMES = ['Drinks Zone', 'Final Check'];
  const fohLeaderTransitionItems = ['Cash count', 'Walk the line', 'Hand off notes', 'Breaks'];
  let zoneChecklistState = {}, leaderTransitionHistory = {}, numbersData = {}, foodSafetyWalkthroughs = {};
  let leaderRoster = null; let fohRoster = {}, bohRoster = {}, posAssignments = {}, adminShifts = {}, directors = null, wasteDays = [], wasteTarget = 100;
  let storeEvents = []; function eventsOn(){ return []; }
  let peaRows = []; function peaAllRatings(){ return peaRows; }
  function fsTotals(rec){ return rec && rec.complete ? {done: 1, total: 1, complete: true} : {done: 0, total: 1, complete: false}; }
  const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function getWeekDays(offset){ const mon = new Date('2026-10-12T00:00:00'); mon.setDate(mon.getDate() + 7 * (offset || 0));
    return WEEKDAY_NAMES.map((name, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return {weekday: name, date: toLocalISODate(d)}; }); }
`, ctx);
vm.runInContext(grab(zr, 'getZoneItems') + grab(zr, 'getZoneCompletion') + grab(zr, 'getHandoffZoneCompletion'), ctx);
vm.runInContext(js('know-numbers.js'), ctx);
// Today's Leader Transition counts into leaderTransitionHistory.
const lt = js('fohoe-and-safecount.js');
vm.runInContext('let fohLeaderTransitionChecked = {};\n' + grab(zr, 'getZoneDayparts') + grab(lt, 'getLeaderTransitionCompletion')
  + lt.slice(lt.indexOf('const LT_HISTORY_KEEP_DAYS'), lt.indexOf('function getLeaderTransitionOverall')), ctx);
vm.runInContext(js('setup-history.js'), ctx);
const dp = js('daypicker-and-positions.js');
vm.runInContext(dp.slice(dp.indexOf('function parseShiftTimeToMinutes'), dp.indexOf('function parseDaypartTimeToMinutes')), ctx);
// The leader list check (Manage → Settings → Leaders).
{ const sl = js('setup-leaders.js'); vm.runInContext(sl.slice(sl.indexOf('let suLeaderNamesCache'), sl.indexOf("// 'Team Lead' | 'Trainer' | null")), ctx); }
vm.runInContext(js('directors.js'), ctx);
vm.runInContext(js('leader-report.js'), ctx);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(input.cases.map(c => vm.runInContext(`(${c.op})`, ctx)(c))));
