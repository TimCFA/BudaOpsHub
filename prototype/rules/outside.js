// The outside rule (Tim, Sep 29): iPOS and OMD are outside. A daypart outside is followed by
// a daypart inside, unless this daypart is the person's last of the shift. A break never resets it.
import { prevDaypart, daypartByKeyOrName } from './dayparts.js';
import { zoneKeyOf, assignFor } from './leaders.js';
import { OUTSIDE_ZONES } from './positions.js';

export function isOutsideKey(side, slotKey) {
  return side === 'foh' && OUTSIDE_ZONES.includes(zoneKeyOf(side, slotKey));
}

// The assignments a person worked in the previous daypart today. `history` is either the
// HistoryEntry[] (date/side/daypart/assignments) or a { [daypartKey]: Assignments } map of
// today's dayparts from the store.
export function previousAssignments({ side, date, prevKey, history, todayAssignmentsByDaypart }) {
  const prev = daypartByKeyOrName(side, prevKey);
  if (!prev) return null;
  const today = todayAssignmentsByDaypart || (history && !Array.isArray(history) ? history : null);
  if (today && today[prev.key]) return today[prev.key];
  if (Array.isArray(history)) {
    const entry = history.find(h => h && String(h.date).slice(0, 10) === date && (!h.side || h.side === side)
      && daypartByKeyOrName(side, h.daypart)?.key === prev.key);
    if (entry) return entry.assignments || {};
  }
  return null;
}

// People who were outside for the whole previous daypart: the primary person on an outside
// slot. Someone who only took the slot over mid-daypart (handoffTo) does not count.
export function outsideAllDaypart(side, assignments) {
  const out = new Set();
  for (const [key, a] of Object.entries(assignments || {})) {
    if (key.startsWith('__') || !isOutsideKey(side, key)) continue;
    const pid = typeof a === 'string' ? a : a && a.personId;
    if (pid) out.add(pid);
  }
  return out;
}

export function outsideFlags({ side = 'foh', date, daypartKey, slots = [], assignments = {}, history = [], onShift = [], todayAssignmentsByDaypart = null }) {
  if (side !== 'foh') return [];
  const prev = prevDaypart(side, daypartKey);
  if (!prev) return [];
  const prevAssignments = previousAssignments({ side, date, prevKey: prev.key, history, todayAssignmentsByDaypart });
  if (!prevAssignments) return [];
  const wasOutside = outsideAllDaypart(side, prevAssignments);
  const shift = new Map((onShift || []).map(p => [p.personId, p]));
  const flags = [];
  for (const slot of slots) {
    if (!slot.outside) continue;
    const a = assignFor(assignments, slot);
    const pid = a && a.personId;
    if (!pid || !wasOutside.has(pid)) continue;
    if (shift.get(pid)?.lastDaypart) continue;
    flags.push({ kind: 'outside-again', text: `outside all ${prev.name} · swap ›`, slotId: slot.id, personId: pid });
  }
  return flags;
}
