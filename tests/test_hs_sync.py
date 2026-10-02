"""HotSchedules sync guard: the Ops Hub Sync bookmark reads names and shift
times off the Scheduling page, and nothing else.

Run: python3 -m unittest discover tests
"""
import os
import re
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')


def _read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


class HsSyncBookmarkTest(unittest.TestCase):
    def setUp(self):
        src = _read('static', 'js', 'hs-sync.js')
        m = re.search(r'\nfunction hsSyncBookmarklet\(HUB\)\{\n(.*?)\n\}\n', src, re.S)
        self.assertIsNotNone(m, 'hsSyncBookmarklet not found')
        self.code = m.group(1)
        self.src = src

    def test_never_reads_private_fields(self):
        # Hours, pay, phone numbers, and HotSchedules' employee records.
        for banned in ('total-hours', 'weekly-payment', 'phone', 'employee/', 'fetch(', 'XMLHttpRequest', 'extra-details'):
            self.assertNotIn(banned, self.code.lower() if banned == 'phone' else self.code, banned)

    def test_only_direct_shifts_are_read(self):
        # Shifts at other stores sit inside .extra-details, not directly in the cell.
        self.assertIn("'.cell-content > .shift'", self.code)

    def test_sends_only_to_ops_hub(self):
        self.assertIn('hub.postMessage(payload, HUB)', self.code)
        self.assertNotIn("postMessage(payload, '*')", self.code)

    def test_ops_hub_checks_sender(self):
        self.assertIn("const HS_SYNC_ORIGIN = 'https://app.hotschedules.com';", self.src)
        self.assertIn('e.origin !== HS_SYNC_ORIGIN', self.src)
        self.assertIn('e.source !== window.opener', self.src)

    def test_loaded_after_data_uploads(self):
        html = _read('cfa-buda-ops-hub-complete.html')
        self.assertLess(html.index('/static/js/data-uploads.js'), html.index('/static/js/hs-sync.js'))


if __name__ == '__main__':
    unittest.main()
