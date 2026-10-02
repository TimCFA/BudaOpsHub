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
        appmod._cache.clear()
        appmod._cache_ready = False
        store.clear()
        store['appState'] = json.dumps(LEGACY)
        self.c = appmod.app.test_client()

    def load_reply(self):
        return self.c.post('/api/state/load', json={}).get_json()

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

    def test_every_saved_field_is_read_back_on_load(self):
        # A field that's saved but not loaded comes back empty after a reload,
        # and the next save then wipes it on the server too.
        with open(os.path.join(ROOT, 'static/js/storage.js')) as f:
            js = f.read()
        start = js.index('function stateSnapshot(){')
        snap = js[start:js.index('\n}\n', start)]
        body = snap[snap.index('return {') + 8:snap.rindex('}')]
        keys = [k.split(':')[0].strip() for k in re.split(r',\s*', body.replace('\n', ' '))]
        keys = [k for k in keys if re.match(r'^\w+$', k)]
        start = js.index('function applyStateData(data){')
        apply = js[start:js.index('\n}\n', start)]
        self.assertGreater(len(keys), 40)
        self.assertEqual([k for k in keys if not re.search(r'data\.' + k + r'\b', apply)], [])

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
        # An old page's save adds; what's already saved stays.
        self.assertEqual(section('setups')['posAssignments'], {'foh||2026-09-22||Lunch||iPOS 1': 'Josh', 'k': 'Avah'})
        self.assertEqual(store['state/pea'], before_pea)

    def test_old_page_cannot_delete_or_overwrite(self):
        self.load()
        # A days-old tab: no waste entries, and an older assignment for iPOS 1.
        self.save({'waste': {'entries': []},
                   'setups': {'posAssignments': {'foh||2026-09-22||Lunch||iPOS 1': 'Stale', 'new': 'Mia'}}})
        self.assertEqual(section('waste')['entries'], LEGACY['entries'])
        self.assertEqual(section('setups')['posAssignments'], {'foh||2026-09-22||Lunch||iPOS 1': 'Josh', 'new': 'Mia'})
        stale = dict(LEGACY, entries=[], cemEntries=[])
        self.c.post('/api/firebase/write', json={'path': 'appState', 'value': json.dumps(stale)})
        self.assertEqual(section('waste')['entries'], LEGACY['entries'])

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

    def test_manager_can_add_manager_fields_from_an_old_page(self):
        self.load()
        with self.c.session_transaction() as sess:
            sess['manager'] = True
        self.save({'manager': {'products': [{'id': 'p2'}]}})
        self.assertEqual(section('manager')['products'], [{'id': 'p1'}, {'id': 'p2'}])

    def test_old_page_save_is_filed_into_sections(self):
        loaded = self.load_reply()
        with self.c.session_transaction() as sess:
            sess['manager'] = True
        # The manager's change, from an up-to-date page.
        self.c.post('/api/state/patch', json={'patches': {'manager': {'ver': loaded['versions']['manager'],
                    'ops': [{'o': 'set', 'p': ['products'], 'v': [{'id': 'new-by-manager'}]}]}}})
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



class PatchTest(unittest.TestCase):
    """Change-based saves (/api/state/patch) and "anything new?" (/api/state/sync)."""

    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._cache.clear()
        appmod._cache_ready = False
        store.clear()
        store['appState'] = json.dumps(LEGACY)
        self.a = appmod.app.test_client()      # two phones
        self.b = appmod.app.test_client()
        self.loaded = self.a.post('/api/state/load', json={}).get_json()

    def ver(self, name, reply=None):
        return (reply or self.loaded)['versions'][name]

    def patch(self, client, name, ver, ops, **kw):
        return client.post('/api/state/patch', json={'patches': {name: {'ver': ver, 'ops': ops}}}, **kw)

    def test_load_gives_versions_and_build(self):
        # Without a manager session, the private sections aren't sent.
        self.assertEqual(set(self.loaded['versions']), set(appmod.STATE_SECTIONS) - set(appmod.PRIVATE_SECTIONS))
        self.assertTrue(self.loaded['build'])

    def test_private_sections_only_for_managers(self):
        store['state/pea'] = json.dumps({'peaRatings': {'names': ['Test Person'], 'rows': []}})
        store['state/people'] = json.dumps({'eoiSubmissions': [{'id': 'x', 'why': 'private'}]})
        appmod._cache.clear()
        for route, body in (('/api/state/load', {}), ('/api/state/sync', {'versions': {}})):
            reply = self.a.post(route, json=body).get_json()
            self.assertFalse(set(appmod.PRIVATE_SECTIONS) & set(reply['sections']), route)
            self.assertFalse(set(appmod.PRIVATE_SECTIONS) & set(reply['versions']), route)
            self.assertNotIn('Test Person', json.dumps(reply))
        with self.a.session_transaction() as sess:
            sess['manager'] = True
        reply = self.a.post('/api/state/load', json={}).get_json()
        self.assertIn('pea', reply['sections'])
        self.assertIn('people', reply['sections'])

    def test_team_device_cannot_change_people_data(self):
        store['state/people'] = json.dumps({'eoiSubmissions': [{'id': 'x'}]})
        appmod._cache.clear()
        self.a.post('/api/state/load', json={})
        r = self.patch(self.a, 'people', '?', [{'o': 'set', 'p': ['eoiSubmissions'], 'v': []}]).get_json()
        self.assertEqual(section('people')['eoiSubmissions'], [{'id': 'x'}])
        self.assertIn('eoiSubmissions', r['managerFieldsIgnored'])
        self.assertNotIn('people', r['sections'])    # and it isn't sent back to them

    def test_two_phones_log_waste_at_once(self):
        v = self.ver('waste')
        add = lambda ts, i: [{'o': 'arr', 'p': ['entries'], 'add': [{'v': {'ts': ts}, 'n': 1, 'i': i, 'end': True}]}]
        r1 = self.patch(self.a, 'waste', v, add(10, 1)).get_json()
        self.assertNotIn('waste', r1['sections'])             # phone A was up to date: nothing to send back
        r2 = self.patch(self.b, 'waste', v, add(11, 1)).get_json()
        self.assertEqual([e['ts'] for e in section('waste')['entries']], [1, 10, 11])
        # Phone B's copy was behind, so it gets the merged section back.
        self.assertEqual([e['ts'] for e in json.loads(r2['sections']['waste'])['entries']], [1, 10, 11])
        self.assertNotEqual(r2['versions']['waste'], v)

    def test_retried_save_does_not_double(self):
        ops = [{'o': 'arr', 'p': ['entries'], 'add': [{'v': {'ts': 10}, 'n': 1, 'i': 1, 'end': True}]}]
        self.patch(self.a, 'waste', self.ver('waste'), ops)
        self.patch(self.a, 'waste', self.ver('waste'), ops)
        self.assertEqual([e['ts'] for e in section('waste')['entries']], [1, 10])

    def test_positions_merge_and_same_spot_last_wins(self):
        v = self.ver('setups')
        self.patch(self.a, 'setups', v, [{'o': 'set', 'p': ['posAssignments', 'foh||d||Lunch||Drinks 1'], 'v': 'Avah'}])
        self.patch(self.b, 'setups', v, [{'o': 'set', 'p': ['posAssignments', 'foh||2026-09-22||Lunch||iPOS 1'], 'v': 'Leo'}])
        self.assertEqual(section('setups')['posAssignments'],
                         {'foh||2026-09-22||Lunch||iPOS 1': 'Leo', 'foh||d||Lunch||Drinks 1': 'Avah'})

    def test_sync_sends_only_what_changed(self):
        have = dict(self.loaded['versions'])
        quiet = self.b.post('/api/state/sync', json={'versions': have}).get_json()
        self.assertEqual(quiet['sections'], {})
        self.patch(self.a, 'setups', have['setups'], [{'o': 'del', 'p': ['posAssignments', 'foh||2026-09-22||Lunch||iPOS 1']}])
        news = self.b.post('/api/state/sync', json={'versions': have}).get_json()
        self.assertEqual(list(news['sections']), ['setups'])
        self.assertEqual(json.loads(news['sections']['setups'])['posAssignments'], {})
        self.assertEqual(self.b.post('/api/state/sync', json={'versions': 'x'}).status_code, 400)

    def test_old_page_saves_show_up_in_sync(self):
        have = dict(self.loaded['versions'])
        self.b.post('/api/state/save', json={'sections': {'waste': json.dumps({'entries': [{'ts': 99}]})}})
        news = self.a.post('/api/state/sync', json={'versions': have}).get_json()
        self.assertEqual(list(news['sections']), ['waste'])

    def test_changes_outside_the_app_show_up_on_load(self):
        store['state/cem'] = json.dumps({'cemEntries': [{'month': '2026-08'}]})
        again = self.b.post('/api/state/load', json={}).get_json()
        self.assertEqual(json.loads(again['sections']['cem'])['cemEntries'], [{'month': '2026-08'}])
        self.assertNotEqual(again['versions']['cem'], self.ver('cem'))
        self.assertEqual(again['versions']['waste'], self.ver('waste'))    # unchanged: same version

    def test_manager_fields_need_a_session(self):
        r = self.patch(self.a, 'manager', self.ver('manager'), [
            {'o': 'set', 'p': ['products'], 'v': [{'id': 'hacked'}]},
            {'o': 'set', 'p': ['wasteTarget'], 'v': 5},
        ]).get_json()
        self.assertEqual(r['managerFieldsIgnored'], ['products', 'wasteTarget'])
        self.assertIn('manager', r['sections'])                 # so the page drops the change
        self.assertEqual(section('manager')['products'], [{'id': 'p1'}])
        with self.a.session_transaction() as sess:
            sess['manager'] = True
        self.patch(self.a, 'manager', r['versions']['manager'], [{'o': 'set', 'p': ['wasteTarget'], 'v': 80}])
        self.assertEqual(section('manager')['wasteTarget'], 80)

    def test_bad_patches_refused(self):
        v = self.ver('waste')
        self.assertEqual(self.patch(self.a, 'secure', v, []).status_code, 400)
        self.assertEqual(self.patch(self.a, 'waste', v, [{'o': 'set', 'p': ['products'], 'v': []}]).status_code, 400)
        self.assertEqual(self.patch(self.a, 'waste', v, [{'o': 'boom', 'p': ['entries']}]).status_code, 400)
        self.assertEqual(self.patch(self.a, 'waste', v, [{'o': 'set', 'p': [], 'v': 1}]).status_code, 400)
        self.assertEqual(self.patch(self.a, 'waste', v, [{'o': 'arr', 'p': ['entries'], 'add': [{'v': 1, 'n': -1, 'i': 0}]}]).status_code, 400)
        self.assertEqual(self.a.post('/api/state/patch', json={'patches': {}}).status_code, 400)
        self.assertEqual(section('waste')['entries'], LEGACY['entries'])

    def test_size_cap(self):
        big = [{'o': 'set', 'p': ['entries'], 'v': ['x' * (appmod.MAX_STATE_BYTES + 10)]}]
        self.assertEqual(self.patch(self.a, 'waste', self.ver('waste'), big).status_code, 413)

    def test_backup_for_managers_only(self):
        r = self.a.post('/api/state/backup')
        self.assertEqual(r.status_code, 403)
        with self.a.session_transaction() as sess:
            sess['manager'] = True
        body = self.a.post('/api/state/backup').get_json()
        self.assertTrue(body['exists'])
        self.assertEqual(set(body['data']), {'peaRatings'})          # only upload data, only what the backup has
        self.assertNotIn('products', body['data'])

    def test_replies_are_zipped_when_asked(self):
        store['state/history'] = json.dumps({'setupHistory': {'rows': ['Josh on iPOS 1'] * 400}})
        r = self.a.post('/api/state/load', json={}, headers={'Accept-Encoding': 'gzip'})
        self.assertEqual(r.headers.get('Content-Encoding'), 'gzip')
        import gzip
        body = json.loads(gzip.decompress(r.get_data()))
        self.assertEqual(len(json.loads(body['sections']['history'])['setupHistory']['rows']), 400)
        self.assertLess(len(r.get_data()), 2000)


class SafeCountTest(unittest.TestCase):
    """TIM-48: safe counts are private, team devices can only add to them,
    and the stored list moves out of 'ops' on its own."""

    COUNT = {'id': 's1', 'timestamp': 1, 'total': 4500}

    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._cache.clear()
        appmod._cache_ready = False
        store.clear()
        # Saved the old way: safe counts inside 'ops'.
        store['state/ops'] = json.dumps({'zoneChecklistState': {}, 'safeCounts': [self.COUNT]})
        self.team = appmod.app.test_client()
        self.mgr = appmod.app.test_client()
        with self.mgr.session_transaction() as sess:
            sess['manager'] = True

    def patch(self, client, patches):
        return client.post('/api/state/patch', json={'patches': patches}).get_json()

    def test_moved_out_of_ops_on_first_read(self):
        reply = self.mgr.post('/api/state/load', json={}).get_json()
        self.assertEqual(json.loads(reply['sections']['safe'])['safeCounts'], [self.COUNT])
        self.assertNotIn('safeCounts', section('ops'))
        self.assertEqual(section('safe')['safeCounts'], [self.COUNT])

    def test_only_managers_receive_them(self):
        reply = self.team.post('/api/state/load', json={}).get_json()
        self.assertNotIn('safe', reply['sections'])
        self.assertNotIn('4500', json.dumps(reply))
        sync = self.team.post('/api/state/sync', json={'versions': {}}).get_json()
        self.assertNotIn('safe', sync['sections'])

    def test_team_device_adds_but_cannot_change_or_remove(self):
        self.team.post('/api/state/load', json={})
        new = {'id': 's2', 'timestamp': 2, 'total': 4490}
        r = self.patch(self.team, {'safe': {'ver': '?', 'ops': [{'o': 'arr', 'p': ['safeCounts'], 'add': [{'v': new, 'n': 1, 'i': 0, 'end': True}]}]}})
        self.assertTrue(r['success'])
        self.assertNotIn('safe', r['sections'])
        self.assertEqual(section('safe')['safeCounts'], [self.COUNT, new])
        # Wiping, removing or editing from a team device does nothing.
        for ops in ([{'o': 'set', 'p': ['safeCounts'], 'v': []}],
                    [{'o': 'arr', 'p': ['safeCounts'], 'rm': [{'v': self.COUNT, 'n': 0}]}],
                    [{'o': 'del', 'p': ['safeCounts']}],
                    [{'o': 'set', 'p': ['safeCounts', 'x'], 'v': 1}]):
            self.patch(self.team, {'safe': {'ver': '?', 'ops': ops}})
            self.assertEqual(section('safe')['safeCounts'], [self.COUNT, new], ops)

    def test_team_device_cannot_replace_a_count(self):
        """An edit of a record (an add marked rep) only replaces it for
        managers; from a team device it can't overwrite a saved count."""
        self.team.post('/api/state/load', json={})
        edited = dict(self.COUNT, total=1)
        self.patch(self.team, {'safe': {'ver': '?', 'ops': [{'o': 'arr', 'p': ['safeCounts'], 'rm': [{'v': self.COUNT, 'n': 0}],
                                                                'add': [{'v': edited, 'n': 1, 'i': 0, 'end': True, 'rep': True}]}]}})
        self.assertIn(self.COUNT, section('safe')['safeCounts'])

    def test_manager_can_still_remove(self):
        self.mgr.post('/api/state/load', json={})
        self.patch(self.mgr, {'safe': {'ver': '?', 'ops': [{'o': 'set', 'p': ['safeCounts'], 'v': []}]}})
        self.assertEqual(section('safe')['safeCounts'], [])

    def test_older_page_saving_under_ops(self):
        """A page from before the move: its safe counts go to 'safe', as
        additions only, and its other 'ops' changes still save."""
        self.team.post('/api/state/load', json={})
        new = {'id': 's3', 'timestamp': 3, 'total': 4510}
        r = self.patch(self.team, {'ops': {'ver': '?', 'ops': [
            {'o': 'set', 'p': ['safeCounts'], 'v': [new]},            # its copy lacked the old ones
            {'o': 'set', 'p': ['fohOECheckedDate'], 'v': '2026-10-02'}]}})
        self.assertTrue(r['success'])
        self.assertEqual(section('safe')['safeCounts'], [self.COUNT, new])
        self.assertEqual(section('ops')['fohOECheckedDate'], '2026-10-02')
        self.assertNotIn('safeCounts', section('ops'))

    def test_today_only_for_team_devices(self):
        import datetime
        today = datetime.date.today().isoformat()
        old_day = (datetime.date.today() - datetime.timedelta(days=5)).isoformat()
        store['state/ops'] = json.dumps({'safeCounts': [
            {'id': 'a', 'date': today, 'timestamp': 5, 'total': 4500},
            {'id': 'b', 'date': old_day, 'timestamp': 1, 'total': 4400}]})
        appmod._cache.clear()
        appmod._cache_ready = False
        r = self.team.get(f'/api/safe-counts/today?date={today}')
        self.assertEqual(r.status_code, 200)
        self.assertEqual([c['id'] for c in r.get_json()['counts']], ['a'])
        self.assertEqual(self.team.get(f'/api/safe-counts/today?date={old_day}').status_code, 403)
        self.assertEqual(self.team.get('/api/safe-counts/today?date=nope').status_code, 400)

    def test_no_cross_site_access_by_default(self):
        r = self.team.post('/api/state/load', json={}, headers={'Origin': 'https://example.com'})
        self.assertNotIn('Access-Control-Allow-Origin', r.headers)


if __name__ == '__main__':
    unittest.main()
