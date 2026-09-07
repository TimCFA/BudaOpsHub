from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from anthropic import Anthropic
import firebase_admin
from firebase_admin import credentials, db
import json
import os

app = Flask(__name__)
CORS(app)

# Firebase config
FIREBASE_DB_URL = 'https://cfa-buda-ops-hub-default-rtdb.firebaseio.com'

# The Realtime Database rules are locked down (no public read/write), so the
# server authenticates as a service account via the Admin SDK instead of
# hitting the REST API unauthenticated. The key is injected as an env var
# (never committed) containing the full service-account JSON.
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
        
        # Create Anthropic client using the server-side key (never sent by the browser)
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
        
        # Prepare message content
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
        
        # Call Anthropic API
        response = client.messages.create(
            model="claude-opus-4-8",
            max_tokens=4000,
            messages=[{
                "role": "user",
                "content": message_content
            }]
        )
        
        # Extract JSON from response
        text = response.content[0].text
        json_start = text.find('{')
        json_end = text.rfind('}') + 1
        json_str = text[json_start:json_end]
        parsed = json.loads(json_str)
        
        return jsonify(parsed)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ===== FIREBASE PROXY ROUTES =====
# These authenticate as the service account configured above, so they keep
# working with the database rules locked to no public access. The browser
# never talks to Firebase directly and never sees a credential.

@app.route('/api/firebase/read', methods=['POST'])
def firebase_read():
    """Read a path via the Admin SDK"""
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
    """Overwrite (PUT-equivalent) a path via the Admin SDK"""
    try:
        data = request.json
        path = data.get('path', '')
        value = data.get('value', {})

        if not path:
            return jsonify({'error': 'Missing path'}), 400

        db.reference(path).set(value)
        print(f"[FIREBASE WRITE] Path: {path}, OK")
        return jsonify({'success': True})

    except Exception as e:
        print(f"[FIREBASE WRITE ERROR] Path: {path}, {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/firebase/update', methods=['POST'])
def firebase_update():
    """Merge-update (PATCH-equivalent) a path via the Admin SDK"""
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
    """Delete a path via the Admin SDK"""
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
