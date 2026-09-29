# rules/ — module contract

Every module is a plain ES module of pure functions: no DOM, no store, no
`Date.now()`. Times are **minutes since midnight** (integers). Dates are
`'YYYY-MM-DD'` strings. Sides are `'foh' | 'boh'`. People are referenced by
`personId`. All functions must be unit-testable with `node --test`.

Shared shapes (defined in `data/` and reused everywhere):

```js
Person   = { id, first, last, role: 'tm'|'trainer'|'tl'|'manager', side, lang }
Roster   = { personId, start: 'H:MM', end: 'H:MM', leaderShift?: boolean }        // one entry per person per date+side
OnShift  = { personId, from, to, arrives: min|null, leaves: min|null, whole: boolean, lastDaypart: boolean }
Slot     = { id, name, sub: string|null, captain: boolean, zone: 'ipos'|'bagging'|'drinks'|'omd'|'host'|'primary'|'secondary'|'raw'|'extra', pea: string|null, outside: boolean }
Assign   = { personId, pending?: boolean, handoffTo?: personId, handoffAt?: min }   // assignments[slotId] = Assign
Assignments = { [slotId]: Assign }
PeaRow   = { personId, position, score, at: ISO string, leaderId }
HistoryEntry = { date, side, daypart, assignments: { [slotName]: personId }, leadCaptain: personId|null }
Flag     = { kind: 'no-leader'|'non-leader-captain'|'captain-leaves'|'outside-again'|'not-rated-gameday'|'not-yet-gameday', text: string, slotId, personId?: string }
```

## time.js
- `parseTime('6:00') → 360`; `parseTime('13:30') → 810`; 12-hour input also accepted (`'1:30 PM'`).
- `fmt(810) → '1:30'` (12-hour, no am/pm); `fmtRange(660, 840) → '11:00–2:00'`.
- `clockLabel(min) → '10:52'`.

## dayparts.js
- `DAYPARTS = { foh: [{ key, name, start, end }], boh: [...] }` — FOH keys: `early, breakfast, lunch, afternoon, dinner, close`; BOH: `early, breakfast, mid, afternoon, dinner, close`. FOH Lunch is 660–840 (Transition merged).
- `daypartAt(side, min) → daypart` (the one whose window contains `min`; before 6:00 → first; after 22:00 → last).
- `daypartByKey(side, key)`, `nextDaypart(side, key)`, `prevDaypart(side, key)`.

## positions.js
- `SLOTS = { foh: { [daypartKey]: Slot[] }, boh: { [daypartKey]: Slot[] } }` in priority order, derived from the current app's lists (Transition removed, typos fixed, "Shift Lead" slot removed).
- `slotFromName(rawName, side) → Slot` — strips lane suffixes for `name` (keeps the lane in `sub` when useful), sets `captain` from "(Captain)"/"(Cockpit Cap)", `zone` from the regexes, `pea` from the zone (iPOS→'iPOS', Bagging→'Bagging', Drinks 1/3→'Drinks 1/3', Drinks 2→'Drinks 2', OMD→'OMD', Host→'Host', Runner→'Runner'; BOH Breader/Primary/Secondary/Machines/Fries/Prep), `outside` for ipos/omd.
- `slotById(side, daypartKey, slotId)`.

## roster.js
- `onShift(rosterEntries, window: {start,end}, edgeMin = 10) → OnShift[]` — arrives/leaves null when within `edgeMin` of the edge; `whole` = both null. `lastDaypart` = the entry's end is ≤ window.end + edgeMin.
- `handoffPairs(onShift, earlyMin = 60, lateMin = 30) → [{ leaverId, arriverId, at }]` — each leaver paired with the closest arrival from 60 min before to 30 min after they leave; each arrival used once.
- `effectiveHeadcount(onShift, pairs) → number` (people − pairs).
- `displayNames(people, ids) → { [personId]: 'Maria' | 'Sam D.' }` — first name; last initial only on collision.
- `isLeader(person, rosterEntry) → 'tl' | 'trainer' | null`.

## leaders.js
- `ZONES`, `LEADER_ZONE_PRIORITY = { foh: ['ipos','bagging','host','drinks','omd'], boh: ['primary','raw','secondary'] }`, `REQUIRED_LEADER_ZONES = { foh: ['ipos','bagging','host'], boh: ['primary'] }`, `REACH = { bagging: ['drinks','omd'] }`.
- `leaderFlags({ side, slots, assignments, people, rosterById, onShift }) → Flag[]` — no leader in a required zone (respecting reach), non-leader in a captain slot, captain leaving mid-daypart to a non-leader (via `handoffTo`).
- `leadCaptainOptions({ side, onShift, people, rosterById, history, date, assignments, slots }) → [{ personId, lastLed: date|null, daysSince, reason }]` — TLs only, ordered longest-since-last-led first, TLs already captaining a zone last.
- `leadHomeSlot({ side, daypartKey, slots, headcount, assignments }) → slotId` — Runner if its rank ≤ headcount, else Drinks 3 / FC Bagger (the zone with fewer leaders), DT Bagger 2 in the Afternoon.

## outside.js
- `outsideFlags({ side, date, daypartKey, slots, assignments, history, onShift }) → Flag[]` — for each person placed in an outside slot: if their previous daypart today (from `history` for this date, or the store's earlier dayparts passed in as history) was outside for the whole daypart AND `!onShift.lastDaypart` → flag `outside-again` with text `outside all <prev daypart name> · swap ›`. Breaks never affect it.

## tiers.js
- `TIERS = [{ key:'crushing', label:'Crushing It', min: 2.75 }, { key:'rise', label:'On the Rise', min: 1.75 }, { key:'notyet', label:'Not Yet', min: 0 }]`.
- `scoreFor(peaRows, personId, peaPosition) → { score: number|null, tier: key|null, count, lastAt }` — mean of the latest 5, rounded to 2 dp; null when never rated.
- `allGreen(peaRows, personId, side) → { green: string[], missing: string[], isAllGreen }` using the brief's position lists.
- `peaDueDays(peaRows, personId, asOfDate) → number|null` days since the person's last rating anywhere.

## gameday.js
- `dayType({ date, override, specialEvent = false, salesRatio = 1, goalRatio = 1 }) → { type: 'game'|'practice', reason }` — Fri/Sat = game; else 2+ of the three signals; `override` wins.

## develop.js
- `keepAnEye({ onShift, people, peaRows, history, date, side }) → [{ personId, reason }]` top 3 by: PEA overdue ≥ 30 days ("PEA due, 31 days"), within 2 positions of all green ("2 positions from all green"), stalled ("stalled on Bagging" = no PEA on a position they work in 14 days, or 4 of last 5 shifts same position).
- `developPicks({ dayType, onShift, people, peaRows, slots, assignments, rosterById }) → [{ personId, slotId, peaPosition, reason, pairedWith: personId|null, pairReason }]` — Game Day: only On the Rise, 1 pick, needs 8+ on shift and a Trainer; Practice: ~1 per 4 on shift, non-green positions. Pairing: Trainer not captaining → Crushing It TM → TL.

## fill.js
- `fill({ side, daypartKey, slots, assignments, onShift, pairs, people, rosterById, peaRows, history, date, dayType }) → { proposals: [{ slotId, personId, reason, flags: Flag[] }], staysOpen: [{ slotId, reason }] }` — Needed slots only (rank ≤ headcount, empty), never touches existing assignments, captain slots leader-first (whole-daypart TLs, whole-daypart Trainers, part-daypart leaders), spread leaders across `LEADER_ZONE_PRIORITY` before doubling, prefer the strongest score on that PEA position, obey the outside rule (skip a candidate who would be outside two dayparts running unless last daypart), avoid yesterday's zone (soft), Game Day: a Not Yet / never-rated candidate is only proposed when nobody else is free and then carries a flag.

## breaks.js
- `planBreaks({ side, rosterEntries, people, now, overrides = {}, busy = DEFAULT_BUSY, assignments, slots, leadCaptainId, unplacedIds }) → { plan: [{ personId, start, end, cover: personId|null, moved: boolean }], offNow: [...], next: [...], warnings: string[] }` — constraints: shift ≥ 360 min; break 30 min; not in first/last 120 min; never in [600,630] or [720,780]; near middle, earlier better; ≤ 2 off at once per side; starts ≥ 10 min apart (prefer ≤ 15); never two TLs overlapping; `overrides[personId] = start` sticks. Cover = an unplaced person on shift at that time, else the Lead Captain.

## tasks.js
- `TASKS` (FOH recurring, from the current app, with `owner` slot names and `es` text).
- `dueNow(tasks, now, graceMin = 30) → task[]`, `nextTasks(tasks, now, count = 3)`, `tasksForDaypart(tasks, window)`.
- `checklistProgress(items, doneMap) → { done, total, pct }`.

## waste.js
- `logEntry(entries, { productId, qty, who, at }) → entries'` (immutable), `undoLast(entries, who, now, windowSec = 5)`, `todayCount(entries, date)`, `tape(entries, now, minutes = 15)`, `needsCosts(products) → boolean`.

## board.js (composite used by the Set Ups screen)
- `buildBoard({ side, date, daypartKey, now, people, roster, assignments, peaRows, history, dayType, leadCaptainId, breakPlan, todayAssignmentsByDaypart }) → { window, onShift, pairs, headcount, rows: [{ slot, rank, needed, folded, assign, name, roleTag, scoreChip: { score, tier, star }|null, note, flags }], counts: { placed, expected, flags }, lead: { personId, name, homeSlotId, reason }|null, at1: { time, leavers: [...], handoffs: [...], closes: [...] }|null, keepAnEye: [...], carriedFrom: daypartKey|null }`.
```
