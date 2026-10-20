"""Trainer Trial (static/js/trainer-trial.js), rebuilt Oct 19 2026 on the
Trainer Playbook and the Certified Trainer Evaluation: checkoffs Levelset
ticks, the evaluation's story rule, "Maintain 2.75+ TM PEA" checked against
Levelset, the mentee judged on other leaders' PEAs (with a grading check on
the candidate's own), the final evaluation window and the certification gate.
Monday Oct 19 2026 is "today". Names are made up.

Run: python3 -m unittest discover tests
"""
import json
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, 'tests', 'trainer_trial_runner.js')


def run(op):
    out = subprocess.run(['node', RUNNER], input=json.dumps({'cases': [{'op': op}]}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[0]


# Jordan's trial started Sep 25 (day 25, week 4). Jordan gave 3 PEAs by day
# 21 and one in week 4; Maya rates Jordan's own positions (avg 2.75) and the
# mentee Ava twice (2s); Jordan also rated Ava (a 2 and a 3).
SETUP = """
  setRatings([
    pea('2026-09-28', 'Jordan Reyes', 'Ava Morales', 'iPOS', 2),
    pea('2026-10-02', 'Jordan Reyes', 'Noah Bennett', 'Bagging', 3),
    pea('2026-10-10', 'Jordan Reyes', 'Noah Bennett', 'iPOS', 3),
    pea('2026-10-17', 'Jordan Reyes', 'Ava Morales', 'Bagging', 3),
    pea('2026-10-01', 'Maya Torres', 'Ava Morales', 'iPOS', 2),
    pea('2026-10-05', 'Maya Torres', 'Ava Morales', 'Bagging', 2),
    pea('2026-10-06', 'Maya Torres', 'Jordan Reyes', 'iPOS', 3),
    pea('2026-10-07', 'Maya Torres', 'Jordan Reyes', 'Breader', 2.5)]);
  const t = {id: 'a', name: 'Jordan Reyes', coach: 'Maya Torres', startDate: '2026-09-25', mentee: 'Ava Morales', checks: {}, shifts: []};
"""


class LevelsetChecks(unittest.TestCase):
    def test_pea_checkoffs_tick_from_levelset(self):
        got = run("c => { " + SETUP + """
          const before = [ttAutoDone(t, 'w3-peas'), ttAutoDone(t, 'w4-zonepea'), ttGivenBetween(t, 1, 30).length];
          setRatings(peaAllRatings().filter(r => r.date !== '2026-10-10' && r.date !== '2026-10-17'));
          return before.concat([ttAutoDone(t, 'w3-peas'), ttAutoDone(t, 'w4-zonepea')]); }""")
        self.assertEqual(got, [True, True, 4, False, False])

    def test_peas_on_themselves_do_not_count(self):
        got = run("c => { " + SETUP + """ setRatings(peaAllRatings().concat([pea('2026-10-12', 'Jordan Reyes', 'Jordan Reyes', 'iPOS', 3)]));
          return ttGiven(t).length; }""")
        self.assertEqual(got, 4)

    def test_own_team_member_average(self):
        got = run("c => { " + SETUP + " const o = ttOwnTM(t); return [o.cells.length, o.avg, o.green]; }")
        self.assertEqual(got, [2, 2.75, 1])


class StoryRule(unittest.TestCase):
    """A 2 needs a story from the past week, a 3 needs 2-3 (the evaluation's rule)."""
    SHIFTS = """
      t.evalLead = {engage: 3, hospitality: 2, clarity: 2, pea275: 3};
      t.shifts = [
        {id: 's1', date: '2026-10-15', ratings: {engage: 3, clarity: 1}, evidence: ['hospitality'], win: 'Named every trainee'},
        {id: 's2', date: '2026-10-18', ratings: {engage: 2}, evidence: []},
        {id: 's3', date: '2026-10-01', ratings: {clarity: 3}, evidence: []}];
    """

    def test_ratings_without_enough_recent_stories_are_flagged(self):
        got = run("c => { " + SETUP + self.SHIFTS + """
          return [ttShort(t, []).map(x => x.row.k), ttEvidence(t, ttRows().find(r => r.k === 'clarity'), []).all.length]; }""")
        # clarity: a 1 isn't a story and the 3 on Oct 1 is too old for "the past week".
        self.assertEqual(got, [['clarity'], 1])

    def test_a_tagged_levelset_sentence_is_a_story(self):
        got = run("c => { " + SETUP + self.SHIFTS + """
          const tagged = [{pillars: ['tt2:clarity'], date: '2026-10-16', text: 'Walked her through DIR on bagging', leader: 'Maya Torres'}];
          return ttShort(t, tagged).map(x => x.row.k); }""")
        self.assertEqual(got, [])

    def test_tm_pea_line_is_checked_against_levelset(self):
        got = run("c => { " + SETUP + self.SHIFTS + """
          setRatings(peaAllRatings().concat([pea('2026-10-12', 'Maya Torres', 'Jordan Reyes', 'Fries', 2)]));
          return ttShort(t, [{pillars: ['tt2:clarity'], date: '2026-10-16'}]).map(x => [x.row.k, x.why]); }""")
        self.assertEqual(got, [['pea275', 'Levelset average is 2.50, under 2.75']])


class Mentee(unittest.TestCase):
    def test_judged_on_other_leaders_with_a_grading_check(self):
        got = run("c => { " + SETUP + " const m = ttMentee(t); return [m.others, m.mine, m.avg, m.tier.key, m.pass, m.shared, m.delta, m.first, m.day30]; }")
        self.assertEqual(got, [2, 2, 2.0, 'rise', True, 2, 0.5, '2026-09-28', '2026-10-27'])

    def test_only_the_candidates_own_ratings_do_not_count(self):
        got = run("c => { " + SETUP + """ setRatings(peaAllRatings().filter(r => r.leader !== 'Maya Torres'));
          const m = ttMentee(t); return [m.total, m.others, m.pass]; }""")
        self.assertEqual(got, [2, 0, False])

    def test_levelset_spelling_is_used(self):
        got = run("c => { " + SETUP + " t.mentee = 'Ava'; t.menteePeaName = 'ava  morales'; return ttMentee(t).others; }")
        self.assertEqual(got, 2)


class Gate(unittest.TestCase):
    def test_everything_met_then_the_final_evaluation_missing(self):
        got = run("c => { " + SETUP + """
          t.startDate = '2026-09-10';   // ended Oct 9; "the past week" is Oct 3-9
          setRatings(peaAllRatings().concat([pea('2026-09-20', 'Jordan Reyes', 'Noah Bennett', 'iPOS', 3), pea('2026-09-21', 'Jordan Reyes', 'Ava Morales', 'iPOS', 2), pea('2026-09-25', 'Jordan Reyes', 'Noah Bennett', 'Fries', 3), pea('2026-10-03', 'Jordan Reyes', 'Noah Bennett', 'Host', 3)]));
          const rows = ttRows(), tags = rows.filter(r => !r.area && !r.levelset).map(r => r.k), all = {};
          rows.forEach(r => all[r.k] = 3);
          t.evalLead = all;
          const shift = (id, date) => ({id, date, ratings: Object.fromEntries(ttAreas().map(a => [a.k, 3])), evidence: tags});
          t.shifts = [shift('x', '2026-10-04'), shift('y', '2026-10-08')];
          t.checks = {}; ttAllCheckKeys().forEach(k => t.checks[k] = {done: true});
          const a = ttGate(t, []);
          t.checks['w3-final'] = {done: false};
          const b = ttGate(t, []);
          return [a.ok, a.ls.overall, b.ok, b.lines.final, ttFinalWindow(t)]; }""")
        self.assertEqual(got, [True, 3, False, False, {'from': '2026-11-01', 'to': '2026-11-07'}])

    def test_final_window_crosses_the_year(self):
        got = run("c => ttFinalWindow({startDate: '2026-12-15'})")
        self.assertEqual(got, {'from': '2027-02-01', 'to': '2027-02-07'})

    def test_parts_weigh_the_same(self):
        got = run("c => { const s = ttScores({hospitality: 3, hustle: 3, humility: 3, engage: 2, model: 2, clarity: 2, celebrate: 2, grow: 2, pea275: 2, selfaware: 1, teamfirst: 1, conflict: 1, selfdev: 1, comm: 1, systems: 1}); return [s.p1, s.p2, s.p3, s.overall, ttGrade(s.overall).g]; }")
        self.assertEqual(got, [3, 2, 1, 2, 'B'])


class Page(unittest.TestCase):
    def test_a_trial_saved_before_the_rebuild_still_opens(self):
        # The old shape: {id, name, coach, startDate}, no new fields.
        got = run("""c => { setRatings([]);
          trainerTrainees = [{id: 'old1', name: "<b>O'Brien</b>", coach: 'Casey', startDate: '2026-10-01'}];
          const out = [ttStatus(trainerTrainees[0]).label];
          ['plan', 'shifts', 'eval', 'decision'].forEach(tab => { ttTab = tab; renderTrainerTrial(); const h = document.getElementById('trainerTrialRoot').innerHTML;
            out.push(h.includes('&lt;b&gt;O&#39;Brien&lt;/b&gt;') && !h.includes("<b>O'Brien")); });
          return out; }""")
        # Day 19 is week 3: the 9 items of weeks 1-2 are open.
        self.assertEqual(got, ['Behind · 9 open', True, True, True, True])

    def test_evaluation_lines_are_taggable_pillars(self):
        got = run("c => [ttRows().length, ttRows().filter(r => r.tag).map(r => r.tag), ttAreas().map(a => a.k), tpLsWho('rater:Jordan Reyes')]")
        self.assertEqual(got[0], 15)
        self.assertEqual(len(got[1]), 14)
        self.assertTrue(all(re.match(r'^[a-z0-9]{1,20}:[a-z0-9]{1,20}$', t) for t in got[1]))
        self.assertEqual(got[2], ['engage', 'model', 'clarity', 'celebrate', 'grow'])
        self.assertEqual(got[3], {'who': 'Jordan Reyes', 'rater': True})

    def test_modal_fields_exist(self):
        with open(os.path.join(ROOT, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
            page = f.read()
        for id_ in ('ttAddName', 'ttAddCoach', 'ttAddDirector', 'ttAddMentee', 'ttAddStart', 'ttAddElig1', 'ttAddElig2', 'ttAddElig3', 'ttAddLsNames', 'btnTTConfirmAdd', 'btnTTCancelAdd', 'trainerTrialRoot'):
            self.assertIn(f'id="{id_}"', page)


if __name__ == '__main__':
    unittest.main()
