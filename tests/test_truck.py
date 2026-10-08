"""Who has the Truck shift (static/js/truck.js): kept from the HotSchedules
roster import (the only source: leaders don't assign it) and shown at the
top of the Set Ups roster, in red when an open day has no Truck shift."""
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


class RosterRows(unittest.TestCase):
    """The truck rows at the top of the Set Ups roster (Tue Oct 6 2026 is today)."""

    def rows(self, setup, date='2026-10-06'):
        return run(f"c => {{ {setup}; return truckRosterHtml(c.date); }}", date=date)[0]

    def test_shows_who_has_it_set_apart(self):
        html = self.rows("truckShifts = {'2026-10-06': [{name: 'Maya Torres', start: '5:30a', end: '8:30a'}], '2026-10-07': [{name: 'Noah Bennett', start: '5:30a', end: '8:30a'}]}")
        self.assertIn('su-roster-truck', html)
        self.assertIn('Maya Torres', html)
        self.assertIn('5:30a - 8:30a · off the floor', html)
        self.assertIn('su-truck-badge', html)
        self.assertNotIn('is-missing', html)
        self.assertIn('Tomorrow · Wed: Noah Bennett 5:30a - 8:30a', html)
        self.assertNotIn('<button', html)                       # the schedule decides; nothing to assign

    def test_every_open_day_needs_it(self):
        html = self.rows("truckShifts = {}")
        self.assertIn('su-roster-truck is-missing', html)
        self.assertIn('No truck shift on the schedule', html)
        self.assertIn('su-truck-next is-missing', html)        # Wednesday too: every open day

    def test_tomorrow_line_only_on_todays_roster(self):
        html = self.rows("truckShifts = {}", date='2026-10-08')
        self.assertIn('is-missing', html)
        self.assertNotIn('Tomorrow', html)

    def test_saturday_looks_ahead_to_monday_and_sunday_has_none(self):
        got = run("c => [truckNextOpenDay('2026-10-10'), truckNextOpenDay('2026-10-06'), truckIsTruckDay('2026-10-07'), truckIsTruckDay('2026-10-11'), truckRosterHtml('2026-10-11')]")[0]
        self.assertEqual(got, ['2026-10-12', '2026-10-07', True, False, ''])

    def test_names_are_escaped(self):
        html = self.rows("""truckShifts = {'2026-10-06': [{name: '<img src=x onerror=alert(1)>', start: '5:30a', end: '8:30a'}]}""")
        self.assertNotIn('<img', html)


class OnlyUnderAll(unittest.TestCase):
    def test_truck_rows_stay_out_of_breaks_left(self):
        # Truck is off the floor, so it's not in the Breaks Left view (Tim, Oct 2026).
        with open(os.path.join(ROOT, 'static', 'js', 'daypicker-and-positions.js'), encoding='utf-8') as f:
            src = f.read()
        line = next(l for l in src.splitlines() if 'truckRosterHtml(dayName)' in l)
        self.assertIn("rosterView !== 'breaks'", line)


if __name__ == '__main__':
    unittest.main()
