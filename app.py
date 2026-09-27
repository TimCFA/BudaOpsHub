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
    'dataUploadLog', 'dataUploadSettings',
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

# Basic in-memory brute-force throttle for the login endpoint.
# Resets on redeploy/restart — fine for a single small-team instance,
# not a substitute for a real long-term PIN if this ever needs to scale.
_login_failures = defaultdict(list)
LOGIN_MAX_ATTEMPTS = 5
LOGIN_LOCKOUT_SECONDS = 60

def _too_many_attempts(ip):
    now = time.time()
    _login_failures[ip] = [t for t in _login_failures[ip] if now - t < LOGIN_LOCKOUT_SECONDS]
    return len(_login_failures[ip]) >= LOGIN_MAX_ATTEMPTS

def _record_failure(ip):
    _login_failures[ip].append(time.time())

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
    ip = request.headers.get('X-Forwarded-For', request.remote_addr)
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

# ===== FIREBASE PROXY ROUTES =====

@app.route('/api/firebase/read', methods=['POST'])
def firebase_read():
    try:
        data = request.json
        path = data.get('path', '')

        if not path:
            return jsonify({'error': 'Missing path'}), 400

        value = db.reference(path).get()
        return jsonify(value)

    except Exception as e:
        print(f"[FIREBASE READ ERROR] Path: {path}, {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/firebase/write', methods=['POST'])
def firebase_write():
    try:
        data = request.json
        path = data.get('path', '')
        value = data.get('value', {})

        if not path:
            return jsonify({'error': 'Missing path'}), 400

        # Manager-field gate — only applies to the main app-state blob. A
        # non-manager save whose manager-only fields differ from what's stored
        # keeps the STORED values for those fields and saves everything else.
        # (It used to reject the whole write, so any drift in those fields —
        # e.g. a deploy that changes the default product list — silently
        # dropped every team member's waste entries, CEM uploads, etc.)
        ignored_fields = []
        if path == 'appState' and isinstance(value, str):
            new_state = None
            try:
                new_state = json.loads(value)
            except (TypeError, ValueError):
                pass

            if new_state is not None:
                raw_old = db.reference('appState').get()
                old_state = None
                if isinstance(raw_old, str):
                    try:
                        old_state = json.loads(raw_old)
                    except (TypeError, ValueError):
                        pass

                # If there's no prior state at all, this is first-ever bootstrap —
                # let it through rather than locking out an empty Firebase project.
                if old_state is not None and not session.get('manager'):
                    ignored_fields = _changed_manager_fields(old_state, new_state)
                    if ignored_fields:
                        value = json.dumps(_keep_stored_manager_fields(old_state, new_state))

        db.reference(path).set(value)
        print(f"[FIREBASE WRITE] Path: {path}, OK")
        if ignored_fields:
            print(f"[FIREBASE WRITE] Kept stored manager-only fields (no manager session): {ignored_fields}")
            return jsonify({'success': True, 'managerFieldsIgnored': ignored_fields})
        return jsonify({'success': True})

    except Exception as e:
        print(f"[FIREBASE WRITE ERROR] Path: {path}, {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/firebase/update', methods=['POST'])
def firebase_update():
    try:
        data = request.json
        path = data.get('path', '')
        value = data.get('value', {})

        if not path:
            return jsonify({'error': 'Missing path'}), 400

        db.reference(path).update(value)
        print(f"[FIREBASE UPDATE] Path: {path}, OK")
        return jsonify({'success': True})

    except Exception as e:
        print(f"[FIREBASE UPDATE ERROR] Path: {path}, {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/firebase/delete', methods=['POST'])
def firebase_delete():
    try:
        data = request.json
        path = data.get('path', '')

        if not path:
            return jsonify({'error': 'Missing path'}), 400

        db.reference(path).delete()
        print(f"[FIREBASE DELETE] Path: {path}, OK")
        return jsonify({'success': True})

    except Exception as e:
        print(f"[FIREBASE DELETE ERROR] Path: {path}, {str(e)}")
        return jsonify({'error': str(e)}), 500

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
