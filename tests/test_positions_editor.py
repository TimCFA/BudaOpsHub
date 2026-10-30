"""Edit positions on Set Ups (static/js/positions-editor.js; Tim, Oct 30 2026):
directors and the Admin Team drag a daypart's positions into order, add new
ones and take one off. Set Ups uses a daypart's saved list, else the built-in
one (zone-reset.js). Run in Node with zone-reset.js's lists.

Run: python3 -m unittest discover tests
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


ZONE = read('static', 'js', 'zone-reset.js')
LISTS = ZONE[ZONE.index('const fohPositions = {'):ZONE.index('// ----- Zone reset owners -----')]

RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const ctx = {today: '2026-10-30', posAssignments: {}, positionLists: {}, launchManager: false, console,
  document: {addEventListener(){}, getElementById(){ return null; }}, escapeHtml: s => String(s), esLine: () => ''};
vm.createContext(ctx);
vm.runInContext(process.argv[1], ctx);
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), ctx);
const cases = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(cases.map(c => vm.runInContext(`(${c})()`, ctx))));
"""


def run(*cases):
    out = subprocess.run(['node', '-e', RUNNER, LISTS.replace('const fohPositions', 'var fohPositions').replace('const bohPositions', 'var bohPositions'),
                          os.path.join(ROOT, 'static', 'js', 'positions-editor.js')],
                         input=json.dumps(list(cases)), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


LUNCH = 'Lunch (10:30-1:00)'


class Lists(unittest.TestCase):
    def test_a_saved_daypart_replaces_the_built_in_one_and_back(self):
        got = run(f"""() => {{
            const before = fohPositions['{LUNCH}'].slice(), breakfast = fohPositions['Breakfast (8:00-10:30)'].slice();
            positionLists = {{foh: {{'{LUNCH}': ['Drinks 1', 'iPOS 1 (Captain)', 'Curbside', 'drinks 1', '  ', 'A|B']}}}};
            posApplyLists();
            const after = fohPositions['{LUNCH}'].slice(), breakfastAfter = fohPositions['Breakfast (8:00-10:30)'].slice();
            positionLists = {{}}; posApplyLists();
            return {{before: before.length, after, sameBreakfast: JSON.stringify(breakfast) === JSON.stringify(breakfastAfter),
                     back: JSON.stringify(fohPositions['{LUNCH}']) === JSON.stringify(before), boh: bohPositions['Breakfast (8:00-10:30)'].length}};
        }}""")[0]
        self.assertEqual(got['after'], ['Drinks 1', 'iPOS 1 (Captain)', 'Curbside', 'A/B'])   # cleaned: no repeats, no blanks, no "|"
        self.assertTrue(got['sameBreakfast'])                                                   # only the saved daypart changes
        self.assertTrue(got['back'])                                                            # nothing saved: the built-in list
        self.assertEqual(got['before'], 25)
        self.assertEqual(got['boh'], 7)

    def test_the_chip_is_for_directors_and_the_admin_team(self):
        got = run("() => [posEditChipHtml(), (launchManager = true, posEditChipHtml())]")[0]
        self.assertEqual(got[0], '')
        self.assertIn('data-pe-open', got[1])
        self.assertIn('Edit positions', got[1])

    def test_placed_counts_today_and_later_only(self):
        got = run(f"""() => {{
            posAssignments = {{'foh||2026-10-29||{LUNCH}||Curbside': 'A', 'foh||2026-10-30||{LUNCH}||Curbside': 'B',
                              'foh||2026-11-02||{LUNCH}||Curbside': 'C', 'boh||2026-10-30||{LUNCH}||Curbside': 'D', 'foh||2026-10-31||{LUNCH}||Curbside': ''}};
            return posPlacedCount('foh', '{LUNCH}', 'Curbside');
        }}""")[0]
        self.assertEqual(got, 2)


class Wiring(unittest.TestCase):
    def test_saved_with_the_managers_settings(self):
        storage = read('static', 'js', 'storage.js')
        manager = storage[storage.index('  manager: ['):storage.index('  pea:')]
        self.assertIn("'positionLists'", manager)
        self.assertIn('positionLists, pointsRecords', storage)
        self.assertIn("if(typeof posApplyLists === 'function') posApplyLists();", storage)
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertIn('<script src="/static/js/zone-reset.js"></script>\n<script src="/static/js/positions-editor.js"></script>', page)
        self.assertLess(page.index('/static/js/positions-editor.js'), page.index('/static/js/storage.js'))

    def test_the_chip_sits_on_set_ups_and_speaks_spanish(self):
        board = read('static', 'js', 'setups-board.js')
        self.assertIn("const edit = typeof posEditChipHtml === 'function' ? posEditChipHtml() : '';", board)
        self.assertIn("'Edit positions': 'Editar puestos',", read('static', 'js', 'spanish.js'))

    def test_drag_works_by_touch_and_keys(self):
        js = read('static', 'js', 'positions-editor.js')
        self.assertIn("el.addEventListener('pointerdown', peDragStart);", js)
        self.assertIn("e.key !== 'ArrowUp' && e.key !== 'ArrowDown'", js)
        css = read('static', 'css', 'theme-cfa.css')
        self.assertRegex(re.search(r'\.pe-grip\{[^}]*\}', css).group(0), r'touch-action:none')
        self.assertIsNone(re.search('[\U0001F300-\U0001FAFF☀-➿]', js))


if __name__ == '__main__':
    unittest.main()
