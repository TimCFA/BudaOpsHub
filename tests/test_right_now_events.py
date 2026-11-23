"""Today on the calendar, on Home's Right Now card (Tim, Oct 25 2026): a
store event on a Thursday was missed, so the day's events open every card,
for every role, and a tap opens the one event on its own. The short ones
get the block; month-long ones ride on an "Also running" line; the next
open day's sit under it. Before opening it's today's; after close and on
Sunday, the next open day's. Leadership meetings only for managers.

Nov 21 2026 (Tim): the navy block was louder than a person's own day, so the
events are quiet lines among the card's others, after the person's own; a
new hire's card has none.

Run: python3 -m unittest discover tests
Runs right-now.js with events.js in node (tests/right_now_runner.js).
"""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THU_4PM = '2026-10-22T16:00:00-05:00'
THU_6PM = '2026-10-22T18:00:00-05:00'
THU_8PM = '2026-10-22T20:00:00-05:00'
THU_6AM = '2026-10-22T06:00:00-05:00'
THU_11PM = '2026-10-22T22:30:00-05:00'
SAT_11PM = '2026-10-24T23:30:00-05:00'

EVENTS = """storeEvents = [
  {id: 'fam', kind: 'instore', title: 'Family Night', detail: 'Pumpkins & Play', date: '2026-10-22', from: '17:00', to: '19:00', notes: ['Paint pumpkins', 'Ops Team: OE']},
  {id: 'ns', kind: 'note', title: 'No School', date: '2026-10-22'},
  {id: 'sample', kind: 'food', title: 'Sample: Coffee', date: '2026-10-05', end: '2026-10-31', days: [1, 2, 3, 4, 5, 6]},
  {id: 'dt', kind: 'drivethru', title: 'Pack the Drive Thru', date: '2026-10-23', from: '12:00', to: '13:00'},
  {id: 'mtg', kind: 'meeting', title: 'Leaders meeting', date: '2026-10-22', from: '15:00', to: '16:00'},
  {id: 'mon', kind: 'instore', title: 'Spirit Night', date: '2026-10-26', from: '17:00', to: '20:00'},
];"""


def model(at, manager=False):
    return {'at': at, 'op': f"""c => {{ {EVENTS} launchManager = {'true' if manager else 'false'};
      const m = rnEvents(rnDay());
      return m && {{date: m.date, live: m.live, special: m.special.map(x => [x.ev.id, x.when.state, x.when.text]),
        ongoing: m.ongoing.map(e => e.id), next: m.next && [m.next.date, m.next.list.map(e => e.id)]}}; }}"""}


def run(*cases):
    out = subprocess.run(['node', os.path.join(ROOT, 'tests', 'right_now_runner.js')], input=json.dumps({'cases': list(cases)}),
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


class TodayOnTheCalendar(unittest.TestCase):
    def test_what_shows_and_where_it_stands(self):
        before, live, over = run(model(THU_4PM), model(THU_6PM), model(THU_8PM))
        self.assertEqual(before['date'], '2026-10-22')
        self.assertEqual(before['special'], [['fam', 'soon', '5 PM–7 PM · starts in 1 h'], ['ns', 'allday', 'All day']])
        self.assertEqual(before['ongoing'], ['sample'])                      # a month long: "Also running"
        self.assertEqual(before['next'], ['2026-10-23', ['dt']])             # tomorrow's, a day's warning
        self.assertEqual(live['special'][0], ['fam', 'now', 'Happening now · until 7 PM'])
        self.assertEqual(over['special'], [['ns', 'allday', 'All day'], ['fam', 'done', 'Ended at 7 PM']])   # over goes last

    def test_before_opening_it_is_today(self):
        got = run(model(THU_6AM))[0]
        self.assertEqual([got['date'], got['live']], ['2026-10-22', True])
        self.assertEqual(got['special'][0], ['fam', 'later', '5 PM–7 PM'])

    def test_after_close_and_on_sunday_the_next_open_day(self):
        thu, sat = run(model(THU_11PM), model(SAT_11PM))
        self.assertEqual([thu['date'], thu['live'], thu['special'], thu['next']], ['2026-10-23', False, [['dt', 'later', '12 PM–1 PM']], None])
        self.assertEqual([sat['date'], sat['special']], ['2026-10-26', [['mon', 'later', '5 PM–8 PM']]])   # Monday, past Sunday

    def test_meetings_only_for_managers(self):
        team, mgr = run(model(THU_4PM), model(THU_4PM, manager=True))
        self.assertNotIn('mtg', [x[0] for x in team['special']])
        self.assertIn(['mtg', 'done', 'Ended at 4 PM'], mgr['special'])

    def test_nothing_on_the_calendar_nothing_shown(self):
        got = run({'at': '2026-11-03T12:00:00-06:00', 'op': f"c => {{ {EVENTS} return [rnEvents(rnDay()), rnEventRows(rnDay(), false)]; }}"})[0]
        self.assertEqual(got, [None, []])

    def test_quiet_lines_and_the_sheet(self):
        rows = "rnEventRows(rnDay(), %s, %s).map(r => [r.n, r.text, r.go, r.es, r.tone])"
        got = run({'at': THU_4PM, 'op': f"c => {{ {EVENTS} return {rows % ('false', 'false')}; }}"},
                  {'at': THU_6PM, 'op': f"c => {{ {EVENTS} return {rows % ('true', 'true')}; }}"},
                  {'at': THU_8PM, 'op': f"c => {{ {EVENTS} return {rows % ('false', 'true')}; }}"},
                  {'at': THU_6PM, 'op': f"c => {{ {EVENTS} return rnEventSheetHtml(storeEvents[0], '2026-10-22', true); }}"})
        self.assertEqual(got[0], [['', 'today: Family Night · 5 PM–7 PM · starts in 1 h', 'event:fam|2026-10-22', '', ''],
                                  ['', 'also today: No School, Sample: Coffee', 'event:ns|2026-10-22', '', ''],      # all day and the long ones: one line
                                  ['', 'tomorrow: Pack the Drive Thru · 12 PM', 'event:dt|2026-10-23', '', '']])
        # On now: "Now" in red, and the kitchen's line carries Spanish. Team members: the marketing events only.
        self.assertEqual(got[1], [['Now', 'today: Family Night · Happening now · until 7 PM', 'event:fam|2026-10-22', 'Ahora, hasta las 7 PM', 'bad'],
                                  ['', 'tomorrow: Pack the Drive Thru · 12 PM', 'event:dt|2026-10-23', 'Mañana', '']])
        self.assertEqual([r[1] for r in got[2]], ['tomorrow: Pack the Drive Thru · 12 PM'])       # over: it drops off
        for part in ('Family Night', 'Pumpkins &amp; Play', 'Thursday, October 22 · 5 PM–7 PM', 'Happening now · until 7 PM',
                     '<li>Paint pumpkins</li>', 'What to know', 'Open the calendar', 'aria-modal="true"'):
            self.assertIn(part, got[3])

    def test_after_the_persons_own_lines_and_not_for_a_new_hire(self):
        card = """c => { %s fohRoster[today] = [{name: 'Kai Mercer', start: '12:00p', end: '8:00p'%s}];
          posAssignments['foh||' + today + '||Dinner (5:00-8:00)||Drinks 1'] = 'Kai Mercer';
          acUser = %s; const c2 = rnCardFor(rnViewer(), rnDay()); return c2.rows.map(r => r.text); }"""
        member, hire, out = run({'at': THU_6PM, 'op': card % (EVENTS, '', "{role: 'member', name: 'Kai Mercer'}")},
                                {'at': THU_6PM, 'op': card % (EVENTS, ', training: true', "{role: 'member', name: 'Kai Mercer'}")},
                                {'at': THU_6PM, 'op': card % (EVENTS, '', 'null')})
        self.assertEqual(member[0], 'Your shift: 12:00p–8:00p')
        self.assertEqual(member[-2:], ['today: Family Night · Happening now · until 7 PM', 'tomorrow: Pack the Drive Thru · 12 PM'])
        self.assertFalse(any('Family Night' in t or 'Drive Thru' in t for t in hire))
        self.assertEqual(out[-1], 'Sign in with your clock-in PIN to see your spot')            # the events sit above it
        self.assertIn('today: Family Night · Happening now · until 7 PM', out)

    def test_event_text_is_escaped(self):
        got = run({'at': THU_6PM, 'op': """c => { storeEvents = [{id: 'x', kind: 'instore', title: '<img src=x onerror=alert(1)>', date: '2026-10-22', notes: ['<b>hi</b>']}];
          return JSON.stringify(rnEventRows(rnDay(), false)) + rnEventSheetHtml(storeEvents[0], '2026-10-22', false) + (() => { acUser = null; renderRightNow(); return ''; })(); }"""})[0]
        got = got.split('rn-evs-card')[1]                                         # the sheet's own HTML; a row's text goes through escapeHtml in renderRightNow
        self.assertNotIn('<img', got)
        self.assertNotIn('<b>hi', got)


class Wiring(unittest.TestCase):
    def test_quiet_lines_on_the_card(self):
        js = read('static', 'js', 'right-now.js')
        self.assertNotIn('rnEventsHtml', js)
        self.assertIn("const evs = rnEventRows(day, card.side === 'boh', !!card.team);", js)
        self.assertIn("else if(what === 'event') rnOpenEvent(parts[0], parts[1] || today, document.activeElement);", js)
        # A line's label, words and detail all go through escapeHtml (rnLineHtml).
        self.assertIn('<b class="rn-v">${escapeHtml(rnCap(p.value))}</b>', js)
        self.assertIn('<small class="rn-k">${escapeHtml(p.kicker)}</small>', js)
        self.assertIn('<span class="rn-d">${escapeHtml(detail)}</span>', js)
        self.assertIn('style="--dot:${escapeHtml(r.color)}"', js)                 # each event by its calendar colour
        self.assertIn("if(ev){ rnOpenEvent(ev.dataset.rnEv, ev.dataset.rnEvDate, ev); return; }", js)
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertLess(page.index('/static/js/events.js'), page.index('/static/js/right-now.js'))


if __name__ == '__main__':
    unittest.main()
