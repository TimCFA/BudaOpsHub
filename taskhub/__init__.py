"""TaskHub: a self-contained task delegation module (Flask blueprint + vanilla JS).

Standalone:
    python3 -m taskhub            # serves http://localhost:5055/taskhub/

Mounted inside another Flask app:
    from taskhub import create_blueprint
    app.register_blueprint(create_blueprint(
        db_path="taskhub.db",
        resolve_member=lambda: session.get("member_id"),   # your auth
    ))

`resolve_member` is the only seam the host needs to provide. It returns the
current member's id (or None). The default reads the `X-Taskhub-Member`
header or a `me` query parameter, which is what the standalone demo uses.
"""

from __future__ import annotations

import os

from flask import Flask

from .api import create_blueprint
from .service import TaskHub
from .store import Store

__all__ = ["create_blueprint", "create_app", "TaskHub", "Store"]


def create_app(db_path: str | None = None, seed: bool = False) -> Flask:
    """Standalone app for development, demos and tests."""
    app = Flask(__name__)
    db_path = db_path or os.environ.get("TASKHUB_DB", ":memory:")
    store = Store(db_path)
    hub = TaskHub(store)
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
