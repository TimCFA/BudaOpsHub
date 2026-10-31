"""Home's Right Now card (Tim, Oct 19 2026): the welcome banner and quote
first, then what matters this minute for whoever holds the phone. A Team
Member sees their own spot, shift, break and zone; a Trainer adds the open
spots on their side; a Team Lead gets their side's shift; a director or the
manager PIN gets the whole store, the rest of the day and the leaders on; a
phone nobody signed in on gets the shift as a whole and a way to sign in.

Run: python3 -m unittest discover tests
Runs right-now.js in node (tests/right_now_runner.js). Names are made up.
"""
import json
import re
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MON_5PM = '2026-10-19T17:10:00-05:00'       # Monday, Dinner


def run(*cases):
    out = subprocess.run(['node', os.path.join(ROOT, 'tests', 'right_now_runner.js')], input=json.dumps({'cases': list(cases)}),
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


# A FOH team member on the Dinner set up, with a break at 6:30.
SETUP = """
  fohRoster[today] = [{name: 'Ana Ruiz Lopez', start: '12:00p', end: '8:30p'}, {name: 'Leo Park', start: '2:00p', end: '10:30p', leader: true}];
  bohRoster[today] = [{name: 'Sam Ortiz', start: '1:30p', end: '10:30p'}];
  posAssignments['foh||' + today + '||Dinner (5:00-8:00)||Drinks 1'] = 'Ana Ruiz Lopez';
  posAssignments['foh||' + today + '||Close (8:00-10:00)||Host 1'] = 'Ana Ruiz Lopez';
  posAssignments['boh||' + today + '||Dinner (5:00-8:00)||Breader 1'] = 'Sam Ortiz';
  breaks.foh = [{name: 'Ana Ruiz Lopez', start: 18 * 60 + 30}];
"""


def card(role, name='', setup=SETUP, extra=''):
    return f"""c => {{ {setup} {extra}
      acUser = {json.dumps({'role': role, 'name': name}) if role else 'null'};
      launchManager = {'true' if role in ('director', 'manager') else 'false'};
      const v = rnViewer(), card = rnCardFor(v, rnDay());
      return {{role: v.role, side: card.side, title: card.title || '', kicker: card.kicker || '', first: card.first ? card.first.text : '',
        firstEs: card.first ? card.first.es || '' : '', firstGo: card.first ? card.first.go || '' : '',
        rows: card.rows.map(r => [r.n, r.text, r.go, r.es]),
        roster: card.roster ? card.roster.map(g => [g.label, g.onNow, g.people.map(p => [p.name, p.time, p.state, p.leader])]) : null}};
    }}"""


class Names(unittest.TestCase):
    def test_pin_list_and_schedule_names_match(self):
        got = run({'op': """c => [rnSame('Ana Ruiz', 'Ana Ruiz Lopez'), rnSame('ana ruiz lopez', 'Ana Ruiz Lopez'), rnSame('Ana Lopez', 'Ana Ruiz Lopez'),
                     rnSame('Ana Park', 'Ana Ruiz Lopez'), rnSame('Ana', 'Ana Ruiz'), rnSame('', 'Ana'), rnClock(14 * 60 + 5), rnClock(0), rnSentence('With Alyssa C.')]"""})[0]
        self.assertEqual(got, [True, True, True, False, False, False, '2:05', '12:00', 'With Alyssa C.'])


class WhoIsHolding(unittest.TestCase):
    def test_roles(self):
        got = run(*[{'op': f"""c => {{ acUser = {u}; launchManager = {m}; return rnViewer().role; }}"""}
                    for u, m in (('null', 'false'), ("{role: 'member', name: 'A B'}", 'false'), ("{role: 'trainer', name: 'A B'}", 'false'),
                                 ("{role: 'lead', name: 'A B'}", 'false'), ("{role: 'admin', name: 'A B'}", 'false'), ("{role: 'director', name: ''}", 'true'), ("{role: 'manager', name: ''}", 'true'),
                                 # The server's manager session decides (a team PIN never gets one)
                                 ("{role: 'member', name: 'A B'}", 'true'))])
        self.assertEqual(got, ['none', 'member', 'trainer', 'lead', 'admin', 'director', 'manager', 'director'])


class TeamMember(unittest.TestCase):
    def test_their_spot_and_shift_no_break_or_waste(self):
        got = run({'op': card('member', 'Ana Ruiz')})[0]
        self.assertEqual(got['title'], 'Hi, Ana')
        self.assertEqual(got['first'], 'You’re on Drinks 1 until 8:00.')
        self.assertEqual(got['firstGo'], 'setups:foh|2026-10-19|Dinner (5:00-8:00)')
        texts = [r[1] for r in got['rows']]
        self.assertNotIn('Now: Drinks 1 (Dinner)', texts)            # already the first thing
        self.assertIn('Next: Host 1 (Close)', texts)
        self.assertIn('Your shift: 12:00p–8:30p', texts)
        self.assertIn(['', 'Your shift: 12:00p–8:30p', 'myweek:2026-10-19'], [r[:3] for r in got['rows']])   # opens their week on the Schedule
        # Tim, Oct 28 2026: what a team member needs, no break or waste line.
        self.assertFalse(any('break' in t or 'waste' in t for t in texts))
        # Nothing about other people's gaps: that's the lead's.
        self.assertFalse(any('open spot' in t or 'no spot' in t for t in texts))

    def test_a_break_long_past_is_left_to_the_leader(self):
        got = run({'op': card('member', 'Ana Ruiz', extra="breaks.foh = [{name: 'Ana Ruiz Lopez', start: 15 * 60}];")})[0]
        self.assertFalse(any(r[1] == 'your break' for r in got['rows']))

    def test_on_break_the_time_left_comes_first(self):
        """Tim, Oct 30 2026: signed in and on break, their card shows the
        time left, counting down; their spot rows stay under it."""
        got = run({'op': card('member', 'Ana Ruiz', extra="breakCountdowns['foh||' + today + '||Ana Ruiz Lopez'] = Date.now() + 20 * 60000;")},
                  {'op': card('member', 'Ana Ruiz', extra="breakCountdowns['foh||' + today + '||Ana Ruiz Lopez'] = Date.now() - 60000;")},
                  {'op': """c => { """ + SETUP + """ breakCountdowns['foh||' + today + '||Ana Ruiz Lopez'] = Date.now() + 754000;
                       const f = rnPersonCard({role: 'member', name: 'Ana Ruiz'}, rnDay(), false).first; return [f.until > Date.now(), rnBreakHtml(f)]; }"""})
        self.assertEqual(got[0]['first'], 'On break, back at 5:30.')
        self.assertEqual(got[0]['firstEs'], 'En descanso, regresa a las 5:30')
        self.assertIn('Next: Host 1 (Close)', [r[1] for r in got[0]['rows']])
        self.assertEqual(got[1]['first'], 'You’re on Drinks 1 until 8:00.')                 # a break that's over: back to the spot
        self.assertTrue(got[2][0])
        self.assertRegex(got[2][1], r'^On break: <b class="rn-break-left" data-rn-break-until="\d+">12:3[34]</b> left, back at 5:2[23]\.$')
        js = read('static', 'js', 'right-now.js')
        self.assertIn("document.querySelectorAll('#rightNow [data-rn-break-until]')", js)     # ticks every second
        self.assertIn('${card.first.until ? rnBreakHtml(card.first) : escapeHtml(card.first.text)}', js)

    def test_their_zone_at_the_coming_handoff(self):
        got = run({'op': card('member', 'Ana Ruiz', extra="""handoff = {name: 'Dinner to Late Night (7:00pm - 8:00pm)', owners: {Restrooms: ['Ana Ruiz Lopez']}, done: {Restrooms: {checked: 1, total: 8}}};""")},
                  {'op': card('member', 'Ana Ruiz', extra="""handoff = {name: 'Dinner to Late Night (7:00pm - 8:00pm)', owners: {Restrooms: ['Ana Ruiz Lopez']}, done: {Restrooms: {checked: 1, total: 8}}};"""),
                   'at': '2026-10-19T18:45:00-05:00'})
        self.assertIn(['1/8', 'your zone: Restrooms · Dinner → Late Night at 7:00', 'zone:Dinner to Late Night (7:00pm - 8:00pm)', ''], got[0]['rows'])
        self.assertEqual(got[0]['first'], 'You’re on Drinks 1 until 8:00.')
        # Within half an hour of the handoff the zone comes first.
        self.assertEqual(got[1]['first'], 'Reset Restrooms for the Dinner → Late Night handoff (1 of 8 done).')

    def test_not_on_the_schedule_and_no_spot_yet(self):
        got = run({'op': card('member', 'Nobody Here')},
                  {'op': card('member', 'Ana Ruiz', extra="posAssignments = {};")})
        self.assertEqual(got[0]['first'], 'You’re not on today’s schedule.')
        self.assertEqual(got[1]['first'], 'No spot yet for Dinner. Check with your leader.')

    def test_truck_and_office_shifts_count(self):
        # Tim, Oct 25 2026: an office shift on Monday, and the card said he wasn't on.
        office = "adminShifts['2026-10-19'] = [{name: 'Jordan Testcase', start: '11:30a', end: '2:30p'}];"
        sunday, before, during = run({'op': card('member', 'Jordan Testcase', setup=office), 'at': '2026-10-18T15:00:00-05:00'},
                                     {'op': card('member', 'Jordan Testcase', setup=office), 'at': '2026-10-19T09:00:00-05:00'},
                                     {'op': card('member', 'Jordan Testcase', setup=office), 'at': '2026-10-19T12:00:00-05:00'})
        self.assertEqual(sunday['first'], 'Monday: your shift is 11:30a–2:30p (Office).')
        self.assertEqual(sunday['rows'][0][1:3], ['Your shift Monday: 11:30a–2:30p (Office)', 'myweek:2026-10-19'])
        self.assertEqual(before['first'], 'Your shift starts at 11:30.')
        self.assertEqual(during['first'], 'Your Office shift today: 11:30a–2:30p.')
        self.assertIn('Your shift: 11:30a–2:30p (Office)', [r[1] for r in during['rows']])
        # A truck shift beside a FOH one: both, in time order; the spot still comes first.
        both = run({'op': card('member', 'Ana Ruiz', extra="truckShifts[today] = [{name: 'Ana Ruiz Lopez', start: '5:00a', end: '8:00a'}];")})[0]
        self.assertEqual(both['first'], 'You’re on Drinks 1 until 8:00.')
        self.assertIn('Your shift: 5:00a–8:00a (Truck), 12:00p–8:30p', [r[1] for r in both['rows']])

    def test_accents_do_not_count(self):
        got = run({'op': "c => [rnSame('José Ruiz', 'Jose Ruiz'), rnSame('Ana Muñoz', 'Ana Munoz Lopez')]"})[0]
        self.assertEqual(got, [True, True])

    def test_after_close_it_looks_at_the_next_day(self):
        # Saturday night: the next open day is Monday.
        got = run({'op': card('member', 'Ana Ruiz', setup=SETUP.replace('today]', 'mon]').replace("'||Dinner", "'||Dinner").replace("+ today +", "+ mon +"),
                              extra="") .replace('{ ', "{ const mon = '2026-10-19'; ", 1), 'at': '2026-10-17T23:30:00-05:00'})[0]   # Saturday closes at 11 (Tim, Oct 30 2026)
        self.assertEqual(got['kicker'], 'Monday')
        self.assertEqual(got['first'], 'Monday: Drinks 1 at Dinner.')

    def test_kitchen_lines_carry_spanish(self):
        got = run({'op': card('member', 'Sam Ortiz')})[0]
        self.assertEqual(got['side'], 'boh')
        self.assertEqual(got['firstEs'], 'Estás en Empanizador 1 hasta las 8:00')


class Trainer(unittest.TestCase):
    def test_adds_the_open_spots_on_their_side(self):
        got = run({'op': card('trainer', 'Sam Ortiz', extra="gaps['boh|Dinner'] = {open: ['Breader 2', 'Fries'], unplaced: [], filled: 5};")})[0]
        self.assertIn(['2', 'open spots on BOH for Dinner', 'spot:boh|Dinner (5:00-8:00)|Breader 2', 'Lugares abiertos ahora'], got['rows'])
        self.assertEqual(got['first'], 'You’re on Breader 1 until 8:00.')


class TeamLead(unittest.TestCase):
    def test_their_sides_shift(self):
        got = run({'op': card('lead', 'Leo Park', extra="""gaps['foh|Dinner'] = {open: ['iPOS 1 (Captain)', 'Host 2'], unplaced: ['Mia Cole'], filled: 9};
                     gaps['boh|Dinner'] = {open: ['Fries'], unplaced: [], filled: 6};
                     breaks.foh = [{name: 'Mia Cole', start: 17 * 60 + 25}, {name: 'Ana Ruiz Lopez', start: 19 * 60}];""")})[0]
        self.assertEqual(got['first'], 'Nobody is on iPOS 1 (Captain) for Dinner.')
        self.assertEqual(got['firstGo'], 'spot:foh|Dinner (5:00-8:00)|iPOS 1 (Captain)')
        texts = [r[1] for r in got['rows']]
        self.assertEqual(texts[0], 'open spots for Dinner')
        self.assertIn('on the clock with no spot: Mia', texts)
        self.assertIn('break due: Mia 5:25', texts)                   # 7:00 is more than half an hour out
        self.assertIn('Food Safety walkthrough today', texts)
        self.assertFalse(any('BOH' in t for t in texts))              # Leo is on the FOH schedule
        self.assertFalse(any(t.startswith('leaders on') for t in texts))   # the director's

    def test_all_covered(self):
        got = run({'op': card('lead', 'Leo Park')})[0]
        self.assertEqual(got['first'], 'Dinner is covered. Go catch someone doing it right.')


class Director(unittest.TestCase):
    def test_the_whole_store_and_the_rest_of_the_day(self):
        got = run({'op': card('director', '', extra="""gaps['foh|Dinner'] = {open: ['Host 2'], unplaced: ['Mia Cole'], filled: 9};
                     gaps['boh|Dinner'] = {open: ['Fries'], unplaced: ['Mia Cole'], filled: 6};
                     gaps['foh|Close'] = {open: ['Floors'], unplaced: [], filled: 4};""")})[0]
        texts = [r[1] for r in got['rows']]
        self.assertEqual(got['first'], 'Nobody is on Host 2 for Dinner (FOH).')
        self.assertIn('FOH open spot for Dinner', texts)
        self.assertIn('BOH open spot for Dinner', texts)
        self.assertIn('on the clock with no spot: Mia', texts)        # on both schedules: once
        self.assertIn('open later today: Close FOH 1', texts)
        self.assertIn('leader on: Leo', texts)

    def test_after_close_tomorrows_set_ups(self):
        got = run({'op': card('director', '', extra="gaps['foh|Lunch'] = {open: ['Host 2', 'OMD 2'], unplaced: [], filled: 10};"), 'at': '2026-10-19T22:30:00-05:00'})[0]
        self.assertEqual(got['kicker'], 'Tuesday')
        self.assertEqual(got['first'], 'Tuesday’s FOH Set Ups have 2 open spots.')
        self.assertEqual([r[1] for r in got['rows']], ['FOH Set Ups filled for Tuesday', 'BOH Set Ups filled for Tuesday'])


# The rest of Monday's schedule: done, later, truck and admin, and Leo on
# BOH for an hour too.
DAY = """
  fohRoster[today].push({name: 'Kim Lee', start: '6:00a', end: '2:00p'}, {name: 'Max Doe', start: '6:00p', end: '10:00p', training: true});
  bohRoster[today].push({name: 'Leo Park', start: '5:00p', end: '6:00p'});
  truckShifts[today] = [{name: 'Tia Wells', start: '10:00a', end: '3:00p'}];
  adminShifts[today] = [{name: 'Avery Office', start: '8:00a', end: '4:00p'}];
"""


class AdminTeam(unittest.TestCase):
    """Ashley on the admin team (Oct 20 2026): a quick look at the day. The
    roster itself is a tap away on the Schedule tab (Tim, Oct 25 2026), where
    it's drawn in the same panel (test_the_schedule_tab_draws_the_same_roster)."""

    def test_the_day_and_a_link_to_the_roster(self):
        got = run({'op': card('admin', 'Avery Office', extra=DAY)})[0]
        self.assertEqual((got['role'], got['side'], got['title']), ('admin', 'foh', 'Hi, Avery'))
        # Ana, Leo (FOH and BOH: once) and Sam on now; Kim, Tia and Avery done; Max later.
        self.assertEqual(got['first'], '3 on the clock now, 7 on today.')
        self.assertEqual(got['rows'], [['6:00', 'next in: Max Doe, FOH', '', ''], ['7', 'on the schedule today · see who’s working', 'schedule:2026-10-19', '']])
        self.assertIsNone(got['roster'])

    def test_before_open_after_close_and_no_schedule(self):
        got = run({'op': card('admin', 'Avery Office', extra=DAY), 'at': '2026-10-19T05:00:00-05:00'},
                  {'op': card('admin', 'Avery Office', setup=SETUP.replace('today]', 'tue]').replace('+ today +', '+ tue +'),
                              extra=DAY.replace('today]', 'tue]')).replace('{ ', "{ const tue = '2026-10-20'; ", 1), 'at': '2026-10-19T22:30:00-05:00'},
                  {'op': card('admin', 'Avery Office', setup='')})
        self.assertEqual(got[0]['first'], '7 on today, first in at 6:00.')
        self.assertEqual((got[1]['kicker'], got[1]['first']), ('Tuesday', '7 on the schedule Tuesday.'))
        self.assertIn('schedule:2026-10-20', [r[2] for r in got[1]['rows']])
        self.assertEqual(got[2]['first'], 'No schedule for today yet. It comes in with the HotSchedules roster.')

    def test_the_roster_panel(self):
        # The panel the Schedule tab draws, as the Right Now card did.
        html = run({'op': f"""c => {{ {SETUP} {DAY} return rnRosterHtml(rnDayRoster(today, rnNowMins()), rnRosterHead(today, rnDay()), '', true); }}"""})[0]
        self.assertIn('<h3 class="rn-rg-h">FOH<span>4 on the day · 2 now</span></h3>', html)
        self.assertIn('<div class="rn-roster-h"><span class="rn-roster-ic">', html)
        self.assertIn('<b>Who’s on today</b><span>Mon, Oct 19</span></div>', html)
        self.assertIn('<li class="rn-rp is-now" data-ts-person="Leo Park" role="button" tabindex="0"><span class="rn-rp-time">2:00p–10:30p</span><span class="rn-rp-name">Leo Park<span class="rn-rp-tag">Leader</span></span><span class="rn-rp-now">On now</span></li>', html)
        self.assertIn('<span class="rn-rp-tag">Training</span>', html)
        css = read('static', 'css', 'theme-cfa.css')
        for rule in ('.rn-roster{', '.rn-roster-h{', '.rn-rp.is-now{', '.rn-rp-now{', '.rn-rp.is-done{'):
            self.assertIn(rule, css)

    def test_team_count_and_permits_stay_on_our_team(self):
        """Tim, Oct 20 2026: the headcount, permits and last to leave are
        Our Team's (state of the union), not right-now items."""
        hc = """hcSummary = () => ({now: {total: 73}, pending: [{name: 'Rae Quill'}], permits: {expired: 1, soon: 2}, last: {name: 'Bo Stone', type: 'quit', lastDay: '2026-10-17'}});
                 hcTypeLabel = () => 'Quit'; hcDate = () => 'Oct 17';"""
        got = run({'op': card('admin', 'Avery Office', extra=DAY + hc)}, {'op': card('director', '', extra=DAY + hc)})
        for g in got:
            self.assertFalse(any(r[2] == 'headcount' for r in g['rows']), g['rows'])
            self.assertFalse(any('on the team' in r[1] or 'permit' in r[1] or 'last to leave' in r[1] for r in g['rows']))

    def test_directors_get_it_a_tap_away_and_the_team_does_not(self):
        # Tim, Oct 25 2026: a link to the Schedule tab (same look), not a roster opened on the card.
        got = run({'op': card('director', '', extra=DAY)},
                  {'op': card('member', 'Ana Ruiz', extra=DAY)},
                  {'op': card('lead', 'Leo Park', extra=DAY)})
        link = ['7', 'on the schedule today · see who’s working', 'schedule:2026-10-19', '']
        self.assertIn(link, got[0]['rows'])
        self.assertIn(link, got[2]['rows'])                                     # Team Leads too
        self.assertNotIn(link, got[1]['rows'])                                  # not Team Members
        self.assertIsNone(got[0]['roster'])
        self.assertIsNone(got[1]['roster'])
        self.assertIsNone(got[2]['roster'])
        js = read('static', 'js', 'right-now.js')
        self.assertIn("else if(what === 'schedule' && typeof tsShowDay === 'function') tsShowDay(rest);", js)
        self.assertNotIn('rnRosterOpen', js)

    def test_the_schedule_tab_draws_the_same_roster(self):
        ts = read('static', 'js', 'team-schedule.js')
        self.assertIn('rnRosterHtml(groups, head, me, true)', ts)
        self.assertIn("rnDayRoster(tsDay, live ? rnNowMins() : null).filter(g => g.key !== 'admin' || manager)", ts)
        got = run({'op': """c => { fohRoster[today] = [{name: 'Ana Ruiz Lopez', start: '12:00p', end: '8:30p'}, {name: 'Leo Park', start: '2:00p', end: '10:30p', leader: true}];
                    return rnRosterHtml(rnDayRoster(today, null), {title: 'Who’s on today', sub: 'Mon, Oct 19'}, 'Ana Ruiz'); }"""})[0]
        self.assertIn('<li class="rn-rp is-me"><span class="rn-rp-time">12:00p–8:30p</span><span class="rn-rp-name">Ana Ruiz Lopez</span>', got)
        self.assertIn('Leo Park<span class="rn-rp-tag">Leader</span>', got)


class ScheduleFind(unittest.TestCase):
    """The Schedule tab's find box (Tim, Oct 26 2026): signed out it picks
    whose week the page shows; signed in it looks anyone up and a tap opens
    their week, as a name on the roster does."""
    WEEK = "fohRoster[today] = [{name: 'Ana Ruiz Lopez', start: '12:00p', end: '8:30p'}, {name: 'Leo Park', start: '2:00p', end: '10:30p', leader: true}]; bohRoster[today] = [{name: 'Mateo Cruz', start: '5:00a', end: '1:00p'}];"
    RENDER = "const root = {innerHTML: ''}; document.getElementById = id => id === 'scheduleRoot' ? root : el; renderTeamSchedule();"

    def test_signed_out_the_box_picks_whose_week(self):
        got = run({'op': "c => { " + self.WEEK + " tsSearch = 'le'; " + self.RENDER + " return root.innerHTML; }"})[0]
        self.assertIn('Find your shifts', got)
        self.assertIn('placeholder="Type your name"', got)
        self.assertIn('data-ts-pick="leo park">Leo Park</button>', got)
        self.assertNotIn('class="ts-hit" data-ts-person=', got)                       # the roster's own name buttons stay
        self.assertEqual(got.count('id="tsSearch"'), 1)

    def test_signed_in_the_box_finds_anyone(self):
        got = run({'op': "c => { " + self.WEEK + " acUser = {name: 'Ana Ruiz Lopez', role: 'member'}; tsSearch = 'le'; " + self.RENDER + " return root.innerHTML; }"})[0]
        self.assertIn('<h3>Ana Ruiz Lopez</h3>', got)                                   # her own week first
        self.assertIn('Find someone’s shifts', got)
        self.assertIn('placeholder="Type a name"', got)
        self.assertIn('class="ts-hit" data-ts-person="Leo Park">Leo Park</button>', got)   # opens his week in the sheet
        self.assertNotIn('data-ts-pick=', got)
        self.assertNotIn('Or sign in with your clock-in PIN', got)
        self.assertLess(got.index('class="ts-card ts-mine"'), got.index('class="ts-card ts-find is-look"'))
        self.assertLess(got.index('class="ts-card ts-find is-look"'), got.index('id="tsWho"'))
        # A director too.
        got = run({'op': "c => { " + self.WEEK + " launchManager = true; acUser = {name: '', role: 'manager'}; tsSearch = 'mateo'; " + self.RENDER + " return root.innerHTML; }"})[0]
        self.assertIn('class="ts-hit" data-ts-person="Mateo Cruz">Mateo Cruz</button>', got)
        self.assertNotIn('Type your name', got)                                       # not asked to pick a week as if it were theirs
        self.assertNotIn('class="ts-card ts-mine"', got)

    def test_no_match_says_so(self):
        got = run({'op': "c => { " + self.WEEK + " acUser = {name: 'Ana Ruiz Lopez', role: 'member'}; tsSearch = 'zzz'; " + self.RENDER + " return root.innerHTML; }"})[0]
        self.assertIn('No one by that name on this week’s schedule.', got)


class ScheduleWeeks(unittest.TestCase):
    """A pill for this week and for every week ahead that's scheduled (Tim,
    Oct 28 2026: two weeks out was scheduled, the page only had two pills)."""
    RENDER = ScheduleFind.RENDER

    def test_a_pill_for_each_scheduled_week(self):
        weeks = ("fohRoster[today] = [{name: 'Ana Ruiz Lopez', start: '12:00p', end: '8:30p'}];"
                 "fohRoster['2026-10-27'] = [{name: 'Ana Ruiz Lopez', start: '9:00a', end: '3:00p'}];"
                 "bohRoster['2026-11-10'] = [{name: 'Mateo Cruz', start: '5:00a', end: '1:00p'}];")       # nothing the week of Nov 2
        got = run({'op': "c => { " + weeks + " tsOffset = 0; " + self.RENDER + " return [root.innerHTML, tsWeekOffsets()]; }"},
                  {'op': "c => { " + weeks + " tsOffset = 3; " + self.RENDER + " return [root.innerHTML, tsOffset]; }"},
                  {'op': "c => { " + weeks + " tsOffset = 2; " + self.RENDER + " return [root.innerHTML, tsOffset]; }"},
                  {'op': "c => { " + weeks + " document.getElementById = () => null; tsShowDay('2026-11-10'); return tsOffset; }"})
        page, offsets = got[0]
        self.assertEqual(offsets, [0, 1, 3])
        pills = re.findall(r'data-ts-week="(\d+)">([^<]+?) <span class="es" lang="es">([^<]+)</span>', page)
        self.assertEqual(pills, [('0', 'This week', 'Esta semana'), ('1', 'Next week', 'La próxima semana'), ('3', 'Week of Nov 9', 'Semana del 9 nov')])
        self.assertIn('Mon, Nov 9 – Sat, Nov 14', got[1][0])
        self.assertIn('data-ts-day="2026-11-10"', got[1][0])
        self.assertEqual(got[2][1], 0)                       # a week with nothing in it falls back to this one
        self.assertEqual(got[3], 3)                          # Home's day links reach a later week too

    def test_your_shift_opens_that_week(self):
        """Tim, Oct 28 2026: "Your shift" on the Right Now card links to the
        Schedule, to see their shifts for the whole week."""
        weeks = ("fohRoster[today] = [{name: 'Ana Ruiz Lopez', start: '12:00p', end: '8:30p'}];"
                 "bohRoster['2026-11-10'] = [{name: 'Mateo Cruz', start: '5:00a', end: '1:00p'}];")
        got = run({'op': "c => { " + weeks + " window = {scrollTo(){}}; const r = []; tsShowWeek('2026-11-10'); r.push(tsOffset); tsShowWeek('2026-10-21'); r.push(tsOffset); tsShowWeek('2026-11-02'); r.push(tsOffset); return r; }"})[0]
        self.assertEqual(got, [3, 0, 0])                      # a week with nothing in it: this week
        self.assertIn("else if(what === 'myweek' && typeof tsShowWeek === 'function') tsShowWeek(rest);", read('static', 'js', 'right-now.js'))

    def test_pills_wrap_on_a_phone(self):
        css = read('static', 'css', 'theme-cfa.css')
        self.assertIn('.ts-weeks{display:flex;flex-wrap:wrap;gap:6px;}', css)
        self.assertIn('.ts-head{min-width:0;}', css)          # a grid item: without it the row widens the page


class StoreHours(unittest.TestCase):
    """The store closes at 11 on Friday and Saturday, 10 the other days (Tim,
    Oct 30 2026: a team member on break at 10:45 on a Friday saw Saturday)."""

    def test_friday_and_saturday_run_to_eleven(self):
        got = run({'op': 'c => [rnDay().closed, rnDay().closeAt]', 'at': '2026-10-23T22:30:00-05:00'},    # Friday
                  {'op': 'c => [rnDay().closed, rnDay().closeAt]', 'at': '2026-10-24T22:59:00-05:00'},    # Saturday
                  {'op': 'c => [rnDay().closed, rnDay().closeAt]', 'at': '2026-10-24T23:00:00-05:00'},
                  {'op': 'c => [rnDay().closed, rnDay().closeAt]', 'at': '2026-10-22T22:30:00-05:00'})    # Thursday
        self.assertEqual(got, [[False, 1380], [False, 1380], [True, 1380], [True, 1320]])


class NobodySignedIn(unittest.TestCase):
    def test_only_a_way_to_sign_in(self):
        """Tim, Oct 28 2026: no spots set, zones reset or waste before sign-in;
        those are the leaders'. The day's marketing events sit above it."""
        got = run({'op': card('', '', extra="gaps['foh|Dinner'] = {open: ['Host 2'], unplaced: [], filled: 9};")})[0]
        self.assertEqual(got['first'], '')
        self.assertEqual(got['rows'], [['', 'Sign in with your clock-in PIN to see your spot', 'signin', '']])
        js = read('static', 'js', 'right-now.js')
        self.assertNotIn('see your spot and your break', js)


class TeamEvents(unittest.TestCase):
    """Tim, Oct 28 2026: team members (and a phone nobody signed in on) see the
    marketing events, In store and Drive Thru; Community Outreach and the
    samples (Food) are the leaders'. Team Leads and up see them all."""

    def test_the_kinds_by_who(self):
        op = """c => { storeEvents = [
                    {id: 'a', kind: 'food', title: 'Community Outreach', date: '2026-10-28'},
                    {id: 'b', kind: 'instore', title: 'Halloween Week Promo', date: '2026-10-28', end: '2026-10-31'},
                    {id: 'c', kind: 'food', title: 'Sample: Chicken & Waffles', date: '2026-10-05', end: '2026-10-31'},
                    {id: 'd', kind: 'drivethru', title: 'Pack the Drive Thru', date: '2026-10-29', from: '12:00', to: '13:00'}];
                  const d = rnDay(); const t = m => m ? [m.special.map(x => x.ev.title), m.ongoing.map(e => e.title)] : null;
                  acUser = null; launchManager = false; const nobody = rnCardFor(rnViewer(), d).team;
                  acUser = {role: 'member', name: 'Ana Ruiz'}; const member = rnCardFor(rnViewer(), d).team;
                  acUser = {role: 'trainer', name: 'Ana Ruiz'}; const trainer = rnCardFor(rnViewer(), d).team;
                  acUser = {role: 'lead', name: 'Leo Park'}; const lead = !!rnCardFor(rnViewer(), d).team;
                  return {team: t(rnEvents(d, true)), all: t(rnEvents(d, false)), nextTeam: rnEvents(d, true).next.list.map(e => e.title), nobody, member, trainer, lead}; }"""
        got = run({'op': op, 'at': '2026-10-28T21:14:00-05:00'})[0]
        self.assertEqual(got['team'], [['Halloween Week Promo'], []])
        self.assertEqual(got['all'], [['Community Outreach', 'Halloween Week Promo'], ['Sample: Chicken & Waffles']])
        self.assertEqual(got['nextTeam'], ['Pack the Drive Thru'])                       # tomorrow's Drive Thru push still shows
        self.assertEqual((got['nobody'], got['member'], got['trainer'], got['lead']), (True, True, True, False))
        self.assertIn("${rnEventsHtml(day, boh, !!card.team)}", read('static', 'js', 'right-now.js'))


class PageWiring(unittest.TestCase):
    def test_culture_first_then_right_now(self):
        page = read('cfa-buda-ops-hub-complete.html')
        home = page.split('id="homeView"')[1].split('Vision, Mission & Values')[0]
        self.assertLess(home.index('class="home-welcome"'), home.index('id="rightNow"'))
        self.assertIn('<script src="/static/js/launch-mode.js"></script>\n<script src="/static/js/right-now.js"></script>', page)
        self.assertIn("if(typeof renderRightNow === 'function') renderRightNow();", read('static', 'js', 'scoreboards-and-eoi.js'))
        self.assertIn("if(typeof renderRightNow === 'function') renderRightNow();", read('static', 'js', 'accounts.js'))

    def test_spanish_only_on_the_kitchens_card(self):
        css = read('static', 'css', 'theme-cfa.css')
        self.assertIn('.rn:not(.rn-boh) .es{display:none;}', css)
        self.assertIn("root.className = `rn${boh ? ' rn-boh' : ''}`;", read('static', 'js', 'right-now.js'))


if __name__ == '__main__':
    unittest.main()


class WhatsMine(unittest.TestCase):
    """Tim, Oct 28 2026: a team member's card shows where they are on Set Ups
    all day, the tickets handed to them on the Tasks tab, and their own PEA."""

    def test_every_spot_left_today(self):
        day = SETUP + """
          posAssignments['foh||' + today + '||Lunch (10:30-1:00)||iPOS 2 LANE 1'] = 'Ana Ruiz Lopez';"""
        got = run({'op': card('member', 'Ana Ruiz', setup=day), 'at': '2026-10-19T12:30:00-05:00'})[0]
        self.assertEqual(got['first'], 'You’re on iPOS 2 LANE 1 until 1:00.')
        texts = [r[1] for r in got['rows']]
        self.assertIn('Next: Drinks 1 (Dinner)', texts)
        self.assertIn('Later: Host 1 (Close)', texts)
        later = next(r for r in got['rows'] if r[1] == 'Later: Host 1 (Close)')
        self.assertEqual((later[0], later[2]), ('8:00', 'setups:foh|2026-10-19|Close (8:00-10:00)'))

    def test_my_tickets_in_the_order_they_need_me(self):
        op = card('member', 'Ana Ruiz', extra="""
          const at = Date.now(), H = 3600e3, ev = (i, off, type, by, task, data) => ({id: String(at + off).padStart(13, '0') + '-' + i, at: at + off, type, by, taskId: task, data});
          rnMine = {who: 'Ana Ruiz', at: Date.now(), pea: null, tickets: rnTicketsFrom({me: {id: 'ana'}, events: [
            ev(1, -30 * H, 'created', 'lee', 't1', {title: 'Restock the sauce caddy', owner: 'ana', due: at + 2 * H}),
            ev(2, -29 * H, 'backbrief', 'ana', 't1', {summary: 'ok'}),
            ev(3, -20 * H, 'created', 'lee', 't2', {title: 'Wipe the menu boards', owner: 'ana', due: at - H}),
            ev(4, -19 * H, 'backbrief', 'ana', 't2', {summary: 'ok'}),
            ev(5, -H, 'created', 'lee', 't3', {title: 'Fold the to-go bags', owner: 'ana', due: at + 26 * H}),
            ev(6, -H, 'created', 'lee', 't4', {title: 'Someone else\\'s', owner: 'sam', due: at + 26 * H}),
          ]})};""")
        rows = run({'op': op})[0]['rows']
        tickets = [r for r in rows if r[2].startswith('ticket:')]
        self.assertEqual([r[1] for r in tickets], ['ticket: Fold the to-go bags · say it back', 'ticket: Wipe the menu boards · late',
                                                  'ticket: Restock the sauce caddy · check-in due'])
        self.assertEqual([r[0] for r in tickets], ['Tue', 'Late', '7:10'])
        self.assertEqual(tickets[1][2], 'ticket:t2')

    def test_more_than_four_tickets(self):
        op = card('member', 'Ana Ruiz', extra="""rnMine = {who: 'Ana Ruiz', at: Date.now(), pea: null,
            tickets: [1, 2, 3, 4, 5, 6].map(i => ({id: 't' + i, title: 'T' + i, due: Date.now() + i * 3600e3, state: 'working'}))};""")
        rows = run({'op': op})[0]['rows']
        self.assertEqual(sum(r[2].startswith('ticket:') for r in rows), 4)
        self.assertIn(['+2', 'more tickets on the Tasks tab', 'tickets', 'Más tickets en Tareas'], rows)

    def test_my_pea_on_the_card(self):
        got = run({'op': """c => { """ + SETUP + """
            acUser = {role: 'member', name: 'Ana Ruiz'};
            rnMine = {who: 'Ana Ruiz', at: Date.now(), tickets: [], pea: {name: 'Ana Ruiz Lopez', positions: [
              {position: 'iPOS', avg: 2.8, n: 5, total: 7, last: '2026-10-15', tier: 'crushing', tierLabel: 'Crushing It'},
              {position: 'Drinks 1/3', avg: 1.5, n: 2, total: 2, last: '2026-10-01', tier: 'notyet', tierLabel: 'Not Yet'}]}};
            const card = rnCardFor(rnViewer(), rnDay());
            return [card.pea.positions.length, rnPeaHtml(card.pea, false), rnPeaHtml(card.pea, true), rnPeaHtml(null, false)]; }"""})[0]
        self.assertEqual(got[0], 2)
        self.assertIn('<div class="rn-pea-cell is-crushing"', got[1])
        self.assertIn('<b>2.80</b>', got[1])
        self.assertIn('<b>1.50</b><small>Not Yet</small>', got[1])
        self.assertNotIn('lang="es"', got[1])                    # FOH stays English
        self.assertIn('Todavía no', got[2])                      # the kitchen's side carries Spanish
        self.assertEqual(got[3], '')

    def test_only_team_members_and_trainers_ask(self):
        js = read('static', 'js', 'right-now.js')
        self.assertIn("if(!['member', 'trainer'].includes(v.role) || !v.name)", js)
        self.assertIn("Promise.all([get('/api/me/pea'), get('/api/pass/state')])", js)
        self.assertIn("if(what === 'ticket' && typeof psOpenTicket === 'function') psOpenTicket(rest);", js)
        self.assertIn('window.psOpenTicket = openTicket;', read('static', 'js', 'pass.js'))
