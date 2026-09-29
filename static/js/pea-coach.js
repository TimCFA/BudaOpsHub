// ===== PEA COACHING & "PEAs TO DO" =====
// Two uses of the PEA details beyond a position's average:
//
// 1. What to coach. Every rating has five category scores (Levelset names
//    them per position — "Smile & Shine", "Catch Every Detail"… — and the
//    Levelset sync brings the names in). A position that isn't green yet
//    usually has one category holding it back; that's what to coach.
//
// 3. Trends. Whether someone is climbing or slipping in a position: their
//    latest ratings against the ones before. Fill leans away from someone
//    slipping; Evaluate calls it out (a risk in a captain slot).
//
// 4. Strength. One number per daypart: the share of filled spots held by
//    someone Crushing It there.
//
// 2. PEAs to do. For each daypart, the few ratings a leader should complete
//    while those people are on the floor: a position someone is working
//    that's never been rated (the biggest gap to all green), a stale rating,
//    and today's development pick. Rated today → ticked off.

const PEA_TODO_MAX = 3;
const PEA_TODO_STALE_DAYS = 30;     // a rating this old is due again
const PEA_TODO_RECENT_DAYS = 7;     // rated this recently → not due
const PEA_COACH_GAP = 0.25;         // weakest category this far below the best

// Ratings by person and position, newest first; rebuilt when ratings change.
let peaByPersonPosCache = {rows: null, len: -1, map: null};
function peaByPersonPos(){
  const rows = peaRatings.rows;
  if(peaByPersonPosCache.rows === rows && peaByPersonPosCache.len === rows.length) return peaByPersonPosCache.map;
  const map = {};
  peaAllRatings().forEach(r => { (map[r.employee + '||' + r.position] = map[r.employee + '||' + r.position] || []).push(r); });
  Object.values(map).forEach(list => list.sort((a, b) => b.at.localeCompare(a.at)));
  peaByPersonPosCache = {rows, len: rows.length, map};
  return map;
}

function peaCategoryName(position, i){
  const names = (peaRatings.labels || {})[position];
  return names && names[i] ? names[i] : `Category ${i + 1}`;
}

// The category holding a position back: {index, label, avg, n}, or null when
// the position is green, unrated, or evenly scored.
function peaWeakest(peaName, position){
  const list = (peaByPersonPos()[peaName + '||' + position] || []).slice(0, PEA_RECENT_RATINGS);
  if(!list.length) return null;
  const overall = list.reduce((s, r) => s + r.overall, 0) / list.length;
  if(peaTierFor(overall).key === 'crushing') return null;
  const avgs = [0, 1, 2, 3, 4].map(i => list.reduce((s, r) => s + (+r.criteria[i] || 0), 0) / list.length);
  const low = Math.min(...avgs), high = Math.max(...avgs);
  if(high - low < PEA_COACH_GAP && low >= 2.5) return null;
  const index = avgs.indexOf(low);
  return {index, label: peaCategoryName(position, index), avg: low, n: list.length};
}

function peaCoachText(peaName, position){
  const w = peaWeakest(peaName, position);
  return w ? `${w.label} (${w.avg.toFixed(1)})` : '';
}

// ----- PEAs to do, per daypart -----

function suPeaTodo(section, date, dp){
  const strength = peaStrengthByPerson();
  const peaNames = Object.keys(strength);
  if(!peaNames.length) return {items: [], done: []};
  const key = suEvalKey(section, date, dp.name);
  const posMap = section === 'foh' ? fohPositions : bohPositions;
  const slots = posMap[dp.name] || [];
  const byPos = peaByPersonPos();
  const dev = setupDevelopResults[key];
  const picks = dev && dev.result ? dev.result.picks || [] : [];

  // Who's leading each zone this daypart (to suggest who rates).
  const leadersByZone = {};
  const people = [];
  slots.forEach(slot=>{
    suSplitNames(posAssignments[key + '||' + slot]).forEach(name=>{
      const role = suLeaderRole(section, date, name, strength);
      if(role) (leadersByZone[suZoneKeyOf(section, slot)] = leadersByZone[suZoneKeyOf(section, slot)] || []).push(name);
      else people.push({name, slot});
    });
  });

  const items = [], done = [];
  const seen = new Set();
  people.forEach(({name, slot})=>{
    const peaName = peaMatchName(name, peaNames);
    if(!peaName || seen.has(peaName)) return;
    const person = strength[peaName];
    if(SU_LEADER_ROLES.includes(person.role)) return;
    const cert = suCertification(person, section);
    let best = null;
    peaPositionsForSlot(section, slot).forEach(pos=>{
      const list = byPos[peaName + '||' + pos] || [];
      if(list.length && list[0].date === date){ done.push({name, pos}); return; }
      const cell = person.positions[pos];
      const age = cell ? suDaysBetween(cell.last, date) : null;
      const reasons = [];
      let score = 0;
      if(!cell){ score += 3; reasons.push('never rated here'); }
      else if(age < PEA_TODO_RECENT_DAYS) return;
      else if(age >= PEA_TODO_STALE_DAYS){ score += 1.5 + Math.min(age / 60, 1); reasons.push(`last rated ${age} days ago`); }
      else if(cell.tier.key !== 'crushing' && age >= 14){ score += 1; reasons.push(`${cell.tier.label} ${cell.avg.toFixed(2)} — re-rate to see progress`); }
      else return;
      if(!cert.allGreen && cert.missing.includes(pos)){
        const left = cert.total - cert.green;
        if(left === 1){ score += 2; reasons.push('the last position to all green'); }
        else if(left === 2){ score += 1; reasons.push('close to all green'); }
      }
      if(picks.some(p => p.name.toLowerCase() === name.toLowerCase() && p.target && p.target.pos === pos)){ score += 2; reasons.push('today’s development pick'); }
      if(!best || score > best.score) best = {name, peaName, pos, slot, score, reasons};
    });
    if(best){ seen.add(peaName); items.push(best); }
  });
  items.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  items.forEach(it=>{
    const leads = (leadersByZone[suZoneKeyOf(section, it.slot)] || []).filter(n => n.toLowerCase() !== it.name.toLowerCase());
    it.rater = leads[0] || null;
  });
  return {items: items.slice(0, PEA_TODO_MAX), done};
}

function suPeaTodoHtml(section, date, dp){
  const {items, done} = suPeaTodo(section, date, dp);
  if(!items.length && !done.length) return '';
  const row = it => `<li><span class="su-bt-time">${escapeHtml(it.pos)}</span><span class="su-bt-what"><b>${escapeHtml(suDisplayName(it.name))}</b> <em>· ${escapeHtml(it.reasons.join(' · '))}${it.rater ? ` · rate with ${escapeHtml(suDisplayName(it.rater))}` : ''}</em></span></li>`;
  const doneRow = d => `<li class="is-done"><span class="su-bt-time">✓</span><span class="su-bt-what"><b>${escapeHtml(suDisplayName(d.name))}</b> <em>· ${escapeHtml(d.pos)} rated today</em></span></li>`;
  return `
    <section class="su-bt su-pea-todo" aria-label="PEAs to do">
      <h3>PEAs to do</h3>
      <ul class="su-bt-list">${items.map(row).join('')}${done.map(doneRow).join('')}</ul>
      <p class="su-bt-foot">Rate these in Levelset while they're on the floor — never-rated positions first, since an unrated position keeps someone from all green. Rated today shows a ✓ after the next sync.</p>
    </section>`;
}

// ----- Trends -----

const PEA_TREND_STEP = 0.25;   // this much up or down between halves counts

// {dir: 'up'|'down'|'flat', from, to, n} comparing the latest ratings in a
// position (up to 3) with the same number before them; null under 4 ratings.
function peaTrend(peaName, position){
  const list = peaByPersonPos()[peaName + '||' + position] || [];
  const half = Math.min(3, Math.floor(list.length / 2));
  if(half < 2) return null;
  const avg = rs => rs.reduce((s, r) => s + r.overall, 0) / rs.length;
  const to = avg(list.slice(0, half)), from = avg(list.slice(half, half * 2));
  const diff = to - from;
  return {dir: diff >= PEA_TREND_STEP ? 'up' : diff <= -PEA_TREND_STEP ? 'down' : 'flat', from, to, n: half * 2};
}

// The trend in whichever of these positions has one (a slot can cover two).
function peaTrendFor(peaName, positions){
  for(const pos of positions){
    const tr = peaTrend(peaName, pos);
    if(tr) return {...tr, pos};
  }
  return null;
}

function peaTrendText(tr){
  return tr ? `${tr.dir === 'up' ? 'rising' : tr.dir === 'down' ? 'slipping' : 'steady'} (${tr.from.toFixed(2)} → ${tr.to.toFixed(2)})` : '';
}

function peaTrendMark(tr){
  if(!tr || tr.dir === 'flat') return '';
  return `<span class="pea-trend is-${tr.dir}" title="${escapeHtml(`${tr.dir === 'up' ? 'Rising' : 'Slipping'}: ${tr.from.toFixed(2)} → ${tr.to.toFixed(2)} over the last ${tr.n} ratings`)}">${tr.dir === 'up' ? '↑' : '↓'}</span>`;
}

// ----- Strength per daypart -----

// Filled spots that Levelset rates, and how many are held by someone
// Crushing It there. {pct, crushing, rise, notyet, unrated, total}.
function suStrength(m){
  const spots = m.tiles.filter(t => t.names.length && t.tier !== 'na');
  const c = {crushing: 0, rise: 0, notyet: 0, unrated: 0};
  spots.forEach(t => { c[t.tier] = (c[t.tier] || 0) + 1; });
  return {...c, total: spots.length, pct: spots.length ? Math.round(c.crushing / spots.length * 100) : 0};
}

function suStrengthHtml(m){
  const s = suStrength(m);
  if(!s.total) return '';
  const band = s.pct >= 80 ? 'strong' : s.pct >= 60 ? 'fair' : 'thin';
  const rest = [s.rise ? `${s.rise} On the Rise` : '', s.notyet ? `${s.notyet} Not Yet` : '', s.unrated ? `${s.unrated} unrated` : ''].filter(Boolean).join(' · ');
  return `<div class="su-strength is-${band}" title="Share of filled spots held by someone Crushing It (2.75+) in that position.">
    <span class="su-strength-bar" aria-hidden="true"><span style="width:${s.pct}%"></span></span>
    <span><b>Strength ${s.pct}%</b> · ${s.crushing} of ${s.total} spots Crushing It${rest ? ` <em>· ${escapeHtml(rest)}</em>` : ''}</span>
  </div>`;
}
