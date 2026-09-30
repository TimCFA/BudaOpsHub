# Read by gunicorn on start (it looks for ./gunicorn.conf.py), whatever the
# start command says.
#
# One worker process: the server keeps the latest saved data in memory
# (app.py, "SAVED STATE"), so a second process would disagree with it.
# Threads let that one process answer many people at once (shift change:
# 30+ phones opening the site together); the saved data is guarded by a lock.
workers = 1
threads = 8
worker_class = 'gthread'
# Smart Shop PDFs take a few seconds to read.
timeout = 60
