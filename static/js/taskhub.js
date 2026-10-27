// ===== TASKS (TaskHub; Oct 27 2026) =====
// Delegation for the leadership team: boards of tasks, each with a person,
// a due date and a status, and the flow between the person who hands work
// off and the one who takes it (assign → accept → blocked / done), with a
// note to the other side at each step. Everything goes through
// /taskhub/api (taskhub/, a Flask blueprint); this file is the screen.
//
// In the hub it mounts into #tasksView when the Tasks tab opens
// (navigation.js thActivate). Who's holding the phone comes from the hub's
// own sign-in (the server reads the session); nobody signed in can look
// but not act. Standalone (python3 -m taskhub) the page picks a demo person.
//
// The DOM is built with el(), never innerHTML with people's text.
(function(){
  'use strict';

  const POLL_MS = 15000;
  const LS = {
    get: (k, d) => { try { return localStorage.getItem('taskhub.' + k) ?? d; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem('taskhub.' + k, v); } catch (e) {} },
  };

  const S = {
    root: null, api: '/taskhub/api', host: false, mounted: false,
    me: null, members: [], boards: [], boardId: null, board: null, tasks: [],
    view: LS.get('view', 'board'), search: '',
    filters: { assignee: '', status: '', priority: '', label: '' },
    openTaskId: null, openTask: null, notifs: [], unread: 0, mine: null,
    sort: { key: 'due_at', desc: false }, pollTimer: null, layer: null,
  };

  // ---------- tiny DOM helpers ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  function el(tag, attrs, ...children){
    const node = document.createElement(tag);
    for(const [k, v] of Object.entries(attrs || {})){
      if(v === null || v === undefined || v === false) continue;
      if(k === 'class') node.className = v;
      else if(k === 'dataset') Object.assign(node.dataset, v);
      else if(k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if(k === 'html') node.innerHTML = v;   // only ever the static SVG strings below
      else if(v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    }
    for(const c of children.flat()){
      if(c === null || c === undefined || c === false) continue;
      node.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
  }
  const SVG = (d, extra) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra || ''}</svg>`;
  const ICON = {
    check: SVG('<path d="m5 12 4 4L19 6"/>'),
    close: SVG('<path d="M6 6l12 12M18 6L6 18"/>'),
    plus: SVG('<path d="M12 5v14M5 12h14"/>'),
    clock: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    block: SVG('<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>'),
    list: SVG('<path d="M9 6h11M9 12h11M9 18h11"/><path d="m4 6 1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>'),
    bell: SVG('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
    search: SVG('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    go: SVG('<path d="M9 6l6 6-6 6"/>'),
    user: SVG('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.9-3.6 3.6-5.5 7-5.5s6.1 1.9 7 5.5"/>'),
    flag: SVG('<path d="M5 21V4h11l-1.5 4L16 12H5"/>'),
    settings: SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  };
  const svg = name => el('span', { class: 'th-ico', html: ICON[name] });

  // ---------- API ----------
  async function api(path, opts){
    opts = opts || {};
    const headers = { 'Accept': 'application/json' };
    if(!S.host && S.me) headers['X-Taskhub-Member'] = S.me.id;
    if(opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(S.api + path, { method: opts.method || 'GET', headers, credentials: 'same-origin', body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    if(res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if(!res.ok){ const err = new Error(data.error || res.statusText); err.status = res.status; throw err; }
    return data;
  }

  // ---------- formatting ----------
  const pad2 = n => String(n).padStart(2, '0');
  const isoDate = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const todayISO = () => isoDate(new Date());
  function dueBucket(due){
    if(!due) return 'none';
    const d = due.slice(0, 10), t = todayISO();
    if(d < t) return 'overdue';
    if(d === t) return 'today';
    const week = new Date(); week.setDate(week.getDate() + 7);
    return d <= isoDate(week) ? 'week' : 'later';
  }
  function fmtDue(due){
    if(!due) return '';
    const b = dueBucket(due);
    if(b === 'today') return 'Today';
    const d = new Date(due.slice(0, 10) + 'T12:00:00');
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    if(isoDate(d) === isoDate(tomorrow)) return 'Tomorrow';
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    if(isoDate(d) === isoDate(yesterday)) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }
  function timeAgo(iso){
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if(s < 60) return 'just now';
    if(s < 3600) return `${Math.floor(s / 60)}m ago`;
    if(s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if(s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  const member = id => S.members.find(m => m.id === id) || null;
  const nameOf = id => (member(id) || {}).name || (id ? 'Someone' : 'Unassigned');
  // First name, last initial: how the hub writes names on Set Ups.
  function shortName(id){
    const m = member(id); if(!m) return id ? 'Someone' : 'Unassigned';
    const parts = m.name.trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
  }
  const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  function avatar(id, size){
    const m = member(id);
    if(!m) return el('span', { class: 'th-avatar is-empty', title: 'Unassigned' }, '?');
    const a = el('span', { class: 'th-avatar', title: m.name }, initials(m.name));
    if(size) a.style.cssText = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px`;
    return a;
  }
  const STATUS_LABEL = { open: 'Open', accepted: 'Accepted', blocked: 'Blocked', done: 'Done' };
  const PRIORITY_LABEL = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' };
  const columnOf = task => (S.board && S.board.columns.find(c => c.id === task.column_id)) || null;
  const canManage = () => !!(S.me && (S.me.role === 'admin' || S.me.role === 'leader'));

  function duePill(task){
    if(!task.due_at) return null;
    return el('span', { class: `th-pill th-pill-due is-${dueBucket(task.due_at)}` }, svg('clock'), fmtDue(task.due_at));
  }
  function statusPill(task){
    if(task.status === 'open') return null;
    return el('span', { class: 'th-pill th-pill-status', dataset: { status: task.status } }, task.status === 'blocked' ? svg('block') : null, STATUS_LABEL[task.status]);
  }
  function checklistPill(task){
    if(!task.checklist.length) return null;
    const done = task.checklist.filter(i => i.done).length;
    return el('span', { class: `th-pill${done === task.checklist.length ? ' is-ok' : ''}` }, svg('list'), `${done}/${task.checklist.length}`);
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, isError){
    if(!isError && typeof window.showToast === 'function'){ window.showToast(msg); return; }
    let t = $('.th-toast', S.layer);
    if(!t){ t = el('div', { class: 'th-toast', role: 'status', 'aria-live': 'polite' }); S.layer.append(t); }
    t.textContent = msg; t.classList.toggle('is-error', !!isError); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 4500 : 2200);
  }
  function needSignIn(){
    toast('Sign in to use Tasks', true);
    if(typeof window.siOpen === 'function') window.siOpen();
  }
  async function guard(fn, okMsg){
    try { const r = await fn(); if(okMsg) toast(okMsg); return r; }
    catch(e){
      if(e.status === 401) needSignIn();
      else if(e.status === 409){ toast('Someone changed this task first. Reloaded it.', true); await refreshAll(); }
      else toast(e.message || 'Something went wrong', true);
      return undefined;
    }
  }

  // ---------- loading ----------
  async function bootstrap(){
    const q = (!S.host && LS.get('me')) ? `?me=${encodeURIComponent(LS.get('me'))}` : '';
    const data = await api('/bootstrap' + q);
    S.host = !!data.host;
    S.members = data.members; S.boards = data.boards;
    S.me = data.me || (S.host ? null : S.members[0] || null);
    if(S.me && !S.host) LS.set('me', S.me.id);
    S.unread = data.unread;
    const saved = LS.get('board');
    S.boardId = S.boards.some(b => b.id === saved) ? saved : (S.boards[0] || {}).id || null;
  }
  async function loadBoard(){
    if(!S.boardId){ S.board = null; S.tasks = []; return; }
    const b = await api(`/boards/${S.boardId}`);
    S.board = b; S.tasks = b.tasks; delete b.tasks;
    fillLabelFilter();
  }
  async function loadMine(){
    if(!S.me){ S.mine = null; return; }
    S.mine = await api(`/my-tasks?today=${todayISO()}`);
    const due = S.mine.assigned.overdue.length + S.mine.assigned.today.length;
    for(const b of [$('.th-mine-count', S.root), $('#tasksTabBadge')]){ if(b){ b.hidden = !due; b.textContent = due; } }
  }
  async function loadNotifs(){
    if(!S.me) return;
    const data = await api('/notifications');
    S.notifs = data.items; S.unread = data.unread;
    const b = $('.th-bell-badge', S.root); if(b){ b.hidden = !S.unread; b.textContent = S.unread > 99 ? '99+' : S.unread; }
  }
  async function loadOpenTask(){
    if(!S.openTaskId) return;
    try { S.openTask = await api(`/tasks/${S.openTaskId}`); }
    catch(e){ if(e.status === 404){ closeDrawer(); toast('That task was deleted'); } }
  }
  async function refreshAll(){
    await Promise.all([loadBoard(), loadMine(), loadNotifs(), loadOpenTask()]);
    render();
  }
  const viewShowing = () => !S.host || S.root.classList.contains('active');
  function startPolling(){
    clearInterval(S.pollTimer);
    S.pollTimer = setInterval(() => { if(!document.hidden && !dragging && viewShowing()) refreshAll().catch(() => {}); }, POLL_MS);
    document.addEventListener('visibilitychange', () => { if(!document.hidden && viewShowing()) refreshAll().catch(() => {}); });
  }

  // ---------- shell ----------
  function buildShell(){
    const root = S.root;
    root.classList.add('th-root');
    const seg = el('div', { class: 'th-seg', role: 'tablist', 'aria-label': 'Tasks views' },
      el('button', { type: 'button', class: 'th-seg-btn', role: 'tab', dataset: { view: 'board' } }, 'Board'),
      el('button', { type: 'button', class: 'th-seg-btn', role: 'tab', dataset: { view: 'list' } }, 'List'),
      el('button', { type: 'button', class: 'th-seg-btn', role: 'tab', dataset: { view: 'mine' } }, 'My Tasks', el('span', { class: 'th-count th-mine-count', hidden: true })),
    );
    const bar = el('div', { class: 'th-bar' },
      seg,
      el('div', { class: 'th-bar-right' },
        el('label', { class: 'th-field th-board-pick' }, el('span', { class: 'th-sr' }, 'Board'), el('select', { class: 'th-board-select', 'aria-label': 'Board' })),
        el('label', { class: 'th-field th-search' }, svg('search'), el('input', { type: 'search', class: 'th-search-input', placeholder: 'Search tasks', autocomplete: 'off', 'aria-label': 'Search tasks' })),
        el('button', { type: 'button', class: 'th-icon-btn th-bell', 'aria-label': 'Notifications', html: ICON.bell }, el('span', { class: 'th-bell-badge', hidden: true })),
        el('label', { class: 'th-field th-me', hidden: true }, el('span', { class: 'th-me-label' }, 'I am'), el('select', { class: 'th-me-select', 'aria-label': 'Who am I' })),
        el('button', { type: 'button', class: 'th-btn th-btn-primary th-new', 'aria-label': 'New task' }, svg('plus'), el('span', {}, 'New task')),
      ),
    );
    const filters = el('div', { class: 'th-filters' },
      el('select', { class: 'th-f-assignee', 'aria-label': 'Filter by person' }),
      el('select', { class: 'th-f-status', 'aria-label': 'Filter by status' },
        el('option', { value: '' }, 'Any status'), el('option', { value: 'open' }, 'Open'), el('option', { value: 'accepted' }, 'Accepted'), el('option', { value: 'blocked' }, 'Blocked'), el('option', { value: 'done' }, 'Done')),
      el('select', { class: 'th-f-priority', 'aria-label': 'Filter by priority' },
        el('option', { value: '' }, 'Any priority'), el('option', { value: 'urgent' }, 'Urgent'), el('option', { value: 'high' }, 'High'), el('option', { value: 'normal' }, 'Normal'), el('option', { value: 'low' }, 'Low')),
      el('select', { class: 'th-f-label', 'aria-label': 'Filter by label' }),
      el('button', { type: 'button', class: 'th-link th-clear', hidden: true }, 'Clear'),
      el('span', { class: 'th-spacer' }),
      el('button', { type: 'button', class: 'th-link th-settings' }, svg('settings'), ' Board settings'),
    );
    root.replaceChildren(bar, filters, el('div', { class: 'th-view', 'aria-live': 'polite' }));
    // Overlays live on the body so they float over the hub's header and tabs.
    S.layer = el('div', { class: 'th-layer' },
      el('div', { class: 'th-scrim', hidden: true }),
      el('aside', { class: 'th-drawer', hidden: true, 'aria-label': 'Task details', role: 'dialog', 'aria-modal': 'true' }),
      el('div', { class: 'th-popover', hidden: true, 'aria-label': 'Notifications' }),
      el('div', { class: 'th-modal', hidden: true }),
    );
    document.body.append(S.layer);
  }
  function fillHeader(){
    const meSel = $('.th-me-select', S.root), meWrap = $('.th-me', S.root);
    meWrap.hidden = S.host;
    if(!S.host) meSel.replaceChildren(...S.members.filter(m => m.active !== false).map(m => el('option', { value: m.id, selected: S.me && m.id === S.me.id }, m.name)));
    const bs = $('.th-board-select', S.root);
    bs.replaceChildren(...S.boards.map(b => el('option', { value: b.id, selected: b.id === S.boardId }, b.name)), el('option', { value: '__new' }, '+ New board'));
    const fa = $('.th-f-assignee', S.root);
    fa.replaceChildren(el('option', { value: '' }, 'Everyone'), el('option', { value: '__none' }, 'Unassigned'),
      ...(S.me ? [el('option', { value: S.me.id }, 'Me')] : []),
      ...S.members.filter(m => m.active !== false && !(S.me && m.id === S.me.id)).map(m => el('option', { value: m.id }, m.name)));
    fa.value = S.filters.assignee;
    $$('.th-seg-btn', S.root).forEach(b => { b.classList.toggle('active', b.dataset.view === S.view); b.setAttribute('aria-selected', b.dataset.view === S.view ? 'true' : 'false'); });
  }
  function fillLabelFilter(){
    const labels = [...new Set(S.tasks.flatMap(t => t.labels))].sort((a, b) => a.localeCompare(b));
    const fl = $('.th-f-label', S.root);
    fl.replaceChildren(el('option', { value: '' }, 'Any label'), ...labels.map(l => el('option', { value: l }, l)));
    fl.value = labels.includes(S.filters.label) ? S.filters.label : '';
  }
  const activeFilterCount = () => Object.values(S.filters).filter(Boolean).length + (S.search ? 1 : 0);
  function visibleTasks(){
    const q = S.search.trim().toLowerCase(), f = S.filters;
    return S.tasks.filter(t => {
      if(f.assignee === '__none' ? t.assignee_id : (f.assignee && t.assignee_id !== f.assignee)) return false;
      if(f.status && t.status !== f.status) return false;
      if(f.priority && t.priority !== f.priority) return false;
      if(f.label && !t.labels.includes(f.label)) return false;
      if(q && !(t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.labels.some(l => l.toLowerCase().includes(q)) || nameOf(t.assignee_id).toLowerCase().includes(q))) return false;
      return true;
    });
  }

  // ---------- render ----------
  function render(){
    if(!S.mounted) return;
    $('.th-clear', S.root).hidden = !activeFilterCount();
    $('.th-filters', S.root).hidden = S.view === 'mine';
    $$('.th-seg-btn', S.root).forEach(b => { b.classList.toggle('active', b.dataset.view === S.view); b.setAttribute('aria-selected', b.dataset.view === S.view ? 'true' : 'false'); });
    const view = $('.th-view', S.root);
    if(S.view === 'board') view.replaceChildren(renderBoard());
    else if(S.view === 'list') view.replaceChildren(renderList());
    else view.replaceChildren(renderMine());
    if(S.openTaskId) renderDrawer();
  }
  const empty = (...c) => el('div', { class: 'th-empty' }, ...c);

  // -- board
  function renderBoard(){
    if(!S.board) return empty('No boards yet. ', el('button', { type: 'button', class: 'th-link', onClick: () => openBoardModal() }, 'Create one'));
    const tasks = visibleTasks();
    const wrap = el('div', { class: 'th-board' });
    for(const col of S.board.columns){
      const inCol = tasks.filter(t => t.column_id === col.id).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
      const open = inCol.filter(t => t.status !== 'done').length;
      wrap.append(el('section', { class: 'th-col', dataset: { column: col.id, kind: col.kind } },
        el('header', { class: 'th-col-head' }, el('span', { class: 'th-col-kind' }), el('h3', { class: 'th-col-name' }, col.name), el('span', { class: `th-pill${col.kind !== 'done' && open ? ' is-count' : ''}` }, col.kind === 'done' ? inCol.length : open)),
        el('div', { class: 'th-col-body', dataset: { column: col.id } }, ...inCol.map(card)),
        el('footer', { class: 'th-col-foot' }, el('button', { type: 'button', class: 'th-add', onClick: () => openTaskModal({ column_id: col.id }) }, svg('plus'), ' Add task')),
      ));
    }
    return wrap;
  }
  function card(t){
    const c = el('article', { class: `th-card${t.status === 'done' ? ' is-done' : ''}${t.status === 'blocked' ? ' is-blocked' : ''}`, dataset: { task: t.id, priority: t.priority }, tabindex: 0, role: 'button' },
      el('h4', { class: 'th-card-title' }, t.title),
      el('div', { class: 'th-card-meta' },
        t.priority === 'urgent' || t.priority === 'high' ? el('span', { class: 'th-pill th-pill-prio', dataset: { priority: t.priority } }, svg('flag'), PRIORITY_LABEL[t.priority]) : null,
        statusPill(t), duePill(t), checklistPill(t),
        ...t.labels.slice(0, 3).map(l => el('span', { class: 'th-pill th-pill-label' }, l)),
        el('span', { class: 'th-card-who' }, avatar(t.assignee_id), el('span', { class: 'th-card-name' }, t.assignee_id ? shortName(t.assignee_id) : '')),
      ),
    );
    c.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openTask(t.id); } });
    return c;
  }

  // -- list
  function renderList(){
    if(!S.board) return empty('No board selected.');
    const cols = [['title', 'Task'], ['status', 'Status'], ['assignee_id', 'Who'], ['column_id', 'Column'], ['due_at', 'Due'], ['priority', 'Priority'], ['labels', 'Labels']];
    const pr = { urgent: 0, high: 1, normal: 2, low: 3 };
    const key = S.sort.key;
    const val = t => key === 'assignee_id' ? nameOf(t.assignee_id) : key === 'column_id' ? (columnOf(t) || {}).name || '' : key === 'priority' ? pr[t.priority] : key === 'labels' ? t.labels.join(',') : (t[key] ?? '￿');
    const rows = visibleTasks().sort((a, b) => { const x = val(a), y = val(b); const r = x < y ? -1 : x > y ? 1 : 0; return S.sort.desc ? -r : r; });
    if(!rows.length) return el('div', { class: 'th-list' }, empty(activeFilterCount() ? 'Nothing matches these filters.' : 'No tasks on this board yet.'));
    const table = el('table', { class: 'th-table' },
      el('thead', {}, el('tr', {}, ...cols.map(([k, label]) => el('th', {
        class: `${k === key ? 'is-sorted' : ''}${S.sort.desc && k === key ? ' is-desc' : ''}`, scope: 'col',
        onClick: () => { S.sort = { key: k, desc: k === key ? !S.sort.desc : false }; render(); },
      }, label)))),
      el('tbody', {}, ...rows.map(t => el('tr', { class: `th-row${t.status === 'done' ? ' is-done' : ''}`, onClick: () => openTask(t.id) },
        el('td', { class: 'th-title' }, t.title),
        el('td', {}, statusPill(t) || el('span', { class: 'th-pill' }, 'Open')),
        el('td', {}, el('span', { class: 'th-who' }, avatar(t.assignee_id), nameOf(t.assignee_id))),
        el('td', {}, (columnOf(t) || {}).name || ''),
        el('td', {}, duePill(t) || el('span', { class: 'th-pill is-dim' }, 'No date')),
        el('td', {}, el('span', { class: 'th-pill th-pill-prio', dataset: { priority: t.priority } }, PRIORITY_LABEL[t.priority])),
        el('td', {}, el('span', { class: 'th-labels' }, ...t.labels.map(l => el('span', { class: 'th-pill th-pill-label' }, l)))),
      ))),
    );
    return el('div', { class: 'th-list' }, table);
  }

  // -- my tasks: the Right Now card's shape (a kicker, rows that open the thing)
  function renderMine(){
    if(!S.me) return el('div', { class: 'th-card-block th-signin' },
      el('h3', {}, 'Who’s holding the phone?'),
      el('p', {}, 'Sign in with your clock-in PIN to see the tasks on your plate and the ones you handed off.'),
      el('button', { type: 'button', class: 'th-btn th-btn-primary', onClick: () => needSignIn() }, 'Sign in'));
    if(!S.mine) return empty('Loading…');
    const g = S.mine.assigned;
    const groups = [['overdue', 'Overdue'], ['today', 'Today'], ['week', 'This week'], ['later', 'Later'], ['none', 'No due date'], ['done', 'Done this week']];
    const openCount = g.overdue.length + g.today.length + g.week.length + g.later.length + g.none.length;
    const left = el('section', { class: 'th-card-block' },
      el('header', { class: 'th-block-head' }, el('div', {}, el('div', { class: 'th-kicker' }, 'On my plate'), el('h3', {}, S.me.name)), el('span', { class: `th-pill${openCount ? ' is-count' : ''}` }, `${openCount} open`)),
      ...(openCount || g.done.length ? groups.filter(([k]) => g[k].length).flatMap(([k, label]) => [
        el('div', { class: `th-group${k === 'overdue' ? ' is-overdue' : ''}` }, label, el('span', { class: 'th-pill' }, g[k].length)),
        ...g[k].map(t => mineRow(t, false)),
      ]) : [empty('Nothing on your plate. Nice.')]),
    );
    const d = S.mine.delegated;
    const right = el('section', { class: 'th-card-block' },
      el('header', { class: 'th-block-head' }, el('div', {}, el('div', { class: 'th-kicker' }, 'Handed off'), el('h3', {}, 'Delegated by me')), el('span', { class: 'th-pill' }, `${d.filter(t => t.status !== 'done').length} open`)),
      ...(d.length ? d.map(t => mineRow(t, true)) : [empty('Assign a task to someone and it shows up here, with where it stands.')]),
    );
    return el('div', { class: 'th-mine' }, left, right);
  }
  function mineRow(t, delegated){
    const board = S.boards.find(b => b.id === t.board_id);
    const sub = [board ? board.name : null, delegated ? shortName(t.assignee_id) : null, t.status === 'blocked' ? `Blocked: ${t.blocked_reason}` : null].filter(Boolean).join(' · ');
    const check = el('button', { type: 'button', class: `th-check${t.status === 'done' ? ' is-done' : ''}`, 'aria-label': t.status === 'done' ? 'Reopen' : 'Mark done', title: t.status === 'done' ? 'Reopen' : 'Mark done', html: t.status === 'done' ? ICON.check : '',
      onClick: async e => { e.stopPropagation(); await guard(() => api(`/tasks/${t.id}/${t.status === 'done' ? 'reopen' : 'complete'}`, { method: 'POST' }), t.status === 'done' ? 'Reopened' : 'Done'); await refreshAll(); } });
    return el('div', { class: `th-row-item is-go${t.status === 'done' ? ' is-done' : ''}`, role: 'button', tabindex: 0, onClick: () => openTask(t.id), onKeydown: e => { if(e.key === 'Enter') openTask(t.id); } },
      check,
      el('span', { class: 'th-row-title' }, t.title, el('span', { class: 'th-row-sub' }, sub)),
      el('span', { class: 'th-row-meta' }, statusPill(t), duePill(t), delegated ? avatar(t.assignee_id) : null), el('span', { class: 'th-go', html: ICON.go }),
    );
  }

  // ---------- drawer (the task sheet) ----------
  function showScrim(on){ $('.th-scrim', S.layer).hidden = !on; document.body.classList.toggle('th-sheet-open', on); }
  async function openTask(id){
    S.openTaskId = id; S.openTask = null;
    const d = $('.th-drawer', S.layer); d.hidden = false; showScrim(true);
    d.replaceChildren(empty('Loading…'));
    await loadOpenTask(); renderDrawer();
  }
  function closeDrawer(){
    S.openTaskId = null; S.openTask = null;
    $('.th-drawer', S.layer).hidden = true;
    if($('.th-modal', S.layer).hidden) showScrim(false);
  }
  async function patchTask(fields, msg){
    const t = S.openTask; if(!t) return;
    const updated = await guard(() => api(`/tasks/${t.id}`, { method: 'PATCH', body: Object.assign({}, fields, { version: t.version }) }), msg);
    if(updated) await refreshAll();
  }
  async function actTask(action, body, msg){
    const t = S.openTask; if(!t) return;
    const r = await guard(() => api(`/tasks/${t.id}/${action}`, { method: 'POST', body }), msg);
    if(r !== undefined) await refreshAll();
  }
  function renderDrawer(){
    const t = S.openTask, d = $('.th-drawer', S.layer);
    if(!t) return;
    const board = S.boards.find(b => b.id === t.board_id) || S.board;
    const columns = board ? board.columns : [];
    const isMine = S.me && t.assignee_id === S.me.id;
    const people = S.members.filter(m => m.active !== false || m.id === t.assignee_id);

    const titleInput = el('input', { class: 'th-title-input', value: t.title, 'aria-label': 'Title' });
    titleInput.addEventListener('keydown', e => { if(e.key === 'Enter') titleInput.blur(); if(e.key === 'Escape'){ titleInput.value = t.title; titleInput.blur(); } });
    titleInput.addEventListener('blur', () => { const v = titleInput.value.trim(); if(v && v !== t.title) patchTask({ title: v }, 'Title saved'); else titleInput.value = t.title; });

    const select = (label, value, options, onChange) => el('div', { class: 'th-prop' }, el('label', {}, label),
      el('select', { 'aria-label': label, onChange: e => onChange(e.target.value) }, ...options.map(([v, text]) => el('option', { value: v, selected: v === (value ?? '') }, text))));
    const dueInput = el('input', { type: 'date', value: (t.due_at || '').slice(0, 10), 'aria-label': 'Due date', onChange: e => patchTask({ due_at: e.target.value || null }, e.target.value ? 'Due date set' : 'Due date cleared') });
    const props = el('div', { class: 'th-props' },
      select('Who', t.assignee_id || '', [['', 'Unassigned'], ...people.map(m => [m.id, m.name])], v => actTask('assign', { assignee_id: v || null }, v ? `Assigned to ${shortName(v)}` : 'Unassigned')),
      el('div', { class: 'th-prop' }, el('label', {}, 'Due'), dueInput),
      select('Priority', t.priority, Object.entries(PRIORITY_LABEL), v => patchTask({ priority: v }, 'Priority saved')),
      select('Column', t.column_id, columns.map(c => [c.id, c.name]), async v => { await guard(() => api(`/tasks/${t.id}/move`, { method: 'POST', body: { column_id: v } }), 'Moved'); await refreshAll(); }),
    );

    const bannerText = {
      open: t.assignee_id ? `Waiting for ${isMine ? 'you' : shortName(t.assignee_id)} to accept` : 'Unassigned. Anyone can pick it up.',
      accepted: `${isMine ? 'You are' : shortName(t.assignee_id) + ' is'} on it`,
      blocked: `Blocked: ${t.blocked_reason}`,
      done: `Done${t.completed_at ? ' ' + timeAgo(t.completed_at) : ''}`,
    };
    const actions = el('div', { class: 'th-actions' });
    if(t.status !== 'done'){
      if(t.status !== 'accepted' && (isMine || !t.assignee_id || canManage())) actions.append(el('button', { type: 'button', class: 'th-btn th-btn-primary th-btn-sm', onClick: () => actTask('accept', {}, t.assignee_id ? 'Accepted' : 'You picked it up') }, t.status === 'blocked' ? 'Unblock' : (t.assignee_id ? 'Accept' : 'Pick it up')));
      if(t.status !== 'blocked') actions.append(el('button', { type: 'button', class: 'th-btn th-btn-sm', onClick: () => { const reason = prompt('What is blocking this task?'); if(reason && reason.trim()) actTask('block', { reason: reason.trim() }, 'Marked blocked'); } }, svg('block'), ' Blocked…'));
      actions.append(el('button', { type: 'button', class: 'th-btn th-btn-sm th-btn-ok', onClick: () => actTask('complete', {}, 'Done') }, svg('check'), ' Complete'));
    } else {
      actions.append(el('button', { type: 'button', class: 'th-btn th-btn-sm', onClick: () => actTask('reopen', {}, 'Reopened') }, 'Reopen'));
    }
    if(canManage() || (S.me && t.created_by === S.me.id)) actions.append(el('button', { type: 'button', class: 'th-btn th-btn-sm th-btn-danger', onClick: async () => { if(!confirm('Delete this task? This cannot be undone.')) return; const r = await guard(() => api(`/tasks/${t.id}`, { method: 'DELETE' }), 'Deleted'); if(r !== undefined){ closeDrawer(); await refreshAll(); } } }, 'Delete'));

    const desc = el('textarea', { class: 'th-textarea', placeholder: 'Details, links, or the why.', 'aria-label': 'Description' }, t.description);
    desc.addEventListener('blur', () => { if(desc.value !== t.description) patchTask({ description: desc.value }, 'Description saved'); });

    const labelInput = el('input', { placeholder: 'Add label', 'aria-label': 'Add label' });
    labelInput.addEventListener('keydown', e => { if(e.key === 'Enter' && labelInput.value.trim()){ e.preventDefault(); patchTask({ labels: [...t.labels, labelInput.value.trim()] }, 'Label added'); } });
    const labels = el('div', { class: 'th-labels-edit' }, ...t.labels.map(l => el('span', { class: 'th-pill th-pill-label' }, l, el('button', { type: 'button', class: 'th-x', 'aria-label': `Remove ${l}`, onClick: () => patchTask({ labels: t.labels.filter(x => x !== l) }, 'Label removed') }, '×'))), labelInput);

    const doneCount = t.checklist.filter(i => i.done).length;
    const ckInput = el('input', { placeholder: 'Add a step', 'aria-label': 'Add checklist item' });
    const addCk = () => { const v = ckInput.value.trim(); if(v) patchTask({ checklist: [...t.checklist, { text: v }] }, 'Step added'); };
    ckInput.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); addCk(); } });
    const checklist = el('div', {},
      el('h4', { class: 'th-h' }, 'Checklist', t.checklist.length ? el('span', { class: `th-pill${doneCount === t.checklist.length ? ' is-ok' : ''}` }, `${doneCount}/${t.checklist.length}`) : null),
      t.checklist.length ? el('div', { class: 'th-progress' }, el('i', { style: `width:${Math.round(100 * doneCount / t.checklist.length)}%` })) : null,
      el('ul', { class: 'th-checklist' }, ...t.checklist.map(i => el('li', { class: i.done ? 'is-done' : '' },
        el('button', { type: 'button', class: `th-check${i.done ? ' is-done' : ''}`, html: i.done ? ICON.check : '', 'aria-label': i.done ? 'Undo' : 'Done', onClick: () => patchTask({ checklist: t.checklist.map(x => x.id === i.id ? Object.assign({}, x, { done: !x.done }) : x) }) }),
        el('span', {}, i.text),
        el('button', { type: 'button', class: 'th-x', 'aria-label': 'Remove step', onClick: () => patchTask({ checklist: t.checklist.filter(x => x.id !== i.id) }) }, '×'),
      ))),
      el('div', { class: 'th-checklist-add' }, ckInput, el('button', { type: 'button', class: 'th-btn th-btn-sm', onClick: addCk }, 'Add')),
    );

    const commentBox = el('textarea', { class: 'th-textarea', placeholder: S.me ? `Comment as ${S.me.name}` : 'Sign in to comment', 'aria-label': 'Comment' });
    const sendComment = async () => { const v = commentBox.value.trim(); if(!v) return; const r = await guard(() => api(`/tasks/${t.id}/comments`, { method: 'POST', body: { body: v } })); if(r){ commentBox.value = ''; await refreshAll(); } };
    commentBox.addEventListener('keydown', e => { if(e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendComment(); });
    const comments = el('div', {},
      el('h4', { class: 'th-h' }, 'Comments', el('span', { class: 'th-pill' }, t.comments.length)),
      el('div', { class: 'th-comments' }, ...t.comments.map(c => el('div', { class: 'th-comment' }, avatar(c.author_id, 28), el('div', { class: 'th-comment-body' }, el('div', { class: 'th-comment-meta' }, el('b', {}, nameOf(c.author_id)), ` · ${timeAgo(c.created_at)}`), el('div', { class: 'th-comment-text' }, c.body))))),
      el('div', { class: 'th-comment-form' }, commentBox, el('button', { type: 'button', class: 'th-btn th-btn-primary th-btn-sm', onClick: sendComment }, 'Send')),
    );
    const activity = el('details', { class: 'th-activity-wrap' }, el('summary', { class: 'th-h' }, `Activity (${t.activity.length})`),
      el('ul', { class: 'th-activity' }, ...t.activity.slice().reverse().map(a => el('li', {}, el('b', {}, shortName(a.actor_id)), ' ', describeActivity(a), el('span', { class: 'th-dim' }, ` · ${timeAgo(a.created_at)}`)))));

    d.replaceChildren(
      el('header', { class: 'th-drawer-head' },
        el('span', { class: 'th-crumb' }, board ? board.name : '', ' › ', (columns.find(c => c.id === t.column_id) || {}).name || ''),
        el('span', { class: 'th-dim' }, `by ${shortName(t.created_by)} · ${timeAgo(t.created_at)}`),
        el('button', { type: 'button', class: 'th-x-btn', 'aria-label': 'Close', html: ICON.close, onClick: closeDrawer }),
      ),
      el('div', { class: 'th-drawer-body' },
        titleInput,
        el('div', { class: 'th-status-banner', dataset: { status: t.status } }, statusPill(t) || el('span', { class: 'th-pill' }, 'Open'), el('span', {}, bannerText[t.status])),
        actions, props,
        el('div', {}, el('h4', { class: 'th-h' }, 'Details'), desc),
        el('div', {}, el('h4', { class: 'th-h' }, 'Labels'), labels),
        checklist, comments, activity,
      ),
    );
  }
  function describeActivity(a){
    const d = a.detail || {};
    switch(a.kind){
      case 'created': return 'created this task';
      case 'assigned': return d.to ? `assigned it to ${shortName(d.to)}` : 'unassigned it';
      case 'unassigned': return 'unassigned it';
      case 'accepted': return 'accepted it';
      case 'blocked': return `marked it blocked: ${d.reason || ''}`;
      case 'unblocked': return 'unblocked it';
      case 'completed': return 'completed it';
      case 'reopened': return 'reopened it';
      case 'moved': return `moved it to ${d.to_name || 'another column'}`;
      case 'commented': return 'commented';
      case 'retitled': return `renamed it from “${d.from}”`;
      case 'described': return 'edited the details';
      case 'due_changed': return d.to ? `set the due date to ${fmtDue(d.to)}` : 'cleared the due date';
      case 'priority_changed': return `set priority to ${PRIORITY_LABEL[d.to] || d.to}`;
      case 'labels_changed': return `changed labels to ${(d.to || []).join(', ') || 'none'}`;
      case 'checklist_changed': return `updated the checklist (${d.done}/${d.total})`;
      default: return a.kind;
    }
  }

  // ---------- notifications ----------
  function toggleNotifs(force){
    const p = $('.th-popover', S.layer);
    const show = force !== undefined ? force : p.hidden;
    p.hidden = !show;
    if(!show) return;
    const bell = $('.th-bell', S.root).getBoundingClientRect();
    p.style.top = (bell.bottom + 6) + 'px';
    p.style.right = Math.max(8, window.innerWidth - bell.right) + 'px';
    p.replaceChildren(
      el('div', { class: 'th-popover-head' }, el('h3', {}, 'Notifications'), S.notifs.some(n => !n.read_at) ? el('button', { type: 'button', class: 'th-link', onClick: async () => { await guard(() => api('/notifications/read', { method: 'POST', body: {} })); await loadNotifs(); toggleNotifs(true); } }, 'Mark all read') : null),
      ...(S.notifs.length ? S.notifs.slice(0, 60).map(n => el('div', { class: `th-notif ${n.read_at ? 'is-read' : 'is-unread'}`, role: 'button', tabindex: 0, onClick: async () => {
        if(!n.read_at){ await guard(() => api('/notifications/read', { method: 'POST', body: { ids: [n.id] } })); loadNotifs(); }
        toggleNotifs(false); if(n.task_id) openTask(n.task_id);
      } }, el('span', { class: 'th-notif-dot' }), el('div', {}, el('div', {}, n.message), el('div', { class: 'th-dim' }, timeAgo(n.created_at))))) : [empty(S.me ? 'Nothing yet.' : 'Sign in to see your notifications.')]),
    );
  }

  // ---------- sheets (new task, new board, board settings) ----------
  function openModal(title, bodyNodes, footNodes){
    const m = $('.th-modal', S.layer); m.hidden = false; showScrim(true);
    m.replaceChildren(el('div', { class: 'th-modal-card', role: 'dialog', 'aria-modal': 'true' },
      el('div', { class: 'th-modal-head' }, el('h3', {}, title), el('button', { type: 'button', class: 'th-x-btn', 'aria-label': 'Close', html: ICON.close, onClick: closeModal })),
      el('div', { class: 'th-modal-body' }, ...bodyNodes),
      el('div', { class: 'th-modal-foot' }, ...footNodes),
    ));
    const first = m.querySelector('input, select, textarea'); if(first) first.focus();
  }
  function closeModal(){ $('.th-modal', S.layer).hidden = true; if($('.th-drawer', S.layer).hidden) showScrim(false); }

  function openTaskModal(preset){
    preset = preset || {};
    if(S.host && !S.me) return needSignIn();
    if(!S.boards.length) return openBoardModal();
    const boardId = preset.board_id || S.boardId || S.boards[0].id;
    const title = el('input', { type: 'text', placeholder: 'What needs doing?', required: true });
    const boardSel = el('select', {}, ...S.boards.map(b => el('option', { value: b.id, selected: b.id === boardId }, b.name)));
    const colSel = el('select', {});
    const fillCols = () => { const b = S.boards.find(x => x.id === boardSel.value); colSel.replaceChildren(...b.columns.map(c => el('option', { value: c.id, selected: c.id === preset.column_id }, c.name))); };
    fillCols(); boardSel.addEventListener('change', fillCols);
    const who = el('select', {}, el('option', { value: '' }, 'Unassigned'), ...S.members.filter(m => m.active !== false).map(m => el('option', { value: m.id, selected: m.id === preset.assignee_id }, m.name)));
    const due = el('input', { type: 'date' });
    const prio = el('select', {}, ...Object.entries(PRIORITY_LABEL).map(([v, l]) => el('option', { value: v, selected: v === 'normal' }, l)));
    const labels = el('input', { type: 'text', placeholder: 'comma, separated' });
    const desc = el('textarea', { rows: 3, placeholder: 'Details (optional)' });
    const submit = async () => {
      if(!title.value.trim()){ title.focus(); return toast('Give the task a title', true); }
      const r = await guard(() => api('/tasks', { method: 'POST', body: { title: title.value, board_id: boardSel.value, column_id: colSel.value, assignee_id: who.value || null, due_at: due.value || null, priority: prio.value, labels: labels.value, description: desc.value } }), who.value ? `Assigned to ${shortName(who.value)}` : 'Task created');
      if(r){ closeModal(); if(boardSel.value !== S.boardId){ S.boardId = boardSel.value; LS.set('board', S.boardId); fillHeader(); } await refreshAll(); }
    };
    title.addEventListener('keydown', e => { if(e.key === 'Enter') submit(); });
    openModal('New task', [
      el('label', {}, 'Title', title),
      el('div', { class: 'th-two' }, el('label', {}, 'Board', boardSel), el('label', {}, 'Column', colSel)),
      el('div', { class: 'th-two' }, el('label', {}, 'Who', who), el('label', {}, 'Due', due)),
      el('div', { class: 'th-two' }, el('label', {}, 'Priority', prio), el('label', {}, 'Labels', labels)),
      el('label', {}, 'Details', desc),
    ], [el('button', { type: 'button', class: 'th-btn', onClick: closeModal }, 'Cancel'), el('button', { type: 'button', class: 'th-btn th-btn-primary', onClick: submit }, 'Create')]);
  }

  function columnRows(list, columns){
    const KINDS = [['todo', 'To do'], ['doing', 'In progress'], ['done', 'Done']];
    const row = c => el('div', { class: 'th-col-row', dataset: { id: c.id || '' } },
      el('input', { type: 'text', value: c.name, placeholder: 'Column name' }),
      el('select', {}, ...KINDS.map(([v, l]) => el('option', { value: v, selected: v === c.kind }, l))),
      el('button', { type: 'button', class: 'th-x-btn', 'aria-label': 'Move up', title: 'Move up', onClick: e => { const r = e.currentTarget.closest('.th-col-row'); if(r.previousElementSibling) r.previousElementSibling.before(r); } }, '↑'),
      el('button', { type: 'button', class: 'th-x-btn', 'aria-label': 'Move down', title: 'Move down', onClick: e => { const r = e.currentTarget.closest('.th-col-row'); if(r.nextElementSibling) r.nextElementSibling.after(r); } }, '↓'),
      el('button', { type: 'button', class: 'th-x-btn', 'aria-label': 'Remove column', title: 'Remove', html: ICON.close, onClick: e => e.currentTarget.closest('.th-col-row').remove() }),
    );
    list.replaceChildren(...columns.map(row));
    return () => list.append(row({ name: '', kind: 'todo' }));
  }
  const readColumnRows = list => $$('.th-col-row', list).map(r => ({ id: r.dataset.id || undefined, name: $('input', r).value.trim(), kind: $('select', r).value })).filter(c => c.name);

  function openBoardModal(){
    if(S.host && !S.me) return needSignIn();
    const name = el('input', { type: 'text', placeholder: 'Board name' });
    const desc = el('input', { type: 'text', placeholder: 'What goes on this board? (optional)' });
    const list = el('div', { class: 'th-col-list' });
    const addRow = columnRows(list, [{ name: 'To Do', kind: 'todo' }, { name: 'In Progress', kind: 'doing' }, { name: 'Done', kind: 'done' }]);
    const submit = async () => {
      if(!name.value.trim()){ name.focus(); return toast('Name the board', true); }
      const b = await guard(() => api('/boards', { method: 'POST', body: { name: name.value, description: desc.value, columns: readColumnRows(list) } }), 'Board created');
      if(b){ closeModal(); S.boards.push(b); S.boardId = b.id; LS.set('board', b.id); fillHeader(); await refreshAll(); }
    };
    openModal('New board', [el('label', {}, 'Name', name), el('label', {}, 'Description', desc), el('label', {}, 'Columns', list), el('button', { type: 'button', class: 'th-link th-start', onClick: addRow }, '+ Add column')],
      [el('button', { type: 'button', class: 'th-btn', onClick: closeModal }, 'Cancel'), el('button', { type: 'button', class: 'th-btn th-btn-primary', onClick: submit }, 'Create board')]);
  }

  function openBoardSettings(){
    const b = S.board; if(!b) return openBoardModal();
    if(S.host && !S.me) return needSignIn();
    const name = el('input', { type: 'text', value: b.name });
    const desc = el('input', { type: 'text', value: b.description });
    const list = el('div', { class: 'th-col-list' });
    const addRow = columnRows(list, b.columns);
    const submit = async () => {
      const rows = readColumnRows(list);
      if(!rows.length) return toast('Keep at least one column', true);
      const ok = await guard(async () => {
        if(name.value.trim() !== b.name || desc.value !== b.description) await api(`/boards/${b.id}`, { method: 'PATCH', body: { name: name.value, description: desc.value } });
        const keep = new Set(rows.filter(r => r.id).map(r => r.id));
        const survivor = rows.find(r => r.id);
        for(const c of b.columns) if(!keep.has(c.id)) await api(`/boards/${b.id}/columns/${c.id}`, { method: 'DELETE', body: { move_to: survivor ? survivor.id : undefined } });
        for(const r of rows){
          if(!r.id){ const fresh = await api(`/boards/${b.id}/columns`, { method: 'POST', body: { name: r.name, kind: r.kind } }); r.id = fresh.columns[fresh.columns.length - 1].id; continue; }
          const prev = b.columns.find(c => c.id === r.id);
          if(prev && (prev.name !== r.name || prev.kind !== r.kind)) await api(`/boards/${b.id}/columns/${r.id}`, { method: 'PATCH', body: { name: r.name, kind: r.kind } });
        }
        for(const [i, r] of rows.entries()) await api(`/boards/${b.id}/columns/${r.id}`, { method: 'PATCH', body: { order: i } });
        return true;
      }, 'Board saved');
      if(!ok) return;
      closeModal();
      S.boards = await api('/boards'); fillHeader(); await refreshAll();
    };
    const archive = async () => {
      if(!confirm(`Archive “${b.name}”? Its tasks stay saved but the board leaves the list.`)) return;
      const r = await guard(() => api(`/boards/${b.id}`, { method: 'PATCH', body: { archived: true } }), 'Board archived');
      if(r === undefined) return;
      closeModal(); S.boards = await api('/boards'); S.boardId = (S.boards[0] || {}).id || null; LS.set('board', S.boardId || ''); fillHeader(); await refreshAll();
    };
    openModal('Board settings', [el('label', {}, 'Name', name), el('label', {}, 'Description', desc), el('label', {}, 'Columns', list), el('button', { type: 'button', class: 'th-link th-start', onClick: addRow }, '+ Add column')],
      [el('button', { type: 'button', class: 'th-btn th-btn-danger th-left', onClick: archive }, 'Archive board'), el('button', { type: 'button', class: 'th-btn', onClick: closeModal }, 'Cancel'), el('button', { type: 'button', class: 'th-btn th-btn-primary', onClick: submit }, 'Save')]);
  }

  // ---------- drag and drop: a mouse drags at once, a finger after a hold
  // (about a third of a second, as on Set Ups); a quick swipe still scrolls.
  let dragging = false;
  let drag = null;
  function onPointerDown(e){
    const cardEl = e.target.closest('.th-card');
    if(!cardEl || !S.root.contains(cardEl) || e.button > 0 || e.target.closest('button, a, input')) return;
    drag = { id: cardEl.dataset.task, el: cardEl, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, pointerId: e.pointerId, holdTimer: null, started: false, touch: e.pointerType === 'touch' };
    if(drag.touch) drag.holdTimer = setTimeout(() => { if(drag && !drag.started) startDrag(); }, 350);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', cancelDrag);
  }
  function startDrag(){
    drag.started = true; dragging = true;
    const r = drag.el.getBoundingClientRect();
    drag.offX = drag.x - r.left; drag.offY = drag.y - r.top;
    drag.ghost = drag.el.cloneNode(true); drag.ghost.classList.add('th-ghost'); drag.ghost.style.width = r.width + 'px';
    S.layer.append(drag.ghost);
    drag.placeholder = el('div', { class: 'th-placeholder' }); drag.placeholder.style.height = r.height + 'px';
    drag.el.after(drag.placeholder); drag.el.classList.add('is-dragging'); drag.el.style.display = 'none';
    positionGhost();
    document.body.style.userSelect = 'none';
    if(navigator.vibrate) navigator.vibrate(10);
  }
  function positionGhost(){ drag.ghost.style.left = (drag.x - drag.offX) + 'px'; drag.ghost.style.top = (drag.y - drag.offY) + 'px'; }
  function onPointerMove(e){
    if(!drag || e.pointerId !== drag.pointerId) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if(!drag.started){
      const dist = Math.hypot(drag.x - drag.startX, drag.y - drag.startY);
      if(drag.touch){ if(dist > 8){ clearTimeout(drag.holdTimer); cancelDrag(); } return; }
      if(dist > 6) startDrag(); else return;
    }
    positionGhost();
    const under = document.elementFromPoint(drag.x, drag.y);
    const body = under && under.closest('.th-col-body');
    $$('.th-col.is-over', S.root).forEach(c => c.classList.remove('is-over'));
    if(!body) return;
    body.closest('.th-col').classList.add('is-over');
    const cards = $$('.th-card', body).filter(c => c !== drag.el);
    let placed = false;
    for(const c of cards){
      const r = c.getBoundingClientRect();
      if(drag.y < r.top + r.height / 2){ body.insertBefore(drag.placeholder, c); placed = true; break; }
    }
    if(!placed) body.append(drag.placeholder);
    const boardEl = $('.th-board', S.root);
    if(boardEl){ const br = boardEl.getBoundingClientRect(); if(drag.x > br.right - 40) boardEl.scrollLeft += 12; else if(drag.x < br.left + 40) boardEl.scrollLeft -= 12; }
    if(drag.y > window.innerHeight - 50) window.scrollBy(0, 10); else if(drag.y < 60) window.scrollBy(0, -10);
  }
  async function onPointerUp(e){
    if(!drag || e.pointerId !== drag.pointerId) return;
    const d = drag; cleanupDragListeners();
    if(!d.started){ drag = null; openTask(d.id); return; }
    const body = d.placeholder.parentElement;
    const columnId = body && body.dataset.column;
    const sib = s => s && s.classList.contains('th-card') ? s.dataset.task : null;
    const next = sib(d.placeholder.nextElementSibling), prev = sib(d.placeholder.previousElementSibling);
    teardownDrag();
    if(!columnId) return;
    const t = S.tasks.find(x => x.id === d.id);
    if(t){   // show it where it landed before the server answers
      const sibs = S.tasks.filter(x => x.column_id === columnId && x.id !== d.id).sort((a, b) => a.position - b.position);
      const nextT = sibs.find(x => x.id === next), prevT = sibs.find(x => x.id === prev);
      t.column_id = columnId;
      t.position = nextT && prevT ? (nextT.position + prevT.position) / 2 : nextT ? nextT.position - 1 : prevT ? prevT.position + 1 : 1;
      const col = S.board.columns.find(c => c.id === columnId);
      if(col && col.kind === 'done') t.status = 'done'; else if(col && t.status === 'done') t.status = 'open';
      render();
    }
    const r = await guard(() => api(`/tasks/${d.id}/move`, { method: 'POST', body: { column_id: columnId, before_id: next, after_id: prev } }));
    if(r === undefined) await refreshAll(); else { Object.assign(t || {}, r); await Promise.all([loadMine(), loadNotifs()]); render(); }
  }
  function cancelDrag(){ if(!drag) return; cleanupDragListeners(); if(drag.started) teardownDrag(); drag = null; }
  function cleanupDragListeners(){
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', cancelDrag);
    if(drag) clearTimeout(drag.holdTimer);
  }
  function teardownDrag(){
    if(drag.ghost) drag.ghost.remove();
    if(drag.placeholder) drag.placeholder.remove();
    drag.el.classList.remove('is-dragging'); drag.el.style.display = '';
    $$('.th-col.is-over', S.root).forEach(c => c.classList.remove('is-over'));
    document.body.style.userSelect = '';
    dragging = false; drag = null;
  }

  // ---------- wiring ----------
  function wire(){
    const root = S.root;
    $$('.th-seg-btn', root).forEach(b => b.addEventListener('click', async () => { S.view = b.dataset.view; LS.set('view', S.view); if(S.view === 'mine') await loadMine().catch(() => {}); render(); }));
    $('.th-board-select', root).addEventListener('change', async e => {
      if(e.target.value === '__new'){ e.target.value = S.boardId || ''; return openBoardModal(); }
      S.boardId = e.target.value; LS.set('board', S.boardId); if(S.view === 'mine') S.view = 'board'; await loadBoard(); render();
    });
    $('.th-me-select', root).addEventListener('change', async e => { S.me = member(e.target.value); LS.set('me', S.me.id); toast(`You are now ${S.me.name}`); fillHeader(); await refreshAll(); });
    $('.th-new', root).addEventListener('click', () => openTaskModal());
    $('.th-settings', root).addEventListener('click', openBoardSettings);
    $('.th-bell', root).addEventListener('click', async () => { if(S.me) await loadNotifs().catch(() => {}); toggleNotifs(); });
    let searchTimer;
    $('.th-search-input', root).addEventListener('input', e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { S.search = e.target.value; if(S.view === 'mine'){ S.view = 'board'; } render(); }, 120); });
    for(const [cls, key] of [['th-f-assignee', 'assignee'], ['th-f-status', 'status'], ['th-f-priority', 'priority'], ['th-f-label', 'label']]){
      $('.' + cls, root).addEventListener('change', e => { S.filters[key] = e.target.value; render(); });
    }
    $('.th-clear', root).addEventListener('click', () => { S.filters = { assignee: '', status: '', priority: '', label: '' }; S.search = ''; $('.th-search-input', root).value = ''; $$('.th-filters select', root).forEach(s => { s.value = ''; }); render(); });
    $('.th-scrim', S.layer).addEventListener('click', () => { if(!$('.th-modal', S.layer).hidden) closeModal(); else closeDrawer(); });
    document.addEventListener('click', e => { const p = $('.th-popover', S.layer); if(p && !p.hidden && !e.target.closest('.th-popover, .th-bell')) toggleNotifs(false); });
    document.addEventListener('keydown', e => {
      if(e.key === 'Escape'){ if(!$('.th-modal', S.layer).hidden) closeModal(); else if(!$('.th-popover', S.layer).hidden) toggleNotifs(false); else if(S.openTaskId) closeDrawer(); }
    });
    document.addEventListener('touchmove', e => { if(dragging) e.preventDefault(); }, { passive: false });
    root.addEventListener('pointerdown', onPointerDown);
    const m = location.hash.match(/task=([\w-]+)/); if(m) openTask(m[1]);
  }

  // ---------- public ----------
  async function mount(root, opts){
    opts = opts || {};
    if(S.mounted){ refreshAll().catch(() => {}); return; }
    S.root = root;
    S.api = opts.api || root.dataset.taskhubApi || '/taskhub/api';
    S.host = opts.host !== undefined ? !!opts.host : !!$('.tabs');   // inside the hub's page
    buildShell();
    try {
      await bootstrap();
      S.mounted = true;
      fillHeader();
      wire();
      await Promise.all([loadBoard(), loadMine().catch(() => {}), loadNotifs().catch(() => {})]);
      render();
      startPolling();
    } catch(e){
      $('.th-view', root).replaceChildren(empty('Tasks couldn’t load: ', e.message, ' ', el('button', { type: 'button', class: 'th-link', onClick: () => { S.mounted = false; mount(root, opts); } }, 'Try again')));
    }
  }
  // The hub: the Tasks tab opened (navigation.js activateView).
  function activate(){
    const root = document.getElementById('tasksView');
    if(!root) return;
    if(!S.mounted) mount(root, { host: true }); else refreshAll().catch(() => {});
  }
  // The hub, on load: the count on the Tasks tab (overdue + due today) for
  // whoever is signed in, without opening the tab.
  async function tabBadge(){
    const badge = document.getElementById('tasksTabBadge');
    if(!badge || S.mounted) return;
    try {
      const boot = await api('/bootstrap');
      if(!boot.me) return;
      const mine = await api(`/my-tasks?today=${todayISO()}`);
      const due = mine.assigned.overdue.length + mine.assigned.today.length;
      badge.hidden = !due; badge.textContent = due;
    } catch(e){ /* not signed in, or offline: no badge */ }
  }

  window.TaskHub = { mount, activate, tabBadge, state: S };
  window.thActivate = activate;
  if(document.getElementById('tasksTabBadge')){
    const later = typeof window.afterIdle === 'function' ? window.afterIdle : fn => setTimeout(fn, 1500);
    later(tabBadge);
  }
})();
