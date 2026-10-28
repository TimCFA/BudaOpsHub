"""A team member's own PEA scores on their Right Now card (Tim, Oct 28 2026):
app.py /api/me/pea, from pea_mine.py. Only the signed-in person's scores,
per position (the latest five overall ratings averaged, and the tier), never
another person's, never a rater, never notes; the name matched the way the
hub matches it (pea-ratings.js), which this checks against the page's own
code. Names are made up.

Run: python3 -m unittest discover tests
"""
import json
import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
import pea_mine  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAIRS = [
    ('Ana Ruiz', 'Ana Ruiz'), ('Ana Ruiz', 'Ana Ruiz Lopez'), ('Ana Ruiz Lopez', 'Ana Lopez'), ('Ana Ruiz', 'Ana Park'),
    ('Makenzi Dale', 'Makenzie Dale'), ('José Peña', 'Jose Pena'), ('Dale, Makenzie', 'Makenzie Dale'), ('Ana R', 'Ana Ruiz'),
    ('Elizabeth (Liz) Moore', 'Liz Moore'), ('Liz Moore', 'Elizabeth (Liz) Moore'), ('Ben', 'Ben Cole'), ('Jo Ann Smith', 'Joann Smith'),
    ('Mary-Kate Olsen', 'Mary Kate Olsen'), ('Sam Ortiz', 'Samuel Ortiz'), ('', 'Ana Ruiz'),
]


def ratings(rows):
    """The page's stored shape: names / positions / roles indexed by each row."""
    out = {'names': [], 'positions': [], 'roles': ['Team Member'], 'rows': [], 'uploads': [], 'labels': {}}
    idx = lambda lst, v: lst.index(v) if v in lst else (lst.append(v) or len(lst) - 1)
    for at, emp, leader, pos, overall in rows:
        out['rows'].append([at, idx(out['names'], emp), 0, idx(out['names'], leader), idx(out['positions'], pos), 3, 3, 3, 3, 3, overall])
    return out


class Matching(unittest.TestCase):
    def test_the_same_as_the_page(self):
        js = ("const fs = require('fs'), vm = require('vm'); const src = fs.readFileSync(%s, 'utf8'); const ctx = {}; vm.createContext(ctx);"
              "const grab = n => src.match(new RegExp('(?:^|\\\\n)function ' + n + '\\\\([\\\\s\\\\S]*?\\\\n}\\\\n'))[0];"
              "vm.runInContext(['peaNameTokens', 'peaNameForms', 'peaOneEditApart', 'peaNameMatches'].map(grab).join('\\n'), ctx);"
              "process.stdout.write(JSON.stringify(%s.map(([a, b]) => ctx.peaNameMatches(a, b))));"
              ) % (json.dumps(os.path.join(ROOT, 'static', 'js', 'pea-ratings.js')), json.dumps(PAIRS))
        page = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual([pea_mine.name_matches(a, b) for a, b in PAIRS], page)
        self.assertIn(True, page)
        self.assertIn(False, page)

    def test_links_and_exact_names_first(self):
        names = ['Ana Ruiz Lopez', 'Ana Ruiz Diaz']
        self.assertIsNone(pea_mine.match_name('Ana Ruiz', names, {}))                                  # two loose matches: none
        self.assertEqual(pea_mine.match_name('Ana Ruiz', names, {'ana ruiz': 'Ana Ruiz Diaz'}), 'Ana Ruiz Diaz')
        self.assertIsNone(pea_mine.match_name('Ana Ruiz', names, {'ana ruiz': '__none__'}))          # marked as not in Levelset
        self.assertEqual(pea_mine.match_name('ana ruiz lopez', names, {}), 'Ana Ruiz Lopez')


class Scores(unittest.TestCase):
    def test_latest_five_per_position_and_the_tier(self):
        pea = {'peaRatings': ratings([
            ('2026-10-0%dT10:00' % d, 'Ana Ruiz Lopez', 'Lee Park', 'iPOS', o) for d, o in ((1, 1), (2, 3), (3, 3), (4, 3), (5, 3), (6, 2.5))
        ] + [('2026-10-07T10:00', 'Ana Ruiz Lopez', 'Lee Park', 'Host', 1.5), ('2026-10-07T11:00', 'Ben Cole', 'Lee Park', 'Host', 3)])}
        got = pea_mine.scores_for(pea, 'Ana Ruiz')
        self.assertEqual(got['name'], 'Ana Ruiz Lopez')
        self.assertEqual([(p['position'], p['avg'], p['n'], p['total'], p['last'], p['tier']) for p in got['positions']],
                         [('iPOS', 2.9, 5, 6, '2026-10-06', 'crushing'), ('Host', 1.5, 1, 1, '2026-10-07', 'notyet')])
        self.assertNotIn('Lee Park', json.dumps(got))                       # never a rater
        self.assertNotIn('Ben Cole', json.dumps(got))                       # never anyone else
        self.assertEqual(pea_mine.scores_for(None, 'Ana Ruiz'), {'name': None, 'positions': []})
        vals = [1.744, 1.745, 1.749, 1.75, 2.744, 2.745, 2.7451, 2.125, 1.0, 3.0]
        page = json.loads(subprocess.run(['node', '-e', 'process.stdout.write(JSON.stringify(%s.map(a => { const r = Math.round(a * 100) / 100; '
                                          'return r >= 2.75 ? "crushing" : r >= 1.75 ? "rise" : "notyet"; })))' % json.dumps(vals)],
                                         capture_output=True, text=True, check=True).stdout)
        self.assertEqual([pea_mine.tier_for(x)[0] for x in vals], page)      # rounded as the page does (peaTierFor)

    def test_the_tiers_and_recent_count_match_the_page(self):
        src = open(os.path.join(ROOT, 'static', 'js', 'pea-ratings.js'), encoding='utf-8').read()
        self.assertIn('const PEA_RECENT_RATINGS = %d;' % pea_mine.RECENT, src)
        for key, label, low in pea_mine.TIERS:
            self.assertIn("{key: '%s', label: '%s', min: %s" % (key, label, low if low else 0), src)


class Route(unittest.TestCase):
    def setUp(self):
        self.c = appmod.app.test_client()
        self._read = appmod._read_sections
        pea = {'peaRatings': ratings([('2026-10-05T10:00', 'Ana Ruiz Lopez', 'Lee Park', 'iPOS', 3)]), 'peaNameAliases': {}}
        appmod._read_sections = lambda: {'pea': pea}

    def tearDown(self):
        appmod._read_sections = self._read

    def as_(self, **sess):
        with self.c.session_transaction() as s:
            s.clear()
            s.update(sess)

    def test_only_my_own(self):
        self.as_(user={'name': 'Ana Ruiz', 'role': 'member', 'via': 'pin'})
        r = self.c.get('/api/me/pea')
        self.assertEqual(r.headers['Cache-Control'], 'no-store')
        self.assertEqual([p['position'] for p in r.get_json()['positions']], ['iPOS'])
        self.as_(user={'name': 'Ben Cole', 'role': 'member', 'via': 'pin'})
        self.assertEqual(self.c.get('/api/me/pea').get_json(), {'name': None, 'positions': []})

    def test_nobody_and_the_shared_pins_get_none(self):
        self.as_()
        self.assertEqual(self.c.get('/api/me/pea').get_json()['positions'], [])
        self.as_(manager=True)
        self.assertEqual(self.c.get('/api/me/pea').get_json()['positions'], [])


if __name__ == '__main__':
    unittest.main()
