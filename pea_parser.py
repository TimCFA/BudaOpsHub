"""Reads Levelset "Positional Excellence Ratings" PDF exports.

The PDF is text-based but has two quirks this works around:
  * The digit "1" is drawn with a glyph that has no text mapping, so text
    extractors drop it ("2:19 PM" reads as "2: 9 PM"). The glyph is still
    there with an empty string, so it's put back as "1".
  * Long names wrap onto two lines, with half above and half below the row
    (the row is vertically centered). Words are assigned to the nearest row.

Columns are found from the header row on each report (Date, Employee,
Employee Role, Leader, Position, Criteria 1-5, Overall), so a different page
size or margin doesn't break parsing.
"""
import re
from datetime import datetime

import pdfplumber

COLUMNS = ['date', 'employee', 'role', 'leader', 'position',
           'c1', 'c2', 'c3', 'c4', 'c5', 'overall']
HEADER_LABELS = ['Date', 'Employee', 'Employee Role', 'Leader', 'Position',
                 'Criteria 1', 'Criteria 2', 'Criteria 3', 'Criteria 4', 'Criteria 5', 'Overall']
DATE_RE = re.compile(r'^\d{1,2}/\d{1,2}/\d{2}$')
SCORE_RE = re.compile(r'^[1-3]\.\d\d$')


class PeaParseError(ValueError):
    pass


def _words(page):
    """Words on a page as {text, x0, x1, top}, with the blank "1" glyph restored."""
    lines = {}
    for c in page.chars:
        lines.setdefault(round(c['top']), []).append(c)
    words = []
    for top, chars in lines.items():
        chars.sort(key=lambda c: c['x0'])
        cur = None
        for c in chars:
            text = c['text'] if c['text'] != '' else '1'
            if text.isspace():
                cur = None
                continue
            if cur and c['x0'] - cur['x1'] < 2.5:
                cur['text'] += text
                cur['x1'] = c['x1']
            else:
                cur = {'text': text, 'x0': c['x0'], 'x1': c['x1'], 'top': top}
                words.append(cur)
    return words


def _phrases(words):
    """Joins words on one line that sit close together ("Criteria" + "1")."""
    words = sorted(words, key=lambda w: w['x0'])
    out = []
    for w in words:
        if out and w['x0'] - out[-1]['x1'] < 6:
            out[-1] = {**out[-1], 'text': out[-1]['text'] + ' ' + w['text'], 'x1': w['x1']}
        else:
            out.append(dict(w))
    return out


def _column_bounds(words):
    """Left edge of each column: halfway between neighbouring header labels,
    since the labels and cell contents are centered in their columns."""
    overall = [w for w in words if w['text'] == 'Overall']
    if not overall:
        return None
    top = overall[0]['top']
    header = _phrases([w for w in words if abs(w['top'] - top) < 3])
    labels = [h['text'] for h in header]
    if labels != HEADER_LABELS:
        raise PeaParseError(
            "This doesn't look like a Levelset Positional Excellence Ratings report "
            f"(expected columns {', '.join(HEADER_LABELS)}).")
    centers = [(h['x0'] + h['x1']) / 2 for h in header]
    bounds = [float('-inf')] + [(a + b) / 2 for a, b in zip(centers, centers[1:])]
    return {'top': top, 'bounds': bounds}


def _column_of(word, bounds):
    center = (word['x0'] + word['x1']) / 2
    idx = 0
    for i, b in enumerate(bounds):
        if center >= b:
            idx = i
    return COLUMNS[idx]


def _summary(words):
    """The report's own totals (count, average, date range) from page 1, used
    to confirm nothing was missed."""
    lines = {}
    for w in words:
        lines.setdefault(w['top'], []).append(w)
    texts = [' '.join(w['text'] for w in sorted(ws, key=lambda w: w['x0'])) for _, ws in sorted(lines.items())]
    out = {}
    for t in texts:
        m = re.match(r'^Date Range:\s*(\d{1,2}/\d{1,2}/\d{4})\s*-\s*(\d{1,2}/\d{1,2}/\d{4})', t)
        if m:
            out['rangeStart'] = datetime.strptime(m.group(1), '%m/%d/%Y').strftime('%Y-%m-%d')
            out['rangeEnd'] = datetime.strptime(m.group(2), '%m/%d/%Y').strftime('%Y-%m-%d')
        m = re.match(r'^(\d+)\s+(\d\.\d\d)\s+[\d.]+$', t)
        if m and 'count' not in out:
            out['count'] = int(m.group(1))
            out['average'] = float(m.group(2))
    return out


def parse_pea_pdf(file_obj):
    """Returns {'ratings': [...], 'summary': {...}, 'warnings': [...]}.

    Each rating: {at: 'YYYY-MM-DDTHH:MM', employee, role, leader, position,
    criteria: [c1..c5], overall}.
    """
    ratings, warnings = [], []
    bounds = None
    summary = {}
    try:
        pdf = pdfplumber.open(file_obj)
    except Exception as e:
        raise PeaParseError(f"Couldn't open the PDF ({e}).")
    with pdf:
        for page_no, page in enumerate(pdf.pages, start=1):
            words = _words(page)
            if page_no == 1:
                summary = _summary(words)
            found = _column_bounds(words)
            if found:
                bounds = found['bounds']
                words = [w for w in words if w['top'] > found['top'] + 3]
            if bounds is None:
                continue
            footer = {w['top'] for w in words if w['text'] == 'Page'}
            words = [w for w in words if w['top'] not in footer]
            anchors = sorted({w['top'] for w in words
                              if DATE_RE.match(w['text']) and _column_of(w, bounds) == 'date'})
            if not anchors:
                continue
            cells = {a: {} for a in anchors}
            for w in words:
                if w['top'] < anchors[0] - 20 or w['top'] > anchors[-1] + 20:
                    continue
                a = min(anchors, key=lambda a: abs(a - w['top']))
                cells[a].setdefault(_column_of(w, bounds), []).append(w)
            for a in anchors:
                row = {col: _join_wrapped(sorted(ws, key=lambda w: (w['top'], w['x0'])))
                       for col, ws in cells[a].items()}
                rating = _to_rating(row)
                if rating is None:
                    warnings.append(f"Page {page_no}: skipped an unreadable row ({row.get('date', '?')} {row.get('employee', '')}).")
                else:
                    ratings.append(rating)
    if bounds is None:
        raise PeaParseError("Couldn't find the ratings table. Is this a Levelset Positional Excellence Ratings PDF?")
    if 'count' in summary and summary['count'] != len(ratings):
        warnings.append(f"The report says {summary['count']} ratings but {len(ratings)} were read.")
    return {'ratings': ratings, 'summary': summary, 'warnings': warnings}


def _join_wrapped(words):
    """Joins a cell's words. A name Levelset hyphenated to wrap it ("Gar-" /
    "cia") is rejoined as "Garcia"; a real hyphenated name split at its hyphen
    ("Ortiz-" / "Yanez") keeps the hyphen."""
    text = ' '.join(w['text'] for w in words)
    text = re.sub(r'(\w)- ([a-z])', r'\1\2', text)
    return re.sub(r'(\w)- ([A-Z])', r'\1-\2', text)


def _to_rating(row):
    try:
        at = datetime.strptime(row['date'], '%m/%d/%y %I:%M %p')
        scores = [row[f'c{i}'] for i in range(1, 6)] + [row['overall']]
        if not all(SCORE_RE.match(s) for s in scores):
            return None
        employee = row.get('employee', '').strip()
        position = row.get('position', '').strip()
        if not employee or not position:
            return None
        return {
            'at': at.strftime('%Y-%m-%dT%H:%M'),
            'employee': employee,
            'role': row.get('role', '').strip(),
            'leader': row.get('leader', '').strip(),
            'position': position,
            'criteria': [float(s) for s in scores[:5]],
            'overall': float(scores[5]),
        }
    except (KeyError, ValueError):
        return None
