"""Timers (Tim, Oct 28 2026): timers_api.py. A cycle's outcome (on time,
late, missed), the miss the server writes itself, who gets the credit (the
Lead Captain on Set Ups when it came due, or whoever they handed it to),
store hours, and who may do what.

Run: python3 -m unittest discover tests
Firebase is a dict of paths (FakeRef); the clock is set by each test.
"""
import os
import re
import sys
import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
import timers_api as TA  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TZ = ZoneInfo('America/Chicago')
store = {}


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


class Clock:
    t = 0.0

    @classmethod
    def time(cls):
        return cls.t


def ms(day, hhmm):
    """Store-local time on a day of Oct 2026 as ms."""
    h, m = map(int, hhmm.split(':'))
    return int(datetime(2026, 10, day, h, m, tzinfo=TZ).timestamp() * 1000)


WED = 28          # Wednesday Oct 28 2026
SUN = 25


class Rules(unittest.TestCase):
    def test_dayparts_match_the_set_ups(self):
        with open(os.path.join(ROOT, 'static', 'js', 'zone-reset.js'), encoding='utf-8') as f:
            js = f.read()
        block = js[js.index('const fohDayparts'):js.index('];', js.index('const fohDayparts'))]
        self.assertEqual(re.findall(r"name: '([^']+)', time: '([^']+)'", block), TA.FOH_DAYPARTS)

    def test_daypart_at(self):
        self.assertEqual(TA.daypart_at(ms(WED, '06:05'), TZ), 'Early Breakfast (6:00-8:00)')
        self.assertEqual(TA.daypart_at(ms(WED, '13:30'), TZ), 'Transition (1:00-2:00)')
        self.assertEqual(TA.daypart_at(ms(WED, '21:40'), TZ), 'Close (8:00-10:00)')

    def test_hours(self):
        h = TA.DEFAULT_CONFIG['hours']
        self.assertIsNone(TA.hours_on(datetime(2026, 10, SUN).date(), h, TZ))
        self.assertEqual(TA.hours_on(datetime(2026, 10, 30).date(), h, TZ)[1], ms(30, '23:00'))   # Friday
        self.assertEqual(TA.hours_on(datetime(2026, 10, WED).date(), h, TZ), (ms(WED, '06:00'), ms(WED, '22:00')))

    def test_a_cycle_starts_at_opening_not_at_last_nights_reset(self):
        t = {'interval': 30, 'grace': 10}
        c = TA.cycle(t, ms(27, '21:50'), ms(WED, '06:10'), TA.DEFAULT_CONFIG['hours'], TZ)
        self.assertEqual((c['day'], c['due']), ('2026-10-28', ms(WED, '06:30')))


class Api(unittest.TestCase):
    def setUp(self):
        store.clear()
        self.posa = {}
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._read_sections = lambda: {'setups': {'posAssignments': self.posa}}
        TA.time = Clock
        appmod.app.extensions['timer_store'].reset()
        self.c = appmod.app.test_client()

    def at(self, day, hhmm):
        Clock.t = ms(day, hhmm) / 1000

    def lead(self, day, dp, name):
        self.posa[f'foh||2026-10-{day}||{dp}||Lead Captain'] = name

    def as_(self, name=None, role=None):
        with self.c.session_transaction() as s:
            s.clear()
            if name:
                s['user'] = {'name': name, 'role': role, 'via': 'pin'}

    def send(self, typ, **data):
        return self.c.post('/api/timers/events', json={'type': typ, 'data': data})

    def state(self):
        return self.c.get('/api/timers/state').get_json()

    def events(self, typ):
        return sorted((v for k, v in store.items() if k.startswith('timers/events/') and v['type'] == typ), key=lambda e: e['id'])

    def test_on_time_reset_is_credited_to_the_lead_captain(self):
        self.lead(WED, 'Breakfast (8:00-10:30)', 'Maya Torres')
        self.at(WED, '08:00')
        self.send('reset', timerId='restroom', name='Caleb')
        self.at(WED, '08:28')
        r = self.send('reset', timerId='restroom', name='Grace').get_json()['event']['data']
        self.assertEqual((r['status'], r['lateMin'], r['lead'], r['owner'], r['daypart']),
                         ('ontime', 0, 'Maya Torres', 'Maya Torres', 'Breakfast (8:00-10:30)'))
        self.assertEqual(self.events('reset')[-1]['by'], 'Grace')

    def test_late_inside_the_grace(self):
        self.at(WED, '08:00')
        self.send('reset', timerId='restroom', name='A')
        self.at(WED, '08:36')
        r = self.send('reset', timerId='restroom', name='B').get_json()['event']['data']
        self.assertEqual((r['status'], r['lateMin']), ('late', 6))

    def test_the_server_writes_a_miss_once_and_a_late_reset_stays_missed(self):
        self.lead(WED, 'Breakfast (8:00-10:30)', 'Maya Torres')
        self.at(WED, '08:00')
        self.send('reset', timerId='restroom', name='A')
        self.at(WED, '08:41')
        self.state()
        self.state()
        misses = [e for e in self.events('miss') if e['data']['timerId'] == 'restroom']
        self.assertEqual(len(misses), 1)
        self.assertEqual((misses[0]['data']['due'], misses[0]['data']['lead']), (ms(WED, '08:30'), 'Maya Torres'))
        self.at(WED, '08:55')
        r = self.send('reset', timerId='restroom', name='Ethan').get_json()['event']['data']
        self.assertEqual((r['status'], r['lateMin'], r['due']), ('missed', 25, ms(WED, '08:30')))
        self.assertEqual(len([e for e in self.events('miss') if e['data']['timerId'] == 'restroom']), 1)

    def test_a_reset_after_the_grace_with_nobody_looking_is_missed(self):
        self.at(WED, '08:00')
        self.send('reset', timerId='restroom', name='A')
        self.at(WED, '09:00')
        r = self.send('reset', timerId='restroom', name='B').get_json()['event']['data']
        self.assertEqual(r['status'], 'missed')
        self.assertEqual(len([e for e in self.events('miss') if e['data']['timerId'] == 'restroom']), 1)

    def test_handoff_holds_until_a_new_lead_captain(self):
        self.lead(WED, 'Breakfast (8:00-10:30)', 'Maya Torres')
        self.lead(WED, 'Lunch (10:30-1:00)', 'Noah Bennett')
        self.as_('Maya Torres', 'lead')
        self.at(WED, '09:00')
        self.assertEqual(self.send('handoff', timerId='lot', to='Grace Kim').status_code, 200)
        self.send('reset', timerId='lot')
        owner = lambda at: TA.owner_at('lot', TA.fold(self.events('handoff'))['handoffs'], 'Maya Torres', at, TZ)
        self.assertEqual(owner(ms(WED, '09:30')), 'Grace Kim')
        self.at(WED, '10:00')
        self.send('handoff', timerId='lot', to='')       # taken back
        self.assertEqual(owner(ms(WED, '10:10')), 'Maya Torres')
        self.assertEqual(owner(ms(WED, '09:30')), 'Grace Kim')   # the cycles before stay hers
        self.at(WED, '10:50')
        r = self.send('reset', timerId='lot').get_json()['event']['data']
        self.assertEqual((r['lead'], r['owner']), ('Noah Bennett', 'Noah Bennett'))   # due 11:00, Lunch

    def test_handed_off_cycle_is_owned_by_the_team_member(self):
        self.lead(WED, 'Breakfast (8:00-10:30)', 'Maya Torres')
        self.as_('Maya Torres', 'lead')
        self.at(WED, '08:00')
        self.send('handoff', timerId='restroom', to='Grace Kim')
        self.send('reset', timerId='restroom')
        self.as_()
        self.at(WED, '08:29')
        r = self.send('reset', timerId='restroom', name='Grace Kim').get_json()['event']['data']
        self.assertEqual((r['lead'], r['owner'], r['status']), ('Maya Torres', 'Grace Kim', 'ontime'))

    def test_who_may_do_what(self):
        self.at(WED, '09:00')
        self.as_()
        self.assertEqual(self.send('reset', timerId='restroom').status_code, 400)          # who did it?
        self.assertEqual(self.send('handoff', timerId='restroom', to='X').status_code, 403)
        self.assertEqual(self.send('config', timers=[{'name': 'X'}]).status_code, 403)
        self.as_('Ben Cole', 'member')
        self.assertEqual(self.send('reset', timerId='restroom').status_code, 200)            # signed in: their name
        self.assertEqual(self.events('reset')[-1]['by'], 'Ben Cole')
        self.assertEqual(self.send('handoff', timerId='restroom', to='X').status_code, 403)
        self.assertEqual(self.send('count', counterId='cookie', value=58).status_code, 200)
        self.assertEqual(self.state()['counts'], {'cookie': 58})
        self.assertEqual(self.send('reset', timerId='nope').status_code, 400)

    def test_config_is_cleaned_and_used(self):
        self.as_('Ana Ruiz', 'lead')
        self.at(WED, '09:00')
        r = self.send('config', timers=[{'id': 'Lot!', 'name': '  Lot   Sweep ', 'icon': 'rocket', 'interval': 1, 'grace': 999},
                                        {'name': ''}], counters=[], hours={'open': '6:00', 'close': '22:00'})
        self.assertEqual(r.status_code, 200)
        cfg = self.state()['config']
        self.assertEqual(cfg['timers'], [{'id': 'lot', 'name': 'Lot Sweep', 'icon': 'clock', 'interval': 5, 'grace': 240}])
        self.assertEqual(cfg['hours']['open'], '06:00')
        self.assertEqual(self.send('config', timers=[]).status_code, 400)
        self.assertEqual(self.send('config', timers=[{'name': 'A'}], hours={'open': '22:00', 'close': '06:00'}).status_code, 400)

    def test_closed_on_sunday(self):
        self.at(SUN, '12:00')
        r = self.send('reset', timerId='restroom', name='A').get_json()['event']['data']
        self.assertEqual(r['status'], 'closed')
        self.state()
        self.assertEqual(self.events('miss'), [])   # Saturday's last cycles may miss, never Sunday's

    def test_last_nights_miss_is_written_in_the_morning(self):
        self.at(27, '21:00')
        self.send('reset', timerId='restroom', name='A')        # due 21:30, grace to 21:40, close 22:00
        self.at(WED, '05:00')
        self.state()
        m = [e for e in self.events('miss') if e['data']['timerId'] == 'restroom']
        self.assertEqual([e['data']['due'] for e in m], [ms(27, '21:30')])

    def test_state_sends_recent_events_and_new_ones_after(self):
        self.at(WED, '09:00')
        self.send('reset', timerId='restroom', name='A')
        d = self.state()
        self.assertTrue(d['full'])
        self.assertEqual([e['type'] for e in d['events']], ['reset'])
        self.send('reset', timerId='lot', name='B')
        d2 = self.c.get('/api/timers/state?since=' + d['cursor']).get_json()
        self.assertEqual((d2['full'], [e['data']['timerId'] for e in d2['events']]), (False, ['lot']))
        self.assertEqual(self.c.get('/api/timers/state').headers.get('Cache-Control'), 'no-store')


if __name__ == '__main__':
    unittest.main()


class Page(unittest.TestCase):
    def read(self, *parts):
        with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
            return f.read()

    def test_the_view_is_wired_in(self):
        html = self.read('cfa-buda-ops-hub-complete.html')
        self.assertIn('id="timersView"', html)
        self.assertIn('id="timersRoot"', html)
        self.assertIn('<script src="/static/js/timers.js"></script>', html)
        self.assertIn('/static/css/timers.css', html)
        self.assertIn('data-views="zonereset timers foodsafety safecount"', html)
        self.assertIn("view === 'timers' && typeof tmActivate === 'function'", self.read('static', 'js', 'navigation.js'))
        lm = self.read('static', 'js', 'launch-mode.js')
        self.assertIn("{view: 'timers', label: 'Timers'", lm)
        self.assertIn("'timers'", lm[lm.index('const LAUNCH_VIEWS'):lm.index('\n', lm.index('const LAUNCH_VIEWS'))])

    def test_line_icons_never_emoji(self):
        js = self.read('static', 'js', 'timers.js')
        self.assertIsNone(re.search('[\U0001F300-\U0001FAFF☀-➿]', js))
        self.assertEqual(set(re.findall(r"^    (\w+): '<", js[js.index('const ICONS'):js.index('};', js.index('const ICONS'))], re.M)), set(TA.ICONS))
