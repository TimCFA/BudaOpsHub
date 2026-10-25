"""Sign in to change anything (TIM-90; Tim, Oct 25 2026).

Who may change what once a director turns on "Require sign-in", who the hub
writes on what they did (never what the page claims), shared store devices,
and sign-ins that last until signed out but end when a PIN goes, a device
is removed, or a director signs someone out everywhere.

Run: python3 -m unittest discover tests
Firebase is a dict. Names are made up.
"""
import json
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
from werkzeug.security import generate_password_hash  # noqa: E402

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
        if top:
            return store[top].get(kid)
        prefix = self.path + '/'
        kids = {k[len(prefix):]: v for k, v in store.items() if k.startswith(prefix)}
        return kids or None

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


TEAM = [{'name': 'Jordan Testcase', 'pin': '123456', 'role': 'Team Member'},
        {'name': 'Riley Sample', 'pin': '234567', 'role': 'Trainer'},
        {'name': 'Casey Example', 'pin': '345678', 'role': 'Team Lead'},
        {'name': 'Avery Office', 'pin': '567890', 'role': 'Admin Team'}]
DAY = 'foh||2026-10-26||Lunch (10:30-1:00)||'


class SignInRequired(unittest.TestCase):
    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._login_failures.clear()
        appmod._all_login_failures.clear()
        appmod._cache.clear()
        appmod._etags.clear()
        appmod._cache_ready = False
        appmod._auth_cache.clear()
        appmod._auth_cache['at'] = 0.0
        store.clear()
        store['secure/managerPinHash'] = generate_password_hash('1111')
        store['secure/accounts'] = {}
        store['secure/teamPins'] = {}
        store['secure/devices'] = {}
        store['secure/sessionGen'] = {}
        store['secure/settings'] = {}
        store['appState'] = json.dumps({'entries': [], 'posAssignments': {DAY + 'iPOS 1': 'Blake Test'},
                                        'zoneChecklistState': {}, 'safeCounts': []})
        appmod.app.config['SESSION_COOKIE_SECURE'] = False
        self.owner = appmod.app.test_client()
        with self.owner.session_transaction() as sess:
            sess['manager'] = True
            sess['director'] = True
            sess['owner'] = True
            sess['user'] = {'name': 'Tim Owner', 'role': 'director'}
        r = self.owner.post('/api/accounts/pins', json={'rows': TEAM, 'replace': True})
        self.assertEqual(r.status_code, 200, r.get_json())
        appmod.app.test_client().post('/api/state/load', json={})

    def login(self, pin, c=None):
        c = c or appmod.app.test_client()
        r = c.post('/api/manager/login', json={'pin': pin})
        self.assertEqual(r.status_code, 200, pin)
        return c

    def require(self, on=True):
        r = self.owner.post('/api/settings/sign-in', json={'requireSignIn': on})
        self.assertEqual(r.get_json()['requireSignIn'], on)

    def save(self, c, section, ops):
        ver = appmod._cache[section]['ver'] if section in appmod._cache else '?'
        return c.post('/api/state/patch', json={'patches': {section: {'ver': ver, 'ops': ops}}}).get_json()

    def section(self, name):
        return json.loads(store[f'state/{name}'])

    def waste(self, c, who='XX', ts=None):
        entry = {'id': f'w{ts or time.time_ns()}', 'ts': ts or 1, 'name': 'Nugget', 'qty': 1, 'cost': 0.16, 'who': who, 'section': 'foh'}
        self.save(c, 'waste', [{'o': 'arr', 'p': ['entries'], 'add': [{'v': entry, 'n': 1, 'i': 0, 'end': True}]}])
        return entry['id']

    def spot(self, c, slot, name):
        return self.save(c, 'setups', [{'o': 'set', 'p': ['posAssignments', DAY + slot], 'v': name}])

    # ----- The switch -----

    def test_only_directors_turn_it_on(self):
        for c in (appmod.app.test_client(), self.login('345678')):
            self.assertEqual(c.post('/api/settings/sign-in', json={'requireSignIn': True}).status_code, 403)
        self.require()
        self.assertTrue(appmod.app.test_client().get('/api/manager/status').get_json()['requireSignIn'])
        self.require(False)

    def test_off_nothing_changes_for_a_device_nobody_signed_in_on(self):
        anon = appmod.app.test_client()
        self.spot(anon, 'Drinks 1', 'Devon Test')
        self.assertEqual(self.section('setups')['posAssignments'][DAY + 'Drinks 1'], 'Devon Test')

    # ----- Who may change what -----

    def test_nobody_signed_in_changes_nothing_and_the_page_settles(self):
        self.require()
        anon = appmod.app.test_client()
        reply = self.spot(anon, 'Drinks 1', 'Devon Test')
        self.assertTrue(reply['success'])                                  # not refused: an old page settles
        self.assertIn('setups', reply['sections'])                         # and gets the real Set Ups back
        self.assertNotIn(DAY + 'Drinks 1', self.section('setups')['posAssignments'])
        self.waste(anon)
        self.assertEqual(self.section('waste')['entries'], [])

    def test_a_team_member_logs_waste_but_not_set_ups(self):
        self.require()
        member = self.login('123456')
        self.waste(member)
        self.assertEqual(len(self.section('waste')['entries']), 1)
        self.spot(member, 'Drinks 1', 'Devon Test')
        self.assertNotIn(DAY + 'Drinks 1', self.section('setups')['posAssignments'])
        # Safe counts are for leads.
        self.save(member, 'safe', [{'o': 'arr', 'p': ['safeCounts'], 'add': [{'v': {'id': 'safe1', 'total': 1}, 'n': 1, 'i': 0, 'end': True}]}])
        self.assertNotIn('state/safe', store) if 'state/safe' not in store else self.assertEqual(self.section('safe').get('safeCounts', []), [])

    def test_a_team_lead_fills_set_ups_and_the_admin_team_anything(self):
        self.require()
        self.spot(self.login('345678'), 'Drinks 1', 'Devon Test')
        self.assertEqual(self.section('setups')['posAssignments'][DAY + 'Drinks 1'], 'Devon Test')
        admin = self.login('567890')
        self.save(admin, 'manager', [{'o': 'set', 'p': ['wasteTarget'], 'v': 120}])
        self.assertEqual(self.section('manager')['wasteTarget'], 120)       # a manager-only field: Admin = Director

    # ----- Who did it -----

    def test_the_hub_writes_who_really_did_it(self):
        member = self.login('123456')
        wid = self.waste(member, who='CE')                                 # claims to be Casey
        entry = next(e for e in self.section('waste')['entries'] if e['id'] == wid)
        self.assertEqual(entry['who'], 'Jordan Testcase')
        # A zone check signs with initials too.
        self.save(member, 'ops', [{'o': 'set', 'p': ['zoneChecklistState', '2026-10-26'], 'v': {'Lobby': {'Tables': {'initials': 'TO', 'ts': 5}}}}])
        self.assertEqual(self.section('ops')['zoneChecklistState']['2026-10-26']['Lobby']['Tables']['initials'], 'Jordan Testcase')

    def test_a_correction_keeps_who_logged_it(self):
        member = self.login('123456')
        wid = self.waste(member, ts=7)
        entry = next(e for e in self.section('waste')['entries'] if e['id'] == wid)
        fixed = dict(entry, name='5 Count Nugget', fixed={'from': {'name': 'Nugget'}, 'by': 'JT'})
        admin = self.login('567890')
        self.save(admin, 'waste', [{'o': 'arr', 'p': ['entries'], 'rm': [{'v': entry, 'n': 0}], 'add': [{'v': fixed, 'n': 1, 'i': 0, 'end': True, 'rep': True}]}])
        after = next(e for e in self.section('waste')['entries'] if e['id'] == wid)
        self.assertEqual([after['who'], after['fixed']['by']], ['Jordan Testcase', 'Avery Office'])

    # ----- Shared devices -----

    def test_a_shared_device_logs_waste_as_itself_and_nothing_else(self):
        self.require()
        ipad = self.login('1111')                                          # a director on the iPad
        r = ipad.post('/api/devices', json={'name': 'Kitchen iPad'})
        self.assertEqual(r.get_json()['device'], 'Kitchen iPad')
        st = ipad.get('/api/manager/status').get_json()
        self.assertEqual([st['device'], st['isManager'], st['user']], ['Kitchen iPad', False, None])
        wid = self.waste(ipad, who='')
        self.assertEqual(next(e for e in self.section('waste')['entries'] if e['id'] == wid)['who'], 'Kitchen iPad')
        self.spot(ipad, 'Drinks 1', 'Devon Test')
        self.assertNotIn(DAY + 'Drinks 1', self.section('setups')['posAssignments'])
        # A lead signs in on it for Set Ups; the device stays underneath.
        self.login('345678', ipad)
        self.spot(ipad, 'Drinks 1', 'Devon Test')
        self.assertEqual(self.section('setups')['posAssignments'][DAY + 'Drinks 1'], 'Devon Test')
        with ipad.session_transaction() as sess:
            sess['userUntil'] = int(time.time()) - 1                       # ten minutes without a tap
        st = ipad.get('/api/manager/status').get_json()
        self.assertEqual([st['device'], st['user']], ['Kitchen iPad', None])
        # Removed in Manage: signed out.
        did = next(iter(store['secure/devices']))
        self.owner.delete('/api/devices', json={'id': did})
        self.assertIsNone(ipad.get('/api/manager/status').get_json()['device'])

    def test_only_directors_make_a_device(self):
        for c in (appmod.app.test_client(), self.login('345678')):
            self.assertEqual(c.post('/api/devices', json={'name': 'Kitchen iPad'}).status_code, 403)

    # ----- Staying signed in, and ending it -----

    def test_sign_out_everywhere(self):
        phone = self.login('123456')
        self.assertEqual(phone.get('/api/manager/status').get_json()['user']['name'], 'Jordan Testcase')
        self.assertEqual(self.login('345678').post('/api/team/sign-out-everywhere', json={'name': 'Jordan Testcase'}).status_code, 403)
        self.assertEqual(self.login('567890').post('/api/team/sign-out-everywhere', json={'name': 'Jordan Testcase'}).status_code, 200)
        self.assertIsNone(phone.get('/api/manager/status').get_json()['user'])
        self.assertEqual(self.login('123456').get('/api/manager/status').get_json()['user']['name'], 'Jordan Testcase')   # signs in again

    def test_a_changed_pin_or_role(self):
        phone = self.login('123456')
        self.owner.post('/api/team/role', json={'name': 'Jordan Testcase', 'role': 'lead'})
        self.assertEqual(phone.get('/api/manager/status').get_json()['user']['role'], 'lead')       # at once
        self.owner.post('/api/team/pin', json={'name': 'Jordan Testcase', 'pin': '909090'})
        self.assertIsNone(phone.get('/api/manager/status').get_json()['user'])                      # new PIN: sign in again

    def test_a_manage_pin_still_lasts_12_hours(self):
        c = self.login('1111')
        with c.session_transaction() as sess:
            self.assertGreater(sess['manageUntil'], time.time() + 11 * 3600)
            sess['manageUntil'] = int(time.time()) - 1
        self.assertFalse(c.get('/api/manager/status').get_json()['isManager'])


class PageMatchesServer(unittest.TestCase):
    """The page asks for a sign-in on exactly what the hub would refuse."""

    def test_rule_lists_match(self):
        import re
        js = open(os.path.join(os.path.dirname(__file__), '..', 'static', 'js', 'sign-in.js')).read()

        def js_list(name):
            body = re.search(r'const ' + name + r' = \[([^\]]*)\]', js).group(1)
            return set(re.findall(r"'([^']+)'", body))
        self.assertEqual(js_list('SI_MEMBER_SECTIONS'), appmod.MEMBER_SECTIONS)
        self.assertEqual(js_list('SI_DEVICE_EXTRA_KEYS') | set(appmod.STATE_SECTIONS['waste']), appmod.DEVICE_KEYS)


if __name__ == '__main__':
    unittest.main()
