"""Zone Reset page flow (Tim, Oct 18 2026): the intro matches the page (the
Walkthroughs it used to mention are hidden), and a zone's last tick closes
the zone and says what's left. Checked in a headless browser when made;
this pins the wiring.

Run: python3 -m unittest discover tests
"""
import os
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


class ZoneResetFlow(unittest.TestCase):
    def test_intro_matches_the_page(self):
        page = read('cfa-buda-ops-hub-complete.html')
        intro = page.split('id="zoneresetView"')[1].split('</p>')[0]
        self.assertNotIn('Walkthroughs', intro)
        self.assertIn('the zone closes itself when its list is done', intro)

    def test_last_tick_closes_the_zone(self):
        js = read('static', 'js', 'zone-reset.js')
        self.assertIn("bucket[itemText] = {initials, ts: Date.now()};\n    zrNoteZoneDone(daypart, zoneName);", js)
        body = js.split('function zrNoteZoneDone(daypart, zoneName){')[1].split('\n}\n')[0]
        self.assertIn("if(!total || checked < total) return;", body)      # unticking never closes it
        self.assertIn("currentChecklistZone = '';", body)
        self.assertIn("every zone reset", body)


if __name__ == '__main__':
    unittest.main()
