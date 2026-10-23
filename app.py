from datetime import date, datetime, timedelta, timezone
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
import base64
import gzip
import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time

from flask import Flask, Response, request, jsonify, send_file, session
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import firebase_admin
from firebase_admin import credentials, db
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from pea_parser import parse_pea_pdf, PeaParseError
from pin_report import read_pin_report, PinReportError
from permit_sheet import read_permit_sheet, PermitSheetError
from analytics_pdf import read_analytics_pdf, AnalyticsPdfError
from event_fixes import fix_events, add_mens_outerwear
import forms_api
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
    'lxPillars', 'lxMetrics', 'lxLastUpdated', 'lxQuarters',
    'gxData', 'txData', 'homeData', 'storeEvents', 'directors', 'leaderRoster', 'peaGoals',
    'peaRatings', 'peaNameAliases',
    'dataUploadLog', 'dataUploadSettings', 'productivityProfiles', 'reportData',
    'launchMode', 'safeOrderSettings',
    # People data (below): private, so only a manager session changes it.
    'eoiSubmissions', 'trainerTrainees', 'trainerProgress', 'teamLeadTrainees',
    'teamLeadProgress', 'scoreboardItems', 'leaderNotes', 'leaderFocus', 'teamNotes',
    # Sales and labor history (below): private, so only a manager session changes it.
    'salesHistory', 'forecastSettings', 'forecastLog', 'daypartWeeks', 'laborByDaypart',
    # Uniform orders (below): names and paycheck deductions, so only a manager session.
    'uniformOrders', 'uniformCatalog',
    # Accountability points (below): disciplinary records, so only a manager session.
    'pointsRecords', 'pointsUploads', 'pointsSettings', 'pointsTeam', 'pointsMemos',
}

# Sections sent only to a manager session: PEA ratings, people data
# (Expression of Interest submissions, trial progress), safe counts and the
# daily sales and labor history behind the Forecast page. Anyone else gets
# every other section. The keys in pea, people and forecast are manager-only
# above; safe counts are append-only below, since leaders log them from any
# device.
PRIVATE_SECTIONS = ('pea', 'people', 'safe', 'forecast', 'orders', 'points')

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
                'launchMode', 'storeEvents', 'directors', 'leaderRoster', 'peaGoals', 'safeOrderSettings'],
    'pea': ['peaRatings', 'peaNameAliases'],
    'rosters': ['fohRoster', 'bohRoster', 'rosterPosted', 'truckShifts', 'adminShifts'],
    'setups': ['posAssignments', 'posVacancyFlags', 'setupDayTypes', 'lastUpdated',
               'breakCountdowns', 'completedBreaks', 'zoneOwners', 'posNotes'],
    'history': ['setupHistory', 'numbersHistory', 'wasteMonthlyHistory', 'zoneChecklistHistory', 'leaderTransitionHistory'],
    'waste': ['entries', 'wasteDays', 'formDone', 'formDoneDate', 'wasteLogLastClosedOut'],
    'ops': ['foodSafetyDays', 'foodSafetyWalkthroughs', 'fohOEDays', 'fohOEChecked', 'fohOECheckedDate',
            'fohLeaderTransitionChecked', 'fohLeaderTransitionDate', 'zoneChecklistState',
            'numbersData'],
    'safe': ['safeCounts'],
    'people': ['eoiSubmissions', 'trainerTrainees', 'trainerProgress', 'teamLeadTrainees',
               'teamLeadProgress', 'scoreboardItems', 'leaderNotes', 'leaderFocus', 'teamNotes'],
    'prep': ['prepBuffers', 'prepSoldEntries', 'prepWasteEntries', 'prepStockoutEvents', 'prepHistorySeeded'],
    'prepTimes': ['prepTimes', 'prepTimers'],
    # Counts made today on the Prep Board (Tim, Oct 20 2026): a section of its
    # own, so a page on older code never drops it when it saves the prep data.
    'prepLive': ['prepMade'],
    'cem': ['cemEntries'],
    'forecast': ['salesHistory', 'forecastSettings', 'forecastLog', 'daypartWeeks', 'laborByDaypart'],
    'orders': ['uniformOrders', 'uniformCatalog'],
    # The LX board by quarter (lx-quarters.js; Tim, Oct 23 2026).
    'lx': ['lxQuarters'],
    'points': ['pointsRecords', 'pointsUploads', 'pointsSettings', 'pointsTeam', 'pointsMemos'],
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
# changes to the latest data. This assumes one server process (Render runs
# `gunicorn app:app`: one worker); the lock covers threads within it.
#
# Page loads are answered from memory too (Oct 18 2026, after the data
# audit): each one used to re-read the whole state/ tree (~1.3 MB) while
# holding the lock, so phones opening at shift change queued behind each
# other and every save and sync waited. Only this server writes state/, so
# memory is current. Firebase is still read on a cold start, a few times in
# the first minutes after a start (the old server can take a save while a
# deploy overlaps), at most every CACHE_REFRESH_SECONDS in the background
# while pages are open, and fresh for the full backup. The read runs outside the
# lock, and a section saved during it keeps what was saved.
_state_lock = threading.RLock()
_cache = {}            # section name -> {'data': dict, 'ver': str, 'canon': str}
_cache_ready = False
_refresh_lock = threading.Lock()   # one Firebase read of state/ at a time
_refresh_running = False           # a background re-read is under way
_cache_read_at = 0.0               # time.monotonic() of the last full read
_write_gen = 0                     # counts section writes
_written_gen = {}                  # section name -> _write_gen of its last write
CACHE_REFRESH_SECONDS = 30 * 60
BOOT_REFRESH_SECONDS = (60, 180, 600)
_booted_at = time.monotonic()      # the first fill (a start); BOOT_REFRESH_SECONDS count from it
_boot_refreshes_done = 0
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

def _refresh_cache(only_if_cold=False):
    """Re-read every section from Firebase. False when nothing is stored yet
    (before the split). The download and parsing happen outside _state_lock,
    so syncs and saves carry on meanwhile; a section saved during the read
    keeps what was saved (the read may predate it). With only_if_cold, a
    request that waited while another filled the cache doesn't read again."""
    global _cache_ready, _cache_read_at, _booted_at, _boot_refreshes_done
    with _refresh_lock:
        if only_if_cold and not _cache_cold():
            return True
        with _state_lock:
            gen = _write_gen
        raw = db.reference(STATE_ROOT).get()
        if not isinstance(raw, dict):
            return False
        if any(isinstance(_parse_section(raw.get(old)), dict) and key in _parse_section(raw.get(old)) for key, (old, _) in MOVED_KEYS.items()):
            # A key still in its old section: move it with saves held, from
            # a read no save can have overtaken (rare: once per moved key).
            with _state_lock:
                raw = db.reference(STATE_ROOT).get()
                if not isinstance(raw, dict):
                    return False
                _move_stored_keys(raw)
                gen = _write_gen
        fresh = {}
        for name in STATE_SECTIONS:
            data = _parse_section(raw.get(name)) or {}
            fresh[name] = (data, canon(data))
        with _state_lock:
            if _cache_cold():
                _booted_at, _boot_refreshes_done = time.monotonic(), 0
            for name, (data, data_canon) in fresh.items():
                if _written_gen.get(name, 0) > gen:
                    continue
                old = _cache.get(name)
                if old is None or old['canon'] != data_canon:
                    _cache[name] = {'data': data, 'ver': _new_version(), 'canon': data_canon}
            _cache_ready = True
            _cache_read_at = time.monotonic()
        _apply_event_fixes()
        _apply_once('uniformMensOuterwear', 'uniformCatalog', add_mens_outerwear)
        return True

def _apply_event_fixes():
    """One-time corrections to the saved Events (event_fixes.py), applied
    while an event still holds the misread text: a deploy that overlapped an
    old server's save gets them again on the next read. Never fails a load."""
    try:
        name = next((n for n, keys in STATE_SECTIONS.items() if 'storeEvents' in keys), None)
        with _state_lock:
            entry = _cache.get(name)
            data = entry['data'] if entry else None
            if not isinstance(data, dict) or not isinstance(data.get('storeEvents'), list):
                return
            fixed, changed = fix_events(data['storeEvents'])
            if not changed:
                return
            _write_section(name, dict(data, storeEvents=fixed))
        print(f"[EVENTS] corrected {len(changed)}: {'; '.join(changed)}")
    except Exception as e:
        print(f"[EVENTS] corrections not applied: {type(e).__name__}")

ONCE_PATH = 'secure/appliedOnce'   # {name: time}: one-time changes already made


def _apply_once(mark, key, change):
    """A one-time change to a saved key, marked done in Firebase so it never
    runs again (and an item deleted afterwards stays deleted). A key never
    saved yet (the page's built-in list in use) needs nothing; the mark is
    still set. Never fails a load."""
    try:
        if db.reference(f'{ONCE_PATH}/{mark}').get():
            return
        name = next((n for n, keys in STATE_SECTIONS.items() if key in keys), None)
        with _state_lock:
            entry = _cache.get(name)
            data = entry['data'] if entry else None
            if not isinstance(data, dict):
                return
            value = data.get(key)
            if isinstance(value, list):
                changed, n = change(value)
                if n:
                    _write_section(name, dict(data, **{key: changed}))
                    print(f"[ONCE] {mark}: {n} added")
        db.reference(f'{ONCE_PATH}/{mark}').set(int(time.time()))
    except Exception as e:
        print(f"[ONCE] {mark} not applied: {type(e).__name__}")

def _cache_cold():
    return not _cache_ready or not _cache

def _cache_due():
    """Time for a background re-read: the follow-ups after a start (a save
    the old server took while a deploy overlapped), then every
    CACHE_REFRESH_SECONDS."""
    now = time.monotonic()
    if _boot_refreshes_done < len(BOOT_REFRESH_SECONDS) and now - _booted_at >= BOOT_REFRESH_SECONDS[_boot_refreshes_done]:
        return True
    return now - _cache_read_at >= CACHE_REFRESH_SECONDS

def _refresh_if_due():
    """Start a background re-read when one is due and none is running; the
    reply in hand doesn't wait for it."""
    global _boot_refreshes_done, _refresh_running
    with _state_lock:
        if _refresh_running or _cache_cold() or not _cache_due():
            return
        _refresh_running = True
        now = time.monotonic()
        while _boot_refreshes_done < len(BOOT_REFRESH_SECONDS) and now - _booted_at >= BOOT_REFRESH_SECONDS[_boot_refreshes_done]:
            _boot_refreshes_done += 1
    def run():
        global _refresh_running
        try:
            _refresh_cache()
        except Exception as e:
            print(f"[STATE REFRESH ERROR] {e}")
        finally:
            with _state_lock:
                _refresh_running = False
    threading.Thread(target=run, daemon=True).start()

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

def _ensure_cache(migrate=False):
    """Fill a cold cache from Firebase (with migrate, from the old appState
    blob on the very first run). True once there's data. Never call it, or
    anything that may refresh, while holding _state_lock: _refresh_cache
    takes _refresh_lock first, and the background read holds that while it
    waits for _state_lock."""
    if not _cache_cold() or _refresh_cache(only_if_cold=True):
        return True
    if not migrate:
        return False
    with _state_lock:
        _migrate_legacy_state()
    return _refresh_cache()

def _read_sections():
    """{name: dict} for every section, or None before the split."""
    if not _ensure_cache():
        return None
    with _state_lock:
        return {name: entry['data'] for name, entry in _cache.items()}

def _dumps(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False)

def _write_section(name, section_dict):
    global _write_gen
    with _state_lock:
        db.reference(f'{STATE_ROOT}/{name}').set(_dumps(section_dict))
        _write_gen += 1
        _written_gen[name] = _write_gen
        old = _cache.get(name)
        new_canon = canon(section_dict)
        if old is None or old['canon'] != new_canon:
            _cache[name] = {'data': section_dict, 'ver': _new_version(), 'canon': new_canon}

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
    if not isinstance(pin, str) or not pin:
        _record_failure(ip)
        return jsonify({'error': 'Incorrect PIN'}), 401

    # The manager PIN and the director PIN open Manage (the director PIN
    # adds the directors-only content). A team member's 6-digit clock-in PIN
    # (ACCOUNTS) signs them in by name with their role and NEVER opens
    # Manage, whatever the role.
    if check_password_hash(stored_hash, pin):
        _remember_manage_pin('manager', stored_hash, pin)
        return jsonify(_sign_in({'role': 'manager', 'manager': True, 'via': 'pin'}))
    director_hash = db.reference(DIRECTOR_PIN_PATH).get()
    if director_hash and check_password_hash(director_hash, pin):
        _remember_manage_pin('director', director_hash, pin)
        return jsonify(_sign_in({'role': 'director', 'manager': True, 'via': 'pin'}))
    who = _team_pin_lookup(pin)
    if who:
        return jsonify(_sign_in({'role': who['role'], 'name': who['name'], 'via': 'pin'}))
    _record_failure(ip)
    return jsonify({'error': 'Incorrect PIN'}), 401

@app.route('/api/manager/logout', methods=['POST'])
def manager_logout():
    _sign_out()
    return jsonify({'success': True})

@app.route('/api/manager/status', methods=['GET'])
def manager_status():
    manager = bool(session.get('manager'))
    user = session.get('user') if isinstance(session.get('user'), dict) else None
    out = {'isManager': manager, 'isDirector': manager and bool(session.get('director')),
           'isOwner': manager and bool(session.get('owner')),
           'directorPinSet': manager and bool(db.reference(DIRECTOR_PIN_PATH).get()),
           'user': {k: user.get(k) for k in ('name', 'role', 'via')} if user else None}
    if GOOGLE_CLIENT_ID:
        out['googleClientId'] = GOOGLE_CLIENT_ID   # public by design: the sign-in button needs it
    return jsonify(out)

# ===== ACCOUNTS (Tim, Oct 17 2026) =====
# Who someone is, and what they may see, from one of two sign-ins on the
# PIN screen:
#  - Sign in with Google. The page gets an ID token from Google; the server
#    checks it against GOOGLE_CLIENT_ID. An account at a DIRECTOR_EMAIL_DOMAINS
#    address (cfabuda.com) is a director; ACCOUNT_OWNER_EMAILS are directors
#    who also manage the lists below (Tim); any other address has to be on
#    the Google accounts list (secure/accounts) with a role.
#  - A 6-digit clock-in PIN from the team PIN list (secure/teamPins): the
#    owner uploads name, PIN and role; the PIN is kept as an HMAC with a
#    server-side salt, so the list never holds the PINs themselves. The
#    manager and director PINs keep working beside these.
# Manage and everything behind it is for DIRECTORS AND UP only (Tim, Oct 18
# 2026): a store Google account (director), an owner-listed Google account,
# or the manager and director PINs. A team PIN, whatever its role (Team
# Lead, Trainer, Team Member), signs the person in by name for what we build
# for those roles later; it never opens Manage and never reads private data.
# Their session ends at 3 AM so a shared phone doesn't carry it into the
# next day. The page is told name and role; the server decides what each
# role may read and change.
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '').strip()
ACCOUNT_OWNER_EMAILS = {e.strip().lower() for e in os.environ.get('ACCOUNT_OWNER_EMAILS', '').split(',') if e.strip()}
DIRECTOR_EMAIL_DOMAINS = {d.strip().lower().lstrip('@') for d in os.environ.get('DIRECTOR_EMAIL_DOMAINS', 'cfabuda.com').split(',') if d.strip()}
ACCOUNTS_PATH = 'secure/accounts'        # {key: {email, name, role, addedAt}}
TEAM_PINS_PATH = 'secure/teamPins'       # {hmac: {name, role, addedAt}}
TEAM_PIN_SALT_PATH = 'secure/teamPinSalt'
TEAM_ROLES = ('lead', 'trainer', 'member', 'admin')   # what a team PIN can carry: never Manage
ROLES = ('director',) + TEAM_ROLES
ROLE_LABELS = {'director': 'Director', 'manager': 'Manager PIN', 'lead': 'Team Lead', 'trainer': 'Trainer', 'member': 'Team Member', 'admin': 'Admin Team'}
TEAM_PIN_RE = re.compile(r'^\d{6}$')
TEAM_SESSION_ENDS_HOUR = 3               # a trainer's or team member's sign-in ends at 3 AM store time
_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

def _email_key(email):
    return hashlib.sha1(email.strip().lower().encode('utf-8')).hexdigest()[:20]

def _sign_in(who):
    """Sets the session for a signed-in person and returns the reply."""
    role = who.get('role') if who.get('role') in ROLES + ('manager',) else 'member'
    name = str(who.get('name') or '').strip()
    session.clear()
    session.permanent = True
    # Manage is for directors and up: Google directors and the manager and
    # director PINs. Never a team role.
    manager = role in ('director', 'manager') and (role == 'director' or bool(who.get('manager')))
    if manager:
        session['manager'] = True
    if role == 'director':
        session['director'] = True
    if who.get('owner') and role == 'director':
        session['owner'] = True
    if not manager:
        now = datetime.now(levelset_sync.STORE_TZ)
        ends = now.replace(hour=TEAM_SESSION_ENDS_HOUR, minute=0, second=0, microsecond=0)
        if ends <= now:
            ends += timedelta(days=1)
        session['teamEnds'] = int(ends.timestamp())
    session['user'] = {'name': name, 'role': role, 'via': who.get('via') or 'pin', 'email': who.get('email') or ''}
    return {'success': True, 'director': role == 'director', 'manager': manager,
            'owner': bool(session.get('owner')), 'role': role, 'roleLabel': ROLE_LABELS[role], 'name': name}

def _sign_out():
    for k in ('manager', 'director', 'owner', 'user', 'teamEnds'):
        session.pop(k, None)

@app.before_request
def _end_team_sessions():
    ends = session.get('teamEnds')
    if isinstance(ends, int) and time.time() > ends and not session.get('manager'):
        _sign_out()

# The PIN list is checked against the manager and director PINs, which
# would otherwise shadow (or be mistaken for) a team member's (Tim, Oct 20
# 2026: saving the team's PINs did nothing). Two slow password checks a row
# made a full report take minutes, so each manage PIN's team-PIN key is kept
# when it's typed (a login or set-pin) and checked in an instant; a hash
# without a key yet still gets the slow check.
MANAGE_PIN_KEYS_PATH = 'secure/managePinKeys'   # {manager|director: {hash, key}}
MANAGE_PIN_NAMES = (('manager', 'secure/managerPinHash'), ('director', 'secure/directorPinHash'))

def _remember_manage_pin(name, stored_hash, pin):
    try:
        _keep_manage_pin_key(name, stored_hash, pin)
    except Exception as e:                 # never in the way of a sign-in
        print(f'[PIN] Could not keep the {name} PIN key: {e}')

def _keep_manage_pin_key(name, stored_hash, pin):
    salt = _team_pin_salt(create=True)
    keys = db.reference(MANAGE_PIN_KEYS_PATH).get() or {}
    have = keys.get(name) if isinstance(keys, dict) else None
    key = _team_pin_key(pin, salt)
    if not (isinstance(have, dict) and have.get('hash') == stored_hash and have.get('key') == key):
        db.reference(f'{MANAGE_PIN_KEYS_PATH}/{name}').set({'hash': stored_hash, 'key': key})

def _manage_pin_checker():
    salt = _team_pin_salt()
    keys = db.reference(MANAGE_PIN_KEYS_PATH).get() or {}
    keys = keys if isinstance(keys, dict) else {}
    fast, slow = set(), []
    for name, path in MANAGE_PIN_NAMES:
        h = db.reference(path).get()
        if not h:
            continue
        k = keys.get(name)
        if salt and isinstance(k, dict) and k.get('hash') == h and k.get('key'):
            fast.add(k['key'])
        else:
            slow.append(h)
    return lambda pin: (bool(salt) and _team_pin_key(pin, salt) in fast) or any(check_password_hash(h, pin) for h in slow)

def _team_pin_salt(create=False):
    salt = db.reference(TEAM_PIN_SALT_PATH).get()
    if (not isinstance(salt, str) or len(salt) < 32) and create:
        salt = secrets.token_hex(32)
        db.reference(TEAM_PIN_SALT_PATH).set(salt)
    return salt if isinstance(salt, str) and len(salt) >= 32 else None

def _team_pin_key(pin, salt):
    return hmac.new(salt.encode('ascii'), str(pin).encode('utf-8'), 'sha256').hexdigest()

def _team_pin_lookup(pin):
    if not TEAM_PIN_RE.match(str(pin)):
        return None
    salt = _team_pin_salt()
    if not salt:
        return None
    rec = db.reference(f'{TEAM_PINS_PATH}/{_team_pin_key(pin, salt)}').get()
    if isinstance(rec, dict) and rec.get('name') and rec.get('role') in TEAM_ROLES:
        return {'name': str(rec['name']), 'role': rec['role']}
    return None

def _google_role(email):
    """The role for a verified Google address, or None when it isn't welcome."""
    email = email.strip().lower()
    domain = email.rsplit('@', 1)[-1]
    if email in ACCOUNT_OWNER_EMAILS:
        return {'role': 'director', 'owner': True}
    if domain in DIRECTOR_EMAIL_DOMAINS:
        return {'role': 'director'}
    rec = db.reference(f'{ACCOUNTS_PATH}/{_email_key(email)}').get()
    # Listed addresses are directors (Manage is for directors and up); a
    # record from an earlier build with a team role still isn't let in.
    if isinstance(rec, dict) and rec.get('role') == 'director' and str(rec.get('email') or '').lower() == email:
        return {'role': 'director', 'name': rec.get('name') or ''}
    return None

@app.route('/api/auth/google', methods=['POST'])
def auth_google():
    ip = _client_ip()
    if _too_many_attempts(ip):
        return jsonify({'error': 'Too many attempts. Try again in a minute.'}), 429
    if not GOOGLE_CLIENT_ID:
        return jsonify({'error': 'Google sign-in isn’t set up on the server yet.'}), 400
    credential = (request.get_json(silent=True) or {}).get('credential')
    if not isinstance(credential, str) or not credential:
        return jsonify({'error': 'No sign-in received.'}), 400
    try:
        claims = id_token.verify_oauth2_token(credential, google_requests.Request(), GOOGLE_CLIENT_ID, clock_skew_in_seconds=10)
    except ValueError:
        _record_failure(ip)
        return jsonify({'error': 'Google didn’t confirm that sign-in. Try again.'}), 401
    except Exception as e:
        print(f"[GOOGLE SIGN-IN ERROR] {type(e).__name__}")
        return jsonify({'error': 'Couldn’t reach Google to check the sign-in.'}), 502
    email = str(claims.get('email') or '').strip().lower()
    if not email or not claims.get('email_verified'):
        _record_failure(ip)
        return jsonify({'error': 'That Google account’s email isn’t verified.'}), 401
    who = _google_role(email)
    if not who:
        _record_failure(ip)
        return jsonify({'error': 'That Google account isn’t on the hub’s list. Ask Tim to add it.'}), 403
    name = str(claims.get('name') or who.get('name') or email.split('@')[0]).strip()
    print(f"[SIGN-IN] google {who['role']}")
    return jsonify(_sign_in(dict(who, name=who.get('name') or name, email=email, via='google')))

def _owner_only():
    if not session.get('manager') or not session.get('owner'):
        return jsonify({'error': 'Only the hub’s owner can change accounts.'}), 403
    return None

def _accounts_out():
    accounts = db.reference(ACCOUNTS_PATH).get() or {}
    pins = db.reference(TEAM_PINS_PATH).get() or {}
    google = sorted(({'email': v.get('email'), 'name': v.get('name') or '', 'role': v.get('role'), 'addedAt': v.get('addedAt')}
                     for v in accounts.values() if isinstance(v, dict)), key=lambda a: str(a['email']))
    team = sorted(({'name': v.get('name'), 'role': v.get('role'), 'addedAt': v.get('addedAt')} for v in pins.values() if isinstance(v, dict)),
                  key=lambda a: str(a['name']).lower())
    return {'google': google, 'pins': team, 'owners': sorted(ACCOUNT_OWNER_EMAILS), 'directorDomains': sorted(DIRECTOR_EMAIL_DOMAINS),
            'googleReady': bool(GOOGLE_CLIENT_ID), 'roles': [{'id': r, 'label': ROLE_LABELS[r]} for r in TEAM_ROLES]}

@app.route('/api/accounts', methods=['GET'])
def accounts_get():
    gate = _owner_only()
    if gate:
        return gate
    return jsonify(_accounts_out())

@app.route('/api/accounts/google', methods=['POST', 'DELETE'])
def accounts_google():
    gate = _owner_only()
    if gate:
        return gate
    body = request.get_json(silent=True) or {}
    email = str(body.get('email') or '').strip().lower()
    if not _EMAIL_RE.match(email) or len(email) > 120:
        return jsonify({'error': 'That isn’t an email address.'}), 400
    ref = db.reference(f'{ACCOUNTS_PATH}/{_email_key(email)}')
    if request.method == 'DELETE':
        ref.delete()
    else:
        # Every listed Google account is a director for now (executive and
        # operator permissions come later).
        ref.set({'email': email, 'name': str(body.get('name') or '').strip()[:80], 'role': 'director', 'addedAt': int(time.time())})
    return jsonify(dict(_accounts_out(), success=True))

@app.route('/api/accounts/pins', methods=['POST', 'DELETE'])
def accounts_pins():
    """Replace or add to the team PIN list (POST {rows: [{name, pin, role}],
    replace}); remove one person (DELETE {name}). The PINs themselves are
    never stored or echoed."""
    gate = _owner_only()
    if gate:
        return gate
    body = request.get_json(silent=True) or {}
    ref = db.reference(TEAM_PINS_PATH)
    if request.method == 'DELETE':
        name = str(body.get('name') or '').strip().lower()
        pins = dict(ref.get() or {})
        gone = [k for k, v in pins.items() if isinstance(v, dict) and str(v.get('name') or '').strip().lower() == name]
        for k in gone:
            db.reference(f'{TEAM_PINS_PATH}/{k}').delete()
        if gone:
            _turnover_after_pins(pins, {k: v for k, v in pins.items() if k not in gone}, source='pin-removed')
        return jsonify(dict(_accounts_out(), success=True, removed=len(gone)))
    rows = body.get('rows')
    if not isinstance(rows, list) or not rows or len(rows) > 500:
        return jsonify({'error': 'Send the list as rows of name, PIN and role.'}), 400
    salt = _team_pin_salt(create=True)
    before = dict(ref.get() or {})
    is_manage_pin = _manage_pin_checker()
    clean, skipped, seen = {}, [], set()
    directors = 0
    for i, r in enumerate(rows):
        if not isinstance(r, dict):
            skipped.append(f'row {i + 1}: not a row')
            continue
        name = str(r.get('name') or '').strip()[:80]
        pin = str(r.get('pin') or '').strip()
        role = str(r.get('role') or 'member').strip().lower()
        role = {'team member': 'member', 'tm': 'member', 'team lead': 'lead', 'team leader': 'lead', 'tl': 'lead', 'admin team': 'admin'}.get(role, role)
        if not name:
            skipped.append(f'row {i + 1}: no name')
        elif not TEAM_PIN_RE.match(pin):
            skipped.append(f'{name}: the PIN isn’t 6 digits')
        elif role == 'director':
            directors += 1
            skipped.append(f'{name}: directors sign in with Google or the director PIN; a clock-in PIN never opens Manage')
        elif role not in TEAM_ROLES:
            skipped.append(f'{name}: role “{r.get("role")}” isn’t one of Team Member, Trainer, Team Lead, Admin Team')
        elif pin in seen:
            skipped.append(f'{name}: the same PIN as someone else in the list')
        elif _team_pin_key(pin, salt) not in before and is_manage_pin(pin):   # one already on the list was checked when added
            skipped.append(f'{name}: that PIN is the manager or director PIN')
        else:
            seen.add(pin)
            clean[_team_pin_key(pin, salt)] = {'name': name, 'role': role, 'addedAt': int(time.time())}
    if body.get('replace'):
        ref.set(clean)
        after = clean
    else:
        if clean:
            ref.update(clean)
        after = dict(before, **clean)
    # The whole report replaces the list: whoever dropped off it left.
    _turnover_after_pins(before, after, source='pin-report' if body.get('replace') else '',
                         directors=directors if body.get('replace') else None)
    return jsonify(dict(_accounts_out(), success=True, added=len(clean), skipped=skipped))

PIN_REPORT_MAX_BYTES = 5 * 1024 * 1024

# ===== TEAM HEADCOUNT AND DEPARTURES =====
# Ashley on the admin team (TIM-81, Oct 20 2026): the real number on the team,
# who left most recently, quit or let go, and why. The team is the clock-in
# PIN list (the store's PIN report: everyone with a PIN is on payroll), plus
# the directors the last full report named. Each change to the list records
# the day's count; whoever drops off a full report, or has their PIN removed,
# waits as a departure to explain. Departures can also be logged by hand.
# Why someone left is an HR record: it is kept here, outside the page's
# shared data and every export, and only a director (any manager session) or
# an Admin Team sign-in reads or writes it.
TURNOVER_PATH = 'secure/teamTurnover'     # {counts: {iso: {...}}, departures: {id: {...}}, hires: {key: {name, date}}}
DEPARTURE_TYPES = {'quit': 'Quit', 'let-go': 'Let go', 'no-show': 'No-call / no-show', 'moved': 'School or moved',
                   'transfer': 'Transfer', 'other': 'Other'}
REHIRE_CHOICES = ('yes', 'no', 'unsure')
TURNOVER_COUNTS_KEPT = 400
# Team profiles (TIM-82): per person, the food handler permit's expiry, hire
# date, birthday (minors) and notes. Same keeping and access as above.
PROFILES_PATH = 'secure/teamProfiles'     # {key: {name, permitExpires, hireDate, birthday, notes, by, at}}
PROFILE_DATES = ('permitExpires', 'hireDate', 'birthday')
_turnover_lock = threading.Lock()


def _turnover_today():
    return datetime.now(levelset_sync.STORE_TZ).date().isoformat()


_firebase_pool = ThreadPoolExecutor(max_workers=4)


def _firebase_get_all(*paths):
    """Read several Firebase paths at once: the time of one trip, not one per
    path. A failed read raises, as a single read would."""
    return [f.result() for f in [_firebase_pool.submit(lambda p=p: db.reference(p).get()) for p in paths]]


def _turnover_key(name):
    return re.sub(r'\s+', ' ', str(name or '')).strip().lower()


def _turnover_access():
    if session.get('manager'):
        return True
    user = session.get('user') or {}
    return user.get('role') == 'admin'


def _turnover_after_pins(before, after, source, directors=None):
    """Record the day's headcount after the PIN list changed and, for a full
    report or a removed PIN (source), the people who dropped off it. Never
    fails the PIN save it follows."""
    try:
        names = lambda pins: {_turnover_key(v.get('name')): v for v in (pins or {}).values() if isinstance(v, dict) and v.get('name')}
        old, new = names(before), names(after)
        with _turnover_lock:
            ref = db.reference(TURNOVER_PATH)
            data = ref.get() or {}
            counts = data.get('counts') or {}
            departures = data.get('departures') or {}
            hires = data.get('hires') or {}
            today = _turnover_today()
            last = counts[max(counts)] if counts else {}
            if directors is None:
                directors = int(last.get('directors') or 0)
            by_role = Counter(v.get('role') or 'member' for v in new.values())
            left = [old[k] for k in old if k not in new] if source else []
            joined = [new[k] for k in new if k not in old] if old else []
            prev = counts.get(today) or {}
            counts[today] = {'total': len(new) + directors, 'team': len(new), 'directors': directors,
                             'byRole': dict(by_role), 'joined': int(prev.get('joined') or 0) + len(joined),
                             'left': int(prev.get('left') or 0) + len(left), 'at': int(time.time())}
            for k in sorted(counts)[:-TURNOVER_COUNTS_KEPT]:
                counts.pop(k)
            for v in joined:
                hires[secrets.token_hex(5)] = {'name': v.get('name'), 'role': v.get('role') or 'member', 'date': today}
            # Still waiting to be explained but back on the list: a false alarm.
            for d in departures.values():
                if isinstance(d, dict) and d.get('status') == 'pending' and _turnover_key(d.get('name')) in new:
                    d.update(status='dismissed', note='back on the PIN list')
            open_names = {_turnover_key(d.get('name')) for d in departures.values() if isinstance(d, dict) and d.get('status') == 'pending'}
            for v in left:
                if _turnover_key(v.get('name')) in open_names:
                    continue
                departures[secrets.token_hex(6)] = {'name': v.get('name'), 'role': v.get('role') or 'member', 'status': 'pending',
                                                    'source': source, 'noticed': today, 'at': int(time.time())}
            ref.set({'counts': counts, 'departures': departures, 'hires': hires})
        if left or joined:
            print(f"[TEAM] {len(new) + directors} on the team; {len(left)} left, {len(joined)} joined")
    except Exception as e:
        print(f"[TEAM] couldn’t record the headcount: {type(e).__name__}")


def _turnover_out():
    # The three reads at once, not one after another (Our Team opened slowly;
    # Tim, Oct 22 2026).
    data, pins, profiles = _firebase_get_all(TURNOVER_PATH, TEAM_PINS_PATH, PROFILES_PATH)
    data, pins, profiles = data or {}, pins or {}, profiles or {}
    counts = data.get('counts') or {}
    last = counts[max(counts)] if counts else {}
    team = [{'name': v.get('name'), 'role': v.get('role') or 'member'} for v in pins.values() if isinstance(v, dict) and v.get('name')]
    directors = int(last.get('directors') or 0)
    departures = sorted(({**v, 'id': k} for k, v in (data.get('departures') or {}).items() if isinstance(v, dict)),
                        key=lambda d: (d.get('lastDay') or d.get('noticed') or '', d.get('at') or 0), reverse=True)
    hires = sorted((v for v in (data.get('hires') or {}).values() if isinstance(v, dict)), key=lambda h: h.get('date') or '', reverse=True)
    return {'now': {'total': len(team) + directors, 'team': len(team), 'directors': directors,
                    'byRole': dict(Counter(p['role'] for p in team))},
            'counts': [dict(v, date=k) for k, v in sorted(counts.items())],
            'departures': departures, 'hires': hires[:200],
            'names': sorted(p['name'] for p in team),
            'team': sorted(team, key=lambda p: _turnover_key(p['name'])),
            'types': [{'id': k, 'label': v} for k, v in DEPARTURE_TYPES.items()],
            'profiles': sorted((v for v in profiles.values() if isinstance(v, dict) and v.get('name')),
                               key=lambda p: _turnover_key(p['name']))}


def _profile_key(name):
    return hashlib.sha256(_turnover_key(name).encode()).hexdigest()[:20]


@app.route('/api/team/profiles/read', methods=['POST'])
def team_profiles_read():
    """A spreadsheet of permit dates (Tim, Oct 20 2026): read into rows of name
    and dates for the page to check before saving (/api/team/profiles/bulk).
    Nothing from the file is kept or logged."""
    if not _turnover_access():
        return jsonify({'error': 'Directors and the admin team only.'}), 403
    f = request.files.get('file')
    if not f:
        return jsonify({'error': 'Pick the spreadsheet first.'}), 400
    data = f.read(PIN_REPORT_MAX_BYTES + 1)
    if len(data) > PIN_REPORT_MAX_BYTES:
        return jsonify({'error': 'That file is over 5 MB.'}), 413
    try:
        out = read_permit_sheet(data, f.filename or '')
    except PermitSheetError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f"[PERMIT SHEET] couldn’t read: {type(e).__name__}")
        return jsonify({'error': 'Couldn’t read that spreadsheet.'}), 400
    resp = jsonify(out)
    resp.headers['Cache-Control'] = 'no-store'
    return resp


@app.route('/api/team/profiles/bulk', methods=['POST'])
def team_profiles_bulk():
    """Save the checked rows of a permit spreadsheet ({rows: [{name,
    permitExpires?, hireDate?, birthday?}]}): each date given is set on the
    person's profile; nothing else on it changes."""
    if not _turnover_access():
        return jsonify({'error': 'Directors and the admin team only.'}), 403
    rows = (request.get_json(silent=True) or {}).get('rows')
    if not isinstance(rows, list) or not rows or len(rows) > 1000:
        return jsonify({'error': 'Nothing to save.'}), 400
    by = str((session.get('user') or {}).get('name') or ('Director' if session.get('manager') else '')).strip()[:80]
    ref = db.reference(PROFILES_PATH)
    profiles = dict(ref.get() or {})
    changes = {}
    for r in rows:
        if not isinstance(r, dict):
            continue
        name = re.sub(r'\s+', ' ', str(r.get('name') or '')).strip()[:80]
        dates = {k: str(r.get(k) or '').strip() for k in PROFILE_DATES}
        dates = {k: v for k, v in dates.items() if re.fullmatch(r'\d{4}-\d{2}-\d{2}', v)}
        if not name or not dates:
            continue
        key = _profile_key(name)
        old = profiles.get(key) if isinstance(profiles.get(key), dict) else {}
        changes[key] = dict(old, name=old.get('name') or name, **dates, by=by, at=int(time.time()))
    # Only these people's profiles are written, so a profile saved meanwhile stays.
    if changes:
        ref.update(changes)
    saved = len(changes)
    print(f"[TEAM] permit sheet: {saved} profiles updated")
    resp = jsonify(dict(_turnover_out(), success=True, saved=saved))
    resp.headers['Cache-Control'] = 'no-store'
    return resp


@app.route('/api/team/profiles', methods=['POST'])
def team_profiles():
    """Save one person's profile ({name, permitExpires, hireDate, birthday,
    notes}; a blank date clears it). {name, remove: true} deletes it."""
    if not _turnover_access():
        return jsonify({'error': 'Directors and the admin team only.'}), 403
    body = request.get_json(silent=True) or {}
    name = re.sub(r'\s+', ' ', str(body.get('name') or '')).strip()[:80]
    if not name:
        return jsonify({'error': 'Whose profile?'}), 400
    ref = db.reference(f'{PROFILES_PATH}/{_profile_key(name)}')
    if body.get('remove'):
        ref.delete()
    else:
        rec = {'name': name}
        for k in PROFILE_DATES:
            v = str(body.get(k) or '').strip()
            if v and not re.fullmatch(r'\d{4}-\d{2}-\d{2}', v):
                return jsonify({'error': 'Dates as year-month-day.'}), 400
            if v:
                rec[k] = v
        notes = str(body.get('notes') or '').strip()[:1500]
        if notes:
            rec['notes'] = notes
        rec['by'] = str((session.get('user') or {}).get('name') or ('Director' if session.get('manager') else '')).strip()[:80]
        rec['at'] = int(time.time())
        ref.set(rec)
    resp = jsonify(dict(_turnover_out(), success=True))
    resp.headers['Cache-Control'] = 'no-store'
    return resp


@app.route('/api/team/headcount', methods=['GET'])
def team_headcount():
    if not _turnover_access():
        return jsonify({'error': 'Directors and the admin team only.'}), 403
    resp = jsonify(_turnover_out())
    resp.headers['Cache-Control'] = 'no-store'
    return resp


@app.route('/api/team/role', methods=['POST'])
def team_role():
    """Set someone's role on the clock-in PIN list ({name, role}) from the
    team list in Manage → Directors (Tim, Oct 23 2026: one list, each person
    with their role). Directors and the manager PIN only. A team role only:
    a clock-in PIN never opens Manage. The PIN stays as it is."""
    if not session.get('manager'):
        return jsonify({'error': 'Directors only.'}), 403
    body = request.get_json(silent=True) or {}
    name = re.sub(r'\s+', ' ', str(body.get('name') or '')).strip()
    role = str(body.get('role') or '')
    if not name:
        return jsonify({'error': 'Whose role?'}), 400
    if role not in TEAM_ROLES:
        return jsonify({'error': 'Pick Team Member, Trainer, Team Lead or Admin Team.'}), 400
    pins = db.reference(TEAM_PINS_PATH).get() or {}
    keys = [k for k, v in pins.items() if isinstance(v, dict) and _turnover_key(v.get('name')) == _turnover_key(name)]
    if not keys:
        return jsonify({'error': 'That name isn’t on the PIN list. Reload and try again.'}), 404
    for k in keys:
        db.reference(f'{TEAM_PINS_PATH}/{k}').set(dict(pins[k], role=role))
    print(f"[TEAM] role set: {ROLE_LABELS[role]}")
    resp = jsonify(dict(_turnover_out(), success=True))
    resp.headers['Cache-Control'] = 'no-store'
    return resp


@app.route('/api/team/departures', methods=['POST', 'DELETE'])
def team_departures():
    """Log or update a departure ({id?, name, lastDay, type, reason, rehire}),
    dismiss a false alarm ({id, status: 'dismissed'}), or remove one logged
    by mistake (DELETE {id})."""
    if not _turnover_access():
        return jsonify({'error': 'Directors and the admin team only.'}), 403
    body = request.get_json(silent=True) or {}
    did = str(body.get('id') or '')
    if did and not re.fullmatch(r'[0-9a-f]{8,16}', did):
        return jsonify({'error': 'Unknown departure.'}), 400
    by = str((session.get('user') or {}).get('name') or ('Director' if session.get('manager') else '')).strip()[:80]
    with _turnover_lock:
        ref = db.reference(TURNOVER_PATH)
        data = ref.get() or {}
        departures = data.get('departures') or {}
        if did and did not in departures:
            return jsonify({'error': 'That departure isn’t there any more. Reload.'}), 404
        if request.method == 'DELETE':
            if not did:
                return jsonify({'error': 'Which departure?'}), 400
            departures.pop(did)
        elif body.get('status') == 'dismissed':
            if not did:
                return jsonify({'error': 'Which departure?'}), 400
            departures[did] = dict(departures[did], status='dismissed', by=by, at=int(time.time()))
        else:
            name = re.sub(r'\s+', ' ', str(body.get('name') or '')).strip()[:80]
            last_day = str(body.get('lastDay') or '')
            kind = body.get('type')
            rehire = body.get('rehire') or 'unsure'
            if not name:
                return jsonify({'error': 'Who left?'}), 400
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', last_day):
                return jsonify({'error': 'Pick their last day.'}), 400
            if kind not in DEPARTURE_TYPES:
                return jsonify({'error': 'Pick quit, let go or another reason.'}), 400
            if rehire not in REHIRE_CHOICES:
                return jsonify({'error': 'Eligible for rehire: yes, no or not sure.'}), 400
            old = departures.get(did) or {}
            rec = {'name': name, 'role': str(body.get('role') or old.get('role') or '')[:20], 'lastDay': last_day, 'type': kind,
                   'reason': str(body.get('reason') or '').strip()[:600], 'rehire': rehire, 'status': 'logged',
                   'source': old.get('source') or 'manual', 'noticed': old.get('noticed') or _turnover_today(),
                   'by': by, 'at': int(time.time())}
            departures[did or secrets.token_hex(6)] = rec
        data['departures'] = departures
        ref.set(data)
    resp = jsonify(dict(_turnover_out(), success=True))
    resp.headers['Cache-Control'] = 'no-store'
    return resp

@app.route('/api/accounts/pins/read', methods=['POST'])
def accounts_pins_read():
    """The store's PIN report as a PDF (Tim, Oct 19 2026): read it into rows
    of name, PIN and role and hand them back to the owner's page to check
    and save (/api/accounts/pins). Nothing from the file is kept or logged."""
    gate = _owner_only()
    if gate:
        return gate
    f = request.files.get('file')
    if not f:
        return jsonify({'error': 'Pick the PIN report first.'}), 400
    data = f.read(PIN_REPORT_MAX_BYTES + 1)
    if len(data) > PIN_REPORT_MAX_BYTES:
        return jsonify({'error': 'That file is over 5 MB.'}), 413
    try:
        out = read_pin_report(data)
    except PinReportError as e:
        return jsonify({'error': str(e)}), 400
    resp = jsonify(out)
    resp.headers['Cache-Control'] = 'no-store'
    return resp

@app.route('/api/reports/analytics-pdf', methods=['POST'])
def reports_analytics_pdf():
    """An Analytics Hub dashboard PDF from the Schedule Builder's bundle
    (Daily Detail and Sales Data, Tim, Oct 20 2026; Productivity, Labor Cost
    and Sales Curve, Oct 22): read into rows for the page to file
    (analytics_pdf.py). Managers only; nothing from the file is kept."""
    if not session.get('manager'):
        return jsonify({'error': 'Manager sign-in required'}), 403
    f = request.files.get('file')
    if not f:
        return jsonify({'error': 'Pick the PDF first.'}), 400
    data = f.read(PIN_REPORT_MAX_BYTES + 1)
    if len(data) > PIN_REPORT_MAX_BYTES:
        return jsonify({'error': 'That file is over 5 MB.'}), 413
    try:
        out = read_analytics_pdf(data)
    except AnalyticsPdfError as e:
        return jsonify({'error': str(e), 'notAnalytics': True}), 400
    resp = jsonify(out)
    resp.headers['Cache-Control'] = 'no-store'
    return resp

@app.route('/api/manager/set-pin', methods=['POST'])
def manager_set_pin():
    if not session.get('manager'):
        return jsonify({'error': 'Not authorized'}), 403

    data = request.json or {}
    new_pin = data.get('pin', '')
    if not new_pin or len(new_pin) < 4:
        return jsonify({'error': 'PIN must be at least 4 characters'}), 400

    if _pin_taken(DIRECTOR_PIN_PATH, new_pin):
        return jsonify({'error': 'That PIN can’t be used. Pick another.'}), 400

    new_hash = generate_password_hash(new_pin)
    db.reference('secure/managerPinHash').set(new_hash)
    _remember_manage_pin('manager', new_hash, new_pin)
    return jsonify({'success': True})

# ===== UNIFORM PICTURES =====
# A picture per uniform item (Tim, Oct 16 2026), so the team member sees
# what they're ordering. Managers upload them in Manage → Uniforms; the page
# shrinks each one first (a JPEG about 640px wide). They're kept apart from
# the app state ('uniformImages/<item id>': {type, data (base64), v}) so the
# 30-second sync never carries them, and served with long caching: the
# catalog item holds the version, so a new picture is a new URL.
UNIFORM_IMAGES_PATH = 'uniformImages'
UNIFORM_IMAGE_MAX_BYTES = 400 * 1024
UNIFORM_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/webp'}
_UNIFORM_ID = re.compile(r'^[A-Za-z0-9_-]{1,64}$')
_uniform_image_cache = {}   # {item id: (v, type, bytes)}: a picture read once per server start

def _uniform_image_signature(raw):
    if raw.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if raw.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if raw[:4] == b'RIFF' and raw[8:12] == b'WEBP':
        return 'image/webp'
    return None

UNIFORM_BUNDLED_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'uniforms')

@app.route('/api/uniform-image/<item_id>', methods=['GET'])
def uniform_image_get(item_id):
    if not _UNIFORM_ID.match(item_id):
        return jsonify({'error': 'Not found'}), 404
    cached = _uniform_image_cache.get(item_id)
    if not cached:
        rec = db.reference(f'{UNIFORM_IMAGES_PATH}/{item_id}').get()
        if not isinstance(rec, dict) or not rec.get('data'):
            # A picture that came with the item (static/uniforms; the men's
            # outerwear, Oct 23 2026), until a manager uploads another.
            bundled = os.path.join(UNIFORM_BUNDLED_DIR, f'{item_id}.jpg')
            if not os.path.isfile(bundled):
                return jsonify({'error': 'Not found'}), 404
            with open(bundled, 'rb') as f:
                raw = f.read()
            rec = {'v': 'bundled'}
        else:
            try:
                raw = base64.b64decode(rec['data'], validate=True)
            except (ValueError, TypeError):
                return jsonify({'error': 'Not found'}), 404
        cached = (str(rec.get('v') or ''), _uniform_image_signature(raw) or 'image/jpeg', raw)
        _uniform_image_cache[item_id] = cached
    v, ctype, raw = cached
    etag = f'"{v}"'
    if v and request.headers.get('If-None-Match') == etag:
        return Response(status=304)
    res = Response(raw, mimetype=ctype)
    # The URL carries the version, so a picture never changes under it.
    res.headers['Cache-Control'] = 'public, max-age=31536000, immutable' if request.args.get('v') == v and v else 'no-cache'
    res.headers['ETag'] = etag
    res.headers['X-Content-Type-Options'] = 'nosniff'
    return res

@app.route('/api/uniform-image/<item_id>', methods=['POST', 'DELETE'])
def uniform_image_set(item_id):
    if not session.get('manager'):
        return jsonify({'error': 'Manager sign-in required'}), 403
    if not _UNIFORM_ID.match(item_id):
        return jsonify({'error': 'Bad item'}), 400
    ref = db.reference(f'{UNIFORM_IMAGES_PATH}/{item_id}')
    if request.method == 'DELETE':
        ref.delete()
        _uniform_image_cache.pop(item_id, None)
        return jsonify({'success': True})
    if request.content_length and request.content_length > UNIFORM_IMAGE_MAX_BYTES * 2:
        return jsonify({'error': 'That picture is too big.'}), 413
    data = (request.get_json(silent=True) or {}).get('data')
    m = re.match(r'^data:(image/[a-z]+);base64,([A-Za-z0-9+/=]+)$', data or '')
    if not m:
        return jsonify({'error': 'Send the picture as a JPEG, PNG or WebP.'}), 400
    try:
        raw = base64.b64decode(m.group(2), validate=True)
    except (ValueError, TypeError):
        return jsonify({'error': 'That picture couldn’t be read.'}), 400
    ctype = _uniform_image_signature(raw)
    if ctype not in UNIFORM_IMAGE_TYPES:
        return jsonify({'error': 'Send the picture as a JPEG, PNG or WebP.'}), 400
    if len(raw) > UNIFORM_IMAGE_MAX_BYTES:
        return jsonify({'error': 'That picture is too big.'}), 413
    v = hashlib.sha1(raw).hexdigest()[:12]
    ref.set({'type': ctype, 'data': base64.b64encode(raw).decode('ascii'), 'v': v, 'at': int(time.time())})
    _uniform_image_cache[item_id] = (v, ctype, raw)
    return jsonify({'success': True, 'v': v})

# ===== DIRECTOR PIN =====
# Directors sign in on the same PIN screen with their own PIN. The first one
# is set from any manager session (Tim sets it right after this ships); after
# that only a director session can change it. It can't match the manager PIN.
DIRECTOR_PIN_PATH = 'secure/directorPinHash'

def _pin_taken(path, pin):
    """True when `pin` is the PIN stored at `path`. Checking costs a guess
    against the login limit, so this can't be used to find the other PIN."""
    stored = db.reference(path).get()
    if stored and check_password_hash(stored, pin):
        _record_failure(_client_ip())
        return True
    return False

@app.route('/api/director/set-pin', methods=['POST'])
def director_set_pin():
    if not session.get('manager'):
        return jsonify({'error': 'Not authorized'}), 403
    if _too_many_attempts(_client_ip()):
        return jsonify({'error': 'Too many attempts. Try again in a minute.'}), 429
    if db.reference(DIRECTOR_PIN_PATH).get() and not session.get('director'):
        return jsonify({'error': 'Sign in with the director PIN to change it'}), 403

    data = request.json or {}
    new_pin = data.get('pin', '')
    if not isinstance(new_pin, str) or len(new_pin) < 4:
        return jsonify({'error': 'PIN must be at least 4 characters'}), 400
    if _pin_taken('secure/managerPinHash', new_pin):
        return jsonify({'error': 'The director PIN has to be different from the manager PIN.'}), 400

    new_hash = generate_password_hash(new_pin)
    db.reference(DIRECTOR_PIN_PATH).set(new_hash)
    _remember_manage_pin('director', new_hash, new_pin)
    session['director'] = True
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
    notes = reply.pop('notes', None) or []
    try:
        if notes:
            _save_levelset_notes(notes)
    except Exception as e:
        # The ratings still go to the page; the notes come again next sync.
        print(f"[LEVELSET NOTES ERROR] {type(e).__name__}")
    _levelset_last.update(at=now, reply=reply)
    seen = (reply.get('summary') or {}).get('notes') or {}
    print(f"[LEVELSET SYNC] {len(reply['ratings'])} ratings, {len(notes)} notes; "
          f"note-like fields {seen.get('noteLike', {})}; rating fields {seen.get('keys', [])}")
    return jsonify(reply)

# ===== LEVELSET NOTES (directors only) =====
# The notes raters write on a PEA in Levelset. Kept on the server, outside
# the app state (no state route reads this path), and handed out one person
# at a time to director sessions only. {key: {id, at, employee, position,
# leader, overall, text, tags}}; kept LEVELSET_NOTES_KEEP_DAYS.
# tags (Tim, Oct 17 2026): the parts of a note a director tagged to a PEC
# pillar, [{id, text, pillars: ['tl:engage'], at}], so one note can
# evidence several pillars with different sentences. A re-sync rewrites the
# note's own fields and keeps its tags.
LEVELSET_NOTES_PATH = 'levelsetNotes'
LEVELSET_NOTES_KEEP_DAYS = 400
LEVELSET_TAG_MAX = 20                 # tags on one note
LEVELSET_TAG_TEXT_MAX = 1500
_PILLAR_TAG = re.compile(r'^[a-z0-9]{1,20}:[a-z0-9]{1,20}$')
_NOTE_KEY = re.compile(r'^[0-9a-f]{20}$')

def _note_key(n):
    raw = n.get('id') or '|'.join(str(n.get(k) or '') for k in ('at', 'employee', 'position', 'leader'))
    return hashlib.sha1(raw.encode('utf-8')).hexdigest()[:20]

def _person_key(name):
    return ' '.join(str(name or '').lower().split())

def _save_levelset_notes(notes):
    ref = db.reference(LEVELSET_NOTES_PATH)
    stored = ref.get() or {}
    cutoff = (datetime.now(levelset_sync.STORE_TZ) - timedelta(days=LEVELSET_NOTES_KEEP_DAYS)).strftime('%Y-%m-%dT%H:%M')
    changes = {k: None for k, v in stored.items() if not isinstance(v, dict) or str(v.get('at') or '') < cutoff}
    for n in notes:
        k = _note_key(n)
        if n['at'] < cutoff:
            continue
        old = stored.get(k) if isinstance(stored.get(k), dict) else None
        if old is None or any(old.get(f) != n.get(f) for f in n):
            changes[k] = dict(n, tags=old['tags']) if old and isinstance(old.get('tags'), list) else n
    if changes:
        ref.update(changes)

def _squash(text):
    return ' '.join(str(text or '').split())

def _note_tags(rec):
    return [t for t in (rec.get('tags') or []) if isinstance(t, dict) and isinstance(t.get('text'), str)
            and isinstance(t.get('pillars'), list)] if isinstance(rec, dict) else []

def _note_out(key, v):
    return dict({k: v.get(k) for k in ('at', 'position', 'leader', 'overall', 'text')}, key=key,
                tags=[{k: t.get(k) for k in ('id', 'text', 'pillars', 'at')} for t in _note_tags(v)])

@app.route('/api/pea/notes', methods=['POST'])
def pea_notes():
    """One person's Levelset notes, newest first. Director sessions only."""
    if not session.get('manager') or not session.get('director'):
        return jsonify({'error': 'Director sign-in required'}), 403
    name = _person_key((request.get_json(silent=True) or {}).get('name'))
    if not name:
        return jsonify({'error': 'Who?'}), 400
    stored = db.reference(LEVELSET_NOTES_PATH).get() or {}
    notes = sorted(((k, v) for k, v in stored.items() if isinstance(v, dict) and _person_key(v.get('employee')) == name),
                   key=lambda kv: str(kv[1].get('at') or ''), reverse=True)
    return jsonify({'notes': [_note_out(k, v) for k, v in notes]})

@app.route('/api/pea/notes/tag', methods=['POST', 'DELETE'])
def pea_note_tag():
    """Tag part of a Levelset note to PEC pillars (POST {key, text, pillars})
    or remove a tag (DELETE {key, tagId}). Director sessions only. The text
    has to be in the note, so a tag is always the rater's own words."""
    if not session.get('manager') or not session.get('director'):
        return jsonify({'error': 'Director sign-in required'}), 403
    body = request.get_json(silent=True) or {}
    key = str(body.get('key') or '')
    if not _NOTE_KEY.match(key):
        return jsonify({'error': 'Which note?'}), 400
    ref = db.reference(f'{LEVELSET_NOTES_PATH}/{key}')
    rec = ref.get()
    if not isinstance(rec, dict) or not rec.get('text'):
        return jsonify({'error': 'That note isn’t here any more. Sync from Levelset and try again.'}), 404
    tags = _note_tags(rec)
    if request.method == 'DELETE':
        tag_id = str(body.get('tagId') or '')
        tags = [t for t in tags if t.get('id') != tag_id]
    else:
        # The sentences picked (parts), or one stretch of text. Each has to be
        # in the note; non-adjacent sentences are joined with an ellipsis.
        parts = body.get('parts') if isinstance(body.get('parts'), list) else [body.get('text')]
        parts = [_squash(x) for x in parts if isinstance(x, str) and _squash(x)]
        text = ' … '.join(parts)
        pillars = body.get('pillars')
        if not parts or len(parts) > 40 or len(text) > LEVELSET_TAG_TEXT_MAX:
            return jsonify({'error': 'Pick the part of the note to tag.'}), 400
        if any(x not in _squash(rec['text']) for x in parts):
            return jsonify({'error': 'That text isn’t in this note.'}), 400
        if not isinstance(pillars, list) or not pillars or len(pillars) > 12 \
                or not all(isinstance(p, str) and _PILLAR_TAG.match(p) for p in pillars):
            return jsonify({'error': 'Pick at least one pillar.'}), 400
        if len(tags) >= LEVELSET_TAG_MAX:
            return jsonify({'error': f'A note can carry {LEVELSET_TAG_MAX} tags at most.'}), 400
        tags.append({'id': secrets.token_hex(4), 'text': text, 'pillars': sorted(set(pillars)), 'at': int(time.time())})
    ref.update({'tags': tags})
    return jsonify({'success': True, 'note': _note_out(key, dict(rec, tags=tags))})

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
        'now': int(time.time() * 1000),   # the shared clock for timers (serverNow)
    }

@app.route('/api/state/load', methods=['POST'])
def state_load():
    try:
        # From memory (see _cache above); Firebase only when cold, and now and
        # then in the background.
        _ensure_cache(migrate=True)
        _refresh_if_due()
        with _state_lock:
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
        if not _ensure_cache():
            return jsonify({'sections': {}, 'versions': {}, 'build': BUILD, 'now': int(time.time() * 1000)})
        _refresh_if_due()
        with _state_lock:
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
        # A key belongs to one section only: a known key filed under another
        # section is a bug in the page, and the save is refused so it shows.
        # A key no section lists at all (a retired setting) never refuses a
        # save: removing it is cleanup (a page drops what it doesn't know, so
        # its first save of that section removes it), and setting it (a page
        # on old code) is dropped, so the rest of the save still goes
        # through. Refusing the whole save over a retired key took Set Ups
        # out on every device for a day (Oct 2026).
        retired = lambda op: op['p'][0] not in SECTION_OF_KEY
        stray = sorted({op['p'][0] for op in patch['ops'] if not retired(op) and SECTION_OF_KEY[op['p'][0]] != name})
        if stray:
            return jsonify({'error': f'Keys in the wrong section: {", ".join(stray)}'}), 400
        dropped_ops = [op for op in patch['ops'] if retired(op) and not (op['o'] == 'del' and len(op['p']) == 1)]
        if dropped_ops:
            print('[STATE PATCH] dropped changes to retired keys: ' + ', '.join(sorted({op['p'][0] for op in dropped_ops})))
            patch['ops'] = [op for op in patch['ops'] if op not in dropped_ops]

    try:
        _ensure_cache(migrate=True)
        with _state_lock:
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
    # Team Members and Trainers don't see the Safe Count (Tim, Oct 20 2026),
    # nor does a device nobody signed in on (Tim, Oct 21 2026).
    role = (session.get('user') or {}).get('role')
    if not session.get('manager') and (not role or role in ('member', 'trainer')):
        return jsonify({'error': 'The Safe Count is for leaders. Sign in with your clock-in PIN.'}), 403
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

# The last week of safe counts for a Team Lead (Tim, Oct 20 2026: leaders
# should see recent submissions, not the ordering). A director's page has
# the whole log already; everyone else still sees today's only.
SAFE_LEAD_DAYS = 7

@app.route('/api/safe-counts/recent', methods=['GET'])
def safe_counts_recent():
    user = session.get('user') or {}
    if not session.get('manager') and user.get('role') != 'lead':
        return jsonify({'error': 'Team Leads and directors only.'}), 403
    try:
        sections = _read_sections() or {}
    except Exception as e:
        print(f"[SAFE RECENT ERROR] {e}")
        return jsonify({'error': 'Could not read safe counts'}), 500
    since = (datetime.now(levelset_sync.STORE_TZ).date() - timedelta(days=SAFE_LEAD_DAYS - 1)).isoformat()
    counts = (sections.get('safe') or {}).get('safeCounts') or []
    resp = jsonify({'days': SAFE_LEAD_DAYS, 'counts': [c for c in counts if isinstance(c, dict) and str(c.get('date') or '') >= since]})
    resp.headers['Cache-Control'] = 'no-store'
    return resp

# Waste by day, for the team's waste scoreboard (Tim, Oct 18 2026). A team
# device is sent two days of waste entries (WASTE_TEAM_WINDOW_MS), so its
# trend cards read these totals instead: each day's cost, FOH and BOH, over
# the kept log. Totals only, no items or names; from memory.
WASTE_DAYS_KEPT = 90

def _waste_day_of(entry):
    day = entry.get('day')
    if isinstance(day, str) and len(day) == 10:
        return day
    ts = entry.get('ts')
    if not isinstance(ts, (int, float)):
        return None
    return datetime.fromtimestamp(ts / 1000, levelset_sync.STORE_TZ).date().isoformat()

@app.route('/api/waste/days', methods=['GET'])
def waste_days():
    try:
        sections = _read_sections() or {}
    except Exception as e:
        print(f"[WASTE DAYS ERROR] {e}")
        return jsonify({'error': 'Could not read the waste log'}), 500
    cutoff = (datetime.now(levelset_sync.STORE_TZ).date() - timedelta(days=WASTE_DAYS_KEPT)).isoformat()
    days = {}
    for e in (sections.get('waste') or {}).get('entries') or []:
        if not isinstance(e, dict):
            continue
        day = _waste_day_of(e)
        if not day or day < cutoff:
            continue
        cost = e.get('cost')
        if not isinstance(cost, (int, float)):
            continue
        d = days.setdefault(day, {'total': 0.0, 'foh': 0.0, 'boh': 0.0, 'entries': 0})
        d['total'] = round(d['total'] + cost, 2)
        side = 'boh' if e.get('section') == 'boh' else 'foh'
        d[side] = round(d[side] + cost, 2)
        d['entries'] += 1
    return jsonify({'days': days, 'kept': WASTE_DAYS_KEPT})

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
        if not _refresh_cache():
            return jsonify({'error': 'Nothing has been saved yet'}), 404
        with _state_lock:
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

# ===== HUB HEALTH (Tim, Oct 19 2026) =====
# Manage → Hub Health: is the hub doing its job? Counted here, with no names:
#  - saves: every save that landed, every one refused (by status), and the
#    retries (the page says which try a save is, X-Save-Attempt);
#  - visits: one note per page load from each phone (hub-health.js): how long
#    until the page was usable, home-screen app or browser, the signed-in
#    role (never the name), and which tabs it opened.
# Counts gather in memory and are added to the day's record in Firebase
# (HEALTH_PATH/<date>, outside the saved state; no page syncs it) every half
# hour and when the server stops, so a restart loses at most that much.
HEALTH_PATH = 'health'
HEALTH_DAYS_KEPT = 35
HEALTH_FLUSH_SECONDS = 30 * 60
HEALTH_READY_SAMPLES = 300           # load times kept per day
HEALTH_ROLES = ('none', 'member', 'trainer', 'lead', 'admin', 'director', 'manager')
HEALTH_VIEW_RE = re.compile(r'^[a-z]{2,20}$')
HEALTH_OPEN_SAMPLES = 100           # tab open times kept per tab per day
HEALTH_OPENS_PER_NOTE = 20
STARTED_AT = int(time.time() * 1000)
_health_lock = threading.Lock()
_health_pending = {}                 # {date: counts not yet in Firebase}
_health_flushed_at = time.time()
_health_flushing = False
_health_last_save = None             # ms, the last save that landed


def _health_today():
    return datetime.now(levelset_sync.STORE_TZ).date().isoformat()


def _health_add(into, delta):
    """Add one day's counts to another (numbers add, maps add per key, load
    times join and keep the latest HEALTH_READY_SAMPLES)."""
    for k, v in delta.items():
        if k == 'ready':
            into['ready'] = ((into.get('ready') or []) + list(v))[-HEALTH_READY_SAMPLES:]
        elif k == 'opens':
            sub = into.setdefault('opens', {})
            for view, times in v.items():
                sub[view] = ((sub.get(view) or []) + list(times))[-HEALTH_OPEN_SAMPLES:]
        elif k == 'lastSaveAt':
            into[k] = max(into.get(k) or 0, v or 0)
        elif isinstance(v, dict):
            sub = into.setdefault(k, {})
            for kk, n in v.items():
                sub[kk] = (sub.get(kk) or 0) + n
        else:
            into[k] = (into.get(k) or 0) + v
    return into


def _health_note(delta):
    global _health_flushing
    day = _health_today()
    with _health_lock:
        _health_add(_health_pending.setdefault(day, {}), delta)
        due = not _health_flushing and time.time() - _health_flushed_at >= HEALTH_FLUSH_SECONDS
        if due:
            _health_flushing = True
    if due:
        threading.Thread(target=_health_flush, daemon=True).start()


def _health_flush():
    """Add what's pending to each day's record in Firebase."""
    global _health_flushed_at, _health_flushing
    with _health_lock:
        pending = dict(_health_pending)
        _health_pending.clear()
        _health_flushed_at = time.time()
    try:
        for day, delta in pending.items():
            ref = db.reference(f'{HEALTH_PATH}/{day}')
            rec = ref.get()
            ref.set(_health_add(rec if isinstance(rec, dict) else {}, delta))
            old = (date.fromisoformat(day) - timedelta(days=HEALTH_DAYS_KEPT)).isoformat()
            db.reference(f'{HEALTH_PATH}/{old}').delete()
    except Exception as e:
        # Not written: put it back for the next try.
        print(f'[HEALTH] flush failed: {e}')
        with _health_lock:
            for day, delta in pending.items():
                _health_pending[day] = _health_add(delta, _health_pending.get(day, {}))
    finally:
        with _health_lock:
            _health_flushing = False


@app.after_request
def _health_count_saves(response):
    global _health_last_save
    if request.path == '/api/state/patch' and request.method == 'POST':
        try:
            attempt = int(request.headers.get('X-Save-Attempt') or 1)
        except ValueError:
            attempt = 1
        delta = {'retried': 1} if attempt > 1 else {}
        if response.status_code == 200:
            _health_last_save = int(time.time() * 1000)
            delta.update({'saves': 1, 'lastSaveAt': _health_last_save})
        else:
            delta['refused'] = {str(response.status_code): 1}
        _health_note(delta)
    return response


@app.route('/api/health/visit', methods=['POST'])
def health_visit():
    """One phone's note: {visit: 1, ready: ms, app: bool, role, views: {view: n}}.
    Anyone may send it; it carries no names and every field is bounded."""
    body = request.get_json(force=True, silent=True)
    if not isinstance(body, dict):
        return jsonify({'error': 'Send JSON'}), 400
    delta = {}
    if body.get('visit'):
        delta['visits'] = 1
        if body.get('app'):
            delta['app'] = 1
        role = body.get('role') if body.get('role') in HEALTH_ROLES else 'none'
        delta['roles'] = {role: 1}
        ready = body.get('ready')
        if isinstance(ready, (int, float)) and 0 < ready < 120000:
            delta['ready'] = [int(ready)]
    views = body.get('views')
    if isinstance(views, dict):
        clean = {k: min(int(n), 50) for k, n in list(views.items())[:30]
                 if isinstance(k, str) and HEALTH_VIEW_RE.match(k) and isinstance(n, int) and n > 0}
        if clean:
            delta['views'] = clean
    # How long each tab took from the tap to its content (ms), for Slowest tabs.
    opens = body.get('opens')
    if isinstance(opens, dict):
        clean = {}
        for k, times in list(opens.items())[:30]:
            if isinstance(k, str) and HEALTH_VIEW_RE.match(k) and isinstance(times, list):
                ok = [int(t) for t in times[:HEALTH_OPENS_PER_NOTE]
                      if isinstance(t, (int, float)) and not isinstance(t, bool) and 0 <= t < 60000]
                if ok:
                    clean[k] = ok
        if clean:
            delta['opens'] = clean
    if delta:
        _health_note(delta)
    return jsonify({'success': True})


@app.route('/api/health', methods=['GET'])
def health_read():
    """The last week, day by day (what Firebase has plus what's pending), and
    the deploy: its build, when it went live, the last save that landed."""
    if not session.get('manager'):
        return jsonify({'error': 'Manager sign-in required'}), 403
    today = date.fromisoformat(_health_today())
    week = [(today - timedelta(days=n)).isoformat() for n in range(7)]
    try:
        # The week in one read (days are keyed by date), not one per day:
        # seven trips to Firebase made Health slow to open (Tim, Oct 22 2026).
        got = db.reference(HEALTH_PATH).order_by_key().start_at(week[-1]).end_at(week[0]).get() or {}
        days = {day: got[day] if isinstance(got.get(day), dict) else {} for day in week}
    except Exception as e:
        print(f'[HEALTH] read failed: {e}')
        return jsonify({'error': 'Could not read the counts'}), 500
    with _health_lock:
        for day, delta in _health_pending.items():
            if day in days:
                _health_add(days[day], json.loads(json.dumps(delta)))
    return jsonify({'build': BUILD, 'liveSince': STARTED_AT, 'lastSaveAt': _health_last_save,
                    'today': today.isoformat(), 'days': days, 'now': int(time.time() * 1000)})


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

# ===== FORMS (forms_api.py; Tim, Oct 21 2026) =====
forms_api.register(app, _client_ip)

# ===== START SERVER =====

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
