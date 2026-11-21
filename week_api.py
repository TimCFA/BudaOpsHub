"""Directors' Week (Tim, Nov 18 2026): the team sees how a director plans to
spend the week, and asks for their time. On the Calendar tab
(static/js/week.js).

The week comes from Google: a director plans in one Google calendar of
coloured work blocks and shares that one calendar with the hub's service
account ("Make changes to events"). The hub mirrors it, read every few
minutes on the server; no phone ever talks to Google, and nothing is planned
in the hub. A director who hasn't connected a calendar has no page.

What the team sees of a block goes by its type (BLOCK_TYPES, told by the
event's title, else its colour):

  Open door            bookable, in 30-minute slots
  PEA window           shown by name
  Floor support window shown by name
  everything else      "Busy", nothing more

A request (REQUEST_TYPES: data, so a type can be added without new code)
waits for the director: Open door time (a slot), a PEA on me or staffing
support (a day and a daypart), need to talk (no time). Booking closes at
midnight: tomorrow is the first day anyone can ask for, and a same-shift gap
stays a call or text. One person a slot (unless the block's title says
"group"): a slot someone has asked for is "Booked" to everyone else, with no
name. Accepting an Open door slot (or a time for "need to talk") writes it
onto the director's Google calendar; a PEA or staffing request is only
marked accepted, the planning is the director's.

Requests are folded from events, one Firebase record each under
week/events/<id>, written once and never changed (as the Pass does), so two
servers overlapping during a deploy can't wipe each other's work. Which
calendar each director shares, and the switch that shows the page to the
team, are under secure/week. It is not a saved-state section and never goes
through /api/state/sync.

  GET    /api/week/state            the weeks, my requests, a director's inbox
  GET    /api/week/count            requests waiting on me (the badge)
  POST   /api/week/requests         {type, director, slot | day, daypart, about, note}
  POST   /api/week/requests/<id>/<accept|decline|cancel>   {note, when}
  PUT    /api/week/calendar         {calendarId}: a director shares a calendar
  DELETE /api/week/calendar         ...and stops
  PUT    /api/week/live             {live}: show it to the team, or not yet
"""
import re
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

from flask import jsonify, request

ROOT = 'week'
SECURE = 'secure/week'          # {directors: {id: {name, calendarId, at}}, settings: {live}}
MIN = 60 * 1000
SLOT_MIN = 30
MIRROR_SECONDS = 180            # how old the copy of a calendar may be
CONFIG_SECONDS = 60
MAX_BODY = 8_000
NOTE_MAX = 500
OPEN_REQUESTS_MAX = 6           # one person's requests still waiting, across directors

# Google's event colours by id (Calendar's own names beside each).
BLOCK_TYPES = (
    {'id': 'open', 'label': 'Open door', 'show': 'book', 'words': ('open door',), 'colors': ('9', '7')},                 # Blueberry, Peacock
    {'id': 'peak', 'label': 'Floor: lunch peak', 'show': 'busy', 'words': ('lunch peak',), 'colors': ('11',)},           # Tomato
    {'id': 'support', 'label': 'Floor support window', 'show': 'named', 'words': ('floor support',), 'colors': ('5',)},  # Banana
    {'id': 'pea', 'label': 'PEA window', 'show': 'named', 'words': ('pea',), 'colors': ('10', '2')},                     # Basil, Sage
    {'id': 'review', 'label': 'Weekly review', 'show': 'busy', 'words': ('weekly review',), 'colors': ('4',)},           # Flamingo
    {'id': 'focus', 'label': 'Focus', 'show': 'busy', 'words': ('focus',), 'colors': ('3', '1')},                        # Grape, Lavender
    {'id': 'admin', 'label': 'Admin and day plan', 'show': 'busy', 'words': ('admin', 'day plan'), 'colors': ('8',)},    # Graphite
)
REQUEST_TYPES = (
    {'id': 'open', 'label': 'Open door time', 'needs': 'slot',
     'hint': 'A 1:1, a question, coaching or a developmental conversation. Pick an open 30-minute slot.',
     'about': ('1:1', 'Question', 'Coaching', 'Developmental conversation')},
    {'id': 'pea', 'label': 'A PEA on me', 'needs': 'daypart', 'hint': 'The day and daypart you’d like to be observed.'},
    {'id': 'staffing', 'label': 'Staffing support', 'needs': 'daypart', 'hint': 'For a daypart tomorrow or later that will be short.'},
    {'id': 'talk', 'label': 'Need to talk', 'needs': 'none', 'hint': 'No time to pick. You’ll get a time back.'},
)
REQUEST_BY_ID = {t['id']: t for t in REQUEST_TYPES}
HOLDING = ('pending', 'accepted')
CALENDAR_ID_RE = re.compile(r'^[A-Za-z0-9._-]{8,120}@group\.calendar\.google\.com$')
DAY_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


class Refused(Exception):
    def __init__(self, msg, status=400):
        super().__init__(msg)
        self.status = status


class Unavailable(Exception):
    pass


class CalendarError(Exception):
    """Google said no, or couldn't be reached. `status` is its HTTP status (0: no answer)."""

    def __init__(self, status=0):
        super().__init__(f'calendar {status}')
        self.status = status


# ----- Google --------------------------------------------------------------

class GoogleCalendar:
    """The hub's service account on the Calendar API. It reaches only the
    calendars someone has shared with its address, and only their events."""
    SCOPES = ('https://www.googleapis.com/auth/calendar.events',)
    API = 'https://www.googleapis.com/calendar/v3/calendars'
    TIMEOUT = 10

    def __init__(self, info):
        self.info = info if isinstance(info, dict) else None
        self._session, self._lock = None, threading.Lock()

    def email(self):
        return str((self.info or {}).get('client_email') or '')

    def _http(self):
        if not self.info:
            raise CalendarError(0)
        with self._lock:
            if self._session is None:
                from google.oauth2 import service_account
                from google.auth.transport.requests import AuthorizedSession
                creds = service_account.Credentials.from_service_account_info(self.info, scopes=list(self.SCOPES))
                self._session = AuthorizedSession(creds)
            return self._session

    def _call(self, method, url, **kw):
        from urllib.parse import quote
        try:
            r = self._http().request(method, f'{self.API}/{quote(url, safe="/")}', timeout=self.TIMEOUT, **kw)
        except CalendarError:
            raise
        except Exception as e:
            print(f'[WEEK] Google not reached: {type(e).__name__}')
            raise CalendarError(0)
        if r.status_code >= 300 and not (method == 'DELETE' and r.status_code in (404, 410)):
            print(f'[WEEK] Google answered {r.status_code}')
            raise CalendarError(r.status_code)
        return r

    def list(self, calendar_id, start, end):
        """The calendar's events between two datetimes, repeats laid out one by one."""
        out, token = [], None
        for _ in range(5):
            params = {'timeMin': start.isoformat(), 'timeMax': end.isoformat(), 'singleEvents': 'true',
                      'orderBy': 'startTime', 'maxResults': 250,
                      'fields': 'nextPageToken,items(id,status,summary,colorId,start,end,extendedProperties/private)'}
            if token:
                params['pageToken'] = token
            d = self._call('GET', f'{calendar_id}/events', params=params).json()
            out += [e for e in d.get('items') or [] if isinstance(e, dict)]
            token = d.get('nextPageToken')
            if not token:
                break
        return out

    def insert(self, calendar_id, body):
        return str(self._call('POST', f'{calendar_id}/events', json=body).json().get('id') or '')

    def delete(self, calendar_id, event_id):
        self._call('DELETE', f'{calendar_id}/events/{event_id}')


# ----- the rules -----------------------------------------------------------

def block_type(summary, color):
    """Which block an event is: by its title, else its colour, else None (busy)."""
    title = str(summary or '').lower()
    for t in BLOCK_TYPES:
        if any(re.search(rf'\b{re.escape(w)}\b', title) for w in t['words']):
            return t
    for t in BLOCK_TYPES:
        if color and str(color) in t['colors']:
            return t
    return None


def _when(v, tz):
    """A Google start/end as ms, or None for an all-day one."""
    s = (v or {}).get('dateTime') if isinstance(v, dict) else None
    if not s:
        return None
    try:
        d = datetime.fromisoformat(str(s).replace('Z', '+00:00'))
    except ValueError:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=tz)
    return int(d.timestamp() * 1000)


def blocks_from(events, tz):
    """Google's events as the hub's blocks: {type, label, show, start, end,
    group}. All-day and cancelled events are left out, and so is a booking
    the hub wrote for an Open door slot (the slot already shows it)."""
    out = []
    for e in events or []:
        if not isinstance(e, dict) or e.get('status') == 'cancelled':
            continue
        start, end = _when(e.get('start'), tz), _when(e.get('end'), tz)
        if not start or not end or end <= start:
            continue
        ours = ((e.get('extendedProperties') or {}).get('private') or {}).get('hubRequestType')
        if ours == 'open':
            continue
        t = None if ours else block_type(e.get('summary'), e.get('colorId'))
        out.append({'type': t['id'] if t else 'busy', 'label': t['label'] if t and t['show'] != 'busy' else 'Busy',
                    'show': t['show'] if t else 'busy', 'start': start, 'end': end,
                    'group': bool(t and t['show'] == 'book' and re.search(r'\bgroup\b', str(e.get('summary') or '').lower()))})
    return sorted(out, key=lambda b: (b['start'], b['end']))


def slots_of(block):
    """A bookable block's 30-minute slots, by their start."""
    return list(range(block['start'], block['end'] - SLOT_MIN * MIN + 1, SLOT_MIN * MIN))


def fold(events):
    """Every request, as its events leave it. Two requests for one slot (two
    servers, the minute a deploy overlaps): the first keeps it."""
    reqs, held = {}, {}
    for e in sorted(events, key=lambda e: e['id']):
        d, typ = e.get('data') or {}, e.get('type')
        if typ == 'request':
            r = {'id': e['reqId'], 'type': d.get('type'), 'director': d.get('director'), 'by': e.get('by'),
                 'byName': e.get('byName') or '', 'at': e['at'], 'slot': d.get('slot') or 0, 'day': d.get('day') or '',
                 'daypart': d.get('daypart') or '', 'about': d.get('about') or '', 'note': d.get('note') or '',
                 'group': bool(d.get('group')), 'status': 'pending', 'reply': '', 'when': 0, 'decidedAt': 0, 'gcal': ''}
            key = (r['director'], r['slot'])
            if r['slot'] and not r['group']:
                if held.get(key):
                    r['status'] = 'lost'
                else:
                    held[key] = r['id']
            reqs[r['id']] = r
            continue
        r = reqs.get(e.get('reqId'))
        if not r:
            continue
        if typ in ('accept', 'decline') and r['status'] == 'pending' and e.get('by') == r['director']:
            r.update(status='accepted' if typ == 'accept' else 'declined', reply=d.get('note') or '', decidedAt=e['at'],
                     when=d.get('when') or 0, gcal=d.get('gcal') or '')
        elif typ == 'cancel' and r['status'] in HOLDING and e.get('by') in (r['by'], r['director']):
            r.update(status='cancelled', decidedAt=e['at'])
        else:
            continue
        if r['status'] not in HOLDING and held.get((r['director'], r['slot'])) == r['id']:
            del held[(r['director'], r['slot'])]
    return reqs


def taken(reqs, director):
    """{slot: the request holding it} for one director."""
    return {r['slot']: r for r in reqs.values() if r['director'] == director and r['slot'] and r['status'] in HOLDING and not r['group']}


# ----- the store (as pass_api.PassStore) -------------------------------------

class WeekStore:
    SYNC_SECONDS = 60
    OVERLAP_MS = 10 * 60 * 1000

    def __init__(self, ref):
        self.ref = ref
        self.lock = threading.RLock()
        self.reset()

    def reset(self):
        self.events, self.loaded, self.last_at, self.synced = {}, False, 0, 0
        self.config, self.config_at = None, 0
        self.mirror = {}             # director id -> {at, blocks, ok}

    def _add(self, ev):
        if ev['id'] not in self.events:
            self.events[ev['id']] = ev
            self.last_at = max(self.last_at, ev.get('at', 0))

    @staticmethod
    def _valid(events):
        return [v for k, v in (events or {}).items() if isinstance(v, dict) and v.get('id') == k and isinstance(v.get('at'), int)] \
            if isinstance(events, dict) else []

    def ensure(self, force=False):
        if self.loaded and not force and time.time() - self.synced < self.SYNC_SECONDS:
            return
        with self.lock:
            ref = self.ref(f'{ROOT}/events')
            try:
                if not self.loaded:
                    got = ref.get()
                else:
                    cutoff = f'{max(0, self.last_at - self.OVERLAP_MS):013d}'
                    got = ref.order_by_key().start_at(cutoff).get() if hasattr(ref, 'order_by_key') else ref.get()
            except Exception as e:
                print(f'[WEEK] not read: {type(e).__name__}')
                if not self.loaded:
                    raise Unavailable()
                return                # what's in memory still serves
            for ev in self._valid(got):
                self._add(ev)
            self.loaded, self.synced = True, time.time()

    def next_id(self):
        at = max(int(time.time() * 1000), self.last_at + 1)
        self.last_at = at
        return at, f'{at:013d}-{secrets.token_hex(3)}'

    def append(self, ev):
        try:
            self.ref(f'{ROOT}/events/{ev["id"]}').set(ev)
        except Exception as e:
            print(f'[WEEK] event not written: {type(e).__name__}')
            raise Unavailable()
        self._add(ev)

    def settings(self, force=False):
        """{directors: {id: {name, calendarId, at}}, live: bool}"""
        if self.config is not None and not force and time.time() - self.config_at < CONFIG_SECONDS:
            return self.config
        try:
            raw = self.ref(SECURE).get() or {}
        except Exception as e:
            print(f'[WEEK] settings not read: {type(e).__name__}')
            if self.config is not None:
                return self.config
            raise Unavailable()
        directors = {k: v for k, v in (raw.get('directors') or {}).items()
                     if isinstance(v, dict) and CALENDAR_ID_RE.match(str(v.get('calendarId') or ''))}
        self.config = {'directors': directors, 'live': bool((raw.get('settings') or {}).get('live'))}
        self.config_at = time.time()
        return self.config


def _text(v, cap):
    return re.sub(r'\s+', ' ', str(v or '')).strip()[:cap] if isinstance(v, (str, int, float)) else ''


# ----- the API -----------------------------------------------------------------

def register(app, me, signed_in, ref, tz, calendar, dayparts):
    """Add /api/week to the app. `me()` is the signed-in person ({id, name,
    role}) or None; `signed_in()` whether this is a team device at all (a
    person, a manager PIN or a shared device); `ref(path)` a Firebase
    reference; `tz` the store's time zone; `calendar` a GoogleCalendar;
    `dayparts` the names a PEA or staffing request picks from."""
    store = WeekStore(ref)
    app.extensions['week_store'] = store
    app.extensions['week_calendar'] = calendar
    dayparts = tuple(dayparts)

    def now_ms():
        return int(time.time() * 1000)

    def local(ms):
        return datetime.fromtimestamp(ms / 1000, tz)

    def day_start(day):
        return int(datetime(day.year, day.month, day.day, tzinfo=tz).timestamp() * 1000)

    def window(now):
        """Monday of this week, the first day anyone can book (tomorrow) and
        the last (the Sunday that ends next week)."""
        today = local(now).date()
        monday = today - timedelta(days=today.weekday())
        return monday, today + timedelta(days=1), monday + timedelta(days=13)

    def is_director(p):
        return bool(p) and p.get('role') == 'director' and p.get('id') != 'director'   # the shared PIN has no name

    def sees(p, cfg):
        """The team sees it once it's live; until then, directors only."""
        return cfg['live'] or (bool(p) and p.get('role') in ('director', 'manager'))

    @app.after_request
    def _week_never_cached(resp):
        if request.path.startswith('/api/week/'):
            resp.headers['Cache-Control'] = 'no-store'
        return resp

    @app.errorhandler(Refused)
    def _week_refused(err):
        return jsonify({'error': str(err)}), err.status

    @app.errorhandler(Unavailable)
    def _week_unavailable(err):
        return jsonify({'error': 'Directors’ Week couldn’t reach the server. Try again in a moment.'}), 503

    def mirror(did, cfg, now, force=False):
        """A director's blocks for the two weeks, from the copy kept here;
        Google is asked again once the copy is MIRROR_SECONDS old. If Google
        can't be reached the old copy serves, marked stale."""
        got = store.mirror.get(did)
        cal = cfg['directors'][did]['calendarId']
        if got and got['cal'] == cal and not force and time.time() - got['at'] < MIRROR_SECONDS:
            return got
        monday, _, last = window(now)
        try:
            events = calendar.list(cal, local(day_start(monday)), local(day_start(last + timedelta(days=1))))
            got = {'at': time.time(), 'cal': cal, 'blocks': blocks_from(events, tz), 'ok': True}
        except CalendarError:
            if got and got['cal'] == cal:
                got = dict(got, at=time.time() - MIRROR_SECONDS + 30, ok=False)    # ask again in half a minute
            else:
                got = {'at': time.time() - MIRROR_SECONDS + 30, 'cal': cal, 'blocks': [], 'ok': False}
        store.mirror[did] = got
        return got

    def week_of(did, cfg, reqs, p, now):
        """What one person sees of one director's two weeks."""
        m = mirror(did, cfg, now)
        _, first, last = window(now)
        opens, closes = day_start(first), day_start(last + timedelta(days=1))
        held = taken(reqs, did)
        days = {}
        for b in m['blocks']:
            out = {'type': b['type'] if b['show'] != 'busy' else 'busy', 'label': b['label'], 'show': b['show'],
                   'start': b['start'], 'end': b['end']}
            if b['show'] == 'book':
                out['group'] = b['group']
                out['slots'] = []
                for s in slots_of(b):
                    r = None if b['group'] else held.get(s)
                    state = 'closed' if not opens <= s < closes else 'open'
                    if r:
                        state = 'mine' if p and r['by'] == p['id'] else 'booked'
                    out['slots'].append({'at': s, 'state': state})
            days.setdefault(local(b['start']).date().isoformat(), []).append(out)
        return {'id': did, 'name': cfg['directors'][did].get('name') or 'Director', 'stale': not m['ok'],
                'days': [{'date': k, 'blocks': v} for k, v in sorted(days.items())]}

    def public(r, names, mine_too=True):
        out = {k: r[k] for k in ('id', 'type', 'director', 'at', 'slot', 'day', 'daypart', 'about', 'note', 'status', 'reply', 'when', 'decidedAt')}
        out['directorName'] = names.get(r['director']) or 'Director'
        if mine_too:
            out['byName'] = r['byName']
        return out

    @app.route('/api/week/state')
    def week_state():
        p = me()
        if not p and not signed_in():
            raise Refused('Sign in to see Directors’ Week.', 401)
        cfg = store.settings()
        director = is_director(p)
        out = {'live': cfg['live'], 'me': dict(p, director=director) if p else None, 'directors': [], 'mine': [], 'inbox': [],
               'requestTypes': list(REQUEST_TYPES), 'dayparts': list(dayparts), 'slotMinutes': SLOT_MIN}
        now = now_ms()
        monday, first, last = window(now)
        out.update(weekStart=monday.isoformat(), today=local(now).date().isoformat(), bookFrom=first.isoformat(), bookTo=last.isoformat())
        if director:
            mine = cfg['directors'].get(p['id'])
            out['setup'] = {'robot': calendar.email(), 'connected': bool(mine), 'calendarId': (mine or {}).get('calendarId', ''),
                            'blockTypes': [{'label': t['label'], 'show': t['show']} for t in BLOCK_TYPES]}
        if not sees(p, cfg):
            return jsonify(out)
        store.ensure()
        reqs = fold(store.events.values())
        names = {k: v.get('name') or 'Director' for k, v in cfg['directors'].items()}
        out['directors'] = [week_of(did, cfg, reqs, p, now) for did in sorted(cfg['directors'], key=lambda k: names[k].lower())]
        if p:
            newest = sorted(reqs.values(), key=lambda r: -r['at'])
            out['mine'] = [public(r, names, False) for r in newest if r['by'] == p['id']][:30]
            if director:
                out['inbox'] = [public(r, names) for r in newest if r['director'] == p['id'] and r['status'] != 'lost'][:60]
        return jsonify(out)

    @app.route('/api/week/count')
    def week_count():
        p = me()
        if not is_director(p):
            return jsonify({'count': 0})
        store.ensure()
        return jsonify({'count': sum(1 for r in fold(store.events.values()).values() if r['director'] == p['id'] and r['status'] == 'pending')})

    def body():
        if (request.content_length or 0) > MAX_BODY:
            raise Refused('That’s too long.', 413)
        d = request.get_json(silent=True)
        return d if isinstance(d, dict) else {}

    def who():
        p = me()
        if not p or p.get('id') == 'director':
            raise Refused('Sign in with your own PIN to ask for a director’s time.', 401)
        return p

    @app.route('/api/week/requests', methods=['POST'])
    def week_request():
        p, d = who(), body()
        cfg = store.settings()
        if not sees(p, cfg):
            raise Refused('Directors’ Week isn’t open yet.', 403)
        t = REQUEST_BY_ID.get(d.get('type'))
        did = str(d.get('director') or '')
        if not t or did not in cfg['directors']:
            raise Refused('Pick a director and what you need.')
        if did == p['id']:
            raise Refused('That’s your own week.')
        store.ensure(force=True)
        now = now_ms()
        _, first, last = window(now)
        data = {'type': t['id'], 'director': did, 'note': _text(d.get('note'), NOTE_MAX)}
        with store.lock:
            reqs = fold(store.events.values())
            if sum(1 for r in reqs.values() if r['by'] == p['id'] and r['status'] == 'pending') >= OPEN_REQUESTS_MAX:
                raise Refused('You already have several requests waiting. Give those a chance first.', 409)
            if t['needs'] == 'slot':
                try:
                    slot = int(d.get('slot'))
                except (TypeError, ValueError):
                    raise Refused('Pick an open slot.')
                if not day_start(first) <= slot < day_start(last + timedelta(days=1)):
                    raise Refused('That day is set. Tomorrow is the first day you can book; for today, call or text.', 409)
                block = next((b for b in mirror(did, cfg, now, force=True)['blocks'] if b['show'] == 'book' and slot in slots_of(b)), None)
                if not block:
                    raise Refused('That slot isn’t Open door time any more.', 409)
                if not block['group']:
                    if slot in taken(reqs, did):
                        raise Refused('Someone just took that slot. Pick another.', 409)
                data.update(slot=slot, group=block['group'], about=d.get('about') if d.get('about') in t.get('about', ()) else '')
            elif t['needs'] == 'daypart':
                day = str(d.get('day') or '')
                if not DAY_RE.match(day) or not first.isoformat() <= day <= last.isoformat():
                    raise Refused('Pick a day from tomorrow on. For today, call or text.')
                if d.get('daypart') not in dayparts:
                    raise Refused('Pick a daypart.')
                data.update(day=day, daypart=d['daypart'])
            if t['needs'] != 'slot' and not data['note'] and t['id'] != 'pea':
                raise Refused('Add a line about what you need.')
            at, eid = store.next_id()
            ev = {'id': eid, 'at': at, 'type': 'request', 'by': p['id'], 'byName': p['name'], 'reqId': 'r' + eid, 'data': data}
            store.append(ev)
        print(f'[WEEK] request {t["id"]}')
        return jsonify({'id': ev['reqId']})

    def booking(r, start, cfg):
        """The Google event for an accepted request."""
        t = REQUEST_BY_ID.get(r['type']) or {}
        title = f'{t.get("label", "Hub request")}: {r["byName"]}' + (f' ({r["about"]})' if r['about'] else '')
        iso = lambda ms: local(ms).isoformat()
        return {'summary': title, 'description': (r['note'] + '\n\n' if r['note'] else '') + 'Booked through the Ops Hub.',
                'start': {'dateTime': iso(start)}, 'end': {'dateTime': iso(start + SLOT_MIN * MIN)},
                'extendedProperties': {'private': {'hubRequest': r['id'], 'hubRequestType': r['type']}}}

    @app.route('/api/week/requests/<rid>/<action>', methods=['POST'])
    def week_decide(rid, action):
        p, d = who(), body()
        if action not in ('accept', 'decline', 'cancel'):
            raise Refused('Unknown step.', 404)
        store.ensure(force=True)
        cfg = store.settings()
        with store.lock:
            r = fold(store.events.values()).get(rid)
            if not r or p['id'] not in (r['by'], r['director']):
                raise Refused('That request isn’t here any more.', 404)
            mine = p['id'] == r['director']
            if action != 'cancel' and not mine:
                raise Refused('Only the director answers a request.', 403)
            if r['status'] not in (('pending',) if action != 'cancel' else HOLDING):
                raise Refused('That request has already been answered.', 409)
            cal = (cfg['directors'].get(r['director']) or {}).get('calendarId')
            data, written = {'note': _text(d.get('note'), NOTE_MAX)}, ''
            if action == 'accept':
                start = r['slot']
                if r['type'] == 'talk' and d.get('when'):
                    try:
                        start = int(d['when'])
                    except (TypeError, ValueError):
                        raise Refused('Pick a time.')
                    if not now_ms() < start < now_ms() + 60 * 24 * 60 * MIN:
                        raise Refused('Pick a time that’s still ahead.')
                    data['when'] = start
                if start:
                    if not cal:
                        raise Refused('Your calendar isn’t connected, so the booking can’t be written to it.', 409)
                    try:
                        written = calendar.insert(cal, booking(r, start, cfg))
                    except CalendarError:
                        raise Refused('Google Calendar didn’t take the booking. Nothing was accepted; try again in a moment.', 502)
                    data['gcal'] = written
            at, eid = store.next_id()
            try:
                store.append({'id': eid, 'at': at, 'type': action, 'by': p['id'], 'byName': p['name'], 'reqId': rid, 'data': data})
            except Unavailable:
                if written:
                    try:
                        calendar.delete(cal, written)
                    except CalendarError:
                        pass
                raise
            if action == 'cancel' and r['gcal'] and cal:
                try:
                    calendar.delete(cal, r['gcal'])
                except CalendarError:
                    print('[WEEK] a cancelled booking is still on the Google calendar')
            store.mirror.pop(r['director'], None)
        print(f'[WEEK] {action}')
        return jsonify({'ok': True})

    @app.route('/api/week/calendar', methods=['PUT', 'DELETE'])
    def week_calendar():
        p = me()
        if not is_director(p):
            raise Refused('Directors connect their own calendar, signed in as themselves.', 403)
        node = ref(f'{SECURE}/directors/{p["id"]}')
        if request.method == 'DELETE':
            try:
                node.delete()
            except Exception as e:
                print(f'[WEEK] calendar not removed: {type(e).__name__}')
                raise Unavailable()
            store.mirror.pop(p['id'], None)
            store.settings(force=True)
            return jsonify({'ok': True})
        cal = _text(body().get('calendarId'), 200)
        if not CALENDAR_ID_RE.match(cal):
            raise Refused('That isn’t a shared calendar’s ID. It ends in @group.calendar.google.com; an ID that is just '
                          'your email address is your main personal calendar, which the hub never connects.')
        now = now_ms()
        monday, _, last = window(now)
        try:
            calendar.list(cal, local(day_start(monday)), local(day_start(last + timedelta(days=1))))
        except CalendarError as e:
            raise Refused('The hub can’t open that calendar yet. In Google Calendar, share it with the address above '
                          'with “Make changes to events”, then try again.' if e.status in (403, 404) else
                          'Google Calendar didn’t answer. Try again in a moment.', 409)
        try:
            node.set({'name': p['name'], 'calendarId': cal, 'at': now})
        except Exception as e:
            print(f'[WEEK] calendar not saved: {type(e).__name__}')
            raise Unavailable()
        store.mirror.pop(p['id'], None)
        store.settings(force=True)
        print('[WEEK] a director connected a calendar')
        return jsonify({'ok': True})

    @app.route('/api/week/live', methods=['PUT'])
    def week_live():
        p = me()
        if not p or p.get('role') != 'director':
            raise Refused('A director turns this on.', 403)
        live = bool(body().get('live'))
        try:
            ref(f'{SECURE}/settings').set({'live': live, 'by': p['name'], 'at': now_ms()})
        except Exception as e:
            print(f'[WEEK] switch not saved: {type(e).__name__}')
            raise Unavailable()
        store.settings(force=True)
        return jsonify({'live': live})
