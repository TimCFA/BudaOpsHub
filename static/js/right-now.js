// ===== RIGHT NOW (Tim, Oct 19 2026) =====
// Home opens on the welcome banner and the quote: culture first, always
// (Tim). Under it, this card: what matters this minute, for whoever is
// holding the phone. Who that is comes from the sign-in (accounts.js
// acUser, launch-mode.js launchManager):
//  - Team Member: their spot now, next and later today, their shift, their
//    break, the zone they reset at the coming handoff, the tickets handed to
//    them on the Tasks tab, their own PEA scores, the day's waste (Tim,
//    Oct 28 2026: "what all they need to see").
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
//  - A phone nobody signed in on: the shift as a whole, and a way to sign in.
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
function rnDay(){
  const now = rnNowMins();
  const sunday = new Date().getDay() === 0;
  const last = fohDayparts[fohDayparts.length - 1];
  const closeAt = daypartTimeWindow(fohDayparts, fohDayparts.length - 1).endMin;
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
      rows.push(rnRow('', `Your shift ${dayName}: ${rnShiftsText(on)}`, esText('Your shift'), ''));
      spots.forEach(x => rows.push(rnRow(rnClock(parseDaypartTimeToMinutes(x.dp.time)), `${x.slot} at ${rnShort(x.dp.name)}`, esPlace(x.slot), `setups:${x.side}|${date}|${x.dp.name}`)));
    }
    return {side, first, rows, kicker: `${dayName}`, title: `Hi, ${first1}`};
  }

  const entry = floor.length ? floor[0].entry : null;   // breaks and spots are the floor's
  const starts = on.map(o => rnShiftStart(o.entry)).filter(m => m !== null);
  const startsAt = starts.length ? Math.min(...starts) : null;
  const offFloor = !floor.length && on.length ? on[0] : null;
  const nowSpot = spots.find(s => s.dpIndex === rnDaypartIndex(s.side, day.now) && parseDaypartTimeToMinutes(s.dp.time) <= day.now);
  const nextSpot = spots.find(s => parseDaypartTimeToMinutes(s.dp.time) > day.now);
  const brk = entry ? breakFor(side, today, entry.name) : null;
  const brkKey = entry ? breakKeyFor(entry.name, today, side) : '';
  const onBreak = entry && breakCountdowns[brkKey] && breakCountdowns[brkKey] > serverNow();
  const brkTaken = entry && !!completedBreaks[brkKey];
  const hand = side === 'foh' ? rnHandoff(today) : null;
  const myZones = hand ? hand.zones.filter(z => z.owners.some(o => names.some(n => rnSame(o, n)))) : [];
  let nowFirst = false;

  if(!on.length && !spots.length){
    first = {text: 'You’re not on today’s schedule.', es: esText('Not on the schedule')};
  } else if(onBreak){
    first = {text: `On break until ${rnClock(Math.round((breakCountdowns[brkKey] - serverNow()) / 60000) + day.now)}.`, es: esText('On break')};
  } else if(myZones.some(z => !z.done) && day.now >= hand.at - 30){
    const z = myZones.find(x => !x.done);
    first = {text: `Reset ${z.zone} for the ${hand.title} handoff (${z.checked} of ${z.total} done).`, go: `zone:${hand.name}`};
  } else if(nowSpot){
    nowFirst = true;
    const end = daypartTimeWindow(suDaypartsFor(nowSpot.side), nowSpot.dpIndex).endMin;
    first = {text: `You’re on ${nowSpot.slot} until ${rnClock(end)}.`, es: esText('You are on SPOT until TIME', esPlace(nowSpot.slot) || nowSpot.slot, rnClock(end)), go: `setups:${nowSpot.side}|${today}|${nowSpot.dp.name}`};
  } else if(startsAt !== null && startsAt > day.now){
    first = {text: `Your shift starts at ${rnClock(startsAt)}${nextSpot ? `, on ${nextSpot.slot}` : ''}.`, es: esText('Your shift starts at TIME', rnClock(startsAt))};
  } else if(offFloor && !spots.length){
    first = {text: `Your ${RN_OFF_FLOOR[offFloor.side]} shift today: ${rnShiftText(offFloor.entry)}.`};
  } else {
    const dp = suDaypartsFor(side)[rnDaypartIndex(side, day.now)];
    first = {text: `No spot yet for ${rnShort(dp.name)}. Check with your leader.`, es: esText('No spot yet for DP', esDaypart(dp.name)), go: `setups:${side}|${today}|${dp.name}`};
  }

  if(nowSpot && !nowFirst) rows.push(rnRow('', `Now: ${nowSpot.slot} (${rnShort(nowSpot.dp.name)})`, esText('Your spot now') + (esPlace(nowSpot.slot) ? ': ' + esPlace(nowSpot.slot) : ''), `setups:${nowSpot.side}|${today}|${nowSpot.dp.name}`));
  if(nextSpot) rows.push(rnRow(rnClock(parseDaypartTimeToMinutes(nextSpot.dp.time)), `Next: ${nextSpot.slot} (${rnShort(nextSpot.dp.name)})`, esText('Next spot') + (esPlace(nextSpot.slot) ? ': ' + esPlace(nextSpot.slot) : ''), `setups:${nextSpot.side}|${today}|${nextSpot.dp.name}`));
  // Every spot after that today, so the whole day's Set Ups are here.
  spots.filter(x => x !== nextSpot && parseDaypartTimeToMinutes(x.dp.time) > day.now).forEach(x =>
    rows.push(rnRow(rnClock(parseDaypartTimeToMinutes(x.dp.time)), `Later: ${x.slot} (${rnShort(x.dp.name)})`, esText('Later spot') + (esPlace(x.slot) ? ': ' + esPlace(x.slot) : ''), `setups:${x.side}|${today}|${x.dp.name}`)));
  if(on.length) rows.push(rnRow('', `Your shift: ${rnShiftsText(on)}`, esText('Your shift'), ''));
  // A planned break still ahead (or just due); one long past is the leader's to sort out.
  if(brk && brk.start !== null && brk.start >= day.now - 15 && !brkTaken && !onBreak) rows.push(rnRow(rnClock(brk.start), 'your break', esText('Your break'), `setups:${side}|${today}|`, brk.start <= day.now ? 'warn' : ''));
  myZones.forEach(z => rows.push(rnRow(`${z.checked}/${z.total}`, `your zone: ${z.zone} · ${hand.title} at ${rnClock(hand.at)}`, '', `zone:${hand.name}`, z.done ? 'ok' : '')));
  rnTicketRows(day).forEach(r => rows.push(r));
  if(trainer && entry){
    const g = rnDaypartGaps(side, today, rnDaypartIndex(side, day.now));
    rows.push(rnRow(String(g.open.length), `open spot${g.open.length === 1 ? '' : 's'} on ${side.toUpperCase()} for ${rnShort(g.dp.name)}`, esText('Open spots now'), g.open.length ? `spot:${side}|${g.dp.name}|${g.open[0].slot}` : `setups:${side}|${today}|${g.dp.name}`, g.open.length ? 'bad' : 'ok'));
  }
  const w = rnWaste();
  rows.push(rnRow(rnMoney(w.total), `waste today, limit ${rnMoney(w.limit)}`, esText('Waste today'), 'waste', w.over ? 'bad' : w.near ? 'warn' : 'ok'));
  return {side, first, rows, title: `Hi, ${first1}`, pea: rnMine.pea && rnMine.pea.positions && rnMine.pea.positions.length ? rnMine.pea : null};
}

// ----- Mine: my tickets and my PEA (Tim, Oct 28 2026) -----
// Read for a signed-in Team Member or Trainer, at most every RN_MINE_EVERY
// while Home is up: the tickets handed to them on the Tasks tab (pass.js;
// the server sends a team member only their own) and their own PEA scores
// (app.py /api/me/pea: only theirs, never anyone else's). Until they're in,
// or offline, the card simply doesn't have those lines.
const RN_MINE_EVERY = 5 * 60 * 1000;
const RN_TICKETS_SHOWN = 4;
let rnMine = {who: '', at: 0, pea: null, tickets: null};
function rnMineLoad(){
  if(typeof fetch !== 'function') return;
  const v = rnViewer();
  if(!['member', 'trainer'].includes(v.role) || !v.name){ if(rnMine.who) rnMine = {who: '', at: 0, pea: null, tickets: null}; return; }
  if(rnMine.who === v.name && Date.now() - rnMine.at < RN_MINE_EVERY) return;
  if(rnMine.who !== v.name) rnMine = {who: v.name, at: 0, pea: null, tickets: null};
  rnMine.at = Date.now();
  const who = v.name, get = url => fetch(url, {credentials: 'same-origin', cache: 'no-store'}).then(r => (r.ok ? r.json() : null)).catch(() => null);
  Promise.all([get('/api/me/pea'), get('/api/pass/state')]).then(([pea, pass]) => {
    if(rnMine.who !== who) return;
    rnMine.pea = pea && Array.isArray(pea.positions) ? pea : null;
    rnMine.tickets = pass ? rnTicketsFrom(pass) : null;
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
      <div class="rn-pea-head"><span>Your PEA${es(esText('Your PEA'))}</span><small>latest ${PEA_RECENT_RATINGS_RN} ratings per position${es(esText('Latest ratings per position'))}</small></div>
      <div class="rn-pea-grid">${pea.positions.map(p => `<div class="rn-pea-cell is-${escapeHtml(p.tier)}" title="${escapeHtml(`${p.total} rating${p.total === 1 ? '' : 's'}, last ${p.last}`)}">
          <span>${escapeHtml(p.position)}</span><b>${escapeHtml(Number(p.avg).toFixed(2))}</b><small>${escapeHtml(p.tierLabel)}${es(esText(p.tierLabel))}</small></div>`).join('')}</div>
    </section>`;
}
const PEA_RECENT_RATINGS_RN = 5;   // pea_mine.py RECENT, pea-ratings.js PEA_RECENT_RATINGS

function rnLeadCard(v, day, store){
  const on = v.name ? rnOnRoster(v.name, today) : [];
  const onFloor = on.filter(o => RN_FLOOR.includes(o.side));
  const sides = store || !onFloor.length ? ['foh', 'boh'] : [...new Set(onFloor.map(o => o.side))];
  const rows = [];
  let first = null;

  if(day.closed){
    const date = day.next;
    const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'long'});
    sides.forEach(side => {
      let open = 0, spots = 0;
      suDaypartsFor(side).forEach((dp, i) => { const g = rnDaypartGaps(side, date, i); open += g.open.length; spots += g.m.filled + g.open.length; });
      rows.push(rnRow(`${spots - open}/${spots}`, `${side.toUpperCase()} Set Ups filled for ${dayName}`, side === 'boh' ? esText('Set Ups filled') : '', `setups:${side}|${date}|`, open ? 'warn' : 'ok'));
      if(!first && open) first = {text: `${dayName}’s ${side.toUpperCase()} Set Ups have ${open} open spot${open === 1 ? '' : 's'}.`, go: `setups:${side}|${date}|`};
    });
    if(!first) first = {text: `${dayName}’s Set Ups are filled. Rest up.`};
    return {side: sides.length === 1 ? sides[0] : 'foh', first, rows, kicker: `${dayName}`, title: v.name ? `Hi, ${rnFirst(v.name)}` : 'Tomorrow'};
  }

  // Now, side by side.
  const gaps = sides.map(side => rnDaypartGaps(side, today, rnDaypartIndex(side, day.now)));
  gaps.forEach(g => {
    const side = sides[gaps.indexOf(g)];
    const label = sides.length > 1 ? `${side.toUpperCase()} ` : '';
    rows.push(rnRow(String(g.open.length), `${label}open spot${g.open.length === 1 ? '' : 's'} for ${rnShort(g.dp.name)}`, side === 'boh' ? esText('Open spots now') : '', g.open.length ? `spot:${side}|${g.dp.name}|${g.open[0].slot}` : `setups:${side}|${today}|${g.dp.name}`, g.open.length ? 'bad' : 'ok'));
    if(!first && g.open.length) first = {text: `Nobody is on ${g.open[0].slot} for ${rnShort(g.dp.name)}${sides.length > 1 ? ` (${side.toUpperCase()})` : ''}.`, es: side === 'boh' ? esText('Nobody is on SPOT for DP', esPlace(g.open[0].slot) || g.open[0].slot, esDaypart(g.dp.name)) : '', go: `spot:${side}|${g.dp.name}|${g.open[0].slot}`};
  });
  // Someone on both schedules counts once.
  const seen = new Set();
  const unplaced = gaps.flatMap((g, i) => g.unplaced.map(n => ({n, side: sides[i], dp: g.dp})))
    .filter(x => { const k = x.n.trim().toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; });
  if(unplaced.length){
    const u = unplaced[0];
    const when = day.now < day.opensAt ? `scheduled for ${rnShort(u.dp.name)}` : 'on the clock';
    rows.push(rnRow(String(unplaced.length), `${when} with no spot: ${unplaced.slice(0, 3).map(x => suDisplayName(x.n)).join(', ')}${unplaced.length > 3 ? '…' : ''}`, sides.includes('boh') ? esText('Scheduled with no spot') : '', `setups:${u.side}|${today}|${u.dp.name}`, 'bad'));
    if(!first) first = {text: rnSentence(`${unplaced.length} ${when} with no spot, starting with ${suDisplayName(u.n)}`), go: `setups:${u.side}|${today}|${u.dp.name}`};
  }
  // The Zone Reset handoff (FOH).
  if(sides.includes('foh')){
    const hand = rnHandoff(today);
    if(hand){
      const done = hand.zones.filter(z => z.done).length, nobody = hand.zones.filter(z => !z.owners.length && !z.done).length;
      rows.push(rnRow(`${done}/${hand.zones.length}`, `zones reset · ${hand.title} at ${rnClock(hand.at)}${nobody ? ` · ${nobody} with nobody` : ''}`, '', `zone:${hand.name}`, done === hand.zones.length ? 'ok' : day.now >= hand.at ? 'bad' : ''));
      if(!first && done < hand.zones.length && day.now >= hand.at - 30) first = {text: `${hand.zones.length - done} zone${hand.zones.length - done === 1 ? '' : 's'} still to reset for ${hand.title}.`, go: `zone:${hand.name}`};
    }
  }
  // Breaks coming up.
  const soon = sides.flatMap(side => rnBreaksSoon(side, day.now).map(b => ({...b, side})));
  if(soon.length){
    rows.push(rnRow(String(soon.length), `break${soon.length === 1 ? '' : 's'} due: ${soon.slice(0, 3).map(b => `${suDisplayName(b.name)} ${rnClock(b.start)}`).join(', ')}`, sides.includes('boh') ? esText('Breaks due soon') : '', `setups:${soon[0].side}|${today}|`, ''));
  }
  // The director's extras: the rest of the day, the leaders on.
  if(store){
    const later = [];
    sides.forEach(side => suDaypartsFor(side).forEach((dp, i) => {
      if(parseDaypartTimeToMinutes(dp.time) <= day.now) return;
      const g = rnDaypartGaps(side, today, i);
      if(g.open.length) later.push({side, dp, n: g.open.length});
    }));
    if(later.length) rows.push(rnRow(String(later.reduce((s, x) => s + x.n, 0)), `open later today: ${later.slice(0, 3).map(x => `${rnShort(x.dp.name)} ${x.side.toUpperCase()} ${x.n}`).join(', ')}`, '', `setups:${later[0].side}|${today}|${later[0].dp.name}`, 'warn'));
    const leaders = sides.flatMap(side => rnRoster(side, today).filter(p => p.leader && rosterOverlaps(p, day.now, day.now + 1)).map(p => p.name));
    rows.push(rnRow(String(leaders.length), leaders.length ? `leader${leaders.length === 1 ? '' : 's'} on: ${leaders.slice(0, 4).map(suDisplayName).join(', ')}${leaders.length > 4 ? '…' : ''}` : 'leaders on the schedule right now', '', '', leaders.length ? '' : 'bad'));
  }
  const w = rnWaste();
  rows.push(rnRow(rnMoney(w.total), `waste today, limit ${rnMoney(w.limit)}`, sides.includes('boh') ? esText('Waste today') : '', 'waste', w.over ? 'bad' : w.near ? 'warn' : 'ok'));
  const fs = rnFoodSafety();
  rows.push(rnRow(fs ? `${fs.done}/${fs.total}` : '0', 'Food Safety walkthrough today', sides.includes('boh') ? esText('Food Safety walkthrough') : '', 'foodsafety', fs && fs.done === fs.total ? 'ok' : ''));
  if(!first){
    const dp = gaps[0].dp;
    first = {text: `${rnShort(dp.name)} is covered. Go catch someone doing it right.`, es: sides.length === 1 && sides[0] === 'boh' ? esText('Everything is covered for DP', esDaypart(dp.name)) : ''};
  }
  return {side: sides.length === 1 ? sides[0] : 'foh', first, rows, title: v.name ? `Hi, ${rnFirst(v.name)}` : ''};
}

// ----- The day's roster -----
// Everyone on the schedule for a day, in start order, by group. On today's
// open hours each person reads on now, later or done; a split shift between
// its blocks reads later.
const RN_ROSTER_GROUPS = [['foh', 'FOH'], ['boh', 'BOH'], ['truck', 'Truck'], ['admin', 'Admin']];

function rnRosterList(key, date){
  const src = key === 'foh' ? fohRoster : key === 'boh' ? bohRoster
    : key === 'truck' ? (typeof truckShifts !== 'undefined' ? truckShifts : {}) : (typeof adminShifts !== 'undefined' ? adminShifts : {});
  return Array.isArray(src[date]) ? src[date].filter(p => p && p.name) : [];
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
  card.rows.push(rnRow(String(total), `on the schedule ${when} · see who’s working`, '', `schedule:${date}`, ''));
  return card;
}

// ----- This iPad's side (Tim, Oct 23 2026) -----
// A shared iPad lives up front or in the kitchen. Without a sign-in, a
// switch on the card picks which, remembered on the iPad: the kitchen gets
// its own card (in Spanish too), and Set Ups and Waste open on its side.
const RN_SIDE_KEY = 'cfaBudaSide';
const RN_PM_FROM = 14 * 60;      // PM shifts start at 2 PM: the break count switches to them then
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
function rnBreaksLeft(side, now){
  const plan = typeof breakPlanFor === 'function' ? breakPlanFor(side, today) : {breaks: []};
  const all = (plan.breaks || []).filter(b => b.start !== null);
  const open = b => !completedBreaks[breakKeyFor(b.name, today, side)];
  const am = all.filter(b => b.from < RN_PM_FROM), pm = all.filter(b => b.from >= RN_PM_FROM);
  const pmNow = now >= RN_PM_FROM;
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
      rows.push(rnRow(String(br.left.length), `${label} break${br.left.length === 1 ? '' : 's'} left (of ${br.total})${next ? ` · next: ${suDisplayName(next.name)} ${rnClock(next.start)}` : ''}`,
        [esText(br.pm ? 'PM breaks left' : 'AM breaks left', br.left.length, br.total), next ? esText('Next break', suDisplayName(next.name), rnClock(next.start)) : ''].filter(Boolean).join(' · '),
        `setups:boh|${today}|`, br.left.length ? '' : 'ok'));
    }
    const fs = rnFoodSafety();
    rows.push(rnRow(fs ? `${fs.done}/${fs.total}` : '0', 'Food Safety walkthrough today', esText('Food Safety walkthrough'), 'foodsafety', fs && fs.done === fs.total ? 'ok' : ''));
    const w = rnKitchenWaste();
    rows.push(rnRow(rnMoney(w.total), `kitchen waste today${w.top ? ` · most: ${w.top.name} ${rnMoney(w.top.cost)}` : ''}`,
      [esText('Kitchen waste today'), w.top ? esText('Most wasted', w.top.name, rnMoney(w.top.cost)) : ''].filter(Boolean).join(' · '), 'waste', ''));
  }
  rows.push(rnRow('', 'Sign in with your clock-in PIN to see your spot and your break', esText('Sign in to see your spot'), 'signin', ''));
  return {side: 'boh', first: null, rows, title: '', sideSwitch: true};
}

// Nobody signed in: the shift as a whole, or the kitchen's card on a kitchen iPad.
function rnTeamCard(day){
  if(rnDeviceSide() === 'boh') return rnKitchenCard(day);
  const rows = [];
  if(!day.closed){
    const g = rnDaypartGaps('foh', today, rnDaypartIndex('foh', day.now));
    rows.push(rnRow(`${g.m.filled}/${g.m.filled + g.open.length}`, `FOH spots set for ${rnShort(g.dp.name)}`, '', `setups:foh|${today}|${g.dp.name}`, g.open.length ? 'warn' : 'ok'));
    const hand = rnHandoff(today);
    if(hand){
      const done = hand.zones.filter(z => z.done).length;
      rows.push(rnRow(`${done}/${hand.zones.length}`, `zones reset · ${hand.title} at ${rnClock(hand.at)}`, '', `zone:${hand.name}`, done === hand.zones.length ? 'ok' : ''));
    }
    const w = rnWaste();
    rows.push(rnRow(rnMoney(w.total), `waste today, limit ${rnMoney(w.limit)}`, '', 'waste', w.over ? 'bad' : w.near ? 'warn' : 'ok'));
  }
  rows.push(rnRow('', 'Sign in with your clock-in PIN to see your spot and your break', '', 'signin', ''));
  return {side: 'foh', first: null, rows, title: '', sideSwitch: true};
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
  if(v.name && typeof apRightNowRows === 'function') card.rows = card.rows.concat(apRightNowRows());
  return card;
}
function rnCardForRole(v, day){
  if(v.role === 'member') return rnPersonCard(v, day, false);
  if(v.role === 'trainer') return rnPersonCard(v, day, true);
  if(v.role === 'lead') return rnWithRoster(rnLeadCard(v, day, false), day);
  if(v.role === 'admin') return rnWithRoster(rnAdminCard(v, day), day);
  if(v.role === 'director' || v.role === 'manager') return rnWithRoster(rnLeadCard(v, day, true), day);
  return rnTeamCard(day);
}

// ----- Today on the calendar (Tim, Oct 25 2026) -----
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
function rnEvents(day){
  if(typeof eventsOn !== 'function') return null;
  const live = !day.closed;
  const date = live ? today : day.next;
  const all = eventsOn(date);
  const order = {now: 0, soon: 1, later: 2, allday: 3, done: 4};
  const special = all.filter(rnEvSpecial).map(ev => ({ev, when: rnEvWhen(ev, day.now, live)}))
    .sort((a, b) => order[a.when.state] - order[b.when.state]);
  const ongoing = all.filter(ev => !rnEvSpecial(ev));
  let next = null;
  if(live){
    const ids = new Set(all.map(ev => ev.id));
    const list = eventsOn(day.next).filter(rnEvSpecial).filter(ev => !ids.has(ev.id));
    if(list.length) next = {date: day.next, list};
  }
  if(!special.length && !ongoing.length && !next) return null;
  return {date, live, special, ongoing, next};
}

function rnWeekday(iso){ return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'long'}); }

function rnEventsHtml(day, boh){
  const m = rnEvents(day);
  if(!m) return '';
  const es = t => boh && t ? esSpan(t, false) : '';
  const tap = (ev, date) => `data-rn-ev="${escapeHtml(ev.id)}" data-rn-ev-date="${escapeHtml(date)}" role="button" tabindex="0"`;
  const color = ev => (EVENT_KINDS[ev.kind] || EVENT_KINDS.note).color;
  const head = m.live ? 'Today on the calendar' : `${rnWeekday(m.date)} on the calendar`;
  const headEs = m.live ? esText('Today on the calendar') : esText('Next on the calendar');
  const items = m.special.map(({ev, when}) => `
      <div class="rn-ev-item is-${when.state}" ${tap(ev, m.date)} style="--ev:${color(ev)}">
        <span class="rn-ev-main"><b>${escapeHtml(ev.title)}</b>${ev.detail ? `<span class="rn-ev-detail">${escapeHtml(ev.detail)}</span>` : ''}<small>${when.state === 'now' ? '<i class="rn-ev-live" aria-hidden="true"></i>' : ''}${escapeHtml(when.text)}${es(when.es)}</small></span>
        <span class="rn-go">${RN_ICON_GO}</span>
      </div>`).join('');
  const line = (label, labelEs, list, date) => `<div class="rn-ev-line"><b>${escapeHtml(label)}${es(labelEs)}</b>${list.map(ev =>
    `<span class="rn-ev-chip" ${tap(ev, date)} style="--ev:${color(ev)}">${escapeHtml(ev.title)}${ev.from ? ` · ${escapeHtml(evClock(ev.from))}` : ''}</span>`).join('')}</div>`;
  const nextLabel = m.next ? (m.next.date === rnAddDays(today, 1) ? 'Tomorrow' : rnWeekday(m.next.date)) : '';
  return `<section class="rn-ev${m.special.length ? '' : ' is-quiet'}" aria-label="${escapeHtml(head)}">
      ${m.special.length ? `<div class="rn-ev-head">${RN_ICON_CAL}<span>${escapeHtml(head)}${es(headEs)}</span></div>${items}` : ''}
      ${m.ongoing.length ? line('Also running', esText('Also running'), m.ongoing, m.date) : ''}
      ${m.next ? line(nextLabel, nextLabel === 'Tomorrow' ? esText('Tomorrow') : '', m.next.list, m.next.date) : ''}
    </section>`;
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
  const notes = Array.isArray(ev.notes) ? ev.notes : [];
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
  const boh = card.side === 'boh';
  const dp = day.closed ? null : suDaypartsFor(card.side)[rnDaypartIndex(card.side, day.now)];
  const kicker = card.kicker ? `Next up · ${card.kicker}` : day.closed ? 'Closed' : day.now < day.opensAt ? `Before open · ${rnShort(dp.name)} at ${rnClock(day.opensAt)}` : `Right now · ${rnShort(dp.name)}`;
  const kickerEs = card.kicker || day.closed ? '' : esText('Right now') + ' · ' + esDaypart(dp.name);
  const title = card.title || (day.closed ? 'The store is closed' : rnShort(dp.name));
  const roleLabel = RN_ROLE_LABELS[v.role];
  const es = t => boh && t ? esSpan(t, true) : '';
  const go = g => g ? ` data-rn-go="${escapeHtml(g)}" role="button" tabindex="0"` : '';
  root.className = `rn${boh ? ' rn-boh' : ''}`;
  root.innerHTML = `
    <div class="rn-top">
      <span class="rn-kicker">${escapeHtml(kicker)}${boh && kickerEs ? `<span class="es" lang="es"> · ${escapeHtml(kickerEs)}</span>` : ''}</span>
      ${roleLabel ? `<span class="rn-role">${escapeHtml(roleLabel)}</span>` : ''}
      ${card.sideSwitch ? rnSideSwitchHtml() : ''}
    </div>
    <h2 class="rn-title">${escapeHtml(title)}${day.closed ? '' : ` <span class="rn-time">${escapeHtml(rnClock(day.now))}</span>`}</h2>
    ${rnEventsHtml(day, boh)}
    ${card.first ? `<div class="rn-first${card.first.go ? ' is-go' : ''}"${go(card.first.go)}><b>First thing${boh ? `<span class="es" lang="es"> · ${escapeHtml(esText('First thing'))}</span>` : ''}</b><span>${escapeHtml(card.first.text)}</span>${es(card.first.es)}</div>` : ''}
    ${card.roster && card.rosterFirst ? rnRosterHtml(card.roster, card.rosterHead) : ''}
    <div class="rn-list">
      ${card.rows.map(r => `<div class="rn-row${r.go ? ' is-go' : ''}"${go(r.go)}>
          ${r.n !== '' ? `<span class="rn-n${r.tone ? ' is-' + r.tone : ''}">${escapeHtml(r.n)}</span>` : '<span class="rn-n rn-n-dot" aria-hidden="true"></span>'}
          <span class="rn-t">${escapeHtml(r.text)}${es(r.es)}</span>
          ${r.go ? `<span class="rn-go">${RN_ICON_GO}</span>` : ''}
        </div>`).join('')}
    </div>${rnPeaHtml(card.pea, boh)}${card.roster && !card.rosterFirst ? rnRosterHtml(card.roster, card.rosterHead) : ''}`;
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
    zoneHandoffChosen = true;
    launchShowTab('zonereset');
    window.scrollTo({top: 0});
  }
  else if(what === 'waste'){ launchShowTab('wastelog'); window.scrollTo({top: 0}); }
  else if(what === 'headcount'){ launchShowTab('headcount'); window.scrollTo({top: 0}); }
  else if(what === 'schedule' && typeof tsShowDay === 'function') tsShowDay(rest);
  else if(what === 'foodsafety'){ launchShowTab('foodsafety'); window.scrollTo({top: 0}); }
  else if(what === 'prepboard'){ launchShowTab('prepboard'); window.scrollTo({top: 0}); }
  else if(what === 'mine' && typeof apOpenMine === 'function') apOpenMine();
  else if(what === 'credit' && typeof apOpenCredit === 'function') apOpenCredit();
  else if(what === 'ticket' || what === 'tickets'){ launchShowTab('tasks'); window.scrollTo({top: 0}); if(what === 'ticket' && typeof psOpenTicket === 'function') psOpenTicket(rest); }
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
document.getElementById('rightNow').addEventListener('keydown', e => {
  const ev = e.target.closest('[data-rn-ev]');
  if(ev && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); rnOpenEvent(ev.dataset.rnEv, ev.dataset.rnEvDate, ev); return; }
  const t = e.target.closest('[data-rn-go]');
  if(t && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); rnGo(t.dataset.rnGo); }
});

// The minute moves on: keep it current while Home is showing.
setInterval(() => {
  if(document.visibilityState === 'visible' && document.getElementById('homeView').classList.contains('active')) renderRightNow();
}, 60000);

// Set Ups and Waste open on this iPad's side once the saved data is in.
if(typeof stateLoaded !== 'undefined') stateLoaded.then(rnApplyDeviceSide).catch(() => {});
