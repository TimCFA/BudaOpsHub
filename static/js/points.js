// ===== ACCOUNTABILITY POINTS (TIM-70, phase 1) =====
// Tim's "Buda Accountability Points" artifact, brought into the hub as a
// view in Directors (behind the PIN): the daily punch report in, attendance
// events out, a leader's call on the ones that need it, and the quarter's
// scoreboard with each team member's ladder step.
//
//   Upload     the Actual vs. Scheduled PDF, read in the browser with pdf.js.
//              Tardies and late breaks count as they come; absences, extended
//              shifts and work with no scheduled shift wait for a leader.
//              An event already recorded (same id) is skipped, so reports
//              can overlap.
//   Review     what happened on each of those, which sets its points.
//   Scoreboard the quarter to date, highest first, with each person's events.
//
// The scoring is the artifact's own (points-engine.js, APS). Leaders on the
// leader list (Manage → Settings → Leaders) aren't scored. The records are
// disciplinary data: the private `points` section, manager sessions only.
// Messages, leader tasks, memos, Add points from team devices, the test run
// and quarter close come in the next phases.

const PT_DEFAULTS = {breakMinutes: 30, graceMinutes: 3, clockGraceMinutes: 0, extendedHours: 3,
  signature: 'Chick-fil-A Buda Leadership', quarter: '2026-Q4', quarterStartDate: '2026-10-01'};
const PT_PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const PT_PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
const PT_UPLOADS_KEPT = 60;

// What a leader can call each kind of review item (the artifact's choices).
const PT_REVIEW_CHOICES = {
  absence: [['ncns', 'No-call/no-show (+50)'], ['callout_lt24', 'Call-out under 24 hrs (+25)'], ['callout_doc', 'Under 24 hrs with documentation (+10)'],
            ['callout_24', 'Call-out 24+ hrs (+10)'], ['timeoff', 'Approved time off (0)'], ['dismiss', 'Not an absence']],
  unscheduled: [['pickup', 'Called in / picked up a shift (−10)'], ['cover', 'Covered for a team member (−10)'], ['dismiss', 'Schedule change, no credit']],
  extended: [['extended', 'Covered the team (−10)'], ['dismiss', 'Didn’t cover the team (0)']]
};

let ptPane = 'board';     // 'upload' | 'review' | 'board'
let ptDetail = '';        // the team member open on the scoreboard ('' = the list)
let ptPending = null;     // a read report waiting to be added
let ptSearch = '';
let ptShowZero = false;

function ptSettings(){ return Object.assign({}, PT_DEFAULTS, pointsSettings || {}); }
function ptQ(){ return ptSettings().quarter; }
function ptQuarterRecords(){ return (pointsRecords && pointsRecords[ptQ()]) || {}; }
// Leaders aren't scored: anyone the hub counts as a leader (leaderListed).
function ptExcluded(name){ return typeof leaderListed === 'function' && !!leaderListed(APS.displayName(name)); }

// tm → {rec, score} for everyone scored this quarter.
function ptScored(){
  const out = {}, recs = ptQuarterRecords();
  Object.keys(recs).forEach(tm => {
    const r = recs[tm];
    if(!r || ptExcluded(r.tmName)) return;
    const conf = (r.events || []).filter(e => e.status === 'confirmed').map(e => Object.assign({}, e));
    out[tm] = {rec: r, score: APS.scoreTM(conf)};
  });
  return out;
}

function ptReviewItems(){
  const out = [], recs = ptQuarterRecords();
  Object.keys(recs).forEach(tm => {
    const r = recs[tm];
    if(!r || ptExcluded(r.tmName)) return;
    (r.events || []).forEach(e => { if(e.status === 'review') out.push(e); });
  });
  return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}

// ----- Upload -----

// pdf.js text items per page, the shape APS.parseReport reads.
let ptPdfjs = null;
async function ptReadPdf(file){
  if(!ptPdfjs) ptPdfjs = import(PT_PDFJS).then(m => { m.GlobalWorkerOptions.workerSrc = PT_PDFJS_WORKER; return m; });
  const pdfjs = await ptPdfjs;
  const doc = await pdfjs.getDocument({data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false}).promise;
  const pages = [];
  for(let i = 1; i <= doc.numPages; i++){
    const tc = await (await doc.getPage(i)).getTextContent();
    pages.push({items: tc.items.map(it => ({s: it.str, x: it.transform[4], y: it.transform[5]}))});
  }
  return pages;
}

// A parsed report against what's recorded: {fresh, dup, byType, skipped, range, runDate, coversTo, employees}.
function ptPrepare(parsed){
  const s = ptSettings(), recs = ptQuarterRecords();
  const have = new Set();
  Object.values(recs).forEach(r => (r.events || []).forEach(e => have.add(e.id)));
  const all = APS.deriveEvents(parsed, s);
  const skippedNames = new Set();
  const fresh = [];
  let dup = 0;
  all.forEach(e => {
    if(ptExcluded(e.tmName)){ skippedNames.add(APS.displayName(e.tmName)); return; }
    if(have.has(e.id)){ dup++; return; }
    have.add(e.id);
    fresh.push(e);
  });
  const byType = {};
  fresh.forEach(e => { byType[e.type] = (byType[e.type] || 0) + 1; });
  const worked = parsed.shifts.filter(x => x.actIn !== null).map(x => x.date).sort();
  return {fresh, dup, byType, skipped: [...skippedNames].sort(), range: parsed.range, runDate: parsed.runDate,
          coversTo: worked.length ? worked[worked.length - 1] : null, employees: [...new Set(parsed.shifts.map(x => x.emp))]};
}

// Adds a prepared report's new events to the quarter. Returns how many.
function ptCommit(prep, fileName){
  const q = ptQ();
  if(!pointsRecords[q]) pointsRecords[q] = {};
  const recs = pointsRecords[q];
  const at = new Date().toISOString(), by = typeof getInitials === 'function' ? getInitials() : '';
  prep.fresh.forEach(e => {
    if(!recs[e.tm]) recs[e.tm] = {tm: e.tm, tmName: e.tmName, events: []};
    if(recs[e.tm].events.some(x => x.id === e.id)) return;
    recs[e.tm].events.push(Object.assign({}, e, {source: 'report', createdAt: at, by}));
  });
  pointsUploads.unshift({at, by, file: String(fileName || '').slice(0, 120), range: prep.range, runDate: prep.runDate,
                         coversTo: prep.coversTo, added: prep.fresh.length, quarter: q});
  if(pointsUploads.length > PT_UPLOADS_KEPT) pointsUploads.length = PT_UPLOADS_KEPT;
  return prep.fresh.length;
}

// ----- Review -----

// A leader's call on a review item: `as` is one of PT_REVIEW_CHOICES, or 'dismiss'.
function ptResolve(tm, id, as){
  const r = ptQuarterRecords()[tm];
  const e = r && (r.events || []).find(x => x.id === id);
  if(!e || e.status !== 'review') return false;
  e.resolvedAt = new Date().toISOString();
  e.resolvedBy = typeof getInitials === 'function' ? getInitials() : '';
  if(as === 'dismiss'){ e.status = 'dismissed'; return true; }
  if(!APS.TYPES[as]) return false;
  const was = e.type;
  e.status = 'confirmed';
  e.type = as;
  e.detail = APS.TYPES[as].label + (was === 'absence' ? ` for the ${APS.fmtTime(e.schIn)} shift`
    : was === 'unscheduled' ? `, worked ${APS.fmtTime(e.actIn)}${e.actOut != null ? '–' + APS.fmtTime(e.actOut) : ''}` : '');
  return true;
}

// ----- Rendering -----
const ptDay = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'numeric', day: 'numeric'}) : '';
const ptQLabel = q => `${q.slice(5)} ${q.slice(0, 4)}`;
function ptLevelChip(total){
  const lv = APS.ladderLevel(total);
  const cls = !lv ? 'is-clear' : lv.at >= 50 ? 'is-high' : lv.at >= 20 ? 'is-mid' : 'is-low';
  return `<span class="pt-chip ${cls}">${escapeHtml(!lv ? 'Clear' : lv.at >= 20 ? lv.short : 'Message')}</span>`;
}

function ptHeadSub(){
  const ups = pointsUploads.filter(u => u.quarter === ptQ());
  return `${escapeHtml(ptQLabel(ptQ()))} · ${ups.length ? `last report ${escapeHtml(ptDay(ups[0].runDate))}` : 'no reports yet'}`;
}

function ptActionsHtml(){
  const n = ptReviewItems().length;
  const b = (id, label) => `<button type="button" class="uo-pane-btn ${ptPane === id ? 'active' : ''}" data-pt-pane="${id}">${label}</button>`;
  return `<div class="uo-panes" role="tablist" aria-label="Points">${b('board', 'Scoreboard')}${b('review', `Review${n ? ` · ${n}` : ''}`)}${b('upload', 'Upload')}</div>`;
}

function ptUploadHtml(){
  const ups = pointsUploads.filter(u => u.quarter === ptQ()).slice(0, 8);
  const p = ptPending;
  const preview = p ? `
    <section class="dir-card pt-preview">
      <h3>${escapeHtml(p.file)}</h3>
      <p class="dir-note">${p.range ? `Covers ${escapeHtml(ptDay(p.range[0]))} – ${escapeHtml(ptDay(p.range[1]))}` : 'No date range found'}${p.runDate ? ` · run ${escapeHtml(ptDay(p.runDate))}` : ''}</p>
      <div class="dir-nums">
        <div class="dir-num"><span>New events</span><b>${p.fresh.length}</b><small>${p.dup ? `${p.dup} already recorded` : 'none already recorded'}</small></div>
        ${Object.keys(p.byType).sort().map(t => `<div class="dir-num"><span>${escapeHtml(APS.TYPES[t] ? APS.TYPES[t].label : t)}</span><b>${p.byType[t]}</b><small>${p.fresh.some(e => e.type === t && e.status === 'review') ? 'needs a leader’s call' : 'counts now'}</small></div>`).join('')}
      </div>
      ${p.skipped.length ? `<p class="dir-note">Not scored (on the leader list): ${escapeHtml(p.skipped.join(', '))}</p>` : ''}
      <div class="pt-actions">
        <button type="button" class="btn dir-btn" data-pt-commit ${p.fresh.length ? '' : 'disabled'}>${p.fresh.length ? `Add ${p.fresh.length} event${p.fresh.length === 1 ? '' : 's'}` : 'Nothing new to add'}</button>
        <button type="button" class="btn btn-ghost dir-btn" data-pt-cancel>Cancel</button>
      </div>
    </section>` : '';
  return `
    <section class="dir-card">
      <h3>Add yesterday’s punch report</h3>
      <p class="dir-note">The Actual vs. Scheduled PDF. Only dates from ${escapeHtml(ptDay(ptSettings().quarterStartDate))} count, and anything already recorded is skipped, so overlapping reports are fine.</p>
      <label class="pt-drop"><input type="file" accept="application/pdf,.pdf" data-pt-file hidden><span>Choose the PDF</span></label>
      <p class="dir-note" data-pt-status role="status"></p>
    </section>
    ${preview}
    <section class="dir-card"><h3>Recent reports</h3>
      ${ups.length ? `<ul class="dir-list dir-list-sm">${ups.map(u => `<li><span>${escapeHtml(ptDay(u.runDate) || '—')} report${u.coversTo ? ` · through ${escapeHtml(ptDay(u.coversTo))}` : ''}</span><span class="dir-muted">${u.added} added${u.by ? ` · ${escapeHtml(u.by)}` : ''}</span></li>`).join('')}</ul>` : '<p class="dir-empty">No reports added this quarter yet.</p>'}
    </section>`;
}

function ptReviewHtml(){
  const items = ptReviewItems();
  if(!items.length) return '<section class="dir-card"><h3>Needs a leader’s call</h3><p class="dir-empty">Nothing waiting on a decision.</p></section>';
  return `<section class="dir-card"><h3>Needs a leader’s call</h3>
    <p class="dir-note">Nothing here counts until you pick what happened. Absences are scheduled shifts with no punches; an extended shift only earns −10 if it was to cover the team.</p>
    <ul class="dir-list pt-review">${items.map(e => `
      <li><b>${escapeHtml(APS.displayName(e.tmName))}</b> <span class="dir-muted">${escapeHtml(ptDay(e.date))}</span><br>
        <span>${escapeHtml(e.detail || '')}</span>
        <div class="pt-choices">${(PT_REVIEW_CHOICES[e.type] || []).map(([as, label]) => `<button type="button" class="btn ${as === 'dismiss' ? 'btn-ghost' : 'btn-ghost'} pt-choice ${as === 'dismiss' ? 'is-dismiss' : ''}" data-pt-resolve="${escapeHtml(as)}" data-pt-tm="${escapeHtml(e.tm)}" data-pt-id="${escapeHtml(e.id)}">${escapeHtml(label)}</button>`).join('')}</div>
      </li>`).join('')}</ul></section>`;
}

const ptCount = (evs, types) => evs.filter(e => types.includes(e.type)).length;

function ptBoardHtml(){
  const sc = ptScored();
  if(ptDetail && sc[ptDetail]) return ptDetailHtml(ptDetail, sc[ptDetail]);
  const rows = Object.keys(sc).map(tm => ({tm, name: APS.displayName(sc[tm].rec.tmName), ...sc[tm]}))
    .filter(r => (ptShowZero || r.score.total > 0 || r.score.events.length) && (!ptSearch || r.name.toLowerCase().includes(ptSearch.toLowerCase())))
    .sort((a, b) => b.score.total - a.score.total || a.name.localeCompare(b.name));
  const tracked = Object.keys(sc).length, hot = Object.values(sc).filter(s => s.score.total >= 20).length;
  return `
    <section class="dir-card">
      <div class="dir-nums">
        <div class="dir-num"><span>Team members tracked</span><b>${tracked}</b><small>${escapeHtml(ptQLabel(ptQ()))}</small></div>
        <div class="dir-num"><span>At 20+ this quarter</span><b>${hot}</b><small>leader conversation or more</small></div>
        <div class="dir-num"><span>Waiting on a call</span><b>${ptReviewItems().length}</b><small>Review</small></div>
      </div>
    </section>
    <section class="dir-card">
      <div class="pt-board-tools"><input type="search" placeholder="Search a name" value="${escapeHtml(ptSearch)}" data-pt-search aria-label="Search a name">
        <label class="pt-zero"><input type="checkbox" data-pt-zero ${ptShowZero ? 'checked' : ''}> Show everyone</label></div>
      ${rows.length ? `<div class="pt-table-wrap"><table class="pt-table">
        <thead><tr><th>Team member</th><th>QTD</th><th>Level</th><th>Tardies</th><th>Missed</th><th>Picked up</th></tr></thead>
        <tbody>${rows.map(r => `<tr data-pt-open="${escapeHtml(r.tm)}" tabindex="0"><td><b>${escapeHtml(r.name)}</b></td><td class="pt-pts">${r.score.total}</td><td>${ptLevelChip(r.score.total)}</td>
          <td>${r.score.punctCount}</td><td>${ptCount(r.score.events, ['ncns', 'callout_lt24', 'callout_24', 'callout_doc'])}</td><td>${ptCount(r.score.events, ['pickup', 'cover'])}</td></tr>`).join('')}</tbody>
      </table></div>` : `<p class="dir-empty">${tracked ? 'No one matches.' : 'No points recorded yet this quarter. Add a punch report under Upload to start.'}</p>`}
      <p class="dir-note">Ladder: 5–10 a message with the quarter’s total · 20 leader conversation · 30 documented warning · 50 write-up · 75 PIP and suspension · 100 termination.</p>
    </section>`;
}

function ptDetailHtml(tm, s){
  const lv = APS.ladderLevel(s.score.total), nx = APS.nextStep(s.score.total);
  const all = (s.rec.events || []).slice().sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const scoredById = Object.fromEntries(s.score.events.map(e => [e.id, e]));
  return `
    <section class="dir-card">
      <button type="button" class="btn btn-ghost dir-btn" data-pt-back>← Scoreboard</button>
      <h3 class="pt-detail-name">${escapeHtml(APS.displayName(s.rec.tmName))}</h3>
      <div class="dir-nums">
        <div class="dir-num"><span>Quarter to date</span><b>${s.score.total}</b><small>${ptLevelChip(s.score.total)}</small></div>
        <div class="dir-num"><span>Next step</span><b>${nx ? nx.at : '—'}</b><small>${escapeHtml(nx ? nx.label : 'at the top of the ladder')}</small></div>
        <div class="dir-num"><span>Tardies and late breaks</span><b>${s.score.punctCount}</b><small>5 each to 3, then 10, then 20</small></div>
      </div>
      ${lv && lv.at >= 20 ? `<p class="dir-note"><b>Reached:</b> ${escapeHtml(lv.label)}</p>` : ''}
    </section>
    <section class="dir-card"><h3>Events</h3>
      <ul class="dir-list pt-events">${all.map(e => {
        const se = scoredById[e.id];
        const pts = e.status === 'review' ? '<span class="pt-chip is-mid">Review</span>' : e.status === 'dismissed' ? '<span class="dir-muted">—</span>'
          : `<b class="pt-ev-pts ${se && se.pts < 0 ? 'is-credit' : ''}">${se ? (se.pts > 0 ? '+' : '') + se.pts : ''}</b>`;
        const label = (APS.TYPES[e.type] ? APS.TYPES[e.type].label : e.type) + (se && se.punctN ? ` #${se.punctN}` : '');
        return `<li><span class="pt-ev-when">${escapeHtml(ptDay(e.date))}</span><span class="pt-ev-what"><b>${escapeHtml(label)}</b><br><span class="dir-muted">${escapeHtml(e.detail || '')}</span></span>${pts}</li>`;
      }).join('')}</ul>
    </section>`;
}

function ptBodyHtml(){
  if(typeof APS === 'undefined') return '<p class="dir-empty">The points engine didn’t load. Reload the page.</p>';
  return ptPane === 'upload' ? ptUploadHtml() : ptPane === 'review' ? ptReviewHtml() : ptBoardHtml();
}

// ----- Events -----
function ptStatus(text){ const el = document.querySelector('#directorsRoot [data-pt-status]'); if(el) el.textContent = text; }

document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t || !t.closest('#directorsRoot')) return;
  const pane = t.closest('[data-pt-pane]');
  if(pane){ ptPane = pane.dataset.ptPane; ptDetail = ''; renderDirectorsView(); return; }
  const open = t.closest('[data-pt-open]');
  if(open){ ptDetail = open.dataset.ptOpen; renderDirectorsView(); window.scrollTo(0, 0); return; }
  if(t.closest('[data-pt-back]')){ ptDetail = ''; renderDirectorsView(); return; }
  if(t.closest('[data-pt-cancel]')){ ptPending = null; renderDirectorsView(); return; }
  if(t.closest('[data-pt-commit]')){
    if(!ptPending) return;
    const n = ptCommit(ptPending, ptPending.file);
    const review = ptPending.fresh.some(x => x.status === 'review');
    ptPending = null;
    saveState();
    showToast(`Added ${n} event${n === 1 ? '' : 's'}`);
    ptPane = review ? 'review' : 'board';
    renderDirectorsView();
    return;
  }
  const res = t.closest('[data-pt-resolve]');
  if(res){
    if(ptResolve(res.dataset.ptTm, res.dataset.ptId, res.dataset.ptResolve)){
      saveState();
      showToast(res.dataset.ptResolve === 'dismiss' ? 'Dismissed' : 'Recorded');
    }
    renderDirectorsView();
  }
});

document.addEventListener('keydown', e => {
  const row = e.target && e.target.closest && e.target.closest('#directorsRoot [data-pt-open]');
  if(row && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); ptDetail = row.dataset.ptOpen; renderDirectorsView(); }
});

document.addEventListener('input', e => {
  const t = e.target;
  if(!t || !t.closest || !t.closest('#directorsRoot')) return;
  if(t.matches('[data-pt-search]')){
    ptSearch = t.value;
    const pos = t.selectionStart;
    renderDirectorsView();
    const again = document.querySelector('#directorsRoot [data-pt-search]');
    if(again){ again.focus(); try{ again.setSelectionRange(pos, pos); }catch(err){} }
  }
});

document.addEventListener('change', async e => {
  const t = e.target;
  if(!t || !t.closest || !t.closest('#directorsRoot')) return;
  if(t.matches('[data-pt-zero]')){ ptShowZero = t.checked; renderDirectorsView(); return; }
  if(!t.matches('[data-pt-file]') || !t.files || !t.files[0]) return;
  const file = t.files[0];
  ptStatus(`Reading ${file.name}…`);
  try{
    const parsed = APS.parseReport(await ptReadPdf(file));
    if(!parsed.shifts.length){ ptStatus('No shifts found. Is this the Actual vs. Scheduled report?'); return; }
    ptPending = Object.assign(ptPrepare(parsed), {file: file.name});
    renderDirectorsView();
  }catch(err){
    console.warn('Punch report:', err);
    ptStatus('Couldn’t read that PDF. Try downloading the report again.');
  }
});
