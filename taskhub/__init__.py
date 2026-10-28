"""TaskHub: task delegation for the Ops Hub (Flask blueprint + vanilla JS).

In the hub (app.py):
    from taskhub import create_blueprint, FirebaseBackend
    app.register_blueprint(create_blueprint(
        backend=FirebaseBackend(lambda path: db.reference(path)),
        resolve_member=...,   # {id, name, role} from the hub's session, or None
        people=...,           # [{id, name, role}]: who can be given work
    ))
The page is the hub's own: a Tasks tab, a #tasksView, and
static/js/taskhub.js + static/css/taskhub.css.

Standalone, for development and demos (no hub, no Firebase):
    python3 -m taskhub            # http://localhost:5055/taskhub/
"""

from __future__ import annotations

import os

from flask import Flask

from .api import create_blueprint
from .service import TaskHub
from .store import FirebaseBackend, JsonFileBackend, MemoryBackend, Store

__all__ = ["create_blueprint", "create_app", "TaskHub", "Store",
           "FirebaseBackend", "JsonFileBackend", "MemoryBackend"]

REPO_STATIC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")


def create_app(db_path: str | None = None, seed: bool = False) -> Flask:
    """Standalone app: the hub's static folder (for taskhub.js and .css),
    a JSON file for data (or memory when db_path is None), and the demo
    people with an "I am" picker in place of the hub's sign-in."""
    app = Flask(__name__, static_folder=REPO_STATIC, static_url_path="/static")
    backend = JsonFileBackend(db_path) if db_path else MemoryBackend()
    hub = TaskHub(Store(backend))
    if seed:
        from .seed import seed_demo
        seed_demo(hub)
    app.register_blueprint(create_blueprint(hub=hub))
    app.extensions["taskhub"] = hub

    @app.get("/")
    def _root():
        from flask import redirect
        return redirect("/taskhub/")

    return app
