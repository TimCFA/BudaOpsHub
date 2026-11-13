"""Scripts are sent trimmed (js_trim.py; Tim, Nov 13 2026): comments,
indentation and blank lines come out, about a sixth less to download on a
first load, and the program stays the same. The files on disk keep every
note.

The proof it's the same program: every script the page loads is parsed
before and after trimming and the two syntax trees must match (positions
aside). That needs espree (it ships with eslint); without it, each trimmed
script must at least still compile.

Run: python3 -m unittest discover tests
"""
import json
import os
import re
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import app as appmod  # noqa: E402
from js_trim import trim_js  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ESPREE = next((p for p in ('/opt/node-tools/node_modules/espree', os.path.join(ROOT, 'node_modules', 'espree')) if os.path.isdir(p)), None)


def scripts():
    with open(os.path.join(ROOT, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
        return re.findall(r'<script src="/(static/[^"]+\.js)" defer>', f.read())


class Trimmer(unittest.TestCase):
    def test_what_comes_out(self):
        src = "// a note\nconst a = 1;   // why\n\n  /* block */ const b = 2;\n    function f(){\n      return a; /* x\n y */ }\n"
        self.assertEqual(trim_js(src), "const a = 1;\nconst b = 2;\nfunction f(){\nreturn a;\n}\n")

    def test_strings_templates_and_regexes_are_left_alone(self):
        for src in ("const u = 'http://x/y'; // gone\n",
                    'const s = "a // b /* c */";\n',
                    "const r = /https?:\\/\\/[^/'\"`]+/g, q = a / b / c;\n",
                    "const t = `one\n   // not a note\n   two ${ x ? `in  ·  ${y /* gone */}  ` : '' }  three`;\n",
                    "const h = `<p class=\"a\" role=\"b\">\n      <b>${n}</b>\n    </p>`;\n",
                    "if(x) return /[`'\"]/.test(s);\n",
                    "const d = a\n  / b;\n"):
            out = trim_js(src)
            kept = re.sub(r'\s*//\s*gone\n', '\n', src).replace(' /* gone */', ' ')
            self.assertEqual(out.replace('\n', '').replace(' ', ''), kept.replace('\n', '').replace(' ', ''), src)
        nested = "const t = `a ${ x ? ` · ${y}` : '' } b`;\n"
        self.assertEqual(trim_js(nested), nested)                                   # every character of a template, nested ones too
        multi = "x = `<p>\n      hi\n    </p>`;\n"
        self.assertEqual(trim_js(multi), multi)

    def test_lines_are_never_joined(self):
        src = "let a = 1\nlet b = 2\n(function(){})()\n"
        self.assertEqual(trim_js(src).count('\n'), 3)
        self.assertEqual(trim_js("a = b /* x\n */ + c\n"), "a = b\n+ c\n")        # a comment's line break is still a line break

    def test_broken_input_raises(self):
        for src in ("const s = 'abc\n", "x = `abc", "/* never ends"):
            with self.assertRaises(ValueError):
                trim_js(src)


class EveryScript(unittest.TestCase):
    def test_trims_to_the_same_program(self):
        files = scripts()
        self.assertGreater(len(files), 80)
        raw = sum(os.path.getsize(os.path.join(ROOT, f)) for f in files)
        pairs = []
        for f in files:
            with open(os.path.join(ROOT, f), encoding='utf-8') as fh:
                src = fh.read()
            pairs.append([f, src, trim_js(src)])
        self.assertLess(sum(len(m.encode()) for _, _, m in pairs), raw * 0.9)       # worth doing: a tenth less at least
        runner = r"""
const fs = require('fs'), vm = require('vm');
const pairs = JSON.parse(fs.readFileSync(0, 'utf8')), espreePath = process.argv[1];
const espree = espreePath ? require(espreePath) : null;
const strip = n => JSON.stringify(n, (k, v) => (k === 'range' || k === 'loc' || k === 'start' || k === 'end' || k === 'raw') ? undefined : v);
const bad = [];
for(const [f, src, min] of pairs){
  try{
    new vm.Script(min, {filename: f});
    if(espree && strip(espree.parse(src, {ecmaVersion: 'latest'})) !== strip(espree.parse(min, {ecmaVersion: 'latest'}))) bad.push(f + ': a different program');
  }catch(e){ bad.push(f + ': ' + e.message); }
}
process.stdout.write(JSON.stringify({bad, proved: !!espree}));
"""
        out = subprocess.run(['node', '-e', runner, ESPREE or ''], input=json.dumps(pairs), capture_output=True, text=True, check=True)
        got = json.loads(out.stdout)
        self.assertEqual(got['bad'], [])
        if not got['proved']:
            self.skipTest('espree not found: each trimmed script compiles, but the tree comparison did not run')


class Served(unittest.TestCase):
    def setUp(self):
        self.c = appmod.app.test_client()

    def test_a_script_goes_out_trimmed_and_the_file_keeps_its_notes(self):
        r = self.c.get('/static/js/timers.js')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.headers['Content-Type'].startswith('text/javascript'))
        sent = r.get_data(as_text=True)
        with open(os.path.join(ROOT, 'static', 'js', 'timers.js'), encoding='utf-8') as f:
            disk = f.read()
        self.assertEqual(sent, trim_js(disk))
        self.assertIn('// ===== TIMERS', disk)
        self.assertNotIn('// ===== TIMERS', sent)
        self.assertLess(len(sent), len(disk))

    def test_everything_else_is_as_before(self):
        css = self.c.get('/static/css/timers.css')
        with open(os.path.join(ROOT, 'static', 'css', 'timers.css'), 'rb') as f:
            self.assertEqual(css.data, f.read())
        self.assertEqual(self.c.get('/static/js/nope.js').status_code, 404)
        self.assertEqual(self.c.get('/static/js/%2e%2e/%2e%2e/app.py').status_code, 404)
        self.assertEqual(self.c.get('/static/logo.png').status_code, 200)

    def test_sent_as_written_if_trimming_fails(self):
        real, cache = appmod.trim_js, dict(appmod._TRIMMED)
        try:
            appmod._TRIMMED.clear()
            appmod.trim_js = lambda s: (_ for _ in ()).throw(ValueError('no'))
            sent = self.c.get('/static/js/truck.js').get_data(as_text=True)
            with open(os.path.join(ROOT, 'static', 'js', 'truck.js'), encoding='utf-8') as f:
                self.assertEqual(sent, f.read())
        finally:
            appmod.trim_js = real
            appmod._TRIMMED.clear(); appmod._TRIMMED.update(cache)

    def test_the_stamp_knows_about_the_trimming(self):
        import hashlib
        with open(os.path.join(ROOT, 'static', 'js', 'truck.js'), 'rb') as f:
            data = f.read()
        self.assertEqual(appmod._file_stamp('/static/js/truck.js'), hashlib.sha256(data + appmod._TRIM_VERSION).hexdigest()[:12])
        with open(os.path.join(ROOT, 'static', 'css', 'dark.css'), 'rb') as f:
            self.assertEqual(appmod._file_stamp('/static/css/dark.css'), hashlib.sha256(f.read()).hexdigest()[:12])


if __name__ == '__main__':
    unittest.main()
