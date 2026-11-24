// ===== VIEW AS (Tim, Nov 23 2026) =====
// "I need to know what everyone at every level is seeing." Tim, and only
// Tim (app.py _may_view_as: the owner's Google sign-in, or his clock-in PIN),
// gets a "View as" button by the badge top right. It draws the hub as a Team
// Member, a Trainer, a Team Lead or the Admin Team would see it, for a person
// he picks from the schedule (Home is built around that person's day: their
// spots, shift, zone and PEA). Director is himself again.
//
// A look only. Nothing changes on the server: the page sets who it thinks is
// signed in (acUser, siIdentity, launchManager) and draws again, and puts his
// own back when he's done. While it's on, nothing he changes is saved
// (siMayChange says no, so a change is put back), Manage is closed, his
// tickets stay off the card (they'd be his, not theirs), and a reload is
// himself again. The one thing it asks the server for is that person's PEA
// scores (/api/me/pea?as=), which his director session already holds.
//
// A change to what a role sees needs nothing here: every page already asks
// acUser / siIdentity / launchManager, which this sets.

let vaAllowed = false;    // the server says this sign-in may (status, sign-in reply)
let vaAs = null;          // {role, name} while viewing as someone
let vaReal = null;        // his own: {acUser, siIdentity, manager}
let vaPick = {role: 'member', name: ''};   // the sheet's choice

const VA_ROLES = [['member', 'Team Member'], ['trainer', 'Trainer'], ['lead', 'Team Lead'], ['admin', 'Admin Team'], ['director', 'Director']];
const VA_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const VA_X = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function vaActive(){ return !!vaAs; }
function vaRoleLabel(r){ return (VA_ROLES.find(x => x[0] === r) || [r, r])[1]; }

// The server's word on whether this sign-in may (accounts.js calls it).
function vaSetAllowed(on){
  vaAllowed = !!on;
  if(!vaAllowed && vaAs) vaQuit();
  vaDrawButton();
}

// ----- Who to pick: the people on the schedule, today's first -----
function vaPeople(){
  const seen = new Set(), today1 = [], rest = [];
  const add = (list, out) => (Array.isArray(list) ? list : []).forEach(p => {
    const n = p && String(p.name || '').trim();
    const k = n.toLowerCase();
    if(n && !seen.has(k)){ seen.add(k); out.push(n); }
  });
  const rosters = [typeof fohRoster !== 'undefined' ? fohRoster : {}, typeof bohRoster !== 'undefined' ? bohRoster : {}];
  rosters.forEach(r => add(r && r[today], today1));
  rosters.forEach(r => Object.keys(r || {}).filter(d => d >= today).sort().forEach(d => add(r[d], rest)));
  return {today: today1.sort(), later: rest.sort()};
}
function vaIsLeader(name){
  return Array.isArray(typeof leaderRoster !== 'undefined' ? leaderRoster : null)
    && leaderRoster.some(r => r && r.name && (typeof rnSame === 'function' ? rnSame(r.name, name) : r.name === name));
}
// A sensible first pick for the role: a leader for Team Lead, someone who
// isn't one for the others, on today's schedule when there is one.
function vaDefaultName(role){
  const {today: t, later} = vaPeople();
  const all = t.concat(later);
  const fit = role === 'lead' ? all.filter(vaIsLeader) : all.filter(n => !vaIsLeader(n));
  return fit[0] || all[0] || '';
}

// ----- Start and stop -----
function vaStart(role, name){
  if(!vaAllowed) return;
  if(role === 'director'){ vaStop(); return; }
  if(!vaReal) vaReal = {acUser: acUser, siIdentity: Object.assign({}, siIdentity), manager: !!launchManager};
  const real = vaReal.acUser || {};
  // The Admin Team's card isn't about one person's day: it stays his name.
  const who = role === 'admin' ? (real.name || vaReal.siIdentity.name || '') : name;
  if(!who) return;
  vaAs = {role, name: who};
  acUser = {name: who, role, via: 'preview'};
  siIdentity = Object.assign({}, vaReal.siIdentity, {name: who, role, device: ''});
  launchManager = role === 'admin';
  vaRedraw();
}
// Back to himself.
function vaStop(){
  if(!vaReal){ vaAs = null; vaRedraw(); return; }
  acUser = vaReal.acUser;
  siIdentity = vaReal.siIdentity;
  launchManager = vaReal.manager;
  vaReal = null; vaAs = null;
  vaRedraw();
}
// A real sign-in or sign-out is about to change who's here: drop the view
// quietly, so it doesn't put the old sign-in back later.
function vaQuit(){
  if(!vaReal){ vaAs = null; return; }
  acUser = vaReal.acUser; siIdentity = vaReal.siIdentity; launchManager = vaReal.manager;
  vaReal = null; vaAs = null;
  document.body.classList.remove('va-on');
  vaDrawBar();
}

// Every page asks who's here as it draws: draw again.
function vaRedraw(){
  document.body.classList.toggle('va-on', !!vaAs);
  document.body.classList.toggle('is-manager', !!launchManager);
  // Manage: closed for the team's roles, as a team PIN finds it.
  const content = document.getElementById('manageContent'), gate = document.getElementById('pinGate');
  if(content && gate && (vaReal ? vaReal.manager : launchManager)){
    content.style.display = launchManager ? 'block' : 'none';
    gate.style.display = launchManager ? 'none' : '';
  }
  if(typeof launchApply === 'function') launchApply();
  const active = document.querySelector('.view.active');
  const view = active ? active.id.replace(/View$/, '') : '';
  if(!launchManager && view === 'directors' && typeof launchShowTab === 'function') launchShowTab('home');
  if(typeof rnMine !== 'undefined' && typeof RN_MINE_NONE === 'function') rnMine = RN_MINE_NONE();
  if(typeof acRenderGate === 'function') acRenderGate();
  if(typeof siRender === 'function') siRender();
  if(typeof scSyncVisibility === 'function') scSyncVisibility();
  if(typeof peaLeadLoad === 'function') peaLeadLoad();
  if(typeof renderRightNow === 'function') renderRightNow();
  if(typeof stateRerender === 'function') stateRerender();
  vaDrawButton();
  vaDrawBar();
}

// ----- The button by the badge -----
function vaDrawButton(){
  let btn = document.getElementById('vaBtn');
  const badge = document.getElementById('initialsBadge');
  if(!btn && badge && vaAllowed){
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'vaBtn';
    btn.className = 'va-btn';
    btn.innerHTML = `${VA_ICON}<span>View as</span>`;
    btn.title = 'See the hub as each role sees it';
    btn.addEventListener('click', vaOpen);
    badge.parentNode.insertBefore(btn, badge);
  }
  if(btn) btn.hidden = !vaAllowed;
}

// ----- The bar while it's on -----
function vaDrawBar(){
  let bar = document.getElementById('vaBar');
  if(!vaAs){ if(bar) bar.remove(); return; }
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'vaBar';
    bar.className = 'va-bar';
    bar.setAttribute('role', 'status');
    bar.addEventListener('click', e => {
      if(e.target.closest('[data-va-back]')) vaStop();
      else if(e.target.closest('[data-va-change]')) vaOpen();
    });
    document.body.insertBefore(bar, document.body.firstChild);
  }
  const who = vaAs.role === 'admin' ? '' : ` · ${escapeHtml(vaAs.name)}`;
  bar.innerHTML = `<span class="va-bar-txt">${VA_ICON}<span>Viewing as <b>${escapeHtml(vaRoleLabel(vaAs.role))}</b>${who}<small>Look only: changes aren’t saved</small></span></span>
    <span class="va-bar-go"><button type="button" class="va-link" data-va-change>Change</button><button type="button" class="va-back" data-va-back>Back to me</button></span>`;
}

// ----- The sheet -----
function vaSheet(){
  let sheet = document.getElementById('vaSheet');
  if(sheet) return sheet;
  sheet = document.createElement('div');
  sheet.id = 'vaSheet';
  sheet.className = 'overlay si-sheet va-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'vaTitle');
  sheet.innerHTML = `<div class="si-card"><div class="si-head"><h3 id="vaTitle">View as</h3><button type="button" class="dir-x" data-va-close aria-label="Close">${VA_X}</button></div><div id="vaBody"></div></div>`;
  sheet.addEventListener('click', e => {
    if(e.target === sheet || e.target.closest('[data-va-close]')){ vaClose(); return; }
    const r = e.target.closest('[data-va-role]');
    if(r){
      vaPick.role = r.dataset.vaRole;
      if(!vaPick.name || (vaPick.role === 'lead') !== vaIsLeader(vaPick.name)) vaPick.name = vaDefaultName(vaPick.role);
      vaDrawSheet();
      return;
    }
    if(e.target.closest('[data-va-go]')){
      const sel = document.getElementById('vaName');
      if(sel) vaPick.name = sel.value;
      vaClose();
      vaStart(vaPick.role, vaPick.name);
    }
  });
  sheet.addEventListener('change', e => { if(e.target.id === 'vaName') vaPick.name = e.target.value; });
  document.body.appendChild(sheet);
  return sheet;
}
function vaOpen(){
  if(!vaAllowed) return;
  vaPick = vaAs ? {role: vaAs.role, name: vaAs.name} : {role: 'member', name: vaDefaultName('member')};
  vaSheet().classList.add('active');
  vaDrawSheet();
}
function vaClose(){
  const sheet = document.getElementById('vaSheet');
  if(sheet) sheet.classList.remove('active');
}
function vaDrawSheet(){
  const body = document.getElementById('vaBody');
  if(!body) return;
  const role = vaPick.role;
  const {today: t, later} = vaPeople();
  const opt = n => `<option value="${escapeHtml(n)}"${n === vaPick.name ? ' selected' : ''}>${escapeHtml(n)}${vaIsLeader(n) ? ' (leader)' : ''}</option>`;
  const extra = vaPick.name && !t.includes(vaPick.name) && !later.includes(vaPick.name) ? opt(vaPick.name) : '';
  const person = role === 'admin' || role === 'director' ? '' : `
    <label class="va-label" for="vaName">Whose day</label>
    <select id="vaName" class="va-select">${extra}
      ${t.length ? `<optgroup label="On today">${t.map(opt).join('')}</optgroup>` : ''}
      ${later.length ? `<optgroup label="Later this week">${later.map(opt).join('')}</optgroup>` : ''}
    </select>
    <p class="si-hint">Home is built around one person’s day: their spots, shift, zone and PEA.</p>`;
  const go = role === 'director' ? (vaAs ? 'Back to me' : 'This is you') : 'View';
  body.innerHTML = `
    <div class="va-roles" role="group" aria-label="Role">${VA_ROLES.map(([k, l]) => `<button type="button" class="va-role${k === role ? ' is-on' : ''}" data-va-role="${k}" aria-pressed="${k === role}">${escapeHtml(l)}</button>`).join('')}</div>
    ${person}
    <button type="button" class="btn btn-primary va-go" data-va-go ${role === 'director' && !vaAs ? 'disabled' : ''}>${go}</button>
    <p class="si-hint">Only you have this. It’s a look only: nothing you change while viewing as someone is saved, and a reload is you again.</p>`;
}
