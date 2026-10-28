# TaskHub: the Tasks tab

Delegation for the leadership team: boards with columns, tasks with a
person, a due date, a priority, labels and a checklist, a delegation flow
(assign → accept → blocked / done) that tells the other side at each step,
comments, an activity log, per-person notifications, and a My Tasks view.

Flask blueprint under `/taskhub/api` (this folder); the screen is
`static/js/taskhub.js` with `static/css/taskhub.css`, mounted into the hub's
`#tasksView` when the Tasks tab opens (`navigation.js` → `thActivate`).

## How it sits in the hub

- **Data** lives in Firebase under `taskhub/<table>/<id>` (tasks, boards,
  comments, activity, notifications, members), read once on a cold start
  and kept in memory like the saved state in app.py. A change writes only
  its own record, so two servers overlapping during a deploy can't wipe
  each other's tasks. It is not part of `STATE_SECTIONS` and never goes
  through `/api/state/sync`; the page polls `/taskhub/api` every 15 seconds
  while the tab is open.
- **Who you are** is the hub's session (app.py `_taskhub_me`): a clock-in
  PIN or Google director by name, the shared manager PIN as "Director".
  Nobody signed in can look at a board but not act; My Tasks asks them to
  sign in. Hub roles map to three here: director / manager / Admin Team →
  admin, Team Lead → leader, Trainer / Team Member → member. Admins and
  leaders may accept on someone's behalf and delete any task; members
  delete only what they created.
- **Who can be given work** (app.py `_taskhub_people`): the PIN list plus
  the Directors list, keyed by `_taskhub_key(name)` (a hash of the name as
  the hub matches names). Someone whose PIN comes off the list keeps their
  name on old tasks but is no longer offered.
- **Look**: the theme's tokens (`--cfa-*`, `--font-display`, `--font-ui`),
  so dark mode follows; the few status tints are set for both modes in
  `taskhub.css`. Line icons only.
- **The tab's count** is what's overdue or due today for whoever is signed
  in, loaded after idle on every page load.
- **Spanish**: an EN / ES switch in the toolbar, remembered per device
  (Tim, Oct 28 2026). On, every label carries its Spanish beside the
  English from the hub's glossary (`static/js/spanish.js`, the Tasks
  section), the way the kitchen screens do; people's own text (titles,
  comments, reasons) stays as typed, and the activity log stays English.
  `tests/test_tasks_tab.py` fails if a phrase the tab asks for is missing
  from the glossary.

## Standalone (no hub, no Firebase)

    python3 -m taskhub                 # http://localhost:5055/taskhub/ with demo people and work
    python3 -m taskhub --no-seed       # empty
    python3 -m taskhub --db ops.json   # data in a JSON file

The demo page has an "I am" picker in place of the hub's sign-in.

## Tests

    python3 -m unittest tests.test_taskhub tests.test_tasks_tab

`test_taskhub.py` covers the rules and the API; `test_tasks_tab.py` the hub
wiring (tab, view, scripts, session → identity, people, Firebase records).

## Files

| File | Role |
| --- | --- |
| `store.py` | Records in memory, written through to a backend: `MemoryBackend`, `JsonFileBackend`, `FirebaseBackend`. |
| `service.py` | The rules: delegation flow, activity, notifications, views, host people and roles. |
| `api.py` | HTTP routes. Thin: parse, call the service, return JSON. 401 without a person, 503 while Firebase can't be read. |
| `seed.py` | Demo data for the standalone app. |
| `templates/taskhub.html` | The standalone page only. |

## The delegation flow

| Action | Who | Status after | Who hears |
| --- | --- | --- | --- |
| Create with a person | anyone signed in | open | the person |
| Accept | the person (or a leader) | accepted | whoever assigned it |
| Pick up (unassigned) | anyone | accepted, theirs | whoever created it |
| Blocked… (with a reason) | the person | blocked | whoever assigned it |
| Unblock | the person | accepted | both |
| Complete, or drag to a Done column | the person | done | whoever assigned it |
| Reopen, or drag out of Done | anyone | open | both |
| Reassign | anyone | open | new and previous person |
| Comment | anyone | unchanged | everyone on the task but the author |
| Edit title / due / priority / labels / checklist | anyone | unchanged | the person |

## API

Under `/taskhub/api`; the session says who you are.

- `GET /bootstrap` → me, host, members, boards, unread
- `GET|POST /boards`, `GET|PATCH /boards/<id>`, `POST /boards/<id>/columns`, `PATCH|DELETE /boards/<id>/columns/<col>`
- `GET /boards/<id>/tasks`, `POST /tasks`, `GET|PATCH|DELETE /tasks/<id>` (PATCH takes `version`; 409 if it changed underneath you)
- `POST /tasks/<id>/move` `{column_id, before_id?, after_id?}`
- `POST /tasks/<id>/assign|accept|block|unblock|complete|reopen`
- `GET|POST /tasks/<id>/comments`, `GET /tasks/<id>/activity`
- `GET /my-tasks?today=YYYY-MM-DD` (the phone's day) → `{assigned: {overdue, today, week, later, none, done}, delegated}`
- `GET /search?q=&assignee=&status=&label=&board=&priority=`
- `GET /notifications`, `POST /notifications/read` `{ids?}`

## Not yet

Recurring tasks, templates, attachments, push or email, a row on Home's
Right Now card, Spanish in the activity log and notifications, reporting.
