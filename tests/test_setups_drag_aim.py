"""A finger drag on Set Ups lands on the spot under the floating name (Tim,
Nov 11 2026: dragging someone onto another position "swapped random different
positions"). The floating name rode above the fingertip, but the spot under
the fingertip took the drop: a row below the one the name was put on. Now the
spot under the floating name takes it (under the fingertip only where the
name is over no spot); the name starts under the finger and lifts as the
finger moves, so a hold that goes nowhere changes nothing. A mouse aims with
its pointer, as before.

Checked by hand on an emulated iPad (list and board layouts); these pin the wiring.

Run: python3 -m unittest discover tests
"""
import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class DragAim(unittest.TestCase):
    def setUp(self):
        with open(os.path.join(ROOT, 'static', 'js', 'setups-board.js'), encoding='utf-8') as f:
            self.js = f.read()

    def test_the_spot_under_the_floating_name_takes_the_drop(self):
        target = self.js[self.js.index('function suDragTarget(){'):self.js.index('function suDragStart(){')]
        self.assertIn("if(!d.mouse && d.ghost){\n    const r = d.ghost.getBoundingClientRect();\n    hit = suDragTileAt(r.left + r.width / 2, r.top + r.height / 2);", target)
        self.assertIn('if(!hit) hit = suDragTileAt(d.x, d.y);', target)                    # no spot under the name: the fingertip's
        self.assertIn("return hit === 'source' ? null : hit;", target)                     # back on its own spot: nothing moves
        self.assertIn("if(tile.dataset.suTile === suDrag.slot) return 'source';", self.js)
        self.assertIn('const over = suDragTarget();', self.js)
        self.assertEqual(self.js.count('suDragTileAt(d.x, d.y)'), 1)

    def test_the_name_lifts_as_the_finger_moves(self):
        self.assertIn('const SU_DRAG_LIFT = 38;', self.js)
        self.assertIn('const lift = d.mouse ? SU_DRAG_LIFT : Math.min(SU_DRAG_LIFT, Math.hypot(d.x - d.x0, d.y - d.y0));', self.js)
        self.assertIn('Math.round(d.y - 18 - lift)}px)', self.js)


if __name__ == '__main__':
    unittest.main()
