"""Tasks: projects and what's delegated to whom (static/js/tasks.js, app.py
/api/tasks/update; Tim, Oct 27 2026).

Leaders (Team Leads, the Admin Team, directors) create projects and tasks
through the ordinary save; a Team Member or Trainer only marks a task that's
theirs done, or adds a note, through the endpoint. The page's sorting, due
words and Right Now row run in node.

Run: python3 -m unittest discover tests
"""
import json
import os
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
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

TASKS = [
    {'id': 't1', 'title': 'Deep clean the ice machine', 'to': 'Ana Ruiz', 'by': 'Casey Lead', 'projectId': '', 'due': '2026-10-28', 'status': 'open', 'createdAt': 1, 'notes': []},
    {'id': 't2', 'title': 'Order the lemonade cups', 'to': 'Noah Bennett', 'by': 'Casey Lead', 'projectId': '', 'due': '', 'status': 'open', 'createdAt': 2, 'notes': []},
]


def seed():
    store.clear()
    store['state/delegation'] = json.dumps({'teamProjects': [], 'teamTasks': TASKS})
    store['state/setups'] = json.dumps({})


def signed_in(c, name, role):
    with c.session_transaction() as sess:
        if role == 'manager':
            sess['manager'] = True
        else:
            sess['user'] = {'name': name, 'role': role}
    return c


def tasks_on_server():
    return json.loads(store['state/delegation'])['teamTasks']


class Sections(unittest.TestCase):
    def test_delegation_is_its_own_section_and_not_private(self):
        self.assertEqual(appmod.STATE_SECTIONS['delegation'], ['teamProjects', 'teamTasks'])
        self.assertNotIn('delegation', appmod.PRIVATE_SECTIONS)
        self.assertEqual(appmod.DELEGATE_KEYS, {'teamProjects', 'teamTasks'})
        for key in appmod.DELEGATE_KEYS:
            self.assertNotIn(key, appmod.MANAGER_ONLY_KEYS)


class Update(unittest.TestCase):
    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._cache.clear()
        appmod._cache_ready = False
        seed()

    def update(self, c, body):
        return c.post('/api/tasks/update', json=body)

    def test_nobody_signed_in_is_refused(self):
        r = self.update(appmod.app.test_client(), {'id': 't1', 'status': 'done'})
        self.assertEqual(r.status_code, 403)

    def test_the_person_it_is_for_marks_it_done_and_the_server_signs_it(self):
        c = signed_in(appmod.app.test_client(), 'Ana Ruiz', 'member')
        r = self.update(c, {'id': 't1', 'status': 'done'})
        self.assertEqual(r.status_code, 200, r.get_json())
        task = r.get_json()['task']
        self.assertEqual(task['status'], 'done')
        self.assertEqual(task['doneBy'], 'Ana Ruiz')
        self.assertGreater(task['doneAt'], 0)
        self.assertEqual(tasks_on_server()[0]['status'], 'done')
        # Open again: the done stamp goes.
        r = self.update(c, {'id': 't1', 'status': 'open'})
        self.assertEqual(r.get_json()['task']['status'], 'open')
        self.assertNotIn('doneBy', r.get_json()['task'])

    def test_a_name_spelled_longer_on_the_pin_list_still_matches(self):
        c = signed_in(appmod.app.test_client(), 'Ana Ruiz Lopez', 'member')
        r = self.update(c, {'id': 't1', 'status': 'done'})
        self.assertEqual(r.status_code, 200, r.get_json())

    def test_someone_elses_task_is_refused(self):
        c = signed_in(appmod.app.test_client(), 'Ana Ruiz', 'member')
        r = self.update(c, {'id': 't2', 'status': 'done'})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(tasks_on_server()[1]['status'], 'open')

    def test_a_note_is_added_and_signed(self):
        c = signed_in(appmod.app.test_client(), 'Noah Bennett', 'trainer')
        r = self.update(c, {'id': 't2', 'note': '  Cups are on back order until Friday  '})
        self.assertEqual(r.status_code, 200, r.get_json())
        notes = r.get_json()['task']['notes']
        self.assertEqual(len(notes), 1)
        self.assertEqual(notes[0]['text'], 'Cups are on back order until Friday')
        self.assertEqual(notes[0]['by'], 'Noah Bennett')

    def test_a_leader_may_update_anyones_task(self):
        c = signed_in(appmod.app.test_client(), 'Casey Lead', 'lead')
        r = self.update(c, {'id': 't2', 'status': 'done', 'note': 'Done on the morning truck'})
        self.assertEqual(r.status_code, 200, r.get_json())
        self.assertEqual(r.get_json()['task']['doneBy'], 'Casey Lead')
        self.assertEqual(len(r.get_json()['task']['notes']), 1)

    def test_bad_requests(self):
        c = signed_in(appmod.app.test_client(), 'Ana Ruiz', 'member')
        self.assertEqual(self.update(c, {'id': 't1'}).status_code, 400)
        self.assertEqual(self.update(c, {'id': 't1', 'status': 'later'}).status_code, 400)
        self.assertEqual(self.update(c, {'id': 'nope', 'status': 'done'}).status_code, 404)


class Saves(unittest.TestCase):
    """The ordinary save (/api/state/patch): leaders write the section, a
    team member's changes to it are dropped and the section comes back."""

    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._cache.clear()
        appmod._cache_ready = False
        seed()

    def patch(self, c, ops):
        return c.post('/api/state/patch', json={'patches': {'delegation': {'ver': None, 'ops': ops}}})

    def new_task_op(self, who):
        return {'o': 'arr', 'p': ['teamTasks'], 'add': [{'v': {'id': 't3', 'title': 'Restock the sauce wall', 'to': 'Ana Ruiz', 'by': who, 'status': 'open', 'createdAt': 3, 'notes': []}, 'n': 1, 'i': 2, 'end': True}]}

    def test_a_team_lead_adds_a_task_and_the_server_stamps_who(self):
        c = signed_in(appmod.app.test_client(), 'Casey Lead', 'lead')
        r = self.patch(c, [self.new_task_op('Someone Else')])
        self.assertEqual(r.status_code, 200, r.get_json())
        added = tasks_on_server()[2]
        self.assertEqual(added['title'], 'Restock the sauce wall')
        self.assertEqual(added['by'], 'Casey Lead')

    def test_the_admin_team_may_delegate_too(self):
        c = signed_in(appmod.app.test_client(), 'Ashley Admin', 'admin')
        r = self.patch(c, [self.new_task_op('Ashley Admin')])
        self.assertEqual(r.status_code, 200, r.get_json())
        self.assertEqual(len(tasks_on_server()), 3)

    def test_a_team_members_save_to_the_section_is_dropped(self):
        c = signed_in(appmod.app.test_client(), 'Ana Ruiz', 'member')
        done = [dict(TASKS[0], status='done'), TASKS[1]]
        r = self.patch(c, [{'o': 'set', 'p': ['teamTasks'], 'v': done}, self.new_task_op('Ana Ruiz')])
        self.assertEqual(r.status_code, 200, r.get_json())
        self.assertEqual(len(tasks_on_server()), 2)
        self.assertEqual(tasks_on_server()[0]['status'], 'open')
        self.assertIn('delegation', r.get_json().get('sections', {}))


RUNNER = os.path.join(ROOT, 'tests', 'tasks_runner.js')


def run(*ops, **extra):
    cases = [dict(op=op, **extra) for op in ops]
    out = subprocess.run(['node', RUNNER], input=json.dumps({'cases': cases}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


class Page(unittest.TestCase):
    """tasks.js in node: today is Tue Oct 27 2026, Ana Ruiz (Team Member) is signed in."""

    TASKS = [
        {'id': 'a', 'title': 'Late one', 'to': 'Ana Ruiz', 'by': 'Casey Lead', 'due': '2026-10-26', 'status': 'open', 'createdAt': 1},
        {'id': 'b', 'title': 'No date', 'to': 'Ana Ruiz', 'by': 'Casey Lead', 'due': '', 'status': 'open', 'createdAt': 2},
        {'id': 'c', 'title': 'Today one', 'to': 'Ana Ruiz Lopez', 'by': 'Casey Lead', 'due': '2026-10-27', 'status': 'open', 'createdAt': 3},
        {'id': 'd', 'title': 'Done one', 'to': 'Ana Ruiz', 'by': 'Casey Lead', 'due': '2026-10-20', 'status': 'done', 'createdAt': 4, 'doneAt': 5, 'doneBy': 'Ana Ruiz'},
        {'id': 'e', 'title': 'Noah’s', 'to': 'Noah Bennett', 'by': 'Casey Lead', 'due': '2026-10-28', 'status': 'open', 'createdAt': 6},
        {'id': 'f', 'title': 'Nobody’s yet', 'to': '', 'by': 'Casey Lead', 'due': '', 'status': 'open', 'createdAt': 7},
    ]

    def test_mine_is_sorted_overdue_first_then_by_due_and_matches_a_longer_spelling(self):
        got = run("c => { teamTasks = c.tasks; return tkSort(tkMine('Ana Ruiz')).map(t => t.id); }", tasks=self.TASKS)[0]
        self.assertEqual(got, ['a', 'c', 'b'])

    def test_due_words(self):
        got = run("c => c.tasks.map(t => tkDue(t).text)", tasks=self.TASKS)[0]
        self.assertEqual(got, ['Overdue · was Mon, Oct 26', '', 'Due today', 'Was due Tue, Oct 20', 'Due tomorrow', ''])
        self.assertEqual(run("c => tkDue({due: '2026-10-30', status: 'open'}).text")[0], 'Due Fri, Oct 30')

    def test_right_now_row_counts_what_is_waiting(self):
        got = run("c => { teamTasks = c.tasks; return [tkRightNowRow({name: 'Ana Ruiz'}), tkRightNowRow({name: 'Noah Bennett'}), tkRightNowRow({name: 'Nobody Here'}), tkRightNowRow({name: ''})]; }", tasks=self.TASKS)[0]
        self.assertEqual(got[0]['n'], '3')
        self.assertEqual(got[0]['text'], '3 tasks for you, 1 overdue')
        self.assertEqual(got[0]['tone'], 'bad')
        self.assertEqual(got[0]['go'], 'tasks:mine')
        self.assertEqual(got[1]['text'], 'Task for you: Noah’s')
        self.assertEqual(got[1]['tone'], '')
        self.assertIsNone(got[2])
        self.assertIsNone(got[3])

    def test_a_team_member_sees_their_own_list_with_spanish_and_no_delegating(self):
        html = run("c => { teamTasks = c.tasks; renderTasksView(); return doc.html; }", tasks=self.TASKS)[0]
        self.assertIn('Tus tareas', html)
        self.assertIn('3 tasks for you', html)
        self.assertIn('Late one', html)
        self.assertNotIn('Noah’s', html)
        self.assertNotIn('New task', html)
        self.assertNotIn('data-tk-view="team"', html)
        self.assertIn('data-tk-toggle="a"', html)

    def test_a_leader_sees_the_team_by_person_overdue_first(self):
        html = run("c => { role = 'lead'; name = 'Casey Lead'; teamTasks = c.tasks; tkView = 'team'; renderTasksView(); return doc.html; }", tasks=self.TASKS)[0]
        self.assertIn('New task', html)
        self.assertIn('5 open', html)
        self.assertIn('1 overdue', html)
        self.assertIn('1 not delegated yet', html)
        self.assertLess(html.index('Ana Ruiz'), html.index('Noah Bennett'))
        self.assertLess(html.index('Noah Bennett'), html.index('Not delegated yet'))

    def test_project_progress(self):
        got = run("""c => { teamProjects = [{id: 'p', name: 'Catering push', status: 'open'}]; teamTasks = c.tasks.map((t, i) => ({...t, projectId: i < 3 ? 'p' : ''})); return tkProgress(teamProjects[0]); }""", tasks=self.TASKS)[0]
        self.assertEqual((got['total'], got['done'], got['overdue'], got['pct']), (3, 0, 1, 0))

    def test_a_leaders_save_drops_done_tasks_older_than_the_keep(self):
        old = 1_700_000_000_000
        got = run("c => { role = 'lead'; teamTasks = c.tasks; tkSave(); return teamTasks.map(t => t.id); }",
                  tasks=[{'id': 'x', 'title': 'x', 'status': 'done', 'doneAt': old}, {'id': 'y', 'title': 'y', 'status': 'open'}])[0]
        self.assertEqual(got, ['y'])

    def test_signed_out_gets_the_sign_in_card(self):
        html = run("c => { role = 'none'; name = ''; renderTasksView(); return doc.html; }")[0]
        self.assertIn('data-tk-signin', html)
        self.assertNotIn('tk-chip', html)


if __name__ == '__main__':
    unittest.main()
