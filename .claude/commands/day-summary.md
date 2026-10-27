---
description: Write the day's work on the Ops Hub (today by default) into Tim's Day Book page
argument-hint: "[YYYY-MM-DD]  (default: today, Central time)"
---

Write what got done on the CFA Buda Ops Hub on one day into Tim's **Day Book**,
the interactive page at https://claude.ai/artifact/5eQw4GwttSD4jXtBZ5t3Pv
(`tools/day_book/README.md` describes it), then reply with the link and a few
lines. Read-only for the hub and the repo: don't merge, push, comment, change
a setting, or sign in anywhere. The only thing this command writes is the Day
Book's data.

The day is `$ARGUMENTS` if given (YYYY-MM-DD), otherwise today in
America/Chicago (`TZ=America/Chicago date`). "The day" runs midnight to
midnight Central.

## Gather

1. **What went live.** `git fetch origin main`, then list the commits on
   `origin/main` from that day, oldest first, with their Central times:
   `TZ=America/Chicago git log origin/main --since="<day> 00:00" --until="<day> 23:59:59" --reverse --pretty='%h %ad %s' --date=format-local:'%-I:%M %p'`
   Each is a squash merge titled with its PR number. Read each one's commit
   body (`git show -s --format=%B <sha>`), and its PR description and
   comments with the GitHub tools (`pull_request_read`: `get`, then
   `get_comments`), for what changed and why, and for anything the PR says
   was left for later. A batch PR (one that ships several PRs) counts once,
   with the PRs it carried. For a big day, hand this to one agent and keep
   the conclusions.
2. **What's waiting.** Open PRs on timcfa/budaopshub (`list_pull_requests`,
   state open): number, title, and whether each is waiting on Tim (to merge
   or decide) or on more work.
3. **The backlog.** With the Linear tools (`list_issues`, team "Tim Lane"),
   the issues created or updated that day: identifier, title, state, the
   first lines of the description. If Linear isn't reachable, say so in the
   reply and move on.
4. **What's live now.** Read-only: `POST https://budaopshub-sxp9.onrender.com/api/state/sync`
   with body `{"versions":{}}`. Note whether its `build` matches the last
   merge of the day (the first 12 characters of the commit). Don't print or
   keep anything else from the reply: it holds the team's names.
5. **This conversation.** If this session worked on the hub that day, use
   what it holds: Tim's asks, decisions he made, questions still open,
   ideas he said to save for later, bugs found and fixed, and the live
   checks after each merge.

## Write the day

Plain words a store leader reads on a phone: what each change does for the
team, not how the code works. Sort every fact into one of five kinds:

- **`shipped`** — each change that went live, grouped by area of the hub
  (Home / Right Now, Set Ups, Schedule, Waste, Our Team, Sign-in, Manage,
  Food Safety, Prep Board, Behind the scenes). One to three sentences, the
  PR numbers, the time it went live. A change that is only a bug fix goes
  under `fixed` instead, not both.
- **`fixed`** — bugs found and fixed: what went wrong, who it affected, the
  fix. Include what a live check caught.
- **`waiting`** — open PRs and decisions Tim still owes, and anything Tim or
  the leaders must do before the next shift (a device to set up, a role to
  check, a switch to flip, a message to send). Say what to do.
- **`todo`** — work written down that day and not started: Linear issues
  created that day, and follow-ups a PR names as its own next step.
- **`idea`** — things said once and saved for later without becoming a task:
  "could", "maybe", "later", "if we ever", open questions nobody owns yet.
  Keep the words close to how they were said.

Then write it with the `ArtifactData` tool (load it with ToolSearch) against
the Day Book's URL, using the fields in `tools/day_book/README.md` and
`tools/day_book/example-2026-10-25.json` as the pattern:

1. Query `items` where `day == <date>`. If entries exist, this day has been
   written before: keep every existing id, `update` the ones whose text
   changed with their `if_version` and only the session's fields (`kind`,
   `area`, `title`, `body`, `pr`, `time`, `ref`, `order`), and create new
   ids for new entries. Never resend or delete `picked`, `notes` or
   `expansions`; never delete an entry.
2. Write `days/<date>` (`set` on first write, `update` with `if_version`
   after) and the entries `items/<date>-NN` in one `batch` (up to 50 writes
   per call; more days than that take two). Each new entry carries
   `picked: false`, `notes: ""`, `expansions: []`, `source: "session"` and a
   `createdAt`.
3. Read one entry back (`get`) to confirm the write landed.

Then reply with the link and three to five lines: the day in a sentence,
what's waiting on Tim, and the first thing for tomorrow. Say if a day is
still "today" (nothing may have merged yet) or if the live check didn't run.

If the page itself needs a change, that's a separate ask: edit
`tools/day_book/day-book.html` and republish to the same URL as the README
says; this command never republishes the page.

Rules:
- No real employee names, PINs, emails or other personal details: say "a
  team member", "a Team Lead". Tim's own name is fine.
- No model names or identifiers.
- Don't guess: if a time or a result isn't in git, GitHub, Linear or this
  conversation, leave it out or say it's not known.
- A small day gets a small entry list; the page drops any section that's
  empty. A big day gets grouped harder, not padded.
