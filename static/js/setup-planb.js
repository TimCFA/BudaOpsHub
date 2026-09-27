// ===== PLAN B FOR EACH POSITION (TIM-40) =====
// When a team member falls behind in their zone, a leader either sends a
// coach to shadow them for 5–10 minutes, or swaps someone stronger in so the
// zone catches up (ideally the first person returns once it's solved). The
// same lookup covers a call-out or someone pulled for a catering order.
//
// Coach priority (Tim): Trainers first — one working the same position
// (they're right there), then one who isn't placed (free to step over), then
// anyone else not captaining a zone. A Team Lead only when no Trainer is on
// shift: they're usually zone captains, not there to put out fires.
// Swap priority: someone Crushing It in that position — not placed first (no
// one else has to move), then a trade with someone whose slot the struggling
// person can hold; Trainers, then Crushing It team members, Team Leads last.
// Nobody in a Captain slot is pulled.

let setupPlanBResults = {};   // "section||date||daypart" -> {at, signature, result}

function planBForDaypart(section, date, dp, dpIndex){
  const dayparts = section === 'foh' ? fohDayparts : bohDayparts;
  const posMap = section === 'foh' ? fohPositions : bohPositions;
  const strength = peaStrengthByPerson();
  const peaNames = Object.keys(strength);
  const key = suEvalKey(section, date, dp.name);

  // Everyone on shift this daypart, with their PEA record and current slot.
  const slotOf = {};
  (posMap[dp.name] || []).forEach(slot => suSplitNames(posAssignments[key + '||' + slot]).forEach(n => slotOf[n.toLowerCase()] = slot));
  const byName = {};
  const addPerson = name=>{
    const k = name.toLowerCase();
    if(byName[k]) return;
    const peaName = peaNames.length ? peaMatchName(name, peaNames) : null;
    const person = peaName ? strength[peaName] : null;
    byName[k] = {name, person, role: person ? person.role : '', slot: slotOf[k] || null};
  };
  availableForDaypart(date, dpIndex, dayparts).forEach(p => addPerson(p.name));
  Object.keys(slotOf).forEach(k => addPerson(suSplitNames(posAssignments[key + '||' + slotOf[k]]).find(n => n.toLowerCase() === k)));
  const crew = Object.values(byName);

  const cellIn = (x, positions) => x.person ? positions.map(p => x.person.positions[p]).filter(Boolean).sort((a, b) => b.avg - a.avg)[0] || null : null;
  const crushingIn = (x, positions) => { const c = cellIn(x, positions); return c && c.tier.key === 'crushing' ? c : null; };
  const captaining = x => x.slot && SU_CAPTAIN_RE.test(x.slot);
  const isRole = (x, role) => x.role === role;
  const roleRank = x => isRole(x, 'Trainer') ? 0 : isRole(x, 'Team Lead') ? 2 : 1;

  const rows = [];
  (posMap[dp.name] || []).forEach(slot=>{
    const positions = peaPositionsForSlot(section, slot);
    suSplitNames(posAssignments[key + '||' + slot]).forEach(name=>{
      const me = byName[name.toLowerCase()];
      const mine = cellIn(me, positions);
      const tier = !positions.length ? 'na' : mine ? mine.tier.key : 'unrated';
      const others = crew.filter(x => x !== me);

      // Coach
      let coach = null;
      if(positions.length){
        const trainers = others.filter(x => isRole(x, 'Trainer')).map(x=>{
          const samePos = x.slot && peaPositionsForSlot(section, x.slot).some(p => positions.includes(p));
          const crush = crushingIn(x, positions);
          const score = (samePos ? 3 : 0) + (!x.slot ? 2 : 0) + (crush ? 2 : 0) - (captaining(x) ? 4 : 0);
          const notes = [crush ? `Crushing It on ${positions.join('/')}` : null, samePos ? `working ${x.slot}` : !x.slot ? 'not placed' : captaining(x) ? `captaining ${x.slot}` : `in ${x.slot}`].filter(Boolean);
          return {x, score, notes};
        }).sort((a, b) => b.score - a.score || a.x.name.localeCompare(b.x.name));
        if(trainers.length) coach = {name: trainers[0].x.name, kind: 'Trainer', notes: trainers[0].notes};
        else {
          const lead = others.filter(x => isRole(x, 'Team Lead')).sort((a, b) => (captaining(a) - captaining(b)) || a.name.localeCompare(b.name))[0];
          if(lead) coach = {name: lead.name, kind: 'Team Lead', notes: [lead.slot ? `in ${lead.slot}` : 'not placed', 'pulls a zone captain — no Trainer on shift']};
        }
      }

      // Swap / step in
      const swaps = [];
      if(positions.length){
        others.filter(x => !captaining(x)).forEach(x=>{
          const c = crushingIn(x, positions);
          if(!c) return;
          if(!x.slot){
            swaps.push({name: x.name, kind: 'in', role: x.role || 'Team Member', avg: c.avg, rank: 0 + roleRank(x) / 10, text: `steps in (not placed · ${x.role || 'team member'} · ${c.avg.toFixed(2)})`});
            return;
          }
          // A trade: can the struggling person hold the other person's slot?
          const theirPositions = peaPositionsForSlot(section, x.slot);
          if(theirPositions.some(p => positions.includes(p))) return; // same position — no help trading
          const hold = theirPositions.length ? cellIn(me, theirPositions) : null;
          if(theirPositions.length && !(hold && (hold.tier.key === 'crushing' || hold.tier.key === 'rise'))) return;
          const holdText = theirPositions.length ? `${name} takes ${x.slot} (${hold.tier.label} ${hold.avg.toFixed(2)})` : `${name} takes ${x.slot}`;
          swaps.push({name: x.name, kind: 'trade', role: x.role || 'Team Member', avg: c.avg, theirSlot: x.slot, hold: hold ? `${hold.tier.label} ${hold.avg.toFixed(2)}` : null, rank: 1 + roleRank(x) / 10, text: `trade (${x.role || 'team member'} · ${c.avg.toFixed(2)}) — ${holdText}`});
        });
        swaps.sort((a, b) => a.rank - b.rank || b.avg - a.avg || a.name.localeCompare(b.name));
      }

      rows.push({slot, name, tier, cell: mine, positions, coach, swaps: swaps.slice(0, 2), captain: SU_CAPTAIN_RE.test(slot)});
    });
  });

  const watch = rows.filter(r => r.tier === 'notyet' || r.tier === 'rise' || r.tier === 'unrated');
  const rest = rows.filter(r => !watch.includes(r) && r.tier !== 'na');
  const order = {notyet: 0, unrated: 1, rise: 2};
  watch.sort((a, b) => order[a.tier] - order[b.tier] || a.slot.localeCompare(b.slot));
  return {watch, rest, hasPea: peaNames.length > 0, trainers: crew.filter(x => isRole(x, 'Trainer')).length};
}

function suPlanBRowHtml(r){
  const tierLabel = r.tier === 'unrated' ? 'Unrated' : `${r.cell.tier.label} ${r.cell.avg.toFixed(2)}`;
  const coach = r.coach
    ? `<b>${escapeHtml(r.coach.name)}</b> <span class="su-muted">(${escapeHtml([r.coach.kind, ...r.coach.notes].join(' · '))})</span>`
    : '<span class="su-muted">No Trainer or Team Lead on shift</span>';
  const swap = r.swaps.length
    ? r.swaps.map(s => `<b>${escapeHtml(s.name)}</b> <span class="su-muted">${escapeHtml(s.text)}</span>`).join('<br>')
    : `<span class="su-muted">No one else on shift is Crushing It on ${escapeHtml(r.positions.join('/'))} — coach only</span>`;
  return `
    <li class="su-planb-row">
      <div class="su-planb-head"><span class="su-planb-slot">${escapeHtml(r.slot)}</span> <b>${escapeHtml(r.name)}</b> <span class="su-tile-tier su-${r.tier}">${escapeHtml(tierLabel)}</span></div>
      <div class="su-planb-line"><span class="su-planb-k">Coach</span><span>${coach}</span></div>
      <div class="su-planb-line"><span class="su-planb-k">Swap</span><span>${swap}</span></div>
    </li>`;
}

function renderSetupPlanB(section, date, dp, dpIndex){
  const key = suEvalKey(section, date, dp.name);
  const res = setupPlanBResults[key];
  const dpAttr = escapeHtml(dp.name);
  const assigned = Object.keys(posAssignments).some(k => k.startsWith(key + '||') && posAssignments[k]);
  if(!res){
    return `
      <div class="su-eval">
        <button type="button" class="su-eval-btn" data-su-planb="${dpAttr}" data-su-dpindex="${dpIndex}" ${assigned ? '' : 'disabled'}>Plan B</button>
        <span class="su-eval-hint">${assigned ? 'If someone falls behind: who coaches, who can swap in.' : 'Assign positions first.'}</span>
      </div>`;
  }
  const r = res.result;
  const stale = res.signature !== suDevelopSignature(section, date, dp, dpIndex);
  const time = new Date(res.at).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
  const notes = [];
  if(!r.hasPea) notes.push('Upload PEA ratings (Manage → PEA Ratings) to get coaches and swaps.');
  if(r.hasPea && !r.trainers) notes.push('No Trainer on shift this daypart.');
  return `
    <div class="su-eval has-result ${stale ? 'is-stale' : ''}">
      <div class="su-eval-head">
        <span class="su-eval-title">Plan B <span class="su-eval-time">· ${time}</span></span>
        <button type="button" class="su-eval-btn small" data-su-planb="${dpAttr}" data-su-dpindex="${dpIndex}">Refresh</button>
      </div>
      ${stale ? '<div class="su-eval-stale">The roster or set up changed — press Refresh.</div>' : ''}
      ${r.watch.length ? `
        <div class="su-planb-group">Most likely to need it</div>
        <ul class="su-planb">${r.watch.map(suPlanBRowHtml).join('')}</ul>` : ''}
      ${r.rest.length ? `
        <details class="su-planb-more" ${r.watch.length ? '' : 'open'}>
          <summary>Everyone else placed (${r.rest.length}) — Crushing It</summary>
          <ul class="su-planb">${r.rest.map(suPlanBRowHtml).join('')}</ul>
        </details>` : ''}
      ${!r.watch.length && !r.rest.length ? '<div class="su-eval-note">No placed slots are rated in Levelset (zones, Traffic Lane, etc.).</div>' : ''}
      ${notes.map(n => `<div class="su-eval-note">${n}</div>`).join('')}
    </div>`;
}

document.getElementById('allDayparts').addEventListener('click', e=>{
  const btn = e.target.closest('[data-su-planb]');
  if(!btn) return;
  e.stopPropagation();
  const date = document.getElementById('daySelect').value;
  const dayparts = currentPosSection === 'foh' ? fohDayparts : bohDayparts;
  const dpIndex = parseInt(btn.dataset.suDpindex, 10);
  const dp = dayparts[dpIndex];
  setupPlanBResults[suEvalKey(currentPosSection, date, dp.name)] = {
    at: Date.now(),
    signature: suDevelopSignature(currentPosSection, date, dp, dpIndex),
    result: planBForDaypart(currentPosSection, date, dp, dpIndex)
  };
  renderAllDayparts();
});
