"""Directors → Weekly report (static/js/leader-report.js, TIM-65): each FOH
Lead Captain tied to how their dayparts went: Zone Reset and Leader
Transition lists, PEAs, productivity against goal, waste and Food Safety.
Monday Oct 12 2026 is "today"; last week is Oct 5–10."""
import json
import os
import subprocess
import unittest

import app as appmod

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, 'tests', 'leader_report_runner.js')

with open(os.path.join(ROOT, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
    PAGE = f.read()


def run(op):
    out = subprocess.run(['node', RUNNER], input=json.dumps({'cases': [{'op': op}]}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[0]


BL = "'Breakfast to Lunch (10:30am - 11:30am)'"
DL = "'Dinner to Late Night (7:00pm - 8:00pm)'"
stamp = "{initials: 'TL', ts: 1}"

# Tuesday Oct 6: Maya ran Breakfast, Maya then Ava Lunch (a handoff), Ava
# Dinner; the other four dayparts had no Lead Captain. Wednesday had a roster
# but no Lead Captains. Thursday the store had nothing (not counted). The
# week before, Maya ran one Breakfast.
WEEK = f"""
  fohRoster = {{'2026-10-06': [{{name: 'Noah Bennett', start: '6:00a', end: '2:00p'}}], '2026-10-07': [{{name: 'Noah Bennett', start: '6:00a', end: '2:00p'}}],
                '2026-09-29': [{{name: 'Noah Bennett', start: '6:00a', end: '2:00p'}}]}};
  posAssignments = {{
    'foh||2026-10-06||Breakfast (8:00-10:30)||Lead Captain': 'Maya Torres',
    'foh||2026-10-06||Lunch (10:30-1:00)||Lead Captain': 'Maya Torres/Ava Morales',
    'foh||2026-10-06||Dinner (5:00-8:00)||Lead Captain': 'Ava Morales',
    'boh||2026-10-06||Lunch (10:30-2:00)||Breader 1': 'Mateo Cruz',
    'foh||2026-09-29||Breakfast (8:00-10:30)||Lead Captain': 'Maya Torres'}};
  zoneChecklistState = {{'2026-10-06': {{
    [{BL}]: {{'Drinks Zone': {{'Wipe counters': {stamp}, 'Restock cups': {stamp}}}, 'Final Check': {{'Floors swept': {stamp}}}}},
    [{DL}]: {{'Drinks Zone': {{'Wipe counters': {stamp}, 'Restock cups': {stamp}}}, 'Final Check': {{'Floors swept': {stamp}, 'Trash out': {stamp}}}}}}}}};
  leaderTransitionHistory = {{'2026-10-06': {{[{BL}]: [4, 4]}}}};
  numbersData = {{'2026-10-06': {{
    'Breakfast (6:00-10:30)': {{projectedSales: '', productivityGoal: '$90.00', specialEvents: '', actualSales: '', actualProductivity: '$95.00'}},
    'Lunch (10:30-2:00)': {{projectedSales: '', productivityGoal: '$100.00', specialEvents: '', actualSales: '', actualProductivity: '$92.00'}}}}}};
  peaRows = [
    {{at: '2026-10-06T09:15', date: '2026-10-06', employee: 'Noah Bennett', leader: 'Maya Torres', position: 'Drinks', overall: 3}},
    {{at: '2026-10-06T18:00', date: '2026-10-06', employee: 'Noah Bennett', leader: 'Kianna Ramos', position: 'Drinks', overall: 3}},
    {{at: '2026-10-09T12:00', date: '2026-10-09', employee: 'Noah Bennett', leader: 'Ava Morales', position: 'Drinks', overall: 3}},
    {{at: '2026-09-29T09:00', date: '2026-09-29', employee: 'Noah Bennett', leader: 'Maya Torres', position: 'Drinks', overall: 3}}];
  wasteDays = ['2026-10-06'];
  foodSafetyWalkthroughs = {{'2026-10-06': {{complete: true}}}};
"""


def report(extra=''):
    return run(f"c => {{ {WEEK} {extra}; const r = lrReport(-1); return {{leaders: r.leaders, unassigned: r.unassigned, counted: r.facts.counted}}; }}")


class Data(unittest.TestCase):
    def test_history_key_lives_in_history(self):
        self.assertEqual(appmod.SECTION_OF_KEY['leaderTransitionHistory'], 'history')

    def test_page_loads_report_after_directors(self):
        self.assertLess(PAGE.index('/static/js/directors.js'), PAGE.index('/static/js/leader-report.js'))

    def test_leader_transition_history_recorded(self):
        out = run("""c => {
          fohLeaderTransitionChecked = {'Close': {0: {initials: 'TL', ts: 1}, 2: {initials: 'TL', ts: 2}}};
          leaderTransitionHistory = {'2025-01-01': {}, '2026-01-01': {}};
          ltRecordHistory();
          return leaderTransitionHistory; }""")
        self.assertEqual(out['2026-10-12']['Close'], [2, 4])
        self.assertEqual(out['2026-10-12']['Lunch to Mid (1:00pm - 2:00pm)'], [0, 4])
        self.assertNotIn('2025-01-01', out)     # past a year
        self.assertIn('2026-01-01', out)


class Report(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        r = report()
        cls.r = r
        cls.by = {L['name']: L for L in r['leaders']}

    def test_only_open_finished_days_count(self):
        self.assertEqual(self.r['counted'], ['2026-10-06', '2026-10-07'])

    def test_lead_captains_credited_handoff_splits(self):
        self.assertEqual([L['name'] for L in self.r['leaders']], ['Ava Morales', 'Maya Torres'])
        maya, ava = self.by['Maya Torres'], self.by['Ava Morales']
        self.assertEqual((maya['dayparts'], maya['days']), (2, 1))
        self.assertEqual((ava['dayparts'], ava['days']), (2, 1))
        self.assertNotIn('Mateo Cruz', self.by)   # BOH isn't credited

    def test_lists(self):
        maya, ava = self.by['Maya Torres'], self.by['Ava Morales']
        # Breakfast→Lunch 3 of 4, Lunch→Mid 0 of 4; Dinner→Late Night 4 of 4.
        self.assertEqual(maya['zone'], {'checked': 3, 'total': 8})
        self.assertEqual(ava['zone'], {'checked': 4, 'total': 8})
        # Leader Transition: a handoff with no record that day counts as 0.
        self.assertEqual(maya['lt'], {'checked': 4, 'total': 8})
        self.assertEqual(ava['lt'], {'checked': 0, 'total': 8})

    def test_peas(self):
        maya, ava = self.by['Maya Torres'], self.by['Ava Morales']
        self.assertEqual((maya['peasGiven'], maya['peasOn']), (1, 1))   # her own, during her Breakfast
        self.assertEqual((ava['peasGiven'], ava['peasOn']), (1, 1))     # Thursday's she gave; a director's during her Dinner

    def test_productivity_waste_food_safety(self):
        maya, ava = self.by['Maya Torres'], self.by['Ava Morales']
        self.assertEqual(maya['prod'], {'hit': 1, 'of': 2})   # Breakfast 95 vs 90, Lunch 92 vs 100
        self.assertEqual(ava['prod'], {'hit': 0, 'of': 1})    # Lunch only: Dinner has no actuals
        for L in (maya, ava):
            self.assertEqual(L['waste'], {'under': 1, 'of': 1})
            self.assertEqual(L['fs'], {'done': 1, 'of': 1})

    def test_unassigned_dayparts_listed(self):
        tue = [u['daypart'] for u in self.r['unassigned'] if u['date'] == '2026-10-06']
        self.assertEqual(tue, ['Early Breakfast (6:00-8:00)', 'Transition (1:00-2:00)', 'Mid (2:00-5:00)', 'Close (8:00-10:00)'])
        self.assertEqual(len([u for u in self.r['unassigned'] if u['date'] == '2026-10-07']), 7)

    def test_last_week_compared(self):
        prev = self.by['Maya Torres']['prev']
        self.assertEqual(prev['dayparts'], 1)
        self.assertEqual(prev['peasGiven'], 1)
        # Before Leader Transition history began: no figure, not a zero.
        self.assertEqual(prev['lt']['total'], 0)
        self.assertIsNone(self.by['Ava Morales']['prev'])

    def test_win_and_focus(self):
        maya, ava = self.by['Maya Torres']['coach'], self.by['Ava Morales']['coach']
        self.assertEqual(maya['win']['key'], 'waste')
        self.assertEqual(maya['focus']['key'], 'zone')
        self.assertEqual(ava['focus']['key'], 'lt')

    def test_no_pea_given_is_the_focus(self):
        r = run(f"c => {{ {WEEK} peaRows = peaRows.filter(r => r.leader !== 'Ava Morales'); return lrReport(-1).leaders.find(L => L.name === 'Ava Morales').coach.focus; }}")
        self.assertEqual(r['key'], 'peas')

    def test_this_week_so_far_on_a_monday(self):
        r = run(f"c => {{ {WEEK} lrWeekOffset = 0; return lrBodyHtml(); }}")
        self.assertIn('No finished days this week yet', r)


class Render(unittest.TestCase):
    def test_view_and_text(self):
        out = run(f"""c => {{ {WEEK}
          posAssignments['foh||2026-10-06||Close (8:00-10:00)||Lead Captain'] = '<i>Eve';
          return {{html: lrBodyHtml(), text: lrText(), actions: lrActionsHtml()}}; }}""")
        html, text = out['html'], out['text']
        self.assertIn('Maya Torres', html)
        self.assertIn('&lt;i&gt;Eve', html)
        self.assertNotIn('<i>Eve', html)
        self.assertIn('Dayparts with no Lead Captain', html)
        self.assertIn('data-lr-week="-1"', out['actions'])
        self.assertIn('Weekly leader report · Mon, Oct 5 – Sat, Oct 10', text)
        self.assertIn('MAYA TORRES (2 DAYPARTS, 1 DAY)', text)
        self.assertIn('Zone Reset: 38% (3/8 items)', text)
        self.assertIn('Focus: Zone Reset 38%', text)
        self.assertIn('Tue, Oct 6: Early Breakfast, Transition, Mid', text)

    def test_directors_view_has_the_pane(self):
        with open(os.path.join(ROOT, 'static', 'js', 'directors.js'), encoding='utf-8') as f:
            js = f.read()
        self.assertIn('data-dir-view="report"', js)


if __name__ == '__main__':
    unittest.main()
