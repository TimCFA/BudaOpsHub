"""Set Ups (Tim, Oct 23 2026): today, a spot whose person comes in partway
through its daypart shows yellow until they arrive, then plain: in the
daypart on the clock and the later ones too.

Run: python3 -m unittest discover tests
Names are made up.
"""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const js = fs.readFileSync(process.argv[1], 'utf8');
const src = js.slice(js.indexOf('function suNotHereYet'), js.indexOf('// At an arrival time'));
const cases = JSON.parse(process.argv[2]);
process.stdout.write(JSON.stringify(cases.map(c => {
  const ctx = {today: '2026-10-23', Date: class extends Date { constructor(...a){ super(...(a.length ? a : ['2026-10-23T' + c.now + ':00'])); } },
    suDefaultDaypart: () => 'Lunch', suTimingFor: (t, n) => t.people.find(p => p.name === n) || null};
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const timing = {people: [{name: 'Avery Example', arrives: 690}, {name: 'Casey Sample', arrives: null}]};
  return vm.runInContext('suNotHereYet', ctx)('foh', c.date || '2026-10-23', {name: c.dp || 'Lunch'}, timing, c.names);
})));
"""


def run(cases):
    out = subprocess.run(['node', '-e', RUNNER, os.path.join(ROOT, 'static', 'js', 'setups-sheet.js'), json.dumps(cases)],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


class NotHereYet(unittest.TestCase):
    def test_yellow_until_they_arrive(self):
        self.assertEqual(run([
            {'now': '11:05', 'names': ['Avery Example']},                      # arrives 11:30: yellow
            {'now': '11:30', 'names': ['Avery Example']},                      # here: plain
            {'now': '11:05', 'names': ['Casey Sample']},                       # here from the start
            {'now': '11:05', 'names': []},                                     # an open spot
            {'now': '11:05', 'names': ['Avery Example'], 'dp': 'Dinner'},      # a later daypart: yellow too
            {'now': '11:05', 'names': ['Avery Example'], 'date': '2026-10-24'},  # another day
        ]), [690, None, None, None, 690, None])

    def test_wired_into_both_views_and_a_timer(self):
        with open(os.path.join(ROOT, 'static', 'js', 'setups-board.js'), encoding='utf-8') as f:
            board = f.read()
        self.assertIn('coming: suNotHereYet(section, date, dp, timing, names)', board)
        self.assertIn("${t.coming ? 'is-coming' : ''}", board)
        with open(os.path.join(ROOT, 'static', 'js', 'setups-sheet.js'), encoding='utf-8') as f:
            sheet = f.read()
        self.assertIn("${x.coming ? 'is-coming' : ''}", sheet)
        self.assertIn("if([...document.querySelectorAll('#allDayparts [data-su-arrives]')].some(el => +el.dataset.suArrives <= mins)){ renderAllDayparts(); return; }", sheet)


if __name__ == '__main__':
    unittest.main()
