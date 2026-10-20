// ===== HUB HEALTH (Tim, Oct 19 2026) =====
// Two halves:
//  1. Every phone sends one small note per visit (POST /api/health/visit):
//     how long until the page was usable (the saved data loaded), home-screen
//     app or browser, the signed-in role (never a name), and which tabs it
//     opened. Tabs opened later go in a note when the page is put away.
//  2. Manage → Health reads the week (GET /api/health, managers only): saves
//     that landed, refused and retried (app.py counts those as they happen),
//     how fast the hub opens, what the team opens, who uses it, the deploy.

let hhViews = {};          // tabs opened since the last note
let hhVisitSent = false;

function hhNoteView(view){
  if(!/^[a-z]{2,20}$/.test(view)) return;
  hhViews[view] = (hhViews[view] || 0) + 1;
  if(view === 'manage' && typeof manageCurrentTab === 'function' && manageCurrentTab() === 'health') hhLoad();
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
  if(!hhVisitSent || !Object.keys(hhViews).length) return;
  const views = hhViews;
  hhViews = {};
  hhSend({views}, beacon);
}

// The visit: once the saved data is on the page (that's when it's usable),
// and a moment for the sign-in check to say who's holding it.
(async () => {
  try{ await stateLoaded; }catch(err){ return; }
  const ready = Math.round(performance.now());
  setTimeout(() => {
    const views = hhViews;
    hhViews = {};
    hhSend({visit: 1, ready, app: typeof stateStandalone === 'function' && stateStandalone(), role: hhRole(), views});
    hhVisitSent = true;
  }, 3000);
})();
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') hhFlushViews(true); });
setInterval(() => hhFlushViews(false), 5 * 60 * 1000);

// ----- Manage → Health -----
const HH_VIEW_LABELS = {home: 'Home', positions: 'Set Ups', wastelog: 'Waste', scoreboard: 'Scoreboard', zonereset: 'Zone Reset',
  foodsafety: 'Food Safety', safecount: 'Safe Count', prepboard: 'Prep Board', calendar: 'Calendar', manage: 'Manage',
  directors: 'Directors', forecast: 'Forecast', uniforms: 'Uniforms', tx: 'TX', lx: 'LX'};
const HH_ROLE_LABELS = {member: 'Team Members', trainer: 'Trainers', lead: 'Team Leads', admin: 'Admin Team', director: 'Directors', manager: 'Manager PIN', none: 'not signed in'};
let hhData = null, hhBusy = false, hhError = '';

async function hhLoad(){
  if(hhBusy) return;
  hhBusy = true;
  try{
    const res = await fetch(`${API_BASE}/api/health`);
    if(!res.ok) throw new Error(res.status === 403 ? 'Sign in with the manager PIN or a director account.' : 'Couldn’t read the counts. Try again in a moment.');
    hhData = await res.json();
    hhError = '';
  }catch(err){
    hhError = err.message || 'Couldn’t reach the hub.';
  }finally{
    hhBusy = false;
  }
  hhRender();
}

function hhPct(list, p){
  if(!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}
function hhSecs(ms){ return ms === null ? '—' : (ms / 1000).toFixed(1) + 's'; }
function hhWhen(ms){
  if(!ms) return '—';
  const d = new Date(ms);
  const day = toLocalISODate(d) === today ? 'today' : d.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
  return `${day} ${d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'})}`;
}

// The week in one object: sums, the load times, views and roles.
function hhWeek(data){
  const days = Object.keys(data.days || {}).sort();
  const w = {saves: 0, refused: 0, refusedBy: {}, retried: 0, visits: 0, app: 0, ready: [], views: {}, roles: {}, open: 0, perDay: []};
  days.forEach(day => {
    const r = data.days[day] || {};
    const refused = Object.values(r.refused || {}).reduce((a, b) => a + b, 0);
    w.saves += r.saves || 0; w.refused += refused; w.retried += r.retried || 0;
    w.visits += r.visits || 0; w.app += r.app || 0;
    w.ready.push(...(r.ready || []));
    Object.entries(r.refused || {}).forEach(([k, n]) => { w.refusedBy[k] = (w.refusedBy[k] || 0) + n; });
    Object.entries(r.views || {}).forEach(([k, n]) => { w.views[k] = (w.views[k] || 0) + n; });
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

document.getElementById('hubHealthRoot').addEventListener('click', e => { if(e.target.closest('[data-hh-refresh]')) hhLoad(); });
document.getElementById('manageTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-manage-go]');
  if(b && b.dataset.manageGo === 'health') hhLoad();
});
