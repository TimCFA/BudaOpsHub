"""A Team Lead sees the score of the person they're placing in Set Ups (Tim,
Nov 22 2026). The ratings are private, so a lead's phone gets a cut-down
copy from /api/setups/pea (pea_mine.lead_view): no raters, no leader's
scores, held in memory only and never in the saved 'pea' section.

Names are made up.
"""
import json
import os
import re
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
import pea_mine  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
js = lambda name: open(os.path.join(ROOT, 'static', 'js', name), encoding='utf-8').read()


def pea(rows, aliases=None):
    """The stored shape. rows: (at, employee, role, rater, position, overall)."""
    out = {'names': [], 'positions': [], 'roles': [], 'rows': [], 'uploads': [{'at': 'x', 'file': 'secret.pdf'}],
           'coverage': {'FOH': [['2026-10-01', '2026-11-20']], 'BOH': []}, 'labels': {'iPOS': ['A', 'B', 'C', 'D', 'E']}}
    idx = lambda lst, v: lst.index(v) if v in lst else (lst.append(v) or len(lst) - 1)
    for at, emp, role, rater, pos, overall in rows:
        out['rows'].append([at, idx(out['names'], emp), idx(out['roles'], role), idx(out['names'], rater), idx(out['positions'], pos), 3, 2, 3, 1, 3, overall])
    return {'peaRatings': out, 'peaNameAliases': aliases or {}}


ROWS = [
    ('2026-10-05T10:00', 'Ana Ruiz', 'Team Member', 'Lee Park', 'iPOS', 2.8),
    ('2026-10-12T10:00', 'Ana Ruiz', 'Team Member', 'Dana Reyes', 'Bagging', 1.9),
    ('2026-10-06T10:00', 'Ben Cole', 'Trainer', 'Lee Park', 'iPOS', 2.4),
    ('2026-10-07T10:00', 'Lee Park', 'Team Lead', 'Dana Reyes', 'iPOS', 3.0),
    # Promoted since: her Team Member ratings go too.
    ('2026-09-01T10:00', 'Maya Torres', 'Team Member', 'Lee Park', 'Bagging', 2.0),
    ('2026-10-20T10:00', 'Maya Torres', 'Team Lead', 'Dana Reyes', 'Bagging', 2.9),
    ('2026-10-08T10:00', 'Dana Reyes', 'Director', 'Sam Admin', 'iPOS', 3.0),
]


class LeadView(unittest.TestCase):
    def setUp(self):
        self.view = pea_mine.lead_view(pea(ROWS, {'ana r': 'Ana Ruiz', 'lee': 'Lee Park', 'temp': pea_mine.NOT_IN_LEVELSET}))
        self.r = self.view['peaRatings']

    def test_no_rater_is_ever_sent(self):
        self.assertTrue(self.r['rows'])
        self.assertTrue(all(row[3] == -1 for row in self.r['rows']))
        # A rater who was never rated themselves isn't in the names at all.
        self.assertNotIn('Sam Admin', json.dumps(self.view))

    def test_no_leaders_scores(self):
        self.assertEqual(sorted(self.r['names']), ['Ana Ruiz', 'Ben Cole'])
        for gone in ('Lee Park', 'Maya Torres', 'Dana Reyes'):
            self.assertNotIn(gone, json.dumps(self.view))

    def test_the_team_s_ratings_come_through_whole(self):
        got = sorted((row[0], self.r['names'][row[1]], self.r['positions'][row[4]], row[5:10], row[10]) for row in self.r['rows'])
        self.assertEqual(got, [
            ('2026-10-05T10:00', 'Ana Ruiz', 'iPOS', [3, 2, 3, 1, 3], 2.8),
            ('2026-10-06T10:00', 'Ben Cole', 'iPOS', [3, 2, 3, 1, 3], 2.4),
            ('2026-10-12T10:00', 'Ana Ruiz', 'Bagging', [3, 2, 3, 1, 3], 1.9),
        ])
        self.assertEqual(self.r['labels'], {'iPOS': ['A', 'B', 'C', 'D', 'E']})
        self.assertEqual(self.r['coverage']['FOH'], [['2026-10-01', '2026-11-20']])

    def test_no_upload_log_and_only_links_to_people_shown(self):
        self.assertEqual(self.r['uploads'], [])
        self.assertEqual(self.view['peaNameAliases'], {'ana r': 'Ana Ruiz', 'temp': pea_mine.NOT_IN_LEVELSET})

    def test_nothing_saved_yet_and_broken_rows(self):
        for nothing in (None, {}, {'peaRatings': 'x'}, {'peaRatings': {'rows': [[1], None, 'x', ['2026-10-05', 9, 0, 0, 0, 1, 1, 1, 1, 1, 2]]}}):
            self.assertEqual(pea_mine.lead_view(nothing)['peaRatings']['rows'], [])

    def test_the_page_reads_the_copy_as_it_reads_its_own(self):
        """pea-ratings.js peaAllRatings on the copy: the same people, positions and scores, no leader."""
        src = js('pea-ratings.js')
        fn = re.search(r'function peaAllRatings\(source\)\{[\s\S]*?\n\}\n', src).group(0)
        code = fn.replace('source || peaShown()', 'source') + f'\nconsole.log(JSON.stringify(peaAllRatings({json.dumps(self.r)})));'
        out = json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(sorted((r['employee'], r['position'], r['overall'], r['leader']) for r in out),
                         [('Ana Ruiz', 'Bagging', 1.9, ''), ('Ana Ruiz', 'iPOS', 2.8, ''), ('Ben Cole', 'iPOS', 2.4, '')])


class Route(unittest.TestCase):
    def setUp(self):
        self.c = appmod.app.test_client()
        self._read = appmod._read_sections
        appmod._read_sections = lambda: {'pea': pea(ROWS)}

    def tearDown(self):
        appmod._read_sections = self._read

    def as_(self, **sess):
        with self.c.session_transaction() as s:
            s.clear()
            s.update(sess)

    def test_team_leads_and_up_only(self):
        for sess in ({}, {'user': {'name': 'Ana Ruiz', 'role': 'member', 'via': 'pin'}}, {'user': {'name': 'Ben Cole', 'role': 'trainer', 'via': 'pin'}},
                     {'device': {'id': 'd1', 'name': 'Counter tablet'}}):
            self.as_(**sess)
            r = self.c.get('/api/setups/pea')
            self.assertEqual(r.status_code, 403, sess)
            self.assertNotIn('Ana Ruiz', r.get_data(as_text=True))
        self.as_(user={'name': 'Lee Park', 'role': 'lead', 'via': 'pin'})
        r = self.c.get('/api/setups/pea')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers['Cache-Control'], 'no-store')
        self.assertEqual(sorted(r.get_json()['peaRatings']['names']), ['Ana Ruiz', 'Ben Cole'])
        self.as_(manager=True)
        self.assertEqual(self.c.get('/api/setups/pea').status_code, 200)

    def test_the_saved_section_still_goes_to_managers_only(self):
        self.assertIn('pea', appmod.PRIVATE_SECTIONS)
        self.assertTrue({'peaRatings', 'peaNameAliases'} <= appmod.MANAGER_ONLY_KEYS)


class Page(unittest.TestCase):
    """The copy lives apart from the saved ratings, and Set Ups reads through it."""

    def test_the_copy_is_never_the_saved_ratings(self):
        src = js('pea-ratings.js')
        load = re.search(r'async function peaLeadLoad\(\)\{[\s\S]*?\n\}\n', src).group(0)
        self.assertIn("'/api/setups/pea'", load)
        self.assertIn("id.role === 'lead'", load)
        self.assertNotRegex(load, r'(?<![.\w])(peaRatings|peaNameAliases)\s*=(?!=)')
        # Nothing that saves or keeps a copy on the phone knows about it.
        for name in ('storage.js', 'early-paint.js'):
            self.assertNotIn('peaLead', js(name), name)

    def test_a_manager_s_own_ratings_win(self):
        src = js('pea-ratings.js')
        self.assertIn('function peaShown(){ return peaLead && !peaRatings.rows.length ? peaLead.ratings : peaRatings; }', src)
        self.assertIn('function peaAliasesShown(){ return peaLead && !peaRatings.rows.length ? peaLead.aliases : peaNameAliases; }', src)

    def test_set_ups_reads_through_the_copy(self):
        self.assertIn('source || peaShown()', js('pea-ratings.js'))
        self.assertIn('peaAliasesShown()[peaRosterKey(rosterName)]', js('pea-ratings.js'))
        self.assertIn('peaShown().rows', js('pea-coach.js'))
        self.assertIn('peaShown().labels', js('pea-coach.js'))
        self.assertEqual(js('setups-sheet.js').count('peaShown().rows.length'), 2)
        self.assertIn('const hasPea = peaShown().rows.length > 0;', js('daypicker-and-positions.js'))
        for name in ('setups-sheet.js', 'daypicker-and-positions.js', 'setup-leaders.js', 'pea-coach.js'):
            self.assertNotRegex(js(name), r'\bpeaRatings\.(rows|labels)', name)

    def test_asked_for_whenever_who_is_signed_in_is_known(self):
        self.assertEqual(js('accounts.js').count("if(typeof peaLeadLoad === 'function') peaLeadLoad();"), 2)


if __name__ == '__main__':
    unittest.main()
