"""Food Safety (Tim, Oct 20 2026): more than one walkthrough a day, each
zone's time, and the coached & corrected checks kept and counted on the
Scoreboard.

Run: python3 -m unittest discover tests   (the page code runs in node)
Initials are made up.
"""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()

RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const js = n => fs.readFileSync(process.argv[1] + '/static/js/' + n, 'utf8');
const el = {addEventListener(){}, innerHTML: '', scrollIntoView(){}};
const ctx = {console, el, today: '2026-10-20', document: {getElementById: () => el, querySelector: () => null},
  toLocalISODate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  formatShortTime: t => new Date(t).toISOString().slice(11, 16), formatVerboseDate: d => d,
  escapeHtml: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'), getInitials: () => 'JT', showToast(m){ ctx.toasts.push(m); },
  saveState: async () => {}, calcStreak(){}, beginEditInitials(){}, foodSafetyDays: [], formDone: false, toasts: []};
vm.createContext(ctx);
vm.runInContext(js('spanish.js'), ctx);
vm.runInContext(js('food-safety.js').replace(/^let /mg, 'var ').replace(/^const /mg, 'var '), ctx);
const c = JSON.parse(fs.readFileSync(0, 'utf8'));
vm.runInContext(c.setup || '', ctx);
Promise.resolve(vm.runInContext(c.op, ctx)).then(out => process.stdout.write(JSON.stringify(out === undefined ? null : out)));
"""


def run(op, setup=''):
    out = subprocess.run(['node', '-e', RUNNER, ROOT], input=json.dumps({'op': op, 'setup': setup}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


# Every check and temp answered at minute steps from 6:00 (zone by zone), a
# few coached. `t0` in ms; ids in FS_SECTIONS order.
FILL = r"""
function fill(rec, t0, coached){
  rec.answers = rec.answers || {}; rec.temps = rec.temps || {};
  let t = t0;
  FS_SECTIONS.forEach(s => {
    s.temps.forEach(x => { rec.temps[x.id] = {v: '38', i: 'JT', t: t}; t += 60000; });
    s.items.forEach(x => { rec.answers[x.id] = {v: (coached || []).includes(x.id) ? 'coached' : 'yes', i: 'JT', t: t}; t += 60000; });
  });
  return rec;
}
const T6 = Date.UTC(2026, 9, 20, 11, 0);
"""


class Rounds(unittest.TestCase):
    def test_a_second_walkthrough_and_the_first_kept_as_it_was(self):
        out = run(r"""(async () => {
          foodSafetyWalkthroughs['2026-10-20'] = fill({}, T6, ['raw-floors']);
          fsSyncCompletion();
          const first = {days: foodSafetyDays.slice(), done: !!foodSafetyWalkthroughs['2026-10-20'].completedAt};
          await fsStartRound();
          const r = fsRoundNow();
          // Answering now goes to walkthrough 2; the first is untouched.
          fsEnsureRecord().answers['raw-handwash'] = {v: 'coached', i: 'JT', t: T6 + 9e6};
          fsSyncCompletion();
          renderFoodSafety();
          return {first, n: r.n, keys: Object.keys(foodSafetyWalkthroughs['2026-10-20']).sort(), more: Object.keys(foodSafetyWalkthroughs['2026-10-20'].more),
                  r2: fsTotals(fsRoundNow().rec), r1coached: fsTotals(foodSafetyWalkthroughs['2026-10-20']).coached,
                  html: el.innerHTML.includes('data-fs-round="2"') && el.innerHTML.includes('Walkthrough 1 <span>✓'), latest: fsTotals(fsLatest('2026-10-20')).done,
                  best: fsTotals(fsBest('2026-10-20')).complete, days: foodSafetyDays};
        })()""", FILL)
        self.assertEqual(out['first'], {'days': ['2026-10-20'], 'done': True})
        self.assertEqual(out['n'], 2)
        self.assertEqual(out['keys'], ['answers', 'completedAt', 'more', 'temps'])   # walkthrough 1 where older pages read it
        self.assertEqual(out['more'], ['r2'])
        self.assertEqual((out['r2']['done'], out['r2']['coached'], out['r1coached']), (1, 1, 1))
        self.assertTrue(out['html'])
        self.assertEqual(out['latest'], 1)
        self.assertTrue(out['best'])
        self.assertEqual(out['days'], ['2026-10-20'])               # the day stays complete

    def test_another_only_once_one_is_under_way(self):
        out = run(r"""(async () => { await fsStartRound(); const a = fsRounds('2026-10-20').length;
          fsEnsureRecord().answers['raw-handwash'] = {v: 'yes', i: 'JT', t: T6}; await fsStartRound(); await fsStartRound();
          return [a, fsRounds('2026-10-20').length]; })()""", FILL)
        self.assertEqual(out, [0, 2])                                # an empty walkthrough doesn't start a third

    def test_the_day_counts_when_a_later_walkthrough_finishes(self):
        out = run(r"""(async () => {
          foodSafetyWalkthroughs['2026-10-20'] = {answers: {'raw-handwash': {v: 'yes', i: 'JT', t: T6}}, temps: {}};
          await fsStartRound();
          fill(fsRoundNow().rec, T6 + 3.6e6, []);
          const change = fsSyncCompletion();
          return {change, days: foodSafetyDays, toast: null};
        })()""", FILL)
        self.assertEqual(out['change'], 'completed')
        self.assertEqual(out['days'], ['2026-10-20'])


class ZonesAndFindings(unittest.TestCase):
    def test_zone_and_walkthrough_times(self):
        out = run(r"""(() => { const rec = fill({}, T6, []); rec.completedAt = T6 + 90 * 60000;
          const raw = FS_SECTIONS[0], misc = FS_SECTIONS.find(s => s.id === 'misc');
          return [fsZoneMinutes(rec, raw), raw.items.length + raw.temps.length, fsZoneMinutes(rec, misc), fsRoundMinutes(rec), fsMinutesText(75), fsZoneMinutes({answers: {}}, raw)]; })()""", FILL)
        self.assertEqual(out[0], out[1] - 1)          # one minute a check, first to last
        self.assertEqual(out[2], 4)
        self.assertEqual(out[3], 90)
        self.assertEqual(out[4], '1 h 15 min')
        self.assertIsNone(out[5])

    def test_findings_for_the_scoreboard(self):
        out = run(r"""(() => {
          const day = (iso, coached, more) => { const d = new Date(iso + 'T11:00:00Z').getTime(); const rec = fill({}, d, coached); rec.completedAt = d + 5.4e6;
            if(more) rec.more = {r2: fill({}, d + 3.6e7, more)}; foodSafetyWalkthroughs[iso] = rec; };
          day('2026-10-20', ['raw-floors', 'prep-labels'], ['raw-floors']);
          day('2026-10-12', ['raw-floors']);
          day('2026-09-01', ['misc-vents']);                      // before the 30 days
          foodSafetyWalkthroughs['2026-10-15'] = {answers: {'raw-floors': {v: 'coached', i: 'AB', t: 1}}, temps: {}};   // never finished: still counts what it coached
          const f = fsFindings(30);
          return {since: f.since, walk: f.walkthroughs, complete: f.complete, days: f.days, coached: f.coached,
                  top: f.repeats.map(r => [r.id, r.count, r.last]), zones: f.byZone.filter(z => z.count).map(z => [z.id, z.count]),
                  minutes: f.minutes, raw: f.zoneTimes[0].minutes, recent: f.recent[0].id, older: fsFindings(30, '2026-09-20').coached};
        })()""", FILL)
        self.assertEqual(out['since'], '2026-09-21')
        self.assertEqual((out['walk'], out['complete'], out['days'], out['coached']), (4, 3, 2, 5))   # both of the 20th's are complete
        self.assertEqual(out['top'], [['raw-floors', 4, '2026-10-20'], ['prep-labels', 1, '2026-10-20']])
        self.assertEqual(out['zones'], [['raw', 4], ['prep', 1]])
        self.assertEqual(out['minutes'], 90)
        self.assertEqual(out['raw'], 20)                 # 21 checks and temps, a minute apart
        self.assertEqual(out['older'], 1)

    def test_history_opens_to_what_was_coached(self):
        html = run(r"""(() => { const rec = fill({}, Date.UTC(2026, 9, 19, 11), ['raw-floors']); rec.completedAt = Date.UTC(2026, 9, 19, 12, 30);
          foodSafetyWalkthroughs['2026-10-19'] = rec; fsOpenHistory.add('2026-10-19'); renderFoodSafety(); return el.innerHTML; })()""", FILL)
        self.assertIn('data-fs-history="2026-10-19" aria-expanded="true"', html)
        self.assertIn('<span class="fs-hd-zone">BOH: Raw</span>Are floors, shelves, and equipment legs clean and free from debris?', html)
        self.assertIn('✓ 12:30 · 1 h 30 min', html)


class Wiring(unittest.TestCase):
    def test_scoreboard_card_and_reports(self):
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertIn('<h3>Food Safety: Coached &amp; Corrected</h3>\n      <div id="oiFsFindings"></div>', page)
        oi = read('static', 'js', 'operational-intelligence.js')
        self.assertIn('  renderFsFindingsCard();\n}', oi)
        self.assertIn("fsBest(iso)", read('static', 'js', 'leader-report.js'))
        self.assertIn("fsRounds(today).find(r => r.rec.completedAt)", read('static', 'js', 'right-now.js'))


if __name__ == '__main__':
    unittest.main()
