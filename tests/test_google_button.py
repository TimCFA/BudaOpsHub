"""Google's sign-in button (Tim, Oct 25 2026: "sometimes it's not showing
up"). The page asked the server once who was signed in, and only that answer
carried Google's client ID: if the request failed (lost signal, the minute a
deploy restarts the server) the button never came. Now the ID rides in the
page, the status check asks again, and the button is in the sign-in sheet
too, not only on Manage.

Run: python3 -m unittest discover tests
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


class InThePage(unittest.TestCase):
    def tearDown(self):
        appmod._PAGE_HTML.clear()

    def page(self, cid):
        old = appmod.GOOGLE_CLIENT_ID
        appmod.GOOGLE_CLIENT_ID = cid
        appmod._PAGE_HTML.clear()
        try:
            return appmod.app.test_client().get('/').get_data(as_text=True)
        finally:
            appmod.GOOGLE_CLIENT_ID = old

    def test_the_client_id_is_in_the_page(self):
        html = self.page('123-abc.apps.googleusercontent.com')
        self.assertIn('<meta charset="UTF-8">\n<meta name="google-client-id" content="123-abc.apps.googleusercontent.com">', html)

    def test_none_set_no_meta(self):
        self.assertNotIn('google-client-id', self.page(''))

    def test_escaped(self):
        self.assertIn('content="a&quot;&gt;&lt;x"', self.page('a"><x'))


class Wiring(unittest.TestCase):
    def test_the_page_reads_it_and_draws_the_gate_at_once(self):
        js = read('static', 'js', 'accounts.js')
        self.assertIn("""let acGoogleClientId = (document.querySelector('meta[name="google-client-id"]') || {}).content || '';""", js)
        self.assertIn("acGoogleClientId = (d && d.googleClientId) || acGoogleClientId;", js)
        self.assertTrue(js.rstrip().endswith('acRenderGate();'))
        self.assertIn("const AC_GOOGLE_HOSTS = ['acGoogleBtn', 'siGoogleBtn'];", js)
        self.assertIn('data-ac-google-retry', js)

    def test_the_status_check_asks_again(self):
        m = read('static', 'js', 'manage-and-import.js')
        self.assertIn("mgrStatusTimer = setTimeout(checkManagerStatus, Math.min(30000, 2000 * 2 ** mgrStatusTries++));", m)
        self.assertIn("if(!res.ok) throw new Error(`status ${res.status}`);", m)
        self.assertIn("window.addEventListener('online', () => { if(!mgrStatusKnown) checkManagerStatus(); });", m)

    def test_in_the_sign_in_sheet(self):
        si = read('static', 'js', 'sign-in.js')
        self.assertIn('<div id="siGoogleBtn" class="ac-google"></div>', si)
        self.assertIn("  sheet.classList.add('active');\n  siDraw();", si)
        self.assertIn("else if(what === 'signin' && typeof siOpen === 'function') siOpen();", read('static', 'js', 'right-now.js'))


if __name__ == '__main__':
    unittest.main()
