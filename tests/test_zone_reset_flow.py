"""The Zone Resets page (static/js/zone-page.js; Tim, Nov 23 2026): three steps,
each one screen. The day's five handoffs, always in the day's order, each
saying where it stands; a tap opens a handoff's zones as tiles; a tap on a
zone opens its list on a sheet. Nothing opens by itself any more (it used to
open on the handoff happening now: Oct 18 2026), and the handoffs no longer
move with the clock. Kept: a zone's last tick closes it and says what's left
(Oct 18 2026), and no intro box at the top (Oct 28 2026).

Leaders (Team Leads and up) see the whole picture; Team Members, Trainers and
a device nobody signed in on get a lighter page with nothing in red but
"now" (Tim, Nov 23 2026: TheTeamsPage below). The other tests run as a Team
Lead.

Run: python3 -m unittest discover tests
Runs zone-page.js in node (tests/zone_page_runner.js) with the real handoffs,
zones and lists; who owns a zone is stubbed. Names are made up.
"""
import json
import os
import subprocess
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')
B_L, L_M, M_D, D_N, CLOSE = ('Breakfast to Lunch (10:30am - 11:30am)', 'Lunch to Mid (1:00pm - 2:00pm)', 'Mid to Dinner (4:00pm - 5:00pm)',
                             'Dinner to Late Night (7:00pm - 8:00pm)', 'Close')
# Tick every item of a handoff (or of some of its zones, or the first n items of one zone).
HELPERS = """
  const tick = (h, zones, n) => (zones || ALL_ZONE_NAMES).forEach(z => { zoneChecklistState[today] = zoneChecklistState[today] || {}; zoneChecklistState[today][h] = zoneChecklistState[today][h] || {};
    const b = zoneChecklistState[today][h][z] = {}; getZoneItems(z).slice(0, n === undefined ? 99 : n).forEach(it => { b[it] = {initials: 'TL', ts: Date.now()}; }); });
  const nowMin = () => new Date().getHours() * 60 + new Date().getMinutes();
"""


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


def run(*cases):
    out = subprocess.run(['node', os.path.join(ROOT, 'tests', 'zone_page_runner.js')], input=json.dumps({'cases': list(cases)}),
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def day(setup='', at=None):
    case = {'op': f"""c => {{ {HELPERS} {setup}
      return zrDay(today, nowMin()).map(h => [h.dp.name.split(' (')[0], h.state, h.up, zrStateLabel(h, nowMin()), h.zonesDone + '/' + h.zonesTotal, h.checked + '/' + h.total]); }}"""}
    if at:
        case['at'] = at
    return case


class TheDay(unittest.TestCase):
    def test_always_in_the_days_order_and_where_each_stands(self):
        """12:20 PM, Breakfast to Lunch done, Lunch to Mid started: the next
        one is the bigger card, and the rest of the day follows in order."""
        got = run(day(f"tick({json.dumps(B_L)}); tick({json.dumps(L_M)}, ['Dining Room', 'Restrooms']); tick({json.dumps(L_M)}, ['Front Counter'], 2);"))[0]
        self.assertEqual([h[0] for h in got], ['Breakfast to Lunch', 'Lunch to Mid', 'Mid to Dinner', 'Dinner to Late Night', 'Close'])
        self.assertEqual([h[1] for h in got], ['done', 'next', 'later', 'later', 'later'])
        self.assertEqual([h[2] for h in got], [False, True, False, False, False])
        self.assertEqual(got[0][3:], ['Done', '9/9', '74/74'])
        self.assertEqual(got[1][3:], ['Next · in 40 min', '2/9', '20/74'])
        self.assertEqual(got[2][3], '')                                   # still to come: quiet

    def test_through_the_day(self):
        nothing = "void 0;"
        done1 = f"tick({json.dumps(B_L)});"
        got = run(day(nothing, '2026-11-23T08:00:00-06:00'), day(done1, '2026-11-23T13:20:00-06:00'), day(done1, '2026-11-23T14:30:00-06:00'),
                  day(nothing, '2026-11-23T21:30:00-06:00'), day(''.join(f"tick({json.dumps(h)});" for h in (B_L, L_M, M_D, D_N, CLOSE)), '2026-11-23T21:30:00-06:00'),
                  day(nothing, '2026-11-23T23:30:00-06:00'))
        states = lambda g: [h[1] for h in g]
        self.assertEqual(states(got[0]), ['next', 'later', 'later', 'later', 'later'])                 # before the first
        self.assertEqual(got[0][0][3], 'Next · in 2 h 30 min')
        self.assertEqual(states(got[1]), ['done', 'now', 'later', 'later', 'later'])                   # inside its hour
        self.assertEqual(got[1][1][3], 'Now · until 2:00')
        self.assertEqual(states(got[2]), ['done', 'behind', 'next', 'later', 'later'])                 # its hour is over, not done
        self.assertEqual([got[2][1][3], got[2][2][3]], ['Not finished', 'Next · in 1 h 30 min'])
        self.assertEqual(states(got[3]), ['behind', 'behind', 'behind', 'behind', 'now'])              # Close runs to the end of the day
        self.assertEqual(got[3][4][3], 'Now')
        self.assertEqual(states(got[4]), ['done'] * 5)
        self.assertFalse(any(h[2] for h in got[4]))                                                    # all done: none is "up"
        self.assertEqual(states(got[5])[4], 'now')                                                     # Friday and Saturday close at 11
        # Only one card is ever the bigger one.
        for g in got:
            self.assertLessEqual(sum(1 for h in g if h[2]), 1)

    def test_the_cards(self):
        html = run({'op': f"""c => {{ {HELPERS} tick({json.dumps(B_L)}); tick({json.dumps(L_M)}, ['Dining Room']); setUps[{json.dumps(L_M)}] = true;
                     owners[{json.dumps(L_M)} + '|Dining Room'] = ['Theo Vance'];
                     posAssignments['foh||' + today + '||Lunch (10:30-1:00)||Lead Captain'] = 'Priya Shah';
                     return zrDayHtml(nowMin()); }}"""})[0]
        cards = html.split('<button type="button" class="zr-h ')[1:]
        self.assertEqual(len(cards), 5)
        self.assertTrue(cards[0].startswith('su-col-b is-done"'))
        self.assertTrue(cards[1].startswith('su-col-l is-next is-up"'))
        self.assertIn('<b>1:00</b>', cards[1])                                 # its start time, on its sky
        self.assertIn('data-sky="midday"', cards[1])
        self.assertIn('Next · in 40 min', cards[1])
        self.assertIn('<b class="zr-h-name">Lunch → Mid</b>', cards[1])
        self.assertIn('<span class="zr-h-meta">1 of 9 zones · Lead Priya</span>', cards[1])
        self.assertIn('<span class="zr-h-flag">8 zones with nobody</span>', cards[1])
        # The ones still to come stay quiet: a name and a time, nothing to read past.
        self.assertNotIn('zr-h-meta', cards[2])
        self.assertNotIn('zr-h-flag', cards[2])
        self.assertNotIn('rn-bar', cards[2])
        self.assertIn('<b>23%</b> done', html)                                 # 84 of 370 ticks: the day's share
        self.assertIn('Last 6 days', html)


class NothingOpensByItself(unittest.TestCase):
    def test_the_page_starts_on_the_day_and_a_tap_opens_a_handoff(self):
        got = run({'op': f"""c => {{ {HELPERS} const root = document.getElementById('zoneButtonRow');
                     renderZoneResetView(); const first = [currentZoneDaypart, root.className, root.innerHTML.includes('zr-list')];
                     root.listeners.click({{target: {{closest: s => s === '[data-zr-handoff]' ? {{dataset: {{zrHandoff: {json.dumps(M_D)}}}}} : null}}}});
                     const opened = [currentZoneDaypart, root.className, root.innerHTML.includes('data-zr-back'), (root.innerHTML.match(/class="rn-tile zr-zone/g) || []).length];
                     root.listeners.click({{target: {{closest: s => s === '[data-zr-back]' ? {{}} : null}}}});
                     return [first, opened, currentZoneDaypart, root.innerHTML.includes('zr-list')]; }}""", 'at': '2026-11-23T13:20:00-06:00'})[0]
        self.assertEqual(got[0], ['', 'zr-page zr-enter', True])                 # 1:20 PM, a handoff under way: still the day
        self.assertEqual(got[1], [M_D, 'zr-page is-handoff zr-enter', True, 9])  # its nine zones as tiles
        self.assertEqual(got[2:], ['', True])                                    # back to the day
        zp, zr = read('static', 'js', 'zone-page.js'), read('static', 'js', 'zone-reset.js')
        self.assertNotIn('zoneHandoffChosen', zp + zr + read('static', 'js', 'right-now.js'))
        self.assertNotIn('currentZoneDaypart = zrCurrentHandoff()', zp + zr)

    def test_homes_zone_line_opens_its_handoff_and_a_new_day_starts_on_the_day(self):
        got = run({'op': f"""c => {{ const root = document.getElementById('zoneButtonRow');
                     currentZoneDaypart = {json.dumps(D_N)}; currentChecklistZone = ''; renderZoneResetView(); const a = root.innerHTML.includes('Dinner → Late Night');
                     currentZoneDaypart = 'Nope'; renderZoneResetView(); const b = [currentZoneDaypart, root.innerHTML.includes('zr-list')];
                     currentZoneDaypart = {json.dumps(D_N)}; zrPageDay = '2026-11-22'; renderZoneResetView();
                     return [a, b, currentZoneDaypart]; }}"""})[0]
        self.assertEqual(got, [True, ['', True], ''])
        self.assertIn("    currentZoneDaypart = rest;\n    currentChecklistZone = '';\n    launchShowTab('zonereset');", read('static', 'js', 'right-now.js'))


class AHandoffAndAZone(unittest.TestCase):
    def test_zones_as_tiles_who_owns_each_and_a_zone_with_nobody_in_red(self):
        html = run({'op': f"""c => {{ {HELPERS} const h = {json.dumps(L_M)}; tick(h, ['Dining Room']); tick(h, ['Front Counter'], 2); setUps[h] = true;
                     owners[h + '|Dining Room'] = ['Theo Vance']; owners[h + '|Front Counter'] = ['Wyatt Ames', 'Zoe <b>Hart'];
                     currentZoneDaypart = h; renderZoneResetView(); return document.getElementById('zoneButtonRow').innerHTML; }}"""})[0]
        tiles = {t.split('data-zone="')[1].split('"')[0]: t for t in html.split('<button type="button" class="rn-tile zr-zone')[1:]}
        self.assertEqual(len(tiles), 9)
        self.assertTrue(tiles['Dining Room'].startswith(' is-ok"'))
        self.assertIn('<b class="zr-zone-n">10/10</b>', tiles['Dining Room'])
        self.assertIn('<small class="rn-tile-d">Theo</small>', tiles['Dining Room'])
        self.assertIn('<b class="zr-zone-n">2/10</b>', tiles['Front Counter'])
        self.assertIn('width:20%', tiles['Front Counter'])
        self.assertIn('Wyatt, Zoe', tiles['Front Counter'])
        self.assertTrue(tiles['Restrooms'].startswith(' is-bad"'))               # set up exists, nobody on its positions
        self.assertIn('Nobody yet · tap to pick', tiles['Restrooms'])
        self.assertIn('<span class="rn-hero-big">Lunch → Mid</span>', html)
        self.assertIn('1 of 9 zones reset · No Lead Captain yet', html)
        self.assertNotIn('<b>Hart', html)

    def test_the_sheet_ticks_and_the_last_tick_closes_the_zone(self):
        """Tim, Oct 18 2026: the last tick of a zone closes it and says what's
        left, so nobody scrolls past a finished list. Unticking never closes it."""
        got = run({'op': f"""c => {{ {HELPERS} const h = {json.dumps(L_M)}; const root = document.getElementById('zoneButtonRow'), sheet = document.getElementById('zrZoneSheet');
                     currentZoneDaypart = h; renderZoneResetView();
                     root.listeners.click({{target: {{closest: s => s === '[data-zone]' ? {{dataset: {{zone: 'The Spot'}}}} : null}}}});
                     const open = [currentChecklistZone, sheet.classList.contains('active'), (document.getElementById('zrSheetBody').innerHTML.match(/data-zone-item=/g) || []).length];
                     const tap = i => sheet.listeners.click({{target: {{closest: s => s === '[data-zone-item]' ? {{dataset: {{zoneItem: String(i)}}}} : null}}, currentTarget: sheet}});
                     tap(0); tap(1); const two = [getZoneCompletion(today, h, 'The Spot').checked, currentChecklistZone, toasts.length];
                     tap(1); const undone = [getZoneCompletion(today, h, 'The Spot').checked, currentChecklistZone];
                     tap(1); tap(2);
                     return [open, two, undone, getZoneCompletion(today, h, 'The Spot').checked, currentChecklistZone, sheet.classList.contains('active'), toasts, saved]; }}"""})[0]
        self.assertEqual(got[0], ['The Spot', True, 3])
        self.assertEqual(got[1], [2, 'The Spot', 0])
        self.assertEqual(got[2], [1, 'The Spot'])
        self.assertEqual(got[3:6], [3, '', False])                                # the last tick closes the sheet
        self.assertEqual(got[6], ['The Spot reset ✓ · 8 zones left'])
        self.assertEqual(got[7], 5)                                               # every tap saved
        zp = read('static', 'js', 'zone-page.js')
        self.assertIn("    bucket[itemText] = {initials, ts: Date.now()};\n    zrNoteZoneDone(daypart, zoneName);", zp)
        self.assertIn("every zone reset", zp)

    def test_nobody_signed_in_is_asked_first_and_the_sheet_escapes_names(self):
        got = run({'op': f"""c => {{ const h = {json.dumps(L_M)}; const sheet = document.getElementById('zrZoneSheet');
                     initials = ''; asked = 0; currentZoneDaypart = h; currentChecklistZone = 'The Spot'; setUps[h] = true; owners[h + '|The Spot'] = ['Lena Castillo', 'Bad <i>Name'];
                     renderZoneResetView();
                     sheet.listeners.click({{target: {{closest: s => s === '[data-zone-item]' ? {{dataset: {{zoneItem: '0'}}}} : null}}, currentTarget: sheet}});
                     return [getZoneCompletion(today, h, 'The Spot').checked, asked, toasts, currentChecklistZone, document.getElementById('zrSheetBody').innerHTML]; }}"""})[0]
        self.assertEqual(got[:4], [0, 1, ['Sign in first (top right)'], 'The Spot'])   # nothing ticked; the sheet stays for when they're in
        self.assertIn('<i>LC</i>Lena', got[4])                                         # their initials lead their name
        self.assertNotIn('<i>Name', got[4])
        self.assertIn('role="checkbox" aria-checked="false"', got[4])


MAYA = "acUser = {name: 'Maya Torres', role: 'member'};"


class TheTeamsPage(unittest.TestCase):
    """Tim, Nov 23 2026: "Red flags should not be visible to team member.
    Reduce as much noise for team members as possible so it is extremely
    light weight and clutter free for them." """

    def test_who_gets_which_page(self):
        got = run({'op': """c => { const out = ['', 'member', 'trainer', 'lead', 'admin', 'director'].map(r => { acUser = r ? {name: 'Jordan Testcase', role: r} : null; launchManager = false; return zrLeaderView(); });
                     acUser = {name: 'x', role: 'member'}; launchManager = true; out.push(zrLeaderView());
                     acUser = null; launchManager = false; renderZoneResetView(); out.push(document.getElementById('zoneButtonRow').className);
                     return out; }"""})[0]
        # A signed-out device, a Team Member and a Trainer get the team's page; a manager session is a leader.
        self.assertEqual(got, [False, False, False, True, True, True, True, 'zr-page is-team zr-enter'])

    def test_the_day_has_no_red_flags_and_no_counts_of_whats_wrong(self):
        """4:20 PM: Lunch to Mid wasn't finished, Mid to Dinner is on with no
        Lead Captain and zones nobody owns. A leader sees all of it in red;
        the team sees where each handoff stands, and their own zone."""
        setup = f"""{HELPERS} tick({json.dumps(B_L)}); tick({json.dumps(L_M)}, ['Dining Room']); setUps[{json.dumps(L_M)}] = true; setUps[{json.dumps(M_D)}] = true;
                    owners[{json.dumps(M_D)} + '|Drinks Zone'] = ['Sadie Lowe', 'Maya Torres Ruiz'];"""
        lead, team, out = run({'op': f"c => {{ {setup} return zrDayHtml(nowMin()); }}", 'at': '2026-11-23T16:20:00-06:00'},
                              {'op': f"c => {{ {setup} {MAYA} return zrDayHtml(nowMin()); }}", 'at': '2026-11-23T16:20:00-06:00'},
                              {'op': f"c => {{ {setup} acUser = null; return zrDayHtml(nowMin()); }}", 'at': '2026-11-23T16:20:00-06:00'})
        for red in ('is-behind', 'rn-bar is-bad', '<span class="zr-h-flag">No Lead Captain yet</span>', 'zones with nobody', 'zr-pct'):
            self.assertIn(red, lead)
            self.assertNotIn(red, team)
            self.assertNotIn(red, out)
        # The last six days and their star are the team's too (Tim, Nov 23 2026: "Yes team members should have the 6 day strip and star").
        for html in (lead, team, out):
            self.assertIn('Last 6 days', html)
            self.assertIn('95% or more earns a star', html)
        cards = team.split('<button type="button" class="zr-h ')[1:]
        self.assertEqual(len(cards), 5)                                          # the same five handoffs, in the same order
        self.assertTrue(cards[1].startswith('su-col-l is-past"'))                # not finished: said plainly, not in red
        self.assertIn('Not finished', cards[1])
        self.assertIn('<span class="zr-h-meta">1 of 9 zones</span>', cards[1])
        self.assertTrue(cards[2].startswith('su-col-m is-now is-up"'))           # "now" is the one red thing left
        self.assertIn('Now · until 5:00', cards[2])
        self.assertIn('<span class="zr-h-meta zr-h-mine">Your zone: <b>Drinks Zone</b></span>', cards[2])   # the PIN list's name and the schedule's can differ
        self.assertNotIn('Lead ', team)
        self.assertNotIn('zr-h-mine', out)                                       # nobody signed in: nobody's zone
        self.assertIn('<span class="zr-h-meta">0 of 9 zones</span>', out.split('<button type="button" class="zr-h ')[3])

    def test_their_own_zone_comes_first_and_nobodys_zone_is_not_theirs_to_see(self):
        setup = f"""{HELPERS} const h = {json.dumps(L_M)}; tick(h, ['Dining Room']); setUps[h] = true;
                    owners[h + '|Dining Room'] = ['Theo Vance']; owners[h + '|The Spot'] = ['Lena Castillo', 'Maya Torres'];
                    currentZoneDaypart = h;"""
        page = "renderZoneResetView(); return document.getElementById('zoneButtonRow').innerHTML;"
        team, out, lead = run({'op': f"c => {{ {setup} {MAYA} {page} }}", 'at': '2026-11-23T14:30:00-06:00'},
                              {'op': f"c => {{ {setup} acUser = null; {page} }}", 'at': '2026-11-23T14:30:00-06:00'},
                              {'op': f"c => {{ {setup} {page} }}", 'at': '2026-11-23T14:30:00-06:00'})
        order = lambda html: [t.split('data-zone="')[1].split('"')[0] for t in html.split('<button type="button" class="rn-tile zr-zone')[1:]]
        tiles = {t.split('data-zone="')[1].split('"')[0]: t for t in team.split('<button type="button" class="rn-tile zr-zone')[1:]}
        self.assertEqual(order(team)[0], 'The Spot')                             # hers, first
        self.assertEqual(order(team)[1:4], ['Dining Room', 'Restrooms', 'Front Counter'])   # the rest where they always are
        self.assertTrue(tiles['The Spot'].startswith(' is-mine"'))
        self.assertIn('<small class="rn-tile-d">Your zone · with Lena</small>', tiles['The Spot'])
        self.assertIn('<small class="rn-tile-d">Theo</small>', tiles['Dining Room'])           # whose the others are: how a shared tablet finds a zone
        self.assertEqual(order(out), order(lead))                                # nobody signed in: the usual order
        self.assertIn('<small class="rn-tile-d">Lena, Maya</small>', out)
        for html in (team, out):
            for red in ('is-bad', 'Nobody yet', 'tap to pick', 'Lead Captain', 'set up yet'):
                self.assertNotIn(red, html)
            self.assertIn('<span class="rn-hero-sub">1 of 9 zones reset</span>', html)
            self.assertIn('Not finished', html)                                  # 2:30 PM, its hour is over: said, on a navy banner
        self.assertIn('zr-hero su-col-l is-bad', lead)                           # the leader's is red, and counts who's missing
        self.assertTrue(lead.split('data-zone="Restrooms"')[0].endswith('zr-zone is-bad" '))
        self.assertIn('Nobody yet · tap to pick', lead)
        self.assertIn('1 of 9 zones reset · No Lead Captain yet', lead)

    def test_the_list_is_just_the_list(self):
        """No Hand off, no "nobody owns this", no who-ticked-what: the team ticks."""
        setup = f"""{HELPERS} const h = {json.dumps(L_M)}; setUps[h] = true; owners[h + '|The Spot'] = ['Lena Castillo']; tick(h, ['The Spot'], 1); tick(h, ['Restrooms'], 1);
                    let opened = 0; zrOpenOwnerModal = () => {{ opened++; }};
                    const sheet = document.getElementById('zrZoneSheet'), body = () => document.getElementById('zrSheetBody').innerHTML;
                    const hand = () => sheet.listeners.click({{target: {{closest: s => s === '[data-zr-hand]' ? {{}} : null}}, currentTarget: sheet}});
                    const show = z => {{ currentZoneDaypart = h; currentChecklistZone = z; renderZoneResetView(); return body(); }};"""
        team, lead = run({'op': f"c => {{ {setup} {MAYA} const owned = show('The Spot'), nobody = show('Restrooms'); hand(); return [owned, nobody, opened]; }}"},
                         {'op': f"c => {{ {setup} const owned = show('The Spot'), nobody = show('Restrooms'); hand(); return [owned, nobody, opened]; }}"})
        for html in team[:2]:
            for gone in ('data-zr-hand', 'Hand off', 'Pick someone', 'Nobody owns this reset', 'TL · '):
                self.assertNotIn(gone, html)
            self.assertIn('role="checkbox" aria-checked="true"', html)            # the tick itself still shows
            self.assertIn('data-zr-sheet-close>Done</button>', html)
        self.assertIn('<div class="zr-owners"><span class="zr-owner"><i>LC</i>Lena</span></div>', team[0])   # who's on it with them
        self.assertNotIn('zr-owners', team[1])                                    # nobody on it: nothing to say
        self.assertEqual(team[2], 0)                                              # and the owner sheet never opens for them
        self.assertIn('data-zr-hand>Hand off</button>', lead[0])
        self.assertIn('<small>TL · ', lead[0])
        self.assertIn('Nobody owns this reset</span><button type="button" class="zr-owner-hand" data-zr-hand>Pick someone</button>', lead[1])
        self.assertEqual(lead[2], 1)

    def test_a_sign_in_redraws_the_page_and_their_zone_is_marked_in_ink(self):
        self.assertIn("""    launchSubnavRender('zonereset');
    if(typeof renderZoneResetCard === 'function') renderZoneResetCard();""", read('static', 'js', 'fohoe-and-safecount.js'))
        css = read('static', 'css', 'theme-cfa.css')
        self.assertIn('.zr-zone.is-mine{border:2px solid var(--text-primary);}', css)   # ink is "selected"; red stays for "now"
        self.assertIn('.zr-h-mine{color:var(--text-primary);}', css)
        self.assertNotIn('.zr-h.is-past', css)                                          # a handoff the team didn't finish has no colour of its own


class Wiring(unittest.TestCase):
    def test_the_list_comes_first(self):
        """Tim, Oct 28 2026: no intro box at the top; the pills, then the list."""
        page = read('cfa-buda-ops-hub-complete.html')
        view = page.split('id="zoneresetView"')[1].split('<div class="view"')[0]
        self.assertNotIn('section-intro', view)
        self.assertNotIn('Open a handoff, then a zone', view)                     # the page says it by itself now
        self.assertLess(view.index('data-launch-subnav'), view.index('id="zoneResetCard"'))
        self.assertIn('<div class="zr-card" id="zoneResetCard">', view)
        self.assertIn('root.appendChild(hint);', read('static', 'js', 'launch-mode.js'))   # the sign-in line goes last

    def test_the_page_loads_with_the_rest_and_the_sheet_sits_under_the_owner_sheet(self):
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertLess(page.index('/static/js/early-paint.js'), page.index('/static/js/zone-page.js'))     # not in Home's and Set Ups' first group
        self.assertLess(page.index('/static/js/zone-reset.js'), page.index('/static/js/early-paint.js'))    # the helpers are
        self.assertLess(page.index('id="zrZoneSheet"'), page.index('id="zrOwnerModal"'))
        zr = read('static', 'js', 'zone-reset.js')
        for gone in ('function renderZoneResetCard', 'function renderZoneResetView', 'function zrOpenOwnerModal'):
            self.assertNotIn(gone, zr)
            self.assertIn(gone, read('static', 'js', 'zone-page.js'))
        self.assertIn("if(view === 'zonereset'){ if(opened && typeof zrArrive === 'function') zrArrive(); renderZoneResetView(); renderWalkthroughsPage(); }", read('static', 'js', 'navigation.js'))

    def test_the_look_is_homes(self):
        css = read('static', 'css', 'theme-cfa.css')
        block = css[css.index('/* ===== Zone Resets: the page'):css.index('/* The one event, on its own')]
        self.assertIn('.zr-h.is-up{border:2px solid var(--text-primary);', block)
        self.assertIn('.zr-h.is-now .zr-h-k{padding:4px 9px;border-radius:999px;background:var(--cfa-red);color:#FFFFFF;}', block)
        self.assertIn('.zr-h.is-done{background:#EEF6F0;', block)
        self.assertIn('@media (min-width:860px){\n  .zr-list{grid-template-columns:repeat(5,minmax(0,1fr));}', block)   # the day across a tablet
        # Every animation sits inside "no preference".
        motion = block[block.index('@media (prefers-reduced-motion:no-preference){'):]
        self.assertEqual(block.count('animation:'), motion.count('animation:'))
        self.assertNotIn('zone-acc', css + read('static', 'css', 'main.css'))     # the old accordion's styles are gone

    def test_the_sky_banners_are_gone(self):
        """The Leader Transition List was the last thing wearing the handoff
        banners (the one happening now first; Tim, Oct 18 2026). It came off
        the hub on Nov 23 2026 (tests/test_leader_transition_off.py), and the
        banners with it; each handoff's sky stays, on the new cards."""
        js = read('static', 'js', 'zone-reset.js')
        for gone in ('function zrHandoffOrder', 'function zrHandoffBannersHtml'):
            self.assertNotIn(gone, js)
        self.assertIn("const ZR_HANDOFF_SKIES = ['morning', 'midday', 'afternoon', 'dusk', 'night'];", js)
        self.assertNotIn('zr-dp-', read('static', 'css', 'theme-cfa.css') + read('static', 'css', 'main.css'))


if __name__ == '__main__':
    unittest.main()
