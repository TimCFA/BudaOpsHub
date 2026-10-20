// Runs Home's Right Now card logic (static/js/right-now.js) on cases from
// tests/test_right_now.py: reads {cases: [{op, at, ...}]} on stdin. `at` is
// the store's clock for the case (America/Chicago). The real dayparts,
// positions, Spanish and shift-time helpers are loaded; the rest of the page
// is stubbed with the shapes the hub uses. Names are made up.
process.env.TZ = 'America/Chicago';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const js = n => fs.readFileSync(path.join(__dirname, '..', 'static', 'js', n), 'utf8');
const RealDate = Date;
const fixedDate = iso => { const T = new RealDate(iso).getTime(); return class extends RealDate { constructor(...a){ if(a.length) super(...a); else super(T); } static now(){ return T; } }; };
const el = {addEventListener(){}, classList: {contains: () => false}, className: '', innerHTML: ''};
const ctx = {console, setInterval(){}, document: {getElementById: () => el, addEventListener(){}, visibilityState: 'visible'},
  escapeHtml: s => (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch])),
  toLocalISODate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  suDisplayName: n => n.split(' ')[0], SU_LEAD_CAPTAIN: 'Lead Captain'};
vm.createContext(ctx);
vm.runInContext(js('spanish.js'), ctx);
const zr = js('zone-reset.js');
vm.runInContext(zr.slice(zr.indexOf('const fohDayparts'), zr.indexOf('// leadFrom:')), ctx);
vm.runInContext(zr.slice(zr.indexOf('const fohPositions'), zr.indexOf('// ----- Zone reset owners')), ctx);
const dp = js('daypicker-and-positions.js');
vm.runInContext(dp.slice(dp.indexOf('function parseShiftTimeToMinutes'), dp.indexOf('function parseDaypartTimeToMinutes')), ctx);
vm.runInContext(dp.slice(dp.indexOf('function parseDaypartTimeToMinutes'), dp.indexOf('// "5:30a - 1:30p"')), ctx);
const se = js('setup-evaluate.js');
vm.runInContext(se.match(/function suSplitNames\([\s\S]*?\n}\n/)[0], ctx);
vm.runInContext(`
  function suDaypartsFor(side){ return side === 'foh' ? fohDayparts : bohDayparts; }
  let today = '', fohRoster = {}, bohRoster = {}, truckShifts = {}, adminShifts = {}, posAssignments = {}, completedBreaks = {}, breakCountdowns = {}, wasteTarget = 100, wasteFoh = 0, wasteBoh = 0;
  let acUser = null, launchManager = false, breaks = {foh: [], boh: []}, gaps = {}, handoff = null, fsDone = null;
  function serverNow(){ return Date.now(); }
  function breakKeyFor(name, day, side){ return side + '||' + day + '||' + name; }
  function breakPlanFor(side){ return {breaks: breaks[side]}; }
  function breakFor(side, date, name){ return breaks[side].find(b => b.name === name) || null; }
  function wasteTodayTotal(side){ return side === 'foh' ? wasteFoh : wasteBoh; }
  function rosterOverlaps(p, s, e){ return parseShiftTimeToMinutes(p.start) < e && parseShiftTimeToMinutes(p.end) > s; }
  // Set Ups' daypart model, from the case: gaps['foh|Dinner'] = {open: [slot], unplaced: [name], filled: n}.
  function suDaypartModel(side, date, dp){
    const g = gaps[side + '|' + dp.name.split(' (')[0]] || {open: [], unplaced: [], filled: 0};
    return {tiles: g.open.map((slot, i) => ({slot, rank: i + 1, names: [], needed: true})), unplaced: g.unplaced, filled: g.filled};
  }
  function zrCurrentHandoff(){ return handoff ? handoff.name : ''; }
  const zoneResetDayparts = [{name: 'Dinner to Late Night (7:00pm - 8:00pm)', time: '19:00'}];
  const ALL_ZONE_NAMES = ['Dining Room', 'Restrooms'];
  function getZoneCompletion(date, h, z){ return (handoff && handoff.done[z]) || {checked: 0, total: 4}; }
  function zrZoneOwners(date, h, z){ return {all: (handoff && handoff.owners[z]) || []}; }
  function zrHandoffParts(name){ return {title: 'Dinner → Late Night'}; }
  function fsRecord(){ return null; }
  function fsTotals(){ return fsDone || {done: 0, total: 84}; }
`, ctx);
vm.runInContext(js('right-now.js'), ctx);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(input.cases.map(c => {
  ctx.Date = fixedDate(c.at || '2026-10-19T17:10:00-05:00');
  vm.runInContext(`today = toLocalISODate(new Date()); fohRoster = {}; bohRoster = {}; truckShifts = {}; adminShifts = {}; rnRosterOpen = false; posAssignments = {}; completedBreaks = {}; breakCountdowns = {};
    acUser = null; launchManager = false; breaks = {foh: [], boh: []}; gaps = {}; handoff = null; wasteFoh = 0; wasteBoh = 0;`, ctx);
  return vm.runInContext(`(${c.op})`, ctx)(c);
})));
