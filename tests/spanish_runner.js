// Loads the Spanish glossary (static/js/spanish.js) with the waste catalog
// and the food safety checklist, and reports what tests/test_spanish.py
// checks: the glossary's phrases, the BOH stations and dayparts in Spanish,
// and the Spanish already carried by waste items and food safety checks.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const js = n => fs.readFileSync(path.join(__dirname, '..', 'static', 'js', n), 'utf8');

const ctx = {console, escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]))};
vm.createContext(ctx);
vm.runInContext(js('spanish.js'), ctx);
const zr = js('zone-reset.js');
vm.runInContext(zr.slice(zr.indexOf('const fohDayparts'), zr.indexOf('// leadFrom:')), ctx);
vm.runInContext(zr.slice(zr.indexOf('const fohPositions'), zr.indexOf('// ----- Zone reset owners')), ctx);
const fsjs = js('food-safety.js');
vm.runInContext(fsjs.slice(fsjs.indexOf('const FS_HANDWASH'), fsjs.indexOf('const FS_TEMPS')), ctx);

const out = vm.runInContext(`({
  keys: Object.keys(ES),
  // every phrase, with sample arguments for the ones that take a number
  rendered: Object.fromEntries(Object.keys(ES).map(k => [k, esText(k, 2, 'X', 3, 'Y')])),
  stations: [...new Set(Object.values(bohPositions).flat())].map(s => [s, esPlace(s)]),
  fohStations: [...new Set(Object.values(fohPositions).flat())].map(s => [s, esPlace(s)]),
  dayparts: [...fohDayparts, ...bohDayparts].map(d => [d.name, esDaypart(d.name)]),
  weekdays: ['Monday', 'Saturday', 'Sat'].map(d => [esWeekday(d), esWeekday(d, true)]),
  html: [esHtml('Refresh'), esLine('Refresh'), esHtml('No such phrase'), esLine('N left', 1)],
  fsSections: FS_SECTIONS.map(s => ({name: s.name, es: s.es, missing: s.items.filter(i => !i.es).map(i => i.id)})),
})`, ctx);
process.stdout.write(JSON.stringify(out));
