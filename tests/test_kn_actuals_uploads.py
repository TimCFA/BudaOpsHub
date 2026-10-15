"""Know the Numbers actuals from the uploads (static/js/kn-actuals.js; Tim,
Oct 14 2026): actual sales by daypart from the weekly daypart export (dated
by matching its day totals against the daily sales on file), actual
productivity from the punch report's hours in each daypart, and the punch
report accepted by the Data Uploads drop zone (to Points and Know the
Numbers). A number a leader typed is never replaced. Made-up names and sales.
Monday Oct 12 2026 is "today"."""
import json
import os
import subprocess
import unittest

import app as appmod

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, 'tests', 'kn_actuals_runner.js')


def run(op):
    out = subprocess.run(['node', RUNNER], input=json.dumps({'cases': [{'op': op}]}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[0]


def read(*p):
    with open(os.path.join(ROOT, *p), encoding='utf-8') as f:
        return f.read()


# The week of Mon Oct 5 in the daypart export, and the same days' sales on file
# (Monday 1% off, as two reports can be).
WEEK = """
  const week = {days: {Mon: {Breakfast: 800, Lunch: 1500, Afternoon: 700, Dinner: 1000},
                       Tue: {Breakfast: 900, Lunch: 1600, Afternoon: 500, Dinner: 2000}}};
  daypartWeeks = {w1: week};
  salesHistory = {'2026-10-05': {sales: 4040}, '2026-10-06': {sales: 5000}, '2026-09-29': {sales: 4000}, '2026-09-28': {sales: 9000}};
"""


class Labor(unittest.TestCase):
    def test_hours_are_cut_to_each_daypart(self):
        got = run("c => { const dates = kaRecordLabor(APS.parseReport(REPORT)); return [dates, laborByDaypart['2026-10-06']]; }")
        dates, day = got
        self.assertEqual(dates, ['2026-10-06'])
        # Maya 6:08-11:00 + 11:30-2:00, Ana 5-10pm, Ben 10-2; Aurora never clocked out (not counted).
        self.assertEqual({k: day[k] for k in ('Breakfast', 'Lunch', 'Afternoon', 'Dinner', 'total', 'people', 'missingOut')},
                         {'Breakfast': 4.87, 'Lunch': 6.5, 'Afternoon': 0, 'Dinner': 5, 'total': 16.37, 'people': 3, 'missingOut': 1})

    def test_only_finished_days_and_kept_for_a_while(self):
        got = run("c => { laborByDaypart = {'2026-05-01': {total: 1}}; today = '2026-10-06'; const d = kaRecordLabor(APS.parseReport(REPORT)); return [d, Object.keys(laborByDaypart)]; }")
        self.assertEqual(got, [[], []])     # Oct 6 isn't over yet; May is past 120 days

    def test_the_key_is_private_and_saved_with_the_forecast(self):
        self.assertEqual(appmod.SECTION_OF_KEY['laborByDaypart'], 'forecast')
        self.assertIn('forecast', appmod.PRIVATE_SECTIONS)
        self.assertIn('laborByDaypart', appmod.MANAGER_ONLY_KEYS)


class Dating(unittest.TestCase):
    def test_a_week_is_dated_by_its_day_totals(self):
        got = run("c => { " + WEEK + " return [kaDateWeek(week), kaDateWeek({days: {Mon: {Lunch: 9000}}}), kaDateWeek({days: {Mon: {Lunch: 7000}}})]; }")
        self.assertEqual(got, ['2026-10-05', '2026-09-28', None])   # Oct 5 within 1%; a $9,000 Monday is Sep 28; no Monday is $7,000

    def test_an_undated_week_waits(self):
        got = run("c => { " + WEEK + " salesHistory = {}; const f = kaFill(); return [f, week.week || null, numbersData]; }")
        self.assertEqual(got, [{'sales': 0, 'productivity': 0, 'undated': 1}, None, {}])


class Fill(unittest.TestCase):
    def test_sales_from_the_export_and_productivity_from_the_hours(self):
        got = run("c => { " + WEEK + " kaRecordLabor(APS.parseReport(REPORT)); numbersData = {'2026-10-06': {[L('Lunch')]: {actualSales: '$1,300.00', actualProductivity: ''}}};"
                  " const f = kaFill(); const d = numbersData['2026-10-06']; return [f, week.week, Object.fromEntries(Object.entries(d).map(([k, v]) => [k.split(' ')[0], [v.actualSales, v.actualProductivity || '']])), numbersData['2026-10-05'][L('Dinner')].actualSales]; }")
        filled, monday, tue, mon_dinner = got
        self.assertEqual(monday, '2026-10-05')
        self.assertEqual(tue['Lunch'], ['$1,300.00', '$200.00'])        # typed sales kept; 1,300 ÷ 6.5 hrs
        self.assertEqual(tue['Breakfast'], ['$900.00', '$184.80'])      # 900 ÷ 4.87 hrs
        self.assertEqual(tue['Dinner'], ['$2,000.00', '$400.00'])       # 2,000 ÷ 5 hrs
        self.assertEqual(tue['Afternoon'], ['$500.00', ''])            # nobody clocked in that daypart
        self.assertEqual(mon_dinner, '$1,000.00')
        self.assertEqual(filled, {'sales': 7, 'productivity': 3, 'undated': 0})

    def test_typed_numbers_are_never_replaced_and_running_twice_adds_nothing(self):
        got = run("c => { " + WEEK + " kaRecordLabor(APS.parseReport(REPORT)); numbersData = {'2026-10-06': {[L('Dinner')]: {actualSales: '$1,999.00', actualProductivity: '$123.00'}}};"
                  " kaFill(); const again = kaFill(); const e = numbersData['2026-10-06'][L('Dinner')]; return [again, e.actualSales, e.actualProductivity]; }")
        self.assertEqual(got, [{'sales': 0, 'productivity': 0, 'undated': 0}, '$1,999.00', '$123.00'])

    def test_today_and_later_are_left_for_the_leaders(self):
        got = run("c => { " + WEEK + " today = '2026-10-06'; kaFill(); return [Object.keys(numbersData).sort()]; }")
        self.assertEqual(got, [['2026-10-05']])

    def test_older_days_go_into_the_archive(self):
        got = run("c => { " + WEEK + " laborByDaypart = {'2026-10-06': {Lunch: 6.5}}; today = '2026-10-30'; numbersHistory = {'2026-10-06': {[L('Lunch')]: [1500, 100, '']}};"
                  " const f = kaFill(); return [f, numbersHistory['2026-10-06'][L('Lunch')], numbersHistory['2026-10-06'][L('Dinner')], Object.keys(numbersData)]; }")
        filled, lunch, dinner, live = got
        self.assertEqual(lunch, [1500, 100, '', 1600, 246.15])
        self.assertEqual(dinner, [None, None, '', 2000, None])
        self.assertEqual(live, [])


class PunchReport(unittest.TestCase):
    def test_the_drop_zone_files_it_to_points_and_know_the_numbers(self):
        got = run("c => kaImportPunchReport({name: 'ActualVsScheduled.pdf'}, APS.parseReport(REPORT)).then(text => [text, Object.keys(pointsRecords['2026-Q4'] || {}).sort(),"
                  " (pointsRecords['2026-Q4']['torres-maya'].events || []).map(e => e.type), !!laborByDaypart['2026-10-06'], logs.filter(l => l[0] === 'punch').length, saves])")
        text, people, maya, hours, punch_logs, saves = got
        self.assertIn('Oct 5 – Oct 11: ', text)
        self.assertIn('→ Points', text)
        self.assertIn('need', text)                          # Ben's unscheduled shift waits for a leader
        self.assertIn('hours for 1 day', text)
        self.assertEqual(maya, ['tardy'])
        self.assertTrue(hours)
        self.assertEqual(punch_logs, 1)                      # logged once, by Points
        self.assertGreaterEqual(saves, 1)

    def test_west_buda_and_other_pdfs_are_refused(self):
        got = run("c => Promise.all([kaImportPunchReport({name: 'a.pdf'}, APS.parseReport(punch([['Torres, Maya', '10/06/2026', '06:00 AM', '06:00 AM', '02:00 PM', '02:00 PM']], 'Chick-fil-A West Buda (05508)'))).catch(e => e.message),"
                  " kaImportPunchReport({name: 'b.pdf'}, {shifts: []}).catch(e => e.message)])")
        self.assertIn('West Buda', got[0])
        self.assertIn('Only Chick-fil-A Buda', got[0])
        self.assertIn('Actual vs. Scheduled', got[1])

    def test_the_drop_zone_recognizes_it(self):
        got = run("c => [duDetect({name: 'ActualVsScheduled_10-12.pdf'}, '', null), duDetect({name: 'positional-ratings.pdf'}, '', null), duDetect({name: 'SAFE report.pdf'}, '', null)]")
        self.assertEqual(got, ['punch', 'pea', 'opsPdf'])
        src = read('static', 'js', 'data-uploads.js')
        self.assertIn("key: 'punch'", src)
        self.assertIn("hint === 'punch' ? 'punch'", src)                       # the row's own upload button
        self.assertIn("await duTryPunch(job.file)", src)                        # a punch report under any name
        self.assertLess(src.index('await duTryPunch(job.file)'), src.index('await rpImportOpsPdf(job.file)'))

    def test_the_points_page_records_hours_too(self):
        src = read('static', 'js', 'points.js')
        self.assertIn("kaRecordLabor(parsed); kaFill();", src)
        self.assertIn("duRecord('punch'", src)
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertLess(page.index('/static/js/forecast.js'), page.index('/static/js/kn-actuals.js'))
        self.assertLess(page.index('/static/js/kn-actuals.js'), page.index('/static/js/points.js'))


if __name__ == '__main__':
    unittest.main()
