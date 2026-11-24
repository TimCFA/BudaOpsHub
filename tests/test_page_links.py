"""Page links (Tim, Nov 23 2026): every page has its own address.

The hub is still one page. static/js/page-links.js keeps the address in step
with the open view (a tap is a step back can undo; a page the hub opens by
itself replaces the address), opens the view an address names once every
script has run, and app.py answers each address with the same page. Checked
in a headless browser when made (back, forward, reload, a link to a page that
needs a sign-in); this pins the wiring.

Run: python3 -m unittest discover tests
"""
import os
import re
import sys
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')
sys.path.insert(0, ROOT)
import app as appmod  # noqa: E402


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


def js_paths():
    js = read('static', 'js', 'page-links.js')
    block = re.search(r'const PL_PATHS = \{(.*?)\};', js, re.S).group(1)
    return dict(re.findall(r"(\w+): '([^']+)'", block))


class PageLinks(unittest.TestCase):
    def setUp(self):
        self.c = appmod.app.test_client()

    def test_every_view_has_an_address(self):
        page = read('cfa-buda-ops-hub-complete.html')
        views = set(re.findall(r'id="(\w+)View"', page)) - {''}
        views = {v for v in views if re.search(rf'class="view[^"]*" id="{v}View"', page)}
        self.assertEqual(views, set(js_paths()))

    def test_addresses_are_unique(self):
        paths = list(js_paths().values())
        self.assertEqual(len(paths), len(set(paths)))
        self.assertEqual(js_paths()['home'], '/')

    def test_server_and_page_name_the_same_addresses(self):
        self.assertEqual(set(appmod.PAGE_PATHS), set(js_paths().values()) - {'/'})

    def test_every_address_serves_the_hub(self):
        home = self.c.get('/')
        for path in appmod.PAGE_PATHS:
            r = self.c.get(path)
            self.assertEqual(r.status_code, 200, path)
            self.assertEqual(r.get_data(), home.get_data(), path)
            self.assertEqual(r.headers.get('Cache-Control'), 'no-cache', path)

    def test_other_addresses_are_still_not_found(self):
        self.assertEqual(self.c.get('/nowhere').status_code, 404)
        self.assertEqual(self.c.get('/lists/nowhere').status_code, 404)

    def test_the_page_loads_its_files_from_the_root(self):
        # A page served at /lists/timers must still find /static/…
        page = read('cfa-buda-ops-hub-complete.html')
        for ref in re.findall(r'(?:src|href)="([^"#]+)"', page):
            if not ref.startswith('http'):
                self.assertTrue(ref.startswith('/'), ref)
        self.assertNotIn("fetch('api/", ''.join(read('static', 'js', f) for f in os.listdir(os.path.join(ROOT, 'static', 'js'))))

    def test_wired_after_the_bottom_bar(self):
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertLess(page.index('/static/js/bottom-nav.js'), page.index('/static/js/page-links.js'))
        self.assertLess(page.index('/static/js/launch-mode.js'), page.index('/static/js/page-links.js'))

    def test_taps_push_and_the_hub_replaces(self):
        js = read('static', 'js', 'page-links.js')
        self.assertIn("history.pushState({view}, '', path)", js)
        self.assertIn('history.replaceState', js)
        self.assertIn("addEventListener('popstate'", js)
        # Opens the address's page only once every script has run.
        self.assertIn('hubScriptsRan.then(start)', js)
        # A page that needs a sign-in opens once the sign-in is known.
        self.assertIn('launchSetManager = async function', js)
        self.assertIn('acApplyStatus = function', js)


if __name__ == '__main__':
    unittest.main()
