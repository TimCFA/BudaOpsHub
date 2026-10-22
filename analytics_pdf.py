"""Read the Analytics Hub dashboard PDFs in the Schedule Builder's upload
bundle (Tim, Oct 20 2026): the bundle carries daily sales and labor as
dashboard PDFs, not the CSV exports Data Uploads reads, so Know the Numbers
and the Forecast had nothing newer than Oct 4.

 - Daily Detail: a row a day, "10/1/2026 Thursday 10/2/2025 $29,075 $36,515
   -20.38% 318.68 347.55 -28.87 ($570.96) -1.96% $91.23 $83.66 $19.78
   21.68% $16.11": sales, last year's sales and date, % change, timekeeping
   hours, benchmark hours, the difference, overtime $ and %, productivity
   and its benchmark, wage rate, labor %, average check. Weekly "Total" rows
   and closed days (no sales) are skipped.
 - Sales Data (Sales Analytics): "10/01/2026 $29,075.00 -20.38% $2,148.73
   -22.38% …": each day's total and each destination's sales, with the
   change vs last year, in the order the table's header names them.

The page sends the file; this hands back what it read, in the shapes the
page's own importers use (fcMergeRecords, rpParseSales). Nothing is kept.

The bundle's other dashboard PDFs (Tim, Oct 22 2026: get everything out of
the zip) are tables with a column per weekday, read by where each number
sits under its column's heading, since an empty cell leaves no gap in the
text:
 - Productivity: sales per labor hour by hour ("Display Hours") or by
   daypart ("Display Daypart", with the daypart's sales and timekeeping
   hours too), Monday to Saturday.
 - Labor Cost: labor cost as a % of sales by hour, Monday to Saturday.
 - Sales Curve: the average hour (all days): sales, timekeeping hours and
   sales per labor hour.
"""
import io
import re

import pdfplumber

MAX_PAGES = 20
MONEY = r'\(?-?\$[\d,]+(?:\.\d+)?\)?'
NUM = r'\(?-?[\d,]+(?:\.\d+)?\)?'
PCT = r'-?[\d,]+(?:\.\d+)?%'
DESTINATIONS = ('Dine In', 'Drive Thru', 'Carry Out', '3PD', 'Catering')

DAILY_ROW = re.compile(
    r'^(\d{1,2})/(\d{1,2})/(\d{4})\s+[A-Za-z]+\s+(\S+)\s+'
    rf'({MONEY})\s+({MONEY})\s+({PCT})\s+({NUM})\s+({NUM})\s+({NUM})\s+({MONEY})\s+({PCT})\s+'
    rf'({MONEY})\s+({MONEY})\s+({MONEY})\s+({PCT})\s+({MONEY})\s*$')
SALES_ROW = re.compile(r'^(\d{2})/(\d{2})/(\d{4})\s+(.*)$')
PAIR = re.compile(rf'({MONEY})\s+({PCT})')


class AnalyticsPdfError(ValueError):
    pass


def _num(s):
    s = str(s).strip()
    neg = s.startswith('(') and s.endswith(')')
    v = float(re.sub(r'[^\d.\-]', '', s) or 'nan')
    return -v if neg else v


def _text(data):
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            if len(pdf.pages) > MAX_PAGES:
                raise AnalyticsPdfError(f'That PDF has over {MAX_PAGES} pages.')
            return '\n'.join((p.extract_text() or '') for p in pdf.pages)
    except AnalyticsPdfError:
        raise
    except Exception:
        raise AnalyticsPdfError('Couldn’t open that PDF.')


def read_daily_detail(text):
    rows = []
    for line in text.splitlines():
        m = DAILY_ROW.match(line.strip())
        if not m:
            continue
        mo, d, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        ly = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', m.group(4))   # "10/13/20.." when the column is cut
        sales = _num(m.group(5))
        if not sales > 0:
            continue
        rec = {'date': f'{y:04d}-{mo:02d}-{d:02d}', 'sales': sales, 'lastYearSales': _num(m.group(6)),
               'laborHours': _num(m.group(8)), 'benchmarkHours': _num(m.group(9)),
               'wage': _num(m.group(15)), 'laborPct': _num(m.group(16)), 'checkAverage': _num(m.group(17))}
        if ly:
            rec['lastYearDate'] = f'{int(ly.group(3)):04d}-{int(ly.group(1)):02d}-{int(ly.group(2)):02d}'
        rows.append(rec)
    return rows


def read_sales_data(text):
    """→ the shape rpParseSales gives a sales-by-day export: {from, to, total,
    change, channels: {name: {sales, change}}, days: [[iso, sales, change]],
    channelDays: {iso: {name: sales}}}; changes as fractions."""
    lines = [l.strip() for l in text.splitlines()]
    head = next((l for l in lines if l.startswith('Total ') and not PAIR.search(l) and 'Dine' in l), '')
    names = [n for n in DESTINATIONS if n in head]
    days, channel_days, total = [], {}, None
    for line in lines:
        if line.startswith('Total $'):
            pairs = PAIR.findall(line)
            if pairs:
                total = pairs
            continue
        m = SALES_ROW.match(line)
        if not m:
            continue
        pairs = PAIR.findall(m.group(4))
        if not pairs:
            continue
        iso = f'{m.group(3)}-{m.group(1)}-{m.group(2)}'
        days.append([iso, _num(pairs[0][0]), _num(pairs[0][1]) / 100])
        by = {names[i]: _num(p[0]) for i, p in enumerate(pairs[1:]) if i < len(names)}
        if by:
            channel_days[iso] = by
    if not days:
        raise AnalyticsPdfError('No days found in this Sales Data PDF.')
    days.sort()
    out = {'from': days[0][0], 'to': days[-1][0], 'days': days, 'channelDays': channel_days, 'channels': {},
           'total': sum(d[1] for d in days), 'change': None}
    if total:
        # The total covers the report's whole range ("Oct 01, 2026 - Oct 17,
        # 2026"), which can run past the last row the table shows.
        rng = re.search(r'([A-Z][a-z]{2}) (\d{2}), (\d{4}) - ([A-Z][a-z]{2}) (\d{2}), (\d{4})', text)
        if rng:
            mon = {m: i + 1 for i, m in enumerate(('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'))}
            a, b = rng.groups()[:3], rng.groups()[3:]
            if a[0] in mon and b[0] in mon:
                out['from'] = f'{a[2]}-{mon[a[0]]:02d}-{a[1]}'
                out['to'] = f'{b[2]}-{mon[b[0]]:02d}-{b[1]}'
        out['total'], out['change'] = _num(total[0][0]), _num(total[0][1]) / 100
        out['channels'] = {names[i]: {'sales': _num(p[0]), 'change': _num(p[1]) / 100} for i, p in enumerate(total[1:]) if i < len(names)}
    return out


# ----- The dashboards with a column per weekday -----

WEEKDAYS = ('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')
DAYPARTS = ('Breakfast', 'Lunch', 'Afternoon', 'Dinner', 'Latenight')
TABLE_TITLES = {'Productivity': 'prod', 'Sales $': 'sales', 'Timekeeping Hours': 'hours', '% of Sales': 'pct'}
VALUE = re.compile(r'^\(?-?\$?[\d,]+(?:\.\d+)?%?\)?$')


def _lines(data):
    """Each page's words grouped into lines, top to bottom: [[(x, text)]]."""
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            if len(pdf.pages) > MAX_PAGES:
                raise AnalyticsPdfError(f'That PDF has over {MAX_PAGES} pages.')
            out = []
            for page in pdf.pages:
                # A word within 3 points of the line's first word is on that
                # line (a row's label and numbers can sit a point or two apart).
                line, top = [], None
                for w in sorted(page.extract_words(), key=lambda w: w['top']):
                    if top is not None and w['top'] - top > 3:
                        out.append(sorted(line))
                        line = []
                    if not line:
                        top = w['top']
                    line.append(((w['x0'] + w['x1']) / 2, w['text']))
                if line:
                    out.append(sorted(line))
            return out
    except AnalyticsPdfError:
        raise
    except Exception:
        raise AnalyticsPdfError('Couldn’t open that PDF.')


def _hour(words):
    """'6 AM' at the start of a line → minutes after midnight, else None."""
    if len(words) >= 2 and words[0].isdigit() and words[1] in ('AM', 'PM') and 1 <= int(words[0]) <= 12:
        return int(words[0]) % 12 * 60 + (720 if words[1] == 'PM' else 0)
    return None


def _nearest(x, cols):
    """The column a value centred at x sits under, if it's clearly under one."""
    if not cols:
        return None
    gap = min((b[0] - a[0] for a, b in zip(cols, cols[1:])), default=200)
    best = min(cols, key=lambda c: abs(c[0] - x))
    return best[1] if abs(best[0] - x) <= gap * 0.6 else None


def read_weekday_tables(lines):
    """{table: {row: {weekday | 'AVERAGE': value}}} for every table headed by
    weekday names; a row is an hour (minutes) or a daypart."""
    tables, title, cols = {}, None, []
    for line in lines:
        words = [t for _, t in line]
        joined = ' '.join(words)
        if joined in TABLE_TITLES:
            title, cols = TABLE_TITLES[joined], []
            continue
        if sum(w in WEEKDAYS for w in words) >= 3:
            cols = [(x, t) for x, t in line if t in WEEKDAYS or t == 'AVERAGE']
            continue
        if not (title and cols):
            continue
        row = _hour(words)
        if row is None and words[0] in DAYPARTS + ('AVERAGE',):
            row = words[0]
        if row is None:
            continue
        cells = {}
        for x, t in line:
            if VALUE.match(t) and (t.startswith(('$', '(')) or '.' in t or t.endswith('%')):
                col = _nearest(x, cols)
                if col and col not in cells:
                    cells[col] = _num(t)
        if cells:
            tables.setdefault(title, {})[row] = cells
    return tables


def read_sales_curve(lines):
    """The table under the chart: a column per hour ('4 AM' … '11 PM'), rows
    of average timekeeping hours, average sales and productivity. →
    {minutes: {labor, sales, prod}}"""
    head = None
    for i, line in enumerate(lines):
        words = [t for _, t in line]
        hours = [(line[j][0] + line[j + 1][0]) / 2 for j in range(len(words) - 1) if _hour(words[j:j + 2]) is not None]
        if len(hours) >= 10:
            head = (i, [(x, _hour([words[j], words[j + 1]])) for x, j in
                        zip(hours, [j for j in range(len(words) - 1) if _hour(words[j:j + 2]) is not None])])
    if not head:
        raise AnalyticsPdfError('No hour-by-hour table in this Sales Curve PDF.')
    i, cols = head
    rows = []
    for line in lines[i + 1:]:
        vals = [(x, t) for x, t in line if VALUE.match(t)]
        if len(vals) >= len(cols) * 0.6:
            rows.append({c: _num(t) for x, t in vals for c in [_nearest(x, cols)] if c is not None})
        if len(rows) == 3:
            break
    if len(rows) < 3:
        raise AnalyticsPdfError('The Sales Curve table is missing its hours, sales or productivity row.')
    labor, sales, prod = rows
    return {m: {'labor': labor.get(m), 'sales': sales.get(m), 'prod': prod.get(m)} for _, m in cols}


def _dash_meta(text):
    """The dashboard's date range and when it was last updated."""
    meta = {}
    up = re.search(r'Last Update:\s*(\d{1,2})/(\d{1,2})/(\d{4})', text)
    if up:
        meta['updated'] = f'{int(up.group(3)):04d}-{int(up.group(1)):02d}-{int(up.group(2)):02d}'
    custom = re.search(r'Custom Dates\s+(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2})/(\d{1,2})/(\d{4})', text)
    if custom:
        g = [int(v) for v in custom.groups()]
        meta['from'] = f'{g[2]:04d}-{g[0]:02d}-{g[1]:02d}'
        meta['to'] = f'{g[5]:04d}-{g[3]:02d}-{g[4]:02d}'
        meta['range'] = 'custom'
    elif 'Month to Date' in text:
        meta['range'] = 'month to date'
    elif 'Year to Date' in text:
        meta['range'] = 'year to date'
    return meta


def read_analytics_pdf(data):
    """{kind: 'dailyDetail', rows} or {kind: 'salesData', sales}, or a
    weekday dashboard: {kind: 'productivity' | 'laborCost', by: 'hour' |
    'daypart', tables, ...meta}, {kind: 'salesCurve', hours, ...meta}; raises
    AnalyticsPdfError for any other PDF."""
    if not data or not data.startswith(b'%PDF'):
        raise AnalyticsPdfError('Not a PDF.')
    text = _text(data)
    title = next((l.strip() for l in text.splitlines() if l.strip()), '')
    if title in ('Productivity', 'Labor Cost') and re.search(r'Labor (Productivity|Cost %)', text):
        tables = read_weekday_tables(_lines(data))
        by = 'daypart' if any(isinstance(r, str) and r in DAYPARTS for t in tables.values() for r in t) else 'hour'
        tables = {k: {str(r): v for r, v in t.items()} for k, t in tables.items()}
        want = 'prod' if title == 'Productivity' else 'pct'
        if want not in tables:
            raise AnalyticsPdfError(f'No {title.lower()} table found in this PDF.')
        return {'kind': 'productivity' if title == 'Productivity' else 'laborCost', 'by': by, 'tables': tables, **_dash_meta(text)}
    if title == 'Sales Curve':
        hours = read_sales_curve(_lines(data))
        return {'kind': 'salesCurve', 'hours': {str(m): v for m, v in hours.items()}, **_dash_meta(text)}
    if re.search(r'^Daily Detail\b', text, re.M):
        rows = read_daily_detail(text)
        if not rows:
            raise AnalyticsPdfError('No days with sales found in this Daily Detail PDF.')
        return {'kind': 'dailyDetail', 'rows': rows}
    if re.search(r'^Sales Analytics\b', text, re.M) and 'Sales Details by Day' in text:
        return {'kind': 'salesData', 'sales': read_sales_data(text)}
    raise AnalyticsPdfError('Not an Analytics Hub Daily Detail, Sales Data, Productivity, Labor Cost or Sales Curve PDF.')
