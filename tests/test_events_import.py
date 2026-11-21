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
        self.assertEqual(self.t('Receipt Day 1Mam-8pm'), ['11:00', '20:00'])   # bold "11am" misread (Canva's PNG, Nov 2026)

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
        # Words after a time in the middle of the square are the detail.
        self.assertEqual(self.ev('West Buda 1 Year Bday! 5-8 PM event Free cookie (all day)', 'instore'),
                         {'kind': 'instore', 'from': '17:00', 'to': '20:00', 'title': 'West Buda 1 Year Bday!', 'detail': 'event Free cookie (all day)'})
        self.assertEqual(self.ev('Receipt Day 1Mam-8pm All Drive Thru only', 'note'),
                         {'kind': 'note', 'from': '11:00', 'to': '20:00', 'title': 'Receipt Day', 'detail': 'All Drive Thru only'})

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
        {'x0': 12, 'text': 'West Buda 1 Year Birthday'}, {'x0': 12, 'text': 'Celebration'},   # a heading that wrapped
        {'x0': 23, 'text': '« See notes in event breakdown'}, {'x0': 39, 'text': 'below!'},
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
        self.assertEqual([n['heading'] for n in got['notes']], ['West Buda 1 Year Birthday Celebration', 'Cow Bingo', 'Fall Festival', 'Pajamas, Pals, & S’mores'])
        self.assertEqual(got['notes'][0]['items'], ['See notes in event breakdown below!'])
        self.assertEqual(got['notes'][1]['items'], ['Social blurb: "Join us in the dining room for fun."', 'Ops Team: OE'])
        self.assertEqual(got['notes'][2]['items'], ['Admin Logistics: Supplies + promotions'])

    def test_notes_go_on_the_events_they_name(self):
        got = run("""c => { const evs = [{title: 'Cow Bingo'}, {title: 'Cow Bingo'}, {title: '[TBD] Fall Festival'}, {title: 'No School'}];
            const left = eviAttachNotes(evs, eviPanelFromLines(c.lines).notes); return [evs.map(e => (e.notes || []).length), left]; }""", lines=self.LINES)
        self.assertEqual(got, [[2, 2, 1, 0], ['West Buda 1 Year Birthday Celebration', 'Pajamas, Pals, & S’mores']])


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


# The events page (the template's second page), as its columns come off the
# store's November 2026 page: {text, x0, y0} for each line of one column.
def column(*rows):
    return [{'text': t, 'x0': x, 'y0': y} for x, y, t in rows]


COW_BINGO = column(
    (110, 21, 'Thursday, 11/19/26'), (97, 62, 'Cow Bingo (PM only)'),
    (8, 141, 'When: Thursday, November 19, 2026, 6-7 PM only'), (8, 166, 'Where: Dining Room'),
    (8, 191, 'What: Family fun with cow-themed bingo'), (8, 241, 'While supplies last.'),
    (9, 291, 'Materials:'), (19, 316, 'eo Cow & Cow Handler'), (19, 341, '* Bingo materials'),
    (9, 391, '“Join us in the dining room on Thursday, November 19'), (8, 416, 'from 6pm-7pm for fun with the family and a chance to'),
    (8, 441, 'earn sweet prizes.”'),
    (9, 490, 'Labor Needs: 2 Team Members (Cow and Handler) 6'), (9, 516, 'PM - 7 PM. Handler will be host.'))

BIRTHDAY = column(
    (118, 20, 'Friday, 11/6/26'), (39, 64, 'West Buda 1 Year Birthday'),
    (9, 146, 'When: Friday, November 6, 2026, 5-8 PM'), (9, 173, 'Where: CFA West Buda'),
    (9, 335, 'While supplies last.'),
    (10, 389, 'Materials:'), (23, 417, 'e DJ'), (23, 444, '¢ Photobooth'), (23, 471, 'e EMS, Fire, Police'),
    (10, 630, '“#% West Buda is turning ONE! $%'), (9, 687, 'Come celebrate with us Friday, November 6,'),
    (9, 714, 'from 5-8 PM!'), (9, 821, 'cow from 6-7 PM! ¥'),
    (15, 982, '® Chick-fil-A West Buda only. We can’t wait to'), (9, 1012, 'celebrate with you!”'),
    (10, 1066, 'Labor Needs: 2-3 people to host'))

THANK_YOU = column(
    (119, 21, 'Monday, 11/23/26'), (24, 63, 'Build Your Own Thank You Card'),
    (9, 141, 'When: Monday, November 23, 2025, 11-12 PM & 6-7'), (10, 166, 'PM'),
    (9, 266, 'Theme: “Thankful Hearts, Creative Hands”'),
    (10, 491, '“Join us this Monday for a little creativity and a lot of'), (9, 516, 'gratitude!'),
    (9, 666, 'All cards will be shared with our local heroes or you'), (9, 713, 'you this fall. We'),
    (10, 766, 'Labor Needs: 2 Team Members to Host'),
    (9, 824, '[#] Event Concept'), (10, 845, '“Build-Your-Own Thank You Card”'), (17, 866, 'Join us for a hands-on craft event'),
    (9, 887, 'Two ways to give thanks:'), (23, 908, 'o Community Heroes Table: Write a card for our local first'),
    (36, 929, 'responders.'), (22, 950, '* Someone You Love Table: Create a card to take home.'),
    (9, 971, '£ Timing & Logistics'), (10, 992, 'Date: Monday, November 23, 2026'), (9, 1013, 'Theme: Thankful Hearts, Creative Hands'),
    (9, 1034, 'Supplies:'), (23, 1055, '* Blank cards, envelopes, markers'), (23, 1076, 'o Two baskets or boxes'),
    (9, 1097, '& Short Blurb for Flyer or Social Media Post'), (10, 1118, 'Build-Your-Own Thank You Card Event!'),
    (13, 1139, '*] Choose to:'), (14, 1160, '+» Write a card for our Community Heroes — we’ll deliver them to'),
    (10, 1181, 'local first responders!'), (13, 1202, '» Or make one to take home and give to someone you love.'))


class EventsPage(unittest.TestCase):
    def read(self, lines):
        return run('c => eviDetailFromLines(c.lines)', lines=lines)

    def test_the_date_heading(self):
        got = run("c => [eviDetailDate('Friday, 11/6/26'), eviDetailDate('Thursday, 11/19/2026'), eviDetailDate('November 2026'), eviDetailDate('Friday, 13/40/26')]")
        self.assertEqual(got, ['2026-11-06', '2026-11-19', None, None])
        self.assertIsNone(self.read(column((10, 10, 'Catering: Football trays'), (10, 40, 'When: 5-8 PM'))))

    def test_a_column_becomes_the_events_details(self):
        got = self.read(COW_BINGO)
        self.assertEqual((got['date'], got['title'], got['from'], got['to']), ('2026-11-19', 'Cow Bingo (PM only)', '18:00', '19:00'))
        self.assertEqual(got['details'], [
            'When: Thursday, November 19, 2026, 6-7 PM only', 'Where: Dining Room', 'What: Family fun with cow-themed bingo',
            'While supplies last.', 'Materials: Cow & Cow Handler; Bingo materials',
            'Social blurb: "Join us in the dining room on Thursday, November 19 from 6pm-7pm for fun with the family and a chance to earn sweet prizes."',
            'Labor Needs: 2 Team Members (Cow and Handler) 6 PM - 7 PM. Handler will be host.'])

    def test_emoji_read_as_type_are_dropped(self):
        got = self.read(BIRTHDAY)
        post = [d for d in got['details'] if d.startswith('Social blurb')][0]
        # 🎉 read as "#%" / "$%", 🐮 as "¥", 📍 as "®": gone, and the pin's line stays in the post.
        self.assertEqual(post, 'Social blurb: "West Buda is turning ONE! Come celebrate with us Friday, November 6, from 5-8 PM! cow from 6-7 PM! '
                               'Chick-fil-A West Buda only. We can’t wait to celebrate with you!"')
        self.assertIn('Materials: DJ; Photobooth; EMS, Fire, Police', got['details'])
        self.assertEqual(got['details'][-1], 'Labor Needs: 2-3 people to host')

    def test_a_big_event_s_sections(self):
        got = self.read(THANK_YOU)
        self.assertEqual((got['from'], got['to']), ('11:00', '12:00'))   # the first of two
        d = got['details']
        self.assertEqual(d[0], 'When: Monday, November 23, 2025, 11-12 PM & 6-7 PM')   # as printed, year and all
        self.assertIn('Social blurb: "Join us this Monday for a little creativity and a lot of gratitude! All cards will be shared with our local heroes or you you this fall."', d)   # 🍁 read as "We"
        self.assertIn('Event Concept: "Build-Your-Own Thank You Card" Join us for a hands-on craft event Two ways to give thanks: '
                      'Community Heroes Table: Write a card for our local first responders. Someone You Love Table: Create a card to take home.', d)
        self.assertIn('Supplies: Blank cards, envelopes, markers; Two baskets or boxes', d)
        self.assertIn('Choose to: Write a card for our Community Heroes — we’ll deliver them to local first responders! Or make one to take home and give to someone you love.', d)
        self.assertIn('Short Blurb for Flyer or Social Media Post: Build-Your-Own Thank You Card Event!', d)
        self.assertEqual([x for x in d if x.startswith('Theme')], ['Theme: "Thankful Hearts, Creative Hands"'])   # said twice, kept once

    def test_which_event_it_goes_on(self):
        evs = [{'date': '2026-11-06', 'kind': 'instore', 'title': 'West Buda 1 Year Bday!'},
               {'date': '2026-11-06', 'kind': 'note', 'title': 'No School'},
               {'date': '2026-11-13', 'kind': 'note', 'title': 'Receipt Day'},
               {'date': '2026-11-13', 'kind': 'note', 'title': 'Receipt Day All Drive Thru only'},
               {'date': '2026-11-01', 'kind': 'goal', 'title': 'Monthly Goals'},
               {'date': '2026-11-19', 'kind': 'food', 'title': 'Community Outreach'},
               {'date': '2026-11-19', 'kind': 'instore', 'title': 'Cow Bingo'}]
        got = run("""c => [['2026-11-06', 'West Buda 1 Year Birthday'], ['2026-11-13', 'Receipt Day'], ['2026-11-19', 'Cow Bingo (PM only)'],
            ['2026-11-01', 'Monthly Goals'], ['2026-11-20', 'Cow Bingo']].map(([date, title]) => eviDetailMatches({date, title}, c.evs))""", evs=evs)
        self.assertEqual(got, [[0], [2, 3], [6], [], []])

    def test_details_go_on_once_and_fill_a_missing_time(self):
        got = run("""c => {
            const d = {date: '2026-11-06', title: 'West Buda 1 Year Birthday', details: ['Where: CFA West Buda', 'Labor Needs: 2-3 people to host'], from: '17:00', to: '20:00'};
            const bare = {title: 'West Buda 1 Year Bday!', date: '2026-11-06'};
            const timed = {title: 'Cow Bingo', from: '18:00', to: '19:00', details: ['Where: CFA West Buda']};
            return [eviDetailChange(bare, d), eviApplyDetail({...bare}, d), eviDetailChange(timed, d), eviApplyDetail({...timed}, d).details,
                    eviDetailChange(eviApplyDetail({...bare}, d), d)]; }""")
        self.assertEqual(got[0], {'adds': 2, 'time': '17:00–20:00'})
        self.assertEqual(got[1], {'title': 'West Buda 1 Year Bday!', 'date': '2026-11-06', 'details': ['Where: CFA West Buda', 'Labor Needs: 2-3 people to host'], 'from': '17:00', 'to': '20:00'})
        self.assertEqual(got[2], {'adds': 1, 'time': ''})
        self.assertEqual(got[3], ['Where: CFA West Buda', 'Labor Needs: 2-3 people to host'])
        self.assertEqual(got[4], {'adds': 0, 'time': ''})   # read again: nothing new


class Page(unittest.TestCase):
    def test_wired_into_manage_events(self):
        with open(os.path.join(ROOT, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
            page = f.read()
        events = page[page.index('data-manage-tab="calendar"'):].split('</section>')[0]   # Manage → Calendar (Tim, Oct 21 2026)
        self.assertLess(events.index('id="eventsImportRoot"'), events.index('id="eventsManageRoot"'))
        self.assertLess(page.index('/static/js/events.js'), page.index('/static/js/events-import.js'))
        with open(os.path.join(ROOT, 'static', 'js', 'events-import.js'), encoding='utf-8') as f:
            src = f.read()
        self.assertIn('.zip', src[src.index('data-evi-file') - 120:src.index('data-evi-file')])   # Canva's download is a zip
        self.assertIn('duLoadJsZip', src)
        self.assertIn('eviReadDetailPage(worker, c)', src)   # the events page, alone or in the zip

    def test_library_pinned_and_loaded_only_when_used(self):
        with open(os.path.join(ROOT, 'static', 'js', 'events-import.js'), encoding='utf-8') as f:
            src = f.read()
        for url in re.findall(r"'(https://[^']+)'", src):
            self.assertRegex(url, r'@\d+\.\d+\.\d+', url)
        with open(os.path.join(ROOT, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
            self.assertNotIn('tesseract', f.read())


if __name__ == '__main__':
    unittest.main()
