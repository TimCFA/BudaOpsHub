"""Spanish next to the English on the kitchen's screens (static/js/spanish.js).

Every phrase a screen asks for (esText / esHtml / esLine, data-es in the
page) must be in the glossary, or the Spanish silently goes missing. Run in
node.
"""
import json
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS = os.path.join(ROOT, 'static', 'js')


def glossary():
    out = subprocess.run(['node', os.path.join(ROOT, 'tests', 'spanish_runner.js')], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


G = glossary()


class Glossary(unittest.TestCase):
    def test_every_phrase_asked_for_is_there(self):
        asked = set()
        call = re.compile(r"""\bes(?:Text|Html|Line)\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*[,)]""")
        for name in os.listdir(JS):
            if name.endswith('.js') and name != 'spanish.js':
                with open(os.path.join(JS, name), encoding='utf-8') as f:
                    asked |= {(name, m.group(2).replace("\\'", "'")) for m in call.finditer(f.read())}
        with open(os.path.join(ROOT, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
            page = f.read()
        asked |= {('page', m) for m in re.findall(r'data-es(?:-placeholder)?="([^"]+)"', page)}
        self.assertGreater(len(asked), 150)
        missing = sorted(f'{where}: {phrase}' for where, phrase in asked if phrase not in G['keys'])
        self.assertEqual(missing, [])

    def test_every_phrase_reads_as_spanish(self):
        for key, text in G['rendered'].items():
            self.assertTrue(text and text.strip(), key)
            self.assertNotIn('undefined', text, key)

    def test_every_boh_station_and_daypart(self):
        self.assertEqual([s for s, es in G['stations'] if not es], [])
        self.assertIn(['Breader1', 'Empanizador 1'], G['stations'])
        self.assertIn(['Prep/dishes', 'Preparación/Platos'], G['stations'])
        self.assertEqual([d for d, es in G['dayparts'] if not es], [])

    def test_foh_spots_are_never_half_translated(self):
        for slot, es in G['fohStations']:
            if es:
                self.assertNotRegex(es, r'\b(iPOS|Bagger|Drinks?|Host|OMD|Runner)\b', slot)

    def test_html_helpers(self):
        self.assertEqual(G['html'][0], ' <span class="es" lang="es">Actualizar</span>')
        self.assertEqual(G['html'][1], '<span class="es es-line" lang="es">Actualizar</span>')
        self.assertEqual(G['html'][2], '')                       # no Spanish, nothing added
        self.assertIn('1 falta', G['html'][3])

    def test_weekdays(self):
        self.assertEqual(G['weekdays'], [['lunes', 'lunes'], ['sábado', 'sábados'], ['sáb', 'sáb']])

    def test_foh_side_stays_english_only(self):
        # FOH is English-only (Tim): the theme hides .es on the FOH side of
        # Set Ups and Waste and the sheets they open; esSyncSides sets the class.
        with open(os.path.join(ROOT, 'static', 'css', 'theme-cfa.css'), encoding='utf-8') as f:
            css = f.read()
        self.assertIn('body.es-off-setups :is(#positionsView, #posModal, #vacancyModal, #addTMModal) .es', css)
        self.assertIn('body.es-off-waste :is(#wastelogView, #wasteCountModal) .es{display:none;}', css)
        for name in ('fohoe-and-safecount.js', 'navigation.js'):
            with open(os.path.join(JS, name), encoding='utf-8') as f:
                self.assertIn('esSyncSides()', f.read(), name)

    def test_food_safety_is_bilingual(self):
        for s in G['fsSections']:
            self.assertTrue(s['es'], s['name'])
            self.assertEqual(s['missing'], [], s['name'])


if __name__ == '__main__':
    unittest.main()
