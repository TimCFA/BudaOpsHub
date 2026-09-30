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

function suModeBarHtml(){
  const btn = (mode, label) => `<button type="button" class="su-mode-btn ${suMode === mode ? 'active' : ''}" aria-pressed="${suMode === mode}" data-su-mode="${mode}">${label}</button>`;
  return `
    <div class="su-modebar">
      <div class="su-mode" role="group" aria-label="View">${btn('sheet', 'Set up')}${btn('coach', 'Coach')}</div>
      <button type="button" class="su-print-btn" data-su-print="1" aria-label="Print today’s set up"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg><span>Print</span></button>
    </div>`;
}

// "Josh → Lauren @ 7:30", "Avah (from 11:30)", "Dan (leaves 6:00)".
function suSheetNameHtml(t, brk){
  // A needed spot is shown by its light red row alone (no wording).
  if(!t.names.length) return t.needed ? '' : '<span class="su-row-open">—</span>';
  const who = t.names.length > 1 && t.timeNote ? suDisplayName(t.names[0]) : t.names.map(suDisplayName).join(' → ');
  const lead = t.leaderRole ? `<span class="su-row-role" title="${escapeHtml(t.leaderRole)}">${t.leaderRole === 'Team Lead' ? 'TL' : 'T'}</span>` : '';
  const note = t.timeNote ? `<span class="su-row-note ${t.timeNote.warn ? 'is-warn' : ''}">${escapeHtml(t.timeNote.text)}</span>` : '';
  const flag = t.flagged ? '<span class="su-row-note is-warn">needs coverage</span>' : '';
  const brkNote = brk ? `<span class="su-row-note is-break" title="Planned 30-minute break">☕ ${suClock(brk)}</span>` : '';
  return `<span class="su-row-who">${escapeHtml(who)}${lead}</span>${note}${brkNote}${flag}`;
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
  const rows = shown.map(x => `
          <button type="button" class="su-row su-z-${suZoneKeyOf(section, x.slot)} ${x.needed ? 'is-needed' : ''} ${!x.names.length ? 'is-open' : ''}" data-su-tile="${escapeHtml(x.slot)}" aria-label="${escapeHtml(`#${x.rank} ${x.slot}: ${x.names.length ? x.names.join(' then ') : x.needed ? 'needed' : 'open'}`)}">
            <span class="su-row-slot"><span class="su-row-rank">${x.rank}</span>${escapeHtml(x.slot)}</span>
            <span class="su-row-name">${suSheetNameHtml(x, rowBreak(x))}</span>
          </button>`).join('');
  const zones = `
      <section class="su-sheet-zone su-sheet-list" aria-label="Positions in priority order">
        ${rows}
        ${hidden.length ? `<button type="button" class="su-zone-more" data-su-zone-more="all">+ ${hidden.length} more spot${hidden.length === 1 ? '' : 's'} if you have extra people</button>` : ''}
        ${showAll && m.headcount && upTo > Math.max(m.headcount, lastFilled) ? `<button type="button" class="su-zone-more" data-su-zone-less="all">Hide open extras</button>` : ''}
      </section>`;

  return `<div class="su-sheet-table">${zones}</div>`;
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
    <div class="su-person-actions" style="grid-template-columns:1fr 1fr 1fr">
      <button type="button" class="su-btn-line" data-su-change="${escapeHtml(slot)}">Change</button>
      <button type="button" class="su-btn-line" data-su-handoff="${escapeHtml(slot)}">Hand off</button>
      <button type="button" class="su-btn-line" data-su-unassign="${escapeHtml(slot)}">Clear</button>
    </div>
    <button type="button" class="su-sheet-coachlink" data-su-mode="coach" data-su-coach-slot="${escapeHtml(slot)}">See scores and Plan B in Coach →</button>`;
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
    const rows = m.tiles.filter(t => t.names.length || t.needed).map(t=>{
      const who = t.names.length ? (t.names.length > 1 && t.timeNote ? suDisplayName(t.names[0]) : t.names.map(suDisplayName).join(' → ')) : '';
      const note = t.timeNote ? ` ${t.timeNote.text}` : '';
      return `<tr><td>${escapeHtml(t.slot)}</td><td>${escapeHtml(who + note)}</td></tr>`;
    }).join('');
    if(!rows && !lead) return '';
    return `
      <section class="su-print-dp">
        <h2>${escapeHtml(dp.name)}</h2>
        ${lead ? `<div class="su-print-lead">Lead Captain: <b>${escapeHtml(suDisplayName(lead))}</b></div>` : ''}
        <table>${rows}</table>
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
