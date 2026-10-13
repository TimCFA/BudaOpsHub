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
// leader list (Manage → Settings → Leaders) aren't scored. Buda only: a West
// Buda report is turned away. The records are disciplinary data: the private
// `points` section, manager sessions only, and only managers see or change
// any of it (Tim; directors and admin only once accounts exist, TIM-20).
//
// Phase 2:
//   Messages   one draft per team member covering everything confirmed since
//              their last message, in English or Spanish (per person,
//              remembered), to copy into Connecteam and mark sent.
//   Tasks      every ladder step of 20+ reached and not closed, assignable to
//              a leader; closing one means writing its memo.
//   Memos      the HR documentation for each step, with the quarter's events
//              attached, downloadable as a printable page.
// Add points, the test run and quarter close come in phase 3.

const PT_DEFAULTS = {breakMinutes: 30, graceMinutes: 3, clockGraceMinutes: 0, extendedHours: 3,
  signature: 'Chick-fil-A Buda Leadership', leader: 'Casey', quarter: '2026-Q4', quarterStartDate: '2026-10-01'};
const PT_STORE = {name: 'Chick-fil-A Buda', number: '04066'};
const PT_MSG_LIMIT = 1000;      // Connecteam's message length
const PT_MESSAGES_KEPT = 40;    // sent messages kept per team member
const PT_PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const PT_PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
const PT_UPLOADS_KEPT = 60;

// What a leader can call each kind of review item (the artifact's choices).
const PT_REVIEW_CHOICES = {
  absence: [['ncns', 'No-call/no-show (+50)'], ['callout_lt24', 'Call-out under 24 hrs (+25)'], ['callout_lt24_note', 'Under 24 hrs, note promised (+25, drops to +10 with note)'], ['callout_doc', 'Under 24 hrs with documentation (+10)'],
            ['callout_24', 'Call-out 24+ hrs (+10)'], ['timeoff', 'Approved time off (0)'], ['dismiss', 'Not an absence']],
  unscheduled: [['pickup', 'Called in / picked up a shift (−10)'], ['cover', 'Covered for a team member (−10)'], ['dismiss', 'Schedule change, no credit']],
  extended: [['extended', 'Covered the team (−10)'], ['dismiss', 'Didn’t cover the team (0)']]
};

let ptPane = 'board';     // 'upload' | 'review' | 'board'
let ptDetail = '';        // the team member open on the scoreboard ('' = the list)
let ptPending = null;     // a read report waiting to be added
let ptSearch = '';
let ptShowZero = false;
let ptTaskFilter = '';    // '' everyone's | '__none' unassigned | a leader's name
let ptMemoSearch = '';
let ptMemoDraft = null;   // the memo open in the form: {id, tm, at, existing, fields}
const ptMsgEdits = {};    // tm → a message being edited before it's sent

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

// Buda only (Tim): a report whose location line names West Buda isn't
// scored here. One with no location line is taken as Buda's.
function ptIsOtherStore(parsed){ return /west/i.test(String(parsed && parsed.location || '')); }

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
  const type = as === 'callout_lt24_note' ? 'callout_lt24' : as;
  if(!APS.TYPES[type]) return false;
  const was = e.type;
  e.status = 'confirmed';
  e.type = type;
  if(as === 'callout_lt24_note') e.notePending = true;
  e.detail = APS.TYPES[type].label + (was === 'absence' ? ` for the ${APS.fmtTime(e.schIn)} shift`
    : was === 'unscheduled' ? `, worked ${APS.fmtTime(e.actIn)}${e.actOut != null ? '–' + APS.fmtTime(e.actOut) : ''}` : '')
    + (e.notePending ? ', doctor’s note promised' : '');
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
  const sc = ptScored(), n = ptReviewItems().length, m = ptMessageCards(sc).length, t = ptTasks(sc).length;
  const b = (id, label, k) => `<button type="button" class="uo-pane-btn ${ptPane === id ? 'active' : ''}" data-pt-pane="${id}">${label}${k ? ` · ${k}` : ''}</button>`;
  return `<div class="uo-panes pt-panes" role="tablist" aria-label="Points">${b('board', 'Scoreboard')}${b('review', 'Review', n)}${b('messages', 'Messages', m)}${b('tasks', 'Tasks', t)}${b('memos', 'Memos')}${b('upload', 'Upload')}</div>`;
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
      ${(() => { const acks = s.rec.acks || {}, steps = APS.LADDER.filter(l => l.at >= 20 && s.score.total >= l.at);
        return steps.length ? `<ul class="dir-list dir-list-sm">${steps.map(l => `<li><span>${l.at} · ${escapeHtml(l.short)}</span><span class="dir-muted">${acks[l.at] ? `closed ${escapeHtml(ptDay((acks[l.at].at || '').slice(0, 10)))}${acks[l.at].leader ? ` · ${escapeHtml(acks[l.at].leader)}` : ''}` : 'open · Tasks'}</span></li>`).join('')}</ul>` : ''; })()}
      <div class="pt-actions"><button type="button" class="btn btn-ghost dir-btn" data-pt-history="${escapeHtml(tm)}">Download history</button></div>
    </section>
    <section class="dir-card"><h3>Events</h3>
      <ul class="dir-list pt-events">${all.map(e => {
        const se = scoredById[e.id];
        const pts = e.status === 'review' ? '<span class="pt-chip is-mid">Review</span>' : e.status === 'dismissed' ? '<span class="dir-muted">—</span>'
          : `<b class="pt-ev-pts ${se && se.pts < 0 ? 'is-credit' : ''}">${se ? (se.pts > 0 ? '+' : '') + se.pts : ''}</b>`;
        const label = (APS.TYPES[e.type] ? APS.TYPES[e.type].label : e.type) + (se && se.punctN ? ` #${se.punctN}` : '');
        const acts = e.status === 'removed' ? '<span class="dir-muted">removed</span>'
          : [e.notePending ? `<button type="button" class="pt-link" data-pt-note="${escapeHtml(e.id)}" data-pt-tm="${escapeHtml(tm)}">Note received</button>` : '',
             e.status !== 'dismissed' ? `<button type="button" class="pt-link" data-pt-remove="${escapeHtml(e.id)}" data-pt-tm="${escapeHtml(tm)}">Remove</button>` : ''].join('');
        return `<li><span class="pt-ev-when">${escapeHtml(ptDay(e.date))}</span><span class="pt-ev-what"><b>${escapeHtml(label)}</b><br><span class="dir-muted">${escapeHtml(e.detail || '')}${e.messagedAt ? ` · messaged ${escapeHtml(ptDay(e.messagedAt.slice(0, 10)))}` : ''}</span>${acts ? `<span class="pt-ev-acts">${acts}</span>` : ''}</span>${e.status === 'removed' ? '<span class="dir-muted">—</span>' : pts}</li>`;
      }).join('')}</ul>
    </section>`;
}

function ptBodyHtml(){
  if(typeof APS === 'undefined') return '<p class="dir-empty">The points engine didn’t load. Reload the page.</p>';
  return ptPane === 'upload' ? ptUploadHtml() : ptPane === 'review' ? ptReviewHtml() : ptPane === 'messages' ? ptMessagesHtml()
    : ptPane === 'tasks' ? ptTasksHtml() : ptPane === 'memos' ? (ptMemoDraft ? ptMemoFormHtml() : ptMemosHtml()) : ptBoardHtml();
}

// ----- Phase 2: messages -----

function ptLang(tm){ return (pointsTeam[tm] && pointsTeam[tm].lang) === 'es' ? 'es' : 'en'; }
function ptSetLang(tm, lang){
  pointsTeam[tm] = Object.assign({}, pointsTeam[tm] || {}, {lang: lang === 'es' ? 'es' : 'en'});
  delete ptMsgEdits[tm];
}

// One card per team member with confirmed events not yet messaged, highest total first.
function ptMessageCards(sc){
  sc = sc || ptScored();
  const s0 = ptSettings();
  return Object.keys(sc).sort((a, b) => sc[b].score.total - sc[a].score.total || a.localeCompare(b)).map(tm => {
    const s = sc[tm], fresh = s.score.events.filter(e => !e.messagedAt && e.type !== 'carryover');
    if(!fresh.length) return null;
    const lang = ptLang(tm);
    const text = APS.draftMessage(s.rec.tmName, fresh, s.score.total, today, {signature: s0.signature, leader: s0.leader, lang, breakMinutes: s0.breakMinutes});
    return {tm, name: APS.displayName(s.rec.tmName), total: s.score.total, ids: fresh.map(e => e.id), events: fresh, lang, text};
  }).filter(Boolean);
}

// The message went out: its events are marked messaged and the text kept.
function ptMarkSent(tm, ids, text){
  const r = ptQuarterRecords()[tm];
  if(!r) return false;
  const at = new Date().toISOString(), by = typeof getInitials === 'function' ? getInitials() : '';
  let n = 0;
  (r.events || []).forEach(e => { if(ids.includes(e.id) && !e.messagedAt){ e.messagedAt = at; e.messagedBy = by; n++; } });
  if(!n) return false;
  r.messages = (r.messages || []).concat([{at, by, text: String(text || ''), ids}]).slice(-PT_MESSAGES_KEPT);
  delete ptMsgEdits[tm];
  return true;
}

// An event logged in error stops counting (kept, marked removed, for the record).
function ptRemoveEvent(tm, id){
  const r = ptQuarterRecords()[tm];
  const e = r && (r.events || []).find(x => x.id === id);
  if(!e || e.status === 'removed') return false;
  e.status = 'removed';
  e.removedAt = new Date().toISOString();
  e.removedBy = typeof getInitials === 'function' ? getInitials() : '';
  delete ptMsgEdits[tm];
  return true;
}

// The promised doctor's note came in: the call-out drops to +10 and a
// thank-you message waits.
function ptNoteReceived(tm, id){
  const r = ptQuarterRecords()[tm];
  const e = r && (r.events || []).find(x => x.id === id);
  if(!e || !e.notePending) return false;
  Object.assign(e, {type: 'callout_doc', notePending: false, noteReceived: true, detail: 'Call-out under 24 hrs, doctor’s note received',
                    messagedAt: null, noteAt: new Date().toISOString(), noteBy: typeof getInitials === 'function' ? getInitials() : ''});
  return true;
}

// ----- Phase 2: leader tasks -----

// Who picks up tasks: the directors and the leader list (Manage → Settings).
function ptLeaders(){
  const names = [];
  const add = n => { n = String(n || '').trim(); if(n && !names.some(x => x.toLowerCase() === n.toLowerCase())) names.push(n); };
  if(typeof dirList === 'function') dirList().forEach(d => add(d.name));
  (Array.isArray(leaderRoster) ? leaderRoster : []).forEach(r => add(r && r.name));
  return names;
}

// Ladder steps (20+) a team member has reached and no leader has closed.
function ptOwed(s){
  const acks = s.rec.acks || {};
  return APS.LADDER.filter(l => l.at >= 20 && s.score.total >= l.at && !acks[l.at]);
}

function ptTasks(sc){
  sc = sc || ptScored();
  const out = [];
  Object.keys(sc).forEach(tm => {
    const s = sc[tm];
    ptOwed(s).forEach(l => { const a = (s.rec.assign || {})[l.at]; out.push({tm, name: APS.displayName(s.rec.tmName), total: s.score.total, at: l.at, label: l.label, leader: (a && a.leader) || ''}); });
  });
  return out.sort((a, b) => b.at - a.at || b.total - a.total || a.name.localeCompare(b.name));
}

function ptAssign(tm, at, leader){
  const r = ptQuarterRecords()[tm];
  if(!r) return false;
  const a = Object.assign({}, r.assign || {});
  if(leader) a[at] = {leader, at: new Date().toISOString(), by: typeof getInitials === 'function' ? getInitials() : ''};
  else delete a[at];
  r.assign = a;
  return true;
}

// ----- Phase 2: memos -----

const PT_MEMO = {
  20: {title: 'Leader Conversation Record', plan: 'Team member understands the expectation: clocked in at the scheduled minute, in uniform, and 30-minute breaks. Points reset each quarter with 50% carryover.'},
  30: {title: 'Documented Warning', plan: 'This is a formal written warning. Further attendance infractions move to a coaching conversation and formal write-up at 50 points.'},
  50: {title: 'Coaching Conversation and Formal Write-Up', plan: 'Specific, measurable improvement is expected. The next step at 75 points is a Performance Improvement Plan and a one-week suspension.'},
  75: {title: 'Performance Improvement Plan and One-Week Suspension', plan: 'PIP in effect. Suspension is enacted on the next posted schedule. Reaching 100 points results in termination.'},
  100: {title: 'Termination Documentation', plan: 'HR meeting held to document the record and complete separation.'}
};
const PT_ACKS = [['reviewed', 'Reviewed with team member'], ['signed', 'Team member signed'], ['refused', 'Team member declined to sign']];
const ptMemoId = (tm, at, q) => `${tm}__${q || ptQ()}__${at}`;

function ptMemosThisQuarter(){
  return Object.keys(pointsMemos || {}).map(id => Object.assign({id}, pointsMemos[id])).filter(m => m.quarter === ptQ())
    .sort((a, b) => (a.createdAt || '') < (b.createdAt || '') ? 1 : -1);
}

// Opens the memo form for a step: a new one from a task, or one on file.
function ptOpenMemo(tm, at, existingId){
  const s = ptScored()[tm];
  const m = existingId ? pointsMemos[existingId] : null;
  if(!s && !m) return false;
  const t = PT_MEMO[at] || {title: 'Memo', plan: ''};
  const a = s && (s.rec.assign || {})[at];
  ptMemoDraft = {id: existingId || ptMemoId(tm, at), tm, at, existing: !!m,
    fields: {date: (m && m.date) || today, leader: m ? m.leader : (a && a.leader) || '', followUp: (m && m.followUp) || '',
             susStart: (m && m.susStart) || '', susEnd: (m && m.susEnd) || '', notes: (m && m.notes) || '', plan: m ? m.plan : t.plan, ack: (m && m.ack) || ''},
    error: ''};
  ptPane = 'memos';
  return true;
}

// Saves the open memo; a new one closes its task. Returns '' or what's missing.
function ptSaveMemo(){
  const d = ptMemoDraft;
  if(!d) return 'No memo open';
  const f = d.fields;
  if(!f.leader) return 'Pick the leader who held the conversation.';
  if(!String(f.notes || '').trim()) return 'Add a few lines about what was discussed.';
  const sc = ptScored()[d.tm], old = pointsMemos[d.id];
  const rec = sc ? sc.rec : ptQuarterRecords()[d.tm];
  const t = PT_MEMO[d.at] || {title: 'Memo'};
  const events = sc ? sc.score.events.map(e => ({date: e.date, label: (APS.TYPES[e.type] ? APS.TYPES[e.type].label : e.type) + (e.punctN ? ` #${e.punctN}` : ''), detail: e.detail || '', pts: e.pts, running: e.running})) : (old ? old.events : []);
  const now = new Date().toISOString(), by = typeof getInitials === 'function' ? getInitials() : '';
  const memo = {tm: d.tm, tmName: rec ? rec.tmName : (old && old.tmName) || d.tm, quarter: old ? old.quarter : ptQ(), at: d.at, title: t.title,
    total: old ? old.total : (sc ? sc.score.total : 0), date: f.date, leader: f.leader, followUp: f.followUp, notes: String(f.notes).trim(),
    plan: String(f.plan || '').trim(), ack: f.ack, events: old ? old.events : events, createdAt: (old && old.createdAt) || now, updatedAt: now, by};
  if(d.at === 75){ memo.susStart = f.susStart; memo.susEnd = f.susEnd; }
  pointsMemos[d.id] = memo;
  if(!old && rec){
    const acks = Object.assign({}, rec.acks || {});
    acks[d.at] = {at: now, by, memo: d.id, leader: f.leader};
    rec.acks = acks;
  }
  ptMemoDraft = null;
  return '';
}

// ----- Phase 2: printable files for HR -----

function ptDownload(text, name){
  const blob = new Blob([text], {type: 'text/html'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const ptFile = s => String(s || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
const PT_DOC_CSS = 'body{font:14px/1.45 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1d1f;margin:32px;max-width:860px}h1{color:#DD0031;margin:0 0 2px;font-size:24px}h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#DD0031;margin:22px 0 6px}.meta{color:#555}.box{white-space:pre-wrap;border:1px solid #ddd;border-radius:8px;padding:10px 12px;min-height:48px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #ddd;vertical-align:top;font-size:12px}th{font-size:11px;text-transform:uppercase;color:#666}.n{text-align:right;white-space:nowrap}.sig{display:flex;gap:40px;margin-top:36px}.sig div{flex:1;border-top:1px solid #333;padding-top:6px;font-size:12px;color:#555}.msg{margin:8px 0;padding:8px 10px;background:#f7f7f7;border-radius:8px}pre{white-space:pre-wrap;font:inherit;margin:4px 0 0}@media print{body{margin:12mm}}';

function ptMemoDoc(m){
  const name = APS.displayName(m.tmName), ack = (PT_ACKS.find(a => a[0] === m.ack) || [0, 'Not recorded'])[1];
  const rows = (m.events || []).map(e => `<tr><td>${escapeHtml(ptDay(e.date))} ${escapeHtml(e.date)}</td><td>${escapeHtml(e.label)}</td><td>${escapeHtml(e.detail)}</td><td class="n">${e.pts > 0 ? '+' : ''}${escapeHtml(e.pts)}</td><td class="n">${escapeHtml(e.running)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(m.title)} — ${escapeHtml(name)}</title><style>${PT_DOC_CSS}</style></head><body>
<h1>${escapeHtml(m.title)}</h1><div class="meta">${PT_STORE.name} #${PT_STORE.number} · Accountability Points · ${escapeHtml(ptQLabel(m.quarter))}</div>
<h2>Team member</h2><div><b>${escapeHtml(name)}</b> · ${escapeHtml(m.total)} points quarter to date at the time of this memo · ladder step ${escapeHtml(m.at)}</div>
<h2>Conversation</h2><div>Date: ${escapeHtml(m.date || '')} · Leader: ${escapeHtml(m.leader || '')}${m.followUp ? ` · Follow-up: ${escapeHtml(m.followUp)}` : ''}${m.susStart ? ` · Suspension: ${escapeHtml(m.susStart)} to ${escapeHtml(m.susEnd || '')}` : ''}</div>
<h2>What was discussed</h2><div class="box">${escapeHtml(m.notes || '')}</div>
<h2>Expectations and next step</h2><div class="box">${escapeHtml(m.plan || '')}</div>
<h2>Acknowledgment</h2><div>${escapeHtml(ack)}</div>
<div class="sig"><div>Team member signature / date</div><div>Leader signature / date</div></div>
<h2 style="margin-top:36px">Attendance record this quarter</h2><table><thead><tr><th>Date</th><th>Type</th><th>Detail</th><th>Points</th><th>Running</th></tr></thead><tbody>${rows}</tbody></table>
<p style="margin-top:24px;font-size:11px;color:#666">Generated ${escapeHtml(today)} from the Ops Hub's Accountability Points. Points follow the scale effective Oct 1, 2026.</p></body></html>`;
}

function ptHistoryDoc(tm){
  const s = ptScored()[tm];
  if(!s) return '';
  const name = APS.displayName(s.rec.tmName), acks = s.rec.acks || {}, assign = s.rec.assign || {};
  const rows = s.score.events.map(e => `<tr><td>${escapeHtml(ptDay(e.date))} ${escapeHtml(e.date)}</td><td>${escapeHtml((APS.TYPES[e.type] ? APS.TYPES[e.type].label : e.type) + (e.punctN ? ` #${e.punctN}` : ''))}</td><td>${escapeHtml(e.detail || '')}</td><td class="n">${e.pts > 0 ? '+' : ''}${e.pts}</td><td class="n">${e.running}</td><td>${e.messagedAt ? escapeHtml(e.messagedAt.slice(0, 10)) : ''}</td></tr>`).join('');
  const steps = APS.LADDER.filter(l => l.at >= 20 && s.score.total >= l.at).map(l => `<li>${l.at} · ${escapeHtml(l.label)}: ${acks[l.at] ? `completed ${escapeHtml((acks[l.at].at || '').slice(0, 10))}` : 'open'}${assign[l.at] && assign[l.at].leader ? ` · ${escapeHtml(assign[l.at].leader)}` : ''}</li>`).join('');
  const memos = ptMemosThisQuarter().filter(m => m.tm === tm).map(m => `<li>${escapeHtml(m.date || '')} · ${escapeHtml(m.title)} · ${escapeHtml(m.leader || '')}</li>`).join('');
  const msgs = (s.rec.messages || []).map(m => `<div class="msg"><div class="meta">${escapeHtml((m.at || '').slice(0, 16).replace('T', ' '))}</div><pre>${escapeHtml(m.text)}</pre></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(name)} — Accountability Points</title><style>${PT_DOC_CSS}</style></head><body>
<h1>Accountability Points — ${escapeHtml(name)}</h1><div class="meta">${PT_STORE.name} #${PT_STORE.number} · ${escapeHtml(ptQLabel(ptQ()))} · printed ${escapeHtml(today)}</div>
<h2>Quarter to date</h2><div><b style="font-size:28px;color:#DD0031">${s.score.total} points</b> · ${s.score.punctCount} tardy or late from break</div>
${steps ? `<h2>Ladder steps reached</h2><ul>${steps}</ul>` : ''}
<h2>Events</h2><table><thead><tr><th>Date</th><th>Type</th><th>Detail</th><th>Points</th><th>Running</th><th>Messaged</th></tr></thead><tbody>${rows}</tbody></table>
${memos ? `<h2>Memos on file</h2><ul>${memos}</ul>` : ''}${msgs ? `<h2>Messages sent</h2>${msgs}` : ''}
<p style="margin-top:28px;font-size:11px;color:#666">Generated from the Ops Hub's Accountability Points. Points follow the scale effective Oct 1, 2026.</p></body></html>`;
}

// ----- Phase 2: rendering -----

function ptEventRowHtml(tm, e, opts){
  const label = (APS.TYPES[e.type] ? APS.TYPES[e.type].label : e.type) + (e.punctN ? ` #${e.punctN}` : '');
  return `<li><span class="pt-ev-when">${escapeHtml(ptDay(e.date))}</span><span class="pt-ev-what"><b>${escapeHtml(label)}</b><br><span class="dir-muted">${escapeHtml(e.detail || '')}</span>
    ${opts && opts.remove ? `<span class="pt-ev-acts"><button type="button" class="pt-link" data-pt-remove="${escapeHtml(e.id)}" data-pt-tm="${escapeHtml(tm)}">Remove</button></span>` : ''}</span>
    <b class="pt-ev-pts ${e.pts < 0 ? 'is-credit' : ''}">${e.pts > 0 ? '+' : ''}${escapeHtml(e.pts)}</b></li>`;
}

function ptMessagesHtml(){
  const cards = ptMessageCards();
  if(!cards.length) return '<section class="dir-card"><h3>Messages to send</h3><p class="dir-empty">Everyone is caught up. New messages appear here after a report is added or a call is made.</p></section>';
  return `<section class="dir-card"><h3>Messages to send</h3><p class="dir-note">One message per team member covering everything since their last. Edit if you like, copy it into Connecteam, then mark it sent.</p></section>
    ${cards.map(c => {
      const text = ptMsgEdits[c.tm] !== undefined ? ptMsgEdits[c.tm] : c.text;
      return `<section class="dir-card pt-msg">
        <div class="pt-msg-head"><h3>${escapeHtml(c.name)}</h3><span class="pt-msg-tools">
          <button type="button" class="btn btn-ghost dir-btn" data-pt-lang="${escapeHtml(c.tm)}" data-pt-to="${c.lang === 'es' ? 'en' : 'es'}" title="Switch language">${c.lang === 'es' ? 'Español' : 'English'} · switch</button>${ptLevelChip(c.total)}<span class="pt-chip is-low">${c.total} QTD</span></span></div>
        <ul class="dir-list pt-events">${c.events.map(e => ptEventRowHtml(c.tm, e, {remove: true})).join('')}</ul>
        <textarea class="pt-msg-text" rows="9" data-pt-msg="${escapeHtml(c.tm)}" aria-label="Message to ${escapeHtml(c.name)}">${escapeHtml(text)}</textarea>
        <div class="pt-actions"><button type="button" class="btn dir-btn" data-pt-copy="${escapeHtml(c.tm)}">Copy message</button>
          <button type="button" class="btn btn-ghost dir-btn" data-pt-sent="${escapeHtml(c.tm)}" data-pt-ids="${escapeHtml(c.ids.join(','))}">Mark sent</button>
          <span class="pt-count ${text.length > PT_MSG_LIMIT ? 'is-over' : ''}" data-pt-count="${escapeHtml(c.tm)}">${text.length} / ${PT_MSG_LIMIT}</span></div>
      </section>`;
    }).join('')}`;
}

function ptTasksHtml(){
  const leaders = ptLeaders(), items = ptTasks();
  const shown = items.filter(i => !ptTaskFilter || (ptTaskFilter === '__none' ? !i.leader : i.leader === ptTaskFilter));
  const opt = (v, label, cur) => `<option value="${escapeHtml(v)}" ${v === cur ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  return `<section class="dir-card"><h3>Conversations and write-ups owed</h3>
    <p class="dir-note">Every ladder step a team member has reached that no leader has closed. Put a leader’s name on it, then write the memo after the conversation, which closes it.</p>
    <label class="pt-filter">Show <select data-pt-task-filter>${opt('', 'Everyone’s', ptTaskFilter)}${opt('__none', 'Unassigned only', ptTaskFilter)}${leaders.map(n => opt(n, n, ptTaskFilter)).join('')}</select></label>
    ${shown.length ? `<ul class="dir-list pt-tasks">${shown.map(i => `
      <li><span class="pt-step">${i.at}</span><span class="pt-task-what"><b>${escapeHtml(i.name)}</b> ${ptLevelChip(i.total)} <span class="dir-muted">${i.total} QTD</span><br><span>${escapeHtml(i.label)}</span>
        <span class="pt-task-acts"><label>Leader <select data-pt-assign="${escapeHtml(i.tm)}" data-pt-at="${i.at}">${opt('', 'Unassigned', i.leader)}${[...new Set([...leaders, ...(i.leader ? [i.leader] : [])])].map(n => opt(n, n, i.leader)).join('')}</select></label>
          <button type="button" class="btn dir-btn" data-pt-memo="${escapeHtml(i.tm)}" data-pt-at="${i.at}">Write memo &amp; close</button></span></span></li>`).join('')}</ul>`
      : `<p class="dir-empty">${items.length ? 'Nothing matches that filter.' : 'Nothing owed right now.'}</p>`}
  </section>`;
}

function ptMemosHtml(){
  const list = ptMemosThisQuarter(), q = ptMemoSearch.toLowerCase();
  const shown = list.filter(m => !q || APS.displayName(m.tmName).toLowerCase().includes(q));
  return `<section class="dir-card"><h3>Memos of documentation</h3>
    <p class="dir-note">One memo for every ladder step a team member reaches. Closing a task writes it. Download any memo for the HR folder.</p>
    <div class="pt-board-tools"><input type="search" placeholder="Search a name" value="${escapeHtml(ptMemoSearch)}" data-pt-memo-search aria-label="Search memos by name"></div>
    ${shown.length ? `<ul class="dir-list pt-tasks">${shown.map(m => `
      <li><span class="pt-step">${escapeHtml(m.at)}</span><span class="pt-task-what"><b>${escapeHtml(APS.displayName(m.tmName))}</b> · ${escapeHtml(m.title)}<br>
        <span class="dir-muted">${escapeHtml(ptDay(m.date))} · ${escapeHtml(m.leader || '')} · ${escapeHtml((PT_ACKS.find(a => a[0] === m.ack) || [0, 'No acknowledgment'])[1])}${m.followUp ? ` · follow-up ${escapeHtml(ptDay(m.followUp))}` : ''}</span>
        <span class="pt-task-acts"><button type="button" class="btn dir-btn" data-pt-memo-dl="${escapeHtml(m.id)}">Download for HR</button><button type="button" class="btn btn-ghost dir-btn" data-pt-memo-edit="${escapeHtml(m.id)}">View / edit</button></span></span></li>`).join('')}</ul>`
      : `<p class="dir-empty">${list.length ? 'No memos match that name.' : 'No memos yet. They’re written when a leader closes a task.'}</p>`}
  </section>`;
}

function ptMemoFormHtml(){
  const d = ptMemoDraft, f = d.fields, t = PT_MEMO[d.at] || {title: 'Memo'};
  const s = ptScored()[d.tm], m = pointsMemos[d.id];
  const name = APS.displayName((s && s.rec.tmName) || (m && m.tmName) || d.tm);
  const total = m ? m.total : s ? s.score.total : 0;
  const leaders = [...new Set([...ptLeaders(), ...(f.leader ? [f.leader] : [])])];
  const field = (key, label, type) => `<label class="pt-field"><span>${label}</span><input type="${type || 'date'}" value="${escapeHtml(f[key])}" data-pt-mf="${key}"></label>`;
  return `<section class="dir-card pt-memo-form">
    <button type="button" class="btn btn-ghost dir-btn" data-pt-memo-cancel>← Memos</button>
    <h3>${escapeHtml(t.title)}</h3>
    <p class="dir-note">${escapeHtml(name)} · ${PT_STORE.name} · ${total} points QTD · ladder step ${d.at}</p>
    <div class="pt-grid">${field('date', 'Date of conversation')}
      <label class="pt-field"><span>Leader</span><select data-pt-mf="leader"><option value="">Pick a leader</option>${leaders.map(n => `<option ${n === f.leader ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}</select></label>
      ${field('followUp', 'Follow-up date')}${d.at === 75 ? field('susStart', 'Suspension start') + field('susEnd', 'Suspension end') : ''}</div>
    <label class="pt-field"><span>What was discussed</span><textarea rows="5" data-pt-mf="notes" placeholder="What the leader said, what the team member said, anything they raised that is getting in the way.">${escapeHtml(f.notes)}</textarea></label>
    <label class="pt-field"><span>Expectations and next step</span><textarea rows="4" data-pt-mf="plan">${escapeHtml(f.plan)}</textarea></label>
    <fieldset class="pt-acks"><legend>Team member acknowledgment</legend>${PT_ACKS.map(([v, label]) => `<label><input type="radio" name="ptAck" value="${v}" data-pt-mf="ack" ${f.ack === v ? 'checked' : ''}> ${escapeHtml(label)}</label>`).join('')}</fieldset>
    <p class="dir-note">The team member’s full event history this quarter is attached to the memo automatically.</p>
    ${d.error ? `<p class="pt-error" role="alert">${escapeHtml(d.error)}</p>` : ''}
    <div class="pt-actions"><button type="button" class="btn dir-btn" data-pt-memo-save>${d.existing ? 'Save changes' : 'Save memo and close the task'}</button>
      ${d.existing ? `<button type="button" class="btn btn-ghost dir-btn" data-pt-memo-dl="${escapeHtml(d.id)}">Download for HR</button>` : ''}
      <button type="button" class="btn btn-ghost dir-btn" data-pt-memo-cancel>Cancel</button></div>
  </section>`;
}

// ----- Events -----
function ptStatus(text){ const el = document.querySelector('#directorsRoot [data-pt-status]'); if(el) el.textContent = text; }

document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t || !t.closest('#directorsRoot')) return;
  const pane = t.closest('[data-pt-pane]');
  if(pane){ ptPane = pane.dataset.ptPane; ptDetail = ''; ptMemoDraft = null; renderDirectorsView(); return; }
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
  const lang = t.closest('[data-pt-lang]');
  if(lang){ ptSetLang(lang.dataset.ptLang, lang.dataset.ptTo); saveState(); renderDirectorsView(); return; }
  const copy = t.closest('[data-pt-copy]');
  if(copy){
    const ta = document.querySelector(`#directorsRoot [data-pt-msg="${CSS.escape(copy.dataset.ptCopy)}"]`);
    if(!ta) return;
    const done = ok => showToast(ok ? 'Copied' : 'Select the text and copy it');
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(() => done(true), () => { ta.select(); done(false); });
    else { ta.select(); done(false); }
    return;
  }
  const sent = t.closest('[data-pt-sent]');
  if(sent){
    const tm = sent.dataset.ptSent, ta = document.querySelector(`#directorsRoot [data-pt-msg="${CSS.escape(tm)}"]`);
    if(ptMarkSent(tm, sent.dataset.ptIds.split(','), ta ? ta.value : '')){ saveState(); showToast('Marked sent'); }
    renderDirectorsView();
    return;
  }
  const rm = t.closest('[data-pt-remove]');
  if(rm){
    if(!confirm('Remove this event? It stops counting toward the total.')) return;
    if(ptRemoveEvent(rm.dataset.ptTm, rm.dataset.ptRemove)){ saveState(); showToast('Event removed'); }
    renderDirectorsView();
    return;
  }
  const note = t.closest('[data-pt-note]');
  if(note){
    if(ptNoteReceived(note.dataset.ptTm, note.dataset.ptNote)){ saveState(); showToast('Dropped to +10. A thank-you message is waiting.'); }
    renderDirectorsView();
    return;
  }
  const hist = t.closest('[data-pt-history]');
  if(hist){
    const doc = ptHistoryDoc(hist.dataset.ptHistory), s = ptScored()[hist.dataset.ptHistory];
    if(doc && s) ptDownload(doc, `${ptFile(APS.displayName(s.rec.tmName))}_Points_${ptQ()}_${today}.html`);
    return;
  }
  const memoNew = t.closest('[data-pt-memo]');
  if(memoNew){ if(ptOpenMemo(memoNew.dataset.ptMemo, +memoNew.dataset.ptAt)){ renderDirectorsView(); window.scrollTo(0, 0); } return; }
  const memoEdit = t.closest('[data-pt-memo-edit]');
  if(memoEdit){ const m = pointsMemos[memoEdit.dataset.ptMemoEdit]; if(m && ptOpenMemo(m.tm, m.at, memoEdit.dataset.ptMemoEdit)){ renderDirectorsView(); window.scrollTo(0, 0); } return; }
  const memoDl = t.closest('[data-pt-memo-dl]');
  if(memoDl){ const m = pointsMemos[memoDl.dataset.ptMemoDl]; if(m) ptDownload(ptMemoDoc(m), `${ptFile(APS.displayName(m.tmName))}_${ptFile(m.title)}_${m.date || today}.html`); return; }
  if(t.closest('[data-pt-memo-cancel]')){ ptMemoDraft = null; renderDirectorsView(); return; }
  if(t.closest('[data-pt-memo-save]')){
    const wasNew = ptMemoDraft && !ptMemoDraft.existing;
    const err = ptSaveMemo();
    if(err){ ptMemoDraft.error = err; renderDirectorsView(); return; }
    saveState();
    showToast(wasNew ? 'Memo saved. Task closed.' : 'Memo saved');
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
  if(t.matches('[data-pt-msg]')){
    const tm = t.dataset.ptMsg;
    ptMsgEdits[tm] = t.value;
    const c = document.querySelector(`#directorsRoot [data-pt-count="${CSS.escape(tm)}"]`);
    if(c){ c.textContent = `${t.value.length} / ${PT_MSG_LIMIT}`; c.classList.toggle('is-over', t.value.length > PT_MSG_LIMIT); }
    return;
  }
  if(t.matches('[data-pt-mf]') && ptMemoDraft){ if(t.type !== 'radio' || t.checked) ptMemoDraft.fields[t.dataset.ptMf] = t.value; return; }
  if(t.matches('[data-pt-memo-search]')){
    ptMemoSearch = t.value;
    const pos = t.selectionStart;
    renderDirectorsView();
    const again = document.querySelector('#directorsRoot [data-pt-memo-search]');
    if(again){ again.focus(); try{ again.setSelectionRange(pos, pos); }catch(err){} }
    return;
  }
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
  if(t.matches('[data-pt-task-filter]')){ ptTaskFilter = t.value; renderDirectorsView(); return; }
  if(t.matches('[data-pt-assign]')){
    if(ptAssign(t.dataset.ptAssign, +t.dataset.ptAt, t.value)){ saveState(); showToast(t.value ? `Assigned to ${t.value}` : 'Unassigned'); }
    renderDirectorsView();
    return;
  }
  if(t.matches('[data-pt-mf]') && ptMemoDraft){ if(t.type !== 'radio' || t.checked) ptMemoDraft.fields[t.dataset.ptMf] = t.value; return; }
  if(!t.matches('[data-pt-file]') || !t.files || !t.files[0]) return;
  const file = t.files[0];
  ptStatus(`Reading ${file.name}…`);
  try{
    const parsed = APS.parseReport(await ptReadPdf(file));
    if(!parsed.shifts.length){ ptStatus('No shifts found. Is this the Actual vs. Scheduled report?'); return; }
    if(ptIsOtherStore(parsed)){ ptStatus(`This report is for ${parsed.location}. Only Chick-fil-A Buda reports are scored here.`); return; }
    ptPending = Object.assign(ptPrepare(parsed), {file: file.name});
    renderDirectorsView();
  }catch(err){
    console.warn('Punch report:', err);
    ptStatus('Couldn’t read that PDF. Try downloading the report again.');
  }
});
