// ===== FILL EMPTY SLOTS (TIM-42, rules v2 TIM-43) =====
// For leaders who want a whole set up drafted. Runs on demand, proposes people
// for the daypart's EMPTY slots only (anything a leader placed stays), and
// applies nothing until the leader taps Apply.
//
// Order of decisions:
//  1. Lead Captain (FOH) if none is set — whoever hasn't led the longest.
//  2. Captain slots, iPOS → Bagging → Host → Drinks → OMD: Team Leads first,
//     Trainers only once every Team Lead is leading (someone on for the whole
//     daypart before a late arrival or early leaver). The Lead Captain wears
//     one hat, so never a zone captain slot.
//  3. The Lead Captain's working spot: Runner if staffing reaches it, else
//     Drinks 3 or FC Bagger — whichever zone needs a leader more (Afternoon:
//     DT Bagger 2).
//  4. Leader spread (FOH): one leader per zone in that same order before any
//     zone gets a second.
//  5. Practice Day: today's development picks into their target positions.
//  6. Every other empty slot in priority order: the best fit for the day
//     type, steered away from the spot and zone the person worked last shift
//     and from a second outside stretch (iPOS, OMD) in a row.
// Someone leaving part-way through is paired with someone arriving around
// then, and the two share one spot ("Josh/Lauren" = Josh, then Lauren).

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
  const timing = suDaypartTiming(section, date, dpIndex);
  const headcount = timing.effective;
  const winLen = Math.max(1, timing.window.endMin - timing.window.startMin);
  const lo = n => String(n).trim().toLowerCase();
  const rankOf = s => slots.indexOf(s) + 1;
  const leadKey = key + '||' + SU_LEAD_CAPTAIN;

  // Everyone a leader already placed. In a handoff both names are taken.
  const placedNames = new Set();
  slots.forEach(s => suSplitNames(posAssignments[key + '||' + s]).forEach(n => placedNames.add(lo(n))));
  const currentLead = section === 'foh' ? (posAssignments[leadKey] || '') : '';

  const proposals = [];   // {slot, rank, name, why, split?, expect?}
  const notes = [];

  // Leavers hand their spot to an arrival. A leaver the leader already placed
  // gets the split proposed on their slot; an unplaced one takes the arrival
  // along wherever they go.
  const partnerOf = {};
  timing.pairs.forEach(pr=>{
    if(placedNames.has(lo(pr.in))) return;
    const slot = slots.find(s => { const n = suSplitNames(posAssignments[key + '||' + s]); return n.length === 1 && lo(n[0]) === lo(pr.out); });
    if(slot){
      proposals.push({slot, rank: rankOf(slot), name: `${posAssignments[key + '||' + slot]}/${pr.in}`, split: true, expect: posAssignments[key + '||' + slot], why: `${pr.in} takes over @ ${suClock(pr.at)} when ${pr.out.split(/\s+/)[0]} leaves`});
      placedNames.add(lo(pr.in));
    } else if(!placedNames.has(lo(pr.out))){
      partnerOf[lo(pr.out)] = pr;
    }
  });
  const riding = new Set(Object.values(partnerOf).map(pr => lo(pr.in)));

  // People still free, with what we know about them.
  const records = getSetupRecords(null, null).filter(r => r.section === section && r.date < date);
  const person = p=>{
    const peaName = peaNames.length ? peaMatchName(p.name, peaNames) : null;
    const pea = peaName ? strength[peaName] : null;
    const mine = records.filter(r => lo(r.name) === lo(p.name));
    const lastDay = mine.map(r => r.date).sort().pop();
    const lastSlots = new Set(lastDay ? mine.filter(r => r.date === lastDay).map(r => r.position) : []);
    const lastZones = new Set([...lastSlots].map(s => suZoneKeyOf(section, s)));
    const greens = pea ? Object.values(pea.positions).filter(c => c.tier.key === 'crushing').length : 0;
    const partner = partnerOf[lo(p.name)] || null;
    // Share of the daypart this person (or their handoff) leaves uncovered.
    const miss = partner ? partner.gap / winLen : ((p.arrives !== null ? p.arrives - timing.window.startMin : 0) + (p.leaves !== null ? timing.window.endMin - p.leaves : 0)) / winLen;
    return {name: p.name, pea, role: suLeaderRole(section, date, p.name, strength), lastSlots, lastZones, greens, t: p, partner, miss};
  };
  let pool = timing.people.filter(p => !placedNames.has(lo(p.name)) && !riding.has(lo(p.name)) && lo(p.name) !== lo(currentLead)).map(person);
  const isTL = who => who.role === 'Team Lead';
  const isTrainer = who => who.role === 'Trainer';

  const take = (who, slot, why)=>{
    pool = pool.filter(p => p !== who);
    const handoff = who.partner && slot !== SU_LEAD_CAPTAIN;
    proposals.push({slot, rank: slot === SU_LEAD_CAPTAIN ? 0 : rankOf(slot), name: handoff ? `${who.name}/${who.partner.in}` : who.name,
      why: why + (handoff ? ` · → ${who.partner.in} @ ${suClock(who.partner.at)}` : '')});
  };
  const cellFor = (who, slot) => {
    const positions = peaPositionsForSlot(section, slot);
    if(!positions.length) return {tier: 'na', cell: null};
    const cell = who.pea ? positions.map(p => who.pea.positions[p]).filter(Boolean).sort((a, b) => b.avg - a.avg)[0] || null : null;
    return {tier: cell ? cell.tier.key : 'unrated', cell};
  };
  const fitText = (who, slot)=>{
    const {tier, cell} = cellFor(who, slot);
    if(tier === 'na') return 'not a rated spot';
    return cell ? `${cell.tier.label} ${cell.avg.toFixed(2)}` : 'unrated here';
  };
  const outsideFor = (who, slot) => suIsOutside(section, slot)
    ? suOutsideRun(section, date, who.name, dp.name, who.t.from, who.partner ? who.partner.at : who.t.to) : null;
  const score = (who, slot)=>{
    const {tier, cell} = cellFor(who, slot);
    let s = weights[tier] + (cell ? (cell.avg - 2) * 0.3 : 0);
    // Rotation: leaders should be somewhere different every day, so a repeat
    // zone costs them far more than it costs a team member.
    if(who.lastSlots.has(slot)) s -= who.role ? 1.2 : 0.6;
    else if(who.lastZones.has(suZoneKeyOf(section, slot))) s -= who.role ? 0.9 : 0.25;
    // Not here for the whole daypart: better in a later-priority spot.
    s -= who.miss * 3;
    // Outside (iPOS, OMD): never past 3.5 hours in a row, and rotate inside
    // after an outside daypart.
    const run = outsideFor(who, slot);
    if(run && run.minutes > SU_OUTSIDE_LIMIT_MIN) s -= 3;
    else if(run && run.touching.length) s -= 1.2;
    return s;
  };
  // Past 3.5 hours outside is off the table unless nobody else can go.
  const tooLongOutside = (who, slot) => { const run = outsideFor(who, slot); return !!run && run.minutes > SU_OUTSIDE_LIMIT_MIN; };
  const best = (candidates, slot, bonus) => {
    const ok = candidates.filter(who => !tooLongOutside(who, slot));
    return (ok.length ? ok : candidates)
    .map(who => ({who, s: score(who, slot) + (bonus ? bonus(who) : 0)}))
    .sort((a, b) => b.s - a.s || a.who.greens - b.who.greens || a.who.name.localeCompare(b.who.name))[0];
  };
  // A captain slot can't sit empty while its leader is on the way in or gone.
  const captainBonus = who => -who.miss * 4;
  const extraNotes = (who, slot)=>{
    const bits = [];
    if(who.lastSlots.has(slot)) bits.push('same spot as last shift');
    const run = outsideFor(who, slot);
    if(run && run.minutes > SU_OUTSIDE_LIMIT_MIN) bits.push(`outside ${(run.minutes / 60).toFixed(1)}h in a row`);
    else if(run && run.touching.length) bits.push(`outside in ${run.touching.map(suShortDaypart).join(', ')} too`);
    if(!who.partner && who.t.arrives !== null) bits.push(`from ${suClock(who.t.arrives)}`);
    if(!who.partner && who.t.leaves !== null) bits.push(`leaves ${suClock(who.t.leaves)}`);
    return bits.length ? ' · ' + bits.join(' · ') : '';
  };

  // Empty slots we'll try to fill: priority order, as many as there are spots.
  const empty = slots.filter(s => !posAssignments[key + '||' + s]);
  const inRange = empty.filter(s => headcount === 0 || rankOf(s) <= headcount);
  const extra = empty.filter(s => !inRange.includes(s));
  const open = [...inRange, ...extra];
  const isOpen = s => open.includes(s) && !proposals.some(p => p.slot === s);
  const zonePriority = s => { const i = suLeaderZonePriority(section).indexOf(suZoneKeyOf(section, s)); return i === -1 ? 99 : i; };

  // Who is leading each zone: placed leaders plus leaders proposed so far.
  const leadersIn = z => slots.filter(s => suZoneKeyOf(section, s) === z).reduce((n, s)=>{
    const prop = proposals.find(p => p.slot === s && !p.split);
    const names = prop ? [prop.name.split('/')[0]] : suSplitNames(posAssignments[key + '||' + s]).slice(0, 1);
    return n + names.filter(nm => suLeaderRole(section, date, nm, strength)).length;
  }, 0);

  // 1. Lead Captain
  let leadWho = null;
  if(section === 'foh'){
    if(!currentLead){
      const options = leadCaptainOptions(date, dp, dpIndex).options.filter(o => pool.some(p => p.name === o.name));
      const whole = options.filter(o => { const who = pool.find(p => p.name === o.name); return who.t.arrives === null && who.t.leaves === null; });
      const top = (whole.length ? whole : options)[0];
      if(top){
        leadWho = pool.find(p => p.name === top.name);
        take(leadWho, SU_LEAD_CAPTAIN, top.ledToday.length ? `already leading ${top.ledToday.join(', ')} today` : top.since === null ? 'hasn’t been Lead Captain yet' : `last led ${top.since} day${top.since === 1 ? '' : 's'} ago`);
      } else if(timing.people.some(p => suLeaderRole(section, date, p.name, strength) === 'Team Lead')){
        notes.push('Every Team Lead on shift is already placed — set a Lead Captain from the Lead line.');
      }
    } else if(!suLeadWorkingSlot(date, dp)){
      const p = timing.people.find(x => lo(x.name) === lo(currentLead));
      if(p) leadWho = person(p);
    }
  }

  // 2. Captain slots — Team Leads first, then Trainers. Never the Lead Captain.
  open.filter(s => SU_CAPTAIN_RE.test(s)).sort((a, b) => zonePriority(a) - zonePriority(b) || rankOf(a) - rankOf(b)).forEach(slot=>{
    // Team Leads first, Trainers next — but someone here for the whole
    // daypart before anyone arriving late or leaving early, so the captain
    // spot never sits empty. A part-daypart Team Lead then leads a zone.
    const whole = who => who.miss <= 0.1;
    const tiers = [pool.filter(w => isTL(w) && whole(w)), pool.filter(w => isTrainer(w) && whole(w)), pool.filter(isTL), pool.filter(isTrainer)];
    const cands = tiers.find(t => t.length) || [];
    const pick = cands.length ? best(cands, slot, captainBonus) : null;
    if(pick) take(pick.who, slot, `${pick.who.role} · ${fitText(pick.who, slot)}${extraNotes(pick.who, slot)}`);
    else if(!headcount || rankOf(slot) <= headcount) notes.push(`${slot} needs a Team Lead or Trainer — none free on shift.`);
  });

  // 3. The Lead Captain's working spot.
  if(leadWho){
    const weakness = z => slots.filter(s => suZoneKeyOf(section, s) === z).reduce((n, s)=>{
      const prop = proposals.find(p => p.slot === s && !p.split);
      const nm = prop ? prop.name.split('/')[0] : suSplitNames(posAssignments[key + '||' + s])[0];
      if(!nm) return n;
      const peaName = peaNames.length ? peaMatchName(nm, peaNames) : null;
      const cell = peaName ? peaPositionsForSlot(section, s).map(p => strength[peaName].positions[p]).filter(Boolean).sort((a, b) => b.avg - a.avg)[0] : null;
      return n + (cell && cell.tier.key === 'crushing' ? 0 : 1);
    }, 0);
    const home = suPickLeadHome(dp, slots, headcount, isOpen, leadersIn, weakness);
    if(home){
      pool = pool.filter(p => p !== leadWho);
      proposals.push({slot: home.slot, rank: rankOf(home.slot), name: leadWho.name, why: `Lead Captain’s working spot · ${home.why}`});
    } else {
      notes.push(`No Runner, Drinks 3 or FC Bagger spot free for ${leadWho.name} to work as Lead Captain.`);
    }
  }

  // 4. Leader spread: a leader in each zone before any zone gets a second —
  //    FOH iPOS → Bagging → Host → Drinks → OMD, BOH Primary → Raw →
  //    Secondary (Prep last: it's not in the spread). Team Leads before Trainers.
  {
    for(let round = 1; round <= 3; round++){
      let placed = 0;
      suLeaderZonePriority(section).forEach(z=>{
        if(leadersIn(z) >= round) return;
        // Leaders here for the whole daypart (or handing off to someone);
        // one leaving early would leave the zone's spot empty.
        const steady = w => w.miss <= 0.1;
        const tls = pool.filter(w => isTL(w) && steady(w)), trainers = pool.filter(w => isTrainer(w) && steady(w));
        const cands = tls.length ? tls : trainers;
        if(!cands.length) return;
        const zoneSlots = inRange.filter(s => isOpen(s) && suZoneKeyOf(section, s) === z && !SU_CAPTAIN_RE.test(s));
        if(!zoneSlots.length) return;
        // Spreading is optional: skip a zone rather than send a leader past
        // 3.5 hours outside.
        const picks = zoneSlots.map(slot => ({slot, ...best(cands, slot)})).filter(x => !tooLongOutside(x.who, x.slot)).sort((a, b) => b.s - a.s || rankOf(a.slot) - rankOf(b.slot));
        const pick = picks[0];
        if(!pick) return;
        take(pick.who, pick.slot, `leads ${suZoneName(section, z)} · ${pick.who.role} · ${fitText(pick.who, pick.slot)}${extraNotes(pick.who, pick.slot)}`);
        placed++;
      });
      if(!placed || !pool.some(p => p.role)) break;
    }
  }

  // 5. Practice Day: development picks into their target positions.
  if(dayType.type === 'practice'){
    const dev = developShift(section, date, dp, dpIndex);
    dev.picks.forEach(pick=>{
      if(!pick.target) return;
      const who = pool.find(p => p.name === pick.name);
      if(!who) return;
      // Only spots within today's headcount, so a development pick never
      // leaves a priority spot empty.
      const slot = inRange.find(s => isOpen(s) && !SU_CAPTAIN_RE.test(s) && peaPositionsForSlot(section, s).includes(pick.target.pos) && !tooLongOutside(who, s));
      if(slot) take(who, slot, `★ develop on ${pick.target.pos}${pick.pair ? ` · pair with ${pick.pair.name}` : ''}`);
    });
  }

  // 6. Everything else, in priority order.
  open.forEach(slot=>{
    if(!isOpen(slot) || !pool.length) return;
    const cands = SU_CAPTAIN_RE.test(slot) ? pool.filter(p => p.role) : pool;
    const pick = cands.length ? best(cands, slot, SU_CAPTAIN_RE.test(slot) ? captainBonus : null) : null;
    if(pick) take(pick.who, slot, `${fitText(pick.who, slot)}${extraNotes(pick.who, slot)}`);
  });

  const stillNeeded = inRange.filter(s => isOpen(s));
  if(stillNeeded.length) notes.push(`Not enough people for ${stillNeeded.map(s => `${s} (#${rankOf(s)})`).join(', ')}.`);
  if(!timing.people.length) notes.push('No roster for this daypart — import the weekly HotSchedules CSV first.');
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
  const rule = (r.dayType.type === 'game'
    ? 'Game Day — strongest fit in each spot.'
    : 'Practice Day — key spots stay strong; today’s development picks go to their target positions.')
    + (section === 'foh' ? ' Team Leads lead first (Lead Captain, then captain spots), then leaders spread iPOS → Bagging → Host → Drinks → OMD.' : '');
  const rows = r.proposals.map(p => `
    <div class="su-pb-row">
      <span class="su-pb-k">${p.slot === SU_LEAD_CAPTAIN ? 'Lead' : '#' + p.rank}</span>
      <span class="su-pb-v"><b>${escapeHtml(p.name.split('/').join(' → '))}</b><span>${escapeHtml(p.slot)} · ${escapeHtml(p.why)}</span></span>
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
    const k = key + '||' + p.slot;
    // A split only applies if the slot still holds who it held; anything
    // else filled meanwhile is left alone.
    if(p.split ? posAssignments[k] !== p.expect : posAssignments[k]) return;
    posAssignments[k] = p.name;
    applied++;
  });
  delete setupFillResults[key];
  suSheet = null;
  renderAllDayparts();
  saveState();
  showToast(`✓ ${applied} placement${applied === 1 ? '' : 's'} applied${suMode === 'coach' ? ' — tap Evaluate to check' : ''}`);
});
