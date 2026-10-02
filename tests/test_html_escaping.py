"""TIM-49 guard: inline handlers must not build JS strings by hand.

A name like O'Brien (or a hostile one) breaks out of onclick="fn('${name}')".
Pass values with jsArg() instead: onclick="fn(${jsArg(name)})".

Run: python3 -m unittest discover tests
"""
import os
import re
import unittest

JS_DIR = os.path.join(os.path.dirname(__file__), '..', 'static', 'js')
HANDLER_WITH_QUOTED_VALUE = re.compile(r'''\bon[a-z]+="[^"]*'\$\{''')


class InlineHandlerTest(unittest.TestCase):
    def test_no_hand_quoted_values_in_inline_handlers(self):
        found = []
        for name in sorted(os.listdir(JS_DIR)):
            if not name.endswith('.js'):
                continue
            with open(os.path.join(JS_DIR, name), encoding='utf-8') as f:
                for n, line in enumerate(f, 1):
                    if HANDLER_WITH_QUOTED_VALUE.search(line):
                        found.append(f'{name}:{n}')
        self.assertEqual(found, [], 'use jsArg() for values in inline handlers')

    def test_helpers_exist(self):
        with open(os.path.join(JS_DIR, 'state-and-utils.js'), encoding='utf-8') as f:
            src = f.read()
        self.assertIn('function escapeHtml(', src)
        self.assertIn('function jsArg(', src)


if __name__ == '__main__':
    unittest.main()
