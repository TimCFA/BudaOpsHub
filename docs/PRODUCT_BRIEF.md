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

### Set Ups (positioning) — the most-used, most rule-heavy area
Assign team members to positions for each daypart, FOH and BOH.

- **Dayparts** — FOH: Early Breakfast 6–8, Breakfast 8–11, Lunch 11–2,
  Transition 1–2, Afternoon 2–5, Dinner 5–8, Close 8–10. BOH: Early Breakfast
  6–8, Breakfast 8–10:30, Mid 10:30–2, Afternoon 2–5, Dinner 5–8, Close 8–10.
- **Priority**: each daypart's position list is in priority order. With N people
  on shift, positions 1–N should be filled; an empty one in that range is
  "needed", extras fold away.
- **Who's working** comes from the weekly HotSchedules roster (see Data
  Uploads). Shifts that start or end mid-daypart are handled (see handoffs).
- **Names** show first name only; last initial only when first names collide;
  compound last names shown as initials where Tim asked.
- **Views**: a quick sheet (default) and a coach board with zones, tiles,
  person cards, and tools. Printable.
- **Tools**: Fill (auto-assign), Develop this shift, Plan B, Evaluate, Lead
  Captain. See the rules in section 4.
- **Breaks & tasks** per daypart (section 4).
- Assigning must feel instant (it once took ~2 seconds; that was unacceptable).

### Waste
- **Log Waste**: tap a product, set quantity, submit; FOH/BOH toggle; recent
  entries list (last 15 minutes). Products have costs and Spanish names.
- **Scoreboard**: a thermometer of today's waste in dollars against a **daily
  limit** (default $100, set in Manage). **Waste is bad: lower is better**, so
  it reads as a ceiling to stay under — green, amber from 75% of the limit, red
  over it. FOH/BOH split, top items, under-limit streak.
- **Monthly close-out** (Manage): export CSV + PDF of the month, then reset.

### Prep Board (cold-side prep: salads, wraps, fruit cups, parfaits)
Build-To sheet, sold counts, prep waste log, insights (stockouts etc.), buffers,
and **Prep Times**: time how long each item takes to make, per person, with
leaderboards (fastest overall and per item). Guardrail: a time must be 5 s–3 h.

### Food Safety Walkthrough
Replaces the store's Google Form. The questions are the store's real ones
(transcribed and corrected with Tim's approval; every question phrased so "Yes"
is good). Bilingual. **Temperature targets are still waiting on Tim (TIM-5) —
never invent them.**

### Zone Reset & Walkthroughs (OE)
Checklist tiles per zone/category and daypart, the OE walkthrough, the leader
transition list, and a daily safe count.

### Scoreboards
Waste (above), Guest Obsession (CEM survey scores from the monthly upload), TX
(talent: events, trainers in trial, competitive for certification,
celebrations), LX (leadership pillars/metrics), plus custom trackers managers
define. Operational insights are **rule-based only** — computed from the app's
own data, never guessed or narrated.

### Talent
- **Trainer trial** (30 days) and **Team Lead trial** (90 days) trackers, built
  from the store's Leadership Playbook.
- **PEA ratings** from Levelset (section 4) → Position Strength Map, name
  matching (HotSchedules ↔ Levelset), coverage check, and the **All-Green
  Tracker**.

### Manage (PIN)
Data Uploads, Know the Numbers, Talent Development, Scoreboards, Home Page,
Waste Tracking (limit, products), PEA Ratings, Backup & Data.

## 4. Rules Tim has decided (keep these unless he changes them)

### PEA tiers and "all green"
- Tiers by average overall score: **Crushing It 2.75–3.00** (green),
  **On the Rise 1.75–2.74**, **Not Yet 1.00–1.74**.
- A position's score = average of that person's **latest 5 ratings** there.
- A "safe pick" = Crushing It on 2+ ratings.
- **All green** = Crushing It in **every** position of their side (FOH: iPOS,
  Bagging, Drinks 1/3, Drinks 2, OMD, Host, Runner; BOH: Breader, Primary,
  Secondary, Machines, Fries, Prep). It means **ready for certification or
  already certified** — the goal for every team member not yet certified.
  **A position never rated is not green.** Trainers and Team Leads aren't counted.

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
  the Afternoon.
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
| Weekly roster (CSV) | HotSchedules | Who works when, FOH/BOH, Team Leader shifts |
| PEA ratings (PDF, or the "Sync from Levelset" button) | Levelset | Position strength, all green, Set Ups tools |
| CEM (xlsx) | Guest survey reports | Guest Obsession scoreboard, CEM trends |
| Productivity (CSV) | Daypart productivity report | Busy hours for breaks |
| Sales Mix (CSV) | Daily items sold | Prep Board build-to |

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
