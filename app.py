from datetime import date, datetime, timedelta, timezone
from collections import Counter, defaultdict
import gzip
import hmac
import json
import os
import secrets
import threading
import time

from flask import Flask, request, jsonify, send_file, session
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import firebase_admin
from firebase_admin import credentials, db

from pea_parser import parse_pea_pdf, PeaParseError
from reports_parser import parse_report_file, ReportParseError
import levelset_sync
from state_patch import PatchError, apply_ops, canon, check_ops, union_merge
import setup_feed
import briefing_feed

app = Flask(__name__)
# The page is served from this same app, so it needs no cross-site access.
# Another site may call the API only if it's listed in ALLOWED_ORIGINS
# (comma-separated); by default none can read the replies.
_allowed_origins = [o.strip() for o in os.environ.get('ALLOWED_ORIGINS', '').split(',') if o.strip()]
if _allowed_origins:
    CORS(app, origins=_allowed_origins)

# ===== SESSION / AUTH CONFIG =====
app.secret_key = os.environ.get('FLASK_SECRET_KEY')
if not app.secret_key:
    print('[STARTUP WARNING] FLASK_SECRET_KEY is not set — set it in Render env vars. '
          'Falling back to a random key, which means every manager gets logged out on each restart/deploy.')
    app.secret_key = os.urandom(32)

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_SECURE=True,          # Render serves HTTPS; set False only for local http testing
    PERMANENT_SESSION_LIFETIME=timedelta(hours=12),
)

# Fields that require an authenticated manager session to change. A
# change-based save (/api/state/patch) drops changes to these without one;
# the whole-section saves from older pages compare old vs. new per key. The
# product bookkeeping keys travel with `products` so a non-manager save
# can't leave them out of step with the stored list.
MANAGER_ONLY_KEYS = {
    'wasteTarget', 'safeTarget', 'products',
    'deletedProductIds', 'productFixesVersion', 'productCategoryOrder',
    'lxPillars', 'lxMetrics', 'lxLastUpdated',
    'gxData', 'txData', 'homeData', 'storeEvents', 'directors', 'leaderRoster', 'peaGoals',
    'peaRatings', 'peaNameAliases',
    'dataUploadLog', 'dataUploadSettings', 'productivityProfiles', 'reportData',
    'launchMode',
    # People data (below): private, so only a manager session changes it.
    'eoiSubmissions', 'trainerTrainees', 'trainerProgress', 'teamLeadTrainees',
    'teamLeadProgress', 'scoreboardItems', 'leaderNotes', 'leaderFocus',
    # Sales and labor history (below): private, so only a manager session changes it.
    'salesHistory', 'forecastSettings', 'forecastLog', 'daypartWeeks',
    # Uniform orders (below): names and paycheck deductions, so only a manager session.
    'uniformOrders', 'uniformCatalog',
}

# Sections sent only to a manager session: PEA ratings, people data
# (Expression of Interest submissions, trial progress), safe counts and the
# daily sales and labor history behind the Forecast page. Anyone else gets
# every other section. The keys in pea, people and forecast are manager-only
# above; safe counts are append-only below, since leaders log them from any
# device.
PRIVATE_SECTIONS = ('pea', 'people', 'safe', 'forecast', 'orders')

# Keys a device without a manager session may add to but never change or
# remove. It isn't sent these (they're private), so what it sends can only be
# new entries; anything else is dropped.
APPEND_ONLY_KEYS = {'safeCounts'}

# Keys that moved to another section: {key: (old section, new section)}.
# Stored data is moved on the first read, and a page still running the old
# code has its changes to them filed under the new section (as additions).
MOVED_KEYS = {'safeCounts': ('ops', 'safe')}

def _append_only_ops(ops):
    """Changes to append-only keys reduced to additions: a list's new items.
    A whole list sent as a value counts as adding each of its items."""
    out = []
    for op in ops:
        if op['p'][0] not in APPEND_ONLY_KEYS:
            out.append(op)
            continue
        if len(op['p']) != 1:
            continue
        if op['o'] == 'arr' and op.get('add'):
            # Additions only: never "replace the record with this id".
            out.append({'o': 'arr', 'p': op['p'], 'add': [{k: v for k, v in a.items() if k != 'rep'} for a in op['add']]})
        elif op['o'] == 'set' and isinstance(op.get('v'), list):
            counts = Counter(canon(v) for v in op['v'])
            items, seen = [], set()
            for v in op['v']:
                k = canon(v)
                if k not in seen:
                    seen.add(k)
                    items.append({'v': v, 'n': counts[k], 'i': 0, 'end': True})
            if items:
                out.append({'o': 'arr', 'p': op['p'], 'add': items})
    return out

def _changed_manager_fields(old_state, new_state):
    return sorted(
        key for key in MANAGER_ONLY_KEYS
        if json.dumps(old_state.get(key), sort_keys=True) != json.dumps(new_state.get(key), sort_keys=True)
    )

def _keep_stored_manager_fields(old_state, new_state):
    for key in MANAGER_ONLY_KEYS:
        if key in old_state:
            new_state[key] = old_state[key]
        else:
            new_state.pop(key, None)
    return new_state

# ===== SAVED STATE, IN SECTIONS =====
# The app's data is stored as one JSON string per section under state/<name>,
# so a save sends only the sections that changed (a Set Ups tap no longer
# re-sends PEA ratings, history, Sales Mix, ...). This map must match
# STATE_SECTIONS in static/js/storage.js (tests/test_state.py checks it).
# A key in no section goes to 'misc'.
STATE_ROOT = 'state'
STATE_SECTIONS = {
    'manager': ['wasteTarget', 'safeTarget', 'products', 'deletedProductIds', 'productFixesVersion',
                'productCategoryOrder', 'lxPillars', 'lxMetrics', 'lxLastUpdated', 'gxData', 'txData',
                'homeData', 'dataUploadLog', 'dataUploadSettings', 'productivityProfiles', 'reportData',
                'launchMode', 'storeEvents', 'directors', 'leaderRoster', 'peaGoals'],
    'pea': ['peaRatings', 'peaNameAliases'],
    'rosters': ['fohRoster', 'bohRoster', 'rosterPosted', 'truckShifts', 'adminShifts'],
    'setups': ['posAssignments', 'posVacancyFlags', 'setupDayTypes', 'lastUpdated',
               'breakCountdowns', 'completedBreaks', 'zoneOwners', 'posNotes'],
    'history': ['setupHistory', 'numbersHistory', 'wasteMonthlyHistory', 'zoneChecklistHistory'],
    'waste': ['entries', 'wasteDays', 'formDone', 'formDoneDate', 'wasteLogLastClosedOut'],
    'ops': ['foodSafetyDays', 'foodSafetyWalkthroughs', 'fohOEDays', 'fohOEChecked', 'fohOECheckedDate',
            'fohLeaderTransitionChecked', 'fohLeaderTransitionDate', 'zoneChecklistState',
            'numbersData'],
    'safe': ['safeCounts'],
    'people': ['eoiSubmissions', 'trainerTrainees', 'trainerProgress', 'teamLeadTrainees',
               'teamLeadProgress', 'scoreboardItems', 'leaderNotes', 'leaderFocus'],
    'prep': ['prepBuffers', 'prepSoldEntries', 'prepWasteEntries', 'prepStockoutEvents', 'prepHistorySeeded'],
    'prepTimes': ['prepTimes', 'prepTimers'],
    'cem': ['cemEntries'],
    'forecast': ['salesHistory', 'forecastSettings', 'forecastLog', 'daypartWeeks'],
    'orders': ['uniformOrders', 'uniformCatalog'],
    'misc': [],
}
SECTION_OF_KEY = {key: name for name, keys in STATE_SECTIONS.items() for key in keys}

def _split_state(state):
    sections = {name: {} for name in STATE_SECTIONS}
    for key, value in state.items():
        sections[SECTION_OF_KEY.get(key, 'misc')][key] = value
    return sections

# The latest saved data is kept in memory with a version tag per section, so
# a page asking "anything new?" costs Firebase nothing, and a save applies its
# changes to the latest data. Page loads re-read Firebase (as before), which
# also picks up any change made outside the app. This assumes one server
# process (Render runs `gunicorn app:app`: one worker); the lock covers
# threads within it.
_state_lock = threading.RLock()
_cache = {}            # section name -> {'data': dict, 'ver': str}
_cache_ready = False
BUILD = (os.environ.get('RENDER_GIT_COMMIT') or '')[:12] or format(int(time.time()), 'x')

def _new_version():
    return format(int(time.time() * 1000), 'x') + secrets.token_hex(3)

def _parse_section(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None

def _refresh_cache():
    """Re-read every section from Firebase. False when nothing is stored yet
    (before the split)."""
    global _cache_ready
    raw = db.reference(STATE_ROOT).get()
    if not isinstance(raw, dict):
        return False
    _move_stored_keys(raw)
    for name in STATE_SECTIONS:
        data = _parse_section(raw.get(name)) or {}
        old = _cache.get(name)
        if old is None or canon(old['data']) != canon(data):
            _cache[name] = {'data': data, 'ver': _new_version()}
    _cache_ready = True
    return True

def _move_stored_keys(raw):
    """Move any key still stored in its old section (MOVED_KEYS) to its new
    one, in Firebase and in `raw`. A list already in the new section keeps
    its items and gains the old section's."""
    for key, (old_name, new_name) in MOVED_KEYS.items():
        old = _parse_section(raw.get(old_name))
        if not old or key not in old:
            continue
        new = _parse_section(raw.get(new_name)) or {}
        moving = old.pop(key)
        if key in new and isinstance(new[key], list) and isinstance(moving, list):
            have = {canon(v) for v in new[key]}
            new[key] = new[key] + [v for v in moving if canon(v) not in have]
        elif key not in new:
            new[key] = moving
        for name, section in ((new_name, new), (old_name, old)):
            raw[name] = _dumps(section)
            db.reference(f'{STATE_ROOT}/{name}').set(raw[name])
        print(f"[STATE] Moved {key} from {old_name} to {new_name}")

def _read_sections():
    """{name: dict} for every section, or None before the split."""
    with _state_lock:
        if not _cache_ready and not _refresh_cache():
            return None
        return {name: entry['data'] for name, entry in _cache.items()}

def _dumps(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False)

def _write_section(name, section_dict):
    with _state_lock:
        db.reference(f'{STATE_ROOT}/{name}').set(_dumps(section_dict))
        old = _cache.get(name)
        if old is None or canon(old['data']) != canon(section_dict):
            _cache[name] = {'data': section_dict, 'ver': _new_version()}

def _gate_section(name, new_section, old_section):
    """A save without a manager session keeps the stored manager-only
    fields. Returns (section to store, [ignored field names])."""
    if session.get('manager') or old_section is None:
        return new_section, []
    if not any(key in MANAGER_ONLY_KEYS for key in STATE_SECTIONS.get(name, [])) and not any(key in MANAGER_ONLY_KEYS for key in new_section):
        return new_section, []
    ignored = _changed_manager_fields(old_section, new_section)
    if ignored:
        new_section = _keep_stored_manager_fields(old_section, dict(new_section))
    return new_section, ignored

def _migrate_legacy_state():
    """First load after the split: copy the single appState blob into
    sections. The old blob is left in place as a backup."""
    raw = db.reference(APP_STATE_PATH).get()
    legacy = None
    if isinstance(raw, str):
        try:
            legacy = json.loads(raw)
        except (TypeError, ValueError):
            legacy = None
    if not isinstance(legacy, dict):
        return {}
    sections = _split_state(legacy)
    for name, section in sections.items():
        _write_section(name, section)
    print(f"[STATE] Migrated appState into {len(sections)} sections")
    return sections

# ===== FIREBASE PROXY LIMITS =====
# The page only ever reads and writes one path: the app-state blob. The proxy
# refuses everything else. In particular secure/managerPinHash must never be
# reachable: reading it would let anyone brute-force a short PIN offline, and
# writing it would let anyone set their own PIN and unlock Manage.
APP_STATE_PATH = 'appState'
MAX_STATE_BYTES = 8 * 1024 * 1024   # far above today's state; stops junk floods

def _state_path_or_error(data):
    path = (data or {}).get('path', '')
    if path != APP_STATE_PATH:
        return None, (jsonify({'error': 'Path not allowed'}), 403)
    return path, None

# Basic in-memory brute-force throttle for the login endpoint.
# Resets on redeploy/restart — fine for a single small-team instance,
# not a substitute for a longer PIN.
_login_failures = defaultdict(list)
_all_login_failures = []
LOGIN_MAX_ATTEMPTS = 5
LOGIN_LOCKOUT_SECONDS = 60
# Across every address: a guesser rotating addresses still gets only this
# many tries per window. (A real manager is locked out for the same window
# while it trips, which is the trade-off for a 4-digit PIN.)
LOGIN_GLOBAL_MAX_ATTEMPTS = 30
LOGIN_GLOBAL_WINDOW_SECONDS = 600

def _client_ip():
    # Render appends the connecting address to X-Forwarded-For; anything
    # before it came from the client and can be forged to dodge the throttle.
    forwarded = request.headers.get('X-Forwarded-For', '')
    return forwarded.split(',')[-1].strip() if forwarded else request.remote_addr

def _too_many_attempts(ip):
    now = time.time()
    _login_failures[ip] = [t for t in _login_failures[ip] if now - t < LOGIN_LOCKOUT_SECONDS]
    _all_login_failures[:] = [t for t in _all_login_failures if now - t < LOGIN_GLOBAL_WINDOW_SECONDS]
    return len(_login_failures[ip]) >= LOGIN_MAX_ATTEMPTS or len(_all_login_failures) >= LOGIN_GLOBAL_MAX_ATTEMPTS

def _record_failure(ip):
    now = time.time()
    _login_failures[ip].append(now)
    _all_login_failures.append(now)

# Firebase config
FIREBASE_DB_URL = 'https://cfa-buda-ops-hub-default-rtdb.firebaseio.com'

_cred_json = os.environ.get('FIREBASE_SERVICE_ACCOUNT_KEY')
if _cred_json:
    _cred = credentials.Certificate(json.loads(_cred_json))
    firebase_admin.initialize_app(_cred, {'databaseURL': FIREBASE_DB_URL})
else:
    print('[STARTUP WARNING] FIREBASE_SERVICE_ACCOUNT_KEY is not set — Firebase reads/writes will fail.')

# ===== SERVE ROUTES =====

@app.route('/')
def serve_html():
    return send_file('cfa-buda-ops-hub-complete.html')

# ===== MANAGER AUTH ROUTES =====

@app.route('/api/manager/login', methods=['POST'])
def manager_login():
    ip = _client_ip()
    if _too_many_attempts(ip):
        return jsonify({'error': 'Too many attempts. Try again in a minute.'}), 429

    data = request.json or {}
    pin = data.get('pin', '')

    stored_hash = db.reference('secure/managerPinHash').get()
    if not stored_hash:
        return jsonify({'error': 'No manager PIN has been configured yet'}), 500

    if not pin or not check_password_hash(stored_hash, pin):
        _record_failure(ip)
        return jsonify({'error': 'Incorrect PIN'}), 401

    session.permanent = True
    session['manager'] = True
    return jsonify({'success': True})

@app.route('/api/manager/logout', methods=['POST'])
def manager_logout():
    session.pop('manager', None)
    return jsonify({'success': True})

@app.route('/api/manager/status', methods=['GET'])
def manager_status():
    return jsonify({'isManager': bool(session.get('manager'))})

@app.route('/api/manager/set-pin', methods=['POST'])
def manager_set_pin():
    if not session.get('manager'):
        return jsonify({'error': 'Not authorized'}), 403

    data = request.json or {}
    new_pin = data.get('pin', '')
    if not new_pin or len(new_pin) < 4:
        return jsonify({'error': 'PIN must be at least 4 characters'}), 400

    db.reference('secure/managerPinHash').set(generate_password_hash(new_pin))
    return jsonify({'success': True})

# ===== LEVELSET PEA RATINGS =====

@app.route('/api/pea/parse', methods=['POST'])
def pea_parse():
    """Reads a Levelset Positional Excellence Ratings PDF and returns the
    ratings. Nothing is stored here — the page merges them into app state."""
    if not session.get('manager'):
        return jsonify({'error': 'Manager sign-in required'}), 403
    upload = request.files.get('file')
    if not upload or not upload.filename:
        return jsonify({'error': 'No file uploaded'}), 400
    if not upload.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'Upload the PDF export from Levelset'}), 400
    try:
        return jsonify(parse_pea_pdf(upload.stream))
    except PeaParseError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f"[PEA PARSE ERROR] {e}")
        return jsonify({'error': 'Could not read that PDF'}), 500

REPORT_MAX_BYTES = 40 * 1024 * 1024   # Smart Shop PDFs carry photos (10–20 MB each)

@app.route('/api/reports/parse', methods=['POST'])
def reports_parse():
    """Reads an Ops Hub Smart Shop or food safety PDF (or the zip Ops Hub
    downloads) and returns what's in it. Nothing is stored here. A PDF it
    doesn't recognize comes back as kind None (the page then tries PEA)."""
    if not session.get('manager'):
        return jsonify({'error': 'Manager sign-in required'}), 403
    if request.content_length and request.content_length > REPORT_MAX_BYTES:
        return jsonify({'error': 'That file is over 40 MB — upload the reports one at a time.'}), 413
    upload = request.files.get('file')
    if not upload or not upload.filename:
        return jsonify({'error': 'No file uploaded'}), 400
    if not upload.filename.lower().endswith(('.pdf', '.zip')):
        return jsonify({'error': 'Upload the PDF (or the zip) from Ops Hub'}), 400
    try:
        return jsonify({'reports': parse_report_file(upload.read(), upload.filename)})
    except ReportParseError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f"[REPORT PARSE ERROR] {e}")
        return jsonify({'error': 'Could not read that file'}), 500

# One Levelset fetch a minute at most, however many times the button's pressed.
_levelset_last = {'at': 0.0, 'reply': None}
LEVELSET_MIN_GAP = 60

@app.route('/api/pea/levelset-sync', methods=['POST'])
def pea_levelset_sync():
    """PEA ratings pulled from Levelset's share link (see levelset_sync.py).
    Nothing is stored here — the page merges them like a PDF upload."""
    if not session.get('manager'):
        return jsonify({'error': 'Manager sign-in required'}), 403
    token = levelset_sync.configured_token()
    if not token:
        return jsonify({'error': 'not_configured',
                        'message': f'Set {levelset_sync.TOKEN_ENV} on the server to the Levelset share code.'}), 400
    now = time.time()
    if _levelset_last['reply'] and now - _levelset_last['at'] < LEVELSET_MIN_GAP:
        return jsonify(_levelset_last['reply'])
    try:
        reply = levelset_sync.fetch_ratings(token)
    except levelset_sync.LevelsetError as e:
        return jsonify({'error': str(e)}), 502
    except Exception as e:
        print(f"[LEVELSET SYNC ERROR] {type(e).__name__}")
        return jsonify({'error': 'Levelset sync failed'}), 500
    _levelset_last.update(at=now, reply=reply)
    print(f"[LEVELSET SYNC] {len(reply['ratings'])} ratings")
    return jsonify(reply)

# ===== STATE ROUTES (sections) =====

# Waste entries a team device needs: today's, for the tracker's counts.
# The history behind the dashboard goes to manager sessions only.
WASTE_TEAM_WINDOW_MS = 2 * 24 * 60 * 60 * 1000

def _section_for_session(name, data):
    if name == 'waste' and not session.get('manager') and isinstance(data, dict) and isinstance(data.get('entries'), list):
        cutoff = int(time.time() * 1000) - WASTE_TEAM_WINDOW_MS
        return {**data, 'entries': [e for e in data['entries'] if isinstance(e, dict) and isinstance(e.get('ts'), (int, float)) and e['ts'] >= cutoff]}
    return data

def _state_reply(names):
    """Sections (as JSON strings), every section's version, and the build.
    Private sections go to manager sessions only; the waste log is trimmed
    to recent entries for team devices."""
    shown = lambda name: session.get('manager') or name not in PRIVATE_SECTIONS
    return {
        'sections': {name: _dumps(_section_for_session(name, _cache[name]['data'])) for name in names if shown(name)},
        'versions': {name: entry['ver'] for name, entry in _cache.items() if shown(name)},
        'build': BUILD,
    }

@app.route('/api/state/load', methods=['POST'])
def state_load():
    try:
        with _state_lock:
            # Always from Firebase, so a change made outside the app shows up.
            if not _refresh_cache():
                _migrate_legacy_state()
                _refresh_cache()
            return jsonify(_state_reply(list(_cache)))
    except Exception as e:
        print(f"[STATE LOAD ERROR] {e}")
        return jsonify({'error': 'Load failed'}), 500

@app.route('/api/state/sync', methods=['POST'])
def state_sync():
    """What changed since the page last heard: only the sections whose
    version differs from the ones the page has. With "only" (a list of
    section names), just those sections are checked, e.g. Set Ups' Refresh
    asking for the set up and roster alone. Served from memory: no
    Firebase read."""
    body = request.get_json(silent=True) or {}
    have = body.get('versions')
    if not isinstance(have, dict):
        return jsonify({'error': 'versions required'}), 400
    only = body.get('only')
    if only is not None and (not isinstance(only, list) or not all(isinstance(n, str) for n in only)):
        return jsonify({'error': 'only must be a list of section names'}), 400
    try:
        with _state_lock:
            if _read_sections() is None:
                return jsonify({'sections': {}, 'versions': {}, 'build': BUILD})
            names = [n for n in _cache if have.get(n) != _cache[n]['ver'] and (only is None or n in only)]
            return jsonify(_state_reply(names))
    except Exception as e:
        print(f"[STATE SYNC ERROR] {e}")
        return jsonify({'error': 'Sync failed'}), 500

@app.route('/api/state/patch', methods=['POST'])
def state_patch():
    """Apply each section's changes to the latest saved data. A section comes
    back whole only when someone else changed it since the page's version."""
    if (request.content_length or 0) > MAX_STATE_BYTES:
        return jsonify({'error': 'Save is too large'}), 413
    patches = (request.get_json(silent=True) or {}).get('patches')
    if not isinstance(patches, dict) or not patches:
        return jsonify({'error': 'No changes to save'}), 400
    for name, patch in patches.items():
        if name not in STATE_SECTIONS or not isinstance(patch, dict):
            return jsonify({'error': f'Unknown section: {name}'}), 400
        try:
            check_ops(patch.get('ops'))
        except PatchError as e:
            return jsonify({'error': str(e)}), 400
    # A page running older code still files moved keys under their old
    # section: send those changes to the new one, as additions only.
    for key, (old_name, new_name) in MOVED_KEYS.items():
        old_patch = patches.get(old_name)
        moved = [op for op in (old_patch or {}).get('ops', []) if op['p'][0] == key]
        if not moved:
            continue
        old_patch['ops'] = [op for op in old_patch['ops'] if op['p'][0] != key]
        reduced = [op for op in _append_only_ops(moved) if op['p'][0] == key and op['o'] == 'arr']
        if reduced:
            target = patches.setdefault(new_name, {'ver': None, 'ops': []})
            target['ops'] = target.get('ops', []) + reduced
        if not old_patch['ops']:
            del patches[old_name]
    if not patches:
        return jsonify({'success': True, **_state_reply([])})
    for name, patch in patches.items():
        # A key belongs to one section only.
        stray = sorted({op['p'][0] for op in patch['ops'] if SECTION_OF_KEY.get(op['p'][0], 'misc') != name})
        if stray:
            return jsonify({'error': f'Keys in the wrong section: {", ".join(stray)}'}), 400

    try:
        with _state_lock:
            if _read_sections() is None:
                _migrate_legacy_state()
                _refresh_cache()
            ignored, returned = set(), []
            for name, patch in patches.items():
                ops = patch['ops']
                entry = _cache.get(name) or {'data': {}, 'ver': None}
                if not session.get('manager'):
                    ops = _append_only_ops(ops)
                dropped = [] if session.get('manager') else [op for op in ops if op['p'][0] in MANAGER_ONLY_KEYS]
                if dropped:
                    # Manager-only fields need a manager session. The rest of
                    # the save goes ahead, and the page gets the section back
                    # so it drops the change it couldn't make.
                    ignored.update(op['p'][0] for op in dropped)
                    ops = [op for op in ops if op['p'][0] not in MANAGER_ONLY_KEYS]
                if dropped or patch.get('ver') != entry['ver']:
                    returned.append(name)
                new = apply_ops(entry['data'], ops)
                if canon(new) != canon(entry['data']):
                    if len(_dumps(new).encode('utf-8')) > MAX_STATE_BYTES:
                        return jsonify({'error': f'Section {name} would be too large'}), 413
                    _write_section(name, new)
            print('[STATE PATCH] ' + ', '.join(f"{n}:{len(p['ops'])}" for n, p in patches.items()))
            reply = _state_reply(returned)
            reply['success'] = True
            if ignored:
                reply['managerFieldsIgnored'] = sorted(ignored)
            return jsonify(reply)
    except Exception as e:
        print(f"[STATE PATCH ERROR] {e}")
        return jsonify({'error': 'Save failed'}), 500

@app.route('/api/safe-counts/today', methods=['GET'])
def safe_counts_today():
    """One day's safe counts for any device, so a leader on shift can check
    the opening count before doing the transition one. The full log stays
    manager-only (TIM-48): only today (by the store's calendar, give or take
    a day for time zones) can be asked for."""
    try:
        day = date.fromisoformat(request.args.get('date', ''))
    except ValueError:
        return jsonify({'error': 'date must be YYYY-MM-DD'}), 400
    if abs((day - date.today()).days) > 1:
        return jsonify({'error': 'Only today\'s counts are available'}), 403
    try:
        sections = _read_sections() or {}
    except Exception as e:
        print(f"[SAFE TODAY ERROR] {e}")
        return jsonify({'error': 'Could not read safe counts'}), 500
    counts = (sections.get('safe') or {}).get('safeCounts') or []
    return jsonify({'counts': [c for c in counts if isinstance(c, dict) and c.get('date') == day.isoformat()]})

# ===== SET UP FEED (read-only, for the daily briefing) =====
# A day's set up for an outside reader that can't sign in: each daypart, its
# Lead Captain, and who is in which position, by the names Set Ups shows. It
# is off unless SETUP_FEED_TOKEN (a long random secret, 32+ characters) is set
# in Render's environment; until then, and for a wrong token, the route
# answers like any unknown address. Changing the variable cuts off the old
# link. Served from the server's memory: no database read on a normal day.
# ?date=today|tomorrow|YYYY-MM-DD (default tomorrow, store time), &format=text
# for plain text. The token can come as ?token= or "Authorization: Bearer".
SETUP_FEED_MIN_TOKEN = 32
SETUP_FEED_MAX_FAILURES = 10          # wrong tokens per address ...
SETUP_FEED_WINDOW_SECONDS = 600       # ... per ten minutes
_setup_feed_failures = defaultdict(list)
_setup_feed_layout = None

def _feed_given_token():
    given = request.args.get('token', '')
    auth = request.headers.get('Authorization', '')
    if not given and auth.startswith('Bearer '):
        given = auth[7:].strip()
    return given

def _feed_token_matches(env_name):
    expected = os.environ.get(env_name, '')
    if len(expected) < SETUP_FEED_MIN_TOKEN:
        return False
    return hmac.compare_digest(_feed_given_token().encode('utf-8'), expected.encode('utf-8'))

def _setup_feed_token_ok():
    return _feed_token_matches('SETUP_FEED_TOKEN')

def _feed_throttled(ip):
    now = time.time()
    _setup_feed_failures[ip] = [t for t in _setup_feed_failures[ip] if now - t < SETUP_FEED_WINDOW_SECONDS]
    return len(_setup_feed_failures[ip]) >= SETUP_FEED_MAX_FAILURES

def _feed_layout():
    global _setup_feed_layout
    if _setup_feed_layout is None:
        _setup_feed_layout = setup_feed.load_layout()
    return _setup_feed_layout

@app.route('/api/setup-feed', methods=['GET'])
def setup_feed_route():
    ip = _client_ip()
    if _feed_throttled(ip):
        return jsonify({'error': 'Too many attempts. Try again later.'}), 429
    if not _setup_feed_token_ok():
        if os.environ.get('SETUP_FEED_TOKEN'):
            _setup_feed_failures[ip].append(time.time())
        return jsonify({'error': 'Endpoint not found'}), 404
    day = setup_feed.parse_day(request.args.get('date'))
    if day is None:
        return jsonify({'error': 'date must be today, tomorrow or YYYY-MM-DD'}), 400
    try:
        sections = _read_sections() or {}
        feed = setup_feed.build_feed(sections, day, _feed_layout())
    except Exception as e:
        print(f"[SETUP FEED ERROR] {e}")
        return jsonify({'error': 'Could not read the set up'}), 500
    if request.args.get('format') == 'text':
        response = app.response_class(setup_feed.feed_text(feed), mimetype='text/plain')
    else:
        response = jsonify(feed)
    response.headers['Cache-Control'] = 'no-store'
    return response

# ===== DAILY BRIEFING FEED (read-only) =====
# Ready-to-read summaries for the daily briefing (briefing_feed.py): set up,
# sales, projections, guest scores, waste, and people (names: the roster and
# recent PEA ratings). Off unless BRIEFING_TOPICS lists the topics it may
# serve (comma-separated); a topic not listed stays off for every token.
# Two tokens: SETUP_FEED_TOKEN unlocks the store topics; BRIEFING_PEOPLE_TOKEN
# (also 32+ characters, different) unlocks those plus people. Same "not
# found" and guess limit as the set up feed.
# ?date=today|tomorrow|YYYY-MM-DD (default today, store time),
# &topics=sales,waste (default: every topic the token may read), &format=text.
@app.route('/api/briefing', methods=['GET'])
def briefing_route():
    ip = _client_ip()
    if _feed_throttled(ip):
        return jsonify({'error': 'Too many attempts. Try again later.'}), 429
    allowed = [t.strip() for t in os.environ.get('BRIEFING_TOPICS', '').split(',') if t.strip() in briefing_feed.TOPICS]
    # The people token only counts when it differs from the store one, so the
    # store link can never unlock names by accident.
    people_ok = (os.environ.get('BRIEFING_PEOPLE_TOKEN', '') != os.environ.get('SETUP_FEED_TOKEN', '')
                 and _feed_token_matches('BRIEFING_PEOPLE_TOKEN'))
    if people_ok:
        granted = [t for t in briefing_feed.TOPICS if t in allowed]
    elif _feed_token_matches('SETUP_FEED_TOKEN'):
        granted = [t for t in briefing_feed.STORE_TOPICS if t in allowed]
    else:
        if os.environ.get('SETUP_FEED_TOKEN') or os.environ.get('BRIEFING_PEOPLE_TOKEN'):
            _setup_feed_failures[ip].append(time.time())
        return jsonify({'error': 'Endpoint not found'}), 404
    if not granted:
        return jsonify({'error': 'Endpoint not found'}), 404
    day = setup_feed.parse_day(request.args.get('date') or 'today')
    if day is None:
        return jsonify({'error': 'date must be today, tomorrow or YYYY-MM-DD'}), 400
    asked = [t.strip() for t in request.args.get('topics', '').split(',') if t.strip()]
    topics = [t for t in granted if not asked or t in asked]
    try:
        sections = _read_sections() or {}
        brief = briefing_feed.build(sections, day, topics, _feed_layout())
    except Exception as e:
        print(f"[BRIEFING FEED ERROR] {e}")
        return jsonify({'error': 'Could not build the briefing'}), 500
    brief['topics'] = topics
    if request.args.get('format') == 'text':
        response = app.response_class(briefing_feed.text(brief), mimetype='text/plain')
    else:
        response = jsonify(brief)
    response.headers['Cache-Control'] = 'no-store'
    return response

# What the one-time backup (appState, kept when saving moved to sections)
# can put back: data that came in through uploads.
BACKUP_RESTORABLE = ('cemEntries', 'prepSoldEntries', 'productivityProfiles', 'peaRatings', 'dataUploadLog')

@app.route('/api/state/backup', methods=['POST'])
def state_backup():
    """The upload data held in the pre-split backup, so Manage can offer to
    restore anything that has since gone missing. Managers only."""
    if not session.get('manager'):
        return jsonify({'error': 'Manager sign-in required'}), 403
    try:
        legacy = _parse_section(db.reference(APP_STATE_PATH).get())
    except Exception as e:
        print(f"[STATE BACKUP ERROR] {e}")
        return jsonify({'error': 'Could not read the backup'}), 500
    if not legacy:
        return jsonify({'exists': False, 'data': {}})
    return jsonify({'exists': True, 'data': {k: legacy[k] for k in BACKUP_RESTORABLE if k in legacy}})

@app.route('/api/state/export', methods=['POST'])
def state_export():
    """The full backup: every saved section, read fresh from Firebase (so it
    has what other devices saved a moment ago and the sections a page only
    loads for managers), as one JSON file to keep. Managers only. The
    manager PIN hash lives outside state/ and is never in it."""
    if not session.get('manager'):
        return jsonify({'error': 'Manager sign-in required'}), 403
    try:
        with _state_lock:
            if not _refresh_cache():
                return jsonify({'error': 'Nothing has been saved yet'}), 404
            sections = {name: _cache[name]['data'] for name in STATE_SECTIONS}
    except Exception as e:
        print(f"[STATE EXPORT ERROR] {e}")
        return jsonify({'error': 'Could not read the saved data'}), 500
    day = setup_feed.store_today().isoformat()   # the store's date (Central)
    body = _dumps({
        'app': 'BudaOpsHub', 'kind': 'full-backup', 'version': 1,
        'exportedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'build': BUILD, 'sections': sections,
    })
    response = app.response_class(body, mimetype='application/json')
    response.headers['Content-Disposition'] = f'attachment; filename="budaopshub-full-backup-{day}.json"'
    response.headers['Cache-Control'] = 'no-store'
    return response

@app.route('/api/state/save', methods=['POST'])
def state_save():
    data = request.get_json(silent=True) or {}
    incoming = data.get('sections')
    if not isinstance(incoming, dict) or not incoming:
        return jsonify({'error': 'No sections to save'}), 400
    total = 0
    parsed = {}
    for name, value in incoming.items():
        if name not in STATE_SECTIONS:
            return jsonify({'error': f'Unknown section: {name}'}), 400
        if not isinstance(value, str):
            return jsonify({'error': 'Each section must be a JSON string'}), 400
        total += len(value.encode('utf-8'))
        try:
            section = json.loads(value)
        except (TypeError, ValueError):
            return jsonify({'error': f'Section {name} is not valid JSON'}), 400
        if not isinstance(section, dict):
            return jsonify({'error': f'Section {name} must be an object'}), 400
        # A moved key arriving under its old section goes to its new one.
        for key, (old_name, new_name) in MOVED_KEYS.items():
            if name == old_name and key in section:
                parsed.setdefault(new_name, {})[key] = section.pop(key)
        # A key belongs to one section only — no smuggling manager fields
        # into a section the gate doesn't check.
        stray = [k for k in section if SECTION_OF_KEY.get(k, 'misc') != name]
        if stray:
            return jsonify({'error': f'Keys in the wrong section: {", ".join(sorted(stray))}'}), 400
        parsed[name] = section
    if total > MAX_STATE_BYTES:
        return jsonify({'error': 'Save is too large'}), 413

    try:
        ignored_all = []
        # Only pages running code from before change-based saves use this
        # route. Their copy can be days old, so they may add to the saved
        # data but never remove or overwrite it (union_merge).
        stored = _read_sections()
        for name, section in parsed.items():
            old = (stored or {}).get(name)
            section, ignored = _gate_section(name, section, old)
            ignored_all += ignored
            if old is not None:
                section = union_merge(old, section)
            _write_section(name, section)
        print(f"[STATE SAVE] {', '.join(parsed)}")
        if ignored_all:
            return jsonify({'success': True, 'managerFieldsIgnored': sorted(ignored_all)})
        return jsonify({'success': True})
    except Exception as e:
        print(f"[STATE SAVE ERROR] {e}")
        return jsonify({'error': 'Save failed'}), 500

# ===== FIREBASE PROXY ROUTES =====
# Only the app-state blob, and only read and write (see APP_STATE_PATH). There
# are no update/delete routes: the page never used them, and open ones let
# anyone change or wipe any path.

@app.route('/api/firebase/read', methods=['POST'])
def firebase_read():
    # The old single-blob copy holds everything, private data included.
    if not session.get('manager'):
        return jsonify({'error': 'Manager sign-in required'}), 403
    path, error = _state_path_or_error(request.get_json(silent=True))
    if error:
        return error
    try:
        return jsonify(db.reference(path).get())
    except Exception as e:
        print(f"[FIREBASE READ ERROR] Path: {path}, {e}")
        return jsonify({'error': 'Read failed'}), 500

@app.route('/api/firebase/write', methods=['POST'])
def firebase_write():
    data = request.get_json(silent=True) or {}
    path, error = _state_path_or_error(data)
    if error:
        return error
    value = data.get('value')

    # The app state is saved as one JSON string holding an object.
    if not isinstance(value, str):
        return jsonify({'error': 'App state must be a JSON string'}), 400
    if len(value.encode('utf-8')) > MAX_STATE_BYTES:
        return jsonify({'error': 'App state is too large'}), 413
    try:
        new_state = json.loads(value)
    except (TypeError, ValueError):
        return jsonify({'error': 'App state is not valid JSON'}), 400
    if not isinstance(new_state, dict):
        return jsonify({'error': 'App state must be an object'}), 400

    try:
        # Manager-field gate. A non-manager save whose manager-only fields
        # differ from what's stored keeps the STORED values for those fields
        # and saves everything else. (It used to reject the whole write, so
        # any drift in those fields — e.g. a deploy that changes the default
        # product list — silently dropped every team member's waste entries,
        # CEM uploads, etc.)
        ignored_fields = []
        # After the split, the current data lives in the sections: compare
        # against those (the old blob is a stale backup by then).
        stored_sections = _read_sections()
        old_state = None
        if stored_sections is not None:
            old_state = {}
            for section in stored_sections.values():
                old_state.update(section)
        else:
            raw_old = db.reference(path).get()
            if isinstance(raw_old, str):
                try:
                    old_state = json.loads(raw_old)
                except (TypeError, ValueError):
                    pass
            if not isinstance(old_state, dict):
                old_state = None

        # If there's no prior state at all, this is first-ever bootstrap —
        # let it through rather than locking out an empty Firebase project.
        if old_state is not None and not session.get('manager'):
            ignored_fields = _changed_manager_fields(old_state, new_state)
            if ignored_fields:
                new_state = _keep_stored_manager_fields(old_state, new_state)
                value = json.dumps(new_state)

        # A page still running the old code (opened before the split) keeps
        # saving the whole blob here. File it into the sections — only the
        # ones that differ — so its changes aren't lost.
        if stored_sections is not None:
            for name, section in _split_state(new_state).items():
                # A days-old copy may add, never remove or overwrite.
                old = stored_sections.get(name)
                merged = union_merge(old, section) if old is not None else section
                if canon(merged) != canon(old):
                    _write_section(name, merged)
            print(f"[FIREBASE WRITE] Path: {path}, filed into sections (old page)")
            if ignored_fields:
                return jsonify({'success': True, 'managerFieldsIgnored': ignored_fields})
            return jsonify({'success': True})

        db.reference(path).set(value)
        print(f"[FIREBASE WRITE] Path: {path}, OK")
        if ignored_fields:
            print(f"[FIREBASE WRITE] Kept stored manager-only fields (no manager session): {ignored_fields}")
            return jsonify({'success': True, 'managerFieldsIgnored': ignored_fields})
        return jsonify({'success': True})

    except Exception as e:
        print(f"[FIREBASE WRITE ERROR] Path: {path}, {e}")
        return jsonify({'error': 'Write failed'}), 500

# ===== COMPRESSION =====
# Saved-data replies are JSON that shrinks ~5-10x zipped: less phone data and
# faster loads on a slow connection.

@app.after_request
def compress_state_replies(response):
    if (request.path.startswith('/api/state/') and response.status_code == 200
            and not response.direct_passthrough
            and 'gzip' in request.headers.get('Accept-Encoding', '').lower()
            and 'Content-Encoding' not in response.headers):
        body = response.get_data()
        if len(body) > 1400:
            response.set_data(gzip.compress(body, compresslevel=6))
            response.headers['Content-Encoding'] = 'gzip'
            response.headers['Content-Length'] = str(len(response.get_data()))
        response.headers['Vary'] = 'Accept-Encoding'
    return response

# ===== ERROR HANDLING =====

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error'}), 500

# ===== START SERVER =====

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
