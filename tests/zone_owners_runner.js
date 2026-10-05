// Runs the zone reset owner logic (static/js/zone-reset.js) on cases from
// tests/test_zone_owners.py: reads {cases: [{op, ...}]} on stdin, writes back
// one result per case.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const js = n => fs.readFileSync(path.join(__dirname, '..', 'static', 'js', n), 'utf8');

const ctx = {console, posAssignments: {}, SU_LEAD_CAPTAIN: 'Lead Captain',
  suSplitNames: v => String(v || '').split('/').map(n => n.trim()).filter(Boolean)};
vm.createContext(ctx);
const su = js('state-and-utils.js');
vm.runInContext(su.slice(su.indexOf('const ZONE_CHECKLISTS'), su.indexOf('// One line icon per zone')), ctx);
vm.runInContext("const ALL_ZONE_NAMES = Object.keys(ZONE_CHECKLISTS).concat(['Final Check']);", ctx);
const zr = js('zone-reset.js');
// The dayparts and position lists, the handoffs, then the owner logic.
vm.runInContext(zr.slice(zr.indexOf('const fohDayparts'), zr.indexOf('// leadFrom:')), ctx);
vm.runInContext(zr.slice(zr.indexOf('const zoneResetDayparts'), zr.indexOf('const fohPositions')), ctx);
vm.runInContext(zr.slice(zr.indexOf('const fohPositions'), zr.indexOf('// ----- Zone reset owners')), ctx);
vm.runInContext(zr.slice(zr.indexOf('// ----- Zone reset owners'), zr.indexOf('// ----- end zone reset owners')), ctx);

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const out = input.cases.map(c => vm.runInContext(`(${c.op})`, ctx)(c));
process.stdout.write(JSON.stringify(out));
