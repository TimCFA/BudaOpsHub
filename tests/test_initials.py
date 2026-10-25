"""Typed initials are gone (Tim, Oct 25 2026): a signed-out iPad still wrote
his initials on the waste it logged. Who did something is who's signed in
(or the shared store device); anything that needs a name asks for a sign-in,
and initials left on a device are cleared. The badge opens the sign-in
sheet, so it has no menu arrow.

Run: python3 -m unittest discover tests
"""
import os
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


class NoInitials(unittest.TestCase):
    def test_who_is_the_sign_in_or_nobody(self):
        src = read('static', 'js', 'state-and-utils.js')
        body = src.split('function getInitials(){')[1].split('\n}\n')[0]
        self.assertNotIn('localStorage', body)
        self.assertIn("return '';", body)
        self.assertIn('localStorage.removeItem(INITIALS_STORAGE_KEY)', src)
        self.assertNotIn('function editInitialsBox', src)
        self.assertNotIn('function setInitials', src)

    def test_no_typed_initials_anywhere(self):
        for name in os.listdir(os.path.join(ROOT, 'static', 'js')):
            if name.endswith('.js'):
                js = read('static', 'js', name)
                for gone in ('Use initials instead', 'editInitialsBox', 'setInitials(', 'Say who you are'):
                    self.assertNotIn(gone, js, f'{name}: {gone}')

    def test_the_badge_has_no_arrow(self):
        src = read('static', 'js', 'state-and-utils.js')
        badge = src.split('function renderInitialsBadge(){')[1].split('\n}\n')[0]
        self.assertNotIn('▾', badge)
        self.assertNotIn('▾', read('cfa-buda-ops-hub-complete.html').split('id="initialsBadge"')[1][:200])


if __name__ == '__main__':
    unittest.main()
