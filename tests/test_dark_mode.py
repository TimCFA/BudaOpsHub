"""Dark mode (Tim, Oct 20 2026: the light pages strain his eyes on the
computer). Per device, from the moon in the header; the generated dark
stylesheets (tools/dark_css.py) must match the light ones they come from.

Run: python3 -m unittest discover tests
"""
import os
import re
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import dark_css  # noqa: E402


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


class Generated(unittest.TestCase):
    def test_up_to_date(self):
        for src, dst in dark_css.SOURCES:
            self.assertEqual(read('static', 'css', dst), dark_css.build(src),
                             f'{dst} is out of date: run python3 tools/dark_css.py')

    def test_only_ever_dark(self):
        # Every rule is scoped to html[data-theme="dark"]: the light pages don't change.
        for _, dst in dark_css.SOURCES:
            css = dark_css.strip_comments(read('static', 'css', dst))
            def check(text):
                for prelude, body in dark_css.blocks(text):
                    if prelude.startswith('@'):
                        check(body)
                        continue
                    for sel in dark_css.split_top(prelude, ','):
                        self.assertIn('html[data-theme="dark"]', sel, sel)
            check(css)

    def test_selectors_keep_their_weight(self):
        self.assertEqual(dark_css.dark_selector('.rn-rp.is-now'), ':where(html[data-theme="dark"]) .rn-rp.is-now')
        self.assertEqual(dark_css.dark_selector(':root'), 'html[data-theme="dark"]')
        self.assertEqual(dark_css.dark_selector('html.is-standalone .hdr-reload'), 'html[data-theme="dark"].is-standalone .hdr-reload')


class Colours(unittest.TestCase):
    def v(self, prop, value):
        return dark_css.dark_value(prop, value)

    def test_surfaces_text_and_lines(self):
        self.assertEqual(self.v('background', '#fff'), '#1D1D1D')                 # a white card turns dark
        self.assertEqual(self.v('color', '#1C1B19'), '#DDDBD9')                   # dark ink turns light
        self.assertEqual(self.v('border', '1px solid #E4DCCF'), '1px solid #3C3933')
        self.assertIsNone(self.v('background', 'var(--cfa-red)'))                 # tokens: dark.css
        self.assertIsNone(self.v('background', '#DD0031'))                        # brand red stays
        self.assertIsNone(self.v('background', '#004F71'))                        # navy cards stay
        self.assertIsNone(self.v('color', '#fff'))                                # white on red stays
        self.assertIsNone(self.v('box-shadow', '0 1px 2px rgba(0,0,0,.1)'))
        self.assertEqual(self.v('color', 'var(--cfa-navy)'), 'var(--ink-navy)')   # navy text lightens
        # A tint keeps a hint of its hue; a faint black wash turns a faint white one.
        r, g, b, _ = dark_css.parse_color(self.v('background', '#FDECEF'))
        self.assertTrue(r > g and r < 0.3)
        self.assertEqual(self.v('background', 'rgba(0,0,0,.05)'), 'rgba(255,255,255,0.07)')

    def test_an_ink_chip_turns_over(self):
        css = dark_css.convert('.chip.on{background:var(--text-primary);color:#F6F1E8;}')
        self.assertEqual(css, ':where(html[data-theme="dark"]) .chip.on{color:var(--cfa-bg);}')

    def test_important_and_media_kept(self):
        css = dark_css.convert('@media (max-width:600px){ .a{background:#fff !important;} } @keyframes x{from{background:#fff}}')
        self.assertIn('@media (max-width:600px){', css)
        self.assertIn('.a{background:#1D1D1D !important;}', css)
        self.assertNotIn('keyframes', css)


class Wiring(unittest.TestCase):
    def test_page(self):
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertIn('<link rel="stylesheet" href="/static/css/main.css">\n<link rel="stylesheet" href="/static/css/dark-main.gen.css">\n'
                      '<link rel="stylesheet" href="/static/css/theme-cfa.css">\n<link rel="stylesheet" href="/static/css/dark-theme.gen.css">\n'
                      '<link rel="stylesheet" href="/static/css/dark.css">', page)
        # Set in the <head>, before the page paints.
        head = page.split('</head>')[0]
        self.assertIn("if(localStorage.getItem('cfaBudaTheme')==='dark'){document.documentElement.dataset.theme='dark';", head)
        self.assertIn('id="hdrTheme"', page)
        self.assertIn('<script src="/static/js/theme.js"></script>', page)
        js = read('static', 'js', 'theme.js')
        self.assertIn("const THEME_KEY = 'cfaBudaTheme';", js)
        self.assertFalse(re.search(r'[\U0001F300-\U0001FAFF]', js + read('static', 'css', 'dark.css')))   # line icons, never emoji

    def test_tokens(self):
        css = read('static', 'css', 'dark.css')
        for token in ('--cfa-bg:', '--cfa-white:', '--text-primary:', '--border:', '--ink-navy:', '--ink-red:', '--ink-dark-red:', '--ok-soft:'):
            self.assertIn(token, css.split('html[data-theme="dark"] body')[0])


if __name__ == '__main__':
    unittest.main()
