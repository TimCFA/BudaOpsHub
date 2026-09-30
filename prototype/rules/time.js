// Times are minutes since midnight (integers). Pure, no Date.now().

// '6:00' → 360, '13:30' → 810, '1:30 PM' → 810, '12:15am' → 15. Numbers pass through.
// Anything else → null.
export function parseTime(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input) : null;
  if (input == null) return null;
  const m = String(input).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 24 || min > 59) return null;
  const ampm = m[3] ? m[3][0].toLowerCase() : null;
  if (ampm === 'p' && h < 12) h += 12;
  if (ampm === 'a' && h === 12) h = 0;
  return h * 60 + min;
}

// 810 → '1:30' (12-hour, no am/pm). 0 or 1440 → '12:00'.
export function fmt(min) {
  if (min == null || !Number.isFinite(min)) return '';
  const total = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')}`;
}

// fmtRange(660, 840) → '11:00–2:00'
export function fmtRange(start, end) {
  return `${fmt(start)}–${fmt(end)}`;
}

// The header clock: clockLabel(652) → '10:52'.
export function clockLabel(min) {
  return fmt(min);
}

// Helpers other rules share.
export const HOUR = 60;
export const DAY = 1440;

// 'YYYY-MM-DD' → whole days since the epoch (UTC, so a phone's zone never shifts a date).
export function dayNumber(date) {
  if (!date) return null;
  const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
}

// Whole days from `from` to `to` (both 'YYYY-MM-DD' or ISO strings); null if either is missing.
export function daysBetween(from, to) {
  const a = dayNumber(from);
  const b = dayNumber(to);
  if (a == null || b == null) return null;
  return b - a;
}

// 0 = Sunday … 6 = Saturday for a 'YYYY-MM-DD' date.
export function weekday(date) {
  const n = dayNumber(date);
  if (n == null) return null;
  return ((n + 4) % 7 + 7) % 7; // 1970-01-01 was a Thursday
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A short label for a past date relative to `asOf`: 'yesterday', 'Tue' (within the week), else 'Sep 20'.
export function relativeDay(date, asOf) {
  const d = daysBetween(date, asOf);
  if (d == null) return '';
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d > 1 && d < 7) return WEEKDAYS[weekday(date)];
  const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
}
