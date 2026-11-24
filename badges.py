"""Achievement badges (Tim, Nov 23 2026: "some kind of badge for people that
complete a certain number of lists in a given amount of time, complete a
certain number of PEAs, achieve certain benchmarks").

Every badge is worked out by the server from records the hub already keeps
for good, so nobody types anything in and nothing can be claimed by hand:

  the daily list tally    lists/tally (list_tally.py): each handoff's Lead
                          Captain and items done, and who finished each zone
  Levelset PEAs           the 'pea' section: who was rated, by whom, on what
  the Pass                Tasks tickets verified Elite (pass_api.py)
  Timers                  each cycle's owner and how it went (timers_api.py)
  Huddle                  pre-huddles set and closed (huddle_api.py)
  Our Team                the hire date

Two kinds. A milestone is earned once and kept (five positions green, a year
with us). A season badge counts inside one quarter, the PEA boards' quarters,
so everyone gets a fresh shot every three months (4DX: a scoreboard you can
win). Each has up to three levels (LEVEL_NAMES).

An earned level is kept for good under badges/earned/<person id> in
Firebase ({badge key: {level, at}}, the key a season badge's id and its
quarter), never a saved-state section, so it never touches /api/state/sync,
and a badge never disappears because old ticks were trimmed or a score
dipped. `at` is when the server first saw it, which is what "New badge" on
Home reads.

Who sees whose (Tim, Nov 23 2026): your own, on your Me page; Team Leads and
up see everyone's. No public ranking. Left out on purpose: accountability
points (they stay with leadership) and waste (logging more waste shouldn't
earn anything).

This file is the rules only (no Firebase, no Flask): app.py reads, writes
and serves. The thresholds are data: change a number in CATALOG.
"""
import re
from datetime import date, datetime

import huddle_api
import pass_api
import pea_mine
import timers_api

EARNED_PATH = 'badges/earned'
NEW_DAYS = 3                      # a badge is "new" this many days after it was first seen
LEVEL_NAMES = ('Bronze', 'Silver', 'Gold')

# who: 'all' everyone; 'trainer' Trainers and up; 'lead' Team Leads and up.
# A badge outside someone's tier still shows once they have any of it.
CATALOG = [
    {'id': 'zone', 'name': 'Zone Closer', 'what': 'Zone lists you finished', 'unit': 'zones',
     'kind': 'season', 'who': 'all', 'levels': [10, 25, 50], 'icon': 'zone'},
    {'id': 'crushing', 'name': 'Crushing It', 'what': 'Positions rated Crushing It', 'unit': 'positions',
     'kind': 'milestone', 'who': 'all', 'levels': [1, 3, 5], 'icon': 'star'},
    {'id': 'allgreen', 'name': 'All Green', 'what': 'Crushing It in every position you’re rated in on your side', 'unit': '',
     'kind': 'milestone', 'who': 'all', 'levels': [1], 'icon': 'check'},
    {'id': 'rise', 'name': 'On the Rise', 'what': 'Positions moved up a tier this quarter', 'unit': 'positions',
     'kind': 'season', 'who': 'all', 'levels': [1, 2, 3], 'icon': 'up'},
    {'id': 'elite', 'name': 'Elite Ticket', 'what': 'Tasks verified Elite', 'unit': 'tickets',
     'kind': 'season', 'who': 'all', 'levels': [1, 3, 5], 'icon': 'ticket'},
    {'id': 'tenure', 'name': 'With Us', 'what': 'Time on the team', 'unit': 'days',
     'kind': 'milestone', 'who': 'all', 'levels': [90, 365, 730], 'icon': 'heart'},
    {'id': 'coach', 'name': 'PEA Coach', 'what': 'PEAs you gave', 'unit': 'PEAs',
     'kind': 'season', 'who': 'trainer', 'levels': [12, 24, 36], 'icon': 'clipboard'},
    {'id': 'widenet', 'name': 'Wide Net', 'what': 'Different people you rated', 'unit': 'people',
     'kind': 'season', 'who': 'trainer', 'levels': [8, 15, 25], 'icon': 'people'},
    {'id': 'handoff', 'name': 'Clean Handoff', 'what': 'Handoffs you captained finished 100%', 'unit': 'handoffs',
     'kind': 'season', 'who': 'lead', 'levels': [10, 25, 50], 'icon': 'flag'},
    {'id': 'clock', 'name': 'On the Clock', 'what': 'Dayparts you owned the task timers with none missed', 'unit': 'dayparts',
     'kind': 'season', 'who': 'lead', 'levels': [10, 25, 50], 'icon': 'clock'},
    {'id': 'huddle', 'name': 'Huddle Habit', 'what': 'Huddles you set and closed', 'unit': 'huddles',
     'kind': 'season', 'who': 'lead', 'levels': [10, 25, 50], 'icon': 'chat'},
]
BY_ID = {b['id']: b for b in CATALOG}

# Levelset's positions by side (pea-ratings.js PEA_POSITION_GROUPS; the tests
# check). The new hires' 3H Week isn't a position anyone goes green in.
PEA_SIDES = {
    'foh': ('iPOS', 'Bagging', 'Drinks 1/3', 'Drinks 2', 'OMD', 'Host', 'Runner'),
    'boh': ('Breader', 'Primary', 'Secondary', 'Machines', 'Fries', 'Prep'),
    'lead': ('Team Lead', 'Trainer'),
}
PEA_RATED = {p for ps in PEA_SIDES.values() for p in ps}
ALL_GREEN_MIN = 2                 # positions rated on a side before All Green means something

TIER_OF_ROLE = {'member': 0, 'trainer': 1, 'lead': 2, 'admin': 2, 'director': 2, 'manager': 2}
TIER_OF_WHO = {'all': 0, 'trainer': 1, 'lead': 2}
_TIER_RANK = {'notyet': 0, 'rise': 1, 'crushing': 2}


def key(name):
    """A name as the hub matches names (app.py _turnover_key)."""
    return re.sub(r'\s+', ' ', str(name or '')).strip().lower()


def quarter_of(iso):
    y, m = int(iso[:4]), int(iso[5:7])
    return f'{y}-Q{(m - 1) // 3 + 1}'


def quarter_bounds(q):
    """('YYYY-MM-DD' first day, first day of the next quarter)."""
    y, n = int(q[:4]), int(q[-1])
    start = date(y, (n - 1) * 3 + 1, 1)
    end = date(y + 1, 1, 1) if n == 4 else date(y, n * 3 + 1, 1)
    return start.isoformat(), end.isoformat()


def quarter_label(q):
    return f'Q{q[-1]} {q[:4]}'


def level_for(badge, count):
    return sum(1 for t in badge['levels'] if count >= t)


def level_name(badge, level):
    if level <= 0:
        return ''
    return 'Earned' if len(badge['levels']) == 1 else LEVEL_NAMES[min(level, len(LEVEL_NAMES)) - 1]


def badge_key(badge, quarter):
    return f"{badge['id']}@{quarter}" if badge['kind'] == 'season' else badge['id']


def _day_of(ms, tz):
    try:
        return datetime.fromtimestamp(int(ms) / 1000, tz).date().isoformat()
    except (TypeError, ValueError, OverflowError, OSError):
        return ''


# ----- the index: everything read once, then cheap per person -----

class Index:
    """What every badge reads, grouped by person, built once from the raw
    records so the team's badges cost one pass, not one per person."""

    def __init__(self, pea=None, tally=None, timer_events=(), huddle_events=(), pass_events=(), tz=None):
        self.tz = tz
        pea = pea if isinstance(pea, dict) else {}
        ratings = pea.get('peaRatings') if isinstance(pea.get('peaRatings'), dict) else {}
        lst = lambda k: ratings.get(k) if isinstance(ratings.get(k), list) else []
        self.pea_names = [n for n in lst('names') if isinstance(n, str)]
        names, positions = lst('names'), lst('positions')
        self.aliases = pea.get('peaNameAliases') if isinstance(pea.get('peaNameAliases'), dict) else {}
        self.rated = {}      # Levelset name -> [(at, position, overall)]
        self.gave = {}       # Levelset name -> [(at, employee)]
        for r in lst('rows'):
            try:
                at, who, pos, overall = str(r[0]), names[r[1]], positions[r[4]], float(r[10])
                rater = names[r[3]] if isinstance(r[3], int) and 0 <= r[3] < len(names) else ''
            except (IndexError, TypeError, ValueError, KeyError):
                continue
            if not isinstance(who, str) or not who:
                continue
            if pos in PEA_RATED:
                self.rated.setdefault(who, []).append((at, pos, overall))
            if isinstance(rater, str) and rater and rater != who:
                self.gave.setdefault(rater, []).append((at[:10], who))

        # The list tally: finished handoffs per Lead Captain, finished zones per person.
        self.handoffs, self.zones = {}, {}
        for day, rec in (tally or {}).items():
            if not isinstance(rec, dict):
                continue
            for h in rec.values():
                if not isinstance(h, dict):
                    continue
                total = int(h.get('total') or 0)
                if total and int(h.get('checked') or 0) >= total:
                    for lead in timers_api.split_names(h.get('lead')):
                        self.handoffs.setdefault(key(lead), []).append(day)
                for pair in h.get('closers') or []:
                    if isinstance(pair, (list, tuple)) and len(pair) == 2:
                        try:
                            self.zones.setdefault(key(pair[0]), []).append((day, int(pair[1])))
                        except (TypeError, ValueError):
                            continue

        # Timers: each (day, daypart) an owner held, and whether any cycle in it was missed.
        cells = {}
        for e in timer_events or ():
            if not isinstance(e, dict) or e.get('type') not in ('reset', 'miss'):
                continue
            d = e.get('data') or {}
            if e.get('type') == 'reset' and d.get('status') not in ('ontime', 'late', 'missed'):
                continue                                    # restarted out of hours: not a cycle
            owner, day = key(d.get('owner')), _day_of(d.get('due'), tz)
            if not owner or not day or not d.get('daypart'):
                continue
            missed = e.get('type') == 'miss' or d.get('status') == 'missed'
            c = cells.setdefault((owner, day, d['daypart']), False)
            cells[(owner, day, d['daypart'])] = c or missed
        self.clock = {}
        for (owner, day, _), missed in cells.items():
            if not missed:
                self.clock.setdefault(owner, []).append(day)

        # Huddles: closed ones, by who set them.
        self.huddles = {}
        for h in huddle_api.fold(list(huddle_events or ()))['huddles'].values():
            pre, post = h.get('pre'), h.get('post')
            if pre and post and pre.get('by') and pre.get('date'):
                self.huddles.setdefault(key(pre['by']), []).append(str(pre['date']))

        # The Pass: tickets verified Elite, by owner id.
        self.elite = {}
        for t in pass_api.fold(list(pass_events or ())).values():
            if t.get('status') == 'verified' and t.get('rating') == 'elite' and t.get('owner') and t.get('closedAt'):
                self.elite.setdefault(t['owner'], []).append(_day_of(t['closedAt'], tz))

    def levelset_name(self, name):
        return pea_mine.match_name(name, self.pea_names, self.aliases)


def _tier(avg):
    return pea_mine.tier_for(avg)[0]


def _tiers_by_position(ratings, before=None):
    """{position: tier} from the latest five ratings (before a day, if given)."""
    by = {}
    for at, pos, overall in ratings:
        if before is None or at[:10] < before:
            by.setdefault(pos, []).append((at, overall))
    out = {}
    for pos, xs in by.items():
        xs.sort(key=lambda x: x[0], reverse=True)
        recent = xs[:pea_mine.RECENT]
        out[pos] = _tier(sum(o for _, o in recent) / len(recent))
    return out


def counts(idx, person, today_iso):
    """{badge id: count} for one person this quarter (season badges) and for
    good (milestones). person = {'name', 'id' (the Pass id), 'role', 'hireDate'}."""
    name, k = person.get('name') or '', key(person.get('name'))
    q = quarter_of(today_iso)
    start, end = quarter_bounds(q)
    inq = lambda d: bool(d) and start <= d[:10] < end
    out = {b['id']: 0 for b in CATALOG}

    out['zone'] = sum(n for d, n in idx.zones.get(k, []) if inq(d))
    out['handoff'] = sum(1 for d in idx.handoffs.get(k, []) if inq(d))
    out['clock'] = sum(1 for d in idx.clock.get(k, []) if inq(d))
    out['huddle'] = sum(1 for d in idx.huddles.get(k, []) if inq(d))
    out['elite'] = sum(1 for d in idx.elite.get(person.get('id') or '', []) if inq(d))

    ls = idx.levelset_name(name) if name else None
    if ls:
        ratings = idx.rated.get(ls, [])
        now = _tiers_by_position(ratings)
        out['crushing'] = sum(1 for t in now.values() if t == 'crushing')
        for side in ('foh', 'boh'):
            mine = [t for p, t in now.items() if p in PEA_SIDES[side]]
            if len(mine) >= ALL_GREEN_MIN and all(t == 'crushing' for t in mine):
                out['allgreen'] = 1
        before = _tiers_by_position(ratings, before=start)
        out['rise'] = sum(1 for p, t in now.items() if p in before and _TIER_RANK[t] > _TIER_RANK[before[p]])
        gave = [(d, who) for d, who in idx.gave.get(ls, []) if inq(d)]
        out['coach'] = len(gave)
        out['widenet'] = len({who for _, who in gave})

    hire = str(person.get('hireDate') or '')
    if re.match(r'^\d{4}-\d{2}-\d{2}$', hire) and hire <= today_iso:
        out['tenure'] = (date.fromisoformat(today_iso) - date.fromisoformat(hire)).days
    return out


def board(idx, person, today_iso, earned=None, now_ms=0):
    """One person's badges: (view, earned) where view is what the Me page
    draws and earned is the person's record with anything new added (the
    same dict if nothing changed, so the caller knows not to write)."""
    earned = dict(earned) if isinstance(earned, dict) else {}
    changed = False
    q = quarter_of(today_iso)
    c = counts(idx, person, today_iso)
    tier = TIER_OF_ROLE.get(person.get('role') or 'member', 0)
    shown = []
    for b in CATALOG:
        bk = badge_key(b, q)
        kept = earned.get(bk) if isinstance(earned.get(bk), dict) else {}
        level = max(level_for(b, c[b['id']]), int(kept.get('level') or 0))
        if level > int(kept.get('level') or 0):
            earned[bk] = {'level': level, 'at': now_ms}
            changed = True
        if TIER_OF_WHO[b['who']] > tier and not level and not c[b['id']]:
            continue
        nxt = next((t for t in b['levels'] if t > c[b['id']]), None) if level < len(b['levels']) else None
        at = (earned.get(bk) or {}).get('at') if level else None
        shown.append({'id': b['id'], 'name': b['name'], 'what': b['what'], 'unit': b['unit'], 'kind': b['kind'],
                      'icon': b['icon'], 'levels': b['levels'], 'count': c[b['id']], 'level': level,
                      'levelName': level_name(b, level), 'next': nxt, 'at': at})
    # Earlier quarters' season badges, from the record: the trophy case.
    past = []
    for bk, rec in earned.items():
        bid, _, bq = bk.partition('@')
        b = BY_ID.get(bid)
        if b and bq and bq != q and isinstance(rec, dict) and int(rec.get('level') or 0) > 0:
            past.append({'id': bid, 'name': b['name'], 'icon': b['icon'], 'quarter': bq, 'quarterLabel': quarter_label(bq),
                         'level': int(rec['level']), 'levelName': level_name(b, int(rec['level']))})
    past.sort(key=lambda p: (p['quarter'], p['name']), reverse=True)
    view = {'quarter': q, 'quarterLabel': quarter_label(q), 'badges': shown, 'past': past,
            'new': fresh(earned, now_ms)}
    return view, (earned if changed else None)


def fresh(earned, now_ms, days=NEW_DAYS):
    """Badges first seen in the last `days` days: [{id, name, levelName, at}], newest first."""
    out = []
    for bk, rec in (earned or {}).items():
        b = BY_ID.get(bk.partition('@')[0])
        if not b or not isinstance(rec, dict):
            continue
        at, level = int(rec.get('at') or 0), int(rec.get('level') or 0)
        if level and at and now_ms - at <= days * 86400000:
            out.append({'id': b['id'], 'name': b['name'], 'icon': b['icon'], 'level': level, 'levelName': level_name(b, level), 'at': at})
    return sorted(out, key=lambda x: -x['at'])
