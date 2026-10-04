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


# The shape of the Analytics Hub DayTrack Table export (made-up numbers):
# a Tableau week-code column first, a Total row per week, a $0 Sunday.
DAYTRACK = (
    "str(DATEPART('year', [Business Date]))+'-'+str(DATEPART('wee...\tCurrent Year's Date\tDay of Week\tLast Year's Date\tThis Year's Sales\tLast Year's Sales\tSales % Chg. vs Last Year\tTimekeeping Hours\tBenchmark Hours\tHours Difference (Benchmark)\tEst. Labor Cost Opportunity ($)\tEst. Labor Cost Opportunity (%)\tLabor Productivity\tBenchmark Productivity\tEffective Wage Rate\tLabor Cost %\tCheck Average\n"
    "2026-36\t9/1/2026\tTuesday\t9/2/2025\t$20,000\t$22,000\t-9.09%\t200.00\t210.00\t-10.00\t($180.00)\t-0.90%\t$100.00\t$95.24\t$18.00\t18.00%\t$15.00\n"
    "2026-36\t9/2/2026\tWednesday\t9/3/2025\t$24,000\t$20,000\t20.00%\t240.00\t250.00\t-10.00\t($180.00)\t-0.75%\t$100.00\t$96.00\t$18.00\t18.00%\t$16.00\n"
    "2026-36\tTotal\tTotal\tTotal\t$44,000\t$42,000\t4.76%\t440.00\t460.00\t-20.00\t($360.00)\t-0.82%\t$100.00\t$95.65\t$18.00\t18.00%\t$15.50\n"
    "2026-37\t9/6/2026\tSunday\t9/7/2025\t$0\t$0\t\t24.00\t0.00\t24.00\t\t\t$0.00\t\t\t\t\n"
    "Grand Total\tTotal\tTotal\tTotal\t$44,000\t$42,000\t4.76%\t464.00\t460.00\t4.00\t($360.00)\t-0.82%\t$94.83\t$95.65\t$18.00\t18.00%\t$15.50\n"
)


class DayTrackTest(unittest.TestCase):
    def test_daytrack_columns_are_read(self):
        res, = run([{'op': 'c => { const t = fcParseTable(c.text); const map = fcGuessMap(t.headers, t.rows); const recs = fcRecordsFromTable(t, map); const hist = {}; const n = fcMergeRecords(recs, hist); return {map, n, hist, labor: fcLooksLikeLabor(c.text)}; }', 'text': DAYTRACK}])
        self.assertTrue(res['labor'])
        self.assertEqual(res['map']['date'], 1)              # not the week code that mentions [Business Date]
        self.assertEqual(res['map']['sales'], 4)             # this year's, not last year's
        self.assertEqual(res['map']['hours'], 7)             # timekeeping, not benchmark
        self.assertNotIn('cost', res['map'])                 # the "opportunity" column is not labor cost
        self.assertEqual(res['map']['pct'], 15)
        self.assertEqual(res['map']['wage'], 14)
        self.assertEqual(res['map']['lastYearSales'], 5)
        self.assertEqual(res['map']['lastYearDate'], 3)
        self.assertEqual(res['map']['benchmarkHours'], 8)
        self.assertEqual(res['map']['checkAvg'], 16)
        self.assertEqual(res['n'], 3)                        # three dated rows; Total rows skipped
        day = res['hist']['2026-09-01']
        self.assertEqual(day['sales'], 20000)
        self.assertEqual(day['lastYearSales'], 22000)
        self.assertEqual(day['lastYearDate'], '2025-09-02')
        self.assertEqual(day['laborHours'], 200)
        self.assertEqual(day['laborPct'], 18)
        self.assertEqual(day['wage'], 18)
        self.assertEqual(day['checkAverage'], 15)
        self.assertEqual(res['hist']['2026-09-06']['sales'], 0)

    def test_zero_sales_days_are_closed_not_averaged(self):
        hist = history(weeks=6)
        hist['2026-09-06'] = {'sales': 0, 'laborHours': 24}           # a Sunday logged as $0
        hist['2026-09-10'] = {'sales': 0}                              # a Thursday closed for a day
        res, = run([{'op': 'c => { const a = fcAnalysis(c.hist, 0); return {sun: a.dow[0], thu: a.dow[4], weeks: a.weekly.length, splh: a.avgSPLH, bt: fcBacktest(c.hist, 3, 0).map(r => r.date)}; }', 'hist': hist}])
        self.assertTrue(res['sun']['closed'])
        self.assertEqual(res['sun']['sales'], 0)
        self.assertAlmostEqual(res['thu']['sales'], 7000, places=5)   # the $0 day is left out of Thursday's average
        self.assertEqual(res['thu']['days'], 5)
        self.assertAlmostEqual(res['splh'], 170, places=0)             # Sunday's 24 hours don't count
        self.assertNotIn('2026-09-10', res['bt'])                      # closed days aren't scored

    def test_vs_last_year(self):
        hist = {f'2026-09-0{i}': {'sales': 110 * i, 'lastYearSales': 100 * i} for i in range(1, 7)}
        hist['2026-09-07'] = {'sales': 50}                                   # no last-year figure: left out
        res, = run([{'op': 'c => { const a = fcAnalysis(c.hist, 0); return [a.vsLastYearPct, a.lastYearDays]; }', 'hist': hist}])
        self.assertAlmostEqual(res[0], 10)
        self.assertEqual(res[1], 6)


class LastYearTest(unittest.TestCase):
    def seasonal(self):
        """This year is last year's same weekday × 1.10, with last year's
        rows present as their own days (a year-back export), plus a
        Sunday-closed pattern. The last-year model should win outright."""
        hist = {}
        base = {1: 6000, 2: 6200, 3: 6500, 4: 7000, 5: 8500, 6: 8000}
        start = datetime.date(2025, 8, 3)                 # a Sunday
        for i in range(12 * 7):
            ly_day = start + datetime.timedelta(days=i)
            dow = (ly_day.weekday() + 1) % 7
            if dow == 0:
                continue
            swing = 1.3 if (i // 7) % 2 else 0.8          # alternate weeks swing, both years alike
            ly_sales = round(base[dow] * swing, 2)
            hist[ly_day.isoformat()] = {'sales': ly_sales}
            ty_day = ly_day + datetime.timedelta(days=364)
            if ty_day <= datetime.date(2026, 9, 26):
                hist[ty_day.isoformat()] = {'sales': round(ly_sales * 1.10, 2), 'lastYearSales': ly_sales, 'lastYearDate': ly_day.isoformat()}
        return hist

    def test_last_year_map_prefers_a_days_own_row_and_respects_cutoff(self):
        hist = {
            '2026-09-01': {'sales': 100, 'lastYearSales': 90, 'lastYearDate': '2025-09-02'},
            '2025-09-02': {'sales': 95},
            '2026-09-03': {'sales': 120},
        }
        full, cut = run([
            {'op': 'c => fcLastYearMap(c.hist)', 'hist': hist},
            {'op': 'c => fcLastYearMap(c.hist, "2026-09-02")', 'hist': hist},
        ])
        self.assertEqual(full['2025-09-02'], 95)          # the day's own row wins over the carried figure
        self.assertEqual(full['2026-09-03'], 120)
        self.assertNotIn('2026-09-03', cut)               # this year's rows after the cutoff are unknown
        self.assertEqual(cut['2025-09-02'], 95)

    def test_run_rate_needs_a_week_of_pairs(self):
        rows = [{'date': f'2026-09-0{i}', 'sales': 110, 'lastYearSales': 100} for i in range(1, 6)]
        short, full = run([
            {'op': 'c => fcYoyRatio(c.rows, {})', 'rows': rows},
            {'op': 'c => fcYoyRatio(c.rows, {})', 'rows': rows + [{'date': '2026-09-06', 'sales': 220, 'lastYearSales': 200}]},
        ])
        self.assertIsNone(short['ratio'])
        self.assertAlmostEqual(full['ratio'], 1.1)
        self.assertEqual(full['days'], 6)

    def test_baseline_blends_and_flags_a_closed_day_last_year(self):
        hist = history(weeks=8)                           # 2026-08-02 … 2026-09-26, Sunday closed
        for iso in list(hist):
            d = datetime.date.fromisoformat(iso)
            hist[iso]['lastYearSales'] = 1000
            hist[iso]['lastYearDate'] = (d - datetime.timedelta(days=364)).isoformat()
        hist['2025-10-03'] = {'sales': 2000}              # Friday a year before 2026-10-02
        hist['2025-10-04'] = {'sales': 0}                 # Saturday a year before 2026-10-03: closed
        res, = run([{'op': 'c => { const a = fcAnalysis(c.hist, 0); return {ratio: a.yoyRatio, w0: fcBaseline("2026-10-02", a, 0), w1: fcBaseline("2026-10-02", a, 1), half: fcBaseline("2026-10-02", a, 0.5), sat: fcBaseline("2026-10-03", a, 1), none: fcBaseline("2026-10-01", a, 1)}; }', 'hist': hist}])
        ratio = res['ratio']
        self.assertGreater(ratio, 1)                      # this year runs well above the flat $1,000 "last year"
        self.assertAlmostEqual(res['w1']['sales'], 2000 * ratio, places=3)
        self.assertAlmostEqual(res['w0']['sales'], res['w0']['dowSales'], places=6)
        self.assertAlmostEqual(res['half']['sales'], (res['w0']['sales'] + res['w1']['sales']) / 2, places=3)
        self.assertEqual(res['w1']['lastYearDate'], '2025-10-03')
        self.assertTrue(res['sat']['closedLastYear'])
        self.assertAlmostEqual(res['sat']['sales'], res['sat']['dowSales'], places=6)   # the weekday figure stands
        self.assertIsNone(res['none']['yoySales'])        # no figure for that day a year ago
        self.assertAlmostEqual(res['none']['sales'], res['none']['dowSales'], places=6)

    def test_backtest_picks_last_year_when_the_year_repeats(self):
        hist = self.seasonal()
        res, = run([{'op': 'c => { const sc = fcBacktestScores(c.hist, 28, 0); return {best: fcBestYoyWeight(c.hist, 0), acc: sc.byWeight, w: fcModelWeight("auto", c.hist, 0), fixed: [fcModelWeight("weekday"), fcModelWeight("lastyear"), fcModelWeight("blend")]}; }', 'hist': hist}])
        self.assertEqual(res['best'], 1)
        self.assertGreater(res['acc']['1'], res['acc']['0'] + 5)
        self.assertEqual(res['w'], 1)
        self.assertEqual(res['fixed'], [0, 1, 0.5])

    def test_scores_absent_without_last_year(self):
        res, = run([{'op': 'c => [fcBacktestScores(c.hist, 14, 0), fcBestYoyWeight(c.hist, 0)]', 'hist': history(weeks=6)}])
        self.assertEqual(res, [None, 0])


class UnusualDaysTest(unittest.TestCase):
    def test_outlier_and_event_days_are_left_out(self):
        hist = history(weeks=8)                       # Fridays 8500
        hist['2026-09-11']['sales'] = 14000           # a Friday +65%: outlier
        hist['2026-09-18']['sales'] = 8600            # a normal Friday, flagged as an event day
        res, = run([{'op': '''c => { numbersHistory = {"2026-09-18": {"Lunch (11:00-2:00)": [9000, 170, "Home game"]}}; numbersData = {};
            const a = fcAnalysis(c.hist, 0); const off = fcAnalysis(c.hist, 0, null, {unusual: false});
            return {left: a.left.map(r => [r.date, r.unusual.kind, r.unusual.text || Math.round(r.unusual.pct)]), fri: a.dow[5].sales, friDays: a.dow[5].days, offFri: off.dow[5].sales, offLeft: off.left.length,
              trendWeek: a.weekly.find(w => w.week === "2026-09-06").sales, yoyDays: a.yoyDays, event: fcEventFor("2026-09-18")}; }''', 'hist': hist}])
        self.assertEqual(res['left'], [['2026-09-11', 'outlier', 65], ['2026-09-18', 'event', 'Home game']])
        self.assertAlmostEqual(res['fri'], 8500, places=5)             # the average is the six normal Fridays
        self.assertEqual(res['friDays'], 6)
        self.assertGreater(res['offFri'], 9000)                          # with the switch off they count
        self.assertEqual(res['offLeft'], 0)
        self.assertAlmostEqual(res['trendWeek'], 6000 + 6200 + 6500 + 7000 + 8500 + 8000, places=5)   # the outlier week counts the Friday median
        self.assertEqual(res['event'], 'Home game')

    def test_needs_enough_days_before_calling_one_unusual(self):
        hist = history(weeks=2)                       # two of each weekday
        hist['2026-08-07']['sales'] = 20000
        res, = run([{'op': 'c => { numbersHistory = {}; numbersData = {}; return fcAnalysis(c.hist, 0).left.length; }', 'hist': hist}])
        self.assertEqual(res, 0)

    def test_run_rate_skips_unusual_days(self):
        hist = history(weeks=8)
        for iso in hist:
            hist[iso]['lastYearSales'] = hist[iso]['sales'] / 1.1
        hist['2026-09-11']['sales'] = 14000           # outlier this year; its last-year figure is normal
        res, = run([{'op': 'c => { numbersHistory = {}; numbersData = {}; const a = fcAnalysis(c.hist, 0); return [a.yoyRatio, a.yoyDays]; }', 'hist': hist}])
        self.assertAlmostEqual(res[0], 1.1, places=6)
        self.assertEqual(res[1], 47)
