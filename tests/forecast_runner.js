// Runs the Forecast page's model and file-reading code (static/js/forecast.js,
// plus rpParseSales from report-uploads.js) on cases from tests/test_forecast.py:
// reads {cases: [{op, ...}]} on stdin, writes back one result per case.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const js = n => fs.readFileSync(path.join(__dirname, '..', 'static', 'js', n), 'utf8');

// Globals the modules expect from the page.
const ctx = {console, today: '2026-10-04', escapeHtml: s => String(s), duParseTsv: null, dataUploadLog: {}};
vm.createContext(ctx);
// duParseTsv, from data-uploads.js, is all rpParseSales needs.
const du = js('data-uploads.js');
const start = du.indexOf('function duParseTsv');
const end = du.indexOf('function duHourToMin');
vm.runInContext(du.slice(start, end), ctx);
const rp = js('report-uploads.js');
vm.runInContext(rp.slice(rp.indexOf('const rpNum'), rp.indexOf('// Month to date runs from the 1st')), ctx);
vm.runInContext(js('forecast.js'), ctx);

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const out = input.cases.map(c => vm.runInContext(`(${c.op})`, ctx)(c));
process.stdout.write(JSON.stringify(out));
