"""Tasks (Tim, Oct 27 2026): delegation for the leadership team, on its own
tab. The module is taskhub/ (tests/test_taskhub.py covers the rules); this
checks it's wired into the hub: the tab, the view, the scripts, and that the
server tells it who's signed in from the hub's own session.

Run: python3 -m unittest discover tests
Firebase is a dict (the FakeRef from test_accounts).
"""
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402

store = {}


class FakeRef:
    """Firebase as a dict of paths (as in test_accounts), with children under taskhub/."""

    def __init__(self, path):
        self.path = path.strip('/')

    def _nested(self):
        if '/' in self.path and self.path not in store:
            top, kid = self.path.rsplit('/', 1)
            if isinstance(store.get(top), dict):
                return top, kid
        return None, None

    def get(self):
        if self.path in store:
            return store[self.path]
        top, kid = self._nested()
        if top:
            return store[top].get(kid)
        # A whole tree (taskhub/) as its nested paths.
        out = {}
        for p, v in store.items():
            if p.startswith(self.path + '/'):
                node = out
                parts = p[len(self.path) + 1:].split('/')
                for part in parts[:-1]:
                    node = node.setdefault(part, {})
                node[parts[-1]] = v
        return out or None

    def set(self, value):
        top, kid = self._nested()
        if top:
            store[top][kid] = value
        else:
            store[self.path] = value

    def delete(self):
        top, kid = self._nested()
        if top:
            store[top].pop(kid, None)
        else:
            store.pop(self.path, None)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


PAGE = read('cfa-buda-ops-hub-complete.html')


class Wiring(unittest.TestCase):
    def test_tab_and_view(self):
        tab = re.search(r'<button[^>]*class="tab"[^>]*aria-controls="tasksView" data-view="tasks">Tasks<span class="th-tab-badge" id="tasksTabBadge" hidden></span> <span class="sub"><i>Tareas</i></span></button>', PAGE)
        self.assertTrue(tab)
        self.assertNotIn('launch-only', tab.group(0))
        self.assertNotIn('full-only', tab.group(0))     # the team's tab on both sites
        self.assertIn('<div class="view" id="tasksView" data-taskhub-api="/taskhub/api"></div>', PAGE)
        self.assertIn('<link rel="stylesheet" href="/static/css/taskhub.css">', PAGE)
        self.assertIn('<script src="/static/js/taskhub.js"></script>', PAGE)
        self.assertLess(PAGE.index('/static/css/dark.css'), PAGE.index('/static/css/taskhub.css'))   # its dark rules come after the theme's

    def test_opening_the_tab_mounts_it_and_launch_mode_allows_it(self):
        self.assertIn("if(view === 'tasks' && typeof thActivate === 'function') thActivate();", read('static', 'js', 'navigation.js'))
        launch = read('static', 'js', 'launch-mode.js')
        views = launch[launch.index('const LAUNCH_VIEWS'):launch.index('];', launch.index('const LAUNCH_VIEWS'))]
        self.assertIn("'tasks'", views)
        js = read('static', 'js', 'taskhub.js')
        self.assertIn('window.thActivate = activate;', js)
        self.assertNotIn('innerHTML = ', js.replace("node.innerHTML = v;", ''))   # people's text never goes in as HTML

    def test_styles_use_the_theme_tokens(self):
        css = read('static', 'css', 'taskhub.css')
        for token in ('var(--cfa-red', 'var(--cfa-navy', 'var(--cfa-white', 'var(--font-display', 'var(--font-ui', 'html[data-theme="dark"]'):
            self.assertIn(token, css)
        self.assertNotIn('emoji', css)


class Server(unittest.TestCase):
    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        store.clear()
        store['secure/teamPins'] = {'k1': {'name': 'Ana Ruiz', 'role': 'lead'}, 'k2': {'name': 'Ben Cole', 'role': 'member'}}
        appmod._auth_read()
        self.c = appmod.app.test_client()
        # A fresh TaskHub store per test; it reads Firebase (the dict) once.
        from taskhub.store import FirebaseBackend, Store
        appmod._taskhub.store = Store(FirebaseBackend(lambda p: FakeRef(p)))

    def test_nobody_signed_in(self):
        r = self.c.get('/taskhub/api/bootstrap')
        self.assertEqual(r.status_code, 200)
        d = r.get_json()
        self.assertEqual((d['me'], d['host']), (None, True))
        self.assertEqual(self.c.post('/taskhub/api/tasks', json={'title': 'x'}).status_code, 401)

    def test_people_are_the_pin_list_and_the_directors(self):
        names = {m['name']: m['role'] for m in self.c.get('/taskhub/api/bootstrap').get_json()['members']}
        self.assertEqual(names['Ana Ruiz'], 'leader')
        self.assertEqual(names['Ben Cole'], 'member')
        for seed in appmod.DIRECTORS_SEED:
            self.assertEqual(names[seed], 'admin')
        for m in self.c.get('/taskhub/api/members').get_json():
            self.assertEqual(m['id'], appmod._taskhub_key(m['name']))   # a Firebase-safe key from the name
        self.assertEqual(appmod._taskhub_key('Ana  Ruiz '), appmod._taskhub_key('ana ruiz'))
        self.assertTrue(re.fullmatch(r'[0-9a-f]{20}', appmod._taskhub_key('J.R. Smith')))

    def test_a_team_pin_session_is_that_person(self):
        with self.c.session_transaction() as sess:
            sess['user'] = {'name': 'Ana Ruiz', 'role': 'lead', 'via': 'pin'}
        d = self.c.get('/taskhub/api/bootstrap').get_json()
        self.assertEqual((d['me']['id'], d['me']['name'], d['me']['role']), (appmod._taskhub_key('Ana Ruiz'), 'Ana Ruiz', 'leader'))
        b = self.c.post('/taskhub/api/boards', json={'name': 'Ops'}).get_json()
        t = self.c.post('/taskhub/api/tasks', json={'board_id': b['id'], 'title': 'Order strips', 'assignee_id': appmod._taskhub_key('Ben Cole')}).get_json()
        self.assertEqual(t['created_by'], appmod._taskhub_key('Ana Ruiz'))
        self.assertEqual(store[f"taskhub/tasks/{t['id']}"]['title'], 'Order strips')     # in Firebase, one record
        with self.c.session_transaction() as sess:
            sess['user'] = {'name': 'Ben Cole', 'role': 'member', 'via': 'pin'}
        mine = self.c.get('/taskhub/api/my-tasks?today=2026-10-27').get_json()
        self.assertEqual([x['title'] for x in mine['assigned']['none']], ['Order strips'])
        self.assertEqual(self.c.get('/taskhub/api/notifications').get_json()['unread'], 1)

    def test_the_shared_manager_pin_is_the_director(self):
        with self.c.session_transaction() as sess:
            sess['manager'] = True
        d = self.c.get('/taskhub/api/bootstrap').get_json()
        self.assertEqual((d['me']['name'], d['me']['role']), ('Director', 'admin'))

    def test_api_replies_are_never_cached(self):
        self.assertEqual(self.c.get('/taskhub/api/boards').headers['Cache-Control'], 'no-store')


if __name__ == '__main__':
    unittest.main()
