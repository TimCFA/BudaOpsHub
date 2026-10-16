"""Set Ups: which open spots are red ("needed"). Within the headcount, and
also any open spot above a filled one, so a skipped spot always shows red
(Tim, Oct 16 2026: iPOS 8 LANE 2 open at #24 with DT Bagger 4 filled at #25
showed a plain dash)."""
import json
import os
import re
import shutil
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE = shutil.which('node')


def needed(filled_ranks, total, headcount):
    with open(os.path.join(ROOT, 'static', 'js', 'setups-board.js'), encoding='utf-8') as f:
        js = f.read()
    rule = re.search(r'  const lastFilled = .*?\n  tiles\.forEach\(t => \{ t\.needed = .*?\}\);\n', js, re.S).group(0)
    tiles = [{'rank': r, 'names': ['X'] if r in filled_ranks else []} for r in range(1, total + 1)]
    code = f"const tiles = {json.dumps(tiles)}; const headcount = {headcount};\n{rule}\nprocess.stdout.write(JSON.stringify(tiles.filter(t => t.needed).map(t => t.rank)));"
    return json.loads(subprocess.run([NODE, '-e', code], capture_output=True, text=True, check=True).stdout)


@unittest.skipUnless(NODE, 'Node.js not installed')
class Needed(unittest.TestCase):
    def test_skipped_spot_past_the_headcount_is_red(self):
        # 21 on shift; #21 and #24 open, #25 filled: both open spots are red.
        filled = set(range(1, 26)) - {21, 24}
        self.assertEqual(needed(filled, 30, 21), [21, 24])

    def test_open_spots_below_the_last_filled_stay_plain(self):
        self.assertEqual(needed({1, 2, 3}, 10, 3), [])
        self.assertEqual(needed({1, 3}, 10, 3), [2])

    def test_no_headcount_still_flags_a_skip(self):
        self.assertEqual(needed({1, 4}, 6, 0), [2, 3])
        self.assertEqual(needed(set(), 6, 0), [])

    def test_within_the_headcount_unchanged(self):
        self.assertEqual(needed({1, 2}, 8, 4), [3, 4])


if __name__ == '__main__':
    unittest.main()
