// Dayparts per side, windows in minutes since midnight.
// FOH Lunch is 11:00–2:00 with Transition merged in (Tim, Sep 29).

export const DAYPARTS = {
  foh: [
    { key: 'early', name: 'Early Breakfast', start: 360, end: 480 },
    { key: 'breakfast', name: 'Breakfast', start: 480, end: 660 },
    { key: 'lunch', name: 'Lunch', start: 660, end: 840 },
    { key: 'afternoon', name: 'Afternoon', start: 840, end: 1020 },
    { key: 'dinner', name: 'Dinner', start: 1020, end: 1200 },
    { key: 'close', name: 'Close', start: 1200, end: 1320 },
  ],
  boh: [
    { key: 'early', name: 'Early Breakfast', start: 360, end: 480 },
    { key: 'breakfast', name: 'Breakfast', start: 480, end: 630 },
    { key: 'mid', name: 'Mid', start: 630, end: 840 },
    { key: 'afternoon', name: 'Afternoon', start: 840, end: 1020 },
    { key: 'dinner', name: 'Dinner', start: 1020, end: 1200 },
    { key: 'close', name: 'Close', start: 1200, end: 1320 },
  ],
};

function list(side) {
  return DAYPARTS[side] || DAYPARTS.foh;
}

// The daypart whose window contains `min` (start ≤ min < end). Before 6:00 → the first;
// at or after 22:00 → the last.
export function daypartAt(side, min) {
  const dps = list(side);
  if (min == null || min < dps[0].start) return dps[0];
  for (const dp of dps) if (min >= dp.start && min < dp.end) return dp;
  return dps[dps.length - 1];
}

export function daypartByKey(side, key) {
  return list(side).find(dp => dp.key === key) || null;
}

// Accepts a key ('lunch') or a display name ('Lunch', 'Lunch (11:00-2:00)').
export function daypartByKeyOrName(side, keyOrName) {
  if (!keyOrName) return null;
  const k = String(keyOrName).trim().toLowerCase().replace(/\s*\(.*\)\s*$/, '');
  return list(side).find(dp => dp.key === k || dp.name.toLowerCase() === k) || null;
}

export function nextDaypart(side, key) {
  const dps = list(side);
  const i = dps.findIndex(dp => dp.key === key);
  return i >= 0 && i < dps.length - 1 ? dps[i + 1] : null;
}

export function prevDaypart(side, key) {
  const dps = list(side);
  const i = dps.findIndex(dp => dp.key === key);
  return i > 0 ? dps[i - 1] : null;
}
