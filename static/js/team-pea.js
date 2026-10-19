// ===== TEAM (Directors → Team) =====
// The whole team's PEA development in one place (Tim, Oct 2026), built from
// the Levelset ratings the hub already holds (Manage → PEA) and the
// directors' notes on each team member:
//
//  1. The rater leaderboard: the Team Leads and Trainers ranked on the PEAs
//     they GAVE this quarter. A PEA is one point; the first PEA on each
//     team member and the first on each position earn a point more, so
//     spreading PEAs across people and positions beats rating the same
//     person on the same thing. The goal per rater is the one in Manage →
//     Settings → Leaders (12 a quarter); streaks and week bars as on the
//     Leaders view. Directors' PEAs count for the team but the directors
//     sit in their own strip, not in the ranking.
//  2. The team scoreboard: everyone rated, ranked on growth this quarter:
//     positions gone green (Crushing It) since the quarter began, then the
//     change in average score, not the raw average, so a new hire climbing
//     from Not Yet places as well as a veteran holding green.
//  3. A profile per team member: every position with its score, tier,
//     trend, the criterion holding it back (Levelset's own labels), the
//     quarter's ratings one by one, notes (Win, Coaching, Watch,
//     Conversation, tagged to a position and criterion), and the quarter-
//     by-quarter history. Raters also get their quarter as a rater.
//
// teamNotes lives in the private people section: {name: [{text, by, ts,
// date, type, tags: ['iPOS:2']}]}, a tag being position:criterion index.
// Everything here is managers only (the Directors tab).
//
// The notes raters write on a PEA in Levelset are for DIRECTORS only (Tim,
// Oct 14 2026): the server keeps them from each Levelset sync and hands one
// person's to a session signed in with the director PIN (app.py,
// /api/pea/notes). They never go into the app state, the copy or the PDF.

let tpTab = 'raters';     // 'raters' | 'team'
let tpOpen = '';          // the profile open ('' = the boards)
let tpQuarter = '';       // quarter on screen ('' = the current one)
let tpSide = '';          // team scoreboard filter: '' | 'foh' | 'boh' | 'lead'
let tpSearch = '';        // team scoreboard search
let tpPos = '';           // position whose criteria are open on the profile
let tpNoteOpen = false;   // the add-a-note form is open
let tpHide = {};          // note types hidden on the profile {id: true}
let tpTag = '';           // tag the notes are filtered to ('iPOS:2')

let tpDirector = false;        // this session signed in with the director PIN
let tpDirectorPinSet = false;  // a director PIN exists on the server
let tpLs = {};                 // Levelset notes fetched: {dirKey(name): {state, notes, error}}
const TP_LS_SHOWN = 6;         // notes shown before "more"

const TP_CROSS_POINTS = {pea: 1, person: 1, position: 1};
const TP_STALE_DAYS = 30;  // a team member with no PEA this long is due one

const tpQuarterOn = () => tpQuarter || ldQuarterNow();
const tpNotes = () => (typeof teamNotes === 'object' && teamNotes) ? teamNotes : {};
const tpStrength = upTo => typeof peaStrengthByPerson === 'function' ? peaStrengthByPerson(upTo) : {};
const tpGroupOf = pos => { const g = PEA_POSITION_GROUPS.find(x => x.positions.includes(pos)); return g ? g.key : ''; };
const tpSides = positions => { const s = new Set(Object.keys(positions).map(tpGroupOf).filter(Boolean)); return ['foh', 'boh', 'lead', 'new'].filter(k => s.has(k)); };
const tpSideLabel = {foh: 'FOH', boh: 'BOH', lead: 'Leadership', new: 'New hire'};
const tpLeaderListed = n => typeof leaderListed === 'function' && leaderListed(n);
const tpDayBefore = iso => fcAddDaysSafe(iso, -1);
function tpAvgOf(person){ const cells = Object.values(person.positions); return cells.length ? cells.reduce((s, c) => s + c.avg, 0) / cells.length : null; }
function tpGreenOf(person){ return Object.values(person.positions).filter(c => c.tier.key === 'crushing').length; }

// Notes on a team member, whichever spelling they were saved under.
function tpNoteKey(name){ const k = dirKey(name); const notes = tpNotes(); return Object.keys(notes).find(x => dirKey(x) === k) || name; }
function tpNotesFor(name){ const list = tpNotes()[tpNoteKey(name)]; return Array.isArray(list) ? list : []; }
function tpSaveNote(name, note){ if(typeof teamNotes !== 'object' || !teamNotes) teamNotes = {}; const key = tpNoteKey(name); (teamNotes[key] = teamNotes[key] || []).push(note); }
function tpTagLabel(tag){
  const i = String(tag).lastIndexOf(':'); if(i < 0) return tag;
  const pos = tag.slice(0, i), c = +tag.slice(i + 1);
  return `${pos} · ${typeof peaCategoryName === 'function' ? peaCategoryName(pos, c) : `Category ${c + 1}`}`;
}

// Every quarter with ratings or notes, plus the current one; newest first.
function tpQuarters(){
  const set = new Set([ldQuarterNow()]);
  ldRatings().forEach(r => set.add(ldQuarterKey(r.date)));
  Object.values(tpNotes()).forEach(list => (list || []).forEach(n => set.add(ldQuarterKey(ldNoteDate(n)))));
  return [...set].sort().reverse();
}

// The quarter's clock, shared by both boards.
function tpClock(q){
  const b = ldQuarterBounds(q);
  const days = ldDaysBetween(b.from, b.to) + 1;
  const elapsed = today < b.from ? 0 : today > b.to ? days : ldDaysBetween(b.from, today) + 1;
  return {quarter: b, days, elapsed, frac: elapsed / days, weeksLeft: Math.max(0, Math.ceil((days - elapsed) / 7)), weeks: ldWeeksOf(b), over: elapsed >= days, current: q === ldQuarterNow()};
}

// ----- The rater leaderboard -----
// 'Team Lead' | 'Trainer' | 'Director' | 'Team Member' for someone giving PEAs.
function tpRaterRole(name, strength){
  if(dirIsDirector(name)) return 'Director';
  const p = strength[name];
  if(p && p.role === 'Trainer') return 'Trainer';
  if((p && /lead/i.test(p.role || '')) || tpLeaderListed(name)) return 'Team Lead';
  if(typeof ldLeaderNames === 'function' && ldLeaderNames(ldQuarterNow()).some(n => dirKey(n) === dirKey(name))) return 'Team Lead';
  return p ? 'Team Member' : 'Rater';
}

// Everyone on the board: PEA givers this quarter, the leaders list, and
// anyone Levelset rates as a Team Lead or Trainer. Directors are separate.
function tpRaters(q){
  q = q || tpQuarterOn();
  const C = tpClock(q), b = C.quarter, goal = ldGoals().leader;
  const strength = tpStrength();
  const rows = ldRatings().filter(r => r.date >= b.from && r.date <= b.to && r.leader && dirKey(r.leader) !== dirKey(r.employee));
  const names = new Map();
  const add = n => { const k = dirKey(n); if(k && !names.has(k)) names.set(k, n); };
  rows.forEach(r => add(r.leader));
  if(typeof ldLeaderNames === 'function') ldLeaderNames(q).forEach(add);
  Object.keys(strength).forEach(n => { if(/^(Team Lead|Trainer)$/i.test(strength[n].role || '')) add(n); });
  const cur = peaWeekStart(today), expected = goal * C.frac;
  const score = name => {
    const k = dirKey(name);
    const mine = rows.filter(r => dirKey(r.leader) === k).sort((a, c) => a.at.localeCompare(c.at));
    const people = new Set(), positions = new Set();
    let bonus = 0;
    const log = mine.map(r => {
      const pk = dirKey(r.employee);
      let pts = TP_CROSS_POINTS.pea, why = [];
      if(!people.has(pk)){ people.add(pk); pts += TP_CROSS_POINTS.person; why.push('first on ' + ldShort(r.employee)); }
      if(!positions.has(r.position)){ positions.add(r.position); pts += TP_CROSS_POINTS.position; why.push('first ' + r.position); }
      bonus += pts - TP_CROSS_POINTS.pea;
      return {date: r.date, employee: r.employee, position: r.position, overall: r.overall, pts, why};
    });
    const byWeek = {};
    mine.forEach(r => { const w = peaWeekStart(r.date); byWeek[w] = (byWeek[w] || 0) + 1; });
    const series = C.weeks.map(w => byWeek[w] || 0);
    let streak = 0;
    for(let i = C.weeks.length - 1; i >= 0; i--){ if(C.weeks[i] > cur) continue; if(series[i] > 0) streak++; else if(C.weeks[i] !== cur) break; }
    const count = mine.length;
    const status = count >= goal ? 'done' : C.over ? 'missed' : count >= Math.floor(expected) ? 'pace' : 'behind';
    const avg = count ? mine.reduce((s, r) => s + (+r.overall || 0), 0) / count : null;
    return {name, role: tpRaterRole(name, strength), count, points: count + bonus, bonus, people: people.size, positions: positions.size, goal, expected, status, series, streak,
      last: count ? mine[count - 1].date : '', best: Math.max(0, ...series), avg, log, perWeek: C.weeksLeft ? Math.max(0, goal - count) / C.weeksLeft : 0, notes: tpNotesFor(name).length};
  };
  const all = [...names.values()].map(score);
  const sortFn = (a, c) => c.points - a.points || c.count - a.count || c.people - a.people || a.name.localeCompare(c.name);
  const raters = all.filter(r => r.role !== 'Director').sort(sortFn);
  const directors = all.filter(r => r.role === 'Director').sort(sortFn);
  raters.forEach((r, i) => { r.rank = i && r.points === raters[i - 1].points ? raters[i - 1].rank : i + 1; });
  const total = rows.length, byRaters = raters.reduce((s, r) => s + r.count, 0);
  return {...C, goal, raters, directors, total, byRaters, byDirectors: directors.reduce((s, r) => s + r.count, 0),
    people: new Set(rows.map(r => dirKey(r.employee))).size, positions: new Set(rows.map(r => r.position)).size,
    done: raters.filter(r => r.status === 'done').length, leader: raters.find(r => r.points > 0) || null,
    teamGoal: goal * raters.length, teamStatus: !raters.length ? 'behind' : byRaters >= goal * raters.length ? 'done' : C.over ? 'missed' : byRaters >= Math.floor(expected * raters.length) ? 'pace' : 'behind'};
}

// ----- The team scoreboard -----
// Everyone with a rating: where they stand at the end of the quarter (or
// today) against where they stood when it began.
function tpTeam(q){
  q = q || tpQuarterOn();
  const C = tpClock(q), b = C.quarter;
  const now = tpStrength(b.to), start = tpStrength(tpDayBefore(b.from));
  const rows = ldRatings().filter(r => r.date >= b.from && r.date <= b.to);
  const people = Object.keys(now).map(name => {
    const p = now[name], s = start[name];
    const k = dirKey(name);
    const mine = rows.filter(r => dirKey(r.employee) === k);
    const positions = Object.keys(p.positions);
    const greenNow = positions.filter(pos => p.positions[pos].tier.key === 'crushing');
    const gained = greenNow.filter(pos => !(s && s.positions[pos] && s.positions[pos].tier.key === 'crushing'));
    const lost = s ? Object.keys(s.positions).filter(pos => s.positions[pos].tier.key === 'crushing' && p.positions[pos] && p.positions[pos].tier.key !== 'crushing') : [];
    const shared = s ? positions.filter(pos => s.positions[pos]) : [];
    const change = shared.length ? shared.reduce((sum, pos) => sum + p.positions[pos].avg - s.positions[pos].avg, 0) / shared.length : null;
    const sides = tpSides(p.positions);
    const cert = {};
    ['foh', 'boh'].forEach(side => { if(sides.includes(side) && typeof suCertification === 'function') cert[side] = suCertification(p, side); });
    const last = mine.reduce((m, r) => r.date > m ? r.date : m, '') || p.lastAt.slice(0, 10);
    const lastAny = p.lastAt.slice(0, 10);
    const stale = C.current && ldDaysBetween(lastAny, today) >= TP_STALE_DAYS;
    return {name, role: p.role || '', sides, positions: positions.length, green: greenNow.length, gained, lost, change, avg: tpAvgOf(p), avgStart: s ? tpAvgOf(s) : null,
      peas: mine.length, raters: new Set(mine.map(r => r.leader).filter(Boolean)).size, last, stale, isNew: !s, cert,
      allGreen: Object.values(cert).some(c => c.allGreen), notyet: positions.filter(pos => p.positions[pos].tier.key === 'notyet').length, notes: tpNotesFor(name).length};
  });
  const growth = p => p.gained.length * 2 - p.lost.length + (p.change || 0);
  people.sort((a, c) => growth(c) - growth(a) || c.peas - a.peas || (c.avg || 0) - (a.avg || 0) || a.name.localeCompare(c.name));
  people.forEach((p, i) => { p.rank = i + 1; });
  const rated = people.filter(p => p.peas);
  return {...C, people, rated: rated.length, peas: rows.length, gained: people.reduce((s, p) => s + p.gained.length, 0), lost: people.reduce((s, p) => s + p.lost.length, 0),
    allGreen: people.filter(p => p.allGreen).length, stale: people.filter(p => p.stale).length, unrated: people.length - rated.length,
    positions: people.reduce((s, p) => s + p.positions, 0), green: people.reduce((s, p) => s + p.green, 0)};
}
function tpTeamShown(T){
  const q = dirKey(tpSearch);
  return T.people.filter(p => (!tpSide || p.sides.includes(tpSide)) && (!q || dirKey(p.name).includes(q)));
}

// ----- A team member's profile -----
function tpPerson(name, q){
  q = q || tpQuarterOn();
  const C = tpClock(q), b = C.quarter;
  const k = dirKey(name);
  const all = ldRatings().filter(r => dirKey(r.employee) === k).sort((a, c) => c.at.localeCompare(a.at));
  const peaName = all.length ? all[0].employee : name;
  const T = tpTeam(q), row = T.people.find(p => dirKey(p.name) === k) || null;
  const now = tpStrength(b.to)[peaName], start = tpStrength(tpDayBefore(b.from))[peaName];
  const positions = now ? Object.keys(now.positions).sort((a, c) => now.positions[a].avg - now.positions[c].avg || a.localeCompare(c)).map(pos => {
    const cell = now.positions[pos], was = start && start.positions[pos];
    const list = all.filter(r => r.position === pos && r.date <= b.to).slice(0, PEA_RECENT_RATINGS);
    const criteria = [0, 1, 2, 3, 4].map(i => ({i, label: typeof peaCategoryName === 'function' ? peaCategoryName(pos, i) : `Category ${i + 1}`, avg: list.length ? list.reduce((s, r) => s + (+r.criteria[i] || 0), 0) / list.length : null}));
    const weak = typeof peaWeakest === 'function' ? peaWeakest(peaName, pos) : null;
    const trend = typeof peaTrend === 'function' ? peaTrend(peaName, pos) : null;
    return {pos, group: tpGroupOf(pos), cell, was: was || null, gained: cell.tier.key === 'crushing' && !(was && was.tier.key === 'crushing'), criteria, weak, trend,
      quarter: all.filter(r => r.position === pos && r.date >= b.from && r.date <= b.to).length};
  }) : [];
  const ratings = all.filter(r => r.date >= b.from && r.date <= b.to);
  const R = tpRaters(q);
  const rater = [...R.raters, ...R.directors].find(r => dirKey(r.name) === k) || null;
  const notes = tpNotesFor(name).map((n, i) => ({...n, i, date: ldNoteDate(n)}));
  const history = tpQuarters().map(hq => {
    const hb = ldQuarterBounds(hq);
    const got = all.filter(r => r.date >= hb.from && r.date <= hb.to);
    const at = tpStrength(hb.to)[peaName];
    const gave = ldRatings().filter(r => dirKey(r.leader) === k && dirKey(r.employee) !== k && r.date >= hb.from && r.date <= hb.to).length;
    return {q: hq, b: hb, peas: got.length, avg: got.length ? got.reduce((s, r) => s + (+r.overall || 0), 0) / got.length : null, green: at ? tpGreenOf(at) : 0, rated: at ? Object.keys(at.positions).length : 0, gave,
      notes: notes.filter(n => n.date >= hb.from && n.date <= hb.to).length};
  }).filter(h => h.peas || h.gave || h.notes || h.q === q);
  // A leader's profile marks the director PEAs that don't count toward the goals (leaders.js ldCountsForGoal).
  const leaderProfile = typeof ldLeaderNames === 'function' && ldLeaderNames(q).some(n => dirKey(n) === k);
  return {...C, name, peaName, role: now ? now.role : (row ? row.role : ''), row, positions, ratings, rater, notes, history, cert: row ? row.cert : {}, sides: row ? row.sides : [], leaderProfile};
}

// ----- Rendering -----
const TP_ICON_MEDAL = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="6"/><path d="M8.5 9 6 2h4l2 5 2-5h4l-2.5 7"/></svg>';
const TP_ICON_UP = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
const TP_ICON_DOWN = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>';
const TP_ICON_CLOCK = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const tpSigned = (n, d) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(d == null ? 2 : d);
const tpRoleShort = {'Team Lead': 'Team Lead', Trainer: 'Trainer', Director: 'Director', 'Team Member': 'Team Member', Rater: 'Rater'};
function tpTierChip(cell){ return `<span class="tp-tier is-${cell.tier.key}" title="${escapeHtml(`${cell.tier.label} · latest ${cell.n} of ${cell.total} rating${cell.total === 1 ? '' : 's'}`)}">${cell.avg.toFixed(2)}</span>`; }
function tpTrendMark(tr){ return !tr || tr.dir === 'flat' ? '' : `<span class="tp-trend is-${tr.dir}" title="${escapeHtml(`${tr.from.toFixed(2)} → ${tr.to.toFixed(2)} over the last ${tr.n} ratings`)}">${tr.dir === 'up' ? TP_ICON_UP : TP_ICON_DOWN}</span>`; }
function tpRankBadge(rank){ return rank ? `<span class="tp-rank ${rank <= 3 ? 'is-top is-' + rank : ''}">${rank <= 3 ? TP_ICON_MEDAL : ''}${rank}</span>` : '<span class="tp-rank is-none" aria-hidden="true">·</span>'; }
function tpCriteriaBars(criteria, pos, small){
  return `<div class="tp-crit ${small ? 'is-sm' : ''}" role="img" aria-label="Criteria">${criteria.map(c => `<span class="${c.avg == null ? '' : c.avg >= 2.75 ? 'is-crushing' : c.avg >= 1.75 ? 'is-rise' : 'is-notyet'}" title="${escapeHtml(`${c.label}: ${c.avg == null ? '—' : c.avg.toFixed(2)}`)}" ${small ? '' : `data-tp-tag="${escapeHtml(`${pos}:${c.i}`)}"`}><i style="height:${c.avg == null ? 0 : Math.round(c.avg / 3 * 100)}%"></i>${small ? '' : `<b>${c.avg == null ? '—' : c.avg.toFixed(1)}</b><small>${escapeHtml(c.label)}</small>`}</span>`).join('')}</div>`;
}

function tpQuarterSelect(){
  const on = tpQuarterOn();
  return `<label class="ld-q"><span>Quarter</span><select id="tpQuarter" aria-label="Quarter">${tpQuarters().map(q => `<option value="${q}" ${q === on ? 'selected' : ''}>${escapeHtml(ldQuarterBounds(q).label)}${q === ldQuarterNow() ? ' (now)' : ''}</option>`).join('')}</select></label>`;
}
function tpHeadSub(){
  const b = ldQuarterBounds(tpQuarterOn());
  return tpOpen ? `${escapeHtml(b.label)} · ${escapeHtml(b.span)}` : `The team’s PEA development · ${escapeHtml(b.label)}`;
}
function tpActionsHtml(){
  return tpOpen ? `<button type="button" class="btn btn-ghost dir-btn" data-tp-copy>Copy profile</button><button type="button" class="btn btn-ghost dir-btn" data-tp-pdf>PDF</button>`
    : `${tpQuarterSelect()}<button type="button" class="btn btn-ghost dir-btn" data-tp-copy>Copy board</button>`;
}

function tpRaterRow(r, R){
  return `<button type="button" class="tp-row is-${r.status} ${r.rank === 1 && r.points ? 'is-first' : ''}" data-tp-open="${escapeHtml(r.name)}">
    ${tpRankBadge(r.rank)}
    <span class="tp-row-name"><b>${escapeHtml(ldShort(r.name))}</b><span>${escapeHtml(r.role)}${r.last ? ` · last PEA ${escapeHtml(ldDate(r.last))}` : ' · none this quarter'}${r.streak > 1 ? ` · <em class="ld-streak">${LD_ICON_FLAME}${r.streak} wk</em>` : ''}</span></span>
    <span class="tp-row-pts"><b>${r.points}</b><span>pts</span></span>
    <span class="tp-row-mix" title="PEAs · people · positions"><span>${r.count} <small>PEA${r.count === 1 ? '' : 's'}</small></span><span>${r.people} <small>${r.people === 1 ? 'person' : 'people'}</small></span><span>${r.positions} <small>pos.</small></span></span>
    <span class="tp-row-goal">${ldPips(r.count, r.goal)}${ldStatusChip(r.status)}</span>
  </button>`;
}

function tpRatersHtml(){
  const R = tpRaters();
  const pct = Math.min(100, R.teamGoal ? R.byRaters / R.teamGoal * 100 : 0), mark = Math.min(100, R.frac * 100);
  return `
    <section class="dir-card"><h3>Rater leaderboard</h3>
      <p class="dir-note">Team Leads and Trainers on the PEAs they gave: a point per PEA, a point more the first time they rate each team member, and a point more the first time they rate each position. Goal ${R.goal} PEAs each a quarter (Manage → Settings → Leaders).</p>
      <div class="ld-team is-${R.teamStatus}">
        <div class="ld-team-head"><b>${R.byRaters}</b><span>PEAs by ${ldPlural(R.raters.length, 'rater')} · ${escapeHtml(R.quarter.label)}${R.byDirectors ? ` · plus ${R.byDirectors} by directors` : ''}</span>${R.raters.length ? ldStatusChip(R.teamStatus) : ''}</div>
        <div class="ld-bar"><i style="width:${pct.toFixed(1)}%"></i>${R.current ? `<u style="left:${mark.toFixed(1)}%" title="Today"></u>` : ''}</div>
        <p class="dir-note">${R.over ? 'The quarter is closed.' : `${ldPlural(R.weeksLeft, 'week')} left`} · ${R.people} ${R.people === 1 ? 'person' : 'people'} and ${ldPlural(R.positions, 'position')} rated this quarter · ${R.done} of ${R.raters.length} at the goal${R.leader ? ` · leading: ${escapeHtml(ldShort(R.leader.name))} with ${R.leader.points} pts` : ''}</p>
      </div>
      ${R.raters.length ? `<div class="tp-board">${R.raters.map(r => tpRaterRow(r, R)).join('')}</div>` : '<p class="dir-empty">No raters yet. Sync Levelset in Manage → PEA, or list the leaders in Manage → Settings → Leaders.</p>'}
      ${R.directors.length ? `<h4 class="ld-month">Directors</h4><div class="tp-board is-dir">${R.directors.map(r => tpRaterRow(r, R)).join('')}</div>` : ''}
    </section>`;
}

function tpTeamRow(p){
  const cert = Object.keys(p.cert).map(side => `${tpSideLabel[side]} ${p.cert[side].allGreen ? 'all green' : `${p.cert[side].green}/${p.cert[side].rated} green`}`).join(' · ');
  return `<button type="button" class="tp-row is-team ${p.allGreen ? 'is-green' : ''} ${p.stale ? 'is-stale' : ''}" data-tp-open="${escapeHtml(p.name)}">
    ${tpRankBadge(p.rank)}
    <span class="tp-row-name"><b>${escapeHtml(ldShort(p.name))}</b><span>${escapeHtml(p.sides.map(s => tpSideLabel[s]).join(' · ') || p.role)}${cert ? ` · ${escapeHtml(cert)}` : ''}${p.stale ? ` · <em class="tp-stale">${TP_ICON_CLOCK}due a PEA</em>` : ''}</span></span>
    <span class="tp-row-growth ${p.gained.length ? 'is-up' : p.lost.length ? 'is-down' : ''}"><b>${p.gained.length ? `+${p.gained.length}` : p.lost.length ? `−${p.lost.length}` : '0'}</b><span>green</span></span>
    <span class="tp-row-growth ${p.change > 0.05 ? 'is-up' : p.change < -0.05 ? 'is-down' : ''}"><b>${p.change == null ? (p.isNew ? 'new' : '—') : tpSigned(p.change)}</b><span>avg</span></span>
    <span class="tp-row-mix"><span>${p.avg == null ? '—' : p.avg.toFixed(2)} <small>avg</small></span><span>${p.green}/${p.positions} <small>green</small></span><span>${p.peas} <small>PEA${p.peas === 1 ? '' : 's'}</small></span></span>
  </button>`;
}

function tpTeamHtml(){
  const T = tpTeam();
  const shown = tpTeamShown(T);
  const stat = (v, l) => `<div><b>${escapeHtml(String(v))}</b><span>${escapeHtml(l)}</span></div>`;
  return `
    <section class="dir-card"><h3>Team scoreboard</h3>
      <p class="dir-note">Everyone with a Levelset rating, ranked on growth this quarter: positions gone green since ${escapeHtml(ldDate(T.quarter.from))} first, then the change in average score. A position’s score is its latest ${PEA_RECENT_RATINGS} ratings; green is Crushing It (2.75+).</p>
      <div class="ld-stats tp-stats">${stat(T.peas, `PEAs in ${T.quarter.label}`)}${stat(`${T.rated} of ${T.people.length}`, 'people rated')}${stat(`+${T.gained}${T.lost ? ` / −${T.lost}` : ''}`, 'positions green')}${stat(`${T.green} of ${T.positions}`, 'positions green now')}${stat(T.allGreen, 'all green')}${T.current ? stat(T.stale, 'due a PEA') : ''}</div>
      <div class="tp-filters"><div class="ld-chips">${[['', 'All'], ['foh', 'FOH'], ['boh', 'BOH'], ['lead', 'Leadership']].map(([k, l]) => `<button type="button" class="ld-chip" data-tp-side="${k}" aria-pressed="${tpSide === k ? 'true' : 'false'}">${l}</button>`).join('')}</div>
        <input type="search" id="tpSearch" class="tp-search" placeholder="Find a name" value="${escapeHtml(tpSearch)}" aria-label="Find a name" autocomplete="off"></div>
      ${shown.length ? `<div class="tp-board">${shown.map(tpTeamRow).join('')}</div>` : `<p class="dir-empty">${T.people.length ? 'Nobody matches.' : 'No ratings yet. Sync Levelset in Manage → PEA.'}</p>`}
    </section>`;
}

function tpBoardsHtml(){
  return `<div class="uo-panes ld-panes tp-tabs" role="tablist" aria-label="Board"><button type="button" class="uo-pane-btn ${tpTab === 'raters' ? 'active' : ''}" data-tp-tab="raters">Raters</button><button type="button" class="uo-pane-btn ${tpTab === 'team' ? 'active' : ''}" data-tp-tab="team">Team</button></div>
    ${tpTab === 'team' ? tpTeamHtml() : tpRatersHtml()}`;
}

function tpProfileHtml(){
  const P = tpPerson(tpOpen);
  const name = P.name, b = P.quarter;
  const row = P.row;
  if(tpPos && !P.positions.some(x => x.pos === tpPos)) tpPos = '';
  const open = P.positions.find(x => x.pos === tpPos) || null;
  const counts = {}; LD_TYPES.forEach(t => counts[t.id] = P.notes.filter(n => n.type === t.id).length);
  const shown = P.notes.filter(n => !tpHide[n.type || 'none'] && (!tpTag || (n.tags || []).includes(tpTag))).sort((a, c) => c.date.localeCompare(a.date) || (c.ts || 0) - (a.ts || 0));
  const cert = Object.keys(P.cert).map(side => `${tpSideLabel[side]}: ${typeof suCertText === 'function' ? suCertText(P.cert[side]) : `${P.cert[side].green}/${P.cert[side].rated} green`}`).join(' · ');
  const stats = row ? [[row.peas, `PEAs in ${b.label}`], [row.avg == null ? '—' : row.avg.toFixed(2), 'Avg score'], [row.change == null ? (row.isNew ? 'New' : '—') : tpSigned(row.change), 'vs quarter start'], [`${row.green}/${row.positions}`, 'Green positions'], [row.last ? ldDate(row.last) : '—', 'Last PEA'], [row.raters || '—', 'Raters']] : [];
  let months = '', curM = '';
  shown.forEach(n => {
    const mk = ldMonth(n.date);
    if(mk !== curM){ months += `${curM ? '</ul>' : ''}<h4 class="ld-month">${escapeHtml(mk)}</h4><ul class="dir-notes">`; curM = mk; }
    const t = LD_TYPES.find(x => x.id === n.type);
    months += `<li class="ld-note ${t ? 'is-' + t.id : ''}"><div class="dir-note-meta"><span>${escapeHtml(ldDateY(n.date))}${n.by ? ` · ${escapeHtml(n.by)}` : ''}${t ? ` <em class="ld-pill is-${t.id}">${escapeHtml(t.label)}</em>` : ''}</span><span class="ld-note-acts"><button type="button" class="dir-x" data-tp-note-del="${n.i}" aria-label="Delete note">${UO_X_ICON}</button></span></div><p>${escapeHtml(n.text)}</p>
      ${(n.tags || []).length ? `<div class="ld-tags">${n.tags.map(g => `<button type="button" data-tp-tag="${escapeHtml(g)}">${escapeHtml(tpTagLabel(g))}</button>`).join('')}</div>` : ''}</li>`;
  });
  if(curM) months += '</ul>';
  const tagOptions = P.positions.map(x => `<optgroup label="${escapeHtml(x.pos)}">${x.criteria.map(c => `<option value="${escapeHtml(`${x.pos}:${c.i}`)}">${escapeHtml(c.label)}</option>`).join('')}</optgroup>`).join('');
  const R = P.rater;
  return `
    <button type="button" class="ld-back" data-tp-back>← ${tpTab === 'team' ? 'Team scoreboard' : 'Rater leaderboard'}</button>
    <section class="dir-card ld-profile">
      <div class="ld-profile-head"><div><h3>${escapeHtml(name)}</h3><p class="dir-sub">${escapeHtml([P.role, P.sides.map(s => tpSideLabel[s]).join(' · ')].filter(Boolean).join(' · ') || 'Team member')} · ${escapeHtml(b.label)}${cert ? ` · ${escapeHtml(cert)}` : ''}</p></div>${row && row.allGreen ? '<span class="ld-status is-done">All green</span>' : row && row.stale ? `<span class="ld-status is-behind">Due a PEA</span>` : ''}</div>
      ${stats.length ? `<div class="ld-stats">${stats.map(([v, l]) => `<div><b>${escapeHtml(String(v))}</b><span>${escapeHtml(l)}</span></div>`).join('')}</div>` : '<p class="dir-empty">No Levelset rating on this name yet.</p>'}
      ${row && (row.gained.length || row.lost.length) ? `<p class="dir-note">${row.gained.length ? `Gone green this quarter: <b>${escapeHtml(row.gained.join(', '))}</b>. ` : ''}${row.lost.length ? `Slipped from green: <b>${escapeHtml(row.lost.join(', '))}</b>.` : ''}</p>` : ''}
    </section>
    ${P.positions.length ? `<section class="dir-card"><h3>Positions</h3><p class="dir-note">Weakest first. Tap a position for its criteria; the “coach” column is the criterion holding it back, in Levelset’s words.</p>
      <table class="ld-history tp-pos"><thead><tr><th>Position</th><th>Score</th><th>Criteria</th><th>Coach on</th><th>Last</th></tr></thead><tbody>${P.positions.map(x => `<tr class="${x.pos === tpPos ? 'is-on' : ''} ${x.gained ? 'is-gained' : ''}"><td><button type="button" class="ld-link" data-tp-pos="${escapeHtml(x.pos)}">${escapeHtml(x.pos)}</button>${x.gained ? ' <em class="ld-pill is-win">New green</em>' : ''}</td><td>${tpTierChip(x.cell)}${tpTrendMark(x.trend)}${x.was && Math.abs(x.cell.avg - x.was.avg) >= 0.05 ? ` <small class="dir-muted">${tpSigned(x.cell.avg - x.was.avg)}</small>` : ''}</td><td>${tpCriteriaBars(x.criteria, x.pos, true)}</td><td>${x.weak ? `${escapeHtml(x.weak.label)} <small class="dir-muted">${x.weak.avg.toFixed(1)}</small>` : x.cell.tier.key === 'crushing' ? '<span class="dir-muted">Green</span>' : '<span class="dir-muted">Even</span>'}</td><td>${escapeHtml(ldDate(x.cell.last))} <small class="dir-muted">×${x.cell.total}</small></td></tr>`).join('')}</tbody></table>
      ${open ? `<div class="tp-open"><div class="ld-row"><h4>${escapeHtml(open.pos)} · latest ${Math.min(open.cell.n, PEA_RECENT_RATINGS)} rating${open.cell.n === 1 ? '' : 's'}</h4><span class="dir-muted">${escapeHtml(open.cell.tier.label)} ${open.cell.avg.toFixed(2)}${open.trend ? ` · ${escapeHtml(peaTrendText(open.trend))}` : ''}</span></div>${tpCriteriaBars(open.criteria, open.pos)}<p class="dir-note">Tap a bar to see the notes tagged to that criterion.</p></div>` : ''}
    </section>` : ''}
    ${R ? `<section class="dir-card"><h3>As a rater</h3>
      <div class="ld-score"><div class="ld-score-ring">${ldRing(R.count, R.goal, R.status, 96)}<p><b>${R.points} points</b>: ${ldPlural(R.count, 'PEA')}${R.bonus ? ` + ${R.bonus} for coverage (${R.people} ${R.people === 1 ? 'person' : 'people'}, ${ldPlural(R.positions, 'position')})` : ''}. ${escapeHtml(ldPaceText(R, P))}</p>${ldPips(R.count, R.goal)}</div>
        <div class="ld-score-weeks">${ldWeekBars(R, P)}<div class="ld-stats">${[[R.streak > 1 ? `${R.streak} weeks` : R.streak === 1 ? '1 week' : '—', 'Streak'], [R.best || '—', 'Best week'], [R.avg != null ? R.avg.toFixed(2) : '—', 'Avg given'], [R.rank ? `#${R.rank}` : '—', 'Rank']].map(([v, l]) => `<div><b>${escapeHtml(String(v))}</b><span>${escapeHtml(l)}</span></div>`).join('')}</div></div></div>
      ${R.log.length ? `<details class="tp-log"><summary>${ldPlural(R.log.length, 'PEA')} given this quarter</summary><ul class="dir-list dir-list-sm">${R.log.slice().reverse().map(l => `<li><span>${escapeHtml(ldDate(l.date))} · <button type="button" class="ld-link" data-tp-open="${escapeHtml(l.employee)}">${escapeHtml(ldShort(l.employee))}</button> on ${escapeHtml(l.position)} (${l.overall})</span><span class="dir-muted">+${l.pts}${l.why.length ? ` · ${escapeHtml(l.why.join(', '))}` : ''}</span></li>`).join('')}</ul></details>` : ''}
    </section>` : ''}
    <section class="dir-card"><div class="ld-row"><h3>Notes</h3><button type="button" class="btn ${tpNoteOpen ? 'btn-ghost' : 'btn-primary'} dir-btn" data-tp-note-open>${tpNoteOpen ? 'Close' : 'Add a note'}</button></div>
      ${tpNoteOpen ? `<form class="ld-note-form" id="tpNoteForm">
        <div class="ld-note-row"><label>Date <input type="date" id="tpNoteDate" value="${today}" max="${today}" required></label><div class="ld-type-pick" role="radiogroup" aria-label="Type">${LD_TYPES.map((t, i) => `<label class="ld-type is-${t.id}" title="${escapeHtml(t.hint)}"><input type="radio" name="tpType" value="${t.id}" ${i === 0 ? 'checked' : ''}><span>${escapeHtml(t.label)}</span></label>`).join('')}</div></div>
        <textarea id="tpNoteText" rows="3" maxlength="1000" placeholder="What did you see or say? The moment, the position, what changed." required></textarea>
        ${tagOptions ? `<label class="tp-tag-pick">Tag to a position and criterion (optional) <select id="tpNoteTag"><option value="">None</option>${tagOptions}</select></label>` : ''}
        <button type="submit" class="btn btn-primary dir-btn">Save note</button></form>` : ''}
      ${P.notes.length ? `<div class="ld-chips">${LD_TYPES.map(t => `<button type="button" class="ld-chip is-${t.id}" data-tp-type="${t.id}" aria-pressed="${tpHide[t.id] ? 'false' : 'true'}">${escapeHtml(t.label)} <b>${counts[t.id]}</b></button>`).join('')}${tpTag ? `<span class="dir-muted">Tagged <b>${escapeHtml(tpTagLabel(tpTag))}</b> <button type="button" class="ld-link" data-tp-tag="">Show all</button></span>` : ''}</div>` : ''}
      ${P.notes.length ? (shown.length ? months : '<p class="dir-empty">No notes match the filters.</p>') : '<p class="dir-empty">No notes yet. Log a win, a coaching moment, something to watch, or a conversation.</p>'}
    </section>
    ${tpLsCardHtml(P.peaName)}
    ${P.ratings.length ? `<section class="dir-card"><h3>${escapeHtml(b.label)} ratings</h3>
      <ul class="dir-list dir-list-sm tp-timeline">${P.ratings.map(r => { const noGoal = P.leaderProfile && dirIsDirector(r.leader) && typeof ldCountsForGoal === 'function' && !ldCountsForGoal(r); return `<li class="${noGoal ? 'is-nogoal' : ''}"><span>${escapeHtml(ldDate(r.date))} · <b>${escapeHtml(r.position)}</b>${r.leader ? ` by ${escapeHtml(ldShort(r.leader))}` : ''}${noGoal ? ' <em class="tp-nogoal">not toward the goal</em>' : ''}</span><span><span class="tp-tier is-${peaTierFor(+r.overall || 0).key}">${r.overall}</span> <small class="dir-muted">${escapeHtml(r.criteria.map(c => c === '' || c == null ? '–' : c).join(' · '))}</small></span></li>`; }).join('')}</ul>
    </section>` : ''}
    <section class="dir-card"><h3>Quarter by quarter</h3>
      <table class="ld-history"><thead><tr><th>Quarter</th><th>PEAs</th><th>Avg</th><th>Green</th>${P.history.some(h => h.gave) ? '<th>Gave</th>' : ''}<th>Notes</th></tr></thead><tbody>${P.history.map(h => `<tr class="${h.q === tpQuarterOn() ? 'is-on' : ''}"><td><button type="button" class="ld-link" data-tp-quarter="${h.q}">${escapeHtml(h.b.label)}</button></td><td>${h.peas}</td><td>${h.avg == null ? '—' : h.avg.toFixed(2)}</td><td>${h.rated ? `${h.green}/${h.rated}` : '—'}</td>${P.history.some(x => x.gave) ? `<td>${h.gave || '—'}</td>` : ''}<td>${h.notes}</td></tr>`).join('')}</tbody></table>
      <p class="dir-note">Ratings are kept a year; notes stay. “Green” is positions at Crushing It at the quarter’s end.</p>
    </section>`;
}

// ----- Levelset notes (directors only) -----
// Tagging (Tim, Oct 17 2026): on the Leaders profile a director picks the
// sentences of a note that evidence a PEC pillar and tags them, so one note
// can feed several pillars with different sentences. The tags are kept with
// the note on the server (app.py, /api/pea/notes/tag) and count as evidence
// in Calibrate to the PEC (leaders.js) for directors.
let tpLsTag = null;   // the picker that's open: {key, picked: Set(sentence index)}
// Sentences, with a semicolon or a new line counting as a break too: raters write run-ons.
const tpLsSentences = text => (String(text || '').match(/[^.!?;\n]+(?:[.!?;]+|$)/g) || []).map(x => x.trim()).filter(Boolean);
function tpLsTagsHtml(n, canEdit){
  const tags = Array.isArray(n.tags) ? n.tags : [];
  if(!tags.length) return '';
  return `<ul class="ls-excerpts">${tags.map(t => `<li class="ls-excerpt"><q>${escapeHtml(t.text)}</q><span class="ls-excerpt-meta">${(t.pillars || []).map(p => `<em class="ld-pill is-ls">${escapeHtml(typeof ldPillarLabel === 'function' ? ldPillarLabel(p) : p)}</em>`).join('')}${canEdit ? `<button type="button" class="dir-x" data-ls-tag-del="${escapeHtml(t.id)}" data-ls-key="${escapeHtml(n.key)}" aria-label="Remove this tag">${UO_X_ICON}</button>` : ''}</span></li>`).join('')}</ul>`;
}
function tpLsPickerHtml(n, cards){
  const sentences = tpLsSentences(n.text);
  const picked = tpLsTag.picked;
  return `<div class="ls-tagbox" id="tpLsTagBox" data-ls-key="${escapeHtml(n.key)}">
    <p class="dir-note">Tap the sentences that show this pillar, then pick the pillar${cards.length > 1 ? 's' : ''}. Tag again for another pillar.</p>
    <div class="ls-sents">${sentences.map((x, i) => `<button type="button" class="ls-sent ${picked.has(i) ? 'is-on' : ''}" aria-pressed="${picked.has(i)}" data-ls-sent="${i}">${escapeHtml(x)}</button>`).join('')}</div>
    <div class="ls-sent-all"><button type="button" class="ld-link" data-ls-sent-all="${picked.size === sentences.length ? '0' : '1'}">${picked.size === sentences.length ? 'Clear' : 'Whole note'}</button></div>
    ${typeof ldPillarChecks === 'function' ? ldPillarChecks(cards, []) : ''}
    <div class="ld-acts"><button type="button" class="btn btn-primary dir-btn" data-ls-tag-save="1">Save tag</button><button type="button" class="btn btn-ghost dir-btn" data-ls-tag-cancel="1">Cancel</button></div>
  </div>`;
}
function tpLsNoteHtml(n, cards){
  const day = String(n.at || '').slice(0, 10);
  const canEdit = Array.isArray(cards) && cards.length > 0;
  const open = canEdit && tpLsTag && tpLsTag.key === n.key;
  return `<li class="ld-note"><div class="dir-note-meta"><span>${day ? escapeHtml(ldDateY(day)) : ''}${n.position ? ` · <b>${escapeHtml(n.position)}</b>` : ''}${n.leader ? ` · ${escapeHtml(ldShort(n.leader))}` : ''}</span><span class="ld-note-acts">${canEdit && !open ? `<button type="button" class="ld-link" data-ls-tag-open="${escapeHtml(n.key)}">Tag to a pillar</button>` : ''}${n.overall != null ? `<span class="tp-tier is-${peaTierFor(+n.overall || 0).key}">${escapeHtml(String(n.overall))}</span>` : ''}</span></div><p>${escapeHtml(n.text)}</p>${tpLsTagsHtml(n, canEdit)}${open ? tpLsPickerHtml(n, cards) : ''}</li>`;
}
// Every tagged excerpt of a person's Levelset notes (directors only):
// [{text, pillars, date, leader, position}] for Calibrate to the PEC.
function tpLsTagged(peaName){
  const got = tpLs[dirKey(peaName)];
  if(!tpDirector || !got || got.state !== 'ok') return [];
  const out = [];
  got.notes.forEach(n => (Array.isArray(n.tags) ? n.tags : []).forEach(t => out.push({text: t.text, pillars: t.pillars || [], date: String(n.at || '').slice(0, 10), leader: n.leader || '', position: n.position || ''})));
  return out;
}
function tpLsCardInner(peaName, cards){
  const head = '<div class="ld-row"><h3>Raters’ notes from Levelset</h3><em class="ld-pill">Directors only</em></div>';
  if(!tpDirector){
    return head + `<p class="dir-empty">${tpDirectorPinSet
      ? 'The notes leaders write on a PEA in Levelset show here for directors. Sign in with the director PIN to see them.'
      : 'The notes leaders write on a PEA in Levelset can show here for directors. Set a director PIN in Manage → Settings → Directors first.'}</p>`;
  }
  const got = tpLs[dirKey(peaName)];
  if(!got) setTimeout(() => tpLoadLevelsetNotes(peaName));
  if(!got || got.state === 'loading') return head + '<p class="dir-empty">Loading…</p>';
  if(got.state === 'err') return head + `<p class="dir-empty">${escapeHtml(got.error)}</p>`;
  const list = got.notes;
  const note = '<p class="dir-note">Written by the rater in Levelset, newest first. They come in with each Levelset sync (the PDF upload doesn’t carry them) and aren’t in the copy or the PDF.</p>';
  if(!list.length) return head + note + '<p class="dir-empty">No notes on this person’s PEAs yet.</p>';
  const more = list.slice(TP_LS_SHOWN);
  const row = n => tpLsNoteHtml(n, cards);
  const tagNote = cards && cards.length ? ' Tag the sentences that evidence a pillar and they count in Calibrate to the PEC below.' : '';
  return head + note.replace('</p>', tagNote + '</p>') + `<ul class="dir-notes">${list.slice(0, TP_LS_SHOWN).map(row).join('')}</ul>`
    + (more.length ? `<details class="tp-log" ${tpLsTag && more.some(n => n.key === tpLsTag.key) ? 'open' : ''}><summary>${more.length} more</summary><ul class="dir-notes">${more.map(row).join('')}</ul></details>` : '');
}
// The card, on the Team profile and the Leaders profile (leaders.js): a
// Team Lead's notes show on both. With `cards` (the leader's PEC role
// cards, Leaders profile) a director can tag sentences to pillars.
function tpLsCardHtml(peaName, cards){
  return `<section class="dir-card tp-ls-card" data-ls-name="${escapeHtml(dirKey(peaName))}" data-ls-cards="${escapeHtml((cards || []).join(','))}">${tpLsCardInner(peaName, cards || [])}</section>`;
}
function tpLsPaint(peaName){
  const k = dirKey(peaName);
  // On the Leaders profile the pillar counts read these notes too, so the
  // whole profile redraws; elsewhere just the card.
  if(typeof dirView !== 'undefined' && dirView === 'leaders' && typeof ldOpen !== 'undefined' && ldOpen && typeof ldRender === 'function'){ ldRender(); return; }
  document.querySelectorAll('.tp-ls-card').forEach(el => { if(el.dataset.lsName === k) el.innerHTML = tpLsCardInner(peaName, (el.dataset.lsCards || '').split(',').filter(Boolean)); });
}
// Tagging: the picker's taps, save and remove.
document.addEventListener('click', async e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t || !t.closest('.tp-ls-card')) return;
  const card = t.closest('.tp-ls-card');
  const name = card.dataset.lsName, got = tpLs[name];
  const paint = () => tpLsPaint(name);
  const noteOf = key => got && got.notes.find(n => n.key === key);
  const openBtn = t.closest('[data-ls-tag-open]');
  if(openBtn){ tpLsTag = {key: openBtn.dataset.lsTagOpen, picked: new Set()}; paint(); return; }
  if(t.closest('[data-ls-tag-cancel]')){ tpLsTag = null; paint(); return; }
  const sent = t.closest('[data-ls-sent]');
  if(sent && tpLsTag){ const i = +sent.dataset.lsSent; if(tpLsTag.picked.has(i)) tpLsTag.picked.delete(i); else tpLsTag.picked.add(i); paint(); return; }
  const all = t.closest('[data-ls-sent-all]');
  if(all && tpLsTag){ const n = noteOf(tpLsTag.key); tpLsTag.picked = all.dataset.lsSentAll === '1' && n ? new Set(tpLsSentences(n.text).map((x, i) => i)) : new Set(); paint(); return; }
  if(t.closest('[data-ls-tag-save]') && tpLsTag){
    const n = noteOf(tpLsTag.key);
    const box = document.getElementById('tpLsTagBox');
    const pillars = box ? [...box.querySelectorAll('input[name="ldPec"]:checked')].map(x => x.value) : [];
    const sentences = n ? tpLsSentences(n.text) : [];
    const idx = [...tpLsTag.picked].sort((a, b) => a - b).filter(i => sentences[i]);
    if(!idx.length){ showToast('Tap the sentences to tag first.'); return; }
    if(!pillars.length){ showToast('Pick at least one pillar.'); return; }
    // Sentences next to each other read as one stretch; an ellipsis only
    // marks a real skip. If the note has no space between two sentences the
    // stretch won't match it, so the server's refusal falls back to one
    // sentence per part.
    const runs = [];
    idx.forEach((i, k) => { if(k && i === idx[k - 1] + 1) runs[runs.length - 1].push(sentences[i]); else runs.push([sentences[i]]); });
    const btn = t.closest('[data-ls-tag-save]'); btn.disabled = true;
    try{
      const post = parts => fetch(`${API_BASE}/api/pea/notes/tag`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({key: tpLsTag.key, parts, pillars})});
      let res = await post(runs.map(r => r.join(' ')));
      let d = await res.json().catch(() => ({}));
      if(res.status === 400 && /isn’t in this note/.test(d.error || '')){ res = await post(idx.map(i => sentences[i])); d = await res.json().catch(() => ({})); }
      if(!res.ok) throw new Error(d.error || 'The tag didn’t save.');
      if(n && d.note) n.tags = d.note.tags;
      tpLsTag = null; paint(); showToast('Tagged');
    }catch(err){ btn.disabled = false; showToast(err.message); }
    return;
  }
  const del = t.closest('[data-ls-tag-del]');
  if(del){
    const key = del.dataset.lsKey, n = noteOf(key);
    if(!confirm('Remove this tag? The note itself stays.')) return;
    try{
      const res = await fetch(`${API_BASE}/api/pea/notes/tag`, {method: 'DELETE', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({key, tagId: del.dataset.lsTagDel})});
      const d = await res.json().catch(() => ({}));
      if(!res.ok) throw new Error(d.error || 'The tag didn’t go.');
      if(n && d.note) n.tags = d.note.tags;
      paint();
    }catch(err){ showToast(err.message); }
  }
});
// Fetched each time a profile opens, so a new sync's notes show.
async function tpLoadLevelsetNotes(peaName){
  const k = dirKey(peaName);
  if(!tpDirector || !k || tpLs[k]) return;
  tpLs[k] = {state: 'loading', notes: []};
  try{
    const res = await fetch(`${API_BASE}/api/pea/notes`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: peaName})});
    const d = await res.json().catch(() => ({}));
    if(res.status === 403) tpDirector = false;
    tpLs[k] = res.ok && Array.isArray(d.notes) ? {state: 'ok', notes: d.notes} : {state: 'err', error: d.error || 'Couldn’t load the notes.'};
  }catch(err){
    tpLs[k] = {state: 'err', error: 'Couldn’t reach the server. Open the profile again once you’re back online.'};
  }
  tpLsPaint(peaName);
}

// Set after the PIN screen (manage-and-import.js) or the director PIN form.
function tpSetDirector(isDirector, pinSet){
  tpDirector = !!isDirector;
  tpDirectorPinSet = !!pinSet || tpDirector;
  tpLs = {};
  tpRenderDirectorPin();
  if(typeof dirView !== 'undefined' && dirView === 'team' && tpOpen && !document.getElementById('tpNoteForm')) tpRender();
}
async function tpRefreshDirector(){
  try{
    const d = await (await fetch(`${API_BASE}/api/manager/status`)).json();
    tpSetDirector(d.isDirector, d.directorPinSet);
  }catch(err){ /* stays as it was */ }
}

// Manage → Settings → Directors: the director PIN.
function tpRenderDirectorPin(){
  const root = document.getElementById('directorPinRoot');
  if(!root) return;
  const form = label => `<div class="tp-dpin"><input type="password" id="tpDirectorPin" inputmode="numeric" autocomplete="new-password" minlength="4" maxlength="12" placeholder="New director PIN" aria-label="New director PIN"><button type="button" class="btn btn-primary dir-btn" data-tp-dpin-save>${label}</button></div><p class="dir-note" id="tpDirectorPinMsg" role="status"></p>`;
  root.innerHTML = `<h4>Director PIN</h4>` + (tpDirector
    ? `<p class="dir-note">This device is signed in as a director. The director PIN opens everything the manager PIN does, plus the raters’ Levelset notes on each team member (Directors → Team). Change it here; it has to differ from the manager PIN.</p>${form('Change')}`
    : tpDirectorPinSet
      ? '<p class="dir-note">Set. Directors type it on the PIN screen instead of the manager PIN to see the raters’ Levelset notes. Only a director can change it.</p>'
      : `<p class="dir-note">The raters’ Levelset notes on each team member are for directors only. Set a director PIN (different from the manager PIN) and share it with the directors; they type it on the PIN screen instead of the manager PIN. Once set, only a director can change it.</p>${form('Set the director PIN')}`);
}
document.addEventListener('click', async e => {
  const btn = e.target && e.target.closest ? e.target.closest('[data-tp-dpin-save]') : null;
  if(!btn) return;
  const input = document.getElementById('tpDirectorPin'), msg = document.getElementById('tpDirectorPinMsg');
  const pin = input ? input.value.trim() : '';
  if(pin.length < 4){ if(msg) msg.textContent = 'At least 4 characters.'; return; }
  btn.disabled = true;
  try{
    const res = await fetch(`${API_BASE}/api/director/set-pin`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({pin})});
    const d = await res.json().catch(() => ({}));
    if(res.ok){ tpSetDirector(true, true); showToast('Director PIN saved. This device is signed in as a director.'); return; }
    if(msg) msg.textContent = d.error || 'Couldn’t save it.';
  }catch(err){
    if(msg) msg.textContent = 'Couldn’t reach the server.';
  }
  btn.disabled = false;
});

function tpBodyHtml(){
  if(tpOpen){ const P = tpPerson(tpOpen); if(!P.positions.length && !P.notes.length && !P.rater) tpOpen = ''; }
  return tpOpen ? tpProfileHtml() : tpBoardsHtml();
}

// ----- As text (copy / PDF) -----
function tpBoardText(){
  const R = tpRaters(), T = tpTeam(), b = R.quarter;
  const out = [`RATER LEADERBOARD · ${b.label} (${b.span})`, `${R.byRaters} PEAs by ${ldPlural(R.raters.length, 'rater')}${R.byDirectors ? `, ${R.byDirectors} by directors` : ''} · ${R.people} people, ${ldPlural(R.positions, 'position')} rated · goal ${R.goal} each`, ''];
  R.raters.forEach(r => out.push(`${r.rank}. ${ldShort(r.name)} — ${r.points} pts (${ldPlural(r.count, 'PEA')}, ${r.people} ${r.people === 1 ? 'person' : 'people'}, ${ldPlural(r.positions, 'position')})${r.streak > 1 ? ` · ${r.streak}-week streak` : ''}${r.status === 'done' ? ' · goal met' : ''}`));
  if(!R.raters.length) out.push('No raters yet.');
  if(R.directors.length){ out.push(''); out.push('DIRECTORS'); R.directors.forEach(r => out.push(`${ldShort(r.name)} — ${r.points} pts (${ldPlural(r.count, 'PEA')})`)); }
  out.push(''); out.push(`TEAM SCOREBOARD · ${b.label}`);
  out.push(`${T.peas} PEAs · ${T.rated} of ${T.people.length} people rated · ${T.gained} positions gone green${T.lost ? `, ${T.lost} slipped` : ''} · ${T.allGreen} all green${T.current && T.stale ? ` · ${T.stale} due a PEA` : ''}`);
  out.push('');
  tpTeamShown(T).forEach(p => out.push(`${p.rank}. ${ldShort(p.name)} — ${p.gained.length ? `+${p.gained.length} green` : p.lost.length ? `−${p.lost.length} green` : 'green held'}, avg ${p.avg == null ? '—' : p.avg.toFixed(2)}${p.change != null ? ` (${tpSigned(p.change)})` : p.isNew ? ' (new)' : ''}, ${p.green}/${p.positions} green, ${ldPlural(p.peas, 'PEA')}${p.stale ? ' · due a PEA' : ''}`));
  return out.join('\n');
}
function tpProfileText(name){
  const P = tpPerson(name), b = P.quarter, row = P.row;
  const out = [`${P.name}${P.role ? ' — ' + P.role : ''}${P.sides.length ? ' (' + P.sides.map(s => tpSideLabel[s]).join(', ') + ')' : ''}`, `${b.label} (${b.span})`, ''];
  if(row){
    out.push(`PEAs this quarter: ${row.peas}${row.last ? ` · last ${ldDate(row.last)}` : ''}${row.raters ? ` · ${ldPlural(row.raters, 'rater')}` : ''}`);
    out.push(`Average: ${row.avg == null ? '—' : row.avg.toFixed(2)}${row.change != null ? ` (${tpSigned(row.change)} since the quarter began)` : row.isNew ? ' (first rated this quarter)' : ''} · green: ${row.green} of ${row.positions} positions${row.allGreen ? ' · ALL GREEN' : ''}`);
    if(row.gained.length) out.push(`Gone green this quarter: ${row.gained.join(', ')}`);
    if(row.lost.length) out.push(`Slipped from green: ${row.lost.join(', ')}`);
  } else out.push('No Levelset rating yet.');
  if(P.positions.length){
    out.push(''); out.push('POSITIONS (weakest first)');
    P.positions.forEach(x => out.push(`${x.pos}: ${x.cell.avg.toFixed(2)} ${x.cell.tier.label} (×${x.cell.total}${x.trend ? `, ${peaTrendText(x.trend)}` : ''})${x.weak ? ` · coach on ${x.weak.label} (${x.weak.avg.toFixed(1)})` : ''} · ${x.criteria.map(c => `${c.label} ${c.avg == null ? '—' : c.avg.toFixed(1)}`).join(', ')}`));
  }
  const R = P.rater;
  if(R){ out.push(''); out.push('AS A RATER'); out.push(`${R.points} points: ${ldPlural(R.count, 'PEA')} of ${R.goal}, ${R.people} ${R.people === 1 ? 'person' : 'people'}, ${ldPlural(R.positions, 'position')}${R.rank ? ` · rank #${R.rank}` : ''}${R.streak > 1 ? ` · ${R.streak}-week streak` : ''}`); }
  const notes = P.notes.filter(n => n.date >= b.from && n.date <= b.to).sort((a, c) => a.date.localeCompare(c.date));
  out.push(''); out.push(`NOTES (${notes.length})`);
  notes.length ? notes.forEach(n => { const t = LD_TYPES.find(x => x.id === n.type); out.push(`${ldDate(n.date)} · ${t ? t.label : 'Note'}: ${n.text}${(n.tags || []).length ? ` [${n.tags.map(tpTagLabel).join('; ')}]` : ''}`); }) : out.push('None this quarter.');
  if(P.ratings.length){ out.push(''); out.push(`RATINGS THIS QUARTER (${P.ratings.length})`); P.ratings.forEach(r => out.push(`${ldDate(r.date)} · ${r.position}${r.leader ? ` by ${ldShort(r.leader)}` : ''}: ${r.overall} (${r.criteria.join(', ')})`)); }
  return out.join('\n');
}

// ----- Events (inside #directorsRoot, Team view) -----
function tpRender(){ if(typeof renderDirectorsView === 'function') renderDirectorsView(); }
function tpOpenProfile(name){
  tpOpen = name; tpPos = ''; tpTag = ''; tpHide = {}; tpNoteOpen = false; tpLs = {}; tpLsTag = null;
  tpRender(); window.scrollTo(0, 0);
}

document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t || !t.closest('#directorsRoot') || typeof dirView === 'undefined' || dirView !== 'team') return;
  const open = t.closest('[data-tp-open]');
  if(open){ tpOpenProfile(open.dataset.tpOpen); return; }
  if(t.closest('[data-tp-back]')){ tpOpen = ''; tpRender(); return; }
  const tab = t.closest('[data-tp-tab]');
  if(tab){ tpTab = tab.dataset.tpTab; tpRender(); return; }
  const side = t.closest('[data-tp-side]');
  if(side){ tpSide = side.dataset.tpSide; tpRender(); return; }
  const pos = t.closest('[data-tp-pos]');
  if(pos){ tpPos = tpPos === pos.dataset.tpPos ? '' : pos.dataset.tpPos; tpRender(); return; }
  const tag = t.closest('[data-tp-tag]');
  if(tag){ const v = tag.dataset.tpTag; tpTag = tpTag === v ? '' : v; tpRender(); return; }
  const type = t.closest('[data-tp-type]');
  if(type){ tpHide[type.dataset.tpType] = !tpHide[type.dataset.tpType]; tpRender(); return; }
  const q = t.closest('[data-tp-quarter]');
  if(q){ tpQuarter = q.dataset.tpQuarter; tpRender(); return; }
  if(t.closest('[data-tp-note-open]')){ tpNoteOpen = !tpNoteOpen; tpRender(); const ta = document.getElementById('tpNoteText'); if(ta) ta.focus(); return; }
  const del = t.closest('[data-tp-note-del]');
  if(del){
    const key = tpNoteKey(tpOpen), list = tpNotes()[key] || [], n = list[+del.dataset.tpNoteDel];
    if(!n || !confirm('Delete this note?')) return;
    list.splice(+del.dataset.tpNoteDel, 1);
    if(!list.length) delete teamNotes[key];
    tpRender(); saveState(); return;
  }
  const copy = t.closest('[data-tp-copy]');
  if(copy){ dirCopy(copy, tpOpen ? tpProfileText(tpOpen) : tpBoardText()); return; }
  if(t.closest('[data-tp-pdf]')){ dirPdf(tpProfileText(tpOpen), `team-${dirKey(tpOpen).replace(/\s+/g, '-')}-${tpQuarterOn()}.pdf`); }
});
document.addEventListener('change', e => {
  if(e.target && e.target.id === 'tpQuarter'){ tpQuarter = e.target.value; tpRender(); }
});
document.addEventListener('input', e => {
  if(!e.target || e.target.id !== 'tpSearch') return;
  tpSearch = e.target.value;
  tpRender();
  const el = document.getElementById('tpSearch');
  if(el){ el.focus(); try{ el.setSelectionRange(el.value.length, el.value.length); }catch(_){} }
});
document.addEventListener('submit', e => {
  if(e.target.id !== 'tpNoteForm') return;
  e.preventDefault();
  const text = (document.getElementById('tpNoteText').value || '').trim();
  const date = document.getElementById('tpNoteDate').value || today;
  const typeEl = e.target.querySelector('input[name="tpType"]:checked');
  const tagEl = document.getElementById('tpNoteTag');
  if(!text || !tpOpen) return;
  const note = {text: text.slice(0, 1000), by: (typeof getInitials === 'function' && getInitials()) || '', ts: Date.now(), date, type: typeEl ? typeEl.value : 'win'};
  if(tagEl && tagEl.value) note.tags = [tagEl.value];
  tpSaveNote(tpOpen, note);
  tpNoteOpen = false; tpRender(); showToast('Note saved'); saveState();
});
