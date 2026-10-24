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
