"""The daily briefing feed: short, ready-to-read summaries of the hub's data
for an outside reader that can't sign in. Served by /api/briefing in app.py.

Topics:
  setup        the day's set up (setup_feed.py)
  sales        the last day with sales before the briefing day: sales, last
               year, the forecast that was sent, labor, plus month to date
  projections  the briefing day's projected sales and goals by daypart
  guest        the latest uploaded guest scores (CEM, drive-thru ranking)
  waste        the day before: total against the limit, by side, top items;
               month to date
  people       names: who's on the roster that day (with shift times) and
               PEA ratings from the last 7 days (who, position, score, rater)

Summaries only, never raw files. Never sent: safe counts, trainer and team
lead progress, expressions of interest, notes. Phone numbers are never
stored, so they can't be sent.
"""
import re
from datetime import datetime, timedelta

import setup_feed

TOPICS = ('setup', 'sales', 'projections', 'guest', 'waste', 'people')
STORE_TOPICS = ('setup', 'sales', 'projections', 'guest', 'waste')
PEA_DAYS = 7

NUMBERS_DAYPARTS = ['Breakfast (6:00-10:30)', 'Lunch (10:30-2:00)', 'Afternoon (2:00-5:00)', 'Dinner (5:00-10:00)']
GUEST_GROUPS = (('satisfaction', 'Satisfaction'), ('craveable', 'Craveable'), ('service', 'Service'),
                ('welcoming', 'Welcoming'), ('teamMembers', 'Team members'), ('dt', 'Drive-thru ranking'))


def _num(v):
    """A number from 1234.5, '$1,234.50' or '12%'; None if there isn't one."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r'-?\d[\d,]*\.?\d*', str(v or ''))
    return float(m.group(0).replace(',', '')) if m else None


def _pct(a, b):
    return round((a - b) / b * 100, 1) if a is not None and b else None


def _r(v, places=2):
    return round(v, places) if isinstance(v, (int, float)) else None


# ----- sales -----

def sales(sections, day):
    fc = sections.get('forecast') or {}
    hist = fc.get('salesHistory') or {}
    log = fc.get('forecastLog') or {}
    days = sorted(iso for iso, r in hist.items()
                  if isinstance(r, dict) and iso < day.isoformat() and (_num(r.get('sales')) or 0) > 0)
    if not days:
        return {'available': False}
    iso = days[-1]
    r = hist[iso]
    s, ly = _num(r.get('sales')), _num(r.get('lastYearSales'))
    hours, cost = _num(r.get('laborHours')), _num(r.get('laborCost'))
    sent = _num((log.get(iso) or {}).get('sales'))
    labor_pct = _num(r.get('laborPct'))
    if labor_pct is None and cost is not None and s:
        labor_pct = cost / s * 100
    out = {
        'available': True, 'date': iso,
        'sales': _r(s), 'lastYear': _r(ly), 'vsLastYearPct': _pct(s, ly),
        'forecast': _r(sent), 'vsForecastPct': _pct(s, sent),
        'transactions': _num(r.get('transactions')), 'checkAverage': _r(_num(r.get('checkAverage'))),
        'laborHours': _r(hours, 1), 'laborPct': _r(labor_pct, 1),
        'salesPerLaborHour': _r(s / hours) if s and hours else None,
    }
    month = iso[:7]
    mtd = [hist[d] for d in days if d.startswith(month)]
    with_ly = [x for x in mtd if (_num(x.get('lastYearSales')) or 0) > 0]
    total = sum(_num(x.get('sales')) or 0 for x in mtd)
    ly_total = sum(_num(x.get('lastYearSales')) for x in with_ly)
    ty_with_ly = sum(_num(x.get('sales')) or 0 for x in with_ly)
    out['monthToDate'] = {'through': iso, 'days': len(mtd), 'sales': _r(total),
                          'vsLastYearPct': _pct(ty_with_ly, ly_total) if with_ly else None}
    return out


# ----- projections -----

def projections(sections, day):
    numbers = ((sections.get('ops') or {}).get('numbersData') or {}).get(day.isoformat()) or {}
    rows = []
    for dp in NUMBERS_DAYPARTS + sorted(k for k in numbers if k not in NUMBERS_DAYPARTS):
        n = numbers.get(dp)
        if not isinstance(n, dict):
            continue
        sales_, goal, ev = _num(n.get('projectedSales')), _num(n.get('productivityGoal')), str(n.get('specialEvents') or '').strip()
        if sales_ is None and goal is None and not ev:
            continue
        rows.append({'daypart': dp, 'projectedSales': _r(sales_), 'productivityGoal': _r(goal), 'specialEvents': ev or None})
    total = sum(r['projectedSales'] or 0 for r in rows)
    return {'available': bool(rows), 'date': day.isoformat(), 'dayparts': rows, 'projectedSales': _r(total) if rows else None}


# ----- guest -----

def guest(sections):
    gx = (sections.get('manager') or {}).get('gxData') or {}
    # Until scores are uploaded, the page shows built-in sample figures:
    # those are never sent.
    if not gx.get('lastUpdated'):
        return {'available': False}
    groups = []
    for key, label in GUEST_GROUPS:
        g = gx.get(key)
        if not isinstance(g, dict):
            continue
        scores = []
        for item in g.values():
            if isinstance(item, dict) and str(item.get('value') or '').strip():
                scores.append({'label': item.get('label', ''), 'value': str(item['value']).strip(),
                               'top5': str(item.get('top5') or '').strip() or None})
        if scores:
            groups.append({'group': label, 'scores': scores})
    focus = []
    for key in ('secondMile', 'teamMembers'):
        g = gx.get(key) or {}
        for k in ('opportunities', 'coachingFocus'):
            focus += [str(x) for x in (g.get(k) or []) if str(x).strip()]
    src = gx.get('cemSource') or {}
    return {'available': True, 'updated': gx.get('lastUpdated'), 'source': src.get('label'),
            'surveys': src.get('n'), 'groups': groups, 'focus': focus}


# ----- waste -----

def _waste_day(e):
    if e.get('day'):
        return str(e['day'])
    ts = e.get('ts')
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(ts / 1000, setup_feed.STORE_TZ).date().isoformat()
    return ''


def waste(sections, day):
    w = sections.get('waste') or {}
    entries = [e for e in (w.get('entries') or []) if isinstance(e, dict)]
    limit = _num((sections.get('manager') or {}).get('wasteTarget'))
    target = (day - timedelta(days=1)).isoformat()
    on_day = [e for e in entries if _waste_day(e) == target]
    by_side, by_item = {}, {}
    for e in on_day:
        cost = _num(e.get('cost')) or 0
        side = str(e.get('section') or '').upper() or 'OTHER'
        by_side[side] = by_side.get(side, 0) + cost
        k = (str(e.get('name') or 'Item'), side)
        it = by_item.setdefault(k, {'item': k[0], 'side': k[1], 'qty': 0, 'cost': 0, 'unit': e.get('unit')})
        it['qty'] += _num(e.get('qty')) or 0
        it['cost'] += cost
    total = sum(by_side.values())
    top = sorted(by_item.values(), key=lambda x: -x['cost'])[:5]
    month = target[:7]
    mtd = sum(_num(e.get('cost')) or 0 for e in entries if _waste_day(e)[:7] == month and _waste_day(e) <= target)
    return {
        'available': True, 'date': target, 'total': _r(total), 'limit': _r(limit),
        'underLimit': (total < limit) if limit else None,
        'bySide': {k: _r(v) for k, v in sorted(by_side.items())},
        'topItems': [{**t, 'qty': _r(t['qty']), 'cost': _r(t['cost'])} for t in top],
        'monthToDate': {'through': target, 'total': _r(mtd)},
    }


# ----- people -----

def people(sections, day):
    iso = day.isoformat()
    rosters = sections.get('rosters') or {}
    roster = {}
    for side, key in (('FOH', 'fohRoster'), ('BOH', 'bohRoster')):
        rows = ((rosters.get(key) or {}).get(iso)) or []
        roster[side] = [{'name': p.get('name'), 'start': p.get('start'), 'end': p.get('end'),
                         'leader': bool(p.get('leader')) or None}
                        for p in rows if isinstance(p, dict) and p.get('name')]
    pea = (sections.get('pea') or {}).get('peaRatings') or {}
    names, roles, positions = pea.get('names') or [], pea.get('roles') or [], pea.get('positions') or []
    pick = lambda arr, i: arr[i] if isinstance(i, int) and 0 <= i < len(arr) else ''
    since = (day - timedelta(days=PEA_DAYS)).isoformat()
    ratings = []
    for r in pea.get('rows') or []:
        if not isinstance(r, list) or len(r) < 11:
            continue
        at = str(r[0])
        if not (since <= at[:10] < iso):
            continue
        ratings.append({'date': at[:10], 'employee': pick(names, r[1]), 'role': pick(roles, r[2]),
                        'rater': pick(names, r[3]), 'position': pick(positions, r[4]), 'overall': _num(r[10])})
    ratings.sort(key=lambda x: (x['date'], x['employee']))
    return {'available': True, 'date': iso, 'roster': roster,
            'pea': {'since': since, 'through': (day - timedelta(days=1)).isoformat(), 'ratings': ratings}}


# ----- the briefing -----

def build(sections, day, topics, layout):
    out = {'date': day.isoformat(), 'weekday': day.strftime('%A')}
    if 'setup' in topics:
        f = setup_feed.build_feed(sections, day, layout)
        out['setup'] = {'foh': f['foh'], 'boh': f['boh']}
    if 'sales' in topics:
        out['sales'] = sales(sections, day)
    if 'projections' in topics:
        out['projections'] = projections(sections, day)
    if 'guest' in topics:
        out['guest'] = guest(sections)
    if 'waste' in topics:
        out['waste'] = waste(sections, day)
    if 'people' in topics:
        out['people'] = people(sections, day)
    return out


def _money(v, cents=False):
    if not isinstance(v, (int, float)):
        return '—'
    return f'${v:,.2f}' if cents else f'${v:,.0f}'


def _signed(v, unit='%'):
    return f'{v:+.1f}{unit}' if isinstance(v, (int, float)) else '—'


def text(b):
    L = [f"Briefing for {b['weekday']}, {b['date']}"]
    s = b.get('sales')
    if s is not None:
        L += ['', 'SALES']
        if not s['available']:
            L.append('No sales history uploaded yet.')
        else:
            L.append(f"{s['date']}: {_money(s['sales'])} · vs last year {_signed(s['vsLastYearPct'])} · vs forecast {_signed(s['vsForecastPct'])}")
            bits = []
            if s['laborPct'] is not None:
                bits.append(f"labor {s['laborPct']}%")
            if s['salesPerLaborHour'] is not None:
                bits.append(f"${s['salesPerLaborHour']:,.2f} per labor hour")
            if s['checkAverage'] is not None:
                bits.append(f"check average ${s['checkAverage']:,.2f}")
            if bits:
                L.append(' · '.join(bits))
            m = s['monthToDate']
            L.append(f"Month to date ({m['days']} days): {_money(m['sales'])} · vs last year {_signed(m['vsLastYearPct'])}")
    p = b.get('projections')
    if p is not None:
        L += ['', 'PROJECTIONS']
        if not p['available']:
            L.append('No projections entered for this day.')
        else:
            for d in p['dayparts']:
                goal = f" · goal ${d['productivityGoal']:,.0f}/labor hr" if d['productivityGoal'] is not None else ''
                ev = f" · {d['specialEvents']}" if d['specialEvents'] else ''
                L.append(f"{d['daypart']}: {_money(d['projectedSales'])}{goal}{ev}")
            L.append(f"Day: {_money(p['projectedSales'])}")
    g = b.get('guest')
    if g is not None:
        L += ['', 'GUEST SCORES']
        if not g['available']:
            L.append('No guest scores uploaded yet.')
        else:
            L.append(f"Updated {str(g['updated'])[:10]}" + (f" · {g['source']}" if g['source'] else '') + (f" ({g['surveys']} surveys)" if g['surveys'] else ''))
            for grp in g['groups']:
                L.append(f"{grp['group']}: " + ' · '.join(f"{x['label']} {x['value']}" + (f" (top 5% {x['top5']})" if x['top5'] else '') for x in grp['scores']))
            if g['focus']:
                L.append('Focus: ' + '; '.join(g['focus']))
    w = b.get('waste')
    if w is not None:
        L += ['', 'WASTE']
        lim = f" of {_money(w['limit'], True)} limit" if w['limit'] else ''
        L.append(f"{w['date']}: {_money(w['total'], True)}{lim}" + (' · under' if w['underLimit'] else ' · over' if w['underLimit'] is False else ''))
        if w['bySide']:
            L.append(' · '.join(f"{k} {_money(v, True)}" for k, v in w['bySide'].items()))
        for t in w['topItems']:
            L.append(f"  {t['item']} ({t['side']}): {t['qty']:g} · {_money(t['cost'], True)}")
        L.append(f"Month to date: {_money(w['monthToDate']['total'], True)}")
    pe = b.get('people')
    if pe is not None:
        L += ['', 'PEOPLE']
        for side in ('FOH', 'BOH'):
            rows = pe['roster'][side]
            L.append(f"{side} roster ({len(rows)}): " + (', '.join(f"{r['name']} {r['start']}–{r['end']}" for r in rows) if rows else 'none'))
        rs = pe['pea']['ratings']
        L.append(f"PEA ratings {pe['pea']['since']} to {pe['pea']['through']} ({len(rs)}):")
        for r in rs:
            line = f"  {r['date']} {r['employee']} · {r['position']}"
            if r['overall'] is not None:
                line += f" · {r['overall']:g}"
            if r['rater']:
                line += f" · by {r['rater']}"
            L.append(line)
    su = b.get('setup')
    if su is not None:
        L += ['', setup_feed.feed_text({'date': b['date'], 'weekday': b['weekday'], **su}).rstrip()]
    return '\n'.join(L) + '\n'
