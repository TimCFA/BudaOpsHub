// Shared context for the Set Ups screen and its sheets: one function that turns the store state
// into everything a board needs (rows, lead, breaks, keep-an-eye, develop picks, flags), plus
// a few string helpers. Pure: reads `state`, never the DOM; every "now" is state.now.
//
//   import { boardContext, L, hrefFor, shiftLabel } from './ctx.js';
//   const ctx = boardContext({ state, side: 'foh', daypartKey: 'lunch', t });
import { DAYPARTS, daypartAt, daypartByKey, nextDaypart, prevDaypart } from '../../rules/dayparts.js';
import { slotsFor, slotById } from '../../rules/positions.js';
import { onShift as shiftFor, isLeader } from '../../rules/roster.js';
import { leadCaptainOptions, leadHomeSlot, assignFor, zonesCovered, zoneName } from '../../rules/leaders.js';
import { buildBoard } from '../../rules/board.js';
import { planBreaks } from '../../rules/breaks.js';
import { keepAnEye, developPicks, budgetLine } from '../../rules/develop.js';
import { dayType as dayTypeOf } from '../../rules/gameday.js';
import { scoreFor, allGreen, peaDueDays, PEA_POSITIONS } from '../../rules/tiers.js';
import { fmt, fmtRange, parseTime } from '../../rules/time.js';
import { PEOPLE, personById } from '../../data/people.js';
import { rosterFor, rosterById as rosterMap } from '../../data/roster.js';
import { PEA } from '../../data/pea.js';
import { HISTORY } from '../../data/history.js';
import { daypartName } from '../../state/i18n.js';

// ---------- extra strings (only what state/i18n.js does not carry) ----------
const EXTRA = {
  en: {
    noTL: 'no TL on shift', worksSpot: 'works {slot}', movesTo: 'steps off captain · moves to {slot}', leavesCaptain: 'steps off captain', setLeadTap: 'tap a name to make them Lead Captain',
    swapName: 'Swap the name on {slot}', backToPreview: '‹ Back to the preview', tapToSwapHint: 'tap a name to put them there instead',
    fillReason: 'Fill · {reason}', staysOpenRow: 'stays open · nobody free', nothingToFill: 'Nothing to fill', proposedNone: 'Fill has nothing to propose',
    handoffPick: 'Hand off {slot} to…', handoffHint: 'people arriving later this daypart', noArrivals: 'Nobody arrives later this daypart',
    moveBreak: 'Move', resetBreak: 'Reset', pickStart: 'Pick a start', moved: 'moved', noBreak: 'no break (under 6 h)', breakLine: '{t} · {cover} covers', breakNoCover: '{t} · nobody free to cover',
    offNowLine: 'Off: {name}, back {t}', nextLine: 'Next: {list}', noneOff: 'nobody off right now',
    place: 'Place ★', placedStar: '★ placed', pairedLine: 'with {name} · {reason}', noPair: 'nobody free to pair', noPicks: 'No picks this daypart',
    notTiered: 'Leaders are not tiered', neverRated: 'never rated', daysAgo: '{n} days ago', lastPeaOn: '{when} on {pos}',
    whoLeaves: 'Who leaves', spotsAfter: '{n} on the floor after', dayparts: 'Dayparts', tapDaypart: 'tap one to show its board',
    switchTo: 'tap to switch to {type}', readOnlyBoard: 'Read-only: your Lead Captain edits this board.',
    changeName: 'Change', clearDone: '{slot} cleared', removeHandoff: 'Remove hand-off', theyLeave: 'leaves {t}', theyArrive: 'from {t}',
    printTitle: 'Set Ups · {date}', empty: 'empty', noRoster: 'no roster', leaderTag: '{role}', captainingX: 'captaining {slot}',
    wasInside: 'was inside all {prev}', wasOutside: 'was outside all {prev}', arrivesTakes: 'arrives {t} · takes {slot}',
    unplacedCount: '{n} not placed', proposedFlags: '{n} flags', oneFlag: '1 flag', star: 'getting a PEA today',
  },
  es: {
    noTL: 'sin TL en turno', worksSpot: 'trabaja en {slot}', movesTo: 'deja de ser capitán · pasa a {slot}', leavesCaptain: 'deja de ser capitán', setLeadTap: 'toca un nombre para ponerlo de Lead Captain',
    swapName: 'Cambiar el nombre en {slot}', backToPreview: '‹ Volver a la vista previa', tapToSwapHint: 'toca un nombre para ponerlo ahí',
    fillReason: 'Fill · {reason}', staysOpenRow: 'queda libre · nadie libre', nothingToFill: 'Nada que llenar', proposedNone: 'Fill no tiene nada que proponer',
    handoffPick: 'Pasar {slot} a…', handoffHint: 'gente que llega después en este bloque', noArrivals: 'Nadie llega después en este bloque',
    moveBreak: 'Mover', resetBreak: 'Regresar', pickStart: 'Escoge una hora', moved: 'movido', noBreak: 'sin descanso (menos de 6 h)', breakLine: '{t} · cubre {cover}', breakNoCover: '{t} · nadie libre para cubrir',
    offNowLine: 'En descanso: {name}, vuelve {t}', nextLine: 'Después: {list}', noneOff: 'nadie en descanso ahorita',
    place: 'Poner ★', placedStar: '★ puesto', pairedLine: 'con {name} · {reason}', noPair: 'nadie libre para acompañar', noPicks: 'Sin picks en este bloque',
    notTiered: 'Los líderes no llevan nivel', neverRated: 'sin PEA', daysAgo: 'hace {n} días', lastPeaOn: '{when} en {pos}',
    whoLeaves: 'Quién se va', spotsAfter: '{n} en el piso después', dayparts: 'Bloques', tapDaypart: 'toca uno para ver su tablero',
    switchTo: 'toca para cambiar a {type}', readOnlyBoard: 'Solo lectura: el Lead Captain edita este tablero.',
    changeName: 'Cambiar', clearDone: '{slot} quedó libre', removeHandoff: 'Quitar el pase', theyLeave: 'se va {t}', theyArrive: 'desde {t}',
    printTitle: 'Set Ups · {date}', empty: 'vacío', noRoster: 'sin rol', leaderTag: '{role}', captainingX: 'capitán de {slot}',
    wasInside: 'estuvo adentro todo {prev}', wasOutside: 'estuvo afuera todo {prev}', arrivesTakes: 'llega {t} · toma {slot}',
    unplacedCount: '{n} sin puesto', proposedFlags: '{n} avisos', oneFlag: '1 aviso', star: 'le toca PEA hoy',
  },
};

function fillVars(str, vars) {
  if (!vars) return str;
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

// L(t, key, vars): a string from the local table (current language, then English), else t(key, vars).
export function L(t, key, vars) {
  const lang = (t && t.lang) || 'en';
  const s = (EXTRA[lang] && EXTRA[lang][key]) != null ? EXTRA[lang][key] : EXTRA.en[key];
  return s != null ? fillVars(s, vars) : t(key, vars);
}

// ---------- small helpers ----------
export function firstName(id, names) {
  if (!id) return '';
  if (names && names[id]) return names[id];
  const p = personById(id);
  return p ? p.first : String(id);
}

export function shiftLabel(entry) {
  if (!entry) return '';
  const s = parseTime(entry.start);
  const e = parseTime(entry.end);
  return s == null || e == null ? '' : fmtRange(s, e);
}

export function roleOf(person, entry) {
  return isLeader(person, entry);
}

export function roleTagText(person, entry) {
  const l = isLeader(person, entry);
  return l === 'tl' ? 'TL' : l === 'trainer' ? 'TRAINER' : null;
}

export function tierText(t, tier) {
  return t(`tier.${tier || 'none'}`);
}

// The daypart on the clock with the 10-minute look-ahead (the "10:50 moment"), from state only.
export function currentDaypartKey(state, side) {
  const dp = daypartAt(side, state.now);
  const nxt = nextDaypart(side, dp.key);
  if (nxt && nxt.start > state.now && nxt.start - state.now <= 10) return nxt.key;
  return dp.key;
}

export function dpAssignmentsOf(state, side, key) {
  return (state.assignments && state.assignments[side] && state.assignments[side][key]) || {};
}

// '#/setups?dp=lunch&sheet=pick&slot=drinks-1' (dp kept from the route so the back button lands on the same board).
export function hrefFor(route, params = {}) {
  const q = { dp: route && route.query && route.query.dp, ...params };
  const qs = Object.entries(q).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
  return `#/setups${qs ? `?${qs}` : ''}`;
}

export function boardSub(t, slot) {
  const parts = [];
  if (slot.sub && !/^lane\s*\d/i.test(slot.sub)) parts.push(slot.sub === 'Captain' ? t('captain') : slot.sub);
  if (slot.outside) parts.push(t('outside'));
  return parts;
}

// Which people were outside / inside for the whole previous daypart today (store assignments).
export function previousOutside(state, side, daypartKey) {
  const prev = side === 'foh' ? prevDaypart(side, daypartKey) : null;
  const out = { prev, outside: new Set(), inside: new Set() };
  if (!prev) return out;
  const prevAssign = dpAssignmentsOf(state, side, prev.key);
  for (const [key, a] of Object.entries(prevAssign)) {
    if (key.startsWith('__')) continue;
    const pid = typeof a === 'string' ? a : a && a.personId;
    if (!pid) continue;
    const slot = slotById(side, prev.key, key);
    (slot && slot.outside ? out.outside : out.inside).add(pid);
  }
  out.outside.forEach(id => out.inside.delete(id));
  return out;
}

// Last date before `date` this person worked a zone, from history ('Thu', 'yesterday', 'Sep 20') or null.
export function lastWorkedZone(side, personId, zone, date) {
  let best = null;
  for (const h of HISTORY) {
    if (h.side !== side || !h.date || h.date >= date) continue;
    for (const [key, pid] of Object.entries(h.assignments || {})) {
      const id = typeof pid === 'string' ? pid : pid && pid.personId;
      if (id !== personId) continue;
      const slot = slotById(side, h.daypart, key);
      if (slot && slot.zone === zone && (!best || h.date > best)) best = h.date;
    }
  }
  return best;
}

// ---------- the board context ----------
export function boardContext({ state, side, daypartKey, t }) {
  const date = state.date;
  const now = state.now;
  const key = daypartKey || currentDaypartKey(state, side);
  const dp = daypartByKey(side, key) || DAYPARTS[side][0];
  const roster = rosterFor(date, side);
  const rosterById = rosterMap(date, side);
  const assignments = dpAssignmentsOf(state, side, dp.key);
  const slots = slotsFor(side, dp.key);
  const dayType = dayTypeOf({ date, override: (state.dayTypes && state.dayTypes[dp.key]) || null });
  const window = { start: dp.start, end: dp.end };
  const shift = shiftFor(roster, window);

  // Lead Captain: the store's choice, else rotation.
  const leadOptions = leadCaptainOptions({ side, onShift: shift, people: PEOPLE, rosterById, history: HISTORY, date, assignments, slots });
  const stored = state.leadCaptain && state.leadCaptain[side] && state.leadCaptain[side][dp.key];
  const leadId = (stored && stored.personId) || (leadOptions[0] && leadOptions[0].personId) || null;

  // Who is on shift and not on the board (breaks use them as covers).
  const placedIds = new Set();
  for (const slot of slots) {
    const a = assignFor(assignments, slot);
    if (a && a.personId) placedIds.add(a.personId);
    if (a && a.handoffTo) placedIds.add(a.handoffTo);
  }
  const unplacedIds = shift.filter(p => !placedIds.has(p.personId)).map(p => p.personId);

  const breaks = planBreaks({
    side, rosterEntries: roster, people: PEOPLE, now, overrides: state.breakOverrides || {},
    assignments, slots, leadCaptainId: leadId, unplacedIds, peaRows: PEA, scoreFor,
  });
  const eye = keepAnEye({ onShift: shift, people: PEOPLE, peaRows: PEA, history: HISTORY, date, side, rosterById });
  const picks = developPicks({ dayType, onShift: shift, people: PEOPLE, peaRows: PEA, slots, assignments, rosterById, date });

  const board = buildBoard({
    side, date, daypartKey: dp.key, now, people: PEOPLE, roster, assignments, peaRows: PEA, history: HISTORY,
    dayType, leadCaptainId: leadId, breakPlan: breaks, todayAssignmentsByDaypart: state.assignments ? state.assignments[side] : null,
    keepAnEye: eye,
  });
  const names = board.names;
  const shiftById = new Map(board.onShift.map(p => [p.personId, p]));

  // Development picks show on the board: ★ on the chip and "getting a PEA here · with Noor till 1:00".
  for (const pick of picks) {
    const row = board.rows.find(r => r.slot.id === pick.slotId && r.personId === pick.personId);
    if (!row) continue;
    row.scoreChip = { ...(row.scoreChip || { score: pick.score, tier: pick.tier }), star: true };
    row.pick = pick;
    const pair = pick.pairedWith ? shiftById.get(pick.pairedWith) : null;
    const pairName = pick.pairedWith ? firstName(pick.pairedWith, names) : null;
    const withText = pairName ? (pair && pair.leaves != null ? t('withTill', { name: pairName, t: fmt(pair.leaves) }) : t('pairedWith', { name: pairName })) : null;
    row.note = [t('gettingPea'), withText].filter(Boolean).join(' · ');
  }

  // Row sub lines (canvas: "Captain · outside · her last daypart, so outside is fine", "Lead Captain's spot",
  // "Captain till 1:00, then Luke reaches Drinks").
  const leaderOf = id => (id ? isLeader(personById(id), rosterById[id]) : null);
  for (const row of board.rows) {
    const parts = boardSub(t, row.slot);
    const on = row.personId ? shiftById.get(row.personId) : null;
    if (row.personId && row.slot.outside && on && on.lastDaypart) parts.push(t('lastDaypart'));
    if (row.personId && board.lead && row.personId === board.lead.personId && !row.slot.captain) parts.push(t('leadSpot'));
    const a = row.assign;
    if (a && a.handoffTo && leaderOf(row.personId) && !leaderOf(a.handoffTo) && !row.slot.captain) {
      const other = board.rows.find(r => r.personId && r.personId !== row.personId && leaderOf(r.personId) && zonesCovered(r.slot.zone).includes(row.slot.zone) && r.slot.zone !== row.slot.zone);
      const at = a.handoffAt != null ? a.handoffAt : (on && on.leaves);
      if (other && at != null) parts.push(t('captainTill', { t: fmt(at), name: firstName(other.personId, names), zone: zoneName(side, row.slot.zone) }));
    }
    row.subText = parts.join(' · ');
  }

  // "carried from Breakfast": the store never marks it, so derive it from the overlap with the previous daypart.
  let carriedFrom = board.carriedFrom;
  const prev = prevDaypart(side, dp.key);
  if (!carriedFrom && prev) {
    const prevAssign = dpAssignmentsOf(state, side, prev.key);
    const prevIds = new Set(Object.values(prevAssign).map(a => (typeof a === 'string' ? a : a && a.personId)).filter(Boolean));
    const overlap = board.rows.filter(r => r.personId && prevIds.has(r.personId)).length;
    if (overlap >= 2) carriedFrom = prev.key;
  }

  const me = personById(state.me);
  const readOnly = !me || me.role === 'tm';

  return {
    side, dp, date, now, roster, rosterById, assignments, slots, dayType, window, shift,
    leadOptions, leadId, breaks, eye, picks, board, names, unplacedIds, carriedFrom,
    prev, next: nextDaypart(side, dp.key), me, readOnly,
    budgetLine: budgetLine(dayType, shift.length, shift.some(p => leaderOf(p.personId) === 'trainer')),
    leaderOf,
    // The spot a new Lead Captain would work: where they already are (a non-captain slot), else
    // leadHomeSlot. `ignoreSlotId` = a captain slot about to be cleared for them (Lead.js).
    homeSlotFor: (personId, ignoreSlotId = null) => {
      const placed = board.rows.find(r => r.personId === personId);
      if (placed && placed.slot.id !== ignoreSlotId) return placed.slot.id;
      const a = ignoreSlotId ? { ...assignments } : assignments;
      if (ignoreSlotId) delete a[ignoreSlotId];
      const id = leadHomeSlot({ side, daypartKey: dp.key, slots, headcount: board.headcount, assignments: a, people: PEOPLE, rosterById });
      const slot = slots.find(s => s.id === id);
      return slot && !assignFor(a, slot) ? id : null;
    },
  };
}

// Placed / expected for every daypart of a side (the All ▾ sheet, the print view).
export function daypartSummaries(state, side, t) {
  return DAYPARTS[side].map(dp => {
    const ctx = boardContext({ state, side, daypartKey: dp.key, t });
    return { key: dp.key, name: daypartName(dp.key), dp, ctx, placed: ctx.board.counts.placed, expected: ctx.board.counts.expected, flags: ctx.board.counts.flags };
  });
}

// Profile numbers for the Person sheet.
export function profileOf(personId, side, date) {
  const positions = PEA_POSITIONS[side] || [];
  const scores = positions.map(pos => ({ position: pos, ...scoreFor(PEA, personId, pos) }));
  const green = allGreen(PEA, personId, side);
  const rows = PEA.filter(r => r.personId === personId).slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const last = rows[0] || null;
  return { scores, green, last, dueDays: peaDueDays(PEA, personId, date) };
}

export { DAYPARTS, daypartByKey, fmt, fmtRange, slotById, slotsFor, PEOPLE, personById, PEA, HISTORY, peaDueDays, scoreFor };

// The At 1:00 line for one leaver, without the name (the strip bolds the name in front of it).
//   'leaves · Drinks 3 → Kendra' · 'leaves · Drinks 2 open from 1:00 ›' · 'leaves · OMD 2 closes' · 'leaves · not placed yet'
export function leaverLine(t, l, names, at1) {
  const name = '';
  const slot = l.slotName || '';
  const to = l.handoffTo ? firstName(l.handoffTo, names) : '';
  const key = l.kind === 'unplaced' ? 'leavesNotPlaced' : l.kind === 'handoff' ? 'leavesTo' : l.kind === 'opens' ? 'leavesOpenFrom' : 'leavesCloses';
  return t(key, { name, slot, to, t: at1 ? at1.label : '' }).replace(/^\s*·?\s*/, '');
}
