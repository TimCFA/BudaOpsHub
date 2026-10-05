"""Dragging a name to another spot on Set Ups (suMoveSpot in
static/js/setups-board.js), run in node."""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, 'tests', 'setup_drag_runner.js')
K = 'foh||2026-10-06||Lunch (10:30-1:00)||'


def move(assignments, frm, to, flags=None):
    case = {'assignments': assignments, 'flags': flags or {}, 'from': K + frm, 'to': K + to}
    out = subprocess.run(['node', RUNNER], input=json.dumps({'cases': [case]}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[0]


class DragMove(unittest.TestCase):
    def test_to_an_open_spot_moves_the_person(self):
        r = move({K + 'iPOS 1': 'Ava Morales'}, 'iPOS 1', 'iPOS 4')
        self.assertEqual(r['assignments'], {K + 'iPOS 4': 'Ava Morales'})
        self.assertEqual(r['result'], {'moving': 'Ava Morales', 'there': None})

    def test_onto_a_filled_spot_trades(self):
        r = move({K + 'iPOS 1': 'Ava Morales', K + 'Runner': 'Noah Bennett'}, 'iPOS 1', 'Runner')
        self.assertEqual(r['assignments'], {K + 'iPOS 1': 'Noah Bennett', K + 'Runner': 'Ava Morales'})

    def test_a_handoff_moves_whole(self):
        r = move({K + 'iPOS 1': 'Priya Nair/Mateo Cruz', K + 'Runner': 'Noah Bennett'}, 'iPOS 1', 'Runner')
        self.assertEqual(r['assignments'][K + 'Runner'], 'Priya Nair/Mateo Cruz')

    def test_coverage_flags_clear_on_both_spots(self):
        flags = {K + 'iPOS 1': {'flaggedBy': 'MT'}, K + 'Runner': {'flaggedBy': 'MT'}, K + 'Host': {'flaggedBy': 'MT'}}
        r = move({K + 'iPOS 1': 'Ava Morales', K + 'Runner': 'Noah Bennett'}, 'iPOS 1', 'Runner', flags)
        self.assertEqual(list(r['flags']), [K + 'Host'])

    def test_an_open_spot_or_itself_changes_nothing(self):
        start = {K + 'iPOS 1': 'Ava Morales'}
        for frm, to in (('Runner', 'iPOS 1'), ('iPOS 1', 'iPOS 1')):
            r = move(start, frm, to)
            self.assertIsNone(r['result'])
            self.assertEqual(r['assignments'], start)


if __name__ == '__main__':
    unittest.main()
