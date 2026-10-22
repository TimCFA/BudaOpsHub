"""One upload for the schedule build's reports (Tim, Oct 19 2026): the zip of
reports the schedule is built from can be dropped on Manage → Uploads. It is
opened on the device; each report the hub reads is filed by its usual
reader, rosters queue one review at a time (a week that's over is left
out), the calendar picture waits to be read into Events, and the reports
only the schedule build uses are set aside by name.

Run: python3 -m unittest discover tests   (the logic runs in node)
"""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const js = n => fs.readFileSync(process.argv[1] + '/static/js/' + n, 'utf8');
const ctx = {console, today: '2026-10-20', document: {getElementById: () => null}, window: {},
  toLocalISODate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`};
vm.createContext(ctx);
const wr = js('weekly-roster-import.js');
vm.runInContext(wr.match(/function weeklyRosterStartFromFileName\([\s\S]*?\n}\n/)[0], ctx);
vm.runInContext(js('upload-bundle.js'), ctx);
const f = name => ({name});
const curve = 'x\t\tTotal\nx\t\tSales Metric (Export)\tSecondary Metric\n1130\t11:30 AM\t812.40\t0.12\n';
const out = vm.runInContext(`(() => {
  const so = (n, t) => { const r = duScheduleOnly({name: n}, t || ''); return r ? r.skip : null; };
  return {
    base: [duBundleBaseName('1454f331-Sales_Curve_11.pdf'), duBundleBaseName('dir/Weekly_Roster_10182026_10242026_4.csv'), duBundleBaseName('Sales_Mix_2026-10-18.csv')],
    aside: [so('a9163233-AvailabilityReportNov_2_202611YYYY.csv'), so('ed78f92a-HotSchedules_-_Online_employee_scheduling.pdf'),
      so('1454f331-Sales_Curve_11.pdf'), so('c0ffb93d-Labor_Cost_5.pdf'), so('cf64cc7e-Productivity_51.pdf'), so('faa3eb94-Daily_Detail_5.pdf'),
      so('55b8f1c7-positional-ratings-2026-10-19.pdf'), so('README.txt'), so('SHA256_MANIFEST.txt'), so('87578639-CSV_DOWNLOAD_99.csv', ${JSON.stringify(curve)})],
    read: [so('70b95c11-Weekly_Roster_10182026_10242026_4.csv', 'Employee,Phone,Sun Shift'), so('e04ac7c5-tpActualVsScheduledVarianceAction_10.pdf'),
      so('CSV_DOWNLOAD_7.csv', 'Date,Total\\n10/18/2026,25000'), so('Productivity_by_hour.csv', 'Total | Daypart | Productivity'), so('Sales_Mix_Items_10-18.csv')],
    over: [duRosterWeekOver({name: 'Weekly_Roster_10112026_10172026_9.csv'}), duRosterWeekOver({name: 'Weekly_Roster_10182026_10242026_4.csv'}),
      duRosterWeekOver({name: 'Weekly_Roster_11012026_11072026.csv'}), duRosterWeekOver({name: 'roster.csv'})],
  };
})()`, ctx);
process.stdout.write(JSON.stringify(out));
"""


def run():
    out = subprocess.run(['node', '-e', RUNNER, ROOT], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


class WhatGoesWhere(unittest.TestCase):
    def test_upload_ids_come_off_the_names(self):
        self.assertEqual(run()['base'], ['Sales_Curve_11.pdf', 'Weekly_Roster_10182026_10242026_4.csv', 'Sales_Mix_2026-10-18.csv'])

    def test_schedule_build_reports_are_set_aside_by_name(self):
        self.assertEqual(run()['aside'], ['HotSchedules availability', 'HotSchedules time off & requests',
                                          None, None, None,
                                          None, 'Levelset PEA ratings (PDF)', 'Bundle notes', 'Bundle notes', None])
        # Daily Detail, the 15-minute sales and (Oct 22 2026) the Sales Curve,
        # Labor Cost and Productivity PDFs are read now (test_analytics_reports.py).

    def test_reports_the_hub_reads_go_to_their_readers(self):
        # Rosters, the punch report, a by-day sales export, a productivity
        # CSV and Sales Mix are not set aside.
        self.assertEqual(run()['read'], [None, None, None, None, None])

    def test_a_week_thats_over_is_left_out(self):
        # Today is Tue Oct 20: Oct 11–17 is over; Oct 18–24 and Nov 1–7 are not.
        self.assertEqual(run()['over'], [True, False, False, False])


class Wiring(unittest.TestCase):
    def test_the_drop_opens_a_bundle_and_files_each_report(self):
        du = read('static', 'js', 'data-uploads.js')
        self.assertIn("if(typeof duOpenBundle === 'function' && files.some(f => /\\.zip$/i.test(f.name))){", du)
        self.assertIn("const aside = fromBundle.has(file) ? duScheduleOnly(file, text) : null;", du)
        self.assertIn("duRosterQueue.push({file: job.file, text: job.text, i: job.i});", du)
        self.assertIn("${r.action.skipRoster ? 'data-du-skip-roster' : 'data-du-evi'}=\"${escapeHtml(r.action.key)}\"", du)
        self.assertIn("if(skip && typeof duRosterSkipQueued === 'function'){ duRosterSkipQueued(Number(skip.dataset.duSkipRoster)); return; }", du)
        ub = read('static', 'js', 'upload-bundle.js')
        # A zip of only PDFs (Smart Shop from Ops Hub) keeps its old reader.
        self.assertIn("if(!entries.length || entries.every(e => /\\.pdf$/i.test(e.name))) return null;", ub)
        self.assertIn("const DU_JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';", ub)
        self.assertIn('<script src="/static/js/data-uploads.js"></script>\n<script src="/static/js/upload-bundle.js"></script>', read('cfa-buda-ops-hub-complete.html'))

    def test_the_next_roster_opens_when_one_is_saved_or_skipped(self):
        wr = read('static', 'js', 'weekly-roster-import.js')
        self.assertEqual(wr.count("duRosterNext()"), 2)              # the shared skip helper and after Confirm & Save
        self.assertIn('>Skip this week (don’t apply)</button>', wr)
        self.assertIn("if(typeof duRosterDone === 'function') duRosterDone(false);", wr)
        self.assertIn("if(typeof duRosterDone === 'function') duRosterDone(true,", wr)
        self.assertIn("if(typeof duRosterSkipAll === 'function') duRosterSkipAll();", wr)


class SkipARoster(unittest.TestCase):
    """Tim, Oct 20 2026: a bundle carried outdated HotSchedules rosters he
    didn't want applied, while every other report in it should be. Each
    roster review can be skipped, so can one waiting its turn, or all."""

    RUN = r'''
const fs = require('fs'), vm = require('vm');
const ctx = {console, document: {getElementById: () => null}, setTimeout: f => f(), opened: [], renders: 0};
vm.createContext(ctx);
vm.runInContext(`function duImportRoster(file){ opened.push(file.name); return ''; }
  function renderDataUploads(){ renders++; } let duResults = [];`, ctx);
vm.runInContext(fs.readFileSync(process.argv[1], 'utf8'), ctx);
process.stdout.write(JSON.stringify(vm.runInContext(`(() => {
  const f = n => ({name: n});
  duResults = ['a', 'b', 'c', 'd'].map(n => ({file: n + '.csv', state: 'waiting', text: ''}));
  const out = [];
  const snap = () => duResults.map(r => r.state + ':' + r.text.split(':')[0]);
  // a opens; b, c and d wait their turn.
  duOpenRoster({i: 0, file: f('a.csv'), text: ''});
  [1, 2, 3].forEach(i => duRosterQueue.push({i, file: f(['a', 'b', 'c', 'd'][i] + '.csv'), text: ''}));
  out.push(snap());
  // c is skipped from the list before it opens; a is saved; b opens next.
  duRosterSkipQueued(2);
  duRosterDone(true, 'Oct 19 – Oct 25'); duRosterNext();
  out.push(snap(), opened.slice());
  // b is skipped in its review; d opens; then "skip all" leaves d out too.
  duRosterDone(false); duRosterNext();
  out.push(snap(), opened.slice());
  duRosterSkipAll();
  out.push(snap(), duRosterQueue.length, duRosterOpen);
  return out;
})()`, ctx)));
'''

    def test_skip_one_skip_a_waiting_one_skip_all(self):
        import json
        import subprocess
        out = json.loads(subprocess.run(['node', '-e', self.RUN, os.path.join(ROOT, 'static', 'js', 'upload-bundle.js')],
                                        capture_output=True, text=True, check=True).stdout)
        self.assertEqual(out[0], ['waiting:Open for review', 'waiting:', 'waiting:', 'waiting:'])
        self.assertEqual(out[1], ['ok:Saved', 'waiting:Open for review', 'skip:Skipped', 'waiting:'])
        self.assertEqual(out[2], ['a.csv', 'b.csv'])
        self.assertEqual(out[3], ['ok:Saved', 'skip:Skipped', 'skip:Skipped', 'waiting:Open for review'])
        self.assertEqual(out[4], ['a.csv', 'b.csv', 'd.csv'])
        self.assertEqual(out[5:], [['ok:Saved', 'skip:Skipped', 'skip:Skipped', 'skip:Skipped'], 0, None])

    def test_a_screenshot_calendar_gets_a_second_look(self):
        evi = read('static', 'js', 'events-import.js')
        self.assertIn('const grid = eviFindGrid(data, W, H) || eviFindGrid(data, W, H, true);', evi)
        self.assertIn('r < (light ? 222 : 175)', evi)


if __name__ == '__main__':
    unittest.main()
