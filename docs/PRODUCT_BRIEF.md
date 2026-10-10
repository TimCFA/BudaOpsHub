# Buda Ops Hub — Product Brief

A brief for anyone (person or AI session) taking a fresh look at the hub. It
says **what the product has to do and the rules the owner has decided**, not how
today's code does it. Treat the current implementation as one answer, not the
spec. Where this brief and the code disagree, ask Tim.

---

## 1. What it is

The operations hub for the Chick-fil-A in Buda, TX. One web app that replaces a
pile of paper sheets, Google Forms and standalone tools: positioning the team
each daypart, logging waste, running prep, food-safety and zone walkthroughs,
tracking talent development, and scoreboards that keep everyone pointed at the
same goals.

**Owner:** Tim Lane (operator side). He decides rules, approves every change,
and says "merge" when a change should go live.

## 2. Who uses it, and how

- **~80 people**: team members, Trainers, Team Leads, and managers. Front of
  house (FOH) and back of house (BOH / kitchen).
- **Mostly phones**, often one-handed, mid-rush, in a loud store. Also a few
  shared tablets and the occasional desktop in the office.
- **Several people at once**: two leaders can be on Set Ups while others log
  waste. Everyone must see each other's changes without refreshing, and no one's
  change may be lost.
- **Managers** unlock Manage with a PIN. Everyone else can use the floor tools.
- **English and Spanish**: parts of the team read Spanish; products, checklists
  and training content carry Spanish text where it exists.

What "good" feels like for them: open it, tap the thing, done — in seconds,
during service. Clear at a glance. Never a moment of "did that save?"

## 3. Feature areas

### Home
A landing page with the day's key info (content set in Manage → Home Page).

### Simplified site (launch mode)
While the team is getting started, a device without the manager PIN sees
only Home, Set Ups, Waste and Lists. Lists opens Zone Resets in one tap; the
Leader Transition List, Food Safety Walkthrough, Daily Safe Count and the Prep
Board are pills at the top of each list page (Zone Resets and the Leader
Transition List are one page on the full site, two pills here). Set Ups opens in the plain set-up
sheet with the roster's break timer; Coach and the planned break times wait
for the full site. Managers turn launch mode off for everyone in Manage.

### Set Ups (positioning) — the most-used, most rule-heavy area
- **The picker shows everyone working today** (Oct 2026, after a swapped-in
  Team Leader couldn't be found): under the people free for the spot, "Show N
  more from today's roster" (or any search) lists the rest with why they
  aren't above: "at OMD 1 now" (picking them moves them, their old spot
  keeping whoever handed off to them), "works 6:00a–2:00p" (hours outside the
  daypart) or "on the BOH roster" (the other side). Any of them can be
  placed. A search for a name on neither roster points to Add Team Member.
  Shifts ending at or after midnight ("4:00p–12:00a") count as running to
  the end of the day.
- **Truck** (`static/js/truck.js`, Tim, Oct 2026, after a morning with
  nobody on it): the scheduler assigns truck in HotSchedules as an
  off-floor shift (Schedule "Other", Job "Truck"); the hub only shows it.
  Leaders don't assign truck in the hub (Tim). The roster import keeps those
  shifts as `truckShifts` (replaced on each import; still off the floor
  roster), and its preview shows each day's truck. The truck comes every
  open day (Tim), so the Set Ups roster (both sides) starts with a truck
  row, set apart from the people on the floor (navy rail, Truck tag, "off
  the floor"): who has the Truck shift and when, or a red "No truck shift on
  the schedule". Today's roster adds a line for tomorrow, so a gap is seen
  the night before. Spanish on the BOH side.
- **Add Team Member** takes times however they're typed (`static/js/shift-time.js`):
  5:30a, 5:30 am, 530, 5.30, 5, 17:30, 1730, noon, or the whole shift in the
  start box ("5:30-1:30", "11 to 7"). Each box tidies itself to the
  schedule's spelling ("5:30a") when the leader moves on, and a line under
  the boxes reads the shift back ("5:30a – 1:30p · 8 h") before it's saved.
  Without a.m./p.m., an end is the reading that makes a 1-14 hour shift; a
  start of 5-11 is morning and 12-4 afternoon (Buda's shifts start 5:30a to
  8p, closers at 4p), unless only the other fits the end. An end before the
  start is refused.
- Daypart cards show their Know the Numbers line (projected sales, $/labor
  hour goal, special event; once typed, the actual sales and how far off
  projection, e.g. "$4,061 actual −3.7%") in both the Set up and Coach views.
  **Actuals** are the only numbers typed by hand (Tim, Oct 2026): Manage →
  Numbers is a month calendar (Monday–Saturday) where each day shows whether
  its actuals are in (green check), still needed (dashed, for a day with a
  projection whose dayparts are over), or its projected total ahead. Tapping a
  day opens its four dayparts: projected sales and goal shown, not typed (they
  come from the Forecast or the numbers file), special events from the Events
  calendar, and two boxes, Actual Sales and Actual Productivity ($/labor
  hour). The last two weeks can be typed in; older days show what was saved
  (numbersHistory) read-only. The card
  shows sales vs projected (dollars and percent) and productivity vs goal
  (dollars). They're kept for a year with the plan (numbersHistory). Numbers are
  kept for the **four major dayparts only, on Analytics Hub's hours**
  (Breakfast 6–10:30, Lunch 10:30–2, Afternoon 2–5, Dinner 5–close), so
  projections line up with the actuals; the Early Breakfast, Transition and
  Close cards show none, and BOH's Mid reads Lunch.
- The person picker is a bottom sheet: names best fit first for the spot's
  position with the PEA tier dot and average, the current holder marked,
  a Clear option, and "Next open spot"; picking an open spot moves straight
  on to the next open one so a daypart fills in one pass.
Assign team members to positions for each daypart, FOH and BOH.

- **Dayparts** — FOH (Analytics Hub's hours): Early Breakfast 6–8, Breakfast
  8–10:30, Lunch 10:30–1, Transition 1–2, Mid 2–5, Dinner 5–8, Close 8–10. BOH: Early Breakfast
  6–8, Breakfast 8–10:30, Lunch 10:30–2 (was "Mid"), Afternoon 2–5, Dinner 5–8, Close 8–10.
- **Priority**: each daypart's position list is in priority order. With N people
  on shift, positions 1–N should be filled; an empty one in that range is
  "needed", extras fold away. Placing someone below an open spot asks first,
  in the picker: "Put them in [the open spot]" (the suggested choice) or
  "Keep them in [this spot]". Skipping is discouraged, not blocked (Tim); the
  skipped spot stays red until it's filled.
- **Drag to move**: hold a placed name (about a third of a second; a mouse
  just drags) and drop it on another spot in the same daypart. An open spot
  takes the person; a filled spot trades with them. A handoff ("A → B")
  moves whole. Notes and resets stay with the spot; a "needs coverage" flag
  clears, as it does when the picker places someone. A quick swipe still
  scrolls, a tap still opens the spot, and holding near the screen's edge
  scrolls the list. Works on the Set up list and the Coach board; the spot
  sheet carries a one-line tip.
- **Who's working** comes from the weekly HotSchedules roster (see Data
  Uploads). Shifts that start or end mid-daypart are handled (see handoffs).
- **Names** show first name only; last initial only when first names collide;
  compound last names shown as initials where Tim asked.
- **Views**: a quick sheet (default) and a coach board with zones, tiles,
  person cards, and tools. No Print button: Tim took it out (Oct 2026), set
  ups are never printed.
- **Daypart cards** (the sheet view): every daypart is a card down the page,
  all closed to start. Tap a card's banner to open or close it; **any number
  can be open at once** so leaders can compare dayparts (Tim, Oct 2026). Each
  open card lists its own spots, and whatever is tapped, held or dragged in a
  card works on that card's daypart (the picker, notes, Fill, the Lead
  sheet); a name drags only within its own card. "More spots" opens per card.
- **Pill layout** (Oct 2026: Tim tried it, then went back to the cards; it may
  come back): the dayparts as a row of pills with only the chosen daypart's
  card below, and a **Not placed yet** tray of who's on shift and not in a
  spot (tap a name, then an open spot; a spot below an open one asks first).
  It's still in the code: set `SU_LAYOUT` to `'pills'` in setups-board.js to
  bring it back. Both layouts read and write the same set up data, so
  switching loses nothing.
- **Tools**: Fill (auto-assign), Develop this shift, Plan B, Evaluate, Lead
  Captain. See the rules in section 4.
- **Breaks & tasks** per daypart (section 4).
- **Zone resets ride on positions.** A FOH card whose daypart carries a
  handoff (Breakfast → Lunch on Breakfast, since the breakfast crew resets
  their zones before they leave, not the lunch crew coming on (Tim); Lunch →
  Mid on Transition, Mid → Dinner on Mid, Dinner → Late Night on Dinner,
  Close on Close) ends with a
  **Resets** drop-down (closed to start, its header counts unowned zones or
  says "all owned"; open or closed is remembered on the device): every zone
  with its owners, taken from the positions
  that work it (`ZONE_OWNER_RULES` in zone-reset.js: Drinks 1/2 and
  Lemonades → Drinks Zone, DT Baggers → Bagging Station, FC Bagger → Front
  Counter, Hosts → Dining Room and Restrooms, OMD → Outside, Drinks 3 → Soda
  Room / Tea, Runner → The Spot, Lead Captain → Final Check; confirmed by Tim).
  The old "Drinks Zone" / "Bagging Zone" / "Front Counter Zone" / "Dinning
  Room" / "Restroom Zone" / "Outside Zone" spots are gone from Transition and
  Close (Lemonades, Pouches and Floors stay). A zone whose positions are all
  open shows red with Pick; tapping any zone hands it to someone on the
  clock on top of the positions (`zoneOwners`, per day and handoff). The
  same owners show on the Zone Reset page.
- **Position notes**: the pencil on a row (or Note in a row's sheet) adds a
  note to that spot, always signed with the writer's initials and the time
  (no initials, no note; `posNotes`, kept 60 days). The notes stay hidden on
  the card: a spot with notes shows a navy comment marker in place of the
  pencil (with a count when there's more than one), and tapping it opens the
  note sheet that lists them.
- **Shift changes** since the schedule was posted (a swap, someone added or
  off, changed hours) sit above the daypart cards as a drop-down, closed to
  start, with a red count of changes and a red "still placed" flag when
  someone who changed is still in a spot. Open, changed hours read "was"
  (light grey) then "now" (bold). Open or closed is remembered on the device.
- **Set up feed** for the daily briefing (`/api/setup-feed`, setup_feed.py):
  a read-only copy of a day's set up for a reader that can't sign in —
  each daypart, its Lead Captain, and who is in which position, by the names
  Set Ups shows. Nothing else (no shift times, scores, notes or private
  sections). Off unless `SETUP_FEED_TOKEN` (32+ random characters) is set in
  Render; a missing or wrong token gets "not found", and wrong guesses are
  throttled separately from the PIN. `?date=today|tomorrow|YYYY-MM-DD`
  (default tomorrow, store time), `&format=text` for plain text. A token in
  the link can land in request logs, so change the variable to cut off an old
  link.
- **Daily briefing feed** (`/api/briefing`, briefing_feed.py): ready-to-read
  summaries for the daily briefing, by topic — set up; sales (the last day
  with sales: vs last year, vs the forecast sent, labor %, $/labor hour,
  check average, month to date); projections (the day's projected sales and
  goals by daypart, special events); guest scores (only once uploaded — the
  page's built-in sample figures are never sent); waste (the day before
  against the limit, by side, top items, month to date); and people (names:
  the day's roster with shift times, and PEA ratings from the last 7 days
  with position, score and rater). Off unless `BRIEFING_TOPICS` lists the
  topics it may serve. `SETUP_FEED_TOKEN` unlocks the store topics; a second,
  different `BRIEFING_PEOPLE_TOKEN` also unlocks people. Never sent: safe
  counts, trainer and team lead progress, expressions of interest, notes.
  `?date=` (default today), `&topics=`, `&format=text`.
- **Refresh** (top right): pulls the latest set up and roster from the
  server right away instead of waiting for the 30-second check, then says
  "Up to date" or how many spots changed, with the time. It asks for just
  those two sections, answered from the server's memory (no database read),
  so the reply is a few hundred bytes when nothing changed.
- Assigning must feel instant (it once took ~2 seconds; that was unacceptable).

### Waste
- **Log Waste**: tap a product, set quantity, submit; FOH/BOH toggle (its
  own, like Set Ups': tapping one never clears or flips the other); recent
  entries list (last 15 minutes). Products have costs and Spanish names.
- **Scoreboard**: a thermometer of today's waste in dollars against a **daily
  limit** (default $100, set in Manage). **Waste is bad: lower is better**, so
  it reads as a ceiling to stay under — green, amber from 75% of the limit, red
  over it. FOH/BOH split, top items, under-limit streak.
- **Export** (`static/js/waste-export.js`, Tim, Oct 2026): the Export button over
  Recent Entries on the Waste page opens a panel (the same one is in Manage →
  Backup & Data): Today, Last week (Monday–Saturday of the week before),
  This month, Last month or Pick days; FOH + BOH, FOH or BOH; the total,
  entries and FOH/BOH split for those days; Download CSV / Download PDF.
  Nothing is cleared (the log keeps 90 days). Exporting a whole month (both
  sides) saves that month's summary (`wasteMonthlyHistory`) for
  month-over-month comparisons. Spanish beside it on the BOH side.

### Prep Board (cold-side prep: salads, wraps, fruit cups, parfaits)
Build-To sheet, sold counts, prep waste log, insights (stockouts etc.), buffers,
and **Prep Times**: time how long each item takes to make, per person, with
leaderboards (fastest overall and per item). Guardrail: a time must be 5 s–3 h.

### Food Safety Walkthrough
The findings card at the top comes from the assessment PDF upload: the
visit's SAFE report (findings by category with risk, response and the
advisor's note, the visit date, and the last four quarters' performance
levels; a code seen in an earlier quarter the hub holds is marked repeat)
or the "All Findings" list. A speed-of-service export whose "Trans Count
Sos" runs over 20,000 in a day (a mis-set export counts millions, and its
times are off too) is refused with a note to export again with the settings
that give about 1,000–1,400 a day.
Replaces the store's Google Form. The questions are the store's real ones
(transcribed and corrected with Tim's approval; every question phrased so "Yes"
is good). Bilingual. **Temperature targets are still waiting on Tim (TIM-5) —
never invent them.**

### Zone Reset & Walkthroughs (OE)
Two lists, each a set of handoff drop-downs that all start closed (the
current handoff is marked "now"): Zone Reset (open a handoff, then a zone,
for its reset list) and the Leader Transition List. Each zone carries who
owns its reset (from the Set Ups positions, see Set Ups); a zone nobody owns
is red ("No one yet · tap to pick") and the handoff banner counts them; Hand
off inside a zone gives it to someone else on the clock. The OE walkthrough is
kept but hidden; the Food Safety Walkthrough has its own page and no longer
appears here. A daily safe count is its own page too: cashier tills, coin
rolls (entered as rolls: quarters $10, dimes $5, nickels $2), loose coin, and
bills entered as the **dollar amount in each denomination** (seventeen $20s is
340; the row shows the bill count, or flags an amount that isn't a multiple).

### Scoreboards
Waste (above), Guest Obsession (CEM survey scores from the monthly upload), TX
(talent: events, trainers in trial, competitive for certification,
celebrations), LX (leadership pillars/metrics), plus custom trackers managers
define. Operational insights are **rule-based only** — computed from the app's
own data, never guessed or narrated.

### Forecast (managers)
Sales & Labor Forecast tab (full site only; the history is manager-only, so a
device without the PIN sees a gate). Baseline = a blend of two models: that
weekday's average over the look-back window (default "Best fit": the
backtest over the last 28 open days gives each weekday the window, 4/8/12/26
weeks, that was closest for it, or the leader fixes one), carried forward by a
straight-line weekly trend (full weeks only, capped at ±5%/week), and the
same weekday a year ago (364 days back, from the DayTrack export) × this
year's run-rate against last year over the window. The blend weight comes
from the backtest over the last 28 open days ("Best fit") unless the leader
picks a fixed mix; a day the store was closed a year ago is flagged and uses
the weekday figure. Unusual days are left out of the averages and run-rate
(a day with a special event in Know the Numbers, or one more than 30% from
its weekday's median once that weekday has 4 open days); the weekday median
stands in for them in the trend, Patterns lists them, and a switch turns
the rule off. A special event typed for a day ahead shows on its forecast
row. A per-day or every-day adjustment %
for games, holidays, weather; labor hours from a $-per-labor-hour target or
labor % ÷ average wage. Patterns (KPIs, weekly trend, weekday averages),
Accuracy (backtest of the model on days already lived), Channels (sales by
destination), Data (what's loaded, add a file, remove all). Settings and
adjustments are shared across devices; adjustments for past days fall away.
**Send to Know the Numbers** previews each open day split into the four
Know the Numbers dayparts. The split follows a **daypart mix** Tim can set by
hand (four percentages); otherwise **the weekday's own mix learned from the
weekly "sales by weekday and daypart" export** (Data Uploads; the last 12
weeks kept, a weekday needs 3); otherwise the weekday's hourly sales shape
from the productivity-by-hour report; otherwise **Buda's typical mix**
measured from four weeks of those exports (Breakfast 16%, Lunch 30%,
Afternoon 19%, Dinner 35%: breakfast and the afternoon quiet, dinner the
biggest). The daily sales-by-destination export also hands the forecast
each day's last-year figure (same weekday a year back) from its change %. Each daypart's
**productivity goal follows its usual productivity** around the day's
$/labor-hour target (breakfast about 0.75×, lunch 1.16×, afternoon 1.03×,
dinner 1.06×, or the weekday's own ratios from the report), unless the flat
"one goal all day" option is chosen. Then it writes projected sales and
goals — special events are never touched. Manage → Know the Numbers has
a "Fill from the Forecast" button that opens that preview. Every day sent is
kept in a forecast log (private, 120 days) and scored on the Accuracy tab's
"Your track record" once its actual lands: sent vs model-alone accuracy,
how many adjusted days the adjustment helped, and which way the sent
forecast leans.
No sample data, ever — an empty history shows an empty page.
**The Forecast tab's layout** (audited Oct 2026): Start and Days are the
only controls out in the open; the look-back window, model and labor target
sit behind a Settings line that reads back what's set ("weekday average ·
$175 / labor hour") and stays open across redraws. The adjust row has no 0%
chip (Reset does that). On a phone the forecast table keeps Day, Adjustment,
Forecast and Hrs; Last year, Baseline and Transactions are desktop columns
(`fc-hide-sm`), so nothing clips. The Accuracy tab reads top to bottom: Your
track record (what was sent), The model on its own (the backtest's figures,
chart and days), then How the model was chosen (the window and mix tables).
A KPI's tone colors its figure, never its note, and the Sales by week chart's
floor sits just under the data rather than at $0, so three close weeks don't
draw as a flat line.


### Uniforms (managers only, for now)
The uniform order form (`static/js/uniform-orders.js`), moved in from
Connecteam (Tim, Oct 2026). Same questions as the Connecteam form: full name
(typed, or picked from this week's schedule), role (Team Member, Trainer, Team
Leader), split payment between two checks, then the items by section
(Outerwear for Women, Outerwear for Men, Pants/Shorts/Skirts, Accessories,
Shoes) with color, size and quantity. Buda FSU only, so no store question.
The order comes out of the team member's paycheck once it's placed; the
total shows, and the two-check split when asked for (the first check takes
the odd cent).

Leaders only for now (the tab is `.manager-only`): a leader fills it in with
the team member. The Orders side lists them New → Ordered → Handed out, with
Undo and Delete and a CSV (one row per item) for placing the order and for
payroll. The items, prices, colors and sizes are edited in **Manage →
Uniforms**; until then the list is the six women's outerwear items
Connecteam's form showed (Tim's PDF), and the rest are added there, never
guessed. Each order keeps the item names and prices as ordered.
`uniformOrders` and `uniformCatalog` are in the private `orders` section:
only a manager session is sent them or can change them.

### Calendar (managers only, for now)
The store's events calendar (`static/js/events.js`), its own tab, drawn like
the printed calendar the store hands out: the month in big coral type, the
week grid with Sundays shaded, each event in its key color (Red = App, Blue =
Food Distribution, Purple = Cow in Community, Orange = In-Store Event, Green =
Drive Thru Event, Black = Social; heads-ups like "No School" in dark gray),
events that run several days as a bar across the week, the month's goals in
the first Sunday, the Pre-Checklist and each event's notes beside the grid,
the key underneath. Tap a day for everything on it. The tab is only for
looking: events are added, changed and deleted in **Manage → Events
Calendar** (behind the PIN; Tim, Oct 2026), including the month's goals and
Pre-Checklist. On a phone the grid shows titles only and the goals sit above
it. Set Ups shows the same events by itself, nothing retyped: an Events strip
above the cards for all-day ones and a chip on each daypart card an event overlaps.

**Reading the month's calendar image** (`static/js/events-import.js`, Tim,
Oct 2026): Manage → Events Calendar → "Read a calendar image" takes the PNG
or JPG of the marketing calendar template and lists what's on it: each
day's events (the kind from the ink color, the key's colors), bars that run
across days as one event with an end date (a bar continued on the next row
is one event), times ("6-7 PM", "3pm-6pm", "6AM-4PM", "11-8" as store
hours), "Name: detail" split ("12 Days of Christmas: Brownie"), Monthly
Goals, the Pre-Checklist, and the Notes box attached to the events it heads
(headings that match nothing are listed, not added). The month comes from
the title and can be changed. Nothing is added until a manager has checked
the list: every item's type, name, dates, times and detail can be fixed, any
can be unticked; ones already on the calendar and ones written on a grey day
of the next or last month start unticked; a small misread of a name the
calendar already uses ("Community Outreact") takes that name. The words are
read on the device with Tesseract.js (pinned, loaded from jsDelivr only when
an image is picked); the image goes nowhere. Black "CLOSED" and store-hours
lines read as heads-ups, not social posts. Checked against the November and
December 2026 calendars.

**Calendar → Know the Numbers** (Tim, Oct 2026): the short events held at the
store (In-Store, Drive Thru and App events of a week or less: Free Breakfast
Tuesday, Pack the Drive Thru, Family Night, Halloween Week Promo) count as
the special event of each daypart they overlap, beside whatever's typed in
Know the Numbers (`knSpecialEventsText`, typed text first, no repeats).
That reaches the Set Ups numbers line and game plan on every device, Game
Day / Practice Day (a special event is one point toward Game Day), and the
forecast's unusual-day rule (`fcEventFor`). Month-long events (the samples),
Community Outreach, Cow in Community, social posts and heads-ups don't count.
A manager can tick or untick any one event in Manage → Events Calendar
(saved as `kn` only when it differs from the rule); Manage → Know the
Numbers shows each daypart's special events (anything typed earlier plus the
calendar's) under its projection; nothing is typed there any more. The chips on Set Ups skip events
already on the numbers line.

Tim wants it hidden while it's being shaped (Oct 2026): the tab and the Set
Ups chips show only on a device signed in with the manager PIN (the body's
`is-manager` class, `.manager-only`), whether launch mode is on or off; Home
shows none of it. October 2026 is built in, typed verbatim from the store's
calendar (including "-WB (200)", "Buda (300)" and the Pre-Checklist); the
first edit copies it into the saved list. Saved as `storeEvents` in the
manager section, manager-only on the server.

### Directors (managers only)
The week ahead for the director team (`static/js/directors.js`; Tim, Oct
2026), its own `.manager-only` tab, built from what's already in the hub,
nothing retyped. Six sections: **the week at a glance** (each day's leaders
with their hours, the team count, the directors' shifts, and flags in red:
"no leader 2p–10p", "no leader through close", "no roster yet"); **where
directors overlap leaders** (for every director shift, which leaders are on
during it, and leaders no director shift overlaps that week); **needs
attention** (meetings and events a manager marked "Needs a director", each
with who is on the floor at that time; the rest of the week's events in a
line under it); **PEA cadence** (leaders by the last PEA they gave, with the
count in the last 30 days, and team members longest since they received one;
14 days flags red); **the PEA scoreboard** in short (below); and **the
numbers** (the week's forecast and its change vs last year, sent-forecast
accuracy, open uniform orders). "Copy brief" copies the same as plain text
for a message; "PDF" prints it (jsPDF, the same as the Set Ups PDF). This
week / Next week. The header's Brief / Leaders switch opens the leaders.

**Leaders** (`static/js/leaders.js`; Tim, Oct 2026, shaped on his Leader
Notes Calendar page): a profile per leader for the quarter, with a quarter
picker. The **PEA scoreboard** tracks the PEAs the *directors* have
completed *on* each leader (Tim, Oct 2026): one Levelset positional rating
whose rater is on the director list and whose employee is the leader. The
goal is 50 a quarter across the leaders and 12 on each (both in Manage →
Settings → Leaders), with the pace to hit it (expected by today = goal ×
days elapsed ÷ days in the quarter; on pace / behind / hit the goal, a
trophy at the goal), the weeks-in-a-row streak, the quarter's bars week by
week, best week, the split by director, positions rated and the leader's
average score on those PEAs. PEAs a leader receives from another leader
show as "plus N from leaders, not counted"; if no rating in the quarter has
a director as its rater, a red line says to check the director names
against Levelset's. The overview is a card per leader (ring, pips to 12,
streak, focus); tap one for the profile: the **quarter focus** (the growth goals
agreed in the eval, one per line), **notes** (each a Win, Coaching, Watch
or Conversation, dated, by whom, optionally tagged to a pillar; filter by
type or pillar; grouped by month), **Calibrate to the PEC** (the Team
Leader Role Clarity Card plus the leader's role card(s), each pillar with
the notes that evidence it or "no evidence yet", "You are winning when" and
"Expected actions" verbatim from the cards), and **quarter by quarter**
(PEAs, notes and focus per quarter, so a year reads across evals). "Copy
profile" gives the quarter as text for an eval. A director gets no card
unless added to the list. Leaders are the Manage list (name as Levelset
spells it, PEC roles as chips) plus anyone who gave a PEA that quarter or
was rated under a leader role, has notes, or holds a Team Leader shift on
a roster the hub has. `leaderRoster` and `peaGoals` are in the
manager section; `leaderFocus` and `leaderNotes` (`{text, by, ts, date,
type, pec}`) in the private `people` section.

Leaders are the Team Leader shifts on the roster plus whoever is set as
Lead Captain on Set Ups. Directors' time is their **Administrative** shifts
in the HotSchedules export, which the roster import now keeps
(`adminShifts`, in the rosters section) instead of dropping with the other
off-floor rows; the names that count as directors are the list in **Manage
→ Settings → Directors** (seeded Timothy Lane, Kianna Ramos, Casey Howard
"Managing Partner", spelled as HotSchedules spells them; loose match on
spaces and case). A gap is 30 minutes or more with no leader inside open
hours; a day "has a closer" when a leader is on until 9:30pm or later. The
calendar has a **Meeting / leadership** kind (navy) and every event form a
"Needs a director" box. `directors` lives in the manager section and
`leaderNotes` in the private `people` section: only a PIN session is sent
them. Nothing is emailed yet: delivery is copy or PDF until a mail
provider's key is on Render.

### Talent
- **Trainer trial** (30 days) and **Team Lead trial** (90 days) trackers, built
  from the store's Leadership Playbook.
- **PEA ratings** from Levelset (section 4) → Position Strength Map, name
  matching (HotSchedules ↔ Levelset), coverage check, and the **All-Green
  Tracker**.

### Manage (PIN)
One section at a time (Tim, Oct 2026: the nine stacked groups ran thirty
phone screens): chips at the top, Uploads · Numbers · Events · Scoreboards ·
Talent · Waste · PEA · Settings, pick one and only it shows; the device
remembers the last one (`manageShowTab`, manage-and-import.js). Each kind of
data has one home: every file upload is in Uploads (Know the Numbers keeps
its day editor and "Fill from the Forecast"; the numbers template is on the
Uploads row); Guest Obsession figures that come from the CEM and Analytics
Hub uploads show as read-only figures; PEA keeps its reports. Set-once things
live in Settings: Launch mode (one line, "What this means" opens the rest),
the daily waste limit, the Home page text and the Full Backup. Waste holds
the export panel and the item catalog.

**Saves as you go** (no Save buttons): LX, Guest Obsession, the custom
trackers, TX, the waste limit and the Home page save when a field is left and
1.5 s after the last keystroke, taking only the fields that differ from what
the form was drawn with (`mvTake`, TIM-53), so two managers editing different
fields never undo each other; each card's note says when it last saved. A
redraw from another device's changes (`refreshManage`) still waits while a
field holds unsaved typing or the cursor. Long lists start short: Uploads
shows only what's due ("Show the N up to date"), the waste items the first 20
A to Z ("Show all"; search or a category shows every match), and the LX
pillars are a list where tapping one opens its focus, goal and initiatives
(the one open before is saved first).

**Full Backup** (Backup & Data): one tap downloads everything the hub has
saved as one JSON file (`budaopshub-full-backup-<date>.json`). It comes from
the server (`/api/state/export`, managers only), read fresh from Firebase:
every section, including the private ones (PEA, safe counts, people, forecast)
and the whole waste log, plus what other devices saved a moment ago. Never the
manager PIN hash, which lives outside the saved state. If the server can't be
reached it downloads nothing rather than a partial file. The card shows when
this device last downloaded one. (Before Oct 2026 the button saved the page's
own copy, which could miss sections the page hadn't loaded.) There's no
restore button yet; a backup file can be put back by hand if ever needed.

## 4. Rules Tim has decided (keep these unless he changes them)

### PEA tiers and "all green"
- Tiers by average overall score: **Crushing It 2.75–3.00** (green),
  **On the Rise 1.75–2.74**, **Not Yet 1.00–1.74**.
- A position's score = average of that person's **latest 5 ratings** there.
- A "safe pick" = Crushing It on 2+ ratings.
- **All green** = Crushing It in **every position they've been rated in** on
  their side (FOH: iPOS, Bagging, Drinks 1/3, Drinks 2, OMD, Host, Runner;
  BOH: Breader, Primary, Secondary, Machines, Fries, Prep) — the same rule
  Levelset shows. It means **ready for certification or already certified**,
  and pay is tied to it, so **a position never rated doesn't count against
  anyone** and nobody is dropped for going a while without a PEA (Tim, Oct
  2026; earlier the app required every position rated). The app shows how
  many of the side's positions are rated next to each name. Trainers and Team
  Leads aren't counted. Future idea: schedule re-assessments for all-green
  team members who haven't had a PEA in a while, without demoting anyone.

### Zones and leaders
- **FOH zones**: iPOS, Bagging, Drinks, OMD, Host (+ extra hands).
- **BOH zones**: **Primary** (Primary 1–3, Fries, Primary/Machines),
  **Secondary** (Secondary 1–2, Biscuit/Eggs), **Raw** (Breaders, Machines,
  Filters). Prep, dishes, floors, breaks are extra hands.
- **Leader spread** — a Team Lead (else Trainer) in each zone before any zone
  gets a second. FOH order: iPOS → Bagging → Host → Drinks → OMD (iPOS, Bagging,
  Host must have one; the Bagging captain can reach Drinks/OMD). BOH order:
  **Primary → Raw → Secondary**; **Prep is last** (detached from the kitchen).
- **Captain slots**: Team Leads first (those here the whole daypart first),
  then Trainers.
- **Lead Captain** (FOH): a Team Lead; rotates (whoever hasn't led longest
  goes first); never also a zone captain; works Runner if staffing reaches it,
  else Drinks 3 or FC Bagger (whichever zone needs a leader more); DT Bagger 2 in
  the Afternoon. The daypart banner shows just the Lead Captain's name; the
  spot they work shows on its own row (Tim dropped the "· iPOS 1" label).
- **Rotation**: don't put someone (especially a leader) in the same zone as
  their last worked day.
- **Outside time**: iPOS and OMD are outside; nobody outside more than **3.5
  hours in a row**, and ideally not two dayparts running.
- **Handoffs**: someone leaving mid-daypart hands their spot to someone
  arriving (from an hour before to 30 min after they leave), so the spot never
  sits empty. Arriving/leaving within 10 min of the edge counts as the whole
  daypart.

### Develop this shift / Plan B / Evaluate
- **Game Day vs Practice Day**: busy shifts (events, high numbers) are Game
  Days; leaders can override. Practice Days place development picks on
  positions they aren't green in yet; Game Days only allow "On the Rise" picks.
- **Develop picks** favor: stalled positions, close to all green, overdue PEAs,
  Not Yet in today's positions, positions not worked lately. Pair each with a
  Trainer (then a Crushing It team member, then a Team Lead).
- **Plan B**: if someone falls behind — send a coach (Trainers first: one on
  the same position, then an unplaced one) or swap someone stronger in.
- **Evaluate**: score a finished set up — risks (weak captains, Not Yet in key
  spots), leadership (coverage, stacking, rotation), marked out of date when
  the set up changes.

### Breaks (per side, FOH and BOH separately)
- Shifts of **6+ hours** get a **30-minute** unpaid break (nothing special for
  minors yet).
- Near the middle of the shift; **earlier is better than later**.
- **No breaks 10:00–10:30 or 12:00–1:00**; not in someone's first or last 2 hours.
- **Up to 2 people off at once, staggered 10–15 minutes**, so no one waits
  more than ~15 min for someone back if breaks must pause.
- Keep breaks out of the busiest hours (from the productivity upload).
- Don't send two Team Leads off together.
- The roster card on Set Ups carries each person's **break timer** (Start
  break → 30-minute countdown with the time they're back → Break done, undo).
  The simplified site (launch mode) has the timer too; the **planned break
  times stay off it** until Tim is ready to roll them out to the team.
- The roster card switches between **All** and **Breaks left** (Tim), each
  with a count: Breaks left lists people on 6+ hours whose break isn't done,
  including anyone on break now (timer and all). Shorter shifts aren't owed a
  break, so they're left out; when everyone's done it says so. The choice is
  remembered on the device and works in launch mode too. The switch stays
  pinned to the top of the roster list as it scrolls (Tim).
- **Breaks belong to their day.** A break is kept under the person and the
  date it was taken. Only today's roster has the break buttons; another day
  shows "Break done" (read-only) only for a break actually taken that day.
  (Fixed Oct 2026: the roster looked breaks up under today's date whatever
  day it showed, so a later day of someone's week read "Break done" once
  they'd had today's, and removing someone from another day cleared today's
  break. The saved breaks were never wrong, only how they were read.)

### Recurring FOH tasks (Tim confirmed these times)
8:00 restroom check · 9:30 lemonades for lunch · 10:00 restroom full reset ·
10:15 trash reset · 2:00 restroom full reset · 2:15 restock · 2:45 trash to the
dumpster · 3:15 lemonades for dinner · 8:30 restroom full reset · 8:45 trash
reset · 9:00 restock for tomorrow.

## 5. Data coming in (Manage → Data Uploads)

One drop zone that recognizes each file, plus per-source status (fresh / due /
overdue) and an upload button per report.

| Source | From | Feeds |
|---|---|---|
| Weekly roster (CSV) | HotSchedules | Who works when, FOH/BOH, Team Leader shifts, truck shift, directors' Administrative shifts (Directors tab) |
| Projected sales & goals | The Forecast tab (Send to Know the Numbers), or a spreadsheet | Know the Numbers, Set Ups game plan; no file needed with the forecast |
| Actual sales & productivity per daypart | Typed into Manage → Know the Numbers after the daypart (Analytics Hub's figures) | Plan vs actual on Know the Numbers and the Set Ups card; kept a year with the plan |
| PEA ratings (PDF) | Levelset | Position strength, all green, Set Ups tools |
| CEM (xlsx) | Guest survey reports | Guest Obsession scoreboard, CEM trends |
| Productivity (CSV) | Daypart productivity report | Busy hours for breaks |
| Sales Mix (CSV) | Daily items sold | Prep Board build-to |
| Sales by destination (CSV) | Analytics Hub sales by day by destination | Forecast channel mix; the WIG only when it reaches a later day than DayTrack (monthly is enough once DayTrack is weekly) |
| DayTrack Table (CSV) | Analytics Hub → DayTrack → Table, a row per business date | Forecast: sales this year and last, labor hours, wage, labor %, check average · Guest Obsession WIG (MTD / YTD sales and % vs last year, from the rows; YTD once the history reaches Jan 1) |

- Sales Mix needs a date (picked if the file doesn't say), and a **duplicate
  guard**: flag a file identical to another day's within the last 2 weeks.
- Show what's been uploaded per day/month so gaps and mistakes are obvious
  (calendars for Sales Mix, a month grid for CEM, weekday squares for
  productivity).
- Uploads overlap safely (PEA: a rating already saved is skipped).

## 6. Non-negotiables

- **Never fabricate** financial data, food-safety content, or anything
  presented as real. Missing inputs are asked for, not guessed.
- **Phone numbers** in the HotSchedules export are never read or stored.
- **Real employee data** and uploaded files are for testing only — **never
  committed** to the repo. Build and demo with sample/fake data.
- **Manager-only data** (products, targets/limits, scoreboards, PEA data,
  upload settings) can only be changed with a manager session — enforced on
  the server, not just hidden in the page.
- The manager PIN is stored hashed, can't be read or overwritten through the
  app, and login is rate-limited.
- **Spanish next to the English on everything the kitchen (BOH) team sees**
  (Tim, Oct 2026): the BOH side of Set Ups and Waste, Food Safety, the Prep
  Board with its timers, and the header's initials prompt. **FOH stays
  English-only** to keep it uncluttered (Tim): on the FOH side of Set Ups and
  Waste, and the sheets they open, the Spanish is hidden (`esSyncSides` sets
  `es-off-setups` / `es-off-waste` on the page). The tabs and the FOH/BOH
  switch keep their small Spanish labels, as before. All of it
  comes from one glossary, `static/js/spanish.js` (informal "tú", as the
  Waste tab's help line was), so a bilingual leader can fix a word in one
  place. BOH stations translate word by word ("Breader 2" → "Empanizador
  2"); FOH spots stay English-only rather than half-translated. Spanish
  shows as a quiet italic line under the English (`.es`, `.es-line`).
  `tests/test_spanish.py` fails if a screen asks for a phrase the glossary
  doesn't have, or a BOH station or daypart has no Spanish. Home quotes stay
  English: they must be verbatim and sourced, and a translation isn't.
- **Every change goes through a pull request; Tim says "merge".** Linear
  project "CFA Ops Hub" (team "Tim Lane") holds the backlog.

## 7. Lessons learned (requirements, whatever the stack)

- **Concurrent editing is the hard part.** Early versions saved whole copies
  and one phone could overwrite another's work. Today: each save sends only
  what changed and the server applies it to the latest data; others' changes
  arrive within ~30 s or on returning to the app; redraws wait while someone
  is typing or has a pop-up open. Any rebuild must match this, tested with
  several devices at once.
- **A phone that couldn't load the data must never overwrite it** when it
  reconnects.
- **Old tabs linger** on phones for days; the app offers a reload when a new
  version is live.
- **Cost**: the database bills downloads (~$1/GB on Firebase Blaze). The saved
  data is ~330 KB and growing; page loads and refresh checks must stay cheap
  (replies are compressed; refresh checks read from server memory).
- **Hosting today** is Render's free plan: sleeps after 15 minutes idle (slow
  first load), one server process (the in-memory copy depends on that).
- **Phones cap local storage** (~5 MB); never let a full local copy block a save.
- **Mobile layout**: no horizontal scrolling at 390 px; tap targets sized for
  a rush.

## 8. Open items

- Food-safety temperature targets (TIM-5) — waiting on Tim.
- Spanish: a bilingual leader to read over `static/js/spanish.js`, the BOH
  station words especially ("Empanizador", "Primario", "Papas"), and the
  food safety zone "Boards Zone" = "Zona de Pantillas" (not a Spanish word;
  "Zona de Tablas"?). Zone Resets, Safe Count, Home and Manage aren't
  translated yet (FOH or leader screens).
- Hire dates for tenure in Develop (TIM-38) — waiting on the employee list.
- Firebase: confirm the plan, add a budget alert, turn on 2-step verification
  before Oct 20, 2026.

## 9. For a fresh-look session

**Goal:** see whether a clean slate would make a better product — clearer,
faster, calmer to use mid-rush, more consistent — while keeping every rule
above.

**How to work:**
1. Read this brief, then skim the current app for what's there (it's live;
   the code is in this repo).
2. Talk to Tim about what's working and what isn't before designing.
3. Propose first: information architecture, key screens (Set Ups on a phone
   above all), and — only if it's worth it — the stack.
   Figma is connected — sketch screens there first if that's faster to react to.
4. Build a **clickable prototype on its own branch**, deployed to a preview
   (Netlify is connected), with **sample data only**. Don't touch `main`, the
   live site, or the live database.
5. Compare with the current app side by side; Tim decides what to adopt —
   the whole thing, or the best ideas ported back.

**Judge it by:** how fast a leader can set up a daypart on a phone; whether a
team member understands a screen in two seconds; nothing lost with several
people editing; cost and reliability on a small budget.
