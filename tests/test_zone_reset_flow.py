"""Zone Reset page flow (Tim, Oct 18 2026): the intro matches the page (the
Walkthroughs it used to mention are hidden), and a zone's last tick closes
the zone and says what's left, and the page opens on the handoff happening
now. Checked in a headless browser when made;
this pins the wiring.

Run: python3 -m unittest discover tests
"""
import json
import os
import subprocess
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


class ZoneResetFlow(unittest.TestCase):
    def test_the_list_comes_first(self):
        """Tim, Oct 28 2026: no intro box at the top; the pills, then the list."""
        page = read('cfa-buda-ops-hub-complete.html')
        view = page.split('id="zoneresetView"')[1].split('<div class="view"')[0]
        self.assertNotIn('section-intro', view)
        self.assertLess(view.index('data-launch-subnav'), view.index('id="zoneResetCard"'))
        self.assertIn('root.appendChild(hint);', read('static', 'js', 'launch-mode.js'))   # the sign-in line goes last

    def test_last_tick_closes_the_zone(self):
        js = read('static', 'js', 'zone-reset.js')
        self.assertIn("bucket[itemText] = {initials, ts: Date.now()};\n    zrNoteZoneDone(daypart, zoneName);", js)
        body = js.split('function zrNoteZoneDone(daypart, zoneName){')[1].split('\n}\n')[0]
        self.assertIn("if(!total || checked < total) return;", body)      # unticking never closes it
        self.assertIn("currentChecklistZone = '';", body)
        self.assertIn("every zone reset", body)

    def test_opens_on_the_current_handoff(self):
        js = read('static', 'js', 'zone-reset.js')
        self.assertIn("if(!zoneHandoffChosen) currentZoneDaypart = zrCurrentHandoff();", js)
        self.assertNotIn("if(!zoneHandoffChosen) currentZoneDaypart = '';", js)
        # A tapped zone pins its handoff, so a re-render as the clock moves on doesn't switch it.
        self.assertIn("currentChecklistZone = opening ? zoneName : '';\n    zoneHandoffChosen = true;", js)

    def test_current_handoff_first_then_the_rest_of_the_day(self):
        js = read('static', 'js', 'zone-reset.js')
        dayparts = js[js.index('const zoneResetDayparts'):js.index('const fohPositions')]
        fn = js[js.index('function zrHandoffOrder'):js.index('function zrHandoffBannersHtml')]
        script = dayparts + fn + "\nconsole.log(JSON.stringify(['Mid to Dinner (4:00pm - 5:00pm)', 'Breakfast to Lunch (10:30am - 11:30am)', 'Close', 'nope'].map(n => zrHandoffOrder(n).map(i => zoneResetDayparts[i].name.split(' (')[0]))));"
        out = subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(out.stdout), [
            ['Mid to Dinner', 'Dinner to Late Night', 'Close', 'Breakfast to Lunch', 'Lunch to Mid'],
            ['Breakfast to Lunch', 'Lunch to Mid', 'Mid to Dinner', 'Dinner to Late Night', 'Close'],
            ['Close', 'Breakfast to Lunch', 'Lunch to Mid', 'Mid to Dinner', 'Dinner to Late Night'],
            ['Breakfast to Lunch', 'Lunch to Mid', 'Mid to Dinner', 'Dinner to Late Night', 'Close'],
        ])

    def test_open_banner_keeps_its_corners(self):
        self.assertIn('.zr-dp-list .su-dp.is-open .su-dp-head{border-radius:14px;}', read('static', 'css', 'theme-cfa.css'))


if __name__ == '__main__':
    unittest.main()
