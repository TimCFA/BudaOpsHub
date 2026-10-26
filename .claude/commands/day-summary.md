---
description: Summarize the work done on the Ops Hub on a day (today by default), for Tim, as a page
argument-hint: "[YYYY-MM-DD]  (default: today, Central time)"
---

Summarize what got done on the CFA Buda Ops Hub on one day, for Tim, as a
designed page in the hub's look plus a few lines in the chat. Read-only for
the hub: don't merge, push, comment, change a setting, or sign in anywhere.

The day is `$ARGUMENTS` if given (YYYY-MM-DD), otherwise today in
America/Chicago. "The day" runs midnight to midnight Central.

## Gather

1. **What went live.** `git fetch origin main`, then list the commits on
   `origin/main` from that day, oldest first, with their Central times:
   `TZ=America/Chicago git log origin/main --since="<day> 00:00" --until="<day> 23:59:59" --reverse --pretty='%h %ad %s' --date=format-local:'%-I:%M %p'`
   Each is a squash merge titled with its PR number. Read each one's commit
   body (`git show -s --format=%B <sha>`), and its PR description and
   comments with the GitHub tools (`pull_request_read`), for what changed
   and why. A batch PR (one that ships several PRs) counts once. A merge
   from another session is marked `"by": "other session"`.
2. **What's waiting.** Open PRs on timcfa/budaopshub (`list_pull_requests`,
   state open), and whether each waits on Tim or on more work.
3. **What's live now.** Read-only: `POST https://budaopshub-sxp9.onrender.com/api/state/sync`
   with body `{"versions":{}}`. Note whether its `build` matches the last
   merge of the day (the first 12 characters of the commit). Don't print or
   keep anything else from the reply: it holds the team's names.
4. **This conversation.** If this session worked on the hub that day, use
   what it holds: Tim's asks, decisions he made, questions still open,
   ideas he said to save for later, bugs found and fixed, live checks.

## Write the page

Fill the JSON described in `tools/day_summary/README.md` (a full example:
`tools/day_summary/example-2026-10-25.json`) and put it into
`tools/day_summary/template.html` in place of `__DAY_JSON__` (escape `</`
as `<\/`), with the `<title>` set to `Ops Hub Recap · <Mon D>`. Write it to
the scratchpad as `ops-hub-recap-<YYYY-MM-DD>.html` and publish it with the
Artifact tool (icon `report`, a one-sentence description).

Plain words a store leader reads on a phone: what each change does for the
team, not how the code works. Group `areas` by part of the hub (Home and
Right Now, Set Ups, Schedule, Waste, Our Team, Sign-in, Manage, behind the
scenes). Put in `tomorrow` only what someone has to do before the next shift.

Then reply with the link and three to five lines: the day in a sentence,
what's waiting on Tim, and the first thing for tomorrow.

Rules:
- No real employee names, PINs, emails or other personal details: say "a
  team member", "a Team Lead". Tim's own name is fine.
- No model names or identifiers.
- Don't guess: if a time or a result isn't in git, GitHub or this
  conversation, leave it out or say it's not known.
- A small day gets a small page: the page drops any list that's empty.
