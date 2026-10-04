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
// BOH (Tim): three zones — Primary (with Fries), Secondary (with
// Biscuit/Eggs) and Raw (Breaders, Machines, Filters). "Primary/Machines"
// counts as Primary. Prep, Dishes, Floors and Breaks are extra hands.
const SU_ZONES = {
  foh: [
    {key: 'ipos', name: 'iPOS', re: /ipos/i},
    {key: 'bagging', name: 'Bagging', re: /bagg/i},
    {key: 'drinks', name: 'Drinks', re: /drink|lemonade/i},
    {key: 'omd', name: 'OMD', re: /\bomd\b/i},
    {key: 'host', name: 'Host', re: /host|din+ing|restroom|outside/i}
  ],
  boh: [
    {key: 'primary', name: 'Primary', re: /primar|fries/i},
    {key: 'secondary', name: 'Secondary', re: /secondar|biscuit|eggs/i},
    {key: 'raw', name: 'Raw', re: /breader|machines|filters/i}
  ]
};
const SU_EXTRA_ZONE = {key: 'extra', name: 'Extra hands'};

let suSelectedDaypart = {foh: '', boh: ''};   // daypart name per section
let suDaypartClosed = {foh: true, boh: true};     // Set up view: every daypart card starts closed; a tap opens the one the leader wants (Tim, Oct 2026)
let suSelectedDate = '';
let suExpandedZones = new Set();              // zones showing their optional slots
let suSheet = null;                           // {kind: 'develop'|'fill'|'evaluate'|'planb'|'person'|'lead', slot}

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
    suDaypartClosed = {foh: true, boh: true};
    suExpandedZones.clear();
    suSheet = null;
  }
  const dayparts = suDaypartsFor(section);
  if(!dayparts.some(d => d.name === suSelectedDaypart[section])) suSelectedDaypart[section] = suDefaultDaypart(section, date);
  const dpIndex = dayparts.findIndex(d => d.name === suSelectedDaypart[section]);
  return {dp: dayparts[dpIndex], dpIndex};
}

// Board names: first name only. When two people share a first name, each
// gets their last-name initials — "Daniel M.", and "Daniel V.C." for a
// two-word last name (Van Cleave). If the initials match too, the full last
// name. A nickname in parentheses is used as the first name. Built from
// everyone on the saved rosters, so a name reads the same every day.
let suNameMap = null;

function suNameParts(full){
  let s = String(full).trim();
  if(s && s === s.toUpperCase()) s = s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  const nick = (s.match(/\(([^)]+)\)/) || [])[1];
  const words = s.replace(/\([^)]*\)/g, ' ').split(/\s+/).filter(Boolean);
  return {first: nick ? nick.trim() : (words[0] || s), last: words.slice(1)};
}

function suBuildNameMap(){
  const all = new Set();
  [fohRoster, bohRoster].forEach(r => Object.values(r).forEach(list => (Array.isArray(list) ? list : []).forEach(p => p && p.name && all.add(p.name.trim()))));
  Object.values(posAssignments).forEach(v => suSplitNames(v).forEach(n => all.add(n)));
  const byFirst = {};
  [...all].forEach(n => { const k = suNameParts(n).first.toLowerCase(); (byFirst[k] = byFirst[k] || new Set()).add(n.toLowerCase()); });
  const fulls = {};
  [...all].forEach(n => { fulls[n.toLowerCase()] = n; });
  const map = {};
  Object.values(byFirst).forEach(group=>{
    const names = [...group].map(k => fulls[k]);
    if(names.length === 1){ map[names[0].toLowerCase()] = suNameParts(names[0]).first; return; }
    const withInitials = names.map(n => { const p = suNameParts(n); return {n, p, label: p.last.length ? `${p.first} ${p.last.map(w => w[0].toUpperCase() + '.').join('')}` : p.first}; });
    withInitials.forEach(x=>{
      const clash = withInitials.filter(y => y.label === x.label).length > 1;
      map[x.n.toLowerCase()] = clash && x.p.last.length ? `${x.p.first} ${x.p.last.join(' ')}` : x.label;
    });
  });
  return map;
}

function suDisplayName(full){
  if(!full) return '';
  if(!suNameMap) suNameMap = suBuildNameMap();
  return suNameMap[String(full).trim().toLowerCase()] || suNameParts(full).first;
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
  const timing = suDaypartTiming(section, date, dpIndex);
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
      flagged: !!posVacancyFlags[key + '||' + slot],
      timeNote: suSlotTimeNote(timing, names)
    };
  });
  // A mid-daypart handoff pair shares one spot, so it counts once.
  const headcount = timing.people.length ? timing.effective : onShift.length;
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
  return {key, tiles, zones: zones.filter(z => z.tiles.length), headcount, onShift: onShift.length, timing, unplaced, filled};
}

// ----- Pieces -----

// "6/12" — spots filled / people on shift ("3 placed" or "—" with no roster).
function suDaypartFillText(section, date, dp, i){
  const posMap = section === 'foh' ? fohPositions : bohPositions;
  const key = suEvalKey(section, date, dp.name);
  const filled = (posMap[dp.name] || []).filter(s => posAssignments[key + '||' + s]).length;
  const onShift = suDaypartTiming(section, date, i).effective;
  return onShift ? `${filled}/${onShift}` : filled ? `${filled} placed` : '—';
}

// Each daypart's sky: a soft gradient and a small scene. East is on the
// left: the sun rises there at Early Breakfast, is overhead by Lunch, and
// sinks to the right (west) through the Afternoon; then a moon and stars for
// Dinner and Close.
function suDaypartSky(name){
  const n = name.toLowerCase();
  return /early/.test(n) ? 'dawn' : /breakfast/.test(n) ? 'morning' : /lunch|mid|transition/.test(n) ? 'midday'
    : /afternoon/.test(n) ? 'afternoon' : /dinner/.test(n) ? 'dusk' : /clos|night/.test(n) ? 'night' : 'midday';
}

// A class per daypart on its banner (and on the Zone Reset handoff it hands
// off from). Banners are all one color; Close uses it for a dark moon badge.
function suDaypartColor(name){
  const n = name.toLowerCase();
  return /early/.test(n) ? 'eb' : /breakfast/.test(n) ? 'b' : /lunch/.test(n) ? 'l' : /transition/.test(n) ? 't'
    : /afternoon|mid/.test(n) ? 'a' : /dinner/.test(n) ? 'd' : /clos|night/.test(n) ? 'c' : 'l';
}

function suSkyArt(sky){
  const sun = (cx, cy, r, rays) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#F4A73A"/>` + (rays ? [0, 45, 90, 135, 180, 225, 270, 315].map(a=>{
    const t = a * Math.PI / 180, x1 = cx + Math.cos(t) * (r + 2), y1 = cy + Math.sin(t) * (r + 2), x2 = cx + Math.cos(t) * (r + 4.5), y2 = cy + Math.sin(t) * (r + 4.5);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#F4A73A" stroke-width="1.6" stroke-linecap="round"/>`;
  }).join('') : '');
  const horizon = '<line x1="2" y1="22" x2="34" y2="22" stroke="#C9A27A" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>';
  const star = (x, y, s, c) => `<path d="M${x} ${y - s}L${x + s * 0.3} ${y - s * 0.3}L${x + s} ${y}L${x + s * 0.3} ${y + s * 0.3}L${x} ${y + s}L${x - s * 0.3} ${y + s * 0.3}L${x - s} ${y}L${x - s * 0.3} ${y - s * 0.3}Z" fill="${c}"/>`;
  // Crescent: the left half of a circle, closed by a flatter arc back up.
  const moon = (cx, cy, r, c) => `<path d="M${cx} ${cy - r}A${r} ${r} 0 1 0 ${cx} ${cy + r}A${r * 1.35} ${r * 1.35} 0 0 1 ${cx} ${cy - r}Z" fill="${c}"/>`;
  const art = {
    dawn: `<path d="M4 22A6 6 0 0 1 16 22Z" fill="#F4A73A"/>` + horizon,
    morning: sun(12, 14, 4.5, true) + horizon,
    midday: sun(18, 10, 5, true),
    afternoon: sun(25, 14, 4.5, true) + horizon,
    dusk: moon(19, 13, 8, '#8C6FC9') + star(29, 6, 2.6, '#8C6FC9'),
    night: moon(17, 13, 8, '#F6E7A6') + star(28, 6, 2.4, '#F6E7A6') + star(32, 16, 1.6, '#F6E7A6') + star(25, 21, 1.3, '#F6E7A6')
  }[sky];
  return `<svg viewBox="0 0 36 26" width="36" height="26" aria-hidden="true">${art}</svg>`;
}

// Set up view: every daypart as a card down the page, one open at a time
// (the selected daypart, which every tool and pop-up works on). Tap a card
// to open it; tap the open one to close it. The banner carries the daypart,
// how full it is, the day type and (FOH) the Lead Captain; the open one adds
// Fill when spots are open. The body is just the positions.
// Fill is off in the simplified (launch) view for now: leaders build set ups
// by hand until the fill rules are reworked. The full site keeps it.
function suFillAvailable(){
  return !(typeof launchIsOn === 'function' && launchIsOn());
}

function suDaypartCardsHtml(section, date, current, openHtml, m){
  return `<div class="su-dp-list">${suDaypartsFor(section).map((dp, i)=>{
    const open = dp.name === current && !suDaypartClosed[section];
    const time = (dp.name.match(/\(([^)]*)\)/) || [])[1] || '';
    const lead = section === 'foh' ? posAssignments[suEvalKey(section, date, dp.name) + '||' + SU_LEAD_CAPTAIN] : '';
    const working = lead ? suLeadWorkingSlot(date, dp) : null;
    // Only the Lead Captain's name opens the Lead picker; the rest of the
    // banner opens and closes the card.
    const leadBtn = section === 'foh' ? `<span class="su-dp-k">Lead</span><button type="button" class="su-dp-lead" data-su-lead-open="1" data-su-lead-dp="${escapeHtml(dp.name)}">${lead ? `<b>${escapeHtml(suDisplayName(lead))}</b>` : '<em>Choose</em>'}</button>${working ? `<span class="su-dp-where">· ${escapeHtml(working)}</span>` : ''}` : '';
    const needed = open && m ? m.tiles.filter(x => x.needed).length : 0;
    const fillBtn = needed && m.unplaced.length && suFillAvailable() ? `<button type="button" class="su-dp-fillbtn" data-su-tool="fill">Fill ${needed} open</button>` : '';
    const sky = suDaypartSky(dp.name);
    return `<section class="su-dp su-col-${suDaypartColor(dp.name)} ${open ? 'is-open' : ''}" aria-label="${escapeHtml(suShortDaypart(dp.name))}">
      <div class="su-dp-banner">
        <button type="button" class="su-dp-head" data-su-dp-toggle="${escapeHtml(dp.name)}" aria-expanded="${open}">
          <span class="su-dp-art">${suSkyArt(sky)}</span>
          <span class="su-dp-name">${escapeHtml(suShortDaypart(dp.name))}${time ? ` <span class="su-dp-time">${escapeHtml(time)}</span>` : ''}</span>
          <span class="su-dp-fill">${suDaypartFillText(section, date, dp, i)}</span>
          <span class="su-dp-chev" aria-hidden="true">▾</span>
        </button>
        ${leadBtn || fillBtn ? `<div class="su-dp-sub" data-su-dp-toggle="${escapeHtml(dp.name)}">${leadBtn}${fillBtn}</div>` : ''}
      </div>
      ${open ? `<div class="su-dp-body">${openHtml}</div>` : ''}
    </section>`;
  }).join('')}</div>`;
}

function suDaypartChipsHtml(section, date, current){
  return `<div class="su-chips" role="tablist" aria-label="Daypart">${suDaypartsFor(section).map((dp, i)=>{
    const posMap = section === 'foh' ? fohPositions : bohPositions;
    const key = suEvalKey(section, date, dp.name);
    const filled = (posMap[dp.name] || []).filter(s => posAssignments[key + '||' + s]).length;
    const onShift = suDaypartTiming(section, date, i).effective;
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
  const facts = [nums.projectedSales ? `${nums.projectedSales} projected` : '', nums.productivityGoal ? `goal ${nums.productivityGoal}` : '', nums.specialEvents || '', `${m.onShift} on shift`, m.timing.pairs.length ? `${m.timing.pairs.length} handoff${m.timing.pairs.length === 1 ? '' : 's'} = ${m.headcount} spots` : ''].filter(Boolean);

  const dev = setupDevelopResults[m.key];
  const devStale = dev && dev.signature !== suDevelopSignature(section, date, dp, dpIndex);
  const pick = dev && dev.result.picks[0];
  const devText = !dev ? 'Tap Develop below to pick today’s focus.'
    : pick ? `${suDisplayName(pick.name)}${pick.target ? ` on ${pick.target.pos}` : ''}${pick.pair ? `, with ${suDisplayName(pick.pair.name)}` : ''}${dev.result.picks.length > 1 ? ` · +${dev.result.picks.length - 1} more` : ''}`
    : dev.result.room ? 'Nobody needs a development focus right now.' : 'No room to develop this daypart.';

  const ev = setupEvaluations[m.key];
  const evStale = ev && ev.signature !== suSetupSignature(section, date, dp.name);
  const risk = ev && ev.result.risks[0];
  const watchText = !ev ? 'Tap Evaluate below to check risks.' : risk ? `${risk.name} ${risk.text}${ev.result.risks.length > 1 ? ` · +${ev.result.risks.length - 1} more` : ''}` : 'No risks in this set up.';

  const needed = m.tiles.filter(x => x.needed);
  const openText = needed.length
    ? `${needed.slice(0, 3).map(x => `${x.slot} (#${x.rank})`).join(', ')}${needed.length > 3 ? ` +${needed.length - 3}` : ''}${m.unplaced.length ? ` — ${m.unplaced.slice(0, 3).map(suDisplayName).join(', ')} ${m.unplaced.length === 1 ? 'is' : 'are'} on shift, not placed` : ''}`
    : m.unplaced.length ? `All priority spots filled · not placed: ${m.unplaced.slice(0, 4).map(suDisplayName).join(', ')}` : m.headcount ? 'Every priority spot is filled.' : 'No roster for this daypart yet.';

  return `
    <section class="su-plan" aria-label="Game plan">
      <div class="su-plan-head">
        <h2>${escapeHtml(suShortDaypart(dp.name))} game plan</h2>
        <button type="button" class="su-daytype-btn su-${t.type}" data-su-toggle-daytype="${t.type === 'game' ? 'practice' : 'game'}" title="${escapeHtml(t.overridden ? 'Set by a leader — tap to switch' : (t.reasons.length ? 'Auto: ' + t.reasons.join(' + ') : 'Auto: weekday, no event or high numbers') + ' — tap to switch')}">${t.type === 'game' ? 'Game Day' : 'Practice Day'}</button>
      </div>
      <div class="su-plan-facts">${facts.map(escapeHtml).join(' · ')}</div>
      ${suStrengthHtml(m)}
      <div class="su-plan-lines">
        ${section === 'foh' ? suLeadCaptainLineHtml(date, dp) : ''}
        <div class="su-plan-line"><span class="su-plan-tag is-dev">Develop</span><span>${escapeHtml(devText)}${devStale ? ' <em>· out of date</em>' : ''}</span></div>
        <div class="su-plan-line"><span class="su-plan-tag is-watch">Watch</span><span>${escapeHtml(watchText)}${evStale ? ' <em>· out of date</em>' : ''}</span></div>
        ${suChangesLineHtml(m)}
        <div class="su-plan-line su-plan-open"><span class="su-plan-tag is-open">Open</span><span>${escapeHtml(openText)}</span>${needed.length && m.unplaced.length && suFillAvailable() ? '<button type="button" class="su-plan-link" data-su-tool="fill">Fill</button>' : ''}</div>
      </div>
    </section>`;
}

// People arriving or leaving part-way through the daypart, and the handoffs
// that keep their spots covered. "Split" writes the ready handoffs into the
// leavers' spots.
function suSplitsReady(m){
  const lo = s => s.trim().toLowerCase();
  const placed = new Set(m.tiles.flatMap(t => t.names.map(lo)));
  return m.timing.pairs.map(pr => ({pr, tile: m.tiles.find(t => t.names.length === 1 && lo(t.names[0]) === lo(pr.out))}))
    .filter(x => x.tile && !placed.has(lo(x.pr.in)));
}

function suChangesLineHtml(m){
  const t = m.timing;
  if(!t.pairs.length && !t.arrivals.length && !t.leavers.length) return '';
  const first = suDisplayName;
  const bits = [
    ...t.pairs.map(p => `${first(p.out)} → ${first(p.in)} @ ${suClock(p.at)}${p.gap > 5 ? ` (${first(p.in)} in ${suClock(p.arrives)})` : ''}`),
    ...t.leavers.map(p => `${first(p.name)} leaves ${suClock(p.leaves)}`),
    ...t.arrivals.map(p => `${first(p.name)} from ${suClock(p.arrives)}`)
  ];
  const ready = suSplitsReady(m);
  return `<div class="su-plan-line"><span class="su-plan-tag is-watch">Changes</span><span>${escapeHtml(bits.join(' · '))}</span>${ready.length ? `<button type="button" class="su-plan-link" data-su-apply-splits="1">Split ${ready.length}</button>` : ''}</div>`;
}

function suTileHtml(t){
  // A handoff shows the first name; the time note under it names who's next.
  const name = t.names.length ? (t.names.length > 1 && t.timeNote ? suDisplayName(t.names[0]) : t.names.map(suDisplayName).join(' → ')) : t.needed ? 'Needed' : 'Open';
  const avatar = t.names.length ? suInitials(t.names[0]) : '+';
  const label = `${t.slot}, priority ${t.rank}: ${t.names.length ? t.names.join(' then ') : (t.needed ? 'needed' : 'open')}${t.cell ? `, ${t.cell.tier.label} ${t.cell.avg.toFixed(2)}` : ''}`;
  return `
    <button type="button" class="su-tile ${t.needed ? 'is-needed' : ''} ${!t.names.length ? 'is-open' : ''} ${t.flagged ? 'is-flagged' : ''}" data-su-tile="${escapeHtml(t.slot)}" aria-label="${escapeHtml(label)}">
      <span class="su-tile-top"><span class="su-tile-slot">${escapeHtml(t.slot)}</span><span class="su-tile-rank">#${t.rank}</span></span>
      <span class="su-tile-who">
        <span class="su-avatar su-av-${t.tier}" aria-hidden="true">${escapeHtml(avatar)}</span>
        <span class="su-tile-name">${escapeHtml(name)}${t.develop ? ' <span class="su-star" title="Development focus">★</span>' : ''}</span>
      </span>
      ${t.timeNote ? `<span class="su-tile-time ${t.timeNote.warn ? 'is-warn' : ''}">${escapeHtml(t.timeNote.text)}</span>` : ''}
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
    const leaders = z.tiles.filter(t => t.leaderRole).map(t => `<span class="su-zone-leader" title="${escapeHtml(t.leaderRole)}">${escapeHtml(suDisplayName(t.names[0]))} · ${t.leaderRole === 'Team Lead' ? 'TL' : 'Trainer'}</span>`).join('');
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
      ${suFillAvailable() ? tool('fill', 'Fill', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><path d="M16.5 13.5v6M13.5 16.5h6"/></svg>') : ''}
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
  const trend = peaName && t.cell ? peaTrendFor(peaName, t.positions) : null;
  const stat = (k, v, sub, cls) => `<div class="su-stat ${cls || ''}"><span class="su-stat-k">${k}</span><span class="su-stat-v">${v}</span><span class="su-stat-s">${sub}</span></div>`;
  const posLabel = t.positions.length ? t.positions.join('/') : 'This spot';

  const stats = `<div class="su-stats">
    ${t.positions.length ? stat(escapeHtml(posLabel), t.cell ? `${t.cell.avg.toFixed(2)}${peaTrendMark(trend)}` : '—', t.cell ? `${escapeHtml(t.cell.tier.label)} · ${t.cell.total} rating${t.cell.total === 1 ? '' : 's'}${trend && trend.dir !== 'flat' ? ` · ${trend.dir === 'up' ? 'rising' : 'slipping'}` : ''}` : 'Not rated here', t.cell ? 'is-' + t.cell.tier.key : '') : stat('Spot', '—', 'Not a Levelset position')}
    ${stat('Green', cert && cert.rated ? `${cert.green} / ${cert.rated}` : '—', cert && cert.allGreen ? `all green · ${cert.rated}/${cert.total} rated` : cert && cert.rated ? 'rated positions' : 'no position ratings', cert && cert.allGreen ? 'is-crushing' : '')}
    ${stat('Last PEA', last ? `${suDaysBetween(last, today)}d` : '—', last ? peaFormatDate(last) : person ? 'no position ratings' : 'no Levelset match')}
  </div>`;

  const greenNote = !cert || SU_LEADER_ROLES.includes(person.role) ? ''
    : cert.allGreen ? `<div class="su-note is-green"><b>All green.</b> Ready for certification, or already certified.${cert.unrated.length ? ` Not rated yet: ${escapeHtml(cert.unrated.join(', '))}.` : ''}</div>`
    : `<p class="su-green-left">Not green yet: ${escapeHtml(agNotGreenText(person, section))}</p>`;
  // What to coach in the position they're working now.
  const coachOn = peaName ? t.positions.map(pos => ({pos, w: peaWeakest(peaName, pos)})).filter(x => x.w) : [];
  const coachNote = coachOn.map(x => `<p class="su-coach-on">Coach on <b>${escapeHtml(x.w.label)}</b> at ${escapeHtml(x.pos)} <span>· ${x.w.avg.toFixed(1)} over the last ${x.w.n} rating${x.w.n === 1 ? '' : 's'}</span></p>`).join('');
  const devNote = pick ? `<div class="su-note is-dev"><b>★ Develop today.</b> ${escapeHtml(pick.reasons.join('; '))}${pick.pair ? ` — pair with ${escapeHtml(pick.pair.name)}` : ''}${pick.peaDue && pick.target ? `, then complete a ${escapeHtml(pick.target.pos)} PEA` : ''}.</div>` : '';

  let fallBehind = '';
  if(row){
    const focus = coachOn.length ? `focus on ${coachOn[0].w.label}` : '';
    const coach = row.coach ? `<div class="su-pb-row"><span class="su-pb-k">Coach</span><span class="su-pb-v"><b>${escapeHtml(row.coach.name)}</b><span>${escapeHtml([row.coach.kind, ...row.coach.notes, focus].filter(Boolean).join(' · '))}</span></span></div>` : '';
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
    ${greenNote}
    ${coachNote}
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
  if(suSheet.kind === 'row') return suRowSheetHtml(section, date, dp, m, suSheet.slot);
  if(suSheet.kind === 'fill') return suFillSheetHtml(section, date, dp, dpIndex);
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
  suNameMap = null;   // rebuilt from the current rosters on first use
  breakPlanReset();
  const {dp, dpIndex} = suCurrentDaypart(section, date);
  const m = suDaypartModel(section, date, dp, dpIndex);
  // Default: the sheet view (setups-sheet.js). Coach: the full board.
  if(suMode !== 'coach'){
    return `
    <div class="su-board is-sheet">
      ${suModeBarHtml()}
      ${rosterChangesHtml(section, date)}
      ${suDaypartCardsHtml(section, date, dp.name, suSheetViewHtml(section, date, dp, dpIndex, m), m)}
      ${suSheetHtml(section, date, dp, dpIndex, m)}
    </div>`;
  }
  return `
    <div class="su-board">
      ${suModeBarHtml()}
      ${rosterChangesHtml(section, date)}
      ${suDaypartChipsHtml(section, date, dp.name)}
      ${suGamePlanHtml(section, date, dp, dpIndex, m)}
      ${suZonesHtml(m)}
      ${suBreaksCardHtml(section, date, dpIndex)}
      ${suPeaTodoHtml(section, date, dp)}
      <div class="su-legend" aria-hidden="true">
        <span><i class="su-av-crushing"></i>Crushing It</span><span><i class="su-av-rise"></i>On the Rise</span><span><i class="su-av-notyet"></i>Not Yet</span><span><i class="su-av-unrated"></i>Unrated</span><span>#&#8202;= set-up priority</span>
      </div>
      ${suToolbarHtml()}
      ${suSheetHtml(section, date, dp, dpIndex, m)}
    </div>`;
}

function suRunTool(kind){
  if(kind === 'fill' && !suFillAvailable()) return;
  const section = currentPosSection;
  const date = document.getElementById('daySelect').value;
  const {dp, dpIndex} = suCurrentDaypart(section, date);
  const key = suEvalKey(section, date, dp.name);
  if(kind === 'develop') setupDevelopResults[key] = {at: Date.now(), signature: suDevelopSignature(section, date, dp, dpIndex), result: developShift(section, date, dp, dpIndex)};
  if(kind === 'evaluate') setupEvaluations[key] = {at: Date.now(), signature: suSetupSignature(section, date, dp.name), result: evaluateSetup(section, date, dp.name)};
  if(kind === 'fill') setupFillResults[key] = {at: Date.now(), signature: suDevelopSignature(section, date, dp, dpIndex), result: fillEmptySlots(section, date, dp, dpIndex)};
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
  renderAllDayparts();
  showToast('✓ Set up updated');
  saveState();
}

function setupsSlotsFor(dpName){
  return (currentPosSection === 'foh' ? fohPositions : bohPositions)[dpName] || [];
}

document.getElementById('allDayparts').addEventListener('click', e=>{
  const t = e.target;
  const daypart = t.closest('[data-su-daypart]');
  if(daypart){ suSelectedDaypart[currentPosSection] = daypart.dataset.suDaypart; suDaypartClosed[currentPosSection] = false; suExpandedZones.clear(); suSheet = null; renderAllDayparts(); return; }
  const dpToggle = t.closest('[data-su-dp-toggle]');
  if(dpToggle && !t.closest('[data-su-lead-open],[data-su-tool]')){
    const sec = currentPosSection, name = dpToggle.dataset.suDpToggle;
    if(name === suSelectedDaypart[sec] && !suDaypartClosed[sec]) suDaypartClosed[sec] = true;
    else { suSelectedDaypart[sec] = name; suDaypartClosed[sec] = false; suExpandedZones.clear(); }
    suSheet = null;
    renderAllDayparts();
    // Keep the tapped card where the finger is.
    const head = [...document.querySelectorAll('#allDayparts .su-dp-head')].find(b => b.dataset.suDpToggle === name);
    if(head && !suDaypartClosed[sec]) head.scrollIntoView({block: 'nearest'});
    return;
  }
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
    if(posAssignments[keyFor(slot)]){ suSheet = {kind: suMode === 'coach' ? 'person' : 'row', slot}; renderAllDayparts(); }
    else openPosModal(keyFor(slot), slot, dp.name);
    return;
  }
  const change = t.closest('[data-su-change]');
  if(change){ suSheet = null; renderAllDayparts(); openPosModal(keyFor(change.dataset.suChange), change.dataset.suChange, dp.name); return; }
  const handoff = t.closest('[data-su-handoff]');
  if(handoff){ suSheet = null; renderAllDayparts(); openVacancyModal(keyFor(handoff.dataset.suHandoff), handoff.dataset.suHandoff, dp.name); return; }
  const swap = t.closest('[data-su-swap]');
  if(swap){ suApplySwap(swap); return; }
  if(t.closest('[data-su-apply-splits]')){
    const {dpIndex} = suCurrentDaypart(currentPosSection, date);
    const ready = suSplitsReady(suDaypartModel(currentPosSection, date, dp, dpIndex));
    ready.forEach(({pr, tile}) => { posAssignments[keyFor(tile.slot)] = `${tile.names[0]}/${pr.in}`; });
    renderAllDayparts();
    saveState();
    showToast(`✓ ${ready.length} handoff${ready.length === 1 ? '' : 's'} added`);
    return;
  }
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
