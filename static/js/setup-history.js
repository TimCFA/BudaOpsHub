// ===== SET-UP HISTORY =====
// Set Ups only keeps two weeks of assignments (pruneOldDateData), which is too
// short to see who has been rotated where. This keeps a permanent, compact log
// of each finished day's set up — who stood in which position, in which
// daypart — for Set Up Assessments (TIM-40) to read rotation from.
//
// Strings are stored once and days point at them by index, so a year of set
// ups stays small inside the single saved state blob:
//   {slots: ['foh||Lunch (11:00-2:00)||iPOS 1 (Captain)', ...],
//    names: ['Jane Doe', ...],
//    days:  {'2026-09-20': [[slotIndex, nameIndex], ...]}}
const SETUP_HISTORY_KEEP_DAYS = 365;
let setupHistory = {slots: [], names: [], days: {}};

function emptySetupHistory(){
  return {slots: [], names: [], days: {}};
}

function normalizeSetupHistory(h){
  if(!h || typeof h !== 'object') return emptySetupHistory();
  return {
    slots: Array.isArray(h.slots) ? h.slots : [],
    names: Array.isArray(h.names) ? h.names : [],
    days: (h.days && typeof h.days === 'object' && !Array.isArray(h.days)) ? h.days : {}
  };
}

function isSetupDateKey(k){
  return /^\d{4}-\d{2}-\d{2}$/.test(k);
}

function setupHistoryDateCutoff(daysBack){
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return toLocalISODate(d);
}

// posAssignments → {date: [[slotKey, name], ...]}. A slot handed off mid-shift
// ("Ana/Ben") credits both people.
function liveSetupPairsByDate(){
  const byDate = {};
  Object.keys(posAssignments).forEach(key=>{
    const [section, date, daypart, position] = key.split('||');
    if(!position || !isSetupDateKey(date)) return;
    String(posAssignments[key] || '').split('/').map(n => n.trim()).filter(Boolean).forEach(name=>{
      (byDate[date] = byDate[date] || []).push([section + '||' + daypart + '||' + position, name]);
    });
  });
  return byDate;
}

// Copies every finished day Set Ups still holds (the last two weeks) into the
// history, replacing that day's earlier copy so late edits are kept. Older
// days are already final and left alone. Must run before pruneOldDateData.
// Returns true if the history changed.
function archiveSetupHistory(){
  setupHistory = normalizeSetupHistory(setupHistory);
  const slotIndex = new Map(setupHistory.slots.map((s, i) => [s, i]));
  const nameIndex = new Map(setupHistory.names.map((n, i) => [n, i]));
  const indexOf = (map, list, value)=>{
    if(!map.has(value)){ map.set(value, list.length); list.push(value); }
    return map.get(value);
  };

  const liveCutoff = setupHistoryDateCutoff(14);
  const live = liveSetupPairsByDate();
  const dates = new Set(Object.keys(live));
  Object.keys(setupHistory.days).forEach(d => dates.add(d));

  let changed = false;
  dates.forEach(date=>{
    // Today's set up can still change. A day Set Ups no longer holds is only
    // "cleared" if it's still inside the two-week window; older ones were
    // pruned from Set Ups, and the history is now the only copy.
    if(date >= today) return;
    if(!live[date] && date < liveCutoff) return;
    const pairs = (live[date] || [])
      .map(([slot, name]) => [indexOf(slotIndex, setupHistory.slots, slot), indexOf(nameIndex, setupHistory.names, name)])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const before = JSON.stringify(setupHistory.days[date] || []);
    if(before === JSON.stringify(pairs)) return;
    if(pairs.length) setupHistory.days[date] = pairs;
    else delete setupHistory.days[date];
    changed = true;
  });

  if(pruneSetupHistory()) changed = true;
  return changed;
}

// Drops days older than a year, then rebuilds the string tables so slots and
// names nobody references any more don't linger.
function pruneSetupHistory(){
  const cutoff = setupHistoryDateCutoff(SETUP_HISTORY_KEEP_DAYS);
  const old = Object.keys(setupHistory.days).filter(d => d < cutoff);
  if(!old.length) return false;
  old.forEach(d => delete setupHistory.days[d]);

  const compact = emptySetupHistory();
  const slotIndex = new Map();
  const nameIndex = new Map();
  const remap = (map, list, value)=>{
    if(!map.has(value)){ map.set(value, list.length); list.push(value); }
    return map.get(value);
  };
  Object.keys(setupHistory.days).sort().forEach(date=>{
    compact.days[date] = setupHistory.days[date].map(([s, n]) => [
      remap(slotIndex, compact.slots, setupHistory.slots[s]),
      remap(nameIndex, compact.names, setupHistory.names[n])
    ]);
  });
  setupHistory = compact;
  return true;
}

// Every recorded assignment from fromISO to toISO (inclusive), oldest first,
// as {date, section, daypart, position, name}. Days Set Ups still holds come
// from the live assignments, so today's set up counts too.
function getSetupRecords(fromISO, toISO){
  const inRange = d => (!fromISO || d >= fromISO) && (!toISO || d <= toISO);
  const toRecord = (date, slot, name)=>{
    const [section, daypart, position] = slot.split('||');
    return {date, section, daypart, position, name};
  };
  const live = liveSetupPairsByDate();
  const records = [];
  Object.keys(live).forEach(date=>{
    if(inRange(date)) live[date].forEach(([slot, name]) => records.push(toRecord(date, slot, name)));
  });
  Object.keys(setupHistory.days).forEach(date=>{
    if(live[date] || !inRange(date)) return;
    setupHistory.days[date].forEach(([s, n])=>{
      const slot = setupHistory.slots[s];
      const name = setupHistory.names[n];
      if(slot && name) records.push(toRecord(date, slot, name));
    });
  });
  return records.sort((a, b) => a.date.localeCompare(b.date));
}

function setupHistoryStatusText(){
  const days = Object.keys(setupHistory.days).sort();
  if(!days.length) return 'Set-up history: nothing logged yet — each finished day is saved automatically.';
  const since = new Date(days[0] + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
  const count = days.reduce((sum, d) => sum + setupHistory.days[d].length, 0);
  return `Set-up history: ${days.length} day${days.length === 1 ? '' : 's'} logged since ${since} · ${count} assignments · kept for a year`;
}
