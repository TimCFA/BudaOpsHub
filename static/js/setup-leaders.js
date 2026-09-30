// ===== LEADERSHIP ON SET UPS (TIM-40 step 5) =====
// Tim's rules:
// - Lead Captain: FOH only, one per daypart, Team Leads only. Everyone
//   rotates through it on any day type: whoever hasn't been Lead Captain the
//   longest comes first. One hat only — never also a zone captain. They also
//   work a spot: Runner, Drinks 3 or FC Bagger (Afternoon: DT Bagger 2).
// - Zone captain slots ("Captain" in the name): Team Leads first, Trainers
//   once every Team Lead is leading.
// - Coverage: at least a Trainer or Team Lead in iPOS, Bagging and Host. iPOS
//   is walled off, so a leader there covers only iPOS; the Bagging captain
//   also reaches OMD and Drinks. Stretch goal: a leader in Drinks and OMD too.
// - Rotation: leaders in a different spot each day.
// Who is a leader: a HotSchedules "Team Leader" shift (roster `leader`) or a
// Levelset role of Team Lead; Trainers come from Levelset.

const SU_LEAD_CAPTAIN = 'Lead Captain';
const SU_REQUIRED_LEADER_ZONES = ['ipos', 'bagging', 'host'];
const SU_STRETCH_LEADER_ZONES = ['drinks', 'omd'];
const SU_BAGGING_CAPTAIN_REACH = ['drinks', 'omd'];

function suRosterEntryFor(section, date, name){
  const roster = (section === 'foh' ? fohRoster : bohRoster)[date] || [];
  const k = String(name).trim().toLowerCase();
  return roster.find(p => p.name.trim().toLowerCase() === k) || null;
}

// 'Team Lead' | 'Trainer' | null for someone working this date.
function suLeaderRole(section, date, name, strength){
  const entry = suRosterEntryFor(section, date, name);
  const names = Object.keys(strength);
  const peaName = names.length ? peaMatchName(name, names) : null;
  const role = peaName ? strength[peaName].role : '';
  if((entry && entry.leader) || role === 'Team Lead') return 'Team Lead';
  if(role === 'Trainer') return 'Trainer';
  return null;
}

function suZoneKeyOf(section, slot){
  if(slot === SU_LEAD_CAPTAIN) return 'lead';
  const zone = (SU_ZONES[section] || []).find(z => z.re.test(slot));
  return zone ? zone.key : 'extra';
}

function suZoneName(section, key){
  if(key === 'lead') return 'Lead Captain';
  const zone = (SU_ZONES[section] || []).find(z => z.key === key);
  return zone ? zone.name : 'Extra hands';
}

// ----- Lead Captain -----

function leadCaptainOptions(date, dp, dpIndex){
  const strength = peaStrengthByPerson();
  const names = Object.keys(strength);
  const dayType = suDayType('foh', date, dp);
  const onShift = availableForDaypart(date, dpIndex, fohDayparts);
  const records = getSetupRecords(null, date).filter(r => r.section === 'foh' && r.position === SU_LEAD_CAPTAIN);
  const historyStart = getSetupRecords(null, null).filter(r => r.section === 'foh')[0];
  const historyDays = historyStart ? suDaysBetween(historyStart.date, date) : 0;

  const options = onShift.filter(p => suLeaderRole('foh', date, p.name, strength) === 'Team Lead').map(p=>{
    const peaName = names.length ? peaMatchName(p.name, names) : null;
    const cell = peaName ? strength[peaName].positions['Team Lead'] || null : null;
    const led = records.filter(r => r.name.toLowerCase() === p.name.toLowerCase() && !(r.date === date && r.daypart === dp.name));
    const last = led.map(r => r.date).sort().pop() || null;
    const ledToday = led.filter(r => r.date === date).map(r => suShortDaypart(r.daypart));
    const since = last ? suDaysBetween(last, date) : null;
    return {name: p.name, cell, last, since, ledToday};
  });

  // Longest since they last led first, on Game and Practice Days alike (never
  // in the history kept so far counts as longest). Someone already leading
  // another daypart today goes after everyone who isn't.
  const gap = o => o.since === null ? Infinity : o.since;
  options.sort((a, b) => (a.ledToday.length > 0) - (b.ledToday.length > 0) || gap(b) - gap(a) || a.name.localeCompare(b.name));
  return {options, dayType, historyDays};
}

function suLeadCaptainLineHtml(date, dp){
  const key = suEvalKey('foh', date, dp.name) + '||' + SU_LEAD_CAPTAIN;
  const current = posAssignments[key];
  if(current){
    const working = suLeadWorkingSlot(date, dp);
    const where = working
      ? ` · working ${escapeHtml(working)}${SU_CAPTAIN_RE.test(working) ? ' <em>· also a zone captain — one hat only</em>' : ''}`
      : ' · <em>no working spot yet</em>';
    return `<div class="su-plan-line su-plan-lead"><span class="su-plan-tag is-lead">Lead</span><span><b>${escapeHtml(suDisplayName(current))}</b> is Lead Captain${where}</span><button type="button" class="su-plan-link" data-su-lead-open="1">Change</button></div>`;
  }
  return `<div class="su-plan-line su-plan-lead"><span class="su-plan-tag is-lead">Lead</span><span>No Lead Captain yet</span><button type="button" class="su-plan-link" data-su-lead-open="1">Choose</button></div>`;
}

function suLeadCaptainSheetHtml(date, dp, dpIndex){
  const {options, dayType, historyDays} = leadCaptainOptions(date, dp, dpIndex);
  const current = posAssignments[suEvalKey('foh', date, dp.name) + '||' + SU_LEAD_CAPTAIN] || '';
  const rule = 'Everyone rotates: whoever hasn’t been Lead Captain the longest comes first.';
  const key = suEvalKey('foh', date, dp.name);
  const slots = fohPositions[dp.name] || [];
  const working = current ? suLeadWorkingSlot(date, dp) : null;
  const headcount = suDaypartTiming('foh', date, dpIndex).effective;
  const home = current && !working ? suPickLeadHome(dp, slots, headcount, s => !posAssignments[key + '||' + s], () => 0, () => 0) : null;
  const captainOf = name => slots.find(s => SU_CAPTAIN_RE.test(s) && suSplitNames(posAssignments[key + '||' + s]).some(n => n.toLowerCase() === name.toLowerCase()));
  const lastText = o => o.ledToday.length ? `Leading ${o.ledToday.join(', ')} today`
    : o.last ? `Last led ${o.since === 1 ? 'yesterday' : `${o.since} days ago`}`
    : historyDays ? `Not Lead Captain in ${historyDays} days of history` : 'No Lead Captain history yet';
  const rows = options.map((o, i) => `
    <div class="su-pb-row">
      <span class="su-pb-v"><b>${escapeHtml(o.name)}${i === 0 ? ' <span class="su-suggest">Suggested</span>' : ''}</b>
        <span>${escapeHtml(lastText(o))} · ${o.cell ? `Team Lead ${o.cell.avg.toFixed(2)} · ${escapeHtml(o.cell.tier.label)} ×${o.cell.total}` : 'No Team Lead PEA yet'}${captainOf(o.name) ? ` · captaining ${escapeHtml(captainOf(o.name))} (one hat only)` : ''}</span></span>
      ${o.name.toLowerCase() === current.toLowerCase()
        ? '<span class="su-current">Current</span>'
        : `<button type="button" class="${i === 0 ? 'su-btn-dark' : 'su-btn-line'}" data-su-set-lead="${escapeHtml(o.name)}">Make Lead</button>`}
    </div>`).join('');
  const body = `
    <p class="su-sheet-rule">${escapeHtml(rule)} Only Team Leads can be Lead Captain, and they don’t also captain a zone. They work Runner if staffing allows, otherwise Drinks 3 or FC Bagger${/^afternoon/i.test(dp.name) ? ' (Afternoon: DT Bagger 2)' : ''}.</p>
    ${current ? `<div class="su-note">${working ? `${escapeHtml(current)} is working ${escapeHtml(working)}.` : home ? `${escapeHtml(current)} has no working spot yet. <button type="button" class="su-btn-dark" data-su-lead-home="${escapeHtml(home.slot)}">Put on ${escapeHtml(home.slot)}</button>` : `${escapeHtml(current)} has no working spot, and Runner, Drinks 3 and FC Bagger are taken.`}</div>` : ''}
    ${options.length ? `<div class="su-pb">${rows}</div>` : '<div class="su-note">No Team Lead is on the FOH roster for this daypart. Import the weekly HotSchedules CSV so Team Leader shifts are marked.</div>'}
    ${current ? `<div class="su-person-actions" style="grid-template-columns:1fr"><button type="button" class="su-btn-line" data-su-clear-lead="1">Clear Lead Captain (${escapeHtml(current)})</button></div>` : ''}`;
  return suSheetFrame(`Lead Captain · ${suShortDaypart(dp.name)}`, body);
}

// ----- Evaluate: leadership review -----

// Adds to an Evaluate result: Lead Captain checks (FOH), leader coverage
// (both sides) and leader rotation (both sides).
function leaderReview(section, date, dpName, entries){
  const strength = peaStrengthByPerson();
  const risks = [], leadership = [];
  const key = suEvalKey(section, date, dpName);
  const roleOf = name => suLeaderRole(section, date, name, strength);

  if(section === 'foh'){
    const dayparts = fohDayparts;
    const dpIndex = dayparts.findIndex(d => d.name === dpName);
    const lead = posAssignments[key + '||' + SU_LEAD_CAPTAIN];
    const teamLeadsOnShift = dpIndex >= 0 ? availableForDaypart(date, dpIndex, dayparts).filter(p => roleOf(p.name) === 'Team Lead') : [];
    if(lead && roleOf(lead) !== 'Team Lead') risks.push({name: lead, text: 'is Lead Captain but isn’t a Team Lead — only Team Leads can be Lead Captain'});
    if(lead){
      const hat = entries.find(e => e.captain && e.name.toLowerCase() === lead.toLowerCase());
      if(hat) risks.push({name: lead, text: `is Lead Captain and also in ${hat.slot} — one hat only; move a Team Lead or Trainer into ${hat.slot}`});
      else if(!entries.some(e => e.name.toLowerCase() === lead.toLowerCase())) leadership.push({name: lead, text: 'is Lead Captain with no working spot — Runner if staffing allows, else Drinks 3 or FC Bagger'});
    }
    if(!lead && teamLeadsOnShift.length) risks.push({name: 'Lead Captain', text: `not set — ${teamLeadsOnShift.length} Team Lead${teamLeadsOnShift.length === 1 ? '' : 's'} on shift`});

    // Coverage: which zones have a Trainer or Team Lead in them.
    const leadersIn = {};
    let baggingCaptain = null;
    entries.forEach(e=>{
      const role = roleOf(e.name);
      if(!role) return;
      const z = suZoneKeyOf('foh', e.slot);
      (leadersIn[z] = leadersIn[z] || []).push(e.name);
      if(z === 'bagging' && SU_CAPTAIN_RE.test(e.slot)) baggingCaptain = e.name;
    });
    SU_REQUIRED_LEADER_ZONES.forEach(z=>{
      if(!leadersIn[z]) risks.push({name: suZoneName('foh', z), text: 'has no Trainer or Team Lead this daypart'});
    });
    // Stacking: a zone with 2+ leaders while a higher-priority zone has none.
    SU_LEADER_ZONE_PRIORITY.forEach(z=>{
      const n = (leadersIn[z] || []).length;
      if(n < 2) return;
      const bare = SU_LEADER_ZONE_PRIORITY.filter(o => o !== z && !leadersIn[o] && !(baggingCaptain && SU_BAGGING_CAPTAIN_REACH.includes(o)));
      if(bare.length) leadership.push({name: suZoneName('foh', z), text: `has ${n} leaders (${leadersIn[z].join(', ')}) while ${bare.map(o => suZoneName('foh', o)).join(', ')} ${bare.length === 1 ? 'has' : 'have'} none — spread them out`});
    });
    // Team Leads first: a Team Lead in a regular spot while a Trainer or
    // team member holds a captain slot.
    const lo = s => s.toLowerCase();
    const tlOff = entries.filter(e => !e.captain && roleOf(e.name) === 'Team Lead' && (!lead || lo(e.name) !== lo(lead)));
    const weakCaptains = entries.filter(e => e.captain && roleOf(e.name) !== 'Team Lead');
    if(tlOff.length && weakCaptains.length){
      leadership.push({name: tlOff.map(e => e.name).join(', '), text: `${tlOff.length === 1 ? 'is a Team Lead' : 'are Team Leads'} in a regular spot while ${weakCaptains.map(e => `${e.name} (${roleOf(e.name) || 'team member'})`).join(', ')} ${weakCaptains.length === 1 ? 'holds' : 'hold'} ${weakCaptains.map(e => e.slot).join(', ')} — Team Leads captain first`});
    }
    SU_STRETCH_LEADER_ZONES.forEach(z=>{
      if(leadersIn[z]) return;
      const reached = baggingCaptain && SU_BAGGING_CAPTAIN_REACH.includes(z);
      leadership.push({name: suZoneName('foh', z), text: reached
        ? `has no leader of its own — reached by the Bagging captain (${baggingCaptain}); add one if you can`
        : 'has no leader — add a Trainer or Team Lead if you can'});
    });
  }

  // BOH coverage: a leader in Primary, then Raw, then Secondary; Prep is the
  // last place for one (it's detached from the rest of the kitchen).
  if(section === 'boh'){
    const order = suLeaderZonePriority('boh');
    const leaders = entries.filter(e => roleOf(e.name)).map(e => ({name: e.name, slot: e.slot, z: suZoneKeyOf('boh', e.slot)}));
    const inZone = z => leaders.filter(l => l.z === z);
    if(leaders.length) order.forEach((z, i)=>{
      if(inZone(z).length) return;
      // Leaders who could move here: in a later zone, doubled up, or on Prep.
      const movable = leaders.filter(l => { const j = order.indexOf(l.z); return j === -1 || j > i || inZone(l.z).length > 1; });
      leadership.push({name: suZoneName('boh', z), text: movable.length
        ? `has no leader while ${movable.map(l => `${l.name} is on ${l.slot}`).join(', ')} — leaders go Primary first, then Raw, then Secondary, Prep last`
        : 'has no leader — add a Trainer or Team Lead if you can'});
    });
  }

  // Rotation: a leader back in the same zone as their last worked day.
  const placed = [...entries.map(e => ({name: e.name, slot: e.slot}))];
  const lead = posAssignments[key + '||' + SU_LEAD_CAPTAIN];
  if(section === 'foh' && lead) placed.push({name: lead, slot: SU_LEAD_CAPTAIN});
  const records = getSetupRecords(null, null).filter(r => r.section === section && r.date < date);
  const seen = new Set();
  placed.forEach(p=>{
    const k = p.name.toLowerCase();
    if(seen.has(k) || !roleOf(p.name)) return;
    seen.add(k);
    const mine = records.filter(r => r.name.toLowerCase() === k);
    const lastDay = mine.map(r => r.date).sort().pop();
    if(!lastDay) return;
    const before = new Set(mine.filter(r => r.date === lastDay).map(r => suZoneKeyOf(section, r.position)));
    const now = suZoneKeyOf(section, p.slot);
    if(before.has(now)){
      const when = suDaysBetween(lastDay, date) === 1 ? 'yesterday' : `on ${peaFormatDate(lastDay)}`;
      leadership.push({name: p.name, text: `was in ${suZoneName(section, now)} ${when} too — rotate leaders to a different spot each day`});
    }
  });
  return {risks, leadership};
}

// ----- Actions -----

document.getElementById('allDayparts').addEventListener('click', async e=>{
  const open = e.target.closest('[data-su-lead-open]');
  const set = e.target.closest('[data-su-set-lead]');
  const clear = e.target.closest('[data-su-clear-lead]');
  const home = e.target.closest('[data-su-lead-home]');
  if(!open && !set && !clear && !home) return;
  e.stopPropagation();
  // Lead on a daypart card's banner: that daypart becomes the one worked on.
  if(open && open.dataset.suLeadDp){ suSelectedDaypart.foh = open.dataset.suLeadDp; suDaypartClosed.foh = false; }
  const date = document.getElementById('daySelect').value;
  const {dp} = suCurrentDaypart('foh', date);
  const key = suEvalKey('foh', date, dp.name) + '||' + SU_LEAD_CAPTAIN;
  if(open){ suSheet = {kind: 'lead'}; renderAllDayparts(); return; }
  if(home){
    const slotKey = suEvalKey('foh', date, dp.name) + '||' + home.dataset.suLeadHome;
    if(!posAssignments[slotKey] && posAssignments[key]) posAssignments[slotKey] = posAssignments[key];
    suSheet = null;
    renderAllDayparts();
    showToast(`✓ ${posAssignments[key]} is working ${home.dataset.suLeadHome}`);
    saveState();
    return;
  }
  if(set) posAssignments[key] = set.dataset.suSetLead;
  if(clear) delete posAssignments[key];
  suSheet = null;
  renderAllDayparts();
  saveState();
  showToast(set ? `✓ ${set.dataset.suSetLead} is Lead Captain` : 'Lead Captain cleared');
});
