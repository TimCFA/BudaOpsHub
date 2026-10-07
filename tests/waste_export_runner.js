// Runs the waste export's ranges and labels (static/js/waste-export.js) on
// cases from tests/test_waste_export.py: reads {cases: [{op}]} on stdin.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const js = f => fs.readFileSync(path.join(__dirname, '..', 'static', 'js', f), 'utf8');
const ctx = {console, today: '2026-10-07', escapeHtml: s => String(s), esHtml: () => '', document: {addEventListener(){}, getElementById(){ return null; }},
  toLocalISODate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`};
vm.createContext(ctx);
vm.runInContext(js('storage.js').match(/function isoAddDays[\s\S]*?\n}\n/)[0], ctx);
vm.runInContext(js('waste-dash.js').match(/function wdRange[\s\S]*?\n}\n/)[0], ctx);
vm.runInContext(js('waste-export.js'), ctx);
vm.runInContext(`entries = []; wasteEntryDay = e => e.day; wdEntriesIn = (r, loc) => entries.filter(e => e.day >= r[0] && e.day <= r[1] && (loc === 'all' || e.section === loc));`, ctx);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(input.cases.map(c => vm.runInContext(`(${c.op})`, ctx)(c))));
