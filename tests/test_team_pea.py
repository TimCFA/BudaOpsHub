"""Directors → Team (static/js/team-pea.js): the rater leaderboard (Team
Leads and Trainers on the PEAs they gave, with the coverage bonus), the
team scoreboard (everyone rated, ranked on growth this quarter), a team
member's profile (positions, criteria, ratings, notes, quarter history) and
the text exports (Tim, Oct 2026, TIM-71). Monday Oct 12 2026 is "today", so
the quarter is Q4 2026 (Oct 1 – Dec 31: 92 days, 12 elapsed)."""
import json
import os
import subprocess
import unittest

import app as appmod

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, 'tests', 'team_pea_runner.js')

with open(os.path.join(ROOT, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
    PAGE = f.read()


def run(op, **extra):
    out = subprocess.run(['node', RUNNER], input=json.dumps({'cases': [dict(op=op, **extra)]}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[0]


# This quarter: Maya (a Team Lead) rates Noah twice (two positions) and Ava
# once; Jordan (a Trainer, by Levelset's role on his own rating) rates Noah
# once on a position Maya already covered; Tim (a director) rates Noah. Last
# quarter Noah was Not Yet on iPOS and Ava was already green on Bagging.
QUARTER = """
  directors = [{name: 'Timothy Lane'}];
  setRatings([
    pea('2026-10-01', 'Maya Torres', 'Noah Bennett', 'iPOS', 3),
    pea('2026-10-02', 'Maya Torres', 'Noah Bennett', 'Bagging', 2, 'Team Member', [3, 1, 2, 2, 2]),
    pea('2026-10-06', 'Maya Torres', 'Ava Morales', 'Bagging', 3),
    pea('2026-10-07', 'Jordan Reyes', 'Noah Bennett', 'iPOS', 3),
    pea('2026-10-12', 'Timothy Lane', 'Noah Bennett', 'iPOS', 3),
    pea('2026-09-20', 'Timothy Lane', 'Jordan Reyes', 'Trainer', 3, 'Trainer'),
    pea('2026-09-10', 'Maya Torres', 'Noah Bennett', 'iPOS', 1, 'Team Member', [1, 1, 1, 1, 1]),
    pea('2026-09-12', 'Maya Torres', 'Ava Morales', 'Bagging', 3),
    pea('2026-09-14', 'Timothy Lane', 'Maya Torres', 'Team Lead', 3, 'Team Lead')]);
"""


class Data(unittest.TestCase):
    def test_team_notes_are_private_and_manager_only(self):
        self.assertEqual(appmod.SECTION_OF_KEY['teamNotes'], 'people')
        self.assertIn('people', appmod.PRIVATE_SECTIONS)
        self.assertIn('teamNotes', appmod.MANAGER_ONLY_KEYS)

    def test_page_loads_the_view_after_leaders(self):
        self.assertLess(PAGE.index('/static/js/leaders.js'), PAGE.index('/static/js/team-pea.js'))
        self.assertLess(PAGE.index('/static/js/team-pea.js'), PAGE.index('/static/js/launch-mode.js'))

    def test_quarters_come_from_ratings_and_notes(self):
        got = run("c => { " + QUARTER + " teamNotes = {'Noah Bennett': [{text: 'x', ts: 1, date: '2026-04-02', type: 'win'}]}; return tpQuarters(); }")
        self.assertEqual(got, ['2026-Q4', '2026-Q3', '2026-Q2'])


class Raters(unittest.TestCase):
    def test_points_count_peas_plus_first_person_and_first_position(self):
        got = run("c => { " + QUARTER + " const R = tpRaters(); return {raters: R.raters.map(r => [r.rank, r.name, r.role, r.points, r.count, r.people, r.positions, r.bonus, r.status, r.last]),"
                  " directors: R.directors.map(r => [r.name, r.points, r.count]), total: R.total, byRaters: R.byRaters, byDirectors: R.byDirectors, people: R.people, positions: R.positions, goal: R.goal}; }")
        # Maya: 3 PEAs + Noah, Ava + iPOS, Bagging = 7. Jordan: 1 + Noah + iPOS = 3. Tim sits with the directors.
        self.assertEqual(got['raters'], [[1, 'Maya Torres', 'Team Lead', 7, 3, 2, 2, 4, 'pace', '2026-10-06'],
                                         [2, 'Jordan Reyes', 'Trainer', 3, 1, 1, 1, 2, 'pace', '2026-10-07']])
        self.assertEqual(got['directors'], [['Timothy Lane', 3, 1]])
        self.assertEqual([got['total'], got['byRaters'], got['byDirectors'], got['people'], got['positions'], got['goal']], [5, 4, 1, 2, 2, 12])

    def test_the_log_says_where_each_point_came_from(self):
        got = run("c => { " + QUARTER + " const m = tpRaters().raters[0]; return m.log.map(l => [l.date, l.employee, l.position, l.pts, l.why]); }")
        self.assertEqual(got, [['2026-10-01', 'Noah Bennett', 'iPOS', 3, ['first on Noah Bennett', 'first iPOS']],
                               ['2026-10-02', 'Noah Bennett', 'Bagging', 2, ['first Bagging']],
                               ['2026-10-06', 'Ava Morales', 'Bagging', 2, ['first on Ava Morales']]])

    def test_listed_leaders_with_no_pea_sit_at_the_bottom_behind(self):
        got = run("c => { " + QUARTER + " leaderRoster = [{name: 'Grace Kim', roles: []}]; listedLeaders = ['Grace Kim']; return tpRaters().raters.map(r => [r.rank, r.name, r.role, r.points, r.status]); }")
        self.assertEqual(got, [[1, 'Maya Torres', 'Team Lead', 7, 'pace'], [2, 'Jordan Reyes', 'Trainer', 3, 'pace'], [3, 'Grace Kim', 'Team Lead', 0, 'behind']])

    def test_self_ratings_and_other_quarters_do_not_count(self):
        got = run("c => { setRatings([pea('2026-10-03', 'Maya Torres', 'Maya Torres', 'iPOS', 3), pea('2026-09-03', 'Maya Torres', 'Noah Bennett', 'iPOS', 3), pea('2026-09-04', 'Maya Torres', 'Ava Morales', 'Host', 3)]);"
                  " return [tpRaters().raters.map(r => [r.name, r.points, r.count]), tpRaters('2026-Q3').raters.map(r => [r.name, r.points, r.status])]; }")
        self.assertEqual(got, [[['Maya Torres', 0, 0]], [['Maya Torres', 6, 'missed']]])

    def test_ties_share_a_rank_and_the_goal_can_be_met(self):
        got = run("c => { setRatings([...Array.from({length: 12}, (_, i) => pea('2026-10-0' + (1 + i % 9), 'Maya Torres', 'P' + i, 'iPOS', 3)), pea('2026-10-05', 'Jordan Reyes', 'Noah Bennett', 'iPOS', 3), pea('2026-10-05', 'Sofia Alvarez', 'Noah Bennett', 'Host', 3)]);"
                  " const R = tpRaters(); return [R.raters.map(r => [r.rank, r.name, r.points, r.status]), R.done, R.teamStatus, R.leader.name]; }")
        self.assertEqual(got[0], [[1, 'Maya Torres', 25, 'done'], [2, 'Jordan Reyes', 3, 'pace'], [2, 'Sofia Alvarez', 3, 'pace']])
        self.assertEqual(got[1:], [1, 'pace', 'Maya Torres'])   # 14 by 3 raters beats the 4 expected by Oct 12

    def test_streak_and_week_series(self):
        got = run("c => { setRatings([pea('2026-09-29', 'Maya Torres', 'A', 'iPOS', 3), pea('2026-10-01', 'Maya Torres', 'B', 'iPOS', 3), pea('2026-10-06', 'Maya Torres', 'C', 'iPOS', 3), pea('2026-10-12', 'Maya Torres', 'D', 'iPOS', 3)]);"
                  " const m = tpRaters().raters[0]; return [m.streak, m.series.slice(0, 4), m.best, m.count]; }")
        # Sep 29 is last quarter's, even though its week holds Oct 1; three weeks running since.
        self.assertEqual(got, [3, [1, 1, 1, 0], 1, 3])


class Team(unittest.TestCase):
    def test_ranked_on_green_gained_then_average_change(self):
        got = run("c => { " + QUARTER + " const T = tpTeam(); return {people: T.people.map(p => [p.rank, p.name, p.gained, p.lost, p.change == null ? null : +p.change.toFixed(2), p.avg == null ? null : +p.avg.toFixed(2), p.peas, p.raters, p.green, p.positions, p.sides, p.allGreen, p.isNew, p.stale]),"
                  " peas: T.peas, rated: T.rated, gained: T.gained, allGreen: T.allGreen, stale: T.stale}; }")
        # Noah: iPOS went from 1 to 2.5 (not green yet) and Bagging is new: biggest change. Ava holds green on Bagging. Jordan and Maya only have last quarter's leadership rating.
        self.assertEqual(got['people'], [[1, 'Noah Bennett', [], [], 1.5, 2.25, 4, 3, 0, 2, ['foh'], False, False, False],
                                         [2, 'Ava Morales', [], [], 0.0, 3.0, 1, 1, 1, 1, ['foh'], True, False, False],
                                         [3, 'Jordan Reyes', [], [], 0.0, 3.0, 0, 0, 1, 1, ['lead'], False, False, False],
                                         [4, 'Maya Torres', [], [], 0.0, 3.0, 0, 0, 1, 1, ['lead'], False, False, False]])
        self.assertEqual([got['peas'], got['rated'], got['gained'], got['allGreen'], got['stale']], [5, 2, 0, 1, 0])

    def test_a_position_gone_green_this_quarter_ranks_first(self):
        got = run("c => { setRatings([pea('2026-09-01', 'Maya Torres', 'Noah Bennett', 'Fries', 2), pea('2026-10-05', 'Maya Torres', 'Noah Bennett', 'Fries', 3), pea('2026-10-06', 'Maya Torres', 'Noah Bennett', 'Fries', 3),"
                  " pea('2026-09-01', 'Maya Torres', 'Ava Morales', 'Host', 1), pea('2026-10-05', 'Maya Torres', 'Ava Morales', 'Host', 2), pea('2026-10-06', 'Maya Torres', 'Ava Morales', 'Host', 2), pea('2026-10-07', 'Maya Torres', 'Ava Morales', 'Host', 2)]);"
                  " const T = tpTeam(); return T.people.map(p => [p.rank, p.name, p.gained, +p.change.toFixed(2), p.sides]); }")
        # Noah's Fries went 2 → 2.67 (On the Rise; not green on 2.67). Ava's Host went 1 → 1.75. Neither gained green; Ava's bigger climb wins.
        self.assertEqual(got, [[1, 'Ava Morales', [], 0.75, ['foh']], [2, 'Noah Bennett', [], 0.67, ['boh']]])
        got = run("c => { setRatings([pea('2026-09-01', 'Maya Torres', 'Noah Bennett', 'Fries', 2), pea('2026-10-05', 'Maya Torres', 'Noah Bennett', 'Fries', 3), pea('2026-10-06', 'Maya Torres', 'Noah Bennett', 'Fries', 3), pea('2026-10-07', 'Maya Torres', 'Noah Bennett', 'Fries', 3),"
                  " pea('2026-09-01', 'Maya Torres', 'Ava Morales', 'Host', 1), pea('2026-10-05', 'Maya Torres', 'Ava Morales', 'Host', 3), pea('2026-10-06', 'Maya Torres', 'Ava Morales', 'Host', 2)]);"
                  " const T = tpTeam(); return T.people.map(p => [p.rank, p.name, p.gained, p.lost, +p.change.toFixed(2), p.allGreen]); }")
        # Now Noah's Fries averages 2.75: green, and gained this quarter; that beats Ava's +1.00 climb.
        self.assertEqual(got, [[1, 'Noah Bennett', ['Fries'], [], 0.75, True], [2, 'Ava Morales', [], [], 1.0, False]])

    def test_slipping_from_green_counts_against(self):
        got = run("c => { setRatings([pea('2026-08-01', 'Maya Torres', 'Noah Bennett', 'iPOS', 3), pea('2026-08-02', 'Maya Torres', 'Noah Bennett', 'iPOS', 3), pea('2026-10-05', 'Maya Torres', 'Noah Bennett', 'iPOS', 1), pea('2026-10-06', 'Maya Torres', 'Noah Bennett', 'iPOS', 1)]);"
                  " const p = tpTeam().people[0]; return [p.gained, p.lost, +p.change.toFixed(2), p.green, p.notyet]; }")
        self.assertEqual(got, [[], ['iPOS'], -1.0, 0, 0])

    def test_filters_by_side_and_name(self):
        got = run("c => { " + QUARTER + " const T = tpTeam(); tpSide = 'foh'; const a = tpTeamShown(T).map(p => p.name); tpSide = 'lead'; const b = tpTeamShown(T).map(p => p.name); tpSide = ''; tpSearch = 'ava'; const c2 = tpTeamShown(T).map(p => p.name); return [a, b, c2]; }")
        self.assertEqual(got, [['Noah Bennett', 'Ava Morales'], ['Jordan Reyes', 'Maya Torres'], ['Ava Morales']])

    def test_no_pea_in_a_month_is_due(self):
        got = run("c => { setRatings([pea('2026-09-10', 'Maya Torres', 'Noah Bennett', 'iPOS', 3), pea('2026-09-14', 'Maya Torres', 'Ava Morales', 'iPOS', 3)]); const T = tpTeam(); return [T.people.map(p => [p.name, p.stale]), T.stale, tpTeam('2026-Q3').people.map(p => p.stale)]; }")
        self.assertEqual(got, [[['Ava Morales', False], ['Noah Bennett', True]], 1, [False, False]])   # 32 days vs 28; never on a past quarter

    def test_a_past_quarter_reads_as_it_ended(self):
        got = run("c => { setRatings([pea('2026-06-01', 'Maya Torres', 'Noah Bennett', 'iPOS', 1), pea('2026-08-01', 'Maya Torres', 'Noah Bennett', 'iPOS', 3), pea('2026-08-02', 'Maya Torres', 'Noah Bennett', 'iPOS', 3), pea('2026-10-05', 'Maya Torres', 'Noah Bennett', 'iPOS', 1)]);"
                  " const q3 = tpTeam('2026-Q3').people[0], q4 = tpTeam().people[0]; return [[q3.green, q3.gained, +q3.change.toFixed(2), q3.peas], [q4.green, q4.lost, +q4.change.toFixed(2), q4.peas]]; }")
        # Q3 ends with iPOS at 2.33 (1, 3, 3): not green yet, up 1.33 from June's 1. Q4 so far: 2.00 after an Oct 1, down 0.33.
        self.assertEqual(got, [[0, [], 1.33, 2], [0, [], -0.33, 1]])


class Profile(unittest.TestCase):
    def test_positions_weakest_first_with_criteria_in_levelsets_words(self):
        got = run("c => { " + QUARTER + " peaRatings.labels = {Bagging: ['Accuracy', 'Speed', 'Sauces', 'Bag build', 'Hospitality']}; const P = tpPerson('Noah Bennett');"
                  " return [P.role, P.sides, P.positions.map(x => [x.pos, +x.cell.avg.toFixed(2), x.cell.tier.key, x.gained, x.weak && [x.weak.label, x.weak.avg], x.criteria.map(c => c.label + ' ' + c.avg.toFixed(1)), x.quarter, x.was && x.was.avg]), P.ratings.map(r => [r.date, r.position, r.leader, r.overall]), P.rater, P.row.cert]; }")
        self.assertEqual(got[0], 'Team Member')
        self.assertEqual(got[1], ['foh'])
        self.assertEqual(got[2], [['Bagging', 2.0, 'rise', False, ['Speed', 1], ['Accuracy 3.0', 'Speed 1.0', 'Sauces 2.0', 'Bag build 2.0', 'Hospitality 2.0'], 1, None],
                                  ['iPOS', 2.5, 'rise', False, None, ['Category 1 2.5', 'Category 2 2.5', 'Category 3 2.5', 'Category 4 2.5', 'Category 5 2.5'], 3, 1]])
        self.assertEqual(got[3], [['2026-10-12', 'iPOS', 'Timothy Lane', 3], ['2026-10-07', 'iPOS', 'Jordan Reyes', 3], ['2026-10-02', 'Bagging', 'Maya Torres', 2], ['2026-10-01', 'iPOS', 'Maya Torres', 3]])
        self.assertIsNone(got[4])                                   # Noah hasn't given a PEA
        self.assertEqual(got[5], {'foh': {'green': 0, 'rated': 2, 'total': 7, 'missing': ['iPOS', 'Bagging'], 'unrated': ['Drinks 1/3', 'Drinks 2', 'OMD', 'Host', 'Runner'], 'allGreen': False}})

    def test_a_rater_profile_carries_their_quarter_as_a_rater_and_history(self):
        got = run("c => { " + QUARTER + " teamNotes = {'maya torres': [{text: 'Coached Noah on sauces', ts: 1, date: '2026-10-03', type: 'coach', tags: ['Bagging:2']}]}; const P = tpPerson('Maya Torres');"
                  " return [P.rater && [P.rater.rank, P.rater.points, P.rater.count], P.notes.map(n => [n.text, n.type, n.tags]), P.history.map(h => [h.q, h.peas, h.avg, h.green, h.rated, h.gave, h.notes])]; }")
        self.assertEqual(got[0], [1, 7, 3])
        self.assertEqual(got[1], [['Coached Noah on sauces', 'coach', ['Bagging:2']]])
        self.assertEqual(got[2], [['2026-Q4', 0, None, 1, 1, 3, 1], ['2026-Q3', 1, 3, 1, 1, 2, 0]])

    def test_notes_match_any_spelling_and_tags_read_in_levelsets_words(self):
        got = run("c => { " + QUARTER + " peaRatings.labels = {Bagging: ['Accuracy', 'Speed', 'Sauces', 'Bag build', 'Hospitality']}; teamNotes = {'noah bennett': [{text: 'old', ts: 1, date: '2026-10-01', type: 'win'}]};"
                  " tpSaveNote('Noah Bennett', {text: 'new', ts: 2, date: '2026-10-12', type: 'coach', tags: ['Bagging:2']}); return [Object.keys(teamNotes), tpNotesFor('NOAH BENNETT').map(n => n.text), tpTagLabel('Bagging:2'), tpTagLabel('iPOS:4')]; }")
        self.assertEqual(got, [['noah bennett'], ['old', 'new'], 'Bagging · Sauces', 'iPOS · Category 5'])

    def test_someone_with_no_record_falls_back_to_the_boards(self):
        got = run("c => { " + QUARTER + " tpOpen = 'Nobody Here'; const h = tpBodyHtml(); return [tpOpen, h.includes('Rater leaderboard')]; }")
        self.assertEqual(got, ['', True])


class Rendering(unittest.TestCase):
    def test_boards_and_profile_render_and_escape(self):
        got = run("c => { " + QUARTER + " setRatings([pea('2026-10-01', 'Maya Torres', '<i>Eve', 'iPOS', 3)]); teamNotes = {'<i>Eve': [{text: '<b>sharp</b>', ts: 1, date: '2026-10-02', type: 'win'}]};"
                  " const a = tpBodyHtml(); tpTab = 'team'; const b = tpBodyHtml(); tpOpen = '<i>Eve'; const c2 = tpBodyHtml(); return [a.includes('Rater leaderboard'), a.includes('data-tp-open=\"&lt;i&gt;Eve\"') || b.includes('data-tp-open=\"&lt;i&gt;Eve\"'), b.includes('Team scoreboard'), c2.includes('&lt;b&gt;sharp&lt;/b&gt;'), [a, b, c2].some(h => h.includes('<i>Eve') || h.includes('<b>sharp'))]; }")
        self.assertEqual(got, [True, True, True, True, False])

    def test_the_board_text_lists_both_boards(self):
        got = run("c => { " + QUARTER + " return tpBoardText(); }")
        self.assertIn('RATER LEADERBOARD · Q4 2026 (Oct–Dec 2026)', got)
        self.assertIn('1. Maya Torres — 7 pts (3 PEAs, 2 people, 2 positions)', got)
        self.assertIn('2. Jordan Reyes — 3 pts (1 PEA, 1 person, 1 position)', got)
        self.assertIn('DIRECTORS\nTimothy Lane — 3 pts (1 PEA)', got)
        self.assertIn('TEAM SCOREBOARD · Q4 2026', got)
        self.assertIn('1. Noah Bennett — green held, avg 2.25 (+1.50), 0/2 green, 4 PEAs', got)

    def test_the_profile_text_reads_like_eval_prep(self):
        got = run("c => { " + QUARTER + " peaRatings.labels = {Bagging: ['Accuracy', 'Speed', 'Sauces', 'Bag build', 'Hospitality']}; teamNotes = {'Noah Bennett': [{text: 'Coached on sauces', ts: 1, date: '2026-10-03', type: 'coach', tags: ['Bagging:2']}]}; return tpProfileText('Noah Bennett'); }")
        self.assertIn('Noah Bennett — Team Member (FOH)\nQ4 2026 (Oct–Dec 2026)', got)
        self.assertIn('PEAs this quarter: 4 · last Oct 12 · 3 raters', got)
        self.assertIn('Average: 2.25 (+1.50 since the quarter began) · green: 0 of 2 positions', got)
        self.assertIn('Bagging: 2.00 On the Rise (×1) · coach on Speed (1.0) · Accuracy 3.0, Speed 1.0, Sauces 2.0, Bag build 2.0, Hospitality 2.0', got)
        self.assertIn('Oct 3 · Coaching: Coached on sauces [Bagging · Sauces]', got)
        self.assertIn('RATINGS THIS QUARTER (4)\nOct 12 · iPOS by Timothy Lane: 3 (3, 3, 3, 3, 3)', got)


if __name__ == '__main__':
    unittest.main()
