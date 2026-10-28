"""Team profiles, the admin side (Ashley; Tim, Oct 28 2026): levels, PTO by
level from January 1 with no carry-over, and directors' $500 uniform credit
a calendar year, sent with a receipt photo and approved or denied by the
Admin Team (team_extras.py). Who reads and writes what, and the sums.

Run: python3 -m unittest discover tests
Firebase is a dict of paths. Names are made up.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
import team_extras as TX  # noqa: E402

store = {}
JPEG = 'data:image/jpeg;base64,' + 'A' * 200


class FakeRef:
    def __init__(self, path):
        self.path = path.strip('/')

    def get(self, etag=False):
        if self.path in store:
            return store[self.path]
        out = {}
        for p, v in store.items():
            if p.startswith(self.path + '/'):
                node = out
                parts = p[len(self.path) + 1:].split('/')
                for part in parts[:-1]:
                    node = node.setdefault(part, {})
                node[parts[-1]] = v
        return out or None

    def set(self, value):
        for p in [p for p in store if p.startswith(self.path + '/')]:
            del store[p]
        store[self.path] = value

    def delete(self):
        for p in [p for p in store if p == self.path or p.startswith(self.path + '/')]:
            del store[p]


class Base(unittest.TestCase):
    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        store.clear()
        store['secure/teamPins'] = {'k1': {'name': 'Ana Ruiz', 'role': 'member'}, 'k2': {'name': 'Ben Cole', 'role': 'lead'},
                                    'k3': {'name': 'Ash Admin', 'role': 'admin'}}
        appmod._auth_read()
        self.c = appmod.app.test_client()
        self._today = appmod._turnover_today
        appmod._turnover_today = lambda: '2026-10-28'
        self.director = appmod.DIRECTORS_SEED[0]

    def tearDown(self):
        appmod._turnover_today = self._today

    def as_(self, name=None, role=None, **extra):
        with self.c.session_transaction() as s:
            s.clear()
            if role in ('director', 'admin'):
                s['manager'] = True
                s['director'] = True
            s.update(extra)
            if name:
                s['user'] = {'name': name, 'role': role, 'via': 'pin'}

    def extras(self):
        return self.c.get('/api/team/extras').get_json()

    def person(self, name):
        return next(p for p in self.extras()['people'] if p['name'] == name)


class Access(Base):
    def test_only_directors_and_the_admin_team(self):
        for who in ((None, None), ('Ana Ruiz', 'member'), ('Ben Cole', 'lead')):
            self.as_(*who)
            self.assertEqual(self.c.get('/api/team/extras').status_code, 403)
            self.assertEqual(self.c.post('/api/team/pto', json={'name': 'Ana Ruiz', 'date': '2026-10-01', 'hours': 8}).status_code, 403)
            self.assertEqual(self.c.post('/api/team/level', json={'name': 'Ana Ruiz', 'level': 'trainer'}).status_code, 403)
        self.as_('Ash Admin', 'admin')
        self.assertEqual(self.c.get('/api/team/extras').status_code, 200)
        self.assertEqual(self.c.get('/api/team/extras').headers['Cache-Control'], 'no-store')

    def test_everything_lives_under_secure(self):
        self.as_('Ash Admin', 'admin')
        self.c.post('/api/team/level', json={'name': 'Ana Ruiz', 'level': 'cert_member'})
        self.c.post('/api/team/pto', json={'name': 'Ana Ruiz', 'date': '2026-10-01', 'hours': 8})
        self.assertTrue(all(p.startswith(('secure/',)) for p in store))


class Levels(Base):
    def test_from_the_pin_list_until_set(self):
        self.as_('Ash Admin', 'admin')
        self.assertEqual((self.person('Ana Ruiz')['level'], self.person('Ben Cole')['level'], self.person('Ash Admin')['level']), ('member', 'lead', None))
        self.assertEqual(self.person(self.director)['level'], 'director')
        self.c.post('/api/team/level', json={'name': 'Ana Ruiz', 'level': 'cert_trainer'})
        p = self.person('Ana Ruiz')
        self.assertEqual((p['level'], p['levelSet']), ('cert_trainer', True))
        self.assertEqual(self.c.post('/api/team/level', json={'name': 'Ana Ruiz', 'level': 'boss'}).status_code, 400)
        self.c.post('/api/team/level', json={'name': 'Ana Ruiz', 'level': ''})
        self.assertEqual(self.person('Ana Ruiz')['level'], 'member')
        self.assertEqual([l['label'] for l in self.extras()['levels']],
                         ['Team Member', 'Certified Team Member', 'Trainer', 'Certified Trainer', 'Team Lead', 'Certified Team Lead',
                          'Director', 'Certified Director', 'Executive', 'Certified Executive', 'Operator'])


class Pto(Base):
    def test_the_stores_chart_until_the_table_is_saved(self):
        """Tim's PTO chart (Oct 28 2026)."""
        self.as_('Ash Admin', 'admin')
        self.assertEqual(self.extras()['ptoHours'], {'cert_executive': 140.0, 'cert_director': 120.0, 'cert_lead': 80.0, 'cert_trainer': 40.0, 'cert_member': 20.0})
        self.assertEqual(self.person('Ana Ruiz')['pto']['allowance'], 0.0)
        self.c.post('/api/team/level', json={'name': 'Ana Ruiz', 'level': 'cert_member'})
        self.assertEqual(self.person('Ana Ruiz')['pto']['left'], 20.0)
        self.c.post('/api/team/pto-hours', json={'hours': {'cert_member': 24}})       # once saved, the saved table is the whole of it
        self.assertEqual(self.extras()['ptoHours'], {'cert_member': 24.0})

    def test_the_highest_certified_level_reached(self):
        """Tim, Oct 28 2026: a Trainer gets a Certified Team Member's 20 until
        certified as a Trainer (40); promoted to Team Lead it's still 40 until
        certified as a Team Lead (80); and so on."""
        self.as_('Ash Admin', 'admin')
        got = []
        for lv in ('member', 'cert_member', 'trainer', 'cert_trainer', 'lead', 'cert_lead', 'director', 'cert_director', 'executive', 'cert_executive'):
            self.c.post('/api/team/level', json={'name': 'Ana Ruiz', 'level': lv})
            p = self.person('Ana Ruiz')['pto']
            got.append((lv, p['allowance'], p['basis']))
        self.assertEqual(got, [('member', 0.0, None), ('cert_member', 20.0, None), ('trainer', 20.0, 'Certified Team Member'), ('cert_trainer', 40.0, None),
                               ('lead', 40.0, 'Certified Trainer'), ('cert_lead', 80.0, None), ('director', 80.0, 'Certified Team Lead'), ('cert_director', 120.0, None),
                               ('executive', 120.0, 'Certified Director'), ('cert_executive', 140.0, None)])
        self.c.post('/api/team/level', json={'name': 'Ana Ruiz', 'level': 'operator'})      # the Operator: no PTO (Tim, Oct 28 2026)
        p = self.person('Ana Ruiz')['pto']
        self.assertEqual((p['allowance'], p['basis'], p['off']), (None, None, True))
        self.c.post('/api/team/level', json={'name': 'Ana Ruiz', 'level': 'cert_executive'})
        self.as_('Ana Ruiz', 'member')
        self.assertEqual(self.c.get('/api/me/extras').get_json()['pto']['allowance'], 140.0)

    def test_by_level_from_january_first(self):
        self.as_('Ash Admin', 'admin')
        self.c.post('/api/team/pto-hours', json={'hours': {'cert_member': 16, 'cert_lead': 40, 'lead': 99, 'nonsense': 9}})   # only certified levels carry hours
        self.assertEqual(self.extras()['ptoHours'], {'cert_member': 16.0, 'cert_lead': 40.0})
        self.c.post('/api/team/level', json={'name': 'Ana Ruiz', 'level': 'trainer'})
        for date, hours in (('2026-03-02', 8), ('2026-10-01', 4.5), ('2025-12-30', 8)):     # last year's doesn't count
            self.assertEqual(self.c.post('/api/team/pto', json={'name': 'Ana Ruiz', 'date': date, 'hours': hours, 'note': 'Family'}).status_code, 200)
        pto = self.person('Ana Ruiz')['pto']
        self.assertEqual((pto['allowance'], pto['used'], pto['left'], len(pto['entries'])), (16.0, 12.5, 3.5, 2))
        self.c.post('/api/team/pto', json={'name': 'Ana Ruiz', 'date': '2026-10-02', 'hours': 9})
        self.assertEqual(self.person('Ana Ruiz')['pto']['left'], 0)                           # never below zero
        eid = self.person('Ana Ruiz')['pto']['entries'][0]['id']
        self.c.post('/api/team/pto', json={'id': eid, 'remove': True})
        self.assertEqual(self.person('Ana Ruiz')['pto']['used'], 12.5)
        self.assertIsNone(self.person('Ash Admin')['pto']['allowance'])                       # no level, no allowance
        for bad in ({'name': 'Ana Ruiz', 'date': '10/2', 'hours': 8}, {'name': 'Ana Ruiz', 'date': '2026-10-02', 'hours': 'a lot'}, {'date': '2026-10-02', 'hours': 8}):
            self.assertEqual(self.c.post('/api/team/pto', json=bad).status_code, 400)

    def test_a_team_member_sees_their_own(self):
        self.as_('Ash Admin', 'admin')
        self.c.post('/api/team/pto-hours', json={'hours': {'cert_member': 16}})
        self.c.post('/api/team/level', json={'name': 'Ana Ruiz', 'level': 'cert_member'})
        self.c.post('/api/team/pto', json={'name': 'Ana Ruiz', 'date': '2026-10-01', 'hours': 8})
        self.c.post('/api/team/pto', json={'name': 'Ben Cole', 'date': '2026-10-01', 'hours': 8})
        self.as_('Ana Ruiz', 'member')
        me = self.c.get('/api/me/extras').get_json()
        self.assertEqual((me['level'], me['levelLabel'], me['pto']['used'], me['pto']['left'], len(me['pto']['entries'])), ('cert_member', 'Certified Team Member', 8.0, 8.0, 1))
        self.assertNotIn('credit', me)
        self.assertNotIn('Ben Cole', str(me))
        self.as_()
        self.assertEqual(self.c.get('/api/me/extras').get_json(), {'name': None})


class Credit(Base):
    def send(self, **b):
        return self.c.post('/api/team/credit', json=dict({'amount': 120, 'date': '2026-10-20', 'note': 'Two jackets', 'receipt': JPEG}, **b))

    def test_a_director_sends_the_admin_team_decides(self):
        self.as_(self.director, 'director')
        r = self.send()
        self.assertEqual(r.status_code, 200, r.get_json())
        mine = r.get_json()['credit']
        self.assertEqual((mine['perYear'], mine['used'], mine['pending'], mine['left']), (500, 0, 120.0, 500))
        rid = mine['requests'][0]['id']
        self.assertEqual(store[f'secure/uniformReceipts/{rid}'], JPEG)
        self.assertEqual(self.send(receipt=None).status_code, 400)                            # a receipt, always
        self.assertEqual(self.send(amount=600).status_code, 400)
        self.assertEqual(self.c.post('/api/team/credit/decide', json={'id': rid, 'decision': 'approved'}).status_code, 403)   # not the director
        self.as_('Ash Admin', 'admin')
        self.assertEqual([p['id'] for p in self.extras()['pending']], [rid])
        self.assertEqual(self.c.get('/api/me/extras').get_json()['toReview'], 1)
        self.assertEqual(self.c.get(f'/api/team/credit/receipt/{rid}').mimetype, 'image/jpeg')
        self.assertEqual(self.c.post('/api/team/credit/decide', json={'id': rid, 'decision': 'approved', 'note': 'Filed'}).status_code, 200)
        self.assertEqual(self.c.post('/api/team/credit/decide', json={'id': rid, 'decision': 'denied'}).status_code, 409)   # decided once
        self.assertEqual(self.extras()['pending'], [])
        self.as_(self.director, 'director')
        c = self.c.get('/api/me/extras').get_json()['credit']
        self.assertEqual((c['used'], c['pending'], c['left'], c['requests'][0]['status'], c['requests'][0]['decidedBy']), (120.0, 0, 380.0, 'approved', 'Ash Admin'))
        self.assertEqual(self.send(amount=381).status_code, 400)                              # more than what's left
        self.assertEqual(self.send(amount=50, date='2025-12-20').status_code, 200)            # last year's own $500
        self.assertEqual(self.c.get('/api/me/extras').get_json()['credit']['left'], 380.0)

    def test_denied_doesnt_spend_and_not_for_team_members(self):
        self.as_(self.director, 'director')
        rid = self.send().get_json()['credit']['requests'][0]['id']
        self.as_('Ash Admin', 'admin')
        self.c.post('/api/team/credit/decide', json={'id': rid, 'decision': 'denied', 'note': 'Receipt unreadable'})
        self.as_(self.director, 'director')
        self.assertEqual(self.c.get('/api/me/extras').get_json()['credit']['left'], 500)
        self.as_('Ben Cole', 'lead')
        self.assertEqual(self.send().status_code, 403)
        self.assertEqual(self.c.get(f'/api/team/credit/receipt/{rid}').status_code, 403)
        self.as_(manager=True)                                                                  # the shared PIN has no name
        self.assertEqual(self.send().status_code, 401)

    def test_the_owner_is_the_backup(self):
        """Tim, Oct 28 2026: the Admin Team approves uniform credit, Tim is the
        backup. Another director can't."""
        self.as_(self.director, 'director')
        rid = self.send().get_json()['credit']['requests'][0]['id']
        self.as_('Dana Example', 'director')
        self.assertEqual(self.c.post('/api/team/credit/decide', json={'id': rid, 'decision': 'approved'}).status_code, 403)
        self.as_('Dana Example', 'director', owner=True)
        self.assertTrue(self.extras()['canDecide'])
        self.assertEqual(self.c.post('/api/team/credit/decide', json={'id': rid, 'decision': 'approved'}).status_code, 200)
        self.as_(self.director, 'director')
        self.assertEqual(self.c.get('/api/me/extras').get_json()['credit']['requests'][0]['decidedBy'], 'Dana Example')

    def test_never_the_operator(self):
        """Tim, Oct 28 2026: the Operator is left off the uniform credit (and PTO)."""
        self.as_('Ash Admin', 'admin')
        self.c.post('/api/team/level', json={'name': self.director, 'level': 'operator'})
        p = self.person(self.director)
        self.assertFalse(p['director'])
        self.assertNotIn('credit', p)
        self.as_(self.director, 'director')
        self.assertEqual(self.send().status_code, 403)
        me = self.c.get('/api/me/extras').get_json()
        self.assertNotIn('credit', me)
        self.assertIsNone(me['pto']['allowance'])


if __name__ == '__main__':
    unittest.main()


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


class Page(unittest.TestCase):
    def test_wired_in(self):
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertLess(page.index('<script src="/static/js/headcount.js"></script>'), page.index('<script src="/static/js/team-extras.js"></script>'))
        hc = read('static', 'js', 'headcount.js')
        self.assertIn("${typeof apPanelHtml === 'function' ? apPanelHtml() : ''}", hc)
        self.assertIn("${hcProfile && !hcProfile.isNew && typeof apProfileHtml === 'function' ? apProfileHtml(hcProfile) : ''}", hc)
        self.assertIn("if(v.name && typeof apRightNowRows === 'function') card.rows = card.rows.concat(apRightNowRows());", read('static', 'js', 'right-now.js'))
        forms = read('static', 'js', 'forms.js')
        self.assertIn("const FM_CREDIT_CARD = {id: 'uniform_credit'", forms)
        self.assertIn('...(fmCreditShown() ? [FM_CREDIT_CARD] : [])', forms)
        js = read('static', 'js', 'team-extras.js')
        self.assertIn("'/api/me/extras'", js)
        self.assertNotIn('innerHTML = `${', js.replace('layer.innerHTML = `<div', ''))

    def test_no_two_page_scripts_declare_the_same_name(self):
        """A second `let txData` (the TX page already has one) stops the
        whole script loading (Oct 28 2026)."""
        import re
        page = read('cfa-buda-ops-hub-complete.html')
        seen, dup = {}, []
        for f in re.findall(r'<script src="/static/js/([\w.-]+)"', page):
            path = os.path.join(ROOT, 'static', 'js', f)
            if not os.path.exists(path):
                continue
            for n in re.findall(r'^(?:let|const|class)\s+([A-Za-z_$][\w$]*)', read('static', 'js', f), re.M):
                if n in seen and seen[n] != f:
                    dup.append((n, seen[n], f))
                seen.setdefault(n, f)
        self.assertEqual(dup, [])

    def test_the_styles_dont_borrow_the_tx_page_names(self):
        css = read('static', 'css', 'theme-cfa.css')
        block = css[css.index('Team profiles, the admin side (team-extras.js'):]
        self.assertNotIn('.tx-', block)
        self.assertIn('.ap-stats > div{padding:10px;border-radius:12px;background:var(--cfa-navy);', block)
