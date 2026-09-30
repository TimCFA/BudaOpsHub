// Recurring FOH tasks: due now with a 30-minute grace, the next few, per-daypart lists and
// checklist progress. Task = { id, at: min, name, es, mins, dur?: max minutes, owner: slot name,
// checklist?: zone key, items?: [{ en, es }] }.
// TASKS comes from data/tasks.js when that module exists; otherwise the inline list below
// (the current app's SHIFT_TASKS with Tim's owners).

export const GRACE_MIN = 30;

const INLINE_TASKS = [
  { id: 't-0800-restroom-check', at: 480,  name: 'Restroom check',         es: 'Revisar los baños',       mins: '10–15 min', dur: 15, owner: 'Host 1',   checklist: null, items: null },
  { id: 't-0930-lemonades',      at: 570,  name: 'Lemonades for lunch',    es: 'Limonadas para el lunch', mins: '15–20 min', dur: 20, owner: 'Drinks 1', checklist: null, items: null },
  { id: 't-1000-restrooms',      at: 600,  name: 'Restrooms — full reset', es: 'Baños — reset completo',  mins: '20–30 min', dur: 30, owner: 'Host 1',   checklist: 'restrooms', items: null },
  { id: 't-1015-trash',          at: 615,  name: 'Trash reset',            es: 'Reset de basura',         mins: '5–10 min (+5 to the dumpster)', dur: 15, owner: 'Runner', checklist: null, items: null },
  { id: 't-1400-restrooms',      at: 840,  name: 'Restrooms — full reset', es: 'Baños — reset completo',  mins: '20–30 min', dur: 30, owner: 'Host 1',   checklist: 'restrooms', items: null },
  { id: 't-1415-restock',        at: 855,  name: 'Restock',                es: 'Reponer',                 mins: '15–30 min', dur: 30, owner: 'Host 2',   checklist: null, items: null },
  { id: 't-1445-trash',          at: 885,  name: 'Trash to the dumpster',  es: 'Basura al basurero',      mins: '10–15 min', dur: 15, owner: 'Runner',   checklist: null, items: null },
  { id: 't-1515-lemonades',      at: 915,  name: 'Lemonades for dinner',   es: 'Limonadas para la cena',  mins: '15–20 min', dur: 20, owner: 'Drinks 1', checklist: null, items: null },
  { id: 't-2030-restrooms',      at: 1230, name: 'Restrooms — full reset', es: 'Baños — reset completo',  mins: '20–30 min', dur: 30, owner: 'Host 1',   checklist: 'restrooms', items: null },
  { id: 't-2045-trash',          at: 1245, name: 'Trash reset',            es: 'Reset de basura',         mins: '5–10 min (+5 to the dumpster)', dur: 15, owner: 'Runner', checklist: null, items: null },
  { id: 't-2100-restock',        at: 1260, name: 'Restock for tomorrow',   es: 'Reponer para mañana',     mins: '15–30 min', dur: 30, owner: 'Host 2',   checklist: null, items: null },
];

export const TASKS = await import('../data/tasks.js')
  .then(m => (Array.isArray(m.TASKS) && m.TASKS.length ? m.TASKS : INLINE_TASKS))
  .catch(() => INLINE_TASKS);

// Longest duration in minutes: task.dur, else the last number in `mins` ('20–30 min' → 30), else 30.
export function durationOf(task) {
  if (task && Number.isFinite(Number(task.dur))) return Number(task.dur);
  const nums = String((task && task.mins) || '').match(/\d+/g);
  if (!nums || !nums.length) return 30;
  return Math.max(...nums.map(Number));
}

// The task is due from `at` until `at + duration + grace` (exclusive).
export function dueUntil(task, graceMin = GRACE_MIN) {
  return task.at + durationOf(task) + graceMin;
}

export function isDue(task, now, graceMin = GRACE_MIN) {
  return task && task.at <= now && now < dueUntil(task, graceMin);
}

// Tasks due at `now`, earliest first.
export function dueNow(tasks, now, graceMin = GRACE_MIN) {
  return (tasks || []).filter(t => isDue(t, now, graceMin)).slice().sort((a, b) => a.at - b.at || String(a.id).localeCompare(String(b.id)));
}

// The next `count` tasks that start after `now`.
export function nextTasks(tasks, now, count = 3) {
  return (tasks || []).filter(t => t.at > now).slice().sort((a, b) => a.at - b.at || String(a.id).localeCompare(String(b.id))).slice(0, count);
}

// Tasks starting inside the window [start, end).
export function tasksForDaypart(tasks, window) {
  if (!window) return [];
  return (tasks || []).filter(t => t.at >= window.start && t.at < window.end).slice().sort((a, b) => a.at - b.at);
}

// doneMap: an array of done item indexes, a Set of indexes, or an object keyed by index (or by
// the item's `en` text) with truthy values. → { done, total, pct }
export function checklistProgress(items, doneMap) {
  const list = items || [];
  const total = list.length;
  let done = 0;
  for (let i = 0; i < total; i++) if (isItemDone(list[i], i, doneMap)) done += 1;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

export function isItemDone(item, index, doneMap) {
  if (!doneMap) return false;
  if (Array.isArray(doneMap)) return doneMap.includes(index);
  if (doneMap instanceof Set) return doneMap.has(index);
  if (typeof doneMap === 'object') {
    if (Array.isArray(doneMap.items)) return doneMap.items.includes(index);
    if (doneMap[index] != null) return !!doneMap[index];
    const key = item && (item.en || item.key || item.id);
    return key != null && !!doneMap[key];
  }
  return false;
}

// Toggle one item, immutably, on an array-of-indexes doneMap (the store's shape).
export function toggleItem(doneIndexes, index) {
  const list = Array.isArray(doneIndexes) ? doneIndexes : [];
  return list.includes(index) ? list.filter(i => i !== index) : list.concat([index]).sort((a, b) => a - b);
}
