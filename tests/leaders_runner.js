// Runs the Leaders view's logic (static/js/leaders.js, on top of
// directors.js) on cases from tests/test_leaders.py: reads {cases: [{op}]}
// on stdin. "today" is Monday Oct 12 2026, so the quarter is Q4 2026.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const js = n => fs.readFileSync(path.join(__dirname, '..', 'static', 'js', n), 'utf8');
const ctx = {console, today: '2026-10-12', document: {addEventListener(){}, getElementById(){ return null; }}, window: {scrollTo(){}}, navigator: {},
  escapeHtml: s => (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch])),
  toLocalISODate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  suDisplayName: n => n, SU_LEAD_CAPTAIN: 'Lead Captain', UO_X_ICON: '', showToast(){}, saveState(){}, getInitials: () => 'TL', confirm: () => true,
  fcMoney: n => '$' + Math.round(n).toLocaleString('en-US'), fcPctFmt: n => (n > 0 ? '+' : '') + n.toFixed(1) + '%'};
vm.createContext(ctx);
const dp = js('daypicker-and-positions.js');
vm.runInContext(dp.slice(dp.indexOf('function parseShiftTimeToMinutes'), dp.indexOf('function parseDaypartTimeToMinutes')), ctx);
vm.runInContext(`
  function peaWeekStart(iso){ const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toLocalISODate(d); }
  const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function getWeekDays(offset){ const mon = new Date('2026-10-12T00:00:00'); mon.setDate(mon.getDate() + 7 * (offset || 0));
    return WEEKDAY_NAMES.map((name, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return {weekday: name, date: toLocalISODate(d)}; }); }
  const evMinutes = t => { const m = String(t || '').match(/^(\\d{1,2}):(\\d{2})$/); return m ? +m[1] * 60 + +m[2] : null; };
  let storeEvents = []; function eventsOn(iso){ return storeEvents.filter(ev => iso >= ev.date && iso <= (ev.end || ev.date)); }
  let fohRoster = {}, bohRoster = {}, posAssignments = {}, adminShifts = {}, directors = null, leaderNotes = {}, wasteDays = [], wasteTarget = 100, uniformOrders = [], salesHistory = {}, forecastLog = {};
  let leaderRoster = null, peaGoals = null, leaderFocus = {};
  let peaRows = []; function peaAllRatings(){ return peaRows; }
  // One PEA: {date, leader, employee, position, overall}.
  const pea = (date, leader, employee, position, overall) => ({at: date + 'T10:00', date, leader, employee, position: position || 'iPOS', overall: overall == null ? 3 : overall, criteria: [3, 3, 3, 3, 3], role: 'Team Member'});
`, ctx);
vm.runInContext(js('directors.js'), ctx);
vm.runInContext(js('leaders.js'), ctx);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(input.cases.map(c => vm.runInContext(`(${c.op})`, ctx)(c))));
