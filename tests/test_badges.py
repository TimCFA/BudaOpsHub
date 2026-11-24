"""Achievement badges (Tim, Nov 23 2026; badges.py, app.py "ACHIEVEMENT
BADGES", me-page.js, right-now.js). Worked out from records the hub already
keeps; an earned level is kept for good; your own on your Me page, Team
Leads and up see everyone's.

Names are made up.
"""
import os
import re
import sys
import unittest
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
import badges  # noqa: E402
import huddle_api  # noqa: E402
import list_tally  # noqa: E402
import levelset_sync  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
TZ = levelset_sync.STORE_TZ
TODAY = '2026-11-23'                      # 2026-Q4: Oct 1 to Dec 31
H = [name for name, _ in huddle_api.HANDOFFS]


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


def ms(iso, hhmm='12:00'):
    return int(datetime.fromisoformat(f'{iso}T{hhmm}').replace(tzinfo=TZ).timestamp() * 1000)


def pea(rows):
    """peaRatings from [(at, employee, rater, position, overall)]."""
    names, positions = [], []
    def ix(lst, v):
        if v not in lst:
            lst.append(v)
        return lst.index(v)
    out = []
    for at, who, rater, pos, overall in rows:
        out.append([at, ix(names, who), 0, ix(names, rater) if rater else -1, ix(positions, pos), 3, 3, 3, 3, 3, overall])
    return {'peaRatings': {'names': names, 'positions': positions, 'roles': ['Team Member'], 'rows': out}, 'peaNameAliases': {}}


def zone_marks(zone, names):
    total = huddle_api.ZONE_ITEMS[zone]
    return {zone: {f'item {i}': {'initials': names[i % len(names)], 'ts': 1} for i in range(total)}}


class Tally(unittest.TestCase):
    def test_a_finished_zone_credits_everyone_who_ticked_in_it(self):
        marks = {**zone_marks('Dining Room', ['Maya Torres', 'Ana Ruiz']), **zone_marks('Restrooms', ['Maya Torres'])}
        marks['Outside'] = {'item 0': {'initials': 'Ben Cole', 'ts': 1}}                # not finished: no credit
        self.assertEqual(list_tally.closers(marks), [['Ana Ruiz', 1], ['Maya Torres', 2]])

    def test_old_bare_marks_and_device_less_ticks_count_for_no_one(self):
        marks = {'The Spot': {'a': True, 'b': True, 'c': True}}
        self.assertEqual(list_tally.closers(marks), [])

    def test_closers_ride_on_the_days_record_and_outlive_the_ticks(self):
        ticks = {H[0]: zone_marks('The Spot', ['Maya Torres'])}
        rec = list_tally.tally_day('2026-11-20', ticks, {}, {})
        self.assertEqual(rec[H[0]]['closers'], [['Maya Torres', 1]])
        rec[H[0]]['lead'] = 'Dana Reyes'
        again = list_tally.tally_day('2026-11-20', {}, {}, {}, kept=rec)
        self.assertEqual(again[H[0]]['closers'], [['Maya Torres', 1]])
        self.assertEqual(list_tally.scores({'2026-11-20': rec})[0]['handoffs'], 1)      # the leaders' score reads as before


class Rules(unittest.TestCase):
    def idx(self, **kw):
        return badges.Index(tz=TZ, **kw)

    def test_the_catalog(self):
        ids = [b['id'] for b in badges.CATALOG]
        self.assertEqual(len(ids), len(set(ids)))
        for b in badges.CATALOG:
            self.assertIn(b['kind'], ('season', 'milestone'))
            self.assertIn(b['who'], badges.TIER_OF_WHO)
            self.assertEqual(b['levels'], sorted(b['levels']))
            self.assertLessEqual(len(b['levels']), 3)
        self.assertNotIn('points', ids)              # accountability points stay with leadership
        self.assertNotIn('waste', ids)

    def test_pea_sides_match_the_page(self):
        js = read('static', 'js', 'pea-ratings.js')
        for side, positions in badges.PEA_SIDES.items():
            m = re.search(r"\{key: '%s',[^\]]*positions: \[([^\]]*)\]" % side, js)
            self.assertEqual(tuple(re.findall(r"'([^']+)'", m.group(1))), positions)

    def test_quarters(self):
        self.assertEqual(badges.quarter_of(TODAY), '2026-Q4')
        self.assertEqual(badges.quarter_bounds('2026-Q4'), ('2026-10-01', '2027-01-01'))
        self.assertEqual(badges.quarter_bounds('2026-Q1'), ('2026-01-01', '2026-04-01'))
        self.assertEqual(badges.quarter_label('2026-Q3'), 'Q3 2026')

    def test_zone_closer_counts_this_quarter_only(self):
        tally = {'2026-11-02': {H[0]: {'lead': 'Dana Reyes', 'checked': 5, 'total': 74, 'closers': [['Maya Torres', 7]]}},
                 '2026-11-03': {H[1]: {'lead': '', 'checked': 9, 'total': 74, 'closers': [['maya  torres', 4]]}},
                 '2026-09-30': {H[0]: {'lead': '', 'checked': 9, 'total': 74, 'closers': [['Maya Torres', 30]]}}}
        c = badges.counts(self.idx(tally=tally), {'name': 'Maya Torres'}, TODAY)
        self.assertEqual(c['zone'], 11)
        view, _ = badges.board(self.idx(tally=tally), {'name': 'Maya Torres'}, TODAY, None, 1)
        zone = next(b for b in view['badges'] if b['id'] == 'zone')
        self.assertEqual((zone['level'], zone['levelName'], zone['next']), (1, 'Bronze', 25))

    def test_clean_handoff_needs_every_item(self):
        tally = {'2026-11-02': {H[0]: {'lead': 'Dana Reyes/Ben Cole', 'checked': 74, 'total': 74}, H[1]: {'lead': 'Dana Reyes', 'checked': 73, 'total': 74}}}
        idx = self.idx(tally=tally)
        self.assertEqual(badges.counts(idx, {'name': 'Dana Reyes'}, TODAY)['handoff'], 1)
        self.assertEqual(badges.counts(idx, {'name': 'Ben Cole'}, TODAY)['handoff'], 1)   # shared handoff: both

    def test_pea_badges(self):
        rows = [
            ('2026-08-01T10:00', 'Maya Torres', 'Dana Reyes', 'iPOS', 2.0),           # On the Rise before the quarter
            ('2026-10-20T10:00', 'Maya Torres', 'Dana Reyes', 'iPOS', 3.0),
            ('2026-10-21T10:00', 'Maya Torres', 'Dana Reyes', 'iPOS', 3.0),
            ('2026-10-22T10:00', 'Maya Torres', 'Dana Reyes', 'iPOS', 3.0),
            ('2026-10-22T11:00', 'Maya Torres', 'Ben Cole', 'Host', 2.9),
            ('2026-10-23T11:00', 'Maya Torres', 'Ben Cole', '3H Week', 3.0),          # not a position
            ('2026-11-02T11:00', 'Ana Ruiz', 'Dana Reyes', 'Runner', 1.5),
            ('2026-09-02T11:00', 'Ana Ruiz', 'Dana Reyes', 'Runner', 1.5),            # last quarter: not counted
        ]
        idx = self.idx(pea=pea(rows))
        maya = badges.counts(idx, {'name': 'Maya Torres'}, TODAY)
        self.assertEqual((maya['crushing'], maya['allgreen'], maya['rise']), (2, 1, 1))
        dana = badges.counts(idx, {'name': 'Dana Reyes'}, TODAY)
        self.assertEqual((dana['coach'], dana['widenet']), (4, 2))
        ana = badges.counts(idx, {'name': 'Ana Ruiz'}, TODAY)
        self.assertEqual((ana['crushing'], ana['allgreen']), (0, 0))

    def test_all_green_needs_two_positions_on_a_side(self):
        idx = self.idx(pea=pea([('2026-10-20T10:00', 'Maya Torres', 'Dana Reyes', 'iPOS', 3.0)]))
        self.assertEqual(badges.counts(idx, {'name': 'Maya Torres'}, TODAY)['allgreen'], 0)

    def test_on_the_clock_is_dayparts_with_no_miss(self):
        def ev(kind, owner, day, dp, status=None):
            d = {'timerId': 't1', 'due': ms(day), 'daypart': dp, 'lead': owner, 'owner': owner}
            if status:
                d['status'] = status
            return {'id': f'{ms(day)}-{kind}', 'at': ms(day), 'type': kind, 'data': d}
        events = [ev('reset', 'Dana Reyes', '2026-11-02', 'Lunch', 'ontime'), ev('reset', 'Dana Reyes', '2026-11-02', 'Lunch', 'late'),
                  ev('reset', 'Dana Reyes', '2026-11-03', 'Lunch', 'ontime'), ev('miss', 'Dana Reyes', '2026-11-03', 'Lunch'),
                  ev('reset', 'Dana Reyes', '2026-11-04', 'Mid', 'missed'),
                  ev('reset', 'Dana Reyes', '2026-11-05', 'Mid', 'closed')]              # out of hours: not a cycle
        self.assertEqual(badges.counts(self.idx(timer_events=events), {'name': 'Dana Reyes'}, TODAY)['clock'], 1)

    def test_huddle_habit_is_huddles_set_and_closed(self):
        def ev(i, typ, by, day, dp):
            return {'id': f'{i:013d}-aa', 'at': i, 'type': typ, 'by': by, 'data': {'date': day, 'side': 'foh', 'daypart': dp, 'goals': [], 'results': {}}}
        events = [ev(1, 'pre', 'Dana Reyes', '2026-11-02', 'Lunch'), ev(2, 'post', 'Ben Cole', '2026-11-02', 'Lunch'),
                  ev(3, 'pre', 'Dana Reyes', '2026-11-03', 'Lunch')]                    # never closed
        self.assertEqual(badges.counts(self.idx(huddle_events=events), {'name': 'Dana Reyes'}, TODAY)['huddle'], 1)

    def test_elite_tickets(self):
        def ev(i, typ, by, data, task='t1'):
            return {'id': f'{i:013d}-aa', 'at': ms('2026-11-0' + str(i)), 'type': typ, 'by': by, 'taskId': task, 'data': data}
        events = [ev(1, 'created', 'lead1', {'owner': 'maya', 'title': 'x', 'due': ms('2026-11-09')}),
                  ev(2, 'backbrief', 'maya', {'summary': 'y'}), ev(3, 'submit', 'maya', {}), ev(4, 'verify', 'lead1', {'rating': 'elite'})]
        self.assertEqual(badges.counts(self.idx(pass_events=events), {'name': 'Maya Torres', 'id': 'maya'}, TODAY)['elite'], 1)

    def test_tenure(self):
        c = badges.counts(self.idx(), {'name': 'Maya Torres', 'hireDate': '2025-11-01'}, TODAY)
        self.assertEqual(c['tenure'], 387)
        view, _ = badges.board(self.idx(), {'name': 'Maya Torres', 'hireDate': '2025-11-01'}, TODAY, None, 1)
        t = next(b for b in view['badges'] if b['id'] == 'tenure')
        self.assertEqual((t['levelName'], t['next']), ('Silver', 730))
        self.assertEqual(badges.counts(self.idx(), {'name': 'X', 'hireDate': 'soon'}, TODAY)['tenure'], 0)

    def test_an_earned_level_is_kept_and_dated_once(self):
        tally = {'2026-11-02': {H[0]: {'lead': '', 'checked': 9, 'total': 74, 'closers': [['Maya Torres', 26]]}}}
        view, earned = badges.board(self.idx(tally=tally), {'name': 'Maya Torres'}, TODAY, None, 1000)
        self.assertEqual(earned['zone@2026-Q4'], {'level': 2, 'at': 1000})
        self.assertEqual([n['name'] for n in view['new']], ['Zone Closer'])
        # The ticks are gone and the count reads lower: the level stays, nothing to write.
        view, again = badges.board(self.idx(), {'name': 'Maya Torres'}, TODAY, earned, 2000)
        self.assertIsNone(again)
        self.assertEqual(next(b for b in view['badges'] if b['id'] == 'zone')['level'], 2)
        # Three days on it isn't new any more.
        self.assertEqual(badges.fresh(earned, 1000 + 4 * 86400000), [])

    def test_last_quarters_season_badges_are_the_trophy_case(self):
        earned = {'zone@2026-Q3': {'level': 3, 'at': 5}, 'tenure': {'level': 1, 'at': 5}}
        view, _ = badges.board(self.idx(), {'name': 'Maya Torres'}, TODAY, earned, 10)
        self.assertEqual(view['past'], [{'id': 'zone', 'name': 'Zone Closer', 'icon': 'zone', 'quarter': '2026-Q3', 'quarterLabel': 'Q3 2026', 'level': 3, 'levelName': 'Gold'}])
        self.assertEqual(next(b for b in view['badges'] if b['id'] == 'zone')['level'], 0)       # a fresh shot this quarter

    def test_leaders_badges_show_by_role(self):
        ids = lambda role: {b['id'] for b in badges.board(self.idx(), {'name': 'X', 'role': role}, TODAY, None, 1)[0]['badges']}
        self.assertNotIn('coach', ids('member'))
        self.assertIn('coach', ids('trainer'))
        self.assertNotIn('handoff', ids('trainer'))
        self.assertIn('handoff', ids('lead'))
        # A team member who led a handoff anyway sees it.
        tally = {'2026-11-02': {H[0]: {'lead': 'X', 'checked': 74, 'total': 74}}}
        self.assertIn('handoff', {b['id'] for b in badges.board(self.idx(tally=tally), {'name': 'X', 'role': 'member'}, TODAY, None, 1)[0]['badges']})


class FakeDb:
    def __init__(self, data=None):
        self.data, self.writes = dict(data or {}), []

    def reference(self, path):
        db = self

        class Ref:
            def get(self):
                if path in db.data:
                    return db.data[path]
                pre = path.rstrip('/') + '/'
                kids = {k[len(pre):]: v for k, v in db.data.items() if k.startswith(pre) and '/' not in k[len(pre):]}
                return kids or None

            def set(self, value):
                db.writes.append(path)
                db.data[path] = value

            def order_by_key(self):
                return self

            def start_at(self, _):
                return self
        return Ref()


class Api(unittest.TestCase):
    def setUp(self):
        self.db = FakeDb({list_tally.TALLY_PATH: {'2026-11-02': {H[0]: {'lead': 'Dana Reyes', 'checked': 74, 'total': 74, 'closers': [['Maya Torres', 12]]}}}})
        self._ref = appmod.db.reference
        appmod.db.reference = self.db.reference
        self._lists, self._badges = dict(appmod._lists), dict(appmod._badges)
        appmod._lists.update(tally=None)
        appmod._badges.update(index=None, at=0.0, earned=None)
        self._today, self._people = appmod._badges_today, appmod._pass_people
        appmod._badges_today = lambda: TODAY
        appmod._pass_people = lambda: [{'id': appmod._pass_key('Maya Torres'), 'name': 'Maya Torres', 'role': 'member'},
                                       {'id': appmod._pass_key('Dana Reyes'), 'name': 'Dana Reyes', 'role': 'lead'}]
        self.c = appmod.app.test_client()

    def tearDown(self):
        appmod.db.reference = self._ref
        appmod._lists.clear()
        appmod._lists.update(self._lists)
        appmod._badges.clear()
        appmod._badges.update(self._badges)
        appmod._badges_today, appmod._pass_people = self._today, self._people

    def sign_in(self, name, role):
        with self.c.session_transaction() as sess:
            sess.clear()
            sess['user'] = {'name': name, 'role': role, 'via': 'pin'}

    def test_my_own_badges_and_the_record_is_written(self):
        self.assertEqual(self.c.get('/api/me/badges').get_json(), {'name': None})
        self.sign_in('Maya Torres', 'member')
        r = self.c.get('/api/me/badges')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers['Cache-Control'], 'no-store')
        zone = next(b for b in r.get_json()['badges'] if b['id'] == 'zone')
        self.assertEqual((zone['count'], zone['levelName']), (12, 'Bronze'))
        pid = appmod._pass_key('Maya Torres')
        self.assertEqual(self.db.data[f'{badges.EARNED_PATH}/{pid}']['zone@2026-Q4']['level'], 1)
        self.assertEqual([n['name'] for n in r.get_json()['new']], ['Zone Closer'])
        self.db.writes.clear()
        self.c.get('/api/me/badges')
        self.assertEqual(self.db.writes, [])                        # nothing new: nothing written

    def test_everyones_badges_are_for_leaders(self):
        self.sign_in('Maya Torres', 'member')
        self.assertEqual(self.c.get('/api/team/badges').status_code, 403)
        self.assertEqual(self.c.get('/api/team/badges?name=Dana%20Reyes').status_code, 403)
        self.sign_in('Ana Ruiz', 'trainer')
        self.assertEqual(self.c.get('/api/team/badges').status_code, 403)
        self.sign_in('Dana Reyes', 'lead')
        r = self.c.get('/api/team/badges')
        self.assertEqual(r.status_code, 200)
        recent = {(x['person'], x['name']) for x in r.get_json()['recent']}
        self.assertIn(('Maya Torres', 'Zone Closer'), recent)
        self.assertNotIn(('Dana Reyes', 'Clean Handoff'), recent)        # one handoff: not yet the ten for Bronze
        one = self.c.get('/api/team/badges?name=maya%20torres').get_json()
        self.assertEqual(one['name'], 'Maya Torres')
        with self.c.session_transaction() as sess:
            sess.clear()
            sess['manager'] = True
        self.assertEqual(self.c.get('/api/team/badges').status_code, 200)


class Page(unittest.TestCase):
    def test_every_badge_name_has_its_spanish(self):
        es = read('static', 'js', 'spanish.js')
        for phrase in [b['name'] for b in badges.CATALOG] + ['Badges', 'New badge', 'Earlier quarters']:
            self.assertIn(f"\n  '{phrase}': ", es, phrase)

    def test_the_me_page_draws_them_and_home_says_when_ones_new(self):
        js = read('static', 'js', 'me-page.js')
        self.assertIn("'/api/me/badges'", js)
        self.assertIn('/api/team/badges?name=', js)
        self.assertIn("${mpBadgesHtml()}\n      ${mpWeekHtml(d.name)}", js)
        self.assertIn('localStorage.setItem(MP_BADGES_SEEN', js)
        rn = read('static', 'js', 'right-now.js')
        self.assertIn("get('/api/me/badges')", rn)
        self.assertIn("localStorage.getItem('hubBadgesSeen')", rn)
        self.assertIn("'mine', 'ok'), {icon: 'badge'})", rn)
        for icon in {b['icon'] for b in badges.CATALOG}:
            self.assertIn(f'  {icon}: mpBadgeSvg(', js)

    def test_line_icons_not_emoji(self):
        for src in (read('badges.py'), read('static', 'js', 'me-page.js')):
            self.assertFalse(re.search('[\U0001F300-\U0001FAFF☀-➿]', src))

    def test_never_a_saved_state_section(self):
        self.assertNotIn('badges', {k.lower() for keys in appmod.STATE_SECTIONS.values() for k in keys})


if __name__ == '__main__':
    unittest.main()
