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
let acGoogleClientId = '';
let acGoogleReady = false;
let acAccounts = null;      // the owner's lists, once loaded
let acPinRows = null;       // rows read from the pasted or dropped list, before upload

const AC_ROLE_LABELS = {director: 'Director', manager: 'Manager PIN', lead: 'Team Lead', trainer: 'Trainer', member: 'Team Member'};
const acRoleLabel = r => AC_ROLE_LABELS[r] || r || '';

// ----- Status from the server -----
function acApplyStatus(d){
  acUser = d && d.user && d.user.name !== undefined ? d.user : null;
  acOwner = !!(d && d.isOwner);
  acGoogleClientId = (d && d.googleClientId) || '';
  acRenderGate();
  acRenderSettings();
  if(acUser && acUser.name && typeof setInitials === 'function' && !getInitials()) setInitials(acInitials(acUser.name));
  if(typeof renderRightNow === 'function') renderRightNow();   // the card is the signed-in person's
}
function acInitials(name){
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : (parts[0] || '').slice(0, 2).toUpperCase();
}

// After any sign-in (PIN or Google): the server's reply says who and what.
async function acSignedIn(result){
  acUser = {name: result.name || '', role: result.role, via: result.via || 'pin'};
  acOwner = !!result.owner;
  if(acUser.name && typeof setInitials === 'function') setInitials(acInitials(acUser.name));
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
    if(typeof launchShowTab === 'function') launchShowTab('home');
  }
  acRenderGate();
  acRenderSettings();
}

async function acSignOut(){
  try{ await fetch(`${API_BASE}/api/manager/logout`, {method: 'POST'}); }catch(err){ /* offline: the server session ends at close anyway */ }
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
  const teamUser = acUser && ['lead', 'trainer', 'member'].includes(acUser.role);
  extra.innerHTML = `
    ${teamUser ? `<p class="ac-signed">Signed in as <b>${escapeHtml(acUser.name)}</b> · ${escapeHtml(acRoleLabel(acUser.role))}. Manage is for directors. <button type="button" class="ld-link" data-ac-signout>Sign out</button></p>` : ''}
    ${acGoogleClientId ? `<div class="ac-or"><span>or</span></div><div id="acGoogleBtn" class="ac-google"></div><p class="ac-hint">Directors sign in with their store Google account.</p>` : ''}`;
  if(acGoogleClientId) acMountGoogle();
}

// Google's script, once; then its button in the gate.
function acMountGoogle(){
  const host = document.getElementById('acGoogleBtn');
  if(!host) return;
  const render = () => {
    if(!(window.google && google.accounts && google.accounts.id)) return;
    if(!acGoogleReady){
      google.accounts.id.initialize({client_id: acGoogleClientId, callback: acGoogleCallback, auto_select: false, cancel_on_tap_outside: true});
      acGoogleReady = true;
    }
    host.innerHTML = '';
    google.accounts.id.renderButton(host, {type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: 260});
  };
  if(window.google && google.accounts && google.accounts.id){ render(); return; }
  if(document.getElementById('acGsi')){ document.getElementById('acGsi').addEventListener('load', render, {once: true}); return; }
  const s = document.createElement('script');
  s.id = 'acGsi'; s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
  s.onload = render;
  s.onerror = () => { host.innerHTML = '<p class="ac-hint">Google sign-in didn’t load. Check the connection and reload.</p>'; };
  document.head.appendChild(s);
}
async function acGoogleCallback(resp){
  const host = document.getElementById('acGoogleBtn');
  if(host) host.innerHTML = '<p class="ac-hint">Checking with Google…</p>';
  try{
    const res = await fetch(`${API_BASE}/api/auth/google`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({credential: resp && resp.credential})});
    const d = await res.json().catch(() => ({}));
    if(!res.ok || !d.success) throw new Error(d.error || 'Google sign-in didn’t work.');
    await acSignedIn(Object.assign({via: 'google'}, d));
  }catch(err){
    showToast(err.message);
    acRenderGate();
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
    <p class="dir-note">A team member types their 6-digit clock-in PIN on the PIN screen and the hub knows who they are and their role. Paste the list below or drop a CSV: one person a line, <b>Name, PIN, Role</b> (Team Member, Trainer or Team Lead). A clock-in PIN never opens Manage, whatever the role. Only names and roles are kept here; the PINs themselves are never stored or shown.</p>
    ${A.pins.length ? `<details class="tp-log"><summary>${A.pins.length} on the list</summary><ul class="ev-m-list">${A.pins.map(p => `<li class="ev-m-row"><div class="ev-m-main"><b>${escapeHtml(p.name)}</b><small>${escapeHtml(acRoleLabel(p.role))}</small></div><button type="button" class="dir-x" data-ac-pin-del="${escapeHtml(p.name)}" aria-label="Remove ${escapeHtml(p.name)}">${UO_X_ICON}</button></li>`).join('')}</ul></details>` : '<p class="dir-empty">No team PINs yet.</p>'}
    <form class="ac-form ac-pins" id="acPinForm">
      <textarea id="acPinText" rows="4" placeholder="Jordan Testcase, 123456, Team Member&#10;Riley Sample, 234567, Trainer" spellcheck="false"></textarea>
      <div class="ac-pin-row"><label class="ac-file"><input type="file" id="acPinFile" accept=".csv,.txt,text/csv,text/plain"> Pick a CSV</label>
        <label class="ac-replace"><input type="checkbox" id="acPinReplace"> Replace the whole list</label></div>
      ${acPinRows ? `<p class="dir-note">${acPinRows.length} row${acPinRows.length === 1 ? '' : 's'} read from the file.</p>` : ''}
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
  acPinRows = acParsePinList(await f.text());
  acRenderSettings();
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
  const typed = acParsePinList(document.getElementById('acPinText').value);
  const rows = [...(acPinRows || []), ...typed];
  const msg = document.getElementById('acPinMsg');
  if(!rows.length){ if(msg) msg.textContent = 'Paste the list or pick a file first.'; return; }
  const replace = document.getElementById('acPinReplace').checked;
  if(replace && !confirm(`Replace the whole team PIN list with these ${rows.length}?`)) return;
  try{
    const d = await acPost('/api/accounts/pins', 'POST', {rows, replace});
    acAccounts = d; acPinRows = null;
    acRenderSettings();
    const m = document.getElementById('acPinMsg');
    if(m) m.textContent = `${d.added} saved${d.skipped.length ? ` · ${d.skipped.length} skipped: ${d.skipped.slice(0, 5).join('; ')}${d.skipped.length > 5 ? '…' : ''}` : ''}`;
    showToast(`${d.added} team PIN${d.added === 1 ? '' : 's'} saved`);
  }catch(err){ showToast(err.message); }
});
