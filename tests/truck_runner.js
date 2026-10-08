// Runs truck.js and the roster import's parser (weekly-roster-import.js) on
// cases from tests/test_truck.py: reads {cases: [{op, ...}]} on stdin.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const js = f => fs.readFileSync(path.join(__dirname, '..', 'static', 'js', f), 'utf8');
const el = () => ({addEventListener(){}, classList: {add(){}, remove(){}, toggle(){}}, style: {}});
const ctx = {console, today: '2026-10-06', escapeHtml: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
  esHtml: () => '', esLine: () => '', document: {addEventListener(){}, getElementById(){ return el(); }},
  toLocalISODate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`};
vm.createContext(ctx);
vm.runInContext('let truckShifts = {}; let fohRoster = {}; let bohRoster = {};', ctx);
vm.runInContext(js('daypicker-and-positions.js').match(/function parseShiftTimeToMinutes[\s\S]*?\n}\n/)[0], ctx);
vm.runInContext(js('truck.js'), ctx);
const imp = js('weekly-roster-import.js');
vm.runInContext(imp.slice(imp.indexOf('function parseCsv'), imp.indexOf('// "Weekly_Roster_')), ctx);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(input.cases.map(c => vm.runInContext(`(${c.op})`, ctx)(c))));
