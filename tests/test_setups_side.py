"""Who's on the schedule in a Set Ups daypart, on the side asked about
(Tim, Oct 20 2026): Home's Right Now asks about FOH and BOH, but the roster
came from whichever side the Set Ups page showed, so FOH people were counted
against BOH positions ("14 on the clock with no spot" with Set Ups on FOH,
7 with it on BOH, when everyone was placed).

Run: python3 -m unittest discover tests
Names are made up.
"""
import json
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


class TheSideAskedAbout(unittest.TestCase):
    def test_available_for_daypart_reads_the_side_given(self):
        src = read('static', 'js', 'daypicker-and-positions.js')
        fn = re.search(r'function availableForDaypart\([\s\S]*?\n}\n', src).group(0)
        run = r'''
const vm = require('vm'); const ctx = {};
vm.createContext(ctx);
vm.runInContext(`let currentPosSection = 'foh';
  const fohRoster = {d: [{name: 'Ana Front', start: 0, end: 600}]}, bohRoster = {d: [{name: 'Sam Back', start: 0, end: 600}]};
  function daypartTimeWindow(){ return {startMin: 60, endMin: 120}; }
  function rosterOverlaps(p, s, e){ return p.start < e && p.end > s; }` + process.argv[1], ctx);
process.stdout.write(JSON.stringify(vm.runInContext(`[
  availableForDaypart('d', 0, [], 'boh').map(p => p.name),
  availableForDaypart('d', 0, [], 'foh').map(p => p.name),
  availableForDaypart('d', 0, []).map(p => p.name)]`, ctx)));'''
        out = json.loads(subprocess.run(['node', '-e', run, fn], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(out, [['Sam Back'], ['Ana Front'], ['Ana Front']])     # no side: the page's, as before

    def test_every_caller_that_knows_its_side_passes_it(self):
        calls = []
        for f in os.listdir(os.path.join(ROOT, 'static', 'js')):
            if f.endswith('.js'):
                calls += [(f, m) for m in re.findall(r'availableForDaypart\(([^;]*?)\)(?:\.|;|\s)', read('static', 'js', f))]
        self.assertTrue(calls)
        for f, args in calls:
            if args.startswith('dayName, dpIndex, dayparts, side'):
                continue                                         # the definition
            self.assertRegex(args, r", (section|'foh')$", f'{f}: availableForDaypart({args})')
        self.assertIn('const onShift = availableForDaypart(date, dpIndex, suDaypartsFor(section), section);', read('static', 'js', 'setups-board.js'))
