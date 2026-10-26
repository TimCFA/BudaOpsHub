"""A new saved setting isn't a change until it holds something (Oct 25
2026, #248): callIns started as {} on every phone while the server had no
callIns at all, so a phone that may not save it (Set Ups' section, on a
Team Member's or a signed-out one) held it as unsent forever. stateSections
leaves out a key the server has never had while it's still empty here.

Run: python3 -m unittest discover tests
Runs storage.js's stateSections in node.
"""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUN = r"""
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[1], 'utf8');
const body = src.slice(src.indexOf('const stateEmpty'), src.indexOf('// One section\'s saved form'));
const ctx = {JSON, Object, Array, STATE_SECTIONS: {setups: ['posAssignments', 'callIns', 'posNotes']}, STATE_SECTION_OF: {},
  stateHas: (o, k) => Object.prototype.hasOwnProperty.call(o, k)};
vm.createContext(ctx);
vm.runInContext('let stateBase = {};' + body + '; this.f = (base, snap) => { stateBase = base; return stateSections(snap).setups; };', ctx);
const cases = JSON.parse(process.argv[2]);
process.stdout.write(JSON.stringify(cases.map(([base, snap]) => ctx.f(base, snap))));
"""


def sections(*cases):
    out = subprocess.run(['node', '-e', RUN, os.path.join(ROOT, 'static', 'js', 'storage.js'), json.dumps(cases)],
                         capture_output=True, text=True, check=True)
    return [json.loads(x) for x in json.loads(out.stdout)]


class NewEmptyKeys(unittest.TestCase):
    def test_left_out_until_it_holds_something(self):
        pa = {'k': 'Dana'}
        got = sections(
            [{'setups': {'posAssignments': pa}}, {'posAssignments': pa, 'callIns': {}, 'posNotes': []}],   # new, empty: not a change
            [{'setups': {'posAssignments': pa}}, {'posAssignments': pa, 'callIns': {'2026-10-26': {}}}],    # holds something: sent
            [{'setups': {'posAssignments': pa, 'callIns': {'d': 1}}}, {'posAssignments': pa, 'callIns': {}}],   # emptied on purpose: sent
            [{}, {'posAssignments': pa, 'callIns': {}}])                                                    # nothing loaded yet: as before
        self.assertEqual(got[0], {'posAssignments': pa})
        self.assertIn('callIns', got[1])
        self.assertEqual(got[2]['callIns'], {})
        self.assertEqual(got[3]['callIns'], {})


if __name__ == '__main__':
    unittest.main()
