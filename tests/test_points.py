"""Directors → Points (TIM-70 phase 1): the punch report in, attendance
events out, a leader's call on the ones that need it, and the quarter's
scoreboard. The scoring is the artifact's own engine (points-engine.js).

Run: python3 -m unittest discover tests   (needs Node.js; skipped without it)
"""
import json
import os
import shutil
import subprocess
import unittest

import app as appmod

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, 'tests', 'points_runner.js')
NODE = shutil.which('node')

with open(os.path.join(ROOT, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
    PAGE = f.read()


def run(op):
    out = subprocess.run([NODE, RUNNER], input=json.dumps({'cases': [{'op': op}]}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[0]


class Data(unittest.TestCase):
    def test_points_are_private_and_manager_only(self):
        self.assertIn('points', appmod.PRIVATE_SECTIONS)
        for key in ('pointsRecords', 'pointsUploads', 'pointsSettings'):
            self.assertEqual(appmod.SECTION_OF_KEY[key], 'points')
            self.assertIn(key, appmod.MANAGER_ONLY_KEYS)

    def test_page_loads_engine_before_points(self):
        self.assertLess(PAGE.index('/static/js/points-engine.js'), PAGE.index('/static/js/points.js'))
        self.assertLess(PAGE.index('/static/js/directors.js'), PAGE.index('/static/js/points.js'))


@unittest.skipUnless(NODE, 'Node.js not installed')
class Report(unittest.TestCase):
    def test_report_read(self):
        got = run("c => { const p = APS.parseReport(REPORT); return {range: p.range, runDate: p.runDate, location: p.location, n: p.shifts.length}; }")
        self.assertEqual(got, {'range': ['2026-10-05', '2026-10-11'], 'runDate': '2026-10-12', 'location': 'Chick-fil-A Buda (04066)', 'n': 6})

    def test_prepare(self):
        got = run("c => ptPrepare(APS.parseReport(REPORT))")
        # Maya: tardy (8 min) and a 40-minute break; Ana: no punches (review);
        # Ben: worked with nothing scheduled (review). The Sept 30 shift is
        # before the quarter; Aurora is a leader, not scored.
        self.assertEqual(got['byType'], {'tardy': 1, 'latebreak': 1, 'absence': 1, 'unscheduled': 1})
        self.assertEqual(got['skipped'], ['Aurora Diaz'])
        self.assertEqual(got['dup'], 0)
        self.assertEqual(got['coversTo'], '2026-10-08')
        self.assertEqual({e['type']: e['status'] for e in got['fresh']},
                         {'tardy': 'confirmed', 'latebreak': 'confirmed', 'absence': 'review', 'unscheduled': 'review'})

    def test_overlapping_report_adds_nothing_twice(self):
        got = run("""c => { const p = APS.parseReport(REPORT);
          const first = ptCommit(ptPrepare(p), 'a.pdf'); const again = ptPrepare(p);
          return {first, fresh: again.fresh.length, dup: again.dup, uploads: pointsUploads.map(u => [u.file, u.added, u.quarter, u.by])}; }""")
        self.assertEqual(got, {'first': 4, 'fresh': 0, 'dup': 4, 'uploads': [['a.pdf', 4, '2026-Q4', 'TL']]})

    def test_review_and_scores(self):
        got = run("""c => { ptCommit(ptPrepare(APS.parseReport(REPORT)), 'a.pdf');
          const before = ptReviewItems().map(e => e.type);
          const ana = ptReviewItems().find(e => e.tm === 'ruiz-ana'), ben = ptReviewItems().find(e => e.tm === 'cole-ben');
          const ok = [ptResolve(ana.tm, ana.id, 'ncns'), ptResolve(ben.tm, ben.id, 'pickup'), ptResolve(ana.tm, ana.id, 'timeoff'), ptResolve('x', 'y', 'ncns')];
          const sc = ptScored();
          return {before, ok, after: ptReviewItems().length, totals: Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, v.score.total])),
                  ana: pointsRecords['2026-Q4']['ruiz-ana'].events[0].detail}; }""")
        self.assertEqual(got['before'], ['absence', 'unscheduled'])
        # A call made once can't be made again from an old screen.
        self.assertEqual(got['ok'], [True, True, False, False])
        self.assertEqual(got['after'], 0)
        # Maya 5 + 5; Ana no-call/no-show 50; Ben's credit can't take him below 0.
        self.assertEqual(got['totals'], {'torres-maya': 10, 'ruiz-ana': 50, 'cole-ben': 0})
        self.assertEqual(got['ana'], 'No-call/no-show for the 5:00 PM shift')

    def test_dismiss(self):
        got = run("""c => { ptCommit(ptPrepare(APS.parseReport(REPORT)), 'a.pdf');
          const ana = ptReviewItems().find(e => e.tm === 'ruiz-ana'); ptResolve(ana.tm, ana.id, 'dismiss');
          return [pointsRecords['2026-Q4']['ruiz-ana'].events[0].status, ptScored()['ruiz-ana'].score.total]; }""")
        self.assertEqual(got, ['dismissed', 0])

    def test_leader_listed_later_drops_off_the_board(self):
        got = run("""c => { ptCommit(ptPrepare(APS.parseReport(REPORT)), 'a.pdf');
          leaderListed = n => /aurora|maya/i.test(n); return Object.keys(ptScored()).sort(); }""")
        self.assertEqual(got, ['cole-ben', 'ruiz-ana'])

    def test_board_and_detail(self):
        got = run("""c => { ptCommit(ptPrepare(APS.parseReport(REPORT)), 'a.pdf');
          pointsRecords['2026-Q4']['x-y'] = {tm: 'x-y', tmName: '<b>Evil</b>, Name', events: [{id: 'z', date: '2026-10-09', type: 'uniform', status: 'confirmed', detail: '<i>x</i>'}]};
          const board = ptBoardHtml(); ptDetail = 'torres-maya'; const detail = ptBoardHtml(); ptPane = 'review'; const review = ptBodyHtml();
          return {board, detail, review, actions: ptActionsHtml(), sub: ptHeadSub()}; }""")
        board = got['board']
        self.assertLess(board.index('Maya Torres'), board.index('Name &lt;b&gt;Evil&lt;/b&gt;'))
        self.assertNotIn('<b>Evil</b>', board)
        self.assertIn('Team members tracked', board)
        self.assertIn('Late from break #2', got['detail'])
        self.assertIn('+5', got['detail'])
        self.assertIn('No-call/no-show (+50)', got['review'])
        self.assertIn('Review · 2', got['actions'])
        self.assertIn('Q4 2026 · last report', got['sub'])

    def test_upload_preview(self):
        got = run("""c => { ptPending = Object.assign(ptPrepare(APS.parseReport(REPORT)), {file: 'Actual <x>.pdf'}); ptPane = 'upload'; return ptBodyHtml(); }""")
        self.assertIn('Add 4 events', got)
        self.assertIn('Actual &lt;x&gt;.pdf', got)
        self.assertIn('Not scored (on the leader list): Aurora Diaz', got)


if __name__ == '__main__':
    unittest.main()
