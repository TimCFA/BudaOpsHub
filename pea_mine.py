"""A team member's own PEA scores (Tim, Oct 28 2026), for their Right Now
card on Home. The ratings are private (the 'pea' section never reaches a
team PIN), so the server works out one person's scores and hands back only
those: per position, the average of the latest five overall ratings and its
tier, how many ratings, and the last date. Never another person's, never a
rater's name, never notes.

The name on the PIN list is matched to the Levelset name the way the hub
matches them (static/js/pea-ratings.js peaMatchInfo / peaNameMatches): a
link a manager made in Name Matching first, then the same name, then the
loose match (nicknames, a letter off, a missing second last name) when it
finds exactly one. tests/test_my_pea.py runs both on the same names.
"""
import math
import re
import unicodedata

RECENT = 5                       # pea-ratings.js PEA_RECENT_RATINGS
NOT_IN_LEVELSET = '__none__'     # pea-ratings.js PEA_NOT_IN_LEVELSET
TIERS = (('crushing', 'Crushing It', 2.75), ('rise', 'On the Rise', 1.75), ('notyet', 'Not Yet', 0))


def roster_key(name):
    return re.sub(r'\s+', ' ', str(name or '').strip().lower())


def _tokens(name):
    n = str(name or '')
    parts = n.split(',')
    if len(parts) == 2:
        n = parts[1] + ' ' + parts[0]
    n = ''.join(c for c in unicodedata.normalize('NFD', n) if not unicodedata.combining(c)).lower()
    n = re.sub(r"[^a-z\s()'-]", ' ', n)
    n = re.sub(r"['-]", ' ', n)
    return [t for t in n.split() if t]


def _forms(name):
    tokens = _tokens(name)
    nicks = [t[1:-1] for t in tokens if re.fullmatch(r'\(.*\)', t)]
    plain = [t.replace('(', '').replace(')', '') for t in tokens if not re.fullmatch(r'\(.*\)', t)]
    first = plain[0] if plain else ''
    return {'first': first, 'firsts': [x for x in [first] + nicks if x], 'rest': plain[1:], 'all': plain}


def _one_edit_apart(a, b):
    if a == b:
        return True
    if abs(len(a) - len(b)) > 1:
        return False
    i = j = edits = 0
    while i < len(a) and j < len(b):
        if a[i] == b[j]:
            i += 1
            j += 1
            continue
        edits += 1
        if edits > 1:
            return False
        if len(a) > len(b):
            i += 1
        elif len(b) > len(a):
            j += 1
        else:
            i += 1
            j += 1
    return edits + (len(a) - i) + (len(b) - j) <= 1


def name_matches(roster_name, pea_name):
    r, p = _forms(roster_name), _forms(pea_name)
    if not r['first'] or not p['first']:
        return False
    if ' '.join(r['all']) == ' '.join(p['all']):
        return True
    same_first = (r['first'] in p['firsts'] or p['first'] in r['firsts']
                  or (len(r['first']) >= 4 and len(p['first']) >= 4 and _one_edit_apart(r['first'], p['first'])))
    if not same_first or not r['rest'] or not p['rest']:
        return False

    def within(xs, ys):
        return all(any(y[0] == t for y in ys) if len(t) == 1 else t in ys for t in xs)
    return within(r['rest'], p['rest']) or within(p['rest'], r['rest']) or r['rest'][-1] == p['rest'][-1]


def match_name(roster_name, pea_names, aliases):
    """The Levelset name for a roster name, or None."""
    linked = (aliases or {}).get(roster_key(roster_name))
    if linked == NOT_IN_LEVELSET:
        return None
    if linked and linked in pea_names:
        return linked
    exact = next((n for n in pea_names if roster_key(n) == roster_key(roster_name)), None)
    hits = [exact] if exact else [n for n in pea_names if name_matches(roster_name, n)]
    return hits[0] if len(hits) == 1 else None


def tier_for(avg):
    rounded = math.floor(avg * 100 + 0.5) / 100     # Math.round, as pea-ratings.js peaTierFor
    return next(t for t in TIERS if rounded >= t[2])


def scores_for(pea, roster_name):
    """{'name': Levelset name or None, 'positions': [...] best first}."""
    pea = pea if isinstance(pea, dict) else {}
    ratings = pea.get('peaRatings') if isinstance(pea.get('peaRatings'), dict) else {}
    names = ratings.get('names') if isinstance(ratings.get('names'), list) else []
    positions = ratings.get('positions') if isinstance(ratings.get('positions'), list) else []
    rows = ratings.get('rows') if isinstance(ratings.get('rows'), list) else []
    aliases = pea.get('peaNameAliases') if isinstance(pea.get('peaNameAliases'), dict) else {}
    who = match_name(roster_name, [n for n in names if isinstance(n, str)], aliases)
    if not who:
        return {'name': None, 'positions': []}
    by_pos = {}
    for r in rows:
        try:
            if names[r[1]] != who:
                continue
            pos, overall, at = positions[r[4]], float(r[10]), str(r[0])
        except (IndexError, TypeError, ValueError, KeyError):
            continue
        if pos:
            by_pos.setdefault(pos, []).append((at, overall))
    out = []
    for pos, list_ in by_pos.items():
        list_.sort(key=lambda x: x[0], reverse=True)
        recent = list_[:RECENT]
        avg = sum(o for _, o in recent) / len(recent)
        key, label, _ = tier_for(avg)
        out.append({'position': pos, 'avg': round(avg, 2), 'n': len(recent), 'total': len(list_),
                    'last': list_[0][0][:10], 'tier': key, 'tierLabel': label})
    out.sort(key=lambda x: (-x['avg'], x['position']))
    return {'name': who, 'positions': out}
