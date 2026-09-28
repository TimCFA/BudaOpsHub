"""Sectioned saved state: the split, migration, per-section saves and gates.

Run: python3 -m unittest discover tests
Firebase is replaced with an in-memory store that supports child paths.
"""
import json
import os
import re
import sys
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')
sys.path.insert(0, ROOT)
import app as appmod  # noqa: E402

store = {}


class FakeRef:
    def __init__(self, path):
        self.path = path.strip('/')

    def get(self):
        if self.path in store:
            return store[self.path]
        prefix = self.path + '/'
        kids = {k[len(prefix):]: v for k, v in store.items() if k.startswith(prefix)}
        return kids or None

    def set(self, value):
        store[self.path] = value


appmod.app.config['SESSION_COOKIE_SECURE'] = False

LEGACY = {
    'entries': [{'ts': 1, 'name': 'Nuggets'}],
    'products': [{'id': 'p1'}],
    'posAssignments': {'foh||2026-09-22||Lunch||iPOS 1': 'Josh'},
    'peaRatings': {'rows': []},
    'someFutureKey': 42,
}


def section(name):
    return json.loads(store[f'state/{name}'])


class StateTest(unittest.TestCase):
    def setUp(self):
        # Each test file has its own stand-in database.
        appmod.db.reference = lambda path: FakeRef(path)
        store.clear()
        store['appState'] = json.dumps(LEGACY)
        self.c = appmod.app.test_client()

    def load(self):
        r = self.c.post('/api/state/load', json={})
        self.assertEqual(r.status_code, 200)
        return {k: json.loads(v) for k, v in r.get_json()['sections'].items()}

    def save(self, sections, **kw):
        return self.c.post('/api/state/save', json={'sections': {k: json.dumps(v) for k, v in sections.items()}}, **kw)

    def test_js_and_python_sections_match(self):
        with open(os.path.join(ROOT, 'static/js/storage.js')) as f:
            js = f.read()
        block = re.search(r'const STATE_SECTIONS = \{(.*?)\n\};', js, re.S).group(1)
        parsed = {}
        for name, keys in re.findall(r'(\w+): \[([^\]]*)\]', block):
            parsed[name] = re.findall(r"'(\w+)'", keys)
        self.assertEqual(parsed, appmod.STATE_SECTIONS)

    def test_first_load_migrates_and_keeps_backup(self):
        data = self.load()
        self.assertEqual(data['waste']['entries'], LEGACY['entries'])
        self.assertEqual(data['setups']['posAssignments'], LEGACY['posAssignments'])
        self.assertEqual(data['misc'], {'someFutureKey': 42})
        self.assertIn('appState', store)                     # backup kept
        self.assertEqual(section('manager')['products'], [{'id': 'p1'}])
        # Second load reads the sections, doesn't migrate again.
        store['appState'] = json.dumps({'entries': []})
        self.assertEqual(self.load()['waste']['entries'], LEGACY['entries'])

    def test_save_only_touches_sent_sections(self):
        self.load()
        before_pea = store['state/pea']
        r = self.save({'setups': {'posAssignments': {'k': 'Avah'}}})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(section('setups')['posAssignments'], {'k': 'Avah'})
        self.assertEqual(store['state/pea'], before_pea)

    def test_unknown_section_and_wrong_keys_rejected(self):
        self.load()
        self.assertEqual(self.save({'secure': {'x': 1}}).status_code, 400)
        # A manager-only key hidden in another section is refused.
        self.assertEqual(self.save({'waste': {'entries': [], 'products': [{'id': 'hacked'}]}}).status_code, 400)
        self.assertEqual(section('manager')['products'], [{'id': 'p1'}])
        bad = self.c.post('/api/state/save', json={'sections': {'waste': {'entries': []}}})
        self.assertEqual(bad.status_code, 400)                # must be a JSON string

    def test_manager_fields_kept_without_session(self):
        self.load()
        r = self.save({'manager': {'products': [{'id': 'hacked'}], 'wasteTarget': 5}})
        self.assertEqual(r.get_json().get('managerFieldsIgnored'), ['products', 'wasteTarget'])
        self.assertEqual(section('manager')['products'], [{'id': 'p1'}])

    def test_manager_can_change_manager_fields(self):
        self.load()
        with self.c.session_transaction() as sess:
            sess['manager'] = True
        self.save({'manager': {'products': [{'id': 'p2'}]}})
        self.assertEqual(section('manager')['products'], [{'id': 'p2'}])

    def test_old_page_save_is_filed_into_sections(self):
        self.load()
        with self.c.session_transaction() as sess:
            sess['manager'] = True
        self.save({'manager': {'products': [{'id': 'new-by-manager'}]}})
        with self.c.session_transaction() as sess:
            sess.pop('manager')
        # A tab opened before the deploy saves its whole (stale) blob.
        stale = dict(LEGACY, entries=LEGACY['entries'] + [{'ts': 2, 'name': 'Fries'}])
        r = self.c.post('/api/firebase/write', json={'path': 'appState', 'value': json.dumps(stale)})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(section('waste')['entries']), 2)                       # its change landed
        self.assertEqual(section('manager')['products'], [{'id': 'new-by-manager'}])  # manager's newer change kept

    def test_size_cap(self):
        self.load()
        big = {'entries': ['x' * (appmod.MAX_STATE_BYTES + 10)]}
        self.assertEqual(self.save({'waste': big}).status_code, 413)

    def test_empty_database_bootstraps(self):
        store.clear()
        self.assertEqual(self.load(), {})
        self.assertEqual(self.save({'waste': {'entries': [1]}, 'manager': {'products': [{'id': 'p'}]}}).status_code, 200)
        self.assertEqual(section('manager')['products'], [{'id': 'p'}])


if __name__ == '__main__':
    unittest.main()
