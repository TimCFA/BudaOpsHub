// Who is on the floor during a daypart window, hand-off pairs, headcount and names.
import { parseTime } from './time.js';

// Minutes a roster entry covers as [start, end]; an end at or before the start wraps past midnight.
export function entryMinutes(entry) {
  const s = parseTime(entry.start);
  let e = parseTime(entry.end);
  if (s == null || e == null) return null;
  if (e <= s) e += 1440;
  return [s, e];
}

// OnShift = { personId, from, to, arrives, leaves, whole, lastDaypart, entry }.
// A start or end within `edgeMin` of the window edge counts as the whole daypart
// (arrives / leaves stay null). Someone whose overlap with the window is `edgeMin` or less
// is not on this daypart at all.
export function onShift(rosterEntries, window, edgeMin = 10) {
  const out = [];
  for (const entry of rosterEntries || []) {
    const mins = entryMinutes(entry);
    if (!mins) continue;
    const [s, e] = mins;
    if (!(s < window.end && e > window.start)) continue;
    const from = Math.max(window.start, s);
    const to = Math.min(window.end, e);
    if (to - from <= edgeMin) continue;
    const arrives = from > window.start + edgeMin ? from : null;
    const leaves = to < window.end - edgeMin ? to : null;
    out.push({
      personId: entry.personId,
      from, to, arrives, leaves,
      whole: arrives === null && leaves === null,
      lastDaypart: e <= window.end + edgeMin,
      entry,
    });
  }
  return out;
}

// Each early leaver is paired with the closest arrival from `earlyMin` before to `lateMin`
// after their leaving time; each arrival is used once.
// → [{ leaverId, arriverId, at, arrives, gap }]
export function handoffPairs(onShiftList, earlyMin = 60, lateMin = 30) {
  const pairs = [];
  const used = new Set();
  // Leavers are handled earliest first; on the same leaving time the person who has been on the
  // floor longest hands off first (Noor since 6:00 before Emilio and Diego since 11:00).
  const startOf = p => (p.entry && parseTime(p.entry.start)) ?? p.from;
  const leavers = (onShiftList || []).filter(p => p.leaves !== null && p.arrives === null)
    .sort((a, b) => a.leaves - b.leaves || startOf(a) - startOf(b) || String(a.personId).localeCompare(String(b.personId)));
  for (const out of leavers) {
    const cand = (onShiftList || []).filter(p => p !== out && p.arrives !== null && p.leaves === null
      && !used.has(p.personId)
      && p.arrives >= out.leaves - earlyMin && p.arrives <= out.leaves + lateMin)
      .sort((a, b) => Math.abs(a.arrives - out.leaves) - Math.abs(b.arrives - out.leaves)
        || a.arrives - b.arrives || String(a.personId).localeCompare(String(b.personId)))[0];
    if (!cand) continue;
    used.add(cand.personId);
    used.add(out.personId);
    pairs.push({ leaverId: out.personId, arriverId: cand.personId, at: out.leaves, arrives: cand.arrives, gap: Math.max(0, cand.arrives - out.leaves) });
  }
  return pairs;
}

// People on shift minus hand-off pairs (a pair shares one spot).
export function effectiveHeadcount(onShiftList, pairs) {
  return Math.max(0, (onShiftList || []).length - (pairs || []).length);
}

function peopleMap(people) {
  if (!people) return new Map();
  if (people instanceof Map) return people;
  if (Array.isArray(people)) return new Map(people.map(p => [p.id, p]));
  return new Map(Object.entries(people));
}

// First name; last initial only when first names collide inside `ids`; full last name when the
// initials collide too. → { [personId]: 'Maria' | 'Sam D.' }
export function displayNames(people, ids) {
  const map = peopleMap(people);
  const list = Array.from(new Set(ids || [])).map(id => map.get(id) || { id, first: String(id), last: '' });
  const byFirst = new Map();
  for (const p of list) {
    const k = String(p.first || '').trim().toLowerCase();
    byFirst.set(k, (byFirst.get(k) || []).concat(p));
  }
  const out = {};
  for (const p of list) {
    const first = String(p.first || '').trim();
    const same = byFirst.get(first.toLowerCase()) || [];
    if (same.length <= 1) { out[p.id] = first; continue; }
    const last = String(p.last || '').trim();
    const initial = last ? last[0].toUpperCase() : '';
    const sameInitial = same.filter(q => String(q.last || '').trim()[0]?.toUpperCase() === initial);
    if (!initial) out[p.id] = first;
    else if (sameInitial.length > 1) out[p.id] = `${first} ${last}`;
    else out[p.id] = `${first} ${initial}.`;
  }
  return out;
}

// 'tl' | 'trainer' | null. TL from role 'tl' or a leaderShift on the roster; Trainer from role.
// A manager on the floor counts as a TL.
export function isLeader(person, rosterEntry) {
  const role = person && person.role;
  if (role === 'tl' || role === 'manager') return 'tl';
  if (rosterEntry && rosterEntry.leaderShift) return 'tl';
  if (role === 'trainer') return 'trainer';
  return null;
}

// 'TL' | 'TRAINER' | null — the row tag.
export function roleTag(person, rosterEntry) {
  const l = isLeader(person, rosterEntry);
  return l === 'tl' ? 'TL' : l === 'trainer' ? 'TRAINER' : null;
}
