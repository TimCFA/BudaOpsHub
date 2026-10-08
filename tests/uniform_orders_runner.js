// Runs the uniform order form's logic (static/js/uniform-orders.js) on cases
// from tests/test_uniform_orders.py: reads {cases: [{op, ...}]} on stdin.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'uniform-orders.js'), 'utf8');
const ctx = {console, today: '2026-10-08', document: {addEventListener(){}, getElementById(){ return null; }},
  escapeHtml: s => (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]))};
vm.createContext(ctx);
vm.runInContext(`let uniformOrders = []; let uniformCatalog = null;
  const fohRoster = {Monday: [{name: 'Maya Torres'}, {name: 'Noah Bennett'}], Tuesday: [{name: 'Maya Torres'}]};
  const bohRoster = {Monday: [{name: 'Ava Morales'}], Tuesday: []};`, ctx);
vm.runInContext(src, ctx);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(input.cases.map(c => vm.runInContext(`(${c.op})`, ctx)(c))));
