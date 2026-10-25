// Set Ups speed budget on a throttled phone (4x slower CPU, 150 ms round
// trips, 1.6 Mbps down): a repeat load to Set Ups on screen, a tap answered,
// a save confirmed. Data sized like the live store (two weeks of filled Set
// Ups, 40 people on the roster). Made-up names only.
//   node speed.js [runs]
const {chromium} = require('playwright');
const {spawn} = require('child_process');
const fs = require('fs'), path = require('path');
const DIR = __dirname, PORT = 6100 + Math.floor(Math.random() * 300), BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(require('os').tmpdir(), `shift-speed-${PORT}.json`);
const RUNS = +(process.argv[2] || 5);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const iso = d => d.toLocaleDateString('en-CA', {timeZone: 'America/Chicago'});

function seed(slots){
  const names = Array.from({length: 40}, (_, i) => `Person${i} Sample${String.fromCharCode(65 + (i % 26))}`);
  const days = Array.from({length: 14}, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 7 + i); return iso(d); });
  const roster = {}, pa = {}, brk = {}, done = {};
  days.forEach(day => {
    roster[day] = names.map((name, i) => ({name, start: i % 2 ? '6:00a' : '10:00a', end: i % 2 ? '2:00p' : '6:00p', leader: i < 4}));
    slots.forEach((s, j) => { pa[['foh', day, s[0], s[1]].join('||')] = names[j % 40]; });
    names.slice(0, 20).forEach(n => { done[`foh||${day}||${n}`] = true; });
  });
  const store = {'state/rosters': JSON.stringify({fohRoster: roster, bohRoster: roster, rosterPosted: {}, truckShifts: {}, adminShifts: {}}),
    'state/setups': JSON.stringify({posAssignments: pa, breakCountdowns: brk, completedBreaks: done, lastUpdated: {}, posVacancyFlags: {}, setupDayTypes: {}, zoneOwners: {}, posNotes: {}})};
  fs.writeFileSync(STORE, JSON.stringify(store));
  return JSON.stringify(store).length;
}

(async () => {
  fs.writeFileSync(STORE, '{}');
  let server = spawn('python3', [path.join(DIR, 'sim_server.py')], {env: {...process.env, SIM_STORE: STORE, PORT: String(PORT)}, stdio: 'ignore'});
  for(let i = 0; i < 100; i++){ try{ if((await fetch(BASE + '/__store/x')).ok) break; }catch(e){} await sleep(200); }
  const browser = await chromium.launch();
  // The slot list, from the page itself.
  let ctx = await browser.newContext(); let page = await ctx.newPage();
  await page.goto(BASE + '/'); await page.waitForFunction(() => typeof fohDayparts !== 'undefined' && typeof fohPositions !== 'undefined');
  const slots = await page.evaluate(() => fohDayparts.flatMap(dp => (fohPositions[dp.name] || []).map(s => [dp.name, s])));
  await ctx.close();
  server.kill('SIGKILL'); await sleep(500);
  const bytes = seed(slots);
  server = spawn('python3', [path.join(DIR, 'sim_server.py')], {env: {...process.env, SIM_STORE: STORE, PORT: String(PORT)}, stdio: 'ignore'});
  for(let i = 0; i < 100; i++){ try{ if((await fetch(BASE + '/__store/x')).ok) break; }catch(e){} await sleep(200); }
  // A manager saves defaults once, as on a real store.
  ctx = await browser.newContext(); page = await ctx.newPage();
  await page.goto(BASE + '/'); await page.waitForFunction(() => typeof saveState === 'function' && stateVersions && stateVersions.setups);
  await page.evaluate(async () => { await fetch('/api/manager/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({pin: '1234'})}); await saveState(); });
  await ctx.close();

  ctx = await browser.newContext({viewport: {width: 390, height: 844}, timezoneId: 'America/Chicago'});
  page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8});
  await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});
  // First visit fills the cache (not measured).
  await page.goto(BASE + '/', {waitUntil: 'load'});
  await page.waitForFunction(() => typeof saveState === 'function' && stateVersions && stateVersions.setups, null, {timeout: 60000});
  if(process.env.PROFILE){
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', {interval: 200}); await cdp.send('Profiler.start');
    await page.goto(BASE + '/', {waitUntil: 'load'});
    await page.waitForFunction(() => typeof saveState === 'function' && stateVersions && stateVersions.setups, null, {timeout: 60000});
    await page.evaluate(async () => { launchShowTab('positions'); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); });
    const {profile} = await cdp.send('Profiler.stop');
    const self = new Map(), byId = new Map(profile.nodes.map(n => [n.id, n]));
    const dt = profile.timeDeltas; const counts = new Map();
    profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + (dt[i] || 0)));
    counts.forEach((us, id) => { const n = byId.get(id); const cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop().split('?')[0]}:${cf.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + us); });
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, us]) => `${(us / 1000).toFixed(0).padStart(5)} ms  ${k}`);
    console.log(top.join('\n'));
    // Inclusive time for named functions.
    const incl = new Map();
    const parent = new Map(); profile.nodes.forEach(n => (n.children || []).forEach(c => parent.set(c, n.id)));
    counts.forEach((us, id) => { const seen = new Set(); for(let x = id; x; x = parent.get(x)){ const cf = byId.get(x).callFrame; const k = `${cf.functionName} ${cf.url.split('/').pop().split('?')[0]}`; if(cf.functionName && !seen.has(k)){ seen.add(k); incl.set(k, (incl.get(k) || 0) + us); } } });
    console.log('--- inclusive'); console.log([...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, us]) => `${(us / 1000).toFixed(0).padStart(5)} ms  ${k}`).join('\n'));
    process.exit(0);
  }
  const rows = [];
  for(let r = 0; r < RUNS; r++){
    const t0 = Date.now();
    await page.goto(BASE + '/', {waitUntil: 'load'});
    const tLoad = Date.now() - t0;
    await page.waitForFunction(() => typeof saveState === 'function' && stateVersions && stateVersions.setups, null, {timeout: 60000});
    const tData = Date.now() - t0;
    const tab = await page.evaluate(async () => { const a = performance.now(); launchShowTab('positions'); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); return performance.now() - a; });
    const tReady = Date.now() - t0;
    const tap = await page.evaluate(async () => {
      const key = Object.keys(posAssignments).find(k => k.split('||')[1] === today) || ['foh', today, fohDayparts[1].name, fohPositions[fohDayparts[1].name][0]].join('||');
      currentPosSection = 'foh'; currentPosKey = key; suPickWasOpen = false; suPickMoveFrom = null;
      const a = performance.now();
      commitPosAssignment('Person' + Math.floor(Math.random() * 40) + ' SampleZ', 'keep');
      const tapMs = performance.now() - a;
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
      const paintMs = performance.now() - a;
      const p = saveInFlight; if(p) await p;
      return {tapMs, paintMs, saveMs: performance.now() - a};
    });
    const timing = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const l = performance.getEntriesByType('resource').filter(e => e.name.includes('/api/state/load')).pop(); return {html: Math.round(n.responseEnd), dcl: Math.round(n.domContentLoadedEventEnd), loadReqStart: l ? Math.round(l.startTime) : null, loadReqEnd: l ? Math.round(l.responseEnd) : null}; });
    const bytesIn = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => e.transferSize > 0).length);
    rows.push({loadMs: tLoad, dataMs: tData, setupsOnScreenMs: tReady, tabMs: Math.round(tab), tapMs: Math.round(tap.tapMs), paintMs: Math.round(tap.paintMs), saveConfirmedMs: Math.round(tap.saveMs), filesFetched: bytesIn, ...timing});
  }
  const med = k => rows.map(r => r[k]).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  console.log(JSON.stringify({storeBytes: bytes, runs: rows, median: Object.fromEntries(Object.keys(rows[0]).map(k => [k, med(k)]))}, null, 1));
  await browser.close(); server.kill('SIGKILL'); try{ fs.unlinkSync(STORE); }catch(e){}
})().catch(e => { console.error(e); process.exit(1); });
