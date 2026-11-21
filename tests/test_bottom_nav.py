"""The bottom tab bar and the Nov 2026 refresh (Tim, Nov 12 2026).

On a touch screen (phones and every tablet) Home, Set Ups, Lists, Waste and
More sit at the bottom; a computer keeps the tab row at the top. Decided by
touch, not width. The bar presses the top row's own tabs, so the two never
disagree. Measured in a headless browser when made; this pins the rules.

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
        self.assertIn('.bnav,.bnav-scrim{display:none;}', before)
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

    def test_the_bar_presses_the_top_rows_tabs(self):
        self.assertIn("const mainTab = view => tabs.querySelector(`.tab[data-view=\"${view}\"]`);", self.js)
        self.assertIn('if(tab) tab.click();', self.js)
        self.assertIn('if(el) el.click();', self.js)
        # It opens no page itself: the only activateView here is the wrapper that keeps the bar in step.
        self.assertEqual(re.findall(r'activateView\((?!view\)\{)', self.js), [])
        for view in ('home', 'positions', 'zonereset', 'wastelog'):
            self.assertIn(f"{{view: '{view}',", self.js)
            self.assertRegex(self.page, rf'class="tab[^"]*"[^>]*data-view="{view}"')

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

    def test_dark_mode_moves_into_more_on_touch(self):
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
        self.assertIn('.zr-dp-body .zone-acc-item{border:0;border-radius:0;}', self.css)

    def test_waste_keeps_its_navy_pills(self):
        # Only the Lists pills became the one-row ink switch; Waste's are as they were.
        self.assertIn('.launch-pill.active{background:var(--cfa-navy);border-color:var(--cfa-navy);color:#F6F1E8;}', self.css)
        self.assertIn('.launch-subnav[aria-label="Lists"] .launch-pill.active{background:var(--text-primary);color:#F6F1E8;}', self.css)

    def test_selected_text_stays_readable_in_the_dark(self):
        dark = read('static', 'css', 'dark.css')
        for sel in ('.su-strip .day-pill.active b', '.su-side-opt.is-on', '.bnav-row.active'):
            self.assertIn(f'html[data-theme="dark"] {sel}', dark)


if __name__ == '__main__':
    unittest.main()
