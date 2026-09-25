// ===== OPERATIONAL INTELLIGENCE — TIER 1 =====
// Deterministic, rule-based insights only — no AI, no external calls, nothing
// here is ever narrated or guessed. Every number is computed directly from
// data the app already collects.

function getEntriesForDates(dateList){
  const dateSet = new Set(dateList);
  return entries.filter(e => dateSet.has(toLocalISODate(new Date(e.ts))));
}

function sumEntryCosts(list){
  return list.reduce((sum,e)=>sum+e.cost, 0);
}

function topProductDelta(periodAEntries, periodBEntries){
  const totals = {};
  periodAEntries.forEach(e=>{ totals[e.name] = totals[e.name] || {a:0,b:0}; totals[e.name].a += e.cost; });
  periodBEntries.forEach(e=>{ totals[e.name] = totals[e.name] || {a:0,b:0}; totals[e.name].b += e.cost; });
  let best = null;
  Object.keys(totals).forEach(name=>{
    const delta = totals[name].b - totals[name].a;
    if(!best || Math.abs(delta) > Math.abs(best.delta)) best = {name, delta};
  });
  return best;
}

function renderWasteTrendCard(){
  const el = document.getElementById('oiWasteTrend');
  if(!el) return;

  const thisWeekDates = getWeekDays(0).map(d=>d.date);
  const lastWeekDates = getWeekDays(-1).map(d=>d.date);
  const thisWeekEntries = getEntriesForDates(thisWeekDates);
  const lastWeekEntries = getEntriesForDates(lastWeekDates);
  const thisWeekTotal = sumEntryCosts(thisWeekEntries);
  const lastWeekTotal = sumEntryCosts(lastWeekEntries);
  const lastWeekStartMs = new Date(lastWeekDates[0] + 'T00:00:00').getTime();
  const lastWeekReliable = !wasteLogLastClosedOut || wasteLogLastClosedOut < lastWeekStartMs;

  let html = '';
  if(lastWeekReliable && lastWeekTotal > 0){
    const pct = Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100);
    const improved = pct <= 0;
    const driver = topProductDelta(lastWeekEntries, thisWeekEntries);
    html += `
      <div class="oi-stat-row">
        <div class="oi-stat-label">This Week vs Last Week</div>
        <div class="oi-stat-value ${improved ? 'oi-good' : 'oi-bad'}">${improved ? '▼' : '▲'} ${Math.abs(pct)}%</div>
      </div>
      <div class="oi-stat-sub">$${thisWeekTotal.toFixed(2)} this week vs $${lastWeekTotal.toFixed(2)} last week${driver && Math.abs(driver.delta) >= 0.5 ? ` · biggest mover: <b>${escapeHtml(driver.name)}</b> (${driver.delta > 0 ? '+' : '-'}$${Math.abs(driver.delta).toFixed(2)})` : ''}</div>
    `;
  } else {
    html += `<div class="oi-stat-sub">Not enough data yet for a week-over-week comparison${!lastWeekReliable ? ' — last week was cleared by a monthly close-out' : ''}.</div>`;
  }

  html += '<div style="height:14px;"></div>';

  const currentMonthKey = today.slice(0,7);
  const [cy, cm] = currentMonthKey.split('-').map(Number);
  const prevMonthDate = new Date(cy, cm - 2, 1);
  const prevMonthKey = prevMonthDate.getFullYear() + '-' + String(prevMonthDate.getMonth()+1).padStart(2,'0');
  const currentMonthTotal = sumEntryCosts(entries.filter(e => toLocalISODate(new Date(e.ts)).slice(0,7) === currentMonthKey));
  const prevMonthSummary = wasteMonthlyHistory[prevMonthKey];

  if(prevMonthSummary && prevMonthSummary.total > 0){
    const pct = Math.round(((currentMonthTotal - prevMonthSummary.total) / prevMonthSummary.total) * 100);
    const improved = pct <= 0;
    html += `
      <div class="oi-stat-row">
        <div class="oi-stat-label">This Month vs Last Month</div>
        <div class="oi-stat-value ${improved ? 'oi-good' : 'oi-bad'}">${improved ? '▼' : '▲'} ${Math.abs(pct)}%</div>
      </div>
      <div class="oi-stat-sub">$${currentMonthTotal.toFixed(2)} so far this month vs $${prevMonthSummary.total.toFixed(2)} total last month</div>
    `;
  } else {
    html += `<div class="oi-stat-sub">No prior month on record yet — this fills in automatically after your first monthly close-out.</div>`;
  }

  el.innerHTML = html;
}

function renderDayOfWeekCard(){
  const el = document.getElementById('oiDayOfWeek');
  if(!el) return;

  const byDate = {};
  entries.forEach(e=>{
    const dateISO = toLocalISODate(new Date(e.ts));
    byDate[dateISO] = (byDate[dateISO]||0) + e.cost;
  });

  const weekdayStats = {};
  Object.keys(byDate).forEach(dateISO=>{
    const d = new Date(dateISO + 'T00:00:00');
    const dow = d.getDay();
    if(dow === 0) return;
    const name = WEEKDAY_NAMES[dow - 1];
    if(!weekdayStats[name]) weekdayStats[name] = {sum: 0, days: 0};
    weekdayStats[name].sum += byDate[dateISO];
    weekdayStats[name].days += 1;
  });

  const stats = WEEKDAY_NAMES.map(name => {
    const w = weekdayStats[name];
    return {name, avg: w ? w.sum / w.days : 0, days: w ? w.days : 0};
  });

  const totalDaysLogged = stats.reduce((sum,s)=>sum+s.days, 0);
  if(totalDaysLogged === 0){
    el.innerHTML = '<div class="oi-stat-sub">No waste logged yet this period.</div>';
    return;
  }

  const maxAvg = Math.max(0.01, ...stats.map(s => s.avg));
  el.innerHTML = stats.map(s => `
    <div class="oi-dow-row">
      <span class="oi-dow-name">${s.name.slice(0,3)}</span>
      <div class="oi-dow-track"><div class="oi-dow-fill" style="width:${(s.avg/maxAvg)*100}%"></div></div>
      <span class="oi-dow-value">${s.days ? '$' + s.avg.toFixed(2) : '—'}</span>
    </div>
  `).join('') + `<div class="oi-stat-sub" style="margin-top:10px;">Based on ${totalDaysLogged} logged day${totalDaysLogged===1?'':'s'} in the current period — resets with each monthly close-out for now</div>`;
}

function getSafeCountsForDates(dateList){
  const dateSet = new Set(dateList);
  return safeCounts.filter(c => dateSet.has(c.date));
}

function renderSafeCountVarianceCard(){
  const el = document.getElementById('oiSafeCount');
  if(!el) return;

  const thisWeekDates = getWeekDays(0).map(d=>d.date);
  const lastWeekDates = getWeekDays(-1).map(d=>d.date);
  const thisWeekCounts = getSafeCountsForDates(thisWeekDates);
  const lastWeekCounts = getSafeCountsForDates(lastWeekDates);

  if(thisWeekCounts.length === 0 && lastWeekCounts.length === 0){
    el.innerHTML = '<div class="oi-stat-sub">No safe counts logged yet.</div>';
    return;
  }

  const avgAbsVariance = list => list.length ? list.reduce((sum,c)=>sum+Math.abs(c.variance),0)/list.length : null;
  const balancedCount = list => list.filter(c=>Math.abs(c.variance) < 0.01).length;
  const thisWeekAvg = avgAbsVariance(thisWeekCounts);
  const lastWeekAvg = avgAbsVariance(lastWeekCounts);

  let html = '';
  if(thisWeekAvg !== null && lastWeekAvg !== null && lastWeekAvg > 0){
    const pct = Math.round(((thisWeekAvg - lastWeekAvg) / lastWeekAvg) * 100);
    const improved = pct <= 0;
    html += `
      <div class="oi-stat-row">
        <div class="oi-stat-label">Avg Variance vs Last Week</div>
        <div class="oi-stat-value ${improved ? 'oi-good' : 'oi-bad'}">${improved ? '▼' : '▲'} ${Math.abs(pct)}%</div>
      </div>
      <div class="oi-stat-sub">$${thisWeekAvg.toFixed(2)} avg this week vs $${lastWeekAvg.toFixed(2)} last week · ${balancedCount(thisWeekCounts)}/${thisWeekCounts.length} balanced this week</div>
    `;
  } else if(thisWeekAvg !== null){
    html += `<div class="oi-stat-sub">$${thisWeekAvg.toFixed(2)} avg variance this week · ${balancedCount(thisWeekCounts)}/${thisWeekCounts.length} balanced — not enough history yet for a week-over-week comparison</div>`;
  } else {
    html += `<div class="oi-stat-sub">No safe counts logged this week yet.</div>`;
  }

  if(thisWeekCounts.length){
    const netBias = thisWeekCounts.reduce((sum,c)=>sum+c.variance, 0);
    if(Math.abs(netBias) >= 0.01){
      html += `<div class="oi-stat-sub" style="margin-top:8px;">Running ${netBias > 0 ? 'over' : 'short'} by $${Math.abs(netBias).toFixed(2)} this week</div>`;
    }
  }

  el.innerHTML = html;
}

function renderZoneResetTrendCard(){
  const el = document.getElementById('oiZoneReset');
  if(!el) return;

  const thisWeekDates = getWeekDays(0).map(d=>d.date);
  const lastWeekDates = getWeekDays(-1).map(d=>d.date);
  const pctsFor = dateList => dateList.map(d => zoneChecklistHistory[d] ? zoneChecklistHistory[d].overall : null).filter(v => v !== null);
  const avg = list => list.length ? list.reduce((s,v)=>s+v,0)/list.length : null;
  const thisWeekAvg = avg(pctsFor(thisWeekDates));
  const lastWeekAvg = avg(pctsFor(lastWeekDates));

  let html = '';
  if(thisWeekAvg !== null && lastWeekAvg !== null){
    const delta = Math.round(thisWeekAvg - lastWeekAvg);
    const improved = delta >= 0;
    html += `
      <div class="oi-stat-row">
        <div class="oi-stat-label">Avg Completion vs Last Week</div>
        <div class="oi-stat-value ${improved ? 'oi-good' : 'oi-bad'}">${improved ? '▲' : '▼'} ${Math.abs(delta)}pts</div>
      </div>
      <div class="oi-stat-sub">${Math.round(thisWeekAvg)}% avg this week vs ${Math.round(lastWeekAvg)}% last week</div>
    `;
  } else if(thisWeekAvg !== null){
    html += `<div class="oi-stat-sub">${Math.round(thisWeekAvg)}% avg completion this week — not enough history yet for a week-over-week comparison</div>`;
  } else {
    html += `<div class="oi-stat-sub">No Zone Reset checklists completed yet this week.</div>`;
  }

  const greatDays = Object.keys(zoneChecklistHistory).filter(d => zoneChecklistHistory[d].overall >= 95).sort().reverse();
  let streak = 0;
  if(greatDays.length){
    streak = 1;
    for(let i = 1; i < greatDays.length; i++){
      const d1 = new Date(greatDays[i-1]);
      const d2 = new Date(greatDays[i]);
      if((d1 - d2) / (1000*60*60*24) === 1) streak++;
      else break;
    }
  }
  html += `<div class="oi-stat-sub" style="margin-top:8px;">${streak > 0 ? `${streak} day${streak===1?'':'s'} in a row at 95%+ completion` : 'No current 95%+ completion streak'}</div>`;

  el.innerHTML = html;
}

function complianceRateForWeek(dateList, doneDates){
  const applicable = dateList.filter(d => d <= today);
  if(applicable.length === 0) return null;
  const done = applicable.filter(d => doneDates.includes(d)).length;
  return {rate: Math.round((done/applicable.length)*100), done, total: applicable.length};
}

function renderComplianceTrendCard(){
  const el = document.getElementById('oiCompliance');
  if(!el) return;

  const thisWeekDates = getWeekDays(0).map(d=>d.date);
  const lastWeekDates = getWeekDays(-1).map(d=>d.date);
  // The OE Walkthrough is hidden from Zone Reset & Walkthroughs for now, so it
  // is left out here too (it would read 0% every day). To bring it back, add
  // {label: 'FOH OE Walkthrough', doneDates: fohOEDays} and restore the card title.
  const rows = [
    {label: 'Food Safety', doneDates: foodSafetyDays}
  ];

  let html = '';
  rows.forEach(row=>{
    const thisWeek = complianceRateForWeek(thisWeekDates, row.doneDates);
    const lastWeek = complianceRateForWeek(lastWeekDates, row.doneDates);
    if(!thisWeek){
      html += `<div class="oi-stat-sub" style="margin-bottom:10px;">${row.label}: no applicable days yet this week.</div>`;
      return;
    }
    let compareHtml;
    if(lastWeek !== null){
      const delta = thisWeek.rate - lastWeek.rate;
      const improved = delta >= 0;
      compareHtml = `<span class="${improved ? 'oi-good' : 'oi-bad'}" style="font-weight:700;">${improved ? '▲' : '▼'} ${Math.abs(delta)}pts</span> vs last week (${lastWeek.rate}%)`;
    } else {
      compareHtml = 'not enough history yet for a week-over-week comparison';
    }
    html += `
      <div class="oi-stat-row">
        <div class="oi-stat-label">${row.label}</div>
        <div class="oi-stat-value">${thisWeek.rate}%</div>
      </div>
      <div class="oi-stat-sub" style="margin-bottom:10px;">${thisWeek.done}/${thisWeek.total} days this week · ${compareHtml}</div>
    `;
  });

  el.innerHTML = html;
}

function renderOperationalIntelligence(){
  renderWasteTrendCard();
  renderDayOfWeekCard();
  renderSafeCountVarianceCard();
  renderZoneResetTrendCard();
  renderComplianceTrendCard();
}
