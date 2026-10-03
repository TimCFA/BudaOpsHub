"""All green = Crushing It in every position someone has been rated in on
their side (the Levelset rule; static/js/setup-develop.js, all-green.js).
A position never rated doesn't count against anyone.

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
const el = {addEventListener(){}, innerHTML: '', style: {}};
const ctx = {
  PEA_POSITION_GROUPS: [
    {key: 'foh', positions: ['iPOS', 'Bagging', 'Drinks 1/3', 'Drinks 2', 'OMD', 'Host', 'Runner']},
    {key: 'boh', positions: ['Breader', 'Primary', 'Secondary', 'Machines', 'Fries', 'Prep']}],
  document: {getElementById(){ return el; }, addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; }},
  window: {}, escapeHtml(s){ return String(s); },
};
vm.createContext(ctx);
for(const f of process.argv.slice(1)) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx);
const cell = (avg) => ({avg, n: 1, total: 1, last: '2026-09-01', tier: {key: avg >= 2.75 ? 'crushing' : avg >= 1.75 ? 'rise' : 'notyet', label: 'x'}});
const person = (scores) => ({role: 'Team Member', lastAt: '2026-09-01', positions: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, cell(v)]))});
const amber = person({iPOS: 2.84, Host: 2.8});                       // green in both rated positions, 5 never rated
const kyla = person({iPOS: 3, Bagging: 2.48, 'Drinks 1/3': 3, 'Drinks 2': 3, OMD: 3, Host: 2.68, Runner: 3});
const full = person({iPOS: 3, Bagging: 3, 'Drinks 1/3': 3, 'Drinks 2': 3, OMD: 3, Host: 3, Runner: 3});
const none = person({Breader: 3});                                   // BOH only: nothing rated on FOH
const out = vm.runInContext(`({
  amber: suCertification(amber, 'foh'), kyla: suCertification(kyla, 'foh'), full: suCertification(full, 'foh'), none: suCertification(none, 'foh'),
  texts: [suCertText(suCertification(amber, 'foh')), suCertText(suCertification(kyla, 'foh')), suCertText(suCertification(none, 'foh'))],
  notGreen: [agNotGreenText(amber, 'foh'), agNotGreenText(kyla, 'foh'), agNotGreenText(none, 'foh'), agNotGreenText(full, 'foh')],
  chips: agMissingChips(kyla, 'foh'),
})`, Object.assign(ctx, {amber, kyla, full, none}));
process.stdout.write(JSON.stringify(out));
"""


@unittest.skipUnless(NODE, 'Node.js not installed')
class AllGreenRuleTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        files = [os.path.join(ROOT, 'static', 'js', f) for f in ('setup-develop.js', 'all-green.js')]
        done = subprocess.run([NODE, '-e', RUNNER, *files], capture_output=True, text=True, check=True)
        cls.data = json.loads(done.stdout)

    def test_green_in_every_rated_position_is_all_green(self):
        a = self.data['amber']
        self.assertTrue(a['allGreen'])
        self.assertEqual((a['green'], a['rated'], a['total']), (2, 2, 7))
        self.assertEqual(a['missing'], [])
        self.assertEqual(a['unrated'], ['Bagging', 'Drinks 1/3', 'Drinks 2', 'OMD', 'Runner'])

    def test_rated_below_green_is_not(self):
        k = self.data['kyla']
        self.assertFalse(k['allGreen'])
        self.assertEqual((k['green'], k['rated']), (5, 7))
        self.assertEqual(k['missing'], ['Bagging', 'Host'])
        self.assertEqual(k['unrated'], [])
        self.assertTrue(self.data['full']['allGreen'])

    def test_nothing_rated_is_not_all_green(self):
        n = self.data['none']
        self.assertFalse(n['allGreen'])
        self.assertEqual((n['green'], n['rated'], len(n['unrated'])), (0, 0, 7))

    def test_wording(self):
        self.assertEqual(self.data['texts'], ['all green · 2/7 rated', '5/7 rated green', 'no position ratings yet'])
        self.assertEqual(self.data['notGreen'], [
            'not rated: Bagging, Drinks 1/3, Drinks 2, OMD, Runner',
            'Bagging 2.48, Host 2.68',
            'no position ratings yet',
            ''])
        self.assertIn('Bagging <b>2.48</b>', self.data['chips'])
        self.assertNotIn('not rated', self.data['chips'])


if __name__ == '__main__':
    unittest.main()
