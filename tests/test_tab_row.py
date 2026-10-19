"""The tab row (Tim, Oct 18 2026): on the full site it scrolls sideways and
must never scroll up and down (the tabs used to hang 2px below the row, so
it wobbled under a thumb). Measured in a headless browser when made; this
pins the rule.

Run: python3 -m unittest discover tests
"""
import os
import unittest

CSS = os.path.join(os.path.dirname(__file__), '..', 'static', 'css', 'theme-cfa.css')


class TabRow(unittest.TestCase):
    def test_never_scrolls_vertically(self):
        with open(CSS, encoding='utf-8') as f:
            css = f.read()
        self.assertIn('.tabs{overflow-y:hidden;border-bottom:0;box-shadow:inset 0 -2px 0 var(--border);}', css)
        self.assertIn('.tab,.tab-group-label{margin-bottom:0;}', css)


if __name__ == '__main__':
    unittest.main()
