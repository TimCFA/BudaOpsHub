// Core rules: time, dayparts, positions, roster, leaders, outside, tiers, board.
// Run: cd prototype && node --test tests/core.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseTime, fmt, fmtRange, clockLabel, daysBetween, weekday, relativeDay } from '../rules/time.js';
import { DAYPARTS, daypartAt, daypartByKey, nextDaypart, prevDaypart, daypartByKeyOrName } from '../rules/dayparts.js';
import { slotFromName, buildSlots, slotById, SLOTS, peaPositionFor, fixTypos } from '../rules/positions.js';
import { onShift, handoffPairs, effectiveHeadcount, displayNames, isLeader, roleTag } from '../rules/roster.js';
import { ZONES, LEADER_ZONE_PRIORITY, REQUIRED_LEADER_ZONES, REACH, zoneKeyOf, leaderFlags, leadCaptainOptions, leadHomeSlot, assignFor } from '../rules/leaders.js';
import { outsideFlags } from '../rules/outside.js';
import { TIERS, tierFor, scoreFor, allGreen, peaDueDays } from '../rules/tiers.js';
import { buildBoard } from '../rules/board.js';

// ---------- fixtures (SPEC roster; last names are initials only) ----------
const P = (id, first, role, last = '') => ({ id: `p-${id}`, first, last, role, side: 'foh', lang: 'en' });
const PEOPLE = [
  P('dorian', 'Dorian', 'manager', 'F'),
  P('maria', 'Maria', 'trainer', 'D'), P('luke', 'Luke', 'tl', 'B'), P('brielle', 'Brielle', 'trainer', 'T'),
  P('sofia', 'Sofia', 'tm', 'N'), P('tobias', 'Tobias', 'tm', 'K'), P('emilio', 'Emilio', 'tm', 'A'),
  P('sam', 'Sam', 'tl', 'O'), P('noor', 'Noor', 'trainer', 'N'), P('kendra', 'Kendra', 'tm', 'P'),
  P('sienna', 'Sienna', 'tm', 'C'), P('rafael', 'Rafael', 'tm', 'M'), P('harper', 'Harper', 'tm', 'W'),
  P('diego', 'Diego', 'tm', 'S'), P('yesenia', 'Yesenia', 'tm', 'H'),
];
const R = (id, start, end, leaderShift = false) => ({ personId: `p-${id}`, start, end, leaderShift });
const ROSTER_FOH = [
  R('maria', '6:00', '14:00'), R('luke', '10:00', '20:00', true), R('brielle', '6:00', '11:30'), R('sofia', '11:30', '20:00'),
  R('tobias', '6:00', '15:00'), R('emilio', '11:00', '13:00'), R('sam', '10:00', '20:00', true), R('noor', '6:00', '13:00'),
  R('kendra', '12:30', '20:00'), R('sienna', '11:00', '17:00'), R('rafael', '11:00', '17:30'), R('harper', '11:00', '20:00'),
  R('diego', '11:00', '13:00'), R('yesenia', '11:00', '16:00'),
];
const DATE = '2026-10-03';
const LUNCH = { start: 660, end: 840 };

// Inline priority lists (the canvas story order), so these tests never depend on data/.
const RAW = {
  foh: {
    breakfast: ['iPOS 1 (Captain)', 'iPOS 2 LANE 2', 'DT Bagger 1', 'Drinks 1', 'OMD 1', 'Host 1', 'FC Bagger', 'Drinks 3', 'DT Bagger 2', 'iPOS 3 LANE 3', 'Runner', 'Host 2', 'Drinks 2', 'iPOS 4 LANE 1'],
    lunch: ['iPOS 1 (Captain)', 'FC Bagger (Captain)', 'Drinks 1', 'Host 1 (Captain)', 'OMD 1', 'iPOS 2 LANE 1', 'DT Bagger 2', 'Drinks 2/Sample Prep', 'Runner', 'Drinks 3 (Captain)', 'Host 2', 'OMD 2', 'FC Bagger 2', 'DT Bagger 1 (Cockpit Cap)', 'iPOS 3 LANE 2', 'Surfer', 'Shift Lead: someone', 'Breaks'],
    afternoon: ['iPOS 1 (Captain)', 'iPOS 2 LANE 2', 'Drinks 1', 'OMD 1', 'Host 1', 'FC Bagger', 'Drink 3', 'Host 2', 'Runner', 'DT Bagger 2'],
  },
  boh: { mid: ['Breader1', 'Machines', 'Primary 1', 'Fries', 'Secondari 1', 'Primari 2', 'Prep'] },
};
const S = buildSlots(RAW);
const LUNCH_SLOTS = S.foh.lunch;
const sid = (list, name) => list.find(s => s.name === name).id;

const BREAKFAST_ASSIGN = {
  'ipos-1': { personId: 'p-maria' }, 'ipos-2': { personId: 'p-tobias' }, 'host-1': { personId: 'p-brielle' },
  'drinks-1': { personId: 'p-noor' }, 'dt-bagger-1': { personId: 'p-luke' },
};
const LUNCH_ASSIGN = {
  __carriedFrom: 'breakfast',
  'ipos-1': { personId: 'p-maria' },
  'fc-bagger': { personId: 'p-luke' },
  'host-1': { personId: 'p-brielle', handoffTo: 'p-sofia', handoffAt: 690 },
  'ipos-2': { personId: 'p-tobias' },
  'drinks-2': { personId: 'p-emilio' },
  'runner': { personId: 'p-sam' },
  'drinks-3': { personId: 'p-noor', handoffTo: 'p-kendra', handoffAt: 780 },
  'omd-2': { personId: 'p-sienna', star: true },
};
const PEA = [
  { personId: 'p-tobias', position: 'iPOS', score: 2.8, at: '2026-09-20T17:30', leaderId: 'p-luke' },
  { personId: 'p-emilio', position: 'Drinks 2', score: 2.1, at: '2026-09-18T12:00', leaderId: 'p-sam' },
  { personId: 'p-sienna', position: 'OMD', score: 2.3, at: '2026-09-02T12:00', leaderId: 'p-sam' },
  { personId: 'p-rafael', position: 'Drinks 1/3', score: 2.9, at: '2026-09-25T12:00', leaderId: 'p-sam' },
  { personId: 'p-yesenia', position: 'Drinks 1/3', score: 1.5, at: '2026-09-25T12:00', leaderId: 'p-sam' },
];
const BREAKS = {
  offNow: [{ personId: 'p-maria', start: 645, end: 675, cover: 'p-harper' }],
  plan: [
    { personId: 'p-maria', start: 645, end: 675, cover: 'p-harper' },
    { personId: 'p-sam', start: 785, end: 815, cover: 'p-luke' },
    { personId: 'p-sienna', start: 800, end: 830, cover: 'p-rafael' },
  ],
};
const boardArgs = (extra = {}) => ({
  side: 'foh', date: DATE, daypartKey: 'lunch', now: 652, people: PEOPLE, roster: ROSTER_FOH,
  assignments: LUNCH_ASSIGN, peaRows: PEA, history: [{ date: DATE, side: 'foh', daypart: 'breakfast', assignments: BREAKFAST_ASSIGN, leadCaptain: 'p-luke' }],
  dayType: { type: 'game', reason: 'Saturday' }, leadCaptainId: 'p-sam', breakPlan: BREAKS, slots: LUNCH_SLOTS,
  keepAnEye: [{ personId: 'p-sienna', reason: 'PEA due, 31 days' }], ...extra,
});

// ---------- time ----------
describe('time', () => {
  test('parseTime handles 24h and 12h input', () => {
    assert.equal(parseTime('6:00'), 360);
    assert.equal(parseTime('13:30'), 810);
    assert.equal(parseTime('1:30 PM'), 810);
    assert.equal(parseTime('1:30pm'), 810);
    assert.equal(parseTime('12:15 AM'), 15);
    assert.equal(parseTime('12:00 PM'), 720);
    assert.equal(parseTime(810), 810);
    assert.equal(parseTime('nope'), null);
    assert.equal(parseTime(''), null);
  });
  test('fmt is 12-hour without am/pm', () => {
    assert.equal(fmt(810), '1:30');
    assert.equal(fmt(660), '11:00');
    assert.equal(fmt(0), '12:00');
    assert.equal(fmt(720), '12:00');
    assert.equal(fmt(1200), '8:00');
    assert.equal(fmtRange(660, 840), '11:00–2:00');
    assert.equal(clockLabel(652), '10:52');
  });
  test('date helpers', () => {
    assert.equal(daysBetween('2026-09-02', '2026-10-03'), 31);
    assert.equal(weekday('2026-10-03'), 6); // Saturday
    assert.equal(relativeDay('2026-09-29', '2026-10-03'), 'Tue');
    assert.equal(relativeDay('2026-10-02', '2026-10-03'), 'yesterday');
    assert.equal(relativeDay('2026-09-20', '2026-10-03'), 'Sep 20');
  });
});

// ---------- dayparts ----------
describe('dayparts', () => {
  test('FOH Lunch is 660–840 with Transition merged; BOH Mid 630–840', () => {
    assert.deepEqual(DAYPARTS.foh.map(d => d.key), ['early', 'breakfast', 'lunch', 'afternoon', 'dinner', 'close']);
    assert.deepEqual(DAYPARTS.boh.map(d => d.key), ['early', 'breakfast', 'mid', 'afternoon', 'dinner', 'close']);
    assert.deepEqual([daypartByKey('foh', 'lunch').start, daypartByKey('foh', 'lunch').end], [660, 840]);
    assert.deepEqual([daypartByKey('boh', 'mid').start, daypartByKey('boh', 'mid').end], [630, 840]);
    assert.equal(daypartByKey('boh', 'breakfast').end, 630);
  });
  test('daypartAt picks the containing window, clamped at both ends', () => {
    assert.equal(daypartAt('foh', 652).key, 'breakfast');
    assert.equal(daypartAt('foh', 660).key, 'lunch');
    assert.equal(daypartAt('foh', 839).key, 'lunch');
    assert.equal(daypartAt('foh', 840).key, 'afternoon');
    assert.equal(daypartAt('foh', 100).key, 'early');
    assert.equal(daypartAt('foh', 1400).key, 'close');
    assert.equal(daypartAt('boh', 640).key, 'mid');
  });
  test('next / prev / byKeyOrName', () => {
    assert.equal(nextDaypart('foh', 'lunch').key, 'afternoon');
    assert.equal(prevDaypart('foh', 'lunch').key, 'breakfast');
    assert.equal(prevDaypart('foh', 'early'), null);
    assert.equal(nextDaypart('foh', 'close'), null);
    assert.equal(daypartByKeyOrName('foh', 'Breakfast (8:00-11:00)').key, 'breakfast');
    assert.equal(daypartByKeyOrName('boh', 'mid').name, 'Mid');
  });
});

// ---------- positions ----------
describe('positions', () => {
  test('slotFromName strips lanes and captain markers, sets zone / pea / outside', () => {
    const a = slotFromName('iPOS 2 LANE 1', 'foh');
    assert.deepEqual([a.id, a.name, a.sub, a.captain, a.zone, a.pea, a.outside], ['ipos-2', 'iPOS 2', 'Lane 1', false, 'ipos', 'iPOS', true]);
    const b = slotFromName('DT Bagger 1 (Cockpit Cap)', 'foh');
    assert.deepEqual([b.id, b.name, b.sub, b.captain, b.zone, b.pea, b.outside], ['dt-bagger-1', 'DT Bagger 1', 'Captain', true, 'bagging', 'Bagging', false]);
    const c = slotFromName('Host 1 (Captain)', 'foh');
    assert.deepEqual([c.id, c.name, c.sub, c.captain, c.zone, c.pea], ['host-1', 'Host 1', 'Captain', true, 'host', 'Host']);
    const d = slotFromName('Drinks 2/Sample Prep', 'foh');
    assert.deepEqual([d.id, d.name, d.sub, d.zone, d.pea], ['drinks-2', 'Drinks 2', 'Sample Prep', 'drinks', 'Drinks 2']);
    const e = slotFromName('Drinks 3 / Runner', 'foh');
    assert.deepEqual([e.name, e.sub, e.pea], ['Drinks 3', 'Runner', 'Drinks 1/3']);
    assert.deepEqual([slotFromName('OMD 1', 'foh').outside, slotFromName('OMD 1', 'foh').pea], [true, 'OMD']);
    assert.deepEqual([slotFromName('Runner', 'foh').zone, slotFromName('Runner', 'foh').pea], ['extra', 'Runner']);
    assert.equal(slotFromName('Surfer', 'foh').pea, null);
    assert.equal(slotFromName('Dining Room', 'foh').zone, 'host');
    assert.equal(slotFromName('Restroom Zone', 'foh').pea, null);
    assert.equal(slotFromName('Lemonades', 'foh').zone, 'drinks');
  });
  test('BOH zones and typo fixes', () => {
    assert.equal(fixTypos('Dinning Room'), 'Dining Room');
    assert.equal(fixTypos('Secondari 1'), 'Secondary 1');
    assert.equal(fixTypos('Primari 3'), 'Primary 3');
    assert.equal(fixTypos('Breader1'), 'Breader 1');
    assert.equal(fixTypos('Drink 3'), 'Drinks 3');
    const pm = slotFromName('Primary/Machines', 'boh');
    assert.deepEqual([pm.zone, pm.pea, pm.outside], ['primary', 'Primary', false]);
    assert.deepEqual([slotFromName('Fries', 'boh').zone, slotFromName('Breader 2', 'boh').zone, slotFromName('Biscuit/Eggs', 'boh').zone], ['primary', 'raw', 'secondary']);
    assert.equal(slotFromName('Prep', 'boh').zone, 'extra');
    assert.equal(peaPositionFor('boh', 'Prep/dishes'), 'Prep');
    assert.deepEqual(S.boh.mid.map(s => s.name), ['Breader 1', 'Machines', 'Primary 1', 'Fries', 'Secondary 1', 'Primary 2', 'Prep']);
  });
  test('buildSlots keeps priority order and drops Shift Lead / Breaks', () => {
    assert.equal(LUNCH_SLOTS.length, 16);
    assert.ok(!LUNCH_SLOTS.some(s => /shift lead|breaks/i.test(s.raw)));
    assert.deepEqual(LUNCH_SLOTS.slice(0, 4).map(s => s.id), ['ipos-1', 'fc-bagger', 'drinks-1', 'host-1']);
    assert.equal(S.foh.afternoon.find(s => s.id === 'drinks-3').raw, 'Drinks 3');
  });
  test('SLOTS is built from data/positions.js and slotById is tolerant', () => {
    assert.ok(SLOTS.foh.lunch.length > 0);
    assert.equal(slotById('foh', 'lunch', 'ipos-1').name, 'iPOS 1');
    assert.equal(slotById('foh', 'lunch', 'iPOS 1 (Captain)').id, 'ipos-1');
    assert.equal(slotById('foh', 'lunch', 'ipos 1').id, 'ipos-1');
    assert.equal(slotById('foh', 'lunch', 'nothing'), null);
    assert.ok(SLOTS.boh.mid.length > 0);
  });
  test('assignFor reads ids, raw names and bare personId strings', () => {
    const slot = LUNCH_SLOTS[0];
    assert.deepEqual(assignFor({ 'iPOS 1 (Captain)': 'p-maria' }, slot), { personId: 'p-maria' });
    assert.deepEqual(assignFor({ 'ipos-1': { personId: 'p-maria', pending: true } }, slot), { personId: 'p-maria', pending: true });
    assert.equal(assignFor({}, slot), null);
  });
});

// ---------- roster ----------
describe('roster', () => {
  test('10-minute edge tolerance', () => {
    const rows = onShift([
      R('a', '10:55', '20:00'), R('b', '11:10', '20:00'), R('c', '11:11', '20:00'),
      R('d', '6:00', '13:50'), R('e', '6:00', '13:49'), R('f', '6:00', '11:00'), R('g', '6:00', '11:08'), R('h', '14:00', '20:00'),
    ], LUNCH);
    const by = Object.fromEntries(rows.map(r => [r.personId, r]));
    assert.equal(by['p-a'].arrives, null); assert.ok(by['p-a'].whole);
    assert.equal(by['p-b'].arrives, null);            // exactly 10 min in still counts as the edge
    assert.equal(by['p-c'].arrives, 671);
    assert.equal(by['p-d'].leaves, null); assert.ok(by['p-d'].lastDaypart);
    assert.equal(by['p-e'].leaves, 829); assert.ok(by['p-e'].lastDaypart);
    assert.equal(by['p-f'], undefined);               // ends when the window starts
    assert.equal(by['p-g'], undefined);               // 8 minutes of overlap is not a Lunch person
    assert.equal(by['p-h'], undefined);
    assert.equal(by['p-a'].lastDaypart, false);
  });
  test('the SPEC roster on Lunch: 14 on shift, two hand-off pairs, 12 effective', () => {
    const rows = onShift(ROSTER_FOH, LUNCH);
    assert.equal(rows.length, 14);
    const by = Object.fromEntries(rows.map(r => [r.personId, r]));
    assert.equal(by['p-brielle'].leaves, 690);
    assert.equal(by['p-sofia'].arrives, 690);
    assert.equal(by['p-kendra'].arrives, 750);
    assert.equal(by['p-noor'].leaves, 780);
    assert.ok(by['p-maria'].whole && by['p-maria'].lastDaypart);
    assert.ok(by['p-tobias'].whole && !by['p-tobias'].lastDaypart);
    const pairs = handoffPairs(rows);
    assert.deepEqual(pairs.map(p => [p.leaverId, p.arriverId, p.at]), [['p-brielle', 'p-sofia', 690], ['p-noor', 'p-kendra', 780]]);
    assert.equal(effectiveHeadcount(rows, pairs), 12);
  });
  test('hand-off pairing window: 60 before to 30 after, closest wins, each arrival once', () => {
    const win = (arr) => handoffPairs(onShift([R('out', '6:00', '13:00'), R('in', arr, '20:00')], LUNCH));
    assert.equal(win('12:00').length, 1);   // exactly 60 min before
    assert.equal(win('11:59').length, 0);   // 61 min before
    assert.equal(win('13:30').length, 1);   // exactly 30 min after
    assert.equal(win('13:31').length, 0);   // 31 min after
    const two = handoffPairs(onShift([R('out1', '6:00', '13:00'), R('out2', '6:00', '13:00'), R('in1', '12:50', '20:00'), R('in2', '13:20', '20:00')], LUNCH));
    assert.equal(two.length, 2);
    assert.equal(two[0].arriverId, 'p-in1');       // closest arrival goes to the first leaver
    assert.equal(two[1].arriverId, 'p-in2');
    // same leaving time: the person on the floor longest hands off first
    const tie = handoffPairs(onShift([R('late', '11:00', '13:00'), R('early', '6:00', '13:00'), R('in1', '12:30', '20:00')], LUNCH));
    assert.deepEqual(tie.map(p => [p.leaverId, p.arriverId]), [['p-early', 'p-in1']]);
    // two leavers at 12:00 and 12:30 and one arrival at 12:20: the closer leaver (12:30) gets it? No — leavers go in time order, so 12:00 pairs first
    const order = handoffPairs(onShift([R('a', '6:00', '12:00'), R('b', '6:00', '12:30'), R('in1', '12:20', '20:00')], LUNCH));
    assert.deepEqual(order.map(p => [p.leaverId, p.arriverId, p.gap]), [['p-a', 'p-in1', 20]]);
    const one = handoffPairs(onShift([R('out1', '6:00', '13:00'), R('out2', '6:00', '13:00'), R('in1', '13:00', '20:00')], LUNCH));
    assert.equal(one.length, 1);
    assert.equal(effectiveHeadcount(onShift([R('out1', '6:00', '13:00'), R('out2', '6:00', '13:00'), R('in1', '13:00', '20:00')], LUNCH), one), 2);
  });
  test('displayNames: first name, last initial only on a collision', () => {
    const people = PEOPLE.concat([{ id: 'p-sam2', first: 'Sam', last: 'D', role: 'tm', side: 'foh', lang: 'en' }, { id: 'p-sam3', first: 'Sam', last: 'Dx', role: 'tm', side: 'foh', lang: 'en' }]);
    const n = displayNames(people, ['p-sam', 'p-maria', 'p-sam2']);
    assert.deepEqual(n, { 'p-sam': 'Sam O.', 'p-maria': 'Maria', 'p-sam2': 'Sam D.' });
    assert.equal(displayNames(people, ['p-sam', 'p-maria'])['p-sam'], 'Sam');
    const n3 = displayNames(people, ['p-sam2', 'p-sam3']);
    assert.deepEqual(n3, { 'p-sam2': 'Sam D', 'p-sam3': 'Sam Dx' });
    assert.equal(displayNames(people, ['p-unknown'])['p-unknown'], 'p-unknown');
  });
  test('isLeader / roleTag', () => {
    const by = Object.fromEntries(PEOPLE.map(p => [p.id, p]));
    assert.equal(isLeader(by['p-luke'], R('luke', '10:00', '20:00')), 'tl');
    assert.equal(isLeader(by['p-maria'], R('maria', '6:00', '14:00')), 'trainer');
    assert.equal(isLeader(by['p-tobias'], R('tobias', '6:00', '15:00')), null);
    assert.equal(isLeader(by['p-tobias'], R('tobias', '6:00', '15:00', true)), 'tl');
    assert.equal(isLeader(by['p-dorian'], null), 'tl');
    assert.equal(roleTag(by['p-noor'], null), 'TRAINER');
    assert.equal(roleTag(by['p-sam'], null), 'TL');
    assert.equal(roleTag(by['p-yesenia'], null), null);
  });
});

// ---------- leaders ----------
describe('leaders', () => {
  const rosterById = Object.fromEntries(ROSTER_FOH.map(r => [r.personId, r]));
  const shift = onShift(ROSTER_FOH, LUNCH);
  const flagsFor = (assignments) => leaderFlags({ side: 'foh', slots: LUNCH_SLOTS, assignments, people: PEOPLE, rosterById, onShift: shift });

  test('constants', () => {
    assert.deepEqual(LEADER_ZONE_PRIORITY.foh, ['ipos', 'bagging', 'host', 'drinks', 'omd']);
    assert.deepEqual(REQUIRED_LEADER_ZONES.foh, ['ipos', 'bagging', 'host']);
    assert.deepEqual(REACH.bagging, ['drinks', 'omd']);
    assert.equal(zoneKeyOf('foh', 'omd-2'), 'omd');
    assert.equal(zoneKeyOf('foh', 'iPOS 3 LANE 2'), 'ipos');
    assert.equal(ZONES.boh.length, 3);
  });
  test('required zone with no leader is flagged once, on the captain slot', () => {
    const f = flagsFor({ 'ipos-1': { personId: 'p-tobias' }, 'ipos-2': { personId: 'p-rafael' }, 'fc-bagger': { personId: 'p-luke' }, 'host-1': { personId: 'p-maria' } });
    const noLeader = f.filter(x => x.kind === 'no-leader');
    // Tobias in the iPOS captain slot is the one flag for iPOS; Host has Maria, Bagging has Luke
    assert.deepEqual(noLeader, []);
    assert.deepEqual(f.map(x => [x.kind, x.slotId, x.personId]), [['non-leader-captain', 'ipos-1', 'p-tobias']]);
    const g = flagsFor({ 'ipos-2': { personId: 'p-tobias' }, 'fc-bagger': { personId: 'p-luke' }, 'host-1': { personId: 'p-maria' } });
    assert.deepEqual(g.map(x => [x.kind, x.slotId]), [['no-leader', 'ipos-2']]);
    assert.match(g[0].text, /no leader on iPOS/);
    // a non-leader in the zone's captain slot is the one flag for that zone (no doubled 'no leader')
    const h = flagsFor({ 'ipos-2': { personId: 'p-tobias' }, 'ipos-1': { personId: 'p-rafael' }, 'fc-bagger': { personId: 'p-luke' } });
    assert.deepEqual(h.map(x => [x.kind, x.slotId]), [['non-leader-captain', 'ipos-1']]);
  });
  test('the Bagging captain reaches Drinks and OMD; Host is not reached', () => {
    const f = flagsFor({ 'ipos-1': { personId: 'p-maria' }, 'fc-bagger': { personId: 'p-luke' }, 'drinks-1': { personId: 'p-rafael' }, 'omd-1': { personId: 'p-diego' }, 'host-2': { personId: 'p-yesenia' } });
    assert.deepEqual(f.map(x => x.kind), ['no-leader']);
    assert.equal(f[0].slotId, 'host-2');
    // a leader in Drinks does not reach Host either
    const g = flagsFor({ 'ipos-1': { personId: 'p-maria' }, 'fc-bagger': { personId: 'p-luke' }, 'drinks-3': { personId: 'p-noor' }, 'host-2': { personId: 'p-yesenia' } });
    assert.equal(g.filter(x => x.kind === 'no-leader').length, 1);
  });
  test('empty zones and leader-covered zones raise nothing', () => {
    assert.deepEqual(flagsFor({}), []);
    assert.deepEqual(flagsFor({ 'ipos-1': { personId: 'p-maria' }, 'fc-bagger': { personId: 'p-luke' }, 'host-1': { personId: 'p-sam' }, 'drinks-1': { personId: 'p-rafael' } }), []);
  });
  test('non-leader in a Captain slot', () => {
    const f = flagsFor({ 'host-1': { personId: 'p-sofia' } });
    assert.equal(f.length, 1);
    assert.equal(f[0].kind, 'non-leader-captain');
    assert.equal(f[0].text, 'Sofia isn’t a leader ›');
    assert.equal(flagsFor({ 'host-1': { personId: 'p-tobias', pending: true } }).length, 1);
    assert.equal(flagsFor({ 'host-1': { personId: 'p-dorian' } }).length, 0); // a manager is a leader
  });
  test('captain hands off to a non-leader → captain-leaves; hand-off to a leader or a reached zone is fine', () => {
    const f = flagsFor({ 'ipos-1': { personId: 'p-maria' }, 'fc-bagger': { personId: 'p-luke' }, 'host-1': { personId: 'p-brielle', handoffTo: 'p-sofia' } });
    assert.equal(f.length, 1);
    assert.equal(f[0].kind, 'captain-leaves');
    assert.equal(f[0].slotId, 'host-1');
    assert.equal(f[0].personId, 'p-sofia');
    assert.equal(f[0].text, 'Brielle leaves 11:30 · Sofia isn’t a leader ›');
    // handoffAt wins over the roster time
    assert.match(flagsFor({ 'host-1': { personId: 'p-brielle', handoffTo: 'p-sofia', handoffAt: 700 } })[0].text, /11:40/);
    // to a leader: no flag
    assert.deepEqual(flagsFor({ 'host-1': { personId: 'p-brielle', handoffTo: 'p-sam' } }), []);
    // Noor (Trainer) → Kendra on the Drinks 3 captain slot: Luke in Bagging still reaches Drinks
    assert.deepEqual(flagsFor({ 'fc-bagger': { personId: 'p-luke' }, 'drinks-3': { personId: 'p-noor', handoffTo: 'p-kendra' } }), []);
    // …but without Luke it is flagged
    assert.equal(flagsFor({ 'drinks-3': { personId: 'p-noor', handoffTo: 'p-kendra' } })[0].kind, 'captain-leaves');
    // a captain leaving with nobody taking over is flagged too
    const g = flagsFor({ 'host-1': { personId: 'p-brielle' } });
    assert.equal(g[0].kind, 'captain-leaves');
    assert.match(g[0].text, /no leader after/);
    // a captain on for the whole daypart raises nothing
    assert.deepEqual(flagsFor({ 'host-1': { personId: 'p-maria' } }), []);
  });
  test('leadCaptainOptions: TLs only, longest since last led first, zone captains last', () => {
    const history = [
      { date: '2026-09-29', side: 'foh', daypart: 'lunch', assignments: {}, leadCaptain: 'p-sam' },
      { date: '2026-10-02', side: 'foh', daypart: 'lunch', assignments: {}, leadCaptain: 'p-luke' },
      { date: '2026-10-03', side: 'foh', daypart: 'breakfast', assignments: {}, leadCaptain: 'p-luke' }, // today counts: Luke led Breakfast
    ];
    const opts = leadCaptainOptions({ side: 'foh', onShift: shift, people: PEOPLE, rosterById, history, date: DATE, assignments: {}, slots: LUNCH_SLOTS });
    assert.deepEqual(opts.map(o => o.personId), ['p-sam', 'p-luke']);
    assert.equal(opts[0].reason, 'hasn’t led since Tue');
    assert.equal(opts[0].daysSince, 4);
    assert.equal(opts[1].reason, 'led Breakfast today');
    // today's earlier daypart counts: Luke's only recent lead is this morning, Sam led yesterday → Sam first
    const today = [
      { date: '2026-10-02', side: 'foh', daypart: 'lunch', assignments: {}, leadCaptain: 'p-sam' },
      { date: '2026-09-20', side: 'foh', daypart: 'lunch', assignments: {}, leadCaptain: 'p-luke' },
      { date: '2026-10-03', side: 'foh', daypart: 'breakfast', assignments: {}, leadCaptain: 'p-luke' },
    ];
    const t2 = leadCaptainOptions({ side: 'foh', onShift: shift, people: PEOPLE, rosterById, history: today, date: DATE, assignments: {}, slots: LUNCH_SLOTS });
    assert.deepEqual(t2.map(o => o.personId), ['p-sam', 'p-luke']);
    assert.equal(t2[0].reason, 'led yesterday');
    // two leads today: the one who led the earlier daypart goes first
    const both = [
      { date: '2026-10-03', side: 'foh', daypart: 'early', assignments: {}, leadCaptain: 'p-luke' },
      { date: '2026-10-03', side: 'foh', daypart: 'breakfast', assignments: {}, leadCaptain: 'p-sam' },
    ];
    assert.deepEqual(leadCaptainOptions({ side: 'foh', onShift: shift, people: PEOPLE, rosterById, history: both, date: DATE, assignments: {}, slots: LUNCH_SLOTS }).map(o => o.personId), ['p-luke', 'p-sam']);
    // Sam captaining a zone drops him behind Luke
    const cap = leadCaptainOptions({ side: 'foh', onShift: shift, people: PEOPLE, rosterById, history, date: DATE, assignments: { 'ipos-1': { personId: 'p-sam' } }, slots: LUNCH_SLOTS });
    assert.deepEqual(cap.map(o => o.personId), ['p-luke', 'p-sam']);
    assert.equal(cap[1].reason, 'captaining iPOS 1');
    // never led sorts first
    const fresh = leadCaptainOptions({ side: 'foh', onShift: shift, people: PEOPLE, rosterById, history: [], date: DATE, assignments: {}, slots: LUNCH_SLOTS });
    assert.equal(fresh[0].reason, 'hasn’t led yet');
    // a leaderShift makes a team member a TL for the day
    const tobias = leadCaptainOptions({ side: 'foh', onShift: shift, people: PEOPLE, rosterById: { ...rosterById, 'p-tobias': R('tobias', '6:00', '15:00', true) }, history: [], date: DATE, assignments: {}, slots: LUNCH_SLOTS });
    assert.ok(tobias.some(o => o.personId === 'p-tobias'));
  });
  test('leadHomeSlot: Runner if in range, else Drinks 3 / FC Bagger, DT Bagger 2 in the Afternoon', () => {
    assert.equal(leadHomeSlot({ side: 'foh', daypartKey: 'lunch', slots: LUNCH_SLOTS, headcount: 12, assignments: {} }), 'runner');
    // Runner is rank 9: with 8 people it is out of range → the zone with fewer leaders
    assert.equal(leadHomeSlot({ side: 'foh', daypartKey: 'lunch', slots: LUNCH_SLOTS, headcount: 8, assignments: { 'fc-bagger': { personId: 'p-luke' } }, people: PEOPLE, rosterById }), 'drinks-3');
    assert.equal(leadHomeSlot({ side: 'foh', daypartKey: 'lunch', slots: LUNCH_SLOTS, headcount: 8, assignments: { 'drinks-1': { personId: 'p-noor' } }, people: PEOPLE, rosterById }), 'fc-bagger');
    // Runner already taken → not Runner
    assert.notEqual(leadHomeSlot({ side: 'foh', daypartKey: 'lunch', slots: LUNCH_SLOTS, headcount: 12, assignments: { runner: { personId: 'p-tobias' } } }), 'runner');
    assert.equal(leadHomeSlot({ side: 'foh', daypartKey: 'afternoon', slots: S.foh.afternoon, headcount: 12, assignments: {} }), 'dt-bagger-2');
    // DT Bagger 2 already taken by hand → the lead does not "work" someone else's slot
    assert.notEqual(leadHomeSlot({ side: 'foh', daypartKey: 'afternoon', slots: S.foh.afternoon, headcount: 12, assignments: { 'dt-bagger-2': { personId: 'p-tobias' } } }), 'dt-bagger-2');
    // DT Bagger 2 is rank 12: with 9 people it is out of range → Drinks 3 / FC Bagger like any other daypart
    assert.notEqual(leadHomeSlot({ side: 'foh', daypartKey: 'afternoon', slots: S.foh.afternoon, headcount: 9, assignments: {} }), 'dt-bagger-2');
    assert.equal(leadHomeSlot({ side: 'boh', daypartKey: 'mid', slots: S.boh.mid, headcount: 8, assignments: {} }), null);
  });
});

// ---------- outside ----------
describe('outside rule', () => {
  const shift = onShift(ROSTER_FOH, LUNCH);
  const history = [{ date: DATE, side: 'foh', daypart: 'breakfast', assignments: BREAKFAST_ASSIGN, leadCaptain: null }];
  const run = (assignments, extra = {}) => outsideFlags({ side: 'foh', date: DATE, daypartKey: 'lunch', slots: LUNCH_SLOTS, assignments, history, onShift: shift, ...extra });

  test('outside two dayparts running is flagged', () => {
    const f = run({ 'ipos-2': { personId: 'p-tobias' } });
    assert.equal(f.length, 1);
    assert.deepEqual(f[0], { kind: 'outside-again', text: 'outside all Breakfast · swap ›', slotId: 'ipos-2', personId: 'p-tobias' });
    // moving between outside zones (iPOS → OMD) is still outside
    assert.equal(run({ 'omd-1': { personId: 'p-tobias' } }).length, 1);
    // an inside slot is fine
    assert.equal(run({ 'drinks-1': { personId: 'p-tobias' } }).length, 0);
  });
  test('last daypart of the shift is exempt', () => {
    assert.equal(run({ 'ipos-1': { personId: 'p-maria' } }).length, 0); // Maria ends 2:00
    assert.equal(run({ 'ipos-2': { personId: 'p-brielle' } }).length, 0);  // Brielle ends 11:30 — Host, but also last
    const later = onShift(ROSTER_FOH.map(r => r.personId === 'p-maria' ? R('maria', '6:00', '16:00') : r), LUNCH);
    assert.equal(run({ 'ipos-1': { personId: 'p-maria' } }, { onShift: later }).length, 1);
  });
  test('previous daypart inside, or only a mid-daypart hand-off outside, is not flagged', () => {
    assert.equal(run({ 'ipos-2': { personId: 'p-noor' } }).length, 0); // Noor was on Drinks 1
    const hist = [{ date: DATE, side: 'foh', daypart: 'breakfast', assignments: { 'ipos-2': { personId: 'p-brielle', handoffTo: 'p-tobias' } }, leadCaptain: null }];
    assert.equal(run({ 'ipos-2': { personId: 'p-tobias' } }, { history: hist }).length, 0);
    assert.equal(run({ 'ipos-2': { personId: 'p-tobias' } }, { history: [] }).length, 0);
    assert.equal(outsideFlags({ side: 'foh', date: DATE, daypartKey: 'early', slots: LUNCH_SLOTS, assignments: { 'ipos-2': { personId: 'p-tobias' } }, history, onShift: shift }).length, 0);
    assert.equal(outsideFlags({ side: 'boh', date: DATE, daypartKey: 'mid', slots: S.boh.mid, assignments: { 'primary-1': { personId: 'p-tobias' } }, history, onShift: shift }).length, 0);
  });
  test('history as the store map, raw-name keys and bare ids all work', () => {
    const f = run({ 'ipos-2': { personId: 'p-tobias' } }, { history: [], todayAssignmentsByDaypart: { breakfast: { 'iPOS 2 LANE 2': 'p-tobias' } } });
    assert.equal(f.length, 1);
    assert.equal(run({ 'ipos-2': { personId: 'p-tobias' } }, { history: { breakfast: { 'ipos-2': 'p-tobias' } } }).length, 1);
    assert.equal(run({ 'ipos-2': { personId: 'p-tobias' } }, { history: [{ date: DATE, side: 'foh', daypart: 'Breakfast (8:00-11:00)', assignments: { 'iPOS 2 LANE 2': 'p-tobias' } }] }).length, 1);
  });
  test('a break changes nothing', () => {
    const without = buildBoard(boardArgs({ breakPlan: null })).rows.flatMap(r => r.flags.filter(f => f.kind === 'outside-again'));
    const withBreak = buildBoard(boardArgs({ breakPlan: { offNow: [{ personId: 'p-tobias', start: 630, end: 660, cover: null }], plan: [{ personId: 'p-tobias', start: 630, end: 660, cover: null }] }, now: 640 })).rows.flatMap(r => r.flags.filter(f => f.kind === 'outside-again'));
    assert.deepEqual(without, withBreak);
    assert.equal(without.length, 1);
    assert.equal(without[0].personId, 'p-tobias');
  });
});

// ---------- tiers ----------
describe('tiers', () => {
  test('boundaries are inclusive', () => {
    assert.deepEqual(TIERS.map(t => [t.key, t.min]), [['crushing', 2.75], ['rise', 1.75], ['notyet', 0]]);
    assert.equal(tierFor(2.75), 'crushing');
    assert.equal(tierFor(2.74), 'rise');
    assert.equal(tierFor(1.75), 'rise');
    assert.equal(tierFor(1.74), 'notyet');
    assert.equal(tierFor(3), 'crushing');
    assert.equal(tierFor(1), 'notyet');
    assert.equal(tierFor(null), null);
  });
  test('scoreFor: mean of the latest 5, 2 dp; never rated → null', () => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map(i => ({ personId: 'p-x', position: 'Host', score: i <= 2 ? 1 : 3, at: `2026-09-${String(10 + i).padStart(2, '0')}T10:00`, leaderId: 'p-l' }));
    const s = scoreFor(rows, 'p-x', 'Host');
    assert.deepEqual([s.score, s.tier, s.count, s.lastAt], [3, 'crushing', 7, '2026-09-17T10:00']);
    const t = scoreFor(rows.slice(0, 4), 'p-x', 'Host'); // 1,1,3,3 → 2
    assert.deepEqual([t.score, t.tier, t.count], [2, 'rise', 4]);
    assert.deepEqual(scoreFor(rows, 'p-x', 'iPOS'), { score: null, tier: null, count: 0, lastAt: null });
    assert.deepEqual(scoreFor([], 'p-none', 'Host').score, null);
    // the tier follows the rounded score the chip shows: 2.744 → 2.74 On the Rise, 2.746 → 2.75 Crushing It
    assert.deepEqual([scoreFor([{ personId: 'p-y', position: 'Host', score: 2.744, at: '2026-09-01T00:00' }], 'p-y', 'Host').score, scoreFor([{ personId: 'p-y', position: 'Host', score: 2.744, at: '2026-09-01T00:00' }], 'p-y', 'Host').tier], [2.74, 'rise']);
    assert.deepEqual([scoreFor([{ personId: 'p-y', position: 'Host', score: 2.746, at: '2026-09-01T00:00' }], 'p-y', 'Host').score, scoreFor([{ personId: 'p-y', position: 'Host', score: 2.746, at: '2026-09-01T00:00' }], 'p-y', 'Host').tier], [2.75, 'crushing']);
    assert.equal(scoreFor([{ personId: 'p-y', position: 'Host', score: 1.744, at: '2026-09-01T00:00' }], 'p-y', 'Host').tier, 'notyet');
    assert.equal(scoreFor([{ personId: 'p-y', position: 'Host', score: 1.75, at: '2026-09-01T00:00' }], 'p-y', 'Host').tier, 'rise');
    assert.equal(scoreFor(PEA, 'p-yesenia', 'Drinks 1/3').tier, 'notyet');
    assert.equal(scoreFor(PEA, 'p-yesenia', 'Host').score, null);
    assert.equal(scoreFor(PEA, 'p-tobias', 'ipos').score, 2.8); // case-insensitive position
  });
  test('allGreen and peaDueDays', () => {
    const rows = ['iPOS', 'Bagging', 'Drinks 1/3', 'Drinks 2', 'OMD', 'Host'].map(p => ({ personId: 'p-g', position: p, score: 3, at: '2026-09-20T10:00' }));
    const a = allGreen(rows, 'p-g', 'foh');
    assert.deepEqual(a.missing, ['Runner']);
    assert.equal(a.isAllGreen, false);
    const b = allGreen(rows.concat({ personId: 'p-g', position: 'Runner', score: 2.75, at: '2026-09-21T10:00' }), 'p-g', 'foh');
    assert.ok(b.isAllGreen);
    assert.equal(allGreen([], 'p-g', 'foh').green.length, 0);
    assert.equal(peaDueDays(PEA, 'p-sienna', DATE), 31);
    assert.equal(peaDueDays(PEA, 'p-harper', DATE), null);
    assert.equal(peaDueDays(PEA, 'p-tobias', DATE), 13);
  });
});

// ---------- board ----------
describe('board', () => {
  const board = buildBoard(boardArgs());
  const row = id => board.rows.find(r => r.slot.id === id);

  test('window, headcount, counts', () => {
    assert.deepEqual([board.window.start, board.window.end, board.window.name], [660, 840, 'Lunch']);
    assert.equal(board.onShift.length, 14);
    assert.equal(board.pairs.length, 2);
    // 14 on shift − 2 hand-off pairs (Brielle→Sofia, Noor→Kendra) = 12 expected with the SPEC roster as written
    assert.equal(board.headcount, 12);
    assert.equal(board.counts.placed, 8);
    assert.equal(board.counts.expected, 12);
    assert.equal(board.counts.flags, 2);
    assert.equal(board.carriedFrom, 'breakfast');
  });
  test('the canvas story "8 of 13 placed · 2 flags" holds with the manager on the floor', () => {
    const b = buildBoard(boardArgs({ roster: ROSTER_FOH.concat(R('dorian', '10:00', '18:00')) }));
    assert.equal(b.counts.placed, 8);
    assert.equal(b.counts.expected, 13);
    assert.equal(b.counts.flags, 2);
    assert.equal(b.counts.needed, 5); // "Fill 5 open spots"
    assert.deepEqual(b.rows.filter(r => r.needed).map(r => r.slot.name), ['Drinks 1', 'OMD 1', 'DT Bagger 2', 'Host 2', 'FC Bagger 2']);
    assert.ok(b.rows[13].folded);
    const flags = b.rows.flatMap(r => r.flags);
    assert.deepEqual(flags.map(f => [f.kind, f.slotId, f.personId]).sort(), [['captain-leaves', 'host-1', 'p-sofia'], ['outside-again', 'ipos-2', 'p-tobias']]);
  });
  test('exactly two flags: Tobias outside again, Brielle handing Host 1 to Sofia', () => {
    const flags = board.rows.flatMap(r => r.flags);
    assert.equal(flags.length, 2);
    assert.equal(row('ipos-2').flags[0].kind, 'outside-again');
    assert.equal(row('ipos-2').flags[0].text, 'outside all Breakfast · swap ›');
    assert.equal(row('host-1').flags[0].kind, 'captain-leaves');
    assert.equal(row('host-1').flags[0].text, 'Brielle leaves 11:30 · Sofia isn’t a leader ›');
    assert.deepEqual(row('drinks-3').flags, []); // Noor → Kendra is reached by Luke
    assert.deepEqual(row('ipos-1').flags, []);   // Maria: her last daypart
  });
  test('needed / folded follow rank against the headcount', () => {
    assert.deepEqual(board.rows.filter(r => r.needed).map(r => r.slot.name), ['Drinks 1', 'OMD 1', 'DT Bagger 2', 'Host 2']);
    assert.ok(row('fc-bagger-2').folded && !row('fc-bagger-2').needed);
    assert.ok(row('surfer').folded);
    assert.ok(!row('omd-2').needed && !row('omd-2').folded);
    assert.equal(board.rows[0].rank, 1);
    assert.equal(board.rows[12].rank, 13);
  });
  test('names, role tags and score chips', () => {
    assert.deepEqual([row('ipos-1').name, row('ipos-1').roleTag, row('ipos-1').scoreChip], ['Maria', 'TRAINER', null]);
    assert.deepEqual([row('fc-bagger').name, row('fc-bagger').roleTag], ['Luke', 'TL']);
    assert.deepEqual([row('runner').roleTag, row('runner').scoreChip], ['TL', null]);
    assert.deepEqual(row('ipos-2').scoreChip, { score: 2.8, tier: 'crushing', star: false });
    assert.deepEqual(row('drinks-2').scoreChip, { score: 2.1, tier: 'rise', star: false });
    assert.deepEqual(row('omd-2').scoreChip, { score: 2.3, tier: 'rise', star: true });
    assert.equal(row('drinks-1').name, null);
    assert.equal(row('drinks-1').roleTag, null);
  });
  test('notes: break, hand-offs, leaves, on till', () => {
    assert.equal(row('ipos-1').note, 'on break · back 11:15 · Harper covering');
    assert.equal(row('host-1').note, '→ Sofia 11:30');
    assert.equal(row('drinks-3').note, 'till 1:00 → Kendra');
    assert.equal(row('drinks-2').note, 'leaves 1:00');
    assert.equal(row('ipos-2').note, 'on till 3:00');
    assert.equal(row('fc-bagger').note, null);
    // once Maria is back the note goes
    assert.equal(buildBoard(boardArgs({ now: 680 })).rows[0].note, null);
    // an arrival placed straight onto a slot
    const b = buildBoard(boardArgs({ assignments: { ...LUNCH_ASSIGN, 'host-2': { personId: 'p-sofia' } } }));
    assert.equal(b.rows.find(r => r.slot.id === 'host-2').note, 'from 11:30');
  });
  test('Game Day: a Not Yet or never-rated team member placed by hand carries a flag', () => {
    const b = buildBoard(boardArgs({ assignments: { ...LUNCH_ASSIGN, 'host-2': { personId: 'p-yesenia' }, 'drinks-1': { personId: 'p-yesenia' } } }));
    assert.equal(b.rows.find(r => r.slot.id === 'host-2').flags[0].kind, 'not-rated-gameday');
    assert.equal(b.rows.find(r => r.slot.id === 'drinks-1').flags[0].kind, 'not-yet-gameday');
    const p = buildBoard(boardArgs({ dayType: 'practice', assignments: { ...LUNCH_ASSIGN, 'host-2': { personId: 'p-yesenia' } } }));
    assert.deepEqual(p.rows.find(r => r.slot.id === 'host-2').flags, []);
  });
  test('At 1:00: three leave, one hand-off, one spot to cover', () => {
    assert.equal(board.at1.time, 780);
    assert.equal(board.at1.label, '1:00');
    assert.equal(board.at1.leavers.length, 3);
    assert.deepEqual(new Set(board.at1.leavers.map(l => l.personId)), new Set(['p-noor', 'p-emilio', 'p-diego']));
    assert.deepEqual(board.at1.handoffs, [{ personId: 'p-noor', toId: 'p-kendra', slotId: 'drinks-3', at: 780 }]);
    // 12 expected, Emilio and Diego leave unpaired → 10 after 1:00; Drinks 2 is rank 8, still inside
    // the range, so it is a gap to cover, not a closing
    assert.equal(board.at1.headcountAfter, 10);
    assert.deepEqual(board.at1.closes, []);
    assert.deepEqual(board.at1.opens.map(c => c.slotId), ['drinks-2']);
    assert.equal(board.at1.leavers.find(l => l.personId === 'p-noor').text, 'Noor leaves · Drinks 3 → Kendra');
    assert.equal(board.at1.leavers.find(l => l.personId === 'p-emilio').text, 'Emilio leaves · Drinks 2 open from 1:00 ›');
    assert.equal(board.at1.leavers.find(l => l.personId === 'p-emilio').kind, 'opens');
    assert.equal(board.at1.leavers.find(l => l.personId === 'p-diego').text, 'Diego leaves · not placed yet');
    assert.deepEqual(board.at1.all.map(g => g.label), ['11:30', '1:00']);
    // a leaver on a slot beyond the headcount after they go: that spot closes
    const tight = buildBoard(boardArgs({ assignments: { ...LUNCH_ASSIGN, 'omd-2': { personId: 'p-emilio' }, 'drinks-2': { personId: 'p-sienna' } } }));
    const n = tight.at1.leavers.find(l => l.personId === 'p-emilio');
    assert.equal(n.kind, 'closes');
    assert.equal(n.text, 'Emilio leaves · OMD 2 closes');
    assert.deepEqual(tight.at1.closes.map(c => c.slotId), ['omd-2']);
    // nobody leaves mid-daypart → null; leaving within the edge does not count
    const quiet = buildBoard(boardArgs({ roster: [R('maria', '6:00', '14:00'), R('luke', '10:00', '20:00', true), R('tobias', '6:00', '13:55')] }));
    assert.equal(quiet.at1, null);
  });
  test('lead captain, keep-an-eye and unplaced', () => {
    assert.deepEqual([board.lead.personId, board.lead.name, board.lead.homeSlotId], ['p-sam', 'Sam', 'runner']);
    const withHistory = buildBoard(boardArgs({ history: boardArgs().history.concat({ date: '2026-09-29', side: 'foh', daypart: 'lunch', assignments: {}, leadCaptain: 'p-sam' }) }));
    assert.equal(withHistory.lead.reason, 'hasn’t led since Tue');
    assert.equal(buildBoard(boardArgs({ leadCaptainId: null })).lead, null);
    assert.deepEqual(board.keepAnEye, [{ personId: 'p-sienna', reason: 'PEA due, 31 days', name: 'Sienna' }]);
    assert.deepEqual(new Set(board.unplaced), new Set(['p-rafael', 'p-harper', 'p-diego', 'p-yesenia']));
    assert.equal(buildBoard(boardArgs({ assignments: {} })).carriedFrom, null);
  });
  test('roster map form, bare-id assignments and the data module slots also work', () => {
    const b = buildBoard(boardArgs({ roster: { [DATE]: { foh: ROSTER_FOH, boh: [] } }, assignments: { 'iPOS 1 (Captain)': 'p-maria' }, slots: null }));
    assert.equal(b.headcount, 12);
    assert.equal(b.counts.placed, 1);
    assert.equal(b.rows[0].name, 'Maria');
    assert.ok(b.rows.length >= 13);
  });
});
