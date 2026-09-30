// Tool rules: gameday, develop, fill, breaks, tasks, waste.
// Run: cd prototype && node --test tests/tools.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dayType, isGameDay, dayTypeLabel } from '../rules/gameday.js';
import { keepAnEye, developPicks, pickBudget, budgetLine } from '../rules/develop.js';
import { fill, applyProposals } from '../rules/fill.js';
import { planBreaks, breakFor, legalStarts, inBlackout, BREAK_LEN, MAX_OFF, STAGGER_MIN, STAGGER_PREF } from '../rules/breaks.js';
import { TASKS, dueNow, nextTasks, tasksForDaypart, checklistProgress, durationOf, toggleItem } from '../rules/tasks.js';
import { logEntry, undoLast, todayCount, todayPieces, tape, needsCosts, totalCost } from '../rules/waste.js';

import { slotFromName } from '../rules/positions.js';
import { onShift, handoffPairs } from '../rules/roster.js';

// ---------- fixtures (SPEC roster; last names are initials only) ----------
const P = (id, first, role, last = '') => ({ id: `p-${id}`, first, last, role, side: 'foh', lang: 'en' });
const PEOPLE = [
  P('maria', 'Maria', 'trainer', 'D'), P('luke', 'Luke', 'tl', 'B'), P('brielle', 'Brielle', 'trainer', 'T'),
  P('sofia', 'Sofia', 'tm', 'N'), P('tobias', 'Tobias', 'tm', 'K'), P('emilio', 'Emilio', 'tm', 'A'),
  P('sam', 'Sam', 'tl', 'O'), P('noor', 'Noor', 'trainer', 'N'), P('kendra', 'Kendra', 'tm', 'P'),
  P('sienna', 'Sienna', 'tm', 'C'), P('rafael', 'Rafael', 'tm', 'M'), P('harper', 'Harper', 'tm', 'W'),
  P('diego', 'Diego', 'tm', 'S'), P('yesenia', 'Yesenia', 'tm', 'H'),
];
const R = (id, start, end, leaderShift = false) => ({ personId: `p-${id}`, start, end, leaderShift });
const ROSTER = [
  R('maria', '6:00', '14:00'), R('luke', '10:00', '20:00', true), R('brielle', '6:00', '11:30'), R('sofia', '11:30', '20:00'),
  R('tobias', '6:00', '15:00'), R('emilio', '11:00', '13:00'), R('sam', '10:00', '20:00', true), R('noor', '6:00', '13:00'),
  R('kendra', '12:30', '20:00'), R('sienna', '11:00', '17:00'), R('rafael', '11:00', '17:30'), R('harper', '11:00', '20:00'),
  R('diego', '11:00', '13:00'), R('yesenia', '11:00', '16:00'),
];
const rosterById = Object.fromEntries(ROSTER.map(r => [r.personId, r]));
const DATE = '2026-10-03';
const LUNCH = { start: 660, end: 840 };
const mkSlots = names => names.map(n => slotFromName(n, 'foh'));
const LUNCH_NAMES = ['iPOS 1 (Captain)', 'FC Bagger (Captain)', 'Drinks 1', 'Host 1 (Captain)', 'OMD 1', 'iPOS 2 LANE 1',
  'DT Bagger 2', 'Drinks 2/Sample Prep', 'Runner', 'Drinks 3', 'Host 2', 'OMD 2', 'FC Bagger 2'];
const LUNCH_SLOTS = mkSlots(LUNCH_NAMES);
const pick = ids => ROSTER.filter(r => ids.includes(r.personId.slice(2)));
const shiftOf = (entries, window = LUNCH) => onShift(entries, window);

// PEA rows: five ratings each so scores are exact means.
const rows = (id, position, score, at = '2026-09-25T12:00') => Array.from({ length: 5 }, (_, i) => ({ personId: `p-${id}`, position, score, at: at.replace('25', String(20 + i)), leaderId: 'p-sam' }));
const PEA = [
  ...rows('tobias', 'iPOS', 2.8), ...rows('tobias', 'Bagging', 2.6, '2026-09-10T12:00'), ...rows('tobias', 'Runner', 2.9),
  ...rows('emilio', 'Drinks 2', 2.1), ...rows('emilio', 'iPOS', 2.9), ...rows('emilio', 'Bagging', 2.9), ...rows('emilio', 'Drinks 1/3', 2.9), ...rows('emilio', 'Host', 2.9), ...rows('emilio', 'Runner', 2.9),
  ...rows('sienna', 'OMD', 2.3, '2026-09-02T12:00'),
  ...rows('rafael', 'Drinks 1/3', 2.9), ...rows('rafael', 'Host', 2.8),
  ...rows('harper', 'Bagging', 2.6), ...rows('harper', 'Drinks 1/3', 2.2), ...rows('harper', 'OMD', 2.4), ...rows('harper', 'Host', 2.9),
  ...rows('diego', 'OMD', 2.3), ...rows('diego', 'Drinks 1/3', 2.0), ...rows('diego', 'Bagging', 2.8),
  ...rows('yesenia', 'Drinks 1/3', 1.5), ...rows('yesenia', 'Bagging', 2.1),
  ...rows('sofia', 'Host', 2.4),
];
const BREAKFAST_HISTORY = { date: DATE, side: 'foh', daypart: 'breakfast', leadCaptain: 'p-luke',
  assignments: { 'iPOS 1 (Captain)': 'p-maria', 'iPOS 2 LANE 2': 'p-tobias', 'DT Bagger 1': 'p-diego', 'Drinks 1': 'p-noor', 'Host 1': 'p-brielle', 'FC Bagger': 'p-luke', 'Drinks 3': 'p-sam' } };
const GAME = { type: 'game', reason: 'Saturday' };

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); }
  return o;
}

// =====================================================================
describe('gameday', () => {
  test('Friday and Saturday are Game Days', () => {
    assert.equal(dayType({ date: '2026-10-02' }).type, 'game');
    assert.equal(dayType({ date: '2026-10-03' }).type, 'game');
    assert.equal(dayType({ date: '2026-10-03' }).reason, 'Saturday');
    assert.equal(dayType({ date: '2026-10-05' }).type, 'practice');
  });
  test('two of the three signals make a weekday a Game Day; one does not', () => {
    assert.equal(dayType({ date: '2026-10-06', specialEvent: true }).type, 'practice');
    assert.equal(dayType({ date: '2026-10-06', salesRatio: 1.15 }).type, 'practice');
    assert.equal(dayType({ date: '2026-10-06', salesRatio: 1.14, goalRatio: 1.2 }).type, 'practice');
    assert.equal(dayType({ date: '2026-10-06', specialEvent: true, goalRatio: 1.1 }).type, 'game');
    assert.equal(dayType({ date: '2026-10-06', salesRatio: 1.2, goalRatio: 1.1 }).type, 'game');
    assert.match(dayType({ date: '2026-10-06', salesRatio: 1.2, goalRatio: 1.1 }).reason, /sales 120 % of usual \+ goal 110 %/);
  });
  test('the leader override wins over everything', () => {
    assert.equal(dayType({ date: '2026-10-03', override: 'practice' }).type, 'practice');
    assert.equal(dayType({ date: '2026-10-06', override: 'game' }).type, 'game');
    assert.equal(dayType({ date: '2026-10-06', override: 'game' }).override, true);
    assert.equal(dayType({ date: '2026-10-03', override: 'nonsense' }).type, 'game');
  });
  test('helpers', () => {
    assert.equal(isGameDay(GAME), true);
    assert.equal(isGameDay('practice'), false);
    assert.equal(dayTypeLabel('game'), 'Game Day');
    assert.equal(dayTypeLabel({ type: 'practice' }), 'Practice Day');
  });
});

// =====================================================================
describe('develop · keep an eye on', () => {
  const shift = shiftOf(ROSTER);
  const HIST = [BREAKFAST_HISTORY,
    // Tobias: Bagging four dayparts in a row Tue–Fri (4 of his last 5 shifts, and no Bagging PEA in 14 days)
    { date: '2026-09-29', side: 'foh', daypart: 'lunch', assignments: { 'FC Bagger': 'p-tobias' } },
    { date: '2026-09-30', side: 'foh', daypart: 'lunch', assignments: { 'DT Bagger 2': 'p-tobias' } },
    { date: '2026-10-01', side: 'foh', daypart: 'lunch', assignments: { 'FC Bagger': 'p-tobias' } },
    { date: '2026-10-02', side: 'foh', daypart: 'lunch', assignments: { 'DT Bagger 2': 'p-tobias', 'Drinks 1': 'p-rafael' } },
  ];
  test('PEA overdue ≥ 30 days, within 2 positions of all green, stalled — one reason each, top 3 in that order', () => {
    const out = keepAnEye({ onShift: shift, people: PEOPLE, peaRows: PEA, history: HIST, date: DATE, side: 'foh', rosterById });
    assert.deepEqual(out.map(k => [k.personId, k.reason]), [
      ['p-sienna', 'PEA due, 31 days'],
      ['p-emilio', '2 positions from all green'],
      ['p-tobias', 'stalled on Bagging'],
    ]);
  });
  test('29 days is not overdue; leaders never appear; never rated is not "overdue"', () => {
    const pea = [...rows('sienna', 'OMD', 2.3, '2026-09-04T12:00'), ...rows('maria', 'iPOS', 1.0, '2026-08-01T12:00')];
    const out = keepAnEye({ onShift: shift, people: PEOPLE, peaRows: pea, history: [], date: DATE, side: 'foh', rosterById });
    assert.ok(!out.some(k => k.personId === 'p-sienna' || k.personId === 'p-maria'));
    assert.ok(!out.some(k => k.personId === 'p-kendra'), 'Kendra has no ratings at all and is not "overdue"');
  });
  test('stalled by "no PEA on a position worked in 14 days" alone', () => {
    const pea = rows('rafael', 'Drinks 1/3', 2.9, '2026-09-10T12:00'); // last Drinks rating 23 days ago
    const hist = [{ date: '2026-10-01', side: 'foh', daypart: 'lunch', assignments: { 'Drinks 1': 'p-rafael' } }];
    const out = keepAnEye({ onShift: shift, people: PEOPLE, peaRows: pea, history: hist, date: DATE, side: 'foh', rosterById });
    assert.deepEqual(out, [{ personId: 'p-rafael', reason: 'stalled on Drinks 1/3', kind: 'stalled' }]);
  });
  test('stalled by "4 of the last 5 shifts in the same position" alone', () => {
    const pea = rows('harper', 'Host', 2.5, '2026-10-01T12:00');
    const hist = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map((date, i) => ({
      date, side: 'foh', daypart: 'lunch', assignments: { [i === 2 ? 'Drinks 1' : 'Host 2']: 'p-harper' } }));
    const out = keepAnEye({ onShift: shift, people: PEOPLE, peaRows: pea, history: hist, date: DATE, side: 'foh', rosterById });
    assert.deepEqual(out.map(k => k.reason), ['stalled on Host']);
  });
  test('at most three, by priority then magnitude', () => {
    const pea = [...rows('sienna', 'OMD', 2.3, '2026-08-20T12:00'), ...rows('yesenia', 'Host', 2.0, '2026-08-25T12:00'),
      ...rows('rafael', 'Drinks 1/3', 2.9, '2026-08-30T12:00'), ...rows('diego', 'OMD', 2.0, '2026-08-31T12:00')];
    const out = keepAnEye({ onShift: shift, people: PEOPLE, peaRows: pea, history: [], date: DATE, side: 'foh', rosterById });
    assert.equal(out.length, 3);
    assert.deepEqual(out.map(k => k.personId), ['p-sienna', 'p-yesenia', 'p-rafael']);
  });
});

describe('develop · picks', () => {
  const shift = shiftOf(ROSTER);
  const ASSIGN = {
    'ipos-1': { personId: 'p-maria' }, 'fc-bagger': { personId: 'p-luke' }, 'host-1': { personId: 'p-brielle', handoffTo: 'p-sofia', handoffAt: 690 },
    'ipos-2': { personId: 'p-tobias' }, 'drinks-2': { personId: 'p-emilio' }, 'runner': { personId: 'p-sam' },
    'drinks-3': { personId: 'p-noor', handoffTo: 'p-kendra', handoffAt: 780 }, 'omd-2': { personId: 'p-sienna' },
    'drinks-1': { personId: 'p-rafael' }, 'omd-1': { personId: 'p-diego' }, 'dt-bagger-2': { personId: 'p-harper' }, 'host-2': { personId: 'p-yesenia' },
  };
  const args = extra => ({ dayType: GAME, onShift: shift, people: PEOPLE, peaRows: PEA, slots: LUNCH_SLOTS, assignments: ASSIGN, rosterById, date: DATE, ...extra });

  test('Game Day: one pick, On the Rise only, most overdue first, paired with a Trainer who is not captaining', () => {
    const picks = developPicks(args());
    assert.equal(picks.length, 1);
    const [p] = picks;
    assert.equal(p.personId, 'p-sienna');
    assert.equal(p.slotId, 'omd-2');
    assert.equal(p.peaPosition, 'OMD');
    assert.match(p.reason, /On the Rise on OMD \(2\.3\)/);
    assert.match(p.reason, /PEA due 31 days/);
    assert.equal(p.pairedWith, 'p-noor', 'Maria and Brielle are captaining; Noor is the free Trainer');
    assert.match(p.pairReason, /Trainer, not captaining · till 1:00/);
  });
  test('Game Day never picks a Not Yet or never-rated person', () => {
    const pea = [...rows('yesenia', 'Host', 1.2), ...rows('diego', 'OMD', 1.0)]; // Kendra never rated on Drinks
    assert.deepEqual(developPicks(args({ peaRows: pea })), []);
  });
  test('Game Day budget: nothing under 8 on shift or without a Trainer present', () => {
    const seven = shiftOf(pick(['luke', 'sam', 'noor', 'sienna', 'rafael', 'harper', 'yesenia']));
    assert.equal(seven.length, 7);
    assert.deepEqual(developPicks(args({ onShift: seven })), []);
    const noTrainer = shiftOf(pick(['luke', 'sam', 'tobias', 'sienna', 'rafael', 'harper', 'yesenia', 'diego', 'emilio', 'sofia']));
    assert.ok(noTrainer.length >= 8);
    assert.deepEqual(developPicks(args({ onShift: noTrainer })), []);
    assert.equal(pickBudget('game', 8, true), 1);
    assert.equal(pickBudget('game', 8, false), 0);
    assert.equal(pickBudget('game', 7, true), 0);
    assert.match(budgetLine('game', 7, true), /under 8/);
  });
  test('Practice Day: about one pick per four on shift, positions not green yet (never rated counts)', () => {
    assert.equal(pickBudget('practice', 14, true), 4);
    assert.equal(pickBudget('practice', 4, false), 1);
    assert.equal(pickBudget('practice', 2, false), 1);
    const picks = developPicks(args({ dayType: 'practice' }));
    assert.equal(picks.length, 4);
    assert.ok(picks.every(p => p.tier !== 'crushing'));
    assert.ok(picks.some(p => p.personId === 'p-kendra' && /never rated on Drinks 1\/3/.test(p.reason)));
    assert.equal(new Set(picks.map(p => p.personId)).size, 4, 'one pick per person');
    assert.ok(!picks.some(p => p.personId === 'p-rafael'), 'Rafael is Crushing It on Drinks — not a practice pick');
  });
  test('pairing order: Trainer not captaining → Crushing It team member → TL', () => {
    // No free Trainer (Noor and Brielle off shift, Maria captaining): Emilio (Crushing It on Drinks 1/3) pairs with the pick on Drinks.
    const shift2 = shiftOf(ROSTER.filter(r => !['p-noor', 'p-brielle'].includes(r.personId)));
    const assign = { 'ipos-1': { personId: 'p-maria' }, 'runner': { personId: 'p-sam' }, 'fc-bagger': { personId: 'p-luke' }, 'drinks-3': { personId: 'p-kendra' }, 'host-1': { personId: 'p-sofia' } };
    const picks = developPicks(args({ dayType: 'practice', onShift: shift2, assignments: assign, peaRows: [...rows('emilio', 'Drinks 1/3', 3.0), ...rows('sofia', 'Host', 2.2)] }));
    const p1 = picks.find(p => p.personId === 'p-kendra');
    assert.equal(p1.pairedWith, 'p-emilio');
    assert.match(p1.pairReason, /Crushing It on Drinks 1\/3/);
    // Nobody Crushing It on Host → a TL.
    const p2 = picks.find(p => p.personId === 'p-sofia');
    assert.equal(p2.pairedWith, 'p-luke');
    assert.equal(p2.pairReason, 'TL');
    // With a free Trainer, the Trainer comes first.
    const withAvah = developPicks(args({ dayType: 'practice', onShift: shiftOf(ROSTER.filter(r => r.personId !== 'p-noor')), assignments: assign, peaRows: [...rows('emilio', 'Drinks 1/3', 3.0), ...rows('sofia', 'Host', 2.2)] }));
    assert.equal(withAvah.find(p => p.personId === 'p-kendra').pairedWith, 'p-brielle');
  });
});

// =====================================================================
describe('fill', () => {
  const base = extra => {
    const shift = extra.onShift || shiftOf(extra.roster || ROSTER);
    return {
      side: 'foh', daypartKey: 'lunch', slots: LUNCH_SLOTS, assignments: {}, onShift: shift, pairs: handoffPairs(shift),
      people: PEOPLE, rosterById, peaRows: PEA, history: [BREAKFAST_HISTORY], date: DATE, dayType: GAME, ...extra,
    };
  };
  const STORY_ASSIGN = {
    'ipos-1': { personId: 'p-maria' }, 'fc-bagger': { personId: 'p-luke' }, 'host-1': { personId: 'p-brielle', handoffTo: 'p-sofia', handoffAt: 690 },
    'ipos-2': { personId: 'p-tobias' }, 'drinks-2': { personId: 'p-emilio' }, 'runner': { personId: 'p-sam' },
    'drinks-3': { personId: 'p-noor', handoffTo: 'p-kendra', handoffAt: 780 }, 'omd-2': { personId: 'p-sienna' },
  };

  test('the canvas story: Rafael → Drinks 1, Diego → OMD 1, Harper → DT Bagger 2, Yesenia → Host 2 with a flag', () => {
    const out = fill(base({ assignments: STORY_ASSIGN, leadCaptainId: 'p-sam' }));
    assert.equal(out.headcount, 12);
    assert.deepEqual(out.proposals.map(p => [p.slotId, p.personId]), [
      ['drinks-1', 'p-rafael'], ['omd-1', 'p-diego'], ['dt-bagger-2', 'p-harper'], ['host-2', 'p-yesenia'],
    ]);
    const by = Object.fromEntries(out.proposals.map(p => [p.slotId, p]));
    assert.equal(by['drinks-1'].reason, 'strongest free person on Drinks');
    assert.equal(by['omd-1'].reason, 'outside · was inside all Breakfast · leaves 1:00');
    assert.equal(by['host-2'].reason, 'only one free');
    assert.deepEqual(by['host-2'].flags.map(f => f.kind), ['not-rated-gameday']);
    assert.equal(by['host-2'].flags[0].text, 'never rated on Host · Game Day · swap ›');
    assert.deepEqual(out.staysOpen, [], 'FC Bagger 2 is rank 13 > 12 effective people, so it is not Needed');
  });

  test('never modifies or moves an existing assignment, even a weak hand placement', () => {
    // Rafael was placed by hand on Host 2 although he is the strongest on Drinks.
    const assignments = deepFreeze({ ...STORY_ASSIGN, 'host-2': { personId: 'p-rafael' } });
    const snapshot = JSON.stringify(assignments);
    const out = fill(base({ assignments }));
    assert.equal(JSON.stringify(assignments), snapshot);
    assert.ok(!out.proposals.some(p => p.personId === 'p-rafael'), 'a placed person is never re-proposed');
    assert.ok(!out.proposals.some(p => p.slotId === 'host-2'), 'a filled slot is never proposed for');
    assert.ok(!out.proposals.some(p => Object.prototype.hasOwnProperty.call(assignments, p.slotId)));
    // Applying proposals never overwrites either.
    const applied = applyProposals(assignments, [{ slotId: 'host-2', personId: 'p-harper' }, { slotId: 'drinks-1', personId: 'p-harper' }]);
    assert.equal(applied['host-2'].personId, 'p-rafael');
    assert.deepEqual(applied['drinks-1'], { personId: 'p-harper', pending: true, proposed: true });
    assert.equal(assignments['drinks-1'], undefined);
  });

  test('fills only Needed slots (rank ≤ effective headcount)', () => {
    const roster = pick(['luke', 'rafael', 'harper', 'yesenia']);
    const out = fill(base({ roster }));
    assert.equal(out.headcount, 4);
    assert.ok(out.proposals.every(p => p.rank <= 4));
    assert.ok(!out.proposals.some(p => p.slotId === 'omd-1'), 'rank 5 is folded, not Needed');
    assert.deepEqual(out.staysOpen, []);
  });

  test('captain slots leader-first: whole-daypart TL, whole-daypart Trainer, then part-daypart leaders', () => {
    const roster = pick(['luke', 'noor', 'maria', 'rafael', 'harper']);
    const out = fill(base({ roster }));
    const by = Object.fromEntries(out.proposals.map(p => [p.slotId, p.personId]));
    assert.equal(by['ipos-1'], 'p-luke', 'iPOS 1 (first leader zone) gets the whole-daypart TL');
    assert.equal(by['fc-bagger'], 'p-maria', 'Bagging gets the whole-daypart Trainer');
    assert.equal(by['host-1'], 'p-noor', 'Host gets the Trainer who leaves at 1:00');
    assert.equal(by['drinks-1'], 'p-rafael');
    const reasons = Object.fromEntries(out.proposals.map(p => [p.slotId, p.reason]));
    assert.equal(reasons['ipos-1'], 'TL · whole daypart');
    assert.equal(reasons['host-1'], 'Trainer · leaves 1:00');
    assert.ok(out.proposals.filter(p => LUNCH_SLOTS.find(s => s.id === p.slotId).captain).every(p => p.flags.length === 0));
  });

  test('spreads leaders across zones in priority order before doubling; a non-leader captain carries a flag', () => {
    const slots = mkSlots(['iPOS 1 (Captain)', 'iPOS 2 (Captain)', 'Host 1 (Captain)', 'Drinks 1', 'Runner']);
    const roster = pick(['luke', 'maria', 'rafael', 'harper', 'yesenia']);
    const out = fill(base({ slots, roster, dayType: 'practice' }));
    const by = Object.fromEntries(out.proposals.map(p => [p.slotId, p]));
    assert.equal(by['ipos-1'].personId, 'p-luke');
    assert.equal(by['host-1'].personId, 'p-maria', 'the second leader goes to the uncovered Host zone, not to a second iPOS captain');
    assert.ok(!['p-luke', 'p-maria'].includes(by['ipos-2'].personId));
    assert.deepEqual(by['ipos-2'].flags.map(f => f.kind), ['non-leader-captain']);
    assert.match(by['ipos-2'].flags[0].text, /isn’t a leader ›/);
    // On a Game Day that never-rated non-leader captain carries both flags.
    const game = fill(base({ slots, roster }));
    assert.deepEqual(game.proposals.find(p => p.slotId === 'ipos-2').flags.map(f => f.kind), ['non-leader-captain', 'not-rated-gameday']);
    // Three leaders: the third doubles up on iPOS only after every zone with a captain slot has one.
    const three = fill(base({ slots, roster: pick(['luke', 'maria', 'noor', 'rafael', 'harper']), dayType: 'practice' }));
    assert.equal(three.proposals.find(p => p.slotId === 'ipos-2').personId, 'p-noor');
    assert.match(three.proposals.find(p => p.slotId === 'ipos-2').reason, /second leader on iPOS/);
  });

  test('a required zone without a leader pulls a free leader even onto a non-captain slot', () => {
    const slots = mkSlots(['iPOS 1', 'Drinks 1', 'Host 1', 'Runner']);
    const roster = pick(['luke', 'rafael', 'harper']);
    const out = fill(base({ slots, roster }));
    assert.equal(out.proposals.find(p => p.slotId === 'ipos-1').personId, 'p-luke');
  });

  test('prefers the strongest score on the slot’s PEA position', () => {
    const slots = mkSlots(['Drinks 1', 'Host 2']);
    const roster = pick(['rafael', 'harper']);
    const out = fill(base({ slots, roster, dayType: 'practice' }));
    assert.deepEqual(out.proposals.map(p => [p.slotId, p.personId]), [['drinks-1', 'p-rafael'], ['host-2', 'p-harper']]);
    assert.equal(out.proposals[0].reason, 'strongest free person on Drinks');
  });

  test('outside rule: someone outside all of the previous daypart is not proposed for an outside slot', () => {
    // Tobias was on iPOS 2 all Breakfast and works till 3:00 → not for OMD 1 (Harper takes it), but fine on Runner.
    const slots = mkSlots(['Drinks 1', 'OMD 1', 'Runner']);
    const out = fill(base({ slots, roster: pick(['tobias', 'rafael', 'harper']) }));
    assert.deepEqual(out.proposals.map(p => [p.slotId, p.personId]), [['drinks-1', 'p-rafael'], ['omd-1', 'p-harper'], ['runner', 'p-tobias']]);
    // Even when he is the only one left, OMD 1 stays open rather than putting him outside again.
    const open = fill(base({ slots: mkSlots(['Drinks 1', 'OMD 1']), roster: pick(['tobias', 'rafael']) }));
    assert.deepEqual(open.proposals.map(p => [p.slotId, p.personId]), [['drinks-1', 'p-rafael']]);
    assert.deepEqual(open.staysOpen.map(s => [s.slotId, s.reason]), [['omd-1', 'nobody free']]);
    assert.equal(open.staysOpen[0].blocked, 1);
  });

  test('outside rule: the last daypart of the shift is exempt; a break never resets it', () => {
    // Maria was on iPOS 1 all Breakfast; Lunch is her last daypart → she may captain iPOS 1 again.
    const slots = mkSlots(['iPOS 1 (Captain)']);
    const out = fill(base({ slots, roster: pick(['maria']) }));
    assert.deepEqual(out.proposals.map(p => [p.slotId, p.personId]), [['ipos-1', 'p-maria']]);
    // The previous daypart may also come as the store map of today's dayparts.
    const today = { breakfast: { 'ipos-2': { personId: 'p-tobias' } } };
    const out2 = fill(base({ slots: mkSlots(['OMD 1']), roster: pick(['tobias']), history: [], todayAssignmentsByDaypart: today }));
    assert.deepEqual(out2.staysOpen.map(s => s.slotId), ['omd-1']);
  });

  test('on an outside slot, someone who was inside all of the previous daypart is preferred (soft)', () => {
    const slots = mkSlots(['OMD 1']);
    const out = fill(base({ slots, roster: pick(['harper', 'diego']) }));
    assert.equal(out.proposals[0].personId, 'p-diego', 'Diego 2.3 (inside all Breakfast) over Harper 2.4 (not on Breakfast)');
    assert.match(out.proposals[0].reason, /was inside all Breakfast/);
    // A clearly stronger person still wins.
    const pea = [...rows('harper', 'OMD', 2.9), ...rows('diego', 'OMD', 2.3)];
    assert.equal(fill(base({ slots, roster: pick(['harper', 'diego']), peaRows: pea })).proposals[0].personId, 'p-harper');
  });

  test('softly avoids the zone someone worked yesterday', () => {
    const slots = mkSlots(['DT Bagger 2']);
    const pea = [...rows('harper', 'Bagging', 2.6), ...rows('yesenia', 'Bagging', 2.6)];
    const yesterday = { date: '2026-10-02', side: 'foh', daypart: 'lunch', assignments: { 'DT Bagger 2': 'p-harper' } };
    const out = fill(base({ slots, roster: pick(['harper', 'yesenia']), peaRows: pea, history: [BREAKFAST_HISTORY, yesterday] }));
    assert.equal(out.proposals[0].personId, 'p-yesenia', 'equal scores: the one who did not bag yesterday');
    const out2 = fill(base({ slots, roster: pick(['harper', 'yesenia']), peaRows: pea, history: [BREAKFAST_HISTORY] }));
    assert.equal(out2.proposals[0].personId, 'p-harper', 'without yesterday’s history the alphabetical/longer shift wins');
    const strong = [...rows('harper', 'Bagging', 2.9), ...rows('yesenia', 'Bagging', 2.2)];
    assert.equal(fill(base({ slots, roster: pick(['harper', 'yesenia']), peaRows: strong, history: [BREAKFAST_HISTORY, yesterday] })).proposals[0].personId, 'p-harper', 'soft: a much stronger person still wins');
    // Leaders too (brief §4, "especially a leader"): two whole-daypart TLs, one captained iPOS yesterday → the other gets iPOS 1.
    const capSlots = mkSlots(['iPOS 1 (Captain)', 'Runner']);
    const lukeIpos = { date: '2026-10-02', side: 'foh', daypart: 'lunch', assignments: { 'iPOS 1 (Captain)': 'p-luke' } };
    assert.equal(fill(base({ slots: capSlots, roster: pick(['luke', 'sam']), history: [BREAKFAST_HISTORY, lukeIpos] })).proposals.find(p => p.slotId === 'ipos-1').personId, 'p-sam');
    const samIpos = { date: '2026-10-02', side: 'foh', daypart: 'lunch', assignments: { 'iPOS 1 (Captain)': 'p-sam' } };
    assert.equal(fill(base({ slots: capSlots, roster: pick(['luke', 'sam']), history: [BREAKFAST_HISTORY, samIpos] })).proposals.find(p => p.slotId === 'ipos-1').personId, 'p-luke');
  });

  test('Game Day: a never-rated or Not Yet person is proposed only when nobody else is free, and then with a flag', () => {
    const slots = mkSlots(['Host 2']);
    // Sofia (On the Rise on Host) and Yesenia (never rated on Host) both free → Sofia, no flag.
    const withSofia = fill(base({ slots, roster: pick(['sofia', 'yesenia']), onShift: shiftOf(pick(['sofia', 'yesenia']), { start: 700, end: 840 }) }));
    assert.equal(withSofia.proposals[0].personId, 'p-sofia');
    assert.deepEqual(withSofia.proposals[0].flags, []);
    // A leader also counts as "somebody else".
    const withKi = fill(base({ slots, roster: pick(['noor', 'yesenia']) }));
    assert.equal(withKi.proposals[0].personId, 'p-noor');
    // Yesenia alone → proposed with a flag, never silently.
    const alone = fill(base({ slots, roster: pick(['yesenia']) }));
    assert.equal(alone.proposals[0].personId, 'p-yesenia');
    assert.deepEqual(alone.proposals[0].flags.map(f => f.kind), ['not-rated-gameday']);
    // Not Yet on Drinks (1.5) → Not Yet flag; on a Practice Day no flag at all.
    const drinks = mkSlots(['Drinks 1']);
    const notYet = fill(base({ slots: drinks, roster: pick(['yesenia']) }));
    assert.deepEqual(notYet.proposals[0].flags.map(f => f.kind), ['not-yet-gameday']);
    assert.equal(notYet.proposals[0].flags[0].text, 'Not Yet on Drinks 1/3 · Game Day · swap ›');
    assert.deepEqual(fill(base({ slots: drinks, roster: pick(['yesenia']), dayType: 'practice' })).proposals[0].flags, []);
    // Never-rated beats nobody: a Not Yet person still ranks above a never-rated one.
    const both = fill(base({ slots: drinks, roster: pick(['yesenia', 'kendra']), onShift: shiftOf(pick(['yesenia', 'kendra']), { start: 760, end: 840 }) }));
    assert.equal(both.proposals[0].personId, 'p-yesenia');
  });

  test('reports the slots that stay open with "nobody free"', () => {
    const roster = pick(['luke', 'sam', 'maria', 'noor', 'tobias', 'sienna', 'rafael', 'harper', 'diego', 'yesenia', 'sofia', 'emilio', 'kendra', 'brielle']);
    const assign = { ...STORY_ASSIGN, 'drinks-1': { personId: 'p-rafael' }, 'omd-1': { personId: 'p-diego' }, 'dt-bagger-2': { personId: 'p-harper' } };
    const shift = shiftOf(roster);
    const out = fill(base({ roster, onShift: shift, pairs: [], assignments: assign })); // no pairs → headcount 14 → FC Bagger 2 is Needed
    assert.equal(out.headcount, 14);
    assert.deepEqual(out.proposals.map(p => [p.slotId, p.personId]), [['host-2', 'p-yesenia']]);
    assert.deepEqual(out.staysOpen.map(s => [s.slotId, s.reason]), [['fc-bagger-2', 'nobody free']]);
  });

  test('the Lead Captain is never proposed as a zone captain', () => {
    const slots = mkSlots(['iPOS 1 (Captain)', 'Runner']);
    const out = fill(base({ slots, roster: pick(['sam', 'luke']), leadCaptainId: 'p-sam' }));
    assert.equal(out.proposals.find(p => p.slotId === 'ipos-1').personId, 'p-luke');
  });

  test('the Lead Captain never becomes a required zone’s only leader, even on a plain slot; a free lead takes the lead’s spot first', () => {
    // Host has no leader and Host 1 is not a captain slot: the other TL goes there, never the lead.
    const slots = mkSlots(['Host 1', 'Runner', 'Drinks 1']);
    const out = fill(base({ slots, roster: pick(['sam', 'luke', 'rafael']), leadCaptainId: 'p-luke' }));
    const by = Object.fromEntries(out.proposals.map(p => [p.slotId, p]));
    assert.equal(by['host-1'].personId, 'p-sam');
    assert.equal(by['runner'].personId, 'p-luke', 'Runner is the lead’s spot');
    assert.equal(by['runner'].reason, 'Lead Captain’s spot');
    assert.equal(by['drinks-1'].personId, 'p-rafael');
    // With iPOS first in the list the free TL goes to iPOS (priority), Host gets a team member, and the lead still never leads a zone.
    const ipos = fill(base({ slots: mkSlots(['iPOS 1', 'Host 1', 'Runner']), roster: pick(['sam', 'luke', 'rafael']), leadCaptainId: 'p-luke' }));
    assert.equal(ipos.proposals.find(p => p.slotId === 'ipos-1').personId, 'p-sam');
    assert.equal(ipos.proposals.find(p => p.slotId === 'host-1').personId, 'p-rafael');
    assert.equal(ipos.proposals.find(p => p.slotId === 'runner').personId, 'p-luke');
    // With only the lead free, Host 1 stays open (honest 'no leader on Host' on the board) rather than
    // making the Lead Captain the Host leader.
    const alone = fill(base({ slots: mkSlots(['Host 1', 'Runner']), roster: pick(['luke', 'rafael']), leadCaptainId: 'p-luke' }));
    assert.equal(alone.proposals.find(p => p.slotId === 'host-1').personId, 'p-rafael');
    assert.equal(alone.proposals.find(p => p.slotId === 'runner').personId, 'p-luke');
    // The lead placed by hand in a zone does not count as that zone's leader cover.
    const covered = fill(base({ slots: mkSlots(['iPOS 1 (Captain)', 'iPOS 2', 'Runner']), assignments: { 'ipos-2': { personId: 'p-luke' } }, roster: pick(['luke', 'sam', 'rafael']), leadCaptainId: 'p-luke' }));
    assert.equal(covered.proposals.find(p => p.slotId === 'ipos-1').personId, 'p-sam');
  });

  test('raw-name assignment keys and bare ids are honoured', () => {
    const out = fill(base({ assignments: { 'Drinks 1': 'p-rafael', 'FC Bagger (Captain)': { personId: 'p-luke' } }, roster: pick(['rafael', 'luke', 'harper']) }));
    assert.ok(!out.proposals.some(p => ['drinks-1', 'fc-bagger'].includes(p.slotId)));
    assert.ok(!out.proposals.some(p => ['p-rafael', 'p-luke'].includes(p.personId)));
  });
});

// =====================================================================
describe('breaks', () => {
  const people = [P('a', 'Ana', 'tm'), P('b', 'Ben', 'tm'), P('c', 'Cal', 'tm'), P('d', 'Dee', 'tm'), P('t1', 'Tia', 'tl'), P('t2', 'Tom', 'tl'), P('tr', 'Tess', 'trainer')];
  const quiet = {};
  const plan = args => planBreaks({ side: 'foh', people, now: 0, busy: quiet, ...args });
  const overlapping = (a, b) => a.start < b.end && b.start < a.end;

  test('only shifts of 6 h or more get a break, and it is 30 minutes', () => {
    const out = plan({ rosterEntries: [R('a', '6:00', '11:00'), R('b', '6:00', '12:00'), R('c', '11:00', '16:59')] });
    assert.deepEqual(out.plan.map(b => b.personId), ['p-b']);
    assert.equal(out.plan[0].end - out.plan[0].start, BREAK_LEN);
  });
  test('never in the first or last 2 h of the shift', () => {
    const out = plan({ rosterEntries: [R('a', '6:00', '12:00')] });
    const [b] = out.plan;
    assert.ok(b.start >= 480 && b.end <= 600, `${b.start}–${b.end}`);
    assert.deepEqual(legalStarts(R('a', '6:00', '12:00')), [480, 485, 490, 495, 500, 505, 510, 515, 520, 525, 530, 535, 540, 545, 550, 555, 560, 565, 570]);
  });
  test('never 10:00–10:30 or 12:00–1:00', () => {
    assert.equal(inBlackout(590), true);
    assert.equal(inBlackout(570), false);
    assert.equal(inBlackout(700), true);
    assert.equal(inBlackout(780), false);
    const out = plan({ rosterEntries: [R('a', '8:00', '14:00'), R('b', '10:00', '16:00'), R('c', '6:00', '13:00')] });
    for (const b of out.plan) assert.equal(inBlackout(b.start), false, `${b.personId} ${b.start}`);
    assert.equal(out.plan.find(b => b.personId === 'p-a').start, 645, 'middle of 8–2 is 11:00 → 10:45–11:15');
  });
  test('near the middle, earlier beats later', () => {
    // 6:00–14:00: the middle (10:00) is a blackout; 9:30 (15 min early) beats 10:30 (45 late).
    assert.equal(plan({ rosterEntries: [R('a', '6:00', '14:00')] }).plan[0].start, 570);
    // 14:00–22:00 with no rush: dead centre.
    assert.equal(plan({ rosterEntries: [R('a', '14:00', '22:00')] }).plan[0].start, 1065);
    // Two people on 14:00–22:00: the second goes 30 min earlier, not later.
    const two = plan({ rosterEntries: [R('a', '14:00', '22:00'), R('b', '14:00', '22:00')] });
    assert.deepEqual(two.plan.map(b => [b.personId, b.start]), [['p-b', 1035], ['p-a', 1065]]);
    // Three: the third takes the cheapest legal start (10 min after the first, staggered), never the 1:30 slot.
    const out = plan({ rosterEntries: [R('a', '14:00', '22:00'), R('b', '14:00', '22:00'), R('c', '14:00', '22:00')] });
    assert.deepEqual(out.plan.map(b => b.start), [1035, 1065, 1075]);
    assert.ok(out.plan.every(b => b.start <= 1080), 'nobody is pushed past the middle by more than the stagger');
  });
  test('busy hours push a break to a quieter time', () => {
    const out = planBreaks({ side: 'foh', people, now: 0, rosterEntries: [R('a', '9:00', '17:00')] }); // default busy: 12–1 rush, 1:00 busy
    assert.ok(out.plan[0].start >= 810, `${out.plan[0].start} — 1:30 or later, after the lunch rush`);
  });
  test('at most 2 off at once per side', () => {
    const out = plan({ rosterEntries: ['a', 'b', 'c', 'd', 't1', 'tr'].map(id => R(id, '14:00', '22:00')) });
    for (let m = 840; m < 1320; m += 5) {
      const off = out.plan.filter(b => b.start <= m && m < b.end).length;
      assert.ok(off <= MAX_OFF, `${off} off at ${m}`);
    }
    assert.deepEqual(out.warnings, []);
  });
  test('overlapping breaks start at least 10 min apart, ideally 15', () => {
    const out = plan({ rosterEntries: ['a', 'b', 'c', 'd'].map(id => R(id, '14:00', '22:00')) });
    for (const x of out.plan) for (const y of out.plan) {
      if (x === y || !overlapping(x, y)) continue;
      const gap = Math.abs(x.start - y.start);
      assert.ok(gap >= STAGGER_MIN && gap <= STAGGER_PREF, `${x.personId}/${y.personId} gap ${gap}`);
    }
  });
  test('never two TLs off together', () => {
    const out = plan({ rosterEntries: [R('t1', '14:00', '22:00'), R('t2', '14:00', '22:00'), R('a', '14:00', '22:00')] });
    const [x, y] = ['p-t1', 'p-t2'].map(id => breakFor(out, id));
    assert.equal(overlapping(x, y), false, `${x.start} / ${y.start}`);
    const a = breakFor(out, 'p-a');
    assert.ok(overlapping(a, x) || overlapping(a, y), 'a team member may overlap a TL');
    // A leaderShift on the roster makes a TL too.
    const out2 = plan({ rosterEntries: [R('t1', '14:00', '22:00'), R('a', '14:00', '22:00', true)] });
    assert.equal(overlapping(breakFor(out2, 'p-t1'), breakFor(out2, 'p-a')), false);
    // Three TLs on 9:00–15:00 have one legal half hour (11:00–11:30) between the blackouts and the
    // last-2-h edge: the third cannot avoid a clash, and the warning says so instead of 'more people off'.
    const three = plan({ rosterEntries: [R('t1', '9:00', '15:00'), R('t2', '9:00', '15:00'), R('c', '9:00', '15:00', true)] });
    const clashes = three.plan.filter(b => b.warn);
    assert.ok(clashes.length >= 1);
    assert.ok(clashes.every(b => b.start == null || /two TLs/.test(b.warn)), clashes.map(b => b.warn).join(' | '));
    assert.ok(three.warnings.some(w => /two TLs/.test(w)));
    // Four team members on 9:00–15:00 with two hand-moved to 11:00 and 11:10: Cal still fits at
    // 11:30, Dee would be a third person off wherever she goes, and the warning names that rule.
    const four = plan({ rosterEntries: [R('a', '9:00', '15:00'), R('b', '9:00', '15:00'), R('c', '9:00', '15:00'), R('d', '9:00', '15:00')], overrides: { 'p-a': 660, 'p-b': 670 } });
    assert.equal(breakFor(four, 'p-c').warn, '');
    const d = breakFor(four, 'p-d');
    assert.ok(d.warn && /2 or fewer off/.test(d.warn), d.warn);
    assert.equal(d.broke, 'tooManyOff');
  });
  test('a hand-moved break sticks, even somewhere the planner would not put it', () => {
    const out = plan({ rosterEntries: [R('a', '6:00', '14:00'), R('b', '6:00', '14:00')], overrides: { 'p-a': 605 } });
    const a = breakFor(out, 'p-a');
    assert.equal(a.start, 605);
    assert.equal(a.moved, true);
    assert.match(a.warn, /no-break window/);
    assert.equal(breakFor(out, 'p-b').moved, false);
    // Overrides keyed by side also work (the store's shape).
    const out2 = plan({ rosterEntries: [R('a', '6:00', '14:00')], overrides: { foh: { 'p-a': 645 }, boh: {} } });
    assert.equal(breakFor(out2, 'p-a').start, 645);
    // Others plan around the moved break (stagger, ≤ 2 off).
    const out3 = plan({ rosterEntries: [R('a', '6:00', '14:00'), R('b', '6:00', '14:00'), R('c', '6:00', '14:00')], overrides: { 'p-a': 570 } });
    for (const b of out3.plan.filter(b => b.personId !== 'p-a')) assert.ok(Math.abs(b.start - 570) >= STAGGER_MIN || !overlapping(b, breakFor(out3, 'p-a')));
  });
  test('cover = an unplaced person on shift, else the Lead Captain; the Lead Captain’s own break goes to another TL', () => {
    const roster = [R('a', '6:00', '14:00'), R('b', '6:00', '14:00'), R('c', '11:00', '15:00'), R('t1', '6:00', '14:00', true), R('t2', '6:00', '14:00', true)];
    const out = plan({ rosterEntries: roster, leadCaptainId: 'p-t1', unplacedIds: ['p-c'], overrides: { 'p-a': 500, 'p-b': 660, 'p-t1': 675 } });
    assert.equal(breakFor(out, 'p-a').cover, 'p-t1', 'nobody unplaced is on shift at 8:20 → the Lead Captain');
    assert.equal(breakFor(out, 'p-b').cover, 'p-c', 'Cal is unplaced and on shift at 11:00');
    assert.equal(breakFor(out, 'p-t1').cover, 'p-t2', 'the Lead Captain is covered by the other TL');
    // Someone on shift for most of the break (Harper from 11:00 for Maria’s 10:45) still covers.
    const out2 = plan({ rosterEntries: [R('a', '6:00', '14:00'), R('c', '11:00', '17:00')], unplacedIds: ['p-c'], overrides: { 'p-a': 645 } });
    assert.equal(breakFor(out2, 'p-a').cover, 'p-c');
    // Nobody at all → null, not a crash.
    assert.equal(plan({ rosterEntries: [R('a', '6:00', '14:00')] }).plan[0].cover, null);
  });
  test('offNow and next are relative to now', () => {
    const roster = [R('a', '6:00', '14:00'), R('b', '6:00', '14:00'), R('c', '11:00', '20:00'), R('d', '11:00', '20:00')];
    const out = plan({ rosterEntries: roster, now: 652, overrides: { 'p-a': 645, 'p-b': 500 }, unplacedIds: ['p-c'] });
    assert.deepEqual(out.offNow.map(b => [b.personId, b.back, b.cover]), [['p-a', 675, 'p-c']]);
    assert.equal(out.next.length, 2);
    assert.ok(out.next.every(b => b.start > 652));
    assert.deepEqual(out.next.map(b => b.personId), out.plan.filter(b => b.start > 652).slice(0, 2).map(b => b.personId));
    assert.equal(out.plan.find(b => b.personId === 'p-b').label, '8:20–8:50');
  });
});

// =====================================================================
describe('tasks', () => {
  test('TASKS is the FOH list with owners', () => {
    assert.ok(TASKS.length >= 11);
    assert.ok(TASKS.every(t => Number.isFinite(t.at) && t.name && t.es && t.owner));
    assert.equal(TASKS.find(t => t.at === 840).owner, 'Host 1');
    assert.equal(TASKS.find(t => t.at === 855).owner, 'Host 2');
    assert.equal(TASKS.find(t => t.at === 885).owner, 'Runner');
    assert.equal(TASKS.find(t => t.at === 570).owner, 'Drinks 1');
  });
  test('due now = at ≤ now < at + duration + 30', () => {
    const t = { id: 'x', at: 840, name: 'Restrooms — full reset', mins: '20–30 min', dur: 30 };
    assert.equal(durationOf(t), 30);
    assert.equal(durationOf({ mins: '5–10 min (+5 to the dumpster)' }), 10);
    assert.deepEqual(dueNow([t], 839), []);
    assert.deepEqual(dueNow([t], 840).map(x => x.id), ['x']);
    assert.deepEqual(dueNow([t], 899).map(x => x.id), ['x']);
    assert.deepEqual(dueNow([t], 900), []);
    assert.deepEqual(dueNow([t], 880, 10), []);
    assert.deepEqual(dueNow(TASKS, 844).map(x => x.name), ['Restrooms — full reset']);
    assert.deepEqual(dueNow(TASKS, 652).map(x => x.at), [600, 615]);
  });
  test('next tasks and per-daypart lists', () => {
    assert.deepEqual(nextTasks(TASKS, 844).map(x => x.at), [855, 885, 915]);
    assert.deepEqual(nextTasks(TASKS, 844, 2).map(x => x.name), ['Restock', 'Trash to the dumpster']);
    assert.deepEqual(nextTasks(TASKS, 1300), []);
    assert.deepEqual(tasksForDaypart(TASKS, { start: 840, end: 1020 }).map(x => x.at), [840, 855, 885, 915]);
    assert.deepEqual(tasksForDaypart(TASKS, { start: 660, end: 840 }), []);
  });
  test('checklist progress: 3 of 8 done by Rafael', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ en: `Item ${i}`, es: `Cosa ${i}` }));
    assert.deepEqual(checklistProgress(items, [0, 1, 2]), { done: 3, total: 8, pct: 38 });
    assert.deepEqual(checklistProgress(items, { items: [0, 1, 2], by: 'p-rafael', at: 844 }), { done: 3, total: 8, pct: 38 });
    assert.deepEqual(checklistProgress(items, new Set([7])), { done: 1, total: 8, pct: 13 });
    assert.deepEqual(checklistProgress(items, { 'Item 0': true, 'Item 5': true }), { done: 2, total: 8, pct: 25 });
    assert.deepEqual(checklistProgress(items, null), { done: 0, total: 8, pct: 0 });
    assert.deepEqual(checklistProgress([], [0]), { done: 0, total: 0, pct: 0 });
    assert.deepEqual(toggleItem([0, 2], 1), [0, 1, 2]);
    assert.deepEqual(toggleItem([0, 1, 2], 1), [0, 2]);
  });
});

// =====================================================================
describe('waste', () => {
  const DATE = '2026-10-03';
  const E = deepFreeze([
    { id: 'w1', productId: 'biscuit', size: null, qty: 1, who: 'p-brielle', date: DATE, at: 492 },
    { id: 'w2', productId: 'fries', size: 'L', qty: 2, who: 'p-luke', date: DATE, at: 631 },
    { id: 'w3', productId: 'nuggets', size: '12', qty: 1, who: 'p-brielle', date: DATE, at: 638 },
    { id: 'w0', productId: 'fries', size: 'M', qty: 1, who: 'p-tobias', date: '2026-10-02', at: 700 },
  ]);
  test('logEntry is immutable and fills defaults', () => {
    const out = logEntry(E, { productId: 'lemonade', qty: 1, who: 'p-luke', at: 652, date: DATE, size: 'M' });
    assert.equal(out.length, 5);
    assert.equal(E.length, 4);
    assert.notEqual(out, E);
    const e = out[4];
    assert.equal(e.productId, 'lemonade');
    assert.equal(e.who, 'p-luke');
    assert.equal(e.at, 652);
    assert.ok(e.id);
    assert.equal(logEntry(E, { productId: 'x', who: 'p-a', at: 1 })[4].qty, 1);
    assert.equal(logEntry(null, { productId: 'x', who: 'p-a', at: 1 }).length, 1);
  });
  test('undo within 5 s removes the last entry by that person; later it does nothing', () => {
    const t0 = 1_700_000_000_000;
    const list = logEntry(E, { productId: 'fries', qty: 1, who: 'p-luke', at: 652, date: DATE, ts: t0 });
    const ok = undoLast(list, 'p-luke', t0 + 4_000);
    assert.equal(ok.removed.productId, 'fries');
    assert.equal(ok.entries.length, 4);
    assert.equal(list.length, 5, 'input untouched');
    const late = undoLast(list, 'p-luke', t0 + 6_000);
    assert.equal(late.removed, null);
    assert.equal(late.entries, list);
    // Only that person's last entry.
    const other = undoLast(list, 'p-brielle', t0 + 1_000);
    assert.equal(other.removed, null, 'Brielle’s last entry is from 10:38, long ago');
    // Store-clock minutes: the same minute is inside the window, two minutes later is not.
    assert.equal(undoLast(E, 'p-brielle', 638).removed.id, 'w3');
    assert.equal(undoLast(E, 'p-brielle', 641).removed, null);
  });
  test('today count is the number of entries on the date; pieces sum the quantities', () => {
    assert.equal(todayCount(E, DATE), 3);
    assert.equal(todayCount(E, '2026-10-02'), 1);
    assert.equal(todayPieces(E, DATE), 4);
  });
  test('tape = the last 15 minutes, newest first', () => {
    assert.deepEqual(tape(E, 641).map(e => e.id), ['w3', 'w2']);
    assert.deepEqual(tape(E, 646).map(e => e.id), ['w3']);
    assert.deepEqual(tape(E, 700, 15, DATE).map(e => e.id), []);
    assert.deepEqual(tape(E, 700, 300).map(e => e.id), ['w0', 'w3', 'w2', 'w1']);
  });
  test('$ view needs item costs while every cost is 0', () => {
    const products = [{ id: 'fries', cost: 0 }, { id: 'nuggets', cost: 0 }];
    assert.equal(needsCosts(products), true);
    assert.equal(needsCosts([]), true);
    assert.equal(totalCost(E, products), null);
    const priced = [{ id: 'fries', cost: 1.5 }, { id: 'nuggets', cost: 0 }, { id: 'biscuit', cost: 0 }];
    assert.equal(needsCosts(priced), false);
    assert.equal(totalCost(E, priced), 4.5);
  });
});

// =====================================================================
// The real sample data, when the data modules are present (skipped otherwise).
describe('story on the data modules', async () => {
  let data = null;
  try {
    const [people, roster, pea, history, scenario, positions] = await Promise.all([
      import('../data/people.js'), import('../data/roster.js'), import('../data/pea.js'), import('../data/history.js'), import('../data/scenario.js'), import('../rules/positions.js'),
    ]);
    data = { people, roster, pea, history, scenario, positions };
  } catch { data = null; }

  test('Saturday 10:52: Fill proposes Rafael, Diego, Harper and Yesenia; Keep an eye on is Sienna · Emilio · Tobias; Sienna gets the Game Day PEA with Noor', { skip: !data }, () => {
    const { PEOPLE: people } = data.people;
    const roster = data.roster.rosterFor(DATE, 'foh');
    const rById = data.roster.rosterById(DATE, 'foh');
    const slots = data.positions.slotsFor('foh', 'lunch');
    const toIds = raw => Object.fromEntries(Object.entries(raw).map(([k, v]) => [slotFromName(k, 'foh').id, v]));
    const assignments = toIds(data.scenario.SCENARIO.assignments.foh.lunch);
    const shift = shiftOf(roster);
    const out = fill({ side: 'foh', daypartKey: 'lunch', slots, assignments, onShift: shift, pairs: handoffPairs(shift), people, rosterById: rById,
      peaRows: data.pea.PEA, history: data.history.HISTORY, date: DATE, dayType: dayType({ date: DATE }), leadCaptainId: 'p-sam' });
    assert.deepEqual(out.proposals.map(p => [p.slotId, p.personId]), [['drinks-1', 'p-rafael'], ['omd-1', 'p-diego'], ['dt-bagger-2', 'p-harper'], ['host-2', 'p-yesenia']]);
    assert.deepEqual(out.proposals[3].flags.map(f => f.kind), ['not-rated-gameday']);
    const eye = keepAnEye({ onShift: shift, people, peaRows: data.pea.PEA, history: data.history.HISTORY, date: DATE, side: 'foh', rosterById: rById });
    assert.deepEqual(eye.map(k => [k.personId, k.reason]), [['p-sienna', 'PEA due, 31 days'], ['p-emilio', '2 positions from all green'], ['p-tobias', 'stalled on Bagging']]);
    const picks = developPicks({ dayType: 'game', onShift: shift, people, peaRows: data.pea.PEA, slots, assignments, rosterById: rById, date: DATE });
    assert.deepEqual(picks.map(p => [p.personId, p.slotId, p.pairedWith]), [['p-sienna', 'omd-2', 'p-noor']]);
    const unplaced = shift.map(p => p.personId).filter(id => !Object.values(assignments).some(a => a.personId === id || a.handoffTo === id));
    const br = planBreaks({ side: 'foh', rosterEntries: roster, people, now: 652, overrides: data.scenario.SCENARIO.breaks.overrides, assignments, slots, leadCaptainId: 'p-sam', unplacedIds: unplaced });
    assert.deepEqual(br.offNow.map(b => [b.personId, b.back, b.cover]), [['p-maria', 675, 'p-harper']]);
    assert.equal(breakFor(br, 'p-sam').cover, 'p-luke');
  });
});
