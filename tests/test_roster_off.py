"""Off the roster (Tim, Nov 24 2026): roster_off_api.py and roster-off.js.
Why someone came off a day's roster on Set Ups, kept for Team Leads and up.

Run: python3 -m unittest discover tests
Firebase is a dict of paths (FakeRef). Every name here is made up.
"""
import json
import os
import re
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
import roster_off_api as RO  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
store = {}


class FakeRef:
    def __init__(self, path):
        self.path = path.strip('/')

    def get(self):
        if self.path in store:
            return store[self.path]
        out = {}
        for p, v in store.items():
            if p.startswith(self.path + '/'):
                out[p[len(self.path) + 1:]] = v
        return out or None

    def set(self, value):
        store[self.path] = value


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


OFF = {'date': '2026-11-24', 'side': 'foh', 'name': 'Ana Ruiz', 'reason': 'callin', 'note': '',
       'start': '6:00 AM', 'end': '2:00 PM', 'entry': {'name': 'Ana Ruiz', 'start': '6:00 AM', 'end': '2:00 PM', 'source': 'import', 'evil': 'x'}}


class Api(unittest.TestCase):
    def setUp(self):
        store.clear()
        self.was = appmod.db.reference
        appmod.db.reference = lambda path: FakeRef(path)
        appmod.app.extensions['roster_off_store'].reset()
        self.c = appmod.app.test_client()
        self.as_('Maya Torres', 'lead')

    def tearDown(self):
        appmod.db.reference = self.was
        appmod.app.extensions['roster_off_store'].reset()

    def as_(self, name=None, role=None, manager=False):
        with self.c.session_transaction() as s:
            s.clear()
            if name:
                s['user'] = {'name': name, 'role': role, 'via': 'pin'}
            if manager:
                s['manager'] = True

    def send(self, typ, data, cid=''):
        return self.c.post('/api/roster-off/events', json={'type': typ, 'cid': cid, 'data': data})

    def day(self, frm='2026-11-24', to='2026-11-24', name=''):
        return self.c.get(f'/api/roster-off?from={frm}&to={to}' + (f'&name={name}' if name else ''))

    def test_a_lead_logs_why_and_it_is_kept_with_who_and_when(self):
        r = self.send('off', OFF, 'c1')
        self.assertEqual(r.status_code, 200, r.get_json())
        recs = self.day().get_json()['records']
        self.assertEqual(len(recs), 1)
        rec = recs[0]
        self.assertEqual((rec['name'], rec['reason'], rec['by'], rec['side'], rec['cid']), ('Ana Ruiz', 'callin', 'Maya Torres', 'foh', 'c1'))
        self.assertNotIn('evil', rec['entry'])                       # only a roster entry's own fields
        self.assertEqual(len([k for k in store if k.startswith('rosterOff/events/')]), 1)

    def test_sent_again_after_lost_signal_is_kept_once(self):
        self.send('off', OFF, 'c1')
        again = self.send('off', OFF, 'c1').get_json()
        self.assertTrue(again.get('again'))
        self.assertEqual(len(self.day().get_json()['records']), 1)

    def test_put_back_takes_the_record_back_by_its_id_or_the_phones(self):
        eid = self.send('off', OFF, 'c1').get_json()['id']
        self.send('off', {**OFF, 'name': 'Ben Cole'}, 'c2')
        self.assertEqual(self.send('undo', {'of': eid}, 'u1').status_code, 200)
        self.assertEqual(self.send('undo', {'of': 'c2'}, 'u2').status_code, 200)   # sent before the phone knew the id
        self.assertEqual(self.day().get_json()['records'], [])
        self.assertEqual(self.send('undo', {'of': 'nope'}, 'u3').status_code, 404)

    def test_only_team_leads_and_up(self):
        for role in ('member', 'trainer'):
            self.as_('Sam Lee', role)
            self.assertEqual(self.send('off', OFF).status_code, 403)
            self.assertEqual(self.day().status_code, 403)
        self.as_()
        self.assertEqual(self.day().status_code, 401)
        for who in (('Dana Park', 'director'), ('Ash Gray', 'admin')):
            self.as_(*who)
            self.assertEqual(self.day().status_code, 200)
        self.as_(manager=True)
        self.assertEqual(self.send('off', OFF).status_code, 200)
        self.assertEqual(self.day().get_json()['records'][0]['by'], 'Director')

    def test_what_is_refused(self):
        self.assertEqual(self.send('off', {**OFF, 'reason': 'sick'}).status_code, 400)
        self.assertEqual(self.send('off', {**OFF, 'reason': 'other'}).status_code, 400)          # other needs a note
        self.assertEqual(self.send('off', {**OFF, 'reason': 'other', 'note': 'Car broke down'}).status_code, 200)
        self.assertEqual(self.send('off', {**OFF, 'side': 'x'}).status_code, 400)
        self.assertEqual(self.send('off', {**OFF, 'date': '11/24'}).status_code, 400)
        self.assertEqual(self.send('off', {**OFF, 'name': ' '}).status_code, 400)
        self.assertEqual(self.send('nope', OFF).status_code, 400)
        self.assertEqual(self.day('2026-11-24', '2026-11-01').status_code, 400)
        self.assertEqual(self.day('2025-01-01', '2026-11-24').status_code, 400)                 # too many days
        long = self.send('off', {**OFF, 'note': 'x' * 900}, 'c9')
        self.assertEqual(long.status_code, 200)
        self.assertEqual(len(self.day().get_json()['records'][0]['note']), RO.NOTE_MAX)

    def test_look_back_counts_each_persons_call_ins_and_filters_by_name(self):
        self.send('off', OFF, 'a')
        self.send('off', {**OFF, 'date': '2026-11-20', 'reason': 'noshow'}, 'b')
        self.send('off', {**OFF, 'date': '2026-11-21', 'reason': 'swap'}, 'c')
        self.send('off', {**OFF, 'name': 'Ben Cole', 'date': '2026-11-22', 'side': 'boh', 'reason': 'mistake'}, 'd')
        d = self.day('2026-11-01', '2026-11-30').get_json()
        self.assertEqual([r['date'] for r in d['records']], ['2026-11-24', '2026-11-22', '2026-11-21', '2026-11-20'])
        ana = d['people'][0]
        self.assertEqual((ana['name'], ana['attendance'], ana['counts']), ('Ana Ruiz', 2, {'callin': 1, 'noshow': 1, 'swap': 1}))
        self.assertEqual(d['people'][1]['attendance'], 0)          # a mistake isn't held against anyone
        only = self.day('2026-11-01', '2026-11-30', 'ana%20ruiz').get_json()
        self.assertEqual({r['name'] for r in only['records']}, {'Ana Ruiz'})

    def test_another_servers_record_is_picked_up(self):
        store['rosterOff/events/0001790000000000-abc123'] = {'id': '0001790000000000-abc123', 'at': 1790000000000, 'type': 'off',
                                                             'by': 'x', 'byName': 'Lee Ham', 'data': {**OFF, 'name': 'Cam Diaz'}}
        appmod.app.extensions['roster_off_store'].reset()
        self.assertEqual([r['name'] for r in self.day().get_json()['records']], ['Cam Diaz'])

    def test_never_a_saved_state_section(self):
        for keys in appmod.STATE_SECTIONS.values():
            self.assertFalse([k for k in keys if 'rosterOff' in k or 'roster_off' in k])


class Page(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.js = read('static', 'js', 'roster-off.js')
        cls.dp = read('static', 'js', 'daypicker-and-positions.js')
        out = subprocess.run(['node', os.path.join(ROOT, 'tests', 'spanish_runner.js')], capture_output=True, text=True, check=True)
        cls.G = json.loads(out.stdout)

    def test_the_x_asks_why_and_only_a_lead_can_use_it(self):
        self.assertIn("if(typeof roOpen === 'function') return roOpen(remove.dataset.rosterRemove);", self.dp)
        self.assertIn("if(typeof siMayChange === 'function' && !siMayChange('fohRoster')){ siOpen(siWhy(['fohRoster'])); return; }\n    if(typeof roOpen", self.dp)
        self.assertIn("if(!why && !confirm(", self.dp)
        self.assertIn("roOffHtml(dayName, currentPosSection)", self.dp)

    def test_the_record_is_kept_on_the_phone_before_the_roster_changes(self):
        body = self.js[self.js.index('async function roTakeOff'):]
        self.assertLess(body.index("roQueue('off'"), body.index('await removeFromRoster(s.name, s.reason);'))
        self.assertIn('localStorage.setItem(RO_OUTBOX_KEY', self.js)
        self.assertIn("window.addEventListener('online'", self.js)

    def test_reasons_match_the_server(self):
        got = re.findall(r"\['(\w+)', '([^']+)', '(\w+)'\]", self.js[self.js.index('const RO_REASONS'):self.js.index('const RO_ATTENDANCE')])
        self.assertEqual([(i, label) for i, label, _ in got], list(RO.REASONS.items()))
        self.assertEqual(re.findall(r"'(\w+)'", self.js[self.js.index('const RO_ATTENDANCE'):].split('\n')[0]), list(RO.ATTENDANCE))

    def test_the_kitchens_side_has_every_phrase_in_spanish(self):
        asked = {m.group(2) for m in re.finditer(r"""\broEs\(\s*(['"])((?:\\.|(?!\1).)*)\1""", self.js)}
        asked |= set(RO.REASONS.values())
        self.assertGreater(len(asked), 15)
        self.assertEqual(sorted(k for k in asked if k not in self.G['keys']), [])

    def test_an_import_keeps_someone_taken_off_off(self):
        wi = read('static', 'js', 'weekly-roster-import.js')
        self.assertIn("roKeptOff(dateISO, side, p.name)", wi)
        self.assertIn("await roLoadRange(weekDays[0].date, weekDays[weekDays.length - 1].date, 4000);", wi)

    def test_loads_with_the_late_scripts(self):
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertLess(page.index('weekly-roster-import.js'), page.index('roster-off.js'))

    def test_records_as_the_phone_sees_them(self):
        code = self.js[:self.js.index('// ----- sending')] + r'''
          roDays['2026-11-24'] = {at: Date.now(), records: [
            {id: 's1', cid: 'c1', date: '2026-11-24', side: 'foh', name: 'Ana Ruiz', reason: 'callin', at: 1},
            {id: 's2', cid: 'c2', date: '2026-11-24', side: 'boh', name: 'Ben Cole', reason: 'noshow', at: 2}]};
          roOutbox = [
            {type: 'off', cid: 'c3', at: 3, data: {date: '2026-11-24', side: 'foh', name: 'Cam Diaz', reason: 'senthome'}},
            {type: 'undo', cid: 'u1', at: 4, data: {of: 's1'}}];
          console.log(JSON.stringify({
            foh: roRecordsFor('2026-11-24', 'foh').map(r => r.name),
            all: roRecordsFor('2026-11-24').length,
            kept: [roKeptOff('2026-11-24', 'foh', 'cam  diaz'), roKeptOff('2026-11-24', 'foh', 'Ana Ruiz'), roKeptOff('2026-11-24', 'foh', 'Ben Cole')]}));
        '''
        prelude = "const localStorage = {getItem(){return null;}, setItem(){}}; const rnSame = () => false;\n"
        out = subprocess.run(['node', '-e', prelude + code], capture_output=True, text=True, check=True)
        got = json.loads(out.stdout)
        self.assertEqual(got['foh'], ['Cam Diaz'])            # Ana was put back; Ben is the kitchen's
        self.assertEqual(got['all'], 2)
        self.assertEqual(got['kept'], [True, False, False])


if __name__ == '__main__':
    unittest.main()
