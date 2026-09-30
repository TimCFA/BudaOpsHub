// Smoke test for the fresh-look prototype (SPEC "Tests and checks").
//
//   node tests/smoke.mjs                                  (uses the global playwright, or the npx cache)
//   npx --yes -p playwright@1.56.1 node tests/smoke.mjs   (installs playwright 1.56.1 into the npx cache first)
//
// Serves ../ on http://localhost:4173 when nothing answers there (python3 -m http.server), opens
// Chromium headless at 390×844 @2x, and:
//   - opens every route (#/setups #/me #/waste #/tasks #/scores #/more) and the Set Ups sheets;
//   - fails on any console error or unhandled rejection (Google Fonts is stubbed: no internet here);
//   - asserts document.documentElement.scrollWidth <= 390 everywhere;
//   - asserts every visible nav a, .btn, .prow, .person, .sizes button, .chip.tall, .textbtn, .fold-head, .fold-link, header a (not the 36 px chips,
//     whose ::before gives them a 44 px hit area) is >= 44 px tall;
//   - asserts the header, bottom nav, snackbar and Fill bar are sticky in a real 390×844 viewport (not full-page);
//   - asserts the Set Ups board fits above the fold (Dorian, 10:52, Lunch): first .prow top <= 470 px, >= 4 rows above the nav,
//     the three strips folded to one 44–48 px line each (expand in place on tap), the Fill bar docked above the nav
//     (hidden with the snackbar, with the Fill preview, and for team members);
//   - asserts no rendered text is under 12 px;
//   - walks the flows: pick Rafael on Drinks 1 (pending → Saved), Fill → Confirm → UNDO → Fill again, Person sheet + Escape,
//     Waste tap → snackbar → Undo, Tasks toggle, More → Español, More → Rafael → Mi puesto / Scores (no PEA standing);
//   - saves VIEWPORT screenshots (390×844 at 2×: what a phone shows, with the sticky header, Fill bar and nav) to
//     tests/shots/<name>.png (git-ignored), plus setups-scrolled.png (scrolled 500 px: the header sticks, the Fill bar stays).
// Exit code 1 when any check fails. Output: one line per check, then "N passed, M failed".

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SHOTS = path.join(HERE, 'shots');
const PORT = Number(process.env.SMOKE_PORT || 4173);
const BASE = process.env.SMOKE_URL || `http://localhost:${PORT}`;
const W = 390;
const H = 844;

// ---------- playwright: the package next to this file, the global install, or the npx cache ----------
async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { /* not resolvable from here */ }
  const cands = [];
  for (const p of (process.env.PATH || '').split(':')) if (/node_modules\/\.bin\/?$/.test(p)) cands.push(path.join(p, '..', 'playwright'));
  try { cands.push(path.join(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), 'playwright')); } catch (e) { /* no npm */ }
  const npx = path.join(os.homedir(), '.npm', '_npx');
  try { for (const d of fs.readdirSync(npx)) cands.push(path.join(npx, d, 'node_modules', 'playwright')); } catch (e) { /* no cache */ }
  for (const c of cands) {
    const entry = path.join(c, 'index.mjs');
    if (fs.existsSync(entry)) return import(pathToFileURL(entry).href);
  }
  throw new Error('playwright not found. Run: npx --yes -p playwright@1.56.1 node tests/smoke.mjs');
}

// ---------- a static server when nothing answers on the port ----------
async function reachable(url) {
  try { const r = await fetch(`${url}/index.html`, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch (e) { return false; }
}
async function ensureServer() {
  if (await reachable(BASE)) return null;
  const child = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 150));
    if (await reachable(BASE)) return child;
  }
  child.kill();
  throw new Error(`could not start a server on ${BASE}`);
}

// ---------- tiny harness ----------
let passed = 0;
let failed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { passed += 1; console.log(`  ok   ${name}`); }
  else { failed += 1; failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
  return !!ok;
}
async function step(name, fn) {
  console.log(`\n# ${name}`);
  try { await fn(); } catch (e) { check(`${name} (threw)`, false, String(e && e.message ? e.message : e).split('\n')[0]); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- page helpers ----------
const consoleErrors = [];
function watchPage(page) {
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(`pageerror: ${err && err.message ? err.message : err}`));
  page.on('requestfailed', req => { if (!/fonts\.(googleapis|gstatic)\.com/.test(req.url())) consoleErrors.push(`requestfailed: ${req.url()} ${req.failure() && req.failure().errorText}`); });
}
function drainErrors(label) {
  const errs = consoleErrors.splice(0);
  check(`${label}: no console errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
}

async function goto(page, hash) {
  await page.goto(`${BASE}/${hash}`, { waitUntil: 'load' });
  await page.waitForSelector('nav.nav a', { state: 'visible', timeout: 10000 });
  await page.waitForFunction(() => { const m = document.querySelector('main.screen'); return m && m.children.length > 0; }, null, { timeout: 10000 });
  await sleep(120);
}

async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  // let the sheet's 180 ms slide/fade finish so the PNG is the product, not a mid-animation frame
  if (await page.locator('.sheet').count()) await sleep(250);
  // viewport capture (not full-page): each PNG is exactly 390×844 at 2× and shows what a phone shows
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

// Sticky layout in the real viewport: header pinned at the top, nav and snackbar inside the screen.
async function viewportChecks(page, label) {
  const r = await page.evaluate(async () => {
    const box = sel => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect() : null; };
    const H = window.innerHeight;
    window.scrollTo(0, 0);
    await new Promise(r => requestAnimationFrame(r));
    const top = { hdr: box('.hdr'), nav: box('.nav'), snack: box('.snack'), fill: box('.fillbar'), y: window.scrollY };
    window.scrollTo(0, 600);
    await new Promise(r => requestAnimationFrame(r));
    const down = { hdr: box('.hdr'), nav: box('.nav'), snack: box('.snack'), fill: box('.fillbar'), y: window.scrollY };
    window.scrollTo(0, 0);
    return { H, top, down, scrollH: document.documentElement.scrollHeight };
  });
  check(`${label}: nav inside the viewport at scroll 0 (top ${Math.round(r.top.nav?.top ?? -1)} < ${r.H})`, r.top.nav && r.top.nav.top < r.H && r.top.nav.bottom <= r.H + 1);
  if (r.top.snack) check(`${label}: snackbar inside the viewport at scroll 0 (bottom ${Math.round(r.top.snack.bottom)} <= ${r.H})`, r.top.snack.bottom <= r.H + 1 && r.top.snack.top >= 0);
  if (r.top.fill) check(`${label}: Fill bar docked above the nav at scroll 0 (bottom ${Math.round(r.top.fill.bottom)} = nav top ${Math.round(r.top.nav.top)})`, Math.abs(r.top.fill.bottom - r.top.nav.top) <= 1 && r.top.fill.top >= 0);
  if (r.scrollH > r.H + 100) {
    check(`${label}: header sticks at the top when scrolled (top ${Math.round(r.down.hdr?.top ?? -1)})`, r.down.hdr && Math.abs(r.down.hdr.top) <= 1 && r.down.y > 0, `scrollY ${r.down.y}`);
    check(`${label}: nav sticks at the bottom when scrolled`, r.down.nav && r.down.nav.bottom <= r.H + 1 && r.down.nav.top < r.H);
    if (r.down.fill) check(`${label}: Fill bar stays docked above the nav when scrolled`, Math.abs(r.down.fill.bottom - r.down.nav.top) <= 1);
  }
}

async function audit(page, label) {
  const r = await page.evaluate((maxW) => {
    const visible = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0;
    };
    const desc = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} "${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 32)}"`;
    const shortTaps = [];
    for (const el of document.querySelectorAll('nav a, .btn, .prow, .person, .sizes button, .chip.tall, .textbtn, .fold-head, .fold-link, header a:not(.chip)')) {
      if (!visible(el)) continue;
      const h = el.getBoundingClientRect().height;
      if (h < 44 - 0.5) shortTaps.push(`${desc(el)} ${Math.round(h)}px`);
    }
    const smallText = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    let n;
    while ((n = walker.nextNode())) {
      if (!n.nodeValue || !n.nodeValue.trim()) continue;
      const el = n.parentElement;
      if (!el || seen.has(el) || el.closest('script, style, .visually-hidden')) continue;
      seen.add(el);
      if (!visible(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 12 - 0.01) smallText.push(`${desc(el)} ${fs}px`);
    }
    const wide = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el) || el.closest('.scrollx')) continue;
      const b = el.getBoundingClientRect();
      if (b.right > maxW + 1 && getComputedStyle(el).position !== 'fixed') wide.push(`${desc(el)} right=${Math.round(b.right)}`);
    }
    return { scrollWidth: document.documentElement.scrollWidth, shortTaps, smallText, wide };
  }, W);
  check(`${label}: no horizontal overflow (scrollWidth ${r.scrollWidth} <= ${W})`, r.scrollWidth <= W, r.wide.slice(0, 4).join(' | '));
  check(`${label}: tap targets >= 44 px`, r.shortTaps.length === 0, r.shortTaps.slice(0, 4).join(' | '));
  check(`${label}: no text under 12 px`, r.smallText.length === 0, r.smallText.slice(0, 4).join(' | '));
  if (r.wide.length) console.log(`  note ${label}: elements past ${W}px: ${r.wide.slice(0, 3).join(' | ')}`);
  drainErrors(label);
}

const text = async (page, sel) => ((await page.locator(sel).first().textContent()) || '').replace(/\s+/g, ' ').trim();
const rowByPos = (page, pos) => page.locator('.rows .prow').filter({ has: page.locator('.pos', { hasText: new RegExp(`^${pos.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) }).first();
const sheet = page => page.locator('.sheet-backdrop .sheet');
async function closeSheetWithEscape(page, label) {
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-backdrop', { state: 'detached', timeout: 3000 }).catch(() => {});
  check(`${label}: Escape closes the sheet`, (await page.locator('.sheet-backdrop').count()) === 0);
}

// ---------- the run ----------
const server = await ensureServer();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, locale: 'en-US' });
// No internet in the sandbox: serve an empty stylesheet for Google Fonts so the fallback font renders without a console error.
await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
const page = await context.newPage();
watchPage(page);

try {
  // 1. every route, fresh device (Dorian, EN, FOH, 10:52)
  await step('routes', async () => {
    for (const r of ['setups', 'me', 'waste', 'tasks', 'scores', 'more']) {
      await goto(page, `#/${r}`);
      check(`#/${r} renders a screen`, (await page.locator('main.screen > *').count()) > 0);
      await shot(page, r);
      await audit(page, `#/${r}`);
    }
  });

  // 2. Set Ups fits above the fold (Dorian, 10:52, Lunch): first row top <= 470, >= 4 rows above the nav,
  //    the three strips folded to one line, the Fill bar docked above the nav; expand / collapse; the scrolled shot.
  await step('set ups: board fits above the fold', async () => {
    await goto(page, '#/setups');
    const m = await page.evaluate(() => {
      const box = el => el.getBoundingClientRect();
      const nav = box(document.querySelector('.nav'));
      const rows = Array.from(document.querySelectorAll('.rows .prow')).map(box);
      const heads = Array.from(document.querySelectorAll('.fold-head')).map(el => ({ h: box(el).height, text: (el.textContent || '').replace(/\s+/g, ' ').trim() }));
      const fill = document.querySelector('.fillbar');
      return { firstTop: rows.length ? rows[0].top : null, visible: rows.filter(r => r.bottom <= nav.top + 0.5).length, navTop: nav.top,
        heads, bodies: document.querySelectorAll('.fold-body').length, fill: fill ? box(fill) : null, hdrBtn: document.querySelectorAll('.hdr .btn').length };
    });
    check(`first position row starts at ${Math.round(m.firstTop)} px (<= 470)`, m.firstTop != null && m.firstTop <= 470);
    check(`${m.visible} rows fully visible above the nav (>= 4; nav top ${Math.round(m.navTop)})`, m.visible >= 4);
    check('no Fill button in the header', m.hdrBtn === 0);
    check('three strips, folded to one line each', m.heads.length === 3 && m.bodies === 0, m.heads.map(h => h.text).join(' | '));
    check(`folded strips are 44–48 px tall (${m.heads.map(h => Math.round(h.h)).join(', ')})`, m.heads.length > 0 && m.heads.every(h => h.h >= 43.5 && h.h <= 48.5));
    check('Lead/Breaks line reads "Lead Sam · Runner · Breaks off Maria, back 11:15"', /Lead\s*Sam · Runner\s*·\s*Breaks\s*off Maria, back 11:15/.test((m.heads[0] || {}).text || ''), (m.heads[0] || {}).text);
    check('Keep an eye on line lists first names', /Keep an eye on\s*Sienna · Emilio · Tobias/.test((m.heads[1] || {}).text || ''), (m.heads[1] || {}).text);
    check('At 1:00 line reads "3 leave · 1 spot to cover"', /At 1:00\s*3 leave · 1 spot to cover/.test((m.heads[2] || {}).text || ''), (m.heads[2] || {}).text);
    check('Fill bar docked directly above the nav', !!m.fill && Math.abs(m.fill.bottom - m.navTop) <= 1 && m.fill.top >= 0, m.fill ? `bottom ${Math.round(m.fill.bottom)} vs nav top ${Math.round(m.navTop)}` : 'no .fillbar');
    const fillBtn = await page.locator('.fillbar a.btn').boundingBox();
    check('Fill bar button is a full-width 48 px button', !!fillBtn && Math.abs(fillBtn.height - 48) <= 1 && fillBtn.width >= W - 2 * 16 - 1, fillBtn ? `${Math.round(fillBtn.width)}×${Math.round(fillBtn.height)}` : 'none');
    // expand / collapse in place (component state: the URL does not change)
    const hashBefore = await page.evaluate(() => location.hash);
    await page.locator('.fold-head').first().click();
    await sleep(80);
    check('tap expands the Lead/Breaks strip in place', (await page.locator('.fold-body').count()) === 1 && (await page.evaluate(() => location.hash)) === hashBefore);
    const body = await text(page, '.fold-body');
    check('expanded strip shows the rotation reason, a break with its cover, a Move control and the Lead Captain link',
      /led since|never led/.test(body) && /Harper covers/.test(body) && (await page.locator('.fold-body button.chip').count()) >= 1 && (await page.locator('.fold-body a.fold-link').count()) === 1, body.slice(0, 120));
    await audit(page, 'set ups with the Lead/Breaks strip open');
    await page.locator('.fold-head').first().click();
    await sleep(80);
    check('second tap folds it back', (await page.locator('.fold-body').count()) === 0);
    for (const [i, re] of [[1, /PEA due|from all green|stalled/], [2, /leaves/]]) {
      await page.locator('.fold-head').nth(i).click();
      await sleep(80);
      check(`strip ${i + 1} expands with its lines`, (await page.locator('.fold-body').count()) === 1 && re.test(await text(page, '.fold-body')));
      await page.locator('.fold-head').nth(i).click();
      await sleep(80);
    }
    // scrolled 500 px: the header sticks, the Fill bar stays above the nav
    const s = await page.evaluate(async () => {
      window.scrollTo(0, 500);
      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => setTimeout(r, 60));
      const b = q => { const el = document.querySelector(q); return el ? el.getBoundingClientRect() : null; };
      return { y: window.scrollY, hdr: b('.hdr'), fill: b('.fillbar'), nav: b('.nav') };
    });
    check(`scrolled ${Math.round(s.y)} px: the header sticks at the top`, s.y >= 400 && s.hdr && Math.abs(s.hdr.top) <= 1);
    check('scrolled: the Fill bar stays docked above the nav', s.fill && s.nav && Math.abs(s.fill.bottom - s.nav.top) <= 1 && s.nav.bottom <= H + 1);
    await shot(page, 'setups-scrolled');
    await page.evaluate(() => window.scrollTo(0, 0));
  });

  // 3. Set Ups: Drinks 1 → pick Rafael → pending → Saved
  await step('set ups: pick Rafael on Drinks 1', async () => {
    await goto(page, '#/setups');
    const summaryBefore = await text(page, '.hdr .summary');
    check('header summary reads "n of m placed"', /\d+ of \d+ placed/.test(summaryBefore), summaryBefore);
    check('header says Saved', /Saved/.test(await text(page, '.hdr .sync')));
    const drinks1 = rowByPos(page, 'Drinks 1');
    check('Drinks 1 row is Needed', /(^|\s)need(\s|$)/.test((await drinks1.getAttribute('class')) || ''));
    await drinks1.click();
    await page.waitForSelector('.sheet-backdrop .sheet', { state: 'visible', timeout: 3000 });
    check('pick sheet title is Drinks 1 · Needed', /Drinks 1/.test(await text(page, '.sheet .st')) && /Needed/.test(await text(page, '.sheet .st-suffix')));
    await shot(page, 'sheet-pick');
    await audit(page, 'pick sheet');
    const rafael = page.locator('.sheet button.person').filter({ has: page.locator('.n', { hasText: /^Rafael$/ }) }).first();
    check('Rafael is listed with a score chip', (await rafael.count()) === 1 && (await rafael.locator('.sc').count()) === 1);
    await rafael.click();
    await page.waitForSelector('.sheet-backdrop', { state: 'detached', timeout: 3000 }).catch(() => {});
    check('sheet closed after one tap', (await page.locator('.sheet-backdrop').count()) === 0);
    const cls = (await drinks1.getAttribute('class')) || '';
    const name = await drinks1.locator('.name').first().textContent();
    check('Drinks 1 shows Rafael pending (grey italic)', /pend/.test(cls) && /Rafael/.test(name || ''), `class="${cls}" name="${name}"`);
    check('header says Saving…', /Saving/.test(await text(page, '.hdr .sync')));
    await shot(page, 'setups-pending');
    const t0 = Date.now();
    await page.waitForFunction(() => {
      const rows = Array.from(document.querySelectorAll('.rows .prow'));
      const row = rows.find(r => (r.querySelector('.pos') || {}).textContent === 'Drinks 1');
      const sync = document.querySelector('.hdr .sync');
      return row && !row.classList.contains('pend') && sync && /Saved/.test(sync.textContent);
    }, null, { timeout: 1500 }).then(() => check(`row saved within ${Date.now() - t0} ms (<= 1500)`, true)).catch(() => check('row saved within 1.5 s', false));
    check('toast offers Undo', (await page.locator('.snack .undo').count()) === 1);
    check('Fill bar hides while the snackbar shows', (await page.locator('.fillbar').count()) === 0);
    const summaryAfter = await text(page, '.hdr .summary');
    check('count line went up by one', Number((summaryAfter.match(/(\d+) of/) || [])[1]) === Number((summaryBefore.match(/(\d+) of/) || [])[1]) + 1, `${summaryBefore} → ${summaryAfter}`);
    await viewportChecks(page, 'set ups with snackbar');
  });

  // 4. Fill → Confirm
  await step('set ups: Fill → Confirm', async () => {
    await goto(page, '#/setups');
    await page.locator('.snack').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {}); // the pick's snackbar hides the Fill bar
    const neededBefore = await page.locator('.rows .prow.need .pos').allTextContents();
    const summaryBefore = await text(page, '.hdr .summary');
    check('Fill button shows the open count', new RegExp(`Fill ${neededBefore.length} open`).test(await text(page, '.fillbar a.btn')), await text(page, '.fillbar a.btn'));
    await page.locator('.fillbar a.btn').click();
    await page.waitForSelector('.sheet-backdrop .sheet', { state: 'visible', timeout: 3000 });
    check('Fill bar hides while the Fill preview is open', (await page.locator('.fillbar').count()) === 0);
    const proposed = await sheet(page).locator('.prow.pend').count();
    check('Fill preview shows proposals as pending rows', proposed > 0 && proposed <= neededBefore.length, `${proposed} proposed for ${neededBefore.length} needed`);
    check('preview sub reads "n placed + m proposed"', /placed \+ \d+ proposed/.test(await text(page, '.sheet-sub')), await text(page, '.sheet-sub'));
    await shot(page, 'sheet-fill');
    await audit(page, 'fill preview');
    const confirm = sheet(page).locator('.sheet-foot button.btn').first();
    check('Confirm N placements button', new RegExp(`Confirm ${proposed} placement`).test(await confirm.textContent()));
    await confirm.click();
    await page.waitForSelector('.sheet-backdrop', { state: 'detached', timeout: 3000 }).catch(() => {});
    await page.waitForFunction(() => /Saved/.test((document.querySelector('.hdr .sync') || {}).textContent || '') && !document.querySelector('.rows .prow.pend'), null, { timeout: 2500 }).catch(() => {});
    const neededAfter = await page.locator('.rows .prow.need .pos').allTextContents();
    check('previously Needed rows are filled', neededAfter.length === neededBefore.length - proposed, `before ${neededBefore.join(', ')} → after ${neededAfter.join(', ') || 'none'}`);
    for (const pos of neededBefore.filter(p => !neededAfter.includes(p))) {
      const nm = await rowByPos(page, pos).locator('.name').first().textContent();
      check(`${pos} now has a name (${(nm || '').trim()})`, !!(nm || '').trim() && !/Needed/.test(nm || ''));
    }
    const summaryAfter = await text(page, '.hdr .summary');
    check('count line updated', Number((summaryAfter.match(/(\d+) of/) || [])[1]) === Number((summaryBefore.match(/(\d+) of/) || [])[1]) + proposed, `${summaryBefore} → ${summaryAfter}`);
    check('Fill bar gone when nothing is open', neededAfter.length > 0 || (await page.locator('.fillbar').count()) === 0);
    await shot(page, 'setups-filled');
    await audit(page, 'set ups after fill');
    // UNDO on the confirm snackbar clears exactly the proposed slots; the hand placement (Rafael) stays.
    check('confirm snackbar offers UNDO', (await page.locator('.snack .undo').count()) === 1);
    await page.locator('.snack .undo').click();
    await page.waitForFunction(() => /Saved/.test((document.querySelector('.hdr .sync') || {}).textContent || ''), null, { timeout: 2500 }).catch(() => {});
    const summaryUndone = await text(page, '.hdr .summary');
    check(`UNDO returns the header to "${summaryBefore.split(' · ')[0]}"`, summaryUndone.split(' · ')[0] === summaryBefore.split(' · ')[0], summaryUndone);
    const neededUndone = await page.locator('.rows .prow.need .pos').allTextContents();
    check('UNDO reopens the proposed slots', neededUndone.length === neededBefore.length, `${neededUndone.join(', ')}`);
    check('UNDO kept the hand placement on Drinks 1', /Rafael/.test((await rowByPos(page, 'Drinks 1').locator('.name').first().textContent()) || ''));
    // Fill again so the rest of the run sees the filled board (the bar is back once the snackbar has gone).
    await page.locator('.fillbar a.btn').waitFor({ state: 'visible', timeout: 6000 });
    await page.locator('.fillbar a.btn').click();
    await page.waitForSelector('.sheet-backdrop .sheet', { state: 'visible', timeout: 3000 });
    await sheet(page).locator('.sheet-foot button.btn').first().click();
    await page.waitForSelector('.sheet-backdrop', { state: 'detached', timeout: 3000 }).catch(() => {});
    await page.waitForFunction(() => /Saved/.test((document.querySelector('.hdr .sync') || {}).textContent || '') && !document.querySelector('.rows .prow.pend'), null, { timeout: 2500 }).catch(() => {});
    check('Fill again refills the board', (await text(page, '.hdr .summary')).split(' · ')[0] === summaryAfter.split(' · ')[0]);
    await viewportChecks(page, 'set ups after fill');
  });

  // 5. Person sheet opens from a filled row and closes with Escape
  await step('set ups: person sheet', async () => {
    const row = page.locator('.rows a.prow:not(.need)').first();
    const who = (await row.locator('.name').first().textContent() || '').trim();
    await row.click();
    await page.waitForSelector('.sheet-backdrop .sheet', { state: 'visible', timeout: 3000 });
    check(`person sheet titled ${who}`, (await text(page, '.sheet .st')) === who, await text(page, '.sheet .st'));
    check('person sheet has Change / Hand off / Clear', (await sheet(page).locator('.chip.tall').count()) >= 3);
    await shot(page, 'sheet-person');
    await audit(page, 'person sheet');
    await closeSheetWithEscape(page, 'person sheet');
  });

  // 6. the other Set Ups sheets
  await step('set ups: lead / develop / at1 / dayparts sheets', async () => {
    for (const [s, titleRe] of [['lead', /Lead|Who leads/i], ['develop', /Develop|Keep an eye/i], ['at1', /At 1:00|1:00/], ['dayparts', /Dayparts/i]]) {
      await goto(page, `#/setups?sheet=${s}`);
      const open = (await page.locator('.sheet-backdrop .sheet').count()) === 1;
      check(`sheet ${s} opens`, open);
      if (open) check(`sheet ${s} title (${await text(page, '.sheet .st')})`, titleRe.test(await text(page, '.sheet .st')));
      await shot(page, `sheet-${s}`);
      await audit(page, `${s} sheet`);
      await closeSheetWithEscape(page, `${s} sheet`);
    }
    for (const dp of ['afternoon']) {
      await goto(page, `#/setups?dp=${dp}`);
      check(`board for ?dp=${dp} shows Afternoon`, /Afternoon/.test(await text(page, '.hdr .title')));
      await shot(page, `setups-${dp}`);
      await audit(page, `set ups ${dp}`);
    }
    await goto(page, '#/setups');
    await page.locator('.hdr .seg button', { hasText: 'BOH' }).click();
    await sleep(150);
    check('BOH board shows Mid', /Mid/.test(await text(page, '.hdr .title')), await text(page, '.hdr .title'));
    await shot(page, 'setups-boh');
    await audit(page, 'set ups BOH');
    await page.locator('.hdr .seg button', { hasText: 'FOH' }).click();
    await sleep(150);
  });

  // 7. Waste → tap Nuggets 12 → snackbar → Undo
  await step('waste: log and undo', async () => {
    await goto(page, '#/waste');
    const countBefore = await text(page, '.hdr .panel');
    const nuggets = page.locator('.tile').filter({ has: page.locator('.en', { hasText: /^Nuggets/ }) }).first();
    check('Nuggets tile exists', (await nuggets.count()) === 1);
    const tapeBefore = await page.locator('.tape').count();
    await nuggets.locator('.sizes button', { hasText: /^12$/ }).click();
    await page.waitForSelector('.snack', { state: 'visible', timeout: 3000 });
    const snack = await text(page, '.snack .txt');
    check('snackbar names Nuggets', /Nuggets/.test(snack), snack);
    const countMid = await text(page, '.hdr .panel');
    check('entry count went up', countMid !== countBefore, `${countBefore} → ${countMid}`);
    check('tape shows the new entry', (await page.locator('.tape').count()) > tapeBefore);
    await shot(page, 'waste-snack');
    await audit(page, 'waste with snackbar');
    await page.locator('.snack .undo').click();
    await sleep(150);
    check('Undo removed the entry', (await text(page, '.hdr .panel')) === countBefore, await text(page, '.hdr .panel'));
    check('snackbar closed', (await page.locator('.snack').count()) === 0);
    check('tape back to before', (await page.locator('.tape').count()) === tapeBefore);
  });

  // 8. Tasks: at 2:04 the Restrooms reset is due (3 of 8); toggle a row
  await step('tasks: toggle a checklist row', async () => {
    await goto(page, '#/more');
    await page.locator('.chip.tall', { hasText: /^2:04$/ }).click();
    await sleep(100);
    await goto(page, '#/tasks');
    check('DUE NOW card on the clock', (await page.locator('.chip.red').count()) >= 1);
    const progressSel = '.card .progress + span';
    const before = await text(page, progressSel);
    check('progress reads 3 of 8', before === '3 of 8', before);
    // pin the row by index: once it is done, ":not(.done)" would resolve to a different row
    const steps = page.locator('.card button.step');
    const classes = await steps.evaluateAll(els => els.map(e => e.className));
    const idx = Math.max(0, classes.findIndex(c => !/\bdone\b/.test(c)));
    const stepRow = steps.nth(idx);
    await stepRow.click();
    await sleep(100);
    const after = await text(page, progressSel);
    check('progress text changed after the toggle', after !== before && /^\d+ of 8$/.test(after), `${before} → ${after}`);
    await shot(page, 'tasks-toggled');
    await audit(page, 'tasks after toggle');
    await stepRow.click(); // put it back
    await sleep(100);
    check('toggle back restores the count', (await text(page, progressSel)) === before);
    await goto(page, '#/tasks?tab=zone');
    check('zone reset tab renders checklists', (await page.locator('button.step').count()) > 0);
    await shot(page, 'tasks-zone');
    await audit(page, 'tasks zone reset');
    await goto(page, '#/more');
    await page.locator('.chip.tall', { hasText: /^10:52$/ }).click();
    await sleep(100);
  });

  // 9. More → Español → nav shows Tareas
  await step('more: switch to Español', async () => {
    await goto(page, '#/more');
    await page.locator('.seg button', { hasText: /^ES$/ }).first().click();
    await sleep(150);
    const nav = await page.locator('nav.nav a').allTextContents();
    check('nav shows Tareas', nav.some(x => /Tareas/.test(x)), nav.join(' · '));
    check('html lang is es', (await page.getAttribute('html', 'lang')) === 'es');
    await shot(page, 'more-es');
    await audit(page, 'more in Spanish');
    await goto(page, '#/setups');
    check('Set Ups header in Spanish', /puestos/.test(await text(page, '.hdr .summary')), await text(page, '.hdr .summary'));
    await shot(page, 'setups-es');
    await audit(page, 'set ups in Spanish');
  });

  // 10. More → pick Rafael → nav first item Mi puesto → #/me shows Drinks 1
  await step('more: pick Rafael → Mi puesto', async () => {
    await goto(page, '#/more');
    await page.locator('main.screen button.person').first().click();
    await page.waitForSelector('.sheet-backdrop .sheet', { state: 'visible', timeout: 3000 });
    await shot(page, 'more-who');
    await audit(page, 'who sheet');
    await page.locator('.sheet button.person').filter({ has: page.locator('.n', { hasText: /^Rafael$/ }) }).first().click();
    await page.waitForSelector('.sheet-backdrop', { state: 'detached', timeout: 3000 }).catch(() => {});
    await sleep(150);
    const first = await text(page, 'nav.nav a');
    check('nav first item is Mi puesto', /Mi puesto/.test(first), first);
    await goto(page, '#/me');
    const body = await text(page, 'main.screen');
    check('#/me greets Rafael', /Hola, Rafael/.test(body));
    check('#/me renders Drinks 1', /Drinks 1/.test(body));
    check('#/me at 10:52 says the shift starts at 11:00, not "not placed yet"', /Tu turno empieza a las 11:00/.test(body) && !/Sin puesto todavía/.test(body));
    await shot(page, 'me-rafael');
    await audit(page, 'mi puesto (Rafael)');
    await goto(page, '#/scores');
    const scores = await text(page, 'main.screen');
    check('#/scores as a team member shows no PEA standing (no "missing:"/"faltan:" rows)', !/missing:|faltan:/i.test(scores));
    await shot(page, 'scores-rafael');
    await audit(page, 'scores (Rafael)');
    await goto(page, '#/setups');
    check('team member sees the board read-only (no Fill bar)', (await page.locator('.fillbar').count()) === 0 && (await page.locator('.rows .prow').count()) > 0);
    await shot(page, 'setups-readonly');
    await audit(page, 'set ups read-only');
    await goto(page, '#/waste');
    await shot(page, 'waste-es');
    await audit(page, 'waste in Spanish');
  });
} finally {
  await browser.close();
  if (server) server.kill();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) { console.log('\nFailures:'); for (const f of failures) console.log(`  - ${f}`); }
console.log(`screenshots: ${path.relative(process.cwd(), SHOTS)}/`);
process.exit(failed ? 1 : 0);
