/* TaskHub front end. Vanilla JS, no build step.
   State lives in S; every change goes through the API and then re-renders.
   The DOM is built with el() so user text is never injected as HTML. */
(() => {
  'use strict';

  const API = document.body.dataset.api || '/taskhub/api';
  const POLL_MS = 15000;
  const LS = {
    get: (k, d) => { try { return localStorage.getItem('taskhub.' + k) ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem('taskhub.' + k, v); } catch {} },
  };

  const S = {
    me: null, members: [], boards: [], boardId: null, board: null, tasks: [],
    view: LS.get('view', 'board'), search: '',
    filters: { assignee: '', status: '', priority: '', label: '' },
    openTaskId: null, openTask: null, notifs: [], unread: 0, mine: null,
    sort: { key: 'due_at', desc: false }, pollTimer: null,
  };

  // ---------- tiny DOM helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') node.innerHTML = v; // only used with trusted static SVG strings
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
  }
  const ICON = {
    check: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
    clock: '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    block: '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="m6 6 12 12" stroke="currentColor" stroke-width="2"/></svg>',
    comment: '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    list: '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="m4 6 1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  const svg = name => el('span', { class: 'th-ico', html: ICON[name] });

  // ---------- API ----------
  async function api(path, { method = 'GET', body } = {}) {
    const headers = { 'Accept': 'application/json' };
    if (S.me) headers['X-Taskhub-Member'] = S.me.id;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(data.error || res.statusText); err.status = res.status; throw err; }
    return data;
  }

  // ---------- formatting ----------
  const todayISO = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); };
  function dueBucket(due) {
    if (!due) return 'none';
    const d = due.slice(0, 10), t = todayISO();
    if (d < t) return 'overdue';
    if (d === t) return 'today';
    const week = new Date(); week.setDate(week.getDate() + 7);
    return d <= week.toISOString().slice(0, 10) ? 'week' : 'later';
  }
  function fmtDue(due) {
    if (!due) return '';
    const b = dueBucket(due);
    if (b === 'today') return 'Today';
    const d = new Date(due.slice(0, 10) + 'T12:00:00');
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }
  function timeAgo(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  const member = id => S.members.find(m => m.id === id) || null;
  const nameOf = id => (member(id) || {}).name || (id ? 'Former member' : 'Unassigned');
  const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  const AVATAR_COLORS = ['#1f6feb', '#8250df', '#bf3989', '#cf222e', '#bc4c00', '#4d7c0f', '#0f766e', '#0e7490', '#1d4ed8', '#6e5494'];
  function avatar(id, size) {
    const m = member(id);
    if (!m) return el('span', { class: 'th-avatar is-empty', title: 'Unassigned' }, '?');
    let h = 0; for (const ch of m.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const a = el('span', { class: 'th-avatar', title: m.name, style: `background:${AVATAR_COLORS[h % AVATAR_COLORS.length]}` }, initials(m.name));
    if (size) a.style.cssText += `;width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
    return a;
  }
  const STATUS_LABEL = { open: 'Open', accepted: 'Accepted', blocked: 'Blocked', done: 'Done' };
  const PRIORITY_LABEL = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' };
  const columnOf = (task) => (S.board && S.board.columns.find(c => c.id === task.column_id)) || null;

  function duePill(task) {
    if (!task.due_at) return null;
    const b = dueBucket(task.due_at);
    return el('span', { class: `th-pill th-pill-due is-${b}` }, svg('clock'), fmtDue(task.due_at));
  }
  function statusPill(task) {
    if (task.status === 'open') return null;
    return el('span', { class: 'th-pill th-pill-status', dataset: { status: task.status } }, task.status === 'blocked' ? svg('block') : null, STATUS_LABEL[task.status]);
  }
  function checklistPill(task) {
    if (!task.checklist.length) return null;
    const done = task.checklist.filter(i => i.done).length;
    return el('span', { class: 'th-pill' }, svg('list'), `${done}/${task.checklist.length}`);
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, isError = false) {
    const t = $('#toast'); t.textContent = msg; t.classList.toggle('is-error', isError); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 4500 : 2500);
  }
  async function guard(fn, okMsg) {
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (e) {
      if (e.status === 409) { toast('Someone changed this task first. Reloaded it.', true); await refreshAll(); }
      else toast(e.message || 'Something went wrong', true);
      return undefined;
    }
  }

  // ---------- loading ----------
  async function bootstrap() {
    const data = await api('/bootstrap' + (LS.get('me') ? `?me=${encodeURIComponent(LS.get('me'))}` : ''));
    S.members = data.members; S.boards = data.boards;
    S.me = data.me || S.members[0] || null;
    if (S.me) LS.set('me', S.me.id);
    S.unread = data.unread;
    const saved = LS.get('board');
    S.boardId = S.boards.some(b => b.id === saved) ? saved : (S.boards[0] || {}).id || null;
    fillHeader();
  }
  async function loadBoard() {
    if (!S.boardId) { S.board = null; S.tasks = []; return; }
    const b = await api(`/boards/${S.boardId}`);
    S.board = b; S.tasks = b.tasks; delete b.tasks;
    fillLabelFilter();
  }
  async function loadMine() {
    if (!S.me) { S.mine = null; return; }
    S.mine = await api('/my-tasks');
    const due = S.mine.assigned.overdue.length + S.mine.assigned.today.length;
    const badge = $('#mineCount'); badge.hidden = !due; badge.textContent = due;
  }
  async function loadNotifs() {
    if (!S.me) return;
    const data = await api('/notifications');
    S.notifs = data.items; S.unread = data.unread;
    const b = $('#bellBadge'); b.hidden = !S.unread; b.textContent = S.unread > 99 ? '99+' : S.unread;
  }
  async function loadOpenTask() {
    if (!S.openTaskId) return;
    try { S.openTask = await api(`/tasks/${S.openTaskId}`); }
    catch (e) { if (e.status === 404) { closeDrawer(); toast('That task was deleted'); } }
  }
  async function refreshAll() {
    await Promise.all([loadBoard(), loadMine(), loadNotifs(), loadOpenTask()]);
    render();
  }
  function startPolling() {
    clearInterval(S.pollTimer);
    S.pollTimer = setInterval(() => { if (!document.hidden && !dragging) refreshAll().catch(() => {}); }, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAll().catch(() => {}); });
  }

  // ---------- header ----------
  function fillHeader() {
    const me = $('#meSelect'); me.replaceChildren(...S.members.map(m => el('option', { value: m.id, selected: S.me && m.id === S.me.id }, m.name)));
    const bs = $('#boardSelect'); bs.replaceChildren(
      ...S.boards.map(b => el('option', { value: b.id, selected: b.id === S.boardId }, b.name)),
      el('option', { value: '__new' }, '+ New board'),
    );
    const fa = $('#fAssignee'); fa.replaceChildren(el('option', { value: '' }, 'Everyone'), el('option', { value: '__none' }, 'Unassigned'), ...S.members.map(m => el('option', { value: m.id }, m.name)));
    fa.value = S.filters.assignee;
    $$('.th-tabs button').forEach(b => b.classList.toggle('is-active', b.dataset.view === S.view));
  }
  function fillLabelFilter() {
    const labels = [...new Set(S.tasks.flatMap(t => t.labels))].sort((a, b) => a.localeCompare(b));
    const fl = $('#fLabel'); fl.replaceChildren(el('option', { value: '' }, 'Any label'), ...labels.map(l => el('option', { value: l }, l)));
    fl.value = labels.includes(S.filters.label) ? S.filters.label : '';
  }
  function activeFilterCount() {
    return Object.values(S.filters).filter(Boolean).length + (S.search ? 1 : 0);
  }
  function visibleTasks() {
    const q = S.search.trim().toLowerCase(), f = S.filters;
    return S.tasks.filter(t => {
      if (f.assignee === '__none' ? t.assignee_id : (f.assignee && t.assignee_id !== f.assignee)) return false;
      if (f.status && t.status !== f.status) return false;
      if (f.priority && t.priority !== f.priority) return false;
      if (f.label && !t.labels.includes(f.label)) return false;
      if (q && !(t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.labels.some(l => l.toLowerCase().includes(q)) || nameOf(t.assignee_id).toLowerCase().includes(q))) return false;
      return true;
    });
  }

  // ---------- render ----------
  function render() {
    $('#clearFilters').hidden = !activeFilterCount();
    $('#filters').hidden = S.view === 'mine';
    $$('.th-tabs button').forEach(b => b.classList.toggle('is-active', b.dataset.view === S.view));
    const view = $('#view');
    if (S.view === 'board') view.replaceChildren(renderBoard());
    else if (S.view === 'list') view.replaceChildren(renderList());
    else view.replaceChildren(renderMine());
    if (S.openTaskId) renderDrawer();
  }

  // -- board
  function renderBoard() {
    if (!S.board) return el('div', { class: 'th-empty' }, 'No boards yet. ', el('button', { class: 'th-link', onClick: () => openBoardModal() }, 'Create one'));
    const tasks = visibleTasks();
    const wrap = el('div', { class: 'th-board' });
    for (const col of S.board.columns) {
      const inCol = tasks.filter(t => t.column_id === col.id).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
      const body = el('div', { class: 'th-col-body', dataset: { column: col.id } }, ...inCol.map(card));
      wrap.append(el('section', { class: 'th-col', dataset: { column: col.id } },
        el('header', { class: 'th-col-head' }, el('span', { class: 'th-col-kind', dataset: { kind: col.kind } }), col.name, el('span', { class: 'th-pill' }, inCol.length)),
        body,
        el('footer', { class: 'th-col-foot' }, el('button', { class: 'th-btn th-btn-sm', onClick: () => openTaskModal({ column_id: col.id }) }, svg('plus'), ' Add task')),
      ));
    }
    return wrap;
  }
  function card(t) {
    const c = el('article', { class: `th-card${t.status === 'done' ? ' is-done' : ''}`, dataset: { task: t.id, priority: t.priority }, tabindex: 0, role: 'button' },
      el('h3', { class: 'th-card-title' }, t.title),
      el('div', { class: 'th-card-meta' },
        t.priority === 'urgent' || t.priority === 'high' ? el('span', { class: 'th-pill th-pill-prio', dataset: { priority: t.priority } }, PRIORITY_LABEL[t.priority]) : null,
        statusPill(t), duePill(t), checklistPill(t),
        ...t.labels.slice(0, 3).map(l => el('span', { class: 'th-pill th-pill-label' }, l)),
        avatar(t.assignee_id),
      ),
    );
    c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(t.id); } });
    return c;
  }

  // -- list
  function renderList() {
    if (!S.board) return el('div', { class: 'th-empty' }, 'No board selected.');
    const cols = [['title', 'Task'], ['status', 'Status'], ['assignee_id', 'Who'], ['column_id', 'Column'], ['due_at', 'Due'], ['priority', 'Priority'], ['labels', 'Labels']];
    const pr = { urgent: 0, high: 1, normal: 2, low: 3 };
    const key = S.sort.key;
    const val = t => key === 'assignee_id' ? nameOf(t.assignee_id) : key === 'column_id' ? (columnOf(t) || {}).name || '' : key === 'priority' ? pr[t.priority] : key === 'labels' ? t.labels.join(',') : (t[key] ?? '￿');
    const rows = visibleTasks().sort((a, b) => { const x = val(a), y = val(b); const r = x < y ? -1 : x > y ? 1 : 0; return S.sort.desc ? -r : r; });
    const table = el('table', { class: 'th-table' },
      el('thead', {}, el('tr', {}, ...cols.map(([k, label]) => el('th', {
        class: `${k === key ? 'is-sorted' : ''}${S.sort.desc && k === key ? ' is-desc' : ''}`,
        onClick: () => { S.sort = { key: k, desc: k === key ? !S.sort.desc : false }; render(); },
      }, label)))),
      el('tbody', {}, ...rows.map(t => el('tr', { class: `th-row${t.status === 'done' ? ' is-done' : ''}`, onClick: () => openTask(t.id) },
        el('td', { class: 'th-title' }, t.title),
        el('td', {}, statusPill(t) || el('span', { class: 'th-pill' }, 'Open')),
        el('td', {}, el('span', { style: 'display:flex;align-items:center;gap:6px' }, avatar(t.assignee_id), nameOf(t.assignee_id))),
        el('td', {}, (columnOf(t) || {}).name || ''),
        el('td', {}, duePill(t) || el('span', { class: 'th-pill', style: 'opacity:.5' }, 'No date')),
        el('td', {}, el('span', { class: 'th-pill th-pill-prio', dataset: { priority: t.priority } }, PRIORITY_LABEL[t.priority])),
        el('td', {}, el('span', { class: 'th-labels' }, ...t.labels.map(l => el('span', { class: 'th-pill th-pill-label' }, l)))),
      ))),
    );
    if (!rows.length) return el('div', { class: 'th-list' }, el('div', { class: 'th-empty' }, activeFilterCount() ? 'Nothing matches these filters.' : 'No tasks on this board yet.'));
    return el('div', { class: 'th-list' }, table);
  }

  // -- my tasks
  function renderMine() {
    if (!S.me) return el('div', { class: 'th-empty' }, 'Pick who you are in the top bar.');
    if (!S.mine) return el('div', { class: 'th-empty' }, 'Loading…');
    const g = S.mine.assigned;
    const groups = [['overdue', 'Overdue'], ['today', 'Today'], ['week', 'This week'], ['later', 'Later'], ['none', 'No due date'], ['done', 'Done this week']];
    const openCount = g.overdue.length + g.today.length + g.week.length + g.later.length + g.none.length;
    const left = el('section', { class: 'th-section' },
      el('header', { class: 'th-section-head' }, 'Assigned to me', el('span', { class: 'th-pill' }, `${openCount} open`)),
      ...(openCount || g.done.length ? groups.filter(([k]) => g[k].length).flatMap(([k, label]) => [
        el('div', { class: `th-group-title${k === 'overdue' ? ' is-overdue' : ''}` }, label, el('span', { class: 'th-pill' }, g[k].length)),
        ...g[k].map(t => mineRow(t, false)),
      ]) : [el('div', { class: 'th-empty' }, 'Nothing on your plate. Nice.')]),
    );
    const d = S.mine.delegated;
    const right = el('section', { class: 'th-section' },
      el('header', { class: 'th-section-head' }, 'Delegated by me', el('span', { class: 'th-pill' }, `${d.filter(t => t.status !== 'done').length} open`)),
      ...(d.length ? d.map(t => mineRow(t, true)) : [el('div', { class: 'th-empty' }, 'Assign a task to someone and it shows up here.')]),
    );
    return el('div', { class: 'th-mine' }, left, right);
  }
  function mineRow(t, delegated) {
    const board = S.boards.find(b => b.id === t.board_id);
    const sub = [board ? board.name : null, delegated ? nameOf(t.assignee_id) : null, t.status === 'blocked' ? `Blocked: ${t.blocked_reason}` : null].filter(Boolean).join(' · ');
    const check = el('button', { class: `th-check${t.status === 'done' ? ' is-done' : ''}`, title: t.status === 'done' ? 'Reopen' : 'Mark done', html: t.status === 'done' ? ICON.check : '',
      onClick: async e => { e.stopPropagation(); await guard(() => api(`/tasks/${t.id}/${t.status === 'done' ? 'reopen' : 'complete'}`, { method: 'POST' }), t.status === 'done' ? 'Reopened' : 'Done'); await refreshAll(); } });
    return el('div', { class: `th-row-item${t.status === 'done' ? ' is-done' : ''}`, onClick: () => openTask(t.id) },
      check,
      el('span', { class: 'th-row-title' }, t.title, el('span', { class: 'th-row-sub' }, sub)),
      statusPill(t), duePill(t), delegated ? avatar(t.assignee_id) : null,
    );
  }

  // ---------- drawer ----------
  async function openTask(id) {
    S.openTaskId = id; S.openTask = null;
    $('#drawer').hidden = false; $('#scrim').hidden = false;
    $('#drawer').replaceChildren(el('div', { class: 'th-empty' }, 'Loading…'));
    await loadOpenTask(); renderDrawer();
  }
  function closeDrawer() {
    S.openTaskId = null; S.openTask = null;
    $('#drawer').hidden = true; if ($('#modal').hidden) $('#scrim').hidden = true;
  }
  async function patchTask(fields, msg) {
    const t = S.openTask; if (!t) return;
    const updated = await guard(() => api(`/tasks/${t.id}`, { method: 'PATCH', body: { ...fields, version: t.version } }), msg);
    if (updated) { await refreshAll(); }
  }
  async function actTask(action, body, msg) {
    const t = S.openTask; if (!t) return;
    const r = await guard(() => api(`/tasks/${t.id}/${action}`, { method: 'POST', body }), msg);
    if (r !== undefined) await refreshAll();
  }
  function renderDrawer() {
    const t = S.openTask, d = $('#drawer');
    if (!t) return;
    const board = S.boards.find(b => b.id === t.board_id) || S.board;
    const columns = board ? board.columns : [];
    const isMine = S.me && t.assignee_id === S.me.id;
    const canManage = S.me && (S.me.role === 'admin' || S.me.role === 'leader');

    const titleInput = el('input', { class: 'th-title-input', value: t.title, 'aria-label': 'Title' });
    titleInput.addEventListener('keydown', e => { if (e.key === 'Enter') titleInput.blur(); if (e.key === 'Escape') { titleInput.value = t.title; titleInput.blur(); } });
    titleInput.addEventListener('blur', () => { const v = titleInput.value.trim(); if (v && v !== t.title) patchTask({ title: v }, 'Title saved'); else titleInput.value = t.title; });

    const select = (label, value, options, onChange) => {
      const s = el('select', { 'aria-label': label, onChange: e => onChange(e.target.value) }, ...options.map(([v, text]) => el('option', { value: v, selected: v === (value ?? '') }, text)));
      return el('div', { class: 'th-prop' }, el('label', {}, label), s);
    };
    const dueInput = el('input', { type: 'date', value: (t.due_at || '').slice(0, 10), 'aria-label': 'Due date', onChange: e => patchTask({ due_at: e.target.value || null }, e.target.value ? 'Due date set' : 'Due date cleared') });

    const props = el('div', { class: 'th-props' },
      select('Assigned to', t.assignee_id || '', [['', 'Unassigned'], ...S.members.map(m => [m.id, m.name])], v => actTask('assign', { assignee_id: v || null }, v ? `Assigned to ${nameOf(v)}` : 'Unassigned')),
      el('div', { class: 'th-prop' }, el('label', {}, 'Due'), dueInput),
      select('Priority', t.priority, Object.entries(PRIORITY_LABEL), v => patchTask({ priority: v }, 'Priority saved')),
      select('Column', t.column_id, columns.map(c => [c.id, c.name]), async v => { await guard(() => api(`/tasks/${t.id}/move`, { method: 'POST', body: { column_id: v } }), 'Moved'); await refreshAll(); }),
    );

    // status + actions
    const bannerText = { open: t.assignee_id ? `Waiting for ${isMine ? 'you' : nameOf(t.assignee_id)} to accept` : 'Unassigned. Anyone can pick it up.', accepted: `${isMine ? 'You are' : nameOf(t.assignee_id) + ' is'} on it`, blocked: `Blocked: ${t.blocked_reason}`, done: `Done${t.completed_at ? ' ' + timeAgo(t.completed_at) : ''}` };
    const actions = el('div', { class: 'th-actions' });
    if (t.status !== 'done') {
      if (t.status !== 'accepted' && (isMine || !t.assignee_id || canManage)) actions.append(el('button', { class: 'th-btn th-btn-primary th-btn-sm', onClick: () => actTask('accept', {}, t.assignee_id ? 'Accepted' : 'You picked it up') }, t.status === 'blocked' ? 'Unblock' : (t.assignee_id ? 'Accept' : 'Pick up')));
      if (t.status !== 'blocked') actions.append(el('button', { class: 'th-btn th-btn-sm', onClick: () => { const reason = prompt('What is blocking this task?'); if (reason && reason.trim()) actTask('block', { reason: reason.trim() }, 'Marked blocked'); } }, 'Blocked…'));
      actions.append(el('button', { class: 'th-btn th-btn-sm', onClick: () => actTask('complete', {}, 'Done') }, svg('check'), ' Complete'));
    } else {
      actions.append(el('button', { class: 'th-btn th-btn-sm', onClick: () => actTask('reopen', {}, 'Reopened') }, 'Reopen'));
    }
    if (canManage || (S.me && t.created_by === S.me.id)) actions.append(el('button', { class: 'th-btn th-btn-sm th-btn-danger', style: 'margin-left:auto', onClick: async () => { if (!confirm('Delete this task? This cannot be undone.')) return; const r = await guard(() => api(`/tasks/${t.id}`, { method: 'DELETE' }), 'Deleted'); if (r !== undefined) { closeDrawer(); await refreshAll(); } } }, 'Delete'));

    // description
    const desc = el('textarea', { class: 'th-textarea', placeholder: 'Add details, links, or the why.', 'aria-label': 'Description' }, t.description);
    desc.addEventListener('blur', () => { if (desc.value !== t.description) patchTask({ description: desc.value }, 'Description saved'); });

    // labels
    const labelInput = el('input', { placeholder: 'Add label', 'aria-label': 'Add label' });
    labelInput.addEventListener('keydown', e => { if (e.key === 'Enter' && labelInput.value.trim()) { e.preventDefault(); patchTask({ labels: [...t.labels, labelInput.value.trim()] }, 'Label added'); } });
    const labels = el('div', { class: 'th-labels-edit' }, ...t.labels.map(l => el('span', { class: 'th-pill th-pill-label' }, l, el('button', { class: 'th-x', 'aria-label': `Remove ${l}`, onClick: () => patchTask({ labels: t.labels.filter(x => x !== l) }, 'Label removed') }, '×'))), labelInput);

    // checklist
    const doneCount = t.checklist.filter(i => i.done).length;
    const ckInput = el('input', { placeholder: 'Add a step', 'aria-label': 'Add checklist item' });
    const addCk = () => { const v = ckInput.value.trim(); if (v) patchTask({ checklist: [...t.checklist, { text: v }] }, 'Step added'); };
    ckInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCk(); } });
    const checklist = el('div', {},
      el('h4', { class: 'th-h' }, 'Checklist', t.checklist.length ? el('span', { class: 'th-pill' }, `${doneCount}/${t.checklist.length}`) : null),
      t.checklist.length ? el('div', { class: 'th-progress' }, el('i', { style: `width:${Math.round(100 * doneCount / t.checklist.length)}%` })) : null,
      el('ul', { class: 'th-checklist' }, ...t.checklist.map(i => el('li', { class: i.done ? 'is-done' : '' },
        el('button', { class: `th-check${i.done ? ' is-done' : ''}`, html: i.done ? ICON.check : '', 'aria-label': i.done ? 'Undo' : 'Done', onClick: () => patchTask({ checklist: t.checklist.map(x => x.id === i.id ? { ...x, done: !x.done } : x) }) }),
        el('span', {}, i.text),
        el('button', { class: 'th-x', 'aria-label': 'Remove step', onClick: () => patchTask({ checklist: t.checklist.filter(x => x.id !== i.id) }) }, '×'),
      ))),
      el('div', { class: 'th-checklist-add' }, ckInput, el('button', { class: 'th-btn th-btn-sm', onClick: addCk }, 'Add')),
    );

    // comments
    const commentBox = el('textarea', { class: 'th-textarea', placeholder: S.me ? `Comment as ${S.me.name}` : 'Comment', 'aria-label': 'Comment' });
    const sendComment = async () => { const v = commentBox.value.trim(); if (!v) return; const r = await guard(() => api(`/tasks/${t.id}/comments`, { method: 'POST', body: { body: v } })); if (r) { commentBox.value = ''; await refreshAll(); } };
    commentBox.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendComment(); });
    const comments = el('div', {},
      el('h4', { class: 'th-h' }, 'Comments', el('span', { class: 'th-pill' }, t.comments.length)),
      el('div', { class: 'th-comments' }, ...t.comments.map(c => el('div', { class: 'th-comment' }, avatar(c.author_id, 28), el('div', { class: 'th-comment-body' }, el('div', { class: 'th-comment-meta' }, el('b', {}, nameOf(c.author_id)), ` · ${timeAgo(c.created_at)}`), el('div', { style: 'white-space:pre-wrap' }, c.body))))),
      el('div', { class: 'th-comment-form', style: 'margin-top:10px' }, commentBox, el('button', { class: 'th-btn th-btn-primary th-btn-sm', onClick: sendComment }, 'Send')),
    );

    // activity
    const activity = el('details', {}, el('summary', { class: 'th-h', style: 'cursor:pointer' }, `Activity (${t.activity.length})`),
      el('ul', { class: 'th-activity' }, ...t.activity.slice().reverse().map(a => el('li', {}, el('b', {}, nameOf(a.actor_id)), ' ', describeActivity(a), el('span', { style: 'opacity:.7' }, ` · ${timeAgo(a.created_at)}`)))));

    d.replaceChildren(
      el('header', { class: 'th-drawer-head' },
        el('span', { class: 'th-board-name' }, board ? board.name : '', ' › ', (columns.find(c => c.id === t.column_id) || {}).name || ''),
        el('span', { style: 'font-size:12px;color:var(--th-text-muted)' }, `by ${nameOf(t.created_by)} · ${timeAgo(t.created_at)}`),
        el('button', { class: 'th-icon-btn', 'aria-label': 'Close', html: ICON.close, onClick: closeDrawer }),
      ),
      el('div', { class: 'th-drawer-body' },
        titleInput,
        el('div', { class: 'th-status-banner', dataset: { status: t.status } }, statusPill(t) || el('span', { class: 'th-pill' }, 'Open'), el('span', {}, bannerText[t.status])),
        actions, props,
        el('div', {}, el('h4', { class: 'th-h' }, 'Description'), desc),
        el('div', {}, el('h4', { class: 'th-h' }, 'Labels'), labels),
        checklist, comments, activity,
      ),
    );
  }
  function describeActivity(a) {
    const d = a.detail || {};
    switch (a.kind) {
      case 'created': return 'created this task';
      case 'assigned': return d.to ? `assigned it to ${nameOf(d.to)}` : 'unassigned it';
      case 'unassigned': return 'unassigned it';
      case 'accepted': return 'accepted it';
      case 'blocked': return `marked it blocked: ${d.reason || ''}`;
      case 'unblocked': return 'unblocked it';
      case 'completed': return 'completed it';
      case 'reopened': return 'reopened it';
      case 'moved': return `moved it to ${d.to_name || 'another column'}`;
      case 'commented': return 'commented';
      case 'retitled': return `renamed it from "${d.from}"`;
      case 'described': return 'edited the description';
      case 'due_changed': return d.to ? `set the due date to ${fmtDue(d.to)}` : 'cleared the due date';
      case 'priority_changed': return `set priority to ${PRIORITY_LABEL[d.to] || d.to}`;
      case 'labels_changed': return `changed labels to ${(d.to || []).join(', ') || 'none'}`;
      case 'checklist_changed': return `updated the checklist (${d.done}/${d.total})`;
      default: return a.kind;
    }
  }

  // ---------- notifications ----------
  function toggleNotifs(force) {
    const p = $('#notifPanel');
    const show = force !== undefined ? force : p.hidden;
    p.hidden = !show;
    if (!show) return;
    p.replaceChildren(
      el('div', { class: 'th-popover-head' }, 'Notifications', S.notifs.some(n => !n.read_at) ? el('button', { class: 'th-link', onClick: async () => { await api('/notifications/read', { method: 'POST', body: {} }); await loadNotifs(); toggleNotifs(true); } }, 'Mark all read') : null),
      ...(S.notifs.length ? S.notifs.slice(0, 60).map(n => el('div', { class: `th-notif ${n.read_at ? 'is-read' : 'is-unread'}`, onClick: async () => {
        if (!n.read_at) { await api('/notifications/read', { method: 'POST', body: { ids: [n.id] } }); loadNotifs(); }
        toggleNotifs(false); if (n.task_id) openTask(n.task_id);
      } }, el('span', { class: 'th-notif-dot' }), el('div', {}, el('div', {}, n.message), el('div', { class: 'th-notif-time' }, timeAgo(n.created_at))))) : [el('div', { class: 'th-empty' }, 'Nothing yet.')]),
    );
  }

  // ---------- modals ----------
  function openModal(title, bodyNodes, footNodes) {
    const m = $('#modal'); m.hidden = false; $('#scrim').hidden = false;
    m.replaceChildren(el('div', { class: 'th-modal-card', role: 'dialog', 'aria-modal': 'true' },
      el('div', { class: 'th-modal-head' }, title, el('button', { class: 'th-icon-btn', 'aria-label': 'Close', html: ICON.close, onClick: closeModal })),
      el('div', { class: 'th-modal-body' }, ...bodyNodes),
      el('div', { class: 'th-modal-foot' }, ...footNodes),
    ));
    const first = m.querySelector('input, select, textarea'); if (first) first.focus();
  }
  function closeModal() { $('#modal').hidden = true; if ($('#drawer').hidden) $('#scrim').hidden = true; }

  function openTaskModal(preset = {}) {
    if (!S.boards.length) return openBoardModal();
    const boardId = preset.board_id || S.boardId || S.boards[0].id;
    const title = el('input', { type: 'text', placeholder: 'What needs doing?', required: true });
    const boardSel = el('select', {}, ...S.boards.map(b => el('option', { value: b.id, selected: b.id === boardId }, b.name)));
    const colSel = el('select', {});
    const fillCols = () => { const b = S.boards.find(x => x.id === boardSel.value); colSel.replaceChildren(...b.columns.map(c => el('option', { value: c.id, selected: c.id === preset.column_id }, c.name))); };
    fillCols(); boardSel.addEventListener('change', fillCols);
    const who = el('select', {}, el('option', { value: '' }, 'Unassigned'), ...S.members.map(m => el('option', { value: m.id, selected: m.id === preset.assignee_id }, m.name)));
    const due = el('input', { type: 'date' });
    const prio = el('select', {}, ...Object.entries(PRIORITY_LABEL).map(([v, l]) => el('option', { value: v, selected: v === 'normal' }, l)));
    const labels = el('input', { type: 'text', placeholder: 'comma, separated' });
    const desc = el('textarea', { rows: 3, placeholder: 'Details (optional)' });
    const submit = async () => {
      if (!title.value.trim()) { title.focus(); return toast('Give the task a title', true); }
      const r = await guard(() => api('/tasks', { method: 'POST', body: { title: title.value, board_id: boardSel.value, column_id: colSel.value, assignee_id: who.value || null, due_at: due.value || null, priority: prio.value, labels: labels.value, description: desc.value } }), who.value ? `Assigned to ${nameOf(who.value)}` : 'Task created');
      if (r) { closeModal(); if (boardSel.value !== S.boardId) { S.boardId = boardSel.value; LS.set('board', S.boardId); fillHeader(); } await refreshAll(); }
    };
    title.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    openModal('New task', [
      el('label', {}, 'Title', title),
      el('div', { class: 'th-two' }, el('label', {}, 'Board', boardSel), el('label', {}, 'Column', colSel)),
      el('div', { class: 'th-two' }, el('label', {}, 'Assign to', who), el('label', {}, 'Due', due)),
      el('div', { class: 'th-two' }, el('label', {}, 'Priority', prio), el('label', {}, 'Labels', labels)),
      el('label', {}, 'Description', desc),
    ], [el('button', { class: 'th-btn', onClick: closeModal }, 'Cancel'), el('button', { class: 'th-btn th-btn-primary', onClick: submit }, 'Create')]);
  }

  function columnRows(list, columns) {
    const KINDS = [['todo', 'To do'], ['doing', 'In progress'], ['done', 'Done']];
    const row = (c) => el('div', { class: 'th-col-row', dataset: { id: c.id || '' } },
      el('input', { type: 'text', value: c.name, placeholder: 'Column name' }),
      el('select', {}, ...KINDS.map(([v, l]) => el('option', { value: v, selected: v === c.kind }, l))),
      el('button', { class: 'th-icon-btn', 'aria-label': 'Move up', title: 'Move up', onClick: e => { const r = e.currentTarget.closest('.th-col-row'); if (r.previousElementSibling) r.previousElementSibling.before(r); } }, '↑'),
      el('button', { class: 'th-icon-btn', 'aria-label': 'Move down', title: 'Move down', onClick: e => { const r = e.currentTarget.closest('.th-col-row'); if (r.nextElementSibling) r.nextElementSibling.after(r); } }, '↓'),
      el('button', { class: 'th-icon-btn', 'aria-label': 'Remove column', title: 'Remove', html: ICON.close, onClick: e => e.currentTarget.closest('.th-col-row').remove() }),
    );
    list.replaceChildren(...columns.map(row));
    return () => list.append(row({ name: '', kind: 'todo' }));
  }
  const readColumnRows = list => $$('.th-col-row', list).map(r => ({ id: r.dataset.id || undefined, name: $('input', r).value.trim(), kind: $('select', r).value })).filter(c => c.name);

  function openBoardModal() {
    const name = el('input', { type: 'text', placeholder: 'Board name' });
    const desc = el('input', { type: 'text', placeholder: 'What goes on this board? (optional)' });
    const list = el('div', { class: 'th-col-list' });
    const addRow = columnRows(list, [{ name: 'To Do', kind: 'todo' }, { name: 'In Progress', kind: 'doing' }, { name: 'Done', kind: 'done' }]);
    const submit = async () => {
      const cols = readColumnRows(list);
      if (!name.value.trim()) { name.focus(); return toast('Name the board', true); }
      const b = await guard(() => api('/boards', { method: 'POST', body: { name: name.value, description: desc.value, columns: cols } }), 'Board created');
      if (b) { closeModal(); S.boards.push(b); S.boardId = b.id; LS.set('board', b.id); fillHeader(); await refreshAll(); }
    };
    openModal('New board', [el('label', {}, 'Name', name), el('label', {}, 'Description', desc), el('label', {}, 'Columns', list), el('button', { class: 'th-link', style: 'justify-self:start', onClick: addRow }, '+ Add column')],
      [el('button', { class: 'th-btn', onClick: closeModal }, 'Cancel'), el('button', { class: 'th-btn th-btn-primary', onClick: submit }, 'Create board')]);
  }

  function openBoardSettings() {
    const b = S.board; if (!b) return openBoardModal();
    const name = el('input', { type: 'text', value: b.name });
    const desc = el('input', { type: 'text', value: b.description });
    const list = el('div', { class: 'th-col-list' });
    const addRow = columnRows(list, b.columns);
    const submit = async () => {
      const rows = readColumnRows(list);
      if (!rows.length) return toast('Keep at least one column', true);
      const ok = await guard(async () => {
        if (name.value.trim() !== b.name || desc.value !== b.description) await api(`/boards/${b.id}`, { method: 'PATCH', body: { name: name.value, description: desc.value } });
        const keep = new Set(rows.filter(r => r.id).map(r => r.id));
        const survivor = rows.find(r => r.id);
        for (const c of b.columns) if (!keep.has(c.id)) await api(`/boards/${b.id}/columns/${c.id}`, { method: 'DELETE', body: { move_to: survivor ? survivor.id : undefined } });
        for (const r of rows) {
          if (!r.id) { const fresh = await api(`/boards/${b.id}/columns`, { method: 'POST', body: { name: r.name, kind: r.kind } }); r.id = fresh.columns[fresh.columns.length - 1].id; continue; }
          const prev = b.columns.find(c => c.id === r.id);
          if (prev && (prev.name !== r.name || prev.kind !== r.kind)) await api(`/boards/${b.id}/columns/${r.id}`, { method: 'PATCH', body: { name: r.name, kind: r.kind } });
        }
        for (const [i, r] of rows.entries()) await api(`/boards/${b.id}/columns/${r.id}`, { method: 'PATCH', body: { order: i } });
        return true;
      }, 'Board saved');
      if (!ok) return;
      closeModal();
      S.boards = await api('/boards'); fillHeader(); await refreshAll();
    };
    const archive = async () => {
      if (!confirm(`Archive "${b.name}"? Its tasks stay saved but the board disappears from the list.`)) return;
      await guard(() => api(`/boards/${b.id}`, { method: 'PATCH', body: { archived: true } }), 'Board archived');
      closeModal(); S.boards = await api('/boards'); S.boardId = (S.boards[0] || {}).id || null; LS.set('board', S.boardId || ''); fillHeader(); await refreshAll();
    };
    openModal('Board settings', [el('label', {}, 'Name', name), el('label', {}, 'Description', desc), el('label', {}, 'Columns', list), el('button', { class: 'th-link', style: 'justify-self:start', onClick: addRow }, '+ Add column')],
      [el('button', { class: 'th-btn th-btn-danger', style: 'margin-right:auto', onClick: archive }, 'Archive board'), el('button', { class: 'th-btn', onClick: closeModal }, 'Cancel'), el('button', { class: 'th-btn th-btn-primary', onClick: submit }, 'Save')]);
  }

  // ---------- drag and drop (pointer events; mouse drags at once, touch after a hold) ----------
  let dragging = false;
  let drag = null;
  function onPointerDown(e) {
    const cardEl = e.target.closest('.th-card');
    if (!cardEl || e.button > 0 || e.target.closest('button, a, input')) return;
    drag = { id: cardEl.dataset.task, el: cardEl, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, pointerId: e.pointerId, holdTimer: null, started: false, touch: e.pointerType === 'touch' };
    if (drag.touch) drag.holdTimer = setTimeout(() => { if (drag && !drag.started) startDrag(); }, 380);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', cancelDrag);
  }
  function startDrag() {
    drag.started = true; dragging = true;
    const r = drag.el.getBoundingClientRect();
    drag.offX = drag.x - r.left; drag.offY = drag.y - r.top;
    drag.ghost = drag.el.cloneNode(true); drag.ghost.classList.add('th-ghost'); drag.ghost.style.width = r.width + 'px';
    document.body.append(drag.ghost);
    drag.placeholder = el('div', { class: 'th-placeholder' }); drag.placeholder.style.height = r.height + 'px';
    drag.el.after(drag.placeholder); drag.el.classList.add('is-dragging'); drag.el.style.display = 'none';
    positionGhost();
    document.body.style.userSelect = 'none';
  }
  function positionGhost() { drag.ghost.style.left = (drag.x - drag.offX) + 'px'; drag.ghost.style.top = (drag.y - drag.offY) + 'px'; }
  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.started) {
      const dist = Math.hypot(drag.x - drag.startX, drag.y - drag.startY);
      if (drag.touch) { if (dist > 8) { clearTimeout(drag.holdTimer); cancelDrag(); } return; }
      if (dist > 6) startDrag(); else return;
    }
    positionGhost();
    const under = document.elementFromPoint(drag.x, drag.y);
    const body = under && under.closest('.th-col-body');
    $$('.th-col.is-over').forEach(c => c.classList.remove('is-over'));
    if (!body) return;
    body.closest('.th-col').classList.add('is-over');
    const cards = $$('.th-card', body).filter(c => c !== drag.el);
    let placed = false;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (drag.y < r.top + r.height / 2) { body.insertBefore(drag.placeholder, c); placed = true; break; }
    }
    if (!placed) body.append(drag.placeholder);
    // auto-scroll the board horizontally near edges
    const boardEl = $('.th-board'); if (boardEl) { const br = boardEl.getBoundingClientRect(); if (drag.x > br.right - 40) boardEl.scrollLeft += 12; else if (drag.x < br.left + 40) boardEl.scrollLeft -= 12; }
  }
  async function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag; cleanupDragListeners();
    if (!d.started) { drag = null; openTask(d.id); return; }
    const body = d.placeholder.parentElement;
    const columnId = body && body.dataset.column;
    const next = d.placeholder.nextElementSibling && d.placeholder.nextElementSibling.classList.contains('th-card') ? d.placeholder.nextElementSibling.dataset.task : null;
    const prev = d.placeholder.previousElementSibling && d.placeholder.previousElementSibling.classList.contains('th-card') ? d.placeholder.previousElementSibling.dataset.task : null;
    teardownDrag();
    if (!columnId) return;
    // optimistic local update
    const t = S.tasks.find(x => x.id === d.id);
    if (t) {
      const sib = S.tasks.filter(x => x.column_id === columnId && x.id !== d.id).sort((a, b) => a.position - b.position);
      const nextT = sib.find(x => x.id === next), prevT = sib.find(x => x.id === prev);
      t.column_id = columnId;
      t.position = nextT && prevT ? (nextT.position + prevT.position) / 2 : nextT ? nextT.position - 1 : prevT ? prevT.position + 1 : 1;
      const col = S.board.columns.find(c => c.id === columnId);
      if (col && col.kind === 'done') t.status = 'done'; else if (col && t.status === 'done') t.status = 'open';
      render();
    }
    const r = await guard(() => api(`/tasks/${d.id}/move`, { method: 'POST', body: { column_id: columnId, before_id: next, after_id: prev } }));
    if (r === undefined) await refreshAll(); else { Object.assign(t || {}, r); await Promise.all([loadMine(), loadNotifs()]); render(); }
  }
  function cancelDrag() { if (!drag) return; cleanupDragListeners(); if (drag.started) teardownDrag(); drag = null; }
  function cleanupDragListeners() {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', cancelDrag);
    if (drag) clearTimeout(drag.holdTimer);
  }
  function teardownDrag() {
    if (drag.ghost) drag.ghost.remove();
    if (drag.placeholder) drag.placeholder.remove();
    drag.el.classList.remove('is-dragging'); drag.el.style.display = '';
    $$('.th-col.is-over').forEach(c => c.classList.remove('is-over'));
    document.body.style.userSelect = '';
    dragging = false; drag = null;
  }
  document.addEventListener('touchmove', e => { if (dragging) e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerdown', onPointerDown);

  // ---------- wiring ----------
  function wire() {
    $$('.th-tabs button').forEach(b => b.addEventListener('click', async () => { S.view = b.dataset.view; LS.set('view', S.view); if (S.view === 'mine') await loadMine(); render(); }));
    $('#boardSelect').addEventListener('change', async e => {
      if (e.target.value === '__new') { e.target.value = S.boardId || ''; return openBoardModal(); }
      S.boardId = e.target.value; LS.set('board', S.boardId); if (S.view === 'mine') S.view = 'board'; await loadBoard(); render();
    });
    $('#meSelect').addEventListener('change', async e => { S.me = member(e.target.value); LS.set('me', S.me.id); toast(`You are now ${S.me.name}`); await refreshAll(); });
    $('#newTaskBtn').addEventListener('click', () => openTaskModal());
    $('#boardSettingsBtn').addEventListener('click', openBoardSettings);
    $('#bellBtn').addEventListener('click', async () => { await loadNotifs(); toggleNotifs(); });
    let searchTimer; $('#search').addEventListener('input', e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { S.search = e.target.value; if (S.view === 'mine') S.view = 'board'; render(); }, 120); });
    for (const [id, key] of [['fAssignee', 'assignee'], ['fStatus', 'status'], ['fPriority', 'priority'], ['fLabel', 'label']]) {
      $('#' + id).addEventListener('change', e => { S.filters[key] = e.target.value; render(); });
    }
    $('#clearFilters').addEventListener('click', () => { S.filters = { assignee: '', status: '', priority: '', label: '' }; S.search = ''; $('#search').value = ''; ['fAssignee', 'fStatus', 'fPriority', 'fLabel'].forEach(id => { $('#' + id).value = ''; }); render(); });
    $('#scrim').addEventListener('click', () => { if (!$('#modal').hidden) closeModal(); else closeDrawer(); });
    document.addEventListener('click', e => { if (!$('#notifPanel').hidden && !e.target.closest('#notifPanel, #bellBtn')) toggleNotifs(false); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else if (!$('#notifPanel').hidden) toggleNotifs(false); else if (S.openTaskId) closeDrawer(); }
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.target.closest('input, textarea, select') && $('#modal').hidden) { e.preventDefault(); openTaskModal(); }
    });
    // Deep link: #task=<id>
    const m = location.hash.match(/task=([\w-]+)/); if (m) openTask(m[1]);
  }

  (async () => {
    try {
      await bootstrap();
      wire();
      await Promise.all([loadBoard(), loadMine(), loadNotifs()]);
      render();
      startPolling();
    } catch (e) {
      $('#view').replaceChildren(el('div', { class: 'th-empty' }, 'TaskHub could not load: ', e.message));
    }
  })();
})();
