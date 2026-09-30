// "Keep an eye on" and development picks.
//  - keepAnEye: the top 3 non-leaders on shift, one reason each: PEA overdue (≥ 30 days),
//    within 2 positions of all green, or stalled (no PEA on a position they worked in the last
//    14 days, or 4 of their last 5 shifts in the same position).
//  - developPicks: Practice Day ≈ 1 pick per 4 on shift, positions they are not green in yet;
//    Game Day 1 pick, only On the Rise, only with 8+ on shift and a Trainer present.
//    Pairing: a Trainer who is not captaining → a Crushing It team member → a TL.
import { isLeader } from './roster.js';
import { scoreFor, allGreen, peaDueDays } from './tiers.js';
import { slotFromName } from './positions.js';
import { fmt } from './time.js';

export const OVERDUE_DAYS = 30;
export const STALL_DAYS = 14;
export const NEAR_GREEN_MISSING = 2;
export const GAME_MIN_ON_SHIFT = 8;

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

function daysBetween(from, to) {
  const a = dayNum(from), b = dayNum(to);
  return a == null || b == null ? null : b - a;
}

// The PEA position a history slot name maps to (null for cleaning zones etc).
function peaOf(side, slotName) {
  return slotFromName(slotName, side).pea;
}

// assignments[slotId] first, then raw / display names; a bare id string counts.
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

// This person's shifts (history entries) on `side`, oldest first, with the PEA position worked.
function shiftsOf(history, side, personId, date) {
  const out = [];
  for (const h of history || []) {
    if (!h || (side && h.side && h.side !== side)) continue;
    const d = String(h.date || '').slice(0, 10);
    if (date && d > date) continue;
    for (const [slotName, a] of Object.entries(h.assignments || {})) {
      if (slotName.startsWith('__')) continue;
      const pid = typeof a === 'string' ? a : a && a.personId;
      if (pid !== personId) continue;
      out.push({ date: d, daypart: h.daypart, slotName, position: peaOf(side || 'foh', slotName) });
    }
  }
  return out; // history is stored in date + daypart order
}

// Why to keep an eye on this person, or null. One reason, in priority order.
export function eyeReason({ personId, peaRows, history, date, side }) {
  const due = peaDueDays(peaRows, personId, date);
  if (due != null && due >= OVERDUE_DAYS) {
    return { kind: 'overdue', reason: `PEA due, ${due} days`, days: due, weight: 300 + due };
  }
  const ag = allGreen(peaRows, personId, side);
  if (!ag.isAllGreen && ag.missing.length > 0 && ag.missing.length <= NEAR_GREEN_MISSING) {
    const n = ag.missing.length;
    return { kind: 'near-green', reason: `${n} position${n === 1 ? '' : 's'} from all green`, missing: ag.missing, weight: 200 + (NEAR_GREEN_MISSING - n) };
  }
  const shifts = shiftsOf(history, side, personId, date);
  // 4 of the last 5 shifts in the same position.
  const last5 = shifts.slice(-5).filter(s => s.position);
  if (last5.length >= 4) {
    const counts = new Map();
    for (const s of last5) counts.set(s.position, (counts.get(s.position) || 0) + 1);
    const [pos, n] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    if (n >= 4) return { kind: 'stalled', reason: `stalled on ${pos}`, position: pos, weight: 100 + n };
  }
  // No PEA in 14 days on a position they worked in the last 14 days.
  const recent = shifts.filter(s => s.position && daysBetween(s.date, date) != null && daysBetween(s.date, date) <= STALL_DAYS);
  const worked = Array.from(new Set(recent.map(s => s.position)));
  for (const pos of worked) {
    const s = scoreFor(peaRows, personId, pos);
    if (s.count === 0) continue; // never rated there: that is a first PEA, not a stall
    const since = daysBetween(String(s.lastAt).slice(0, 10), date);
    if (since != null && since > STALL_DAYS) return { kind: 'stalled', reason: `stalled on ${pos}`, position: pos, weight: 100 + Math.min(since, 99) / 100 };
  }
  return null;
}

// → [{ personId, reason, kind }] (at most `limit`), team members only.
export function keepAnEye({ onShift = [], people, peaRows = [], history = [], date, side = 'foh', rosterById = {}, limit = 3 } = {}) {
  const pmap = toMap(people);
  const out = [];
  for (const p of onShift) {
    const person = pmap.get(p.personId);
    const entry = rosterById[p.personId] || p.entry || null;
    if (!person || isLeader(person, entry)) continue;
    const r = eyeReason({ personId: p.personId, peaRows, history, date, side });
    if (r) out.push({ personId: p.personId, reason: r.reason, kind: r.kind, weight: r.weight });
  }
  out.sort((a, b) => b.weight - a.weight || String(a.personId).localeCompare(String(b.personId)));
  return out.slice(0, limit).map(({ personId, reason, kind }) => ({ personId, reason, kind }));
}

// Practice ≈ 1 per 4 on shift (at least 1 when anyone is on); Game Day 1 with 8+ and a Trainer.
export function pickBudget(type, onShiftCount, trainerPresent) {
  if (type === 'game') return onShiftCount >= GAME_MIN_ON_SHIFT && trainerPresent ? 1 : 0;
  return onShiftCount > 0 ? Math.max(1, Math.round(onShiftCount / 4)) : 0;
}

function availability(p) {
  if (!p) return '';
  if (p.leaves != null) return `till ${fmt(p.leaves)}`;
  if (p.arrives != null) return `from ${fmt(p.arrives)}`;
  return '';
}

// → [{ personId, slotId, peaPosition, reason, pairedWith, pairReason, score, tier }]
export function developPicks({ dayType, onShift = [], people, peaRows = [], slots = [], assignments = {}, rosterById = {}, date = null } = {}) {
  const type = dayType && typeof dayType === 'object' ? dayType.type : (dayType || 'practice');
  const pmap = toMap(people);
  const leaderOf = id => isLeader(pmap.get(id), rosterById[id] || onShift.find(p => p.personId === id)?.entry);
  const shift = new Map(onShift.map(p => [p.personId, p]));
  const trainers = onShift.filter(p => leaderOf(p.personId) === 'trainer');
  const budget = pickBudget(type, onShift.length, trainers.length > 0);
  if (!budget) return [];

  // Who is placed where (primary person of each slot; a later hand-off holder counts on their slot too).
  const placed = [];
  const captains = new Set();
  for (const slot of slots) {
    const a = assignOf(assignments, slot);
    if (!a) continue;
    placed.push({ slot, personId: a.personId, takesOver: false });
    if (a.handoffTo) placed.push({ slot, personId: a.handoffTo, takesOver: true });
    if (slot.captain) { captains.add(a.personId); if (a.handoffTo) captains.add(a.handoffTo); }
  }

  const cands = [];
  for (const { slot, personId, takesOver } of placed) {
    if (!slot.pea || leaderOf(personId) || !shift.has(personId)) continue;
    const s = scoreFor(peaRows, personId, slot.pea);
    if (type === 'game' && s.tier !== 'rise') continue;
    if (type !== 'game' && s.tier === 'crushing') continue;
    const due = peaDueDays(peaRows, personId, date);
    const on = shift.get(personId);
    cands.push({ personId, slot, score: s.score, tier: s.tier, due, whole: !!on.whole, takesOver, on });
  }
  // Most in need first: never rated, then longest since a PEA, then the lower score; whole daypart first on a tie.
  cands.sort((a, b) => (b.whole ? 1 : 0) - (a.whole ? 1 : 0)
    || (b.due == null ? 9999 : b.due) - (a.due == null ? 9999 : a.due)
    || (a.score == null ? -1 : a.score) - (b.score == null ? -1 : b.score)
    || String(a.personId).localeCompare(String(b.personId)));

  const picks = [];
  const used = new Set();
  const pairedUsed = new Set();
  for (const c of cands) {
    if (picks.length >= budget || used.has(c.personId)) continue;
    used.add(c.personId);
    const tierText = c.score == null ? `never rated on ${c.slot.pea}` : `${c.tier === 'rise' ? 'On the Rise' : c.tier === 'notyet' ? 'Not Yet' : 'Crushing It'} on ${c.slot.pea} (${c.score.toFixed(1)})`;
    const dueText = c.due != null && c.due >= OVERDUE_DAYS ? `PEA due ${c.due} days` : null;
    const reason = [tierText, dueText].filter(Boolean).join(' · ');
    const pair = pickPair({ personId: c.personId, peaPosition: c.slot.pea, onShift, leaderOf, captains, peaRows, exclude: pairedUsed });
    if (pair) pairedUsed.add(pair.personId);
    picks.push({
      personId: c.personId, slotId: c.slot.id, peaPosition: c.slot.pea, reason,
      pairedWith: pair ? pair.personId : null, pairReason: pair ? pair.reason : 'nobody free to pair',
      score: c.score, tier: c.tier,
    });
  }
  return picks;
}

// Trainer not captaining → Crushing It team member on that position → TL. Whole-daypart first.
export function pickPair({ personId, peaPosition, onShift = [], leaderOf, captains = new Set(), peaRows = [], exclude = new Set() }) {
  const others = onShift.filter(p => p.personId !== personId && !exclude.has(p.personId));
  const byStay = (a, b) => (b.whole ? 1 : 0) - (a.whole ? 1 : 0) || (b.to - b.from) - (a.to - a.from) || String(a.personId).localeCompare(String(b.personId));
  const trainer = others.filter(p => leaderOf(p.personId) === 'trainer' && !captains.has(p.personId)).sort(byStay)[0];
  if (trainer) return { personId: trainer.personId, reason: ['Trainer, not captaining', availability(trainer)].filter(Boolean).join(' · ') };
  const green = others.filter(p => !leaderOf(p.personId) && scoreFor(peaRows, p.personId, peaPosition).tier === 'crushing')
    .sort((a, b) => scoreFor(peaRows, b.personId, peaPosition).score - scoreFor(peaRows, a.personId, peaPosition).score || byStay(a, b))[0];
  if (green) return { personId: green.personId, reason: [`Crushing It on ${peaPosition}`, availability(green)].filter(Boolean).join(' · ') };
  const tl = others.filter(p => leaderOf(p.personId) === 'tl').sort(byStay)[0];
  if (tl) return { personId: tl.personId, reason: ['TL', availability(tl)].filter(Boolean).join(' · ') };
  return null;
}

// One line for the Develop sheet header.
export function budgetLine(dayType, onShiftCount, trainerPresent) {
  const type = dayType && typeof dayType === 'object' ? dayType.type : (dayType || 'practice');
  const n = pickBudget(type, onShiftCount, trainerPresent);
  if (type === 'game') {
    if (!n) return onShiftCount < GAME_MIN_ON_SHIFT ? 'Game Day · no picks under 8 on shift' : 'Game Day · no picks without a Trainer';
    return 'Game Day · 1 pick, On the Rise only';
  }
  return `Practice Day · ${n} pick${n === 1 ? '' : 's'} (1 per 4 on shift), positions not green yet`;
}
