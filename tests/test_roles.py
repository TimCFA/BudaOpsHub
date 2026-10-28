"""Team Lead roles (roles.js; Tim, Oct 27 2026): a place for each role on the
PEC role cards, with who holds it, this week's numbers, the role's actions as
a weekly checklist and a running log. Team Leads and up see it and change it.

Run: python3 -m unittest discover tests
"""
import os
import sys
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')
sys.path.insert(0, ROOT)
import app as appmod  # noqa: E402


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


class Roles(unittest.TestCase):
    def test_saved_with_set_ups_so_only_leads_change_it(self):
        self.assertIn('roleBoards', appmod.STATE_SECTIONS['setups'])
        self.assertIn('roleBoards', appmod.LEAD_ONLY_KEYS)
        storage = read('static', 'js', 'storage.js')
        self.assertIn("'callIns', 'roleBoards'],", storage)
        self.assertIn("roleBoards = (data.roleBoards && typeof data.roleBoards === 'object' && !Array.isArray(data.roleBoards)) ? data.roleBoards : {};", storage)

    def test_every_role_card_has_a_place(self):
        js = read('static', 'js', 'roles.js')
        self.assertIn("const RL_ORDER = ['hs', 'dt', 'cc', 'stew', 'fs', 'fq', 'fcm', 'nht', 'ct'];", js)
        cards = read('static', 'js', 'leaders.js')
        for key in ('hs', 'dt', 'cc', 'stew', 'fs', 'fq', 'fcm', 'nht', 'ct'):
            self.assertIn(f'\n  {key}: {{name:', cards)

    def test_the_tab_is_for_leads_and_up(self):
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertIn('aria-controls="rolesView" data-view="roles" style="display:none">Roles', page)
        self.assertIn('<div id="rolesRoot" class="rl-page"></div>', page)
        self.assertIn('<script src="/static/js/leaders.js"></script>\n<script src="/static/js/roles.js"></script>', page)
        js = read('static', 'js', 'roles.js')
        self.assertIn("function rlShown(){ return typeof siLeadOrUp === 'function' && siLeadOrUp(); }", js)
        nav = read('static', 'js', 'navigation.js')
        self.assertIn("if(view === 'roles' && typeof rlShown === 'function' && !rlShown()) view = 'home';", nav)
        self.assertIn("if(typeof rlSyncTab === 'function') rlSyncTab();", read('static', 'js', 'sign-in.js'))
        self.assertIn("'roles']", read('static', 'js', 'launch-mode.js').split('const LAUNCH_VIEWS')[1].split(';')[0])

    def test_checks_and_log_are_signed_and_kept_short(self):
        js = read('static', 'js', 'roles.js')
        self.assertIn("if(w[i]) delete w[i]; else w[i] = {by: rlWho(), at: Date.now()};", js)
        self.assertIn("b.log.unshift({text, by: rlWho(), at: Date.now()});", js)
        self.assertIn("const keep = Object.keys(b.weeks).sort().slice(-6);", js)
        self.assertIn('const RL_LOG_KEEP = 60;', js)


if __name__ == '__main__':
    unittest.main()
