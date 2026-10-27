"""TaskHub business rules.

Everything the UI can do goes through here, so the delegation flow (assign,
accept, block, complete, reopen, comment) always writes the same activity and
sends the same notifications no matter which screen triggered it.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from .store import Store, new_id, now_iso

PRIORITIES = ("low", "normal", "high", "urgent")
STATUSES = ("open", "accepted", "blocked", "done")
ROLES = ("admin", "leader", "member")
COLUMN_KINDS = ("todo", "doing", "done")

DEFAULT_COLUMNS = [
    {"name": "To Do", "kind": "todo"},
    {"name": "In Progress", "kind": "doing"},
    {"name": "Done", "kind": "done"},
]


class TaskHubError(Exception):
    status = 400

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        if status is not None:
            self.status = status


class NotFound(TaskHubError):
    status = 404


class Conflict(TaskHubError):
    status = 409


class Forbidden(TaskHubError):
    status = 403


def _parse_due(value):
    """Accept 'YYYY-MM-DD' or a full ISO timestamp; store as given (string) or None."""
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        raise TaskHubError("due_at must be a string")
    try:
        if len(value) == 10:
            date.fromisoformat(value)
        else:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise TaskHubError("due_at must be an ISO date (YYYY-MM-DD) or timestamp")
    return value


def due_bucket(due_at: str | None, today: date | None = None) -> str:
    """overdue | today | week | later | none, relative to the given day."""
    if not due_at:
        return "none"
    today = today or datetime.now(timezone.utc).date()
    d = date.fromisoformat(due_at[:10])
    if d < today:
        return "overdue"
    if d == today:
        return "today"
    if d <= today + timedelta(days=7):
        return "week"
    return "later"


class TaskHub:
    def __init__(self, store: Store):
        self.store = store

    # -- members -----------------------------------------------------------

    def members(self, include_inactive: bool = False) -> list[dict]:
        return self.store.list_members(include_inactive)

    def member(self, member_id: str) -> dict:
        m = self.store.get_member(member_id)
        if not m:
            raise NotFound(f"no member {member_id}")
        return m

    def add_member(self, name: str, role: str = "member", id_: str | None = None) -> dict:
        name = (name or "").strip()
        if not name:
            raise TaskHubError("name is required")
        if role not in ROLES:
            raise TaskHubError(f"role must be one of {ROLES}")
        return self.store.add_member(name, role, id_)

    def update_member(self, member_id: str, data: dict) -> dict:
        self.member(member_id)
        allowed = {}
        if "name" in data:
            allowed["name"] = (data["name"] or "").strip() or None
            if allowed["name"] is None:
                raise TaskHubError("name is required")
        if "role" in data:
            if data["role"] not in ROLES:
                raise TaskHubError(f"role must be one of {ROLES}")
            allowed["role"] = data["role"]
        if "active" in data:
            allowed["active"] = bool(data["active"])
        return self.store.update_member(member_id, allowed)

    def _name(self, member_id: str | None) -> str:
        if not member_id:
            return "Someone"
        m = self.store.get_member(member_id)
        return m["name"] if m else "Someone"

    def can_manage(self, actor_id: str | None) -> bool:
        if not actor_id:
            return False
        m = self.store.get_member(actor_id)
        return bool(m and m["role"] in ("admin", "leader"))

    # -- boards ------------------------------------------------------------

    def boards(self, include_archived: bool = False) -> list[dict]:
        return self.store.list_boards(include_archived)

    def board(self, board_id: str) -> dict:
        b = self.store.get_board(board_id)
        if not b:
            raise NotFound(f"no board {board_id}")
        return b

    def add_board(self, name: str, description: str = "", columns: list[dict] | None = None) -> dict:
        name = (name or "").strip()
        if not name:
            raise TaskHubError("name is required")
        cols = []
        for c in (columns or DEFAULT_COLUMNS):
            cname = (c.get("name") or "").strip()
            if not cname:
                raise TaskHubError("column name is required")
            kind = c.get("kind", "todo")
            if kind not in COLUMN_KINDS:
                raise TaskHubError(f"column kind must be one of {COLUMN_KINDS}")
            cols.append({"id": c.get("id") or new_id("col"), "name": cname, "kind": kind})
        if not cols:
            raise TaskHubError("a board needs at least one column")
        return self.store.add_board(name, cols, description or "")

    def update_board(self, board_id: str, data: dict) -> dict:
        self.board(board_id)
        allowed = {}
        if "name" in data:
            allowed["name"] = (data["name"] or "").strip()
            if not allowed["name"]:
                raise TaskHubError("name is required")
        if "description" in data:
            allowed["description"] = data["description"] or ""
        if "archived" in data:
            allowed["archived"] = bool(data["archived"])
        return self.store.update_board(board_id, allowed)

    def add_column(self, board_id: str, name: str, kind: str = "todo") -> dict:
        b = self.board(board_id)
        name = (name or "").strip()
        if not name:
            raise TaskHubError("column name is required")
        if kind not in COLUMN_KINDS:
            raise TaskHubError(f"column kind must be one of {COLUMN_KINDS}")
        cols = b["columns"] + [{"id": new_id("col"), "name": name, "kind": kind}]
        return self.store.update_board(board_id, {"columns": cols})

    def update_column(self, board_id: str, column_id: str, data: dict) -> dict:
        b = self.board(board_id)
        cols = b["columns"]
        idx = next((i for i, c in enumerate(cols) if c["id"] == column_id), None)
        if idx is None:
            raise NotFound(f"no column {column_id}")
        col = dict(cols[idx])
        if "name" in data:
            col["name"] = (data["name"] or "").strip() or col["name"]
        if "kind" in data:
            if data["kind"] not in COLUMN_KINDS:
                raise TaskHubError(f"column kind must be one of {COLUMN_KINDS}")
            col["kind"] = data["kind"]
        cols[idx] = col
        if "order" in data:
            cols.insert(max(0, min(int(data["order"]), len(cols) - 1)), cols.pop(idx))
        return self.store.update_board(board_id, {"columns": cols})

    def remove_column(self, board_id: str, column_id: str, move_to: str | None = None) -> dict:
        b = self.board(board_id)
        cols = [c for c in b["columns"] if c["id"] != column_id]
        if len(cols) == len(b["columns"]):
            raise NotFound(f"no column {column_id}")
        if not cols:
            raise TaskHubError("a board needs at least one column")
        target = move_to or cols[0]["id"]
        if target not in {c["id"] for c in cols}:
            raise TaskHubError("move_to must be a remaining column")
        for t in self.store.list_tasks(board_id=board_id):
            if t["column_id"] == column_id:
                self.store.update_task(t["id"], {"column_id": target})
        return self.store.update_board(board_id, {"columns": cols})

    def _column(self, board: dict, column_id: str) -> dict:
        for c in board["columns"]:
            if c["id"] == column_id:
                return c
        raise TaskHubError(f"column {column_id} is not on board {board['id']}")

    # -- tasks -------------------------------------------------------------

    def task(self, task_id: str) -> dict:
        t = self.store.get_task(task_id)
        if not t:
            raise NotFound(f"no task {task_id}")
        return t

    def tasks(self, **filters) -> list[dict]:
        return self.store.list_tasks(**filters)

    def create_task(self, actor_id: str | None, data: dict) -> dict:
        title = (data.get("title") or "").strip()
        if not title:
            raise TaskHubError("title is required")
        board = self.board(data.get("board_id") or "")
        column_id = data.get("column_id") or board["columns"][0]["id"]
        column = self._column(board, column_id)
        assignee_id = data.get("assignee_id") or None
        if assignee_id:
            self.member(assignee_id)
        priority = data.get("priority") or "normal"
        if priority not in PRIORITIES:
            raise TaskHubError(f"priority must be one of {PRIORITIES}")
        task = self.store.add_task({
            "board_id": board["id"],
            "column_id": column_id,
            "title": title,
            "description": data.get("description") or "",
            "assignee_id": assignee_id,
            "created_by": actor_id,
            "due_at": _parse_due(data.get("due_at")),
            "priority": priority,
            "labels": self._clean_labels(data.get("labels")),
            "checklist": self._clean_checklist(data.get("checklist")),
            "status": "done" if column["kind"] == "done" else "open",
            "completed_at": now_iso() if column["kind"] == "done" else None,
            "position": self.store.max_position(board["id"], column_id) + 1,
        })
        self.store.add_activity(task["id"], actor_id, "created", {"title": title})
        if assignee_id and assignee_id != actor_id:
            self.store.add_activity(task["id"], actor_id, "assigned", {"to": assignee_id})
            self._notify(assignee_id, task, "assigned",
                         f"{self._name(actor_id)} assigned you: {title}")
        return self.task(task["id"])

    def update_task(self, actor_id: str | None, task_id: str, data: dict) -> dict:
        task = self.task(task_id)
        if "version" in data and data["version"] is not None and int(data["version"]) != task["version"]:
            raise Conflict("task changed since you loaded it; reload and try again")
        changes, events = {}, []
        if "title" in data:
            title = (data["title"] or "").strip()
            if not title:
                raise TaskHubError("title is required")
            if title != task["title"]:
                changes["title"] = title
                events.append(("retitled", {"from": task["title"], "to": title}))
        if "description" in data and (data["description"] or "") != task["description"]:
            changes["description"] = data["description"] or ""
            events.append(("described", {}))
        if "due_at" in data:
            due = _parse_due(data["due_at"])
            if due != task["due_at"]:
                changes["due_at"] = due
                events.append(("due_changed", {"from": task["due_at"], "to": due}))
        if "priority" in data and data["priority"] != task["priority"]:
            if data["priority"] not in PRIORITIES:
                raise TaskHubError(f"priority must be one of {PRIORITIES}")
            changes["priority"] = data["priority"]
            events.append(("priority_changed", {"from": task["priority"], "to": data["priority"]}))
        if "labels" in data:
            labels = self._clean_labels(data["labels"])
            if labels != task["labels"]:
                changes["labels"] = labels
                events.append(("labels_changed", {"to": labels}))
        if "checklist" in data:
            checklist = self._clean_checklist(data["checklist"], keep_ids=task["checklist"])
            if checklist != task["checklist"]:
                changes["checklist"] = checklist
                done = sum(1 for i in checklist if i["done"])
                events.append(("checklist_changed", {"done": done, "total": len(checklist)}))
        if "assignee_id" in data and (data["assignee_id"] or None) != task["assignee_id"]:
            # Reassignment goes through assign() so notifications stay consistent.
            self.assign(actor_id, task_id, data["assignee_id"] or None, _skip_version=True)
            task = self.task(task_id)
        if changes:
            task = self.store.update_task(task_id, changes)
            for kind, detail in events:
                self.store.add_activity(task_id, actor_id, kind, detail)
            if assignee_should_hear := self._other_party(task, actor_id, prefer="assignee"):
                summary = ", ".join(k.replace("_changed", "").replace("retitled", "title") for k, _ in events)
                self._notify(assignee_should_hear, task, "updated",
                             f"{self._name(actor_id)} updated {summary} on: {task['title']}")
        return task

    def delete_task(self, actor_id: str | None, task_id: str) -> None:
        task = self.task(task_id)
        if not (self.can_manage(actor_id) or task["created_by"] == actor_id):
            raise Forbidden("only the creator or a leader can delete a task")
        self.store.delete_task(task_id)

    def move_task(self, actor_id: str | None, task_id: str, column_id: str,
                  before_id: str | None = None, after_id: str | None = None) -> dict:
        """Move within or across columns. Position is derived from neighbours
        so two phones moving at once don't fight over integer slots."""
        task = self.task(task_id)
        board = self.board(task["board_id"])
        column = self._column(board, column_id)
        siblings = [t for t in self.store.list_tasks(board_id=board["id"])
                    if t["column_id"] == column_id and t["id"] != task_id]
        pos = self._position_between(siblings, before_id, after_id)
        changes = {"column_id": column_id, "position": pos}
        events = []
        if column_id != task["column_id"]:
            events.append(("moved", {"from": task["column_id"], "to": column_id, "to_name": column["name"]}))
            if column["kind"] == "done" and task["status"] != "done":
                changes.update(status="done", completed_at=now_iso(), blocked_reason="")
                events.append(("completed", {}))
            elif column["kind"] != "done" and task["status"] == "done":
                changes.update(status="open", completed_at=None)
                events.append(("reopened", {}))
        updated = self.store.update_task(task_id, changes)
        for kind, detail in events:
            self.store.add_activity(task_id, actor_id, kind, detail)
        if any(k == "completed" for k, _ in events):
            self._tell_creator(updated, actor_id, "completed", f"{self._name(actor_id)} completed: {updated['title']}")
        return updated

    @staticmethod
    def _position_between(siblings: list[dict], before_id: str | None, after_id: str | None) -> float:
        by_id = {t["id"]: t["position"] for t in siblings}
        ordered = sorted(siblings, key=lambda t: (t["position"], t["created_at"]))
        if before_id and before_id in by_id:
            idx = next(i for i, t in enumerate(ordered) if t["id"] == before_id)
            prev = ordered[idx - 1]["position"] if idx > 0 else by_id[before_id] - 2
            return (prev + by_id[before_id]) / 2
        if after_id and after_id in by_id:
            idx = next(i for i, t in enumerate(ordered) if t["id"] == after_id)
            nxt = ordered[idx + 1]["position"] if idx + 1 < len(ordered) else by_id[after_id] + 2
            return (by_id[after_id] + nxt) / 2
        return (ordered[-1]["position"] + 1) if ordered else 1.0

    # -- delegation flow ---------------------------------------------------

    def assign(self, actor_id: str | None, task_id: str, assignee_id: str | None, _skip_version=False) -> dict:
        task = self.task(task_id)
        if assignee_id:
            self.member(assignee_id)
        if assignee_id == task["assignee_id"]:
            return task
        previous = task["assignee_id"]
        changes = {"assignee_id": assignee_id}
        if task["status"] in ("accepted", "blocked"):
            changes.update(status="open", blocked_reason="")
        updated = self.store.update_task(task_id, changes)
        self.store.add_activity(task_id, actor_id, "assigned" if assignee_id else "unassigned",
                                {"from": previous, "to": assignee_id})
        if assignee_id and assignee_id != actor_id:
            self._notify(assignee_id, updated, "assigned",
                         f"{self._name(actor_id)} assigned you: {updated['title']}")
        if previous and previous not in (actor_id, assignee_id):
            self._notify(previous, updated, "reassigned",
                         f"{self._name(actor_id)} reassigned '{updated['title']}' to {self._name(assignee_id) if assignee_id else 'nobody'}")
        return updated

    def accept(self, actor_id: str | None, task_id: str) -> dict:
        task = self.task(task_id)
        if task["status"] == "done":
            raise TaskHubError("task is already done")
        if task["assignee_id"] and actor_id != task["assignee_id"] and not self.can_manage(actor_id):
            raise Forbidden("only the assignee can accept this task")
        changes = {"status": "accepted", "blocked_reason": ""}
        if not task["assignee_id"] and actor_id:
            changes["assignee_id"] = actor_id  # picking up an unassigned task
        updated = self.store.update_task(task_id, changes)
        self.store.add_activity(task_id, actor_id, "accepted", {})
        self._tell_creator(updated, actor_id, "accepted", f"{self._name(actor_id)} accepted: {updated['title']}")
        return updated

    def block(self, actor_id: str | None, task_id: str, reason: str) -> dict:
        task = self.task(task_id)
        reason = (reason or "").strip()
        if not reason:
            raise TaskHubError("say what is blocking the task")
        if task["status"] == "done":
            raise TaskHubError("task is already done")
        updated = self.store.update_task(task_id, {"status": "blocked", "blocked_reason": reason})
        self.store.add_activity(task_id, actor_id, "blocked", {"reason": reason})
        self._tell_creator(updated, actor_id, "blocked",
                           f"{self._name(actor_id)} is blocked on '{updated['title']}': {reason}")
        return updated

    def unblock(self, actor_id: str | None, task_id: str) -> dict:
        task = self.task(task_id)
        if task["status"] != "blocked":
            return task
        updated = self.store.update_task(task_id, {"status": "accepted", "blocked_reason": ""})
        self.store.add_activity(task_id, actor_id, "unblocked", {})
        self._notify_other(updated, actor_id, "unblocked", f"{self._name(actor_id)} unblocked: {updated['title']}")
        return updated

    def complete(self, actor_id: str | None, task_id: str) -> dict:
        task = self.task(task_id)
        if task["status"] == "done":
            return task
        board = self.board(task["board_id"])
        done_col = next((c for c in board["columns"] if c["kind"] == "done"), None)
        changes = {"status": "done", "completed_at": now_iso(), "blocked_reason": ""}
        if done_col and done_col["id"] != task["column_id"]:
            changes["column_id"] = done_col["id"]
            changes["position"] = self.store.max_position(board["id"], done_col["id"]) + 1
        updated = self.store.update_task(task_id, changes)
        self.store.add_activity(task_id, actor_id, "completed", {})
        self._tell_creator(updated, actor_id, "completed", f"{self._name(actor_id)} completed: {updated['title']}")
        return updated

    def reopen(self, actor_id: str | None, task_id: str) -> dict:
        task = self.task(task_id)
        if task["status"] != "done":
            return task
        board = self.board(task["board_id"])
        first = board["columns"][0]
        changes = {"status": "open", "completed_at": None}
        if self._column(board, task["column_id"])["kind"] == "done":
            changes["column_id"] = first["id"]
            changes["position"] = self.store.max_position(board["id"], first["id"]) + 1
        updated = self.store.update_task(task_id, changes)
        self.store.add_activity(task_id, actor_id, "reopened", {})
        self._notify_other(updated, actor_id, "reopened", f"{self._name(actor_id)} reopened: {updated['title']}")
        return updated

    # -- comments ----------------------------------------------------------

    def comment(self, actor_id: str | None, task_id: str, body: str) -> dict:
        task = self.task(task_id)
        body = (body or "").strip()
        if not body:
            raise TaskHubError("comment is empty")
        c = self.store.add_comment(task_id, actor_id, body)
        self.store.add_activity(task_id, actor_id, "commented", {"comment_id": c["id"]})
        self.store.update_task(task_id, {})  # bump version/updated_at so pollers refresh
        snippet = body if len(body) <= 80 else body[:77] + "..."
        for member_id in self._participants(task) - {actor_id}:
            self._notify(member_id, task, "commented", f"{self._name(actor_id)} on '{task['title']}': {snippet}")
        return c

    def comments(self, task_id: str) -> list[dict]:
        self.task(task_id)
        return self.store.list_comments(task_id)

    def activity(self, task_id: str) -> list[dict]:
        self.task(task_id)
        return self.store.list_activity(task_id)

    # -- views -------------------------------------------------------------

    def my_tasks(self, member_id: str, today: date | None = None) -> dict:
        """Everything on one person's plate, plus what they handed to others."""
        self.member(member_id)
        today = today or datetime.now(timezone.utc).date()
        mine = self.store.list_tasks(assignee_id=member_id)
        groups = {"overdue": [], "today": [], "week": [], "later": [], "none": [], "done": []}
        for t in sorted(mine, key=lambda t: (t["due_at"] or "9999", t["created_at"])):
            if t["status"] == "done":
                if t["completed_at"] and t["completed_at"][:10] >= (today - timedelta(days=7)).isoformat():
                    groups["done"].append(t)
                continue
            groups[due_bucket(t["due_at"], today)].append(t)
        delegated = [t for t in self.store.list_tasks(created_by=member_id)
                     if t["assignee_id"] and t["assignee_id"] != member_id]
        delegated.sort(key=lambda t: (t["status"] == "done", t["due_at"] or "9999"))
        return {"assigned": groups, "delegated": delegated}

    def search(self, text: str = "", assignee_id: str | None = None, status: str | None = None,
               label: str | None = None, board_id: str | None = None, priority: str | None = None) -> list[dict]:
        tasks = self.store.search_tasks(text) if text else self.store.list_tasks()
        out = []
        for t in tasks:
            if assignee_id and t["assignee_id"] != assignee_id:
                continue
            if status and t["status"] != status:
                continue
            if label and label not in t["labels"]:
                continue
            if board_id and t["board_id"] != board_id:
                continue
            if priority and t["priority"] != priority:
                continue
            out.append(t)
        return out

    def notifications(self, member_id: str, unread_only: bool = False) -> list[dict]:
        return self.store.list_notifications(member_id, unread_only)

    def unread_count(self, member_id: str) -> int:
        return self.store.unread_count(member_id)

    def mark_read(self, member_id: str, ids: list[str] | None = None) -> int:
        return self.store.mark_read(member_id, ids)

    def bootstrap(self, member_id: str | None) -> dict:
        return {
            "me": self.store.get_member(member_id) if member_id else None,
            "members": self.members(),
            "boards": self.boards(),
            "unread": self.unread_count(member_id) if member_id else 0,
            "server_time": now_iso(),
        }

    # -- helpers -----------------------------------------------------------

    @staticmethod
    def _clean_labels(labels) -> list[str]:
        if not labels:
            return []
        if isinstance(labels, str):
            labels = labels.split(",")
        seen, out = set(), []
        for raw in labels:
            lab = str(raw).strip()
            if lab and lab.lower() not in seen:
                seen.add(lab.lower())
                out.append(lab)
        return out[:12]

    @staticmethod
    def _clean_checklist(items, keep_ids: list[dict] | None = None) -> list[dict]:
        if not items:
            return []
        out = []
        for raw in items:
            if isinstance(raw, str):
                raw = {"text": raw}
            text = str(raw.get("text", "")).strip()
            if not text:
                continue
            out.append({"id": raw.get("id") or new_id("ck"), "text": text, "done": bool(raw.get("done"))})
        return out[:50]

    def _participants(self, task: dict) -> set[str]:
        people = {task["assignee_id"], task["created_by"]} | self.store.comment_authors(task["id"])
        people.discard(None)
        return people

    def _other_party(self, task: dict, actor_id: str | None, prefer: str) -> str | None:
        """The person on the other side of a delegation from the actor."""
        if prefer == "assignee" and task["assignee_id"] and task["assignee_id"] != actor_id:
            return task["assignee_id"]
        if task["created_by"] and task["created_by"] != actor_id:
            return task["created_by"]
        if task["assignee_id"] and task["assignee_id"] != actor_id:
            return task["assignee_id"]
        return None

    def _tell_creator(self, task: dict, actor_id: str | None, kind: str, message: str) -> None:
        if task["created_by"] and task["created_by"] != actor_id:
            self._notify(task["created_by"], task, kind, message)

    def _notify_other(self, task: dict, actor_id: str | None, kind: str, message: str) -> None:
        for member_id in {task["created_by"], task["assignee_id"]} - {None, actor_id}:
            self._notify(member_id, task, kind, message)

    def _notify(self, member_id: str, task: dict, kind: str, message: str) -> None:
        self.store.add_notification(member_id, task["id"], kind, message)
