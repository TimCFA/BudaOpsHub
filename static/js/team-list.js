// ===== THE TEAM LIST (Manage → Directors; Tim, Oct 23 2026) =====
// One list of everyone at Buda, each with their role, in place of the
// separate Directors and Leaders lists:
//  - The directors and the Managing Partner (`directors`, names as
//    HotSchedules has them, for their Administrative shifts). They sign in
//    with Google, the director PIN, or their own clock-in PIN: a name on this
//    list makes that PIN a director's sign-in (app.py _pin_role; Tim, Oct 25
//    2026).
//  - Everyone on the clock-in PIN list (the store's PIN report, read through
//    /api/team/headcount; the PINs never leave the server), with their role:
//    Admin Team, Team Lead, Trainer or Team Member. Changing it here changes
//    what they see when they sign in (/api/team/role).
//  - A Team Lead's focus (Stewardship, Talent, Drive-Thru…) is their PEC
//    role card, kept on the hub's leader list (`leaderRoster`), which is
//    what Set Ups, the Leaders page and the Directors brief count as
//    leaders. Setting someone Team Lead here adds them to it; another role
//    takes them off. When the two disagree (the list was kept by hand
//    before), a banner offers to make them match.

const TL_ROLES = {director: 'Director', mp: 'Managing Partner', admin: 'Admin Team', lead: 'Team Lead', trainer: 'Trainer', member: 'Team Member'};
const TL_ORDER = ['director', 'mp', 'admin', 'lead', 'trainer', 'member'];
const TL_TEAM_ROLES = ['admin', 'lead', 'trainer', 'member'];
let tlFilter = 'all';
let tlSearch = '';
let tlSaving = '';       // the name whose role is being saved
let tlError = '';
let tlRowsShown = [];    // the rows as last drawn (a row's key is its place in them)

function tlSame(a, b){
  if(typeof rnSame === 'function') return rnSame(a, b);
  const k = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return k(a) === k(b);
}
function tlLeaders(){ return Array.isArray(leaderRoster) ? leaderRoster : []; }
function tlLeaderFor(name){ return tlLeaders().find(r => r && tlSame(r.name, name)) || null; }

// Everyone, in role order: [{kind: 'director' | 'pin' | 'leader', name, role, i}].
function tlPeople(){
  const team = typeof hcData !== 'undefined' && hcData && Array.isArray(hcData.team) ? hcData.team : null;
  const rows = dirList().map((d, i) => ({kind: 'director', i, name: d.name || '', role: /managing partner/i.test(d.title || '') ? 'mp' : 'director'}));
  (team || []).forEach(p => {
    if(rows.some(r => r.kind === 'director' && r.name && tlSame(r.name, p.name))) return;
    rows.push({kind: 'pin', name: p.name, role: TL_TEAM_ROLES.includes(p.role) ? p.role : 'member'});
  });
  // On the leader list but not on the PIN list (or a director): kept, marked.
  if(team) tlLeaders().forEach((r, i) => {
    if(r && r.name && !rows.some(x => x.name && tlSame(x.name, r.name))) rows.push({kind: 'leader', i, name: r.name, role: 'lead'});
  });
  const at = r => TL_ORDER.indexOf(r.role);
  rows.sort((a, b) => (a.kind === 'director' && !a.name ? 1 : 0) - (b.kind === 'director' && !b.name ? 1 : 0) || at(a) - at(b) || a.name.localeCompare(b.name));
  return {rows, loaded: !!team};
}

// Where the leader list and the roles disagree.
function tlMismatch(rows){
  const missing = rows.filter(r => r.kind === 'pin' && r.role === 'lead' && !tlLeaderFor(r.name));
  const extra = rows.filter(r => r.kind === 'pin' && r.role !== 'lead' && tlLeaderFor(r.name));
  return {missing, extra};
}

// A Team Lead's focus: what's picked, and every choice once opened.
const tlFocusOpen = new Set();   // names whose focus choices are open
function tlFocusHtml(r, key){
  const entry = tlLeaderFor(r.name);
  const on = entry && Array.isArray(entry.roles) ? entry.roles : [];
  if(!tlFocusOpen.has(r.name)){
    return `<div class="tl-focus is-folded">${on.map(role => `<span class="ld-chip is-on">${escapeHtml(role)}</span>`).join('') || '<span class="tl-focus-none">No focus yet</span>'}<button type="button" class="tl-focus-edit" data-tl-focus-open="${escapeHtml(r.name)}">${on.length ? 'Change' : 'Pick a focus'}</button></div>`;
  }
  return `<div class="tl-focus" aria-label="${escapeHtml(r.name)}’s focus">${LD_ROLES.map(role => `<button type="button" class="ld-chip${on.includes(role) ? ' is-on' : ''}" data-tl-focus="${escapeHtml(role)}" data-tl-key="${key}" aria-pressed="${on.includes(role)}">${escapeHtml(role)}</button>`).join('')}<button type="button" class="tl-focus-edit" data-tl-focus-close="${escapeHtml(r.name)}">Done</button></div>`;
}

function tlRowHtml(r, n){
  const key = `${r.kind}:${r.kind === 'pin' ? n : r.i}`;
  const roles = r.kind === 'director' ? ['director', 'mp'] : r.kind === 'pin' ? TL_TEAM_ROLES : ['lead'];
  const select = `<select class="tl-role" data-tl-role="${key}" aria-label="${escapeHtml(r.name || 'New director')}’s role"${r.kind === 'leader' || tlSaving === r.name ? ' disabled' : ''}>${roles.map(x => `<option value="${x}"${x === r.role ? ' selected' : ''}>${TL_ROLES[x]}</option>`).join('')}</select>`;
  const name = r.kind === 'director'
    ? `<input type="text" class="tl-name-in" value="${escapeHtml(r.name)}" maxlength="80" placeholder="Name as in HotSchedules" data-tl-name="${key}" aria-label="Director’s name">`
    : `<span class="tl-name">${escapeHtml(r.name)}</span>`;
  const remove = r.kind === 'pin' ? '' : `<button type="button" class="dir-x" data-tl-remove="${key}" aria-label="Remove ${escapeHtml(r.name || 'this director')}">${UO_X_ICON}</button>`;
  return `<li class="tl-row is-${r.role}" data-tl-row="${key}">
      <div class="tl-main">${name}${select}${remove}</div>
      ${r.kind === 'leader' ? '<p class="tl-tag">On the leader list, not on the PIN list: check the spelling, or remove them.</p>' : ''}
      ${r.role === 'lead' ? tlFocusHtml(r, key) : ''}
    </li>`;
}

function renderTeamList(){
  const root = document.getElementById('teamListRoot');
  if(!root) return;
  const {rows, loaded} = tlPeople();
  if(!loaded && typeof hcLoad === 'function') hcLoad();
  tlRowsShown = rows;
  const count = role => rows.filter(r => r.role === role && (r.kind !== 'director' || r.name)).length;
  const filters = [['all', 'Everyone', rows.filter(r => r.kind !== 'director' || r.name).length], ...TL_ORDER.map(x => [x, TL_ROLES[x], count(x)]).filter(f => f[2])];
  const q = tlSearch.trim().toLowerCase();
  const shown = rows.map((r, n) => ({r, n})).filter(({r}) => (tlFilter === 'all' || r.role === tlFilter) && (!q || r.name.toLowerCase().includes(q) || (r.kind === 'director' && !r.name)));
  const mm = loaded ? tlMismatch(rows) : {missing: [], extra: []};
  const banner = mm.missing.length || mm.extra.length ? `<div class="tl-banner" role="status">
      <p>${[mm.missing.length && `${mm.missing.length} Team Lead${mm.missing.length === 1 ? ' isn’t' : 's aren’t'} counted as ${mm.missing.length === 1 ? 'a leader' : 'leaders'} yet (${mm.missing.slice(0, 3).map(r => escapeHtml(r.name)).join(', ')}${mm.missing.length > 3 ? '…' : ''})`,
        mm.extra.length && `${mm.extra.length} ${mm.extra.length === 1 ? 'person is' : 'people are'} counted as ${mm.extra.length === 1 ? 'a leader' : 'leaders'} but ${mm.extra.length === 1 ? 'isn’t a Team Lead' : 'aren’t Team Leads'} here (${mm.extra.slice(0, 3).map(r => escapeHtml(r.name)).join(', ')}${mm.extra.length > 3 ? '…' : ''})`].filter(Boolean).join('; ')}.</p>
      <button type="button" class="du-sync-btn" data-tl-match>Count exactly the Team Leads as leaders</button>
    </div>` : '';
  root.innerHTML = `
    ${tlError ? `<p class="tl-error" role="alert">${escapeHtml(tlError)}</p>` : ''}
    ${loaded ? '' : '<p class="dir-empty">Loading the PIN list…</p>'}
    ${loaded && !rows.some(r => r.kind === 'pin') ? '<p class="dir-empty">No clock-in PIN list yet: upload the store’s PIN report in Settings → Accounts and everyone shows here.</p>' : ''}
    ${banner}
    <div class="tl-tools">
      <input type="search" class="tl-search" placeholder="Find someone" value="${escapeHtml(tlSearch)}" data-tl-search aria-label="Find someone">
      <div class="tl-filters" role="group" aria-label="Show">${filters.map(([k, label, n]) => `<button type="button" class="tl-filter${tlFilter === k ? ' is-on' : ''}" data-tl-filter="${k}" aria-pressed="${tlFilter === k}">${escapeHtml(label)} <b>${n}</b></button>`).join('')}</div>
    </div>
    <ul class="tl-list">${shown.map(({r, n}) => tlRowHtml(r, n)).join('') || '<li class="dir-empty">Nobody matches.</li>'}</ul>
    <button type="button" class="btn btn-ghost dir-btn" data-tl-add-director>+ Add a director</button>
    <p class="tl-hint">New team members come from the PIN report (Settings → Accounts). Directors sign in with Google, the director PIN, or their own clock-in PIN once their name is here.</p>
    <p class="mv-saved" data-mv-saved>Saves as you go</p>`;
}
function tlRowFor(key){
  const [kind, n] = String(key).split(':');
  if(kind === 'pin') return tlRowsShown[+n] || null;
  return tlRowsShown.find(r => r.kind === kind && r.i === +n) || null;
}
function tlAfterLeaders(){ saveState(); if(typeof dirRerender === 'function') dirRerender(); }

// A team role: on the PIN list (sign-in), and on or off the leader list.
async function tlSetTeamRole(r, role){
  tlSaving = r.name; tlError = '';
  renderTeamList();
  try{
    const res = await fetch(`${API_BASE}/api/team/role`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: r.name, role})});
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(data.error || 'Couldn’t save that role.');
    hcData = data;
    const entry = tlLeaderFor(r.name);
    if(role === 'lead' && !entry){ ldEnsureOwn(); leaderRoster.push({name: r.name, roles: []}); tlAfterLeaders(); }
    else if(role !== 'lead' && entry){ leaderRoster = tlLeaders().filter(x => x !== entry); tlAfterLeaders(); }
  }catch(err){
    tlError = err.message || 'Couldn’t reach the hub. Try again.';
  }
  tlSaving = '';
  renderTeamList();
  if(typeof mvSavedNote === 'function') mvSavedNote(document.getElementById('teamListRoot'));
}

document.addEventListener('change', e => {
  const t = e.target;
  if(!t || !t.closest || !t.closest('#teamListRoot')) return;
  if(t.dataset.tlRole){
    const r = tlRowFor(t.dataset.tlRole);
    if(!r) return;
    if(r.kind === 'director'){
      dirEnsureOwn();
      const d = directors[r.i];
      if(d){ d.title = t.value === 'mp' ? 'Managing Partner' : 'Director'; saveState(); dirRerender(); renderTeamList(); }
      return;
    }
    if(r.kind === 'pin') tlSetTeamRole(r, t.value);
    return;
  }
  if(t.dataset.tlName){
    const r = tlRowFor(t.dataset.tlName);
    if(!r || r.kind !== 'director') return;
    dirEnsureOwn();
    const d = directors[r.i];
    if(d){ d.name = t.value.trim(); saveState(); dirRerender(); renderTeamList(); }
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if(!t || !t.matches || !t.matches('#teamListRoot [data-tl-search]')) return;
  tlSearch = t.value;
  const pos = t.selectionStart;
  renderTeamList();
  const again = document.querySelector('#teamListRoot [data-tl-search]');
  if(again){ again.focus(); again.setSelectionRange(pos, pos); }
});
document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t || !t.closest('#teamListRoot')) return;
  const f = t.closest('[data-tl-filter]');
  if(f){ tlFilter = f.dataset.tlFilter; renderTeamList(); return; }
  if(t.closest('[data-tl-add-director]')){
    dirEnsureOwn(); directors.push({name: '', title: 'Director'});
    tlFilter = 'all'; tlSearch = '';
    renderTeamList();
    const inputs = document.querySelectorAll('#teamListRoot [data-tl-name]');
    const blank = [...inputs].find(i => !i.value);
    if(blank) blank.focus();
    return;
  }
  const rm = t.closest('[data-tl-remove]');
  if(rm){
    const r = tlRowFor(rm.dataset.tlRemove);
    if(!r) return;
    if(r.kind === 'director'){
      if(r.name && !confirm(`Take ${r.name} off the director team?`)) return;
      dirEnsureOwn(); directors.splice(r.i, 1);
    } else if(r.kind === 'leader'){
      if(!confirm(`Take ${r.name} off the leader list?`)) return;
      leaderRoster = tlLeaders().filter((x, i) => i !== r.i);
    }
    saveState(); dirRerender(); renderTeamList();
    return;
  }
  const fo = t.closest('[data-tl-focus-open]');
  if(fo){ tlFocusOpen.add(fo.dataset.tlFocusOpen); renderTeamList(); return; }
  const fc = t.closest('[data-tl-focus-close]');
  if(fc){ tlFocusOpen.delete(fc.dataset.tlFocusClose); renderTeamList(); return; }
  const focus = t.closest('[data-tl-focus]');
  if(focus){
    const r = tlRowFor(focus.dataset.tlKey);
    if(!r) return;
    ldEnsureOwn();
    let entry = tlLeaderFor(r.name);
    if(!entry){ entry = {name: r.name, roles: []}; leaderRoster.push(entry); }
    const role = focus.dataset.tlFocus;
    entry.roles = Array.isArray(entry.roles) ? entry.roles : [];
    entry.roles = entry.roles.includes(role) ? entry.roles.filter(x => x !== role) : [...entry.roles, role];
    tlAfterLeaders(); renderTeamList();
    if(typeof mvSavedNote === 'function') mvSavedNote(document.getElementById('teamListRoot'));
    return;
  }
  if(t.closest('[data-tl-match]')){
    const {missing, extra} = tlMismatch(tlPeople().rows);
    ldEnsureOwn();
    missing.forEach(r => leaderRoster.push({name: r.name, roles: []}));
    leaderRoster = leaderRoster.filter(x => !extra.some(r => x && tlSame(x.name, r.name)));
    tlAfterLeaders(); renderTeamList();
    showToast(`Leaders now match the Team Leads${missing.length ? ` · ${missing.length} added` : ''}${extra.length ? ` · ${extra.length} taken off` : ''}`);
  }
});
