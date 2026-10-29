"""Shift changes since the schedule was posted (static/js/roster-changes.js):
swaps, adds, offs and time changes, run in Node with small stand-ins for the
page helpers it uses.

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
const ctx = {
  today: '2026-10-02', fohRoster: {}, bohRoster: {}, rosterPosted: {}, posAssignments: {},
  document: {getElementById(){ return {addEventListener(){}}; }},
  parseShiftTimeToMinutes(s){ const m = String(s).trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s*([ap])/); if(!m) return null;
    let h = +m[1] % 12; if(m[3] === 'p') h += 12; return h * 60 + +m[2]; },
  suClock(min){ const h = Math.floor(min / 60) % 24; return `${(h + 11) % 12 + 1}:${String(min % 60).padStart(2, '0')}`; },
  suSplitNames(v){ return String(v || '').split(/\s*\/\s*/).filter(Boolean); },
  suShortDaypart(n){ return n; }, suDisplayName(n){ return n.split(' ')[0]; },
  fohPositions: {Breakfast: ['iPOS 1', 'Drinks 1'], Lunch: ['iPOS 1', 'Host 2']}, bohPositions: {},
  suDaypartsFor(side){ return side === 'foh' ? [{name: 'Breakfast'}, {name: 'Lunch'}] : []; },
  escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'); },
  isoAddDays(iso, n){ const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[1].replace('roster-changes.js', 'spanish.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(process.argv[1], 'utf8'), ctx);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const out = input.map(c => vm.runInContext(`(${c})()`, ctx));
process.stdout.write(JSON.stringify(out));
"""

P = lambda name, start, end, **kw: dict(name=name, start=start, end=end, **kw)


def run(snippets):
    done = subprocess.run([NODE, '-e', RUNNER, os.path.join(ROOT, 'static', 'js', 'roster-changes.js')],
                          input=json.dumps(snippets), capture_output=True, text=True, check=True)
    return json.loads(done.stdout)


def scenario(posted, now, extra=''):
    """JS that loads a posted roster, imports a new one, and reports."""
    return f"""function(){{
      fohRoster = {{}}; bohRoster = {{}}; rosterPosted = {{}}; posAssignments = {{}};
      fohRoster['2026-10-02'] = {json.dumps(posted)};
      rosterNotePosted('2026-10-02', 'foh', fohRoster['2026-10-02']);
      fohRoster['2026-10-02'] = {json.dumps(now)};
      {extra}
      return {{changes: rosterDayChanges('2026-10-02', 'foh'), off: [...rosterOffNames('2026-10-02', 'foh')].sort(),
               fix: rosterSpotsToFix('2026-10-02', 'foh'), html: rosterFixChipHtml('foh', '2026-10-02')}};
    }}"""


@unittest.skipUnless(NODE, 'Node.js not installed')
class RosterChangesTest(unittest.TestCase):
    def test_kinds(self):
        posted = [P('Avery Stone', '6:00a', '1:00p'), P('Casey Brooks', '6:00a', '2:00p'), P('Riley Park', '10:30a', '3:00p')]
        now = [P('Jordan Lee', '6:00a', '1:00p'), P('Casey Brooks', '6:00a', '11:00a'), P('Riley Park', '10:30 AM', '3:00 PM'),
               P('Morgan Hale', '4:00p', '9:00p'), P('Hand Added', '11:00a', '2:00p', source='manual')]
        [r] = run([scenario(posted, now)])
        got = {(c['kind'], c['name']): c for c in r['changes']}
        self.assertEqual(set(got), {('swap', 'Jordan Lee'), ('time', 'Casey Brooks'), ('on', 'Morgan Hale')})
        self.assertEqual(got[('swap', 'Jordan Lee')]['for'], 'Avery Stone')
        self.assertEqual(got[('time', 'Casey Brooks')]['was'], '6:00a–2:00p')

    def test_re_added_by_hand_is_not_off(self):
        """Tim, Oct 29 2026: a leader swapped two leaders' shifts by taking
        them off and adding them back by hand with each other's hours; both
        showed "Off today" while in the restaurant."""
        posted = [P('Riley Stone', '5:30a', '1:00p'), P('Casey Lin', '8:00a', '4:00p'), P('Gone Today', '6:00a', '2:00p')]
        now = [P('Riley Stone', '8:00a', '4:00p', source='manual'), P('Casey Lin', '5:30a', '1:00p', source='manual')]
        got = run([scenario(posted, now, "posAssignments['foh||2026-10-02||Breakfast||iPOS 1'] = 'Riley Stone';")])[0]
        self.assertEqual(got['off'], ['gone today'])
        self.assertEqual(got['fix'], [])

    def test_off_and_still_placed_is_a_spot_to_fix(self):
        # Tim, Oct 26 2026: no list of changes; the spot held by someone off is what to fix.
        posted = [P('Avery Stone', '6:00a', '1:00p'), P('Riley Park', '10:30a', '3:00p'), P('Sam Swap', '4:00p', '9:00p')]
        now = [P('Riley Park', '10:30a', '3:00p'), P('Jordan Lee', '4:00p', '9:00p')]
        place = ("posAssignments['foh||2026-10-02||Lunch||iPOS 1'] = 'Avery Stone';"
                 "posAssignments['foh||2026-10-02||Breakfast||Drinks 1'] = 'Riley Park/Sam Swap';"
                 "posAssignments['foh||2026-10-02||Lunch||Host 2'] = 'Riley Park';")
        [r] = run([scenario(posted, now, place)])
        self.assertEqual(r['off'], ['avery stone', 'sam swap'])                  # off, and swapped out
        self.assertEqual(r['fix'], [{'dp': 'Breakfast', 'slot': 'Drinks 1'}, {'dp': 'Lunch', 'slot': 'iPOS 1'}])   # daypart order
        self.assertIn('data-rc-fix="1"', r['html'])
        self.assertIn('2 spots to fix', r['html'])

    def test_nothing_to_fix_no_chip(self):
        posted = [P('Casey Brooks', '6:00a', '2:00p')]
        now = [P('Casey Brooks', '6:00a', '11:00a'), P('Morgan Hale', '4:00p', '9:00p')]   # new hours and an add: nothing to do
        [r] = run([scenario(posted, now, "posAssignments['foh||2026-10-02||Lunch||iPOS 1'] = 'Casey Brooks';")])
        self.assertEqual(r['off'], [])
        self.assertEqual(r['html'], '')

    def test_off_names_follow_a_new_sync(self):
        posted = [P('Avery Stone', '6:00a', '1:00p')]
        js = scenario(posted, [], """var before = [...rosterOffNames('2026-10-02', 'foh')];
          fohRoster['2026-10-02'] = [{name: 'Avery Stone', start: '6:00a', end: '1:00p'}];""").replace(
            "return {changes:", "return {before: before, changes:")
        [r] = run([js])
        self.assertEqual(r['before'], ['avery stone'])
        self.assertEqual(r['off'], [])                                           # back on: no longer off

    def test_first_import_and_past_days_keep_nothing(self):
        [first, past] = run(["""function(){ rosterPosted = {}; rosterNotePosted('2026-10-02', 'foh', []); return rosterPosted; }""",
                             """function(){ rosterPosted = {}; rosterNotePosted('2026-10-01', 'foh', [{name: 'A', start: '6:00a', end: '1:00p'}]); return rosterPosted; }"""])
        self.assertEqual(first, {})
        self.assertEqual(past, {})

    def test_posted_kept_once_and_nothing_when_unchanged(self):
        posted = [P('Avery Stone', '6:00a', '1:00p')]
        again = "rosterNotePosted('2026-10-02', 'foh', [{name: 'Someone Else', start: '1:00p', end: '5:00p'}]);"
        [r] = run([scenario(posted, posted, again)])
        self.assertEqual(r['changes'], [])
        self.assertEqual(r['html'], '')


if __name__ == '__main__':
    unittest.main()
