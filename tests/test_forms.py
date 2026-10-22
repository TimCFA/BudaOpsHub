"""Forms (Tim, Oct 21 2026): the store's Connecteam forms in the hub, and the
forms directors add. Who may send and read what, files, the vendor log's
check-in and check-out, and the built-in forms' rules kept in step with
their definitions.

Run: python3 -m unittest discover tests
Firebase is a dict. Names are made up.
"""
import base64
import io
import json
import os
import subprocess
import sys
import time
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import app as appmod  # noqa: E402
import forms_api  # noqa: E402

TREE = {}


class FakeRef:
    """A nested dict addressed by path, as Firebase is."""
    def __init__(self, path):
        self.parts = [p for p in path.strip('/').split('/') if p]

    def _walk(self, create=False):
        node = TREE
        for p in self.parts[:-1]:
            if not isinstance(node.get(p), dict):
                if not create:
                    return None
                node[p] = {}
            node = node[p]
        return node

    def get(self):
        node = TREE
        for p in self.parts:
            if not isinstance(node, dict) or p not in node:
                return None
            node = node[p]
        return json.loads(json.dumps(node))

    def set(self, value):
        self._walk(True)[self.parts[-1]] = json.loads(json.dumps(value))

    def update(self, changes):
        node = self._walk(True).setdefault(self.parts[-1], {})
        node.update(json.loads(json.dumps(changes)))

    def delete(self):
        node = self._walk()
        if node:
            node.pop(self.parts[-1], None)


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


def png(w=40, h=30):
    from PIL import Image
    out = io.BytesIO()
    Image.new('RGB', (w, h), (200, 30, 50)).save(out, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(out.getvalue()).decode()


def client(**sess):
    c = appmod.app.test_client()
    if sess:
        with c.session_transaction() as s:
            s.update(sess)
    return c


TEAM = {}
LEAD = {'user': {'name': 'Casey Example', 'role': 'lead'}, 'teamEnds': int(time.time()) + 3600}
ADMIN = {'user': {'name': 'Avery Office', 'role': 'admin'}, 'teamEnds': int(time.time()) + 3600}
MANAGER = {'manager': True}
DIRECTOR = {'manager': True, 'director': True}


class Base(unittest.TestCase):
    def setUp(self):
        TREE.clear()
        forms_api._submits.clear()
        appmod.db.reference = lambda path: FakeRef(path)
        forms_api.db.reference = appmod.db.reference

    def send(self, c, form_id, values, files=None, **extra):
        body = dict({'formId': form_id, 'version': 1, 'store': 'buda', 'submittedBy': values.get('name'), 'values': values, 'files': files or {}}, **extra)
        return c.post('/api/forms/submit', json=body)


class Sending(Base):
    def test_a_repair_request_with_a_photo(self):
        r = self.send(client(), 'repair_request', {'store': 'buda', 'name': 'Jordan Testcase', 'kind': 'repair', 'what': 'Fryer 3', 'area': 'kitchen',
                                                   'urgency': 'slowing', 'details': 'Drops to 320F'}, {'photos': [png(), png(3000, 2000)]})
        self.assertEqual(r.status_code, 200, r.get_json())
        sid = r.get_json()['id']
        rec = TREE['forms']['subs']['repair_request'][sid]
        self.assertEqual((rec['status'], rec['store'], rec['submittedBy'], rec['files']), ('new', 'buda', 'Jordan Testcase', {'photos': 2}))
        self.assertNotIn('signedIn', rec)
        # Photos are kept as JPEG no wider than 1600.
        from PIL import Image
        big = TREE['forms']['files'][sid]['photos']['1']
        self.assertEqual(big['t'], 'image/jpeg')
        self.assertEqual(max(Image.open(io.BytesIO(base64.b64decode(big['d']))).size), 1600)

    def test_who_may_send_what(self):
        recon = {'store': 'buda', 'order_no': '123', 'name': 'Casey Example'}
        self.assertEqual(self.send(client(), 'ezcater_recon', recon).status_code, 403)           # leaders only
        self.assertEqual(self.send(client(**LEAD), 'ezcater_recon', recon).status_code, 200)
        bonus = {'store': 'buda', 'name': 'Jordan Testcase', 'type': 'bonus', 'bonus_amount': 50}
        self.assertEqual(self.send(client(), 'payroll_notes', bonus).status_code, 403)           # a leader-only choice
        self.assertEqual(self.send(client(**MANAGER), 'payroll_notes', bonus).status_code, 200)
        self.assertEqual(self.send(client(), 'payroll_notes', dict(bonus, type='hours')).status_code, 200)
        self.assertEqual(self.send(client(), 'nope', {}).status_code, 404)
        self.assertEqual(self.send(client(), '../x', {}).status_code, 404)

    def test_anonymous_report_keeps_no_name(self):
        r = self.send(client(**LEAD), 'harassment_report', {'anonymous': True, 'name': 'Casey Example', 'what': 'x'})
        rec = TREE['forms']['subs']['harassment_report'][r.get_json()['id']]
        self.assertTrue(rec['anonymous'])
        self.assertIsNone(rec.get('submittedBy'))
        self.assertNotIn('signedIn', rec)
        r = self.send(client(**LEAD), 'ask_hr', {'store': 'buda', 'name': 'Casey Example', 'topic': 'payroll', 'question': 'x'})
        self.assertEqual(TREE['forms']['subs']['ask_hr'][r.get_json()['id']]['signedIn'], {'name': 'Casey Example', 'role': 'lead'})

    def test_bad_answers_and_files_are_refused(self):
        self.assertEqual(self.send(client(), 'ask_hr', {'a/b': 1}).status_code, 400)                 # not a field id
        self.assertEqual(self.send(client(), 'ask_hr', {'question': 'x' * 70000}).status_code, 400)
        self.assertEqual(self.send(client(), 'ask_hr', {'question': 'x'}, {'nope': [png()]}).status_code, 400)
        self.assertEqual(self.send(client(), 'ask_hr', {'question': 'x'}, {'attachment': ['data:image/png;base64,AAAA']}).status_code, 400)
        pdf = 'data:application/pdf;base64,' + base64.b64encode(b'%PDF-1.4 x').decode()
        self.assertEqual(self.send(client(), 'ask_hr', {'question': 'x'}, {'attachment': [pdf]}).status_code, 200)   # a file may be a PDF
        self.assertEqual(self.send(client(), 'repair_request', {'what': 'x'}, {'photos': [pdf]}).status_code, 400)  # a photo may not

    def test_too_many_from_one_device(self):
        for _ in range(forms_api.SUBMITS_PER_HOUR):
            self.assertEqual(self.send(client(), 'mileage_log', {'name': 'x'}).status_code, 200)
        self.assertEqual(self.send(client(), 'mileage_log', {'name': 'x'}).status_code, 429)


class VendorLog(Base):
    def test_check_in_then_out(self):
        r = self.send(client(), 'vendor_log', {'store': 'buda', 'name': 'Jordan Testcase', 'vendor': 'Hobart', 'service': 'repair', 'area': 'Dish machine'}, stage='checkin')
        sid = r.get_json()['id']
        items = client().get('/api/forms/open/vendor_log').get_json()['items']
        self.assertEqual([(i['id'], i['summary']) for i in items], [(sid, {'vendor': 'Hobart', 'service': 'repair', 'area': 'Dish machine'})])
        r = client().post(f'/api/forms/vendor_log/{sid}/stage/checkout', json={'values': {'name': 'Riley Sample', 'result': 'resolved', 'invoice': True},
                                                                               'files': {'invoice_photo': [png()]}, 'submittedBy': 'Riley Sample'})
        self.assertEqual(r.status_code, 200, r.get_json())
        rec = TREE['forms']['subs']['vendor_log'][sid]
        self.assertEqual((rec['status'], rec['stages']['checkout']['submittedBy'], rec['files']), ('new', 'Riley Sample', {'checkout__invoice_photo': 1}))
        self.assertEqual(client().get('/api/forms/open/vendor_log').get_json()['items'], [])
        self.assertEqual(client().post(f'/api/forms/vendor_log/{sid}/stage/checkout', json={'values': {}}).status_code, 409)   # once


class Inbox(Base):
    def setUp(self):
        super().setUp()
        self.hr = self.send(client(), 'ask_hr', {'store': 'buda', 'name': 'Jordan Testcase', 'topic': 'payroll', 'question': 'Pay stub?'},
                            {'attachment': [png()]}).get_json()['id']
        self.injury = self.send(client(), 'injury_report', {'store': 'west_buda', 'name': 'Riley Sample'}, store='west_buda').get_json()['id']
        self.harass = self.send(client(), 'harassment_report', {'anonymous': True, 'what': 'x'}).get_json()['id']

    def ids(self, c, q=''):
        r = c.get('/api/forms/submissions' + q)
        return r.status_code, [i['id'] for i in (r.get_json() or {}).get('items', [])]

    def test_who_reads_what(self):
        self.assertEqual(self.ids(client())[0], 403)
        self.assertEqual(self.ids(client(**LEAD))[0], 403)
        # Injury reports: directors and the Admin Team (Tim, Oct 22 2026); harassment: directors only.
        self.assertEqual(sorted(self.ids(client(**ADMIN))[1]), sorted([self.hr, self.injury]))
        self.assertEqual(self.ids(client(**MANAGER)), (200, [self.hr]))
        self.assertEqual(sorted(self.ids(client(**DIRECTOR))[1]), sorted([self.hr, self.injury, self.harass]))
        self.assertEqual(client(**ADMIN).get(f'/api/forms/submission/injury_report/{self.injury}').status_code, 200)
        self.assertEqual(client(**ADMIN).get(f'/api/forms/submission/harassment_report/{self.harass}').status_code, 403)
        self.assertEqual(client(**MANAGER).get(f'/api/forms/submission/injury_report/{self.injury}').status_code, 403)
        self.assertEqual(client(**DIRECTOR).get(f'/api/forms/submission/injury_report/{self.injury}').status_code, 200)
        self.assertEqual(self.ids(client(**DIRECTOR), '?store=west_buda'), (200, [self.injury]))

    def test_files_and_follow_up(self):
        url = f'/api/forms/file/ask_hr/{self.hr}/attachment/0'
        self.assertEqual(client().get(url).status_code, 403)
        r = client(**ADMIN).get(url)
        self.assertEqual((r.status_code, r.mimetype, r.headers['Cache-Control']), (200, 'image/jpeg', 'private, no-store'))
        self.assertEqual(client(**ADMIN).get(f'/api/forms/file/ask_hr/{self.hr}/attachment/1').status_code, 404)
        r = client(**ADMIN).post(f'/api/forms/submission/ask_hr/{self.hr}/status', json={'status': 'done', 'note': 'Sent the stub', 'by': 'Avery Office'})
        self.assertEqual(r.status_code, 200)
        sub = client(**ADMIN).get(f'/api/forms/submission/ask_hr/{self.hr}').get_json()
        self.assertEqual((sub['status'], sub['history'][-1]['note'], sub['history'][-1]['by']), ('done', 'Sent the stub', 'Avery Office'))
        self.assertEqual(self.ids(client(**ADMIN), '?status=new'), (200, [self.injury]))   # the HR question is done
        self.assertEqual(client(**ADMIN).post(f'/api/forms/submission/ask_hr/{self.hr}/status', json={'status': 'x'}).status_code, 400)


class AddedForms(Base):
    FORM = {'title': 'Catering Order Check', 'category': 'ops', 'audience': 'all', 'fields': [
        {'type': 'person', 'label': 'Your name'}, {'type': 'choice', 'label': 'Order ready?', 'required': True, 'options': [{'l': 'Yes'}, {'l': 'No'}]},
        {'type': 'photo', 'label': 'Photo'}, {'type': 'script', 'label': 'x'}]}

    def test_managers_add_forms_and_the_team_fills_them_out(self):
        self.assertEqual(client(**LEAD).post('/api/forms/definitions', json=self.FORM).status_code, 403)
        self.assertEqual(client(**MANAGER).post('/api/forms/definitions', json=self.FORM).status_code, 400)   # an unknown kind of answer
        form = dict(self.FORM, fields=self.FORM['fields'][:3])
        r = client(**MANAGER).post('/api/forms/definitions', json=form)
        self.assertEqual(r.status_code, 200, r.get_json())
        d = r.get_json()['form']
        self.assertTrue(d['id'].startswith('c_catering_order_check_'))
        self.assertEqual([f['type'] for f in d['fields']], ['store', 'person', 'choice', 'photo'])
        self.assertEqual(d['fields'][1]['role'], 'submitter')
        self.assertEqual(d['fields'][2]['options'], [{'v': 'o1', 'l': 'Yes'}, {'v': 'o2', 'l': 'No'}])
        self.assertEqual(d['inboxSummary'], ['q1', 'q2'])
        self.assertEqual([x['id'] for x in client().get('/api/forms/definitions').get_json()['forms']], [d['id']])
        r = self.send(client(), d['id'], {'store': 'buda', 'q1': 'Jordan Testcase', 'q2': 'o1'}, {'q3': [png()]})
        self.assertEqual(r.status_code, 200, r.get_json())
        self.assertEqual(self.send(client(), d['id'], {'q1': 'x'}, {'q9': [png()]}).status_code, 400)
        # Hidden: off the Forms tab, closed to new answers; a manager still sees it to bring it back.
        client(**MANAGER).post('/api/forms/definitions', json=dict(d, hidden=True))
        self.assertEqual(client().get('/api/forms/definitions').get_json()['forms'], [])
        self.assertEqual(len(client(**MANAGER).get('/api/forms/definitions').get_json()['forms']), 1)
        self.assertEqual(self.send(client(), d['id'], {'q1': 'x'}).status_code, 404)
        # An added form can't take a built-in form's name or carry anything but plain parts.
        self.assertEqual(client(**MANAGER).post('/api/forms/definitions', json=dict(form, id='ask_hr')).status_code, 400)
        clean, _ = forms_api.clean_definition(dict(form, icon='<svg onload=x>', category='nope', title='<b>Hi</b>  there'))
        self.assertEqual((clean['icon'], clean['category'], clean['title']), ('clipboard', 'ops', '<b>Hi</b> there'))   # text, drawn as text


class InStep(unittest.TestCase):
    def test_server_rules_match_the_definitions(self):
        out = subprocess.run(['node', os.path.join(ROOT, 'tools', 'forms_meta.js')], capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(out.stdout), forms_api.BUILT_IN, 'run: node tools/forms_meta.js > forms_meta.json')
        self.assertEqual(sorted(k for k, m in forms_api.BUILT_IN.items() if m['sensitive']), ['harassment_report', 'injury_report', 'termination'])
        self.assertEqual(len(forms_api.BUILT_IN), 14)

    def test_page_wiring(self):
        page = read('cfa-buda-ops-hub-complete.html')
        self.assertIn('data-view="forms">Forms <span class="sub"><i>Formularios</i></span></button>', page)
        self.assertIn('<div class="view" id="formsView">', page)
        self.assertIn('data-manage-go="forms" aria-selected="false">Forms</button>', page)
        self.assertIn('<script src="/static/forms/form-definitions.js"></script>\n<script src="/static/forms/forms-engine.js"></script>\n<script src="/static/js/forms.js"></script>', page)
        self.assertIn("'forms'", read('static', 'js', 'launch-mode.js').split('const LAUNCH_VIEWS')[1].split(';')[0])
        self.assertIn("if(typeof fmSync === 'function') fmSync();", read('static', 'js', 'fohoe-and-safecount.js'))
        self.assertIn('.fm-page .of-root,.of-toast{--of-bg:var(--cfa-bg);', read('static', 'css', 'theme-cfa.css'))


if __name__ == '__main__':
    unittest.main()
