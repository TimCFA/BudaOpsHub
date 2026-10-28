"""Accounts (Tim, Oct 17 2026): Sign in with Google (cfabuda.com addresses
are directors, the owner manages the rest), team clock-in PINs with roles,
and what each role's session may do.

Run: python3 -m unittest discover tests
Google is never called: the token check is replaced with made-up claims.
Firebase is a dict. Names and emails are made up.
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
        for k, v in changes.items():
            if v is None:
                kids.pop(k, None)
            else:
                kids[k] = v
        store[self.path] = kids


appmod.app.config['SESSION_COOKIE_SECURE'] = False


def reset():
    appmod.db.reference = lambda path: FakeRef(path)
    appmod._login_failures.clear()
    appmod._all_login_failures.clear()
    store.clear()
    store['secure/managerPinHash'] = generate_password_hash('1111')
    store['secure/directorPinHash'] = generate_password_hash('2222')
    store['secure/accounts'] = {}
    store['secure/teamPins'] = {}
    appmod.GOOGLE_CLIENT_ID = 'test-client-id'
    appmod.ACCOUNT_OWNER_EMAILS = {'owner@example.com'}
    appmod.DIRECTOR_EMAIL_DOMAINS = {'cfabuda.com'}


class GoogleSignInTest(unittest.TestCase):
    def setUp(self):
        reset()
        self.c = appmod.app.test_client()
        self.real_verify = appmod.id_token.verify_oauth2_token
        self.claims = None

        def verify(credential, request, audience, clock_skew_in_seconds=0):
            self.assertEqual(audience, 'test-client-id')
            if credential == 'bad':
                raise ValueError('bad token')
            return dict(self.claims)
        appmod.id_token.verify_oauth2_token = verify

    def tearDown(self):
        appmod.id_token.verify_oauth2_token = self.real_verify

    def google(self, **claims):
        self.claims = dict({'email_verified': True, 'name': 'Some Body'}, **claims)
        return self.c.post('/api/auth/google', json={'credential': 'ok'})

    def status(self):
        return self.c.get('/api/manager/status').get_json()

    def test_store_domain_is_a_director(self):
        r = self.google(email='Director@CFABuda.com', hd='cfabuda.com')
        self.assertEqual(r.status_code, 200, r.get_json())
        d = r.get_json()
        self.assertEqual((d['role'], d['director'], d['manager'], d['owner'], d['name']), ('director', True, True, False, 'Some Body'))
        st = self.status()
        self.assertEqual((st['isManager'], st['isDirector'], st['isOwner']), (True, True, False))
        self.assertEqual(st['user'], {'name': 'Some Body', 'role': 'director', 'via': 'google'})
        self.assertEqual(st['googleClientId'], 'test-client-id')
        # Director-only data opens; owner-only doesn't.
        self.assertEqual(self.c.post('/api/pea/notes', json={'name': 'x'}).status_code, 200)
        self.assertEqual(self.c.get('/api/accounts').status_code, 403)

    def test_owner_is_a_director_who_manages_accounts(self):
        self.assertEqual(self.google(email='owner@example.com').get_json()['owner'], True)
        self.assertTrue(self.status()['isOwner'])
        self.assertEqual(self.c.get('/api/accounts').status_code, 200)

    def test_listed_address_is_a_director_and_others_are_refused(self):
        self.assertEqual(self.google(email='someone@gmail.com').status_code, 403)
        store['secure/accounts'][appmod._email_key('someone@gmail.com')] = {'email': 'someone@gmail.com', 'name': 'Listed Person', 'role': 'director'}
        d = self.google(email='someone@gmail.com').get_json()
        self.assertEqual((d['role'], d['manager'], d['director'], d['owner'], d['name']), ('director', True, True, False, 'Listed Person'))
        # An old record with a team role (or a made-up one) never opens Manage.
        for role in ('lead', 'trainer', 'member', 'boss'):
            self.c = appmod.app.test_client()            # a fresh phone each time
            store['secure/accounts'][appmod._email_key('other@gmail.com')] = {'email': 'other@gmail.com', 'name': 'Old Record', 'role': role}
            self.assertEqual(self.google(email='other@gmail.com').status_code, 403, role)
            self.assertFalse(self.status()['isManager'], role)

    def test_bad_or_unverified_tokens(self):
        self.claims = {'email': 'director@cfabuda.com', 'email_verified': True}
        self.assertEqual(self.c.post('/api/auth/google', json={'credential': 'bad'}).status_code, 401)
        self.assertEqual(self.google(email='director@cfabuda.com', email_verified=False).status_code, 401)
        self.assertEqual(self.c.post('/api/auth/google', json={}).status_code, 400)
        self.assertEqual(len(appmod._all_login_failures), 2)        # each counts as a failed login
        appmod.GOOGLE_CLIENT_ID = ''
        self.assertEqual(self.google(email='director@cfabuda.com').status_code, 400)
        self.assertNotIn('googleClientId', self.status())

    def test_logout_clears_everything(self):
        self.google(email='owner@example.com')
        self.c.post('/api/manager/logout')
        st = self.status()
        self.assertEqual((st['isManager'], st['isDirector'], st['isOwner'], st['user']), (False, False, False, None))


class TeamPinTest(unittest.TestCase):
    def setUp(self):
        reset()
        self.owner = appmod.app.test_client()
        with self.owner.session_transaction() as sess:
            sess['manager'] = True
            sess['director'] = True
            sess['owner'] = True

    def upload(self, rows, replace=False, c=None):
        return (c or self.owner).post('/api/accounts/pins', json={'rows': rows, 'replace': replace})

    def login(self, pin):
        c = appmod.app.test_client()
        return c, c.post('/api/manager/login', json={'pin': pin})

    def test_upload_then_sign_in_by_pin(self):
        r = self.upload([{'name': 'Jordan Testcase', 'pin': '123456', 'role': 'Team Member'},
                         {'name': 'Riley Sample', 'pin': '234567', 'role': 'Trainer'},
                         {'name': 'Casey Example', 'pin': '345678', 'role': 'Team Lead'},
                         {'name': 'Bad Row', 'pin': '12345', 'role': 'Team Member'},
                         {'name': 'Twin', 'pin': '123456', 'role': 'Team Member'},
                         {'name': 'Odd Role', 'pin': '999999', 'role': 'Boss'},
                         {'name': 'Dee Rector', 'pin': '456789', 'role': 'Director'},
                         {'name': 'Same As Manager', 'pin': '1111', 'role': 'Team Member'},
                         {'name': 'Same As Director', 'pin': '2222', 'role': 'Team Member'}])
        self.assertEqual(r.status_code, 200, r.get_json())
        d = r.get_json()
        self.assertEqual(d['added'], 3)
        self.assertEqual(len(d['skipped']), 6)
        self.assertTrue(any('directors sign in with Google' in x for x in d['skipped']))
        self.assertEqual([p['name'] for p in d['pins']], ['Casey Example', 'Jordan Testcase', 'Riley Sample'])
        # No PIN anywhere in what's stored or returned.
        self.assertNotIn('123456', repr(store['secure/teamPins']))
        self.assertNotIn('123456', repr(d))
        self.assertTrue(len(store['secure/teamPinSalt']) >= 32)

        c, r = self.login('123456')
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.get_json()['role'], r.get_json()['name'], r.get_json()['manager']), ('member', 'Jordan Testcase', False))
        st = c.get('/api/manager/status').get_json()
        self.assertEqual((st['isManager'], st['user']['name'], st['user']['role']), (False, 'Jordan Testcase', 'member'))
        self.assertEqual(c.post('/api/pea/notes', json={'name': 'x'}).status_code, 403)

        # A Team Lead's PIN signs them in by name and does NOT open Manage.
        c, r = self.login('345678')
        self.assertEqual((r.get_json()['role'], r.get_json()['manager'], r.get_json()['director'], r.get_json()['name']), ('lead', False, False, 'Casey Example'))
        st = c.get('/api/manager/status').get_json()
        self.assertEqual((st['isManager'], st['isDirector'], st['user']['role']), (False, False, 'lead'))

        c, r = self.login('234567')
        self.assertEqual((r.get_json()['role'], r.get_json()['manager']), ('trainer', False))

    def test_admin_team_pin(self):
        """The admin team (Ashley, Oct 20 2026) signs in with a clock-in PIN
        too. Since Oct 25 2026 (Tim) it has the same permissions as a
        director, Manage included; only the owner edits the account lists."""
        d = self.upload([{'name': 'Avery Office', 'pin': '567890', 'role': 'Admin Team'}]).get_json()
        self.assertEqual((d['added'], d['pins'][0]['role']), (1, 'admin'))
        c, r = self.login('567890')
        self.assertEqual((r.get_json()['role'], r.get_json()['manager'], r.get_json()['director']), ('admin', True, True))
        with c.session_transaction() as sess:
            self.assertTrue(sess.get('manager'))
            self.assertNotIn('owner', sess)
        self.assertEqual(c.get('/api/accounts').status_code, 403)

    def directors(self, names):
        """The Directors list as Manage saves it (None: never edited, the seed)."""
        store['state'] = {'manager': json.dumps({'directors': [{'name': n, 'title': 'Director'} for n in names]}) if names is not None else '{}'}
        appmod._cache.clear()
        appmod._cache_ready = False

    def test_a_directors_own_pin_signs_in_as_a_director(self):
        """Tim, Oct 25 2026: his clock-in PIN signed him in as a Team Member.
        A PIN whose name is on the Directors list (Manage → Directors) is a
        director's sign-in, Manage included, whatever role the PIN list
        carries; taken off the list, the same PIN is a team sign-in again."""
        self.upload([{'name': 'Dee Rector', 'pin': '456789', 'role': 'Team Member'}, {'name': 'Jordan Testcase', 'pin': '123456', 'role': 'Team Member'}])
        self.directors(['Dee  Rector', 'Other Person'])
        c, r = self.login('456789')
        d = r.get_json()
        self.assertEqual((d['role'], d['roleLabel'], d['manager'], d['director'], d['name']), ('director', 'Director', True, True, 'Dee Rector'))
        st = c.get('/api/manager/status').get_json()
        self.assertEqual((st['isManager'], st['isDirector'], st['user']['name'], st['user']['role'], st['user']['via']), (True, True, 'Dee Rector', 'director', 'pin'))
        with c.session_transaction() as sess:
            self.assertTrue(sess.get('manager') and sess.get('director'))
            self.assertNotIn('owner', sess)
            self.assertNotIn('manageUntil', sess)     # personal, checked on every request: not the shared PINs' 12 hours
            self.assertTrue(sess.get('pinKey'))
        self.assertEqual(c.get('/api/accounts').status_code, 403)   # only the owner edits the lists
        # The role on the PIN list itself didn't change.
        self.assertEqual({v['role'] for v in store['secure/teamPins'].values()}, {'member'})
        # Everyone else is what the list says.
        c2, r2 = self.login('123456')
        self.assertEqual((r2.get_json()['role'], r2.get_json()['manager']), ('member', False))
        # Taken off the Directors list: a team sign-in again on the next request.
        self.directors(['Other Person'])
        st = c.get('/api/manager/status').get_json()
        self.assertEqual((st['isManager'], st['user']['role']), (False, 'member'))
        # Put back: a director again, without signing in again.
        self.directors(['Dee Rector'])
        st = c.get('/api/manager/status').get_json()
        self.assertEqual((st['isManager'], st['isDirector'], st['user']['role']), (True, True, 'director'))
        # The PIN taken off the list ends the sign-in.
        self.owner.delete('/api/accounts/pins', json={'name': 'Dee Rector'})
        self.assertIsNone(c.get('/api/manager/status').get_json()['user'])

    def test_the_seed_directors_and_accents_count(self):
        # Never edited: the hub's seed names are the directors. Accents fold.
        self.upload([{'name': 'Timothy Lane', 'pin': '111222', 'role': 'Team Lead'}, {'name': 'Aurora Méndez', 'pin': '333444', 'role': 'Team Member'}])
        self.directors(None)
        self.assertEqual(appmod._director_names(), {'timothy lane', 'kianna ramos', 'casey howard'})
        self.assertEqual(self.login('111222')[1].get_json()['role'], 'director')
        self.assertEqual(self.login('333444')[1].get_json()['role'], 'member')
        self.directors(['Aurora Mendez'])
        self.assertEqual(self.login('333444')[1].get_json()['role'], 'director')
        self.assertEqual(self.login('111222')[1].get_json()['role'], 'lead')

    def leaders(self, names):
        """The leader list (leaderRoster) as the team list saves it."""
        store['state'] = {'manager': json.dumps({'leaderRoster': [{'name': n, 'roles': []} for n in names]})}
        appmod._cache.clear()
        appmod._cache_ready = False

    def test_the_leader_list_makes_a_team_lead(self):
        """Tim, Oct 27 2026: leads marked Team Lead on the team list signed in
        as Team Members (each PIN report upload set them back). Someone on the
        leader list signs in as a Team Lead whatever the PIN list carries,
        under the HotSchedules spelling too; an Admin Team role stays."""
        self.upload([{'name': 'Jordan Testcase', 'pin': '123456', 'role': 'Team Member'},
                     {'name': 'Riley Sample', 'pin': '234567', 'role': 'Trainer'},
                     {'name': 'Avery Office', 'pin': '567890', 'role': 'Admin Team'}])
        c, r = self.login('123456')
        self.assertEqual(r.get_json()['role'], 'member')
        self.leaders(['Jordan Q Testcase', 'Riley Sample', 'Avery Office'])
        self.assertEqual(c.get('/api/manager/status').get_json()['user']['role'], 'lead')   # the open sign-in too
        self.assertEqual(self.login('234567')[1].get_json()['role'], 'lead')
        self.assertEqual(self.login('567890')[1].get_json()['role'], 'admin')
        names = {n['name']: n['role'] for n in c.get('/api/team/names').get_json()['names']}
        self.assertEqual(names['Jordan Testcase'], 'lead')
        self.assertEqual({v['role'] for v in store['secure/teamPins'].values()}, {'member', 'trainer', 'admin'})   # the PIN list itself unchanged
        # Off the leader list: what the PIN list says again.
        self.leaders(['Riley Sample'])
        self.assertEqual(c.get('/api/manager/status').get_json()['user']['role'], 'member')

    def test_a_report_with_no_roles_keeps_the_roles_set_here(self):
        self.upload([{'name': 'Riley Sample', 'pin': '234567', 'role': 'Trainer'}, {'name': 'Avery Office', 'pin': '567890', 'role': 'Admin Team'}])
        self.upload([{'name': 'Riley Sample', 'pin': '234567', 'role': 'Team Member', 'roleSaid': False},
                     {'name': 'Avery Office', 'pin': '567890', 'role': 'Team Member', 'roleSaid': False},
                     {'name': 'New Person', 'pin': '777888', 'role': 'Team Member', 'roleSaid': False}], replace=True)
        roles = {v['name']: v['role'] for v in store['secure/teamPins'].values()}
        self.assertEqual(roles, {'Riley Sample': 'trainer', 'Avery Office': 'admin', 'New Person': 'member'})
        # A role the report (or a tap) names wins.
        self.upload([{'name': 'Riley Sample', 'pin': '234567', 'role': 'Team Member', 'roleSaid': True}], replace=True)
        self.assertEqual([v['role'] for v in store['secure/teamPins'].values()], ['member'])

    def test_a_team_pin_never_opens_manage_or_private_data(self):
        """Whatever the role, a clock-in PIN gets no manager session: no
        private state sections, no manager routes, no accounts."""
        self.upload([{'name': 'Jordan Testcase', 'pin': '123456', 'role': 'Team Member'},
                     {'name': 'Riley Sample', 'pin': '234567', 'role': 'Trainer'},
                     {'name': 'Casey Example', 'pin': '345678', 'role': 'Team Lead'}])
        store['state/pea'] = '{"peaRatings":{"rows":[]}}'
        for pin in ('123456', '234567', '345678'):
            c, r = self.login(pin)
            self.assertEqual(r.status_code, 200)
            self.assertFalse(r.get_json()['manager'], pin)
            with c.session_transaction() as sess:
                self.assertNotIn('manager', sess)
                self.assertNotIn('director', sess)
                self.assertNotIn('owner', sess)
            for method, path in (('post', '/api/pea/levelset-sync'), ('post', '/api/pea/parse'), ('post', '/api/manager/set-pin'),
                                 ('post', '/api/director/set-pin'), ('post', '/api/pea/notes'), ('get', '/api/accounts'),
                                 ('post', '/api/uniform-image/x'), ('post', '/api/firebase/read')):
                self.assertIn(getattr(c, method)(path, json={'pin': '999999', 'name': 'x'}).status_code, (400, 403), f'{pin} {path}')

    def test_manager_pin_is_still_the_way_in_with_a_pin(self):
        c, r = self.login('1111')
        self.assertEqual((r.get_json()['role'], r.get_json()['manager'], r.get_json()['director']), ('manager', True, False))
        self.assertTrue(c.get('/api/manager/status').get_json()['isManager'])
        c, r = self.login('2222')
        self.assertEqual((r.get_json()['role'], r.get_json()['manager'], r.get_json()['director']), ('director', True, True))

    def test_manager_and_director_pins_still_work_and_a_wrong_pin_counts(self):
        c, r = self.login('1111')
        self.assertEqual((r.get_json()['role'], r.get_json()['manager']), ('manager', True))
        c, r = self.login('2222')
        self.assertEqual((r.get_json()['role'], r.get_json()['director']), ('director', True))
        c, r = self.login('000000')
        self.assertEqual(r.status_code, 401)
        self.assertEqual(len(appmod._all_login_failures), 1)

    def test_a_full_list_saves_fast_and_still_refuses_the_manage_pins(self):
        """Tim, Oct 20 2026: saving the PINs did nothing. Two slow password
        checks a row made a full report take minutes; once the manager and
        director PINs have been typed, the list is checked against their keys."""
        store['secure/managerPinHash'] = generate_password_hash('654321')
        store['secure/directorPinHash'] = generate_password_hash('765432')
        store['secure/managePinKeys'] = {}
        real, calls = appmod.check_password_hash, []

        def counting(h, pin):
            calls.append(pin)
            return real(h, pin)
        appmod.check_password_hash = counting
        self.addCleanup(setattr, appmod, 'check_password_hash', real)
        rows = [{'name': f'Person {i}', 'pin': str(100000 + i), 'role': 'Team Member'} for i in range(40)]
        manage = [{'name': 'Same As Manager', 'pin': '654321', 'role': 'Team Member'},
                  {'name': 'Same As Director', 'pin': '765432', 'role': 'Team Member'}]
        # Before either has been typed: the slow check, still refused.
        d = self.upload(rows[:2] + manage).get_json()
        self.assertEqual((d['added'], len(d['skipped'])), (2, 2))
        self.assertTrue(all('manager or director PIN' in x for x in d['skipped']))
        # Signing in keeps each one's key (never the PIN itself).
        self.assertEqual(self.login('654321')[1].get_json()['role'], 'manager')
        self.assertEqual(self.login('765432')[1].get_json()['role'], 'director')
        kept = store['secure/managePinKeys']
        self.assertEqual(sorted(kept), ['director', 'manager'])
        self.assertNotIn('654321', repr(kept))
        calls.clear()
        d = self.upload(rows + manage).get_json()
        self.assertEqual((d['added'], len(d['skipped'])), (40, 2))
        self.assertEqual(calls, [])                                    # no slow checks at all
        self.assertEqual(self.login('100007')[1].get_json()['name'], 'Person 7')
        # A new manager PIN replaces its key: the new one is refused, the old one is free.
        mgr = appmod.app.test_client()
        with mgr.session_transaction() as sess:
            sess['manager'] = True
        self.assertEqual(mgr.post('/api/manager/set-pin', json={'pin': '864200'}).status_code, 200)
        calls.clear()
        d = self.upload([{'name': 'New Clash', 'pin': '864200', 'role': 'Team Member'}, {'name': 'Old Free', 'pin': '654321', 'role': 'Team Member'}]).get_json()
        self.assertEqual(d['added'], 1)
        self.assertIn('New Clash: that PIN is the manager or director PIN', d['skipped'])
        self.assertEqual(calls, [])
        # A key kept for an older hash isn't trusted: the slow check again.
        store['secure/managerPinHash'] = generate_password_hash('975310')
        d = self.upload([{'name': 'Stale', 'pin': '975310', 'role': 'Team Member'}]).get_json()
        self.assertEqual(d['added'], 0)
        self.assertTrue(calls)

    def test_a_failed_key_save_never_stops_a_sign_in(self):
        real = appmod._keep_manage_pin_key

        def broken(*a):
            raise RuntimeError('firebase down')
        appmod._keep_manage_pin_key = broken
        self.addCleanup(setattr, appmod, '_keep_manage_pin_key', real)
        self.assertEqual(self.login('1111')[1].get_json()['role'], 'manager')

    def test_team_session_lasts_until_signed_out_or_the_pin_goes(self):
        # Signed in until signed out (Tim, Oct 25 2026); a removed PIN ends it.
        self.upload([{'name': 'Jordan Testcase', 'pin': '123456', 'role': 'member'}, {'name': 'Riley Sample', 'pin': '234567', 'role': 'member'}])
        c, r = self.login('123456')
        with c.session_transaction() as sess:
            self.assertNotIn('teamEnds', sess)
            self.assertTrue(sess.permanent)
        self.assertEqual(c.get('/api/manager/status').get_json()['user']['name'], 'Jordan Testcase')
        self.owner.delete('/api/accounts/pins', json={'name': 'Jordan Testcase'})
        self.assertIsNone(c.get('/api/manager/status').get_json()['user'])
        # A sign-in from before still ends at 3 AM, as it was given.
        c2, r = self.login('234567')
        with c2.session_transaction() as sess:
            sess['teamEnds'] = int(time.time()) - 5
        self.assertIsNone(c2.get('/api/manager/status').get_json()['user'])

    def test_only_the_owner_edits_the_lists(self):
        director = appmod.app.test_client()
        with director.session_transaction() as sess:
            sess['manager'] = True
            sess['director'] = True
        for c in (director, appmod.app.test_client()):
            self.assertEqual(c.get('/api/accounts').status_code, 403)
            self.assertEqual(self.upload([{'name': 'X', 'pin': '111111', 'role': 'member'}], c=c).status_code, 403)
            self.assertEqual(c.post('/api/accounts/google', json={'email': 'a@b.co'}).status_code, 403)
        self.assertEqual(store['secure/teamPins'], {})

    def test_replace_remove_and_google_list(self):
        self.upload([{'name': 'A Person', 'pin': '111111', 'role': 'member'}, {'name': 'B Person', 'pin': '222222', 'role': 'member'}])
        d = self.upload([{'name': 'C Person', 'pin': '333333', 'role': 'trainer'}], replace=True).get_json()
        self.assertEqual([p['name'] for p in d['pins']], ['C Person'])
        self.assertEqual(self.login('111111')[1].status_code, 401)
        self.assertEqual(self.login('333333')[1].status_code, 200)
        d = self.owner.delete('/api/accounts/pins', json={'name': 'c person'}).get_json()
        self.assertEqual((d['removed'], d['pins']), (1, []))
        # Google accounts: add, list, remove; bad input refused.
        self.assertEqual(self.owner.post('/api/accounts/google', json={'email': 'not an email'}).status_code, 400)
        # Whatever role is asked for, a listed Google account is a director.
        d = self.owner.post('/api/accounts/google', json={'email': 'Dir@Example.com', 'name': 'A Director', 'role': 'lead'}).get_json()
        self.assertEqual(d['google'], [{'email': 'dir@example.com', 'name': 'A Director', 'role': 'director', 'addedAt': d['google'][0]['addedAt']}])
        self.assertEqual([r['id'] for r in d['roles']], ['lead', 'trainer', 'member', 'admin'])
        self.assertEqual(d['owners'], ['owner@example.com'])
        self.assertEqual(d['directorDomains'], ['cfabuda.com'])
        d = self.owner.delete('/api/accounts/google', json={'email': 'dir@example.com'}).get_json()
        self.assertEqual(d['google'], [])

    def test_page_wiring(self):
        root = os.path.join(os.path.dirname(__file__), '..')
        with open(os.path.join(root, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
            html = f.read()
        self.assertIn('/static/js/accounts.js', html)
        self.assertLess(html.index('/static/js/manage-and-import.js'), html.index('/static/js/accounts.js'))
        self.assertIn('id="accountsCard"', html)
        self.assertIn('id="pinInput" placeholder="••••" maxlength="6"', html)
        with open(os.path.join(root, 'static', 'js', 'manage-and-import.js'), encoding='utf-8') as f:
            js = f.read()
        self.assertIn("if(typeof acSignedIn === 'function'){ await acSignedIn(result); return; }", js)
        self.assertIn("if(typeof acApplyStatus === 'function') acApplyStatus(status);", js)


if __name__ == '__main__':
    unittest.main()
