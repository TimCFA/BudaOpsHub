---
description: Summarize the work done on the Ops Hub on a day (today by default), for Tim
argument-hint: "[YYYY-MM-DD]  (default: today, Central time)"
---

Summarize what got done on the CFA Buda Ops Hub on one day, for Tim. This is
read-only: don't merge, push, comment, change a setting, or sign in anywhere.

The day is `$ARGUMENTS` if given (YYYY-MM-DD), otherwise today in
America/Chicago. "The day" runs midnight to midnight Central.

## Gather

1. **What went live.** `git fetch origin main`, then list the commits on
   `origin/main` from that day, oldest first, with their Central times:
   `TZ=America/Chicago git log origin/main --since="<day> 00:00" --until="<day> 23:59:59" --reverse --pretty='%h %ad %s' --date=format-local:'%-I:%M %p'`
   Each is a squash merge titled with its PR number. Read each one's commit
   body (`git show -s --format=%B <sha>`), and its PR description and
   comments with the GitHub tools (`pull_request_read`), for what changed
   and why. A batch PR (one that ships several PRs) counts once, with the
   PRs it carried.
2. **What's waiting.** Open PRs on timcfa/budaopshub (`list_pull_requests`,
   state open): number, title, and whether each is waiting on Tim (to merge
   or decide) or on more work.
3. **What's live now.** Read-only: `POST https://budaopshub-sxp9.onrender.com/api/state/sync`
   with body `{"versions":{}}`. Say whether its `build` matches the last
   merge of the day (the first 12 characters of the commit). Don't print
   anything else from the reply: it holds the team's names.
4. **This conversation.** If this session worked on the hub that day, use
   what it holds: Tim's asks, decisions he made, questions still open,
   ideas he said to save for later, bugs found and fixed, and the live
   checks after each merge.

## Write it

In Tim's format, in plain words a store leader reads on a phone. Say what
each change does for the team, not how the code works.

**What we did today** (date, how many merges)
- Group by area of the hub (Home / Right Now, Set Ups, Schedule, Waste,
  Our Team, Sign-in, Manage, behind the scenes). For each change: one line
  on what it does, the PR number, and when it went live.
- Bugs found and fixed: what went wrong, who it affected, and the fix.
- Live checks: one line saying each deploy was checked, and anything a
  check caught.

**Waiting on you**: open PRs and decisions Tim still owes, one line each.

**Saved for later**: ideas Tim liked but asked to hold.

**For tomorrow**: anything Tim or the leaders need to do before or during
the next shift (a device to set up, a role to check, a message to send).

Rules:
- No real employee names, PINs, emails or other personal details: say "a
  team member", "a Team Lead". Tim's own name is fine.
- No model names or identifiers.
- Don't guess: if a time or a result isn't in git, GitHub or this
  conversation, say it's not known.
- Keep it to one screen when the day was small; group harder when it was big.
