// Mi puesto / My spot (#/me): the team member seat (MiPuesto artboard). Read-only cards for the
// person on this phone — Ahora / Después / Tarea / Hoy — built from the same board, break plan and
// task list the leaders see. The EN/ES segment is a real per-device switch (store.setLang); when a
// person is picked under More, store.setMe adopts their language once (ES default for Rafael).
// A manager (Dorian) is not on the roster, so the screen shows Rafael's spot with a note.
//
// Also exports boardFor(): the store → rules wiring (roster, assignments, lead captain, breaks,
// day type → rules/board.js) that Tasks.js and More.js reuse.
import { html } from '../../lib/h.js';
import { Chip, Seg } from '../components/Chip.js';
import { SyncDot } from '../components/Header.js';
import { Card, Label } from '../components/Card.js';
import { dateLabel, daypartName } from '../../state/i18n.js';
import { PEOPLE, personById } from '../../data/people.js';
import { rosterFor, rosterById as rosterMap } from '../../data/roster.js';
import { PEA } from '../../data/pea.js';
import { HISTORY } from '../../data/history.js';
import { CHECKLISTS_BY_KEY } from '../../data/checklists.js';
import { fmt, fmtRange } from '../../rules/time.js';
import { DAYPARTS, daypartAt, daypartByKey, nextDaypart } from '../../rules/dayparts.js';
import { slotsFor } from '../../rules/positions.js';
import { onShift, entryMinutes } from '../../rules/roster.js';
import { leadCaptainOptions, assignFor, zoneName, REACH } from '../../rules/leaders.js';
import { dayType as dayTypeOf } from '../../rules/gameday.js';
import { planBreaks, breakFor } from '../../rules/breaks.js';
import { buildBoard } from '../../rules/board.js';
import { TASKS, isDue } from '../../rules/tasks.js';
import { scoreFor } from '../../rules/tiers.js';

const DEMO_TEAM_MEMBER = 'p-rafael';

// ---------- store → rules wiring (shared) ----------

// boardFor({ state, store, side?, daypartKey?, now? }) → { board, breaks, dp, dpKey, slots, assignments, dayType, entries, rosterById, leadCaptainId }
// daypartKey defaults to store.currentDaypart(side) (the 10-minute look-ahead one).
export function boardFor({ state, store, side, daypartKey = null, now }) {
  const s = side || state.side;
  const at = now != null ? now : state.now;
  const date = state.date;
  const dpKey = daypartKey || store.currentDaypart(s).key;
  const dp = daypartByKey(s, dpKey) || DAYPARTS[s][0];
  const entries = rosterFor(date, s);
  const rosterById = rosterMap(date, s);
  const slots = slotsFor(s, dpKey);
  const assignments = store.dpAssignments(s, dpKey);
  const shift = onShift(entries, dp);

  const placedIds = new Set();
  for (const slot of slots) {
    const a = assignFor(assignments, slot);
    if (a && a.personId) { placedIds.add(a.personId); if (a.handoffTo) placedIds.add(a.handoffTo); }
  }
  const unplacedIds = shift.filter(p => !placedIds.has(p.personId)).map(p => p.personId);

  const leadState = state.leadCaptain && state.leadCaptain[s] ? state.leadCaptain[s][dpKey] : null;
  let leadCaptainId = leadState && leadState.personId ? leadState.personId : null;
  if (!leadCaptainId) {
    const opts = leadCaptainOptions({ side: s, onShift: shift, people: PEOPLE, rosterById, history: HISTORY, date, assignments, slots });
    leadCaptainId = opts.length ? opts[0].personId : null;
  }

  const breaks = planBreaks({
    side: s, rosterEntries: entries, people: PEOPLE, now: at,
    overrides: (state.breakOverrides && state.breakOverrides[s]) || {},
    assignments, slots, leadCaptainId, unplacedIds, peaRows: PEA, scoreFor,
  });
  const dayType = dayTypeOf({ date, override: state.dayTypes ? state.dayTypes[dpKey] : null });
  const board = buildBoard({
    side: s, date, daypartKey: dpKey, now: at, people: PEOPLE, roster: entries, assignments,
    peaRows: PEA, history: HISTORY, dayType, leadCaptainId, breakPlan: breaks,
    todayAssignmentsByDaypart: (state.assignments && state.assignments[s]) || null,
  });
  return { board, breaks, dp, dpKey, slots, assignments, dayType, entries, rosterById, leadCaptainId };
}

// The slot a person holds in one daypart's assignments: { slot, assign, taker: boolean } or null.
function mySlot(slots, assignments, personId) {
  for (const slot of slots) {
    const a = assignFor(assignments, slot);
    if (a && a.personId === personId) return { slot, assign: a, taker: false };
  }
  for (const slot of slots) {
    const a = assignFor(assignments, slot);
    if (a && a.handoffTo === personId) return { slot, assign: a, taker: true };
  }
  return null;
}

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function itemsOf(task) {
  if (!task) return [];
  if (Array.isArray(task.items) && task.items.length) return task.items;
  const cl = task.checklist ? CHECKLISTS_BY_KEY[task.checklist] : null;
  return cl ? cl.items : [];
}

// ---------- the screen ----------

export default function Screen({ store, state, t }) {
  const es = (t.lang || state.lang) === 'es';
  const L = (en, esText) => (es ? esText : en);
  const now = state.now;
  const date = state.date;

  const meRaw = personById(state.me);
  const isManager = !meRaw || meRaw.role === 'manager';
  const person = isManager ? (personById(DEMO_TEAM_MEMBER) || meRaw) : meRaw;
  const pid = person ? person.id : null;
  const side = person && person.side ? person.side : state.side;

  const entry = pid ? rosterMap(date, side)[pid] : null;
  const shiftMins = entry ? entryMinutes(entry) : null;
  const shiftStart = shiftMins ? shiftMins[0] : null;
  const shiftEnd = shiftMins ? shiftMins[1] : null;

  const strict = daypartAt(side, now);
  const cur = boardFor({ state, store, side, daypartKey: strict.key });
  const nd = nextDaypart(side, strict.key);
  const onNext = nd && shiftEnd != null && shiftStart != null && shiftEnd > nd.start + 10 && shiftStart < nd.end;
  const nextBoard = onNext ? boardFor({ state, store, side, daypartKey: nd.key }) : null;

  const names = cur.board.names || {};
  const nameOf = id => (id ? (names[id] || (personById(id) || {}).first || id) : '');

  // ---- Ahora ----
  const held = pid ? mySlot(cur.slots, cur.assignments, pid) : null;
  const shiftRow = cur.board.onShift.find(p => p.personId === pid) || null;
  let current = null;       // { slot, until }
  let laterTake = null;     // { slot, at } when I take a spot later this daypart
  let handOff = null;       // { to, at } when I hand my spot to someone later
  if (held) {
    const at = held.assign.handoffAt != null ? held.assign.handoffAt : (shiftRow && shiftRow.leaves != null ? shiftRow.leaves : null);
    if (held.taker) {
      if (at == null || at <= now) current = { slot: held.slot, until: shiftRow && shiftRow.leaves != null ? shiftRow.leaves : strict.end };
      else laterTake = { slot: held.slot, at };
    } else if (held.assign.handoffTo && at != null && now >= at) {
      current = null; // already handed off
    } else {
      current = { slot: held.slot, until: at != null ? at : strict.end };
      if (held.assign.handoffTo && at != null) handOff = { to: held.assign.handoffTo, at };
    }
  }
  const myBreak = pid ? breakFor(cur.breaks, pid) : null;
  const onBreakNow = myBreak && myBreak.start != null && myBreak.start <= now && now < myBreak.end;

  // Captain of my zone: a captain in the zone, else one whose reach covers it, else the Lead Captain.
  let captain = null;
  if (current) {
    const zone = current.slot.zone;
    const caps = cur.board.rows.filter(r => r.slot.captain && r.personId && r.personId !== pid);
    const direct = caps.find(r => r.slot.zone === zone);
    const reach = caps.find(r => (REACH[r.slot.zone] || []).includes(zone));
    if (direct) captain = { name: direct.name, detail: zoneName(side, direct.slot.zone) };
    else if (reach) captain = { name: reach.name, detail: t('coversZone', { zone: zoneName(side, reach.slot.zone), other: zoneName(side, zone) }) };
    else if (cur.board.lead) captain = { name: cur.board.lead.name, detail: t('leadCaptain') };
  }

  // ---- Después ----
  const later = [];
  if (laterTake) later.push({ time: laterTake.at, text: `→ ${laterTake.slot.name}`, right: daypartName(strict, t.lang) });
  if (handOff) later.push({ time: handOff.at, text: `${L('hand off to', 'le pasas el puesto a')} ${nameOf(handOff.to)}`, right: current ? current.slot.name : '' });
  const nextHeld = nextBoard && pid ? mySlot(nextBoard.slots, nextBoard.assignments, pid) : null;
  if (onNext) {
    const at = nextHeld && nextHeld.taker && nextHeld.assign.handoffAt != null ? nextHeld.assign.handoffAt : Math.max(nd.start, shiftStart != null ? shiftStart : nd.start);
    later.push({ time: at, text: nextHeld ? `→ ${nextHeld.slot.name}` : cap(t('notPlacedYet')), right: daypartName(nd, t.lang) });
  }
  if (myBreak && myBreak.start != null && myBreak.start > now) {
    later.push({ time: myBreak.start, text: t('breakMin', { n: myBreak.end - myBreak.start }), right: myBreak.cover ? t('covers', { name: nameOf(myBreak.cover) }) : '' });
  }
  later.sort((a, b) => a.time - b.time);

  // ---- Tarea: the next task owned by one of my spots (due now first) ----
  const mySlotNames = new Set([current && current.slot.name, laterTake && laterTake.slot.name, nextHeld && nextHeld.slot.name].filter(Boolean));
  const horizon = shiftEnd != null ? shiftEnd : (nd ? nd.end : strict.end);
  const myTasks = TASKS.filter(tk => mySlotNames.has(tk.owner) && (isDue(tk, now) || tk.at > now) && tk.at < horizon).sort((a, b) => a.at - b.at);
  const task = myTasks[0] || null;
  const taskItems = itemsOf(task);
  const taskState = task ? store.taskState(task.id) : null;
  const taskDone = taskState ? taskState.items.length : 0;
  const taskDue = task ? isDue(task, now) : false;
  // The amber card and the red button only when the task is due or starts within 30 min.
  const taskSoon = task ? (taskDue || task.at - now <= 30) : false;

  // ---- Hoy: the day as a timeline ----
  const today = [];
  if (pid && shiftMins) {
    for (const dp of DAYPARTS[side]) {
      if (shiftEnd <= dp.start + 10 || shiftStart >= dp.end - 10) continue;
      const h = mySlot(slotsFor(side, dp.key), store.dpAssignments(side, dp.key), pid);
      const isNow = dp.key === strict.key;
      if (!h && !isNow) continue;
      const time = h && h.taker && h.assign.handoffAt != null ? h.assign.handoffAt : Math.max(dp.start, shiftStart);
      today.push({ time, text: h ? h.slot.name : cap(t('notPlacedYet')), right: isNow ? L('now', 'ahora') : daypartName(dp, t.lang), key: `dp-${dp.key}` });
    }
    const ownedNames = new Set(today.map(r => r.text));
    for (const tk of TASKS) {
      if (!ownedNames.has(tk.owner) || tk.at < shiftStart || tk.at >= shiftEnd) continue;
      today.push({ time: tk.at, text: es ? tk.es : tk.name, right: L('task', 'tarea'), key: tk.id });
    }
    if (myBreak && myBreak.start != null) today.push({ time: myBreak.start, text: t('breakMin', { n: myBreak.end - myBreak.start }), right: myBreak.cover ? t('covers', { name: nameOf(myBreak.cover) }) : '', key: 'break' });
    today.push({ time: shiftEnd, text: t('endOfShift'), right: '', key: 'end' });
    today.sort((a, b) => a.time - b.time);
  }

  const row = (r) => html`<div class="row" key=${r.key || r.time + r.text} style="min-height: 28px">
    <span class="t-time">${fmt(r.time)}</span>
    <span style="font-size: 16px; min-width: 0">${r.text}</span>
    <span class="grow"></span>
    ${r.right ? html`<span style="font-size: 12px; color: var(--ink3); white-space: nowrap">${r.right}</span>` : null}
  </div>`;

  return html`
    <header class="hdr">
      <div class="row">
        <${Chip}>${dateLabel(date, t.lang)} · ${fmt(now)}</${Chip}>
        <span class="grow"></span>
        <${SyncDot} syncState=${state.syncState} t=${t} />
        <${Seg} value=${state.lang} options=${[['en', 'EN'], ['es', 'ES']]} onChange=${l => store.setLang(l)} label=${t('language')} />
      </div>
      <h1 class="title">${t('hello', { name: person ? person.first : '' })}</h1>
      <div class="row" style="font-size: 13px; color: var(--ink3); min-height: 44px; margin: -8px 0; flex-wrap: wrap; row-gap: 0">
        <span style="white-space: nowrap">${entry ? `${t('shift')} ${fmtRange(shiftStart, shiftEnd)} · ${side.toUpperCase()}` : t('noShift')}</span>
        <span class="grow"></span>
        <a class="textbtn red" href="#/more" style="padding: 0 4px; font-size: 13px; white-space: nowrap">${t('notYou')}</a>
      </div>
      ${isManager && meRaw ? html`<div style="font-size: 12px; color: var(--amber-text)">${L(`Showing ${person.first}'s spot: ${meRaw.first} is a manager and isn't on today's roster.`, `Viendo el puesto de ${person.first}: ${meRaw.first} es gerente y no está en el rol de hoy.`)}</div>` : null}
    </header>

    <div class="stack">
      <${Card} rounded>
        <${Label}>${t('ahora')} · ${fmt(now)}</${Label}>
        ${onBreakNow ? html`
          <div class="row"><span style="font-size: 30px; font-weight: 700">${t('breakMin', { n: myBreak.end - myBreak.start })}</span><span class="grow"></span><${Chip}>${t('backAt', { t: fmt(myBreak.end) })}</${Chip}></div>
          ${myBreak.cover ? html`<div style="font-size: 15px; color: var(--ink2)">${t('covering', { name: nameOf(myBreak.cover) })}${current ? ` · ${current.slot.name}` : ''}</div>` : null}`
        : current ? html`
          <div class="row"><span style="font-size: 30px; font-weight: 700; min-width: 0">${current.slot.name}</span><span class="grow"></span><${Chip}>${t('untilT', { t: fmt(current.until) })}</${Chip}></div>
          <div style="font-size: 15px; color: var(--ink2)">${t('zone', { zone: zoneName(side, current.slot.zone) })}${current.slot.sub ? ` · ${current.slot.sub}` : ''}</div>
          ${captain ? html`<div style="font-size: 15px">${t('captainIs')}: <b>${captain.name}</b> <span style="color: var(--ink3)">(${captain.detail})</span></div>` : null}`
        : entry && shiftStart != null && now < shiftStart ? html`
          <div style="font-size: 20px; font-weight: 700">${t('shiftStartsAt', { t: fmt(shiftStart) })}</div>
          <div style="font-size: 14px; color: var(--ink2)">${later[0] ? `${fmt(later[0].time)} ${later[0].text}` : t('notPlacedMe')}</div>`
        : html`
          <div style="font-size: 20px; font-weight: 700">${cap(entry ? t('notPlacedYet') : t('noShift'))}</div>
          ${entry ? html`<div style="font-size: 14px; color: var(--ink2)">${laterTake ? `${fmt(laterTake.at)} → ${laterTake.slot.name}` : t('notPlacedMe')}</div>` : null}`}
      </${Card}>

      ${entry ? html`<${Card} rounded>
        <${Label}>${t('despues')}</${Label}>
        ${later.length ? later.map(r => html`<div class="row" key=${r.time + r.text} style="min-height: 30px">
          <span class="t-time">${fmt(r.time)}</span>
          <span style="font-size: 17px; font-weight: 500; min-width: 0">${r.text}</span>
          <span class="grow"></span>
          ${r.right ? html`<span style="font-size: 13px; color: var(--ink3); white-space: nowrap">${r.right}</span>` : null}
        </div>`) : html`<div style="font-size: 15px; color: var(--ink2)">${L('Nothing else planned before the end of your shift', 'Nada más planeado antes de que acabe tu turno')}</div>`}
      </${Card}>` : null}

      ${task ? html`<${Card} rounded amber=${taskSoon}>
        <${Label} style=${taskSoon ? 'color: var(--amber-text)' : ''}>${taskDue ? `${t('task')} · ${t('now')}` : t('taskAt', { t: fmt(task.at) })} · ${task.owner}</${Label}>
        <div style="font-size: 20px; font-weight: 700">${es ? task.es : task.name}</div>
        <div style="font-size: 14px; color: var(--ink2)">${es ? task.name : task.es} · ${es ? (task.minsEs || task.mins) : task.mins} · <span style="white-space: nowrap">${L("it's yours", 'te toca a ti')}</span></div>
        ${taskSoon
          ? html`<a class="btn" href="#/tasks" style="margin-top: 6px">${taskDone > 0 ? `${L('Continue', 'Seguir')} (${t('progress', { done: taskDone, total: taskItems.length })})` : `${t('startList')} (${taskItems.length})`}</a>`
          : html`<a class="textbtn red" href="#/tasks" style="padding: 0; align-self: flex-start">${t('seeList')} (${taskItems.length}) ›</a>`}
      </${Card}>` : null}

      ${entry ? html`<${Card} rounded>
        <${Label}>${t('hoy')}</${Label}>
        ${today.map(row)}
      </${Card}>` : null}

      <div style="font-size: 12px; color: var(--ink3); padding: 0 4px">${t('readOnly')}</div>
    </div>`;
}
