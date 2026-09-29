"""Levelset sync: reading Levelset's ratings data and the manager-only route.

Run: python3 -m unittest discover tests
Levelset is never called: requests are answered with made-up data in the
shape Levelset's share-link endpoint returns.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
import levelset_sync as ls  # noqa: E402

appmod.app.config['SESSION_COOKIE_SECURE'] = False


def rating(**kw):
    r = {'id': 'r1', 'employee_id': 'e1', 'rater_user_id': 'u1', 'position': 'iPOS',
         'rating_1': 3, 'rating_2': 3, 'rating_3': 2, 'rating_4': 3, 'rating_5': 3,
         'created_at': '2026-09-26T22:30:12.123456+00:00', 'location_id': 'l', 'org_id': 'o',
         'rating_avg': 2.8, 'position_id': 'p', 'notes': 'private note', 'employee': None, 'rater': None,
         'employee_name': 'Test Person', 'rater_name': 'Test Leader'}
    r.update(kw)
    return r


def person(ratings, **kw):
    p = {'employee_id': 'e1', 'employee_name': 'Test Person', 'last_rating_date': '2026-09-26',
         'positions': {'iPOS': 2.8}, 'overall_avg': 2.8, 'total_count_90d': len(ratings), 'recent_ratings': ratings}
    p.update(kw)
    return p


class FakeResponse:
    def __init__(self, status, body):
        self.status_code = status
        self._body = body

    def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


LABELS = {'label_1': 'Smile', 'label_2': 'Detail', 'label_3': 'Offer', 'label_4': 'Close Gaps', 'label_5': 'Farewell'}


def fake_get(bodies, labels=None):
    calls = []

    def get(url, params=None, **kw):
        if url == ls.LABELS_URL:
            get.label_calls.append(params['position'])
            if labels is None:
                return FakeResponse(401, {'error': 'Unauthorized'})
            return FakeResponse(200, {'success': True, 'labels': labels})
        calls.append(params)
        status, body = bodies[params['area']]
        return FakeResponse(status, body)
    get.label_calls = []
    get.calls = calls
    return get


class NormalizeTest(unittest.TestCase):
    def test_shape_matches_the_pdf_reader(self):
        out, expected = ls.normalize([person([rating()])])
        self.assertEqual(expected, 1)
        self.assertEqual(out, [{
            'at': '2026-09-26T17:30',            # UTC → store time (CDT)
            'employee': 'Test Person', 'role': '', 'leader': 'Test Leader', 'position': 'iPOS',
            'criteria': [3.0, 3.0, 2.0, 3.0, 3.0], 'overall': 2.8}])
        self.assertNotIn('notes', out[0])       # notes never leave the server

    def test_side_suffix_dropped_and_z_times(self):
        out, _ = ls.normalize([person([rating(position='3H Week BOH', created_at='2026-01-10T15:05:00Z')])])
        self.assertEqual(out[0]['position'], '3H Week')
        self.assertEqual(out[0]['at'], '2026-01-10T09:05')   # CST in winter

    def test_bad_rows_skipped(self):
        out, _ = ls.normalize([person([rating(rating_3=None), rating(created_at='nope'), rating(position='')]), 'junk'])
        self.assertEqual(out, [])

    def test_role_when_levelset_gives_one(self):
        out, _ = ls.normalize([person([rating(employee={'role': 'Trainer'})])])
        self.assertEqual(out[0]['role'], 'Trainer')

    def test_share_link_or_code_accepted(self):
        for value, want in [('ABC123XYZ', 'ABC123XYZ'), ('https://app.levelset.io/public/positional-excellence/ABC123XYZ', 'ABC123XYZ'),
                            ('', ''), ('bad code!', '')]:
            os.environ[ls.TOKEN_ENV] = value
            self.assertEqual(ls.configured_token(), want, value)
        os.environ.pop(ls.TOKEN_ENV, None)


class FetchTest(unittest.TestCase):
    def setUp(self):
        ls._labels_cache.clear()

    def test_both_sides_fetched(self):
        get = fake_get({'FOH': (200, {'success': True, 'data': [person([rating()])]}),
                        'BOH': (200, {'success': True, 'data': [person([rating(position='Breader')], employee_name='Cook Test')]})})
        reply = ls.fetch_ratings('ABC123XYZ', get=get)
        self.assertEqual([c['area'] for c in get.calls], ['FOH', 'BOH'])
        self.assertTrue(all(c['window'] == '90d' and c['token'] == 'ABC123XYZ' for c in get.calls))
        self.assertEqual(len(reply['ratings']), 2)
        self.assertEqual(reply['summary']['areas'], ['FOH', 'BOH'])
        self.assertEqual(reply['warnings'], [])

    def test_partial_data_warns_but_counts_as_checked(self):
        get = fake_get({'FOH': (200, {'success': True, 'data': [person([rating()], total_count_90d=7)]}),
                        'BOH': (200, {'success': True, 'data': []})})
        reply = ls.fetch_ratings('ABC123XYZ', get=get)
        self.assertEqual(reply['summary']['areas'], ['FOH', 'BOH'])
        self.assertIn('listed 7 FOH ratings', reply['warnings'][0])
        self.assertIn('sent 1', reply['warnings'][0])

    def test_errors_are_plain(self):
        cases = [
            {'FOH': (404, {}), 'BOH': (200, {})},
            {'FOH': (500, {}), 'BOH': (200, {})},
            {'FOH': (200, ValueError('html')), 'BOH': (200, {})},
            {'FOH': (200, {'success': False}), 'BOH': (200, {})},
        ]
        for bodies in cases:
            with self.assertRaises(ls.LevelsetError):
                ls.fetch_ratings('ABC123XYZ', get=fake_get(bodies))
        with self.assertRaises(ls.LevelsetError):
            ls.fetch_ratings('', get=fake_get({}))


class LabelsTest(unittest.TestCase):
    def setUp(self):
        ls._labels_cache.clear()

    def test_category_names_come_with_the_ratings(self):
        get = fake_get({'FOH': (200, {'success': True, 'data': [person([rating(), rating(position='3H Week FOH', rating_1=2)])]}),
                        'BOH': (200, {'success': True, 'data': []})}, labels=LABELS)
        reply = ls.fetch_ratings('ABC123XYZ', get=get)
        self.assertEqual(sorted(get.label_calls), ['3H Week FOH', 'iPOS'])   # Levelset's own names asked for
        self.assertEqual(reply['labels']['iPOS'], ['Smile', 'Detail', 'Offer', 'Close Gaps', 'Farewell'])
        self.assertIn('3H Week', reply['labels'])
        # Cached for a day: the next sync doesn't ask again.
        ls.fetch_ratings('ABC123XYZ', get=get)
        self.assertEqual(len(get.label_calls), 2)

    def test_labels_are_optional(self):
        get = fake_get({'FOH': (200, {'success': True, 'data': [person([rating()])]}),
                        'BOH': (200, {'success': True, 'data': []})}, labels=None)
        reply = ls.fetch_ratings('ABC123XYZ', get=get)
        self.assertEqual(reply['labels'], {})
        self.assertEqual(len(reply['ratings']), 1)


class RouteTest(unittest.TestCase):
    def setUp(self):
        self.c = appmod.app.test_client()
        appmod._levelset_last.update(at=0.0, reply=None)
        os.environ[ls.TOKEN_ENV] = 'ABC123XYZ'
        self.real_fetch = ls.fetch_ratings
        self.calls = 0

        def fetch(token):
            self.calls += 1
            return {'ratings': [], 'summary': {'areas': ['FOH', 'BOH']}, 'warnings': []}
        ls.fetch_ratings = fetch

    def tearDown(self):
        ls.fetch_ratings = self.real_fetch
        os.environ.pop(ls.TOKEN_ENV, None)

    def manager(self):
        with self.c.session_transaction() as sess:
            sess['manager'] = True

    def test_needs_manager(self):
        self.assertEqual(self.c.post('/api/pea/levelset-sync').status_code, 403)
        self.assertEqual(self.calls, 0)

    def test_not_configured(self):
        self.manager()
        os.environ.pop(ls.TOKEN_ENV)
        r = self.c.post('/api/pea/levelset-sync')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.get_json()['error'], 'not_configured')

    def test_sync_and_rate_limit(self):
        self.manager()
        self.assertEqual(self.c.post('/api/pea/levelset-sync').status_code, 200)
        self.assertEqual(self.c.post('/api/pea/levelset-sync').status_code, 200)
        self.assertEqual(self.calls, 1)          # the second press within a minute reuses the first

    def test_levelset_error_is_502(self):
        self.manager()

        def boom(token):
            raise ls.LevelsetError('Levelset answered 500 for FOH.')
        ls.fetch_ratings = boom
        r = self.c.post('/api/pea/levelset-sync')
        self.assertEqual(r.status_code, 502)
        self.assertIn('500', r.get_json()['error'])


if __name__ == '__main__':
    unittest.main()
