"""Today on the calendar, on Home's Right Now card (Tim, Oct 25 2026): a
store event on a Thursday was missed, so the day's events open every card,
for every role, and a tap opens the one event on its own. The short ones
get the block; month-long ones ride on an "Also running" line; the next
open day's sit under it. Before opening it's today's; after close and on
Sunday, the next open day's. Leadership meetings only for managers.

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
        got = run({'at': '2026-11-03T12:00:00-06:00', 'op': f"c => {{ {EVENTS} return [rnEvents(rnDay()), rnEventsHtml(rnDay(), false)]; }}"})[0]
        self.assertEqual(got, [None, ''])

    def test_the_block_and_the_sheet(self):
        got = run({'at': THU_6PM, 'op': f"""c => {{ {EVENTS} const fam = storeEvents[0];
          return [rnEventsHtml(rnDay(), true), rnEventSheetHtml(fam, '2026-10-22', true)]; }}"""})[0]
        block, sheet = got
        self.assertIn('Today on the calendar', block)
        self.assertIn('Hoy en el calendario', block)                          # the kitchen's card carries Spanish
        self.assertIn('data-rn-ev="fam" data-rn-ev-date="2026-10-22"', block)
        self.assertIn('Also running', block)
        self.assertIn('Tomorrow', block)
        for part in ('Family Night', 'Pumpkins &amp; Play', 'Thursday, October 22 · 5 PM–7 PM', 'Happening now · until 7 PM',
                     '<li>Paint pumpkins</li>', 'What to know', 'Open the calendar', 'aria-modal="true"'):
            self.assertIn(part, sheet)

    def test_event_text_is_escaped(self):
        got = run({'at': THU_6PM, 'op': """c => { storeEvents = [{id: 'x', kind: 'instore', title: '<img src=x onerror=alert(1)>', date: '2026-10-22', notes: ['<b>hi</b>']}];
          return rnEventsHtml(rnDay(), false) + rnEventSheetHtml(storeEvents[0], '2026-10-22', false); }"""})[0]
        self.assertNotIn('<img', got)
        self.assertNotIn('<b>hi', got)


class Wiring(unittest.TestCase):
    def test_on_every_card_under_the_title(self):
        js = read('static', 'js', 'right-now.js')
        self.assertIn("</h2>\n    ${rnEventsHtml(day, boh, !!card.team)}", js)
        self.assertIn("if(ev){ rnOpenEvent(ev.dataset.rnEv, ev.dataset.rnEvDate, ev); return; }", js)
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertLess(page.index('/static/js/events.js'), page.index('/static/js/right-now.js'))


if __name__ == '__main__':
    unittest.main()
