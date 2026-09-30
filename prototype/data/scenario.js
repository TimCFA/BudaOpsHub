// Today's scenario: Saturday 2026-10-03 (Game Day), demo clock default 10:52.
// Everything the store seeds on first load. Times are minutes since midnight.
//
// ASSIGNMENT KEYS ARE RAW SLOT NAMES (the strings in data/positions.js), exactly like
// data/history.js. The store turns a name into a slot id with rules/positions.js
// slotFromName(name, side).id when it seeds Assignments = { [slotId]: Assign }.
// Assign = { personId, pending?, handoffTo?, handoffAt? }

export const SCENARIO = {
  date: '2026-10-03',            // Saturday → Game Day
  defaultNow: 652,               // 10:52
  clockPresets: [652, 760, 838, 844, 1030],   // 10:52 · 12:40 · 1:58 · 2:04 · 5:10
  dayTypeOverride: null,         // per-daypart leader override lives in the store: { [daypartKey]: 'game'|'practice' }

  assignments: {
    foh: {
      // Early Breakfast 6–8 (done)
      // Leaders spread (Noor iPOS, Maria Bagging, Brielle Host); Noor outside here and inside at Breakfast,
      // Maria inside here and outside at Breakfast, so Breakfast carries no outside flag.
      early: {
        'iPOS 1 LANE 1': { personId: 'p-noor' },
        'DT Bagger 1':   { personId: 'p-maria' },
        'Drinks 1':      { personId: 'p-tobias' },
        'Host 1':        { personId: 'p-brielle' },
      },
      // Breakfast 8–11 (fully set up; Tobias outside → his Lunch iPOS 2 gets the outside flag)
      breakfast: {
        'iPOS 1 (Captain)': { personId: 'p-maria' },
        'iPOS 2 LANE 2':    { personId: 'p-tobias' },
        'DT Bagger 1':      { personId: 'p-diego' },
        'Drinks 1':         { personId: 'p-noor' },
        'Host 1':           { personId: 'p-brielle' },
        'FC Bagger':        { personId: 'p-luke' },
        'Drinks 3':         { personId: 'p-sam' },
      },
      // Lunch 11–2, carried from Breakfast at 10:50: 8 placed, 5 Needed
      // (Drinks 1, OMD 1, DT Bagger 2, Host 2, FC Bagger 2), 2 flags
      // (Brielle → Sofia at Host 1: Sofia isn't a leader; Tobias iPOS 2: outside all Breakfast).
      lunch: {
        'iPOS 1 (Captain)':     { personId: 'p-maria' },
        'FC Bagger (Captain)':  { personId: 'p-luke' },
        'Host 1 (Captain)':     { personId: 'p-brielle', handoffTo: 'p-sofia', handoffAt: 690 },
        'iPOS 2 LANE 1':        { personId: 'p-tobias' },
        'Drinks 2/Sample Prep': { personId: 'p-emilio' },
        'Runner':               { personId: 'p-sam' },
        'Drinks 3':             { personId: 'p-noor', handoffTo: 'p-kendra', handoffAt: 780 },
        'OMD 2':                { personId: 'p-sienna' },
      },
      afternoon: {},
      dinner: {},
      close: {},
    },
    boh: {
      early: {
        'Breader':          { personId: 'p-priya' },
        'Primary/Machines': { personId: 'p-mateo' },
        'Secondary':        { personId: 'p-andre' },
        'Prep':             { personId: 'p-rosa' },
      },
      breakfast: {
        'Breader':          { personId: 'p-priya' },
        'Primary/Machines': { personId: 'p-mateo' },
        'Secondary':        { personId: 'p-andre' },
        'Prep':             { personId: 'p-rosa' },
      },
      // Mid 10:30–2: 8 on shift, all 8 placed (Mateo TL on Primary, Priya Trainer on Raw)
      mid: {
        'Breader 1':   { personId: 'p-priya' },
        'Breader 2':   { personId: 'p-andre' },
        'Machines':    { personId: 'p-rosa' },
        'Primary 1':   { personId: 'p-mateo' },
        'Fries':       { personId: 'p-kenji' },
        'Secondary 1': { personId: 'p-bianca' },
        'Primary 2':   { personId: 'p-omar' },
        'Secondary 2': { personId: 'p-tessa' },
      },
      afternoon: {},
      dinner: {},
      close: {},
    },
  },

  // Lead Captain chosen per side+daypart (null = let rules/leaders.js pick by rotation → Sam).
  leadCaptain: { foh: { breakfast: 'p-luke', lunch: null }, boh: { breakfast: 'p-mateo', mid: 'p-mateo' } },

  // Hand-moved breaks stick (rules/breaks.js overrides). Maria is off 10:45–11:15, Harper covers.
  breaks: {
    overrides: { foh: { 'p-maria': 645 }, boh: {} },
  },

  // Waste logged so far today (9 entries before 10:41 by Brielle, Luke, Tobias).
  // Entry = { id, productId, size: label|null, qty, who: personId, date, at: min }
  waste: {
    limitPerDay: 20,     // count limit until item costs exist (Scores: "today vs limit")
    streakDays: 6,       // days in a row under the limit before today
    entries: [
      { id: 'w1', productId: 'biscuit',  size: null, qty: 1, who: 'p-brielle', date: '2026-10-03', at: 492 },  // 8:12
      { id: 'w2', productId: 'hash-browns', size: 'Reg', qty: 2, who: 'p-tobias', date: '2026-10-03', at: 520 },  // 8:40
      { id: 'w3', productId: 'biscuit',  size: null, qty: 1, who: 'p-brielle', date: '2026-10-03', at: 545 },  // 9:05
      { id: 'w4', productId: 'lemonade', size: 'M',  qty: 1, who: 'p-tobias', date: '2026-10-03', at: 573 },  // 9:33
      { id: 'w5', productId: 'nuggets',  size: '8',  qty: 1, who: 'p-brielle', date: '2026-10-03', at: 590 },  // 9:50
      { id: 'w6', productId: 'sandwich', size: null, qty: 1, who: 'p-luke', date: '2026-10-03', at: 604 },  // 10:04
      { id: 'w7', productId: 'fries',    size: 'M',  qty: 1, who: 'p-tobias', date: '2026-10-03', at: 618 },  // 10:18
      { id: 'w8', productId: 'fries',    size: 'L',  qty: 2, who: 'p-luke', date: '2026-10-03', at: 631 },  // 10:31 (tape)
      { id: 'w9', productId: 'nuggets',  size: '12', qty: 1, who: 'p-brielle', date: '2026-10-03', at: 638 },  // 10:38 (tape)
    ],
  },

  // Tasks state: the 2:00 Restrooms reset, 3 of 8 done by Rafael (Host 1) as of 2:04.
  // done[taskId] = { items: [checklist item indexes], by: personId, at: min }
  tasks: {
    done: {
      't-1400-restrooms': { items: [0, 1, 2], by: 'p-rafael', at: 844 },
    },
  },

  // Per-device defaults (More → Who's using this phone, language, side)
  device: { personId: 'p-dorian', lang: 'en', side: 'foh' },
};

export default SCENARIO;
