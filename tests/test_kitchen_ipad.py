"""The kitchen iPad (Tim, Oct 23 2026): a signed-out iPad switches its Right
Now card between Front and Back, remembered on the iPad; the Back card is
the kitchen's, in Spanish too: what's still to prep, the breaks left (the
morning shifts' until 2 PM, then the afternoon's), Food Safety, and the
kitchen's waste with its most-wasted item. Set Ups and Waste open on the
iPad's side.

Run: python3 -m unittest discover tests
Names are made up.
"""
import json
import os
import subprocess
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[1] + '/static/js/right-now.js', 'utf8');
const fn = name => src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n}\\n'))[0];
const store = {};
const ctx = {today: '2026-10-23', completedBreaks: {}, localStorage: {getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }},
  breakKeyFor: (name, day, side) => `${side}||${day}||${name}`,
  breakPlanFor: () => ({breaks: [
    {name: 'Ana Test', from: 330, start: 600}, {name: 'Ben Test', from: 360, start: 630}, {name: 'Cy Test', from: 600, start: 780},
    {name: 'Dee Test', from: 840, start: 1080}, {name: 'Eli Test', from: 900, start: 1140}]}),
  pbForecast: () => ({stats: [{name: 'Cobb Salad', buildTo: 20}, {name: 'Wrap', buildTo: 10}, {name: 'Parfait', buildTo: 0}]}),
  pbMade: (iso, item) => ({'Cobb Salad': 15, 'Wrap': 10}[item] || 0)};
vm.createContext(ctx);
vm.runInContext(`const RN_SIDE_KEY = 'cfaBudaSide'; const RN_PM_FROM = 14 * 60;` + fn('rnDeviceSide') + fn('rnBreaksLeft') + fn('rnPrepLeft'), ctx);
vm.runInContext(`
  const out = {};
  out.sideDefault = rnDeviceSide();
  localStorage.setItem('cfaBudaSide', 'boh'); out.sideSet = rnDeviceSide();
  completedBreaks['boh||2026-10-23||Ana Test'] = true;
  const am = rnBreaksLeft('boh', 11 * 60), pm = rnBreaksLeft('boh', 14 * 60 + 5);
  out.am = {pm: am.pm, total: am.total, left: am.left.map(b => b.name)};
  out.pm = {pm: pm.pm, total: pm.total, left: pm.left.map(b => b.name)};
  out.prep = rnPrepLeft();
  globalThis.out = out;
`, ctx);
process.stdout.write(JSON.stringify(ctx.out));
"""


class KitchenCard(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = json.loads(subprocess.run(['node', '-e', RUNNER, ROOT], capture_output=True, text=True, check=True).stdout)

    def test_the_ipad_remembers_its_side(self):
        self.assertEqual((self.d['sideDefault'], self.d['sideSet']), ('foh', 'boh'))

    def test_morning_breaks_until_2_then_the_afternoons(self):
        # Before 2 PM: the shifts starting before 2, one already taken.
        self.assertEqual(self.d['am'], {'pm': False, 'total': 3, 'left': ['Ben Test', 'Cy Test']})
        # From 2 PM: the shifts starting at 2 or later.
        self.assertEqual(self.d['pm'], {'pm': True, 'total': 2, 'left': ['Dee Test', 'Eli Test']})

    def test_whats_still_to_prep(self):
        # Cobb 5 to go; the wrap is made; an item with nothing to build doesn't count.
        self.assertEqual(self.d['prep'], {'left': [{'name': 'Cobb Salad', 'left': 5}], 'units': 5})


class Wiring(unittest.TestCase):
    def test_the_card_and_switch(self):
        rn = read('static', 'js', 'right-now.js')
        self.assertIn("if(rnDeviceSide() === 'boh') return rnKitchenCard(day);", rn)
        self.assertIn("${card.sideSwitch ? rnSideSwitchHtml() : ''}", rn)
        self.assertIn("return {side: 'boh', first: null, rows, team: true, title: '', sideSwitch: true};", rn)   # Spanish shows on it
        self.assertIn("stateLoaded.then(rnApplyDeviceSide)", rn)
        self.assertIn("['#posToggle', '#logToggle']", rn)

    def test_its_spanish_is_in_the_glossary(self):
        es = read('static', 'js', 'spanish.js')
        for phrase in ('Still to prep', 'All prep made today', 'AM breaks left', 'PM breaks left', 'Next break', 'Kitchen waste today', 'Most wasted', 'Front', 'Back'):
            self.assertIn(f"  '{phrase}':", es)


if __name__ == '__main__':
    unittest.main()
