"""Know the Numbers, the leaders' page (Tim, Oct 23 2026): each daypart's
productivity goal at a glance, with the labor hours it allows, the hours on
the schedule, last week's actual, drive-thru time and OSAT.

Run: python3 -m unittest discover tests
Names and numbers are made up.
"""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const js = n => fs.readFileSync(require('path').join(process.argv[1], 'static', 'js', n), 'utf8');
const c = {today: '2026-10-23', escapeHtml: s => String(s), console,
  toLocalISODate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  parseMoney: v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n; },
  parseShiftTimeToMinutes: t => { const m = String(t).match(/(\d+):(\d+)([ap])/); return m ? (+m[1] % 12 + (m[3] === 'p' ? 12 : 0)) * 60 + +m[2] : null; },
  fohDayparts: [], bohDayparts: [], document: {addEventListener(){}}};
vm.createContext(c);
const kn = js('know-numbers.js');
vm.runInContext(kn.slice(kn.indexOf('const numbersDayparts'), kn.indexOf('// A day\'s numbers typed under')), c);
const sr = js('setup-rules.js');
vm.runInContext(sr.match(/function suShiftBlocks\(entry\)\{[\s\S]*?\n\}\n/)[0], c);
vm.runInContext(js('kn-page.js').replace(/\nlet knPage/g, '\nvar knPage'), c);
vm.runInContext(`
  var numbersData = {
    '2026-10-23': {'Lunch (10:30-2:00)': {projectedSales: '$11,000.00', productivityGoal: '$110.00', specialEvents: 'Pack the Drive Thru'}},
    '2026-10-16': {'Lunch (10:30-2:00)': {productivityGoal: '$100.00', actualProductivity: '$104.50'}}};
  var fohRoster = {'2026-10-23': [{name: 'Avery Example', start: '10:00a', end: '6:00p'}, {name: 'Casey Sample', start: '11:00a', end: '1:00p'}]};
  var bohRoster = {'2026-10-23': [{name: 'Riley Sample', start: '6:00a', end: '12:30p'}]};
  var reportData = {sos: {from: '2026-07-24', to: '2026-10-21', dtDayparts: {Lunch: {cars: 300, total: 170}, Transition: {cars: 100, total: 190}, Mid: {cars: 50, total: 160}}}};
  var kaGetActual = (iso, dp, f) => { const e = numbersData[iso] && numbersData[iso][dp]; return e ? parseMoney(e[f]) : null; };
  var knSpecialEventsText = s => s;
`, c);
process.stdout.write(JSON.stringify(vm.runInContext('(' + process.argv[2] + ')', c)()));
"""


def run(op):
    out = subprocess.run(['node', '-e', RUNNER, ROOT, op], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


class Facts(unittest.TestCase):
    def test_a_dayparts_numbers(self):
        f = run("() => { const f = knDaypartFacts('2026-10-23', numbersDayparts[1]); return {...f, dp: f.dp.name}; }")
        self.assertEqual((f['sales'], f['goal']), (11000, 110))
        self.assertAlmostEqual(f['need'], 100)                       # $11,000 ÷ $110 an hour
        self.assertAlmostEqual(f['sched'], 3.5 + 2 + 2)              # 10:30–2:00, 11–1 and 10:30–12:30 inside Lunch
        self.assertAlmostEqual(f['schedProd'], 11000 / 7.5)
        self.assertEqual(f['event'], 'Pack the Drive Thru')
        self.assertEqual(f['last'], {'iso': '2026-10-16', 'prod': 104.5, 'goal': 100})
        self.assertAlmostEqual(f['dt']['secs'], (300 * 170 + 100 * 190) / 400)   # Lunch and Transition; Mid is the Afternoon's
        self.assertIsNone(f['osat'])                                  # no CEM loaded

    def test_the_card_says_whether_the_schedule_fits(self):
        html = run("() => knCardHtml('2026-10-23', knDaypartFacts('2026-10-23', numbersDayparts[1]), true)")
        self.assertIn('<b>$110</b><span>per labor hour<br>productivity goal</span>', html)
        self.assertIn('Room for 92.5 more hrs', html)
        self.assertIn('knp-now', html)
        over = run("() => { fohRoster['2026-10-23'] = Array.from({length: 40}, (x, i) => ({name: 'P' + i, start: '10:30a', end: '2:00p'})); return knCardHtml('2026-10-23', knDaypartFacts('2026-10-23', numbersDayparts[1]), false); }")
        self.assertIn('hrs over what the goal allows', over)
        self.assertIn('knp-stat is-over', over)
        none = run("() => knCardHtml('2026-10-23', knDaypartFacts('2026-10-23', numbersDayparts[0]), false)")
        self.assertIn('No productivity goal yet', none)


class Wiring(unittest.TestCase):
    def test_leaders_only_and_linked_from_set_ups(self):
        with open(os.path.join(ROOT, 'static', 'js', 'navigation.js'), encoding='utf-8') as f:
            self.assertIn("if(view === 'knownumbers' && typeof knPageShown === 'function' && !knPageShown()) view = 'prepboard';", f.read())
        with open(os.path.join(ROOT, 'static', 'js', 'setups-board.js'), encoding='utf-8') as f:
            self.assertIn('data-launch-go="knownumbers" data-kn-open=', f.read())
        with open(os.path.join(ROOT, 'static', 'js', 'kn-page.js'), encoding='utf-8') as f:
            self.assertIn("return typeof scHidden === 'function' ? !scHidden() : false;", f.read())   # Team Leads and up


if __name__ == '__main__':
    unittest.main()
