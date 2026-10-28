// ===== TIMERS (Tim, Oct 28 2026) =====
// The store's recurring task timers (Restrooms, Lot Sweep, Playground...) on
// the Lists tab, like the tablet at the counter, plus who owned each cycle
// and how it went.
//
// The rules live on the server (timers_api.py): a cycle comes due an
// interval after the last reset (or after opening), may sit overdue for its
// grace, and is missed after that; the server writes the miss itself. Every
// cycle is credited to the Lead Captain on Set Ups when it came due, or to
// whoever they handed the timer to (a handoff holds until a new Lead Captain
// takes the floor, or it's taken back). This page shows the clock, sends
// resets, handoffs and counts, and adds up the scoreboard.
//
// Now: the timers and the counters. Scoreboard: Lead Captains ranked, then
// dayparts, team members handed timers, who reset them, each timer.
// Setup (Team Leads and up): the timers, counters and store hours.
// FOH only, so English only (CLAUDE.md, Spanish). Line icons, never emoji.
// People's text only reaches the page through h().
(function(){
  'use strict';
  const API = '/api/timers';
  const POLL_MS = 15000, MIN = 60000, DAY = 86400000;
  const LEADS = ['director', 'manager', 'admin', 'lead'];
  const ICONS = {
    restroom: '<circle cx="7" cy="4.5" r="1.6"/><path d="M5 21v-6H4l1-6.5h4L10 15H9v6"/><circle cx="17" cy="4.5" r="1.6"/><path d="M15 21v-6.5h-.5V9.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5v5H19V21"/><path d="M12 3v18"/>',
    broom: '<path d="M14 3l-4 9"/><path d="M6.5 11.5l7 3-2 6.5H4z"/><path d="M8 21l1.5-5M11.5 21l.8-4"/>',
    slide: '<path d="M5 21V5h4v16"/><path d="M5 9h4M5 13h4M5 17h4"/><path d="M9 5c4 0 5 4 7 8s3 8 5 8"/>',
    table: '<path d="M3 9h18"/><path d="M6 9v11M18 9v11"/><path d="M6 14h12"/><path d="M8 5h8"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>',
    cup: '<path d="M6 8h12l-1.5 13h-9z"/><path d="M5 5h14v3H5z"/><path d="M12 5l2-3"/>',
    spray: '<path d="M8 10h6v11H8z"/><path d="M9 10V7h4v3"/><path d="M9 7l-1-3h6"/><path d="M17 4h1M17 7h3M17 10h1"/>',
    window: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 3v18M4 12h16"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  const ICON_NAMES = {restroom: 'Restroom', broom: 'Broom', slide: 'Playground', table: 'Table', trash: 'Trash', cup: 'Cup', spray: 'Spray', window: 'Window', clock: 'Clock'};
  const LS = {
    get: (k, d) => { try { const v = localStorage.getItem('timers.' + k); return v === null ? d : v; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem('timers.' + k, v); } catch (e) {} },
  };

  const S = {
    root: null, layer: null, mounted: false, status: 'loading', error: '',
    config: null, counts: {}, last: {}, events: [], cursor: '', offset: 0, me: null, lead: '', daypart: '',
    tab: 'now', range: LS.get('range', '7'), stats: null, statsFor: '', poll: null, tick: null,
    sheet: null, busy: false, prevCls: {}, sound: LS.get('sound', '1') === '1', draft: null,
  };

  /* ---------- helpers ---------- */
  const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const now = () => Date.now() + S.offset;
  const icon = (k, cls) => `<svg class="${cls || 'tm-ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.clock}</svg>`;
  const mins = s => { const [a, b] = String(s).split(':').map(Number); return a * 60 + (b || 0); };
  const dpShort = n => String(n || '').split(' (')[0];
  const first = n => String(n || '').split(/\s+/)[0];
  const isLead = () => !!((S.me && S.me.canLead) || (typeof launchManager !== 'undefined' && launchManager));
  function fmtLeft(ms){
    const neg = ms < 0; ms = Math.abs(ms);
    const hr = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000);
    return (neg ? '+' : '') + (hr ? `${hr}h ${String(m).padStart(2, '0')}m` : `${m}:${String(s).padStart(2, '0')}`);
  }
  const fmtTime = ts => new Date(ts).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
  const fmtDay = ts => new Date(ts).toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
  function toast(msg){ if(typeof showToast === 'function') showToast(msg); }

  /* ---------- the clock (the same rules as timers_api.py) ---------- */
  function hoursOn(d){
    const hr = S.config.hours, py = (d.getDay() + 6) % 7;   // the server counts Monday as 0
    if(hr.closedDays.includes(py)) return null;
    const at = t => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime() + mins(t) * MIN; };
    return [at(hr.open), at(hr.lateDays.includes(py) ? hr.closeLate : hr.close)];
  }
  function cycle(t){
    const lastReset = S.last[t.id], n = now();
    if(!lastReset) return {cls: 'new'};
    const today = hoursOn(new Date(n));
    if(!today || n < today[0] || n >= today[1]) return {cls: 'off'};
    const base = Math.max(lastReset, today[0]);
    if(base >= today[1]) return {cls: 'off'};
    const due = base + t.interval * MIN, left = due - n;
    let cls = 'ok';
    if(left <= 0) cls = -left > t.grace * MIN ? 'missed' : 'late';
    else if(left <= Math.min(5 * MIN, t.interval * MIN * 0.2)) cls = 'soon';
    return {cls, due, left};
  }
  // Who owns a timer right now: today's latest handoff under this Lead Captain, else them.
  function ownerNow(id){
    const date = typeof today !== 'undefined' ? today : new Date().toISOString().slice(0, 10);
    const k = s => String(s || '').trim().toLowerCase();
    let owner = S.lead;
    S.events.forEach(e => {
      const d = e.data || {};
      if(e.type === 'handoff' && d.timerId === id && d.date === date && k(d.lead) === k(S.lead)) owner = d.to || S.lead;
    });
    return owner;
  }
  // Everyone placed on the FOH set up for the daypart on the floor now.
  function onTheFloor(){
    if(typeof posAssignments === 'undefined' || typeof today === 'undefined') return [];
    const prefix = `foh||${today}||${S.daypart}||`, seen = new Set(), out = [];
    Object.keys(posAssignments).forEach(key => {
      if(!key.startsWith(prefix)) return;
      String(posAssignments[key] || '').split('/').map(n => n.trim()).filter(Boolean).forEach(n => {
        if(!seen.has(n.toLowerCase())){ seen.add(n.toLowerCase()); out.push(n); }
      });
    });
    return out.sort((a, b) => a.localeCompare(b));
  }

  /* ---------- server ---------- */
  async function api(path, opts = {}){
    const r = await fetch(API + path, {method: opts.method || 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: opts.body ? {'Content-Type': 'application/json'} : {}, body: opts.body ? JSON.stringify(opts.body) : undefined});
    let d = {};
    try { d = await r.json(); } catch (e) {}
    if(!r.ok) throw new Error(d.error || 'Timers couldn’t reach the server. Try again in a moment.');
    return d;
  }
  function take(d){
    S.offset = d.serverTime - Date.now();
    const pending = {};
    Object.keys(countWait).forEach(id => { pending[id] = S.counts[id]; });   // taps not sent yet win
    S.config = d.config; S.counts = Object.assign({}, d.counts || {}, pending); S.last = d.last || {};
    S.me = d.me; S.lead = d.lead || ''; S.daypart = d.daypart || '';
    if(d.full) S.events = d.events;
    else {
      const have = new Set(S.events.map(e => e.id));
      d.events.forEach(e => { if(!have.has(e.id)) S.events.push(e); });
    }
    const cut = now() - 2 * DAY;
    S.events = S.events.filter(e => e.at >= cut);
    S.cursor = d.cursor;
  }
  async function load(){
    try {
      take(await api('/state' + (S.cursor ? '?since=' + encodeURIComponent(S.cursor) : '')));
      S.status = 'ready'; S.error = '';
    } catch (e) {
      if(S.status !== 'ready'){ S.status = 'error'; S.error = e.message; }
    }
    if(S.tab === 'now' && !S.sheet) render();
  }
  async function send(type, data){
    if(S.busy) return null;
    S.busy = true;
    try {
      const d = await api('/events', {method: 'POST', body: {type, data}});
      S.busy = false;
      await load();
      return d.event;
    } catch (e) {
      S.busy = false;
      toast(e.message);
      return null;
    }
  }

  // Counter taps go out once the tapping stops, so fast taps never get lost.
  const countWait = {};
  function queueCount(id){
    clearTimeout(countWait[id]);
    countWait[id] = setTimeout(() => {
      delete countWait[id];
      api('/events', {method: 'POST', body: {type: 'count', data: {counterId: id, value: S.counts[id] || 0}}}).catch(e => toast(e.message));
    }, 700);
  }

  /* ---------- sound ---------- */
  let audio = null;
  function beep(){
    if(!S.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25].forEach(off => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(0.18, audio.currentTime + off);
        g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + off + 0.2);
        o.start(audio.currentTime + off); o.stop(audio.currentTime + off + 0.22);
      });
    } catch (e) {}
  }

  /* ---------- Now ---------- */
  const STATUS = {ok: 'On track', soon: 'Due soon', late: 'Overdue', missed: 'Missed', off: 'Closed', new: 'Not started'};
  function tileHtml(t){
    return `<button type="button" class="tm-tile" data-tm-timer="${h(t.id)}">
      <span class="tm-ring"></span>
      <span class="tm-face"><span class="tm-time"></span><span class="tm-status"></span><span class="tm-rule"></span>
        <span class="tm-name">${h(t.name)}</span><span class="tm-owner"></span></span>
      <span class="tm-badge">${icon(t.icon)}</span>
    </button>`;
  }
  function counterHtml(c){
    return `<div class="tm-counter"><div class="tm-counter-row">
      <button type="button" class="tm-step" data-tm-count="${h(c.id)}" data-d="-1" aria-label="One less ${h(c.name)}">−</button>
      <button type="button" class="tm-count-val" data-tm-set="${h(c.id)}" aria-label="Set ${h(c.name)}">${h(S.counts[c.id] || 0)}</button>
      <button type="button" class="tm-step" data-tm-count="${h(c.id)}" data-d="1" aria-label="One more ${h(c.name)}">+</button>
    </div><div class="tm-counter-name">${h(c.name)}</div></div>`;
  }
  function headHtml(){
    const tabs = [['now', 'Now'], ['stats', 'Scoreboard']].concat(isLead() ? [['setup', 'Setup']] : []);
    return `<div class="tm-head">
      <div class="tm-lc">
        <span class="tm-lc-k">Lead Captain · ${h(dpShort(S.daypart))}</span>
        <span class="tm-lc-v">${S.lead ? h(S.lead) : 'Not on the set up yet'}</span>
        <span class="tm-lc-sub">Owns every timer unless it's handed off</span>
      </div>
      <div class="tm-seg" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${S.tab === k}" class="${S.tab === k ? 'on' : ''}" data-tm-tab="${k}">${l}</button>`).join('')}</div>
    </div>`;
  }
  function renderNow(){
    const c = S.config;
    return headHtml() + `
      <div class="tm-grid" id="tmGrid" data-ids="${h(c.timers.map(t => t.id).join())}">${c.timers.map(tileHtml).join('')}</div>
      ${c.counters.length ? `<h3 class="tm-h">Counters</h3><div class="tm-grid">${c.counters.map(counterHtml).join('')}</div>` : ''}
      <label class="tm-sound"><input type="checkbox" data-tm-sound ${S.sound ? 'checked' : ''}> Beep on this device when a timer goes overdue</label>`;
  }
  function paintTiles(){
    const grid = document.getElementById('tmGrid');
    if(!grid || !S.config) return;
    S.config.timers.forEach(t => {
      const el = grid.querySelector(`[data-tm-timer="${CSS.escape(t.id)}"]`);
      if(!el) return;
      const st = cycle(t);
      el.className = 'tm-tile is-' + st.cls;
      const time = el.querySelector('.tm-time'), ring = el.querySelector('.tm-ring');
      el.querySelector('.tm-status').textContent = STATUS[st.cls];
      if(st.cls === 'off' || st.cls === 'new'){
        time.textContent = st.cls === 'new' ? 'Tap' : '—';
        time.classList.remove('is-long');
        ring.style.background = '';
      } else {
        time.textContent = fmtLeft(st.left);
        time.classList.toggle('is-long', Math.abs(st.left) >= 3600000);
        const pct = st.left > 0 ? Math.max(0, Math.min(1, st.left / (t.interval * MIN))) : 1;
        ring.style.background = st.left > 0 ? `conic-gradient(var(--tm-c) ${pct * 360}deg, var(--tm-track) 0)` : 'var(--tm-c)';
      }
      const o = st.cls === 'off' ? '' : ownerNow(t.id);
      el.querySelector('.tm-owner').textContent = o ? (o === S.lead ? 'LC · ' : '') + first(o) : '';
      const was = S.prevCls[t.id];
      if(st.cls === 'late' && was && !['late', 'missed'].includes(was)) beep();
      S.prevCls[t.id] = st.cls;
    });
  }

  /* ---------- the timer sheet: done, hand off ---------- */
  function openTimer(id){
    const t = S.config.timers.find(x => x.id === id);
    if(!t) return;
    S.sheet = {kind: 'timer', id};
    const st = cycle(t), floor = onTheFloor(), owner = ownerNow(id), signed = S.me && S.me.name;
    const when = st.cls === 'new' ? 'Not started. Done starts its first cycle.'
      : st.cls === 'off' ? 'The store is closed. This only restarts it.'
      : st.left > 0 ? `Due in ${fmtLeft(st.left)}, on time` : `Overdue by ${fmtLeft(-st.left)}${st.cls === 'missed' ? ', already a miss' : ''}`;
    const handoff = isLead() && st.cls !== 'off' ? `
      <div class="tm-sheet-sec">
        <div class="tm-k">Owner</div>
        <div class="tm-owner-line">${h(owner || 'Nobody yet')}${owner && owner === S.lead ? ' <span class="tm-tag">Lead Captain</span>' : ''}</div>
        ${floor.length ? `<div class="tm-k">Hand it to someone on the floor</div>
          <div class="tm-chips">${floor.filter(n => n !== S.lead).map(n => `<button type="button" class="tm-chip ${n === owner ? 'on' : ''}" data-tm-handoff="${h(n)}">${h(n)}</button>`).join('')}</div>`
          : `<p class="tm-note">Nobody's on the ${h(dpShort(S.daypart))} set up yet.</p>`}
        ${owner && owner !== S.lead ? `<button type="button" class="tm-btn ghost" data-tm-handoff="">Take it back</button>` : ''}
      </div>` : '';
    const who = signed
      ? `<button type="button" class="tm-btn red big" data-tm-done="${h(S.me.name)}">${icon('clock', 'tm-ic-sm')} Done, ${h(first(S.me.name))}</button>`
      : `<div class="tm-k">Who did it?</div>
         ${floor.length ? `<div class="tm-chips">${floor.map(n => `<button type="button" class="tm-chip" data-tm-done="${h(n)}">${h(n)}</button>`).join('')}</div>` : ''}
         <div class="tm-row"><input class="tm-input" id="tmName" maxlength="40" placeholder="Or type your name" autocomplete="off">
         <button type="button" class="tm-btn red" data-tm-done-typed>Done</button></div>`;
    drawSheet(`<div class="tm-sheet-head">${icon(t.icon, 'tm-ic-lg')}<div><h2>${h(t.name)}</h2><p>${h(when)}</p></div></div>
      ${who}${handoff}
      <button type="button" class="tm-btn ghost" data-tm-close>Cancel</button>`);
  }
  function drawSheet(inner){
    if(!S.layer){ S.layer = document.createElement('div'); S.layer.className = 'tm-layer'; document.body.appendChild(S.layer); }
    S.layer.innerHTML = `<div class="tm-scrim" data-tm-close></div><div class="tm-sheet" role="dialog" aria-modal="true">${inner}</div>`;
    S.layer.hidden = false;
  }
  function closeSheet(){ S.sheet = null; if(S.layer) S.layer.hidden = true; render(); }
  async function done(name){
    const id = S.sheet && S.sheet.id;
    const ev = await send('reset', {timerId: id, name});
    if(!ev) return;
    const d = ev.data;
    toast(d.status === 'ontime' ? `${d.timerName}: on time. Thanks, ${first(ev.by)}!`
      : d.status === 'late' ? `${d.timerName}: ${d.lateMin} min late, inside the grace`
      : d.status === 'missed' ? `${d.timerName}: picked up, thanks ${first(ev.by)}. Counted as a miss.` : `${d.timerName} restarted`);
    closeSheet();
  }

  /* ---------- Scoreboard ---------- */
  function cyclesOf(events){
    const map = new Map();
    events.forEach(e => {
      const d = e.data || {};
      if(e.type === 'miss'){
        const k = d.timerId + '|' + d.due;
        if(!map.has(k)) map.set(k, {timer: d.timerName, due: d.due, status: 'missed', lateMin: null, lead: d.lead, owner: d.owner, daypart: d.daypart, by: ''});
      } else if(e.type === 'reset' && d.due && ['ontime', 'late', 'missed'].includes(d.status)){
        map.set(d.timerId + '|' + d.due, {timer: d.timerName, due: d.due, status: d.status, lateMin: d.lateMin, lead: d.lead, owner: d.owner, daypart: d.daypart, by: e.by, at: e.at});
      }
    });
    return [...map.values()];
  }
  function agg(list){
    const n = list.length, on = list.filter(c => c.status === 'ontime').length, late = list.filter(c => c.status === 'late').length;
    const miss = n - on - late, lates = list.filter(c => c.lateMin > 0);
    return {n, on, late, miss, onPct: n ? on / n * 100 : 0, score: n ? (on * 100 + late * 60) / n : 0,
      avgLate: lates.length ? lates.reduce((a, c) => a + c.lateMin, 0) / lates.length : 0};
  }
  const tone = s => s >= 85 ? 'ok' : s >= 65 ? 'warn' : 'bad';
  function table(list, keyOf, label, ranked, emptyText){
    const groups = {};
    list.forEach(c => { const k = keyOf(c); if(k) (groups[k] = groups[k] || []).push(c); });
    const rows = Object.entries(groups).map(([k, v]) => ({k, ...agg(v)})).sort((a, b) => b.score - a.score || b.n - a.n);
    if(!rows.length) return `<p class="tm-empty">${h(emptyText || 'Nothing in this range yet.')}</p>`;
    return `<div class="tm-table-wrap"><table class="tm-table full"><thead><tr><th>${h(label)}</th><th class="n">Cycles</th><th class="n">On time</th><th class="n">Late</th><th class="n">Missed</th><th class="n">Avg late</th><th>Score</th></tr></thead><tbody>${
      rows.map((r, i) => `<tr><td>${ranked ? `<span class="tm-rank r${i + 1}">${i + 1}</span>` : ''}<b>${h(r.k)}</b></td>
        <td class="n">${r.n}</td><td class="n">${Math.round(r.onPct)}%</td><td class="n">${r.late}</td><td class="n">${r.miss}</td>
        <td class="n">${r.avgLate ? r.avgLate.toFixed(1) + 'm' : '–'}</td>
        <td><span class="tm-bar"><i class="${tone(r.score)}" style="width:${r.score}%"></i></span><b class="tm-score">${Math.round(r.score)}</b></td></tr>`).join('')
    }</tbody></table></div>`;
  }
  function pickupTable(list){
    const groups = {};
    list.filter(c => c.by).forEach(c => (groups[c.by] = groups[c.by] || []).push(c));
    const rows = Object.entries(groups).map(([k, v]) => ({k, n: v.length, on: v.filter(c => c.status === 'ontime').length, saves: v.filter(c => c.status !== 'ontime').length})).sort((a, b) => b.n - a.n);
    if(!rows.length) return '<p class="tm-empty">No resets in this range yet.</p>';
    return `<div class="tm-table-wrap"><table class="tm-table"><thead><tr><th>Name</th><th class="n">Resets</th><th class="n">On time</th><th class="n">Late pickups</th></tr></thead><tbody>${
      rows.map((r, i) => `<tr><td><span class="tm-rank r${i + 1}">${i + 1}</span><b>${h(r.k)}</b></td><td class="n">${r.n}</td><td class="n">${Math.round(r.on / r.n * 100)}%</td><td class="n">${r.saves}</td></tr>`).join('')
    }</tbody></table></div><p class="tm-note">A late pickup is someone stepping up on an overdue timer. The miss still counts against the owner, not them.</p>`;
  }
  async function loadStats(){
    const days = S.range === 'today' ? 1 : Number(S.range);
    if(S.statsFor === S.range && S.stats) return;
    S.stats = null; render();
    try {
      const d = await api('/state?days=' + days);
      let ev = d.events;
      if(S.range === 'today'){ const t0 = new Date(now()); t0.setHours(0, 0, 0, 0); ev = ev.filter(e => (e.data && (e.data.due || 0)) >= t0.getTime()); }
      S.stats = cyclesOf(ev); S.statsFor = S.range;
    } catch (e) { S.stats = []; toast(e.message); }
    render();
  }
  function renderStats(){
    const top = headHtml() + `<div class="tm-seg tm-range">${[['today', 'Today'], ['7', '7 days'], ['30', '30 days']].map(([k, l]) =>
      `<button type="button" class="${S.range === k ? 'on' : ''}" data-tm-range="${k}">${l}</button>`).join('')}</div>`;
    if(!S.stats) return top + '<p class="tm-empty">Adding it up…</p>';
    const list = S.stats, a = agg(list);
    const handed = list.filter(c => c.owner && c.owner !== c.lead);
    const recent = [...list].sort((x, y) => y.due - x.due).slice(0, 15);
    return top + `
      <div class="tm-kpis">
        <div class="tm-kpi"><span>Score</span><b class="${a.n ? tone(a.score) : ''}">${a.n ? Math.round(a.score) : '–'}</b></div>
        <div class="tm-kpi"><span>On time</span><b>${a.n ? Math.round(a.onPct) + '%' : '–'}</b></div>
        <div class="tm-kpi"><span>Cycles</span><b>${a.n}</b></div>
        <div class="tm-kpi"><span>Late</span><b>${a.late}</b></div>
        <div class="tm-kpi"><span>Missed</span><b class="${a.miss ? 'bad' : ''}">${a.miss}</b></div>
        <div class="tm-kpi"><span>Avg late</span><b>${a.avgLate ? a.avgLate.toFixed(1) + 'm' : '–'}</b></div>
      </div>
      <p class="tm-note">Score: on time 100, late inside the grace 60, missed 0.</p>
      <section class="tm-card"><h3>Lead Captains</h3>${table(list, c => c.lead, 'Lead Captain', true, 'No cycles with a Lead Captain on the set up yet.')}</section>
      <section class="tm-card"><h3>Dayparts</h3>${table(list, c => dpShort(c.daypart), 'Daypart', true)}</section>
      <section class="tm-card"><h3>Handed off</h3><p class="tm-note">Cycles a Lead Captain handed to someone, and how they went.</p>${table(handed, c => c.owner, 'Owner', true, 'No handoffs in this range.')}</section>
      <section class="tm-card"><h3>Who reset them</h3>${pickupTable(list)}</section>
      <section class="tm-card"><h3>Timers</h3>${table(list, c => c.timer, 'Timer', false)}</section>
      <section class="tm-card"><h3>Recent</h3>${recent.length ? `<div class="tm-table-wrap"><table class="tm-table"><thead><tr><th>Timer</th><th>Due</th><th>Owner</th><th>Reset by</th><th>Result</th></tr></thead><tbody>${
        recent.map(c => `<tr><td>${h(c.timer)}</td><td>${h(fmtDay(c.due))} ${h(fmtTime(c.due))}</td><td>${h(c.owner || '–')}</td><td>${h(c.by || '–')}</td>
          <td><span class="tm-pill ${c.status}">${c.status === 'ontime' ? 'On time' : c.status === 'late' ? `Late ${c.lateMin}m` : c.by ? `Missed, +${c.lateMin}m` : 'Missed'}</span></td></tr>`).join('')
      }</tbody></table></div>` : '<p class="tm-empty">Nothing yet.</p>'}</section>`;
  }

  /* ---------- Setup ---------- */
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  function renderSetup(){
    if(!isLead()) { S.tab = 'now'; return renderNow(); }
    const c = S.draft || (S.draft = JSON.parse(JSON.stringify(S.config)));
    const iconSel = (v, i) => `<select class="tm-input" data-tm-f="icon" data-i="${i}">${Object.keys(ICONS).map(k => `<option value="${k}" ${k === v ? 'selected' : ''}>${ICON_NAMES[k]}</option>`).join('')}</select>`;
    return headHtml() + `
      <section class="tm-card"><h3>Timers</h3>
        <div class="tm-set tm-set-head"><span></span><span>Name</span><span>Icon</span><span>Every (min)</span><span>Grace (min)</span><span></span></div>
        ${c.timers.map((t, i) => `<div class="tm-set">
          <span class="tm-set-ic">${icon(t.icon)}</span>
          <input class="tm-input" data-tm-f="name" data-i="${i}" value="${h(t.name)}" maxlength="40">
          ${iconSel(t.icon, i)}
          <input class="tm-input" type="number" min="5" data-tm-f="interval" data-i="${i}" value="${t.interval}">
          <input class="tm-input" type="number" min="0" data-tm-f="grace" data-i="${i}" value="${t.grace}">
          <button type="button" class="tm-x" data-tm-del="timers" data-i="${i}" aria-label="Remove ${h(t.name)}">×</button></div>`).join('')}
        <button type="button" class="tm-btn ghost" data-tm-add="timers">Add a timer</button>
        <p class="tm-note"><b>Every</b> is how often it has to be done. <b>Grace</b> is how long it can sit overdue before it's a miss.</p>
      </section>
      <section class="tm-card"><h3>Counters</h3>
        ${c.counters.map((x, i) => `<div class="tm-set tm-set-c"><input class="tm-input" data-tm-c="name" data-i="${i}" value="${h(x.name)}" maxlength="30">
          <button type="button" class="tm-x" data-tm-del="counters" data-i="${i}" aria-label="Remove ${h(x.name)}">×</button></div>`).join('')}
        <button type="button" class="tm-btn ghost" data-tm-add="counters">Add a counter</button>
      </section>
      <section class="tm-card"><h3>Store hours</h3>
        <div class="tm-hours">
          <label>Open <input class="tm-input" type="time" data-tm-h="open" value="${h(c.hours.open)}"></label>
          <label>Close <input class="tm-input" type="time" data-tm-h="close" value="${h(c.hours.close)}"></label>
          <label>Late close <input class="tm-input" type="time" data-tm-h="closeLate" value="${h(c.hours.closeLate)}"></label>
        </div>
        <div class="tm-days"><span class="tm-k">Late close on</span>${DAYS.map((d, i) => `<label><input type="checkbox" data-tm-day="lateDays" value="${i}" ${c.hours.lateDays.includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}</div>
        <div class="tm-days"><span class="tm-k">Closed on</span>${DAYS.map((d, i) => `<label><input type="checkbox" data-tm-day="closedDays" value="${i}" ${c.hours.closedDays.includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}</div>
        <p class="tm-note">Timers rest outside these hours. Each day every timer starts fresh at opening.</p>
      </section>
      <div class="tm-row"><button type="button" class="tm-btn red" data-tm-save>Save for everyone</button><button type="button" class="tm-btn ghost" data-tm-discard>Discard changes</button></div>`;
  }

  /* ---------- render ---------- */
  function render(){
    if(!S.root) return;
    if(S.status === 'loading'){ S.root.innerHTML = '<p class="tm-empty">Loading the timers…</p>'; return; }
    if(S.status === 'error'){ S.root.innerHTML = `<p class="tm-empty">${h(S.error)} <button type="button" class="tm-btn ghost" data-tm-retry>Try again</button></p>`; return; }
    S.root.innerHTML = S.tab === 'stats' ? renderStats() : S.tab === 'setup' ? renderSetup() : renderNow();
    if(S.tab === 'now') paintTiles();
  }

  /* ---------- events ---------- */
  function onClick(e){
    const el = e.target.closest('button,[data-tm-close]');
    if(!el) return;
    const d = el.dataset;
    if(d.tmRetry !== undefined){ S.status = 'loading'; render(); load(); }
    else if(d.tmTab){ S.tab = d.tmTab; S.draft = null; render(); if(S.tab === 'stats') loadStats(); }
    else if(d.tmRange){ S.range = d.tmRange; LS.set('range', S.range); loadStats(); }
    else if(d.tmTimer) openTimer(d.tmTimer);
    else if(d.tmCount){
      const id = d.tmCount, v = Math.max(0, (S.counts[id] || 0) + Number(d.d));
      S.counts[id] = v; render(); queueCount(id);
    }
    else if(d.tmSet){
      const c = S.config.counters.find(x => x.id === d.tmSet);
      const v = prompt(`Set the ${c.name} count`, S.counts[c.id] || 0);
      if(v !== null && v.trim() !== '' && !isNaN(+v)){ S.counts[c.id] = Math.max(0, Math.round(+v)); render(); queueCount(c.id); }
    }
    else if(d.tmClose !== undefined) closeSheet();
    else if(d.tmDone !== undefined) done(d.tmDone);
    else if(d.tmDoneTyped !== undefined){
      const n = (document.getElementById('tmName') || {}).value || '';
      if(!n.trim()){ toast('Type your name first'); return; }
      done(n.trim());
    }
    else if(d.tmHandoff !== undefined){
      const id = S.sheet.id, to = d.tmHandoff;
      send('handoff', {timerId: id, to}).then(ev => { if(ev){ toast(to ? `${first(to)} owns it now` : 'It’s back with the Lead Captain'); openTimer(id); } });
    }
    else if(d.tmAdd){
      const c = S.draft;
      if(d.tmAdd === 'timers') c.timers.push({id: '', name: 'New timer', icon: 'clock', interval: 60, grace: 10});
      else c.counters.push({id: '', name: 'New counter'});
      render();
    }
    else if(d.tmDel){ S.draft[d.tmDel].splice(+d.i, 1); render(); }
    else if(d.tmDiscard !== undefined){ S.draft = null; render(); }
    else if(d.tmSave !== undefined){
      const c = S.draft;
      c.timers.forEach(t => { if(!t.id) t.id = t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20) + '-' + Math.random().toString(36).slice(2, 5); });
      c.counters.forEach(t => { if(!t.id) t.id = t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20) + '-' + Math.random().toString(36).slice(2, 5); });
      send('config', c).then(ev => { if(ev){ S.draft = null; toast('Timers saved for everyone'); render(); } });
    }
  }
  function onChange(e){
    const el = e.target, d = el.dataset;
    if(d.tmSound !== undefined){ S.sound = el.checked; LS.set('sound', S.sound ? '1' : '0'); return; }
    if(!S.draft) return;
    if(d.tmF){ const t = S.draft.timers[+d.i]; t[d.tmF] = ['interval', 'grace'].includes(d.tmF) ? Number(el.value) || 0 : el.value; if(d.tmF === 'icon') render(); }
    else if(d.tmC) S.draft.counters[+d.i].name = el.value;
    else if(d.tmH) S.draft.hours[d.tmH] = el.value;
    else if(d.tmDay){
      const list = S.draft.hours[d.tmDay], v = +el.value;
      S.draft.hours[d.tmDay] = el.checked ? [...new Set([...list, v])].sort() : list.filter(x => x !== v);
    }
  }

  function mount(){
    S.root = document.getElementById('timersRoot');
    if(!S.root || S.mounted) return;
    S.mounted = true;
    S.root.addEventListener('click', onClick);
    S.root.addEventListener('change', onChange);
    document.addEventListener('click', e => { if(S.layer && !S.layer.hidden && S.layer.contains(e.target)) onClick(e); });
    document.addEventListener('keydown', e => {
      if(e.key === 'Escape' && S.sheet) closeSheet();
      if(e.key === 'Enter' && e.target && e.target.id === 'tmName'){ const n = e.target.value.trim(); if(n) done(n); }
    });
  }
  function shown(){ const v = document.getElementById('timersView'); return !!(v && v.classList.contains('active')); }

  // navigation.js: the view opened.
  window.tmActivate = function(){
    mount();
    render();
    load();
    clearInterval(S.poll); clearInterval(S.tick);
    S.poll = setInterval(() => { if(!shown()){ clearInterval(S.poll); clearInterval(S.tick); return; } if(!document.hidden) load(); }, POLL_MS);
    S.tick = setInterval(() => { if(shown() && S.tab === 'now' && S.status === 'ready') paintTiles(); }, 1000);
  };
  window.TimersPage = {S, cycle, cyclesOf, agg, ownerNow, onTheFloor};
})();
