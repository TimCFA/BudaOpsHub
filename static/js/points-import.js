// ===== POINTS: BRING IN THE OLD TRACKER (Directors → Points → Upload) =====
// A one-time move from the Buda Accountability Points artifact into the hub
// (Tim, Oct 13 2026). Its "Export all" workbook has these sheets:
//   Totals        Team member, Quarter, Points QTD, ...   (checked, not stored)
//   Events        Team member, Quarter, Date, Type (the label), Points,
//                 Running total, Status, Detail, Note, Source, Messaged, Logged
//   Ladder steps  Team member, Quarter, Step, Closed (a date or "open"), Leader, Memo
//   Memos         Team member, Quarter, Step, Memo, Date, Leader, Follow-up,
//                 Acknowledgment, Suspension start/end, Points at the time,
//                 What was discussed, Expectations
//   Messages      Team member, Quarter, Sent, Message
//   Roster        Team member, Active, Not scored, Language, Connecteam ID, Added
//   Uploads       Report run, Covers from, Covers to, Quarter, Events added, Uploaded
//
// Nothing is written until every team member's total, scored by this hub's
// own engine (APS.scoreTM), matches the Totals sheet. Events keep their
// status (confirmed / dismissed), detail, note, source and the day they were
// messaged; ladder steps closed there are closed here (open ones keep the
// leader who claimed them); the roster's "not scored", language and active
// flags carry over for anyone the hub has no settings for yet. Imported
// events carry ids built from the workbook, so bringing the same file in
// twice adds nothing twice, and the next punch report skips what was already
// imported (ptPrepare). Names are kept as the export shows them ("First
// Last"); ptKeyFor in points.js matches them to the reports' "Last, First".

let piPending = null;   // a read workbook waiting to be brought in: {file, plan}

const piClean = v => v === null || v === undefined ? '' : String(v).trim();
const piDay = v => { const m = piClean(v).match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : ''; };
// "2026-10-06 14:21" (the store's local time) as the hub keeps times.
const piTime = v => { const s = piClean(v); const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2}))?/); return m ? `${m[1]}T${(m[2] || '12').padStart(2, '0')}:${m[3] || '00'}:00` : ''; };
const piYes = v => /^(yes|true|y|1)$/i.test(piClean(v));

// The workbook's sheets as {name: [row objects]}, from SheetJS.
function piSheets(wb){
  const out = {};
  wb.SheetNames.forEach(n => { out[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], {defval: '', raw: false}); });
  return out;
}

// What bringing `sheets` in would do, worked out without touching anything:
// {quarter, recs: {tm: {tm, tmName, events, acks, assign, messages}}, team,
//  memos, uploads, counts, problems: [what stops it]}.
function piPlan(sheets){
  const problems = [];
  const S = n => Array.isArray(sheets[n]) ? sheets[n] : [];
  const events = S('Events'), totals = S('Totals');
  if(!events.length && !totals.length) return {problems: ['This isn’t the old tracker’s export: it has no Events or Totals sheet.']};
  const settings = ptSettings();
  if(settings.testMode) problems.push('A test run is on. End it in Points → Settings first, so the import lands in the real quarter.');
  const quarters = [...new Set([...events, ...totals].map(r => piClean(r.Quarter)).filter(Boolean))];
  const q = quarters[0] || '';
  if(quarters.length !== 1) problems.push(`The export covers ${quarters.length ? quarters.join(', ') : 'no quarter'}; one quarter at a time.`);
  else if(q !== settings.quarter) problems.push(`The export is for ${q}; the hub is scoring ${settings.quarter}.`);

  const byLabel = {};
  Object.keys(APS.TYPES).forEach(k => { byLabel[APS.TYPES[k].label.toLowerCase()] = k; });
  const have = (pointsRecords && pointsRecords[q]) || {};
  const recs = {};
  const rec = name => {
    const tm = ptKeyFor(name);
    return recs[tm] || (recs[tm] = {tm, tmName: (have[tm] && have[tm].tmName) || name, events: [], acks: {}, assign: {}, messages: []});
  };
  const unknown = new Set(), counts = {events: 0, confirmed: 0, dismissed: 0, already: 0, messages: 0, closed: 0, open: 0, memos: 0, teamNew: 0, teamKept: 0, uploads: 0};
  const occ = {}, seqOf = {}, fromExport = {};
  const pools = {};
  Object.keys(have).forEach(tm => { pools[tm] = (have[tm].events || []).slice(); });

  events.forEach(row => {
    const name = piClean(row['Team member']), date = piDay(row.Date), type = byLabel[piClean(row.Type).toLowerCase()];
    if(!name || !date) return;
    if(!type){ unknown.add(piClean(row.Type)); return; }
    const status = /dismiss/i.test(piClean(row.Status)) ? 'dismissed' : /review/i.test(piClean(row.Status)) ? 'review' : 'confirmed';
    const r = rec(name);
    const occKey = `${r.tm}|${date}|${type}`;
    occ[occKey] = (occ[occKey] || 0) + 1;
    seqOf[r.tm] = (seqOf[r.tm] || 0) + 1;
    const e = {id: `imp_${r.tm}_${date}_${type}_${occ[occKey]}`, tm: r.tm, tmName: r.tmName, date, type, status,
      detail: piClean(row.Detail), source: /manual/i.test(piClean(row.Source)) ? 'manual' : 'report', imported: true,
      seq: String(seqOf[r.tm]).padStart(3, '0'), createdAt: piTime(row.Logged) || new Date().toISOString(), by: ''};
    const note = piClean(row.Note);
    if(note) e.note = note;
    const pts = piClean(row.Points);
    if(pts !== '' && APS.TYPES[type].pts === null && !PT_PUNCT.includes(type)) e.points = Number(pts) || 0;
    if(piDay(row.Messaged)) e.messagedAt = piTime(row.Messaged);
    (fromExport[r.tm] = fromExport[r.tm] || []).push(e);
    // Already in the hub: the same id (brought in before), or the same thing
    // that day from a punch report added here.
    const pool = pools[r.tm] || [];
    if(pool.some(x => x.id === e.id) || (!(have[r.tm] && have[r.tm].events.some(x => x.imported)) && ptImportedTwin(pool, e))){ counts.already++; return; }
    r.events.push(e);
    counts.events++;
    counts[status] = (counts[status] || 0) + 1;
  });
  if(unknown.size) problems.push(`Types the hub doesn’t know: ${[...unknown].join(', ')}.`);

  // Every total, scored here from the export's own events, against the export's.
  const mismatched = [];
  totals.forEach(row => {
    const name = piClean(row['Team member']);
    if(!name) return;
    const tm = ptKeyFor(name);
    const evs = (fromExport[tm] || []).filter(e => e.status === 'confirmed').map(e => Object.assign({}, e));
    const got = APS.scoreTM(evs).total, want = Number(piClean(row['Points QTD'])) || 0;
    if(got !== want) mismatched.push(`${name} (${want} there, ${got} here)`);
  });
  if(mismatched.length) problems.push(`Totals that don’t come out the same here: ${mismatched.slice(0, 6).join('; ')}${mismatched.length > 6 ? ` and ${mismatched.length - 6} more` : ''}.`);

  // Messages sent, oldest first, the latest PT_MESSAGES_KEPT per person.
  S('Messages').forEach(row => {
    const name = piClean(row['Team member']), text = piClean(row.Message), at = piTime(row.Sent);
    if(!name || !text) return;
    const r = rec(name);
    const old = (have[r.tm] && have[r.tm].messages) || [];
    if(old.some(m => m.at === at && m.text === text)) return;
    r.messages.push({at, by: '', text, ids: [], imported: true});
    counts.messages++;
  });
  Object.values(recs).forEach(r => { r.messages.sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : 0); });

  // Memos, then the ladder (a closed step points at its memo).
  const memos = {};
  const ackOf = v => { const s = piClean(v).toLowerCase(); const hit = PT_ACKS.find(([k, label]) => s === k || s === label.toLowerCase()); return hit ? hit[0] : ''; };
  S('Memos').forEach(row => {
    const name = piClean(row['Team member']), at = Number(piClean(row.Step));
    if(!name || !at) return;
    const r = rec(name), id = ptMemoId(r.tm, at, q);
    if(pointsMemos && pointsMemos[id]) return;
    const date = piDay(row.Date) || today;
    const evs = (fromExport[r.tm] || []).filter(e => e.status === 'confirmed' && e.date <= date).map(e => Object.assign({}, e));
    const sc = APS.scoreTM(evs);
    const memo = {tm: r.tm, tmName: r.tmName, quarter: q, at, title: piClean(row.Memo) || (PT_MEMO[at] || {title: 'Memo'}).title,
      total: Number(piClean(row['Points at the time'])) || sc.total, date, leader: piClean(row.Leader), followUp: piDay(row['Follow-up']),
      notes: piClean(row['What was discussed']), plan: piClean(row.Expectations), ack: ackOf(row.Acknowledgment),
      events: sc.events.map(e => ({date: e.date, label: APS.TYPES[e.type].label + (e.punctN ? ` #${e.punctN}` : ''), detail: e.detail || '', pts: e.pts, running: e.running})),
      createdAt: piTime(row.Date) || new Date().toISOString(), updatedAt: new Date().toISOString(), by: '', imported: true};
    if(at === 75){ memo.susStart = piDay(row['Suspension start']); memo.susEnd = piDay(row['Suspension end']); }
    memos[id] = memo;
    counts.memos++;
  });
  S('Ladder steps').forEach(row => {
    const name = piClean(row['Team member']), at = Number(piClean(row.Step)), leader = piClean(row.Leader), closed = piDay(row.Closed);
    if(!name || !at) return;
    const r = rec(name), old = have[r.tm] || {};
    if(closed){
      if((old.acks || {})[at]) return;
      const memo = ptMemoId(r.tm, at, q);
      r.acks[at] = Object.assign({at: piTime(row.Closed), by: '', leader}, memos[memo] || (pointsMemos && pointsMemos[memo]) ? {memo} : {});
      counts.closed++;
    } else if(leader){
      if((old.acks || {})[at] || (old.assign || {})[at]) return;
      r.assign[at] = {leader, at: '', by: ''};
      counts.open++;
    }
  });

  // The roster: settings for anyone the hub has none for.
  const team = {};
  S('Roster').forEach(row => {
    const name = piClean(row['Team member']);
    if(!name) return;
    const tm = ptKeyFor(name);
    if(pointsTeam && pointsTeam[tm]){ counts.teamKept++; return; }
    const t = {name, active: piClean(row.Active) === '' ? true : piYes(row.Active), excluded: piYes(row['Not scored']),
      lang: /span|es/i.test(piClean(row.Language)) ? 'es' : 'en', imported: true};
    const cid = piClean(row['Connecteam ID']);
    if(cid) t.connecteamId = cid;
    team[tm] = t;
    counts.teamNew++;
  });

  // The reports it read, for Recent reports.
  const uploads = [];
  S('Uploads').forEach(row => {
    const runDate = piDay(row['Report run']), from = piDay(row['Covers from']), to = piDay(row['Covers to']);
    if(!runDate || piClean(row.Quarter) !== q) return;
    if((pointsUploads || []).some(u => u.imported && u.runDate === runDate && u.coversTo === to)) return;
    uploads.push({at: piTime(row.Uploaded) || piTime(runDate), by: '', file: 'Old tracker', range: from && to ? [from, to] : null, runDate, coversTo: to || null,
      added: Number(piClean(row['Events added'])) || 0, quarter: q, imported: true});
    counts.uploads++;
  });

  return {quarter: q, recs, team, memos, uploads, counts, problems,
    people: Object.values(recs).filter(r => r.events.length || r.messages.length || Object.keys(r.acks).length || Object.keys(r.assign).length).length,
    totalsChecked: totals.length, mismatched: mismatched.length};
}

// Brings a plan in. Returns how many events were added.
function piApply(plan){
  if(!plan || plan.problems.length) return 0;
  const q = plan.quarter;
  if(!pointsRecords[q]) pointsRecords[q] = {};
  const recs = pointsRecords[q];
  Object.values(plan.recs).forEach(p => {
    const r = recs[p.tm] || (recs[p.tm] = {tm: p.tm, tmName: p.tmName, events: []});
    r.events = (r.events || []).concat(p.events);
    if(p.messages.length) r.messages = (r.messages || []).concat(p.messages).sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : 0).slice(-PT_MESSAGES_KEPT);
    if(Object.keys(p.acks).length) r.acks = Object.assign({}, r.acks || {}, p.acks);
    if(Object.keys(p.assign).length) r.assign = Object.assign({}, r.assign || {}, p.assign);
  });
  Object.assign(pointsTeam, plan.team);
  Object.assign(pointsMemos, plan.memos);
  pointsUploads.push(...plan.uploads);
  pointsUploads.sort((a, b) => (a.at || '') < (b.at || '') ? 1 : -1);
  if(pointsUploads.length > PT_UPLOADS_KEPT) pointsUploads.length = PT_UPLOADS_KEPT;
  pointsSettings = Object.assign({}, pointsSettings || {}, {lastImport: {at: new Date().toISOString(), by: typeof getInitials === 'function' ? getInitials() : '',
    file: String(plan.file || '').slice(0, 120), events: plan.counts.events, people: plan.people}});
  return plan.counts.events;
}

// ----- The card on Points → Upload -----
function piCardHtml(){
  const last = ptSettings().lastImport;
  const p = piPending && piPending.plan;
  const c = p && p.counts;
  const num = (label, n, sub) => `<div class="dir-num"><span>${escapeHtml(label)}</span><b>${n}</b>${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</div>`;
  const preview = p ? `
      <div class="pt-preview">
        <h4>${escapeHtml(piPending.file)}</h4>
        ${p.problems.length ? `<div class="dir-flag-text">${p.problems.map(x => `<p>${escapeHtml(x)}</p>`).join('')}<p>Nothing was brought in.</p></div>` : `<p class="dir-note">All ${p.totalsChecked} totals come out the same with the hub’s scoring. Nothing is saved until you bring it in.</p>`}
        ${c ? `<div class="dir-nums">
          ${num('Events', c.events, `${c.confirmed || 0} counting · ${c.dismissed || 0} dismissed${c.already ? ` · ${c.already} already here` : ''}`)}
          ${num('Team members', p.people)}
          ${num('Messages sent', c.messages)}
          ${num('Ladder steps', c.closed + c.open, `${c.closed} closed · ${c.open} claimed`)}
          ${num('Memos', c.memos)}
          ${num('Roster', c.teamNew, c.teamKept ? `${c.teamKept} already set here` : 'not scored, language, active')}
        </div>` : ''}
        <div class="pt-actions">
          <button type="button" class="btn dir-btn" data-pi-commit ${!p.problems.length && (c.events || c.messages || c.memos || c.teamNew || c.closed || c.open) ? '' : 'disabled'}>Bring it in</button>
          <button type="button" class="btn btn-ghost dir-btn" data-pi-cancel>Cancel</button>
        </div>
      </div>` : '';
  return `
    <section class="dir-card">
      <h3>Bring in the old tracker</h3>
      <p class="dir-note">The “Export all” workbook (.xlsx) from the Accountability Points artifact. Its points, leaders’ calls, messages sent, ladder steps, memos and roster land in this quarter as they were there. Bringing the same file in twice adds nothing twice.</p>
      ${last ? `<p class="dir-note">Brought in ${escapeHtml(ptDay(String(last.at || '').slice(0, 10)))}${last.by ? ` by ${escapeHtml(last.by)}` : ''}: ${last.events} events for ${last.people} team members.</p>` : ''}
      <label class="pt-drop"><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-pi-file hidden><span>Choose the .xlsx</span></label>
      <p class="dir-note" data-pi-status role="status"></p>
      ${preview}
    </section>`;
}

function piStatus(text){ const el = document.querySelector('#directorsRoot [data-pi-status]'); if(el) el.textContent = text; }

document.addEventListener('change', async e => {
  const t = e.target;
  if(!t || !t.matches || !t.matches('#directorsRoot [data-pi-file]') || !t.files || !t.files[0]) return;
  const file = t.files[0];
  if(typeof XLSX === 'undefined'){ piStatus('The spreadsheet reader didn’t load. Reload the page and try again.'); return; }
  piStatus(`Reading ${file.name}…`);
  try{
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {type: 'array'});
    const plan = piPlan(piSheets(wb));
    plan.file = file.name;
    piPending = {file: file.name, plan};
    renderDirectorsView();
  }catch(err){
    console.warn('Old tracker import:', err);
    piStatus('Couldn’t read that file. Export it again from the artifact and try once more.');
  }
});

document.addEventListener('click', async e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t || !t.closest('#directorsRoot')) return;
  if(t.closest('[data-pi-cancel]')){ piPending = null; renderDirectorsView(); return; }
  if(t.closest('[data-pi-commit]') && piPending){
    const n = piApply(piPending.plan);
    piPending = null;
    renderDirectorsView();
    showToast(`Brought in ${n} event${n === 1 ? '' : 's'} from the old tracker`);
    await saveState();
  }
});
