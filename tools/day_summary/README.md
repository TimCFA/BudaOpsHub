# Day recap page

`/day-summary` (`.claude/commands/day-summary.md`) writes the day's recap as a
page in the hub's look: `template.html` with the day's facts as JSON in place
of `__DAY_JSON__`. `example-2026-10-25.json` is a full day, every field used.

The JSON:

| Field | What it holds |
|---|---|
| `dayLong` | "Sunday, October 25" |
| `lede` | One or two sentences: the day in plain words |
| `stats` | Up to four `{n, label}`: merges, bugs fixed, and one or two numbers that mattered that day |
| `tomorrow` | `{title, how}`: what Tim or the leaders do before the next shift (shown first) |
| `areas` | `{name, items: [{when, pr, title, what, by?}]}` by area of the hub; `by` marks work from another session |
| `bugs` | `{title, pr, was, fix}` |
| `waiting` | Decisions and merges waiting on Tim, one line each |
| `later` | Ideas Tim liked and asked to hold, a few words each |
| `deploys` | `{when, pr, title, note?}` in order; `note` for anything a live check caught |
| `deployNote`, `foot` | Small print |

No team members' names, PINs or other personal details anywhere in it.
