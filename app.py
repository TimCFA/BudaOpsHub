from datetime import timedelta
from collections import defaultdict
import json
import os
import time

from flask import Flask, request, jsonify, send_file, session
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import firebase_admin
from firebase_admin import credentials, db

from pea_parser import parse_pea_pdf, PeaParseError

app = Flask(__name__)
CORS(app)

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

# Fields that require an authenticated manager session to change.
# saveState() always resends the full snapshot, so we diff old vs. new
# per key. The product bookkeeping keys travel with `products` so a
# non-manager save can't leave them out of step with the stored list.
MANAGER_ONLY_KEYS = {
    'wasteTarget', 'safeTarget', 'products',
    'deletedProductIds', 'productFixesVersion', 'productCategoryOrder',
    'lxPillars', 'lxMetrics', 'lxLastUpdated',
    'gxData', 'txData', 'homeData',
    'peaRatings', 'peaNameAliases',
    'dataUploadLog', 'dataUploadSettings', 'productivityProfiles',
}

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
                'homeData', 'dataUploadLog', 'dataUploadSettings', 'productivityProfiles'],
    'pea': ['peaRatings', 'peaNameAliases'],
    'rosters': ['fohRoster', 'bohRoster'],
    'setups': ['posAssignments', 'posVacancyFlags', 'setupDayTypes', 'lastUpdated',
               'breakCountdowns', 'completedBreaks'],
    'history': ['setupHistory', 'numbersHistory', 'wasteMonthlyHistory', 'zoneChecklistHistory'],
    'waste': ['entries', 'wasteDays', 'formDone', 'formDoneDate', 'wasteLogLastClosedOut'],
    'ops': ['foodSafetyDays', 'foodSafetyWalkthroughs', 'fohOEDays', 'fohOEChecked', 'fohOECheckedDate',
            'fohLeaderTransitionChecked', 'fohLeaderTransitionDate', 'zoneChecklistState',
            'numbersData', 'safeCounts'],
    'people': ['eoiSubmissions', 'trainerTrainees', 'trainerProgress', 'teamLeadTrainees',
               'teamLeadProgress', 'scoreboardItems'],
    'prep': ['prepBuffers', 'prepSoldEntries', 'prepWasteEntries', 'prepStockoutEvents', 'prepHistorySeeded'],
    'prepTimes': ['prepTimes', 'prepTimers'],
    'cem': ['cemEntries'],
    'misc': [],
}
SECTION_OF_KEY = {key: name for name, keys in STATE_SECTIONS.items() for key in keys}

def _split_state(state):
    sections = {name: {} for name in STATE_SECTIONS}
    for key, value in state.items():
        sections[SECTION_OF_KEY.get(key, 'misc')][key] = value
    return sections

def _read_sections():
    """{name: dict} for every stored section, or None before the split."""
    raw = db.reference(STATE_ROOT).get()
    if not isinstance(raw, dict):
        return None
    out = {}
    for name, value in raw.items():
        if name not in STATE_SECTIONS or not isinstance(value, str):
            continue
        try:
            parsed = json.loads(value)
        except (TypeError, ValueError):
            continue
        if isinstance(parsed, dict):
            out[name] = parsed
    return out

def _dumps(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False)

def _write_section(name, section_dict):
    db.reference(f'{STATE_ROOT}/{name}').set(_dumps(section_dict))

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

# ===== STATE ROUTES (sections) =====

@app.route('/api/state/load', methods=['POST'])
def state_load():
    try:
        sections = _read_sections()
        if sections is None:
            sections = _migrate_legacy_state()
        return jsonify({'sections': {name: _dumps(value) for name, value in sections.items()}})
    except Exception as e:
        print(f"[STATE LOAD ERROR] {e}")
        return jsonify({'error': 'Load failed'}), 500

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
        needs_old = [n for n in parsed if not session.get('manager') and any(k in MANAGER_ONLY_KEYS for k in STATE_SECTIONS[n])]
        stored = _read_sections() if needs_old else None
        for name, section in parsed.items():
            old = (stored or {}).get(name) if name in needs_old else None
            if name in needs_old and stored is None:
                old = None   # nothing stored yet: first save (bootstrap)
            section, ignored = _gate_section(name, section, old)
            ignored_all += ignored
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
                if json.dumps(section, sort_keys=True) != json.dumps(stored_sections.get(name), sort_keys=True):
                    _write_section(name, section)
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
