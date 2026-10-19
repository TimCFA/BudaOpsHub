"""The initials box (Oct 18 2026): on a phone with no initials it opens on
load, and the first tap elsewhere closes it. Redrawing the badge mid-tap made
the header taller and the tap missed its tab, so the box closes once the tap
is over. Checked in a headless browser when made; this pins the wiring.

Run: python3 -m unittest discover tests
"""
import os
import re
import unittest

JS = os.path.join(os.path.dirname(__file__), '..', 'static', 'js', 'state-and-utils.js')


class InitialsBox(unittest.TestCase):
    def test_closes_after_the_tap(self):
        with open(JS, encoding='utf-8') as f:
            src = f.read()
        body = src.split('function beginEditInitials(){')[1].split('\n}\n')[0]
        self.assertNotIn("addEventListener('blur', commit)", body)
        self.assertRegex(body, r"document\.addEventListener\('click', \(\) => \{ clearTimeout\(fallback\); setTimeout\(commit, 0\); \}, \{once: true, capture: true\}\)")
        self.assertIn('setTimeout(commit, 700)', body)
        # Enter still saves at once, and only once.
        self.assertIn("if(e.key === 'Enter') commit();", body)
        self.assertTrue(re.search(r"const commit = \(\) => \{ if\(!done\)\{ done = true; setInitials\(input\.value\); \} \};", body))


if __name__ == '__main__':
    unittest.main()
