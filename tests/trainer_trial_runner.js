// Runs the Trainer Trial's logic (static/js/trainer-trial.js, on top of the
// PEA helpers, directors.js, leaders.js and team-pea.js) on cases from
// tests/test_trainer_trial.py: reads {cases: [{op}]} on stdin. "today" is
// Monday Oct 19 2026. Ratings are given in the real peaRatings shape, so the
// decode, strength and tier code is the app's own.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const js = n => fs.readFileSync(path.join(__dirname, '..', 'static', 'js', n), 'utf8');
const grab = (src, name) => src.match(new RegExp('(?:^|\\n)function ' + name + '\\([\\s\\S]*?\\n}\\n'))[0];
const elements = {};
const fakeEl = id => elements[id] = elements[id] || {id, innerHTML: '', value: '', dataset: {}, offsetParent: {}, classList: {add(){}, remove(){}, toggle(){}},
  addEventListener(){}, querySelectorAll(){ return []; }, contains(){ return false; }, getBoundingClientRect(){ return {top: 0}; }};
const ctx = {console, today: '2026-10-19', setTimeout: () => 0, window: {scrollTo(){}, scrollY: 0}, navigator: {},
  document: {addEventListener(){}, getElementById: fakeEl, querySelectorAll(){ return []; }, querySelector(){ return null; }, activeElement: null},
  escapeHtml: s => (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch])),
  toLocalISODate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  suDisplayName: n => n, UO_X_ICON: '', showToast(){}, saveState: async () => {}, getInitials: () => 'TL', confirm: () => true, API_BASE: ''};
vm.createContext(ctx);
const pr = js('pea-ratings.js');
vm.runInContext(pr.slice(pr.indexOf('const PEA_KEEP_DAYS'), pr.indexOf('function normalizePeaRatings')), ctx);
vm.runInContext([grab(pr, 'peaTierFor'), grab(pr, 'peaAllRatings'), grab(pr, 'peaStrengthByPerson'), grab(pr, 'peaWeekStart')].join('\n'), ctx);
vm.runInContext(`
  let directors = null, leaderNotes = {}, leaderRoster = null, peaGoals = null, leaderFocus = {}, teamNotes = {};
  function fcAddDaysSafe(iso, n){ const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return toLocalISODate(d); }
  // pea(date, rater, employee, position, overall)
  function setRatings(list){
    peaRatings = emptyPeaRatings();
    const idx = (arr, v) => { let i = arr.indexOf(v); if(i < 0){ arr.push(v); i = arr.length - 1; } return i; };
    list.forEach(r => peaRatings.rows.push([r.date + 'T' + (r.time || '12:00'), idx(peaRatings.names, r.employee), idx(peaRatings.roles, 'Team Member'), idx(peaRatings.names, r.leader), idx(peaRatings.positions, r.position), ...Array(5).fill(r.overall), r.overall]));
  }
  const pea = (date, leader, employee, position, overall) => ({date, leader, employee, position: position || 'iPOS', overall: overall == null ? 3 : overall});
`, ctx);
vm.runInContext(js('directors.js'), ctx);
vm.runInContext(js('leaders.js'), ctx);
vm.runInContext(js('team-pea.js'), ctx);
vm.runInContext(js('trainer-trial.js'), ctx);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(input.cases.map(c => vm.runInContext(`(${c.op})`, ctx)(c))));
