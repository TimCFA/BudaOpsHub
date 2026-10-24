// ===== LEADERS: BRING NOTES IN =====
// A lot of notes at once (Tim, Oct 2026), onto the leaders' profiles:
//
//  - a spreadsheet or CSV, one note a row (leader, date, type, note, and
//    optionally pillar tags and who wrote it; a header row is recognised
//    loosely, or the columns are taken in that order);
//  - the JSON the Leader Notes Calendar page exports (its notes and each
//    quarter's focus);
//  - plain text, pasted or dropped: a leader's name on its own line, then
//    each note on a line starting with its date ("Oct 3 win: ..." or
//    "2026-10-03 - ..."), running on over the lines below it. A line with
//    no date under a name is a note dated today.
//
// Everything lands in a review list first: each row's leader (matched to a
// known leader, by full name or an unambiguous first name), date, type and
// text can be fixed, rows that match a note already saved start unticked,
// and nothing is written until "Add". A row typed "focus" becomes an item
// of that leader's focus for the date's quarter.

const LDI_TYPE_WORDS = {win: 'win', wins: 'win', coaching: 'coach', coach: 'coach', watch: 'watch', watching: 'watch', conversation: 'talk', conversations: 'talk', talk: 'talk', convo: 'talk', focus: 'focus', note: '', notes: ''};
const LDI_MAX = 4000;   // characters a note keeps
const LDI_MONTHS = {jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12};
const LDI_MONTH_WORD = /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?)$/i;
const ldiMonth = w => LDI_MONTH_WORD.test(w) ? LDI_MONTHS[w.slice(0, 3).toLowerCase()] : null;

let ldiOpen = false;   // the import card is showing
let ldiItems = null;   // the review list: [{leader, match, date, type, text, pec, by, on, dup, nodate}]
let ldiSource = '';    // what was read
let ldiSkipped = 0;    // text lines that belonged to no leader

// ----- Reading dates and types -----
// "2026-10-03", "10/3/2026", "10/3/26", "10/3", "Oct 3", "Oct 3, 2026",
// "October 3rd 2026", "3 Oct 2026", "Friday, Oct 3" → ISO, else null.
function ldiDate(s){
  let t = String(s || '').trim().replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+/i, '').replace(/(\d)(st|nd|rd|th)\b/gi, '$1').replace(/,/g, ' ').replace(/\s+/g, ' ');
  const year = +today.slice(0, 4);
  const mk = (y, m, d) => { if(y < 100) y += 2000; if(m < 1 || m > 12 || d < 1 || d > 31) return null; const dt = new Date(y, m - 1, d); return dt.getMonth() === m - 1 ? toLocalISODate(dt) : null; };
  let m;
  if((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/))) return mk(+m[1], +m[2], +m[3]);
  if((m = t.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/))) return mk(m[3] ? +m[3] : year, +m[1], +m[2]);
  if((m = t.match(/^([a-z]{3,9})\.? (\d{1,2})(?: (\d{4}))?$/i)) && ldiMonth(m[1])) return mk(m[3] ? +m[3] : year, ldiMonth(m[1]), +m[2]);
  if((m = t.match(/^(\d{1,2}) ([a-z]{3,9})\.?(?: (\d{4}))?$/i)) && ldiMonth(m[2])) return mk(m[3] ? +m[3] : year, ldiMonth(m[2]), +m[1]);
  return null;
}
// A line that opens with a date: {date, rest} or null.
const LDI_DATE_HEAD = /^((?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?|[a-z]{3,9}\.? \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?|\d{1,2} [a-z]{3,9}\.?(?: \d{4})?))(?=$|[\s:\-–—·|,])/i;
function ldiDateHead(line){
  const m = line.match(LDI_DATE_HEAD);
  if(!m) return null;
  const date = ldiDate(m[1]);
  if(!date) return null;
  return {date, rest: line.slice(m[0].length).replace(/^[\s:\-–—·|,]+/, '')};
}
// "win: text" / "Coaching - text" → {type, rest}.
function ldiTypeHead(rest){
  const m = rest.match(/^([a-z]+)\s*[:\-–—]\s*/i);
  const type = m && LDI_TYPE_WORDS[m[1].toLowerCase()];
  return type !== undefined && m ? {type, rest: rest.slice(m[0].length)} : {type: '', rest};
}
function ldiType(s){ const t = String(s || '').trim().toLowerCase(); const v = LDI_TYPE_WORDS[t]; return v === undefined ? '' : v; }

// ----- Leaders -----
// Known leader names: the Leaders list, this quarter's profiles, anyone
// with notes, everyone rated or rating in Levelset.
function ldiKnownNames(){
  const out = new Map();
  const add = n => { const k = dirKey(n); if(k && !out.has(k)) out.set(k, n); };
  ldRoster().forEach(r => add(r.name));
  ldLeaderNames(ldQuarterNow()).forEach(add);
  Object.keys(leaderNotes).forEach(add);
  ldRatings().forEach(r => { if(r.employee) add(r.employee); if(r.leader) add(r.leader); });
  return [...out.values()];
}
// The known leader a typed name means: the same name, or an unambiguous
// first name; '' when nobody matches.
function ldiMatchLeader(name, known){
  const k = dirKey(name);
  if(!k) return '';
  const exact = known.find(n => dirKey(n) === k);
  if(exact) return exact;
  const firsts = known.filter(n => dirKey(n).split(' ')[0] === k);
  return firsts.length === 1 ? firsts[0] : '';
}

// ----- Parsers → rows {leader, date, type, text, pec, by} -----
function ldiParseText(text, known){
  const rows = [];
  let leader = '', cur = null, skipped = 0;
  const isName = line => {
    const bare = line.replace(/^#+\s*/, '').replace(/[:\-–—]\s*$/, '').trim();
    if(!bare || bare.split(/\s+/).length > 4 || ldiDateHead(bare)) return '';
    if(ldiMatchLeader(bare, known)) return bare;
    // A heading, or a capitalised name with a colon on its own, names someone the hub doesn't know yet.
    return /^#/.test(line) || (/:$/.test(line.trim()) && /^[A-Z][a-z'-]+(?: [A-Z][a-z'-]+)*$/.test(bare)) ? bare : '';
  };
  String(text || '').replace(/\r/g, '').split('\n').forEach(raw => {
    const line = raw.trim();
    if(!line){ cur = null; return; }
    const name = isName(line);
    if(name){ leader = name; cur = null; return; }
    const d = ldiDateHead(line);
    if(d){
      if(!leader){ skipped++; cur = null; return; }
      const t = ldiTypeHead(d.rest);
      cur = {leader, date: d.date, type: t.type, text: t.rest};
      rows.push(cur);
      return;
    }
    if(cur){ cur.text = (cur.text ? cur.text + '\n' : '') + line; return; }
    if(!leader){ skipped++; return; }
    const t = ldiTypeHead(line);
    cur = {leader, date: today, nodate: true, type: t.type, text: t.rest};
    rows.push(cur);
  });
  return {rows: rows.filter(r => r.text.trim()), skipped};
}

// Rows of cells (a sheet or CSV). A header row is matched loosely; without
// one the columns are leader, date, type, note (or leader, date, note).
function ldiParseCells(cells){
  const rows = cells.map(r => (r || []).map(c => String(c == null ? '' : c).trim())).filter(r => r.some(c => c));
  if(!rows.length) return {rows: [], skipped: 0};
  const head = rows[0].map(h => h.toLowerCase());
  const find = re => head.findIndex(h => re.test(h));
  const col = {leader: find(/^(leader|name|who|person|employee|team ?member)$/), date: find(/date|when/), type: find(/^(type|kind)$/), text: find(/note|text|comment|what|detail/), pec: find(/pillar|tag|pec/), by: find(/^(by|author|director)$/)};
  let body = rows;
  if(col.leader >= 0 && col.text >= 0) body = rows.slice(1);
  else {
    const w = rows[0].length;
    col.leader = 0; col.date = 1; col.type = w >= 4 ? 2 : -1; col.text = w >= 4 ? 3 : 2; col.pec = w >= 5 ? 4 : -1; col.by = w >= 6 ? 5 : -1;
    if(w < 3) return {rows: [], skipped: rows.length};
  }
  const out = [];
  let skipped = 0;
  body.forEach(r => {
    const leader = r[col.leader] || '', text = col.text >= 0 ? r[col.text] || '' : '';
    if(!leader || !text){ skipped++; return; }
    const date = col.date >= 0 ? ldiDate(r[col.date]) : null;
    const row = {leader, date: date || today, nodate: !date, type: col.type >= 0 ? ldiType(r[col.type]) : '', text};
    if(col.pec >= 0 && r[col.pec]) row.pec = r[col.pec].split(/[,;]/).map(s => s.trim()).filter(Boolean);
    if(col.by >= 0 && r[col.by]) row.by = r[col.by].slice(0, 12);
    out.push(row);
  });
  return {rows: out, skipped};
}
// CSV / TSV text → cells.
function ldiSplitCsv(text){
  const src = String(text || '').replace(/^\uFEFF/, '');
  const first = src.split(/\r?\n/).find(l => l.trim()) || '';
  const delim = (first.match(/\t/g) || []).length >= (first.match(/,/g) || []).length && first.includes('\t') ? '\t' : ',';
  const rows = []; let row = [], field = '', q = false;
  for(let i = 0; i < src.length; i++){
    const c = src[i];
    if(q){ if(c === '"'){ if(src[i + 1] === '"'){ field += '"'; i++; } else q = false; } else field += c; }
    else if(c === '"') q = true;
    else if(c === delim){ row.push(field); field = ''; }
    else if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
    else if(c !== '\r') field += c;
  }
  if(field || row.length){ row.push(field); rows.push(row); }
  return rows;
}
// The Leader Notes Calendar page's data: {notes: [{date, person, type, text, pec, createdAt}], focus: [{personKey, quarter, items}]},
// or a bare list of notes.
function ldiParseJson(obj){
  const notes = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.notes)) ? obj.notes : [];
  const focus = obj && Array.isArray(obj.focus) ? obj.focus : [];
  const out = [];
  notes.forEach(n => {
    if(!n || typeof n !== 'object') return;
    const date = ldiDate(n.date), text = String(n.text || '').trim();
    const leader = String(n.person || n.personKey || n.leader || '').trim();
    if(!leader || !text) return;
    const row = {leader, date: date || today, nodate: !date, type: ldiType(n.type), text};
    if(Array.isArray(n.pec) && n.pec.length) row.pec = n.pec.map(String);
    if(n.by) row.by = String(n.by).slice(0, 12);
    out.push(row);
  });
  focus.forEach(f => {
    if(!f || typeof f !== 'object' || !Array.isArray(f.items)) return;
    const leader = String(f.personKey || f.person || '').trim();
    const q = /^\d{4}-Q[1-4]$/.test(f.quarter || '') ? ldQuarterBounds(f.quarter).from : today;
    f.items.forEach(item => { const text = String(item || '').trim(); if(leader && text) out.push({leader, date: q, type: 'focus', text}); });
  });
  return {rows: out, skipped: Math.max(0, notes.length - out.filter(r => r.type !== 'focus').length)};
}

// ----- The review list -----
function ldiStage(parsed, source){
  const known = ldiKnownNames();
  ldiItems = parsed.rows.map(r => {
    const match = ldiMatchLeader(r.leader, known);
    const text = r.text.trim().slice(0, LDI_MAX);
    const dup = r.type === 'focus'
      ? ldFocusFor(match || r.leader, ldQuarterKey(r.date)).some(f => f === text)
      : ldNotesFor(match || r.leader).some(n => ldNoteDate(n) === r.date && n.text === text);
    return {leader: r.leader, match, date: r.date, type: r.type || '', text, pec: (r.pec || []).filter(t => ldPillarLabel(t) !== t), by: r.by || '', nodate: !!r.nodate, dup, on: !dup};
  });
  ldiSource = source;
  ldiSkipped = parsed.skipped || 0;
}
function ldiReadText(text, source){
  const t = String(text || '');
  const trimmed = t.trim();
  if(/^[\[{]/.test(trimmed)){
    try{ ldiStage(ldiParseJson(JSON.parse(trimmed)), source); return; }catch(e){ /* not JSON: read as text */ }
  }
  const first = (t.split(/\r?\n/).find(l => l.trim()) || '');
  if(/\t/.test(first) || (first.split(',').length >= 3 && /leader|name|who|date/i.test(first))) ldiStage(ldiParseCells(ldiSplitCsv(t)), source);
  else ldiStage(ldiParseText(t, ldiKnownNames()), source);
}
function ldiReadFile(file){
  if(!window.XLSX && /\.(xlsx|xls)$/i.test(file.name)){ xlsxReady().then(() => ldiReadFile(file), err => showToast(err.message)); return; }
  const reader = new FileReader();
  if(/\.(xlsx|xls)$/i.test(file.name)){
    reader.onload = () => {
      try{
        const wb = XLSX.read(new Uint8Array(reader.result), {type: 'array'});
        const cells = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, raw: false, defval: ''});
        ldiStage(ldiParseCells(cells), file.name);
      }catch(e){ showToast('Couldn’t read that spreadsheet'); return; }
      ldRender();
    };
    reader.readAsArrayBuffer(file);
  } else {
    reader.onload = () => {
      const text = typeof pbDecodeText === 'function' ? pbDecodeText(reader.result) : new TextDecoder().decode(new Uint8Array(reader.result));
      if(/\.csv$/i.test(file.name)) ldiStage(ldiParseCells(ldiSplitCsv(text)), file.name);
      else if(/\.json$/i.test(file.name)){ try{ ldiStage(ldiParseJson(JSON.parse(text)), file.name); }catch(e){ showToast('That file isn’t the notes export'); return; } }
      else ldiReadText(text, file.name);
      ldRender();
    };
    reader.readAsArrayBuffer(file);
  }
}

// Writes the ticked rows. Returns {notes, focus} counts.
function ldiAdd(){
  const by = (typeof getInitials === 'function' && getInitials()) || '';
  let notes = 0, focus = 0;
  (ldiItems || []).forEach(it => {
    if(!it.on || !it.text.trim()) return;
    const name = it.match || it.leader.trim();
    if(!name) return;
    if(it.type === 'focus'){
      const key = `${dirKey(name)}__${ldQuarterKey(it.date)}`;
      const list = Array.isArray(leaderFocus[key]) ? leaderFocus[key] : [];
      if(!list.includes(it.text)){ leaderFocus[key] = [...list, it.text].slice(0, 10); focus++; }
      return;
    }
    const note = {text: it.text, by: it.by || by, ts: Date.now(), date: it.date};
    if(it.type) note.type = it.type;
    if(it.pec && it.pec.length) note.pec = it.pec;
    ldSaveNote(name, note); notes++;
  });
  return {notes, focus};
}

// ----- The card -----
function ldiCardHtml(){
  const known = ldiKnownNames().sort((a, b) => a.localeCompare(b));
  const items = ldiItems || [];
  const onCount = items.filter(i => i.on).length, dups = items.filter(i => i.dup).length, unknown = items.filter(i => !i.match).length;
  const typeOpts = sel => `<option value="" ${!sel ? 'selected' : ''}>Note</option>${LD_TYPES.map(t => `<option value="${t.id}" ${sel === t.id ? 'selected' : ''}>${escapeHtml(t.label)}</option>`).join('')}<option value="focus" ${sel === 'focus' ? 'selected' : ''}>Focus item</option>`;
  return `<section class="dir-card ldi-card"><div class="ld-row"><h3>Bring notes in</h3><button type="button" class="dir-x" data-ldi-close aria-label="Close">${UO_X_ICON}</button></div>
    <p class="dir-note">A spreadsheet or CSV with a note a row (leader, date, type, note; a header row helps), the JSON from the Leader Notes Calendar page, or plain text: a leader’s name on its own line, then each note on a line starting with its date, like <code>Oct 3 win: Caught the sanitizer gap herself</code>. Types are Win, Coaching, Watch, Conversation or Focus. Nothing is saved until you add it.</p>
    <div class="ldi-in">
      <label class="btn btn-ghost dir-btn ldi-file">Choose a file <input type="file" id="ldiFile" accept=".csv,.xlsx,.xls,.txt,.md,.json" hidden></label>
      <span class="dir-muted">or paste below</span>
    </div>
    <textarea id="ldiText" rows="6" placeholder="Maya Torres&#10;Oct 3 win: Caught the sanitizer gap herself before the walkthrough.&#10;Oct 7 coaching: Handoff ran late; we walked the 2pm checklist together.&#10;&#10;Jordan Reyes&#10;10/5 conversation: Talked through the Talent Leader card and what Q4 looks like."></textarea>
    <div class="ld-acts"><button type="button" class="btn btn-primary dir-btn" data-ldi-read>Read it</button></div>
    ${ldiItems ? `<div class="ldi-review">
      <p class="dir-note"><b>${escapeHtml(ldiSource)}:</b> ${ldPlural(items.length, 'row')} found${dups ? `, ${dups} already saved (unticked)` : ''}${unknown ? `, ${unknown} with a name that matches no leader (pick one, or they’re added as typed)` : ''}${ldiSkipped ? `, ${ldPlural(ldiSkipped, 'line')} skipped (no leader named above them)` : ''}.</p>
      ${items.length ? `<div class="ldi-rows">${items.map((it, i) => `
        <div class="ldi-row ${it.on ? '' : 'is-off'} ${it.match ? '' : 'is-new'}">
          <label class="ldi-on"><input type="checkbox" data-ldi-f="on" data-ldi-i="${i}" ${it.on ? 'checked' : ''}><span></span></label>
          <select data-ldi-f="match" data-ldi-i="${i}" aria-label="Leader"><option value="" ${it.match ? '' : 'selected'}>${escapeHtml(it.leader)}${it.match ? '' : ' (as typed)'}</option>${known.map(n => `<option value="${escapeHtml(n)}" ${n === it.match ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}</select>
          <input type="date" value="${escapeHtml(it.date)}" max="${today}" data-ldi-f="date" data-ldi-i="${i}" aria-label="Date" class="${it.nodate ? 'is-guess' : ''}" title="${it.nodate ? 'No date read: today' : ''}">
          <select data-ldi-f="type" data-ldi-i="${i}" aria-label="Type">${typeOpts(it.type)}</select>
          <textarea rows="2" data-ldi-f="text" data-ldi-i="${i}" aria-label="Note" maxlength="${LDI_MAX}">${escapeHtml(it.text)}</textarea>
          ${it.pec.length ? `<div class="ld-tags">${it.pec.map(g => `<span>${escapeHtml(ldPillarLabel(g))}</span>`).join('')}</div>` : ''}
          ${it.dup ? '<span class="ld-pill">Already saved</span>' : ''}
        </div>`).join('')}</div>
      <div class="ld-acts"><button type="button" class="btn btn-primary dir-btn" data-ldi-add ${onCount ? '' : 'disabled'}>Add ${onCount} ${onCount === 1 ? 'row' : 'rows'}</button><button type="button" class="btn btn-ghost dir-btn" data-ldi-clear>Clear</button></div>` : ''}
    </div>` : ''}
  </section>`;
}

document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t || !t.closest('#directorsRoot')) return;
  if(t.closest('[data-ldi-open]')){ ldiOpen = !ldiOpen; ldRender(); const ta = document.getElementById('ldiText'); if(ta) ta.scrollIntoView({block: 'center'}); return; }
  if(t.closest('[data-ldi-close]')){ ldiOpen = false; ldRender(); return; }
  if(t.closest('[data-ldi-read]')){ const ta = document.getElementById('ldiText'); const text = ta ? ta.value : ''; if(!text.trim()){ showToast('Paste some notes first'); return; } ldiReadText(text, 'Pasted text'); ldRender(); return; }
  if(t.closest('[data-ldi-clear]')){ ldiItems = null; ldRender(); return; }
  if(t.closest('[data-ldi-add]')){
    const n = ldiAdd();
    ldiItems = null; ldiOpen = false;
    showToast(`${ldPlural(n.notes, 'note')}${n.focus ? ` and ${ldPlural(n.focus, 'focus item')}` : ''} added`);
    ldRender(); saveState();
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if(!t || !t.closest || !t.closest('#directorsRoot')) return;
  if(t.id === 'ldiFile'){ const f = t.files && t.files[0]; if(f) ldiReadFile(f); return; }
  if(t.dataset && t.dataset.ldiF && ldiItems){
    const it = ldiItems[+t.dataset.ldiI];
    if(!it) return;
    const f = t.dataset.ldiF;
    if(f === 'on') it.on = t.checked;
    else if(f === 'date'){ if(t.value) it.date = t.value; }
    else if(f === 'text') it.text = t.value.slice(0, LDI_MAX);
    else it[f] = t.value;
    if(f !== 'text') ldRender();
  }
});
