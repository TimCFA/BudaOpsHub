// Roster per date, per side. Times are 'H:MM' 24-hour strings (rules/time.js parseTime).
// Roster = { personId, start, end, leaderShift?: boolean }  — one entry per person per date+side.
// Saturday 2026-10-03 is the sample day (SPEC roster table, verbatim).

export const ROSTER = {
  '2026-10-03': {
    foh: [
      { personId: 'p-maria',  start: '6:00',  end: '14:00', leaderShift: false },
      { personId: 'p-luke',   start: '10:00', end: '20:00', leaderShift: true  },
      { personId: 'p-brielle',   start: '6:00',  end: '11:30', leaderShift: false },
      { personId: 'p-sofia',  start: '11:30', end: '20:00', leaderShift: false },
      { personId: 'p-tobias',   start: '6:00',  end: '15:00', leaderShift: false },
      { personId: 'p-emilio', start: '11:00', end: '13:00', leaderShift: false },
      { personId: 'p-sam',    start: '10:00', end: '20:00', leaderShift: true  },
      { personId: 'p-noor',     start: '6:00',  end: '13:00', leaderShift: false },
      { personId: 'p-kendra', start: '12:30', end: '20:00', leaderShift: false },
      { personId: 'p-sienna', start: '11:00', end: '17:00', leaderShift: false },
      { personId: 'p-rafael', start: '11:00', end: '17:30', leaderShift: false },
      { personId: 'p-harper', start: '11:00', end: '20:00', leaderShift: false },
      { personId: 'p-diego',  start: '11:00', end: '13:00', leaderShift: false },
      { personId: 'p-yesenia',  start: '11:00', end: '16:00', leaderShift: false },
    ],
    boh: [
      { personId: 'p-mateo',  start: '6:00',  end: '14:00', leaderShift: true  },
      { personId: 'p-priya',  start: '6:00',  end: '14:00', leaderShift: false },
      { personId: 'p-andre',  start: '6:00',  end: '14:00', leaderShift: false },
      { personId: 'p-rosa',   start: '6:00',  end: '14:00', leaderShift: false },
      { personId: 'p-kenji',  start: '10:30', end: '20:00', leaderShift: false },
      { personId: 'p-bianca', start: '10:30', end: '20:00', leaderShift: false },
      { personId: 'p-omar',   start: '10:30', end: '20:00', leaderShift: false },
      { personId: 'p-tessa',  start: '10:30', end: '20:00', leaderShift: false },
    ],
  },
};

// Roster entries for a date and side ([] when the day has no roster, e.g. Sundays).
export function rosterFor(date, side) {
  return (ROSTER[date] && ROSTER[date][side]) || [];
}

// { personId: entry } for a date and side.
export function rosterById(date, side) {
  return Object.fromEntries(rosterFor(date, side).map(r => [r.personId, r]));
}
