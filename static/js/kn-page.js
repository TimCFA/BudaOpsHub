// ===== KNOW THE NUMBERS: THE LEADERS' PAGE (Tim, Oct 23 2026) =====
// "Within a single glance, know what their daypart's productivity and other
// goals are." A page in Tools for Team Leads and up: a day's four dayparts,
// each with its productivity goal as the big number, then what it takes:
//  - projected sales, and the labor hours that hit the goal (sales ÷ goal)
//  - the hours on the schedule in that daypart (the HotSchedules roster),
//    over or under those hours, and the productivity they'd make
//  - the same daypart last week: actual productivity against its goal
//  - the drive-thru time and the guests' OSAT for that daypart, from the
//    speed of service and CEM uploads
// The numbers are the ones Know the Numbers keeps (know-numbers.js), so Set
// Ups' daypart cards and this page always agree; a card's numbers open it.

let knPageDate = null;    // the day on screen (null: today)
let knPageFocus = null;   // a daypart a Set Ups card asked for

function knPageShown(){
  if(typeof launchManager !== 'undefined' && launchManager) return true;
  return typeof scHidden === 'function' ? !scHidden() : false;
}

const knNum = v => { const n = typeof parseMoney === 'function' ? parseMoney(v) : parseFloat(String(v || '').replace(/[^0-9.\-]/g, '')); return n === null || isNaN(n) ? null : n; };
const knMoney0 = v => '$' + Math.round(v).toLocaleString('en-US');
const knHours = v => `${v >= 100 ? Math.round(v) : (Math.round(v * 2) / 2).toFixed(1).replace(/\.0$/, '')} hrs`;
const knShortName = name => String(name).replace(/\s*\(.*$/, '');
const knTimeText = dp => { const m = String(dp.name).match(/\(([^)]+)\)/); return m ? m[1].replace('-', '–') : ''; };

// Hours on the schedule inside a window: every FOH and BOH shift's overlap.
function knScheduledHours(iso, win){
  let min = 0;
  [fohRoster, bohRoster].forEach(r => ((r || {})[iso] || []).forEach(p => {
    (typeof suShiftBlocks === 'function' ? suShiftBlocks(p) : []).forEach(([s, e]) => { min += Math.max(0, Math.min(e, win.end) - Math.max(s, win.start)); });
  }));
  return min / 60;
}

function knAddDays(iso, n){ const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return toLocalISODate(d); }
function knDayLabel(iso){ return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'}); }

// The four dayparts' names in the uploads' own words.
const KN_PART_OF = [[/breakfast/i, 'Breakfast'], [/lunch|transition/i, 'Lunch'], [/mid|afternoon/i, 'Afternoon'], [/dinner|close/i, 'Dinner']];
function knPartOf(name){ const hit = KN_PART_OF.find(([re]) => re.test(name)); return hit ? hit[1] : null; }

// Drive-thru time for a daypart from the speed of service upload, weighted by cars.
function knDriveThru(dpName){
  const s = typeof reportData !== 'undefined' && reportData && reportData.sos;
  if(!s || !s.dtDayparts) return null;
  let cars = 0, total = 0;
  Object.entries(s.dtDayparts).forEach(([k, d]) => { if(knPartOf(k) === knShortName(dpName) && d && d.cars){ cars += d.cars; total += d.total * d.cars; } });
  return cars ? {secs: total / cars, range: s.from && s.to && typeof rpRange === 'function' ? rpRange(s.from, s.to) : ''} : null;
}
// The guests' OSAT for a daypart in the latest CEM month, weighted by surveys.
function knOsat(dpName){
  if(typeof duCemLatest !== 'function' || typeof ctEntriesForPeriod !== 'function') return null;
  const latest = duCemLatest();
  if(!latest) return null;
  let n = 0, sum = 0;
  ctEntriesForPeriod(latest.periodKey).filter(e => e.dimension === 'daypart' && knPartOf(e.segment) === knShortName(dpName) && e.scores && e.scores.overall != null)
    .forEach(e => { const w = e.n || 1; n += w; sum += e.scores.overall * w; });
  return n ? {osat: sum / n, label: latest.periodLabel.replace(/\s*\(.*$/, '')} : null;
}

// One daypart's numbers on a date: what the cards draw.
function knDaypartFacts(iso, dp){
  const day = (typeof numbersData !== 'undefined' && numbersData[iso]) || null;
  if(day && typeof knNormalizeDay === 'function') knNormalizeDay(day);
  const e = (day && day[dp.name]) || {};
  const sales = knNum(e.projectedSales), goal = knNum(e.productivityGoal);
  const win = knWindowOf(dp);
  const sched = knScheduledHours(iso, win);
  const need = sales && goal ? sales / goal : null;
  const lastIso = knAddDays(iso, -7);
  const lastProd = typeof kaGetActual === 'function' ? kaGetActual(lastIso, dp.name, 'actualProductivity') : null;
  const lastDay = (typeof numbersData !== 'undefined' && numbersData[lastIso] && numbersData[lastIso][dp.name]) || null;
  const lastGoal = lastDay ? knNum(lastDay.productivityGoal) : null;
  return {
    dp, win, sales, goal, need, sched: sched || null,
    schedProd: sales && sched ? sales / sched : null,
    event: typeof knSpecialEventsText === 'function' ? knSpecialEventsText(e.specialEvents || '', iso, dp) : String(e.specialEvents || '').trim(),
    actualSales: knNum(e.actualSales), actualProd: knNum(e.actualProductivity),
    last: lastProd !== null && lastProd !== undefined ? {iso: lastIso, prod: lastProd, goal: lastGoal} : null,
    dt: knDriveThru(dp.name), osat: knOsat(dp.name)
  };
}

function knClock(secs){ const s = Math.round(secs); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

function knCardHtml(iso, f, isNow){
  const stat = (label, value, note, cls) => `<div class="knp-stat ${cls || ''}"><span class="knp-k">${label}</span><b>${value}</b>${note ? `<small>${note}</small>` : ''}</div>`;
  const gap = f.need !== null && f.sched ? f.sched - f.need : null;
  const gapCls = gap === null ? '' : Math.abs(gap) < 1 ? 'is-ok' : gap > 0 ? 'is-over' : 'is-room';
  const gapNote = gap === null ? (f.sched ? 'no goal to measure against' : 'no roster yet')
    : Math.abs(gap) < 1 ? 'right on the hours the goal allows'
    : gap > 0 ? `${knHours(gap)} over what the goal allows · ${knMoney0(f.schedProd)}/hr as scheduled`
    : `Room for ${knHours(-gap).replace(' hrs', ' more hrs')} · ${knMoney0(f.schedProd)}/hr as scheduled`;
  const stats = [
    f.sales !== null ? stat('Projected sales', knMoney0(f.sales), f.event ? escapeHtml(f.event) : '') : '',
    f.need !== null ? stat('Labor hours to hit it', knHours(f.need), `${knMoney0(f.sales)} ÷ ${knMoney0(f.goal)}`) : '',
    f.sched ? stat('On the schedule', knHours(f.sched), escapeHtml(gapNote), gapCls) : stat('On the schedule', '—', 'no roster yet'),
    f.last ? stat('Last week', `${knMoney0(f.last.prod)}/hr`, `${escapeHtml(knDayLabel(f.last.iso))}${f.last.goal ? ` · goal was ${knMoney0(f.last.goal)}` : ''}`, f.last.goal ? (f.last.prod >= f.last.goal ? 'is-ok' : 'is-under') : '') : '',
    f.dt ? stat('Drive-thru time', knClock(f.dt.secs), f.dt.range ? `average, ${escapeHtml(f.dt.range)}` : 'average') : '',
    f.osat ? stat('Guest OSAT', `${Math.round(f.osat.osat)}%`, `highly satisfied, ${escapeHtml(f.osat.label)}`) : ''
  ].filter(Boolean).join('');
  const actual = f.actualSales !== null || f.actualProd !== null
    ? `<div class="knp-actual">${f.actualSales !== null ? `<span>Actual sales <b>${knMoney0(f.actualSales)}</b>${f.sales ? ` (${f.actualSales >= f.sales ? '+' : '−'}${knMoney0(Math.abs(f.actualSales - f.sales))})` : ''}</span>` : ''}${f.actualProd !== null ? `<span>Actual productivity <b>${knMoney0(f.actualProd)}/hr</b>${f.goal ? (f.actualProd >= f.goal ? ' · goal met' : ' · under the goal') : ''}</span>` : ''}</div>` : '';
  return `
    <section class="knp-card ${isNow ? 'is-now' : ''}" id="knp-${escapeHtml(knShortName(f.dp.name).toLowerCase())}">
      <div class="knp-head"><h3>${escapeHtml(knShortName(f.dp.name))} <span>${escapeHtml(knTimeText(f.dp))}</span></h3>${isNow ? '<span class="knp-now">now</span>' : ''}</div>
      <div class="knp-hero">${f.goal !== null ? `<b>${knMoney0(f.goal)}</b><span>per labor hour<br>productivity goal</span>` : '<span class="knp-none">No productivity goal yet: it comes in with the Forecast or the numbers file.</span>'}</div>
      ${stats ? `<div class="knp-stats">${stats}</div>` : ''}
      ${actual}
    </section>`;
}

function renderKnPage(){
  const root = document.getElementById('knPageRoot');
  if(!root) return;
  if(!knPageShown()){ root.innerHTML = '<p class="knp-lede">Team Leads and up: sign in with your clock-in PIN to see the daypart goals.</p>'; return; }
  const week = getWeekDays(0).map(d => d.date);
  const iso = knPageDate && (week.includes(knPageDate) || knPageDate === today) ? knPageDate : (week.includes(today) ? today : week[0]);
  const facts = numbersDayparts.map(dp => knDaypartFacts(iso, dp));
  const nowMin = iso === today ? new Date().getHours() * 60 + new Date().getMinutes() : -1;
  const nowDp = facts.find(f => nowMin >= f.win.start && nowMin < f.win.end);
  const sum = k => facts.reduce((s, f) => s + (f[k] || 0), 0);
  const sales = sum('sales'), need = sum('need'), sched = sum('sched');
  root.innerHTML = `
    <div class="knp-headrow">
      <h2 class="knp-title">Know the Numbers</h2>
      <p class="knp-lede">Each daypart's goals at a glance: the productivity goal, what it takes in hours, and how the schedule lines up.</p>
    </div>
    <div class="knp-days" role="group" aria-label="Pick a day">${week.map(d => `<button type="button" class="knp-day ${d === iso ? 'is-on' : ''} ${d === today ? 'is-today' : ''}" data-knp-day="${d}" aria-pressed="${d === iso}"><span>${escapeHtml(knDayLabel(d).split(',')[0])}</span><b>${+d.slice(8)}</b></button>`).join('')}</div>
    ${sales ? `<div class="knp-day-sum"><div><span>Projected</span><b>${knMoney0(sales)}</b></div><div><span>Hours the goals allow</span><b>${knHours(need)}</b></div><div><span>On the schedule</span><b>${sched ? knHours(sched) : '—'}</b></div></div>` : `<p class="knp-lede">No projections for ${escapeHtml(knDayLabel(iso))} yet: they come in with the Forecast or the numbers file in Manage → Uploads.</p>`}
    <div class="knp-cards">${facts.map(f => knCardHtml(iso, f, f === nowDp)).join('')}</div>
    <p class="knp-foot">Productivity is sales per labor hour. "On the schedule" counts every FOH and BOH shift in the daypart, from the HotSchedules roster. Drive-thru time and OSAT come from the latest speed of service and CEM uploads.</p>`;
  const focus = knPageFocus || (nowDp ? knShortName(nowDp.dp.name) : null);
  knPageFocus = null;
  if(focus){
    const el = document.getElementById('knp-' + focus.toLowerCase());
    if(el && el.scrollIntoView && iso === today) requestAnimationFrame(() => el.scrollIntoView({block: 'nearest'}));
  }
}

document.addEventListener('click', e => {
  const day = e.target.closest && e.target.closest('[data-knp-day]');
  if(day){ knPageDate = day.dataset.knpDay; renderKnPage(); return; }
  const open = e.target.closest && e.target.closest('[data-kn-open]');
  if(open){ knPageDate = open.dataset.knDate || null; knPageFocus = open.dataset.knOpen || null; }
});
