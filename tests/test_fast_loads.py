"""Faster loads (Tim, Oct 23 2026: "Home page took close to 10 seconds to
load"). The page's scripts and stylesheets are stamped with the build and
kept by the browser until the next deploy; the spreadsheet reader loads
without holding up the page; Manage, Google's sign-in button and the
Levelset scoreboard wait until they're shown.

Run: python3 -m unittest discover tests
"""
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


class Stamped(unittest.TestCase):
    def setUp(self):
        self.c = appmod.app.test_client()
        self.html = self.c.get('/').get_data(as_text=True)

    def test_every_script_and_stylesheet_carries_the_build(self):
        local = re.findall(r'(?:src|href)="(/static/[^"?]+\.(?:js|css)(?:\?[^"]*)?)"', self.html)
        self.assertGreater(len(local), 50)
        self.assertEqual([u for u in local if not u.endswith(f'?v={appmod.BUILD}')], [])
        self.assertEqual(self.c.get('/').headers['Cache-Control'], 'no-cache')       # the page itself is always fresh

    def test_a_stamped_file_is_kept_until_the_next_build(self):
        r = self.c.get(f'/static/js/storage.js?v={appmod.BUILD}')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers['Cache-Control'], 'public, max-age=31536000, immutable')
        for url in ('/static/js/storage.js', '/static/js/storage.js?v=old'):
            self.assertNotIn('immutable', self.c.get(url).headers.get('Cache-Control', ''), url)   # unstamped or stale: asked again

    def test_the_file_on_disk_is_unchanged(self):
        self.assertIn('<script src="/static/js/storage.js"></script>', read('cfa-buda-ops-hub-complete.html'))


class Deferred(unittest.TestCase):
    def test_spreadsheet_reader_is_async_and_awaited(self):
        page = read('cfa-buda-ops-hub-complete.html')
        # Not loaded with the page at all: a file read loads it (Oct 25 2026), and so does making a PDF.
        self.assertNotIn('xlsx.full.min.js', page)
        self.assertNotIn('jspdf.umd.min.js', page)
        utils = read('static', 'js', 'state-and-utils.js')
        self.assertIn("function xlsxReady(){ return libReady('xlsx'); }", utils)
        self.assertIn("function pdfReady(){ return libReady('pdf'); }", utils)
        self.assertIn('await pdfReady();', read('static', 'js', 'directors.js'))
        self.assertIn('await pdfReady();', read('static', 'js', 'waste-export.js'))
        self.assertIn("if(isExcel) await xlsxReady();", read('static', 'js', 'data-uploads.js'))
        for f in ('forecast.js', 'leaders-import.js', 'prep-board.js', 'points-import.js'):
            self.assertIn('xlsxReady()', read('static', 'js', f), f)
        self.assertIn('global.xlsxReady', read('static', 'forms', 'forms-engine.js'))

    def test_manage_draws_when_opened(self):
        m = read('static', 'js', 'manage-and-import.js')
        self.assertIn("if(document.getElementById('manageView').classList.contains('active')) renderManage();", m)
        self.assertIn('manageStale = true;', m)
        nav = read('static', 'js', 'navigation.js')
        self.assertIn("if(typeof manageStale !== 'undefined' && manageStale) renderManage(); else refreshManage();", nav)

    def test_levelset_and_google_wait(self):
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertIn('data-src="https://app.levelset.io/public/positional-excellence/', page)
        self.assertNotIn('src="https://app.levelset.io/public/positional-excellence/TJXV5MLEXJZC" \n', page.replace('data-src', 'x'))
        self.assertIn("panel.querySelectorAll('iframe[data-src]').forEach(f => { if(!f.src) f.src = f.dataset.src; });", read('static', 'js', 'navigation.js'))
        self.assertIn("if(view && !view.classList.contains('active')) return;", read('static', 'js', 'accounts.js'))


if __name__ == '__main__':
    unittest.main()
