"""The page shell (Oct 18 2026): the page scrolls, never the body. A body of
exactly the viewport's height with overflow set was a scroll box, and on
iPhones the keyboard opening or closing left everything below the fold
unpainted. Checked in a headless browser when made; this pins the rules.

Run: python3 -m unittest discover tests
"""
import os
import re
import unittest

CSS = os.path.join(os.path.dirname(__file__), '..', 'static', 'css', 'main.css')


class PageShell(unittest.TestCase):
    def test_body_is_not_a_scroll_box(self):
        with open(CSS, encoding='utf-8') as f:
            css = f.read()
        html = re.search(r'^\s*html\{([^}]*)\}', css, re.M).group(1)
        body = re.search(r'^\s*body\{([^}]*)\}', css, re.M).group(1)
        self.assertIn('min-height:100%', html)
        self.assertNotIn('height:100%;', html.replace('min-height', ''))
        self.assertIn('overflow-x:hidden', html)
        self.assertIn('overflow-x:clip', body)
        self.assertNotIn('overflow-y', body)
        self.assertNotIn('height:100%;', body.replace('min-height', ''))
        self.assertNotRegex(css, r'html,body\{[^}]*height:100%')


if __name__ == '__main__':
    unittest.main()
