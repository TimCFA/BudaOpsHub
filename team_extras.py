"""Team profiles, the admin side (Ashley's notes, Tim, Oct 28 2026): each
person's level in the restaurant, their PTO, and directors' uniform credit.
The infraction points are already the hub's (points.js, Directors → Points)
and are shown on the profile from there.

  Level    one of LEVELS, set by a director or the Admin Team; until someone
           sets it, it follows the PIN list's role (member → Team Member ...).
  PTO      hours a year for the highest certified level someone has reached
           (pto_basis: a Trainer gets a Certified Team Member's), from the
           store's chart (PTO_DEFAULT) until the table on Our Team is saved,
           then that table; from January 1,
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
  GET  /api/me/page                      the signed-in person's own page (me-page.js)
  GET  /api/team/page?name=              someone's page (directors, Admin Team)
  POST /api/me/goals                     {text}: my career goals, in my words
  POST /api/team/steps                   {name, step, done | start}: a next-level step (directors, Admin Team)

The Me page (Tim, Oct 30 2026): each person sees their own level, hire date
and birthday, their PEA, their next level (the 360 Evaluation Process: the
steps to certified pay, NEXT_LEVEL), their permit, PTO, orders and career
goals (their own words, GOALS_PATH); directors and the Admin Team open
anyone's and tick the steps (STEPS_PATH). Never contact details.
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
DIRECTOR_TIER = ('director', 'cert_director', 'executive', 'cert_executive')   # the uniform credit; never the Operator (Tim, Oct 28 2026)
CREDIT_PER_YEAR = 500
# The store's PTO chart (Tim, Oct 28 2026). Hours go with certified levels:
# everyone gets those of the highest certified level they've reached, so a
# Trainer gets a Certified Team Member's 20 until certified as a Trainer, and
# a Team Member (nothing certified yet) gets none.
CERTIFIED = tuple(k for k in LEVEL_IDS if k.startswith('cert_'))
PTO_OFF = ('operator',)          # no PTO on the profile (Tim, Oct 28 2026)
PTO_DEFAULT = {'cert_member': 20.0, 'cert_trainer': 40.0, 'cert_lead': 80.0, 'cert_director': 120.0, 'cert_executive': 140.0}

LEVELS_PATH = 'secure/teamLevels'          # {key: {name, level, by, at}}
PTO_HOURS_PATH = 'secure/ptoHours'         # {level: hours a year}
PTO_PATH = 'secure/pto'                    # {id: {name, key, date, hours, note, by, at}}
CREDIT_PATH = 'secure/uniformCredit'       # {id: {name, key, amount, date, note, status, by, at, decidedBy, decidedAt, decisionNote}}
RECEIPTS_PATH = 'secure/uniformReceipts'   # {id: data URL}
STEPS_PATH = 'secure/teamSteps'            # {key: {pathway: {done, by, at}, trial: {start, done, by, at}, coaching: {done, by, at}}}
GOALS_PATH = 'secure/teamGoals'            # {key: {name, text, at}}
GOALS_MAX = 600

# The 360 Evaluation Process (Tim, Oct 30 2026): the steps to certified pay
# at each level, and what a certified person needs for the next role. To
# move to a new role you must be certified in your current one. Step 1 is
# Pathway, step 2 the skill assessment (the PEA bar the hub checks itself,
# or a trial a leader runs), step 3 the coaching evaluation with a leader,
# step 4 certified pay.
NEXT_LEVEL = {
    'member':        {'target': 'cert_member',   'how': 'certify', 'pathway': 'New Hire and Certified Team Member (FOH or BOH) in Pathway',
                      'skill': 'On the Rise in all your PEAs within 30 days', 'auto': 'rise'},
    'cert_member':   {'target': 'trainer',       'how': 'promote', 'pathway': 'Trainer Certified in Pathway',
                      'skill': 'Crushing It on all your PEA roles', 'auto': 'crushing', 'trial': '30-day Trainer trial'},
    'trainer':       {'target': 'cert_trainer',  'how': 'certify', 'pathway': 'Trainer Certified in Pathway', 'trial': '30-day Trainer trial'},
    'cert_trainer':  {'target': 'lead',          'how': 'promote', 'pathway': 'Team Leader Certified in Pathway', 'trial': '1-quarter Team Leader trial'},
    'lead':          {'target': 'cert_lead',     'how': 'certify', 'pathway': 'Team Leader Certified in Pathway', 'trial': '1-quarter Team Leader trial'},
    'cert_lead':     {'target': 'director',      'how': 'promote', 'pathway': 'Director Certified in Pathway', 'trial': '2-quarter Director trial'},
    'director':      {'target': 'cert_director', 'how': 'certify', 'pathway': 'Director Certified in Pathway', 'trial': '2-quarter Director trial'},
    'cert_director': {'target': 'executive',     'how': 'promote', 'pathway': 'Executive Certified in Pathway', 'trial': 'Executive trial, no timeframe'},
    'executive':     {'target': 'cert_executive', 'how': 'certify', 'pathway': 'Executive Certified in Pathway', 'trial': 'Executive trial, no timeframe'},
}

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


def next_level(level, steps, pea):
    """The 360 steps for someone at `level`: {target, targetLabel, how, items:
    [{key, label, done, auto, when, by, start}]}, or None at the top."""
    n = NEXT_LEVEL.get(level)
    if not n:
        return None
    steps = steps if isinstance(steps, dict) else {}
    positions = (pea or {}).get('positions') or []
    items = [{'key': 'pathway', 'label': n['pathway'], 'done': bool((steps.get('pathway') or {}).get('done')),
              'when': (steps.get('pathway') or {}).get('at'), 'by': (steps.get('pathway') or {}).get('by')}]
    if n.get('auto'):
        ok = bool(positions) and all(p.get('tier') == 'crushing' or (n['auto'] == 'rise' and p.get('tier') == 'rise') for p in positions)
        items.append({'key': 'pea', 'label': n['skill'], 'done': ok, 'auto': True,
                      'note': f'{sum(1 for p in positions if p.get("tier") == "crushing" or (n["auto"] == "rise" and p.get("tier") == "rise"))} of {len(positions)} positions there' if positions else 'No PEA ratings yet'})
    if n.get('trial'):
        t = steps.get('trial') or {}
        items.append({'key': 'trial', 'label': n['trial'], 'done': bool(t.get('done')), 'start': t.get('start') or '', 'when': t.get('at'), 'by': t.get('by')})
    c = steps.get('coaching') or {}
    items.append({'key': 'coaching', 'label': 'Coaching evaluation with your leader', 'done': bool(c.get('done')), 'when': c.get('at'), 'by': c.get('by')})
    return {'target': n['target'], 'targetLabel': LEVEL_LABEL[n['target']], 'how': n['how'], 'items': items,
            'complete': all(i['done'] for i in items)}


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


def pto_basis(level):
    """The highest certified level at or below `level`, or None."""
    if level not in LEVEL_IDS:
        return None
    return next((k for k in reversed(LEVEL_IDS[:LEVEL_IDS.index(level) + 1]) if k in CERTIFIED), None)


def allowance_for(level, hours):
    """Hours a year at `level`: None with no level or no hours set for its basis."""
    if not level or level in PTO_OFF:
        return None
    basis = pto_basis(level)
    return 0.0 if basis is None else hours.get(basis)


def pto_summary(entries, allowance, year, level=None):
    basis = None if level in PTO_OFF else pto_basis(level)
    mine = sorted((e for e in entries if str(e.get('date', '')).startswith(year)), key=lambda e: e.get('date', ''), reverse=True)
    used = round(sum(float(e.get('hours') or 0) for e in mine), 2)
    return {'allowance': allowance, 'used': used, 'basis': LEVEL_LABEL[basis] if basis and basis != level else None, 'off': level in PTO_OFF,
            'left': None if allowance is None else round(max(0.0, allowance - used), 2), 'entries': mine}


def credit_summary(requests, year):
    mine = sorted((r for r in requests if str(r.get('date', '')).startswith(year)), key=lambda r: r.get('at', 0), reverse=True)
    used = round(sum(float(r.get('amount') or 0) for r in mine if r.get('status') == 'approved'), 2)
    pending = round(sum(float(r.get('amount') or 0) for r in mine if r.get('status') == 'pending'), 2)
    return {'perYear': CREDIT_PER_YEAR, 'used': used, 'pending': pending,
            'left': round(max(0.0, CREDIT_PER_YEAR - used), 2), 'requests': [_public(r) for r in mine]}


def _public(r):
    return {k: r.get(k) for k in ('id', 'name', 'amount', 'date', 'note', 'status', 'at', 'decidedBy', 'decidedAt', 'decisionNote', 'hasReceipt')}


def register(app, *, ref, get_all, access, me, people, key_of, today, is_owner, profile_of=None, pea_of=None, orders_of=None):
    """`access()` is a director or the Admin Team; `me()` the signed-in
    person ({name, role}) or None; `people()` the PIN list and the Directors
    list ({name, role}); `key_of(name)` a Firebase-safe key for a name;
    `today()` the store's date (YYYY-MM-DD); `is_owner()` the account owner.
    For the Me page: `profile_of(key)` the Our Team profile (hire date,
    birthday, permit), `pea_of(name)` their PEA scores (pea_mine.py),
    `orders_of(name)` their uniform orders."""

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
        hours = {k: float(v) for k, v in (hours or {}).items() if k in CERTIFIED and isinstance(v, (int, float))}
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
                        'director': lv != 'operator' and (p.get('role') == 'director' or lv in DIRECTOR_TIER)})
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
            p['pto'] = pto_summary(by_key.get(p['key'], []), allowance_for(p['level'], hours), year, p['level'])
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
            if k in CERTIFIED and v not in (None, ''):
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

    # ----- The Me page (Tim, Oct 30 2026) -----
    def page_for(name, role, own):
        levels, hours, pto, credit = read_all()
        steps, goals = get_all(STEPS_PATH, GOALS_PATH)
        k, year = key_of(name), today()[:4]
        mine = next((x for x in everyone(levels) if x['key'] == k), None)
        lv = mine['level'] if mine else level_of(levels.get(k), role)
        prof = (profile_of(k) if profile_of else None) or {}
        prof = prof if isinstance(prof, dict) else {}
        pea = pea_of(name) if pea_of else {'name': None, 'positions': []}
        my_steps = (steps or {}).get(k) if isinstance(steps, dict) else None
        goal = (goals or {}).get(k) if isinstance(goals, dict) else None
        orders = []
        for o in (orders_of(name) if orders_of else []) or []:
            lines = o.get('lines') if isinstance(o.get('lines'), list) else []
            qty = sum(int(l.get('qty') or 1) for l in lines if isinstance(l, dict)) or len(lines)
            orders.append({'at': o.get('at'), 'status': o.get('status') or 'new', 'items': qty})
        out = {'name': name, 'role': mine['role'] if mine else (role or ''), 'level': lv, 'levelLabel': LEVEL_LABEL.get(lv, ''), 'year': year, 'own': own,
               'canEdit': bool(access()), 'hireDate': prof.get('hireDate') or '', 'birthday': prof.get('birthday') or '', 'permitExpires': prof.get('permitExpires') or '',
               'pea': pea, 'next': next_level(lv, my_steps, pea), 'goals': {'text': (goal or {}).get('text') or '', 'at': (goal or {}).get('at')},
               'orders': sorted(orders, key=lambda o: str(o.get('at') or ''), reverse=True)[:6],
               'pto': pto_summary([e for e in pto.values() if e.get('key') == k], allowance_for(lv, hours), year, lv)}
        if (mine and mine['director']) or lv in DIRECTOR_TIER:
            out['credit'] = credit_summary([r for r in credit.values() if r.get('key') == k], year)
        return out

    @app.route('/api/me/page')
    def my_page():
        p = me()
        if not p or p.get('id') == 'director':
            return no_store(jsonify({'name': None}))
        return no_store(jsonify(page_for(p['name'], p.get('role'), True)))

    @app.route('/api/team/page')
    def team_page():
        need_access()
        name = _name(request.args.get('name'))
        if not name:
            raise Refused('Whose page?')
        p = me()
        return no_store(jsonify(page_for(name, '', bool(p and _name(p.get('name')).lower() == name.lower()))))

    @app.route('/api/me/goals', methods=['POST'])
    def my_goals():
        p = me()
        if not p or p.get('id') == 'director':
            raise Refused('Sign in as yourself to write your goals.', 401)
        text = _note((request.get_json(silent=True) or {}).get('text'), GOALS_MAX)
        r = ref(f'{GOALS_PATH}/{key_of(p["name"])}')
        if text:
            r.set({'name': p['name'], 'text': text, 'at': int(time.time())})
        else:
            r.delete()
        return no_store(jsonify(page_for(p['name'], p.get('role'), True)))

    @app.route('/api/team/steps', methods=['POST'])
    def team_steps():
        need_access()
        b = request.get_json(silent=True) or {}
        name, step = _name(b.get('name')), b.get('step')
        if not name:
            raise Refused('Whose step?')
        if step not in ('pathway', 'trial', 'coaching'):
            raise Refused('Which step?')
        r = ref(f'{STEPS_PATH}/{key_of(name)}')            # one record a person: their three steps
        mine = r.get()
        mine = dict(mine) if isinstance(mine, dict) else {}
        cur = dict(mine.get(step) or {}) if isinstance(mine.get(step), dict) else {}
        if 'start' in b:
            start = str(b.get('start') or '')
            if start and not DATE_RE.match(start):
                raise Refused('A date for the trial start, please.')
            cur['start'] = start
        if 'done' in b:
            cur['done'] = bool(b.get('done'))
        cur.update({'by': by_name(), 'at': int(time.time())})
        mine[step] = cur
        r.set(mine)
        return no_store(jsonify(page_for(name, '', False)))

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
               'pto': pto_summary([e for e in pto.values() if e.get('key') == k], allowance_for(lv, hours), year, lv)}
        if (mine and mine['director']) or lv in DIRECTOR_TIER:
            out['credit'] = credit_summary([r for r in credit.values() if r.get('key') == k], year)
        if can_decide():
            out['toReview'] = sum(1 for r in credit.values() if r.get('status') == 'pending' and r.get('key') != k)
        return no_store(jsonify(out))
