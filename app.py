from datetime import timedelta
from collections import defaultdict
import json
import os
import time

from flask import Flask, request, jsonify, send_file, session
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from anthropic import Anthropic
import firebase_admin
from firebase_admin import credentials, db

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
# and only gate the write if one of THESE keys actually changed.
MANAGER_ONLY_KEYS = {
    'wasteTarget', 'safeTarget', 'products', 'teamMembers',
    'lxPillars', 'lxMetrics', 'lxLastUpdated',
    'gxData', 'txData', 'homeData',
}

def _touches_manager_fields(old_state, new_state):
    for key in MANAGER_ONLY_KEYS:
        if json.dumps(old_state.get(key), sort_keys=True) != json.dumps(new_state.get(key), sort_keys=True):
            return True
    return False

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

@app.route('/api/import-roster', methods=['POST'])
def import_roster():
    try:
        data = request.json
        file_data = data.get('fileData')
        file_type = data.get('fileType')

        if not file_data:
            return jsonify({'error': 'Missing file'}), 400

        api_key = os.environ.get('ANTHROPIC_API_KEY')
        if not api_key:
            return jsonify({'error': 'Server is not configured with an ANTHROPIC_API_KEY'}), 500

        client = Anthropic(api_key=api_key, timeout=30.0)

        prompt = """You are a scheduling assistant. Analyze this roster and extract EVERY team member with:
1. Their full name
2. Their shift times (e.g., "5:30a - 1:30p")
3. Their job title/department which will say "FOH" or "BOH"
Return EXACTLY this JSON format (no markdown, no preamble):
{
  "foh": [
    {"name": "Person Name", "start": "5:30a", "end": "1:30p"}
  ],
  "boh": [
    {"name": "BOH Person", "start": "5:30a", "end": "1:30p"}
  ]
}
Be thorough and extract EVERY person visible."""

        message_content = [
            {
                "type": "document" if file_type == "application/pdf" else "image",
                "source": {
                    "type": "base64",
                    "media_type": file_type,
                    "data": file_data
                }
            },
            {
                "type": "text",
                "text": prompt
            }
        ]

        response = client.messages.create(
            model="claude-opus-4-8",
            max_tokens=4000,
            messages=[{
                "role": "user",
                "content": message_content
            }]
        )

        text = response.content[0].text
        json_start = text.find('{')
        json_end = text.rfind('}') + 1
        json_str = text[json_start:json_end]
        parsed = json.loads(json_str)

        return jsonify(parsed)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

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

        # Manager-field gate — only applies to the main app-state blob, and only
        # blocks the write if a manager-only field is actually different from
        # what's currently stored (not just re-sent unchanged).
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
                if old_state is not None and _touches_manager_fields(old_state, new_state):
                    if not session.get('manager'):
                        return jsonify({'error': 'Manager sign-in required for this change'}), 403

        db.reference(path).set(value)
        print(f"[FIREBASE WRITE] Path: {path}, OK")
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
