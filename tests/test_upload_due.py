"""Uploads: a due date picked by hand (Tim, Oct 26 2026). Before the date a
report is up to date, on it it's due, from the day after it's overdue; an
upload after the date was picked counts for the nearest due date, so the
next one is a frequency later.

Run: python3 -m unittest discover tests   (needs Node.js; skipped without it)
"""
import json
import os
import shutil
import subprocess
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')
NODE = shutil.which('node')

RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const js = fs.readFileSync(process.argv[1], 'utf8');
const ctx = {dataUploadSettings: {}};
vm.createContext(ctx);
vm.runInContext(js.slice(js.indexOf('function duStartOfDay'), js.indexOf('// ----- Per-source status -----')), ctx);
const cases = JSON.parse(fs.readFileSync(0, 'utf8'));
const out = cases.map(([set, freq, last, now]) => {
  ctx.dataUploadSettings = {due: {x: set}};
  const st = vm.runInContext('duApplyDue', ctx)({key: 'x'}, {status: 'overdue', freq, last: last ? new Date(last) : null, note: 'auto note'}, new Date(now));
  return [st.status, st.dueDate, vm.runInContext('duDueText', ctx)(st), st.note];
});
process.stdout.write(JSON.stringify(out));
"""

SET = {'date': '2026-11-02', 'at': '2026-10-26T22:00:00'}     # Monday Nov 2, picked Monday night Oct 26


def run(cases):
    done = subprocess.run([NODE, '-e', RUNNER, os.path.join(ROOT, 'static', 'js', 'data-uploads.js')],
                          input=json.dumps(cases), capture_output=True, text=True, check=True)
    return json.loads(done.stdout)


@unittest.skipUnless(NODE, 'Node.js not installed')
class UploadDueDate(unittest.TestCase):
    def test_before_on_and_after_the_date(self):
        before, on, after = run([[SET, 'weekly', None, '2026-10-30T09:00:00'],
                                 [SET, 'weekly', None, '2026-11-02T09:00:00'],
                                 [SET, 'weekly', None, '2026-11-03T06:00:00']])
        self.assertEqual(before, ['fresh', '2026-11-02', 'next due Nov 2', ''])   # the automatic note doesn't nag
        self.assertEqual(on[:3], ['due', '2026-11-02', 'due today'])
        self.assertEqual(after[:3], ['overdue', '2026-11-02', 'was due Nov 2'])

    def test_an_upload_moves_it_one_frequency_on(self):
        early, onday, late, very_late = run([
            [SET, 'weekly', '2026-11-01T15:00:00', '2026-11-02T09:00:00'],   # Sunday, a day early
            [SET, 'weekly', '2026-11-02T15:00:00', '2026-11-04T09:00:00'],
            [SET, 'weekly', '2026-11-04T15:00:00', '2026-11-05T09:00:00'],   # two days late
            [SET, 'weekly', '2026-11-18T15:00:00', '2026-11-19T09:00:00'],   # weeks late: counts for the nearest Monday
        ])
        self.assertEqual(early[:2], ['fresh', '2026-11-09'])
        self.assertEqual(onday[:2], ['fresh', '2026-11-09'])
        self.assertEqual(late[:2], ['fresh', '2026-11-09'])
        self.assertEqual(very_late[:2], ['fresh', '2026-11-23'])

    def test_uploads_before_the_date_was_picked_dont_count(self):
        [r] = run([[SET, 'weekly', '2026-10-26T09:00:00', '2026-11-03T09:00:00']])
        self.assertEqual(r[:2], ['overdue', '2026-11-02'])

    def test_monthly_keeps_the_day_and_daily_is_tomorrow(self):
        end = {'date': '2026-10-31', 'at': '2026-10-01T00:00:00'}
        monthly, daily = run([[end, 'monthly', '2026-10-31T10:00:00', '2026-11-15T09:00:00'],
                              [{'date': '2026-11-02', 'at': '2026-11-01T00:00:00'}, 'daily', '2026-11-05T08:00:00', '2026-11-06T09:00:00']])
        self.assertEqual(monthly[:2], ['fresh', '2026-11-30'])                 # the 31st falls on November's last day
        self.assertEqual(daily[:3], ['due', '2026-11-06', 'due today'])

    def test_page_wiring(self):
        with open(os.path.join(ROOT, 'static', 'js', 'data-uploads.js'), encoding='utf-8') as f:
            js = f.read()
        self.assertIn('return duApplyDue(src, duAutoState(src, now), now);', js)
        self.assertIn('<input type="date" data-du-due="${src.key}"', js)
        self.assertIn("dataUploadSettings.due[due.dataset.duDue] = {date: due.value, at: new Date().toISOString()};", js)
        self.assertIn('data-du-due-clear', js)


if __name__ == '__main__':
    unittest.main()
