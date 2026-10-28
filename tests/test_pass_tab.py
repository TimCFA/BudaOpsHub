"""The Tasks tab is the Pass (Tim, Oct 28 2026): this checks it's wired into
the hub (the tab, the view, the scripts, the sign-in hook), that its look is
the theme's, and that every phrase it asks the glossary for is there (the
EN / ES switch on the tab).

Run: python3 -m unittest discover tests
"""
import json
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


PAGE = read('cfa-buda-ops-hub-complete.html')
JS = read('static', 'js', 'pass.js')
ENGINE = read('static', 'js', 'pass-engine.js')
CSS = read('static', 'css', 'pass.css')
STR = r"'((?:\\.|[^'\\])*)'"


def asked_phrases():
    """Every phrase pass.js puts through the glossary."""
    js, a = JS, set()
    a |= set(re.findall(r"\b(?:T|TL|TT)\(\s*" + STR, js))
    a |= set(re.findall(r"\b(?:V|VL|VT)\((?:`[^`]*`|'[^']*'|[^,()]+(?:\([^()]*\))?)\s*,\s*" + STR, js))
    for fn in ('T', 'TT'):
        a |= {x for pair in re.findall(r"\b" + fn + r"\([^)]*?\?\s*" + STR + r"\s*:\s*" + STR, js) for x in pair}
    a |= set(re.findall(r"section\(\s*" + STR, js))
    a |= {x for pair in re.findall(r"emptyBox\(\s*" + STR + r"\s*,\s*" + STR, js) for x in pair}
    a |= set(re.findall(r"\['\w+', " + STR + r", I\.\w+\]", js))          # the views
    a |= set(re.findall(r"\['\w+', " + STR + r"\]", js))                   # chips, rail columns
    a |= set(re.findall(r"\['\w+', " + STR + r", '[ghb]'\]", js))          # segmented buttons
    a |= set(re.findall(r"stat\([^,]+,\s*" + STR, js))
    a |= set(re.findall(r"dl\(\s*" + STR, js))

    def line(start):
        i = js.index(start)
        return js[i:js.index('\n', i)]
    a |= set(re.findall(r"\w+: " + STR, line('const DONE_MSG')))
    a |= set(re.findall(r"\w+: " + STR, line("case 'checkin'")))
    a |= set(re.findall(r"'([^']+)'", line('const AREAS')))
    a |= set(re.findall(r"\w+: '([^']+)'", line('const ROLE_LABEL')))
    a |= {x for p in re.findall(r'name: "([^"]+)", desc: "([^"]+)"', ENGINE) for x in p}     # levels
    a |= set(re.findall(r'(?:none|midpoint|daily|weekly): "([^"]+)"', ENGINE))               # check-ins
    a |= set(re.findall(r'hint: "((?:\\.|[^"\\])*)"', ENGINE))                               # the clarity meter
    a |= set(re.findall(r'text: "([^"]+)"', ENGINE))                                          # advice
    return {x.replace("\\'", "'").replace('\\"', '"') for x in a}


class Wiring(unittest.TestCase):
    def test_tab_and_view(self):
        tab = re.search(r'<button[^>]*class="tab"[^>]*aria-controls="tasksView" data-view="tasks">Tasks<span class="ps-tab-badge" id="tasksTabBadge" hidden></span> <span class="sub"><i>Tareas</i></span></button>', PAGE)
        self.assertTrue(tab)
        self.assertNotIn('full-only', tab.group(0))
        self.assertIn('<div class="view" id="tasksView"></div>', PAGE)
        self.assertIn('<link rel="stylesheet" href="/static/css/pass.css">', PAGE)
        self.assertLess(PAGE.index('/static/css/dark.css'), PAGE.index('/static/css/pass.css'))
        self.assertLess(PAGE.index('/static/js/spanish.js'), PAGE.index('/static/js/pass.js'))
        self.assertLess(PAGE.index('<script src="/static/js/pass-engine.js"></script>'), PAGE.index('<script src="/static/js/pass.js"></script>'))
        self.assertNotIn('taskhub', PAGE)
        self.assertFalse(os.path.exists(os.path.join(ROOT, 'taskhub')))

    def test_opening_the_tab_and_signing_in(self):
        self.assertIn("if(view === 'tasks' && typeof psActivate === 'function') psActivate();", read('static', 'js', 'navigation.js'))
        self.assertIn("if(typeof psSync === 'function') psSync();", read('static', 'js', 'sign-in.js'))
        launch = read('static', 'js', 'launch-mode.js')
        views = launch[launch.index('const LAUNCH_VIEWS'):launch.index('];', launch.index('const LAUNCH_VIEWS'))]
        self.assertIn("'tasks'", views)
        self.assertIn('window.psActivate = activate;', JS)
        self.assertIn('window.psSync = sync;', JS)

    def test_peoples_words_are_escaped(self):
        """Titles, notes and names reach the page only through h()."""
        for field in ('t.title', 't.outcome', 't.intent', 't.evidence', 't.feedback', 't.aar', 'p.name', 'S.me.name', 't.backbrief.summary', 'eventText(e)'):
            html_lines = '\n'.join(ln for ln in JS.split('\n') if '<' in ln)      # the nudge and eval summary are plain text
            for m in re.finditer(r'\$\{([^{}]*' + re.escape(field) + r'[^{}]*)\}', html_lines):
                self.assertTrue(re.search(r'\bh\(|\bnum\(|\bfirst\(|TT\(|\? ', m.group(1)) or 'pname' in m.group(1), m.group(0))
        self.assertNotIn('eval(', JS.replace('evalSummary(', ''))

    def test_spanish_switch_and_every_phrase_it_asks_for(self):
        self.assertIn('data-es="1"', JS)
        self.assertIn("LS.set('es'", JS)
        out = subprocess.run(['node', os.path.join(ROOT, 'tests', 'spanish_runner.js')], capture_output=True, text=True, check=True)
        keys = set(json.loads(out.stdout)['keys'])
        asked = asked_phrases()
        self.assertGreater(len(asked), 200)
        self.assertEqual(sorted(p for p in asked if p not in keys), [])

    def test_the_phone_bar_never_covers_a_hub_pop_up(self):
        theme = read('static', 'css', 'main.css') + read('static', 'css', 'theme-cfa.css')
        overlay = int(re.search(r'\.overlay\{[^}]*z-index:(\d+)', theme).group(1))
        for sel in ('.ps-nav', '.ps-fab'):
            z = int(re.search(re.escape(sel) + r'\{position:fixed;[^}]*z-index:(\d+)', CSS).group(1))
            self.assertLess(z, overlay, sel)

    def test_the_look_is_the_theme(self):
        for token in ('var(--cfa-red', 'var(--cfa-navy', 'var(--cfa-white', 'var(--font-display', 'var(--font-ui', 'html[data-theme="dark"]'):
            self.assertIn(token, CSS)
        self.assertNotIn('IBM Plex', CSS + JS)
        self.assertNotIn('Barlow', CSS + JS)
        emoji = re.compile('[\U0001F300-\U0001FAFF☀-➿]')
        self.assertIsNone(emoji.search(JS + CSS + ENGINE))
        # every class the stylesheet styles is namespaced, so nothing leaks into the hub
        for sel in re.findall(r'(?:^|[\s,{}])\.([a-zA-Z][\w-]*)', re.sub(r'/\*.*?\*/', '', CSS, flags=re.S)):
            self.assertTrue(sel.startswith('ps-') or sel in ('tab', 'es', 'es-line', 'on', 'over', 'nm', 'rl', 'sub', 'k', 't', 'd', 'g', 'h', 'b', 'row', 'msg',
                                                             'heat', 'bad', 'go', 'lv', 'soon', 'late', 'red', 'ghost', 'dark-red', 'tight', 'short', 'anim',
                                                             'hot', 'head', 'when', 'txt', 'is-late', 'is-block', 'is-bad', 'ready', 'tighten', 'lg',
                                                             'p-high', 'p-critical') or sel.startswith('s-'), sel)


if __name__ == '__main__':
    unittest.main()
