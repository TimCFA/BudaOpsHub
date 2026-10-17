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
    """Paths as keys; a dict at a path is that path's children, and a child
    path (levelsetNotes/<key>) reads and writes inside that dict."""
    def __init__(self, path):
        self.path = path.strip('/')

    def _parent(self):
        # Nested only under a dict already stored at the top path (the notes
        # store); PIN hashes and the like stay flat keys.
        if '/' in self.path and self.path not in store:
            top, kid = self.path.split('/', 1)
            if isinstance(store.get(top), dict):
                return top, kid
        return None, None

    def get(self):
        top, kid = self._parent()
        if top is not None:
            return (store.get(top) or {}).get(kid)
        return store.get(self.path)

    def set(self, value):
        top, kid = self._parent()
        if top is not None:
            store.setdefault(top, {})[kid] = value
        else:
            store[self.path] = value

    def delete(self):
        top, kid = self._parent()
        if top is not None:
            (store.get(top) or {}).pop(kid, None)
        else:
            store.pop(self.path, None)

    def update(self, changes):
        top, kid = self._parent()
        if top is not None:
            rec = dict(store.setdefault(top, {}).get(kid) or {})
            for k, v in changes.items():
                if v is None:
                    rec.pop(k, None)
                else:
                    rec[k] = v
            store[top][kid] = rec
            return
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
        self.assertEqual(self.status(), {'isManager': True, 'isDirector': False, 'directorPinSet': False})
        self.assertEqual(self.c.post('/api/director/set-pin', json={'pin': '22'}).status_code, 400)
        r = self.c.post('/api/director/set-pin', json={'pin': '1111'})                                 # same as the manager PIN
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.c.post('/api/director/set-pin', json={'pin': '2222'}).status_code, 200)
        self.assertEqual(self.status(), {'isManager': True, 'isDirector': True, 'directorPinSet': True})

    def test_director_pin_signs_in_as_director(self):
        store[appmod.DIRECTOR_PIN_PATH] = generate_password_hash('2222')
        r = self.login('2222').get_json()
        self.assertEqual(r, {'success': True, 'director': True})
        self.assertTrue(self.status()['isDirector'])
        # The manager PIN on the same device drops director.
        self.assertEqual(self.login('1111').get_json(), {'success': True, 'director': False})
        self.assertFalse(self.status()['isDirector'])
        self.assertEqual(self.login('3333').status_code, 401)
        self.login('2222')
        self.c.post('/api/manager/logout')
        self.assertEqual(self.status(), {'isManager': False, 'isDirector': False, 'directorPinSet': False})

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
        self.assertEqual(set(notes[0]), {'at', 'position', 'leader', 'overall', 'text', 'key', 'tags'})
        self.assertEqual(notes[0]['tags'], [])
        self.assertNotIn('employee', notes[0])

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
        self.assertIn("tpLsCardHtml(ldPeaName(name), cards)", ld)
        self.assertIn("${tpLsCardHtml(P.peaName)}", tp)
        # One painter fills every card for that person, wherever it is.
        self.assertIn("document.querySelectorAll('.tp-ls-card')", tp)
        self.assertNotIn("getElementById('tpLsCard')", tp)


class NoteTagsTest(unittest.TestCase):
    """Directors tag the parts of a Levelset note that evidence a PEC pillar."""
    def setUp(self):
        reset()
        store[appmod.DIRECTOR_PIN_PATH] = generate_password_hash('2222')
        os.environ[ls.TOKEN_ENV] = 'ABC123XYZ'
        self.real_fetch = ls.fetch_ratings
        self.note = {'id': 'r1', 'at': '2026-10-01T12:00', 'employee': 'Test Person', 'position': 'Team Lead', 'leader': 'Test Leader', 'overall': 2.6,
                     'text': 'Strong commitment to pre-huddles with the captains.\nAdvocating for second-mile service.  Samples, cow, contests.'}
        ls.fetch_ratings = lambda token: {'ratings': [], 'summary': {}, 'warnings': [], 'notes': [dict(self.note)]}
        self.d = appmod.app.test_client()
        self.d.post('/api/manager/login', json={'pin': '2222'})
        self.m = appmod.app.test_client()
        self.m.post('/api/manager/login', json={'pin': '1111'})
        self.m.post('/api/pea/levelset-sync')
        self.key = self.d.post('/api/pea/notes', json={'name': 'Test Person'}).get_json()['notes'][0]['key']

    def tearDown(self):
        ls.fetch_ratings = self.real_fetch
        os.environ.pop(ls.TOKEN_ENV, None)

    def tag(self, c, **body):
        return c.post('/api/pea/notes/tag', json=dict({'key': self.key}, **body))

    def test_a_sentence_tagged_to_two_pillars_then_removed(self):
        r = self.tag(self.d, text='Strong commitment to pre-huddles with the captains.', pillars=['tl:engage', 'tl:zone'])
        self.assertEqual(r.status_code, 200, r.get_json())
        tags = r.get_json()['note']['tags']
        self.assertEqual(len(tags), 1)
        self.assertEqual(tags[0]['pillars'], ['tl:engage', 'tl:zone'])
        self.assertEqual(tags[0]['text'], 'Strong commitment to pre-huddles with the captains.')
        # Another part of the same note goes to a different pillar.
        r = self.tag(self.d, text='Advocating for second-mile service. Samples, cow, contests.', pillars=['tl:guest'])
        self.assertEqual(r.status_code, 200, r.get_json())     # whitespace in the note doesn't matter
        notes = self.d.post('/api/pea/notes', json={'name': 'Test Person'}).get_json()['notes']
        self.assertEqual(len(notes[0]['tags']), 2)
        # Two sentences that aren't next to each other, as the picker sends them.
        r = self.tag(self.d, parts=['Strong commitment to pre-huddles with the captains.', 'Samples, cow, contests.'], pillars=['tl:standards'])
        self.assertEqual(r.status_code, 200, r.get_json())
        self.assertEqual(r.get_json()['note']['tags'][-1]['text'], 'Strong commitment to pre-huddles with the captains. … Samples, cow, contests.')
        self.assertEqual(self.tag(self.d, parts=['Samples, cow, contests.', 'Not in it.'], pillars=['tl:zone']).status_code, 400)
        # Remove one.
        r = self.d.delete('/api/pea/notes/tag', json={'key': self.key, 'tagId': tags[0]['id']})
        self.assertEqual(r.status_code, 200)
        self.assertEqual([t['pillars'] for t in r.get_json()['note']['tags']], [['tl:guest'], ['tl:standards']])

    def test_only_the_raters_words_and_real_pillars(self):
        self.assertEqual(self.tag(self.d, text='Something the director made up.', pillars=['tl:engage']).status_code, 400)
        self.assertEqual(self.tag(self.d, text='', pillars=['tl:engage']).status_code, 400)
        self.assertEqual(self.tag(self.d, text='Samples, cow, contests.', pillars=[]).status_code, 400)
        self.assertEqual(self.tag(self.d, text='Samples, cow, contests.', pillars=['<script>']).status_code, 400)
        self.assertEqual(self.d.post('/api/pea/notes/tag', json={'key': 'nope', 'text': 'x', 'pillars': ['tl:zone']}).status_code, 400)
        self.assertEqual(self.d.post('/api/pea/notes/tag', json={'key': '0' * 20, 'text': 'x', 'pillars': ['tl:zone']}).status_code, 404)
        self.assertEqual(store[appmod.LEVELSET_NOTES_PATH][self.key].get('tags'), None)

    def test_managers_and_signed_out_cannot_tag(self):
        self.assertEqual(self.tag(self.m, text='Samples, cow, contests.', pillars=['tl:guest']).status_code, 403)
        self.assertEqual(self.tag(appmod.app.test_client(), text='Samples, cow, contests.', pillars=['tl:guest']).status_code, 403)

    def test_a_resync_keeps_the_tags(self):
        self.tag(self.d, text='Samples, cow, contests.', pillars=['tl:guest'])
        # The rater edits the note in Levelset (the hub sees a changed text), and syncs again.
        self.note['text'] = self.note['text'] + ' Also the cow appearance.'
        appmod._levelset_last.update(at=0.0, reply=None)
        self.assertEqual(self.m.post('/api/pea/levelset-sync').status_code, 200)
        rec = store[appmod.LEVELSET_NOTES_PATH][self.key]
        self.assertIn('Also the cow appearance.', rec['text'])
        self.assertEqual([t['pillars'] for t in rec['tags']], [['tl:guest']])
        # An unchanged note isn't rewritten at all.
        appmod._levelset_last.update(at=0.0, reply=None)
        self.m.post('/api/pea/levelset-sync')
        self.assertEqual([t['pillars'] for t in store[appmod.LEVELSET_NOTES_PATH][self.key]['tags']], [['tl:guest']])


if __name__ == '__main__':
    unittest.main()
