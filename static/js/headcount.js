// ===== OUR TEAM: HEADCOUNT AND DEPARTURES (TIM-81) =====
// Ashley on the admin team (Oct 20 2026): the real number on the team, who
// left most recently, quit or let go, and why. The server keeps all of it
// (app.py, TEAM HEADCOUNT AND DEPARTURES) and hands it only to a director or
// an Admin Team sign-in; none of it is in the page's shared data. The team is
// the clock-in PIN list plus the directors the last PIN report named.
// Whoever drops off a full PIN report (or has their PIN removed) waits under
// "To explain" until someone logs why, or marks it a false alarm.
// Profiles (TIM-82, Oct 20 2026): each person's food handler permit expiry,
// hire date, birthday (who's under 18) and notes; a permit expired or due in
// 30 days shows here and on the Right Now card.

let hcData = null;        // the server's answer, once loaded
let hcLoading = false;
let hcFailedAt = 0;
let hcForm = null;        // the departure being logged or edited
let hcBusy = false;
let hcShowAll = false;
let hcProfile = null;     // the profile open: {name, role, ...the saved fields}
const HC_PERMIT_SOON_DAYS = 30;

const HC_ROLE_LABELS = {member: 'Team Member', trainer: 'Trainer', lead: 'Team Lead', admin: 'Admin Team', director: 'Director'};
const HC_REHIRE = [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']];
const HC_WINDOW_DAYS = 90;

function hcAllowed(){
  if(typeof launchManager !== 'undefined' && launchManager) return true;
  return typeof acUser !== 'undefined' && !!acUser && acUser.role === 'admin';
}

async function hcLoad(force){
  if(!hcAllowed() || hcLoading) return;
  if(!force && hcFailedAt && Date.now() - hcFailedAt < 60000) return;
  hcLoading = true;
  try{
    const res = await fetch(`${API_BASE}/api/team/headcount`, {cache: 'no-store'});
    if(!res.ok) throw new Error(String(res.status));
    hcData = await res.json();
    hcFailedAt = 0;
  }catch(err){
    hcFailedAt = Date.now();
  }
  hcLoading = false;
  if(document.getElementById('headcountView').classList.contains('active')) renderHeadcountView();
  if(typeof renderRightNow === 'function') renderRightNow();
}

function hcAddDays(iso, n){
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return toLocalISODate(d);
}
function hcDate(iso){
  return iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : '';
}
function hcTypeLabel(id){
  const t = hcData && (hcData.types || []).find(x => x.id === id);
  return t ? t.label : '';
}
const hcWhen = d => d.lastDay || d.noticed || '';

// What the numbers say, for the page and the Right Now card.
function hcSummary(){
  if(!hcAllowed()){ hcData = null; return null; }
  if(!hcData){ hcLoad(); return null; }
  const deps = (hcData.departures || []).filter(d => d.status !== 'dismissed');
  const pending = deps.filter(d => d.status === 'pending');
  const logged = deps.filter(d => d.status === 'logged');
  const since = hcAddDays(today, -HC_WINDOW_DAYS);
  const recent = deps.filter(d => hcWhen(d) >= since);
  const joined = (hcData.hires || []).filter(h => (h.date || '') >= since).length;
  // Turnover at the current pace: departures ÷ the average headcount over
  // the window, scaled to a year. Needs two weeks of counts to mean much.
  const counts = (hcData.counts || []).filter(c => c.date >= since);
  const first = (hcData.counts || [])[0];
  const days = first ? Math.min(HC_WINDOW_DAYS, Math.round((new Date(today + 'T12:00:00') - new Date(first.date + 'T12:00:00')) / 86400000)) : 0;
  const avg = counts.length ? counts.reduce((s, c) => s + (c.total || 0), 0) / counts.length : hcData.now.total;
  const counted = first ? recent.filter(d => hcWhen(d) >= first.date).length : 0;   // only since the counts began
  const pace = days >= 14 && avg > 0 ? Math.round(counted / avg * 365 / days * 100) : null;
  const last = logged.slice().sort((a, b) => hcWhen(b).localeCompare(hcWhen(a)))[0] || null;
  return {now: hcData.now, pending, logged, recent, joined, pace, days, last, permits: hcPermits(),
    quit: recent.filter(d => d.type === 'quit').length, letGo: recent.filter(d => d.type === 'let-go').length};
}

// ----- Profiles (TIM-82): the food handler permit, hire date, birthday, notes -----
const hcKey = n => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();
function hcProfileFor(name){ return (hcData && hcData.profiles || []).find(p => hcKey(p.name) === hcKey(name)) || null; }

// expired | soon | missing | ok
function hcPermitState(p){
  if(!p || !p.permitExpires) return 'missing';
  if(p.permitExpires < today) return 'expired';
  return p.permitExpires <= hcAddDays(today, HC_PERMIT_SOON_DAYS) ? 'soon' : 'ok';
}
function hcAge(birthday){
  if(!birthday) return null;
  const [y, m, d] = birthday.split('-').map(Number), [ty, tm, td] = today.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}
function hcYearsMonths(from){
  if(!from || from > today) return '';
  const [y, m] = from.split('-').map(Number), [ty, tm] = today.split('-').map(Number);
  const months = (ty - y) * 12 + (tm - m);
  return months < 1 ? 'new this month' : months < 12 ? `${months} mo` : `${Math.floor(months / 12)} yr${months >= 24 ? 's' : ''}${months % 12 ? ` ${months % 12} mo` : ''}`;
}

// Everyone on the PIN list, with their permit state.
function hcPermits(){
  const team = (hcData && hcData.team) || [];
  const rows = team.map(p => ({...p, profile: hcProfileFor(p.name)})).map(p => ({...p, state: hcPermitState(p.profile)}));
  const n = st => rows.filter(r => r.state === st).length;
  return {rows, expired: n('expired'), soon: n('soon'), missing: n('missing'), ok: n('ok')};
}

function hcPermitChip(p){
  const st = hcPermitState(p);
  const label = st === 'missing' ? 'No permit date' : st === 'expired' ? `Permit expired ${hcDate(p.permitExpires)}` : st === 'soon' ? `Permit due ${hcDate(p.permitExpires)}` : `Permit to ${hcDate(p.permitExpires)}${p.permitExpires.slice(0, 4) !== today.slice(0, 4) ? ' ' + p.permitExpires.slice(0, 4) : ''}`;
  return `<span class="hc-chip hc-permit is-${st}">${escapeHtml(label)}</span>`;
}

function hcPermitsHtml(s){
  const P = s.permits;
  if(!P.rows.length) return '';
  const urgent = P.rows.filter(r => r.state === 'expired' || r.state === 'soon')
    .sort((a, b) => (a.profile.permitExpires || '').localeCompare(b.profile.permitExpires || ''));
  return `
    <section class="hc-card${P.expired ? ' hc-alert' : ''}">
      <h3 class="hc-h">Food handler permits <span>${P.ok} of ${P.rows.length} current</span></h3>
      <p class="hc-note">${[P.expired ? `<b class="hc-bad">${P.expired} expired</b>` : '', P.soon ? `${P.soon} due in ${HC_PERMIT_SOON_DAYS} days` : '', P.missing ? `${P.missing} with no date yet` : ''].filter(Boolean).join(' · ') || 'Everyone’s permit is current.'}</p>
      ${urgent.map(r => `
        <button type="button" class="hc-prow" data-hc-profile="${escapeHtml(r.name)}"><b>${escapeHtml(r.name)}</b>${hcPermitChip(r.profile)}</button>`).join('')}
    </section>`;
}

function hcTeamHtml(){
  const team = (hcData && hcData.team) || [];
  if(!team.length) return '';
  const others = (hcData.profiles || []).filter(p => !team.some(t => hcKey(t.name) === hcKey(p.name)));
  const row = (name, role, p) => {
    const age = hcAge(p && p.birthday);
    return `<button type="button" class="hc-prow" data-hc-profile="${escapeHtml(name)}" data-hc-find="${escapeHtml(hcKey(name))}">
      <span class="hc-prow-name"><b>${escapeHtml(name)}</b><small>${escapeHtml([HC_ROLE_LABELS[role] || '', p && p.hireDate ? hcYearsMonths(p.hireDate) : ''].filter(Boolean).join(' · '))}</small></span>
      ${age !== null && age < 18 ? '<span class="hc-chip is-minor">Under 18</span>' : ''}${hcPermitChip(p)}</button>`;
  };
  return `
    <section class="hc-card">
      <h3 class="hc-h">Profiles <span>${team.length} on the PIN list</span></h3>
      <input type="search" class="hc-find" id="hcFind" placeholder="Find someone" aria-label="Find someone" autocomplete="off">
      <div class="hc-plist">${team.map(t => row(t.name, t.role, hcProfileFor(t.name))).join('')}</div>
      ${others.length ? `<details class="hc-others"><summary>Not on the PIN list (${others.length})</summary><div class="hc-plist">${others.map(p => row(p.name, '', p)).join('')}</div></details>` : ''}
      <button type="button" class="ld-link hc-more" data-hc-profile-new>Add a profile for someone not on the list</button>
    </section>`;
}

function hcProfileHtml(){
  const p = hcProfile;
  const age = hcAge(p.birthday);
  const hire = (hcData.hires || []).find(h => hcKey(h.name) === hcKey(p.name));
  const left = (hcData.departures || []).filter(d => hcKey(d.name) === hcKey(p.name) && d.status === 'logged');
  return `
    <form class="hc-form hc-profile" data-hc-profile-form>
      <div class="hc-profile-head">
        <h3 class="hc-h">${p.isNew ? 'New profile' : escapeHtml(p.name)}</h3>
        <span>${escapeHtml([HC_ROLE_LABELS[p.role] || '', age !== null ? `${age} years old` : '', p.hireDate ? `with us ${hcYearsMonths(p.hireDate)}` : ''].filter(Boolean).join(' · '))}</span>
      </div>
      ${p.isNew ? `<div class="field"><label for="hcpName">Name</label><input type="text" id="hcpName" maxlength="80" required></div>` : ''}
      <div class="hc-form-row hc-form-row3">
        <div class="field"><label for="hcpPermit">Food handler permit expires</label><input type="date" id="hcpPermit" value="${escapeHtml(p.permitExpires || '')}"></div>
        <div class="field"><label for="hcpHire">Hire date</label><input type="date" id="hcpHire" value="${escapeHtml(p.hireDate || '')}" max="${today}">${!p.hireDate && hire ? `<small class="hc-hint">New on the PIN list ${escapeHtml(hcDate(hire.date))}</small>` : ''}</div>
        <div class="field"><label for="hcpBirthday">Birthday</label><input type="date" id="hcpBirthday" value="${escapeHtml(p.birthday || '')}" max="${today}">${age !== null && age < 18 ? '<small class="hc-hint is-minor">Under 18: minor hour rules apply</small>' : ''}</div>
      </div>
      <div class="field"><label for="hcpNotes">Notes</label><textarea id="hcpNotes" rows="3" maxlength="1500" placeholder="Anything the admin team needs to know">${escapeHtml(p.notes || '')}</textarea></div>
      ${left.length ? `<p class="hc-note">Left before: ${left.map(d => `${escapeHtml(hcTypeLabel(d.type))} ${escapeHtml(hcDate(d.lastDay))}`).join(', ')}</p>` : ''}
      ${p.by ? `<p class="hc-note">Last saved by ${escapeHtml(p.by)}${p.at ? ` · ${escapeHtml(new Date(p.at * 1000).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}))}` : ''}</p>` : ''}
      <div class="hc-form-go">
        <button type="submit" class="btn btn-primary" ${hcBusy ? 'disabled' : ''}>Save</button>
        <button type="button" class="btn btn-ghost" data-hc-profile-close>Close</button>
      </div>
    </form>`;
}

async function hcSaveProfile(){
  const v = id => (document.getElementById(id) || {}).value || '';
  const name = hcProfile.isNew ? v('hcpName').trim() : hcProfile.name;
  if(!name){ showToast('Whose profile?'); return; }
  hcBusy = true;
  try{
    const res = await fetch(`${API_BASE}/api/team/profiles`, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name, permitExpires: v('hcpPermit'), hireDate: v('hcpHire'), birthday: v('hcpBirthday'), notes: v('hcpNotes')})});
    const data = await res.json().catch(() => ({}));
    if(!res.ok){ showToast(data.error || 'Couldn’t save. Try again.'); return; }
    hcData = data;
    hcProfile = null;
    showToast(`Saved: ${name}`);
    renderHeadcountView();
    if(typeof renderRightNow === 'function') renderRightNow();
  }catch(err){
    showToast('Couldn’t reach the server. Try again.');
  }finally{
    hcBusy = false;
  }
}

function hcRolesLine(now){
  const order = ['member', 'trainer', 'lead', 'admin'];
  const parts = order.filter(r => now.byRole && now.byRole[r]).map(r => `${now.byRole[r]} ${HC_ROLE_LABELS[r]}${now.byRole[r] === 1 ? '' : 's'}`);
  if(now.directors) parts.push(`${now.directors} Director${now.directors === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function hcSummaryHtml(s){
  const stat = (label, value, note) => `<div class="fc-sum-stat"><div class="label">${label}</div><div class="value">${value}</div>${note ? `<div class="note">${note}</div>` : ''}</div>`;
  return `
    <div class="fc-summary hc-summary">
      <div>
        <div class="fc-sum-label">On the team</div>
        <div class="fc-sum-hero">${s.now.total}</div>
        <div class="fc-sum-foot">${escapeHtml(hcRolesLine(s.now)) || 'Everyone with a clock-in PIN'}</div>
      </div>
      <div class="fc-sum-stats">
        ${stat(`Left · ${HC_WINDOW_DAYS} days`, s.recent.length, `${s.quit} quit · ${s.letGo} let go`)}
        ${stat(`Joined · ${HC_WINDOW_DAYS} days`, s.joined, 'new on the PIN list')}
        ${stat('Turnover', s.pace === null ? '—' : s.pace + '%', s.pace === null ? 'after two weeks of counts' : 'a year, at this pace')}
      </div>
    </div>`;
}

function hcChoice(field, value, cur, label){
  return `<button type="button" class="uo-choice ${value === cur ? 'is-on' : ''}" aria-pressed="${value === cur}" data-hc-set="${field}" data-hc-val="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
}

function hcFormHtml(){
  const f = hcForm;
  const roles = Object.entries(HC_ROLE_LABELS);
  return `
    <form class="hc-form" data-hc-form>
      <h3 class="hc-h">${f.id && f.status === 'logged' ? 'Edit departure' : f.id ? `Why did ${escapeHtml(f.name)} leave?` : 'Log a departure'}</h3>
      <div class="hc-form-row">
        <div class="field"><label for="hcName">Name</label><input type="text" id="hcName" maxlength="80" list="hcNames" value="${escapeHtml(f.name || '')}" ${f.id ? 'readonly' : ''} required></div>
        <div class="field"><label for="hcRole">Role</label><select id="hcRole">${roles.map(([id, l]) => `<option value="${id}"${id === (f.role || 'member') ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="hcLastDay">Last day</label><input type="date" id="hcLastDay" value="${escapeHtml(f.lastDay || f.noticed || today)}" max="${today}" required></div>
      </div>
      <datalist id="hcNames">${(hcData.names || []).map(n => `<option value="${escapeHtml(n)}">`).join('')}</datalist>
      <div class="uo-q"><span class="uo-q-label">What happened</span><div class="uo-choices">${(hcData.types || []).map(t => hcChoice('type', t.id, f.type, t.label)).join('')}</div></div>
      <div class="field"><label for="hcReason">Why, in a sentence or two</label><textarea id="hcReason" rows="3" maxlength="600" placeholder="What they said, or what led to it">${escapeHtml(f.reason || '')}</textarea></div>
      <div class="uo-q"><span class="uo-q-label">Eligible for rehire</span><div class="uo-choices">${HC_REHIRE.map(([id, l]) => hcChoice('rehire', id, f.rehire || 'unsure', l)).join('')}</div></div>
      <div class="hc-form-go">
        <button type="submit" class="btn btn-primary" ${hcBusy ? 'disabled' : ''}>Save</button>
        <button type="button" class="btn btn-ghost" data-hc-cancel>Cancel</button>
        ${f.id && f.status === 'logged' ? '<button type="button" class="ld-link hc-remove" data-hc-remove>Remove, logged by mistake</button>' : ''}
      </div>
    </form>`;
}

function hcPendingHtml(s){
  if(!s.pending.length) return '';
  return `
    <section class="hc-card hc-pending">
      <h3 class="hc-h">To explain <span>${s.pending.length}</span></h3>
      <p class="hc-note">No longer on the PIN list. Log why they left, or mark it a false alarm (a name spelled differently, say).</p>
      ${s.pending.map(d => `
        <div class="hc-row">
          <div class="hc-row-main"><b>${escapeHtml(d.name)}</b><small>${escapeHtml(HC_ROLE_LABELS[d.role] || '')} · ${d.source === 'pin-removed' ? 'PIN removed' : 'off the PIN report'} ${escapeHtml(hcDate(d.noticed))}</small></div>
          <div class="hc-row-go"><button type="button" class="btn btn-primary" data-hc-explain="${escapeHtml(d.id)}">Log why</button><button type="button" class="ld-link" data-hc-dismiss="${escapeHtml(d.id)}">Not a departure</button></div>
        </div>`).join('')}
    </section>`;
}

function hcDeparturesHtml(s){
  const list = s.logged.slice().sort((a, b) => hcWhen(b).localeCompare(hcWhen(a)) || (b.at || 0) - (a.at || 0));
  if(!list.length) return `<section class="hc-card"><h3 class="hc-h">Recent departures</h3><p class="hc-note">None logged yet.</p></section>`;
  const shown = hcShowAll ? list : list.slice(0, 12);
  const rehire = {yes: 'Rehire: yes', no: 'Rehire: no', unsure: ''};
  return `
    <section class="hc-card">
      <h3 class="hc-h">Recent departures</h3>
      ${shown.map(d => `
        <div class="hc-dep">
          <div class="hc-dep-top"><b>${escapeHtml(d.name)}</b><span class="hc-chip is-${escapeHtml(d.type)}">${escapeHtml(hcTypeLabel(d.type))}</span><span class="hc-dep-date">${escapeHtml(hcDate(d.lastDay))}</span></div>
          ${d.reason ? `<p class="hc-dep-why">${escapeHtml(d.reason)}</p>` : ''}
          <div class="hc-dep-foot"><span>${escapeHtml([HC_ROLE_LABELS[d.role] || '', rehire[d.rehire] || '', d.by ? `logged by ${d.by}` : ''].filter(Boolean).join(' · '))}</span><button type="button" class="ld-link" data-hc-edit="${escapeHtml(d.id)}">Edit</button></div>
        </div>`).join('')}
      ${list.length > shown.length ? `<button type="button" class="ld-link hc-more" data-hc-all>Show all ${list.length}</button>` : ''}
    </section>`;
}

// Why people leave over the last year: the types, most first.
function hcWhyHtml(s){
  const since = hcAddDays(today, -365);
  const year = s.logged.filter(d => hcWhen(d) >= since);
  if(year.length < 2) return '';
  const counts = {};
  year.forEach(d => { counts[d.type] = (counts[d.type] || 0) + 1; });
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = rows[0][1];
  return `
    <section class="hc-card">
      <h3 class="hc-h">Why they leave <span>last 12 months</span></h3>
      ${rows.map(([type, n]) => `
        <div class="hc-why"><span class="hc-why-l">${escapeHtml(hcTypeLabel(type))}</span><span class="hc-why-bar"><i style="width:${(n / max * 100).toFixed(1)}%"></i></span><b>${n}</b></div>`).join('')}
    </section>`;
}

function hcHistoryHtml(){
  const counts = (hcData.counts || []).slice(-10).reverse();
  if(!counts.length) return '';
  return `
    <section class="hc-card">
      <h3 class="hc-h">Headcount by PIN report</h3>
      ${counts.map(c => `
        <div class="hc-hist"><span>${escapeHtml(hcDate(c.date))}</span><b>${c.total}</b><small>${c.joined ? `+${c.joined} joined` : ''}${c.joined && c.left ? ' · ' : ''}${c.left ? `−${c.left} left` : ''}</small></div>`).join('')}
    </section>`;
}

function renderHeadcountView(){
  const root = document.getElementById('headcountRoot');
  if(!root) return;
  if(!hcAllowed()){
    hcData = null;
    root.innerHTML = '<p class="hc-note">Directors and the admin team only.</p>';
    return;
  }
  const s = hcSummary();
  if(!s){
    root.innerHTML = `<div class="hc-head"><h2 class="hc-title">Our Team</h2></div><p class="hc-note">${hcFailedAt ? 'Couldn’t reach the server. <button type="button" class="ld-link" data-hc-retry>Try again</button>' : 'Loading…'}</p>`;
    return;
  }
  const empty = !s.now.total && !(hcData.counts || []).length;
  root.innerHTML = `
    <div class="hc-head">
      <h2 class="hc-title">Our Team</h2>
      ${hcForm ? '' : '<button type="button" class="btn btn-primary" data-hc-new>Log a departure</button>'}
    </div>
    ${empty ? '<p class="hc-note hc-start">The count starts with the store’s PIN report: upload it in Manage → Accounts (Tim). Everyone with a clock-in PIN counts, and each new report shows who left.</p>' : hcSummaryHtml(s)}
    ${hcForm ? hcFormHtml() : ''}
    ${hcProfile ? hcProfileHtml() : ''}
    ${hcPendingHtml(s)}
    ${hcPermitsHtml(s)}
    ${hcTeamHtml()}
    ${hcDeparturesHtml(s)}
    ${hcWhyHtml(s)}
    ${hcHistoryHtml()}`;
}

async function hcSend(method, body){
  hcBusy = true;
  try{
    const res = await fetch(`${API_BASE}/api/team/departures`, {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    const data = await res.json().catch(() => ({}));
    if(!res.ok){ showToast(data.error || 'Couldn’t save. Try again.'); return false; }
    hcData = data;
    return true;
  }catch(err){
    showToast('Couldn’t reach the server. Try again.');
    return false;
  }finally{
    hcBusy = false;
  }
}

function hcFindDeparture(id){ return (hcData && hcData.departures || []).find(d => d.id === id) || null; }

document.getElementById('headcountRoot').addEventListener('click', async e => {
  const t = e.target.closest('button');
  if(!t) return;
  if(t.hasAttribute('data-hc-retry')){ hcLoad(true); return; }
  if(t.dataset.hcProfile){
    const team = (hcData.team || []).find(x => hcKey(x.name) === hcKey(t.dataset.hcProfile));
    hcProfile = {name: t.dataset.hcProfile, role: team ? team.role : '', ...(hcProfileFor(t.dataset.hcProfile) || {})};
    hcForm = null;
    renderHeadcountView();
    document.getElementById('headcountRoot').scrollIntoView({block: 'start'});
    return;
  }
  if(t.hasAttribute('data-hc-profile-new')){ hcProfile = {isNew: true}; hcForm = null; renderHeadcountView(); document.getElementById('headcountRoot').scrollIntoView({block: 'start'}); return; }
  if(t.hasAttribute('data-hc-profile-close')){ hcProfile = null; renderHeadcountView(); return; }
  if(t.hasAttribute('data-hc-new')){ hcForm = {type: '', rehire: 'unsure'}; hcProfile = null; renderHeadcountView(); return; }
  if(t.hasAttribute('data-hc-cancel')){ hcForm = null; renderHeadcountView(); return; }
  if(t.hasAttribute('data-hc-all')){ hcShowAll = true; renderHeadcountView(); return; }
  if(t.dataset.hcExplain || t.dataset.hcEdit){
    const d = hcFindDeparture(t.dataset.hcExplain || t.dataset.hcEdit);
    if(d){ hcForm = {...d, rehire: d.rehire || 'unsure', type: d.type || ''}; renderHeadcountView(); document.getElementById('headcountRoot').scrollIntoView({block: 'start'}); }
    return;
  }
  if(t.dataset.hcSet){
    // Keep what's typed while a choice is picked.
    hcFormRead();
    hcForm[t.dataset.hcSet] = t.dataset.hcVal;
    renderHeadcountView();
    return;
  }
  if(t.dataset.hcDismiss){
    if(await hcSend('POST', {id: t.dataset.hcDismiss, status: 'dismissed'})) renderHeadcountView();
    return;
  }
  if(t.hasAttribute('data-hc-remove') && hcForm && hcForm.id){
    if(!confirm(`Remove ${hcForm.name}'s departure? Only if it was logged by mistake.`)) return;
    if(await hcSend('DELETE', {id: hcForm.id})){ hcForm = null; renderHeadcountView(); if(typeof renderRightNow === 'function') renderRightNow(); }
  }
});

function hcFormRead(){
  const v = id => { const el = document.getElementById(id); return el ? el.value : undefined; };
  if(!hcForm) return;
  ['name', 'role', 'lastDay', 'reason'].forEach((k, i) => {
    const val = v(['hcName', 'hcRole', 'hcLastDay', 'hcReason'][i]);
    if(val !== undefined) hcForm[k] = val;
  });
}

// Find someone: hide the other rows (no re-render, so typing keeps going).
document.getElementById('headcountRoot').addEventListener('input', e => {
  if(e.target.id !== 'hcFind') return;
  const q = hcKey(e.target.value);
  document.querySelectorAll('#headcountRoot .hc-plist [data-hc-find]').forEach(r => { r.hidden = !!q && !r.dataset.hcFind.includes(q); });
});

document.getElementById('headcountRoot').addEventListener('submit', async e => {
  if(e.target.closest('[data-hc-profile-form]')){ e.preventDefault(); if(!hcBusy) hcSaveProfile(); return; }
  if(!e.target.closest('[data-hc-form]')) return;
  e.preventDefault();
  if(hcBusy) return;
  hcFormRead();
  if(!hcForm.type){ showToast('Pick what happened: quit, let go, …'); return; }
  const f = hcForm;
  const ok = await hcSend('POST', {id: f.id || '', name: f.name, role: f.role, lastDay: f.lastDay, type: f.type, reason: f.reason, rehire: f.rehire});
  if(ok){
    showToast(`Logged: ${f.name}`);
    hcForm = null;
    renderHeadcountView();
    if(typeof renderRightNow === 'function') renderRightNow();
  }
});
