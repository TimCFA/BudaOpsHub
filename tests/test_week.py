"""Directors' Week (Tim, Nov 18 2026): a director's week mirrored from the
Google calendar they share with the hub, and the team's requests for their
time (week_api.py, static/js/week.js on the Calendar tab). This checks the
rules (what a block shows, who holds a slot), the API (who sees what, who may
do what, what goes to Google and what's stored where) and the wiring.

Run: python3 -m unittest discover tests
Firebase is a dict of paths (FakeRef); Google is FakeCalendar. Made-up names.
"""
import os
import sys
import unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
import week_api as W  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TZ = appmod.levelset_sync.STORE_TZ
CAL = 'abcdef0123456789@group.calendar.google.com'
store = {}


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


class FakeRef:
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


def at(days, hour, minute=0):
    """A store-local time `days` from today, as a datetime."""
    d = datetime.now(TZ).date() + timedelta(days=days)
    return datetime(d.year, d.month, d.day, hour, minute, tzinfo=TZ)


def ms(d):
    return int(d.timestamp() * 1000)


def gev(title, start, end, color=None, **extra):
    e = {'id': title, 'summary': title, 'start': {'dateTime': start.isoformat()}, 'end': {'dateTime': end.isoformat()}}
    if color:
        e['colorId'] = color
    e.update(extra)
    return e


class FakeCalendar:
    def __init__(self):
        self.events, self.inserted, self.deleted, self.down, self.lists = [], [], [], False, 0

    def email(self):
        return 'hub-robot@example.iam.gserviceaccount.com'

    def list(self, cal, start, end):
        self.lists += 1
        if self.down or cal != CAL:
            raise W.CalendarError(404 if not self.down else 0)
        return list(self.events)

    def insert(self, cal, body):
        if self.down:
            raise W.CalendarError(0)
        self.inserted.append((cal, body))
        return f'g{len(self.inserted)}'

    def delete(self, cal, event_id):
        self.deleted.append((cal, event_id))


class Rules(unittest.TestCase):
    def test_a_block_is_told_by_its_title_then_its_colour(self):
        self.assertEqual(W.block_type('Open door', None)['id'], 'open')
        self.assertEqual(W.block_type('open door (group)', '11')['id'], 'open')        # the title wins
        self.assertEqual(W.block_type('PEA window: Lunch', None)['id'], 'pea')
        self.assertEqual(W.block_type('Floor: lunch peak', None)['id'], 'peak')        # "peak" is not "pea"
        self.assertEqual(W.block_type('Floor support window', None)['id'], 'support')
        self.assertEqual(W.block_type('Thinking', '3')['id'], 'focus')
        self.assertEqual(W.block_type('', '9')['id'], 'open')
        self.assertIsNone(W.block_type('Dentist', None))
        self.assertIsNone(W.block_type('Something', '6'))

    def test_only_open_door_books_and_only_two_types_are_named(self):
        show = {t['id']: t['show'] for t in W.BLOCK_TYPES}
        self.assertEqual(show, {'open': 'book', 'pea': 'named', 'support': 'named', 'peak': 'busy', 'focus': 'busy',
                                'admin': 'busy', 'review': 'busy'})

    def test_blocks_hide_what_a_busy_block_is(self):
        b = W.blocks_from([gev('Focus: budget', at(1, 9), at(1, 11)), gev('Dentist', at(1, 12), at(1, 13)),
                           gev('Open door', at(1, 14), at(1, 15, 30)),
                           {'summary': 'All day', 'start': {'date': '2026-11-20'}, 'end': {'date': '2026-11-21'}},
                           gev('Gone', at(1, 16), at(1, 17), status='cancelled')], TZ)
        self.assertEqual([(x['type'], x['label']) for x in b], [('focus', 'Busy'), ('busy', 'Busy'), ('open', 'Open door')])
        self.assertEqual(len(W.slots_of(b[2])), 3)

    def test_first_request_keeps_a_slot_and_a_decline_frees_it(self):
        def ev(i, typ, by, rid, **data):
            return {'id': f'{i:013d}-aaaaaa', 'at': i, 'type': typ, 'by': by, 'byName': by, 'reqId': rid, 'data': data}
        evs = [ev(1, 'request', 'ana', 'r1', type='open', director='dee', slot=500),
               ev(2, 'request', 'ben', 'r2', type='open', director='dee', slot=500)]
        r = W.fold(evs)
        self.assertEqual((r['r1']['status'], r['r2']['status']), ('pending', 'lost'))
        evs.append(ev(3, 'decline', 'ana', 'r1', note='no'))           # only the director answers
        self.assertEqual(W.fold(evs)['r1']['status'], 'pending')
        evs.append(ev(4, 'decline', 'dee', 'r1', note='Try Thursday'))
        evs.append(ev(5, 'request', 'cy', 'r3', type='open', director='dee', slot=500))
        r = W.fold(evs)
        self.assertEqual((r['r1']['status'], r['r1']['reply'], r['r3']['status']), ('declined', 'Try Thursday', 'pending'))
        self.assertEqual(list(W.taken(r, 'dee')), [500])

    def test_request_types_are_data(self):
        self.assertEqual([t['id'] for t in W.REQUEST_TYPES], ['open', 'pea', 'staffing', 'talk'])
        self.assertTrue(all({'id', 'label', 'needs', 'hint'} <= set(t) for t in W.REQUEST_TYPES))


class Api(unittest.TestCase):
    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        store.clear()
        appmod._auth_read()
        ws = appmod.app.extensions['week_store']
        ws.reset()
        self.cal = FakeCalendar()
        real = appmod.app.extensions['week_calendar']
        for name in ('email', 'list', 'insert', 'delete'):
            setattr(real, name, getattr(self.cal, name))
        self.cal.events = [gev('Open door', at(1, 14), at(1, 15)), gev('Focus: budget', at(1, 9), at(1, 11)),
                           gev('PEA window', at(2, 11), at(2, 13)), gev('Open door', at(0, 23), at(0, 23, 30))]
        self.c = appmod.app.test_client()
        self.dee, self.ana, self.ben = (appmod._pass_key(n) for n in ('Dee Lopez', 'Ana Ruiz', 'Ben Cole'))
        self.slot = ms(at(1, 14))

    def as_(self, name=None, role=None, device=False):
        with self.c.session_transaction() as sess:
            sess.clear()
            if name:
                sess['user'] = {'name': name, 'role': role, 'via': 'pin'}
            if device:
                sess['device'] = {'id': 'd1'}
                store['secure/devices'] = {'d1': {'name': 'Counter'}}
                appmod._auth_read()

    def connect(self, live=True):
        self.as_('Dee Lopez', 'director')
        self.assertEqual(self.c.put('/api/week/calendar', json={'calendarId': CAL}).status_code, 200)
        if live:
            self.assertEqual(self.c.put('/api/week/live', json={'live': True}).status_code, 200)

    def state(self):
        r = self.c.get('/api/week/state')
        self.assertEqual(r.status_code, 200, r.get_json())
        return r.get_json()

    def ask(self, **body):
        return self.c.post('/api/week/requests', json=dict({'type': 'open', 'director': self.dee, 'slot': self.slot}, **body))

    # ----- connecting, and the switch -----
    def test_a_director_connects_a_shared_calendar_never_a_primary_one(self):
        self.as_('Dee Lopez', 'director')
        self.assertEqual(self.c.put('/api/week/calendar', json={'calendarId': 'dee.lopez@gmail.com'}).status_code, 400)
        self.assertEqual(self.c.put('/api/week/calendar', json={'calendarId': 'other0123456789@group.calendar.google.com'}).status_code, 409)
        self.assertNotIn(f'secure/week/directors/{self.dee}', store)
        self.connect(live=False)
        self.assertEqual(store[f'secure/week/directors/{self.dee}']['calendarId'], CAL)
        s = self.state()
        self.assertEqual(s['setup']['robot'], self.cal.email())
        self.assertTrue(s['setup']['connected'])
        self.as_('Ana Ruiz', 'lead')
        self.assertEqual(self.c.put('/api/week/calendar', json={'calendarId': CAL}).status_code, 403)
        self.assertEqual(self.c.put('/api/week/live', json={'live': True}).status_code, 403)

    def test_nothing_goes_to_the_team_until_a_director_turns_it_on(self):
        self.connect(live=False)
        self.assertEqual(len(self.state()['directors']), 1)            # the director sees their own
        self.as_('Ana Ruiz', 'lead')
        s = self.state()
        self.assertEqual((s['live'], s['directors']), (False, []))
        self.assertNotIn('setup', s)
        self.assertEqual(self.ask().status_code, 403)
        self.as_('Dee Lopez', 'director')
        self.c.put('/api/week/live', json={'live': True})
        self.as_('Ben Cole', 'member')
        self.assertEqual(len(self.state()['directors']), 1)

    def test_signed_out_sees_nothing_and_a_shared_device_looks_but_cant_ask(self):
        self.connect()
        self.as_()
        self.assertEqual(self.c.get('/api/week/state').status_code, 401)
        self.as_(device=True)
        self.assertEqual(len(self.state()['directors']), 1)
        self.assertEqual(self.ask().status_code, 401)

    # ----- what the team sees -----
    def test_the_team_sees_slots_names_and_busy_nothing_else(self):
        self.connect()
        self.as_('Ben Cole', 'member')
        s = self.state()
        days = {d['date']: d['blocks'] for d in s['directors'][0]['days']}
        tomorrow = days[at(1, 0).date().isoformat()]
        self.assertEqual([(b['label'], b['show']) for b in tomorrow], [('Busy', 'busy'), ('Open door', 'book')])
        self.assertNotIn('budget', str(s))
        self.assertNotIn('focus', str(s['directors']).lower())                     # not even which kind of busy
        self.as_('Dee Lopez', 'director')
        own = {d['date']: d['blocks'] for d in self.state()['directors'][0]['days']}[at(1, 0).date().isoformat()]
        self.assertEqual((own[0]['type'], own[0]['label'], own[0]['show']), ('focus', 'Focus', 'busy'))   # her own, as it is
        self.as_('Ben Cole', 'member')
        self.assertEqual([x['state'] for x in tomorrow[1]['slots']], ['open', 'open'])
        self.assertEqual(days[at(2, 0).date().isoformat()][0]['label'], 'PEA window')
        # Today is set in stone: its Open door slot shows, closed.
        self.assertEqual([x['state'] for x in days[at(0, 0).date().isoformat()][0]['slots']], ['closed'])
        self.assertEqual(s['bookFrom'], at(1, 0).date().isoformat())

    def test_the_calendar_is_read_once_then_kept(self):
        self.connect()
        n = self.cal.lists
        self.as_('Ben Cole', 'member')
        self.state(); self.state(); self.state()
        self.assertLessEqual(self.cal.lists - n, 1)

    def test_google_down_serves_the_last_copy_marked_stale(self):
        self.connect()
        self.as_('Ben Cole', 'member')
        self.state()
        self.cal.down = True
        appmod.app.extensions['week_store'].mirror[self.dee]['at'] = 0
        s = self.state()
        self.assertTrue(s['directors'][0]['stale'])
        self.assertTrue(s['directors'][0]['days'])

    # ----- asking -----
    def test_a_slot_asked_for_is_booked_to_everyone_else_with_no_name(self):
        self.connect()
        self.as_('Ana Ruiz', 'lead')
        self.assertEqual(self.ask(about='Coaching', note='My Saturday close').status_code, 200)
        mine = self.state()
        self.assertEqual(mine['mine'][0]['status'], 'pending')
        self.as_('Ben Cole', 'member')
        s = self.state()
        slots = [b for d in s['directors'][0]['days'] for b in d['blocks'] if b['show'] == 'book' and b['slots'][0]['at'] == self.slot][0]['slots']
        self.assertEqual([x['state'] for x in slots], ['booked', 'open'])
        self.assertNotIn('Ana', str(s))
        self.assertNotIn('Saturday close', str(s))
        self.assertEqual((s['mine'], s['inbox']), ([], []))
        self.assertEqual(self.ask().status_code, 409)                   # one person a slot
        self.assertEqual(self.ask(slot=self.slot + 30 * W.MIN).status_code, 200)
        self.assertEqual(len([k for k in store if k.startswith('week/events/')]), 2)   # one record each

    def test_a_group_block_takes_more_than_one(self):
        self.cal.events = [gev('Open door: group session', at(1, 14), at(1, 15))]
        self.connect()
        for name in ('Ana Ruiz', 'Ben Cole'):
            self.as_(name, 'member')
            self.assertEqual(self.ask().status_code, 200)

    def test_today_and_past_the_horizon_cant_be_booked(self):
        self.connect()
        self.as_('Ana Ruiz', 'lead')
        self.assertEqual(self.ask(slot=ms(at(0, 23))).status_code, 409)
        self.assertEqual(self.ask(slot=ms(at(1, 9))).status_code, 409)             # Focus, not Open door
        self.assertEqual(self.ask(type='pea', day=at(0, 0).date().isoformat(), daypart='Lunch (10:30-1:00)').status_code, 400)
        self.assertEqual(self.ask(type='pea', day=at(1, 0).date().isoformat(), daypart='Lunch (10:30-1:00)').status_code, 200)
        self.assertEqual(self.ask(type='staffing', day=at(1, 0).date().isoformat(), daypart='Nope', note='x').status_code, 400)
        self.assertEqual(self.ask(type='talk').status_code, 400)                    # say what it's about
        self.assertEqual(self.ask(type='talk', note='About my schedule').status_code, 200)
        self.assertEqual(self.ask(type='nope').status_code, 400)

    # ----- answering -----
    def test_accepting_a_slot_writes_it_to_the_directors_calendar(self):
        self.connect()
        self.as_('Ana Ruiz', 'lead')
        rid = self.ask(about='1:1').get_json()['id']
        self.assertEqual(self.c.post(f'/api/week/requests/{rid}/accept', json={}).status_code, 403)
        self.as_('Dee Lopez', 'director')
        self.assertEqual(self.c.get('/api/week/count').get_json()['count'], 1)
        inbox = self.state()['inbox']
        self.assertEqual((inbox[0]['byName'], inbox[0]['status']), ('Ana Ruiz', 'pending'))
        self.assertEqual(self.c.post(f'/api/week/requests/{rid}/accept', json={'note': 'See you then'}).status_code, 200)
        cal, body = self.cal.inserted[0]
        self.assertEqual(cal, CAL)
        self.assertEqual(body['summary'], 'Open door time: Ana Ruiz (1:1)')
        self.assertEqual(ms(datetime.fromisoformat(body['start']['dateTime'])), self.slot)
        self.assertEqual(body['extendedProperties']['private']['hubRequestType'], 'open')
        self.assertEqual(self.c.get('/api/week/count').get_json()['count'], 0)
        self.assertEqual(self.c.post(f'/api/week/requests/{rid}/accept', json={}).status_code, 409)
        self.as_('Ana Ruiz', 'lead')
        mine = self.state()['mine'][0]
        self.assertEqual((mine['status'], mine['reply']), ('accepted', 'See you then'))
        # She cancels: the slot opens again and the booking comes off Google.
        self.assertEqual(self.c.post(f'/api/week/requests/{rid}/cancel', json={}).status_code, 200)
        self.assertEqual(self.cal.deleted, [(CAL, 'g1')])
        self.as_('Ben Cole', 'member')
        self.assertEqual(self.ask().status_code, 200)

    def test_the_hubs_own_booking_isnt_drawn_as_a_block(self):
        self.cal.events.append(gev('Open door time: Ana Ruiz', at(1, 14), at(1, 14, 30),
                                   extendedProperties={'private': {'hubRequest': 'r1', 'hubRequestType': 'open'}}))
        self.connect()
        day = [d for d in self.state()['directors'][0]['days'] if d['date'] == at(1, 0).date().isoformat()][0]
        self.assertEqual([b['label'] for b in day['blocks']], ['Focus', 'Open door'])

    def test_google_refusing_the_booking_accepts_nothing(self):
        self.connect()
        self.as_('Ana Ruiz', 'lead')
        rid = self.ask().get_json()['id']
        self.as_('Dee Lopez', 'director')
        self.cal.down = True
        self.assertEqual(self.c.post(f'/api/week/requests/{rid}/accept', json={}).status_code, 502)
        self.cal.down = False
        self.assertEqual(self.state()['inbox'][0]['status'], 'pending')

    def test_a_pea_request_is_only_marked_and_a_decline_frees_the_slot(self):
        self.connect()
        self.as_('Ana Ruiz', 'lead')
        pea = self.ask(type='pea', day=at(2, 0).date().isoformat(), daypart='Lunch (10:30-1:00)').get_json()['id']
        slot = self.ask().get_json()['id']
        self.as_('Dee Lopez', 'director')
        self.assertEqual(self.c.post(f'/api/week/requests/{pea}/accept', json={}).status_code, 200)
        self.assertEqual(self.cal.inserted, [])                                    # the planning is the director's
        self.assertEqual(self.c.post(f'/api/week/requests/{slot}/decline', json={'note': 'Thursday at 2 works'}).status_code, 200)
        self.as_('Ben Cole', 'member')
        self.assertEqual(self.ask().status_code, 200)

    def test_need_to_talk_gets_a_time_back(self):
        self.connect()
        self.as_('Ana Ruiz', 'lead')
        rid = self.ask(type='talk', note='About my schedule').get_json()['id']
        self.as_('Dee Lopez', 'director')
        when = ms(at(3, 15))
        self.assertEqual(self.c.post(f'/api/week/requests/{rid}/accept', json={'when': when}).status_code, 200)
        self.assertEqual(ms(datetime.fromisoformat(self.cal.inserted[0][1]['start']['dateTime'])), when)
        self.as_('Ana Ruiz', 'lead')
        self.assertEqual(self.state()['mine'][0]['when'], when)
        self.as_('Ben Cole', 'member')
        self.assertNotIn('schedule', str(self.state()))                             # private to the two of them

    def test_someone_elses_request_cant_be_touched(self):
        self.connect()
        self.as_('Ana Ruiz', 'lead')
        rid = self.ask().get_json()['id']
        self.as_('Ben Cole', 'member')
        for action in ('accept', 'decline', 'cancel'):
            self.assertEqual(self.c.post(f'/api/week/requests/{rid}/{action}', json={}).status_code, 404)

    def test_a_directors_own_week_cant_be_asked_for_by_them(self):
        self.connect()
        self.assertEqual(self.ask().status_code, 400)

    def test_disconnecting_takes_the_page_away(self):
        self.connect()
        self.assertEqual(self.c.delete('/api/week/calendar').status_code, 200)
        self.as_('Ben Cole', 'member')
        self.assertEqual(self.state()['directors'], [])

    def test_never_a_saved_state_section_and_never_cached(self):
        self.assertFalse([k for k in appmod.STATE_SECTIONS if 'week' in str(k).lower()])
        self.connect()
        self.assertEqual(self.c.get('/api/week/state').headers.get('Cache-Control'), 'no-store')
        self.assertNotIn(CAL, str({k: v for k, v in store.items() if not k.startswith('secure/')}))


class Wiring(unittest.TestCase):
    def setUp(self):
        self.page, self.js = read('cfa-buda-ops-hub-complete.html'), read('static', 'js', 'week.js')

    def test_on_the_calendar_tab_in_the_rest_of_the_scripts(self):
        p = self.page
        self.assertIn('<link rel="stylesheet" href="/static/css/week.css">', p)
        self.assertIn('<script src="/static/js/week.js" defer></script>', p)
        self.assertLess(p.index('/static/js/bottom-nav.js'), p.index('/static/js/week.js'))     # not the first group
        view = p[p.index('id="calendarView"'):p.index('id="calendarView"') + 1200]
        for part in ('id="dwSwitch"', 'data-dw-page="week"', 'id="weekRoot"', 'id="calendarRoot"'):
            self.assertIn(part, view)
        self.assertIn('id="dwSwitch" role="tablist" aria-label="Calendar" hidden', view)        # nothing shows until there's a week
        self.assertIn("typeof dwActivate === 'function'", read('static', 'js', 'navigation.js'))

    def test_a_director_is_told_on_right_now_and_by_a_badge(self):
        rn, nav = read('static', 'js', 'right-now.js'), read('static', 'js', 'bottom-nav.js')
        self.assertIn('rnWeekRows()', rn)
        self.assertIn("what === 'week'", rn)
        self.assertIn('id="weekTabBadge"', self.page)
        self.assertIn("'weekTabBadge'", nav)

    def test_the_urgent_rule_is_on_the_page_and_the_sheet(self):
        self.assertGreaterEqual(self.js.count('Call or text'), 2)

    def test_no_emoji_and_everything_escaped(self):
        self.assertNotRegex(self.js + read('static', 'css', 'week.css'), '[\U0001F300-\U0001FAFF☀-➿]')
        for raw in ('${r.note}', '${r.byName}', '${dir.name}', '${r.reply}', '${f.error}'):
            self.assertNotIn(raw, self.js)

    def test_the_service_account_key_never_leaves_the_server(self):
        src = read('week_api.py')
        self.assertNotIn('private_key', src)
        self.assertEqual(src.count('client_email'), 1)          # the address to share with: not a secret


if __name__ == '__main__':
    unittest.main()
