// ===== DIRECTORS =====
// The week ahead for the director team (Tim, Oct 2026): what the data the
// hub already holds says about the coming week, on one page behind the PIN,
// and as a plain-text brief to copy into a text or email, or a PDF.
//
//  1. The week at a glance: each day's leaders, team members and director
//     time, and the hours with no leader on the floor.
//  2. Where the directors' shifts overlap the leaders'.
//  3. Needs attention: meetings and events marked for a director, with who
//     leads the floor at the time.
//  4. PEA cadence: leaders by how long since their last PEA given, team
//     members by their last received.
//  5. The PEA scoreboard in short (the Leaders view, leaders.js, has the
//     profiles: scoreboard, focus, notes, PEC calibration, quarter history).
//  6. The numbers: the week's forecast, last week's accuracy, waste, orders.
//
// Directors are named in Manage → Settings (directors, {name, title}, as
// HotSchedules spells them); their time is the Administrative shifts the
// roster import keeps (adminShifts). Leaders are the leader list in Manage →
// Settings → Leaders, the Team Leader shifts on the roster, and anyone set as
// Lead Captain on Set Ups. Notes live in
// leaderNotes {name: [{text, by, ts, date, type, pec}]} (the private people
// section).

const DIRECTORS_SEED = [
  {name: 'Timothy Lane', title: 'Director'},
  {name: 'Kianna Ramos', title: 'Director'},
  {name: 'Casey Howard', title: 'Managing Partner'},
];
const DIR_PEA_DAYS = 14;        // a leader or team member past this many days since a PEA is flagged
const DIR_PEA_COUNT_DAYS = 30;  // PEAs given in this many days, per leader
const DIR_GAP_MIN = 30;         // a leader-less stretch shorter than this isn't a gap
const DIR_CLOSE_MIN = 21 * 60 + 30;   // a leader on until here counts as closing

let dirWeekOffset = 0;   // 0 = this week, 1 = next
// Four destinations, one level (Tim, Oct 19 2026): Brief, People (the
// leaders, the team and the raters, leaders.js + team-pea.js), Report
// (leader-report.js) and Points (points.js). The old 'leaders' and 'team'
// views map onto People so saved links and older code keep working.
let dirView = 'brief';      // 'brief' | 'people' | 'report' | 'points'
let dirPeople = 'leaders';  // 'leaders' | 'team' | 'raters'
const DIR_VIEWS = ['brief', 'people', 'report', 'points'];
function dirSetView(v){
  if(v === 'leaders'){ dirView = 'people'; dirPeople = 'leaders'; return; }
  if(v === 'team'){ dirView = 'people'; dirPeople = typeof tpTab !== 'undefined' && tpTab === 'team' ? 'team' : 'raters'; return; }
  dirView = DIR_VIEWS.includes(v) ? v : 'brief';
}
function dirSetPeople(which){
  dirView = 'people';
  dirPeople = ['leaders', 'team', 'raters'].includes(which) ? which : 'leaders';
  if(dirPeople !== 'leaders' && typeof tpTab !== 'undefined') tpTab = dirPeople;
}
function dirNormalizeView(){
  if(dirView === 'leaders' || dirView === 'team') dirSetView(dirView);
  if(!DIR_VIEWS.includes(dirView)) dirView = 'brief';
  if(dirView === 'people' && dirPeople !== 'leaders' && typeof tpTab !== 'undefined') tpTab = dirPeople;
}
function dirShowsLeaders(){ dirNormalizeView(); return dirView === 'people' && dirPeople === 'leaders'; }
function dirShowsTeam(){ dirNormalizeView(); return dirView === 'people' && dirPeople !== 'leaders'; }

function dirList(){ return Array.isArray(directors) ? directors : DIRECTORS_SEED; }
function dirEnsureOwn(){ if(!Array.isArray(directors)) directors = JSON.parse(JSON.stringify(DIRECTORS_SEED)); }
const dirKey = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
function dirIsDirector(name){ const k = dirKey(name); return dirList().some(d => dirKey(d.name) === k); }

// ----- The week's people -----

// A roster entry's shift in minutes, or null.
function dirSpan(p){
  const s = parseShiftTimeToMinutes(p.start), e = parseShiftTimeToMinutes(p.end);
  if(s === null || e === null) return null;
  return {start: s, end: e <= s ? e + 1440 : e};
}
const dirClock = m => { const h = Math.floor(m / 60) % 24, mm = m % 60; const ap = h >= 12 ? 'p' : 'a'; return `${h % 12 || 12}${mm ? ':' + String(mm).padStart(2, '0') : ''}${ap}`; };
const dirOverlap = (a, b) => a && b && a.start < b.end && b.start < a.end;

// Everyone on the floor that day: {name, section, leader, span}.
function dirFloor(iso){
  const out = [];
  [['foh', fohRoster[iso]], ['boh', bohRoster[iso]]].forEach(([section, list]) => {
    (Array.isArray(list) ? list : []).forEach(p => { const span = dirSpan(p); if(span) out.push({name: p.name, section, leader: !!p.leader || dirOnLeaderList(p.name), span}); });
  });
  // Lead Captains set on Set Ups count as leaders for their day.
  const caps = new Set();
  Object.keys(posAssignments).forEach(k => { const parts = k.split('||'); if(parts[0] === 'foh' && parts[1] === iso && parts[3] === SU_LEAD_CAPTAIN && posAssignments[k]) caps.add(dirKey(posAssignments[k])); });
  out.forEach(p => { if(caps.has(dirKey(p.name))) p.leader = true; });
  return out;
}
function dirLeaders(iso){ return dirFloor(iso).filter(p => p.leader); }

// On the leader list in Manage → Settings → Leaders (exactly, or by the PEA
// name matcher). The Leaders page's wider set (PEA givers, people with
// notes) isn't a roster leader here: it made most of the floor "leaders"
// (28 of 38 one Monday; Tim, Oct 18 2026).
function dirOnLeaderList(name){
  const list = (Array.isArray(leaderRoster) ? leaderRoster : []).map(r => r && r.name ? String(r.name).trim() : '').filter(Boolean);
  if(!list.length || !name) return false;
  const k = dirKey(name);
  if(list.some(n => dirKey(n) === k)) return true;
  return typeof peaMatchName === 'function' && !!peaMatchName(name, list);
}
function dirDirectorShifts(iso){
  return (Array.isArray(adminShifts[iso]) ? adminShifts[iso] : []).filter(s => dirIsDirector(s.name)).map(s => ({...s, span: dirSpan(s)})).filter(s => s.span);
}

// Stretches of the day's open hours (first shift start to last shift end)
// with no leader on: [{start, end}] in minutes.
function dirLeaderGaps(iso){
  const floor = dirFloor(iso);
  if(!floor.length) return [];
  const open = {start: Math.min(...floor.map(p => p.span.start)), end: Math.max(...floor.map(p => p.span.end))};
  const spans = floor.filter(p => p.leader).map(p => p.span).sort((a, b) => a.start - b.start);
  const gaps = [];
  let at = open.start;
  spans.forEach(s => { if(s.start > at) gaps.push({start: at, end: s.start}); at = Math.max(at, s.end); });
  if(at < open.end) gaps.push({start: at, end: open.end});
  return gaps.filter(g => g.end - g.start >= DIR_GAP_MIN);
}
function dirHasCloser(iso){ return dirLeaders(iso).some(p => p.span.end >= DIR_CLOSE_MIN); }

// The week on screen: Monday to Saturday.
function dirWeek(){ return getWeekDays(dirWeekOffset).map(d => d.date); }

// ----- Needs attention -----
function dirAttention(dates){
  const out = [];
  dates.forEach(iso => eventsOn(iso).forEach(ev => {
    if(ev.kind !== 'meeting' && !ev.attn) return;
    if(out.some(x => x.ev === ev && ev.end)) return;   // a multi-day one, once
    const span = ev.from ? {start: evMinutes(ev.from), end: evMinutes(ev.to)} : null;
    const leaders = dirLeaders(iso).filter(p => !span || dirOverlap(p.span, span));
    out.push({ev, iso, span, leaders});
  }));
  return out;
}
function dirOtherEvents(dates){
  const seen = new Set(), out = [];
  dates.forEach(iso => eventsOn(iso).forEach(ev => {
    if(ev.kind === 'meeting' || ev.attn || ev.kind === 'note' || seen.has(ev)) return;
    seen.add(ev); out.push({ev, iso});
  }));
  return out;
}

// ----- PEA cadence -----
function dirPeaCadence(dates){
  const ratings = typeof peaAllRatings === 'function' ? peaAllRatings() : [];
  const cutoff = fcAddDaysSafe(today, -DIR_PEA_COUNT_DAYS);
  const byLeader = {}, byEmployee = {};
  ratings.forEach(r => {
    if(r.leader){ const L = byLeader[r.leader] = byLeader[r.leader] || {name: r.leader, last: '', recent: 0}; if(r.date > L.last) L.last = r.date; if(r.date >= cutoff) L.recent++; }
    const E = byEmployee[r.employee] = byEmployee[r.employee] || {name: r.employee, last: ''}; if(r.date > E.last) E.last = r.date;
  });
  // Leaders this week with no PEA on record show too.
  const weekLeaders = new Set();
  dates.forEach(iso => dirLeaders(iso).forEach(p => weekLeaders.add(p.name)));
  weekLeaders.forEach(n => { if(!Object.keys(byLeader).some(k => dirKey(k) === dirKey(n))) byLeader[n] = {name: n, last: '', recent: 0}; });
  const days = last => last ? Math.round((new Date(today + 'T00:00:00') - new Date(last + 'T00:00:00')) / 86400000) : null;
  const leaders = Object.values(byLeader).map(L => ({...L, days: days(L.last)})).sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999));
  const employees = Object.values(byEmployee).map(E => ({...E, days: days(E.last)})).sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999));
  return {leaders, employees, any: ratings.length > 0};
}
function fcAddDaysSafe(iso, n){ const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return toLocalISODate(d); }

// ----- The numbers -----
function dirNumbers(dates){
  const out = {};
  if(typeof fcAnalysisFor === 'function' && typeof salesHistory !== 'undefined' && Object.keys(salesHistory).length){
    try{
      const a = fcAnalysisFor(fcSettings());
      let sum = 0, n = 0;
      dates.forEach(iso => { const b = fcBaseline(iso, a); if(b.sales != null && !b.closed){ sum += b.sales; n++; } });
      if(n) out.forecast = {sales: sum, days: n, vsLastYear: a.vsLastYearPct};
      const t = fcTrackRecord(forecastLog, salesHistory);
      if(t.days) out.track = {accuracy: t.accuracy, days: t.days, miss: t.miss, bias: t.bias};
    }catch(e){ console.warn('Directors: forecast figures skipped', e); }
  }
  const past = getWeekDays(-1).map(d => d.date);
  const open = past.filter(iso => fohRoster[iso] && fohRoster[iso].length);
  if(open.length) out.waste = {under: open.filter(iso => wasteDays.includes(iso)).length, days: open.length, limit: wasteTarget};
  if(typeof uniformOrders !== 'undefined') out.orders = uniformOrders.filter(o => o.status !== 'done').length;
  return out;
}

// ----- Rendering -----
const DIR_ICON_WARN = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2z"/><path d="M12 10v4"/><path d="M12 17.5v.5"/></svg>';
const dirDay = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
const dirShort = n => typeof suDisplayName === 'function' ? suDisplayName(n) : n;
const dirSpanText = s => `${dirClock(s.start)}–${dirClock(s.end)}`;

function dirShown(){ return typeof launchManager === 'undefined' || !!launchManager; }

// ----- The page frame: one header pattern, one row of destinations -----
const DIR_ICON_SHARE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M8 8l4-4 4 4"/><path d="M5 13v6h14v-6"/></svg>';
function dirNavHtml(){
  dirNormalizeView();
  const on = id => `class="uo-pane-btn ${dirView === id ? 'active' : ''}" role="tab" aria-selected="${dirView === id ? 'true' : 'false'}"`;
  return `<div class="uo-panes dir-nav" role="tablist" aria-label="Directors"><button type="button" ${on('brief')} data-dir-view="brief">Brief</button>${typeof ldBodyHtml === 'function' ? `<button type="button" ${on('people')} data-dir-view="people">People</button>` : ''}${typeof lrBodyHtml === 'function' ? `<button type="button" ${on('report')} data-dir-view="report">Report</button>` : ''}${typeof ptBodyHtml === 'function' ? `<button type="button" ${on('points')} data-dir-view="points">Points</button>` : ''}</div>`;
}
// Copy, PDF and the like sit behind one share icon; the menu closes on a tap
// outside (see the document click handler below).
function dirShareHtml(items){
  if(!items || !items.length) return '';
  return `<div class="dir-share"><button type="button" class="dir-share-btn" data-dir-share aria-label="Share" aria-haspopup="menu" aria-expanded="false">${DIR_ICON_SHARE}</button><div class="dir-share-menu" role="menu" hidden>${items.map(i => `<button type="button" class="dir-share-item" role="menuitem" ${i.attr}>${i.label}</button>`).join('')}</div></div>`;
}
function dirHeadHtml(title, sub, picker, shareItems){
  return `<div class="dir-head">
    <div class="dir-head-main"><h2 class="dir-title">${title}</h2>${sub ? `<p class="dir-sub">${sub}</p>` : ''}</div>
    <div class="dir-head-side">${picker || ''}${dirShareHtml(shareItems)}</div>
  </div>`;
}
function dirPickHtml(id, label, options){
  return `<label class="ld-q dir-pick"><span>${label}</span><select id="${id}" aria-label="${label}">${options.map(o => `<option value="${escapeHtml(String(o.value))}" ${o.attr || ''} ${o.on ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select></label>`;
}
function dirQuarterSelect(){
  const on = ldQuarterOn();
  return dirPickHtml('dirQuarter', 'Quarter', ldQuarters().map(q => ({value: q, on: q === on, label: ldQuarterBounds(q).label + (q === ldQuarterNow() ? ' (now)' : '')})));
}
function dirPeopleChipsHtml(){
  const c = (id, label) => `<button type="button" class="ld-chip" data-dir-people="${id}" aria-pressed="${dirPeople === id ? 'true' : 'false'}">${label}</button>`;
  return `<div class="ld-chips dir-people-chips" role="tablist" aria-label="People">${c('leaders', 'Leaders')}${typeof tpBodyHtml === 'function' ? c('team', 'Team') + c('raters', 'Raters') : ''}</div>`;
}
function dirShareToggle(btn){
  const menu = btn.nextElementSibling;
  if(!menu) return;
  const open = !!menu.hidden;
  menu.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function dirShareClose(menu){
  if(!menu) return;
  menu.hidden = true;
  const btn = menu.previousElementSibling;
  if(btn) btn.setAttribute('aria-expanded', 'false');
}

// A day as a timeline (Tim, Oct 18 2026): one row per leader and per
// director shift, a bar across the open hours, and a coverage row on top
// with the leader-less stretches in red. Reads in a glance where the chips
// were a wall of names.
const DIR_DAY_START = 5 * 60 + 30, DIR_DAY_END = 22 * 60 + 30;   // 5:30a–10:30p, wider if a shift is
function dirTimelineHtml(iso, leaders, dirs, gaps){
  const floor = dirFloor(iso);
  const lo = Math.min(DIR_DAY_START, ...floor.map(p => p.span.start)), hi = Math.max(DIR_DAY_END, ...floor.map(p => p.span.end));
  const pct = m => Math.max(0, Math.min(100, (m - lo) / (hi - lo) * 100));
  const bar = (s, cls) => `<span class="dir-tl-bar ${cls}" style="left:${pct(s.start).toFixed(1)}%;width:${(pct(s.end) - pct(s.start)).toFixed(1)}%"></span>`;
  const row = (p, cls) => `<div class="dir-tl-row"><span class="dir-tl-name ${cls}">${escapeHtml(dirShort(p.name))}</span><span class="dir-tl-track">${bar(p.span, cls)}</span><small class="dir-tl-span">${escapeHtml(dirSpanText(p.span))}</small></div>`;
  const ticks = [];
  for(let m = Math.ceil(lo / 240) * 240; m <= hi; m += 240) ticks.push(m);
  return `<div class="dir-tl">
    <div class="dir-tl-row is-cover"><span class="dir-tl-name">Leader on</span><span class="dir-tl-track">${gaps.map(g => bar(g, 'is-gap')).join('')}</span><small class="dir-tl-span">${gaps.length ? escapeHtml(gaps.map(g => 'gap ' + dirSpanText(g)).join(', ')) : 'all day'}</small></div>
    ${leaders.map(p => row(p, 'is-leader')).join('')}${dirs.map(d => row(d, 'is-director')).join('')}
    <div class="dir-tl-row dir-tl-ticks" aria-hidden="true"><span></span><span class="dir-tl-track">${ticks.map(m => `<i style="left:${pct(m).toFixed(1)}%">${dirClock(m)}</i>`).join('')}</span><span></span></div>
  </div>`;
}

function renderDirectorsView(){
  const root = document.getElementById('directorsRoot');
  if(!root) return;
  if(!dirShown()){ root.innerHTML = ''; return; }
  dirNormalizeView();
  const dates = dirWeek();
  const peopleOn = dirView === 'people' && typeof ldBodyHtml === 'function';
  const reportOn = dirView === 'report' && typeof lrBodyHtml === 'function';
  const pointsOn = dirView === 'points' && typeof ptBodyHtml === 'function';
  const nav = dirNavHtml();
  if(pointsOn){
    root.innerHTML = `${dirHeadHtml('Points', ptHeadSub(), '', [])}${nav}${ptActionsHtml()}${ptBodyHtml()}`;
    return;
  }
  if(reportOn){
    const rep = {dates: getWeekDays(lrWeekOffset).map(d => d.date)};
    const sub = lrHeadHtml(rep).replace(/^<p class="dir-sub">/, '').replace(/<\/p>$/, '');
    const pick = dirPickHtml('lrWeekPick', 'Week', LR_WEEKS.map(w => ({value: w.offset, on: lrWeekOffset === w.offset, label: w.label, attr: `data-lr-week="${w.offset}"`})));
    root.innerHTML = `${dirHeadHtml('Weekly report', sub, pick, [{attr: 'data-lr-copy', label: 'Copy report'}, {attr: 'data-lr-pdf', label: 'PDF'}])}${nav}${lrBodyHtml()}`;
    return;
  }
  if(peopleOn){
    const leaders = dirPeople === 'leaders';
    const team = !leaders && typeof tpPeopleHtml === 'function';
    const body = leaders ? ldBodyHtml() : team ? tpPeopleHtml() : ldBodyHtml();
    const profile = leaders ? !!ldOpen : team ? !!tpOpen : false;
    const b = ldQuarterBounds(leaders ? ldQuarterOn() : tpQuarterOn());
    const sub = profile ? `${escapeHtml(b.label)} · ${escapeHtml(b.span)}` : `PEA development · ${escapeHtml(b.label)}`;
    const share = leaders
      ? (ldOpen ? [{attr: 'data-ld-copy', label: 'Copy profile'}] : (typeof ldiCardHtml === 'function' ? [{attr: 'data-ldi-open', label: ldiOpen ? 'Close import' : 'Bring notes in'}] : []))
      : (tpOpen ? [{attr: 'data-tp-copy', label: 'Copy profile'}, {attr: 'data-tp-pdf', label: 'PDF'}] : [{attr: 'data-tp-copy', label: 'Copy board'}]);
    root.innerHTML = `${dirHeadHtml('People', sub, dirQuarterSelect(), share)}${profile ? '' : nav + dirPeopleChipsHtml()}${body}`;
    return;
  }
  const hasRoster = dates.some(iso => fohRoster[iso] && fohRoster[iso].length);
  const attention = dirAttention(dates), others = dirOtherEvents(dates);
  const pea = dirPeaCadence(dates);
  const nums = dirNumbers(dates);

  const dayRows = dates.map(iso => {
    const floor = dirFloor(iso), leaders = floor.filter(p => p.leader), dirs = dirDirectorShifts(iso);
    const gaps = dirLeaderGaps(iso);
    const flags = [];
    if(floor.length && !leaders.length) flags.push('no leader on the roster');
    gaps.forEach(g => flags.push(`no leader ${dirSpanText(g)}`));
    if(floor.length && leaders.length && !dirHasCloser(iso)) flags.push('no leader through close');
    return `
      <div class="dir-day ${flags.length ? 'is-flag' : ''} ${iso === today ? 'is-today' : ''}">
        <div class="dir-day-head"><b>${escapeHtml(dirDay(iso))}</b>${floor.length ? `<span>${leaders.length} leader${leaders.length === 1 ? '' : 's'} · ${floor.length - leaders.length} team</span>` : '<span>no roster yet</span>'}</div>
        ${floor.length ? dirTimelineHtml(iso, leaders.sort((a, b) => a.span.start - b.span.start), dirs.sort((a, b) => a.span.start - b.span.start), gaps) : ''}
        ${floor.length && !dirs.length ? '<div class="dir-none">No director shift</div>' : ''}
        ${flags.length ? `<div class="dir-flags">${flags.map(f => `<span>${DIR_ICON_WARN}${escapeHtml(f)}</span>`).join('')}</div>` : ''}
      </div>`;
  }).join('');

  const overlapRows = dates.flatMap(iso => dirDirectorShifts(iso).map(d => {
    const with_ = dirLeaders(iso).filter(p => dirOverlap(p.span, d.span)).sort((a, b) => a.span.start - b.span.start);
    return `<li><b>${escapeHtml(dirShort(d.name))}</b> <span class="dir-muted">${escapeHtml(dirDay(iso))} · ${escapeHtml(dirSpanText(d.span))}</span><br>${with_.length ? with_.map(p => `<span class="dir-chip is-leader">${escapeHtml(dirShort(p.name))} <small>${escapeHtml(dirSpanText(p.span))}</small></span>`).join(' ') : '<span class="dir-muted">no leader on at the same time</span>'}</li>`;
  }));
  // Leaders a director never overlaps this week.
  const seenWith = new Set();
  dates.forEach(iso => dirDirectorShifts(iso).forEach(d => dirLeaders(iso).forEach(p => { if(dirOverlap(p.span, d.span)) seenWith.add(dirKey(p.name)); })));
  const unseen = [...new Set(dates.flatMap(iso => dirLeaders(iso).map(p => p.name)))].filter(n => !seenWith.has(dirKey(n)));

  const peaRow = (p, what) => `<li class="${p.days === null || p.days > DIR_PEA_DAYS ? 'is-flag' : ''}"><span>${escapeHtml(dirShort(p.name))}</span><span class="dir-muted">${p.days === null ? `no PEA ${what} on record` : p.days === 0 ? 'today' : `${p.days} day${p.days === 1 ? '' : 's'} ago`}${what === 'given' && p.recent ? ` · ${p.recent} in ${DIR_PEA_COUNT_DAYS} days` : ''}</span></li>`;

  const numParts = [];
  if(nums.forecast) numParts.push(`<div class="dir-num"><span>Forecast, ${nums.forecast.days} days</span><b>${escapeHtml(fcMoney(nums.forecast.sales))}</b><small>${nums.forecast.vsLastYear != null ? `${escapeHtml(fcPctFmt(nums.forecast.vsLastYear))} vs last year` : 'the Forecast tab’s baseline'}</small></div>`);
  if(nums.track) numParts.push(`<div class="dir-num"><span>Sent forecasts</span><b>${nums.track.accuracy.toFixed(1)}%</b><small>${nums.track.days} days scored · ${nums.track.bias > 1 ? 'runs high' : nums.track.bias < -1 ? 'runs low' : 'no lean'}</small></div>`);
  if(nums.waste) numParts.push(`<div class="dir-num"><span>Waste last week</span><b>${nums.waste.under} of ${nums.waste.days}</b><small>days under $${nums.waste.limit}</small></div>`);
  if(nums.orders != null) numParts.push(`<div class="dir-num"><span>Uniform orders open</span><b>${nums.orders}</b><small>Uniforms tab</small></div>`);

  const weekPick = dirPickHtml('dirWeekPick', 'Week', [{value: 0, on: dirWeekOffset === 0, label: 'This week', attr: 'data-dir-week="0"'}, {value: 1, on: dirWeekOffset === 1, label: 'Next week', attr: 'data-dir-week="1"'}]);
  root.innerHTML = `
    ${dirHeadHtml('Brief', `${escapeHtml(dirDay(dates[0]))} – ${escapeHtml(dirDay(dates[dates.length - 1]))}`, weekPick, [{attr: 'data-dir-copy', label: 'Copy brief'}, {attr: 'data-dir-pdf', label: 'PDF'}])}
    ${nav}
    ${!hasRoster ? `<p class="dir-empty">No roster for this week yet. Import the week's HotSchedules CSV in Manage → Uploads and the days fill in.</p>` : ''}
    <section class="dir-card"><h3>The week at a glance</h3><p class="dir-note">Leaders are the leader list in Manage, Team Leader shifts and anyone set as Lead Captain. Directors’ time is their Administrative shifts. A gap is ${DIR_GAP_MIN} minutes or more with no leader on.</p><div class="dir-days">${dayRows}</div><p class="dir-note dir-tl-key"><span class="is-leader">■</span> leaders <span class="is-director">■</span> directors <span class="is-gap">■</span> no leader on</p></section>
    <section class="dir-card"><h3>Where directors overlap leaders</h3>
      ${overlapRows.length ? `<ul class="dir-list">${overlapRows.join('')}</ul>` : '<p class="dir-empty">No director shifts on the roster this week.</p>'}
      ${unseen.length ? `<p class="dir-note"><b>Leaders no director overlaps this week:</b> ${escapeHtml(unseen.map(dirShort).join(', '))}</p>` : ''}
    </section>
    <section class="dir-card"><h3>Needs attention</h3>
      ${attention.length ? `<ul class="dir-list">${attention.map(x => `<li><b>${escapeHtml(x.ev.title)}</b> <span class="dir-muted">${escapeHtml(dirDay(x.iso))}${x.span ? ' · ' + escapeHtml(dirSpanText(x.span)) : ' · all day'}${x.ev.detail ? ' · ' + escapeHtml(x.ev.detail) : ''}</span><br><span class="dir-muted">On the floor:</span> ${x.leaders.length ? x.leaders.map(p => `<span class="dir-chip is-leader">${escapeHtml(dirShort(p.name))}</span>`).join(' ') : '<span class="dir-flag-text">no leader on at that time</span>'}</li>`).join('')}</ul>`
        : '<p class="dir-empty">Nothing marked. Meetings, and any event ticked “Needs a director” in Manage → Events, show here.</p>'}
      ${others.length ? `<p class="dir-note"><b>Also this week:</b> ${others.map(x => `${escapeHtml(x.ev.title)} (${escapeHtml(dirDay(x.iso))})`).join(' · ')}</p>` : ''}
    </section>
    <section class="dir-card"><h3>PEA cadence</h3>
      ${pea.any || pea.leaders.length ? `<div class="dir-two">
        <div><h4>Leaders, by last PEA given</h4><ul class="dir-list dir-list-sm">${pea.leaders.map(p => peaRow(p, 'given')).join('')}</ul></div>
        <div><h4>Team members, longest since a PEA</h4><ul class="dir-list dir-list-sm">${pea.employees.slice(0, 12).map(p => peaRow(p, 'received')).join('')}</ul></div>
      </div><p class="dir-note">Flagged past ${DIR_PEA_DAYS} days. From the Levelset ratings in Manage → PEA.</p>` : '<p class="dir-empty">No PEA ratings on file yet. Sync Levelset in Manage → PEA.</p>'}
    </section>
    ${typeof ldSummaryHtml === 'function' ? ldSummaryHtml() : ''}
    <section class="dir-card"><h3>The numbers</h3>${numParts.length ? `<div class="dir-nums">${numParts.join('')}</div>` : '<p class="dir-empty">Upload sales history and waste fills in here.</p>'}</section>`;
}

function dirRerender(){
  const view = document.getElementById('directorsView');
  const a = document.activeElement;
  const typing = a && a.closest && a.closest('#directorsRoot') && /^(TEXTAREA|INPUT)$/.test(a.tagName);
  if(view && view.classList.contains('active') && !typing) renderDirectorsView();
}

// ----- The brief as text (copy / PDF) -----
function dirBriefText(){
  const dates = dirWeek();
  const L = [];
  L.push(`Directors brief · ${dirDay(dates[0])} – ${dirDay(dates[dates.length - 1])}`);
  L.push('');
  L.push('THE WEEK AT A GLANCE');
  dates.forEach(iso => {
    const floor = dirFloor(iso), leaders = floor.filter(p => p.leader).sort((a, b) => a.span.start - b.span.start), dirs = dirDirectorShifts(iso);
    if(!floor.length){ L.push(`${dirDay(iso)}: no roster yet`); return; }
    L.push(`${dirDay(iso)}: ${leaders.length} leader${leaders.length === 1 ? '' : 's'}, ${floor.length - leaders.length} team` + (dirs.length ? ` · directors: ${dirs.map(d => `${dirShort(d.name)} ${dirSpanText(d.span)}`).join(', ')}` : ' · no director shift'));
    if(leaders.length) L.push(`  leaders: ${leaders.map(p => `${dirShort(p.name)} ${dirSpanText(p.span)}`).join(', ')}`);
    const flags = [];
    if(!leaders.length) flags.push('no leader on the roster');
    dirLeaderGaps(iso).forEach(g => flags.push(`no leader ${dirSpanText(g)}`));
    if(leaders.length && !dirHasCloser(iso)) flags.push('no leader through close');
    flags.forEach(f => L.push(`  ! ${f}`));
  });
  const att = dirAttention(dates);
  L.push(''); L.push('NEEDS ATTENTION');
  if(att.length) att.forEach(x => L.push(`${dirDay(x.iso)}${x.span ? ' ' + dirSpanText(x.span) : ''}: ${x.ev.title}${x.ev.detail ? ' — ' + x.ev.detail : ''} · on the floor: ${x.leaders.length ? x.leaders.map(p => dirShort(p.name)).join(', ') : 'no leader'}`));
  else L.push('Nothing marked.');
  const pea = dirPeaCadence(dates);
  L.push(''); L.push(`PEA CADENCE (flagged past ${DIR_PEA_DAYS} days)`);
  const flaggedL = pea.leaders.filter(p => p.days === null || p.days > DIR_PEA_DAYS);
  L.push(flaggedL.length ? `Leaders: ${flaggedL.map(p => `${dirShort(p.name)} (${p.days === null ? 'none on record' : p.days + ' days'})`).join(', ')}` : 'Every leader has given a PEA recently.');
  const flaggedE = pea.employees.filter(p => p.days !== null && p.days > DIR_PEA_DAYS).slice(0, 10);
  if(flaggedE.length) L.push(`Team members: ${flaggedE.map(p => `${dirShort(p.name)} (${p.days} days)`).join(', ')}`);
  if(typeof ldBriefLines === 'function'){ L.push(''); L.push(`PEA SCOREBOARD (${ldQuarterBounds(ldQuarterNow()).label})`); ldBriefLines().forEach(x => L.push(x)); }
  const nums = dirNumbers(dates);
  L.push(''); L.push('THE NUMBERS');
  if(nums.forecast) L.push(`Forecast for the week: ${fcMoney(nums.forecast.sales)}${nums.forecast.vsLastYear != null ? ` (${fcPctFmt(nums.forecast.vsLastYear)} vs last year)` : ''}`);
  if(nums.track) L.push(`Sent forecasts: ${nums.track.accuracy.toFixed(1)}% accurate over ${nums.track.days} days`);
  if(nums.waste) L.push(`Waste last week: ${nums.waste.under} of ${nums.waste.days} days under $${nums.waste.limit}`);
  if(nums.orders != null) L.push(`Uniform orders open: ${nums.orders}`);
  return L.join('\n');
}

function dirCopy(btn, text = dirBriefText()){
  const done = ok => { const orig = btn.textContent; btn.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { btn.textContent = orig; }, 1600); };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); else done(false);
}

function dirPdf(text = dirBriefText(), fileName = `directors-brief-${dirWeek()[0]}.pdf`){
  const J = window.jspdf && window.jspdf.jsPDF;
  if(!J){ showToast('The PDF library didn’t load'); return; }
  const doc = new J({unit: 'pt', format: 'letter'});
  const lines = doc.splitTextToSize(text, 612 - 96);
  let y = 60;
  doc.setFont('helvetica', 'normal').setFontSize(10.5);
  lines.forEach(line => {
    if(y > 792 - 60){ doc.addPage(); y = 60; }
    const head = /^[A-Z (),0-9]+$/.test(line) && line.length > 3;
    doc.setFont('helvetica', head ? 'bold' : 'normal');
    doc.text(line, 48, y); y += 15;
  });
  doc.save(fileName);
}

document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t || !t.closest('#directorsRoot')) return;
  const share = t.closest('[data-dir-share]');
  if(share){ dirShareToggle(share); return; }
  const item = t.closest('.dir-share-item');
  if(item){
    // Copy items stay open long enough to read "Copied"; the rest close now.
    const menu = item.closest('.dir-share-menu');
    const copies = /^data-(dir|ld|tp|lr)-copy$/;
    if([...item.attributes].some(a => copies.test(a.name))) setTimeout(() => dirShareClose(menu), 1700); else dirShareClose(menu);
  }
  const vw = t.closest('[data-dir-view]');
  if(vw){ dirSetView(vw.dataset.dirView); if(vw.dataset.dirPeople) dirSetPeople(vw.dataset.dirPeople); renderDirectorsView(); window.scrollTo(0, 0); return; }
  const who = t.closest('[data-dir-people]');
  if(who){ dirSetPeople(who.dataset.dirPeople); renderDirectorsView(); return; }
  const wk = t.closest('button[data-dir-week]');
  if(wk){ dirWeekOffset = +wk.dataset.dirWeek; renderDirectorsView(); return; }
  if(t.closest('[data-dir-copy]')){ dirCopy(t.closest('[data-dir-copy]')); return; }
  if(t.closest('[data-dir-pdf]')){ dirPdf(); return; }
});
// A tap anywhere outside the share control closes its menu.
document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(t && t.closest('.dir-share')) return;
  if(!document.querySelectorAll) return;
  document.querySelectorAll('#directorsRoot .dir-share-menu:not([hidden])').forEach(dirShareClose);
});
document.addEventListener('change', e => {
  const el = e.target;
  if(!el || !el.id) return;
  if(el.id === 'dirWeekPick'){ dirWeekOffset = +el.value; renderDirectorsView(); return; }
  if(el.id === 'dirQuarter'){
    if(typeof ldQuarter !== 'undefined') ldQuarter = el.value;
    if(typeof tpQuarter !== 'undefined') tpQuarter = el.value;
    renderDirectorsView();
  }
});

// ----- Manage → Settings: the director team -----
function renderDirectorsManage(){
  const root = document.getElementById('directorsManageRoot');
  if(!root) return;
  const list = dirList();
  root.innerHTML = `
    <div class="dir-m-list">${list.map((d, i) => `
      <div class="dir-m-row">
        <input type="text" value="${escapeHtml(d.name)}" maxlength="80" placeholder="Name as in HotSchedules" data-dir-m="name" data-dir-i="${i}" aria-label="Name">
        <input type="text" value="${escapeHtml(d.title || '')}" maxlength="40" placeholder="Title" data-dir-m="title" data-dir-i="${i}" aria-label="Title">
        <button type="button" class="dir-x" data-dir-m-del="${i}" aria-label="Remove ${escapeHtml(d.name)}">${UO_X_ICON}</button>
      </div>`).join('')}</div>
    <button type="button" class="btn btn-ghost dir-btn" data-dir-m-add>+ Add a director</button>
    <p class="mv-saved" data-mv-saved>Saves as you go</p>`;
}
document.addEventListener('change', e => {
  const t = e.target;
  if(!t || !t.dataset || !t.dataset.dirM || !t.closest('#directorsManageRoot')) return;
  dirEnsureOwn();
  const d = directors[+t.dataset.dirI];
  if(!d) return;
  d[t.dataset.dirM] = t.value.trim();
  saveState(); dirRerender();
});
document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t || !t.closest('#directorsManageRoot')) return;
  if(t.closest('[data-dir-m-add]')){ dirEnsureOwn(); directors.push({name: '', title: 'Director'}); renderDirectorsManage(); const f = root_last_input(); if(f) f.focus(); return; }
  const del = t.closest('[data-dir-m-del]');
  if(del){ dirEnsureOwn(); directors.splice(+del.dataset.dirMDel, 1); renderDirectorsManage(); saveState(); dirRerender(); }
});
function root_last_input(){ const rows = document.querySelectorAll('#directorsManageRoot [data-dir-m="name"]'); return rows[rows.length - 1] || null; }
