"""Manage → Numbers (static/js/know-numbers.js): a month calendar where a day
is tapped to type its actual sales and productivity (Tim, Oct 2026). The
projections come from the Forecast or the numbers file, special events from
the Events calendar, so neither is typed here."""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, 'tests', 'kn_runner.js')

B, L, A, D = 'Breakfast (6:00-10:30)', 'Lunch (10:30-2:00)', 'Afternoon (2:00-5:00)', 'Dinner (5:00-10:00)'


def run(*ops, **extra):
    cases = [dict(op=op, **extra) for op in ops]
    out = subprocess.run(['node', RUNNER], input=json.dumps({'cases': cases}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def day(**parts):
    """{daypart: entry} with a projection on every daypart, plus the given actuals."""
    out = {dp: {'projectedSales': '$3,000.00', 'productivityGoal': '$95.00'} for dp in (B, L, A, D)}
    for dp, (s, p) in parts.items():
        out[{'B': B, 'L': L, 'A': A, 'D': D}[dp]].update({'actualSales': s, 'actualProductivity': p})
    return out


class DayState(unittest.TestCase):
    def state(self, data, iso, now=23 * 60):
        return run(f"c => {{ numbersData = c.data; return knDayState(c.iso, c.now); }}", data=data, iso=iso, now=now)[0]

    def test_past_days(self):
        full = day(B=('$3,100.00', '$97.00'), L=('$3,100.00', '$97.00'), A=('$3,100.00', '$97.00'), D=('$3,100.00', '$97.00'))
        self.assertEqual(self.state({'2026-10-06': full}, '2026-10-06'), 'done')
        self.assertEqual(self.state({'2026-10-06': day(B=('$3,100.00', '$97.00'))}, '2026-10-06'), 'part')
        self.assertEqual(self.state({'2026-10-06': day(B=('$3,100.00', ''))}, '2026-10-06'), 'part')   # sales without productivity isn't done
        self.assertEqual(self.state({'2026-10-06': day()}, '2026-10-06'), 'due')
        self.assertEqual(self.state({}, '2026-10-06'), 'empty')          # nothing planned: not flagged

    def test_today_counts_only_the_dayparts_that_are_over(self):
        # 11:00: only Breakfast is over.
        self.assertEqual(self.state({'2026-10-08': day(B=('$3,100.00', '$97.00'))}, '2026-10-08', now=11 * 60), 'done')
        self.assertEqual(self.state({'2026-10-08': day()}, '2026-10-08', now=8 * 60), 'plan')

    def test_ahead_shows_the_plan(self):
        self.assertEqual(self.state({'2026-10-12': day()}, '2026-10-12'), 'plan')

    def test_older_days_come_from_history(self):
        got = run("""c => { numbersHistory = {'2026-09-01': {'Lunch (10:30-2:00)': [4000, 100, '', 4200, 104]}};
            return [knDayEntries('2026-09-01')['Lunch (10:30-2:00)'], knIsLive('2026-09-01'), knIsLive('2026-09-24')]; }""")[0]
        self.assertEqual(got[0]['projectedSales'], '$4,000.00')
        self.assertEqual(got[0]['actualSales'], '$4,200.00')
        self.assertEqual(got[1:], [False, True])


class Month(unittest.TestCase):
    def test_monday_to_saturday(self):
        weeks = run("c => knMonthWeeks('2026-10')")[0]
        self.assertEqual(weeks[0], [None, None, None, '2026-10-01', '2026-10-02', '2026-10-03'])   # Oct 1 is a Thursday
        self.assertEqual(weeks[-1], ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'])
        self.assertTrue(all(len(w) == 6 for w in weeks))
        self.assertNotIn('2026-10-04', sum(weeks, []))                  # closed Sundays aren't drawn

    def test_default_day_skips_sunday(self):
        self.assertEqual(run("c => { today = '2026-10-11'; const d = knDefaultDay(); today = '2026-10-08'; return d; }")[0], '2026-10-10')


class Panel(unittest.TestCase):
    def panel(self, iso, data):
        return run("c => { numbersData = c.data; knDay = c.iso; return knDayPanelHtml(); }", iso=iso, data=data)[0]

    def test_only_the_actuals_are_typed(self):
        html = self.panel('2026-10-06', {'2026-10-06': day()})
        self.assertEqual(html.count('data-kn-field="actualSales"'), 4)
        self.assertEqual(html.count('data-kn-field="actualProductivity"'), 4)
        self.assertNotIn('data-kn-field="projectedSales"', html)
        self.assertNotIn('data-kn-field="productivityGoal"', html)
        self.assertNotIn('data-kn-field="specialEvents"', html)
        self.assertIn('Projected <b>$3,000</b> · Goal <b>$95</b>', html)

    def test_ahead_and_old_days_are_read_only(self):
        self.assertNotIn('data-kn-field', self.panel('2026-10-12', {'2026-10-12': day()}))
        self.assertIn('Actuals open on the day', self.panel('2026-10-12', {'2026-10-12': day()}))
        self.assertNotIn('data-kn-field', self.panel('2026-09-01', {}))

    def test_typed_text_is_escaped(self):
        html = self.panel('2026-10-06', {'2026-10-06': {B: {'projectedSales': '$1.00', 'specialEvents': '<img src=x onerror=alert(1)>', 'actualSales': '"><b>'}}})
        self.assertNotIn('<img', html)
        self.assertIn('value="&quot;&gt;&lt;b&gt;"', html)


if __name__ == '__main__':
    unittest.main()
