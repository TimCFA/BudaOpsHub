"""Name Matching (Manage): only real people to match (Tim, Oct 27 2026). Names
typed into Set Ups by hand, before Add Team Member picked from the team,
kept showing up as HotSchedules names to link to Levelset.

Run: python3 -m unittest discover tests   (needs Node.js; skipped without it)
"""
import json
import os
import shutil
import subprocess
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')
NODE = shutil.which('node')

RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const js = fs.readFileSync(process.argv[1], 'utf8');
const pick = (from, to) => js.slice(js.indexOf(from), js.indexOf(to, js.indexOf(from)));
const ctx = JSON.parse(fs.readFileSync(0, 'utf8'));
ctx.isSetupDateKey = d => /^\d{4}-\d{2}-\d{2}$/.test(d);
ctx.suSplitNames = v => String(v || '').split('/').map(s => s.trim()).filter(Boolean);
ctx.teamHasLeft = n => (ctx.left || []).includes(n);
vm.createContext(ctx);
vm.runInContext(pick('function peaRosterKey', '\n}\n') + '\n}\n' + pick('function peaRosterNamesSeen', '\n}\n') + '\n}\n', ctx);
process.stdout.write(JSON.stringify(vm.runInContext('peaRosterNamesSeen()', ctx).map(r => r.name).sort()));
"""


def names(**state):
    base = {'fohRoster': {}, 'bohRoster': {}, 'posAssignments': {}, 'setupHistory': {'days': {}, 'names': []}, 'tmPinNames': None}
    base.update(state)
    done = subprocess.run([NODE, '-e', RUNNER, os.path.join(ROOT, 'static', 'js', 'pea-ratings.js')],
                          input=json.dumps(base), capture_output=True, text=True, check=True)
    return json.loads(done.stdout)


@unittest.skipUnless(NODE, 'Node.js not installed')
class NameMatchPeople(unittest.TestCase):
    def test_typed_names_dont_count(self):
        got = names(
            fohRoster={'2026-10-26': [{'name': 'Jordan Testcase'}, {'name': 'jord', 'source': 'manual'}]},
            posAssignments={'foh||2026-10-26||Lunch||iPOS 1': 'Jordan Testcase/Typo Person'},
            setupHistory={'days': {'2026-05-01': [[0, 0], [1, 1]]}, 'names': ['Old Typed', 'Jordan Testcase']})
        self.assertEqual(got, ['Jordan Testcase'])

    def test_a_pin_list_name_added_by_hand_counts(self):
        got = names(
            fohRoster={'2026-10-26': [{'name': 'Riley Sample', 'source': 'manual'}, {'name': 'Free Typed', 'source': 'manual'}]},
            tmPinNames=[{'name': 'Riley Sample', 'role': 'member'}, {'name': 'Never Scheduled', 'role': 'admin'}])
        self.assertEqual(got, ['Riley Sample'])                        # the PIN list alone doesn't add people never on Set Ups

    def test_who_has_left_drops_out(self):
        got = names(fohRoster={'2026-10-26': [{'name': 'Jordan Testcase'}, {'name': 'Casey Example'}]}, left=['Casey Example'])
        self.assertEqual(got, ['Jordan Testcase'])


if __name__ == '__main__':
    unittest.main()
