// Directors' Week (Tim, Nov 18 2026), on the Calendar tab beside the store's
// calendar: how a director plans to spend the week, mirrored from the Google
// calendar they share with the hub, and the team's requests for their time.
// The server keeps the rules (week_api.py): what each block shows, which
// slots are open, who may answer. This draws what it sends.
//
// The team sees: Open door blocks as 30-minute slots to ask for, PEA and
// Floor support windows by name, everything else as "Busy". A slot someone
// asked for says "Booked", never who. Booking closes at midnight: tomorrow
// is the first day, and a same-shift gap is a call or text.
// A director sees, on top: the requests waiting on them (accept / decline),
// their calendar's connection, and the switch that shows the page to the
// team. Until it's on, only directors see any of this.
// FOH-style English only (Tim hasn't asked for Spanish here).
(function(){
  const TZ = 'America/Chicago';
  const S = {data: null, page: 'store', director: '', week: -1, pending: 0, layer: null, sheet: null, busy: false, loadedAt: 0};
  const h = s => escapeHtml(String(s == null ? '' : s));
  const I = {
    x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  };

  /* ---------- time ---------- */
  const fmt = (ms, opt) => new Date(ms).toLocaleString('en-US', Object.assign({timeZone: TZ}, opt));
  const clock = ms => fmt(ms, {hour: 'numeric', minute: '2-digit'}).replace(':00', '').replace(' ', '').toLowerCase();
  const span = (a, b) => `${clock(a)} – ${clock(b)}`;
  const dayName = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'long', month: 'short', day: 'numeric'});
  const dayShort = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
  const slotText = ms => `${fmt(ms, {weekday: 'short', month: 'short', day: 'numeric'})}, ${clock(ms)}`;
  function daysBetween(from, to){
    const out = [], d = new Date(from + 'T12:00:00');
    for(let i = 0; i < 21 && toLocalISODate(d) <= to; i++){ out.push(toLocalISODate(d)); d.setDate(d.getDate() + 1); }
    return out;
  }

  /* ---------- talking to the server ---------- */
  async function api(method, url, body){
    const res = await fetch((typeof API_BASE === 'string' ? API_BASE : '') + url, {method, credentials: 'same-origin', cache: 'no-store',
      headers: body ? {'Content-Type': 'application/json'} : undefined, body: body ? JSON.stringify(body) : undefined});
    const d = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(d.error || 'That didn’t go through. Try again.');
    return d;
  }
  async function load(){
    try {
      S.data = await api('GET', '/api/week/state');
      S.loadedAt = Date.now();
      S.pending = (S.data.inbox || []).filter(r => r.status === 'pending').length;
    } catch(e){ S.data = S.data || null; }
    if(S.data && !S.data.directors.some(d => d.id === S.director)){
      const me = S.data.me && S.data.directors.find(d => d.id === S.data.me.id);
      S.director = (me || S.data.directors[0] || {}).id || '';
    }
    // Saturday or Sunday: nothing left to ask for this week, so open on the next.
    if(S.data && S.week < 0) S.week = S.data.bookFrom >= addDays(S.data.weekStart, 6) ? 1 : 0;
    render();
    syncBadge();
  }
  // What's waiting on a director, for the tab's badge and the Right Now card
  // (the server answers 0 for anyone else).
  async function badge(){
    try { S.pending = (await api('GET', '/api/week/count')).count || 0; } catch(e){ return; }
    syncBadge();
  }
  function syncBadge(){
    ['weekTabBadge', 'dwSegBadge'].forEach(id => {
      const b = document.getElementById(id);
      if(b){ b.hidden = !S.pending; b.textContent = S.pending || ''; }
    });
    const home = document.getElementById('homeView');
    if(home && home.classList.contains('active') && typeof renderRightNow === 'function') renderRightNow();
  }

  /* ---------- the page ---------- */
  function hasPage(){
    return !!(S.data && (S.data.directors.length || S.data.setup));
  }
  function showPage(page){
    S.page = page === 'week' && hasPage() ? 'week' : 'store';
    const sw = document.getElementById('dwSwitch'), store = document.getElementById('calendarRoot'), week = document.getElementById('weekRoot');
    if(!sw || !store || !week) return;
    sw.hidden = !hasPage();
    sw.querySelectorAll('[data-dw-page]').forEach(b => {
      const on = b.dataset.dwPage === S.page;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    store.hidden = S.page !== 'store';
    week.hidden = S.page !== 'week';
  }
  function render(){
    showPage(S.page);
    const root = document.getElementById('weekRoot');
    if(!root || S.page !== 'week' || !S.data) return;
    const D = S.data, dir = D.directors.find(d => d.id === S.director);
    const mine = D.me && dir && dir.id === D.me.id;
    root.innerHTML = `
      <header class="dw-head">
        <h2 class="dw-title">Directors’ Week</h2>
        ${D.directors.length > 1 ? `<div class="dw-who" role="tablist" aria-label="Director">${D.directors.map(d =>
          `<button type="button" class="dw-who-btn${d.id === S.director ? ' is-on' : ''}" role="tab" aria-selected="${d.id === S.director}" data-dw-director="${h(d.id)}">${h(firstName(d.name))}</button>`).join('')}</div>` : ''}
      </header>
      ${D.setup ? setupHtml() : ''}
      ${inboxHtml()}
      ${dir ? `
        <p class="dw-lede">${mine ? 'Your week, as you see it. The team sees Lunch peak, Focus, Admin and Weekly review only as “Busy”.' : `How ${h(firstName(dir.name))} plans to spend the week. Tap an open slot to ask for it.`}</p>
        <p class="dw-urgent">${I.phone}<span><b>Short this shift? Call or text.</b> Requests here are for tomorrow and later; today is already set.</span></p>
        ${mine ? '' : `<button type="button" class="dw-ask" data-dw-ask>${I.plus}Request ${h(firstName(dir.name))}’s time</button>`}
        ${dir.stale ? '<p class="dw-stale">Google Calendar isn’t answering right now, so this may be a few minutes old.</p>' : ''}
        ${weekHtml(dir, mine)}` : (D.setup ? '' : '<p class="dw-empty">No director has shared a week yet.</p>')}
      ${mineHtml()}`;
  }
  function firstName(n){ return String(n || '').trim().split(/\s+/)[0] || 'Director'; }

  // The week as a calendar: days across, hours down, every block where it
  // sits in the day. An Open door block is its 30-minute slots, each one a
  // button; the red line is now.
  const hm = ms => { const [a, b] = new Date(ms).toLocaleTimeString('en-GB', {timeZone: TZ, hour: '2-digit', minute: '2-digit'}).split(':'); return (+a % 24) * 60 + +b; };
  const at = (top, len) => `top:calc(${top} * var(--dw-m));height:calc(${len} * var(--dw-m))`;
  function addDays(iso, n){ const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return toLocalISODate(d); }
  function weekDays(dir){
    const D = S.data, start = addDays(D.weekStart, 7 * S.week), byDay = {};
    dir.days.forEach(d => { byDay[d.date] = d.blocks; });
    const days = [0, 1, 2, 3, 4, 5, 6].map(i => ({date: addDays(start, i), blocks: byDay[addDays(start, i)] || []}));
    if(!days[6].blocks.length) days.pop();            // closed Sunday: a column only if something is on it
    return days;
  }
  function weekHtml(dir, mine){
    const D = S.data, days = weekDays(dir), all = dir.days.flatMap(d => d.blocks);
    const from = Math.min(8 * 60, ...all.map(b => hm(b.start))), to = Math.max(17 * 60, ...all.map(b => hm(b.end) || 1440));
    const h0 = Math.floor(from / 60), h1 = Math.ceil(to / 60), hours = [];
    for(let x = h0; x <= h1; x++) hours.push(x);
    const open = days.flatMap(d => d.blocks).flatMap(b => b.slots || []).filter(x => x.state === 'open').length;
    const now = hm(Date.now());
    const hour = x => (x % 12 || 12) + (x < 12 || x === 24 ? 'a' : 'p');
    return `
      <div class="dw-bar">
        <div class="dw-weeks" role="tablist" aria-label="Week">${['This week', 'Next week'].map((w, i) =>
          `<button type="button" class="dw-week-btn${S.week === i ? ' is-on' : ''}" role="tab" aria-selected="${S.week === i}" data-dw-week="${i}">${w}</button>`).join('')}</div>
        <p class="dw-stat"><b>${open}</b> open slot${open === 1 ? '' : 's'}<span> · ${h(dayShort(days[0].date).replace(/^\w+, /, ''))} – ${h(dayShort(days[days.length - 1].date).replace(/^\w+, /, ''))}</span></p>
      </div>
      <div class="dw-grid" style="--dw-days:${days.length};--dw-mins:${(h1 - h0) * 60}">
        <div class="dw-g-head"><span></span>${days.map(d => {
          const dt = new Date(d.date + 'T12:00:00');
          return `<div class="dw-g-day${d.date === D.today ? ' is-today' : d.date < D.today ? ' is-past' : ''}"><small>${dt.toLocaleDateString('en-US', {weekday: 'short'})}</small><b>${dt.getDate()}</b></div>`;
        }).join('')}</div>
        <div class="dw-g-body">
          <div class="dw-g-times" aria-hidden="true">${hours.map(x => `<span style="top:calc(${(x - h0) * 60} * var(--dw-m))">${hour(x)}</span>`).join('')}</div>
          ${days.map(d => `<div class="dw-g-col${d.date === D.today ? ' is-today' : d.date < D.today ? ' is-past' : ''}" role="group" aria-label="${h(dayName(d.date))}">
            ${d.blocks.map(b => blockHtml(b, h0 * 60, mine)).join('')}
            ${d.date === D.today && now >= h0 * 60 && now <= h1 * 60 ? `<i class="dw-now" style="top:calc(${now - h0 * 60} * var(--dw-m))"></i>` : ''}
          </div>`).join('')}
        </div>
      </div>
      <p class="dw-legend"><span><i class="dw-k t-open"></i>Open door: tap a slot to ask for it</span><span><i class="dw-k is-booked"></i>Booked</span><span><i class="dw-k t-pea"></i>PEA window</span><span><i class="dw-k t-support"></i>Floor support window</span>${mine
        ? '<span><i class="dw-k t-peak"></i>Lunch peak</span><span><i class="dw-k t-focus"></i>Focus</span><span><i class="dw-k t-admin"></i>Admin</span><span><i class="dw-k t-review"></i>Weekly review</span><span class="dw-legend-note">The team sees those four as Busy.</span>'
        : '<span><i class="dw-k is-busy"></i>Busy</span>'}</p>`;
  }
  function blockHtml(b, base, mine){
    if(b.show !== 'book'){
      const len = Math.max(15, (b.end - b.start) / 60000);
      return `<div class="dw-b is-${h(b.show)} t-${h(b.type)}${len < 45 ? ' is-short' : ''}" style="${at(hm(b.start) - base, len)}" title="${h(b.label + ', ' + span(b.start, b.end))}"><b>${h(b.label)}</b><small>${span(b.start, b.end)}</small></div>`;
    }
    return b.slots.map(s => {
      const open = s.state === 'open' && !mine;
      const label = s.state === 'booked' ? 'Booked' : s.state === 'mine' ? 'Yours' : s.state === 'open' ? (b.group ? 'Group' : 'Open') : 'Open door';
      return `<button type="button" class="dw-slot is-${h(s.state)}" style="top:calc(${hm(s.at) - base} * var(--dw-m));height:calc(${S.data.slotMinutes} * var(--dw-m) - 2px)" ${open ? `data-dw-slot="${s.at}"` : 'disabled'} aria-label="${h(slotText(s.at) + ', ' + (s.state === 'closed' ? 'closed' : label))}"><b>${clock(s.at).replace(/[ap]m$/, '')}</b><small>${label}</small></button>`;
    }).join('');
  }

  /* ---------- requests ---------- */
  function typeOf(id){ return (S.data.requestTypes || []).find(t => t.id === id) || {label: 'Request'}; }
  function whenOf(r){
    if(r.slot) return slotText(r.slot);
    if(r.when) return slotText(r.when);
    if(r.day) return `${dayShort(r.day)}, ${String(r.daypart).replace(/\s*\(.*\)$/, '')}`;
    return '';
  }
  const STATUS = {pending: 'Waiting', accepted: 'Accepted', declined: 'Declined', cancelled: 'Cancelled', lost: 'Slot was taken'};
  function reqLine(r, forDirector){
    const t = typeOf(r.type), when = whenOf(r);
    return `<div class="dw-req is-${h(r.status)}">
      <div class="dw-req-top"><b>${forDirector ? h(r.byName) + ' · ' : ''}${h(t.label)}${r.about ? ' · ' + h(r.about) : ''}</b><span class="dw-pill is-${h(r.status)}">${h(STATUS[r.status] || r.status)}</span></div>
      <div class="dw-req-sub">${forDirector ? '' : h(firstName(r.directorName)) + (when ? ' · ' : '')}${h(when)}</div>
      ${r.note ? `<p class="dw-req-note">${h(r.note)}</p>` : ''}
      ${r.reply ? `<p class="dw-req-reply"><b>${forDirector ? 'You' : h(firstName(r.directorName))}:</b> ${h(r.reply)}</p>` : ''}
      ${forDirector && r.status === 'pending' ? `<div class="dw-req-btns"><button type="button" class="dw-btn is-red" data-dw-answer="accept" data-id="${h(r.id)}">Accept</button><button type="button" class="dw-btn" data-dw-answer="decline" data-id="${h(r.id)}">Decline</button></div>` : ''}
      ${!forDirector && ['pending', 'accepted'].includes(r.status) ? `<div class="dw-req-btns"><button type="button" class="dw-btn" data-dw-cancel="${h(r.id)}">Cancel request</button></div>` : ''}
    </div>`;
  }
  function inboxHtml(){
    const D = S.data;
    if(!D.me || !D.me.director) return '';
    const waiting = D.inbox.filter(r => r.status === 'pending');
    const ahead = D.inbox.filter(r => r.status === 'accepted' && (r.slot || r.when || 0) > Date.now() - 3600000 || r.status === 'accepted' && r.day >= D.today);
    if(!waiting.length && !ahead.length && !D.setup.connected) return '';
    return `<section class="dw-card" aria-label="Requests for your time">
      <h3 class="dw-card-h">Waiting on you${waiting.length ? `<span class="dw-n">${waiting.length}</span>` : ''}</h3>
      ${waiting.length ? waiting.map(r => reqLine(r, true)).join('') : '<p class="dw-none">No requests waiting.</p>'}
      ${ahead.length ? `<details class="dw-more"><summary>Accepted and coming up (${ahead.length})</summary>${ahead.map(r => reqLine(r, true)).join('')}</details>` : ''}
    </section>`;
  }
  function mineHtml(){
    const list = (S.data.mine || []).filter(r => r.status === 'pending' || Date.now() - (r.decidedAt || r.at) < 14 * 86400000);
    if(!list.length) return '';
    return `<section class="dw-card" aria-label="Your requests"><h3 class="dw-card-h">Your requests</h3>${list.map(r => reqLine(r, false)).join('')}</section>`;
  }

  /* ---------- a director's own settings ---------- */
  function setupHtml(){
    const D = S.data, su = D.setup;
    const steps = `<ol class="dw-steps">
        <li>In Google Calendar, open your work calendar’s <b>Settings and sharing</b>. Use a calendar that holds only work blocks, never your main personal one.</li>
        <li>Under <b>Share with specific people or groups</b>, add this address with <b>Make changes to events</b>:<br><code class="dw-code">${h(su.robot || 'the hub’s address isn’t set up on the server yet')}</code></li>
        <li>Under <b>Integrate calendar</b>, copy the <b>Calendar ID</b> (it ends in @group.calendar.google.com) and paste it here.</li>
      </ol>
      <div class="dw-connect"><input type="text" id="dwCalId" class="dw-in" inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="…@group.calendar.google.com" aria-label="Calendar ID"><button type="button" class="dw-btn is-red" data-dw-connect>Connect</button></div>`;
    return `<section class="dw-card dw-setup" aria-label="Your Directors’ Week settings">
      <h3 class="dw-card-h">Your settings <small>only you and the other directors see this card</small></h3>
      ${su.connected
        ? `<p class="dw-ok">Your Google calendar is connected. The hub reads it every few minutes.</p>
           <details class="dw-more"><summary>How blocks show to the team</summary><ul class="dw-key">${su.blockTypes.map(t =>
             `<li><b>${h(t.label)}</b> ${t.show === 'book' ? 'bookable in 30-minute slots' : t.show === 'named' ? 'shown by name' : 'shows as Busy'}</li>`).join('')}
             <li>Anything else shows as Busy. A block is told by its title; add “group” to an Open door title to let more than one person book it.</li></ul>
             <button type="button" class="dw-btn" data-dw-disconnect>Disconnect my calendar</button></details>`
        : `<p class="dw-lede">Connect the Google calendar you plan your week in. Until you do, you have no page.</p>${steps}`}
      <div class="dw-live">
        <div><b>${D.live ? 'The team can see Directors’ Week.' : 'Not shown to the team yet.'}</b><small>${D.live ? 'Everyone signed in sees it and can ask for time.' : 'Only directors see it until you turn it on.'}</small></div>
        <button type="button" class="dw-btn${D.live ? '' : ' is-red'}" data-dw-live="${D.live ? '0' : '1'}">${D.live ? 'Hide from the team' : 'Show it to the team'}</button>
      </div>
    </section>`;
  }

  /* ---------- the request sheet ---------- */
  function openSheet(form){
    if(!S.data.me || S.data.me.id === 'director'){
      showToast('Sign in with your own PIN to ask for a director’s time.');
      if(typeof siOpen === 'function') siOpen();
      return;
    }
    S.sheet = Object.assign({type: 'open', slot: 0, about: '', day: '', daypart: '', note: '', error: ''}, form);
    drawSheet(true);
  }
  function closeSheet(){ S.sheet = null; drawSheet(false); }
  function openSlots(dir){
    const out = [];
    dir.days.forEach(d => d.blocks.forEach(b => (b.slots || []).forEach(s => { if(s.state === 'open') out.push(s.at); })));
    return out;
  }
  function sheetHtml(){
    const D = S.data, f = S.sheet, dir = D.directors.find(d => d.id === S.director), t = typeOf(f.type);
    const answer = f.answer;
    if(answer){
      const r = D.inbox.find(x => x.id === answer.id) || {};
      const talk = r.type === 'talk' && answer.action === 'accept';
      return `<div class="ps-sheet" role="dialog" aria-modal="true" aria-labelledby="dwSheetTitle"><div class="ps-grab"></div>
        <div class="ps-sheethead"><h2 id="dwSheetTitle">${answer.action === 'accept' ? 'Accept' : 'Decline'}</h2><button type="button" class="ps-close" data-dw-close aria-label="Close">${I.x}</button></div>
        <p class="dw-sheet-sum"><b>${h(r.byName)}</b> · ${h(typeOf(r.type).label)}${whenOf(r) ? ' · ' + h(whenOf(r)) : ''}</p>
        ${answer.action === 'accept' && (r.slot || talk) ? `<p class="dw-sheet-hint">${r.slot ? 'This goes on your Google calendar.' : 'Pick a time and it goes on your Google calendar, or leave it blank and say when in the note.'}</p>` : ''}
        ${talk ? `<label class="dw-f"><span>When (30 minutes)</span><input type="datetime-local" class="dw-in" id="dwWhen" step="900" value="${h(f.when || '')}"></label>` : ''}
        <label class="dw-f"><span>${answer.action === 'accept' ? 'A note back (optional)' : 'Why, or another time that works'}</span><textarea class="dw-in" id="dwNote" rows="3" maxlength="500">${h(f.note)}</textarea></label>
        ${f.error ? `<p class="dw-err" role="alert">${h(f.error)}</p>` : ''}
        <div class="dw-sheet-btns"><button type="button" class="dw-btn is-red is-big" data-dw-send ${S.busy ? 'disabled' : ''}>${S.busy ? 'Sending…' : answer.action === 'accept' ? 'Accept' : 'Decline'}</button></div>
      </div>`;
    }
    const slots = openSlots(dir), days = daysBetween(D.bookFrom, D.bookTo);
    let fields = '';
    if(t.needs === 'slot'){
      fields = slots.length ? `<label class="dw-f"><span>Slot (30 minutes)</span><select class="dw-in" id="dwSlot">${slots.map(s => `<option value="${s}"${+f.slot === s ? ' selected' : ''}>${h(slotText(s))}</option>`).join('')}</select></label>
        <div class="dw-f"><span>What it’s for</span><div class="dw-chips">${(t.about || []).map(a => `<button type="button" class="dw-chip${f.about === a ? ' is-on' : ''}" data-dw-about="${h(a)}" aria-pressed="${f.about === a}">${h(a)}</button>`).join('')}</div></div>`
        : `<p class="dw-none">No open slots in the next two weeks. Try “Need to talk”.</p>`;
    } else if(t.needs === 'daypart'){
      fields = `<label class="dw-f"><span>Day</span><select class="dw-in" id="dwDay">${days.map(d => `<option value="${d}"${f.day === d ? ' selected' : ''}>${h(dayName(d))}</option>`).join('')}</select></label>
        <label class="dw-f"><span>Daypart</span><select class="dw-in" id="dwDaypart">${D.dayparts.map(d => `<option${f.daypart === d ? ' selected' : ''}>${h(d)}</option>`).join('')}</select></label>`;
    }
    const cant = t.needs === 'slot' && !slots.length;
    return `<div class="ps-sheet" role="dialog" aria-modal="true" aria-labelledby="dwSheetTitle"><div class="ps-grab"></div>
      <div class="ps-sheethead"><h2 id="dwSheetTitle">Request ${h(firstName(dir.name))}’s time</h2><button type="button" class="ps-close" data-dw-close aria-label="Close">${I.x}</button></div>
      <p class="dw-urgent">${I.phone}<span><b>Short this shift? Call or text.</b> This is for tomorrow and later.</span></p>
      <div class="dw-types" role="radiogroup" aria-label="What you need">${D.requestTypes.map(x =>
        `<button type="button" class="dw-type${x.id === f.type ? ' is-on' : ''}" role="radio" aria-checked="${x.id === f.type}" data-dw-type="${h(x.id)}">${h(x.label)}</button>`).join('')}</div>
      <p class="dw-sheet-hint">${h(t.hint || '')}</p>
      ${fields}
      ${cant ? '' : `<label class="dw-f"><span>${t.needs === 'slot' || t.id === 'pea' ? 'Anything to add (optional)' : 'What you need'}</span><textarea class="dw-in" id="dwNote" rows="3" maxlength="500">${h(f.note)}</textarea></label>`}
      ${f.error ? `<p class="dw-err" role="alert">${h(f.error)}</p>` : ''}
      ${cant ? '' : `<div class="dw-sheet-btns"><button type="button" class="dw-btn is-red is-big" data-dw-send ${S.busy ? 'disabled' : ''}>${S.busy ? 'Sending…' : 'Send request'}</button></div>
      <p class="dw-sheet-foot">${h(firstName(dir.name))} accepts or declines. You’ll see the answer here under “Your requests”.</p>`}
    </div>`;
  }
  function keepForm(){
    const f = S.sheet, v = id => { const el = document.getElementById(id); return el ? el.value : undefined; };
    if(!f) return;
    ['note:dwNote', 'slot:dwSlot', 'day:dwDay', 'daypart:dwDaypart', 'when:dwWhen'].forEach(p => {
      const [k, id] = p.split(':'), val = v(id);
      if(val !== undefined) f[k] = val;
    });
  }
  function drawSheet(first){
    if(!S.layer){
      S.layer = document.createElement('div');
      S.layer.className = 'ps-layer dw-layer';
      document.body.appendChild(S.layer);
      S.layer.addEventListener('click', onSheetClick);
    }
    document.body.classList.toggle('ps-sheet-open', !!S.sheet);
    if(!S.sheet){ S.layer.innerHTML = ''; return; }
    const html = sheetHtml();
    S.layer.innerHTML = `<div class="ps-scrim" data-dw-scrim>${first ? html.replace('class="ps-sheet"', 'class="ps-sheet anim"') : html}</div>`;
    if(first){ const x = S.layer.querySelector('.ps-close'); if(x) x.focus({preventScroll: true}); }
  }
  async function send(){
    keepForm();
    const f = S.sheet;
    if(!f || S.busy) return;
    S.busy = true; f.error = ''; drawSheet(false);
    try {
      if(f.answer){
        const body = {note: f.note};
        if(f.when) body.when = new Date(f.when).getTime();
        await api('POST', `/api/week/requests/${encodeURIComponent(f.answer.id)}/${f.answer.action}`, body);
        showToast(f.answer.action === 'accept' ? 'Accepted.' : 'Declined.');
      } else {
        const t = typeOf(f.type), body = {type: f.type, director: S.director, note: f.note};
        if(t.needs === 'slot'){ body.slot = +f.slot || openSlots(S.data.directors.find(d => d.id === S.director))[0]; body.about = f.about; }
        if(t.needs === 'daypart'){ body.day = f.day || S.data.bookFrom; body.daypart = f.daypart || S.data.dayparts[0]; }
        await api('POST', '/api/week/requests', body);
        showToast('Request sent.');
      }
      S.busy = false;
      closeSheet();
      await load();
    } catch(e){
      S.busy = false;
      if(S.sheet){ S.sheet.error = e.message; drawSheet(false); }
      load();
    }
  }
  function onSheetClick(e){
    const t = e.target;
    if(t.closest('[data-dw-close]') || t.matches('[data-dw-scrim]')){ closeSheet(); return; }
    const type = t.closest('[data-dw-type]');
    if(type){ keepForm(); S.sheet.type = type.dataset.dwType; S.sheet.error = ''; drawSheet(false); return; }
    const about = t.closest('[data-dw-about]');
    if(about){ keepForm(); S.sheet.about = S.sheet.about === about.dataset.dwAbout ? '' : about.dataset.dwAbout; drawSheet(false); return; }
    if(t.closest('[data-dw-send]')) send();
  }
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && S.sheet) closeSheet(); });

  /* ---------- taps on the page ---------- */
  async function act(fn, done){
    if(S.busy) return;
    S.busy = true;
    try { await fn(); if(done) showToast(done); } catch(e){ showToast(e.message); }
    S.busy = false;
    await load();
  }
  document.addEventListener('click', e => {
    const t = e.target && e.target.closest ? e.target : null;
    if(!t) return;
    const seg = t.closest('[data-dw-page]');
    if(seg){ showPage(seg.dataset.dwPage); if(S.page === 'week'){ render(); if(Date.now() - S.loadedAt > 30000) load(); } return; }
    if(!t.closest('#weekRoot')) return;
    const wk = t.closest('[data-dw-week]');
    if(wk){ S.week = +wk.dataset.dwWeek; render(); return; }
    const who = t.closest('[data-dw-director]');
    if(who){ S.director = who.dataset.dwDirector; render(); return; }
    const slot = t.closest('[data-dw-slot]');
    if(slot){ openSheet({type: 'open', slot: +slot.dataset.dwSlot}); return; }
    if(t.closest('[data-dw-ask]')){ openSheet({}); return; }
    const answer = t.closest('[data-dw-answer]');
    if(answer){ S.sheet = {answer: {id: answer.dataset.id, action: answer.dataset.dwAnswer}, note: '', when: '', error: ''}; drawSheet(true); return; }
    const cancel = t.closest('[data-dw-cancel]');
    if(cancel){ if(confirm('Cancel this request?')) act(() => api('POST', `/api/week/requests/${encodeURIComponent(cancel.dataset.dwCancel)}/cancel`, {}), 'Request cancelled.'); return; }
    if(t.closest('[data-dw-connect]')){
      const id = (document.getElementById('dwCalId') || {}).value || '';
      act(() => api('PUT', '/api/week/calendar', {calendarId: id.trim()}), 'Calendar connected.');
      return;
    }
    if(t.closest('[data-dw-disconnect]')){ if(confirm('Disconnect your calendar? Your page goes away until you connect again.')) act(() => api('DELETE', '/api/week/calendar'), 'Calendar disconnected.'); return; }
    const live = t.closest('[data-dw-live]');
    if(live){
      const on = live.dataset.dwLive === '1';
      if(!on || confirm('Show Directors’ Week to the whole team? Everyone signed in will see it and can ask for time.')) act(() => api('PUT', '/api/week/live', {live: on}), on ? 'The team can see it now.' : 'Hidden from the team.');
    }
  });

  /* ---------- the hub's side ---------- */
  // Calendar tab opened (navigation.js): read the week; the store's calendar
  // stays the page it opens on unless Directors' Week was asked for.
  window.dwActivate = function(){ if(Date.now() - S.loadedAt > 30000) load(); else render(); };
  // Right Now's "requests waiting on you" row (right-now.js) opens this.
  window.dwShow = function(){
    if(typeof launchShowTab === 'function') launchShowTab('calendar');
    S.page = 'week';
    load();
    window.scrollTo({top: 0});
  };
  window.dwPendingCount = () => S.pending;
  if(document.getElementById('weekRoot')){
    const later = typeof window.afterIdle === 'function' ? window.afterIdle : fn => setTimeout(fn, 1500);
    later(badge);
    setInterval(() => { if(!document.hidden) badge(); }, 5 * 60 * 1000);
  }
})();
