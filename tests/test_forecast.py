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

# Analytics Hub "Custom by Day": the day's times down the left, one row per
# destination and measure, the measure's value under each day.
def sos_export(dt_count, mobile_count):
    rows = [
        '\t\t\t\t\t\tBusiness Date (Sad Dates)\tBusiness Date (Sad Dates)',
        'Avg Order Time\tAvg Payment Time\tAvg Total Time\tAvg Fulfillment Time\tDestination Type Breakout (group)\t\tSep 01\tSep 02',
        f'1 min 0 sec\t0 min 10 sec\t3 min 0 sec\t2 min 0 sec\tDrive Thru\tTrans Count Sos\t{dt_count}\t',
        f'1 min 0 sec\t0 min 10 sec\t4 min 0 sec\t3 min 0 sec\tDrive Thru\tTrans Count Sos\t\t{dt_count}',
        f'0 min 30 sec\t0 min 0 sec\t2 min 0 sec\t1 min 30 sec\tM: Drive Thru\tTrans Count Sos\t{mobile_count}\t',
        '0 min 0 sec\t0 min 0 sec\t1 min 0 sec\t1 min 0 sec\tDine In\tTrans Count Sos\t300\t',
    ]
    return '\n'.join(rows) + '\n'

SOS_OP = 'c => { try { const s = rpParseSos(c.text, new Date("2026-10-04T12:00:00")); return {ok: true, from: s.from, to: s.to, dt: rpSosDriveThru(s), lanes: s.destinations}; } catch(e){ return {ok: false, error: e.message}; } }'


class ForecastFilesTest(unittest.TestCase):
    def test_sales_export_feeds_history_with_destinations(self):
        res, = run([{'op': 'c => { const hist = {}; const parsed = rpParseSales(c.text); const n = fcMergeSalesExport(parsed, hist); return {n, hist, channels: parsed.channels}; }', 'text': SALES_EXPORT}])
        self.assertEqual(res['n'], 3)
        self.assertEqual(res['hist']['2026-09-02']['sales'], 12000)
        self.assertEqual(res['hist']['2026-09-02']['channels'], {'Dine In': 2500, 'Drive Thru': 9500})
        self.assertEqual(res['channels']['Drive Thru']['sales'], 24000)   # the WIG summary is unchanged

    def test_speed_of_service_is_weighted_by_cars(self):
        res, = run([{'op': SOS_OP, 'text': sos_export(1000, 500)}])
        self.assertTrue(res['ok'], res.get('error'))
        self.assertEqual((res['from'], res['to']), ('2026-09-01', '2026-09-02'))
        self.assertEqual(res['lanes']['Drive Thru']['cars'], 2000)
        self.assertAlmostEqual(res['lanes']['Drive Thru']['total'], 210)        # 3:00 and 4:00, a thousand cars each
        self.assertEqual(res['dt']['cars'], 2500)                                # both drive-thru lanes
        self.assertAlmostEqual(res['dt']['total'], (210 * 2000 + 120 * 500) / 2500)

    def test_speed_of_service_with_inflated_counts_is_refused(self):
        # A mis-set export counts millions a day (and its times are off).
        res, = run([{'op': SOS_OP, 'text': sos_export(2348056, 500)}])
        self.assertFalse(res['ok'])
        self.assertIn('2,348,056 transactions in one day', res['error'])
        self.assertIn('Export Custom by Day again', res['error'])

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

    def test_default_windows_are_the_four_dayparts(self):
        # Breakfast takes in Early Breakfast, Dinner takes in Close; Transition sits inside Lunch.
        # Analytics Hub's hours: Breakfast to 10:30, Lunch 10:30–2, Afternoon 2–5, Dinner 5–close.
        wins, = run([{'op': 'c => fcDaypartWindows()'}])
        self.assertEqual([(w['name'], w['start'], w['end']) for w in wins], [
            ('Breakfast (6:00-10:30)', 360, 630), ('Lunch (10:30-2:00)', 630, 840),
            ('Afternoon (2:00-5:00)', 840, 1020), ('Dinner (5:00-10:00)', 1020, 1320)])
        # Without a report the split follows Buda's typical mix, not the clock.
        split, = run([{'op': 'c => fcSplitDay(1600, null)'}])
        self.assertAlmostEqual(sum(split.values()), 1600)
        self.assertAlmostEqual(split['Breakfast (6:00-10:30)'], 256)     # 16%
        self.assertAlmostEqual(split['Dinner (5:00-10:00)'], 560)        # 35%
        self.assertGreater(split['Lunch (10:30-2:00)'], split['Afternoon (2:00-5:00)'])

    def test_an_hour_straddling_a_window_edge_is_shared(self):
        # The 10 o'clock hour: half to Breakfast (ends 10:30), half to Lunch.
        res, = run([{'op': 'c => { const w = fcHourWeights(c.hours); return {split: fcSplitDay(300, w), ratios: fcDaypartRatios(c.prod)}; }',
                     'hours': {'540': {'salesPerDay': 100}, '600': {'salesPerDay': 100}, '720': {'salesPerDay': 100}},
                     'prod': {'540': {'prod': 60, 'labor': 10}, '600': {'prod': 100, 'labor': 10}, '720': {'prod': 140, 'labor': 10}}}])
        self.assertAlmostEqual(res['split']['Breakfast (6:00-10:30)'], 150)
        self.assertAlmostEqual(res['split']['Lunch (10:30-2:00)'], 150)
        day = (60 * 10 + 100 * 10 + 140 * 10) / 30
        self.assertAlmostEqual(res['ratios']['Breakfast (6:00-10:30)'], ((60 * 10 + 100 * 5) / 15) / day, places=6)
        self.assertAlmostEqual(res['ratios']['Lunch (10:30-2:00)'], ((100 * 5 + 140 * 10) / 15) / day, places=6)

    def test_a_mix_set_by_hand_wins_over_the_report(self):
        hours = {str(h * 60): {'salesPerDay': 100} for h in range(6, 22)}
        res, = run([{'op': 'c => { const w = fcHourWeights(c.hours); return {report: fcSplitDay(1000, w), mix: fcSplitDay(1000, w, null, c.mix), bad: fcMixShares(c.bad, fcDaypartWindows())}; }',
                     'hours': hours, 'mix': {'Breakfast': 10, 'Lunch': 30, 'Afternoon': 20, 'Dinner': 40}, 'bad': {'Breakfast': 50, 'Lunch': 50}}])
        self.assertAlmostEqual(res['report']['Breakfast (6:00-10:30)'], 1000 * 4.5 / 16)   # the flat report: by the clock
        self.assertAlmostEqual(res['mix']['Breakfast (6:00-10:30)'], 100)
        self.assertAlmostEqual(res['mix']['Dinner (5:00-10:00)'], 400)
        self.assertIsNone(res['bad'])                                              # a mix missing dayparts is ignored

    def test_daypart_productivity_ratios(self):
        # Breakfast at $60/hr on 10 hours, lunch $120 on 10, afternoon $90 on 10, dinner $100 on 20: the day runs $94/hr.
        hours = {}
        for h, (prod, labor) in {7: (60, 5), 9: (60, 5), 12: (120, 5), 13: (120, 5), 15: (90, 10), 18: (100, 10), 20: (100, 10)}.items():
            hours[str(h * 60)] = {'prod': prod, 'labor': labor}
        res, = run([{'op': 'c => ({r: fcDaypartRatios(c.hours), none: fcDaypartRatios({"420": {prod: 60}}), d: fcDefaultRatios()})', 'hours': hours}])
        day = (60 * 10 + 120 * 10 + 90 * 10 + 100 * 20) / 50
        self.assertAlmostEqual(res['r']['Breakfast (6:00-10:30)'], 60 / day, places=6)
        self.assertAlmostEqual(res['r']['Lunch (10:30-2:00)'], 120 / day, places=6)
        self.assertAlmostEqual(res['r']['Dinner (5:00-10:00)'], 100 / day, places=6)
        self.assertIsNone(res['none'])                                             # hours without labor give no ratios
        self.assertEqual(res['d'], {'Breakfast (6:00-10:30)': 0.75, 'Lunch (10:30-2:00)': 1.16, 'Afternoon (2:00-5:00)': 1.03, 'Dinner (5:00-10:00)': 1.06})

    def test_weekly_daypart_file_learns_each_weekdays_mix(self):
        def week(mon_dinner):
            rows = ['\t\tTotal\tTotal\tDine In\tDine In', '\t\tSales Metric (Export)\tSecondary Metric\tSales Metric (Export)\tSecondary Metric', 'Total\tTotal\t60,000.00\t-0.1\t6,000.00\t-0.1']
            for dow, (b, l, a, d) in {'Mon': (1000, 3000, 2000, mon_dinner), 'Sat': (2000, 4000, 2000, 2000)}.items():
                for dp, v in zip(['Breakfast', 'Lunch', 'Afternoon', 'Dinner'], (b, l, a, d)):
                    rows.append(f'201\t{dow}, {dp}\t{v:,.2f}\t-0.05\t100.00\t0.1')
            return '\n'.join(rows) + '\n'
        res, = run([{'op': '''c => {
            const looks = c.weeks.map(fcLooksLikeDaypartWeek);
            const parsed = c.weeks.map(fcParseDaypartWeek);
            const store = {}; parsed.forEach((w, i) => { store[w.key] = {at: String(i), file: 'w' + i, total: w.total, days: w.days}; });
            return {looks, keys: parsed.map(p => p.key), total: parsed[0].total, mon: fcWeekdayMix(1, store), sat: fcWeekdayMix(6, store), tue: fcWeekdayMix(2, store), two: fcWeekdayMix(1, {a: store[parsed[0].key], b: store[parsed[1].key]})};
        }''', 'weeks': [week(4000), week(6000), week(8000)]}])
        self.assertEqual(res['looks'], [True, True, True])
        self.assertEqual(len(set(res['keys'])), 3)                   # a week is known by its day totals
        self.assertEqual(res['total'], 60000)
        self.assertEqual(res['mon']['weeks'], 3)
        self.assertAlmostEqual(res['mon']['mix']['Breakfast'], (10 + 1000 / 120 + 1000 / 140) / 3 * 1, places=6)   # mean of each week's share
        self.assertAlmostEqual(res['sat']['mix']['Lunch'], 40)
        self.assertIsNone(res['tue'])                                 # no Tuesdays on file
        self.assertIsNone(res['two'])                                 # under three weeks: not used

    def test_renamed_foh_dayparts_move_saved_data_over(self):
        res, = run([{'op': '''c => {
            posAssignments = {"foh||2026-10-06||Lunch (11:00-2:00)||iPOS 1 (Captain)": "Ava", "boh||2026-10-06||Afternoon (2:00-5:00)||Breader 1": "Mateo", "foh||2026-10-06||Afternoon (2:00-5:00)||Runner": "Noah", "foh||2026-10-06||Mid (2:00-5:00)||Host 1": "Grace"};
            posVacancyFlags = {"foh||2026-10-06||Breakfast (8:00-11:00)||Drinks 1": true};
            setupDayTypes = {"foh||2026-10-06||Lunch (11:00-2:00)": "rush"};
            setupHistory = {slots: ["foh||Lunch (11:00-2:00)||iPOS 1 (Captain)", "boh||Mid (10:30-2:00)||Breader1"], names: [], days: {}};
            const changed = suMigrateDaypartNames();
            return {changed, a: posAssignments, f: posVacancyFlags, t: setupDayTypes, h: setupHistory.slots, again: suMigrateDaypartNames()};
        }'''}])
        self.assertTrue(res['changed'])
        self.assertEqual(res['a'], {"foh||2026-10-06||Lunch (10:30-1:00)||iPOS 1 (Captain)": "Ava", "boh||2026-10-06||Afternoon (2:00-5:00)||Breader 1": "Mateo",
                                    "foh||2026-10-06||Mid (2:00-5:00)||Runner": "Noah", "foh||2026-10-06||Mid (2:00-5:00)||Host 1": "Grace"})   # BOH's Afternoon stays
        self.assertEqual(res['f'], {"foh||2026-10-06||Breakfast (8:00-10:30)||Drinks 1": True})
        self.assertEqual(res['t'], {"foh||2026-10-06||Lunch (10:30-1:00)": "rush"})
        self.assertEqual(res['h'], ["foh||Lunch (10:30-1:00)||iPOS 1 (Captain)", "boh||Mid (10:30-2:00)||Breader1"])
        self.assertFalse(res['again'])                                     # nothing left to move

    def test_sales_export_carries_last_year(self):
        res, = run([{'op': 'c => { const hist = {}; fcMergeSalesExport(rpParseSales(c.text), hist); return hist; }', 'text': SALES_EXPORT}])
        d = res['2026-09-01']
        self.assertAlmostEqual(d['lastYearSales'], 10000 / (1 - 0.063), places=2)
        self.assertEqual(d['lastYearDate'], '2025-09-02')             # the same weekday a year back

    def test_setups_dayparts_read_the_four(self):
        res, = run([{'op': 'c => c.dps.map(dp => { const n = knDaypartOf(dp); return n ? n.name : null; })',
                     'dps': DAYPARTS + [{'name': 'Breakfast (8:00-10:30)', 'time': '8:00'}, {'name': 'Mid (10:30-2:00)', 'time': '10:30'}, {'name': 'Mid (2:00-5:00)', 'time': '14:00'}, {'name': 'Lunch (10:30-1:00)', 'time': '10:30'}]}])
        self.assertEqual(res, [None, 'Breakfast (6:00-10:30)', 'Lunch (10:30-2:00)', None, 'Afternoon (2:00-5:00)', 'Dinner (5:00-10:00)', None,
                               'Breakfast (6:00-10:30)', 'Lunch (10:30-2:00)', 'Afternoon (2:00-5:00)', 'Lunch (10:30-2:00)'])

    def test_numbers_typed_under_the_seven_dayparts_fold_into_the_four(self):
        day = {
            'Early Breakfast (6:00-8:00)': {'projectedSales': '$1,000.00', 'productivityGoal': '$80.00', 'specialEvents': 'Bus group'},
            'Breakfast (8:00-11:00)': {'projectedSales': '$3,000.00', 'productivityGoal': '$120.00'},
            'Lunch (11:00-2:00)': {'projectedSales': '$8,000.00', 'productivityGoal': '$150.00'},
            'Transition (1:00-2:00)': {'projectedSales': '$2,000.00', 'specialEvents': 'Catering pickup 2pm'},
            'Dinner (5:00-8:00)': {'projectedSales': '$9,000.00'},
            'Close (8:00-10:00)': {'projectedSales': '$1,500.00', 'productivityGoal': '$90.00'},
        }
        res, = run([{'op': 'c => knNormalizeDay(c.day)', 'day': day}])
        self.assertEqual(sorted(res), ['Breakfast (6:00-10:30)', 'Dinner (5:00-10:00)', 'Lunch (10:30-2:00)'])
        self.assertEqual(res['Breakfast (6:00-10:30)'], {'projectedSales': '$4,000.00', 'productivityGoal': '$120.00', 'specialEvents': 'Bus group'})
        self.assertEqual(res['Lunch (10:30-2:00)'], {'projectedSales': '$8,000.00', 'productivityGoal': '$150.00', 'specialEvents': 'Catering pickup 2pm'})
        self.assertEqual(res['Dinner (5:00-10:00)'], {'projectedSales': '$10,500.00', 'productivityGoal': '$90.00'})
        # Already in the four: untouched.
        again, = run([{'op': 'c => knNormalizeDay(c.day)', 'day': res}])
        self.assertEqual(again, res)
        # The earlier four on 11:00 hours move over too.
        old4 = {'Breakfast (6:00-11:00)': {'projectedSales': '$5,000.00'}, 'Lunch (11:00-2:00)': {'projectedSales': '$9,000.00', 'productivityGoal': '$150.00'}}
        moved, = run([{'op': 'c => knNormalizeDay(c.day)', 'day': old4}])
        self.assertEqual(moved, {'Breakfast (6:00-10:30)': {'projectedSales': '$5,000.00'}, 'Lunch (10:30-2:00)': {'projectedSales': '$9,000.00', 'productivityGoal': '$150.00'}})

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


class LookbackPickTest(unittest.TestCase):
    def test_short_window_wins_after_a_level_shift(self):
        # 14 weeks; the last 5 run 20% higher (below the outlier line), so a
        # 4-week window should score best on the recent days.
        hist = history(weeks=14, start='2026-06-21')
        for iso in hist:
            if iso >= '2026-08-23':
                hist[iso]['sales'] = round(hist[iso]['sales'] * 1.2, 2)
        res, = run([{'op': 'c => { numbersHistory = {}; numbersData = {}; forecastSettings = {}; const p = fcLookbackPick(c.hist, 28); return {overall: p.overall, perDow: p.perDow, days: p.days, by: p.byWindow, text: fcLookbackText(p, fcAnalysis(c.hist, 0))}; }', 'hist': hist}])
        self.assertEqual(res['overall'], 4)
        self.assertEqual(res['perDow'][1:], [4] * 6)             # every open weekday has 4+ scored days
        self.assertGreater(res['by']['4'], res['by']['26'] + 3)
        self.assertEqual(res['days'], 28)
        self.assertNotIn('Sun', res['text'])

    def test_weekday_without_enough_days_uses_the_overall_window(self):
        hist = history(weeks=14, start='2026-06-21')
        for iso in list(hist):
            d = datetime.date.fromisoformat(iso)
            if d.weekday() == 0 and iso >= '2026-08-01':             # drop recent Mondays: fewer than 3 scored
                del hist[iso]
        res, = run([{'op': 'c => { numbersHistory = {}; numbersData = {}; forecastSettings = {}; const p = fcLookbackPick(c.hist, 28); return [p.perDow[1], p.overall, p.perDowAcc[1]]; }', 'hist': hist}])
        self.assertEqual(res[0], res[1])
        self.assertIsNone(res[2])

    def test_baseline_reads_each_weekdays_own_window(self):
        hist = history(weeks=14, start='2026-06-21')
        for iso in hist:
            if iso >= '2026-08-23' and datetime.date.fromisoformat(iso).weekday() == 4:   # Fridays up 20% lately
                hist[iso]['sales'] = round(hist[iso]['sales'] * 1.2, 2)
        res, = run([{'op': '''c => { numbersHistory = {}; numbersData = {}; forecastSettings = {lookback: "auto"}; salesHistory = c.hist;
            const a = fcAnalysisFor(fcSettings()); return {fri: a.lookbackPick.perDow[5], mon: a.lookbackPick.perDow[1], friBase: fcBaseline("2026-10-02", a, 0).sales, monBase: fcBaseline("2026-09-28", a, 0).sales, hasPer: !!a.perDow}; }''', 'hist': hist}])
        self.assertEqual(res['fri'], 4)
        self.assertTrue(res['hasPer'])
        self.assertGreater(res['friBase'], 8500 * 1.15)           # from the recent, higher Fridays
        self.assertLess(abs(res['monBase'] - 6000), 300)           # Mondays unchanged


class TrackRecordTest(unittest.TestCase):
    def test_log_keeps_days_ahead_and_prunes_old_ones(self):
        plan = [{'date': '2026-10-05', 'sales': 26125.4, 'baseline': 26125.4, 'adj': 0, 'model': 'weekday average'},
                {'date': '2026-10-06', 'sales': 30000, 'baseline': 27272.7, 'adj': 10, 'model': '25% last year · 75% weekday'},
                {'date': '2026-10-03', 'sales': 100, 'baseline': 100, 'adj': 0}]       # yesterday: not logged
        res, = run([{'op': 'c => { const log = {"2026-05-01": {sales: 1, baseline: 1}}; const n = fcLogPlan(c.plan, log, "2026-10-04"); return {n, log}; }', 'plan': plan}])
        self.assertEqual(res['n'], 2)
        self.assertEqual(sorted(res['log']), ['2026-10-05', '2026-10-06'])            # the May entry is older than 120 days
        self.assertEqual(res['log']['2026-10-06']['sales'], 30000)
        self.assertEqual(res['log']['2026-10-06']['baseline'], 27273)
        self.assertEqual(res['log']['2026-10-06']['adj'], 10)

    def test_track_record_scores_sent_vs_model_and_counts_helpful_adjustments(self):
        log = {
            '2026-09-28': {'sales': 30000, 'baseline': 27000, 'adj': 11, 'model': 'm'},   # adjusted up, actual 29500: helped
            '2026-09-29': {'sales': 24000, 'baseline': 26000, 'adj': -8, 'model': 'm'},   # adjusted down, actual 26500: hurt
            '2026-09-30': {'sales': 28000, 'baseline': 28000, 'adj': 0, 'model': 'm'},    # no adjustment, actual 28000
            '2026-10-05': {'sales': 26000, 'baseline': 26000, 'adj': 0, 'model': 'm'},    # not lived yet
        }
        hist = {'2026-09-28': {'sales': 29500}, '2026-09-29': {'sales': 26500}, '2026-09-30': {'sales': 28000}, '2026-10-04': {'sales': 0}}
        t, = run([{'op': 'c => fcTrackRecord(c.log, c.hist)', 'log': log, 'hist': hist}])
        self.assertEqual(t['days'], 3)
        self.assertEqual(t['waiting'], ['2026-10-05'])
        self.assertEqual([r['date'] for r in t['rows']], ['2026-09-30', '2026-09-29', '2026-09-28'])
        self.assertEqual(t['adjustedDays'], 2)
        self.assertEqual(t['adjustedHelped'], 1)
        sent = [r['accuracy'] for r in t['rows']]
        self.assertAlmostEqual(t['accuracy'], sum(sent) / 3)
        self.assertGreater(t['rows'][2]['accuracy'], t['rows'][2]['baselineAccuracy'])
        self.assertLess(t['rows'][1]['accuracy'], t['rows'][1]['baselineAccuracy'])
        self.assertAlmostEqual(t['bias'], ((30000 / 29500 - 1) + (24000 / 26500 - 1) + 0) * 100 / 3)


class WigFromDayTrackTest(unittest.TestCase):
    def test_month_to_date_from_daytrack_rows(self):
        hist = {}
        for d in range(1, 11):                        # Oct 1–10, 2026; Oct 4 is a Sunday
            day = datetime.date(2026, 10, d)
            if day.weekday() == 6:
                continue
            hist[day.isoformat()] = {'sales': 1000 * d, 'lastYearSales': 900 * d}
        hist['2026-09-30'] = {'sales': 5000, 'lastYearSales': 5000}
        res, = run([{'op': 'c => fcWigFromHistory(c.hist, "2026-10-12")', 'hist': hist}])
        m = res['mtd']
        self.assertEqual((m['from'], m['to']), ('2026-10-01', '2026-10-10'))
        self.assertEqual(m['total'], sum(1000 * d for d in range(1, 11) if d != 4))
        self.assertAlmostEqual(m['change'], 1000 / 900 - 1)
        self.assertEqual(m['gaps'], 0)
        self.assertFalse(m['estimated'])
        self.assertIsNone(res['ytd'])                 # history doesn't reach back to January

    def test_gaps_and_missing_last_year_mark_the_period_estimated(self):
        hist = {'2026-10-01': {'sales': 1000, 'lastYearSales': 800}, '2026-10-02': {'sales': 1200},      # no last-year figure
                '2026-10-06': {'sales': 1100, 'lastYearSales': 1000}}                                     # Oct 3 and 5 missing (Oct 4 is Sunday)
        res, = run([{'op': 'c => fcWigFromHistory(c.hist, "2026-10-07").mtd', 'hist': hist}])
        self.assertEqual(res['gaps'], 2)
        self.assertTrue(res['estimated'])
        self.assertAlmostEqual(res['change'], (1000 + 1100) / (800 + 1000) - 1)   # from the days that have both years

    def test_year_to_date_when_history_reaches_january(self):
        hist = {}
        d = datetime.date(2026, 1, 2)
        while d <= datetime.date(2026, 3, 15):
            if d.weekday() != 6:
                hist[d.isoformat()] = {'sales': 100, 'lastYearSales': 80}
            d += datetime.timedelta(days=1)
        res, = run([{'op': 'c => fcWigFromHistory(c.hist, "2026-03-16")', 'hist': hist}])
        self.assertEqual(res['ytd']['from'], '2026-01-01')
        self.assertEqual(res['ytd']['to'], '2026-03-14')   # the 15th is a Sunday
        self.assertAlmostEqual(res['ytd']['change'], 0.25)
        self.assertEqual(res['ytd']['gaps'], 1)       # Jan 1 itself, a holiday
        self.assertEqual(res['mtd']['from'], '2026-03-01')

    def test_no_year_to_date_across_a_gap(self):
        # Last year's rows (a year-back export) plus this autumn: the year isn't covered.
        hist = {'2025-10-06': {'sales': 100}, '2026-01-02': {'sales': 100}, '2026-09-28': {'sales': 100}, '2026-09-29': {'sales': 100}}
        res, = run([{'op': 'c => fcWigFromHistory(c.hist, "2026-10-01")', 'hist': hist}])
        self.assertIsNone(res['ytd'])
        self.assertIsNone(res['mtd'])                 # nothing in October yet

    def test_nothing_without_rows(self):
        res, = run([{'op': 'c => fcWigFromHistory({}, "2026-10-07")'}])
        self.assertIsNone(res)
