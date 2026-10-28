"""The Pass (Tim, Oct 28 2026): delegation for the leadership team, on the
Tasks tab. A ticket goes from the person who hands work off (the delegator)
to the one person who owns it, and moves by what each side does:

  created         delegator   a task, what done looks like, why, a due time,
                              how much authority (level 1-5), check-ins
  backbrief       owner       says it back in their own words: it's theirs
  counter         owner       asks for a different due time, with a reason
  counter_accept / counter_reject   delegator
  checkin         owner       on track / at risk / blocked, with a note
  submit          owner       turns it in with proof (words, a photo)
  verify          delegator   meets standard or elite, feedback, a lesson
  return          delegator   sends it back to redo, saying what's missing
  edit / reassign / cancel    delegator
  comment         either

A ticket is never stored as such: it's folded from its events (fold below,
the same rules as static/js/pass-engine.js; tests/test_pass.py runs both on
the same events). Each event is one record under pass/events/<id> in
Firebase, written once and never changed, so two servers overlapping during
a deploy can't wipe each other's work. Photos live apart under
pass/photos/<id> so loading the tickets never drags them along. It is not a
saved-state section and never goes through /api/state/sync.

Who someone is comes from the hub's session (app.py passes `me`); who can be
handed work is the PIN list plus the Directors list (`people`). Directors,
the manager PIN, the Admin Team and Team Leads hand work off; anyone can own
it. Team Members and Trainers see only their own tickets.

  GET  /api/pass/state?since=<cursor>   people, me, and the events (new since
                                    the cursor the last reply gave)
  POST /api/pass/events             {type, taskId?, data}: one thing someone did
  PUT  /api/pass/people             {people: [{id, wip, area}]}: open-ticket limits
  GET  /api/pass/photo/<event id>   the photo turned in with a ticket
  GET  /api/pass/count              what's waiting on me (the tab's badge)
"""
import base64
import re
import secrets
import threading
import time

from flask import Response, jsonify, request

ROOT = 'pass'
HOUR = 3600 * 1000
DAY = 24 * HOUR

LEVELS = {
    1: 'Do as directed', 2: 'Recommend', 3: 'Decide, then tell me', 4: 'Act, then report', 5: 'Own it',
}
CADENCES = ('none', 'midpoint', 'daily', 'weekly')
PRIORITIES = ('normal', 'high', 'critical')
HEALTH = ('on_track', 'at_risk', 'blocked')
AREAS = ('Hospitality & Service', 'Stewardship', 'Drive-Thru', 'Catering & Connections', 'Talent', 'Food Safety',
         'Food Quality', 'Food Cost', 'Kitchen', 'Facilities & Equipment', 'General')
OPEN = ('delegated', 'negotiating', 'accepted', 'in_progress', 'blocked', 'submitted')
WORKING = ('accepted', 'in_progress', 'blocked')
EVENT_TYPES = ('created', 'backbrief', 'counter', 'counter_accept', 'counter_reject', 'checkin', 'submit',
               'verify', 'return', 'edit', 'reassign', 'cancel', 'comment')
DELEGATES = ('director', 'manager', 'admin', 'lead')     # hub roles that hand work off
ROSTER_EDITORS = ('director', 'manager', 'admin')
DEFAULT_WIP = 4
MAX_PHOTO = 600_000         # characters of a data: URL (the page shrinks photos to ~450k)
MAX_BODY = MAX_PHOTO + 20_000
PHOTO_RE = re.compile(r'^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$')
CHECKABLE_RE = re.compile(r'\d|\bevery\b|\ball\b|\beach\b|\bzero\b|\bno\b|\bnone\b|\bby\b|\bbefore\b', re.I)


# ----- the rules (mirrors static/js/pass-engine.js) --------------------------

def _new_task(e):
    d = e.get('data') or {}
    return {
        'id': e['taskId'], 'number': d.get('number'), 'title': d.get('title', ''), 'owner': d.get('owner'),
        'delegator': e.get('by'), 'due': d.get('due') or 0, 'level': d.get('level') or 3,
        'cadence': d.get('cadence') or 'midpoint', 'priority': d.get('priority') or 'normal',
        'createdAt': e['at'], 'delegatedAt': e['at'], 'status': 'delegated', 'health': None,
        'backbrief': None, 'acceptedAt': None, 'counter': None, 'checkins': [], 'submittedAt': None,
        'returns': 0, 'rating': None, 'closedAt': None, 'onTime': None, 'lateExtension': False, 'dueChanges': 0,
    }


def _change_due(t, due, at):
    if at > t['due']:
        t['lateExtension'] = True          # moved after it was already late
    t['due'] = due
    t['dueChanges'] += 1


def apply(t, e):
    """Apply one event to a ticket; False (and nothing changed) when the rules
    don't allow it: the wrong person, or the ticket isn't at that step."""
    d = e.get('data') or {}
    s, at, typ = t['status'], e['at'], e.get('type')
    is_owner, is_del = e.get('by') == t['owner'], e.get('by') == t['delegator']
    is_open, working = s in OPEN, s in WORKING
    if typ == 'backbrief':
        if not is_owner or s != 'delegated' or not d.get('summary'):
            return False
        t.update(backbrief={'summary': d['summary'], 'at': at}, acceptedAt=at, status='accepted', health='on_track')
        return True
    if typ == 'counter':
        if not is_owner or s != 'delegated' or not d.get('due'):
            return False
        t.update(counter={'due': d['due'], 'at': at}, status='negotiating')
        return True
    if typ == 'counter_accept':
        if not is_del or s != 'negotiating':
            return False
        _change_due(t, t['counter']['due'], at)
        t.update(counter=None, status='delegated')
        return True
    if typ == 'counter_reject':
        if not is_del or s != 'negotiating':
            return False
        t.update(counter=None, status='delegated')
        return True
    if typ == 'checkin':
        if not is_owner or not working:
            return False
        h = d.get('health') if d.get('health') in HEALTH else 'on_track'
        t['checkins'].append({'at': at, 'health': h})
        t.update(health=h, status='blocked' if h == 'blocked' else 'in_progress')
        return True
    if typ == 'submit':
        if not is_owner or not working:
            return False
        t.update(submittedAt=at, status='submitted')
        return True
    if typ == 'verify':
        if not is_del or s != 'submitted':
            return False
        t.update(rating='elite' if d.get('rating') == 'elite' else 'meets', closedAt=at, status='verified',
                 onTime=t['submittedAt'] <= t['due'] and not t['lateExtension'])
        return True
    if typ == 'return':
        if not is_del or s != 'submitted':
            return False
        t['returns'] += 1
        t.update(submittedAt=None, status='in_progress', health='at_risk')
        return True
    if typ == 'edit':
        if not is_del or not is_open:
            return False
        for k in ('title', 'priority', 'cadence'):
            if isinstance(d.get(k), str) and d[k]:
                t[k] = d[k]
        if d.get('level'):
            t['level'] = min(5, max(1, int(d['level'])))
        if d.get('due') and d['due'] != t['due']:
            _change_due(t, d['due'], at)
        return True
    if typ == 'reassign':
        if not is_del or not is_open or not d.get('owner') or d['owner'] == t['owner']:
            return False
        t.update(owner=d['owner'], status='delegated', backbrief=None, acceptedAt=None, delegatedAt=at,
                 checkins=[], health=None, counter=None, submittedAt=None)
        return True
    if typ == 'cancel':
        if not is_del or not is_open:
            return False
        t.update(status='cancelled', closedAt=at)
        return True
    if typ == 'comment':
        return bool(d.get('text'))
    return False


def fold(events):
    """Tickets by id, from events in id order. An event the rules refuse is
    skipped (the server never stores one, but old data could hold one)."""
    tasks = {}
    for e in sorted(events, key=lambda x: x['id']):
        if e.get('type') == 'created':
            tasks[e['taskId']] = _new_task(e)
        elif e.get('taskId') in tasks:
            apply(tasks[e['taskId']], e)
    return tasks


def derive(t, now):
    """What the clock says about a ticket: late, check-in due, not heard."""
    is_open = t['status'] in OPEN
    late = is_open and t['status'] != 'submitted' and now > t['due']
    nxt = None
    if t['status'] in WORKING and t['cadence'] != 'none' and t['acceptedAt']:
        if t['cadence'] == 'midpoint':
            if not t['checkins']:
                nxt = t['acceptedAt'] + (t['due'] - t['acceptedAt']) / 2
        else:
            last = t['checkins'][-1]['at'] if t['checkins'] else t['acceptedAt']
            nxt = last + (DAY if t['cadence'] == 'daily' else 7 * DAY)
        if nxt is not None and nxt >= t['due']:
            nxt = None
    unheard_for = now - t['delegatedAt'] if t['status'] == 'delegated' else 0
    return {'open': is_open, 'late': late, 'nextCheckin': nxt, 'checkinDue': bool(nxt is not None and now >= nxt),
            'unheard': unheard_for > 12 * HOUR}


def clarity(d, now):
    """Seven things a clean handoff has (the meter on the Delegate sheet)."""
    outcome = str(d.get('outcome') or '').strip()
    due, level = d.get('due') or 0, d.get('level') or 3
    checks = [
        bool(d.get('owner')),
        len(str(d.get('title') or '').strip()) >= 6,
        len(outcome) >= 20,
        bool(CHECKABLE_RE.search(outcome)),
        len(str(d.get('intent') or '').strip()) >= 12,
        due > now,
        not (level <= 2 or due - now > 2 * DAY) or (d.get('cadence') or 'none') != 'none',
    ]
    return sum(checks)


def waiting_on(tasks, me, now):
    """The tab's count: tickets that need `me` to do something now."""
    n = 0
    for t in tasks.values():
        if t['status'] not in OPEN:
            continue
        r = derive(t, now)
        if t['owner'] == me and (t['status'] == 'delegated' or (t['status'] in WORKING and (r['late'] or r['checkinDue']))):
            n += 1
        elif t['delegator'] == me and t['status'] in ('submitted', 'negotiating'):
            n += 1
    return n


# ----- storage -------------------------------------------------------------

class Unavailable(Exception):
    """Firebase couldn't be read or written."""


class PassStore:
    """Every event in memory, read once from Firebase and written through
    (one record per event, never rewritten). Another server writing at the
    same time (the minute two overlap during a deploy) is picked up from
    Firebase every SYNC_SECONDS, and each event gets this server's arrival
    number, so a page asking for what's new since its last look (`cursor`)
    gets those too, whatever their ids."""
    SYNC_SECONDS = 60
    OVERLAP_MS = 10 * 60 * 1000       # how far back each sync looks for another server's events

    def __init__(self, ref):
        self.ref = ref                 # path -> reference, looked up on every call
        self.lock = threading.RLock()
        self.reset()

    def reset(self):
        self.events, self.people, self.loaded, self.last_at = {}, {}, False, 0
        self.gen, self.seq, self.order, self.synced = secrets.token_hex(4), 0, {}, 0

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
                    people = self.ref(f'{ROOT}/people').get()
                except Exception as e:
                    print(f'[PASS] not read: {type(e).__name__}')
                    raise Unavailable()
                for ev in self._valid(events):
                    self._add(ev)
                self.people = {k: v for k, v in (people or {}).items() if isinstance(v, dict)}
                self.loaded, self.synced = True, time.time()
                return
            if not force and time.time() - self.synced < self.SYNC_SECONDS:
                return
            self.synced = time.time()
            cutoff = f'{max(0, self.last_at - self.OVERLAP_MS):013d}'
            try:
                ref = self.ref(f'{ROOT}/events')
                newer = ref.order_by_key().start_at(cutoff).get() if hasattr(ref, 'order_by_key') else ref.get()
            except Exception as e:
                print(f'[PASS] sync skipped: {type(e).__name__}')   # what's in memory still serves
                return
            for ev in self._valid(newer):
                self._add(ev)

    def since(self, cursor):
        """Events after a page's cursor ("gen:seq"), or None: send everything."""
        gen, _, n = str(cursor or '').partition(':')
        if gen != self.gen or not n.isdigit():
            return None
        n = int(n)
        return [e for e in self.events.values() if self.order[e['id']] > n]

    def cursor(self):
        return f'{self.gen}:{self.seq}'

    def next_id(self):
        at = max(int(time.time() * 1000), self.last_at + 1)    # strictly increasing on this server
        self.last_at = at
        return at, f'{at:013d}-{secrets.token_hex(3)}'

    def append(self, ev):
        try:
            self.ref(f'{ROOT}/events/{ev["id"]}').set(ev)
        except Exception as e:
            print(f'[PASS] event not written: {type(e).__name__}')
            raise Unavailable()
        self._add(ev)


# ----- cleaning what the page sends -------------------------------------------

def _text(v, cap):
    return re.sub(r'[ \t]+', ' ', str(v or '')).strip()[:cap] if isinstance(v, (str, int, float)) else ''


def _ms(v):
    try:
        v = int(v)
    except (TypeError, ValueError):
        return 0
    return v if 1_500_000_000_000 < v < 4_000_000_000_000 else 0


class Refused(Exception):
    def __init__(self, msg, status=400):
        super().__init__(msg)
        self.status = status


def _clean(typ, d, people_ids, me, now):
    """The data an event may carry, cleaned, or Refused."""
    d = d if isinstance(d, dict) else {}
    if typ == 'created':
        out = {'title': _text(d.get('title'), 160), 'outcome': _text(d.get('outcome'), 600),
               'intent': _text(d.get('intent'), 600), 'owner': str(d.get('owner') or ''), 'due': _ms(d.get('due')),
               'level': d.get('level') if d.get('level') in LEVELS else 3,
               'cadence': d.get('cadence') if d.get('cadence') in CADENCES else 'midpoint',
               'priority': d.get('priority') if d.get('priority') in PRIORITIES else 'normal',
               'area': d.get('area') if d.get('area') in AREAS else ''}
        if not out['title']:
            raise Refused('Name the task.')
        if out['owner'] not in people_ids:
            raise Refused('Pick who owns it.')
        if out['owner'] == me:
            raise Refused('Hand it to someone else.')
        if out['due'] <= now:
            raise Refused('Set a due time in the future.')
        return out
    if typ == 'backbrief':
        out = {'summary': _text(d.get('summary'), 600), 'plan': _text(d.get('plan'), 600)}
        if not out['summary']:
            raise Refused('Say it back in your own words.')
        return out
    if typ == 'counter':
        out = {'due': _ms(d.get('due')), 'reason': _text(d.get('reason'), 400)}
        if out['due'] <= now:
            raise Refused('Pick a time in the future.')
        return out
    if typ == 'checkin':
        return {'health': d.get('health') if d.get('health') in HEALTH else 'on_track', 'note': _text(d.get('note'), 600)}
    if typ == 'submit':
        out = {'evidence': _text(d.get('evidence'), 1000)}
        photo = d.get('photo')
        if photo:
            if not isinstance(photo, str) or len(photo) > MAX_PHOTO or not PHOTO_RE.match(photo):
                raise Refused('That photo is too big or couldn’t be read. Try another.')
            out['photo'] = photo
        if not out['evidence'] and not photo:
            raise Refused('Say what you did, or add a photo.')
        return out
    if typ == 'verify':
        return {'rating': 'elite' if d.get('rating') == 'elite' else 'meets',
                'feedback': _text(d.get('feedback'), 600), 'aar': _text(d.get('aar'), 600)}
    if typ == 'return':
        out = {'feedback': _text(d.get('feedback'), 600)}
        if not out['feedback']:
            raise Refused('Say what’s missing.')
        return out
    if typ == 'edit':
        out = {}
        if d.get('due'):
            out['due'] = _ms(d['due'])
            if not out['due']:
                raise Refused('Pick a due time.')
        if d.get('level') in LEVELS:
            out['level'] = d['level']
        if d.get('cadence') in CADENCES:
            out['cadence'] = d['cadence']
        if d.get('priority') in PRIORITIES:
            out['priority'] = d['priority']
        if not out:
            raise Refused('Nothing to change.')
        return out
    if typ == 'reassign':
        owner = str(d.get('owner') or '')
        if owner not in people_ids:
            raise Refused('Pick who owns it now.')
        return {'owner': owner}
    if typ == 'cancel':
        return {'reason': _text(d.get('reason'), 400)}
    if typ == 'comment':
        out = {'text': _text(d.get('text'), 600)}
        if not out['text']:
            raise Refused('Write the note first.')
        return out
    return {}


# ----- routes ---------------------------------------------------------------

def register(app, me, people, ref):
    """Add /api/pass to the app. `me()` is the signed-in person ({id, name,
    role}) or None; `people()` everyone who can be handed work ({id, name,
    role}); `ref(path)` a Firebase reference."""
    store = PassStore(ref)
    app.extensions['pass_store'] = store

    def now_ms():
        return int(time.time() * 1000)

    def roster():
        extra = store.people
        out = []
        for p in people():
            x = extra.get(p['id']) or {}
            wip = x.get('wip') if isinstance(x.get('wip'), int) and 1 <= x['wip'] <= 20 else DEFAULT_WIP
            out.append({**p, 'wip': wip, 'area': x.get('area') if x.get('area') in AREAS else ''})
        return out

    def who():
        p = me()
        if not p:
            raise Refused('Sign in to use the Pass.', 401)
        return p

    @app.after_request
    def _never_cached(resp):
        if request.path.startswith('/api/pass/') and not request.path.startswith('/api/pass/photo/'):
            resp.headers['Cache-Control'] = 'no-store'
        return resp

    @app.errorhandler(Refused)
    def _refused(err):
        return jsonify({'error': str(err)}), err.status

    @app.errorhandler(Unavailable)
    def _unavailable(err):
        return jsonify({'error': 'The Pass couldn’t reach the server. Try again in a moment.'}), 503

    def visible(p, events):
        """Team Members and Trainers see their own tickets only."""
        if p['role'] in DELEGATES:
            return events
        tasks = fold(store.events.values())
        mine = {k for k, t in tasks.items() if p['id'] in (t['owner'], t['delegator'])}
        return [e for e in events if e.get('taskId') in mine]

    @app.route('/api/pass/state')
    def pass_state():
        p = who()
        store.ensure()
        lead = p['role'] in DELEGATES
        newer = store.since(request.args.get('since')) if lead else None
        events = sorted(store.events.values() if newer is None else newer, key=lambda e: e['id'])
        ppl = roster()
        if not lead:                        # who's who on their own tickets, not the whole list's limits
            ppl = [{k: x[k] for k in ('id', 'name', 'role')} for x in ppl]
        return jsonify({'serverTime': now_ms(), 'full': newer is None, 'cursor': store.cursor(),
                        'me': {'id': p['id'], 'name': p['name'], 'role': p['role'],
                               'canDelegate': lead, 'canEditRoster': p['role'] in ROSTER_EDITORS},
                        'people': ppl, 'events': visible(p, events)})

    @app.route('/api/pass/count')
    def pass_count():
        p = me()
        if not p:
            return jsonify({'count': 0})
        store.ensure()
        return jsonify({'count': waiting_on(fold(store.events.values()), p['id'], now_ms())})

    @app.route('/api/pass/events', methods=['POST'])
    def pass_event():
        if (request.content_length or 0) > MAX_BODY:
            return jsonify({'error': 'That photo is too big. Try another.'}), 413
        p = who()
        store.ensure()
        body = request.get_json(silent=True) or {}
        typ = body.get('type')
        if typ not in EVENT_TYPES:
            raise Refused('Unknown step.')
        ppl = {x['id']: x for x in roster()}
        with store.lock:
            now = now_ms()
            data = _clean(typ, body.get('data'), set(ppl), p['id'], now)
            photo = data.pop('photo', None)
            tasks = fold(store.events.values())
            if typ == 'created':
                if p['role'] not in DELEGATES:
                    raise Refused('Team Leads and Directors hand work off.', 403)
                data['clarity'] = clarity(data, now)
                data['number'] = max([t['number'] or 0 for t in tasks.values()] or [0]) + 1
                data['ownerName'] = ppl[data['owner']]['name']
                task_id = None
            else:
                task_id = str(body.get('taskId') or '')
                if task_id not in tasks:                # made on the other server a moment ago?
                    store.ensure(force=True)
                    tasks = fold(store.events.values())
                if task_id not in tasks:
                    raise Refused('That ticket isn’t here any more.', 404)
                if typ == 'reassign':
                    data['ownerName'] = ppl[data['owner']]['name']
            at, eid = store.next_id()
            ev = {'id': eid, 'at': at, 'type': typ, 'by': p['id'], 'byName': p['name'],
                  'taskId': task_id or 't' + eid, 'data': data}
            if photo:
                ev['data']['photo'] = True
            if typ != 'created' and not apply(dict(tasks[task_id], checkins=list(tasks[task_id]['checkins'])), ev):
                raise Refused('That ticket moved on. Here is where it stands now.', 409)
            if photo:
                try:
                    ref(f'{ROOT}/photos/{eid}').set(photo)
                except Exception as e:
                    print(f'[PASS] photo not written: {type(e).__name__}')
                    raise Unavailable()
            store.append(ev)
        print(f'[PASS] {typ} {ev["taskId"]}')
        return jsonify(ev)

    @app.route('/api/pass/people', methods=['PUT'])
    def pass_people():
        p = who()
        if p['role'] not in ROSTER_EDITORS:
            raise Refused('Directors and the Admin Team set the limits.', 403)
        store.ensure()
        rows = (request.get_json(silent=True) or {}).get('people')
        if not isinstance(rows, list):
            raise Refused('Nothing to save.')
        known = {x['id'] for x in people()}
        with store.lock:
            for r in rows:
                if not isinstance(r, dict) or r.get('id') not in known:
                    continue
                try:
                    wip = min(20, max(1, int(r.get('wip') or DEFAULT_WIP)))
                except (TypeError, ValueError):
                    wip = DEFAULT_WIP
                rec = {'wip': wip, 'area': r.get('area') if r.get('area') in AREAS else ''}
                if store.people.get(r['id']) == rec:
                    continue
                try:
                    ref(f'{ROOT}/people/{r["id"]}').set(rec)
                except Exception as e:
                    print(f'[PASS] limits not written: {type(e).__name__}')
                    raise Unavailable()
                store.people[r['id']] = rec
        return jsonify({'people': roster()})

    @app.route('/api/pass/photo/<eid>')
    def pass_photo(eid):
        p = who()
        store.ensure()
        ev = store.events.get(eid)
        if not ev or not (ev.get('data') or {}).get('photo') or not visible(p, [ev]):
            return jsonify({'error': 'No photo'}), 404
        try:
            raw = ref(f'{ROOT}/photos/{eid}').get()
        except Exception:
            raise Unavailable()
        m = PHOTO_RE.match(raw or '') if isinstance(raw, str) else None
        if not m:
            return jsonify({'error': 'No photo'}), 404
        return Response(base64.b64decode(m.group(2)), mimetype=f'image/{m.group(1)}',
                        headers={'Cache-Control': 'private, max-age=86400'})

    return store
