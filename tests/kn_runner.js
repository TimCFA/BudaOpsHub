// Runs Manage → Numbers' actuals calendar (static/js/know-numbers.js) on
// cases from tests/test_kn_actuals.py: reads {cases: [{op, ...}]} on stdin.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const js = n => fs.readFileSync(path.join(__dirname, '..', 'static', 'js', n), 'utf8');
const ctx = {console, today: '2026-10-08', document: {addEventListener(){}, getElementById(){ return null; }},
  numbersData: {}, numbersHistory: {}, lastUpdated: {},
  escapeHtml: s => (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch])),
  parseMoney: v => { const n = parseFloat(String(v || '').replace(/[^0-9.]/g, '')); return isNaN(n) ? null : n; },
  formatAsCurrency: n => n === '' || n == null ? '' : (+String(n).replace(/[^0-9.]/g, '')).toLocaleString('en-US', {style: 'currency', currency: 'USD'}),
  toLocalISODate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`};
vm.createContext(ctx);
const zr = js('zone-reset.js');
vm.runInContext(zr.slice(zr.indexOf('const fohDayparts'), zr.indexOf('// leadFrom:')), ctx);
vm.runInContext(js('know-numbers.js'), ctx);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(input.cases.map(c => vm.runInContext(`(${c.op})`, ctx)(c))));
