// ===== TEAM PROFILES, THE ADMIN SIDE (Ashley; Tim, Oct 28 2026) =====
// On each person's profile in Our Team: their level in the restaurant, their
// infraction points this quarter (from Directors → Points), their PTO (hours
// a year by level, from January 1, no carry-over: allowance, used, left, and
// the days taken the Admin Team logged), and for directors the $500 a year
// uniform credit (approved, waiting, left, and each request). At the top of
// Our Team: uniform credit requests for the Admin Team to approve or deny
// (with the receipt), Log PTO, and the PTO hours for each level.
//
// A director sends a request from the Uniform credit card in Forms, or from
// their Home card: the amount, the receipt's date, a note and a photo of the
// receipt (always). Each person sees their own level, PTO and credit on their
// Home card (right-now.js asks apRightNowRows), never anyone else's, and not
// their points.
//
// The server is team_extras.py; everything is HR data kept under secure/.
// People's text reaches the page only through escapeHtml.

let apData = null;          // Our Team: everyone's ({people, levels, ptoHours, pending, canDecide, year})
let apLoading = false;
let apMine = null;          // the signed-in person's own (/api/me/extras)
let apMineAt = 0, apMineWho = '';
let apSheet = null;         // the sheet open: {kind: 'credit' | 'mine', ...}
let apBusy = false;
const AP_MINE_EVERY = 5 * 60 * 1000;
const AP_ICON_SHIRT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3.5L3 6.5l2 4.5 3-1.2V21h8V9.8l3 1.2 2-4.5-5-3c-.6 1.5-2.1 2.4-4 2.4S8.6 5 8 3.5z"/></svg>';
const AP_ICON_X = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

const apMoney = n => '$' + (Math.round(Number(n || 0) * 100) / 100).toFixed(2).replace(/\.00$/, '');
const apHours = n => (n === null || n === undefined) ? '–' : `${Math.round(Number(n) * 100) / 100} h`;
const apDay = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : '';
const apLevelLabel = id => ((apData && apData.levels) || AP_LEVELS).find(l => l.id === id)?.label || '';
const AP_LEVELS = [['member', 'Team Member'], ['cert_member', 'Certified Team Member'], ['trainer', 'Trainer'], ['cert_trainer', 'Certified Trainer'],
  ['lead', 'Team Lead'], ['cert_lead', 'Certified Team Lead'], ['director', 'Director'], ['cert_director', 'Certified Director'],
  ['executive', 'Executive'], ['cert_executive', 'Certified Executive'], ['operator', 'Operator']].map(([id, label]) => ({id, label}));

async function apCall(path, body){
  const res = await fetch(`${API_BASE}${path}`, body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {cache: 'no-store'});
  const data = await res.json().catch(() => ({}));
  if(!res.ok){ const e = new Error(data.error || 'Couldn’t reach the server. Try again.'); e.status = res.status; throw e; }
  return data;
}

// ----- Our Team -----
function apEnsure(){ if(!apData && !apLoading && typeof hcAllowed === 'function' && hcAllowed()) apLoad(); }
async function apLoad(){
  apLoading = true;
  try { apData = await apCall('/api/team/extras'); }
  catch(e){ apData = null; }
  finally { apLoading = false; }
  if(typeof renderHeadcountView === 'function' && document.getElementById('headcountView') && document.getElementById('headcountView').classList.contains('active')) renderHeadcountView();
}
async function apPost(path, body, ok){
  if(apBusy) return false;
  apBusy = true;
  try {
    const d = await apCall(path, body);
    if(d.people) apData = d;
    if(ok) showToast(ok);
    renderHeadcountView();
    return true;
  } catch(e){ showToast(e.message); return false; }
  finally { apBusy = false; }
}
function apPerson(name){ return ((apData && apData.people) || []).find(p => hcKey(p.name) === hcKey(name)) || null; }

// The profile's sections, under the profile form.
function apProfileHtml(profile){
  if(!apData){ apEnsure(); return '<section class="ap-sec"><p class="hc-note">Loading level, points and PTO…</p></section>'; }
  const p = apPerson(profile.name);
  if(!p) return '<section class="ap-sec"><p class="hc-note">Not on the PIN list or the Directors list, so no level, PTO or uniform credit.</p></section>';
  return `<section class="ap-sec" aria-label="Level, points, PTO">
      ${apLevelHtml(p)}
      ${apPointsHtml(p.name)}
      ${apPtoHtml(p)}
      ${p.credit ? apCreditHtml(p) : ''}
    </section>`;
}
function apLevelHtml(p){
  const role = typeof HC_ROLE_LABELS !== 'undefined' ? HC_ROLE_LABELS[p.role] : '';
  return `<div class="ap-block"><h4>Level</h4>
      <select class="ap-in" data-ap-level="${escapeHtml(p.name)}" aria-label="Level">
        <option value="" ${p.levelSet ? '' : 'selected'}>From the PIN list${role ? `: ${escapeHtml(role)}` : ''}</option>
        ${apData.levels.map(l => `<option value="${l.id}" ${p.levelSet && p.level === l.id ? 'selected' : ''}>${escapeHtml(l.label)}</option>`).join('')}
      </select>
      <small class="ap-sub">${p.level ? `Now: <b>${escapeHtml(apLevelLabel(p.level))}</b>. ` : 'No level yet. '}It sets their PTO hours.</small></div>`;
}
// Points from Directors → Points (points.js), this quarter.
function apPointsHtml(name){
  if(typeof ptScored !== 'function' || typeof pointsRecords === 'undefined' || !pointsRecords) return '';
  let s = null;
  try { s = ptScored()[ptKeyFor(name)] || null; } catch(e){ return ''; }
  const total = s ? s.score.total : 0;
  const events = s ? s.score.events.slice(-3).reverse() : [];
  const label = e => (APS.TYPES[e.type] && APS.TYPES[e.type].label) || e.type;
  return `<div class="ap-block"><h4>Points this quarter</h4>
      <div class="ap-big"><b>${total}</b>${typeof ptLevelChip === 'function' ? ptLevelChip(total) : ''}</div>
      ${events.length ? `<ul class="ap-list">${events.map(e => `<li><span>${escapeHtml(apDay(e.date))}</span>${escapeHtml(label(e))}<b>${e.pts > 0 ? '+' : ''}${e.pts}</b></li>`).join('')}</ul>` : '<small class="ap-sub">Nothing this quarter.</small>'}
      <small class="ap-sub">From Directors → Points.</small></div>`;
}
function apPtoHtml(p){
  const t = p.pto, year = apData.year;
  if(t.off) return '';           // the Operator: no PTO
  return `<div class="ap-block"><h4>PTO ${escapeHtml(year)}</h4>
      <div class="ap-stats">
        <div><b>${apHours(t.allowance)}</b><span>a year${t.basis ? ` (${escapeHtml(t.basis)})` : p.level ? ` as ${escapeHtml(apLevelLabel(p.level))}` : ''}</span></div>
        <div><b>${apHours(t.used)}</b><span>used</span></div>
        <div class="is-left"><b>${apHours(t.left)}</b><span>left</span></div>
      </div>
      ${t.allowance === 0 && !t.used ? `<small class="ap-sub">No PTO yet: it starts at Certified Team Member.</small>` : ''}
      ${t.basis ? `<small class="ap-sub">PTO goes with the highest certified level reached: ${escapeHtml(t.basis)}.</small>` : ''}
      ${t.allowance === null ? `<small class="ap-sub">${p.level ? 'No hours set for their certified level yet: set them under PTO hours by level, at the top of Our Team.' : 'Set their level to give them PTO hours.'}</small>` : ''}
      ${t.entries.length ? `<ul class="ap-list">${t.entries.map(e => `<li><span>${escapeHtml(apDay(e.date))}</span>${escapeHtml(e.note || 'PTO')}<b>${apHours(e.hours)}</b><button type="button" class="ap-x" data-ap-pto-del="${escapeHtml(e.id)}" aria-label="Remove this PTO">${AP_ICON_X}</button></li>`).join('')}</ul>` : ''}
      ${apPtoFormHtml(p.name)}
      <small class="ap-sub">Resets January 1; unused hours don’t carry over.</small></div>`;
}
function apPtoFormHtml(name){
  return `<form class="ap-pto-form" data-ap-pto-form>
      ${name ? `<input type="hidden" name="name" value="${escapeHtml(name)}">` : `<select class="ap-in" name="name" aria-label="Who"><option value="">Who took it?</option>${apData.people.map(p => `<option>${escapeHtml(p.name)}</option>`).join('')}</select>`}
      <input class="ap-in" type="date" name="date" value="${escapeHtml(today)}" aria-label="Day">
      <input class="ap-in" type="number" name="hours" step="0.25" min="0.25" max="400" inputmode="decimal" placeholder="Hours" aria-label="Hours">
      <input class="ap-in ap-grow" type="text" name="note" maxlength="400" placeholder="Note (optional)" aria-label="Note">
      <button type="submit" class="btn btn-primary">Log PTO</button>
    </form>`;
}
function apCreditHtml(p){
  const c = p.credit;
  return `<div class="ap-block"><h4>Uniform credit ${escapeHtml(apData.year)}</h4>
      <div class="ap-stats">
        <div><b>${apMoney(c.perYear)}</b><span>a year</span></div>
        <div><b>${apMoney(c.used)}</b><span>approved</span></div>
        <div class="is-left"><b>${apMoney(c.left)}</b><span>left</span></div>
      </div>
      ${c.pending ? `<small class="ap-sub">${apMoney(c.pending)} waiting on the Admin Team.</small>` : ''}
      ${c.requests.length ? `<ul class="ap-list">${c.requests.map(apRequestLine).join('')}</ul>` : '<small class="ap-sub">No requests this year.</small>'}
    </div>`;
}
function apRequestLine(r){
  const st = {pending: 'Waiting', approved: 'Approved', denied: 'Denied'}[r.status] || r.status;
  return `<li><span>${escapeHtml(apDay(r.date))}</span>${escapeHtml(r.note || 'Uniform')}${r.decisionNote ? ` <i>(${escapeHtml(r.decisionNote)})</i>` : ''}
      <b>${apMoney(r.amount)}</b><em class="ap-st is-${escapeHtml(r.status)}">${escapeHtml(st)}</em>
      ${r.hasReceipt ? `<a class="ap-rc" href="${API_BASE}/api/team/credit/receipt/${encodeURIComponent(r.id)}" target="_blank" rel="noopener">Receipt</a>` : ''}</li>`;
}

// The top of Our Team: requests to decide, Log PTO, PTO hours by level.
function apPanelHtml(){
  if(!apData){ apEnsure(); return ''; }
  const pend = apData.pending || [];
  return `<section class="ap-panel">
      ${pend.length ? `<div class="ap-review"><h3 class="hc-h">Uniform credit to review <span class="ap-count">${pend.length}</span></h3>
        ${pend.map(r => `<div class="ap-req">
          <a class="ap-thumb" href="${API_BASE}/api/team/credit/receipt/${encodeURIComponent(r.id)}" target="_blank" rel="noopener" aria-label="Open the receipt"><img src="${API_BASE}/api/team/credit/receipt/${encodeURIComponent(r.id)}" alt="Receipt" loading="lazy"></a>
          <div class="ap-req-body"><b>${escapeHtml(r.name)}</b> · ${apMoney(r.amount)} · receipt ${escapeHtml(apDay(r.date))}
            ${r.note ? `<p>${escapeHtml(r.note)}</p>` : ''}
            ${apData.canDecide ? `<div class="ap-req-go"><input class="ap-in ap-grow" type="text" maxlength="400" placeholder="Note (optional)" data-ap-note="${escapeHtml(r.id)}" aria-label="Note">
              <button type="button" class="btn btn-primary" data-ap-decide="${escapeHtml(r.id)}" data-d="approved">Approve</button>
              <button type="button" class="btn btn-ghost" data-ap-decide="${escapeHtml(r.id)}" data-d="denied">Deny</button></div>` : '<small class="ap-sub">Waiting on the Admin Team.</small>'}
          </div></div>`).join('')}</div>` : ''}
      <details class="ap-more"><summary>Log PTO</summary>${apPtoFormHtml('')}</details>
      <details class="ap-more"><summary>PTO hours by level</summary>
        <form class="ap-hours" data-ap-hours-form>
          ${apData.levels.filter(l => l.id.startsWith('cert_')).map(l => `<label><span>${escapeHtml(l.label)}</span><input class="ap-in" type="number" min="0" max="2000" step="0.5" inputmode="decimal" name="${l.id}" value="${apData.ptoHours[l.id] ?? ''}" placeholder="–"> h a year</label>`).join('')}
          <button type="submit" class="btn btn-primary">Save hours</button>
          <small class="ap-sub">Each person gets the hours of the highest certified level they’ve reached (a Trainer gets a Certified Team Member’s), for the year from January 1. Unused hours don’t carry over.</small>
        </form></details>
    </section>`;
}

// ----- the signed-in person's own -----
function apMineLoad(force){
  const who = typeof acUser !== 'undefined' && acUser && acUser.name ? acUser.name : '';
  if(!who){ if(apMine){ apMine = null; apMineWho = ''; } return; }
  if(!force && apMineWho === who && Date.now() - apMineAt < AP_MINE_EVERY) return;
  apMineWho = who; apMineAt = Date.now();
  apCall('/api/me/extras').then(d => {
    if(apMineWho !== who) return;
    const had = apCreditShown();
    apMine = d && d.name ? d : null;
    const home = document.getElementById('homeView');
    if(home && home.classList.contains('active') && typeof renderRightNow === 'function') renderRightNow();
    if(had !== apCreditShown() && typeof renderForms === 'function' && document.getElementById('formsView') && document.getElementById('formsView').classList.contains('active')) renderForms();
  }).catch(() => {});
}
function apCreditShown(){ return !!(apMine && apMine.credit); }

// Lines for the Home card (right-now.js): my level and PTO, my uniform
// credit, and for the Admin Team the requests waiting on them.
function apRightNowRows(){
  apMineLoad();
  const m = apMine, rows = [];
  if(!m) return rows;
  const row = (n, text, es, go, tone) => ({n, text, es: es || '', go: go || '', tone: tone || ''});
  if(m.toReview) rows.push(row(String(m.toReview), `uniform credit request${m.toReview === 1 ? '' : 's'} to review`, '', 'headcount', 'warn'));
  if(m.pto && m.pto.allowance) rows.push(row(apHours(m.pto.left).replace(' h', 'h'), `PTO left in ${m.year}${m.levelLabel ? ` · ${m.levelLabel}` : ''}`, esText('PTO left this year'), 'mine', m.pto.left ? '' : 'warn'));
  if(m.credit) rows.push(row(apMoney(m.credit.left), `uniform credit left in ${m.year}${m.credit.pending ? `, ${apMoney(m.credit.pending)} waiting` : ''}`, '', 'credit', ''));
  return rows;
}

// ----- sheets: my profile, and a uniform credit request -----
function apOpenMine(){ apMineLoad(true); apSheet = {kind: 'mine'}; apDraw(); }
function apOpenCredit(){ apMineLoad(true); apSheet = {kind: 'credit', amount: '', date: today, note: '', photo: null}; apDraw(); }
function apClose(){ apSheet = null; apDraw(); }
function apDraw(){
  let layer = document.getElementById('apLayer');
  if(!layer){ layer = document.createElement('div'); layer.id = 'apLayer'; layer.className = 'ap-layer'; document.body.appendChild(layer); }
  layer.hidden = !apSheet;
  document.body.classList.toggle('ap-open', !!apSheet);
  if(!apSheet){ layer.innerHTML = ''; return; }
  const m = apMine;
  const body = apSheet.kind === 'credit' ? apCreditSheet(m) : apMineSheet(m);
  layer.innerHTML = `<div class="ap-scrim" data-ap-close></div><div class="ap-sheet" role="dialog" aria-modal="true" aria-labelledby="apTitle">${body}</div>`;
}
function apMineSheet(m){
  if(!m) return `<div class="ap-head"><h2 id="apTitle">Your profile</h2><button type="button" class="ap-close" data-ap-close aria-label="Close">${AP_ICON_X}</button></div><p class="hc-note">Loading…</p>`;
  const t = m.pto;
  return `<div class="ap-head"><h2 id="apTitle">${escapeHtml(m.name)}</h2><button type="button" class="ap-close" data-ap-close aria-label="Close">${AP_ICON_X}</button></div>
    <p class="ap-sub">${m.levelLabel ? `Level: <b>${escapeHtml(m.levelLabel)}</b>` : 'No level set yet.'}</p>
    <div class="ap-block"><h4>PTO ${escapeHtml(m.year)}</h4>
      <div class="ap-stats"><div><b>${apHours(t.allowance)}</b><span>a year</span></div><div><b>${apHours(t.used)}</b><span>used</span></div><div class="is-left"><b>${apHours(t.left)}</b><span>left</span></div></div>
      ${t.entries.length ? `<ul class="ap-list">${t.entries.map(e => `<li><span>${escapeHtml(apDay(e.date))}</span>${escapeHtml(e.note || 'PTO')}<b>${apHours(e.hours)}</b></li>`).join('')}</ul>` : ''}
      <small class="ap-sub">Resets January 1; unused hours don’t carry over. The admin team logs PTO taken.</small></div>
    ${m.credit ? `<div class="ap-block"><h4>Uniform credit ${escapeHtml(m.year)}</h4>
      <div class="ap-stats"><div><b>${apMoney(m.credit.perYear)}</b><span>a year</span></div><div><b>${apMoney(m.credit.used)}</b><span>approved</span></div><div class="is-left"><b>${apMoney(m.credit.left)}</b><span>left</span></div></div>
      ${m.credit.requests.length ? `<ul class="ap-list">${m.credit.requests.map(apRequestLine).join('')}</ul>` : ''}
      <button type="button" class="btn btn-primary" data-ap-credit-open>Send a receipt</button></div>` : ''}`;
}
function apCreditSheet(m){
  const f = apSheet, left = m && m.credit ? m.credit.left : null;
  return `<div class="ap-head"><h2 id="apTitle">Uniform credit</h2><button type="button" class="ap-close" data-ap-close aria-label="Close">${AP_ICON_X}</button></div>
    <p class="ap-sub">${left === null ? 'For directors: $500 a calendar year.' : `${apMoney(left)} left in ${escapeHtml(m.year)}${m.credit.pending ? `, ${apMoney(m.credit.pending)} waiting on the admin team` : ''}.`} The admin team checks the receipt and approves it.</p>
    <form class="ap-credit-form" data-ap-credit-form>
      <label>Amount<input class="ap-in" type="number" name="amount" min="0.01" max="500" step="0.01" inputmode="decimal" required value="${escapeHtml(f.amount)}"></label>
      <label>Receipt date<input class="ap-in" type="date" name="date" max="${escapeHtml(today)}" required value="${escapeHtml(f.date)}"></label>
      <label>What it was for<input class="ap-in" type="text" name="note" maxlength="400" placeholder="Two jackets, black pants" value="${escapeHtml(f.note)}"></label>
      <label class="btn btn-ghost ap-photo">${AP_ICON_SHIRT}<span>${f.photo ? 'Receipt added. Replace' : 'Photo of the receipt'}</span><input type="file" accept="image/*" capture="environment" data-ap-photo hidden></label>
      ${f.photo ? `<img class="ap-preview" src="${escapeHtml(f.photo)}" alt="The receipt">` : '<small class="ap-sub">A photo of the receipt is required; it’s kept on file for expense reports.</small>'}
      <button type="submit" class="btn btn-primary" ${f.photo && !apBusy ? '' : 'disabled'}>Send to the admin team</button>
    </form>`;
}
function apShrink(file){
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      let q = 0.8, out = c.toDataURL('image/jpeg', q);
      while(out.length > 900000 && q > 0.35){ q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      res(out);
    };
    img.onerror = () => rej(new Error('That photo couldn’t be read. Try another.'));
    img.src = url;
  });
}

// ----- what people do -----
document.addEventListener('change', async e => {
  const t = e.target;
  if(t.dataset && t.dataset.apLevel !== undefined){ apPost('/api/team/level', {name: t.dataset.apLevel, level: t.value}, 'Level saved'); return; }
  if(t.matches && t.matches('[data-ap-photo]') && t.files[0] && apSheet){
    const form = t.closest('form');
    if(form){ apSheet.amount = form.amount.value; apSheet.date = form.date.value; apSheet.note = form.note.value; }
    try { apSheet.photo = await apShrink(t.files[0]); apDraw(); } catch(err){ showToast(err.message); }
  }
});
document.addEventListener('submit', async e => {
  const f = e.target;
  if(f.matches('[data-ap-pto-form]')){
    e.preventDefault(); e.stopPropagation();
    const body = {name: f.name.value, date: f.date.value, hours: f.hours.value, note: f.note.value};
    if(await apPost('/api/team/pto', body, `PTO logged: ${body.hours} h`)) f.reset();
  } else if(f.matches('[data-ap-hours-form]')){
    e.preventDefault(); e.stopPropagation();
    const hours = {};
    [...f.querySelectorAll('input[type="number"]')].forEach(i => { if(i.value !== '') hours[i.name] = i.value; });
    apPost('/api/team/pto-hours', {hours}, 'PTO hours saved');
  } else if(f.matches('[data-ap-credit-form]')){
    e.preventDefault();
    if(apBusy || !apSheet || !apSheet.photo) return;
    apBusy = true; apDraw();
    try {
      const d = await apCall('/api/team/credit', {amount: f.amount.value, date: f.date.value, note: f.note.value, receipt: apSheet.photo});
      apMine = d && d.name ? d : apMine; apMineAt = Date.now();
      showToast('Sent to the admin team');
      apSheet = {kind: 'mine'};
      if(typeof renderRightNow === 'function') renderRightNow();
    } catch(err){ showToast(err.message); }
    finally { apBusy = false; apDraw(); }
  }
});
document.addEventListener('click', e => {
  const t = e.target.closest('[data-ap-close], [data-ap-credit-open], [data-ap-decide], [data-ap-pto-del]');
  if(!t) return;
  if(t.hasAttribute('data-ap-close')){ apClose(); return; }
  if(t.hasAttribute('data-ap-credit-open')){ apOpenCredit(); return; }
  if(t.dataset.apDecide){
    const note = (document.querySelector(`[data-ap-note="${CSS.escape(t.dataset.apDecide)}"]`) || {}).value || '';
    apPost('/api/team/credit/decide', {id: t.dataset.apDecide, decision: t.dataset.d, note}, t.dataset.d === 'approved' ? 'Approved' : 'Denied');
    return;
  }
  if(t.dataset.apPtoDel){ apPost('/api/team/pto', {id: t.dataset.apPtoDel, remove: true}, 'PTO removed'); }
});
document.addEventListener('keydown', e => { if(e.key === 'Escape' && apSheet) apClose(); });
