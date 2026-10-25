// ===== ACCOUNTS: WHO'S SIGNED IN (Tim, Oct 17 2026) =====
// Two sign-ins on the PIN screen, beside the manager and director PINs:
//  - Sign in with Google (directors: a cfabuda.com address, or an address the
//    owner listed). Google's button comes from its script, loaded only when
//    the server says Google sign-in is set up (GOOGLE_CLIENT_ID).
//  - A team member's 6-digit clock-in PIN, from the list the owner uploads
//    in Manage → Settings → Accounts (name, PIN, role).
// The server (app.py, ACCOUNTS) checks both and says who it is and their
// role; the page shows the name and fills the initials badge from it.
// MANAGE IS FOR DIRECTORS AND UP ONLY (Tim, Oct 18 2026): a store Google
// account, or the manager and director PINs. A team PIN (Team Lead, Trainer
// or Team Member) signs the person in by name and never opens Manage; they
// stay on the team view until the store's close.
// Manage → Settings → Accounts is the owner's (Tim): the Google accounts
// list, and the team PIN list (names and roles only; PINs are never shown).

let acUser = null;          // {name, role, via} from the server, or null
let acOwner = false;
// Google's client ID comes in the page (app.py _page_html), so the button
// shows even when the status check is slow or fails.
let acGoogleClientId = (document.querySelector('meta[name="google-client-id"]') || {}).content || '';
const acGoogleHd = (document.querySelector('meta[name="google-hd"]') || {}).content || '';
let acGoogleMode = '';      // how Google's script was set up: 'button', or 'tap' (one tap)
let acAccounts = null;      // the owner's lists, once loaded
let acPinRows = null;       // rows read from the pasted or dropped list, before upload
let acPinUnread = [];       // names in a PDF report whose PIN couldn't be told apart
let acPinSaving = false;    // a PIN list save waiting on the server
let acPinFromPdf = false;   // the rows came from the PIN report PDF: show them to check
let acPinBusy = false;

const AC_ROLE_LABELS = {director: 'Director', manager: 'Manager PIN', lead: 'Team Lead', trainer: 'Trainer', member: 'Team Member', admin: 'Admin Team'};
const acRoleLabel = r => AC_ROLE_LABELS[r] || r || '';

// ----- Status from the server -----
function acApplyStatus(d){
  acUser = d && d.user && d.user.name !== undefined ? d.user : null;
  acOwner = !!(d && d.isOwner);
  acGoogleClientId = (d && d.googleClientId) || acGoogleClientId;
  siIdentity = {name: (acUser && acUser.name) || (d && d.isManager ? 'Director' : ''), role: acUser ? acUser.role : '',
                device: (d && d.device) || '', required: !!(d && d.requireSignIn), known: true};
  acRenderGate();
  acRenderSettings();
  if(typeof siRender === 'function') siRender();
  // Nobody signed in on this phone (and it isn't a shared device): the
  // sign-in sheet, not the initials box (Tim, Oct 25 2026: initials are on
  // their way out), on a phone with no initials yet, once a day. Otherwise
  // a director's store Google account gets Google's one tap.
  if(!siIdentity.name && !siIdentity.device){
    if(!getInitials() && typeof siAskToday === 'function' && siAskToday()) siOpen();
    else afterIdle(acOneTap);
  }
  if(typeof renderRightNow === 'function') renderRightNow();   // the card is the signed-in person's
  if(typeof scSyncVisibility === 'function') scSyncVisibility();   // Safe Count: not for Team Members or Trainers
}
function acInitials(name){
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : (parts[0] || '').slice(0, 2).toUpperCase();
}

// After any sign-in (PIN or Google): the server's reply says who and what.
async function acSignedIn(result, stay){
  acUser = {name: result.name || '', role: result.role, via: result.via || 'pin'};
  acOwner = !!result.owner;
  siIdentity = Object.assign({}, siIdentity, {name: acUser.name || (result.manager ? 'Director' : ''), role: acUser.role, known: true});
  if(typeof siRender === 'function') siRender();
  if(result.manager){
    await stateLoaded;
    await launchSetManager(true);
    document.getElementById('pinGate').style.display = 'none';
    document.getElementById('manageContent').style.display = 'block';
    renderManage();
    if(typeof tpRefreshDirector === 'function') tpRefreshDirector();
  } else {
    // A trainer or team member: the team view, signed in by name.
    document.getElementById('pinInput').value = '';
    showToast(`Signed in as ${acUser.name || 'team member'} · ${acRoleLabel(acUser.role)}`);
    // From the sign-in sheet (sign-in.js): stay on the page they were using.
    if(!stay && typeof launchShowTab === 'function') launchShowTab('home');
  }
  acRenderGate();
  acRenderSettings();
  // Again now Manage is open: the sign-in card is a manager's (Tim, Oct 25
  // 2026: Settings showed only Launch mode and Full Backup until a reload).
  if(typeof siRender === 'function') siRender();
  if(typeof scSyncVisibility === 'function') scSyncVisibility();   // Safe Count: not for Team Members or Trainers
}

async function acSignOut(device){
  try{ await fetch(`${API_BASE}/api/manager/logout`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({device: !!device})}); }catch(err){ /* offline: signed out here; the server's sign-in ends when it next hears */ }
  acUser = null; acOwner = false;
  location.reload();
}

// ----- The PIN screen -----
function acRenderGate(){
  const gate = document.getElementById('pinGate');
  if(!gate) return;
  let extra = document.getElementById('acGateExtra');
  if(!extra){
    extra = document.createElement('div');
    extra.id = 'acGateExtra';
    extra.className = 'ac-gate';
    gate.appendChild(extra);
  }
  const teamUser = acUser && ['lead', 'trainer', 'member', 'admin'].includes(acUser.role);
  extra.innerHTML = `
    ${teamUser ? `<p class="ac-signed">Signed in as <b>${escapeHtml(acUser.name)}</b> · ${escapeHtml(acRoleLabel(acUser.role))}. Manage is for directors. <button type="button" class="ld-link" data-ac-signout>Sign out</button></p>` : ''}
    ${acGoogleClientId ? `<div class="ac-or"><span>or</span></div><div id="acGoogleBtn" class="ac-google"></div><p class="ac-hint">Directors sign in with their store Google account.</p>` : ''}`;
  if(acGoogleClientId) acMountGoogle();
}

// Google's script, once, and only when it's needed: a sign-in screen
// showing, or one tap (not on every page load).
function acGsiReady(){ return !!(window.google && google.accounts && google.accounts.id); }
function acLoadGsi(onload, onerror){
  if(acGsiReady()){ onload(); return; }
  const old = document.getElementById('acGsi');
  if(old && !old.dataset.failed){ old.addEventListener('load', onload, {once: true}); if(onerror) old.addEventListener('error', onerror, {once: true}); return; }
  if(old) old.remove();
  const s = document.createElement('script');
  s.id = 'acGsi'; s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
  s.addEventListener('load', onload, {once: true});
  s.addEventListener('error', () => { s.dataset.failed = '1'; if(onerror) onerror(); }, {once: true});
  document.head.appendChild(s);
}

// Google's button in each sign-in screen showing: Manage's PIN screen and
// the sign-in sheet (sign-in.js). A host that isn't on screen is drawn when
// it is (navigation.js, siOpen). If Google's script doesn't load, "Try
// again" asks for it once more, no reload needed. The button takes any
// director's Google account (the owner can list ones outside the store's
// domain), so one tap's domain limit is undone first.
const AC_GOOGLE_HOSTS = ['acGoogleBtn', 'siGoogleBtn'];
function acMountGoogle(){
  if(!acGoogleClientId) return;
  const hosts = AC_GOOGLE_HOSTS.map(id => document.getElementById(id)).filter(h => h && h.offsetParent !== null && !h.childElementCount);
  if(!hosts.length) return;
  acLoadGsi(() => {
    if(!acGsiReady()) return;
    if(acGoogleMode !== 'button'){
      if(acGoogleMode === 'tap') google.accounts.id.cancel();
      google.accounts.id.initialize({client_id: acGoogleClientId, callback: acGoogleCallback, auto_select: false, cancel_on_tap_outside: true});
      acGoogleMode = 'button';
    }
    hosts.filter(h => document.body.contains(h)).forEach(h => {
      h.innerHTML = '';
      google.accounts.id.renderButton(h, {type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: 260});
    });
  }, () => {
    hosts.forEach(h => { h.innerHTML = '<p class="ac-hint">Google sign-in didn’t load. <button type="button" class="ld-link" data-ac-google-retry>Try again</button></p>'; });
  });
}
document.addEventListener('click', e => {
  if(!e.target.closest('[data-ac-google-retry]')) return;
  AC_GOOGLE_HOSTS.forEach(id => { const h = document.getElementById(id); if(h) h.innerHTML = ''; });
  acMountGoogle();
});

// One tap (Tim, Oct 25 2026): a phone or computer already signed in to a
// store Google account (the one director domain, hd) gets Google's
// "Continue as …" without opening anything. Only when nobody is signed in
// here and it isn't a shared device, once a page load, after the page is
// quiet; Google itself waits longer each time it's closed. A team member's
// personal Gmail is never offered.
let acOneTapTried = false;
function acOneTap(){
  if(acOneTapTried || !acGoogleClientId || !acGoogleHd) return;
  if(!siIdentity.known || siIdentity.name || siIdentity.device) return;
  acOneTapTried = true;
  acLoadGsi(() => {
    if(!acGsiReady() || acGoogleMode === 'button' || siIdentity.name) return;   // a sign-in screen is up: its button
    google.accounts.id.initialize({client_id: acGoogleClientId, callback: acGoogleCallback, hd: acGoogleHd, auto_select: false,
      cancel_on_tap_outside: true, itp_support: true, use_fedcm_for_prompt: true, context: 'signin'});
    acGoogleMode = 'tap';
    google.accounts.id.prompt();
  });
}

async function acGoogleCallback(resp){
  // From the sign-in sheet: stay on the page they were using.
  const sheet = document.getElementById('siSheet');
  const fromSheet = !!(sheet && sheet.classList.contains('active'));
  AC_GOOGLE_HOSTS.forEach(id => { const h = document.getElementById(id); if(h) h.innerHTML = '<p class="ac-hint">Checking with Google…</p>'; });
  try{
    const res = await fetch(`${API_BASE}/api/auth/google`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({credential: resp && resp.credential})});
    const d = await res.json().catch(() => ({}));
    if(!res.ok || !d.success) throw new Error(d.error || 'Google sign-in didn’t work.');
    await acSignedIn(Object.assign({via: 'google'}, d), fromSheet);
    if(fromSheet && typeof siClose === 'function') siClose();
    if(d.manager) showToast(`Signed in as ${d.name || 'Director'}`);   // a team sign-in says so itself (acSignedIn)
  }catch(err){
    showToast(err.message);
    acRenderGate();
    if(fromSheet && typeof siDraw === 'function') siDraw();
  }
}

// ----- Manage → Settings → Accounts (owner only) -----
function acRenderSettings(){
  const root = document.getElementById('accountsRoot'), card = document.getElementById('accountsCard');
  if(!root || !card) return;
  card.style.display = acOwner ? '' : 'none';
  if(!acOwner) return;
  if(!acAccounts){ root.innerHTML = '<p class="dir-empty">Loading…</p>'; acLoadAccounts(); return; }
  const A = acAccounts;
  root.innerHTML = `
    <h4>Sign in with Google</h4>
    <p class="dir-note">${A.googleReady ? 'On.' : '<b>Not set up yet:</b> set GOOGLE_CLIENT_ID on the server.'} Anyone at ${A.directorDomains.map(d => `<b>@${escapeHtml(d)}</b>`).join(', ') || 'no domain'} signs in as a director. Owner${A.owners.length === 1 ? '' : 's'}: ${A.owners.map(escapeHtml).join(', ') || 'none set (ACCOUNT_OWNER_EMAILS)'}.</p>
    <p class="dir-note">Other Google accounts that sign in as directors (Manage is for directors and up):</p>
    ${A.google.length ? `<ul class="ev-m-list">${A.google.map(a => `<li class="ev-m-row"><div class="ev-m-main"><b>${escapeHtml(a.email)}</b><small>${escapeHtml([a.name, acRoleLabel(a.role)].filter(Boolean).join(' · '))}</small></div><button type="button" class="dir-x" data-ac-google-del="${escapeHtml(a.email)}" aria-label="Remove ${escapeHtml(a.email)}">${UO_X_ICON}</button></li>`).join('')}</ul>` : '<p class="dir-empty">None yet.</p>'}
    <form class="ac-form" id="acGoogleForm">
      <input type="email" id="acGEmail" placeholder="email@example.com" required maxlength="120" autocomplete="off">
      <input type="text" id="acGName" placeholder="Name (optional)" maxlength="80" autocomplete="off">
      <button type="submit" class="btn btn-primary dir-btn">Add a director</button>
    </form>
    <h4>Team clock-in PINs</h4>
    <p class="dir-note">A team member types their 6-digit clock-in PIN on the PIN screen and the hub knows who they are and their role. Pick the store’s PIN report (PDF), or paste the list or pick a CSV: one person a line, <b>Name, PIN, Role</b> (Team Member, Trainer, Team Lead or Admin Team). A clock-in PIN never opens Manage, whatever the role. Only names and roles are kept here; the PINs themselves are never stored or shown.</p>
    ${A.pins.length ? `<details class="tp-log"><summary>${A.pins.length} on the list</summary><ul class="ev-m-list">${A.pins.map(p => `<li class="ev-m-row"><div class="ev-m-main"><b>${escapeHtml(p.name)}</b><small>${escapeHtml(acRoleLabel(p.role))}</small></div><button type="button" class="dir-x" data-ac-pin-del="${escapeHtml(p.name)}" aria-label="Remove ${escapeHtml(p.name)}">${UO_X_ICON}</button></li>`).join('')}</ul></details>` : '<p class="dir-empty">No team PINs yet.</p>'}
    <form class="ac-form ac-pins" id="acPinForm">
      <textarea id="acPinText" rows="4" placeholder="Jordan Testcase, 123456, Team Member&#10;Riley Sample, 234567, Trainer" spellcheck="false"></textarea>
      <div class="ac-pin-row"><label class="ac-file"><input type="file" id="acPinFile" accept=".pdf,application/pdf,.csv,.txt,text/csv,text/plain"> ${acPinBusy ? 'Reading…' : 'Pick the PIN report or a CSV'}</label>
        <label class="ac-replace"><input type="checkbox" id="acPinReplace"> Replace the whole list</label></div>
      ${acPinRows ? acPinPreviewHtml() : ''}
      <button type="submit" class="btn btn-primary dir-btn">Save PINs</button>
    </form>
    <p class="dir-note" id="acPinMsg" role="status"></p>`;
}
async function acLoadAccounts(){
  try{
    const res = await fetch(`${API_BASE}/api/accounts`);
    const d = await res.json().catch(() => ({}));
    if(res.status === 403){ acOwner = false; acRenderSettings(); return; }
    if(!res.ok) throw new Error(d.error || 'Couldn’t load the accounts.');
    acAccounts = d;
  }catch(err){
    acAccounts = null;
    const root = document.getElementById('accountsRoot');
    if(root) root.innerHTML = `<p class="dir-empty">${escapeHtml(err.message)}</p>`;
    return;
  }
  acRenderSettings();
}
// The rows read from the PIN report, to check before saving: each name, the
// PIN's last two digits only, and the role, which can be changed here (the
// report may not say; names on Manage → Settings → Leaders start as Team
// Lead). A Director is skipped on save: directors sign in with Google.
const AC_PIN_ROLES = ['Team Member', 'Trainer', 'Team Lead', 'Admin Team', 'Director'];
function acPinPreviewHtml(){
  const rows = acPinRows || [];
  if(!acPinFromPdf) return `<p class="dir-note">${rows.length} row${rows.length === 1 ? '' : 's'} read from the file.</p>`;
  const count = r => rows.filter(x => x.role === r).length;
  return `
    <div class="ac-pin-check">
      <p class="dir-note"><b>${rows.length} people read from the report.</b> Check the names and roles, then Save PINs. ${AC_PIN_ROLES.filter(count).map(r => `${count(r)} ${r}${count(r) === 1 ? '' : 's'}`).join(' · ')}</p>
      ${acPinUnread.length ? `<p class="dir-note ac-pin-warn">No clear PIN for: ${acPinUnread.map(escapeHtml).join(', ')}. Add them in the box below as Name, PIN, Role.</p>` : ''}
      <ul class="ac-pin-list">${rows.map((r, i) => `
        <li class="ac-pin-item${r.role === 'Director' ? ' is-skip' : ''}">
          <span class="ac-pin-name"><b>${escapeHtml(r.name)}</b><small>PIN ••••${escapeHtml(String(r.pin).slice(-2))}${r.why ? ` · ${escapeHtml(r.why)}` : ''}</small></span>
          <select data-ac-pin-role="${i}" aria-label="Role for ${escapeHtml(r.name)}">${AC_PIN_ROLES.map(x => `<option${x === r.role ? ' selected' : ''}>${x}</option>`).join('')}</select>
          <button type="button" class="dir-x" data-ac-pin-drop="${i}" aria-label="Leave ${escapeHtml(r.name)} out">${UO_X_ICON}</button>
        </li>`).join('')}</ul>
    </div>`;
}

// Names on the Leaders list start as Team Lead when the report gave no role.
function acPinLeaderRoles(rows){
  const listed = typeof ldListDecides === 'function' && ldListDecides() && typeof ldRoster === 'function'
    ? new Set(ldRoster().filter(r => r && r.name).map(r => dirKey(r.name))) : new Set();
  return rows.map(r => !r.roleFromReport && listed.has(dirKey(r.name)) ? {...r, role: 'Team Lead', why: 'on the Leaders list'} : {...r, why: r.roleFromReport ? '' : 'no role in the report'});
}

async function acReadPinReport(file){
  acPinBusy = true; acRenderSettings();
  try{
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_BASE}/api/accounts/pins/read`, {method: 'POST', body: fd});
    const d = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(d.error || 'The report couldn’t be read.');
    if(!d.rows.length) throw new Error('No names with a 6-digit PIN were found in that report.');
    acPinRows = acPinLeaderRoles(d.rows);
    acPinUnread = d.unread || [];
    acPinFromPdf = true;
  }catch(err){
    showToast(err.message);
  }finally{
    acPinBusy = false;
    acRenderSettings();
  }
}

// "Name, PIN, Role" lines (a header line is skipped) → rows.
function acParsePinList(text){
  const rows = [];
  String(text || '').split(/\r?\n/).forEach(line => {
    const cells = line.split(/[,\t;]/).map(c => c.replace(/^"|"$/g, '').trim());
    if(cells.length < 2 || !cells.some(Boolean)) return;
    if(/^name$/i.test(cells[0]) && !/^\d{6}$/.test(cells[1] || '')) return;
    rows.push({name: cells[0], pin: cells[1], role: cells[2] || 'Team Member'});
  });
  return rows;
}
async function acPost(url, method, body){
  const res = await fetch(`${API_BASE}${url}`, {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body || {})});
  const d = await res.json().catch(() => ({}));
  if(!res.ok) throw new Error(d.error || 'That didn’t save.');
  return d;
}

document.addEventListener('click', async e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t) return;
  if(t.closest('[data-ac-signout]')){ acSignOut(); return; }
  if(!t.closest('#accountsRoot')) return;
  const g = t.closest('[data-ac-google-del]');
  if(g){
    if(!confirm(`Remove ${g.dataset.acGoogleDel} from the list?`)) return;
    try{ acAccounts = await acPost('/api/accounts/google', 'DELETE', {email: g.dataset.acGoogleDel}); acRenderSettings(); }catch(err){ showToast(err.message); }
    return;
  }
  const drop = t.closest('[data-ac-pin-drop]');
  if(drop && acPinRows){
    acPinRows.splice(+drop.dataset.acPinDrop, 1);
    if(!acPinRows.length){ acPinRows = null; acPinFromPdf = false; }
    acRenderSettings();
    return;
  }
  const p = t.closest('[data-ac-pin-del]');
  if(p){
    if(!confirm(`Remove ${p.dataset.acPinDel}'s PIN from the list?`)) return;
    try{ acAccounts = await acPost('/api/accounts/pins', 'DELETE', {name: p.dataset.acPinDel}); acRenderSettings(); }catch(err){ showToast(err.message); }
  }
});
document.addEventListener('change', async e => {
  if(!e.target || e.target.id !== 'acPinFile') return;
  const f = e.target.files && e.target.files[0];
  if(!f) return;
  if(f.type === 'application/pdf' || /\.pdf$/i.test(f.name)){ acReadPinReport(f); return; }
  acPinRows = acParsePinList(await f.text());
  acPinFromPdf = false; acPinUnread = [];
  acRenderSettings();
});
document.addEventListener('change', e => {
  const sel = e.target && e.target.closest ? e.target.closest('[data-ac-pin-role]') : null;
  if(!sel || !acPinRows) return;
  const r = acPinRows[+sel.dataset.acPinRole];
  // No redraw: it would clear anything typed in the box below.
  if(r){ r.role = sel.value; r.why = ''; sel.closest('.ac-pin-item').classList.toggle('is-skip', r.role === 'Director'); }
});
document.addEventListener('submit', async e => {
  if(e.target.id === 'acGoogleForm'){
    e.preventDefault();
    const email = document.getElementById('acGEmail').value.trim(), name = document.getElementById('acGName').value.trim();
    try{ acAccounts = await acPost('/api/accounts/google', 'POST', {email, name}); acRenderSettings(); showToast('Added'); }catch(err){ showToast(err.message); }
    return;
  }
  if(e.target.id !== 'acPinForm') return;
  e.preventDefault();
  if(acPinSaving) return;                       // one save at a time
  const typed = acParsePinList(document.getElementById('acPinText').value);
  const rows = [...(acPinRows || []).map(r => ({name: r.name, pin: r.pin, role: r.role})), ...typed];
  const msg = document.getElementById('acPinMsg');
  if(!rows.length){ if(msg) msg.textContent = 'Paste the list or pick a file first.'; return; }
  const replace = document.getElementById('acPinReplace').checked;
  if(replace && !confirm(`Replace the whole team PIN list with these ${rows.length}?`)) return;
  // Shows it's working until the server answers (Tim, Oct 20 2026: a save
  // looked like it did nothing).
  const btn = e.target.querySelector('button[type="submit"]');
  acPinSaving = true;
  if(btn){ btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Saving…'; }
  if(msg) msg.textContent = `Saving ${rows.length} PIN${rows.length === 1 ? '' : 's'}…`;
  try{
    const d = await acPost('/api/accounts/pins', 'POST', {rows, replace});
    acAccounts = d; acPinRows = null; acPinFromPdf = false; acPinUnread = [];
    acRenderSettings();
    const m = document.getElementById('acPinMsg');
    if(m) m.textContent = `${d.added} saved${d.skipped.length ? ` · ${d.skipped.length} skipped: ${d.skipped.slice(0, 5).join('; ')}${d.skipped.length > 5 ? '…' : ''}` : ''}`;
    showToast(`${d.added} team PIN${d.added === 1 ? '' : 's'} saved`);
  }catch(err){
    const m = document.getElementById('acPinMsg');
    if(m) m.textContent = `Not saved: ${err.message}`;
    showToast(err.message);
  }finally{
    acPinSaving = false;
    if(btn && btn.isConnected){ btn.disabled = false; btn.textContent = btn.dataset.label || 'Save PINs'; }
  }
});

// Manage's PIN screen with Google's button from the start, before (or
// without) the status check.
acRenderGate();
