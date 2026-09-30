// Waste log helpers. Immutable: every function returns new arrays and never touches its input.
// Entry = { id, productId, size: label|null, qty, who: personId, date: 'YYYY-MM-DD', at: min, ts?: ms }
//   `at` is minutes since midnight (the store clock); `ts` is an optional real timestamp (ms)
//   that the store may attach so the 5-second Undo window can be measured in real time.

export const UNDO_WINDOW_SEC = 5;
export const TAPE_MINUTES = 15;

let seq = 0;
function nextId(entries) {
  seq += 1;
  const n = (entries || []).length + seq;
  return `w${n}-${seq}`;
}

// entries' with the new entry appended. Missing qty → 1; missing size → null.
export function logEntry(entries, { productId, qty = 1, who, at, date = null, size = null, ts = null, id = null } = {}) {
  const list = entries || [];
  const entry = {
    id: id || nextId(list),
    productId,
    size: size ?? null,
    qty: Math.max(1, Math.round(Number(qty) || 1)),
    who,
    date,
    at: at ?? null,
    ts: ts ?? null,
  };
  return list.concat([entry]);
}

// Seconds for an entry time or a "now": ms timestamps (> 10^8) → seconds, minutes → seconds.
function seconds(v) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  return n > 1e8 ? n / 1000 : n * 60;
}

// The last entry logged by `who`, removed when it is still inside the Undo window.
// `now` and the entry time are compared in real time when both carry ms timestamps
// (entry.ts), else on the store clock in minutes (a 5 s window then means "the same minute").
// → { entries, removed: entry|null }
export function undoLast(entries, who, now, windowSec = UNDO_WINDOW_SEC) {
  const list = entries || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (who && e.who !== who) continue;
    const t = e.ts != null ? seconds(e.ts) : seconds(e.at);
    const n = seconds(now);
    if (t != null && n != null) {
      const age = n - t;
      const tooOld = e.ts != null ? age > windowSec : age > Math.max(windowSec, 60);
      if (age < 0 || tooOld) return { entries: list, removed: null };
    }
    return { entries: list.slice(0, i).concat(list.slice(i + 1)), removed: e };
  }
  return { entries: list, removed: null };
}

// Number of entries logged on `date` (each tap is one entry; sizes are not multiplied).
export function todayCount(entries, date) {
  return (entries || []).filter(e => !date || e.date === date).length;
}

// Pieces logged on `date` (sum of qty), for the "today vs limit" view when wanted.
export function todayPieces(entries, date) {
  return (entries || []).filter(e => !date || e.date === date).reduce((n, e) => n + (Number(e.qty) || 0), 0);
}

// The last `minutes` (default 15) of entries up to `now`, newest first. Filtered to `date` when given.
export function tape(entries, now, minutes = TAPE_MINUTES, date = null) {
  return (entries || [])
    .filter(e => e.at != null && e.at <= now && e.at > now - minutes && (!date || !e.date || e.date === date))
    .slice()
    .sort((a, b) => b.at - a.at || String(b.id).localeCompare(String(a.id)));
}

// True while the $ view cannot be shown: no products, or every cost missing or 0.
export function needsCosts(products) {
  const list = products || [];
  if (!list.length) return true;
  return list.every(p => !p || !(Number(p.cost) > 0));
}

// $ of an entry list when costs exist; null while needsCosts.
export function totalCost(entries, products) {
  if (needsCosts(products)) return null;
  const byId = new Map((products || []).map(p => [p.id, p]));
  return (entries || []).reduce((sum, e) => sum + (Number(byId.get(e.productId)?.cost) || 0) * (Number(e.qty) || 0), 0);
}
