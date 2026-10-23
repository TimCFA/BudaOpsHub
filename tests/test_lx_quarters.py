"""LX by quarter (Tim, Oct 23 2026): evaluations score leaders on the quarter
just ended, so the LX scoreboard keeps each quarter. This quarter is live;
an ended quarter is frozen by the first manager page after it; past OSAT
follows the CEM uploads unless a manager typed it; year to date puts the
quarters side by side.

Run: python3 -m unittest discover tests
"""
import json
import os
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import app as appmod  # noqa: E402

RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const js = fs.readFileSync(process.argv[1], 'utf8');
const c = {today: '2026-10-23', lxQuarters: {}, launchManager: true, document: {addEventListener(){}}, escapeHtml: s => String(s),
  lxMetrics: [{id: 'metric1', name: 'OSAT +2pt ≤ 20%', standard: '≤ 20%', value: '19% · OSAT 81%', rating: 2},
              {id: 'metric5', name: 'Productivity', standard: '$90+', value: '$90.39', rating: 2}],
  // CEM: Q3 as one range; Q2 as two of its months.
  ctPeriods: () => [{periodKey: '2026-04', periodType: 'month', periodStart: '2026-04-01', periodEnd: '2026-04-30', periodLabel: 'April 2026'},
                    {periodKey: '2026-05', periodType: 'month', periodStart: '2026-05-01', periodEnd: '2026-05-31', periodLabel: 'May 2026'},
                    {periodKey: 'q3', periodType: 'range', periodStart: '2026-07-01', periodEnd: '2026-09-30', periodLabel: 'Q3 2026 (Jul 1–Sep 30)'}],
  ctTotalEntry: k => ({'2026-04': {n: 100, scores: {overall: 70}}, '2026-05': {n: 300, scores: {overall: 90}}, q3: {n: 819, scores: {overall: 82}}})[k]};
vm.createContext(c);
vm.runInContext(js.replace(/\nlet lxQView/, '\nvar lxQView'), c);
process.stdout.write(JSON.stringify(vm.runInContext('(' + process.argv[2] + ')', c)()));
"""


def run(op):
    out = subprocess.run(['node', '-e', RUNNER, os.path.join(ROOT, 'static', 'js', 'lx-quarters.js'), op], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


class Quarters(unittest.TestCase):
    def test_quarters(self):
        got = run("() => [lxQuarterOf('2026-10-23'), lxQuarterOf('2026-01-01'), lxQuarterBounds('2026-Q1').end, lxPrevQuarter('2026-Q1'), lxPastQuarters()]")
        self.assertEqual(got, ['2026-Q4', '2026-Q1', '2026-03-31', '2025-Q4', ['2026-Q3', '2026-Q2', '2026-Q1', '2025-Q4']])

    def test_first_run_backfills_osat_from_the_cem(self):
        got = run("() => { const changed = lxQuartersSync(); return {changed, open: lxQuarters.open, q3: lxQuarters.quarters['2026-Q3'].metrics, q2: lxQuarters.quarters['2026-Q2'].metrics[0], q1: lxRecord('2026-Q1')}; }")
        self.assertTrue(got['changed'])
        self.assertEqual(got['open'], '2026-Q4')                           # nothing frozen yet: Q4 is still open
        self.assertEqual(got['q3'][0]['value'], '18% · OSAT 82%')
        self.assertEqual(got['q3'][0]['rating'], 2)
        self.assertIn('Q3 2026 (Jul 1–Sep 30)', got['q3'][0]['source'])
        self.assertEqual((got['q3'][1]['value'], got['q3'][1]['rating']), ('', None))   # productivity: no quarter data, left to type
        self.assertEqual(got['q2']['value'], '15% · OSAT 85%')             # April and May weighted by surveys: (70*100 + 90*300) / 400
        self.assertIn('2 of 3 months', got['q2']['source'])
        self.assertIsNone(got['q1'])                                        # no CEM for Q1: nothing made up

    def test_a_quarter_that_ended_is_frozen_once(self):
        got = run("""() => { lxQuarters = {open: '2026-Q3', quarters: {}}; lxQuartersSync();
            const frozen = JSON.parse(JSON.stringify(lxQuarters.quarters['2026-Q3']));
            lxMetrics[1].value = '$95.00'; lxQuartersSync();
            return {open: lxQuarters.open, frozen, again: lxQuarters.quarters['2026-Q3'].metrics[1].value}; }""")
        self.assertEqual(got['open'], '2026-Q4')
        self.assertTrue(got['frozen']['closedAt'])
        self.assertEqual(got['frozen']['metrics'][1]['value'], '$90.39')      # the live board as Q3 ended
        self.assertEqual(got['again'], '$90.39')                              # the live board moving on doesn't change it
        self.assertEqual(got['frozen']['metrics'][0]['value'], '18% · OSAT 82%')   # OSAT from the CEM's Q3 total

    def test_a_typed_value_wins_over_the_uploads(self):
        got = run("""() => { lxQuartersSync(); const m = lxQuarters.quarters['2026-Q3'].metrics[0];
            Object.assign(m, {value: '21% · OSAT 79%', rating: 1, typed: true}); lxQuartersSync();
            return [m.value, m.rating]; }""")
        self.assertEqual(got, ['21% · OSAT 79%', 1])

    def test_year_to_date_counts_the_quarters_met(self):
        html = run("""() => { lxQuartersSync(); lxQuarters.quarters['2026-Q1'] = {metrics: [{id: 'metric1', name: 'OSAT +2pt ≤ 20%', standard: '≤ 20%', value: '22% · OSAT 78%', rating: 1}]};
            return lxYtdHtml(); }""")
        self.assertIn('<th>Q4 <small>live</small></th>', html)
        osat = html.split('OSAT +2pt')[1].split('</tr>')[0]
        self.assertIn('<b>3 of 4</b>', osat)                                  # Q1 below; Q2, Q3 and live Q4 met
        prod = html.split('Productivity')[1].split('</tr>')[0]
        self.assertIn('<b>1 of 1</b>', prod)                                  # only the live quarter has a status

    def test_a_status_with_no_value_isnt_counted(self):
        html = run("() => { lxMetrics.push({id: 'metric3', name: 'Drive-Thru Ranking', standard: 'Top 100', value: '', rating: 2}); return lxYtdHtml(); }")
        row = html.split('Drive-Thru Ranking')[1].split('</tr>')[0]
        self.assertNotIn('Meets', row)
        self.assertIn('<td class="lxq-met">—</td>', row)


class Saved(unittest.TestCase):
    def test_own_section_and_managers_only(self):
        self.assertEqual(appmod.STATE_SECTIONS['lx'], ['lxQuarters'])
        self.assertIn('lxQuarters', appmod.MANAGER_ONLY_KEYS)
        self.assertNotIn('lx', appmod.PRIVATE_SECTIONS)


if __name__ == '__main__':
    unittest.main()
