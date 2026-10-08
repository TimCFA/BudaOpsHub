// Runs the calendar reader's text logic (static/js/events-import.js) on
// cases from tests/test_events_import.py: reads {cases: [{op, ...}]} on stdin.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'events-import.js'), 'utf8');
const ctx = {console, document: {addEventListener(){}, getElementById(){ return null; }},
  toLocalISODate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(input.cases.map(c => vm.runInContext(`(${c.op})`, ctx)(c))));
