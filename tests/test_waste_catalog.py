"""Waste tracker catalog (static/js/waste-catalog.js): every item complete,
ids unique, colors real, and the old Log Waste ids mapped to items that exist.

Run: python3 -m unittest discover tests   (needs Node.js; skipped without it)
"""
import json
import os
import re
import shutil
import subprocess
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')
NODE = shutil.which('node')

RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const ctx = {products: []};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[1], 'utf8'), ctx);
const out = vm.runInContext(`({
  items: wasteDefaultProducts(),
  legacy: WASTE_LEGACY_MAP,
  colors: WASTE_COLORS,
  catOrder: WASTE_CAT_ORDER,
  valid: ['#abcdef', '#ABCDEF', 'red', '#abc', 'url(x)', '#abcdeg'].map(wasteValidColor),
  textOn: [wasteTextOn('#ffffff'), wasteTextOn('#000000')],
  standIn: (products = [{id: 'filet', name: 'Filet', cat: 'Proteins', unit: 'pc', cost: 1}],
            [wasteItemFor({prodId: 'boh5'}).id, wasteItemFor({prodId: 'boh13', name: 'Sauce Container', unit: 'each', unitCost: 0.5}).name])
})`, ctx);
process.stdout.write(JSON.stringify(out));
"""


@unittest.skipUnless(NODE, 'Node.js not installed')
class WasteCatalogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        done = subprocess.run([NODE, '-e', RUNNER, os.path.join(ROOT, 'static', 'js', 'waste-catalog.js')],
                              capture_output=True, text=True, check=True)
        cls.data = json.loads(done.stdout)

    def test_items_complete(self):
        items = self.data['items']
        self.assertGreater(len(items), 90)
        for p in items:
            self.assertTrue(p['name'] and p['es'] and p['cat'] and p['unit'], p)
            self.assertIsInstance(p['cost'], (int, float))
            self.assertGreaterEqual(p['cost'], 0)
            self.assertIn(p['cat'], self.data['catOrder'], p['name'])
            self.assertTrue(p['color'] == '' or re.fullmatch(r'#[0-9a-f]{6}', p['color']), p)
            self.assertEqual(p['ceil'], 0)
            self.assertTrue(p['active'])

    def test_ids_unique_and_stable(self):
        ids = [p['id'] for p in self.data['items']]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertIn('5-count-nugget', ids)
        self.assertIn('cfa-sandwich', ids)

    def test_legacy_map_points_at_real_items(self):
        ids = {p['id'] for p in self.data['items']}
        for old, new in self.data['legacy'].items():
            self.assertIn(new, ids, f'{old} → {new}')

    def test_color_guard(self):
        self.assertEqual(self.data['valid'], ['#abcdef', '#abcdef', '', '', '', ''])
        self.assertEqual(self.data['textOn'], ['#1b2420', '#ffffff'])

    def test_entries_resolve(self):
        # An old id maps to its catalog item; an unmapped one keeps what the entry recorded.
        self.assertEqual(self.data['standIn'], ['filet', 'Sauce Container'])

    def test_page_loads_catalog_before_it_is_used(self):
        with open(os.path.join(ROOT, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
            html = f.read()
        self.assertLess(html.index('/static/js/waste-catalog.js'), html.index('/static/js/zone-reset.js'))
        self.assertNotIn('id="logModal"', html)


if __name__ == '__main__':
    unittest.main()
