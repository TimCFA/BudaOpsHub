"""Home's Right Now card (Tim, Oct 19 2026): the welcome banner and quote
first, then what matters this minute for whoever holds the phone. A Team
Member sees their own spot, shift, break and zone; a Trainer the same (no
open spots count since Nov 23 2026); a Team Lead gets their side's shift; a director or the
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
                       const f = rnPersonCard({role: 'member', name: 'Ana Ruiz'}, rnDay(), false).first; return [f.until > Date.now(), rnHeroHtml(f, false, () => '', () => ''), [f.k, f.big, f.sub, f.tone]]; }"""})
        self.assertEqual(got[0]['first'], 'On break, back at 5:30.')
        self.assertEqual(got[0]['firstEs'], 'En descanso, regresa a las 5:30')
        self.assertIn('Next: Host 1 (Close)', [r[1] for r in got[0]['rows']])
        self.assertEqual(got[1]['first'], 'You’re on Drinks 1 until 8:00.')                 # a break that's over: back to the spot
        self.assertTrue(got[2][0])
        # The banner: ON BREAK, the time left in big type, when they're back, and a bar of the break left (Nov 21 2026).
        self.assertRegex(got[2][1], r'<small>On break</small>\s*<span class="rn-hero-big"><b class="rn-break-left" data-rn-break-until="\d+">12:3[34]</b></span>\s*<span class="rn-hero-sub">left · back at 5:2[23]</span>')
        self.assertRegex(got[2][1], r'<span class="rn-bar" data-rn-break-bar="\d+" aria-hidden="true"><i style="width:42%"></i></span>')      # 12:34 of a 30 minute break
        self.assertRegex(got[2][2][2], r'^back at 5:2[23]$')
        self.assertEqual(got[2][2][:2] + got[2][2][3:], ['On break', '', ''])
        js = read('static', 'js', 'right-now.js')
        self.assertIn("document.querySelectorAll('#rightNow [data-rn-break-until]')", js)     # ticks every second
        self.assertIn("document.querySelectorAll('#rightNow [data-rn-break-bar] i')", js)      # and its bar with it

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

    def test_after_their_shift_it_says_done_not_no_spot(self):
        """Nov 21 2026: someone whose shift is over was told "No spot yet,
        check with your leader". Now it's a green done, with a thank you."""
        done = "fohRoster[today] = [{name: 'Ana Ruiz Lopez', start: '6:00a', end: '2:00p'}]; posAssignments = {};"
        got = run({'op': card('member', 'Ana Ruiz', extra=done)},
                  {'op': """c => { bohRoster[today] = [{name: 'Sam Ortiz', start: '6:00a', end: '2:00p'}]; acUser = {role: 'member', name: 'Sam Ortiz'};
                             const f = rnCardFor(rnViewer(), rnDay()).first; return [f.k, f.big, f.sub, f.tone, f.es]; }"""})
        self.assertEqual(got[0]['first'], 'You’re done for today. Your shift ended at 2:00.')
        self.assertEqual(got[1], ['Your shift ended at 2:00', 'Done for today', 'Thank you for today.', 'ok', 'Terminaste por hoy. Tu turno terminó a las 2:00. Gracias por hoy.'])

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


class LeadingTheShift(unittest.TestCase):
    def test_the_lead_captain_on_their_side(self):
        """Tim, Nov 18 2026: a team member sees who's leading the shift."""
        lc = "posAssignments['foh||' + today + '||Dinner (5:00-8:00)||Lead Captain'] = 'Leo Park';"
        got = run({'op': card('member', 'Ana Ruiz', extra=lc)}, {'op': card('member', 'Ana Ruiz')}, {'op': card('trainer', 'Leo Park', extra=lc)},
                  {'op': card('member', 'Sam Ortiz', extra="posAssignments['boh||' + today + '||Dinner (5:00-8:00)||Lead Captain'] = 'Rosa Vela';")})
        self.assertIn(['', 'Leading the shift: Leo', 'setups:foh|2026-10-19|Dinner (5:00-8:00)', 'Líder del turno'], got[0]['rows'])
        self.assertFalse(any('Leading' in r[1] for r in got[1]['rows']))      # nobody set: no line
        self.assertFalse(any('Leading' in r[1] for r in got[2]['rows']))      # it's them
        self.assertIn(['', 'Leading the shift: Rosa', 'setups:boh|2026-10-19|Dinner (5:00-8:00)', 'Líder del turno'], got[3]['rows'])


class NewHire(unittest.TestCase):
    """Tim, Nov 20 2026: someone in their first 30 days (the roster's "In
    training" tag, or a hire date inside 30 days) gets a card made for them."""
    NEW = """
      fohRoster[today] = [{name: 'Kai Mercer', start: '6:00p', end: '9:00p', training: true}, {name: 'Leo Park', start: '2:00p', end: '10:30p', leader: true}];
      posAssignments['foh||' + today + '||Dinner (5:00-8:00)||Drinks 1'] = 'Dee Brooks / Kai Mercer';
      posAssignments['foh||' + today + '||Dinner (5:00-8:00)||Lead Captain'] = 'Leo Park';
      posAssignments['foh||2026-10-16||Lunch (10:30-1:00)||Host 2'] = 'Kai Mercer';
      posAssignments['foh||2026-10-17||Lunch (10:30-1:00)||iPOS 3 LANE 2'] = 'Kai Mercer';
      posAssignments['foh||2026-10-17||Dinner (5:00-8:00)||Host 1'] = 'Kai Mercer';
      posAssignments['foh||2026-10-21||Lunch (10:30-1:00)||OMD 1'] = 'Kai Mercer';
      homeData = {newHire: {en: 'Black non-slip shoes\\n\\nPark in the back row', es: 'Zapatos negros'}};
    """

    def op(self, name='Kai Mercer', setup=None, extra=''):
        return """c => { %s %s acUser = {role: 'member', name: %s}; const card = rnCardFor(rnViewer(), rnDay());
                 return {title: card.title, nh: card.newHire || null, rows: card.rows.map(r => [r.n, r.text, r.go, r.es]), html: rnNewHireHtml(card.newHire, card.side === 'boh')}; }""" % (
                     self.NEW if setup is None else setup, extra, json.dumps(name))

    def test_the_card_before_the_shift(self):
        got = run({'op': self.op(extra="apMine = {name: 'Kai Mercer', hireDate: '2026-10-15'};"), 'at': '2026-10-19T16:30:00-05:00'})[0]
        self.assertEqual(got['title'], 'Welcome, Kai')
        self.assertEqual(got['nh'], {'day': 5, 'of': 30, 'before': {'en': ['Black non-slip shoes', 'Park in the back row'], 'es': []}})
        texts = [r[1] for r in got['rows']]
        self.assertIn('With you on Drinks 1: Dee', texts)
        self.assertIn('When you walk in, find Leo', texts)
        self.assertFalse(any(t.startswith('Leading the shift') for t in texts))        # said once
        self.assertIn(['2', 'positions so far: Host, iPOS', 'mine', 'Posiciones hasta ahora'], got['rows'])   # not Wednesday's, nor tonight's yet
        self.assertLess(texts.index('Your shift: 6:00p–9:00p'), texts.index('With you on Drinks 1: Dee'))
        self.assertIn('<div class="rn-new-day"><b>Day 5</b><span>of 30</span></div><span class="rn-bar" aria-hidden="true"><i style="width:17%"></i></span>', got['html'])
        self.assertIn('<li>Park in the back row</li>', got['html'])
        self.assertNotIn('Zapatos', got['html'])                                       # FOH stays English

    def test_on_shift_the_before_list_steps_aside(self):
        got = run({'op': self.op(), 'at': '2026-10-19T18:30:00-05:00'})[0]
        self.assertEqual(got['nh'], {'day': None, 'of': 30, 'before': None})           # no hire date on file: no day count
        self.assertIn('Your first 30 days', got['html'])
        texts = [r[1] for r in got['rows']]
        self.assertIn('Leading the shift: Leo', texts)
        self.assertFalse(any(t.startswith('When you walk in') for t in texts))
        self.assertIn('positions so far: Host, Drinks, iPOS', texts)                   # today's Drinks counts once it started

    def test_who_is_a_new_hire(self):
        plain = self.NEW.replace(', training: true', '')
        tomorrow = plain + "fohRoster['2026-10-20'] = [{name: 'Kai Mercer', start: '9:00a', end: '1:00p', training: true}];"
        got = run({'op': self.op(setup=plain)},                                                       # no tag, no date
                  {'op': self.op(setup=plain, extra="apMine = {name: 'Kai Mercer', hireDate: '2026-10-01'};")},     # day 19
                  {'op': self.op(setup=plain, extra="apMine = {name: 'Kai Mercer', hireDate: '2026-08-01'};")},     # long past
                  {'op': self.op(setup=tomorrow)},                                                    # tagged tomorrow
                  {'op': self.op(extra="apMine = {name: 'Kai Mercer', hireDate: '2026-08-01'};")},                  # tagged: the roster says so
                  {'op': self.op(setup=plain, extra="apMine = {name: 'Someone Else', hireDate: '2026-10-15'};")})   # not theirs
        self.assertEqual([g['nh'] and g['nh']['day'] for g in got], [None, 19, None, None, None, None])
        self.assertEqual([bool(g['nh']) for g in got], [False, True, False, True, True, False])

    def test_the_kitchens_carries_spanish(self):
        boh = """bohRoster[today] = [{name: 'Ines Duarte', start: '6:00p', end: '9:00p', training: true}];
                 homeData = {newHire: {en: 'Black non-slip shoes', es: 'Zapatos negros'}};"""
        got = run({'op': self.op('Ines Duarte', setup=boh, extra="apMine = {name: 'Ines Duarte', hireDate: '2026-10-17'};")})[0]
        self.assertIn('Día 3 de 30', got['html'])
        self.assertIn('<li class="es" lang="es">Zapatos negros</li>', got['html'])
        self.assertIn('Tus primeros 30 días', got['html'])
        self.assertIn('Nos alegra que estés aquí', got['html'])

    def test_wired_in(self):
        self.assertIn("'hireDate': (prof.get('hireDate') or '') if isinstance(prof, dict) else ''", read('team_extras.py'))
        mv = read('static', 'js', 'management-views.js')
        self.assertIn('id="home-newhire-en"', mv)
        self.assertIn("mvTakeId('home-newhire-es'", mv)
        # Trainers, leads and directors keep their own cards.
        self.assertIn("if(v.role === 'member') return rnNewHireCard(rnPersonCard(v, day), v, day);", read('static', 'js', 'right-now.js'))


class TheLook(unittest.TestCase):
    """Tim, Nov 21 2026: compartments, a banner, big-number tiles, and each
    line a small label over the words that matter."""

    def test_a_line_splits_into_label_words_and_detail(self):
        got = run({'op': """c => ['Next: Drinks 1 (Mid)', 'zones reset · Lunch → Mid at 1:00 · 1 with nobody', 'ticket: Restock: the bar · say it back',
                     'FOH AM breaks left (of 14) · next: Tessa 8:00', 'break due: Mia 5:25, Leo 6:00', 'No open tickets. Nicely done.', 'AM breaks left (of 6) · next: Rosa 9:00'].map(rnParts)"""})[0]
        self.assertEqual(got[6], {'kicker': '', 'value': 'AM breaks left (of 6)', 'detail': 'next: Rosa 9:00'})
        self.assertEqual(got[0], {'kicker': 'Next', 'value': 'Drinks 1 (Mid)', 'detail': ''})
        self.assertEqual(got[1], {'kicker': '', 'value': 'zones reset', 'detail': 'Lunch → Mid at 1:00 · 1 with nobody'})
        self.assertEqual(got[2], {'kicker': 'ticket', 'value': 'Restock: the bar', 'detail': 'say it back'})
        self.assertEqual(got[3], {'kicker': '', 'value': 'FOH AM breaks left (of 14)', 'detail': 'next: Tessa 8:00'})
        self.assertEqual(got[4], {'kicker': 'break due', 'value': 'Mia 5:25, Leo 6:00', 'detail': ''})
        self.assertEqual(got[5], {'kicker': '', 'value': 'No open tickets. Nicely done.', 'detail': ''})

    def test_where_a_line_goes(self):
        got = run({'op': """c => [[{go: 'event:x|2026-10-19'}, {}], [{go: 'ticket:t1'}, {}], [{go: 'tickets'}, {}], [{go: 'signin'}, {team: true, sideSwitch: true}],
                     [{go: 'setups:foh|x|y'}, {team: true}], [{go: 'setups:foh|x|y'}, {}], [{go: 'timers'}, {team: true, sideSwitch: true}], [{go: 'waste', more: true}, {}]].map(([r, c2]) => rnGroupOf(r, c2))"""})[0]
        self.assertEqual(got, ['cal', 'tix', 'tix', 'cta', 'day', 'floor', 'floor', 'more'])

    def test_the_banner_is_a_label_big_words_and_the_detail(self):
        """The sentence stays whole (the Spanish, a screen reader); beside it
        the banner's parts, and its colour: red needs someone, green is all
        covered, navy is where you are."""
        first = lambda role, name, extra='', setup=SETUP: f"""c => {{ {setup} {extra} acUser = {json.dumps({'role': role, 'name': name})}; launchManager = {'true' if role == 'director' else 'false'};
            const f = rnCardFor(rnViewer(), rnDay()).first; return [f.text, f.k, f.big, f.sub, f.tone, typeof f.bar === 'number' ? Math.round(f.bar * 100) : null]; }}"""
        zone = "handoff = {name: 'Dinner to Late Night (7:00pm - 8:00pm)', owners: {Restrooms: ['Ana Ruiz Lopez']}, done: {Restrooms: {checked: 2, total: 8}}};"
        got = run({'op': first('member', 'Ana Ruiz')},                                                  # 5:10 PM, on Drinks 1 for Dinner (5 to 8)
                  {'op': first('member', 'Ana Ruiz'), 'at': '2026-10-19T10:20:00-05:00'},               # before her shift
                  {'op': first('member', 'Ana Ruiz', zone), 'at': '2026-10-19T18:40:00-05:00'},         # her zone, 20 minutes before the handoff
                  {'op': first('lead', 'Leo Park', "gaps['foh|Dinner'] = {open: ['Host 2'], unplaced: [], filled: 9};")},
                  {'op': first('lead', 'Leo Park', "gaps['foh|Dinner'] = {open: [], unplaced: ['Mia Cole', 'Kit Lane', 'Abe Roy', 'Zed Poe'], filled: 9};")},
                  {'op': first('lead', 'Leo Park')},
                  {'op': first('director', '', "gaps['foh|Lunch'] = {open: ['Host 2', 'OMD 2'], unplaced: [], filled: 10};"), 'at': '2026-10-19T22:30:00-05:00'},
                  {'op': first('member', 'Ana Ruiz', setup='')})
        self.assertEqual(got[0], ['You’re on Drinks 1 until 8:00.', 'You’re on', 'Drinks 1', 'until 8:00', '', 6])            # 10 minutes into three hours
        self.assertEqual(got[1], ['Your shift starts at 12:00, on Drinks 1.', 'Your shift starts at', '12:00', 'on Drinks 1 · in 1 h 40 min', '', None])
        self.assertEqual(got[2], ['Reset Restrooms for the Dinner → Late Night handoff (2 of 8 done).', 'Reset your zone', 'Restrooms', 'for the Dinner → Late Night handoff · 2 of 8 done', 'bad', 25])
        self.assertEqual(got[3], ['Nobody is on Host 2 for Dinner.', 'Nobody is on', 'Host 2', 'for Dinner', 'bad', None])
        self.assertEqual(got[4], ['4 on the clock with no spot, starting with Mia.', 'on the clock with no spot', 'Mia, Kit, Abe +1', '', 'bad', None])
        self.assertEqual(got[5], ['Dinner is covered. Go catch someone doing it right.', '', 'Dinner is covered', 'Go catch someone doing it right', 'ok', None])
        self.assertEqual(got[6], ['Tuesday’s FOH Set Ups have 2 open spots.', 'Tuesday’s FOH Set Ups', '2 open spots', '', 'bad', None])
        self.assertEqual(got[7][0], 'You’re not on today’s schedule.')                                  # a plain sentence: no parts
        self.assertEqual(got[7][1:5], [None, None, None, None])
        html = run({'op': """c => rnHeroHtml(rnHead({text: 'x', go: 'setups:foh|d|p'}, 'You’re on', 'Drinks 1', 'until 8:00'), false, () => '', g => ' data-rn-go="' + g + '"')
                             + rnHeroHtml({text: 'You’re not on today’s schedule.'}, true, t => '<i>' + t + '</i>', () => '')"""})[0]
        self.assertIn('<div class="rn-hero is-go" data-rn-go="setups:foh|d|p">', html)
        self.assertIn('<small>You’re on</small>', html)
        self.assertIn('<span class="rn-hero-big">Drinks 1</span>', html)
        self.assertIn('<span class="rn-hero-sub">until 8:00</span>', html)
        self.assertIn('<div class="rn-hero is-text">', html)                                            # a sentence keeps the old label, with its Spanish in the kitchen
        self.assertIn('<small>First thing<span class="es" lang="es"> · Lo primero</span></small>', html)

    def test_a_count_out_of_a_total_draws_a_bar(self):
        got = run({'op': """c => [{n: '3/9'}, {n: '0/84'}, {n: '12'}, {n: '2', bar: 0.5}, {n: '$24.37', bar: 2}, {n: '1/0'}].map(r => { const b = rnBarOf(r); return b === null ? null : rnBarHtml(b, r.tone); })"""})[0]
        self.assertEqual(got[0], '<span class="rn-bar" aria-hidden="true"><i style="width:33%"></i></span>')
        self.assertEqual(got[1], '<span class="rn-bar" aria-hidden="true"><i style="width:0%"></i></span>')
        self.assertEqual([got[2], got[5]], [None, None])
        self.assertIn('width:50%', got[3])
        self.assertIn('width:100%', got[4])                                                             # never past the end
        # A director's breaks left: the ones taken; the staffed count stays navy with its open spots flagged.
        rows = run({'op': """c => { %s breaks.foh = [{name: 'Mia Cole', start: 9 * 60, from: 6 * 60}, {name: 'Ana Ruiz Lopez', start: 12 * 60, from: 8 * 60}];
                       completedBreaks['foh||' + today + '||Mia Cole'] = true; gaps['foh|Lunch'] = {open: ['Host 2'], unplaced: [], filled: 9};
                       acUser = null; launchManager = true; return rnCardFor(rnViewer(), rnDay()).rows.map(r => [r.text, r.tone, r.bar === undefined ? null : r.bar]); }""" % SETUP,
                    'at': '2026-10-19T12:10:00-05:00'})[0]
        self.assertIn(['FOH AM break left (of 2) · next: Ana 12:00', '', 0.5], rows)
        self.assertIn(['FOH staffed for Lunch · 1 open spot', 'flag', None], rows)
        self.assertIn(['BOH staffed for Lunch', '', None], rows)

    def test_the_shift_shows_how_far_through_it_they_are(self):
        op = lambda who, side: f"""c => {{ {side}Roster[today] = [{{name: {json.dumps(who)}, start: '12:00p', end: '8:00p'}}]; acUser = {{role: 'member', name: {json.dumps(who)}}};
            const r = rnCardFor(rnViewer(), rnDay()).rows.find(x => x.text.startsWith('Your shift')); return [r.text, r.es, Math.round(r.bar * 100), r.note, r.icon]; }}"""
        got = run({'op': op('Ana Ruiz', 'foh')}, {'op': op('Sam Ortiz', 'boh'), 'at': '2026-10-19T10:20:00-05:00'}, {'op': op('Sam Ortiz', 'boh'), 'at': '2026-10-19T20:30:00-05:00'},
                  {'op': "c => [rnDur(100), rnDur(60), rnDur(25), rnDur(0), rnInitials('Priya Shah'), rnInitials('ana maría ruiz lópez'), rnInitials('Leo'), rnInitials('')]"})
        self.assertEqual(got[0], ['Your shift: 12:00p–8:00p', 'Tu turno · faltan 2 h 50 min', 65, '2 h 50 min left', 'clock'])     # 5:10 PM
        self.assertEqual(got[1], ['Your shift: 12:00p–8:00p', 'Tu turno · empieza en 1 h 40 min', 0, 'starts in 1 h 40 min', 'clock'])
        self.assertEqual(got[2], ['Your shift: 12:00p–8:00p', 'Tu turno · terminaste por hoy', 100, 'done for today', 'clock'])
        self.assertEqual(got[3], ['1 h 40 min', '1 h', '25 min', '0 min', 'PS', 'AL', 'L', ''])
        # A line's words start with a capital, but a name with its own capitals is left alone.
        caps = run({'op': "c => ['open spots on FOH for Lunch', 'iPOS 1 (Captain) (Lunch)', '2 to do', 'zones reset', 'Drinks 1', 'waste today, limit $100', ''].map(rnCap)"})[0]
        self.assertEqual(caps, ['Open spots on FOH for Lunch', 'iPOS 1 (Captain) (Lunch)', '2 to do', 'Zones reset', 'Drinks 1', 'Waste today, limit $100', ''])
        html = run({'op': "c => rnLineHtml({n: '', text: 'Now: iPOS 1 (Captain) (Lunch)', go: '', tone: '', es: ''}, () => '', () => '')"})[0]
        self.assertIn('<b class="rn-v">iPOS 1 (Captain) (Lunch)</b>', html)

    def test_escaped_and_wired(self):
        got = run({'op': """c => { const es = () => '', go = () => ''; const r = {n: '<i>', text: '<b>x</b>: <img src=x> · <u>d</u>', go: '', tone: '', note: '<s>n</s>'};
                     return rnLineHtml(r, es, go) + rnTileHtml(r, es, go) + rnLineHtml({n: '', text: 'a', go: '', tone: '', who: '<a> <b>'}, es, go)
                       + rnHeroHtml({text: '<em>t</em>', k: '<k>', big: '<big>', sub: '<sub>'}, false, es, go) + rnHeroHtml({text: '<em>t</em>'}, false, es, go); }"""})[0]
        for bad in ('<i>', '<b>x', '<img', '<u>', '<s>', '<a>', '<k>', '<big>', '<sub>', '<em>'):
            self.assertNotIn(bad, got)
        js = read('static', 'js', 'right-now.js')
        self.assertIn('<div class="rn-tiles">${tiles.map(r => rnTileHtml(r, es, go)).join(\'\')}</div>', js)
        self.assertIn("${card.first ? rnHeroHtml(card.first, boh, es, go) : ''}", js)
        css = read('static', 'css', 'theme-cfa.css')
        self.assertIn('.rn-hero.is-bad{background:var(--cfa-red);', css)
        self.assertIn('.rn-hero.is-ok{background:#2E7D45;', css)

    def test_two_columns_on_a_tablet_and_motion_only_when_wanted(self):
        js = read('static', 'js', 'right-now.js')
        self.assertIn("""<div class="rn-cols${main && side ? '' : ' is-one'}">""", js)
        css = read('static', 'css', 'theme-cfa.css')
        wide = css[css.index("/* A tablet or a computer: two columns"):]
        self.assertIn('@media (min-width:860px){\n  .rn-cols{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);', wide)
        # Every animation of the card's sits inside "no preference": someone who asked for less motion gets none.
        card = css[css.index('/* ===== Home: Right Now'):css.index('/* The one event, on its own')]
        motion = card[card.index('@media (prefers-reduced-motion:no-preference){'):]
        self.assertEqual(card.count('animation:'), motion.count('animation:'))
        self.assertGreaterEqual(motion.count('animation:'), 3)
        # It rises in when Home is opened, not on the minute's redraw or a sync.
        self.assertIn("root.className = `rn${boh ? ' rn-boh' : ''}${rnEnter ? ' rn-enter' : ''}`;\n  if(typeof hubStarted === 'undefined' || hubStarted || hubWarming) rnEnter = false;", js)
        self.assertIn("if(who !== rnSeen){ rnSeen = who; rnEnter = true; }", js)                    # and when someone signs in
        self.assertIn("if(view === 'home'){ if(opened && typeof rnArrive === 'function') rnArrive(); renderHomeScoreboard(); }", read('static', 'js', 'navigation.js'))


class OneGreeting(unittest.TestCase):
    def test_the_welcome_carries_the_name(self):
        """Tim, Nov 21 2026 (the look): one greeting, not two. The welcome's
        line is the page's headline, with the person's first name; a new
        hire's says welcome; a device nobody signed in on gets the plain one."""
        op = """c => { const out = []; [[{name: 'Maya Torres'}, {}], [{name: ''}, {}], [{name: 'Kai Mercer'}, {newHire: {day: 3}}]].forEach(([v, card]) => {
                  rnGreet(v, card); out.push(document.getElementById('homeGreeting').textContent); }); return out; }"""
        got = run({'op': op, 'at': '2026-10-19T08:00:00-05:00'}, {'op': op, 'at': '2026-10-19T14:00:00-05:00'}, {'op': op, 'at': '2026-10-19T19:00:00-05:00'})
        self.assertEqual(got[0], ['Good morning, Maya.', 'Good morning.', 'Welcome, Kai.'])
        self.assertEqual(got[1], ['Good afternoon, Maya.', 'Good afternoon.', 'Welcome, Kai.'])
        self.assertEqual(got[2][0], 'Good evening, Maya.')
        js = read('static', 'js', 'right-now.js')
        self.assertIn('  rnGreet(v, card);\n', js)
        self.assertNotIn('rn-title', js)                                   # the card's own "Hi, Maya" is gone
        self.assertIn('<h2 class="rn-kicker">', js)

    def test_the_welcome_is_on_the_pages_own_ground_and_still_first(self):
        """Culture first (Tim): the greeting and the quote open Home, above
        the card. No longer a navy block, so the banner is the page's first
        colour."""
        css = read('static', 'css', 'theme-cfa.css')
        self.assertIn('.home-welcome{background:transparent;color:var(--text-primary);', css)
        self.assertIn('.home-quote-box{background:transparent;border-left:3px solid var(--cfa-red);', css)
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertLess(page.index('class="home-welcome"'), page.index('id="rightNow"'))
        self.assertLess(page.index('id="homeGreeting"'), page.index('id="homeQuoteBox"'))


class CounterTimers(unittest.TestCase):
    def test_the_signed_out_front_card_shows_the_timers(self):
        """Tim, Nov 18 2026: the timers due now, else the next one coming."""
        op = lambda lst: f"c => {{ rnTimers = {{at: Date.now(), list: {lst}}}; return rnCardFor(rnViewer(), rnDay()).rows.map(r => [r.n, r.text, r.go, r.tone]); }}"
        got = run({'op': op("[{name: 'Restrooms', cls: 'late', left: -60000}, {name: 'Lot Sweep', cls: 'ok', left: 600000}, {name: 'Dining Room Touch', cls: 'missed', left: -900000}]")},
                  {'op': op("[{name: 'Restrooms', cls: 'ok', left: 720000}, {name: 'Lot Sweep', cls: 'ok', left: 3000000}, {name: 'Playground', cls: 'new'}]")},
                  {'op': op("[{name: 'Restrooms', cls: 'off'}]")}, {'op': op('null')})
        self.assertEqual(got[0][0], ['2', 'timers due now: Restrooms, Dining Room Touch', 'timers', 'bad'])
        self.assertEqual(got[1][0], ['12m', 'until the next timer: Restrooms', 'timers', ''])
        for g in got:
            self.assertEqual(g[-1][2], 'signin')
        self.assertEqual(len(got[2]), 1)
        self.assertEqual(len(got[3]), 1)
        self.assertIn('TimersPage = {S, cycle, cyclesOf, pausesOf, agg, ownerNow, onTheFloor, peek}', read('static', 'js', 'timers.js'))


class OneGlance(unittest.TestCase):
    def test_home_is_the_welcome_and_right_now(self):
        """Tim, Nov 18 2026: Vision, Mission and Values and the Monthly
        Leadership Wins left Home; Manage still keeps them."""
        page = read('cfa-buda-ops-hub-complete.html')
        home = page[page.index('id="homeView"'):page.index('id="wastelogView"')]
        self.assertNotIn('homeVMVContainer', home)
        self.assertNotIn('homeWinsContainer', home)
        self.assertNotIn('homeVMVContainer', read('static', 'js', 'scoreboards-and-eoi.js'))
        self.assertIn('homeData', read('static', 'js', 'management-views.js'))


class Trainer(unittest.TestCase):
    def test_no_open_spots_count(self):
        # Tim, Nov 23 2026: trainers don't need the count of open spots on their side.
        got = run({'op': card('trainer', 'Sam Ortiz', extra="gaps['boh|Dinner'] = {open: ['Breader 2', 'Fries'], unplaced: [], filled: 5};")})[0]
        self.assertFalse([r for r in got['rows'] if 'open spot' in r[1]])
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
        # Tim, Nov 18 2026: Food Safety and waste are a director's, not a Team Lead's.
        self.assertFalse(any('Food Safety' in t or 'waste' in t for t in texts))
        self.assertFalse(any('BOH' in t for t in texts))              # Leo is on the FOH schedule
        self.assertFalse(any(t.startswith('leaders on') for t in texts))   # the director's

    def test_all_covered(self):
        got = run({'op': card('lead', 'Leo Park')})[0]
        self.assertEqual(got['first'], 'Dinner is covered. Go catch someone doing it right.')

    def test_open_tickets_or_a_well_done(self):
        """Tim, Nov 18 2026: a lead sees how many tickets are waiting on them,
        and something to celebrate when none are. No line until they're read."""
        tk = lambda c: card('lead', 'Leo Park', extra=f"rnMine.counts = {c};")
        got = run({'op': card('lead', 'Leo Park')}, {'op': tk('{todo: 2, approve: 1, out: 3, late: false}')},
                  {'op': tk('{todo: 0, approve: 0, out: 0, late: false}')}, {'op': tk('{todo: 0, approve: 0, out: 2, late: false}')})
        row = lambda g: next((r for r in g['rows'] if r[2] == 'tickets'), None)
        self.assertIsNone(row(got[0]))
        self.assertEqual(row(got[1])[:2], ['3', 'tickets waiting on you: 2 to do · 1 to approve · 3 out with the team'])
        self.assertEqual(row(got[2])[:2], ['0', 'No open tickets. Nicely done.'])
        self.assertEqual(row(got[3])[:2], ['0', 'Nothing waiting on you · 2 out with the team'])
        # Nothing waiting: a tick, not a zero.
        html = run({'op': "c => rnLineHtml({n: '0', text: 'No open tickets. Nicely done.', go: 'tickets', tone: 'ok', es: ''}, () => '', () => '')"})[0]
        self.assertIn('<i class="rn-ic is-ok">', html)
        self.assertNotIn('rn-pill', html)

    def test_whose_move_a_ticket_is(self):
        ev = lambda i, typ, by, task, data=None: {'id': f'e{i}', 'at': 1000 + i, 'type': typ, 'by': by, 'taskId': task, 'data': data or {}}
        made = lambda i, by, owner, task: ev(i, 'created', by, task, {'title': 'T', 'owner': owner, 'due': 4102444800000})
        events = [made(1, 'boss', 'me', 't1'),                                    # handed to me: mine to do
                  made(2, 'me', 'ana', 't2'),                                     # out with the team
                  made(3, 'me', 'ana', 't3'), ev(4, 'backbrief', 'ana', 't3', {'summary': 's'}), ev(5, 'submit', 'ana', 't3', {'evidence': 'done'})]   # turned in: mine to approve
        got = run({'op': f"c => rnTicketCounts({{me: {{id: 'me'}}, events: {json.dumps(events)}}})"})[0]
        self.assertEqual(got, {'todo': 1, 'approve': 1, 'out': 1, 'late': False})


class Director(unittest.TestCase):
    def test_the_whole_store_and_the_rest_of_the_day(self):
        got = run({'op': card('director', '', extra="""gaps['foh|Dinner'] = {open: ['Host 2'], unplaced: ['Mia Cole'], filled: 9};
                     gaps['boh|Dinner'] = {open: ['Fries'], unplaced: ['Mia Cole'], filled: 6};
                     gaps['foh|Close'] = {open: ['Floors'], unplaced: [], filled: 4};""")})[0]
        texts = [r[1] for r in got['rows']]
        self.assertEqual(got['first'], 'Nobody is on Host 2 for Dinner (FOH).')
        # Tim, Nov 18 2026: how many people each house has, FOH and BOH apart.
        self.assertEqual(got['rows'][0][:2], ['10', 'FOH staffed for Dinner · 1 open spot'])
        self.assertEqual(got['rows'][1][:2], ['7', 'BOH staffed for Dinner · 1 open spot'])
        self.assertFalse(any('open spot for' in t for t in texts))
        self.assertIn('on the clock with no spot: Mia', texts)        # on both schedules: once
        self.assertIn('open later today: Close FOH 1', texts)
        self.assertIn('leader on: Leo', texts)

    def test_breaks_left_by_house_and_the_rest_folds(self):
        """Tim, Nov 18 2026: breaks left to run in each house, the AM shifts'
        until 1 PM and the PM shifts' after (the kitchen's switch at 2 PM, as
        on its iPad: Nov 20 2026); what doesn't need someone now folds under
        More about today."""
        brk = """breaks.boh = [{name: 'Sam Ortiz', start: 11 * 60, from: 6 * 60, to: 14 * 60}, {name: 'Rosa Vela', start: 19 * 60, from: 15 * 60, to: 22 * 60}];
                 breaks.foh = [{name: 'Mia Cole', start: 9 * 60, from: 6 * 60, to: 13 * 60}, {name: 'Ana Ruiz Lopez', start: 12 * 60, from: 8 * 60, to: 16 * 60}, {name: 'Leo Park', start: 18 * 60, from: 14 * 60, to: 22 * 60}];
                 completedBreaks['foh||' + today + '||Mia Cole'] = true;
                 completedBreaks['foh||' + today + '||Ana Ruiz Lopez'] = true;
                 gaps['foh|Close'] = {open: ['Floors'], unplaced: [], filled: 4};"""
        op = """c => { %s acUser = null; launchManager = true; const card = rnCardFor(rnViewer(), rnDay());
                 return card.rows.map(r => [r.n, r.text, !!r.more]); }""" % (SETUP + brk)
        am, pm = run({'op': op, 'at': '2026-10-19T12:50:00-05:00'}, {'op': op, 'at': '2026-10-19T13:05:00-05:00'})
        self.assertIn(['0', 'FOH AM breaks left (of 2)', False], am)
        self.assertIn(['1', 'FOH PM break left (of 1) · next: Leo 6:00', False], pm)
        self.assertIn(['1', 'BOH AM break left (of 1) · next: Sam 11:00', False], pm)      # the kitchen: 2 PM
        late = run({'op': op, 'at': '2026-10-19T14:05:00-05:00'})[0]
        self.assertIn(['1', 'BOH PM break left (of 1) · next: Rosa 7:00', False], late)
        folded = [r[1] for r in pm if r[2]]
        self.assertTrue(any(t.startswith('open later today') for t in folded))
        self.assertTrue(any(t.startswith('waste today') for t in folded))
        self.assertIn('Food Safety walkthrough today', folded)
        self.assertTrue(all(r[2] for r in pm[[r[2] for r in pm].index(True):]))      # the folded rows come last
        js = read('static', 'js', 'right-now.js')
        self.assertIn('<details class="rn-more rn-sec" data-rn-more', js)
        # The Admin Team's card is the director's, under their own name.
        self.assertIn("acUser.role === 'admin' ? RN_ROLE_LABELS.admin : RN_ROLE_LABELS[v.role]", js)

    def test_pm_breaks_carry_the_mid_shifts_and_whats_still_owed(self):
        """Tim, Nov 23 2026: at 3 PM Home said "4 FOH PM breaks left (of 4),
        next: Daniel M. 6:30" while the breaks roster on Set Ups still had
        Isaac at 2:45, Victoria 3:15, Leeland 3:30 ... none taken: the count
        only took shifts starting at 2 PM or later. It now carries the earlier
        shifts' afternoon breaks and any break still owed by someone on the
        clock, so it matches the roster; whoever has gone home drops off."""
        brk = """breaks.foh = [
                   {name: 'Kim Lee', start: 9 * 60, from: 6 * 60, to: 14 * 60},
                   {name: 'Isaac Bledsoe', start: 14 * 60 + 45, from: 11 * 60 + 30, to: 19 * 60},
                   {name: 'Victoria Rodriguez', start: 15 * 60 + 15, from: 11 * 60, to: 20 * 60 + 30},
                   {name: 'Jacob Cantu', start: 15 * 60 + 45, from: 11 * 60, to: 20 * 60 + 30},
                   {name: 'Ana Ruiz Lopez', start: 12 * 60 + 30, from: 8 * 60, to: 16 * 60},
                   {name: 'Daniel Millan', start: 18 * 60 + 30, from: 15 * 60, to: 22 * 60},
                   {name: 'Asia Bothne', start: 19 * 60 + 15, from: 16 * 60, to: 22 * 60 + 30}];
                 breaks.boh = [
                   {name: 'Nestor Reyes', start: 17 * 60 + 30, from: 13 * 60, to: 22 * 60 + 30},
                   {name: 'Vanessa Cruz', start: 19 * 60, from: 15 * 60, to: 22 * 60 + 30}];
                 completedBreaks['foh||' + today + '||Victoria Rodriguez'] = true;"""
        op = """c => { %s acUser = null; launchManager = true; const card = rnCardFor(rnViewer(), rnDay());
                 return card.rows.map(r => r.text).filter(t => /break/.test(t)); }""" % (SETUP + brk)
        got = run({'op': op, 'at': '2026-10-19T15:02:00-05:00'})[0]
        # Kim went home at 2 with no break taken: not on the count. Ana, still
        # on, owes the 12:30 one; Victoria's is taken.
        self.assertIn('FOH PM breaks left (of 6) · next: Ana 12:30', got)
        self.assertIn('BOH PM breaks left (of 2) · next: Nestor 5:30', got)

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
        self.assertIn("rnEventRows(day, card.side === 'boh', !!card.team)", read('static', 'js', 'right-now.js'))


class PageWiring(unittest.TestCase):
    def test_culture_first_then_right_now(self):
        page = read('cfa-buda-ops-hub-complete.html')
        home = page.split('id="homeView"')[1].split('Vision, Mission & Values')[0]
        self.assertLess(home.index('class="home-welcome"'), home.index('id="rightNow"'))
        self.assertIn('<script src="/static/js/launch-mode.js" defer></script>\n<script src="/static/js/right-now.js" defer></script>', page)
        self.assertIn("if(typeof renderRightNow === 'function') renderRightNow();", read('static', 'js', 'scoreboards-and-eoi.js'))
        self.assertIn("if(typeof renderRightNow === 'function') renderRightNow();", read('static', 'js', 'accounts.js'))

    def test_spanish_only_on_the_kitchens_card(self):
        css = read('static', 'css', 'theme-cfa.css')
        self.assertIn('.rn:not(.rn-boh) .es{display:none;}', css)
        self.assertIn("root.className = `rn${boh ? ' rn-boh' : ''}${rnEnter ? ' rn-enter' : ''}`;", read('static', 'js', 'right-now.js'))


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
        # The PEA scores are a Team Member's and a Trainer's; leaders read their tickets too (Nov 18 2026).
        self.assertIn("const team = ['member', 'trainer'].includes(v.role);", js)
        # View as (Tim, Nov 23 2026): the person's PEA, and no tickets.
        # Anyone signed in by name also asks for a badge earned lately (Nov 23 2026; tests/test_badges.py), but not while viewing as someone.
        self.assertIn("Promise.all([team ? get('/api/me/pea' + (as ? '?as=' + encodeURIComponent(as) : '')) : null, as ? null : get('/api/pass/state'), v.name && !as ? get('/api/me/badges') : null])", js)
        self.assertIn("if(what === 'ticket' && typeof psOpenTicket === 'function') psOpenTicket(rest);", js)
        self.assertIn('window.psOpenTicket = openTicket;', read('static', 'js', 'pass.js'))
