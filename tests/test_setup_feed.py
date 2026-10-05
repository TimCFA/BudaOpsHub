"""The read-only set up feed (/api/setup-feed, setup_feed.py): off without a
token, only names and positions, in Set Ups' order and naming.

Run: python3 -m unittest discover tests
Firebase is replaced with an in-memory store.
"""
import json
import os
import sys
import unittest
from datetime import date, timedelta
from unittest import mock

ROOT = os.path.join(os.path.dirname(__file__), '..')
sys.path.insert(0, ROOT)
import app as appmod  # noqa: E402
import setup_feed  # noqa: E402

store = {}
TOKEN = 'x' * 40
DAY = '2026-10-06'


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


def seed(assignments, rosters=None):
    store.clear()
    store['state/setups'] = json.dumps({'posAssignments': assignments, 'posNotes': {'foh||%s||Lunch (10:30-1:00)||Runner' % DAY: [{'text': 'private note', 'by': 'JD', 'ts': 1}]}})
    store['state/rosters'] = json.dumps(rosters or {'fohRoster': {DAY: [
        {'name': 'Maya Torres', 'start': '6:00 AM', 'end': '2:00 PM'},
        {'name': 'Noah Bennett', 'start': '6:00 AM', 'end': '2:00 PM'},
        {'name': 'Ava Morales', 'start': '10:30 AM', 'end': '3:00 PM'},
        {'name': 'Ava Martin', 'start': '10:30 AM', 'end': '3:00 PM'},
    ]}, 'bohRoster': {}})
    store['state/people'] = json.dumps({'trainerTrainees': [{'name': 'Secret Trainee'}]})
    appmod._cache.clear()
    appmod._cache_ready = False


F = 'foh||%s||' % DAY
ASSIGN = {
    F + 'Lunch (10:30-1:00)||Runner': 'Noah Bennett',
    F + 'Lunch (10:30-1:00)||iPOS 1 (Captain)': 'Ava Morales',
    F + 'Lunch (10:30-1:00)||DT Bagger 1 (Cockpit Cap)': 'Ava Martin/Noah Bennett',
    F + 'Lunch (10:30-1:00)||Lead Captain': 'Maya Torres',
    F + 'Breakfast (8:00-11:00)||Drinks 1': 'Maya Torres',          # an old daypart name, renamed
    'boh||%s||Mid (10:30-2:00)||Breader1' % DAY: 'Noah Bennett',     # BOH's old Mid is Lunch
    'foh||2026-10-07||Lunch (10:30-1:00)||Runner': 'Other Day',      # another day: left out
}


class SetupFeedRouteTest(unittest.TestCase):
    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._setup_feed_failures.clear()
        seed(ASSIGN)
        self.c = appmod.app.test_client()

    def get(self, query, env_token=TOKEN, **kw):
        env = {'SETUP_FEED_TOKEN': env_token} if env_token is not None else {}
        with mock.patch.dict(os.environ, env, clear=False):
            if env_token is None:
                os.environ.pop('SETUP_FEED_TOKEN', None)
            return self.c.get('/api/setup-feed' + query, **kw)

    def test_off_without_a_token(self):
        self.assertEqual(self.get('?token=' + TOKEN + '&date=' + DAY, env_token=None).status_code, 404)

    def test_off_with_a_short_token(self):
        self.assertEqual(self.get('?token=short&date=' + DAY, env_token='short').status_code, 404)

    def test_wrong_token_looks_like_no_route_and_is_throttled(self):
        for _ in range(appmod.SETUP_FEED_MAX_FAILURES):
            r = self.get('?token=' + 'y' * 40 + '&date=' + DAY)
            self.assertEqual(r.status_code, 404)
        self.assertEqual(self.get('?token=' + TOKEN + '&date=' + DAY).status_code, 429)
        # The PIN sign-in throttle is separate.
        self.assertEqual(appmod._login_failures.get('127.0.0.1', []), [])

    def test_the_set_up_in_set_ups_order(self):
        r = self.get('?token=' + TOKEN + '&date=' + DAY)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers['Cache-Control'], 'no-store')
        feed = r.get_json()
        self.assertEqual(feed['date'], DAY)
        self.assertEqual(feed['weekday'], 'Tuesday')
        self.assertEqual([d['daypart'] for d in feed['foh']], ['Breakfast (8:00-10:30)', 'Lunch (10:30-1:00)'])
        lunch = feed['foh'][1]
        self.assertEqual(lunch['lead'], 'Maya')
        # Positions in the set up's priority order (the page's list), not the order saved.
        self.assertEqual([p['position'] for p in lunch['positions']], ['iPOS 1 (Captain)', 'DT Bagger 1 (Cockpit Cap)', 'Runner'])
        self.assertEqual(lunch['positions'][2]['names'], ['Noah'])
        self.assertEqual([d['daypart'] for d in feed['boh']], ['Lunch (10:30-2:00)'])
        self.assertEqual(feed['boh'][0]['lead'], None)

    def test_names_as_set_ups_shows_them(self):
        lunch = self.get('?token=' + TOKEN + '&date=' + DAY).get_json()['foh'][1]
        # Two Avas: last initials, and the same initial falls back to the whole last name.
        self.assertEqual(lunch['positions'][0]['names'], ['Ava Morales'])
        self.assertEqual(lunch['positions'][1]['names'], ['Ava Martin', 'Noah'])   # a handoff keeps its order

    def test_only_the_set_up_goes_out(self):
        body = self.get('?token=' + TOKEN + '&date=' + DAY).get_data(as_text=True)
        for private in ('private note', 'Secret Trainee', '6:00 AM', 'Other Day', 'Bennett', 'Torres'):
            self.assertNotIn(private, body)

    def test_bearer_header_works_too(self):
        r = self.get('?date=' + DAY, headers={'Authorization': 'Bearer ' + TOKEN})
        self.assertEqual(r.status_code, 200)

    def test_text_format(self):
        r = self.get('?token=' + TOKEN + '&date=' + DAY + '&format=text')
        self.assertEqual(r.mimetype, 'text/plain')
        text = r.get_data(as_text=True)
        self.assertIn('Set up for Tuesday, 2026-10-06', text)
        self.assertIn('Lunch (10:30-1:00) (Lead: Maya)', text)
        self.assertIn('  DT Bagger 1 (Cockpit Cap): Ava Martin then Noah', text)
        self.assertIn('BOH', text)

    def test_dates(self):
        self.assertEqual(self.get('?token=' + TOKEN + '&date=nope').status_code, 400)
        tomorrow = (setup_feed.store_today() + timedelta(days=1)).isoformat()
        self.assertEqual(self.get('?token=' + TOKEN).get_json()['date'], tomorrow)
        self.assertEqual(self.get('?token=' + TOKEN + '&date=today').get_json()['date'], setup_feed.store_today().isoformat())

    def test_empty_day(self):
        feed = self.get('?token=' + TOKEN + '&date=2026-12-01').get_json()
        self.assertEqual((feed['foh'], feed['boh']), ([], []))
        self.assertIn('No set up entered yet.', self.get('?token=' + TOKEN + '&date=2026-12-01&format=text').get_data(as_text=True))


class SetupFeedPartsTest(unittest.TestCase):
    def test_layout_matches_the_page(self):
        layout = setup_feed.load_layout()
        self.assertEqual(layout['foh']['dayparts'][0], 'Early Breakfast (6:00-8:00)')
        self.assertEqual(len(layout['foh']['dayparts']), 7)
        self.assertEqual(len(layout['boh']['dayparts']), 6)
        for side in ('foh', 'boh'):
            self.assertEqual(list(layout[side]['positions']), layout[side]['dayparts'])
            self.assertTrue(all(layout[side]['positions'][dp] for dp in layout[side]['dayparts']))
        self.assertEqual(layout['foh']['positions']['Lunch (10:30-1:00)'][0], 'iPOS 1 (Captain)')
        self.assertEqual(layout['renames']['boh'], {'Mid (10:30-2:00)': 'Lunch (10:30-2:00)'})

    def test_display_names(self):
        shown = setup_feed.display_names(['Daniel Morales', 'Daniel Van Cleave', 'GRACE KIM', 'Liz (Elizabeth) Ray', 'Sam Lee', 'Sam Lane'])
        self.assertEqual(shown['daniel morales'], 'Daniel M.')
        self.assertEqual(shown['daniel van cleave'], 'Daniel V.C.')
        self.assertEqual(shown['grace kim'], 'Grace')
        self.assertEqual(shown['sam lee'], 'Sam Lee')     # same initials: the whole last name
        self.assertEqual(shown['sam lane'], 'Sam Lane')

    def test_parse_day(self):
        self.assertEqual(setup_feed.parse_day('2026-10-06'), date(2026, 10, 6))
        self.assertIsNone(setup_feed.parse_day('10/06'))


if __name__ == '__main__':
    unittest.main()
