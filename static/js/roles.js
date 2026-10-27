// ===== TEAM LEAD ROLES (Tim, Oct 27 2026) =====
// A place for each Team Lead role on the PEC role cards (leaders.js
// LD_CARDS): Hospitality & Service, Stewardship, Drive-Thru, Catering &
// Connections, New Hire Talent, Certified Talent, Food Safety, Food Quality
// and Food Cost. Each place has
//   - who holds it (the team list's leader focus, leaderRoster),
//   - how its win measures stand this week, from what the hub already has
//     (waste, Food Safety walkthroughs, zone resets, CEM, QIV, DT ranking),
//   - the role's actions as this week's checklist, ticked by name,
//   - a running log, newest first, for whoever holds the role next.
// Team Leads, the Admin Team and directors see the tab and change the boards
// (roleBoards rides with Set Ups' data, so the server keeps it a lead's to
// change); everyone else doesn't see it. What a role "owns" (its pillars)
// is folded under its actions.

const RL_ORDER = ['hs', 'dt', 'cc', 'stew', 'fs', 'fq', 'fcm', 'nht', 'ct'];
const RL_LOG_KEEP = 60;
let rlOpen = '';          // the role open ('' = all roles)
let rlLogDraft = '';

const RL_ICON = {
  back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>'
};

function rlShown(){ return typeof siLeadOrUp === 'function' && siLeadOrUp(); }
function rlSyncTab(){
  const tab = document.querySelector('.tab[data-view="roles"]');
  if(tab) tab.style.display = rlShown() ? '' : 'none';
  const view = document.getElementById('rolesView');
  if(view && view.classList.contains('active') && !rlShown() && typeof launchShowTab === 'function') launchShowTab('home');
}

// ----- The week -----
function rlMonday(iso){
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toLocalISODate(d);
}
// Monday through today (the days of this week so far).
function rlWeekDays(){
  const out = [];
  const d = new Date(rlMonday(today) + 'T12:00:00');
  while(toLocalISODate(d) <= today){ if(d.getDay() !== 0) out.push(toLocalISODate(d)); d.setDate(d.getDate() + 1); }
  return out;
}

// ----- Who holds a role -----
function rlHolders(key){
  return (Array.isArray(leaderRoster) ? leaderRoster : []).filter(r => r && r.name && Array.isArray(r.roles)
    && r.roles.some(role => (LD_ROLE_CARDS[role] || []).includes(key))).map(r => r.name);
}
function rlMine(){
  const me = siIdentity && siIdentity.name;
  if(!me) return [];
  const same = (a, b) => typeof rnSame === 'function' ? rnSame(a, b) : String(a).toLowerCase() === String(b).toLowerCase();
  return RL_ORDER.filter(k => rlHolders(k).some(n => same(n, me)));
}
const rlFirst = n => String(n || '').trim().split(/\s+/)[0];

// ----- The board (roleBoards: {key: {weeks: {mondayISO: {i: {by, at}}}, log: [{text, by, at}]}}) -----
function rlBoard(key){
  if(!roleBoards || typeof roleBoards !== 'object' || Array.isArray(roleBoards)) roleBoards = {};
  const b = roleBoards[key] = roleBoards[key] || {};
  b.weeks = b.weeks && typeof b.weeks === 'object' ? b.weeks : {};
  b.log = Array.isArray(b.log) ? b.log : [];
  return b;
}
function rlWeekDone(key){ return ((roleBoards[key] || {}).weeks || {})[rlMonday(today)] || {}; }
// Only this week and the last few are kept.
function rlPruneWeeks(b){
  const keep = Object.keys(b.weeks).sort().slice(-6);
  Object.keys(b.weeks).forEach(w => { if(!keep.includes(w)) delete b.weeks[w]; });
}
const rlWho = () => (siIdentity && siIdentity.name) || (typeof getInitials === 'function' && getInitials()) || 'Director';
function rlWhen(at){
  const d = new Date(at);
  return d.toLocaleDateString('en-US', {weekday: 'short'}) + ' ' + d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
}

// ----- How it's going: the role's numbers this week, from what the hub has -----
// [{label, value, note, tone: 'good' | 'bad' | ''}]
function rlMeasures(key){
  const days = rlWeekDays(), out = [];
  const so = n => `${n} day${n === 1 ? '' : 's'} so far`;
  const cem = () => {
    const p = typeof duCemLatest === 'function' ? duCemLatest() : null;
    const t = p && typeof ctTotalEntry === 'function' ? ctTotalEntry(p.periodKey) : null;
    return t && t.scores ? {label: p.periodLabel, s: t.scores} : null;
  };
  const pct = v => v == null || isNaN(+v) ? null : `${Math.round(+v * 10) / 10}%`;
  if(key === 'fcm'){
    const cost = entries.filter(e => days.includes(wasteEntryDay(e))).reduce((t, e) => t + (Number(e.cost) || 0), 0);
    const logged = days.filter(d => entries.some(e => wasteEntryDay(e) === d)).length;
    const under = days.filter(d => d < today && wasteDays.includes(d)).length, closed = days.filter(d => d < today).length;
    out.push({label: 'Waste this week', value: '$' + cost.toFixed(2), note: so(days.length), tone: ''});
    out.push({label: 'Days with waste logged', value: `${logged}/${days.length}`, note: 'goal: every day', tone: logged === days.length ? 'good' : 'bad'});
    if(closed) out.push({label: 'Days under the waste limit', value: `${under}/${closed}`, note: 'finished days', tone: under === closed ? 'good' : ''});
  }
  if(key === 'fs'){
    const done = days.filter(d => typeof fsTotals === 'function' && fsTotals(typeof fsBest === 'function' ? fsBest(d) : foodSafetyWalkthroughs[d]).complete).length;
    out.push({label: 'Food Safety walkthrough finished', value: `${done}/${days.length}`, note: 'goal: every day', tone: done === days.length ? 'good' : 'bad'});
  }
  if(key === 'stew'){
    let checked = 0, total = 0;
    days.forEach(d => (typeof zoneResetDayparts !== 'undefined' ? zoneResetDayparts : []).forEach(h => { const c = getHandoffZoneCompletion(d, h.name); checked += c.checked; total += c.total; }));
    const r = total ? checked / total : null;
    out.push({label: 'Zone resets checked off', value: r === null ? '—' : Math.round(r * 100) + '%', note: so(days.length), tone: r === null ? '' : r >= 0.95 ? 'good' : 'bad'});
  }
  if(key === 'dt'){
    const ranks = (typeof reportData === 'object' && reportData && reportData.dtRank) || {};
    const group = ['region', 'market', 'state', 'chain'].find(g => ranks[g] && ranks[g].rank);
    out.push(group ? {label: `DT ranking (${RP_DT_GROUPS[group]})`, value: `#${ranks[group].rank}`, note: ranks[group].count ? `of ${ranks[group].count.toLocaleString('en-US')}` : '', tone: ranks[group].rank <= 100 ? 'good' : ''}
      : {label: 'DT ranking', value: '—', note: 'uploaded in Manage → Uploads', tone: ''});
    const c = cem();
    if(c && c.s.fastService != null) out.push({label: 'Fast Service (CEM)', value: pct(c.s.fastService), note: c.label, tone: ''});
    if(c && c.s.orderAccuracy != null) out.push({label: 'Order Accuracy (CEM)', value: pct(c.s.orderAccuracy), note: c.label, tone: ''});
  }
  if(key === 'fq'){
    const q = typeof rpLatestQiv === 'function' ? rpLatestQiv() : null;
    out.push(q ? {label: 'QIV', value: `${q.overall}%`, note: q.quarter || '', tone: +q.overall >= 98 ? 'good' : 'bad'} : {label: 'QIV', value: '—', note: 'no QIV report yet', tone: ''});
    const c = cem();
    if(c && c.s.taste != null) out.push({label: 'Taste of Food (CEM)', value: pct(c.s.taste), note: c.label, tone: ''});
  }
  if(key === 'hs' || key === 'cc'){
    const c = cem();
    if(c){
      if(c.s.overall != null) out.push({label: 'OSAT (CEM)', value: pct(c.s.overall), note: c.label, tone: ''});
      if(key === 'hs' && c.s.attentive != null) out.push({label: 'Attentive / Friendly (CEM)', value: pct(c.s.attentive), note: c.label, tone: ''});
      if(key === 'hs' && c.s.cleanliness != null) out.push({label: 'Cleanliness (CEM)', value: pct(c.s.cleanliness), note: c.label, tone: ''});
    } else out.push({label: 'CEM', value: '—', note: 'no CEM report yet', tone: ''});
  }
  return out;
}

// ----- Drawing -----
function rlTileHtml(key, mine){
  const c = LD_CARDS[key];
  const holders = rlHolders(key);
  const done = Object.keys(rlWeekDone(key)).length, total = c.actions.length;
  const m = rlMeasures(key)[0];
  return `<button type="button" class="rl-tile${mine ? ' is-mine' : ''}" data-rl-open="${key}">
      <span class="rl-tile-top"><b>${escapeHtml(c.short)}</b>${RL_ICON.next}</span>
      <span class="rl-tile-who">${holders.length ? escapeHtml(holders.map(rlFirst).join(', ')) : 'Nobody holds it yet'}</span>
      ${m ? `<span class="rl-tile-stat${m.tone ? ' is-' + m.tone : ''}"><b>${escapeHtml(m.value)}</b> ${escapeHtml(m.label.toLowerCase())}</span>` : ''}
      <span class="rl-tile-week"><span class="rl-bar" aria-hidden="true"><i style="width:${total ? Math.round(done / total * 100) : 0}%"></i></span>${done}/${total} this week</span>
    </button>`;
}

function rlListHtml(){
  const mine = rlMine();
  const rest = RL_ORDER.filter(k => !mine.includes(k));
  return `
    <div class="rl-head"><h2 class="rl-title">Roles</h2><p class="rl-sub">Each Team Lead role: who holds it, how it’s going this week, and what’s left to do.</p></div>
    ${mine.length ? `<h3 class="rl-h">Your role${mine.length > 1 ? 's' : ''}</h3><div class="rl-grid">${mine.map(k => rlTileHtml(k, true)).join('')}</div><h3 class="rl-h">Every role</h3>` : ''}
    <div class="rl-grid">${rest.map(k => rlTileHtml(k, false)).join('')}</div>
    <p class="rl-hint">Who holds each role is set on the team list (Manage → Directors), each Team Lead’s focus.</p>`;
}

function rlRoleHtml(key){
  const c = LD_CARDS[key];
  const holders = rlHolders(key);
  const can = rlShown();
  const done = rlWeekDone(key);
  const board = roleBoards[key] || {};
  const measures = rlMeasures(key);
  const log = Array.isArray(board.log) ? board.log : [];
  const monday = new Date(rlMonday(today) + 'T12:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  return `
    <button type="button" class="rl-back" data-rl-open="">${RL_ICON.back} All roles</button>
    <section class="rl-hero">
      <h2>${escapeHtml(c.name)}</h2>
      <p>${escapeHtml(c.desc)}</p>
      <div class="rl-holders">${holders.length ? holders.map(n => `<span>${escapeHtml(n)}</span>`).join('') : '<em>Nobody holds it yet</em>'}</div>
    </section>
    <section class="rl-card">
      <h3 class="rl-h">How it’s going</h3>
      <ul class="rl-wins">${c.win.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
      ${measures.length ? `<div class="rl-stats">${measures.map(m => `<div class="rl-stat${m.tone ? ' is-' + m.tone : ''}"><b>${escapeHtml(m.value)}</b><span>${escapeHtml(m.label)}</span>${m.note ? `<small>${escapeHtml(m.note)}</small>` : ''}</div>`).join('')}</div>`
        : '<p class="rl-hint">Its numbers aren’t in the hub yet: PEA ratings live in Levelset, and directors see them on the Leaders page.</p>'}
    </section>
    <section class="rl-card">
      <h3 class="rl-h">This week <span>from Mon ${escapeHtml(monday)}</span></h3>
      <ul class="rl-checks">${c.actions.map((a, i) => {
        const d = done[i];
        return `<li><button type="button" class="rl-check${d ? ' is-done' : ''}" data-rl-check="${i}" aria-pressed="${!!d}" ${can ? '' : 'disabled'}>
          <span class="rl-box" aria-hidden="true">${d ? RL_ICON.check : ''}</span>
          <span class="rl-check-text">${escapeHtml(a)}${d ? `<small>${escapeHtml(rlFirst(d.by))} · ${escapeHtml(rlWhen(d.at))}</small>` : ''}</span>
        </button></li>`;
      }).join('')}</ul>
      <details class="rl-owns"><summary>What this role owns</summary>
        <ul>${c.pillars.map(([, t, d]) => `<li><b>${escapeHtml(t)}</b><span>${escapeHtml(d)}</span></li>`).join('')}</ul>
      </details>
    </section>
    <section class="rl-card">
      <h3 class="rl-h">Role log</h3>
      ${can ? `<form class="rl-log-form" data-rl-log-form>
        <textarea id="rlLogText" rows="2" maxlength="500" placeholder="What happened, what’s next, what the next person should know">${escapeHtml(rlLogDraft)}</textarea>
        <div class="rl-log-go"><small>It loads on every device that opens the hub. Keep it about the role, not about a person.</small><button type="submit" class="btn btn-primary">Add</button></div>
      </form>` : ''}
      ${log.length ? `<ul class="rl-log">${log.slice(0, 20).map(n => `<li><p>${escapeHtml(n.text)}</p><small>${escapeHtml(n.by || '')} · ${escapeHtml(new Date(n.at).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}))}</small></li>`).join('')}</ul>` : '<p class="rl-hint">Nothing logged yet.</p>'}
    </section>`;
}

function renderRoles(){
  const root = document.getElementById('rolesRoot');
  if(!root) return;
  if(!rlShown()){ root.innerHTML = '<p class="rl-hint">Team Leads: sign in with your clock-in PIN to see the roles.</p>'; return; }
  if(rlOpen && !LD_CARDS[rlOpen]) rlOpen = '';
  root.innerHTML = rlOpen ? rlRoleHtml(rlOpen) : rlListHtml();
}

document.getElementById('rolesRoot').addEventListener('click', e => {
  const open = e.target.closest('[data-rl-open]');
  if(open){ rlOpen = open.dataset.rlOpen; rlLogDraft = ''; renderRoles(); window.scrollTo({top: 0}); return; }
  const check = e.target.closest('[data-rl-check]');
  if(check && rlOpen && rlShown()){
    const b = rlBoard(rlOpen), week = rlMonday(today), i = check.dataset.rlCheck;
    const w = b.weeks[week] = b.weeks[week] || {};
    if(w[i]) delete w[i]; else w[i] = {by: rlWho(), at: Date.now()};
    rlPruneWeeks(b);
    renderRoles();
    saveState();
  }
});
document.getElementById('rolesRoot').addEventListener('input', e => { if(e.target.id === 'rlLogText') rlLogDraft = e.target.value; });
document.getElementById('rolesRoot').addEventListener('submit', e => {
  if(!e.target.closest('[data-rl-log-form]')) return;
  e.preventDefault();
  const text = rlLogDraft.trim();
  if(!text || !rlOpen || !rlShown()) return;
  const b = rlBoard(rlOpen);
  b.log.unshift({text, by: rlWho(), at: Date.now()});
  b.log = b.log.slice(0, RL_LOG_KEEP);
  rlLogDraft = '';
  renderRoles();
  saveState();
  showToast('Added to the role log');
});
