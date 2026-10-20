"""Waste dashboard bars by day and by daypart (Tim, Oct 20 2026): each bar
is its share of the total, not scaled to the biggest, which always read as
a full bar ("artificially full", as with today's waste bars, #187).

Run: python3 -m unittest discover tests
"""
import json
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Bars(unittest.TestCase):
    def test_share_of_the_total(self):
        with open(os.path.join(ROOT, 'static', 'js', 'waste-dash.js'), encoding='utf-8') as f:
            fn = re.search(r'function wdBars\([\s\S]*?\n}\n', f.read()).group(0)
        run = r'''
const vm = require('vm'); const ctx = {};
vm.createContext(ctx);
vm.runInContext(`const escapeHtml = s => String(s); const wdMoney0 = n => '$' + Math.round(n);` + process.argv[1], ctx);
const html = vm.runInContext(`wdBars([{label: 'Sat', value: 382}, {label: 'Sun', value: 0}, {label: 'Mon', value: 118}, {label: 'Tue', value: 0.4}], true)`, ctx);
process.stdout.write(JSON.stringify({widths: [...html.matchAll(/width:([0-9.]+)%/g)].map(m => +m[1]), vals: [...html.matchAll(/wd-bar-val">([^<]*)(?:<small>([^<]*)<\/small>)?/g)].map(m => (m[1] + (m[2] || '')).trim())}));'''
        out = json.loads(subprocess.run(['node', '-e', run, fn], capture_output=True, text=True, check=True).stdout)
        # 382 of 500.4 is 76.3%, not a full bar; nothing logged stays empty; a sliver still shows.
        self.assertEqual(out['widths'], [76.3, 0, 23.6, 1.0])
        self.assertEqual(out['vals'], ['$382 76%', '$0', '$118 24%', '$0 0%'])


if __name__ == '__main__':
    unittest.main()
