"""The Directors page (static/js/directors.js): the week ahead for the
director team from the roster, Set Ups, the calendar and the PEA ratings
(Tim, Oct 2026). Monday Oct 12 2026 is "today" in these tests."""
import json
import os
import subprocess
import unittest

import app as appmod

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, 'tests', 'directors_runner.js')

with open(os.path.join(ROOT, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
    PAGE = f.read()


def run(op, **extra):
    out = subprocess.run(['node', RUNNER], input=json.dumps({'cases': [dict(op=op, **extra)]}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[0]


# A Tuesday: two leaders with a gap in the afternoon, one director shift.
WEEK = """
  fohRoster = {'2026-10-13': [
    {name: 'Maya Torres', start: '6:00a', end: '2:00p', leader: true},
    {name: 'Noah Bennett', start: '6:00a', end: '1:00p'},
    {name: 'Ava Morales', start: '4:00p', end: '10:30p', leader: true},
    {name: 'Priya Nair', start: '2:00p', end: '10:00p'}]};
  bohRoster = {'2026-10-13': [{name: 'Mateo Cruz', start: '6:00a', end: '2:00p'}]};
  adminShifts = {'2026-10-13': [{name: 'Timothy Lane', start: '9:00a', end: '5:00p'}, {name: 'Grace Kim', start: '10:00a', end: '2:00p'}]};
"""


class Data(unittest.TestCase):
    def test_keys_live_in_the_right_sections(self):
        self.assertEqual(appmod.SECTION_OF_KEY['directors'], 'manager')
        self.assertEqual(appmod.SECTION_OF_KEY['adminShifts'], 'rosters')
        self.assertEqual(appmod.SECTION_OF_KEY['leaderNotes'], 'people')     # private: PIN sessions only
        self.assertIn('people', appmod.PRIVATE_SECTIONS)
        for key in ('directors', 'leaderNotes'):
            self.assertIn(key, appmod.MANAGER_ONLY_KEYS)

    def test_seed_is_tims_director_team(self):
        seed = run('c => DIRECTORS_SEED')
        self.assertEqual([d['name'] for d in seed], ['Timothy Lane', 'Kianna Ramos', 'Casey Howard'])
        self.assertEqual(seed[2]['title'], 'Managing Partner')

    def test_a_director_is_matched_by_name_loosely(self):
        self.assertEqual(run("c => [dirIsDirector('timothy  lane'), dirIsDirector('Grace Kim')]"), [True, False])


class Week(unittest.TestCase):
    def test_leaders_gaps_and_closer(self):
        got = run("c => { " + WEEK + " return [dirLeaders('2026-10-13').map(p => p.name), dirLeaderGaps('2026-10-13'), dirHasCloser('2026-10-13'), dirDirectorShifts('2026-10-13').map(s => s.name)]; }")
        self.assertEqual(got[0], ['Maya Torres', 'Ava Morales'])
        self.assertEqual(got[1], [{'start': 14 * 60, 'end': 16 * 60}])          # 2:00p–4:00p with no leader
        self.assertIs(got[2], True)                                              # Ava is on until 10:30p
        self.assertEqual(got[3], ['Timothy Lane'])                               # Grace's admin shift isn't a director's

    def test_lead_captain_counts_as_a_leader(self):
        got = run("c => { " + WEEK + " posAssignments['foh||2026-10-13||Lunch (10:30-1:00)||Lead Captain'] = 'Noah Bennett'; return [dirLeaders('2026-10-13').map(p => p.name), dirLeaderGaps('2026-10-13')]; }")
        self.assertIn('Noah Bennett', got[0])
        self.assertEqual(got[1], [{'start': 14 * 60, 'end': 16 * 60}])

    def test_leader_list_in_manage_counts_as_a_leader(self):
        # Priya works an ordinary shift in HotSchedules but is on the leader
        # list in Manage → Settings → Leaders: she leads that day.
        got = run("c => { " + WEEK + " leaderRoster = [{name: ' Priya  Nair ', roles: []}, {name: '', roles: []}]; return [dirLeaders('2026-10-13').map(p => p.name), dirLeaderGaps('2026-10-13')]; }")
        self.assertIn('Priya Nair', got[0])
        self.assertEqual(got[1], [])
        # Not on the list: not a leader.
        got = run("c => { " + WEEK + " leaderRoster = [{name: 'Someone Else', roles: []}]; return dirLeaders('2026-10-13').map(p => p.name); }")
        self.assertNotIn('Priya Nair', got)

    def test_pea_givers_and_note_holders_are_not_roster_leaders(self):
        # The Leaders page profiles anyone who gave a PEA or has notes; the
        # week's day cards count only the roster's leaders (Oct 18 2026).
        got = run("c => { " + WEEK + """ peaRows = [{at: '2026-10-08T12:00', date: '2026-10-08', leader: 'Priya Nair', employee: 'Noah Bennett', role: 'Team Member', position: 'iPOS', overall: 3}];
          leaderNotes = {'Noah Bennett': [{text: 'x', by: 'TL', ts: 1}]};
          return [ldLeaderNames(ldQuarterNow()).includes('Priya Nair'), dirLeaders('2026-10-13').map(p => p.name)]; }""")
        self.assertEqual(got, [True, ['Maya Torres', 'Ava Morales']])

    def test_day_card_is_a_timeline(self):
        html = run("c => { " + WEEK + """ const root = {innerHTML: ''}; document.getElementById = id => id === 'directorsRoot' ? root : null; renderDirectorsView();
          return root.innerHTML.split('The week at a glance')[1].split('Where directors overlap')[0]; }""")
        tue = html.split('Tue, Oct 13')[1].split('class="dir-day')[0]
        self.assertEqual(tue.count('class="dir-tl-row"'), 3)                 # Maya, Ava, the director
        self.assertEqual(tue.count('dir-tl-name is-leader'), 2)
        self.assertEqual(tue.count('dir-tl-bar is-director'), 1)
        self.assertIn('dir-tl-bar is-gap', tue)                              # 2p–4p
        self.assertIn('gap 2p–4p', tue)
        self.assertNotIn('dir-chip', html)                                   # no wall of chips in the day cards

    def test_a_filled_leader_list_decides(self):
        # With names in Manage → Settings → Leaders, giving a PEA or having
        # notes no longer makes a leader (Tim, Oct 18 2026); Team Leader
        # shifts on the roster still count.
        got = run("c => { " + WEEK + """ peaRows = [{at: '2026-10-08T12:00', date: '2026-10-08', leader: 'Priya Nair', employee: 'Noah Bennett', role: 'Team Lead', position: 'iPOS', overall: 3}];
          leaderNotes = {'Noah Bennett': [{text: 'x', by: 'TL', ts: 1}]};
          leaderRoster = [{name: 'Jordan Reyes', roles: []}, {name: '', roles: []}];
          const names = ldLeaderNames(ldQuarterNow());
          return [names.sort(), suLeaderRole('foh', '2026-10-13', 'Priya Nair', {}), suLeaderRole('foh', '2026-10-13', 'Maya Torres', {}), ldInferredLeaderNames(ldQuarterNow()).includes('Priya Nair'), ldListDecides()]; }""")
        self.assertEqual(got, [['Ava Morales', 'Jordan Reyes', 'Maya Torres'], None, 'Team Lead', True, True])
        # Only blank rows: the list doesn't decide yet.
        got = run("c => { " + WEEK + " leaderRoster = [{name: '  ', roles: []}]; return ldListDecides(); }")
        self.assertEqual(got, False)

    def test_leaders_page_names_are_team_leads_on_set_ups(self):
        # Priya gives PEAs, so Directors → Leaders lists her; Set Ups lets her
        # be Lead Captain though HotSchedules has her on an ordinary shift.
        got = run("c => { " + WEEK + """ peaRows = [{at: '2026-10-08T12:00', date: '2026-10-08', leader: 'Priya Nair', employee: 'Noah Bennett', role: 'Team Member', position: 'iPOS', overall: 3}];
          return [ldLeaderNames(ldQuarterNow()).includes('Priya Nair'), suLeaderRole('foh', '2026-10-13', 'Priya Nair', {}), suLeaderRole('foh', '2026-10-13', 'Noah Bennett', {})]; }""")
        self.assertEqual(got, [True, 'Team Lead', None])

    def test_no_leader_at_all_is_one_gap_for_the_day(self):
        got = run("c => { fohRoster = {'2026-10-13': [{name: 'Noah Bennett', start: '6:00a', end: '2:00p'}]}; return dirLeaderGaps('2026-10-13'); }")
        self.assertEqual(got, [{'start': 6 * 60, 'end': 14 * 60}])

    def test_no_gap_before_the_days_first_scheduled_start(self):
        # Tim, Oct 21 2026: one Saturday shift was imported at 5:00; the leaders' day starts at 5:30.
        got = run("c => { fohRoster = {'2026-10-24': [{name: 'A', start: '5:30a', end: '2:00p', leader: true}, {name: 'B', start: '1:45p', end: '10:00p', leader: true}]}; bohRoster = {'2026-10-24': [{name: 'C', start: '5:00a', end: '2:30p'}]}; return [dirLeaderGaps('2026-10-24'), (bohRoster['2026-10-24'][0].start = '6:00a', fohRoster['2026-10-24'][0].start = '7:00a', dirLeaderGaps('2026-10-24'))]; }")
        self.assertEqual(got[0], [])
        self.assertEqual(got[1], [{'start': 6 * 60, 'end': 7 * 60}])   # a real gap after 5:30 still shows

    def test_short_gaps_are_ignored(self):
        got = run("c => { fohRoster = {'2026-10-13': [{name: 'A', start: '6:00a', end: '2:00p', leader: true}, {name: 'B', start: '2:15p', end: '10:00p', leader: true}]}; return dirLeaderGaps('2026-10-13'); }")
        self.assertEqual(got, [])


class Attention(unittest.TestCase):
    def test_meetings_and_marked_events_with_who_is_on(self):
        got = run("c => { " + WEEK + """ storeEvents = [
            {id: 'm', kind: 'meeting', title: 'Leadership meeting', date: '2026-10-13', from: '15:00', to: '16:00'},
            {id: 'e', kind: 'instore', title: 'Family Night', date: '2026-10-13', from: '17:00', to: '19:00', attn: true},
            {id: 'o', kind: 'food', title: 'Community Outreach', date: '2026-10-13'},
            {id: 'n', kind: 'note', title: 'No School', date: '2026-10-13'}];
          return {att: dirAttention(['2026-10-13']).map(x => [x.ev.title, x.leaders.map(p => p.name)]), other: dirOtherEvents(['2026-10-13']).map(x => x.ev.title)}; }""")
        self.assertEqual(got['att'], [['Leadership meeting', []], ['Family Night', ['Ava Morales']]])   # 3pm: the gap; 5pm: Ava
        self.assertEqual(got['other'], ['Community Outreach'])


class Pea(unittest.TestCase):
    def test_leaders_by_last_given_and_team_by_last_received(self):
        got = run("c => { " + WEEK + """ peaRows = [
            {date: '2026-10-10', leader: 'Maya Torres', employee: 'Noah Bennett'},
            {date: '2026-09-20', leader: 'Maya Torres', employee: 'Priya Nair'},
            {date: '2026-09-01', leader: 'Jordan Reyes', employee: 'Noah Bennett'}];
          const p = dirPeaCadence(['2026-10-13']); return {leaders: p.leaders.map(l => [l.name, l.days, l.recent]), employees: p.employees.map(e => [e.name, e.days])}; }""")
        # Ava leads this week but has never given one: first; then Jordan (41 days), then Maya (2 days, both of hers in the last 30).
        self.assertEqual(got['leaders'], [['Ava Morales', None, 0], ['Jordan Reyes', 41, 0], ['Maya Torres', 2, 2]])
        self.assertEqual(got['employees'], [['Priya Nair', 22], ['Noah Bennett', 2]])


class Brief(unittest.TestCase):
    def test_text_brief_names_the_gaps_and_flags(self):
        text = run("c => { " + WEEK + """ storeEvents = [{id: 'm', kind: 'meeting', title: 'Leadership meeting', date: '2026-10-13', from: '15:00', to: '16:00'}];
          peaRows = [{date: '2026-09-01', leader: 'Maya Torres', employee: 'Noah Bennett'}]; return dirBriefText(); }""")
        self.assertIn('Tue, Oct 13: 2 leaders, 3 team · directors: Timothy Lane 9a–5p', text)
        self.assertIn('! no leader 2p–4p', text)
        self.assertIn('Leadership meeting · on the floor: no leader', text)
        self.assertIn('Maya Torres (41 days)', text)
        self.assertIn('Mon, Oct 12: no roster yet', text)

    def test_typed_text_is_escaped_on_the_page(self):
        html = run("""c => { fohRoster = {'2026-10-13': [{name: '<img src=x onerror=alert(1)>', start: '6:00a', end: '2:00p', leader: true}]};
            leaderNotes = {'<img src=x onerror=alert(1)>': [{text: '<script>x</script>', by: 'TL', ts: 1}]};
            const root = {innerHTML: ''}; document.getElementById = id => id === 'directorsRoot' ? root : null; renderDirectorsView(); return root.innerHTML; }""")
        self.assertNotIn('<img', html)
        self.assertNotIn('<script>', html)


class Page(unittest.TestCase):
    def test_tab_view_and_manage_card(self):
        self.assertIn('data-view="directors"', PAGE)
        self.assertIn('class="tab manager-only" role="tab" aria-selected="false" aria-controls="directorsView"', PAGE)
        self.assertIn('id="teamListRoot"', PAGE)                 # the director team is edited in the team list (Oct 23 2026)
        self.assertLess(PAGE.index('/static/js/forecast.js'), PAGE.index('/static/js/directors.js'))

    def test_meeting_kind_and_director_flag(self):
        with open(os.path.join(ROOT, 'static', 'js', 'events.js'), encoding='utf-8') as f:
            src = f.read()
        self.assertIn("meeting: {label: 'Meeting / leadership'", src)
        self.assertIn('id="evAttn"', src)
        self.assertIn('if(attn && attn.checked) ev.attn = true;', src)


if __name__ == '__main__':
    unittest.main()
