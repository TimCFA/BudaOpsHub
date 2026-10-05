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
