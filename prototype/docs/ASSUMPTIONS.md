# What this prototype assumes

Tim approved building on these guesses on Sep 29, 2026. Any of them can be
overruled; each one changes a specific screen, noted in brackets.

## Decided by Tim

- **Outside rule.** A 30-minute break does not reset the outside clock. A
  daypart outside is followed by a daypart inside, unless it is the person's
  last daypart of the shift. [Set Ups flags]
- **Transition merged into Lunch.** Lunch runs 11:00–2:00. The "At 1:00" strip
  lists who leaves, who takes over and which spots close, because 3–4 people
  leave in the 1 o'clock hour. [Set Ups strip]

## From Casey's feedback

- Show less at once. The name carries its PEA score for that position in its
  tier colour; ★ when getting a PEA there today; blank when never rated. Tap
  the name for the profile. Trainers and Team Leads show a role tag, no score.
- One "Keep an eye on" line for the day. Develop, Evaluate and Plan B stay a
  tap away and are trimmed to: people leaving mid-daypart, who is being
  developed, and rotation gaps.

## Guesses still to confirm

1. **Whose phone.** Leaders use their own phones; team members mostly use
   shared tablets. [More → Who's using this phone]
2. **Identity.** Pick your name from today's roster once per device, no
   passwords. Rights come from the roster (TL / Trainer) and the manager PIN.
   The real app would also require a one-time device code so the URL alone
   does not open the data. [More, header chip]
3. **Team members are read-only on Set Ups** and never see PEA tiers. They get
   "Mi puesto / My spot". [Mi puesto screen]
4. **The 10:50 moment.** Lunch starts by carrying Breakfast forward, then Fill
   for the gaps. Carry-forward is a state, not a second button. [Set Ups header]
5. **Warn at the tap.** Flags appear on the row the moment someone is placed;
   never a blocking dialog. Evaluate becomes "show me all flags". [Set Ups rows]
6. **Breaks.** "Off now / next / cover" on the Set Ups screen; a hand-moved
   break sticks and shows on the other leader's phone. [Lead Captain card]
7. **Spanish.** A real per-device switch with Spanish as the main line; the
   wording here is a draft for a bilingual Team Lead to review. [Mi puesto, Tasks]
8. **Tasks belong to a position** (Restrooms → Host 1, Restock → Host 2,
   Trash → Runner, Lemonades → Drinks 1). Zone Reset uses the Set Ups
   dayparts. [Tasks]
9. **Waste shows counts** until item costs are uploaded; months archive
   automatically in the real app. [Waste, Scores]
10. **Uploads happen from the office desktop**; phone Manage shrinks to the
    daily basics. [More → Manage]
11. **Hosting** moves to an always-on plan so the server never sleeps; the
    sync model (per-section patches, never overwrite from a phone that could
    not load) is kept from the current app. [not visible here]

## What the prototype fakes

- Saving: a 600 ms delay, then "Saved". Rows are grey and italic until then.
- Other people's changes: none arrive; the real app polls every 30 s.
- The clock: a demo clock under More, default Saturday Oct 3, 10:52.
- PEA ratings, roster, products and history are invented sample data with
  fake names. Every product cost is 0 on purpose.
