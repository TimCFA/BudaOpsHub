"""Security checks for the Firebase proxy and manager sign-in.

Run: python3 -m unittest discover tests
Firebase is replaced with an in-memory store, so no credentials are needed.
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from werkzeug.security import generate_password_hash  # noqa: E402

import app as appmod  # noqa: E402

store = {}


class FakeRef:
    def __init__(self, path):
        self.path = path

    def get(self):
        return store.get(self.path)

    def set(self, value):
        store[self.path] = value


appmod.app.config['SESSION_COOKIE_SECURE'] = False
PIN_HASH = generate_password_hash('4821')


class ProxySecurityTest(unittest.TestCase):
    def setUp(self):
        # Each test file has its own stand-in database.
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._cache.clear()
        appmod._cache_ready = False
        store.clear()
        store['secure/managerPinHash'] = PIN_HASH
        store['appState'] = json.dumps({'entries': [1], 'products': [{'id': 'p1'}]})
        appmod._login_failures.clear()
        getattr(appmod, '_all_login_failures', []).clear()
        self.c = appmod.app.test_client()

    def post(self, url, body, **kw):
        return self.c.post(url, json=body, **kw)

    # --- paths ---

    def test_pin_hash_cannot_be_read(self):
        r = self.post('/api/firebase/read', {'path': 'secure/managerPinHash'})
        self.assertEqual(r.status_code, 403)
        self.assertNotIn(PIN_HASH, r.get_data(as_text=True))

    def test_other_paths_cannot_be_read(self):
        for path in ['secure', '/', '', 'appState/entries', '../secure/managerPinHash']:
            self.assertEqual(self.post('/api/firebase/read', {'path': path}).status_code, 403, path)

    def test_pin_hash_cannot_be_written(self):
        r = self.post('/api/firebase/write', {'path': 'secure/managerPinHash', 'value': generate_password_hash('0000')})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(store['secure/managerPinHash'], PIN_HASH)

    def test_update_and_delete_are_gone(self):
        for url in ['/api/firebase/update', '/api/firebase/delete']:
            r = self.post(url, {'path': 'appState', 'value': {}})
            self.assertEqual(r.status_code, 404, url)
        self.assertIn('appState', store)
        self.assertEqual(store['secure/managerPinHash'], PIN_HASH)

    def test_app_state_read_is_for_managers(self):
        # The old single-blob copy holds private data (PEA, EOIs).
        r = self.post('/api/firebase/read', {'path': 'appState'})
        self.assertEqual(r.status_code, 403)
        with self.c.session_transaction() as sess:
            sess['manager'] = True
        r = self.post('/api/firebase/read', {'path': 'appState'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(json.loads(r.get_json())['entries'], [1])

    # --- app state writes ---

    def test_app_state_write_still_works(self):
        state = json.loads(store['appState'])
        state['entries'] = [1, 2]
        r = self.post('/api/firebase/write', {'path': 'appState', 'value': json.dumps(state)})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(json.loads(store['appState'])['entries'], [1, 2])

    def test_app_state_must_be_a_json_object_string(self):
        before = store['appState']
        for value in [{'entries': []}, 'not json', json.dumps([1, 2]), json.dumps('x'), None]:
            r = self.post('/api/firebase/write', {'path': 'appState', 'value': value})
            self.assertEqual(r.status_code, 400, value)
        self.assertEqual(store['appState'], before)

    def test_app_state_size_cap(self):
        big = json.dumps({'entries': ['x' * (appmod.MAX_STATE_BYTES + 10)]})
        r = self.post('/api/firebase/write', {'path': 'appState', 'value': big})
        self.assertEqual(r.status_code, 413)

    def test_manager_fields_kept_without_session(self):
        state = json.loads(store['appState'])
        state['products'] = [{'id': 'hacked'}]
        state['entries'] = [1, 2, 3]
        r = self.post('/api/firebase/write', {'path': 'appState', 'value': json.dumps(state)})
        saved = json.loads(store['appState'])
        self.assertEqual(r.get_json().get('managerFieldsIgnored'), ['products'])
        self.assertEqual(saved['products'], [{'id': 'p1'}])
        self.assertEqual(saved['entries'], [1, 2, 3])

    def test_manager_fields_change_with_session(self):
        with self.c.session_transaction() as sess:
            sess['manager'] = True
        state = json.loads(store['appState'])
        state['products'] = [{'id': 'p2'}]
        self.post('/api/firebase/write', {'path': 'appState', 'value': json.dumps(state)})
        self.assertEqual(json.loads(store['appState'])['products'], [{'id': 'p2'}])

    # --- sign-in ---

    def test_set_pin_needs_manager(self):
        r = self.post('/api/manager/set-pin', {'pin': '0000'})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(store['secure/managerPinHash'], PIN_HASH)

    def test_login(self):
        self.assertEqual(self.post('/api/manager/login', {'pin': '4821'}).status_code, 200)
        self.assertTrue(self.c.get('/api/manager/status').get_json()['isManager'])

    def test_forged_forwarded_for_does_not_dodge_throttle(self):
        codes = []
        for i in range(appmod.LOGIN_MAX_ATTEMPTS + 1):
            r = self.post('/api/manager/login', {'pin': '0000'}, headers={'X-Forwarded-For': f'10.0.0.{i}, 203.0.113.5'})
            codes.append(r.status_code)
        self.assertEqual(codes[-1], 429)

    def test_global_throttle_across_addresses(self):
        codes = []
        for i in range(appmod.LOGIN_GLOBAL_MAX_ATTEMPTS + 1):
            r = self.post('/api/manager/login', {'pin': '0000'}, headers={'X-Forwarded-For': f'198.51.100.{i}'})
            codes.append(r.status_code)
        self.assertEqual(codes[-1], 429)
        self.assertEqual(codes.count(401), appmod.LOGIN_GLOBAL_MAX_ATTEMPTS)


if __name__ == '__main__':
    unittest.main()
