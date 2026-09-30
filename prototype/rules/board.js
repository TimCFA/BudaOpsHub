// The Set Ups board: everything the screen needs for one side + daypart, from precomputed
// inputs only. Never imports fill.js, develop.js or breaks.js.
import { daypartByKey } from './dayparts.js';
import { onShift as shiftFor, handoffPairs, effectiveHeadcount, displayNames, isLeader, roleTag, entryMinutes } from './roster.js';
import { leaderFlags, leadCaptainOptions, leadHomeSlot, leadHomeReason, assignFor } from './leaders.js';
import { outsideFlags } from './outside.js';
import { scoreFor } from './tiers.js';
import { slotsFor } from './positions.js';
import { fmt } from './time.js';

export const EDGE_MIN = 10;

function rosterEntries(roster, date, side) {
  if (Array.isArray(roster)) return roster;
  if (!roster) return [];
  if (roster[date]) return (roster[date][side]) || [];
  if (roster[side] && Array.isArray(roster[side])) return roster[side];
  return [];
}

function toMap(people) {
  if (!people) return new Map();
  if (people instanceof Map) return people;
  if (Array.isArray(people)) return new Map(people.map(p => [p.id, p]));
  return new Map(Object.entries(people));
}

// A break that is running at `now` for this person: { start, end, cover } or null.
function breakNow(breakPlan, personId, now) {
  if (!breakPlan) return null;
  const list = [].concat(breakPlan.offNow || [], breakPlan.plan || []);
  return list.find(b => b && b.personId === personId && b.start != null && b.end != null && now >= b.start && now < b.end) || null;
}

export function buildBoard({
  side = 'foh', date, daypartKey, now = 0, people = [], roster, assignments = {}, peaRows = [],
  history = [], dayType = null, leadCaptainId = null, breakPlan = null, todayAssignmentsByDaypart = null,
  keepAnEye = [], slots = null, edgeMin = EDGE_MIN,
}) {
  const dp = daypartByKey(side, daypartKey);
  const window = dp ? { key: dp.key, name: dp.name, start: dp.start, end: dp.end } : { key: daypartKey, name: daypartKey, start: 0, end: 0 };
  const entries = rosterEntries(roster, date, side);
  const rosterById = Object.fromEntries(entries.map(e => [e.personId, e]));
  const shift = shiftFor(entries, window, edgeMin);
  const shiftById = new Map(shift.map(p => [p.personId, p]));
  const pairs = handoffPairs(shift);
  const headcount = effectiveHeadcount(shift, pairs);
  const slotList = slots || slotsFor(side, daypartKey);
  const pmap = toMap(people);
  const type = dayType && typeof dayType === 'object' ? dayType.type : dayType;

  const ids = new Set(shift.map(p => p.personId));
  for (const slot of slotList) {
    const a = assignFor(assignments, slot);
    if (a && a.personId) ids.add(a.personId);
    if (a && a.handoffTo) ids.add(a.handoffTo);
  }
  if (leadCaptainId) ids.add(leadCaptainId);
  for (const k of keepAnEye || []) if (k && k.personId) ids.add(k.personId);
  if (breakPlan) for (const b of [].concat(breakPlan.offNow || [], breakPlan.plan || [], breakPlan.next || [])) { if (b?.personId) ids.add(b.personId); if (b?.cover) ids.add(b.cover); }
  const names = displayNames(people, Array.from(ids));

  const allFlags = [].concat(
    leaderFlags({ side, slots: slotList, assignments, people, rosterById, onShift: shift }),
    outsideFlags({ side, date, daypartKey, slots: slotList, assignments, history, onShift: shift, todayAssignmentsByDaypart }),
  );

  const rows = slotList.map((slot, i) => {
    const rank = i + 1;
    const assign = assignFor(assignments, slot);
    const pid = assign && assign.personId ? assign.personId : null;
    const person = pid ? pmap.get(pid) : null;
    const on = pid ? shiftById.get(pid) : null;
    const tag = pid ? roleTag(person, rosterById[pid]) : null;
    const flags = allFlags.filter(f => f.slotId === slot.id);

    let scoreChip = null;
    if (pid && !tag && slot.pea) {
      const s = scoreFor(peaRows, pid, slot.pea);
      const star = !!assign.star;
      if (s.score !== null || star) scoreChip = { score: s.score, tier: s.tier, star };
      if (type === 'game' && s.score === null) flags.push({ kind: 'not-rated-gameday', text: 'never rated here · Game Day ›', slotId: slot.id, personId: pid });
      else if (type === 'game' && s.tier === 'notyet') flags.push({ kind: 'not-yet-gameday', text: 'Not Yet here · Game Day ›', slotId: slot.id, personId: pid });
    }

    let note = null;
    if (pid) {
      const brk = breakNow(breakPlan, pid, now);
      const to = assign.handoffTo || null;
      const toOn = to ? shiftById.get(to) : null;
      const at = assign.handoffAt ?? on?.leaves ?? toOn?.arrives ?? null;
      const mins = rosterById[pid] ? entryMinutes(rosterById[pid]) : null;
      if (brk) {
        note = `on break · back ${fmt(brk.end)}` + (brk.cover ? ` · ${names[brk.cover] || brk.cover} covering` : '');
      } else if (to) {
        const arrivesBefore = toOn ? (toOn.arrives === null || (at != null && toOn.arrives < at)) : false;
        note = arrivesBefore && at != null ? `till ${fmt(at)} → ${names[to]}` : `→ ${names[to]}${at != null ? ` ${fmt(at)}` : ''}`;
      } else if (on && on.leaves !== null) {
        note = `leaves ${fmt(on.leaves)}`;
      } else if (on && on.arrives !== null) {
        note = `from ${fmt(on.arrives)}`;
      } else if (slot.outside && mins && mins[1] > window.end + edgeMin) {
        note = `on till ${fmt(mins[1])}`;
      }
    }

    return {
      slot, rank,
      needed: !pid && rank <= headcount,
      folded: !pid && rank > headcount,
      assign: assign || null,
      personId: pid,
      name: pid ? (names[pid] || pid) : null,
      roleTag: tag,
      scoreChip,
      note,
      flags,
    };
  });

  const placed = rows.filter(r => r.personId).length;
  const flagCount = rows.reduce((n, r) => n + r.flags.length, 0);

  // At <time>: the leaving time with the most leavers (earliest on a tie).
  const leavers = shift.filter(p => p.leaves !== null);
  let at1 = null;
  const groups = new Map();
  for (const p of leavers) groups.set(p.leaves, (groups.get(p.leaves) || []).concat(p));
  if (groups.size) {
    const [time, group] = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length || a[0] - b[0])[0];
    const rowOf = pid => rows.find(r => r.personId === pid) || null;
    const handoffs = [];
    const closes = [];
    const opens = [];
    const unpairedAtTime = group.filter(p => !rows.some(r => r.personId === p.personId && r.assign?.handoffTo)
      && !pairs.some(x => x.leaverId === p.personId)).length;
    const after = Math.max(0, headcount - unpairedAtTime);
    const label = fmt(time);
    // A leaver's slot with nobody taking over: still inside the expected range after they go → a gap
    // to cover ('open from 1:00'); outside the range → it closes (folds behind the headcount).
    const leaverRows = group.map(p => {
      const row = rowOf(p.personId);
      const to = row?.assign?.handoffTo || pairs.find(x => x.leaverId === p.personId)?.arriverId || null;
      if (row && to) handoffs.push({ personId: p.personId, toId: to, slotId: row.slot.id, at: row.assign.handoffAt ?? p.leaves });
      const closes1 = !!(row && !to && row.rank > after);
      const opens1 = !!(row && !to && row.rank <= after);
      if (closes1) closes.push({ slotId: row.slot.id, name: row.slot.name, personId: p.personId });
      if (opens1) opens.push({ slotId: row.slot.id, name: row.slot.name, personId: p.personId, at: time });
      const kind = !row ? 'unplaced' : to ? 'handoff' : opens1 ? 'opens' : 'closes';
      const text = !row ? `${names[p.personId]} leaves · not placed yet`
        : to ? `${names[p.personId]} leaves · ${row.slot.name} → ${names[to] || to}`
          : opens1 ? `${names[p.personId]} leaves · ${row.slot.name} open from ${label} ›`
            : `${names[p.personId]} leaves · ${row.slot.name} closes`;
      return { personId: p.personId, name: names[p.personId], slotId: row ? row.slot.id : null, slotName: row ? row.slot.name : null, handoffTo: to, closes: closes1, opens: opens1, kind, text };
    });
    at1 = {
      time, label, leavers: leaverRows, handoffs, closes, opens, headcountAfter: after,
      all: Array.from(groups.entries()).sort((a, b) => a[0] - b[0]).map(([t, g]) => ({ time: t, label: fmt(t), personIds: g.map(p => p.personId) })),
    };
  }

  let lead = null;
  if (leadCaptainId) {
    const opts = leadCaptainOptions({ side, onShift: shift, people, rosterById, history, date, assignments, slots: slotList });
    const opt = opts.find(o => o.personId === leadCaptainId);
    const working = rows.find(r => r.personId === leadCaptainId);
    const homeSlotId = working ? working.slot.id : leadHomeSlot({ side, daypartKey, slots: slotList, headcount, assignments, people, rosterById });
    lead = {
      personId: leadCaptainId,
      name: names[leadCaptainId] || leadCaptainId,
      homeSlotId,
      homeName: slotList.find(s => s.id === homeSlotId)?.name || null,
      homeReason: leadHomeReason({ daypartKey, slots: slotList, slotId: homeSlotId, headcount }),
      reason: opt ? opt.reason : '',
    };
  }

  const placedIds = new Set(rows.filter(r => r.personId).map(r => r.personId));
  rows.forEach(r => { if (r.assign?.handoffTo) placedIds.add(r.assign.handoffTo); });

  return {
    window,
    onShift: shift.map(p => ({ ...p, name: names[p.personId] || p.personId, leader: isLeader(pmap.get(p.personId), rosterById[p.personId]) })),
    pairs,
    headcount,
    names,
    rows,
    counts: { placed, expected: headcount, flags: flagCount, needed: rows.filter(r => r.needed).length, onShift: shift.length },
    lead,
    at1,
    keepAnEye: (keepAnEye || []).map(k => ({ ...k, name: k.name || names[k.personId] || k.personId })),
    unplaced: shift.filter(p => !placedIds.has(p.personId)).map(p => p.personId),
    carriedFrom: assignments && assignments.__carriedFrom ? assignments.__carriedFrom : null,
  };
}
