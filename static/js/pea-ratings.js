// ===== PEA RATINGS (Levelset Positional Excellence) =====
// Ratings come from Levelset's "Positional Excellence Ratings" PDF, read on
// the server (/api/pea/parse) and merged here. Uploads can overlap — a rating
// already saved is skipped — so a monthly "last 90 days" export just adds
// what's new. Feeds the Position Strength Map and, later, Set Up Assessments
// (TIM-40).
//
// Stored compactly, since the whole app state is saved on every change:
//   {names: ['Ana Diaz', ...], positions: ['Breader', ...], roles: ['Team Member', ...],
//    rows: [['2026-09-26T17:30', employee, role, leader, position, c1, c2, c3, c4, c5, overall], ...],
//    uploads: [{at, file, rangeStart, rangeEnd, read, added}]}
// where employee/leader index names, role indexes roles, position indexes positions.
const PEA_KEEP_DAYS = 365;
const PEA_RECENT_RATINGS = 5; // a position's score is the average of its latest 5 ratings
const PEA_3H_WEEK = '3H Week';

// Tim's tiers, by average overall score.
const PEA_TIERS = [
  {key: 'crushing', label: 'Crushing It', min: 2.75, range: '2.75–3.00'},
  {key: 'rise', label: 'On the Rise', min: 1.75, range: '1.75–2.74'},
  {key: 'notyet', label: 'Not Yet', min: 0, range: '1.00–1.74'}
];

const PEA_POSITION_GROUPS = [
  {key: 'foh', label: 'Front of House', positions: ['iPOS', 'Bagging', 'Drinks 1/3', 'Drinks 2', 'OMD', 'Host', 'Runner']},
  {key: 'boh', label: 'Back of House', positions: ['Breader', 'Primary', 'Secondary', 'Machines', 'Fries', 'Prep']},
  {key: 'lead', label: 'Leadership', positions: ['Team Lead', 'Trainer']},
  {key: 'new', label: 'New Hires', positions: [PEA_3H_WEEK]}
];

// Which Levelset position a Set Ups slot is rated under. A slot can cover two
// ("Primary/Machines"). Cleaning zones and slots Levelset doesn't rate
// (Traffic Lane, Lemonades, Floors...) match nothing.
const PEA_SLOT_RULES = [
  ['foh', /ipos/i, 'iPOS'],
  ['foh', /bagger/i, 'Bagging'],
  ['foh', /drinks?\s*2\b/i, 'Drinks 2'],
  ['foh', /drinks?\s*[13]\b/i, 'Drinks 1/3'],
  ['foh', /\bomd\b/i, 'OMD'],
  ['foh', /\bhost\b/i, 'Host'],
  ['foh', /runner/i, 'Runner'],
  ['boh', /breader/i, 'Breader'],
  ['boh', /primar/i, 'Primary'],
  ['boh', /machines/i, 'Machines'],
  ['boh', /secondar/i, 'Secondary'],
  ['boh', /fries/i, 'Fries'],
  ['boh', /\bprep\b/i, 'Prep']
];

let peaRatings = emptyPeaRatings();
let peaMapView = 'position';   // 'position' | 'person'
let peaOpenPosition = '';
let peaPersonFilter = '';

function emptyPeaRatings(){
  return {names: [], positions: [], roles: [], rows: [], uploads: [], coverage: {FOH: [], BOH: []}};
}

function normalizePeaRatings(p){
  if(!p || typeof p !== 'object') return emptyPeaRatings();
  const arr = v => Array.isArray(v) ? v : [];
  const out = {names: arr(p.names), positions: arr(p.positions), roles: arr(p.roles), rows: arr(p.rows), uploads: arr(p.uploads), coverage: {FOH: [], BOH: []}};
  if(p.coverage && typeof p.coverage === 'object'){
    PEA_AREAS.forEach(a => out.coverage[a] = arr(p.coverage[a]));
  } else {
    // Saved before coverage was tracked: rebuild it from the upload log
    // (those reports all covered FOH and BOH).
    out.uploads.forEach(u => { if(u.rangeStart && u.rangeEnd) peaAddCoverage(out.coverage, PEA_AREAS, u.rangeStart, u.rangeEnd); });
  }
  return out;
}

// ----- Upload coverage: which dates the uploaded reports cover -----
// Each upload adds its report's date range (per area, FOH/BOH) to
// peaRatings.coverage as merged [start, end] ISO date ranges, so a missed
// month shows up as a stretch no upload covers — separate from weeks that
// were uploaded but simply had few ratings.
const PEA_AREAS = ['FOH', 'BOH'];

function peaShiftISO(iso, days){
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
}

function peaAddCoverage(coverage, areas, start, end){
  areas.filter(a => PEA_AREAS.includes(a)).forEach(a=>{
    const list = [...(coverage[a] || []), [start, end]].sort((x, y) => x[0].localeCompare(y[0]));
    const merged = [];
    list.forEach(([s0, e0])=>{
      const last = merged[merged.length - 1];
      if(last && s0 <= peaShiftISO(last[1], 1)){ if(e0 > last[1]) last[1] = e0; }
      else merged.push([s0, e0]);
    });
    coverage[a] = merged;
  });
}

// Stretches from the first covered day up to today that no upload covers,
// per area; ranges missing from both areas are listed once.
function peaCoverageGaps(){
  const cov = peaRatings.coverage;
  const starts = PEA_AREAS.map(a => (cov[a][0] || [])[0]).filter(Boolean).sort();
  if(!starts.length) return [];
  const from = starts[0];
  const perArea = {};
  PEA_AREAS.forEach(a=>{
    const gaps = [];
    let cursor = from;
    cov[a].forEach(([s0, e0])=>{
      if(s0 > cursor) gaps.push([cursor, peaShiftISO(s0, -1)]);
      if(peaShiftISO(e0, 1) > cursor) cursor = peaShiftISO(e0, 1);
    });
    if(cursor <= today) gaps.push([cursor, today]);
    perArea[a] = gaps;
  });
  const key = g => g.join('|');
  const both = perArea.FOH.filter(g => perArea.BOH.some(h => key(h) === key(g)));
  const out = both.map(g => ({start: g[0], end: g[1], areas: PEA_AREAS}));
  PEA_AREAS.forEach(a => perArea[a].forEach(g => { if(!both.some(b => key(b) === key(g))) out.push({start: g[0], end: g[1], areas: [a]}); }));
  return out.sort((x, y) => x.start.localeCompare(y.start));
}

// How many areas (FOH/BOH) an upload covers on this date: 0, 1 or 2.
function peaAreasCovered(iso){
  return PEA_AREAS.filter(a => peaRatings.coverage[a].some(([s0, e0]) => iso >= s0 && iso <= e0)).length;
}

function peaPositionsForSlot(section, slot){
  if(/zone/i.test(slot)) return [];
  return PEA_SLOT_RULES.filter(([sec, re]) => sec === section && re.test(slot)).map(r => r[2]);
}

function peaTierFor(avg){
  const rounded = Math.round(avg * 100) / 100;
  return PEA_TIERS.find(t => rounded >= t.min);
}

function peaRowKey(at, employee, leader, position, criteria){
  return [at, employee, leader, position, criteria.join(',')].join('|');
}

// Every saved rating, decoded: {at, date, employee, role, leader, position, criteria, overall}.
function peaAllRatings(){
  const {names, positions, roles, rows} = peaRatings;
  return rows.map(r => ({
    at: r[0], date: r[0].slice(0, 10),
    employee: names[r[1]], role: roles[r[2]] || '', leader: names[r[3]] || '',
    position: positions[r[4]], criteria: r.slice(5, 10), overall: r[10]
  })).filter(r => r.employee && r.position);
}

// Adds ratings from one parsed upload. Returns how many were new.
function peaMergeRatings(ratings){
  const index = list => new Map(list.map((v, i) => [v, i]));
  const nameIdx = index(peaRatings.names), posIdx = index(peaRatings.positions), roleIdx = index(peaRatings.roles);
  const idOf = (map, list, v)=>{
    if(!map.has(v)){ map.set(v, list.length); list.push(v); }
    return map.get(v);
  };
  const existing = peaAllRatings();
  const seen = new Set(existing.map(r => peaRowKey(r.at, r.employee, r.leader, r.position, r.criteria)));
  // The Levelset feed has no role, so a rating without one takes the role
  // that person's latest earlier rating carried (from a PDF upload).
  const knownRole = {};
  existing.slice().sort((a, b) => a.at.localeCompare(b.at)).forEach(r => { if(r.role) knownRole[r.employee] = r.role; });
  let added = 0;
  ratings.forEach(r=>{
    const key = peaRowKey(r.at, r.employee, r.leader, r.position, r.criteria);
    if(seen.has(key)) return;
    seen.add(key);
    const role = r.role || knownRole[r.employee] || '';
    peaRatings.rows.push([
      r.at, idOf(nameIdx, peaRatings.names, r.employee), idOf(roleIdx, peaRatings.roles, role),
      idOf(nameIdx, peaRatings.names, r.leader), idOf(posIdx, peaRatings.positions, r.position),
      ...r.criteria, r.overall
    ]);
    added++;
  });
  peaRatings.rows.sort((a, b) => a[0].localeCompare(b[0]));
  if(added) peaNameMatchCache.clear();
  return added;
}

// Drops ratings older than a year and rebuilds the lookup tables without
// names/positions nothing points at any more. Returns true if anything went.
function peaPruneOldRatings(){
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PEA_KEEP_DAYS);
  const cutoffISO = toLocalISODate(cutoff);
  const keep = peaAllRatings().filter(r => r.date >= cutoffISO);
  if(keep.length === peaRatings.rows.length) return false;
  const {uploads, coverage} = peaRatings;
  peaRatings = emptyPeaRatings();
  peaRatings.uploads = uploads;
  PEA_AREAS.forEach(a => peaRatings.coverage[a] = (coverage[a] || []).filter(([, e0]) => e0 >= cutoffISO).map(([s0, e0]) => [s0 < cutoffISO ? cutoffISO : s0, e0]));
  peaMergeRatings(keep);
  return true;
}

// {employee: {role, lastAt, positions: {position: {avg, n, total, last, tier}}}}.
// A position's score is the average of its latest PEA_RECENT_RATINGS ratings,
// so someone who has improved isn't held back by where they started.
// With `upToISO`, only ratings on or before that date count (for trends).
function peaStrengthByPerson(upToISO){
  const people = {};
  peaAllRatings().forEach(r=>{
    if(upToISO && r.date > upToISO) return;
    const p = people[r.employee] = people[r.employee] || {role: r.role, lastAt: '', positions: {}};
    if(r.at >= p.lastAt){ p.lastAt = r.at; p.role = r.role || p.role; }
    (p.positions[r.position] = p.positions[r.position] || []).push(r);
  });
  Object.values(people).forEach(p=>{
    Object.keys(p.positions).forEach(pos=>{
      const list = p.positions[pos].sort((a, b) => b.at.localeCompare(a.at));
      const recent = list.slice(0, PEA_RECENT_RATINGS);
      const avg = recent.reduce((s, r) => s + r.overall, 0) / recent.length;
      p.positions[pos] = {avg, n: recent.length, total: list.length, last: list[0].date, tier: peaTierFor(avg)};
    });
  });
  return people;
}

// A reliable pick: Crushing It on at least 2 ratings.
function peaIsSafePick(cell){
  return cell.tier.key === 'crushing' && cell.total >= 2;
}

function peaFormatDate(iso, withYear){
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', withYear ? {month: 'short', day: 'numeric', year: 'numeric'} : {month: 'short', day: 'numeric'});
}

function peaStatusText(){
  const rows = peaRatings.rows;
  if(!rows.length) return 'No PEA ratings uploaded yet.';
  const people = new Set(rows.map(r => r[1])).size;
  let text = `${rows.length} ratings · ${peaFormatDate(rows[0][0].slice(0, 10))} – ${peaFormatDate(rows[rows.length - 1][0].slice(0, 10), true)} · ${people} team members`;
  const last = peaRatings.uploads[peaRatings.uploads.length - 1];
  if(last) text += ` · last upload ${new Date(last.at).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}`;
  return text;
}

async function peaHandleUpload(file){
  const status = document.getElementById('peaUploadStatus');
  status.textContent = `Reading ${file.name}…`;
  const form = new FormData();
  form.append('file', file);
  let data;
  try{
    const res = await fetch(`${API_BASE}/api/pea/parse`, {method: 'POST', body: form});
    data = await res.json().catch(() => ({}));
    if(res.status === 403){
      status.textContent = 'Manager sign-in expired — lock Manage, sign in again, and re-upload.';
      return;
    }
    if(!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  }catch(err){
    status.textContent = `Couldn't read that file: ${err.message}`;
    return;
  }

  await peaApplyResult(data, file.name, status);
}

// Merges a parsed PDF or a Levelset feed sync (same shape) and saves it.
async function peaApplyResult(data, sourceName, status){
  const ratings = data.ratings || [];
  const added = peaMergeRatings(ratings);
  const s = data.summary || {};
  // Coverage is the report's own date range; without one, the span of its ratings.
  // A feed sync gives a range per area, since what it can vouch for differs.
  const dates = ratings.map(r => r.at.slice(0, 10)).sort();
  const covStart = s.rangeStart || dates[0], covEnd = s.rangeEnd || dates[dates.length - 1];
  const areas = (s.areas && s.areas.length) ? s.areas.filter(a => PEA_AREAS.includes(a)) : PEA_AREAS;
  if(s.coverage){
    areas.forEach(a => { if(s.coverage[a]) peaAddCoverage(peaRatings.coverage, [a], s.coverage[a][0], s.coverage[a][1]); });
  }else if(covStart && covEnd){
    peaAddCoverage(peaRatings.coverage, areas, covStart, covEnd);
  }
  peaRatings.uploads.push({at: new Date().toISOString(), file: sourceName, rangeStart: covStart || null, rangeEnd: covEnd || null, areas, read: ratings.length, added});
  peaRatings.uploads = peaRatings.uploads.slice(-10);
  duRecord('pea', {file: sourceName, summary: `${ratings.length} ratings · ${added} new`});
  peaPruneOldRatings();
  await saveState();

  const range = s.rangeStart && s.rangeEnd ? ` (${peaFormatDate(s.rangeStart)} – ${peaFormatDate(s.rangeEnd, true)})` : '';
  const areaNote = areas.length < PEA_AREAS.length ? ` This report only covers ${areas.join(', ') || 'no known area'} — upload the ${PEA_AREAS.filter(a => !areas.includes(a)).join(', ')} report for the same dates too.` : '';
  const warnList = [...(data.warnings || []), areaNote.trim()].filter(Boolean);
  const warnings = warnList.length ? ` ⚠ ${warnList.join(' ')}` : '';
  status.textContent = `✓ ${ratings.length} ratings read${range} · ${added} new · ${ratings.length - added} already saved.${warnings}`;
  showToast(added ? `✓ ${added} new PEA ratings saved` : 'No new ratings — all were already saved');
  renderPeaManage();
  renderDataUploads();
}

// Pulls ratings straight from Levelset's public scorecard link (read by the
// server; the link's token lives in the server's environment).
async function peaHandleSync(){
  const status = document.getElementById('peaUploadStatus');
  const btn = document.getElementById('btnPeaSync');
  btn.disabled = true;
  status.textContent = 'Syncing from Levelset…';
  try{
    let data;
    try{
      const res = await fetch(`${API_BASE}/api/pea/sync`, {method: 'POST'});
      data = await res.json().catch(() => ({}));
      if(res.status === 403){
        status.textContent = 'Manager sign-in expired — lock Manage, sign in again, and sync again.';
        return;
      }
      if(!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    }catch(err){
      status.textContent = `Couldn't sync from Levelset: ${err.message}`;
      return;
    }
    await peaApplyResult(data, 'Levelset sync', status);
  }finally{
    btn.disabled = false;
  }
}

async function peaClearAll(){
  if(!peaRatings.rows.length) return;
  if(!confirm(`Remove all ${peaRatings.rows.length} saved PEA ratings? Upload the PDF again to bring them back.`)) return;
  peaRatings = emptyPeaRatings();
  await saveState();
  document.getElementById('peaUploadStatus').textContent = '';
  renderPeaManage();
}

// ----- Position Strength Map -----

function peaTierChip(cell){
  return `<span class="pea-chip pea-${cell.tier.key}" title="${cell.tier.label} · latest ${cell.n} of ${cell.total} rating${cell.total === 1 ? '' : 's'} · last ${peaFormatDate(cell.last, true)}">${cell.avg.toFixed(2)}<span class="pea-chip-n">×${cell.total}</span></span>`;
}

function peaPositionSummaries(people){
  const byPos = {};
  Object.entries(people).forEach(([name, p])=>{
    Object.entries(p.positions).forEach(([pos, cell])=>{
      (byPos[pos] = byPos[pos] || []).push({name, cell});
    });
  });
  return byPos;
}

function peaRenderPositionView(people){
  const byPos = peaPositionSummaries(people);
  const known = new Set(PEA_POSITION_GROUPS.flatMap(g => g.positions));
  const other = Object.keys(byPos).filter(p => !known.has(p)).sort();
  const groups = other.length ? [...PEA_POSITION_GROUPS, {key: 'other', label: 'Other', positions: other}] : PEA_POSITION_GROUPS;

  const tile = pos=>{
    const list = byPos[pos] || [];
    const counts = {crushing: 0, rise: 0, notyet: 0};
    list.forEach(e => counts[e.cell.tier.key]++);
    const safe = list.filter(e => peaIsSafePick(e.cell)).length;
    const total = list.length;
    const bar = total ? PEA_TIERS.map(t => counts[t.key] ? `<span class="pea-bar-seg pea-${t.key}" style="flex:${counts[t.key]}" title="${counts[t.key]} ${t.label}"></span>` : '').join('') : '<span class="pea-bar-seg pea-empty" style="flex:1"></span>';
    const isNew = pos === PEA_3H_WEEK;
    return `
      <button type="button" class="pea-pos-tile ${peaOpenPosition === pos ? 'open' : ''} ${total ? '' : 'is-empty'}" data-pea-position="${escapeHtml(pos)}" aria-expanded="${peaOpenPosition === pos}">
        <span class="pea-pos-name">${escapeHtml(pos)}</span>
        <span class="pea-bar">${bar}</span>
        <span class="pea-pos-meta">${total ? `${total} ${total === 1 ? 'person' : 'people'}` : 'No ratings'}${total && !isNew ? ` · <b class="${safe <= 2 ? 'pea-thin' : ''}">${safe} safe pick${safe === 1 ? '' : 's'}</b>` : ''}</span>
      </button>`;
  };

  let html = groups.map(g => `
    <div class="pea-group">
      <div class="pea-group-label">${g.label}</div>
      <div class="pea-pos-grid">${g.positions.map(tile).join('')}</div>
      ${g.positions.includes(peaOpenPosition) ? peaRenderPositionDetail(peaOpenPosition, byPos[peaOpenPosition] || []) : ''}
    </div>`).join('');
  return html;
}

function peaRenderPositionDetail(pos, list){
  if(!list.length) return `<div class="pea-detail"><p class="pea-muted">Nobody has been rated in ${escapeHtml(pos)} yet.</p></div>`;
  const cols = PEA_TIERS.map(t=>{
    const people = list.filter(e => e.cell.tier.key === t.key).sort((a, b) => b.cell.avg - a.cell.avg || b.cell.total - a.cell.total);
    return `
      <div class="pea-detail-col">
        <div class="pea-detail-head pea-${t.key}-text">${t.label} <span>${people.length}</span></div>
        ${people.length ? people.map(e => `
          <div class="pea-detail-row">
            <span class="pea-detail-name">${escapeHtml(e.name)}${peaIsSafePick(e.cell) ? ' <span class="pea-safe" title="Crushing It on 2+ ratings">✓</span>' : ''}</span>
            <span class="pea-detail-score">${e.cell.avg.toFixed(2)} <span class="pea-muted">×${e.cell.total} · ${peaFormatDate(e.cell.last)}</span></span>
          </div>`).join('') : '<div class="pea-muted pea-detail-none">—</div>'}
      </div>`;
  }).join('');
  return `<div class="pea-detail"><div class="pea-detail-title">${escapeHtml(pos)}</div><div class="pea-detail-cols">${cols}</div></div>`;
}

function peaRenderPersonList(people){
  const q = peaPersonFilter.trim().toLowerCase();
  const order = PEA_POSITION_GROUPS.flatMap(g => g.positions);
  const rank = pos => { const i = order.indexOf(pos); return i === -1 ? order.length : i; };
  const names = Object.keys(people).filter(n => !q || n.toLowerCase().includes(q)).sort((a, b) => a.localeCompare(b));
  if(!names.length) return `<p class="pea-muted">No one matches "${escapeHtml(peaPersonFilter)}".</p>`;
  // Each team member's side (from the rosters), so the card can say how
  // many of that side's positions are green — including ones never rated,
  // which have no chip below.
  const team = typeof agTeamMembers === 'function' ? agTeamMembers(people).members : [];
  return names.map(name=>{
    const p = people[name];
    const sides = team.filter(m => m.peaName === name).map(m=>{
      const cert = suCertification(p, m.area);
      return `<div class="pea-person-green ${cert.allGreen ? 'is-all' : ''}"><b>${m.area.toUpperCase()} ${cert.green}/${cert.total} green</b>${cert.allGreen ? ' · all green' : ` · not green yet: ${escapeHtml(agNotGreenText(p, m.area))}`}</div>`;
    }).join('');
    const positions = Object.keys(p.positions).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    const onlyNew = positions.length === 1 && positions[0] === PEA_3H_WEEK;
    return `
      <div class="pea-person">
        <div class="pea-person-head">
          <span class="pea-person-name">${escapeHtml(name)}</span>
          <span class="pea-muted">${escapeHtml(p.role)}${onlyNew ? ' · new hire' : ''} · last rated ${peaFormatDate(p.lastAt.slice(0, 10))}</span>
        </div>
        ${sides}
        <div class="pea-person-chips">
          ${positions.map(pos => `<span class="pea-person-pos ${pos === PEA_3H_WEEK ? 'is-3h' : ''}"><span>${escapeHtml(pos)}</span>${peaTierChip(p.positions[pos])}</span>`).join('')}
        </div>
      </div>`;
  }).join('');
}

function renderPeaManage(){
  const statusLine = document.getElementById('peaDataStatus');
  if(!statusLine) return;
  statusLine.textContent = peaStatusText();
  document.getElementById('btnPeaClear').style.display = peaRatings.rows.length ? '' : 'none';

  if(typeof renderAllGreenTracker === 'function') renderAllGreenTracker();
  renderPeaNameMatching();
  renderPeaCoverage();
  const root = document.getElementById('peaStrengthRoot');
  if(!peaRatings.rows.length){
    root.innerHTML = '<p class="pea-muted">Upload a PEA ratings PDF above to see where each team member stands in each position.</p>';
    return;
  }
  const people = peaStrengthByPerson();
  root.innerHTML = `
    <div class="pea-legend">
      ${PEA_TIERS.map(t => `<span class="pea-legend-item"><span class="pea-dot pea-${t.key}"></span>${t.label} <span class="pea-muted">${t.range}</span></span>`).join('')}
    </div>
    <p class="pea-muted pea-note">Each score is the average of that person's latest ${PEA_RECENT_RATINGS} ratings in the position (×N = ratings in total). A safe pick is Crushing It on 2+ ratings.</p>
    <div class="week-toggle pea-view-toggle">
      <button type="button" class="week-toggle-btn ${peaMapView === 'position' ? 'active' : ''}" data-pea-view="position" aria-pressed="${peaMapView === 'position'}">By position</button>
      <button type="button" class="week-toggle-btn ${peaMapView === 'person' ? 'active' : ''}" data-pea-view="person" aria-pressed="${peaMapView === 'person'}">By person</button>
    </div>
    ${peaMapView === 'position' ? peaRenderPositionView(people) : `
      <input type="search" id="peaPersonSearch" class="pea-search" placeholder="Search team members..." value="${escapeHtml(peaPersonFilter)}">
      <div id="peaPersonList">${peaRenderPersonList(people)}</div>`}
  `;
}

document.getElementById('btnPeaClear').addEventListener('click', peaClearAll);
document.getElementById('btnPeaSync').addEventListener('click', peaHandleSync);
document.getElementById('peaStrengthRoot').addEventListener('click', e=>{
  const view = e.target.closest('[data-pea-view]');
  if(view){ peaMapView = view.dataset.peaView; renderPeaManage(); return; }
  const tile = e.target.closest('[data-pea-position]');
  if(tile){
    const pos = tile.dataset.peaPosition;
    peaOpenPosition = peaOpenPosition === pos ? '' : pos;
    renderPeaManage();
  }
});
document.getElementById('peaStrengthRoot').addEventListener('input', e=>{
  if(e.target.id !== 'peaPersonSearch') return;
  peaPersonFilter = e.target.value;
  document.getElementById('peaPersonList').innerHTML = peaRenderPersonList(peaStrengthByPerson());
});

// ----- Matching Set Ups (HotSchedules) names to Levelset names -----
// The two systems don't always spell a name the same way: Levelset may carry
// a nickname ("Jeniree (Jenny) Vasquez") or both last names ("Alexander
// Ovalle Amado"), and a roster may read "Last, First". A roster name is only
// linked when exactly one Levelset name fits; otherwise it counts as unrated.
function peaNameTokens(name){
  let n = String(name || '');
  const comma = n.split(',');
  if(comma.length === 2) n = comma[1] + ' ' + comma[0];
  return n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z\s()'-]/g, ' ').replace(/['-]/g, ' ').split(/\s+/).filter(Boolean);
}

function peaNameForms(name){
  const tokens = peaNameTokens(name);
  const nicknames = tokens.filter(t => /^\(.*\)$/.test(t)).map(t => t.slice(1, -1));
  const plain = tokens.filter(t => !/^\(.*\)$/.test(t)).map(t => t.replace(/[()]/g, ''));
  return {first: plain[0] || '', firsts: [plain[0], ...nicknames].filter(Boolean), rest: plain.slice(1), all: plain};
}

// True when two words differ by at most one letter (added, dropped or
// changed): "Makenzi" / "Makenzie".
function peaOneEditApart(a, b){
  if(a === b) return true;
  if(Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while(i < a.length && j < b.length){
    if(a[i] === b[j]){ i++; j++; continue; }
    if(++edits > 1) return false;
    if(a.length > b.length) i++;
    else if(b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function peaNameMatches(rosterName, peaName){
  const r = peaNameForms(rosterName), p = peaNameForms(peaName);
  if(!r.first || !p.first) return false;
  if(r.all.join(' ') === p.all.join(' ')) return true;
  // First names: the same, a nickname, or one letter apart on names of 4+
  // letters ("Makenzi" / "Makenzie").
  const sameFirst = p.firsts.includes(r.first) || r.firsts.includes(p.first)
    || (r.first.length >= 4 && p.first.length >= 4 && peaOneEditApart(r.first, p.first));
  if(!sameFirst) return false;
  if(!r.rest.length || !p.rest.length) return false;
  // Last names: every roster part appears in the Levelset name (a lone
  // initial matches a last name starting with it), or the other way round
  // ("Lucia Jurado Tavera" / "Lucia Tavera"), or the final surnames agree.
  const within = (xs, ys) => xs.every(t => t.length === 1 ? ys.some(y => y[0] === t) : ys.includes(t));
  return within(r.rest, p.rest) || within(p.rest, r.rest) || r.rest[r.rest.length - 1] === p.rest[p.rest.length - 1];
}

// Links a leader made by hand in Manage, for names the matcher can't pair:
// {"roster name, lowercased": "Levelset name"}. Checked before automatic
// matching.
let peaNameAliases = {};

function peaRosterKey(name){
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const peaNameMatchCache = new Map();
// {match, how: 'linked' | 'exact' | 'auto' | null, candidates}
function peaMatchInfo(rosterName, peaNames){
  const key = rosterName + '\u0000' + peaNames.length;
  if(peaNameMatchCache.has(key)) return peaNameMatchCache.get(key);
  let info;
  const linked = peaNameAliases[peaRosterKey(rosterName)];
  if(linked && peaNames.includes(linked)){
    info = {match: linked, how: 'linked', candidates: [linked]};
  } else {
    const exact = peaNames.find(n => peaRosterKey(n) === peaRosterKey(rosterName));
    const hits = exact ? [exact] : peaNames.filter(n => peaNameMatches(rosterName, n));
    info = {match: hits.length === 1 ? hits[0] : null, how: hits.length === 1 ? (exact ? 'exact' : 'auto') : null, candidates: hits};
  }
  peaNameMatchCache.set(key, info);
  return info;
}

function peaMatchName(rosterName, peaNames){
  return peaMatchInfo(rosterName, peaNames).match;
}

// ----- Name Matching card (Manage) -----

// Every name Set Ups knows: rosters still held (last two weeks), set-up
// history (a year) and current assignments. {name: lastSeenISO}
function peaRosterNamesSeen(){
  const seen = {};
  const note = (name, date)=>{
    name = String(name || '').trim();
    if(!name) return;
    if(!isSetupDateKey(date)) date = '';
    if(!seen[name] || (date && date > seen[name])) seen[name] = date || seen[name] || '';
  };
  [fohRoster, bohRoster].forEach(roster => Object.keys(roster).forEach(date => (roster[date] || []).forEach(p => note(p.name, date))));
  Object.keys(posAssignments).forEach(k => suSplitNames(posAssignments[k]).forEach(n => note(n, k.split('||')[1])));
  Object.keys(setupHistory.days).forEach(date => setupHistory.days[date].forEach(([, n]) => note(setupHistory.names[n], date)));
  // One entry per person even if the roster spelled them two ways by case.
  const byKey = {};
  Object.entries(seen).forEach(([name, date])=>{
    const k = peaRosterKey(name);
    if(!byKey[k] || date > byKey[k].date) byKey[k] = {name, date};
  });
  return Object.values(byKey);
}

// Levelset names worth offering first for a roster name: same first or last name.
function peaSuggestedNames(rosterName, peaNames){
  const r = peaNameForms(rosterName);
  const shared = n => { const p = peaNameForms(n); return p.firsts.some(f => r.firsts.includes(f)) || p.rest.some(t => r.rest.includes(t)); };
  return peaNames.filter(shared);
}

function renderPeaNameMatching(){
  const root = document.getElementById('peaNameMatchRoot');
  if(!root) return;
  const peaNames = Object.keys(peaStrengthByPerson()).sort((a, b) => a.localeCompare(b));
  if(!peaNames.length){ root.innerHTML = '<p class="pea-muted">Upload PEA ratings first.</p>'; return; }
  const roster = peaRosterNamesSeen().sort((a, b) => a.name.localeCompare(b.name));
  if(!roster.length){ root.innerHTML = '<p class="pea-muted">No HotSchedules names yet — import a roster in Team & Scheduling.</p>'; return; }

  const rows = roster.map(r => ({...r, info: peaMatchInfo(r.name, peaNames)}));
  const unmatched = rows.filter(r => !r.info.match);
  const linked = rows.filter(r => r.info.how === 'linked');
  const auto = rows.filter(r => r.info.how === 'auto');
  const matchedPea = new Set(rows.map(r => r.info.match).filter(Boolean));
  const notOnRoster = peaNames.filter(n => !matchedPea.has(n));
  const seenLabel = d => d ? ` · on a roster ${peaFormatDate(d)}` : '';

  const options = name=>{
    const suggested = peaSuggestedNames(name, peaNames).filter(n => !matchedPea.has(n));
    const rest = peaNames.filter(n => !suggested.includes(n));
    return `<option value="">Link to a Levelset name…</option>` +
      (suggested.length ? `<optgroup label="Suggested">${suggested.map(n => `<option>${escapeHtml(n)}</option>`).join('')}</optgroup>` : '') +
      `<optgroup label="Everyone in Levelset">${rest.map(n => `<option>${escapeHtml(n)}</option>`).join('')}</optgroup>`;
  };

  root.innerHTML = `
    <p class="pea-muted pea-note">${rows.length} HotSchedules names checked · ${rows.length - unmatched.length} matched to Levelset · <b class="${unmatched.length ? 'pea-notyet-text' : 'pea-crushing-text'}">${unmatched.length} with no match</b>. Unmatched people show as Unrated when a set up is evaluated.</p>
    ${unmatched.length ? `
      <div class="pea-match-list">
        ${unmatched.map(r => `
          <div class="pea-match-row">
            <div><b>${escapeHtml(r.name)}</b><span class="pea-muted">${r.info.candidates.length > 1 ? ` · could be ${r.info.candidates.length} people` : ''}${seenLabel(r.date)}</span></div>
            <select data-pea-alias="${escapeHtml(r.name)}">${options(r.name)}</select>
          </div>`).join('')}
      </div>` : '<p class="pea-crushing-text" style="font-size:12px;font-weight:600;">✓ Every roster name has a Levelset match.</p>'}
    ${linked.length ? `
      <div class="pea-group-label" style="margin-top:14px;">Linked by hand</div>
      ${linked.map(r => `<div class="pea-match-row"><div>${escapeHtml(r.name)} → <b>${escapeHtml(r.info.match)}</b></div><button type="button" class="btn btn-ghost pea-unlink" data-pea-unlink="${escapeHtml(r.name)}">Unlink</button></div>`).join('')}` : ''}
    ${auto.length ? `
      <details class="pea-match-details"><summary>Matched automatically with a different spelling (${auto.length}) — check these</summary>
        ${auto.map(r => `<div class="pea-match-row"><div>${escapeHtml(r.name)} → <b>${escapeHtml(r.info.match)}</b></div></div>`).join('')}
      </details>` : ''}
    ${notOnRoster.length ? `
      <details class="pea-match-details"><summary>In Levelset but not on any roster the site has seen (${notOnRoster.length})</summary>
        <p class="pea-muted">Usually people who haven't been scheduled recently, left, or are spelled differently in HotSchedules.</p>
        <div class="pea-muted" style="line-height:1.7;">${notOnRoster.map(escapeHtml).join(' · ')}</div>
      </details>` : ''}
  `;
}

document.getElementById('peaNameMatchRoot').addEventListener('change', async e=>{
  const sel = e.target.closest('[data-pea-alias]');
  if(!sel || !sel.value) return;
  peaNameAliases[peaRosterKey(sel.dataset.peaAlias)] = sel.value;
  peaNameMatchCache.clear();
  await saveState();
  showToast(`✓ Linked ${sel.dataset.peaAlias} → ${sel.value}`);
  renderPeaNameMatching();
});
document.getElementById('peaNameMatchRoot').addEventListener('click', async e=>{
  const btn = e.target.closest('[data-pea-unlink]');
  if(!btn) return;
  delete peaNameAliases[peaRosterKey(btn.dataset.peaUnlink)];
  peaNameMatchCache.clear();
  await saveState();
  renderPeaNameMatching();
});

// ----- Coverage Check card (Manage) -----

function peaWeekStart(iso){
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return toLocalISODate(d);
}

// One entry per week (Mon–Sun) from the first covered day to today:
// {start, count, days, coveredDays, status: ok | quiet | partial | missing}
function peaWeeklyCoverage(){
  const starts = PEA_AREAS.map(a => (peaRatings.coverage[a][0] || [])[0]).filter(Boolean).sort();
  const firstRating = peaRatings.rows.length ? peaRatings.rows[0][0].slice(0, 10) : null;
  const from = [starts[0], firstRating].filter(Boolean).sort()[0];
  if(!from) return [];
  const counts = {};
  peaRatings.rows.forEach(r => { const w = peaWeekStart(r[0].slice(0, 10)); counts[w] = (counts[w] || 0) + 1; });
  // Days after the latest upload aren't a gap yet — they just haven't been
  // uploaded. Weeks past that point show as "not uploaded yet".
  const trailing = peaCoverageGaps().find(g => g.end === today && g.areas.length === PEA_AREAS.length);
  const limit = trailing ? peaShiftISO(trailing.start, -1) : today;
  const weeks = [];
  for(let w = peaWeekStart(from); w <= today && weeks.length < 60; w = peaShiftISO(w, 7)){
    let days = 0, covered = 0, touched = 0;
    for(let i = 0; i < 7; i++){
      const d = peaShiftISO(w, i);
      if(d < from || d > limit) continue;
      days++;
      const n = peaAreasCovered(d);
      if(n === PEA_AREAS.length) covered++;
      if(n) touched++;
    }
    weeks.push({start: w, count: counts[w] || 0, days, coveredDays: covered, touchedDays: touched});
  }
  // "Few ratings" is judged against this store's own normal week.
  const full = weeks.filter(w => w.coveredDays === w.days && w.days >= 5).map(w => w.count).sort((a, b) => a - b);
  const median = full.length ? full[Math.floor(full.length / 2)] : 0;
  const quietBelow = Math.max(2, Math.round(median * 0.3));
  weeks.forEach(w=>{
    // A week with only a day or two in range (the first or last week) is too
    // short to call quiet.
    w.status = w.days === 0 ? 'pending' : w.touchedDays === 0 ? 'missing' : w.coveredDays < w.days ? 'partial'
      : (w.days >= 4 && w.count < quietBelow) ? 'quiet' : 'ok';
  });
  return {weeks, median, quietBelow};
}

function peaRangeText(start, end){
  const days = Math.round((new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1;
  return `${peaFormatDate(start)} – ${peaFormatDate(end, true)} (${days} day${days === 1 ? '' : 's'})`;
}

function renderPeaCoverage(){
  const root = document.getElementById('peaCoverageRoot');
  if(!root) return;
  const data = peaWeeklyCoverage();
  if(!data.weeks || !data.weeks.length){ root.innerHTML = '<p class="pea-muted">Upload a PEA ratings PDF to check coverage.</p>'; return; }
  const {weeks, median, quietBelow} = data;

  const gaps = peaCoverageGaps();
  const trailing = gaps.find(g => g.end === today && g.areas.length === PEA_AREAS.length);
  const inner = gaps.filter(g => g !== trailing);
  const quiet = weeks.filter(w => w.status === 'quiet');
  const lastCovered = PEA_AREAS.map(a => { const c = peaRatings.coverage[a]; return c.length ? c[c.length - 1][1] : null; }).filter(Boolean).sort()[0];
  const sinceDays = lastCovered ? Math.round((new Date(today + 'T00:00:00') - new Date(lastCovered + 'T00:00:00')) / 86400000) : null;

  const max = Math.max(1, ...weeks.map(w => w.count));
  const monthLabel = w => {
    for(let i = 0; i < 7; i++){ const d = peaShiftISO(w.start, i); if(d.endsWith('-01')) return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {month: 'short'}); }
    return '';
  };
  const statusText = {ok: 'uploaded', quiet: 'uploaded · few ratings', partial: 'some days or areas not uploaded', missing: 'not uploaded', pending: 'not uploaded yet'};
  const bars = weeks.map(w=>{
    const label = `Week of ${peaFormatDate(w.start, true)} · ${w.count} rating${w.count === 1 ? '' : 's'} · ${statusText[w.status]}`;
    const h = w.status === 'missing' || w.status === 'pending' ? 100 : Math.max(w.count ? 6 : 3, Math.round(w.count / max * 100));
    return `<div class="pea-cov-week is-${w.status}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><span class="pea-cov-bar" style="height:${h}%"></span></div>`;
  }).join('');
  const months = weeks.map(w => `<span>${monthLabel(w)}</span>`).join('');

  const firstCovered = PEA_AREAS.map(a => (peaRatings.coverage[a][0] || [])[0]).filter(Boolean).sort()[0] || weeks[0].start;
  const headline = inner.length
    ? `<div class="pea-cov-head is-bad">⚠ ${inner.length} gap${inner.length === 1 ? '' : 's'} in your uploads — some dates have never been uploaded.</div>`
    : `<div class="pea-cov-head is-good">✓ No gaps — uploads cover every day from ${peaFormatDate(firstCovered, true)} to ${lastCovered ? peaFormatDate(lastCovered, true) : 'today'}.</div>`;

  root.innerHTML = `
    ${headline}
    <div class="pea-cov-chart" role="img" aria-label="Ratings per week, ${weeks.length} weeks">${bars}</div>
    <div class="pea-cov-months" aria-hidden="true">${months}</div>
    <div class="pea-cov-key">
      <span><i class="k-ok"></i>Ratings per week (typical ${median})</span>
      <span><i class="k-quiet"></i>Uploaded, few ratings (under ${quietBelow})</span>
      <span><i class="k-missing"></i>Not uploaded (gap)</span>
      ${weeks.some(w => w.status === 'pending') ? '<span><i class="k-pending"></i>Since latest upload</span>' : ''}
    </div>
    ${inner.length ? `
      <div class="pea-cov-list is-bad">
        <b>Missing uploads</b>
        <ul>${inner.map(g => `<li>${peaRangeText(g.start, g.end)}${g.areas.length < PEA_AREAS.length ? ` — ${g.areas.join(', ')} missing (${PEA_AREAS.filter(a => !g.areas.includes(a)).join(', ')} uploaded)` : ''}</li>`).join('')}</ul>
        <span class="pea-muted">In Levelset, run the Positional Excellence Ratings report for these dates (FOH and BOH) and upload it. Ratings already saved are skipped.</span>
      </div>` : ''}
    ${quiet.length ? `
      <div class="pea-cov-list is-warn">
        <b>Uploaded, but few ratings</b>
        <ul>${quiet.map(w => `<li>Week of ${peaFormatDate(w.start, true)} — ${w.count} rating${w.count === 1 ? '' : 's'}</li>`).join('')}</ul>
        <span class="pea-muted">These weeks were uploaded — leaders just completed few PEAs then. Nothing to re-upload.</span>
      </div>` : ''}
    ${trailing && sinceDays !== null ? `<div class="pea-cov-note ${sinceDays > 45 ? 'is-warn' : ''}">Latest upload covers through ${peaFormatDate(lastCovered, true)}${sinceDays > 0 ? ` (${sinceDays} day${sinceDays === 1 ? '' : 's'} ago)` : ''}.${sinceDays > 45 ? ' Upload a new report soon so this stretch doesn’t become a gap.' : ''}</div>` : ''}
  `;
}
