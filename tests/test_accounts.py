"""Accounts (Tim, Oct 17 2026): Sign in with Google (cfabuda.com addresses
are directors, the owner manages the rest), team clock-in PINs with roles,
and what each role's session may do.

Run: python3 -m unittest discover tests
Google is never called: the token check is replaced with made-up claims.
Firebase is a dict. Names and emails are made up.
"""
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

    def test_listed_address_gets_its_role_and_others_are_refused(self):
        self.assertEqual(self.google(email='someone@gmail.com').status_code, 403)
        store['secure/accounts'][appmod._email_key('someone@gmail.com')] = {'email': 'someone@gmail.com', 'name': 'Listed Person', 'role': 'lead'}
        d = self.google(email='someone@gmail.com').get_json()
        self.assertEqual((d['role'], d['manager'], d['director'], d['name']), ('lead', True, False, 'Listed Person'))
        self.assertEqual(self.c.post('/api/pea/notes', json={'name': 'x'}).status_code, 403)   # a lead isn't a director

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
                         {'name': 'Odd Role', 'pin': '999999', 'role': 'Boss'}])
        self.assertEqual(r.status_code, 200, r.get_json())
        d = r.get_json()
        self.assertEqual(d['added'], 3)
        self.assertEqual(len(d['skipped']), 3)
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

        c, r = self.login('345678')
        self.assertEqual((r.get_json()['role'], r.get_json()['manager'], r.get_json()['director']), ('lead', True, False))
        self.assertTrue(c.get('/api/manager/status').get_json()['isManager'])

        c, r = self.login('234567')
        self.assertEqual(r.get_json()['role'], 'trainer')

    def test_manager_and_director_pins_still_work_and_a_wrong_pin_counts(self):
        c, r = self.login('1111')
        self.assertEqual((r.get_json()['role'], r.get_json()['manager']), ('lead', True))
        c, r = self.login('2222')
        self.assertEqual((r.get_json()['role'], r.get_json()['director']), ('director', True))
        c, r = self.login('000000')
        self.assertEqual(r.status_code, 401)
        self.assertEqual(len(appmod._all_login_failures), 1)

    def test_team_session_ends_at_close(self):
        self.upload([{'name': 'Jordan Testcase', 'pin': '123456', 'role': 'member'}])
        c, r = self.login('123456')
        with c.session_transaction() as sess:
            self.assertGreater(sess['teamEnds'], time.time())
            sess['teamEnds'] = int(time.time()) - 5          # the night passed
        self.assertIsNone(c.get('/api/manager/status').get_json()['user'])

    def test_only_the_owner_edits_the_lists(self):
        director = appmod.app.test_client()
        with director.session_transaction() as sess:
            sess['manager'] = True
            sess['director'] = True
        for c in (director, appmod.app.test_client()):
            self.assertEqual(c.get('/api/accounts').status_code, 403)
            self.assertEqual(self.upload([{'name': 'X', 'pin': '111111', 'role': 'member'}], c=c).status_code, 403)
            self.assertEqual(c.post('/api/accounts/google', json={'email': 'a@b.co', 'role': 'lead'}).status_code, 403)
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
        self.assertEqual(self.owner.post('/api/accounts/google', json={'email': 'not an email', 'role': 'lead'}).status_code, 400)
        self.assertEqual(self.owner.post('/api/accounts/google', json={'email': 'a@b.co', 'role': 'boss'}).status_code, 400)
        d = self.owner.post('/api/accounts/google', json={'email': 'Lead@Example.com', 'name': 'A Lead', 'role': 'lead'}).get_json()
        self.assertEqual(d['google'], [{'email': 'lead@example.com', 'name': 'A Lead', 'role': 'lead', 'addedAt': d['google'][0]['addedAt']}])
        self.assertEqual(d['owners'], ['owner@example.com'])
        self.assertEqual(d['directorDomains'], ['cfabuda.com'])
        d = self.owner.delete('/api/accounts/google', json={'email': 'lead@example.com'}).get_json()
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
