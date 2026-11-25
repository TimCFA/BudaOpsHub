"""Each person's own Home (Tim, Nov 25 2026): under the banner, someone
signed in by name hides what they don't need and puts the rest in their own
order (right-now.js "Each person's own Home", home-edit.js, app.py
/api/me/home). Fixed: the greeting, the quote, the banner, a new hire's card,
the way to sign in. A hidden line that needs someone (red) shows anyway.
Nothing changes for someone who never opens the sheet.

Run: python3 -m unittest discover tests
Card logic runs in node (tests/right_now_runner.js); Firebase is a dict of
paths (FakeRef). Names are made up.
"""
import json
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import subprocess  # noqa: E402
import app as appmod  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run(*cases):
    out = subprocess.run(['node', os.path.join(ROOT, 'tests', 'right_now_runner.js')], input=json.dumps({'cases': list(cases)}),
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


# Monday 5:10 PM, Dinner (the runner's clock): a FOH team member on Drinks 1, a leader on.
SETUP = """
  fohRoster[today] = [{name: 'Ana Ruiz Lopez', start: '12:00p', end: '8:30p'}, {name: 'Leo Park', start: '2:00p', end: '10:30p', leader: true}];
  bohRoster[today] = [{name: 'Sam Ortiz', start: '1:30p', end: '10:30p'}];
  posAssignments['foh||' + today + '||Dinner (5:00-8:00)||Drinks 1'] = 'Ana Ruiz Lopez';
  posAssignments['foh||' + today + '||Close (8:00-10:00)||Host 1'] = 'Ana Ruiz Lopez';
  posAssignments['foh||' + today + '||Dinner (5:00-8:00)||Lead Captain'] = 'Leo Park';
"""

store = {}


class FakeRef:
    def __init__(self, path):
        self.path = path.strip('/')

    def get(self):
        return store.get(self.path)

    def set(self, value):
        store[self.path] = value


def card_with(role, name, prefs, extra=''):
    """The card's rows as [section, text, folded] after someone's choice."""
    return f"""c => {{ {SETUP} {extra}
      acUser = {json.dumps({'role': role, 'name': name})};
      launchManager = {'true' if role in ('director', 'manager') else 'false'};
      const v = rnViewer(), card = rnCardFor(v, rnDay());
      const before = card.rows.map(r => r.text);
      rnApplyPrefs(card, v, {json.dumps(prefs)});
      return {{before, rows: card.rows.map(r => [rnItemOf(r, card), r.text, !!r.more]), order: card.order || null, pea: !!card.pea}};
    }}"""


class Card(unittest.TestCase):
    def test_nothing_changes_until_someone_chooses(self):
        got = run({'op': card_with('member', 'Ana Ruiz', {'order': [], 'hidden': []})},
                  {'op': card_with('director', 'Tim Lane', {'order': [], 'hidden': []})})
        for g in got:
            self.assertEqual([r[1] for r in g['rows']], g['before'])
            self.assertIsNone(g['order'])

    def test_a_team_member_hides_a_section(self):
        got = run({'op': card_with('member', 'Ana Ruiz', {'order': [], 'hidden': ['shift', 'leading']})})[0]
        kinds = [r[0] for r in got['rows']]
        self.assertNotIn('shift', kinds)
        self.assertNotIn('leading', kinds)
        self.assertIn('spots', kinds)
        self.assertLess(len(got['rows']), len(got['before']))

    def test_a_team_member_puts_their_shift_first(self):
        got = run({'op': card_with('member', 'Ana Ruiz', {'order': ['shift', 'spots', 'leading'], 'hidden': []})})[0]
        self.assertEqual(got['rows'][0][0], 'shift')
        self.assertEqual(got['order'][:3], ['shift', 'spots', 'leading'])
        # What the saved order didn't name goes in at its default place.
        self.assertEqual(sorted(got['order']), sorted(['spots', 'shift', 'leading', 'zone', 'tickets', 'pea', 'badge', 'cal']))

    def test_a_hidden_line_that_needs_someone_shows_anyway(self):
        """A lead who hides Open spots still sees one nobody is on."""
        got = run({'op': card_with('lead', 'Leo Park', {'order': [], 'hidden': ['openspots']}, extra="gaps['foh|Dinner'] = {open: ['Drinks 2'], unplaced: [], filled: 4};")},
                  {'op': card_with('lead', 'Leo Park', {'order': [], 'hidden': ['openspots']})})
        self.assertIn('openspots', [r[0] for r in got[0]['rows']])         # 1 open: red, stays
        self.assertNotIn('openspots', [r[0] for r in got[1]['rows']])      # all covered: hidden

    def test_a_director_moves_waste_up_and_breaks_down(self):
        order = ['week', 'openspots', 'waste', 'unplaced', 'zone', 'tickets', 'leaders', 'review', 'badge', 'cal',
                 'more', 'breaks', 'later', 'foodsafety', 'roster', 'credit']
        got = run({'op': card_with('director', 'Tim Lane', {'order': order, 'hidden': []},
                                   extra="breaks.foh = [{name: 'Ana Ruiz Lopez', start: 19 * 60}];")})[0]
        rows = {r[0]: r[2] for r in got['rows']}
        self.assertFalse(rows['waste'])          # out of More about today
        self.assertTrue(rows['foodsafety'])      # still folded
        self.assertTrue(rows['breaks'])          # folded now
        kinds = [r[0] for r in got['rows']]
        self.assertLess(kinds.index('waste'), kinds.index('leaders'))

    def test_pea_can_be_hidden(self):
        pea = "rnMine.pea = {positions: [{position: 'Drinks', avg: 2.9, tier: 'crushing', tierLabel: 'Crushing It', total: 5, last: 'Oct 1'}]};"
        got = run({'op': card_with('member', 'Ana Ruiz', {'order': [], 'hidden': []}, extra=pea)},
                  {'op': card_with('member', 'Ana Ruiz', {'order': [], 'hidden': ['pea']}, extra=pea)})
        self.assertTrue(got[0]['pea'])
        self.assertFalse(got[1]['pea'])

    def test_every_line_belongs_somewhere_its_role_lists(self):
        """Every line the cards draw today maps to a section on its role's list."""
        got = run(*[{'op': f"""c => {{ {SETUP} gaps['foh|Dinner'] = {{open: ['Drinks 2'], unplaced: ['Kai Moss'], filled: 4}};
                      handoff = {{name: 'Dinner to Late Night (7:00pm - 8:00pm)', owners: {{Restrooms: ['Ana Ruiz Lopez']}}, done: {{}}}};
                      breaks.foh = [{{name: 'Ana Ruiz Lopez', start: 17 * 60 + 30}}];
                      acUser = {json.dumps({'role': role, 'name': name})}; launchManager = {'true' if role == 'director' else 'false'};
                      const v = rnViewer(), card = rnCardFor(v, rnDay());
                      return card.rows.filter(r => r.go).map(r => [rnItemOf(r, card), RN_LAYOUTS[rnLayoutOf(v)].includes(rnItemOf(r, card)), r.text]); }}"""}
                    for role, name in (('member', 'Ana Ruiz'), ('lead', 'Leo Park'), ('director', 'Tim Lane'))])
        for rows in got:
            self.assertTrue(rows)
            self.assertEqual([r for r in rows if not r[1]], [])

    def test_saved_orders_meet_new_sections(self):
        got = run({'op': """c => [rnOrderOf(['cal', 'spots'], ['spots', 'shift', 'cal', 'pea']), rnOrderOf(['gone', 'pea', 'pea'], ['spots', 'pea']), rnOrderOf(null, ['a', 'b'])]"""})[0]
        self.assertEqual(got, [['cal', 'pea', 'spots', 'shift'], ['spots', 'pea'], ['a', 'b']])

    def test_only_someone_signed_in_as_themselves(self):
        got = run({'op': """c => [
            rnMayEdit({role: 'member', name: 'Ana Ruiz'}), rnMayEdit({role: 'director', name: 'Tim Lane'}),
            rnMayEdit({role: 'manager', name: ''}), rnMayEdit({role: 'none', name: ''}),
            (() => { vaActive = () => true; const r = rnMayEdit({role: 'member', name: 'Ana Ruiz'}); vaActive = undefined; return r; })()]"""})[0]
        self.assertEqual(got, [True, True, False, False, False])

    def test_the_edit_link_sits_under_the_card(self):
        got = run({'op': f"""c => {{ {SETUP} acUser = {{role: 'member', name: 'Ana Ruiz'}}; heOpen = () => 0;
                      renderRightNow(); const a = document.getElementById('rightNow').innerHTML;
                      acUser = null; renderRightNow(); const b = document.getElementById('rightNow').innerHTML; return [a, b]; }}"""})[0]
        self.assertIn('data-rn-edit', got[0])
        self.assertNotIn('data-rn-edit', got[1])          # a phone nobody signed in on


class Words(unittest.TestCase):
    def test_every_section_name_has_its_spanish(self):
        js = read('static', 'js', 'right-now.js') + read('static', 'js', 'home-edit.js')
        labels = set()
        for table in ('RN_ITEM_LABELS', 'RN_LEADER_LABELS', 'RN_DIRECTOR_LABELS'):
            body = re.search(table + r' = \{([\s\S]*?)\};', js).group(1)
            labels |= set(re.findall(r":\s*'([^']+)'", body))
        labels |= set(re.findall(r"heEs\('([^']+)'\)", js))
        es = read('static', 'js', 'spanish.js')
        missing = sorted(t for t in labels if f"'{t}':" not in es)
        self.assertEqual(missing, [])

    def test_wired_with_the_late_scripts(self):
        page = read('cfa-buda-ops-hub-complete.html')
        names = re.findall(r'<script src="/static/(?:js|forms)/([\w.-]+)\.js" defer>', page)
        self.assertIn('home-edit', names)
        self.assertGreater(names.index('home-edit'), names.index('early-paint'))
        he = read('static', 'js', 'home-edit.js')
        self.assertIn("'/api/me/home'", he)
        self.assertNotIn('/api/state/sync', he)
        self.assertNotIn('saveState', he)


class Api(unittest.TestCase):
    def setUp(self):
        store.clear()
        self.was = appmod.db.reference
        appmod.db.reference = lambda path: FakeRef(path)
        self.c = appmod.app.test_client()

    def tearDown(self):
        appmod.db.reference = self.was

    def as_(self, name=None, role=None, manager=False):
        with self.c.session_transaction() as s:
            s.clear()
            if name:
                s['user'] = {'name': name, 'role': role, 'via': 'pin'}
            if manager:
                s['manager'] = True

    def test_signed_out_and_the_shared_pin_keep_the_default(self):
        self.assertEqual(self.c.get('/api/me/home').status_code, 403)
        self.as_(manager=True)
        self.assertEqual(self.c.post('/api/me/home', json={'order': [], 'hidden': []}).status_code, 403)

    def test_saved_to_the_person_and_read_back(self):
        self.as_('Ana Ruiz', 'member')
        self.assertEqual(self.c.get('/api/me/home').get_json(), {'order': [], 'hidden': [], 'at': 0})
        r = self.c.post('/api/me/home', json={'order': ['shift', 'spots', 'shift', 'Bad!', 3], 'hidden': ['pea']})
        self.assertEqual(r.status_code, 200)
        got = self.c.get('/api/me/home').get_json()
        self.assertEqual((got['order'], got['hidden']), (['shift', 'spots'], ['pea']))
        self.assertGreater(got['at'], 0)
        self.assertEqual(list(store), [f"homePrefs/{appmod._pass_key('Ana Ruiz')}"])
        # Someone else has their own.
        self.as_('Leo Park', 'lead')
        self.assertEqual(self.c.get('/api/me/home').get_json()['order'], [])

    def test_not_a_layout_is_refused(self):
        self.as_('Ana Ruiz', 'member')
        self.assertEqual(self.c.post('/api/me/home', json={'order': 'spots', 'hidden': []}).status_code, 400)
        self.assertEqual(store, {})
