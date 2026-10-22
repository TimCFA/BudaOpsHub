"""One-time corrections to saved calendar events (Tim, Oct 22 2026: "apply
them for me").

The November 2026 marketing calendar was read into Events from a picture,
and the reader misread some words ("Catenng", "Remove Oid POP", "Holiday
Campalgn"), turned two multi-day bars into one-day events on Nov 25, and
missed the MLG bar. Each fix below names the event and the text it holds
now; it's applied only while that text is still there, so an event a
manager has since edited is left alone, and running again changes nothing.
"""

COW_BINGO_IDS = ('evi-mvhd4pjg-5', 'evi-mvhd4pjg-9', 'evi-mvhd4pjg-16')

# (event id, {field: what it holds now}, {field: what it should hold})
FIXES = [
    ('evi-mvhd4pjg-1',
     {'detail': 'Catenng · CFA One App Usage · Mobile DT - bonus points all month'},
     {'detail': 'Catering · CFA One App Usage · Mobile DT - bonus points all month'}),
    ('evi-mvhd4pjg-11',
     {'title': 'Remove Oid POP Install Holiday POP'},
     {'title': 'Remove Old POP · Install Holiday POP'}),
    ('evi-mvhd4pjg-12',
     {'title': 'Banner & DR Video * Updated'},
     {'title': 'Banner & DR Video Updated'}),
    ('evi-mvhd4pjg-14',
     {'title': '"" Holiday Campalgn Launches , M16-1.23'},
     {'title': 'Holiday Campaign Launches (Nov 16 – Jan 23)'}),
    ('evi-mvhd4pjg-17',
     {'title': 'Build-Your-Own Thank You Card (Arts & Crafts Event) N-12PM&'},
     {'title': 'Build-Your-Own Thank You Card (Arts & Crafts Event)',
      'notes': ['Also 11 AM – 12 PM',
                'Social blurb: Join us this Monday for a little creativity and a lot of gratitude! Stop by '
                'Chick-fil-A Buda to build your own Thank You card — we’ll provide the supplies, you bring the heart.',
                'Admin Logistics: Bag stuffers & supplies',
                'Ops Team: OE, bag stuffers']}),
    ('evi-mvhd4pjg-19',
     {'title': 'Receipt Day Redempt!'},
     {'title': 'Receipt Day Redemption Period (both stores)', 'date': '2026-11-23', 'end': '2026-11-28'}),
    ('evi-mvhd4pjg-20',
     {'title': 'giving Break - NO Sch'},
     {'title': 'Thanksgiving Break – No School', 'date': '2026-11-23', 'end': '2026-11-27', 'kind': 'note'}),
]

# Words misread inside a note: (event ids, misread, right).
NOTE_FIXES = [
    (COW_BINGO_IDS, 'a chance to eam sweet prizes', 'a chance to earn sweet prizes'),
    (('evi-mvhd4pjg-7',), 'Ops Team: OE (facepainting bracelet making, photo ops S\'mores milkshake sampling)',
     'Ops Team: OE (facepainting, bracelet making, photo ops, S\'mores milkshake sampling)'),
]

# The red App bar across Nov 16–21 the reader missed.
MLG = {'id': 'evfix-2026-11-mlg', 'title': 'MLG: 3ct strips w/Spicy CFA Sauce', 'kind': 'app',
       'date': '2026-11-16', 'end': '2026-11-21'}


def fix_events(events):
    """→ (corrected list, [what changed]); the list is a new one, the input
    untouched. Nothing changed: the same events and []."""
    if not isinstance(events, list):
        return events, []
    out, changed = [], []
    by_id = {e.get('id'): e for e in events if isinstance(e, dict)}
    for ev in events:
        if not isinstance(ev, dict):
            out.append(ev)
            continue
        ev = dict(ev)
        for eid, was, now in FIXES:
            if ev.get('id') == eid and all(ev.get(k) == v for k, v in was.items()):
                ev.update(now)
                changed.append(f"{eid}: {now.get('title', ev.get('title'))}")
        for ids, bad, good in NOTE_FIXES:
            notes = ev.get('notes')
            if ev.get('id') in ids and isinstance(notes, list) and any(isinstance(n, str) and bad in n for n in notes):
                ev['notes'] = [n.replace(bad, good) if isinstance(n, str) else n for n in notes]
                changed.append(f"{ev['id']}: note")
        out.append(ev)
    # The MLG bar, once: only alongside the November events it was read with.
    if 'evi-mvhd4pjg-14' in by_id and MLG['id'] not in by_id and not any(
            isinstance(e, dict) and str(e.get('title', '')).startswith('MLG') and str(e.get('date', '')).startswith('2026-11')
            for e in events):
        out.append(dict(MLG))
        changed.append(f"{MLG['id']}: added")
    return (out, changed) if changed else (events, [])
