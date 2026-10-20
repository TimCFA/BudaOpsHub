"""The Directors tab as one frame (Tim, Oct 19 2026): four destinations one
level deep (Brief · People · Report · Points), one header pattern (title and
the week or quarter picker on one line, Copy / PDF / "Bring notes in" behind
a single share icon), Points' eight sub-panes folded into Board · Inbox ·
More, and every profile a full page with a "← People" back button.

Run: python3 -m unittest discover tests
Names are made up.
"""
import json
import os
import re
import subprocess
import sys
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')
TEAM_RUNNER = os.path.join(ROOT, 'tests', 'team_pea_runner.js')
POINTS_RUNNER = os.path.join(ROOT, 'tests', 'points_runner.js')
REPORT_RUNNER = os.path.join(ROOT, 'tests', 'leader_report_runner.js')


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


def run(runner, op):
    out = subprocess.run(['node', runner], input=json.dumps({'cases': [{'op': op}]}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[0]


# Render into a fake #directorsRoot and hand back its HTML.
RENDER = "const root = {innerHTML: ''}; document.getElementById = id => id === 'directorsRoot' ? root : null; renderDirectorsView(); "

QUARTER = """
  listedLeaders = ['Maya Torres'];
  setRatings([pea('2026-10-01', 'Timothy Lane', 'Maya Torres', 'Team Lead', 3, 'Team Lead'), pea('2026-10-06', 'Maya Torres', 'Noah Bennett', 'iPOS', 2)]);
"""


class Destinations(unittest.TestCase):
    def test_four_destinations_one_level(self):
        js = read('static', 'js', 'directors.js')
        for v in ('brief', 'people', 'report', 'points'):
            self.assertIn(f'data-dir-view="{v}"', js)
        self.assertNotIn('data-dir-view="leaders"', js)
        self.assertNotIn('data-dir-view="team"', js)
        html = run(TEAM_RUNNER, "c => { " + QUARTER + RENDER + "return root.innerHTML; }")
        nav = html.split('class="uo-panes dir-nav"')[1].split('</div>')[0]
        self.assertEqual(nav.count('data-dir-view='), 2)     # brief, people; report and points aren't loaded in this runner
        self.assertIn('>Brief</button>', nav)
        self.assertIn('>People</button>', nav)

    def test_old_views_land_on_people(self):
        got = run(TEAM_RUNNER, """c => { const out = [];
            dirSetView('leaders'); out.push([dirView, dirPeople]);
            tpTab = 'team'; dirSetView('team'); out.push([dirView, dirPeople]);
            tpTab = 'raters'; dirSetView('team'); out.push([dirView, dirPeople]);
            dirSetPeople('team'); out.push([dirView, dirPeople, tpTab]);
            dirView = 'leaders'; out.push([dirShowsLeaders(), dirView]);
            dirView = 'nonsense'; dirNormalizeView(); out.push(dirView);
            dirSetView('points'); out.push(dirView);
            return out; }""")
        self.assertEqual(got, [['people', 'leaders'], ['people', 'team'], ['people', 'raters'], ['people', 'team', 'team'], [True, 'people'], 'brief', 'points'])

    def test_people_has_chips_and_the_brief_opens_it(self):
        html = run(TEAM_RUNNER, "c => { " + QUARTER + " dirSetPeople('leaders'); " + RENDER + "return root.innerHTML; }")
        self.assertIn('data-dir-people="leaders" aria-pressed="true"', html)
        self.assertIn('data-dir-people="team" aria-pressed="false"', html)
        self.assertIn('data-dir-people="raters" aria-pressed="false"', html)
        self.assertIn('<h2 class="dir-title">People</h2>', html)
        self.assertIn('id="dirQuarter"', html)
        brief = run(TEAM_RUNNER, "c => { " + QUARTER + " dirView = 'brief'; " + RENDER + "return root.innerHTML; }")
        self.assertIn('data-dir-view="people" data-dir-people="leaders">Open People', brief)
        raters = run(TEAM_RUNNER, "c => { " + QUARTER + " dirSetPeople('raters'); " + RENDER + "return root.innerHTML; }")
        self.assertIn('Rater leaderboard', raters)
        self.assertNotIn('data-tp-tab=', raters)                 # the chips pick the board, not a second tab row
        team = run(TEAM_RUNNER, "c => { " + QUARTER + " dirSetPeople('team'); " + RENDER + "return root.innerHTML; }")
        self.assertIn('Team scoreboard', team)


class Header(unittest.TestCase):
    def test_share_menu_holds_copy_and_pdf(self):
        brief = run(TEAM_RUNNER, "c => { " + QUARTER + " dirView = 'brief'; " + RENDER + "return root.innerHTML; }")
        self.assertIn('data-dir-share aria-label="Share" aria-haspopup="menu" aria-expanded="false"', brief)
        self.assertIn('<div class="dir-share-menu" role="menu" hidden>', brief)
        self.assertIn('class="dir-share-item" role="menuitem" data-dir-copy>Copy brief</button>', brief)
        self.assertIn('class="dir-share-item" role="menuitem" data-dir-pdf>PDF</button>', brief)
        self.assertIn('id="dirWeekPick"', brief)
        self.assertNotIn('class="btn btn-ghost dir-btn" data-dir-copy', brief)
        self.assertEqual(brief.count('<div class="dir-head">'), 1)
        people = run(TEAM_RUNNER, "c => { " + QUARTER + " ldiCardHtml = () => ''; ldiOpen = false; dirSetPeople('leaders'); " + RENDER + "return root.innerHTML; }")
        self.assertIn('data-ldi-open>Bring notes in</button>', people)
        self.assertNotIn('data-ld-copy', people)
        raters = run(TEAM_RUNNER, "c => { " + QUARTER + " dirSetPeople('raters'); " + RENDER + "return root.innerHTML; }")
        self.assertIn('data-tp-copy>Copy board</button>', raters)

    def test_report_header(self):
        html = run(REPORT_RUNNER, "c => { dirView = 'report'; " + RENDER + "return root.innerHTML; }")
        self.assertIn('<h2 class="dir-title">Weekly report</h2>', html)
        self.assertIn('id="lrWeekPick"', html)
        self.assertIn('data-lr-week="-1" selected', html)
        self.assertIn('data-lr-copy>Copy report</button>', html)
        self.assertIn('data-lr-pdf>PDF</button>', html)
        self.assertEqual(html.count('<p class="dir-sub">'), 1)
        self.assertIn("if(e.target && e.target.id === 'lrWeekPick')", read('static', 'js', 'leader-report.js'))

    def test_share_toggle_and_outside_tap(self):
        js = read('static', 'js', 'directors.js')
        self.assertIn("if(share){ dirShareToggle(share); return; }", js)
        self.assertIn("document.querySelectorAll('#directorsRoot .dir-share-menu:not([hidden])').forEach(dirShareClose);", js)
        got = run(TEAM_RUNNER, """c => {
            const btn = {attrs: {}, setAttribute(k, v){ this.attrs[k] = v; }, nextElementSibling: null};
            const menu = {hidden: true, previousElementSibling: btn}; btn.nextElementSibling = menu;
            dirShareToggle(btn); const a = [menu.hidden, btn.attrs['aria-expanded']];
            dirShareToggle(btn); const b = [menu.hidden, btn.attrs['aria-expanded']];
            dirShareToggle(btn); dirShareClose(menu); const c2 = [menu.hidden, btn.attrs['aria-expanded']];
            return [a, b, c2]; }""")
        self.assertEqual(got, [[False, 'true'], [True, 'false'], [True, 'false']])

    def test_one_quarter_picker_drives_both_boards(self):
        js = read('static', 'js', 'directors.js')
        self.assertIn("if(el.id === 'dirQuarter'){", js)
        self.assertIn("if(typeof ldQuarter !== 'undefined') ldQuarter = el.value;", js)
        self.assertIn("if(typeof tpQuarter !== 'undefined') tpQuarter = el.value;", js)
        self.assertIn(".dir-head{align-items:center;flex-wrap:nowrap;", read('static', 'css', 'theme-cfa.css'))


class Profiles(unittest.TestCase):
    def test_back_to_people_and_no_nav_on_a_profile(self):
        self.assertIn('data-ld-back>← People</button>', read('static', 'js', 'leaders.js'))
        self.assertIn('data-tp-back>← People</button>', read('static', 'js', 'team-pea.js'))
        html = run(TEAM_RUNNER, "c => { " + QUARTER + " dirSetPeople('leaders'); ldOpen = 'Maya Torres'; " + RENDER + "return root.innerHTML; }")
        self.assertIn('← People', html)
        self.assertNotIn('class="uo-panes dir-nav"', html)
        self.assertNotIn('data-dir-people=', html)
        self.assertIn('data-ld-copy>Copy profile</button>', html)
        self.assertEqual(html.count('<div class="dir-head">'), 1)
        tp = run(TEAM_RUNNER, "c => { " + QUARTER + " dirSetPeople('raters'); tpOpen = 'Maya Torres'; " + RENDER + "return root.innerHTML; }")
        self.assertIn('← People', tp)
        self.assertNotIn('class="uo-panes dir-nav"', tp)
        self.assertIn('data-tp-copy>Copy profile</button>', tp)
        self.assertIn('data-tp-pdf>PDF</button>', tp)

    def test_team_handlers_follow_the_people_view(self):
        js = read('static', 'js', 'team-pea.js')
        self.assertNotIn("dirView === 'team'", js)
        self.assertNotIn("dirView === 'leaders'", js)
        self.assertIn("!(typeof dirShowsTeam === 'function' && dirShowsTeam())", js)


class Points(unittest.TestCase):
    def test_three_panes(self):
        got = run(POINTS_RUNNER, """c => { setup(); const out = {};
            ptPane = 'board'; out.board = ptActionsHtml();
            ptPane = 'review'; out.inbox = ptActionsHtml(); out.inboxBody = ptBodyHtml();
            ptPane = 'settings'; out.more = ptActionsHtml(); ptPane = 'board'; out.again = ptActionsHtml();
            return out; }""")
        for pane in ('board', 'inbox', 'more'):
            html = got[pane]
            self.assertEqual(html.count('data-pt-pane='), 3 + (4 if pane == 'more' else 0), pane)
            self.assertIn('>Board</button>', html)
            self.assertIn('>More</button>', html)
        chips = [int(n or 0) for n in re.findall(r'data-pt-jump="\w+" aria-pressed="\w+">\w+(?: · (\d+))?</button>', got['inbox'])]
        self.assertEqual(len(chips), 3)
        self.assertIn(f'data-pt-pane="review">Inbox · {sum(chips)}</button>', got['board'])   # review + messages + tasks
        self.assertNotIn('data-pt-jump', got['board'])
        self.assertIn('data-pt-jump="review" aria-pressed="true">Review</button>', got['inbox'])     # both items were resolved in setup
        self.assertIn('data-pt-jump="messages" aria-pressed="false">Messages · 3</button>', got['inbox'])
        self.assertIn('data-pt-jump="tasks" aria-pressed="false">Tasks · 3</button>', got['inbox'])
        self.assertIn('<div id="ptSecReview">', got['inboxBody'])
        self.assertIn('<div id="ptSecMessages">', got['inboxBody'])
        self.assertIn('<div id="ptSecTasks">', got['inboxBody'])
        self.assertIn('data-pt-pane="settings" aria-pressed="true">Settings</button>', got['more'])
        self.assertIn('data-pt-pane="memos" aria-pressed="false">Memos</button>', got['more'])
        self.assertIn('>Add points</button>', got['more'])
        self.assertIn('>Upload</button>', got['more'])
        self.assertIn('data-pt-pane="settings">More</button>', got['again'])        # More reopens where it was left

    def test_jump_scrolls_to_the_section(self):
        js = read('static', 'js', 'points.js')
        self.assertIn("const jump = t.closest('[data-pt-jump]');", js)
        self.assertIn("document.getElementById('ptSec' + ptPane.charAt(0).toUpperCase() + ptPane.slice(1))", js)


if __name__ == '__main__':
    unittest.main()
