// ===== SET UPS BOARD (TIM-41 redesign) =====
// One daypart at a time: daypart chips → Game Plan card → zones of station
// tiles in set-up priority order → a dark toolbar (Develop / Plan B /
// Evaluate) that opens its result in a bottom sheet. Tapping a filled tile
// opens that person's sheet (their scores and Plan B); an empty one opens the
// usual assign list.
//
// Priority: each slot's number is its place in the daypart's position list
// (#1 = first). With N people on shift, slots #1–N should be filled; an empty
// one in that range is "Needed", and empty slots past it fold away until
// there are extra people.

// Zones, in display order. A slot goes in the first zone whose pattern
// matches its name; everything else is "Extra hands". Tim may regroup these.
const SU_ZONES = {
  foh: [
    {key: 'ipos', name: 'iPOS', re: /ipos/i},
    {key: 'bagging', name: 'Bagging', re: /bagg/i},
    {key: 'drinks', name: 'Drinks', re: /drink|lemonade/i},
    {key: 'omd', name: 'OMD', re: /\bomd\b/i},
    {key: 'host', name: 'Host', re: /host|din+ing|restroom|outside/i}
  ],
  boh: [
    {key: 'breading', name: 'Breading', re: /breader/i},
    {key: 'primary', name: 'Primary & Machines', re: /primar|machines/i},
    {key: 'secondary', name: 'Secondary', re: /secondar/i},
    {key: 'fries', name: 'Fries', re: /fries/i},
    {key: 'prep', name: 'Prep', re: /prep|biscuit|eggs|dishes|filters/i}
  ]
};
const SU_EXTRA_ZONE = {key: 'extra', name: 'Extra hands'};

let suSelectedDaypart = {foh: '', boh: ''};   // daypart name per section
let suSelectedDate = '';
let suExpandedZones = new Set();              // zones showing their optional slots
let suSheet = null;                           // {kind: 'develop'|'evaluate'|'planb'|'person'|'lead', slot}

function suShortDaypart(name){
  return name.replace(/\s*\(.*\)\s*$/, '');
}

function suDaypartsFor(section){
  return section === 'foh' ? fohDayparts : bohDayparts;
}

// Today: the daypart on the clock right now. Another day: the one with the
// most people scheduled (usually the peak), else the first.
function suDefaultDaypart(section, date){
  const dayparts = suDaypartsFor(section);
  if(date !== today){
    let best = dayparts[0].name, most = 0;
    dayparts.forEach((dp, i) => { const n = availableForDaypart(date, i, dayparts).length; if(n > most){ most = n; best = dp.name; } });
    return best;
  }
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  let pick = dayparts[0].name;
  dayparts.forEach(dp => { if(parseDaypartTimeToMinutes(dp.time) <= mins) pick = dp.name; });
  return pick;
}

function suCurrentDaypart(section, date){
  if(suSelectedDate !== date){
    suSelectedDate = date;
    suSelectedDaypart = {foh: '', boh: ''};
    suExpandedZones.clear();
    suSheet = null;
  }
  const dayparts = suDaypartsFor(section);
  if(!dayparts.some(d => d.name === suSelectedDaypart[section])) suSelectedDaypart[section] = suDefaultDaypart(section, date);
  const dpIndex = dayparts.findIndex(d => d.name === suSelectedDaypart[section]);
  return {dp: dayparts[dpIndex], dpIndex};
}

function suInitials(name){
  const parts = String(name).replace(/\(.*?\)/g, ' ').split(/[\s,]+/).filter(Boolean);
  return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// Everything the board needs for one daypart, computed once per render.
function suDaypartModel(section, date, dp, dpIndex){
  const posMap = section === 'foh' ? fohPositions : bohPositions;
  const slots = posMap[dp.name] || [];
  const key = suEvalKey(section, date, dp.name);
  const onShift = availableForDaypart(date, dpIndex, suDaypartsFor(section));
  const strength = peaStrengthByPerson();
  const peaNames = Object.keys(strength);
  const dev = setupDevelopResults[key];
  const devNames = new Set(dev ? dev.result.picks.map(p => p.name.toLowerCase()) : []);

  const tiles = slots.map((slot, i)=>{
    const names = suSplitNames(posAssignments[key + '||' + slot]);
    const positions = peaPositionsForSlot(section, slot);
    const first = names[0] || null;
    const peaName = first && peaNames.length ? peaMatchName(first, peaNames) : null;
    const person = peaName ? strength[peaName] : null;
    const cell = person ? positions.map(p => person.positions[p]).filter(Boolean).sort((a, b) => b.avg - a.avg)[0] || null : null;
    return {
      slot, rank: i + 1, names, positions, cell,
      tier: !first ? 'open' : !positions.length ? 'na' : cell ? cell.tier.key : 'unrated',
      develop: first ? devNames.has(first.toLowerCase()) : false,
      flagged: !!posVacancyFlags[key + '||' + slot]
    };
  });
  const headcount = onShift.length;
  tiles.forEach(t => { t.needed = !t.names.length && headcount > 0 && t.rank <= headcount; });

  const zoneDefs = SU_ZONES[section] || [];
  const zones = [...zoneDefs, SU_EXTRA_ZONE].map(z => ({...z, tiles: []}));
  tiles.forEach(t=>{
    const i = zoneDefs.findIndex(z => z.re.test(t.slot));
    zones[i === -1 ? zones.length - 1 : i].tiles.push(t);
  });

  const placed = new Set(tiles.flatMap(t => t.names.map(n => n.toLowerCase())));
  suSplitNames(posAssignments[key + '||' + SU_LEAD_CAPTAIN]).forEach(n => placed.add(n.toLowerCase()));
  tiles.forEach(t => { t.leaderRole = t.names.length ? suLeaderRole(section, date, t.names[0], strength) : null; });
  const unplaced = onShift.filter(p => !placed.has(p.name.trim().toLowerCase())).map(p => p.name);
  const filled = tiles.filter(t => t.names.length).length;
  return {key, tiles, zones: zones.filter(z => z.tiles.length), headcount, unplaced, filled};
}

// ----- Pieces -----

function suDaypartChipsHtml(section, date, current){
  return `<div class="su-chips" role="tablist" aria-label="Daypart">${suDaypartsFor(section).map((dp, i)=>{
    const posMap = section === 'foh' ? fohPositions : bohPositions;
    const key = suEvalKey(section, date, dp.name);
    const filled = (posMap[dp.name] || []).filter(s => posAssignments[key + '||' + s]).length;
    const onShift = availableForDaypart(date, i, suDaypartsFor(section)).length;
    const active = dp.name === current;
    return `<button type="button" role="tab" aria-selected="${active}" class="su-chip ${active ? 'active' : ''}" data-su-daypart="${escapeHtml(dp.name)}">
      <span class="su-chip-name">${escapeHtml(suShortDaypart(dp.name))}</span>
      <span class="su-chip-fill">${onShift ? `${filled}/${onShift}` : filled ? `${filled} placed` : '—'}</span>
    </button>`;
  }).join('')}</div>`;
}

function suGamePlanHtml(section, date, dp, dpIndex, m){
  const t = suDayType(section, date, dp);
  const nums = getNumbersForDaypart(date, dp) || {};
  const facts = [nums.projectedSales ? `${nums.projectedSales} projected` : '', nums.productivityGoal ? `goal ${nums.productivityGoal}` : '', nums.specialEvents || '', `${m.headcount} on shift`].filter(Boolean);

  const dev = setupDevelopResults[m.key];
  const devStale = dev && dev.signature !== suDevelopSignature(section, date, dp, dpIndex);
  const pick = dev && dev.result.picks[0];
  const devText = !dev ? 'Tap Develop below to pick today’s focus.'
    : pick ? `${pick.name}${pick.target ? ` on ${pick.target.pos}` : ''}${pick.pair ? `, with ${pick.pair.name}` : ''}${dev.result.picks.length > 1 ? ` · +${dev.result.picks.length - 1} more` : ''}`
    : dev.result.room ? 'Nobody needs a development focus right now.' : 'No room to develop this daypart.';

  const ev = setupEvaluations[m.key];
  const evStale = ev && ev.signature !== suSetupSignature(section, date, dp.name);
  const risk = ev && ev.result.risks[0];
  const watchText = !ev ? 'Tap Evaluate below to check risks.' : risk ? `${risk.name} ${risk.text}${ev.result.risks.length > 1 ? ` · +${ev.result.risks.length - 1} more` : ''}` : 'No risks in this set up.';

  const needed = m.tiles.filter(x => x.needed);
  const openText = needed.length
    ? `${needed.slice(0, 3).map(x => `${x.slot} (#${x.rank})`).join(', ')}${needed.length > 3 ? ` +${needed.length - 3}` : ''}${m.unplaced.length ? ` — ${m.unplaced.slice(0, 3).join(', ')} ${m.unplaced.length === 1 ? 'is' : 'are'} on shift, not placed` : ''}`
    : m.unplaced.length ? `All priority spots filled · not placed: ${m.unplaced.slice(0, 4).join(', ')}` : m.headcount ? 'Every priority spot is filled.' : 'No roster for this daypart yet.';

  return `
    <section class="su-plan" aria-label="Game plan">
      <div class="su-plan-head">
        <h2>${escapeHtml(suShortDaypart(dp.name))} game plan</h2>
        <button type="button" class="su-daytype-btn su-${t.type}" data-su-toggle-daytype="${t.type === 'game' ? 'practice' : 'game'}" title="${escapeHtml(t.overridden ? 'Set by a leader — tap to switch' : (t.reasons.length ? 'Auto: ' + t.reasons.join(' + ') : 'Auto: weekday, no event or high numbers') + ' — tap to switch')}">${t.type === 'game' ? 'Game Day' : 'Practice Day'}</button>
      </div>
      <div class="su-plan-facts">${facts.map(escapeHtml).join(' · ')}</div>
      <div class="su-plan-lines">
        ${section === 'foh' ? suLeadCaptainLineHtml(date, dp) : ''}
        <div class="su-plan-line"><span class="su-plan-tag is-dev">Develop</span><span>${escapeHtml(devText)}${devStale ? ' <em>· out of date</em>' : ''}</span></div>
        <div class="su-plan-line"><span class="su-plan-tag is-watch">Watch</span><span>${escapeHtml(watchText)}${evStale ? ' <em>· out of date</em>' : ''}</span></div>
        <div class="su-plan-line"><span class="su-plan-tag is-open">Open</span><span>${escapeHtml(openText)}</span></div>
      </div>
    </section>`;
}

function suTileHtml(t){
  const name = t.names.length ? t.names.join(' → ') : t.needed ? 'Needed' : 'Open';
  const avatar = t.names.length ? suInitials(t.names[0]) : '+';
  const label = `${t.slot}, priority ${t.rank}: ${t.names.length ? t.names.join(' then ') : (t.needed ? 'needed' : 'open')}${t.cell ? `, ${t.cell.tier.label} ${t.cell.avg.toFixed(2)}` : ''}`;
  return `
    <button type="button" class="su-tile ${t.needed ? 'is-needed' : ''} ${!t.names.length ? 'is-open' : ''} ${t.flagged ? 'is-flagged' : ''}" data-su-tile="${escapeHtml(t.slot)}" aria-label="${escapeHtml(label)}">
      <span class="su-tile-top"><span class="su-tile-slot">${escapeHtml(t.slot)}</span><span class="su-tile-rank">#${t.rank}</span></span>
      <span class="su-tile-who">
        <span class="su-avatar su-av-${t.tier}" aria-hidden="true">${escapeHtml(avatar)}</span>
        <span class="su-tile-name">${escapeHtml(name)}${t.develop ? ' <span class="su-star" title="Development focus">★</span>' : ''}</span>
      </span>
      ${t.flagged ? '<span class="su-tile-flag">Needs coverage</span>' : ''}
    </button>`;
}

function suZonesHtml(m){
  return `<div class="su-zones">${m.zones.map(z=>{
    const expanded = suExpandedZones.has(z.key);
    const shown = z.tiles.filter(t => t.names.length || t.needed || expanded || !m.headcount);
    const hidden = z.tiles.filter(t => !shown.includes(t));
    const filled = z.tiles.filter(t => t.names.length).length;
    const needed = z.tiles.filter(t => t.needed).length;
    const count = z.key === 'extra' && !filled ? 'when staffing allows' : `${filled} placed${needed ? ` · ${needed} needed` : ''}`;
    const leaders = z.tiles.filter(t => t.leaderRole).map(t => `<span class="su-zone-leader" title="${escapeHtml(t.leaderRole)}">${escapeHtml(t.names[0].split(/\s+/)[0])} · ${t.leaderRole === 'Team Lead' ? 'TL' : 'Trainer'}</span>`).join('');
    return `
      <section class="su-zone" aria-label="${escapeHtml(z.name)}">
        <div class="su-zone-head"><h3>${escapeHtml(z.name)}</h3><span>${count}</span></div>
        ${leaders ? `<div class="su-zone-leaders">${leaders}</div>` : ''}
        ${shown.length ? `<div class="su-tiles">${shown.map(suTileHtml).join('')}</div>` : ''}
        ${hidden.length ? `<button type="button" class="su-zone-more" data-su-zone-more="${z.key}">+ ${hidden.length} more if you have extra people (${hidden.slice(0, 4).map(t => '#' + t.rank).join(', ')}${hidden.length > 4 ? '…' : ''})</button>` : ''}
        ${expanded && m.headcount ? `<button type="button" class="su-zone-more" data-su-zone-less="${z.key}">Hide open extras</button>` : ''}
      </section>`;
  }).join('')}</div>`;
}

function suToolbarHtml(){
  const tool = (kind, label, icon) => `<button type="button" class="su-tool ${suSheet && suSheet.kind === kind ? 'active' : ''}" data-su-tool="${kind}">${icon}<span>${label}</span></button>`;
  return `
    <nav class="su-toolbar" aria-label="Coaching tools">
      ${tool('develop', 'Develop', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F2C14E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>')}
      ${tool('planb', 'Plan B', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h11l-3-3M17 17H6l3 3"/></svg>')}
      ${tool('evaluate', 'Evaluate', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l4 4 10-10"/></svg>')}
    </nav>`;
}

// ----- Sheets -----

function suSheetFrame(title, body){
  return `
    <div class="su-sheet-backdrop" data-su-close-sheet="1"></div>
    <div class="su-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="su-sheet-grab" aria-hidden="true"></div>
      <div class="su-sheet-head"><h2>${escapeHtml(title)}</h2><button type="button" class="su-sheet-close" data-su-close-sheet="1" aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="su-sheet-body">${body}</div>
    </div>`;
}

function suPersonSheetHtml(section, date, dp, dpIndex, m, slot){
  const t = m.tiles.find(x => x.slot === slot);
  if(!t || !t.names.length) return '';
  const name = t.names[0];
  const strength = peaStrengthByPerson();
  const peaName = Object.keys(strength).length ? peaMatchName(name, Object.keys(strength)) : null;
  const person = peaName ? strength[peaName] : null;
  const cert = person ? suCertification(person, section) : null;
  const last = person ? suLastPositionalRating(person, section) : null;
  const dev = setupDevelopResults[m.key];
  const pick = dev ? dev.result.picks.find(p => p.name.toLowerCase() === name.toLowerCase()) : null;

  const plan = planBForDaypart(section, date, dp, dpIndex);
  const row = [...plan.watch, ...plan.rest].find(r => r.slot === slot && r.name.toLowerCase() === name.toLowerCase());
  const stat = (k, v, sub, cls) => `<div class="su-stat ${cls || ''}"><span class="su-stat-k">${k}</span><span class="su-stat-v">${v}</span><span class="su-stat-s">${sub}</span></div>`;
  const posLabel = t.positions.length ? t.positions.join('/') : 'This spot';

  const stats = `<div class="su-stats">
    ${t.positions.length ? stat(escapeHtml(posLabel), t.cell ? t.cell.avg.toFixed(2) : '—', t.cell ? `${escapeHtml(t.cell.tier.label)} · ${t.cell.total} rating${t.cell.total === 1 ? '' : 's'}` : 'Not rated here', t.cell ? 'is-' + t.cell.tier.key : '') : stat('Spot', '—', 'Not a Levelset position')}
    ${stat('Green', cert ? `${cert.green} / ${cert.total}` : '—', 'positions')}
    ${stat('Last PEA', last ? `${suDaysBetween(last, today)}d` : '—', last ? peaFormatDate(last) : person ? 'no position ratings' : 'no Levelset match')}
  </div>`;

  const devNote = pick ? `<div class="su-note is-dev"><b>★ Develop today.</b> ${escapeHtml(pick.reasons.join('; '))}${pick.pair ? ` — pair with ${escapeHtml(pick.pair.name)}` : ''}${pick.peaDue && pick.target ? `, then complete a ${escapeHtml(pick.target.pos)} PEA` : ''}.</div>` : '';

  let fallBehind = '';
  if(row){
    const coach = row.coach ? `<div class="su-pb-row"><span class="su-pb-k">Coach</span><span class="su-pb-v"><b>${escapeHtml(row.coach.name)}</b><span>${escapeHtml([row.coach.kind, ...row.coach.notes].join(' · '))}</span></span></div>` : '';
    const first = name.split(/\s+/)[0];
    const swaps = row.swaps.map(s=>{
      const stepIn = s.kind === 'in';
      const detail = stepIn
        ? `Not placed · ${s.role} · Crushing It ${s.avg.toFixed(2)}`
        : `${s.role} · Crushing It ${s.avg.toFixed(2)} · ${first} takes ${s.theirSlot}${s.hold ? ` (${s.hold})` : ''}`;
      return `<div class="su-pb-row"><span class="su-pb-k">${stepIn ? 'Step in' : 'Trade'}</span><span class="su-pb-v"><b>${escapeHtml(s.name)}</b><span>${escapeHtml(detail)}</span></span>
        <button type="button" class="${stepIn ? 'su-btn-dark' : 'su-btn-line'}" data-su-swap="${escapeHtml(s.name)}" data-su-swap-kind="${stepIn ? 'in' : 'trade'}" data-su-swap-slot="${escapeHtml(slot)}" data-su-swap-out="${escapeHtml(name)}">${stepIn ? 'Swap in' : 'Trade'}</button></div>`;
    }).join('');
    fallBehind = `<h3 class="su-sheet-sub">If ${escapeHtml(first)} falls behind</h3>
      <div class="su-pb">${coach}${swaps || `<div class="su-pb-row"><span class="su-pb-k">Swap</span><span class="su-pb-v"><span>No one else on shift is Crushing It on ${escapeHtml(posLabel)} — coach only</span></span></div>`}</div>`;
  } else if(!t.positions.length){
    fallBehind = '<div class="su-note">This spot isn’t a Levelset position, so there’s no coach or swap suggestion.</div>';
  }

  const body = `
    <div class="su-person-head">
      <span class="su-avatar big su-av-${t.tier}" aria-hidden="true">${escapeHtml(suInitials(name))}</span>
      <div><div class="su-person-name">${escapeHtml(name)}</div><div class="su-person-sub">${escapeHtml(suShortDaypart(dp.name))}${t.names.length > 1 ? ` · then ${escapeHtml(t.names.slice(1).join(', '))}` : ''}${person && person.role ? ` · ${escapeHtml(person.role)}` : ''}</div></div>
    </div>
    ${stats}
    ${devNote}
    ${fallBehind}
    <div class="su-person-actions">
      <button type="button" class="su-btn-line" data-su-change="${escapeHtml(slot)}">Change person</button>
      <button type="button" class="su-btn-line" data-su-handoff="${escapeHtml(slot)}">${t.flagged ? 'Coverage / handoff' : 'Hand off / needs coverage'}</button>
    </div>`;
  return suSheetFrame(`${slot} · #${t.rank}`, body);
}

function suSheetHtml(section, date, dp, dpIndex, m){
  if(!suSheet) return '';
  if(suSheet.kind === 'person') return suPersonSheetHtml(section, date, dp, dpIndex, m, suSheet.slot);
  if(suSheet.kind === 'lead') return section === 'foh' ? suLeadCaptainSheetHtml(date, dp, dpIndex) : '';
  const titles = {develop: 'Develop this shift', evaluate: 'Evaluate', planb: 'Plan B'};
  const body = suSheet.kind === 'develop' ? renderSetupDevelop(section, date, dp, dpIndex)
    : suSheet.kind === 'evaluate' ? renderSetupEvaluation(section, date, dp)
    : renderSetupPlanB(section, date, dp, dpIndex);
  return suSheetFrame(`${titles[suSheet.kind]} · ${suShortDaypart(dp.name)}`, body);
}

// ----- Board -----

function renderSetupsBoard(date){
  const section = currentPosSection;
  const {dp, dpIndex} = suCurrentDaypart(section, date);
  const m = suDaypartModel(section, date, dp, dpIndex);
  return `
    <div class="su-board">
      ${suDaypartChipsHtml(section, date, dp.name)}
      ${suGamePlanHtml(section, date, dp, dpIndex, m)}
      ${suZonesHtml(m)}
      <div class="su-legend" aria-hidden="true">
        <span><i class="su-av-crushing"></i>Crushing It</span><span><i class="su-av-rise"></i>On the Rise</span><span><i class="su-av-notyet"></i>Not Yet</span><span><i class="su-av-unrated"></i>Unrated</span><span>#&#8202;= set-up priority</span>
      </div>
      ${suToolbarHtml()}
      ${suSheetHtml(section, date, dp, dpIndex, m)}
    </div>`;
}

function suRunTool(kind){
  const section = currentPosSection;
  const date = document.getElementById('daySelect').value;
  const {dp, dpIndex} = suCurrentDaypart(section, date);
  const key = suEvalKey(section, date, dp.name);
  if(kind === 'develop') setupDevelopResults[key] = {at: Date.now(), signature: suDevelopSignature(section, date, dp, dpIndex), result: developShift(section, date, dp, dpIndex)};
  if(kind === 'evaluate') setupEvaluations[key] = {at: Date.now(), signature: suSetupSignature(section, date, dp.name), result: evaluateSetup(section, date, dp.name)};
  if(kind === 'planb') setupPlanBResults[key] = {at: Date.now(), signature: suDevelopSignature(section, date, dp, dpIndex), result: planBForDaypart(section, date, dp, dpIndex)};
  suSheet = {kind};
}

async function suApplySwap(btn){
  const date = document.getElementById('daySelect').value;
  const {dp} = suCurrentDaypart(currentPosSection, date);
  const prefix = suEvalKey(currentPosSection, date, dp.name) + '||';
  const slot = btn.dataset.suSwapSlot, incoming = btn.dataset.suSwap, outgoing = btn.dataset.suSwapOut;
  const replaceIn = (s, from, to) => suSplitNames(posAssignments[prefix + s]).map(n => n.toLowerCase() === from.toLowerCase() ? to : n).join('/');
  if(btn.dataset.suSwapKind === 'in'){
    if(!confirm(`${incoming} steps into ${slot}; ${outgoing} comes off it for now. Continue?`)) return;
    posAssignments[prefix + slot] = replaceIn(slot, outgoing, incoming);
  } else {
    const theirSlot = (setupsSlotsFor(dp.name).find(s => suSplitNames(posAssignments[prefix + s]).some(n => n.toLowerCase() === incoming.toLowerCase())));
    if(!theirSlot) return;
    if(!confirm(`Trade: ${incoming} takes ${slot}, ${outgoing} takes ${theirSlot}. Continue?`)) return;
    posAssignments[prefix + theirSlot] = replaceIn(theirSlot, incoming, outgoing);
    posAssignments[prefix + slot] = replaceIn(slot, outgoing, incoming);
  }
  suSheet = null;
  await saveState();
  renderAllDayparts();
  showToast('✓ Set up updated');
}

function setupsSlotsFor(dpName){
  return (currentPosSection === 'foh' ? fohPositions : bohPositions)[dpName] || [];
}

document.getElementById('allDayparts').addEventListener('click', e=>{
  const t = e.target;
  const daypart = t.closest('[data-su-daypart]');
  if(daypart){ suSelectedDaypart[currentPosSection] = daypart.dataset.suDaypart; suExpandedZones.clear(); suSheet = null; renderAllDayparts(); return; }
  const more = t.closest('[data-su-zone-more]');
  if(more){ suExpandedZones.add(more.dataset.suZoneMore); renderAllDayparts(); return; }
  const less = t.closest('[data-su-zone-less]');
  if(less){ suExpandedZones.delete(less.dataset.suZoneLess); renderAllDayparts(); return; }
  const tool = t.closest('[data-su-tool]');
  if(tool){ suRunTool(tool.dataset.suTool); renderAllDayparts(); return; }
  if(t.closest('[data-su-close-sheet]')){ suSheet = null; renderAllDayparts(); return; }
  const date = document.getElementById('daySelect').value;
  const {dp} = suCurrentDaypart(currentPosSection, date);
  const keyFor = slot => suEvalKey(currentPosSection, date, dp.name) + '||' + slot;
  const tile = t.closest('[data-su-tile]');
  if(tile){
    const slot = tile.dataset.suTile;
    if(posAssignments[keyFor(slot)]){ suSheet = {kind: 'person', slot}; renderAllDayparts(); }
    else openPosModal(keyFor(slot), slot, dp.name);
    return;
  }
  const change = t.closest('[data-su-change]');
  if(change){ suSheet = null; renderAllDayparts(); openPosModal(keyFor(change.dataset.suChange), change.dataset.suChange, dp.name); return; }
  const handoff = t.closest('[data-su-handoff]');
  if(handoff){ suSheet = null; renderAllDayparts(); openVacancyModal(keyFor(handoff.dataset.suHandoff), handoff.dataset.suHandoff, dp.name); return; }
  const swap = t.closest('[data-su-swap]');
  if(swap){ suApplySwap(swap); return; }
  const dayType = t.closest('[data-su-toggle-daytype]');
  if(dayType){
    const key = suEvalKey(currentPosSection, date, dp.name);
    delete setupDayTypes[key];
    if(suDayType(currentPosSection, date, dp).auto !== dayType.dataset.suToggleDaytype) setupDayTypes[key] = dayType.dataset.suToggleDaytype;
    renderAllDayparts();
    saveState();
  }
});

document.addEventListener('keydown', e=>{
  if(e.key === 'Escape' && suSheet && document.getElementById('positionsView').classList.contains('active')){
    suSheet = null;
    renderAllDayparts();
  }
});
