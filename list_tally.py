"""The leaders' list score, and trimming what it replaces (Tim, Nov 23 2026).

The hub kept every Zone Reset tick ever made and every finished break inside
the sections that are saved all day ('ops', 'setups'), so each tick sent a
few months of old ticks to the database and back to every phone (Render's
bandwidth, Nov 2026). Tim's call: keep 14 days; a leader's score from their
lists should keep adding up, but which items were or weren't ticked doesn't
need keeping.

So, once a day, the server:
  1. writes a small record for each finished day, one line per handoff: its
     Lead Captain, items done, items in all. Kept for good under
     `lists/tally/<date>` in Firebase, one record a day, never a saved-state
     section, so it never touches `/api/state/sync`. A day still inside the
     14 days is written again each run, so late ticks count.
  2. only then drops ticks and finished breaks older than 14 days from the
     saved sections.

This file is the rules only (no Firebase): app.py reads, writes and decides
when. The handoffs and zone sizes are huddle_api's (checked against the page
by tests/test_huddle.py).
"""
import re
from datetime import date, timedelta

import huddle_api
import timers_api

KEEP_DAYS = 14                      # days of ticks and finished breaks kept in the saved sections
TALLY_PATH = 'lists/tally'          # {date: {handoff: {lead, checked, total, zones: [[zone, ticked, items]]}}}
_ISO = re.compile(r'^\d{4}-\d{2}-\d{2}$')
_ISO_END = re.compile(r'(\d{4}-\d{2}-\d{2})$')
HANDOFF_TOTAL = sum(huddle_api.ZONE_ITEMS.values())


def cutoff(today_iso, keep_days=KEEP_DAYS):
    """The first day kept: days before it are trimmed."""
    return (date.fromisoformat(today_iso) - timedelta(days=keep_days)).isoformat()


def _lead_daypart(lead_from):
    """The FOH Set Ups daypart whose Lead Captain owns a handoff (zone-reset.js zrHandoffLead)."""
    return next((name for name, _ in timers_api.FOH_DAYPARTS if name.startswith(lead_from + ' (')), None)


def _history_leads(setup_history, day):
    """{daypart: name} of the Lead Captains Set Ups' history holds for a day."""
    h = setup_history if isinstance(setup_history, dict) else {}
    slots, names = h.get('slots'), h.get('names')
    pairs = (h.get('days') or {}).get(day) if isinstance(h.get('days'), dict) else None
    out = {}
    if not (isinstance(slots, list) and isinstance(names, list) and isinstance(pairs, list)):
        return out
    for pair in pairs:
        try:
            parts, name = str(slots[pair[0]]).split('||'), names[pair[1]]
        except (IndexError, TypeError):
            continue
        if len(parts) == 3 and parts[0] == 'foh' and parts[2] == timers_api.LEAD_CAPTAIN and isinstance(name, str) and name:
            have = out.get(parts[1], '')
            if name not in have.split('/'):
                out[parts[1]] = f'{have}/{name}' if have else name       # a spot handed off mid-shift credits both
    return out


def lead_of(day, lead_from, assignments, setup_history):
    """A handoff's Lead Captain on a day: from Set Ups while it still holds
    the day, else from its history, else ''."""
    dp = _lead_daypart(lead_from)
    if not dp:
        return ''
    live = (assignments or {}).get(f'foh||{day}||{dp}||{timers_api.LEAD_CAPTAIN}')
    if isinstance(live, str) and live.strip():
        return live.strip()
    return _history_leads(setup_history, day).get(dp, '')


def checked_in(marks):
    """Items ticked in one handoff's marks ({zone: {item: mark}}), a zone never over its size."""
    marks = marks if isinstance(marks, dict) else {}
    n = 0
    for zone, total in huddle_api.ZONE_ITEMS.items():
        items = marks.get(zone)
        if isinstance(items, dict):
            n += min(sum(1 for v in items.values() if v), total)
    return n


def all_counted(ticks):
    """Whether a day's record accounts for every tick the day holds: none sit
    under a handoff or zone the hub no longer has (Sept 2026 had other
    names). Such a day is left as it is rather than trimmed uncounted."""
    known = {name for name, _ in huddle_api.HANDOFFS}
    for handoff, zones in (ticks if isinstance(ticks, dict) else {}).items():
        for zone, items in (zones if isinstance(zones, dict) else {}).items():
            ticked = any(items.values()) if isinstance(items, dict) else bool(items)
            if ticked and (handoff not in known or zone not in huddle_api.ZONE_ITEMS):
                return False
    return True


def zones_in(marks):
    """One handoff's zones: [[zone, ticked, items in it], ...] in the page's
    order, every zone (a skipped one reads 0), a zone never over its size. A
    list, not a dict: a zone's name can hold a '/' and a Firebase key can't."""
    marks = marks if isinstance(marks, dict) else {}
    out = []
    for zone, total in huddle_api.ZONE_ITEMS.items():
        items = marks.get(zone)
        out.append([zone, min(sum(1 for v in items.values() if v), total) if isinstance(items, dict) else 0, total])
    return out


def tally_day(day, ticks, assignments, setup_history, kept=None):
    """{handoff: {lead, checked, total, zones}} for one day, or {} when there
    is nothing to say (no ticks and no Lead Captain on any handoff). `zones`
    is each zone's share (Tim, Nov 24 2026: which zones are the weak ones
    over time). A lead the hub can no longer name keeps the one already on
    the record."""
    ticks = ticks if isinstance(ticks, dict) else {}
    kept = kept if isinstance(kept, dict) else {}
    out = {}
    for handoff, lead_from in huddle_api.HANDOFFS:
        lead = lead_of(day, lead_from, assignments, setup_history) or str((kept.get(handoff) or {}).get('lead') or '')
        checked = checked_in(ticks.get(handoff))
        if lead or checked:
            out[handoff] = {'lead': lead, 'checked': checked, 'total': HANDOFF_TOTAL, 'zones': zones_in(ticks.get(handoff))}
    return out


def with_zones(record, ticks):
    """A day's record with each handoff's zones filled in from that day's
    ticks, for a day trimmed before zones were kept (the ticks come from the
    copy taken before the first trim). Nothing else on the record changes,
    and a handoff whose count the ticks don't bear out is left without."""
    record = record if isinstance(record, dict) else {}
    ticks = ticks if isinstance(ticks, dict) else {}
    out = {}
    for handoff, h in record.items():
        out[handoff] = h
        if isinstance(h, dict) and 'zones' not in h and checked_in(ticks.get(handoff)) == h.get('checked'):
            out[handoff] = dict(h, zones=zones_in(ticks.get(handoff)))
    return out


def _days_with_a_lead(assignments):
    days = set()
    for key, name in (assignments or {}).items():
        parts = str(key).split('||')
        if len(parts) == 4 and parts[0] == 'foh' and parts[3] == timers_api.LEAD_CAPTAIN and _ISO.match(parts[1]) and name:
            days.add(parts[1])
    return days


def plan(sections, today_iso, kept_tally, keep_days=KEEP_DAYS):
    """What one upkeep run does: {'tally': {date: record} to write (only the
    changed ones), 'ops': {section: [del ops]} to apply after the tally is
    safely written}. Days are finished days only (before today)."""
    sections = sections if isinstance(sections, dict) else {}
    ops_sec = sections.get('ops') if isinstance(sections.get('ops'), dict) else {}
    setups = sections.get('setups') if isinstance(sections.get('setups'), dict) else {}
    history = sections.get('history') if isinstance(sections.get('history'), dict) else {}
    ticks = ops_sec.get('zoneChecklistState') if isinstance(ops_sec.get('zoneChecklistState'), dict) else {}
    assignments = setups.get('posAssignments') if isinstance(setups.get('posAssignments'), dict) else {}
    breaks = setups.get('completedBreaks') if isinstance(setups.get('completedBreaks'), dict) else {}
    kept_tally = kept_tally if isinstance(kept_tally, dict) else {}
    first_kept = cutoff(today_iso, keep_days)

    tally = {}
    days = {d for d in ticks if isinstance(d, str) and _ISO.match(d)} | _days_with_a_lead(assignments)
    for day in sorted(d for d in days if d < today_iso):
        if day not in ticks and day in kept_tally:
            # Its ticks are gone (trimmed) and its record is written: the
            # record is all there is. Set Ups can still name that day's Lead
            # Captain for a while, and counting again from no ticks would
            # write the day back as nothing done. (A handoff that was led with
            # nothing ticked does get its zones, all at none: they add nothing.)
            rec = with_zones(kept_tally[day], None)
            if rec != kept_tally[day]:
                tally[day] = rec
            continue
        rec = tally_day(day, ticks.get(day), assignments, history.get('setupHistory'), kept_tally.get(day))
        if rec and rec != kept_tally.get(day):
            tally[day] = rec

    drop_ticks = sorted(d for d in ticks if isinstance(d, str) and _ISO.match(d) and d < first_kept and all_counted(ticks[d]))
    drop_breaks = sorted(k for k in breaks if (break_day(k) or first_kept) < first_kept)
    ops = {}
    if drop_ticks:
        ops['ops'] = [{'o': 'del', 'p': ['zoneChecklistState', d]} for d in drop_ticks]
    if drop_breaks:
        ops['setups'] = [{'o': 'del', 'p': ['completedBreaks', k]} for k in drop_breaks]
    return {'tally': tally, 'ops': ops}


def break_day(key):
    """The day in a finished break's key: 'foh||2026-11-20||Name', or the
    older 'Name2026-10-05'. None when it carries no day (left alone)."""
    parts = str(key).split('||')
    if len(parts) == 3 and _ISO.match(parts[1]):
        return parts[1]
    m = _ISO_END.search(str(key))
    return m.group(1) if m else None


def zone_scores(tally, since=None):
    """Each zone over time, the weakest first: [{zone, handoffs, checked,
    total, pct}], from the handoffs whose record carries its zones."""
    by = {}
    for day, rec in (tally or {}).items():
        if since and day < since or not isinstance(rec, dict):
            continue
        for h in rec.values():
            for z in (h.get('zones') if isinstance(h, dict) and isinstance(h.get('zones'), list) else []):
                try:
                    name, checked, total = str(z[0]), int(z[1]), int(z[2])
                except (IndexError, TypeError, ValueError):
                    continue
                row = by.setdefault(name, {'zone': name, 'handoffs': 0, 'checked': 0, 'total': 0})
                row['handoffs'] += 1
                row['checked'] += checked
                row['total'] += total
    for row in by.values():
        row['pct'] = round(100 * row['checked'] / row['total']) if row['total'] else 0
    return sorted(by.values(), key=lambda r: (r['pct'], r['zone'].lower()))


def scores(tally, since=None):
    """Each Lead Captain's lists, added up: [{lead, handoffs, checked, total,
    pct}], the most handoffs first. A handoff two leaders shared ("Ana/Ben")
    counts for both. Handoffs with no Lead Captain are under ''."""
    by = {}
    for day, rec in (tally or {}).items():
        if since and day < since or not isinstance(rec, dict):
            continue
        for h in rec.values():
            if not isinstance(h, dict):
                continue
            for lead in ([n.strip() for n in str(h.get('lead') or '').split('/') if n.strip()] or ['']):
                row = by.setdefault(lead, {'lead': lead, 'handoffs': 0, 'checked': 0, 'total': 0})
                row['handoffs'] += 1
                row['checked'] += int(h.get('checked') or 0)
                row['total'] += int(h.get('total') or 0)
    for row in by.values():
        row['pct'] = round(100 * row['checked'] / row['total']) if row['total'] else 0
    return sorted(by.values(), key=lambda r: (-r['handoffs'], r['lead'].lower()))
