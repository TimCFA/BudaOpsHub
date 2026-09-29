"""PEA ratings straight from Levelset, instead of a PDF export.

Levelset's public Positional Excellence scorecard (the share link a manager
makes in Levelset) loads its numbers from /api/ratings?token=… — the same
data as the PDF. This fetches it for FOH and BOH and returns the ratings in
the shape pea_parser.parse_pea_pdf gives the page, so the page merges them
the same way (ratings already saved are skipped).

The token is the code at the end of the share link. It is read from the
LEVELSET_PEA_TOKEN environment variable (Render → Environment), never from the
page: anyone who has it can see every rating. This isn't a documented
Levelset API, so it can change without notice — the PDF upload stays as the
backup.
"""
from datetime import datetime, timezone
import os
import re
from zoneinfo import ZoneInfo

import requests

LEVELSET_URL = 'https://app.levelset.io/api/ratings'
TOKEN_ENV = 'LEVELSET_PEA_TOKEN'
AREAS = ('FOH', 'BOH')
WINDOW = '90d'            # Levelset offers '90d' or 'mtd'
WINDOW_DAYS = 90
STORE_TZ = ZoneInfo('America/Chicago')   # PDF times are store-local
TIMEOUT = 25
TOKEN_RE = re.compile(r'^[A-Za-z0-9_-]{6,64}$')

# Levelset names some rating types per side ("3H Week FOH", "Team Lead BOH");
# the PDF (and the app) use the plain name.
_SIDE_SUFFIX = re.compile(r'\s+(FOH|BOH)$')


class LevelsetError(Exception):
    pass


def configured_token():
    token = (os.environ.get(TOKEN_ENV) or '').strip()
    # Accept the whole share link too.
    m = re.search(r'/positional-excellence/([A-Za-z0-9_-]+)', token)
    if m:
        token = m.group(1)
    return token if TOKEN_RE.match(token) else ''


def _position(name):
    return _SIDE_SUFFIX.sub('', str(name or '').strip())


def _local_minute(created_at):
    """'2026-09-26T22:30:12.345+00:00' → '2026-09-26T17:30' (store time)."""
    text = str(created_at or '').strip().replace('Z', '+00:00')
    # Python 3.11 reads up to 6 fraction digits; trim anything longer.
    text = re.sub(r'(\.\d{6})\d+', r'\1', text)
    try:
        when = datetime.fromisoformat(text)
    except ValueError:
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return when.astimezone(STORE_TZ).strftime('%Y-%m-%dT%H:%M')


def _score(value):
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if 0 < v <= 5 else None


def _role(rating, employee):
    for source in (rating.get('employee'), employee):
        if isinstance(source, dict):
            for key in ('role', 'role_name', 'job_title'):
                if isinstance(source.get(key), str) and source[key].strip():
                    return source[key].strip()
    return ''


def normalize(people):
    """Levelset's per-person list → [{at, employee, role, leader, position,
    criteria, overall}], plus how many ratings Levelset says it has."""
    ratings, expected = [], 0
    for person in people or []:
        if not isinstance(person, dict):
            continue
        if isinstance(person.get('total_count_90d'), int):
            expected += person['total_count_90d']
        for r in person.get('recent_ratings') or []:
            if not isinstance(r, dict):
                continue
            at = _local_minute(r.get('created_at'))
            criteria = [_score(r.get(f'rating_{i}')) for i in range(1, 6)]
            employee = str(r.get('employee_name') or person.get('employee_name') or '').strip()
            position = _position(r.get('position'))
            if not at or not employee or not position or None in criteria:
                continue
            overall = _score(r.get('rating_avg'))
            if overall is None:
                overall = round(sum(criteria) / 5, 2)
            ratings.append({
                'at': at,
                'employee': employee,
                'role': _role(r, person),
                'leader': str(r.get('rater_name') or '').strip(),
                'position': position,
                'criteria': criteria,
                'overall': round(overall, 2),
            })
    return ratings, expected


def fetch_ratings(token, get=requests.get):
    """Both sides' ratings for the last 90 days, as the page expects them."""
    if not token:
        raise LevelsetError('No Levelset share code is set up yet.')
    ratings, per_area, warnings = [], {}, []
    for area in AREAS:
        try:
            res = get(LEVELSET_URL, params={'token': token, 'area': area, 'window': WINDOW, 'tab': 'overview'},
                      timeout=TIMEOUT, headers={'Accept': 'application/json'})
        except requests.RequestException as e:
            raise LevelsetError(f'Couldn’t reach Levelset ({type(e).__name__}).')
        if res.status_code in (401, 403, 404):
            raise LevelsetError('Levelset refused the share code — make a new share link in Levelset and update it.')
        if res.status_code != 200:
            raise LevelsetError(f'Levelset answered {res.status_code} for {area}.')
        try:
            body = res.json()
        except ValueError:
            raise LevelsetError('Levelset sent something that isn’t ratings data — its page may have changed.')
        if not isinstance(body, dict) or not body.get('success') or not isinstance(body.get('data'), list):
            raise LevelsetError('Levelset’s ratings data looks different than expected — use the PDF upload for now.')
        found, expected = normalize(body['data'])
        ratings += found
        per_area[area] = {'people': len(body['data']), 'ratings': len(found), 'expected': expected}
        if expected and len(found) < expected:
            warnings.append(f'Levelset sent {len(found)} of {expected} {area} ratings from the last 90 days — '
                            f'upload the {area} PDF for the rest.')
    today = datetime.now(STORE_TZ).date()
    start = today.fromordinal(today.toordinal() - (WINDOW_DAYS - 1))
    # Only claim coverage for a side when Levelset sent all of its ratings.
    complete = [a for a in AREAS if per_area[a]['ratings'] >= per_area[a]['expected']]
    return {
        'ratings': ratings,
        'summary': {'rangeStart': start.isoformat(), 'rangeEnd': today.isoformat(), 'areas': complete, 'perArea': per_area},
        'warnings': warnings,
    }
