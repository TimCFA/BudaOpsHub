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
    def test_their_spot_shift_break_and_waste(self):
        got = run({'op': card('member', 'Ana Ruiz')})[0]
        self.assertEqual(got['title'], 'Hi, Ana')
        self.assertEqual(got['first'], 'You’re on Drinks 1 until 8:00.')
        self.assertEqual(got['firstGo'], 'setups:foh|2026-10-19|Dinner (5:00-8:00)')
        texts = [r[1] for r in got['rows']]
        self.assertNotIn('Now: Drinks 1 (Dinner)', texts)            # already the first thing
        self.assertIn('Next: Host 1 (Close)', texts)
        self.assertIn('Your shift: 12:00p–8:30p', texts)
        self.assertIn(['6:30', 'your break', 'setups:foh|2026-10-19|'], [r[:3] for r in got['rows']])
        self.assertEqual(got['rows'][-1][1], 'waste today, limit $100')
        # Nothing about other people's gaps: that's the lead's.
        self.assertFalse(any('open spot' in t or 'no spot' in t for t in texts))

    def test_a_break_long_past_is_left_to_the_leader(self):
        got = run({'op': card('member', 'Ana Ruiz', extra="breaks.foh = [{name: 'Ana Ruiz Lopez', start: 15 * 60}];")})[0]
        self.assertFalse(any(r[1] == 'your break' for r in got['rows']))

    def test_on_break(self):
        got = run({'op': card('member', 'Ana Ruiz', extra="breakCountdowns['foh||' + today + '||Ana Ruiz Lopez'] = Date.now() + 20 * 60000;")})[0]
        self.assertEqual(got['first'], 'On break until 5:30.')

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
        self.assertEqual(sunday['rows'][0][1], 'Your shift Monday: 11:30a–2:30p (Office)')
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
                              extra="") .replace('{ ', "{ const mon = '2026-10-19'; ", 1), 'at': '2026-10-17T22:30:00-05:00'})[0]
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
    """Ashley on the admin team (Oct 20 2026): a quick look at the day's
    roster. The Admin Team role's card is that roster."""

    def test_the_days_roster_by_group(self):
        got = run({'op': card('admin', 'Avery Office', extra=DAY)})[0]
        self.assertEqual((got['role'], got['side'], got['title']), ('admin', 'foh', 'Hi, Avery'))
        # Ana, Leo (FOH and BOH: once) and Sam on now; Kim, Tia and Avery done; Max later.
        self.assertEqual(got['first'], '3 on the clock now, 7 on today.')
        self.assertEqual(got['rows'], [['6:00', 'next in: Max Doe, FOH', '', '']])
        self.assertEqual(got['roster'], [
            ['FOH', 2, [['Kim Lee', '6:00a–2:00p', 'done', False], ['Ana Ruiz Lopez', '12:00p–8:30p', 'now', False],
                        ['Leo Park', '2:00p–10:30p', 'now', True], ['Max Doe', '6:00p–10:00p', 'later', False]]],
            ['BOH', 2, [['Sam Ortiz', '1:30p–10:30p', 'now', False], ['Leo Park', '5:00p–6:00p', 'now', False]]],
            ['Truck', 0, [['Tia Wells', '10:00a–3:00p', 'done', False]]],
            ['Admin', 0, [['Avery Office', '8:00a–4:00p', 'done', False]]]])

    def test_before_open_after_close_and_no_schedule(self):
        got = run({'op': card('admin', 'Avery Office', extra=DAY), 'at': '2026-10-19T05:00:00-05:00'},
                  {'op': card('admin', 'Avery Office', setup=SETUP.replace('today]', 'tue]').replace('+ today +', '+ tue +'),
                              extra=DAY.replace('today]', 'tue]')).replace('{ ', "{ const tue = '2026-10-20'; ", 1), 'at': '2026-10-19T22:30:00-05:00'},
                  {'op': card('admin', 'Avery Office', setup='')})
        self.assertEqual(got[0]['first'], '7 on today, first in at 6:00.')
        # After close: tomorrow's roster, no "now".
        self.assertEqual((got[1]['kicker'], got[1]['first']), ('Tuesday', '7 on the schedule Tuesday.'))
        self.assertEqual({p[2] for g in got[1]['roster'] for p in g[2]}, {''})
        self.assertEqual(got[2]['first'], 'No schedule for today yet. It comes in with the HotSchedules roster.')

    def test_on_the_card(self):
        html = run({'op': f"""c => {{ {SETUP} {DAY} acUser = {{role: 'admin', name: 'Avery Office'}}; renderRightNow(); return document.getElementById('rightNow').innerHTML; }}"""})[0]
        self.assertIn('<span class="rn-role">Admin Team</span>', html)
        self.assertIn('<h3 class="rn-rg-h">FOH<span>4 on the day · 2 now</span></h3>', html)
        # Its own panel, time first, the people on now marked (Tim, Oct 20 2026: easier to notice).
        self.assertIn('<div class="rn-roster-h"><span class="rn-roster-ic">', html)
        self.assertIn('<b>Who’s on today</b><span>Mon, Oct 19</span></div>', html)
        self.assertIn('<li class="rn-rp is-now"><span class="rn-rp-time">2:00p–10:30p</span><span class="rn-rp-name">Leo Park<span class="rn-rp-tag">Leader</span></span><span class="rn-rp-now">On now</span></li>', html)
        self.assertIn('<li class="rn-rp is-done"><span class="rn-rp-time">6:00a–2:00p</span><span class="rn-rp-name">Kim Lee</span></li>', html)
        self.assertIn('<span class="rn-rp-tag">Training</span>', html)
        # Above the rows on the Admin Team's card.
        self.assertLess(html.index('class="rn-roster"'), html.index('class="rn-list"'))
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
        self.assertIn(['7', 'on the schedule today · see who’s working', 'schedule:2026-10-19', ''], got[0]['rows'])
        self.assertIsNone(got[0]['roster'])
        self.assertIsNone(got[1]['roster'])
        self.assertIsNone(got[2]['roster'])
        js = read('static', 'js', 'right-now.js')
        self.assertIn("else if(what === 'schedule' && typeof tsShowDay === 'function') tsShowDay(rest);", js)
        self.assertNotIn('rnRosterOpen', js)

    def test_the_schedule_tab_draws_the_same_roster(self):
        ts = read('static', 'js', 'team-schedule.js')
        self.assertIn('rnRosterHtml(groups, head, me)', ts)
        self.assertIn("rnDayRoster(tsDay, live ? rnNowMins() : null).filter(g => g.key !== 'admin' || manager)", ts)
        got = run({'op': """c => { fohRoster[today] = [{name: 'Ana Ruiz Lopez', start: '12:00p', end: '8:30p'}, {name: 'Leo Park', start: '2:00p', end: '10:30p', leader: true}];
                    return rnRosterHtml(rnDayRoster(today, null), {title: 'Who’s on today', sub: 'Mon, Oct 19'}, 'Ana Ruiz'); }"""})[0]
        self.assertIn('<li class="rn-rp is-me"><span class="rn-rp-time">12:00p–8:30p</span><span class="rn-rp-name">Ana Ruiz Lopez</span>', got)
        self.assertIn('Leo Park<span class="rn-rp-tag">Leader</span>', got)


class NobodySignedIn(unittest.TestCase):
    def test_the_shift_and_a_way_to_sign_in(self):
        got = run({'op': card('', '', extra="gaps['foh|Dinner'] = {open: ['Host 2'], unplaced: [], filled: 9};")})[0]
        self.assertEqual(got['first'], '')
        self.assertEqual(got['rows'][0][:3], ['9/10', 'FOH spots set for Dinner', 'setups:foh|2026-10-19|Dinner (5:00-8:00)'])
        self.assertEqual(got['rows'][-1][1:3], ['Sign in with your clock-in PIN to see your spot and your break', 'signin'])
        self.assertFalse(any('Ana' in r[1] for r in got['rows']))


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
