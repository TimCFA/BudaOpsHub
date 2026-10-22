"""The Schedule Builder zip's other Analytics Hub dashboards (Tim, Oct 22
2026: get everything out of the zip): Productivity (by hour and by
daypart), Labor Cost and Sales Curve PDFs were set aside as pictures. They
are tables with a column per weekday, read by where each number sits under
its heading, and filed into the weekday profiles the break planner and the
Forecast's daypart goals use. A 15-minute sales file whose total matches no
day can be given its day.

Run: python3 -m unittest discover tests
Numbers are made up.
"""
import json
import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.dirname(__file__))
import analytics_pdf  # noqa: E402
from test_pin_report import make_pdf  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
WEEK = (130, 205, 280, 355, 430, 505)       # Monday … Saturday column x positions
AVG = 570


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


def head(title, extra=()):
    return [[title], ['Last Update: 10/18/2026 6:32:12 AM'], *extra]


# Hourly productivity, one week, Saturday not shown; Tuesday's 6 AM cell empty.
PROD_HOURS = make_pdf([[
    *head('Productivity', [['Custom Dates 10/12/2026 10/17/2026'], ['Labor Productivity'], ['$90.00']]),
    ['Productivity'],
    ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'AVERAGE'],
    ['6 AM', '$40.00', '', '$30.00', '$35.00', '$45.00', '$37.50'],
    ['12 PM', '$150.00', '$110.00', '$120.00', '$100.00', '$140.00', '$124.00'],
    ['8 PM', '$70.00', '$90.00', '$80.00', '$110.00', '$105.00', '$91.00'],
    ['AVERAGE', '$95.00', '$80.00', '$85.00', '$90.00', '$96.00'],
]], cols=(60,) + WEEK[:5] + (AVG,))

# By daypart, month to date: productivity, sales and hours tables.
PROD_DAYPARTS = make_pdf([[
    *head('Productivity', [['Month to Date'], ['Labor Productivity'], ['$90.00']]),
    ['Productivity'],
    ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'AVERAGE'],
    ['Breakfast', '$70.00', '$55.00', '$57.00', '$68.00', '$84.00', '$70.00', '$67.00'],
    ['Lunch', '$120.00', '$87.00', '$96.00', '$100.00', '$122.00', '$126.00', '$108.00'],
    ['Afternoon', '$90.00', '$92.00', '$100.00', '$99.00', '$108.00', '$130.00', '$103.00'],
    ['Dinner', '$80.00', '$82.00', '$89.00', '$96.00', '$92.00', '$82.00', '$87.00'],
    ['AVERAGE', '$90.00', '$78.00', '$85.00', '$92.00', '$100.00', '$97.00'],
    ['Sales $'],
    ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'AVERAGE'],
    ['Breakfast', '$4,200', '$4,500', '$4,400', '$4,700', '$6,000', '$4,800', '$4,800'],
    ['Lunch', '$9,400', '$7,700', '$7,600', '$8,500', '$11,000', '$9,600', '$8,500'],
    ['Afternoon', '$5,000', '$5,300', '$5,700', '$5,500', '$6,700', '$6,400', '$5,400'],
    ['Dinner', '$9,500', '$10,100', '$11,100', '$10,800', '$12,100', '$9,900', '$10,700'],
    ['Timekeeping Hours'],
    ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'AVERAGE'],
    ['Breakfast', '60.0', '82.0', '77.0', '69.0', '72.0', '68.0', '71.0'],
    ['Lunch', '78.0', '88.0', '79.0', '85.0', '90.0', '76.0', '78.0'],
    ['Afternoon', '56.0', '58.0', '57.0', '55.0', '62.0', '49.0', '53.0'],
    ['Dinner', '119.0', '123.0', '125.0', '113.0', '132.0', '121.0', '122.0'],
]], cols=(60,) + WEEK + (AVG,))

LABOR = make_pdf([[
    *head('Labor Cost', [['Month to Date'], ['Labor Cost %'], ['21.60%']]),
    ['% of Sales'],
    ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'AVERAGE'],
    ['6 AM', '36.75%', '39.95%', '22.30%', '29.93%', '31.15%', '87.76%', '33.91%'],
    ['12 PM', '14.14%', '19.87%', '19.19%', '18.03%', '15.21%', '15.34%', '16.68%'],
    ['10 PM', '', '', '', '', '38.23%', '54.54%', '84.28%'],
]], cols=(60,) + WEEK + (AVG,))

CURVE_HOURS = ['6 AM', '7 AM', '8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM']
CURVE = make_pdf([[
    ['Sales Curve'], ['Last Update: 10/18/2026 6:32:12 AM'], ['Month to Date'],
    ['8 AM $1,150'],                                          # a chart label, not the table
    [''] + CURVE_HOURS,
    ['Hours', '12.0', '13.0', '15.0', '17.5', '19.0', '21.5', '25.0', '22.5', '19.0', '17.0', '18.0'],
    ['Sales', '$690', '$990', '$1,150', '$1,290', '$1,430', '$2,290', '$3,030', '$2,490', '$1,760', '$1,810', '$1,990'],
    ['', '$58', '$76', '$78', '$74', '$75', '$107', '$121', '$111', '$92', '$107', '$109'],
]], cols=(20,) + tuple(70 + 48 * i for i in range(11)))


class Readers(unittest.TestCase):
    def test_productivity_by_hour(self):
        d = analytics_pdf.read_analytics_pdf(PROD_HOURS)
        self.assertEqual((d['kind'], d['by']), ('productivity', 'hour'))
        self.assertEqual((d['from'], d['to'], d['updated']), ('2026-10-12', '2026-10-17', '2026-10-18'))
        prod = d['tables']['prod']
        # The empty Tuesday cell leaves Wednesday's number under Wednesday.
        self.assertEqual(prod['360'], {'Monday': 40, 'Wednesday': 30, 'Thursday': 35, 'Friday': 45, 'AVERAGE': 37.5})
        self.assertEqual(prod['720']['Monday'], 150)
        self.assertEqual(prod['1200']['Thursday'], 110)
        self.assertEqual(prod['AVERAGE']['Friday'], 96)

    def test_productivity_by_daypart(self):
        d = analytics_pdf.read_analytics_pdf(PROD_DAYPARTS)
        self.assertEqual((d['kind'], d['by'], d['range']), ('productivity', 'daypart', 'month to date'))
        t = d['tables']
        self.assertEqual(sorted(t), ['hours', 'prod', 'sales'])
        self.assertEqual(t['prod']['Afternoon']['Saturday'], 130)
        self.assertEqual(t['sales']['Lunch']['Friday'], 11000)
        self.assertEqual(t['hours']['Dinner']['Wednesday'], 125)

    def test_labor_cost(self):
        d = analytics_pdf.read_analytics_pdf(LABOR)
        self.assertEqual((d['kind'], d['by']), ('laborCost', 'hour'))
        self.assertEqual(d['tables']['pct']['360']['Saturday'], 87.76)
        self.assertEqual(d['tables']['pct']['1320'], {'Friday': 38.23, 'Saturday': 54.54, 'AVERAGE': 84.28})

    def test_sales_curve(self):
        d = analytics_pdf.read_analytics_pdf(CURVE)
        self.assertEqual(d['kind'], 'salesCurve')
        self.assertEqual(len(d['hours']), 11)
        self.assertEqual(d['hours']['720'], {'labor': 25, 'sales': 3030, 'prod': 121})
        self.assertEqual(d['hours']['360'], {'labor': 12, 'sales': 690, 'prod': 58})

    def test_a_productivity_pdf_with_no_table(self):
        with self.assertRaises(analytics_pdf.AnalyticsPdfError):
            analytics_pdf.read_analytics_pdf(make_pdf([[['Productivity'], ['no table here']]]))


RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const js = n => fs.readFileSync(process.argv[1] + '/static/js/' + n, 'utf8');
const fn = (src, name) => src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n}\\n'))[0];
const ctx = {console, today: '2026-10-22', productivityProfiles: {}, daypartWeeks: {}, salesHistory: {},
  fcShort: iso => iso.slice(5), fcMoney: n => '$' + Math.round(n), fcRerender(){}, saveState: async () => {},
  suClock: m => `${(Math.floor(m / 60) % 12) || 12} ${m >= 720 ? 'PM' : 'AM'}`,
  recorded: [], duRecord(k, e){ ctx.recorded.push([k, e.summary]); }, breakPlanReset(){}};
vm.createContext(ctx);
vm.runInContext(js('kn-actuals.js'), ctx);
vm.runInContext(js('analytics-reports.js'), ctx);
const bp = js('break-planner.js'), fc = js('forecast.js');
vm.runInContext(fn(bp, 'breakWeekday') + fn(bp, 'breakProfileFor'), ctx);
vm.runInContext(fn(fc, 'fcDaypartKey') + fn(fc, 'fcDaypartsRatios'), ctx);
const c = JSON.parse(fs.readFileSync(0, 'utf8'));
vm.runInContext(`(async () => {
  const out = {lines: []};
  for(const [name, d] of ${JSON.stringify(c.files)}) out.lines.push(await anFileDashboard({name}, d));
  out.profiles = JSON.parse(JSON.stringify(productivityProfiles));
  // A Saturday with only labor % borrows another day's busy hours.
  out.saturday = (breakProfileFor('2026-10-24') || {}).day;
  out.monday = (breakProfileFor('2026-10-19') || {}).day;
  const wins = [{name: 'Breakfast (6:00-10:30)'}, {name: 'Lunch (10:30-2:00)'}, {name: 'Afternoon (2:00-5:00)'}, {name: 'Dinner (5:00-10:00)'}, {name: 'Late (10:00-11:00)'}];
  const p = productivityProfiles.Saturday;
  out.ratios = fcDaypartsRatios(p.dayparts, p.dayProd, wins);
  out.noRatios = fcDaypartsRatios({Lunch: {prod: 100}}, 90, wins);
  daypartWeeks = {'q:2026-10-12': {days: {Mon: {Breakfast: 1}}}};
  out.suggest = [anQuarterSuggest(new Set(['2026-10-16'])), anQuarterSuggest(new Set(['2026-10-17'])), anQuarterSuggest(new Set(['2026-10-11'])), anQuarterSuggest(new Set())];
  out.recorded = recorded;
  return out;
})()`, ctx).then(out => process.stdout.write(JSON.stringify(out)));
"""


def file_all():
    files = [['Productivity_52.pdf', analytics_pdf.read_analytics_pdf(PROD_HOURS)],
             ['Productivity_51.pdf', analytics_pdf.read_analytics_pdf(PROD_DAYPARTS)],
             ['Labor_Cost_5.pdf', analytics_pdf.read_analytics_pdf(LABOR)],
             ['Sales_Curve_11.pdf', analytics_pdf.read_analytics_pdf(CURVE)]]
    out = subprocess.run(['node', '-e', RUNNER, ROOT], input=json.dumps({'files': files}),
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


class Filing(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = file_all()

    def test_each_weekday_gets_its_hours_dayparts_and_labor(self):
        p = self.d['profiles']
        self.assertEqual(p['Monday']['hours']['720'], {'prod': 150, 'laborPct': 14.14})
        self.assertNotIn('prod', p['Tuesday']['hours'].get('360', {}))                 # the empty cell stays empty
        self.assertEqual(p['Saturday']['dayparts']['Afternoon'], {'prod': 130, 'sales': 6400, 'labor': 49})
        self.assertEqual(p['Saturday']['dayProd'], 97)
        self.assertEqual(p['Saturday']['hours']['360'], {'laborPct': 87.76})           # no hourly productivity for Saturday
        self.assertEqual(sorted(p['Monday']['sources']), ['laborCost', 'productivity-daypart', 'productivity-hour'])

    def test_the_sales_curve_is_the_all_days_profile(self):
        self.assertEqual(self.d['profiles']['All']['hours']['720'], {'prod': 121, 'labor': 25, 'salesPerDay': 3030})

    def test_what_the_upload_says(self):
        lines = self.d['lines']
        self.assertIn('Mon–Fri: sales per labor hour, hour by hour (10-12 – 10-17) → break planner', lines[0])
        self.assertIn('busiest: Mon 12 PM', lines[0])
        self.assertTrue(lines[1].startswith('Mon–Sat: sales, hours and sales per labor hour by daypart'))
        self.assertIn('→ Forecast daypart productivity goals', lines[1])
        self.assertTrue(lines[3].startswith('All days: the average hour'))
        self.assertEqual([k for k, _ in self.d['recorded']], ['productivity'] * 4)

    def test_breaks_use_a_profile_with_productivity(self):
        # Saturday has only labor % by hour: it borrows the all-days curve.
        self.assertEqual(self.d['saturday'], 'All')
        self.assertEqual(self.d['monday'], 'Monday')

    def test_forecast_goals_by_the_weekdays_own_dayparts(self):
        r = self.d['ratios']
        # Saturday: sales 30,700 over 314 hours = $97.77 a labor hour for the day.
        day = 30700 / 314
        self.assertAlmostEqual(r['Afternoon (2:00-5:00)'], 130 / day, places=4)
        self.assertAlmostEqual(r['Breakfast (6:00-10:30)'], 70 / day, places=4)
        self.assertEqual(r['Late (10:00-11:00)'], 1)                                     # a window it doesn't name
        self.assertIsNone(self.d['noRatios'])                                            # one daypart isn't enough

    def test_a_15_minute_file_with_no_match_suggests_the_next_day(self):
        # After Friday the 16th: Saturday the 17th; after Saturday: Monday
        # (closed Sundays); a day with 15-minute sales already: none; nothing filed: none.
        self.assertEqual(self.d['suggest'], ['2026-10-17', '2026-10-19', None, None])


class Wiring(unittest.TestCase):
    def test_the_bundle_reads_them(self):
        du = read('static', 'js', 'data-uploads.js')
        self.assertIn("else if(dash && ['productivity', 'laborCost', 'salesCurve'].includes(dash.kind)){ job.kind = 'productivity'; text = await anFileDashboard(job.file, dash); }", du)
        self.assertIn("duPending.push({id: ++duPendingSeq, kind: 'dayparts', need: 'date'", du)
        self.assertIn("text = await anFileQuarter(item.file, item.text, value);", du)
        self.assertNotIn('Sales_Curve|Labor_Cost|Productivity', read('static', 'js', 'upload-bundle.js'))
        fc = read('static', 'js', 'forecast.js')
        self.assertIn('const rProf = byDaypart ? pool.find(p => fcProfileRatios(p, windows)) : null;', fc)


if __name__ == '__main__':
    unittest.main()
