"""The men's outerwear on the uniform form (Tim, Oct 23 2026, from
Connecteam's form): six items with their own prices and pictures. The
pictures come with the app (static/uniforms) until a manager uploads
another; a catalog a manager has already saved gets the items once, after
the women's outerwear, and one deleted later stays deleted.

Run: python3 -m unittest discover tests
Firebase is a dict.
"""
import base64
import json
import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
from event_fixes import MENS_OUTERWEAR, add_mens_outerwear  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
store = {}


class FakeRef:
    def __init__(self, path):
        self.path = path.strip('/')

    def get(self):
        if self.path in store:
            return store[self.path]
        prefix = self.path + '/'
        return {k[len(prefix):]: v for k, v in store.items() if k.startswith(prefix)} or None

    def set(self, value):
        store[self.path] = value

    def delete(self):
        store.pop(self.path, None)


def women():
    return [{'id': 'uw-palomar', 'group': 'Outerwear for Women', 'name': 'Palomar Pullover', 'price': 35},
            {'id': 'uw-parka', 'group': 'Outerwear for Women', 'name': 'Parka', 'price': 131.5},
            {'id': 'acc-belt', 'group': 'Accessories', 'name': 'Belt', 'price': 12}]


class Catalog(unittest.TestCase):
    def test_added_after_the_womens_outerwear_once(self):
        out, n = add_mens_outerwear(women())
        self.assertEqual(n, 6)
        self.assertEqual([c['id'] for c in out], ['uw-palomar', 'uw-parka', 'um-palomar', 'um-chapel', 'um-softshell',
                                                  'um-tanasbourne', 'um-northeast8', 'um-parka', 'acc-belt'])
        self.assertEqual({c['name']: c['price'] for c in out if c['group'] == 'Outerwear for Men'},
                         {'Palomar Pullover': 35, 'Chapel Fleece': 20, 'Softshell Jacket': 50, 'Tanasbourne Rainjacket': 70,
                          'Northeast 8 Jacket': 72.75, 'Parka': 161.5})
        self.assertEqual(add_mens_outerwear(out), (out, 0))
        self.assertEqual(add_mens_outerwear(None), (None, 0))

    def test_the_page_and_the_server_list_the_same_items(self):
        with open(os.path.join(ROOT, 'static', 'js', 'uniform-orders.js'), encoding='utf-8') as f:
            js = f.read()
        runner = ("const fs=require('fs'),vm=require('vm');const s=fs.readFileSync(process.argv[1],'utf8');"
                  "const c={};vm.createContext(c);vm.runInContext(s.match(/const UNIFORM_SIZES[^;]*;/)[0]+s.match(/const UNIFORM_SEED = \\[[\\s\\S]*?\\n\\];/)[0]+'globalThis.out=UNIFORM_SEED;',c);"
                  "process.stdout.write(JSON.stringify(c.out.filter(x=>x.group==='Outerwear for Men')));")
        seed = json.loads(subprocess.run(['node', '-e', runner, os.path.join(ROOT, 'static', 'js', 'uniform-orders.js')],
                                         capture_output=True, text=True, check=True).stdout)
        self.assertEqual(seed, MENS_OUTERWEAR)
        self.assertIn("img: 'bundled'", js)


class ServerApplies(unittest.TestCase):
    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._uniform_image_cache.clear()
        store.clear()
        self.saved = dict(appmod._cache)
        self.name = next(n for n, keys in appmod.STATE_SECTIONS.items() if 'uniformCatalog' in keys)

    def tearDown(self):
        appmod._cache.clear()
        appmod._cache.update(self.saved)

    def test_a_saved_catalog_gets_them_once(self):
        appmod._cache[self.name] = {'data': {'uniformCatalog': women(), 'uniformOrders': []}, 'ver': 'v1', 'canon': ''}
        appmod._apply_once('uniformMensOuterwear', 'uniformCatalog', add_mens_outerwear)
        cat = appmod._cache[self.name]['data']['uniformCatalog']
        self.assertEqual(len(cat), 9)
        self.assertTrue(store[f'{appmod.ONCE_PATH}/uniformMensOuterwear'])
        # Deleted afterwards: stays deleted.
        appmod._cache[self.name]['data']['uniformCatalog'] = [c for c in cat if c['id'] != 'um-parka']
        appmod._apply_once('uniformMensOuterwear', 'uniformCatalog', add_mens_outerwear)
        self.assertNotIn('um-parka', [c['id'] for c in appmod._cache[self.name]['data']['uniformCatalog']])

    def test_no_saved_catalog_needs_nothing(self):
        appmod._cache[self.name] = {'data': {'uniformCatalog': None}, 'ver': 'v1', 'canon': ''}
        appmod._apply_once('uniformMensOuterwear', 'uniformCatalog', add_mens_outerwear)
        self.assertIsNone(appmod._cache[self.name]['data']['uniformCatalog'])
        self.assertTrue(store[f'{appmod.ONCE_PATH}/uniformMensOuterwear'])

    def test_a_full_read_applies_it_when_the_events_need_nothing(self):
        # Live on Oct 22 2026 the step sat after the event fixes' early
        # return, so with the calendar already right it never ran.
        for name in appmod.STATE_SECTIONS:
            store[f'{appmod.STATE_ROOT}/{name}'] = json.dumps({})
        store[f'{appmod.STATE_ROOT}/{self.name}'] = json.dumps({'uniformOrders': [], 'uniformCatalog': women()})
        self.assertTrue(appmod._refresh_cache())
        ids = [c['id'] for c in json.loads(store[f'{appmod.STATE_ROOT}/{self.name}'])['uniformCatalog']]
        self.assertIn('um-parka', ids)
        self.assertEqual(ids, [c['id'] for c in appmod._cache[self.name]['data']['uniformCatalog']])
        self.assertTrue(store[f'{appmod.ONCE_PATH}/uniformMensOuterwear'])

    def test_the_pictures_come_with_the_app_until_one_is_uploaded(self):
        c = appmod.app.test_client()
        for m in MENS_OUTERWEAR:
            r = c.get(f"/api/uniform-image/{m['id']}?v=bundled")
            self.assertEqual(r.status_code, 200, m['id'])
            self.assertEqual(r.mimetype, 'image/jpeg')
            self.assertIn('immutable', r.headers['Cache-Control'])
        self.assertEqual(c.get('/api/uniform-image/uw-chapel').status_code, 404)        # no picture of its own
        self.assertEqual(c.get('/api/uniform-image/..%2Fapp').status_code, 404)
        # A manager's upload takes over.
        with c.session_transaction() as sess:
            sess['manager'] = True
        jpeg = b'\xff\xd8\xff\xe0' + b'\x00' * 200 + b'\xff\xd9'
        r = c.post('/api/uniform-image/um-parka', json={'data': 'data:image/jpeg;base64,' + base64.b64encode(jpeg).decode()})
        self.assertEqual(r.status_code, 200, r.get_json())
        self.assertEqual(c.get('/api/uniform-image/um-parka').data, jpeg)

    def test_the_pictures_are_small(self):
        for m in MENS_OUTERWEAR:
            self.assertLess(os.path.getsize(os.path.join(ROOT, 'static', 'uniforms', f"{m['id']}.jpg")), 60 * 1024)


if __name__ == '__main__':
    unittest.main()
