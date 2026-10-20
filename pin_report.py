"""Read the team's clock-in PIN report (a PDF) into rows of name, PIN and role.

Tim, Oct 19 2026: the store's PIN report comes as a PDF, which the Accounts
upload (Manage → Settings → Accounts) didn't take. This reads it on the
server and hands the rows back to the owner's page, which shows them for a
check before anything is saved (/api/accounts/pins stores only a keyed hash
of each PIN). Nothing here is kept or logged.

The report's exact layout isn't known yet, so this reads it two ways:
 - with a header row (a PIN / clock / punch / badge column, a name column or
   first and last name columns, maybe a role / job / position column), by
   those columns;
 - without one, line by line: a line with exactly one 6-digit number is a
   person, the name is the text on that line that reads as a name, and the
   role comes from words like "lead" or "trainer". A line with two 6-digit
   numbers can't be told apart and is listed, unread, for the owner.
"""
import io
import re

import pdfplumber

MAX_PAGES = 40
PIN_RE = re.compile(r'(?<!\d)\d{6}(?!\d)')
NAME_CELL_RE = re.compile(r"^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .,'’-]*[A-Za-zÀ-ÿ.]$")
HEAD_PIN_STRONG = re.compile(r'\b(pin|clock|punch|badge)\b', re.I)
HEAD_PIN_WEAK = re.compile(r'\b(code|id)\b', re.I)
HEAD_NAME = re.compile(r'\b(name|employee|team member)\b', re.I)
HEAD_FIRST = re.compile(r'\bfirst\b', re.I)
HEAD_LAST = re.compile(r'\blast\b', re.I)
HEAD_ROLE = re.compile(r'\b(role|job|position|title|type)\b', re.I)
# Words that are never a name (report furniture).
NOT_NAMES = re.compile(r'^(page|report|total|printed|run|date|store|location|chick-fil-a|employee list|clock|pin|name)\b', re.I)


class PinReportError(ValueError):
    pass


def role_of(text):
    """Team Lead / Trainer / Director / Admin Team / Team Member from a role or job title.
    Returns (role, said): said is False when the text named no role."""
    t = str(text or '').lower()
    if 'director' in t or 'operator' in t or 'manager' in t:
        return 'Director', True
    if re.search(r'\badmin', t):
        return 'Admin Team', True
    if 'lead' in t or re.search(r'\btl\b', t):
        return 'Team Lead', True
    if 'train' in t:
        return 'Trainer', True
    if 'member' in t or re.search(r'\btm\b', t):
        return 'Team Member', True
    return 'Team Member', False


def tidy_name(name):
    """'RUIZ LOPEZ, ANA' → 'Ana Ruiz Lopez'; 'Ana  Ruiz' → 'Ana Ruiz'."""
    n = re.sub(r'\s+', ' ', str(name or '')).strip(' ,')
    if ',' in n:
        last, _, first = n.partition(',')
        n = f'{first.strip()} {last.strip()}'.strip()
    # A word in all capitals or all lower case gets a capital first letter
    # (and after an apostrophe or hyphen); "McKenzie" is left alone.
    def word(w):
        if not (w.isupper() or w.islower()):
            return w
        w = w.capitalize()
        return re.sub(r"(?<=['’-])([a-z])", lambda m: m.group(1).upper(), w)
    return ' '.join(word(w) for w in n.split(' '))


def _lines(pdf):
    """Each line of every page as cells (runs of 2+ spaces split cells)."""
    out = []
    for page in pdf.pages:
        tables = [t for t in (page.extract_tables() or []) if t and len(t) > 1]
        if tables:
            for t in tables:
                out.extend([str(c or '').strip() for c in row] for row in t)
            continue
        text = page.extract_text(layout=True) or ''
        for line in text.splitlines():
            cells = [c.strip() for c in re.split(r'\s{2,}', line.strip()) if c.strip()]
            if cells:
                out.append(cells)
    return out


def _header(cells):
    """Column indexes when this line is the report's header, else None. A
    column named PIN, clock, punch or badge wins over one named code or ID
    (an employee number is often 6 digits too)."""
    if any(PIN_RE.search(c) for c in cells):
        return None
    cols = {}
    for pat in (HEAD_PIN_STRONG, HEAD_PIN_WEAK):
        hit = next((i for i, c in enumerate(cells) if pat.search(c)), None)
        if hit is not None:
            cols['pin'] = hit
            break
    for i, c in enumerate(cells):
        if i == cols.get('pin') or re.search(r'\b(id|number|#)\b', c, re.I):
            continue
        if HEAD_FIRST.search(c) and 'first' not in cols:
            cols['first'] = i
        elif HEAD_LAST.search(c) and 'last' not in cols:
            cols['last'] = i
        elif HEAD_NAME.search(c) and 'name' not in cols:
            cols['name'] = i
        elif HEAD_ROLE.search(c) and 'role' not in cols:
            cols['role'] = i
    has_name = 'name' in cols or ('first' in cols and 'last' in cols)
    return cols if 'pin' in cols and has_name else None


def _cell(cells, i):
    return cells[i] if i is not None and i < len(cells) else ''


def _by_header(lines, start, cols):
    rows, unread = [], []
    for cells in lines[start:]:
        if _header(cells):
            continue                                     # the header again on the next page
        pins = PIN_RE.findall(_cell(cells, cols['pin']))
        if 'name' in cols:
            name = _cell(cells, cols['name'])
        else:
            name = f"{_cell(cells, cols['first'])} {_cell(cells, cols['last'])}"
        name = tidy_name(name)
        if len(pins) != 1:
            if name and NAME_CELL_RE.match(name) and not NOT_NAMES.match(name):
                unread.append(name)
            continue
        if not name:
            continue
        role, said = role_of(_cell(cells, cols.get('role')))
        rows.append({'name': name, 'pin': pins[0], 'role': role, 'roleFromReport': said})
    return rows, unread


def _by_line(lines):
    rows, unread = [], []
    for cells in lines:
        line = ' '.join(cells)
        pins = PIN_RE.findall(line)
        names = [c for c in cells if NAME_CELL_RE.match(c) and not NOT_NAMES.match(c) and len(c.split()) <= 5
                 and role_of(c)[1] is False]
        if not names:
            continue
        name = tidy_name(names[0])
        if len(pins) == 1:
            role, said = role_of(line.replace(names[0], ''))
            rows.append({'name': name, 'pin': pins[0], 'role': role, 'roleFromReport': said})
        elif len(pins) > 1:
            unread.append(name)
    return rows, unread


def read_pin_report(data):
    """{rows: [{name, pin, role, roleFromReport}], unread: [name], how}."""
    if not data or not bytes(data[:5]).startswith(b'%PDF'):
        raise PinReportError('That isn’t a PDF.')
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            if len(pdf.pages) > MAX_PAGES:
                raise PinReportError(f'The report has more than {MAX_PAGES} pages.')
            lines = _lines(pdf)
    except PinReportError:
        raise
    except Exception:
        raise PinReportError('The PDF couldn’t be read.')
    for i, cells in enumerate(lines):
        cols = _header(cells)
        if cols:
            rows, unread = _by_header(lines, i + 1, cols)
            how = 'columns'
            break
    else:
        rows, unread = _by_line(lines)
        how = 'lines'
    # The same person twice (a report that repeats on each page): once.
    seen, out = set(), []
    for r in rows:
        k = (r['name'].lower(), r['pin'])
        if k not in seen:
            seen.add(k)
            out.append(r)
    return {'rows': out, 'unread': sorted(set(unread)), 'how': how}
