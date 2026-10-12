"""Who counts as a Team Lead on Set Ups (setup-leaders.js): the leader list
in Manage → Settings → Leaders, a HotSchedules Team Leader shift, or a
Levelset role of Team Lead. Names on the list are as Levelset spells them,
so they're matched like PEAs (name links, nicknames, "Last, First").

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
const js = f => fs.readFileSync(process.argv[1] + '/' + f, 'utf8');
const grab = (src, name) => src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n}\\n'))[0];
const ctx = {};
vm.createContext(ctx);
const sl = js('setup-leaders.js'), pea = js('pea-ratings.js');
vm.runInContext(`let leaderRoster = null;
  let fohRoster = {'2026-10-13': [{name: 'Aurora Diaz', start: '6:00a', end: '2:00p'}, {name: 'Ben Cole', start: '6:00a', end: '2:00p', leader: true}, {name: 'Cy Park', start: '6:00a', end: '2:00p'}]}; let bohRoster = {};`, ctx);
// The real name matching (nicknames, "Last, First", name links).
vm.runInContext(pea.slice(pea.indexOf('// ----- Matching Set Ups'), pea.indexOf('// ----- Name Matching card')), ctx);
vm.runInContext(grab(sl, 'suRosterEntryFor') + grab(sl, 'leaderListed') + grab(sl, 'suLeaderRole'), ctx);
const out = vm.runInContext(`(() => {
  const role = n => suLeaderRole('foh', '2026-10-13', n, {});
  const before = ['Aurora Diaz', 'Ben Cole', 'Cy Park'].map(role);
  leaderRoster = [{name: 'Diaz, Aurora', roles: []}];
  const after = ['Aurora Diaz', 'Ben Cole', 'Cy Park'].map(role);
  peaNameAliases = {[peaRosterKey('Cy Park')]: 'Cyrus Park'}; peaNameMatchCache.clear();
  leaderRoster.push({name: 'Cyrus Park', roles: []});
  const linked = role('Cy Park');
  return {before, after, linked};
})()`, ctx);
process.stdout.write(JSON.stringify(out));
"""


@unittest.skipUnless(NODE, 'Node.js not installed')
class LeaderListTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        done = subprocess.run([NODE, '-e', RUNNER, os.path.join(ROOT, 'static', 'js')], capture_output=True, text=True, check=True)
        cls.d = json.loads(done.stdout)

    def test_not_a_leader_until_listed(self):
        self.assertEqual(self.d['before'], [None, 'Team Lead', None])

    def test_listed_as_levelset_spells_it(self):
        # "Diaz, Aurora" on the list makes the roster's Aurora Diaz a Team Lead.
        self.assertEqual(self.d['after'], ['Team Lead', 'Team Lead', None])

    def test_name_link_used(self):
        self.assertEqual(self.d['linked'], 'Team Lead')


if __name__ == '__main__':
    unittest.main()
