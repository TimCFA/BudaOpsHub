"""The tab line's order on the simplified site (Tim, Oct 30 2026): Home, Set
Ups, Lists, Waste, Calendar, Schedule, Tasks, Forms, Manage. Our Team,
Directors and Roles show only to the people they're for, and keep their
places among these.

Run: python3 -m unittest discover tests
"""
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class TabOrder(unittest.TestCase):
    def test_tims_order(self):
        with open(os.path.join(ROOT, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
            page = f.read()
        row = page[page.index('<div class="tabs" role="tablist">'):page.index('</div>\n  </div>', page.index('<div class="tabs" role="tablist">'))]
        tabs = re.findall(r'<button type="button" class="tab( [\w -]+)?"[^>]*data-view="(\w+)"[^>]*>([^<]+)', row)
        shown = [name.strip() for cls, view, name in tabs
                 if not re.search(r'full-only|hc-only|manager-only', cls or '') and view != 'roles']
        self.assertEqual(shown, ['Home', 'Set Ups', 'Lists', 'Waste', 'Calendar', 'Schedule', 'Tasks', 'Forms', 'Manage'])


if __name__ == '__main__':
    unittest.main()
