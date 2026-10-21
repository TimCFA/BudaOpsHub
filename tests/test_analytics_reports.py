"""The Schedule Builder's sales and labor reports (Tim, Oct 20 2026): the
upload bundle carries the week's numbers as Analytics Hub Daily Detail and
Sales Data PDFs and 15-minute sales CSVs, so they're read and filed where
the CSV exports went (salesHistory, the month-to-date sales, Know the
Numbers' dayparts).

Run: python3 -m unittest discover tests   (the 15-minute logic runs in node)
Numbers are made up.
"""
import io
import json
import os
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import analytics_pdf  # noqa: E402
import app as appmod  # noqa: E402
from test_pin_report import make_pdf  # noqa: E402


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


DAILY = make_pdf([[
    ['Daily Detail'],
    ['Date Day LY Date Sales LY Sales % Change Hours Benchmark Diff OT$ OT% Prod Bench Wage Labor% Check'],
    ['10/5/2026 Monday 10/6/2025 $25,000 $24,000 4.17% 300.50 310.00 -9.50 ($120.00) -0.50% $83.19 $80.00 $18.00 21.64% $15.10'],
    ['10/6/2026 Tuesday 10/7/20.. $26,000 $25,500 1.96% 305.25 312.00 -6.75 $40.00 0.20% $85.18 $80.00 $18.10 21.25% $15.20'],
    ['Total $51,000 $49,500 3.03% 605.75 622.00 -16.25 ($80.00) -0.30% $84.19 $80.00 $18.05 21.44% $15.15'],
    ['10/11/2026 Sunday 10/12/2025 $0 $0 0.00% 0.00 0.00 0.00 $0.00 0.00% $0.00 $0.00 $0.00 0.00% $0.00'],
]], cols=(40,))

SALES = make_pdf([[
    ['Sales Analytics'],
    ['Oct 01, 2026 - Oct 07, 2026'],
    ['Sales Details by Day'],
    ['Total Dine In Drive Thru'],
    ['10/05/2026 $25,000.50 4.17% $5,000.25 -2.00% $20,000.25 6.00%'],
    ['10/06/2026 $26,000.00 1.96% $6,000.00 3.00% $20,000.00 1.50%'],
    ['Total $60,000.00 2.50% $13,000.00 1.00% $47,000.00 3.00%'],
]], cols=(40,))


class ReadsThePdfs(unittest.TestCase):
    def test_daily_detail(self):
        out = analytics_pdf.read_analytics_pdf(DAILY)
        self.assertEqual(out['kind'], 'dailyDetail')
        rows = out['rows']
        self.assertEqual([r['date'] for r in rows], ['2026-10-05', '2026-10-06'])      # the Total row and the closed day left out
        self.assertEqual(rows[0], {'date': '2026-10-05', 'sales': 25000, 'lastYearSales': 24000, 'laborHours': 300.5, 'benchmarkHours': 310,
                                   'wage': 18, 'laborPct': 21.64, 'checkAverage': 15.1, 'lastYearDate': '2025-10-06'})
        self.assertNotIn('lastYearDate', rows[1])                                      # cut off in the PDF: the page fills it

    def test_sales_data(self):
        out = analytics_pdf.read_analytics_pdf(SALES)
        self.assertEqual(out['kind'], 'salesData')
        s = out['sales']
        # The header's range: the total covers days the table doesn't show.
        self.assertEqual((s['from'], s['to'], s['total']), ('2026-10-01', '2026-10-07', 60000))
        self.assertAlmostEqual(s['change'], 0.025)
        self.assertEqual(s['days'][0][:2], ['2026-10-05', 25000.5])
        self.assertAlmostEqual(s['days'][0][2], 0.0417)
        self.assertEqual(s['channelDays']['2026-10-05'], {'Dine In': 5000.25, 'Drive Thru': 20000.25})
        self.assertEqual(s['channels']['Drive Thru']['sales'], 47000)

    def test_other_pdfs(self):
        with self.assertRaises(analytics_pdf.AnalyticsPdfError):
            analytics_pdf.read_analytics_pdf(make_pdf([[['Team Clock PINs']]]))
        with self.assertRaises(analytics_pdf.AnalyticsPdfError):
            analytics_pdf.read_analytics_pdf(b'not a pdf')


class Route(unittest.TestCase):
    def post(self, c, data):
        return c.post('/api/reports/analytics-pdf', data={'file': (io.BytesIO(data), 'Daily_Detail_5.pdf')}, content_type='multipart/form-data')

    def test_managers_only_and_nothing_kept(self):
        c = appmod.app.test_client()
        self.assertEqual(self.post(c, DAILY).status_code, 403)
        with c.session_transaction() as sess:
            sess['manager'] = True
        r = self.post(c, DAILY)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers['Cache-Control'], 'no-store')
        self.assertEqual(len(r.get_json()['rows']), 2)
        r = self.post(c, make_pdf([[['Something else']]]))
        self.assertEqual(r.status_code, 400)
        self.assertTrue(r.get_json()['notAnalytics'])


RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const js = n => fs.readFileSync(process.argv[1] + '/static/js/' + n, 'utf8');
const ctx = {console, today: '2026-10-20', document: {getElementById: () => null},
  numbersDayparts: [{name: 'Breakfast (6:00-10:30)', time: '6:00'}, {name: 'Lunch (10:30-2:00)', time: '10:30'},
    {name: 'Afternoon (2:00-5:00)', time: '14:00'}, {name: 'Dinner (5:00-10:00)', time: '17:00'}],
  FC_WEEKS_KEEP: 12, fcShort: iso => iso, fcMoney: n => '$' + Math.round(n), fcRerender(){}, saveState: async () => {},
  recorded: [], duRecord(k, e){ ctx.recorded.push([k, e.summary]); }};
vm.createContext(ctx);
vm.runInContext(js('kn-actuals.js'), ctx);
const du = js('data-uploads.js');
vm.runInContext(du.match(/function duParseTsv\([\s\S]*?\n}\n/)[0], ctx);
vm.runInContext(js('analytics-reports.js'), ctx);
vm.runInContext('kaFill = () => ({});', ctx);
const c = JSON.parse(fs.readFileSync(0, 'utf8'));
ctx.salesHistory = c.history; ctx.daypartWeeks = c.weeks || {};
vm.runInContext(`(async () => {
  const out = {quarter: anIsQuarterCsv(${JSON.stringify(c.csv)}), other: anIsQuarterCsv('Date,Total\\n10/18/2026,25000')};
  const q = anParseQuarter(${JSON.stringify(c.csv)});
  out.total = q.total; out.date = anDateQuarter(q.total); out.parts = anDayparts(q.slots);
  try{ out.text = await anFileQuarter({name: 'CSV_DOWNLOAD_99.csv'}, ${JSON.stringify(c.csv)}); }catch(err){ out.error = [err.message, !!err.waiting]; }
  out.weeks = daypartWeeks;
  out.pdfs = ['faa3eb94-Daily_Detail_5.pdf', 'Sales_Data_34.pdf', 'Sales_Curve_11.pdf', 'pins.pdf'].map(anIsDashboardPdf);
  return out;
})()`, ctx).then(out => process.stdout.write(JSON.stringify({...out, recorded: ctx.recorded})));
"""

# Analytics Hub's 15-minute export (tab separated; the device decodes its UTF-16).
QUARTER = ('\t\tTotal\tTotal\tDine In\tDine In\n'
           '\t\tSales Metric (Export)\tSecondary Metric\tSales Metric (Export)\tSecondary Metric\n'
           'Total\tTotal\t1,000.00\t-0.1\t200.00\t0.1\n'
           '545\t5:45 AM\t0.00\t-1\t\t\n'
           '600\t6:00 AM\t100.00\t0.2\t10.00\t\n'
           '1015\t10:15 AM\t150.00\t0.1\t\t\n'
           '1030\t10:30 AM\t300.00\t0.1\t\t\n'
           '1345\t1:45 PM\t50.00\t0.1\t\t\n'
           '1400\t2:00 PM\t120.00\t0.1\t\t\n'
           '1700\t5:00 PM\t200.00\t0.1\t\t\n'
           '2145\t9:45 PM\t80.00\t0.1\t\t\n')


def quarter(history, weeks=None, csv=QUARTER):
    out = subprocess.run(['node', '-e', RUNNER, ROOT], input=json.dumps({'history': history, 'weeks': weeks, 'csv': csv}),
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


class FifteenMinuteSales(unittest.TestCase):
    def test_dated_by_the_days_sales_and_summed_into_dayparts(self):
        # Daily Detail rounds to the dollar: $1,000.40 on file still matches $1,000.00.
        d = quarter({'2026-10-12': {'sales': 1000.4}, '2026-10-13': {'sales': 1500}, '2026-10-20': {'sales': 1000}})
        self.assertTrue(d['quarter'])
        self.assertFalse(d['other'])
        self.assertEqual((d['total'], d['date']), (1000, '2026-10-12'))                   # today's (unfinished) day doesn't count
        self.assertEqual(d['parts'], {'Breakfast': 250, 'Lunch': 350, 'Afternoon': 120, 'Dinner': 280})
        self.assertEqual(d['weeks']['q:2026-10-12']['days'], {'Mon': d['parts']})
        self.assertEqual(d['weeks']['q:2026-10-12']['week'], '2026-10-12')
        self.assertEqual(d['recorded'], [['dayparts', '2026-10-12 · 15-minute sales']])
        self.assertIn('Breakfast $250', d['text'])

    def test_a_day_it_cant_date_waits(self):
        # No match, or two days that match: not filed.
        for history in ({'2026-10-13': {'sales': 1500}}, {'2026-10-12': {'sales': 1000.3}, '2026-10-05': {'sales': 999.6}}):
            d = quarter(history)
            self.assertIsNone(d['date'])
            self.assertTrue(d['error'][1])
            self.assertIn('matches no day', d['error'][0])
            self.assertEqual(d['weeks'], {})
        # Two near, one to the cent: that one.
        self.assertEqual(quarter({'2026-10-12': {'sales': 1000}, '2026-10-05': {'sales': 999.6}})['date'], '2026-10-12')

    def test_another_day_joins_its_week(self):
        weeks = {'q:2026-10-12': {'week': '2026-10-12', 'days': {'Sun': {'Breakfast': 1}}, 'at': '2026-10-19T00:00:00Z'}}
        d = quarter({'2026-10-13': {'sales': 1000}}, weeks)
        self.assertEqual(sorted(d['weeks']['q:2026-10-12']['days']), ['Sun', 'Tue'])

    def test_which_pdfs_are_asked_of_the_server(self):
        self.assertEqual(quarter({})['pdfs'], [True, True, False, False])


class Wiring(unittest.TestCase):
    def test_uploads_file_them(self):
        du = read('static', 'js', 'data-uploads.js')
        self.assertIn("if(typeof anIsQuarterCsv === 'function' && anIsQuarterCsv(text)) return 'salesQuarter';", du)
        self.assertIn("opsPdf: 2, productivity: 3, salesQuarter: 3, roster: 4};", du)    # after the PDFs that date them
        self.assertIn("if(dash && dash.kind === 'dailyDetail'){ job.kind = 'labor'; text = await anFileDailyDetail(job.file, dash.rows); }", du)
        self.assertIn("else if(dash && dash.kind === 'salesData'){ job.kind = 'sales'; text = await rpFileSales(job.file, dash.sales); }", du)
        self.assertIn('<script src="/static/js/kn-actuals.js"></script>\n<script src="/static/js/analytics-reports.js"></script>',
                      read('cfa-buda-ops-hub-complete.html'))


if __name__ == '__main__':
    unittest.main()
