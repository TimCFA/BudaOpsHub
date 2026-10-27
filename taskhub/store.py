"""TaskHub storage: records in memory, written through to a backend.

The hub runs as one server process that keeps its data in memory and writes
each change to Firebase (app.py, "SAVED STATE"); TaskHub does the same. Every
record (a task, a comment, a notification …) is one small object under
`taskhub/<table>/<id>`, so a change writes only that record and two servers
overlapping during a deploy can only ever clash on the same record, never
wipe each other's tasks.

Backends:
  MemoryBackend    nothing persists (tests, a throwaway demo)
  JsonFileBackend  one JSON file, rewritten after each change (standalone)
  FirebaseBackend  the hub's Realtime Database (production)

The service layer calls only the Store methods below; it never sees a backend.
"""

from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timezone

TABLES = ("members", "boards", "tasks", "comments", "activity", "notifications")


def now_iso() -> str:
    # Microseconds kept: several records written in the same second (an
    # action and its activity line) still sort in the order they happened.
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class StoreUnavailable(Exception):
    """The backend could not be read; nothing is served until it can."""


# ----- backends -----------------------------------------------------------

class MemoryBackend:
    def load(self) -> dict:
        return {}

    def put(self, table: str, id_: str, record: dict) -> None:
        pass

    def delete(self, table: str, id_: str) -> None:
        pass


class JsonFileBackend:
    """Everything in one file. Fine for one small team on one machine."""

    def __init__(self, path: str):
        self.path = path
        self._data = None

    def load(self) -> dict:
        if os.path.exists(self.path):
            with open(self.path, encoding="utf-8") as f:
                self._data = json.load(f)
        else:
            self._data = {}
        return self._data

    def _flush(self) -> None:
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self._data, f, indent=1, sort_keys=True)
        os.replace(tmp, self.path)

    def put(self, table, id_, record):
        self._data.setdefault(table, {})[id_] = record
        self._flush()

    def delete(self, table, id_):
        self._data.get(table, {}).pop(id_, None)
        self._flush()


class FirebaseBackend:
    """Records under <root>/<table>/<id> in the Realtime Database.

    `ref` is a function path -> reference (firebase_admin's db.reference, or
    the hub's test double). It is looked up on every call, never cached, so
    the hub's tests can swap it in and out."""

    def __init__(self, ref, root: str = "taskhub"):
        self.ref = ref
        self.root = root.strip("/")

    def load(self) -> dict:
        data = self.ref(self.root).get()
        return data if isinstance(data, dict) else {}

    def put(self, table, id_, record):
        self.ref(f"{self.root}/{table}/{id_}").set(record)

    def delete(self, table, id_):
        self.ref(f"{self.root}/{table}/{id_}").delete()


# ----- the store ----------------------------------------------------------

class Store:
    def __init__(self, backend=None):
        self.backend = backend or MemoryBackend()
        self._lock = threading.RLock()
        self._tables: dict[str, dict[str, dict]] = {t: {} for t in TABLES}
        self._loaded = False

    # -- loading -----------------------------------------------------------

    def ensure_loaded(self) -> None:
        """Read the backend once. A failed read is tried again on the next
        call; until it works, nothing is served (StoreUnavailable), so a cold
        server never shows an empty board or writes over what it hasn't read."""
        if self._loaded:
            return
        with self._lock:
            if self._loaded:
                return
            try:
                data = self.backend.load()
            except Exception as e:  # noqa: BLE001
                raise StoreUnavailable(f"couldn't read saved tasks: {type(e).__name__}") from e
            for table in TABLES:
                rows = data.get(table) if isinstance(data, dict) else None
                self._tables[table] = {k: dict(v) for k, v in (rows or {}).items() if isinstance(v, dict)}
            self._loaded = True

    def close(self) -> None:
        pass

    # -- generic -----------------------------------------------------------

    def _put(self, table: str, record: dict) -> dict:
        self.ensure_loaded()
        with self._lock:
            self._tables[table][record["id"]] = record
            self.backend.put(table, record["id"], record)
        return dict(record)

    def _get(self, table: str, id_: str) -> dict | None:
        self.ensure_loaded()
        with self._lock:
            rec = self._tables[table].get(id_)
            return dict(rec) if rec else None

    def _update(self, table: str, id_: str, changes: dict) -> dict | None:
        self.ensure_loaded()
        with self._lock:
            rec = self._tables[table].get(id_)
            if rec is None:
                return None
            rec = dict(rec, **changes)
            self._tables[table][id_] = rec
            self.backend.put(table, id_, rec)
            return dict(rec)

    def _delete(self, table: str, id_: str) -> None:
        self.ensure_loaded()
        with self._lock:
            if self._tables[table].pop(id_, None) is not None:
                self.backend.delete(table, id_)

    def _all(self, table: str) -> list[dict]:
        self.ensure_loaded()
        with self._lock:
            return [dict(r) for r in self._tables[table].values()]

    # -- members -----------------------------------------------------------

    def add_member(self, name: str, role: str = "member", id_: str | None = None) -> dict:
        return self._put("members", {"id": id_ or new_id("m"), "name": name, "role": role,
                                     "active": True, "created_at": now_iso()})

    def get_member(self, id_: str) -> dict | None:
        return self._get("members", id_)

    def list_members(self, include_inactive: bool = False) -> list[dict]:
        rows = [m for m in self._all("members") if include_inactive or m.get("active", True)]
        return sorted(rows, key=lambda m: m["name"].lower())

    def update_member(self, id_: str, data: dict) -> dict | None:
        return self._update("members", id_, data)

    # -- boards ------------------------------------------------------------

    def add_board(self, name: str, columns: list[dict], description: str = "", id_: str | None = None) -> dict:
        return self._put("boards", {"id": id_ or new_id("b"), "name": name, "description": description,
                                    "columns": columns, "archived": False, "created_at": now_iso()})

    def get_board(self, id_: str) -> dict | None:
        return self._get("boards", id_)

    def list_boards(self, include_archived: bool = False) -> list[dict]:
        rows = [b for b in self._all("boards") if include_archived or not b.get("archived")]
        return sorted(rows, key=lambda b: b["created_at"])

    def update_board(self, id_: str, data: dict) -> dict | None:
        return self._update("boards", id_, data)

    # -- tasks -------------------------------------------------------------

    def add_task(self, data: dict) -> dict:
        ts = now_iso()
        task = {"id": new_id("t"), "description": "", "assignee_id": None, "created_by": None,
                "due_at": None, "priority": "normal", "labels": [], "checklist": [],
                "status": "open", "blocked_reason": "", "position": 0, "version": 1,
                "created_at": ts, "updated_at": ts, "completed_at": None}
        task.update(data)
        return self._put("tasks", task)

    def get_task(self, id_: str) -> dict | None:
        t = self._get("tasks", id_)
        return self._fill_task(t) if t else None

    @staticmethod
    def _fill_task(t: dict) -> dict:
        # Firebase drops empty lists and nulls; put them back.
        t.setdefault("labels", [])
        t.setdefault("checklist", [])
        for k in ("assignee_id", "created_by", "due_at", "completed_at"):
            t.setdefault(k, None)
        t.setdefault("description", "")
        t.setdefault("blocked_reason", "")
        return t

    def update_task(self, id_: str, data: dict) -> dict | None:
        self.ensure_loaded()
        with self._lock:
            rec = self._tables["tasks"].get(id_)
            if rec is None:
                return None
            changes = dict(data, updated_at=now_iso(), version=int(rec.get("version", 1)) + 1)
            return self._fill_task(self._update("tasks", id_, changes))

    def delete_task(self, id_: str) -> None:
        self.ensure_loaded()
        with self._lock:
            for table in ("comments", "activity", "notifications"):
                for rid in [r["id"] for r in self._tables[table].values() if r.get("task_id") == id_]:
                    self._delete(table, rid)
            self._delete("tasks", id_)

    def list_tasks(self, board_id: str | None = None, assignee_id: str | None = None,
                   created_by: str | None = None, status: str | None = None,
                   include_done: bool = True) -> list[dict]:
        out = []
        for t in self._all("tasks"):
            t = self._fill_task(t)
            if board_id and t["board_id"] != board_id:
                continue
            if assignee_id and t["assignee_id"] != assignee_id:
                continue
            if created_by and t["created_by"] != created_by:
                continue
            if status and t["status"] != status:
                continue
            if not include_done and t["status"] == "done":
                continue
            out.append(t)
        return sorted(out, key=lambda t: (t["column_id"], t["position"], t["created_at"]))

    def max_position(self, board_id: str, column_id: str) -> float:
        pos = [t["position"] for t in self._all("tasks") if t["board_id"] == board_id and t["column_id"] == column_id]
        return float(max(pos)) if pos else 0.0

    def search_tasks(self, text: str) -> list[dict]:
        q = text.lower()
        hits = [t for t in self.list_tasks()
                if q in t["title"].lower() or q in t["description"].lower() or any(q in lab.lower() for lab in t["labels"])]
        return sorted(hits, key=lambda t: t["updated_at"], reverse=True)

    # -- comments ----------------------------------------------------------

    def add_comment(self, task_id: str, author_id: str | None, body: str) -> dict:
        return self._put("comments", {"id": new_id("c"), "task_id": task_id, "author_id": author_id,
                                      "body": body, "created_at": now_iso()})

    def list_comments(self, task_id: str) -> list[dict]:
        rows = [c for c in self._all("comments") if c.get("task_id") == task_id]
        for c in rows:
            c.setdefault("author_id", None)
        return sorted(rows, key=lambda c: c["created_at"])

    def comment_authors(self, task_id: str) -> set[str]:
        return {c["author_id"] for c in self.list_comments(task_id) if c.get("author_id")}

    # -- activity ----------------------------------------------------------

    def add_activity(self, task_id: str, actor_id: str | None, kind: str, detail: dict | None = None) -> dict:
        return self._put("activity", {"id": new_id("a"), "task_id": task_id, "actor_id": actor_id,
                                      "kind": kind, "detail": detail or {}, "created_at": now_iso()})

    def list_activity(self, task_id: str) -> list[dict]:
        rows = [a for a in self._all("activity") if a.get("task_id") == task_id]
        for a in rows:
            a.setdefault("actor_id", None)
            a.setdefault("detail", {})
        return sorted(rows, key=lambda a: (a["created_at"], a["id"]))

    # -- notifications -----------------------------------------------------

    def add_notification(self, member_id: str, task_id: str | None, kind: str, message: str) -> dict:
        return self._put("notifications", {"id": new_id("n"), "member_id": member_id, "task_id": task_id,
                                           "kind": kind, "message": message, "created_at": now_iso(), "read_at": None})

    def _for_member(self, member_id: str) -> list[dict]:
        rows = [n for n in self._all("notifications") if n.get("member_id") == member_id]
        for n in rows:
            n.setdefault("read_at", None)
            n.setdefault("task_id", None)
        return rows

    def list_notifications(self, member_id: str, unread_only: bool = False, limit: int = 100) -> list[dict]:
        rows = [n for n in self._for_member(member_id) if not unread_only or not n["read_at"]]
        rows.sort(key=lambda n: n["created_at"], reverse=True)
        return rows[:limit]

    def unread_count(self, member_id: str) -> int:
        return sum(1 for n in self._for_member(member_id) if not n["read_at"])

    def mark_read(self, member_id: str, ids: list[str] | None = None) -> int:
        ts, n = now_iso(), 0
        for rec in self._for_member(member_id):
            if rec["read_at"] or (ids is not None and rec["id"] not in ids):
                continue
            self._update("notifications", rec["id"], {"read_at": ts})
            n += 1
        return n

    def prune_notifications(self, keep_days: int = 60) -> int:
        """Old read notifications go; the table stays small."""
        cutoff = (datetime.now(timezone.utc).timestamp() - keep_days * 86400)
        gone = 0
        for rec in self._all("notifications"):
            if rec.get("read_at") and datetime.fromisoformat(rec["created_at"]).timestamp() < cutoff:
                self._delete("notifications", rec["id"])
                gone += 1
        return gone
