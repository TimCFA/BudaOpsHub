"""Prep Board waste from the Waste tracker (static/js/prep-board.js):
cold-side entries become one waste day each, other items are ignored, and
days pasted before the tracker still count where the tracker has nothing.

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
const el = {addEventListener(){}, innerHTML: ''};
const ctx = {
  today: '2026-10-02', entries: [], products: [],
  document: {getElementById(){ return el; }, querySelector(){ return null; }, querySelectorAll(){ return []; }},
  window: {}, escapeHtml(s){ return String(s); }, showToast(){}, saveState(){ return Promise.resolve(); },
  toLocalISODate(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
  wasteEntryDay(e){ return e.day || ctx.toLocalISODate(new Date(e.ts)); },
  wasteItemFor(e){ return ctx.products.find(p => p.id === e.prodId) || {id: e.prodId, name: e.name, cat: 'Other', unit: ''}; },
};
ctx.setInterval = () => 0;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[1], 'utf8'), ctx);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(input.map(c => vm.runInContext(`(${c})()`, ctx))));
"""


def run(snippets):
    done = subprocess.run([NODE, '-e', RUNNER, os.path.join(ROOT, 'static', 'js', 'prep-board.js')],
                          input=json.dumps(snippets), capture_output=True, text=True, check=True)
    return json.loads(done.stdout)


@unittest.skipUnless(NODE, 'Node.js not installed')
class PrepWasteTest(unittest.TestCase):
    def test_tracker_entries_become_waste_days(self):
        [r] = run(["""function(){
          products = [{id: 'cobb-salad', name: 'Cobb Salad', cat: 'Prep'}, {id: 'medium-fruit-cup', name: 'Medium Fruit Cup', cat: 'Prep'},
                      {id: 'nugget', name: 'Nugget', cat: 'Proteins'}, {id: 'veg-wrap', name: 'Veggie Wrap', cat: 'Prep'}];
          entries = [
            {ts: 1, day: '2026-10-01', prodId: 'cobb-salad', qty: 2}, {ts: 2, day: '2026-10-01', prodId: 'cobb-salad', qty: 1},
            {ts: 3, day: '2026-10-01', prodId: 'medium-fruit-cup', qty: 4}, {ts: 4, day: '2026-10-01', prodId: 'nugget', qty: 9},
            {ts: 5, day: '2026-10-02', prodId: 'veg-wrap', qty: 1}, {ts: 6, day: '2026-09-30', prodId: 'boh13', name: 'Sauce Container', qty: 2}];
          prepWasteEntries = [{id: 'p1', date: '2026-10-01', day: 'Thursday', items: {'Cobb Salad': 50}, source: 'manual'},
                              {id: 'p2', date: '2026-09-29', day: 'Tuesday', items: {'Parfait': 3}, source: 'manual'}];
          const days = pbWasteEntries().sort((a, b) => a.date.localeCompare(b.date));
          return {days: days.map(d => [d.date, d.day, d.source, d.items]), totals: days.map(pbBucketTotals),
                  sugg: pbComputeSuggestion('Thursday') === null};
        }"""])
        self.assertEqual(r['days'], [
            ['2026-09-29', 'Tuesday', 'manual', {'Parfait': 3}],                               # pasted before the tracker, no tracker day: kept
            ['2026-10-01', 'Thursday', 'tracker', {'Cobb Salad': 3, 'Fruit Cup, Medium': 4}],   # the pasted Oct 1 day is superseded
            ['2026-10-02', 'Friday', 'tracker', {'Veggie Wrap': 1}],                            # a Prep item not in the table maps by name
        ])
        # Bucket names round-trip through the Prep Board's own mapper unchanged.
        self.assertEqual(r['totals'][1], {'Cobb Salad': 3, 'Fruit Cup, Medium': 4})

    def test_every_prep_catalog_item_has_a_bucket(self):
        [r] = run(["""function(){
          products = [['cobb-salad','Cobb Salad'],['cool-wrap','Cool Wrap'],['greek-yogurt-parfait','Greek Yogurt Parfait'],['kale-crunch-side','Kale Crunch Side'],
                      ['market-salad','Market Salad'],['medium-fruit-cup','Medium Fruit Cup'],['side-salad','Side Salad'],['small-fruit-cup','Small Fruit Cup'],
                      ['spicy-southwest-salad','Spicy Southwest Salad'],['spicy-wrap','Spicy Wrap']].map(([id, name]) => ({id, name, cat: 'Prep'}));
          return products.map(p => [p.id, pbTrackerBucket({prodId: p.id})]);
        }"""])
        self.assertEqual(dict(r), {
            'cobb-salad': 'Cobb Salad', 'cool-wrap': 'Regular Cool Wrap', 'greek-yogurt-parfait': 'Parfait', 'kale-crunch-side': 'Kale Salad',
            'market-salad': 'Mkt Salad — Grilled Filet (Cold)', 'medium-fruit-cup': 'Fruit Cup, Medium', 'side-salad': 'Side Salad',
            'small-fruit-cup': 'Fruit Cup, Small', 'spicy-southwest-salad': 'Spicy SW Salad — Spicy Grilled Filet (Cold)', 'spicy-wrap': 'Spicy Wrap'})


if __name__ == '__main__':
    unittest.main()
