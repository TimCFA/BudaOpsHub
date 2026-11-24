"""The bottom tab bar and the Nov 2026 refresh (Tim, Nov 12 2026).

On a touch screen (phones and every tablet) four places chosen for the role,
then Hub, sit at the bottom (Nov 23 2026); a computer keeps the tab row at
the top. Decided by touch, not width. Every page opens the one way
(launchShowTab), so the bar and the top row never disagree. Hub is a page
(/hub): recent pages, a search, and four groups named by the job, each page
only for those who can open it. Measured in a headless browser when made;
this pins the rules.

Run: python3 -m unittest discover tests
"""
import os
import re
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


def touch_block(css):
    """What a stylesheet says inside its last touch-screen media query."""
    start = css.rindex('@media (hover:none) and (pointer:coarse){')
    depth, i = 0, css.index('{', start)
    for j in range(i, len(css)):
        depth += {'{': 1, '}': -1}.get(css[j], 0)
        if depth == 0:
            return css[i + 1:j]
    raise AssertionError('the touch block never closes')


class BottomNav(unittest.TestCase):
    def setUp(self):
        self.css = read('static', 'css', 'theme-cfa.css')
        self.js = read('static', 'js', 'bottom-nav.js')
        self.page = read('cfa-buda-ops-hub-complete.html')

    def test_touch_screens_get_the_bar_and_computers_keep_the_tabs(self):
        touch = touch_block(self.css)
        self.assertIn('.tabs-wrap{display:none;}', touch)
        self.assertIn('.bnav{display:flex;', touch)
        # Off a touch screen the bar and its sheet are never drawn, and the tab row is untouched.
        before = self.css[:self.css.rindex('@media (hover:none) and (pointer:coarse){')]
        self.assertIn('.bnav{display:none;}', before)
        self.assertNotIn('.tabs-wrap{display:none', before)

    def test_what_is_pinned_to_the_bottom_sits_above_the_bar(self):
        touch = touch_block(self.css)
        self.assertIn(':root{--bnav-h:0px;}', self.css)
        for rule in ('.toast{bottom:calc(24px + var(--bnav-h));}', '.su-toolbar{bottom:calc(16px + var(--bnav-h));}',
                     '.update-banner{bottom:calc(16px + var(--bnav-h));}', '.app{padding-bottom:calc(60px + var(--bnav-h));}'):
            self.assertIn(rule, touch)
        # Pop-ups cover the bar (.overlay is 50); the Timers full screen hides it.
        self.assertIn('z-index:45;', touch)
        self.assertIn('body.tm-full .bnav{display:none;}', touch)

    def test_one_bar_at_the_bottom_on_tasks(self):
        touch = touch_block(read('static', 'css', 'pass.css'))
        self.assertIn('.ps-nav{position:static;', touch)
        self.assertIn('.ps-fab{bottom:calc(16px + var(--bnav-h,0px));}', touch)

    def test_every_page_opens_the_one_way(self):
        self.assertIn("if(typeof launchShowTab === 'function') launchShowTab(view);", self.js)
        # It opens no page itself: the only activateView here is the wrapper that keeps the bar in step.
        self.assertEqual(re.findall(r'activateView\((?!view\)\{)', self.js), [])

    def test_a_bar_for_each_role(self):
        self.assertIn("if(who === 'kitchen') return ['home', 'positions', 'prepboard', 'wastelog'];", self.js)
        self.assertIn("if(who === 'director') return ['home', 'positions', 'tasks', typeof hcAllowed === 'function' && hcAllowed() ? 'headcount' : 'calendar'];", self.js)
        self.assertIn("return ['home', 'positions', 'zonereset', 'tasks'];", self.js)
        self.assertIn("items.concat('hub')", self.js)
        # The kitchen bar is a signed-out iPad on Back (right-now.js).
        self.assertIn("rnDeviceSide() === 'boh') return 'kitchen';", self.js)
        # The bar redraws when who's holding the device changes.
        for hook in ("'siRender', 'rnSetDeviceSide'", 'launchSetManager = async function'):
            self.assertIn(hook, self.js)

    def test_hub_is_a_page_with_its_own_address(self):
        self.assertIn('<div class="view" id="hubView"><div id="hubRoot" class="hub"></div></div>', self.page)
        self.assertIn("hub: '/hub'", read('static', 'js', 'page-links.js'))
        self.assertIn("'hub'", read('static', 'js', 'launch-mode.js').split('const LAUNCH_VIEWS')[1].split(';')[0])

    def test_hub_shows_a_page_only_to_those_who_can_open_it(self):
        # The same rules activateView keeps (navigation.js).
        for rule in ("case 'huddle': case 'safecount': return lead();", "case 'knownumbers': return typeof knPageShown === 'function' ? knPageShown() : false;",
                     "case 'headcount': return typeof hcAllowed === 'function' && hcAllowed();", "case 'roles': return typeof rlShown === 'function' && rlShown();",
                     "case 'directors': return typeof launchManager !== 'undefined' && !!launchManager;", "!LAUNCH_VIEWS.includes(view)) return false;"):
            self.assertIn(rule, self.js)

    def test_every_page_has_one_name_in_hub(self):
        views = set(re.findall(r'class="view[^"]*" id="(\w+)View"', self.page))
        names = set(re.findall(r"^    (\w+): \{label: '", self.js, re.M))
        self.assertEqual(views, names)
        # The top row's menu says the same names.
        for name in ('>Zone Resets <', '>Food Safety <', '>Safe Count <', '>Waste <', 'aria-expanded="false">Lists <'):
            self.assertIn(name, self.page)

    def test_hub_text_is_escaped(self):
        self.assertIn('${esc(query.trim())}', self.js)
        self.assertNotIn('${query', self.js)

    def test_it_loads_with_the_first_group(self):
        # Straight after early-paint.js, so a phone has its tabs as soon as Home
        # shows; after navigation.js and launch-mode.js, which it leans on.
        scripts = re.findall(r'<script src="/static/js/([^"]+)\.js" defer></script>', self.page)
        at = scripts.index('bottom-nav')
        self.assertEqual(scripts[at - 1], 'early-paint')
        for needs in ('navigation', 'launch-mode'):
            self.assertLess(scripts.index(needs), at, needs)

    def test_only_home_and_set_ups_take_a_tap_while_the_rest_loads(self):
        touch = touch_block(self.css)
        self.assertIn('body.hub-warming .bnav-btn:not([data-bnav="home"]):not([data-bnav="positions"]){pointer-events:none;opacity:.45;}', touch)
        self.assertIn('body.hub-warming::after{bottom:calc(14px + var(--bnav-h));}', touch)

    def test_dark_mode_moves_into_hub_on_touch(self):
        self.assertIn('.hdr .hdr-theme{display:none;}', touch_block(self.css))
        self.assertIn("document.getElementById('hdrTheme')", self.js)

    def test_no_emoji_in_the_bar(self):
        self.assertEqual(re.findall('[\U0001F300-\U0001FAFF☀-➿]', self.js), [])


class Refresh(unittest.TestCase):
    def setUp(self):
        self.css = read('static', 'css', 'theme-cfa.css')

    def test_the_header_has_no_clock_but_keeps_its_element(self):
        self.assertIn('.clock{display:none;}', self.css)
        self.assertIn('id="clock"', read('cfa-buda-ops-hub-complete.html'))   # storage.js still writes the time into it

    def test_selected_is_ink_on_set_ups(self):
        self.assertIn('.su-strip .day-pill.active{background:var(--text-primary);border-color:var(--text-primary);}', self.css)
        self.assertIn('.su-strip .day-pill.is-today{border-color:var(--cfa-red);}', self.css)   # today keeps its red outline

    def test_positions_and_zones_are_rows_in_one_card(self):
        self.assertIn('#allDayparts .su-sheet-list .su-rowwrap{background:transparent;border:0;border-radius:0;}', self.css)
        self.assertIn('#allDayparts .su-sheet-list .su-row{box-shadow:none;', self.css)        # no stripe down the left edge
        self.assertIn('color-mix(in srgb,var(--zc) 22%,var(--cfa-white))', self.css)            # the zone colour is on the number
        # Zone Resets left this for tiles on Nov 23 2026 (tests/test_zone_reset_flow.py), and the Leader Transition List came off the hub.
        self.assertIn('#allDayparts .su-dp.is-open{border-radius:16px;box-shadow:0 6px 18px rgba(28,27,25,0.07);}', self.css)

    def test_waste_keeps_its_navy_pills(self):
        # Only the Lists pills became the one-row ink switch; Waste's are as they were.
        self.assertIn('.launch-pill.active{background:var(--cfa-navy);border-color:var(--cfa-navy);color:#F6F1E8;}', self.css)
        self.assertIn('.launch-subnav[aria-label="Lists"] .launch-pill.active{background:var(--text-primary);color:#F6F1E8;}', self.css)

    def test_selected_text_stays_readable_in_the_dark(self):
        dark = read('static', 'css', 'dark.css')
        for sel in ('.su-strip .day-pill.active b', '.su-side-opt.is-on'):
            self.assertIn(f'html[data-theme="dark"] {sel}', dark)


if __name__ == '__main__':
    unittest.main()
