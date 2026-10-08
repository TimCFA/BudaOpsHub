// Runs the Forecast page's model and file-reading code (static/js/forecast.js,
// plus the sales and speed-of-service readers from report-uploads.js) on cases from tests/test_forecast.py:
// reads {cases: [{op, ...}]} on stdin, writes back one result per case.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const js = n => fs.readFileSync(path.join(__dirname, '..', 'static', 'js', n), 'utf8');

// Globals the modules expect from the page.
const ctx = {console, today: '2026-10-04', escapeHtml: s => String(s), duParseTsv: null, document: {addEventListener(){}, getElementById(){ return null; }}, dataUploadLog: {}, numbersData: {},
  parseMoney: v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n; },
  formatAsCurrency: n => n === '' || n == null ? '' : (+n).toLocaleString('en-US', {style: 'currency', currency: 'USD'})};
vm.createContext(ctx);
// duParseTsv and the date helpers, from data-uploads.js, are all the
// report readers need.
const du = js('data-uploads.js');
vm.runInContext(du.slice(du.indexOf('function duStartOfDay'), du.indexOf('// The current period for a frequency')), ctx);
vm.runInContext(du.slice(du.indexOf('function duParseTsv'), du.indexOf('function duHourToMin')), ctx);
// The dayparts (zone-reset.js) and the four Know the Numbers dayparts.
const zr = js('zone-reset.js');
vm.runInContext(zr.slice(zr.indexOf('const fohDayparts'), zr.indexOf('// leadFrom:')), ctx);
vm.runInContext(js('know-numbers.js'), ctx);
const rp = js('report-uploads.js');
vm.runInContext(rp.slice(rp.indexOf('const rpNum'), rp.indexOf('// ----- Ops Hub PDFs')), ctx);
vm.runInContext(js('forecast.js'), ctx);

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const out = input.cases.map(c => vm.runInContext(`(${c.op})`, ctx)(c));
process.stdout.write(JSON.stringify(out));
