"""SQLite storage for TaskHub.

One file, stdlib only. Every public method opens its own connection so the
store is safe to call from several request threads. Lists (labels, checklist,
columns, activity detail) are stored as JSON text.

Swap this class for another backend by keeping the same method names; the
service layer never touches SQL.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone

SCHEMA = """
CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    columns TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    column_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    assignee_id TEXT,
    created_by TEXT,
    due_at TEXT,
    priority TEXT NOT NULL DEFAULT 'normal',
    labels TEXT NOT NULL DEFAULT '[]',
    checklist TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'open',
    blocked_reason TEXT NOT NULL DEFAULT '',
    position REAL NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
);
CREATE INDEX IF NOT EXISTS tasks_board ON tasks(board_id, column_id, position);
CREATE INDEX IF NOT EXISTS tasks_assignee ON tasks(assignee_id, status);
CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    author_id TEXT,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_task ON comments(task_id, created_at);
CREATE TABLE IF NOT EXISTS activity (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    actor_id TEXT,
    kind TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_task ON activity(task_id, created_at);
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    task_id TEXT,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT
);
CREATE INDEX IF NOT EXISTS notifications_member ON notifications(member_id, read_at, created_at);
"""

JSON_FIELDS = {
    "boards": ("columns",),
    "tasks": ("labels", "checklist"),
    "activity": ("detail",),
}
BOOL_FIELDS = {
    "members": ("active",),
    "boards": ("archived",),
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class Store:
    def __init__(self, path: str = ":memory:"):
        self.path = path
        self._lock = threading.RLock()
        # ":memory:" databases vanish per connection, so keep one shared
        # connection for in-memory use (tests) and open per call otherwise.
        self._memory_conn = None
        if path == ":memory:":
            self._memory_conn = sqlite3.connect(path, check_same_thread=False)
            self._memory_conn.row_factory = sqlite3.Row
        with self._connect() as conn:
            conn.executescript(SCHEMA)

    def close(self) -> None:
        if self._memory_conn is not None:
            self._memory_conn.close()
            self._memory_conn = None

    # -- connections -------------------------------------------------------

    def _connect(self):
        if self._memory_conn is not None:
            return _SharedConn(self._memory_conn, self._lock)
        conn = sqlite3.connect(self.path, timeout=10, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return _OwnedConn(conn, self._lock)

    # -- row helpers -------------------------------------------------------

    @staticmethod
    def _row(table: str, row) -> dict | None:
        if row is None:
            return None
        d = dict(row)
        for f in JSON_FIELDS.get(table, ()):
            d[f] = json.loads(d[f]) if d.get(f) else []
        for f in BOOL_FIELDS.get(table, ()):
            d[f] = bool(d[f])
        return d

    @staticmethod
    def _encode(table: str, data: dict) -> dict:
        out = dict(data)
        for f in JSON_FIELDS.get(table, ()):
            if f in out:
                out[f] = json.dumps(out[f])
        for f in BOOL_FIELDS.get(table, ()):
            if f in out:
                out[f] = 1 if out[f] else 0
        return out

    def _insert(self, table: str, data: dict) -> dict:
        enc = self._encode(table, data)
        cols = ", ".join(enc)
        marks = ", ".join("?" for _ in enc)
        with self._connect() as conn:
            conn.execute(f"INSERT INTO {table} ({cols}) VALUES ({marks})", list(enc.values()))
        return data

    def _update(self, table: str, id_: str, data: dict) -> None:
        if not data:
            return
        enc = self._encode(table, data)
        sets = ", ".join(f"{k} = ?" for k in enc)
        with self._connect() as conn:
            conn.execute(f"UPDATE {table} SET {sets} WHERE id = ?", [*enc.values(), id_])

    def _get(self, table: str, id_: str) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (id_,)).fetchone()
        return self._row(table, row)

    def _select(self, table: str, where: str = "", params=(), order: str = "") -> list[dict]:
        sql = f"SELECT * FROM {table}"
        if where:
            sql += f" WHERE {where}"
        if order:
            sql += f" ORDER BY {order}"
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._row(table, r) for r in rows]

    # -- members -----------------------------------------------------------

    def add_member(self, name: str, role: str = "member", id_: str | None = None) -> dict:
        return self._insert("members", {
            "id": id_ or new_id("m"), "name": name, "role": role,
            "active": True, "created_at": now_iso(),
        })

    def get_member(self, id_: str) -> dict | None:
        return self._get("members", id_)

    def list_members(self, include_inactive: bool = False) -> list[dict]:
        where = "" if include_inactive else "active = 1"
        return self._select("members", where, order="name COLLATE NOCASE")

    def update_member(self, id_: str, data: dict) -> dict | None:
        self._update("members", id_, data)
        return self.get_member(id_)

    # -- boards ------------------------------------------------------------

    def add_board(self, name: str, columns: list[dict], description: str = "", id_: str | None = None) -> dict:
        return self._insert("boards", {
            "id": id_ or new_id("b"), "name": name, "description": description,
            "columns": columns, "archived": False, "created_at": now_iso(),
        })

    def get_board(self, id_: str) -> dict | None:
        return self._get("boards", id_)

    def list_boards(self, include_archived: bool = False) -> list[dict]:
        where = "" if include_archived else "archived = 0"
        return self._select("boards", where, order="created_at")

    def update_board(self, id_: str, data: dict) -> dict | None:
        self._update("boards", id_, data)
        return self.get_board(id_)

    # -- tasks -------------------------------------------------------------

    def add_task(self, data: dict) -> dict:
        ts = now_iso()
        task = {
            "id": new_id("t"), "description": "", "assignee_id": None, "created_by": None,
            "due_at": None, "priority": "normal", "labels": [], "checklist": [],
            "status": "open", "blocked_reason": "", "position": 0, "version": 1,
            "created_at": ts, "updated_at": ts, "completed_at": None,
        }
        task.update(data)
        return self._insert("tasks", task)

    def get_task(self, id_: str) -> dict | None:
        return self._get("tasks", id_)

    def update_task(self, id_: str, data: dict) -> dict | None:
        data = dict(data)
        data["updated_at"] = now_iso()
        enc = self._encode("tasks", data)
        sets = ", ".join(f"{k} = ?" for k in enc)
        with self._connect() as conn:
            conn.execute(
                f"UPDATE tasks SET {sets}, version = version + 1 WHERE id = ?",
                [*enc.values(), id_],
            )
        return self.get_task(id_)

    def delete_task(self, id_: str) -> None:
        with self._connect() as conn:
            for table in ("comments", "activity", "notifications"):
                conn.execute(f"DELETE FROM {table} WHERE task_id = ?", (id_,))
            conn.execute("DELETE FROM tasks WHERE id = ?", (id_,))

    def list_tasks(self, board_id: str | None = None, assignee_id: str | None = None,
                   created_by: str | None = None, status: str | None = None,
                   include_done: bool = True) -> list[dict]:
        clauses, params = [], []
        if board_id:
            clauses.append("board_id = ?"); params.append(board_id)
        if assignee_id:
            clauses.append("assignee_id = ?"); params.append(assignee_id)
        if created_by:
            clauses.append("created_by = ?"); params.append(created_by)
        if status:
            clauses.append("status = ?"); params.append(status)
        if not include_done:
            clauses.append("status != 'done'")
        return self._select("tasks", " AND ".join(clauses), params, order="column_id, position, created_at")

    def max_position(self, board_id: str, column_id: str) -> float:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT MAX(position) AS m FROM tasks WHERE board_id = ? AND column_id = ?",
                (board_id, column_id),
            ).fetchone()
        return float(row["m"]) if row and row["m"] is not None else 0.0

    def search_tasks(self, text: str) -> list[dict]:
        like = f"%{text.lower()}%"
        return self._select(
            "tasks",
            "lower(title) LIKE ? OR lower(description) LIKE ? OR lower(labels) LIKE ?",
            (like, like, like),
            order="updated_at DESC",
        )

    # -- comments ----------------------------------------------------------

    def add_comment(self, task_id: str, author_id: str | None, body: str) -> dict:
        return self._insert("comments", {
            "id": new_id("c"), "task_id": task_id, "author_id": author_id,
            "body": body, "created_at": now_iso(),
        })

    def list_comments(self, task_id: str) -> list[dict]:
        return self._select("comments", "task_id = ?", (task_id,), order="created_at")

    def comment_authors(self, task_id: str) -> set[str]:
        return {c["author_id"] for c in self.list_comments(task_id) if c["author_id"]}

    # -- activity ----------------------------------------------------------

    def add_activity(self, task_id: str, actor_id: str | None, kind: str, detail: dict | None = None) -> dict:
        return self._insert("activity", {
            "id": new_id("a"), "task_id": task_id, "actor_id": actor_id,
            "kind": kind, "detail": detail or {}, "created_at": now_iso(),
        })

    def list_activity(self, task_id: str) -> list[dict]:
        return self._select("activity", "task_id = ?", (task_id,), order="created_at")

    def recent_activity(self, limit: int = 50) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM activity ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [self._row("activity", r) for r in rows]

    # -- notifications -----------------------------------------------------

    def add_notification(self, member_id: str, task_id: str | None, kind: str, message: str) -> dict:
        return self._insert("notifications", {
            "id": new_id("n"), "member_id": member_id, "task_id": task_id,
            "kind": kind, "message": message, "created_at": now_iso(), "read_at": None,
        })

    def list_notifications(self, member_id: str, unread_only: bool = False, limit: int = 100) -> list[dict]:
        where = "member_id = ?"
        if unread_only:
            where += " AND read_at IS NULL"
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT * FROM notifications WHERE {where} ORDER BY created_at DESC LIMIT ?",
                (member_id, limit),
            ).fetchall()
        return [self._row("notifications", r) for r in rows]

    def unread_count(self, member_id: str) -> int:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS c FROM notifications WHERE member_id = ? AND read_at IS NULL",
                (member_id,),
            ).fetchone()
        return int(row["c"])

    def mark_read(self, member_id: str, ids: list[str] | None = None) -> int:
        ts = now_iso()
        with self._connect() as conn:
            if ids is None:
                cur = conn.execute(
                    "UPDATE notifications SET read_at = ? WHERE member_id = ? AND read_at IS NULL",
                    (ts, member_id),
                )
            else:
                marks = ", ".join("?" for _ in ids)
                cur = conn.execute(
                    f"UPDATE notifications SET read_at = ? WHERE member_id = ? AND read_at IS NULL AND id IN ({marks})",
                    [ts, member_id, *ids],
                )
            return cur.rowcount


class _SharedConn:
    """Context manager over the single in-memory connection."""

    def __init__(self, conn, lock):
        self.conn, self.lock = conn, lock

    def __enter__(self):
        self.lock.acquire()
        return self.conn

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type is None:
                self.conn.commit()
            else:
                self.conn.rollback()
        finally:
            self.lock.release()


class _OwnedConn:
    """Context manager over a per-call file connection."""

    def __init__(self, conn, lock):
        self.conn, self.lock = conn, lock

    def __enter__(self):
        self.lock.acquire()
        return self.conn

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type is None:
                self.conn.commit()
            else:
                self.conn.rollback()
        finally:
            self.conn.close()
            self.lock.release()
