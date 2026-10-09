"""Manage → Events: reading the month's marketing calendar image
(static/js/events-import.js). The image work runs in the browser; these
check the text side with lines as they come off the store's November and
December 2026 calendars."""
import json
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, 'tests', 'events_import_runner.js')


def run(op, **extra):
    out = subprocess.run(['node', RUNNER], input=json.dumps({'cases': [dict(op=op, **extra)]}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[0]


class Times(unittest.TestCase):
    def t(self, text):
        r = run('c => eviParseTime(c.text)', text=text)
        return r and [r['from'], r['to']]

    def test_the_calendar_s_ways_of_writing_a_time(self):
        self.assertEqual(self.t('Cow Bingo 6-7 PM'), ['18:00', '19:00'])
        self.assertEqual(self.t('[TBD] Fall Festival 3pm-6pm'), ['15:00', '18:00'])
        self.assertEqual(self.t('11-12 PM & 6-7 PM'), ['11:00', '12:00'])     # the first of two
        self.assertEqual(self.t('Christmas Eve 6AM-4PM'), ['06:00', '16:00'])
        self.assertEqual(self.t("New Year's Day 10:30AM-4PM"), ['10:30', '16:00'])
        self.assertEqual(self.t('Receipt Day 11-8'), ['11:00', '20:00'])      # store hours

    def test_not_times(self):
        self.assertIsNone(self.t('MLG: 3ct strips w/Spicy CFA Sauce | Nov 16-21'))
        self.assertIsNone(self.t('Holiday Campaign Launches'))
        self.assertIsNone(self.t('Spm-6pm'))


class Events(unittest.TestCase):
    def ev(self, text, kind):
        return run('c => eviEventFromText(c.text, c.kind)', text=text, kind=kind)

    def test_name_detail_and_time(self):
        self.assertEqual(self.ev('Cow Bingo 6-7 PM', 'instore'), {'kind': 'instore', 'from': '18:00', 'to': '19:00', 'title': 'Cow Bingo'})
        self.assertEqual(self.ev('12 Days of Christmas: Medium Waffle Fries', 'drivethru'),
                         {'kind': 'drivethru', 'title': '12 Days of Christmas', 'detail': 'Medium Waffle Fries'})
        two = self.ev('Build-Your-Own Thank You Card (Arts & Crafts Event) 11-12 PM & 6-7 PM', 'instore')
        self.assertEqual((two['title'], two['from'], two['to'], two['detail']), ('Build-Your-Own Thank You Card (Arts & Crafts Event)', '11:00', '12:00', '11-12 PM & 6-7 PM'))

    def test_black_closings_are_heads_ups_not_social_posts(self):
        self.assertEqual(self.ev('Thanksgiving CLOSED', 'social')['kind'], 'note')
        self.assertEqual(self.ev('Christmas Eve 6AM-4PM', 'social')['kind'], 'note')
        self.assertEqual(self.ev('[Drop Off Donations]', 'social')['kind'], 'social')

    def test_misreads_cleaned(self):
        self.assertEqual(self.ev('Receipt Day Redemption Period (both stores}', 'drivethru')['title'], 'Receipt Day Redemption Period (both stores)')
        self.assertEqual(self.ev('® Holiday Campaign Launches', 'note')['title'], 'Holiday Campaign Launches')
        self.assertIsNone(self.ev('24', 'note'))


class Panel(unittest.TestCase):
    LINES = [
        {'x0': 10, 'text': 'Pre-Checklist'},
        {'x0': 20, 'text': '1. Internal Calendar'}, {'x0': 20, 'text': '2.Guest Facing Calendar'},
        {'x0': 20, 'text': '5. Individual event fliers in'}, {'x0': 34, 'text': 'restaurant'},
        {'x0': 10, 'text': 'Notes'},
        {'x0': 12, 'text': 'Cow Bingo'},
        {'x0': 23, 'text': '« Social blurb: “Join us in the'}, {'x0': 39, 'text': 'dining room for fun.”'},
        {'x0': 23, 'text': 's Ops Team: OE'},
        {'x0': 12, 'text': 'Fall Festival:'},
        {'x0': 23, 'text': '+ Admin Logistics: Supplies +'}, {'x0': 39, 'text': 'promotions'},
        {'x0': 12, 'text': 'Pajamas, Pals, & S’mores:'},
        {'x0': 23, 'text': '• Social blurb: Join us'},
    ]

    def test_checklist_and_notes(self):
        got = run('c => eviPanelFromLines(c.lines)', lines=self.LINES)
        self.assertEqual(got['checklist'], ['Internal Calendar', 'Guest Facing Calendar', 'Individual event fliers in restaurant'])
        self.assertEqual([n['heading'] for n in got['notes']], ['Cow Bingo', 'Fall Festival', 'Pajamas, Pals, & S’mores'])
        self.assertEqual(got['notes'][0]['items'], ['Social blurb: "Join us in the dining room for fun."', 'Ops Team: OE'])
        self.assertEqual(got['notes'][1]['items'], ['Admin Logistics: Supplies + promotions'])

    def test_notes_go_on_the_events_they_name(self):
        got = run("""c => { const evs = [{title: 'Cow Bingo'}, {title: 'Cow Bingo'}, {title: '[TBD] Fall Festival'}, {title: 'No School'}];
            const left = eviAttachNotes(evs, eviPanelFromLines(c.lines).notes); return [evs.map(e => (e.notes || []).length), left]; }""", lines=self.LINES)
        self.assertEqual(got, [[2, 2, 1, 0], ['Pajamas, Pals, & S’mores']])


class Dates(unittest.TestCase):
    def test_grid_squares_to_dates(self):
        # November 2026 starts on a Sunday; December's grid starts Nov 29.
        got = run("""c => [eviDateAt('2026-11', 0), eviDateAt('2026-12', 0), eviDateAt('2026-12', 1),
            eviDatedEvents([{kind: 'instore', title: 'Start Community Drive', start: 1}, {kind: 'drivethru', title: '12 Days of Christmas', start: 12},
                            {kind: 'note', title: 'Winter Break - No School', start: 22, end: 33}, {kind: 'goal', title: 'Monthly Goals'}], '2026-12')]""")
        self.assertEqual(got[:3], ['2026-11-01', '2026-11-29', '2026-11-30'])
        evs = got[3]
        self.assertEqual((evs[0]['date'], evs[0].get('outside')), ('2026-11-30', True))       # the grey day: kept, unticked
        self.assertEqual(evs[1]['date'], '2026-12-11')
        self.assertEqual((evs[2]['date'], evs[2]['end']), ('2026-12-21', '2026-12-31'))     # runs past the month: cut at its end
        self.assertEqual((evs[3]['date'], evs[3]['end']), ('2026-12-01', '2026-12-31'))

    def test_a_bar_on_two_rows_is_one_event(self):
        got = run("c => eviMergeBars([{kind: 'note', title: 'Winter Break - No School', start: 22, end: 26}, {kind: 'note', title: 'Winter Break - No School', start: 29, end: 33}])")
        self.assertEqual([(b['start'], b['end']) for b in got], [(22, 33)])

    def test_month_from_the_title(self):
        self.assertEqual(run("c => [eviMonthFromText('November 2026'), eviMonthFromText('Decembor 2026'), eviMonthFromText('Pre-Checklist')]"), ['2026-11', '2026-12', None])


class Review(unittest.TestCase):
    def test_small_misreads_take_the_calendar_s_own_name(self):
        got = run("""c => eviSnapTitles([{title: 'Community Outreact'}, {title: 'Community Outreach'}, {title: 'Community Outreach'}, {title: 'Cow Bingo'}, {title: 'Ornament Painting'}],
            ['Community Outreach']).map(f => f.title)""")
        self.assertEqual(got, ['Community Outreach', 'Community Outreach', 'Community Outreach', 'Cow Bingo', 'Ornament Painting'])

    def test_already_there(self):
        self.assertEqual(run("""c => [eviIsDuplicate({date: '2026-10-07', title: 'Community Outreach'}, [{date: '2026-10-07', title: 'community outreach'}]),
            eviIsDuplicate({date: '2026-10-14', title: 'Community Outreach'}, [{date: '2026-10-07', title: 'Community Outreach'}])]"""), [True, False])


class Page(unittest.TestCase):
    def test_wired_into_manage_events(self):
        with open(os.path.join(ROOT, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
            page = f.read()
        events = page[page.index('data-manage-tab="events"'):page.index('data-manage-tab="scoreboards"')]
        self.assertLess(events.index('id="eventsImportRoot"'), events.index('id="eventsManageRoot"'))
        self.assertLess(page.index('/static/js/events.js'), page.index('/static/js/events-import.js'))

    def test_library_pinned_and_loaded_only_when_used(self):
        with open(os.path.join(ROOT, 'static', 'js', 'events-import.js'), encoding='utf-8') as f:
            src = f.read()
        for url in re.findall(r"'(https://[^']+)'", src):
            self.assertRegex(url, r'@\d+\.\d+\.\d+', url)
        with open(os.path.join(ROOT, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
            self.assertNotIn('tesseract', f.read())


if __name__ == '__main__':
    unittest.main()
