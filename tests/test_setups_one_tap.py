"""One tap picks a name in the Set Ups picker (Tim, Oct 28 2026: on the iPad
it took two). With the search box focused, pressing a name took the focus
away, the iPad dropped its keyboard bar, the screen grew, the centered sheet
moved under the pointer and the press was lost. The press now leaves the
focus in the search box, and on a tablet the sheet sits a fixed way down
from the top instead of centered, so a height change can't move it.

Run: python3 -m unittest discover tests
"""
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


class OneTap(unittest.TestCase):
    def test_a_press_on_a_name_keeps_the_search_focus(self):
        js = read('static', 'js', 'daypicker-and-positions.js')
        self.assertIn("['posModal', 'vacancyModal'].forEach(", js)
        i = js.index("['posModal', 'vacancyModal'].forEach(")
        block = js[i:js.index('});', i)]
        self.assertIn("addEventListener('mousedown'", block)
        self.assertIn("e.target.closest('button')", block)
        self.assertIn("matches('input[type=\"search\"]')", block)
        self.assertIn('e.preventDefault()', block)
        self.assertIn('<input type="search" id="posModalSearch"', read('cfa-buda-ops-hub-complete.html'))

    def test_the_tablet_sheet_is_not_centered(self):
        css = read('static', 'css', 'theme-cfa.css')
        rule = re.search(r'@media \(min-width:720px\)\{ \.su-pick\{[^}]*\}', css).group(0)
        self.assertIn('align-items:flex-start', rule)
        self.assertNotIn('align-items:center', rule)


if __name__ == '__main__':
    unittest.main()
