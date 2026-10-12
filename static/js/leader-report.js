// ===== WEEKLY LEADER REPORT =====
// The scoreboard for the weekly accountability meeting (TIM-65, Tim, Oct
// 2026): each leader tied to how the dayparts they ran went. In 4DX terms
// the lists and PEAs are lead measures a leader controls during the shift;
// productivity is the lag measure they move. A coaching tool, not a
// ranking: each leader's week next to their last, a win and one focus.
//
// Who gets credit: the FOH Lead Captain set on Set Ups for the daypart
// ("Ana/Ben" after a mid-shift handoff credits both). A daypart with none is
// listed as unassigned rather than guessed at. BOH has no Lead Captain, so
// it isn't credited yet.
//
// Per daypart:
//   Zone Reset and Leader Transition: the handoffs that daypart's Lead
//     Captain answers for (zoneResetDayparts' leadFrom), checked / total.
//     Leader Transition counts from leaderTransitionHistory (kept from
//     Oct 2026; days before it show no figure).
//   PEAs on your dayparts: every Levelset rating timed inside the daypart.
//   Productivity: the Know the Numbers daypart it reads (knDaypartOf):
//     actual sales per labor hour against the goal, once both are typed.
// Per day, to every Lead Captain of the day:
//   Waste: the day finished under the daily limit (wasteDays).
//   Food Safety: the day's walkthrough finished.
// Per leader, any time in the week:
//   PEAs you did: ratings where they were the Levelset rater (matched by
//     the PEA name links in Manage → PEA).
//
// Only finished days count: "this week" runs through yesterday.

const LR_WEEKS = [{offset: -1, label: 'Last week'}, {offset: 0, label: 'This week so far'}];
let lrWeekOffset = -1;

const lrMin = hhmm => { const m = String(hhmm || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
const lrRate = (a, b) => b > 0 ? a / b : null;
const lrPct = r => r === null ? '—' : Math.round(r * 100) + '%';
const lrDays = n => `${n} day${n === 1 ? '' : 's'}`;
const lrSplitNames = v => String(v || '').split('/').map(n => n.trim()).filter(Boolean);

// The handoffs a FOH daypart's Lead Captain answers for.
function lrHandoffsFor(dpName){
  return zoneResetDayparts.filter(h => dpName.startsWith(h.leadFrom + ' ('));
}

// The Lead Captain(s) of every FOH daypart in the dates: {date: {daypart: [names]}}.
function lrCaptains(dates){
  const out = {};
  dates.forEach(d => { out[d] = {}; });
  getSetupRecords(dates[0], dates[dates.length - 1]).forEach(r => {
    if(r.section !== 'foh' || r.position !== SU_LEAD_CAPTAIN || !out[r.date]) return;
    const list = out[r.date][r.daypart] = out[r.date][r.daypart] || [];
    lrSplitNames(r.name).forEach(n => { if(!list.includes(n)) list.push(n); });
  });
  return out;
}

// A day counts once it's over, and only if the store had a FOH roster or a
// set up for it (closed days aren't missed lists).
function lrDayCounts(iso, caps){
  return iso < today && ((fohRoster[iso] && fohRoster[iso].length > 0) || Object.keys(caps[iso] || {}).length > 0);
}

// The first day Leader Transition history was kept, or null.
function lrLtSince(){
  const days = Object.keys(typeof leaderTransitionHistory === 'object' && leaderTransitionHistory ? leaderTransitionHistory : {}).sort();
  return days[0] || null;
}

// The facts for a week: {dayparts: [...], days: [...], unassigned: [...]}.
function lrFacts(dates, ratings){
  const caps = lrCaptains(dates);
  const ltSince = lrLtSince();
  const counted = dates.filter(iso => lrDayCounts(iso, caps));
  const dayparts = [], days = [], unassigned = [];
  counted.forEach(iso => {
    const dayLeads = new Set();
    fohDayparts.forEach(dp => {
      const leads = (caps[iso] && caps[iso][dp.name]) || [];
      if(!leads.length){ unassigned.push({date: iso, daypart: dp.name}); return; }
      leads.forEach(n => dayLeads.add(n));
      const w = knWindowOf(dp);
      const handoffs = lrHandoffsFor(dp.name);
      const zone = handoffs.length ? handoffs.reduce((a, h) => { const c = getHandoffZoneCompletion(iso, h.name); return {checked: a.checked + c.checked, total: a.total + c.total}; }, {checked: 0, total: 0}) : null;
      let lt = null;
      if(handoffs.length && ltSince && iso >= ltSince){
        const rec = leaderTransitionHistory[iso] || {};
        lt = handoffs.reduce((a, h) => {
          const r = Array.isArray(rec[h.name]) ? rec[h.name] : [0, fohLeaderTransitionItems.length];
          return {checked: a.checked + (+r[0] || 0), total: a.total + (+r[1] || 0)};
        }, {checked: 0, total: 0});
      }
      const peasOn = ratings.filter(r => r.date === iso && (m => m !== null && m >= w.start && m < w.end)(lrMin(String(r.at).slice(11)))).length;
      let prod = null;
      const kn = knDaypartOf(dp);
      if(kn){
        const e = knDayEntries(iso)[kn.name];
        const v = e ? knVersus(e.actualProductivity, e.productivityGoal) : null;
        if(v) prod = {actual: v.actual, goal: v.plan, hit: v.actual >= v.plan};
      }
      dayparts.push({date: iso, daypart: dp.name, leads, zone, lt, peasOn, prod});
    });
    const fs = typeof fsTotals === 'function' ? fsTotals(foodSafetyWalkthroughs[iso]) : null;
    days.push({date: iso, leads: [...dayLeads], wasteUnder: wasteDays.includes(iso), fsDone: !!(fs && fs.complete)});
  });
  return {dates, counted, dayparts, days, unassigned};
}

// The Levelset name a roster name rates under, or the name itself.
function lrRaterKey(name, raters){
  const linked = typeof peaMatchName === 'function' ? peaMatchName(name, raters) : null;
  return dirKey(linked || name);
}

// Each credited leader's week: {name: {dayparts, days, zone, lt, peasGiven, peasOn, prod, waste, fs}}.
function lrRollup(facts, ratings){
  const by = {};
  const get = n => by[n] = by[n] || {name: n, dayparts: 0, days: 0, zone: {checked: 0, total: 0}, lt: {checked: 0, total: 0}, peasGiven: 0, peasOn: 0, prod: {hit: 0, of: 0}, waste: {under: 0, of: 0}, fs: {done: 0, of: 0}};
  facts.dayparts.forEach(f => f.leads.forEach(n => {
    const L = get(n);
    L.dayparts++;
    if(f.zone){ L.zone.checked += f.zone.checked; L.zone.total += f.zone.total; }
    if(f.lt){ L.lt.checked += f.lt.checked; L.lt.total += f.lt.total; }
    L.peasOn += f.peasOn;
    if(f.prod){ L.prod.of++; if(f.prod.hit) L.prod.hit++; }
  }));
  facts.days.forEach(d => d.leads.forEach(n => {
    const L = get(n);
    L.days++;
    L.waste.of++; if(d.wasteUnder) L.waste.under++;
    L.fs.of++; if(d.fsDone) L.fs.done++;
  }));
  const raters = [...new Set(ratings.map(r => r.leader).filter(Boolean))];
  const week = new Set(facts.dates);
  Object.values(by).forEach(L => {
    const k = lrRaterKey(L.name, raters);
    L.peasGiven = ratings.filter(r => week.has(r.date) && dirKey(r.leader) === k).length;
  });
  return by;
}

// The rates a leader is coached on, best first: [{key, label, rate, text}].
function lrMeasures(L){
  return [
    {key: 'zone', label: 'Zone Reset', rate: lrRate(L.zone.checked, L.zone.total), text: L.zone.total ? `${L.zone.checked}/${L.zone.total} items` : ''},
    {key: 'lt', label: 'Leader Transition', rate: lrRate(L.lt.checked, L.lt.total), text: L.lt.total ? `${L.lt.checked}/${L.lt.total} items` : ''},
    {key: 'prod', label: 'Productivity goal', rate: lrRate(L.prod.hit, L.prod.of), text: L.prod.of ? `hit ${L.prod.hit} of ${L.prod.of}` : ''},
    {key: 'waste', label: 'Waste under limit', rate: lrRate(L.waste.under, L.waste.of), text: L.waste.of ? `${L.waste.under} of ${lrDays(L.waste.of)}` : ''},
    {key: 'fs', label: 'Food Safety Walkthrough', rate: lrRate(L.fs.done, L.fs.of), text: L.fs.of ? `${L.fs.done} of ${lrDays(L.fs.of)}` : ''},
  ];
}

// One win and one focus for the week: the strongest measure and the
// weakest one still short of 100%. A leader who ran dayparts but gave no
// PEA gets that as the focus first: it's the lead measure most in their hands.
function lrCoach(L){
  const ms = lrMeasures(L).filter(m => m.rate !== null);
  const sorted = [...ms].sort((a, b) => b.rate - a.rate);
  const win = sorted.length && sorted[0].rate > 0 ? sorted[0] : null;
  let focus = null;
  if(L.dayparts > 0 && L.peasGiven === 0) focus = {key: 'peas', label: 'PEAs', text: 'no PEA given this week'};
  else {
    const low = [...ms].sort((a, b) => a.rate - b.rate).find(m => m.rate < 1 && (!win || m.key !== win.key));
    if(low) focus = low;
  }
  return {win, focus};
}

// The whole report for a week offset: {facts, leaders: [{...L, prev, coach}], unassigned}.
function lrReport(offset){
  const ratings = typeof peaAllRatings === 'function' ? peaAllRatings() : [];
  const dates = getWeekDays(offset).map(d => d.date);
  const prevDates = getWeekDays(offset - 1).map(d => d.date);
  const facts = lrFacts(dates, ratings), prevFacts = lrFacts(prevDates, ratings);
  const now = lrRollup(facts, ratings), prev = lrRollup(prevFacts, ratings);
  const leaders = Object.values(now)
    .sort((a, b) => b.dayparts - a.dayparts || a.name.localeCompare(b.name))
    .map(L => ({...L, prev: prev[L.name] || null, coach: lrCoach(L)}));
  return {dates, facts, leaders, unassigned: facts.unassigned};
}

// "+12 pts" / "−1" against last week, or ''.
function lrDelta(now, before, kind){
  if(now === null || before === null || before === undefined) return '';
  const d = kind === 'rate' ? Math.round((now - before) * 100) : now - before;
  if(!d) return 'same as last week';
  return `${d > 0 ? '+' : '−'}${Math.abs(d)}${kind === 'rate' ? ' pts' : ''} vs last week`;
}

// ----- Rendering (Directors → Weekly report) -----
function lrHeadHtml(rep){
  return `<p class="dir-sub">${escapeHtml(dirDay(rep.dates[0]))} – ${escapeHtml(dirDay(rep.dates[rep.dates.length - 1]))}${lrWeekOffset === 0 ? ' · through yesterday' : ''}</p>`;
}

function lrActionsHtml(){
  return `<div class="uo-panes" role="tablist" aria-label="Week">${LR_WEEKS.map(w => `<button type="button" class="uo-pane-btn ${lrWeekOffset === w.offset ? 'active' : ''}" data-lr-week="${w.offset}">${w.label}</button>`).join('')}</div>
    <button type="button" class="btn btn-ghost dir-btn" data-lr-copy>Copy report</button>
    <button type="button" class="btn btn-ghost dir-btn" data-lr-pdf>PDF</button>`;
}

function lrLeaderHtml(L){
  const p = L.prev;
  const prevM = p ? Object.fromEntries(lrMeasures(p).map(m => [m.key, m.rate])) : {};
  const rows = lrMeasures(L).map(m => `<div class="dir-num"><span>${escapeHtml(m.label)}</span><b>${lrPct(m.rate)}</b><small>${escapeHtml([m.text, p ? lrDelta(m.rate, prevM[m.key], 'rate') : ''].filter(Boolean).join(' · ') || 'no data this week')}</small></div>`);
  rows.push(`<div class="dir-num"><span>PEAs you did</span><b>${L.peasGiven}</b><small>${escapeHtml((p ? lrDelta(L.peasGiven, p.peasGiven, 'count') : '') || 'as the Levelset rater')}</small></div>`);
  rows.push(`<div class="dir-num"><span>PEAs on your dayparts</span><b>${L.peasOn}</b><small>${escapeHtml((p ? lrDelta(L.peasOn, p.peasOn, 'count') : '') || 'by anyone, while you ran it')}</small></div>`);
  const {win, focus} = L.coach;
  return `
    <section class="dir-card lr-leader">
      <h3>${escapeHtml(dirShort(L.name))} <span class="dir-muted">· ${L.dayparts} daypart${L.dayparts === 1 ? '' : 's'} on ${L.days} day${L.days === 1 ? '' : 's'}</span></h3>
      <div class="dir-nums">${rows.join('')}</div>
      <ul class="dir-list dir-list-sm lr-coach">
        <li><span><b>Win</b></span><span>${win ? `${escapeHtml(win.label)}: ${lrPct(win.rate)}${win.text ? ' (' + escapeHtml(win.text) + ')' : ''}` : '<span class="dir-muted">nothing measured yet</span>'}</span></li>
        <li><span><b>Focus</b></span><span>${focus ? `${escapeHtml(focus.label)}: ${focus.rate !== undefined ? lrPct(focus.rate) + (focus.text ? ' (' + escapeHtml(focus.text) + ')' : '') : escapeHtml(focus.text)}` : '<span class="dir-muted">keep it going</span>'}</span></li>
      </ul>
    </section>`;
}

function lrBodyHtml(){
  const rep = lrReport(lrWeekOffset);
  if(!rep.facts.counted.length){
    return `<p class="dir-empty">${lrWeekOffset === 0 ? 'No finished days this week yet. The report fills in from yesterday back.' : 'No open days with a roster or set up last week.'}</p>`;
  }
  const unassigned = rep.unassigned.length ? `
    <section class="dir-card"><h3>Dayparts with no Lead Captain</h3>
      <p class="dir-note">Nobody gets credit for these. Set the Lead Captain on Set Ups as the daypart starts.</p>
      <ul class="dir-list dir-list-sm">${rep.dates.filter(iso => rep.unassigned.some(u => u.date === iso)).map(iso => `<li><span>${escapeHtml(dirDay(iso))}</span><span class="dir-muted">${escapeHtml(rep.unassigned.filter(u => u.date === iso).map(u => u.daypart.replace(/\s*\(.*$/, '')).join(', '))}</span></li>`).join('')}</ul>
    </section>` : '';
  return `
    <section class="dir-card"><p class="dir-note">Credit goes to the FOH Lead Captain set on Set Ups. Lists, PEAs and productivity count per daypart; waste and Food Safety per day, to every Lead Captain that day. Only finished days count. Compare each leader to their own last week; this is for coaching, not ranking.</p></section>
    ${rep.leaders.length ? rep.leaders.map(lrLeaderHtml).join('') : '<p class="dir-empty">No Lead Captains were set on these days.</p>'}
    ${unassigned}`;
}

// ----- As text (copy / PDF) -----
function lrText(){
  const rep = lrReport(lrWeekOffset);
  const L = [];
  L.push(`Weekly leader report · ${dirDay(rep.dates[0])} – ${dirDay(rep.dates[rep.dates.length - 1])}${lrWeekOffset === 0 ? ' (through yesterday)' : ''}`);
  L.push('Credit: the FOH Lead Captain per daypart. Waste and Food Safety per day.');
  rep.leaders.forEach(x => {
    L.push('');
    L.push(`${dirShort(x.name).toUpperCase()} (${x.dayparts} DAYPART${x.dayparts === 1 ? '' : 'S'}, ${lrDays(x.days).toUpperCase()})`);
    const prevM = x.prev ? Object.fromEntries(lrMeasures(x.prev).map(m => [m.key, m.rate])) : {};
    lrMeasures(x).forEach(m => L.push(`${m.label}: ${lrPct(m.rate)}${m.text ? ' (' + m.text + ')' : ''}${x.prev && lrDelta(m.rate, prevM[m.key], 'rate') ? ' · ' + lrDelta(m.rate, prevM[m.key], 'rate') : ''}`));
    L.push(`PEAs you did: ${x.peasGiven}${x.prev ? ' · ' + lrDelta(x.peasGiven, x.prev.peasGiven, 'count') : ''}`);
    L.push(`PEAs on your dayparts: ${x.peasOn}${x.prev ? ' · ' + lrDelta(x.peasOn, x.prev.peasOn, 'count') : ''}`);
    const {win, focus} = x.coach;
    L.push(`Win: ${win ? `${win.label} ${lrPct(win.rate)}` : 'nothing measured yet'}`);
    L.push(`Focus: ${focus ? (focus.rate !== undefined ? `${focus.label} ${lrPct(focus.rate)}` : `${focus.label}: ${focus.text}`) : 'keep it going'}`);
  });
  if(rep.unassigned.length){
    L.push('');
    L.push('DAYPARTS WITH NO LEAD CAPTAIN');
    rep.dates.forEach(iso => {
      const u = rep.unassigned.filter(x => x.date === iso);
      if(u.length) L.push(`${dirDay(iso)}: ${u.map(x => x.daypart.replace(/\s*\(.*$/, '')).join(', ')}`);
    });
  }
  return L.join('\n');
}

document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t || !t.closest('#directorsRoot')) return;
  const wk = t.closest('[data-lr-week]');
  if(wk){ lrWeekOffset = +wk.dataset.lrWeek; renderDirectorsView(); return; }
  if(t.closest('[data-lr-copy]')){ dirCopy(t.closest('[data-lr-copy]'), lrText()); return; }
  if(t.closest('[data-lr-pdf]')){ dirPdf(lrText(), `leader-report-${getWeekDays(lrWeekOffset)[0].date}.pdf`); return; }
});
