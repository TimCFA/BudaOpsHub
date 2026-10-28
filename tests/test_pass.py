"""The Pass (Tim, Oct 28 2026): delegation on the Tasks tab. pass_api.py
keeps the rules on the server (fold / apply / derive / clarity) and the page
keeps the same ones in static/js/pass-engine.js; this checks the rules, that
both sides fold the same events to the same tickets, and the API: who may do
what, what's stored where, and who sees what.

Run: python3 -m unittest discover tests
Firebase is a dict of paths (FakeRef).
"""
import json
import os
import re
import subprocess
import sys
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
import pass_api as P  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H = P.HOUR


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()
store = {}


class FakeRef:
    """Firebase as a dict of paths; a parent path reads its children."""

    def __init__(self, path):
        self.path = path.strip('/')

    def get(self):
        if self.path in store:
            return store[self.path]
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
        store[self.path] = value

    def delete(self):
        store.pop(self.path, None)


def ev(i, at, typ, by, task='t1', **data):
    return {'id': f'{at:013d}-{i:06d}', 'at': at, 'type': typ, 'by': by, 'taskId': task, 'data': data}


T0 = 1_793_000_000_000


def history():
    """A ticket through every step, and a second one cancelled."""
    return [
        ev(1, T0, 'created', 'boss', number=1, title='Reorganize dry storage', owner='ana', due=T0 + 30 * H, level=3, cadence='midpoint'),
        ev(2, T0 + 1 * H, 'backbrief', 'ben', summary='not the owner'),           # refused: not the owner
        ev(3, T0 + 2 * H, 'counter', 'ana', due=T0 + 40 * H, reason='off tomorrow'),
        ev(4, T0 + 3 * H, 'counter_accept', 'boss'),
        ev(5, T0 + 4 * H, 'backbrief', 'ana', summary='Every shelf dated by 2 PM'),
        ev(6, T0 + 5 * H, 'checkin', 'ana', health='at_risk', note='labels'),
        ev(7, T0 + 6 * H, 'submit', 'ana', evidence='done'),
        ev(8, T0 + 7 * H, 'return', 'boss', feedback='floor still has boxes'),
        ev(9, T0 + 8 * H, 'submit', 'ana', evidence='floor clear'),
        ev(10, T0 + 9 * H, 'verify', 'boss', rating='elite', feedback='great'),
        ev(11, T0 + 10 * H, 'cancel', 'boss'),                                  # refused: already closed
        ev(12, T0, 'created', 'boss', task='t2', number=2, title='Count cups', owner='ben', due=T0 + 5 * H),
        ev(13, T0 + 1 * H, 'reassign', 'boss', task='t2', owner='ana'),
        ev(14, T0 + 2 * H, 'cancel', 'boss', task='t2', reason='not needed'),
        ev(15, T0 + 3 * H, 'comment', 'ana', task='t2', text='ok'),
    ]


class Rules(unittest.TestCase):
    def test_a_ticket_through_every_step(self):
        t = P.fold(history())['t1']
        self.assertEqual(t['status'], 'verified')
        self.assertEqual((t['rating'], t['returns'], t['due'], t['dueChanges']), ('elite', 1, T0 + 40 * H, 1))
        self.assertTrue(t['onTime'])
        self.assertEqual(P.fold(history())['t2']['status'], 'cancelled')

    def test_only_the_right_person_at_the_right_step(self):
        t = P.fold(history()[:1])['t1']
        self.assertFalse(P.apply(dict(t), ev(2, T0 + H, 'backbrief', 'boss', summary='x')))      # the delegator can't hear it
        self.assertFalse(P.apply(dict(t), ev(2, T0 + H, 'submit', 'ana', evidence='x')))         # not heard yet
        self.assertFalse(P.apply(dict(t), ev(2, T0 + H, 'verify', 'boss')))                      # nothing turned in
        self.assertFalse(P.apply(dict(t), ev(2, T0 + H, 'backbrief', 'ana')))                    # saying nothing isn't saying it back
        self.assertTrue(P.apply(dict(t), ev(2, T0 + H, 'backbrief', 'ana', summary='x')))

    def test_moving_a_late_ticket_still_counts_late(self):
        evs = history()[:1] + [ev(2, T0 + H, 'backbrief', 'ana', summary='x'),
                               ev(3, T0 + 31 * H, 'edit', 'boss', due=T0 + 50 * H),
                               ev(4, T0 + 32 * H, 'submit', 'ana', evidence='x'),
                               ev(5, T0 + 33 * H, 'verify', 'boss')]
        t = P.fold(evs)['t1']
        self.assertTrue(t['lateExtension'])
        self.assertFalse(t['onTime'])

    def test_the_clock(self):
        t = P.fold(history()[:1] + [ev(2, T0 + 2 * H, 'backbrief', 'ana', summary='x')])['t1']
        self.assertEqual(P.derive(t, T0 + 3 * H)['nextCheckin'], T0 + 16 * H)       # halfway from heard to due
        self.assertFalse(P.derive(t, T0 + 3 * H)['checkinDue'])
        self.assertTrue(P.derive(t, T0 + 17 * H)['checkinDue'])
        self.assertTrue(P.derive(t, T0 + 31 * H)['late'])
        fresh = P.fold(history()[:1])['t1']
        self.assertFalse(P.derive(fresh, T0 + 11 * H)['unheard'])
        self.assertTrue(P.derive(fresh, T0 + 13 * H)['unheard'])                     # 12 hours without a word

    def test_clarity(self):
        now = T0
        good = {'owner': 'ana', 'title': 'Reorganize dry storage', 'outcome': 'Every shelf dated, oldest in front, by 2 PM',
                'intent': 'Truck comes Thursday', 'due': now + 20 * H, 'level': 3, 'cadence': 'midpoint'}
        self.assertEqual(P.clarity(good, now), 7)
        self.assertEqual(P.clarity({**good, 'outcome': 'Make it look nicer than it does'}, now), 6)   # not checkable
        self.assertEqual(P.clarity({**good, 'level': 1, 'cadence': 'none'}, now), 6)                   # low authority, no check-ins
        self.assertEqual(P.clarity({}, now), 1)                                                          # only "check-ins fit"

    def test_whats_waiting_on_someone(self):
        evs = history()[:1] + [ev(20, T0, 'created', 'ana', task='t3', number=3, title='Restock sauces', owner='boss', due=T0 + 2 * H)]
        tasks = P.fold(evs)
        self.assertEqual(P.waiting_on(tasks, 'ana', T0 + H), 1)          # say it back
        self.assertEqual(P.waiting_on(tasks, 'boss', T0 + H), 1)
        tasks = P.fold(history()[:7])
        self.assertEqual(P.waiting_on(tasks, 'boss', T0 + 7 * H), 1)     # turned in: verify it
        self.assertEqual(P.waiting_on(tasks, 'ana', T0 + 7 * H), 0)

    def test_the_page_folds_the_same_tickets(self):
        """pass-engine.js and pass_api.py on the same events."""
        evs = history()
        script = ("const E = require(%s); const t = E.fold(%s);"
                  "process.stdout.write(JSON.stringify(Object.fromEntries(Object.values(t).map(x => [x.id, "
                  "{status: x.status, owner: x.owner, due: x.due, level: x.level, returns: x.returns, rating: x.rating, onTime: x.onTime, "
                  "d: E.derive(x, %d), c: E.clarity({owner: 'a', title: x.title, outcome: 'Every shelf by 2 PM, all of it', intent: 'Truck day matters', due: x.due, level: x.level, cadence: x.cadence}, %d).score}]))));"
                  ) % (json.dumps(os.path.join(ROOT, 'static', 'js', 'pass-engine.js')), json.dumps(evs), T0 + 17 * H, T0)
        js = json.loads(subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout)
        for tid, t in P.fold(evs).items():
            d = P.derive(t, T0 + 17 * H)
            c = P.clarity({'owner': 'a', 'title': t['title'], 'outcome': 'Every shelf by 2 PM, all of it', 'intent': 'Truck day matters',
                           'due': t['due'], 'level': t['level'], 'cadence': t['cadence']}, T0)
            self.assertEqual({k: js[tid][k] for k in ('status', 'owner', 'due', 'level', 'returns', 'rating', 'onTime', 'c')},
                             {'status': t['status'], 'owner': t['owner'], 'due': t['due'], 'level': t['level'], 'returns': t['returns'],
                              'rating': t['rating'], 'onTime': t['onTime'], 'c': c}, tid)
            for k in ('late', 'checkinDue', 'unheard'):
                self.assertEqual(js[tid]['d'][k], d[k], (tid, k))

    def test_the_same_levels_check_ins_and_areas(self):
        eng = read('static', 'js', 'pass-engine.js')
        self.assertEqual(re.findall(r'n: (\d), name: "([^"]+)"', eng), [(str(k), v) for k, v in P.LEVELS.items()])
        self.assertEqual(tuple(re.findall(r'(\w+): "[^"]+"', eng[eng.index('const CADENCES'):eng.index('\n', eng.index('const CADENCES'))])), P.CADENCES)
        page = read('static', 'js', 'pass.js')
        areas = page[page.index('const AREAS'):page.index('\n', page.index('const AREAS'))]
        self.assertEqual(tuple(re.findall(r"'([^']+)'", areas)), P.AREAS)


class Api(unittest.TestCase):
    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        store.clear()
        store['secure/teamPins'] = {'k1': {'name': 'Ana Ruiz', 'role': 'lead'}, 'k2': {'name': 'Ben Cole', 'role': 'member'},
                                    'k3': {'name': 'Cy Dunn', 'role': 'trainer'}}
        appmod._auth_read()
        appmod.app.extensions['pass_store'].reset()
        self.c = appmod.app.test_client()
        self.ana, self.ben, self.cy = (appmod._pass_key(n) for n in ('Ana Ruiz', 'Ben Cole', 'Cy Dunn'))

    def as_(self, name=None, role=None, manager=False):
        with self.c.session_transaction() as sess:
            sess.clear()
            if manager:
                sess['manager'] = True
            if name:
                sess['user'] = {'name': name, 'role': role, 'via': 'pin'}

    def send(self, typ, task=None, **data):
        return self.c.post('/api/pass/events', json={'type': typ, 'taskId': task, 'data': data})

    def delegate(self, owner, **extra):
        body = {'title': 'Reorganize dry storage', 'outcome': 'Every shelf dated by 2 PM', 'intent': 'Truck comes Thursday',
                'owner': owner, 'due': int(time.time() * 1000) + 20 * H, 'level': 3, 'cadence': 'midpoint'}
        body.update(extra)
        return self.send('created', **body)

    def test_signed_out(self):
        self.assertEqual(self.c.get('/api/pass/state').status_code, 401)
        self.assertEqual(self.send('comment', text='x').status_code, 401)
        self.assertEqual(self.c.get('/api/pass/count').get_json(), {'count': 0})

    def test_people_are_the_pin_list_and_the_directors(self):
        self.as_(manager=True)
        d = self.c.get('/api/pass/state').get_json()
        self.assertEqual((d['me']['name'], d['me']['role'], d['me']['canDelegate'], d['me']['canEditRoster']), ('Director', 'manager', True, True))
        roles = {p['name']: p['role'] for p in d['people']}
        self.assertEqual((roles['Ana Ruiz'], roles['Ben Cole'], roles['Cy Dunn']), ('lead', 'member', 'trainer'))
        for seed in appmod.DIRECTORS_SEED:
            self.assertEqual(roles[seed], 'director')
        self.assertEqual({p['wip'] for p in d['people']}, {4})
        self.assertTrue(re.fullmatch(r'[0-9a-f]{20}', self.ana))
        self.assertEqual(appmod._pass_key('Ana  Ruiz '), appmod._pass_key('ana ruiz'))
        self.assertEqual(self.c.get('/api/pass/state').headers.get('Cache-Control'), 'no-store')

    def test_a_leader_on_the_leader_list_is_a_lead(self):
        store['secure/teamPins']['k2']['role'] = 'member'
        self.as_(manager=True)
        orig = appmod._leader_names
        appmod._leader_names = lambda: ['Ben Cole']
        try:
            roles = {p['name']: p['role'] for p in self.c.get('/api/pass/state').get_json()['people']}
        finally:
            appmod._leader_names = orig
        self.assertEqual(roles['Ben Cole'], 'lead')

    def test_a_ticket_from_hand_off_to_verified(self):
        self.as_('Ana Ruiz', 'lead')
        r = self.delegate(self.ben)
        self.assertEqual(r.status_code, 200, r.get_json())
        made = r.get_json()
        tid = made['taskId']
        self.assertEqual((made['by'], made['byName'], made['data']['number'], made['data']['ownerName'], made['data']['clarity']),
                         (self.ana, 'Ana Ruiz', 1, 'Ben Cole', 7))
        self.assertEqual(store[f"pass/events/{made['id']}"]['data']['title'], 'Reorganize dry storage')      # one record per event
        self.assertEqual(self.send('backbrief', tid, summary='mine').status_code, 409)                          # Ana can't say it back for Ben
        self.as_('Ben Cole', 'member')
        self.assertEqual(self.c.get('/api/pass/count').get_json()['count'], 1)
        self.assertEqual(self.send('backbrief', tid, summary='Every shelf dated by 2 PM').status_code, 200)
        self.assertEqual(self.send('checkin', tid, health='blocked', note='no labels').status_code, 200)
        self.assertEqual(self.send('submit', tid).status_code, 400)                                              # needs proof
        self.assertEqual(self.send('submit', tid, evidence='All dated').status_code, 200)
        self.assertEqual(self.send('verify', tid, rating='elite').status_code, 409)                              # Ben can't verify his own
        self.as_('Ana Ruiz', 'lead')
        self.assertEqual(self.c.get('/api/pass/count').get_json()['count'], 1)
        self.assertEqual(self.send('verify', tid, rating='elite', feedback='great').status_code, 200)
        evs = [e for e in store.values() if isinstance(e, dict) and e.get('taskId') == tid]
        self.assertEqual(P.fold(evs)[tid]['status'], 'verified')
        self.assertEqual(sorted(e['type'] for e in evs), ['backbrief', 'checkin', 'created', 'submit', 'verify'])   # refused steps aren't kept

    def test_who_hands_work_off(self):
        self.as_('Ben Cole', 'member')
        self.assertEqual(self.delegate(self.ana).status_code, 403)
        self.as_('Cy Dunn', 'trainer')
        self.assertEqual(self.delegate(self.ana).status_code, 403)
        self.as_('Ana Ruiz', 'lead')
        self.assertEqual(self.delegate(self.ana).status_code, 400)                          # not to yourself
        self.assertEqual(self.delegate('nobody').status_code, 400)                          # only someone on the lists
        self.assertEqual(self.delegate(self.ben, due=int(time.time() * 1000) - H).status_code, 400)
        self.assertEqual(self.delegate(self.ben, title='  ').status_code, 400)
        self.assertEqual(self.send('nonsense').status_code, 400)

    def test_members_see_only_their_own_tickets(self):
        self.as_('Ana Ruiz', 'lead')
        self.delegate(self.ben)
        self.delegate(self.cy, title='Coach two new hosts')
        self.as_('Ben Cole', 'member')
        d = self.c.get('/api/pass/state').get_json()
        self.assertEqual([e['data']['title'] for e in d['events']], ['Reorganize dry storage'])
        self.assertFalse(d['me']['canDelegate'])
        self.assertNotIn('wip', d['people'][0])
        self.as_('Ana Ruiz', 'lead')
        self.assertEqual(len(self.c.get('/api/pass/state').get_json()['events']), 2)       # leaders see the whole rail

    def test_since_returns_only_whats_new(self):
        self.as_('Ana Ruiz', 'lead')
        first = self.delegate(self.ben).get_json()
        cursor = self.c.get('/api/pass/state').get_json()['cursor']
        second = self.delegate(self.cy, title='Coach two new hosts').get_json()
        self.assertGreater(second['id'], first['id'])
        d = self.c.get('/api/pass/state?since=' + cursor).get_json()
        self.assertEqual(([e['id'] for e in d['events']], d['full']), ([second['id']], False))
        d = self.c.get('/api/pass/state?since=old:3').get_json()              # a cursor from before a restart
        self.assertEqual((len(d['events']), d['full']), (2, True))

    def test_the_other_server_during_a_deploy(self):
        """Two servers overlap for a minute on a deploy: what one writes, the
        other picks up from Firebase, and pages that already looked get it."""
        self.as_('Ana Ruiz', 'lead')
        mine = self.delegate(self.ben).get_json()
        cursor = self.c.get('/api/pass/state').get_json()['cursor']
        at = mine['at'] - 5                                                    # its clock a hair behind ours
        theirs = {'id': f'{at:013d}-abcdef', 'at': at, 'type': 'created', 'by': self.ana, 'byName': 'Ana Ruiz',
                  'taskId': f't{at:013d}-abcdef', 'data': {'title': 'Count cups', 'owner': self.cy, 'due': at + 9 * H, 'number': 2}}
        store[f"pass/events/{theirs['id']}"] = theirs
        self.as_('Cy Dunn', 'trainer')
        r = self.send('backbrief', theirs['taskId'], summary='All cups counted by 3')     # a ticket this server hadn't seen
        self.assertEqual(r.status_code, 200, r.get_json())
        self.as_('Ana Ruiz', 'lead')
        d = self.c.get('/api/pass/state?since=' + cursor).get_json()
        self.assertEqual(sorted(e['type'] for e in d['events']), ['backbrief', 'created'])   # older id, still sent

    def test_a_cold_start_reads_firebase(self):
        self.as_('Ana Ruiz', 'lead')
        made = self.delegate(self.ben).get_json()
        appmod.app.extensions['pass_store'].reset()
        d = self.c.get('/api/pass/state').get_json()
        self.assertEqual([e['id'] for e in d['events']], [made['id']])
        self.assertEqual(self.delegate(self.cy).get_json()['data']['number'], 2)

    def test_firebase_down(self):
        self.as_('Ana Ruiz', 'lead')

        class Down(FakeRef):
            def get(self):
                raise RuntimeError('down')

            def set(self, value):
                raise RuntimeError('down')
        appmod.db.reference = lambda path: Down(path)
        self.assertEqual(self.c.get('/api/pass/state').status_code, 503)
        appmod.db.reference = lambda path: FakeRef(path)
        self.c.get('/api/pass/state')
        appmod.db.reference = lambda path: Down(path)
        self.assertEqual(self.delegate(self.ben).status_code, 503)
        self.assertEqual(appmod.app.extensions['pass_store'].events, {})                    # nothing kept that wasn't written

    def test_a_photo_lives_apart(self):
        self.as_('Ana Ruiz', 'lead')
        tid = self.delegate(self.ben).get_json()['taskId']
        self.as_('Ben Cole', 'member')
        self.send('backbrief', tid, summary='x')
        jpeg = 'data:image/jpeg;base64,' + 'A' * 400
        sub = self.send('submit', tid, photo=jpeg).get_json()
        self.assertIs(sub['data']['photo'], True)
        self.assertIs(store[f"pass/events/{sub['id']}"]['data']['photo'], True)
        self.assertEqual(store[f"pass/photos/{sub['id']}"], jpeg)
        r = self.c.get(f"/api/pass/photo/{sub['id']}")
        self.assertEqual((r.status_code, r.mimetype), (200, 'image/jpeg'))
        self.as_('Cy Dunn', 'trainer')
        self.assertEqual(self.c.get(f"/api/pass/photo/{sub['id']}").status_code, 404)        # not their ticket
        self.as_('Ben Cole', 'member')
        self.assertEqual(self.send('comment', tid, text='x', photo='nope').status_code, 200)    # extra fields are dropped
        self.assertEqual(self.send('submit', tid, photo='data:text/html;base64,AAAA').status_code, 400)   # only an image
        self.assertEqual(self.send('submit', tid, evidence='again').status_code, 409)                      # already turned in

    def test_limits_are_for_directors(self):
        self.as_('Ana Ruiz', 'lead')
        self.assertEqual(self.c.put('/api/pass/people', json={'people': [{'id': self.ben, 'wip': 2}]}).status_code, 403)
        self.as_(manager=True)
        r = self.c.put('/api/pass/people', json={'people': [{'id': self.ana, 'wip': 99, 'area': 'Drive-Thru'}, {'id': 'ghost', 'wip': 2}]})
        self.assertEqual(r.status_code, 200)
        ana = next(p for p in r.get_json()['people'] if p['id'] == self.ana)
        self.assertEqual((ana['wip'], ana['area']), (20, 'Drive-Thru'))
        self.assertEqual(store[f'pass/people/{self.ana}'], {'wip': 20, 'area': 'Drive-Thru'})
        self.assertNotIn('pass/people/ghost', store)

    def test_a_named_director_is_themselves(self):
        with self.c.session_transaction() as sess:
            sess['manager'] = True
            sess['director'] = True
            sess['user'] = {'name': 'Dee Lopez', 'role': 'director', 'via': 'google'}
        me = self.c.get('/api/pass/state').get_json()['me']
        self.assertEqual((me['id'], me['role'], me['canEditRoster']), (appmod._pass_key('Dee Lopez'), 'director', True))


if __name__ == '__main__':
    unittest.main()
