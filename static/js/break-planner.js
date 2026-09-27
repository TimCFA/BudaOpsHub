// ===== BREAK & TASK PLANNER (TIM-44) =====
// Tim's break policy:
//  - Everyone working 6 hours or more gets a break; breaks are 30 minutes,
//    unpaid. (Nothing special for minors for now.)
//  - Ideally around the middle of the shift; earlier is better than later.
//  - No breaks 10:00–10:30 or 12:00–1:00.
// On top of that the planner keeps breaks out of the busiest hours (from the
// uploaded productivity report when there is one — sales per labor hour by
// hour of day), and keeps two Team Leaders from being off together.
// Tim: up to 2 people on break at once (per side), always staggered by
// 10–15 minutes, so there's never more than a 15-minute wait for someone to
// return if the business needs break running paused.
//
// Recurring tasks (restrooms, lemonades, trash, restock) get default times in
// the quieter windows, using Tim's durations.

const BREAK_MIN_SHIFT = 360;        // minutes on the floor that earn a break
const BREAK_LEN = 30;
const BREAK_BLACKOUTS = [[600, 630], [720, 780]];   // 10:00–10:30, 12:00–1:00
const BREAK_EDGE = 120;             // not in someone's first or last 2 hours
const BREAK_STEP = 15;
const BREAK_MAX_OFF = 2;            // people on break at once, per side
const BREAK_MIN_STAGGER = 10;       // overlapping breaks start at least this far apart

// When there's no productivity upload yet: lunch and dinner are the rushes.
const BREAK_DEFAULT_BUSY = {11: 0.8, 12: 1, 13: 0.7, 16: 0.5, 17: 0.8, 18: 0.9, 19: 0.6};

// Default task times (FOH), in the quieter windows around the rushes. Tim's
// durations; the times are a starting point for him to adjust.
const SHIFT_TASKS = [
  {at: 480, name: 'Restroom check', mins: '10–15 min'},
  {at: 570, name: 'Lemonades for lunch', mins: '15–20 min'},
  {at: 600, name: 'Restrooms — full reset', mins: '20–30 min'},
  {at: 615, name: 'Trash reset', mins: '5–10 min (+5 to the dumpster)'},
  {at: 840, name: 'Restrooms — full reset', mins: '20–30 min'},
  {at: 855, name: 'Restock', mins: '15–30 min'},
  {at: 885, name: 'Trash to the dumpster', mins: '10–15 min'},
  {at: 915, name: 'Lemonades for dinner', mins: '15–20 min'},
  {at: 1230, name: 'Restrooms — full reset', mins: '20–30 min'},
  {at: 1245, name: 'Trash reset', mins: '5–10 min (+5 to the dumpster)'},
  {at: 1260, name: 'Restock for tomorrow', mins: '15–30 min'}
];

let productivityProfiles = {};   // {Tuesday: {hours: {hourMin: {prod, labor, salesPerDay}}, file, at}, ...}

function breakWeekday(date){
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'long'});
}

// The productivity profile for a date's weekday: that day, else the closest
// kind of day (Mon–Thu or Fri–Sat), else any.
function breakProfileFor(date){
  const profiles = productivityProfiles || {};
  const day = breakWeekday(date);
  if(profiles[day]) return {day, ...profiles[day]};
  if(profiles.All) return {day: 'All', ...profiles.All};
  const weekend = ['Friday', 'Saturday'];
  const same = Object.keys(profiles).find(d => weekend.includes(d) === weekend.includes(day));
  const any = same || Object.keys(profiles)[0];
  return any ? {day: any, ...profiles[any]} : null;
}

// 0 (quiet) – 1 (busiest) for each hour of the day.
function breakBusyByHour(date){
  const prof = breakProfileFor(date);
  const busy = {};
  if(prof && prof.hours){
    // Open hours only (6 AM–9 PM): the near-empty first and last hours
    // would otherwise make every daytime hour look equally busy.
    const vals = Object.entries(prof.hours).filter(([h, v]) => v.prod != null && +h >= 360 && +h <= 1260);
    const nums = vals.map(([, v]) => v.prod);
    const lo = Math.min(...nums), hi = Math.max(...nums);
    vals.forEach(([h, v]) => { busy[Math.floor(h / 60)] = hi > lo ? (v.prod - lo) / (hi - lo) : 0; });
    return {busy, source: prof.day};
  }
  for(let h = 5; h <= 23; h++) busy[h] = BREAK_DEFAULT_BUSY[h] || 0.2;
  return {busy, source: null};
}

// Everyone owed a break on this date and side, with a planned time.
// Returns {breaks: [{name, start, end, from, to, leader, warn}], source}.
function planBreaks(section, date){
  const roster = suRosterFor(section, date);
  const {busy, source} = breakBusyByHour(date);
  const people = roster.map(entry=>{
    const blocks = suShiftBlocks(entry);
    const onFloor = blocks.reduce((n, [s, e]) => n + (e - s), 0);
    if(!blocks.length) return null;
    return {name: entry.name, leader: !!entry.leader, blocks, onFloor, from: Math.min(...blocks.map(b => b[0])), to: Math.max(...blocks.map(b => b[1]))};
  }).filter(Boolean);

  const breaks = [];
  const offAt = t => breaks.filter(b => b.start <= t && t < b.end);

  people.filter(p => p.onFloor >= BREAK_MIN_SHIFT)
    .sort((a, b) => a.from - b.from || a.name.localeCompare(b.name))
    .forEach(p=>{
      const mid = p.from + (p.to - p.from) / 2;
      const options = [];
      p.blocks.forEach(([s, e])=>{
        for(let t = Math.max(s, p.from + BREAK_EDGE); t + BREAK_LEN <= Math.min(e, p.to - BREAK_EDGE + BREAK_LEN); t += BREAK_STEP){
          if(BREAK_BLACKOUTS.some(([bs, be]) => t < be && t + BREAK_LEN > bs)) continue;
          let cost = t < mid ? (mid - t) / 60 : (t - mid) / 60 * 1.6;   // sooner beats later
          cost += (busy[Math.floor(t / 60)] || 0) * 3 + (busy[Math.floor((t + BREAK_LEN - 1) / 60)] || 0) * 1.5;
          // Never two starting together: the second waits 10–15 minutes.
          let full = breaks.some(b => b.start !== null && Math.abs(b.start - t) < BREAK_MIN_STAGGER);
          for(let m = t; m < t + BREAK_LEN; m += BREAK_STEP){
            const off = offAt(m);
            if(off.length >= BREAK_MAX_OFF) full = true;
            if(p.leader && off.some(o => o.leader)) cost += 3;
            cost += off.length * 0.4;
          }
          if(full) cost += 100;
          options.push({t, cost, full});
        }
      });
      options.sort((a, b) => a.cost - b.cost || a.t - b.t);
      const best = options[0];
      if(!best){
        breaks.push({name: p.name, leader: p.leader, from: p.from, to: p.to, start: null, end: null, warn: 'no time fits outside the no-break windows'});
        return;
      }
      breaks.push({name: p.name, leader: p.leader, from: p.from, to: p.to, start: best.t, end: best.t + BREAK_LEN, warn: best.full ? 'more people off than usual at this time' : ''});
    });
  breaks.sort((a, b) => (a.start ?? 9999) - (b.start ?? 9999) || a.name.localeCompare(b.name));
  return {breaks, source};
}

// One plan per render (the board, the roster list and print all ask).
let breakPlanCache = {};
function breakPlanFor(section, date){
  const k = section + '||' + date;
  if(!breakPlanCache[k]) breakPlanCache[k] = planBreaks(section, date);
  return breakPlanCache[k];
}
function breakPlanReset(){ breakPlanCache = {}; }

function breakFor(section, date, name){
  const lo = String(name).trim().toLowerCase();
  return breakPlanFor(section, date).breaks.find(b => b.name.trim().toLowerCase() === lo) || null;
}

// The spot someone is working when their break starts (so a leader knows
// what needs covering).
function breakSpotFor(section, date, name, t){
  const dayparts = suDaypartsFor(section);
  const posMap = section === 'foh' ? fohPositions : bohPositions;
  const lo = name.trim().toLowerCase();
  for(let i = 0; i < dayparts.length; i++){
    const {startMin, endMin} = daypartTimeWindow(dayparts, i);
    if(t < startMin || t >= endMin) continue;
    const key = suEvalKey(section, date, dayparts[i].name);
    if(section === 'foh' && lo === String(posAssignments[key + '||' + SU_LEAD_CAPTAIN] || '').trim().toLowerCase()) return 'Lead Captain';
    const slot = (posMap[dayparts[i].name] || []).find(s => suSplitNames(posAssignments[key + '||' + s]).some(n => n.toLowerCase() === lo));
    if(slot) return slot;
  }
  return null;
}

// Breaks and tasks for one daypart, for the Set Ups board.
function suBreaksCardHtml(section, date, dpIndex){
  const {startMin, endMin} = daypartTimeWindow(suDaypartsFor(section), dpIndex);
  const plan = breakPlanFor(section, date);
  const here = plan.breaks.filter(b => b.start !== null && b.start >= startMin && b.start < endMin);
  const unplanned = plan.breaks.filter(b => b.start === null && b.from < endMin && b.to > startMin);
  const tasks = section === 'foh' ? SHIFT_TASKS.filter(t => t.at >= startMin && t.at < endMin) : [];
  if(!here.length && !unplanned.length && !tasks.length) return '';
  const breakRows = here.map(b=>{
    const spot = breakSpotFor(section, date, b.name, b.start);
    return `<li><span class="su-bt-time">${suClock(b.start)}</span><span class="su-bt-what"><b>${escapeHtml(suDisplayName(b.name))}</b>${b.leader ? ' <span class="su-row-role">TL</span>' : ''}${spot ? ` · cover ${escapeHtml(spot)}` : ''}${b.warn ? ` <em>· ${escapeHtml(b.warn)}</em>` : ''}</span></li>`;
  }).join('');
  const taskRows = tasks.map(t => `<li><span class="su-bt-time">${suClock(t.at)}</span><span class="su-bt-what">${escapeHtml(t.name)} <em>· ${escapeHtml(t.mins)}</em></span></li>`).join('');
  return `
    <section class="su-bt" aria-label="Breaks and tasks">
      <h3>Breaks &amp; tasks</h3>
      ${here.length ? `<ul class="su-bt-list">${breakRows}</ul>` : '<p class="su-bt-none">No breaks start this daypart.</p>'}
      ${unplanned.map(b => `<p class="su-bt-warn">${escapeHtml(suDisplayName(b.name))} is owed a break — ${escapeHtml(b.warn)}.</p>`).join('')}
      ${tasks.length ? `<h4>Tasks</h4><ul class="su-bt-list is-tasks">${taskRows}</ul>` : ''}
      <p class="su-bt-foot">30-minute breaks for shifts of 6+ hours, nearer the middle (earlier over later), none 10–10:30 or 12–1, up to 2 off at once and staggered so the next person is back within 15 minutes${plan.source ? `, steered by the ${escapeHtml(plan.source)} productivity report` : ''}.</p>
    </section>`;
}
