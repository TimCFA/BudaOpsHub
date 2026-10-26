"""The QIV row on Data Uploads: one scored visit a quarter, landing any time
in it, so the latest Icon Report counts as current through the quarter after
its own (Oct 26 2026: the Q3 report uploaded in October stayed "Due" and never
ticked off the day's list).

Run: python3 -m unittest discover tests
"""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const du = fs.readFileSync(process.argv[1], 'utf8'), rp = fs.readFileSync(process.argv[2], 'utf8');
const c = {};
vm.createContext(c);
vm.runInContext(du.slice(du.indexOf('const DU_FREQUENCIES = {'), du.indexOf('const DU_SOURCES = [')), c);
vm.runInContext(du.slice(du.indexOf('// ----- Dates -----'), du.indexOf('function duRosterWeekLoaded(')), c);
vm.runInContext(rp.slice(rp.indexOf('function rpLatestQiv(){'), rp.indexOf('// Touchpoints that aren')), c);
vm.runInContext(rp.slice(rp.indexOf('function rpSourceState('), rp.indexOf("  if(src.key === 'sales'){")) + "  if(src.key === 'qiv'){" + rp.split("  if(src.key === 'qiv'){")[1].split("  if(src.key === 'foodSafety'){")[0] + "}", c);
process.stdout.write(JSON.stringify(vm.runInContext('(' + process.argv[3] + ')', c)()));
"""


def state(quarter, now):
    op = """() => {
      reportData = %s;
      const st = rpSourceState({key: 'qiv'}, new Date('%sT10:00:00'), 'quarterly', null);
      return {status: st.status, cover: st.cover, note: st.note}; }""" % (
        json.dumps({'qiv': {'visits': [{'quarter': quarter, 'date': '2026-08-12', 'overall': 97}]}} if quarter else {}), now)
    out = subprocess.run(['node', '-e', RUNNER, os.path.join(ROOT, 'static', 'js', 'data-uploads.js'), os.path.join(ROOT, 'static', 'js', 'report-uploads.js'), op],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


class QivStatus(unittest.TestCase):
    def test_last_quarters_report_is_current(self):
        st = state('Q3-2026', '2026-10-26')
        self.assertEqual(st['status'], 'fresh')
        self.assertEqual(st['cover'], 'Q3-2026 · visit Aug 12 · 97%')
        self.assertEqual(st['note'], '')

    def test_this_quarters_report_is_current(self):
        self.assertEqual(state('Q4-2026', '2026-11-03')['status'], 'fresh')

    def test_two_quarters_back_is_due(self):
        st = state('Q2-2026', '2026-10-26')
        self.assertEqual(st['status'], 'due')
        self.assertIn('Latest is Q2-2026', st['note'])

    def test_across_the_year(self):
        self.assertEqual(state('Q4-2025', '2026-02-10')['status'], 'fresh')
        self.assertEqual(state('Q3-2025', '2026-02-10')['status'], 'due')

    def test_none_yet(self):
        st = state(None, '2026-10-26')
        self.assertEqual((st['status'], st['cover']), ('due', 'No QIV yet'))

    def test_quarterly_periods(self):
        op = """() => { const p = duPeriods('quarterly', new Date('2026-01-15T10:00:00')); return [duISO(p.start), duISO(p.prev), DU_FREQUENCIES.quarterly]; }"""
        out = subprocess.run(['node', '-e', RUNNER, os.path.join(ROOT, 'static', 'js', 'data-uploads.js'), os.path.join(ROOT, 'static', 'js', 'report-uploads.js'), op],
                             capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(out.stdout), ['2026-01-01', '2025-10-01', 'Quarterly'])


if __name__ == '__main__':
    unittest.main()
