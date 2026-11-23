// ===== RIGHT NOW (Tim, Oct 19 2026) =====
// Home opens on the welcome banner and the quote: culture first, always
// (Tim). Under it, this card: what matters this minute, for whoever is
// holding the phone. Who that is comes from the sign-in (accounts.js
// acUser, launch-mode.js launchManager):
//  - Team Member: their spot now, next and later today, their shift, the
//    zone they reset at the coming handoff, the tickets handed to them on
//    the Tasks tab, their own PEA scores, and the day's marketing events
//    (Tim, Oct 28 2026: "what all they need to see"; no break or waste line).
//    On break, the time left counts down first thing (Tim, Oct 30 2026).
//  - Trainer: the same, plus the open spots on their side now.
//  - Team Lead: their side's shift: open spots, people on the floor with no
//    spot, the handoff's zones, breaks coming up, waste, Food Safety.
//  - Admin Team (Ashley, Oct 20 2026): the day's roster at a glance, FOH,
//    BOH, truck and admin, who's on now and who's in next, in a panel of
//    its own above the rest (Tim, Oct 20 2026: easier to notice). The
//    headcount, permits and last to leave are Our Team's, not right-now
//    items, so they stay on that page.
//  - Director (or the manager PIN): the whole store now, the rest of the
//    day, the leaders on, tomorrow's Set Ups, waste, Food Safety, and the
//    day's roster a tap away.
//  - A phone nobody signed in on: the day's marketing events and a way to
//    sign in (Tim, Oct 28 2026: no leader numbers before sign-in). The
//    kitchen iPad's side keeps its prep, breaks and Food Safety.
// Nov 18 2026 (Tim): Home is one glance at your own day, every line a tap
// to where it lives. Vision, Mission and Values and the Leadership Wins left
// Home. A Team Member and a Trainer also see who's leading the shift. A Team
// Lead sees the tickets waiting on them (or a well done) and no waste or
// Food Safety line. A director (and the Admin Team, the same card for now)
// sees how many people FOH and BOH each have for the daypart, the breaks
// left in each house (AM shifts' until 1 PM, then PM), the tickets waiting
// on them, and the rest folded under "More about today". The signed-out
// Front card shows the counter timers due.
// Nov 20 2026 (Tim): someone in their first 30 days gets a new hire's card
// (rnNewHireCard).
// Nov 21 2026 (Tim: "more dynamic and engaging"): the look, further down
// ("The look"). The welcome above carries the person's name (rnGreet), so
// the card has no greeting of its own; the day's events are quiet lines.
// It reads only what that phone already has (a team PIN never reads the
// private sections), and every row opens the screen that fixes it. On the
// kitchen's side the lines carry Spanish; FOH stays English.

const RN_ICON_TEAM = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.8-3.2 3.2-5 6-5s5.2 1.8 6 5"/><path d="M16 5.2a3 3 0 0 1 0 5.6"/><path d="M17.5 14.2c1.8.6 3 2.2 3.5 4.8"/></svg>';
const RN_ICON_GO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

function rnNowMins(){ const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }

// 14:05 → "2:05"
function rnClock(min){
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}`;
}
function rnShort(dpName){ return String(dpName || '').replace(/\s*\(.*\)\s*$/, ''); }
// End a sentence once, even after a short name ("Alyssa C.").
function rnSentence(t){ return /[.!?]$/.test(t) ? t : t + '.'; }
function rnFirst(name){ return String(name || '').trim().split(/\s+/)[0] || ''; }

// Names from the PIN list and the schedule can differ by a middle or second
// last name ("Ana Ruiz" / "Ana Ruiz Lopez"): same first name, and the
// shorter one's last name somewhere in the longer.
// Accents don't count ("José" / "Jose"), as on the Schedule tab (dirKey).
function rnSame(a, b){
  const words = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const x = words(a), y = words(b);
  if(!x.length || !y.length) return false;
  if(x.join(' ') === y.join(' ')) return true;
  if(x[0] !== y[0] || x.length < 2 || y.length < 2) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return long.slice(1).includes(short[short.length - 1]);
}

function rnViewer(){
  const role = typeof acUser !== 'undefined' && acUser ? acUser.role : '';
  if(typeof launchManager !== 'undefined' && launchManager) return {role: role === 'manager' ? 'manager' : 'director', name: (acUser && acUser.name) || ''};
  if(['lead', 'trainer', 'member', 'admin'].includes(role)) return {role, name: acUser.name || ''};
  return {role: 'none', name: ''};
}

function rnAddDays(iso, n){
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return toLocalISODate(d);
}

// The store's day: open Monday to Saturday from the first daypart to the end
// of Close. Before it opens, the first daypart is "next"; after it closes
// (and on Sunday) the card looks at the next open day.
// The store closes at 11 on Friday and Saturday, 10 the other days (CLAUDE.md;
// Tim, Oct 23 2026). The last daypart (Close) ends at 10 whatever the day, so
// the card asked it and called Friday over at 10 (Tim, Oct 30 2026: a team
// member on break at 10:45 saw Saturday instead).
const RN_LATE_DAYS = [5, 6];          // Date.getDay(): Friday, Saturday
const RN_LATE_CLOSE = 23 * 60;
function rnCloseAt(dow){
  const last = daypartTimeWindow(fohDayparts, fohDayparts.length - 1).endMin;
  return RN_LATE_DAYS.includes(dow) ? Math.max(last, RN_LATE_CLOSE) : last;
}
function rnDay(){
  const now = rnNowMins();
  const dow = new Date().getDay();
  const sunday = dow === 0;
  const last = fohDayparts[fohDayparts.length - 1];
  const closeAt = rnCloseAt(dow);
  const closed = sunday || now >= closeAt;
  let next = rnAddDays(today, 1);
  if(new Date(next + 'T12:00:00').getDay() === 0) next = rnAddDays(next, 1);
  return {now, closed, opensAt: parseDaypartTimeToMinutes(fohDayparts[0].time), closeAt, last, next};
}

// The daypart on the clock for a side today (the first one before opening).
function rnDaypartIndex(side, now){
  const dps = suDaypartsFor(side);
  let i = 0;
  dps.forEach((dp, n) => { if(parseDaypartTimeToMinutes(dp.time) <= now) i = n; });
  return i;
}

function rnRoster(side, date){
  return ((side === 'foh' ? fohRoster : bohRoster)[date]) || [];
}

// The viewer on the schedule: [{side, entry}] for the day, from all four
// schedules the Schedule tab reads. Truck and office shifts count too (Tim,
// Oct 25 2026: an office shift on Monday, and the card said he wasn't on);
// only FOH and BOH have Set Ups spots and breaks.
const RN_FLOOR = ['foh', 'boh'];
const RN_OFF_FLOOR = {truck: 'Truck', admin: 'Office'};
function rnOnRoster(name, date){
  if(!name) return [];
  const out = [];
  [...RN_FLOOR, ...Object.keys(RN_OFF_FLOOR)].forEach(side => rnRosterList(side, date).forEach(p => { if(rnSame(p.name, name)) out.push({side, entry: p}); }));
  const at = o => { const m = rnShiftStart(o.entry); return m === null ? 1440 : m; };
  return out.sort((a, b) => at(a) - at(b));
}
// "11:30a–2:30p (Office)"; FOH and BOH go without a label, as before.
function rnShiftsText(on){
  return on.map(o => rnShiftText(o.entry) + (RN_OFF_FLOOR[o.side] ? ` (${RN_OFF_FLOOR[o.side]})` : '')).join(', ');
}

// Where someone is placed on a day: [{side, dpIndex, dp, slot}] in time order.
function rnSpotsFor(names, date){
  const out = [];
  ['foh', 'boh'].forEach(side => {
    const posMap = side === 'foh' ? fohPositions : bohPositions;
    suDaypartsFor(side).forEach((dp, dpIndex) => {
      [...(posMap[dp.name] || []), SU_LEAD_CAPTAIN].forEach(slot => {
        const placed = suSplitNames(posAssignments[[side, date, dp.name, slot].join('||')]);
        if(placed.some(n => names.some(x => rnSame(n, x)))) out.push({side, dpIndex, dp, slot});
      });
    });
  });
  return out.sort((a, b) => parseDaypartTimeToMinutes(a.dp.time) - parseDaypartTimeToMinutes(b.dp.time));
}

function rnShiftText(entry){
  return (entry.blocks && entry.blocks.length > 1 ? entry.blocks : [entry]).map(b => `${b.start}–${b.end}`).join(', ');
}

function rnShiftStart(entry){
  const b = entry.blocks && entry.blocks.length ? entry.blocks[0] : entry;
  return parseShiftTimeToMinutes(b.start);
}

// The coming Zone Reset handoff (FOH): its zones, who owns them, how far along.
function rnHandoff(date){
  const name = zrCurrentHandoff();
  const h = zoneResetDayparts.find(x => x.name === name);
  if(!h) return null;
  const zones = ALL_ZONE_NAMES.map(z => {
    const c = getZoneCompletion(date, name, z);
    return {zone: z, done: c.total > 0 && c.checked === c.total, checked: c.checked, total: c.total, owners: zrZoneOwners(date, name, z).all};
  });
  return {name, title: zrHandoffParts(name).title, at: parseDaypartTimeToMinutes(h.time), zones};
}

// Breaks starting from 15 minutes ago to 30 minutes from now, not yet taken.
function rnBreaksSoon(side, now){
  const plan = typeof breakPlanFor === 'function' ? breakPlanFor(side, today) : {breaks: []};
  return (plan.breaks || []).filter(b => b.start !== null && b.start >= now - 15 && b.start <= now + 30 && !completedBreaks[breakKeyFor(b.name, today, side)])
    .sort((a, b) => a.start - b.start);
}

// The open spots, the people on the floor with no spot, for a side's daypart.
function rnDaypartGaps(side, date, dpIndex){
  const dp = suDaypartsFor(side)[dpIndex];
  const m = suDaypartModel(side, date, dp, dpIndex);
  const open = m.tiles.filter(t => t.needed);
  return {dp, m, open, unplaced: m.unplaced};
}

function rnWaste(){
  const limit = Number(wasteTarget) || 0;
  const total = wasteTodayTotal('foh') + wasteTodayTotal('boh');
  return {total, limit, over: limit > 0 && total > limit, near: limit > 0 && total >= limit * 0.8};
}
function rnMoney(n){ return n >= 100 ? '$' + Math.round(n) : '$' + n.toFixed(2).replace(/\.00$/, ''); }

function rnFoodSafety(){
  // A complete walkthrough today counts; otherwise the latest one under way.
  const rec = typeof fsRounds === 'function' ? ((fsRounds(today).find(r => r.rec.completedAt) || {}).rec || fsLatest(today)) : null;
  const t = typeof fsTotals === 'function' ? fsTotals(rec) : null;
  return t && t.total ? t : null;
}

// One row: big value, line, its Spanish (BOH), and where a tap goes.
function rnRow(n, text, es, go, tone){ return {n, text, es: es || '', go: go || '', tone: tone || ''}; }
// What the look adds to a row (Nov 21 2026): icon ('clock', 'pin'), who (a name: their initials lead the line), bar (0 to 1), note (a detail that isn't part of its sentence).
function rnWith(row, extra){ return Object.assign(row, extra); }
// The banner's parts, beside its sentence (`text` stays whole for the tests,
// the Spanish and a screen reader): a small label, the words that matter in
// big type, the detail, and its colour ('bad' needs someone, 'ok' all covered).
function rnHead(first, k, big, sub, tone){ return Object.assign(first, {k: k || '', big: big || '', sub: sub || '', tone: tone || ''}); }
// 100 → "1 h 40 min"
function rnDur(min){
  const m = Math.max(0, Math.round(min));
  return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
}
// How far through today's shift someone is: {bar, note, es, end}. A split
// shift runs from its first block to its last.
function rnShiftProgress(on, now){
  const spans = on.flatMap(o => (o.entry.blocks && o.entry.blocks.length ? o.entry.blocks : [o.entry]).map(b => [parseShiftTimeToMinutes(b.start), parseShiftTimeToMinutes(b.end)]))
    .filter(([s, e]) => s !== null && e !== null).map(([s, e]) => [s, e <= s ? e + 1440 : e]);
  if(!spans.length) return null;
  const start = Math.min(...spans.map(x => x[0])), end = Math.max(...spans.map(x => x[1]));
  if(now < start) return {bar: 0, end, note: `starts in ${rnDur(start - now)}`, es: esText('Starts in TIME', rnDur(start - now))};
  if(now >= end) return {bar: 1, end, note: 'done for today', es: esText('Done for today')};
  return {bar: (now - start) / (end - start), end, note: `${rnDur(end - now)} left`, es: esText('TIME left', rnDur(end - now))};
}

// ----- Per role -----
function rnPersonCard(v, day, trainer){
  const date = day.closed ? day.next : today;
  const on = rnOnRoster(v.name, date);
  const floor = on.filter(o => RN_FLOOR.includes(o.side));
  const side = floor.length ? floor[0].side : 'foh';
  const names = [v.name, ...on.map(o => o.entry.name)];
  const spots = rnSpotsFor(names, date);
  const rows = [];
  let first = null;
  const first1 = rnFirst(v.name);

  if(day.closed){
    const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'long'});
    if(!on.length){
      first = {text: `You’re not on ${dayName}’s schedule.`, es: esText('Not on the schedule')};
    } else {
      const s = spots[0];
      first = s
        ? {text: `${dayName}: ${s.slot} at ${rnShort(s.dp.name)}.`, es: esText('Next: SPOT at DP', esPlace(s.slot) || s.slot, esDaypart(s.dp.name)), go: `setups:${s.side}|${date}|${s.dp.name}`}
        : {text: `${dayName}: your shift is ${rnShiftsText(on)}.${floor.length ? ' No spot yet.' : ''}`, es: esText('Your shift starts at TIME', rnShiftText(on[0].entry))};
      rnHead(first, s ? `${dayName} · you’re on` : `${dayName} · your shift`, s ? s.slot : rnShiftsText(on), s ? `at ${rnShort(s.dp.name)}` : floor.length ? 'No spot yet' : '');
      rows.push(rnWith(rnRow('', `Your shift ${dayName}: ${rnShiftsText(on)}`, esText('Your shift'), `myweek:${date}`), {icon: 'clock'}));
      spots.forEach(x => rows.push(rnRow(rnClock(parseDaypartTimeToMinutes(x.dp.time)), `${x.slot} at ${rnShort(x.dp.name)}`, esPlace(x.slot), `setups:${x.side}|${date}|${x.dp.name}`)));
    }
    return {side, first, rows, team: true, kicker: `${dayName}`, title: `Hi, ${first1}`};
  }

  const entry = floor.length ? floor[0].entry : null;   // breaks and spots are the floor's
  const starts = on.map(o => rnShiftStart(o.entry)).filter(m => m !== null);
  const startsAt = starts.length ? Math.min(...starts) : null;
  const offFloor = !floor.length && on.length ? on[0] : null;
  const nowSpot = spots.find(s => s.dpIndex === rnDaypartIndex(s.side, day.now) && parseDaypartTimeToMinutes(s.dp.time) <= day.now);
  const nextSpot = spots.find(s => parseDaypartTimeToMinutes(s.dp.time) > day.now);
  const hand = side === 'foh' ? rnHandoff(today) : null;
  const myZones = hand ? hand.zones.filter(z => z.owners.some(o => names.some(n => rnSame(o, n)))) : [];
  // On break: when it ends (a leader started it on Set Ups; it reaches this
  // phone with the next sync).
  const brkUntil = entry ? Number(breakCountdowns[breakKeyFor(entry.name, today, side)]) || 0 : 0;
  const onBreak = brkUntil > serverNow();
  let nowFirst = false;
  const prog = on.length ? rnShiftProgress(on, day.now) : null;   // how far through today's shift

  if(!on.length && !spots.length){
    first = {text: 'You’re not on today’s schedule.', es: esText('Not on the schedule')};
  } else if(onBreak){
    const back = rnClock(day.now + Math.round((brkUntil - serverNow()) / 60000));
    first = {text: `On break, back at ${back}.`, es: esText('On break, back at TIME', back), until: brkUntil, back};
    rnHead(first, 'On break', '', `back at ${back}`);
  } else if(myZones.some(z => !z.done) && day.now >= hand.at - 30){
    const z = myZones.find(x => !x.done);
    first = {text: `Reset ${z.zone} for the ${hand.title} handoff (${z.checked} of ${z.total} done).`, go: `zone:${hand.name}`};
    rnHead(first, 'Reset your zone', z.zone, `for the ${hand.title} handoff · ${z.checked} of ${z.total} done`, 'bad');
    first.bar = z.total ? z.checked / z.total : 0;
  } else if(nowSpot){
    nowFirst = true;
    const end = daypartTimeWindow(suDaypartsFor(nowSpot.side), nowSpot.dpIndex).endMin;
    first = {text: `You’re on ${nowSpot.slot} until ${rnClock(end)}.`, es: esText('You are on SPOT until TIME', esPlace(nowSpot.slot) || nowSpot.slot, rnClock(end)), go: `setups:${nowSpot.side}|${today}|${nowSpot.dp.name}`};
    rnHead(first, 'You’re on', nowSpot.slot, `until ${rnClock(end)}`);
    const began = parseDaypartTimeToMinutes(nowSpot.dp.time);
    if(end > began) first.bar = (day.now - began) / (end - began);   // how far through the daypart
  } else if(startsAt !== null && startsAt > day.now){
    first = {text: `Your shift starts at ${rnClock(startsAt)}${nextSpot ? `, on ${nextSpot.slot}` : ''}.`, es: esText('Your shift starts at TIME', rnClock(startsAt))};
    rnHead(first, 'Your shift starts at', rnClock(startsAt), [nextSpot ? `on ${nextSpot.slot}` : '', `in ${rnDur(startsAt - day.now)}`].filter(Boolean).join(' · '));
  } else if(prog && prog.bar === 1){
    // Their shift is over (it used to say "No spot yet, check with your leader": Nov 21 2026).
    const at = rnClock(prog.end % 1440);
    first = {text: `You’re done for today. Your shift ended at ${at}.`, es: esText('Done for today, shift ended at TIME', at)};
    rnHead(first, `Your shift ended at ${at}`, 'Done for today', 'Thank you for today.', 'ok');
  } else if(offFloor && !spots.length){
    first = {text: `Your ${RN_OFF_FLOOR[offFloor.side]} shift today: ${rnShiftText(offFloor.entry)}.`};
    rnHead(first, `Your ${RN_OFF_FLOOR[offFloor.side]} shift today`, rnShiftText(offFloor.entry), '');
  } else {
    const dp = suDaypartsFor(side)[rnDaypartIndex(side, day.now)];
    first = {text: `No spot yet for ${rnShort(dp.name)}. Check with your leader.`, es: esText('No spot yet for DP', esDaypart(dp.name)), go: `setups:${side}|${today}|${dp.name}`};
    rnHead(first, `No spot yet for ${rnShort(dp.name)}`, 'Check with your leader', '', 'bad');
  }

  if(nowSpot && !nowFirst) rows.push(rnWith(rnRow('', `Now: ${nowSpot.slot} (${rnShort(nowSpot.dp.name)})`, esText('Your spot now') + (esPlace(nowSpot.slot) ? ': ' + esPlace(nowSpot.slot) : ''), `setups:${nowSpot.side}|${today}|${nowSpot.dp.name}`), {icon: 'pin'}));
  if(nextSpot) rows.push(rnRow(rnClock(parseDaypartTimeToMinutes(nextSpot.dp.time)), `Next: ${nextSpot.slot} (${rnShort(nextSpot.dp.name)})`, esText('Next spot') + (esPlace(nextSpot.slot) ? ': ' + esPlace(nextSpot.slot) : ''), `setups:${nextSpot.side}|${today}|${nextSpot.dp.name}`));
  // Every spot after that today, so the whole day's Set Ups are here.
  spots.filter(x => x !== nextSpot && parseDaypartTimeToMinutes(x.dp.time) > day.now).forEach(x =>
    rows.push(rnRow(rnClock(parseDaypartTimeToMinutes(x.dp.time)), `Later: ${x.slot} (${rnShort(x.dp.name)})`, esText('Later spot') + (esPlace(x.slot) ? ': ' + esPlace(x.slot) : ''), `setups:${x.side}|${today}|${x.dp.name}`)));
  // A tap opens the Schedule on their week (Tim, Oct 28 2026).
  if(on.length){
    // How far through it they are: a bar, and the time left (Tim, Nov 21 2026).
    rows.push(rnWith(rnRow('', `Your shift: ${rnShiftsText(on)}`, esText('Your shift') + (prog ? ' · ' + prog.es : ''), `myweek:${today}`), {icon: 'clock', ...(prog ? {bar: prog.bar, note: prog.note} : {})}));
  }
  // Who's leading the shift (Tim, Nov 18 2026): the Lead Captain on Set Ups
  // for the daypart on the clock, on their side. Not when that's them.
  if(floor.length){
    const lead = rnLeading(side, today, rnDaypartIndex(side, day.now)).filter(n => !names.some(x => rnSame(n, x)));
    const dpNow = suDaypartsFor(side)[rnDaypartIndex(side, day.now)];
    if(lead.length) rows.push(rnWith(rnRow('', `Leading the shift: ${lead.map(suDisplayName).join(', ')}`, esText('Leading the shift'), `setups:${side}|${today}|${dpNow.name}`), {who: lead[0]}));
  }
  myZones.forEach(z => rows.push(rnRow(`${z.checked}/${z.total}`, `your zone: ${z.zone} · ${hand.title} at ${rnClock(hand.at)}`, '', `zone:${hand.name}`, z.done ? 'ok' : '')));
  rnTicketRows(day).forEach(r => rows.push(r));
  if(trainer && entry){
    const g = rnDaypartGaps(side, today, rnDaypartIndex(side, day.now));
    rows.push(rnRow(String(g.open.length), `open spot${g.open.length === 1 ? '' : 's'} on ${side.toUpperCase()} for ${rnShort(g.dp.name)}`, esText('Open spots now'), g.open.length ? `spot:${side}|${g.dp.name}|${g.open[0].slot}` : `setups:${side}|${today}|${g.dp.name}`, g.open.length ? 'bad' : 'ok'));
  }
  return {side, first, rows, team: true, title: `Hi, ${first1}`, pea: rnMine.pea && rnMine.pea.positions && rnMine.pea.positions.length ? rnMine.pea : null};
}

// The Lead Captain(s) on Set Ups for a side's daypart.
function rnLeading(side, date, dpIndex){
  const dp = suDaypartsFor(side)[dpIndex];
  return dp ? suSplitNames(posAssignments[[side, date, dp.name, SU_LEAD_CAPTAIN].join('||')]) : [];
}

// ----- Mine: my tickets and my PEA (Tim, Oct 28 2026) -----
// Read for a signed-in Team Member or Trainer, at most every RN_MINE_EVERY
// while Home is up: the tickets handed to them on the Tasks tab (pass.js;
// the server sends a team member only their own) and their own PEA scores
// (app.py /api/me/pea: only theirs, never anyone else's). Until they're in,
// or offline, the card simply doesn't have those lines.
const RN_MINE_EVERY = 5 * 60 * 1000;
const RN_TICKETS_SHOWN = 4;
// Leaders (Team Leads, the Admin Team, directors and the shared PINs) get
// their tickets too, as one count (Tim, Nov 18 2026); the PEA scores are a
// Team Member's and a Trainer's.
let rnMine = {who: '', at: 0, pea: null, tickets: null, counts: null};
const RN_MINE_NONE = () => ({who: '', at: 0, pea: null, tickets: null, counts: null});
function rnMineLoad(){
  if(typeof fetch !== 'function') return;
  const v = rnViewer();
  const team = ['member', 'trainer'].includes(v.role);
  // The shared PINs carry no name: one key for whoever holds the PIN.
  const who = v.role === 'none' ? '' : team || v.name ? v.name : '(' + v.role + ')';
  if(!who){ if(rnMine.who) rnMine = RN_MINE_NONE(); return; }
  if(rnMine.who === who && Date.now() - rnMine.at < RN_MINE_EVERY) return;
  if(rnMine.who !== who) rnMine = {...RN_MINE_NONE(), who};
  rnMine.at = Date.now();
  const get = url => fetch(url, {credentials: 'same-origin', cache: 'no-store'}).then(r => (r.ok ? r.json() : null)).catch(() => null);
  Promise.all([team ? get('/api/me/pea') : null, get('/api/pass/state')]).then(([pea, pass]) => {
    if(rnMine.who !== who) return;
    rnMine.pea = pea && Array.isArray(pea.positions) ? pea : null;
    rnMine.tickets = pass ? rnTicketsFrom(pass) : null;
    rnMine.counts = pass ? rnTicketCounts(pass) : null;
    const home = document.getElementById('homeView');
    if(home && home.classList.contains('active')) renderRightNow();
  });
}
// Open tickets I own, in the order they need me: say it back, late, a
// check-in due, working, waiting on a new time, turned in.
function rnTicketsFrom(pass){
  if(typeof PassEngine === 'undefined' || !pass.me || !Array.isArray(pass.events)) return [];
  const E = PassEngine, now = Date.now(), rank = {say: 0, late: 1, checkin: 2, working: 3, counter: 4, turned: 5};
  return Object.values(E.fold(pass.events)).filter(t => t.owner === pass.me.id && E.OPEN.includes(t.status)).map(t => {
    const r = E.derive(t, now);
    const state = t.status === 'delegated' ? 'say' : t.status === 'negotiating' ? 'counter' : t.status === 'submitted' ? 'turned' : r.late ? 'late' : r.checkinDue ? 'checkin' : 'working';
    return {id: t.id, title: t.title, due: t.due, state};
  }).sort((a, b) => rank[a.state] - rank[b.state] || a.due - b.due);
}
// A leader's open tickets, by whose move it is (pass-engine.js derive's
// actor): mine to do, mine to approve (turned in, or a new time asked for),
// and the ones out with the team. `late`: one of mine to do is past due.
function rnTicketCounts(pass){
  if(typeof PassEngine === 'undefined' || !pass.me || !Array.isArray(pass.events)) return null;
  const E = PassEngine, now = Date.now(), me = pass.me.id, c = {todo: 0, approve: 0, out: 0, late: false};
  Object.values(E.fold(pass.events)).filter(t => E.OPEN.includes(t.status) && (t.owner === me || t.delegator === me)).forEach(t => {
    const r = E.derive(t, now);
    if(r.actor !== me) { if(t.delegator === me) c.out++; return; }
    if(t.owner === me){ c.todo++; if(r.late) c.late = true; } else c.approve++;
  });
  return c;
}
// One row for a leader: what's waiting on them, or a well done when nothing
// is (Tim, Nov 18 2026). Nothing until the tickets are in.
function rnLeaderTicketRow(boh){
  const c = rnMine.counts;
  if(!c) return null;
  const waiting = c.todo + c.approve;
  const out = c.out ? `${c.out} out with the team` : '';
  if(!waiting){
    return rnRow('0', c.out ? `Nothing waiting on you · ${out}` : 'No open tickets. Nicely done.', boh ? esText(c.out ? 'Nothing waiting on you' : 'No open tickets, nicely done') : '', 'tickets', 'ok');
  }
  const parts = [c.todo ? `${c.todo} to do` : '', c.approve ? `${c.approve} to approve` : '', out].filter(Boolean);
  return rnRow(String(waiting), `ticket${waiting === 1 ? '' : 's'} waiting on you: ${parts.join(' · ')}`, boh ? esText('Tickets waiting on you') : '', 'tickets', c.late ? 'bad' : 'warn');
}

function rnDueText(ts){
  const d = new Date(ts), iso = toLocalISODate(d), min = d.getHours() * 60 + d.getMinutes();
  if(iso === today) return rnClock(min);
  return d.toLocaleDateString('en-US', {weekday: 'short'});
}
function rnTicketRows(day){
  const list = rnMine.tickets || [];
  const hint = {say: ['say it back', 'Say it back'], late: ['late', 'Late'], checkin: ['check-in due', 'Check-in due'], working: ['', ''], counter: ['waiting on a new time', 'Waiting on a new time'], turned: ['turned in', 'Turned in']};
  const rows = list.slice(0, RN_TICKETS_SHOWN).map(t => {
    const [h, key] = hint[t.state];
    const n = t.state === 'late' ? 'Late' : t.state === 'turned' ? '' : rnDueText(t.due);
    const tone = t.state === 'late' ? 'bad' : t.state === 'say' || t.state === 'checkin' ? 'warn' : t.state === 'turned' ? 'ok' : '';
    return rnRow(n, `ticket: ${t.title}${h ? ' · ' + h : ''}`, esText('Your ticket') + (key ? ' · ' + esText(key) : ''), `ticket:${t.id}`, tone);
  });
  if(list.length > RN_TICKETS_SHOWN) rows.push(rnRow(`+${list.length - RN_TICKETS_SHOWN}`, 'more tickets on the Tasks tab', esText('More tickets'), 'tickets', ''));
  return rows;
}
function rnPeaHtml(pea, boh){
  if(!pea) return '';
  const es = t => boh && t ? esSpan(t, false) : '';
  return `<section class="rn-pea" aria-label="Your PEA scores">
      <div class="rn-pea-head"><span>${RN_SEC_ICONS.pea}Your PEA${es(esText('Your PEA'))}</span><small>latest ${PEA_RECENT_RATINGS_RN} ratings per position${es(esText('Latest ratings per position'))}</small></div>
      <div class="rn-pea-grid">${pea.positions.map(p => `<div class="rn-pea-cell is-${escapeHtml(p.tier)}" title="${escapeHtml(`${p.total} rating${p.total === 1 ? '' : 's'}, last ${p.last}`)}">
          <span>${escapeHtml(p.position)}</span><b>${escapeHtml(Number(p.avg).toFixed(2))}</b><small>${escapeHtml(p.tierLabel)}${es(esText(p.tierLabel))}</small></div>`).join('')}</div>
    </section>`;
}
const PEA_RECENT_RATINGS_RN = 5;   // pea_mine.py RECENT, pea-ratings.js PEA_RECENT_RATINGS

// A director's requests for their time, waiting on an answer (week.js,
// Directors' Week on the Calendar tab; Tim, Nov 18 2026): the first row.
function rnWeekRows(){
  const n = typeof dwPendingCount === 'function' ? dwPendingCount() : 0;
  return n ? [rnRow(String(n), `request${n === 1 ? '' : 's'} for your time waiting on you`, '', 'week', 'bad')] : [];
}
function rnLeadCard(v, day, store){
  const on = v.name ? rnOnRoster(v.name, today) : [];
  const onFloor = on.filter(o => RN_FLOOR.includes(o.side));
  const sides = store || !onFloor.length ? ['foh', 'boh'] : [...new Set(onFloor.map(o => o.side))];
  const rows = rnWeekRows();
  let first = null;

  if(day.closed){
    const date = day.next;
    const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'long'});
    sides.forEach(side => {
      let open = 0, spots = 0;
      suDaypartsFor(side).forEach((dp, i) => { const g = rnDaypartGaps(side, date, i); open += g.open.length; spots += g.m.filled + g.open.length; });
      rows.push(rnRow(`${spots - open}/${spots}`, `${side.toUpperCase()} Set Ups filled for ${dayName}`, side === 'boh' ? esText('Set Ups filled') : '', `setups:${side}|${date}|`, open ? 'warn' : 'ok'));
      if(!first && open) first = rnHead({text: `${dayName}’s ${side.toUpperCase()} Set Ups have ${open} open spot${open === 1 ? '' : 's'}.`, go: `setups:${side}|${date}|`}, `${dayName}’s ${side.toUpperCase()} Set Ups`, `${open} open spot${open === 1 ? '' : 's'}`, '', 'bad');
    });
    if(!first) first = rnHead({text: `${dayName}’s Set Ups are filled. Rest up.`}, '', `${dayName}’s Set Ups are filled`, 'Rest up', 'ok');
    return {side: sides.length === 1 ? sides[0] : 'foh', first, rows, fold: !!store, kicker: `${dayName}`, title: v.name ? `Hi, ${rnFirst(v.name)}` : 'Tomorrow'};
  }

  // Now, side by side. A Team Lead reads the open spots on their side; a
  // director reads how many people each house has for the daypart, FOH and
  // BOH apart, with the open spots after it (Tim, Nov 18 2026).
  const gaps = sides.map(side => rnDaypartGaps(side, today, rnDaypartIndex(side, day.now)));
  gaps.forEach(g => {
    const side = sides[gaps.indexOf(g)];
    const label = sides.length > 1 ? `${side.toUpperCase()} ` : '';
    const go = g.open.length ? `spot:${side}|${g.dp.name}|${g.open[0].slot}` : `setups:${side}|${today}|${g.dp.name}`;
    if(store){
      const staffed = typeof g.m.onShift === 'number' ? g.m.onShift : g.m.filled + g.unplaced.length;
      rows.push(rnRow(String(staffed), `${side.toUpperCase()} staffed for ${rnShort(g.dp.name)}${g.open.length ? ` · ${g.open.length} open spot${g.open.length === 1 ? '' : 's'}` : ''}`, '', go, g.open.length ? 'flag' : ''));
    } else {
      rows.push(rnRow(String(g.open.length), `${label}open spot${g.open.length === 1 ? '' : 's'} for ${rnShort(g.dp.name)}`, side === 'boh' ? esText('Open spots now') : '', go, g.open.length ? 'bad' : 'ok'));
    }
    if(!first && g.open.length) first = rnHead({text: `Nobody is on ${g.open[0].slot} for ${rnShort(g.dp.name)}${sides.length > 1 ? ` (${side.toUpperCase()})` : ''}.`, es: side === 'boh' ? esText('Nobody is on SPOT for DP', esPlace(g.open[0].slot) || g.open[0].slot, esDaypart(g.dp.name)) : '', go: `spot:${side}|${g.dp.name}|${g.open[0].slot}`}, 'Nobody is on', g.open[0].slot, `for ${rnShort(g.dp.name)}${sides.length > 1 ? ` (${side.toUpperCase()})` : ''}`, 'bad');
  });
  // Someone on both schedules counts once.
  const seen = new Set();
  const unplaced = gaps.flatMap((g, i) => g.unplaced.map(n => ({n, side: sides[i], dp: g.dp})))
    .filter(x => { const k = x.n.trim().toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; });
  if(unplaced.length){
    const u = unplaced[0];
    const when = day.now < day.opensAt ? `scheduled for ${rnShort(u.dp.name)}` : 'on the clock';
    rows.push(rnRow(String(unplaced.length), `${when} with no spot: ${unplaced.slice(0, 3).map(x => suDisplayName(x.n)).join(', ')}${unplaced.length > 3 ? '…' : ''}`, sides.includes('boh') ? esText('Scheduled with no spot') : '', `setups:${u.side}|${today}|${u.dp.name}`, 'bad'));
    if(!first) first = rnHead({text: rnSentence(`${unplaced.length} ${when} with no spot, starting with ${suDisplayName(u.n)}`), go: `setups:${u.side}|${today}|${u.dp.name}`}, `${when} with no spot`, unplaced.slice(0, 3).map(x => suDisplayName(x.n)).join(', ') + (unplaced.length > 3 ? ` +${unplaced.length - 3}` : ''), '', 'bad');
  }
  // The Zone Reset handoff (FOH).
  if(sides.includes('foh')){
    const hand = rnHandoff(today);
    if(hand){
      const done = hand.zones.filter(z => z.done).length, nobody = hand.zones.filter(z => !z.owners.length && !z.done).length;
      rows.push(rnRow(`${done}/${hand.zones.length}`, `zones reset · ${hand.title} at ${rnClock(hand.at)}${nobody ? ` · ${nobody} with nobody` : ''}`, '', `zone:${hand.name}`, done === hand.zones.length ? 'ok' : day.now >= hand.at ? 'bad' : ''));
      if(!first && done < hand.zones.length && day.now >= hand.at - 30) first = rnHead({text: `${hand.zones.length - done} zone${hand.zones.length - done === 1 ? '' : 's'} still to reset for ${hand.title}.`, go: `zone:${hand.name}`}, `Still to reset for ${hand.title}`, `${hand.zones.length - done} zone${hand.zones.length - done === 1 ? '' : 's'}`, '', 'bad');
    }
  }
  // Breaks: a Team Lead reads the ones coming up; a director reads how many
  // are left to run in each house, the AM shifts' until 1 PM on FOH (2 PM in
  // the kitchen, as on its iPad) and the PM shifts' after (Tim, Nov 20 2026).
  if(store){
    sides.forEach(side => {
      const br = rnBreaksLeft(side, day.now, side === 'foh' ? RN_PM_SHOWN_FROM : RN_PM_FROM);
      if(!br.total) return;
      const next = br.left[0];
      rows.push(rnWith(rnRow(String(br.left.length), `${side.toUpperCase()} ${br.pm ? 'PM' : 'AM'} break${br.left.length === 1 ? '' : 's'} left (of ${br.total})${next ? ` · next: ${suDisplayName(next.name)} ${rnClock(next.start)}` : ''}`, '', `setups:${side}|${today}|`, br.left.length ? '' : 'ok'), {bar: (br.total - br.left.length) / br.total}));
    });
  } else {
    const soon = sides.flatMap(side => rnBreaksSoon(side, day.now).map(b => ({...b, side})));
    if(soon.length){
      rows.push(rnRow(String(soon.length), `break${soon.length === 1 ? '' : 's'} due: ${soon.slice(0, 3).map(b => `${suDisplayName(b.name)} ${rnClock(b.start)}`).join(', ')}`, sides.includes('boh') ? esText('Breaks due soon') : '', `setups:${soon[0].side}|${today}|`, ''));
    }
  }
  // What's waiting on them on the Tasks tab.
  const tk = rnLeaderTicketRow(sides.length === 1 && sides[0] === 'boh');
  if(tk) rows.push(tk);
  // The director's extras: the leaders on, and under "More about today" the
  // rest of the day, waste and Food Safety (a Team Lead's card has neither:
  // Tim, Nov 18 2026).
  if(store){
    const later = [];
    sides.forEach(side => suDaypartsFor(side).forEach((dp, i) => {
      if(parseDaypartTimeToMinutes(dp.time) <= day.now) return;
      const g = rnDaypartGaps(side, today, i);
      if(g.open.length) later.push({side, dp, n: g.open.length});
    }));
    const leaders = sides.flatMap(side => rnRoster(side, today).filter(p => p.leader && rosterOverlaps(p, day.now, day.now + 1)).map(p => p.name));
    rows.push(rnRow(String(leaders.length), leaders.length ? `leader${leaders.length === 1 ? '' : 's'} on: ${leaders.slice(0, 4).map(suDisplayName).join(', ')}${leaders.length > 4 ? '…' : ''}` : 'leaders on the schedule right now', '', '', leaders.length ? '' : 'bad'));
    const more = r => { r.more = true; rows.push(r); };
    if(later.length) more(rnRow(String(later.reduce((s, x) => s + x.n, 0)), `open later today: ${later.slice(0, 3).map(x => `${rnShort(x.dp.name)} ${x.side.toUpperCase()} ${x.n}`).join(', ')}`, '', `setups:${later[0].side}|${today}|${later[0].dp.name}`, 'warn'));
    const w = rnWaste();
    more(rnWith(rnRow(rnMoney(w.total), `waste today, limit ${rnMoney(w.limit)}`, '', 'waste', w.over ? 'bad' : w.near ? 'warn' : 'ok'), w.limit ? {bar: Math.min(1, w.total / w.limit)} : {}));
    const fs = rnFoodSafety();
    more(rnRow(fs ? `${fs.done}/${fs.total}` : '0', 'Food Safety walkthrough today', '', 'foodsafety', fs && fs.done === fs.total ? 'ok' : ''));
  }
  if(!first){
    const dp = gaps[0].dp;
    first = rnHead({text: `${rnShort(dp.name)} is covered. Go catch someone doing it right.`, es: sides.length === 1 && sides[0] === 'boh' ? esText('Everything is covered for DP', esDaypart(dp.name)) : ''}, '', `${rnShort(dp.name)} is covered`, 'Go catch someone doing it right', 'ok');
  }
  return {side: sides.length === 1 ? sides[0] : 'foh', first, rows, fold: !!store, title: v.name ? `Hi, ${rnFirst(v.name)}` : ''};
}

// ----- The day's roster -----
// Everyone on the schedule for a day, in start order, by group. On today's
// open hours each person reads on now, later or done; a split shift between
// its blocks reads later.
const RN_ROSTER_GROUPS = [['foh', 'FOH'], ['boh', 'BOH'], ['truck', 'Truck'], ['admin', 'Admin']];

function rnRosterList(key, date){
  const src = key === 'foh' ? fohRoster : key === 'boh' ? bohRoster
    : key === 'truck' ? (typeof truckShifts !== 'undefined' ? truckShifts : {}) : (typeof adminShifts !== 'undefined' ? adminShifts : {});
  return Array.isArray(src[date]) ? src[date].filter(p => p && p.name && !(typeof teamHasLeft === 'function' && teamHasLeft(p.name, date))) : [];   // not someone who left
}

function rnDayRoster(date, now){
  const live = now !== null && date === today;
  return RN_ROSTER_GROUPS.map(([key, label]) => {
    const people = rnRosterList(key, date).map(p => {
      const blocks = p.blocks && p.blocks.length ? p.blocks : [p];
      const start = parseShiftTimeToMinutes(blocks[0].start);
      let end = parseShiftTimeToMinutes(blocks[blocks.length - 1].end);
      if(start !== null && end !== null && end <= start) end += 1440;
      const state = !live ? '' : rosterOverlaps(p, now, now + 1) ? 'now' : end !== null && end <= now ? 'done' : 'later';
      const leader = !!p.leader || (key !== 'admin' && typeof leaderListed === 'function' && leaderListed(p.name));
      return {name: p.name, time: rnShiftText(p), start, state, leader, training: !!p.training};
    }).sort((a, b) => (a.start === null ? 9999 : a.start) - (b.start === null ? 9999 : b.start) || a.name.localeCompare(b.name));
    return {key, label, live, people, onNow: people.filter(x => x.state === 'now').length};
  }).filter(g => g.people.length);
}

// Heads, not shifts: someone on FOH and BOH the same day counts once.
function rnHeadcount(groups, state){
  return new Set(groups.flatMap(g => g.people.filter(p => !state || p.state === state).map(p => p.name.trim().toLowerCase()))).size;
}

// The roster in a panel of its own: who's on and when, time first, the
// people on now marked. The Schedule tab draws its "Who's working" with it
// too (Tim, Oct 25 2026: one look for both), marking the viewer (me).
function rnRosterHtml(groups, head, me, tap){
  if(!groups.length) return '';
  const tag = t => `<span class="rn-rp-tag">${t}</span>`;
  const mine = p => me && rnSame(p.name, me) ? ' is-me' : '';
  // On the Schedule tab a name opens that person's week (team-schedule.js).
  const open = p => tap ? ` data-ts-person="${escapeHtml(p.name)}" role="button" tabindex="0"` : '';
  return `<div class="rn-roster">
    ${head ? `<div class="rn-roster-h"><span class="rn-roster-ic">${RN_ICON_TEAM}</span><b>${escapeHtml(head.title)}${head.es ? esSpan(head.es, true) : ''}</b><span>${escapeHtml(head.sub || '')}</span></div>` : ''}
    <div class="rn-roster-grid">${groups.map(g => `
    <section class="rn-rg">
      <h3 class="rn-rg-h">${escapeHtml(g.label)}<span>${g.people.length} on the day${g.live ? ` · ${g.onNow} now` : ''}</span></h3>
      <ul class="rn-rg-list">${g.people.map(p => `
        <li class="rn-rp${p.state ? ' is-' + p.state : ''}${mine(p)}"${open(p)}><span class="rn-rp-time">${escapeHtml(p.time)}</span><span class="rn-rp-name">${escapeHtml(p.name)}${p.leader ? tag('Leader') : ''}${p.training ? tag('Training') : ''}</span>${p.state === 'now' ? '<span class="rn-rp-now">On now</span>' : ''}</li>`).join('')}
      </ul>
    </section>`).join('')}</div></div>`;
}
// "Who's on today" / "Who's on Tuesday", and the date.
function rnRosterHead(date, day){
  const d = new Date(date + 'T12:00:00');
  return {title: `Who’s on ${date === today && !day.closed ? 'today' : d.toLocaleDateString('en-US', {weekday: 'long'})}`,
          sub: d.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'})};
}

// Admin Team: the day at a glance, the roster a tap away on the Schedule tab
// (Tim, Oct 25 2026; it was the card).
function rnAdminCard(v, day){
  const date = day.closed ? day.next : today;
  const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'long'});
  const groups = rnDayRoster(date, day.closed ? null : day.now);
  const total = rnHeadcount(groups);
  const rows = [];
  let first;
  if(!total){
    first = {text: `No schedule for ${day.closed ? dayName : 'today'} yet. It comes in with the HotSchedules roster.`};
  } else if(day.closed){
    first = {text: `${total} on the schedule ${dayName}.`};
  } else {
    const onNow = rnHeadcount(groups, 'now');
    const next = groups.flatMap(g => g.people.filter(p => p.state === 'later' && p.start !== null && p.start > day.now).map(p => ({...p, label: g.label})))
      .sort((a, b) => a.start - b.start)[0];
    first = {text: day.now < day.opensAt && !onNow ? `${total} on today, first in at ${rnClock(groups.flatMap(g => g.people).reduce((m, p) => p.start !== null && p.start < m ? p.start : m, 1440))}.`
      : `${onNow} on the clock now, ${total} on today.`};
    if(next) rows.push(rnRow(rnClock(next.start), `next in: ${next.name}, ${next.label}`, '', '', ''));
  }
  return {side: 'foh', first, rows, kicker: day.closed ? dayName : '', title: v.name ? `Hi, ${rnFirst(v.name)}` : 'Today’s roster'};
}

// Directors', the Admin Team's and Team Leads' cards: the day's roster is a
// tap away on the Schedule tab, which draws it the same way, with who's not
// working for a call-in (Tim, Oct 25 2026: a link, not a roster on the card).
function rnWithRoster(card, day){
  const date = day.closed ? day.next : today;
  const total = rnHeadcount(rnDayRoster(date, null));
  if(!total) return card;
  const when = day.closed ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'long'}) : 'today';
  const row = rnRow(String(total), `on the schedule ${when} · see who’s working`, '', `schedule:${date}`, '');
  if(card.fold) row.more = true;
  card.rows.push(row);
  return card;
}

// ----- This iPad's side (Tim, Oct 23 2026) -----
// A shared iPad lives up front or in the kitchen. Without a sign-in, a
// switch on the card picks which, remembered on the iPad: the kitchen gets
// its own card (in Spanish too), and Set Ups and Waste open on its side.
const RN_SIDE_KEY = 'cfaBudaSide';
const RN_PM_FROM = 14 * 60;      // PM shifts start at 2 PM: the break count switches to them then
const RN_PM_SHOWN_FROM = 13 * 60;   // a director's card shows FOH's PM breaks from 1 PM; the kitchen's stay at 2 PM (Tim, Nov 20 2026)
function rnDeviceSide(){
  try{ return localStorage.getItem(RN_SIDE_KEY) === 'boh' ? 'boh' : 'foh'; }catch(e){ return 'foh'; }
}
function rnSetDeviceSide(side){
  try{ localStorage.setItem(RN_SIDE_KEY, side === 'boh' ? 'boh' : 'foh'); }catch(e){ /* this visit only */ }
  rnApplyDeviceSide();
  renderRightNow();
}
// Set Ups and Waste open on this iPad's side (their own switches still work).
function rnApplyDeviceSide(){
  const side = rnDeviceSide();
  ['#posToggle', '#logToggle'].forEach(sel => {
    const b = document.querySelector(`${sel} .toggle-btn[data-section="${side}"]`);
    if(b && !b.classList.contains('active')) b.click();
  });
}

// What's left to make on the Prep Board today: [{name, left}], and the totals.
function rnPrepLeft(){
  if(typeof pbForecast !== 'function' || typeof pbMade !== 'function') return null;
  const items = (pbForecast(today).stats || []).filter(it => it.buildTo > 0);
  if(!items.length) return null;
  const left = items.map(it => ({name: it.name, left: Math.max(0, it.buildTo - pbMade(today, it.name))})).filter(x => x.left > 0)
    .sort((a, b) => b.left - a.left);
  return {left, units: left.reduce((t, x) => t + x.left, 0)};
}

// The kitchen's breaks not yet marked taken: the morning shifts' until 2 PM,
// then the afternoon's (Tim: PM shifts start at 2).
function rnBreaksLeft(side, now, pmShownFrom){
  const plan = typeof breakPlanFor === 'function' ? breakPlanFor(side, today) : {breaks: []};
  const all = (plan.breaks || []).filter(b => b.start !== null);
  const open = b => !completedBreaks[breakKeyFor(b.name, today, side)];
  const am = all.filter(b => b.from < RN_PM_FROM), pm = all.filter(b => b.from >= RN_PM_FROM);
  const pmNow = now >= (pmShownFrom || RN_PM_FROM);
  const list = pmNow ? pm : am;
  const left = list.filter(open).sort((a, b) => a.start - b.start);
  return {pm: pmNow, total: list.length, left};
}

// The day's kitchen waste and the item that cost the most.
function rnKitchenWaste(){
  const mine = (typeof entries !== 'undefined' ? entries : []).filter(e => e.section === 'boh' && wasteEntryDay(e) === today);
  const by = {};
  mine.forEach(e => { by[e.name] = (by[e.name] || 0) + (Number(e.cost) || 0); });
  const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
  return {total: wasteTodayTotal('boh'), top: top ? {name: top[0], cost: top[1]} : null};
}

// The kitchen iPad, nobody signed in: what to make, the breaks left, Food
// Safety, the kitchen's waste.
function rnKitchenCard(day){
  const rows = [];
  if(!day.closed){
    const prep = rnPrepLeft();
    if(prep){
      rows.push(prep.left.length
        ? rnRow(String(prep.units), `still to prep: ${prep.left.slice(0, 3).map(x => `${x.name} ${x.left}`).join(' · ')}${prep.left.length > 3 ? ` · ${prep.left.length - 3} more` : ''}`, esText('Still to prep', prep.units), 'prepboard', 'warn')
        : rnRow('0', 'All prep made for today', esText('All prep made today'), 'prepboard', 'ok'));
    }
    const br = rnBreaksLeft('boh', day.now);
    if(br.total){
      const next = br.left[0];
      const label = br.pm ? 'PM' : 'AM';
      rows.push(rnWith(rnRow(String(br.left.length), `${label} break${br.left.length === 1 ? '' : 's'} left (of ${br.total})${next ? ` · next: ${suDisplayName(next.name)} ${rnClock(next.start)}` : ''}`,
        [esText(br.pm ? 'PM breaks left' : 'AM breaks left', br.left.length, br.total), next ? esText('Next break', suDisplayName(next.name), rnClock(next.start)) : ''].filter(Boolean).join(' · '),
        `setups:boh|${today}|`, br.left.length ? '' : 'ok'), {bar: (br.total - br.left.length) / br.total}));
    }
    const fs = rnFoodSafety();
    rows.push(rnRow(fs ? `${fs.done}/${fs.total}` : '0', 'Food Safety walkthrough today', esText('Food Safety walkthrough'), 'foodsafety', fs && fs.done === fs.total ? 'ok' : ''));
    const w = rnKitchenWaste();
    rows.push(rnRow(rnMoney(w.total), `kitchen waste today${w.top ? ` · most: ${w.top.name} ${rnMoney(w.top.cost)}` : ''}`,
      [esText('Kitchen waste today'), w.top ? esText('Most wasted', w.top.name, rnMoney(w.top.cost)) : ''].filter(Boolean).join(' · '), 'waste', ''));
  }
  rows.push(rnRow('', 'Sign in with your clock-in PIN to see your spot', esText('Sign in to see your spot'), 'signin', ''));
  return {side: 'boh', first: null, rows, team: true, title: '', sideSwitch: true};
}

// Nobody signed in: the day's marketing events and a way to sign in (Tim,
// Oct 28 2026: the spots set, zones and waste are the leaders'), or the
// kitchen's card on a kitchen iPad.
function rnTeamCard(day){
  if(rnDeviceSide() === 'boh') return rnKitchenCard(day);
  const rows = (day.closed ? [] : rnTimerRows()).concat([rnRow('', 'Sign in with your clock-in PIN to see your spot', '', 'signin', '')]);
  return {side: 'foh', first: null, rows, team: true, title: '', sideSwitch: true};
}

// The counter tablet's timers on the signed-out Front card (Tim, Nov 18
// 2026): the ones due now, else the next one coming. Read from the Timers
// page's own rules (timers.js TimersPage.peek) once the rest of the hub has
// loaded, at most every RN_TIMERS_EVERY while Home is up; until then, or
// offline, the card simply doesn't have the line.
const RN_TIMERS_EVERY = 60 * 1000;
let rnTimers = {at: 0, list: null};
function rnTimersLoad(){
  if(typeof TimersPage === 'undefined' || typeof TimersPage.peek !== 'function') return;
  if(typeof mgrStatusKnown !== 'undefined' && !mgrStatusKnown) return;     // not until it's known nobody is signed in (manage-and-import.js)
  if(Date.now() - rnTimers.at < RN_TIMERS_EVERY) return;
  rnTimers.at = Date.now();
  TimersPage.peek().then(list => {
    rnTimers.list = list;
    const home = document.getElementById('homeView');
    if(home && home.classList.contains('active')) renderRightNow();
  }).catch(() => {});
}
function rnTimerRows(){
  rnTimersLoad();
  const list = rnTimers.list || [];
  const due = list.filter(t => t.cls === 'late' || t.cls === 'missed');
  if(due.length) return [rnRow(String(due.length), `timer${due.length === 1 ? '' : 's'} due now: ${due.map(t => t.name).join(', ')}`, '', 'timers', 'bad')];
  const next = list.filter(t => t.cls === 'ok' || t.cls === 'soon').sort((a, b) => a.left - b.left)[0];
  if(!next) return [];
  const min = Math.max(1, Math.round(next.left / 60000));
  return [rnRow(`${min}m`, `until the next timer: ${next.name}`, '', 'timers', next.cls === 'soon' ? 'warn' : '')];
}

// The Front / Kitchen switch on a signed-out card.
function rnSideSwitchHtml(){
  const side = rnDeviceSide();
  const btn = (s, en, es) => `<button type="button" class="rn-side-btn${side === s ? ' is-on' : ''}" data-rn-side="${s}" aria-pressed="${side === s}">${en} <span class="rn-side-es" lang="es">${es}</span></button>`;
  return `<div class="rn-side" role="group" aria-label="This iPad: front or back of house">${btn('foh', 'Front', esText('Front'))}${btn('boh', 'Back', esText('Back'))}</div>`;
}

function rnCardFor(v, day){
  const card = rnCardForRole(v, day);
  // My level, PTO and uniform credit, and the Admin Team's requests to review
  // (team-extras.js; Tim, Oct 28 2026). Only the signed-in person's own.
  if(v.name && typeof apRightNowRows === 'function') card.rows = card.rows.concat(apRightNowRows().map(r => (card.fold && r.go === 'credit' ? {...r, more: true} : r)));
  // The day's events: quiet lines after the person's own, above the way to
  // sign in on a signed-out card. Not on a new hire's card.
  if(!card.newHire){
    const evs = rnEventRows(day, card.side === 'boh', !!card.team);
    const at = card.sideSwitch && card.rows.length ? card.rows.length - 1 : card.rows.length;
    card.rows = card.rows.slice(0, at).concat(evs, card.rows.slice(at));
  }
  // What needs someone stays on top; the rest folds under "More about today".
  if(card.fold) card.rows = card.rows.filter(r => !r.more).concat(card.rows.filter(r => r.more));
  return card;
}
// ----- New hires (Tim, Nov 20 2026) -----
// Someone in their first 30 days gets a card made for them: a welcome by
// name with their day number, who's with them on their spot, who to find
// when they walk in, the positions they've worked so far, and what to know
// before a shift (the store's own words, typed in Manage → Home Page). The
// hub knows them by the "In training" tag HotSchedules puts on their shifts
// (weekly-roster-import.js), today or in the coming week, or by a hire date
// in Our Team inside the 30 days (team-extras.js apMine, their own only).
// The training plan itself comes later.
const RN_NEW_DAYS = 30;
function rnNewHire(v, date){
  const hired = typeof apMine !== 'undefined' && apMine && rnSame(apMine.name, v.name) && /^\d{4}-\d{2}-\d{2}$/.test(apMine.hireDate || '') ? apMine.hireDate : '';
  const n = hired ? Math.round((new Date(today + 'T12:00:00') - new Date(hired + 'T12:00:00')) / 86400000) + 1 : null;
  const inDays = n !== null && n >= 1 && n <= RN_NEW_DAYS;
  let tagged = false;
  for(let i = 0; i < 7 && !tagged; i++) tagged = rnOnRoster(v.name, rnAddDays(date, i)).some(o => o.entry.training);
  if(n !== null && n > RN_NEW_DAYS && !tagged) return null;
  return tagged || inDays ? {day: inDays ? n : null} : null;
}
// The positions someone has been placed on up to today, by how often, by the
// spot's family ("iPOS 2 LANE 1" is iPOS, "Host 1 (Captain)" is Host).
function rnPositionsSoFar(names){
  const count = {};
  Object.keys(posAssignments).forEach(key => {
    const [side, date, dpName, slot] = key.split('||');
    if(!slot || date > today || slot === SU_LEAD_CAPTAIN) return;
    if(date === today){            // today's count once the daypart has started
      const dp = (side === 'foh' || side === 'boh' ? suDaypartsFor(side) : []).find(d => d.name === dpName);
      if(!dp || parseDaypartTimeToMinutes(dp.time) > rnNowMins()) return;
    }
    if(!suSplitNames(posAssignments[key]).some(n => names.some(x => rnSame(n, x)))) return;
    const pos = slot.replace(/\s*\(.*$/, '').replace(/\s*\d.*$/, '').trim() || slot;
    count[pos] = (count[pos] || 0) + 1;
  });
  return Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b));
}
function rnBeforeShift(boh){
  const d = typeof homeData !== 'undefined' && homeData && homeData.newHire ? homeData.newHire : {};
  const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
  const en = lines(d.en), es = boh ? lines(d.es) : [];
  return en.length || es.length ? {en, es} : null;
}
function rnNewHireCard(card, v, day){
  const date = day.closed ? day.next : today;
  const nh = rnNewHire(v, date);
  if(!nh) return card;
  const on = rnOnRoster(v.name, date);
  const names = [v.name, ...on.map(o => o.entry.name)];
  const mine = n => names.some(x => rnSame(n, x));
  const boh = card.side === 'boh';
  const rows = [];
  // Who's on their spot with them, now or at their next one: their trainer, most days.
  const spots = rnSpotsFor(names, date);
  const at = s => parseDaypartTimeToMinutes(s.dp.time);
  const spot = day.closed ? spots[0] : spots.filter(s => daypartTimeWindow(suDaypartsFor(s.side), s.dpIndex).endMin > day.now)[0];
  if(spot){
    const others = suSplitNames(posAssignments[[spot.side, date, spot.dp.name, spot.slot].join('||')]).filter(n => !mine(n));
    if(others.length) rows.push(rnWith(rnRow('', `With you on ${spot.slot}: ${others.map(suDisplayName).join(', ')}`, esText('With you on your spot'), `setups:${spot.side}|${date}|${spot.dp.name}`), {who: others[0]}));
  }
  // Who to find when they walk in: the Lead Captain when their shift starts.
  const starts = on.map(o => rnShiftStart(o.entry)).filter(m => m !== null);
  const startsAt = starts.length ? Math.min(...starts) : null;
  const floor = on.filter(o => RN_FLOOR.includes(o.side));
  if(floor.length && startsAt !== null && (day.closed || startsAt > day.now)){
    const side = floor[0].side, i = rnDaypartIndex(side, startsAt);
    const lead = rnLeading(side, date, i).filter(n => !mine(n));
    if(lead.length){
      rows.push(rnWith(rnRow('', `When you walk in, find ${lead.map(suDisplayName).join(' or ')}`, esText('When you walk in, find NAME', lead.map(suDisplayName).join(' o ')), `setups:${side}|${date}|${suDaypartsFor(side)[i].name}`), {who: lead[0]}));
      card.rows = card.rows.filter(r => !r.text.startsWith('Leading the shift'));   // said once
    }
  }
  // What to know before a shift, until theirs has started.
  const before = day.closed || startsAt === null || startsAt > day.now;
  const so = rnPositionsSoFar(names);
  if(so.length) rows.push(rnRow(String(so.length), `position${so.length === 1 ? '' : 's'} so far: ${so.slice(0, 5).join(', ')}${so.length > 5 ? '…' : ''}`, esText('Positions so far'), 'mine', ''));
  // Under their spot and shift, above the rest.
  const keep = card.rows.findIndex(r => !/^(Now|Next|Later|Your shift)\b/.test(r.text) && !/^\d+:\d+$/.test(r.n));
  const cut = keep === -1 ? card.rows.length : keep;
  card.rows = card.rows.slice(0, cut).concat(rows, card.rows.slice(cut));
  card.title = `Welcome, ${rnFirst(v.name)}`;
  card.newHire = {day: nh.day, of: RN_NEW_DAYS, before: before ? rnBeforeShift(boh) : null};
  return card;
}
function rnNewHireHtml(nh, boh){
  if(!nh) return '';
  const es = t => boh && t ? esSpan(t, false) : '';
  const esLine = t => boh && t ? esSpan(t, true) : '';
  return `<section class="rn-sec rn-new" aria-label="Your first ${nh.of} days">
      <h3 class="rn-sec-h">${RN_SEC_ICONS.new}<span>Your first ${nh.of} days${es(esText('Your first 30 days'))}</span></h3>
      ${nh.day ? `<div class="rn-new-day"><b>Day ${nh.day}</b><span>of ${nh.of}${es(esText('Day N of M', nh.day, nh.of))}</span></div>${rnBarHtml(nh.day / nh.of)}` : ''}
      <p>We’re glad you’re here. Ask anything, anytime.${esLine(esText('Glad you are here'))}</p>
      ${nh.before ? `<div class="rn-new-before"><h4>Before your shift${es(esText('Before your shift'))}</h4><ul>${nh.before.en.map(l => `<li>${escapeHtml(l)}</li>`).join('')}${nh.before.es.map(l => `<li class="es" lang="es">${escapeHtml(l)}</li>`).join('')}</ul></div>` : ''}
    </section>`;
}

function rnCardForRole(v, day){
  if(v.role === 'member') return rnNewHireCard(rnPersonCard(v, day, false), v, day);
  if(v.role === 'trainer') return rnPersonCard(v, day, true);
  if(v.role === 'lead') return rnWithRoster(rnLeadCard(v, day, false), day);
  if(v.role === 'admin') return rnWithRoster(rnAdminCard(v, day), day);
  if(v.role === 'director' || v.role === 'manager') return rnWithRoster(rnLeadCard(v, day, true), day);
  return rnTeamCard(day);
}

// ----- Today on the calendar (Tim, Oct 25 2026; quiet lines since Nov 21 2026: rnEventRows) -----
// A store event on a Thursday was missed, and it cost us. So the day's
// events from the Calendar (events.js) open every Right Now card, for every
// role, signed in or not, in a block nobody scrolls past: what's on, and
// whether it's on now, coming up or over. The short ones (a week or less:
// Family Night, Free Breakfast Tuesday, No School) get the block; the
// month-long ones (the samples) ride along on one quieter "Also running"
// line, so the block only stands out when something is special. The next
// open day's events sit under it, a day's warning. Before opening it shows
// today's; after close and on Sunday, the next open day's. A tap opens that
// one event on its own, not the whole calendar. Leadership meetings show
// only to managers, as on the Calendar (eventsList).
const RN_EV_SPECIAL_DAYS = 7;          // longer than a week: "Also running"
// What team members see (Tim, Oct 28 2026): the marketing events, In store
// and Drive Thru (the promos, Free Breakfast Tuesday, Family Night, Pack the
// Drive Thru). Community Outreach and the samples are leaders' only.
const RN_TEAM_KINDS = ['instore', 'drivethru'];
const RN_EV_SOON = 120;                // "in 45 min" within two hours
const RN_ICON_CAL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
const RN_ICON_X = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function rnEvSpecial(ev){ return typeof evSpanDays !== 'function' || evSpanDays(ev) <= RN_EV_SPECIAL_DAYS; }

// Where an event stands at `now` on its day: {state, text, es}. `live` is
// false when the card looks ahead to a day that hasn't started.
function rnEvWhen(ev, now, live){
  const s = evMinutes(ev.from), e = evMinutes(ev.to);
  if(s === null) return {state: 'allday', text: 'All day', es: esText('All day')};
  const at = evClock(ev.from), until = e === null ? '' : evClock(ev.to);
  if(!live || now < s){
    const soon = live && s - now <= RN_EV_SOON;
    const left = s - now >= 60 ? `${Math.floor((s - now) / 60)} h${(s - now) % 60 ? ' ' + (s - now) % 60 + ' min' : ''}` : `${s - now} min`;
    return {state: soon ? 'soon' : 'later', text: `${evTimeText(ev)}${soon ? ` · starts in ${left}` : ''}`, es: esText('Starts at TIME', at)};
  }
  if(e === null || now < e) return {state: 'now', text: until ? `Happening now · until ${until}` : 'Happening now', es: esText('Happening now until TIME', until)};
  return {state: 'done', text: `Ended at ${until}`, es: esText('Ended at TIME', until)};
}

// The block's model: the day it's for, its special events (now first, then
// coming up, all day, and over last), the long ones, and the next day's.
function rnEvents(day, team){
  if(typeof eventsOn !== 'function') return null;
  const live = !day.closed;
  const date = live ? today : day.next;
  const on = d => eventsOn(d).filter(ev => !team || RN_TEAM_KINDS.includes(ev.kind));
  const all = on(date);
  const order = {now: 0, soon: 1, later: 2, allday: 3, done: 4};
  const special = all.filter(rnEvSpecial).map(ev => ({ev, when: rnEvWhen(ev, day.now, live)}))
    .sort((a, b) => order[a.when.state] - order[b.when.state]);
  const ongoing = all.filter(ev => !rnEvSpecial(ev));
  let next = null;
  if(live){
    const ids = new Set(all.map(ev => ev.id));
    const list = on(day.next).filter(rnEvSpecial).filter(ev => !ids.has(ev.id));
    if(list.length) next = {date: day.next, list};
  }
  if(!special.length && !ongoing.length && !next) return null;
  return {date, live, special, ongoing, next};
}

function rnWeekday(iso){ return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'long'}); }

// Quiet lines among the card's others (Tim, Nov 21 2026: the navy block
// under the title was louder than a person's own day; it had been there
// since Oct 25, after a missed event). One line an event still to come or
// on now ("Now" in red while it runs), one for the all-day and long ones, one for the
// next open day. An event that's over drops off. A tap still opens the
// event on its own. New hires don't get them (rnCardFor).
function rnEventRows(day, boh, team){
  const m = rnEvents(day, team);
  if(!m) return [];
  const go = (ev, date) => `event:${ev.id}|${date}`;
  const dot = (row, ev) => { row.color = (EVENT_KINDS[ev.kind] || EVENT_KINDS.note).color; return row; };
  const head = m.live ? 'today' : rnWeekday(m.date);
  const rows = m.special.filter(x => x.when.state !== 'done' && x.when.state !== 'allday').map(({ev, when}) =>
    dot(rnRow(when.state === 'now' ? 'Now' : '', `${head}: ${ev.title} · ${when.text}`, boh ? when.es || esText('Today on the calendar') : '', go(ev, m.date), when.state === 'now' ? 'bad' : ''), ev));
  // All day and the long ones share one line.
  const also = m.special.filter(x => x.when.state === 'allday').map(x => x.ev).concat(m.ongoing);
  if(also.length) rows.push(dot(rnRow('', `${rows.length ? 'also ' : ''}${head}: ${also.map(ev => ev.title).join(', ')}`, boh ? esText('Also running') : '', go(also[0], m.date), ''), also[0]));
  if(m.next){
    const label = m.next.date === rnAddDays(today, 1) ? 'tomorrow' : rnWeekday(m.next.date);
    const ev = m.next.list[0], more = m.next.list.length - 1;
    rows.push(dot(rnRow('', `${label}: ${ev.title}${ev.from ? ` · ${evClock(ev.from)}` : ''}${more ? ` · +${more} more` : ''}`, boh && label === 'tomorrow' ? esText('Tomorrow') : '', go(ev, m.next.date), ''), ev));
  }
  return rows;
}

// One event on its own: what it is, when, where it stands, the detail and
// the notes, with the calendar a tap further for anyone who wants it.
function rnEventSheetHtml(ev, date, boh){
  const es = t => boh && t ? esSpan(t, true) : '';
  const k = EVENT_KINDS[ev.kind] || EVENT_KINDS.note;
  const live = date === today && !rnDay().closed;
  const when = rnEvWhen(ev, rnNowMins(), live);
  const dayText = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'});
  const runs = ev.end && ev.end !== ev.date ? evWhenText(ev).split(' · ')[0] : '';
  // The calendar's notes, then the events page's details (events.js).
  const notes = (Array.isArray(ev.notes) ? ev.notes : []).concat(Array.isArray(ev.details) ? ev.details : []);
  return `<div class="rn-evs-card" role="dialog" aria-modal="true" aria-labelledby="rnEvsTitle" style="--ev:${k.color}">
      <button type="button" class="rn-evs-x" data-rn-evs-close aria-label="Close">${RN_ICON_X}</button>
      <span class="rn-evs-kind"><i aria-hidden="true"></i>${escapeHtml(k.label)}</span>
      <h2 id="rnEvsTitle">${escapeHtml(ev.title)}</h2>
      <p class="rn-evs-when">${escapeHtml(dayText)} · ${escapeHtml(ev.from ? evTimeText(ev) : 'All day')}</p>
      ${when.state !== 'allday' && when.state !== 'later' ? `<p class="rn-evs-state is-${when.state}">${escapeHtml(when.text)}${es(when.es)}</p>` : ''}
      ${runs ? `<p class="rn-evs-runs">Runs ${escapeHtml(runs)}</p>` : ''}
      ${ev.detail ? `<p class="rn-evs-detail">${escapeHtml(ev.detail)}</p>` : ''}
      ${notes.length ? `<h3>What to know${es(esText('What to know'))}</h3><ul>${notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : ''}
      <button type="button" class="rn-evs-cal" data-rn-evs-cal>${RN_ICON_CAL}Open the calendar${es(esText('Open the calendar'))}</button>
    </div>`;
}

let rnEvsReturn = null;   // the row that opened the sheet: focus goes back to it
function rnOpenEvent(id, date, from){
  const ev = typeof eventsList === 'function' ? eventsList().find(x => x.id === id) : null;
  if(!ev) return;
  let sheet = document.getElementById('rnEvSheet');
  if(!sheet){
    sheet = document.createElement('div');
    sheet.id = 'rnEvSheet';
    sheet.className = 'rn-evs';
    document.body.appendChild(sheet);
    sheet.addEventListener('click', e => {
      if(e.target === sheet || e.target.closest('[data-rn-evs-close]')){ rnCloseEvent(); return; }
      if(e.target.closest('[data-rn-evs-cal]')){
        const d = sheet.dataset.date;
        rnCloseEvent();
        calMonth = evMonthOf(d);
        calDay = d;
        launchShowTab('calendar');
        window.scrollTo({top: 0});
      }
    });
    document.addEventListener('keydown', e => { if(e.key === 'Escape' && sheet.classList.contains('is-open')) rnCloseEvent(); });
  }
  const boh = (document.getElementById('rightNow').className || '').includes('rn-boh');
  sheet.classList.toggle('is-boh', boh);
  sheet.dataset.date = date;
  sheet.innerHTML = rnEventSheetHtml(ev, date, boh);
  sheet.classList.add('is-open');
  document.body.classList.add('rn-evs-on');
  rnEvsReturn = from || null;
  const x = sheet.querySelector('[data-rn-evs-close]');
  if(x) x.focus();
}
function rnCloseEvent(){
  const sheet = document.getElementById('rnEvSheet');
  if(!sheet) return;
  sheet.classList.remove('is-open');
  document.body.classList.remove('rn-evs-on');
  if(rnEvsReturn && document.body.contains(rnEvsReturn)) rnEvsReturn.focus();
  rnEvsReturn = null;
}

let rnMoreOpen = false;   // "More about today" stays as the person left it through the minute's redraw
const RN_ROLE_LABELS = {member: 'Team Member', trainer: 'Trainer', lead: 'Team Lead', admin: 'Admin Team', director: 'Director', manager: 'Manager', none: ''};

function renderRightNow(){
  const root = document.getElementById('rightNow');
  if(!root) return;
  rnMineLoad();
  let card, day, v;
  try{
    day = rnDay();
    v = rnViewer();
    card = rnCardFor(v, day);
  }catch(err){
    console.warn('Right Now card:', err);
    root.innerHTML = '';
    return;
  }
  rnGreet(v, card);
  const boh = card.side === 'boh';
  const dp = day.closed ? null : suDaypartsFor(card.side)[rnDaypartIndex(card.side, day.now)];
  const kicker = card.kicker ? `Next up · ${card.kicker}` : day.closed ? 'The store is closed' : day.now < day.opensAt ? `Before open · ${rnShort(dp.name)} at ${rnClock(day.opensAt)}` : `Right now · ${rnShort(dp.name)}`;
  const kickerEs = card.kicker || day.closed ? '' : esText('Right now') + ' · ' + esDaypart(dp.name);
  // The Admin Team's card is the director's (Tim, Nov 18 2026: the same for now), under their own name.
  const roleLabel = card.newHire ? 'In training' : typeof acUser !== 'undefined' && acUser && acUser.role === 'admin' ? RN_ROLE_LABELS.admin : RN_ROLE_LABELS[v.role];
  const es = t => boh && t ? esSpan(t, true) : '';
  const esIn = t => boh && t ? esSpan(t, false) : '';
  const go = g => g ? ` data-rn-go="${escapeHtml(g)}" role="button" tabindex="0"` : '';
  const groups = {day: [], floor: [], tix: [], cal: [], cta: [], more: []};
  card.rows.forEach(r => groups[rnGroupOf(r, card)].push(r));
  // The floor's counts are tiles; a line with no count reads as a line.
  const tiles = groups.floor.filter(r => r.n !== ''), floorLines = groups.floor.filter(r => r.n === '');
  const sec = (key, title, body) => body ? `<section class="rn-sec rn-sec-${key}"><h3 class="rn-sec-h">${RN_SEC_ICONS[key] || ''}<span>${escapeHtml(title)}${esText(title) === title ? '' : esIn(esText(title))}</span></h3>${body}</section>` : '';
  const lines = list => list.length ? `<div class="rn-list">${list.map(r => rnLineHtml(r, es, go)).join('')}</div>` : '';
  // Two columns on a tablet or a computer: what's theirs to do, then what's around it.
  const main = rnNewHireHtml(card.newHire, boh)
    + sec('day', 'Your day', lines(groups.day))
    + sec('floor', card.sideSwitch ? (boh ? 'Today' : 'Timers') : card.kicker ? 'Set Ups' : 'On the floor', (tiles.length ? `<div class="rn-tiles">${tiles.map(r => rnTileHtml(r, es, go)).join('')}</div>` : '') + lines(floorLines));
  const side = sec('tix', 'Tickets', lines(groups.tix))
    + rnPeaHtml(card.pea, boh)
    + sec('cal', 'On the calendar', lines(groups.cal))
    + (groups.more.length ? `<details class="rn-more rn-sec" data-rn-more${rnMoreOpen ? ' open' : ''}><summary>More about ${escapeHtml(card.kicker || 'today')} <span>${groups.more.length}</span>${RN_ICON_GO}</summary>${lines(groups.more)}</details>` : '')
    + groups.cta.map(r => `<button type="button" class="rn-cta" data-rn-go="${escapeHtml(r.go)}"><span class="rn-cta-main"><b>${escapeHtml(r.text)}</b>${RN_ICON_GO}</span>${es(r.es)}</button>`).join('');
  // It rises in when Home is opened or someone signs in, once the saved data
  // is in (or early-paint.js has drawn it): never on the minute's redraw.
  const who = v.role + '|' + v.name;
  if(who !== rnSeen){ rnSeen = who; rnEnter = true; }
  root.className = `rn${boh ? ' rn-boh' : ''}${rnEnter ? ' rn-enter' : ''}`;
  if(typeof hubStarted === 'undefined' || hubStarted || hubWarming) rnEnter = false;
  root.innerHTML = `
    <div class="rn-top${card.sideSwitch ? ' is-switch' : ''}">
      <h2 class="rn-kicker">${escapeHtml(kicker)}${day.closed ? '' : ` · <b>${escapeHtml(rnClock(day.now))}</b>`}${boh && kickerEs ? `<span class="es" lang="es">${escapeHtml(kickerEs)}</span>` : ''}</h2>
      ${roleLabel ? `<span class="rn-role">${escapeHtml(roleLabel)}</span>` : ''}
      ${card.sideSwitch ? rnSideSwitchHtml() : ''}
    </div>
    ${card.first ? rnHeroHtml(card.first, boh, es, go) : ''}
    <div class="rn-cols${main && side ? '' : ' is-one'}">${main ? `<div class="rn-col">${main}</div>` : ''}${side ? `<div class="rn-col">${side}</div>` : ''}</div>`;
}

// ----- The look (Tim, Nov 21 2026) -----
// "Clinical and boring" was a list of same-weight rows. Now the card is in
// compartments, each a kind of information with its own header and shape:
// the First thing as a banner (red when it needs someone, green when all is
// covered, navy for where you are) with the words that matter in big type;
// "Your day" as lines; the floor's counts as big-number tiles; tickets; the
// calendar; the way to sign in as a button. Every line splits into a small
// label, the words that matter in bold, and the detail after: "Next: Drinks
// 1 (Mid)" reads NEXT / Drinks 1 (Mid). A count out of a total draws a bar.
// On a tablet or a computer the compartments sit in two columns. The card
// rises in once when Home opens, never on the minute's redraw. Colours keep
// their one meaning (CLAUDE.md, Tab bar and header).
const rnSvg = (d, size, weight) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const RN_SEC_ICONS = {
  day: rnSvg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', 15, 2.2),
  floor: rnSvg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>', 15, 2.2),
  tix: rnSvg('<path d="M4 8.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.6a1.9 1.9 0 0 0 0 3.8v1.6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.6a1.9 1.9 0 0 0 0-3.8z"/><path d="M14 7v10" stroke-dasharray="2 2.5"/>', 15, 2.2),
  cal: rnSvg('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', 15, 2.2),
  new: rnSvg('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>', 15, 2.2),
  pea: rnSvg('<path d="M5 20V11M12 20V4M19 20v-6"/>', 15, 2.4),
};
// A line with no count leads with what kind of line it is.
const RN_ICONS = {
  clock: rnSvg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', 20, 2),
  pin: rnSvg('<path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>', 20, 2),
  check: rnSvg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 20, 2.6),
};
let rnEnter = true, rnSeen = null;
function rnArrive(){ rnEnter = true; }       // navigation.js: Home was opened

// One greeting, not two: the welcome's own line carries the name, and a new
// hire's says welcome.
function rnGreet(v, card){
  const el = document.getElementById('homeGreeting');
  if(!el) return;
  const h = new Date().getHours(), name = rnFirst(v.name);
  const hello = card.newHire ? 'Welcome' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  el.textContent = `${hello}${name ? ', ' + name : ''}.`;
}
// "Priya Shah" → "PS"
function rnInitials(name){
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((w[0] || '').charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : '')).toUpperCase();
}
// Which compartment a line belongs in, by where its tap goes.
function rnGroupOf(r, card){
  if(r.more) return 'more';
  if(/^event:/.test(r.go)) return 'cal';
  if(/^tickets?(:|$)/.test(r.go)) return 'tix';
  if(r.go === 'signin') return 'cta';
  return card.team && !card.sideSwitch ? 'day' : 'floor';
}
// A line's label, its words that matter, and the detail after.
function rnParts(text){
  const i = text.indexOf(': ');
  const kicker = i > 0 && i <= 28 && !text.slice(0, i).includes(' · ') ? text.slice(0, i) : '';
  const rest = kicker ? text.slice(i + 2) : text;
  const j = rest.indexOf(' · ');
  return {kicker, value: j > 0 ? rest.slice(0, j) : rest, detail: j > 0 ? rest.slice(j + 3) : ''};
}
// A line's words start with a capital ("open spots" → "Open spots"), but a
// name that carries its own capitals is left alone (iPOS stays iPOS).
function rnCap(s){ return /^[a-z]+([\s,]|$)/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
// A bar for a count out of a total: the row's own (bar, 0 to 1), or read off "3/9".
function rnBarOf(r){
  if(typeof r.bar === 'number') return r.bar;
  const m = /^(\d+)\/(\d+)$/.exec(r.n);
  return m && Number(m[2]) ? Number(m[1]) / Number(m[2]) : null;
}
function rnBarHtml(part, tone, attrs){
  const pct = Math.round(Math.max(0, Math.min(1, part)) * 100);
  return `<span class="rn-bar${tone && tone !== 'flag' ? ' is-' + tone : ''}"${attrs || ''} aria-hidden="true"><i style="width:${pct}%"></i></span>`;
}
// A break's share left, of the break's length (break-planner.js BREAK_LEN).
function rnBreakPart(until){
  const len = (typeof BREAK_LEN === 'number' ? BREAK_LEN : 30) * 60000;
  return (until - serverNow()) / len;
}
function rnHeroHtml(f, boh, es, go){
  const onBreak = !!f.until;
  const big = onBreak ? `<b class="rn-break-left" data-rn-break-until="${Number(f.until)}">${rnBreakLeft(f.until)}</b>` : escapeHtml(f.big || f.text);
  const sub = onBreak ? `left · ${f.sub}` : f.sub;
  const bar = onBreak ? rnBarHtml(rnBreakPart(f.until), '', ` data-rn-break-bar="${Number(f.until)}"`) : typeof f.bar === 'number' ? rnBarHtml(f.bar) : '';
  return `<div class="rn-hero${f.tone ? ' is-' + f.tone : ''}${f.big || onBreak ? '' : ' is-text'}${f.go ? ' is-go' : ''}"${go(f.go)}>
      <span class="rn-hero-b">
        <small>${escapeHtml(f.k || 'First thing')}${boh && !f.k ? `<span class="es" lang="es"> · ${escapeHtml(esText('First thing'))}</span>` : ''}</small>
        <span class="rn-hero-big">${big}</span>
        ${sub ? `<span class="rn-hero-sub">${escapeHtml(sub)}</span>` : ''}${bar}${es(f.es)}
      </span>
      ${f.go ? `<span class="rn-hero-go">${RN_ICON_GO}</span>` : ''}
    </div>`;
}
function rnLineHtml(r, es, go){
  const p = rnParts(r.text), tone = r.tone && r.tone !== 'flag' ? ' is-' + r.tone : '';
  const done = r.go === 'tickets' && r.tone === 'ok';     // nothing waiting on them: a tick, not a zero
  const lead = done ? `<i class="rn-ic is-ok">${RN_ICONS.check}</i>`
    : r.n !== '' ? `<b class="rn-pill${tone}">${escapeHtml(r.n)}</b>`
    : r.color ? `<i class="rn-dot" style="--dot:${escapeHtml(r.color)}"></i>`
    : r.who ? `<i class="rn-ic rn-av">${escapeHtml(rnInitials(r.who))}</i>`
    : RN_ICONS[r.icon] ? `<i class="rn-ic">${RN_ICONS[r.icon]}</i>` : '<i class="rn-dot"></i>';
  const detail = [p.detail, r.note].filter(Boolean).join(' · ');
  const bar = rnBarOf(r);
  return `<div class="rn-row${tone}${r.go ? ' is-go' : ''}"${go(r.go)}>
          <span class="rn-n"${r.n !== '' && !done ? '' : ' aria-hidden="true"'}>${lead}</span>
          <span class="rn-t">${p.kicker ? `<small class="rn-k">${escapeHtml(p.kicker)}</small>` : ''}<b class="rn-v">${escapeHtml(rnCap(p.value))}</b>${detail ? `<span class="rn-d">${escapeHtml(detail)}</span>` : ''}${bar === null ? '' : rnBarHtml(bar, r.tone)}${es(r.es)}</span>
          ${r.go ? `<span class="rn-go">${RN_ICON_GO}</span>` : ''}
        </div>`;
}
function rnTileHtml(r, es, go){
  const p = rnParts(r.text), bar = rnBarOf(r);
  const detail = p.kicker ? p.value + (p.detail ? ' · ' + p.detail : '') : p.detail;
  return `<div class="rn-tile${r.tone ? ' is-' + r.tone : ''}${r.go ? ' is-go' : ''}"${go(r.go)}>
          <b class="rn-tile-n">${escapeHtml(r.n)}</b>
          <span class="rn-tile-l">${escapeHtml(rnCap(p.kicker || p.value))}</span>
          ${detail ? `<small class="rn-tile-d">${escapeHtml(detail)}</small>` : ''}${es(r.es)}${bar === null ? '' : rnBarHtml(bar, r.tone)}
          ${r.go ? `<span class="rn-tile-go">${RN_ICON_GO}</span>` : ''}
        </div>`;
}

// Taps: open the screen that fixes it.
function rnOpenSetups(side, date, dpName){
  launchShowTab('positions');
  if(currentPosSection !== side){
    const b = document.querySelector(`#posToggle .toggle-btn[data-section="${side}"]`);
    if(b) b.click();
  }
  const pill = date && document.querySelector(`#dayPicker .day-pill[data-date="${date}"]`);
  if(pill && document.getElementById('daySelect').value !== date) pill.click();
  if(dpName){
    suSelectedDaypart[side] = dpName;
    suOpenCards[side].add(dpName);
    renderAllDayparts();
    const card = [...document.querySelectorAll('#allDayparts [data-su-card]')].find(c => c.dataset.suCard === dpName);
    if(card) card.scrollIntoView({block: 'start'});
  } else {
    window.scrollTo({top: 0});
  }
}

function rnGo(g){
  const [what, rest = ''] = g.split(/:(.*)/s);
  const parts = rest.split('|');
  if(what === 'setups') rnOpenSetups(parts[0], parts[1] || today, parts[2] || '');
  else if(what === 'spot'){
    const [side, dpName, slot] = parts;
    rnOpenSetups(side, today, dpName);
    openPosModal([side, today, dpName, slot].join('||'), slot, dpName);
  }
  else if(what === 'zone'){
    currentZoneDaypart = rest;
    currentChecklistZone = '';
    launchShowTab('zonereset');
    window.scrollTo({top: 0});
  }
  else if(what === 'waste'){ launchShowTab('wastelog'); window.scrollTo({top: 0}); }
  else if(what === 'event') rnOpenEvent(parts[0], parts[1] || today, document.activeElement);
  else if(what === 'timers'){ launchShowTab('timers'); window.scrollTo({top: 0}); }
  else if(what === 'headcount'){ launchShowTab('headcount'); window.scrollTo({top: 0}); }
  else if(what === 'schedule' && typeof tsShowDay === 'function') tsShowDay(rest);
  else if(what === 'myweek' && typeof tsShowWeek === 'function') tsShowWeek(rest);
  else if(what === 'foodsafety'){ launchShowTab('foodsafety'); window.scrollTo({top: 0}); }
  else if(what === 'prepboard'){ launchShowTab('prepboard'); window.scrollTo({top: 0}); }
  else if(what === 'mine' && typeof mpOpenMine === 'function') mpOpenMine();
  else if(what === 'credit' && typeof apOpenCredit === 'function') apOpenCredit();
  else if(what === 'ticket' || what === 'tickets'){ launchShowTab('tasks'); window.scrollTo({top: 0}); if(what === 'ticket' && typeof psOpenTicket === 'function') psOpenTicket(rest); }
  else if(what === 'week' && typeof dwShow === 'function') dwShow();
  else if(what === 'signin' && typeof siOpen === 'function') siOpen();
  else if(what === 'signin'){ launchShowTab('manage'); window.scrollTo({top: 0}); const pin = document.getElementById('pinInput'); if(pin) pin.focus(); }
}

document.getElementById('rightNow').addEventListener('click', e => {
  const sw = e.target.closest('[data-rn-side]');
  if(sw){ rnSetDeviceSide(sw.dataset.rnSide); return; }
  const ev = e.target.closest('[data-rn-ev]');
  if(ev){ rnOpenEvent(ev.dataset.rnEv, ev.dataset.rnEvDate, ev); return; }
  const t = e.target.closest('[data-rn-go]');
  if(t) rnGo(t.dataset.rnGo);
});
document.getElementById('rightNow').addEventListener('toggle', e => {
  if(e.target && e.target.matches && e.target.matches('[data-rn-more]')) rnMoreOpen = e.target.open;
}, true);
document.getElementById('rightNow').addEventListener('keydown', e => {
  const ev = e.target.closest('[data-rn-ev]');
  if(ev && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); rnOpenEvent(ev.dataset.rnEv, ev.dataset.rnEvDate, ev); return; }
  const t = e.target.closest('[data-rn-go]');
  if(t && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); rnGo(t.dataset.rnGo); }
});

// A break's time left, counting down: the banner's big number and its bar
// tick every second.
function rnBreakLeft(until){
  const s = Math.max(0, Math.round((until - serverNow()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
setInterval(() => {
  const els = document.querySelectorAll('#rightNow [data-rn-break-until]');
  if(!els.length || document.visibilityState !== 'visible') return;
  let over = false;
  els.forEach(el => { const until = Number(el.dataset.rnBreakUntil); el.textContent = rnBreakLeft(until); if(until <= serverNow()) over = true; });
  document.querySelectorAll('#rightNow [data-rn-break-bar] i').forEach(i => {
    i.style.width = Math.round(Math.max(0, Math.min(1, rnBreakPart(Number(i.parentNode.dataset.rnBreakBar)))) * 100) + '%';
  });
  if(over) renderRightNow();
}, 1000);

// The minute moves on: keep it current while Home is showing.
setInterval(() => {
  if(document.visibilityState === 'visible' && document.getElementById('homeView').classList.contains('active')) renderRightNow();
}, 60000);

// Set Ups and Waste open on this iPad's side once the saved data is in.
if(typeof stateLoaded !== 'undefined') stateLoaded.then(rnApplyDeviceSide).catch(() => {});
