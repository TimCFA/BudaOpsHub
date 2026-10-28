"""Timers (Tim, Oct 28 2026): the store's recurring task timers (Restrooms,
Lot Sweep, Playground, Dining Room...) on the Lists tab, with who owned each
one and how it went, so the scoreboard can say which Lead Captain's dayparts
keep them on time.

How a timer runs. Every timer has an interval (how often it must be done)
and a grace (how long it may sit overdue before it counts as missed). A
cycle starts at the last reset, or at opening if that was before today's
opening, and comes due an interval later. Tapping the timer resets it and
starts the next cycle. Timers rest outside store hours and on closed days.

Who owns it. The Lead Captain of the FOH daypart on the floor when a cycle
comes due owns it (Set Ups, posAssignments), the same way Zone Reset hands
Final Check to the Lead Captain. A Lead Captain (any Team Lead and up, signed
in) can hand a timer to someone on shift; the handoff holds until a
different Lead Captain takes the floor or it's taken back. The server works
all of this out from Set Ups when the cycle comes due, so what a phone sends
can't change who gets the credit.

Each cycle ends one way:
  ontime   reset by the time it came due
  late     reset within the grace
  missed   the grace ran out. The server writes the miss itself, once, when
           any phone asks for the timers after it happens; a reset after
           that is still a missed cycle, with who picked it up recorded.

Storage: one Firebase record per event under timers/events/<id>, written
once and never changed (the Pass's way, pass_api.py), so two servers
overlapping during a deploy can't wipe each other's work. Not a saved-state
section; never goes through /api/state/sync.

  GET  /api/timers/state?since=<cursor>&days=<n>
        config (the timers, counters, store hours), counts, me, and events
        (those since the cursor, else the last n days)
  POST /api/timers/events   {type, data}
        reset     {timerId, name?}     anyone (a signed-out device names who)
        count     {counterId, value}   anyone
        handoff   {timerId, to}        Team Leads and up; to '' takes it back
        config    {timers, counters, hours}   Team Leads and up
"""
import re
import secrets
import threading
import time
from datetime import datetime, timedelta

from flask import jsonify, request

ROOT = 'timers'
MIN = 60 * 1000
DAY = 24 * 60 * MIN
LEADS = ('director', 'manager', 'admin', 'lead')
LEAD_CAPTAIN = 'Lead Captain'

# The FOH dayparts and when each starts (static/js/zone-reset.js fohDayparts;
# tests/test_timers.py checks they match).
FOH_DAYPARTS = [
    ('Early Breakfast (6:00-8:00)', '6:00'),
    ('Breakfast (8:00-10:30)', '8:00'),
    ('Lunch (10:30-1:00)', '10:30'),
    ('Transition (1:00-2:00)', '13:00'),
    ('Mid (2:00-5:00)', '14:00'),
    ('Dinner (5:00-8:00)', '17:00'),
    ('Close (8:00-10:00)', '20:00'),
]
ICONS = ('restroom', 'broom', 'slide', 'table', 'trash', 'cup', 'spray', 'window', 'clock')
DEFAULT_CONFIG = {
    'timers': [
        {'id': 'restroom', 'name': 'Restrooms', 'icon': 'restroom', 'interval': 30, 'grace': 10},
        {'id': 'lot', 'name': 'Lot Sweep', 'icon': 'broom', 'interval': 120, 'grace': 15},
        {'id': 'playground', 'name': 'Playground Clean Up', 'icon': 'slide', 'interval': 120, 'grace': 15},
        {'id': 'dining', 'name': 'Dining Room Touch', 'icon': 'table', 'interval': 45, 'grace': 10},
    ],
    'counters': [
        {'id': 'cookie', 'name': 'Cookie'},
        {'id': 'icedream', 'name': 'Icedream'},
    ],
    # Closed Sundays; open until 11pm Friday and Saturday (CLAUDE.md).
    'hours': {'open': '06:00', 'close': '22:00', 'closeLate': '23:00', 'lateDays': [4, 5], 'closedDays': [6]},
}
# Days are Python's (Monday 0 ... Sunday 6).
EVENT_TYPES = ('reset', 'count', 'handoff', 'config')
MAX_BODY = 20_000


# ----- clock ------------------------------------------------------------------

def _mins(hhmm):
    h, m = (str(hhmm).split(':') + ['0'])[:2]
    return int(h) * 60 + int(m)


def _local(ms, tz):
    return datetime.fromtimestamp(ms / 1000, tz)


def _at(day, hhmm, tz):
    """ms at hh:mm on a local date."""
    d = datetime(day.year, day.month, day.day, tzinfo=tz) + timedelta(minutes=_mins(hhmm))
    return int(d.timestamp() * 1000)


def hours_on(day, hours, tz):
    """(open ms, close ms) on a local date, or None when closed that day."""
    if day.weekday() in hours.get('closedDays', []):
        return None
    close = hours['closeLate'] if day.weekday() in hours.get('lateDays', []) else hours['close']
    return _at(day, hours['open'], tz), _at(day, close, tz)


def daypart_at(ms, tz):
    """The FOH daypart on the floor at a moment (the last one started)."""
    m = _local(ms, tz)
    now = m.hour * 60 + m.minute
    pick = None
    for name, start in FOH_DAYPARTS:
        if _mins(start) <= now:
            pick = name
    return pick or FOH_DAYPARTS[0][0]


def split_names(v):
    return [n.strip() for n in str(v or '').split('/') if n.strip()]


def _key(name):
    return re.sub(r'\s+', ' ', str(name or '')).strip().lower()


# ----- the rules ----------------------------------------------------------------

def fold(events):
    """What the events add up to: the config, each timer's last reset, the
    misses already written, today's handoffs, and the counters."""
    cfg, last, misses, handoffs, counts = None, {}, set(), [], {}
    for e in sorted(events, key=lambda x: x['id']):
        d = e.get('data') or {}
        t = e.get('type')
        if t == 'config':
            cfg = d
        elif t == 'reset':
            last[d.get('timerId')] = max(last.get(d.get('timerId'), 0), e['at'])
        elif t == 'miss':
            misses.add((d.get('timerId'), d.get('due')))
        elif t == 'handoff':
            handoffs.append(e)
        elif t == 'count':
            counts[d.get('counterId')] = d.get('value', 0)
    return {'config': cfg or DEFAULT_CONFIG, 'last': last, 'misses': misses, 'handoffs': handoffs, 'counts': counts}


def cycle(timer, last_reset, now, hours, tz):
    """The cycle a timer is on: {day, due, deadline, open, close}, or None
    when the store hasn't opened yet today and yesterday has nothing open.
    The day is today once the store has opened, else the last day it was
    open (so a miss from last night can still be written in the morning).
    A timer nobody has ever reset hasn't started: no cycle, no misses from
    before it was in use."""
    if not last_reset:
        return None
    today = _local(now, tz).date()
    for back in range(0, 8):
        day = today - timedelta(days=back)
        h = hours_on(day, hours, tz)
        if h and h[0] <= now:
            o, c = h
            base = max(last_reset or 0, o)
            if base >= c:                    # reset after close: nothing due that day
                return None
            due = base + timer['interval'] * MIN
            return {'day': day.isoformat(), 'due': due, 'deadline': due + timer['grace'] * MIN, 'open': o, 'close': c}
    return None


def lead_at(posa, ms, tz):
    """The Lead Captain on the floor at a moment, from Set Ups ('' if none)."""
    date = _local(ms, tz).date().isoformat()
    return ' / '.join(split_names((posa or {}).get(f'foh||{date}||{daypart_at(ms, tz)}||{LEAD_CAPTAIN}')))


def owner_at(timer_id, handoffs, lead, ms, tz):
    """Who owns a timer at a moment: the latest handoff that day made under
    the same Lead Captain, else the Lead Captain."""
    date = _local(ms, tz).date().isoformat()
    owner = lead
    for e in handoffs:
        d = e.get('data') or {}
        if e['at'] <= ms and d.get('timerId') == timer_id and d.get('date') == date and _key(d.get('lead')) == _key(lead):
            owner = d.get('to') or lead
    return owner


def credit(timer_id, due, handoffs, posa, tz):
    lead = lead_at(posa, due, tz)
    return {'daypart': daypart_at(due, tz), 'lead': lead, 'owner': owner_at(timer_id, handoffs, lead, due, tz)}


def outcome(late_min, grace, missed_before):
    if missed_before or late_min > grace:
        return 'missed'
    return 'ontime' if late_min <= 0 else 'late'


# ----- storage -------------------------------------------------------------------

class Unavailable(Exception):
    pass


class Refused(Exception):
    def __init__(self, msg, status=400):
        super().__init__(msg)
        self.status = status


class TimerStore:
    """Every event in memory, read once from Firebase and written through
    (one record per event, never rewritten). Another server's events are
    picked up every SYNC_SECONDS; each event gets this server's arrival
    number for the page's cursor."""
    SYNC_SECONDS = 30
    OVERLAP_MS = 10 * MIN

    def __init__(self, ref):
        self.ref = ref
        self.lock = threading.RLock()
        self.reset()

    def reset(self):
        self.events, self.loaded, self.last_at, self.synced = {}, False, 0, 0
        self.gen, self.seq, self.order = secrets.token_hex(4), 0, {}

    def _add(self, ev):
        if ev['id'] not in self.events:
            self.seq += 1
            self.order[ev['id']] = self.seq
            self.events[ev['id']] = ev
            self.last_at = max(self.last_at, ev.get('at', 0))

    @staticmethod
    def _valid(events):
        return sorted((v for k, v in (events or {}).items() if isinstance(v, dict) and v.get('id') == k), key=lambda e: e['id'])

    def ensure(self, force=False):
        if self.loaded and not force and time.time() - self.synced < self.SYNC_SECONDS:
            return
        with self.lock:
            if not self.loaded:
                try:
                    events = self.ref(f'{ROOT}/events').get()
                except Exception as e:
                    print(f'[TIMERS] not read: {type(e).__name__}')
                    raise Unavailable()
                for ev in self._valid(events):
                    self._add(ev)
                self.loaded, self.synced = True, time.time()
                return
            self.synced = time.time()
            cutoff = f'{max(0, self.last_at - self.OVERLAP_MS):013d}'
            try:
                ref = self.ref(f'{ROOT}/events')
                newer = ref.order_by_key().start_at(cutoff).get() if hasattr(ref, 'order_by_key') else ref.get()
            except Exception as e:
                print(f'[TIMERS] sync skipped: {type(e).__name__}')
                return
            for ev in self._valid(newer):
                self._add(ev)

    def since(self, cursor):
        gen, _, n = str(cursor or '').partition(':')
        if gen != self.gen or not n.isdigit():
            return None
        n = int(n)
        return [e for e in self.events.values() if self.order[e['id']] > n]

    def cursor(self):
        return f'{self.gen}:{self.seq}'

    def next_id(self):
        at = max(int(time.time() * 1000), self.last_at + 1)
        self.last_at = at
        return at, f'{at:013d}-{secrets.token_hex(3)}'

    def append(self, ev):
        if ev['id'] in self.events:
            return
        try:
            self.ref(f'{ROOT}/events/{ev["id"]}').set(ev)
        except Exception as e:
            print(f'[TIMERS] event not written: {type(e).__name__}')
            raise Unavailable()
        self._add(ev)


# ----- cleaning what the page sends -----------------------------------------------

def _text(v, cap):
    return re.sub(r'\s+', ' ', str(v)).strip()[:cap] if isinstance(v, (str, int, float)) else ''


def _int(v, lo, hi, default):
    try:
        v = int(v)
    except (TypeError, ValueError):
        return default
    return min(hi, max(lo, v))


def _hhmm(v, default):
    m = re.fullmatch(r'(\d{1,2}):(\d{2})', str(v or ''))
    return f'{int(m[1]):02d}:{m[2]}' if m and int(m[1]) < 24 and int(m[2]) < 60 else default


def clean_config(d):
    d = d if isinstance(d, dict) else {}
    timers, counters, seen = [], [], set()
    for t in (d.get('timers') if isinstance(d.get('timers'), list) else [])[:16]:
        if not isinstance(t, dict):
            continue
        name = _text(t.get('name'), 40)
        tid = re.sub(r'[^a-z0-9_-]', '', str(t.get('id') or '').lower())[:24] or secrets.token_hex(3)
        if not name or tid in seen:
            continue
        seen.add(tid)
        timers.append({'id': tid, 'name': name, 'icon': t.get('icon') if t.get('icon') in ICONS else 'clock',
                       'interval': _int(t.get('interval'), 5, 24 * 60, 60), 'grace': _int(t.get('grace'), 0, 240, 10)})
    for c in (d.get('counters') if isinstance(d.get('counters'), list) else [])[:12]:
        if not isinstance(c, dict):
            continue
        name = _text(c.get('name'), 30)
        cid = re.sub(r'[^a-z0-9_-]', '', str(c.get('id') or '').lower())[:24] or secrets.token_hex(3)
        if name and cid not in seen:
            seen.add(cid)
            counters.append({'id': cid, 'name': name})
    h = d.get('hours') if isinstance(d.get('hours'), dict) else {}
    dh = DEFAULT_CONFIG['hours']
    days = lambda v, dv: sorted({x for x in v if isinstance(x, int) and 0 <= x <= 6}) if isinstance(v, list) else dv
    hours = {'open': _hhmm(h.get('open'), dh['open']), 'close': _hhmm(h.get('close'), dh['close']),
             'closeLate': _hhmm(h.get('closeLate'), dh['closeLate']),
             'lateDays': days(h.get('lateDays'), dh['lateDays']), 'closedDays': days(h.get('closedDays'), dh['closedDays'])}
    if _mins(hours['close']) <= _mins(hours['open']) or _mins(hours['closeLate']) <= _mins(hours['open']):
        raise Refused('Closing has to be after opening.')
    return {'timers': timers, 'counters': counters, 'hours': hours}


# ----- routes ----------------------------------------------------------------------

def register(app, me, setups, ref, tz):
    """Add /api/timers. `me()` is the signed-in person ({id, name, role}) or
    None; `setups()` today's posAssignments (Set Ups); `ref(path)` a
    Firebase reference; `tz` the store's time zone."""
    store = TimerStore(ref)
    app.extensions['timer_store'] = store

    def now_ms():
        return int(time.time() * 1000)

    @app.after_request
    def _timers_never_cached(resp):
        if request.path.startswith('/api/timers/'):
            resp.headers['Cache-Control'] = 'no-store'
        return resp

    def refused(err):
        return jsonify({'error': str(err)}), err.status

    def unavailable():
        return jsonify({'error': 'Timers couldn’t reach the server. Try again in a moment.'}), 503

    def posa():
        try:
            return setups() or {}
        except Exception as e:
            print(f'[TIMERS] set ups not read: {type(e).__name__}')
            return {}

    def sweep(f, now):
        """Write a miss for every cycle whose grace ran out unreset."""
        p = None
        for t in f['config']['timers']:
            c = cycle(t, f['last'].get(t['id']), now, f['config']['hours'], tz)
            if not c or c['deadline'] > min(now, c['close']) or (t['id'], c['due']) in f['misses']:
                continue
            p = posa() if p is None else p
            ev = {'id': f'{c["deadline"]:013d}-m-{t["id"]}', 'at': c['deadline'], 'type': 'miss', 'by': '',
                  'data': {'timerId': t['id'], 'timerName': t['name'], 'due': c['due'], 'grace': t['grace'],
                           **credit(t['id'], c['due'], f['handoffs'], p, tz)}}
            store.append(ev)
            f['misses'].add((t['id'], c['due']))

    def is_lead(p):
        return bool(p) and p.get('role') in LEADS

    @app.route('/api/timers/state')
    def timers_state():
        try:
            store.ensure()
            with store.lock:
                now = now_ms()
                f = fold(store.events.values())
                sweep(f, now)
                newer = store.since(request.args.get('since'))
                if newer is None:
                    days = _int(request.args.get('days'), 1, 60, 1)
                    start = now - days * DAY
                    events = [e for e in store.events.values() if e['at'] >= start and e.get('type') != 'config']
                else:
                    events = [e for e in newer if e.get('type') != 'config']
                p = me()
                return jsonify({'serverTime': now, 'full': newer is None, 'cursor': store.cursor(),
                                'config': f['config'], 'counts': f['counts'], 'last': f['last'],
                                'lead': lead_at(posa(), now, tz), 'daypart': daypart_at(now, tz),
                                'me': {'name': p['name'], 'role': p['role'], 'canLead': is_lead(p)} if p else None,
                                'events': sorted(events, key=lambda e: e['id'])})
        except Unavailable:
            return unavailable()

    @app.route('/api/timers/events', methods=['POST'])
    def timers_event():
        if (request.content_length or 0) > MAX_BODY:
            return jsonify({'error': 'Too much at once.'}), 413
        body = request.get_json(silent=True) or {}
        typ, d = body.get('type'), body.get('data') if isinstance(body.get('data'), dict) else {}
        p = me()
        try:
            if typ not in EVENT_TYPES:
                raise Refused('Unknown step.')
            store.ensure()
            with store.lock:
                now = now_ms()
                f = fold(store.events.values())
                cfg = f['config']
                timers = {t['id']: t for t in cfg['timers']}
                if typ == 'reset':
                    t = timers.get(d.get('timerId'))
                    if not t:
                        raise Refused('That timer is gone. Reload the page.')
                    # A tap resets with nobody named (Tim, Oct 28 2026: no prompt on
                    # every tap); press and hold names who did it. The cycle's credit
                    # comes from Set Ups either way.
                    by = p['name'] if p else _text(d.get('name'), 40)
                    sweep(f, now)                          # a miss due first is written first
                    c = cycle(t, f['last'].get(t['id']), now, cfg['hours'], tz)
                    data = {'timerId': t['id'], 'timerName': t['name'], 'signedIn': bool(p)}
                    if c and c['open'] <= now < c['close'] + 30 * MIN:
                        late = max(0, -(-(now - c['due']) // MIN)) if now > c['due'] else 0
                        data.update(due=c['due'], grace=t['grace'], lateMin=late,
                                    status=outcome(late, t['grace'], (t['id'], c['due']) in f['misses']),
                                    **credit(t['id'], c['due'], f['handoffs'], posa(), tz))
                    else:
                        data['status'] = 'closed'          # restarted out of hours: not a cycle
                elif typ == 'count':
                    if d.get('counterId') not in {c['id'] for c in cfg['counters']}:
                        raise Refused('That counter is gone. Reload the page.')
                    by = p['name'] if p else ''
                    data = {'counterId': d['counterId'], 'value': _int(d.get('value'), 0, 99999, 0)}
                elif typ == 'handoff':
                    if not is_lead(p):
                        raise Refused('Sign in as a Team Lead to hand off a timer.', 403)
                    t = timers.get(d.get('timerId'))
                    if not t:
                        raise Refused('That timer is gone. Reload the page.')
                    by = p['name']
                    lead = lead_at(posa(), now, tz)
                    data = {'timerId': t['id'], 'to': _text(d.get('to'), 60), 'lead': lead,
                            'date': _local(now, tz).date().isoformat(), 'daypart': daypart_at(now, tz)}
                else:  # config
                    if not is_lead(p):
                        raise Refused('Sign in as a Team Lead to change the timers.', 403)
                    by = p['name']
                    data = clean_config(d)
                    if not data['timers']:
                        raise Refused('Keep at least one timer.')
                at, eid = store.next_id()
                ev = {'id': eid, 'at': at, 'type': typ, 'by': by, 'data': data}
                store.append(ev)
                return jsonify({'ok': True, 'event': ev, 'serverTime': now_ms()})
        except Refused as err:
            return refused(err)
        except Unavailable:
            return unavailable()
