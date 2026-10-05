"""A day's set up for outside readers (the daily briefing), read-only.

Served by /api/setup-feed in app.py behind a secret token. It carries the
set up only: each daypart, its Lead Captain, and who is in which position,
by the names Set Ups shows (first names, with last initials when two share
a first name). No shift times, scores, notes or anything from the private
sections.

The dayparts, their order and their position lists come from the page's own
lists in static/js/zone-reset.js, so the feed always matches Set Ups.
"""
import os
import re
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

STORE_TZ = ZoneInfo('America/Chicago')
LEAD_CAPTAIN = 'Lead Captain'
ZONE_RESET_JS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'js', 'zone-reset.js')


def _js_block(src, name, opener, closer):
    start = src.index(f'const {name} = {opener}')
    return src[start:src.index('\n' + closer, start)]


def load_layout(path=ZONE_RESET_JS):
    """{'foh'|'boh': {'dayparts': [names in order], 'positions': {daypart: [slots]}}, 'renames': {...}}"""
    with open(path, encoding='utf-8') as f:
        src = f.read()
    out = {}
    for side in ('foh', 'boh'):
        dps = re.findall(r"\{name: '([^']+)', time: '[^']+'\}", _js_block(src, f'{side}Dayparts', '[', '];'))
        pos_src = _js_block(src, f'{side}Positions', '{', '};')
        positions = {dp: re.findall(r"'((?:[^'\\]|\\.)*)'", body)
                     for dp, body in re.findall(r"^\s*'([^']+)': \[(.*)\],?\s*$", pos_src, re.M)}
        out[side] = {'dayparts': dps, 'positions': positions}
    renames_src = _js_block(src, 'SU_DAYPART_RENAMES', '{', '};')
    out['renames'] = {side: dict(re.findall(r"'([^']+)': '([^']+)'", body))
                      for side, body in re.findall(r'(foh|boh): \{([^}]*)\}', renames_src)}
    return out


# ----- Names, the way Set Ups shows them (setups-board.js suBuildNameMap) -----

def _name_parts(full):
    s = str(full).strip()
    if s and s == s.upper():
        s = re.sub(r"(^|[\s'-])([a-z])", lambda m: m.group(1) + m.group(2).upper(), s.lower())
    nick = re.search(r'\(([^)]+)\)', s)
    words = re.sub(r'\([^)]*\)', ' ', s).split()
    first = nick.group(1).strip() if nick else (words[0] if words else s)
    return first, words[1:]


def split_names(value):
    return [n.strip() for n in str(value or '').split('/') if n.strip()]


def display_names(all_names):
    """{lowercased full name: shown name}: first name only; when two share a
    first name, last-name initials ("Daniel M."), and if those match too, the
    whole last name."""
    fulls = {}
    for n in all_names:
        n = str(n).strip()
        if n:
            fulls.setdefault(n.lower(), n)
    by_first = {}
    for low, full in fulls.items():
        by_first.setdefault(_name_parts(full)[0].lower(), []).append(full)
    out = {}
    for group in by_first.values():
        if len(group) == 1:
            out[group[0].lower()] = _name_parts(group[0])[0]
            continue
        labelled = []
        for full in group:
            first, last = _name_parts(full)
            label = f"{first} {''.join(w[0].upper() + '.' for w in last)}" if last else first
            labelled.append((full, first, last, label))
        for full, first, last, label in labelled:
            clash = sum(1 for x in labelled if x[3] == label) > 1
            out[full.lower()] = f"{first} {' '.join(last)}" if clash and last else label
    return out


# ----- The day -----

def store_today():
    return datetime.now(STORE_TZ).date()


def parse_day(value):
    """'today', 'tomorrow' (store time) or YYYY-MM-DD; None if it isn't one."""
    v = (value or 'tomorrow').strip().lower()
    if v == 'today':
        return store_today()
    if v == 'tomorrow':
        return store_today() + timedelta(days=1)
    try:
        return date.fromisoformat(v)
    except ValueError:
        return None


def build_feed(sections, day, layout):
    """The set up for one day from the saved sections (setups, rosters)."""
    iso = day.isoformat()
    assignments = (sections.get('setups') or {}).get('posAssignments') or {}
    rosters = sections.get('rosters') or {}

    # The name map is built from everyone on the saved rosters and every
    # assignment, the same as Set Ups, so a name reads the same every day.
    everyone = []
    for key in ('fohRoster', 'bohRoster'):
        for people in (rosters.get(key) or {}).values():
            if isinstance(people, list):
                everyone += [p.get('name') for p in people if isinstance(p, dict) and p.get('name')]
    for value in assignments.values():
        everyone += split_names(value)
    shown = display_names(everyone)
    show = lambda n: shown.get(n.strip().lower(), _name_parts(n)[0])

    out = {'date': iso, 'weekday': day.strftime('%A'), 'foh': [], 'boh': []}
    for side in ('foh', 'boh'):
        renames = layout['renames'].get(side, {})
        found = {}   # daypart -> {slot: [names]}
        for key, value in assignments.items():
            parts = str(key).split('||')
            if len(parts) != 4 or parts[0] != side or parts[1] != iso:
                continue
            names = split_names(value)
            if not names:
                continue
            dp = renames.get(parts[2], parts[2])
            found.setdefault(dp, {})[parts[3]] = names
        known = layout[side]['dayparts']
        order = known + sorted(dp for dp in found if dp not in known)
        for dp in order:
            slots = found.get(dp)
            if not slots:
                continue
            listed = layout[side]['positions'].get(dp, [])
            slot_order = [s for s in listed if s in slots] + sorted(s for s in slots if s not in listed and s != LEAD_CAPTAIN)
            out[side].append({
                'daypart': dp,
                'lead': ' / '.join(show(n) for n in slots[LEAD_CAPTAIN]) if LEAD_CAPTAIN in slots else None,
                'positions': [{'position': s, 'names': [show(n) for n in slots[s]]} for s in slot_order],
            })
    return out


def feed_text(feed):
    """The same set up as plain text, for a briefing."""
    lines = [f"Set up for {feed['weekday']}, {feed['date']}"]
    for side in ('foh', 'boh'):
        if not feed[side]:
            continue
        lines.append('')
        lines.append(side.upper())
        for dp in feed[side]:
            lines.append(f"{dp['daypart']}" + (f" (Lead: {dp['lead']})" if dp['lead'] else ''))
            for p in dp['positions']:
                lines.append(f"  {p['position']}: {' then '.join(p['names'])}")
    if not feed['foh'] and not feed['boh']:
        lines.append('No set up entered yet.')
    return '\n'.join(lines) + '\n'
