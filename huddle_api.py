"""Huddle (Tim, Nov 18 2026): the pre-huddle and post-huddle for each
daypart, and the store's focus for the month and the week, on the Lists tab
beside Leader Transition.

The focus. Directors set ONE focus for the month and ONE for the week for
the whole store, each with a line on why it matters (and, if they like, the
scoreboard pillar it serves). Both show at the top of every huddle, and a
goal can be tied to either with one tap, so leaders aim their shift at what
the business needs.

The pre-huddle is Tim's Team Lead Pre-Shift Card, saved here in place of
copied to a director: why are you here today, your ONE priority, up to three
goals that can be checked when the shift ends (my PEC area, my own
leadership, the system I'll make sure runs), and who you'll develop. It
opens PRE_OPENS_MIN before the daypart starts.

The post-huddle closes it once the daypart has started: each goal hit,
partly or missed with a line on why, one recognition, one thing to hand to
the next leader.

A huddle is one per day, side and daypart. The dayparts are the four Know
the Numbers ones (static/js/know-numbers.js numbersDayparts;
tests/test_huddle.py checks they match), so a huddle lines up with the
productivity numbers; each covers the Set Ups dayparts that start inside
it, and its Lead Captain and the people a goal can be given to are read
from Set Ups, never typed in a list here. A missed one can still be filled
in until the day is over; after that it is history.

Storage: one Firebase record per event under huddle/events/<id>, written
once and never changed (the Pass's way, pass_api.py), so two servers
overlapping during a deploy can't wipe each other's work. Saving a
pre-huddle again is a new event; the latest stands. Not a saved-state
section; never goes through /api/state/sync.

  GET  /api/huddle/state?date=YYYY-MM-DD      Team Leads and up
        me, the focuses for that day's week and month, and each daypart:
        its hours, Lead Captain, who is on its Set Up, its pre and post
  POST /api/huddle/events   {type, data}
        pre     {date, daypart, purpose, priority, goals, develop}   Team Leads and up
        post    {date, daypart, results, recognition, handoff}       Team Leads and up
        focus   {scope: week | month, date, text, why, tag}          directors
"""
import re
import secrets
import threading
import time
from datetime import date as _date, datetime, timedelta

from flask import jsonify, request

import timers_api

ROOT = 'huddle'
MIN = 60 * 1000
LEADS = ('director', 'manager', 'admin', 'lead')          # fill a huddle in, and see them
FOCUS_SETTERS = ('director', 'manager', 'admin')          # set the month's and the week's focus
LEAD_CAPTAIN = timers_api.LEAD_CAPTAIN
SIDES = ('foh',)                                          # BOH comes with its Spanish (CLAUDE.md)
PRE_OPENS_MIN = 30                                        # the pre-huddle opens this long before the daypart
MAX_GOALS = 3
MAX_BODY = 20_000

# The Know the Numbers dayparts and when each starts (know-numbers.js
# numbersDayparts). Each ends when the next starts; the last at closing.
DAYPARTS = [
    ('Breakfast (6:00-10:30)', '6:00'),
    ('Lunch (10:30-2:00)', '10:30'),
    ('Afternoon (2:00-5:00)', '14:00'),
    ('Dinner (5:00-10:00)', '17:00'),
]
# The kinds of goal on Tim's Pre-Shift Card, in its order.
GOAL_KINDS = ('pec', 'lead', 'system')
RESULTS = ('hit', 'partly', 'missed')
EVENT_TYPES = ('pre', 'post', 'focus')
# Quick picks, from the card. The page offers them; the server keeps whatever was written.
PICKS = {
    'purpose': ['Serve guests well', 'Grow my people', 'Grow as a leader', 'Set the standard', 'Support my team'],
    'priority': ['Speed of service', 'Second Mile Service', 'Food quality', 'Cleanliness', 'Order accuracy'],
    'system': ['Zone Resets', 'Leader Transition List', 'OE Walkthrough', 'Food Safety Walkthrough', 'PEAs', 'Huddle'],
}


class Unavailable(Exception):
    pass


class Refused(Exception):
    def __init__(self, msg, status=400):
        super().__init__(msg)
        self.status = status


# ----- the calendar ----------------------------------------------------------------

def _day(iso):
    try:
        return _date.fromisoformat(str(iso))
    except ValueError:
        raise Refused('Pick a day.')


def week_of(day):
    """The week a day is in, as its Monday (the store's week runs Monday to Saturday)."""
    return (day - timedelta(days=day.weekday())).isoformat()


def month_of(day):
    return day.isoformat()[:7]


def period_of(scope, day):
    return week_of(day) if scope == 'week' else month_of(day)


def windows(day, hours, tz):
    """[(name, start ms, end ms)] for the day's dayparts, or [] when the store is closed."""
    h = timers_api.hours_on(day, hours, tz)
    if not h:
        return []
    starts = [timers_api._at(day, t, tz) for _, t in DAYPARTS]
    return [(name, starts[i], starts[i + 1] if i + 1 < len(starts) else max(h[1], starts[i] + 60 * MIN))
            for i, (name, _) in enumerate(DAYPARTS)]


def set_up_dayparts(name):
    """The Set Ups dayparts (timers_api.FOH_DAYPARTS) that start inside a huddle daypart."""
    i = [n for n, _ in DAYPARTS].index(name)
    start = timers_api._mins(DAYPARTS[i][1])
    end = timers_api._mins(DAYPARTS[i + 1][1]) if i + 1 < len(DAYPARTS) else 24 * 60
    return [n for n, t in timers_api.FOH_DAYPARTS if start <= timers_api._mins(t) < end]


def _names(v):
    """The names in a Set Ups spot: 'A / B', or a list of them."""
    if isinstance(v, list):
        return [n for x in v for n in _names(x)]
    if isinstance(v, dict):
        return _names(v.get('name'))
    return timers_api.split_names(v) if isinstance(v, str) else []


def on_set_up(posa, side, iso, daypart):
    """(the Lead Captains, everyone placed) on a huddle daypart's Set Ups, in the order found."""
    leads, people, seen = [], [], set()
    for sub in set_up_dayparts(daypart):
        prefix = f'{side}||{iso}||{sub}||'
        for key, v in (posa or {}).items():
            if not str(key).startswith(prefix):
                continue
            for n in _names(v):
                k = timers_api._key(n)
                if key == prefix + LEAD_CAPTAIN and k not in {timers_api._key(x) for x in leads}:
                    leads.append(n)
                if k not in seen:
                    seen.add(k)
                    people.append(n)
    return leads, sorted(people, key=str.lower)


# ----- the rules ---------------------------------------------------------------------

def huddle_key(d):
    return f'{d.get("date")}|{d.get("side")}|{d.get("daypart")}'


def fold(events):
    """What the events add up to: {'focus': {(scope, period): focus},
    'huddles': {key: {'pre': ..., 'post': ...}}}. The latest pre, post and
    focus stand; a post with no pre before it counts for nothing."""
    focus, huddles = {}, {}
    for e in sorted(events, key=lambda x: x['id']):
        d = e.get('data') or {}
        stamp = {'by': e.get('by', ''), 'at': e['at']}
        if e.get('type') == 'focus':
            if d.get('text'):
                focus[(d.get('scope'), d.get('period'))] = {**d, **stamp}
            else:
                focus.pop((d.get('scope'), d.get('period')), None)        # cleared
        elif e.get('type') == 'pre':
            h = huddles.setdefault(huddle_key(d), {'pre': None, 'post': None})
            h['pre'] = {**d, **stamp, 'first': (h['pre'] or stamp).get('first', e['at'])}
        elif e.get('type') == 'post':
            h = huddles.get(huddle_key(d))
            if h and h['pre']:
                h['post'] = {**d, **stamp}
    return {'focus': focus, 'huddles': huddles}


def score(h):
    """A closed huddle's goals: {'goals', 'hit', 'partly', 'missed'}; None until it's closed."""
    if not h or not h.get('pre') or not h.get('post'):
        return None
    res = h['post'].get('results') or {}
    out = {'goals': len(h['pre'].get('goals') or []), 'hit': 0, 'partly': 0, 'missed': 0}
    for g in h['pre'].get('goals') or []:
        r = (res.get(g['id']) or {}).get('result')
        if r in RESULTS:
            out[r] += 1
    return out


# ----- cleaning what the page sends --------------------------------------------------

def _text(v, cap):
    return re.sub(r'\s+', ' ', str(v)).strip()[:cap] if isinstance(v, (str, int, float)) and not isinstance(v, bool) else ''


def clean_pre(d, me_name):
    purpose, priority = _text(d.get('purpose'), 140), _text(d.get('priority'), 80)
    if not purpose:
        raise Refused('Say why you’re here today.')
    if not priority:
        raise Refused('Pick your ONE priority.')
    goals = []
    for g in (d.get('goals') if isinstance(d.get('goals'), list) else []):
        if not isinstance(g, dict):
            continue
        text = _text(g.get('text'), 160)
        if not text:
            continue
        if len(goals) >= MAX_GOALS:
            raise Refused(f'Keep it to {MAX_GOALS} goals.')
        goals.append({'id': f'g{len(goals) + 1}', 'kind': g.get('kind') if g.get('kind') in GOAL_KINDS else 'pec',
                      'text': text, 'target': _text(g.get('target'), 24), 'owner': _text(g.get('owner'), 60) or me_name,
                      'focus': g.get('focus') if g.get('focus') in ('week', 'month') else ''})
    if not goals:
        raise Refused('Write at least one goal you can check when the shift ends.')
    dev = d.get('develop') if isinstance(d.get('develop'), dict) else {}
    who = _text(dev.get('who'), 60)
    develop = {'who': who, 'skill': _text(dev.get('skill'), 120), 'pea': bool(dev.get('pea'))} if who else None
    return {'purpose': purpose, 'priority': priority, 'goals': goals, 'develop': develop}


def clean_post(d, pre):
    src = d.get('results') if isinstance(d.get('results'), dict) else {}
    results = {}
    for g in pre['goals']:
        r = src.get(g['id']) if isinstance(src.get(g['id']), dict) else {}
        if r.get('result') not in RESULTS:
            raise Refused('Mark each goal hit, partly or missed.')
        results[g['id']] = {'result': r['result'], 'why': _text(r.get('why'), 160)}
    rec = d.get('recognition') if isinstance(d.get('recognition'), dict) else {}
    who = _text(rec.get('who'), 60)
    return {'results': results,
            'recognition': {'who': who, 'what': _text(rec.get('what'), 160)} if who else None,
            'handoff': _text(d.get('handoff'), 200)}


# ----- storage -------------------------------------------------------------------------

class HuddleStore:
    """Every event in memory, read once from Firebase and written through
    (one record per event, never rewritten); another server's events are
    picked up every SYNC_SECONDS. The same as timers_api.TimerStore."""
    SYNC_SECONDS = 30
    OVERLAP_MS = 10 * MIN

    def __init__(self, ref):
        self.ref = ref
        self.lock = threading.RLock()
        self.reset()

    def reset(self):
        self.events, self.loaded, self.last_at, self.synced = {}, False, 0, 0

    def _add(self, ev):
        if ev['id'] not in self.events:
            self.events[ev['id']] = ev
            self.last_at = max(self.last_at, ev.get('at', 0))

    @staticmethod
    def _valid(events):
        return [v for k, v in (events or {}).items() if isinstance(v, dict) and v.get('id') == k and isinstance(v.get('at'), int)]

    def ensure(self):
        if self.loaded and time.time() - self.synced < self.SYNC_SECONDS:
            return
        with self.lock:
            ref = self.ref(f'{ROOT}/events')
            if not self.loaded:
                try:
                    events = ref.get()
                except Exception as e:
                    print(f'[HUDDLE] not read: {type(e).__name__}')
                    raise Unavailable()
                for ev in self._valid(events):
                    self._add(ev)
                self.loaded, self.synced = True, time.time()
                return
            self.synced = time.time()
            cutoff = f'{max(0, self.last_at - self.OVERLAP_MS):013d}'
            try:
                newer = ref.order_by_key().start_at(cutoff).get() if hasattr(ref, 'order_by_key') else ref.get()
            except Exception as e:
                print(f'[HUDDLE] sync skipped: {type(e).__name__}')
                return
            for ev in self._valid(newer):
                self._add(ev)

    def append(self, typ, by, data):
        at = max(int(time.time() * 1000), self.last_at + 1)
        ev = {'id': f'{at:013d}-{secrets.token_hex(3)}', 'at': at, 'type': typ, 'by': by, 'data': data}
        try:
            self.ref(f'{ROOT}/events/{ev["id"]}').set(ev)
        except Exception as e:
            print(f'[HUDDLE] event not written: {type(e).__name__}')
            raise Unavailable()
        self._add(ev)
        return ev


# ----- routes ----------------------------------------------------------------------------

def register(app, me, setups, ref, tz, hours=None):
    """Add /api/huddle. `me()` is the signed-in person ({id, name, role}) or
    None; `setups()` Set Ups' posAssignments; `ref(path)` a Firebase
    reference; `tz` the store's time zone; `hours()` the store's hours (the
    Timers page's, timers_api.DEFAULT_CONFIG['hours'] by default)."""
    store = HuddleStore(ref)
    app.extensions['huddle_store'] = store

    def now_ms():
        return int(time.time() * 1000)

    def store_hours():
        try:
            return (hours() if hours else None) or timers_api.DEFAULT_CONFIG['hours']
        except Exception as e:
            print(f'[HUDDLE] hours not read: {type(e).__name__}')
            return timers_api.DEFAULT_CONFIG['hours']

    def posa():
        try:
            return setups() or {}
        except Exception as e:
            print(f'[HUDDLE] set ups not read: {type(e).__name__}')
            return {}

    @app.after_request
    def _huddle_never_cached(resp):
        if request.path.startswith('/api/huddle/'):
            resp.headers['Cache-Control'] = 'no-store'
        return resp

    def lead_or_refuse():
        p = me()
        if not p or p.get('role') not in LEADS:
            raise Refused('Team Leads and up: sign in with your clock-in PIN for the Huddle.', 403)
        return p

    def view(day, p):
        f = fold(store.events.values())
        now, iso, p_posa = now_ms(), day.isoformat(), posa()
        today = datetime.fromtimestamp(now / 1000, tz).date()
        dayparts = []
        for name, start, end in windows(day, store_hours(), tz):
            leads, people = on_set_up(p_posa, 'foh', iso, name)
            h = f['huddles'].get(f'{iso}|foh|{name}') or {'pre': None, 'post': None}
            dayparts.append({'name': name, 'side': 'foh', 'start': start, 'end': end, 'preOpens': start - PRE_OPENS_MIN * MIN,
                             'leads': leads, 'people': people, 'pre': h['pre'], 'post': h['post'], 'score': score(h)})
        return {'serverTime': now, 'tz': str(tz), 'today': today.isoformat(), 'date': iso, 'week': week_of(day), 'month': month_of(day),
                'me': {'name': p['name'], 'role': p['role'], 'canFocus': p['role'] in FOCUS_SETTERS},
                'focus': {s: f['focus'].get((s, period_of(s, day))) for s in ('week', 'month')},
                'dayparts': dayparts, 'picks': PICKS, 'maxGoals': MAX_GOALS, 'preOpensMin': PRE_OPENS_MIN}

    def answer(fn):
        try:
            return fn()
        except Refused as err:
            return jsonify({'error': str(err)}), err.status
        except Unavailable:
            return jsonify({'error': 'The Huddle couldn’t reach the server. Try again in a moment.'}), 503

    @app.route('/api/huddle/state')
    def huddle_state():
        def go():
            p = lead_or_refuse()
            store.ensure()
            with store.lock:
                arg = request.args.get('date')
                day = _day(arg) if arg else datetime.fromtimestamp(now_ms() / 1000, tz).date()
                return jsonify(view(day, p))
        return answer(go)

    @app.route('/api/huddle/events', methods=['POST'])
    def huddle_event():
        def go():
            if (request.content_length or 0) > MAX_BODY:
                raise Refused('Too much at once.', 413)
            body = request.get_json(silent=True) or {}
            typ, d = body.get('type'), body.get('data') if isinstance(body.get('data'), dict) else {}
            if typ not in EVENT_TYPES:
                raise Refused('Unknown step.')
            p = lead_or_refuse()
            store.ensure()
            with store.lock:
                now = now_ms()
                today = datetime.fromtimestamp(now / 1000, tz).date()
                if typ == 'focus':
                    if p['role'] not in FOCUS_SETTERS:
                        raise Refused('Directors set the focus.', 403)
                    if d.get('scope') not in ('week', 'month'):
                        raise Refused('A focus is for the week or the month.')
                    day = _day(d.get('date')) if d.get('date') else today
                    if period_of(d['scope'], day) < period_of(d['scope'], today):
                        raise Refused('That week or month is over.')
                    text = _text(d.get('text'), 120)
                    data = {'scope': d['scope'], 'period': period_of(d['scope'], day), 'text': text,
                            'why': _text(d.get('why'), 160) if text else '', 'tag': _text(d.get('tag'), 60) if text else ''}
                    store.append(typ, p['name'], data)
                    return jsonify({'ok': True, **view(day, p)})
                day = _day(d.get('date')) if d.get('date') else today
                if day != today:
                    raise Refused('A huddle is filled in on its own day.')
                win = next((w for w in windows(day, store_hours(), tz) if w[0] == d.get('daypart')), None)
                if not win:
                    raise Refused('That daypart isn’t on today.')
                key = {'date': day.isoformat(), 'side': 'foh', 'daypart': win[0]}
                h = fold(store.events.values())['huddles'].get(huddle_key(key)) or {'pre': None, 'post': None}
                if typ == 'pre':
                    if now < win[1] - PRE_OPENS_MIN * MIN:
                        raise Refused(f'The pre-huddle opens {PRE_OPENS_MIN} minutes before the daypart.')
                    if h['post']:
                        raise Refused('That huddle is already closed.')
                    data = {**key, **clean_pre(d, p['name'])}
                else:
                    if not h['pre']:
                        raise Refused('Do the pre-huddle first.')
                    if now < win[1]:
                        raise Refused('The post-huddle opens once the daypart has started.')
                    data = {**key, **clean_post(d, h['pre'])}
                store.append(typ, p['name'], data)
                return jsonify({'ok': True, **view(day, p)})
        return answer(go)
