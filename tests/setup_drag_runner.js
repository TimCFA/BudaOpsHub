// Runs the Set Ups drag move (suMoveSpot in static/js/setups-board.js) on
// cases from tests/test_setup_drag.py: reads {cases: [{assignments, flags,
// from, to}]} on stdin, writes back one {result, assignments, flags} each.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'setups-board.js'), 'utf8');
const body = src.slice(src.indexOf('function suMoveSpot'), src.indexOf('function suDragDrop'));

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const out = input.cases.map(c => {
  const ctx = {posAssignments: {...c.assignments}, posVacancyFlags: {...(c.flags || {})}};
  vm.createContext(ctx);
  vm.runInContext(body, ctx);
  const result = vm.runInContext('suMoveSpot', ctx)(c.from, c.to);
  return {result, assignments: ctx.posAssignments, flags: ctx.posVacancyFlags};
});
process.stdout.write(JSON.stringify(out));
