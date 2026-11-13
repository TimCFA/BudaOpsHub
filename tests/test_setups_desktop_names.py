"""Set Ups on a computer: the name sits beside its position (Tim, Nov 13 2026:
"they're so far apart it's hard to keep them all straight"). With a mouse and
a wide screen the position takes a fixed column and the name starts right
after it; touch screens keep the name at the right edge.

Run: python3 -m unittest discover tests
"""
import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class DesktopNames(unittest.TestCase):
    def test_the_name_follows_the_position_on_a_computer_only(self):
        with open(os.path.join(ROOT, 'static', 'css', 'theme-cfa.css'), encoding='utf-8') as f:
            css = f.read()
        block = css[css.index('@media (hover:hover) and (pointer:fine) and (min-width:900px){\n  #allDayparts .su-sheet-list .su-row{'):]
        block = block[:block.index('\n}\n') + 3]
        self.assertIn('#allDayparts .su-sheet-list .su-row{grid-template-columns:300px minmax(0,1fr);gap:20px;}', block)
        self.assertIn('#allDayparts .su-sheet-list .su-row-name{justify-content:flex-start;text-align:left;max-width:none;}', block)
        # Outside that block, the phone and tablet rule is untouched.
        self.assertIn('#allDayparts .su-sheet-list .su-row-name{justify-content:flex-end;text-align:right;max-width:58vw;}', css)


if __name__ == '__main__':
    unittest.main()
