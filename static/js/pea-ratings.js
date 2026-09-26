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
  return {names: [], positions: [], roles: [], rows: [], uploads: []};
}

function normalizePeaRatings(p){
  if(!p || typeof p !== 'object') return emptyPeaRatings();
  const arr = v => Array.isArray(v) ? v : [];
  return {names: arr(p.names), positions: arr(p.positions), roles: arr(p.roles), rows: arr(p.rows), uploads: arr(p.uploads)};
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
  const seen = new Set(peaAllRatings().map(r => peaRowKey(r.at, r.employee, r.leader, r.position, r.criteria)));
  let added = 0;
  ratings.forEach(r=>{
    const key = peaRowKey(r.at, r.employee, r.leader, r.position, r.criteria);
    if(seen.has(key)) return;
    seen.add(key);
    peaRatings.rows.push([
      r.at, idOf(nameIdx, peaRatings.names, r.employee), idOf(roleIdx, peaRatings.roles, r.role),
      idOf(nameIdx, peaRatings.names, r.leader), idOf(posIdx, peaRatings.positions, r.position),
      ...r.criteria, r.overall
    ]);
    added++;
  });
  peaRatings.rows.sort((a, b) => a[0].localeCompare(b[0]));
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
  const uploads = peaRatings.uploads;
  peaRatings = emptyPeaRatings();
  peaRatings.uploads = uploads;
  peaMergeRatings(keep);
  return true;
}

// {employee: {role, lastAt, positions: {position: {avg, n, total, last, tier}}}}.
// A position's score is the average of its latest PEA_RECENT_RATINGS ratings,
// so someone who has improved isn't held back by where they started.
function peaStrengthByPerson(){
  const people = {};
  peaAllRatings().forEach(r=>{
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

  const ratings = data.ratings || [];
  const added = peaMergeRatings(ratings);
  const s = data.summary || {};
  peaRatings.uploads.push({at: new Date().toISOString(), file: file.name, rangeStart: s.rangeStart || null, rangeEnd: s.rangeEnd || null, read: ratings.length, added});
  peaRatings.uploads = peaRatings.uploads.slice(-10);
  peaPruneOldRatings();
  await saveState();

  const range = s.rangeStart && s.rangeEnd ? ` (${peaFormatDate(s.rangeStart)} – ${peaFormatDate(s.rangeEnd, true)})` : '';
  const warnings = (data.warnings || []).length ? ` ⚠ ${data.warnings.join(' ')}` : '';
  status.textContent = `✓ ${ratings.length} ratings read${range} · ${added} new · ${ratings.length - added} already saved.${warnings}`;
  showToast(added ? `✓ ${added} new PEA ratings saved` : 'No new ratings — all were already saved');
  renderPeaManage();
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
  return names.map(name=>{
    const p = people[name];
    const positions = Object.keys(p.positions).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    const onlyNew = positions.length === 1 && positions[0] === PEA_3H_WEEK;
    return `
      <div class="pea-person">
        <div class="pea-person-head">
          <span class="pea-person-name">${escapeHtml(name)}</span>
          <span class="pea-muted">${escapeHtml(p.role)}${onlyNew ? ' · new hire' : ''} · last rated ${peaFormatDate(p.lastAt.slice(0, 10))}</span>
        </div>
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

document.getElementById('peaUpload').addEventListener('change', e=>{
  const file = e.target.files[0];
  e.target.value = '';
  if(file) peaHandleUpload(file);
});
document.getElementById('btnPeaClear').addEventListener('click', peaClearAll);
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
