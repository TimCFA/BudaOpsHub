// ===== SET UP EVALUATION (TIM-40 step 4) =====
// A leader presses Evaluate on a daypart to score its set up. Nothing is
// recalculated as the set up changes; the result says when it was run and is
// marked out of date once the set up differs from what was evaluated.
//
// It reads PEA tiers (pea-ratings.js) and set-up history (setup-history.js):
//   Risk        — Captain slots held by someone Not Yet / unrated or who isn't
//                 a Team Lead or Trainer, and Not Yet
//                 placements with no Crushing It person in that position
//   Development — people placed where they're On the Rise / Not Yet
//   Rotation    — rated/worked positions someone hasn't worked in 2+ weeks,
//                 and anyone in the same position for most recent shifts
//   Rating due  — placements with no PEA rating in that position, or none in
//                 30+ days
//   Shift changes — spots that go vacant when someone leaves mid-daypart or
//                 sit empty until someone arrives (TIM-43)
//   Outside     — iPOS/OMD past 3.5 hours in a row (risk) or two outside
//                 dayparts running (rotation)
const SU_ROTATION_DAYS = 14;
const SU_STREAK_WINDOW = 5;   // last 5 recorded shifts...
const SU_STREAK_SAME = 4;     // ...4 in the same position = stuck
const SU_RATING_STALE_DAYS = 30;
const SU_CAPTAIN_RE = /captain|cockpit cap/i;
// Captain slots lead a group, so they're for Team Leads and Trainers.
const SU_LEADER_ROLES = ['Trainer', 'Team Lead'];

let setupEvaluations = {}; // "section||date||daypart" -> {at, signature, result}

function suEvalKey(section, date, dpName){
  return section + '||' + date + '||' + dpName;
}

// What the evaluation depends on: who is in which slot for this daypart.
function suSetupSignature(section, date, dpName){
  const prefix = suEvalKey(section, date, dpName) + '||';
  return JSON.stringify(Object.keys(posAssignments).filter(k => k.startsWith(prefix) && posAssignments[k]).sort().map(k => [k, posAssignments[k]]));
}

function suDaysBetween(fromISO, toISO){
  return Math.round((new Date(toISO + 'T00:00:00') - new Date(fromISO + 'T00:00:00')) / 86400000);
}

function suSplitNames(value){
  return String(value || '').split('/').map(n => n.trim()).filter(Boolean);
}

function evaluateSetup(section, date, dpName){
  const posMap = section === 'foh' ? fohPositions : bohPositions;
  const slots = posMap[dpName] || [];
  const strength = peaStrengthByPerson();
  const peaNames = Object.keys(strength);
  const hasPea = peaNames.length > 0;
  const groupPositions = new Set((PEA_POSITION_GROUPS.find(g => g.key === section) || {positions: []}).positions);

  // Everyone placed in this daypart, one entry per person per slot.
  const entries = [];
  slots.forEach(slot=>{
    const names = suSplitNames(posAssignments[suEvalKey(section, date, dpName) + '||' + slot]);
    const positions = peaPositionsForSlot(section, slot);
    names.forEach(name=>{
      const peaName = hasPea ? peaMatchName(name, peaNames) : null;
      const person = peaName ? strength[peaName] : null;
      // A slot covering two positions ("Primary/Machines") uses the stronger one.
      const cells = person ? positions.map(pos => person.positions[pos] ? {pos, ...person.positions[pos]} : null).filter(Boolean) : [];
      const cell = cells.sort((a, b) => b.avg - a.avg)[0] || null;
      entries.push({
        slot, name, peaName, positions, cell,
        position: cell ? cell.pos : positions[0] || null,
        tier: !positions.length ? 'na' : cell ? cell.tier.key : 'unrated',
        captain: SU_CAPTAIN_RE.test(slot)
      });
    });
  });

  const counts = {crushing: 0, rise: 0, notyet: 0, unrated: 0, na: 0};
  entries.forEach(e => counts[e.tier]++);

  // Risk
  const risks = [];
  // An unrated Team Lead or Trainer in a captain slot is where Tim wants
  // them — that's a PEA to complete (Rating due), not a risk.
  const isLeader = name => !!suLeaderRole(section, date, name, strength);
  entries.filter(e => e.captain && (e.tier === 'notyet' || (e.tier === 'unrated' && !isLeader(e.name)))).forEach(e=>{
    risks.push({name: e.name, text: `in Captain slot ${e.slot} — ${e.tier === 'notyet' ? `Not Yet on ${e.position} (${e.cell.avg.toFixed(2)})` : `no ${e.positions.join('/')} rating`}`});
  });
  entries.filter(e => e.captain && e.peaName && !SU_LEADER_ROLES.includes(strength[e.peaName].role)).forEach(e=>{
    risks.push({name: e.name, text: `in Captain slot ${e.slot} is a ${strength[e.peaName].role || 'team member'} — Captain slots are for Team Leads and Trainers`});
  });
  entries.filter(e => e.tier === 'notyet').forEach(e=>{
    const support = entries.some(o => o !== e && o.position === e.position && o.tier === 'crushing');
    if(!support && !e.captain) risks.push({name: e.name, text: `is Not Yet on ${e.position} (${e.cell.avg.toFixed(2)}) with no Crushing It ${e.position} alongside`});
  });

  // Development
  const development = entries.filter(e => e.tier === 'rise' || e.tier === 'notyet').map(e => ({
    name: e.name, tier: e.tier,
    text: `${e.tier === 'rise' ? 'On the Rise' : 'Not Yet'} on ${e.position} (${e.cell.avg.toFixed(2)} ×${e.cell.total})`
  }));

  // Rating due
  const ratingDue = [];
  entries.filter(e => e.positions.length).forEach(e=>{
    if(!e.cell){
      ratingDue.push({name: e.name, text: e.peaName ? `no ${e.positions.join('/')} rating yet` : 'no PEA ratings found under this name'});
    } else {
      const age = suDaysBetween(e.cell.last, today);
      if(age >= SU_RATING_STALE_DAYS) ratingDue.push({name: e.name, text: `last ${e.position} rating was ${age} days ago`});
    }
  });

  // Rotation — from set-up history before this date, same section.
  const records = getSetupRecords(null, null).filter(r => r.section === section && r.date < date);
  const historyStart = records.length ? records[0].date : null;
  const historyDays = historyStart ? suDaysBetween(historyStart, date) : 0;
  const rotation = [];
  const seen = new Set();
  entries.forEach(e=>{
    const key = e.name.toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    const mine = records.filter(r => r.name.toLowerCase() === key);
    const lastWorked = {};
    mine.forEach(r => peaPositionsForSlot(section, r.position).forEach(pos=>{
      if(!lastWorked[pos] || r.date > lastWorked[pos]) lastWorked[pos] = r.date;
    }));
    const placedNow = new Set(entries.filter(o => o.name.toLowerCase() === key).flatMap(o => o.positions));
    // Positions they've been rated in or have worked before, in this section.
    const known = new Set(Object.keys(lastWorked));
    if(e.peaName) Object.keys(strength[e.peaName].positions).forEach(pos => { if(groupPositions.has(pos)) known.add(pos); });
    // Longest gap first; a position with no date hasn't appeared at all in
    // the history kept so far.
    const overdue = [...known].filter(pos => !placedNow.has(pos)).map(pos=>{
      if(lastWorked[pos]){
        const days = suDaysBetween(lastWorked[pos], date);
        return days >= SU_ROTATION_DAYS ? {pos, days, text: `${pos} (${days}d)`} : null;
      }
      return historyDays >= SU_ROTATION_DAYS ? {pos, days: Infinity, text: pos} : null;
    }).filter(Boolean).sort((a, b) => b.days - a.days || a.pos.localeCompare(b.pos));
    if(overdue.length) rotation.push({name: e.name, text: `— not on ${overdue.map(o => o.text).join(', ')} in 2+ weeks`});

    // Same position for most recent shifts (a shift = one date + daypart).
    const shifts = {};
    mine.forEach(r=>{
      const k = r.date + '||' + r.daypart;
      (shifts[k] = shifts[k] || new Set());
      peaPositionsForSlot(section, r.position).forEach(p => shifts[k].add(p));
    });
    const recent = Object.keys(shifts).sort().slice(-SU_STREAK_WINDOW).map(k => shifts[k]);
    if(recent.length >= SU_STREAK_SAME){
      placedNow.forEach(pos=>{
        const same = recent.filter(s => s.has(pos)).length;
        if(same >= SU_STREAK_SAME) rotation.push({name: e.name, text: `on ${pos} again — ${same} of the last ${recent.length} recorded shifts`});
      });
    }
  });

  const leaders = leaderReview(section, date, dpName, entries);
  risks.push(...leaders.risks);

  // Shift changes and outside time (TIM-43).
  const coverage = [];
  const dpIndex = suDaypartsFor(section).findIndex(d => d.name === dpName);
  if(dpIndex !== -1){
    const timing = suDaypartTiming(section, date, dpIndex);
    const placedLo = new Set(entries.map(e => e.name.toLowerCase()));
    const leadName = section === 'foh' ? (posAssignments[suEvalKey(section, date, dpName) + '||' + SU_LEAD_CAPTAIN] || '') : '';
    if(leadName) placedLo.add(leadName.toLowerCase());
    slots.forEach(slot=>{
      const names = suSplitNames(posAssignments[suEvalKey(section, date, dpName) + '||' + slot]);
      if(!names.length) return;
      const last = suTimingFor(timing, names[names.length - 1]);
      const first = suTimingFor(timing, names[0]);
      if(last && last.leaves !== null){
        const pr = suPairFor(timing, last.name);
        const cover = pr && !placedLo.has(pr.in.toLowerCase()) ? ` — hand it to ${pr.in} (arrives ${suClock(pr.arrives)})` : ' — nobody is arriving to take it; plan who covers';
        risks.push({name: slot, text: `goes vacant at ${suClock(last.leaves)} when ${last.name} leaves${cover}`});
      }
      if(names.length > 1 && first && last && first !== last && first.leaves !== null && last.arrives !== null && last.arrives > first.leaves + 5){
        coverage.push({name: slot, text: `is open ${suClock(first.leaves)}–${suClock(last.arrives)} between ${first.name} and ${last.name} — someone nearby covers`});
      }
      if(first && first.arrives !== null){
        const text = `is empty until ${suClock(first.arrives)} (${first.name} arrives then)`;
        (SU_CAPTAIN_RE.test(slot) ? risks : coverage).push({name: slot, text});
      }
    });
    timing.pairs.forEach(pr=>{
      if(!placedLo.has(pr.out.toLowerCase()) && !placedLo.has(pr.in.toLowerCase())) coverage.push({name: `${pr.out} → ${pr.in}`, text: `can share one spot — switch @ ${suClock(pr.at)}`});
    });
    timing.arrivals.filter(p => !placedLo.has(p.name.toLowerCase())).forEach(p => coverage.push({name: p.name, text: `arrives ${suClock(p.arrives)} — not placed yet`}));

    // Outside time: once per person per outside slot, their part of it.
    entries.forEach(e=>{
      if(!suIsOutside(section, e.slot)) return;
      const names = suSplitNames(posAssignments[suEvalKey(section, date, dpName) + '||' + e.slot]);
      const me = suTimingFor(timing, e.name);
      let from = me ? me.from : timing.window.startMin, to = me ? me.to : timing.window.endMin;
      if(names.length > 1){
        const a = suTimingFor(timing, names[0]), b = suTimingFor(timing, names[1]);
        const at = a && a.leaves !== null ? a.leaves : b && b.arrives !== null ? b.arrives : null;
        if(at !== null){ if(names[0].toLowerCase() === e.name.toLowerCase()) to = at; else from = at; }
      }
      const run = suOutsideRun(section, date, e.name, dpName, from, to);
      const where = run.touching.length ? ` (with ${run.touching.map(suShortDaypart).join(', ')})` : '';
      if(run.minutes > SU_OUTSIDE_LIMIT_MIN) risks.push({name: e.name, text: `is outside ${(run.minutes / 60).toFixed(1)} hours in a row${where} — keep iPOS/OMD under 3.5 hours; rotate inside`});
      else if(run.touching.length) rotation.push({name: e.name, text: `is outside again after ${run.touching.map(suShortDaypart).join(', ')} — rotate inside if you can`});
    });
  }

  return {entries, counts, risks, development, ratingDue, rotation, coverage, leadership: leaders.leadership, hasPea, historyDays};
}

// ----- Rendering (inside each daypart card on Set Ups) -----

function suEvalListHtml(title, icon, cls, items){
  if(!items.length) return '';
  return `
    <div class="su-eval-section ${cls}">
      <div class="su-eval-section-title">${icon} ${title} <span>${items.length}</span></div>
      <ul>${items.map(i => `<li><b>${escapeHtml(i.name)}</b> ${escapeHtml(i.text)}</li>`).join('')}</ul>
    </div>`;
}

function renderSetupEvaluation(section, date, dp){
  const key = suEvalKey(section, date, dp.name);
  const ev = setupEvaluations[key];
  const dpAttr = escapeHtml(dp.name);
  const assignedCount = Object.keys(posAssignments).filter(k => k.startsWith(key + '||') && posAssignments[k]).length;
  if(!ev){
    return `
      <div class="su-eval">
        <button type="button" class="su-eval-btn" data-su-evaluate="${dpAttr}" ${assignedCount ? '' : 'disabled'}>Evaluate set up</button>
        <span class="su-eval-hint">${assignedCount ? 'Scores this set up on strength, risk, development and rotation.' : 'Assign positions first, then evaluate.'}</span>
      </div>`;
  }
  const r = ev.result;
  const stale = ev.signature !== suSetupSignature(section, date, dp.name);
  const time = new Date(ev.at).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
  const c = r.counts;
  const chips = [
    ['crushing', 'Crushing It', c.crushing], ['rise', 'On the Rise', c.rise], ['notyet', 'Not Yet', c.notyet], ['unrated', 'Unrated', c.unrated]
  ].filter(x => x[2]).map(([k, label, n]) => `<span class="su-eval-chip su-${k}">${n} ${label}</span>`).join('');
  const notes = [];
  if(!r.hasPea) notes.push('No PEA ratings uploaded yet (Manage → PEA Ratings), so strength can’t be scored.');
  if(c.na) notes.push(`${c.na} slot${c.na === 1 ? ' isn’t' : 's aren’t'} rated in Levelset (zones, Traffic Lane, etc.) and ${c.na === 1 ? 'is' : 'are'} left out.`);
  if(r.rotation.length && r.historyDays >= SU_ROTATION_DAYS) notes.push(`Rotation covers positions each person is rated in or has worked. (Nd) = days since they last worked it; no number = not at all in the ${r.historyDays} days of set-up history.`);
  if(r.historyDays < SU_ROTATION_DAYS) notes.push(`Rotation has ${r.historyDays} day${r.historyDays === 1 ? '' : 's'} of set-up history so far; "hasn’t worked" flags need ${SU_ROTATION_DAYS}.`);
  const nothing = !r.risks.length && !r.development.length && !r.rotation.length && !r.ratingDue.length && !(r.leadership || []).length && !(r.coverage || []).length;
  return `
    <div class="su-eval has-result ${stale ? 'is-stale' : ''}">
      <div class="su-eval-head">
        <span class="su-eval-title">Evaluation <span class="su-eval-time">· ${time}</span></span>
        <button type="button" class="su-eval-btn small" data-su-evaluate="${dpAttr}">Re-evaluate</button>
      </div>
      ${stale ? '<div class="su-eval-stale">Set up changed since this evaluation — press Re-evaluate.</div>' : ''}
      ${chips ? `<div class="su-eval-chips">${chips}</div>` : ''}
      ${suEvalListHtml('Risk', '⚠️', 'is-risk', r.risks)}
      ${suEvalListHtml('Shift changes', '🕒', 'is-due', r.coverage || [])}
      ${suEvalListHtml('Development', '🌱', 'is-dev', r.development)}
      ${suEvalListHtml('Rotation', '🔄', 'is-rot', r.rotation)}
      ${suEvalListHtml('Leadership', '🧭', 'is-lead', r.leadership || [])}
      ${suEvalListHtml('PEA rating due', '📝', 'is-due', r.ratingDue)}
      ${nothing ? '<div class="su-eval-clear">✓ No risks, development placements or rotation flags.</div>' : ''}
      ${notes.map(n => `<div class="su-eval-note">${n}</div>`).join('')}
    </div>`;
}

document.getElementById('allDayparts').addEventListener('click', e=>{
  const btn = e.target.closest('[data-su-evaluate]');
  if(!btn) return;
  e.stopPropagation();
  const date = document.getElementById('daySelect').value;
  const dpName = btn.dataset.suEvaluate;
  setupEvaluations[suEvalKey(currentPosSection, date, dpName)] = {
    at: Date.now(),
    signature: suSetupSignature(currentPosSection, date, dpName),
    result: evaluateSetup(currentPosSection, date, dpName)
  };
  renderAllDayparts();
});
