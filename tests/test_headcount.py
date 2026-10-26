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

    def test_a_role_set_from_the_team_list(self):
        # Manage → Directors, the team list (Tim, Oct 23 2026): a director
        # sets someone's role; it's their sign-in role from then on.
        self.upload(TEAM)
        r = self.owner.post('/api/team/role', json={'name': 'jordan  testcase', 'role': 'lead'})
        self.assertEqual(r.status_code, 200, r.get_json())
        self.assertEqual(r.headers['Cache-Control'], 'no-store')
        self.assertIn({'name': 'Jordan Testcase', 'role': 'lead'}, r.get_json()['team'])
        self.assertEqual(self.login('123456').get('/api/manager/status').status_code, 200)
        c = appmod.app.test_client()
        self.assertEqual(c.post('/api/manager/login', json={'pin': '123456'}).get_json()['role'], 'lead')
        # Never a director (a clock-in PIN never opens Manage), never a stranger.
        self.assertEqual(self.owner.post('/api/team/role', json={'name': 'Jordan Testcase', 'role': 'director'}).status_code, 400)
        self.assertEqual(self.owner.post('/api/team/role', json={'name': 'Nobody Here', 'role': 'lead'}).status_code, 404)
        # Directors, the manager PIN and the Admin Team (the same as a
        # director since Oct 25 2026); not a lead.
        self.assertEqual(self.login('345678').post('/api/team/role', json={'name': 'Riley Sample', 'role': 'admin'}).status_code, 403)
        self.assertEqual(self.login('567890').post('/api/team/role', json={'name': 'Riley Sample', 'role': 'trainer'}).status_code, 200)
        self.assertEqual(self.login('1111').post('/api/team/role', json={'name': 'Riley Sample', 'role': 'member'}).status_code, 200)

    def test_the_reads_go_at_once(self):
        # Our Team opened slowly: three Firebase reads one after another
        # (Tim, Oct 22 2026). Each read here takes 0.2 s; together, one trip.
        import threading
        import time
        self.upload(TEAM)
        real, seen = FakeRef.get, set()

        def slow(ref):
            seen.add(threading.get_ident())
            time.sleep(0.2)
            return real(ref)
        FakeRef.get = slow
        try:
            t = time.monotonic()
            r = self.get()
            took = time.monotonic() - t
        finally:
            FakeRef.get = real
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()['now']['team'], 4)
        self.assertLess(took, 0.5)
        self.assertGreater(len(seen), 1)

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

    def test_permit_spreadsheet(self):
        """Tim, Oct 20 2026: permit dates from an Excel sheet, read on the
        server, checked on the page, then saved without clearing anything."""
        import io
        import openpyxl
        self.upload(TEAM)
        wb = openpyxl.Workbook()
        for r in (['Name', 'Food Handler Expires', 'Hire Date'], ['TESTCASE, JORDAN', '3/1/2027', '5/12/2026'], ['Riley Sample', '11/2/2026', None]):
            wb.active.append(r)
        buf = io.BytesIO()
        wb.save(buf)
        sheet = lambda: {'file': (io.BytesIO(buf.getvalue()), 'permits.xlsx')}
        admin = self.login('567890')
        lead = self.login('345678')
        self.assertEqual(lead.post('/api/team/profiles/read', data=sheet(), content_type='multipart/form-data').status_code, 403)
        self.assertEqual(admin.post('/api/team/profiles/read', data={}, content_type='multipart/form-data').status_code, 400)
        r = admin.post('/api/team/profiles/read', data=sheet(), content_type='multipart/form-data')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers['Cache-Control'], 'no-store')
        rows = r.get_json()['rows']
        self.assertEqual([(x['name'], x.get('permitExpires'), x.get('hireDate')) for x in rows],
                         [('Jordan Testcase', '2027-03-01', '2026-05-12'), ('Riley Sample', '2026-11-02', None)])
        self.assertEqual(store['secure/teamProfiles'], {})                          # reading saves nothing
        # A note already on Riley's profile stays when the sheet is saved.
        admin.post('/api/team/profiles', json={'name': 'Riley Sample', 'notes': 'Prefers closes.', 'birthday': '2007-04-04'})
        self.assertEqual(lead.post('/api/team/profiles/bulk', json={'rows': rows}).status_code, 403)
        self.assertEqual(admin.post('/api/team/profiles/bulk', json={'rows': []}).status_code, 400)
        r = admin.post('/api/team/profiles/bulk', json={'rows': rows + [{'name': 'No Dates'}, {'name': 'Bad', 'permitExpires': '3/1/27'}]})
        self.assertEqual((r.status_code, r.get_json()['saved']), (200, 2))
        p = {x['name']: x for x in r.get_json()['profiles']}
        self.assertEqual(sorted(p), ['Jordan Testcase', 'Riley Sample'])
        self.assertEqual((p['Riley Sample']['permitExpires'], p['Riley Sample']['notes'], p['Riley Sample']['birthday']), ('2026-11-02', 'Prefers closes.', '2007-04-04'))
        self.assertEqual((p['Jordan Testcase']['hireDate'], p['Jordan Testcase']['by']), ('2026-05-12', 'Avery Office'))

    def test_page_wiring(self):
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertIn('<div class="view" id="headcountView">', page)
        # A tab of its own for those who can open it (Tim, Oct 21 2026: no clean way to the permit dates).
        self.assertIn('<button type="button" class="tab hc-only" role="tab" aria-selected="false" aria-controls="headcountView" data-view="headcount">Our Team', page)
        js = read('static', 'js', 'headcount.js')
        self.assertIn("document.body.classList.toggle('hc-allowed', ok);", js)
        # Loaded ahead when the tab shows; dropped at sign-out (Oct 22 2026).
        self.assertIn("if(!ok){ hcData = null; return; }", js)
        self.assertIn("if(!hcData) hcWhenIdle(() => hcLoad());", js)
        self.assertIn("hcData = hcAllowed() ? data : null;", js)
        self.assertIn("if(typeof hcSyncTab === 'function') hcSyncTab();", read('static', 'js', 'fohoe-and-safecount.js'))
        self.assertIn('body:not(.hc-allowed) .hc-only{display:none !important;}', read('static', 'css', 'theme-cfa.css'))
        self.assertIn('<script src="/static/js/headcount.js"></script>', page)
        nav = read('static', 'js', 'navigation.js')
        self.assertIn("if(view === 'headcount' && !(typeof hcAllowed === 'function' && hcAllowed())) view = 'home';", nav)
        self.assertRegex(read('static', 'js', 'launch-mode.js'), r"const LAUNCH_VIEWS = \[[^\]]*'headcount'")
        js = read('static', 'js', 'headcount.js')
        self.assertIn("return typeof acUser !== 'undefined' && !!acUser && acUser.role === 'admin';", js)
        self.assertNotIn('localStorage', js)                       # HR notes never kept on the phone
        self.assertIn("else if(what === 'headcount')", read('static', 'js', 'right-now.js'))
        self.assertIn('.hc-page{', read('static', 'css', 'theme-cfa.css'))



class TeamNames(HeadcountTest):
    """Set Ups picks who to add from the team (Tim, Oct 25 2026): the PIN
    list's names and roles for anyone signed in, never a PIN."""

    def test_names_for_anyone_signed_in_never_a_pin(self):
        self.upload(TEAM)
        appmod._auth_lists(force=True)
        self.assertEqual(appmod.app.test_client().get('/api/team/names').get_json(), {'names': []})   # nobody signed in
        r = self.login('123456').get('/api/team/names')                                              # a team member
        names = r.get_json()['names']
        self.assertIn({'name': 'Casey Example', 'role': 'lead'}, names)
        self.assertEqual([n['name'] for n in names], sorted((n['name'] for n in names), key=str.lower))
        body = r.get_data(as_text=True)
        for pin in ('123456', '234567', '345678', '567890'):
            self.assertNotIn(pin, body)
        self.assertEqual(r.headers['Cache-Control'], 'no-store')

    def test_the_page(self):
        js = read('static', 'js', 'daypicker-and-positions.js')
        self.assertIn("fetch(`${API_BASE}/api/team/names`)", js)
        self.assertIn("if(!p || !p.name || p.source === 'manual') return;", js)             # hand-added names aren't a source
        self.assertIn("if(!known && tmPickPeople().length && !tmPickAllowNew){", js)
        self.assertIn("if(!known) entry.offList = true;", js)
        hc = read('static', 'js', 'headcount.js')
        self.assertIn("p.source !== 'manual' && !names.has(hcKey(p.name))", hc)                # Our Team skips them
        # PIN on file: folded, under the profiles, not first.
        order = hc[hc.index('function renderHeadcountView'):]
        self.assertLess(order.index('${hcTeamHtml()}'), order.index('${hcPinCardHtml()}'))
        self.assertIn('<details class="hc-card hc-pins', hc)


class FixedDayTest(HeadcountTest):
    """The store's day held still, so a last day is behind or ahead of it."""

    TODAY = '2026-10-27'

    def setUp(self):
        super().setUp()
        real = appmod._turnover_today
        appmod._turnover_today = lambda: self.TODAY
        self.addCleanup(setattr, appmod, '_turnover_today', real)

    def log(self, body, c=None):
        return (c or self.owner).post('/api/team/departures', json=dict({'lastDay': '2026-10-25', 'type': 'quit', 'rehire': 'unsure'}, **body))


class DepartedEverywhere(FixedDayTest):
    """Someone logged as left is gone from the hub (Tim, Oct 25 2026): off the
    clock-in PIN list (signed out), out of the names every list offers, kept
    off by a later PIN report; their role is the list's; a departure logged by
    mistake puts their PIN back."""

    def test_off_the_pin_list_signed_out_and_out_of_the_names(self):
        self.upload(TEAM)
        phone = self.login('123456')                                             # Jordan, a Team Member
        self.assertEqual(phone.get('/api/manager/status').get_json()['user']['name'], 'Jordan Testcase')
        r = self.log({'name': 'Jordan Testcase', 'role': 'lead'})               # the page's role is ignored
        d = next(x for x in r.get_json()['departures'] if x['name'] == 'Jordan Testcase')
        self.assertEqual(d['role'], 'member')
        self.assertNotIn('pin', d)                                               # the stashed PIN never leaves the server
        self.assertIsNone(phone.get('/api/manager/status').get_json()['user'])    # signed out
        self.assertEqual(appmod.app.test_client().post('/api/manager/login', json={'pin': '123456'}).status_code, 401)
        lead = self.login('345678')
        names = lead.get('/api/team/names').get_json()
        self.assertNotIn('Jordan Testcase', [n['name'] for n in names['names']])
        self.assertEqual(names['departed'], [{'name': 'Jordan Testcase', 'lastDay': '2026-10-25'}])
        self.assertEqual(r.get_json()['departed'], [{'name': 'Jordan Testcase', 'lastDay': '2026-10-25'}])

    def test_a_pin_report_doesnt_bring_them_back_but_set_pin_does(self):
        self.upload(TEAM)
        self.log({'name': 'Jordan Testcase'})
        r = self.upload(TEAM)                                                    # the store's report still has them
        self.assertTrue(any(x.startswith('Jordan Testcase: logged as left') for x in r.get_json()['skipped']))
        self.assertEqual(appmod.app.test_client().post('/api/manager/login', json={'pin': '123456'}).status_code, 401)
        self.owner.post('/api/team/pin', json={'name': 'Jordan Testcase', 'pin': '121212', 'role': 'member'})   # rehired
        self.assertEqual(self.get().get_json()['departed'], [])

    def test_logged_by_mistake_puts_the_pin_back(self):
        self.upload(TEAM)
        did = next(x['id'] for x in self.log({'name': 'Jordan Testcase'}).get_json()['departures'] if x['name'] == 'Jordan Testcase')
        self.owner.delete('/api/team/departures', json={'id': did})
        self.assertEqual(appmod.app.test_client().post('/api/manager/login', json={'pin': '123456'}).get_json()['name'], 'Jordan Testcase')

    def test_every_list_leaves_them_out(self):
        for f, line in [('daypicker-and-positions.js', ".filter(p => !(typeof teamHasLeft === 'function' && teamHasLeft(p.name)))"),
                        ('team-schedule.js', "!onDay(t.name) && !(typeof teamHasLeft === 'function' && teamHasLeft(t.name))"),
                        ('team-pea.js', "Object.keys(now).filter(name => !(typeof teamHasLeft === 'function' && teamHasLeft(name)))"),
                        ('all-green.js', "if(typeof teamHasLeft === 'function' && teamHasLeft(p.name)) return;"),
                        ('pea-ratings.js', "!(typeof teamHasLeft === 'function' && teamHasLeft(n))"),
                        ('leaders.js', "!(typeof teamHasLeft === 'function' && teamHasLeft(n))"),
                        ('points.js', "!(typeof teamHasLeft === 'function' && teamHasLeft(n))"),
                        ('forms.js', "!(typeof teamHasLeft === 'function' && teamHasLeft(n))"),
                        ('uniform-orders.js', "!(typeof teamHasLeft === 'function' && teamHasLeft(n))"),
                        ('weekly-roster-import.js', "teamHasLeft(p.name, dateISO)"),
                        ('headcount.js', "const off = typeof launchManager !== 'undefined' && launchManager ? hcTakeOffSchedule(f.name, f.lastDay)"),
                        ('headcount.js', "teamLeftSet(data.departed);")]:
            self.assertIn(line, read('static', 'js', f), f)


class GaveNotice(FixedDayTest):
    """Two weeks' notice (Tim, Oct 26 2026): a departure logged with a last
    day still to come keeps them on the team, signing in, through that day;
    the day after, their PIN comes off and they're signed out."""

    def notice(self):
        self.upload(TEAM)
        phone = self.login('123456')                                             # Jordan
        r = self.log({'name': 'Jordan Testcase', 'lastDay': '2026-11-07'})
        return phone, r

    def test_on_the_team_and_signed_in_through_their_last_day(self):
        phone, r = self.notice()
        d = next(x for x in r.get_json()['departures'] if x['name'] == 'Jordan Testcase')
        self.assertTrue(d['notice'])
        self.assertEqual(d['noticed'], self.TODAY)
        self.assertEqual(phone.get('/api/manager/status').get_json()['user']['name'], 'Jordan Testcase')
        names = self.login('345678').get('/api/team/names').get_json()
        self.assertIn('Jordan Testcase', [n['name'] for n in names['names']])
        # On the left list with their last day: the page counts them gone after it.
        self.assertEqual(names['departed'], [{'name': 'Jordan Testcase', 'lastDay': '2026-11-07'}])
        self.TODAY = '2026-11-07'                                                # their last day: still on
        self.assertEqual(appmod.app.test_client().post('/api/manager/login', json={'pin': '123456'}).status_code, 200)

    def test_the_day_after_their_pin_comes_off(self):
        phone, r = self.notice()
        self.TODAY = '2026-11-08'
        names = self.login('345678').get('/api/team/names').get_json()          # any signed-in page load
        self.assertNotIn('Jordan Testcase', [n['name'] for n in names['names']])
        self.assertIsNone(phone.get('/api/manager/status').get_json()['user'])    # signed out
        self.assertEqual(appmod.app.test_client().post('/api/manager/login', json={'pin': '123456'}).status_code, 401)
        d = next(x for x in self.get().get_json()['departures'] if x['name'] == 'Jordan Testcase')
        self.assertNotIn('notice', d)
        self.assertNotIn('pin', d)
        # Logged by mistake after all: the PIN goes back.
        self.owner.delete('/api/team/departures', json={'id': d['id']})
        self.assertEqual(appmod.app.test_client().post('/api/manager/login', json={'pin': '123456'}).status_code, 200)

    def test_our_team_opening_also_takes_it_off(self):
        self.notice()
        self.TODAY = '2026-11-09'
        self.assertNotIn('Jordan Testcase', [t['name'] for t in self.get().get_json()['team']])

    def test_a_pin_report_keeps_them_until_then(self):
        self.notice()
        r = self.upload(TEAM)
        self.assertFalse(any(x.startswith('Jordan Testcase') for x in r.get_json()['skipped']))
        self.assertEqual(appmod.app.test_client().post('/api/manager/login', json={'pin': '123456'}).status_code, 200)
        # A report without them early: already logged, nothing new to explain.
        self.upload([row for row in TEAM if row['name'] != 'Jordan Testcase'])
        pending = [x for x in self.get().get_json()['departures'] if x['status'] == 'pending']
        self.assertNotIn('Jordan Testcase', [x['name'] for x in pending])

    def test_a_last_day_moved_later_puts_the_pin_back(self):
        self.upload(TEAM)
        did = next(x['id'] for x in self.log({'name': 'Jordan Testcase'}).get_json()['departures'] if x['name'] == 'Jordan Testcase')
        self.assertEqual(appmod.app.test_client().post('/api/manager/login', json={'pin': '123456'}).status_code, 401)
        self.log({'id': did, 'name': 'Jordan Testcase', 'lastDay': '2026-11-14'})
        self.assertEqual(appmod.app.test_client().post('/api/manager/login', json={'pin': '123456'}).status_code, 200)

    def test_the_page(self):
        js = read('static', 'js', 'headcount.js')
        self.assertIn('value="${escapeHtml(f.lastDay || f.noticed || today)}" required>', js)   # no max: a last day ahead is allowed
        self.assertIn('${hcLeavingHtml(s)}', js)
        self.assertIn("const recent = deps.filter(d => hcWhen(d) >= since && !hcIsLeaving(d));", js)   # not counted as left yet
        self.assertIn("return !!hit && (!hit.lastDay || (iso || today) > hit.lastDay);", read('static', 'js', 'state-and-utils.js'))


class DeparturePick(unittest.TestCase):
    """Log a departure picks who left from the team (Tim, Oct 25 2026), not a typed name."""

    def test_wiring(self):
        js = read('static', 'js', 'headcount.js')
        self.assertNotIn('list="hcNames"', js)                                  # the iPhone barely shows a datalist
        self.assertIn('<div class="tm-picks" id="hcNamePicks" role="listbox"', js)
        self.assertIn("((hcData && hcData.team) || []).forEach(t => add(t.name, t.role));", js)
        self.assertIn("if(!known && !hcForm.allowOff){ hcPickDraw();", js)
        # The role is the PIN list's: no Role box for someone the hub knows (Tim, Oct 25 2026).
        self.assertIn("if(who && who.role && HC_ROLE_LABELS[who.role]){ hcForm.role = who.role; hcForm.roleKnown = true; }", js)
        self.assertIn("${hcRoleKnown(f) ? `<div class=\"field\"><span class=\"hc-role-label\">Role</span>", js)


class PinOnFile(HeadcountTest):
    """PIN on file (Tim, Oct 25 2026): a director or the admin team can put a
    clock-in PIN on file for someone, or change one; nobody can view a PIN."""

    def put(self, c, **body):
        return c.post('/api/team/pin', json=body)

    def test_only_directors_and_the_admin_team(self):
        self.upload(TEAM)
        self.assertEqual(self.put(appmod.app.test_client(), name='New Person', pin='111222').status_code, 403)
        for pin in ('123456', '234567', '345678'):                                             # member, trainer, lead
            self.assertEqual(self.put(self.login(pin), name='New Person', pin='111222').status_code, 403, pin)
        admin = self.login('567890')
        r = self.put(admin, name='New Person', pin='111222', role='member')
        self.assertEqual(r.status_code, 200)
        self.assertIn('New Person', r.get_json()['names'])
        self.assertEqual(appmod.app.test_client().post('/api/manager/login', json={'pin': '111222'}).get_json()['name'], 'New Person')

    def test_the_pin_is_never_sent_back_or_kept_plain(self):
        self.upload(TEAM)
        r = self.put(self.owner, name='New Person', pin='111222')
        self.assertNotIn('111222', r.get_data(as_text=True))
        self.assertNotIn('111222', repr(store))
        self.assertEqual(r.headers['Cache-Control'], 'no-store')

    def test_a_pin_someone_else_has_or_a_manage_pin_is_refused_without_saying_whose(self):
        self.upload(TEAM)
        for pin in ('123456', '111111', '222222'):
            store['secure/managerPinHash'] = generate_password_hash('111111')
            store['secure/directorPinHash'] = generate_password_hash('222222')
            r = self.put(self.owner, name='New Person', pin=pin)
            self.assertEqual(r.status_code, 400, pin)
            self.assertNotIn('Jordan', r.get_json()['error'])
        self.assertEqual(self.put(self.owner, name='New Person', pin='12345').status_code, 400)   # 6 digits

    def test_changing_a_pin_replaces_the_old_one_and_keeps_the_role(self):
        self.upload(TEAM)
        r = self.put(self.owner, name='Casey Example', pin='999888')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(appmod.app.test_client().post('/api/manager/login', json={'pin': '345678'}).status_code, 401)   # the old PIN is gone
        who = appmod.app.test_client().post('/api/manager/login', json={'pin': '999888'}).get_json()
        self.assertEqual([who['name'], who['role']], ['Casey Example', 'lead'])
        self.assertEqual(sum(1 for v in store['secure/teamPins'].values() if v['name'] == 'Casey Example'), 1)


class RowIcons(unittest.TestCase):
    """Tim, Oct 23 2026: the first glance stays simple: no permit list, just
    an icon on a person's row for a certificate expired or due soon, a
    birthday this month, a work anniversary this month."""

    def marks(self, profile):
        import json
        import subprocess
        runner = (
            "const fs=require('fs'),vm=require('vm');"
            "const c={today:'2026-10-23',hcData:null,escapeHtml:s=>String(s),toLocalISODate:d=>d.toISOString().slice(0,10)};vm.createContext(c);"
            "const js=fs.readFileSync(process.argv[1],'utf8');"
            "vm.runInContext(js.slice(js.indexOf('function hcAddDays'),js.indexOf('function hcTypeLabel'))+"
            "js.slice(js.indexOf('const HC_PERMIT_SOON_DAYS'),js.indexOf('const HC_ROLE_LABELS'))+"
            "js.slice(js.indexOf('// expired | soon'),js.indexOf('function hcAge'))+"
            "js.slice(js.indexOf('// The icons on a person'),js.indexOf('function hcTeamHtml')),c);"
            "process.stdout.write(JSON.stringify(vm.runInContext('hcMarks('+process.argv[2]+')',c).map(m=>m[1]+' '+m[2])));")
        out = subprocess.run(['node', '-e', runner, os.path.join(ROOT, 'static', 'js', 'headcount.js'), json.dumps(profile)],
                             capture_output=True, text=True, check=True).stdout
        return json.loads(out)

    def test_icons(self):
        self.assertEqual(self.marks({'name': 'Jordan Testcase', 'permitExpires': '2026-10-01', 'birthday': '2008-10-30', 'hireDate': '2023-10-05'}),
                         ['is-expired Food handler certificate expired Oct 1', 'is-bday Birthday Oct 30', 'is-anniv 3-year anniversary Oct 5'])
        self.assertEqual(self.marks({'name': 'Riley Sample', 'permitExpires': '2026-11-10'}), ['is-soon Food handler certificate due Nov 10'])
        # Current, no date, hired this month, born another month: nothing to show.
        self.assertEqual(self.marks({'name': 'Casey Example', 'permitExpires': '2027-05-01', 'birthday': '2001-03-02', 'hireDate': '2026-10-02'}), [])
        self.assertEqual(self.marks({'name': 'No Dates'}), [])
        self.assertEqual(self.marks(None), [])

    def test_no_permit_list_at_first_glance(self):
        js = read('static', 'js', 'headcount.js')
        self.assertNotIn('Food handler permits', js)
        self.assertIn("${hcMarks(p || {name}).map(hcMarkIcon).join('')}</button>", js)


if __name__ == '__main__':
    unittest.main()
