# BudaOpsHub

Ops web app for Chick-fil-A Buda (Flask + vanilla JS). Tests: `python3 -m unittest discover tests`.

## Leadership resources

Books, podcasts and frameworks the leadership team draws on for style and ethos.
Factor these in when relevant to insight, feedback, or decisions on CFA Buda work.

Books
- Excellence Wins — Horst Schulze
- Good to Great — Jim Collins
- The 5 Dysfunctions of a Team — Patrick Lencioni
- The Four Disciplines of Execution (4DX) — Chris McChesney, Sean Covey, Jim Huling
- Unreasonable Hospitality — Will Guidara
- 2 Second Lean — Paul Akers
- The Heart of Leadership — Mark Miller
- Leaders Eat Last — Simon Sinek
- Atomic Habits — James Clear
- The Infinite Game — Simon Sinek
- The 8 Concepts of Bowen Family Systems

Podcasts
- Lead Every Day Podcast
- The Andy Stanley Leadership Podcast

The Leadership Playbook also uses: Win Every Day (Mark Miller), Working Genius
(Lencioni), Make Your Bed (Admiral McRaven).

## Quotes

Home screen quotes (`homeQuotes` in static/js/zone-reset.js) must be verbatim and
checked against a published source; each carries its author and source. Never
paraphrase or add an unsourced quote.

## Spanish

Everything the kitchen (BOH) team sees carries Spanish next to the English; FOH
stays English-only to keep it uncluttered. New or changed text on those screens
(Set Ups and Waste on their BOH side, Food Safety, Prep Board) gets its Spanish
from the glossary in `static/js/spanish.js` (`esHtml` / `esLine`, `data-es` in
the page); `tests/test_spanish.py` fails if a phrase is missing. On FOH the
Spanish is hidden (`esSyncSides`, the `es-off-*` classes in theme-cfa.css).

## Theme

`static/css/theme-cfa.css` loads after `main.css` and carries the look: Chick-fil-A
red (#DD0031) for actions and limits, Chick-fil-A navy (#004F71) for dark "stats"
cards, an ivory ground, slab-serif headings and hero numbers (Zilla Slab) with a
grotesque body (Figtree); both fonts stand in for Caecilia and Apercu until the
brand fonts are licensed (swap `--font-display` / `--font-ui`). Line icons (inline
SVG), never emoji. New components go in the theme's conventions.

## Tab bar and header

On a touch screen (phones and every tablet) the tabs are a bar at the bottom:
Home, Set Ups, Lists, Waste and More, which lists every other tab the top row
would show, then dark mode (`static/js/bottom-nav.js`, "Bottom tab bar" in
theme-cfa.css; Tim, Nov 12 2026). A computer keeps the tab row at the top. It
goes by touch (`hover:none` and `pointer:coarse`), not width, so a counter
tablet on its side still gets the bar. The bar has no navigation of its own:
each button presses its tab in the top row. Anything else pinned to the
bottom of the screen sits above it with `var(--bnav-h)`; on Tasks the Pass's
own views go back to a row at the top, so there is never a second bar. The
header has no clock and is one row where it fits; on a phone the badge and
the waste chip, which keeps its own look (Tim, Nov 12 2026), sit on a second
row.

One meaning a colour (the Nov 2026 refresh): ink is "selected", red is "now"
and "needs someone", navy is stats, green is done. On Set Ups and Lists the
open daypart or handoff is one white card with its positions or zones as rows
inside; a spot's zone colour is on its number badge. Home and the Waste
logger keep their own look (Tim's call). Tests: `tests/test_bottom_nav.py`.

## Tasks

The Tasks tab is the Pass (`pass_api.py`, `static/js/pass-engine.js`,
`static/js/pass.js`, `static/css/pass.css`; Tim, Oct 28 2026, from the "The
Pass" design): a leader hands a ticket to one owner with what done looks
like, why it matters, a due time, an authority level (1-5) and check-ins; the
owner says it back (or asks for another time), checks in, turns it in with
proof; the leader verifies it (meets / elite) or sends it back. My tickets /
Waiting on / Rail / Team (directors). Tickets are folded from events, one
Firebase record each under `pass/events/<id>` (photos apart under
`pass/photos/`), never a saved-state section, so it never touches
`/api/state/sync` or Set Ups. The rules live twice, `fold` in pass_api.py and
in pass-engine.js, and must stay the same (tests/test_pass.py runs both). Who
someone is comes from the hub's session (app.py `_pass_me`); who can be handed
work is the PIN list plus the Directors list (`_pass_people`). Team Leads and
up hand work off; Team Members and Trainers see only their own tickets.
Spanish is a per-device EN / ES switch on the tab (not a BOH side): its
phrases live in the glossary's Tasks section and go through `T` / `TL` / `V`
/ `TT` in pass.js. Tests: `tests/test_pass.py` (rules, API) and
`tests/test_pass_tab.py` (wiring, look, every phrase in the glossary).

## Timers

The Timers page under Lists (OE on the full site) is the counter tablet's
recurring task timers (`timers_api.py`, `static/js/timers.js`,
`static/css/timers.css`; Tim, Oct 28 2026). Each timer has an interval and
a grace; a cycle starts at the last reset (or at opening) and is on time,
late (inside the grace) or missed. The server writes a miss itself when the
grace runs out, and works out who gets the credit from Set Ups when the cycle
came due: the Lead Captain of the FOH daypart on the floor, or whoever they
handed the timer to (a handoff holds until a different Lead Captain takes
the floor, or it's taken back). Timers rest outside store hours and on closed
days; a timer nobody has ever reset hasn't started. One tap pauses (a tap on a
paused timer resumes it), a quick double tap resets, press and hold opens the
sheet (who did it, handoff, a pause for 15 / 30 / 60 min); Tim's call, Oct 28
2026. A tap pause lasts until it's tapped again or the store closes. Paused
time moves the cycle later by as much, and a cycle that's already a miss
can't be paused (the rule lives in `cycle` in both
timers_api.py and timers.js; tests/test_timers.py runs both). Events live under
`timers/events/<id>` in Firebase, one record each, never a saved-state
section, so it never touches `/api/state/sync`. Anyone can reset (a
signed-out device names who did it); Team Leads and up hand off and change
the timers. FOH only, so English only. `FOH_DAYPARTS` in timers_api.py must
match `fohDayparts` in zone-reset.js (tests/test_timers.py checks).

## Huddle

The Huddle page under Lists (OE on the full site), beside Leader Transition,
is the pre-huddle and post-huddle for each daypart and the store's focus for
the month and the week (`huddle_api.py`, `static/js/huddle.js`,
`static/css/huddle.css`; Tim, Nov 18 2026). Team Leads and up, enforced by
the server; directors set the focuses. The pre-huddle is Tim's Team Lead
Pre-Shift Card (why I'm here, the ONE priority, up to three goals: PEC area,
leadership, the system I'll run, each tied to a focus with a tap; who I'll
develop); the post-huddle closes it (each goal hit / partly / missed, one
recognition, one thing for the next leader). One huddle per day and daypart
on the four Know the Numbers dayparts (`DAYPARTS` in huddle_api.py must match
`numbersDayparts` in know-numbers.js; tests/test_huddle.py checks); the Lead
Captain and the names offered come from Set Ups. The pre-huddle opens 30
minutes before the daypart (`PRE_OPENS_MIN`), the post once it has started,
and both only on their own day. The rules live on the server only: the page
draws what `/api/huddle/state` sends. Events live under
`huddle/events/<id>` in Firebase, one record each (a save again is a new
record; the latest stands), never a saved-state section, so it never touches
`/api/state/sync`. Once a daypart has started its card carries the shift's
numbers, added up by the server from what the hub already records
(`shift_numbers`), never retyped: per daypart, productivity against its
goal, the task timers that came due in it, FOH waste logged and food safety
walkthroughs finished; per zone, the Zone Resets of the handoffs its Lead
Captains own (`HANDOFFS` and `ZONE_ITEMS` must match zone-reset.js and
state-and-utils.js; the tests check). Never show a per-zone split of a number
the hub records per daypart. A copy is kept on the post-huddle event as it
stood at closing, used where the hub has since cleared its own record. It
only reads the saved state. Directors also get Day / Week at the top: the
week's roll-up (`/api/huddle/week`, `roll_up`) of huddles set and closed,
goals hit, goals written against each focus, each leader's huddles, each
daypart's numbers and who won a shift; a huddle is expected once its daypart
has started. The look is Know the Numbers' (the `knp-` classes), dressed in
Home's language (Tim, Nov 21 2026; "Home's language" in huddle.css): the
focus and each card's ONE priority are banners (navy; red when it needs
someone; green when done), labels are Home's small caps, the shift's numbers
are big-number tiles tinted by how they went, and the action is one
full-width red button.

Front of house and the kitchen each have their own huddles (FOH / Kitchen at
the top, remembered on the device; Tim, Nov 21 2026). FOH stays English
only. On the kitchen's side every phrase carries its Spanish from the
glossary's Huddle section through `L` / `es` / `P` in huddle.js, including
the quick picks and what the server says when it refuses a save (keyed by
their own English); tests/test_huddle.py fails if one is missing. The
kitchen has no Lead Captain, its own quick picks (`PICKS['boh']`, the
build's until Tim names them) and its own waste; the task timers and Zone
Resets are front of house's, so its huddle carries neither. The directors'
week is English and per side.

Tim confirmed (Nov 21 2026): four dayparts "for now"; which handoff counts
for which huddle; the pre-huddle opens 30 minutes before; leaders only, with
nothing on team members' Right Now cards; any Team Lead or director can
close another's huddle; each side's card shows its own waste; the week is
directors only. Tests: `tests/test_huddle.py`.

## Deploying

Merging to `main` deploys to Render and restarts the server for about a
minute. The team runs the store on this app from their phones, so a bad
deploy stops service. These rules come from Oct 12, 2026, when four
mid-shift merges and a retired setting still stored on the server left
every phone unable to save for a day (PRs #148, #149).

- **Never merge during service hours**: roughly 6am–10pm Central Mon–Thu, and
  6am–11pm Fri and Sat (the store closes at 11pm on Friday and Saturday; Tim,
  Oct 23, 2026). Default to after close. If something can't wait, say so and let Tim
  decide; never assume.
- **One merge a day, Mon–Sat.** Batch ready PRs into a single merge window so the
  server restarts once, and tell Tim the time it went live so everyone can
  reload once before the next shift.
- **Sundays are open** (the store is closed; Tim, Oct 18, 2026): merging is
  fine, more than once if needed. Still batch PRs that are ready together,
  since leaders may be filling in Monday's Set Ups and each deploy briefly
  risks a save landing on the old server. Do the full live check after every
  merge.
- **Tests are not the deploy check.** After every merge, watch
  `/api/state/sync` until its `build` matches the merge commit, then load
  the live site headlessly as a team device (Playwright is installed) and
  confirm: its first save, if any, is not refused; today's Set Ups
  (`posAssignments` for today) are intact on the server. Not done until
  that passes.
- **Before renaming or removing a saved setting** (a key in `STATE_SECTIONS`),
  read what the live server actually stores (`POST /api/state/sync` with
  `{"versions": {}}` is read-only) and plan for the old value still being
  there. Retired keys are tolerated on save (app.py, `state_patch`), but a
  change that depends on their absence still needs checking.
- **A failed save must retry** (storage.js `saveState`), never be dropped;
  keep that when touching the save path.
- **A change to saving, syncing or Set Ups passes the shift simulator first**:
  `node tools/shift_sim/sim.js all 5` must print PASS (several phones, a
  flaky and slow database, lost signal, a deploy overlap, reloads, a restart;
  tools/shift_sim/README.md).
