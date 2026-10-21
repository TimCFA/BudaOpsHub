"""The Leader Transition List is a Team Lead and above item (Tim, Oct 20
2026): Team Members and Trainers signed in by clock-in PIN don't see it,
the same people the Safe Count is hidden from. A device nobody signed in on
still does, since leaders use shared store devices.

Run: python3 -m unittest discover tests   (the role check runs in node)
"""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const js = fs.readFileSync(process.argv[1], 'utf8');
const ctx = {launchManager: false, acUser: null};
vm.createContext(ctx);
vm.runInContext(js.match(/function scHidden\(\)\{[\s\S]*?\n}\n/)[0] + js.match(/function ltHidden\(\)\{.*\}\n/)[0], ctx);
const out = {};
for(const role of [null, 'member', 'trainer', 'lead', 'admin', 'director']){
  vm.runInContext(`acUser = ${JSON.stringify(role ? {name: 'Jordan Testcase', role} : null)}; launchManager = false;`, ctx);
  out[role || 'nobody'] = vm.runInContext('ltHidden()', ctx);
}
vm.runInContext(`acUser = {name: 'x', role: 'member'}; launchManager = true;`, ctx);
out.managerSession = vm.runInContext('ltHidden()', ctx);
process.stdout.write(JSON.stringify(out));
"""


class WhoSeesIt(unittest.TestCase):
    def test_team_lead_and_above(self):
        out = subprocess.run(['node', '-e', RUNNER, os.path.join(ROOT, 'static', 'js', 'fohoe-and-safecount.js')],
                             capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(out.stdout), {'nobody': False, 'member': True, 'trainer': True, 'lead': False,
                                                  'admin': False, 'director': False, 'managerSession': False})

    def test_wiring(self):
        js = read('static', 'js', 'fohoe-and-safecount.js')
        self.assertIn("document.body.classList.toggle('lt-hidden', ltHidden());", js)
        launch = read('static', 'js', 'launch-mode.js')
        self.assertIn("|| (l.page === 'leaders' && typeof ltHidden === 'function' && ltHidden());", launch)
        self.assertIn('const here = group.filter(l => l.view === view && !hidden(l));', launch)   # the pill opens Zone Resets instead
        self.assertIn('body.lt-hidden #leaderTransitionCard{display:none !important;}', read('static', 'css', 'theme-cfa.css'))
        self.assertIn('<div class="standup-card" id="leaderTransitionCard"', read('cfa-buda-ops-hub-complete.html'))


if __name__ == '__main__':
    unittest.main()
