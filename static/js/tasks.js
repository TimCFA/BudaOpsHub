// ===== TASKS: PROJECTS AND WHAT'S DELEGATED TO WHOM (Tim, Oct 27 2026) =====
// One place for the work a leader hands to someone: a task (what, for whom,
// by when, under which project) and the projects those tasks roll up to.
// Team Leads, the Admin Team and directors delegate; everyone signed in
// sees their own list first (Mine), and the Right Now card on Home counts
// what's waiting for them. Leaders also see the whole team (by person,
// overdue first), the projects with how far along each is, and what got
// done lately.
//
// Saved as teamProjects and teamTasks in the `delegation` section, sent to
// every signed-in device. A leader's changes go through the ordinary save
// (the server stamps `by` with who saved); a Team Member or Trainer marks a
// task that's theirs done, or adds a note, through /api/tasks/update, which
// checks the task is for them. Done tasks stay 90 days, then fall away.
//
//   teamProjects: [{id, name, why, owner, due, status, createdAt, by, doneAt}]
//   teamTasks:    [{id, title, detail, to, by, projectId, due, status,
//                   createdAt, doneAt, doneBy, notes: [{text, by, ts}]}]
// `to` and `owner` are names as the PIN list spells them; `due` is a day
// (YYYY-MM-DD) or ''; status is 'open' or 'done'.

const TK_DONE_KEEP_DAYS = 90;
const TK_RECENT_DAYS = 30;
const TK_DAY_MS = 86400000;
const TK_TITLE_MAX = 120;
const TK_DETAIL_MAX = 1000;
const TK_NOTE_MAX = 500;
const TK_ICON_CHECK = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path class="tk-tick" d="M8 12.5l2.6 2.6L16 9.5"/></svg>';
const TK_ICON_GO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const TK_ICON_BACK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const TK_ICON_X = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const TK_ICON_PLUS = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

let tkView = 'mine';          // 'mine' | 'team' | 'projects' | 'done'
let tkTeamFilter = 'open';    // Team: 'open' | 'overdue' | 'week' | 'unassigned'
let tkProjectOpen = '';       // the project open on the Projects page
let tkSheet = null;           // {kind: 'task' | 'edit' | 'project', id, projectId} while a sheet is open
let tkPickQuery = '';         // the person picker's search
let tkPicked = '';            // the person picked in the open form
let tkBusy = false;           // a team member's update waiting on the server
let tkError = '';

// ----- Who's holding the phone -----
function tkMe(){ return typeof rnViewer === 'function' ? rnViewer() : {role: 'none', name: ''}; }
function tkCanDelegate(){ return ['director', 'manager', 'lead', 'admin'].includes(tkMe().role); }
function tkSignedIn(){ const v = tkMe(); return !!v.name || v.role === 'director' || v.role === 'manager'; }
function tkMyName(){ return tkMe().name || ''; }
function tkSame(a, b){
  if(typeof rnSame === 'function') return rnSame(a, b);
  const k = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return !!k(a) && k(a) === k(b);
}
function tkFirst(name){ return String(name || '').trim().split(/\s+/)[0] || ''; }

// ----- The data -----
function tkId(prefix){ return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
function tkTasks(){ return Array.isArray(teamTasks) ? teamTasks.filter(t => t && t.id) : []; }
function tkProjects(){ return Array.isArray(teamProjects) ? teamProjects.filter(p => p && p.id) : []; }
function tkTask(id){ return tkTasks().find(t => t.id === id) || null; }
function tkProject(id){ return id ? tkProjects().find(p => p.id === id) || null : null; }
function tkIsOpen(t){ return t.status !== 'done'; }
function tkOverdue(t){ return tkIsOpen(t) && !!t.due && t.due < today; }
function tkMine(name){ return name ? tkTasks().filter(t => tkIsOpen(t) && tkSame(t.to, name)) : []; }
function tkNotes(t){ return Array.isArray(t.notes) ? t.notes.filter(n => n && n.text) : []; }

// Open first; among the open, overdue, then by due day (none last), then
// newest first. Done ones newest done first.
function tkSort(list){
  const at = t => t.due || '9999-99-99';
  return [...list].sort((a, b) => {
    if(tkIsOpen(a) !== tkIsOpen(b)) return tkIsOpen(a) ? -1 : 1;
    if(tkIsOpen(a)){
      if(at(a) !== at(b)) return at(a) < at(b) ? -1 : 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    }
    return (b.doneAt || 0) - (a.doneAt || 0);
  });
}

function tkAddDays(iso, n){ const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return toLocalISODate(d); }
function tkDayText(iso){ return iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'}) : ''; }
function tkWhen(ts){
  if(!ts) return '';
  const d = new Date(ts);
  return `${d.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'})} ${d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'})}`;
}
// This week's last open day (Saturday), or next week's on a Sunday.
function tkEndOfWeek(){
  const dow = new Date(today + 'T12:00:00').getDay();
  return tkAddDays(today, dow === 0 ? 6 : 6 - dow);
}

// "Due today" / "Overdue · was Mon, Oct 26" / "Due Thu, Oct 29", with a tone.
function tkDue(t){
  if(!t.due) return {text: '', es: '', tone: ''};
  if(!tkIsOpen(t)) return {text: `Was due ${tkDayText(t.due)}`, es: '', tone: ''};
  if(t.due < today) return {text: `Overdue · was ${tkDayText(t.due)}`, es: esText('Overdue'), tone: 'bad'};
  if(t.due === today) return {text: 'Due today', es: esText('Due today'), tone: 'warn'};
  if(t.due === tkAddDays(today, 1)) return {text: 'Due tomorrow', es: esText('Due tomorrow'), tone: ''};
  return {text: `Due ${tkDayText(t.due)}`, es: esText('Due DATE', tkDayText(t.due)), tone: ''};
}

// Everyone a task can go to: the PIN list and the schedule (Set Ups' picker,
// daypicker-and-positions.js), plus anyone already on a task or project.
function tkPeople(){
  const out = [];
  const add = name => { if(name && !out.some(n => tkSame(n, name))) out.push(name); };
  if(typeof tmPickPeople === 'function'){ try{ tmPickPeople().forEach(p => add(p.name)); }catch(e){ /* the rosters aren't here yet */ } }
  tkTasks().forEach(t => add(t.to));
  tkProjects().forEach(p => add(p.owner));
  add(tkMyName());
  return out.sort((a, b) => a.localeCompare(b));
}

// ----- Saving -----
// A leader's change: the lists are replaced (never edited in place) so the
// save sees what changed, and done tasks past their keep fall away.
function tkSave(){
  const cutoff = Date.now() - TK_DONE_KEEP_DAYS * TK_DAY_MS;
  teamTasks = tkTasks().filter(t => tkIsOpen(t) || !t.doneAt || t.doneAt > cutoff);
  teamProjects = tkProjects();
  tkRender();
  return saveState();
}
function tkReplaceTask(task){ teamTasks = tkTasks().map(t => t.id === task.id ? task : t); }

// A team member's change to a task that's theirs: the server checks and
// writes it; the page shows it at once and asks for the latest after.
async function tkUpdateOnServer(id, change){
  tkBusy = true; tkError = '';
  tkRender();
  try{
    const res = await fetch(`${API_BASE}/api/tasks/update`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id, ...change})});
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(data.error || 'Couldn’t save that. Try again.');
    if(data.task) tkReplaceTask(data.task);
    if(typeof syncState === 'function') syncState();
  }catch(err){
    tkError = err.message || 'Couldn’t reach the hub. Try again.';
  }
  tkBusy = false;
  tkRender();
}

// Mark a task done or open again, by whoever may: a leader through the
// save, the person it's for through the server.
function tkSetDone(id, done){
  const t = tkTask(id);
  if(!t) return;
  const me = tkMyName();
  if(tkCanDelegate()){
    const next = {...t, status: done ? 'done' : 'open'};
    if(done){ next.doneAt = Date.now(); next.doneBy = me || 'Director'; }
    else { delete next.doneAt; delete next.doneBy; }
    tkReplaceTask(next);
    tkSave();
    showToast(done ? 'Marked done' : 'Marked not done');
    return;
  }
  if(!tkSame(t.to, me)){ showToast('Only the person a task is for can mark it done'); return; }
  tkUpdateOnServer(id, {status: done ? 'done' : 'open'});
}

function tkAddNote(id, text){
  const t = tkTask(id);
  text = String(text || '').trim().slice(0, TK_NOTE_MAX);
  if(!t || !text) return;
  const me = tkMyName();
  if(tkCanDelegate()){
    tkReplaceTask({...t, notes: [...tkNotes(t), {text, by: me || 'Director', ts: Date.now()}]});
    tkSave();
    return;
  }
  if(!tkSame(t.to, me)){ showToast('Only the person a task is for can add a note'); return; }
  tkUpdateOnServer(id, {note: text});
}

// ----- The page -----
function tkRerender(){
  if(typeof stateUserBusy === 'function' && stateUserBusy()) return;
  tkRender();
}
function tkRender(){
  const view = document.getElementById('tasksView');
  if(view && view.classList.contains('active')) renderTasksView();
  if(tkSheet && tkSheet.kind === 'task') tkDrawSheet();
}
function tkShow(view){
  if(view) tkView = view;
  if(typeof launchShowTab === 'function') launchShowTab('tasks');
  window.scrollTo({top: 0});
}

function renderTasksView(){
  const root = document.getElementById('tasksRoot');
  if(!root) return;
  if(!tkSignedIn()){
    root.innerHTML = `<section class="tk-card tk-gate">
      <h3>Tasks${esLine('Tasks')}</h3>
      <p>Sign in with your clock-in PIN to see what’s on your list.${esLine('Sign in to see your tasks')}</p>
      <button type="button" class="btn btn-primary" data-tk-signin>Sign in${esHtml('Sign in')}</button>
    </section>`;
    return;
  }
  const lead = tkCanDelegate();
  const me = tkMyName();
  const mine = tkMine(me);
  const open = tkTasks().filter(tkIsOpen);
  if(!lead && ['team', 'projects'].includes(tkView)) tkView = 'mine';
  const chips = [
    ['mine', 'Mine', mine.length, esText('Mine')],
    lead && ['team', 'Team', open.length, ''],
    lead && ['projects', 'Projects', tkProjects().filter(p => p.status !== 'done').length, ''],
    ['done', 'Done', '', esText('Done')],
  ].filter(Boolean);
  const actions = lead ? `<div class="tk-actions">
      <button type="button" class="btn btn-primary tk-new" data-tk-new-task>${TK_ICON_PLUS} New task</button>
      <button type="button" class="btn btn-ghost tk-new" data-tk-new-project>${TK_ICON_PLUS} New project</button>
    </div>` : '';
  root.innerHTML = `
    <div class="tk-head">
      <h2>Tasks${esLine('Tasks')}</h2>
      <p>${lead ? 'What’s been handed to whom, and how it’s going.' : `What’s been handed to you${me ? `, ${escapeHtml(tkFirst(me))}` : ''}.${esHtml('What’s been handed to you')}`}</p>
    </div>
    ${actions}
    <nav class="tk-chips" aria-label="Tasks pages">${chips.map(([k, label, n, es]) => `<button type="button" class="tk-chip${tkView === k ? ' active' : ''}" data-tk-view="${k}" aria-current="${tkView === k ? 'page' : 'false'}">${label}${n !== '' ? ` <b>${n}</b>` : ''}${es ? `<small lang="es">${escapeHtml(es)}</small>` : ''}</button>`).join('')}</nav>
    ${tkError ? `<p class="tk-error" role="alert">${escapeHtml(tkError)}</p>` : ''}
    ${tkView === 'mine' ? tkMineHtml(me, mine, lead) : tkView === 'team' ? tkTeamHtml(open) : tkView === 'projects' ? tkProjectsHtml() : tkDoneHtml(me, lead)}`;
}

function tkRowHtml(t, opts){
  const o = opts || {};
  const due = tkDue(t);
  const project = tkProject(t.projectId);
  const notes = tkNotes(t).length;
  const meta = [
    o.showTo !== false && (t.to ? `For ${t.to}` : 'Not delegated yet'),
    o.showProject !== false && project && project.name,
    due.text,
    notes && `${notes} ${notes === 1 ? 'note' : 'notes'}`,
    !tkIsOpen(t) && t.doneBy && `Done by ${t.doneBy}${t.doneAt ? ` · ${tkDayText(toLocalISODate(new Date(t.doneAt)))}` : ''}`,
  ].filter(Boolean);
  const canTick = o.canTick !== undefined ? o.canTick : (tkCanDelegate() || tkSame(t.to, tkMyName()));
  return `<li class="tk-row${tkIsOpen(t) ? '' : ' is-done'}${due.tone ? ' is-' + due.tone : ''}">
      ${canTick ? `<button type="button" class="tk-check" data-tk-toggle="${escapeHtml(t.id)}" aria-label="${tkIsOpen(t) ? 'Mark done' : 'Mark not done'}: ${escapeHtml(t.title)}"${tkBusy ? ' disabled' : ''}>${TK_ICON_CHECK}</button>` : `<span class="tk-check is-plain" aria-hidden="true">${TK_ICON_CHECK}</span>`}
      <span class="tk-main" data-tk-open="${escapeHtml(t.id)}" role="button" tabindex="0">
        <b class="tk-title">${escapeHtml(t.title)}</b>
        ${meta.length ? `<span class="tk-meta">${meta.map(escapeHtml).join(' · ')}${o.es && due.es ? esSpan(due.es) : ''}</span>` : ''}
      </span>
      <span class="tk-go" aria-hidden="true">${TK_ICON_GO}</span>
    </li>`;
}
function tkListHtml(list, opts, empty){
  return list.length ? `<ul class="tk-list">${list.map(t => tkRowHtml(t, opts)).join('')}</ul>` : `<p class="tk-empty">${empty}</p>`;
}

function tkMineHtml(me, mine, lead){
  const overdue = mine.filter(tkOverdue).length;
  const byMe = lead && me ? tkTasks().filter(t => tkIsOpen(t) && tkSame(t.by, me) && !tkSame(t.to, me)) : [];
  const head = !me ? '<p class="tk-empty">Sign in by name to see your own tasks. The team’s are under Team.</p>'
    : mine.length ? `<p class="tk-sum">${mine.length} ${mine.length === 1 ? 'task' : 'tasks'} for you${overdue ? ` · <span class="is-bad">${overdue} overdue</span>` : ''}${esLine('N tasks for you', mine.length)}</p>`
    : `<p class="tk-empty">Nothing on your list right now.${esLine('Nothing for you right now')}</p>`;
  return `<section class="tk-card tk-mine">
      <h3>Your tasks${esLine('Your tasks')}</h3>
      ${head}
      ${mine.length ? `<ul class="tk-list">${tkSort(mine).map(t => tkRowHtml(t, {showTo: false, es: true, canTick: true})).join('')}</ul>` : ''}
    </section>
    ${byMe.length ? `<section class="tk-card">
      <h3>Delegated by you</h3>
      <p class="tk-sum">${byMe.length} open${byMe.filter(tkOverdue).length ? ` · <span class="is-bad">${byMe.filter(tkOverdue).length} overdue</span>` : ''}</p>
      <ul class="tk-list">${tkSort(byMe).map(t => tkRowHtml(t)).join('')}</ul>
    </section>` : ''}`;
}

function tkTeamHtml(open){
  const weekEnd = tkEndOfWeek();
  const overdue = open.filter(tkOverdue);
  const unassigned = open.filter(t => !t.to);
  const week = open.filter(t => t.due && t.due <= weekEnd);
  const filters = [['open', 'All open', open.length], ['overdue', 'Overdue', overdue.length], ['week', 'Due this week', week.length], ['unassigned', 'Not delegated', unassigned.length]];
  const shown = tkTeamFilter === 'overdue' ? overdue : tkTeamFilter === 'week' ? week : tkTeamFilter === 'unassigned' ? unassigned : open;
  // By person: most overdue first, then most open, then by name; the undelegated last.
  const groups = new Map();
  shown.forEach(t => {
    const key = t.to ? (([...groups.keys()].find(k => k && tkSame(k, t.to))) || t.to) : '';
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });
  const rows = [...groups.entries()].map(([name, list]) => ({name, list: tkSort(list), overdue: list.filter(tkOverdue).length}))
    .sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1) || b.overdue - a.overdue || b.list.length - a.list.length || a.name.localeCompare(b.name));
  return `<section class="tk-card">
      <div class="tk-card-head"><h3>The team</h3><p>${open.length} open${overdue.length ? ` · <span class="is-bad">${overdue.length} overdue</span>` : ''}${unassigned.length ? ` · ${unassigned.length} not delegated yet` : ''}</p></div>
      <div class="tk-filters" role="group" aria-label="Show">${filters.map(([k, label, n]) => `<button type="button" class="tk-filter${tkTeamFilter === k ? ' is-on' : ''}" data-tk-filter="${k}" aria-pressed="${tkTeamFilter === k}">${label} <b>${n}</b></button>`).join('')}</div>
      ${rows.length ? rows.map(g => `<div class="tk-group">
          <div class="tk-group-head"><b>${g.name ? escapeHtml(g.name) : 'Not delegated yet'}</b><span>${g.list.length} open${g.overdue ? ` · <em class="is-bad">${g.overdue} overdue</em>` : ''}</span></div>
          <ul class="tk-list">${g.list.map(t => tkRowHtml(t, {showTo: false})).join('')}</ul>
        </div>`).join('') : `<p class="tk-empty">${open.length ? 'Nothing here.' : 'No open tasks. Tap New task to hand one out.'}</p>`}
    </section>`;
}

function tkProgress(p){
  const list = tkTasks().filter(t => t.projectId === p.id);
  const done = list.filter(t => !tkIsOpen(t)).length;
  return {list, total: list.length, done, overdue: list.filter(tkOverdue).length, pct: list.length ? Math.round(done * 100 / list.length) : 0};
}
function tkBarHtml(pr){
  return `<div class="tk-bar" role="img" aria-label="${pr.done} of ${pr.total} done"><span style="width:${pr.pct}%"></span></div>`;
}

function tkProjectsHtml(){
  if(tkProjectOpen){
    const p = tkProject(tkProjectOpen);
    if(p) return tkProjectPageHtml(p);
    tkProjectOpen = '';
  }
  const projects = tkProjects();
  const open = projects.filter(p => p.status !== 'done').sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : (b.createdAt || 0) - (a.createdAt || 0));
  const done = projects.filter(p => p.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const card = p => {
    const pr = tkProgress(p);
    const meta = [p.owner && `${p.owner}’s`, p.due && (p.status === 'done' ? `was due ${tkDayText(p.due)}` : p.due < today ? `past its date, ${tkDayText(p.due)}` : `by ${tkDayText(p.due)}`)].filter(Boolean);
    return `<li class="tk-project${p.status === 'done' ? ' is-done' : ''}${p.status !== 'done' && p.due && p.due < today ? ' is-bad' : ''}" data-tk-project="${escapeHtml(p.id)}" role="button" tabindex="0">
        <div class="tk-project-top"><b>${escapeHtml(p.name)}</b><span class="tk-go" aria-hidden="true">${TK_ICON_GO}</span></div>
        ${meta.length ? `<span class="tk-meta">${meta.map(escapeHtml).join(' · ')}</span>` : ''}
        ${pr.total ? `${tkBarHtml(pr)}<span class="tk-meta">${pr.done} of ${pr.total} done${pr.overdue ? ` · <em class="is-bad">${pr.overdue} overdue</em>` : ''}</span>` : '<span class="tk-meta">No tasks yet</span>'}
      </li>`;
  };
  return `<section class="tk-card">
      <div class="tk-card-head"><h3>Projects</h3><p>${open.length} going${done.length ? ` · ${done.length} done` : ''}</p></div>
      ${open.length ? `<ul class="tk-projects">${open.map(card).join('')}</ul>` : '<p class="tk-empty">No projects yet. A project groups the tasks that get one bigger thing done.</p>'}
      ${done.length ? `<details class="tk-fold"><summary>Done projects <b>${done.length}</b></summary><ul class="tk-projects">${done.map(card).join('')}</ul></details>` : ''}
    </section>`;
}

function tkProjectPageHtml(p){
  const pr = tkProgress(p);
  const open = tkSort(pr.list.filter(tkIsOpen)), done = tkSort(pr.list.filter(t => !tkIsOpen(t)));
  const meta = [p.owner && `Owner: ${p.owner}`, p.due && `Target: ${tkDayText(p.due)}`, p.by && `Started by ${p.by}${p.createdAt ? ` ${tkDayText(toLocalISODate(new Date(p.createdAt)))}` : ''}`].filter(Boolean);
  return `<section class="tk-card tk-project-page${p.status === 'done' ? ' is-done' : ''}">
      <button type="button" class="tk-back" data-tk-back>${TK_ICON_BACK} All projects</button>
      <div class="tk-card-head"><h3>${escapeHtml(p.name)}</h3></div>
      ${p.why ? `<p class="tk-why">${escapeHtml(p.why)}</p>` : ''}
      ${meta.length ? `<p class="tk-meta">${meta.map(escapeHtml).join(' · ')}</p>` : ''}
      ${pr.total ? `${tkBarHtml(pr)}<p class="tk-meta">${pr.done} of ${pr.total} done${pr.overdue ? ` · <em class="is-bad">${pr.overdue} overdue</em>` : ''}</p>` : ''}
      ${p.status === 'done' ? `<p class="tk-sum">Done${p.doneAt ? ` ${tkDayText(toLocalISODate(new Date(p.doneAt)))}` : ''}.</p>` : ''}
      <div class="tk-actions">
        <button type="button" class="btn btn-primary tk-new" data-tk-new-task="${escapeHtml(p.id)}">${TK_ICON_PLUS} Task in this project</button>
        <button type="button" class="btn btn-ghost" data-tk-edit-project="${escapeHtml(p.id)}">Edit</button>
        <button type="button" class="btn btn-ghost" data-tk-project-done="${escapeHtml(p.id)}">${p.status === 'done' ? 'Reopen project' : 'Mark project done'}</button>
      </div>
      <h4 class="tk-sub">Open <b>${open.length}</b></h4>
      ${tkListHtml(open, {showProject: false}, 'Nothing open.')}
      ${done.length ? `<details class="tk-fold"><summary>Done <b>${done.length}</b></summary>${tkListHtml(done, {showProject: false}, '')}</details>` : ''}
      <button type="button" class="ld-link tk-delete" data-tk-delete-project="${escapeHtml(p.id)}">Delete this project</button>
    </section>`;
}

function tkDoneHtml(me, lead){
  const cutoff = Date.now() - TK_RECENT_DAYS * TK_DAY_MS;
  let done = tkTasks().filter(t => !tkIsOpen(t) && (t.doneAt || 0) > cutoff);
  if(!lead) done = done.filter(t => tkSame(t.to, me) || tkSame(t.doneBy, me));
  done = tkSort(done);
  return `<section class="tk-card">
      <div class="tk-card-head"><h3>Done lately${esLine('Done')}</h3><p>The last ${TK_RECENT_DAYS} days</p></div>
      ${tkListHtml(done, {showTo: lead, es: !lead}, lead ? 'Nothing marked done yet.' : `Nothing done yet.${esLine('Nothing done yet')}`)}
    </section>`;
}

// ----- The Right Now card (Home) -----
function tkRightNowRow(v){
  if(!v || !v.name || typeof rnRow !== 'function') return null;
  const mine = tkSort(tkMine(v.name));
  if(!mine.length) return null;
  const overdue = mine.filter(tkOverdue).length;
  const text = mine.length === 1 ? `Task for you: ${mine[0].title}${overdue ? ' (overdue)' : ''}`
    : `${mine.length} tasks for you${overdue ? `, ${overdue} overdue` : ''}`;
  return rnRow(String(mine.length), text, esText('N tasks for you', mine.length), 'tasks:mine', overdue ? 'bad' : '');
}

// ----- Sheets -----
function tkOpenSheet(sheet){
  tkSheet = sheet;
  tkPickQuery = '';
  if(sheet.kind === 'edit'){ const t = sheet.id ? tkTask(sheet.id) : null; tkPicked = t ? t.to || '' : (sheet.to || ''); }
  if(sheet.kind === 'project'){ const p = sheet.id ? tkProject(sheet.id) : null; tkPicked = p ? p.owner || '' : tkMyName(); }
  const el = document.getElementById('tkSheet');
  if(el) el.classList.add('active');
  tkDrawSheet();
  if(sheet.kind !== 'task' && typeof teamNamesLoad === 'function') teamNamesLoad().then(() => { if(tkSheet && tkSheet.kind !== 'task') tkDrawPicker(); });
}
function tkCloseSheet(){
  tkSheet = null;
  const el = document.getElementById('tkSheet');
  if(el) el.classList.remove('active');
}
function tkDrawSheet(){
  const card = document.getElementById('tkSheetCard');
  if(!card || !tkSheet) return;
  const head = (title, es) => `<div class="tk-sheet-head"><h2 id="tkSheetTitle">${escapeHtml(title)}${es ? esLine(es) : ''}</h2><button type="button" class="dir-x" data-tk-close aria-label="Close">${TK_ICON_X}</button></div>`;
  if(tkSheet.kind === 'task'){
    const t = tkTask(tkSheet.id);
    if(!t){ tkCloseSheet(); return; }
    const due = tkDue(t), project = tkProject(t.projectId), lead = tkCanDelegate(), mineOwn = tkSame(t.to, tkMyName());
    const notes = tkNotes(t);
    card.innerHTML = `${head(t.title)}
      <div class="tk-facts">
        ${t.to ? `<span><small>For${esHtml('For')}</small>${escapeHtml(t.to)}</span>` : '<span><small>For</small>Not delegated yet</span>'}
        ${t.by ? `<span><small>From${esHtml('From')}</small>${escapeHtml(t.by)}</span>` : ''}
        ${project ? `<span><small>Project</small>${escapeHtml(project.name)}</span>` : ''}
        ${due.text ? `<span class="${due.tone ? 'is-' + due.tone : ''}"><small>When</small>${escapeHtml(due.text)}${due.es ? esSpan(due.es) : ''}</span>` : ''}
        ${!tkIsOpen(t) ? `<span class="is-ok"><small>Done${esHtml('Done')}</small>${escapeHtml([t.doneBy, tkWhen(t.doneAt)].filter(Boolean).join(' · '))}</span>` : ''}
      </div>
      ${t.detail ? `<p class="tk-detail">${escapeHtml(t.detail).replace(/\n/g, '<br>')}</p>` : ''}
      ${tkError ? `<p class="tk-error" role="alert">${escapeHtml(tkError)}</p>` : ''}
      <div class="tk-sheet-go">
        ${lead || mineOwn ? `<button type="button" class="btn ${tkIsOpen(t) ? 'btn-primary' : 'btn-ghost'}" data-tk-toggle="${escapeHtml(t.id)}"${tkBusy ? ' disabled' : ''}>${tkIsOpen(t) ? `Mark done${esHtml('Mark done')}` : `Not done yet${esHtml('Not done yet')}`}</button>` : ''}
        ${lead ? `<button type="button" class="btn btn-ghost" data-tk-edit="${escapeHtml(t.id)}">Edit</button>` : ''}
      </div>
      <h4 class="tk-sub">Notes${esHtml('Notes')} <b>${notes.length}</b></h4>
      ${notes.length ? `<ul class="tk-notes">${notes.map(n => `<li><span>${escapeHtml(n.text).replace(/\n/g, '<br>')}</span><small>${escapeHtml([n.by, tkWhen(n.ts)].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul>` : ''}
      ${lead || mineOwn ? `<form class="tk-note-form" data-tk-note-form="${escapeHtml(t.id)}">
        <input type="text" name="note" maxlength="${TK_NOTE_MAX}" placeholder="Add a note${esText('Add a note') ? ' · ' + escapeHtml(esText('Add a note')) : ''}" aria-label="Add a note" autocomplete="off">
        <button type="submit" class="btn btn-ghost"${tkBusy ? ' disabled' : ''}>Add</button>
      </form>` : ''}
      ${lead ? `<button type="button" class="ld-link tk-delete" data-tk-delete="${escapeHtml(t.id)}">Delete this task</button>` : ''}`;
    return;
  }
  if(tkSheet.kind === 'edit'){
    const t = tkSheet.id ? tkTask(tkSheet.id) : null;
    const projectId = t ? t.projectId || '' : tkSheet.projectId || '';
    const projects = tkProjects().filter(p => p.status !== 'done' || p.id === projectId);
    const due = t ? t.due || '' : '';
    card.innerHTML = `${head(t ? 'Edit task' : 'New task')}
      <form class="tk-form" data-tk-task-form="${escapeHtml(t ? t.id : '')}">
        <label>What <input type="text" name="title" maxlength="${TK_TITLE_MAX}" required value="${escapeHtml(t ? t.title : '')}" placeholder="e.g. Deep clean the ice machine" autocomplete="off"></label>
        <label>Details <small>optional</small><textarea name="detail" maxlength="${TK_DETAIL_MAX}" rows="3" placeholder="What done looks like, where things are, who to ask">${escapeHtml(t ? t.detail || '' : '')}</textarea></label>
        <div class="tk-field"><span class="tk-label">Who</span><div id="tkPicker"></div></div>
        <label>Project <select name="projectId"><option value="">No project</option>${projects.map(p => `<option value="${escapeHtml(p.id)}"${p.id === projectId ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select></label>
        <div class="tk-field"><span class="tk-label">By when</span>
          <div class="tk-quick">${[['', 'No date'], [today, 'Today'], [tkAddDays(today, 1), 'Tomorrow'], [tkEndOfWeek(), 'This week']].map(([iso, label]) => `<button type="button" class="tk-filter${due === iso ? ' is-on' : ''}" data-tk-due="${iso}">${label}</button>`).join('')}</div>
          <input type="date" name="due" value="${due}" min="${tkAddDays(today, -365)}" aria-label="Due date">
        </div>
        <div class="tk-sheet-go"><button type="submit" class="btn btn-primary">${t ? 'Save' : 'Add task'}</button><button type="button" class="ld-link" data-tk-close>Cancel</button></div>
      </form>`;
    tkDrawPicker();
    const first = card.querySelector('input[name="title"]');
    if(first && !t) setTimeout(() => first.focus(), 50);
    return;
  }
  if(tkSheet.kind === 'project'){
    const p = tkSheet.id ? tkProject(tkSheet.id) : null;
    card.innerHTML = `${head(p ? 'Edit project' : 'New project')}
      <form class="tk-form" data-tk-project-form="${escapeHtml(p ? p.id : '')}">
        <label>Name <input type="text" name="name" maxlength="${TK_TITLE_MAX}" required value="${escapeHtml(p ? p.name : '')}" placeholder="e.g. Holiday catering push" autocomplete="off"></label>
        <label>Why it matters <small>optional</small><textarea name="why" maxlength="${TK_DETAIL_MAX}" rows="2" placeholder="The outcome, in a line or two">${escapeHtml(p ? p.why || '' : '')}</textarea></label>
        <div class="tk-field"><span class="tk-label">Owner</span><div id="tkPicker"></div></div>
        <label>Target date <input type="date" name="due" value="${escapeHtml(p ? p.due || '' : '')}"></label>
        <div class="tk-sheet-go"><button type="submit" class="btn btn-primary">${p ? 'Save' : 'Add project'}</button><button type="button" class="ld-link" data-tk-close>Cancel</button></div>
      </form>`;
    tkDrawPicker();
    const first = card.querySelector('input[name="name"]');
    if(first && !p) setTimeout(() => first.focus(), 50);
  }
}

// The person picker: who's picked, a search box, and the names that match
// (the first eight). "Nobody yet" leaves a task for later.
function tkDrawPicker(){
  const host = document.getElementById('tkPicker');
  if(!host) return;
  const q = tkPickQuery.trim().toLowerCase();
  const people = tkPeople();
  const hits = (q ? people.filter(n => n.toLowerCase().includes(q)) : people).filter(n => !tkSame(n, tkPicked)).slice(0, 8);
  const keep = host.querySelector('input');
  const pos = keep ? keep.selectionStart : null;
  host.innerHTML = `
    ${tkPicked ? `<div class="tk-picked"><span>${escapeHtml(tkPicked)}</span><button type="button" class="dir-x" data-tk-unpick aria-label="Clear">${TK_ICON_X}</button></div>` : '<p class="tk-meta">Nobody yet</p>'}
    <input type="search" class="tk-search" value="${escapeHtml(tkPickQuery)}" placeholder="${people.length ? 'Find someone' : 'Loading the team…'}" aria-label="Find someone" autocomplete="off" data-tk-pick-search>
    <div class="tk-hits">${hits.map(n => `<button type="button" class="tk-hit" data-tk-pick="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join('')}${!hits.length && q ? '<span class="tk-meta">Nobody by that name on the team.</span>' : ''}</div>`;
  if(pos !== null){ const again = host.querySelector('input'); if(again){ again.focus(); again.setSelectionRange(pos, pos); } }
}

// ----- Taps -----
function tkSubmitTask(form){
  const id = form.dataset.tkTaskForm;
  const old = id ? tkTask(id) : null;
  const title = form.title.value.trim().slice(0, TK_TITLE_MAX);
  if(!title){ form.title.focus(); return; }
  const task = {
    ...(old || {id: tkId('tk'), status: 'open', createdAt: Date.now(), by: tkMyName() || 'Director', notes: []}),
    title, detail: form.detail.value.trim().slice(0, TK_DETAIL_MAX), to: tkPicked || '',
    projectId: form.projectId.value || '', due: form.due.value || '',
  };
  if(old) tkReplaceTask(task); else teamTasks = [...tkTasks(), task];
  tkCloseSheet();
  if(!old && task.projectId && tkView === 'projects') tkProjectOpen = task.projectId;
  tkSave();
  showToast(old ? 'Task saved' : task.to ? `Delegated to ${tkFirst(task.to)}` : 'Task added');
}
function tkSubmitProject(form){
  const id = form.dataset.tkProjectForm;
  const old = id ? tkProject(id) : null;
  const name = form.name.value.trim().slice(0, TK_TITLE_MAX);
  if(!name){ form.name.focus(); return; }
  const project = {
    ...(old || {id: tkId('pj'), status: 'open', createdAt: Date.now(), by: tkMyName() || 'Director'}),
    name, why: form.why.value.trim().slice(0, TK_DETAIL_MAX), owner: tkPicked || '', due: form.due.value || '',
  };
  if(old) teamProjects = tkProjects().map(p => p.id === project.id ? project : p); else teamProjects = [...tkProjects(), project];
  tkCloseSheet();
  tkView = 'projects'; tkProjectOpen = project.id;
  tkSave();
  showToast(old ? 'Project saved' : 'Project added');
}

document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t) return;
  const inPage = t.closest('#tasksRoot'), inSheet = t.closest('#tkSheet');
  if(!inPage && !inSheet) return;
  if(inSheet && !t.closest('#tkSheetCard')){ tkCloseSheet(); return; }     // a tap outside the card
  const b = t.closest('button, [data-tk-open], [data-tk-project]');
  if(!b) return;
  if(b.hasAttribute('data-tk-signin')){ if(typeof siOpen === 'function') siOpen(); return; }
  if(b.dataset.tkView){ tkView = b.dataset.tkView; tkProjectOpen = ''; tkError = ''; renderTasksView(); return; }
  if(b.dataset.tkFilter){ tkTeamFilter = b.dataset.tkFilter; renderTasksView(); return; }
  if(b.hasAttribute('data-tk-close')){ tkCloseSheet(); return; }
  if(b.hasAttribute('data-tk-back')){ tkProjectOpen = ''; renderTasksView(); return; }
  if(b.dataset.tkOpen){ tkError = ''; tkOpenSheet({kind: 'task', id: b.dataset.tkOpen}); return; }
  if(b.dataset.tkProject){ tkProjectOpen = b.dataset.tkProject; renderTasksView(); return; }
  if(b.dataset.tkToggle){ const task = tkTask(b.dataset.tkToggle); if(task) tkSetDone(task.id, tkIsOpen(task)); return; }
  if(b.hasAttribute('data-tk-new-task')){ if(!tkCanDelegate()) return; tkOpenSheet({kind: 'edit', id: '', projectId: b.dataset.tkNewTask || tkProjectOpen || ''}); return; }
  if(b.hasAttribute('data-tk-new-project')){ if(!tkCanDelegate()) return; tkOpenSheet({kind: 'project', id: ''}); return; }
  if(b.dataset.tkEdit){ if(!tkCanDelegate()) return; tkOpenSheet({kind: 'edit', id: b.dataset.tkEdit}); return; }
  if(b.dataset.tkEditProject){ if(!tkCanDelegate()) return; tkOpenSheet({kind: 'project', id: b.dataset.tkEditProject}); return; }
  if(b.dataset.tkProjectDone){
    if(!tkCanDelegate()) return;
    const p = tkProject(b.dataset.tkProjectDone);
    if(!p) return;
    const done = p.status !== 'done';
    const next = {...p, status: done ? 'done' : 'open'};
    if(done) next.doneAt = Date.now(); else delete next.doneAt;
    teamProjects = tkProjects().map(x => x.id === p.id ? next : x);
    tkSave();
    showToast(done ? 'Project marked done' : 'Project reopened');
    return;
  }
  if(b.dataset.tkDelete){
    if(!tkCanDelegate()) return;
    const task = tkTask(b.dataset.tkDelete);
    if(!task || !confirm(`Delete “${task.title}”? It goes for everyone.`)) return;
    teamTasks = tkTasks().filter(x => x.id !== task.id);
    tkCloseSheet();
    tkSave();
    showToast('Task deleted');
    return;
  }
  if(b.dataset.tkDeleteProject){
    if(!tkCanDelegate()) return;
    const p = tkProject(b.dataset.tkDeleteProject);
    if(!p) return;
    const n = tkTasks().filter(x => x.projectId === p.id).length;
    if(!confirm(`Delete “${p.name}”?${n ? ` Its ${n} ${n === 1 ? 'task stays' : 'tasks stay'}, with no project.` : ''}`)) return;
    teamProjects = tkProjects().filter(x => x.id !== p.id);
    teamTasks = tkTasks().map(x => x.projectId === p.id ? {...x, projectId: ''} : x);
    tkProjectOpen = '';
    tkSave();
    showToast('Project deleted');
    return;
  }
  if(b.dataset.tkDue !== undefined){
    const inp = b.closest('form').querySelector('input[name="due"]');
    if(inp) inp.value = b.dataset.tkDue;
    b.parentElement.querySelectorAll('[data-tk-due]').forEach(x => x.classList.toggle('is-on', x === b));
    return;
  }
  if(b.dataset.tkPick){ tkPicked = b.dataset.tkPick; tkPickQuery = ''; tkDrawPicker(); return; }
  if(b.hasAttribute('data-tk-unpick')){ tkPicked = ''; tkDrawPicker(); return; }
});

document.addEventListener('keydown', e => {
  const t = e.target;
  if(e.key === 'Escape' && tkSheet){ tkCloseSheet(); return; }
  if(!t || !t.closest || !(t.closest('#tasksRoot') || t.closest('#tkSheet'))) return;
  if((e.key === 'Enter' || e.key === ' ') && t.matches('[data-tk-open], [data-tk-project]')){ e.preventDefault(); t.click(); }
});

document.addEventListener('input', e => {
  const t = e.target;
  if(!t || !t.matches) return;
  if(t.matches('#tkSheet [data-tk-pick-search]')){ tkPickQuery = t.value; tkDrawPicker(); return; }
  if(t.matches('#tkSheet input[name="due"]')){
    t.closest('form').querySelectorAll('[data-tk-due]').forEach(x => x.classList.toggle('is-on', x.dataset.tkDue === t.value));
  }
});

document.addEventListener('submit', e => {
  const f = e.target;
  if(!f || !f.closest || !f.closest('#tkSheet')) return;
  e.preventDefault();
  if(f.dataset.tkTaskForm !== undefined){ tkSubmitTask(f); return; }
  if(f.dataset.tkProjectForm !== undefined){ tkSubmitProject(f); return; }
  if(f.dataset.tkNoteForm){
    const text = f.note.value.trim();
    if(!text) return;
    f.note.value = '';
    tkAddNote(f.dataset.tkNoteForm, text);
  }
});
