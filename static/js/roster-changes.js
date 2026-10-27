// ===== SHIFT CHANGES (swaps since the schedule was posted) =====
// The team swaps a lot of shifts in HotSchedules, and the roster is synced
// again (Ops Hub Sync) to pick them up. A sync replaces each day's imported
// roster, so the first time a day that already has an imported roster is
// synced again, the roster it had is kept as that day's posted schedule
// (rosterPosted). The difference for the day:
//   swap  — one person off and another on for the same hours
//   on    — added
//   off   — no longer scheduled
//   time  — same person, different hours
// Only imported people count; ones added by hand (source: 'manual') are the
// leader's own changes. Past days are pruned after a week.
//
// Set Ups doesn't list them (Tim, Oct 26 2026: the list was "chaotic and
// unhelpful… can't decipher the information at one glance"). The one a lead
// has to act on, someone off who is still placed, shows on the spot itself
// (rosterIsOff): the name marked "Off today", the spot counted as open on
// its daypart card, and one chip above the cards ("2 spots to fix") that
// opens the first. Adds, swaps and new hours need nothing from them: the
// roster and the cards' arrival and leave times already show them.

const ROSTER_POSTED_KEEP_DAYS = 7;

function rcKey(p){ return String(p.name || '').trim().toLowerCase(); }

// A shift's hours as one string, the same however the times were written
// ("6:00 AM" and "6:00a" alike): "6:00a–1:00p", or blocks joined by ", ".
function rcTime(t){
  const m = parseShiftTimeToMinutes(t);
  return m === null ? String(t || '') : `${suClock(m)}${m >= 720 ? 'p' : 'a'}`;
}
function rcSpan(p){
  const blocks = p.blocks && p.blocks.length > 1 ? p.blocks : [p];
  return blocks.map(b => `${rcTime(b.start)}–${rcTime(b.end)}`).join(', ');
}

function rcImported(list){
  return (list || []).filter(p => p && p.name && p.source !== 'manual');
}

function rcSlim(list){
  return list.map(p => {
    const slim = {name: p.name, start: p.start, end: p.end};
    if(p.blocks && p.blocks.length > 1) slim.blocks = p.blocks.map(b => ({start: b.start, end: b.end}));
    return slim;
  });
}

// Before a day's roster is replaced by an import: keep what it had as the
// posted schedule, unless it already has one (or has no imported roster yet,
// i.e. this is the week's first import).
function rosterNotePosted(date, side, currentList){
  if(date < today) return;
  const day = rosterPosted[date] || {};
  if(day[side]) return;
  const before = rcImported(currentList);
  if(!before.length) return;
  day[side] = rcSlim(before);
  day.at = day.at || Date.now();
  rosterPosted[date] = day;
}

function rosterPrunePosted(){
  const cutoff = isoAddDays(today, -ROSTER_POSTED_KEEP_DAYS);
  Object.keys(rosterPosted).forEach(d => { if(d < cutoff) delete rosterPosted[d]; });
}

// What's different on `date` for `side` ('foh' | 'boh') from the posted schedule.
function rosterDayChanges(date, side){
  const posted = (rosterPosted[date] || {})[side];
  if(!posted) return [];
  const now = rcImported((side === 'foh' ? fohRoster : bohRoster)[date]);
  const before = new Map(posted.map(p => [rcKey(p), p]));
  const after = new Map(now.map(p => [rcKey(p), p]));
  let off = posted.filter(p => !after.has(rcKey(p)));
  let on = now.filter(p => !before.has(rcKey(p)));
  const changes = [];
  // Someone off and someone on for the same hours: a swap.
  on = on.filter(p=>{
    const i = off.findIndex(o => rcSpan(o) === rcSpan(p));
    if(i === -1) return true;
    changes.push({kind: 'swap', name: p.name, for: off[i].name, span: rcSpan(p)});
    off.splice(i, 1);
    return false;
  });
  on.forEach(p => changes.push({kind: 'on', name: p.name, span: rcSpan(p)}));
  off.forEach(p => changes.push({kind: 'off', name: p.name, span: rcSpan(p)}));
  now.forEach(p=>{
    const b = before.get(rcKey(p));
    if(b && rcSpan(b) !== rcSpan(p)) changes.push({kind: 'time', name: p.name, span: rcSpan(p), was: rcSpan(b)});
  });
  return changes;
}

// Who is off on `date` for `side`: off the roster since it was posted, or
// swapped out. Lowercased names. Kept until the roster or the posted
// schedule changes, since every spot on the page asks.
const rcOffMemo = new Map();
function rosterOffNames(date, side){
  const k = side + '||' + date;
  const roster = (side === 'foh' ? fohRoster : bohRoster)[date], posted = (rosterPosted[date] || {})[side];
  const hit = rcOffMemo.get(k);
  if(hit && hit.roster === roster && hit.posted === posted && hit.len === (roster || []).length) return hit.off;
  const off = new Set();
  rosterDayChanges(date, side).forEach(c => off.add(String(c.kind === 'swap' ? c.for : c.kind === 'off' ? c.name : '').trim().toLowerCase()));
  off.delete('');
  rcOffMemo.set(k, {roster, posted, len: (roster || []).length, off});
  return off;
}
function rosterIsOff(date, side, name){
  return rosterOffNames(date, side).has(String(name || '').trim().toLowerCase());
}

// The spots on `date` held by someone who's off, in daypart and priority
// order: [{dp, slot}].
function rosterSpotsToFix(date, side){
  if(!rosterOffNames(date, side).size) return [];
  const posMap = side === 'foh' ? fohPositions : bohPositions;
  const out = [];
  suDaypartsFor(side).forEach(dp => (posMap[dp.name] || []).forEach(slot => {
    const v = posAssignments[`${side}||${date}||${dp.name}||${slot}`];
    if(v && suSplitNames(v).some(n => rosterIsOff(date, side, n))) out.push({dp: dp.name, slot});
  }));
  return out;
}

const RC_ICON_WARN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/></svg>';

// Above the cards, only when there's something to fix; a tap opens the first.
function rosterFixChipHtml(side, date){
  const n = rosterSpotsToFix(date, side).length;
  if(!n) return '';
  return `<button type="button" class="su-rowchip su-chip-fix" data-rc-fix="1">${RC_ICON_WARN}<span>${n} spot${n === 1 ? '' : 's'} to fix${esLine('N spots to fix', n)}</span></button>`;
}
