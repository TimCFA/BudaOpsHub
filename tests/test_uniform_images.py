"""Uniform pictures (Tim, Oct 16 2026): managers upload one per item; anyone
on the page can see them; they're kept apart from the app state and served
with long caching under a versioned URL.

Run: python3 -m unittest discover tests
Firebase is a dict.
"""
import base64
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402

store = {}


class FakeRef:
    def __init__(self, path):
        self.path = path.strip('/')

    def get(self):
        return store.get(self.path)

    def set(self, value):
        store[self.path] = value

    def delete(self):
        store.pop(self.path, None)


appmod.app.config['SESSION_COOKIE_SECURE'] = False

JPEG = b'\xff\xd8\xff\xe0' + b'\x00' * 200 + b'\xff\xd9'
PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 100


def data_url(raw, kind='image/jpeg'):
    return f'data:{kind};base64,' + base64.b64encode(raw).decode('ascii')


class UniformImagesTest(unittest.TestCase):
    def setUp(self):
        appmod.db.reference = lambda path: FakeRef(path)
        appmod._uniform_image_cache.clear()
        store.clear()
        self.c = appmod.app.test_client()

    def manager(self, c=None):
        with (c or self.c).session_transaction() as sess:
            sess['manager'] = True

    def test_only_managers_upload_or_remove(self):
        self.assertEqual(self.c.post('/api/uniform-image/uw-chapel', json={'data': data_url(JPEG)}).status_code, 403)
        self.assertEqual(self.c.delete('/api/uniform-image/uw-chapel').status_code, 403)
        self.assertEqual(store, {})

    def test_upload_then_anyone_sees_it_cached_by_version(self):
        self.manager()
        r = self.c.post('/api/uniform-image/uw-chapel', json={'data': data_url(JPEG)})
        self.assertEqual(r.status_code, 200)
        v = r.get_json()['v']
        self.assertEqual(store['uniformImages/uw-chapel']['type'], 'image/jpeg')
        self.assertNotIn('state/orders', store)          # never in the synced state
        anyone = appmod.app.test_client()
        got = anyone.get(f'/api/uniform-image/uw-chapel?v={v}')
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.mimetype, 'image/jpeg')
        self.assertEqual(got.data, JPEG)
        self.assertIn('immutable', got.headers['Cache-Control'])
        self.assertNotIn('Content-Encoding', got.headers)
        # An old or missing version isn't cached for a year.
        self.assertEqual(anyone.get('/api/uniform-image/uw-chapel').headers['Cache-Control'], 'no-cache')
        self.assertEqual(anyone.get('/api/uniform-image/uw-chapel', headers={'If-None-Match': f'"{v}"'}).status_code, 304)

    def test_read_from_firebase_once_after_a_restart(self):
        self.manager()
        v = self.c.post('/api/uniform-image/uw-x', json={'data': data_url(PNG, 'image/png')}).get_json()['v']
        appmod._uniform_image_cache.clear()
        got = self.c.get(f'/api/uniform-image/uw-x?v={v}')
        self.assertEqual((got.status_code, got.mimetype, got.data), (200, 'image/png', PNG))
        store.clear()                                     # served from memory now
        self.assertEqual(self.c.get(f'/api/uniform-image/uw-x?v={v}').status_code, 200)

    def test_refuses_what_isnt_a_picture_or_too_big(self):
        self.manager()
        bad = [
            {'data': 'data:text/html;base64,' + base64.b64encode(b'<script>').decode()},
            {'data': data_url(b'<svg onload=alert(1)>', 'image/jpeg')},     # says JPEG, isn't
            {'data': 'not a data url'},
            {},
        ]
        for body in bad:
            self.assertEqual(self.c.post('/api/uniform-image/uw-x', json=body).status_code, 400, body)
        big = b'\xff\xd8\xff' + b'\x00' * (appmod.UNIFORM_IMAGE_MAX_BYTES + 10)
        self.assertEqual(self.c.post('/api/uniform-image/uw-x', json={'data': data_url(big)}).status_code, 413)
        self.assertEqual(self.c.post('/api/uniform-image/../secure', json={'data': data_url(JPEG)}).status_code, 404)
        self.assertEqual(self.c.post('/api/uniform-image/a.b', json={'data': data_url(JPEG)}).status_code, 400)
        self.assertEqual(store, {})

    def test_remove(self):
        self.manager()
        self.c.post('/api/uniform-image/uw-x', json={'data': data_url(JPEG)})
        self.assertEqual(self.c.delete('/api/uniform-image/uw-x').status_code, 200)
        self.assertNotIn('uniformImages/uw-x', store)
        self.assertEqual(self.c.get('/api/uniform-image/uw-x').status_code, 404)

    def test_page_wiring(self):
        with open(os.path.join(os.path.dirname(__file__), '..', 'static', 'js', 'uniform-orders.js'), encoding='utf-8') as f:
            js = f.read()
        self.assertIn('${uoPicHtml(it)}<b>${escapeHtml(it.name)}</b>', js)
        self.assertIn("canvas.toDataURL('image/jpeg', q)", js)
        self.assertIn('const next = {...old, id, ...item};', js)   # editing keeps the picture


if __name__ == '__main__':
    unittest.main()
