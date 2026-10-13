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
        for key in ('pointsRecords', 'pointsUploads', 'pointsSettings', 'pointsTeam', 'pointsMemos'):
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

    def test_buda_only(self):
        got = run("""c => [ptIsOtherStore(APS.parseReport(REPORT)), ptIsOtherStore({location: 'Chick-fil-A West Buda (05508)'}), ptIsOtherStore({location: null})]""")
        self.assertEqual(got, [False, True, False])

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


@unittest.skipUnless(NODE, 'Node.js not installed')
class Messages(unittest.TestCase):
    def test_one_card_per_person_since_their_last_message(self):
        got = run("""c => { setup(); const cards = ptMessageCards();
          const before = cards.map(x => [x.tm, x.total, x.ids.length, x.lang]);
          const maya = cards.find(x => x.tm === 'torres-maya');
          const sent = [ptMarkSent('torres-maya', maya.ids, 'Hi Maya'), ptMarkSent('torres-maya', maya.ids, 'again')];
          return {before, text: maya.text, sent, after: ptMessageCards().map(x => x.tm), kept: pointsRecords['2026-Q4']['torres-maya'].messages}; }""")
        self.assertEqual(got['before'], [['ruiz-ana', 50, 1, 'en'], ['torres-maya', 10, 2, 'en'], ['cole-ben', 0, 1, 'en']])
        self.assertIn('Maya', got['text'])
        self.assertIn('Chick-fil-A Buda Leadership', got['text'])
        self.assertEqual(got['sent'], [True, False])
        self.assertEqual(got['after'], ['ruiz-ana', 'cole-ben'])
        self.assertEqual(len(got['kept']), 1)
        self.assertEqual(got['kept'][0]['text'], 'Hi Maya')

    def test_spanish_per_person(self):
        got = run("""c => { setup(); const en = ptMessageCards().find(x => x.tm === 'ruiz-ana').text; ptSetLang('ruiz-ana', 'es');
          const es = ptMessageCards().find(x => x.tm === 'ruiz-ana'); return {en, es: es.text, lang: es.lang, other: ptMessageCards().find(x => x.tm === 'torres-maya').lang}; }""")
        self.assertNotEqual(got['en'], got['es'])
        self.assertEqual(got['lang'], 'es')
        self.assertEqual(got['other'], 'en')
        self.assertIn('no llamaste ni te presentaste', got['es'])

    def test_remove_an_event(self):
        got = run("""c => { setup(); const ev = pointsRecords['2026-Q4']['torres-maya'].events.find(e => e.type === 'tardy');
          return [ptRemoveEvent('torres-maya', ev.id), ptRemoveEvent('torres-maya', ev.id), ptScored()['torres-maya'].score.total, ev.status]; }""")
        # The late break is now the first punctuality event: 5 points.
        self.assertEqual(got, [True, False, 5, 'removed'])

    def test_doctors_note(self):
        got = run("""c => { ptCommit(ptPrepare(APS.parseReport(REPORT)), 'a.pdf');
          const ana = ptReviewItems().find(e => e.tm === 'ruiz-ana'); ptResolve(ana.tm, ana.id, 'callout_lt24_note');
          const ev = pointsRecords['2026-Q4']['ruiz-ana'].events[0]; const promised = [ev.type, ev.notePending, ptScored()['ruiz-ana'].score.total, ev.detail];
          ptMarkSent('ruiz-ana', [ev.id], 'x');
          const got = ptNoteReceived('ruiz-ana', ev.id);
          return {promised, got, after: [ev.type, ev.notePending, ptScored()['ruiz-ana'].score.total], waiting: ptMessageCards().some(x => x.tm === 'ruiz-ana'), again: ptNoteReceived('ruiz-ana', ev.id)}; }""")
        self.assertEqual(got['promised'][:3], ['callout_lt24', True, 25])
        self.assertIn('doctor’s note promised', got['promised'][3])
        self.assertEqual(got['after'], ['callout_doc', False, 10])
        self.assertTrue(got['waiting'])   # the thank-you message
        self.assertEqual((got['got'], got['again']), (True, False))

    def test_messages_view(self):
        got = run("""c => { setup(); pointsRecords['2026-Q4']['ruiz-ana'].tmName = 'Ruiz, <b>Ana</b>'; ptPane = 'messages'; return {html: ptBodyHtml(), panes: ptActionsHtml()}; }""")
        self.assertIn('Copy message', got['html'])
        self.assertIn('/ 1000', got['html'])
        self.assertNotIn('<b>Ana</b>', got['html'])
        self.assertIn('Messages · 3', got['panes'])
        self.assertIn('Tasks · 3', got['panes'])


@unittest.skipUnless(NODE, 'Node.js not installed')
class TasksAndMemos(unittest.TestCase):
    def test_tasks_owed_and_assigned(self):
        got = run("""c => { setup(); const t0 = ptTasks().map(t => [t.tm, t.at, t.leader]);
          ptAssign('ruiz-ana', 50, 'Kianna Ramos'); ptTaskFilter = '__none'; const html = ptTasksHtml();
          return {t0, t1: ptTasks().map(t => [t.at, t.leader]), leaders: ptLeaders(), unassignedShown: html.includes('Leader conversation'), assignedHidden: !html.includes('Coaching conversation')}; }""")
        # 50 points reaches 20, 30 and 50; most serious first.
        self.assertEqual(got['t0'], [['ruiz-ana', 50, ''], ['ruiz-ana', 30, ''], ['ruiz-ana', 20, '']])
        self.assertEqual(got['t1'], [[50, 'Kianna Ramos'], [30, ''], [20, '']])
        self.assertEqual(got['leaders'], ['Timothy Lane', 'Kianna Ramos'])
        self.assertTrue(got['unassignedShown'])
        self.assertTrue(got['assignedHidden'])

    def test_memo_closes_its_task(self):
        got = run("""c => { setup(); ptAssign('ruiz-ana', 20, 'Kianna Ramos'); ptOpenMemo('ruiz-ana', 20);
          const prefilled = Object.assign({}, ptMemoDraft.fields);
          ptMemoDraft.fields.leader = ''; const e1 = ptSaveMemo();
          ptMemoDraft.fields.leader = 'Kianna Ramos'; const e2 = ptSaveMemo();
          Object.assign(ptMemoDraft.fields, {notes: 'Talked about <the> schedule', ack: 'signed', date: '2026-10-12'}); const e3 = ptSaveMemo();
          const id = 'ruiz-ana__2026-Q4__20', m = pointsMemos[id];
          return {prefilled, errs: [e1, e2, e3], draft: ptMemoDraft, tasks: ptTasks().map(t => t.at), ack: pointsRecords['2026-Q4']['ruiz-ana'].acks[20],
                  memo: {title: m.title, total: m.total, leader: m.leader, n: m.events.length}, doc: ptMemoDoc(m), list: ptMemosHtml()}; }""")
        self.assertEqual(got['prefilled']['leader'], 'Kianna Ramos')
        self.assertIn('clocked in at the scheduled minute', got['prefilled']['plan'])
        self.assertEqual(got['errs'], ['Pick the leader who held the conversation.', 'Add a few lines about what was discussed.', ''])
        self.assertIsNone(got['draft'])
        self.assertEqual(got['tasks'], [50, 30])
        self.assertEqual(got['ack']['memo'], 'ruiz-ana__2026-Q4__20')
        self.assertEqual(got['memo'], {'title': 'Leader Conversation Record', 'total': 50, 'leader': 'Kianna Ramos', 'n': 1})
        self.assertIn('Talked about &lt;the&gt; schedule', got['doc'])
        self.assertIn('Team member signed', got['doc'])
        self.assertIn('Chick-fil-A Buda #04066', got['doc'])
        self.assertNotIn('West', got['doc'])
        self.assertIn('Download for HR', got['list'])

    def test_editing_a_memo_keeps_it_closed(self):
        got = run("""c => { setup(); ptOpenMemo('ruiz-ana', 50); Object.assign(ptMemoDraft.fields, {leader: 'Timothy Lane', notes: 'First'}); ptSaveMemo();
          const id = 'ruiz-ana__2026-Q4__50', created = pointsMemos[id].createdAt;
          ptOpenMemo('ruiz-ana', 50, id); const existing = ptMemoDraft.existing; ptMemoDraft.fields.notes = 'Second'; ptSaveMemo();
          return [existing, pointsMemos[id].notes, pointsMemos[id].createdAt === created, ptTasks().map(t => t.at)]; }""")
        self.assertEqual(got, [True, 'Second', True, [30, 20]])

    def test_suspension_dates_on_step_75(self):
        got = run("""c => { setup(); const r = pointsRecords['2026-Q4']['ruiz-ana']; r.events.push({id: 'v', date: '2026-10-09', type: 'insubord', status: 'confirmed', detail: ''});
          ptOpenMemo('ruiz-ana', 75); const form = ptMemoFormHtml();
          Object.assign(ptMemoDraft.fields, {leader: 'Timothy Lane', notes: 'x', susStart: '2026-10-20', susEnd: '2026-10-26'}); ptSaveMemo();
          return [form.includes('Suspension start'), pointsMemos['ruiz-ana__2026-Q4__75'].susStart, ptMemoDoc(pointsMemos['ruiz-ana__2026-Q4__75']).includes('Suspension: 2026-10-20 to 2026-10-26')]; }""")
        self.assertEqual(got, [True, '2026-10-20', True])

    def test_history_download(self):
        got = run("""c => { setup(); const m = ptMessageCards().find(x => x.tm === 'torres-maya'); ptMarkSent('torres-maya', m.ids, 'Hi <Maya>');
          ptDetail = 'torres-maya'; return {doc: ptHistoryDoc('torres-maya'), detail: ptBoardHtml()}; }""")
        self.assertIn('Accountability Points — Maya Torres', got['doc'])
        self.assertIn('Late from break #2', got['doc'])
        self.assertIn('Hi &lt;Maya&gt;', got['doc'])
        self.assertIn('Download history', got['detail'])
        self.assertIn('messaged', got['detail'])


@unittest.skipUnless(NODE, 'Node.js not installed')
class AddPointsAndSettings(unittest.TestCase):
    def test_add_points_by_hand(self):
        got = run("""c => { setup();
          const errs = [ptAddPoints('', '2026-10-12', 'uniform'), ptAddPoints('Maya Torres', 'x', 'uniform'), ptAddPoints('Maya Torres', '2026-10-12', 'tardy'), ptAddPoints('Aurora Diaz', '2026-10-12', 'uniform')];
          const ok = [ptAddPoints('Maya Torres', '2026-10-12', 'uniform', 'No hat'), ptAddPoints('Jo Ann Smith', '2026-10-12', 'theft'), ptAddPoints('Cole, Ben', '2026-10-12', 'aboveb')];
          const r = pointsRecords['2026-Q4']; const maya = r['torres-maya'].events.slice(-1)[0];
          return {errs, ok, maya: [maya.type, maya.note, maya.source, maya.by], jo: r['ann-smith-jo'] && r['ann-smith-jo'].tmName, theft: r['ann-smith-jo'].events[0].detail,
                  totals: Object.fromEntries(Object.entries(ptScored()).map(([k, v]) => [k, v.score.total])), waiting: ptMessageCards().some(x => x.tm === 'torres-maya')}; }""")
        self.assertEqual(got['errs'][:3], ['Pick a team member and a date.', 'Pick a team member and a date.', 'Pick what happened.'])
        self.assertIn('isn’t scored', got['errs'][3])
        self.assertEqual(got['ok'], ['', '', ''])
        # A known name either way round finds the record; a new one is turned round like the report.
        self.assertEqual(got['maya'], ['uniform', 'No hat', 'manual', 'TL'])
        self.assertEqual(got['jo'], 'Ann Smith, Jo')
        self.assertIn('send home immediately and message HR', got['theft'])
        self.assertEqual(got['totals']['torres-maya'], 15)
        self.assertEqual(got['totals']['cole-ben'], 0)
        self.assertTrue(got['waiting'])

    def test_rules(self):
        got = run("""c => { ptSaveRules({breakMinutes: '35', graceMinutes: '2', clockGraceMinutes: '-4', extendedHours: '', signature: ' ', leader: 'Kianna'});
          const s = ptSettings(); return [s.breakMinutes, s.graceMinutes, s.clockGraceMinutes, s.extendedHours, s.signature, s.leader, s.quarter]; }""")
        self.assertEqual(got, [35, 2, 0, 3, 'Chick-fil-A Buda Leadership', 'Kianna', '2026-Q4'])

    def test_roster_scored_and_active(self):
        got = run("""c => { setup(); ptSetTeam('cole-ben', {excluded: true}); ptSetTeam('ruiz-ana', {active: false});
          const r1 = ptRoster().map(x => [x.tm, x.active, x.excluded]); const scored1 = Object.keys(ptScored()).sort();
          pointsTeam['diaz-aurora'] = {name: 'Diaz, Aurora', excluded: false};
          return {r1, scored1, auroraScored: !ptExcluded('Diaz, Aurora'), html: ptSettingsHtml()}; }""")
        self.assertEqual(sorted(got['r1']), [['cole-ben', True, True], ['ruiz-ana', False, False], ['torres-maya', True, False]])
        self.assertEqual(got['scored1'], ['ruiz-ana', 'torres-maya'])
        self.assertTrue(got['auroraScored'])   # a leader ticked back in
        self.assertIn('Rules the system applies', got['html'])
        self.assertIn('Start a test run', got['html'])

    def test_test_run_is_a_sandbox(self):
        got = run("""c => { setup(); const real = JSON.stringify(pointsRecords['2026-Q4']);
          ptStartTest(); const q = ptQ(), start = ptQStart();
          const old = page([['Actual Vs. Scheduled', 200, 790], ['Chick-fil-A Buda', 200, 780], ['06/01/2026 - 06/07/2026', 200, 770], ['06/08/2026 3:00:00 AM', 400, 760],
            ['Torres, Maya', 10, 700], ['06/02/2026', 150, 690], ['06:20 AM', 200, 690], ['06:00 AM', 260, 690], ['02:00 PM', 200, 681], ['02:00 PM', 260, 681]]);
          const added = ptCommit(ptPrepare(APS.parseReport(old)), 'old.pdf');
          const during = {score: ptScored()['torres-maya'].score.total, sub: ptHeadSub(), banner: ptBodyHtml().includes('Test run.')};
          ptOpenMemo('torres-maya', 20);
          ptEndTest();
          return {q, start, added, during, after: [ptQ(), JSON.stringify(pointsRecords['2026-Q4']) === real, 'TEST' in pointsRecords, pointsUploads.map(u => u.quarter)]}; }""")
        self.assertEqual((got['q'], got['start'], got['added']), ('TEST', '2000-01-01', 1))
        self.assertEqual(got['during']['score'], 5)
        self.assertIn('TEST RUN', got['during']['sub'])
        self.assertTrue(got['during']['banner'])
        self.assertEqual(got['after'], ['2026-Q4', True, False, ['2026-Q4']])

    def test_quarter_close(self):
        got = run("""c => { setup(); ptAddPoints('Torres, Maya', '2026-10-12', 'insubord');
          ptSetTeam('ruiz-ana', {active: false});
          const preview = ptCarryList();
          const ok = ptCloseQuarter();
          const s = ptSettings(), q1 = pointsRecords['2027-Q1'];
          const scored = Object.fromEntries(Object.entries(ptScored()).map(([k, v]) => [k, v.score.total])), noMessage = ptMessageCards().length;
          const again = ptCloseQuarter();
          return {preview, ok, q: [s.quarter, s.quarterStartDate], carried: Object.fromEntries(Object.entries(q1).map(([k, r]) => [k, [r.carryIn, r.events[0].type, r.events[0].points, r.events[0].detail]])),
                  scored, noMessage, again, q2: ptSettings().quarter, q2carry: pointsRecords['2027-Q2']['torres-maya'].carryIn}; }""")
        # Maya: 5 + 5 + 50 = 60 → carries 20 (capped). Ana is inactive. Ben is at 0.
        self.assertEqual(got['preview'], [{'tm': 'torres-maya', 'tmName': 'Torres, Maya', 'total': 60, 'carry': 20}])
        self.assertTrue(got['ok'])
        self.assertEqual(got['q'], ['2027-Q1', '2027-01-01'])
        self.assertEqual(got['carried'], {'torres-maya': [20, 'carryover', 20, '50% of 60 from Q4 2026, capped at 20']})
        self.assertEqual(got['scored'], {'torres-maya': 20})
        self.assertEqual(got['noMessage'], 0)     # carryover isn't messaged
        self.assertTrue(got['again'])
        self.assertEqual(got['q2'], '2027-Q2')
        self.assertEqual(got['q2carry'], 10)

    def test_no_close_during_a_test_run(self):
        got = run("""c => { ptStartTest(); return [ptCloseQuarter(), ptSettings().quarter, ptSettingsHtml().includes('Quarter close is off during a test run.')]; }""")
        self.assertEqual(got, [False, '2026-Q4', True])

    def test_add_view(self):
        got = run("""c => { setup(); fohRoster = {'2026-10-12': [{name: 'Zed <Q>'}]}; bohRoster = {}; ptPane = 'add'; return {html: ptBodyHtml(), panes: ptActionsHtml()}; }""")
        self.assertIn('Log an infraction or a credit', got['html'])
        self.assertIn('No-call/no-show (+50)', got['html'])
        self.assertIn('Picked up a shift (-10)', got['html'])
        self.assertIn('Zed &lt;Q&gt;', got['html'])
        self.assertIn('Add points', got['panes'])
        self.assertIn('Settings', got['panes'])
