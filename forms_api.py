"""Forms (Tim, Oct 21 2026): the store's Connecteam forms, rebuilt in the
hub. The page draws every form from static/forms/form-definitions.js
(forms-engine.js); this is the server side the engine talks to, at
/api/forms:

  POST /submit                           anyone (a leader-only form needs a leader)
  GET  /open/<form>                      a staged form's open visits (the vendor log)
  POST /<form>/<id>/stage/<stage>        finish a staged visit (check out)
  GET  /submissions?formId&status&store  the inbox
  GET  /submission/<form>/<id>           one submission
  POST /submission/<form>/<id>/status    new / in progress / done, with a note
  GET  /file/<form>/<id>/<field>/<i>     a photo, file or signature
  GET  /definitions                      the forms directors added (and hid)
  POST /definitions                      add or change one (a manager session)

Who reads what: the inbox is for directors, the manager PIN and the Admin
Team; the sensitive forms only for a director, except injury reports, which
the Admin Team reads too. Nothing here is reachable through the state proxy: submissions,
files and added forms live under forms/ in Firebase, written only by these
routes.

The built-in forms' rules come from forms_meta.json (tools/forms_meta.js
reads them out of form-definitions.js); an added form's from its own
definition.
"""
import base64
import io
import json
import os
import re
import secrets
import time
from collections import defaultdict

from firebase_admin import db
from flask import Response, jsonify, request, session

ROOT = 'forms'
SUBS = ROOT + '/subs'          # forms/subs/<form>/<id> = the record (no files)
FILES = ROOT + '/files'        # forms/files/<id>/<field>/<i> = {t: mime, d: base64}
CUSTOM = ROOT + '/custom'      # forms/custom/<form> = an added form's definition

STORES = ('buda', 'west_buda')
STATUSES = ('new', 'in_progress', 'done')
LEADER_ROLES = ('lead', 'admin', 'director')
ID_RE = re.compile(r'^[a-z][a-z0-9_]{0,47}$')
SUB_ID_RE = re.compile(r'^[0-9a-f]{8,24}$')
MAX_BODY = 24 * 1024 * 1024    # a few phone photos, already shrunk on the phone
MAX_VALUES = 64 * 1024         # the answers, without files
IMAGE_MAX_BYTES = 2 * 1024 * 1024
PDF_MAX_BYTES = 4 * 1024 * 1024
IMAGE_MAX_SIDE = 1600
SUBMITS_PER_HOUR = 30
INBOX_LIMIT = 300

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'forms_meta.json'), encoding='utf-8') as _f:
    BUILT_IN = json.load(_f)

_submits = defaultdict(list)


# ----- who is asking -----

def _user():
    return session.get('user') or {}

def _is_leader():
    return bool(session.get('manager')) or _user().get('role') in LEADER_ROLES

def _inbox_reader():
    """'director', 'manager', 'admin' or None."""
    if session.get('manager'):
        return 'director' if session.get('director') else 'manager'
    return 'admin' if _user().get('role') == 'admin' else None

# Sensitive forms the Admin Team reads too (Tim, Oct 22 2026: injury reports
# go to directors and admin); the other sensitive ones stay with directors.
ADMIN_READS_SENSITIVE = ('injury_report',)

def _can_read(meta, form_id=''):
    who = _inbox_reader()
    if not who:
        return False
    if not meta.get('sensitive') or who == 'director':
        return True
    return who == 'admin' and form_id in ADMIN_READS_SENSITIVE


# ----- forms -----

def _custom_defs():
    raw = db.reference(CUSTOM).get() or {}
    return {k: v for k, v in raw.items() if isinstance(v, dict)} if isinstance(raw, dict) else {}

def _meta(form_id):
    if form_id in BUILT_IN:
        return BUILT_IN[form_id]
    d = _custom_defs().get(form_id)
    if not d:
        return None
    files = [[f['id'], f['type'], 1 if f['type'] == 'signature' else 4]
             for f in d.get('fields', []) if f.get('type') in ('photo', 'file', 'signature')]
    return {'audience': d.get('audience', 'all'), 'sensitive': bool(d.get('sensitive')),
            'files': {'': files} if files else {}, 'hidden': bool(d.get('hidden')), 'custom': True}


# ----- files -----

def _decode(data_url, kind):
    """A data URL from the page → (mime, bytes) to keep, or None. Photos are
    re-saved as JPEG no wider than IMAGE_MAX_SIDE (the phone has shrunk them
    already); a file may also be a PDF; a signature is a PNG."""
    m = re.match(r'^data:([a-z]+/[a-z0-9.+-]+);base64,(.*)$', data_url or '', re.S)
    if not m:
        return None
    mime = m.group(1)
    try:
        raw = base64.b64decode(m.group(2), validate=False)
    except Exception:
        return None
    if mime == 'application/pdf':
        return (mime, raw) if kind == 'file' and raw.startswith(b'%PDF') and len(raw) <= PDF_MAX_BYTES else None
    if not mime.startswith('image/') or len(raw) > PDF_MAX_BYTES:
        return None
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception:
        return None
    if kind == 'signature':
        out = io.BytesIO()
        img.convert('RGBA').save(out, 'PNG', optimize=True)
        return ('image/png', out.getvalue()) if out.tell() <= IMAGE_MAX_BYTES else None
    img = img.convert('RGB')
    img.thumbnail((IMAGE_MAX_SIDE, IMAGE_MAX_SIDE))
    out = io.BytesIO()
    img.save(out, 'JPEG', quality=80, optimize=True)
    return ('image/jpeg', out.getvalue()) if out.tell() <= IMAGE_MAX_BYTES else None

def _keep_files(sub_id, prefix, allowed, files):
    """Save the stage's files; → {field: count} or an error message."""
    if not isinstance(files, dict):
        return {}
    allowed = {f[0]: (f[1], f[2]) for f in allowed}
    counts, kept = {}, []
    for field, items in files.items():
        if field not in allowed or not isinstance(items, list):
            return f'Unexpected file for {field}'
        kind, most = allowed[field]
        items = [x for x in items if x][:most]
        for i, item in enumerate(items):
            got = _decode(item, kind)
            if not got:
                return 'One of the photos or files could not be read. Try a different one.'
            kept.append((f'{prefix}{field}', i, got))
        if items:
            counts[f'{prefix}{field}'] = len(items)
    for key, i, (mime, data) in kept:
        db.reference(f'{FILES}/{sub_id}/{key}/{i}').set({'t': mime, 'd': base64.b64encode(data).decode('ascii')})
    return counts


# ----- checks -----

def _too_many(ip):
    now = time.time()
    hits = [t for t in _submits[ip] if now - t < 3600]
    _submits[ip] = hits
    if len(hits) >= SUBMITS_PER_HOUR:
        return True
    hits.append(now)
    return False

KEY_RE = re.compile(r'^[A-Za-z0-9_-]{1,80}$')

def _keys_ok(v, depth=0):
    # Field and option ids only: Firebase refuses keys with . $ # [ ] /
    if depth > 6:
        return False
    if isinstance(v, dict):
        return all(isinstance(k, str) and KEY_RE.match(k) and _keys_ok(x, depth + 1) for k, x in v.items())
    if isinstance(v, list):
        return all(_keys_ok(x, depth + 1) for x in v)
    return True

def _clean_values(values):
    if not isinstance(values, dict) or not _keys_ok(values):
        return None
    try:
        size = len(json.dumps(values))
    except (TypeError, ValueError):
        return None
    return values if size <= MAX_VALUES else None

def _leader_choice_used(meta, values):
    for field, opts in (meta.get('leader_options') or {}).items():
        if values.get(field) in opts:
            return True
    return False

def _name(v):
    return str(v)[:80] if isinstance(v, str) and v.strip() else None


def _summary(record, meta):
    vals = record.get('values') or {}
    return {k: vals.get(k) for k in meta.get('open_summary', []) if k in vals}


def register(app, client_ip):
    """Add the /api/forms routes to the app."""

    def body():
        if (request.content_length or 0) > MAX_BODY:
            return None
        return request.get_json(silent=True) or {}

    @app.route('/api/forms/submit', methods=['POST'])
    def forms_submit():
        p = body()
        if p is None:
            return jsonify({'error': 'That is too much to send at once. Try fewer photos.'}), 413
        form_id = str(p.get('formId') or '')
        meta = _meta(form_id) if ID_RE.match(form_id) else None
        if not meta or meta.get('hidden'):
            return jsonify({'error': 'Unknown form'}), 404
        if meta.get('stages') and p.get('stage') not in (None, meta['stages'][0]):
            return jsonify({'error': 'Start with the first step'}), 400
        values = _clean_values(p.get('values'))
        if values is None:
            return jsonify({'error': 'The answers could not be read'}), 400
        if (meta.get('audience') == 'leaders' or _leader_choice_used(meta, values)) and not _is_leader():
            return jsonify({'error': 'Sign in as a leader to send this.'}), 403
        store = p.get('store')
        if store not in STORES:
            store = None
        if _too_many(client_ip()):
            return jsonify({'error': 'Too many forms from this device. Try again later.'}), 429
        anonymous = bool(meta.get('anonymous')) and values.get(meta['anonymous']) is True
        sub_id = f'{int(time.time() * 1000):x}{secrets.token_hex(3)}'
        stage = meta['stages'][0] if meta.get('stages') else ''
        counts = _keep_files(sub_id, '', (meta.get('files') or {}).get(stage, []), p.get('files'))
        if isinstance(counts, str):
            return jsonify({'error': counts}), 400
        record = {
            'id': sub_id, 'formId': form_id, 'version': int(p.get('version') or 1), 'store': store,
            'status': 'open' if meta.get('stages') else 'new',
            'createdAt': int(time.time() * 1000), 'values': values, 'files': counts,
            'anonymous': anonymous, 'submittedBy': None if anonymous else _name(p.get('submittedBy')),
            'lang': 'es' if p.get('lang') == 'es' else 'en',
        }
        u = _user()
        if not anonymous and u.get('name'):
            record['signedIn'] = {'name': u.get('name'), 'role': u.get('role')}
        db.reference(f'{SUBS}/{form_id}/{sub_id}').set(record)
        print(f'[FORMS] {form_id} {sub_id}{" (anonymous)" if anonymous else ""}')
        return jsonify({'success': True, 'id': sub_id})

    @app.route('/api/forms/open/<form_id>', methods=['GET'])
    def forms_open(form_id):
        meta = _meta(form_id) if ID_RE.match(form_id) else None
        if not meta or not meta.get('stages'):
            return jsonify({'error': 'Unknown form'}), 404
        recs = db.reference(f'{SUBS}/{form_id}').get() or {}
        items = [{'id': r['id'], 'store': r.get('store'), 'createdAt': r.get('createdAt'), 'summary': _summary(r, meta)}
                 for r in (recs.values() if isinstance(recs, dict) else []) if isinstance(r, dict) and r.get('status') == 'open']
        items.sort(key=lambda r: r.get('createdAt') or 0, reverse=True)
        resp = jsonify({'items': items[:50]})
        resp.headers['Cache-Control'] = 'no-store'
        return resp

    @app.route('/api/forms/<form_id>/<sub_id>/stage/<stage>', methods=['POST'])
    def forms_stage(form_id, sub_id, stage):
        p = body()
        if p is None:
            return jsonify({'error': 'That is too much to send at once. Try fewer photos.'}), 413
        meta = _meta(form_id) if ID_RE.match(form_id) else None
        if not meta or not meta.get('stages') or stage not in meta['stages'][1:] or not SUB_ID_RE.match(sub_id):
            return jsonify({'error': 'Unknown form'}), 404
        ref = db.reference(f'{SUBS}/{form_id}/{sub_id}')
        rec = ref.get()
        if not isinstance(rec, dict) or rec.get('status') != 'open':
            return jsonify({'error': 'That visit is already closed out.'}), 409
        values = _clean_values(p.get('values'))
        if values is None:
            return jsonify({'error': 'The answers could not be read'}), 400
        if _too_many(client_ip()):
            return jsonify({'error': 'Too many forms from this device. Try again later.'}), 429
        counts = _keep_files(sub_id, f'{stage}__', (meta.get('files') or {}).get(stage, []), p.get('files'))
        if isinstance(counts, str):
            return jsonify({'error': counts}), 400
        stages = dict(rec.get('stages') or {})
        stages[stage] = {'values': values, 'files': counts, 'submittedBy': _name(p.get('submittedBy')), 'at': int(time.time() * 1000)}
        rec['stages'] = stages
        rec['files'] = dict(rec.get('files') or {}, **counts)
        rec['status'] = 'new'
        ref.set(rec)
        return jsonify({'success': True, 'id': sub_id})

    @app.route('/api/forms/submissions', methods=['GET'])
    def forms_submissions():
        if not _inbox_reader():
            return jsonify({'error': 'Directors, managers and the Admin Team only.'}), 403
        want_form = request.args.get('formId') or ''
        want_status = request.args.get('status') or ''
        want_store = request.args.get('store') or ''
        allforms = db.reference(SUBS).get() or {}
        items = []
        for form_id, recs in (allforms.items() if isinstance(allforms, dict) else []):
            meta = _meta(form_id)
            if not meta or not _can_read(meta, form_id) or (want_form and form_id != want_form) or not isinstance(recs, dict):
                continue
            for r in recs.values():
                if not isinstance(r, dict):
                    continue
                if want_status and r.get('status') != want_status:
                    continue
                if want_store and r.get('store') != want_store:
                    continue
                items.append({k: r.get(k) for k in ('id', 'formId', 'store', 'status', 'createdAt', 'submittedBy', 'anonymous', 'values')})
        items.sort(key=lambda r: r.get('createdAt') or 0, reverse=True)
        resp = jsonify({'items': items[:INBOX_LIMIT]})
        resp.headers['Cache-Control'] = 'no-store'
        return resp

    def readable(form_id, sub_id):
        meta = _meta(form_id) if ID_RE.match(form_id) else None
        if not meta or not SUB_ID_RE.match(sub_id):
            return None, None, (jsonify({'error': 'Not found'}), 404)
        if not _can_read(meta, form_id):
            return None, None, (jsonify({'error': 'Not allowed'}), 403)
        rec = db.reference(f'{SUBS}/{form_id}/{sub_id}').get()
        if not isinstance(rec, dict):
            return None, None, (jsonify({'error': 'Not found'}), 404)
        return meta, rec, None

    @app.route('/api/forms/submission/<form_id>/<sub_id>', methods=['GET'])
    def forms_submission(form_id, sub_id):
        _, rec, err = readable(form_id, sub_id)
        if err:
            return err
        resp = jsonify(rec)
        resp.headers['Cache-Control'] = 'no-store'
        return resp

    @app.route('/api/forms/submission/<form_id>/<sub_id>/status', methods=['POST'])
    def forms_status(form_id, sub_id):
        _, rec, err = readable(form_id, sub_id)
        if err:
            return err
        p = request.get_json(silent=True) or {}
        status = p.get('status')
        if status not in STATUSES:
            return jsonify({'error': 'Pick a status'}), 400
        by = _name(p.get('by')) or _user().get('name') or ''
        history = list(rec.get('history') or [])[-49:]
        history.append({'status': status, 'note': str(p.get('note') or '')[:1000], 'by': by, 'at': int(time.time() * 1000)})
        db.reference(f'{SUBS}/{form_id}/{sub_id}').update({'status': status, 'history': history})
        return jsonify({'success': True})

    @app.route('/api/forms/file/<form_id>/<sub_id>/<field>/<int:i>', methods=['GET'])
    def forms_file(form_id, sub_id, field, i):
        _, rec, err = readable(form_id, sub_id)
        if err:
            return err
        if not re.match(r'^[a-z0-9_]{1,80}$', field) or i >= int((rec.get('files') or {}).get(field) or 0):
            return jsonify({'error': 'Not found'}), 404
        f = db.reference(f'{FILES}/{sub_id}/{field}/{i}').get()
        if not isinstance(f, dict) or f.get('t') not in ('image/jpeg', 'image/png', 'application/pdf'):
            return jsonify({'error': 'Not found'}), 404
        resp = Response(base64.b64decode(f.get('d') or ''), mimetype=f['t'])
        resp.headers['Cache-Control'] = 'private, no-store'
        resp.headers['X-Content-Type-Options'] = 'nosniff'
        return resp

    # ----- forms directors add -----

    @app.route('/api/forms/definitions', methods=['GET'])
    def forms_definitions():
        defs = list(_custom_defs().values())
        if not session.get('manager'):
            defs = [d for d in defs if not d.get('hidden')]
        resp = jsonify({'forms': sorted(defs, key=lambda d: d.get('createdAt') or 0)})
        resp.headers['Cache-Control'] = 'no-store'
        return resp

    @app.route('/api/forms/definitions', methods=['POST'])
    def forms_definitions_save():
        if not session.get('manager'):
            return jsonify({'error': 'Sign in to Manage to add forms.'}), 403
        d, error = clean_definition(request.get_json(silent=True) or {})
        if error:
            return jsonify({'error': error}), 400
        old = _custom_defs().get(d['id'])
        d['version'] = int((old or {}).get('version') or 0) + 1
        d['createdAt'] = (old or {}).get('createdAt') or int(time.time() * 1000)
        d['updatedAt'] = int(time.time() * 1000)
        d['by'] = _user().get('name') or ''
        db.reference(f'{CUSTOM}/{d["id"]}').set(d)
        return jsonify({'success': True, 'form': d})


# ----- an added form's definition -----
FIELD_TYPES = ('text', 'textarea', 'number', 'currency', 'date', 'time', 'choice', 'multi', 'yesno', 'photo', 'signature', 'person')
CATEGORIES = ('ops', 'people', 'money', 'safety')
ICONS = ('file', 'clipboard', 'wrench', 'truck', 'receipt', 'dollar', 'users', 'chat', 'calendar', 'shield', 'car', 'bag')

def _text(v, most):
    return re.sub(r'\s+', ' ', str(v or '')).strip()[:most]

def clean_definition(raw):
    """A form from the builder → (definition, None) or (None, error). Only the
    plain parts the engine needs: no code, no HTML, known field types."""
    title = _text(raw.get('title'), 80)
    if not title:
        return None, 'Give the form a title'
    form_id = str(raw.get('id') or '')
    if form_id and (not form_id.startswith('c_') or not ID_RE.match(form_id)):
        return None, 'Unknown form'
    if not form_id:
        slug = re.sub(r'[^a-z0-9]+', '_', title.lower()).strip('_')[:30] or 'form'
        form_id = f'c_{slug}_{secrets.token_hex(2)}'
    if form_id in BUILT_IN:
        return None, 'Unknown form'
    # The store question comes from askStore, not the list.
    fields_in = [f for f in raw.get('fields') or [] if not (isinstance(f, dict) and f.get('type') == 'store')] if isinstance(raw.get('fields'), list) else []
    if not fields_in or len(fields_in) > 40:
        return None, 'Add between 1 and 40 questions'
    fields, seen = [], set()
    for i, f in enumerate(fields_in):
        if not isinstance(f, dict):
            return None, f'Question {i + 1} could not be read'
        ftype = f.get('type')
        label = _text(f.get('label'), 200)
        if ftype not in FIELD_TYPES or not label:
            return None, f'Question {i + 1} needs a question and a kind of answer'
        fid = str(f.get('id') or f'q{i + 1}')
        if not re.match(r'^q[0-9]{1,6}$', fid) or fid in seen:
            fid = f'q{i + 1}'
            while fid in seen:
                fid += '0'
        seen.add(fid)
        out = {'id': fid, 'type': ftype, 'label': label, 'required': bool(f.get('required'))}
        if _text(f.get('label_es'), 200):
            out['label_es'] = _text(f.get('label_es'), 200)
        if _text(f.get('help'), 300):
            out['help'] = _text(f.get('help'), 300)
        if ftype in ('choice', 'multi'):
            opts = [o for o in (f.get('options') or []) if isinstance(o, dict) and _text(o.get('l'), 120)][:30]
            if len(opts) < 2:
                return None, f'Question {i + 1} needs at least two choices'
            out['options'] = [dict({'v': f'o{j + 1}', 'l': _text(o.get('l'), 120)},
                                   **({'l_es': _text(o.get('l_es'), 120)} if _text(o.get('l_es'), 120) else {}))
                              for j, o in enumerate(opts)]
            if ftype == 'choice' and len(opts) > 3:
                out['style'] = 'list'
        if ftype == 'photo':
            out['max'] = 4
        if ftype == 'person':
            out['role'] = 'submitter' if not any(x.get('role') == 'submitter' for x in fields) else None
            out['remember'] = 'name' if out['role'] else None
            out = {k: v for k, v in out.items() if v is not None}
        fields.append(out)
    d = {'id': form_id, 'title': title, 'category': raw.get('category') if raw.get('category') in CATEGORIES else 'ops',
         'icon': raw.get('icon') if raw.get('icon') in ICONS else 'clipboard',
         'audience': 'leaders' if raw.get('audience') == 'leaders' else 'all',
         'sensitive': bool(raw.get('sensitive')), 'hidden': bool(raw.get('hidden')), 'fields': fields}
    for k, most in (('title_es', 80), ('blurb', 140), ('blurb_es', 140)):
        if _text(raw.get(k), most):
            d[k] = _text(raw.get(k), most)
    d['inboxSummary'] = [f['id'] for f in fields if f['type'] not in ('photo', 'signature')][:2]
    d['askStore'] = bool(raw.get('askStore', True))
    if d['askStore']:
        d['fields'] = [{'id': 'store', 'type': 'store', 'label': 'Which store?', 'label_es': '¿Qué restaurante?', 'required': True}] + fields
    return d, None
