// Runs the Team view's logic (static/js/team-pea.js, on top of directors.js,
// leaders.js and the PEA helpers) on cases from tests/test_team_pea.py:
// reads {cases: [{op}]} on stdin. "today" is Monday Oct 12 2026, so the
// quarter is Q4 2026. Ratings are given as the real peaRatings shape, so the
// decode, strength, tier, trend and certification code is the app's own.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const js = n => fs.readFileSync(path.join(__dirname, '..', 'static', 'js', n), 'utf8');
const grab = (src, name) => src.match(new RegExp('(?:^|\\n)function ' + name + '\\([\\s\\S]*?\\n}\\n'))[0];
const ctx = {console, today: '2026-10-12', document: {addEventListener(){}, getElementById(){ return null; }}, window: {scrollTo(){}}, navigator: {},
  escapeHtml: s => (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch])),
  toLocalISODate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  suDisplayName: n => n, SU_LEAD_CAPTAIN: 'Lead Captain', UO_X_ICON: '', showToast(){}, saveState(){}, getInitials: () => 'TL', confirm: () => true,
  fcMoney: n => '$' + Math.round(n).toLocaleString('en-US'), fcPctFmt: n => (n > 0 ? '+' : '') + n.toFixed(1) + '%'};
vm.createContext(ctx);
const dp = js('daypicker-and-positions.js');
vm.runInContext(dp.slice(dp.indexOf('function parseShiftTimeToMinutes'), dp.indexOf('function parseDaypartTimeToMinutes')), ctx);
const pr = js('pea-ratings.js'), pc = js('pea-coach.js'), sd = js('setup-develop.js');
vm.runInContext(pr.slice(pr.indexOf('const PEA_KEEP_DAYS'), pr.indexOf('function normalizePeaRatings')), ctx);
vm.runInContext([grab(pr, 'peaTierFor'), grab(pr, 'peaAllRatings'), grab(pr, 'peaStrengthByPerson'), grab(pr, 'peaWeekStart'), grab(pr, 'peaFormatDate')].join('\n'), ctx);
vm.runInContext(pc.slice(pc.indexOf('const PEA_TODO_MAX'), pc.indexOf('function peaCoachText')) + pc.slice(pc.indexOf('const PEA_TREND_STEP'), pc.indexOf('function peaTrendMark')), ctx);
vm.runInContext(grab(sd, 'suCertification') + grab(sd, 'suCertText'), ctx);
vm.runInContext(`
  const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function getWeekDays(offset){ const mon = new Date('2026-10-12T00:00:00'); mon.setDate(mon.getDate() + 7 * (offset || 0));
    return WEEKDAY_NAMES.map((name, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return {weekday: name, date: toLocalISODate(d)}; }); }
  const evMinutes = t => { const m = String(t || '').match(/^(\\d{1,2}):(\\d{2})$/); return m ? +m[1] * 60 + +m[2] : null; };
  let storeEvents = []; function eventsOn(iso){ return storeEvents.filter(ev => iso >= ev.date && iso <= (ev.end || ev.date)); }
  let fohRoster = {}, bohRoster = {}, posAssignments = {}, adminShifts = {}, directors = null, leaderNotes = {}, wasteDays = [], wasteTarget = 100, uniformOrders = [], salesHistory = {}, forecastLog = {};
  let leaderRoster = null, peaGoals = null, leaderFocus = {}, teamNotes = {};
  let listedLeaders = [];
  function leaderListed(name){ return listedLeaders.some(n => n.toLowerCase() === String(name).toLowerCase()); }
  // Ratings in the app's own shape. pea(date, rater, employee, position, overall, role, criteria).
  function setRatings(list){
    peaRatings = emptyPeaRatings();
    const idx = (arr, v) => { let i = arr.indexOf(v); if(i < 0){ arr.push(v); i = arr.length - 1; } return i; };
    list.forEach(r => peaRatings.rows.push([r.date + 'T10:00', idx(peaRatings.names, r.employee), idx(peaRatings.roles, r.role || 'Team Member'), r.leader ? idx(peaRatings.names, r.leader) : -1, idx(peaRatings.positions, r.position), ...r.criteria, r.overall]));
  }
  const pea = (date, leader, employee, position, overall, role, criteria) => ({date, leader, employee, position: position || 'iPOS', overall: overall == null ? 3 : overall, role: role || 'Team Member', criteria: criteria || Array(5).fill(overall == null ? 3 : overall)});
`, ctx);
vm.runInContext(js('directors.js'), ctx);
vm.runInContext(js('leaders.js'), ctx);
vm.runInContext(js('team-pea.js'), ctx);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(input.cases.map(c => vm.runInContext(`(${c.op})`, ctx)(c))));
