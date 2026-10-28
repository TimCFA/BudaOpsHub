"""Tools (Tim, Oct 23 2026): the pages that work the numbers for us get one
tab. The team gets the Prep Board; the full site (managers) also gets the
Sales & Labor Forecast and CEM Insights, as pills at the top.

Run: python3 -m unittest discover tests
"""
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


PAGE = read('cfa-buda-ops-hub-complete.html')
LAUNCH = read('static', 'js', 'launch-mode.js')


class Tools(unittest.TestCase):
    def test_tools_on_the_full_site_the_prep_board_on_both(self):
        # Tim, Oct 27 2026: no Tools on the simplified site, but the Prep Board
        # stays, as its own tab; a link to the rest opens Home.
        tab = re.search(r'<button[^>]*data-views="prepboard knownumbers forecast cem"[^>]*>Tools <span class="sub"><i>Herramientas</i></span>', PAGE)
        self.assertTrue(tab)
        self.assertIn('class="tab full-only"', tab.group(0))
        self.assertIn('<button type="button" class="tab launch-only" role="tab" aria-selected="false" aria-controls="prepboardView" data-view="prepboard">Prep Board', PAGE)
        self.assertIn("const LAUNCH_FULL_ONLY_VIEWS = ['knownumbers', 'forecast', 'cem'];", LAUNCH)
        self.assertIn("'prepboard'", LAUNCH.split('const LAUNCH_VIEWS')[1].split(';')[0])
        self.assertIn("if(typeof launchIsOn === 'function' && launchIsOn() && LAUNCH_FULL_ONLY_VIEWS.includes(view)) view = 'home';", read('static', 'js', 'navigation.js'))

    def test_moved_out_of_lists_oe_and_the_tab_bar(self):
        self.assertIn('data-views="zonereset timers foodsafety safecount">Lists', PAGE)
        self.assertNotIn('class="tab-dropdown-item" role="menuitem" aria-controls="prepboardView"', PAGE)
        self.assertNotIn('data-view="forecast">Forecast', PAGE)
        lists = LAUNCH[LAUNCH.index('const LAUNCH_LISTS'):LAUNCH.index('const LAUNCH_TOOLS')]
        self.assertNotIn('prepboard', lists)

    def test_the_tools_and_who_sees_them(self):
        tools = LAUNCH[LAUNCH.index('const LAUNCH_TOOLS'):LAUNCH.index('];', LAUNCH.index('const LAUNCH_TOOLS'))]
        self.assertEqual(re.findall(r"view: '(\w+)'", tools), ['prepboard', 'knownumbers', 'forecast', 'cem'])
        self.assertEqual(re.findall(r"view: '(\w+)'[^}]*leaders: true", tools), ['knownumbers'])   # Team Leads and up
        self.assertIn("|| (l.leaders && typeof knPageShown === 'function' && !knPageShown());", LAUNCH)
        self.assertEqual(re.findall(r"view: '(\w+)'[^}]*full: true", tools), ['knownumbers', 'forecast', 'cem'])
        self.assertIn('|| (l.full && launchIsOn())', LAUNCH)
        self.assertIn('nav.hidden = shown.length < 2;', LAUNCH)          # the team's one tool: no pill row
        for view in ('prepboard', 'knownumbers', 'forecast', 'cem'):
            body = PAGE[PAGE.index(f'id="{view}View"'):]
            self.assertTrue(body.startswith(f'id="{view}View">\n    <nav class="launch-subnav" aria-label="Tools" data-launch-subnav></nav>'), view)

    def test_cem_insights_has_its_own_page(self):
        cem = PAGE[PAGE.index('id="cemView"'):PAGE.index('id="forecastView"')]
        self.assertIn('id="cemTrendsRoot"', cem)
        self.assertEqual(PAGE.count('id="cemTrendsRoot"'), 1)
        self.assertIn('data-launch-go="cem"', PAGE)                      # Guest Obsession links to it
        self.assertIn("if(view === 'cem' && typeof renderCemTrends === 'function') renderCemTrends();", read('static', 'js', 'navigation.js'))


if __name__ == '__main__':
    unittest.main()
