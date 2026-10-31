"""Someone who left (Tim, Oct 30 2026): once their last day has passed they
come off nearly everything, and Our Team keeps a "Rotated off" list of the
last 12 months (name, hired, left). The pieces here:

  - teamLeftSweep (state-and-utils.js): on a device that may save Set Ups,
    when the list of who left arrives, their shifts and spots on days after
    their last day come off (hcTakeOffSchedule) and save once.
  - The Schedule's and Right Now's rosters leave them out on days after
    their last day, past days untouched.
  - Levelset name matching and the trial trackers leave them out.

tools/depart_audit.js crawls a local copy for leftovers (not run here).

Run: python3 -m unittest discover tests
"""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


class Sweep(unittest.TestCase):
    """teamLeftSweep, run in node with the hub's helpers stubbed."""
    RUNNER = r"""
const vm = require('vm'), fs = require('fs');
const src = fs.readFileSync(process.argv[1], 'utf8');
const part = src.slice(src.indexOf('let teamLeftList = [];'), src.indexOf('// ----- The phone\'s keyboard'));
const run = c => new Promise(resolve => {
  const log = {off: [], saves: 0, rerenders: 0};
  const ctx = {today: '2026-10-30', stateLoaded: Promise.resolve(), siLeadOrUp: () => c.lead,
    hcTakeOffSchedule: (name, lastDay) => { log.off.push([name, lastDay]); return c.found ? {shifts: 1, spots: 1} : {shifts: 0, spots: 0}; },
    saveState: () => { log.saves++; }, stateRerender: () => { log.rerenders++; }, rnSame: () => false};
  vm.createContext(ctx);
  vm.runInContext(part, ctx);
  c.lists.forEach(l => vm.runInContext(`teamLeftSet(${JSON.stringify(l)})`, ctx));
  setTimeout(() => resolve(log), 20);
});
(async () => { const cases = JSON.parse(fs.readFileSync(0, 'utf8')); const out = []; for(const c of cases) out.push(await run(c)); process.stdout.write(JSON.stringify(out)); })();
"""

    def run_cases(self, *cases):
        out = subprocess.run(['node', '-e', self.RUNNER, os.path.join(ROOT, 'static', 'js', 'state-and-utils.js')],
                             input=json.dumps(list(cases)), capture_output=True, text=True, check=True)
        return json.loads(out.stdout)

    def test_takes_them_off_once_on_a_leaders_device(self):
        gone = [{'name': 'Gone Person', 'lastDay': '2026-10-29'}, {'name': 'Notice Given', 'lastDay': '2026-11-05'}, {'name': 'No Day', 'lastDay': ''}]
        lead, twice, member, nothing = self.run_cases(
            {'lead': True, 'found': True, 'lists': [gone]},
            {'lead': True, 'found': True, 'lists': [gone, gone]},          # the same list again: nothing more
            {'lead': False, 'found': True, 'lists': [gone]},               # a Team Member's phone can't save Set Ups
            {'lead': True, 'found': False, 'lists': [gone]})               # nothing on the schedule: no save
        self.assertEqual(lead['off'], [['Gone Person', '2026-10-29']])    # a last day still to come, or none, is left alone
        self.assertEqual((lead['saves'], lead['rerenders']), (1, 1))
        self.assertEqual((twice['off'], twice['saves']), ([['Gone Person', '2026-10-29']], 1))
        self.assertEqual((member['off'], member['saves']), ([], 0))
        self.assertEqual((nothing['off'], nothing['saves']), ([['Gone Person', '2026-10-29']], 0))

    def test_wired_in(self):
        js = read('static', 'js', 'state-and-utils.js')
        self.assertIn('  teamLeftSweep();\n}', js[js.index('function teamLeftSet('):])
        self.assertIn("if(!(typeof siLeadOrUp === 'function' && siLeadOrUp())) return;", js)


class Rosters(unittest.TestCase):
    """The Schedule's and Right Now's rosters, on the Right Now runner."""
    OP = """c => { teamHasLeft = (n, iso) => n === 'Gone Person' && (iso || today) > '2026-10-18';
        fohRoster['2026-10-18'] = [{name: 'Gone Person', start: '9:00a', end: '3:00p'}, {name: 'Ana Ruiz Lopez', start: '12:00p', end: '8:30p'}];
        fohRoster[today] = [{name: 'Gone Person', start: '9:00a', end: '3:00p'}, {name: 'Ana Ruiz Lopez', start: '12:00p', end: '8:30p'}];
        return {lastDay: tsShifts('2026-10-18').map(s => s.name), after: tsShifts(today).map(s => s.name),
                rnLastDay: rnRosterList('foh', '2026-10-18').map(p => p.name), rnAfter: rnRosterList('foh', today).map(p => p.name)}; }"""

    def test_off_after_their_last_day_only(self):
        out = subprocess.run(['node', os.path.join(ROOT, 'tests', 'right_now_runner.js')], input=json.dumps({'cases': [{'op': self.OP}]}),
                             capture_output=True, text=True, check=True)
        got = json.loads(out.stdout)[0]
        self.assertEqual(got['lastDay'], ['Gone Person', 'Ana Ruiz Lopez'])     # their last day: still on
        self.assertEqual(got['after'], ['Ana Ruiz Lopez'])
        self.assertEqual(got['rnLastDay'], ['Gone Person', 'Ana Ruiz Lopez'])
        self.assertEqual(got['rnAfter'], ['Ana Ruiz Lopez'])


class Lists(unittest.TestCase):
    def test_levelset_matching_and_the_trial_trackers_leave_them_out(self):
        pea = read('static', 'js', 'pea-ratings.js')
        self.assertIn("const peaNames = Object.keys(peaStrengthByPerson()).filter(n => !(typeof teamHasLeft === 'function' && teamHasLeft(n)))", pea)
        for f, var in (('trainer-trial.js', 'ttTrainees'), ('team-lead-trial.js', 'tlTrainees')):
            js = read('static', 'js', f)
            self.assertIn(f"const {var} = ", js)
            self.assertIn(f"${{{var}.map(t => `<button class=\"trial-trainee-tab", js)
            self.assertNotIn("Trainees.map(t => `<button class=\"trial-trainee-tab", js.replace(f"{var}.map(t => `<button class=\"trial-trainee-tab", ''))

    def test_rotated_off_list(self):
        hc = read('static', 'js', 'headcount.js')
        self.assertIn('Rotated off <span>${hcShowAll ? \'all\' : \'last 12 months\'} · ${shown.length}</span>', hc)
        self.assertIn('<div class="hc-off-head"><span>Name</span><span>Hired</span><span>Left</span><span></span></div>', hc)
        row = hc[hc.index('function hcOffRowHtml(d){'):hc.index('\n}\n', hc.index('function hcOffRowHtml(d){'))]
        self.assertIn('hcProfileFor(d.name)', row)
        self.assertIn('hcDate(p.hireDate)', row)
        self.assertIn('hcDate(d.lastDay)', row)
        self.assertNotIn('d.reason', row)                                     # name, hired, left: nothing more
        self.assertNotIn('Recent departures', hc)
        self.assertIn('.hc-off-row{', read('static', 'css', 'theme-cfa.css'))
        self.assertTrue(os.path.exists(os.path.join(ROOT, 'tools', 'depart_audit.js')))


if __name__ == '__main__':
    unittest.main()
