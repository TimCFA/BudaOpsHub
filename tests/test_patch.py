"""Change-based saves: the page (state-patch.js) and the server
(state_patch.py) must agree on every change.

Run: python3 -m unittest discover tests   (the page side needs Node.js;
without it those checks are skipped)
"""
import json
import os
import random
import shutil
import subprocess
import sys
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')
sys.path.insert(0, ROOT)
from state_patch import apply_ops, canon  # noqa: E402

NODE = shutil.which('node')

ENTRY = {'ts': 1, 'name': 'Nuggets (8 ct)', 'qty': 2, 'cost': 9.5, 'section': 'foh'}
BASE = {
    'entries': [ENTRY, {'ts': 2, 'name': 'Fries', 'qty': 1, 'cost': 1.2, 'section': 'foh'}],
    'posAssignments': {'foh||2026-09-28||Lunch||iPOS 1': 'Josh', 'foh||2026-09-28||Lunch||Drinks 1': 'Avah'},
    'wasteDays': ['2026-09-26', '2026-09-27'],
    'formDone': False,
    'nested': {'a': {'b': [1, 2, 3], 'c': 'x'}},
}


def with_(d, **changes):
    out = json.loads(json.dumps(d))
    out.update(changes)
    return out


# (name, base, mine, theirs, what mine's changes make of theirs)
CASES = [
    ('log waste while someone else logs waste',
     BASE, with_(BASE, entries=BASE['entries'] + [{'ts': 3, 'name': 'Strips', 'qty': 1, 'cost': 2}]),
     with_(BASE, entries=BASE['entries'] + [{'ts': 4, 'name': 'Cookie', 'qty': 1, 'cost': 1}]),
     with_(BASE, entries=BASE['entries'] + [{'ts': 4, 'name': 'Cookie', 'qty': 1, 'cost': 1},
                                            {'ts': 3, 'name': 'Strips', 'qty': 1, 'cost': 2}])),
    ('assign different positions at once',
     BASE, with_(BASE, posAssignments=dict(BASE['posAssignments'], **{'foh||2026-09-28||Lunch||Bagging': 'Mia'})),
     with_(BASE, posAssignments=dict(BASE['posAssignments'], **{'foh||2026-09-28||Lunch||iPOS 1': 'Leo'})),
     with_(BASE, posAssignments={'foh||2026-09-28||Lunch||iPOS 1': 'Leo', 'foh||2026-09-28||Lunch||Drinks 1': 'Avah',
                                 'foh||2026-09-28||Lunch||Bagging': 'Mia'})),
    ('same position: the later change wins',
     BASE, with_(BASE, posAssignments=dict(BASE['posAssignments'], **{'foh||2026-09-28||Lunch||iPOS 1': 'Sam'})),
     with_(BASE, posAssignments=dict(BASE['posAssignments'], **{'foh||2026-09-28||Lunch||iPOS 1': 'Leo'})),
     with_(BASE, posAssignments=dict(BASE['posAssignments'], **{'foh||2026-09-28||Lunch||iPOS 1': 'Sam'}))),
    ('delete an entry someone else just added next to',
     BASE, with_(BASE, entries=[BASE['entries'][1]]),
     with_(BASE, entries=BASE['entries'] + [{'ts': 5}]),
     with_(BASE, entries=[BASE['entries'][1], {'ts': 5}])),
    ('unassign while someone assigns elsewhere',
     BASE, with_(BASE, posAssignments={'foh||2026-09-28||Lunch||Drinks 1': 'Avah'}),
     with_(BASE, posAssignments=dict(BASE['posAssignments'], x='Kai')),
     with_(BASE, posAssignments={'foh||2026-09-28||Lunch||Drinks 1': 'Avah', 'x': 'Kai'})),
    ('reorder a list: saved whole',
     BASE, with_(BASE, wasteDays=['2026-09-27', '2026-09-26']),
     with_(BASE, wasteDays=['2026-09-26', '2026-09-27', '2026-09-28']),
     with_(BASE, wasteDays=['2026-09-27', '2026-09-26'])),
    ('edit one field of a record', BASE,
     with_(BASE, entries=[dict(ENTRY, qty=3, cost=14.25), BASE['entries'][1]]),
     BASE, with_(BASE, entries=[dict(ENTRY, qty=3, cost=14.25), BASE['entries'][1]])),
    ('same day added by both: kept once',
     BASE, with_(BASE, wasteDays=BASE['wasteDays'] + ['2026-09-28']),
     with_(BASE, wasteDays=BASE['wasteDays'] + ['2026-09-28']),
     with_(BASE, wasteDays=BASE['wasteDays'] + ['2026-09-28'])),
    ('insert at the front', BASE, with_(BASE, wasteDays=['2026-09-25'] + BASE['wasteDays']), BASE,
     with_(BASE, wasteDays=['2026-09-25'] + BASE['wasteDays'])),
    ('type change', BASE, with_(BASE, formDone={'at': 1}), BASE, with_(BASE, formDone={'at': 1})),
    ('new key and removed key', BASE, {k: v for k, v in with_(BASE, newKey=[1]).items() if k != 'nested'}, BASE,
     {k: v for k, v in with_(BASE, newKey=[1]).items() if k != 'nested'}),
    ('duplicates in a list', {'l': [1, 1, 2]}, {'l': [1, 2, 1, 1]}, {'l': [1, 1, 2]}, {'l': [1, 2, 1, 1]}),
    ('keys that look special', {'o': {}}, {'o': {'constructor': 1, 'toString': 'x'}}, {'o': {}},
     {'o': {'constructor': 1, 'toString': 'x'}}),
]


def rand_value(rng, depth=0):
    kind = rng.random()
    if depth > 2 or kind < 0.35:
        return rng.choice([0, 1, 2, 2.5, -3, 'a', 'b', 'Josh', '', True, False, None])
    if kind < 0.65:
        return [rand_value(rng, depth + 1) for _ in range(rng.randint(0, 5))]
    return {rng.choice('abcdefg'): rand_value(rng, depth + 1) for _ in range(rng.randint(0, 4))}


def mutate(rng, value, depth=0):
    if isinstance(value, dict):
        out = dict(value)
        for _ in range(rng.randint(0, 3)):
            r = rng.random()
            keys = list(out)
            if r < 0.3 or not keys:
                out[rng.choice('abcdefgh')] = rand_value(rng, depth + 1)
            elif r < 0.5:
                del out[rng.choice(keys)]
            else:
                k = rng.choice(keys)
                out[k] = mutate(rng, out[k], depth + 1)
        return out
    if isinstance(value, list):
        out = list(value)
        for _ in range(rng.randint(0, 3)):
            r = rng.random()
            if r < 0.35:
                out.insert(rng.randint(0, len(out)), rand_value(rng, depth + 1))
            elif r < 0.6 and out:
                out.pop(rng.randrange(len(out)))
            elif r < 0.7 and len(out) > 1:
                rng.shuffle(out)
            elif out:
                i = rng.randrange(len(out))
                out[i] = mutate(rng, out[i], depth + 1)
        return out
    return rand_value(rng, depth) if rng.random() < 0.5 else value


def fuzz_cases(n, seed=7):
    rng = random.Random(seed)
    cases = []
    for _ in range(n):
        base = {k: rand_value(rng) for k in 'pqrs'}
        cases.append((base, mutate(rng, base), mutate(rng, base)))
    return cases


def run_page(cases):
    body = json.dumps({'cases': [{'base': b, 'mine': m, 'theirs': t} for b, m, t in cases]})
    done = subprocess.run([NODE, os.path.join(ROOT, 'tests', 'patch_runner.js')],
                          input=body, capture_output=True, text=True, check=True)
    return json.loads(done.stdout)


@unittest.skipUnless(NODE, 'Node.js not installed')
class PatchAgreementTest(unittest.TestCase):
    def check(self, cases, expected=None):
        results = run_page(cases)
        for n, ((base, mine, theirs), got) in enumerate(zip(cases, results)):
            label = expected[n][0] if expected else f'fuzz #{n}'
            ops = got['ops']
            self.assertEqual(canon(got['onBase']), canon(mine), f'{label}: page result')
            self.assertEqual(canon(apply_ops(base, ops)), canon(mine), f'{label}: server result')
            self.assertEqual(canon(got['onBaseTwice']), canon(mine), f'{label}: applying twice')
            self.assertEqual(canon(apply_ops(apply_ops(base, ops), ops)), canon(mine), f'{label}: server twice')
            self.assertEqual(canon(apply_ops(theirs, ops)), canon(got['onTheirs']), f'{label}: page and server agree')
            self.assertTrue(got['baseUntouched'])
            if expected:
                self.assertEqual(canon(apply_ops(theirs, ops)), canon(expected[n][1]), f'{label}: merged result')

    def test_cases(self):
        self.check([(b, m, t) for _, b, m, t, _ in CASES], [(name, want) for name, _, _, _, want in CASES])

    def test_random_changes(self):
        self.check(fuzz_cases(600))

    def test_small_changes_send_little(self):
        big = {'entries': [dict(ENTRY, ts=i) for i in range(800)], 'posAssignments': {f'k{i}': 'Josh' for i in range(400)}}
        mine = json.loads(json.dumps(big))
        mine['entries'].append(dict(ENTRY, ts=9999))
        mine['posAssignments']['k7'] = 'Avah'
        ops = run_page([(big, mine, big)])[0]['ops']
        self.assertLess(len(json.dumps(ops)), 400)
        self.assertGreater(len(json.dumps(big)), 60000)


class ServerApplyTest(unittest.TestCase):
    def test_does_not_modify_input(self):
        base = json.loads(json.dumps(BASE))
        apply_ops(base, [{'o': 'set', 'p': ['nested', 'a', 'c'], 'v': 'y'},
                         {'o': 'arr', 'p': ['wasteDays'], 'rm': [{'v': '2026-09-26', 'n': 0}]}])
        self.assertEqual(base, BASE)

    def test_paths_through_missing_or_replaced_objects(self):
        self.assertEqual(apply_ops({'a': 5}, [{'o': 'set', 'p': ['a', 'b'], 'v': 1}]), {'a': {'b': 1}})
        self.assertEqual(apply_ops({}, [{'o': 'del', 'p': ['a', 'b']}]), {})
        self.assertEqual(apply_ops({'a': {'l': 'x'}}, [{'o': 'arr', 'p': ['a', 'l'], 'add': [{'v': 1, 'n': 1, 'i': 0}]}]),
                         {'a': {'l': [1]}})


if __name__ == '__main__':
    unittest.main()
