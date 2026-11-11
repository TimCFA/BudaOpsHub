"""A first load shows Home and Set Ups before the rest has come down (Tim,
Nov 11 2026: a first load took 8 s on a phone before Home showed, because
the page waited for all 83 scripts, the managers' tools included).

  - Every script is deferred and runs in the HTML's order. The first group
    is what Home and Set Ups need; early-paint.js is the last of it.
  - early-paint.js puts what those two pages read in place from the saved
    data the page's first lines asked for, and draws the page on screen.
  - Until every script has run and the real load is done, only the Home and
    Set Ups tabs take a tap (body.hub-warming) and nothing is saved.
  - What used to assume "the scripts block the page" waits on
    hubScriptsRan instead: the first load, the sign-in status, the
    HotSchedules sync.
  - Google's script never loads with the page: no one tap, and the sign-in
    sheet asks for the PIN first.

Run: python3 -m unittest discover tests
"""
import json
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


PAGE = read('cfa-buda-ops-hub-complete.html')
FIRST = ['theme', 'state-and-utils', 'waste-catalog', 'setup-history', 'pea-ratings', 'setup-evaluate', 'setup-develop',
         'setup-planb', 'spanish', 'setups-board', 'setups-sheet', 'setup-leaders', 'setup-rules', 'break-planner',
         'setup-fill', 'zone-reset', 'positions-editor', 'events', 'state-patch', 'storage', 'scoreboards-and-eoi',
         'navigation', 'shift-time', 'daypicker-and-positions', 'roster-changes', 'manage-and-import', 'accounts',
         'sign-in', 'launch-mode', 'right-now', 'team-schedule', 'early-paint']


class Scripts(unittest.TestCase):
    def test_every_script_is_deferred(self):
        tags = re.findall(r'<script[^>]*\bsrc="[^"]+"[^>]*>', PAGE)
        self.assertGreater(len(tags), 80)
        self.assertEqual([t for t in tags if not t.endswith(' defer>')], [])

    def test_home_and_set_ups_come_first_then_the_early_paint(self):
        names = re.findall(r'<script src="/static/(?:js|forms)/([\w.-]+)\.js" defer>', PAGE)
        self.assertEqual(names[:len(FIRST)], FIRST)
        self.assertEqual(len(names), len(set(names)))
        # The managers' and directors' tools are in the rest.
        for late in ('forecast', 'data-uploads', 'points', 'team-pea', 'leaders', 'headcount', 'cem-trends', 'directors'):
            self.assertGreater(names.index(late), len(FIRST), late)
        # Where one file builds on another, the order holds.
        for a, b in (('points', 'points-import'), ('leaders', 'team-pea'), ('pass-engine', 'pass'), ('headcount', 'team-extras'),
                     ('management-views', 'weekly-roster-import'), ('form-definitions', 'forms-engine')):
            self.assertLess(names.index(a), names.index(b), (a, b))


class Waits(unittest.TestCase):
    def test_all_scripts_ran_is_a_promise_in_the_first_file(self):
        su = read('static', 'js', 'state-and-utils.js')
        self.assertIn("const hubScriptsRan = new Promise(resolve => {\n  if(document.readyState === 'complete') resolve();\n"
                      "  else document.addEventListener('DOMContentLoaded', resolve, {once: true});\n});", su)
        self.assertIn('let hubWarming = false, hubStarted = false;', su)
        self.assertIn('function showToast(msg){', su)                              # every page's toast, there for all of them
        self.assertNotIn('function showToast', read('static', 'js', 'waste-log.js'))

    def test_the_load_the_status_and_the_hs_sync_wait_on_it(self):
        st = read('static', 'js', 'storage.js')
        load = st[st.index('async function loadState(){'):st.index('function applyStateData(data){')]
        self.assertIn("  if(typeof hubScriptsRan !== 'undefined') await hubScriptsRan;\n", load)
        self.assertNotIn("readyState === 'loading'", st)
        self.assertLess(load.index('hubStarted = true;\n  hubWarming = false;'), load.index('stateStartSync();'))
        m = read('static', 'js', 'manage-and-import.js')
        self.assertIn("  if(typeof hubScriptsRan !== 'undefined') await hubScriptsRan;\n  mgrStatusKnown = true;", m)
        self.assertIn("    resolveStateLoaded();\n    document.body.classList.remove('hub-warming');", m)
        self.assertIn('hubScriptsRan.then(hsSyncStart);', read('static', 'js', 'hs-sync.js'))

    def test_nothing_is_saved_while_warming(self):
        st = read('static', 'js', 'storage.js')
        save = st[st.index('function saveState(){'):st.index('  // The forecast refills Know the Numbers')]
        self.assertIn("  if(typeof hubWarming !== 'undefined' && hubWarming) return Promise.resolve();\n", save)
        css = read('static', 'css', 'theme-cfa.css')
        self.assertIn('body.hub-warming .app{pointer-events:none;}', css)
        self.assertIn('body.hub-warming .tabs .tab[data-view="home"],body.hub-warming .tabs .tab[data-view="positions"]{pointer-events:auto;}', css)
        self.assertIn('body.hub-warming::after{content:"Loading the rest… · Cargando…";', css)


class EarlyPaint(unittest.TestCase):
    """early-paint.js in node, with the page's variables and helpers stubbed."""
    RUNNER = r"""
const vm = require('vm'), fs = require('fs');
const src = fs.readFileSync(process.argv[1], 'utf8');
const run = c => new Promise(resolve => {
  const log = [];
  const body = {classes: [], classList: {add: x => body.classes.push(x)}};
  const ctx = {console: {warn: (...a) => log.push('warn ' + a[1])}, Object, Array, JSON, Promise,
    document: {body, querySelector: () => (c.view ? {id: c.view + 'View'} : null)},
    hubWarming: false, hubStarted: !!c.started, launchMode: 'x', fohRoster: {}, bohRoster: {}, rosterPosted: 0, truckShifts: 0, adminShifts: 0,
    posAssignments: 0, posVacancyFlags: 0, breakCountdowns: 0, completedBreaks: 0, lastUpdated: 0, zoneOwners: 0, posNotes: 0, callIns: 0,
    setupDayTypes: 0, storeEvents: 0, positionLists: 0, entries: 'untouched',
    launchApply: () => log.push('launchApply'), posApplyLists: () => log.push('posApplyLists'), suMigrateDaypartNames: () => log.push('migrate'),
    activateView: v => { if(c.boom) throw new Error('boom'); log.push('activate ' + v); }, saveState: () => log.push('SAVE')};
  ctx.window = ctx;
  ctx.window.stateEarlyLoad = c.none ? null : Promise.resolve(c.reply === undefined ? null : {reply: c.reply});
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  setTimeout(() => resolve({log, classes: body.classes, warming: ctx.hubWarming, pa: ctx.posAssignments, foh: ctx.fohRoster, ev: ctx.storeEvents,
    launchMode: ctx.launchMode === undefined ? 'on' : ctx.launchMode, entries: ctx.entries, stillThere: !!ctx.window.stateEarlyLoad}), 20);
});
(async () => { const cases = JSON.parse(fs.readFileSync(0, 'utf8')); const out = []; for(const c of cases) out.push(await run(c)); process.stdout.write(JSON.stringify(out)); })();
"""
    REPLY = {'sections': {'setups': json.dumps({'posAssignments': {'foh||2026-11-11||Lunch||Host 1': 'Riley Sample'}}),
                          'rosters': json.dumps({'fohRoster': {'2026-11-11': [{'name': 'Riley Sample'}]}}),
                          'manager': json.dumps({'storeEvents': [{'id': 'e1'}], 'wasteTarget': 100}),
                          'waste': json.dumps({'entries': [{'id': 1}]})}}

    def run_cases(self, *cases):
        out = subprocess.run(['node', '-e', self.RUNNER, os.path.join(ROOT, 'static', 'js', 'early-paint.js')],
                             input=json.dumps(list(cases)), capture_output=True, text=True, check=True)
        return json.loads(out.stdout)

    def test_draws_home_or_set_ups_from_the_early_data(self):
        home, setups, lists = self.run_cases({'view': 'home', 'reply': self.REPLY}, {'view': 'positions', 'reply': self.REPLY},
                                             {'view': 'zonereset', 'reply': self.REPLY})
        self.assertEqual(home['classes'], ['hub-warming'])
        self.assertTrue(home['warming'])
        self.assertEqual(home['pa'], {'foh||2026-11-11||Lunch||Host 1': 'Riley Sample'})
        self.assertEqual(home['foh'], {'2026-11-11': [{'name': 'Riley Sample'}]})
        self.assertEqual(home['ev'], [{'id': 'e1'}])
        self.assertEqual(home['launchMode'], 'on')
        self.assertEqual(home['log'], ['launchApply', 'posApplyLists', 'migrate', 'activate home'])
        self.assertEqual(setups['log'][-1], 'activate positions')
        self.assertEqual(lists['log'], ['launchApply', 'posApplyLists', 'migrate'])       # another page: left for the real load
        self.assertEqual(home['entries'], 'untouched')                                    # only what these two pages read
        self.assertTrue(home['stillThere'])                                               # the real load reads the same answer

    def test_stands_aside(self):
        started, no_reply, none, empty, boom = self.run_cases(
            {'view': 'home', 'reply': self.REPLY, 'started': True},      # the real load has begun
            {'view': 'home'},                                              # the early ask failed
            {'view': 'home', 'none': True},
            {'view': 'home', 'reply': {'sections': {}}},                   # a new store: nothing saved
            {'view': 'home', 'reply': self.REPLY, 'boom': True})           # a drawing error: the page starts as it always did
        for r in (started, no_reply, none, empty):
            self.assertEqual((r['classes'], r['warming'], r['log'], r['pa']), ([], False, [], 0))
        self.assertEqual(boom['log'][-1], 'warn Error: boom')
        self.assertEqual(boom['classes'], ['hub-warming'])                 # still looking only: the real load clears it

    def test_never_saves(self):
        self.assertNotIn('saveState', re.sub(r'//.*', '', read('static', 'js', 'early-paint.js')))


class Google(unittest.TestCase):
    def test_never_with_the_page(self):
        ac = read('static', 'js', 'accounts.js')
        self.assertEqual(ac.count("s.src = 'https://accounts.google.com/gsi/client'"), 1)
        self.assertEqual(len(re.findall(r'\bacLoadGsi\(', ac)), 2)          # its definition, and the button's mount
        self.assertNotIn('accounts.google.com', PAGE)


if __name__ == '__main__':
    unittest.main()
