"""Reads the Ops Hub PDF reports the Guest Obsession scoreboard runs on.

Two kinds, recognized from the first page:
  * Smart Shop assessment ("Smart Shop … Category Breakdown"): one mystery
    shop visit. Kept: the visit month, weekday and daypart, the compliant /
    noncompliant counts per section, and every standard that was missed
    (scored or not), with the shopper's response. Photos, temperatures and
    the restaurant's address are not kept.
  * Food safety "All Findings" report: the quarter's findings, each with its
    code, category, risk level, whether it's a repeat, and the items cited.

Ops Hub downloads Smart Shops as a .zip holding one PDF; a zip is opened and
each PDF inside is read. Nothing is stored here — the page files the result.

Smart Shop tables wrap long standards onto two lines with the ID centered
between them, so rows are split on the thin rules drawn between them and
words are put in columns by their position under the header.
"""
import io
import re
import zipfile

import pdfplumber


class ReportParseError(ValueError):
    pass


MAX_PDFS_PER_ZIP = 12
MAX_UNZIPPED_BYTES = 120 * 1024 * 1024   # what a zip may expand to

SS_COLUMNS = ['id', 'standard', 'response', 'scoring', 'compliance']
SS_HEADER = ['ID', 'STANDARD', 'RESPONSE', 'SCORING', 'COMPLIANCE']
BREAKDOWN_RE = re.compile(r'^(.+?)\s+(\d+)\s+(\d+)$')
SS_ID_RE = re.compile(r'^\d+\.\d+\.\d+$')
# "Q3-2026 REPEAT: 101 TIME & TEMPERATURE HIGH" or, first-time findings,
# "Q3-2026 TIME & TEMPERATURE HIGH" under a line holding just the code.
FS_FINDING_RE = re.compile(r'^(Q\d-\d{4})\s+(?:REPEAT:\s*(\d+)\s+)?(.+?)\s+(HIGH|MEDIUM|LOW)$')
FS_ITEM_RE = re.compile(r'^(\d+(?:\.\d+)?):\s*(.+)$')
FS_NOISE_RE = re.compile(r'^(Dashboard Findings Appeals|All Findings|Search Filters|Rows per page.*|\d+|Q\d-\d{4})$')


def _page_text(page):
    return page.extract_text() or ''


def detect_kind(first_page_text):
    if 'Smart Shop' in first_page_text and 'Category Breakdown' in first_page_text:
        return 'smartShop'
    if re.search(r'\d+\s+Total Findings', first_page_text):
        return 'foodSafety'
    return None


# ----- Smart Shop -----

def _ss_header_fields(text):
    def grab(label):
        m = re.search(label + r':\s*(.+?)(?:\s{2,}|$|\s+(?:Restaurant|Day of Week|Day Part|Temperature|Address|City)\b)', text, re.M)
        return m.group(1).strip() if m else ''
    return {'visit': grab('Visit'), 'dayOfWeek': grab('Day of Week'), 'daypart': grab('Day Part')}


def _ss_breakdown(text):
    lines = text.splitlines()
    try:
        start = next(i for i, l in enumerate(lines) if l.startswith('CATEGORY') and 'NONCOMPLIANT' in l)
    except StopIteration:
        raise ReportParseError('This Smart Shop has no Category Breakdown.')
    out = []
    for line in lines[start + 1:]:
        m = BREAKDOWN_RE.match(line.strip())
        if not m:
            break
        out.append({'name': m.group(1), 'compliant': int(m.group(2)), 'noncompliant': int(m.group(3))})
    if not out:
        raise ReportParseError('This Smart Shop has no Category Breakdown.')
    return out


def _ss_rows(pdf, sections):
    """Every standard row in reading order: {section, id, standard, response,
    scoring, compliance}."""
    rows, section, cols = [], None, None
    names = {s['name'] for s in sections}
    for page in pdf.pages[1:] if len(pdf.pages) > 1 else pdf.pages:
        words = page.extract_words()
        if not words:
            continue
        # Header rows (one per section table) give the column positions.
        header_tops = sorted({round(w['top'], 1) for w in words if w['text'] == 'COMPLIANCE'})
        for top in header_tops:
            line = [w for w in words if abs(w['top'] - top) < 3]
            xs = {w['text']: w['x0'] for w in line}
            if all(h in xs for h in SS_HEADER):
                cols = [xs[h] for h in SS_HEADER]
        if not cols:
            continue
        seps = sorted(r['top'] for r in page.rects if r['height'] < 2 and r['width'] > 300)
        # Lines by position; section titles are a line that is exactly a
        # category name, left of the ID column.
        events = []
        by_line = {}
        for w in words:
            by_line.setdefault(round(w['top']), []).append(w)
        for top, ws in sorted(by_line.items()):
            text = ' '.join(x['text'] for x in sorted(ws, key=lambda x: x['x0']))
            if text in names and ws[0]['x0'] < cols[0]:
                events.append((top, 'section', text))
            elif any(abs(top - h) < 3 for h in header_tops) or text == 'Appendix' or text.startswith('IMAGE(S)'):
                events.append((top, 'break', text))
        breaks = sorted([t for t, kind, _ in events] + seps)
        groups = {}
        for w in words:
            top = w['top']
            if any(abs(top - t) < 3 for t, kind, _ in events):
                continue
            key = sum(1 for b in breaks if b <= top)
            groups.setdefault(key, []).append(w)
        # Walk sections and rows together in page order.
        items = [(t, 'event', (kind, text)) for t, kind, text in events]
        items += [(min(w['top'] for w in ws), 'row', ws) for ws in groups.values()]
        for _, what, data in sorted(items, key=lambda x: x[0]):
            if what == 'event':
                kind, text = data
                if kind == 'section':
                    section = text
                elif text == 'Appendix':
                    return rows
                continue
            # A wrapped row draws its ID and standard indented, so the ID is
            # picked out by its shape (2.010.35) rather than its position.
            cells = {c: [] for c in SS_COLUMNS}
            for w in sorted(data, key=lambda x: (round(x['top']), x['x0'])):
                i = max([j for j, x in enumerate(cols) if w['x0'] >= x - 4] or [0])
                if i <= 1:
                    i = 0 if SS_ID_RE.match(w['text']) and not cells['id'] else 1
                cells[SS_COLUMNS[i]].append(w['text'])
            row = {c: ' '.join(v).strip() for c, v in cells.items()}
            if row['compliance'] in ('Compliant', 'Noncompliant', 'Informational') and row['scoring'].startswith(('Scored', 'Unscored')):
                row['section'] = section
                rows.append(row)
    return rows


def parse_smart_shop(pdf):
    first = _page_text(pdf.pages[0])
    head = _ss_header_fields(first)
    sections = _ss_breakdown(first)
    rows = _ss_rows(pdf, sections)
    compliant = sum(s['compliant'] for s in sections)
    scored = compliant + sum(s['noncompliant'] for s in sections)
    misses = [{'section': r['section'], 'id': r['id'], 'standard': r['standard'],
               'response': r['response'], 'scored': r['scoring'].startswith('Scored')}
              for r in rows if r['compliance'] == 'Noncompliant']
    m = re.match(r'([A-Za-z]+),?\s+(\d{4})', head['visit'])
    return {
        'kind': 'smartShop',
        'visit': head['visit'],
        'month': f"{m.group(2)}-{_MONTHS.index(m.group(1).lower()[:3]) + 1:02d}" if m and m.group(1).lower()[:3] in _MONTHS else None,
        'dayOfWeek': head['dayOfWeek'],
        'daypart': head['daypart'],
        'sections': sections,
        'compliant': compliant,
        'scored': scored,
        'score': round(compliant / scored * 100, 1) if scored else None,
        'misses': misses,
        'rowsRead': len(rows),
    }


_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']


# ----- Food safety findings -----

def parse_food_safety(pdf):
    text = '\n'.join(_page_text(p) for p in pdf.pages)
    m = re.search(r'(\d+)\s+Total Findings', text)
    total = int(m.group(1)) if m else None
    findings, quarter, last_code = [], None, None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if re.match(r'^\d+$', line):
            last_code = line
            continue
        fm = FS_FINDING_RE.match(line)
        if fm:
            quarter = quarter or fm.group(1)
            findings.append({'code': fm.group(2) or last_code or '', 'quarter': fm.group(1), 'repeat': bool(fm.group(2)),
                             'category': fm.group(3).title(), 'risk': fm.group(4).lower(), 'items': []})
            continue
        if FS_NOISE_RE.match(line) or not findings:
            continue
        im = FS_ITEM_RE.match(line)
        if im:
            findings[-1]['items'].append(im.group(2))
        elif findings[-1]['items']:
            findings[-1]['items'][-1] += ' ' + line
    if not findings:
        raise ReportParseError('No findings found in this food safety report.')
    return {'kind': 'foodSafety', 'quarter': quarter, 'total': total if total is not None else len(findings), 'findings': findings}


# ----- Entry point -----

def _parse_pdf(data, name):
    try:
        pdf = pdfplumber.open(io.BytesIO(data))
    except Exception:
        raise ReportParseError(f'{name}: not a readable PDF.')
    with pdf:
        if not pdf.pages:
            raise ReportParseError(f'{name}: the PDF is empty.')
        kind = detect_kind(_page_text(pdf.pages[0]))
        if kind == 'smartShop':
            out = parse_smart_shop(pdf)
        elif kind == 'foodSafety':
            out = parse_food_safety(pdf)
        else:
            return {'kind': None, 'file': name}
    out['file'] = name
    return out


def parse_report_file(data, name):
    """A PDF or a zip of PDFs → a list of parsed reports ({'kind': None} for
    a PDF this doesn't recognize, e.g. a Levelset PEA export)."""
    if name.lower().endswith('.zip'):
        try:
            zf = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile:
            raise ReportParseError(f'{name}: not a readable zip.')
        pdfs = [i for i in zf.infolist() if i.filename.lower().endswith('.pdf') and not i.is_dir()]
        if not pdfs:
            raise ReportParseError(f'{name}: no PDF inside.')
        if len(pdfs) > MAX_PDFS_PER_ZIP:
            raise ReportParseError(f'{name}: more than {MAX_PDFS_PER_ZIP} PDFs inside — upload fewer at a time.')
        if sum(i.file_size for i in pdfs) > MAX_UNZIPPED_BYTES:
            raise ReportParseError(f'{name}: too large once unzipped — upload the reports one at a time.')
        return [_parse_pdf(zf.read(i), i.filename.rsplit('/', 1)[-1]) for i in pdfs]
    return [_parse_pdf(data, name)]
