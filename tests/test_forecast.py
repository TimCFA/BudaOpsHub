"""The Forecast page's model and file reading (static/js/forecast.js), run
in Node on made-up numbers. Nothing here is real sales data.

Run: python3 -m unittest discover tests
"""
import datetime
import json
import os
import subprocess
import unittest

RUNNER = os.path.join(os.path.dirname(__file__), 'forecast_runner.js')


def run(cases):
    r = subprocess.run(['node', RUNNER], input=json.dumps({'cases': cases}).encode(), capture_output=True, check=True)
    return json.loads(r.stdout)


def history(weeks=8, start='2026-08-02', base=None, growth=0.0, closed_dow=(6,), labor=True):
    """Weeks of made-up days from a Sunday start. Sunday closed (left out,
    the way the sales export does it); optional growth per week."""
    base = base or {0: 0, 1: 6000, 2: 6200, 3: 6500, 4: 7000, 5: 8500, 6: 8000}
    out = {}
    d = datetime.date.fromisoformat(start)
    for i in range(weeks * 7):
        day = d + datetime.timedelta(days=i)
        dow = (day.weekday() + 1) % 7  # Python Mon=0 → JS Sun=0
        if dow == 0 or dow in closed_dow and dow != 6 and False:
            continue
        if dow == 0:
            continue
        sales = round(base[dow] * (1 + growth) ** (i // 7), 2)
        rec = {'sales': sales, 'channels': {'Drive Thru': round(sales * 0.7, 2), 'Dine In': round(sales * 0.3, 2)}}
        if labor:
            rec['laborHours'] = round(sales / 170, 1)
            rec['laborCost'] = round(rec['laborHours'] * 15.5, 2)
        out[day.isoformat()] = rec
    return out


SALES_EXPORT = (
    '\t\tTotal\tTotal\tDine In\tDine In\tDrive Thru\tDrive Thru\n'
    '\t\tSales Metric (Export)\tSecondary Metric\tSales Metric (Export)\tSecondary Metric\tSales Metric (Export)\tSecondary Metric\n'
    'Total\tTotal\t30,000.00\t-0.10\t6,000.00\t-0.1\t24,000.00\t-0.1\n'
    '20260901\t09/01/2026\t10,000.00\t-0.063\t2,000.00\t-0.094\t8,000.00\t-0.077\n'
    '20260902\t09/02/2026\t12,000.00\t-0.128\t2,500.00\t-0.161\t9,500.00\t-0.067\n'
    '20260904\t09/04/2026\t8,000.00\t-0.2\t1,500.00\t-0.1\t6,500.00\t-0.1\n'
)

LABOR_CSV = (
    'Business Date,Net Sales,Timekeeping Hours,Total Labor Cost $,Labor Cost %\n'
    '9/1/2026,"$10,000.00",60.5,"$937.75",9.4%\n'
    '9/2/2026,"$12,000.00",70,"$1,085.00",9.0%\n'
    'Total,"$22,000.00",130.5,"$2,022.75",9.2%\n'
)


class ForecastModelTest(unittest.TestCase):
    def test_weekday_averages_and_closed_sunday(self):
        hist = history()
        dow, = run([{'op': 'c => fcDowStats(fcHistoryRows(c.hist, 0))', 'hist': hist}])
        self.assertEqual(dow[0]['sales'], 0)          # never seen in 8 weeks → closed
        self.assertTrue(dow[0]['closed'])
        self.assertAlmostEqual(dow[5]['sales'], 8500, places=5)
        self.assertEqual(dow[5]['days'], 8)
        self.assertAlmostEqual(dow[1]['laborHours'], 6000 / 170, places=0)

    def test_lookback_window_is_by_date(self):
        hist = history(weeks=12)
        rows, = run([{'op': 'c => fcHistoryRows(c.hist, 4)', 'hist': hist}])
        self.assertEqual(len(rows), 24)              # 4 weeks × 6 open days
        self.assertEqual(rows[0]['date'], '2026-09-28')

    def test_trend_follows_growth_and_skips_partial_weeks(self):
        hist = history(weeks=8, growth=0.02)
        hist['2026-09-27'] = {'sales': 100}          # one day of a new week: not a full week
        a, = run([{'op': 'c => { const a = fcAnalysis(c.hist, 0); return {weeks: a.weekly.length, growth: a.trend.weeklyGrowthPct, splh: a.avgSPLH, pct: a.avgLaborPct, wage: a.avgWage}; }', 'hist': hist}])
        self.assertEqual(a['weeks'], 8)
        self.assertGreater(a['growth'], 1.5)
        self.assertLess(a['growth'], 2.5)
        self.assertAlmostEqual(a['splh'], 170, places=0)
        self.assertAlmostEqual(a['wage'], 15.5, places=1)
        self.assertAlmostEqual(a['pct'], 15.5 / 170 * 100, places=1)

    def test_baseline_carries_trend_forward_and_marks_closed(self):
        hist = history(weeks=8, growth=0.02)
        res, = run([{'op': 'c => { const a = fcAnalysis(c.hist, 0); return {fri: fcBaseline("2026-10-02", a), sun: fcBaseline("2026-10-04", a), far: fcBaseline("2026-10-09", a)}; }', 'hist': hist}])
        last_fri = hist['2026-09-25']['sales']
        self.assertGreater(res['fri']['sales'], last_fri * 0.9)   # the average, lifted by the trend
        self.assertTrue(res['sun']['closed'])
        self.assertEqual(res['sun']['sales'], 0)
        self.assertGreater(res['far']['sales'], res['fri']['sales'])  # a week further on → more growth

    def test_labor_hours_under_each_target(self):
        splh, pct, none = run([
            {'op': 'c => fcLaborHours(17000, {method: "splh", splh: 170})'},
            {'op': 'c => fcLaborHours(17000, {method: "pct", pct: 20, wage: 17})'},
            {'op': 'c => fcLaborHours(17000, {method: "pct", pct: 20, wage: null})'},
        ])
        self.assertAlmostEqual(splh, 100)
        self.assertAlmostEqual(pct, 200)
        self.assertIsNone(none)

    def test_backtest_uses_only_earlier_days(self):
        hist = history(weeks=8)
        results, = run([{'op': 'c => fcBacktest(c.hist, 6, 0)', 'hist': hist}])
        self.assertEqual(len(results), 6)
        for r in results:
            self.assertGreater(r['accuracy'], 99)    # a steady week repeats exactly
        self.assertEqual(results[-1]['date'], '2026-09-26')

    def test_accuracy_scale(self):
        exact, half, zero = run([
            {'op': 'c => fcAccuracy(100, 100)'}, {'op': 'c => fcAccuracy(100, 50)'}, {'op': 'c => fcAccuracy(100, 0)'}])
        self.assertEqual(exact, 100)
        self.assertEqual(half, 50)
        self.assertEqual(zero, 0)

    def test_channel_shares(self):
        hist = history(weeks=4)
        stats, = run([{'op': 'c => fcChannelStats(fcHistoryRows(c.hist, 0))', 'hist': hist}])
        self.assertEqual([c['name'] for c in stats['channels']], ['Drive Thru', 'Dine In'])
        self.assertAlmostEqual(stats['channels'][0]['share'], 0.7, places=3)


class ForecastFilesTest(unittest.TestCase):
    def test_sales_export_feeds_history_with_destinations(self):
        res, = run([{'op': 'c => { const hist = {}; const parsed = rpParseSales(c.text); const n = fcMergeSalesExport(parsed, hist); return {n, hist, channels: parsed.channels}; }', 'text': SALES_EXPORT}])
        self.assertEqual(res['n'], 3)
        self.assertEqual(res['hist']['2026-09-02']['sales'], 12000)
        self.assertEqual(res['hist']['2026-09-02']['channels'], {'Dine In': 2500, 'Drive Thru': 9500})
        self.assertEqual(res['channels']['Drive Thru']['sales'], 24000)   # the WIG summary is unchanged

    def test_labor_csv_is_mapped_from_headers(self):
        res, = run([{'op': 'c => { const t = fcParseTable(c.text); const map = fcGuessMap(t.headers, t.rows); const recs = fcRecordsFromTable(t, map); const hist = {"2026-09-01": {sales: 9999, channels: {"Dine In": 1}}}; const n = fcMergeRecords(recs, hist); return {map, recs, hist, n, labor: fcLooksLikeLabor(c.text)}; }', 'text': LABOR_CSV}])
        self.assertEqual(res['map'], {'date': 0, 'sales': 1, 'hours': 2, 'cost': 3, 'pct': 4})
        self.assertEqual(res['n'], 2)                   # the Total row has no date
        self.assertTrue(res['labor'])
        day = res['hist']['2026-09-01']
        self.assertEqual(day['sales'], 10000)           # the file's figure replaces the stored one
        self.assertEqual(day['laborHours'], 60.5)
        self.assertEqual(day['laborCost'], 937.75)
        self.assertEqual(day['laborPct'], 9.4)
        self.assertEqual(day['channels'], {'Dine In': 1})  # what the file doesn't carry is kept

    def test_second_header_row_is_folded(self):
        text = SALES_EXPORT
        res, = run([{'op': 'c => { const t = fcParseTable(c.text); return {headers: t.headers, cols: fcChannelColumns(t.headers), map: fcGuessMap(t.headers, t.rows)}; }', 'text': text}])
        self.assertEqual(res['headers'][2], 'Total — Sales Metric (Export)')
        self.assertEqual([c['name'] for c in res['cols']], ['Dine In', 'Drive Thru'])
        self.assertEqual(res['map']['sales'], 2)        # the Total column, not a destination
        self.assertEqual(res['map']['date'], 0)         # sniffed: 20260901 parses as a date

    def test_dates(self):
        res = run([{'op': 'c => fcDate(c.v)', 'v': v} for v in ['20260901', '9/1/2026', '9/1/26', '2026-09-01', 'Sep 1, 2026', '46266', 'Total', '', '2026-13-01']])
        self.assertEqual(res, ['2026-09-01'] * 6 + [None, None, None])

    def test_productivity_report_is_not_labor(self):
        res, = run([{'op': 'c => fcLooksLikeLabor(c.text)', 'text': 'Daypart Hours Swap,Timekeeping Hours\n7 AM,12'}])
        self.assertFalse(res)


if __name__ == '__main__':
    unittest.main()


DAYPARTS = [
    {'name': 'Early Breakfast (6:00-8:00)', 'time': '6:00'},
    {'name': 'Breakfast (8:00-11:00)', 'time': '8:00'},
    {'name': 'Lunch (11:00-2:00)', 'time': '11:00'},
    {'name': 'Transition (1:00-2:00)', 'time': '13:00'},
    {'name': 'Afternoon (2:00-5:00)', 'time': '14:00'},
    {'name': 'Dinner (5:00-8:00)', 'time': '17:00'},
    {'name': 'Close (8:00-10:00)', 'time': '20:00'},
]


class KnowTheNumbersFeedTest(unittest.TestCase):
    def test_daypart_windows_read_the_end_from_the_name(self):
        wins, = run([{'op': 'c => fcDaypartWindows(c.dp)', 'dp': DAYPARTS}])
        by = {w['name']: (w['start'], w['end']) for w in wins}
        self.assertEqual(by['Lunch (11:00-2:00)'], (660, 840))        # 11 AM – 2 PM
        self.assertEqual(by['Transition (1:00-2:00)'], (780, 840))
        self.assertEqual(by['Close (8:00-10:00)'], (1200, 1320))     # 8 PM – 10 PM, from `time`

    def test_even_split_without_a_profile(self):
        split, = run([{'op': 'c => fcSplitDay(1600, null, fcDaypartWindows(c.dp))', 'dp': DAYPARTS}])
        self.assertAlmostEqual(split['Early Breakfast (6:00-8:00)'], 200)   # 2 of 16 open hours
        self.assertAlmostEqual(split['Lunch (11:00-2:00)'], 300)
        self.assertAlmostEqual(split['Transition (1:00-2:00)'], 100)        # inside Lunch
        main = [k for k in split if not k.startswith('Transition')]
        self.assertAlmostEqual(sum(split[k] for k in main), 1600)

    def test_split_follows_the_hourly_shape(self):
        hours = {str(h * 60): {'salesPerDay': 100} for h in range(6, 22)}
        hours['720'] = {'salesPerDay': 1000}     # a noon rush
        hours['780'] = {'prod': 200, 'labor': 2}  # 1 PM from $/labor hour × hours = 400
        hours['300'] = {'salesPerDay': 5000}     # 5 AM, outside the dayparts: ignored
        res, = run([{'op': 'c => { const w = fcHourWeights(c.hours); return {w, split: fcSplitDay(2800, w, fcDaypartWindows(c.dp))}; }', 'hours': hours, 'dp': DAYPARTS}])
        self.assertEqual(res['w']['780'], 400)
        total = 14 * 100 + 1000 + 400
        self.assertAlmostEqual(res['split']['Lunch (11:00-2:00)'], 2800 * 1500 / total, places=6)
        self.assertAlmostEqual(res['split']['Transition (1:00-2:00)'], 2800 * 400 / total, places=6)
        self.assertAlmostEqual(res['split']['Dinner (5:00-8:00)'], 2800 * 300 / total, places=6)

    def test_no_usable_weights_means_even(self):
        res, = run([{'op': 'c => fcHourWeights({"420": {prod: 150}, "480": {}})'}])
        self.assertIsNone(res)

    def test_goal_from_each_target(self):
        splh, pct, none = run([
            {'op': 'c => fcGoalSplh({method: "splh", splh: 175}, {})'},
            {'op': 'c => fcGoalSplh({method: "pct", pct: 10, wage: 16}, {})'},
            {'op': 'c => fcGoalSplh({method: "splh", splh: null}, {avgSPLH: null})'},
        ])
        self.assertEqual(splh, 175)
        self.assertAlmostEqual(pct, 160)
        self.assertIsNone(none)
