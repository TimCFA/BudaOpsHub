"""Run TaskHub standalone: python3 -m taskhub [--db PATH] [--port N] [--no-seed]"""

import argparse
import os

from . import create_app

parser = argparse.ArgumentParser(description="TaskHub standalone server")
parser.add_argument("--db", default=os.environ.get("TASKHUB_DB", "taskhub.json"))
parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "5055")))
parser.add_argument("--no-seed", action="store_true", help="start with an empty database")
args = parser.parse_args()

app = create_app(db_path=args.db, seed=not args.no_seed)
print(f"TaskHub on http://localhost:{args.port}/taskhub/  (db: {args.db})")
app.run(host="0.0.0.0", port=args.port, debug=False, threaded=True)
