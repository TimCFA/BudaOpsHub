"""In-training team members on the roster (Tim, Oct 15 2026): a Training
shift from the HotSchedules roster import goes on the FOH or BOH roster
tagged "In training" (like Team Leader), so they can be put in positions.
Names are made up."""
import json
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, 'tests', 'truck_runner.js')
DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
HEADER = ['Employee'] + [f'{d} {c}' for d in DAYS for c in ('Shift', 'Schedule', 'Job')]


def row(name, **days):
    cells = [name]
    for d in DAYS:
        cells += list(days.get(d, ('-', '-', '-')))
    return cells


def csv(*rows):
    return '\n'.join(','.join(f'"{c}"' for c in r) for r in [HEADER, *rows])


def parse(text, setup=''):
    op = f"c => {{ {setup}; const r = parseWeeklyRosterCsv(c.csv); return r; }}"
    out = subprocess.run(['node', RUNNER], input=json.dumps({'cases': [{'op': op, 'csv': text}]}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[0]


def names(people):
    return [(p['name'], bool(p.get('training')), bool(p.get('leader'))) for p in people]


class TrainingShifts(unittest.TestCase):
    def test_side_from_the_job(self):
        r = parse(csv(
            row('Lena Ortiz', Mon=('10:00 AM - 2:00 PM', 'Training', 'FOH - Training')),
            row('Omar Diaz', Mon=('6:00 AM - 11:00 AM', 'Training', 'BOH - Training')),
            row('Pia Wren', Tue=('11:00 AM - 3:00 PM', 'Training', 'Front Counter')),
            row('Quinn Hale', Tue=('7:00 AM - 1:00 PM', 'Training', 'Breading')),
        ))
        self.assertEqual(names(r['result']['Mon']['foh']), [('Lena Ortiz', True, False)])
        self.assertEqual(names(r['result']['Mon']['boh']), [('Omar Diaz', True, False)])
        self.assertEqual(names(r['result']['Tue']['foh']), [('Pia Wren', True, False)])
        self.assertEqual(names(r['result']['Tue']['boh']), [('Quinn Hale', True, False)])
        self.assertEqual(r['result']['Mon']['foh'][0]['start'], '10:00a')
        self.assertEqual(r['offFloor'], {})          # no longer counted as off the floor
        self.assertEqual(r['unrecognized'], [])

    def test_side_from_their_other_shifts_this_week(self):
        r = parse(csv(row('Rae Kim', Mon=('9:00 AM - 1:00 PM', 'Training', 'Training'),
                          Tue=('9:00 AM - 3:00 PM', 'Back of House', 'BOH General'),
                          Wed=('9:00 AM - 3:00 PM', 'Back of House', 'BOH General'))))
        self.assertEqual(names(r['result']['Mon']['boh']), [('Rae Kim', True, False)])
        self.assertEqual(r['result']['Mon']['foh'], [])

    def test_side_from_the_saved_roster(self):
        r = parse(csv(row('Sam Velez', Thu=('4:00 PM - 9:00 PM', 'Training', 'Training'))),
                  setup="fohRoster['2026-10-01'] = [{name: 'sam velez', start: '4:00p', end: '9:00p'}]")
        self.assertEqual(names(r['result']['Thu']['foh']), [('Sam Velez', True, False)])

    def test_no_side_anywhere_is_flagged_not_dropped_silently(self):
        r = parse(csv(row('Tess Abel', Fri=('8:00 AM - 12:00 PM', 'Training', 'Orientation'))))
        self.assertEqual(r['result']['Fri'], {'foh': [], 'boh': []})
        self.assertEqual(len(r['unrecognized']), 1)
        self.assertEqual(r['unrecognized'][0]['name'], 'Tess Abel')
        self.assertIn('FOH or BOH', r['unrecognized'][0]['schedule'])

    def test_training_and_a_regular_shift_the_same_day_are_one_person(self):
        r = parse(csv(row('Uma Pratt', Mon=('6:00 AM - 9:00 AM', 'Training', 'FOH - Training'))),
                  )
        both = parse(csv(row('Uma Pratt', Mon=('6:00 AM - 9:00 AM', 'Training', 'FOH - Training')),
                         row('Uma Pratt', Mon=('9:00 AM - 2:00 PM', 'Front of House', 'FOH General'))))
        foh = both['result']['Mon']['foh']
        self.assertEqual(len(foh), 1)
        self.assertEqual((foh[0]['start'], foh[0]['end'], foh[0]['training']), ('6:00a', '2:00p', True))
        self.assertEqual(len(r['result']['Mon']['foh']), 1)

    def test_a_trainer_is_on_the_floor_without_the_tag(self):
        r = parse(csv(row('Vic Lane', Sat=('10:00 AM - 4:00 PM', 'Training', 'FOH - Trainer'))))
        self.assertEqual(names(r['result']['Sat']['foh']), [('Vic Lane', False, False)])

    def test_other_off_floor_shifts_unchanged(self):
        r = parse(csv(row('Wes Cho', Mon=('9:00 AM - 11:00 AM', 'Other', 'Administrative'), Tue=('5:30 AM - 8:30 AM', 'Other', 'Truck'))))
        self.assertEqual(r['offFloor'], {'Administrative': 1, 'Truck': 1})
        self.assertEqual(r['result']['Mon'], {'foh': [], 'boh': []})


class Page(unittest.TestCase):
    def test_tag_on_the_roster_and_in_spanish(self):
        with open(os.path.join(ROOT, 'static', 'js', 'daypicker-and-positions.js'), encoding='utf-8') as f:
            js = f.read()
        self.assertIn("person.training ? `<span class=\"roster-leader-badge is-training\">In training${esHtml('In training')}</span>`", js)
        with open(os.path.join(ROOT, 'static', 'js', 'spanish.js'), encoding='utf-8') as f:
            self.assertRegex(f.read(), r"'In training':\s*'En entrenamiento'")
        with open(os.path.join(ROOT, 'static', 'css', 'theme-cfa.css'), encoding='utf-8') as f:
            css = f.read()
        self.assertTrue(re.search(r'\.roster-leader-badge\.is-training\{[^}]*--cfa-navy', css))


if __name__ == '__main__':
    unittest.main()
