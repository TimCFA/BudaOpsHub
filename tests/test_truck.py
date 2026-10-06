"""Who's on truck (static/js/truck.js): kept from the HotSchedules roster
import, assigned by hand, and flagged on Set Ups when a truck day has nobody."""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, 'tests', 'truck_runner.js')

# The week's columns as HotSchedules exports them (no phone column needed).
DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
HEADER = ['Employee'] + [f'{d} {c}' for d in DAYS for c in ('Shift', 'Schedule', 'Job')]


def row(name, **days):
    cells = [name]
    for d in DAYS:
        cells += list(days.get(d, ('-', '-', '-')))
    return cells


CSV = '\n'.join(','.join(f'"{c}"' for c in r) for r in [
    HEADER,
    row('Maya Torres', Mon=('5:30 AM - 8:30 AM', 'Other', 'Truck'), Tue=('6:00 AM - 2:00 PM', 'Back of House', 'BOH General')),
    row('Noah Bennett', Mon=('6:00 AM - 3:30 PM', 'Leadership', 'BOH - Team Leader'), Tue=('5:30 AM - 8:30 AM', 'Other', 'Truck')),
    row('Ava Morales', Mon=('9:00 AM - 11:00 AM', 'Other', 'Administrative'), Thu=('5:30 AM - 8:00 AM', 'Other', 'Truck')),
])


def run(*ops, **extra):
    cases = [dict(op=op, **extra) for op in ops]
    out = subprocess.run(['node', RUNNER], input=json.dumps({'cases': cases}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


class Import(unittest.TestCase):
    def test_truck_shifts_are_kept_apart_from_the_floor(self):
        got = run('c => { const r = parseWeeklyRosterCsv(c.csv); return [r.truck, r.result.Mon.boh.map(p => p.name), r.result.Tue.boh.map(p => p.name), r.offFloor]; }', csv=CSV)[0]
        truck, mon_boh, tue_boh, off = got
        self.assertEqual(truck['Mon'], [{'name': 'Maya Torres', 'start': '5:30a', 'end': '8:30a'}])
        self.assertEqual(truck['Tue'], [{'name': 'Noah Bennett', 'start': '5:30a', 'end': '8:30a'}])
        self.assertEqual(truck['Wed'], [])
        self.assertEqual(truck['Thu'], [{'name': 'Ava Morales', 'start': '5:30a', 'end': '8:00a'}])
        self.assertEqual(mon_boh, ['Noah Bennett'])          # Maya's truck shift isn't a floor shift
        self.assertEqual(tue_boh, ['Maya Torres'])
        self.assertEqual(off, {'Truck': 3, 'Administrative': 1})

    def test_import_keeps_a_hand_assigned_one(self):
        got = run("""c => [
            truckMergeImported([{name: 'Grace Kim', start: '5:30a', end: '8:30a', source: 'manual'}, {name: 'Old Name', start: '5:30a', end: '8:30a', source: 'schedule'}], [{name: 'Maya Torres', start: '5:30a', end: '8:30a'}]),
            truckMergeImported([{name: 'Maya Torres', start: '6:00a', end: '9:00a', source: 'manual'}], [{name: 'Maya Torres', start: '5:30a', end: '8:30a'}]),
            truckMergeImported(undefined, [])]""")[0]
        self.assertEqual([(t['name'], t['source']) for t in got[0]], [('Grace Kim', 'manual'), ('Maya Torres', 'schedule')])
        self.assertEqual([(t['name'], t['start']) for t in got[1]], [('Maya Torres', '6:00a')])
        self.assertEqual(got[2], [])


class SetUpsLine(unittest.TestCase):
    def strip(self, setup):
        return run(f"c => {{ {setup}; return truckStripHtml(c.date); }}", date='2026-10-06')[0]

    def test_truck_day_with_nobody_is_red(self):
        html = self.strip("truckShifts = {}")
        self.assertIn('is-missing', html.split('>')[0])
        self.assertIn('No one on truck yet', html)
        self.assertIn('data-truck-assign="2026-10-06"', html)

    def test_shows_who(self):
        html = self.strip("truckShifts = {'2026-10-06': [{name: 'Maya Torres', start: '5:30a', end: '8:30a', source: 'schedule'}]}")
        self.assertNotIn('is-missing', html.split('>')[0])
        self.assertIn('<b>Maya Torres</b> 5:30a–8:30a', html)

    def test_tomorrow_line_on_todays_page(self):
        # Tue Oct 6: tomorrow is Wed, not a truck day by default; with Wed on, it's flagged
        html = self.strip("truckShifts = {'2026-10-06': [{name: 'Maya Torres', start: '5:30a', end: '8:30a'}]}")
        self.assertNotIn('Tomorrow', html)
        html = self.strip("truckDays = [1, 2, 3, 4, 5, 6]; truckShifts = {'2026-10-06': [{name: 'Maya Torres', start: '5:30a', end: '8:30a'}]}")
        self.assertIn('Tomorrow', html)
        self.assertIn('data-truck-assign="2026-10-07"', html)

    def test_saturday_looks_ahead_to_monday(self):
        got = run("c => [truckNextOpenDay('2026-10-10'), truckNextOpenDay('2026-10-06')]")[0]
        self.assertEqual(got, ['2026-10-12', '2026-10-07'])

    def test_no_truck_day_and_nobody_shows_nothing(self):
        got = run("c => { truckShifts = {}; return [truckStripHtml('2026-10-07'), truckIsTruckDay('2026-10-07'), truckIsTruckDay('2026-10-08')]; }")[0]
        self.assertEqual(got, ['', False, True])

    def test_names_are_escaped(self):
        html = self.strip("""truckShifts = {'2026-10-06': [{name: '<img src=x onerror=alert(1)>', start: '5:30a', end: '8:30a'}]}""")
        self.assertNotIn('<img', html)


if __name__ == '__main__':
    unittest.main()
