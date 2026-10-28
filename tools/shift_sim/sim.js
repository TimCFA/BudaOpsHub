// Shift simulator: several phones fill today's Set Ups and run breaks at once
// against a local server, while the scenario adds chaos. Passes only if the
// server ends up with every intended change and every phone agrees with it.
//   node sim.js <scenario> [phones] [seed]
// Scenarios:
//   calm        no chaos
//   flaky       30% of database writes fail, 30% of save replies are lost
//   slow        every database write takes 4 s
//   offline     two phones lose signal for 8 s
//   restart     the server restarts (down 6 s)
//   overlap     a deploy: the new server reads the data while the old one still saves
//   reload      a phone reloads with an unsent change (signal back just before)
//   reloaddown  a phone reloads while the server is down
//   loaddown    a phone loads while the save server can't be reached
//   all         flaky + slow + offline + overlap + reload + restart at once
const {chromium} = require('playwright');
const {spawn} = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const PORT = 5400 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
// Phones talk to a proxy on PORT; it forwards to whichever server is live
// (a deploy hands traffic from the old one to the new one).
const http = require('http');
let backend = PORT + 1000, nextBackend = PORT + 2000;
const proxy = http.createServer((req, res) => {
  const up = http.request({host: '127.0.0.1', port: backend, path: req.url, method: req.method, headers: req.headers}, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on('error', () => { if(!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(up);
});
const STORE = path.join(require('os').tmpdir(), `shift-sim-${PORT}.json`);
const scenario = process.argv[2] || 'calm';
const PHONES = +(process.argv[3] || 5);
let seed = +(process.argv[4] || 7);
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rand() * a.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const FIRST = ['Avery', 'Blake', 'Casey', 'Devon', 'Emery', 'Finley', 'Gray', 'Harper', 'Indy', 'Jules', 'Kai', 'Logan', 'Morgan', 'Noel', 'Oakley', 'Parker', 'Quinn', 'Reese', 'Sage', 'Tatum'];
const NAMES = FIRST.map((f, i) => `${f} Sim${String.fromCharCode(65 + i)}`);
const today = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Chicago'});

function seedStore(){
  const roster = NAMES.map((name, i) => ({name, start: i % 2 ? '6:00a' : '10:00a', end: i % 2 ? '2:00p' : '6:00p'}));
  const store = {'state/rosters': JSON.stringify({fohRoster: {[today]: roster}, bohRoster: {}, rosterPosted: {}, truckShifts: {}, adminShifts: {}}),
    'state/setups': JSON.stringify({posAssignments: {}, breakCountdowns: {}, completedBreaks: {}, lastUpdated: {}, posVacancyFlags: {}, setupDayTypes: {}, zoneOwners: {}, posNotes: {}})};
  fs.writeFileSync(STORE, JSON.stringify(store));
}

let server = null;
function launch(port){
  const p = spawn('python3', [path.join(DIR, 'sim_server.py')], {env: {...process.env, SIM_STORE: STORE, PORT: String(port)}, stdio: ['ignore', 'ignore', 'pipe']});
  p.stderr.on('data', d => { const s = String(d); if(/Traceback/.test(s) && !/chaos/.test(s)) process.stderr.write('[server ' + port + '] ' + s); });
  return p;
}
function startServer(){ server = launch(backend); }
async function waitPort(port){ for(let i = 0; i < 100; i++){ try{ const r = await fetch(`http://127.0.0.1:${port}/__store/x`); if(r.ok) return; }catch(e){} await sleep(200); } throw new Error('server never came up'); }
const waitServer = () => waitPort(backend);
async function stopServer(){ if(!server) return; const s = server; server = null; s.kill('SIGKILL'); await new Promise(r => s.on('exit', r)); }
const chaosSet = c => fetch(BASE + '/__chaos', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(c)}).catch(() => {});
const serverSetups = async () => JSON.parse(JSON.parse(await (await fetch(BASE + '/__store/state/setups')).text()));

// Each phone is a Team Lead's, signed in with their own clock-in PIN: Set Ups
// is leads' and up to change (app.py LEAD_ONLY_KEYS). `pin` null: nobody
// signed in on it.
const leadPin = i => String(700000 + i);
async function openPhone(browser, i, pin = leadPin(i)){
  const ctx = await browser.newContext({viewport: {width: 390, height: 844}, timezoneId: 'America/Chicago'});
  if(pin) await ctx.request.post(BASE + '/api/manager/login', {data: {pin}});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/', {waitUntil: 'load'});
  await page.waitForFunction(() => typeof saveState === 'function' && typeof commitPosAssignment === 'function' && stateVersions && stateVersions.setups, null, {timeout: 30000});
  return {i, ctx, page, errors};
}

// The phone does what a leader's tap does: the picker's own commit, or the break buttons.
const assign = (p, key, name) => p.page.evaluate(([key, name]) => { currentPosSection = 'foh'; currentPosKey = key; suPickWasOpen = false; suPickMoveFrom = null; commitPosAssignment(name, 'keep'); }, [key, name]);
const breakStart = (p, name) => p.page.evaluate(name => { currentPosSection = 'foh'; return toggleBreak(name); }, name);
const breakDone = (p, name) => p.page.evaluate(name => { currentPosSection = 'foh'; return completeBreakNow(name); }, name);

async function settle(phones, limitMs = 120000){
  const until = Date.now() + limitMs;
  while(Date.now() < until){
    const busy = await Promise.all(phones.map(p => p.page.evaluate(() => !!saveInFlight || stateHasUnsent()).catch(() => true)));
    if(!busy.some(Boolean)) return true;
    // A phone with something unsent and no retry pending would wait forever: nudge nothing, just report.
    await sleep(1000);
  }
  return false;
}

async function main(){
  await new Promise(r => proxy.listen(PORT, '127.0.0.1', r));
  seedStore(); startServer(); await waitServer();
  const browser = await chromium.launch();
  // A manager opens the hub once first, as on a real store: every section saved with its defaults.
  { const m = await openPhone(browser, 'mgr', null);
    await m.page.evaluate(async n => {
      await fetch('/api/manager/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({pin: '1234'})});
      // The leaders' clock-in PINs.
      for(let i = 0; i < n; i++) await fetch('/api/team/pin', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: `Sim Lead ${i}`, pin: String(700000 + i), role: 'lead'})});
      await saveState();
    }, PHONES);
    await settle([m], 20000); await m.ctx.close(); }
  // (opened without a sign-in: the manager signs in on the page above)
  const phones = [];
  for(let i = 0; i < PHONES; i++) phones.push(await openPhone(browser, i));
  const slots = await phones[0].page.evaluate(day => {
    const out = [];
    fohDayparts.forEach(dp => ((fohPositions[dp.name]) || []).forEach(slot => out.push(['foh', day, dp.name, slot].join('||'))));
    return out;
  }, today);
  // Each phone owns its own spots and people (two leaders never fill the same spot at once).
  const expected = {}, expBreakDone = {}, expBreakRunning = {};
  const mine = phones.map(() => []);
  slots.forEach((k, j) => mine[j % PHONES].push(k));
  const people = phones.map((_, i) => NAMES.filter((_, j) => j % PHONES === i));

  const steps = 14;
  const chaosAt = {flaky: 2, slow: 2, offline: 3, restart: 4, reload: 5};
  const log = [];
  const runPhone = async p => {
    for(let s = 0; s < steps; s++){
      const r = rand();
      try{
        if(r < 0.7 && mine[p.i].length){
          const key = pick(mine[p.i]);
          const name = rand() < 0.15 ? null : pick(people[p.i]);
          await assign(p, key, name);
          if(name) expected[key] = name; else delete expected[key];
        } else if(people[p.i].length){
          const name = pick(people[p.i]);
          const key = `foh||${today}||${name}`;
          if(expBreakDone[key]){ /* already done */ }
          else if(expBreakRunning[key]){ await breakDone(p, name); delete expBreakRunning[key]; expBreakDone[key] = true; }
          else { await breakStart(p, name); expBreakRunning[key] = true; }
        }
      }catch(e){ log.push(`phone ${p.i}: ${e.message.split('\n')[0]}`); }
      // Reload with unsent changes: an edit, then the page reloads before the save can land.
      if(scenario === 'reload' || scenario === 'all'){
        if(s === 6 && p.i === 0){
          await p.ctx.setOffline(true);
          const key = mine[0][0];
          const name = people[0].find(n => n !== expected[key]) || people[0][0];
          await assign(p, key, name); expected[key] = name;
          await sleep(300);
          const unsent = await p.page.evaluate(() => stateHasUnsent());
          log.push(`phone 0 set ${key.split('||').slice(2).join(' / ')} = ${name} offline; unsent before reload: ${unsent}`);
          await p.ctx.setOffline(false);
          // A reload that lands while the server is down gets an error page
          // with no hub on it; the person refreshes again, so the phone does too.
          let tries = 0;
          for(;;){
            await p.page.reload({waitUntil: 'load'}).catch(() => {});
            const up = await p.page.waitForFunction(() => typeof saveState === 'function' && stateVersions && stateVersions.setups, null, {timeout: 15000}).then(() => true, () => false);
            if(up) break;
            if(++tries >= 4) throw new Error('phone 0 never loaded the hub after reloading');
            log.push('phone 0 reloaded while the server was down; reloading again');
          }
          log.push('phone 0 reloaded with an unsent change');
        }
      }
      if(scenario === 'loaddown' && s === 6 && p.i === 0){
        await p.page.route('**/api/state/**', r => r.abort());
        const key = mine[0][1];
        const name = people[0].find(n => n !== expected[key]) || people[0][0];
        await assign(p, key, name); expected[key] = name;
        await p.page.reload({waitUntil: 'load'});
        await p.page.waitForFunction(() => typeof saveState === 'function' && typeof commitPosAssignment === 'function', null, {timeout: 30000});
        await sleep(1500);
        const key2 = mine[0][2];
        const name2 = people[0].find(n => n !== expected[key2]) || people[0][0];
        await assign(p, key2, name2); expected[key2] = name2;
        log.push(`API down at load; phone 0 set ${name} and ${name2} around a reload; carry held: ${await p.page.evaluate(() => !!outboxCarry)}`);
        await sleep(3000);
        await p.page.unroute('**/api/state/**');
      }
      if(scenario === 'reloaddown' && s === 6 && p.i === 0){
        await stopServer();
        const key = mine[0][1];
        const name = people[0].find(n => n !== expected[key]) || people[0][0];
        await assign(p, key, name); expected[key] = name;
        log.push(`server down; phone 0 set ${key.split('||').slice(2).join(' / ')} = ${name}, unsent: ${await p.page.evaluate(() => stateHasUnsent())}`);
        await p.page.reload({waitUntil: 'load', timeout: 5000}).catch(e => log.push('reload while down: ' + e.message.split('\n')[0]));
        startServer(); await waitServer();
        await p.page.goto(BASE + '/', {waitUntil: 'load'});
        await p.page.waitForFunction(() => typeof saveState === 'function' && stateVersions && stateVersions.setups, null, {timeout: 30000});
        log.push('phone 0 back after the reload: ' + await p.page.evaluate(k => posAssignments[k] || '(empty)', key));
      }
      await sleep(200 + rand() * 800);
    }
  };
  const chaosRun = (async () => {
    if(scenario === 'flaky' || scenario === 'all'){ await sleep(1500); await chaosSet({fail: 0.3, drop: 0.3}); log.push('database fails 30% and replies are lost 30%'); }
    if(scenario === 'slow' || scenario === 'all'){ await sleep(1500); await chaosSet({delay: 4}); log.push('database writes take 4 s'); }
    if(scenario === 'offline' || scenario === 'all'){
      await sleep(2000);
      for(const p of phones.slice(1, 3)) await p.ctx.setOffline(true);
      log.push('phones 1 and 2 lose signal for 8 s');
      await sleep(8000);
      for(const p of phones.slice(1, 3)) await p.ctx.setOffline(false);
    }
    if(scenario === 'overlap' || scenario === 'all'){
      // A deploy: the new server starts and reads the data while the old one
      // still takes saves; then traffic moves to the new one and the old one stops.
      await sleep(2500);
      const fresh = launch(nextBackend); await waitPort(nextBackend);
      await fetch(`http://127.0.0.1:${nextBackend}/api/state/sync`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{"versions":{}}'});
      log.push('new server up and has read the data; old one still taking saves for 4 s');
      await sleep(4000);
      const old = server; [backend, nextBackend] = [nextBackend, backend]; server = fresh;
      log.push('traffic moved to the new server');
      await sleep(1500);
      old.kill('SIGKILL');
    }
    if(scenario === 'restart' || scenario === 'all'){
      await sleep(3000);
      await stopServer(); log.push('server restarts (down 6 s)');
      await sleep(6000);
      startServer(); await waitServer();
      if(scenario === 'all') await chaosSet({fail: 0.3, drop: 0.3});
    }
  })();
  await Promise.all(phones.map(runPhone).concat([chaosRun]));
  await chaosSet({delay: 0, fail: 0, drop: 0});
  const settled = await settle(phones, +(process.env.SETTLE_MS || 120000));
  if(!settled){
    const why = await Promise.all(phones.map(p => p.page.evaluate(() => {
      const cur = stateSections(stateSnapshot());
      return {inFlight: !!saveInFlight, retry: !!saveRetryTimer, unsent: Object.keys(cur).filter(n => n in stateBase && cur[n] !== savedSections[n]).map(n => n + ':' + JSON.stringify(stateDiff(stateBase[n], JSON.parse(cur[n]))).slice(0, 300))};
    }).catch(e => 'err ' + e.message)));
    console.log('NOT SETTLED', JSON.stringify(why, null, 1));
  }
  // One more sync each so every phone hears the others.
  await Promise.all(phones.map(p => p.page.evaluate(() => syncState()).catch(() => {})));
  await sleep(500);

  const s = await serverSetups();
  const testKeys = new Set(slots);
  const got = {};
  Object.entries(s.posAssignments || {}).forEach(([k, v]) => { if(testKeys.has(k)) got[k] = v; });
  const problems = [];
  const allKeys = new Set([...Object.keys(expected), ...Object.keys(got)]);
  allKeys.forEach(k => { if(expected[k] !== got[k]) problems.push(`spot ${k.split('||').slice(2).join(' / ')}: expected ${expected[k] || '(empty)'}, server has ${got[k] || '(empty)'}`); });
  Object.keys(expBreakDone).forEach(k => { if(!(s.completedBreaks || {})[k]) problems.push(`break done missing: ${k.split('||')[2]}`); });
  Object.keys(expBreakRunning).forEach(k => { if(!(s.breakCountdowns || {})[k]) problems.push(`break running missing: ${k.split('||')[2]}`); });
  const views = await Promise.all(phones.map(p => p.page.evaluate(() => JSON.stringify(posAssignments)).catch(() => 'gone')));
  views.forEach((v, i) => {
    if(v === 'gone'){ problems.push(`phone ${i} page gone`); return; }
    const pa = JSON.parse(v);
    const diff = [...testKeys].filter(k => (pa[k] || '') !== (got[k] || ''));
    if(diff.length) problems.push(`phone ${i} disagrees with the server on ${diff.length} spot(s)`);
  });
  phones.forEach(p => p.errors.forEach(e => problems.push(`phone ${p.i} page error: ${e}`)));
  // A phone nobody signed in on can look but not move anyone, and it settles.
  { const anon = await openPhone(browser, 'anon', null);
    const key = slots[0], before = got[key] || '';
    await assign(anon, key, before === NAMES[0] ? NAMES[1] : NAMES[0]);
    const anonSettled = await settle([anon], 20000);
    const after = ((await serverSetups()).posAssignments || {})[key] || '';
    const shown = await anon.page.evaluate(k => posAssignments[k] || '', key);
    if(after !== before) problems.push(`a phone nobody signed in on changed ${key.split('||').slice(2).join(' / ')}`);
    if(!anonSettled || shown !== before) problems.push(`the signed-out phone didn't settle back (shows ${shown || '(empty)'})`);
    log.push(`a signed-out phone tried a spot: server kept ${before || '(empty)'}, the phone shows ${shown || '(empty)'}`);
    await anon.ctx.close(); }
  const report = {scenario, phones: PHONES, spotsSet: Object.keys(expected).length, breaksDone: Object.keys(expBreakDone).length, breaksRunning: Object.keys(expBreakRunning).length, settled, events: log, problems};
  console.log(JSON.stringify(report, null, 1));
  console.log(problems.length || !settled ? 'FAIL' : 'PASS');
  await browser.close(); await stopServer(); proxy.close();
  try{ fs.unlinkSync(STORE); }catch(e){}
  process.exit(problems.length || !settled ? 1 : 0);
}
main().catch(async e => { console.error(e); await stopServer(); process.exit(2); });
