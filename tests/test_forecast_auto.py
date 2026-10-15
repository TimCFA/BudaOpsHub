"""The forecast fills Know the Numbers on its own (static/js/forecast.js,
fcAutoApply; Tim, Oct 14 2026): no "Send" or "Save". On a manager's device,
whenever what the forecast reads changes, today and the days ahead are
written; today is set once and then left for the shift; a day holding an
uploaded numbers file's figures is left alone; nothing is written twice.
Made-up sales only."""
import os
import re
import unittest

try:
    from test_forecast import history, run
except ImportError:                       # run as tests.test_forecast_auto
    from tests.test_forecast import history, run

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*p):
    with open(os.path.join(ROOT, *p), encoding='utf-8') as f:
        return f.read()


# A manager's device on Monday Oct 5 2026 with eight weeks of sales.
SETUP = '''numbersHistory = {}; numbersData = {}; forecastLog = {}; forecastSettings = {splh: 170}; daypartWeeks = {};
  salesHistory = c.hist; today = "2026-10-05"; launchManager = true; fcAutoSig = "";
  saveState = async () => {}; duRecord = () => {}; touchLastUpdated = () => {}; const L = "Lunch (10:30-2:00)";
  // The runner can't wait for a fill's save to finish; this stands in for it finishing.
  const fill = () => { fcAutoRunning = false; const n = fcAutoApply(); fcAutoRunning = false; return n; };'''
FILLED = 'Object.keys(numbersData).filter(d => Object.values(numbersData[d]).some(e => e.projectedSales)).sort()'


def case(body, **extra):
    hist = history(weeks=8, start='2026-08-09')
    return run([dict(op='c => { ' + SETUP + ' ' + body + ' }', hist=hist, **extra)])[0]


class Fill(unittest.TestCase):
    def test_today_and_the_days_ahead_fill_with_no_click(self):
        res = case('const n0 = ' + FILLED + '.length; fill(); return {n0, filled: ' + FILLED + ', logged: Object.keys(forecastLog).sort(),'
                   ' written: forecastLog["2026-10-06"].written, kn: numbersData["2026-10-06"]};')
        self.assertEqual(res['n0'], 0)
        # Today (Mon) through next Monday; Sunday the 11th is closed.
        self.assertEqual(res['filled'], ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-12'])
        self.assertEqual(res['logged'], res['filled'])
        self.assertEqual(sorted(res['written']), sorted(k for k, v in res['kn'].items() if v.get('projectedSales')))
        for dp, v in res['kn'].items():
            self.assertEqual(v['projectedSales'], res['written'][dp])
            self.assertTrue(v['productivityGoal'].startswith('$'))

    def test_running_again_writes_nothing(self):
        res = case('fill(); const again = fcAutoPlan(); return [again.plan.length, again.kept];')
        self.assertEqual(res, [0, []])

    def test_a_change_updates_the_days_ahead_but_not_today(self):
        res = case('fill(); const t0 = JSON.stringify(numbersData["2026-10-05"]), w0 = numbersData["2026-10-07"][L].projectedSales;'
                   ' forecastSettings = Object.assign({}, forecastSettings, {adjustments: {"2026-10-05": 20, "2026-10-07": 20}});'
                   ' const p = fcAutoPlan().plan.map(x => x.date); fill();'
                   ' return [p, JSON.stringify(numbersData["2026-10-05"]) === t0, w0, numbersData["2026-10-07"][L].projectedSales];')
        dates, today_same, before, after = res
        self.assertEqual(dates, ['2026-10-07'])          # today is set for the shift
        self.assertTrue(today_same)
        self.assertGreater(float(re.sub(r'[^0-9.]', '', after)), float(re.sub(r'[^0-9.]', '', before)) * 1.15)

    def test_an_empty_today_still_fills(self):
        res = case('numbersData["2026-10-06"] = {[L]: {projectedSales: "$9,000.00"}}; const p = fcAutoPlan(); return [p.plan[0].date, p.kept];')
        self.assertEqual(res, ['2026-10-05', ['2026-10-06']])

    def test_a_numbers_file_day_is_left_alone_until_asked(self):
        res = case('fill(); numbersData["2026-10-08"][L].projectedSales = "$9,999.00";'
                   ' const p = fcAutoPlan(); fill(); const kept = numbersData["2026-10-08"][L].projectedSales; const html = fcAutoStatusHtml();'
                   ' return [p.kept, kept, html.includes("keeps the numbers from an uploaded file"), html.includes("fcUseForecast")];')
        self.assertEqual(res, [['2026-10-08'], '$9,999.00', True, True])

    def test_days_sent_by_hand_before_this_change_count_as_the_forecasts(self):
        res = case('const p0 = fcNumbersPlan(["2026-10-07"])[0]; fcApplyNumbers([p0]); delete forecastLog["2026-10-07"].written;'
                   ' return [fcOwnsDay("2026-10-07"), fcOwnsDay("2026-10-09")];')
        self.assertEqual(res, [True, True])

    def test_past_days_and_actuals_are_never_touched(self):
        res = case('numbersData["2026-10-03"] = {[L]: {projectedSales: "$1.00"}}; numbersData["2026-10-06"] = {[L]: {actualSales: "$8,000.00", specialEvents: "Game"}};'
                   ' fill(); return [numbersData["2026-10-03"][L].projectedSales, numbersData["2026-10-06"][L].actualSales, numbersData["2026-10-06"][L].specialEvents, !!numbersData["2026-10-06"][L].projectedSales];')
        self.assertEqual(res, ['$1.00', '$8,000.00', 'Game', True])


class WhoAndWhen(unittest.TestCase):
    def test_only_a_managers_device_with_sales_history_fills(self):
        res = case('launchManager = false; const a = (fill(), ' + FILLED + '.length); launchManager = true; salesHistory = {}; const b = (fill(), ' + FILLED + '.length); return [a, b];')
        self.assertEqual(res, [0, 0])

    def test_the_check_runs_only_when_what_the_forecast_reads_changes(self):
        res = case('let runs = 0; setTimeout = () => { runs++; return 1; }; clearTimeout = () => {};'
                   ' fcAutoCheck(); fcAutoCheck(); numbersData["2026-10-06"] = {}; fcAutoCheck();'
                   ' forecastSettings = Object.assign({}, forecastSettings, {splh: 180}); fcAutoCheck(); launchManager = false; forecastSettings = {}; fcAutoCheck(); return runs;')
        self.assertEqual(res, 2)        # once at first, once for the goal; not for Know the Numbers itself, nor off a manager's device

    def test_wired_to_saves_synced_data_and_sign_in(self):
        storage, launch = read('static', 'js', 'storage.js'), read('static', 'js', 'launch-mode.js')
        save = storage[storage.index('function saveState(){'):]
        self.assertLess(save.index('fcAutoCheck()'), save.index('saveInFlight = (async'))
        apply = storage[storage.index('function applyStateData(data){'):storage.index('const STATE_SYNC_EVERY')]
        self.assertIn('fcAutoCheck()', apply)
        setm = launch[launch.index('async function launchSetManager'):]
        self.assertLess(setm.index('await syncState()'), setm.index('fcAutoCheck()'))

    def test_no_send_or_save_buttons_left(self):
        page = read('cfa-buda-ops-hub-complete.html') + read('static', 'js', 'forecast.js') + read('static', 'js', 'data-uploads.js')
        for gone in ('Send to Know the Numbers', 'Save to Know the Numbers', 'fcNumbersSave', 'Fill from the Forecast'):
            self.assertNotIn(gone, page)


if __name__ == '__main__':
    unittest.main()
