// Where does someone who left still show up? (Tim, Oct 30 2026.) Seeds a
// made-up person ("Quill Vantest") into the PIN list, the rosters, Set Ups,
// Levelset ratings, points, the leader roster, the trainee lists, notes and
// celebrations on a local copy, crawls every page, sub-tab and picker as a
// director, logs their departure (last day yesterday) and crawls again, as
// a director, on a signed-out phone and on a Team Lead's phone. Prints where
// the name was found, before and after. After, only Our Team's "Rotated
// off" list should have it.
//
//   node tools/depart_audit.js
//
// Needs the shift simulator's server (tools/shift_sim/sim_server.py) and
// Playwright, like the simulator.
const {chromium, devices} = require('playwright'); const {spawn} = require('child_process'); const fs = require('fs');
const PORT = 7322, BASE = `http://127.0.0.1:${PORT}`, STORE = require('os').tmpdir() + '/depart-store.json', NAME = 'Quill Vantest';
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.writeFileSync(STORE, '{}');
const srv = spawn('python3', ['/home/user/BudaOpsHub/tools/shift_sim/sim_server.py'], {env: {...process.env, SIM_STORE: STORE, PORT: String(PORT)}, stdio: ['ignore', 'ignore', 'pipe']});
let srvErr = ''; srv.stderr.on('data', d => { if(/Traceback/.test(String(d))) srvErr += d; });
const login = (p, pin) => p.evaluate(async pin => { await fetch('/api/manager/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({pin})}); }, pin);
async function open(b, pin, vp){
  const ctx = await b.newContext(vp ? {viewport: vp, timezoneId: 'America/Chicago'} : {...devices['iPhone 13'], timezoneId: 'America/Chicago'});
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.goto(BASE + '/'); await p.waitForFunction(() => typeof stateVersions !== 'undefined' && stateVersions && stateVersions.setups, null, {timeout: 60000});
  if(pin){ await login(p, pin); await p.reload(); await p.waitForFunction(() => typeof stateVersions !== 'undefined' && stateVersions && stateVersions.setups, null, {timeout: 60000}); }
  await sleep(1500); await p.evaluate(() => { if(typeof siClose === 'function') siClose(); }); return p;
}
const FOUND = `(() => {
  const out = new Set();
  const place = el => { const v = el.closest('.view, .overlay, .sheet, .tm-layer, .si-sheet, .rn-evs, #toast, .toast'); const id = v ? (v.id || v.className.split(' ')[0]) : 'body'; const near = el.closest('[id]'); return id + (near && near !== v ? ' #' + near.id : ''); };
  const vis = el => !!(el.offsetParent || el.getClientRects().length);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while((n = walker.nextNode())){ if(/quill vantest/i.test(n.nodeValue) && n.parentElement && vis(n.parentElement) && n.parentElement.tagName !== 'OPTION') out.add('text: ' + place(n.parentElement) + ' <' + n.parentElement.tagName.toLowerCase() + '.' + (n.parentElement.className || '').split(' ')[0] + '>'); }
  document.querySelectorAll('option').forEach(o => { if(/quill vantest/i.test(o.textContent)){ const sel = o.closest('select'); out.add('option: ' + place(o) + ' select#' + (sel && (sel.id || sel.name || sel.className.split(' ')[0])) + (sel && vis(sel) ? ' (visible)' : ' (hidden)')); } });
  document.querySelectorAll('[data-tm-done], [data-tm-handoff], [data-ts-pick], [data-ts-person]').forEach(el => { if(/quill vantest/i.test(el.textContent) && vis(el)) out.add('chip: ' + place(el)); });
  return [...out];
})()`;
async function crawl(p, views, label){
  const hits = new Set();
  const check = async where => { for(const d of await p.evaluate(FOUND)) hits.add(`${d}  @ ${where}`); };
  for(const v of views){
    try{
      await p.evaluate(v => { if(typeof siClose === 'function') siClose(); document.querySelectorAll('.overlay.active').forEach(o => o.classList.remove('active')); (typeof launchIsOn === 'function' && !launchIsOn() ? activateView : launchShowTab)(v); }, v);
      await sleep(900); await check(v);
      const subs = await p.evaluate(() => { const view = document.querySelector('.view.active'); const out = [], seen = new Set();
        [...view.querySelectorAll('button')].forEach(b => { for(const k of Object.keys(b.dataset)){ if(/(view|tab|page|chip|range|side|week|day|mode|sec|section|pick|show)$/i.test(k) && b.dataset[k]){ const id = k + '=' + b.dataset[k]; if(!seen.has(id)){ seen.add(id); out.push(id); } } } });
        return out.slice(0, 40); });
      for(const s of subs){
        const [k, val] = s.split('=');
        try{ await p.evaluate(([k, val]) => { const view = document.querySelector('.view.active'); const b = [...view.querySelectorAll('button')].find(b => b.dataset[k] === val); if(b) b.click(); }, [k, val]); await sleep(400); await check(`${v} > ${s}`); }catch(e){}
      }
    }catch(e){ hits.add(`${v}: ERROR ${e.message.slice(0, 60)}`); }
  }
  return [...hits];
}
async function pickers(p){
  const hits = [];
  const check = async where => { for(const d of await p.evaluate(FOUND)) hits.push(`${d}  @ ${where}`); };
  // Set Ups: a spot's picker, and "+ Add Team Member".
  await p.evaluate(() => { launchShowTab('positions'); }); await sleep(800);
  await p.evaluate(() => { const t = document.querySelector('#positionsView [data-su-tile]'); if(t) t.click(); }); await sleep(500);
  const opts = await p.evaluate(() => (document.getElementById('posModalOptions') || {}).innerText || '');
  if(/quill vantest/i.test(opts)) hits.push('Set Ups > position picker');
  await p.evaluate(() => { const c = document.getElementById('btnCancelPos'); if(c) c.click(); document.getElementById('posModal').classList.remove('active'); }); await sleep(200);
  await p.evaluate(() => { const b = [...document.querySelectorAll('#positionsView button')].find(x => /add team member/i.test(x.innerText)); if(b) b.click(); }); await sleep(600);
  await check('Set Ups > Add Team Member list'); await p.keyboard.press('Escape'); await sleep(200);
  // Tasks: who can be handed a ticket.
  const ppl = await p.evaluate(async () => { try{ const r = await fetch('/api/pass/people'); const j = await r.json(); return JSON.stringify(j); }catch(e){ return ''; } });
  if(/quill vantest/i.test(ppl)) hits.push('Tasks > hand-to people');
  // Timers: press and hold a tile → the sheet (who did it / hand off).
  await p.evaluate(() => launchShowTab('timers')); await sleep(2500);
  const tile = await p.$('#tmGrid [data-tm-timer]');
  if(tile){ const b = await tile.boundingBox(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await sleep(800); await p.mouse.up(); await sleep(400); await check('Timers > hold sheet'); await p.keyboard.press('Escape'); }
  // Schedule: find box.
  await p.evaluate(() => { launchShowTab('schedule'); tsSearch = 'qu'; renderTeamSchedule(); }); await sleep(500); await check('Schedule > find "qu"');
  await p.evaluate(() => { tsSearch = ''; });
  return hits;
}
(async () => {
  for(let i = 0; i < 100; i++){ try{ if((await fetch(BASE + '/__store/x')).ok) break; }catch(e){} await sleep(200); }
  const b = await chromium.launch(); const out = {};
  const d = await open(b, '1234', {width: 1280, height: 900});
  // Seed.
  await d.evaluate(async NAME => {
    await fetch('/api/team/pin', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: NAME, pin: '777111', role: 'member'})});
    await fetch('/api/team/pin', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: 'Lead Example', pin: '777222', role: 'lead'})});
    const next = rnDay().next;
    fohRoster[today] = [...(fohRoster[today] || []), {name: NAME, start: '9:00a', end: '3:00p'}, {name: 'Lead Example', start: '6:00a', end: '2:00p', leader: true}];
    fohRoster[next] = [...(fohRoster[next] || []), {name: NAME, start: '9:00a', end: '3:00p'}];
    suDaypartsFor('foh').forEach(dp => { posAssignments[`foh||${today}||${dp.name}||Host 1`] = NAME; });
    posAssignments[`foh||${next}||Lunch (10:30-1:00)||Host 1`] = NAME;
    peaRatings = {names: [NAME, 'Lead Example'], positions: ['Host'], roles: ['Team Member', 'Team Lead'], rows: [[today, 0, 0, 1, 0, 3, 3, 3, 3, 3, 3]], uploads: [], coverage: {FOH: [], BOH: []}, labels: {}};
    if(typeof ptKeyFor === 'function') pointsTeam[ptKeyFor(NAME)] = {lang: 'en'};
    leaderRoster = [{name: NAME, roles: []}, {name: 'Lead Example', roles: []}];
    trainerTrainees = [{id: 't9', name: NAME, coach: 'Lead Example', startDate: today}];
    teamLeadTrainees = [{id: 'l9', name: NAME, coach: 'Lead Example', startDate: today}];
    txData.celebrations = [...(txData.celebrations || []), {id: 'c9', name: NAME, date: today.slice(5), type: 'birthday'}];
    teamNotes[NAME.toLowerCase()] = [{text: 'Great host', by: 'Lead Example', ts: Date.now(), date: today, type: 'note', tags: []}];
    leaderNotes[NAME] = [{text: 'Steady', by: 'Lead Example', ts: Date.now(), date: today, type: 'note'}];
    await saveState(); await new Promise(r => setTimeout(r, 3000));
  }, NAME);
  await d.reload(); await d.waitForFunction(() => typeof stateVersions !== 'undefined' && stateVersions && stateVersions.setups); await sleep(2000); await d.evaluate(() => { if(typeof siClose === 'function') siClose(); });
  const VIEWS = ['home', 'positions', 'schedule', 'wastelog', 'zonereset', 'timers', 'foodsafety', 'safecount', 'prepboard', 'knownumbers', 'forecast', 'cem', 'calendar', 'tasks', 'forms', 'headcount', 'directors', 'roles', 'manage', 'scoreboard', 'tx', 'gx', 'lx'];
  out.beforeDirector = (await crawl(d, VIEWS, 'before')).concat(await pickers(d));
  // Depart: last day yesterday.
  const yday = await d.evaluate(() => rnAddDays(today, -1));
  out.departure = await d.evaluate(async ([NAME, yday]) => { const r = await fetch('/api/team/departures', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: NAME, lastDay: yday, type: 'quit', reason: '', rehire: 'unsure'})}); const j = await r.json(); return [r.status, (j.departed || []).map(x => x.name), j.error || '']; }, [NAME, yday]);
  await sleep(500);
  await d.reload(); await d.waitForFunction(() => typeof stateVersions !== 'undefined' && stateVersions && stateVersions.setups); await sleep(5000); await d.evaluate(() => { if(typeof siClose === 'function') siClose(); });
  out.leftList = await d.evaluate(() => JSON.stringify(teamLeftList));
  out.afterDirector = (await crawl(d, VIEWS, 'after')).concat(await pickers(d));
  out.directorErrs = d.errs;
  // A signed-out phone, and a Team Lead's phone.
  const t = await open(b, null);
  out.afterSignedOut = await crawl(t, ['home', 'positions', 'schedule', 'wastelog', 'zonereset', 'timers', 'foodsafety', 'calendar', 'tasks', 'forms', 'manage']);
  await t.evaluate(() => { launchShowTab('schedule'); tsSearch = 'qu'; renderTeamSchedule(); }); await sleep(400);
  for(const d2 of await t.evaluate(FOUND)) out.afterSignedOut.push(`${d2}  @ Schedule > find "qu"`);
  const l = await open(b, '777222');
  out.afterLead = (await crawl(l, ['home', 'positions', 'schedule', 'wastelog', 'zonereset', 'timers', 'foodsafety', 'safecount', 'calendar', 'tasks', 'forms', 'roles', 'manage'])).concat(await pickers(l));
  out.srvErr = srvErr;
  const group = list => { const m = {}; (list || []).forEach(h => { const [d, w] = h.split('  @ '); (m[d] = m[d] || []).push(w); }); return Object.fromEntries(Object.entries(m).map(([d, ws]) => [d, ws.length > 3 ? ws.slice(0, 3).concat([`+${ws.length - 3} more`]) : ws])); };
  for(const k of ['beforeDirector', 'afterDirector', 'afterSignedOut', 'afterLead']) out[k] = group(out[k]);
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill();
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
