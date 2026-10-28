"""HTTP API for TaskHub. Thin: parse the request, call the service, return JSON.

Everything lives under /taskhub: the standalone page at /taskhub/ and the
JSON API under /taskhub/api/... . Inside the hub only the API is used; the
page is the hub's own, with the Tasks tab mounted by static/js/taskhub.js.
"""

from __future__ import annotations

from datetime import date
from typing import Callable

from flask import Blueprint, jsonify, render_template, request

from .service import TaskHub, TaskHubError
from .store import Store, StoreUnavailable


def _default_resolve_member():
    """Standalone: the demo page says who it is in a header (or ?me=)."""
    return request.headers.get("X-Taskhub-Member") or request.args.get("me") or None


def create_blueprint(hub: TaskHub | None = None, backend=None,
                     resolve_member: Callable[[], str | dict | None] | None = None,
                     people: Callable[[], list[dict]] | None = None,
                     url_prefix: str = "/taskhub") -> Blueprint:
    """`resolve_member` returns the current person: an id the members table
    knows (standalone), or {id, name, role} from the host's own sign-in, or
    None for nobody. `people` lists everyone who can be given work (see
    TaskHub)."""
    hub = hub or TaskHub(Store(backend), people=people)
    resolve_member = resolve_member or _default_resolve_member

    bp = Blueprint("taskhub", __name__, url_prefix=url_prefix, template_folder="templates")

    def me() -> str | None:
        who = resolve_member()
        if isinstance(who, dict):
            if not who.get("id") or not who.get("name"):
                return None
            hub.ensure_member(who["id"], who["name"], who.get("role") or "member")
            return who["id"]
        return who or None

    def need_me() -> str:
        who = me()
        if not who:
            raise TaskHubError("Sign in to use Tasks.", 401)
        return who

    def body() -> dict:
        data = request.get_json(silent=True)
        return data if isinstance(data, dict) else {}

    def today() -> date | None:
        raw = request.args.get("today")
        try:
            return date.fromisoformat(raw) if raw else None
        except ValueError:
            raise TaskHubError("today must be YYYY-MM-DD")

    @bp.errorhandler(TaskHubError)
    def _hub_error(err: TaskHubError):
        return jsonify({"error": str(err)}), err.status

    @bp.errorhandler(StoreUnavailable)
    def _store_error(err: StoreUnavailable):
        return jsonify({"error": "Tasks couldn't be read from the server. Try again in a moment."}), 503

    # -- page (standalone only) ------------------------------------------

    @bp.get("/")
    def page():
        return render_template("taskhub.html", api_base=f"{url_prefix}/api")

    # -- bootstrap ---------------------------------------------------------

    @bp.get("/api/bootstrap")
    def bootstrap():
        return jsonify(hub.bootstrap(me()))

    # -- members -----------------------------------------------------------

    @bp.get("/api/members")
    def members():
        return jsonify(hub.members(include_inactive=request.args.get("all") == "1"))

    @bp.post("/api/members")
    def add_member():
        d = body()
        return jsonify(hub.add_member(d.get("name", ""), d.get("role", "member"), d.get("id"))), 201

    @bp.patch("/api/members/<member_id>")
    def update_member(member_id):
        return jsonify(hub.update_member(member_id, body()))

    # -- boards ------------------------------------------------------------

    @bp.get("/api/boards")
    def boards():
        return jsonify(hub.boards(include_archived=request.args.get("all") == "1"))

    @bp.post("/api/boards")
    def add_board():
        need_me()
        d = body()
        return jsonify(hub.add_board(d.get("name", ""), d.get("description", ""), d.get("columns"))), 201

    @bp.get("/api/boards/<board_id>")
    def board(board_id):
        b = hub.board(board_id)
        b["tasks"] = hub.tasks(board_id=board_id)
        return jsonify(b)

    @bp.patch("/api/boards/<board_id>")
    def update_board(board_id):
        need_me()
        return jsonify(hub.update_board(board_id, body()))

    @bp.post("/api/boards/<board_id>/columns")
    def add_column(board_id):
        need_me()
        d = body()
        return jsonify(hub.add_column(board_id, d.get("name", ""), d.get("kind", "todo"))), 201

    @bp.patch("/api/boards/<board_id>/columns/<column_id>")
    def update_column(board_id, column_id):
        need_me()
        return jsonify(hub.update_column(board_id, column_id, body()))

    @bp.delete("/api/boards/<board_id>/columns/<column_id>")
    def remove_column(board_id, column_id):
        need_me()
        return jsonify(hub.remove_column(board_id, column_id, body().get("move_to")))

    # -- tasks -------------------------------------------------------------

    @bp.get("/api/boards/<board_id>/tasks")
    def board_tasks(board_id):
        hub.board(board_id)
        return jsonify(hub.tasks(board_id=board_id))

    @bp.post("/api/tasks")
    def create_task():
        return jsonify(hub.create_task(need_me(), body())), 201

    @bp.get("/api/tasks/<task_id>")
    def task(task_id):
        t = hub.task(task_id)
        t["comments"] = hub.comments(task_id)
        t["activity"] = hub.activity(task_id)
        return jsonify(t)

    @bp.patch("/api/tasks/<task_id>")
    def update_task(task_id):
        return jsonify(hub.update_task(need_me(), task_id, body()))

    @bp.delete("/api/tasks/<task_id>")
    def delete_task(task_id):
        hub.delete_task(need_me(), task_id)
        return "", 204

    @bp.post("/api/tasks/<task_id>/move")
    def move_task(task_id):
        d = body()
        if not d.get("column_id"):
            raise TaskHubError("column_id is required")
        return jsonify(hub.move_task(need_me(), task_id, d["column_id"], d.get("before_id"), d.get("after_id")))

    @bp.post("/api/tasks/<task_id>/assign")
    def assign(task_id):
        return jsonify(hub.assign(need_me(), task_id, body().get("assignee_id") or None))

    @bp.post("/api/tasks/<task_id>/accept")
    def accept(task_id):
        return jsonify(hub.accept(need_me(), task_id))

    @bp.post("/api/tasks/<task_id>/block")
    def block(task_id):
        return jsonify(hub.block(need_me(), task_id, body().get("reason", "")))

    @bp.post("/api/tasks/<task_id>/unblock")
    def unblock(task_id):
        return jsonify(hub.unblock(need_me(), task_id))

    @bp.post("/api/tasks/<task_id>/complete")
    def complete(task_id):
        return jsonify(hub.complete(need_me(), task_id))

    @bp.post("/api/tasks/<task_id>/reopen")
    def reopen(task_id):
        return jsonify(hub.reopen(need_me(), task_id))

    @bp.get("/api/tasks/<task_id>/comments")
    def comments(task_id):
        return jsonify(hub.comments(task_id))

    @bp.post("/api/tasks/<task_id>/comments")
    def add_comment(task_id):
        return jsonify(hub.comment(need_me(), task_id, body().get("body", ""))), 201

    @bp.get("/api/tasks/<task_id>/activity")
    def activity(task_id):
        return jsonify(hub.activity(task_id))

    # -- views -------------------------------------------------------------

    @bp.get("/api/my-tasks")
    def my_tasks():
        member_id = request.args.get("member") or me()
        if not member_id:
            raise TaskHubError("Sign in to see your tasks.", 401)
        return jsonify(hub.my_tasks(member_id, today()))

    @bp.get("/api/search")
    def search():
        a = request.args
        return jsonify(hub.search(
            text=a.get("q", "").strip(), assignee_id=a.get("assignee") or None,
            status=a.get("status") or None, label=a.get("label") or None,
            board_id=a.get("board") or None, priority=a.get("priority") or None,
        ))

    @bp.get("/api/notifications")
    def notifications():
        member_id = me()
        if not member_id:
            return jsonify({"items": [], "unread": 0})
        return jsonify({
            "items": hub.notifications(member_id, unread_only=request.args.get("unread") == "1"),
            "unread": hub.unread_count(member_id),
        })

    @bp.post("/api/notifications/read")
    def mark_read():
        member_id = need_me()
        ids = body().get("ids")
        return jsonify({"marked": hub.mark_read(member_id, ids), "unread": hub.unread_count(member_id)})

    @bp.after_request
    def _no_store(resp):
        if request.path.startswith(f"{url_prefix}/api/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    return bp
