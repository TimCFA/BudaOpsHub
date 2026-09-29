"""Reads the public Levelset "Positional Excellence" scorecard feed.

Levelset's share link (app.levelset.io/public/positional-excellence/<token>)
is a web page that loads its numbers from JSON endpoints on the same host,
with the token as the only credential. This fetches those endpoints and
returns the same shape as pea_parser.parse_pea_pdf, so the page merges a
sync exactly like an uploaded PDF:

    {'ratings': [...], 'summary': {...}, 'warnings': [...]}

What the feed does and doesn't give (checked against the live page):
  * /api/ratings?tab=overview lists each person's latest 4 ratings across all
    positions; tab=position&position=X lists their latest 4 *in that
    position*. So one call per position is needed to see everything.
  * Timestamps are UTC. The PDF prints local time, so they're converted
    (LEVELSET_TIMEZONE, default America/Chicago) or synced ratings would
    never match the same ratings already saved from a PDF.
  * Positions for the leadership/new-hire ratings carry an area suffix
    ("Team Lead FOH"); the app's own names don't ("Team Lead").
  * There is no role field. `role` is returned blank and the page carries a
    person's role forward from what it already has.
  * Only latest 4 per person per position: someone rated 4+ times in one
    position could have older ratings cut off. Coverage (which dates the
    page treats as "fully uploaded") is only claimed from the point where
    that can't have happened.

This is an undocumented endpoint, so every response is checked and a
changed format fails loudly instead of saving wrong scores. The token is
never put in an error message or log line.
"""
import re
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import requests

BASE_URL = 'https://app.levelset.io'
DEFAULT_TIMEZONE = 'America/Chicago'
AREAS = ('FOH', 'BOH')
WINDOW_DAYS = 90             # the feed's "90d" window
KNOWN_RECENT_CAP = 4         # latest ratings returned per person per view
REQUEST_TIMEOUT = 15         # seconds, per request
TOTAL_TIMEOUT = 22           # seconds for the whole sync (gunicorn kills a worker at 30)
MAX_WORKERS = 8
TOKEN_RE = re.compile(r'^[A-Za-z0-9_-]{6,64}$')
# Positions Levelset suffixes with the area, mapped to the app's names.
AREA_SUFFIXED = ('Team Lead', 'Trainer', '3H Week')


class FeedError(RuntimeError):
    """Something a manager can act on. The message is safe to show them."""


def _clean_position(name, area):
    name = (name or '').strip()
    for base in AREA_SUFFIXED:
        if name == f'{base} {area}':
            return base
    return name


def _get_json(session, token, params):
    """One feed request. Errors say what happened, never include the URL."""
    try:
        resp = session.get(f'{BASE_URL}/api/ratings', params={'token': token, **params},
                           headers={'Accept': 'application/json'}, timeout=REQUEST_TIMEOUT)
    except requests.RequestException:
        raise FeedError("Couldn't reach Levelset. Try again in a minute.") from None
    if resp.status_code in (401, 403, 404):
        raise FeedError('Levelset no longer accepts the sync link. Make a new public '
                        'Positional Excellence link in Levelset and update LEVELSET_PEA_TOKEN.')
    if resp.status_code != 200:
        raise FeedError(f'Levelset answered with an error ({resp.status_code}). Try again later.')
    try:
        body = resp.json()
    except ValueError:
        raise FeedError('Levelset sent something other than data. Its format may have changed.') from None
    if not isinstance(body, dict) or body.get('success') is not True or not isinstance(body.get('data'), list):
        raise FeedError("Levelset's data wasn't in the expected format, so nothing was saved.")
    return body['data']


def _parse_time(value, tz):
    """'2026-09-15T17:57:27.91909+00:00' -> local 'YYYY-MM-DDTHH:MM' (seconds dropped,
    as the PDF does) and the local date."""
    text = re.sub(r'\.\d+', '', str(value)).replace('Z', '+00:00')
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    local = dt.astimezone(tz)
    return local.strftime('%Y-%m-%dT%H:%M'), local.strftime('%Y-%m-%d')


def _to_rating(raw, area, tz):
    """One feed rating -> (app rating, local date) or raises on a bad shape."""
    criteria = [raw[f'rating_{i}'] for i in range(1, 6)]
    if not all(isinstance(c, (int, float)) and not isinstance(c, bool) and 1 <= c <= 3 for c in criteria):
        raise ValueError('criteria out of range')
    overall = raw['rating_avg']
    if not isinstance(overall, (int, float)) or abs(sum(criteria) / 5 - overall) > 0.011:
        raise ValueError('overall does not match criteria')
    employee = (raw.get('employee_name') or (raw.get('employee') or {}).get('full_name') or '').strip()
    position = _clean_position(raw.get('position'), area)
    if not employee or not position:
        raise ValueError('missing name or position')
    at, date = _parse_time(raw['created_at'], tz)
    return {
        'at': at,
        'employee': employee,
        'role': '',
        'leader': (raw.get('rater_name') or (raw.get('rater') or {}).get('full_name') or '').strip(),
        'position': position,
        'criteria': [float(c) for c in criteria],
        'overall': float(overall),
    }, date


def fetch_pea_feed(token, tz_name=DEFAULT_TIMEZONE, session=None, now=None):
    """Fetches every rating the feed will show, both areas.

    `session` (anything with .get) and `now` exist so tests can run offline.
    Raises FeedError with a message that's safe to show a manager.
    """
    token = (token or '').strip()
    if not TOKEN_RE.match(token):
        raise FeedError("The Levelset sync token isn't valid. Check LEVELSET_PEA_TOKEN.")
    try:
        tz = ZoneInfo(tz_name or DEFAULT_TIMEZONE)
    except (ZoneInfoNotFoundError, ValueError):
        raise FeedError(f'Unknown time zone "{tz_name}". Check LEVELSET_TIMEZONE.') from None
    session = session or requests.Session()
    today = (now or datetime.now(timezone.utc)).astimezone(tz).date()

    pool = ThreadPoolExecutor(max_workers=MAX_WORKERS)
    try:
        # 1. Positions per area, from the overview's per-person position table.
        overview = {a: pool.submit(_get_json, session, token, {'area': a, 'window': '90d', 'tab': 'overview'})
                    for a in AREAS}
        wait(overview.values(), timeout=TOTAL_TIMEOUT)
        positions = {}
        for area, fut in overview.items():
            if not fut.done():
                raise FeedError('Levelset was too slow to answer. Try again.')
            rows = fut.result()
            seen = []
            for row in rows:
                table = row.get('positions') if isinstance(row, dict) else None
                if not isinstance(table, dict):
                    raise FeedError("Levelset's data wasn't in the expected format, so nothing was saved.")
                seen += [p for p in table if p not in seen]
            positions[area] = seen

        # 2. Each position's ratings.
        jobs = {(a, p): pool.submit(_get_json, session, token,
                                    {'area': a, 'window': '90d', 'tab': 'position', 'position': p})
                for a in AREAS for p in positions[a]}
        done, pending = wait(jobs.values(), timeout=TOTAL_TIMEOUT)
        if pending:
            raise FeedError('Levelset was too slow to answer. Try again.')
        results = {key: fut.result() for key, fut in jobs.items()}
    finally:
        pool.shutdown(wait=False, cancel_futures=True)

    ratings, seen_ids, skipped = [], set(), 0
    cap = KNOWN_RECENT_CAP
    for rows in results.values():
        for row in rows:
            got = row.get('recent_ratings') if isinstance(row, dict) else None
            if not isinstance(got, list):
                raise FeedError("Levelset's data wasn't in the expected format, so nothing was saved.")
            cap = max(cap, len(got))
    complete_from = {a: today - timedelta(days=WINDOW_DAYS) for a in AREAS}
    for (area, _position), rows in sorted(results.items()):
        for row in rows:
            got = row['recent_ratings']
            oldest = None
            for raw in got:
                try:
                    rating, date = _to_rating(raw, area, tz)
                except (KeyError, ValueError, TypeError, AttributeError):
                    skipped += 1
                    continue
                oldest = date if oldest is None else min(oldest, date)
                key = raw.get('id') or (rating['at'], rating['employee'], rating['position'])
                if key in seen_ids:
                    continue
                seen_ids.add(key)
                ratings.append(rating)
            # A person at the cap in a position may have older ratings the feed
            # cut off; nothing before that date can be called complete.
            if len(got) >= cap and oldest:
                complete_from[area] = max(complete_from[area], datetime.strptime(oldest, '%Y-%m-%d').date())

    total = len(ratings) + skipped
    if skipped and skipped > max(2, total * 0.02):
        raise FeedError(f"{skipped} of {total} ratings from Levelset didn't read cleanly, so nothing was "
                        "saved. Its format may have changed.")
    warnings = []
    if skipped:
        warnings.append(f'{skipped} rating{"s" if skipped != 1 else ""} from Levelset could not be read and '
                        'were left out.')
    ratings.sort(key=lambda r: r['at'])

    coverage = {a: [complete_from[a].isoformat(), today.isoformat()]
                for a in AREAS if complete_from[a] <= today}
    for a in AREAS:
        if a not in coverage:
            warnings.append(f'{a} ratings may be incomplete: Levelset only shows the latest {cap} per '
                            'person per position.')
        elif complete_from[a] > today - timedelta(days=WINDOW_DAYS):
            warnings.append(f'{a} is complete from {complete_from[a].strftime("%b %d")} on. Earlier ratings '
                            f'for people with {cap}+ ratings in one position are cut off by Levelset; '
                            'upload the PDF to fill that in.')
    starts = sorted(c[0] for c in coverage.values())
    summary = {'source': 'levelset-feed', 'count': len(ratings), 'areas': list(coverage),
               'coverage': coverage}
    if starts:
        summary['rangeStart'], summary['rangeEnd'] = starts[0], today.isoformat()
    return {'ratings': ratings, 'summary': summary, 'warnings': warnings}
