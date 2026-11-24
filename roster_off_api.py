"""Off the roster (Tim, Nov 24 2026): "Instead of just clicking the X on
their roster card, it'd be nice to have an option to specify why they're
being removed and have it documented somehow."

A leader taking someone off a day's roster on Set Ups picks why: called in,
no call no show, sent home, left early, a shift swap or change, added by
mistake, or something else (a note then says what). The roster itself still
changes the way it always has (the saved `fohRoster` / `bohRoster`, through
/api/state/sync); this keeps the record of who came off, why, when and who
took them off, for good.

Who sees it: Team Leads and up, enforced here. The reasons are a leader's
business, not the team's, and the note asks for no medical details.

Storage: one Firebase record per event under rosterOff/events/<id>, written
once and never changed (the Pass's way, pass_api.py), so two servers
overlapping during a deploy can't wipe each other's work. Putting someone
back is an `undo` event naming the record it takes back. Not a saved-state
section; never goes through /api/state/sync. Each record carries the page's
own id for it (`cid`), so a phone that sends it again after losing signal
doesn't log it twice.

  GET  /api/roster-off?from=YYYY-MM-DD&to=YYYY-MM-DD[&name=]   Team Leads and up
        the records whose shift falls in those days (at most MAX_DAYS),
        newest first, and each person's count of each reason
  POST /api/roster-off/events   {type, cid, data}                Team Leads and up
        off    {date, side, name, reason, note, start, end, entry}
        undo   {of}
"""
import re
import secrets
import threading
import time
from datetime import date as _date

from flask import jsonify, request

ROOT = 'rosterOff'
LEADS = ('director', 'manager', 'admin', 'lead')
SIDES = ('foh', 'boh')
# In the order the sheet offers them. Swap and mistake aren't held against
# anyone; they're kept so the day's roster still adds up.
REASONS = {
    'callin': 'Called in',
    'noshow': 'No call, no show',
    'senthome': 'Sent home',
    'leftearly': 'Left early',
    'swap': 'Shift swap or change',
    'mistake': 'Added by mistake',
    'other': 'Something else',
}
ATTENDANCE = ('callin', 'noshow', 'leftearly', 'senthome')
EVENT_TYPES = ('off', 'undo')
MAX_DAYS = 400
MAX_BODY = 8_000
NOTE_MAX = 300
ENTRY_KEYS = ('name', 'start', 'end', 'source', 'leader', 'training', 'addedBy', 'addedAt', 'offList')


class Unavailable(Exception):
    pass


class Refused(Exception):
    def __init__(self, msg, status=400):
        super().__init__(msg)
        self.status = status


def _text(v, cap):
    return re.sub(r'\s+', ' ', str(v or '')).strip()[:cap] if isinstance(v, (str, int, float)) else ''


def _iso(v):
    v = str(v or '')
    try:
        _date.fromisoformat(v)
    except ValueError:
        return ''
    return v if re.fullmatch(r'\d{4}-\d{2}-\d{2}', v) else ''


def _entry(e, name):
    """The roster entry as it was, so Put back restores it as it stood."""
    if not isinstance(e, dict):
        return {'name': name}
    out = {}
    for k in ENTRY_KEYS:
        v = e.get(k)
        if isinstance(v, bool):
            out[k] = v
        elif isinstance(v, (int, float)) and not isinstance(v, bool):
            out[k] = v
        elif isinstance(v, str):
            out[k] = v[:80]
    blocks = e.get('blocks')
    if isinstance(blocks, list) and 1 < len(blocks) <= 6:
        out['blocks'] = [{'start': _text(b.get('start'), 12), 'end': _text(b.get('end'), 12)} for b in blocks if isinstance(b, dict)]
    out['name'] = name
    return out


def clean_off(d):
    if not isinstance(d, dict):
        raise Refused('Too much at once.')
    day, side, name = _iso(d.get('date')), d.get('side'), _text(d.get('name'), 80)
    if not day:
        raise Refused('Pick a day.')
    if side not in SIDES:
        raise Refused('Front of house or the kitchen.')
    if not name:
        raise Refused('Who is coming off the roster?')
    reason = d.get('reason')
    if reason not in REASONS:
        raise Refused('Pick why they’re coming off.')
    note = _text(d.get('note'), NOTE_MAX)
    if reason == 'other' and not note:
        raise Refused('Say why in the note.')
    return {'date': day, 'side': side, 'name': name, 'reason': reason, 'note': note,
            'start': _text(d.get('start'), 12), 'end': _text(d.get('end'), 12), 'entry': _entry(d.get('entry'), name)}


def fold(events):
    """The records still standing ({id: record}), each with who took them off."""
    out, undone = {}, {}
    for e in sorted(events, key=lambda e: e['id']):
        if e.get('type') == 'off':
            out[e['id']] = {'id': e['id'], 'cid': e.get('cid') or '', 'at': e['at'], 'by': e.get('byName') or '', **e['data']}
        elif e.get('type') == 'undo':
            undone[e['data'].get('of')] = e
    for of, e in undone.items():
        if of in out:
            del out[of]
    return out


def tally(records):
    """Each person's count of each reason, most attendance first."""
    people = {}
    for r in records:
        key = re.sub(r'\s+', ' ', r['name'].strip().lower())
        p = people.setdefault(key, {'name': r['name'], 'counts': {}, 'last': ''})
        p['counts'][r['reason']] = p['counts'].get(r['reason'], 0) + 1
        p['last'] = max(p['last'], r['date'])
    out = list(people.values())
    for p in out:
        p['attendance'] = sum(p['counts'].get(k, 0) for k in ATTENDANCE)
    out.sort(key=lambda p: (-p['attendance'], p['name'].lower()))
    return out


class Store:
    """Every event in memory, read once from Firebase and written through;
    another server's events are picked up every SYNC_SECONDS."""
    SYNC_SECONDS = 60

    def __init__(self, ref):
        self.ref = ref
        self.lock = threading.RLock()
        self.reset()

    def reset(self):
        self.events, self.loaded, self.synced, self.last_at = {}, False, 0, 0

    def ensure(self, force=False):
        if self.loaded and not force and time.time() - self.synced < self.SYNC_SECONDS:
            return
        with self.lock:
            try:
                raw = self.ref(f'{ROOT}/events').get()
            except Exception as e:
                print(f'[ROSTER OFF] not read: {type(e).__name__}')
                if self.loaded:
                    return                      # what's in memory still serves
                raise Unavailable()
            for k, v in (raw or {}).items():
                if isinstance(v, dict) and v.get('id') == k and v.get('type') in EVENT_TYPES and isinstance(v.get('data'), dict):
                    self.events.setdefault(k, v)
                    self.last_at = max(self.last_at, v.get('at') or 0)
            self.loaded, self.synced = True, time.time()

    def by_cid(self, cid):
        return next((e for e in self.events.values() if cid and e.get('cid') == cid), None)

    def next_id(self):
        at = max(int(time.time() * 1000), self.last_at + 1)
        self.last_at = at
        return at, f'{at:013d}-{secrets.token_hex(3)}'

    def append(self, ev):
        try:
            self.ref(f'{ROOT}/events/{ev["id"]}').set(ev)
        except Exception as e:
            print(f'[ROSTER OFF] event not written: {type(e).__name__}')
            raise Unavailable()
        self.events[ev['id']] = ev


def register(app, me, ref):
    """Add /api/roster-off to the app. `me()` is the signed-in person ({id,
    name, role}) or None; `ref(path)` a Firebase reference."""
    store = Store(ref)
    app.extensions['roster_off_store'] = store

    def leader():
        p = me()
        if not p:
            raise Refused('Sign in to see who came off the roster.', 401)
        if p['role'] not in LEADS:
            raise Refused('Team Leads and up see who came off the roster.', 403)
        return p

    @app.after_request
    def _roster_off_never_cached(resp):
        if request.path.startswith('/api/roster-off'):
            resp.headers['Cache-Control'] = 'no-store'
        return resp

    @app.errorhandler(Refused)
    def _roster_off_refused(err):
        return jsonify({'error': str(err)}), err.status

    @app.errorhandler(Unavailable)
    def _roster_off_unavailable(err):
        return jsonify({'error': 'Couldn’t reach the server. It’s kept on this phone and will send itself.'}), 503

    @app.route('/api/roster-off')
    def roster_off_list():
        leader()
        start, end = _iso(request.args.get('from')), _iso(request.args.get('to'))
        if not start or not end or end < start:
            raise Refused('Pick a day.')
        if (_date.fromisoformat(end) - _date.fromisoformat(start)).days > MAX_DAYS:
            raise Refused('Too many days at once.')
        name = re.sub(r'\s+', ' ', _text(request.args.get('name'), 80).lower())
        store.ensure()
        recs = [r for r in fold(store.events.values()).values()
                if start <= r['date'] <= end and (not name or re.sub(r'\s+', ' ', r['name'].strip().lower()) == name)]
        recs.sort(key=lambda r: (r['date'], r['at']), reverse=True)
        return jsonify({'records': recs, 'people': tally(recs), 'reasons': REASONS, 'attendance': list(ATTENDANCE)})

    @app.route('/api/roster-off/events', methods=['POST'])
    def roster_off_event():
        if (request.content_length or 0) > MAX_BODY:
            raise Refused('Too much at once.', 413)
        p = leader()
        body = request.get_json(silent=True) or {}
        typ, cid = body.get('type'), _text(body.get('cid'), 40)
        if typ not in EVENT_TYPES:
            raise Refused('Unknown step.')
        store.ensure()
        with store.lock:
            same = store.by_cid(cid)
            if same:                                    # sent again after losing signal: already kept
                return jsonify({'ok': True, 'id': same['id'], 'again': True})
            if typ == 'off':
                data = clean_off(body.get('data'))
            else:
                of = _text((body.get('data') or {}).get('of') if isinstance(body.get('data'), dict) else '', 40)
                if of and of not in store.events:
                    store.ensure(force=True)            # made on the other server a moment ago?
                target = store.events.get(of) or store.by_cid(of)
                if not target or target.get('type') != 'off':
                    raise Refused('That record isn’t here any more.', 404)
                data = {'of': target['id']}
            at, eid = store.next_id()
            ev = {'id': eid, 'at': at, 'type': typ, 'by': p['id'], 'byName': p['name'], 'data': data}
            if cid:
                ev['cid'] = cid
            store.append(ev)
        return jsonify({'ok': True, 'id': eid})
