"""Bringing notes in at once (static/js/leaders-import.js): plain text with a
leader's name over dated notes, a spreadsheet or CSV a note a row, and the
Leader Notes Calendar page's JSON; the review list, duplicates, and the
write (Tim, Oct 2026). "today" is 2026-10-12."""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, 'tests', 'leaders_runner.js')

with open(os.path.join(ROOT, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
    PAGE = f.read()


def run(op, **extra):
    out = subprocess.run(['node', RUNNER], input=json.dumps({'cases': [dict(op=op, **extra)]}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[0]


KNOWN = "leaderRoster = [{name: 'Maya Torres', roles: ['Food Safety']}, {name: 'Jordan Reyes', roles: []}, {name: 'Jordan Blake', roles: []}];"

TEXT = """Some heading nobody asked for
Oct 1 win: this line has no leader yet

Maya Torres
Oct 3 win: Caught the sanitizer gap herself
before the walkthrough.
Oct 7 - Coaching - Handoff ran late; we walked the 2pm checklist together.
10/9/2026 Watched the close; no notes beyond that.

## Jordan Reyes
Friday, Oct 3rd conversation: Talked through the Talent Leader card.
Keeps asking good questions.

Jordan:
Oct 4 win: ambiguous first name stays as typed

Priya Nair:
Something with no date at all
"""


class Dates(unittest.TestCase):
    def test_many_shapes(self):
        got = run("c => ['2026-10-03', '10/3/2026', '10/3/26', '10/3', 'Oct 3', 'Oct 3, 2026', 'October 3rd 2026', '3 Oct 2026', 'Friday, Oct 3', 'Sept 30', '13/40', 'yesterday', '2026-10-03T14:00'].map(ldiDate)")
        self.assertEqual(got, ['2026-10-03'] * 9 + ['2026-09-30', None, None, '2026-10-03'])

    def test_a_line_that_opens_with_a_date(self):
        got = run("c => [ldiDateHead('Oct 3 win: text'), ldiDateHead('10/5 — text'), ldiDateHead('2026-10-03: text'), ldiDateHead('Octopus 3 text'), ldiDateHead('May I say')]")
        self.assertEqual(got[0], {'date': '2026-10-03', 'rest': 'win: text'})
        self.assertEqual(got[1], {'date': '2026-10-05', 'rest': 'text'})
        self.assertEqual(got[2], {'date': '2026-10-03', 'rest': 'text'})
        self.assertIsNone(got[3])
        self.assertIsNone(got[4])


class Text(unittest.TestCase):
    def test_names_dates_types_and_run_on_lines(self):
        got = run("c => { " + KNOWN + " const p = ldiParseText(c.text, ldiKnownNames()); return {skipped: p.skipped, rows: p.rows.map(r => [r.leader, r.date, r.type, r.text, !!r.nodate])}; }", text=TEXT)
        self.assertEqual(got['skipped'], 2)
        self.assertEqual(got['rows'], [
            ['Maya Torres', '2026-10-03', 'win', 'Caught the sanitizer gap herself\nbefore the walkthrough.', False],
            ['Maya Torres', '2026-10-07', 'coach', 'Handoff ran late; we walked the 2pm checklist together.', False],
            ['Maya Torres', '2026-10-09', '', 'Watched the close; no notes beyond that.', False],
            ['Jordan Reyes', '2026-10-03', 'talk', 'Talked through the Talent Leader card.\nKeeps asking good questions.', False],
            ['Jordan', '2026-10-04', 'win', 'ambiguous first name stays as typed', False],
            ['Priya Nair', '2026-10-12', '', 'Something with no date at all', True]])

    def test_first_names_match_when_unambiguous(self):
        got = run("c => { " + KNOWN + " const k = ldiKnownNames(); return [ldiMatchLeader('maya', k), ldiMatchLeader('Jordan', k), ldiMatchLeader('MAYA TORRES', k), ldiMatchLeader('Nobody', k)]; }")
        self.assertEqual(got, ['Maya Torres', '', 'Maya Torres', ''])


class Cells(unittest.TestCase):
    def test_header_row_in_any_order(self):
        got = run("""c => ldiParseCells([['Date', 'Note', 'Type', 'Leader', 'Pillars', 'By'],
            ['10/3/2026', 'Great close', 'Win', 'Maya Torres', 'tl:zone; fs:coach', 'TL'],
            ['', 'No date here', '', 'Maya Torres', '', ''],
            ['10/4', '', 'Win', 'Maya Torres', '', '']]).rows""")
        self.assertEqual(got, [{'leader': 'Maya Torres', 'date': '2026-10-03', 'nodate': False, 'type': 'win', 'text': 'Great close', 'pec': ['tl:zone', 'fs:coach'], 'by': 'TL'},
                               {'leader': 'Maya Torres', 'date': '2026-10-12', 'nodate': True, 'type': '', 'text': 'No date here'}])

    def test_no_header_takes_the_columns_in_order(self):
        got = run("c => [ldiParseCells([['Maya Torres', 'Oct 3', 'coaching', 'Walked the list']]).rows, ldiParseCells([['Maya Torres', 'Oct 3', 'Just three columns']]).rows, ldiParseCells([['Maya Torres', 'Oct 3']]).skipped]")
        self.assertEqual(got[0], [{'leader': 'Maya Torres', 'date': '2026-10-03', 'nodate': False, 'type': 'coach', 'text': 'Walked the list'}])
        self.assertEqual(got[1], [{'leader': 'Maya Torres', 'date': '2026-10-03', 'nodate': False, 'type': '', 'text': 'Just three columns'}])
        self.assertEqual(got[2], 1)

    def test_csv_splitting(self):
        got = run("c => ldiSplitCsv('leader,date,note\\n\"Torres, Maya\",10/3,\"She said \"\"go\"\"\"\\n')")
        self.assertEqual(got, [['leader', 'date', 'note'], ['Torres, Maya', '10/3', 'She said "go"']])


class JsonExport(unittest.TestCase):
    def test_the_calendar_pages_shape(self):
        got = run("""c => ldiParseJson({notes: [{date: '2026-10-03', person: 'Maya', personKey: 'maya', type: 'coach', text: 'Late twice', pec: ['tl:self'], createdAt: 1},
            {date: 'bad', person: 'Maya', type: 'win', text: 'kept'}, {date: '2026-10-04', person: '', text: 'no one'}],
            focus: [{personKey: 'maya', quarter: '2026-Q4', items: ['Own the close', 'One PEA a shift']}]}).rows""")
        self.assertEqual(got, [{'leader': 'Maya', 'date': '2026-10-03', 'nodate': False, 'type': 'coach', 'text': 'Late twice', 'pec': ['tl:self']},
                               {'leader': 'Maya', 'date': '2026-10-12', 'nodate': True, 'type': 'win', 'text': 'kept'},
                               {'leader': 'maya', 'date': '2026-10-01', 'type': 'focus', 'text': 'Own the close'},
                               {'leader': 'maya', 'date': '2026-10-01', 'type': 'focus', 'text': 'One PEA a shift'}])


class Review(unittest.TestCase):
    def test_staging_matches_dedupes_and_keeps_only_real_pillars(self):
        got = run("c => { " + KNOWN + """ leaderNotes = {'Maya Torres': [{text: 'Great close', ts: 1, date: '2026-10-03', type: 'win'}]}; leaderFocus = {'maya torres__2026-Q4': ['Own the close']};
            ldiStage({rows: [{leader: 'maya', date: '2026-10-03', type: 'win', text: 'Great close', pec: ['tl:zone', 'made:up']}, {leader: 'maya', date: '2026-10-05', type: 'win', text: 'New one'},
                             {leader: 'Maya Torres', date: '2026-10-01', type: 'focus', text: 'Own the close'}, {leader: 'Nobody Here', date: '2026-10-01', type: '', text: 'x'}], skipped: 0}, 'test');
            return ldiItems.map(i => [i.leader, i.match, i.dup, i.on, i.pec]); }""")
        self.assertEqual(got, [['maya', 'Maya Torres', True, False, ['tl:zone']], ['maya', 'Maya Torres', False, True, []], ['Maya Torres', 'Maya Torres', True, False, []], ['Nobody Here', '', False, True, []]])

    def test_add_writes_ticked_rows(self):
        got = run("c => { " + KNOWN + """ ldiStage({rows: [{leader: 'maya', date: '2026-10-05', type: 'win', text: 'New one', pec: ['tl:zone'], by: 'KR'}, {leader: 'maya', date: '2026-10-06', type: '', text: 'Skipped'},
                {leader: 'Maya Torres', date: '2026-10-01', type: 'focus', text: 'Own the close'}, {leader: 'Nobody Here', date: '2026-10-02', type: 'talk', text: 'As typed'}], skipped: 0}, 'test');
            ldiItems[1].on = false; const n = ldiAdd();
            return {n, notes: Object.fromEntries(Object.entries(leaderNotes).map(([k, v]) => [k, v.map(x => [x.date, x.type || '', x.text, x.by, x.pec || null])])), focus: leaderFocus}; }""")
        self.assertEqual(got['n'], {'notes': 2, 'focus': 1})
        self.assertEqual(got['notes'], {'Maya Torres': [['2026-10-05', 'win', 'New one', 'KR', ['tl:zone']]], 'Nobody Here': [['2026-10-02', 'talk', 'As typed', 'TL', None]]})
        self.assertEqual(got['focus'], {'maya torres__2026-Q4': ['Own the close']})

    def test_pasted_text_is_told_apart(self):
        got = run("c => { " + KNOWN + """ const kinds = [];
            ldiReadText(JSON.stringify({notes: [{date: '2026-10-03', person: 'Maya Torres', type: 'win', text: 'from json'}]}), 'a'); kinds.push(ldiItems.map(i => i.text));
            ldiReadText('leader,date,type,note\\nMaya Torres,10/3,win,from csv\\n', 'b'); kinds.push(ldiItems.map(i => i.text));
            ldiReadText('Maya Torres\\nOct 3 win: from text\\n', 'c'); kinds.push(ldiItems.map(i => i.text));
            return kinds; }""")
        self.assertEqual(got, [['from json'], ['from csv'], ['from text']])

    def test_card_renders_and_escapes(self):
        html = run("c => { " + KNOWN + """ dirView = 'leaders'; ldiOpen = true; ldiStage({rows: [{leader: '<b>x</b>', date: '2026-10-03', type: 'win', text: '<script>alert(1)</script>'}], skipped: 0}, '<i>src</i>');
            const root = {innerHTML: ''}; document.getElementById = id => id === 'directorsRoot' ? root : null; renderDirectorsView(); return root.innerHTML; }""")
        self.assertIn('Bring notes in', html)
        self.assertIn('data-ldi-add', html)
        self.assertNotIn('<script>', html)
        self.assertNotIn('<b>x', html)
        self.assertNotIn('<i>src', html)


class Page(unittest.TestCase):
    def test_wiring(self):
        self.assertLess(PAGE.index('/static/js/leaders.js'), PAGE.index('/static/js/leaders-import.js'))


if __name__ == '__main__':
    unittest.main()
