// ===== SIGN IN TO CHANGE ANYTHING (TIM-90; Tim, Oct 25 2026) =====
// Who's signed in is who the hub writes on what they do (no more typed
// initials), and once a director turns on "Require sign-in" (Manage →
// Settings), a device nobody signed in on can look but not change. The
// server holds to the same rules (app.py, _may_change); this page asks for a
// PIN first instead of letting a change bounce:
//  - the badge top right: who's signed in, or "Sign in"; tapping it opens
//    the sign-in sheet over the page they're on
//  - a change their sign-in can't make is put back and the sheet says why
//  - Manage → Settings: the switch, the shared store devices, and making
//    the device in hand one ("Kitchen iPad": waste, zone resets and the Prep
//    Board without a PIN, signed as the device)
// A personal phone stays signed in until someone signs out.

// What each sign-in may change with sign-in required: the same lists as
// app.py (MEMBER_SECTIONS, DEVICE_KEYS; tests/test_sign_in_required.py checks).
const SI_MEMBER_SECTIONS = ['waste', 'ops', 'prep', 'prepLive', 'prepTimes', 'history', 'misc'];
const SI_DEVICE_EXTRA_KEYS = ['zoneChecklistState', 'zoneChecklistHistory', 'prepMade', 'prepTimes', 'prepTimers'];
let siReason = '';
let siBusy = false;
let siDevices = null;     // Manage: the shared devices, once loaded

function siSignedIn(){ return !!(siIdentity.name || (typeof launchManager !== 'undefined' && launchManager)); }
function siMayChange(key){
  if(!siIdentity.required) return true;
  if(typeof launchManager !== 'undefined' && launchManager) return true;
  const role = siIdentity.name ? siIdentity.role : '';
  if(role === 'lead' || role === 'admin' || role === 'director' || role === 'manager') return true;
  const section = STATE_SECTION_OF[key] || 'misc';
  if((role === 'member' || role === 'trainer') && SI_MEMBER_SECTIONS.includes(section)) return true;
  return !!siIdentity.device && ((STATE_SECTIONS.waste || []).includes(key) || SI_DEVICE_EXTRA_KEYS.includes(key));
}
// Why a change was put back, in a line.
function siWhy(keys){
  if(!siSignedIn() && !siIdentity.device) return 'Sign in with your clock-in PIN to make changes.';
  const sections = new Set(keys.map(k => STATE_SECTION_OF[k] || 'misc'));
  if(sections.has('setups') || sections.has('rosters')) return 'Team Leads change Set Ups. Sign in with your clock-in PIN.';
  if(sections.has('safe')) return 'Team Leads do the Safe Count. Sign in with your clock-in PIN.';
  return 'That needs your own sign-in. Sign in with your clock-in PIN.';
}

function siRender(){
  if(typeof renderInitialsBadge === 'function') renderInitialsBadge();
  const sheet = document.getElementById('siSheet');
  if(sheet && sheet.classList.contains('active')) siDraw();
  siRenderSettings();
}

// ----- The sheet -----
function siOpen(reason){
  // Opened by a change (waste, a zone check) with nobody signed in: say why.
  siReason = reason || (siIdentity.required && !siSignedIn() && !siIdentity.device ? 'Sign in with your clock-in PIN to make changes.' : '');
  const sheet = document.getElementById('siSheet');
  if(!sheet) return;
  siDraw();
  sheet.classList.add('active');
  const pin = document.getElementById('siPin');
  if(pin) setTimeout(() => pin.focus(), 50);
}
function siClose(){
  const sheet = document.getElementById('siSheet');
  if(sheet) sheet.classList.remove('active');
  siReason = '';
}
function siDraw(){
  const body = document.getElementById('siBody');
  if(!body) return;
  const roleLabel = typeof acRoleLabel === 'function' ? acRoleLabel(siIdentity.role) : '';
  const device = siIdentity.device ? `<p class="si-device">This is the <b>${escapeHtml(siIdentity.device)}</b>, a shared store device: it logs waste, zone resets and the Prep Board as itself.</p>` : '';
  const signedIn = siIdentity.name
    ? `<p class="si-who">Signed in as <b>${escapeHtml(siIdentity.name)}</b>${roleLabel ? ` · ${escapeHtml(roleLabel)}` : ''}</p>
       ${siIdentity.device ? '<p class="si-hint">After 10 minutes without a tap, this goes back to being the shared device.</p>' : ''}
       <button type="button" class="btn btn-ghost si-out" data-si-out>Sign out</button>`
    : '';
  // Signed in but this needs someone else (a Team Lead): their PIN right here.
  const handOver = siIdentity.name && siReason;
  body.innerHTML = `
    ${siReason ? `<p class="si-reason" role="alert">${escapeHtml(siReason)}</p>` : ''}
    ${device}
    ${signedIn && !handOver ? signedIn : `${handOver ? signedIn : ''}<form class="si-form" data-si-form>
      <label for="siPin">${handOver ? 'A Team Lead’s clock-in PIN' : 'Clock-in PIN'}</label>
      <input id="siPin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" required>
      <button type="submit" class="btn btn-primary" ${siBusy ? 'disabled' : ''}>Sign in</button>
      <p class="si-hint">Your 6-digit clock-in PIN. Directors can also sign in with Google in Manage.</p>
      ${siIdentity.required ? '' : '<button type="button" class="ld-link" data-si-initials>Use initials instead</button>'}
    </form>`}`;
}

async function siSignIn(pin){
  siBusy = true; siDraw();
  try{
    const res = await fetch(`${API_BASE}/api/manager/login`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({pin})});
    const data = await res.json().catch(() => ({}));
    if(!res.ok){ siReason = data.error || 'That PIN didn’t work.'; return; }
    await acSignedIn(Object.assign({via: 'pin'}, data), true);
    siClose();
  }catch(err){
    siReason = 'Couldn’t reach the hub. Check the connection and try again.';
  }finally{
    siBusy = false;
    if(document.getElementById('siSheet').classList.contains('active')) siDraw();
  }
}

document.addEventListener('submit', e => {
  const form = e.target.closest('[data-si-form]');
  if(!form) return;
  e.preventDefault();
  const pin = (document.getElementById('siPin') || {}).value || '';
  if(pin && !siBusy) siSignIn(pin.trim());
});
document.addEventListener('click', e => {
  if(e.target.closest('[data-si-close]') || e.target.id === 'siSheet'){ siClose(); return; }
  if(e.target.closest('[data-si-out]')){ acSignOut(); return; }
  if(e.target.closest('[data-si-initials]')){ siClose(); if(typeof editInitialsBox === 'function') editInitialsBox(); return; }
  const go = e.target.closest('[data-si-open]');
  if(go){ siOpen(); return; }
});

// ----- A change this sign-in can't make: put it back, and ask -----
// storage.js calls this as a save starts, so what it sends (and what it
// counts as sent) never holds a change the server would drop.
let siQuiet = false;      // the page's own upkeep at load (nobody tapped anything)
function siGateLocal(){
  if(!siIdentity.required) return;
  const current = stateSections(stateSnapshot()), parts = {}, blocked = [];
  Object.keys(current).forEach(name => {
    if(!(name in stateBase) || current[name] === savedSections[name]) return;
    const mine = JSON.parse(current[name]);
    stateDiff(stateBase[name] || {}, mine).forEach(op => {
      const key = op.p[0];
      if(siMayChange(key)) return;
      if(!blocked.includes(key)) blocked.push(key);
      parts[name] = parts[name] || mine;
      if(stateHas(stateBase[name], key)) parts[name][key] = JSON.parse(JSON.stringify(stateBase[name][key]));
      else delete parts[name][key];
    });
  });
  if(!blocked.length) return;
  stateAdoptLocal(parts);
  if(typeof stateRerender === 'function') stateRerender();
  if(!siQuiet) siOpen(siWhy(blocked));
}

// ----- Manage → Settings -----
function siRenderSettings(){
  const root = document.getElementById('signInRoot');
  if(!root) return;
  const manager = typeof launchManager !== 'undefined' && launchManager;
  const card = document.getElementById('signInCard');
  if(card) card.style.display = manager ? '' : 'none';
  if(!manager) return;
  if(siDevices === null){ siDevices = []; siLoadDevices(); }
  const gaps = typeof hcPinGaps === 'function' && typeof hcData !== 'undefined' && hcData ? hcPinGaps() : null;
  root.innerHTML = `
    <label class="launch-setting">
      <input type="checkbox" data-si-require ${siIdentity.required ? 'checked' : ''}>
      <span><b>${siIdentity.required ? 'On' : 'Off'}</b> — ${siIdentity.required ? 'every change needs a sign-in: a clock-in PIN, Google, or a shared store device.' : 'devices nobody signed in on can still make changes, signed with typed initials.'}</span>
    </label>
    <p class="dir-note">${gaps ? (gaps.missing.length ? `<b>${gaps.missing.length} on the schedule ${gaps.missing.length === 1 ? 'has' : 'have'} no PIN on file</b> (Our Team → PIN on file): they couldn’t make changes with this on.` : 'Everyone on the schedule has a PIN on file.') : 'Check Our Team → PIN on file before turning this on.'}</p>
    <h4>Shared store devices</h4>
    <p class="dir-note">A shared device (the kitchen iPad, a store phone) logs waste, zone resets and the Prep Board without a PIN, signed as the device. Anything else on it needs a personal PIN, which goes back to the device after 10 minutes without a tap.</p>
    ${siDevices.length ? `<ul class="ev-m-list">${siDevices.map(d => `<li class="ev-m-row"><div class="ev-m-main"><b>${escapeHtml(d.name)}</b><small>Added ${escapeHtml(d.addedAt ? new Date(d.addedAt * 1000).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : '')}${d.by ? ` by ${escapeHtml(d.by)}` : ''}</small></div><button type="button" class="dir-x" data-si-device-del="${escapeHtml(d.id)}" aria-label="Remove ${escapeHtml(d.name)}">${UO_X_ICON}</button></li>`).join('')}</ul>` : '<p class="dir-empty">None yet.</p>'}
    <form class="ac-form" data-si-device-form>
      <input type="text" id="siDeviceName" placeholder="This device’s name, e.g. Kitchen iPad" maxlength="40" required autocomplete="off">
      <button type="submit" class="btn btn-primary dir-btn">Make this a shared device</button>
    </form>
    <p class="dir-note">This signs you out on this device; it stays signed in as the device until it’s removed here.</p>`;
}
async function siLoadDevices(){
  try{
    const res = await fetch(`${API_BASE}/api/devices`);
    if(res.ok){ siDevices = (await res.json()).devices || []; siRenderSettings(); }
  }catch(err){ /* shown as none; Manage can be reopened */ }
}
document.addEventListener('change', async e => {
  if(!e.target.matches('[data-si-require]')) return;
  const on = e.target.checked;
  if(on && !confirm('Require sign-in for every change? Anyone without a PIN on file won’t be able to log waste or make changes.')){ e.target.checked = false; return; }
  try{
    const res = await fetch(`${API_BASE}/api/settings/sign-in`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({requireSignIn: on})});
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Couldn’t save.');
    siIdentity.required = !!data.requireSignIn;
    showToast(siIdentity.required ? 'Sign-in is required for every change' : 'Sign-in is no longer required');
  }catch(err){
    e.target.checked = !on;
    showToast(err.message || 'Couldn’t reach the hub.');
  }
  siRender();
});
document.addEventListener('submit', async e => {
  if(!e.target.closest('[data-si-device-form]')) return;
  e.preventDefault();
  const name = (document.getElementById('siDeviceName') || {}).value || '';
  if(!name.trim()) return;
  if(!confirm(`Make this device "${name.trim()}"? You'll be signed out here, and it stays signed in as the device.`)) return;
  try{
    const res = await fetch(`${API_BASE}/api/devices`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: name.trim()})});
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Couldn’t save.');
    location.reload();
  }catch(err){ showToast(err.message || 'Couldn’t reach the hub.'); }
});
document.addEventListener('click', async e => {
  const del = e.target.closest('[data-si-device-del]');
  if(!del) return;
  const d = (siDevices || []).find(x => x.id === del.dataset.siDeviceDel);
  if(!d || !confirm(`Remove ${d.name}? It's signed out within a minute.`)) return;
  try{
    const res = await fetch(`${API_BASE}/api/devices`, {method: 'DELETE', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: d.id})});
    if(res.ok){ siDevices = (await res.json()).devices || []; siRenderSettings(); }
  }catch(err){ showToast('Couldn’t reach the hub.'); }
});
