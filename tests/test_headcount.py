"""Our Team: headcount and departures (Ashley on the admin team, TIM-81, Oct
20 2026). The team is the clock-in PIN list plus the directors the last PIN
report named; whoever drops off a full report waits as a departure to
explain; why someone left is kept outside the page's shared data, and only a
director or an Admin Team sign-in reads or writes it.

Run: python3 -m unittest discover tests
Firebase is a dict. Names are made up.
"""
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
from werkzeug.security import generate_password_hash  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
store = {}


class FakeRef:
    def __init__(self, path):
        self.path = path.strip('/')

    def _nested(self):
        if '/' in self.path and self.path not in store:
            top, kid = self.path.rsplit('/', 1)
            if isinstance(store.get(top), dict):
                return top, kid
        return None, None

    def get(self):
        if self.path in store:
            return store[self.path]
        top, kid = self._nested()
        return store[top].get(kid) if top else None

    def set(self, value):
        top, kid = self._nested()
        if top:
            store[top][kid] = value
        else:
            store[self.path] = value

    def delete(self):
        top, kid = self._nested()
        if top:
            store[top].pop(kid, None)
        else:
            store.pop(self.path, None)

    def update(self, changes):
        kids = dict(store.get(self.path) or {})
        kids.update(changes)
        store[self.path] = kids


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


TEAM = [{'name': 'Jordan Testcase', 'pin': '123456', 'role': 'Team Member'},
        {'name': 'Riley Sample', 'pin': '234567', 'role': 'Trainer'},
        {'name': 'Casey Example', 'pin': '345678', 'role': 'Team Lead'},
        {'name': 'Avery Office', 'pin': '567890', 'role': 'Admin Team'},
        {'name': 'Dee Rector', 'pin': '456789', 'role': 'Director'}]


class HeadcountTest(unittest.TestCase):
    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._login_failures.clear()
        appmod._all_login_failures.clear()
        store.clear()
        store['secure/managerPinHash'] = generate_password_hash('1111')
        store['secure/directorPinHash'] = generate_password_hash('2222')
        store['secure/accounts'] = {}
        store['secure/teamPins'] = {}
        store['secure/teamProfiles'] = {}
        appmod.app.config['SESSION_COOKIE_SECURE'] = False
        self.owner = appmod.app.test_client()
        with self.owner.session_transaction() as sess:
            sess['manager'] = True
            sess['director'] = True
            sess['owner'] = True
            sess['user'] = {'name': 'Tim Owner', 'role': 'director'}

    def upload(self, rows, replace=True):
        r = self.owner.post('/api/accounts/pins', json={'rows': rows, 'replace': replace})
        self.assertEqual(r.status_code, 200, r.get_json())
        return r

    def login(self, pin):
        c = appmod.app.test_client()
        r = c.post('/api/manager/login', json={'pin': pin})
        self.assertEqual(r.status_code, 200)
        return c

    def get(self, c=None):
        return (c or self.owner).get('/api/team/headcount')

    def test_only_directors_and_the_admin_team(self):
        self.upload(TEAM)
        self.assertEqual(self.get(appmod.app.test_client()).status_code, 403)                 # nobody signed in
        for pin in ('123456', '234567', '345678'):                                             # member, trainer, lead
            c = self.login(pin)
            self.assertEqual(self.get(c).status_code, 403, pin)
            self.assertEqual(c.post('/api/team/departures', json={'name': 'X', 'lastDay': '2026-10-01', 'type': 'quit'}).status_code, 403)
        admin = self.login('567890')
        r = self.get(admin)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers['Cache-Control'], 'no-store')
        self.assertEqual(self.get(self.login('1111')).status_code, 200)                        # the manager PIN
        # The departures live outside the saved page data and its exports.
        self.assertTrue(appmod.TURNOVER_PATH.startswith('secure/'))
        self.assertNotIn('teamTurnover', repr(appmod.STATE_SECTIONS))

    def test_the_count_comes_from_the_pin_report(self):
        self.upload(TEAM)
        d = self.get().get_json()
        # Four clock-in PINs and the director the report named.
        self.assertEqual(d['now'], {'total': 5, 'team': 4, 'directors': 1, 'byRole': {'member': 1, 'trainer': 1, 'lead': 1, 'admin': 1}})
        self.assertEqual([(c['total'], c['joined'], c['left']) for c in d['counts']], [(5, 0, 0)])   # the first report: nobody "joined"
        self.assertEqual(d['departures'], [])
        self.assertEqual(d['names'], ['Avery Office', 'Casey Example', 'Jordan Testcase', 'Riley Sample'])
        self.assertNotIn('123456', repr(d))                                                    # never a PIN

    def test_dropping_off_the_report_waits_to_be_explained(self):
        self.upload(TEAM)
        later = [r for r in TEAM if r['name'] != 'Jordan Testcase'] + [{'name': 'Nova Newhire', 'pin': '678901', 'role': 'Team Member'}]
        self.upload(later)
        d = self.get().get_json()
        self.assertEqual(d['now']['total'], 5)
        self.assertEqual([(x['name'], x['status'], x['source'], x['role']) for x in d['departures']],
                         [('Jordan Testcase', 'pending', 'pin-report', 'member')])
        self.assertEqual([h['name'] for h in d['hires']], ['Nova Newhire'])
        self.assertEqual((d['counts'][-1]['joined'], d['counts'][-1]['left']), (1, 1))
        # The same report again: no second departure for the same person.
        self.upload(later)
        self.assertEqual(len(self.get().get_json()['departures']), 1)
        # Adding a few PINs (not the whole report) never reads as people leaving.
        self.upload([{'name': 'Kai Extra', 'pin': '789012', 'role': 'Team Member'}], replace=False)
        d = self.get().get_json()
        self.assertEqual((d['now']['total'], len(d['departures'])), (6, 1))
        self.assertEqual(d['now']['directors'], 1)                                             # carried from the last report

    def test_a_removed_pin_and_a_false_alarm(self):
        self.upload(TEAM)
        self.owner.delete('/api/accounts/pins', json={'name': 'riley sample'})
        dep = self.get().get_json()['departures']
        self.assertEqual([(x['name'], x['source']) for x in dep], [('Riley Sample', 'pin-removed')])
        # Back on the next report: it was never a departure.
        self.upload(TEAM)
        self.assertEqual(self.get().get_json()['departures'][0]['status'], 'dismissed')

    def test_log_why_edit_dismiss_and_remove(self):
        self.upload(TEAM)
        self.upload(TEAM[1:])
        admin = self.login('567890')
        pid = self.get(admin).get_json()['departures'][0]['id']
        self.assertTrue(re.fullmatch(r'[0-9a-f]{12}', pid))
        post = lambda body, c=admin: c.post('/api/team/departures', json=body)
        # Refused: no type, a bad date, an unknown rehire answer, an unknown id.
        self.assertEqual(post({'id': pid, 'name': 'Jordan Testcase', 'lastDay': '2026-10-18'}).status_code, 400)
        self.assertEqual(post({'id': pid, 'name': 'Jordan Testcase', 'lastDay': 'Oct 18', 'type': 'quit'}).status_code, 400)
        self.assertEqual(post({'id': pid, 'name': 'Jordan Testcase', 'lastDay': '2026-10-18', 'type': 'quit', 'rehire': 'maybe'}).status_code, 400)
        self.assertEqual(post({'id': 'abcdef012345', 'name': 'J', 'lastDay': '2026-10-18', 'type': 'quit'}).status_code, 404)
        self.assertEqual(post({'id': '../x', 'name': 'J', 'lastDay': '2026-10-18', 'type': 'quit'}).status_code, 400)
        r = post({'id': pid, 'name': 'Jordan Testcase', 'lastDay': '2026-10-18', 'type': 'quit', 'reason': 'Back to school full time.', 'rehire': 'yes'})
        self.assertEqual(r.status_code, 200)
        d = r.get_json()['departures'][0]
        self.assertEqual((d['status'], d['type'], d['reason'], d['rehire'], d['by'], d['source'], d['role']),
                         ('logged', 'quit', 'Back to school full time.', 'yes', 'Avery Office', 'pin-report', 'member'))
        # Logged by hand the day it happens, by a director.
        r = post({'name': 'Casey Example', 'role': 'lead', 'lastDay': '2026-10-19', 'type': 'let-go', 'reason': 'Attendance.', 'rehire': 'no'}, c=self.owner)
        deps = r.get_json()['departures']
        self.assertEqual([(x['name'], x['type'], x['source'], x['by']) for x in deps],
                         [('Casey Example', 'let-go', 'manual', 'Tim Owner'), ('Jordan Testcase', 'quit', 'pin-report', 'Avery Office')])
        # Removed when logged by mistake; a false alarm dismissed.
        cid = deps[0]['id']
        self.assertEqual(admin.delete('/api/team/departures', json={'id': cid}).status_code, 200)
        self.owner.delete('/api/accounts/pins', json={'name': 'avery office'})
        aid = next(x['id'] for x in self.get().get_json()['departures'] if x['name'] == 'Avery Office')
        self.assertEqual(post({'id': aid, 'status': 'dismissed'}, c=self.owner).status_code, 200)
        self.assertEqual(sorted((x['name'], x['status']) for x in self.get().get_json()['departures']),
                         [('Avery Office', 'dismissed'), ('Jordan Testcase', 'logged')])

    def test_profiles(self):
        """TIM-82: a profile per person: food handler permit expiry, hire
        date, birthday, notes. Directors and the Admin Team only."""
        self.upload(TEAM)
        admin = self.login('567890')
        save = lambda body, c=admin: c.post('/api/team/profiles', json=body)
        self.assertEqual(save({'name': 'Jordan Testcase', 'permitExpires': '2027-03-01'}, c=self.login('345678')).status_code, 403)   # a Team Lead
        self.assertEqual(save({'name': ''}).status_code, 400)
        self.assertEqual(save({'name': 'Jordan Testcase', 'birthday': '3/1/2009'}).status_code, 400)
        r = save({'name': 'Jordan  Testcase', 'permitExpires': '2027-03-01', 'hireDate': '2026-05-12', 'birthday': '2009-03-01', 'notes': 'Prefers mornings.'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers['Cache-Control'], 'no-store')
        p = r.get_json()['profiles']
        self.assertEqual([(x['name'], x['permitExpires'], x['hireDate'], x['birthday'], x['notes'], x['by']) for x in p],
                         [('Jordan Testcase', '2027-03-01', '2026-05-12', '2009-03-01', 'Prefers mornings.', 'Avery Office')])
        # Saved again: one profile per person; a blank date clears it.
        r = save({'name': 'jordan testcase', 'permitExpires': '2027-04-01', 'hireDate': '', 'birthday': '2009-03-01'}, c=self.owner)
        p = r.get_json()['profiles']
        self.assertEqual(len(p), 1)
        self.assertEqual((p[0]['permitExpires'], 'hireDate' in p[0], 'notes' in p[0], p[0]['by']), ('2027-04-01', False, False, 'Tim Owner'))
        # The team list carries roles for the profiles page; never a PIN.
        d = self.get(admin).get_json()
        self.assertEqual(d['team'][0], {'name': 'Avery Office', 'role': 'admin'})
        self.assertNotIn('567890', repr(d))
        self.assertTrue(appmod.PROFILES_PATH.startswith('secure/'))
        save({'name': 'Jordan Testcase', 'remove': True})
        self.assertEqual(self.get(admin).get_json()['profiles'], [])
        self.assertEqual(self.get(appmod.app.test_client()).status_code, 403)

    def test_page_wiring(self):
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertIn('<div class="view" id="headcountView">', page)
        self.assertIn('<script src="/static/js/headcount.js"></script>', page)
        nav = read('static', 'js', 'navigation.js')
        self.assertIn("if(view === 'headcount' && !(typeof hcAllowed === 'function' && hcAllowed())) view = 'home';", nav)
        self.assertRegex(read('static', 'js', 'launch-mode.js'), r"const LAUNCH_VIEWS = \[[^\]]*'headcount'")
        js = read('static', 'js', 'headcount.js')
        self.assertIn("return typeof acUser !== 'undefined' && !!acUser && acUser.role === 'admin';", js)
        self.assertNotIn('localStorage', js)                       # HR notes never kept on the phone
        self.assertIn("else if(what === 'headcount')", read('static', 'js', 'right-now.js'))
        self.assertIn('.hc-page{', read('static', 'css', 'theme-cfa.css'))


if __name__ == '__main__':
    unittest.main()
