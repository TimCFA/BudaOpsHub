"""The team's waste scoreboard (Tim, Oct 18 2026): on the simplified site the
Waste tab has a Scoreboard pill that opens the Scoreboard's Waste panel with
its waste cards only. A team device is sent two days of waste entries, so
the trend cards read each day's totals from /api/waste/days.

Run: python3 -m unittest discover tests
Firebase is a dict. Names are made up.
"""
import json
import os
import re
import sys
import time
import unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
import levelset_sync  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
store = {}


class FakeRef:
    def __init__(self, path):
        self.path = path.strip('/')

    def get(self):
        if self.path in store:
            return store[self.path]
        prefix = self.path + '/'
        kids = {k[len(prefix):]: v for k, v in store.items() if k.startswith(prefix)}
        return kids or None

    def set(self, value):
        store[self.path] = value


appmod.app.config['SESSION_COOKIE_SECURE'] = False


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


class WasteDaysRoute(unittest.TestCase):
    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._cache.clear()
        appmod._cache_ready = False
        store.clear()
        now = datetime.now(levelset_sync.STORE_TZ)
        day = lambda n: (now - timedelta(days=n)).date().isoformat()
        ts = lambda n, h: int((now - timedelta(days=n)).replace(hour=h, minute=0, second=0, microsecond=0).timestamp() * 1000)
        self.today, self.yesterday, self.old = day(0), day(1), day(appmod.WASTE_DAYS_KEPT + 1)
        store['state/waste'] = json.dumps({'entries': [
            {'ts': ts(0, 9), 'section': 'foh', 'name': 'Nugget', 'cost': 1.5, 'who': 'JT'},
            {'ts': ts(0, 13), 'section': 'boh', 'name': 'Filet', 'cost': 2.25},
            {'ts': ts(1, 11), 'day': self.yesterday, 'section': 'foh', 'name': 'Strips', 'cost': 4},
            {'ts': ts(appmod.WASTE_DAYS_KEPT + 1, 11), 'section': 'foh', 'name': 'Old', 'cost': 99},
            {'ts': ts(0, 10), 'section': 'foh', 'name': 'Bad', 'cost': 'x'},
            'not an entry',
        ], 'wasteDays': []})

    def test_totals_per_day_without_a_session(self):
        r = appmod.app.test_client().get('/api/waste/days')
        self.assertEqual(r.status_code, 200)
        body = r.get_json()
        self.assertEqual(body['days'][self.today], {'total': 3.75, 'foh': 1.5, 'boh': 2.25, 'entries': 2})
        self.assertEqual(body['days'][self.yesterday], {'total': 4, 'foh': 4, 'boh': 0, 'entries': 1})
        self.assertNotIn(self.old, body['days'])
        self.assertNotIn('Nugget', json.dumps(body))         # totals only: no items, no initials
        self.assertNotIn('JT', json.dumps(body))

    def test_empty_log(self):
        store['state/waste'] = json.dumps({'entries': []})
        self.assertEqual(appmod.app.test_client().get('/api/waste/days').get_json()['days'], {})


class PageWiring(unittest.TestCase):
    def test_waste_tab_has_the_scoreboard_pill(self):
        launch = read('static', 'js', 'launch-mode.js')
        self.assertRegex(launch, r"const LAUNCH_VIEWS = \[[^\]]*'scoreboard'")
        self.assertIn("{view: 'scoreboard', label: 'Scoreboard', sub: 'Tablero'}", launch)
        self.assertIn("const LAUNCH_SUBNAVS = [LAUNCH_LISTS, LAUNCH_WASTE, LAUNCH_TOOLS];", launch)
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertIn('data-view="wastelog" data-views="wastelog scoreboard"', page)
        self.assertEqual(page.count('<nav class="launch-subnav launch-only" aria-label="Waste" data-launch-subnav></nav>'), 2)

    def test_only_the_waste_cards_on_the_simplified_site(self):
        page = read('cfa-buda-ops-hub-complete.html')
        panel = page.split('id="sbPanelWaste"')[1].split('id="sbPanelGx"')[0]
        hidden = re.findall(r'class="standup-card sb-not-waste">\s*<h3>([^<]+)</h3>', panel)
        self.assertEqual(hidden, ['Safe Count Variance', 'Zone Reset Completion', 'Food Safety Compliance', 'Food Safety: Coached &amp; Corrected'])
        kept = re.findall(r'class="standup-card">\s*<h3>([^<]+)</h3>', panel)
        self.assertEqual(kept, ['Active Streaks', 'Waste Trend', 'Day-of-Week Patterns'])
        self.assertIn('<nav class="sb-subtabs sb-not-waste">', page)
        self.assertEqual(panel.count('class="streak-display sb-not-waste"'), 2)     # Food Safety and OE; Under Limit stays
        self.assertIn('<div id="customScoreboardContainer" class="sb-not-waste"></div>', page)
        self.assertIn('body.launch-mode .sb-not-waste{display:none !important;}', read('static', 'css', 'theme-cfa.css'))
        nav = read('static', 'js', 'navigation.js')
        self.assertIn("if(typeof launchIsOn === 'function' && launchIsOn()) sbShowPanel('waste');", nav)

    def test_trend_cards_read_day_totals(self):
        oi = read('static', 'js', 'operational-intelligence.js')
        self.assertIn("fetch(`${API_BASE}/api/waste/days`)", oi)
        self.assertIn('const byDay = wasteTotalsByDay();', oi)
        self.assertIn('const byDate = wasteTotalsByDay();', oi)
        # The dashboard with its delete buttons and export stays a manager's.
        self.assertIn("if(typeof launchManager === 'undefined' || !launchManager){ root.innerHTML = ''; return; }", read('static', 'js', 'waste-dash.js'))


class TopItemsBars(unittest.TestCase):
    """Tim, Oct 19 2026: a full bar read as an alarm. Each bar is now the
    item's share of today's waste, with the percent beside the dollars."""
    def test_bars_are_shares_of_the_day(self):
        js = read('static', 'js', 'waste-log.js')
        self.assertNotIn('maxVal', js)
        self.assertIn('const dayTotal = Object.values(byProduct).reduce((a, b) => a + b, 0);', js)
        self.assertIn('<div class="bar-fill" style="width:${share(cost).toFixed(1)}%"></div>', js)
        self.assertIn('<span class="bv-share">· ${shareText(cost)}</span>', js)
        self.assertIn('· share of today’s waste', read('cfa-buda-ops-hub-complete.html'))


if __name__ == '__main__':
    unittest.main()
