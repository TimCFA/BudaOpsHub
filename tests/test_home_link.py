"""The title top left is a link home (Tim, Nov 23 2026), and the band's lower
edge melts into the white. Checked in a browser when made; this pins the rules.

Run: python3 -m unittest discover tests
"""
import os
import re
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


class TitleLink(unittest.TestCase):
    def setUp(self):
        self.page = read('cfa-buda-ops-hub-complete.html')
        self.nav = read('static', 'js', 'navigation.js')
        self.css = read('static', 'css', 'theme-cfa.css')

    def test_the_title_is_a_real_link_to_the_front_page(self):
        # A link, so it can be tabbed to and opened in a new tab; the script takes the plain click.
        m = re.search(r'<a class="hdr-title hdr-home" id="hdrHome" href="/"[^>]*>\s*<h1>Ops Hub</h1>\s*<span class="location">Buda</span>\s*</a>', self.page)
        self.assertTrue(m)
        self.assertIn('aria-label="Ops Hub Buda, go to Home"', m.group(0))

    def test_a_plain_click_presses_the_home_tab(self):
        self.assertIn("document.getElementById('hdrHome')", self.nav)
        self.assertIn("document.querySelector('.tabs .tab[data-view=\"home\"]')", self.nav)
        self.assertIn('tab.click();', self.nav)
        self.assertIn('window.bnavSync()', self.nav)           # the bottom bar's Home lights up
        # Ctrl, cmd, shift and the middle button are left to the browser.
        self.assertIn('e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1', self.nav)

    def test_it_keeps_the_titles_look_and_takes_a_tap_while_warming(self):
        self.assertIn('.hdr-home{text-decoration:none;color:inherit;cursor:pointer;', self.css)
        self.assertIn('body.hub-warming .hdr-home{pointer-events:auto;}', self.css)
        self.assertIn('.hdr-home:focus-visible{', self.css)


class BandEdge(unittest.TestCase):
    def test_the_band_melts_into_the_white(self):
        css = read('static', 'css', 'theme-cfa.css')
        fade = 'bottom:-30px;background:linear-gradient(to bottom,var(--band) calc(100% - 34px),transparent 100%);'
        self.assertIn('html:not([data-theme="dark"]) .app > .tabs-wrap::before{' + fade + '}', css)   # a computer: the tab row
        self.assertIn('html:not([data-theme="dark"]) body .app > .hdr::before{' + fade + '}', css)    # a touch screen: the header alone
        self.assertNotIn('border-radius:0 0 26px 26px', css)                                          # no rounded corners
        self.assertNotIn('--band-shadow', css)                                                        # no shadow edge either


if __name__ == '__main__':
    unittest.main()
