"""Huddle (Tim, Nov 18 2026): huddle_api.py. The focus for the week and the
month, the pre-huddle and the post-huddle for each daypart, when each opens,
who the Lead Captain is (from Set Ups) and who may do what.

Run: python3 -m unittest discover tests
Firebase is a dict of paths (FakeRef); the clock is set by each test. Every
name here is made up.
"""
import os
import re
import sys
import unittest
from datetime import date, datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
import huddle_api as HA  # noqa: E402
import timers_api as TA  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TZ = ZoneInfo('America/Chicago')
store = {}
LUNCH, BREAKFAST, DINNER = 'Lunch (10:30-2:00)', 'Breakfast (6:00-10:30)', 'Dinner (5:00-10:00)'
WED, FRI, SUN = 18, 20, 22          # Nov 2026


class FakeRef:
    def __init__(self, path):
        self.path = path.strip('/')

    def get(self):
        if self.path in store:
            return store[self.path]
        out = {}
        for p, v in store.items():
            if p.startswith(self.path + '/'):
                out[p[len(self.path) + 1:]] = v
        return out or None

    def set(self, value):
        store[self.path] = value


class Clock:
    t = 0.0

    @classmethod
    def time(cls):
        return cls.t


def ms(day, hhmm):
    h, m = map(int, hhmm.split(':'))
    return int(datetime(2026, 11, day, h, m, tzinfo=TZ).timestamp() * 1000)


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


PRE = {'daypart': LUNCH, 'purpose': 'Serve guests well', 'priority': 'Speed of service',
       'goals': [{'kind': 'pec', 'text': 'Drive-thru under 3:00 through the rush', 'target': '3:00', 'focus': 'week'},
                 {'kind': 'lead', 'text': 'Give two pieces of feedback on the spot'},
                 {'kind': 'system', 'text': 'Zone Resets', 'owner': 'Grace Kim'}],
       'develop': {'who': 'Caleb Ortiz', 'skill': 'Calling out orders at the window', 'pea': True}}


class Rules(unittest.TestCase):
    def test_dayparts_are_know_the_numbers(self):
        js = read('static', 'js', 'know-numbers.js')
        block = js[js.index('const numbersDayparts'):js.index('];', js.index('const numbersDayparts'))]
        self.assertEqual(re.findall(r"name: '([^']+)', time: '([^']+)'", block), HA.DAYPARTS)

    def test_every_set_ups_daypart_falls_in_one_huddle(self):
        got = [HA.set_up_dayparts(n) for n, _ in HA.DAYPARTS]
        self.assertEqual([x for g in got for x in g], [n for n, _ in TA.FOH_DAYPARTS])
        self.assertEqual(got[1], ['Lunch (10:30-1:00)', 'Transition (1:00-2:00)'])

    def test_windows_end_at_the_next_start_and_at_closing(self):
        h = TA.DEFAULT_CONFIG['hours']
        w = HA.windows(date(2026, 11, WED), h, TZ)
        self.assertEqual(w[1], (LUNCH, ms(WED, '10:30'), ms(WED, '14:00')))
        self.assertEqual(w[3][2], ms(WED, '22:00'))
        self.assertEqual(HA.windows(date(2026, 11, FRI), h, TZ)[3][2], ms(FRI, '23:00'))     # open late
        self.assertEqual(HA.windows(date(2026, 11, SUN), h, TZ), [])                         # closed

    def test_week_and_month(self):
        self.assertEqual(HA.week_of(date(2026, 11, 21)), '2026-11-16')      # Saturday, back to its Monday
        self.assertEqual(HA.month_of(date(2026, 11, 21)), '2026-11')

    def test_fold_keeps_the_latest_and_a_post_needs_a_pre(self):
        key = {'date': '2026-11-18', 'side': 'foh', 'daypart': LUNCH}
        ev = lambda i, typ, **d: {'id': f'{i:013d}-a', 'at': i, 'type': typ, 'by': 'Maya Torres', 'data': d}
        f = HA.fold([ev(1, 'post', **key, results={}), ev(2, 'pre', **key, priority='A', goals=[]),
                     ev(3, 'pre', **key, priority='B', goals=[]),
                     ev(4, 'focus', scope='week', period='2026-11-16', text='Speed'),
                     ev(5, 'focus', scope='week', period='2026-11-16', text='')])
        h = f['huddles']['2026-11-18|foh|' + LUNCH]
        self.assertEqual((h['pre']['priority'], h['pre']['first'], h['post']), ('B', 2, None))
        self.assertEqual(f['focus'], {})                                    # cleared


class Api(unittest.TestCase):
    def setUp(self):
        store.clear()
        self.posa = {}
        self.was = (appmod.db.reference, appmod._read_sections, HA.time)     # put back after: other tests use the real ones
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._read_sections = lambda: {'setups': {'posAssignments': self.posa}}
        HA.time = Clock
        appmod.app.extensions['huddle_store'].reset()
        self.c = appmod.app.test_client()
        self.as_('Maya Torres', 'lead')
        self.at(WED, '10:15')

    def tearDown(self):
        appmod.db.reference, appmod._read_sections, HA.time = self.was
        appmod.app.extensions['huddle_store'].reset()

    def at(self, day, hhmm):
        Clock.t = ms(day, hhmm) / 1000

    def as_(self, name=None, role=None, manager=False):
        with self.c.session_transaction() as s:
            s.clear()
            if name:
                s['user'] = {'name': name, 'role': role, 'via': 'pin'}
            if manager:
                s['manager'] = True

    def send(self, typ, **data):
        return self.c.post('/api/huddle/events', json={'type': typ, 'data': data})

    def state(self, day=None):
        return self.c.get('/api/huddle/state' + (f'?date=2026-11-{day}' if day else ''))

    def part(self, name=LUNCH, day=None):
        return next(d for d in self.state(day).get_json()['dayparts'] if d['name'] == name)

    def events(self):
        return sorted((v for k, v in store.items() if k.startswith('huddle/events/')), key=lambda e: e['id'])

    # ----- who -----

    def test_team_members_and_signed_out_devices_are_refused(self):
        for who in ((None, None), ('Caleb Ortiz', 'member'), ('Ivy Chen', 'trainer')):
            self.as_(*who)
            self.assertEqual(self.state().status_code, 403)
            self.assertEqual(self.send('pre', **PRE).status_code, 403)
        self.assertEqual(self.events(), [])

    def test_leads_directors_and_the_manager_pin_get_in(self):
        for who in (('Maya Torres', 'lead'), ('Dana Reyes', 'director'), ('Sam Admin', 'admin')):
            self.as_(*who)
            self.assertEqual(self.state().status_code, 200)
        self.as_(manager=True)
        self.assertEqual(self.state().get_json()['me'], {'name': 'Director', 'role': 'manager', 'canFocus': True})

    # ----- the day -----

    def test_a_day_has_the_four_dayparts_with_set_ups_people(self):
        self.posa.update({
            'foh||2026-11-18||Lunch (10:30-1:00)||Lead Captain': 'Maya Torres',
            'foh||2026-11-18||Transition (1:00-2:00)||Lead Captain': 'Noah Bennett / Maya Torres',
            'foh||2026-11-18||Lunch (10:30-1:00)||Window': 'Caleb Ortiz',
            'foh||2026-11-18||Dinner (5:00-8:00)||Window': 'Someone Else',
            'boh||2026-11-18||Lunch (10:30-1:00)||Grill': 'Kitchen Person',
            'foh||2026-11-17||Lunch (10:30-1:00)||Window': 'Yesterday Person',
        })
        j = self.state().get_json()
        self.assertEqual((j['today'], j['date'], j['week'], j['month']), ('2026-11-18', '2026-11-18', '2026-11-16', '2026-11'))
        self.assertEqual([d['name'] for d in j['dayparts']], [n for n, _ in HA.DAYPARTS])
        lunch = j['dayparts'][1]
        self.assertEqual(lunch['leads'], ['Maya Torres', 'Noah Bennett'])
        self.assertEqual(lunch['people'], ['Caleb Ortiz', 'Maya Torres', 'Noah Bennett'])
        self.assertEqual((lunch['start'], lunch['end'], lunch['preOpens']), (ms(WED, '10:30'), ms(WED, '14:00'), ms(WED, '10:00')))
        self.assertEqual((lunch['pre'], lunch['post'], lunch['score']), (None, None, None))

    def test_a_closed_day_has_no_dayparts(self):
        self.assertEqual(self.state(SUN).get_json()['dayparts'], [])

    # ----- the pre-huddle -----

    def test_pre_huddle_saves_the_card(self):
        r = self.send('pre', **PRE)
        self.assertEqual(r.status_code, 200)
        pre = self.part()['pre']
        self.assertEqual((pre['by'], pre['purpose'], pre['priority']), ('Maya Torres', 'Serve guests well', 'Speed of service'))
        self.assertEqual([(g['id'], g['kind'], g['owner'], g['focus'], g['target']) for g in pre['goals']],
                         [('g1', 'pec', 'Maya Torres', 'week', '3:00'), ('g2', 'lead', 'Maya Torres', '', ''), ('g3', 'system', 'Grace Kim', '', '')])
        self.assertEqual(pre['develop'], {'who': 'Caleb Ortiz', 'skill': 'Calling out orders at the window', 'pea': True})
        ev = self.events()
        self.assertEqual(len(ev), 1)
        self.assertEqual((ev[0]['type'], ev[0]['data']['date'], ev[0]['data']['side'], ev[0]['data']['daypart']), ('pre', '2026-11-18', 'foh', LUNCH))

    def test_pre_huddle_opens_thirty_minutes_before(self):
        self.at(WED, '09:59')
        r = self.send('pre', **PRE)
        self.assertEqual(r.status_code, 400)
        self.assertIn('30 minutes', r.get_json()['error'])
        self.at(WED, '10:00')
        self.assertEqual(self.send('pre', **PRE).status_code, 200)

    def test_a_missed_pre_huddle_can_be_filled_in_later_that_day_only(self):
        self.at(WED, '19:00')
        self.assertEqual(self.send('pre', **PRE).status_code, 200)
        self.at(19, '08:00')
        self.assertEqual(self.send('pre', **{**PRE, 'date': '2026-11-18'}).status_code, 400)

    def test_pre_huddle_needs_a_purpose_a_priority_and_a_goal(self):
        for drop in ({'purpose': ''}, {'priority': ' '}, {'goals': []}, {'goals': [{'text': ''}]}):
            self.assertEqual(self.send('pre', **{**PRE, **drop}).status_code, 400, drop)
        four = {'goals': [{'text': f'Goal {i}'} for i in range(4)]}
        self.assertEqual(self.send('pre', **{**PRE, **four}).status_code, 400)
        self.assertEqual(self.send('pre', **{**PRE, 'daypart': 'Brunch'}).status_code, 400)
        self.assertEqual(self.events(), [])

    def test_saving_again_is_a_new_record_and_the_latest_stands(self):
        self.send('pre', **PRE)
        self.at(WED, '10:20')
        self.send('pre', **{**PRE, 'priority': 'Cleanliness'})
        pre = self.part()['pre']
        self.assertEqual((pre['priority'], pre['first'] < pre['at']), ('Cleanliness', True))
        self.assertEqual(len(self.events()), 2)

    def test_what_people_type_is_cut_to_size(self):
        self.send('pre', **{**PRE, 'purpose': 'x' * 500, 'develop': {'who': '', 'skill': 'ignored'}})
        pre = self.part()['pre']
        self.assertEqual((len(pre['purpose']), pre['develop']), (140, None))

    # ----- the post-huddle -----

    def post(self, **over):
        return self.send('post', **{'daypart': LUNCH,
                                    'results': {'g1': {'result': 'hit', 'why': 'Held 2:48'}, 'g2': {'result': 'partly'}, 'g3': {'result': 'missed', 'why': 'Short two at 1pm'}},
                                    'recognition': {'who': 'Caleb Ortiz', 'what': 'Kept the window moving'},
                                    'handoff': 'Lemonade is low, more is thawing', **over})

    def test_post_huddle_closes_it(self):
        self.send('pre', **PRE)
        self.assertEqual(self.post().status_code, 400)            # the daypart hasn't started
        self.at(WED, '14:05')
        self.assertEqual(self.post().status_code, 200)
        d = self.part()
        self.assertEqual(d['score'], {'goals': 3, 'hit': 1, 'partly': 1, 'missed': 1})
        self.assertEqual(d['post']['results']['g2'], {'result': 'partly', 'why': ''})
        self.assertEqual((d['post']['recognition']['who'], d['post']['handoff'], d['post']['by']),
                         ('Caleb Ortiz', 'Lemonade is low, more is thawing', 'Maya Torres'))
        self.assertEqual(self.send('pre', **PRE).status_code, 400)   # closed: the goals don't move

    def test_post_huddle_needs_a_pre_and_every_goal_marked(self):
        self.at(WED, '14:05')
        self.assertEqual(self.post().status_code, 400)
        self.send('pre', **PRE)
        self.assertEqual(self.post(results={'g1': {'result': 'hit'}}).status_code, 400)
        self.assertEqual(self.post(results={'g1': {'result': 'hit'}, 'g2': {'result': 'great'}, 'g3': {'result': 'hit'}}).status_code, 400)
        self.assertIsNone(self.part()['post'])

    def test_another_leader_can_close_it(self):
        self.send('pre', **PRE)
        self.at(WED, '14:05')
        self.as_('Noah Bennett', 'lead')
        self.assertEqual(self.post().status_code, 200)
        self.assertEqual(self.part()['post']['by'], 'Noah Bennett')

    # ----- the focus -----

    def test_directors_set_the_focus_and_leads_see_it(self):
        focus = {'scope': 'week', 'text': 'Sub 3-minute drive-thru', 'why': 'Guests in the lane decide our OSAT', 'tag': 'Deliver Operational Excellence Every Day'}
        self.assertEqual(self.send('focus', **focus).status_code, 403)           # a Team Lead
        self.as_('Dana Reyes', 'director')
        self.assertEqual(self.send('focus', **focus).status_code, 200)
        self.send('focus', scope='month', text='Second Mile Service', why='It is who we are')
        self.as_('Maya Torres', 'lead')
        f = self.state().get_json()['focus']
        self.assertEqual((f['week']['text'], f['week']['period'], f['week']['by'], f['week']['tag']),
                         ('Sub 3-minute drive-thru', '2026-11-16', 'Dana Reyes', 'Deliver Operational Excellence Every Day'))
        self.assertEqual((f['month']['text'], f['month']['period']), ('Second Mile Service', '2026-11'))
        nxt = self.state(24).get_json()['focus']                                 # next week: same month, no week focus yet
        self.assertEqual((nxt['week'], nxt['month']['text']), (None, 'Second Mile Service'))

    def test_a_focus_can_be_cleared_and_set_ahead_but_not_behind(self):
        self.as_('Dana Reyes', 'director')
        self.send('focus', scope='week', text='Speed')
        self.send('focus', scope='week', text='')
        self.assertIsNone(self.state().get_json()['focus']['week'])
        self.assertEqual(self.send('focus', scope='week', date='2026-11-24', text='Next week').status_code, 200)
        self.assertEqual(self.send('focus', scope='week', date='2026-11-10', text='Last week').status_code, 400)
        self.assertEqual(self.send('focus', scope='year', text='No').status_code, 400)

    # ----- storage -----

    def test_it_never_touches_the_saved_state(self):
        self.send('pre', **PRE)
        self.assertTrue(all(k.startswith('huddle/events/') for k in store))
        self.assertNotIn('huddle', ' '.join(appmod.STATE_SECTIONS).lower())

    def test_firebase_down_is_a_503_and_nothing_is_lost_quietly(self):
        class Down(FakeRef):
            def set(self, value):
                raise OSError('down')
        self.state()
        appmod.db.reference = lambda path: Down(path)
        self.assertEqual(self.send('pre', **PRE).status_code, 503)
        appmod.db.reference = lambda path: FakeRef(path)
        self.assertIsNone(self.part()['pre'])

    def test_another_servers_events_are_picked_up(self):
        self.state()
        other = {'id': f'{ms(WED, "10:14"):013d}-zzz', 'at': ms(WED, '10:14'), 'type': 'pre', 'by': 'Noah Bennett',
                 'data': {'date': '2026-11-18', 'side': 'foh', 'daypart': LUNCH, 'purpose': 'P', 'priority': 'Q', 'goals': [{'id': 'g1', 'text': 'G'}], 'develop': None}}
        store['huddle/events/' + other['id']] = other
        Clock.t += HA.HuddleStore.SYNC_SECONDS + 1
        self.assertEqual(self.part()['pre']['by'], 'Noah Bennett')

    def test_never_cached(self):
        self.assertEqual(self.state().headers['Cache-Control'], 'no-store')


class Page(unittest.TestCase):
    def test_the_view_is_wired_in(self):
        html = read('cfa-buda-ops-hub-complete.html')
        self.assertIn('id="huddleView"', html)
        self.assertIn('id="huddleRoot"', html)
        self.assertIn('<script src="/static/js/huddle.js" defer></script>', html)
        self.assertIn('/static/css/huddle.css', html)
        self.assertIn('data-views="zonereset huddle timers foodsafety safecount prepboard"', html)
        self.assertIn('aria-controls="huddleView" data-view="huddle"', html)          # the full site's OE menu
        self.assertIn("view === 'huddle' && typeof hdActivate === 'function'", read('static', 'js', 'navigation.js'))
        lm = read('static', 'js', 'launch-mode.js')
        self.assertIn("{view: 'huddle', label: 'Huddle'", lm)
        self.assertIn("'huddle'", lm[lm.index('const LAUNCH_VIEWS'):lm.index('\n', lm.index('const LAUNCH_VIEWS'))])
        self.assertIn("'huddle'", re.search(r'const LISTS = \[[^\]]+\]', read('static', 'js', 'bottom-nav.js')).group(0))

    def test_leaders_only_like_leader_transition(self):
        lm = read('static', 'js', 'launch-mode.js')
        self.assertIn("{view: 'huddle', label: 'Huddle', sub: 'Reunión', leaders: true}", lm)
        nav = read('static', 'js', 'navigation.js')
        self.assertIn("view === 'huddle' && typeof ltHidden === 'function' && ltHidden()", nav)

    def test_it_loads_with_the_rest_never_the_first_group(self):
        names = re.findall(r'<script src="/static/(?:js|forms)/([\w.-]+)\.js" defer>', read('cfa-buda-ops-hub-complete.html'))
        self.assertGreater(names.index('huddle'), names.index('bottom-nav'))

    def test_the_look_is_know_the_numbers(self):
        js = read('static', 'js', 'huddle.js')
        for cls in ('knp-title', 'knp-days', 'knp-cards', 'knp-card', 'knp-hero', 'knp-now'):
            self.assertIn(cls, js)
        css = read('static', 'css', 'huddle.css')
        self.assertIn('var(--cfa-navy)', css)       # the focus band is a stats card
        self.assertIn('var(--ok)', css)             # done is green

    def test_line_icons_never_emoji_and_no_real_names(self):
        emoji = re.compile('[\U0001F300-\U0001FAFF☀-➿]')
        for path in (('static', 'js', 'huddle.js'), ('static', 'css', 'huddle.css'), ('huddle_api.py',)):
            self.assertIsNone(emoji.search(read(*path)), path)

    def test_the_quick_picks_come_from_the_server(self):
        js = read('static', 'js', 'huddle.js')
        for pick in HA.PICKS['purpose'] + HA.PICKS['priority'] + HA.PICKS['system']:
            self.assertNotIn(f"'{pick}'", js)

    def test_people_text_goes_through_the_escaper(self):
        js = read('static', 'js', 'huddle.js')
        self.assertNotRegex(js, r'\$\{(?:pre|post|g|f|d|r)\.(?:purpose|priority|text|why|who|what|skill|handoff|by|owner|tag)\}')


if __name__ == '__main__':
    unittest.main()
