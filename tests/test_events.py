"""The store events calendar (static/js/events.js), run in node: which events
fall on a day and in a daypart, and October 2026 as typed in from the
store's calendar."""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, 'tests', 'events_runner.js')


def run(*ops):
    out = subprocess.run(['node', RUNNER], input=json.dumps({'cases': [{'op': op} for op in ops]}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def titles(op):
    return run(f'c => {op}.map(e => e.title + (e.detail ? " · " + e.detail : ""))')[0]


class Calendar(unittest.TestCase):
    def test_free_breakfast_every_tuesday_6_to_1030(self):
        got = run("c => EVENTS_SEED.filter(e => e.title === 'Free Breakfast Tuesday').map(e => [e.date, e.detail, e.from, e.to, new Date(e.date + 'T00:00:00').getDay()])")[0]
        self.assertEqual(got, [['2026-10-06', 'Chicken Biscuit', '06:00', '10:30', 2], ['2026-10-13', '4ct Minis', '06:00', '10:30', 2],
                               ['2026-10-20', 'Sausage Biscuit', '06:00', '10:30', 2], ['2026-10-27', 'Chicken Biscuit', '06:00', '10:30', 2]])

    def test_drive_thru_push_fridays_noon_to_one(self):
        got = run("c => EVENTS_SEED.filter(e => e.title === 'Pack the Drive Thru').map(e => [e.date, new Date(e.date + 'T00:00:00').getDay(), e.from, e.to, /Buda \\(300\\)/.test(e.detail)])")[0]
        self.assertEqual(got, [['2026-10-09', 5, '12:00', '13:00', False], ['2026-10-16', 5, '12:00', '13:00', False],
                               ['2026-10-23', 5, '12:00', '13:00', False], ['2026-10-30', 5, '12:00', '13:00', True]])

    def test_a_day(self):
        self.assertEqual(titles("eventsOn('2026-10-22')"), [
            'Sample: Chicken & Waffles, S’mores Milkshake, Coffee Platform', 'Family Night: Pumpkins & Play'])
        self.assertIn('Halloween Week Promo · 30 COUNT = FREE 6 COUNT COOKIE; BOGO Trays (Small nugget tray = Free Small Cookie Tray; Large nugget tray = Large Cookie Tray)',
                      titles("eventsOn('2026-10-29')"))
        self.assertEqual(titles("eventsOn('2026-10-11')"), [])               # a Sunday: the samples run Mon-Sat
        self.assertEqual(titles("eventsOn('2026-10-31')"), [
            'Halloween · Regular Store Hours', 'Halloween Week Promo · 30 COUNT = FREE 6 COUNT COOKIE; BOGO Trays (Small nugget tray = Free Small Cookie Tray; Large nugget tray = Large Cookie Tray)',
            'Sample: Chicken & Waffles, S’mores Milkshake, Coffee Platform'])

    def test_monthly_goals_only_when_asked(self):
        self.assertNotIn('Monthly Goals · Catering · CFA One App Usage · Drive Thru', titles("eventsOn('2026-10-15')"))
        self.assertIn('Monthly Goals · Catering · CFA One App Usage · Drive Thru', titles("eventsOn('2026-10-15', {goals: true})"))

    def test_daypart_windows(self):
        # Breakfast 8:00-10:30, Lunch 10:30-1:00, Dinner 5:00-8:00 (in minutes)
        self.assertEqual(titles("eventsInWindow('2026-10-06', 480, 630)"), ['Free Breakfast Tuesday · Chicken Biscuit'])
        self.assertEqual(titles("eventsInWindow('2026-10-06', 630, 780)"), [])
        self.assertEqual(titles("eventsInWindow('2026-10-09', 630, 780)"), ['Pack the Drive Thru · drive thru push -WB (200) · drive thru +bonus points for mobile 12-1'])
        self.assertEqual(titles("eventsInWindow('2026-10-22', 1020, 1200)"), ['Family Night: Pumpkins & Play'])
        self.assertEqual(titles("eventsAllDay('2026-10-07')"), ['Community Outreach', 'Sample: Chicken & Waffles, S’mores Milkshake, Coffee Platform'])

    def test_saved_calendar_replaces_the_typed_in_one(self):
        got = run("c => { storeEvents = [{id: 'x', title: 'Spirit Night', kind: 'instore', date: '2026-11-03', from: '17:00', to: '20:00'}]; return [eventsOn('2026-10-06').length, eventsOn('2026-11-03').map(e => e.title)]; }")[0]
        self.assertEqual(got, [0, ['Spirit Night']])

    def test_every_seed_event_is_well_formed(self):
        bad = run("""c => EVENTS_SEED.filter(e => !e.id || !e.title || !EVENT_KINDS[e.kind] || !/^\\d{4}-\\d{2}-\\d{2}$/.test(e.date)
            || (e.end && e.end < e.date) || (!!e.from !== !!e.to)).map(e => e.id || e.title)""")[0]
        self.assertEqual(bad, [])
        ids = run('c => EVENTS_SEED.map(e => e.id)')[0]
        self.assertEqual(len(ids), len(set(ids)))


if __name__ == '__main__':
    unittest.main()
