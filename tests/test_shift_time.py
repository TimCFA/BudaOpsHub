"""Set Ups "Add Team Member": shift times typed however a leader types them
(static/js/shift-time.js), saved the way the schedule writes them."""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, 'tests', 'shift_time_runner.js')


def read(*pairs):
    out = subprocess.run(['node', RUNNER], input=json.dumps({'cases': [list(p) for p in pairs]}), capture_output=True, text=True, check=True)
    return [tuple(x) for x in json.loads(out.stdout)]


class ShiftTimes(unittest.TestCase):
    def test_the_many_ways_to_write_five_thirty_to_one_thirty(self):
        ways = [('5:30a', '1:30p'), ('5:30 am', '1:30 pm'), ('5:30AM', '1:30PM'), ('5:30 a.m.', '1:30 p.m.'),
                ('530a', '130p'), ('530', '130'), ('5.30', '1.30'), ('5 30', '1 30'), ('05:30', '13:30'),
                ('0530', '1330'), ('  5:30a ', ' 1:30 P ')]
        for got, way in zip(read(*ways), ways):
            self.assertEqual(got, ('5:30a', '1:30p', None), way)

    def test_bare_hours(self):
        self.assertEqual(read(('5', '1'), ('6', '2'), ('11', '7'), ('2', '10'), ('4', '10'), ('12', '8'), ('5p', '10')), [
            ('5:00a', '1:00p', None), ('6:00a', '2:00p', None), ('11:00a', '7:00p', None), ('2:00p', '10:00p', None),
            ('4:00p', '10:00p', None), ('12:00p', '8:00p', None), ('5:00p', '10:00p', None)])

    def test_end_is_the_reading_that_makes_a_real_shift(self):
        self.assertEqual(read(('6a', '10'), ('5:30a', '6'), ('8a', '12'), ('11a', '11')), [
            ('6:00a', '10:00a', None), ('5:30a', '6:00p', None), ('8:00a', '12:00p', None), ('11:00a', '11:00p', None)])

    def test_start_follows_a_definite_end(self):
        # "4" alone is a closer's 4p, but not before a 12:30p end
        self.assertEqual(read(('4', '12:30p'), ('4', '10p')), [('4:00a', '12:30p', None), ('4:00p', '10:00p', None)])

    def test_noon_and_24_hour(self):
        self.assertEqual(read(('noon', '8p'), ('17:30', '22:00'), ('07:00', '15:00')), [
            ('12:00p', '8:00p', None), ('5:30p', '10:00p', None), ('7:00a', '3:00p', None)])

    def test_whole_shift_in_the_start_box(self):
        self.assertEqual(read(('5:30-1:30', ''), ('11 to 7', ''), ('6a – 2p', '')), [
            ('5:30a', '1:30p', None), ('11:00a', '7:00p', None), ('6:00a', '2:00p', None)])

    def test_half_typed_and_wrong(self):
        self.assertEqual(read(('5:30', ''), ('', ''))[0:2], [('5:30a', None, None), (None, None, None)])
        bad = read(('5:75', '1p'), ('abc', '1p'), ('25', '1p'), ('5a', 'later'), ('2p', '9a'))
        self.assertEqual([b[2] for b in bad], ['Try 5:30a, 530 or 17:30'] * 4 + ['End time is before the start time'])


if __name__ == '__main__':
    unittest.main()
