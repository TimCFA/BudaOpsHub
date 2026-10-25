"""Two phones on one set up, with the server going down for a moment (an
update restarting it) — the page's real save, sync and Refresh code
(storage.js, state-patch.js) against a stand-in server.

A change made while the server can't be reached used to stay on that phone
only, laid back over every update it heard, so the phones drifted apart
until a reload. Now it's sent again on its own, and by the next background
check or Refresh.

Run: python3 -m unittest discover tests   (needs Node.js; skipped without it)
"""
import json
import os
import shutil
import subprocess
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')
NODE = shutil.which('node')

RUNNER = r"""
const fs = require('fs'), vm = require('vm');
const js = f => fs.readFileSync(process.argv[1] + '/' + f, 'utf8');
const st = js('storage.js'), patch = js('state-patch.js');
const fn = n => st.match(new RegExp('(async )?function ' + n + '\\([\\s\\S]*?\\n}\\n'))[0];
const constLine = n => st.match(new RegExp('const ' + n + ' = .*\\n'))[0];

// The stand-in server: one section, versions, patches merged onto the latest.
const server = {data: {setups: {posAssignments: {}}}, ver: {setups: 'v1'}, up: true, n: 1};
const srvPatch = require('vm').createContext({});
vm.runInContext(patch, srvPatch);
function serverHandle(path, body){
  if(!server.up) return null;
  const reply = {sections: {}, versions: {...server.ver}, build: 'b1'};
  if(path === '/api/state/patch'){
    Object.entries(body.patches).forEach(([name, p]) => {
      if(p.ver !== server.ver[name]) reply.sections[name] = JSON.stringify(server.data[name]);
      server.data[name] = srvPatch.stateApplyOps(server.data[name], p.ops);
      server.ver[name] = 'v' + (++server.n);
    });
    reply.versions = {...server.ver};
    return JSON.parse(JSON.stringify(reply));
  }
  if(path === '/api/state/sync'){
    Object.keys(server.data).forEach(name => { if(body.versions[name] !== server.ver[name] && (!body.only || body.only.includes(name))) reply.sections[name] = JSON.stringify(server.data[name]); });
    return JSON.parse(JSON.stringify(reply));
  }
}

// A phone: the real code, with the page's data cut down to the set up.
const timers = [];
function phone(store){
  store = store || {};
  const ctx = vm.createContext({console, JSON, Object, Math, Date, Promise, Array, Set, Map, String, Number, isFinite,
    setTimeout: (f, ms) => { timers.push(f); return timers.length; }, clearTimeout: () => {}});
  vm.runInContext(patch, ctx);
  ctx.__store = store;
  vm.runInContext(`
    const STATE_SECTIONS = {setups: ['posAssignments']}; const STATE_SECTION_OF = {posAssignments: 'setups'};
    let posAssignments = {};
    let stateBase = {}, savedSections = {}, stateVersions = {};
    let stateSyncing = false, stateLastSync = 0, stateRerenderPending = false;
    const localStorage = {setItem(k, v){ __store[k] = v; }, getItem(k){ return k in __store ? __store[k] : null; }, removeItem(k){ delete __store[k]; }};
    function stateSnapshot(){ return {posAssignments}; }
    function stateSections(s){ return {setups: JSON.stringify({posAssignments: s.posAssignments})}; }
    function stateSectionString(name, part){ return JSON.stringify({posAssignments: part.posAssignments}); }
    function applyStateData(d){ posAssignments = d.posAssignments || {}; }
    function calcStreak(){} function setSyncStatus(){} function stateNoteBuild(){} function stateRerender(){}
    const document = {getElementById(){ return {style: {}}; }};
  `, ctx);
  ctx.statePost = async (path, body) => serverHandle(path, body);
  vm.runInContext(['stateAdoptServer', 'stateAdoptLocal', 'stateReconcile', 'saveOnce', 'stateSectionSaved', 'stateHasUnsent', 'saveState', 'syncState', 'refreshSetups',
                    'outboxWrite', 'outboxRead', 'outboxPending', 'outboxReplay'].map(fn).join('')
    + constLine('SAVE_RETRY_MS') + 'let saveInFlight = null, saveAgain = false, saveRetryTimer = null, saveRetryN = 0, outboxCarry = null;' + constLine('SETUP_REFRESH_SECTIONS')
    + constLine('OUTBOX_KEY') + constLine('OUTBOX_MAX_AGE') + constLine('OUTBOX_SETS_AGE'), ctx);
  // Loaded from the server.
  vm.runInContext(`stateBase.setups = ${JSON.stringify(server.data.setups)}; savedSections.setups = JSON.stringify(stateBase.setups); stateVersions.setups = '${server.ver.setups}'; posAssignments = JSON.parse(JSON.stringify(stateBase.setups.posAssignments));`, ctx);
  return ctx;
}

(async () => {
  const K = 'foh||2026-10-12||Lunch (10:30-1:00)||';
  const a = phone(), b = phone();
  // The server restarts; phone A puts Ethan on OMD 1 meanwhile.
  server.up = false;
  vm.runInContext(`posAssignments['${K}OMD 1'] = 'Ethan'`, a);
  await vm.runInContext('saveState()', a);
  const stuck = {server: server.data.setups.posAssignments[K + 'OMD 1'] || null, unsent: vm.runInContext('stateHasUnsent()', a), retries: timers.length};
  // Back up: the retry sends it, no new tap needed.
  server.up = true;
  await timers.shift()();
  await new Promise(r => setImmediate(r));
  const sent = {server: server.data.setups.posAssignments[K + 'OMD 1'] || null, unsent: vm.runInContext('stateHasUnsent()', a)};
  // Phone B's Refresh shows it.
  const r = await vm.runInContext('refreshSetups()', b);
  const seen = vm.runInContext(`posAssignments['${K}OMD 1'] || null`, b);

  // Down again: B fills Host 1 and its save fails; B's own background
  // check (before any retry timer) sends it once the server's back.
  server.up = false;
  vm.runInContext(`posAssignments['${K}Host 1 (Captain)'] = 'Kaiya'`, b);
  await vm.runInContext('saveState()', b);
  server.up = true;
  await vm.runInContext('syncState()', b);
  const viaSync = server.data.setups.posAssignments[K + 'Host 1 (Captain)'] || null;
  // And A's Refresh picks it up.
  await vm.runInContext('refreshSetups()', a);
  const aSees = vm.runInContext(`posAssignments['${K}Host 1 (Captain)'] || null`, a);

  // Down a third time: A fills Host 2; A's Refresh sends it before checking.
  server.up = false;
  vm.runInContext(`posAssignments['${K}Host 2'] = 'Makenzi'`, a);
  await vm.runInContext('saveState()', a);
  server.up = true;
  const r3 = await vm.runInContext('refreshSetups()', a);
  const viaRefresh = server.data.setups.posAssignments[K + 'Host 2'] || null;

  // Down a fourth time: a phone fills Host 3, then reloads before the server
  // is back. The reloaded page loads the server's copy and sends Host 3 from
  // the phone's outbox (it used to be lost).
  const device = {};
  const c = phone(device);
  server.up = false;
  vm.runInContext(`posAssignments['${K}Host 3'] = 'Rowan'`, c);
  await vm.runInContext('saveState()', c);
  const inOutbox = !!device.cfaBudaOutbox;
  server.up = true;
  const c2 = phone(device);   // the reload: a fresh page on the same phone
  const replayed = vm.runInContext('outboxReplay()', c2);
  await vm.runInContext('saveState()', c2);
  const viaOutbox = server.data.setups.posAssignments[K + 'Host 3'] || null;
  const outboxCleared = !device.cfaBudaOutbox;
  // Hours later, a filled spot isn't replayed (it could undo newer set ups);
  // an added list item (a waste entry) still is.
  const old = {cfaBudaOutbox: JSON.stringify({at: Date.now() - 3 * 3600 * 1000, patches: {setups: [
    {o: 'set', p: ['posAssignments', K + 'Host 4'], v: 'Stale'},
    {o: 'arr', p: ['posAssignments', 'list'], add: [{v: 'kept', n: 1, i: 0, end: true}], rm: [{v: 'gone', n: 0}]}]}})};
  const staleOps = vm.runInContext('outboxRead()', phone(old));
  process.stdout.write(JSON.stringify({stuck, sent, refresh: r, seen, viaSync, aSees, r3, viaRefresh, inOutbox, replayed, viaOutbox, outboxCleared, staleOps}));
})().catch(e => { console.error(e); process.exit(1); });
"""


@unittest.skipUnless(NODE, 'Node.js not installed')
class SaveRetryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        done = subprocess.run([NODE, '-e', RUNNER, os.path.join(ROOT, 'static', 'js')], capture_output=True, text=True, check=True)
        cls.d = json.loads(done.stdout)

    def test_failed_save_is_retried_on_its_own(self):
        self.assertEqual(self.d['stuck'], {'server': None, 'unsent': True, 'retries': 1})
        self.assertEqual(self.d['sent'], {'server': 'Ethan', 'unsent': False})

    def test_other_phone_refresh_sees_it(self):
        self.assertEqual(self.d['refresh'], {'ok': True, 'changed': True})
        self.assertEqual(self.d['seen'], 'Ethan')

    def test_background_check_sends_unsent_first(self):
        self.assertEqual(self.d['viaSync'], 'Kaiya')
        self.assertEqual(self.d['aSees'], 'Kaiya')

    def test_refresh_sends_unsent_first(self):
        self.assertTrue(self.d['r3']['ok'])
        self.assertEqual(self.d['viaRefresh'], 'Makenzi')


if __name__ == '__main__':
    unittest.main()

    def test_a_reload_never_drops_an_unsent_change(self):
        # Shift simulator, Oct 25 2026: a change made while the server was
        # down was lost if the page reloaded before it went out.
        self.assertEqual([self.d['inOutbox'], self.d['replayed'], self.d['viaOutbox'], self.d['outboxCleared']], [True, True, 'Rowan', True])

    def test_an_old_outbox_keeps_only_additions(self):
        self.assertEqual(self.d['staleOps'], {'setups': [{'o': 'arr', 'p': ['posAssignments', 'list'], 'add': [{'v': 'kept', 'n': 1, 'i': 0, 'end': True}]}]})
