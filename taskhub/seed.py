"""Demo data for the standalone app. Generic team, generic work."""

from __future__ import annotations

from datetime import date, timedelta

from .service import TaskHub


def seed_demo(hub: TaskHub) -> None:
    if hub.members():
        return
    today = date.today()
    d = lambda n: (today + timedelta(days=n)).isoformat()  # noqa: E731

    avery = hub.add_member("Avery Cole", "admin", "m_avery")
    jordan = hub.add_member("Jordan Reyes", "leader", "m_jordan")
    sam = hub.add_member("Sam Patel", "member", "m_sam")
    riley = hub.add_member("Riley Nguyen", "member", "m_riley")
    casey = hub.add_member("Casey Brooks", "member", "m_casey")

    ops = hub.add_board("Operations", "Day-to-day work that keeps the place running.")
    proj = hub.add_board("Projects", "Longer efforts with a start and an end.", [
        {"name": "Ideas", "kind": "todo"},
        {"name": "Planned", "kind": "todo"},
        {"name": "Building", "kind": "doing"},
        {"name": "Review", "kind": "doing"},
        {"name": "Shipped", "kind": "done"},
    ])
    todo, doing, done = (c["id"] for c in ops["columns"])
    ideas, planned, building, review, shipped = (c["id"] for c in proj["columns"])

    def task(actor, board, column, title, **kw):
        return hub.create_task(actor["id"], {"board_id": board["id"], "column_id": column, "title": title, **kw})

    t1 = task(avery, ops, todo, "Order replacement sanitizer test strips",
              assignee_id=sam["id"], due_at=d(-1), priority="high", labels=["supplies"],
              description="Current box runs out Thursday. Vendor portal, usual account.")
    t2 = task(avery, ops, todo, "Update the opening checklist for the new walk-in",
              assignee_id=riley["id"], due_at=d(0), priority="normal", labels=["checklists"],
              checklist=["Draft new steps", "Walk it with a morning lead", "Print and laminate"])
    t3 = task(jordan, ops, doing, "Fix the loose handle on prep sink 2",
              assignee_id=casey["id"], due_at=d(2), priority="urgent", labels=["maintenance"])
    t4 = task(jordan, ops, todo, "Schedule the quarterly hood cleaning",
              assignee_id=sam["id"], due_at=d(6), labels=["vendors", "maintenance"])
    t5 = task(avery, ops, todo, "Write up the new closing count procedure",
              due_at=d(10), labels=["procedures"], priority="low")
    t6 = task(riley, ops, done, "Restock first aid kits (both)", assignee_id=riley["id"], labels=["supplies"])
    t7 = task(avery, ops, doing, "Train two more people on the register close-out",
              assignee_id=jordan["id"], due_at=d(4), priority="high", labels=["training"],
              checklist=[{"text": "Pick trainees", "done": True}, {"text": "First walkthrough"}, {"text": "Solo close with sign-off"}])

    p1 = task(avery, proj, planned, "Digital temperature logs for all coolers",
              assignee_id=jordan["id"], due_at=d(21), priority="high", labels=["food-safety", "tech"],
              description="Replace the paper logs. Needs a sensor quote and a sign-off on the form layout.")
    p2 = task(jordan, proj, building, "New-hire welcome packet",
              assignee_id=riley["id"], due_at=d(9), labels=["training"],
              checklist=["Outline", "Draft", "Review with Avery", "Print 10 copies"])
    p3 = task(avery, proj, ideas, "Swap paper schedule posting for a shared screen", labels=["tech"])
    p4 = task(jordan, proj, review, "Reorganize dry storage by use frequency",
              assignee_id=casey["id"], due_at=d(1), labels=["organization"])
    p5 = task(avery, proj, shipped, "Label every shelf in the walk-in", assignee_id=sam["id"], labels=["organization"])

    # Some history so the demo isn't sterile.
    hub.accept(sam["id"], t1["id"])
    hub.block(sam["id"], t1["id"], "Vendor portal says the item is backordered until next week.")
    hub.comment(avery["id"], t1["id"], "Try the secondary supplier; same part number works.")
    hub.accept(riley["id"], t2["id"])
    hub.comment(riley["id"], t2["id"], "Draft is done, walking it with Jordan tomorrow at open.")
    hub.accept(casey["id"], t3["id"])
    hub.accept(jordan["id"], t7["id"])
    hub.accept(jordan["id"], p1["id"])
    hub.comment(jordan["id"], p1["id"], "Two sensor quotes in. Cheaper one has no app, so leaning toward the other.")
    hub.accept(riley["id"], p2["id"])
    hub.accept(casey["id"], p4["id"])
    hub.comment(casey["id"], p4["id"], "Done except the top shelf. Needs a second person for the heavy bins.")
