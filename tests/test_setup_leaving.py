"""Set Ups: who leaves as the daypart ends (setup-rules.js). Someone on to
the end of a daypart and not on just after it (a split shift that comes
back later included) gets a red clock and "leaves 1:00", next to the
existing "arrives" and mid-daypart "leaves" notes.

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
const line = (src, name) => src.match(new RegExp('const ' + name + ' = .*\\n'))[0];
const ctx = {esText: en => ({'leaves at': 'se va a las', 'arrives at': 'llega a las'})[en] || ''};
vm.createContext(ctx);
const zr = js('zone-reset.js'), rules = js('setup-rules.js'), dp = js('daypicker-and-positions.js'), board = js('setups-board.js');
vm.runInContext(zr.slice(zr.indexOf('const fohDayparts'), zr.indexOf('// Daypart names that changed')), ctx);
vm.runInContext(dp.slice(dp.indexOf('function parseShiftTimeToMinutes'), dp.indexOf('function parseDaypartTimeToMinutes'))
  + grab(dp, 'parseDaypartTimeToMinutes') + grab(dp, 'daypartTimeWindow') + grab(board, 'suDaypartsFor')
  + ['SU_EDGE_MIN', 'SU_HANDOFF_EARLY_MIN', 'SU_HANDOFF_LATE_MIN'].map(n => line(rules, n)).join('')
  + ['suClock', 'suRosterFor', 'suShiftBlocks', 'suDaypartTiming', 'suTimingFor', 'suSlotTimeNote'].map(n => grab(rules, n)).join('')
  + 'function suDisplayName(n){ return n; }', ctx);
vm.runInContext(`let bohRoster = {}; let fohRoster = {'2026-10-13': [
  {name: 'Ana', start: '6:00a', end: '1:00p'},
  {name: 'Ben', start: '10:30a', end: '1:05p'},
  {name: 'Cal', start: '10:30a', end: '5:00p'},
  {name: 'Dee', start: '11:30a', end: '1:00p'},
  {name: 'Eve', start: '10:30a', end: '12:00p'},
  {name: 'Fay', start: '10:30a', end: '8:00p', blocks: [{start: '10:30a', end: '1:00p'}, {start: '5:00p', end: '8:00p'}]},
  {name: 'Gus', start: '8:00p', end: '10:00p'}]};`, ctx);
const out = vm.runInContext(`(() => {
  const lunch = suDaypartTiming('foh', '2026-10-13', 2), breakfast = suDaypartTiming('foh', '2026-10-13', 1), close = suDaypartTiming('foh', '2026-10-13', 6);
  const o = t => Object.fromEntries(t.people.map(p => [p.name, p.out]));
  const notes = Object.fromEntries(['Ana', 'Ben', 'Cal', 'Dee', 'Eve', 'Fay'].map(n => [n, suSlotTimeNote(lunch, [n])]));
  return {lunch: o(lunch), breakfast: o(breakfast), close: o(close), notes};
})()`, ctx);
process.stdout.write(JSON.stringify(out));
"""


@unittest.skipUnless(NODE, 'Node.js not installed')
class LeavingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        done = subprocess.run([NODE, '-e', RUNNER, os.path.join(ROOT, 'static', 'js')], capture_output=True, text=True, check=True)
        cls.d = json.loads(done.stdout)

    def test_who_leaves_as_lunch_ends(self):
        # Lunch is 10:30–1:00. Ana and Ben (1:05, inside the 10-minute edge) leave;
        # Fay leaves too, though she's back for dinner (a split shift still
        # leaves Lunch's floor). Cal stays on; Eve left mid-daypart.
        self.assertEqual(self.d['lunch'], {'Ana': 13 * 60, 'Ben': 13 * 60 + 5, 'Cal': None, 'Dee': 13 * 60, 'Eve': None, 'Fay': 13 * 60})

    def test_not_while_their_shift_goes_on(self):
        self.assertIsNone(self.d['breakfast']['Ana'])

    def test_not_in_the_last_daypart(self):
        self.assertIsNone(self.d['close']['Gus'])

    def test_notes(self):
        n = self.d['notes']
        self.assertEqual(n['Ana'], {'text': 'leaves 1:00', 'es': 'se va a las 1:00', 'out': True})
        self.assertEqual(n['Ben']['text'], 'leaves 1:05')
        self.assertIsNone(n['Cal'])
        self.assertEqual(n['Dee']['text'], 'arrives 11:30 · leaves 1:00')
        self.assertTrue(n['Dee']['out'])
        # A mid-daypart leave stays the red warning it was, no clock.
        self.assertEqual(n['Eve'], {'text': 'leaves 12:00', 'warn': True})
        self.assertEqual(n['Fay']['text'], 'leaves 1:00')


if __name__ == '__main__':
    unittest.main()
