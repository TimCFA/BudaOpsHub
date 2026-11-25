"""PEA ratings are saved whole (Nov 2026).

Each saved rating row holds the index of its person, role, rater and
position in the names / roles / positions lists. Change-based saves merged
two phones' item-by-item changes to those lists, so rows ended up pointing at
other people: Hallie Perez showed Jazmine Hernandez Perez's Machines and
Secondary, and Tim showed PEAs he had given as PEAs on him. Now peaRatings
always goes as one whole value (state-patch.js STATE_WHOLE_KEYS,
state_patch.py WHOLE_KEYS), and the server drops a partial change from a page
on older code.
"""
import copy
import json
import os
import shutil
import subprocess
import sys
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.dirname(__file__))
from state_patch import apply_ops, inside_whole_key  # noqa: E402

NODE = shutil.which('node')

BASE = {'peaRatings': {'names': ['Hallie Perez', 'Eric Reyna'], 'positions': ['OMD'], 'roles': ['Team Member'],
                       'rows': [['2026-11-11T12:59', 0, 0, 1, 0, 3, 3, 3, 2, 3, 2.8]], 'uploads': [],
                       'coverage': {'FOH': [], 'BOH': []}, 'labels': {}},
        'peaNameAliases': {}}


def phone_a():
    """Synced Levelset: Jazmine rated on Secondary by Jenny."""
    s = copy.deepcopy(BASE)
    p = s['peaRatings']
    p['names'] += ['Jazmine Hernandez Perez', 'Jenny Reyes Ramos']
    p['positions'].append('Secondary')
    p['rows'].append(['2026-11-12T22:00', 2, 0, 3, 1, 2, 2, 2, 2, 2, 2.0])
    return s


def phone_b():
    """Synced at the same time from the same start, and also has Tim rating Jason."""
    s = copy.deepcopy(BASE)
    p = s['peaRatings']
    p['names'] += ['Jason Luna', 'Timothy Lane', 'Jazmine Hernandez Perez', 'Jenny Reyes Ramos']
    p['positions'] += ['Team Lead', 'Secondary']
    p['roles'].append('Team Lead')
    p['rows'].append(['2026-11-12T22:30', 2, 1, 3, 1, 2, 2, 2, 2, 2, 2.0])
    p['rows'].append(['2026-11-12T22:00', 4, 0, 5, 2, 2, 2, 2, 2, 2, 2.0])
    return s


def decoded(section):
    p = section['peaRatings']
    return sorted((r[0], p['names'][r[1]], p['names'][r[3]], p['positions'][r[4]]) for r in p['rows'])


def page_diff(base, mine):
    with open(os.path.join(ROOT, 'static', 'js', 'state-patch.js')) as f:
        js = f.read()
    code = js + '\nconst [b, m] = JSON.parse(require("fs").readFileSync(0, "utf8"));' \
                'process.stdout.write(JSON.stringify(stateDiff(b, m)));'
    out = subprocess.run([NODE, '-e', code], input=json.dumps([base, mine]),
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


@unittest.skipUnless(NODE, 'Node.js not installed')
class WholeSaveTest(unittest.TestCase):
    def test_pea_ratings_go_as_one_value(self):
        ops = page_diff(BASE, phone_a())
        self.assertEqual([(op['o'], op['p']) for op in ops], [('set', ['peaRatings'])])
        self.assertEqual(page_diff(BASE, copy.deepcopy(BASE)), [])
        # The aliases beside it still save change by change.
        mine = copy.deepcopy(BASE)
        mine['peaNameAliases']['hallie perez'] = 'Hallie Perez'
        self.assertEqual(page_diff(BASE, mine), [{'o': 'set', 'p': ['peaNameAliases', 'hallie perez'], 'v': 'Hallie Perez'}])

    def test_two_phones_syncing_at_once_keep_whose_rating_is_whose(self):
        server = apply_ops(BASE, page_diff(BASE, phone_a()))
        server = apply_ops(server, page_diff(BASE, phone_b()))
        self.assertEqual(decoded(server), [
            ('2026-11-11T12:59', 'Hallie Perez', 'Eric Reyna', 'OMD'),
            ('2026-11-12T22:00', 'Jazmine Hernandez Perez', 'Jenny Reyes Ramos', 'Secondary'),
            ('2026-11-12T22:30', 'Jason Luna', 'Timothy Lane', 'Team Lead'),
        ])


class OlderPageTest(unittest.TestCase):
    def test_partial_changes_are_spotted(self):
        self.assertTrue(inside_whole_key({'o': 'arr', 'p': ['peaRatings', 'rows'], 'add': []}))
        self.assertFalse(inside_whole_key({'o': 'set', 'p': ['peaRatings'], 'v': {}}))
        self.assertFalse(inside_whole_key({'o': 'set', 'p': ['peaNameAliases', 'x'], 'v': 'y'}))

    def test_server_drops_them_and_sends_the_section_back(self):
        import test_state as ts
        appmod = ts.appmod
        appmod.db.reference = lambda path: ts.FakeRef(path)
        appmod._cache.clear()
        appmod._cache_ready = False
        ts.store.clear()
        ts.store['appState'] = json.dumps(ts.LEGACY)
        ts.store['state/pea'] = json.dumps(BASE)
        c = appmod.app.test_client()
        with c.session_transaction() as sess:
            sess['manager'] = True
        ver = c.post('/api/state/load', json={}).get_json()['versions']['pea']
        older = [{'o': 'arr', 'p': ['peaRatings', 'names'], 'add': [{'v': 'Someone', 'n': 1, 'i': 2, 'end': True}]},
                 {'o': 'set', 'p': ['peaNameAliases', 'hallie perez'], 'v': 'Hallie Perez'}]
        r = c.post('/api/state/patch', json={'patches': {'pea': {'ver': ver, 'ops': older}}})
        self.assertEqual(r.status_code, 200)
        reply = r.get_json()
        self.assertIn('pea', reply.get('sections', {}))
        saved = ts.section('pea')
        self.assertEqual(saved['peaRatings']['names'], BASE['peaRatings']['names'])     # dropped
        self.assertEqual(saved['peaNameAliases'], {'hallie perez': 'Hallie Perez'})     # the rest went through


class NewerPdfTest(unittest.TestCase):
    """Levelset's Nov 2026 export heads its columns "Team member" and "Role"
    and spells the areas out; the older headings still read."""

    def header(self, labels):
        words, x = [], 0
        for label in labels:
            for i, part in enumerate(label.split(' ')):
                words.append({'text': part, 'x0': x, 'x1': x + 20, 'top': 100})
                x += 24 if i < len(label.split(' ')) - 1 else 60
        return words

    def test_both_headings(self):
        import pea_parser
        crit = [f'Criteria {i}' for i in range(1, 6)]
        for labels in (['Date', 'Employee', 'Employee Role', 'Leader', 'Position'] + crit + ['Overall'],
                       ['Date', 'Team member', 'Role', 'Leader', 'Position'] + crit + ['Overall']):
            self.assertEqual(len(pea_parser._column_bounds(self.header(labels))['bounds']), 11)

    def test_area_names(self):
        import pea_parser
        words = [{'text': t, 'x0': i * 50, 'x1': i * 50 + 40, 'top': 10}
                 for i, t in enumerate(['Areas:', 'Front', 'of', 'House,', 'Back', 'of', 'House'])]
        self.assertEqual(pea_parser._summary(words)['areas'], ['FOH', 'BOH'])


if __name__ == '__main__':
    unittest.main()
