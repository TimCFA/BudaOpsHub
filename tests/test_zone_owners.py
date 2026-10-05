"""Zone resets owned by positions (static/js/zone-reset.js), run in node."""
import json
import os
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, 'tests', 'zone_owners_runner.js')


def run(cases):
    out = subprocess.run(['node', RUNNER], input=json.dumps({'cases': cases}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def owners(assignments, handed, zone, handoff='Lunch to Mid (1:00pm - 2:00pm)', date='2026-10-06'):
    return run([{
        'op': "c => { posAssignments = c.assignments; zoneOwners = c.handed; const o = zrZoneOwners(c.date, c.handoff, c.zone); return {all: o.all, fromPos: o.fromPos, added: o.added, dp: o.dp && o.dp.name}; }",
        'assignments': assignments, 'handed': handed, 'zone': zone, 'handoff': handoff, 'date': date}])[0]


T = 'foh||2026-10-06||Transition (1:00-2:00)||'


class HandoffDaypart(unittest.TestCase):
    def test_each_handoff_lands_on_the_set_up_on_the_floor(self):
        got = run([{'op': "() => zoneResetDayparts.map(h => [h.name.split(' (')[0], zrHandoffDaypart(h).name])"}])[0]
        self.assertEqual(got, [
            ['Breakfast to Lunch', 'Lunch (10:30-1:00)'],
            ['Lunch to Mid', 'Transition (1:00-2:00)'],
            ['Mid to Dinner', 'Mid (2:00-5:00)'],
            ['Dinner to Late Night', 'Dinner (5:00-8:00)'],
            ['Close', 'Close (8:00-10:00)'],
        ])

    def test_daypart_to_handoff_and_back(self):
        got = run([{'op': "() => fohDayparts.map(d => [d.name, zrHandoffForDaypart(d.name) && zrHandoffForDaypart(d.name).name.split(' (')[0]])"}])[0]
        self.assertEqual(dict(got), {
            'Early Breakfast (6:00-8:00)': None, 'Breakfast (8:00-10:30)': None,
            'Lunch (10:30-1:00)': 'Breakfast to Lunch', 'Transition (1:00-2:00)': 'Lunch to Mid',
            'Mid (2:00-5:00)': 'Mid to Dinner', 'Dinner (5:00-8:00)': 'Dinner to Late Night',
            'Close (8:00-10:00)': 'Close'})

    def test_every_daypart_has_its_position_list(self):
        got = run([{'op': "() => [fohDayparts.map(d => d.name), Object.keys(fohPositions), bohDayparts.map(d => d.name), Object.keys(bohPositions)]"}])[0]
        self.assertEqual(got[0], got[1])
        self.assertEqual(got[2], got[3])
        self.assertIn('Lunch (10:30-2:00)', got[2])   # BOH's Mid is Lunch

    def test_zone_rows_are_gone_from_transition_and_close(self):
        got = run([{'op': "() => ['Transition (1:00-2:00)', 'Close (8:00-10:00)'].map(d => fohPositions[d].filter(p => /zone|din+ing/i.test(p)))"}])[0]
        self.assertEqual(got, [[], []])
        kept = run([{'op': "() => [fohPositions['Transition (1:00-2:00)'].includes('Lemonades'), fohPositions['Transition (1:00-2:00)'].includes('Pouches'), fohPositions['Close (8:00-10:00)'].includes('Floors')]"}])[0]
        self.assertEqual(kept, [True, True, True])


class Owners(unittest.TestCase):
    def test_positions_own_their_zones(self):
        a = {T + 'Drinks 1': 'Caleb Brooks', T + 'DT Bagger 1 (Cockpit Cap)': 'Priya Nair', T + 'FC Bagger': 'Ava Morales',
             T + 'OMD 1': 'Grace Kim', T + 'Host 1 (Captain)': 'Sofia Alvarez', T + 'Runner': 'Ethan Walsh',
             T + 'iPOS 1 (Captain)': 'Noah Bennett', T + 'iPOS 2 LANE 2': 'Liam Patel', T + 'Lead Captain': 'Maya Torres'}
        self.assertEqual(owners(a, {}, 'Drinks Zone')['all'], ['Caleb Brooks'])
        self.assertEqual(owners(a, {}, 'Bagging Station')['all'], ['Priya Nair'])
        self.assertEqual(owners(a, {}, 'Front Counter')['all'], ['Ava Morales'])
        self.assertEqual(owners(a, {}, 'Dining Room')['all'], ['Sofia Alvarez'])
        self.assertEqual(owners(a, {}, 'Restrooms')['all'], ['Sofia Alvarez'])
        self.assertEqual(owners(a, {}, 'Outside')['all'], ['Grace Kim'])
        self.assertEqual(owners(a, {}, 'The Spot')['all'], ['Ethan Walsh'])
        self.assertEqual(owners(a, {}, 'Final Check')['all'], ['Maya Torres'])
        # Drink 3 is open, so nobody has the Soda Room.
        o = owners(a, {}, 'Soda Room / Tea Station')
        self.assertEqual(o['all'], [])
        self.assertEqual(o['dp'], 'Transition (1:00-2:00)')

    def test_lemonades_counts_for_drinks_and_a_split_spot_names_both(self):
        a = {T + 'Lemonades': 'Jordan Reyes', T + 'Drinks 1': 'Caleb Brooks/Chloe Nguyen'}
        self.assertEqual(owners(a, {}, 'Drinks Zone')['all'], ['Caleb Brooks', 'Chloe Nguyen', 'Jordan Reyes'])

    def test_handed_zone_adds_without_doubling(self):
        a = {T + 'Drinks 1': 'Caleb Brooks'}
        handed = {'2026-10-06': {'Lunch to Mid (1:00pm - 2:00pm)': {'Drinks Zone': ['Grace Kim', 'caleb brooks'], 'Soda Room / Tea Station': ['Grace Kim']}}}
        o = owners(a, handed, 'Drinks Zone')
        self.assertEqual(o['all'], ['Caleb Brooks', 'Grace Kim'])
        self.assertEqual(o['fromPos'], ['Caleb Brooks'])
        self.assertEqual(o['added'], ['Grace Kim'])
        self.assertEqual(owners(a, handed, 'Soda Room / Tea Station')['added'], ['Grace Kim'])

    def test_hand_and_unhand(self):
        got = run([{'op': """() => {
            zoneOwners = {}; posAssignments = {};
            zrHandZone('2026-10-06', 'Close', 'Outside', 'Noah Bennett');
            zrHandZone('2026-10-06', 'Close', 'Outside', 'noah bennett');
            const after = JSON.parse(JSON.stringify(zoneOwners));
            const unowned = zrUnownedZones('2026-10-06', 'Close').length;
            zrUnhandZone('2026-10-06', 'Close', 'Outside');
            return [after, unowned, zoneOwners];
        }"""}])[0]
        self.assertEqual(got[0], {'2026-10-06': {'Close': {'Outside': ['Noah Bennett']}}})
        self.assertEqual(got[1], 8)
        self.assertEqual(got[2], {})

    def test_other_handoffs_use_their_own_set_up(self):
        a = {'foh||2026-10-06||Lunch (10:30-1:00)||Host 1 (Captain)': 'Sofia Alvarez', 'foh||2026-10-06||Close (8:00-10:00)||Drinks 3': 'Ethan Walsh'}
        self.assertEqual(owners(a, {}, 'Dining Room', 'Breakfast to Lunch (10:30am - 11:30am)')['all'], ['Sofia Alvarez'])
        self.assertEqual(owners(a, {}, 'Soda Room / Tea Station', 'Close')['all'], ['Ethan Walsh'])
        self.assertEqual(owners(a, {}, 'Dining Room')['all'], [])


class OutsideIsOmd(unittest.TestCase):
    def test_close_omd_owns_outside_and_ipos_owns_nothing(self):
        a = {'foh||2026-10-06||Close (8:00-10:00)||OMD': 'Grace Kim', 'foh||2026-10-06||Close (8:00-10:00)||iPOS 1 LANE 1': 'Noah Bennett'}
        self.assertEqual(owners(a, {}, 'Outside', 'Close')['all'], ['Grace Kim'])
        self.assertEqual(owners(a, {}, 'Front Counter', 'Close')['all'], [])


class SetupExists(unittest.TestCase):
    def test_a_handoff_without_a_set_up_is_not_unowned(self):
        got = run([{'op': "() => { posAssignments = {'foh||2026-10-06||Transition (1:00-2:00)||Runner': 'Ethan Walsh'}; return [zrSetupExists('2026-10-06', 'Lunch to Mid (1:00pm - 2:00pm)'), zrSetupExists('2026-10-06', 'Close'), zrSetupExists('2026-10-07', 'Lunch to Mid (1:00pm - 2:00pm)')]; }"}])[0]
        self.assertEqual(got, [True, False, False])


class Notes(unittest.TestCase):
    def test_notes_need_text_and_initials_and_are_signed(self):
        got = run([{'op': """() => {
            posNotes = {};
            const k = 'foh||2026-10-06||Transition (1:00-2:00)||Drinks 1';
            const r = [addPosNote(k, '  ', 'JD'), addPosNote(k, 'Lemonade fridge runs warm', ''), addPosNote(k, 'Lemonade fridge runs warm', 'jd')];
            const n = posNotesFor(k).map(x => [x.text, x.by, typeof x.ts]);
            removePosNote(k, 0);
            return [r, n, posNotes];
        }"""}])[0]
        self.assertEqual(got[0], [False, False, True])
        self.assertEqual(got[1], [['Lemonade fridge runs warm', 'JD', 'number']])
        self.assertEqual(got[2], {})

    def test_old_owners_and_notes_are_pruned(self):
        got = run([{'op': """() => {
            zoneOwners = {'2026-07-01': {Close: {Outside: ['A']}}, '2026-10-06': {Close: {Outside: ['B']}}};
            posNotes = {'foh||2026-07-01||Close (8:00-10:00)||Drinks 1': [{text: 'x', by: 'JD', ts: 1}], 'foh||2026-10-06||Close (8:00-10:00)||Drinks 1': [{text: 'y', by: 'JD', ts: 1}]};
            const pruned = pruneZoneOwnersAndNotes('2026-08-07');
            return [pruned, Object.keys(zoneOwners), Object.keys(posNotes), pruneZoneOwnersAndNotes('2026-08-07')];
        }"""}])[0]
        self.assertEqual(got, [True, ['2026-10-06'], ['foh||2026-10-06||Close (8:00-10:00)||Drinks 1'], False])


if __name__ == '__main__':
    unittest.main()
