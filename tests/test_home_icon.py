"""Home screen icon (Tim, Oct 18 2026): Add to Home Screen on an iPhone shows
the store's logo mark instead of a generic icon.

Run: python3 -m unittest discover tests
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
from PIL import Image  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')


class HomeScreenIcon(unittest.TestCase):
    def test_page_links_the_icons(self):
        with open(os.path.join(ROOT, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
            head = f.read().split('</head>')[0]
        self.assertIn('<link rel="apple-touch-icon" href="/static/icons/apple-touch-icon.png">', head)
        self.assertIn('<meta name="apple-mobile-web-app-title" content="Ops Hub">', head)

    def test_icons_are_square_and_opaque(self):
        # iOS paints see-through corners black, so the icon has no alpha.
        for name, size in (('apple-touch-icon.png', 180), ('icon-192.png', 192), ('favicon-32.png', 32)):
            im = Image.open(os.path.join(ROOT, 'static', 'icons', name))
            self.assertEqual(im.size, (size, size), name)
            self.assertEqual(im.mode, 'RGB', name)

    def test_served(self):
        r = appmod.app.test_client().get('/static/icons/apple-touch-icon.png')
        self.assertEqual((r.status_code, r.mimetype), (200, 'image/png'))
        r.close()


if __name__ == '__main__':
    unittest.main()
