"""A line on Home goes straight to its item, not to the top of its page (Tim,
Nov 23 2026: "when you click on the breaks remaining, it should navigate to
the set ups page and scroll down to the breaks section").
"""
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
read = lambda *p: open(os.path.join(ROOT, *p), encoding='utf-8').read()


class BreakLines(unittest.TestCase):
    def setUp(self):
        self.rn = read('static', 'js', 'right-now.js')

    def test_every_break_line_goes_to_the_breaks(self):
        rows = [l for l in self.rn.split('\n') if 'rnRow(' in l and re.search(r'break\$\{', l)]
        self.assertEqual(len(rows), 3)                                   # a leader's breaks left, breaks due, the kitchen's
        following = self.rn.split('\n')
        for row in rows:
            at = following.index(row)
            self.assertRegex('\n'.join(following[at:at + 3]), r'`breaks:(\$\{side\}|\$\{soon\[0\]\.side\}|boh)`')
        self.assertNotRegex(self.rn, r'break\$\{[^\n]*`setups:')

    def test_the_breaks_open_set_ups_at_the_roster_on_breaks_left(self):
        fn = re.search(r'function rnOpenBreaks\(side\)\{[\s\S]*?\n\}\n', self.rn).group(0)
        self.assertIn("rnOpenSetups(side, today, '');", fn)
        self.assertIn("rosterView = 'breaks'; renderRoster();", fn)
        self.assertIn("document.getElementById('rosterContainer')", fn)
        self.assertIn("card.scrollIntoView({block: 'start'})", fn)
        self.assertNotIn('localStorage', fn)                              # the device's own All / Breaks left choice stays
        self.assertIn("else if(what === 'breaks') rnOpenBreaks(parts[0] === 'boh' ? 'boh' : 'foh');", self.rn)

    def test_the_roster_clears_the_pinned_day_strip(self):
        self.assertIn('#rosterContainer{scroll-margin-top:70px;}', read('static', 'css', 'theme-cfa.css'))
        self.assertIn('id="rosterContainer"', read('cfa-buda-ops-hub-complete.html'))


if __name__ == '__main__':
    unittest.main()
