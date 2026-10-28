"""Team profiles, the admin side (Ashley's notes, Tim, Oct 28 2026): each
person's level in the restaurant, their PTO, and directors' uniform credit.
The infraction points are already the hub's (points.js, Directors → Points)
and are shown on the profile from there.

  Level    one of LEVELS, set by a director or the Admin Team; until someone
           sets it, it follows the PIN list's role (member → Team Member ...).
  PTO      hours a year by level (PTO_DEFAULT, the store's chart, until the
           table on Our Team is saved; then that table), from January 1,
           unused hours don't carry over. The Admin Team logs PTO taken (a
           date, hours, a note); used and left add up from those.
  Credit   directors get CREDIT_PER_YEAR a calendar year for uniforms, unused
           money doesn't carry over. A director sends a request (amount, the
           receipt's date, a note, a photo of the receipt, always); the Admin
           Team approves or denies it, and only approved ones spend the credit.
           The receipt stays on file for expense reports.

Everything here is HR data: under secure/ in Firebase, read and written only
through these routes, by a director or the Admin Team, and by each person for
their own (/api/me/extras, which never carries anyone else's).

  GET  /api/team/extras                  everyone's (directors, Admin Team)
  POST /api/team/level                   {name, level}
  POST /api/team/pto-hours               {hours: {level: n}}
  POST /api/team/pto                     {name, date, hours, note} | {id, remove: true}
  POST /api/team/credit                  {amount, date, note, receipt}: a director's own
  POST /api/team/credit/decide           {id, decision: approved | denied, note}: Admin Team
  GET  /api/team/credit/receipt/<id>     the photo
  GET  /api/me/extras                    the signed-in person's own
"""
import base64
import re
import secrets
import time
from datetime import datetime

from flask import Response, jsonify, request

LEVELS = (
    ('member', 'Team Member'), ('cert_member', 'Certified Team Member'),
    ('trainer', 'Trainer'), ('cert_trainer', 'Certified Trainer'),
    ('lead', 'Team Lead'), ('cert_lead', 'Certified Team Lead'),
    ('director', 'Director'), ('cert_director', 'Certified Director'),
    ('executive', 'Executive'), ('cert_executive', 'Certified Executive'),
    ('operator', 'Operator'),
)
LEVEL_IDS = tuple(k for k, _ in LEVELS)
LEVEL_LABEL = dict(LEVELS)
FROM_ROLE = {'member': 'member', 'trainer': 'trainer', 'lead': 'lead', 'director': 'director'}
DIRECTOR_TIER = ('director', 'cert_director', 'executive', 'cert_executive', 'operator')
CREDIT_PER_YEAR = 500
# The store's PTO chart (Tim, Oct 28 2026): only certified levels get PTO.
# The Operator isn't on it, so has none set.
PTO_DEFAULT = {'cert_executive': 140.0, 'cert_director': 120.0, 'cert_lead': 80.0, 'cert_trainer': 40.0, 'cert_member': 20.0,
               'member': 0.0, 'trainer': 0.0, 'lead': 0.0, 'director': 0.0, 'executive': 0.0}

LEVELS_PATH = 'secure/teamLevels'          # {key: {name, level, by, at}}
PTO_HOURS_PATH = 'secure/ptoHours'         # {level: hours a year}
PTO_PATH = 'secure/pto'                    # {id: {name, key, date, hours, note, by, at}}
CREDIT_PATH = 'secure/uniformCredit'       # {id: {name, key, amount, date, note, status, by, at, decidedBy, decidedAt, decisionNote}}
RECEIPTS_PATH = 'secure/uniformReceipts'   # {id: data URL}

MAX_RECEIPT = 1_400_000                    # characters of a data: URL (the page shrinks photos to well under)
RECEIPT_RE = re.compile(r'^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$')
DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


class Refused(Exception):
    def __init__(self, msg, status=400):
        super().__init__(msg)
        self.status = status


def _name(v):
    return re.sub(r'\s+', ' ', str(v or '')).strip()[:80]


def _note(v, cap=400):
    return re.sub(r'[ \t]+', ' ', str(v or '')).strip()[:cap]


def _num(v, lo, hi):
    try:
        x = round(float(v), 2)
    except (TypeError, ValueError):
        return None
    return x if lo <= x <= hi else None


def level_of(rec, role):
    """The level set on someone, else the one their PIN-list role means."""
    lv = (rec or {}).get('level')
    return lv if lv in LEVEL_IDS else FROM_ROLE.get(role)


def pto_summary(entries, allowance, year):
    mine = sorted((e for e in entries if str(e.get('date', '')).startswith(year)), key=lambda e: e.get('date', ''), reverse=True)
    used = round(sum(float(e.get('hours') or 0) for e in mine), 2)
    return {'allowance': allowance, 'used': used,
            'left': None if allowance is None else round(max(0.0, allowance - used), 2), 'entries': mine}


def credit_summary(requests, year):
    mine = sorted((r for r in requests if str(r.get('date', '')).startswith(year)), key=lambda r: r.get('at', 0), reverse=True)
    used = round(sum(float(r.get('amount') or 0) for r in mine if r.get('status') == 'approved'), 2)
    pending = round(sum(float(r.get('amount') or 0) for r in mine if r.get('status') == 'pending'), 2)
    return {'perYear': CREDIT_PER_YEAR, 'used': used, 'pending': pending,
            'left': round(max(0.0, CREDIT_PER_YEAR - used), 2), 'requests': [_public(r) for r in mine]}


def _public(r):
    return {k: r.get(k) for k in ('id', 'name', 'amount', 'date', 'note', 'status', 'at', 'decidedBy', 'decidedAt', 'decisionNote', 'hasReceipt')}


def register(app, *, ref, get_all, access, me, people, key_of, today, is_owner):
    """`access()` is a director or the Admin Team; `me()` the signed-in
    person ({name, role}) or None; `people()` the PIN list and the Directors
    list ({name, role}); `key_of(name)` a Firebase-safe key for a name;
    `today()` the store's date (YYYY-MM-DD); `is_owner()` the account owner."""

    def no_store(resp):
        resp.headers['Cache-Control'] = 'no-store'
        return resp

    @app.errorhandler(Refused)
    def _refused(err):
        return jsonify({'error': str(err)}), err.status

    def need_access():
        if not access():
            raise Refused('Directors and the Admin Team only.', 403)

    def by_name():
        p = me()
        return (p['name'] if p else '') or 'Director'

    def can_decide():
        p = me()
        return bool(p and (p['role'] == 'admin' or is_owner()))

    def read_all():
        levels, hours, pto, credit = get_all(LEVELS_PATH, PTO_HOURS_PATH, PTO_PATH, CREDIT_PATH)
        clean = lambda d: {k: dict(v, id=k) for k, v in (d or {}).items() if isinstance(v, dict)}
        hours = PTO_DEFAULT if hours is None else hours
        hours = {k: float(v) for k, v in (hours or {}).items() if k in LEVEL_IDS and isinstance(v, (int, float))}
        return clean(levels), hours, clean(pto), clean(credit)

    def everyone(levels):
        out, seen = [], set()
        for p in people():
            k = key_of(p['name'])
            if k in seen:
                continue
            seen.add(k)
            lv = level_of(levels.get(k), p.get('role'))
            out.append({'name': p['name'], 'key': k, 'role': p.get('role') or 'member', 'level': lv,
                        'levelSet': bool((levels.get(k) or {}).get('level')),
                        'director': p.get('role') == 'director' or lv in DIRECTOR_TIER})
        return out

    @app.route('/api/team/extras')
    def team_extras():
        need_access()
        levels, hours, pto, credit = read_all()
        year = today()[:4]
        ppl = everyone(levels)
        by_key = {}
        for e in pto.values():
            by_key.setdefault(e.get('key'), []).append(e)
        creq = {}
        for r in credit.values():
            creq.setdefault(r.get('key'), []).append(r)
        for p in ppl:
            p['pto'] = pto_summary(by_key.get(p['key'], []), hours.get(p['level']) if p['level'] else None, year)
            if p['director']:
                p['credit'] = credit_summary(creq.get(p['key'], []), year)
        pending = sorted((_public(r) for r in credit.values() if r.get('status') == 'pending'), key=lambda r: r.get('at') or 0)
        return no_store(jsonify({'year': year, 'levels': [{'id': k, 'label': v} for k, v in LEVELS], 'ptoHours': hours,
                                 'people': ppl, 'pending': pending, 'canDecide': can_decide(), 'creditPerYear': CREDIT_PER_YEAR}))

    @app.route('/api/team/level', methods=['POST'])
    def team_level():
        need_access()
        b = request.get_json(silent=True) or {}
        name, level = _name(b.get('name')), b.get('level')
        if not name:
            raise Refused('Whose level?')
        r = ref(f'{LEVELS_PATH}/{key_of(name)}')
        if level in (None, ''):
            r.delete()
        elif level in LEVEL_IDS:
            r.set({'name': name, 'level': level, 'by': by_name(), 'at': int(time.time())})
        else:
            raise Refused('Pick a level from the list.')
        print(f'[TEAM] level set: {LEVEL_LABEL.get(level, "from the PIN list")}')
        return team_extras()

    @app.route('/api/team/pto-hours', methods=['POST'])
    def team_pto_hours():
        need_access()
        hours = (request.get_json(silent=True) or {}).get('hours')
        if not isinstance(hours, dict):
            raise Refused('Nothing to save.')
        out = {}
        for k, v in hours.items():
            if k in LEVEL_IDS and v not in (None, ''):
                n = _num(v, 0, 2000)
                if n is None:
                    raise Refused('Hours as a number from 0 to 2000.')
                out[k] = n
        ref(PTO_HOURS_PATH).set(out)
        return team_extras()

    @app.route('/api/team/pto', methods=['POST'])
    def team_pto():
        need_access()
        b = request.get_json(silent=True) or {}
        if b.get('remove'):
            eid = str(b.get('id') or '')
            if not re.fullmatch(r'[\w-]{6,40}', eid):
                raise Refused('Which entry?')
            ref(f'{PTO_PATH}/{eid}').delete()
            return team_extras()
        name, date, hours = _name(b.get('name')), str(b.get('date') or ''), _num(b.get('hours'), 0.25, 400)
        if not name:
            raise Refused('Pick who took the PTO.')
        if not DATE_RE.match(date):
            raise Refused('Pick the day.')
        if hours is None:
            raise Refused('Hours as a number, like 8 or 4.5.')
        eid = f'{int(time.time() * 1000):013d}-{secrets.token_hex(3)}'
        ref(f'{PTO_PATH}/{eid}').set({'name': name, 'key': key_of(name), 'date': date, 'hours': hours,
                                      'note': _note(b.get('note')), 'by': by_name(), 'at': int(time.time())})
        print('[TEAM] PTO logged')
        return team_extras()

    @app.route('/api/team/credit', methods=['POST'])
    def team_credit():
        p = me()
        if not p or p.get('id') == 'director':
            raise Refused('Sign in as yourself to send a uniform credit request.', 401)
        b = request.get_json(silent=True) or {}
        levels, _, _, credit = read_all()
        mine = next((x for x in everyone(levels) if x['key'] == key_of(p['name'])), None)
        if not mine or not mine['director']:
            raise Refused('The uniform credit is for directors.', 403)
        amount, date, receipt = _num(b.get('amount'), 0.01, CREDIT_PER_YEAR), str(b.get('date') or ''), b.get('receipt')
        if amount is None:
            raise Refused(f'The amount, up to ${CREDIT_PER_YEAR}.')
        if not DATE_RE.match(date) or date > today():
            raise Refused('The receipt’s date.')
        if not isinstance(receipt, str) or len(receipt) > MAX_RECEIPT or not RECEIPT_RE.match(receipt):
            raise Refused('Add a photo of the receipt.')
        year = date[:4]
        left = credit_summary([r for r in credit.values() if r.get('key') == mine['key']], year)['left']
        if amount > left:
            raise Refused(f'That’s more than the ${left:g} left for {year}.')
        rid = f'{int(time.time() * 1000):013d}-{secrets.token_hex(3)}'
        ref(f'{RECEIPTS_PATH}/{rid}').set(receipt)
        ref(f'{CREDIT_PATH}/{rid}').set({'name': p['name'], 'key': mine['key'], 'amount': amount, 'date': date,
                                         'note': _note(b.get('note')), 'status': 'pending', 'hasReceipt': True,
                                         'by': p['name'], 'at': int(time.time())})
        print('[TEAM] uniform credit request sent')
        return my_extras()

    @app.route('/api/team/credit/decide', methods=['POST'])
    def team_credit_decide():
        if not can_decide():
            raise Refused('The Admin Team approves uniform credit.', 403)
        b = request.get_json(silent=True) or {}
        rid, decision = str(b.get('id') or ''), b.get('decision')
        if decision not in ('approved', 'denied') or not re.fullmatch(r'[\w-]{6,40}', rid):
            raise Refused('Approve or deny.')
        r = ref(f'{CREDIT_PATH}/{rid}')
        rec = r.get()
        if not isinstance(rec, dict):
            raise Refused('That request is gone.', 404)
        if rec.get('status') != 'pending':
            raise Refused('That request was already decided.', 409)
        p = me()
        if p and key_of(p['name']) == rec.get('key'):
            raise Refused('Someone else on the Admin Team decides your own request.', 403)
        rec.update(status=decision, decidedBy=by_name(), decidedAt=int(time.time()), decisionNote=_note(b.get('note')))
        r.set(rec)
        print(f'[TEAM] uniform credit {decision}')
        return team_extras()

    @app.route('/api/team/credit/receipt/<rid>')
    def team_credit_receipt(rid):
        if not re.fullmatch(r'[\w-]{6,40}', rid):
            return jsonify({'error': 'No receipt'}), 404
        rec = ref(f'{CREDIT_PATH}/{rid}').get()
        p = me()
        own = isinstance(rec, dict) and p and key_of(p['name']) == rec.get('key')
        if not (access() or own):
            return jsonify({'error': 'Directors and the Admin Team only.'}), 403
        raw = ref(f'{RECEIPTS_PATH}/{rid}').get()
        m = RECEIPT_RE.match(raw) if isinstance(raw, str) else None
        if not m:
            return jsonify({'error': 'No receipt'}), 404
        return Response(base64.b64decode(m.group(2)), mimetype=f'image/{m.group(1)}', headers={'Cache-Control': 'private, max-age=3600'})

    @app.route('/api/me/extras')
    def my_extras():
        p = me()
        if not p or p.get('id') == 'director':
            return no_store(jsonify({'name': None}))
        levels, hours, pto, credit = read_all()
        k, year = key_of(p['name']), today()[:4]
        mine = next((x for x in everyone(levels) if x['key'] == k), None)
        lv = mine['level'] if mine else level_of(levels.get(k), p.get('role'))
        out = {'name': p['name'], 'level': lv, 'levelLabel': LEVEL_LABEL.get(lv, ''), 'year': year,
               'pto': pto_summary([e for e in pto.values() if e.get('key') == k], hours.get(lv) if lv else None, year)}
        if (mine and mine['director']) or lv in DIRECTOR_TIER:
            out['credit'] = credit_summary([r for r in credit.values() if r.get('key') == k], year)
        if can_decide():
            out['toReview'] = sum(1 for r in credit.values() if r.get('status') == 'pending' and r.get('key') != k)
        return no_store(jsonify(out))
