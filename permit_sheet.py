"""Read a spreadsheet of the team's food handler permit dates (Tim, Oct 20
2026) into rows of name and dates, for the Our Team profiles (TIM-82).

The page sends the file; this reads it on the server and hands the rows back
for a check before anything is saved (/api/team/profiles/bulk). Nothing from
the file is kept or logged.

The sheet's exact layout isn't known, so the columns are found by their
headers, in the first rows of the first sheet that has them:
 - the name: a Name / Employee / Team Member column, or First and Last;
 - the permit: a column naming an expiry (Expires, Exp, Expiration) and
   the food handler card or permit, or just an expiry if there's one;
   failing that, the date the card was issued (Issued, Completed, Taken),
   from which the expiry is worked out: a Texas food handler certificate is
   good for two years;
 - and when they're there, the hire date and the birthday.
Excel dates, Excel date numbers and dates typed as text all read. .xlsx and
.csv; an old .xls has to be saved as .xlsx first.
"""
import csv
import io
import re
from datetime import date, datetime, timedelta

from pin_report import tidy_name

MAX_ROWS = 1000
HEADER_ROWS = 15
TEXAS_PERMIT_YEARS = 2

HEAD_NAME = re.compile(r'\b(name|employee|team member|associate|director|leader)s?\b', re.I)
HEAD_FIRST = re.compile(r'\bfirst\b', re.I)
HEAD_LAST = re.compile(r'\blast\b', re.I)
HEAD_PERMIT = re.compile(r'food|handler|permit|card|cert|servsafe', re.I)
HEAD_EXPIRY = re.compile(r'expir|\bexp\b|\bexp\.|\bdue\b|valid (until|through|thru)', re.I)
HEAD_ISSUED = re.compile(r'issue|complet|taken|\bobtained\b|\bearned\b', re.I)
HEAD_HIRE = re.compile(r'\b(hire|hired|start)\b', re.I)
HEAD_BIRTH = re.compile(r'birth|\bdob\b|\bbday\b', re.I)
HEAD_DATE = re.compile(r'^date$', re.I)
NOT_NAMES = re.compile(r'^(total|name|employee|store|location|chick-fil-a|report|page)\b', re.I)
DATE_FORMATS = ('%m/%d/%Y', '%m/%d/%y', '%Y-%m-%d', '%m-%d-%Y', '%m-%d-%y', '%b %d, %Y', '%B %d, %Y', '%b %d %Y',
                '%B %d %Y', '%d-%b-%Y', '%d-%b-%y', '%m/%d/%Y %H:%M', '%m/%d/%Y %I:%M %p', '%Y-%m-%d %H:%M:%S')


class PermitSheetError(ValueError):
    pass


def _cell_text(v):
    return re.sub(r'\s+', ' ', str(v if v is not None else '')).strip()


def to_iso(v):
    """An Excel date, Excel date number or a typed date → 'YYYY-MM-DD', or ''."""
    if v is None or v == '':
        return ''
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        # Excel's day numbers (1900 system): 20000 is 1954, 80000 is 2119.
        if 20000 <= v <= 80000:
            return (date(1899, 12, 30) + timedelta(days=int(v))).isoformat()
        return ''
    t = _cell_text(v).rstrip('.')
    for fmt in DATE_FORMATS:
        try:
            d = datetime.strptime(t, fmt).date()
        except ValueError:
            continue
        # A two-digit year far in the future is a birthday last century.
        if d.year > date.today().year + 40:
            d = d.replace(year=d.year - 100)
        return d.isoformat()
    return ''


def _plus_years(iso, years):
    d = date.fromisoformat(iso)
    try:
        return d.replace(year=d.year + years).isoformat()
    except ValueError:                       # Feb 29
        return d.replace(year=d.year + years, day=28).isoformat()


def _kind(c):
    """What a header cell names: name, first, last, expiry, issued, permit,
    hireDate, birthday, date (a bare "Date"), or None."""
    if not c:
        return None
    if HEAD_BIRTH.search(c):
        return 'birthday'
    if HEAD_HIRE.search(c):
        return 'hireDate'
    if HEAD_EXPIRY.search(c):
        return 'expiry'
    if HEAD_ISSUED.search(c):
        return 'issued'
    if HEAD_FIRST.search(c):
        return 'first'
    if HEAD_LAST.search(c):
        return 'last'
    if HEAD_NAME.search(c):
        return 'name'
    if HEAD_PERMIT.search(c):
        return 'permit'                     # "Food Handler": a date of some kind
    if HEAD_DATE.search(c):
        return 'date'
    return None


def _find_tables(head):
    """The name-and-date tables in one header row, side by side (Tim's sheet:
    Team Member / Expiration Date, then Director / Date), as [{field: index}];
    None if it isn't a header row."""
    cells = [_cell_text(c) for c in head]
    tables, cur, permit_named = [], None, False
    for i, c in enumerate(cells):
        k = _kind(c)
        if not k:
            continue
        # A name column after a table that already has one starts the next table.
        if k in ('name', 'first') and (cur is None or 'name' in cur or 'first' in cur):
            cur, permit_named = {}, False
            tables.append(cur)
        if cur is None:
            cur = {}
            tables.append(cur)
        if k == 'date':                      # a bare "Date" in a table is its expiry
            if 'expiry' in cur:
                continue
            k = 'expiry'
        if k == 'expiry':
            # The first expiry that names the permit wins over a bare "Expires".
            names_permit = bool(HEAD_PERMIT.search(c))
            if 'expiry' not in cur or (names_permit and not permit_named):
                cur['expiry'], permit_named = i, names_permit
            continue
        cur.setdefault(k, i)
    found = [t for t in tables if ('name' in t or ('first' in t and 'last' in t))
             and any(k in t for k in ('expiry', 'issued', 'permit', 'hireDate', 'birthday'))]
    return (found, cells) if found else None


def _grid(data, filename):
    name = (filename or '').lower()
    if name.endswith('.xls') and not data[:2] == b'PK':
        raise PermitSheetError('That’s an older Excel file (.xls). Open it in Excel and save it as .xlsx, then pick it again.')
    if name.endswith('.csv') or (not name.endswith('.xlsx') and not data[:2] == b'PK'):
        try:
            text = data.decode('utf-8-sig')
        except UnicodeDecodeError:
            text = data.decode('latin-1')
        return [('Sheet', list(csv.reader(io.StringIO(text))))]
    try:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception:
        raise PermitSheetError('Couldn’t open that file as an Excel workbook (.xlsx).')
    sheets = []
    for ws in wb.worksheets:
        rows = []
        for r in ws.iter_rows(values_only=True):
            rows.append(list(r))
            if len(rows) > MAX_ROWS + HEADER_ROWS:
                break
        sheets.append((ws.title, rows))
    wb.close()
    return sheets


def _read_table(rows, h, cols, heads, notes, skipped):
    permit_from = 'expiry' if 'expiry' in cols else 'issued' if 'issued' in cols else 'permit' if 'permit' in cols else ''
    if permit_from == 'issued':
        notes.append(f'No expiry column, so each permit’s expiry is worked out as {TEXAS_PERMIT_YEARS} years after “{heads[cols["issued"]]}” (Texas food handler certificates last {TEXAS_PERMIT_YEARS} years).')
    if permit_from == 'permit':
        notes.append(f'“{heads[cols["permit"]]}” is read as the permit’s expiry date. If it’s the date the card was issued, rename the column “Issued” and pick the file again.')
    get = lambda r, k: r[cols[k]] if k in cols and cols[k] < len(r) else None
    # A Director table: directors sign in with Google, so they're never on
    # the clock-in PIN list; the page ticks them anyway.
    directors = 'name' in cols and bool(re.search(r'director', heads[cols['name']], re.I))
    out = []
    for n, r in enumerate(rows[h + 1:h + 1 + MAX_ROWS], start=h + 2):
        raw = f'{_cell_text(get(r, "first"))} {_cell_text(get(r, "last"))}' if 'name' not in cols else _cell_text(get(r, 'name'))
        name = tidy_name(raw)
        if not name or NOT_NAMES.match(name) or not re.search(r'[A-Za-zÀ-ÿ]', name):
            continue
        rec = {'name': name[:80], 'line': n}
        if directors:
            rec['director'] = True
        if permit_from:
            d = to_iso(get(r, permit_from))
            if d and permit_from == 'issued':
                d = _plus_years(d, TEXAS_PERMIT_YEARS)
            if d:
                rec['permitExpires'] = d
            elif _cell_text(get(r, permit_from)):
                skipped.append(f'{name}: couldn’t read “{_cell_text(get(r, permit_from))}” as a date')
        for k in ('hireDate', 'birthday'):
            d = to_iso(get(r, k))
            if d:
                rec[k] = d
        if len(rec) > 2 + ('director' in rec):
            out.append(rec)
    return out


def _read_sheet(title, rows):
    for h in range(min(HEADER_ROWS, len(rows))):
        found = _find_tables(rows[h])
        if not found:
            continue
        tables, heads = found
        notes, skipped, out, seen = [], [], [], set()
        for cols in tables:
            for rec in _read_table(rows, h, cols, heads, notes, skipped):
                key = rec['name'].lower()
                if key not in seen:              # one row a person
                    seen.add(key)
                    out.append(rec)
        columns = [{k: heads[i] for k, i in cols.items()} for cols in tables]
        return {'sheet': title, 'rows': out, 'columns': columns, 'notes': notes, 'skipped': skipped[:50]}
    return None


def read_permit_sheet(data, filename=''):
    """Every sheet with a name column and a date column: {sheets: [{sheet,
    rows: [{name, permitExpires?, hireDate?, birthday?, line}], columns:
    [{field: header}, ...] (one a table), notes, skipped}]}, and the first
    sheet's fields at the top as well. A workbook can hold more than one
    store's sheet; the page picks the one that matches its team."""
    if not data:
        raise PermitSheetError('That file is empty.')
    sheets = [r for r in (_read_sheet(t, rows) for t, rows in _grid(data, filename)) if r]
    if not sheets:
        raise PermitSheetError('Couldn’t find a name column and a date column in the first rows. The sheet needs headers like “Name” and “Food Handler Expires”.')
    return dict(sheets[0], sheets=sheets)
