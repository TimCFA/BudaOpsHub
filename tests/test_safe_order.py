"""The change order (Tim, Oct 20 2026): Aaliyah orders the change fund's
bills and coin from the bank. From the leaders' safe counts: what's on hand
of each bill and roll, a par she sets once, the order (par minus on hand,
rounded up to how the bank sells it), and how long each lasts at the pace
the counts show.

Run: python3 -m unittest discover tests
Runs static/js/safe-order.js in node. Names are made up.
"""
import json
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DAY = 86400000
NOW = 1792512000000          # a fixed "now" for the cases


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const el = {addEventListener(){}, innerHTML: ''};
const ctx = {document: {getElementById: () => el}, console};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[1], 'utf8'), ctx);
const c = JSON.parse(fs.readFileSync(0, 'utf8'));
const m = ctx.soModel(c.counts, c.settings, c.now);
process.stdout.write(JSON.stringify({rows: m.rows.map(r => [r.key, r.onHand, r.perDay === null ? null : Math.round(r.perDay * 10) / 10, r.most, r.order, r.dollars, r.daysLeft === null ? null : Math.round(r.daysLeft * 10) / 10]),
  total: m.total, latest: m.latest && m.latest.shift, text: ctx.soOrderText(m, 'Tue, Oct 20')}));
"""


def model(counts, settings=None):
    out = subprocess.run(['node', '-e', RUNNER, os.path.join(ROOT, 'static', 'js', 'safe-order.js')],
                         input=json.dumps({'counts': counts, 'settings': settings or {}, 'now': NOW}), capture_output=True, text=True, check=True)
    d = json.loads(out.stdout)
    d['by'] = {r[0]: r[1:] for r in d['rows']}
    return d


def count(days_ago, shift, ones, fives, quarters, twenties=None, hours=0):
    bills = {'1': ones, '5': fives * 5}
    if twenties is not None:
        bills['20'] = twenties * 20
    return {'timestamp': NOW - days_ago * DAY + hours * 3600000, 'shift': shift, 'countedBy': 'Jordan Testcase',
            'bills': bills, 'coinRolls': {'Quarters': quarters}, 'total': 0}


# A week of closing counts: $1s fall 20 a day, then an order of 200 lands on
# day 3 (a rise: not use); $5s fall 4 a day; quarters 1 roll a day.
WEEK = [count(7 - i, 'Closing Count', ones, 80 - 4 * i, 30 - i, twenties=40 + 2 * i)
        for i, ones in enumerate([300, 280, 260, 440, 420, 400, 380, 360])]


class OnHandAndPace(unittest.TestCase):
    def test_on_hand_is_the_latest_count(self):
        d = model(list(reversed(WEEK)))                              # any order in, time order used
        self.assertEqual(d['latest'], 'Closing Count')
        self.assertEqual(d['by']['1'][0], 360)
        self.assertEqual(d['by']['5'][0], 52)                       # $260 in fives
        self.assertEqual(d['by']['Quarters'][0], 23)
        self.assertEqual(d['by']['Nickels'][0], 0)                  # counted, none

    def test_pace_counts_drops_not_orders_coming_in(self):
        d = model(WEEK)
        # $1s: 20 a day (the jump from 260 to 440 is an order, not use).
        self.assertEqual(d['by']['1'][1], 20.0)
        self.assertEqual(d['by']['1'][5], 18.0)                     # 360 on hand ÷ 20 a day
        self.assertEqual(d['by']['5'][1], 4.0)
        self.assertEqual(d['by']['Quarters'][1], 1.0)
        self.assertEqual(d['by']['20'][1], 0.0)                     # twenties only rise: no use, no run-out
        self.assertIsNone(d['by']['20'][5])
        self.assertEqual(d['by']['1'][2], 440)                      # the most held in four weeks: the suggested par

    def test_not_enough_counts_for_a_pace(self):
        d = model(WEEK[-2:])
        self.assertIsNone(d['by']['1'][1])
        self.assertIsNone(d['by']['1'][5])
        # Counts older than four weeks don't set the pace.
        old = [dict(c, timestamp=c['timestamp'] - 40 * DAY) for c in WEEK[:5]]
        self.assertIsNone(model(old + WEEK[-2:])['by']['1'][1])

    def test_older_counts_in_bill_counts(self):
        d = model([{'timestamp': NOW - DAY, 'shift': 'Opening Count', 'denoms': {'1': 150, '10': 12}, 'coinRolls': {'Dimes': 4}}])
        self.assertEqual((d['by']['1'][0], d['by']['10'][0], d['by']['Dimes'][0]), (150, 12, 4))


class TheOrder(unittest.TestCase):
    def test_par_minus_on_hand_rounded_to_how_the_bank_sells_it(self):
        d = model(WEEK, {'par': {'1': 500, '5': 100, 'Quarters': 40, '20': 30}, 'step': {'1': 100, 'Quarters': 10}})
        self.assertEqual(d['by']['1'][3:5], [200, 200])             # need 140 → straps of 100 → 200 bills, $200
        self.assertEqual(d['by']['5'][3:5], [48, 240])              # need 48 fives, $240
        self.assertEqual(d['by']['Quarters'][3:5], [20, 200])       # need 17 rolls → boxes of 10 → 20 rolls, $200
        self.assertEqual(d['by']['20'][3:5], [0, 0])                # 54 on hand, over par
        self.assertEqual(d['total'], 640)
        self.assertEqual(d['text'], 'Change order, Chick-fil-A Buda, Tue, Oct 20\n$1: 200 bills ($200)\n$5: 48 bills ($240)\n'
                                    'Quarters: 20 rolls ($200)\nTotal: $640')

    def test_no_pars_no_order(self):
        d = model(WEEK)
        self.assertEqual(d['total'], 0)
        self.assertEqual(d['text'], '')

    def test_no_counts(self):
        d = model([], {'par': {'1': 500}})
        self.assertIsNone(d['latest'])
        self.assertEqual(d['by']['1'][0], None)
        self.assertEqual(d['total'], 0)


class Wiring(unittest.TestCase):
    def test_saved_and_shown_to_directors_only(self):
        app = read('app.py')
        self.assertRegex(app, r"'manager': \[[^\]]*'safeOrderSettings'")
        self.assertRegex(read('static', 'js', 'storage.js'), r"manager: \[[^\]]*'safeOrderSettings'")
        manager_only = app.split('MANAGER_ONLY_KEYS = {')[1].split('}')[0]
        self.assertIn("'safeOrderSettings'", manager_only)                  # only a manager session changes the pars
        js = read('static', 'js', 'safe-order.js')
        self.assertIn("if(typeof launchManager === 'undefined' || !launchManager){ root.innerHTML = ''; return; }", js)
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertIn('<div id="safeOrderRoot"></div>', page)
        self.assertIn('<script src="/static/js/fohoe-and-safecount.js"></script>\n<script src="/static/js/safe-order.js"></script>', page)
        self.assertIn("if(typeof renderSafeOrder === 'function') renderSafeOrder();", read('static', 'js', 'fohoe-and-safecount.js'))
        css = read('static', 'css', 'theme-cfa.css')
        self.assertIn('#safeOrderRoot:empty{display:none;}', css)
        self.assertFalse(re.search(r'[\U0001F300-\U0001FAFF]', js))          # line icons, never emoji


if __name__ == '__main__':
    unittest.main()
