// ===== GAME DAY / PRACTICE DAY + DEVELOP THIS SHIFT (TIM-40 step 3) =====
// Most leaders build their own game plan and want help choosing the few
// people to develop this shift, without handing the whole shift to a
// suggestion. "Develop this shift" ranks the team members on shift by how much
// they need intentional development, suggests where to develop each one and
// which Trainer to pair them with, and sizes the list to the room the shift
// has: fewer picks on a Game Day or a thinly staffed daypart.
//
// Game Day vs Practice Day (Tim): Fridays and Saturdays are Game Days; a
// special event, projected sales well above that daypart's usual, or a higher
// productivity goal can tip any daypart toward Game Day. Leaders can override.

const SU_GAME_WEEKDAYS = [5, 6];          // Friday, Saturday
const SU_HIGH_SALES = 1.15;               // 15% above the daypart's usual
const SU_HIGH_GOAL = 1.10;                // 10% above the usual productivity goal
const SU_PEA_OVERDUE_DAYS = 30;

// Leader overrides: {"section||date||daypart": 'game' | 'practice'}
let setupDayTypes = {};
let setupDevelopResults = {};   // same key -> {at, signature, result}

function pruneSetupDayTypes(){
  const cutoff = setupHistoryDateCutoff(14);
  let pruned = false;
  Object.keys(setupDayTypes).forEach(k=>{
    if(k.split('||')[1] < cutoff){ delete setupDayTypes[k]; pruned = true; }
  });
  return pruned;
}

// Numbers for a daypart on any date: live (last two weeks) or from history.
// BOH dayparts don't line up with the FOH ones numbers are entered under, so
// they take the FOH daypart their start time falls in.
function suNumbersFor(date, dp){
  const live = numbersData[date];
  if(live && Object.keys(live).length){
    const e = getNumbersForDaypart(date, dp);
    return e ? [parseMoney(e.projectedSales), parseMoney(e.productivityGoal), String(e.specialEvents || '').trim()] : null;
  }
  const hist = numbersHistory[date];
  if(!hist) return null;
  if(hist[dp.name]) return hist[dp.name];
  const target = parseDaypartTimeToMinutes(dp.time);
  const idx = fohDayparts.findIndex((f, i) => { const w = daypartTimeWindow(fohDayparts, i); return target >= w.startMin && target < w.endMin; });
  return idx >= 0 ? (hist[fohDayparts[idx].name] || null) : null;
}

// What this daypart's sales / goal usually are: the same weekday over the last
// 8 weeks (2+ values), otherwise any day in the last 4 weeks (4+ values).
function suUsualNumbers(date, dp, field){
  const values = (days, weekdayOnly)=>{
    const out = [];
    for(let i = 1; i <= days; i++){
      const d = new Date(date + 'T00:00:00');
      d.setDate(d.getDate() - i);
      if(weekdayOnly && i % 7 !== 0) continue;
      const rec = suNumbersFor(toLocalISODate(d), dp);
      if(rec && rec[field] !== null) out.push(rec[field]);
    }
    return out;
  };
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const sameDay = values(56, true);
  if(sameDay.length >= 2) return avg(sameDay);
  const recent = values(28, false);
  return recent.length >= 4 ? avg(recent) : null;
}

function suDayType(section, date, dp){
  const weekday = new Date(date + 'T00:00:00').getDay();
  const reasons = [];
  let score = 0;
  if(SU_GAME_WEEKDAYS.includes(weekday)){ score += 2; reasons.push(weekday === 5 ? 'Friday' : 'Saturday'); }
  const nums = suNumbersFor(date, dp);
  if(nums){
    if(nums[2]){ score += 1; reasons.push('special event'); }
    const usualSales = suUsualNumbers(date, dp, 0);
    if(nums[0] !== null && usualSales && nums[0] >= usualSales * SU_HIGH_SALES){
      score += 1; reasons.push(`sales ${Math.round((nums[0] / usualSales - 1) * 100)}% above usual`);
    }
    const usualGoal = suUsualNumbers(date, dp, 1);
    if(nums[1] !== null && usualGoal && nums[1] >= usualGoal * SU_HIGH_GOAL){
      score += 1; reasons.push('higher productivity goal');
    }
  }
  const auto = score >= 2 ? 'game' : 'practice';
  const override = setupDayTypes[suEvalKey(section, date, dp.name)];
  return {type: override || auto, auto, overridden: !!override && override !== auto, reasons};
}

function suDayTypeBadge(section, date, dp){
  const t = suDayType(section, date, dp);
  const why = t.overridden ? 'set by a leader' : (t.reasons.length ? t.reasons.join(' + ') : 'weekday, no event or high numbers');
  return `<span class="su-daytype su-${t.type}" title="${escapeHtml(why)}">${t.type === 'game' ? 'Game Day' : 'Practice Day'}</span>`;
}

// ----- Develop this shift -----

// Certified ("all-green") = Crushing It in every position of their area.
function suCertification(person, section){
  const positions = (PEA_POSITION_GROUPS.find(g => g.key === section) || {positions: []}).positions;
  const green = positions.filter(p => person && person.positions[p] && person.positions[p].tier.key === 'crushing');
  return {green: green.length, total: positions.length, missing: positions.filter(p => !green.includes(p)), certified: green.length === positions.length};
}

// A position where repeated ratings aren't moving: 3+ ratings, not green,
// and the latest 3 average less than 0.3 above the first 3.
function suStalledPositions(peaName, section){
  const positions = new Set((PEA_POSITION_GROUPS.find(g => g.key === section) || {positions: []}).positions);
  const byPos = {};
  peaAllRatings().forEach(r=>{
    if(r.employee === peaName && positions.has(r.position)) (byPos[r.position] = byPos[r.position] || []).push(r);
  });
  return Object.entries(byPos).filter(([, list])=>{
    if(list.length < 3) return false;
    list.sort((a, b) => a.at.localeCompare(b.at));
    const recent = list.slice(-PEA_RECENT_RATINGS);
    const avg = recent.reduce((s, r) => s + r.overall, 0) / recent.length;
    const mean = a => a.reduce((sum, r) => sum + r.overall, 0) / a.length;
    return avg < 2.75 && mean(list.slice(-3)) - mean(list.slice(0, 3)) < 0.3;
  }).map(([pos, list]) => ({pos, n: list.length}));
}

function suLastPositionalRating(person, section){
  const positions = new Set((PEA_POSITION_GROUPS.find(g => g.key === section) || {positions: []}).positions);
  return Object.entries(person.positions).filter(([p]) => positions.has(p)).map(([, c]) => c.last).sort().pop() || null;
}

function developShift(section, date, dp, dpIndex){
  const dayparts = section === 'foh' ? fohDayparts : bohDayparts;
  const posMap = section === 'foh' ? fohPositions : bohPositions;
  const dayType = suDayType(section, date, dp);
  const onShift = availableForDaypart(date, dpIndex, dayparts);
  const strength = peaStrengthByPerson();
  const peaNames = Object.keys(strength);
  const slotPositions = new Set((posMap[dp.name] || []).flatMap(s => peaPositionsForSlot(section, s)));
  const assigned = {};
  Object.keys(posAssignments).forEach(k=>{
    if(!k.startsWith(suEvalKey(section, date, dp.name) + '||')) return;
    suSplitNames(posAssignments[k]).forEach(n => assigned[n.toLowerCase()] = k.split('||')[3]);
  });

  const people = onShift.map(p => {
    const peaName = peaNames.length ? peaMatchName(p.name, peaNames) : null;
    return {name: p.name, peaName, person: peaName ? strength[peaName] : null};
  });
  const trainers = people.filter(p => p.person && p.person.role === 'Trainer');
  const teamLeads = people.filter(p => p.person && p.person.role === 'Team Lead');
  const unmatched = people.filter(p => !p.person).map(p => p.name);

  // Rotation gaps from set-up history (same rule as Evaluate).
  const records = getSetupRecords(null, null).filter(r => r.section === section && r.date < date);
  const historyDays = records.length ? suDaysBetween(records[0].date, date) : 0;

  const candidates = people.filter(p => p.person && !SU_LEADER_ROLES.includes(p.person.role)).map(p=>{
    const cert = suCertification(p.person, section);
    if(cert.certified) return null;
    const reasons = [];
    let score = 0;
    const stalled = suStalledPositions(p.peaName, section);
    if(stalled.length){ score += 3; reasons.push(`stalled on ${stalled.map(s => `${s.pos} (${s.n} ratings)`).join(', ')}`); }
    if(cert.total - cert.green <= 2){ score += 2; reasons.push(`${cert.green} of ${cert.total} green — close to certified`); }
    const last = suLastPositionalRating(p.person, section);
    if(!last){ score += 2; reasons.push('no position ratings yet'); }
    else {
      const age = suDaysBetween(last, today);
      if(age >= SU_PEA_OVERDUE_DAYS){ score += 2; reasons.push(`last PEA ${age} days ago`); }
    }
    const notYet = Object.entries(p.person.positions).filter(([pos, c]) => slotPositions.has(pos) && c.tier.key === 'notyet').map(([pos]) => pos);
    if(notYet.length){ score += 1; reasons.push(`Not Yet on ${notYet.join(', ')}`); }
    if(historyDays >= SU_ROTATION_DAYS){
      const key = p.name.toLowerCase();
      const worked = new Set(records.filter(r => r.name.toLowerCase() === key).flatMap(r => peaPositionsForSlot(section, r.position)));
      const idle = Object.keys(p.person.positions).filter(pos => slotPositions.has(pos) && !worked.has(pos));
      if(idle.length){ score += 1; reasons.push(`not on ${idle.join(', ')} in ${historyDays} days`); }
    }
    if(!score) return null;

    // Where to develop them: a non-green position this daypart has. Stalled
    // first, then On the Rise (closest to green), then unrated, then Not Yet.
    // A Game Day only takes On the Rise — no first tries or Not Yet on the
    // busiest shifts.
    const options = cert.missing.filter(pos => slotPositions.has(pos)).map(pos=>{
      const cell = p.person.positions[pos];
      const tier = cell ? cell.tier.key : 'unrated';
      const rank = stalled.some(s => s.pos === pos) ? 0 : tier === 'rise' ? 1 : tier === 'unrated' ? 2 : 3;
      return {pos, cell, tier, rank};
    }).filter(o => dayType.type === 'practice' || o.tier === 'rise').sort((a, b) => a.rank - b.rank || (b.cell ? b.cell.avg : 0) - (a.cell ? a.cell.avg : 0));
    const target = options[0] || null;

    const peaDue = target && (!target.cell || suDaysBetween(target.cell.last, today) >= 14);
    return {name: p.name, person: p.person, score, reasons, target, pair: null, peaDue, placed: assigned[p.name.toLowerCase()] || null, cert};
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.cert.green - b.cert.green || a.name.localeCompare(b.name));

  // Who to pair each pick with: a Trainer on shift — one not captaining a
  // zone and Crushing It in that position first, and spread so each Trainer
  // takes one pick before anyone gets two — then a Crushing It team member,
  // then, last, a Team Lead (usually a zone captain, not there to put out fires).
  const pairFor = (pick, used)=>{
    const t = pick.target;
    if(!t) return null;
    const crushingIn = x => x.person && x.person.positions[t.pos] && x.person.positions[t.pos].tier.key === 'crushing';
    const free = x => !SU_CAPTAIN_RE.test(assigned[x.name.toLowerCase()] || '');
    const load = x => used.get(x.name) || 0;
    const ranked = [...trainers].sort((a, b) => load(a) - load(b) || (free(b) - free(a)) || (crushingIn(b) - crushingIn(a)));
    const tr = ranked[0];
    if(tr){
      used.set(tr.name, load(tr) + 1);
      return {name: tr.name, kind: (crushingIn(tr) ? `Trainer · Crushing It on ${t.pos}` : 'Trainer') + (free(tr) ? '' : ` · captaining ${assigned[tr.name.toLowerCase()]}`)};
    }
    const tm = people.find(x => x.name !== pick.name && crushingIn(x) && !SU_LEADER_ROLES.includes(x.person.role));
    if(tm) return {name: tm.name, kind: `Crushing It on ${t.pos} · no Trainer on shift`};
    if(teamLeads[0]) return {name: teamLeads[0].name, kind: 'Team Lead — only if their zone can spare them'};
    return null;
  };

  // Room to develop: a Practice Day takes about one pick per 4 people on shift
  // (1–4); a Game Day takes one, and only with 8+ on shift and a Trainer there.
  const room = dayType.type === 'game'
    ? (onShift.length >= 8 && trainers.length ? 1 : 0)
    : Math.max(1, Math.min(4, Math.floor(onShift.length / 4)));

  const used = new Map();
  candidates.slice(0, room + 3).forEach(c => c.pair = pairFor(c, used));

  return {dayType, onShift: onShift.length, trainers: trainers.map(t => t.name), room,
    picks: candidates.slice(0, room), more: candidates.slice(room, room + 3), unmatched, hasPea: peaNames.length > 0};
}

function suDevelopSignature(section, date, dp, dpIndex){
  const dayparts = section === 'foh' ? fohDayparts : bohDayparts;
  return JSON.stringify([availableForDaypart(date, dpIndex, dayparts).map(p => p.name).sort(), suDayType(section, date, dp).type, suSetupSignature(section, date, dp.name)]);
}

function suPickHtml(pick, i){
  const t = pick.target;
  const where = t ? `Develop on <b>${escapeHtml(t.pos)}</b> <span class="su-muted">(${t.cell ? `${t.cell.tier.label} ${t.cell.avg.toFixed(2)} ×${t.cell.total}` : 'not rated yet'})</span>` : '<span class="su-muted">No non-green position in this daypart that fits today</span>';
  return `
    <li class="su-pick">
      <div class="su-pick-head"><span class="su-pick-n">${i + 1}</span><b>${escapeHtml(pick.name)}</b><span class="su-muted">${pick.cert.green}/${pick.cert.total} green${pick.placed ? ` · in ${escapeHtml(pick.placed)}` : ' · not placed yet'}</span></div>
      <div class="su-pick-why">${pick.reasons.map(r => `<span>${escapeHtml(r)}</span>`).join('')}</div>
      <div class="su-pick-plan">${where}${pick.pair ? ` · pair with <b>${escapeHtml(pick.pair.name)}</b> <span class="su-muted">(${escapeHtml(pick.pair.kind)})</span>` : ''}${pick.peaDue && t ? ` · 📝 complete a ${escapeHtml(t.pos)} PEA` : ''}</div>
    </li>`;
}

function renderSetupDevelop(section, date, dp, dpIndex){
  const key = suEvalKey(section, date, dp.name);
  const res = setupDevelopResults[key];
  const t = suDayType(section, date, dp);
  const dpAttr = escapeHtml(dp.name);
  const toggle = `
    <div class="su-daytype-toggle" role="group" aria-label="Day type">
      <button type="button" class="${t.type === 'practice' ? 'active' : ''}" data-su-daytype="practice" data-su-dp="${dpAttr}" aria-pressed="${t.type === 'practice'}">Practice Day</button>
      <button type="button" class="${t.type === 'game' ? 'active' : ''}" data-su-daytype="game" data-su-dp="${dpAttr}" aria-pressed="${t.type === 'game'}">Game Day</button>
    </div>
    <span class="su-muted">${t.overridden ? `Set by a leader (auto: ${t.auto === 'game' ? 'Game' : 'Practice'} Day)` : t.reasons.length ? `Auto: ${escapeHtml(t.reasons.join(' + '))}` : 'Auto: weekday, no event or high numbers'}</span>`;

  if(!res){
    return `
      <div class="su-develop">
        <div class="su-develop-bar">${toggle}</div>
        <div class="su-develop-bar">
          <button type="button" class="su-eval-btn" data-su-develop="${dpAttr}" data-su-dpindex="${dpIndex}">Develop this shift</button>
          <span class="su-eval-hint">Who to develop this daypart, where, and with which Trainer.</span>
        </div>
      </div>`;
  }
  const r = res.result;
  const stale = res.signature !== suDevelopSignature(section, date, dp, dpIndex);
  const time = new Date(res.at).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
  const notes = [];
  if(!r.hasPea) notes.push('Upload PEA ratings (Manage → PEA Ratings) to get development picks.');
  if(!r.trainers.length) notes.push('No Trainer on shift this daypart — pair with a Crushing It team member, or keep development light.');
  if(r.unmatched.length) notes.push(`No PEA match for ${r.unmatched.map(escapeHtml).join(', ')} — link names in Manage → PEA Ratings → Name Matching.`);
  notes.push('Tenure isn’t factored in yet — it needs hire dates from the employee list upload.');
  return `
    <div class="su-develop">
      <div class="su-develop-bar">${toggle}</div>
      <div class="su-eval has-result ${stale ? 'is-stale' : ''}">
        <div class="su-eval-head">
          <span class="su-eval-title">Develop this shift <span class="su-eval-time">· ${time} · ${r.dayType.type === 'game' ? 'Game' : 'Practice'} Day · ${r.onShift} on shift · room for ${r.room}</span></span>
          <button type="button" class="su-eval-btn small" data-su-develop="${dpAttr}" data-su-dpindex="${dpIndex}">Refresh</button>
        </div>
        ${stale ? '<div class="su-eval-stale">The roster, set up or day type changed — press Refresh.</div>' : ''}
        ${r.picks.length ? `<ol class="su-picks">${r.picks.map(suPickHtml).join('')}</ol>`
          : `<div class="su-eval-note">${r.room ? 'Nobody on shift needs a development focus right now.' : `No room to develop this daypart (${r.dayType.type === 'game' ? 'Game Day' : 'Practice Day'}, ${r.onShift} on shift${r.trainers.length ? '' : ', no Trainer'}).`}</div>`}
        ${r.more.length ? `<div class="su-more"><span class="su-muted">${r.room ? 'Next up if there’s room' : 'Top candidates if a moment opens up'}:</span> ${r.more.map(m => `<b>${escapeHtml(m.name)}</b>${m.target ? ` (${escapeHtml(m.target.pos)})` : ''}`).join(', ')}</div>` : ''}
        ${notes.map(n => `<div class="su-eval-note">${n}</div>`).join('')}
      </div>
    </div>`;
}

document.getElementById('allDayparts').addEventListener('click', async e=>{
  const dt = e.target.closest('[data-su-daytype]');
  const dev = e.target.closest('[data-su-develop]');
  if(!dt && !dev) return;
  e.stopPropagation();
  const date = document.getElementById('daySelect').value;
  if(dt){
    const dayparts = currentPosSection === 'foh' ? fohDayparts : bohDayparts;
    const dp = dayparts.find(d => d.name === dt.dataset.suDp);
    const key = suEvalKey(currentPosSection, date, dp.name);
    delete setupDayTypes[key];
    if(suDayType(currentPosSection, date, dp).auto !== dt.dataset.suDaytype) setupDayTypes[key] = dt.dataset.suDaytype;
    renderAllDayparts();
    await saveState();
    return;
  }
  const dayparts = currentPosSection === 'foh' ? fohDayparts : bohDayparts;
  const dpIndex = parseInt(dev.dataset.suDpindex, 10);
  const dp = dayparts[dpIndex];
  setupDevelopResults[suEvalKey(currentPosSection, date, dp.name)] = {
    at: Date.now(),
    signature: suDevelopSignature(currentPosSection, date, dp, dpIndex),
    result: developShift(currentPosSection, date, dp, dpIndex)
  };
  renderAllDayparts();
});
