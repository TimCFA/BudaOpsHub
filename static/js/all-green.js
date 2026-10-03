// ===== ALL-GREEN TRACKER =====
// Tim: all green on their PEAs — Crushing It (2.75+) in every position
// they've been rated in on their side, the same rule Levelset shows — means
// a team member is ready for certification or already certified. Pay is tied
// to it, so a position never rated doesn't count against anyone and nobody
// drops off for going a while without a PEA; the tracker shows how many of
// the side's positions are rated so depth is visible.
//
// Counts the team members on the current HotSchedules rosters (FOH roster →
// FOH positions, BOH roster → BOH positions; someone on both counts on each).
// Trainers and Team Leads aren't counted. With no rosters imported, it falls
// back to everyone rated in the last 60 days, on the side most of their
// ratings are from.

const AG_WEEKS = 8;
const AG_FALLBACK_DAYS = 60;
let agArea = 'foh';

function agAreaPositions(area){
  return (PEA_POSITION_GROUPS.find(g => g.key === area) || {positions: []}).positions;
}

// The team to count: [{name, peaName, area}], plus roster names with no
// Levelset match.
function agTeamMembers(strength){
  const peaNames = Object.keys(strength);
  const members = [], unmatched = [], seen = new Set();
  let fromRoster = false;
  [['foh', fohRoster], ['boh', bohRoster]].forEach(([area, roster])=>{
    const names = new Map();
    Object.keys(roster).forEach(date => (roster[date] || []).forEach(p=>{
      if(p && p.name) names.set(peaRosterKey(p.name), p);
    }));
    names.forEach(p=>{
      fromRoster = true;
      if(p.leader) return;   // a Team Leader shift
      const peaName = peaNames.length ? peaMatchName(p.name, peaNames) : null;
      if(!peaName){ unmatched.push(p.name); return; }
      if(SU_LEADER_ROLES.includes(strength[peaName].role)) return;
      const k = area + '|' + peaName;
      if(seen.has(k)) return;
      seen.add(k);
      members.push({name: p.name, peaName, area});
    });
  });
  if(!fromRoster){
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - AG_FALLBACK_DAYS);
    const since = toLocalISODate(cutoff);
    Object.entries(strength).forEach(([peaName, person])=>{
      if(SU_LEADER_ROLES.includes(person.role) || person.lastAt.slice(0, 10) < since) return;
      const count = area => Object.keys(person.positions).filter(p => agAreaPositions(area).includes(p)).length;
      const foh = count('foh'), boh = count('boh');
      if(!foh && !boh) return;   // only a 3H Week so far
      members.push({name: peaName, peaName, area: boh > foh ? 'boh' : 'foh'});
    });
  }
  return {members, unmatched: [...new Set(unmatched)].sort((a, b) => a.localeCompare(b)), fromRoster};
}

// The positions rated but not green yet for someone: [{pos, cell}].
function agNotGreen(person, area){
  return suCertification(person, area).missing.map(pos => ({pos, cell: person.positions[pos]}));
}

// "Bagging 2.48, Host 2.68 · not rated: OMD, Runner".
function agNotGreenText(person, area){
  const cert = suCertification(person, area);
  if(!cert.rated) return 'no position ratings yet';
  const below = agNotGreen(person, area).map(g => `${g.pos} ${g.cell.avg.toFixed(2)}`).join(', ');
  return below + (cert.unrated.length ? `${below ? ' · ' : ''}not rated: ${cert.unrated.join(', ')}` : '');
}

function agSnapshot(){
  const strength = peaStrengthByPerson();
  const {members, unmatched, fromRoster} = agTeamMembers(strength);
  const rows = members.map(m => ({...m, person: strength[m.peaName], cert: suCertification(strength[m.peaName], m.area)}));
  // The same team, as of each of the last AG_WEEKS weeks.
  const trend = [];
  for(let w = AG_WEEKS - 1; w >= 0; w--){
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - 7 * w);
    const iso = toLocalISODate(d);
    const then = w ? peaStrengthByPerson(iso) : strength;
    const green = rows.filter(r => then[r.peaName] && suCertification(then[r.peaName], r.area).allGreen).length;
    trend.push({iso, green, total: rows.length});
  }
  return {rows, unmatched, fromRoster, trend};
}

function agTrendHtml(trend, rows){
  if(!trend.some(t => t.green)){
    // Nothing to chart yet: say so, and how close people are.
    const oneAway = rows.filter(r => !r.cert.allGreen && r.cert.missing.length === 1).length;
    return `<p class="ag-trend-none">No one on today's team has been all green in the last ${AG_WEEKS} weeks${oneAway ? ` — <b>${oneAway} ${oneAway === 1 ? 'is' : 'are'} one position away</b>` : ''}. A week-by-week chart appears here once someone gets there.</p>`;
  }
  const max = Math.max(1, ...trend.map(t => t.green));
  const H = 96;
  const cols = trend.map((t, i)=>{
    const h = t.green ? Math.max(4, Math.round(t.green / max * H)) : 0;
    const label = `${peaFormatDate(t.iso)}: ${t.green} of ${t.total} all green`;
    const last = i === trend.length - 1;
    return `<div class="ag-col${last ? ' is-now' : ''}" tabindex="0" aria-label="${escapeHtml(label)}" data-tip="${escapeHtml(label)}">
      <span class="ag-col-val">${last || t.green === max ? t.green : ''}</span>
      <span class="ag-col-bar" style="height:${h}px"></span>
      <span class="ag-col-x">${last ? 'Now' : escapeHtml(peaFormatDate(t.iso))}</span>
    </div>`;
  }).join('');
  const table = `<table class="sr-only"><caption>Team members all green, by week</caption><tr><th>Week of</th><th>All green</th><th>Team</th></tr>${trend.map(t => `<tr><td>${escapeHtml(peaFormatDate(t.iso))}</td><td>${t.green}</td><td>${t.total}</td></tr>`).join('')}</table>`;
  return `<div class="ag-trend"><div class="ag-trend-title">All green, week by week <span class="pea-muted">· today's team, as of each week</span></div><div class="ag-cols" style="--ag-h:${H}px">${cols}</div>${table}</div>`;
}

function agMissingChips(person, area){
  const cert = suCertification(person, area);
  const below = agNotGreen(person, area).map(g => `<span class="ag-miss"><span class="pea-dot pea-${g.cell.tier.key}" aria-hidden="true"></span>${escapeHtml(g.pos)} <b>${g.cell.avg.toFixed(2)}</b></span>`);
  if(cert.unrated.length) below.push(`<span class="ag-miss is-unrated"><span class="pea-dot pea-empty" aria-hidden="true"></span>not rated: <b>${escapeHtml(cert.unrated.join(', '))}</b></span>`);
  return below.join('');
}

// For positions rated but not green yet: the category to coach.
function agCoachLine(r){
  if(typeof peaWeakest !== 'function') return '';
  const focus = agNotGreen(r.person, r.area).filter(g => g.cell).map(g => ({pos: g.pos, w: peaWeakest(r.peaName, g.pos)})).filter(x => x.w);
  return focus.length ? `<div class="ag-coach">Coach on: ${focus.map(x => `${escapeHtml(x.pos)} → <b>${escapeHtml(x.w.label)}</b> ${x.w.avg.toFixed(1)}`).join(' · ')}</div>` : '';
}

function renderAllGreenTracker(){
  const root = document.getElementById('allGreenRoot');
  if(!root) return;
  if(!peaRatings.rows.length){
    root.innerHTML = '<p class="pea-muted">Upload PEA ratings in Data Uploads to track who is all green.</p>';
    return;
  }
  const snap = agSnapshot();
  const {rows, unmatched, fromRoster, trend} = snap;
  const count = area => { const r = rows.filter(x => x.area === area); return {green: r.filter(x => x.cert.allGreen).length, total: r.length}; };
  const foh = count('foh'), boh = count('boh');
  const green = foh.green + boh.green;

  const areaRows = rows.filter(r => r.area === agArea);
  const done = areaRows.filter(r => r.cert.allGreen).sort((a, b) => a.name.localeCompare(b.name));
  // Fewest positions left first; people with no ratings yet go last.
  const left = r => r.cert.rated ? r.cert.missing.length : Infinity;
  const todo = areaRows.filter(r => !r.cert.allGreen).sort((a, b) => left(a) - left(b) || b.cert.green - a.cert.green || a.name.localeCompare(b.name));
  const closest = todo.filter(r => r.cert.rated && r.cert.missing.length <= 2);
  const shown = closest.length >= 5 ? closest : todo.slice(0, 8);
  const noRatings = todo.filter(r => !r.cert.rated).length;

  // What holds people back: per position, how many of those not all green
  // are rated below green there. (Unrated positions don't hold anyone back.)
  const positions = agAreaPositions(agArea);
  const gaps = positions.map(pos=>{
    let below = 0, lastOne = 0;
    todo.forEach(r=>{
      if(!r.cert.missing.includes(pos)) return;
      below++;
      if(r.cert.missing.length === 1) lastOne++;
    });
    return {pos, below, lastOne, total: below};
  }).sort((a, b) => b.lastOne - a.lastOne || b.total - a.total);
  const gapMax = Math.max(1, ...gaps.map(g => g.total));

  root.innerHTML = `
    <div class="ag-hero">
      <div><div class="ag-hero-num">${green}<span> of ${rows.length}</span></div><div class="pea-muted">team members all green</div></div>
      <div class="ag-hero-split"><span><b>FOH</b> ${foh.green} of ${foh.total}</span><span><b>BOH</b> ${boh.green} of ${boh.total}</span></div>
    </div>
    <p class="pea-muted pea-note">All green = Crushing It (2.75+) in every position they've been rated in on their side, the same rule as Levelset — ready for certification or already certified. A position never rated doesn't count against anyone; the count after each name is how many of the side's positions are rated. ${fromRoster ? 'Counts the team members on the current HotSchedules rosters' : `No rosters imported, so this counts everyone rated in the last ${AG_FALLBACK_DAYS} days`}; Trainers and Team Leads aren't counted.</p>
    ${agTrendHtml(trend, rows)}
    ${unmatched.length ? `<p class="ag-warn">${unmatched.length} roster name${unmatched.length === 1 ? ' isn’t' : 's aren’t'} matched to Levelset, so ${unmatched.length === 1 ? 'isn’t' : 'aren’t'} counted: ${escapeHtml(unmatched.slice(0, 6).join(', '))}${unmatched.length > 6 ? '…' : ''}. See Name Matching below.</p>` : ''}
    <div class="week-toggle pea-view-toggle">
      <button type="button" class="week-toggle-btn ${agArea === 'foh' ? 'active' : ''}" data-ag-area="foh" aria-pressed="${agArea === 'foh'}">FOH · ${foh.green}/${foh.total}</button>
      <button type="button" class="week-toggle-btn ${agArea === 'boh' ? 'active' : ''}" data-ag-area="boh" aria-pressed="${agArea === 'boh'}">BOH · ${boh.green}/${boh.total}</button>
    </div>
    <h4 class="ag-h">Closest to all green</h4>
    ${shown.length ? `<div class="ag-list">${shown.map(r => `
      <div class="ag-row">
        <div class="ag-row-head"><b>${escapeHtml(r.name)}</b><span class="ag-count" title="${r.cert.rated ? `${r.cert.green} of ${r.cert.rated} rated positions green` : 'no position ratings yet'}">${r.cert.rated ? `${r.cert.green}/${r.cert.rated}` : 'not rated'}</span></div>
        <div class="ag-misses">${agMissingChips(r.person, agArea)}</div>
        ${agCoachLine(r)}
      </div>`).join('')}</div>` : `<p class="pea-muted">${areaRows.length ? 'Everyone here is all green.' : 'No one on this roster yet.'}</p>`}
    ${todo.length ? `
    <h4 class="ag-h">What's holding people back</h4>
    <p class="pea-muted">Positions rated below green among the ${todo.length} not all green yet${noRatings ? ` (${noRatings} ${noRatings === 1 ? 'has' : 'have'} no position ratings yet)` : ''}. "Last one" = the only position left for that many people.</p>
    ${gaps.some(g => g.total) ? `<div class="ag-gaps">${gaps.filter(g => g.total).map(g => `
      <div class="ag-gap" title="${escapeHtml(`${g.pos}: ${g.below} rated below green`)}">
        <span class="ag-gap-pos">${escapeHtml(g.pos)}</span>
        <span class="ag-gap-bar"><span class="ag-seg is-below" style="flex:${g.below}"></span><span style="flex:${gapMax - g.total}"></span></span>
        <span class="ag-gap-n">${g.below} below${g.lastOne ? ` · <b>last one for ${g.lastOne}</b>` : ''}</span>
      </div>`).join('')}</div>` : ''}` : ''}
    ${done.length ? `<h4 class="ag-h">All green (${done.length})</h4><p class="ag-done">${done.map(r => `${escapeHtml(r.name)} <span class="pea-muted">${r.cert.rated}/${r.cert.total} rated</span>`).join(', ')}</p>` : ''}`;
}

document.addEventListener('click', e=>{
  const btn = e.target.closest('[data-ag-area]');
  if(!btn) return;
  agArea = btn.dataset.agArea;
  renderAllGreenTracker();
});
