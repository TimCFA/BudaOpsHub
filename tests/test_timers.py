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
        # A tap on a signed-out tablet resets with nobody named (Tim, Oct 28 2026);
        # the cycle is still the Lead Captain's from Set Ups.
        r = self.send('reset', timerId='restroom')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()['event']['by'], '')
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


class Pause(Api):
    """Tim, Oct 28 2026: a way to pause a timer. Press and hold, pause for a
    set time (never open-ended); the clock stops, nothing is missed while it's
    paused, and it comes back by itself, with a tap, or with a reset."""

    def start(self):
        self.at(WED, '08:00')
        self.send('reset', timerId='restroom', name='A')          # due 08:30, grace to 08:40

    def test_the_clock_stops_and_nothing_is_missed(self):
        self.start()
        self.at(WED, '08:20')
        r = self.send('pause', timerId='restroom', minutes=15)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()['event']['data']['until'], ms(WED, '08:35'))
        self.at(WED, '08:41')                                       # would have been a miss
        self.state()
        self.assertEqual(self.events('miss'), [])
        self.assertEqual(self.state()['pauses'], {'restroom': [[ms(WED, '08:20'), ms(WED, '08:35')]]})
        self.at(WED, '08:44')
        r = self.send('reset', timerId='restroom', name='B').get_json()['event']['data']
        self.assertEqual((r['status'], r['due']), ('ontime', ms(WED, '08:45')))

    def test_resume_early_and_late_after_it(self):
        self.start()
        self.at(WED, '08:20')
        self.send('pause', timerId='restroom', minutes=30)
        self.at(WED, '08:25')
        self.assertEqual(self.send('resume', timerId='restroom').status_code, 200)
        self.assertEqual(self.send('resume', timerId='restroom').status_code, 400)       # not paused any more
        self.at(WED, '08:38')
        r = self.send('reset', timerId='restroom').get_json()['event']['data']
        self.assertEqual((r['status'], r['lateMin'], r['due']), ('late', 3, ms(WED, '08:35')))

    def test_paused_while_overdue_keeps_the_late_minutes(self):
        self.start()
        self.at(WED, '08:35')                                       # 5 min late
        self.send('pause', timerId='restroom', minutes=60)
        self.at(WED, '09:30')
        self.state()
        self.assertEqual(self.events('miss'), [])
        self.at(WED, '09:36')                                       # back at 09:35: due is 09:30
        r = self.send('reset', timerId='restroom').get_json()['event']['data']
        self.assertEqual((r['status'], r['lateMin']), ('late', 6))

    def test_rest_of_today(self):
        self.start()
        self.at(WED, '08:10')
        r = self.send('pause', timerId='restroom', rest=True).get_json()['event']['data']
        self.assertEqual((r['until'], r['rest']), (ms(WED, '22:00'), True))
        self.at(WED, '21:59')
        self.state()
        self.assertEqual(self.events('miss'), [])
        self.at(29, '06:10')                                        # Thursday: a fresh cycle from opening
        c = TA.cycle(TA.DEFAULT_CONFIG['timers'][0], TA.fold(store_events())['last']['restroom'], ms(29, '06:10'),
                     TA.DEFAULT_CONFIG['hours'], TZ, TA.fold(store_events())['pauses']['restroom'])
        self.assertEqual((c['due'], c['paused']), (ms(29, '06:30'), None))

    def test_a_reset_ends_the_pause(self):
        self.start()
        self.at(WED, '08:10')
        self.send('pause', timerId='restroom', minutes=60)
        self.at(WED, '08:15')
        self.send('reset', timerId='restroom')
        self.assertEqual(self.state()['pauses']['restroom'], [[ms(WED, '08:10'), ms(WED, '08:15')]])
        self.at(WED, '08:56')
        self.state()
        self.assertEqual([e['data']['due'] for e in self.events('miss')], [ms(WED, '08:45')])   # 30 min from the reset, not paused

    def test_what_cant_be_paused(self):
        self.at(WED, '08:00')
        self.assertEqual(self.send('pause', timerId='restroom', minutes=15).status_code, 400)    # never started
        self.send('reset', timerId='restroom')
        self.assertEqual(self.send('pause', timerId='restroom').status_code, 400)                # how long?
        self.assertEqual(self.send('pause', timerId='nope', minutes=15).status_code, 400)
        self.at(WED, '08:41')
        r = self.send('pause', timerId='restroom', minutes=15)                                    # already a miss
        self.assertEqual((r.status_code, r.get_json()['error']), (400, 'It’s already a miss. Tap it when it’s done.'))
        self.at(SUN, '12:00')
        self.assertEqual(self.send('pause', timerId='restroom', minutes=15).status_code, 400)    # closed

    def test_anyone_can_pause_and_it_names_who(self):
        self.start()
        self.at(WED, '08:10')
        self.as_()
        self.send('pause', timerId='restroom', minutes=15, name='Grace Kim')
        self.assertEqual(self.events('pause')[-1]['by'], 'Grace Kim')
        self.as_('Ben Cole', 'member')
        self.send('resume', timerId='restroom')
        self.assertEqual(self.events('resume')[-1]['by'], 'Ben Cole')

    def test_the_page_runs_the_same_clock(self):
        """timers.js cycle() against the server's, on the same pauses."""
        timer = {'id': 'restroom', 'interval': 30, 'grace': 10}
        cases = [  # (last reset, pauses, now)
            (ms(WED, '08:00'), [[ms(WED, '08:20'), ms(WED, '08:35')]], ms(WED, '08:41')),
            (ms(WED, '08:00'), [[ms(WED, '08:20'), ms(WED, '08:35')]], ms(WED, '08:25')),
            (ms(WED, '08:00'), [[ms(WED, '08:35'), ms(WED, '09:35')]], ms(WED, '09:00')),
            (ms(WED, '08:00'), [[ms(WED, '07:00'), ms(WED, '07:30')], [ms(WED, '08:05'), ms(WED, '08:10')], [ms(WED, '08:50'), ms(WED, '09:10')]], ms(WED, '08:55')),
            (ms(WED, '08:00'), [[ms(WED, '08:45'), ms(WED, '09:00')]], ms(WED, '08:50')),     # after the deadline: no help
        ]
        js = os.path.join(ROOT, 'static', 'js', 'timers.js')
        script = """
const vm = require('vm'), fs = require('fs');
const el = {addEventListener(){}, classList: {contains: () => false, toggle(){}}};
const ctx = {console, Date, Math, JSON, CSS: {escape: s => s}, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: {getItem: () => null, setItem(){}}, document: {getElementById: () => null, addEventListener(){}, body: el, documentElement: el}};
ctx.window = ctx; ctx.window.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[1], 'utf8'), ctx);
const P = ctx.TimersPage, input = JSON.parse(fs.readFileSync(0, 'utf8'));
P.S.config = {hours: input.hours};
process.stdout.write(JSON.stringify(input.cases.map(([last, pauses, at]) => {
  P.S.last = {restroom: last}; P.S.pauses = {restroom: pauses}; P.S.offset = at - Date.now();
  const c = P.cycle(input.timer);
  return {cls: c.cls, due: c.due, until: c.until || null};
})));
"""
        import json
        import subprocess
        out = subprocess.run(['node', '-e', script, js], input=json.dumps({'timer': timer, 'hours': TA.DEFAULT_CONFIG['hours'], 'cases': cases}),
                             capture_output=True, text=True, check=True)
        got = json.loads(out.stdout)
        for (last, pauses, at), page in zip(cases, got):
            c = TA.cycle(timer, last, at, TA.DEFAULT_CONFIG['hours'], TZ, pauses)
            self.assertEqual(page['due'], c['due'])
            self.assertEqual(page['cls'] == 'paused', bool(c['paused']))
            if c['paused']:
                self.assertEqual(page['until'], c['paused'][1])


def store_events():
    return [v for k, v in store.items() if k.startswith('timers/events/')]


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
        self.assertIn('data-views="zonereset timers foodsafety safecount prepboard"', html)
        self.assertIn("view === 'timers' && typeof tmActivate === 'function'", self.read('static', 'js', 'navigation.js'))
        lm = self.read('static', 'js', 'launch-mode.js')
        self.assertIn("{view: 'timers', label: 'Timers'", lm)
        self.assertIn("'timers'", lm[lm.index('const LAUNCH_VIEWS'):lm.index('\n', lm.index('const LAUNCH_VIEWS'))])

    def test_line_icons_never_emoji(self):
        js = self.read('static', 'js', 'timers.js')
        self.assertIsNone(re.search('[\U0001F300-\U0001FAFF☀-➿]', js))
        self.assertEqual(set(re.findall(r"^    (\w+): '<", js[js.index('const ICONS'):js.index('};', js.index('const ICONS'))], re.M)), set(TA.ICONS))


class FullScreen(unittest.TestCase):
    """Tim, Oct 28 2026: on the counter iPad the case covers the screen's
    edges and the hub's header and tabs crowd the timers. Full screen is the
    timers alone inside a margin the case can't cover, sized to fit five in a
    row, remembered on the device, and the Timers page's only."""

    def setUp(self):
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        rd = lambda *p: open(os.path.join(root, *p), encoding='utf-8').read()
        self.js, self.css, self.nav = rd('static', 'js', 'timers.js'), rd('static', 'css', 'timers.css'), rd('static', 'js', 'navigation.js')

    def test_the_button_and_the_device_remembers(self):
        self.assertIn('data-tm-full aria-pressed="${full}"', self.js)
        self.assertIn("LS.set('full', on ? '1' : '0');", self.js)
        self.assertIn("if(fullOn()) window.addEventListener('load'", self.js)
        self.assertIn("function applyFull(){ document.body.classList.toggle('tm-full', fullOn() && shown()); }", self.js)
        self.assertIn("if(typeof tmFullSync === 'function') tmFullSync();", self.nav)        # leaving the page leaves full screen

    def test_the_layout(self):
        for rule in ('body.tm-full .hdr,body.tm-full .tabs-wrap', '--tm-case:max(36px, 4vw);', 'env(safe-area-inset-left,0px)',
                     '--tm-size:clamp(150px, calc((100vw - 2 * max(36px, 4vw) - (var(--tm-cols, 5) - 1) * 24px) / var(--tm-cols, 5)), 240px);',
                     'body.tm-full .tm-badge{width:calc(var(--tm-size) * .23);'):
            self.assertIn(rule, self.css)
        self.assertIn('style="--tm-cols:${Math.max(1, Math.min(5, c.timers.length))}"', self.js)


class TapAndHold(unittest.TestCase):
    """Tim, Oct 28 2026: one tap pauses (a tap on a paused timer resumes it),
    a quick double tap resets, press and hold opens the sheet to say who did
    it or hand the timer off."""

    def test_the_page(self):
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        js = open(os.path.join(root, 'static', 'js', 'timers.js'), encoding='utf-8').read()
        self.assertIn("if(press && press.id === d.tmTimer && (press.fired || press.moved)) return;", js)
        self.assertIn('tapTimer(d.tmTimer);', js)
        self.assertIn('const HOLD_MS = 550, DOUBLE_MS = 320;', js)
        self.assertIn("if(tapWait && tapWait.id === id){ clearTimeout(tapWait.timer); tapWait = null; quickReset(id); return; }", js)   # the second tap resets
        self.assertIn("if(st.cls === 'paused') resumeTimer(id);", js)
        self.assertIn("else if(['ok', 'soon', 'late'].includes(st.cls)) pauseTimer(id, 'rest');", js)
        self.assertIn("resetTimer(id, S.me && S.me.name ? S.me.name : '');", js)
        self.assertIn("S.root.addEventListener('contextmenu'", js)
        self.assertIn('Tap to pause, tap again to resume. Double tap when it’s done. Press and hold to say who did it or hand it off.', js)
        css = open(os.path.join(root, 'static', 'css', 'timers.css'), encoding='utf-8').read()
        self.assertIn('-webkit-touch-callout:none', css)
