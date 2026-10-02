// ===== SHIFT CHANGES (swaps since the schedule was posted) =====
// The team swaps a lot of shifts in HotSchedules, and the roster is synced
// again (Ops Hub Sync) to pick them up. A sync replaces each day's imported
// roster, so on its own nobody would see what changed. So the first time a
// day that already has an imported roster is synced again, the roster it had
// is kept as that day's posted schedule (rosterPosted). Set Ups then shows
// the difference for the day on screen:
//   swap  — one person off and another on for the same hours
//   on    — added
//   off   — no longer scheduled (and where they're still placed, if anywhere)
//   time  — same person, different hours
// Only imported people count; ones added by hand (source: 'manual') are the
// leader's own changes. Past days are pruned after a week.

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

// Before a day's roster is replaced by an import: keep what it had as the
// posted schedule, unless it already has one (or has no imported roster yet,
// i.e. this is the week's first import).
function rosterNotePosted(date, side, currentList){
  if(date < today) return;
  const day = rosterPosted[date] || {};
  if(day[side]) return;
  const before = rcImported(currentList);
  if(!before.length) return;
  day[side] = before.map(p => {
    const slim = {name: p.name, start: p.start, end: p.end};
    if(p.blocks && p.blocks.length > 1) slim.blocks = p.blocks.map(b => ({start: b.start, end: b.end}));
    return slim;
  });
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

// Where someone is still placed on `date` (positions and Lead Captain), e.g.
// ['iPOS 1 · Lunch'].
function rosterPlacedAt(date, side, name){
  const prefix = `${side}||${date}||`, who = String(name).trim().toLowerCase();
  const out = [];
  Object.keys(posAssignments).forEach(k=>{
    if(!k.startsWith(prefix)) return;
    if(!suSplitNames(posAssignments[k]).some(n => n.toLowerCase() === who)) return;
    const [dp, slot] = k.slice(prefix.length).split('||');
    out.push(`${slot} · ${suShortDaypart(dp)}`);
  });
  return out;
}

function rosterChangesHtml(side, date){
  const changes = rosterDayChanges(date, side);
  const other = side === 'foh' ? 'boh' : 'foh';
  const otherN = rosterDayChanges(date, other).length;
  if(!changes.length && !otherN) return '';
  const nm = n => `<b>${escapeHtml(suDisplayName(n))}</b>`;
  const placed = n => {
    const at = rosterPlacedAt(date, side, n);
    return at.length ? `<span class="su-changes-warn">⚠️ still placed: ${escapeHtml(at.join(', '))}</span>` : '';
  };
  const line = c => {
    if(c.kind === 'swap') return `<li><span class="su-changes-ic" aria-hidden="true">🔁</span><span>${nm(c.name)} for ${nm(c.for)} <em>${escapeHtml(c.span)}</em>${placed(c.for)}</span></li>`;
    if(c.kind === 'on') return `<li><span class="su-changes-ic" aria-hidden="true">➕</span><span>${nm(c.name)} added <em>${escapeHtml(c.span)}</em></span></li>`;
    if(c.kind === 'off') return `<li><span class="su-changes-ic" aria-hidden="true">➖</span><span>${nm(c.name)} off <em>was ${escapeHtml(c.span)}</em>${placed(c.name)}</span></li>`;
    return `<li><span class="su-changes-ic" aria-hidden="true">🕒</span><span>${nm(c.name)} now <em>${escapeHtml(c.span)}</em> <em class="su-changes-was">was ${escapeHtml(c.was)}</em></span></li>`;
  };
  return `<div class="su-changes" role="note">
    <div class="su-changes-head">Shift changes <span>since the schedule was posted</span></div>
    ${changes.length ? `<ul>${changes.map(line).join('')}</ul>` : ''}
    ${otherN ? `<div class="su-changes-other">${otherN} ${other.toUpperCase()} change${otherN === 1 ? '' : 's'} — switch to ${other.toUpperCase()} to see ${otherN === 1 ? 'it' : 'them'}</div>` : ''}
  </div>`;
}
