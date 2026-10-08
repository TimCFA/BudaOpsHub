"""Waste export for the days you need (static/js/waste-export.js): today,
last week (Mon-Sat), this month, last month or picked days."""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, 'tests', 'waste_export_runner.js')
NOW = "new Date('2026-10-07T15:00:00')"   # a Wednesday


def run(*ops):
    out = subprocess.run(['node', RUNNER], input=json.dumps({'cases': [{'op': op} for op in ops]}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


class Ranges(unittest.TestCase):
    def test_presets(self):
        got = run(*[f"c => wxRange('{p}', null, null, {NOW})" for p in ('today', 'lastweek', 'month', 'lastmonth')])
        self.assertEqual(got, [['2026-10-07', '2026-10-07'], ['2026-09-28', '2026-10-03'],
                               ['2026-10-01', '2026-10-07'], ['2026-09-01', '2026-09-30']])

    def test_last_week_from_a_monday_and_a_saturday(self):
        got = run("c => wxRange('lastweek', null, null, new Date('2026-10-05T09:00:00'))",
                  "c => wxRange('lastweek', null, null, new Date('2026-10-10T09:00:00'))")
        self.assertEqual(got, [['2026-09-28', '2026-10-03'], ['2026-09-28', '2026-10-03']])

    def test_picked_days_in_either_order(self):
        self.assertEqual(run(f"c => wxRange('custom', '2026-10-06', '2026-10-02', {NOW})")[0], ['2026-10-02', '2026-10-06'])

    def test_labels(self):
        got = run(f"c => wxLabel(['2026-10-07', '2026-10-07'], {NOW})", f"c => wxLabel(['2026-09-28', '2026-10-03'], {NOW})",
                  f"c => wxLabel(['2026-09-01', '2026-09-30'], {NOW})", f"c => wxLabel(['2026-10-01', '2026-10-07'], {NOW})")
        self.assertEqual(got, ['Wednesday, Oct 7, 2026', 'Sep 28 – Oct 3, 2026', 'September 2026', 'October 2026 to date'])

    def test_whole_month_saves_its_summary_only_when_whole(self):
        got = run(f"c => [wxWholeMonth(['2026-09-01', '2026-09-30'], {NOW}), wxWholeMonth(['2026-10-01', '2026-10-07'], {NOW}),"
                  f" wxWholeMonth(['2026-09-01', '2026-09-15'], {NOW}), wxWholeMonth(['2026-09-28', '2026-10-03'], {NOW})]")[0]
        self.assertEqual(got, ['2026-09', '2026-10', None, None])

    def test_panel_totals(self):
        # The panel reads the real date, so the entries are made for today and yesterday.
        got = run("""c => { const t = toLocalISODate(new Date()), y = isoAddDays(t, -1);
            entries = [{day: t, section: 'foh', cost: 4.5}, {day: t, section: 'boh', cost: 10}, {day: y, section: 'foh', cost: 99}];
            wxPreset = 'today'; wxLoc = 'all'; const all = wxPanelHtml(false); wxLoc = 'boh'; const boh = wxPanelHtml(false);
            entries = []; const none = wxPanelHtml(false); return [all, boh, none]; }""")[0]
        self.assertIn('$14.50', got[0])
        self.assertIn('2 entries', got[0])
        self.assertIn('FOH $4.50 · BOH $10.00', got[0])
        self.assertIn('$10.00', got[1])
        self.assertIn('1 entry', got[1])
        self.assertIn('No waste logged for those days', got[2])
        self.assertIn('disabled', got[2])


if __name__ == '__main__':
    unittest.main()
