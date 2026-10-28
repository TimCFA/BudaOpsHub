// ===== TASKS: THE PASS (Tim, Oct 28 2026) =====
// Delegation for the leadership team, built from the Pass design. A ticket
// goes from the leader who hands work off to the one person who owns it:
// they say it back (or ask for another time), check in on the way, turn it
// in with proof, and the leader verifies it (meets standard, elite) or sends
// it back to redo. How much authority (level 1-5) and how often to check in
// are set on each ticket; the clarity meter on the Delegate sheet asks for
// what a clean handoff needs; the Team view (directors) shows who's
// reliable, who's loaded, and who's ready for more.
//
// The rules are pass-engine.js (the server keeps the same ones, pass_api.py,
// and refuses a step they don't allow). Who's holding the phone is the hub's
// own sign-in. It mounts into #tasksView when the Tasks tab opens
// (navigation.js psActivate); sheets go in a layer on <body>.
//
// Spanish: the EN / ES switch on the tab, remembered per device. On, every
// label carries its Spanish from the glossary (spanish.js, the Tasks
// section) through T / TL / V / TT; people's own words stay as typed.
// tests/test_pass_tab.py fails if a phrase asked for here is missing.
// People's text only ever reaches the page through h().
(function(){
  'use strict';
  const E = window.PassEngine, { LEVELS, CADENCES, HOUR, DAY } = E;
  const API = '/api/pass';
  const POLL_MS = 15000;
  const AREAS = ['Hospitality & Service', 'Stewardship', 'Drive-Thru', 'Catering & Connections', 'Talent', 'Food Safety', 'Food Quality', 'Food Cost', 'Kitchen', 'Facilities & Equipment', 'General'];
  const ROLE_LABEL = { director: 'Director', manager: 'Manager', admin: 'Admin Team', lead: 'Team Lead', trainer: 'Trainer', member: 'Team Member' };
  const ROLE_ORDER = ['director', 'manager', 'admin', 'lead', 'trainer', 'member'];
  const LEADS = ['director', 'manager', 'admin', 'lead'];
  const LS = {
    get: (k, d) => { try { const v = localStorage.getItem('pass.' + k); return v === null ? d : v; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem('pass.' + k, v); } catch (e) {} },
  };
  let legacyEs = '';
  try { legacyEs = localStorage.getItem('taskhub.es') || ''; } catch (e) {}   // the switch's old home (Oct 27)

  const S = {
    root: null, layer: null, mounted: false, status: 'loading', error: '',
    me: null, people: [], events: [], tasks: {}, names: {}, offset: 0, cursor: '',
    view: LS.get('view', 'mine'), es: LS.get('es', legacyEs) === '1', sheet: null, poll: null, busy: false,
  };

  /* ---------- text ---------- */
  const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const esOf = (en, ...a) => (S.es && typeof window.esText === 'function' ? window.esText(en, ...a) : '');
  const esSpan = (t, line) => (t ? `${line ? '' : ' '}<span class="es${line ? ' es-line' : ''}" lang="es">${h(t)}</span>` : '');
  const T = (en, ...a) => h(en) + esSpan(esOf(en, ...a));            // English, its Spanish beside it
  const TL = (en, ...a) => h(en) + esSpan(esOf(en, ...a), true);     // the Spanish on its own line
  const V = (shown, key, ...a) => h(shown) + esSpan(esOf(key, ...a));  // when the English on screen isn't the key
  const VL = (shown, key, ...a) => h(shown) + esSpan(esOf(key, ...a), true);
  const TT = (en, ...a) => { const t = esOf(en, ...a); return t ? `${en} / ${t}` : en; };   // plain text: placeholders, toasts
  const VT = (shown, key, ...a) => { const t = esOf(key, ...a); return t ? `${shown} / ${t}` : shown; };

  /* ---------- people ---------- */
  const now = () => Date.now() + S.offset;
  const person = id => S.people.find(p => p.id === id) || { id, name: S.names[id] || 'Someone', role: '', wip: 4, gone: true };
  const pname = id => person(id).name;
  const first = id => pname(id).split(/\s+/)[0];
  const AVC = ['#004F71', '#AF272F', '#3E6E5A', '#7A5C3E', '#5B4C80', '#2F6A84', '#8A4B5C', '#55703A'];
  const avColor = id => { let x = 0; for (const c of String(id)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return AVC[x % AVC.length]; };
  const initials = n => String(n).split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const av = (id, cls) => `<span class="ps-av${cls ? ' ' + cls : ''}" style="background:${avColor(id)}" aria-hidden="true">${h(initials(pname(id)))}</span>`;
  const roleText = r => (ROLE_LABEL[r] ? T(ROLE_LABEL[r]) : '');
  const isLead = () => !!(S.me && S.me.canDelegate);
  const isDirector = () => !!(S.me && S.me.canEditRoster);
  const pickable = () => S.people.filter(p => p.id !== (S.me && S.me.id));

  /* ---------- numbers and times ---------- */
  const pct = x => (x == null ? '–' : Math.round(x * 100) + '%');
  const hrs = x => (x == null ? '–' : x < 1 ? Math.round(x * 60) + 'm' : x < 10 ? (Math.round(x * 10) / 10) + 'h' : x < 48 ? Math.round(x) + 'h' : Math.round(x / 24) + 'd');
  const num = n => '#' + String(n || 0).padStart(4, '0');
  const day0 = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  function fmtTime(ts){ const d = new Date(ts); return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined }); }
  function fmtDay(ts, es){
    const d = new Date(ts), diff = Math.round((day0(d) - day0(new Date(now()))) / DAY);
    if(diff === 0) return es ? 'hoy' : 'Today';
    if(diff === 1) return es ? 'mañana' : 'Tomorrow';
    if(diff === -1) return es ? 'ayer' : 'Yesterday';
    if(diff > 1 && diff < 7) return d.toLocaleDateString(es ? 'es-MX' : 'en-US', { weekday: 'short' });
    return d.toLocaleDateString(es ? 'es-MX' : 'en-US', { month: 'short', day: 'numeric' });
  }
  const fmtWhen = (ts, es) => `${fmtDay(ts, es)} ${fmtTime(ts)}`;
  const ago = ms => hrs(Math.abs(ms) / HOUR);
  function toLocalInput(ts){ const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); }
  const fromLocalInput = v => (v ? new Date(v).getTime() : 0);
  // Quick due picks. The restaurant is closed Sunday, so nothing lands then.
  function skipSunday(d){ if(d.getDay() === 0) d.setDate(d.getDate() + 1); return d; }
  function quickDue(kind){
    const d = new Date(now());
    if(kind === '2h'){ d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 2); return d.getTime(); }
    if(kind === 'tonight'){ d.setHours(21, 0, 0, 0); if(d.getTime() < now() + HOUR) d.setDate(d.getDate() + 1); return skipSunday(d).getTime(); }
    if(kind === 'tomorrow'){ d.setDate(d.getDate() + 1); d.setHours(14, 0, 0, 0); return skipSunday(d).getTime(); }
    if(kind === 'week'){ d.setDate(d.getDate() + 7); d.setHours(14, 0, 0, 0); return skipSunday(d).getTime(); }
    return 0;
  }

  /* ---------- icons (line, never emoji) ---------- */
  const svg = (d, w) => `<svg viewBox="0 0 24 24" width="${w || 20}" height="${w || 20}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    plus: svg('<path d="M12 5v14M5 12h14"/>', 22),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>', 18),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
    mine: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
    wait: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    board: svg('<path d="M3 5h18"/><path d="M6 5v10h4V5M14 5v14h4V5"/>'),
    team: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3 3 0 010 6M21 20c0-2.6-1.6-4.8-4-5.6"/>'),
    camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 18),
  };

  /* ---------- talking to the server ---------- */
  async function call(path, opts){
    opts = opts || {};
    const r = await fetch(API + path, { method: opts.method || 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const j = await r.json().catch(() => ({}));
    if(!r.ok){ const err = new Error(j.error || 'That didn’t go through. Check your connection and try again.'); err.status = r.status; throw err; }
    return j;
  }
  async function load(full){
    const j = await call('/state' + (full || !S.cursor ? '' : '?since=' + encodeURIComponent(S.cursor)));
    S.cursor = j.cursor;
    S.offset = j.serverTime - Date.now();
    S.me = j.me; S.people = j.people;
    if(j.full) S.events = j.events;
    else { const have = new Set(S.events.map(e => e.id)); S.events = S.events.concat(j.events.filter(e => !have.has(e.id))); }
    refold();
    S.status = 'ready';
  }
  function refold(){
    S.tasks = E.fold(S.events);
    S.names = {};
    for(const e of S.events){
      if(e.byName) S.names[e.by] = e.byName;
      if(e.data && e.data.ownerName) S.names[e.data.owner] = e.data.ownerName;
    }
  }
  async function act(body, okMsg){
    if(S.busy) return false;
    S.busy = true;
    try {
      const ev = await call('/events', { method: 'POST', body });
      if(!S.events.some(x => x.id === ev.id)) S.events.push(ev);
      refold(); render(); if(okMsg) toast(okMsg);
      return true;
    } catch(err){
      if(err.status === 409 || err.status === 404){ try { await load(true); render(); } catch(e) {} }
      if(err.status === 401){ S.status = 'signedout'; render(); }
      toast(err.message, true);
      return false;
    } finally { S.busy = false; }
  }

  let toastTimer;
  function toast(msg, bad){
    let t = document.getElementById('psToast');
    if(!t){ t = document.createElement('div'); t.id = 'psToast'; t.className = 'ps-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.toggle('is-bad', !!bad); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
  }

  /* ---------- the ticket ---------- */
  function stampFor(t, r){
    if(t.status === 'verified') return t.rating === 'elite' ? ['s-elite', 'Elite'] : ['s-ok', 'Verified'];
    if(t.status === 'cancelled') return ['s-x', 'Void'];
    if(t.status === 'submitted') return ['s-in', 'Turned in'];
    if(r.late) return ['s-late', 'Late'];
    if(t.status === 'blocked') return ['s-block', 'Blocked'];
    if(t.returns && t.status === 'in_progress' && t.lastReturn && (!t.checkins.length || t.checkins[t.checkins.length - 1].at < t.lastReturn.at)) return ['s-redo', 'Redo'];
    if(t.status === 'accepted' || t.status === 'in_progress') return ['s-heard', 'Heard'];
    return ['s-new', t.status === 'negotiating' ? 'Counter' : 'New'];
  }
  function flagsFor(t, r){
    const f = [];
    if(t.status === 'delegated') f.push(r.unheard ? ['bad', V(`Not heard for ${ago(r.unheardFor)}`, 'Not heard for X', ago(r.unheardFor))] : ['heat', T('Waiting for heard')]);
    if(t.status === 'negotiating' && t.counter) f.push(['heat', V(`Asks for ${fmtWhen(t.counter.due)}`, 'Asks for X', fmtWhen(t.counter.due, true))]);
    if(r.checkinDue) f.push(['heat', T('Check-in due')]);
    else if(r.nextCheckin) f.push(['', V(`Check-in ${fmtWhen(r.nextCheckin)}`, 'Check-in X', fmtWhen(r.nextCheckin, true))]);
    if(t.health === 'at_risk' && E.WORKING.includes(t.status)) f.push(['heat', T('At risk')]);
    if(t.returns) f.push(['bad', V(`Redo ×${t.returns}`, 'Redo ×N', t.returns)]);
    if(t.status === 'verified') f.push(t.onTime ? ['go', T('On time')] : ['bad', T('Late')]);
    f.push(['lv', V(`Level ${t.level}`, 'Level N', t.level)]);
    return f.map(([c, html]) => `<span class="ps-flag ${c}">${html}</span>`).join('');
  }
  function dueText(t, r){
    if(t.status === 'verified') return ['', V(`Closed ${fmtDay(t.closedAt)}`, 'Closed X', fmtDay(t.closedAt, true))];
    if(t.status === 'cancelled') return ['', T('Cancelled')];
    if(t.status === 'submitted') return ['', V(`In ${fmtWhen(t.submittedAt)}`, 'Turned in X', fmtWhen(t.submittedAt, true))];
    if(r.late) return ['late', V(`${ago(now() - t.due)} late`, 'X late', ago(now() - t.due))];
    return [r.dueSoon ? 'soon' : '', V(`Due ${fmtWhen(t.due)}`, 'Due X', fmtWhen(t.due, true))];
  }
  function ticketHTML(t, opts){
    opts = opts || {};
    const r = E.derive(t, now()), [sc, st] = stampFor(t, r), [dc, dt] = dueText(t, r);
    const Tag = opts.static ? 'div' : 'button';
    return `<${Tag} class="ps-ticket p-${h(t.priority)}" ${opts.static ? '' : `type="button" data-open="${h(t.id)}" aria-label="${h(num(t.number) + ' ' + t.title)}"`}>
      <div class="ps-t-top"><span class="ps-t-no">${num(t.number)}</span><span class="ps-t-due ${dc}">${dt}</span></div>
      <div class="ps-t-title">${h(t.title)}</div>
      <div class="ps-t-meta"><span>${V(`${first(t.delegator)} to ${first(t.owner)}`, 'X to Y', first(t.delegator), first(t.owner))}</span>${t.area ? `<span>${T(t.area)}</span>` : ''}</div>
      ${opts.static ? '' : `<div class="ps-t-flags">${flagsFor(t, r)}</div>`}
      <span class="ps-stamp ${sc}">${h(st)}</span>
      ${opts.body || ''}
    </${Tag}>`;
  }
  const byDue = (a, b) => a.due - b.due;
  function section(title, list, tone, emptyHTML){
    if(!list.length && !emptyHTML) return '';
    return `<div class="ps-sec ${tone || ''}"><h3>${T(title)}</h3><span class="ps-n">${list.length}</span></div>
      ${list.length ? `<div class="ps-stack">${list.map(t => ticketHTML(t)).join('')}</div>` : emptyHTML}`;
  }
  function emptyBox(title, body){ return `<div class="ps-empty"><b>${TL(title)}</b>${TL(body)}</div>`; }

  /* ---------- views ---------- */
  function myBuckets(){
    const n = now(), mine = Object.values(S.tasks).filter(t => t.owner === S.me.id && E.OPEN.includes(t.status));
    const d = t => E.derive(t, n);
    const work = mine.filter(t => E.WORKING.includes(t.status));
    return {
      hear: mine.filter(t => t.status === 'delegated' || t.status === 'negotiating').sort(byDue),
      late: work.filter(t => d(t).late).sort(byDue),
      checkin: work.filter(t => !d(t).late && d(t).checkinDue).sort(byDue),
      doing: work.filter(t => !d(t).late && !d(t).checkinDue).sort(byDue),
      turned: mine.filter(t => t.status === 'submitted').sort((a, b) => b.submittedAt - a.submittedAt),
    };
  }
  function waitBuckets(){
    const n = now(), given = Object.values(S.tasks).filter(t => t.delegator === S.me.id);
    const d = t => E.derive(t, n), open = given.filter(t => E.OPEN.includes(t.status));
    return {
      verify: open.filter(t => t.status === 'submitted').sort((a, b) => a.submittedAt - b.submittedAt),
      counter: open.filter(t => t.status === 'negotiating'),
      late: open.filter(t => d(t).late).sort(byDue),
      missed: open.filter(t => !d(t).late && d(t).checkinDue),
      unheard: open.filter(t => t.status === 'delegated' && !d(t).late).sort(byDue),
      track: open.filter(t => E.WORKING.includes(t.status) && !d(t).late && !d(t).checkinDue).sort(byDue),
      closed: given.filter(t => t.status === 'verified' && n - t.closedAt < 7 * DAY).sort((a, b) => b.closedAt - a.closedAt),
    };
  }
  function counts(){
    if(!S.me) return { mine: 0, wait: 0 };
    const m = myBuckets(), w = waitBuckets();
    return { mine: m.hear.filter(t => t.status === 'delegated').length + m.late.length + m.checkin.length, wait: w.verify.length + w.counter.length };
  }
  function viewHead(title, sub){ return `<div class="ps-viewhead"><h2>${T(title)}</h2><p>${T(sub)}</p></div>`; }
  function viewMine(){
    const b = myBuckets(), total = b.hear.length + b.late.length + b.checkin.length + b.doing.length + b.turned.length;
    return viewHead('My tickets', 'Work that’s yours to deliver') +
      (total ? '' : emptyBox('Nothing on your rail.', 'When someone hands you a ticket, it shows up here for you to say it back and own it.')) +
      section('Say it back', b.hear, 'hot') + section('Late', b.late, 'bad') + section('Check-in due', b.checkin, 'hot') +
      section('Working', b.doing) + section('Turned in, waiting on verify', b.turned);
  }
  function viewWait(){
    const b = waitBuckets(), open = b.verify.length + b.counter.length + b.late.length + b.missed.length + b.unheard.length + b.track.length;
    return viewHead('Waiting on', 'Tickets you handed off') +
      (open || b.closed.length ? '' : emptyBox('You haven’t handed anything off.', 'Tap Delegate to send your first ticket. The clarity check walks you through a clean handoff.')) +
      section('Ready to verify', b.verify, 'hot') + section('New time requested', b.counter, 'hot') + section('Late', b.late, 'bad') +
      section('Missed check-in', b.missed, 'hot') + section('Not heard yet', b.unheard) + section('On track', b.track) + section('Closed this week', b.closed);
  }
  function viewBoard(){
    const all = Object.values(S.tasks), n = now();
    const cols = [
      ['Not heard', all.filter(t => t.status === 'delegated' || t.status === 'negotiating').sort(byDue)],
      ['Working', all.filter(t => E.WORKING.includes(t.status)).sort(byDue)],
      ['Turned in', all.filter(t => t.status === 'submitted').sort((a, b) => a.submittedAt - b.submittedAt)],
      ['Closed this week', all.filter(t => t.status === 'verified' && n - t.closedAt < 7 * DAY).sort((a, b) => b.closedAt - a.closedAt)],
    ];
    return viewHead('The rail', 'Every open ticket in the restaurant') +
      `<div class="ps-board">${cols.map(([title, list]) => `<section class="ps-col" aria-label="${h(title)}">
        <h3>${T(title)} <span class="ps-n">${list.length}</span></h3><div class="ps-rail"></div>
        ${list.length ? list.map(t => ticketHTML(t)).join('') : `<div class="ps-empty">${T('Nothing here.')}</div>`}
      </section>`).join('')}</div>`;
  }
  function loadBar(p, st){
    const cap = p.wip || 4, n = Math.max(cap, st.load);
    return `<div class="ps-load" aria-label="${h(st.load + ' of ' + cap + ' open')}">${Array.from({ length: n }, (_, i) => `<i class="${i < st.load ? (i >= cap ? 'over' : 'on') : ''}"></i>`).join('')}<span>${V(`${st.load}/${cap} open`, 'N of M open', st.load, cap)}</span></div>`;
  }
  const adviceText = a => (a.kind === 'ready' ? V(a.text, 'Ready for level N: X', a.level, esOf(LEVELS[a.level].name)) : T(a.text));
  function adviceHTML(a, block){
    return a ? `<div class="ps-advice ${a.kind}${block ? ' is-block' : ''}">${adviceText(a)}</div>` : '';
  }
  const byRole = (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name);
  function viewTeam(){
    const n = now();
    const owners = new Set(Object.values(S.tasks).map(t => t.owner));
    const ppl = S.people.filter(p => LEADS.includes(p.role) || p.role === 'trainer' || owners.has(p.id)).sort(byRole);
    return viewHead('Team', 'Who’s reliable, who’s loaded, who’s ready for more') +
      `<div class="ps-people">${ppl.map(p => {
        const st = E.personStats(S.tasks, p.id, n);
        return `<button type="button" class="ps-pcard" data-person="${h(p.id)}">
          ${av(p.id, 'lg')}
          <div><div class="nm">${h(p.name)}</div><div class="rl">${roleText(p.role)}${p.area ? ', ' + T(p.area) : ''}</div></div>
          <div class="ps-trust">${st.trust}<small>${T('trust')}</small></div>
          <div class="ps-pstats"><span>${T('On time')} <b>${pct(st.onTimeRate)}</b></span><span>${T('Elite')} <b>${pct(st.eliteRate)}</b></span><span>${T('Heard in')} <b>${hrs(st.heardHours)}</b></span><span>${T('Closed')} <b>${st.n}</b></span>${st.late ? `<span class="is-late">${T('Late now')} <b>${st.late}</b></span>` : ''}</div>
          ${loadBar(p, st)}
          ${adviceHTML(st.advice)}
        </button>`;
      }).join('')}</div>
      <p class="ps-note">${TL('Trust starts at 60 for everyone and moves with each verified ticket: half on time, half quality, less for each redo. A few tickets can’t swing it far.')}</p>`;
  }

  /* ---------- the tab ---------- */
  function views(){
    const v = [['mine', 'My tickets', I.mine]];
    if(isLead()) v.push(['wait', 'Waiting on', I.wait], ['board', 'Rail', I.board]);
    if(isDirector()) v.push(['team', 'Team', I.team]);
    return v;
  }
  function render(){
    if(!S.root) return;
    if(S.status !== 'ready'){
      const body = S.status === 'signedout'
        ? emptyBox('Sign in to use the Pass.', 'Your clock-in PIN puts your name on every ticket you send, hear and verify.') + `<div class="ps-btns"><button type="button" class="ps-btn red" data-signin>${T('Sign in')}</button></div>`
        : S.status === 'error' ? `<div class="ps-empty"><b>${TL('The Pass didn’t load.')}</b>${h(S.error)}<div class="ps-btns"><button type="button" class="ps-btn ghost" data-retry>${T('Try again')}</button></div></div>`
        : `<div class="ps-empty">${T('Loading…')}</div>`;
      S.root.innerHTML = shell(body, false);
      syncBadge(0);
      return;
    }
    const vs = views();
    if(!vs.some(v => v[0] === S.view)) S.view = 'mine';
    const c = counts();
    const body = S.view === 'wait' ? viewWait() : S.view === 'board' ? viewBoard() : S.view === 'team' ? viewTeam() : viewMine();
    const badge = k => (k === 'mine' ? c.mine : k === 'wait' ? c.wait : 0);
    const nav = vs.length > 1 ? `<nav class="ps-nav" aria-label="${h(TT('Views'))}" style="--n:${vs.length}">${vs.map(([k, label, icon]) => `<button type="button" data-view="${k}" ${S.view === k ? 'aria-current="page"' : ''}>${icon}<span>${T(label)}</span>${badge(k) ? `<span class="ps-badge">${badge(k)}</span>` : ''}</button>`).join('')}</nav>` : '';
    S.root.innerHTML = shell(nav + `<div class="ps-main">${body}</div>` + (isLead() ? `<button type="button" class="ps-fab" data-sheet="compose">${I.plus}<span>${T('Delegate')}</span></button>` : ''), true);
    syncBadge(c.mine + c.wait);
    if(S.sheet) renderSheet(false);
  }
  function shell(inner, ready){
    const me = ready && S.me ? `<span class="ps-me">${av(S.me.id)}${h(S.me.name)}</span>` : '';
    return `<div class="ps-root${S.es ? '' : ' ps-es-off'}">
      <header class="ps-top">
        <h2 class="ps-brand">The Pass<small>${T('Delegation, CFA Buda')}</small></h2>
        <span class="ps-spacer"></span>
        ${me}
        <div class="ps-lang" role="group" aria-label="${h(TT('Spanish'))}"><button type="button" data-es="0" aria-pressed="${!S.es}">EN</button><button type="button" data-es="1" aria-pressed="${S.es}">ES</button></div>
        ${ready && isDirector() ? `<button type="button" class="ps-iconbtn" data-sheet="roster" aria-label="${h(TT('Open-ticket limits'))}">${I.gear}</button>` : ''}
      </header>${inner}</div>`;
  }
  function syncBadge(n){
    const b = document.getElementById('tasksTabBadge');
    if(b){ b.hidden = !n; b.textContent = n || ''; }
  }

  /* ---------- sheets ---------- */
  function openSheet(kind, arg){ S.sheet = { kind, arg, form: {} }; renderSheet(true); }
  function closeSheet(){ S.sheet = null; renderSheet(false); }
  function sheetFrame(title, body){
    return `<div class="ps-sheet" role="dialog" aria-modal="true" aria-labelledby="psSheetTitle"><div class="ps-grab"></div>
      <div class="ps-sheethead"><h2 id="psSheetTitle">${title}</h2><button type="button" class="ps-close" data-close aria-label="${h(TT('Close'))}">${I.x}</button></div>${body}</div>`;
  }
  function renderSheet(firstOpen){
    if(!S.layer){ S.layer = document.createElement('div'); S.layer.className = 'ps-layer'; document.body.appendChild(S.layer); wireLayer(S.layer); }
    S.layer.classList.toggle('ps-es-off', !S.es);
    document.body.classList.toggle('ps-sheet-open', !!S.sheet);
    if(!S.sheet){ S.layer.innerHTML = ''; return; }
    const k = S.sheet.kind;
    const html = k === 'compose' ? sheetCompose() : k === 'task' ? sheetTask() : k === 'person' ? sheetPerson() : k === 'copy' ? sheetCopy() : sheetRoster();
    const old = S.layer.querySelector('.ps-sheet'), keep = old ? old.scrollTop : 0;
    S.layer.innerHTML = `<div class="ps-scrim" data-scrim>${firstOpen ? html.replace('class="ps-sheet"', 'class="ps-sheet anim"') : html}</div>`;
    const sheet = S.layer.querySelector('.ps-sheet');
    if(!firstOpen) sheet.scrollTop = keep;
    else { const f = sheet.querySelector('.ps-close'); if(f) f.focus({ preventScroll: true }); }
  }
  function sheetCopy(){
    return sheetFrame(T('Copy this'), `<textarea class="ps-in" style="min-height:240px" readonly aria-label="${h(TT('Copy this'))}">${h(S.sheet.arg)}</textarea><p class="ps-note">${T('Press and hold to select, then copy.')}</p>`);
  }

  // Delegate
  function whoButton(p, f, n){
    const st = E.personStats(S.tasks, p.id, n), over = st.load >= (p.wip || 4);
    const sub = isDirector() ? V(`${st.load}/${p.wip || 4} open, trust ${st.trust}`, 'N of M open, trust T', st.load, p.wip || 4, st.trust) : V(`${st.load}/${p.wip || 4} open`, 'N of M open', st.load, p.wip || 4);
    return `<button type="button" class="ps-whobtn" data-f-owner="${h(p.id)}" aria-pressed="${f.owner === p.id}">${av(p.id)}<span><span class="nm">${h(p.name)}</span><span class="sub ${over ? 'over' : ''}">${sub}</span></span></button>`;
  }
  function sheetCompose(){
    const f = S.sheet.form, n = now();
    if(f.level == null) Object.assign(f, { level: 3, cadence: 'midpoint', priority: 'normal', due: quickDue('tomorrow'), area: '' });
    const ownerP = f.owner ? person(f.owner) : null, ownerStats = f.owner ? E.personStats(S.tasks, f.owner, n) : null;
    const cl = E.clarity(f, n), miss = cl.items.find(i => !i.ok);
    const ppl = pickable().sort(byRole);
    const leaders = ppl.filter(p => p.role !== 'member'), members = ppl.filter(p => p.role === 'member');
    const showAll = f.showMembers || (ownerP && ownerP.role === 'member');
    const overload = ownerStats && ownerStats.load >= (ownerP.wip || 4);
    return sheetFrame(T('Delegate'), `
      <div class="ps-field"><span class="ps-lbl" id="psWhoL">${T('Who owns it')}</span><div class="ps-hint">${T('One owner. Their open tickets are shown so you can spread the work.')}</div>
        <div class="ps-who" role="group" aria-labelledby="psWhoL">${leaders.map(p => whoButton(p, f, n)).join('')}${showAll ? members.map(p => whoButton(p, f, n)).join('') : ''}</div>
        ${members.length && !showAll ? `<button type="button" class="ps-linkish" data-toggle="members">${V(`Show team members (${members.length})`, 'Show team members (N)', members.length)}</button>` : ''}
        ${overload ? `<div class="ps-warn">${V(`${first(f.owner)} already has ${ownerStats.load} open tickets (limit ${ownerP.wip || 4}). Pick someone else, or close one of theirs first.`, 'X already has N open tickets (limit M)', first(f.owner), ownerStats.load, ownerP.wip || 4)}</div>` : ''}
        ${ownerStats && ownerStats.advice && isDirector() ? `<div class="ps-note">${h(first(f.owner))}: ${adviceText(ownerStats.advice)}</div>` : ''}
      </div>
      <div class="ps-field"><label for="psTitle">${T('Task')}</label><input id="psTitle" class="ps-in" data-f="title" maxlength="160" placeholder="${h(TT('Reorganize dry storage to FIFO'))}" value="${h(f.title || '')}"></div>
      <div class="ps-field"><label for="psOutcome">${T('Done looks like')}</label><div class="ps-hint">${T('What will you see when it’s finished? Make it something you can check.')}</div>
        <textarea id="psOutcome" class="ps-in" data-f="outcome" maxlength="600" placeholder="${h(TT('Every shelf labeled with dates, oldest in front, nothing on the floor.'))}">${h(f.outcome || '')}</textarea></div>
      <div class="ps-field"><label for="psIntent">${T('Why it matters')}</label><div class="ps-hint">${T('The reason lets them make good calls when something doesn’t go to plan.')}</div>
        <textarea id="psIntent" class="ps-in" data-f="intent" maxlength="600" placeholder="${h(TT('Truck comes Thursday. Without rotation we waste product.'))}">${h(f.intent || '')}</textarea></div>
      <div class="ps-field"><label for="psDue">${T('Due')}</label>
        <div class="ps-chips">${[['2h', 'In 2 hours'], ['tonight', 'Tonight 9 PM'], ['tomorrow', 'Tomorrow 2 PM'], ['week', 'In a week']].map(([k, l]) => `<button type="button" class="ps-chip" data-quick="${k}" aria-pressed="${f.due === quickDue(k)}">${T(l)}</button>`).join('')}</div>
        <input id="psDue" type="datetime-local" class="ps-in" data-f="due" value="${f.due ? toLocalInput(f.due) : ''}"></div>
      <div class="ps-field"><span class="ps-lbl" id="psLvL">${T('How much authority')}</span><div class="ps-hint">${T('Match it to the person and the stakes. Raise it as they prove out.')}</div>
        <div class="ps-levels" role="group" aria-labelledby="psLvL">${LEVELS.slice(1).map(l => `<button type="button" class="ps-lvbtn" data-f-level="${l.n}" aria-pressed="${f.level === l.n}"><span class="k">${l.n}</span><span><span class="t">${T(l.name)}</span>${ownerStats && isDirector() && ownerStats.suggestedLevel === l.n ? `<span class="ps-sugg">${V(`Suggested for ${first(f.owner)}`, 'Suggested for X', first(f.owner))}</span>` : ''}<span class="d">${T(l.desc)}</span></span></button>`).join('')}</div></div>
      <div class="ps-field"><span class="ps-lbl" id="psCdL">${T('Check-ins')}</span>
        <div class="ps-chips" role="group" aria-labelledby="psCdL">${Object.entries(CADENCES).map(([k, l]) => `<button type="button" class="ps-chip" data-f-cadence="${k}" aria-pressed="${f.cadence === k}">${T(l)}</button>`).join('')}</div></div>
      <div class="ps-field"><span class="ps-lbl" id="psPrL">${T('Priority')}</span>
        <div class="ps-chips" role="group" aria-labelledby="psPrL">${[['normal', 'Normal'], ['high', 'High'], ['critical', 'Critical']].map(([k, l]) => `<button type="button" class="ps-chip" data-f-priority="${k}" aria-pressed="${f.priority === k}">${T(l)}</button>`).join('')}</div></div>
      <div class="ps-field"><label for="psArea">${T('Area')}</label><select id="psArea" class="ps-in" data-f="area"><option value="">${h(TT('None'))}</option>${AREAS.map(a => `<option value="${h(a)}" ${f.area === a ? 'selected' : ''}>${h(TT(a))}</option>`).join('')}</select></div>
      <div class="ps-clarity">
        <div class="ps-meter" aria-hidden="true">${cl.items.map(i => `<i class="${i.ok ? 'on' : ''}"></i>`).join('')}</div>
        <div class="row"><div class="msg" aria-live="polite">${clarityMsg(cl, miss)}</div>
        <button type="button" class="ps-btn red" data-send ${f.owner && (f.title || '').trim() && f.due ? '' : 'disabled'}>${T('Send ticket')}</button></div>
      </div>`);
  }
  function clarityMsg(cl, miss){
    return `<b>${V(`Clarity ${cl.score}/${cl.max}.`, 'Clarity N of M', cl.score, cl.max)}</b> ${miss ? T(miss.hint) : T('Clean handoff. Nothing left to guess.')}`;
  }

  // Ticket detail
  function eventVerb(e){
    const d = e.data || {};
    const who = id => first(id);
    switch(e.type){
      case 'created': return V(`sent this to ${who(d.owner)}`, 'sent this to X', who(d.owner));
      case 'backbrief': return T('said it back and owned it');
      case 'counter': return V(`asked to move it to ${d.due ? fmtWhen(d.due) : 'later'}`, 'asked to move it to X', d.due ? fmtWhen(d.due, true) : '');
      case 'counter_accept': return T('accepted the new time');
      case 'counter_reject': return T('kept the original time');
      case 'checkin': return T({ on_track: 'checked in: on track', at_risk: 'checked in: at risk', blocked: 'checked in: blocked' }[d.health] || 'checked in: on track');
      case 'submit': return T('turned it in');
      case 'verify': return T(d.rating === 'elite' ? 'verified it as elite' : 'verified it');
      case 'return': return T('sent it back to redo');
      case 'edit': return T('changed the details');
      case 'reassign': return V(`handed it to ${who(d.owner)}`, 'handed it to X', who(d.owner));
      case 'cancel': return T('cancelled it');
      case 'comment': return T('added a note');
    }
    return h(e.type);
  }
  const eventText = e => { const d = e.data || {}; return d.summary || d.note || d.evidence || d.feedback || d.reason || d.text || ''; };
  function sheetTask(){
    const t = S.tasks[S.sheet.arg];
    if(!t) return sheetFrame(T('Ticket not found'), `<p class="ps-note">${T('It may have been removed.')}</p>`);
    const r = E.derive(t, now()), f = S.sheet.form, me = S.me.id;
    const isOwner = me === t.owner, isDel = me === t.delegator, lv = LEVELS[t.level];
    const photos = t.timeline.filter(e => e.type === 'submit' && e.data && e.data.photo);
    const photo = photos.length ? photos[photos.length - 1] : null;
    const dl = (label, val, pre) => `<div><dt>${T(label)}</dt><dd>${pre ? val : h(val)}</dd></div>`;
    const body = `<dl class="ps-dl">
      ${dl('Done looks like', t.outcome ? h(t.outcome) : T('Not written'), true)}
      ${t.intent ? dl('Why it matters', t.intent) : ''}
      ${dl('Authority', `${V(`Level ${t.level}`, 'Level N', t.level)}: ${T(lv.name)}. ${T(lv.desc)}`, true)}
      ${dl('Check-ins', T(CADENCES[t.cadence]) + (r.nextCheckin ? ', ' + V(`next ${fmtWhen(r.nextCheckin)}`, 'next X', fmtWhen(r.nextCheckin, true)) : ''), true)}
      ${t.backbrief ? `<div><dt>${V(`${first(t.owner)} said back`, 'X said back', first(t.owner))}</dt><dd>${h(t.backbrief.summary)}${t.backbrief.plan ? '\n' + h(t.backbrief.plan) : ''}</dd></div>` : ''}
      ${t.evidence ? dl('Proof', t.evidence) : ''}
      ${photo ? `<img class="ps-photo" src="${API}/photo/${encodeURIComponent(photo.id)}" alt="${h(TT('Photo proof'))}" loading="lazy">` : ''}
      ${t.feedback ? dl('Feedback', t.feedback) : ''}
      ${t.aar ? dl('Lesson for next time', t.aar) : ''}
    </dl>`;
    let panels = '';
    const panel = (title, inner) => `<div class="ps-panel"><h4>${title}</h4>${inner}</div>`;
    if(isOwner && t.status === 'delegated'){
      panels += panel(T('Say it back'), `<p>${V(`In your own words, what will you deliver and by when? This is how ${first(t.delegator)} knows you heard it right.`, 'Say it back: how X knows you heard it', first(t.delegator))}</p>
        <textarea class="ps-in" data-ff="summary" maxlength="600" aria-label="${h(TT('What you’ll deliver'))}" placeholder="${h(TT('Every shelf in dry storage dated and rotated by tomorrow 2 PM.'))}">${h(f.summary || '')}</textarea>
        <textarea class="ps-in short" data-ff="plan" maxlength="600" aria-label="${h(TT('First step (optional)'))}" placeholder="${h(TT('First step (optional)'))}">${h(f.plan || '')}</textarea>
        <div class="ps-btns"><button type="button" class="ps-btn red" data-do="backbrief" ${(f.summary || '').trim() ? '' : 'disabled'}>${T('Heard. I own it')}</button></div>
        <button type="button" class="ps-linkish" data-toggle="counter">${T(f.showCounter ? 'Never mind, the time works' : 'That time won’t work')}</button>
        ${f.showCounter ? `<div><label class="ps-lbl" for="psCdue">${T('Time you can commit to')}</label><input id="psCdue" type="datetime-local" class="ps-in" data-ff="cdue" value="${h(f.cdue || toLocalInput(t.due + DAY))}">
          <textarea class="ps-in short" data-ff="creason" maxlength="400" aria-label="${h(TT('Why (so they can plan around it)'))}" placeholder="${h(TT('Why (so they can plan around it)'))}">${h(f.creason || '')}</textarea>
          <div class="ps-btns"><button type="button" class="ps-btn ghost" data-do="counter">${T('Ask for this time')}</button></div></div>` : ''}`);
    }
    if(isDel && t.status === 'negotiating' && t.counter){
      panels += panel(V(`${first(t.owner)} asked for more time`, 'X asked for more time', first(t.owner)), `<p>${T('New time')}: <b>${h(fmtWhen(t.counter.due))}</b>${t.counter.reason ? `. “${h(t.counter.reason)}”` : ''}</p>
        <div class="ps-btns"><button type="button" class="ps-btn red" data-do="counter_accept">${T('Accept new time')}</button><button type="button" class="ps-btn ghost" data-do="counter_reject">${T('Keep original time')}</button></div>`);
    }
    if(isOwner && E.WORKING.includes(t.status)){
      const hl = f.health || 'on_track';
      panels += panel(T('Check in'), `<p>${T(r.checkinDue ? 'A check-in is due.' : 'Send an update any time. Raise problems early.')}</p>
        <div class="ps-seg" role="group" aria-label="${h(TT('How it’s going'))}">${[['on_track', 'On track', 'g'], ['at_risk', 'At risk', 'h'], ['blocked', 'Blocked', 'b']].map(([k, l, c]) => `<button type="button" class="${c}" data-ff-health="${k}" aria-pressed="${hl === k}">${T(l)}</button>`).join('')}</div>
        <textarea class="ps-in short" data-ff="note" maxlength="600" aria-label="${h(TT('Update'))}" placeholder="${h(TT(hl === 'blocked' ? 'What do you need to get unblocked?' : 'Where it stands'))}">${h(f.note || '')}</textarea>
        <div class="ps-btns"><button type="button" class="ps-btn ghost" data-do="checkin" ${hl !== 'on_track' && !(f.note || '').trim() ? 'disabled' : ''}>${T('Send check-in')}</button></div>`) +
        panel(T('Turn it in'), `<p>${T('Show it’s done the way the ticket describes.')}</p>
        ${t.lastReturn ? `<div class="ps-warn">${T('Sent back')}: ${h(t.lastReturn.feedback || '')}</div>` : ''}
        <textarea class="ps-in" data-ff="evidence" maxlength="1000" aria-label="${h(TT('Proof it’s done'))}" placeholder="${h(TT('What you did, and how it matches “done looks like”'))}">${h(f.evidence || '')}</textarea>
        <label class="ps-btn ghost ps-filebtn">${I.camera}<span>${T(f.photo ? 'Photo added. Replace' : 'Add a photo')}</span><input type="file" accept="image/*" capture="environment" data-photo class="ps-sr"></label>
        ${f.photo ? `<img class="ps-photo" src="${h(f.photo)}" alt="${h(TT('Photo to attach'))}">` : ''}
        <div class="ps-btns"><button type="button" class="ps-btn red" data-do="submit" ${(f.evidence || '').trim() || f.photo ? '' : 'disabled'}>${T('Turn in')}</button></div>`);
    }
    if(isDel && t.status === 'submitted'){
      const rt = f.rating || '';
      panels += panel(T('Verify'), `<p>${T('Compare it to “done looks like.” Close the loop fast; it tells them the work mattered.')}</p>
        <div class="ps-seg" role="group" aria-label="${h(TT('Rating'))}">${[['redo', 'Redo', 'b'], ['meets', 'Meets standard', 'g'], ['elite', 'Elite', 'g']].map(([k, l, c]) => `<button type="button" class="${c}" data-ff-rating="${k}" aria-pressed="${rt === k}">${T(l)}</button>`).join('')}</div>
        <textarea class="ps-in short" data-ff="feedback" maxlength="600" aria-label="${h(TT('Feedback'))}" placeholder="${h(TT(rt === 'redo' ? 'What’s missing? Be specific.' : 'What made it good (optional)'))}">${h(f.feedback || '')}</textarea>
        ${rt && rt !== 'redo' ? `<textarea class="ps-in short" data-ff="aar" maxlength="600" aria-label="${h(TT('Lesson for next time (optional)'))}" placeholder="${h(TT('Lesson for next time (optional)'))}">${h(f.aar || '')}</textarea>` : ''}
        <div class="ps-btns">${rt === 'redo' ? `<button type="button" class="ps-btn dark-red" data-do="return" ${(f.feedback || '').trim() ? '' : 'disabled'}>${T('Send back to redo')}</button>` : `<button type="button" class="ps-btn go" data-do="verify" ${rt ? '' : 'disabled'}>${T('Verify')}</button>`}</div>`);
    }
    if(isDel && r.open){
      const lateish = r.late || r.checkinDue || r.unheard;
      panels += panel(T('Manage'), `${lateish ? `<p>${T('Need a nudge? Copy a message for text or GroupMe.')}</p><div class="ps-btns tight"><button type="button" class="ps-btn ghost" data-nudge>${T('Copy nudge')}</button></div>` : ''}
        <button type="button" class="ps-linkish" data-toggle="edit">${T(f.showEdit ? 'Hide changes' : 'Change due time, authority, or owner')}</button>
        ${f.showEdit ? `<div class="ps-field"><label class="ps-lbl" for="psEdue">${T('Due')}</label><input id="psEdue" type="datetime-local" class="ps-in" data-ff="edue" value="${h(f.edue || toLocalInput(t.due))}">${r.late ? `<div class="ps-hint">${T('It’s already late, so moving the time still counts as late.')}</div>` : ''}</div>
          <div class="ps-field"><label class="ps-lbl" for="psElv">${T('Authority')}</label><select id="psElv" class="ps-in" data-ff="elevel">${LEVELS.slice(1).map(l => `<option value="${l.n}" ${(+f.elevel || t.level) === l.n ? 'selected' : ''}>${l.n}: ${h(TT(l.name))}</option>`).join('')}</select></div>
          <div class="ps-field"><label class="ps-lbl" for="psEcd">${T('Check-ins')}</label><select id="psEcd" class="ps-in" data-ff="ecadence">${Object.entries(CADENCES).map(([k, l]) => `<option value="${k}" ${(f.ecadence || t.cadence) === k ? 'selected' : ''}>${h(TT(l))}</option>`).join('')}</select></div>
          <div class="ps-btns tight"><button type="button" class="ps-btn ghost" data-do="edit">${T('Save changes')}</button></div>
          <div class="ps-field"><label class="ps-lbl" for="psEow">${T('Hand to someone else')}</label><select id="psEow" class="ps-in" data-ff="eowner"><option value="">${h(TT('Choose'))}</option>${pickable().filter(p => p.id !== t.owner).sort(byRole).map(p => `<option value="${h(p.id)}" ${f.eowner === p.id ? 'selected' : ''}>${h(p.name)}</option>`).join('')}</select>
          <div class="ps-btns"><button type="button" class="ps-btn ghost" data-do="reassign" ${f.eowner ? '' : 'disabled'}>${T('Reassign')}</button><button type="button" class="ps-btn dark-red" data-do="cancel">${T(f.confirmCancel ? 'Yes, cancel it' : 'Cancel ticket')}</button></div></div>` : ''}`);
    }
    if(r.open || isOwner || isDel){
      panels += panel(T('Note'), `<textarea class="ps-in short" data-ff="comment" maxlength="600" aria-label="${h(TT('Add a note for the ticket'))}" placeholder="${h(TT('Add a note for the ticket'))}">${h(f.comment || '')}</textarea>
        <div class="ps-btns"><button type="button" class="ps-btn ghost" data-do="comment" ${(f.comment || '').trim() ? '' : 'disabled'}>${T('Add note')}</button></div>`);
    }
    const tl = t.timeline.slice().reverse().map(e => `<li><b>${h(first(e.by))}</b> ${eventVerb(e)}<span class="when">${h(fmtWhen(e.at))}</span>${eventText(e) ? `<span class="txt">${h(eventText(e))}</span>` : ''}</li>`).join('');
    return sheetFrame(h(num(t.number)), `<div class="ps-detail">${ticketHTML(t, { static: true, body })}</div>${panels}<div class="ps-sec"><h3>${T('History')}</h3></div><ol class="ps-timeline">${tl}</ol>`);
  }

  // Person (directors)
  function sheetPerson(){
    const p = person(S.sheet.arg), n = now(), st = E.personStats(S.tasks, p.id, n);
    const open = Object.values(S.tasks).filter(t => t.owner === p.id && E.OPEN.includes(t.status)).sort(byDue);
    const stat = (v, label) => `<div class="ps-stat"><b>${v}</b><span>${T(label)}</span></div>`;
    return sheetFrame(h(p.name), `<p class="ps-note">${roleText(p.role)}${p.area ? ', ' + T(p.area) : ''}</p>
      <div class="ps-statgrid">${stat(st.trust, 'Trust')}${stat(pct(st.onTimeRate), 'On time')}${stat(pct(st.eliteRate), 'Elite')}${stat(pct(st.firstPassRate), 'Right first time')}${stat(hrs(st.heardHours), 'Time to heard')}${stat(st.maxLevel || '–', 'Highest level')}</div>
      ${adviceHTML(st.advice, true)}
      ${st.given ? `<p class="ps-note">${V(`As a delegator: ${st.given} sent, ${st.awaitingVerify} waiting on their verify, closes the loop in ${hrs(st.verifyLagHours)} on average.`, 'As a delegator: N sent, M waiting, closes in X', st.given, st.awaitingVerify, hrs(st.verifyLagHours))}</p>` : ''}
      <div class="ps-btns"><button type="button" class="ps-btn ghost" data-eval="${h(p.id)}">${T('Copy eval summary')}</button></div>
      ${section('Open now', open, '', `<div class="ps-empty">${T('No open tickets.')}</div>`)}
      ${section('Recently closed', st.verified.slice(0, 6))}`);
  }
  function evalSummary(pid){
    const p = person(pid), st = E.personStats(S.tasks, pid, now());
    const elite = st.verified.filter(t => t.rating === 'elite').slice(0, 3).map(t => '  ' + t.title);
    const growth = st.verified.filter(t => !t.onTime || t.returns).slice(0, 3).map(t => `  ${t.title} (${[!t.onTime ? 'late' : '', t.returns ? 'redo ×' + t.returns : ''].filter(Boolean).join(', ')})`);
    return [`${p.name}: delegation record`, '',
      `Tickets closed: ${st.n}`, `On time: ${pct(st.onTimeRate)}`, `Elite: ${pct(st.eliteRate)}`, `Right first time: ${pct(st.firstPassRate)}`,
      `Median time to heard: ${hrs(st.heardHours)}`, `Trust score: ${st.trust}`,
      `Highest authority level used: ${st.maxLevel ? st.maxLevel + ' (' + LEVELS[st.maxLevel].name + ')' : 'none yet'}`,
      st.advice ? `Next step: ${st.advice.text}` : '', '',
      elite.length ? 'Elite work:\n' + elite.join('\n') : '', growth.length ? 'Growth areas:\n' + growth.join('\n') : ''].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n').trim();
  }

  // Open-ticket limits and areas (directors). Who's on the list is the PIN
  // list and the Directors list; someone who leaves keeps their history.
  function sheetRoster(){
    const f = S.sheet.form;
    if(!f.rows) f.rows = S.people.filter(p => p.role !== 'member').sort(byRole).map(p => ({ id: p.id, name: p.name, role: p.role, wip: p.wip || 4, area: p.area || '' }));
    return sheetFrame(T('Open-ticket limits'), `<p class="ps-note">${T('How many open tickets each person can carry before you’re warned, and the area they lead. Names come from the PIN list and the Directors list.')}</p>
      <div class="ps-roster">
        <div class="ps-rrow head"><span>${T('Name')}</span><span>${T('Area')}</span><span>${T('Limit')}</span></div>
        ${f.rows.map((p, i) => `<div class="ps-rrow">
          <span class="nm">${h(p.name)}<small>${roleText(p.role)}</small></span>
          <select class="ps-in" aria-label="${h(TT('Area'))}" data-row="${i}" data-k="area"><option value="">${h(TT('None'))}</option>${AREAS.map(a => `<option value="${h(a)}" ${p.area === a ? 'selected' : ''}>${h(TT(a))}</option>`).join('')}</select>
          <input class="ps-in" aria-label="${h(TT('Limit'))}" type="number" inputmode="numeric" min="1" max="20" data-row="${i}" data-k="wip" value="${h(p.wip)}">
        </div>`).join('')}
      </div>
      <div class="ps-btns"><button type="button" class="ps-btn red" data-save-roster>${T('Save')}</button></div>`);
  }

  /* ---------- what people do ---------- */
  function compressPhoto(file){
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, 1000 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        let q = 0.7, out = c.toDataURL('image/jpeg', q);
        while(out.length > 450000 && q > 0.3){ q -= 0.1; out = c.toDataURL('image/jpeg', q); }
        res(out);
      };
      img.onerror = () => rej(new Error(TT('That photo couldn’t be read. Try another.')));
      img.src = url;
    });
  }
  async function copy(text, msg){
    try { await navigator.clipboard.writeText(text); toast(msg); }
    catch(e){ openSheet('copy', text); }
  }
  const DONE_MSG = { backbrief: 'Heard. It’s yours.', counter: 'New time requested', counter_accept: 'New time accepted', counter_reject: 'Original time kept', checkin: 'Check-in sent', submit: 'Turned in', verify: 'Verified', return: 'Sent back to redo', edit: 'Changes saved', reassign: 'Reassigned', cancel: 'Ticket cancelled', comment: 'Note added' };

  async function onClick(ev){
    const el = ev.target.closest('button, [data-scrim]');
    if(!el) return;
    if(el.matches('[data-scrim]')){ if(ev.target === el) closeSheet(); return; }
    const d = el.dataset;
    if(d.es){ S.es = d.es === '1'; LS.set('es', S.es ? '1' : '0'); render(); return; }
    if(d.view){ S.view = d.view; LS.set('view', S.view); render(); S.root.scrollIntoView({ block: 'start' }); return; }
    if('signin' in d){ if(typeof siOpen === 'function') siOpen(); return; }
    if('retry' in d){ S.status = 'loading'; render(); refresh(true); return; }
    if(d.sheet) return openSheet(d.sheet);
    if('close' in d) return closeSheet();
    if(d.open) return openSheet('task', d.open);
    if(d.person) return openSheet('person', d.person);
    const f = S.sheet && S.sheet.form;
    if(!f) return;
    // Delegate
    if(d.fOwner){ f.owner = d.fOwner; const st = E.personStats(S.tasks, f.owner, now()); if(st.suggestedLevel && isDirector()) f.level = st.suggestedLevel; return renderSheet(); }
    if(d.fLevel){ f.level = +d.fLevel; return renderSheet(); }
    if(d.fCadence){ f.cadence = d.fCadence; return renderSheet(); }
    if(d.fPriority){ f.priority = d.fPriority; return renderSheet(); }
    if(d.quick){ f.due = quickDue(d.quick); return renderSheet(); }
    if(d.toggle === 'members'){ f.showMembers = true; return renderSheet(); }
    if('send' in d){
      if(!(f.due > now())) return toast(TT('Set a due time in the future.'), true);
      el.disabled = true;
      const ok = await act({ type: 'created', data: { title: f.title, outcome: f.outcome, intent: f.intent, owner: f.owner, due: f.due, level: f.level, cadence: f.cadence, priority: f.priority, area: f.area } }, VT(`Ticket sent to ${first(f.owner)}`, 'Ticket sent to X', first(f.owner)));
      if(ok){ S.view = 'wait'; LS.set('view', 'wait'); closeSheet(); render(); } else el.disabled = false;
      return;
    }
    // A ticket
    if(d.toggle === 'counter'){ f.showCounter = !f.showCounter; return renderSheet(); }
    if(d.toggle === 'edit'){ f.showEdit = !f.showEdit; return renderSheet(); }
    if(d.ffHealth){ f.health = d.ffHealth; return renderSheet(); }
    if(d.ffRating){ f.rating = d.ffRating; return renderSheet(); }
    if('nudge' in d){
      const t = S.tasks[S.sheet.arg], r = E.derive(t, now());
      const why = r.late ? `was due ${fmtWhen(t.due)}` : r.unheard ? 'is waiting for you to say it back' : 'has a check-in due';
      return copy(`${first(t.owner)}, ticket ${num(t.number)} "${t.title}" ${why}. Open the Tasks tab on the Ops Hub and update it when you can. Thanks!`, TT('Nudge copied'));
    }
    if(d.do){
      const t = S.tasks[S.sheet.arg];
      const data = {
        backbrief: { summary: f.summary, plan: f.plan },
        counter: { due: fromLocalInput(f.cdue || toLocalInput(t.due + DAY)), reason: f.creason },
        checkin: { health: f.health || 'on_track', note: f.note },
        submit: { evidence: f.evidence, photo: f.photo },
        verify: { rating: f.rating, feedback: f.feedback, aar: f.aar },
        return: { feedback: f.feedback },
        edit: { due: f.edue ? fromLocalInput(f.edue) : undefined, level: f.elevel ? +f.elevel : undefined, cadence: f.ecadence },
        reassign: { owner: f.eowner },
        comment: { text: f.comment },
      }[d.do] || {};
      if(d.do === 'cancel' && !f.confirmCancel){ f.confirmCancel = true; renderSheet(); return toast(TT('Tap Cancel ticket again to confirm.')); }
      if(d.do === 'counter' && !(data.due > now())) return toast(TT('Pick a time in the future.'), true);
      Object.keys(data).forEach(k => (data[k] === undefined || data[k] === null || data[k] === '') && delete data[k]);
      el.disabled = true;
      if(await act({ taskId: t.id, type: d.do, data }, TT(DONE_MSG[d.do]))){ S.sheet.form = {}; renderSheet(); } else el.disabled = false;
      return;
    }
    if(d.eval) return copy(evalSummary(d.eval), TT('Eval summary copied'));
    if('saveRoster' in d){
      el.disabled = true;
      try { const j = await call('/people', { method: 'PUT', body: { people: f.rows.map(r => ({ id: r.id, wip: +r.wip || 4, area: r.area })) } }); S.people = j.people; toast(TT('Saved')); closeSheet(); render(); }
      catch(err){ toast(err.message, true); el.disabled = false; }
    }
  }
  function onInput(ev){
    const el = ev.target, f = S.sheet && S.sheet.form;
    if(!f) return;
    if(el.dataset.f){ f[el.dataset.f] = el.dataset.f === 'due' ? fromLocalInput(el.value) : el.value; liveCompose(); }
    else if(el.dataset.ff){ f[el.dataset.ff] = el.value; liveTask(el); }
    else if(el.dataset.row){ f.rows[+el.dataset.row][el.dataset.k] = el.value; }
  }
  async function onChange(ev){
    const el = ev.target, f = S.sheet && S.sheet.form;
    if(!f) return;
    if(el.matches('select[data-f], input[type="datetime-local"][data-f], select[data-ff]')) renderSheet();
    if(el.dataset.row && el.tagName === 'SELECT') f.rows[+el.dataset.row][el.dataset.k] = el.value;
    if(el.matches('[data-photo]') && el.files[0]){ try { f.photo = await compressPhoto(el.files[0]); renderSheet(); } catch(err){ toast(err.message, true); } }
  }
  // The clarity bar and the send button follow typing without redrawing the inputs.
  function liveCompose(){
    const f = S.sheet.form, cl = E.clarity(f, now()), miss = cl.items.find(i => !i.ok);
    const m = S.layer.querySelector('.ps-clarity'); if(!m) return;
    m.querySelectorAll('.ps-meter i').forEach((i, k) => i.classList.toggle('on', cl.items[k].ok));
    m.querySelector('.msg').innerHTML = clarityMsg(cl, miss);
    m.querySelector('[data-send]').disabled = !(f.owner && (f.title || '').trim() && f.due);
  }
  function liveTask(el){
    const panel = el.closest('.ps-panel'); if(!panel) return;
    const f = S.sheet.form, btn = panel.querySelector('[data-do]'); if(!btn) return;
    const need = { backbrief: () => (f.summary || '').trim(), submit: () => (f.evidence || '').trim() || f.photo, return: () => (f.feedback || '').trim(), comment: () => (f.comment || '').trim(), checkin: () => (f.health || 'on_track') === 'on_track' || (f.note || '').trim() };
    const fn = need[btn.dataset.do]; if(fn) btn.disabled = !fn();
  }
  function wireLayer(node){
    node.addEventListener('click', onClick);
    node.addEventListener('input', onInput);
    node.addEventListener('change', onChange);
  }

  /* ---------- loading and keeping up ---------- */
  const tabOpen = () => { const v = document.getElementById('tasksView'); return !!(v && v.classList.contains('active')); };
  async function refresh(full){
    try { await load(full); }
    catch(err){
      if(err.status === 401){ S.status = 'signedout'; S.me = null; S.events = []; S.tasks = {}; closeSheet(); }
      else if(S.status !== 'ready'){ S.status = 'error'; S.error = err.message; }
      render(); return;
    }
    const typing = S.sheet && document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if(!typing) render();
  }
  function startPolling(){
    if(S.poll) return;
    S.poll = setInterval(() => { if(document.visibilityState === 'visible' && tabOpen() && S.status === 'ready') refresh(false); }, POLL_MS);
    document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible' && tabOpen()) refresh(false); });
  }
  // The Tasks tab opened (navigation.js activateView).
  function activate(){
    const root = document.getElementById('tasksView');
    if(!root) return;
    if(!S.mounted){
      S.root = root; S.mounted = true;
      root.addEventListener('click', onClick);
      document.addEventListener('keydown', ev => { if(ev.key === 'Escape' && S.sheet) closeSheet(); });
      render(); startPolling();
      refresh(true);
    } else refresh(S.status !== 'ready');
  }
  // Someone signed in or out (sign-in.js siRender): start over as them.
  // siRender runs on every identity check, so only a different person counts.
  function sync(){
    const id = typeof siIdentity !== 'undefined' ? siIdentity : {}, who = id.known ? `${id.name || ''}|${id.role || ''}` : null;
    if(who === null || who === S.who) return;
    const firstLook = S.who === undefined;
    S.who = who;
    if(firstLook && !S.mounted) return;           // the page's own first badge() covers it
    if(!S.mounted){ badge(); return; }
    S.status = 'loading'; S.events = []; S.tasks = {}; S.cursor = ''; S.sheet = null;
    renderSheet(false);
    if(tabOpen()){ render(); refresh(true); } else badge();
  }
  // The count on the Tasks tab without opening it: what's waiting on me.
  async function badge(){
    if(S.mounted && S.status === 'ready') return;
    try { const j = await call('/count'); syncBadge(j.count); } catch(e){ syncBadge(0); }
  }

  window.ThePass = { activate, sync, state: S };
  window.psActivate = activate;
  window.psSync = sync;
  if(document.getElementById('tasksTabBadge')){
    const later = typeof window.afterIdle === 'function' ? window.afterIdle : fn => setTimeout(fn, 1500);
    later(badge);
  }
})();
