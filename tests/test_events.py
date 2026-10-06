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


class CalendarPage(unittest.TestCase):
    """The Calendar tab's layout, drawn like the store's printed calendar."""

    def test_october_weeks_run_sunday_to_saturday(self):
        weeks = run("c => evMonthWeeks('2026-10').map(w => [w[0], w[6]])")[0]
        self.assertEqual(weeks, [['2026-09-27', '2026-10-03'], ['2026-10-04', '2026-10-10'], ['2026-10-11', '2026-10-17'],
                                 ['2026-10-18', '2026-10-24'], ['2026-10-25', '2026-10-31']])

    def test_multi_day_events_are_bars_shorter_on_top(self):
        got = run("c => evWeekLayout(evMonthWeeks('2026-10')[4]).bars.map(b => [b.ev.title.slice(0, 14), b.a, b.b, b.lane])")[0]
        self.assertEqual(got, [['Halloween Week', 3, 6, 0], ['Sample: Chicke', 1, 6, 1]])
        # The bars aren't repeated inside the days
        days = run("c => evWeekLayout(evMonthWeeks('2026-10')[4]).days.map(d => d.map(e => e.title))")[0]
        self.assertEqual(days[2], ['Free Breakfast Tuesday'])
        self.assertEqual(days[6], ['Halloween'])

    def test_first_week_has_september_30_outreach_and_no_bars(self):
        lay = run("c => { const l = evWeekLayout(evMonthWeeks('2026-10')[0]); return [l.bars.length, l.days.map(d => d.map(e => e.title))]; }")[0]
        self.assertEqual(lay[0], 0)
        self.assertEqual(lay[1][3], ['Community Outreach'])

    def test_month_items_never_land_on_a_day(self):
        self.assertNotIn('Pre-Checklist', titles("eventsOn('2026-10-15')"))
        got = run("c => [eventsForMonth('2026-10', 'checklist').map(e => e.notes.length), eventsForMonth('2026-10', 'goal').map(e => e.detail), eventsForMonth('2026-11', 'goal').length]")[0]
        self.assertEqual(got, [[5], ['Catering · CFA One App Usage · Drive Thru'], 0])

    def test_notes_box_lists_each_event_once(self):
        got = run("c => evNotesForMonth('2026-10').map(e => e.title)")[0]
        self.assertEqual(got, ['Free Breakfast Tuesday', 'Pack the Drive Thru', 'Family Night: Pumpkins & Play', 'Halloween Week Promo'])

    def test_hidden_without_a_manager_session(self):
        got = run("c => { const a = evCalendarShown(); launchManager = false; const b = evCalendarShown(); launchManager = true; return [a, b, evCalendarShown()]; }")[0]
        self.assertEqual(got, [True, False, True])


class KnowTheNumbers(unittest.TestCase):
    """The calendar's short store events count as Know the Numbers special events."""

    def test_which_october_events_count(self):
        got = run("c => [...new Set(eventsList().filter(evCountsForNumbers).map(e => e.title))]")[0]
        self.assertEqual(got, ['Free Breakfast Tuesday', 'Pack the Drive Thru', 'Family Night: Pumpkins & Play', 'Halloween Week Promo'])

    def test_by_daypart_window(self):
        got = run("""c => [eventsForNumbers('2026-10-06', 390, 630), eventsForNumbers('2026-10-06', 630, 840),
            eventsForNumbers('2026-10-09', 630, 840), eventsForNumbers('2026-10-22', 1020, 1260),
            eventsForNumbers('2026-10-29', 390, 630), eventsForNumbers('2026-10-30'), eventsForNumbers('2026-10-07')]""")[0]
        self.assertEqual(got, [['Free Breakfast Tuesday'], [], ['Pack the Drive Thru'], ['Family Night: Pumpkins & Play'],
                               ['Halloween Week Promo'], ['Halloween Week Promo', 'Pack the Drive Thru'], []])

    def test_a_manager_can_tick_or_untick_one(self):
        got = run("""c => { storeEvents = JSON.parse(JSON.stringify(EVENTS_SEED));
            storeEvents.find(e => e.id === 'oct26-freebkfst-06').kn = false;
            storeEvents.find(e => e.id === 'oct26-outreach-07').kn = true;
            return [eventsForNumbers('2026-10-06'), eventsForNumbers('2026-10-07'), eventsForNumbers('2026-10-13')]; }""")[0]
        self.assertEqual(got, [[], ['Community Outreach'], ['Free Breakfast Tuesday']])

    def test_typed_text_comes_first_without_repeats(self):
        got = run("""c => { knDaypartOf = dp => dp; knWindowOf = dp => dp.w;
            const bk = {name: 'Breakfast', w: {start: 390, end: 630}}, ln = {name: 'Lunch', w: {start: 630, end: 840}};
            return [knSpecialEventsText('Catering pickup 7am', '2026-10-06', bk), knSpecialEventsText('free breakfast tuesday', '2026-10-06', bk),
                    knSpecialEventsText('', '2026-10-06', ln), knSpecialEventsText('', '2026-10-09', ln)]; }""")[0]
        self.assertEqual(got, ['Catering pickup 7am · Free Breakfast Tuesday', 'free breakfast tuesday', '', 'Pack the Drive Thru'])

    def test_rule(self):
        got = run("""c => [evCountsByRule({kind: 'instore', date: '2026-11-01', end: '2026-11-07'}), evCountsByRule({kind: 'instore', date: '2026-11-01', end: '2026-11-08'}),
            evCountsByRule({kind: 'app', date: '2026-11-03'}), evCountsByRule({kind: 'food', date: '2026-11-03'}), evCountsForNumbers({kind: 'goal', date: '2026-11-01', kn: true})]""")[0]
        self.assertEqual(got, [True, False, True, False, False])


if __name__ == '__main__':
    unittest.main()
