"""Ops Hub reports: Smart Shop and food safety parsing, and the manager-only route.

Run: python3 -m unittest discover tests
Every report here is made up; real reports are never committed.
"""
import io
import os
import sys
import unittest
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
import reports_parser as rp  # noqa: E402

appmod.app.config['SESSION_COOKIE_SECURE'] = False


class FakePage:
    def __init__(self, text, words=(), rects=()):
        self._text, self._words, self.rects = text, list(words), list(rects)

    def extract_text(self):
        return self._text

    def extract_words(self):
        return self._words


class FakePdf:
    def __init__(self, pages):
        self.pages = pages


def word(text, x0, top):
    return {'text': text, 'x0': x0, 'top': top}


def ss_row(top, words):
    """One table row: (text, x0) pairs at `top`."""
    return [word(t, x, top) for t, x in words]


SS_FIRST = """Smart Shop
Restaurant: #00000 Visit: August, 2026
Restaurant: Test Store Day of Week: Tuesday
Address: 1 Main St Day Part: Lunch
Category Breakdown
CATEGORY COMPLIANT (SCORED) NONCOMPLIANT (SCORED)
Drive Thru 3 1
Carry Out 4 0
Drive Thru
ID STANDARD RESPONSE SCORING TYPE COMPLIANCE"""

HEADER = [('ID', 38), ('STANDARD', 96), ('RESPONSE', 455), ('SCORING', 814), ('TYPE', 855), ('COMPLIANCE', 904)]


def ss_table_page():
    words = [word('Drive', 26, 49), word('Thru', 61, 49)]
    words += ss_row(93, HEADER)
    # A plain row.
    words += ss_row(129, [('2.010.3', 38), ('Order', 96), ('taker', 125), ('shared', 150), ('a', 180), ('smile', 188),
                          ('Yes', 455), ('Scored', 814), ('Compliant', 911)])
    # A wrapped, missed row: ID drawn indented on the middle line.
    words += ss_row(172, [('Order', 144), ('taker', 171), ('responded', 195), ('when', 245), ('thanked', 270), ('by', 305),
                          ('No', 455), ('-', 470), ('Other', 476), ('response', 505), ('Scored', 814), ('Noncompliant', 911)])
    words += ss_row(179, [('2.010.5', 95)])
    words += ss_row(186, [('Customer', 144)])
    # An unscored miss.
    words += ss_row(230, [('2.010.43', 38), ('Surprise', 96), ('and', 140), ('Delight', 160),
                          ('No', 455), ('Unscored', 814), ('Noncompliant', 911)])
    rects = [{'top': t, 'height': 1, 'width': 400} for t in (160, 215, 260)]
    return FakePage('', words, rects)


class SmartShopTest(unittest.TestCase):
    def parse(self):
        return rp.parse_smart_shop(FakePdf([FakePage(SS_FIRST), ss_table_page()]))

    def test_kind_is_recognized(self):
        self.assertEqual(rp.detect_kind(SS_FIRST), 'smartShop')
        self.assertEqual(rp.detect_kind('7 Total Findings\nQ3-2026'), 'foodSafety')
        self.assertIsNone(rp.detect_kind('Positional Excellence Ratings'))

    def test_score_is_scored_standards_met(self):
        r = self.parse()
        self.assertEqual((r['compliant'], r['scored']), (7, 8))
        self.assertEqual(r['score'], 87.5)
        self.assertEqual((r['month'], r['dayOfWeek'], r['daypart']), ('2026-08', 'Tuesday', 'Lunch'))
        self.assertNotIn('1 Main St', str(r))   # the address isn't kept

    def test_misses_keep_id_standard_and_response(self):
        misses = self.parse()['misses']
        self.assertEqual(len(misses), 2)
        wrapped = misses[0]
        self.assertEqual(wrapped['id'], '2.010.5')
        self.assertEqual(wrapped['standard'], 'Order taker responded when thanked by Customer')
        self.assertEqual(wrapped['response'], 'No - Other response')
        self.assertEqual(wrapped['section'], 'Drive Thru')
        self.assertTrue(wrapped['scored'])
        self.assertFalse(misses[1]['scored'])

    def test_no_breakdown_is_an_error(self):
        with self.assertRaises(rp.ReportParseError):
            rp.parse_smart_shop(FakePdf([FakePage('Smart Shop\nCategory Breakdown\nnothing here')]))


FS_TEXT = """Dashboard Findings Appeals
All Findings
3 Total Findings
Q3-2026
101
Q3-2026 REPEAT: 101 TIME & TEMPERATURE HIGH
101.3: Walk-in: Test item one
101.7: Line: Test item two that wraps
onto a second line
124
Q3-2026 TIME & TEMPERATURE MEDIUM
124.1: Test item three
713
Q3-2026 OPERATIONAL REQUIREMENTS LOW
713: Test item four
Rows per page: 10 1 - 3 of 3"""


class FoodSafetyTest(unittest.TestCase):
    def test_findings(self):
        r = rp.parse_food_safety(FakePdf([FakePage(FS_TEXT)]))
        self.assertEqual((r['quarter'], r['total']), ('Q3-2026', 3))
        codes = [(f['code'], f['risk'], f['repeat']) for f in r['findings']]
        self.assertEqual(codes, [('101', 'high', True), ('124', 'medium', False), ('713', 'low', False)])
        self.assertEqual(r['findings'][0]['items'], ['Walk-in: Test item one', 'Line: Test item two that wraps onto a second line'])
        self.assertEqual(r['findings'][0]['category'], 'Time & Temperature')

    def test_no_findings_is_an_error(self):
        with self.assertRaises(rp.ReportParseError):
            rp.parse_food_safety(FakePdf([FakePage('0 Total Findings')]))


QIV_FIRST = """Icon Report
Current Quarter : 2026.Q3 Visit Start Time: 01:30 PM
Included Quarters: 2025.Q4, 2026.Q1 Visit Date: 8/12/2026
Visit Type: Scored Visit"""

QIV_SCORES = """If this is a scored report, Icon color is Score <= 85%
Icon Touchpoint Score
Cooking Test Fries 90%
Finished Product: Test Sandwich 100%
Data Collection 0%
Overall Score 97%"""


def qiv_table_page():
    words = [word('Cooking', 148, 98), word('Test', 206, 98), word('Fries', 240, 98),
             word('Current', 635, 138), word('Previous', 707, 138)]
    words += ss_row(166, [('3.6.2', 75), ('Fries', 148), ('lowered', 175), ('✔', 649), ('✔', 723)])
    words += ss_row(196, [('3.6.3', 75), ('Basket', 148), ('shaken', 180), ('✘', 649), ('✔', 723)])
    # Wrapped and missed on both visits.
    words += ss_row(279, [('Box', 148), ('free', 170), ('of', 195)])
    words += ss_row(284, [('4.3.13', 73), ('Q', 119), ('✘', 649), ('✘', 723)])
    words += ss_row(288, [('staining', 148)])
    # Missed last visit only: not a miss now.
    words += ss_row(320, [('3.1.5', 75), ('Timer', 148), ('✔', 649), ('✘', 723)])
    return FakePage('Cooking Test Fries', words)


class QivTest(unittest.TestCase):
    def test_scores_and_misses(self):
        r = rp.parse_qiv(FakePdf([FakePage(QIV_FIRST), FakePage(QIV_SCORES), qiv_table_page()]))
        self.assertEqual(rp.detect_kind(QIV_FIRST), 'qiv')
        self.assertEqual((r['quarter'], r['date'], r['overall']), ('Q3-2026', '2026-08-12', 97))
        self.assertEqual([t['name'] for t in r['touchpoints']], ['Cooking Test Fries', 'Finished Product: Test Sandwich', 'Data Collection'])
        self.assertEqual([(m['id'], m['standard'], m['qualityDriver'], m['repeat']) for m in r['misses']],
                         [('3.6.3', 'Basket shaken', False, False), ('4.3.13', 'Box free of staining', True, True)])
        self.assertEqual(r['misses'][0]['section'], 'Cooking Test Fries')

    def test_no_overall_is_an_error(self):
        with self.assertRaises(rp.ReportParseError):
            rp.parse_qiv(FakePdf([FakePage(QIV_FIRST)]))


class FileTest(unittest.TestCase):
    def test_zip_without_pdf(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as z:
            z.writestr('notes.txt', 'hello')
        with self.assertRaises(rp.ReportParseError):
            rp.parse_report_file(buf.getvalue(), 'reports.zip')

    def test_not_a_pdf(self):
        with self.assertRaises(rp.ReportParseError):
            rp.parse_report_file(b'not a pdf', 'x.pdf')


class RouteTest(unittest.TestCase):
    def setUp(self):
        self.a = appmod.app.test_client()

    def post(self, name='x.pdf', data=b'%PDF-1.4'):
        return self.a.post('/api/reports/parse', data={'file': (io.BytesIO(data), name)}, content_type='multipart/form-data')

    def test_managers_only(self):
        self.assertEqual(self.post().status_code, 403)

    def test_rejects_other_files_and_bad_pdfs(self):
        with self.a.session_transaction() as sess:
            sess['manager'] = True
        self.assertEqual(self.post('x.csv', b'a,b').status_code, 400)
        r = self.post('x.pdf', b'not a pdf')
        self.assertEqual(r.status_code, 400)
        self.assertIn('not a readable PDF', r.get_json()['error'])


if __name__ == '__main__':
    unittest.main()
