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
    """Since Nov 24 2026 Manage speaks the Hub's language (Tim: "ensure the
    manage tab accommodates the new layout"): its sections are rows under the
    Hub's four groups, each named as its page is named everywhere."""
    def test_every_row_has_a_section_and_every_section_a_row(self):
        rows = re.findall(r'data-manage-go="([a-z]+)"', MANAGE)
        groups = re.findall(r'data-manage-tab="([a-z]+)"', MANAGE)
        self.assertEqual(sorted(rows), sorted(groups))
        self.assertEqual(len(rows), 12)
        self.assertNotIn('manage-tabs', MANAGE)   # the row of chips is gone

    def test_the_hubs_four_groups_in_its_order(self):
        with open(os.path.join(ROOT, 'static', 'js', 'bottom-nav.js'), encoding='utf-8') as f:
            nav = f.read()
        hub = re.findall(r"\{key: '[a-z]+', label: '([^']+)'", nav)
        mine = re.findall(r'<h3 class="hub-h">([^<]+)</h3>', MANAGE)
        self.assertEqual(mine, hub)

    def test_a_section_named_for_a_page_uses_the_pages_name(self):
        with open(os.path.join(ROOT, 'static', 'js', 'bottom-nav.js'), encoding='utf-8') as f:
            nav = f.read()
        pages = set(re.findall(r"label: '([^']+)'", nav))
        labels = re.findall(r'<span class="mg-lb">([^<]+)</span>', MANAGE)
        for own in ('Team list', 'Levelset', 'Guest Obsession, TX and LX', 'Uploads', 'Settings', 'Health'):
            labels.remove(own)
        self.assertTrue(set(labels) <= pages, set(labels) - pages)

    def test_a_phone_opens_the_list_then_a_section_back_can_undo(self):
        with open(os.path.join(ROOT, 'static', 'js', 'manage-and-import.js'), encoding='utf-8') as f:
            js = f.read()
        self.assertIn("manageShowTab(b.dataset.manageGo, 'push');", js)
        self.assertIn('data-mg-back', MANAGE)
        self.assertIn("matchMedia('(min-width: 960px)')", js)
        with open(os.path.join(ROOT, 'static', 'js', 'navigation.js'), encoding='utf-8') as f:
            self.assertIn('manageArrive()', f.read())

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
