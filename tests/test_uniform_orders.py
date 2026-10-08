"""Uniform orders (static/js/uniform-orders.js): the Connecteam uniform form
moved into the hub (Tim, Oct 2026). Leaders only for now, Buda FSU only, the
items edited in Manage; the orders are private (manager sessions only)."""
import json
import os
import re
import subprocess
import unittest

import app as appmod

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, 'tests', 'uniform_orders_runner.js')

with open(os.path.join(ROOT, 'cfa-buda-ops-hub-complete.html'), encoding='utf-8') as f:
    PAGE = f.read()


def run(*ops, **extra):
    cases = [dict(op=op, **extra) for op in ops]
    out = subprocess.run(['node', RUNNER], input=json.dumps({'cases': cases}), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


class Data(unittest.TestCase):
    def test_orders_are_private_and_manager_only(self):
        self.assertEqual(appmod.STATE_SECTIONS['orders'], ['uniformOrders', 'uniformCatalog'])
        self.assertIn('orders', appmod.PRIVATE_SECTIONS)
        for key in ('uniformOrders', 'uniformCatalog'):
            self.assertIn(key, appmod.MANAGER_ONLY_KEYS)

    def test_saved_and_read_back(self):
        with open(os.path.join(ROOT, 'static', 'js', 'storage.js'), encoding='utf-8') as f:
            src = f.read()
        snap = src[src.index('function stateSnapshot'):src.index('function stateSections')]
        for key in ('uniformOrders', 'uniformCatalog'):
            self.assertIn(key, snap)
            self.assertIn(f'{key} = ', src)


class Catalog(unittest.TestCase):
    def test_seed_is_what_connecteam_showed(self):
        # Tim's PDF of the Connecteam form, Outerwear for Women: names, prices
        # and colors as listed there. Everything else is added in Manage.
        seed = run('c => UNIFORM_SEED')[0]
        self.assertEqual([(i['name'], i['price'], i['colors']) for i in seed], [
            ('Palomar Pullover', 35, []),
            ('Chapel Fleece', 30, ['Red', 'Blue']),
            ('Softshell Jacket', 30, ['Red', 'Blue']),
            ('Tanasbourne Rainjacket', 70, ['Red', 'Blue']),
            ('Northeast 8 Jacket', 72.75, ['Blue', 'Red']),
            ('Parka', 131.5, []),
        ])
        self.assertTrue(all(i['group'] == 'Outerwear for Women' for i in seed))
        self.assertTrue(all(i['sizes'] == ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'] for i in seed))

    def test_saved_list_replaces_the_seed(self):
        got = run("c => { uniformCatalog = [{id: 'x', group: 'Shoes', name: 'Non-slip shoe', price: 40, colors: [], sizes: ['9']}]; return uniformItems().map(i => i.name); }")[0]
        self.assertEqual(got, ['Non-slip shoe'])


class Form(unittest.TestCase):
    def test_item_needs_its_color_and_size(self):
        got = run("""c => {
            const it = UNIFORM_SEED.find(i => i.id === 'uw-chapel');
            return [uoLineFromPick(it, {size: 'M'}).error, uoLineFromPick(it, {color: 'Red'}).error,
                    uoLineFromPick(it, {color: 'Red', size: 'M', qty: '2'}).line,
                    uoLineFromPick(UNIFORM_SEED.find(i => i.id === 'uw-parka'), {size: 'L'}).line];
        }""")[0]
        self.assertIn('color', got[0])
        self.assertIn('size', got[1])
        self.assertEqual(got[2], {'itemId': 'uw-chapel', 'item': 'Chapel Fleece', 'group': 'Outerwear for Women', 'qty': 2, 'price': 30, 'color': 'Red', 'size': 'M'})
        self.assertNotIn('color', got[3])

    def test_same_item_adds_up(self):
        got = run("""c => {
            uoDraft = {name: '', role: '', split: '', lines: []};
            const it = UNIFORM_SEED.find(i => i.id === 'uw-chapel');
            uoAddLine(uoLineFromPick(it, {color: 'Red', size: 'M', qty: 1}).line);
            uoAddLine(uoLineFromPick(it, {color: 'Red', size: 'M', qty: 2}).line);
            uoAddLine(uoLineFromPick(it, {color: 'Blue', size: 'M', qty: 1}).line);
            return uoDraft.lines.map(l => [l.color, l.qty]);
        }""")[0]
        self.assertEqual(got, [['Red', 3], ['Blue', 1]])

    def test_every_question_is_required(self):
        got = run("""c => {
            const line = {itemId: 'uw-parka', item: 'Parka', group: 'Outerwear for Women', qty: 1, price: 131.5, size: 'L'};
            const tries = [
              {name: ' ', role: 'Trainer', split: 'no', lines: [line]},
              {name: 'Maya Torres', role: '', split: 'no', lines: [line]},
              {name: 'Maya Torres', role: 'Trainer', split: '', lines: [line]},
              {name: 'Maya Torres', role: 'Trainer', split: 'no', lines: []},
              {name: '  Maya   Torres ', role: 'Trainer', split: 'yes', lines: [line]},
            ];
            return tries.map(d => { uoDraft = d; return uoReadDraft(); });
        }""")[0]
        self.assertTrue(all('error' in g for g in got[:4]))
        self.assertEqual(got[4]['order']['name'], 'Maya Torres')
        self.assertIs(got[4]['order']['split'], True)

    def test_totals_and_the_two_check_split(self):
        got = run("""c => {
            const lines = [{qty: 1, price: 72.75}, {qty: 2, price: 30}, {qty: 1, price: 0.01}];
            const t = uoTotalCents(lines);
            return [t, uoSplitCents(t), uoSplitCents(13275), uoMoney(13275)];
        }""")[0]
        self.assertEqual(got[0], 13276)
        self.assertEqual(got[1], [6638, 6638])
        self.assertEqual(got[2], [6638, 6637])          # the first check takes the odd cent
        self.assertEqual(got[3], '$132.75')

    def test_name_box_offers_this_weeks_schedule(self):
        self.assertEqual(run('c => uoRosterNames()')[0], ['Ava Morales', 'Maya Torres', 'Noah Bennett'])


class Orders(unittest.TestCase):
    ORDERS = """uniformOrders = [
        {id: 'a', at: '2026-10-01T15:00:00Z', name: 'Maya Torres', role: 'Trainer', split: true, status: 'new',
         lines: [{item: 'Chapel Fleece', group: 'Outerwear for Women', color: 'Red', size: 'M', qty: 2, price: 30}]},
        {id: 'b', at: '2026-10-03T15:00:00Z', name: 'Noah, "Jr" Bennett', role: 'Team Member', split: false, status: 'done',
         lines: [{item: 'Parka', group: 'Outerwear for Women', size: 'L', qty: 1, price: 131.5}]},
        {id: 'c', at: '2026-10-05T15:00:00Z', name: 'Ava Morales', role: 'Team Leader', split: false, status: 'ordered',
         lines: [{item: 'Palomar Pullover', group: 'Outerwear for Women', size: 'S', qty: 1, price: 35}]},
    ];"""

    def test_open_is_new_and_ordered_newest_first(self):
        got = run(f"c => {{ {self.ORDERS} return ['open', 'done', 'all'].map(f => {{ uoFilter = f; return uoOrdersShown().map(o => o.id); }}).concat([uoOpenCount()]); }}")[0]
        self.assertEqual(got, [['c', 'a'], ['b'], ['c', 'b', 'a'], 2])

    def test_csv_one_row_per_item_and_quoted(self):
        csv = run(f"c => {{ {self.ORDERS} return uoCsv(uniformOrders); }}")[0]
        lines = csv.strip().split('\n')
        self.assertEqual(lines[0], 'Submitted,Name,Role,Item,Group,Color,Size,Qty,Price,Line total,Order total,Split over two checks,Status')
        self.assertEqual(lines[1], '2026-10-01,Maya Torres,Trainer,Chapel Fleece,Outerwear for Women,Red,M,2,$30.00,$60.00,$60.00,Yes,New')
        self.assertEqual(lines[2], '2026-10-03,"Noah, ""Jr"" Bennett",Team Member,Parka,Outerwear for Women,,L,1,$131.50,$131.50,$131.50,No,Handed out')

    def test_typed_text_is_escaped(self):
        html = run("""c => uoOrderHtml({id: '"><img src=x onerror=alert(1)>', at: '2026-10-01T15:00:00Z', by: '<b>', name: '<img src=x onerror=alert(1)>',
            role: 'Trainer', split: false, status: 'new', lines: [{item: '<script>x</script>', qty: 1, price: 1}]})""")[0]
        self.assertNotIn('<img', html)
        self.assertNotIn('<script>', html)
        self.assertIn('by &lt;b&gt;', html)


class Page(unittest.TestCase):
    def test_tab_is_leaders_only(self):
        tab = re.search(r'<button[^>]*data-view="uniforms"[^>]*>', PAGE).group(0)
        self.assertIn('manager-only', tab)
        with open(os.path.join(ROOT, 'static', 'js', 'navigation.js'), encoding='utf-8') as f:
            self.assertIn("view === 'uniforms'", f.read())

    def test_no_store_question(self):
        with open(os.path.join(ROOT, 'static', 'js', 'uniform-orders.js'), encoding='utf-8') as f:
            src = f.read()
        self.assertNotIn('West Buda', src)


if __name__ == '__main__':
    unittest.main()
