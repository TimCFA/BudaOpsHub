// Game Day or Practice Day. Friday and Saturday are Game Days; any other day is a Game Day
// when at least two of the three signals fire (special event, sales ≥ 115 % of usual,
// goal ≥ 110 %). A leader's override (stored per daypart) always wins.
// Pure: no store, no Date.now().

export const GAME_WEEKDAYS = [5, 6]; // Friday, Saturday
export const SALES_SIGNAL = 1.15;
export const GOAL_SIGNAL = 1.10;

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// 0 = Sunday … 6 = Saturday for a 'YYYY-MM-DD' date; null when unreadable.
export function weekdayOf(date) {
  const m = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const days = Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
  return ((days + 4) % 7 + 7) % 7; // 1970-01-01 was a Thursday
}

// → { type: 'game'|'practice', reason, signals: string[], override: boolean }
export function dayType({ date, override = null, specialEvent = false, salesRatio = 1, goalRatio = 1 } = {}) {
  if (override === 'game' || override === 'practice') {
    return { type: override, reason: override === 'game' ? 'leader set Game Day' : 'leader set Practice Day', signals: [], override: true };
  }
  const wd = weekdayOf(date);
  if (wd != null && GAME_WEEKDAYS.includes(wd)) {
    return { type: 'game', reason: WEEKDAY_NAMES[wd], signals: [WEEKDAY_NAMES[wd]], override: false };
  }
  const signals = [];
  if (specialEvent) signals.push('special event');
  if (Number(salesRatio) >= SALES_SIGNAL) signals.push(`sales ${Math.round(Number(salesRatio) * 100)} % of usual`);
  if (Number(goalRatio) >= GOAL_SIGNAL) signals.push(`goal ${Math.round(Number(goalRatio) * 100)} %`);
  if (signals.length >= 2) return { type: 'game', reason: signals.join(' + '), signals, override: false };
  const reason = wd == null ? 'no Game Day signals' : signals.length === 1 ? `${WEEKDAY_NAMES[wd]} · only ${signals[0]}` : WEEKDAY_NAMES[wd];
  return { type: 'practice', reason, signals, override: false };
}

export function isGameDay(dayTypeOrType) {
  const t = dayTypeOrType && typeof dayTypeOrType === 'object' ? dayTypeOrType.type : dayTypeOrType;
  return t === 'game';
}

export function dayTypeLabel(dayTypeOrType) {
  return isGameDay(dayTypeOrType) ? 'Game Day' : 'Practice Day';
}
