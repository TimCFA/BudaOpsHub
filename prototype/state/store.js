// App state: a tiny observable store with fake save latency and per-device localStorage.
// No DOM at import time (node can import it); localStorage is touched only inside try/catch.
// Every action is documented in state/STORE.md.
//
//   import store from '../state/store.js';
//   store.getState(); store.subscribe(fn); store.assign('lunch', 'drinks-1', 'p-rafael');

import * as scenarioMod from '../data/scenario.js';
import { slotById, slotFromName } from '../rules/positions.js';
import { daypartAt, DAYPARTS } from '../rules/dayparts.js';
import { personById } from '../data/people.js';

export const STORAGE_KEY = 'budaFreshLook.v1';
export const SAVE_MS = 600;
export const UNDO_MS = 5000;

const SCENARIO = scenarioMod.SCENARIO || scenarioMod.default || scenarioMod || {};
const SIDES = ['foh', 'boh'];
const DEFAULT_PRESETS = [652, 760, 838, 844, 1030]; // 10:52 · 12:40 · 1:58 · 2:04 · 5:10

// ---------- seeding ----------

function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }

// scenario assignment keys are raw slot names; the store keys by slot id.
function slotIdFor(side, daypartKey, key) {
  const s = slotById(side, daypartKey, key);
  if (s) return s.id;
  try { return slotFromName(key, side).id; } catch (e) { return String(key); }
}

function seedAssignments(raw) {
  const out = { foh: {}, boh: {} };
  const src = raw || {};
  // { foh: { lunch: {...} } } or flat { lunch: {...} } (treated as FOH)
  const bySide = (src.foh || src.boh) ? src : { foh: src };
  for (const side of SIDES) {
    const dps = DAYPARTS[side] || [];
    for (const dp of dps) out[side][dp.key] = {};
    for (const [dpKey, slots] of Object.entries(bySide[side] || {})) {
      if (!out[side][dpKey]) out[side][dpKey] = {};
      for (const [key, a] of Object.entries(slots || {})) {
        if (!a) continue;
        const assign = typeof a === 'string' ? { personId: a } : { ...a };
        if (!assign.personId) continue;
        delete assign.pending;
        out[side][dpKey][slotIdFor(side, dpKey, key)] = assign;
      }
    }
  }
  return out;
}

function seedLead(raw) {
  const out = { foh: {}, boh: {} };
  const src = raw || {};
  for (const side of SIDES) {
    for (const [dpKey, v] of Object.entries(src[side] || {})) {
      if (v == null) { out[side][dpKey] = null; continue; }
      out[side][dpKey] = typeof v === 'string' ? { personId: v, homeSlotId: null } : { personId: v.personId || null, homeSlotId: v.homeSlotId || null };
    }
  }
  return out;
}

function seedBreaks(raw) {
  const src = raw || {};
  if (src.foh || src.boh) return { foh: clone(src.foh) || {}, boh: clone(src.boh) || {} };
  return { foh: clone(src) || {}, boh: {} };
}

function seedWaste(scn) {
  const w = scn.waste || {};
  const entries = Array.isArray(w.entries) ? w.entries : (Array.isArray(scn.wasteEntries) ? scn.wasteEntries : []);
  return {
    limitPerDay: w.limitPerDay != null ? w.limitPerDay : 20,
    streakDays: w.streakDays != null ? w.streakDays : 0,
    entries: clone(entries).map((e, i) => ({ id: e.id || `w${i + 1}`, ...e })),
  };
}

function seedTasks(scn) {
  const src = scn.tasks || scn.tasksState || {};
  return { done: clone(src.done || src) || {} };
}

function seedDayTypes(scn) {
  const src = scn.dayTypes || scn.dayTypeOverride || {};
  return src && typeof src === 'object' ? clone(src) : {};
}

export function seedState(scn = SCENARIO) {
  const device = scn.device || {};
  return {
    date: scn.date || scn.today || '2026-10-03',
    now: scn.defaultNow != null ? scn.defaultNow : 652,
    presets: Array.isArray(scn.clockPresets) && scn.clockPresets.length ? scn.clockPresets.slice() : DEFAULT_PRESETS,
    side: device.side || 'foh',
    me: device.personId || 'p-dorian',
    lang: device.lang || 'en',
    syncState: 'saved',
    online: true,
    toast: null,
    assignments: seedAssignments(scn.assignments),
    leadCaptain: seedLead(scn.leadCaptain || scn.leadCaptains),
    dayTypes: seedDayTypes(scn),
    breakOverrides: seedBreaks((scn.breaks && scn.breaks.overrides) || scn.breaksOverrides),
    waste: seedWaste(scn),
    tasks: seedTasks(scn),
    lastWasteId: null,
    fillPreview: null,
  };
}

// Which keys survive a reload (per device). Not: syncState, online, toast, lastWasteId, fillPreview.
const PERSISTED = ['date', 'now', 'side', 'me', 'lang', 'assignments', 'leadCaptain', 'dayTypes', 'breakOverrides', 'waste', 'tasks'];

function readStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) { return null; }
}

function writeStorage(state) {
  try {
    if (typeof localStorage === 'undefined') return;
    const out = {};
    for (const k of PERSISTED) out[k] = state[k];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  } catch (e) { /* private mode, quota, blocked: the app still works in memory */ }
}

function clearStorage() {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
}

// Merge a saved device state over a fresh seed; a saved state from a different sample day is dropped.
function hydrate(seed, saved) {
  if (!saved || saved.date !== seed.date) return seed;
  const s = { ...seed };
  for (const k of PERSISTED) if (saved[k] !== undefined) s[k] = saved[k];
  for (const side of SIDES) {
    if (!s.assignments[side]) s.assignments[side] = {};
    if (!s.leadCaptain[side]) s.leadCaptain[side] = {};
    if (!s.breakOverrides[side]) s.breakOverrides[side] = {};
  }
  if (!s.waste || !Array.isArray(s.waste.entries)) s.waste = seed.waste;
  if (!s.tasks || !s.tasks.done) s.tasks = seed.tasks;
  // pending rows never survive a reload: whatever was there is treated as saved
  for (const side of SIDES) for (const dp of Object.values(s.assignments[side])) for (const a of Object.values(dp || {})) if (a) delete a.pending;
  return s;
}

// ---------- the store ----------

export function createStore(seed) {
  let state = hydrate(seed || seedState(), readStorage());
  const subs = new Set();
  let saveToken = 0;
  let toastTimer = null;
  let idCounter = 0;

  function getState() { return state; }

  function subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  }

  function emit() { for (const fn of Array.from(subs)) fn(state); }

  // set(patch | fn): shallow-merge a patch (or the result of fn(state)), persist, notify.
  function set(patch) {
    const next = typeof patch === 'function' ? patch(state) : patch;
    if (!next) return state;
    state = { ...state, ...next };
    writeStorage(state);
    emit();
    return state;
  }

  // ----- helpers -----

  // currentDaypart(side?, lookAheadMin = 10): the daypart on the clock; when the next one starts
  // within lookAheadMin it is that one (the "10:50 moment": Lunch is already on the board at 10:52).
  function currentDaypart(side = state.side, lookAheadMin = 10) {
    const dp = daypartAt(side, state.now);
    const list = DAYPARTS[side] || DAYPARTS.foh;
    const i = list.findIndex(d => d.key === dp.key);
    const next = i >= 0 ? list[i + 1] : null;
    if (next && next.start - state.now <= lookAheadMin && next.start > state.now) return next;
    return dp;
  }

  function dpAssignments(side, daypartKey) {
    return (state.assignments[side] && state.assignments[side][daypartKey]) || {};
  }

  function withAssignments(side, daypartKey, fn) {
    const cur = dpAssignments(side, daypartKey);
    const nextDp = fn({ ...cur });
    return {
      assignments: {
        ...state.assignments,
        [side]: { ...(state.assignments[side] || {}), [daypartKey]: nextDp },
      },
    };
  }

  function removePerson(dp, personId, exceptSlotId) {
    for (const [sid, a] of Object.entries(dp)) {
      if (sid !== exceptSlotId && a && a.personId === personId) delete dp[sid];
    }
    return dp;
  }

  function newId(prefix) {
    idCounter += 1;
    return `${prefix}-${state.now}-${idCounter}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // ----- save (fake latency) -----

  // save(): syncState 'saving' → after 600 ms 'saved', and every pending flag is cleared.
  // Returns a promise that resolves when saved. While offline it stays 'offline' and pending.
  function save() {
    if (!state.online) { set({ syncState: 'offline' }); return Promise.resolve(false); }
    const token = ++saveToken;
    set({ syncState: 'saving' });
    return new Promise((resolve) => {
      setTimeout(() => {
        if (token !== saveToken) { resolve(false); return; }
        const assignments = clone(state.assignments);
        for (const side of SIDES) for (const dp of Object.values(assignments[side] || {})) for (const a of Object.values(dp || {})) if (a) delete a.pending;
        set({ assignments, syncState: state.online ? 'saved' : 'offline' });
        resolve(true);
      }, SAVE_MS);
    });
  }

  // ----- device -----

  function setNow(min) {
    const n = Number(min);
    if (!Number.isFinite(n)) return;
    set({ now: Math.max(0, Math.min(1439, Math.round(n))) });
  }

  function setSide(side) {
    if (!SIDES.includes(side)) return;
    set({ side });
  }

  // setMe(personId): who is using this phone. The device follows that person's language once
  // (SPEC: Mi puesto is ES by default when the person's lang is es); the EN/ES segment then rules.
  // A manager keeps the device's language.
  function setMe(personId) {
    if (!personId) return;
    const person = personById(personId);
    const lang = person && person.role !== 'manager' && (person.lang === 'en' || person.lang === 'es') ? person.lang : state.lang;
    set({ me: personId, lang });
  }

  function setLang(lang) {
    if (lang !== 'en' && lang !== 'es') return;
    set({ lang });
  }

  function setOnline(online) {
    const on = !!online;
    set({ online: on, syncState: on ? (state.syncState === 'offline' ? 'saved' : state.syncState) : 'offline' });
  }

  // ----- set ups -----

  // assign(daypartKey, slotId, personId, { side } = {}): place a person; if they were on another
  // slot in the same daypart they move; the slot's hand-off is dropped; the row is pending until saved.
  function assign(daypartKey, slotId, personId, opts = {}) {
    const side = opts.side || state.side;
    if (!daypartKey || !slotId || !personId) return;
    set(withAssignments(side, daypartKey, (dp) => {
      removePerson(dp, personId, slotId);
      dp[slotId] = { personId, pending: true };
      return dp;
    }));
    return save();
  }

  // clear(daypartKey, slotId, { side } = {}): empty the slot.
  function clear(daypartKey, slotId, opts = {}) {
    const side = opts.side || state.side;
    if (!daypartKey || !slotId) return;
    set(withAssignments(side, daypartKey, (dp) => { delete dp[slotId]; return dp; }));
    return save();
  }

  // setHandoff(daypartKey, slotId, toPersonId, at, { side } = {}): "→ Sofia 11:30". toPersonId null removes it.
  function setHandoff(daypartKey, slotId, toPersonId, at, opts = {}) {
    const side = opts.side || state.side;
    const cur = dpAssignments(side, daypartKey)[slotId];
    if (!cur) return;
    set(withAssignments(side, daypartKey, (dp) => {
      const a = { ...dp[slotId], pending: true };
      if (toPersonId) { a.handoffTo = toPersonId; a.handoffAt = at != null ? at : state.now; } else { delete a.handoffTo; delete a.handoffAt; }
      dp[slotId] = a;
      return dp;
    }));
    return save();
  }

  // applyProposals(list, daypartKey?, { side } = {}): confirm Fill. list = [{ slotId, personId, daypartKey? }].
  // Never touches a slot that already has someone, saved or still pending (hand placements are never moved).
  function applyProposals(list, daypartKey, opts = {}) {
    const side = opts.side || state.side;
    const dpKey = daypartKey || currentDaypart(side).key;
    if (!Array.isArray(list) || !list.length) return Promise.resolve(false);
    let next = state.assignments;
    for (const p of list) {
      if (!p || !p.slotId || !p.personId) continue;
      const key = p.daypartKey || dpKey;
      const dp = { ...((next[side] && next[side][key]) || {}) };
      if (dp[p.slotId] && dp[p.slotId].personId) continue; // anyone already there stays, saved or still pending
      removePerson(dp, p.personId, p.slotId);
      dp[p.slotId] = { personId: p.personId, pending: true };
      next = { ...next, [side]: { ...(next[side] || {}), [key]: dp } };
    }
    set({ assignments: next, fillPreview: null });
    return save();
  }

  // setLead(daypartKey, personId, homeSlotId, { side } = {}): Lead Captain + working spot in one tap.
  function setLead(daypartKey, personId, homeSlotId, opts = {}) {
    const side = opts.side || state.side;
    if (!daypartKey || !personId) return;
    const patch = {
      leadCaptain: {
        ...state.leadCaptain,
        [side]: { ...(state.leadCaptain[side] || {}), [daypartKey]: { personId, homeSlotId: homeSlotId || null } },
      },
    };
    if (homeSlotId) {
      Object.assign(patch, withAssignments(side, daypartKey, (dp) => {
        removePerson(dp, personId, homeSlotId);
        dp[homeSlotId] = { personId, pending: true };
        return dp;
      }));
    }
    set(patch);
    return save();
  }

  // setDayType(daypartKey, 'game' | 'practice' | null): leader override per daypart (null = calendar rule).
  function setDayType(daypartKey, type) {
    if (!daypartKey) return;
    const dayTypes = { ...state.dayTypes };
    if (type === 'game' || type === 'practice') dayTypes[daypartKey] = type; else delete dayTypes[daypartKey];
    set({ dayTypes });
    return save();
  }

  // moveBreak(personId, start, { side } = {}): a hand-moved break sticks (rules/breaks.js overrides). null removes it.
  function moveBreak(personId, start, opts = {}) {
    const side = opts.side || state.side;
    if (!personId) return;
    const mine = { ...(state.breakOverrides[side] || {}) };
    if (start == null) delete mine[personId]; else mine[personId] = Number(start);
    set({ breakOverrides: { ...state.breakOverrides, [side]: mine } });
    return save();
  }

  // setFillPreview(preview | null): the Fill proposals being previewed (not persisted).
  function setFillPreview(preview) {
    set({ fillPreview: preview || null });
  }

  // ----- waste -----

  // logWaste({ productId, size, qty, who?, at?, date? }) → the stored entry (id filled in).
  function logWaste(entry) {
    if (!entry || !entry.productId) return null;
    const e = {
      id: entry.id || newId('w'),
      productId: entry.productId,
      size: entry.size != null ? entry.size : null,
      qty: entry.qty != null ? entry.qty : 1,
      who: entry.who || state.me,
      date: entry.date || state.date,
      at: entry.at != null ? entry.at : state.now,
      loggedAtMs: Date.now(),
    };
    set({ waste: { ...state.waste, entries: [...state.waste.entries, e] }, lastWasteId: e.id });
    save();
    return e;
  }

  // undoWaste(id?): remove that entry, or the last one logged from this device. Returns the removed entry or null.
  function undoWaste(id) {
    const target = id || state.lastWasteId;
    if (!target) return null;
    const removed = state.waste.entries.find(e => e.id === target) || null;
    if (!removed) return null;
    set({ waste: { ...state.waste, entries: state.waste.entries.filter(e => e.id !== target) }, lastWasteId: target === state.lastWasteId ? null : state.lastWasteId });
    save();
    return removed;
  }

  // ----- tasks -----

  function taskState(taskKey) {
    const cur = state.tasks.done[taskKey];
    return cur ? { items: Array.isArray(cur.items) ? cur.items.slice() : [], by: cur.by || null, at: cur.at != null ? cur.at : null, complete: !!cur.complete } : { items: [], by: null, at: null, complete: false };
  }

  // toggleChecklist(taskKey, itemIndex): whole-row toggle; stamps who and when.
  function toggleChecklist(taskKey, itemIndex) {
    if (!taskKey || itemIndex == null) return;
    const ts = taskState(taskKey);
    const i = Number(itemIndex);
    ts.items = ts.items.includes(i) ? ts.items.filter(x => x !== i) : [...ts.items, i].sort((a, b) => a - b);
    ts.by = state.me; ts.at = state.now; ts.complete = false;
    set({ tasks: { ...state.tasks, done: { ...state.tasks.done, [taskKey]: ts } } });
    return save();
  }

  // markTaskDone(taskKey, itemCount?): the whole task done (all items when itemCount is given).
  function markTaskDone(taskKey, itemCount) {
    if (!taskKey) return;
    const ts = taskState(taskKey);
    if (itemCount != null) ts.items = Array.from({ length: Number(itemCount) }, (_, i) => i);
    ts.by = state.me; ts.at = state.now; ts.complete = true;
    set({ tasks: { ...state.tasks, done: { ...state.tasks.done, [taskKey]: ts } } });
    return save();
  }

  // resetTask(taskKey): forget the progress on one task.
  function resetTask(taskKey) {
    if (!taskKey) return;
    const done = { ...state.tasks.done };
    delete done[taskKey];
    set({ tasks: { ...state.tasks, done } });
    return save();
  }

  // ----- toast -----

  // showToast(text, { undo?: fn, ttl? = 5000 }): one snackbar docked above the nav. The shell renders it.
  function showToast(text, opts = {}) {
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    const id = newId('t');
    set({ toast: { id, text, undo: typeof opts.undo === 'function' ? opts.undo : null, ttl: opts.ttl != null ? opts.ttl : UNDO_MS } });
    const ttl = opts.ttl != null ? opts.ttl : UNDO_MS;
    if (ttl > 0) toastTimer = setTimeout(() => { if (state.toast && state.toast.id === id) set({ toast: null }); }, ttl);
    return id;
  }

  function hideToast() {
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    if (state.toast) set({ toast: null });
  }

  // ----- reset -----

  // reset(): forget this device's state and reseed from the scenario.
  function reset() {
    clearStorage();
    saveToken += 1;
    hideToast();
    state = seedState();
    writeStorage(state);
    emit();
  }

  const actions = {
    save, setNow, setSide, setMe, setLang, setOnline,
    assign, clear, setHandoff, applyProposals, setLead, setDayType, moveBreak, setFillPreview,
    logWaste, undoWaste, toggleChecklist, markTaskDone, resetTask,
    showToast, hideToast, reset,
  };

  // dispatch('assign', 'lunch', 'drinks-1', 'p-rafael') — the same actions by name.
  function dispatch(name, ...args) {
    if (typeof actions[name] !== 'function') throw new Error(`store: unknown action ${name}`);
    return actions[name](...args);
  }

  return { getState, subscribe, set, dispatch, currentDaypart, dpAssignments, taskState, ...actions };
}

export const store = createStore();
export default store;
