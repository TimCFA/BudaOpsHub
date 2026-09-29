"""Levelset feed sync: mapping, safety checks, and the /api/pea/sync route.

Run: python3 -m unittest discover tests
No network: the feed is replaced with canned responses.
"""
import os
import sys
import unittest
from datetime import datetime, timezone
from unittest import mock

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import levelset_feed as lf  # noqa: E402
import app as appmod  # noqa: E402

TOKEN = 'ABCDEF123456'
NOW = datetime(2026, 9, 29, 20, 0, tzinfo=timezone.utc)


def rating(rid, when, position='iPOS', name='Ana Diaz', rater='Sam Lee', criteria=(3, 3, 2, 3, 3)):
    return {
        'id': rid, 'position': position, 'created_at': when,
        'rating_1': criteria[0], 'rating_2': criteria[1], 'rating_3': criteria[2],
        'rating_4': criteria[3], 'rating_5': criteria[4], 'rating_avg': sum(criteria) / 5,
        'employee_name': name, 'rater_name': rater,
        'employee': {'full_name': name}, 'rater': {'full_name': rater},
    }


def person(ratings, **positions):
    return {'employee_id': 'e', 'employee_name': 'x', 'positions': positions or {'iPOS': 2.5},
            'recent_ratings': ratings, 'total_count_90d': len(ratings)}


class FakeSession:
    """Answers feed calls from a {(area, tab, position): rows} table."""

    def __init__(self, table, status=200, error=None):
        self.table, self.status, self.error, self.calls = table, status, error, []

    def get(self, url, params=None, **kw):
        self.calls.append(dict(params))
        if self.error:
            raise self.error
        resp = mock.Mock(status_code=self.status)
        key = (params['area'], params['tab'], params.get('position'))
        resp.json.return_value = {'success': True, 'data': self.table.get(key, [])}
        return resp


def feed(by_position=None, foh_positions=('iPOS',), boh_positions=('Fries',)):
    table = {('FOH', 'overview', None): [person([], **{p: 2.0 for p in foh_positions})],
             ('BOH', 'overview', None): [person([], **{p: 2.0 for p in boh_positions})]}
    table.update(by_position or {})
    return table


class FetchTest(unittest.TestCase):
    def run_feed(self, table, **kw):
        return lf.fetch_pea_feed(TOKEN, session=FakeSession(table), now=NOW, **kw)

    def test_maps_a_rating_and_converts_utc_to_restaurant_time(self):
        table = feed({('FOH', 'position', 'iPOS'): [person([rating('r1', '2026-09-15T17:57:27.91909+00:00')])]})
        out = self.run_feed(table)
        self.assertEqual(out['ratings'], [{
            'at': '2026-09-15T12:57', 'employee': 'Ana Diaz', 'area': 'FOH', 'role': '', 'leader': 'Sam Lee',
            'position': 'iPOS', 'criteria': [3.0, 3.0, 2.0, 3.0, 3.0], 'overall': 2.8}])

    def test_winter_time_uses_standard_offset(self):
        table = feed({('FOH', 'position', 'iPOS'): [person([rating('r1', '2026-01-10T18:30:00+00:00')])]})
        self.assertEqual(self.run_feed(table)['ratings'][0]['at'], '2026-01-10T12:30')

    def test_area_suffix_is_dropped_from_leadership_and_new_hire_positions(self):
        table = feed({('FOH', 'position', 'Team Lead FOH'): [person([rating('a', '2026-09-01T15:00:00+00:00', 'Team Lead FOH')])],
                        ('FOH', 'position', 'Trainer FOH'): [person([rating('b', '2026-09-02T15:00:00+00:00', 'Trainer FOH')])],
                        ('FOH', 'position', '3H Week FOH'): [person([rating('c', '2026-09-03T15:00:00+00:00', '3H Week FOH')])],
                        ('FOH', 'position', 'Drinks 1/3'): [person([rating('d', '2026-09-04T15:00:00+00:00', 'Drinks 1/3')])]},
                     foh_positions=('Team Lead FOH', 'Trainer FOH', '3H Week FOH', 'Drinks 1/3'))
        self.assertEqual([r['position'] for r in self.run_feed(table)['ratings']],
                         ['Team Lead', 'Trainer', '3H Week', 'Drinks 1/3'])

    def test_one_call_per_position_and_area(self):
        sess = FakeSession(feed(foh_positions=('iPOS', 'Host'), boh_positions=('Fries',)))
        lf.fetch_pea_feed(TOKEN, session=sess, now=NOW)
        views = sorted((c['area'], c['tab'], c.get('position')) for c in sess.calls)
        self.assertEqual(views, [('BOH', 'overview', None), ('BOH', 'position', 'Fries'),
                                 ('FOH', 'overview', None), ('FOH', 'position', 'Host'),
                                 ('FOH', 'position', 'iPOS')])
        self.assertTrue(all(c['token'] == TOKEN for c in sess.calls))

    def test_same_rating_seen_twice_is_kept_once(self):
        r = rating('same', '2026-09-15T17:00:00+00:00')
        table = feed({('FOH', 'position', 'iPOS'): [person([r]), person([r])]})
        self.assertEqual(len(self.run_feed(table)['ratings']), 1)

    def test_coverage_is_full_window_when_nobody_hits_the_cap(self):
        table = feed({('FOH', 'position', 'iPOS'): [person([rating('r1', '2026-09-15T17:00:00+00:00')])]})
        cov = self.run_feed(table)['summary']['coverage']
        self.assertEqual(cov['FOH'], ['2026-07-01', '2026-09-29'])
        self.assertEqual(cov['BOH'], ['2026-07-01', '2026-09-29'])

    def test_coverage_starts_after_ratings_cut_off_by_the_cap(self):
        four = [rating(f'r{i}', f'2026-09-{10 + i}T17:00:00+00:00') for i in range(4)]  # oldest Sep 10
        table = feed({('FOH', 'position', 'iPOS'): [person(four)]})
        out = self.run_feed(table)
        self.assertEqual(out['summary']['coverage']['FOH'], ['2026-09-10', '2026-09-29'])
        self.assertEqual(out['summary']['coverage']['BOH'][0], '2026-07-01')
        self.assertTrue(any('FOH is complete from Sep 10' in w for w in out['warnings']))

    def test_unreadable_ratings_are_skipped_with_a_warning(self):
        good = [rating(f'g{i}', f'2026-09-{i + 1:02d}T17:00:00+00:00') for i in range(3)]
        bad = rating('bad', '2026-09-20T17:00:00+00:00')
        bad['rating_avg'] = 1.0   # doesn't match its criteria
        table = feed({('FOH', 'position', 'iPOS'): [person(good), person([bad])]})
        out = self.run_feed(table)
        self.assertEqual(len(out['ratings']), 3)
        self.assertTrue(any('could not be read' in w for w in out['warnings']))

    def test_many_unreadable_ratings_refuse_the_whole_sync(self):
        bad = []
        for i in range(5):
            b = rating(f'b{i}', f'2026-09-{i + 1:02d}T17:00:00+00:00')
            b['rating_avg'] = 1.0
            bad.append(person([b]))
        with self.assertRaisesRegex(lf.FeedError, "didn't read cleanly"):
            self.run_feed(feed({('FOH', 'position', 'iPOS'): bad}))

    def test_changed_format_is_refused(self):
        table = feed({('FOH', 'position', 'iPOS'): [{'employee_id': 'e'}]})
        with self.assertRaisesRegex(lf.FeedError, 'expected format'):
            self.run_feed(table)

    def test_bad_token_and_time_zone(self):
        for token in ('', 'short', 'has space!!', None):
            with self.assertRaises(lf.FeedError):
                lf.fetch_pea_feed(token, session=FakeSession({}), now=NOW)
        with self.assertRaisesRegex(lf.FeedError, 'time zone'):
            lf.fetch_pea_feed(TOKEN, tz_name='Mars/Base', session=FakeSession({}), now=NOW)

    def test_a_network_failure_is_retried_once(self):
        table = feed({('FOH', 'position', 'iPOS'): [person([rating('r1', '2026-09-15T17:00:00+00:00')])]})
        sess = FakeSession(table)
        real_get, failed = sess.get, []

        def flaky(url, params=None, **kw):
            if params.get('position') == 'iPOS' and not failed:
                failed.append(1)
                raise requests.ReadTimeout('slow')
            return real_get(url, params=params, **kw)
        sess.get = flaky
        out = lf.fetch_pea_feed(TOKEN, session=sess, now=NOW)
        self.assertEqual(len(out['ratings']), 1)
        self.assertEqual(failed, [1])

    def test_http_errors_are_not_retried(self):
        sess = FakeSession({}, status=500)
        with self.assertRaises(lf.FeedError):
            lf.fetch_pea_feed(TOKEN, session=sess, now=NOW)
        self.assertLessEqual(len(sess.calls), 2)   # the two overview calls, once each

    def test_areas_are_tagged_from_where_the_rating_was_fetched(self):
        table = feed({('FOH', 'position', 'iPOS'): [person([rating('a', '2026-09-15T17:00:00+00:00')])],
                      ('BOH', 'position', 'Fries'): [person([rating('b', '2026-09-16T17:00:00+00:00', 'Fries')])]})
        got = {r['position']: r['area'] for r in self.run_feed(table)['ratings']}
        self.assertEqual(got, {'iPOS': 'FOH', 'Fries': 'BOH'})


    def test_errors_never_contain_the_token(self):
        cases = [FakeSession({}, status=401), FakeSession({}, status=500),
                 FakeSession({}, error=requests.ConnectionError(f'failed for /api/ratings?token={TOKEN}'))]
        for sess in cases:
            with self.assertRaises(lf.FeedError) as cm:
                lf.fetch_pea_feed(TOKEN, session=sess, now=NOW)
            self.assertNotIn(TOKEN, str(cm.exception))
            self.assertIsNone(cm.exception.__cause__)
            self.assertTrue(cm.exception.__context__ is None or cm.exception.__suppress_context__)


class SyncRouteTest(unittest.TestCase):
    RESULT = {'ratings': [], 'summary': {}, 'warnings': []}

    def setUp(self):
        appmod._pea_sync_last.update(at=0.0, result=None)
        self.c = appmod.app.test_client()
        appmod.app.config['SESSION_COOKIE_SECURE'] = False

    def manager(self):
        with self.c.session_transaction() as sess:
            sess['manager'] = True

    def test_needs_manager_sign_in(self):
        with mock.patch.dict(os.environ, {'LEVELSET_PEA_TOKEN': TOKEN}):
            self.assertEqual(self.c.post('/api/pea/sync').status_code, 403)

    def test_not_configured_says_so(self):
        self.manager()
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop('LEVELSET_PEA_TOKEN', None)
            r = self.c.post('/api/pea/sync')
        self.assertEqual(r.status_code, 503)
        self.assertIn('LEVELSET_PEA_TOKEN', r.get_json()['error'])

    def test_returns_the_feed_and_reuses_it_for_a_repeat_press(self):
        self.manager()
        with mock.patch.dict(os.environ, {'LEVELSET_PEA_TOKEN': f' {TOKEN} '}), \
                mock.patch.object(appmod, 'fetch_pea_feed', return_value=self.RESULT) as fetch:
            first = self.c.post('/api/pea/sync')
            second = self.c.post('/api/pea/sync')
        self.assertEqual(first.get_json(), self.RESULT)
        self.assertEqual(second.get_json(), self.RESULT)
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(fetch.call_args.args[0], TOKEN)

    def test_feed_error_is_a_502_with_its_message(self):
        self.manager()
        with mock.patch.dict(os.environ, {'LEVELSET_PEA_TOKEN': TOKEN}), \
                mock.patch.object(appmod, 'fetch_pea_feed', side_effect=lf.FeedError('Levelset is down.')):
            r = self.c.post('/api/pea/sync')
        self.assertEqual((r.status_code, r.get_json()['error']), (502, 'Levelset is down.'))

    def test_unexpected_failure_leaks_neither_token_nor_detail(self):
        self.manager()
        boom = RuntimeError(f'GET /api/ratings?token={TOKEN} failed')
        with mock.patch.dict(os.environ, {'LEVELSET_PEA_TOKEN': TOKEN}), \
                mock.patch.object(appmod, 'fetch_pea_feed', side_effect=boom), \
                mock.patch('builtins.print') as printed:
            r = self.c.post('/api/pea/sync')
        self.assertEqual(r.status_code, 500)
        self.assertNotIn(TOKEN, r.get_data(as_text=True))
        self.assertNotIn(TOKEN, ' '.join(str(a) for call in printed.call_args_list for a in call.args))


class ExportScriptTest(unittest.TestCase):
    """scripts/export_pea_csv.py, with the feed replaced by canned ratings."""

    @classmethod
    def setUpClass(cls):
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            'export_pea_csv', os.path.join(os.path.dirname(__file__), '..', 'scripts', 'export_pea_csv.py'))
        cls.mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.mod)

    def r(self, day, area='FOH', name='Ana Díaz', position='iPOS'):
        return {'at': f'2026-09-{day:02d}T12:57', 'employee': name, 'area': area, 'role': '',
                'leader': 'Sam Lee', 'position': position, 'criteria': [3.0, 3.0, 2.0, 3.0, 3.0], 'overall': 2.8}

    def test_range_is_inclusive_and_sorted(self):
        rows = self.mod.in_range([self.r(20), self.r(5), self.r(10), self.r(30)], '2026-09-10', '2026-09-20')
        self.assertEqual([x['at'][:10] for x in rows], ['2026-09-10', '2026-09-20'])

    def test_csv_has_the_expected_columns_and_values(self):
        import csv
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, 'sub', 'out.csv')
            self.mod.write_csv([self.r(10)], path)
            with open(path, encoding='utf-8-sig', newline='') as f:
                rows = list(csv.reader(f))
        self.assertEqual(rows[0], self.mod.COLUMNS)
        self.assertEqual(rows[1], ['2026-09-10', '12:57', 'FOH', 'Ana Díaz', 'iPOS', 'Sam Lee',
                                   '3', '3', '2', '3', '3', '2.80'])

    def run_main(self, env, result=None, error=None, args=()):
        import contextlib
        import io
        import tempfile
        out, err = io.StringIO(), io.StringIO()
        with tempfile.TemporaryDirectory() as d, \
                mock.patch.dict(os.environ, env, clear=False), \
                mock.patch.object(self.mod, 'fetch_pea_feed', side_effect=error, return_value=result) as fetch, \
                contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            os.environ.pop('LEVELSET_PEA_TOKEN', None) if 'LEVELSET_PEA_TOKEN' not in env else None
            code = self.mod.main(['--out', d, *args])
            files = os.listdir(d)
        return code, out.getvalue(), err.getvalue(), files, fetch

    def test_needs_the_token(self):
        code, out, err, files, fetch = self.run_main({})
        self.assertEqual((code, files), (2, []))
        self.assertIn('LEVELSET_PEA_TOKEN', err)
        fetch.assert_not_called()

    def test_writes_a_file_and_prints_only_counts(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo
        today = datetime.now(ZoneInfo('America/Chicago')).date()
        recent = {**self.r(1), 'at': today.isoformat() + 'T09:00', 'employee': 'Zed Secret'}
        old = {**self.r(1), 'at': '2020-01-01T09:00'}
        result = {'ratings': [recent, old], 'summary': {}, 'warnings': ['FOH is complete from Sep 23 on.']}
        code, out, err, files, fetch = self.run_main({'LEVELSET_PEA_TOKEN': TOKEN}, result=result)
        self.assertEqual(code, 0)
        self.assertEqual(len(files), 1)
        self.assertIn('Wrote 1 ratings', out)
        self.assertIn('Note: FOH is complete', out)
        self.assertNotIn('Zed', out + err)
        self.assertNotIn(TOKEN, out + err)

    def test_feed_error_is_reported_without_a_file(self):
        code, out, err, files, _ = self.run_main({'LEVELSET_PEA_TOKEN': TOKEN}, error=lf.FeedError('Levelset is down.'))
        self.assertEqual((code, files), (1, []))
        self.assertIn('Levelset is down.', err)


if __name__ == '__main__':
    unittest.main()
