// ===== HUB HEALTH (Tim, Oct 19 2026) =====
// Two halves:
//  1. Every phone sends one small note per visit (POST /api/health/visit):
//     how long until the page was usable (the saved data loaded), home-screen
//     app or browser, the signed-in role (never a name), and which tabs it
//     opened. Tabs opened later go in a note when the page is put away.
//  2. Manage → Health reads the week (GET /api/health, managers only): saves
//     that landed, refused and retried (app.py counts those as they happen),
//     how fast the hub opens, what the team opens, who uses it, the deploy.
//  3. Slow tabs (Tim, Oct 22 2026: speed is a top priority): each tab is
//     timed from the tap to its content on screen (the next frame, or for a
//     tab that waits on the server, until its data shows), and Health lists
//     the slowest. Only opens count, not a redraw when saved data comes in.

let hhViews = {};          // tabs opened since the last note
let hhOpens = {};          // {view: [ms, ...]} since the last note
let hhWaitOpen = null;     // {view, t0}: an open waiting on the server for its content
let hhVisitSent = false;
const HH_OPENS_PER_NOTE = 20;
const HH_SLOW_MS = 1000;

// Tabs whose content waits on the server the first time.
const HH_WAITS = {
  headcount: () => typeof hcAllowed === 'function' && hcAllowed() && !hcData,
  health: () => !hhData,
};

function hhTimed(view, ms){
  if(!/^[a-z]{2,20}$/.test(view) || !(ms >= 0 && ms < 60000)) return;
  const list = hhOpens[view] = hhOpens[view] || [];
  if(list.length < HH_OPENS_PER_NOTE) list.push(Math.round(ms));
}
// Timing starts at the tap (t0, performance.now()); it ends on the frame
// after the content is drawn.
function hhTimeOpen(view, t0){
  if(HH_WAITS[view] && HH_WAITS[view]()){ hhWaitOpen = {view, t0}; return; }
  if(hhWaitOpen && hhWaitOpen.view !== view) hhWaitOpen = null;     // left before it showed
  requestAnimationFrame(() => setTimeout(() => hhTimed(view, performance.now() - t0), 0));
}
// A waiting tab's data has been drawn.
function hhOpenArrived(view){
  if(!hhWaitOpen || hhWaitOpen.view !== view) return;
  const {t0} = hhWaitOpen;
  hhWaitOpen = null;
  requestAnimationFrame(() => setTimeout(() => hhTimed(view, performance.now() - t0), 0));
}

function hhNoteView(view, t0){
  if(!/^[a-z]{2,20}$/.test(view)) return;
  hhViews[view] = (hhViews[view] || 0) + 1;
  if(t0 !== undefined && view !== 'manage') hhTimeOpen(view, t0);
  if(view !== 'manage') return;
  if(typeof manageCurrentTab === 'function' && manageCurrentTab() === 'health') hhLoad();
  // Loaded ahead on the way into Manage, so Health opens at once (Tim, Oct 22 2026).
  else if(typeof launchManager !== 'undefined' && launchManager && Date.now() - hhAt > 60000){
    if(typeof requestIdleCallback === 'function') requestIdleCallback(() => hhLoad(), {timeout: 2000});
    else setTimeout(hhLoad, 300);
  }
}

function hhRole(){
  const role = typeof acUser !== 'undefined' && acUser ? acUser.role : '';
  if(typeof launchManager !== 'undefined' && launchManager) return role === 'manager' ? 'manager' : 'director';
  return ['lead', 'trainer', 'member', 'admin'].includes(role) ? role : 'none';
}

function hhSend(body, beacon){
  const json = JSON.stringify(body);
  try{
    if(beacon && navigator.sendBeacon && navigator.sendBeacon(`${API_BASE}/api/health/visit`, new Blob([json], {type: 'application/json'}))) return;
    fetch(`${API_BASE}/api/health/visit`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: json, keepalive: true}).catch(() => {});
  }catch(err){ /* a count is never worth an error */ }
}

function hhFlushViews(beacon){
  if(!hhVisitSent || (!Object.keys(hhViews).length && !Object.keys(hhOpens).length)) return;
  const views = hhViews, opens = hhOpens;
  hhViews = {};
  hhOpens = {};
  hhSend({views, opens}, beacon);
}

// The visit: once the saved data is on the page (that's when it's usable),
// and a moment for the sign-in check to say who's holding it.
(async () => {
  try{ await stateLoaded; }catch(err){ return; }
  const ready = Math.round(performance.now());
  setTimeout(() => {
    const views = hhViews, opens = hhOpens;
    hhViews = {};
    hhOpens = {};
    hhSend({visit: 1, ready, app: typeof stateStandalone === 'function' && stateStandalone(), role: hhRole(), views, opens});
    hhVisitSent = true;
  }, 3000);
})();
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') hhFlushViews(true); });
setInterval(() => hhFlushViews(false), 5 * 60 * 1000);

// ----- Manage → Health -----
const HH_VIEW_LABELS = {home: 'Home', positions: 'Set Ups', wastelog: 'Waste', scoreboard: 'Scoreboard', zonereset: 'Zone Reset',
  foodsafety: 'Food Safety', safecount: 'Safe Count', prepboard: 'Prep Board', calendar: 'Calendar', manage: 'Manage',
  directors: 'Directors', forecast: 'Forecast', uniforms: 'Uniforms', tx: 'TX', lx: 'LX', forms: 'Forms', headcount: 'Our Team',
  health: 'Manage → Health'};
const HH_ROLE_LABELS = {member: 'Team Members', trainer: 'Trainers', lead: 'Team Leads', admin: 'Admin Team', director: 'Directors', manager: 'Manager PIN', none: 'not signed in'};
let hhData = null, hhBusy = false, hhError = '', hhAt = 0;

async function hhLoad(){
  if(hhBusy) return;
  hhBusy = true;
  try{
    const res = await fetch(`${API_BASE}/api/health`);
    if(!res.ok) throw new Error(res.status === 403 ? 'Sign in with the manager PIN or a director account.' : 'Couldn’t read the counts. Try again in a moment.');
    hhData = await res.json();
    hhAt = Date.now();
    hhError = '';
  }catch(err){
    hhError = err.message || 'Couldn’t reach the hub.';
  }finally{
    hhBusy = false;
  }
  hhRender();
  if(hhData && document.getElementById('manageTab-health').getAttribute('aria-selected') === 'true') hhOpenArrived('health');
}

function hhPct(list, p){
  if(!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}
function hhSecs(ms){ return ms === null ? '—' : (ms / 1000).toFixed(1) + 's'; }
function hhTapSecs(ms){ return ms !== null && ms < 1000 ? (ms / 1000).toFixed(2) + 's' : hhSecs(ms); }
function hhWhen(ms){
  if(!ms) return '—';
  const d = new Date(ms);
  const day = toLocalISODate(d) === today ? 'today' : d.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
  return `${day} ${d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'})}`;
}

// The week in one object: sums, the load times, views and roles.
function hhWeek(data){
  const days = Object.keys(data.days || {}).sort();
  const w = {saves: 0, refused: 0, refusedBy: {}, retried: 0, visits: 0, app: 0, ready: [], views: {}, roles: {}, opens: {}, open: 0, perDay: []};
  days.forEach(day => {
    const r = data.days[day] || {};
    const refused = Object.values(r.refused || {}).reduce((a, b) => a + b, 0);
    w.saves += r.saves || 0; w.refused += refused; w.retried += r.retried || 0;
    w.visits += r.visits || 0; w.app += r.app || 0;
    w.ready.push(...(r.ready || []));
    Object.entries(r.refused || {}).forEach(([k, n]) => { w.refusedBy[k] = (w.refusedBy[k] || 0) + n; });
    Object.entries(r.views || {}).forEach(([k, n]) => { w.views[k] = (w.views[k] || 0) + n; });
    Object.entries(r.opens || {}).forEach(([k, list]) => { if(Array.isArray(list)) (w.opens[k] = w.opens[k] || []).push(...list); });
    Object.entries(r.roles || {}).forEach(([k, n]) => { w.roles[k] = (w.roles[k] || 0) + n; });
    if(r.visits || r.saves) w.open++;
    w.perDay.push({day, visits: r.visits || 0, saves: r.saves || 0, refused, retried: r.retried || 0});
  });
  return w;
}

function hhRender(){
  const root = document.getElementById('hubHealthRoot');
  if(!root) return;
  if(hhError && !hhData){ root.innerHTML = `<p class="dir-empty">${escapeHtml(hhError)}</p>`; return; }
  if(!hhData){ root.innerHTML = '<p class="dir-empty">Loading…</p>'; return; }
  const w = hhWeek(hhData);
  const mid = hhPct(w.ready, 0.5), slow = hhPct(w.ready, 0.9);
  const perDay = Math.max(1, w.open);
  const views = Object.entries(w.views).sort((a, b) => b[1] - a[1]);
  const top = views.length ? views[0][1] : 1;
  const roles = Object.entries(w.roles).sort((a, b) => b[1] - a[1]);
  const refusedWhy = Object.entries(w.refusedBy).map(([code, n]) => `${n} × ${code === '400' ? 'rejected' : code === '413' ? 'too large' : code === '500' ? 'server error' : 'HTTP ' + code}`).join(', ');
  const tile = (n, label, cls, dark) => `<div class="hh-tile${dark ? ' is-dark' : ''}"><b class="${cls || ''}">${escapeHtml(String(n))}</b><span>${escapeHtml(label)}</span></div>`;
  root.innerHTML = `
    <div class="hh-tiles">
      ${tile(w.refused, w.refused ? `saves refused · ${refusedWhy}` : 'saves refused this week', w.refused ? 'is-bad' : 'is-ok', true)}
      ${tile(w.retried, `saves retried · ${w.saves.toLocaleString('en-US')} landed`, '', true)}
      ${tile(hhSecs(mid), 'typical time to open', '', false)}
      ${tile(hhSecs(slow), 'slowest 1 in 10 opens', slow !== null && slow > 4000 ? 'is-bad' : '', false)}
    </div>
    <div class="hh-sub">
      <h4>What the team opens <span>a day, last 7 days</span></h4>
      ${views.length ? views.slice(0, 10).map(([v, n]) => `
        <div class="hh-bar${n / top < 0.05 ? ' is-dim' : ''}"><span class="hh-l">${escapeHtml(HH_VIEW_LABELS[v] || v)}</span><span class="hh-t"><i style="width:${Math.max(2, Math.round(n / top * 100))}%"></i></span><span class="hh-v">${Math.round(n / perDay)}</span></div>`).join('') : '<p class="dir-empty">No visits counted yet. Give it a day.</p>'}
      ${w.visits ? `<p class="hh-note">${w.visits.toLocaleString('en-US')} visits · ${Math.round(w.app / w.visits * 100)}% from the home-screen app · ${roles.map(([r, n]) => `${HH_ROLE_LABELS[r] || r} ${Math.round(n / w.visits * 100)}%`).join(', ')}</p>` : ''}
    </div>
    ${hhSlowHtml(w)}
    <div class="hh-sub">
      <h4>Day by day</h4>
      <table class="hh-days"><thead><tr><th>Day</th><th>Visits</th><th>Saves</th><th>Refused</th><th>Retried</th></tr></thead><tbody>
        ${[...w.perDay].reverse().map(d => `<tr><td>${escapeHtml(new Date(d.day + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'numeric', day: 'numeric'}))}</td><td>${d.visits}</td><td>${d.saves}</td><td class="${d.refused ? 'is-bad' : ''}">${d.refused}</td><td>${d.retried}</td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="hh-sub">
      <h4>The live hub</h4>
      <p class="hh-note">Build <b>${escapeHtml(hhData.build || '?')}</b> · live since ${escapeHtml(hhWhen(hhData.liveSince))} · last save landed ${escapeHtml(hhWhen(hhData.lastSaveAt))}</p>
      <button type="button" class="btn btn-ghost hh-refresh" data-hh-refresh>${hhBusy ? 'Checking…' : 'Refresh'}</button>
    </div>`;
}

// Slowest tabs first: tap to content, typical and the slowest 1 in 10.
function hhSlowHtml(w){
  const rows = Object.entries(w.opens).filter(([, l]) => l.length)
    .map(([v, l]) => ({v, n: l.length, mid: hhPct(l, 0.5), slow: hhPct(l, 0.9), over: l.filter(ms => ms >= HH_SLOW_MS).length}))
    .sort((a, b) => b.slow - a.slow);
  const body = rows.length ? `<table class="hh-days hh-slow"><thead><tr><th>Tab</th><th>Typical</th><th>Slowest 1 in 10</th><th>Over 1 sec</th><th>Opens</th></tr></thead><tbody>
      ${rows.slice(0, 10).map(r => `<tr><td>${escapeHtml(HH_VIEW_LABELS[r.v] || r.v)}</td><td>${hhTapSecs(r.mid)}</td><td class="${r.slow >= HH_SLOW_MS ? 'is-bad' : ''}">${hhTapSecs(r.slow)}</td><td class="${r.over ? 'is-bad' : ''}">${r.over}</td><td>${r.n.toLocaleString('en-US')}</td></tr>`).join('')}
    </tbody></table>` : '<p class="dir-empty">No tabs timed yet. Phones start timing after they reload.</p>';
  return `<div class="hh-sub">
      <h4>Slowest tabs <span>tap to content, last 7 days</span></h4>
      ${body}
      <p class="hh-note">Over a second is slow: it shows in red.</p>
    </div>`;
}

document.getElementById('hubHealthRoot').addEventListener('click', e => { if(e.target.closest('[data-hh-refresh]')) hhLoad(); });
document.getElementById('manageTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-manage-go]');
  if(b && b.dataset.manageGo === 'health'){ hhTimeOpen('health', performance.now()); hhViews.health = (hhViews.health || 0) + 1; hhLoad(); }
});
