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
        self.assertEqual(chips, ['uploads', 'numbers', 'events', 'scoreboards', 'talent', 'waste', 'pea', 'settings'])
        self.assertEqual(groups, chips)

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

    def test_settings_holds_the_set_once_things(self):
        settings = MANAGE[MANAGE.index('data-manage-tab="settings"'):]
        for inside in ('launchModeToggle', 'targetInput', 'homeManageList', 'btnExportBackup'):
            self.assertIn(f'id="{inside}"', settings, inside)
        waste = MANAGE[MANAGE.index('data-manage-tab="waste"'):MANAGE.index('data-manage-tab="pea"')]
        for inside in ('wasteExportManageRoot', 'prodList'):
            self.assertIn(f'id="{inside}"', waste, inside)
        self.assertNotIn('targetInput', waste)


if __name__ == '__main__':
    unittest.main()
