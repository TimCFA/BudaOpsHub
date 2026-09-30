# Buda Ops Hub — fresh-look prototype

A clickable, phone-first prototype of the redesign, built with **sample data only**.
It never talks to the live server or database. It lives on its own branch and
deploys to a Netlify preview. Tim compares it with the current app side by side.

Design source of truth: the canvas at https://claude.ai/artifact/2REqXxFf2S2K915jsecvmZ
(seven artboards) and `docs/PRODUCT_BRIEF.md` section 4 (rules). Where the two
disagree, the brief and the decisions listed below win.

## Non-negotiables

- Sample data only. Fake names. No real employee, roster, PEA, financial or
  food-safety data. Every product cost is 0 and the UI must say so.
- Static site, no backend, no build step. Plain ES modules. Runs from
  `prototype/index.html` over any static host (Netlify publish dir = `prototype`).
- Phone first: 390 px wide with no horizontal scroll; every tap target at least
  44 px tall; no text under 12 px; secondary text colour `#6B665F` or darker.
- Never a blocking dialog on the floor screens. Warnings are flags on rows,
  confirmations are Undo pills, destructive actions are in-app sheets.
- Real `<button>` and `<a>` elements for anything tappable; `aria-label` on
  icon-only buttons.
- All UI strings go through `i18n.t()` with English and Spanish; position and
  zone names stay as the floor says them (Drinks, Host, iPOS) in both languages.

## Stack and layout

```
prototype/
  index.html            shell: loads styles, vendor and app.js as modules
  app.js                router (hash routes), shell (header, bottom nav), screen switch
  netlify.toml          (repo root) publish = prototype, no build command
  styles/tokens.css     colours, type scale, spacing, radii, z-layers
  styles/base.css       reset, body, phone frame on desktop (centred 390 px column)
  styles/components.css chip, button, sheet, row, nav, toast, card, strip
  vendor/preact.mjs, vendor/hooks.mjs, vendor/htm.mjs   (vendored, no CDN)
  lib/h.js              `import { html, render, useState, ... }` re-exports
  data/                 sample data modules (see schema)
  rules/                pure functions, no DOM, unit-tested with `node --test`
  state/store.js        app state, simulated save latency, localStorage per device
  state/i18n.js         strings and t()
  ui/components/        Header, Nav, Sheet, Row, Chip, Toast, ScoreChip, Flag
  ui/screens/           SetUps, MiPuesto, Waste, Tasks, Scores, More (+ sheets)
  tests/*.test.mjs      rules tests
  docs/SPEC.md          this file
  docs/ASSUMPTIONS.md   Tim's guesses this build rests on (shown under More)
```

Preact + htm, vendored under `vendor/`. `lib/h.js` exports
`html` (htm bound to Preact's `h`), `render`, and the hooks.

## Scenario and clock

The sample day is **Saturday 2026-10-03** (a Game Day: Saturday). The app has a
fake clock in `state/store.js` (`now`), default **10:52**, changeable from
More → "Demo clock" with presets 10:52 · 12:40 · 1:58 · 2:04 · 5:10. Every
"now" computation reads the store clock, never `Date.now()`.

Devices: the store remembers per browser (localStorage) the chosen person
("Who's using this phone"), the language and the FOH/BOH side. "Dorian" is a
manager and the default identity; the rest of the roster can be picked.

## Data schema (`data/`)

```js
// data/people.js
{ id: 'p-maria', first: 'Maria', last: 'Delgado', role: 'trainer'|'tl'|'tm'|'manager', side: 'foh'|'boh', lang: 'en'|'es' }

// data/roster.js  — per date, per side; times as 'H:MM' 24h strings
{ '2026-10-03': { foh: [ { personId: 'p-maria', start: '6:00', end: '14:00', leaderShift: false } ], boh: [...] } }

// data/pea.js — ratings; a position's score = mean of the latest 5 ratings there
{ personId, position: 'Drinks 1/3', score: 2.8, at: '2026-09-20T17:30', leaderId: 'p-luke' }
// position names use the brief's PEA groups: FOH iPOS, Bagging, Drinks 1/3, Drinks 2, OMD, Host, Runner;
// BOH Breader, Primary, Secondary, Machines, Fries, Prep. rules/positions.js maps a slot name to its PEA position.

// data/positions.js — dayparts and priority lists per side (see Rules)
// data/history.js — previous set ups (last 14 days) for rotation and Lead Captain rotation:
{ date, side, daypart, assignments: { 'iPOS 1 (Captain)': 'p-maria', ... }, leadCaptain: 'p-sam' }
// data/products.js — { id, side, name, es, sizes: [{ label: '8', qty: 8 }] | null, cost: 0 }
// data/tasks.js — recurring FOH tasks { at: 840, name, es, mins: '20–30 min', owner: 'Host 1' }
// data/checklists.js — zone checklists { zone, items: [{ en, es }] }, windows tied to the FOH dayparts
// data/scenario.js — today's date, default clock, prefilled Breakfast and Lunch assignments, prior waste entries
```

### The sample roster (FOH, Saturday) — must match the canvas story

| Person | Role | Shift | Lunch spot at 10:52 |
|---|---|---|---|
| Maria | Trainer | 6:00–2:00 | iPOS 1 (Captain), on break 10:45–11:15, Harper covers |
| Luke | TL | 10:00–8:00 | FC Bagger (Bagging captain) |
| Brielle | Trainer | 6:00–11:30 | Host 1 (Captain) → Sofia 11:30 (flag: Sofia isn’t a leader) |
| Sofia | TM | 11:30–8:00 | takes Host 1 at 11:30 |
| Tobias | TM | 6:00–3:00 | iPOS 2 (flag: outside all Breakfast) |
| Emilio | TM | 11:00–1:00 | Drinks 2 (On the Rise 2.1), leaves 1:00 |
| Sam | TL | 10:00–8:00 | Lead Captain, works Runner |
| Noor | Trainer | 6:00–1:00 | Drinks 3 → Kendra at 1:00 |
| Kendra | TM | 12:30–8:00 | arrives 12:30, takes Drinks 3 at 1:00 |
| Sienna | TM | 11:00–5:00 | OMD 2 (On the Rise 2.3, ★ getting a PEA, PEA due 31 days) |
| Rafael | TM | 11:00–5:30 | not placed (Crushing It on Drinks 2.9); Fill → Drinks 1 |
| Harper | TM | 11:00–8:00 | not placed; Fill → DT Bagger 2 |
| Diego | TM | 11:00–1:00 | not placed; Fill → OMD 1; inside all Breakfast |
| Yesenia | TM | 11:00–4:00 | not placed; Not Yet on Drinks 1.5; never rated on Host; Fill → Host 2 with a flag |

Breakfast (8–11) was fully set up (prefill it so carry-forward and the outside
rule have history): Maria iPOS 1 (Captain), Tobias iPOS 2, Brielle Host 1, Noor Drinks 1,
plus others as needed. Breaks: Maria 10:45; Sam 1:05 (Luke covers); Sienna 1:20
(Rafael covers); Rafael 2:30 (Harper covers). At 1:00: Noor leaves (Drinks 3 →
Kendra), Emilio leaves (Drinks 2 closes), Diego leaves.

BOH sample (Mid 10:30–2:00): 8 people, one TL (Primary captain), one Trainer
(Raw), the rest team members; enough to show the BOH toggle working.

Waste sample: 9 entries before 10:41 (Brielle, Luke, Tobias); Tasks sample: the
2:00 Restrooms reset 3 of 8 done at 2:04 by Rafael.

## Rules (`rules/`) — pure functions, tested

Dayparts (FOH): Early Breakfast 6–8 · Breakfast 8–11 · **Lunch 11–2 (Transition
merged in)** · Afternoon 2–5 · Dinner 5–8 · Close 8–10. BOH: Early Breakfast 6–8 ·
Breakfast 8–10:30 · Mid 10:30–2 · Afternoon 2–5 · Dinner 5–8 · Close 8–10.

Priority lists: take the current app's per-daypart lists
(`static/js/zone-reset.js` `fohPositions` / `bohPositions`) minus Transition,
fixing typos (Dining Room, Secondary, Primary) and dropping the
"Shift Lead: …" slot. Display names drop lane suffixes to keep rows short
("iPOS 2 LANE 1" → "iPOS 2", "DT Bagger 1 (Cockpit Cap)" → "DT Bagger 1" with
sub "Captain"). "(Captain)" in a slot name marks a captain slot.

- **Headcount and Needed.** People on shift = roster entries overlapping the
  window (a start or end within 10 min of the edge counts as the whole
  daypart). A leaver paired with an arrival from 60 min before to 30 min
  after their leaving time counts as one spot ("Noor → Kendra 1:00"). With N
  effective people, slots 1..N are expected: empty ones are **Needed**, the
  rest fold behind "+ M more spots if you have extra people".
- **Names**: first name; last initial only when first names collide.
- **Roles**: TL from `role: 'tl'` or a `leaderShift`; Trainer from `role`.
  Leaders (TL, Trainer) are never tiered and never get a score chip.
- **Zones** (regex as the current code): FOH iPOS, Bagging, Drinks, OMD, Host;
  BOH Primary, Secondary, Raw; everything else Extra hands. Leader spread
  order FOH iPOS → Bagging → Host → Drinks → OMD; BOH Primary → Raw → Secondary.
  iPOS, Bagging, Host must have a leader; the Bagging captain reaches Drinks
  and OMD. Flags: a required zone with no leader; a non-leader in a Captain
  slot; a captain who leaves mid-daypart handing to a non-leader.
- **Lead Captain**: a TL, chosen by longest since last led (history), never a
  zone captain, works Runner if N reaches Runner's rank, else Drinks 3 or FC
  Bagger (the zone that needs a leader more); DT Bagger 2 in the Afternoon.
- **Outside rule (Tim, Sep 29)**: iPOS and OMD are outside. A daypart outside
  is followed by a daypart inside. Flag a person placed outside whose previous
  daypart today was also outside **unless this daypart is their last of the
  shift**. A break never resets it. (The old 3.5 h clock is gone.)
- **Tiers**: score = mean of the latest 5 ratings on that PEA position;
  Crushing It ≥ 2.75 (green), On the Rise ≥ 1.75 (amber), Not Yet < 1.75
  (grey chip, text "Not Yet" — no red on the board); never rated = no chip.
  Score chips show one decimal. All green = Crushing It on every position of
  the person's side; never rated is not green.
- **Game Day**: Friday or Saturday, or 2+ of {special event, sales ≥ 115 % of
  usual, goal ≥ 110 %}; leader override stored per daypart. Development picks:
  Practice Day → positions they are not green in yet; Game Day → only On the
  Rise. Budget: Practice ≈ 1 pick per 4 on shift; Game Day 1 pick, only with
  8+ on shift and a Trainer present. Pair with a Trainer who is not
  captaining, else a Crushing It team member, else a TL. The pick gets ★.
- **Keep an eye on**: the top 3 people on shift by: PEA overdue (≥ 30 days),
  within 2 positions of all green, stalled (no PEA on a position in 14 days
  or 4 of the last 5 shifts in the same position); one reason each.
- **Fill**: fill Needed slots in priority order with unplaced people. Captain
  slots leader-first (whole-daypart TLs, whole-daypart Trainers, part-daypart
  leaders); spread leaders across zones in priority order before doubling;
  never move a hand placement; obey the outside rule; avoid the zone someone
  worked yesterday (soft); on a Game Day never place a Not Yet or never-rated
  person on a slot without a flag. Returns proposals with a reason each and
  the slots that stay open ("nobody free").
- **Breaks**: 6 h+ shifts get 30 min; not in the first or last 2 h; never
  10:00–10:30 or 12:00–1:00; near the middle, earlier beats later; at most 2
  off at once per side, starts staggered 10–15 min; never two TLs together;
  cover = an unplaced person on shift, else the Lead Captain. Output: off
  now (with back time and cover), next two, and per-person planned time.
  A leader can move a break by hand and it sticks (store).
- **Tasks**: the recurring FOH tasks with Tim's times and durations, each
  owned by a position (Restrooms → Host 1; Restock → Host 2; Trash → Runner;
  Lemonades → Drinks 1; Restroom check → Host 1). Due now = at ≤ now < at +
  duration + 30. The zone checklists come from the current app's lists.
- **Waste**: entry = product, qty, who, at. Undo within 5 s. Today = count of
  entries; the $ view shows "needs item costs" while every cost is 0.
  Tape = last 15 minutes.

## Screens (`ui/screens/`) — match the canvas artboards

1. **Set Ups** (`#/setups`): header (date chip with Game Day, Saved dot,
   identity chip; title Lunch + window + FOH/BOH; "8 of 13 placed · 2 flags ·
   carried from Breakfast"; daypart chips Breakfast ✓ / Lunch / Afternoon /
   All ▾; Fill button when open spots exist). Content: Lead Captain + Breaks
   card; Keep an eye on strip; At 1:00 strip (only when people leave
   mid-daypart); priority rows. Row: rank, position, sub, flag pill;
   right: role tag or score chip + first name, note. Tap a Needed row → pick
   sheet; tap a filled row → person sheet (Change / Hand off / Clear / profile);
   tap a flag → pick sheet pre-filtered. Team members (non-leaders) see the
   same board read-only.
2. **Pick sheet**: title "<slot> · Needed", sub with priority, Game Day, and
   any flag; sections Not placed yet · Arriving later · Already placed (tap
   to move); each row score chip or role tag + name + reason line. One tap
   places and closes; the row shows pending (grey italic) until "saved".
3. **Fill preview**: proposals as pending rows with reasons and "tap to swap";
   flags kept; header "8 placed + 4 proposed · 3 flags · 1 stays open";
   sticky Confirm N / Cancel.
4. **Person sheet / profile**: name, role, shift, today's spots, scores per
   position (chips), last PEA, all-green progress; actions for leaders.
5. **Lead Captain sheet**: candidates ordered by rotation, one tap sets the
   lead and their working spot.
6. **Develop sheet** (from Keep an eye on): picks with reasons and pairing;
   Practice/Game explained in one line.
7. **Mi puesto** (`#/me`, team member seat, ES default when the person's
   lang is es): Ahora / Después / Tarea / Hoy cards, EN/ES switch.
8. **Waste** (`#/waste`): FOH/BOH, Today count + "$ view needs item costs",
   tiles with 44 px size buttons, snackbar with Undo docked above the nav,
   last 15 min tape.
9. **Tasks** (`#/tasks`): Now / Zone reset / Food safety / Transition chips;
   DUE NOW card with bilingual checklist rows (whole row toggles), progress
   for this task, Next list. Zone reset tab: one window at a time.
10. **Scores** (`#/scores`): read-only: waste today vs limit in counts,
    under-limit streak, All-Green summary, a note that CEM/LX come from
    uploads (not in prototype).
11. **More** (`#/more`): Who's using this phone (roster pick); English /
    Español; Demo clock; Manage (PIN gate mock: any 4 digits opens a page
    that says what Manage would hold); Structure & assumptions
    (`docs/ASSUMPTIONS.md` rendered); Print (opens print view of the day).

Bottom nav: Set Ups (or Mi puesto for team members) · Waste · Tasks · Scores ·
More. Header always shows the sync dot: Saved / Saving… / Offline (fake:
`store.save()` resolves after 600 ms; rows are grey-italic until then).

## Visual system (`styles/tokens.css`)

Font DM Sans (Google Fonts link in index.html; fall back to system-ui).
Colours: red `#C8102E`, bg `#F6F3EE`, ink `#1C1B19`, ink2 `#5F5B55`,
ink3 `#6B665F`, white, line `#E6E1D8`, chip `#ECE7DF`, dark `#2A2825`,
green `#2E7D32` on `#E6F2E7`, amber `#C97A1E` on `#FBF0E2`, needed bg
`#FFF3EE`, pending bg `#EFEBE4`. Radii 10/12/16, chips 999. Type: 26 title,
20 sheet title, 16 name, 15 position, 14 body, 13 meta, 12 sub. No emoji as
icons; inline stroke SVG only. On desktop the app renders centred in a 390 px
column with the page background around it.

## Tests and checks

- `node --test prototype/tests` covers rules: dayparts/headcount/handoffs,
  outside rule (incl. last-daypart exemption), tiers, Game Day picks, Fill
  (never moves hand placements; leader-first captains; stays-open), breaks
  (every constraint), tasks due-now, waste undo/tape.
- A Playwright script (`prototype/tests/smoke.mjs`, run with the repo's
  Chromium) opens each route at 390×844, asserts no horizontal overflow,
  asserts every `nav a`, `.btn`, `.prow`, `.person`, `.sizes button` is ≥ 44 px
  tall, walks the flow Set Ups → Drinks 1 → pick Rafael → row pending → saved,
  Fill → Confirm, Waste tap → snackbar → Undo, Tasks toggle, language switch,
  and saves screenshots to `prototype/tests/shots/` (git-ignored).
