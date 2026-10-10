"""Directors → Leaders (static/js/leaders.js): the PEA scoreboard against
the quarter's goals, each leader's profile (focus, notes, PEC calibration,
quarter history) and the Manage settings (Tim, Oct 2026). Monday Oct 12
2026 is "today", so the quarter is Q4 2026 (Oct 1 – Dec 31: 92 days, 12
elapsed)."""
import json
import os
import subprocess
import unittest

import app as appmod

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, 'tests', 'leaders_runner.js')

with open(os.path.join(ROOT, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
    PAGE = f.read()


def run(op, **extra):
    out = subprocess.run(['node', RUNNER], input=json.dumps({'cases': [dict(op=op, **extra)]}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[0]


# The directors' PEAs on two leaders this quarter, one from last quarter on a
# third, and two PEAs by a leader (on a team member, and on another leader)
# that don't count.
QUARTER = """
  peaRows = [
    pea('2026-10-01', 'Timothy Lane', 'Maya Torres'), pea('2026-10-02', 'Kianna Ramos', 'Maya Torres', 'Bagging', 2),
    pea('2026-10-06', 'Timothy Lane', 'Maya Torres', 'Drinks 2'), pea('2026-10-12', 'Timothy Lane', 'Maya Torres'),
    pea('2026-10-05', 'Timothy Lane', 'Jordan Reyes', 'Host', 3, 'Team Lead'),
    pea('2026-09-28', 'Kianna Ramos', 'Ava Morales'),
    pea('2026-10-07', 'Maya Torres', 'Noah Bennett'),
    pea('2026-10-08', 'Maya Torres', 'Jordan Reyes', 'Host', 3, 'Team Lead')];
  leaderNotes = {'Ava Morales': [{text: 'Shadowed the close', ts: 1, date: '2026-10-02', type: 'talk'}]};
"""


class Data(unittest.TestCase):
    def test_keys_live_in_the_right_sections(self):
        self.assertEqual(appmod.SECTION_OF_KEY['leaderRoster'], 'manager')
        self.assertEqual(appmod.SECTION_OF_KEY['peaGoals'], 'manager')
        self.assertEqual(appmod.SECTION_OF_KEY['leaderFocus'], 'people')     # private: PIN sessions only
        for key in ('leaderRoster', 'peaGoals', 'leaderFocus'):
            self.assertIn(key, appmod.MANAGER_ONLY_KEYS)

    def test_goals_default_to_tims_numbers(self):
        self.assertEqual(run('c => ldGoals()'), {'team': 50, 'leader': 12})
        self.assertEqual(run('c => { peaGoals = {team: 60, leader: 0}; return ldGoals(); }'), {'team': 60, 'leader': 12})

    def test_quarters(self):
        got = run("c => [ldQuarterKey('2026-10-12'), ldQuarterBounds('2026-Q4'), ldQuarterBounds('2026-Q1').to]")
        self.assertEqual(got[0], '2026-Q4')
        self.assertEqual(got[1], {'key': '2026-Q4', 'from': '2026-10-01', 'to': '2026-12-31', 'label': 'Q4 2026', 'span': 'Oct–Dec 2026'})
        self.assertEqual(got[2], '2026-03-31')
        got = run("c => { " + QUARTER + " leaderFocus = {'ava morales__2026-Q2': ['x']}; return ldQuarters(); }")
        self.assertEqual(got, ['2026-Q4', '2026-Q3', '2026-Q2'])

    def test_role_cards_come_from_the_leaders_list(self):
        got = run("c => { leaderRoster = [{name: 'Maya Torres', roles: ['Talent Leader']}]; return [ldCardsFor('maya torres'), ldCardsFor('Jordan Reyes'), ldPillarLabel('tl:zone'), ldPillarLabel('fs:coach')]; }")
        self.assertEqual(got, [['tl', 'nht', 'ct'], ['tl'], 'Lead the Zone', 'Coach Immediately'])


class Scoreboard(unittest.TestCase):
    def test_counts_pace_and_streaks(self):
        got = run("c => { " + QUARTER + " const S = ldScore(); return {total: S.total, expected: S.expected, weeksLeft: S.weeksLeft, by: S.byDirector, status: S.teamStatus, warn: S.noDirectorMatch,"
                  " leaders: S.leaders.map(L => [L.name, L.count, L.status, L.streak, L.others, L.last, L.byDirector, L.avg])}; }")
        self.assertEqual(got['total'], 5)                      # the directors' PEAs on leaders; not Maya's two, not Ava's Sep one
        self.assertEqual(got['by'], {'Timothy Lane': 4, 'Kianna Ramos': 1})
        self.assertAlmostEqual(got['expected'], 50 * 12 / 92, places=3)
        self.assertEqual(got['weeksLeft'], 12)
        self.assertEqual(got['status'], 'behind')              # 6 expected by today
        self.assertFalse(got['warn'])
        # Maya: 4 (three weeks running, 2.75 average), Jordan: 1 from a director plus Maya's that doesn't count, Ava (has notes): 0, behind.
        self.assertEqual(got['leaders'], [['Maya Torres', 4, 'pace', 3, 0, '2026-10-12', {'Timothy Lane': 3, 'Kianna Ramos': 1}, 2.75],
                                          ['Jordan Reyes', 1, 'pace', 1, 1, '2026-10-05', {'Timothy Lane': 1}, 3],
                                          ['Ava Morales', 0, 'behind', 0, 0, '', {}, None]])

    def test_warns_when_no_rater_is_a_director(self):
        got = run("c => { peaRows = [pea('2026-10-07', 'Maya Torres', 'Noah Bennett')]; const S = ldScore(); return [S.noDirectorMatch, S.total]; }")
        self.assertEqual(got, [True, 0])

    def test_goal_met_and_a_closed_quarter(self):
        got = run("c => { leaderRoster = [{name: 'Maya Torres', roles: []}]; peaRows = Array.from({length: 13}, (_, i) => pea('2026-10-0' + (1 + i % 9), 'Timothy Lane', 'Maya Torres', 'P' + i)); peaGoals = {team: 50, leader: 12};"
                  " const S = ldScore(); const L = S.leaders[0]; return [L.status, S.done, ldPaceText(L, S)]; }")
        self.assertEqual(got, ['done', 1, '13 of 12, 1 over. Goal met.'])
        got = run("c => { " + QUARTER + " const S = ldScore('2026-Q3'); return [S.over, S.teamStatus, S.leaders.map(L => [L.name, L.count, L.status])]; }")
        self.assertTrue(got[0])
        self.assertEqual(got[1], 'missed')
        self.assertEqual(got[2], [['Ava Morales', 1, 'missed']])   # only Ava gave one in Q3; the others have no Q3 record

    def test_pace_text_says_what_is_left(self):
        got = run("c => { " + QUARTER + " const S = ldScore(); return S.leaders.map(L => ldPaceText(L, S)); }")
        self.assertEqual(got[0], '8 to go in 12 weeks: about one every other week. Ahead of the 1 expected by today.')
        self.assertEqual(got[2], '12 to go in 12 weeks: about one a week. Expected 1 by today.')

    def test_who_gets_a_profile(self):
        got = run("c => { " + QUARTER + " leaderRoster = [{name: 'Grace Kim', roles: []}]; leaderNotes = {'Liam Patel': [{text: 'x', ts: 1}]};"
                  " fohRoster = {'2026-10-13': [{name: 'Sofia Alvarez', start: '6:00a', end: '2:00p', leader: true}, {name: 'Noah Bennett', start: '6:00a', end: '2:00p'}]}; return ldLeaderNames('2026-Q4'); }")
        self.assertEqual(got, ['Grace Kim', 'Jordan Reyes', 'Maya Torres', 'Liam Patel', 'Sofia Alvarez'])   # listed, rated as a Team Lead, a PEA giver, noted, rostered; not the directors
        got = run("c => { " + QUARTER + " leaderRoster = [{name: 'Timothy Lane', roles: ['Senior Leader']}]; return ldLeaderNames('2026-Q4').includes('Timothy Lane'); }")
        self.assertTrue(got)                                   # unless he's on the list


class Notes(unittest.TestCase):
    def test_notes_match_any_spelling_and_old_notes_keep_working(self):
        got = run("c => { leaderNotes = {'maya torres': [{text: 'old', by: 'TL', ts: 1759000000000}]}; ldSaveNote('Maya Torres', {text: 'new', ts: 2, date: '2026-10-12', type: 'win', pec: ['tl:zone']});"
                  " return [Object.keys(leaderNotes), ldNotesFor('MAYA TORRES').map(n => [n.text, ldNoteDate(n)])]; }")
        self.assertEqual(got[0], ['maya torres'])
        self.assertEqual(got[1], [['old', '2025-09-27'], ['new', '2026-10-12']])

    def test_profile_text_for_an_eval(self):
        text = run("c => { " + QUARTER + """ leaderRoster = [{name: 'Maya Torres', roles: ['Food Safety']}];
            leaderFocus = {'maya torres__2026-Q4': ['Run the 2pm handoff without a prompt', 'Coach Noah on bagging']};
            leaderNotes = {'Maya Torres': [{text: 'Caught the sanitizer gap herself', ts: 1, date: '2026-10-03', type: 'win', pec: ['fs:coach']}, {text: 'Late twice', ts: 2, date: '2026-09-20', type: 'watch'}]};
            return ldProfileText('Maya Torres'); }""")
        self.assertIn('Maya Torres — Food Safety\nQ4 2026 (Oct–Dec 2026)', text)
        self.assertIn('PEAs from directors: 4 of 12 · 8 to go in 12 weeks', text)
        self.assertIn('(Timothy Lane 3 · Kianna Ramos 1)', text)
        self.assertIn('Streak: 3 weeks', text)
        self.assertIn('Average score on those PEAs: 2.75', text)
        self.assertIn('1. Run the 2pm handoff without a prompt', text)
        self.assertIn('NOTES (1: 1 win, 0 coaching, 0 watch, 0 conversation)', text)
        self.assertIn('Oct 3 · Win: Caught the sanitizer gap herself [Coach Immediately]', text)
        self.assertNotIn('Late twice', text)                   # last quarter's
        self.assertIn('PILLARS WITH NO EVIDENCE YET: Lead the Zone', text)
        self.assertNotIn('Coach Immediately, ', text.split('NO EVIDENCE YET')[1])

    def test_brief_lines(self):
        got = run("c => { " + QUARTER + " return ldBriefLines(); }")
        self.assertEqual(got, ['Director PEAs on leaders: 5 of 50 (behind pace, 6 expected by today) · Timothy Lane 4 · Kianna Ramos 1',
                               'Each leader: Maya Torres 4/12, Jordan Reyes 1/12, Ava Morales 0/12 (behind)'])


class Page(unittest.TestCase):
    def render(self, setup):
        return run("c => { " + setup + " const root = {innerHTML: ''}; document.getElementById = id => id === 'directorsRoot' ? root : null; renderDirectorsView(); return root.innerHTML; }")

    def test_overview_and_profile_render_and_escape(self):
        html = self.render(QUARTER + " dirView = 'leaders'; peaRows.push(pea('2026-10-03', '<img src=x onerror=alert(1)>', 'Noah Bennett'), pea('2026-10-03', 'Timothy Lane', '<img src=y>', 'Host', 3, 'Team Lead'));")
        self.assertIn('data-ld-open="Maya Torres"', html)
        self.assertIn('of 50 PEAs · Q4 2026', html)
        self.assertNotIn('<img', html)
        html = self.render(QUARTER + " dirView = 'leaders'; ldOpen = 'Maya Torres'; leaderNotes = {'Maya Torres': [{text: '<script>x</script>', ts: 1, date: '2026-10-03', type: 'coach'}]};"
                           " leaderFocus = {'maya torres__2026-Q4': ['<b>bold</b>']};")
        self.assertIn('Q4 2026 focus', html)
        self.assertIn('Calibrate to the PEC', html)
        self.assertIn('Quarter by quarter', html)
        self.assertNotIn('<script>', html)
        self.assertNotIn('<b>bold', html)
        self.assertIn('&lt;b&gt;bold', html)

    def test_brief_carries_the_scoreboard(self):
        html = self.render(QUARTER)
        self.assertIn('PEA scoreboard', html)
        self.assertIn('data-dir-view="leaders"', html)
        self.assertIn('PEA SCOREBOARD (Q4 2026)', run("c => { " + QUARTER + " return dirBriefText(); }"))

    def test_page_wiring(self):
        self.assertIn('id="leadersManageRoot"', PAGE)
        self.assertLess(PAGE.index('/static/js/directors.js'), PAGE.index('/static/js/leaders.js'))
        with open(os.path.join(ROOT, 'static', 'js', 'manage-and-import.js'), encoding='utf-8') as f:
            self.assertIn('renderLeadersManage', f.read())


if __name__ == '__main__':
    unittest.main()
