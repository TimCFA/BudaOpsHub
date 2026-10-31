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
// 30 days shows on the Right Now card. On this page (Tim, Oct 23 2026) the
// first glance stays simple: no permit list, just an icon on the person's
// row for a certificate expired or due soon, a birthday this month, a work
// anniversary this month; the details are in their profile.

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

// The Our Team tab shows to those who can open it (Tim, Oct 21 2026: there
// was no clean way to the permit dates).
// Loaded ahead once the tab shows (Tim, Oct 22 2026: it should open at once),
// and dropped at sign-out so a shared iPad doesn't keep it.
function hcSyncTab(){
  const ok = hcAllowed();
  document.body.classList.toggle('hc-allowed', ok);
  if(!ok){ hcData = null; return; }
  if(!hcData) hcWhenIdle(() => hcLoad());
}
function hcWhenIdle(fn){
  if(typeof requestIdleCallback === 'function') requestIdleCallback(fn, {timeout: 2000});
  else setTimeout(fn, 300);
}

async function hcLoad(force){
  if(!hcAllowed() || hcLoading) return;
  if(!force && hcFailedAt && Date.now() - hcFailedAt < 60000) return;
  hcLoading = true;
  try{
    const res = await fetch(`${API_BASE}/api/team/headcount`, {cache: 'no-store'});
    if(!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    hcData = hcAllowed() ? data : null;     // signed out while it loaded
    if(hcData && Array.isArray(hcData.departed)) teamLeftSet(hcData.departed);
    hcFailedAt = 0;
  }catch(err){
    hcFailedAt = Date.now();
  }
  hcLoading = false;
  if(document.getElementById('headcountView').classList.contains('active')){
    renderHeadcountView();
    if(hcData && typeof hhOpenArrived === 'function') hhOpenArrived('headcount');
  }
  if(typeof renderRightNow === 'function') renderRightNow();
  if(typeof renderTeamList === 'function') renderTeamList();
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
  const leaving = deps.filter(hcIsLeaving).sort((a, b) => a.lastDay.localeCompare(b.lastDay));
  const logged = deps.filter(d => d.status === 'logged' && !hcIsLeaving(d));
  const since = hcAddDays(today, -HC_WINDOW_DAYS);
  const recent = deps.filter(d => hcWhen(d) >= since && !hcIsLeaving(d));
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
  return {now: hcData.now, pending, leaving, logged, recent, joined, pace, days, last,
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

// The icons on a person's row: [kind, words], certificate first.
const HC_ICONS = {
  cert: '<path d="M4 4h16v11H4z"/><path d="M8 8h8M8 11h4"/><circle cx="16.5" cy="15.5" r="2.5"/><path d="M15.3 17.7L14.5 21l2-1 2 1-.8-3.3"/>',
  bday: '<path d="M4 21h16v-6.5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z"/><path d="M4 16.5c1.3.9 2.7.9 4 0s2.7-.9 4 0 2.7.9 4 0 2.7-.9 4 0"/><path d="M12 12.5V9"/><path d="M12 6.5c.8-.6 1-1.5 0-2.5-1 1-.8 1.9 0 2.5z"/>',
  anniv: '<circle cx="12" cy="9" r="5.5"/><path d="M8.6 13.4L7 21l5-2.5 5 2.5-1.6-7.6"/><path d="M12 6.5v5M9.5 9h5"/>',
  leave: '<path d="M10 20H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/><path d="M15 16l4-4-4-4"/><path d="M19 12H9"/>'
};
// Gave notice (Tim, Oct 26 2026): a departure logged with a last day still
// to come. They're on the team, and sign in, through that day.
const hcIsLeaving = d => !!(d && d.status === 'logged' && d.lastDay && d.lastDay >= today);
const hcLeavingFor = name => ((hcData && hcData.departures) || []).find(d => hcIsLeaving(d) && hcKey(d.name) === hcKey(name)) || null;
function hcMarks(p){
  if(!p) return [];
  const marks = [], month = today.slice(5, 7), st = hcPermitState(p);
  const going = hcLeavingFor(p.name);
  if(going) marks.push(['leave', 'is-leaving', `Leaving · last day ${hcDate(going.lastDay)}`]);
  if(st === 'expired') marks.push(['cert', 'is-expired', `Food handler certificate expired ${hcDate(p.permitExpires)}`]);
  if(st === 'soon') marks.push(['cert', 'is-soon', `Food handler certificate due ${hcDate(p.permitExpires)}`]);
  if(p.birthday && p.birthday.slice(5, 7) === month) marks.push(['bday', 'is-bday', `Birthday ${hcDate(today.slice(0, 5) + p.birthday.slice(5))}`]);
  if(p.hireDate && p.hireDate.slice(5, 7) === month && p.hireDate.slice(0, 4) < today.slice(0, 4)){
    const years = +today.slice(0, 4) - +p.hireDate.slice(0, 4);
    marks.push(['anniv', 'is-anniv', `${years}-year anniversary ${hcDate(today.slice(0, 5) + p.hireDate.slice(5))}`]);
  }
  return marks;
}
function hcMarkIcon([kind, cls, words]){
  return `<span class="hc-mark ${cls}" title="${escapeHtml(words)}" role="img" aria-label="${escapeHtml(words)}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${HC_ICONS[kind]}</svg></span>`;
}

function hcTeamHtml(){
  // Not someone who left (Tim, Oct 30 2026): off this list, on Rotated off.
  const team = ((hcData && hcData.team) || []).filter(t => !(typeof teamHasLeft === 'function' && teamHasLeft(t.name)));
  if(!team.length) return '';
  const others = (hcData.profiles || []).filter(p => !team.some(t => hcKey(t.name) === hcKey(p.name)) && !(typeof teamHasLeft === 'function' && teamHasLeft(p.name)));
  const row = (name, role, p) => {
    const age = hcAge(p && p.birthday);
    return `<button type="button" class="hc-prow" data-hc-profile="${escapeHtml(name)}" data-hc-find="${escapeHtml(hcKey(name))}">
      <span class="hc-prow-name"><b>${escapeHtml(name)}</b><small>${escapeHtml([HC_ROLE_LABELS[role] || '', p && p.hireDate ? hcYearsMonths(p.hireDate) : ''].filter(Boolean).join(' · '))}</small></span>
      ${age !== null && age < 18 ? '<span class="hc-chip is-minor">Under 18</span>' : ''}${hcMarks(p || {name}).map(hcMarkIcon).join('')}</button>`;
  };
  return `
    <section class="hc-card">
      <h3 class="hc-h">Profiles <span>${team.length} on the PIN list</span></h3>
      <input type="search" class="hc-find" id="hcFind" placeholder="Find someone" aria-label="Find someone" autocomplete="off">
      <p class="hc-legend"><span>${hcMarkIcon(['cert', 'is-expired', 'Certificate'])} Food handler certificate expired or due</span><span>${hcMarkIcon(['bday', 'is-bday', 'Birthday'])} Birthday this month</span><span>${hcMarkIcon(['anniv', 'is-anniv', 'Anniversary'])} Work anniversary this month</span>${(hcData.departures || []).some(hcIsLeaving) ? `<span>${hcMarkIcon(['leave', 'is-leaving', 'Leaving'])} Gave notice</span>` : ''}</p>
      <div class="hc-plist">${team.map(t => row(t.name, t.role, hcProfileFor(t.name))).join('')}</div>
      ${others.length ? `<details class="hc-others"><summary>Not on the PIN list (${others.length})</summary><div class="hc-plist">${others.map(p => row(p.name, '', p)).join('')}</div></details>` : ''}
      <div class="hc-team-go">
        <button type="button" class="btn btn-ghost" data-hc-import>Import permit dates from a spreadsheet</button>
        <button type="button" class="ld-link" data-hc-profile-new>Add a profile for someone not on the list</button>
      </div>
      <input type="file" id="hcImportFile" accept=".xlsx,.csv" hidden>
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
        ${hcMarks(p).map(m => `<span class="hc-mark-line">${hcMarkIcon(m)} ${escapeHtml(m[2])}</span>`).join('')}
      </div>
      ${p.isNew ? `<div class="field"><label for="hcpName">Name</label><input type="text" id="hcpName" maxlength="80" required></div>` : `<div class="hc-pin-line">${hcHasPin(p.name) ? '<b>PIN on file</b>' : '<b class="is-missing">No PIN on file</b>'}${hcPinFor === p.name ? '' : `<button type="button" class="ld-link" data-hc-pin-open="${escapeHtml(p.name)}">${hcHasPin(p.name) ? 'Change PIN' : 'Set PIN'}</button>`}</div>`}
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

// ----- PIN on file (Tim, Oct 25 2026) -----
// Who on the schedule (the last two weeks and the next two) has no clock-in
// PIN on file, before sign-in is required for every change. A director or
// someone on the admin team can put one on file, or change one; the server
// keeps it scrambled and never sends it back, so nobody can view a PIN.
let hcPinFor = null;      // the name whose PIN form is open
const HC_PIN_DAYS = 14;

function hcPinGaps(){
  const team = (hcData && hcData.team) || [];
  const from = hcAddDays(today, -HC_PIN_DAYS), to = hcAddDays(today, HC_PIN_DAYS);
  const names = new Map();
  [fohRoster, bohRoster, truckShifts, adminShifts].forEach(src => Object.entries(src || {}).forEach(([iso, list]) => {
    if(iso < from || iso > to || !Array.isArray(list)) return;
    // The imported schedules only: a name added by hand in Set Ups isn't
    // someone new (Tim, Oct 25 2026), and Set Ups now picks those from the team.
    list.forEach(p => { if(p && p.name && p.source !== 'manual' && !names.has(hcKey(p.name)) && !(typeof teamHasLeft === 'function' && teamHasLeft(p.name, iso))) names.set(hcKey(p.name), p.name); });
  }));
  const isDirector = n => (typeof dirList === 'function' ? dirList() : []).some(d => d && d.name && hcSame(d.name, n));
  const scheduled = [...names.values()].filter(n => !isDirector(n));
  const hasPin = n => team.some(t => hcKey(t.name) === hcKey(n) || hcSame(t.name, n));
  const missing = scheduled.filter(n => !hasPin(n)).sort((a, b) => a.localeCompare(b));
  return {scheduled: scheduled.length, missing};
}
function hcHasPin(name){ return ((hcData && hcData.team) || []).some(t => hcKey(t.name) === hcKey(name) || hcSame(t.name, name)); }

function hcPinFormHtml(name, role){
  return `<form class="hc-pin-form" data-hc-pin-form="${escapeHtml(name)}">
      <label class="hc-pin-label" for="hcPinIn">${hcHasPin(name) ? 'New' : ''} 6-digit PIN for ${escapeHtml(name)}</label>
      <div class="hc-pin-row">
        <input id="hcPinIn" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" required aria-label="PIN">
        <select id="hcPinRole" aria-label="Role">${['member', 'trainer', 'lead', 'admin'].map(r => `<option value="${r}"${r === (role || 'member') ? ' selected' : ''}>${HC_ROLE_LABELS[r]}</option>`).join('')}</select>
        <button type="submit" class="btn btn-primary" ${hcBusy ? 'disabled' : ''}>Save PIN</button>
        <button type="button" class="ld-link" data-hc-pin-cancel>Cancel</button>
      </div>
      <p class="hc-hint">Saved scrambled. Nobody can view it afterward, so tell them their PIN in person.</p>
    </form>`;
}

function hcPinCardHtml(){
  const {scheduled, missing} = hcPinGaps();
  if(!scheduled) return '';
  const have = scheduled - missing.length;
  // Folded under the profiles, not the first thing on the page (Tim, Oct 25
  // 2026); the line itself says how many are missing. Open while a PIN form is.
  const open = missing.includes(hcPinFor);
  return `<details class="hc-card hc-pins${missing.length ? ' has-gaps' : ''}"${open ? ' open' : ''}>
      <summary class="hc-h">PIN on file <span>${have} of ${scheduled} on the schedule${missing.length ? ` · <b class="is-missing">${missing.length} missing</b>` : ''}</span></summary>
      ${missing.length ? `<p class="hc-note">On the schedule in the last or next two weeks with no clock-in PIN on file. They can’t sign in until one is.</p>
        <ul class="hc-pin-list">${missing.map(n => `<li>${hcPinFor === n ? hcPinFormHtml(n) : `<span>${escapeHtml(n)}</span><button type="button" class="btn btn-ghost" data-hc-pin-open="${escapeHtml(n)}">Set PIN</button>`}</li>`).join('')}</ul>`
        : '<p class="hc-note hc-pins-ok">Everyone on the schedule has a PIN on file.</p>'}
    </details>`;
}

async function hcSavePin(name){
  const pin = (document.getElementById('hcPinIn') || {}).value || '';
  const role = (document.getElementById('hcPinRole') || {}).value || '';
  if(!/^\d{6}$/.test(pin)){ showToast('A clock-in PIN is 6 digits.'); return; }
  hcBusy = true;
  try{
    const res = await fetch(`${API_BASE}/api/team/pin`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name, pin, role})});
    const data = await res.json().catch(() => ({}));
    if(!res.ok){ showToast(data.error || 'Couldn’t save the PIN. Try again.'); return; }
    hcData = data;
    hcPinFor = null;
    if(hcProfile && hcKey(hcProfile.name) === hcKey(name)) hcProfile.role = role;
    showToast(`PIN on file for ${name}`);
  }catch(err){
    showToast('Couldn’t reach the server. Try again.');
  }finally{
    hcBusy = false;
    renderHeadcountView();
  }
}

// ----- Permit dates from a spreadsheet (Tim, Oct 20 2026) -----
// The server reads the sheet (permit_sheet.py) and hands back rows; each is
// matched to someone on the PIN list, shown with what it would change, and
// saved only when checked. Rows that match nobody start unticked.
let hcImport = null;      // {file, rows: [{...row, match, include}], columns, notes, skipped, busy}

// The sheet and the PIN list can spell a name differently ("Ana Ruiz" /
// "Ana Ruiz Lopez"): same first name, and the shorter last name in the longer.
function hcSame(a, b){
  const x = hcKey(a).split(' ').filter(Boolean), y = hcKey(b).split(' ').filter(Boolean);
  if(!x.length || !y.length) return false;
  if(x.join(' ') === y.join(' ')) return true;
  if(x[0] !== y[0] || x.length < 2 || y.length < 2) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return long.slice(1).includes(short[short.length - 1]);
}
function hcMatch(name){
  const people = [...(hcData.team || []).map(t => t.name), ...(hcData.profiles || []).map(p => p.name)];
  return people.find(n => hcKey(n) === hcKey(name)) || people.find(n => hcSame(n, name)) || '';
}

async function hcReadSheet(file){
  hcImport = {file: file.name, busy: true, rows: []};
  hcProfile = null; hcForm = null;
  renderHeadcountView();
  try{
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_BASE}/api/team/profiles/read`, {method: 'POST', body: fd});
    const data = await res.json().catch(() => ({}));
    if(!res.ok){ showToast(data.error || 'Couldn’t read that spreadsheet.'); hcImport = null; renderHeadcountView(); return; }
    // A workbook can hold a sheet per store (the store's has West Buda and
    // Buda): each is matched to the PIN list and the best match opens first.
    const sheets = (data.sheets && data.sheets.length ? data.sheets : [data]).map(s => {
      const rows = (s.rows || []).map(r => { const match = hcMatch(r.name); return {...r, match, include: !!match || !!r.director}; });
      const cols = Array.isArray(s.columns) ? s.columns : [s.columns || {}];
      return {sheet: s.sheet || '', rows, columns: cols, notes: s.notes || [], skipped: s.skipped || [], matched: rows.filter(r => r.match && !r.director).length};
    });
    const best = sheets.reduce((b, s, i) => s.matched > sheets[b].matched ? i : b, 0);
    hcImport = {file: file.name, busy: false, sheets, at: best, ...sheets[best]};
  }catch(err){
    showToast('Couldn’t reach the server. Try again.');
    hcImport = null;
  }
  renderHeadcountView();
  document.getElementById('headcountRoot').scrollIntoView({block: 'start'});
}

function hcImportHtml(){
  const I = hcImport;
  if(I.busy) return `<section class="hc-form"><h3 class="hc-h">Reading ${escapeHtml(I.file)}…</h3></section>`;
  const labels = {name: 'Name', first: 'First name', last: 'Last name', expiry: 'Permit expires', issued: 'Permit issued', permit: 'Permit', hireDate: 'Hire date', birthday: 'Birthday'};
  const change = (r, k, label) => {
    if(!r[k]) return '';
    const cur = r.match ? (hcProfileFor(r.match) || {})[k] : '';
    if(hcImpKeeps(r, k)) return `<span class="hc-imp-d is-same">${label}: keeps ${escapeHtml(hcDate(cur))} ${escapeHtml(cur.slice(0, 4))}, newer than the sheet’s ${escapeHtml(hcDate(r[k]))} ${escapeHtml(r[k].slice(0, 4))}</span>`;
    return `<span class="hc-imp-d${cur === r[k] ? ' is-same' : ''}">${label} ${escapeHtml(hcDate(r[k]))} ${escapeHtml(r[k].slice(0, 4))}${cur && cur !== r[k] ? ` <s>${escapeHtml(hcDate(cur))} ${escapeHtml(cur.slice(0, 4))}</s>` : ''}</span>`;
  };
  const on = I.rows.filter(r => r.include).length;
  const unmatched = I.rows.filter(r => !r.match && !r.director).length;
  return `
    <section class="hc-form hc-import">
      <h3 class="hc-h">Check before saving <span>${escapeHtml(I.file)}</span></h3>
      ${I.sheets.length > 1 ? `<div class="hc-imp-sheets" role="group" aria-label="Sheet">${I.sheets.map((s, n) => `<button type="button" class="uo-choice ${n === I.at ? 'is-on' : ''}" aria-pressed="${n === I.at}" data-hc-imp-sheet="${n}">${escapeHtml(s.sheet)} <small>${s.matched} of ${s.rows.length} on our PIN list</small></button>`).join('')}</div>` : ''}
      <p class="hc-note">${I.rows.length} ${I.rows.length === 1 ? 'person' : 'people'} with dates${I.sheets.length > 1 ? ` on “${escapeHtml(I.sheet)}”` : ''}, from ${I.columns.map(c => Object.keys(labels).filter(k => c[k]).map(k => `${labels[k]}: “${escapeHtml(c[k])}”`).join(' · ')).join('; and ')}.${unmatched ? ` ${unmatched} didn’t match anyone on the PIN list and ${unmatched === 1 ? 'starts' : 'start'} unticked.` : ''}</p>
      ${I.notes.map(n => `<p class="hc-note hc-imp-note">${escapeHtml(n)}</p>`).join('')}
      <div class="hc-imp-list">${I.rows.map((r, i) => `
        <label class="hc-imp-row${r.match || r.director ? '' : ' is-unmatched'}">
          <input type="checkbox" data-hc-imp="${i}" ${r.include ? 'checked' : ''}>
          <span class="hc-imp-who"><b>${escapeHtml(r.match || r.name)}</b>${r.match && hcKey(r.match) !== hcKey(r.name) ? `<small>“${escapeHtml(r.name)}” in the sheet</small>` : r.match ? '' : r.director ? '<small class="is-dir">director</small>' : '<small>not on the PIN list</small>'}</span>
          <span class="hc-imp-dates">${change(r, 'permitExpires', 'Permit')}${change(r, 'hireDate', 'Hired')}${change(r, 'birthday', 'Born')}</span>
        </label>`).join('')}
      </div>
      ${I.skipped.length ? `<details class="hc-others"><summary>${I.skipped.length} cell${I.skipped.length === 1 ? '' : 's'} couldn’t be read</summary>${I.skipped.map(s => `<p class="hc-note">${escapeHtml(s)}</p>`).join('')}</details>` : ''}
      <div class="hc-form-go">
        <button type="button" class="btn btn-primary" data-hc-imp-save ${on && !hcBusy ? '' : 'disabled'}>Save ${on} ${on === 1 ? 'profile' : 'profiles'}</button>
        <button type="button" class="btn btn-ghost" data-hc-imp-cancel>Cancel</button>
      </div>
    </section>`;
}

// A permit already saved with a later expiry than the sheet's is newer
// (renewed since the sheet was made): the sheet's older date is left out.
function hcImpKeeps(r, k){
  if(k !== 'permitExpires' || !r.match) return false;
  const cur = (hcProfileFor(r.match) || {}).permitExpires;
  return !!cur && cur > r[k];
}

async function hcSaveImport(){
  const rows = hcImport.rows.filter(r => r.include).map(r => {
    const out = {name: r.match || r.name};
    ['permitExpires', 'hireDate', 'birthday'].forEach(k => { if(r[k] && !hcImpKeeps(r, k)) out[k] = r[k]; });
    return out;
  }).filter(o => Object.keys(o).length > 1);     // nothing newer to save for someone: left out
  if(!rows.length){ showToast('Nothing newer to save: every date there is already up to date'); hcImport = null; renderHeadcountView(); return; }
  hcBusy = true;
  renderHeadcountView();
  try{
    const res = await fetch(`${API_BASE}/api/team/profiles/bulk`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({rows})});
    const data = await res.json().catch(() => ({}));
    if(!res.ok){ showToast(data.error || 'Couldn’t save. Try again.'); return; }
    hcData = data;
    hcImport = null;
    showToast(`Saved ${data.saved} profile${data.saved === 1 ? '' : 's'}`);
    if(typeof renderRightNow === 'function') renderRightNow();
  }catch(err){
    showToast('Couldn’t reach the server. Try again.');
  }finally{
    hcBusy = false;
    renderHeadcountView();
  }
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
        <div class="field hc-name-field"><label for="hcName">Name</label><input type="text" id="hcName" maxlength="80" value="${escapeHtml(f.name || '')}" ${f.id ? 'readonly' : 'placeholder="Start typing a name" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="hcNamePicks" aria-expanded="false"'} required>
          ${f.id ? '' : '<div class="tm-picks" id="hcNamePicks" role="listbox" aria-label="Team members"></div><p class="tm-pick-note" id="hcNameNote" aria-live="polite"></p>'}</div>
        ${hcRoleKnown(f) ? `<div class="field"><span class="hc-role-label">Role</span><p class="hc-role-known">${escapeHtml(HC_ROLE_LABELS[f.role] || f.role)}<small>${f.id ? '' : 'from the PIN list'}</small></p></div>`
          : `<div class="field"><label for="hcRole">Role</label><select id="hcRole">${roles.map(([id, l]) => `<option value="${id}"${id === (f.role || 'member') ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`}
        <div class="field"><label for="hcLastDay">Last day</label><input type="date" id="hcLastDay" value="${escapeHtml(f.lastDay || f.noticed || today)}" required></div>
      </div>
      <div class="uo-q"><span class="uo-q-label">What happened</span><div class="uo-choices">${(hcData.types || []).map(t => hcChoice('type', t.id, f.type, t.label)).join('')}</div></div>
      <div class="field"><label for="hcReason">Why, in a sentence or two</label><textarea id="hcReason" rows="3" maxlength="600" placeholder="What they said, or what led to it">${escapeHtml(f.reason || '')}</textarea></div>
      <div class="uo-q"><span class="uo-q-label">Eligible for rehire</span><div class="uo-choices">${HC_REHIRE.map(([id, l]) => hcChoice('rehire', id, f.rehire || 'unsure', l)).join('')}</div></div>
      ${f.id && f.status === 'logged' ? '' : '<p class="hc-note">Gave notice? Put their last day ahead: they stay on the team and can sign in through it. Saving takes them off the schedule after their last day; the day after it, they come off the clock-in PIN list (signed out) and out of every list that offers people.</p>'}
      <div class="hc-form-go">
        <button type="submit" class="btn btn-primary" ${hcBusy ? 'disabled' : ''}>Save</button>
        <button type="button" class="btn btn-ghost" data-hc-cancel>Cancel</button>
        ${f.id && f.status === 'logged' ? '<button type="button" class="ld-link hc-remove" data-hc-remove>Remove, logged by mistake</button>' : ''}
      </div>
    </form>`;
}

// ----- Who left: picked from the team, not typed (Tim, Oct 25 2026) -----
// The name box lists the team as it's typed: the clock-in PIN list (with
// each person's role, which fills in the Role box), anyone with a profile,
// and anyone on the imported schedules in the last eight weeks (someone whose
// PIN is already gone). Someone on none of them takes a second tap, "Not on
// the list? Use this name".
const HC_PICK_MAX = 8;
const HC_PICK_WEEKS = 8;
// The role is the PIN list's (Tim, Oct 25 2026: "the system should already
// know their role"): asked only for someone the hub has no role for.
function hcRoleKnown(f){ return !!(f && f.role && HC_ROLE_LABELS[f.role] && (f.id || f.roleKnown)); }
function hcPickPeople(){
  const out = new Map();
  const add = (name, role) => { const k = hcKey(name); if(name && !out.has(k)) out.set(k, {name, role: role || ''}); };
  ((hcData && hcData.team) || []).forEach(t => add(t.name, t.role));
  ((hcData && hcData.profiles) || []).forEach(p => add(p.name, ''));
  const since = hcAddDays(today, -HC_PICK_WEEKS * 7);
  [fohRoster, bohRoster, truckShifts].forEach(src => Object.entries(src || {}).forEach(([iso, list]) => {
    if(iso < since || !Array.isArray(list)) return;
    list.forEach(p => { if(p && p.name && p.source !== 'manual' && ![...out.values()].some(x => hcSame(x.name, p.name))) add(p.name, ''); });
  }));
  return [...out.values()].filter(p => !(typeof teamHasLeft === 'function' && teamHasLeft(p.name))).sort((a, b) => a.name.localeCompare(b.name));   // not who has left
}
function hcPickMatches(typed){
  const q = hcKey(typed).normalize('NFD').replace(/[̀-ͯ]/g, '');
  if(!q) return [];
  const fold = n => hcKey(n).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const people = hcPickPeople();
  const starts = people.filter(p => fold(p.name).startsWith(q));
  const inside = people.filter(p => !fold(p.name).startsWith(q) && fold(p.name).includes(q));
  return [...starts, ...inside].slice(0, HC_PICK_MAX);
}
function hcPickExact(typed){ const k = hcKey(typed); return k ? hcPickPeople().find(p => hcKey(p.name) === k) || null : null; }
function hcPickDraw(){
  const input = document.getElementById('hcName'), box = document.getElementById('hcNamePicks'), note = document.getElementById('hcNameNote');
  if(!input || !box || !hcForm) return;
  const typed = input.value;
  const exact = hcPickExact(typed);
  const list = exact ? [] : hcPickMatches(typed);
  box.innerHTML = list.map(p => `<button type="button" class="tm-pick" role="option" data-hc-pick="${escapeHtml(p.name)}">${escapeHtml(p.name)}${p.role && HC_ROLE_LABELS[p.role] ? `<small> · ${escapeHtml(HC_ROLE_LABELS[p.role])}</small>` : ''}</button>`).join('');
  input.setAttribute('aria-expanded', list.length ? 'true' : 'false');
  if(note) note.innerHTML = !typed.trim() || exact ? ''
    : hcForm.allowOff ? `Logging <b>${escapeHtml(typed.trim())}</b>, who isn’t on the PIN list, a profile or a recent schedule.`
    : `${list.length ? 'Pick them from the list.' : 'Nobody on the team by that name.'} <button type="button" class="ld-link" data-hc-pick-off>Not on the list? Use this name</button>`;
}
document.getElementById('headcountRoot').addEventListener('input', e => {
  if(e.target.id !== 'hcName' || !hcForm) return;
  hcForm.allowOff = false;
  if(hcForm.roleKnown){                      // a different name now: its role is asked again
    hcForm.name = e.target.value; hcForm.roleKnown = false;
    const pos = e.target.selectionStart;
    renderHeadcountView();
    const box = document.getElementById('hcName');
    if(box){ box.focus(); try{ box.setSelectionRange(pos, pos); }catch(err){} }
  }
  hcPickDraw();
});
document.getElementById('headcountRoot').addEventListener('click', e => {
  const pick = e.target.closest('[data-hc-pick]');
  if(pick && hcForm){
    const who = hcPickExact(pick.dataset.hcPick);
    hcFormRead();
    hcForm.name = pick.dataset.hcPick;
    hcForm.allowOff = false;
    if(who && who.role && HC_ROLE_LABELS[who.role]){ hcForm.role = who.role; hcForm.roleKnown = true; }
    else hcForm.roleKnown = false;
    renderHeadcountView();
    return;
  }
  if(e.target.closest('[data-hc-pick-off]') && hcForm){ hcForm.allowOff = true; hcPickDraw(); }
});

// After a departure is logged: off the schedule after their last day, and
// any Set Ups spot they held from then on is open again (Tim, Oct 25 2026:
// "no longer available for scheduling"). Returns what changed, for the toast.
function hcTakeOffSchedule(name, lastDay){
  const same = n => typeof rnSame === 'function' ? rnSame(n, name) : hcKey(n) === hcKey(name);
  let shifts = 0, spots = 0;
  [fohRoster, bohRoster, truckShifts, adminShifts].forEach(src => Object.keys(src || {}).forEach(iso => {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso <= lastDay || !Array.isArray(src[iso])) return;
    const kept = src[iso].filter(p => !(p && p.name && same(p.name)));
    shifts += src[iso].length - kept.length;
    if(kept.length) src[iso] = kept; else delete src[iso];
  }));
  Object.keys(posAssignments || {}).forEach(k => {
    const iso = k.split('||')[1] || '';
    if(iso <= lastDay) return;
    const names = suSplitNames(posAssignments[k]);
    const kept = names.filter(n => !same(n));
    if(kept.length === names.length) return;
    spots += names.length - kept.length;
    if(kept.length) posAssignments[k] = kept.join('/'); else delete posAssignments[k];
  });
  return {shifts, spots};
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

const HC_REHIRE_NOTE = {yes: 'Rehire: yes', no: 'Rehire: no', unsure: ''};
function hcDepHtml(d, leaving){
  return `
        <div class="hc-dep">
          <div class="hc-dep-top"><b>${escapeHtml(d.name)}</b><span class="hc-chip is-${escapeHtml(d.type)}">${escapeHtml(hcTypeLabel(d.type))}</span><span class="hc-dep-date">${leaving ? 'Last day ' : ''}${escapeHtml(hcDate(d.lastDay))}</span></div>
          ${d.reason ? `<p class="hc-dep-why">${escapeHtml(d.reason)}</p>` : ''}
          <div class="hc-dep-foot"><span>${escapeHtml([HC_ROLE_LABELS[d.role] || '', leaving && d.noticed ? `gave notice ${hcDate(d.noticed)}` : '', HC_REHIRE_NOTE[d.rehire] || '', d.by ? `logged by ${d.by}` : ''].filter(Boolean).join(' · '))}</span><button type="button" class="ld-link" data-hc-edit="${escapeHtml(d.id)}">Edit</button></div>
        </div>`;
}

// Gave notice: still on the team, soonest last day first.
function hcLeavingHtml(s){
  if(!s.leaving.length) return '';
  return `
    <section class="hc-card">
      <h3 class="hc-h">Leaving <span class="hc-count">${s.leaving.length}</span></h3>
      <p class="hc-note">Gave notice. On the team and signing in through their last day; off the schedule after it.</p>
      ${s.leaving.map(d => hcDepHtml(d, true)).join('')}
    </section>`;
}

// Who has rotated off in the last 12 months (Tim, Oct 30 2026): their
// name, when they were hired (the profile's hire date) and their last day.
// The rest of what was logged (why, rehire) opens with Edit; older ones stay
// on file behind "Show older".
function hcDeparturesHtml(s){
  const list = s.logged.slice().sort((a, b) => hcWhen(b).localeCompare(hcWhen(a)) || (b.at || 0) - (a.at || 0));
  if(!list.length) return `<section class="hc-card"><h3 class="hc-h">Rotated off <span>last 12 months</span></h3><p class="hc-note">None logged yet.</p></section>`;
  const since = hcAddDays(today, -365);
  const year = list.filter(d => hcWhen(d) >= since), older = list.length - year.length;
  const shown = hcShowAll ? list : year;
  return `
    <section class="hc-card">
      <h3 class="hc-h">Rotated off <span>${hcShowAll ? 'all' : 'last 12 months'} · ${shown.length}</span></h3>
      ${shown.length ? `<div class="hc-off-head"><span>Name</span><span>Hired</span><span>Left</span><span></span></div>${shown.map(hcOffRowHtml).join('')}` : '<p class="hc-note">Nobody in the last 12 months.</p>'}
      ${older && !hcShowAll ? `<button type="button" class="ld-link hc-more" data-hc-all>Show ${older} older</button>` : ''}
    </section>`;
}
function hcOffRowHtml(d){
  const p = hcProfileFor(d.name);
  return `<div class="hc-off-row">
      <span class="hc-off-name"><b>${escapeHtml(d.name)}</b><small>${escapeHtml([HC_ROLE_LABELS[d.role] || '', hcTypeLabel(d.type)].filter(Boolean).join(' · '))}</small></span>
      <span class="hc-off-date">${p && p.hireDate ? escapeHtml(hcDate(p.hireDate)) : '<i>not on file</i>'}</span>
      <span class="hc-off-date">${escapeHtml(hcDate(d.lastDay))}</span>
      <button type="button" class="ld-link" data-hc-edit="${escapeHtml(d.id)}">Edit</button>
    </div>`;
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
    ${typeof apPanelHtml === 'function' ? apPanelHtml() : ''}
    ${hcForm ? hcFormHtml() : ''}
    ${hcImport ? hcImportHtml() : ''}
    ${hcProfile ? hcProfileHtml() : ''}
    ${hcProfile && !hcProfile.isNew && typeof apProfileHtml === 'function' ? apProfileHtml(hcProfile) : ''}
    ${hcProfile && !hcProfile.isNew && hcPinFor === hcProfile.name ? hcPinFormHtml(hcProfile.name, hcProfile.role) : ''}
    ${hcPendingHtml(s)}
    ${hcLeavingHtml(s)}
    ${hcTeamHtml()}
    ${hcPinCardHtml()}
    ${hcDeparturesHtml(s)}
    ${hcWhyHtml(s)}
    ${hcHistoryHtml()}`;
  if(hcForm && !hcForm.id) hcPickDraw();
}

async function hcSend(method, body){
  hcBusy = true;
  try{
    const res = await fetch(`${API_BASE}/api/team/departures`, {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    const data = await res.json().catch(() => ({}));
    if(!res.ok){ showToast(data.error || 'Couldn’t save. Try again.'); return false; }
    hcData = data;
    // Every list that offers people drops (or gets back) them now, not on the next load.
    teamLeftSet(data.departed);
    if(typeof tmPinNames !== 'undefined'){ tmPinNames = null; teamNamesLoad(); }
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
  if(t.dataset.hcPinOpen){ hcPinFor = t.dataset.hcPinOpen; renderHeadcountView(); const box = document.getElementById('hcPinIn'); if(box) box.focus(); return; }
  if(t.hasAttribute('data-hc-pin-cancel')){ hcPinFor = null; renderHeadcountView(); return; }
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
  if(t.hasAttribute('data-hc-import')){ const f = document.getElementById('hcImportFile'); if(f){ f.value = ''; f.click(); } return; }
  if(t.hasAttribute('data-hc-imp-cancel')){ hcImport = null; renderHeadcountView(); return; }
  if(t.dataset.hcImpSheet !== undefined && hcImport){
    const n = Number(t.dataset.hcImpSheet);
    hcImport.sheets[hcImport.at] = {...hcImport.sheets[hcImport.at], rows: hcImport.rows};   // keep the ticks
    hcImport = {...hcImport, at: n, ...hcImport.sheets[n]};
    renderHeadcountView();
    return;
  }
  if(t.hasAttribute('data-hc-imp-save')){ if(!hcBusy) hcSaveImport(); return; }
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

// The spreadsheet picked; a row ticked or unticked.
document.getElementById('headcountRoot').addEventListener('change', e => {
  if(e.target.id === 'hcImportFile' && e.target.files && e.target.files[0]){ hcReadSheet(e.target.files[0]); return; }
  if(e.target.dataset && e.target.dataset.hcImp !== undefined && hcImport){
    hcImport.rows[+e.target.dataset.hcImp].include = e.target.checked;
    const on = hcImport.rows.filter(r => r.include).length;
    const b = document.querySelector('#headcountRoot [data-hc-imp-save]');
    if(b){ b.textContent = `Save ${on} ${on === 1 ? 'profile' : 'profiles'}`; b.disabled = !on; }
  }
});

// Find someone: hide the other rows (no re-render, so typing keeps going).
document.getElementById('headcountRoot').addEventListener('input', e => {
  if(e.target.id !== 'hcFind') return;
  const q = hcKey(e.target.value);
  document.querySelectorAll('#headcountRoot .hc-plist [data-hc-find]').forEach(r => { r.hidden = !!q && !r.dataset.hcFind.includes(q); });
});

document.getElementById('headcountRoot').addEventListener('submit', async e => {
  const pinForm = e.target.closest('[data-hc-pin-form]');
  if(pinForm){ e.preventDefault(); e.stopPropagation(); if(!hcBusy) hcSavePin(pinForm.dataset.hcPinForm); return; }
  if(e.target.closest('[data-hc-profile-form]')){ e.preventDefault(); if(!hcBusy) hcSaveProfile(); return; }
  if(!e.target.closest('[data-hc-form]')) return;
  e.preventDefault();
  if(hcBusy) return;
  hcFormRead();
  if(!hcForm.type){ showToast('Pick what happened: quit, let go, …'); return; }
  // Someone from the team, by the name the team list has (hcPick*).
  if(!hcForm.id){
    const known = hcPickExact(hcForm.name);
    if(!known && !hcForm.allowOff){ hcPickDraw(); showToast('Pick them from the list, or tap “Not on the list? Use this name”'); return; }
    if(known) hcForm.name = known.name;
  }
  const f = hcForm;
  const ok = await hcSend('POST', {id: f.id || '', name: f.name, role: f.role, lastDay: f.lastDay, type: f.type, reason: f.reason, rehire: f.rehire});
  if(ok){
    // Off the schedule and Set Ups after their last day (directors save both).
    const off = typeof launchManager !== 'undefined' && launchManager ? hcTakeOffSchedule(f.name, f.lastDay) : {shifts: 0, spots: 0};
    if(off.shifts || off.spots){
      if(typeof renderAllDayparts === 'function') renderAllDayparts();
      saveState();
    }
    const more = [off.shifts ? `${off.shifts} shift${off.shifts === 1 ? '' : 's'} off the schedule` : '', off.spots ? `${off.spots} Set Ups spot${off.spots === 1 ? '' : 's'} open` : ''].filter(Boolean).join(' · ');
    showToast(`${f.lastDay >= today ? `Logged: ${f.name} leaves after ${hcDate(f.lastDay)}` : `Logged: ${f.name}`}${more ? ' · ' + more : ''}`);
    hcForm = null;
    renderHeadcountView();
    if(typeof renderRightNow === 'function') renderRightNow();
  }
});
