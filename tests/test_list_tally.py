"""The leaders' list tally and the 14-day trim (Tim, Nov 23 2026;
list_tally.py, app.py "LISTS"). Each finished day's Zone Resets become one
small record per handoff (its Lead Captain, items done, items in all), kept
for good; only then ticks and finished breaks older than 14 days leave the
saved sections. Nothing inside the 14 days is touched, and nothing is
trimmed unless the record and a one-time backup were written first.

Names are made up.
"""
import hashlib
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
import huddle_api  # noqa: E402
import list_tally  # noqa: E402
import timers_api  # noqa: E402
from state_patch import canon  # noqa: E402

TODAY = '2026-11-23'
FIRST_KEPT = '2026-11-09'          # 14 days back
H = [name for name, _ in huddle_api.HANDOFFS]
LEAD = timers_api.LEAD_CAPTAIN
DP = dict((lead_from, next(n for n, _ in timers_api.FOH_DAYPARTS if n.startswith(lead_from + ' ('))) for _, lead_from in huddle_api.HANDOFFS)


def marks(n, zone='Dining Room'):
    return {zone: {f'item {i}': {'initials': 'AR', 'at': 1} for i in range(n)}}


def sections():
    return {
        'ops': {'zoneChecklistState': {
            '2026-09-04': {H[0]: marks(3)},                                   # long gone from Set Ups
            '2026-11-08': {H[0]: marks(10), H[1]: marks(4)},                  # the last day to go
            '2026-11-09': {H[0]: marks(5)},                                   # the first day kept
            '2026-11-22': {H[1]: marks(8)},
            TODAY: {H[0]: marks(2)},
        }, 'numbersData': {'2026-11-22': {'x': 1}}},
        'setups': {'posAssignments': {
            f'foh||2026-11-09||{DP["Breakfast"]}||{LEAD}': 'Dana Reyes',
            f'foh||2026-11-22||{DP["Lunch"]}||{LEAD}': 'Ben Cole/Ana Ruiz',
            f'foh||2026-11-22||{DP["Dinner"]}||{LEAD}': 'Ben Cole',           # led it, nothing ticked
            f'foh||2026-11-22||{DP["Lunch"]}||iPOS 1': 'Maya Torres',
            f'foh||{TODAY}||{DP["Breakfast"]}||{LEAD}': 'Dana Reyes',
        }, 'completedBreaks': {
            'foh||2026-11-08||Ana Ruiz': True, 'boh||2026-11-09||Ben Cole': True, f'foh||{TODAY}||Ana Ruiz': True,
            'Maya Torres2026-10-05': True, 'Maya Torres2026-11-20': True, 'no day here': True,
        }, 'zoneOwners': {'2026-11-22': {}}},
        'history': {'setupHistory': {
            'slots': [f'foh||{DP["Breakfast"]}||{LEAD}', f'foh||{DP["Lunch"]}||{LEAD}', f'foh||{DP["Lunch"]}||iPOS 1', f'boh||{DP["Breakfast"]}||{LEAD}'],
            'names': ['Dana Reyes', 'Ben Cole', 'Maya Torres'],
            'days': {'2026-11-08': [[0, 0], [1, 1], [1, 0], [2, 2], [3, 2]]},
        }, 'zoneChecklistHistory': {'2026-09-04': {'overall': 4}}},
    }


class Rules(unittest.TestCase):
    def test_fourteen_days_are_kept(self):
        self.assertEqual(list_tally.KEEP_DAYS, 14)
        self.assertEqual(list_tally.cutoff(TODAY), FIRST_KEPT)

    def test_a_handoffs_total_is_the_pages(self):
        self.assertEqual(list_tally.HANDOFF_TOTAL, sum(huddle_api.ZONE_ITEMS.values()))
        self.assertEqual(list_tally.HANDOFF_TOTAL, 74)

    def test_a_zone_never_counts_over_its_size(self):
        self.assertEqual(list_tally.checked_in(marks(99)), huddle_api.ZONE_ITEMS['Dining Room'])
        self.assertEqual(list_tally.checked_in({'Dining Room': {'a': True, 'b': False, 'c': None}, 'Not a zone': {'a': True}}), 1)
        self.assertEqual(list_tally.checked_in(None), 0)

    def test_the_lead_captain_from_set_ups_then_its_history(self):
        s = sections()
        pa, hist = s['setups']['posAssignments'], s['history']['setupHistory']
        self.assertEqual(list_tally.lead_of('2026-11-09', 'Breakfast', pa, hist), 'Dana Reyes')
        self.assertEqual(list_tally.lead_of('2026-11-08', 'Breakfast', pa, hist), 'Dana Reyes')      # Set Ups let it go; the history has it
        self.assertEqual(list_tally.lead_of('2026-11-08', 'Lunch', pa, hist), 'Ben Cole/Dana Reyes')  # handed off: both
        self.assertEqual(list_tally.lead_of('2026-09-04', 'Breakfast', pa, hist), '')
        self.assertEqual(list_tally.lead_of('2026-11-08', 'Nowhere', pa, hist), '')

    def test_a_days_record(self):
        s = sections()
        rec = list_tally.tally_day('2026-11-22', s['ops']['zoneChecklistState']['2026-11-22'], s['setups']['posAssignments'], s['history']['setupHistory'])
        self.assertEqual(rec, {
            H[1]: {'lead': 'Ben Cole/Ana Ruiz', 'checked': 8, 'total': 74},
            H[3]: {'lead': 'Ben Cole', 'checked': 0, 'total': 74},                 # led it and nothing was ticked: it counts
        })
        # No ticks and no Lead Captain anywhere: nothing to say.
        self.assertEqual(list_tally.tally_day('2026-11-15', None, {}, {}), {})

    def test_a_lead_the_hub_can_no_longer_name_keeps_the_one_on_record(self):
        kept = {H[0]: {'lead': 'Dana Reyes', 'checked': 1, 'total': 74}}
        rec = list_tally.tally_day('2026-09-04', {H[0]: marks(3)}, {}, {}, kept)
        self.assertEqual(rec, {H[0]: {'lead': 'Dana Reyes', 'checked': 3, 'total': 74}})

    def test_a_breaks_day(self):
        self.assertEqual(list_tally.break_day('foh||2026-11-08||Ana Ruiz'), '2026-11-08')
        self.assertEqual(list_tally.break_day('Maya Torres2026-10-05'), '2026-10-05')
        self.assertIsNone(list_tally.break_day('no day here'))


class Plan(unittest.TestCase):
    def setUp(self):
        self.s = sections()
        self.plan = list_tally.plan(self.s, TODAY, {})

    def test_every_finished_day_gets_its_record_and_today_none(self):
        self.assertEqual(sorted(self.plan['tally']), ['2026-09-04', '2026-11-08', '2026-11-09', '2026-11-22'])
        self.assertEqual(self.plan['tally']['2026-09-04'], {H[0]: {'lead': '', 'checked': 3, 'total': 74}})      # no name to be had: kept without one
        self.assertEqual(self.plan['tally']['2026-11-08'][H[0]], {'lead': 'Dana Reyes', 'checked': 10, 'total': 74})
        self.assertEqual(self.plan['tally']['2026-11-08'][H[1]], {'lead': 'Ben Cole/Dana Reyes', 'checked': 4, 'total': 74})

    def test_only_days_before_the_fourteen_are_trimmed(self):
        self.assertEqual(self.plan['ops']['ops'], [{'o': 'del', 'p': ['zoneChecklistState', '2026-09-04']}, {'o': 'del', 'p': ['zoneChecklistState', '2026-11-08']}])
        self.assertEqual(self.plan['ops']['setups'], [{'o': 'del', 'p': ['completedBreaks', 'Maya Torres2026-10-05']},
                                                    {'o': 'del', 'p': ['completedBreaks', 'foh||2026-11-08||Ana Ruiz']}])

    def test_ticks_the_record_cant_count_are_left_where_they_are(self):
        """September's ticks sit under handoffs the hub no longer has: never trimmed uncounted."""
        self.s['ops']['zoneChecklistState']['2026-09-15'] = {'Early Breakfast (6:00-8:00)': marks(4)}
        self.s['ops']['zoneChecklistState']['2026-09-16'] = {H[0]: {'A zone long gone': {'x': True}}}
        self.s['ops']['zoneChecklistState']['2026-09-17'] = {'Early Breakfast (6:00-8:00)': {'Dining Room': {'x': False}}}    # nothing ticked: goes
        gone = {op['p'][1] for op in list_tally.plan(self.s, TODAY, {})['ops']['ops']}
        self.assertEqual(gone, {'2026-09-04', '2026-09-17', '2026-11-08'})
        self.assertFalse(list_tally.all_counted({'Old handoff': marks(1)}))
        self.assertTrue(list_tally.all_counted({H[0]: marks(3)}))
        self.assertTrue(list_tally.all_counted(None))

    def test_every_day_trimmed_is_in_the_tally_first(self):
        gone = {op['p'][1] for op in self.plan['ops']['ops']}
        self.assertTrue(gone <= set(self.plan['tally']))

    def test_only_the_two_keys_are_ever_touched(self):
        for name, ops in self.plan['ops'].items():
            for op in ops:
                self.assertEqual(op['o'], 'del')
                self.assertEqual(len(op['p']), 2)
                self.assertIn(op['p'][0], {'ops': ('zoneChecklistState',), 'setups': ('completedBreaks',)}[name])

    def test_a_second_run_writes_and_trims_nothing(self):
        after = {name: appmod.apply_ops(self.s[name], self.plan['ops'].get(name, [])) for name in self.s}
        again = list_tally.plan(after, TODAY, dict(self.plan['tally']))
        self.assertEqual(again, {'tally': {}, 'ops': {}})

    def test_a_late_tick_inside_the_fourteen_days_is_counted(self):
        tally = dict(self.plan['tally'])
        self.s['ops']['zoneChecklistState']['2026-11-22'][H[1]] = marks(10)
        again = list_tally.plan(self.s, TODAY, tally)
        self.assertEqual(list(again['tally']), ['2026-11-22'])
        self.assertEqual(again['tally']['2026-11-22'][H[1]]['checked'], 10)

    def test_nothing_saved_yet(self):
        for nothing in (None, {}, {'ops': 'x', 'setups': None}, {'ops': {'zoneChecklistState': {'not a day': {}, 5: {}}}}):
            self.assertEqual(list_tally.plan(nothing, TODAY, None), {'tally': {}, 'ops': {}})


class Scores(unittest.TestCase):
    def test_each_lead_captains_lists_add_up(self):
        tally = list_tally.plan(sections(), TODAY, {})['tally']
        got = {r['lead']: r for r in list_tally.scores(tally)}
        self.assertEqual(got['Dana Reyes'], {'lead': 'Dana Reyes', 'handoffs': 3, 'checked': 19, 'total': 222, 'pct': 9})   # 10 + 4 (shared) + 5
        self.assertEqual(got['Ben Cole'], {'lead': 'Ben Cole', 'handoffs': 3, 'checked': 12, 'total': 222, 'pct': 5})       # 4 + 8 (shared) + 0
        self.assertEqual(got['Ana Ruiz']['handoffs'], 1)
        self.assertEqual(got['']['checked'], 3)                                # no Lead Captain known
        self.assertEqual({r['lead'] for r in list_tally.scores(tally, since='2026-11-20')}, {'Ben Cole', 'Ana Ruiz'})
        self.assertEqual(list_tally.scores(None), [])


class Store:
    """Firebase, as far as the upkeep uses it; `fail` names a path whose write breaks."""
    def __init__(self, stored):
        self.data, self.writes, self.fail = stored, [], None

    def reference(self, path):
        store = self

        class Ref:
            def get(self, etag=False):
                if path == appmod.STATE_ROOT:
                    return {k[len(path) + 1:]: v for k, v in store.data.items() if k.startswith(path + '/')}
                if path == list_tally.TALLY_PATH:
                    return {k[len(path) + 1:]: v for k, v in store.data.items() if k.startswith(path + '/')} or None
                value = store.data.get(path)
                return (value, hashlib.sha1(json.dumps(value).encode()).hexdigest()) if etag else value

            def set(self, value):
                if store.fail and path.startswith(store.fail):
                    raise RuntimeError('the database is down')
                store.writes.append(path)
                store.data[path] = value

            def set_if_unchanged(self, expected, value):
                current = store.data.get(path)
                tag = lambda v: hashlib.sha1(json.dumps(v).encode()).hexdigest()
                if tag(current) != expected:
                    return False, current, tag(current)
                self.set(value)
                return True, value, tag(value)
        return Ref()


class Server(unittest.TestCase):
    def setUp(self):
        self.s = sections()
        self.store = Store({f'{appmod.STATE_ROOT}/{name}': json.dumps(self.s[name]) for name in self.s})
        self._ref, self._cache, self._lists = appmod.db.reference, dict(appmod._cache), dict(appmod._lists)
        appmod.db.reference = self.store.reference
        appmod._cache.clear()
        for name in self.s:
            appmod._cache[name] = {'data': self.s[name], 'ver': 'v1', 'canon': canon(self.s[name])}
        appmod._etags.clear()
        appmod._lists.update(day=None, running=False, tally=None)

    def tearDown(self):
        appmod.db.reference = self._ref
        appmod._cache.clear()
        appmod._cache.update(self._cache)
        appmod._etags.clear()
        appmod._lists.clear()
        appmod._lists.update(self._lists)

    def stored(self, name):
        return json.loads(self.store.data[f'{appmod.STATE_ROOT}/{name}'])

    def test_the_record_then_the_backup_then_the_trim(self):
        before = {name: json.dumps(self.s[name]) for name in self.s}
        days, trimmed = appmod._lists_upkeep(TODAY)
        self.assertEqual(days, ['2026-09-04', '2026-11-08', '2026-11-09', '2026-11-22'])
        self.assertEqual(trimmed, ['ops', 'setups'])
        w = self.store.writes
        first_trim = min(w.index(f'{appmod.STATE_ROOT}/ops'), w.index(f'{appmod.STATE_ROOT}/setups'))
        self.assertTrue(all(w.index(f'{list_tally.TALLY_PATH}/{d}') < first_trim for d in days))
        for name in ('ops', 'setups', 'history'):
            self.assertLess(w.index(f'{appmod.PRE_TRIM_BACKUP}/{name}'), first_trim)
            self.assertEqual(self.store.data[f'{appmod.PRE_TRIM_BACKUP}/{name}'], before[name])       # whole, as it was
        # What's left: the 14 days, today, and everything that isn't ticks or finished breaks.
        self.assertEqual(sorted(self.stored('ops')['zoneChecklistState']), ['2026-11-09', '2026-11-22', TODAY])
        self.assertEqual(self.stored('ops')['zoneChecklistState'][TODAY], self.s['ops']['zoneChecklistState'][TODAY])
        self.assertEqual(self.stored('ops')['numbersData'], self.s['ops']['numbersData'])
        self.assertEqual(sorted(self.stored('setups')['completedBreaks']), ['Maya Torres2026-11-20', 'boh||2026-11-09||Ben Cole', f'foh||{TODAY}||Ana Ruiz', 'no day here'])
        self.assertEqual(self.stored('setups')['posAssignments'], self.s['setups']['posAssignments'])
        self.assertEqual(self.stored('setups')['zoneOwners'], self.s['setups']['zoneOwners'])
        self.assertEqual(self.stored('history'), self.s['history'])                                    # never written
        self.assertNotEqual(appmod._cache['ops']['ver'], 'v1')                                          # phones pick the smaller section up
        self.assertEqual(appmod._cache['history']['ver'], 'v1')

    def test_a_second_run_does_nothing(self):
        appmod._lists_upkeep(TODAY)
        self.store.writes.clear()
        self.assertEqual(appmod._lists_upkeep(TODAY), ([], []))
        self.assertEqual(self.store.writes, [])

    def test_no_trim_when_the_record_cant_be_written(self):
        self.store.fail = list_tally.TALLY_PATH
        with self.assertRaises(RuntimeError):
            appmod._lists_upkeep(TODAY)
        self.assertEqual(self.stored('ops'), self.s['ops'])
        self.assertEqual(self.stored('setups'), self.s['setups'])

    def test_no_trim_when_the_backup_cant_be_written(self):
        self.store.fail = appmod.PRE_TRIM_BACKUP
        with self.assertRaises(RuntimeError):
            appmod._lists_upkeep(TODAY)
        self.assertEqual(self.stored('ops'), self.s['ops'])
        self.assertEqual(self.stored('setups'), self.s['setups'])
        self.assertNotIn(f'{appmod.ONCE_PATH}/preTrimBackup', self.store.data)

    def test_the_backup_is_taken_once(self):
        appmod._lists_upkeep(TODAY)
        kept = self.store.data[f'{appmod.PRE_TRIM_BACKUP}/ops']
        # A later day ages out: trimmed, and the first backup stays as it was.
        self.store.writes.clear()
        appmod._lists_upkeep('2026-11-24')
        self.assertNotIn('2026-11-09', self.stored('ops')['zoneChecklistState'])
        self.assertEqual(self.store.data[f'{appmod.PRE_TRIM_BACKUP}/ops'], kept)
        self.assertFalse([p for p in self.store.writes if p.startswith(appmod.PRE_TRIM_BACKUP)])

    def test_a_tick_another_server_saved_meanwhile_is_kept(self):
        """A deploy's overlap: the stored section moved on since this server read it."""
        newer = json.loads(json.dumps(self.s['ops']))
        newer['zoneChecklistState'][TODAY][H[2]] = marks(1)
        self.store.data[f'{appmod.STATE_ROOT}/ops'] = json.dumps(newer)
        appmod._lists_upkeep(TODAY)
        self.assertEqual(self.stored('ops')['zoneChecklistState'][TODAY][H[2]], marks(1))
        self.assertNotIn('2026-09-04', self.stored('ops')['zoneChecklistState'])

    def test_the_totals_are_for_directors(self):
        c = appmod.app.test_client()
        self.assertEqual(c.get('/api/lists/tally').status_code, 403)
        with c.session_transaction() as sess:
            sess['user'] = {'name': 'Ana Ruiz', 'role': 'lead', 'via': 'pin'}
        self.assertEqual(c.get('/api/lists/tally').status_code, 403)
        appmod._lists_upkeep(TODAY)
        with c.session_transaction() as sess:
            sess.clear()
            sess['manager'] = True
        r = c.get('/api/lists/tally')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()['days'], 4)
        self.assertEqual(r.get_json()['leaders'][0]['lead'], 'Ben Cole')
        self.assertEqual(c.get('/api/lists/tally?since=nope').status_code, 400)


class Wiring(unittest.TestCase):
    def setUp(self):
        with open(os.path.join(os.path.dirname(__file__), '..', 'app.py'), encoding='utf-8') as f:
            self.src = f.read()

    def test_off_a_load_or_a_sync_in_the_background(self):
        self.assertEqual(self.src.count('        _refresh_if_due()\n        _lists_upkeep_if_due()\n'), 2)
        self.assertIn('threading.Thread(target=run, daemon=True).start()', self.src)

    def test_clear_of_a_deploys_overlap_and_once_a_day(self):
        self.assertEqual(appmod.LISTS_UPKEEP_AFTER_BOOT_SECONDS, 600)
        self.assertIn("_lists['day'] == today", self.src)

    def test_no_saved_setting_is_added_renamed_or_removed(self):
        keys = {k for ks in appmod.STATE_SECTIONS.values() for k in ks}
        self.assertTrue({'zoneChecklistState', 'completedBreaks', 'zoneChecklistHistory', 'setupHistory'} <= keys)
        self.assertFalse(any('tally' in k.lower() for k in keys))                 # the tally is its own record, never a saved section


if __name__ == '__main__':
    unittest.main()
