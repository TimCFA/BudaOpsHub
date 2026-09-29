// ===== SET UP RULES v2 (TIM-43) =====
// Shared by Fill, Evaluate, Plan B and the board:
//  - Mid-daypart arrivals and departures. Someone leaving part-way through a
//    daypart hands their spot to someone arriving around then ("Josh → Lauren
//    @ 7:30"), so the spot never goes vacant and the pair counts as one spot.
//  - Outside time. iPOS and OMD are outside; nobody should be out there for
//    more than 3.5 hours in a row, and ideally not two dayparts running.
//  - Lead Captain's working spot: Runner if staffing reaches it, otherwise
//    Drinks 3 or FC Bagger (whichever zone needs a leader more); DT Bagger 2
//    in the Afternoon. The Lead Captain never holds a zone captain slot.
//  - Leader spread: zones in the order a leader matters most.

const SU_LEADER_ZONE_PRIORITY = ['ipos', 'bagging', 'host', 'drinks', 'omd'];
// BOH (Tim): Primary first, then Raw, then Secondary. Prep comes last — it's
// detached from the rest of the kitchen — so it isn't part of the spread.
const SU_BOH_LEADER_ZONE_PRIORITY = ['primary', 'raw', 'secondary'];
function suLeaderZonePriority(section){
  return section === 'boh' ? SU_BOH_LEADER_ZONE_PRIORITY : SU_LEADER_ZONE_PRIORITY;
}
const SU_OUTSIDE_ZONES = ['ipos', 'omd'];
const SU_OUTSIDE_LIMIT_MIN = 210;   // 3.5 hours in a row
const SU_EDGE_MIN = 10;             // arriving/leaving within 10 min of the edge = whole daypart
const SU_HANDOFF_EARLY_MIN = 60;    // an arrival up to an hour before someone leaves can take over
const SU_HANDOFF_LATE_MIN = 30;     // ...or up to 30 min after (a short gap)
const SU_LEAD_HOME_SLOTS = [/^runner$/i, /^drinks? 3( \/ runner)?$/i, /^fc bagger$/i];
const SU_AFTERNOON_LEAD_HOME = /^dt bagger 2$/i;

function suClock(min){
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${(h + 11) % 12 + 1}:${String(m).padStart(2, '0')}`;
}

function suRosterFor(section, date){
  return (section === 'foh' ? fohRoster : bohRoster)[date] || [];
}

// Minutes this roster entry is on the floor, as [start, end] blocks.
function suShiftBlocks(entry){
  return (entry.blocks && entry.blocks.length ? entry.blocks : [entry]).map(b => [parseShiftTimeToMinutes(b.start), parseShiftTimeToMinutes(b.end)])
    .filter(([s, e]) => s !== null && e !== null).map(([s, e]) => [s, e <= s ? e + 1440 : e]);
}

// Who is on during this daypart and when: {people, pairs, arrivals, leavers,
// effective, window}. `effective` counts a handoff pair as one spot.
function suDaypartTiming(section, date, dpIndex){
  const dayparts = suDaypartsFor(section);
  const {startMin, endMin} = daypartTimeWindow(dayparts, dpIndex);
  const people = [];
  suRosterFor(section, date).forEach(entry=>{
    const inside = suShiftBlocks(entry).filter(([s, e]) => s < endMin && e > startMin);
    if(!inside.length) return;
    const from = Math.max(startMin, Math.min(...inside.map(b => b[0])));
    const to = Math.min(endMin, Math.max(...inside.map(b => b[1])));
    people.push({
      name: entry.name, from, to,
      arrives: from > startMin + SU_EDGE_MIN ? from : null,
      leaves: to < endMin - SU_EDGE_MIN ? to : null
    });
  });
  // Pair each early leaver with the arrival closest to their leaving time.
  const pairs = [];
  const used = new Set();
  people.filter(p => p.leaves !== null && p.arrives === null).sort((a, b) => a.leaves - b.leaves).forEach(out=>{
    const cand = people.filter(p => p !== out && p.arrives !== null && p.leaves === null && !used.has(p.name)
      && p.arrives >= out.leaves - SU_HANDOFF_EARLY_MIN && p.arrives <= out.leaves + SU_HANDOFF_LATE_MIN)
      .sort((a, b) => Math.abs(a.arrives - out.leaves) - Math.abs(b.arrives - out.leaves) || a.name.localeCompare(b.name))[0];
    if(!cand) return;
    used.add(cand.name);
    used.add(out.name);
    pairs.push({out: out.name, in: cand.name, at: out.leaves, arrives: cand.arrives, gap: Math.max(0, cand.arrives - out.leaves)});
  });
  return {
    people, pairs,
    arrivals: people.filter(p => p.arrives !== null && !used.has(p.name)),
    leavers: people.filter(p => p.leaves !== null && !used.has(p.name)),
    effective: people.length - pairs.length,
    window: {startMin, endMin}
  };
}

function suTimingFor(timing, name){
  const k = String(name).trim().toLowerCase();
  return timing.people.find(p => p.name.trim().toLowerCase() === k) || null;
}

function suPairFor(timing, a, b){
  const lo = s => String(s).trim().toLowerCase();
  return timing.pairs.find(p => lo(p.out) === lo(a) && (b === undefined || lo(p.in) === lo(b))) || null;
}

// "Josh → Lauren @ 7:30", "leaves 7:30", "from 11:30" — for a slot's names.
function suSlotTimeNote(timing, names){
  if(names.length > 1){
    const a = suTimingFor(timing, names[0]), b = suTimingFor(timing, names[1]);
    const at = a && a.leaves !== null ? a.leaves : b && b.arrives !== null ? b.arrives : null;
    const gap = a && b && a.leaves !== null && b.arrives !== null && b.arrives > a.leaves + 5;
    return at !== null ? {text: `→ ${suDisplayName(names[1])} @ ${suClock(at)}${gap ? ` (open till ${suClock(b.arrives)})` : ''}`, warn: gap} : null;
  }
  const p = names[0] ? suTimingFor(timing, names[0]) : null;
  if(!p) return null;
  if(p.leaves !== null) return {text: `leaves ${suClock(p.leaves)}`, warn: true};
  if(p.arrives !== null) return {text: `from ${suClock(p.arrives)}`, warn: false};
  return null;
}

function suIsOutside(section, slot){
  return section === 'foh' && SU_OUTSIDE_ZONES.includes(suZoneKeyOf(section, slot));
}

// Outside stretches for one person on one date, from every daypart except
// `skipDpName`, clipped to when they're actually there.
function suOutsideIntervals(section, date, name, skipDpName){
  const lo = name.trim().toLowerCase();
  const posMap = section === 'foh' ? fohPositions : bohPositions;
  const dayparts = suDaypartsFor(section);
  const entry = suRosterFor(section, date).find(p => p.name.trim().toLowerCase() === lo);
  const blocks = entry ? suShiftBlocks(entry) : null;
  const out = [];
  dayparts.forEach((dp, i)=>{
    if(dp.name === skipDpName) return;
    const {startMin, endMin} = daypartTimeWindow(dayparts, i);
    const key = suEvalKey(section, date, dp.name);
    (posMap[dp.name] || []).forEach(slot=>{
      if(!suIsOutside(section, slot)) return;
      const names = suSplitNames(posAssignments[key + '||' + slot]);
      const idx = names.findIndex(n => n.toLowerCase() === lo);
      if(idx === -1) return;
      let s = startMin, e = endMin;
      if(names.length > 1){
        // A handoff: the first name works until the switch, the second after.
        const timing = suDaypartTiming(section, date, i);
        const note = suTimingFor(timing, names[0]);
        const at = note && note.leaves !== null ? note.leaves : (suTimingFor(timing, names[1]) || {}).arrives;
        if(at != null){ if(idx === 0) e = at; else s = at; }
      }
      if(blocks) blocks.forEach(([bs, be]) => { const a = Math.max(s, bs), b = Math.min(e, be); if(b > a) out.push([a, b, dp.name]); });
      else out.push([s, e, dp.name]);
    });
  });
  return out;
}

// If `name` works an outside slot in this daypart from `from` to `to`: the
// unbroken outside run it would be part of, and the dayparts next to it that
// are also outside. {minutes, touching: [dpName...]}
function suOutsideRun(section, date, name, dpName, from, to){
  const all = suOutsideIntervals(section, date, name, dpName).concat([[from, to, dpName]]).sort((a, b) => a[0] - b[0]);
  // Merge touching stretches (5-minute tolerance), then find ours.
  const runs = [];
  all.forEach(iv=>{
    const last = runs[runs.length - 1];
    if(last && iv[0] <= last.end + 5){ last.end = Math.max(last.end, iv[1]); last.dps.add(iv[2]); }
    else runs.push({start: iv[0], end: iv[1], dps: new Set([iv[2]])});
  });
  const mine = runs.find(r => r.dps.has(dpName)) || {start: from, end: to, dps: new Set([dpName])};
  return {minutes: mine.end - mine.start, touching: [...mine.dps].filter(d => d !== dpName)};
}

// ----- Lead Captain's working spot -----

function suLeadHomeCandidates(dp, slots){
  if(/^afternoon/i.test(dp.name)){
    const bagger2 = slots.filter(s => SU_AFTERNOON_LEAD_HOME.test(s));
    if(bagger2.length) return bagger2;
  }
  return SU_LEAD_HOME_SLOTS.map(re => slots.find(s => re.test(s))).filter(Boolean);
}

// The working spot to suggest for the Lead Captain. `leadersIn(zone)` counts
// leaders already in a zone; `weakness(zone)` is higher when a zone's placed
// people are less proven. Runner when the headcount reaches it; otherwise the
// zone that needs a leader more.
function suPickLeadHome(dp, slots, headcount, isFree, leadersIn, weakness){
  const cands = suLeadHomeCandidates(dp, slots).filter(isFree);
  if(!cands.length) return null;
  const rank = s => slots.indexOf(s) + 1;
  const inRange = cands.filter(s => !headcount || rank(s) <= headcount);
  if(/^afternoon/i.test(dp.name) && cands.some(s => SU_AFTERNOON_LEAD_HOME.test(s))) return {slot: cands.find(s => SU_AFTERNOON_LEAD_HOME.test(s)), why: 'Afternoon Lead Captain works DT Bagger 2'};
  const runner = inRange.find(s => /runner/i.test(s));
  if(runner) return {slot: runner, why: 'staffing reaches Runner'};
  const choices = (inRange.length ? inRange : cands).map(s => ({s, z: suZoneKeyOf('foh', s)}));
  choices.sort((a, b) => leadersIn(a.z) - leadersIn(b.z) || weakness(b.z) - weakness(a.z) || rank(a.s) - rank(b.s));
  const c = choices[0];
  const why = leadersIn(c.z) === 0 ? `no other leader in ${suZoneName('foh', c.z)}` : `${suZoneName('foh', c.z)} needs the most support`;
  return {slot: c.s, why: inRange.length ? why : `${why} (past today’s headcount)`};
}

// The slot the Lead Captain is also working this daypart, if any.
function suLeadWorkingSlot(date, dp){
  const key = suEvalKey('foh', date, dp.name);
  const lead = posAssignments[key + '||' + SU_LEAD_CAPTAIN];
  if(!lead) return null;
  const lo = lead.trim().toLowerCase();
  return (fohPositions[dp.name] || []).find(s => suSplitNames(posAssignments[key + '||' + s]).some(n => n.toLowerCase() === lo)) || null;
}
