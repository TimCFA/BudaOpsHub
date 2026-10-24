"""Set Ups (Tim, Oct 23 2026): today the daypart cards start at the daypart
on the clock; the ones already over move to the bottom under "Earlier
today", still a scroll away. Other days keep their order.

Run: python3 -m unittest discover tests
"""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const js = fs.readFileSync(process.argv[1], 'utf8');
const c = JSON.parse(process.argv[2]);
const ctx = {today: '2026-10-23', suOpenCards: {foh: new Set()}, suCardsTouched: {foh: true}, suSelectedDaypart: {}, suAutoOpened: null,
  suDaypartsFor: () => ['Breakfast', 'Lunch', 'Afternoon', 'Dinner'].map(name => ({name})),
  suDefaultDaypart: () => c.now, suDaypartCardHtml: (s, d, dp) => `[${dp.name}]`, suTierKeyHtml: () => '',
  esHtml: () => ' <span class="es">Más temprano hoy</span>'};
vm.createContext(ctx);
vm.runInContext(js.slice(js.indexOf('let suNowDaypart'), js.indexOf('// The pills:')), ctx);
process.stdout.write(JSON.stringify({html: ctx.suDaypartCardsHtml('foh', c.date), now: vm.runInContext('suNowDaypart.foh', ctx)}));
"""


def cards(now, date='2026-10-23'):
    out = subprocess.run(['node', '-e', RUNNER, os.path.join(ROOT, 'static', 'js', 'setups-board.js'), json.dumps({'now': now, 'date': date})],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


class EarlierLast(unittest.TestCase):
    def test_today_starts_at_the_daypart_on_the_clock(self):
        got = cards('Afternoon')
        self.assertTrue(got['html'].startswith('<div class="su-dp-list">[Afternoon][Dinner]<div class="su-dp-earlier" role="separator"><span>Earlier today'))
        self.assertTrue(got['html'].endswith('</span></div>[Breakfast][Lunch]</div>'))
        self.assertEqual(got['now'], 'Afternoon')                    # the timer re-sorts when this changes

    def test_first_thing_and_other_days_keep_their_order(self):
        self.assertEqual(cards('Breakfast')['html'], '<div class="su-dp-list">[Breakfast][Lunch][Afternoon][Dinner]</div>')
        other = cards('Dinner', date='2026-10-24')
        self.assertEqual(other['html'], '<div class="su-dp-list">[Breakfast][Lunch][Afternoon][Dinner]</div>')
        self.assertIsNone(other['now'])

    def test_spanish_and_the_timer(self):
        with open(os.path.join(ROOT, 'static', 'js', 'spanish.js'), encoding='utf-8') as f:
            self.assertIn("'Earlier today': 'Más temprano hoy',", f.read())
        with open(os.path.join(ROOT, 'static', 'js', 'setups-sheet.js'), encoding='utf-8') as f:
            self.assertIn("suDefaultDaypart(sec, today) !== suNowDaypart[sec]) renderAllDayparts();", f.read())


if __name__ == '__main__':
    unittest.main()
