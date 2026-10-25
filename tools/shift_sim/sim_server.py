# Shift simulator server: the real app, with a file-backed fake Firebase (so a
# restart keeps the data, like a deploy) and chaos knobs:
#   POST /__chaos {"delay": s, "fail": p, "drop": p}
#     delay: seconds each Firebase write takes
#     fail:  chance a Firebase write raises (the save answers 500)
#     drop:  chance a save is applied but its reply is lost (502)
#   GET  /__store/<path>  read the fake database
import json, os, random, sys, threading, time
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, REPO)
os.chdir(REPO)
os.environ['FLASK_SECRET_KEY'] = 'sim'
STORE = os.environ['SIM_STORE']
import app as appmod

lock = threading.Lock()
chaos = {'delay': 0.0, 'fail': 0.0, 'drop': 0.0}

def load():
    try:
        with open(STORE) as f: return json.load(f)
    except FileNotFoundError:
        return {}

def dump(store):
    tmp = STORE + '.tmp'
    with open(tmp, 'w') as f: json.dump(store, f)
    os.replace(tmp, STORE)

import hashlib
def etag_of(v): return hashlib.sha1(json.dumps(v, sort_keys=True).encode()).hexdigest()

class FakeRef:
    def __init__(self, path): self.path = path.strip('/')
    def get(self, etag=False, shallow=False):
        with lock:
            store = load()
        if self.path in store: v = store[self.path]
        else:
            prefix = self.path + '/'
            v = {k[len(prefix):]: x for k, x in store.items() if k.startswith(prefix)} or None
        return (v, etag_of(v)) if etag else v
    def set_if_unchanged(self, expected, value):
        if chaos['delay']: time.sleep(chaos['delay'])
        if chaos['fail'] and random.random() < chaos['fail']:
            raise RuntimeError('chaos: database write failed')
        with lock:
            store = load()
            cur = store.get(self.path)
            if etag_of(cur) != expected: return False, cur, etag_of(cur)
            store[self.path] = value; dump(store)
            return True, value, etag_of(value)
    def set(self, value):
        if chaos['delay']: time.sleep(chaos['delay'])
        if chaos['fail'] and random.random() < chaos['fail']:
            raise RuntimeError('chaos: database write failed')
        with lock:
            store = load(); store[self.path] = value; dump(store)
    def delete(self):
        with lock:
            store = load(); store.pop(self.path, None); dump(store)
    def update(self, d):
        with lock:
            store = load()
            kids = dict(store.get(self.path) or {})
            for k, v in d.items():
                if v is None: kids.pop(k, None)
                else: kids[k] = v
            store[self.path] = kids; dump(store)

appmod.db.reference = lambda path: FakeRef(path)
from werkzeug.security import generate_password_hash
with lock:
    _s = load()
    if 'secure/managerPinHash' not in _s:
        _s['secure/managerPinHash'] = generate_password_hash('1234'); dump(_s)
appmod.app.config['SESSION_COOKIE_SECURE'] = False

@appmod.app.route('/__chaos', methods=['POST'])
def set_chaos():
    from flask import request
    chaos.update({k: float(v) for k, v in (request.get_json() or {}).items() if k in chaos})
    return json.dumps(chaos)

@appmod.app.route('/__store/<path:name>')
def peek(name):
    with lock:
        return json.dumps(load().get(name))

# A lost reply: the save is applied, then the phone hears nothing useful.
inner = appmod.app.wsgi_app
def wsgi(environ, start_response):
    if environ.get('PATH_INFO') == '/api/state/patch' and chaos['drop'] and random.random() < chaos['drop']:
        body = []
        inner(environ, lambda *a, **k: body.append)   # run it, throw the answer away
        start_response('502 Bad Gateway', [('Content-Type', 'text/plain')])
        return [b'lost']
    return inner(environ, start_response)
appmod.app.wsgi_app = wsgi

# Production sits behind Cloudflare, which compresses pages and scripts.
import gzip as _gz
@appmod.app.after_request
def _compress(resp):
    from flask import request
    if (os.environ.get('SIM_GZIP', '1') == '1' and 'gzip' in request.headers.get('Accept-Encoding', '')
            and not resp.direct_passthrough and resp.status_code == 200 and 'Content-Encoding' not in resp.headers
            and (resp.mimetype or '').startswith(('text/', 'application/javascript'))):
        resp.set_data(_gz.compress(resp.get_data(), 6)); resp.headers['Content-Encoding'] = 'gzip'
    return resp

appmod.app.run(host='127.0.0.1', port=int(os.environ.get('PORT', '5400')), threaded=True)
