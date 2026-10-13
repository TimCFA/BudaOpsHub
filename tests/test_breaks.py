"""Roster breaks and timers (TIM-57): a break is kept per side, day and
person; breaks saved under the old name+day key move over; and timers count
on the server's clock, not each tablet's.

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
const js = f => fs.readFileSync(process.argv[1] + '/' + f, 'utf8');
const grab = (src, name) => src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n}\\n'))[0];
const ctx = {};
vm.createContext(ctx);
vm.runInContext(`let today = '2026-10-11'; let currentPosSection = 'foh';
  let breakCountdowns = {}; let completedBreaks = {}; let serverClockOffset = 0;`, ctx);
const page = js('daypicker-and-positions.js'), store = js('storage.js');
vm.runInContext(grab(page, 'breakKeyFor') + grab(page, 'breakAdoptLegacy') + grab(store, 'serverNow') + grab(store, 'serverClockNote'), ctx);
const out = vm.runInContext(`(() => {
  const keys = [breakKeyFor('Sam Lee'), breakKeyFor('Sam Lee', '2026-10-10'), breakKeyFor('Sam Lee', '2026-10-10', 'boh')];
  completedBreaks[breakKeyFor('Sam Lee', '2026-10-10', 'boh')] = true;
  const fohSeesBoh = !!completedBreaks[breakKeyFor('Sam Lee', '2026-10-10')];

  breakCountdowns['Ana Ruiz2026-10-11'] = 123;
  completedBreaks['Bo Diaz2026-10-11'] = true;
  const moved = [breakAdoptLegacy('Ana Ruiz', '2026-10-11'), breakAdoptLegacy('Bo Diaz', '2026-10-11'), breakAdoptLegacy('Cy Park', '2026-10-11')];
  const adopted = {countdowns: {...breakCountdowns}, completed: {...completedBreaks}};

  // A tablet 90 s slow: the server said 100000 at the middle of a 2 s round trip.
  serverClockNote(100000, 8000, 10000);
  const offset = serverClockOffset, skewed = serverNow() - Date.now();
  serverClockNote(undefined, 0, 0);
  return {keys, fohSeesBoh, moved, adopted, offset, skewed, kept: serverClockOffset};
})()`, ctx);
process.stdout.write(JSON.stringify(out));
"""


@unittest.skipUnless(NODE, 'Node.js not installed')
class BreaksTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        done = subprocess.run([NODE, '-e', RUNNER, os.path.join(ROOT, 'static', 'js')],
                              capture_output=True, text=True, check=True)
        cls.data = json.loads(done.stdout)

    def test_key_has_side_day_and_name(self):
        self.assertEqual(self.data['keys'], ['foh||2026-10-11||Sam Lee', 'foh||2026-10-10||Sam Lee', 'boh||2026-10-10||Sam Lee'])
        # A BOH Sam Lee's break isn't the FOH Sam Lee's.
        self.assertFalse(self.data['fohSeesBoh'])

    def test_old_breaks_move_to_the_new_key(self):
        self.assertEqual(self.data['moved'], [True, True, False])
        self.assertEqual(self.data['adopted']['countdowns'], {'foh||2026-10-11||Ana Ruiz': 123})
        self.assertEqual(self.data['adopted']['completed'], {
            'boh||2026-10-10||Sam Lee': True, 'foh||2026-10-11||Bo Diaz': True})

    def test_server_clock(self):
        self.assertEqual(self.data['offset'], 91000)
        self.assertEqual(self.data['skewed'], 91000)
        # A reply without the server's time leaves the offset alone.
        self.assertEqual(self.data['kept'], 91000)


if __name__ == '__main__':
    unittest.main()
