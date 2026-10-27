# TaskHub

A self-contained task delegation module: boards with columns, tasks with
assignees, due dates, priorities, labels and checklists, a delegation flow
(assign → accept → blocked / done), comments, an activity log, per-person
notifications, and a "My Tasks" view. Flask + SQLite on the back, vanilla JS
on the front. No build step, no external services.

## Run it standalone

    python3 -m taskhub                 # http://localhost:5055/taskhub/  (seeded demo data)
    python3 -m taskhub --no-seed       # empty database
    python3 -m taskhub --db ops.db --port 8000

Pick who you are in the top bar ("I am"). That stands in for a login until the
module is wired to real authentication.

## Tests

    python3 -m unittest tests.test_taskhub

## How it fits into a host app

The module exposes one Flask blueprint. The host provides one function that
returns the current member's id:

```python
from taskhub import create_blueprint

app.register_blueprint(create_blueprint(
    db_path="taskhub.db",
    resolve_member=lambda: session.get("member_id"),  # whatever the host's auth is
))
```

Everything is then served under `/taskhub/` (page) and `/taskhub/api/...`
(JSON). Members are created through the API (`POST /taskhub/api/members`)
or by the host at login, using the host's own user ids as member ids so
assignments line up with real accounts.

Styling is namespaced (`th-*`) and driven by CSS variables on `:root`
(`--th-accent`, `--th-bg`, `--th-font`, …), so the host can re-skin it by
overriding those variables after `taskhub.css` loads.

## Layout

| File | Role |
| --- | --- |
| `store.py` | SQLite persistence. The only file with SQL in it. |
| `service.py` | Business rules: delegation flow, activity, notifications, views. |
| `api.py` | HTTP routes. Thin: parse, call the service, return JSON. |
| `seed.py` | Demo data for the standalone app. |
| `static/taskhub.js` | The UI: board (drag and drop), list, My Tasks, task drawer, notifications. |
| `static/taskhub.css` | Styles, light and dark, phone layout. |
| `templates/taskhub.html` | The single page. |

## The delegation flow

| Action | Who | Status after | Who gets notified |
| --- | --- | --- | --- |
| Create with assignee | anyone | open | assignee |
| Accept | assignee (or a leader) | accepted | creator |
| Pick up (unassigned task) | anyone | accepted, assigned to them | creator |
| Blocked… (with a reason) | assignee | blocked | creator |
| Unblock | assignee | accepted | creator and assignee |
| Complete, or drag to a Done column | assignee | done | creator |
| Reopen, or drag out of Done | anyone | open | creator and assignee |
| Reassign | anyone | open | new assignee, previous assignee |
| Comment | anyone | unchanged | everyone on the task except the author |
| Edit title / due / priority / labels / checklist | anyone | unchanged | assignee |

Roles: `admin` and `leader` can accept on someone's behalf and delete any
task; `member` can delete only tasks they created.

## API summary

All under `/taskhub/api`. Identify yourself with the `X-Taskhub-Member`
header (or `?me=` for GET) until real auth is wired in.

- `GET  /bootstrap` → me, members, boards, unread count
- `GET|POST /members`, `PATCH /members/<id>`
- `GET|POST /boards`, `GET|PATCH /boards/<id>`, `POST /boards/<id>/columns`,
  `PATCH|DELETE /boards/<id>/columns/<col>`
- `GET  /boards/<id>/tasks`
- `POST /tasks`, `GET|PATCH|DELETE /tasks/<id>` (PATCH accepts `version` and
  returns 409 if the task changed underneath you)
- `POST /tasks/<id>/move` `{column_id, before_id?, after_id?}`
- `POST /tasks/<id>/assign|accept|block|unblock|complete|reopen`
- `GET|POST /tasks/<id>/comments`, `GET /tasks/<id>/activity`
- `GET  /my-tasks` → `{assigned: {overdue, today, week, later, none, done}, delegated}`
- `GET  /search?q=&assignee=&status=&label=&board=&priority=`
- `GET  /notifications`, `POST /notifications/read` `{ids?}`

## Not in phase one

Recurring tasks, templates, attachments, email or push notifications,
real-time sync (the page polls every 15 seconds), reporting. Each has a
clean place to land: the service layer for rules, the notification table
for delivery channels.
