from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from anthropic import Anthropic
import json
import os
import requests

app = Flask(__name__)
CORS(app)

# Firebase config
FIREBASE_DB_URL = 'https://cfa-buda-ops-hub-default-rtdb.firebaseio.com'

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

@app.route('/api/firebase/read', methods=['POST'])
def firebase_read():
    """Proxy Firebase REST API read requests"""
    try:
        data = request.json
        path = data.get('path', '')
        
        if not path:
            return jsonify({'error': 'Missing path'}), 400
        
        # Build Firebase URL
        url = f"{FIREBASE_DB_URL}/{path}.json"
        
        # Make request to Firebase
        response = requests.get(url, timeout=10)
        
        # 404 is expected on first run
        if response.status_code == 404:
            return jsonify(None), 200
        
        if response.status_code == 200:
            return jsonify(response.json())
        else:
            return jsonify({'error': f'Firebase error: {response.status_code}'}), response.status_code
    
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Request failed: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/firebase/write', methods=['POST'])
def firebase_write():
    """Proxy Firebase REST API write (PUT) requests"""
    try:
        data = request.json
        path = data.get('path', '')
        value = data.get('value', {})
        
        if not path:
            return jsonify({'error': 'Missing path'}), 400
        
        # Build Firebase URL
        url = f"{FIREBASE_DB_URL}/{path}.json"
        
        # Make request to Firebase
        response = requests.put(url, json=value, timeout=10)
        
        print(f"[FIREBASE WRITE] Path: {path}, Status: {response.status_code}")
        
        if response.status_code in [200, 201]:
            try:
                return jsonify(response.json() if response.text else {'success': True})
            except:
                return jsonify({'success': True})
        else:
            print(f"[FIREBASE ERROR] Response: {response.text[:500]}")
            return jsonify({
                'error': f'Firebase error: {response.status_code}',
                'details': response.text[:200]
            }), response.status_code
    
    except requests.exceptions.RequestException as e:
        print(f"[REQUEST ERROR] {str(e)}")
        return jsonify({'error': f'Request failed: {str(e)}'}), 500
    except Exception as e:
        print(f"[EXCEPTION] {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/firebase/update', methods=['POST'])
def firebase_update():
    """Proxy Firebase REST API update (PATCH) requests"""
    try:
        data = request.json
        path = data.get('path', '')
        value = data.get('value', {})
        
        if not path:
            return jsonify({'error': 'Missing path'}), 400
        
        # Build Firebase URL
        url = f"{FIREBASE_DB_URL}/{path}.json"
        
        # Make request to Firebase (PATCH for update)
        response = requests.patch(url, json=value, timeout=10)
        
        print(f"[FIREBASE UPDATE] Path: {path}, Status: {response.status_code}")
        
        if response.status_code in [200, 201]:
            try:
                return jsonify(response.json() if response.text else {'success': True})
            except:
                return jsonify({'success': True})
        else:
            print(f"[FIREBASE ERROR] Response: {response.text[:500]}")
            return jsonify({'error': f'Firebase error: {response.status_code}'}), response.status_code
    
    except requests.exceptions.RequestException as e:
        print(f"[REQUEST ERROR] {str(e)}")
        return jsonify({'error': f'Request failed: {str(e)}'}), 500
    except Exception as e:
        print(f"[EXCEPTION] {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/firebase/delete', methods=['POST'])
def firebase_delete():
    """Proxy Firebase REST API delete requests"""
    try:
        data = request.json
        path = data.get('path', '')
        
        if not path:
            return jsonify({'error': 'Missing path'}), 400
        
        # Build Firebase URL
        url = f"{FIREBASE_DB_URL}/{path}.json"
        
        # Make request to Firebase
        response = requests.delete(url, timeout=10)
        
        print(f"[FIREBASE DELETE] Path: {path}, Status: {response.status_code}")
        
        if response.status_code in [200, 204]:
            return jsonify({'success': True})
        else:
            return jsonify({'error': f'Firebase error: {response.status_code}'}), response.status_code
    
    except requests.exceptions.RequestException as e:
        print(f"[REQUEST ERROR] {str(e)}")
        return jsonify({'error': f'Request failed: {str(e)}'}), 500
    except Exception as e:
        print(f"[EXCEPTION] {str(e)}")
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
