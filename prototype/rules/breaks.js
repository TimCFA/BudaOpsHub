// Break planner (Tim's policy, SPEC "Breaks"):
//  - shifts of 6 h or more get one 30-minute break;
//  - not in the first or last 2 h of the shift; never 10:00–10:30 or 12:00–1:00;
//  - near the middle of the shift, earlier beats later; quieter hours beat rushes;
//  - at most 2 off at once per side; overlapping breaks start ≥ 10 min apart, ideally ≤ 15
//    (so someone is back within 15 minutes); never two TLs off together;
//  - a hand-moved break (overrides[personId] = start) sticks;
//  - cover = an unplaced person on shift for the whole break, else the Lead Captain
//    (another TL when the Lead Captain is the one off).
// Pure: `now` comes from the store clock.
import { parseTime, fmt } from './time.js';
import { isLeader } from './roster.js';

export const BREAK_LEN = 30;
export const MIN_SHIFT = 360;
export const EDGE = 120;
export const BLACKOUTS = [[600, 630], [720, 780]];
export const MAX_OFF = 2;
export const STAGGER_MIN = 10;
export const STAGGER_PREF = 15;
export const STEP = 5;
// 0 (quiet) … 1 (busiest) by hour of day when there is no productivity upload (the current app's default).
export const DEFAULT_BUSY = { 11: 0.8, 12: 1, 13: 0.7, 16: 0.5, 17: 0.8, 18: 0.9, 19: 0.6 };
const QUIET = 0.2;
// Severity of the 'never' rules when no clean option exists (lower is picked first).
const HARD_RANK = { null: 0, undefined: 0, tooClose: 1, tooManyOff: 2, tlClash: 3 };
export const HARD_TEXT = {
  tooClose: 'no time that starts 10 min after the last break',
  tooManyOff: 'no time with 2 or fewer off',
  tlClash: 'no time without two TLs off together',
};

function toMap(people) {
  if (!people) return new Map();
  if (people instanceof Map) return people;
  if (Array.isArray(people)) return new Map(people.map(p => [p.id, p]));
  return new Map(Object.entries(people));
}

function minutes(entry) {
  const s = parseTime(entry.start);
  let e = parseTime(entry.end);
  if (s == null || e == null) return null;
  if (e <= s) e += 1440;
  return [s, e];
}

function busyAt(busy, t) {
  const h = Math.floor((((t % 1440) + 1440) % 1440) / 60);
  const v = busy && busy[h];
  return v == null ? QUIET : Number(v);
}

export function inBlackout(t, len = BREAK_LEN) {
  return BLACKOUTS.some(([bs, be]) => t < be && t + len > bs);
}

function overlaps(a, b) { return a.start < b.end && b.start < a.end; }

// Break slot for one person: { personId, from, to, mid, tl, start, end, cover, moved, warn }
export function planBreaks({
  side = 'foh', rosterEntries = [], people = [], now = 0, overrides = {}, busy = DEFAULT_BUSY,
  assignments = {}, slots = [], leadCaptainId = null, unplacedIds = [], peaRows = null, scoreFor = null,
} = {}) {
  const pmap = toMap(people);
  const ovr = (overrides && overrides[side] && typeof overrides[side] === 'object' && !Array.isArray(overrides[side])) ? overrides[side] : (overrides || {});
  const warnings = [];

  const eligible = [];
  for (const entry of rosterEntries || []) {
    const m = minutes(entry);
    if (!m) continue;
    const [from, to] = m;
    const person = pmap.get(entry.personId);
    const tl = isLeader(person, entry) === 'tl';
    if (to - from < MIN_SHIFT) continue;
    eligible.push({ personId: entry.personId, from, to, mid: from + (to - from) / 2, tl, entry });
  }
  // Hand-moved breaks are fixed first (by start), then everyone else by shift start.
  const fixed = eligible.filter(p => ovr[p.personId] != null).sort((a, b) => ovr[a.personId] - ovr[b.personId] || a.from - b.from);
  // Plan the earliest starters first, then the longest shifts (the most constrained); ids only break exact ties.
  const rest = eligible.filter(p => ovr[p.personId] == null).sort((a, b) => a.from - b.from || (b.to - b.from) - (a.to - a.from) || String(a.personId).localeCompare(String(b.personId)));

  const plan = [];
  const offAt = t => plan.filter(b => b.start != null && b.start <= t && t < b.end);

  for (const p of fixed) {
    const start = Number(ovr[p.personId]);
    const b = { personId: p.personId, from: p.from, to: p.to, tl: p.tl, start, end: start + BREAK_LEN, cover: null, moved: true, warn: '' };
    if (inBlackout(start)) b.warn = `${fmt(start)} is inside a no-break window`;
    else if (start < p.from + EDGE || start + BREAK_LEN > p.to - EDGE) b.warn = `${fmt(start)} is in the first or last 2 h of the shift`;
    if (b.warn) warnings.push(`${p.personId}: ${b.warn}`);
    plan.push(b);
  }

  for (const p of rest) {
    const options = [];
    const first = p.from + EDGE;
    const last = p.to - EDGE - BREAK_LEN;
    for (let t = first; t <= last; t += STEP) {
      if (inBlackout(t)) continue;
      const cand = { start: t, end: t + BREAK_LEN };
      // Soft cost: near the middle (earlier beats later), quiet hours, few others off.
      let cost = t + BREAK_LEN / 2 <= p.mid ? (p.mid - (t + BREAK_LEN / 2)) / 60 : ((t + BREAK_LEN / 2) - p.mid) / 60 * 1.6;
      cost += busyAt(busy, t) * 3 + busyAt(busy, t + BREAK_LEN - 1) * 1.5;
      // Which 'never' rule an option breaks (none = a clean option): tlClash > tooManyOff > tooClose.
      let hard = null;
      const over = plan.filter(b => b.start != null && overlaps(cand, b));
      for (const b of over) {
        const gap = Math.abs(b.start - t);
        if (gap < STAGGER_MIN) hard = hard || 'tooClose';
        else if (gap > STAGGER_PREF) cost += 0.5; // both off, but the first is not back within 15 min of the second leaving
        if (p.tl && b.tl) hard = 'tlClash';
        cost += 0.4;
      }
      for (let m = t; m < t + BREAK_LEN; m += STEP) if (offAt(m).length >= MAX_OFF) { if (hard !== 'tlClash') hard = 'tooManyOff'; break; }
      options.push({ t, cost, hard });
    }
    options.sort((a, b) => HARD_RANK[a.hard] - HARD_RANK[b.hard] || a.cost - b.cost || a.t - b.t);
    const best = options[0];
    if (!best) {
      plan.push({ personId: p.personId, from: p.from, to: p.to, tl: p.tl, start: null, end: null, cover: null, moved: false, warn: 'no time fits outside the no-break windows', broke: null });
      warnings.push(`${p.personId}: no time fits outside the no-break windows`);
      continue;
    }
    // Every legal minute breaks a 'never' rule: keep the least bad one but say which rule broke.
    const warn = best.hard ? HARD_TEXT[best.hard] : '';
    if (warn) warnings.push(`${p.personId}: ${warn}`);
    plan.push({ personId: p.personId, from: p.from, to: p.to, tl: p.tl, start: best.t, end: best.t + BREAK_LEN, cover: null, moved: false, warn, broke: best.hard || null });
  }

  // Covers, once every time is known.
  const entriesById = new Map((rosterEntries || []).map(e => [e.personId, e]));
  const slotOf = pid => (slots || []).find(s => {
    const a = assignments && (assignments[s.id] ?? assignments[s.raw] ?? assignments[s.name]);
    const id = typeof a === 'string' ? a : a && a.personId;
    return id === pid;
  }) || null;
  const coverCount = new Map();
  // Minutes of the break this person is on shift for; a cover needs the whole break, or at
  // least half of it when nobody covers the whole thing (Harper arriving at 11:00 covers
  // Maria's 10:45 break).
  const overlapMin = (pid, b) => {
    const e = entriesById.get(pid);
    const m = e ? minutes(e) : null;
    return m ? Math.max(0, Math.min(m[1], b.end) - Math.max(m[0], b.start)) : 0;
  };
  const onShiftFor = (pid, b) => overlapMin(pid, b) >= BREAK_LEN;
  const mostlyOn = (pid, b) => overlapMin(pid, b) >= BREAK_LEN / 2;
  const onBreakDuring = (pid, b) => plan.some(x => x.personId === pid && x.start != null && overlaps(x, b));
  const tlOnShift = b => (rosterEntries || []).filter(e => e.personId !== b.personId && isLeader(pmap.get(e.personId), e) === 'tl' && onShiftFor(e.personId, b) && !onBreakDuring(e.personId, b))
    .map(e => e.personId).sort()[0] || null;

  for (const b of plan.slice().sort((a, c) => (a.start ?? 9999) - (c.start ?? 9999))) {
    if (b.start == null) continue;
    const pea = slotOf(b.personId)?.pea || null;
    const scoreOf = pid => (peaRows && scoreFor && pea ? (scoreFor(peaRows, pid, pea).score ?? -1) : -1);
    const remaining = pid => { const m = minutes(entriesById.get(pid)); return m ? m[1] : 0; };
    const rank = (x, y) => (coverCount.get(x) || 0) - (coverCount.get(y) || 0) || scoreOf(y) - scoreOf(x) || remaining(y) - remaining(x) || String(x).localeCompare(String(y));
    const pool = (unplacedIds || []).filter(pid => pid !== b.personId && !onBreakDuring(pid, b));
    const whole = pool.filter(pid => onShiftFor(pid, b)).sort(rank);
    const partial = pool.filter(pid => !onShiftFor(pid, b) && mostlyOn(pid, b)).sort(rank);
    let cover = null;
    if (leadCaptainId && b.personId === leadCaptainId) {
      // The Lead Captain's own break: another TL takes the lead.
      cover = tlOnShift(b) || whole[0] || partial[0] || null;
    } else {
      cover = whole[0] || partial[0] || null;
      if (!cover) {
        if (leadCaptainId && onShiftFor(leadCaptainId, b) && !onBreakDuring(leadCaptainId, b)) cover = leadCaptainId;
        else cover = tlOnShift(b);
      }
    }
    b.cover = cover;
    if (cover) coverCount.set(cover, (coverCount.get(cover) || 0) + 1);
  }

  plan.sort((a, b) => (a.start ?? 9999) - (b.start ?? 9999) || String(a.personId).localeCompare(String(b.personId)));
  const withBack = b => ({ ...b, back: b.end, label: b.start == null ? '' : `${fmt(b.start)}–${fmt(b.end)}` });
  const offNow = plan.filter(b => b.start != null && b.start <= now && now < b.end).map(withBack);
  const upcoming = plan.filter(b => b.start != null && b.start > now).map(withBack);
  return { plan: plan.map(withBack), offNow, next: upcoming.slice(0, 2), upcoming, warnings };
}

// The planned break for one person (or null).
export function breakFor(result, personId) {
  return (result && result.plan || []).find(b => b.personId === personId) || null;
}

// Legal starts for a hand-move sheet: every 5 minutes inside the shift's middle band and outside
// the blackouts. The rest of the constraints are soft for a hand move (it sticks either way).
export function legalStarts(entry) {
  const m = minutes(entry);
  if (!m || m[1] - m[0] < MIN_SHIFT) return [];
  const out = [];
  for (let t = m[0] + EDGE; t <= m[1] - EDGE - BREAK_LEN; t += STEP) if (!inBlackout(t)) out.push(t);
  return out;
}
