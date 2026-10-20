"""The team's clock-in PIN report as a PDF (Tim, Oct 19 2026): Manage →
Settings → Accounts reads it on the server into rows of name, PIN and role,
shows them to the owner to check, and saves through /api/accounts/pins
(which keeps only a keyed hash of each PIN). Nothing from the file is kept.

The PDFs are built here from made-up names and PINs.

Run: python3 -m unittest discover tests
"""
import io
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
import pin_report  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
store = {}


def make_pdf(pages, cols=(40, 220, 330, 420)):
    """A small text PDF: each page a list of lines, each line a list of
    cells placed at the column x positions."""
    def esc(t):
        return t.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
    objs = ['<< /Type /Catalog /Pages 2 0 R >>', None, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    kids = []
    for lines in pages:
        body = 'BT /F1 10 Tf ' + ' '.join(f'1 0 0 1 {x} {760 - 18 * i} Tm ({esc(c)}) Tj'
                                         for i, line in enumerate(lines) for x, c in zip(cols, line)) + ' ET'
        objs.append(f'<< /Length {len(body)} >>\nstream\n{body}\nendstream')
        objs.append(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {len(objs)} 0 R /Resources << /Font << /F1 3 0 R >> >> >>')
        kids.append(f'{len(objs)} 0 R')
    objs[1] = f'<< /Type /Pages /Kids [{" ".join(kids)}] /Count {len(kids)} >>'
    out, offsets = b'%PDF-1.4\n', []
    for i, o in enumerate(objs):
        offsets.append(len(out))
        out += f'{i + 1} 0 obj\n{o}\nendobj\n'.encode('latin-1')
    xref = len(out)
    out += f'xref\n0 {len(objs) + 1}\n0000000000 65535 f \n'.encode() + b''.join(f'{o:010d} 00000 n \n'.encode() for o in offsets)
    out += f'trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    return out


WITH_HEADER = make_pdf([
    [['Team Clock PINs'], ['Employee Name', 'Employee ID', 'Clock PIN', 'Job'],
     ['RUIZ LOPEZ, ANA', '004512', '482913', 'Team Leader FOH'],
     ['Park, Leo', '004513', '593024', 'Trainer'],
     ['Mia Cole', '004514', '604135', 'Team Member BOH']],
    [['Employee Name', 'Employee ID', 'Clock PIN', 'Job'],
     ['Sam Ortiz', '004515', '715246', 'Director'],
     ['Jo Bell', '004516', '', 'Team Member'],
     ['Mia Cole', '004514', '604135', 'Team Member BOH'],
     ['Page 2 of 2']]])

NO_HEADER = make_pdf([[['Chick-fil-A Buda'], ['Ana Ruiz', '482913', 'Team Lead'], ['Leo Park', '593024'],
                       ['Sam Ortiz', '123456', '654321'], ['Printed 10/19/2026'], ['Page 1 of 1']]])


class FakeRef:
    def __init__(self, path):
        self.path = path.strip('/')

    def get(self):
        return store.get(self.path)

    def set(self, value):
        store[self.path] = value


class Reader(unittest.TestCase):
    def test_a_report_with_column_headers(self):
        got = pin_report.read_pin_report(WITH_HEADER)
        self.assertEqual(got['how'], 'columns')
        self.assertEqual(got['rows'], [
            {'name': 'Ana Ruiz Lopez', 'pin': '482913', 'role': 'Team Lead', 'roleFromReport': True},   # not the employee ID
            {'name': 'Leo Park', 'pin': '593024', 'role': 'Trainer', 'roleFromReport': True},
            {'name': 'Mia Cole', 'pin': '604135', 'role': 'Team Member', 'roleFromReport': True},          # once, though on both pages
            {'name': 'Sam Ortiz', 'pin': '715246', 'role': 'Director', 'roleFromReport': True}])
        self.assertEqual(got['unread'], ['Jo Bell'])                  # no PIN on the line

    def test_a_report_without_headers(self):
        got = pin_report.read_pin_report(NO_HEADER)
        self.assertEqual(got['how'], 'lines')
        self.assertEqual(got['rows'], [
            {'name': 'Ana Ruiz', 'pin': '482913', 'role': 'Team Lead', 'roleFromReport': True},
            {'name': 'Leo Park', 'pin': '593024', 'role': 'Team Member', 'roleFromReport': False}])
        self.assertEqual(got['unread'], ['Sam Ortiz'])                # two 6-digit numbers: can't tell which

    def test_not_a_pdf(self):
        for data in (b'', b'Name,PIN\nAna,123456', b'%PDF-1.4 broken'):
            with self.assertRaises(pin_report.PinReportError):
                pin_report.read_pin_report(data)

    def test_names_and_roles(self):
        self.assertEqual(pin_report.tidy_name('RUIZ LOPEZ, ANA M'), 'Ana M Ruiz Lopez')
        self.assertEqual(pin_report.tidy_name("o'neil, KATE"), "Kate O'Neil")
        self.assertEqual(pin_report.tidy_name('Ana  Ruiz'), 'Ana Ruiz')
        self.assertEqual([pin_report.role_of(t)[0] for t in ('Team Leader', 'TL Trainer', 'Operator', 'Team Member', 'Cashier', 'Admin', 'Administrative Assistant', 'Admin Director')],
                         ['Team Lead', 'Team Lead', 'Director', 'Team Member', 'Team Member', 'Admin Team', 'Admin Team', 'Director'])
        self.assertEqual(pin_report.role_of('Cashier')[1], False)


class Route(unittest.TestCase):
    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        store.clear()
        self.c = appmod.app.test_client()

    def post(self, data, name='pins.pdf'):
        return self.c.post('/api/accounts/pins/read', data={'file': (io.BytesIO(data), name)}, content_type='multipart/form-data')

    def test_owner_only(self):
        self.assertEqual(self.post(WITH_HEADER).status_code, 403)
        with self.c.session_transaction() as sess:
            sess['manager'] = True                       # a manager, not the owner
        self.assertEqual(self.post(WITH_HEADER).status_code, 403)

    def test_reads_and_keeps_nothing(self):
        with self.c.session_transaction() as sess:
            sess['manager'] = True
            sess['owner'] = True
        r = self.post(WITH_HEADER)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers['Cache-Control'], 'no-store')
        self.assertEqual(len(r.get_json()['rows']), 4)
        self.assertEqual(store, {})                      # read, handed back, not saved
        bad = self.post(b'not a pdf', 'pins.csv')
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(bad.get_json()['error'], 'That isn’t a PDF.')
        self.assertEqual(self.c.post('/api/accounts/pins/read').status_code, 400)


class PageWiring(unittest.TestCase):
    def test_accounts_takes_the_pdf_and_shows_it_to_check(self):
        with open(os.path.join(ROOT, 'static', 'js', 'accounts.js'), encoding='utf-8') as f:
            js = f.read()
        self.assertIn('accept=".pdf,application/pdf,.csv,.txt,text/csv,text/plain"', js)
        self.assertIn("if(f.type === 'application/pdf' || /\\.pdf$/i.test(f.name)){ acReadPinReport(f); return; }", js)
        # The check list shows the last two digits only.
        self.assertIn("PIN ••••${escapeHtml(String(r.pin).slice(-2))}", js)
        # Saved as name, PIN and role only (not the notes shown beside them).
        self.assertIn('...(acPinRows || []).map(r => ({name: r.name, pin: r.pin, role: r.role}))', js)


if __name__ == '__main__':
    unittest.main()
