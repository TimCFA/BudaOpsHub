// ===== LEADERSHIP ON SET UPS (TIM-40 step 5) =====
// Tim's rules:
// - Lead Captain: FOH only, one per daypart, Team Leads only. The pick uses
//   their Team Lead PEA alone: a Game Day gets the strongest Team Lead on
//   shift; a Practice Day rotates to whoever hasn't been Lead Captain longest.
// - Zone captain slots ("Captain" in the name): Team Leads or Trainers.
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

  // Game Day: strongest Team Lead PEA first. Practice Day: longest since they
  // last led (never in the history kept so far counts as longest).
  const score = o => o.cell ? o.cell.avg : 0;
  const gap = o => o.since === null ? Infinity : o.since;
  options.sort(dayType.type === 'game'
    ? (a, b) => score(b) - score(a) || gap(b) - gap(a) || a.name.localeCompare(b.name)
    : (a, b) => gap(b) - gap(a) || score(a) - score(b) || a.name.localeCompare(b.name));
  return {options, dayType, historyDays};
}

function suLeadCaptainLineHtml(date, dp){
  const key = suEvalKey('foh', date, dp.name) + '||' + SU_LEAD_CAPTAIN;
  const current = posAssignments[key];
  if(current){
    return `<div class="su-plan-line su-plan-lead"><span class="su-plan-tag is-lead">Lead</span><span><b>${escapeHtml(current)}</b> is Lead Captain</span><button type="button" class="su-plan-link" data-su-lead-open="1">Change</button></div>`;
  }
  return `<div class="su-plan-line su-plan-lead"><span class="su-plan-tag is-lead">Lead</span><span>No Lead Captain yet</span><button type="button" class="su-plan-link" data-su-lead-open="1">Choose</button></div>`;
}

function suLeadCaptainSheetHtml(date, dp, dpIndex){
  const {options, dayType, historyDays} = leadCaptainOptions(date, dp, dpIndex);
  const current = posAssignments[suEvalKey('foh', date, dp.name) + '||' + SU_LEAD_CAPTAIN] || '';
  const rule = dayType.type === 'game'
    ? 'Game Day — the strongest Team Lead PEA on shift comes first.'
    : 'Practice Day — whoever hasn’t been Lead Captain the longest comes first.';
  const lastText = o => o.ledToday.length ? `Leading ${o.ledToday.join(', ')} today`
    : o.last ? `Last led ${o.since === 1 ? 'yesterday' : `${o.since} days ago`}`
    : historyDays ? `Not Lead Captain in ${historyDays} days of history` : 'No Lead Captain history yet';
  const rows = options.map((o, i) => `
    <div class="su-pb-row">
      <span class="su-pb-v"><b>${escapeHtml(o.name)}${i === 0 ? ' <span class="su-suggest">Suggested</span>' : ''}</b>
        <span>${o.cell ? `Team Lead ${o.cell.avg.toFixed(2)} · ${escapeHtml(o.cell.tier.label)} ×${o.cell.total}` : 'No Team Lead PEA yet'} · ${escapeHtml(lastText(o))}</span></span>
      ${o.name.toLowerCase() === current.toLowerCase()
        ? '<span class="su-current">Current</span>'
        : `<button type="button" class="${i === 0 ? 'su-btn-dark' : 'su-btn-line'}" data-su-set-lead="${escapeHtml(o.name)}">Make Lead</button>`}
    </div>`).join('');
  const body = `
    <p class="su-sheet-rule">${escapeHtml(rule)} Only Team Leads can be Lead Captain.</p>
    ${options.length ? `<div class="su-pb">${rows}</div>` : '<div class="su-note">No Team Lead is on the FOH roster for this daypart. Import the weekly HotSchedules CSV so Team Leader shifts are marked.</div>'}
    ${current ? `<div class="su-person-actions" style="grid-template-columns:1fr"><button type="button" class="su-btn-line" data-su-clear-lead="1">Clear Lead Captain (${escapeHtml(current)})</button></div>` : ''}`;
  return suSheetFrame(`Lead Captain · ${suShortDaypart(dp.name)}`, body);
}

// ----- Evaluate: leadership review -----

// Adds to an Evaluate result: Lead Captain checks and leader coverage (FOH),
// and leader rotation (both sides).
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
    SU_STRETCH_LEADER_ZONES.forEach(z=>{
      if(leadersIn[z]) return;
      const reached = baggingCaptain && SU_BAGGING_CAPTAIN_REACH.includes(z);
      leadership.push({name: suZoneName('foh', z), text: reached
        ? `has no leader of its own — reached by the Bagging captain (${baggingCaptain}); add one if you can`
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
  if(!open && !set && !clear) return;
  e.stopPropagation();
  const date = document.getElementById('daySelect').value;
  const {dp} = suCurrentDaypart('foh', date);
  const key = suEvalKey('foh', date, dp.name) + '||' + SU_LEAD_CAPTAIN;
  if(open){ suSheet = {kind: 'lead'}; renderAllDayparts(); return; }
  if(set) posAssignments[key] = set.dataset.suSetLead;
  if(clear) delete posAssignments[key];
  suSheet = null;
  renderAllDayparts();
  await saveState();
  showToast(set ? `✓ ${set.dataset.suSetLead} is Lead Captain` : 'Lead Captain cleared');
});
