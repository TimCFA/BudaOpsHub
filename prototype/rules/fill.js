// Fill: propose people for the Needed slots. Never moves or changes an existing assignment.
//  - Needed = empty slots with rank ≤ effective headcount (people − hand-off pairs).
//  - Captain slots first, leader-first: whole-daypart TLs, whole-daypart Trainers, then
//    part-daypart leaders; leaders are spread across LEADER_ZONE_PRIORITY (with Bagging's reach)
//    before a zone gets a second one. A non-leader only lands on a Captain slot when no leader
//    is free, and then carries a flag.
//  - Team members: the strongest score on the slot's PEA position wins. Soft nudges: on an
//    outside slot someone who was inside all of the previous daypart gets +0.25 (a daypart
//    outside is followed by a daypart inside, so the inside people are due); someone who worked
//    that zone yesterday gets −0.25.
//  - Outside rule (hard): a candidate who was outside all of the previous daypart today is not
//    proposed for an outside slot unless this daypart is their last of the shift.
//  - Game Day: a Not Yet or never-rated candidate is proposed only when nobody else is free,
//    and then carries a flag. Slots nobody can take stay open with 'nobody free'.
import { handoffPairs, effectiveHeadcount, isLeader, displayNames } from './roster.js';
import { LEADER_ZONE_PRIORITY, REQUIRED_LEADER_ZONES, REACH, leadHomeSlot } from './leaders.js';
import { scoreFor } from './tiers.js';
import { slotFromName } from './positions.js';
import { prevDaypart, daypartByKey } from './dayparts.js';
import { fmt } from './time.js';

export const INSIDE_BONUS = 0.25;
export const YESTERDAY_PENALTY = 0.25;

const ZONE_NAMES = { ipos: 'iPOS', bagging: 'Bagging', drinks: 'Drinks', omd: 'OMD', host: 'Host', primary: 'Primary', secondary: 'Secondary', raw: 'Raw', extra: 'Extra hands' };

function toMap(people) {
  if (!people) return new Map();
  if (people instanceof Map) return people;
  if (Array.isArray(people)) return new Map(people.map(p => [p.id, p]));
  return new Map(Object.entries(people));
}

function dayNum(date) {
  const m = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000) : null;
}

function dateMinus(date, days) {
  const n = dayNum(date);
  if (n == null) return null;
  return new Date((n - days) * 86400000).toISOString().slice(0, 10);
}

function assignOf(assignments, slot) {
  if (!assignments || !slot) return null;
  for (const k of [slot.id, slot.raw, slot.name]) {
    const a = k != null ? assignments[k] : null;
    if (a == null || a === '') continue;
    if (typeof a === 'string') return { personId: a };
    if (typeof a === 'object' && a.personId) return a;
  }
  return null;
}

function personOf(a) { return typeof a === 'string' ? a : a && a.personId; }

// The previous daypart's assignments today: from a { [daypartKey]: Assignments } map or from
// HistoryEntry[] (date + side + daypart key or name).
function previousAssignments({ side, date, prevKey, history, todayAssignmentsByDaypart }) {
  const today = todayAssignmentsByDaypart || (history && !Array.isArray(history) ? history : null);
  if (today && today[prevKey]) return today[prevKey];
  if (Array.isArray(history)) {
    const prevName = daypartByKey(side, prevKey)?.name?.toLowerCase();
    const hit = history.find(h => h && String(h.date).slice(0, 10) === date && (!h.side || h.side === side)
      && (h.daypart === prevKey || String(h.daypart || '').toLowerCase().replace(/\s*\(.*\)\s*$/, '') === prevName));
    if (hit) return hit.assignments || {};
  }
  return null;
}

function zoneOfKey(side, key) { return slotFromName(key, side).zone; }
function outsideKey(side, key) { return side === 'foh' && ['ipos', 'omd'].includes(zoneOfKey(side, key)); }

function zonesCovered(zone) { return [zone].concat(REACH[zone] || []); }

export function fill({
  side = 'foh', daypartKey, slots = [], assignments = {}, onShift = [], pairs = null, people = [], rosterById = {},
  peaRows = [], history = [], date = null, dayType = null, todayAssignmentsByDaypart = null, leadCaptainId = null,
} = {}) {
  const type = dayType && typeof dayType === 'object' ? dayType.type : dayType;
  const game = type === 'game';
  const pmap = toMap(people);
  const leaderOf = id => isLeader(pmap.get(id), rosterById[id] || onShift.find(p => p.personId === id)?.entry);
  const prs = pairs || handoffPairs(onShift);
  const headcount = effectiveHeadcount(onShift, prs);

  // Existing placements are frozen: everyone in them (including hand-off takers) is off the table.
  const taken = new Set();
  for (const slot of slots) {
    const a = assignOf(assignments, slot);
    if (a) { taken.add(a.personId); if (a.handoffTo) taken.add(a.handoffTo); }
  }
  for (const [k, a] of Object.entries(assignments || {})) {
    if (k.startsWith('__')) continue;
    const pid = personOf(a);
    if (pid) taken.add(pid);
    if (a && a.handoffTo) taken.add(a.handoffTo);
  }
  const free = onShift.filter(p => !taken.has(p.personId));

  const ranked = slots.map((slot, i) => ({ slot, rank: i + 1 }));
  const needed = ranked.filter(r => r.rank <= headcount && !assignOf(assignments, r.slot));

  // Previous daypart today: who was outside / inside for the whole daypart.
  const prev = side === 'foh' ? prevDaypart(side, daypartKey) : null;
  const prevAssign = prev ? previousAssignments({ side, date, prevKey: prev.key, history, todayAssignmentsByDaypart }) : null;
  const wasOutside = new Set();
  const wasInside = new Set();
  for (const [k, a] of Object.entries(prevAssign || {})) {
    if (k.startsWith('__')) continue;
    const pid = personOf(a);
    if (!pid) continue;
    (outsideKey(side, k) ? wasOutside : wasInside).add(pid);
  }
  wasOutside.forEach(id => wasInside.delete(id));

  // Zones each person worked yesterday (soft avoidance).
  const yesterday = date ? dateMinus(date, 1) : null;
  const yZones = new Map();
  if (yesterday && Array.isArray(history)) {
    for (const h of history) {
      if (!h || String(h.date).slice(0, 10) !== yesterday || (h.side && h.side !== side)) continue;
      for (const [k, a] of Object.entries(h.assignments || {})) {
        const pid = personOf(a);
        if (!pid || k.startsWith('__')) continue;
        if (!yZones.has(pid)) yZones.set(pid, new Set());
        yZones.get(pid).add(zoneOfKey(side, k));
      }
    }
  }

  // Leader coverage per zone (reach counts), kept current as proposals are added.
  const covered = new Set();
  const leadersInZone = new Map();
  // The Lead Captain never counts as a zone's leader cover (brief §4: never also a zone captain).
  const noteLeader = (slot, pid) => {
    if (!leaderOf(pid) || (leadCaptainId && pid === leadCaptainId)) return;
    zonesCovered(slot.zone).forEach(z => covered.add(z));
    leadersInZone.set(slot.zone, (leadersInZone.get(slot.zone) || 0) + 1);
  };
  for (const slot of slots) { const a = assignOf(assignments, slot); if (a) noteLeader(slot, a.personId); }

  const priority = LEADER_ZONE_PRIORITY[side] || [];
  const required = REQUIRED_LEADER_ZONES[side] || [];
  const zoneRank = z => { const i = priority.indexOf(z); return i < 0 ? priority.length : i; };

  const names = displayNames(people, onShift.map(p => p.personId));
  const proposals = [];
  const staysOpen = [];
  const used = new Set();

  const rate = (p, slot) => (slot.pea ? scoreFor(peaRows, p.personId, slot.pea) : { score: null, tier: null, count: 0 });

  function candidatesFor(slot) {
    const pool = free.filter(p => !used.has(p.personId));
    let blocked = 0;
    const ok = pool.filter(p => {
      if (slot.outside && wasOutside.has(p.personId) && !p.lastDaypart) { blocked += 1; return false; }
      // The Lead Captain is never a zone captain: not on a captain slot, and not on a slot in a
      // required zone that has no leader yet (he would become that zone's de-facto leader).
      if (leadCaptainId && p.personId === leadCaptainId && (slot.captain || (required.includes(slot.zone) && !covered.has(slot.zone)))) return false;
      return true;
    });
    return { ok, blocked, poolSize: pool.length };
  }

  // Leaders: whole daypart first, TL before Trainer, then (soft) not the zone they worked yesterday.
  const leaderKey = (p, slot) => {
    const kind = leaderOf(p.personId);
    const whole = p.whole ? 0 : 1;
    const role = kind === 'tl' ? 0 : 1;
    const yesterdayHere = yZones.get(p.personId)?.has(slot.zone) ? 1 : 0;
    return [whole, role, yesterdayHere, -(p.to - p.from), String(p.personId)];
  };
  const cmpKeys = (a, b) => {
    for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; }
    return 0;
  };

  function orderFor(slot, cands) {
    const leaders = cands.filter(p => leaderOf(p.personId)).sort((a, b) => cmpKeys(leaderKey(a, slot), leaderKey(b, slot)));
    const tms = cands.filter(p => !leaderOf(p.personId)).map(p => {
      const s = rate(p, slot);
      let adj = s.score == null ? null : s.score;
      if (adj != null) {
        if (slot.outside && wasInside.has(p.personId)) adj += INSIDE_BONUS;
        if (yZones.get(p.personId)?.has(slot.zone)) adj -= YESTERDAY_PENALTY;
      }
      return { p, s, adj, weak: s.score == null || s.tier === 'notyet' };
    });
    const byStrength = (a, b) => (b.adj == null ? -9 : b.adj) - (a.adj == null ? -9 : a.adj)
      || (b.p.whole ? 1 : 0) - (a.p.whole ? 1 : 0)
      || (b.p.to - b.p.from) - (a.p.to - a.p.from)
      || String(a.p.personId).localeCompare(String(b.p.personId));
    const rated = tms.filter(x => x.s.score != null).sort(byStrength);
    const unrated = tms.filter(x => x.s.score == null).sort(byStrength);
    const strong = rated.filter(x => !x.weak);
    const weak = rated.filter(x => x.weak).concat(unrated);
    const L = leaders.map(p => ({ p, s: null, adj: null, leader: true }));
    const needsLeader = required.includes(slot.zone) && !covered.has(slot.zone);
    if (slot.captain || needsLeader) return L.concat(strong, game ? [] : weak, game ? weak : []);
    if (game) return strong.concat(L, weak);
    return rated.concat(L, unrated);
  }

  function propose(slot, rank, pick, ordered, blocked) {
    const p = pick.p;
    const kind = leaderOf(p.personId);
    const parts = [];
    const flags = [];
    const when = p.leaves != null ? `leaves ${fmt(p.leaves)}` : p.arrives != null ? `from ${fmt(p.arrives)}` : null;
    if (kind) {
      parts.push(kind === 'tl' ? 'TL' : 'Trainer');
      parts.push(p.whole ? 'whole daypart' : when);
      if (slot.captain && (leadersInZone.get(slot.zone) || 0) > 0) parts.push(`second leader on ${ZONE_NAMES[slot.zone] || slot.zone}`);
    } else {
      if (slot.outside) parts.push('outside');
      if (slot.outside && prev && wasInside.has(p.personId)) parts.push(`was inside all ${prev.name}`);
      const rated = ordered.filter(x => x.s && x.s.score != null);
      const topRaw = rated.length ? Math.max(...rated.map(x => x.s.score)) : null;
      if (ordered.length === 1) parts.push('only one free');
      else if (pick.s && pick.s.score != null && rated.length >= 2 && pick.s.score === topRaw) parts.push(`strongest free person on ${ZONE_NAMES[slot.zone] || slot.pea}`);
      if (when) parts.push(when);
      if (!slot.captain && required.includes(slot.zone) && !covered.has(slot.zone)) parts.push('no leader free');
      if (slot.captain) flags.push({ kind: 'non-leader-captain', text: `${names[p.personId] || p.personId} isn’t a leader ›`, slotId: slot.id, personId: p.personId });
      if (game && slot.pea && pick.s) {
        if (pick.s.score == null) flags.push({ kind: 'not-rated-gameday', text: `never rated on ${slot.pea} · Game Day · swap ›`, slotId: slot.id, personId: p.personId });
        else if (pick.s.tier === 'notyet') flags.push({ kind: 'not-yet-gameday', text: `Not Yet on ${slot.pea} · Game Day · swap ›`, slotId: slot.id, personId: p.personId });
      }
    }
    if (blocked && ordered.length === 1) parts.push(`${blocked} would be outside again`);
    used.add(p.personId);
    noteLeader(slot, p.personId);
    proposals.push({
      slotId: slot.id, rank, personId: p.personId, reason: parts.filter(Boolean).join(' · '), flags,
      score: pick.s ? pick.s.score : null, tier: pick.s ? pick.s.tier : null, leader: kind || null,
    });
  }

  function fillOne({ slot, rank }) {
    const { ok, blocked, poolSize } = candidatesFor(slot);
    const ordered = orderFor(slot, ok);
    if (!ordered.length) {
      staysOpen.push({ slotId: slot.id, rank, reason: 'nobody free', blocked, poolSize });
      return;
    }
    propose(slot, rank, ordered[0], ordered, blocked);
  }

  // 0) A free Lead Captain takes the lead's home spot first (Runner / Drinks 3 / FC Bagger / DT
  //    Bagger 2), so no zone ends up with him as its only leader.
  if (leadCaptainId && free.some(p => p.personId === leadCaptainId)) {
    const homeId = leadHomeSlot({ side, daypartKey, slots, headcount, assignments, people, rosterById });
    const home = needed.find(r => r.slot.id === homeId);
    if (home && !(home.slot.captain || (required.includes(home.slot.zone) && !covered.has(home.slot.zone)))) {
      const p = free.find(x => x.personId === leadCaptainId);
      used.add(p.personId);
      proposals.push({ slotId: home.slot.id, rank: home.rank, personId: p.personId, reason: 'Lead Captain’s spot', flags: [], score: null, tier: null, leader: leaderOf(p.personId) || 'tl' });
    }
  }
  // 1) Captain slots, uncovered zones first in leader priority order, then covered zones.
  const captainSlots = needed.filter(r => r.slot.captain);
  const done = new Set();
  while (done.size < captainSlots.length) {
    const next = captainSlots.filter(r => !done.has(r))
      .sort((a, b) => (covered.has(a.slot.zone) ? 1 : 0) - (covered.has(b.slot.zone) ? 1 : 0)
        || zoneRank(a.slot.zone) - zoneRank(b.slot.zone) || a.rank - b.rank)[0];
    done.add(next);
    fillOne(next);
  }
  // 2) Everything else in priority order.
  for (const r of needed) if (!r.slot.captain && !proposals.some(p => p.slotId === r.slot.id)) fillOne(r);

  proposals.sort((a, b) => a.rank - b.rank);
  staysOpen.sort((a, b) => a.rank - b.rank);
  return { proposals, staysOpen, headcount, needed: needed.length, free: free.map(p => p.personId) };
}

// Apply proposals as pending assignments (immutable). Existing keys are never overwritten.
export function applyProposals(assignments, proposals) {
  const out = { ...(assignments || {}) };
  for (const p of proposals || []) {
    if (out[p.slotId]) continue;
    out[p.slotId] = { personId: p.personId, pending: true, proposed: true };
  }
  return out;
}
