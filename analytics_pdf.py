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


def read_analytics_pdf(data):
    """{kind: 'dailyDetail', rows} or {kind: 'salesData', sales}; raises
    AnalyticsPdfError for any other PDF."""
    if not data or not data.startswith(b'%PDF'):
        raise AnalyticsPdfError('Not a PDF.')
    text = _text(data)
    if re.search(r'^Daily Detail\b', text, re.M):
        rows = read_daily_detail(text)
        if not rows:
            raise AnalyticsPdfError('No days with sales found in this Daily Detail PDF.')
        return {'kind': 'dailyDetail', 'rows': rows}
    if re.search(r'^Sales Analytics\b', text, re.M) and 'Sales Details by Day' in text:
        return {'kind': 'salesData', 'sales': read_sales_data(text)}
    raise AnalyticsPdfError('Not an Analytics Hub Daily Detail or Sales Data PDF.')
