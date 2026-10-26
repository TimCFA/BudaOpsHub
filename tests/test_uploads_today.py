"""Today's uploads (Tim, Oct 23 2026): Manage → Uploads opens on the day's
list, every report due or behind plus the ones brought in today, ticked;
when nothing's left, a word of thanks in the house style, one a day.

Run: python3 -m unittest discover tests
"""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const js = fs.readFileSync(process.argv[1], 'utf8');
const c = {today: '2026-10-23', dataUploadLog: {}, escapeHtml: s => String(s).replace(/[&<>"']/g, ch => '&#' + ch.charCodeAt(0) + ';'),
  toLocalISODate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`};
vm.createContext(c);
vm.runInContext(js.slice(js.indexOf('const DU_ICON = {'), js.indexOf('// What needs a look first')), c);
vm.runInContext(js.slice(js.indexOf("// ----- Today's uploads"), js.indexOf('function renderDataUploads(){')), c);
process.stdout.write(JSON.stringify(vm.runInContext('(' + process.argv[2] + ')', c)()));
"""


def run(op):
    out = subprocess.run(['node', '-e', RUNNER, os.path.join(ROOT, 'static', 'js', 'data-uploads.js'), op], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


ROWS = """const at = new Date('2026-10-23T09:14:00');
  dataUploadLog = {punch: [{at: at.toISOString()}], cem: [{at: new Date('2026-10-20T09:00:00').toISOString()}]};
  const row = (key, name, status, freq) => ({src: {key, name}, st: {status, freq}, pending: false});"""


class Today(unittest.TestCase):
    def test_the_days_list_ticks_off(self):
        html = run("() => { " + ROWS + """
          return duTodayHtml([row('punch', 'Punch report', 'fresh', 'daily'), row('cem', 'CEM guest scores', 'fresh', 'weekly'),
            row('sos', 'Speed of service', 'overdue', 'monthly'), row('roster', 'Roster', 'due', 'weekly')], {overdue: 1, due: 1, fresh: 2}, 'Last upload Oct 23'); }""")
        self.assertIn("Today’s uploads", html)
        self.assertIn('2 to go, 1 done.', html)
        self.assertIn('<b>1/3</b>', html)                                  # CEM was current before today: not on the list
        self.assertNotIn('CEM guest scores', html)
        self.assertIn('Speed of service</span>\n          <small>Behind</small>', html)
        self.assertIn('Roster</span>\n          <small>Due this week</small>', html)
        self.assertRegex(html, r'class="is-done">[\s\S]*Punch report</span>\s*<small>Done 9:14')
        # Each line goes to its report's card; the done ones fold away.
        self.assertIn('<button type="button" class="du-today-item" data-du-goto="sos"', html)
        self.assertIn('<details class="du-today-fold" ><summary>1 done today</summary>', html)
        self.assertLess(html.index('data-du-goto="sos"'), html.index('<details class="du-today-fold"'))

    def test_done_ones_newest_first(self):
        html = run("() => { " + ROWS + """
          dataUploadLog.sos = [{at: new Date('2026-10-23T11:02:00').toISOString()}];
          dataUploadLog.cem = [{at: new Date('2026-10-23T07:40:00').toISOString()}];
          return duTodayHtml([row('punch', 'Punch report', 'fresh', 'daily'), row('cem', 'CEM guest scores', 'fresh', 'weekly'),
            row('sos', 'Speed of service', 'fresh', 'monthly'), row('qiv', 'QIV visit', 'due', 'quarterly')], {overdue: 0, due: 1, fresh: 3}, ''); }""")
        self.assertIn('QIV visit</span>\n          <small>Due this quarter</small>', html)
        self.assertIn('<summary>3 done today</summary>', html)
        names = [m for m in ('Speed of service', 'Punch report', 'CEM guest scores')]
        self.assertEqual(sorted(names, key=html.index), ['Speed of service', 'Punch report', 'CEM guest scores'])   # 11:02, 9:14, 7:40

    def test_up_to_date_by_last_upload(self):
        got = run("""() => {
          const r = (key, last) => ({src: {key}, st: {last: last ? new Date(last) : null}});
          const rank = k => ['a', 'b', 'c', 'd'].indexOf(k);
          return duByLastUpload([r('a', '2026-10-20T09:00:00'), r('b', null), r('c', '2026-10-23T09:00:00'), r('d', null)], rank).map(x => x.src.key); }""")
        self.assertEqual(got, ['c', 'a', 'b', 'd'])

    def test_all_caught_up(self):
        got = run("() => { " + ROWS + """
          return {html: duTodayHtml([row('punch', 'Punch report', 'fresh', 'daily'), row('cem', 'CEM guest scores', 'fresh', 'weekly')], {overdue: 0, due: 0, fresh: 2}, ''),
            line: duCaughtUpLine('2026-10-23'), again: duCaughtUpLine('2026-10-23'), days: new Set(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'].map(duCaughtUpLine)).size,
            all: DU_CAUGHT_UP}; }""")
        self.assertIn('class="du-today is-done"', got['html'])
        self.assertIn('All caught up!', got['html'])
        self.assertIn(got['line'].replace('’', '’'), got['html'])
        self.assertIn('<summary>1 uploaded today</summary>', got['html'])  # the ticks fold away
        self.assertEqual(got['line'], got['again'])                          # the same line all day
        self.assertGreater(got['days'], 1)                                    # and a new one most days
        for line in got['all']:
            self.assertNotRegex(line, r'[\U0001F300-\U0001FAFF]')            # words, never emoji


if __name__ == '__main__':
    unittest.main()
