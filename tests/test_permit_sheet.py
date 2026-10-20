"""Permit dates from a spreadsheet (Tim, Oct 20 2026): the team's food
handler permit expirations (and hire dates, birthdays) read from an Excel
sheet into the Our Team profiles (TIM-82), checked before saving.

Run: python3 -m unittest discover tests
The workbooks are built here with made-up names.
"""
import io
import os
import sys
import unittest
from datetime import date, datetime

import openpyxl

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from permit_sheet import read_permit_sheet, to_iso, PermitSheetError  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def xlsx(*rows, title='Team', more=()):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = title
    for r in rows:
        ws.append(list(r))
    for t, rs in more:                       # more sheets: (title, rows)
        w = wb.create_sheet(t)
        for r in rs:
            w.append(list(r))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class ReadsTheSheet(unittest.TestCase):
    def test_name_and_expiry_columns_excel_dates(self):
        data = xlsx(['Chick-fil-A Buda team certifications'], [],
                    ['Employee', 'Position', 'Food Handler Issued', 'Food Handler Expires', 'Hire Date', 'DOB'],
                    ['RUIZ LOPEZ, ANA', 'Team Member', datetime(2025, 3, 1), datetime(2027, 3, 1), datetime(2025, 2, 20), datetime(2009, 6, 5)],
                    ['Leo Park', 'Team Lead', None, '11/30/2026', '2024-08-01', None],
                    ['Total: 2', None, None, None, None, None])
        d = read_permit_sheet(data, 'team.xlsx')
        self.assertEqual(d['sheet'], 'Team')
        self.assertEqual(d['columns'], [{'name': 'Employee', 'issued': 'Food Handler Issued', 'expiry': 'Food Handler Expires',
                                         'hireDate': 'Hire Date', 'birthday': 'DOB'}])
        self.assertEqual([(r['name'], r.get('permitExpires'), r.get('hireDate'), r.get('birthday')) for r in d['rows']],
                         [('Ana Ruiz Lopez', '2027-03-01', '2025-02-20', '2009-06-05'), ('Leo Park', '2026-11-30', '2024-08-01', None)])
        self.assertEqual(d['notes'], [])

    def test_the_stores_workbook_two_sheets_two_tables_side_by_side(self):
        """The shape of the store's Food Handler Cards workbook (Oct 20 2026):
        a sheet per store; on each, Team Member / Expiration Date, a blank
        column, then Director / Date. Some cells say "awaiting feedback";
        one date doesn't exist (Feb 29 in a common year)."""
        west = [['xx', None], ['Team Member', 'Expiration Date', None, 'Director', 'Date'],
                ['Kai West', datetime(2027, 1, 5), None, 'Dee West', datetime(2028, 4, 25)],
                ['Lu West', 'awaiting feedback', None, None, None],
                ['Mo West', '02/29/2029', None, None, None]] + [[None] * 5] * 50
        buda = [['Team Member', 'Expiration Date', None, 'Director', 'Date'],
                ['Ana Ruiz', datetime(2026, 3, 24), None, 'Tim Owner', datetime(2025, 8, 23)],
                ['Bo Stone', None, None, 'Ray Dee', datetime(2028, 7, 10)],
                ['Cy Ford', datetime(2030, 3, 31), None, None, None],
                ['Ray Dee', datetime(2028, 7, 10), None, None, None]]   # on both tables: once
        d = read_permit_sheet(xlsx(*west, title='West Buda', more=[('Buda', buda)]), 'Food_Handler_Cards_2026.xlsx')
        self.assertEqual([s['sheet'] for s in d['sheets']], ['West Buda', 'Buda'])
        w, b = d['sheets']
        self.assertEqual(w['columns'], [{'name': 'Team Member', 'expiry': 'Expiration Date'}, {'name': 'Director', 'expiry': 'Date'}])
        self.assertEqual([(r['name'], r['permitExpires'], r.get('director', False)) for r in w['rows']],
                         [('Kai West', '2027-01-05', False), ('Dee West', '2028-04-25', True)])   # directors aren't on the PIN list: flagged
        self.assertEqual(w['skipped'], ['Lu West: couldn’t read “awaiting feedback” as a date', 'Mo West: couldn’t read “02/29/2029” as a date'])
        self.assertEqual([(r['name'], r['permitExpires']) for r in b['rows']],
                         [('Ana Ruiz', '2026-03-24'), ('Cy Ford', '2030-03-31'), ('Ray Dee', '2028-07-10'), ('Tim Owner', '2025-08-23')])
        self.assertEqual(d['sheet'], 'West Buda')                 # the first sheet's at the top too

    def test_first_and_last_and_only_an_issue_date(self):
        # No expiry column: a Texas food handler certificate is good for two years.
        data = xlsx(['First Name', 'Last Name', 'Food Handler Completed'], ['Sam', 'Ortiz', datetime(2025, 10, 2)],
                    ['Mia', 'Cole', 46000])             # an Excel day number: 2025-12-09
        d = read_permit_sheet(data, 'permits.xlsx')
        self.assertEqual([(r['name'], r['permitExpires']) for r in d['rows']], [('Sam Ortiz', '2027-10-02'), ('Mia Cole', '2027-12-09')])
        self.assertIn('2 years after “Food Handler Completed”', d['notes'][0])

    def test_a_bare_permit_column_reads_as_the_expiry_with_a_note(self):
        d = read_permit_sheet(xlsx(['Name', 'Food Handler Card'], ['Kim Lee', '3/1/27']), 'x.xlsx')
        self.assertEqual(d['rows'][0]['permitExpires'], '2027-03-01')
        self.assertIn('read as the permit’s expiry', d['notes'][0])

    def test_unreadable_cells_and_blank_rows(self):
        d = read_permit_sheet(xlsx(['Name', 'Permit Exp'], ['Kim Lee', 'next spring'], [], ['Bo Stone', None], ['Ty Moss', '2027-01-15']), 'x.xlsx')
        self.assertEqual([r['name'] for r in d['rows']], ['Ty Moss'])
        self.assertEqual(d['skipped'], ['Kim Lee: couldn’t read “next spring” as a date'])

    def test_csv_too(self):
        d = read_permit_sheet('Name,Food Handler Expiration\n"Park, Leo",12/01/2026\n'.encode(), 'permits.csv')
        self.assertEqual(d['rows'][0]['name'], 'Leo Park')
        self.assertEqual(d['rows'][0]['permitExpires'], '2026-12-01')

    def test_what_isnt_a_permit_sheet(self):
        with self.assertRaises(PermitSheetError):
            read_permit_sheet(xlsx(['Item', 'Price'], ['Fries', 2]), 'menu.xlsx')
        with self.assertRaises(PermitSheetError):
            read_permit_sheet(b'', 'x.xlsx')
        with self.assertRaises(PermitSheetError) as e:
            read_permit_sheet(b'\xd0\xcf\x11\xe0old excel', 'old.xls')
        self.assertIn('.xlsx', str(e.exception))

    def test_dates(self):
        self.assertEqual([to_iso(v) for v in (date(2027, 3, 1), '03/01/2027', 'Mar 1, 2027', '3-1-27', 46447, 12, 'soon', None)],
                         ['2027-03-01', '2027-03-01', '2027-03-01', '2027-03-01', '2027-03-01', '', '', ''])
        self.assertEqual(to_iso('6/5/09'), '2009-06-05')      # a birthday, not 2109

    def test_requirements_carry_the_reader(self):
        with open(os.path.join(ROOT, 'requirements.txt')) as f:
            self.assertIn('openpyxl==', f.read())


if __name__ == '__main__':
    unittest.main()
