"""The Manage tab's shape (Tim, Oct 2026): one section at a time, picked by
the chips, every form saving as you go, and each kind of data with one home."""
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

with open(os.path.join(ROOT, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
    PAGE = f.read()
MANAGE = PAGE[PAGE.index('id="manageContent"'):PAGE.index('<script src=')]


class Chips(unittest.TestCase):
    def test_every_chip_has_a_section_and_every_section_a_chip(self):
        chips = re.findall(r'data-manage-go="([a-z]+)"', MANAGE)
        groups = re.findall(r'data-manage-tab="([a-z]+)"', MANAGE)
        # The main tabs' names, in their order (Tim, Oct 21 2026), then Manage's own;
        # Levelset (the PEA material) has its own since Oct 23 2026, and the
        # uniform items sit in Forms with the order form.
        self.assertEqual(chips, ['home', 'waste', 'experience', 'scoreboard', 'forecast', 'calendar', 'forms', 'directors', 'levelset', 'uploads', 'settings', 'health'])
        self.assertEqual(groups, chips)
        labels = re.findall(r'data-manage-go="[a-z]+" aria-selected="false">([^<]+)<', MANAGE)
        tabs = re.findall(r'class="tab[^"]*"[^>]*data-view="[a-z]+"[^>]*>([A-Z][A-Za-z ]+?) <span', PAGE) + re.findall(r'class="tab-group-label"[^>]*>([A-Za-z]+) ', PAGE)
        # The Forecast is a page in Tools since Oct 23 2026: its chip keeps the page's name.
        with open(os.path.join(ROOT, 'static', 'js', 'launch-mode.js'), encoding='utf-8') as f:
            self.assertIn("{view: 'forecast', label: 'Sales & Labor Forecast'", f.read())
        tabs.append('Forecast')
        self.assertEqual([l for l in labels if l not in ('Levelset', 'Uploads', 'Settings', 'Health')], ['Home', 'Waste', 'Experience', 'Scoreboard', 'Forecast', 'Calendar', 'Forms', 'Directors'])
        self.assertTrue(set(labels) - {'Levelset', 'Uploads', 'Settings', 'Health'} <= set(tabs), (labels, tabs))

    def test_older_saved_chips_land_where_their_cards_went(self):
        with open(os.path.join(ROOT, 'static', 'js', 'manage-and-import.js'), encoding='utf-8') as f:
            self.assertIn("const MANAGE_TAB_RENAMED = {numbers: 'forecast', events: 'calendar', scoreboards: 'experience', talent: 'experience', pea: 'levelset', uniforms: 'forms'};", f.read())

    def test_no_accordion_left(self):
        self.assertNotIn('manage-group-header', MANAGE)
        self.assertNotIn('toggleManageGroup', PAGE)


class SavesAsYouGo(unittest.TestCase):
    def test_no_save_buttons(self):
        for gone in ('btnSaveLX', 'btnSaveGX', 'btnSaveTX', 'btnSaveHome', 'btnSaveScoreboard', 'btnSavePillars', 'btnUpdateTarget'):
            self.assertNotIn(gone, MANAGE, gone)
        with open(os.path.join(ROOT, 'static', 'js', 'management-views.js'), encoding='utf-8') as f:
            self.assertNotIn('btnSavePillars', f.read())

    def test_each_typed_form_says_when_it_saved(self):
        # LX, Guest Obsession, custom trackers, TX, the waste limit, the Home page
        self.assertEqual(MANAGE.count('data-mv-saved'), 6)
        for root in ('pillarsManageList', 'gxManageList', 'scoreboardManageList', 'txManageList', 'targetInput', 'homeManageList'):
            card = MANAGE[MANAGE.rindex('<div class="standup-card">', 0, MANAGE.index(f'id="{root}"')):]
            card = card[:card.index('</div>\n          </div>') + 1]
            self.assertIn('data-mv-saved', card, root)


class OneHomePerKindOfData(unittest.TestCase):
    def test_uploads_only_in_uploads(self):
        for gone in ('id="knFile"', 'id="knTemplate"'):
            self.assertNotIn(gone, MANAGE, gone)
        self.assertIn('id="knFromForecast"', MANAGE)     # not an upload: stays with the numbers
        with open(os.path.join(ROOT, 'static', 'js', 'data-uploads.js'), encoding='utf-8') as f:
            self.assertIn('data-du-template', f.read())

    def test_each_setting_under_the_tab_it_changes(self):
        section = lambda key: MANAGE[MANAGE.index(f'data-manage-tab="{key}"'):].split('</section>')[0]
        for key, inside in (('home', ['homeManageList']), ('waste', ['targetInput', 'wasteExportManageRoot', 'prodList']),
                            ('settings', ['launchModeToggle', 'btnExportBackup']), ('forecast', ['knFromForecast'])):
            for i in inside:
                self.assertIn(f'id="{i}"', section(key), (key, i))
        self.assertNotIn('targetInput', section('settings'))


if __name__ == '__main__':
    unittest.main()
