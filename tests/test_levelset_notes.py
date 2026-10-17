"""Levelset PEA notes for directors: the director PIN, the notes the sync
keeps on the server, and who can read them.

Run: python3 -m unittest discover tests
Levelset is never called, and Firebase is a dict. Names are made up.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
import levelset_sync as ls  # noqa: E402
from werkzeug.security import generate_password_hash  # noqa: E402



def rating(**kw):
    # The shape Levelset's share-link endpoint sends (as in test_levelset.py).
    r = {'id': 'r1', 'position': 'iPOS', 'rating_1': 3, 'rating_2': 3, 'rating_3': 2, 'rating_4': 3, 'rating_5': 3,
         'created_at': '2026-09-26T22:30:12.123456+00:00', 'rating_avg': 2.8, 'notes': 'private note',
         'employee_name': 'Test Person', 'rater_name': 'Test Leader'}
    r.update(kw)
    return r


def person(ratings):
    return {'employee_name': 'Test Person', 'total_count_90d': len(ratings), 'recent_ratings': ratings}

store = {}


class FakeRef:
    """Paths as keys; a dict at a path is that path's children."""
    def __init__(self, path):
        self.path = path.strip('/')

    def get(self):
        return store.get(self.path)

    def set(self, value):
        store[self.path] = value

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
    appmod._levelset_last.update(at=0.0, reply=None)
    store.clear()
    store['secure/managerPinHash'] = generate_password_hash('1111')


class NotesOfTest(unittest.TestCase):
    def test_only_ratings_with_a_note(self):
        people = [person([rating(), rating(id='r2', notes='  '), rating(id='r3', notes=None)])]
        out = ls.notes_of(people)
        self.assertEqual(out, [{'id': 'r1', 'at': '2026-09-26T17:30', 'employee': 'Test Person', 'position': 'iPOS',
                                'leader': 'Test Leader', 'overall': 2.8, 'text': 'private note'}])
        # The ratings the page gets still carry no notes.
        ratings, _ = ls.normalize(people)
        self.assertTrue(all('notes' not in r and 'text' not in r for r in ratings))

    def test_fetch_returns_them_for_the_server(self):
        def get(url, params=None, **kw):
            class R:
                status_code = 200 if url == ls.LEVELSET_URL else 401

                def json(self):
                    return {'success': True, 'data': [person([rating(position=f'iPOS {params["area"]}')])] if params['area'] == 'FOH' else []}
            return R()
        ls._labels_cache.clear()
        reply = ls.fetch_ratings('ABC123XYZ', get=get)
        self.assertEqual(len(reply['notes']), 1)
        self.assertEqual(reply['notes'][0]['position'], 'iPOS')


class NoteFieldsTest(unittest.TestCase):
    def test_other_field_names_are_read(self):
        out = ls.notes_of([person([rating(notes=None, comment='Smiled at every guest.')])])
        self.assertEqual([n['text'] for n in out], ['Smiled at every guest.'])

    def test_field_report_has_names_and_counts_only(self):
        people = [person([rating(), rating(id='r2', notes=''), rating(id='r3', notes=None, feedback_text='x')])]
        seen = ls.note_fields(people)
        self.assertEqual(seen['noteLike'], {'notes': 1, 'feedback_text': 1})
        self.assertIn('rating_1', seen['keys'])
        self.assertNotIn('private note', repr(seen))

    def test_summary_says_how_many_without_the_text(self):
        def get(url, params=None, **kw):
            class R:
                status_code = 200 if url == ls.LEVELSET_URL else 401

                def json(self):
                    return {'success': True, 'data': [person([rating(), rating(id='r2', notes=None)])] if params['area'] == 'FOH' else []}
            return R()
        ls._labels_cache.clear()
        reply = ls.fetch_ratings('ABC123XYZ', get=get)
        n = reply['summary']['notes']
        self.assertEqual(n['found'], 1)
        self.assertEqual(n['noteLike'], {'notes': 1})
        self.assertNotIn('private note', repr(reply['summary']))


class DirectorPinTest(unittest.TestCase):
    def setUp(self):
        reset()
        self.c = appmod.app.test_client()

    def login(self, pin, c=None):
        return (c or self.c).post('/api/manager/login', json={'pin': pin})

    def status(self, c=None):
        return (c or self.c).get('/api/manager/status').get_json()

    def test_first_director_pin_from_a_manager_session(self):
        self.assertEqual(self.c.post('/api/director/set-pin', json={'pin': '2222'}).status_code, 403)   # signed out
        self.assertTrue(self.login('1111').get_json()['success'])
        st = self.status()
        self.assertEqual((st['isManager'], st['isDirector'], st['directorPinSet']), (True, False, False))
        self.assertEqual(self.c.post('/api/director/set-pin', json={'pin': '22'}).status_code, 400)
        r = self.c.post('/api/director/set-pin', json={'pin': '1111'})                                 # same as the manager PIN
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.c.post('/api/director/set-pin', json={'pin': '2222'}).status_code, 200)
        st = self.status()
        self.assertEqual((st['isManager'], st['isDirector'], st['directorPinSet']), (True, True, True))

    def test_director_pin_signs_in_as_director(self):
        store[appmod.DIRECTOR_PIN_PATH] = generate_password_hash('2222')
        r = self.login('2222').get_json()
        self.assertEqual((r['success'], r['director'], r['role']), (True, True, 'director'))
        self.assertTrue(self.status()['isDirector'])
        # The manager PIN on the same device drops director.
        r = self.login('1111').get_json()
        self.assertEqual((r['success'], r['director'], r['role']), (True, False, 'lead'))
        self.assertFalse(self.status()['isDirector'])
        self.assertEqual(self.login('3333').status_code, 401)
        self.login('2222')
        self.c.post('/api/manager/logout')
        st = self.status()
        self.assertEqual((st['isManager'], st['isDirector'], st['directorPinSet'], st['user']), (False, False, False, None))

    def test_only_a_director_changes_it_once_set(self):
        store[appmod.DIRECTOR_PIN_PATH] = generate_password_hash('2222')
        self.login('1111')
        self.assertEqual(self.c.post('/api/director/set-pin', json={'pin': '4444'}).status_code, 403)
        other = appmod.app.test_client()
        self.login('2222', other)
        self.assertEqual(other.post('/api/director/set-pin', json={'pin': '4444'}).status_code, 200)
        self.assertEqual(self.login('2222').status_code, 401)
        self.assertTrue(self.login('4444').get_json()['director'])

    def test_manager_pin_cannot_take_the_director_pin(self):
        store[appmod.DIRECTOR_PIN_PATH] = generate_password_hash('2222')
        self.login('1111')
        self.assertEqual(self.c.post('/api/manager/set-pin', json={'pin': '2222'}).status_code, 400)
        self.assertEqual(self.c.post('/api/manager/set-pin', json={'pin': '5555'}).status_code, 200)
        # Each collision costs a guess against the login limit.
        self.assertEqual(len(appmod._all_login_failures), 1)


class NotesRouteTest(unittest.TestCase):
    def setUp(self):
        reset()
        store[appmod.DIRECTOR_PIN_PATH] = generate_password_hash('2222')
        os.environ[ls.TOKEN_ENV] = 'ABC123XYZ'
        self.real_fetch = ls.fetch_ratings
        self.notes = [
            {'id': 'r1', 'at': '2026-10-01T12:00', 'employee': 'Test Person', 'position': 'iPOS', 'leader': 'Test Leader', 'overall': 2.8, 'text': 'Greets every guest; rushes the close.'},
            {'id': 'r2', 'at': '2026-10-08T09:15', 'employee': 'test  person', 'position': 'Drinks', 'leader': 'Other Leader', 'overall': 3.0, 'text': 'Much faster on drinks.'},
            {'id': 'r3', 'at': '2026-10-05T18:00', 'employee': 'Someone Else', 'position': 'iPOS', 'leader': 'Test Leader', 'overall': 2.0, 'text': 'Not this person.'},
        ]
        ls.fetch_ratings = lambda token: {'ratings': [{'at': '2026-10-01T12:00'}], 'summary': {}, 'warnings': [], 'notes': list(self.notes)}

    def tearDown(self):
        ls.fetch_ratings = self.real_fetch
        os.environ.pop(ls.TOKEN_ENV, None)

    def client(self, pin):
        c = appmod.app.test_client()
        c.post('/api/manager/login', json={'pin': pin})
        return c

    def test_sync_keeps_notes_on_the_server(self):
        r = self.client('1111').post('/api/pea/levelset-sync')
        self.assertEqual(r.status_code, 200)
        self.assertNotIn('notes', r.get_json())                  # never to the page
        self.assertNotIn('notes', appmod._levelset_last['reply'])
        self.assertEqual(len(store[appmod.LEVELSET_NOTES_PATH]), 3)
        # Synced again: nothing doubles.
        appmod._levelset_last.update(at=0.0, reply=None)
        self.client('1111').post('/api/pea/levelset-sync')
        self.assertEqual(len(store[appmod.LEVELSET_NOTES_PATH]), 3)

    def test_directors_only_one_person_at_a_time(self):
        self.client('1111').post('/api/pea/levelset-sync')
        self.assertEqual(appmod.app.test_client().post('/api/pea/notes', json={'name': 'Test Person'}).status_code, 403)
        self.assertEqual(self.client('1111').post('/api/pea/notes', json={'name': 'Test Person'}).status_code, 403)
        d = self.client('2222')
        self.assertEqual(d.post('/api/pea/notes', json={}).status_code, 400)
        notes = d.post('/api/pea/notes', json={'name': ' TEST person '}).get_json()['notes']
        self.assertEqual([n['text'] for n in notes], ['Much faster on drinks.', 'Greets every guest; rushes the close.'])
        self.assertEqual(set(notes[0]), {'at', 'position', 'leader', 'overall', 'text'})

    def test_old_notes_pruned(self):
        store[appmod.LEVELSET_NOTES_PATH] = {'old': {'at': '2024-01-01T08:00', 'employee': 'Test Person', 'text': 'x'}, 'bad': 'nope'}
        self.client('1111').post('/api/pea/levelset-sync')
        kept = store[appmod.LEVELSET_NOTES_PATH]
        self.assertNotIn('old', kept)
        self.assertNotIn('bad', kept)
        self.assertEqual(len(kept), 3)

    def test_a_storage_failure_still_returns_the_ratings(self):
        def broken(path):
            if path == appmod.LEVELSET_NOTES_PATH:
                raise RuntimeError('firebase down')
            return FakeRef(path)
        c = self.client('1111')
        appmod.db.reference = broken
        r = c.post('/api/pea/levelset-sync')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.get_json()['ratings']), 1)


class LeaderProfileCardTest(unittest.TestCase):
    """A Team Lead's Levelset notes show on the Leaders profile too (Oct 16)."""
    def test_card_on_both_profiles(self):
        root = os.path.join(os.path.dirname(__file__), '..', 'static', 'js')
        with open(os.path.join(root, 'leaders.js'), encoding='utf-8') as f:
            ld = f.read()
        with open(os.path.join(root, 'team-pea.js'), encoding='utf-8') as f:
            tp = f.read()
        self.assertIn("tpLsCardHtml(ldPeaName(name))", ld)
        self.assertIn("${tpLsCardHtml(P.peaName)}", tp)
        # One painter fills every card for that person, wherever it is.
        self.assertIn("document.querySelectorAll('.tp-ls-card')", tp)
        self.assertNotIn("getElementById('tpLsCard')", tp)


if __name__ == '__main__':
    unittest.main()
