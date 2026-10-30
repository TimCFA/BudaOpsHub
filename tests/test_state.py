"""Sectioned saved state: the split, migration, per-section saves and gates.

Run: python3 -m unittest discover tests
Firebase is replaced with an in-memory store that supports child paths.
"""
import json
import os
import re
import sys
import threading
import time
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')
sys.path.insert(0, ROOT)
import app as appmod  # noqa: E402

store = {}



def as_lead(c):
    """Set Ups is a Team Lead's to change (app.py LEAD_ONLY_KEYS); these
    phones are leads'."""
    with c.session_transaction() as sess:
        sess['user'] = {'name': 'Casey Lead', 'role': 'lead'}
    return c


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


def wait_for_refresh():
    """A background re-read (state_load) has finished."""
    deadline = time.time() + 5
    while appmod._refresh_running and time.time() < deadline:
        time.sleep(0.01)


class StateTest(unittest.TestCase):
    def setUp(self):
        # Each test file has its own stand-in database.
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._cache.clear()
        appmod._cache_ready = False
        store.clear()
        store['appState'] = json.dumps(LEGACY)
        self.c = as_lead(appmod.app.test_client())

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
        self.assertEqual(section('waste')['entries'], LEGACY['entries'])
        self.assertEqual(data['waste']['entries'], [])     # a team device gets recent entries only
        self.assertEqual(data['setups']['posAssignments'], LEGACY['posAssignments'])
        self.assertEqual(data['misc'], {'someFutureKey': 42})
        self.assertIn('appState', store)                     # backup kept
        self.assertEqual(section('manager')['products'], [{'id': 'p1'}])
        # Second load reads the sections, doesn't migrate again.
        store['appState'] = json.dumps({'entries': []})
        self.load()
        self.assertEqual(section('waste')['entries'], LEGACY['entries'])

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
        self.a = as_lead(appmod.app.test_client())      # two phones
        self.b = as_lead(appmod.app.test_client())
        self.loaded = self.a.post('/api/state/load', json={}).get_json()

    def ver(self, name, reply=None):
        return (reply or self.loaded)['versions'][name]

    def patch(self, client, name, ver, ops, **kw):
        return client.post('/api/state/patch', json={'patches': {name: {'ver': ver, 'ops': ops}}}, **kw)

    def test_load_gives_versions_and_build(self):
        # Without a manager session, the private sections aren't sent.
        self.assertEqual(set(self.loaded['versions']), set(appmod.STATE_SECTIONS) - set(appmod.PRIVATE_SECTIONS))
        self.assertTrue(self.loaded['build'])
        # The server's time, for timers that every tablet counts the same way.
        self.assertLess(abs(self.loaded['now'] - time.time() * 1000), 5000)

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
        import time as _t
        now = int(_t.time() * 1000)
        v = self.ver('waste')
        add = lambda ts, i: [{'o': 'arr', 'p': ['entries'], 'add': [{'v': {'ts': ts}, 'n': 1, 'i': i, 'end': True}]}]
        r1 = self.patch(self.a, 'waste', v, add(now + 10, 1)).get_json()
        self.assertNotIn('waste', r1['sections'])             # phone A was up to date: nothing to send back
        r2 = self.patch(self.b, 'waste', v, add(now + 11, 1)).get_json()
        self.assertEqual([e['ts'] for e in section('waste')['entries']], [1, now + 10, now + 11])
        # Phone B's copy was behind, so it gets the merged section back (recent
        # entries only: the old ts=1 one stays on the server for managers).
        self.assertEqual([e['ts'] for e in json.loads(r2['sections']['waste'])['entries']], [now + 10, now + 11])
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

    def test_team_devices_get_two_days_of_waste_and_managers_the_whole_log(self):
        now = int(time.time() * 1000)
        old, recent = {'ts': now - 3 * 86400000, 'name': 'Old'}, {'ts': now - 3600000, 'name': 'Recent'}
        store['state/waste'] = json.dumps({'entries': [old, recent], 'wasteDays': []})
        appmod._cache.clear()
        team = self.b.post('/api/state/load', json={}).get_json()
        self.assertEqual(json.loads(team['sections']['waste'])['entries'], [recent])
        # The same device signs in: the version it holds hasn't moved, so a
        # plain check brings nothing. Forgetting the version (stateForget,
        # which launchSetManager calls) brings the whole log.
        with self.b.session_transaction() as sess:
            sess['manager'] = True
        quiet = self.b.post('/api/state/sync', json={'versions': team['versions']}).get_json()
        self.assertNotIn('waste', quiet['sections'])
        have = dict(team['versions'], waste='?')
        whole = self.b.post('/api/state/sync', json={'versions': have}).get_json()
        self.assertEqual(json.loads(whole['sections']['waste'])['entries'], [old, recent])
        self.assertEqual(whole['versions']['waste'], team['versions']['waste'])

    def test_signing_in_refetches_the_whole_waste_log(self):
        with open(os.path.join(ROOT, 'static', 'js', 'storage.js'), encoding='utf-8') as f:
            storage = f.read()
        with open(os.path.join(ROOT, 'static', 'js', 'launch-mode.js'), encoding='utf-8') as f:
            launch = f.read()
        self.assertIn("function stateForget(names)", storage)
        forget = launch.index("stateForget(['waste'])")
        self.assertLess(launch.index('async function launchSetManager'), forget)
        self.assertLess(forget, launch.index('await syncState()'))

    def test_sync_only_checks_the_sections_asked_for(self):
        # Set Ups' Refresh: just the set up and roster, nothing else.
        have = dict(self.loaded['versions'])
        self.b.post('/api/state/save', json={'sections': {'waste': json.dumps({'entries': [{'ts': 99}]})}})
        only = {'versions': have, 'only': ['setups', 'rosters']}
        quiet = self.a.post('/api/state/sync', json=only).get_json()
        self.assertEqual(quiet['sections'], {})                       # waste changed, but wasn't asked for
        self.patch(self.b, 'setups', have['setups'], [{'o': 'set', 'p': ['posAssignments', 'foh||d||Lunch||Runner'], 'v': 'Ava'}])
        news = self.a.post('/api/state/sync', json=only).get_json()
        self.assertEqual(list(news['sections']), ['setups'])
        self.assertEqual(json.loads(news['sections']['setups'])['posAssignments']['foh||d||Lunch||Runner'], 'Ava')
        self.assertEqual(self.a.post('/api/state/sync', json={'versions': have, 'only': 'setups'}).status_code, 400)
        self.assertEqual(self.a.post('/api/state/sync', json={'versions': have, 'only': [1]}).status_code, 400)

    def test_old_page_saves_show_up_in_sync(self):
        have = dict(self.loaded['versions'])
        self.b.post('/api/state/save', json={'sections': {'waste': json.dumps({'entries': [{'ts': 99}]})}})
        news = self.a.post('/api/state/sync', json={'versions': have}).get_json()
        self.assertEqual(list(news['sections']), ['waste'])

    def test_changes_outside_the_app_show_up_after_a_re_read(self):
        # Page loads come from memory; a re-read (in the background once due)
        # brings a change made outside the app, and only that section moves.
        store['state/cem'] = json.dumps({'cemEntries': [{'month': '2026-08'}]})
        self.assertNotIn('cemEntries', json.loads(self.b.post('/api/state/load', json={}).get_json()['sections']['cem']))
        appmod._cache_read_at -= appmod.CACHE_REFRESH_SECONDS
        self.b.post('/api/state/load', json={})
        wait_for_refresh()
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

    def test_retired_key_removal_does_not_refuse_the_save(self):
        # A setting no section lists any more is still stored (truckDays,
        # Oct 2026). A page's first save of that section removes it; that used
        # to refuse the whole save, set ups and all, on every device.
        m = section('manager'); m['truckDays'] = [2, 4]
        store['state/manager'] = json.dumps(m)
        appmod._cache.clear()
        loaded = self.b.post('/api/state/load', json={}).get_json()
        key = 'foh||2026-10-12||Lunch (10:30-1:00)||OMD 1'
        r = self.b.post('/api/state/patch', json={'patches': {
            'manager': {'ver': loaded['versions']['manager'], 'ops': [{'o': 'del', 'p': ['truckDays']}, {'o': 'set', 'p': ['productFixesVersion'], 'v': 7}]},
            'setups': {'ver': loaded['versions']['setups'], 'ops': [{'o': 'set', 'p': ['posAssignments', key], 'v': 'Ethan'}]}}})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(section('setups')['posAssignments'][key], 'Ethan')
        self.assertNotIn('truckDays', section('manager'))
        # Still refused: a known key filed under the wrong section (a bug in
        # the page). A retired key being set (a page on old code) is dropped
        # and the rest of the save goes through.
        v = self.ver('waste', self.b.post('/api/state/load', json={}).get_json())
        self.assertEqual(self.patch(self.b, 'waste', v, [{'o': 'del', 'p': ['products']}]).status_code, 400)
        r = self.patch(self.b, 'waste', v, [{'o': 'set', 'p': ['truckDays'], 'v': [1]}, {'o': 'set', 'p': ['wasteDays'], 'v': ['2026-10-12']}])
        self.assertEqual(r.status_code, 200)
        self.assertNotIn('truckDays', section('waste'))
        self.assertEqual(section('waste')['wasteDays'], ['2026-10-12'])

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
        appmod._cache.clear()      # as after a restart: read from the store
        r = self.a.post('/api/state/load', json={}, headers={'Accept-Encoding': 'gzip'})
        self.assertEqual(r.headers.get('Content-Encoding'), 'gzip')
        import gzip
        body = json.loads(gzip.decompress(r.get_data()))
        self.assertEqual(len(json.loads(body['sections']['history'])['setupHistory']['rows']), 400)
        self.assertLess(len(r.get_data()), 2000)


class EtagRef(FakeRef):
    """The fake with Firebase's conditional write (ETags)."""
    @staticmethod
    def tag(value):
        return str(hash(json.dumps(value, sort_keys=True)))

    def get(self, etag=False):
        value = super().get()
        return (value, self.tag(value)) if etag else value

    def set_if_unchanged(self, expected, value):
        current = store.get(self.path)
        if self.tag(current) != expected:
            return False, current, self.tag(current)
        store[self.path] = value
        return True, value, self.tag(value)


class DeployOverlapTest(unittest.TestCase):
    """During a deploy the old and the new server both run for a moment. A
    save on one must never write over a save the other took (shift
    simulator, Oct 25 2026: the new server wrote its older copy of Set Ups
    over the old one's saves)."""

    K = 'foh||2026-10-26||Lunch (10:30-1:00)||'

    def setUp(self):
        appmod.db.reference = lambda path: EtagRef(path)
        appmod._cache.clear()
        appmod._etags.clear()
        appmod._cache_ready = False
        store.clear()
        store['appState'] = json.dumps(LEGACY)
        self.phone = as_lead(appmod.app.test_client())
        self.loaded = self.phone.post('/api/state/load', json={}).get_json()

    def other_server_saves(self, key, name):
        data = section('setups')
        data['posAssignments'][self.K + key] = name
        store['state/setups'] = json.dumps(data)

    def save(self, key, name):
        return self.phone.post('/api/state/patch', json={'patches': {'setups': {'ver': self.loaded['versions']['setups'],
            'ops': [{'o': 'set', 'p': ['posAssignments', self.K + key], 'v': name}]}}}).get_json()

    def test_first_save_after_a_start_keeps_the_other_servers_saves(self):
        self.other_server_saves('iPOS 1', 'Avery Test')      # after this server read the data
        self.save('Drinks 1', 'Blake Test')
        pa = section('setups')['posAssignments']
        self.assertEqual([pa.get(self.K + 'iPOS 1'), pa.get(self.K + 'Drinks 1')], ['Avery Test', 'Blake Test'])

    def test_a_later_save_keeps_them_too_and_the_phone_hears_of_them(self):
        self.save('Drinks 1', 'Blake Test')
        self.other_server_saves('Host 1', 'Casey Test')
        reply = self.save('Drinks 2', 'Devon Test')
        pa = section('setups')['posAssignments']
        self.assertEqual([pa.get(self.K + k) for k in ('Drinks 1', 'Host 1', 'Drinks 2')], ['Blake Test', 'Casey Test', 'Devon Test'])
        # The phone gets the section back, so it shows the other server's save.
        self.assertIn('setups', reply['sections'])
        self.assertEqual(json.loads(reply['sections']['setups'])['posAssignments'].get(self.K + 'Host 1'), 'Casey Test')
        # And this server's memory has it for the next phone that asks.
        self.assertEqual(appmod._cache['setups']['data']['posAssignments'].get(self.K + 'Host 1'), 'Casey Test')


class LeadCaptainTest(unittest.TestCase):
    """Only Team Leads and directors choose the Lead Captain (Tim, Oct 25
    2026). Anyone else's save goes through without it."""

    K = 'foh||2026-10-26||Lunch (10:30-1:00)||'

    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._cache.clear()
        appmod._cache_ready = False
        store.clear()
        store['appState'] = json.dumps(dict(LEGACY, posAssignments={self.K + 'Lead Captain': 'Avery Lead', self.K + 'iPOS 1': 'Blake Test'}))
        appmod.app.test_client().post('/api/state/load', json={})

    def client(self, role=None, manager=False):
        c = appmod.app.test_client()
        with c.session_transaction() as sess:
            if manager:
                sess['manager'] = True
            if role:
                sess['user'] = {'name': 'Someone Test', 'role': role, 'via': 'pin', 'email': ''}
        return c

    def save(self, c, ops):
        ver = appmod._cache['setups']['ver']
        return c.post('/api/state/patch', json={'patches': {'setups': {'ver': ver, 'ops': ops}}}).get_json()

    def pa(self):
        return section('setups')['posAssignments']

    def test_signed_out_member_and_trainer_cant_change_it(self):
        # Set Ups is a Team Lead's (Tim, Oct 25 2026): not the Lead Captain,
        # not any spot, sign-in switch or not.
        before = dict(self.pa())
        for who in (self.client(), self.client('member'), self.client('trainer')):
            reply = self.save(who, [{'o': 'set', 'p': ['posAssignments', self.K + 'Lead Captain'], 'v': 'Casey Member'},
                                    {'o': 'set', 'p': ['posAssignments', self.K + 'Drinks 1'], 'v': 'Devon Test'}])
            self.assertTrue(reply['success'])                                       # not refused: an old page settles
            self.assertEqual(self.pa(), before)                                     # nothing changed
            self.assertIn('setups', reply['sections'])                              # the page gets Set Ups back
            self.save(who, [{'o': 'del', 'p': ['posAssignments', self.K + 'Lead Captain']}])
            self.assertEqual(self.pa(), before)

    def test_a_whole_list_save_keeps_the_saved_list(self):
        before = dict(self.pa())
        whole = {self.K + 'iPOS 1': 'Blake Test', self.K + 'Host 1': 'Emery Test', self.K + 'Lead Captain': 'Casey Member'}
        self.save(self.client('member'), [{'o': 'set', 'p': ['posAssignments'], 'v': whole}])
        self.assertEqual(self.pa(), before)

    def test_breaks_are_not_a_leads_only(self):
        self.save(self.client('member'), [{'o': 'set', 'p': ['completedBreaks', 'foh||2026-10-26||Blake Test'], 'v': True}])
        self.assertTrue(section('setups')['completedBreaks']['foh||2026-10-26||Blake Test'])

    def test_a_team_lead_and_a_director_can(self):
        self.save(self.client('lead'), [{'o': 'set', 'p': ['posAssignments', self.K + 'Lead Captain'], 'v': 'Finley Lead'}])
        self.assertEqual(self.pa()[self.K + 'Lead Captain'], 'Finley Lead')
        self.save(self.client('director', manager=True), [{'o': 'del', 'p': ['posAssignments', self.K + 'Lead Captain']}])
        self.assertNotIn(self.K + 'Lead Captain', self.pa())


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
        # A leader signed in on a team device (Tim, Oct 21 2026: a device nobody signed in on gets nothing).
        self.assertEqual(self.team.get(f'/api/safe-counts/today?date={today}').status_code, 403)
        with self.team.session_transaction() as sess:
            sess['user'] = {'name': 'Casey Example', 'role': 'lead'}
            sess['teamEnds'] = int(time.time()) + 3600
        r = self.team.get(f'/api/safe-counts/today?date={today}')
        self.assertEqual(r.status_code, 200)
        self.assertEqual([c['id'] for c in r.get_json()['counts']], ['a'])
        self.assertEqual(self.team.get(f'/api/safe-counts/today?date={old_day}').status_code, 403)
        self.assertEqual(self.team.get('/api/safe-counts/today?date=nope').status_code, 400)

    def test_a_team_lead_sees_the_last_week(self):
        """Tim, Oct 20 2026: leaders see recent submissions (a week), not the
        ordering; team members and trainers still see today's only."""
        import datetime
        day = lambda n: (datetime.date.today() - datetime.timedelta(days=n)).isoformat()
        store['state/ops'] = json.dumps({'safeCounts': [
            {'id': 'today', 'date': day(0), 'timestamp': 9, 'total': 4500},
            {'id': 'six', 'date': day(6), 'timestamp': 5, 'total': 4480},
            {'id': 'eight', 'date': day(8), 'timestamp': 1, 'total': 4400}]})
        appmod._cache.clear()
        appmod._cache_ready = False
        lead = appmod.app.test_client()
        with lead.session_transaction() as sess:
            sess['user'] = {'name': 'Casey Example', 'role': 'lead'}
            sess['teamEnds'] = int(time.time()) + 3600
        member = appmod.app.test_client()
        with member.session_transaction() as sess:
            sess['user'] = {'name': 'Jordan Testcase', 'role': 'member'}
            sess['teamEnds'] = int(time.time()) + 3600
        r = lead.get('/api/safe-counts/recent')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers['Cache-Control'], 'no-store')
        self.assertEqual(([c['id'] for c in r.get_json()['counts']], r.get_json()['days']), (['today', 'six'], 7))
        self.assertEqual([c['id'] for c in self.mgr.get('/api/safe-counts/recent').get_json()['counts']], ['today', 'six'])
        self.assertEqual(member.get('/api/safe-counts/recent').status_code, 403)
        self.assertEqual(self.team.get('/api/safe-counts/recent').status_code, 403)
        # Team Members and Trainers don't see the Safe Count at all, not even today's,
        # nor does a device nobody signed in on (Tim, Oct 21 2026).
        self.assertEqual(member.get(f'/api/safe-counts/today?date={day(0)}').status_code, 403)
        self.assertEqual(lead.get(f'/api/safe-counts/today?date={day(0)}').status_code, 200)
        self.assertEqual(self.team.get(f'/api/safe-counts/today?date={day(0)}').status_code, 403)
        # Still never the whole private section for a lead.
        body = lead.post('/api/state/load', json={}).get_json()
        self.assertNotIn('safe', body.get('sections', {}))

    def test_the_change_order_on_its_way(self):
        """Tim, Oct 23 2026: what change fund was ordered and when it's
        expected. Directors place it (the private safeOrders section); a Team
        Lead sees the latest with the counts and can mark it arrived; nobody
        else sees it or marks it."""
        orders = [{'id': 'co-1', 'placedAt': '2026-10-14T15:00:00Z', 'by': 'Avery Example', 'lines': {'5': 400}, 'total': 400, 'expected': '2026-10-16', 'status': 'received'},
                  {'id': 'co-2', 'placedAt': '2026-10-21T15:00:00Z', 'by': 'Avery Example', 'lines': {'5': 800, 'Quarters': 100}, 'total': 900,
                   'expected': '2026-10-23', 'note': 'With the morning drop', 'status': 'ordered'}]
        store['state/safeOrders'] = json.dumps({'safeOrders': orders})
        appmod._cache.clear()
        appmod._cache_ready = False
        lead = appmod.app.test_client()
        with lead.session_transaction() as sess:
            sess['user'] = {'name': 'Casey Example', 'role': 'lead'}
            sess['teamEnds'] = int(time.time()) + 3600
        member = appmod.app.test_client()
        with member.session_transaction() as sess:
            sess['user'] = {'name': 'Jordan Testcase', 'role': 'member'}
            sess['teamEnds'] = int(time.time()) + 3600
        latest = lead.get('/api/safe-counts/recent').get_json()['order']
        self.assertEqual((latest['id'], latest['total'], latest['expected'], latest['note'], latest['status']), ('co-2', 900, '2026-10-23', 'With the morning drop', 'ordered'))
        # Private: not in a lead's or a team device's sections.
        self.assertNotIn('safeOrders', lead.post('/api/state/load', json={}).get_json().get('sections', {}))
        self.assertNotIn('safeOrders', self.team.post('/api/state/sync', json={'versions': {}}).get_json()['sections'])
        self.assertIn('safeOrders', appmod.MANAGER_ONLY_KEYS)
        # Marking it arrived: Team Leads and directors only.
        for who in (member, self.team):
            self.assertEqual(who.post('/api/safe-orders/received', json={'id': 'co-2'}).status_code, 403)
        self.assertEqual(lead.post('/api/safe-orders/received', json={'id': 'nope'}).status_code, 404)
        r = lead.post('/api/safe-orders/received', json={'id': 'co-2'}).get_json()
        self.assertEqual((r['order']['status'], r['order']['receivedBy']), ('received', 'Casey Example'))
        saved = section('safeOrders')['safeOrders']
        self.assertEqual([o['status'] for o in saved], ['received', 'received'])
        self.assertEqual(saved[1]['total'], 900)                     # the rest of the order kept
        first = saved[1]['receivedAt']
        lead.post('/api/safe-orders/received', json={'id': 'co-2'})  # a second tap changes nothing
        self.assertEqual(section('safeOrders')['safeOrders'][1]['receivedAt'], first)

    def test_the_change_order_came_different(self):
        """Tim, Oct 30 2026: a Team Lead marks it arrived, and when it isn't
        what was ordered, puts in what came (per bill and coin) and a note."""
        orders = [{'id': 'co-3', 'placedAt': '2026-10-28T15:00:00Z', 'by': 'Avery Example', 'lines': {'5': 800, 'Quarters': 100}, 'total': 900,
                   'expected': '2026-10-30', 'status': 'ordered'}]
        store['state/safeOrders'] = json.dumps({'safeOrders': orders})
        appmod._cache.clear()
        appmod._cache_ready = False
        lead = appmod.app.test_client()
        with lead.session_transaction() as sess:
            sess['user'] = {'name': 'Casey Example', 'role': 'lead'}
            sess['teamEnds'] = int(time.time()) + 3600
        for bad in ({'Pennies': 5}, {'5': 'lots'}, {'5': -1}, {'5': 10 ** 6}, ['5']):
            self.assertEqual(lead.post('/api/safe-orders/received', json={'id': 'co-3', 'lines': bad}).status_code, 400, bad)
        self.assertEqual(section('safeOrders')['safeOrders'][0]['status'], 'ordered')          # a refused one changes nothing
        r = lead.post('/api/safe-orders/received', json={'id': 'co-3', 'lines': {'5': 800, 'Quarters': 60, '1': ''}, 'note': 'Bank was short on quarters'}).get_json()
        self.assertEqual((r['order']['receivedLines'], r['order']['receivedTotal'], r['order']['receivedNote']), ({'5': 800.0, 'Quarters': 60.0}, 860.0, 'Bank was short on quarters'))
        saved = section('safeOrders')['safeOrders'][0]
        self.assertEqual((saved['status'], saved['total'], saved['lines']), ('received', 900, {'5': 800, 'Quarters': 100}))   # the order as placed is kept
        latest = lead.get('/api/safe-counts/recent').get_json()['order']
        self.assertEqual((latest['receivedTotal'], latest['receivedNote']), (860.0, 'Bank was short on quarters'))

    def test_no_cross_site_access_by_default(self):
        r = self.team.post('/api/state/load', json={}, headers={'Origin': 'https://example.com'})
        self.assertNotIn('Access-Control-Allow-Origin', r.headers)



class LoadFromMemoryTest(unittest.TestCase):
    """Page loads are answered from memory (Oct 18 2026 data audit): Firebase
    is read when cold, now and then in the background, and fresh for the
    backup, never while holding the lock that saves and syncs wait on."""

    def setUp(self):
        self.gets = []
        test = self

        class CountingRef(FakeRef):
            def get(self):
                if self.path == appmod.STATE_ROOT:
                    test.gets.append(self.path)
                    time.sleep(getattr(test, 'read_seconds', 0))
                    hook = getattr(test, 'on_read', None)
                    if hook:
                        test.on_read = None
                        hook()
                return FakeRef.get(self)
        appmod.db.reference = lambda path: CountingRef(path)
        appmod._cache.clear()
        appmod._cache_ready = False
        store.clear()
        store['appState'] = json.dumps(LEGACY)
        self.c = as_lead(appmod.app.test_client())
        self.first = self.c.post('/api/state/load', json={}).get_json()
        self.gets.clear()

    def load(self):
        return self.c.post('/api/state/load', json={}).get_json()

    def test_loads_read_firebase_only_when_due(self):
        for _ in range(5):
            self.assertEqual(self.load()['versions'], self.first['versions'])
        self.assertEqual(self.gets, [])
        appmod._cache_read_at -= appmod.CACHE_REFRESH_SECONDS
        self.load()
        wait_for_refresh()
        self.assertEqual(len(self.gets), 1)
        self.load()
        wait_for_refresh()
        self.assertEqual(len(self.gets), 1)          # read just now: not due again
        # Phones checking in (sync) start a due re-read too.
        appmod._cache_read_at -= appmod.CACHE_REFRESH_SECONDS
        self.c.post('/api/state/sync', json={'versions': self.first['versions']})
        wait_for_refresh()
        self.assertEqual(len(self.gets), 2)

    def test_phones_arriving_at_a_cold_start_read_once(self):
        self.read_seconds = 0.3      # a slow read, so they all arrive during it
        appmod._cache.clear()
        appmod._cache_ready = False
        clients = [as_lead(appmod.app.test_client()) for _ in range(6)]
        threads = [threading.Thread(target=lambda c=c: c.post('/api/state/sync', json={'versions': {}}), daemon=True) for c in clients]
        for t in threads:
            t.start()
        for t in threads:
            t.join(5)
        self.assertEqual(len(self.gets), 1)

    def test_follow_up_reads_after_a_start(self):
        booted, done = appmod._booted_at, appmod._boot_refreshes_done
        try:
            appmod._boot_refreshes_done = 0
            appmod._booted_at = time.monotonic() - appmod.BOOT_REFRESH_SECONDS[0] - 1
            self.load()
            wait_for_refresh()
            self.assertEqual(len(self.gets), 1)
            self.assertEqual(appmod._boot_refreshes_done, 1)
            self.load()
            wait_for_refresh()
            self.assertEqual(len(self.gets), 1)      # the next one is minutes later
        finally:
            appmod._booted_at, appmod._boot_refreshes_done = booted, done

    def test_read_happens_outside_the_lock(self):
        got = []
        def other_thread_can_save():
            t = threading.Thread(target=lambda: got.append(appmod._state_lock.acquire(timeout=1) and (appmod._state_lock.release() or True)), daemon=True)
            t.start()
            t.join()
        self.on_read = other_thread_can_save
        self.assertTrue(appmod._refresh_cache())
        self.assertEqual(got, [True])

    def test_a_save_during_the_read_is_kept(self):
        v = self.first['versions']['setups']
        def save_meanwhile():
            # The read already has the old setups; a save lands before it's applied.
            snapshot = dict(store)
            t = threading.Thread(target=lambda: self.c.post('/api/state/patch', json={'patches': {'setups': {'ver': v, 'ops': [{'o': 'set', 'p': ['posAssignments', 'foh||d||Lunch||Runner'], 'v': 'Ava'}]}}}), daemon=True)
            t.start()
            t.join(2)
            self.assertFalse(t.is_alive(), 'the save waited on the read')
            store.clear()
            store.update(snapshot)                    # what the read sees: from before the save
        self.on_read = save_meanwhile
        appmod._refresh_cache()
        reply = self.c.post('/api/state/sync', json={'versions': {}}).get_json()
        self.assertEqual(json.loads(reply['sections']['setups'])['posAssignments'].get('foh||d||Lunch||Runner'), 'Ava')

    def test_backup_reads_fresh(self):
        with self.c.session_transaction() as sess:
            sess['manager'] = True
        store['state/cem'] = json.dumps({'cemEntries': [{'month': '2026-09'}]})
        body = json.loads(self.c.post('/api/state/export').get_data())
        self.assertEqual(body['sections']['cem']['cemEntries'], [{'month': '2026-09'}])
        self.assertEqual(len(self.gets), 1)


if __name__ == '__main__':
    unittest.main()


class WasteHistoryTest(unittest.TestCase):
    """The waste log keeps 90 days for the dashboard, but a team device only
    receives recent entries; its saves still apply to the whole stored list."""

    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._cache.clear()
        appmod._cache_ready = False
        store.clear()
        import time as _t
        now = int(_t.time() * 1000)
        self.old = {'id': 'w1', 'ts': now - 10 * 86400000, 'prodId': 'filet', 'name': 'Filet', 'qty': 1, 'cost': 1.06, 'section': 'boh'}
        self.fresh = {'id': 'w2', 'ts': now - 3600000, 'prodId': 'nugget', 'name': 'Nugget', 'qty': 2, 'cost': 0.32, 'section': 'foh'}
        store['state/waste'] = json.dumps({'entries': [self.old, self.fresh], 'wasteDays': []})
        self.team = appmod.app.test_client()
        self.mgr = appmod.app.test_client()
        with self.mgr.session_transaction() as sess:
            sess['manager'] = True

    def ids(self, reply):
        return [e['id'] for e in json.loads(reply['sections']['waste'])['entries']]

    def test_team_device_gets_recent_entries_only(self):
        self.assertEqual(self.ids(self.team.post('/api/state/load', json={}).get_json()), ['w2'])
        self.assertEqual(self.ids(self.team.post('/api/state/sync', json={'versions': {}}).get_json()), ['w2'])

    def test_manager_gets_everything(self):
        self.assertEqual(self.ids(self.mgr.post('/api/state/load', json={}).get_json()), ['w1', 'w2'])

    def test_team_save_keeps_the_history(self):
        self.team.post('/api/state/load', json={})
        new = dict(self.fresh, id='w3', qty=1, cost=0.16)
        r = self.team.post('/api/state/patch', json={'patches': {'waste': {'ver': '?', 'ops': [{'o': 'arr', 'p': ['entries'], 'add': [{'v': new, 'n': 1, 'i': 1, 'end': True}]}]}}}).get_json()
        self.assertTrue(r['success'])
        self.assertEqual([e['id'] for e in section('waste')['entries']], ['w1', 'w2', 'w3'])
        # The section it gets back is trimmed too.
        self.assertEqual(self.ids(r), ['w2', 'w3'])


class ExportTest(unittest.TestCase):
    """The full backup (/api/state/export): managers only, every section
    read fresh from Firebase, never the PIN hash."""

    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._cache.clear()
        appmod._cache_ready = False
        store.clear()
        for name in appmod.STATE_SECTIONS:
            store[f'state/{name}'] = json.dumps({'_mark': name})
        store['state/setups'] = json.dumps({'posAssignments': {'foh||2026-10-06||Lunch||iPOS 1': 'Maya Torres'}})
        store['state/safe'] = json.dumps({'safeCounts': [{'date': '2026-10-06', 'total': 4500}]})
        store['secure/managerPinHash'] = 'pbkdf2:sha256:secret-hash'
        self.c = as_lead(appmod.app.test_client())

    def manager(self):
        with self.c.session_transaction() as sess:
            sess['manager'] = True

    def test_managers_only(self):
        self.assertEqual(self.c.post('/api/state/export').status_code, 403)

    def test_every_section_as_a_file(self):
        self.manager()
        r = self.c.post('/api/state/export')
        self.assertEqual(r.status_code, 200)
        self.assertRegex(r.headers['Content-Disposition'], r'attachment; filename="budaopshub-full-backup-\d{4}-\d{2}-\d{2}\.json"')
        self.assertEqual(r.headers['Cache-Control'], 'no-store')
        body = json.loads(r.get_data(as_text=True))
        self.assertEqual((body['app'], body['kind'], body['version']), ('BudaOpsHub', 'full-backup', 1))
        self.assertEqual(sorted(body['sections']), sorted(appmod.STATE_SECTIONS))
        self.assertEqual(body['sections']['setups']['posAssignments'], {'foh||2026-10-06||Lunch||iPOS 1': 'Maya Torres'})
        self.assertEqual(body['sections']['safe']['safeCounts'][0]['total'], 4500)     # private sections too
        self.assertNotIn('secret-hash', r.get_data(as_text=True))

    def test_reads_fresh_from_firebase(self):
        self.manager()
        self.c.post('/api/state/export')
        # Another device (or a change outside the app) saves meanwhile.
        store['state/setups'] = json.dumps({'posAssignments': {'foh||2026-10-06||Lunch||iPOS 1': 'Noah Bennett'}})
        body = json.loads(self.c.post('/api/state/export').get_data(as_text=True))
        self.assertEqual(body['sections']['setups']['posAssignments']['foh||2026-10-06||Lunch||iPOS 1'], 'Noah Bennett')

    def test_whole_waste_log_not_the_team_trim(self):
        self.manager()
        old = {'ts': 1000, 'name': 'Nuggets'}
        store['state/waste'] = json.dumps({'entries': [old]})
        body = json.loads(self.c.post('/api/state/export').get_data(as_text=True))
        self.assertEqual(body['sections']['waste']['entries'], [old])


class PositionListsGateTest(unittest.TestCase):
    """Set Ups' positions per daypart (positionLists; Tim, Oct 30 2026): only
    directors and the Admin Team (a manager session) change them; everyone
    reads them, since every phone draws Set Ups."""
    LIST = {'foh': {'Lunch (10:30-1:00)': ['iPOS 1 (Captain)', 'Drinks 1']}}

    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._cache.clear()
        appmod._cache_ready = False
        store.clear()
        for name in appmod.STATE_SECTIONS:
            store[f'state/{name}'] = json.dumps({})
        store['state/manager'] = json.dumps({'positionLists': self.LIST})
        self.c = as_lead(appmod.app.test_client())

    def patch(self, ops):
        ver = self.c.post('/api/state/load', json={}).get_json()['versions']['manager']
        return self.c.post('/api/state/patch', json={'patches': {'manager': {'ver': ver, 'ops': ops}}})

    def test_in_the_manager_section_and_manager_only(self):
        self.assertEqual(appmod.SECTION_OF_KEY['positionLists'], 'manager')
        self.assertIn('positionLists', appmod.MANAGER_ONLY_KEYS)
        self.assertNotIn('manager', appmod.PRIVATE_SECTIONS)      # a team phone reads it

    def test_a_team_lead_cannot_change_them(self):
        r = self.patch([{'o': 'set', 'p': ['positionLists'], 'v': {}}])
        self.assertIn('positionLists', r.get_json().get('managerFieldsIgnored', []))
        self.assertEqual(section('manager')['positionLists'], self.LIST)
        sent = json.loads(self.c.post('/api/state/load', json={}).get_json()['sections']['manager'])
        self.assertEqual(sent['positionLists'], self.LIST)

    def test_a_director_or_the_admin_team_can(self):
        new = {'foh': {'Lunch (10:30-1:00)': ['Drinks 1', 'iPOS 1 (Captain)', 'Curbside']}}
        with self.c.session_transaction() as sess:
            sess['manager'] = True
        r = self.patch([{'o': 'set', 'p': ['positionLists'], 'v': new}])
        self.assertEqual(r.status_code, 200)
        self.assertEqual(section('manager')['positionLists'], new)


class EventsGateTest(unittest.TestCase):
    """The events calendar (storeEvents) is manager-only, like the scoreboards."""

    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._cache.clear()
        appmod._cache_ready = False
        store.clear()
        for name in appmod.STATE_SECTIONS:
            store[f'state/{name}'] = json.dumps({})
        store['state/manager'] = json.dumps({'storeEvents': [{'id': 'a', 'title': 'Family Night'}]})
        self.c = as_lead(appmod.app.test_client())
        self.c.post('/api/state/load', json={})

    def save(self, sections):
        return self.c.post('/api/state/save', json={'sections': {k: json.dumps(v) for k, v in sections.items()}})

    def test_in_the_manager_section(self):
        self.assertEqual(appmod.SECTION_OF_KEY['storeEvents'], 'manager')
        self.assertIn('storeEvents', appmod.MANAGER_ONLY_KEYS)

    def test_team_device_cannot_change_it(self):
        r = self.save({'manager': {'storeEvents': [{'id': 'b', 'title': 'Hacked'}]}})
        self.assertIn('storeEvents', r.get_json().get('managerFieldsIgnored', []))
        self.assertEqual(section('manager')['storeEvents'], [{'id': 'a', 'title': 'Family Night'}])

    def test_manager_can_edit_and_delete(self):
        # The page saves through /api/state/patch: an edit or a delete is a
        # change to the list, and it sticks.
        with self.c.session_transaction() as sess:
            sess['manager'] = True
        ver = self.c.post('/api/state/load', json={}).get_json()['versions']['manager']
        r = self.c.post('/api/state/patch', json={'patches': {'manager': {'ver': ver, 'ops': [
            {'o': 'arr', 'p': ['storeEvents'], 'rm': [{'v': {'id': 'a', 'title': 'Family Night'}, 'n': 0}],
             'add': [{'v': {'id': 'b', 'title': 'Spirit Night'}, 'n': 1, 'i': 0, 'end': True}]}]}}})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(section('manager')['storeEvents'], [{'id': 'b', 'title': 'Spirit Night'}])

    def test_team_patch_is_refused(self):
        ver = self.c.post('/api/state/load', json={}).get_json()['versions']['manager']
        self.c.post('/api/state/patch', json={'patches': {'manager': {'ver': ver, 'ops': [
            {'o': 'set', 'p': ['storeEvents'], 'v': []}]}}})
        self.assertEqual(section('manager')['storeEvents'], [{'id': 'a', 'title': 'Family Night'}])
