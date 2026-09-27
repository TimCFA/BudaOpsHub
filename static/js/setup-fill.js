// ===== FILL EMPTY SLOTS (TIM-42) =====
// For leaders who want a whole set up drafted. Runs on demand, proposes people
// for the daypart's EMPTY slots only (anything a leader placed stays), and
// applies nothing until the leader taps Apply.
//
// Order of decisions:
//  1. Lead Captain (FOH) if none is set — the top of the Lead Captain list.
//  2. Captain slots — Team Leads and Trainers only, Team Leads favored.
//  3. Leader coverage (FOH) — a Trainer or Team Lead in iPOS, Bagging, Host.
//  4. Practice Day: today's development picks into their target positions.
//  5. Every other empty slot in priority order, up to the people on shift:
//     the best fit for the day type, steered away from the spot and zone the
//     person worked on their last shift.

let setupFillResults = {};   // "section||date||daypart" -> {at, signature, result}

const SU_FILL_WEIGHTS = {
  game:     {crushing: 3, rise: 2, unrated: 0.6, notyet: 0.1, na: 1},
  practice: {crushing: 2.5, rise: 2.3, unrated: 1.3, notyet: 1.1, na: 1}
};

function fillEmptySlots(section, date, dp, dpIndex){
  const posMap = section === 'foh' ? fohPositions : bohPositions;
  const slots = posMap[dp.name] || [];
  const key = suEvalKey(section, date, dp.name);
  const dayType = suDayType(section, date, dp);
  const weights = SU_FILL_WEIGHTS[dayType.type];
  const strength = peaStrengthByPerson();
  const peaNames = Object.keys(strength);
  const onShift = availableForDaypart(date, dpIndex, suDaypartsFor(section));
  const headcount = onShift.length;

  const placedNames = new Set();
  slots.forEach(s => suSplitNames(posAssignments[key + '||' + s]).forEach(n => placedNames.add(n.toLowerCase())));
  suSplitNames(posAssignments[key + '||' + SU_LEAD_CAPTAIN]).forEach(n => placedNames.add(n.toLowerCase()));

  // People still free, with what we know about them.
  const records = getSetupRecords(null, null).filter(r => r.section === section && r.date < date);
  const pool = onShift.filter(p => !placedNames.has(p.name.trim().toLowerCase())).map(p=>{
    const peaName = peaNames.length ? peaMatchName(p.name, peaNames) : null;
    const person = peaName ? strength[peaName] : null;
    const mine = records.filter(r => r.name.toLowerCase() === p.name.toLowerCase());
    const lastDay = mine.map(r => r.date).sort().pop();
    const lastSlots = new Set(lastDay ? mine.filter(r => r.date === lastDay).map(r => r.position) : []);
    const lastZones = new Set([...lastSlots].map(s => suZoneKeyOf(section, s)));
    const greens = person ? Object.values(person.positions).filter(c => c.tier.key === 'crushing').length : 0;
    return {name: p.name, person, role: suLeaderRole(section, date, p.name, strength), lastSlots, lastZones, greens};
  });

  const proposals = [];   // {slot, rank, name, why}
  const notes = [];
  const take = (who, slot, why)=>{
    pool.splice(pool.indexOf(who), 1);
    proposals.push({slot, rank: slot === SU_LEAD_CAPTAIN ? 0 : slots.indexOf(slot) + 1, name: who.name, why});
  };
  const cellFor = (who, slot) => {
    const positions = peaPositionsForSlot(section, slot);
    if(!positions.length) return {tier: 'na', cell: null};
    const cell = who.person ? positions.map(p => who.person.positions[p]).filter(Boolean).sort((a, b) => b.avg - a.avg)[0] || null : null;
    return {tier: cell ? cell.tier.key : 'unrated', cell};
  };
  const fitText = (who, slot)=>{
    const {tier, cell} = cellFor(who, slot);
    if(tier === 'na') return 'not a rated spot';
    return cell ? `${cell.tier.label} ${cell.avg.toFixed(2)}` : 'unrated here';
  };
  const score = (who, slot)=>{
    const {tier, cell} = cellFor(who, slot);
    let s = weights[tier] + (cell ? (cell.avg - 2) * 0.3 : 0);
    // Rotation: leaders should be somewhere different every day, so a repeat
    // zone costs them far more than it costs a team member.
    if(who.lastSlots.has(slot)) s -= who.role ? 1.2 : 0.6;
    else if(who.lastZones.has(suZoneKeyOf(section, slot))) s -= who.role ? 0.9 : 0.25;
    return s;
  };
  const best = (candidates, slot) => candidates
    .map(who => ({who, s: score(who, slot)}))
    .sort((a, b) => b.s - a.s || a.who.greens - b.who.greens || a.who.name.localeCompare(b.who.name))[0];
  const rotationNote = (who, slot) => who.lastSlots.has(slot) ? ' · same spot as last shift' : '';

  // 1. Lead Captain
  if(section === 'foh' && !posAssignments[key + '||' + SU_LEAD_CAPTAIN]){
    const top = leadCaptainOptions(date, dp, dpIndex).options.find(o => pool.some(p => p.name === o.name));
    if(top){
      const who = pool.find(p => p.name === top.name);
      take(who, SU_LEAD_CAPTAIN, dayType.type === 'game' ? 'strongest Team Lead PEA on shift' : (top.since === null ? 'hasn’t been Lead Captain yet' : `last led ${top.since} day${top.since === 1 ? '' : 's'} ago`));
    }
  }

  // Empty slots we'll try to fill: priority order, as many as there are people.
  const empty = slots.filter(s => !posAssignments[key + '||' + s]);
  const inRange = empty.filter(s => headcount === 0 || slots.indexOf(s) + 1 <= headcount);
  const extra = empty.filter(s => !inRange.includes(s));
  const open = [...inRange, ...extra];
  const isOpen = s => open.includes(s) && !proposals.some(p => p.slot === s);

  // 2. Captain slots — Team Leads and Trainers only. Team Leads are the usual
  //    zone captains, so they get a strong edge; a Trainer who is Crushing It
  //    there still beats a Team Lead with no rating in that position.
  const TEAM_LEAD_CAPTAIN_EDGE = 0.7;
  open.filter(s => SU_CAPTAIN_RE.test(s)).forEach(slot=>{
    const leaders = pool.filter(p => p.role === 'Team Lead' || p.role === 'Trainer');
    const pick = leaders
      .map(who => ({who, s: score(who, slot) + (who.role === 'Team Lead' ? TEAM_LEAD_CAPTAIN_EDGE : 0)}))
      .sort((a, b) => b.s - a.s || a.who.name.localeCompare(b.who.name))[0];
    if(pick) take(pick.who, slot, `${pick.who.role} · ${fitText(pick.who, slot)}${rotationNote(pick.who, slot)}`);
    else if(slots.indexOf(slot) + 1 <= headcount) notes.push(`${slot} needs a Trainer or Team Lead — none free on shift.`);
  });

  // 3. Leader coverage (FOH): a leader in each required zone.
  if(section === 'foh'){
    const zoneHasLeader = z => slots.some(s => suZoneKeyOf(section, s) === z && (
      suSplitNames(posAssignments[key + '||' + s]).some(n => suLeaderRole(section, date, n, strength)) ||
      proposals.some(p => p.slot === s && suLeaderRole(section, date, p.name, strength))));
    SU_REQUIRED_LEADER_ZONES.forEach(z=>{
      if(zoneHasLeader(z)) return;
      const zoneSlots = open.filter(s => isOpen(s) && suZoneKeyOf(section, s) === z);
      const leaders = pool.filter(p => p.role);
      if(!zoneSlots.length || !leaders.length) return;
      const pick = leaders.map(who => ({who, slot: zoneSlots[0], s: score(who, zoneSlots[0])})).sort((a, b) => b.s - a.s)[0];
      take(pick.who, pick.slot, `leader for ${suZoneName(section, z)} · ${pick.who.role}`);
    });
  }

  // 4. Practice Day: development picks into their target positions.
  if(dayType.type === 'practice'){
    const dev = developShift(section, date, dp, dpIndex);
    dev.picks.forEach(pick=>{
      if(!pick.target) return;
      const who = pool.find(p => p.name === pick.name);
      if(!who) return;
      const slot = open.find(s => isOpen(s) && !SU_CAPTAIN_RE.test(s) && peaPositionsForSlot(section, s).includes(pick.target.pos));
      if(slot) take(who, slot, `★ develop on ${pick.target.pos}${pick.pair ? ` · pair with ${pick.pair.name}` : ''}`);
    });
  }

  // 5. Everything else, in priority order.
  open.forEach(slot=>{
    if(!isOpen(slot) || !pool.length) return;
    // Save leaders for leading: only use one here if nobody else is free.
    const nonLeaders = pool.filter(p => !p.role);
    const pick = best(nonLeaders.length ? nonLeaders : pool, slot);
    if(pick) take(pick.who, slot, `${fitText(pick.who, slot)}${rotationNote(pick.who, slot)}`);
  });

  const stillNeeded = inRange.filter(s => isOpen(s));
  if(stillNeeded.length) notes.push(`Not enough people for ${stillNeeded.map(s => `${s} (#${slots.indexOf(s) + 1})`).join(', ')}.`);
  if(!headcount) notes.push('No roster for this daypart — import the weekly HotSchedules CSV first.');
  if(!peaNames.length) notes.push('No PEA ratings uploaded, so picks can’t use strengths yet.');

  proposals.sort((a, b) => a.rank - b.rank);
  return {dayType, proposals, notes, leftOver: pool.map(p => p.name)};
}

function suFillSheetHtml(section, date, dp, dpIndex){
  const key = suEvalKey(section, date, dp.name);
  const res = setupFillResults[key];
  if(!res) return '';
  const r = res.result;
  const stale = res.signature !== suDevelopSignature(section, date, dp, dpIndex);
  const rule = r.dayType.type === 'game'
    ? 'Game Day — strongest fit in each spot, captains first.'
    : 'Practice Day — captains and key spots stay strong; today’s development picks go to their target positions.';
  const rows = r.proposals.map(p => `
    <div class="su-pb-row">
      <span class="su-pb-k">${p.slot === SU_LEAD_CAPTAIN ? 'Lead' : '#' + p.rank}</span>
      <span class="su-pb-v"><b>${escapeHtml(p.name)}</b><span>${escapeHtml(p.slot)} · ${escapeHtml(p.why)}</span></span>
    </div>`).join('');
  const body = `
    <p class="su-sheet-rule">${escapeHtml(rule)} Spots you already filled stay as they are.</p>
    ${stale ? '<div class="su-eval-stale">The roster or set up changed — tap Fill again for a fresh draft.</div>' : ''}
    ${r.proposals.length ? `<div class="su-pb">${rows}</div>` : '<div class="su-note">Nothing to fill — every spot up to today’s headcount is taken, or nobody is free.</div>'}
    ${r.notes.map(n => `<div class="su-eval-note">${escapeHtml(n)}</div>`).join('')}
    ${r.leftOver.length ? `<div class="su-eval-note">Still free after this: ${r.leftOver.map(escapeHtml).join(', ')}.</div>` : ''}
    ${r.proposals.length && !stale ? `<div class="su-person-actions"><button type="button" class="su-btn-line" data-su-close-sheet="1">Cancel</button><button type="button" class="su-btn-dark" data-su-apply-fill="1">Apply ${r.proposals.length} placement${r.proposals.length === 1 ? '' : 's'}</button></div>` : ''}`;
  return suSheetFrame(`Fill empty slots · ${suShortDaypart(dp.name)}`, body);
}

document.getElementById('allDayparts').addEventListener('click', async e=>{
  if(!e.target.closest('[data-su-apply-fill]')) return;
  e.stopPropagation();
  const date = document.getElementById('daySelect').value;
  const {dp, dpIndex} = suCurrentDaypart(currentPosSection, date);
  const key = suEvalKey(currentPosSection, date, dp.name);
  const res = setupFillResults[key];
  if(!res || res.signature !== suDevelopSignature(currentPosSection, date, dp, dpIndex)) return;
  let applied = 0;
  res.result.proposals.forEach(p=>{
    if(posAssignments[key + '||' + p.slot]) return; // filled meanwhile — leave it
    posAssignments[key + '||' + p.slot] = p.name;
    applied++;
  });
  delete setupFillResults[key];
  suSheet = null;
  renderAllDayparts();
  await saveState();
  showToast(`✓ ${applied} placement${applied === 1 ? '' : 's'} applied — tap Evaluate to check`);
});
