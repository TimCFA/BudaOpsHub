# state/store.js — the app store

One observable store for the whole prototype. Sample data only, seeded from
`data/scenario.js`, remembered per device in `localStorage` under
`budaFreshLook.v1` (every read/write is in try/catch: private mode or blocked
storage just means the state lives in memory). Node can import it: nothing
touches the DOM at import time.

```js
import store from '../../state/store.js';           // the singleton
import { createStore, seedState } from '../../state/store.js';   // for tests
```

Screens receive `{ store, state, t, route, go }` from `app.js`. `state` is the
current snapshot (re-rendered on every change); call actions on `store`.

## Shape of `state`

| key | type | meaning |
|---|---|---|
| `date` | `'2026-10-03'` | the sample day (Saturday → Game Day) |
| `now` | minutes since midnight | the demo clock, default 652 (10:52). **Every "now" reads this, never `Date.now()`.** |
| `presets` | `[652, 760, 838, 844, 1030]` | Demo clock presets (10:52 · 12:40 · 1:58 · 2:04 · 5:10) |
| `side` | `'foh' \| 'boh'` | the FOH/BOH toggle, per device |
| `me` | personId | "Who's using this phone", default `p-dorian` (manager) |
| `lang` | `'en' \| 'es'` | per device |
| `syncState` | `'saved' \| 'saving' \| 'offline'` | the header dot |
| `online` | boolean | mirrors `navigator.onLine` (app.js) |
| `toast` | `{ id, text, undo: fn\|null, ttl } \| null` | the snackbar the shell renders above the nav |
| `assignments` | `{ foh: { [daypartKey]: { [slotId]: Assign } }, boh: {…} }` | `Assign = { personId, pending?, handoffTo?, handoffAt? }` (rules/API.md). Slot ids come from `rules/positions.js` (`slotById(side, daypartKey, id)`); the scenario's raw slot names are converted at seed time. |
| `leadCaptain` | `{ foh: { [daypartKey]: { personId, homeSlotId } \| null }, boh: {…} }` | `null` / missing = let `rules/leaders.js` pick by rotation |
| `dayTypes` | `{ [daypartKey]: 'game' \| 'practice' }` | leader overrides; missing = calendar rule (`rules/gameday.js`) |
| `breakOverrides` | `{ foh: { [personId]: start }, boh: {…} }` | hand-moved breaks (`rules/breaks.js` `overrides`) |
| `waste` | `{ limitPerDay, streakDays, entries: [{ id, productId, size, qty, who, date, at }] }` | today's entries; `at` in minutes |
| `tasks` | `{ done: { [taskKey]: { items: [index…], by, at, complete } } }` | checklist progress per task |
| `lastWasteId` | id \| null | what `undoWaste()` removes by default (not persisted) |
| `fillPreview` | any \| null | a Fill preview the Set Ups screen is showing (not persisted) |

Persisted keys: `date now side me lang assignments leadCaptain dayTypes breakOverrides waste tasks`.
A saved state from another `date` is dropped. Pending flags never survive a reload.

## Core API

| call | what it does |
|---|---|
| `store.getState()` | current snapshot |
| `store.subscribe(fn)` | `fn(state)` after every change; returns an unsubscribe function |
| `store.set(patch \| fn)` | shallow-merge a patch (or `fn(state)` → patch), persist, notify. Prefer the actions below. |
| `store.dispatch(name, …args)` | the same actions by name (`store.dispatch('assign', 'lunch', 'drinks-1', 'p-rafael')`) |
| `store.currentDaypart(side = state.side, lookAheadMin = 10)` | the daypart on the clock; when the next one starts within 10 min it is that one (Lunch at 10:52 — the "10:50 moment"). Pass `0` for the strict one. |
| `store.dpAssignments(side, daypartKey)` | `{ [slotId]: Assign }` for that daypart (`{}` when empty) |
| `store.taskState(taskKey)` | `{ items, by, at, complete }` (defaults when untouched) |

## Saving (fake latency)

`store.save()` sets `syncState` to `'saving'`, and 600 ms later to `'saved'`
and **clears every `pending` flag on every assignment**. It returns a promise
that resolves `true` when saved. Every mutating action below calls `save()`
itself, so a screen normally never calls it. Rows with `pending: true` render
grey-italic (`Row state="pending"`) until then. While offline (`online: false`)
the dot says Offline and `pending` stays.

## Actions

All actions persist and notify. Optional `{ side }` defaults to `state.side`.

### Device
- `setNow(min)` — move the demo clock (0–1439).
- `setSide('foh' | 'boh')`
- `setMe(personId)` — who is using this phone. The nav's first tab follows the role (leader → Set Ups, team member → Mi puesto). The device adopts that person's `lang` once (a manager keeps the device's language); the EN/ES segment then rules.
- `setLang('en' | 'es')`
- `setOnline(bool)` — app.js wires it to `online`/`offline` events; screens may fake Offline from More.
- `reset()` — forget this device's state and reseed from the scenario.

### Set Ups
- `assign(daypartKey, slotId, personId, { side })` — place a person. If they were already on another slot of that daypart they **move** there (pick sheet "Already placed · tap to move"). The slot's previous hand-off is dropped. The row is `pending` until saved. Returns the save promise.
- `clear(daypartKey, slotId, { side })` — empty the slot.
- `setHandoff(daypartKey, slotId, toPersonId, at, { side })` — "→ Sofia 11:30" on the slot. `toPersonId = null` removes the hand-off. `at` defaults to `state.now`.
- `applyProposals(list, daypartKey?, { side })` — confirm a Fill preview. `list = [{ slotId, personId, daypartKey? }]`; `daypartKey` defaults to `currentDaypart()`. **Never touches a slot that already has someone**, saved or still pending (hand placements are never moved). Clears `fillPreview`. One save for the batch.
- `setFillPreview(preview | null)` — keep a Fill preview around while the screen shows it (not persisted).
- `setLead(daypartKey, personId, homeSlotId, { side })` — Lead Captain and their working spot in one tap: records the lead and, when `homeSlotId` is given, assigns them there (moving them out of any other slot of that daypart).
- `setDayType(daypartKey, 'game' | 'practice' | null)` — leader override for that daypart; `null` returns to the calendar rule.
- `moveBreak(personId, start, { side })` — a hand-moved break sticks; `start = null` removes the override. Feed `state.breakOverrides[side]` to `rules/breaks.js planBreaks({ overrides })`.

### Waste
- `logWaste({ productId, size, qty, who?, at?, date? })` → the stored entry. `who` defaults to `state.me`, `at` to `state.now`, `date` to `state.date`, `qty` to 1. Sets `lastWasteId`. Typical: `const e = store.logWaste({ productId: 'nuggets', size: '12', qty: 1 }); store.showToast(t('loggedBy', { item: 'Nuggets 12 ct', who: 'Brielle' }), { undo: () => store.undoWaste(e.id) });`
- `undoWaste(id?)` → the removed entry or `null`. Defaults to `lastWasteId`. The 5 s window is the toast's `ttl`.

### Tasks
- `toggleChecklist(taskKey, itemIndex)` — whole-row toggle; stamps `by = me`, `at = now`, clears `complete`.
- `markTaskDone(taskKey, itemCount?)` — the task is complete; with `itemCount` every item is ticked.
- `resetTask(taskKey)` — forget the progress on one task.

### Toast
- `showToast(text, { undo?: fn, ttl? = 5000 })` → toast id. One snackbar at a time, docked above the nav by the shell; the Undo button shows when `undo` is given, calls it, then closes. `ttl: 0` keeps it until closed.
- `hideToast()`

## Routing helpers (app.js)

- `route = { path: 'setups', query: { sheet: 'pick', slot: 'drinks-1' }, hash }` is passed to the screen.
- `go('setups', { sheet: 'pick', slot: 'drinks-1' })` or `go('#/waste')` changes the hash. Sheets are opened by the query string so the back button closes them.
- Unknown routes land on Set Ups for leaders and Mi puesto for team members.

## Components (ui/components/)

Each file's header comment shows its props. Summary:

- `Header` (`Header, TitleRow, SyncDot`) — date chip · sync dot · identity chip, then children. Screens render it at the top; `dateLabel`/`onDate` for the Set Ups "Sat, Oct 3 · Game Day ▾" button.
- `Nav` (`Nav, navItems, isLeader`) — rendered by the shell.
- `Sheet` (`Sheet, SheetSection`) — bottom sheet; `open`, `title`, `suffix`, `sub`, `onClose`, `closeLabel`, `footer`, children scroll inside.
- `Row` (`Row, PersonRow`) — the position row (`state: plain | needed | pending | folded`, `flag` + `onFlag`, `roleTag` or `score`, `name`, `note`, `href` or `onClick`) and the sheet person row.
- `Chip` (`Chip, Seg`) — chips (`tall`, `dark`/`on`, `line`, `amber`, `red`, `small`) and the FOH·BOH / EN·ES segment.
- `Toast` — rendered by the shell from `state.toast`.
- `ScoreChip` (`ScoreChip, tierOf`) — `{ score, tier, star, showEmpty }`.
- `Flag` — amber pill with the warn icon.
- `Card` (`Card, Strip, Label, SectionHead, Callout`).
- `Icons` (`Icon, ICONS`) — `<Icon name="waste" size=24 />`.

CSS classes match the canvas artboards: `.hdr .row .grow .chip .seg .btn .rows .prow .left .right .pos .rank .sub .flag .name .sc .tag .note .card .strip .label .person .tile .sizes .tape .step .box .next .progress .snack .nav .sheet`.
