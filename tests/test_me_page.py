"""The Me page (Tim, Oct 30 2026; team_extras.py, static/js/me-page.js):
each person's own page: their level, hire date and birthday, their PEA,
their next level (the 360 Evaluation Process, NEXT_LEVEL), their permit,
PTO, orders and career goals in their own words. Directors and the Admin
Team open anyone's and tick the steps; Team Leads see only their own.

Run: python3 -m unittest discover tests
Firebase is a dict of paths (test_team_extras). Names are made up.
"""
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import app as appmod  # noqa: E402
import team_extras as TX  # noqa: E402
from test_team_extras import Base, store  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


def pea(rows):
    """{position: overall} per row, all for Ana Ruiz."""
    positions = sorted({p for p, _ in rows})
    return {'peaRatings': {'names': ['Ana Ruiz'], 'positions': positions, 'roles': ['Team Member'],
                           'rows': [[f'2026-10-{10 + i:02d}', 0, 0, 0, positions.index(p), 3, 3, 3, 3, 3, o] for i, (p, o) in enumerate(rows)]},
            'peaNameAliases': {}}


class PageBase(Base):
    def setUp(self):
        super().setUp()
        self._sections = appmod._read_sections
        self.sections = {'pea': pea([('Host', 3.0), ('Drinks', 1.0)]),
                         'orders': {'uniformOrders': [{'id': 'o1', 'at': '2026-10-20T15:00:00Z', 'name': 'Ana Ruiz', 'status': 'ordered', 'lines': [{'qty': 2}, {'qty': 1}]},
                                                      {'id': 'o2', 'at': '2026-10-21T15:00:00Z', 'name': 'Ben Cole', 'status': 'new', 'lines': [{}]}]}}
        appmod._read_sections = lambda: self.sections
        store[f'secure/teamProfiles/{appmod._profile_key("Ana Ruiz")}'] = {'name': 'Ana Ruiz', 'hireDate': '2025-03-02', 'birthday': '2004-06-15', 'permitExpires': '2026-11-10'}

    def tearDown(self):
        appmod._read_sections = self._sections
        super().tearDown()

    def page(self, name=None):
        r = self.c.get('/api/team/page?name=' + name) if name else self.c.get('/api/me/page')
        return r.status_code, r.get_json()


class MyPage(PageBase):
    def test_my_own(self):
        self.as_('Ana Ruiz', 'member')
        code, d = self.page()
        self.assertEqual(code, 200)
        self.assertEqual((d['name'], d['level'], d['levelLabel'], d['own'], d['canEdit']), ('Ana Ruiz', 'member', 'Team Member', True, False))
        self.assertEqual((d['hireDate'], d['birthday'], d['permitExpires']), ('2025-03-02', '2004-06-15', '2026-11-10'))
        self.assertEqual([(p['position'], p['tier']) for p in d['pea']['positions']], [('Host', 'crushing'), ('Drinks', 'notyet')])
        self.assertEqual(d['orders'], [{'at': '2026-10-20T15:00:00Z', 'status': 'ordered', 'items': 3}])     # only theirs
        self.assertEqual(d['goals'], {'text': '', 'at': None})
        self.assertNotIn('credit', d)
        self.assertEqual(d['pto']['allowance'], 0.0)
        self.assertNotIn('Ben Cole', str(d))
        self.assertEqual(self.c.get('/api/me/page').headers['Cache-Control'], 'no-store')

    def test_nobody_or_the_shared_pin_gets_no_page(self):
        self.as_()
        self.assertEqual(self.page()[1], {'name': None})
        self.as_(manager=True)
        self.assertEqual(self.page()[1], {'name': None})

    def test_the_next_level_is_the_360_process(self):
        self.as_('Ana Ruiz', 'member')
        n = self.page()[1]['next']
        self.assertEqual((n['target'], n['targetLabel'], n['how'], n['complete']), ('cert_member', 'Certified Team Member', 'certify', False))
        self.assertEqual([i['key'] for i in n['items']], ['pathway', 'pea', 'coaching'])
        self.assertEqual((n['items'][1]['done'], n['items'][1]['auto'], n['items'][1]['note']), (False, True, '1 of 2 positions there'))
        # On the Rise everywhere: the PEA step is done by itself.
        self.sections['pea'] = pea([('Host', 3.0), ('Drinks', 2.0)])
        self.assertTrue(self.page()[1]['next']['items'][1]['done'])

    def test_my_goals_in_my_words(self):
        self.as_('Ana Ruiz', 'member')
        r = self.c.post('/api/me/goals', json={'text': '  Learn every FOH position, then  Trainer by spring.  '})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()['goals']['text'], 'Learn every FOH position, then Trainer by spring.')
        self.assertEqual(self.c.post('/api/me/goals', json={'text': 'x' * 2000}).get_json()['goals']['text'], 'x' * TX.GOALS_MAX)
        self.assertEqual(self.c.post('/api/me/goals', json={'text': ''}).get_json()['goals'], {'text': '', 'at': None})
        self.as_(manager=True)
        self.assertEqual(self.c.post('/api/me/goals', json={'text': 'no'}).status_code, 401)

    def test_steps_are_leaderships_and_a_team_lead_sees_only_their_own(self):
        self.as_('Ana Ruiz', 'member')
        self.assertEqual(self.c.post('/api/team/steps', json={'name': 'Ana Ruiz', 'step': 'pathway', 'done': True}).status_code, 403)
        self.assertEqual(self.page('Ben Cole')[0], 403)
        self.as_('Ben Cole', 'lead')
        self.assertEqual(self.page('Ana Ruiz')[0], 403)
        self.assertEqual(self.page()[1]['name'], 'Ben Cole')
        self.assertEqual(self.c.post('/api/team/steps', json={'name': 'Ana Ruiz', 'step': 'coaching', 'done': True}).status_code, 403)
        self.as_('Ash Admin', 'admin')
        code, d = self.page('Ana Ruiz')
        self.assertEqual((code, d['name'], d['own'], d['canEdit']), (200, 'Ana Ruiz', False, True))
        r = self.c.post('/api/team/steps', json={'name': 'Ana Ruiz', 'step': 'pathway', 'done': True})
        self.assertEqual(r.status_code, 200)
        item = next(i for i in r.get_json()['next']['items'] if i['key'] == 'pathway')
        self.assertEqual((item['done'], item['by']), (True, 'Ash Admin'))
        self.assertEqual(self.c.post('/api/team/steps', json={'name': 'Ana Ruiz', 'step': 'dance', 'done': True}).status_code, 400)
        self.assertEqual(self.c.post('/api/team/steps', json={'name': 'Ana Ruiz', 'step': 'trial', 'start': 'soon'}).status_code, 400)
        self.c.post('/api/team/level', json={'name': 'Ana Ruiz', 'level': 'trainer'})
        r = self.c.post('/api/team/steps', json={'name': 'Ana Ruiz', 'step': 'trial', 'start': '2026-10-01'})
        trial = next(i for i in r.get_json()['next']['items'] if i['key'] == 'trial')
        self.assertEqual((trial['start'], trial['done'], trial['label']), ('2026-10-01', False, '30-day Trainer trial'))
        self.assertTrue(all(p.startswith('secure/') for p in store))

    def test_all_steps_done(self):
        self.as_('Ash Admin', 'admin')
        self.sections['pea'] = pea([('Host', 3.0), ('Drinks', 2.0)])
        for step in ('pathway', 'coaching'):
            r = self.c.post('/api/team/steps', json={'name': 'Ana Ruiz', 'step': step, 'done': True})
        self.assertTrue(r.get_json()['next']['complete'])

    def test_a_directors_page_has_the_credit(self):
        self.as_(self.director, 'director')
        d = self.page()[1]
        self.assertEqual((d['level'], d['credit']['perYear'], d['canEdit']), ('director', 500, True))


class Ladder(unittest.TestCase):
    def test_every_level_points_up_until_the_top(self):
        chain = []
        lv = 'member'
        while TX.NEXT_LEVEL.get(lv):
            chain.append((lv, TX.NEXT_LEVEL[lv]['target'], TX.NEXT_LEVEL[lv]['how']))
            lv = TX.NEXT_LEVEL[lv]['target']
        self.assertEqual(chain, [('member', 'cert_member', 'certify'), ('cert_member', 'trainer', 'promote'), ('trainer', 'cert_trainer', 'certify'),
                                 ('cert_trainer', 'lead', 'promote'), ('lead', 'cert_lead', 'certify'), ('cert_lead', 'director', 'promote'),
                                 ('director', 'cert_director', 'certify'), ('cert_director', 'executive', 'promote'), ('executive', 'cert_executive', 'certify')])
        self.assertIsNone(TX.next_level('cert_executive', {}, {}))
        self.assertIsNone(TX.next_level('operator', {}, {}))
        for lv, n in TX.NEXT_LEVEL.items():
            self.assertIn(n['target'], TX.LEVEL_IDS, lv)
            self.assertTrue(n['pathway'], lv)

    def test_the_pea_bar(self):
        rise = {'positions': [{'tier': 'rise'}, {'tier': 'crushing'}]}
        crushing = {'positions': [{'tier': 'crushing'}, {'tier': 'crushing'}]}
        self.assertTrue(next(i for i in TX.next_level('member', {}, rise)['items'] if i['key'] == 'pea')['done'])          # On the Rise or better everywhere
        self.assertFalse(next(i for i in TX.next_level('cert_member', {}, rise)['items'] if i['key'] == 'pea')['done'])    # Crushing It everywhere
        self.assertTrue(next(i for i in TX.next_level('cert_member', {}, crushing)['items'] if i['key'] == 'pea')['done'])
        none = next(i for i in TX.next_level('member', {}, {'positions': []})['items'] if i['key'] == 'pea')
        self.assertEqual((none['done'], none['note']), (False, 'No PEA ratings yet'))
        self.assertEqual([i['key'] for i in TX.next_level('lead', {}, {})['items']], ['pathway', 'trial', 'coaching'])


class Page(unittest.TestCase):
    def test_wired_in(self):
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertIn('<script src="/static/js/team-extras.js"></script>\n<script src="/static/js/me-page.js"></script>', page)
        su = read('static', 'js', 'state-and-utils.js')
        self.assertIn("siIdentity && siIdentity.name && typeof mpOpenMine === 'function') mpOpenMine();", su)   # the name at the top
        self.assertIn('data-si-me', read('static', 'js', 'sign-in.js'))
        self.assertIn('data-mp-open-for="${escapeHtml(p.name)}">Open their page', read('static', 'js', 'headcount.js'))
        js = read('static', 'js', 'me-page.js')
        self.assertIn("function mpOthersAllowed(){ return typeof hcAllowed === 'function' && hcAllowed(); }", js)   # directors and the Admin Team open others'
        self.assertIsNone(re.search('[\U0001F300-\U0001FAFF☀-➿]', js))
        for sel in ('.mp-sheet{', '.mp-sheet:not(.is-boh) .es{display:none;}', '.mp-steps li.is-done{'):
            self.assertIn(sel, read('static', 'css', 'theme-cfa.css'))

    def test_pto_shows_on_the_me_page_only(self):
        """Tim, Oct 31 2026: a team member sees their PTO on their Me page and
        nowhere else. The old "Your profile" sheet (team-extras.js) is gone;
        the Right Now card's "mine" link and a sent receipt open the Me page."""
        te = read('static', 'js', 'team-extras.js')
        self.assertNotIn('apMineSheet', te)
        self.assertNotIn("kind: 'mine'", te)
        self.assertIn("if(typeof mpOpenMine === 'function') mpOpenMine();", te)
        rn = read('static', 'js', 'right-now.js')
        self.assertIn("else if(what === 'mine' && typeof mpOpenMine === 'function') mpOpenMine();", rn)
        self.assertNotIn('apOpenMine', rn)
        for f in ('right-now.js', 'sign-in.js', 'zone-reset.js', 'state-and-utils.js', 'pass.js', 'team-schedule.js'):
            js = read('static', 'js', f)
            self.assertNotRegex(js, r"(?i)pto[^\n]*<", f"PTO drawn in {f}")
        self.assertIn("if(d.pto && d.pto.allowance && !d.pto.off) items.push(`<li><b>PTO ", read('static', 'js', 'me-page.js'))

    def test_the_persons_words_are_escaped_and_nothing_is_contact_info(self):
        js = read('static', 'js', 'me-page.js')
        for field in ('d.name', 'goals', 'it.label', 'p.position', 'd.levelLabel'):
            for m in re.finditer(r'\$\{([^{}]*\b' + re.escape(field) + r"\b(?!')[^{}]*)\}", js):   # the value, not a phrase ('Career goals')
                self.assertTrue('mpH(' in m.group(1) or '? ' in m.group(1) or re.search(r'\w+Html\(', m.group(1)), m.group(0))   # a renderer escapes inside
        code = re.sub(r'^\s*//.*$', '', js, flags=re.M).lower()                    # the code, not its comments
        for word in ('phone', 'email', 'address', 'emergency'):
            self.assertNotRegex(code, r'\b' + word + r'\b')


if __name__ == '__main__':
    unittest.main()
