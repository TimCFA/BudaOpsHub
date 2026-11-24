"""View as (Tim, Nov 23 2026): Tim, and only Tim, can look at the hub as a
Team Member, Trainer, Team Lead or the Admin Team sees it (view-as.js). Who
may is the server's (app.py _may_view_as); it's a look only, so nothing is
saved while it's on, and the one thing the server adds is that person's own
PEA (/api/me/pea?as=). Names are made up, but Tim's.

Run: python3 -m unittest discover tests
"""
import json
import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
from tests.test_my_pea import ratings  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*p):
    with open(os.path.join(ROOT, *p), encoding='utf-8') as f:
        return f.read()


TIM = {'manager': True, 'director': True, 'user': {'name': 'Timothy Lane', 'role': 'director', 'via': 'pin'}}


class Who(unittest.TestCase):
    def may(self, sess):
        with appmod.app.test_request_context():
            appmod.session.update(sess)
            return appmod._may_view_as()

    def test_tim_alone(self):
        self.assertTrue(self.may(TIM))
        self.assertTrue(self.may(dict(TIM, user={'name': 'timothy  lane', 'role': 'director', 'via': 'pin'})))
        self.assertTrue(self.may({'manager': True, 'director': True, 'owner': True, 'user': {'name': 'Owner', 'role': 'director', 'via': 'google'}}))
        # Another director, the Admin Team, the shared PINs, a team PIN with his name: no.
        self.assertFalse(self.may(dict(TIM, user={'name': 'Kianna Ramos', 'role': 'director', 'via': 'pin'})))
        self.assertFalse(self.may(dict(TIM, user={'name': 'Timothy Lane', 'role': 'admin', 'via': 'pin'})))
        self.assertFalse(self.may({'manager': True, 'director': True}))
        self.assertFalse(self.may({'user': {'name': 'Timothy Lane', 'role': 'lead', 'via': 'pin'}}))
        self.assertFalse(self.may({}))

    def test_status_and_sign_in_say_so(self):
        src = read('app.py')
        self.assertIn("'viewAs': _may_view_as(),", src)
        self.assertEqual(src.count("'viewAs': _may_view_as()"), 2)


class Pea(unittest.TestCase):
    def setUp(self):
        self.c = appmod.app.test_client()
        self._read = appmod._read_sections
        pea = {'peaRatings': ratings([('2026-10-05T10:00', 'Ana Ruiz', 'Lee Park', 'iPOS', 3)]), 'peaNameAliases': {}}
        appmod._read_sections = lambda: {'pea': pea}

    def tearDown(self):
        appmod._read_sections = self._read

    def as_(self, sess):
        with self.c.session_transaction() as s:
            s.clear()
            s.update(sess)

    def test_tim_sees_theirs(self):
        self.as_(TIM)
        self.assertEqual([p['position'] for p in self.c.get('/api/me/pea?as=Ana%20Ruiz').get_json()['positions']], ['iPOS'])

    def test_nobody_else_can_ask(self):
        self.as_({'user': {'name': 'Ben Cole', 'role': 'member', 'via': 'pin'}})
        self.assertEqual(self.c.get('/api/me/pea?as=Ana%20Ruiz').get_json(), {'name': None, 'positions': []})
        self.as_(dict(TIM, user={'name': 'Kianna Ramos', 'role': 'director', 'via': 'pin'}))
        self.assertEqual(self.c.get('/api/me/pea?as=Ana%20Ruiz').get_json(), {'name': None, 'positions': []})


# The page: view-as.js run in node with the globals it sets.
RUN = r"""
const fs = require('fs'), vm = require('vm');
const ctx = {console, document: {body: {classList: {toggle(){}, remove(){}}, insertBefore(){}, firstChild: null},
  getElementById: () => null, querySelector: () => null, createElement: () => ({setAttribute(){}, addEventListener(){}, remove(){}, classList: {add(){}, remove(){}}})}};
vm.createContext(ctx);
vm.runInContext(`
  var acUser = {name: 'Timothy Lane', role: 'director', via: 'pin'};
  var siIdentity = {name: 'Timothy Lane', role: 'director', device: '', required: true, known: true};
  var launchManager = true;
  var today = '2026-11-23';
  var fohRoster = {'2026-11-23': [{name: 'Ana Ruiz'}, {name: 'Leo Park'}]}, bohRoster = {};
  var leaderRoster = [{name: 'Leo Park', roles: []}];
  function escapeHtml(s){ return String(s); }
  var drawn = 0; function renderRightNow(){ drawn++; }
`, ctx);
const src = fs.readFileSync(process.argv[1], 'utf8');
const grab = n => src.match(new RegExp('(?:^|\\n)function ' + n + '\\([\\s\\S]*?\\n}\\n'))[0];
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), ctx);
vm.runInContext(grab('siMayChange') + '\nfunction siLeadKey(){ return false; }\nvar STATE_SECTION_OF = {waste: "waste"}, STATE_SECTIONS = {waste: ["waste"]}, SI_MEMBER_SECTIONS = [], SI_DEVICE_EXTRA_KEYS = [];', ctx);
const out = {};
const seen = () => vm.runInContext('({role: acUser.role, name: acUser.name, si: siIdentity.role, mgr: launchManager, may: siMayChange("waste"), on: vaActive()})', ctx);
vm.runInContext('vaStart("member", "Ana Ruiz")', ctx); out.notAllowed = seen();
vm.runInContext('vaSetAllowed(true); vaStart("member", "Ana Ruiz")', ctx); out.member = seen();
vm.runInContext('vaStart("lead", vaDefaultName("lead"))', ctx); out.lead = seen();
vm.runInContext('vaStart("admin", "")', ctx); out.admin = seen();
vm.runInContext('vaStop()', ctx); out.back = seen();
vm.runInContext('vaStart("trainer", "Ana Ruiz"); vaQuit()', ctx); out.quit = seen();
out.drawn = vm.runInContext('drawn', ctx);
process.stdout.write(JSON.stringify(out));
"""


class Page(unittest.TestCase):
    def test_start_and_stop(self):
        js = [os.path.join(ROOT, 'static', 'js', 'sign-in.js'), os.path.join(ROOT, 'static', 'js', 'view-as.js')]
        got = json.loads(subprocess.run(['node', '-e', RUN, *js], capture_output=True, text=True, check=True).stdout)
        me = {'role': 'director', 'name': 'Timothy Lane', 'si': 'director', 'mgr': True, 'may': True, 'on': False}
        self.assertEqual(got['notAllowed'], me)          # not until the server says so
        self.assertEqual(got['member'], {'role': 'member', 'name': 'Ana Ruiz', 'si': 'member', 'mgr': False, 'may': False, 'on': True})
        self.assertEqual(got['lead'], {'role': 'lead', 'name': 'Leo Park', 'si': 'lead', 'mgr': False, 'may': False, 'on': True})
        self.assertEqual(got['admin'], {'role': 'admin', 'name': 'Timothy Lane', 'si': 'admin', 'mgr': True, 'may': False, 'on': True})
        self.assertEqual(got['back'], me)
        self.assertEqual(got['quit'], me)
        self.assertGreater(got['drawn'], 0)

    def test_wired_in(self):
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertIn('<script src="/static/js/roles.js" defer></script>\n<script src="/static/js/view-as.js" defer></script>', page)
        acc = read('static', 'js', 'accounts.js')
        self.assertEqual(acc.count("vaSetAllowed(d && d.viewAs)"), 1)
        self.assertEqual(acc.count("vaSetAllowed(result.viewAs)"), 1)
        self.assertIn("if(typeof vaActive === 'function' && vaActive()) return false;", read('static', 'js', 'sign-in.js'))
        rn = read('static', 'js', 'right-now.js')
        self.assertIn("'/api/me/pea' + (as ? '?as=' + encodeURIComponent(as) : '')", rn)
        self.assertIn("as ? null : get('/api/pass/state')", rn)


if __name__ == '__main__':
    unittest.main()
