// Zones, leader coverage flags, Lead Captain rotation and the Lead Captain's working spot.
import { isLeader, displayNames } from './roster.js';
import { fmt, daysBetween, relativeDay } from './time.js';
import { DAYPARTS, daypartByKeyOrName } from './dayparts.js';

// A slot goes in the first zone whose pattern matches its name; anything else is 'extra'.
export const ZONES = {
  foh: [
    { key: 'ipos', name: 'iPOS', re: /ipos/i },
    { key: 'bagging', name: 'Bagging', re: /bagg/i },
    { key: 'drinks', name: 'Drinks', re: /drink|lemonade/i },
    { key: 'omd', name: 'OMD', re: /\bomd\b/i },
    { key: 'host', name: 'Host', re: /host|din+ing|restroom|outside/i },
  ],
  boh: [
    { key: 'primary', name: 'Primary', re: /primar|fries/i },
    { key: 'secondary', name: 'Secondary', re: /secondar|biscuit|eggs/i },
    { key: 'raw', name: 'Raw', re: /breader|machines|filters/i },
  ],
};
export const EXTRA_ZONE = { key: 'extra', name: 'Extra hands' };

export function zoneKeyOf(side, name) {
  const z = (ZONES[side] || []).find(z => z.re.test(String(name || '')));
  return z ? z.key : 'extra';
}

export function zoneName(side, key) {
  const z = (ZONES[side] || []).find(z => z.key === key);
  return z ? z.name : EXTRA_ZONE.name;
}

export const LEADER_ZONE_PRIORITY = { foh: ['ipos', 'bagging', 'host', 'drinks', 'omd'], boh: ['primary', 'raw', 'secondary'] };
export const REQUIRED_LEADER_ZONES = { foh: ['ipos', 'bagging', 'host'], boh: ['primary'] };
// A leader in Bagging also covers Drinks and OMD.
export const REACH = { bagging: ['drinks', 'omd'] };

function toMap(people) {
  if (!people) return new Map();
  if (people instanceof Map) return people;
  if (Array.isArray(people)) return new Map(people.map(p => [p.id, p]));
  return new Map(Object.entries(people));
}

// assignments[slot.id] first, then the raw and display names (history-style maps); a bare
// personId string becomes { personId }.
export function assignFor(assignments, slot) {
  if (!assignments || !slot) return null;
  const keys = [slot.id, slot.raw, slot.name].filter(Boolean);
  for (const k of keys) {
    const a = assignments[k];
    if (a == null || a === '') continue;
    if (typeof a === 'string') return { personId: a };
    if (typeof a === 'object' && a.personId) return a;
  }
  return null;
}

// The zones a leader placed in `zone` covers, with reach.
export function zonesCovered(zone) {
  return [zone].concat(REACH[zone] || []);
}

// Leader flags for one board.
//  - 'no-leader': a required zone has people placed but no leader covers it (reach counts)
//  - 'non-leader-captain': a non-leader holds a Captain slot
//  - 'captain-leaves': a captain leaves mid-daypart handing to a non-leader (or to nobody)
//    and no other leader would still cover that zone
export function leaderFlags({ side, slots, assignments, people, rosterById = {}, onShift = [] }) {
  const pmap = toMap(people);
  const leaderOf = id => (id ? isLeader(pmap.get(id), rosterById[id]) : null);
  const shift = new Map(onShift.map(p => [p.personId, p]));
  const placed = slots.map(slot => ({ slot, assign: assignFor(assignments, slot) })).filter(x => x.assign && x.assign.personId);
  const ids = new Set();
  placed.forEach(({ assign }) => { ids.add(assign.personId); if (assign.handoffTo) ids.add(assign.handoffTo); });
  const names = displayNames(people, Array.from(ids));
  const flags = [];

  // Which zones are covered by a leader (for the whole daypart, ignoring later hand-offs).
  const covered = new Set();
  for (const { slot, assign } of placed) {
    if (leaderOf(assign.personId)) zonesCovered(slot.zone).forEach(z => covered.add(z));
  }
  // A non-leader holding a Captain slot already says the zone has no leader; one flag per cause.
  const captainFlagged = new Set();
  for (const { slot, assign } of placed) {
    if (slot.captain && !leaderOf(assign.personId)) {
      flags.push({ kind: 'non-leader-captain', text: `${names[assign.personId]} isn’t a leader ›`, slotId: slot.id, personId: assign.personId });
      captainFlagged.add(slot.zone);
    }
  }
  for (const zone of REQUIRED_LEADER_ZONES[side] || []) {
    const inZone = placed.filter(x => x.slot.zone === zone);
    if (!inZone.length || covered.has(zone) || captainFlagged.has(zone)) continue;
    const anchor = inZone.find(x => x.slot.captain) || inZone[0];
    flags.push({ kind: 'no-leader', text: `no leader on ${zoneName(side, zone)} ›`, slotId: anchor.slot.id });
  }

  for (const { slot, assign } of placed) {
    const pid = assign.personId;
    if (!slot.captain || !leaderOf(pid)) continue;
    const to = assign.handoffTo || null;
    const at = assign.handoffAt ?? shift.get(pid)?.leaves ?? (to ? shift.get(to)?.arrives : null) ?? null;
    if (to && leaderOf(to)) continue;
    if (!to && shift.get(pid)?.leaves == null) continue; // stays the whole daypart
    // Would another leader still cover this zone after they go?
    const stillCovered = placed.some(x => x.assign.personId !== pid && leaderOf(x.assign.personId)
      && zonesCovered(x.slot.zone).includes(slot.zone));
    if (stillCovered) continue;
    const when = at != null ? ` ${fmt(at)}` : '';
    const text = to ? `${names[pid]} leaves${when} · ${names[to]} isn’t a leader ›` : `${names[pid]} leaves${when} · no leader after ›`;
    flags.push({ kind: 'captain-leaves', text, slotId: slot.id, personId: to || pid });
  }
  return flags;
}

function historyDateOf(entry) { return entry && entry.date ? String(entry.date).slice(0, 10) : null; }
function daypartIndexOf(side, keyOrName) {
  const dp = daypartByKeyOrName(side, keyOrName);
  return dp ? (DAYPARTS[side] || []).indexOf(dp) : -1;
}
function daypartNameOf(side, keyOrName) {
  const dp = daypartByKeyOrName(side, keyOrName);
  return dp ? dp.name : String(keyOrName || '');
}

// Lead Captain candidates: TLs on shift, ordered longest since they last led (never led first),
// TLs already captaining a zone last. → [{ personId, lastLed, daysSince, reason, captaining }]
export function leadCaptainOptions({ side, onShift = [], people, rosterById = {}, history = [], date, assignments = {}, slots = [] }) {
  const pmap = toMap(people);
  const captainOf = new Map();
  for (const slot of slots) {
    if (!slot.captain) continue;
    const a = assignFor(assignments, slot);
    if (a && a.personId) captainOf.set(a.personId, slot);
  }
  const out = [];
  for (const p of onShift) {
    const person = pmap.get(p.personId);
    if (!person || person.role === 'manager') continue;
    if (isLeader(person, rosterById[p.personId]) !== 'tl') continue;
    // Today's earlier dayparts count too: the most recent lead is ordered by (date, daypart index).
    const led = (history || []).filter(h => h && h.leadCaptain === p.personId && (!side || !h.side || h.side === side)
      && historyDateOf(h) && (!date || historyDateOf(h) <= date))
      .map(h => ({ date: historyDateOf(h), daypartIndex: daypartIndexOf(side || h.side || 'foh', h.daypart), daypart: h.daypart }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.daypartIndex - b.daypartIndex);
    const last = led.length ? led[led.length - 1] : null;
    const lastLed = last ? last.date : null;
    const daysSince = lastLed && date ? daysBetween(lastLed, date) : null;
    const cap = captainOf.get(p.personId) || null;
    let reason;
    if (cap) reason = `captaining ${cap.name}`;
    else if (!lastLed) reason = 'hasn’t led yet';
    else if (daysSince === 0) reason = `led ${daypartNameOf(side || 'foh', last.daypart)} today`;
    else if (daysSince === 1) reason = 'led yesterday';
    else reason = `hasn’t led since ${relativeDay(lastLed, date)}`;
    out.push({ personId: p.personId, lastLed, lastLedDaypart: last ? last.daypart : null, lastLedIndex: last ? last.daypartIndex : null, daysSince, reason, captaining: cap ? cap.id : null });
  }
  // Never led first, then longest since last led; on the same day the earlier daypart goes first.
  out.sort((a, b) => (a.captaining ? 1 : 0) - (b.captaining ? 1 : 0)
    || String(a.lastLed || '').localeCompare(String(b.lastLed || ''))
    || (a.lastLedIndex ?? -1) - (b.lastLedIndex ?? -1)
    || String(a.personId).localeCompare(String(b.personId)));
  return out;
}

// The Lead Captain's working spot: Runner when its rank ≤ headcount, else Drinks 3 or FC Bagger
// (the zone with fewer leaders, then the one with fewer people placed); DT Bagger 2 in the
// Afternoon when it is free and within the headcount. `people` / `rosterById` are optional and only sharpen the leader count.
// → slotId | null
export function leadHomeSlot({ side = 'foh', daypartKey, slots = [], headcount = 0, assignments = {}, people, rosterById = {} }) {
  if (side !== 'foh' || !slots.length) return null;
  const rank = slot => slots.indexOf(slot) + 1;
  const free = slot => !assignFor(assignments, slot);
  // DT Bagger 2 in the Afternoon when it is free and staffing reaches it; otherwise the usual logic.
  if (daypartKey === 'afternoon') {
    const dt2 = slots.find(s => /^dt bagg\w* 2$/i.test(s.name));
    if (dt2 && free(dt2) && rank(dt2) <= headcount) return dt2.id;
  }
  const runner = slots.find(s => /^runner$/i.test(s.name));
  if (runner && rank(runner) <= headcount && free(runner)) return runner.id;
  const pmap = toMap(people);
  const leadersIn = zone => slots.filter(s => s.zone === zone).reduce((n, s) => {
    const a = assignFor(assignments, s);
    return n + (a && a.personId && isLeader(pmap.get(a.personId), rosterById[a.personId]) ? 1 : 0);
  }, 0);
  const placedIn = zone => slots.filter(s => s.zone === zone && !free(s)).length;
  const cands = [slots.find(s => /^drinks? 3\b/i.test(s.name)), slots.find(s => /^fc bagg/i.test(s.name))].filter(Boolean);
  if (!cands.length) return runner ? runner.id : null;
  const inRange = cands.filter(s => rank(s) <= headcount && free(s));
  const pool = (inRange.length ? inRange : cands.filter(free)).length ? (inRange.length ? inRange : cands.filter(free)) : cands;
  pool.sort((a, b) => leadersIn(a.zone) - leadersIn(b.zone) || placedIn(a.zone) - placedIn(b.zone) || rank(a) - rank(b));
  return pool[0].id;
}

// Why a spot was chosen for the Lead Captain (for the card).
export function leadHomeReason({ daypartKey, slots = [], slotId, headcount = 0 }) {
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return '';
  if (daypartKey === 'afternoon' && /dt bagg/i.test(slot.name)) return 'Afternoon Lead Captain works DT Bagger 2';
  if (/^runner$/i.test(slot.name)) return slots.indexOf(slot) + 1 <= headcount ? 'staffing reaches Runner' : 'Runner';
  return `${zoneName('foh', slot.zone)} needs a leader more`;
}
