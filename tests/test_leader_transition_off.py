"""The Leader Transition List is off the hub for now (Tim, Nov 23 2026: "it's
never being used"; it comes back when list execution is stronger or leaders
say they want it). Its pill, its page and its row in the leaders' weekly
report are gone. Its items and what was saved are kept, and still loaded and
saved as they are, so nothing on the server changes.

What it left behind still holds: the Safe Count and Huddle are for Team Leads
and up, and a device nobody signed in on says so (Tim, Oct 20 and 21 2026).

Run: python3 -m unittest discover tests   (the role check runs in node)
"""
import json
import os
import subprocess
import unittest

import app as appmod
import huddle_api

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const js = fs.readFileSync(process.argv[1], 'utf8');
const ctx = {launchManager: false, acUser: null};
vm.createContext(ctx);
vm.runInContext(js.match(/function scHidden\(\)\{[\s\S]*?\n}\n/)[0] + js.match(/function scSignedOut\(\)\{[\s\S]*?\n}\n/)[0], ctx);
const out = {};
for(const role of [null, 'member', 'trainer', 'lead', 'admin', 'director']){
  vm.runInContext(`acUser = ${JSON.stringify(role ? {name: 'Jordan Testcase', role} : null)}; launchManager = false;`, ctx);
  out[role || 'nobody'] = vm.runInContext('scHidden()', ctx);
  if(!role) out.signedOut = vm.runInContext('scSignedOut()', ctx);
}
vm.runInContext(`acUser = {name: 'x', role: 'member'}; launchManager = true;`, ctx);
out.managerSession = vm.runInContext('scHidden()', ctx);
process.stdout.write(JSON.stringify(out));
"""

SAVED = ('fohLeaderTransitionChecked', 'fohLeaderTransitionDate', 'leaderTransitionHistory')


class OffTheHub(unittest.TestCase):
    def test_no_pill_and_no_page(self):
        launch = read('static', 'js', 'launch-mode.js')
        lists = launch[launch.index('const LAUNCH_LISTS = ['):launch.index('const LAUNCH_TOOLS')]
        self.assertNotIn('Leader Transition', lists)
        self.assertIn("{view: 'zonereset', label: 'Zone Resets', sub: 'Reinicios'},", lists)   # Zone Resets has its view to itself
        page = read('cfa-buda-ops-hub-complete.html')
        for gone in ('id="leaderTransitionCard"', 'id="fohLeaderTransitionChecklist"', 'Lista de Transición', 'data-launch-page'):
            self.assertNotIn(gone, page)
        self.assertIn('Lists (Zone Resets first, then Huddle, Timers, Food Safety, Safe Count and the Prep Board as pills)', page)   # Manage says what's there

    def test_its_code_and_styles_are_gone(self):
        js = read('static', 'js', 'fohoe-and-safecount.js') + read('static', 'js', 'zone-reset.js') + launch_and_nav()
        for gone in ('renderLeaderTransitionCard', 'getLeaderTransitionCompletion', 'ltRecordHistory', 'ltHidden', 'zrHandoffBannersHtml', 'zrHandoffOrder', 'launchListPage'):
            self.assertNotIn(gone, js)
        css = read('static', 'css', 'theme-cfa.css') + read('static', 'css', 'main.css')
        for gone in ('zr-dp-', 'lt-hidden', 'checklist-item-elevated', 'data-launch-page'):
            self.assertNotIn(gone, css)

    def test_what_was_saved_is_kept(self):
        """Still a saved value on the server and still round-tripped by the
        page, so a deploy changes nothing in the store's data (CLAUDE.md,
        Deploying: a saved setting isn't removed without reading the server)."""
        for key in SAVED:
            self.assertIn(key, appmod.SECTION_OF_KEY)
        self.assertEqual(appmod.SECTION_OF_KEY['leaderTransitionHistory'], 'history')
        storage = read('static', 'js', 'storage.js')
        self.assertIn('fohLeaderTransitionChecked, fohLeaderTransitionDate, leaderTransitionHistory,', storage)   # sent on a save
        self.assertIn("leaderTransitionHistory = (data.leaderTransitionHistory && typeof data.leaderTransitionHistory === 'object') ? data.leaderTransitionHistory : {};", storage)
        zr = read('static', 'js', 'zone-reset.js')
        self.assertIn('const fohLeaderTransitionItems = [', zr)                                # the list itself, for when it comes back
        for key in SAVED:
            self.assertRegex(zr, r'\nlet %s = ' % key)

    def test_nothing_else_points_at_it(self):
        self.assertNotIn('Leader Transition List', huddle_api.PICKS['foh']['system'])           # a huddle goal can't be a list nobody can open
        self.assertIn('Zone Resets', huddle_api.PICKS['foh']['system'])
        report = read('static', 'js', 'leader-report.js')
        self.assertNotIn("key: 'lt'", report)                                                   # nor a leader's weekly score
        self.assertNotIn('leaderTransitionHistory', report)


def launch_and_nav():
    return read('static', 'js', 'launch-mode.js') + read('static', 'js', 'navigation.js')


class LeadersOnly(unittest.TestCase):
    def test_team_lead_and_above(self):
        out = subprocess.run(['node', '-e', RUNNER, os.path.join(ROOT, 'static', 'js', 'fohoe-and-safecount.js')],
                             capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(out.stdout), {'nobody': True, 'signedOut': True, 'member': True, 'trainer': True, 'lead': False,
                                                  'admin': False, 'director': False, 'managerSession': False})

    def test_a_signed_out_device_says_where_they_went(self):
        launch = read('static', 'js', 'launch-mode.js')
        self.assertIn("const showHint = group === LAUNCH_LISTS && typeof scSignedOut === 'function' && scSignedOut();", launch)
        self.assertIn("</button> for Huddle and Safe Count.${esLine('Leads sign in hint')}`;", launch)
        self.assertIn("'Leads sign in hint': 'Líderes de equipo: inicia sesión con tu PIN para la Reunión y el Conteo de la Caja Fuerte.',", read('static', 'js', 'spanish.js'))
        self.assertIn("if(e.target.closest('[data-launch-signin]')){", launch)                  # and opens the PIN pad
        self.assertIn("if(view === 'huddle' && typeof scHidden === 'function' && scHidden()) view = 'zonereset';", read('static', 'js', 'navigation.js'))


if __name__ == '__main__':
    unittest.main()
