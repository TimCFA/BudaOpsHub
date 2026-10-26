"""The phone's keyboard (Tim, Oct 25 2026): on iOS it covered the sheet
being typed in (Add Team Member's name box). While it's up, open sheets sit
in the part of the screen still showing and the box scrolls into view.
Checked in a headless browser with a stand-in visual viewport when made;
this pins the wiring.

Run: python3 -m unittest discover tests
"""
import os
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


class KeyboardSheets(unittest.TestCase):
    def test_wiring(self):
        js = read('static', 'js', 'state-and-utils.js')
        self.assertIn("window.visualViewport.addEventListener('resize', kbSync);", js)
        self.assertIn("root.style.setProperty('--vvh', Math.round(vv.height) + 'px');", js)
        self.assertIn("root.classList.toggle('kb-open', hidden > 120 && vv.scale <= 1.01);", js)   # not when zoomed in
        self.assertIn("el.scrollIntoView({block: 'center'});", js)
        css = read('static', 'css', 'theme-cfa.css')
        self.assertIn('.kb-open .overlay.active,.kb-open .si-sheet.active,.kb-open .rn-evs.is-open{inset:auto 0 auto 0;top:var(--vvt,0);height:var(--vvh,100%);}', css)
        self.assertIn('max-height:100%;overflow-y:auto;', css)


if __name__ == '__main__':
    unittest.main()
