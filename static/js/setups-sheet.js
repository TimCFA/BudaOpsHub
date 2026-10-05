// ===== SET UPS: SHEET VIEW (TIM-45) =====
// The default Set Ups view reads like the Google Sheets set up: position →
// name, with arrival / departure / handoff notes and the Lead Captain — what
// a leader needs on the floor. Scores, tier colors, reasons and the coaching
// tools (Develop, Plan B, Evaluate) live behind the "Coach" switch, which
// shows the full board (setups-board.js). Fill and Print stay in reach.

const SU_MODE_KEY = 'cfaBudaSetupsMode';
let suMode = 'sheet';   // 'sheet' | 'coach'
try{ if(localStorage.getItem(SU_MODE_KEY) === 'coach') suMode = 'coach'; }catch(e){}

function suSetMode(mode){
  suMode = mode === 'coach' ? 'coach' : 'sheet';
  try{ localStorage.setItem(SU_MODE_KEY, suMode); }catch(e){}
  suSheet = null;
}

// Refresh: pull the latest set up and roster from the server (storage.js
// refreshSetups) and say whether anything changed, with the time checked.
let suRefresh = {busy: false, at: 0, text: ''};
const SU_ICON_REFRESH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/></svg>';

function suModeBarHtml(){
  const btn = (mode, label) => `<button type="button" class="su-mode-btn ${suMode === mode ? 'active' : ''}" aria-pressed="${suMode === mode}" data-su-mode="${mode}">${label}</button>`;
  const checked = suRefresh.at ? `<span class="su-refresh-note" role="status">${escapeHtml(suRefresh.text)} · ${escapeHtml(formatShortTime(suRefresh.at))}</span>` : '<span class="su-refresh-note" role="status"></span>';
  return `
    <div class="su-modebar">
      <div class="su-mode" role="group" aria-label="View">${btn('sheet', 'Set up')}${btn('coach', 'Coach')}</div>
      <div class="su-modebar-actions">
        ${checked}
        <button type="button" class="su-print-btn su-refresh-btn ${suRefresh.busy ? 'is-busy' : ''}" data-su-refresh="1" aria-label="Refresh the set up" ${suRefresh.busy ? 'disabled' : ''}>${SU_ICON_REFRESH}<span>${suRefresh.busy ? 'Checking' : 'Refresh'}</span></button>
        <button type="button" class="su-print-btn" data-su-print="1" aria-label="Print today’s set up"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg><span>Print</span></button>
      </div>
    </div>`;
}

// The set up's spots for one day, to count what a refresh changed.
function suDaySpots(date){
  const out = {};
  Object.keys(posAssignments).forEach(k => { if(k.split('||')[1] === date) out[k] = posAssignments[k]; });
  return out;
}

async function suRunRefresh(){
  if(suRefresh.busy) return;
  const date = document.getElementById('daySelect').value;
  const before = suDaySpots(date);
  suRefresh.busy = true;
  renderAllDayparts();
  let result = {ok: false, changed: false};
  try{ result = await refreshSetups(); }finally{ suRefresh.busy = false; }
  if(!result.ok){
    renderAllDayparts();
    showToast('Couldn’t reach the hub. Check the connection and try again.');
    return;
  }
  const after = suDaySpots(date);
  const moved = new Set([...Object.keys(before), ...Object.keys(after)].filter(k => before[k] !== after[k])).size;
  suRefresh.at = Date.now();
  suRefresh.text = moved ? `${moved} spot${moved === 1 ? '' : 's'} updated` : 'Up to date';
  if(result.changed) suNameMap = null;
  renderAllDayparts();
  showToast(moved ? `Set up refreshed: ${moved} spot${moved === 1 ? '' : 's'} changed` : result.changed ? 'Set up refreshed' : 'Your set up is up to date');
}

// "Josh → Lauren @ 7:30", "Avah (arrives 11:30)", "Dan (leaves 6:00)".
function suSheetNameHtml(t, brk){
  // A needed spot is shown by its light red row alone (no wording).
  if(!t.names.length) return t.needed ? '' : '<span class="su-row-open">—</span>';
  const who = t.names.length > 1 && t.timeNote ? suDisplayName(t.names[0]) : t.names.map(suDisplayName).join(' → ');
  const lead = t.leaderRole ? `<span class="su-row-role" title="${escapeHtml(t.leaderRole)}">${t.leaderRole === 'Team Lead' ? 'TL' : 'T'}</span>` : '';
  const note = t.timeNote ? `<span class="su-row-note ${t.timeNote.warn ? 'is-warn' : ''}">${escapeHtml(t.timeNote.text)}</span>` : '';
  const flag = t.flagged ? '<span class="su-row-note is-warn">needs coverage</span>' : '';
  const brkNote = brk ? `<span class="su-row-note is-break" title="Planned 30-minute break">☕ ${suClock(brk)}</span>` : '';
  return `<span class="su-row-who">${suTierDotHtml(t)}${escapeHtml(who)}${lead}</span>${note}${brkNote}${flag}`;
}

// PEA in the position they're placed in, as a dot before the name: green
// Crushing It, yellow On the Rise, red Not Yet, a hollow ring when they've
// never been rated there. Only where PEA ratings are loaded (a manager
// device); nothing for spots Levelset doesn't rate.
const SU_TIER_LABELS = {crushing: 'Crushing It', rise: 'On the Rise', notyet: 'Not Yet'};
function suTierDotHtml(t){
  if(!peaRatings.rows.length || !['crushing', 'rise', 'notyet', 'unrated'].includes(t.tier)) return '';
  const where = (t.positions || []).join(' / ');
  const title = t.tier === 'unrated' ? `Not rated${where ? ` on ${where}` : ''} yet`
    : `${SU_TIER_LABELS[t.tier]}${t.cell ? ` · ${t.cell.avg.toFixed(2)}` : ''}${where ? ` on ${where}` : ''}`;
  return `<span class="su-tier-dot is-${t.tier}" role="img" aria-label="${escapeHtml(title)}" title="${escapeHtml(title)}"></span>`;
}

function suTierKeyHtml(){
  if(!peaRatings.rows.length) return '';
  return `<div class="su-tier-key" aria-hidden="true"><span><i class="su-tier-dot is-crushing"></i>Crushing It</span><span><i class="su-tier-dot is-rise"></i>On the Rise</span><span><i class="su-tier-dot is-notyet"></i>Not Yet</span><span><i class="su-tier-dot is-unrated"></i>Not rated</span></div>`;
}

// The open daypart card's body in the Set up view: the positions, zone by
// zone, and nothing else. Lead Captain and Fill sit on the card's banner
// (setups-board.js suDaypartCardsHtml).
function suSheetViewHtml(section, date, dp, dpIndex, m){
  // A planned break that starts during this daypart, for the row's person.
  const {startMin, endMin} = daypartTimeWindow(suDaypartsFor(section), dpIndex);
  const rowBreak = x=>{
    for(const n of x.names){
      const b = breakFor(section, date, n);
      if(b && b.start !== null && b.start >= startMin && b.start < endMin) return b.start;
    }
    return null;
  };
  // One list in the set up's priority order (the Google Sheet's). Empty spots
  // past the headcount at the bottom fold away; nothing above a filled spot
  // is ever hidden, so a skipped spot always shows.
  const lastFilled = m.tiles.reduce((n, x) => x.names.length ? x.rank : n, 0);
  const showAll = suExpandedZones.has('all');
  const upTo = showAll || !m.headcount ? m.tiles.length : Math.max(m.headcount, lastFilled);
  const shown = m.tiles.slice(0, upTo), hidden = m.tiles.slice(upTo);
  // Each row: the spot (tap to assign or open its sheet) and a pencil for a
  // note. A spot with notes shows a comment marker instead; the notes
  // themselves stay hidden until it's tapped (the note sheet lists them).
  const rows = shown.map(x => {
    const notes = posNotesFor(m.key + '||' + x.slot);
    return `
          <div class="su-rowwrap ${notes.length ? 'has-notes' : ''}">
          <button type="button" class="su-row su-z-${suZoneKeyOf(section, x.slot)} ${x.needed ? 'is-needed' : ''} ${!x.names.length ? 'is-open' : ''}" data-su-tile="${escapeHtml(x.slot)}" aria-label="${escapeHtml(`#${x.rank} ${x.slot}: ${x.names.length ? x.names.join(' then ') : x.needed ? 'needed' : 'open'}`)}">
            <span class="su-row-slot"><span class="su-row-rank">${x.rank}</span>${escapeHtml(x.slot)}</span>
            <span class="su-row-name">${suSheetNameHtml(x, rowBreak(x))}</span>
          </button>
          <button type="button" class="su-row-notebtn ${notes.length ? 'has' : ''}" data-su-note="${escapeHtml(x.slot)}" aria-label="${escapeHtml(`${notes.length ? `Read ${notes.length} note${notes.length === 1 ? '' : 's'} on` : 'Add a note to'} ${x.slot}`)}" title="${notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'}` : 'Add a note'}">${notes.length ? SU_ICON_NOTE_MARK + (notes.length > 1 ? `<span class="su-row-notecount">${notes.length}</span>` : '') : SU_ICON_PENCIL}</button>
          </div>`;
  }).join('');
  const zones = `
      <section class="su-sheet-zone su-sheet-list" aria-label="Positions in priority order">
        ${rows}
        ${hidden.length ? `<button type="button" class="su-zone-more" data-su-zone-more="all">+ ${hidden.length} more spot${hidden.length === 1 ? '' : 's'} if you have extra people</button>` : ''}
        ${showAll && m.headcount && upTo > Math.max(m.headcount, lastFilled) ? `<button type="button" class="su-zone-more" data-su-zone-less="all">Hide open extras</button>` : ''}
        ${suResetsStripHtml(section, date, dp)}
      </section>`;

  return `<div class="su-sheet-table">${zones}</div>${suTierKeyHtml()}`;
}

const SU_ICON_PENCIL = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const SU_ICON_NOTE_MARK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v12H8l-4 4z"/></svg>';
const SU_ICON_GRIP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
const SU_ICON_NOTE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v12H8l-4 4z"/></svg>';

function suNoteStampHtml(n){
  const mine = n.by === getInitials();
  return `<span class="su-note-stamp ${mine ? 'is-mine' : ''}" title="${escapeHtml(`${n.by}, ${formatShortTime(n.ts)}`)}">${escapeHtml(n.by)} · ${escapeHtml(formatShortTime(n.ts))}</span>`;
}


// The Resets strip on a FOH card whose daypart carries a handoff (Lunch →
// Mid sits on the Transition card): every zone with its owners from the
// positions, a zone nobody owns in red with Pick. Tap a zone to hand it off.
// It's a drop-down, closed to start so it takes little room; the header
// still says how many zones nobody owns. Open or closed is remembered on the
// device.
const SU_RESETS_OPEN_KEY = 'cfaBudaResetsOpen';
let suResetsOpen = false;
try{ suResetsOpen = localStorage.getItem(SU_RESETS_OPEN_KEY) === '1'; }catch(e){}
function suToggleResets(){
  suResetsOpen = !suResetsOpen;
  try{ localStorage.setItem(SU_RESETS_OPEN_KEY, suResetsOpen ? '1' : '0'); }catch(e){}
}
function suResetsStripHtml(section, date, dp){
  if(section !== 'foh') return '';
  const handoff = zrHandoffForDaypart(dp.name);
  if(!handoff) return '';
  const {title} = zrHandoffParts(handoff.name);
  const rows = ALL_ZONE_NAMES.map(zone => {
    const o = zrZoneOwners(date, handoff.name, zone);
    const none = !o.all.length;
    const names = o.all.slice(0, 2).map(suDisplayName).map(escapeHtml).join(', ') + (o.all.length > 2 ? ` +${o.all.length - 2}` : '');
    return `<button type="button" class="su-reset ${none ? 'is-none' : ''}" data-su-reset="${escapeHtml(zone)}">
        <span class="su-reset-icon">${ZONE_ICONS[zone] || ''}</span>
        <span class="su-reset-zone">${escapeHtml(zone)}</span>
        ${none ? '<span class="su-reset-pick">+ Pick</span>' : `<span class="su-reset-who">${names}${o.added.length ? '<i>handed off</i>' : ''}</span>`}
      </button>`;
  }).join('');
  const unowned = zrUnownedZones(date, handoff.name).length;
  const open = suResetsOpen;
  return `
      <section class="su-resets ${open ? 'is-open' : ''}" aria-label="Zone resets">
        <button type="button" class="su-resets-head" data-su-resets-toggle="1" aria-expanded="${open}">
          <h3>Resets</h3><span>${escapeHtml(title)} handoff</span>${unowned ? `<em>${unowned} unowned</em>` : '<em class="is-ok">all owned</em>'}
          <span class="su-resets-chev" aria-hidden="true">▾</span>
        </button>
        ${open ? `<div class="su-resets-body">${rows}</div>` : ''}
      </section>`;
}

// The note sheet for a spot: the notes so far (yours can be removed), and a
// new one signed with your initials and the time. No initials, no note.
let suNoteDraft = {key: '', text: ''};
function suNoteSheetHtml(section, date, dp, m, slot){
  const t = m.tiles.find(x => x.slot === slot);
  const key = m.key + '||' + slot;
  const notes = posNotesFor(key);
  const ini = getInitials();
  const draft = suNoteDraft.key === key ? suNoteDraft.text : '';
  const list = notes.length ? `<div class="su-notes">${notes.map((n, i) => `<div class="su-notes-item"><div>${escapeHtml(n.text)}<div class="su-notes-meta">${suNoteStampHtml(n)} today</div></div>${n.by === ini ? `<button type="button" class="su-notes-rm" data-su-note-rm="${i}">Remove</button>` : ''}</div>`).join('')}</div>` : '<p class="su-notes-empty">No notes on this spot yet.</p>';
  const who = t && t.names.length ? t.names.map(suDisplayName).join(' → ') : 'Open';
  const body = `
    <div class="su-notes-who">${escapeHtml(suShortDaypart(dp.name))} · ${escapeHtml(who)}</div>
    ${list}
    <textarea id="suNoteText" class="su-notes-text" rows="3" maxlength="500" placeholder="Something the next person needs to know">${escapeHtml(draft)}</textarea>
    <div class="su-notes-sign">${ini ? `Signed <b>${escapeHtml(ini)}</b> at ${escapeHtml(formatShortTime(Date.now()))}` : 'Set your initials (top right) to sign a note'}</div>
    <div class="su-person-actions">
      <button type="button" class="su-btn-line" data-su-close-sheet="1">Cancel</button>
      ${ini ? `<button type="button" class="su-btn-dark" data-su-note-save="1">Add note</button>` : `<button type="button" class="su-btn-dark" data-su-note-initials="1">Set initials</button>`}
    </div>`;
  return suSheetFrame(`Note · ${slot}`, body);
}

// A filled row in the sheet view: who, when, and the quick actions — no
// scores (those are in Coach).
function suRowSheetHtml(section, date, dp, m, slot){
  const t = m.tiles.find(x => x.slot === slot);
  if(!t || !t.names.length) return '';
  const lines = t.names.map(n=>{
    const p = suTimingFor(m.timing, n);
    const when = p ? `${suClock(p.from)}–${suClock(p.to)}` : '';
    const role = suLeaderRole(section, date, n, peaStrengthByPerson());
    return `<div class="su-pb-row"><span class="su-pb-v"><b>${escapeHtml(n)}</b><span>${escapeHtml([when && `here ${when}`, role].filter(Boolean).join(' · ') || 'on the roster')}</span></span></div>`;
  }).join('');
  const body = `
    <div class="su-pb">${lines}</div>
    <div class="su-person-actions" style="grid-template-columns:1fr 1fr 1fr 1fr">
      <button type="button" class="su-btn-line" data-su-change="${escapeHtml(slot)}">Change</button>
      <button type="button" class="su-btn-line" data-su-handoff="${escapeHtml(slot)}">Hand off</button>
      <button type="button" class="su-btn-line" data-su-note="${escapeHtml(slot)}">Note</button>
      <button type="button" class="su-btn-line" data-su-unassign="${escapeHtml(slot)}">Clear</button>
    </div>
    <button type="button" class="su-sheet-coachlink" data-su-mode="coach" data-su-coach-slot="${escapeHtml(slot)}">See scores and Plan B in Coach →</button>
    <p class="su-drag-tip">${SU_ICON_GRIP}Hold a name and drag it to another spot to move, or onto someone to trade.</p>`;
  return suSheetFrame(`${slot} · #${t.rank}`, body);
}

// ----- Print: every daypart of the day, like the Google Sheet -----

function suPrintHtml(section, date){
  const dayparts = suDaypartsFor(section);
  const posMap = section === 'foh' ? fohPositions : bohPositions;
  const d = new Date(date + 'T00:00:00');
  const title = `${section === 'foh' ? 'FOH' : 'BOH'} Set Up · ${d.toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'})}`;
  suNameMap = null;
  const blocks = dayparts.map((dp, i)=>{
    const m = suDaypartModel(section, date, dp, i);
    const lead = section === 'foh' ? posAssignments[m.key + '||' + SU_LEAD_CAPTAIN] : '';
    const rows = m.tiles.filter(t => t.names.length || t.needed || posNotesFor(m.key + '||' + t.slot).length).map(t=>{
      const who = t.names.length ? (t.names.length > 1 && t.timeNote ? suDisplayName(t.names[0]) : t.names.map(suDisplayName).join(' → ')) : '';
      const note = t.timeNote ? ` ${t.timeNote.text}` : '';
      const notes = posNotesFor(m.key + '||' + t.slot).map(n => `<div class="su-print-note">${escapeHtml(n.text)} <i>${escapeHtml(n.by)} ${escapeHtml(formatShortTime(n.ts))}</i></div>`).join('');
      return `<tr><td>${escapeHtml(t.slot)}</td><td>${escapeHtml(who + note)}${notes}</td></tr>`;
    }).join('');
    const handoff = section === 'foh' ? zrHandoffForDaypart(dp.name) : null;
    const resets = handoff ? ALL_ZONE_NAMES.map(z => { const o = zrZoneOwners(date, handoff.name, z); return `<tr><td>${escapeHtml(z)}</td><td>${o.all.length ? escapeHtml(o.all.map(suDisplayName).join(', ')) : '<i>no one yet</i>'}</td></tr>`; }).join('') : '';
    if(!rows && !lead) return '';
    return `
      <section class="su-print-dp">
        <h2>${escapeHtml(dp.name)}</h2>
        ${lead ? `<div class="su-print-lead">Lead Captain: <b>${escapeHtml(suDisplayName(lead))}</b></div>` : ''}
        <table>${rows}</table>
        ${resets ? `<h3 class="su-print-sub">Resets · ${escapeHtml(zrHandoffParts(handoff.name).title)}</h3><table>${resets}</table>` : ''}
      </section>`;
  }).join('');
  breakPlanReset();
  const plan = breakPlanFor(section, date);
  const brRows = plan.breaks.map(b => `<tr><td>${b.start !== null ? `${suClock(b.start)}–${suClock(b.end)}` : '—'}</td><td>${escapeHtml(suDisplayName(b.name))}${b.start === null ? ' (no time fits)' : ''}</td></tr>`).join('');
  const breaksBlock = plan.breaks.length ? `<section class="su-print-dp"><h2>Breaks (30 min)</h2><table>${brRows}</table></section>` : '';
  return `<h1>${escapeHtml(title)}</h1><div class="su-print-grid">${blocks || '<p>No positions placed yet.</p>'}${breaksBlock}</div>`;
}

function suPrint(){
  const date = document.getElementById('daySelect').value;
  if(!date) return;
  let root = document.getElementById('suPrintRoot');
  if(!root){
    root = document.createElement('div');
    root.id = 'suPrintRoot';
    document.body.appendChild(root);
  }
  root.innerHTML = suPrintHtml(currentPosSection, date);
  document.body.classList.add('su-printing');
  const done = () => { document.body.classList.remove('su-printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1000);
}

document.getElementById('allDayparts').addEventListener('click', e=>{
  const mode = e.target.closest('[data-su-mode]');
  if(mode){
    e.stopPropagation();
    const slot = mode.dataset.suCoachSlot;
    suSetMode(mode.dataset.suMode);
    if(slot) suSheet = {kind: 'person', slot};
    renderAllDayparts();
    return;
  }
  if(e.target.closest('[data-su-print]')){ e.stopPropagation(); suPrint(); return; }
  if(e.target.closest('[data-su-refresh]')){ e.stopPropagation(); suRunRefresh(); return; }
  const clear = e.target.closest('[data-su-unassign]');
  if(clear){
    e.stopPropagation();
    const date = document.getElementById('daySelect').value;
    const {dp} = suCurrentDaypart(currentPosSection, date);
    const k = suEvalKey(currentPosSection, date, dp.name) + '||' + clear.dataset.suUnassign;
    delete posAssignments[k];
    delete posVacancyFlags[k];
    suSheet = null;
    renderAllDayparts();
    showToast('Spot cleared');
    saveState();
  }
}, true);
