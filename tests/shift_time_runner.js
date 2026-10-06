// Runs Set Ups' hand-typed shift times (static/js/shift-time.js) on cases
// from tests/test_shift_time.py: reads {cases: [[start, end], ...]} on stdin.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'shift-time.js'), 'utf8');
const ctx = {console};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(input.cases.map(([s, e]) => {
  const r = ctx.shiftTimesRead(s, e);
  return [r.start, r.end, r.error || null];
})));
