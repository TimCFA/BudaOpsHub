// ===== ME (Tim, Oct 30 2026) =====
// Each person's own page, opened by tapping their name at the top (sign-in.js):
//   About me   their level, how long they've been with us, their birthday
//   My week    this week's shifts (the Schedule's), today's spots and break
//   Growing    their PEA per position, and Next level: the 360 Evaluation
//              Process, the steps to certified pay (team_extras.py NEXT_LEVEL),
//              with the PEA bar checked by the hub and the rest ticked by a
//              leader
//   My stuff   tickets waiting on them (the Pass), uniform orders, the food
//              handler permit, PTO left, a director's uniform credit, and
//              career goals in their own words (theirs to write)
//   Leaders    their roles and the quarter's focus (leaders.js), Team Leads and up
// Directors and the Admin Team open anyone's from Our Team and tick the
// steps; Team Leads see only their own. Points stay with leadership, and
// nothing here is contact or emergency information. The data is the
// server's (/api/me/page, /api/team/page): only the person's own, never
// anyone else's; the shifts, spots and breaks are what this phone already
// has for the Schedule and Right Now. A kitchen team member's page carries
// Spanish (their roster side); the front's stays English.

let mpData = null;        // the page's data, from the server
let mpFor = '';           // '' = my own page; else the name a director opened
let mpShown = false;
let mpBusy = false;
let mpGoalsEdit = false;
let mpTickets = null;     // my tickets waiting (the Pass), own page only

const MP_ICON_X = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const MP_ICON_CHECK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const MP_TIER = {crushing: 'Crushing It', rise: 'On the Rise', notyet: 'Not Yet'};

function mpOthersAllowed(){ return typeof hcAllowed === 'function' && hcAllowed(); }   // directors and the Admin Team (headcount.js)
function mpMyName(){ return typeof siIdentity !== 'undefined' && siIdentity && siIdentity.name ? siIdentity.name : ''; }
const mpH = s => typeof escapeHtml === 'function' ? escapeHtml(s) : String(s == null ? '' : s);
const mpEs = en => typeof esLine === 'function' ? esLine(en) : '';
function mpDate(iso){ return iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : ''; }
function mpMonthDay(iso){ return iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {month: 'long', day: 'numeric'}) : ''; }
function mpWhen(ts){ return ts ? new Date(ts * 1000).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : ''; }

// ----- open / close -----
function mpOpenMine(){
  if(!mpMyName()){ if(typeof siOpen === 'function') siOpen(); return; }
  mpFor = ''; mpOpen();
}
function mpOpenFor(name){
  if(!mpOthersAllowed()) return;
  mpFor = name; mpOpen();
}
function mpOpen(){
  mpShown = true; mpData = null; mpGoalsEdit = false; mpTickets = null;
  mpDraw();
  mpLoad();
}
function mpClose(){
  mpShown = false; mpData = null; mpFor = '';
  const layer = document.getElementById('mpLayer');
  if(layer) layer.hidden = true;
  document.body.classList.remove('mp-on');
}
async function mpLoad(){
  try{
    const url = mpFor ? `${API_BASE}/api/team/page?name=${encodeURIComponent(mpFor)}` : `${API_BASE}/api/me/page`;
    const res = await fetch(url, {credentials: 'same-origin', cache: 'no-store'});
    const d = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(d.error || 'Couldn’t load the page. Try again.');
    if(!mpShown) return;
    mpData = d;
    mpDraw();
    if(!mpFor && d.name && typeof fetch === 'function'){
      fetch(`${API_BASE}/api/pass/count`, {credentials: 'same-origin', cache: 'no-store'}).then(r => r.ok ? r.json() : null)
        .then(j => { if(j && mpShown && !mpFor){ mpTickets = j.count || 0; mpDraw(); } }).catch(() => {});
    }
  }catch(err){
    if(typeof showToast === 'function') showToast(err.message);
    mpClose();
  }
}

// ----- the week, from what this phone has (team-schedule.js, right-now.js) -----
function mpSide(name){
  const on = typeof rnOnRoster === 'function' ? rnOnRoster(name, today) : [];
  const floor = on.find(o => o.side === 'foh' || o.side === 'boh');
  if(floor) return floor.side;
  return typeof rnDeviceSide === 'function' ? rnDeviceSide() : 'foh';
}
function mpWeekHtml(name){
  if(typeof tsWeek !== 'function' || typeof tsWeekRows !== 'function') return '';
  const days = tsWeek(0), key = typeof dirKey === 'function' ? dirKey(name) : name.toLowerCase();
  const totals = tsWeekTotals(days, key);
  const spots = typeof rnSpotsFor === 'function' ? rnSpotsFor([name], today) : [];
  const side = mpSide(name);
  const brk = typeof breakFor === 'function' ? breakFor(side, today, name) : null;
  const lines = [];
  spots.forEach(s => lines.push(`<li><span>${mpH(typeof rnClock === 'function' ? rnClock(parseDaypartTimeToMinutes(s.dp.time)) : '')}</span><b>${mpH(s.slot)}</b><small>${mpH(typeof rnShort === 'function' ? rnShort(s.dp.name) : s.dp.name)}</small></li>`));
  if(brk && brk.start !== null && brk.start !== undefined) lines.push(`<li><span>${mpH(rnClock(brk.start))}</span><b>Break${mpEs('Your break')}</b></li>`);
  return `<section class="mp-sec">
      <h3>My week${mpEs('My week')}<span>${mpH(totals.text)}</span></h3>
      <ul class="ts-days mp-days">${tsWeekRows(days, key)}</ul>
      ${lines.length ? `<h4>Today${mpEs('Today')}</h4><ul class="mp-today">${lines.join('')}</ul>` : ''}
      <button type="button" class="mp-link" data-mp-go="schedule">Open the Schedule${mpEs('Open the Schedule')}</button>
    </section>`;
}

// ----- growing: PEA and the next level -----
function mpPeaHtml(d){
  const pea = d.pea || {};
  const rows = pea.positions || [];
  if(!rows.length) return `<p class="mp-note">No PEA ratings yet.${mpEs('No PEA ratings yet')}</p>`;
  return `<ul class="mp-pea">${rows.map(p => `<li class="is-${mpH(p.tier)}"><b>${mpH(p.position)}</b><span class="mp-tier">${mpH(MP_TIER[p.tier] || p.tierLabel || '')}</span><small>${mpH(p.avg)} · ${p.n} rating${p.n === 1 ? '' : 's'}${p.last ? ` · last ${mpH(mpDate(p.last))}` : ''}</small></li>`).join('')}</ul>`;
}
function mpNextHtml(d){
  const n = d.next;
  if(!n) return `<p class="mp-note">You’re at the top of the ladder.</p>`;
  const can = d.canEdit;
  const intro = n.how === 'certify'
    ? `The steps to <b>${mpH(n.targetLabel)}</b> and certified pay. To move to a new role you must be certified in your current one.`
    : `You’re certified at this level. The next role is <b>${mpH(n.targetLabel)}</b>: a promotion when leadership opens a spot. Here’s what it takes.`;
  return `<p class="mp-note">${intro}</p>
    <ol class="mp-steps">${n.items.map(it => `
      <li class="${it.done ? 'is-done' : ''}">
        ${can && !it.auto ? `<label class="mp-tick"><input type="checkbox" data-mp-step="${mpH(it.key)}" ${it.done ? 'checked' : ''} ${mpBusy ? 'disabled' : ''}><i>${MP_ICON_CHECK}</i></label>` : `<i class="mp-tick-ro">${it.done ? MP_ICON_CHECK : ''}</i>`}
        <span class="mp-step-t"><b>${mpH(it.label)}</b>
          ${it.auto ? `<small>${mpH(it.note || '')} · from your PEA ratings</small>` : it.key === 'trial' && (it.start || can) ? `<small>${it.start ? `Started ${mpH(mpDate(it.start))}` : 'Not started'}${can ? ` · <input type="date" class="mp-date" data-mp-trial-start value="${mpH(it.start || '')}" aria-label="Trial start">` : ''}</small>` : it.done && it.when ? `<small>${mpH(mpWhen(it.when))}${it.by ? ` · ${mpH(it.by)}` : ''}</small>` : ''}
        </span>
      </li>`).join('')}
    </ol>
    ${n.complete ? `<p class="mp-note is-ok">All steps done: ${n.how === 'certify' ? 'certified pay starts the next payroll period.' : 'eligible for promotion.'}</p>` : ''}`;
}

// ----- my stuff -----
function mpPermitHtml(d){
  if(!d.permitExpires) return `<li><b>Food handler permit${mpEs('Food handler permit')}</b><span class="mp-warn">Not on file</span></li>`;
  const days = Math.round((new Date(d.permitExpires + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000);
  const cls = days < 0 ? 'mp-bad' : days <= 30 ? 'mp-warn' : '';
  return `<li><b>Food handler permit${mpEs('Food handler permit')}</b><span class="${cls}">${days < 0 ? `Expired ${mpH(mpDate(d.permitExpires))}` : `Expires ${mpH(mpDate(d.permitExpires))}${days <= 30 ? ` · ${days} day${days === 1 ? '' : 's'}` : ''}`}</span></li>`;
}
function mpStuffHtml(d){
  const items = [];
  if(!mpFor) items.push(`<li class="is-go" data-mp-go="tasks"><b>Tasks${mpEs('Tasks')}</b><span>${mpTickets === null ? '…' : mpTickets ? `${mpTickets} waiting on you` : 'Nothing waiting on you'}</span></li>`);
  items.push(mpPermitHtml(d));
  if(d.pto && d.pto.allowance && !d.pto.off) items.push(`<li><b>PTO ${mpH(d.year)}${mpEs('PTO')}</b><span>${mpH(d.pto.left)} h left of ${mpH(d.pto.allowance)}${d.pto.basis ? ` · as ${mpH(d.pto.basis)}` : ''}</span></li>`);
  if(d.credit) items.push(`<li class="is-go" data-mp-go="credit"><b>Uniform credit ${mpH(d.year)}</b><span>$${mpH(d.credit.left)} left${d.credit.pending ? `, $${mpH(d.credit.pending)} waiting` : ''}</span></li>`);
  if(d.orders && d.orders.length) items.push(`<li><b>Uniform orders${mpEs('Uniform orders')}</b><span>${d.orders.map(o => `${mpH(mpDate(String(o.at || '').slice(0, 10)))}: ${o.items} item${o.items === 1 ? '' : 's'}, ${mpH(o.status)}`).join('<br>')}</span></li>`);
  const goals = d.goals && d.goals.text ? d.goals.text : '';
  const goalsHtml = !mpFor && mpGoalsEdit
    ? `<form class="mp-goals-form" data-mp-goals-form><textarea id="mpGoals" maxlength="600" rows="4" placeholder="Where do you want to go? What would you like to learn?">${mpH(goals)}</textarea>
        <div class="mp-row"><button type="submit" class="btn btn-primary" ${mpBusy ? 'disabled' : ''}>Save${mpEs('Save')}</button><button type="button" class="mp-link" data-mp-goals-cancel>Cancel${mpEs('Cancel')}</button></div></form>`
    : `<p class="mp-goals">${goals ? mpH(goals).replace(/\n/g, '<br>') : `<i>${mpFor ? 'Nothing written yet.' : 'Nothing yet. Your page, your words.'}</i>`}</p>
       ${!mpFor ? `<button type="button" class="mp-link" data-mp-goals-edit>${goals ? 'Edit' : 'Write my goals'}${mpEs(goals ? 'Edit' : 'Write my goals')}</button>` : ''}
       ${goals && d.goals.at ? `<small class="mp-note">Written ${mpH(mpWhen(d.goals.at))}</small>` : ''}`;
  return `<section class="mp-sec">
      <h3>My stuff${mpEs('My stuff')}</h3>
      <ul class="mp-list">${items.join('')}</ul>
      <h4>Career goals${mpEs('Career goals')}</h4>
      ${goalsHtml}
    </section>`;
}

// ----- leaders: roles and the quarter's focus (leaders.js) -----
function mpLeaderHtml(d){
  const leadUp = ['lead', 'director', 'manager', 'admin'].includes(d.role) || ['lead', 'cert_lead', 'director', 'cert_director', 'executive', 'cert_executive', 'operator'].includes(d.level);
  if(!leadUp || typeof leaderRoster === 'undefined' || !Array.isArray(leaderRoster)) return '';
  const k = typeof dirKey === 'function' ? dirKey(d.name) : d.name.toLowerCase();
  const me = leaderRoster.find(r => r && r.name && dirKey(r.name) === k);
  const cardOf = key => typeof LD_ROLE_CARDS !== 'undefined' ? (Object.entries(LD_ROLE_CARDS).find(([, keys]) => keys.includes(key)) || [key])[0] : key;
  const roles = me && Array.isArray(me.roles) ? [...new Set(me.roles.map(cardOf))] : [];
  const focus = typeof ldFocusFor === 'function' ? ldFocusFor(d.name) : [];
  if(!roles.length && !focus.length) return '';
  return `<section class="mp-sec">
      <h3>Leading</h3>
      ${roles.length ? `<div class="mp-chips">${roles.map(r => `<span class="mp-chip">${mpH(r)}</span>`).join('')}</div>` : ''}
      ${focus.length ? `<h4>This quarter’s focus</h4><ul class="mp-focus">${focus.map(f => `<li>${mpH(typeof f === 'string' ? f : (f && f.text) || '')}</li>`).join('')}</ul>` : ''}
    </section>`;
}

// ----- the sheet -----
function mpDraw(){
  let layer = document.getElementById('mpLayer');
  if(!layer){
    layer = document.createElement('div');
    layer.id = 'mpLayer';
    layer.className = 'mp-layer';
    document.body.appendChild(layer);
    layer.addEventListener('click', mpClick);
    layer.addEventListener('change', mpChange);
    layer.addEventListener('submit', mpSubmit);
  }
  if(!mpShown){ layer.hidden = true; return; }
  layer.hidden = false;
  document.body.classList.add('mp-on');
  const d = mpData;
  const name = d ? d.name : (mpFor || mpMyName());
  const boh = name && mpSide(name) === 'boh';
  const roleLabel = d && typeof acRoleLabel === 'function' ? acRoleLabel(d.role) : '';
  let body;
  if(!d) body = `<p class="mp-note">Loading…${mpEs('Loading…')}</p>`;
  else if(!d.name) body = `<p class="mp-note">Sign in as yourself (your clock-in PIN) to see your page.</p>`;
  else {
    const since = d.hireDate && typeof hcYearsMonths === 'function' ? hcYearsMonths(d.hireDate) : '';
    body = `
      <section class="mp-sec mp-about">
        <h3>About me${mpEs('About me')}</h3>
        <ul class="mp-list">
          <li><b>Level${mpEs('Level')}</b><span>${mpH(d.levelLabel || roleLabel || '')}</span></li>
          ${d.hireDate ? `<li><b>With us since${mpEs('With us since')}</b><span>${mpH(mpDate(d.hireDate))}${since ? ` · ${mpH(since)}` : ''}</span></li>` : ''}
          ${d.birthday ? `<li><b>Birthday${mpEs('Birthday')}</b><span>${mpH(mpMonthDay(d.birthday))}</span></li>` : ''}
        </ul>
      </section>
      ${mpWeekHtml(d.name)}
      <section class="mp-sec">
        <h3>Growing${mpEs('Growing')}</h3>
        <h4>My PEA${mpEs('My PEA')}</h4>
        ${mpPeaHtml(d)}
        <h4>Next level${mpEs('Next level')}</h4>
        ${mpNextHtml(d)}
      </section>
      ${mpStuffHtml(d)}
      ${mpLeaderHtml(d)}`;
  }
  const mine = !mpFor;
  layer.innerHTML = `<div class="mp-scrim" data-mp-close></div>
    <div class="mp-sheet${boh ? ' is-boh' : ''}" role="dialog" aria-modal="true" aria-labelledby="mpTitle">
      <div class="mp-head">
        <div><span class="mp-kicker">${mine ? 'My page' : 'Their page'}${mpEs(mine ? 'My page' : 'Their page')}</span><h2 id="mpTitle">${mpH(name || 'Me')}</h2>${d && d.name ? `<p class="mp-sub">${mpH([d.levelLabel || '', roleLabel].filter((x, i, a) => x && a.indexOf(x) === i).join(' · '))}</p>` : ''}</div>
        <button type="button" class="mp-close" data-mp-close aria-label="Close">${MP_ICON_X}</button>
      </div>
      ${body}
      ${mine ? `<div class="mp-foot"><button type="button" class="btn btn-ghost" data-mp-signout>Sign out${mpEs('Sign out')}</button><button type="button" class="mp-link" data-mp-switch>Not you? Switch${mpEs('Not you? Switch')}</button></div>` : ''}
    </div>`;
}

// ----- taps -----
function mpClick(e){
  const t = e.target;
  if(t.closest('[data-mp-close]')){ mpClose(); return; }
  if(t.closest('[data-mp-signout]')){ mpClose(); if(typeof acSignOut === 'function') acSignOut(); return; }
  if(t.closest('[data-mp-switch]')){ mpClose(); if(typeof siOpen === 'function') siOpen(); return; }
  if(t.closest('[data-mp-goals-edit]')){ mpGoalsEdit = true; mpDraw(); const ta = document.getElementById('mpGoals'); if(ta) ta.focus(); return; }
  if(t.closest('[data-mp-goals-cancel]')){ mpGoalsEdit = false; mpDraw(); return; }
  const go = t.closest('[data-mp-go]');
  if(go){
    const where = go.dataset.mpGo;
    mpClose();
    if(where === 'credit' && typeof apOpenCredit === 'function') apOpenCredit();
    else if(typeof launchShowTab === 'function'){ launchShowTab(where); window.scrollTo({top: 0}); }
  }
}
async function mpPost(path, body){
  if(mpBusy) return null;
  mpBusy = true; mpDraw();
  try{
    const res = await fetch(`${API_BASE}${path}`, {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    const d = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(d.error || 'Couldn’t save. Try again.');
    mpBusy = false;
    if(mpShown){ mpData = d; mpDraw(); }
    return d;
  }catch(err){
    mpBusy = false; mpDraw();
    if(typeof showToast === 'function') showToast(err.message);
    return null;
  }
}
function mpChange(e){
  const t = e.target;
  if(!mpData || !mpData.canEdit) return;
  if(t.matches('[data-mp-step]')) mpPost('/api/team/steps', {name: mpData.name, step: t.dataset.mpStep, done: t.checked}).then(d => { if(d && typeof showToast === 'function') showToast(t.checked ? 'Step done' : 'Step undone'); });
  else if(t.matches('[data-mp-trial-start]')) mpPost('/api/team/steps', {name: mpData.name, step: 'trial', start: t.value}).then(d => { if(d && typeof showToast === 'function') showToast(t.value ? 'Trial start saved' : 'Trial start cleared'); });
}
function mpSubmit(e){
  if(!e.target.closest('[data-mp-goals-form]')) return;
  e.preventDefault();
  const ta = document.getElementById('mpGoals');
  mpPost('/api/me/goals', {text: ta ? ta.value : ''}).then(d => { if(d){ mpGoalsEdit = false; mpDraw(); if(typeof showToast === 'function') showToast('Goals saved'); } });
}
// Our Team: a director opens someone's page (headcount.js hcProfileHtml).
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-mp-open-for]');
  if(b) mpOpenFor(b.dataset.mpOpenFor);
});
document.addEventListener('keydown', e => { if(e.key === 'Escape' && mpShown) mpClose(); });
