import re
import unittest
from pathlib import Path

SRC = (Path(__file__).resolve().parent.parent / 'static' / 'js' / 'leaders.js').read_text()


class CemGoalsAreTopFive(unittest.TestCase):
    # Tim, Oct 23 2026: the CEM goal is the top 5%, not +2 pts above the top 20%.
    def test_no_top_twenty_goal_left(self):
        cards = SRC.split('const LD_CARDS = {')[1].split('\n};')[0]
        self.assertNotIn('top 20%', cards.replace('not +2 pts above the top 20%', ''))
        self.assertEqual(len(re.findall(r'at top 5% or better', cards)), 5)


if __name__ == '__main__':
    unittest.main()
