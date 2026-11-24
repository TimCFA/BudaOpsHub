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

On a touch screen (phones and every tablet) the tabs are a bar at the bottom
(`static/js/bottom-nav.js`, "Bottom tab bar" in theme-cfa.css; Tim, Nov 12
2026), with four places chosen for who is holding the device, then Hub (Tim,
Nov 23 2026, from the navigation mock-up): Team Members, Trainers, Team Leads
and a signed-out phone get Home, Set Ups, Lists, Tasks; directors, the Admin
Team and the manager PIN get Home, Set Ups, Tasks, Our Team (Calendar if Our
Team isn't theirs); a signed-out kitchen iPad (Right Now on Back) gets Home,
Set Ups, Prep, Waste. Hub (`/hub`, "Hub" in theme-cfa.css) is a page, not a
sheet: recent pages, a search ("Find a page"), every other page in four groups
named by the job (Run the shift, People, Numbers, Admin), then dark mode. A
page shows there only to those who can open it, by the same rules
activateView keeps (`can()` in bottom-nav.js; keep the two in step). Every page
has one name everywhere (`PAGES` in bottom-nav.js; the computer's Lists menu
says the same). A computer keeps the tab row at the top. It
goes by touch (`hover:none` and `pointer:coarse`), not width, so a counter
tablet on its side still gets the bar. The bar opens pages the one way the
rest of the hub does (`launchShowTab`), so it and the top row never disagree. Anything else pinned to the
bottom of the screen sits above it with `var(--bnav-h)`; on Tasks the Pass's
own views go back to a row at the top, so there is never a second bar. The
header has no clock and is one row where it fits; on a phone the badge and
the waste chip, which keeps its own look (Tim, Nov 12 2026), sit on a second
row.

One meaning a colour (the Nov 2026 refresh): ink is "selected", red is "now"
and "needs someone", navy is stats, green is done. On Set Ups the open
daypart is one white card with its positions as rows inside; a spot's zone
colour is on its number badge. Zone Resets has its own page since Nov 23 2026 (see Zone Resets). The Waste logger keeps
its own look (Tim's call); Home got its own redesign on Nov 21 2026 (see
Home), on the same colour meanings. Tests: `tests/test_bottom_nav.py`.

## Page links

Every page has its own address (Tim, Nov 23 2026): `/setups`,
`/lists/timers`, `/tasks` and so on (`PL_PATHS` in `static/js/page-links.js`;
app.py `PAGE_PATHS` answers each with the same page; `tests/test_page_links.py`
keeps the two lists the same, and every view needs one). The hub is still one
page and loads nothing more for it: the address follows `activateView`. A tap
adds a step back can undo (pushState); a page the hub opens by itself (a
redirect, a redraw, a sign-in moving someone on) replaces the address, so
back never lands somewhere the person didn't choose. An address opens its
page once every script has run; one that needs a sign-in (Directors, Huddle,
Know the Numbers) opens once the sign-in is known, unless the person has
moved on. Every file the page loads is referenced from the root (`/static/…`,
`${API_BASE}/api/…`) so it works at any address; keep it that way.

## Home

Home is one glance at your own day (Tim, Nov 18 2026): the greeting and the
quote (culture first, always), then the Right Now card
(`static/js/right-now.js`), which changes by who is signed in; every line
taps through to where it lives, the item itself and not the top of its
page (Tim, Nov 23 2026): a break line opens Set Ups at the roster on Breaks
left (`rnOpenBreaks`; tests/test_home_links.py). Vision, Mission and Values and the Monthly
Leadership Wins are off Home (still kept in Manage as `homeData`, for a page
of their own later). Someone in their first 30 days (the roster's "In
training" tag from HotSchedules, or a hire date in Our Team) gets a new
hire's card: their day number, who is on their spot with them, who to find
when they walk in, positions so far, and "Before your shift" lines a director
types in Manage → Home Page (Tim, Nov 20 2026; the training plan comes
later). The day's calendar events are quiet lines after the person's own
("Now" in red while one runs), and a new hire's card has none.

The look (Tim, Nov 21 2026: "more dynamic and engaging"; "The look" in
right-now.js and "Home: Right Now" in theme-cfa.css): the greeting carries
the person's name and sits on the page's own ground, so the first block of
colour is the banner. The banner is the First thing: a small label, the words
that matter in big type, the detail (red when it needs someone, green when
all is covered or done, navy for where you are). Under it a compartment per
kind of information: Your day as lines, the floor's counts as big-number
tiles, tickets as stubs, the calendar, then "More about today" and the way to
sign in as the page's one button. Every line is a small label over the words
that matter; a count out of a total draws a bar; a person's line leads with
their initials. Two columns from 860px. The card rises in when Home opens or
someone signs in, only for people who haven't asked their device for less
motion. What each role sees, and Tim's calls behind it, are in the comments
at the top of right-now.js and in `tests/test_right_now.py`; ask before
undoing one. Home is drawn in the first seconds of a load
(`tests/test_first_load.py`), so anything new waits for the late scripts or
is measured first.

## Zone Resets

The Zone Resets page under Lists (`static/js/zone-page.js`, "Zone Resets: the
page" in theme-cfa.css; Tim, Nov 23 2026: "a lot of information and nothing
stands out") is three steps, each one screen, in Home's language. The day:
the five handoffs, always in the day's order, each wearing its time of day
(its sky and start time) and saying where it stands (done, now, next, not
finished); the one that's up is the bigger card. A tap opens a handoff: its
zones as tiles, who owns each, how far along, a zone nobody owns in red. A tap
on a zone opens its list on a sheet with big rows to tick. Nothing opens by
itself, and the handoffs don't move with the clock (both were Oct 18 2026
calls Tim reversed). Kept: a zone's last tick closes it and says what's left;
Home's "zone" lines open their handoff. The helpers Home and Set Ups read
(owners, completion, the current handoff) stay in `zone-reset.js`, in the
first group of scripts; the page itself loads with the rest.

Two views of the same three steps (Tim, Nov 23 2026: "Red flags should not
be visible to team member. Reduce as much noise for team members as
possible"). Leaders (Team Leads and up, a manager session: `zrLeaderView`)
see the whole picture: the day's share done, the Lead Captain, what needs
someone in red (no Lead Captain, zones with nobody, a handoff not finished),
Hand off, who ticked what. Team Members, Trainers and a
device nobody signed in on see only what they act on: the handoffs and where
each stands, their own zone first and marked in ink ("Your zone"), the other
zones with whose they are, the list. Nothing in red but "now"; no counts of
what's wrong, no Hand off. The last six days and their star show to
everyone (Tim: the team should have them). Anything new on this page goes on
the leaders' view unless the team acts on it. Tests:
`tests/test_zone_reset_flow.py` (runs the page in node) and
`tests/test_zone_owners.py`.

The Leader Transition List is off the hub for now (Tim, Nov 23 2026: it
wasn't being used and added clutter; it comes back when list execution is
stronger or leaders ask for it). Its pill, its page and its row in the
leaders' weekly report are gone. Its items (`fohLeaderTransitionItems`) and
what was saved (`fohLeaderTransitionChecked`, `fohLeaderTransitionDate`,
`leaderTransitionHistory`, still in `STATE_SECTIONS`) are kept and still
loaded and saved as they are, so nothing on the server changes. Don't bring
it back without Tim asking. Neither it nor the OE Walkthrough (hidden since
Sept 2026) is a Huddle quick pick. Tests: `tests/test_leader_transition_off.py`.

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

The Huddle page under Lists (OE on the full site) is the pre-huddle and post-huddle for each daypart and the store's focus for
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

## Directors' Week

Directors' Week sits on the Calendar tab beside the store's calendar
(`week_api.py`, `static/js/week.js`, `static/css/week.css`; Tim, Nov 18
2026): the team sees how a director plans to spend the week and asks for
their time. The week is mirrored from one Google calendar the director
shares with the hub's service account (the Firebase one; its address is shown
on the director's settings card) with "Make changes to events"; nobody plans
in the hub, no phone talks to Google, and a director who hasn't connected has
no page. Never a primary calendar: only an ID ending
`@group.calendar.google.com` connects. A block's type is told by its title,
else its Google colour (`BLOCK_TYPES`): Open door is bookable in 30-minute
slots; every other type shows by its type's name, never the event's own
title, and can't be booked; an event of no type is "Busy".
The week is a calendar grid, and its blocks wear Google Calendar's colours
(Tim, Nov 21 2026: the one exception to "one meaning a colour"), for the
team as for the director.
Requests (`REQUEST_TYPES`, data so a type can be added) wait for the
director: Open door time, a PEA on me, staffing support, need to talk.
Booking closes at midnight (tomorrow is the first day; a same-shift gap is a
call or text, said on the page), one person a slot unless the block's title
says "group", and a taken slot shows "Booked" with no name. Accepting a slot
writes it onto the director's Google calendar; a PEA or staffing request is
only marked accepted. Requests are folded from events under
`week/events/<id>`, one record each; which calendar each director shares and
the switch are under `secure/week`, so it never touches `/api/state/sync`.
Nothing shows to the team until a director turns it on (Tim's call). A
director is told by a row on Right Now and a badge on the tab; there is no
email yet. English only. Tests: `tests/test_week.py`.

## PEA scores in Set Ups

A Team Lead placing someone sees that person's PEA score at the position (the
picker's dot and "Crushing It · 2.90", the person sheet; Tim, Nov 22 2026).
The ratings stay private: the saved `pea` section still goes to manager
sessions only. A lead's phone asks `/api/setups/pea` for a cut-down copy
(`pea_mine.lead_view`: no raters, nobody whose latest Levelset role is a
leader's) and keeps it in memory only (`peaLead` in pea-ratings.js), never in
`peaRatings`, so it can't be saved back or left on the phone. Anything Set Ups
reads goes through `peaShown()` / `peaAliasesShown()`, not `peaRatings`
directly. Tests: `tests/test_lead_pea.py`.

## Lists tally and the 14-day trim

Zone Reset ticks and finished breaks are kept 14 days in the saved sections
(Tim, Nov 23 2026: every tick was carrying months of old ticks to the
database and back to every phone; Render's bandwidth). Once a day the server
(`list_tally.py` has the rules, app.py "LISTS" runs them in the background
off a load or sync, never in a start's first ten minutes) writes one record
per finished day under `lists/tally/<date>` in Firebase: each handoff's Lead
Captain (from Set Ups, else its history), items done, items in all. That is
the leaders' accumulating list score (Tim: credit the Lead Captain; which
items were ticked needn't be kept), kept for good, never a saved-state
section. Only after the record is written, and after a one-time whole copy
of `ops`, `setups` and `history` under `backups/preTrim`, do ticks
(`zoneChecklistState`) and finished breaks (`completedBreaks`) older than 14
days leave their sections, with a conditional write so a save another server
took is kept. A day whose ticks sit under handoffs or zones the hub no longer
has is left as it is, never trimmed uncounted. Nothing else in those sections
is touched and no saved setting changed. `/api/lists/tally` (directors) adds
the records up per leader; no page shows it yet. Tests:
`tests/test_list_tally.py`.

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
