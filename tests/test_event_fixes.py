"""One-time corrections to the November 2026 events read from the marketing
calendar picture (Tim, Oct 22 2026: "apply them for me"): misread words,
two multi-day bars read as one-day events, the missed MLG bar. Applied by
the server when it loads the saved data, only while an event still holds the
misread text.

Run: python3 -m unittest discover tests
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
from event_fixes import fix_events, MLG  # noqa: E402

BLURB = 'Social blurb: "Join us in the dining room for fun with the family and a chance to eam sweet prizes."'


def november():
    return [
        {'id': 'oct26-goals', 'kind': 'goal', 'title': 'Monthly Goals', 'detail': 'Catering', 'date': '2026-10-01', 'end': '2026-10-31'},
        {'id': 'evi-mvhd4pjg-1', 'kind': 'goal', 'title': 'Monthly Goals', 'date': '2026-11-01', 'end': '2026-11-30',
         'detail': 'Catenng · CFA One App Usage · Mobile DT - bonus points all month'},
        {'id': 'evi-mvhd4pjg-5', 'kind': 'instore', 'title': 'Cow Bingo', 'date': '2026-11-05', 'from': '18:00', 'to': '19:00',
         'notes': [BLURB, 'Admin Logistics: Bag stuffers', 'Ops Team: OE']},
        {'id': 'evi-mvhd4pjg-11', 'kind': 'note', 'title': 'Remove Oid POP Install Holiday POP', 'date': '2026-11-14'},
        {'id': 'evi-mvhd4pjg-14', 'kind': 'note', 'title': '"" Holiday Campalgn Launches , M16-1.23', 'date': '2026-11-16'},
        {'id': 'evi-mvhd4pjg-17', 'kind': 'instore', 'title': 'Build-Your-Own Thank You Card (Arts & Crafts Event) N-12PM&',
         'date': '2026-11-23', 'from': '18:00', 'to': '19:00', 'notes': ["Social blurb: Join us this Monday for we'll provide the su"]},
        {'id': 'evi-mvhd4pjg-19', 'kind': 'drivethru', 'title': 'Receipt Day Redempt!', 'date': '2026-11-25'},
        {'id': 'evi-mvhd4pjg-20', 'kind': 'note', 'title': 'giving Break - NO Sch', 'date': '2026-11-25'},
    ]


class Fixes(unittest.TestCase):
    def test_the_misread_events_are_corrected(self):
        out, changed = fix_events(november())
        by = {e['id']: e for e in out}
        self.assertEqual(by['evi-mvhd4pjg-1']['detail'], 'Catering · CFA One App Usage · Mobile DT - bonus points all month')
        self.assertIn('a chance to earn sweet prizes', by['evi-mvhd4pjg-5']['notes'][0])
        self.assertEqual(by['evi-mvhd4pjg-5']['from'], '18:00')                            # the rest of the event kept
        self.assertEqual(by['evi-mvhd4pjg-11']['title'], 'Remove Old POP · Install Holiday POP')
        self.assertEqual(by['evi-mvhd4pjg-14']['title'], 'Holiday Campaign Launches (Nov 16 – Jan 23)')
        tyc = by['evi-mvhd4pjg-17']
        self.assertEqual(tyc['title'], 'Build-Your-Own Thank You Card (Arts & Crafts Event)')
        self.assertEqual(tyc['notes'][0], 'Also 11 AM – 12 PM')
        self.assertEqual(len(tyc['notes']), 4)
        self.assertEqual((by['evi-mvhd4pjg-19']['date'], by['evi-mvhd4pjg-19']['end']), ('2026-11-23', '2026-11-28'))
        self.assertEqual((by['evi-mvhd4pjg-20']['title'], by['evi-mvhd4pjg-20']['end']), ('Thanksgiving Break – No School', '2026-11-27'))
        self.assertEqual(by[MLG['id']], MLG)
        self.assertEqual(out[0], november()[0])                                             # October untouched
        self.assertEqual(len(changed), 8)                                                    # 7 events fixed, MLG added

    def test_again_changes_nothing(self):
        out, _ = fix_events(november())
        again, changed = fix_events(out)
        self.assertEqual(changed, [])
        self.assertIs(again, out)

    def test_an_event_edited_since_is_left_alone(self):
        events = november()
        events[3]['title'] = 'Swap to the holiday POP'
        events.append({'id': 'mine', 'title': 'MLG strips', 'kind': 'app', 'date': '2026-11-16'})
        out, changed = fix_events(events)
        self.assertEqual(out[3]['title'], 'Swap to the holiday POP')
        self.assertNotIn(MLG['id'], [e.get('id') for e in out])                             # an MLG already there: none added
        self.assertNotIn('evi-mvhd4pjg-11: Remove Old POP · Install Holiday POP', changed)

    def test_other_calendars_are_left_alone(self):
        events = [november()[0], {'id': 'x', 'title': 'Receipt Day Redempt!', 'date': '2026-12-02'}]
        self.assertEqual(fix_events(events), (events, []))
        self.assertEqual(fix_events(None), (None, []))


class ServerApplies(unittest.TestCase):
    def setUp(self):
        self.written = {}
        appmod.db.reference = lambda path: type('Ref', (), {'set': lambda _s, v: self.written.__setitem__(path, v)})()
        self.saved = dict(appmod._cache)

    def tearDown(self):
        appmod._cache.clear()
        appmod._cache.update(self.saved)

    def test_on_load_the_section_is_corrected_and_saved(self):
        name = next(n for n, keys in appmod.STATE_SECTIONS.items() if 'storeEvents' in keys)
        appmod._cache[name] = {'data': {'storeEvents': november(), 'other': 1}, 'ver': 'v1', 'canon': ''}
        appmod._apply_event_fixes()
        entry = appmod._cache[name]
        self.assertNotEqual(entry['ver'], 'v1')                                             # pages pick it up on their next sync
        self.assertEqual(entry['data']['other'], 1)
        stored = json.loads(self.written[f'{appmod.STATE_ROOT}/{name}'])
        self.assertIn(MLG['id'], [e['id'] for e in stored['storeEvents']])
        # A second load writes nothing.
        self.written.clear()
        appmod._apply_event_fixes()
        self.assertEqual(self.written, {})

    def test_called_after_every_full_read(self):
        with open(os.path.join(os.path.dirname(__file__), '..', 'app.py'), encoding='utf-8') as f:
            src = f.read()
        self.assertIn('            _cache_read_at = time.monotonic()\n        _apply_event_fixes()\n        return True', src)


if __name__ == '__main__':
    unittest.main()
