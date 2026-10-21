"""Prep Board: made so far (Tim, Oct 20 2026). Whoever preps ticks items off
as they're made ("84 salads: 52 made, 32 to go"), and whoever takes the
position later sees what's left. Each device keeps its own count, so two
people tapping at once never undo each other.

Run: python3 -m unittest discover tests   (the page code runs in node)
"""
import json
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const js = n => fs.readFileSync(process.argv[1] + '/static/js/' + n, 'utf8');
const el = {addEventListener(){}, innerHTML: ''};
const store = {};
const ctx = {console, el, today: '2026-10-20', document: {getElementById: () => el, querySelectorAll: () => []},
  localStorage: {getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }},
  toLocalISODate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  formatShortTime: t => new Date(t).toISOString().slice(11, 16), escapeHtml: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
  getInitials: () => 'JT', saveState: async () => { ctx.saves++; }, saves: 0, ptRenderPage: () => '', prepTimers: []};
vm.createContext(ctx);
vm.runInContext(js('spanish.js'), ctx);
vm.runInContext(js('prep-board.js').replace(/^let /mg, 'var ').replace(/^const /mg, 'var '), ctx);
vm.runInContext('renderPrepBoard = function(){};', ctx);   // the sheet itself isn't drawn here
const c = JSON.parse(fs.readFileSync(0, 'utf8'));
Promise.resolve(vm.runInContext(c.op, ctx)).then(out => process.stdout.write(JSON.stringify(out === undefined ? null : out)));
"""


def run(op):
    out = subprocess.run(['node', '-e', RUNNER, ROOT], input=json.dumps({'op': op}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


class MadeSoFar(unittest.TestCase):
    def test_counts_add_up_across_devices(self):
        out = run(r"""(async () => {
          pbCurrentDate = today;
          await pbSetMade('Cobb Salad', 12);                     // this device: typed 12
          await pbSetMade('Cobb Salad', pbMade(today, 'Cobb Salad') + 5);
          // Another device made 20 at the same time.
          prepMade[today + '|Cobb Salad|dOther'] = {n: 20, i: 'AB', t: 2e12};
          const both = pbMade(today, 'Cobb Salad');
          await pbSetMade('Cobb Salad', both - 1);               // one taken back here
          const mine = prepMade[today + '|Cobb Salad|' + pbDeviceId()].n;
          await pbSetMade('Cobb Salad', -10);                    // never below none
          return {both, after: 36, mine, floor: pbMade(today, 'Cobb Salad'), last: pbMadeLast(today, 'Cobb Salad').i, saves, device: localStorage.getItem('cfaBudaDevice') === pbDeviceId()};
        })()""")
        self.assertEqual(out['both'], 37)
        self.assertEqual(out['mine'], 16)                        # the other device's 20 untouched
        self.assertEqual(out['floor'], 0)
        self.assertEqual(out['last'], 'AB')
        self.assertEqual(out['saves'], 4)
        self.assertTrue(out['device'])

    def test_old_days_are_dropped(self):
        out = run(r"""(async () => { prepMade['2026-09-01|Parfait|d1'] = {n: 3}; prepMade['2026-10-10|Parfait|d1'] = {n: 3}; pbCurrentDate = today;
          await pbSetMade('Parfait', 2); return Object.keys(prepMade).map(k => k.split('|').slice(0, 2).join('|')).sort(); })()""")
        self.assertEqual(out, ['2026-10-10|Parfait', '2026-10-20|Parfait'])

    def test_on_the_build_to_sheet(self):
        out = run(r"""(() => {
          pbCurrentDate = today;
          const it = {name: 'Cobb Salad', buildTo: 84};
          prepMade[today + '|Cobb Salad|d1'] = {n: 52, i: 'JT', t: Date.UTC(2026, 9, 20, 15, 5)};
          prepMade[today + '|Cobb Salad Extra|d1'] = {n: 9};      // another item that starts the same: not counted
          const going = pbMadeHtml(it);
          prepMade[today + '|Cobb Salad|d2'] = {n: 35, i: 'AB', t: Date.UTC(2026, 9, 20, 19)};
          return [going, pbMadeHtml(it)];
        })()""")
        going, done = out
        self.assertIn('52 made · <b>32</b> to go', going)
        self.assertIn('<i style="width:62%"></i>', going)
        self.assertIn('data-pb-made="Cobb Salad" data-delta="1"', going)
        self.assertIn('data-pb-made="Cobb Salad" data-delta="5"', going)
        self.assertIn('data-pb-made="Cobb Salad" data-delta="-1"', going)
        self.assertIn('value="52" data-pb-made-set="Cobb Salad"', going)
        self.assertIn('52 hechos · faltan 32', going)                       # BOH: Spanish beside it
        self.assertIn('class="pb-made is-done"', done)
        self.assertIn('✓ Done · 87 made · 3 over', done)
        self.assertIn('AB 19:00', done)

    def test_saved_in_its_own_section(self):
        # Pages on older code never drop it when they save the prep data.
        self.assertIn("'prepLive': ['prepMade'],", read('app.py'))
        self.assertIn("prepLive: ['prepMade'],", read('static', 'js', 'storage.js'))
        self.assertNotRegex(read('app.py'), r"'prep': \[[^\]]*prepMade")
        css = read('static', 'css', 'theme-cfa.css')
        for rule in ('.pb-made-bar{', '.pb-made-btn{', '.pb-made-num input{', '.pb-made-sum{'):
            self.assertIn(rule, css)
        self.assertFalse(re.search(r'[\U0001F300-\U0001FAFF]', css.split('Prep Board: made so far')[1]))


if __name__ == '__main__':
    unittest.main()
