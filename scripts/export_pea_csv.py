#!/usr/bin/env python3
"""Exports recent Levelset Positional Excellence ratings to a CSV.

Reads the same public scorecard feed as the "Sync from Levelset" button, so it
needs the same token in the environment:

    LEVELSET_PEA_TOKEN=<token> python3 scripts/export_pea_csv.py            # last 30 days
    LEVELSET_PEA_TOKEN=<token> python3 scripts/export_pea_csv.py --days 7

The file goes to exports/ (ignored by git: it holds staff names and scores),
or to --out. Only counts and warnings are printed, never names or scores.
LEVELSET_TIMEZONE sets the restaurant's time zone (default America/Chicago).

Levelset shows only each person's latest few ratings per position, so the
oldest days of a busy range can be missing; the warnings say when.
"""
import argparse
import csv
import os
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sys.path.insert(0, ROOT)
from levelset_feed import DEFAULT_TIMEZONE, FeedError, fetch_pea_feed  # noqa: E402

EXPORT_TIMEOUT = 90   # seconds; no web server limit here, so allow slow days
COLUMNS = ['Date', 'Time', 'Area', 'Employee', 'Position', 'Leader',
           'Criteria 1', 'Criteria 2', 'Criteria 3', 'Criteria 4', 'Criteria 5', 'Overall']


def in_range(ratings, start, end):
    """Ratings dated start..end (ISO dates, inclusive), oldest first."""
    return sorted((r for r in ratings if start <= r['at'][:10] <= end), key=lambda r: r['at'])


def write_csv(ratings, path):
    """UTF-8 with a byte-order mark so Excel reads accented names correctly."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'w', newline='', encoding='utf-8-sig') as f:
        out = csv.writer(f)
        out.writerow(COLUMNS)
        for r in ratings:
            date, time = r['at'].split('T')
            out.writerow([date, time, r['area'], r['employee'], r['position'], r['leader'],
                          *[f'{c:g}' for c in r['criteria']], f"{r['overall']:.2f}"])


def main(argv=None):
    ap = argparse.ArgumentParser(description='Export recent Levelset PEA ratings to a CSV.')
    ap.add_argument('--days', type=int, default=30, help='how many days back to include (default 30)')
    ap.add_argument('--out', default=os.path.join(ROOT, 'exports'), help='folder for the CSV (default exports/)')
    args = ap.parse_args(argv)
    if args.days < 1:
        ap.error('--days must be at least 1')

    token = (os.environ.get('LEVELSET_PEA_TOKEN') or '').strip()
    if not token:
        print('Set LEVELSET_PEA_TOKEN to the last part of the Levelset public link.', file=sys.stderr)
        return 2
    tz_name = os.environ.get('LEVELSET_TIMEZONE') or DEFAULT_TIMEZONE
    try:
        result = fetch_pea_feed(token, tz_name, total_timeout=EXPORT_TIMEOUT)
    except FeedError as e:
        print(f'Error: {e}', file=sys.stderr)
        return 1

    today = datetime.now(ZoneInfo(tz_name)).date()
    start = today - timedelta(days=args.days)
    rows = in_range(result['ratings'], start.isoformat(), today.isoformat())
    path = os.path.join(args.out, f'pea_ratings_{start}_to_{today}.csv')
    write_csv(rows, path)

    print(f'Wrote {len(rows)} ratings ({start} to {today}) to {os.path.relpath(path)}')
    for area in ('FOH', 'BOH'):
        print(f'  {area}: {sum(1 for r in rows if r["area"] == area)}')
    for warning in result['warnings']:
        print(f'Note: {warning}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
