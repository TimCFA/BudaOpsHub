"""Reads the Ops Hub PDF reports the Guest Obsession scoreboard runs on.

Three kinds, recognized from the first page:
  * Smart Shop assessment ("Smart Shop … Category Breakdown"): one mystery
    shop visit. Kept: the visit month, weekday and daypart, the compliant /
    noncompliant counts per section, and every standard that was missed
    (scored or not), with the shopper's response. Photos, temperatures and
    the restaurant's address are not kept.
  * Food safety "All Findings" report: the quarter's findings, each with its
    code, category, risk level, whether it's a repeat, and the items cited.
  * QIV (Quality Improvement Visit) "Icon Report": the quarter and visit
    date, the overall score, each touchpoint's score, and every standard
    marked ✘ on this visit (with whether it was also ✘ last visit).

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
    if 'Icon Report' in first_page_text and 'Current Quarter' in first_page_text:
        return 'qiv'
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

# The "SAFE" assessment report (Ops Hub → the visit's PDF, "Show only
# Noncompliant Responses"): a performance-level strip for the last four
# quarters, then one table per category (Time & Temperature, Cross
# Contamination, Pests, ...) with ID | STANDARD | RESPONSE | RISK LEVEL |
# COMPLIANCE columns and an "Other information:" note under each row. Read
# from character positions: the columns are x bands, a note can run onto
# the next page, and a "Spacer" word is printed over the notes' lines.
SAFE_ID_RE = re.compile(r'^\d{3}(?:\.\d+)?$')
SAFE_COLS = {'standard': (90, 450), 'response': (450, 810), 'risk': (810, 900), 'compliance': (900, 10000)}


def _safe_lines(page):
    """Text lines from the page's characters: [(top, x0, text, chars)],
    top to bottom, with the 'Spacer' overprint left out."""
    chars = sorted((c for c in getattr(page, 'chars', []) if c['text'].strip() or c['text'] == ' '), key=lambda c: (round(c['top']), c['x0']))
    lines = []
    for c in chars:
        if lines and abs(lines[-1][0] - c['top']) <= 2.5:
            lines[-1][1].append(c)
        else:
            lines.append([c['top'], [c]])
    out = []
    for top, cs in lines:
        cs.sort(key=lambda c: c['x0'])
        # The overprinted "Spacer" (at the left margin) interleaves with a
        # note's first line when they share a baseline: drop its six glyphs
        # by letter and position.
        drop = set()
        for c in cs:
            if c['text'] == 'S' and c['x0'] < 90:
                found = [c]
                for letter, dx in zip('pacer', (5.3, 10.8, 16.0, 21.3, 26.5)):
                    hit = next((d for d in cs if d['text'] == letter and abs(d['x0'] - c['x0'] - dx) <= 1.6 and id(d) not in drop), None)
                    if not hit:
                        break
                    found.append(hit)
                if len(found) == 6:
                    drop.update(id(d) for d in found)
        kept = [c for c in cs if id(c) not in drop]
        if not kept:
            continue
        text, last = '', None
        for c in kept:
            if last is not None and c['x0'] - last['x1'] > max(1.5, last['size'] * 0.25):
                text += ' '
            text += c['text']; last = c
        out.append((top, kept[0]['x0'], text.strip(), kept))
    return out


def _safe_band(chars, lo, hi):
    cs = sorted((c for c in chars if lo <= c['x0'] < hi), key=lambda c: (round(c['top']), c['x0']))
    text, last = '', None
    for c in cs:
        if last is not None and (abs(c['top'] - last['top']) > 2.5 or c['x0'] - last['x1'] > max(1.5, last['size'] * 0.25)):
            text += ' '
        text += c['text']; last = c
    return re.sub(r'\s+', ' ', text).strip()


def parse_food_safety_safe(pdf):
    first = _page_text(pdf.pages[0])
    levels = []
    lines = [l.strip() for l in first.splitlines()]
    for i, l in enumerate(lines):
        if l == 'PERFORMANCE LEVEL' and i + 4 <= len(lines) - 1:
            quarters = re.findall(r'Q\d-\d{4}', lines[i + 1])
            nums = re.findall(r'\d+', lines[i + 2])
            labels = lines[i + 3].split()
            totals = re.findall(r'(\d+)\s+Total Findings', lines[i + 4])
            if quarters and len(nums) == len(quarters) == len(totals) and len(labels) == len(quarters):
                levels = [{'quarter': q, 'level': int(n), 'label': lab, 'total': int(t)} for q, n, lab, t in zip(quarters, nums, labels, totals)]
            break
    visit = re.search(r'Visit:\s*(\d{1,2})/(\d{1,2})/(\d{4})', first)
    month = re.search(r'Month/Year:\s*(\d{1,2})/(\d{4})', first)
    quarter = levels[0]['quarter'] if levels else (f'Q{(int(month.group(1)) - 1) // 3 + 1}-{month.group(2)}' if month else None)

    findings, category = [], None
    for page in pdf.pages:
        lines = _safe_lines(page)
        if any(l[2] in ('Appendix', 'IMAGE(S)') for l in lines):
            break
        headers = [i for i, l in enumerate(lines) if l[2].startswith('ID ') and 'STANDARD' in l[2]]
        ids = [i for i, l in enumerate(lines) if l[1] < 90 and SAFE_ID_RE.match(l[2].split(' ')[0]) and len(l[2]) > 6]
        # The category heading sits just above each header row; it ends the
        # note before it as well as naming what follows.
        headings = {}
        for h in headers:
            above = [j for j in range(h) if lines[h][0] - 45 <= lines[j][0] < lines[h][0] - 5 and lines[j][2]]
            if above:
                headings[above[-1]] = h
        stops = sorted(set(headers + ids + list(headings)))
        i = 0
        while i < len(lines):
            top, x0, text, chars = lines[i]
            if i in headings:
                category = text
                i += 1; continue
            if i in headers:
                i += 1; continue
            if i in ids:
                nxt = min([j for j in stops if j > i] + [len(lines)])
                note_at = next((j for j in range(i + 1, nxt) if lines[j][2].startswith('Other information')), nxt)
                row_chars = [c for j in range(i, note_at) for c in lines[j][3]]
                code = text.split(' ')[0]
                risk = _safe_band(row_chars, *SAFE_COLS['risk']).lower()
                findings.append({'code': code, 'quarter': quarter, 'repeat': False, 'category': category or 'Other',
                                 'risk': risk if risk in ('high', 'medium', 'low') else 'low',
                                 'standard': _safe_band(row_chars, *SAFE_COLS['standard']), 'response': _safe_band(row_chars, *SAFE_COLS['response']),
                                 'compliance': _safe_band(row_chars, *SAFE_COLS['compliance']), 'note': ''})
                if note_at < nxt:
                    findings[-1]['note'] = ' '.join(lines[j][2] for j in range(note_at + 1, nxt) if lines[j][2]).strip()
                i = nxt; continue
            if text.startswith('Other information') and findings and not findings[-1]['note']:
                # A note that ran onto this page from the previous one.
                nxt = min([j for j in stops if j > i] + [len(lines)])
                findings[-1]['note'] = ' '.join(lines[j][2] for j in range(i + 1, nxt) if lines[j][2]).strip()
                i = nxt; continue
            i += 1
    for f in findings:
        f['items'] = [x for x in (f['standard'], f['response']) if x] + ([f['note']] if f['note'] else [])
    if not findings:
        raise ReportParseError('No findings found in this food safety report.')
    out = {'kind': 'foodSafety', 'layout': 'safe', 'quarter': quarter,
           'total': levels[0]['total'] if levels else len(findings), 'findings': findings, 'levels': levels}
    if visit:
        out['visit'] = f'{visit.group(3)}-{int(visit.group(1)):02d}-{int(visit.group(2)):02d}'
    return out


def parse_food_safety(pdf):
    text = '\n'.join(_page_text(p) for p in pdf.pages)
    if 'PERFORMANCE LEVEL' in text and 'RISK LEVEL' in text:
        return parse_food_safety_safe(pdf)
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


# ----- QIV -----

QIV_ID_RE = re.compile(r'^[A-Z]*\d+(?:\.+\d+)+[a-z0-9-]*$')
QIV_SCORE_RE = re.compile(r'^(.+?)\s+(\d{1,3})%$')


def _qiv_misses(pdf):
    """Standards marked ✘ in the Current Response column. Rows have no rules
    between them; a standard's ID sits on its middle line, with wrapped
    description lines a few points above and below it."""
    misses, mid, title = [], None, ''
    for page in pdf.pages:
        words = page.extract_words()
        cur = [w for w in words if w['text'] == 'Current']
        prev = [w for w in words if w['text'] == 'Previous']
        top = 60
        if cur and prev:
            # A new table: its columns and its title (the line above).
            mid = (cur[0]['x0'] + prev[0]['x0']) / 2 + 14
            head_top = cur[0]['top']
            title = ' '.join(w['text'] for w in sorted((w for w in words if w['top'] < head_top - 20 and w['x0'] > 100), key=lambda w: w['x0'])) or title
            top = head_top + 15
        if mid is None:
            continue   # pages before the first table
        # (A page without a header continues the last table.)
        ids = [w for w in words if w['x0'] < 140 and w['top'] > top and QIV_ID_RE.match(w['text'])]
        for x in (w for w in words if w['text'] == '✘' and w['x0'] > 600 and w['x0'] < mid):
            if not ids:
                break
            row = min(ids, key=lambda w: abs(w['top'] - x['top']))
            if abs(row['top'] - x['top']) > 14:
                continue
            band = [w for w in words if abs(w['top'] - row['top']) <= 10]
            desc = ' '.join(w['text'] for w in sorted((w for w in band if 140 <= w['x0'] < 520), key=lambda w: (round(w['top']), w['x0'])))
            misses.append({
                'id': row['text'], 'section': title, 'standard': desc,
                'qualityDriver': any(w['text'] == 'Q' and 110 <= w['x0'] < 130 for w in band),
                'repeat': any(w['text'] == '✘' and w['x0'] >= mid for w in band),
            })
    return misses


def parse_qiv(pdf):
    first = _page_text(pdf.pages[0])
    quarter = re.search(r'Current Quarter\s*:\s*(\d{4})\.(Q\d)', first)
    visit = re.search(r'Visit Date:\s*(\d{1,2})/(\d{1,2})/(\d{4})', first)
    vtype = re.search(r'Visit Type:\s*(.+)', first)
    touchpoints, overall = [], None
    for page in pdf.pages:
        lines = _page_text(page).splitlines()
        if not any('Touchpoint Score' in l for l in lines):
            continue
        start = next(i for i, l in enumerate(lines) if 'Touchpoint Score' in l)
        for line in lines[start + 1:]:
            m = QIV_SCORE_RE.match(line.strip())
            if not m:
                continue
            if m.group(1) == 'Overall Score':
                overall = int(m.group(2))
                break
            touchpoints.append({'name': m.group(1), 'score': int(m.group(2))})
        break
    if overall is None:
        raise ReportParseError('No overall score in this QIV report.')
    return {
        'kind': 'qiv',
        'quarter': f'{quarter.group(2)}-{quarter.group(1)}' if quarter else None,
        'date': f'{visit.group(3)}-{int(visit.group(1)):02d}-{int(visit.group(2)):02d}' if visit else None,
        'visitType': vtype.group(1).strip() if vtype else '',
        'overall': overall,
        'touchpoints': touchpoints,
        'misses': _qiv_misses(pdf),
    }


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
        elif kind == 'qiv':
            out = parse_qiv(pdf)
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
