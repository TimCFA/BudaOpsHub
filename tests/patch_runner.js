// Runs the page's change-based save code (static/js/state-patch.js) on cases
// from tests/test_patch.py: reads {cases: [{base, mine, theirs}]} on stdin,
// writes back the changes and what they make of base and theirs.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'state-patch.js'), 'utf8'));

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const out = input.cases.map(c=>{
  const ops = stateDiff(c.base, c.mine);
  const onBase = stateApplyOps(c.base, ops);
  return {
    ops,
    onBase,
    onBaseTwice: stateApplyOps(onBase, ops),
    onTheirs: stateApplyOps(c.theirs, ops),
    baseUntouched: stateCanon(c.base) === stateCanon(JSON.parse(JSON.stringify(c.base)))
  };
});
process.stdout.write(JSON.stringify(out));
