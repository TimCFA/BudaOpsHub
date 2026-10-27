# Day Book

`/day-summary` (`.claude/commands/day-summary.md`) writes each day's recap into
the **Day Book**, one interactive page Tim keeps:

    https://claude.ai/artifact/5eQw4GwttSD4jXtBZ5t3Pv

The page is private to Tim. It shows one day at a time (a day picker holds
every day written so far): what went live by area of the hub, bugs found and
fixed, what's waiting on Tim, the to-do list, and ideas parked for later. On
it Tim can flag items to work on ("My picks"), write a note against any item,
ask Claude to develop an item into a short plan, ask Claude for five more
ideas or to-dos, add his own ideas, and remove Claude's suggestions.

`day-book.html` is the page's source. `example-2026-10-25.json` is the first
day written, every field used.

## Where the data lives

The page keeps its data in the artifact's database (the `db` capability), not
in the page. `/day-summary` writes it with the `ArtifactData` tool against the
URL above. Two collections:

**`days/<YYYY-MM-DD>`** — one document per day.

| Field | What it holds |
|---|---|
| `date` | "2026-10-25" |
| `headline` | A few words: "14 merges, the biggest day yet" |
| `merges` | Number of merges to `main` that day (a batch counts once) |
| `build` | The live server's `build` at the time of the check (12 characters) |
| `buildMatches` | `true` / `false` whether that build is the day's last merge; leave out if not checked |
| `liveCheck` | One or two sentences on the live checks and anything they caught |

**`items/<YYYY-MM-DD>-NN`** — one document per entry, `NN` two digits in
page order (01, 02, …). Entries another session, Tim or Claude add from the
page get generated ids instead, so this scheme never collides with them.

| Field | What it holds |
|---|---|
| `day` | The day's id, "2026-10-25" (the page filters on it) |
| `kind` | `shipped`, `fixed`, `waiting`, `todo` or `idea` |
| `area` | One of: Home / Right Now, Set Ups, Schedule, Waste, Our Team, Sign-in, Manage, Food Safety, Prep Board, Behind the scenes, Other |
| `title` | A few words a store leader reads on a phone |
| `body` | One to three sentences: what it does for the team, not how the code works |
| `pr` | PR numbers with `#`, space-separated ("#239 #241"), or "" |
| `time` | When it went live, Central ("4:54 PM"), or "" |
| `ref` | A Linear id ("TIM-104") or "" |
| `order` | Position within the day; the page sorts on it |
| `source` | `session` for entries `/day-summary` writes (`tim` and `claude` are the page's own) |
| `createdAt` | ISO timestamp |
| `picked`, `notes`, `expansions` | Tim's. Write `false`, `""`, `[]` on create and **never overwrite them** on a re-run |

## Re-running a day

A day can be written more than once (a second session, or after more merged).
Query `items` where `day == <date>` first. Update an existing `<date>-NN`
document with `update` and its `if_version`, sending only the fields the
session owns (`kind`, `area`, `title`, `body`, `pr`, `time`, `ref`, `order`);
`update` merges, so `picked`, `notes` and `expansions` stay. Create new ids
for new entries. Never delete an entry: Tim may have notes on it.

## Changing the page

Edit `day-book.html`, then publish it with the Artifact tool passing the URL
above as `url` (read it first with `action: "read"`), so the link and the data
stay. The capabilities it declares: `{"db": {}, "user": {}, "sample": {}}`.
Keep the hub's look (theme-cfa.css: red for actions, navy stat tiles, ivory
ground, Zilla Slab and Figtree, line icons, light and dark).

No team members' names, PINs or other personal details go into the Day Book.
