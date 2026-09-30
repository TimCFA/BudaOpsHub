// Priority lists per side and daypart: raw slot names in priority order.
// rules/positions.js turns each name into a Slot (display name, sub, captain, zone, pea, outside).
//
// Source: the current app's static/js/zone-reset.js fohPositions / bohPositions, with
//   - Transition removed (merged into Lunch),
//   - typos fixed ('Dinning Room' → 'Dining Room', 'Secondari' → 'Secondary', 'Primari' → 'Primary',
//     'Breader1' → 'Breader 1', 'Drink 3' → 'Drinks 3'),
//   - the 'Shift Lead: …' slot removed,
//   - Breaks left out (breaks are planned by rules/breaks.js, not a spot on the board).
// Keys match rules/dayparts.js: FOH early, breakfast, lunch, afternoon, dinner, close;
// BOH early, breakfast, mid, afternoon, dinner, close.
//
// ONE DELIBERATE DEVIATION — Lunch (FOH): the app's Lunch order puts iPOS 3–5 and both DT
// Baggers ahead of Host 1 and Runner, which makes the SPEC/canvas story ("8 of 13 placed",
// Host 1 captain at rank 4, Runner at 9, Fill 5 open spots) impossible. The first 13 Lunch
// slots therefore follow the canvas artboard order; every remaining app slot follows after,
// in the app's order. Names are the app's names ('FC Bagger' carries '(Captain)' because the
// SPEC makes Luke the Bagging captain there; 'FC Bagger 2' is the canvas's rank-13 spot).

export const POSITIONS = {
  foh: {
    early: [
      'iPOS 1 LANE 1', 'iPOS 2 LANE 2', 'DT Bagger 1', 'Drinks 1', 'OMD 1', 'Drinks 3 / Runner', 'Host 1',
    ],
    breakfast: [
      'iPOS 1 (Captain)', 'iPOS 2 LANE 2', 'DT Bagger 1', 'Drinks 1', 'OMD 1', 'Host 1', 'FC Bagger',
      'Drinks 3', 'DT Bagger 2', 'iPOS 3 LANE 3', 'Runner', 'Host 2', 'Drinks 2', 'iPOS 4 LANE 1',
    ],
    lunch: [
      // canvas story order (ranks 1–13)
      'iPOS 1 (Captain)', 'FC Bagger (Captain)', 'Drinks 1', 'Host 1 (Captain)', 'OMD 1', 'iPOS 2 LANE 1',
      'DT Bagger 2', 'Drinks 2/Sample Prep', 'Runner', 'Drinks 3', 'Host 2', 'OMD 2', 'FC Bagger 2',
      // the rest of the app's Lunch list, app order
      'DT Bagger 1 (Cockpit Cap)', 'iPOS 3 LANE 2', 'iPOS 4 LANE 1', 'iPOS 5 LANE 2', 'Surfer',
      'iPOS 6 LANE 1', 'OMD 3', 'Host 3', 'Host 4', 'iPOS 7 LANE 2', 'Traffic Lane 1', 'iPOS 8 LANE 2', 'DT Bagger 4',
    ],
    afternoon: [
      'iPOS 1 (Captain)', 'iPOS 2 LANE 2', 'iPOS 3 LANE 1', 'Drinks 1', 'OMD 1', 'Host 1', 'FC Bagger',
      'Drinks 3', 'Host 2', 'Runner', 'iPOS 4 LANE 2', 'DT Bagger 2', 'Drinks 2', 'iPOS 5 LANE 1',
      'DT Bagger 3', 'Host 3', 'iPOS 6 LANE 3', 'iPOS 7 LANE 1', 'Traffic Lane 1', 'Desserts',
    ],
    dinner: [
      'iPOS 1 (Captain)', 'iPOS 2 LANE 2', 'iPOS 3 LANE 2', 'iPOS 4 LANE 1', 'iPOS 5 LANE 2',
      'DT Bagger 1 (Captain)', 'DT Bagger 2', 'Drinks 1', 'Drinks 2', 'OMD 1', 'OMD 2', 'FC Bagger',
      'Drinks 3', 'Host 1', 'Host 2', 'Runner', 'DT Bagger 3', 'Host 3', 'iPOS 6 LANE 3', 'OMD 3',
      'iPOS 7 LANE 1', 'Traffic Lane 1', 'iPOS 8 LANE 2', 'DT Bagger 4',
    ],
    close: [
      'iPOS 1 LANE 1', 'iPOS 2 LANE 2', 'DT Bagger 1', 'Drinks 1', 'OMD', 'Host 1', 'FC Bagger', 'Drinks 3',
      'Runner', 'Lemonades', 'Drinks Zone', 'Bagging Zone', 'Front Counter Zone', 'Outside Zone',
      'Dining Room', 'Restroom Zone', 'Floors',
    ],
  },
  boh: {
    early: ['Breader', 'Primary/Machines', 'Secondary', 'Prep', 'Filters'],
    breakfast: ['Breader', 'Primary/Machines', 'Secondary', 'Prep', 'Biscuit/Eggs', 'Prep 2'],
    mid: [
      'Breader 1', 'Breader 2', 'Machines', 'Primary 1', 'Fries', 'Secondary 1', 'Primary 2',
      'Secondary 2', 'Prep', 'Primary 3',
    ],
    afternoon: ['Breader 1', 'Machines', 'Primary 1', 'Fries', 'Secondary 1', 'Breader 2', 'Prep'],
    dinner: [
      'Breader 1', 'Breader 2', 'Machines', 'Primary 1', 'Fries', 'Secondary 1', 'Primary 2',
      'Secondary 2', 'Prep',
    ],
    close: [
      'Breader 1', 'Breader 2', 'Machines', 'Primary 1', 'Fries', 'Secondary 1', 'Primary 2',
      'Secondary 2', 'Prep', 'Floors', 'Prep/dishes',
    ],
  },
};

// The brief's PEA position groups (all-green is Crushing It on every one of the side's list).
export const PEA_POSITIONS = {
  foh: ['iPOS', 'Bagging', 'Drinks 1/3', 'Drinks 2', 'OMD', 'Host', 'Runner'],
  boh: ['Breader', 'Primary', 'Secondary', 'Machines', 'Fries', 'Prep'],
};

export function positionNames(side, daypartKey) {
  return (POSITIONS[side] && POSITIONS[side][daypartKey]) || [];
}
