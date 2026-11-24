// ===== OFF THE ROSTER: WHY SOMEONE CAME OFF (Tim, Nov 24 2026) =====
// "Instead of just clicking the X on their roster card, it'd be nice to have
// an option to specify why they're being removed and have it documented."
//
// The X on a roster card opens a sheet: why they're coming off (one tap from
// the reasons below), a note if it helps, and one red button. The roster
// changes the way it always has (removeFromRoster: off the day and out of
// its spots, saved with the rest of Set Ups); the record of who, why, when
// and which leader goes to the server (roster_off_api.py), kept for good.
//
// Team Leads and up see, under the day's roster, who came off it and why,
// with Put back for a mistake, and "Look back" for the last weeks: each
// person's call-ins and no-shows and every record by day. A director's Our
// Team profile carries the person's own count. Nothing here shows to Team
// Members, Trainers or a device nobody signed in on.
//
// Reliable on a phone in the store: a record is kept on the device first and
// sent from there (ro outbox), again after lost signal or a reload, each with
// its own id so the server never keeps it twice. Someone taken off a day
// stays off it when the schedule is imported again (weekly-roster-import.js
// asks roKeptOff). The kitchen's side carries its Spanish from the glossary.

const RO_REASONS = [
  ['callin', 'Called in', 'warn'],
  ['noshow', 'No call, no show', 'bad'],
  ['senthome', 'Sent home', 'off'],
  ['leftearly', 'Left early', 'warn'],
  ['swap', 'Shift swap or change', 'off'],
  ['mistake', 'Added by mistake', 'off'],
  ['other', 'Something else', 'off']
];
const RO_ATTENDANCE = ['callin', 'noshow', 'leftearly', 'senthome'];
const RO_OUTBOX_KEY = 'cfaBudaRosterOffOutbox';
const RO_STALE_MS = 60 * 1000;
const RO_LOG_RANGES = [7, 30, 90];

const RO_ICONS = {
  callin: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  noshow: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  senthome: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  leftearly: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  swap: '<path d="M17 3l4 4-4 4"/><path d="M3 7h18"/><path d="M7 21l-4-4 4-4"/><path d="M21 17H3"/>',
  mistake: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  other: '<path d="M4 4h16v12H8l-4 4z"/>'
};
function roIcon(reason, size){
  return `<svg width="${size || 20}" height="${size || 20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${RO_ICONS[reason] || RO_ICONS.other}</svg>`;
}
function roReason(id){ return RO_REASONS.find(r => r[0] === id) || RO_REASONS[RO_REASONS.length - 1]; }

// Spanish on the kitchen's side only (FOH stays English; the theme hides .es there too).
function roBoh(side){ return (side || currentPosSection) === 'boh'; }
function roEs(en, side, inline){ return roBoh(side) && typeof esLine === 'function' ? (inline ? esHtml(en) : esLine(en)) : ''; }

function roIsLead(){ return typeof siLeadOrUp === 'function' && siLeadOrUp(); }
function roKey(name){ return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' '); }
function roSame(a, b){ return roKey(a) === roKey(b) || (typeof rnSame === 'function' && rnSame(a, b)); }
function roCid(){ return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function roClock(ms){
  const d = new Date(ms);
  let h = d.getHours(); const m = d.getMinutes();
  const ap = h >= 12 ? 'p' : 'a';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')}${ap}`;
}
function roShortDate(iso){
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
}

// ----- what the server has, and what this phone hasn't sent yet --------------
const roDays = {};          // date -> {at, records}
const roAsking = {};        // date range -> promise
let roOutbox = [];
try{ roOutbox = JSON.parse(localStorage.getItem(RO_OUTBOX_KEY) || '[]'); if(!Array.isArray(roOutbox)) roOutbox = []; }catch(e){ roOutbox = []; }
function roOutboxSave(){ try{ localStorage.setItem(RO_OUTBOX_KEY, JSON.stringify(roOutbox)); }catch(e){} }

function roFetchRange(from, to, extra){
  const key = `${from}|${to}|${extra || ''}`;
  if(roAsking[key]) return roAsking[key];
  const q = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${extra || ''}`;
  roAsking[key] = fetch(`${API_BASE}/api/roster-off?${q}`, {credentials: 'same-origin'})
    .then(r => r.ok ? r.json() : null)
    .catch(() => null)
    .finally(() => { delete roAsking[key]; });
  return roAsking[key];
}

// The days from..to, kept by day. Resolves within `timeoutMs` (if given)
// either way, so an import never waits on a slow server.
function roLoadRange(from, to, timeoutMs){
  if(!roIsLead()) return Promise.resolve(false);
  const ask = roFetchRange(from, to).then(d => {
    if(!d || !Array.isArray(d.records)) return false;
    const at = Date.now();
    for(let iso = from; iso <= to; iso = isoAddDays(iso, 1)) roDays[iso] = {at, records: []};
    d.records.forEach(r => { if(roDays[r.date]) roDays[r.date].records.push(r); });
    return true;
  });
  if(!timeoutMs) return ask;
  return Promise.race([ask, new Promise(res => setTimeout(() => res(false), timeoutMs))]);
}

function roLoadDay(date){
  const had = JSON.stringify((roDays[date] || {}).records || null);
  roLoadRange(date, date).then(ok => {
    if(!ok || JSON.stringify(roDays[date].records) === had) return;
    if(document.getElementById('daySelect') && document.getElementById('daySelect').value === date && typeof renderRoster === 'function') renderRoster();
  });
}

// The day's records as this phone sees them: the server's, plus what it
// hasn't sent yet, less what was put back.
function roRecordsFor(date, side){
  const server = (roDays[date] || {}).records || [];
  const out = server.filter(r => !roOutbox.some(o => o.type === 'undo' && (o.data.of === r.id || (r.cid && o.data.of === r.cid))));
  roOutbox.forEach(o => {
    if(o.type !== 'off' || o.data.date !== date) return;
    if(out.some(r => r.cid === o.cid)) return;
    if(roOutbox.some(u => u.type === 'undo' && u.data.of === o.cid)) return;
    out.push({...o.data, cid: o.cid, at: o.at, by: o.by, pending: true});
  });
  return out.filter(r => !side || r.side === side).sort((a, b) => (b.at || 0) - (a.at || 0));
}

// Kept off that day when the schedule comes in again.
function roKeptOff(date, side, name){
  return roRecordsFor(date, side).some(r => roSame(r.name, name));
}

// ----- sending, kept on the phone until the server has it ---------------------
let roFlushing = false, roRetry = null, roRetryMs = 5000;
async function roFlush(){
  if(roFlushing || !roOutbox.length) return;
  roFlushing = true;
  try{
    while(roOutbox.length){
      const o = roOutbox[0];
      let res = null;
      try{
        res = await fetch(`${API_BASE}/api/roster-off/events`, {method: 'POST', credentials: 'same-origin',
          headers: {'Content-Type': 'application/json'}, body: JSON.stringify({type: o.type, cid: o.cid, data: o.data})});
      }catch(e){ res = null; }
      if(res && res.ok){
        roOutbox.shift();
        roOutboxSave();
        if(o.data && o.data.date) delete roDays[o.data.date];   // read again with the server's id
        roRetryMs = 5000;
        continue;
      }
      // Refused for good (not a leader any more, a bad record): dropped, so
      // the rest can go. Lost signal, a restart or a sign-in that lapsed: kept.
      if(res && res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 408 && res.status !== 429){
        console.warn('[roster off] not kept:', res.status);
        roOutbox.shift();
        roOutboxSave();
        continue;
      }
      clearTimeout(roRetry);
      roRetry = setTimeout(roFlush, roRetryMs);
      roRetryMs = Math.min(roRetryMs * 2, 5 * 60 * 1000);
      break;
    }
  } finally {
    roFlushing = false;
  }
}
window.addEventListener('online', () => { roRetryMs = 5000; roFlush(); });
setTimeout(roFlush, 3000);

function roQueue(type, data, cid){
  const o = {type, cid: cid || roCid(), data, at: Date.now(), by: typeof getInitials === 'function' ? getInitials() : ''};
  roOutbox.push(o);
  roOutboxSave();
  roFlush();
  return o;
}

// ----- the sheet: why they're coming off ---------------------------------------
let roSheet = null;          // {name, date, side, person, reason, note, busy}

function roEnsureModal(id){
  let el = document.getElementById(id);
  if(!el){
    el = document.createElement('div');
    el.className = 'overlay ro-overlay';
    el.id = id;
    el.innerHTML = '<div class="sheet ro-sheet" role="dialog" aria-modal="true"></div>';
    el.addEventListener('click', e => { if(e.target === el) roClose(id); });
    document.body.appendChild(el);
  }
  return el;
}
function roClose(id){
  const el = document.getElementById(id);
  if(el) el.classList.remove('active');
  if(id === 'rosterOffModal') roSheet = null;
}

function roOpen(name){
  const date = document.getElementById('daySelect').value;
  if(!date) return;
  const side = currentPosSection;
  const person = ((side === 'foh' ? fohRoster : bohRoster)[date] || []).find(p => p.name === name) || {name};
  roSheet = {name, date, side, person, reason: '', note: '', busy: false};
  const el = roEnsureModal('rosterOffModal');
  roDrawSheet();
  el.classList.add('active');
}

function roDrawSheet(){
  const el = document.getElementById('rosterOffModal');
  if(!el || !roSheet) return;
  const s = roSheet, side = s.side;
  const when = [formatVerboseDate(s.date), side === 'foh' ? 'FOH' : 'BOH', typeof rosterTimeText === 'function' ? rosterTimeText(s.person) : ''].filter(Boolean).join(' · ');
  const needNote = s.reason === 'other';
  const ready = s.reason && (!needNote || s.note.trim());
  el.querySelector('.sheet').innerHTML = `
    <div class="ro-head">
      <span class="ro-initials" aria-hidden="true">${escapeHtml(typeof rnInitials === 'function' ? rnInitials(s.name) : s.name.charAt(0))}</span>
      <div>
        <h2 class="ro-title">${escapeHtml(s.name)}</h2>
        <div class="ro-when">${escapeHtml(when)}</div>
      </div>
    </div>
    <div class="ro-eyebrow">Why are they coming off?${roEs('Why are they coming off?', side)}</div>
    <div class="ro-reasons" role="radiogroup" aria-label="Why">
      ${RO_REASONS.map(([id, label, tone]) => `<button type="button" class="ro-reason is-${tone} ${s.reason === id ? 'is-on' : ''} ${id === 'other' ? 'is-wide' : ''}" role="radio" aria-checked="${s.reason === id}" data-ro-reason="${id}">
        <span class="ro-reason-icon">${roIcon(id)}</span><span class="ro-reason-label">${escapeHtml(label)}${roEs(label, side)}</span></button>`).join('')}
    </div>
    <label class="ro-note-label" for="roNote">${needNote ? 'Say what happened' : 'A note, if it helps'}${roEs(needNote ? 'Say what happened' : 'A note, if it helps', side)}</label>
    <textarea id="roNote" class="ro-note" rows="2" maxlength="300" placeholder="No medical details">${escapeHtml(s.note)}</textarea>
    <p class="ro-hint">Kept for Team Leads and directors. No medical details.${roEs('Kept for Team Leads and directors. No medical details.', side)}</p>
    <button type="button" class="btn btn-primary ro-go" data-ro-go ${ready && !s.busy ? '' : 'disabled'}>Take off the roster${roEs('Take off the roster', side)}</button>
    <button type="button" class="btn btn-ghost" data-ro-cancel>Cancel${roEs('Cancel', side)}</button>`;
}

document.addEventListener('click', e => {
  if(!e.target.closest('#rosterOffModal')) return;
  const r = e.target.closest('[data-ro-reason]');
  if(r && roSheet){
    roSheet.reason = r.dataset.roReason;
    roSheet.note = (document.getElementById('roNote') || {}).value || roSheet.note;
    roDrawSheet();
    if(roSheet.reason === 'other') document.getElementById('roNote').focus();
    return;
  }
  if(e.target.closest('[data-ro-cancel]')) return roClose('rosterOffModal');
  if(e.target.closest('[data-ro-go]')) return roTakeOff();
});
document.addEventListener('input', e => {
  if(e.target.id !== 'roNote' || !roSheet) return;
  roSheet.note = e.target.value;
  const go = document.querySelector('#rosterOffModal [data-ro-go]');
  if(go) go.disabled = !roSheet.reason || (roSheet.reason === 'other' && !roSheet.note.trim()) || roSheet.busy;
});

async function roTakeOff(){
  const s = roSheet;
  if(!s || s.busy || !s.reason) return;
  if(s.reason === 'other' && !s.note.trim()){ showToast('Say why in the note.'); return; }
  if(typeof siMayChange === 'function' && !siMayChange('fohRoster')){ roClose('rosterOffModal'); siOpen(siWhy(['fohRoster'])); return; }
  s.busy = true;
  roDrawSheet();
  const p = s.person || {name: s.name};
  const entry = {};
  ['name', 'start', 'end', 'source', 'leader', 'training', 'addedBy', 'addedAt', 'offList', 'blocks'].forEach(k => { if(p[k] !== undefined) entry[k] = p[k]; });
  // The record first, on the phone, so it can't be lost if the save stumbles.
  roQueue('off', {date: s.date, side: s.side, name: s.name, reason: s.reason, note: s.note.trim(), start: p.start || '', end: p.end || '', entry});
  roClose('rosterOffModal');
  await removeFromRoster(s.name, s.reason);
  showToast(`${s.name} is off the roster · ${roReason(s.reason)[1]}`);
}

// ----- under the day's roster: who came off and why ---------------------------
function roOffHtml(date, side){
  if(!roIsLead() || !date) return '';
  const day = roDays[date];
  if(!day || Date.now() - day.at > RO_STALE_MS) roLoadDay(date);
  const recs = roRecordsFor(date, side);
  const head = `<div class="ro-off-head">
      <span class="ro-eyebrow">Off the roster${recs.length ? ` · ${recs.length}` : ''}${roEs('Off the roster', side)}</span>
      <button type="button" class="ro-link" data-ro-log>Look back${roEs('Look back', side)}</button>
    </div>`;
  if(!recs.length) return `<section class="ro-off is-empty" aria-label="Off the roster">${head}</section>`;
  return `<section class="ro-off" aria-label="Off the roster">${head}
    ${recs.map(r => roRowHtml(r, side, true)).join('')}
  </section>`;
}

function roRowHtml(r, side, canPutBack){
  const [id, label, tone] = roReason(r.reason);
  const by = r.by ? `${r.by} · ` : '';
  const when = r.at ? roClock(r.at) : '';
  const shift = r.start && r.end ? `${r.start}–${r.end}` : '';
  const ref = escapeHtml(r.id || r.cid || '');
  return `<div class="ro-row">
      <span class="ro-initials is-sm" aria-hidden="true">${escapeHtml(typeof rnInitials === 'function' ? rnInitials(r.name) : '')}</span>
      <div class="ro-row-main">
        <div class="ro-row-name">${escapeHtml(r.name)}${canPutBack ? '' : (shift ? ` <span class="ro-row-shift">${escapeHtml(shift)}</span>` : '')}</div>
        <span class="ro-chip is-${tone}">${roIcon(id, 13)}${escapeHtml(label)}${roEs(label, side, true)}</span>
        ${r.note ? `<div class="ro-row-note">${escapeHtml(r.note)}</div>` : ''}
        <div class="ro-row-by">${escapeHtml(by + when)}${r.pending ? ' · sending…' : ''}</div>
      </div>
      ${canPutBack && ref ? `<button type="button" class="ro-back" data-ro-back="${ref}">Put back${roEs('Put back', side)}</button>` : ''}
    </div>`;
}

// Clicks inside the roster card (daypicker-and-positions.js hands them on).
function roRosterClick(e){
  const back = e.target.closest('[data-ro-back]');
  if(back) return roPutBack(back.dataset.roBack);
  if(e.target.closest('[data-ro-log]')) return roLogOpen();
}

async function roPutBack(ref){
  const date = document.getElementById('daySelect').value;
  const r = roRecordsFor(date).find(x => x.id === ref || x.cid === ref);
  if(!r) return;
  if(typeof siMayChange === 'function' && !siMayChange('fohRoster')){ siOpen(siWhy(['fohRoster'])); return; }
  const roster = r.side === 'foh' ? fohRoster : bohRoster;
  if(!roster[date]) roster[date] = [];
  if(!roster[date].some(p => roSame(p.name, r.name))){
    const entry = {...(r.entry || {}), name: r.name};
    if(!entry.start && r.start) entry.start = r.start;
    if(!entry.end && r.end) entry.end = r.end;
    roster[date].push(entry);
  }
  // A record not sent yet just leaves the phone's list; one the server has is taken back.
  const queued = roOutbox.findIndex(o => o.type === 'off' && o.cid === ref);
  if(queued !== -1 && !roFlushing){ roOutbox.splice(queued, 1); roOutboxSave(); }
  else roQueue('undo', {of: ref});
  if(roDays[date]) roDays[date].records = roDays[date].records.filter(x => x.id !== ref && x.cid !== ref);
  touchLastUpdated(date);
  await saveState();
  renderRoster();
  renderAllDayparts();
  showToast(`${r.name} is back on the roster. Place them again if they had a spot.`);
}

// ----- Look back: the last weeks, by person and by day ---------------------------
let roLog = {days: 30, name: '', data: null, loading: false, failed: false};

function roLogOpen(name){
  roLog = {days: name ? 90 : 30, name: name || '', data: null, loading: false, failed: false};
  roEnsureModal('rosterOffLogModal').classList.add('active');
  roLogLoad();
}

async function roLogLoad(){
  roLog.loading = true; roLog.failed = false;
  roLogDraw();
  const from = isoAddDays(today, -roLog.days + 1);
  const want = `${roLog.days}|${roLog.name}`;
  const d = await roFetchRange(from, isoAddDays(today, 14), roLog.name ? `&name=${encodeURIComponent(roLog.name)}` : '');
  if(`${roLog.days}|${roLog.name}` !== want) return;      // moved on while it loaded
  roLog.loading = false;
  roLog.data = d && Array.isArray(d.records) ? d : null;
  roLog.failed = !roLog.data;
  roLogDraw();
}

function roCountsLine(counts){
  return RO_REASONS.filter(([id]) => RO_ATTENDANCE.includes(id) && counts[id])
    .map(([id, label]) => `${counts[id]} ${label.toLowerCase()}`).join(' · ');
}

function roLogDraw(){
  const el = document.getElementById('rosterOffLogModal');
  if(!el) return;
  const side = currentPosSection;
  const d = roLog.data;
  const pending = roOutbox.filter(o => o.type === 'off').length;
  const people = d ? d.people.filter(p => p.attendance > 0) : [];
  const byDay = {};
  (d ? d.records : []).forEach(r => { (byDay[r.date] = byDay[r.date] || []).push(r); });
  el.querySelector('.sheet').innerHTML = `
    <div class="ro-log-head">
      <h2 class="ro-title">${roLog.name ? escapeHtml(roLog.name) : `Off the roster${roEs('Off the roster', side)}`}</h2>
      <button type="button" class="ro-link" data-ro-log-close>Close${roEs('Close', side)}</button>
    </div>
    <div class="su-roster-filter ro-range" role="group" aria-label="How far back">
      ${RO_LOG_RANGES.map(n => `<button type="button" class="su-roster-filter-btn ${roLog.days === n ? 'active' : ''}" aria-pressed="${roLog.days === n}" data-ro-days="${n}">${n} days</button>`).join('')}
    </div>
    ${roLog.name ? `<button type="button" class="ro-link ro-everyone" data-ro-who="">← Everyone${roEs('Everyone', side)}</button>` : ''}
    ${pending ? `<p class="ro-hint">${pending} not sent yet from this phone; they send themselves.</p>` : ''}
    ${roLog.loading ? '<p class="ro-hint">Loading…</p>' : roLog.failed ? '<p class="ro-hint">Couldn’t reach the server. Try again in a moment.</p>' : `
      ${!roLog.name && people.length ? `<div class="ro-eyebrow">Call-ins and no-shows${roEs('Call-ins and no-shows', side)}</div>
        <div class="ro-people">${people.map(p => `<button type="button" class="ro-person" data-ro-who="${escapeHtml(p.name)}">
          <span class="ro-initials is-sm" aria-hidden="true">${escapeHtml(typeof rnInitials === 'function' ? rnInitials(p.name) : '')}</span>
          <span class="ro-person-main"><b>${escapeHtml(p.name)}</b><span>${escapeHtml(roCountsLine(p.counts))}</span></span>
          <span class="ro-person-n">${p.attendance}</span></button>`).join('')}</div>` : ''}
      ${roLog.name && d && d.people[0] ? `<p class="ro-person-sum">${escapeHtml(roCountsLine(d.people[0].counts) || 'No call-ins or no-shows')} in the last ${roLog.days} days</p>` : ''}
      ${Object.keys(byDay).length ? Object.keys(byDay).sort().reverse().map(iso => `
        <div class="ro-day"><div class="ro-eyebrow">${escapeHtml(roShortDate(iso))}</div>
          ${byDay[iso].map(r => roRowHtml({...r, by: `${r.side === 'foh' ? 'FOH' : 'BOH'} · ${r.by || ''}`}, side, false)).join('')}</div>`).join('')
        : `<p class="ro-hint">Nobody came off the roster in these days.${roEs('Nobody came off the roster in these days.', side)}</p>`}`}`;
}

document.addEventListener('click', e => {
  if(!e.target.closest('#rosterOffLogModal')) return;
  if(e.target.closest('[data-ro-log-close]')) return roClose('rosterOffLogModal');
  const days = e.target.closest('[data-ro-days]');
  if(days){ roLog.days = Number(days.dataset.roDays) || 30; return roLogLoad(); }
  const who = e.target.closest('[data-ro-who]');
  if(who){ roLog.name = who.dataset.roWho; if(roLog.name && roLog.days < 90) roLog.days = 90; return roLogLoad(); }
});

// ----- Our Team: a person's own count (headcount.js profile) -----------------------
// A spot in the profile, filled in place when the answer comes, so nothing
// being typed in the profile is drawn over.
const roPerson = {};         // name key -> {at, html}
function roPersonHtml(name){
  if(!roIsLead() || !name) return '';
  const k = roKey(name);
  const got = roPerson[k];
  if(!got || Date.now() - got.at > 5 * RO_STALE_MS){
    roPerson[k] = {at: Date.now(), html: got ? got.html : ''};
    roFetchRange(isoAddDays(today, -89), isoAddDays(today, 14), `&name=${encodeURIComponent(name)}`).then(d => {
      if(!d || !Array.isArray(d.records)) return;
      const p = d.people[0];
      const line = p ? roCountsLine(p.counts) : '';
      const html = `Off the roster, last 90 days: ${escapeHtml(line || (d.records.length ? 'no call-ins or no-shows' : 'none'))}${d.records.length ? ` <button type="button" class="ld-link" data-ro-person="${escapeHtml(name)}">See them</button>` : ''}`;
      roPerson[k] = {at: Date.now(), html};
      document.querySelectorAll('[data-ro-hc]').forEach(el => { if(roKey(el.dataset.roHc) === k) el.innerHTML = html; });
    });
  }
  return `<p class="hc-note ro-hc" data-ro-hc="${escapeHtml(name)}">${roPerson[k].html}</p>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ro-person]');
  if(b) roLogOpen(b.dataset.roPerson);
});

// Loaded with the late scripts (Home and Set Ups draw first): the roster
// already on screen gets its Off the roster list now.
try{
  const day = document.getElementById('daySelect');
  if(roIsLead() && day && day.value && typeof renderRoster === 'function') renderRoster();
}catch(e){ /* drawn on the next change */ }
