"""TaskHub: delegation flow, board mechanics, notifications and the HTTP API."""

import unittest
from datetime import date

from taskhub import create_app
from taskhub.service import Conflict, Forbidden, NotFound, TaskHub, TaskHubError, due_bucket
from taskhub.store import FirebaseBackend, JsonFileBackend, MemoryBackend, Store, StoreUnavailable


class HubBase(unittest.TestCase):
    def setUp(self):
        self.hub = TaskHub(Store(MemoryBackend()))
        self.lead = self.hub.add_member("Lead", "leader", "lead")
        self.ana = self.hub.add_member("Ana", "member", "ana")
        self.ben = self.hub.add_member("Ben", "member", "ben")
        self.board = self.hub.add_board("Ops")
        self.todo, self.doing, self.done = (c["id"] for c in self.board["columns"])

    def tearDown(self):
        self.hub.store.close()

    def make(self, actor="lead", **kw):
        kw.setdefault("board_id", self.board["id"])
        kw.setdefault("title", "Do the thing")
        return self.hub.create_task(actor, kw)

    def unread(self, who):
        return [n["message"] for n in self.hub.notifications(who, unread_only=True)]


class DelegationFlow(HubBase):
    def test_assign_notifies_assignee_not_actor(self):
        t = self.make(assignee_id="ana")
        self.assertEqual(t["status"], "open")
        self.assertEqual(self.unread("ana"), ["Lead assigned you: Do the thing"])
        self.assertEqual(self.unread("lead"), [])

    def test_accept_block_complete_tell_the_delegator(self):
        t = self.make(assignee_id="ana")
        self.hub.accept("ana", t["id"])
        self.hub.block("ana", t["id"], "Waiting on a part")
        self.assertEqual(self.hub.task(t["id"])["status"], "blocked")
        self.hub.unblock("ana", t["id"])
        self.assertEqual(self.hub.task(t["id"])["status"], "accepted")
        self.hub.complete("ana", t["id"])
        done = self.hub.task(t["id"])
        self.assertEqual(done["status"], "done")
        self.assertEqual(done["column_id"], self.done, "completing moves the card to the Done column")
        self.assertIsNotNone(done["completed_at"])
        msgs = self.unread("lead")
        self.assertIn("Ana accepted: Do the thing", msgs)
        self.assertIn("Ana is blocked on 'Do the thing': Waiting on a part", msgs)
        self.assertIn("Ana completed: Do the thing", msgs)
        kinds = [a["kind"] for a in self.hub.activity(t["id"])]
        self.assertEqual(kinds, ["created", "assigned", "accepted", "blocked", "unblocked", "completed"])

    def test_only_assignee_or_leader_can_accept(self):
        t = self.make(assignee_id="ana")
        with self.assertRaises(Forbidden):
            self.hub.accept("ben", t["id"])
        self.hub.accept("lead", t["id"])  # leaders may accept on someone's behalf

    def test_picking_up_an_unassigned_task_assigns_it(self):
        t = self.make()
        self.hub.accept("ben", t["id"])
        t = self.hub.task(t["id"])
        self.assertEqual((t["assignee_id"], t["status"]), ("ben", "accepted"))
        self.assertEqual(self.unread("lead"), ["Ben accepted: Do the thing"])

    def test_reassign_resets_acceptance_and_tells_both(self):
        t = self.make(assignee_id="ana")
        self.hub.accept("ana", t["id"])
        self.hub.assign("lead", t["id"], "ben")
        t = self.hub.task(t["id"])
        self.assertEqual((t["assignee_id"], t["status"]), ("ben", "open"))
        self.assertEqual(self.unread("ben"), ["Lead assigned you: Do the thing"])
        self.assertIn("Lead reassigned 'Do the thing' to Ben", self.unread("ana"))

    def test_block_needs_a_reason(self):
        t = self.make(assignee_id="ana")
        with self.assertRaises(TaskHubError):
            self.hub.block("ana", t["id"], "  ")

    def test_reopen_leaves_done_column(self):
        t = self.make(assignee_id="ana")
        self.hub.complete("ana", t["id"])
        self.hub.reopen("lead", t["id"])
        t = self.hub.task(t["id"])
        self.assertEqual((t["status"], t["column_id"], t["completed_at"]), ("open", self.todo, None))
        self.assertIn("Lead reopened: Do the thing", self.unread("ana"))

    def test_comment_notifies_participants_but_not_author(self):
        t = self.make(assignee_id="ana")
        self.hub.comment("ben", t["id"], "I can help with this")
        self.hub.comment("ana", t["id"], "Thanks, grab the ladder")
        self.assertIn("Ana on 'Do the thing': Thanks, grab the ladder", self.unread("ben"))
        self.assertIn("Ana on 'Do the thing': Thanks, grab the ladder", self.unread("lead"))
        self.assertNotIn("Ana on 'Do the thing': Thanks, grab the ladder", self.unread("ana"))
        self.assertEqual(len(self.hub.comments(t["id"])), 2)

    def test_delete_is_for_creator_or_leader(self):
        t = self.make(actor="ana")
        with self.assertRaises(Forbidden):
            self.hub.delete_task("ben", t["id"])
        self.hub.delete_task("ana", t["id"])
        with self.assertRaises(NotFound):
            self.hub.task(t["id"])


class BoardMechanics(HubBase):
    def test_move_to_done_completes_and_back_reopens(self):
        t = self.make(assignee_id="ana")
        self.hub.move_task("ana", t["id"], self.done)
        self.assertEqual(self.hub.task(t["id"])["status"], "done")
        self.assertIn("Ana completed: Do the thing", self.unread("lead"))
        self.hub.move_task("ana", t["id"], self.doing)
        t = self.hub.task(t["id"])
        self.assertEqual((t["status"], t["completed_at"]), ("open", None))

    def test_ordering_within_a_column(self):
        a, b, c = (self.make(title=x) for x in "abc")
        order = lambda: [t["title"] for t in sorted(self.hub.tasks(board_id=self.board["id"]), key=lambda t: t["position"])]  # noqa: E731
        self.assertEqual(order(), ["a", "b", "c"])
        self.hub.move_task("lead", c["id"], self.todo, before_id=a["id"])
        self.assertEqual(order(), ["c", "a", "b"])
        self.hub.move_task("lead", a["id"], self.todo, after_id=b["id"])
        self.assertEqual(order(), ["c", "b", "a"])
        self.hub.move_task("lead", c["id"], self.todo, before_id=a["id"], after_id=b["id"])
        self.assertEqual(order(), ["b", "c", "a"])

    def test_move_to_foreign_column_rejected(self):
        other = self.hub.add_board("Other")
        t = self.make()
        with self.assertRaises(TaskHubError):
            self.hub.move_task("lead", t["id"], other["columns"][0]["id"])

    def test_columns_add_rename_remove_moves_tasks(self):
        b = self.hub.add_column(self.board["id"], "Waiting", "doing")
        waiting = b["columns"][-1]["id"]
        t = self.make(column_id=waiting)
        self.hub.update_column(self.board["id"], waiting, {"name": "On hold", "order": 0})
        self.assertEqual(self.hub.board(self.board["id"])["columns"][0]["name"], "On hold")
        self.hub.remove_column(self.board["id"], waiting, move_to=self.doing)
        self.assertEqual(self.hub.task(t["id"])["column_id"], self.doing)
        with self.assertRaises(NotFound):
            self.hub.remove_column(self.board["id"], "nope")

    def test_custom_columns_and_create_in_done_column(self):
        b = self.hub.add_board("Projects", columns=[{"name": "Ideas", "kind": "todo"}, {"name": "Shipped", "kind": "done"}])
        t = self.hub.create_task("lead", {"board_id": b["id"], "column_id": b["columns"][1]["id"], "title": "x"})
        self.assertEqual(t["status"], "done")

    def test_validation(self):
        with self.assertRaises(TaskHubError):
            self.make(title="   ")
        with self.assertRaises(TaskHubError):
            self.make(priority="asap")
        with self.assertRaises(TaskHubError):
            self.make(due_at="next tuesday")
        with self.assertRaises(NotFound):
            self.make(assignee_id="ghost")
        with self.assertRaises(TaskHubError):
            self.hub.add_board("  ")
        with self.assertRaises(TaskHubError):
            self.hub.add_member("", "member")
        with self.assertRaises(TaskHubError):
            self.hub.add_member("Zed", "boss")

    def test_update_fields_log_activity_and_notify_assignee(self):
        t = self.make(assignee_id="ana", labels="a, b, A")
        self.assertEqual(t["labels"], ["a", "b"], "labels are trimmed and deduplicated case-insensitively")
        t2 = self.hub.update_task("lead", t["id"], {
            "title": "Do the better thing", "due_at": "2030-01-02", "priority": "urgent",
            "checklist": ["step one", {"text": "step two", "done": True}],
        })
        self.assertEqual(t2["version"], t["version"] + 1)
        self.assertEqual([i["done"] for i in t2["checklist"]], [False, True])
        kinds = {a["kind"] for a in self.hub.activity(t["id"])}
        self.assertTrue({"retitled", "due_changed", "priority_changed", "checklist_changed"} <= kinds)
        self.assertTrue(any(m.startswith("Lead updated") for m in self.unread("ana")))

    def test_stale_version_conflicts(self):
        t = self.make()
        self.hub.update_task("lead", t["id"], {"title": "first"})
        with self.assertRaises(Conflict):
            self.hub.update_task("lead", t["id"], {"title": "second", "version": t["version"]})

    def test_update_assignee_goes_through_assign(self):
        t = self.make()
        self.hub.update_task("lead", t["id"], {"assignee_id": "ben"})
        self.assertEqual(self.unread("ben"), ["Lead assigned you: Do the thing"])


class Views(HubBase):
    def test_my_tasks_buckets_and_delegated(self):
        today = date(2026, 10, 27)
        self.make(title="late", assignee_id="ana", due_at="2026-10-20")
        self.make(title="now", assignee_id="ana", due_at="2026-10-27")
        self.make(title="soon", assignee_id="ana", due_at="2026-11-01")
        self.make(title="far", assignee_id="ana", due_at="2026-12-25")
        self.make(title="whenever", assignee_id="ana")
        finished = self.make(title="finished", assignee_id="ana")
        self.hub.complete("ana", finished["id"])
        self.make(actor="ana", title="handed off", assignee_id="ben")
        mine = self.hub.my_tasks("ana", today)
        groups = {k: [t["title"] for t in v] for k, v in mine["assigned"].items()}
        self.assertEqual(groups, {"overdue": ["late"], "today": ["now"], "week": ["soon"], "later": ["far"],
                                  "none": ["whenever"], "done": ["finished"]})
        self.assertEqual([t["title"] for t in mine["delegated"]], ["handed off"])
        self.assertEqual(due_bucket(None), "none")

    def test_search_and_filters(self):
        self.make(title="Order gloves", assignee_id="ana", labels=["supplies"], priority="high")
        self.make(title="Fix sink", assignee_id="ben", labels=["maintenance"])
        self.assertEqual([t["title"] for t in self.hub.search("glove")], ["Order gloves"])
        self.assertEqual([t["title"] for t in self.hub.search(label="maintenance")], ["Fix sink"])
        self.assertEqual([t["title"] for t in self.hub.search(assignee_id="ana", priority="high")], ["Order gloves"])
        self.assertEqual(self.hub.search("nothing here"), [])

    def test_notifications_read_state(self):
        self.make(assignee_id="ana")
        self.make(assignee_id="ana", title="Second")
        self.assertEqual(self.hub.unread_count("ana"), 2)
        first = self.hub.notifications("ana")[0]["id"]
        self.assertEqual(self.hub.mark_read("ana", [first]), 1)
        self.assertEqual(self.hub.unread_count("ana"), 1)
        self.assertEqual(self.hub.mark_read("ana"), 1)
        self.assertEqual(self.hub.unread_count("ana"), 0)

    def test_members_and_boards_lifecycle(self):
        self.hub.update_member("ben", {"active": False, "role": "leader"})
        self.assertEqual([m["id"] for m in self.hub.members()], ["ana", "lead"])
        self.assertEqual(len(self.hub.members(include_inactive=True)), 3)
        self.hub.update_board(self.board["id"], {"archived": True})
        self.assertEqual(self.hub.boards(), [])
        self.assertEqual(len(self.hub.boards(include_archived=True)), 1)


class HttpApi(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.testing = True
        self.c = self.app.test_client()
        self.hub = self.app.extensions["taskhub"]
        self.hub.add_member("Lead", "leader", "lead")
        self.hub.add_member("Ana", "member", "ana")
        self.board = self.hub.add_board("Ops")

    def tearDown(self):
        self.hub.store.close()

    def req(self, method, path, who="lead", **kw):
        return getattr(self.c, method)(f"/taskhub/api{path}", headers={"X-Taskhub-Member": who}, **kw)

    def test_page_and_static_serve(self):
        r = self.c.get("/taskhub/")
        self.assertEqual(r.status_code, 200)
        self.assertIn(b'data-taskhub-api="/taskhub/api"', r.data)
        self.assertEqual(self.c.get("/static/js/taskhub.js").status_code, 200)
        self.assertEqual(self.c.get("/static/css/taskhub.css").status_code, 200)
        self.assertEqual(self.c.get("/").status_code, 302)

    def test_bootstrap_identifies_me(self):
        r = self.req("get", "/bootstrap", who="ana")
        self.assertEqual(r.get_json()["me"]["name"], "Ana")
        r = self.c.get("/taskhub/api/bootstrap?me=lead")
        self.assertEqual(r.get_json()["me"]["name"], "Lead")
        self.assertEqual(len(r.get_json()["boards"]), 1)

    def test_full_delegation_over_http(self):
        r = self.req("post", "/tasks", json={"board_id": self.board["id"], "title": "Count the safe", "assignee_id": "ana", "due_at": "2030-05-05"})
        self.assertEqual(r.status_code, 201)
        tid = r.get_json()["id"]
        self.assertEqual(self.req("get", "/notifications", who="ana").get_json()["unread"], 1)
        self.assertEqual(self.req("post", f"/tasks/{tid}/accept", who="ana").get_json()["status"], "accepted")
        r = self.req("post", f"/tasks/{tid}/block", who="ana", json={"reason": "Key is missing"})
        self.assertEqual(r.get_json()["blocked_reason"], "Key is missing")
        self.req("post", f"/tasks/{tid}/comments", who="lead", json={"body": "Spare key is in my office"})
        self.assertEqual(self.req("post", f"/tasks/{tid}/unblock", who="ana").get_json()["status"], "accepted")
        self.assertEqual(self.req("post", f"/tasks/{tid}/complete", who="ana").get_json()["status"], "done")
        full = self.req("get", f"/tasks/{tid}").get_json()
        self.assertEqual(len(full["comments"]), 1)
        self.assertEqual([a["kind"] for a in full["activity"]][-1], "completed")
        lead_notes = self.req("get", "/notifications", who="lead").get_json()
        self.assertEqual(lead_notes["unread"], 4)  # accepted, blocked, unblocked, completed
        r = self.req("post", "/notifications/read", who="lead", json={})
        self.assertEqual(r.get_json(), {"marked": 4, "unread": 0})
        mine = self.req("get", "/my-tasks?today=2030-05-01", who="ana").get_json()
        self.assertEqual([t["id"] for t in mine["assigned"]["done"]], [])  # completed "today" (2026) is >7 days before 2030
        mine = self.req("get", "/my-tasks", who="ana").get_json()
        self.assertEqual([t["id"] for t in mine["assigned"]["done"]], [tid])

    def test_errors_are_json(self):
        r = self.req("post", "/tasks", json={"board_id": self.board["id"], "title": ""})
        self.assertEqual((r.status_code, r.get_json()["error"]), (400, "title is required"))
        self.assertEqual(self.req("get", "/tasks/nope").status_code, 404)
        self.assertEqual(self.c.get("/taskhub/api/my-tasks").status_code, 401)
        r = self.req("post", "/tasks/x/move", json={})
        self.assertEqual(r.status_code, 400)

    def test_move_and_conflict_over_http(self):
        cols = self.board["columns"]
        a = self.req("post", "/tasks", json={"board_id": self.board["id"], "title": "a"}).get_json()
        b = self.req("post", "/tasks", json={"board_id": self.board["id"], "title": "b"}).get_json()
        r = self.req("post", f"/tasks/{b['id']}/move", json={"column_id": cols[0]["id"], "before_id": a["id"]})
        self.assertLess(r.get_json()["position"], a["position"])
        r = self.req("patch", f"/tasks/{a['id']}", json={"title": "A!", "version": 999})
        self.assertEqual(r.status_code, 409)
        r = self.req("patch", f"/tasks/{a['id']}", json={"title": "A!", "version": a["version"]})
        self.assertEqual(r.get_json()["title"], "A!")
        self.assertEqual(self.req("delete", f"/tasks/{a['id']}").status_code, 204)
        tasks = self.req("get", f"/boards/{self.board['id']}/tasks").get_json()
        self.assertEqual([t["title"] for t in tasks], ["b"])

    def test_board_and_member_admin(self):
        r = self.req("post", "/boards", json={"name": "Projects", "columns": [{"name": "Ideas"}, {"name": "Shipped", "kind": "done"}]})
        self.assertEqual(r.status_code, 201)
        bid = r.get_json()["id"]
        r = self.req("post", f"/boards/{bid}/columns", json={"name": "Building", "kind": "doing"})
        self.assertEqual([c["name"] for c in r.get_json()["columns"]], ["Ideas", "Shipped", "Building"])
        col = r.get_json()["columns"][2]["id"]
        r = self.req("patch", f"/boards/{bid}/columns/{col}", json={"order": 1})
        self.assertEqual([c["name"] for c in r.get_json()["columns"]], ["Ideas", "Building", "Shipped"])
        r = self.req("delete", f"/boards/{bid}/columns/{col}", json={})
        self.assertEqual(len(r.get_json()["columns"]), 2)
        r = self.req("post", "/members", json={"name": "Cy", "role": "member"})
        self.assertEqual(r.status_code, 201)
        r = self.req("patch", f"/members/{r.get_json()['id']}", json={"active": False})
        self.assertFalse(r.get_json()["active"])
        self.assertEqual(len(self.req("get", "/members").get_json()), 2)
        self.assertEqual(len(self.req("get", "/members?all=1").get_json()), 3)

    def test_seeded_demo_is_consistent(self):
        app = create_app(seed=True)
        hub = app.extensions["taskhub"]
        self.assertEqual(len(hub.boards()), 2)
        self.assertTrue(all(hub.board(t["board_id"]) for t in hub.tasks()))
        blocked = [t for t in hub.tasks() if t["status"] == "blocked"]
        self.assertTrue(blocked and all(t["blocked_reason"] for t in blocked))
        hub.store.close()


class Backends(unittest.TestCase):
    def test_json_file_backend_persists(self):
        import os, tempfile
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "t.json")
            hub = TaskHub(Store(JsonFileBackend(path)))
            hub.add_member("A", "admin", "a")
            b = hub.add_board("B")
            t = hub.create_task("a", {"board_id": b["id"], "title": "persist me", "labels": ["x"]})
            hub2 = TaskHub(Store(JsonFileBackend(path)))
            again = hub2.task(t["id"])
            self.assertEqual((again["title"], again["labels"]), ("persist me", ["x"]))
            self.assertEqual(hub2.member("a")["name"], "A")

    def test_firebase_backend_writes_one_record_per_change(self):
        """Each record under taskhub/<table>/<id>; a change touches only its
        own path, and a cold start reads the tree once."""
        tree, log = {}, []

        class Ref:
            def __init__(self, path): self.parts = path.strip("/").split("/")
            def get(self):
                node = tree
                for p in self.parts:
                    node = node.get(p) if isinstance(node, dict) else None
                    if node is None: return None
                return node
            def set(self, value):
                log.append(("set", "/".join(self.parts)))
                node = tree
                for p in self.parts[:-1]: node = node.setdefault(p, {})
                node[self.parts[-1]] = value
            def delete(self):
                log.append(("delete", "/".join(self.parts)))
                node = tree
                for p in self.parts[:-1]: node = node.get(p, {})
                node.pop(self.parts[-1], None)

        hub = TaskHub(Store(FirebaseBackend(Ref)))
        hub.add_member("A", "admin", "a")
        b = hub.add_board("B")
        t = hub.create_task("a", {"board_id": b["id"], "title": "cloud", "labels": [], "checklist": []})
        self.assertIn(("set", f"taskhub/tasks/{t['id']}"), log)
        self.assertIn(("set", f"taskhub/activity/{hub.activity(t['id'])[0]['id']}"), log)
        log.clear()
        hub.update_task("a", t["id"], {"title": "cloud 2"})
        self.assertEqual([p for k, p in log if k == "set" and p.startswith("taskhub/tasks/")], [f"taskhub/tasks/{t['id']}"])
        # Firebase keeps no empty lists: a fresh server fills them back in.
        tree["taskhub"]["tasks"][t["id"]].pop("labels", None)
        tree["taskhub"]["tasks"][t["id"]].pop("checklist", None)
        hub2 = TaskHub(Store(FirebaseBackend(Ref)))
        again = hub2.task(t["id"])
        self.assertEqual((again["title"], again["labels"], again["checklist"]), ("cloud 2", [], []))
        self.assertEqual(hub2.boards()[0]["name"], "B")
        hub2.delete_task("a", t["id"])
        self.assertIn(("delete", f"taskhub/tasks/{t['id']}"), log)
        self.assertNotIn(t["id"], tree["taskhub"]["tasks"])

    def test_unreadable_backend_serves_nothing_until_it_reads(self):
        class Flaky:
            calls = 0
            def load(self):
                Flaky.calls += 1
                if Flaky.calls == 1: raise ConnectionError("down")
                return {"boards": {"b1": {"id": "b1", "name": "Back", "columns": [{"id": "c", "name": "To Do", "kind": "todo"}], "archived": False, "created_at": "2026-01-01T00:00:00+00:00"}}}
            def put(self, *a): pass
            def delete(self, *a): pass
        hub = TaskHub(Store(Flaky()))
        with self.assertRaises(StoreUnavailable):
            hub.boards()
        self.assertEqual([b["name"] for b in hub.boards()], ["Back"])   # the next call reads again
        app = create_app()
        app.testing = True
        Flaky.calls = 0
        app.extensions["taskhub"].store = Store(Flaky())
        app.extensions["taskhub"].store.backend = Flaky()
        r = app.test_client().get("/taskhub/api/boards")
        self.assertEqual(r.status_code, 503)
        self.assertIn("Try again", r.get_json()["error"])


class HostIdentity(unittest.TestCase):
    """Inside the hub the server says who someone is and who can be given work."""

    def setUp(self):
        from flask import Flask
        from taskhub import create_blueprint
        self.people = [{"id": "p_tim", "name": "Tim Lane", "role": "director"},
                       {"id": "p_ana", "name": "Ana Ruiz", "role": "lead"},
                       {"id": "p_ben", "name": "Ben Cole", "role": "member"}]
        self.who = None
        self.hub = TaskHub(Store(MemoryBackend()), people=lambda: self.people)
        app = Flask(__name__)
        app.testing = True
        app.register_blueprint(create_blueprint(hub=self.hub, resolve_member=lambda: self.who))
        self.c = app.test_client()
        self.board = self.hub.add_board("Ops")

    def test_nobody_signed_in_can_look_but_not_act(self):
        r = self.c.get("/taskhub/api/bootstrap")
        self.assertEqual((r.get_json()["me"], r.get_json()["host"]), (None, True))
        self.assertEqual([m["name"] for m in r.get_json()["members"]], ["Ana Ruiz", "Ben Cole", "Tim Lane"])
        self.assertEqual(self.c.get(f"/taskhub/api/boards/{self.board['id']}").status_code, 200)
        r = self.c.post("/taskhub/api/tasks", json={"board_id": self.board["id"], "title": "x"})
        self.assertEqual((r.status_code, r.get_json()["error"]), (401, "Sign in to use Tasks."))
        self.assertEqual(self.c.get("/taskhub/api/my-tasks").status_code, 401)
        self.assertEqual(self.c.get("/taskhub/api/notifications").get_json(), {"items": [], "unread": 0})

    def test_signed_in_person_is_remembered_with_the_hubs_role(self):
        self.who = {"id": "p_ana", "name": "Ana Ruiz", "role": "lead"}
        r = self.c.get("/taskhub/api/bootstrap")
        self.assertEqual(r.get_json()["me"]["role"], "admin" if False else "leader")
        self.assertEqual(self.hub.store.get_member("p_ana")["role"], "leader")
        r = self.c.post("/taskhub/api/tasks", json={"board_id": self.board["id"], "title": "Count the safe", "assignee_id": "p_ben"})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.get_json()["created_by"], "p_ana")
        self.assertEqual(self.hub.notifications("p_ben")[0]["message"], "Ana Ruiz assigned you: Count the safe")
        # A director (the hub's word) is an admin here: may accept for someone and delete anything.
        self.who = {"id": "p_tim", "name": "Tim Lane", "role": "director"}
        tid = r.get_json()["id"]
        self.assertEqual(self.c.post(f"/taskhub/api/tasks/{tid}/accept").status_code, 200)
        self.assertEqual(self.c.delete(f"/taskhub/api/tasks/{tid}").status_code, 204)

    def test_someone_off_the_list_keeps_their_name(self):
        self.who = {"id": "p_ben", "name": "Ben Cole", "role": "member"}
        t = self.c.post("/taskhub/api/tasks", json={"board_id": self.board["id"], "title": "Mop", "assignee_id": "p_ben"}).get_json()
        self.people = [p for p in self.people if p["id"] != "p_ben"]      # Ben's PIN came off the list
        self.who = {"id": "p_tim", "name": "Tim Lane", "role": "director"}
        members = self.c.get("/taskhub/api/bootstrap").get_json()["members"]
        ben = next(m for m in members if m["id"] == "p_ben")
        self.assertEqual((ben["name"], ben["active"]), ("Ben Cole", False))   # still named, no longer offered
        self.assertEqual(self.c.get(f"/taskhub/api/tasks/{t['id']}").get_json()["assignee_id"], "p_ben")
        self.assertEqual([m["id"] for m in self.c.get("/taskhub/api/members").get_json()], ["p_ana", "p_tim"])

    def test_a_renamed_or_promoted_person_updates_on_their_next_request(self):
        self.who = {"id": "p_ben", "name": "Ben Cole", "role": "member"}
        self.c.get("/taskhub/api/bootstrap")
        self.who = {"id": "p_ben", "name": "Benjamin Cole", "role": "lead"}
        self.c.get("/taskhub/api/bootstrap")
        self.assertEqual((self.hub.store.get_member("p_ben")["name"], self.hub.store.get_member("p_ben")["role"]), ("Benjamin Cole", "leader"))

    def test_today_is_the_phones_day_not_the_servers(self):
        self.who = {"id": "p_ana", "name": "Ana Ruiz", "role": "lead"}
        self.c.post("/taskhub/api/tasks", json={"board_id": self.board["id"], "title": "Tonight", "assignee_id": "p_ana", "due_at": "2026-10-27"})
        late = self.c.get("/taskhub/api/my-tasks?today=2026-10-27").get_json()["assigned"]
        self.assertEqual([t["title"] for t in late["today"]], ["Tonight"])
        self.assertEqual(self.c.get("/taskhub/api/my-tasks?today=yesterday").status_code, 400)


if __name__ == "__main__":
    unittest.main()
