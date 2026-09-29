// ===== PEA COACHING & "PEAs TO DO" =====
// Two uses of the PEA details beyond a position's average:
//
// 1. What to coach. Every rating has five category scores (Levelset names
//    them per position — "Smile & Shine", "Catch Every Detail"… — and the
//    Levelset sync brings the names in). A position that isn't green yet
//    usually has one category holding it back; that's what to coach.
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
