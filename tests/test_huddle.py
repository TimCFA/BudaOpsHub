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


class Numbers(unittest.TestCase):
    """The shift's numbers, from what the hub already records."""

    def test_handoffs_and_zone_lists_match_zone_reset(self):
        js = read('static', 'js', 'zone-reset.js')
        block = js[js.index('const zoneResetDayparts'):js.index('];', js.index('const zoneResetDayparts'))]
        self.assertEqual(re.findall(r"name: '([^']+)', time: '[^']+', leadFrom: '([^']+)'", block), HA.HANDOFFS)
        js = read('static', 'js', 'state-and-utils.js')
        block = js[js.index('const ZONE_CHECKLISTS'):js.index('};', js.index('const ZONE_CHECKLISTS'))]
        zones = {name: len(re.findall(r"'(?:[^'\\]|\\.)*'", items)) for name, items in re.findall(r"^\s*'([^']+)': \[(.*)\],?$", block, re.M)}
        final = re.search(r'const FINAL_CHECK_ITEMS = \[(.*)\];', js).group(1)
        zones['Final Check'] = len(re.findall(r"'(?:[^'\\]|\\.)*'", final))
        self.assertEqual(zones, HA.ZONE_ITEMS)
        self.assertEqual(list(zones), list(HA.ZONE_ITEMS))                   # in the page's order

    def test_each_handoff_belongs_to_one_huddle(self):
        got = {n: HA.handoffs_of(n) for n, _ in HA.DAYPARTS}
        self.assertEqual(got[BREAKFAST], ['Breakfast to Lunch (10:30am - 11:30am)'])
        self.assertEqual(got['Afternoon (2:00-5:00)'], ['Mid to Dinner (4:00pm - 5:00pm)'])
        self.assertEqual(got[DINNER], ['Dinner to Late Night (7:00pm - 8:00pm)', 'Close'])
        self.assertEqual(sorted(h for v in got.values() for h in v), sorted(n for n, _ in HA.HANDOFFS))

    def test_productivity_live_then_history(self):
        live = {'ops': {'numbersData': {'2026-11-18': {LUNCH: {'projectedSales': '$9,200', 'productivityGoal': '$110', 'actualProductivity': '104.5', 'actualSales': ''}}}}}
        self.assertEqual(HA.productivity(live, '2026-11-18', LUNCH), {'goal': 110.0, 'actual': 104.5, 'projectedSales': 9200.0, 'actualSales': None})
        hist = {'history': {'numbersHistory': {'2026-11-18': {LUNCH: ['9200', '110', '', '9050', '101']}}}}
        self.assertEqual(HA.productivity(hist, '2026-11-18', LUNCH), {'goal': 110.0, 'actual': 101.0, 'projectedSales': 9200.0, 'actualSales': 9050.0})
        self.assertIsNone(HA.productivity({}, '2026-11-18', LUNCH))
        self.assertIsNone(HA.productivity(live, '2026-11-18', DINNER))

    def test_timer_cycles_by_when_they_came_due(self):
        a, b = ms(WED, '10:30'), ms(WED, '14:00')
        ev = lambda typ, tid, due, status=None: {'type': typ, 'data': {'timerId': tid, 'due': due, 'status': status}}
        events = [ev('reset', 'restroom', ms(WED, '11:00'), 'ontime'), ev('reset', 'restroom', ms(WED, '11:30'), 'late'),
                  ev('miss', 'lot', ms(WED, '12:00')), ev('reset', 'lot', ms(WED, '12:00'), 'missed'),      # one cycle, one miss
                  ev('reset', 'restroom', ms(WED, '10:00'), 'ontime'), ev('reset', 'restroom', ms(WED, '14:00'), 'ontime'),   # other dayparts
                  ev('reset', 'restroom', None, 'closed'), ev('handoff', 'lot', ms(WED, '12:00'))]
        self.assertEqual(HA.timer_cycles(events, a, b), {'ontime': 1, 'late': 1, 'missed': 1})
        self.assertIsNone(HA.timer_cycles(events, ms(WED, '17:00'), ms(WED, '22:00')))

    def test_waste_is_the_side_and_the_window(self):
        e = lambda at, cost, side='foh': {'ts': ms(WED, at), 'cost': cost, 'section': side}
        secs = {'waste': {'entries': [e('11:00', 4.25), e('13:59', '2.50'), e('12:00', 9, 'boh'), e('14:00', 7), 'junk']}}
        self.assertEqual(HA.waste_logged(secs, 'foh', ms(WED, '10:30'), ms(WED, '14:00')), {'cost': 6.75, 'count': 2})
        self.assertIsNone(HA.waste_logged(secs, 'foh', ms(WED, '06:00'), ms(WED, '10:30')))

    def test_food_safety_walkthroughs_finished_in_the_window(self):
        secs = {'ops': {'foodSafetyWalkthroughs': {'2026-11-18': {'completedAt': ms(WED, '09:10'), 'more': {'r2': {'completedAt': ms(WED, '12:40')}, 'r3': {}}}}}}
        self.assertEqual(HA.food_safety_done(secs, '2026-11-18', ms(WED, '10:30'), ms(WED, '14:00')), 1)
        self.assertEqual(HA.food_safety_done(secs, '2026-11-19', 0, 10 ** 14), 0)

    def test_zone_resets_are_per_zone(self):
        mark = lambda who: {'initials': who, 'ts': 1}
        handoff = 'Lunch to Mid (1:00pm - 2:00pm)'
        state = {handoff: {'The Spot': {'Clear clutter': mark('mt'), 'Sweep & mop': mark('GK'), 'Take out trash': mark('MT')},
                           'Restrooms': {'Wipe toilets': mark('CO')}, 'Final Check': {'Floors cleaned': mark('MT')}},
                 'Close': {'The Spot': {'Clear clutter': mark('ZZ')}}}
        z = HA.zone_resets({'ops': {'zoneChecklistState': {'2026-11-18': state}}}, '2026-11-18', LUNCH)
        self.assertEqual([h['handoff'] for h in z], [handoff])
        rows = {r['name']: r for r in z[0]['zones']}
        self.assertEqual(list(rows), list(HA.ZONE_ITEMS))
        self.assertEqual(rows['The Spot'], {'name': 'The Spot', 'checked': 3, 'total': 3, 'by': ['GK', 'MT']})
        self.assertEqual((rows['Restrooms']['checked'], rows['Restrooms']['total'], rows['Dining Room']['checked']), (1, 8, 0))
        self.assertEqual((z[0]['checked'], z[0]['total'], z[0]['done']), (5, sum(HA.ZONE_ITEMS.values()), 1))
        self.assertIsNone(HA.zone_resets({'ops': {'zoneChecklistState': {}}}, '2026-11-18', LUNCH))     # cleared: say nothing, not zero

    def test_the_kept_copy_fills_what_the_hub_no_longer_holds(self):
        live = {'productivity': {'goal': 110.0, 'actual': 104.0}, 'timers': None, 'waste': None, 'foodSafety': 0, 'zones': None}
        kept = {'productivity': {'goal': 110.0, 'actual': None}, 'timers': {'ontime': 3, 'late': 0, 'missed': 1}, 'waste': None, 'foodSafety': 1, 'zones': [{'handoff': 'X'}]}
        got = HA.with_kept(live, kept)
        self.assertEqual((got['productivity']['actual'], got['timers']['missed'], got['foodSafety'], got['zones']), (104.0, 1, 1, [{'handoff': 'X'}]))
        self.assertEqual(HA.with_kept(live, None), live)


class Api(unittest.TestCase):
    def setUp(self):
        store.clear()
        self.posa = {}
        self.was = (appmod.db.reference, appmod._read_sections, HA.time)     # put back after: other tests use the real ones
        appmod.db.reference = lambda path: FakeRef(path)
        self.sections = {'setups': {'posAssignments': self.posa}}
        appmod._read_sections = lambda: self.sections
        appmod.app.extensions['timer_store'].reset()
        HA.time = Clock
        appmod.app.extensions['huddle_store'].reset()
        self.c = appmod.app.test_client()
        self.as_('Maya Torres', 'lead')
        self.at(WED, '10:15')

    def tearDown(self):
        appmod.db.reference, appmod._read_sections, HA.time = self.was
        appmod.app.extensions['huddle_store'].reset()
        appmod.app.extensions['timer_store'].reset()

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

    # ----- the shift's numbers -----

    def numbers_day(self):
        self.sections.update({
            'ops': {'numbersData': {'2026-11-18': {LUNCH: {'productivityGoal': '$110', 'actualProductivity': '', 'projectedSales': '$9,200'}}},
                    'zoneChecklistState': {'2026-11-18': {'Lunch to Mid (1:00pm - 2:00pm)': {'The Spot': {
                        'Clear clutter': {'initials': 'MT', 'ts': 1}, 'Sweep & mop': {'initials': 'MT', 'ts': 1}, 'Take out trash': {'initials': 'MT', 'ts': 1}}}}}},
            'waste': {'entries': [{'ts': ms(WED, '11:20'), 'cost': 3.5, 'section': 'foh'}]}})
        for i, (due, status) in enumerate((('11:00', 'ontime'), ('11:30', 'ontime'), ('12:00', 'late'))):
            eid = f'{ms(WED, due):013d}-t{i}'
            store['timers/events/' + eid] = {'id': eid, 'at': ms(WED, due), 'type': 'reset', 'by': '', 'data': {'timerId': 'restroom', 'due': ms(WED, due), 'status': status}}

    def test_a_daypart_carries_its_numbers_once_it_has_started(self):
        self.numbers_day()
        self.assertIsNone(self.part()['numbers'])                           # 10:15: Lunch hasn't started
        self.assertIsNotNone(self.part(BREAKFAST)['numbers'])
        self.at(WED, '13:00')
        n = self.part()['numbers']
        self.assertEqual(n['productivity'], {'goal': 110.0, 'actual': None, 'projectedSales': 9200.0, 'actualSales': None})
        self.assertEqual((n['timers'], n['waste'], n['foodSafety']), ({'ontime': 2, 'late': 1, 'missed': 0}, {'cost': 3.5, 'count': 1}, 0))
        self.assertEqual((n['zones'][0]['done'], len(n['zones'][0]['zones'])), (1, len(HA.ZONE_ITEMS)))
        self.assertIsNone(self.part(DINNER)['numbers'])

    def test_the_post_huddle_keeps_the_numbers_as_they_stood(self):
        self.numbers_day()
        self.send('pre', **PRE)
        self.at(WED, '14:05')
        self.post()
        kept = [e for e in self.events() if e['type'] == 'post'][0]['data']['numbers']
        self.assertEqual((kept['timers'], kept['waste']['cost'], kept['zones'][0]['done']), ({'ontime': 2, 'late': 1, 'missed': 0}, 3.5, 1))
        # The hub clears its own records; the actual comes in with tomorrow's upload.
        self.sections['ops']['zoneChecklistState'] = {}
        self.sections['waste']['entries'] = []
        self.sections['ops']['numbersData']['2026-11-18'][LUNCH]['actualProductivity'] = '$104'
        n = self.part()['numbers']
        self.assertEqual((n['productivity']['actual'], n['waste']['cost'], n['zones'][0]['done']), (104.0, 3.5, 1))

    def test_numbers_that_cannot_be_read_do_not_break_the_huddle(self):
        def boom():
            raise OSError('down')
        appmod._read_sections = boom
        self.at(WED, '13:00')
        r = self.state()
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.get_json()['dayparts'][1]['numbers'])

    # ----- the week -----

    def week(self, day=None):
        return self.c.get('/api/huddle/week' + (f'?date=2026-11-{day}' if day else ''))

    def test_the_week_is_for_directors(self):
        self.assertEqual(self.week().status_code, 403)                      # a Team Lead
        self.as_('Caleb Ortiz', 'member')
        self.assertEqual(self.week().status_code, 403)
        self.as_('Dana Reyes', 'director')
        self.assertEqual(self.week().status_code, 200)

    def test_the_week_adds_up_huddles_goals_and_focus(self):
        self.numbers_day()
        self.as_('Dana Reyes', 'director')
        self.send('focus', scope='week', text='Sub 3-minute drive-thru', why='Guests in the lane')
        self.as_('Maya Torres', 'lead')
        self.send('pre', **PRE)                                             # Lunch: g1 is tied to the week's focus
        self.at(WED, '14:05')
        self.post()                                                         # hit, partly, missed
        self.as_('Noah Bennett', 'lead')
        self.send('pre', **{**PRE, 'daypart': 'Afternoon (2:00-5:00)', 'goals': [{'text': 'Lobby reset by 3', 'focus': 'week'}], 'develop': None})
        self.as_('Dana Reyes', 'director')
        w = self.week().get_json()
        self.assertEqual((w['week'], w['days'][0], w['days'][-1], len(w['cells'])), ('2026-11-16', '2026-11-16', '2026-11-21', 24))
        # Mon, Tue: 4 each, Wed by 2:05pm: Breakfast, Lunch, Afternoon.
        self.assertEqual({k: w['totals'][k] for k in ('expected', 'set', 'closed', 'goals', 'hit', 'partly', 'missed', 'open', 'develop', 'pea')},
                         {'expected': 11, 'set': 2, 'closed': 1, 'goals': 4, 'hit': 1, 'partly': 1, 'missed': 1, 'open': 1, 'develop': 1, 'pea': 1})
        self.assertEqual({k: w['focus']['week'][k] for k in ('text', 'goals', 'hit', 'open')}, {'text': 'Sub 3-minute drive-thru', 'goals': 2, 'hit': 1, 'open': 1})
        self.assertIsNone(w['focus']['month'])
        cell = {(c['date'], c['daypart']): c for c in w['cells']}
        self.assertEqual((cell[('2026-11-18', LUNCH)]['state'], cell[('2026-11-18', LUNCH)]['hit'], cell[('2026-11-18', LUNCH)]['goals']), ('closed', 1, 3))
        self.assertEqual([cell[('2026-11-18', n)]['state'] for n in (BREAKFAST, 'Afternoon (2:00-5:00)', DINNER)], ['none', 'set', 'ahead'])
        self.assertEqual(cell[('2026-11-21', LUNCH)]['state'], 'ahead')
        self.assertEqual([(x['name'], x['set'], x['closed'], x['hit']) for x in w['leaders']], [('Maya Torres', 1, 1, 1), ('Noah Bennett', 1, 0, 0)])
        lunch = next(x for x in w['byDaypart'] if x['name'] == LUNCH)
        self.assertEqual((lunch['expected'], lunch['set'], lunch['closed'], lunch['timers'], lunch['waste'], lunch['prodKnown']),
                         (3, 1, 1, {'ontime': 2, 'late': 1, 'missed': 0}, 3.5, 0))
        self.assertEqual(w['wins'], [{'date': '2026-11-18', 'daypart': LUNCH, 'by': 'Maya Torres', 'who': 'Caleb Ortiz', 'what': 'Kept the window moving'}])

    def test_another_week_is_empty(self):
        self.send('pre', **PRE)
        self.as_('Dana Reyes', 'director')
        w = self.week(10).get_json()
        self.assertEqual((w['week'], w['totals']['set'], w['totals']['expected'], w['leaders']), ('2026-11-09', 0, 24, []))

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
