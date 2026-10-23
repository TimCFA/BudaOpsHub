"""Manage → Directors: one team list (Tim, Oct 23 2026) in place of the
Directors and Leaders lists: the directors and the Managing Partner, then
everyone on the clock-in PIN list with their role (which is their sign-in
role), and each Team Lead's focus. The hub's leader list follows the Team
Lead role; where they disagree, one tap makes them match. The PEA material
moved to its own Manage → Levelset section.

Run: python3 -m unittest discover tests
Names are made up.
"""
import json
import os
import re
import subprocess
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[1] + '/static/js/team-list.js', 'utf8');
const ctx = {document: {addEventListener(){}}, dirList: () => ctx.directors,
  directors: [{name: 'Dee Rector', title: 'Director'}, {name: 'Pat Partner', title: 'Managing Partner'}],
  hcData: {team: [{name: 'Ana Lead', role: 'lead'}, {name: 'Ben Member', role: 'member'}, {name: 'Cy Trainer', role: 'trainer'},
                  {name: 'Dee Rector', role: 'admin'}, {name: 'Eve Admin', role: 'admin'}, {name: 'Fay New Lead', role: 'lead'}]},
  leaderRoster: [{name: 'Ana Lead', roles: ['Stewardship']}, {name: 'Ben Member', roles: []}, {name: 'Gus Levelset', roles: ['Talent Leader']}]};
vm.createContext(ctx);
vm.runInContext(src, ctx);
vm.runInContext(`
  const p = tlPeople();
  const m = tlMismatch(p.rows);
  globalThis.out = {loaded: p.loaded, rows: p.rows.map(r => [r.kind, r.name, r.role]),
    missing: m.missing.map(r => r.name), extra: m.extra.map(r => r.name)};
`, ctx);
process.stdout.write(JSON.stringify(ctx.out));
"""


class TeamList(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = json.loads(subprocess.run(['node', '-e', RUNNER, ROOT], capture_output=True, text=True, check=True).stdout)

    def test_everyone_once_in_role_order(self):
        self.assertEqual(self.d['rows'], [
            ['director', 'Dee Rector', 'director'],          # a director on the PIN list too shows once, as a director
            ['director', 'Pat Partner', 'mp'],
            ['pin', 'Eve Admin', 'admin'],
            ['pin', 'Ana Lead', 'lead'],
            ['pin', 'Fay New Lead', 'lead'],
            ['leader', 'Gus Levelset', 'lead'],               # on the leader list, not the PIN list: kept, marked
            ['pin', 'Cy Trainer', 'trainer'],
            ['pin', 'Ben Member', 'member']])

    def test_where_the_leader_list_and_the_roles_disagree(self):
        self.assertEqual(self.d['missing'], ['Fay New Lead'])
        self.assertEqual(self.d['extra'], ['Ben Member'])


class Wiring(unittest.TestCase):
    PAGE = read('cfa-buda-ops-hub-complete.html')

    def test_one_list_in_directors_the_pea_material_in_levelset(self):
        directors = self.PAGE[self.PAGE.index('data-manage-tab="directors"'):self.PAGE.index('data-manage-tab="levelset"')]
        levelset = self.PAGE[self.PAGE.index('data-manage-tab="levelset"'):self.PAGE.index('data-manage-tab="uploads"')]
        self.assertEqual(re.findall(r'<h3>([^<]+)</h3>', directors), ['Our team'])
        self.assertEqual(re.findall(r'<h3>([^<]+)</h3>', levelset), ['PEA goals', 'Saved PEA Ratings', 'All-Green Tracker', 'Coverage Check',
                                                                     'Position Strength Map', 'Name Matching (HotSchedules ↔ Levelset)'])
        self.assertNotIn('directorsManageRoot', self.PAGE)
        self.assertNotIn('leadersManageRoot', self.PAGE)

    def test_a_role_saves_to_the_pin_list_and_the_leader_list(self):
        js = read('static', 'js', 'team-list.js')
        self.assertIn("fetch(`${API_BASE}/api/team/role`", js)
        self.assertIn("if(role === 'lead' && !entry){ ldEnsureOwn(); leaderRoster.push({name: r.name, roles: []}); tlAfterLeaders(); }", js)
        self.assertIn("else if(role !== 'lead' && entry){ leaderRoster = tlLeaders().filter(x => x !== entry); tlAfterLeaders(); }", js)


if __name__ == '__main__':
    unittest.main()
