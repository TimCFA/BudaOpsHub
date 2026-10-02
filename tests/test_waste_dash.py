"""Waste dashboard helpers (static/js/waste-dash.js): date ranges, daypart
buckets, totals, the CSV, and the 90-day prune, run in Node with stand-ins
for the page.

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
const ctx = {
  today: '2026-10-02', entries: [], products: [],
  fohDayparts: [{name: 'Early Breakfast (6:00-8:00)', time: '6:00'}, {name: 'Breakfast (8:00-11:00)', time: '8:00'}, {name: 'Lunch (11:00-2:00)', time: '11:00'},
    {name: 'Transition (1:00-2:00)', time: '13:00'}, {name: 'Afternoon (2:00-5:00)', time: '14:00'}, {name: 'Dinner (5:00-8:00)', time: '17:00'}, {name: 'Close (8:00-10:00)', time: '20:00'}],
  document: {getElementById(){ return null; }},
  escapeHtml(s){ return String(s); },
  toLocalISODate(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
  isoAddDays(iso, n){ const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return ctx.toLocalISODate(d); },
  wasteEntryDay(e){ return e.day || ctx.toLocalISODate(new Date(e.ts)); },
  wasteItemFor(e){ return ctx.products.find(p => p.id === e.prodId) || {id: e.prodId, name: e.name, cat: 'Other', unit: e.unit || '', legacy: true}; },
  wasteCategories(list){ return [...new Set(list.map(p => p.cat))]; },
  wasteItemColor(){ return '#000000'; },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[1], 'utf8'), ctx);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(input.map(c => vm.runInContext(`(${c})()`, ctx))));
"""


def run(snippets):
    done = subprocess.run([NODE, '-e', RUNNER, os.path.join(ROOT, 'static', 'js', 'waste-dash.js')],
                          input=json.dumps(snippets), capture_output=True, text=True, check=True)
    return json.loads(done.stdout)


@unittest.skipUnless(NODE, 'Node.js not installed')
class WasteDashTest(unittest.TestCase):
    def test_ranges(self):
        [r] = run(["""function(){ const now = new Date('2026-10-02T12:00:00');
          return ['today', 'yesterday', '7', '14', '30', 'month', 'lastmonth'].map(p => wdRange(p, '', '', now)).concat([wdRange('custom', '2026-09-20', '2026-09-10', now)]); }"""])
        self.assertEqual(r, [['2026-10-02', '2026-10-02'], ['2026-10-01', '2026-10-01'], ['2026-09-26', '2026-10-02'], ['2026-09-19', '2026-10-02'],
                             ['2026-09-03', '2026-10-02'], ['2026-10-01', '2026-10-02'], ['2026-09-01', '2026-09-30'], ['2026-09-10', '2026-09-20']])

    def test_dayparts(self):
        [r] = run(["""function(){ return ['05:30', '06:10', '09:00', '12:30', '13:30', '15:00', '18:00', '21:30'].map(t => wdDaypartOf(new Date('2026-10-02T' + t + ':00').getTime())); }"""])
        self.assertEqual(r, ['Before open', 'Early Breakfast', 'Breakfast', 'Lunch', 'Lunch', 'Afternoon', 'Dinner', 'Close'])

    def test_aggregate_and_csv(self):
        [r] = run(["""function(){
          products = [{id: 'nugget', name: 'Nugget', cat: 'Proteins', unit: 'pc'}, {id: 'filet', name: 'Filet', cat: 'Proteins', unit: 'pc'}];
          entries = [
            {id: 'a', ts: new Date('2026-10-02T09:00:00').getTime(), day: '2026-10-02', prodId: 'nugget', name: 'Nugget', qty: 3, unit: 'pc', unitCost: 0.16, cost: 0.48, who: 'TL', section: 'foh'},
            {id: 'b', ts: new Date('2026-10-01T18:00:00').getTime(), day: '2026-10-01', prodId: 'filet', name: 'Filet', qty: 1, unit: 'pc', unitCost: 1.06, cost: 1.06, who: 'AB', section: 'boh'},
            {ts: new Date('2026-09-30T12:00:00').getTime(), prodId: 'boh13', name: 'Sauce Container', qty: 2, unit: 'each', unitCost: 0.5, cost: 1, who: 'AB', section: 'boh'},
            {id: 'old', ts: new Date('2026-06-01T12:00:00').getTime(), day: '2026-06-01', prodId: 'nugget', name: 'Nugget', qty: 9, cost: 9, section: 'foh'}];
          const all = wdEntriesIn(['2026-09-30', '2026-10-02'], 'all'), boh = wdEntriesIn(['2026-09-30', '2026-10-02'], 'boh');
          const A = wdAggregate(all);
          return {n: all.length, boh: boh.length, total: A.total, units: A.units, cats: A.byCat, days: A.byDay, parts: A.byPart,
                  legacy: A.byItem['boh13'].it.legacy === true, csv: wdCsv(all).split('\\n'), pruned: wastePruneOld(90, new Date('2026-10-02T12:00:00')), left: entries.length}; }"""])
        self.assertEqual(r['n'], 3)
        self.assertEqual(r['boh'], 2)
        self.assertAlmostEqual(r['total'], 2.54)
        self.assertEqual(r['units'], 6)
        self.assertEqual(r['cats'], {'Proteins': 1.54, 'Other': 1})
        self.assertEqual(r['days'], {'2026-10-02': 0.48, '2026-10-01': 1.06, '2026-09-30': 1})
        self.assertEqual(r['parts'], {'Breakfast': 0.48, 'Dinner': 1.06, 'Lunch': 1})
        self.assertTrue(r['legacy'])
        self.assertEqual(r['csv'][0], 'Date,Time,Location,Item,Category,Qty,Unit,Unit cost,Total,Initials')
        self.assertEqual(r['csv'][1], '2026-09-30,12:00,BOH,Sauce Container,Other,2,each,0.50,1.00,AB')
        self.assertEqual(r['csv'][3], '2026-10-02,09:00,FOH,Nugget,Proteins,3,pc,0.16,0.48,TL')
        self.assertTrue(r['pruned'])
        self.assertEqual(r['left'], 3)

    def test_csv_quotes_commas(self):
        [r] = run(["""function(){ products = []; entries = [{ts: new Date('2026-10-02T09:00:00').getTime(), prodId: 'x', name: 'Soup, "Bowl"', qty: 1, unit: 'each', unitCost: 2, cost: 2, who: 'A', section: 'foh'}];
          return wdCsv(entries).split('\\n')[1]; }"""])
        self.assertEqual(r, '2026-10-02,09:00,FOH,"Soup, ""Bowl""",Other,1,each,2.00,2.00,A')


if __name__ == '__main__':
    unittest.main()
