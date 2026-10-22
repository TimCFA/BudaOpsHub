"""Manage → Health (Tim, Oct 19 2026): is the hub doing its job? The server
counts every save that landed, was refused (by status) or was a retry, and
takes one anonymous note per visit (load time, home-screen app, role, tabs).
Counts gather in memory and are added to the day's record in Firebase
(health/<date>, outside the saved state) every half hour and when the
worker stops. Managers read the week.

Run: python3 -m unittest discover tests
Firebase is a dict.
"""
import json
import os
import sys
import time
import unittest
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
store = {}


class FakeRef:
    def __init__(self, path):
        self.path = path.strip('/')

    def get(self):
        if self.path in store:
            return json.loads(json.dumps(store[self.path]))
        prefix = self.path + '/'
        kids = {k[len(prefix):]: v for k, v in store.items() if k.startswith(prefix)}
        return kids or None

    def set(self, value):
        store[self.path] = json.loads(json.dumps(value))

    def delete(self):
        store.pop(self.path, None)

    def order_by_key(self):
        return KeyRange(self.path)


class KeyRange:
    """Firebase's order_by_key().start_at().end_at(): one read of a range of
    children, counted in `reads`."""
    reads = []

    def __init__(self, path):
        self.path, self.lo, self.hi = path, None, None

    def start_at(self, v):
        self.lo = v
        return self

    def end_at(self, v):
        self.hi = v
        return self

    def get(self):
        KeyRange.reads.append(self.path)
        kids = FakeRef(self.path).get() or {}
        return {k: v for k, v in kids.items() if self.lo <= k <= self.hi} or None


appmod.app.config['SESSION_COOKIE_SECURE'] = False


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


class Base(unittest.TestCase):
    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._cache.clear()
        appmod._cache_ready = False
        store.clear()
        appmod._health_pending.clear()
        appmod._health_flushed_at = time.time()       # no flush during a test unless asked
        appmod._health_last_save = None
        self.day = appmod._health_today()
        self.c = appmod.app.test_client()

    def pending(self):
        return appmod._health_pending.get(self.day, {})


class Saves(Base):
    def save(self, attempt=None, ops=None):
        headers = {'X-Save-Attempt': str(attempt)} if attempt else {}
        return self.c.post('/api/state/patch', headers=headers, json={'patches': {'setups': {
            'ver': '?', 'ops': ops or [{'o': 'set', 'p': ['posAssignments', 'foh||2026-10-20||Lunch||Host 1'], 'v': 'Test Person'}]}}})

    def test_landed_refused_and_retried(self):
        self.assertEqual(self.save().status_code, 200)
        self.assertEqual(self.save(attempt=2).status_code, 200)
        r = self.c.post('/api/state/patch', json={'patches': {'nope': {'ver': '?', 'ops': []}}})
        self.assertEqual(r.status_code, 400)
        p = self.pending()
        self.assertEqual(p['saves'], 2)
        self.assertEqual(p['retried'], 1)
        self.assertEqual(p['refused'], {'400': 1})
        self.assertAlmostEqual(p['lastSaveAt'] / 1000, time.time(), delta=5)
        self.assertEqual(appmod._health_last_save, p['lastSaveAt'])

    def test_other_requests_are_not_saves(self):
        self.c.post('/api/state/load', json={})
        self.c.post('/api/state/sync', json={'versions': {}})
        self.assertEqual(self.pending(), {})


class Visits(Base):
    def test_a_visit_with_no_names(self):
        r = self.c.post('/api/health/visit', json={'visit': 1, 'ready': 1840.6, 'app': True, 'role': 'trainer', 'name': 'Someone Real',
                                                    'views': {'home': 1, 'positions': 3, 'Bad View!': 2, 'zonereset': 'x'}})
        self.assertEqual(r.status_code, 200)
        p = self.pending()
        self.assertEqual(p, {'visits': 1, 'app': 1, 'roles': {'trainer': 1}, 'ready': [1840], 'views': {'home': 1, 'positions': 3}})
        self.assertNotIn('Someone Real', json.dumps(appmod._health_pending))

    def test_bounds(self):
        self.c.post('/api/health/visit', json={'visit': 1, 'ready': 999999, 'role': 'owner', 'views': {'home': 9999}})
        self.c.post('/api/health/visit', data='not json', content_type='application/json')
        # A note sent by navigator.sendBeacon may come as text/plain.
        self.c.post('/api/health/visit', data=json.dumps({'views': {'calendar': 1}}), content_type='text/plain')
        p = self.pending()
        self.assertEqual(p['roles'], {'none': 1})
        self.assertNotIn('ready', p)
        self.assertEqual(p['views'], {'home': 50, 'calendar': 1})
        self.assertEqual(p['visits'], 1)

    def test_tab_open_times(self):
        # Slowest tabs (Tim, Oct 22 2026): ms from the tap to the content.
        self.c.post('/api/health/visit', json={'views': {'headcount': 1}, 'opens': {'headcount': [180, 1400], 'home': [40]}})
        self.c.post('/api/health/visit', json={'opens': {
            'headcount': [90, -5, 99999, True, 'x', 120.7],                  # bad times dropped
            'Bad View': [10], 'positions': list(range(100, 130))}})          # a bad name; at most 20 a note
        p = self.pending()
        self.assertEqual(p['opens']['headcount'], [180, 1400, 90, 120])
        self.assertEqual(p['opens']['home'], [40])
        self.assertNotIn('Bad View', p['opens'])
        self.assertEqual(p['opens']['positions'], list(range(100, 120)))
        self.assertNotIn('visits', p)                                       # a later note isn't a visit

    def test_tab_open_times_keep_the_latest(self):
        for n in range(appmod.HEALTH_OPEN_SAMPLES // 20 + 2):
            self.c.post('/api/health/visit', json={'opens': {'home': [n] * 20}})
        home = self.pending()['opens']['home']
        self.assertEqual(len(home), appmod.HEALTH_OPEN_SAMPLES)
        self.assertEqual(home[-1], appmod.HEALTH_OPEN_SAMPLES // 20 + 1)

    def test_load_times_keep_the_latest(self):
        for n in range(appmod.HEALTH_READY_SAMPLES + 5):
            self.c.post('/api/health/visit', json={'visit': 1, 'ready': n + 1})
        ready = self.pending()['ready']
        self.assertEqual(len(ready), appmod.HEALTH_READY_SAMPLES)
        self.assertEqual(ready[-1], appmod.HEALTH_READY_SAMPLES + 5)


class Flush(Base):
    def test_adds_to_the_days_record_and_prunes(self):
        old = (date.fromisoformat(self.day) - timedelta(days=appmod.HEALTH_DAYS_KEPT)).isoformat()
        store[f'health/{self.day}'] = {'saves': 10, 'refused': {'500': 1}, 'views': {'home': 4}, 'ready': [900], 'opens': {'home': [50]}}
        store[f'health/{old}'] = {'saves': 3}
        self.c.post('/api/health/visit', json={'visit': 1, 'ready': 1200, 'views': {'home': 2, 'calendar': 1},
                                               'opens': {'home': [60], 'calendar': [300]}})
        appmod._health_note({'saves': 1, 'refused': {'500': 2}})
        appmod._health_flush()
        rec = store[f'health/{self.day}']
        self.assertEqual(rec['saves'], 11)
        self.assertEqual(rec['refused'], {'500': 3})
        self.assertEqual(rec['views'], {'home': 6, 'calendar': 1})
        self.assertEqual(rec['ready'], [900, 1200])
        self.assertEqual(rec['opens'], {'home': [50, 60], 'calendar': [300]})
        self.assertNotIn(f'health/{old}', store)
        self.assertEqual(appmod._health_pending, {})
        # Nothing under the saved state.
        self.assertFalse(any(k.startswith('state/health') for k in store))

    def test_a_failed_write_keeps_the_counts(self):
        appmod._health_note({'saves': 2})

        class Broken(FakeRef):
            def set(self, value):
                raise RuntimeError('offline')
        appmod.db.reference = lambda path: Broken(path)
        appmod._health_flush()
        self.assertEqual(self.pending()['saves'], 2)
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._health_flush()
        self.assertEqual(store[f'health/{self.day}']['saves'], 2)

    def test_flushes_on_its_own_every_half_hour(self):
        started = []
        real = appmod.threading.Thread

        class Spy:
            def __init__(self, target, daemon):
                started.append(target)

            def start(self):
                pass
        appmod.threading.Thread = Spy
        try:
            appmod._health_note({'saves': 1})
            self.assertEqual(started, [])
            appmod._health_flushed_at = time.time() - appmod.HEALTH_FLUSH_SECONDS - 1
            appmod._health_note({'saves': 1})
            appmod._health_note({'saves': 1})                     # already on its way: once
            self.assertEqual(started, [appmod._health_flush])
        finally:
            appmod.threading.Thread = real
            appmod._health_flushing = False

    def test_flushes_when_the_worker_stops(self):
        conf = read('gunicorn.conf.py')
        self.assertIn('def worker_exit(server, worker):', conf)
        self.assertIn('app._health_flush()', conf)


class Read(Base):
    def test_managers_only(self):
        self.assertEqual(self.c.get('/api/health').status_code, 403)
        with self.c.session_transaction() as sess:
            sess['user'] = {'name': 'Test Person', 'role': 'lead', 'via': 'pin'}
        self.assertEqual(self.c.get('/api/health').status_code, 403)

    def test_the_week_with_whats_pending(self):
        yesterday = (date.fromisoformat(self.day) - timedelta(days=1)).isoformat()
        store[f'health/{self.day}'] = {'saves': 5}
        store[f'health/{yesterday}'] = {'visits': 7}
        appmod._health_note({'saves': 2})
        with self.c.session_transaction() as sess:
            sess['manager'] = True
        body = self.c.get('/api/health').get_json()
        self.assertEqual(len(body['days']), 7)
        self.assertEqual(body['days'][self.day]['saves'], 7)
        self.assertEqual(body['days'][yesterday], {'visits': 7})
        self.assertEqual(body['build'], appmod.BUILD)
        self.assertEqual(body['liveSince'], appmod.STARTED_AT)
        self.assertEqual(self.pending(), {'saves': 2})            # reading doesn't change the counts

    def test_the_week_is_one_read(self):
        # Seven reads one after another made Health slow to open (Oct 22 2026).
        old = (date.fromisoformat(self.day) - timedelta(days=7)).isoformat()
        store[f'health/{old}'] = {'visits': 99}                   # a day before the week
        with self.c.session_transaction() as sess:
            sess['manager'] = True
        calls = []
        real = FakeRef.get
        FakeRef.get = lambda ref: calls.append(ref.path) or real(ref)
        KeyRange.reads.clear()
        try:
            body = self.c.get('/api/health').get_json()
        finally:
            FakeRef.get = real
        self.assertEqual(KeyRange.reads, ['health'])
        self.assertEqual(calls, ['health'])                       # the range read's own children, nothing day by day
        self.assertEqual(len(body['days']), 7)
        self.assertNotIn(old, body['days'])


class PageWiring(unittest.TestCase):
    def test_saves_say_which_try(self):
        st = read('static', 'js', 'storage.js')
        self.assertIn("await statePost('/api/state/patch', {patches}, {'X-Save-Attempt': String(saveRetryN + 1)});", st)
        self.assertIn("headers: Object.assign({'Content-Type': 'application/json'}, headers || {}),", st)

    def test_visits_and_the_manage_section(self):
        nav = read('static', 'js', 'navigation.js')
        # Counted and timed only when the tab changes, not on every redraw
        # when saved data comes in (Oct 22 2026).
        self.assertIn("const opened = !was || was.id !== view + 'View';", nav)
        self.assertIn("if(opened && typeof hhNoteView === 'function') hhNoteView(view, t0);", nav)
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertIn('data-manage-go="health"', page)
        self.assertIn('<section class="manage-group" data-manage-tab="health"', page)
        self.assertIn('<script src="/static/js/hub-health.js"></script>', page)
        hh = read('static', 'js', 'hub-health.js')
        self.assertIn("hhSend({visit: 1, ready, app: typeof stateStandalone === 'function' && stateStandalone(), role: hhRole(), views, opens});", hh)
        self.assertIn('hhSend({views, opens}, beacon);', hh)
        # Tabs that wait on the server are timed until their data shows.
        self.assertIn("hhOpenArrived('headcount')", read('static', 'js', 'headcount.js'))
        self.assertIn("hhOpenArrived('health')", hh)
        self.assertIn('${hhSlowHtml(w)}', hh)
        self.assertNotIn('acUser.name', hh)                         # never a name


if __name__ == '__main__':
    unittest.main()
