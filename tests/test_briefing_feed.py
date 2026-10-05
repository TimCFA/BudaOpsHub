"""The daily briefing feed (/api/briefing, briefing_feed.py): topics a
Render setting allows, two token tiers (store / people), summaries only,
nothing private beyond what a topic carries.

Run: python3 -m unittest discover tests
Firebase is replaced with an in-memory store.
"""
import json
import os
import sys
import unittest
from unittest import mock

ROOT = os.path.join(os.path.dirname(__file__), '..')
sys.path.insert(0, ROOT)
import app as appmod  # noqa: E402

store = {}
STORE_TOKEN = 's' * 40
PEOPLE_TOKEN = 'p' * 40
DAY = '2026-10-06'          # a Tuesday; "yesterday" is the 5th
ALL = 'setup,sales,projections,guest,waste,people'


class FakeRef:
    def __init__(self, path):
        self.path = path.strip('/')

    def get(self):
        if self.path in store:
            return store[self.path]
        prefix = self.path + '/'
        kids = {k[len(prefix):]: v for k, v in store.items() if k.startswith(prefix)}
        return kids or None

    def set(self, value):
        store[self.path] = value


def seed(gx_updated=True):
    store.clear()
    store['state/forecast'] = json.dumps({
        'salesHistory': {
            '2026-10-01': {'sales': 9000, 'lastYearSales': 8500},
            '2026-10-04': {'sales': 0},   # closed Sunday: skipped
            '2026-10-05': {'sales': 10000, 'lastYearSales': 9000, 'laborHours': 80, 'laborCost': 1500, 'checkAverage': 12.5, 'transactions': 800},
            '2026-10-06': {'sales': 99999},   # the briefing day itself: not "yesterday"
        },
        'forecastLog': {'2026-10-05': {'sales': 9500}},
        'forecastSettings': {'secretSetting': 1},
    })
    store['state/ops'] = json.dumps({'numbersData': {DAY: {
        'Lunch (10:30-2:00)': {'projectedSales': '$4,000.00', 'productivityGoal': '$120.00', 'specialEvents': 'Home game'},
        'Breakfast (6:00-10:30)': {'projectedSales': '$2,000.00', 'productivityGoal': '$90.00'},
    }}})
    gx = {'satisfaction': {'highlySatisfied': {'value': '84%', 'label': '% Highly Satisfied'}},
          'service': {'speedOfService': {'value': '2:50', 'top5': '2:45', 'label': 'Speed of Service'}},
          'secondMile': {'opportunities': ['Use guest names']}, 'cemSource': {'label': 'Sept MTD', 'n': 120}}
    if gx_updated:
        gx['lastUpdated'] = '2026-10-03T12:00:00Z'
    store['state/manager'] = json.dumps({'gxData': gx, 'wasteTarget': 100})
    store['state/waste'] = json.dumps({'entries': [
        {'day': '2026-10-05', 'name': 'Nuggets', 'qty': 8, 'unit': 'ct', 'cost': 12.0, 'section': 'boh', 'who': 'JD'},
        {'day': '2026-10-05', 'name': 'Nuggets', 'qty': 4, 'unit': 'ct', 'cost': 6.0, 'section': 'boh', 'who': 'MT'},
        {'day': '2026-10-05', 'name': 'Lemonade', 'qty': 1, 'unit': 'gal', 'cost': 3.5, 'section': 'foh', 'who': 'JD'},
        {'day': '2026-10-02', 'name': 'Fries', 'qty': 2, 'cost': 4.0, 'section': 'boh'},
        {'day': DAY, 'name': 'Today item', 'qty': 1, 'cost': 50.0, 'section': 'boh'},
    ]})
    store['state/rosters'] = json.dumps({'fohRoster': {DAY: [
        {'name': 'Maya Torres', 'start': '6:00 AM', 'end': '2:00 PM', 'leader': True},
        {'name': 'Noah Bennett', 'start': '10:30 AM', 'end': '3:00 PM'}]}, 'bohRoster': {DAY: []}})
    store['state/setups'] = json.dumps({'posAssignments': {'foh||%s||Lunch (10:30-1:00)||Runner' % DAY: 'Noah Bennett'},
                                        'posNotes': {'x': [{'text': 'private note'}]}})
    store['state/pea'] = json.dumps({'peaRatings': {
        'names': ['Noah Bennett', 'Maya Torres'], 'roles': ['Team Member'], 'positions': ['Runner'],
        'rows': [['2026-10-04T10:00', 0, 0, 1, 0, 3, 3, 2, 3, 3, 2.8],
                 ['2026-09-01T10:00', 0, 0, 1, 0, 1, 1, 1, 1, 1, 1.0]]}})
    store['state/safe'] = json.dumps({'safeCounts': [{'date': DAY, 'total': 1234.56}]})
    store['state/people'] = json.dumps({'trainerTrainees': [{'name': 'Secret Trainee'}], 'eoiSubmissions': [{'name': 'Secret EOI'}]})
    appmod._cache.clear()
    appmod._cache_ready = False


class BriefingTest(unittest.TestCase):
    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._setup_feed_failures.clear()
        seed()
        self.c = appmod.app.test_client()

    def get(self, query, topics=ALL, store_token=STORE_TOKEN, people_token=PEOPLE_TOKEN):
        env = {k: v for k, v in (('BRIEFING_TOPICS', topics), ('SETUP_FEED_TOKEN', store_token), ('BRIEFING_PEOPLE_TOKEN', people_token)) if v is not None}
        with mock.patch.dict(os.environ, env, clear=False):
            for k in ('BRIEFING_TOPICS', 'SETUP_FEED_TOKEN', 'BRIEFING_PEOPLE_TOKEN'):
                if k not in env:
                    os.environ.pop(k, None)
            return self.c.get('/api/briefing' + query)

    # ----- access -----

    def test_off_without_topics(self):
        self.assertEqual(self.get('?token=' + STORE_TOKEN, topics=None).status_code, 404)

    def test_wrong_token_and_throttle(self):
        for _ in range(appmod.SETUP_FEED_MAX_FAILURES):
            self.assertEqual(self.get('?token=' + 'z' * 40).status_code, 404)
        self.assertEqual(self.get('?token=' + PEOPLE_TOKEN).status_code, 429)

    def test_store_token_gets_store_topics_only(self):
        b = self.get('?token=' + STORE_TOKEN + '&date=' + DAY).get_json()
        self.assertEqual(b['topics'], ['setup', 'sales', 'projections', 'guest', 'waste'])
        self.assertNotIn('people', b)

    def test_people_token_gets_people_too(self):
        b = self.get('?token=' + PEOPLE_TOKEN + '&date=' + DAY).get_json()
        self.assertIn('people', b['topics'])

    def test_people_token_equal_to_store_token_unlocks_nothing_extra(self):
        b = self.get('?token=' + STORE_TOKEN + '&date=' + DAY, people_token=STORE_TOKEN).get_json()
        self.assertNotIn('people', b['topics'])

    def test_topics_setting_limits_every_token(self):
        b = self.get('?token=' + PEOPLE_TOKEN + '&date=' + DAY, topics='sales,waste').get_json()
        self.assertEqual(b['topics'], ['sales', 'waste'])
        b = self.get('?token=' + STORE_TOKEN + '&date=' + DAY, topics='people').status_code
        self.assertEqual(b, 404)                              # nothing the store token may read

    def test_ask_for_some_topics(self):
        b = self.get('?token=' + PEOPLE_TOKEN + '&date=' + DAY + '&topics=waste,people,nonsense').get_json()
        self.assertEqual(b['topics'], ['waste', 'people'])

    def test_never_sent(self):
        body = self.get('?token=' + PEOPLE_TOKEN + '&date=' + DAY).get_data(as_text=True)
        for private in ('1234.56', 'Secret Trainee', 'Secret EOI', 'private note', 'secretSetting'):
            self.assertNotIn(private, body)

    # ----- topics -----

    def test_sales(self):
        s = self.get('?token=' + STORE_TOKEN + '&date=' + DAY).get_json()['sales']
        self.assertEqual(s['date'], '2026-10-05')
        self.assertEqual((s['sales'], s['lastYear'], s['vsLastYearPct']), (10000, 9000, 11.1))
        self.assertEqual((s['forecast'], s['vsForecastPct']), (9500, 5.3))
        self.assertEqual((s['laborPct'], s['salesPerLaborHour'], s['checkAverage']), (15.0, 125.0, 12.5))
        self.assertEqual(s['monthToDate'], {'through': '2026-10-05', 'days': 2, 'sales': 19000, 'vsLastYearPct': 8.6})

    def test_projections_in_daypart_order(self):
        p = self.get('?token=' + STORE_TOKEN + '&date=' + DAY).get_json()['projections']
        self.assertEqual([d['daypart'] for d in p['dayparts']], ['Breakfast (6:00-10:30)', 'Lunch (10:30-2:00)'])
        self.assertEqual(p['dayparts'][1], {'daypart': 'Lunch (10:30-2:00)', 'projectedSales': 4000, 'productivityGoal': 120, 'specialEvents': 'Home game'})
        self.assertEqual(p['projectedSales'], 6000)

    def test_guest(self):
        g = self.get('?token=' + STORE_TOKEN + '&date=' + DAY).get_json()['guest']
        self.assertTrue(g['available'])
        self.assertEqual(g['source'], 'Sept MTD')
        self.assertEqual(g['groups'][1]['scores'][0], {'label': 'Speed of Service', 'value': '2:50', 'top5': '2:45'})
        self.assertEqual(g['focus'], ['Use guest names'])

    def test_guest_sample_figures_never_sent(self):
        seed(gx_updated=False)
        g = self.get('?token=' + STORE_TOKEN + '&date=' + DAY).get_json()['guest']
        self.assertEqual(g, {'available': False})

    def test_waste(self):
        w = self.get('?token=' + STORE_TOKEN + '&date=' + DAY).get_json()['waste']
        self.assertEqual((w['date'], w['total'], w['limit'], w['underLimit']), ('2026-10-05', 21.5, 100, True))
        self.assertEqual(w['bySide'], {'BOH': 18.0, 'FOH': 3.5})
        self.assertEqual(w['topItems'][0], {'item': 'Nuggets', 'side': 'BOH', 'qty': 12, 'cost': 18.0, 'unit': 'ct'})
        self.assertEqual(w['monthToDate']['total'], 25.5)    # the 2nd and 5th; the briefing day isn't over

    def test_people_with_names(self):
        pe = self.get('?token=' + PEOPLE_TOKEN + '&date=' + DAY).get_json()['people']
        self.assertEqual(pe['roster']['FOH'][0], {'name': 'Maya Torres', 'start': '6:00 AM', 'end': '2:00 PM', 'leader': True})
        self.assertEqual(pe['roster']['BOH'], [])
        self.assertEqual(pe['pea']['ratings'], [{'date': '2026-10-04', 'employee': 'Noah Bennett', 'role': 'Team Member', 'rater': 'Maya Torres', 'position': 'Runner', 'overall': 2.8}])

    def test_text(self):
        t = self.get('?token=' + PEOPLE_TOKEN + '&date=' + DAY + '&format=text').get_data(as_text=True)
        self.assertIn('Briefing for Tuesday, 2026-10-06', t)
        self.assertIn('2026-10-05: $10,000 · vs last year +11.1% · vs forecast +5.3%', t)
        self.assertIn('Lunch (10:30-2:00): $4,000 · goal $120/labor hr · Home game', t)
        self.assertIn('2026-10-05: $21.50 of $100.00 limit · under', t)
        self.assertIn('  Nuggets (BOH): 12 · $18.00', t)
        self.assertIn('FOH roster (2): Maya Torres 6:00 AM–2:00 PM, Noah Bennett 10:30 AM–3:00 PM', t)
        self.assertIn('  2026-10-04 Noah Bennett · Runner · 2.8 · by Maya Torres', t)
        self.assertIn('Runner: Noah', t)


if __name__ == '__main__':
    unittest.main()
