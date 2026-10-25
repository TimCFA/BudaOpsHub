"""Directors → Points → "Bring in the old tracker" (static/js/points-import.js):
the Accountability Points artifact's "Export all" workbook brought into the
hub (Tim, Oct 13 2026). Checked against the hub's own scoring before anything
is written; names in the export's "First Last" form match the punch reports'
"Last, First"; bringing the same file in twice adds nothing twice."""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, 'tests', 'points_import_runner.js')

with open(os.path.join(ROOT, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
    PAGE = f.read()


def run(op):
    out = subprocess.run(['node', RUNNER], input=json.dumps({'cases': [{'op': op}]}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[0]


TOTALS = "Object.fromEntries(Object.values(ptScored()).map(s => [APS.displayName(s.rec.tmName), s.score.total]))"


class Plan(unittest.TestCase):
    def test_a_clean_export_comes_in_with_every_total_the_same(self):
        got = run("c => { const p = piPlan(BOOK()); const n = piApply(p); return [p.problems, p.counts, p.people, p.totalsChecked, n, " + TOTALS + "]; }")
        problems, counts, people, checked, added, totals = got
        self.assertEqual(problems, [])
        self.assertEqual((counts['events'], counts['confirmed'], counts['dismissed'], counts['already']), (8, 6, 2, 0))
        self.assertEqual((people, checked, added), (3, 3, 8))
        # Maya is a leader (skipped by default) but the old tracker scored her, so she stays scored.
        self.assertEqual(totals, {'Ana Ruiz': 25, 'Ben (Benny) Cole Ortiz': 5, 'Maya Torres': 5})

    def test_events_keep_status_source_note_and_messaged_day(self):
        got = run("c => { piApply(piPlan(BOOK())); return pointsRecords['2026-Q4']['ana-ruiz'].events.map(e => [e.date, e.type, e.status, e.source, e.note || '', (e.messagedAt || '').slice(0, 10), e.imported, e.seq]); }")
        self.assertEqual(got, [
            ['2026-10-02', 'tardy', 'confirmed', 'report', '', '2026-10-03', True, '001'],
            ['2026-10-05', 'callout_lt24', 'confirmed', 'report', '', '2026-10-06', True, '002'],
            ['2026-10-06', 'pickup', 'confirmed', 'manual', 'Covered Sunday prep', '', True, '003'],
            ['2026-10-07', 'tardy', 'confirmed', 'report', '', '', True, '004'],
            ['2026-10-08', 'latebreak', 'dismissed', 'report', '', '', True, '005']])

    def test_ladder_memo_messages_roster_and_reports(self):
        got = run("c => { piApply(piPlan(BOOK())); const r = pointsRecords['2026-Q4']['ana-ruiz'], m = pointsMemos['ana-ruiz__2026-Q4__20'];"
                  " return [r.acks, r.messages.map(x => [x.at, x.text]), [m.title, m.total, m.date, m.leader, m.followUp, m.notes, m.plan, m.ack, m.events.length],"
                  " pointsTeam, pointsUploads.map(u => [u.runDate, u.coversTo, u.added, u.file, u.quarter]), ptOwed(ptScored()['ana-ruiz']).map(l => l.at)]; }")
        acks, msgs, memo, team, uploads, owed = got
        self.assertEqual(acks, {'20': {'at': '2026-10-06T12:00:00', 'by': '', 'leader': 'Casey', 'memo': 'ana-ruiz__2026-Q4__20'}})
        self.assertEqual(msgs, [['2026-10-03T09:05:00', 'Hey Ana, first note.'], ['2026-10-06T14:21:00', 'Hey Ana, attendance note.']])
        self.assertEqual(memo, ['Leader Conversation Record', 30, '2026-10-06', 'Casey', '2026-10-20', 'Call-outs', 'Call 24 hours ahead.', 'signed', 3])
        self.assertEqual(team['ana-ruiz']['lang'], 'es')
        self.assertEqual(team['ben-benny-cole-ortiz']['connecteamId'], 'ct-7')
        self.assertTrue(team['casey-director']['excluded'])
        self.assertFalse(team['maya-torres']['excluded'])
        self.assertEqual(uploads, [['2026-10-08', '2026-10-07', 4, 'Old tracker', '2026-Q4']])
        self.assertEqual(owed, [])          # 25 points: step 20 closed there, so nothing owed here

    def test_bringing_it_in_twice_adds_nothing(self):
        got = run("c => { piApply(piPlan(BOOK())); const again = piPlan(BOOK()); piApply(again); return [again.counts, pointsRecords['2026-Q4']['ana-ruiz'].events.length, pointsRecords['2026-Q4']['ana-ruiz'].messages.length, pointsUploads.length, " + TOTALS + "]; }")
        counts, events, messages, uploads, totals = got
        self.assertEqual([counts[k] for k in ('events', 'messages', 'memos', 'closed', 'open', 'teamNew', 'uploads')], [0, 0, 0, 0, 0, 0, 0])
        self.assertEqual(counts['already'], 8)
        self.assertEqual((events, messages, uploads), (5, 2, 1))
        self.assertEqual(totals['Ana Ruiz'], 25)


class Refused(unittest.TestCase):
    def test_a_total_that_doesnt_match_stops_it(self):
        got = run("c => { const b = BOOK(); b.Totals[0]['Points QTD'] = '30'; const p = piPlan(b); const n = piApply(p); return [p.problems, n, Object.keys(pointsRecords)]; }")
        self.assertIn('Ana Ruiz (30 there, 25 here)', got[0][0])
        self.assertEqual(got[1:], [0, []])

    def test_wrong_quarter_test_run_and_unknown_types_stop_it(self):
        got = run("c => { const b = BOOK(); b.Events[0].Quarter = '2026-Q3'; return piPlan(b).problems; }")
        self.assertTrue(any('one quarter at a time' in p for p in got))
        got = run("c => { pointsSettings = {quarter: '2027-Q1', quarterStartDate: '2027-01-01'}; return piPlan(BOOK()).problems; }")
        self.assertTrue(any('the hub is scoring 2027-Q1' in p for p in got))
        got = run("c => { pointsSettings = {testMode: true}; return piPlan(BOOK()).problems; }")
        self.assertTrue(any('test run' in p for p in got))
        got = run("c => { const b = BOOK(); b.Events[0].Type = 'Sleeping in'; return piPlan(b).problems; }")
        self.assertTrue(any('Sleeping in' in p for p in got))
        got = run("c => piPlan({Sheet1: [{a: 1}]}).problems")
        self.assertIn('isn’t the old tracker’s export', got[0])


class AfterTheImport(unittest.TestCase):
    def test_names_match_the_punch_reports_spelling(self):
        got = run("c => { piApply(piPlan(BOOK())); return [ptKeyFor('Cole Ortiz, Ben (Benny)'), ptKeyFor('Ruiz, Ana'), ptKeyFor('Torres, Maya'), ptKeyFor('New, Person'), ptExcluded('Director, Casey')]; }")
        self.assertEqual(got, ['ben-benny-cole-ortiz', 'ana-ruiz', 'maya-torres', 'new-person', True])

    def test_the_next_punch_report_skips_what_came_in_and_adds_the_rest(self):
        got = run("c => { piApply(piPlan(BOOK())); const prep = ptPrepare(APS.parseReport(REPORT)); ptCommit(prep, 'r.pdf');"
                  " const r = pointsRecords['2026-Q4']; return [prep.dup, prep.fresh.map(e => [e.tm, e.date, e.type]), Object.keys(r).sort(), " + TOTALS + "['Ben (Benny) Cole Ortiz']]; }")
        dup, fresh, keys, ben = got
        self.assertEqual(dup, 1)                                       # Oct 6's tardy was already imported
        self.assertEqual(fresh, [['ben-benny-cole-ortiz', '2026-10-13', 'tardy']])
        self.assertEqual(keys, ['ana-ruiz', 'ben-benny-cole-ortiz', 'maya-torres'])   # no second record for Ben
        self.assertEqual(ben, 10)

    def test_what_the_hub_already_recorded_is_not_added_again(self):
        got = run("c => { ptCommit(ptPrepare(APS.parseReport(REPORT)), 'r.pdf'); const p = piPlan(BOOK()); piApply(p);"
                  " return [p.counts.already, p.problems, Object.keys(pointsRecords['2026-Q4']).sort(), pointsRecords['2026-Q4']['cole-ortiz-ben-benny'].events.map(e => [e.date, e.type, !!e.imported]).sort()]; }")
        already, problems, keys, ben = got
        self.assertEqual((already, problems), (1, []))
        self.assertEqual(keys, ['ana-ruiz', 'cole-ortiz-ben-benny', 'maya-torres'])   # Ben's export rows join the record his report made
        self.assertEqual(ben, [['2026-10-06', 'tardy', False], ['2026-10-07', 'absence', True], ['2026-10-13', 'tardy', False]])


class Page(unittest.TestCase):
    def test_wired_after_points_and_shown_on_upload(self):
        self.assertLess(PAGE.index('/static/js/points.js'), PAGE.index('/static/js/points-import.js'))
        self.assertLess(PAGE.index('/static/js/points-import.js'), PAGE.index('/static/js/launch-mode.js'))
        self.assertIn('xlsxReady()', open(os.path.join(ROOT, 'static', 'js', 'points-import.js')).read())   # the reader loads on a file read
        got = run("c => { ptPane = 'upload'; const a = ptUploadHtml(); piPending = {file: '<b>x.xlsx', plan: piPlan(BOOK())}; const b = ptUploadHtml(); piApply(piPending.plan); piPending = null; return [a, b, ptUploadHtml()]; }")
        self.assertIn('Bring in the old tracker', got[0])
        self.assertIn('data-pi-file', got[0])
        self.assertIn('All 3 totals come out the same', got[1])
        self.assertIn('&lt;b&gt;x.xlsx', got[1])
        self.assertNotIn('<b>x.xlsx', got[1])
        self.assertIn('8 events for 3 team members', got[2])


if __name__ == '__main__':
    unittest.main()
