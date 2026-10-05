// ===== SHIFT CHANGES (swaps since the schedule was posted) =====
// The team swaps a lot of shifts in HotSchedules, and the roster is synced
// again (Ops Hub Sync) to pick them up. A sync replaces each day's imported
// roster, so on its own nobody would see what changed. So the first time a
// day that already has an imported roster is synced again, the roster it had
// is kept as that day's posted schedule (rosterPosted). Set Ups then shows
// the difference for the day on screen:
//   swap  — one person off and another on for the same hours
//   on    — added
//   off   — no longer scheduled (and where they're still placed, if anywhere)
//   time  — same person, different hours
// Only imported people count; ones added by hand (source: 'manual') are the
// leader's own changes. Past days are pruned after a week.

const ROSTER_POSTED_KEEP_DAYS = 7;

function rcKey(p){ return String(p.name || '').trim().toLowerCase(); }

// A shift's hours as one string, the same however the times were written
// ("6:00 AM" and "6:00a" alike): "6:00a–1:00p", or blocks joined by ", ".
function rcTime(t){
  const m = parseShiftTimeToMinutes(t);
  return m === null ? String(t || '') : `${suClock(m)}${m >= 720 ? 'p' : 'a'}`;
}
function rcSpan(p){
  const blocks = p.blocks && p.blocks.length > 1 ? p.blocks : [p];
  return blocks.map(b => `${rcTime(b.start)}–${rcTime(b.end)}`).join(', ');
}

function rcImported(list){
  return (list || []).filter(p => p && p.name && p.source !== 'manual');
}

function rcSlim(list){
  return list.map(p => {
    const slim = {name: p.name, start: p.start, end: p.end};
    if(p.blocks && p.blocks.length > 1) slim.blocks = p.blocks.map(b => ({start: b.start, end: b.end}));
    return slim;
  });
}

// Before a day's roster is replaced by an import: keep what it had as the
// posted schedule, unless it already has one (or has no imported roster yet,
// i.e. this is the week's first import).
function rosterNotePosted(date, side, currentList){
  if(date < today) return;
  const day = rosterPosted[date] || {};
  if(day[side]) return;
  const before = rcImported(currentList);
  if(!before.length) return;
  day[side] = rcSlim(before);
  day.at = day.at || Date.now();
  rosterPosted[date] = day;
}

// Manager reset: the roster as it is now becomes the posted schedule for
// these days (say the first sync was a draft), so their changes clear and
// later syncs compare with it.
function rosterResetPosted(dates){
  dates.forEach(date=>{
    const day = {};
    ['foh', 'boh'].forEach(side=>{
      const now = rcImported((side === 'foh' ? fohRoster : bohRoster)[date]);
      if(now.length) day[side] = rcSlim(now);
    });
    if(day.foh || day.boh){ day.at = Date.now(); rosterPosted[date] = day; }
    else delete rosterPosted[date];
  });
}

// Monday–Saturday of `date`'s week, from today on.
function rcWeekDates(date){
  const d = new Date(date + 'T00:00:00');
  const monday = isoAddDays(date, d.getDay() === 0 ? -6 : 1 - d.getDay());
  return [0, 1, 2, 3, 4, 5].map(i => isoAddDays(monday, i)).filter(x => x >= today);
}

function rcDayLabel(date){
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'numeric', day: 'numeric'});
}

function rosterPrunePosted(){
  const cutoff = isoAddDays(today, -ROSTER_POSTED_KEEP_DAYS);
  Object.keys(rosterPosted).forEach(d => { if(d < cutoff) delete rosterPosted[d]; });
}

// What's different on `date` for `side` ('foh' | 'boh') from the posted schedule.
function rosterDayChanges(date, side){
  const posted = (rosterPosted[date] || {})[side];
  if(!posted) return [];
  const now = rcImported((side === 'foh' ? fohRoster : bohRoster)[date]);
  const before = new Map(posted.map(p => [rcKey(p), p]));
  const after = new Map(now.map(p => [rcKey(p), p]));
  let off = posted.filter(p => !after.has(rcKey(p)));
  let on = now.filter(p => !before.has(rcKey(p)));
  const changes = [];
  // Someone off and someone on for the same hours: a swap.
  on = on.filter(p=>{
    const i = off.findIndex(o => rcSpan(o) === rcSpan(p));
    if(i === -1) return true;
    changes.push({kind: 'swap', name: p.name, for: off[i].name, span: rcSpan(p)});
    off.splice(i, 1);
    return false;
  });
  on.forEach(p => changes.push({kind: 'on', name: p.name, span: rcSpan(p)}));
  off.forEach(p => changes.push({kind: 'off', name: p.name, span: rcSpan(p)}));
  now.forEach(p=>{
    const b = before.get(rcKey(p));
    if(b && rcSpan(b) !== rcSpan(p)) changes.push({kind: 'time', name: p.name, span: rcSpan(p), was: rcSpan(b)});
  });
  return changes;
}

// Where someone is still placed on `date` (positions and Lead Captain), e.g.
// ['iPOS 1 · Lunch'].
function rosterPlacedAt(date, side, name){
  const prefix = `${side}||${date}||`, who = String(name).trim().toLowerCase();
  const out = [];
  Object.keys(posAssignments).forEach(k=>{
    if(!k.startsWith(prefix)) return;
    if(!suSplitNames(posAssignments[k]).some(n => n.toLowerCase() === who)) return;
    const [dp, slot] = k.slice(prefix.length).split('||');
    out.push(`${slot} · ${suShortDaypart(dp)}`);
  });
  return out;
}

// The card is a drop-down, closed to start so it takes one line on Set Ups.
// The header carries how many changes there are, and flags in red when
// someone who changed is still placed in a spot. Open or closed is
// remembered on the device. Changed hours read "was" (light) then "now"
// (bold), so the current time is the one that stands out.
const RC_OPEN_KEY = 'cfaBudaShiftChangesOpen';
let rcOpen = false;
try{ rcOpen = localStorage.getItem(RC_OPEN_KEY) === '1'; }catch(e){}
function rcToggleOpen(){
  rcOpen = !rcOpen;
  try{ localStorage.setItem(RC_OPEN_KEY, rcOpen ? '1' : '0'); }catch(e){}
}
const RC_SVG = d => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const RC_ICONS = {
  swap: RC_SVG('<path d="M7 7h11l-3-3"/><path d="M17 17H6l3 3"/>'),
  on: RC_SVG('<path d="M12 5v14M5 12h14"/>'),
  off: RC_SVG('<path d="M5 12h14"/>'),
  time: RC_SVG('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  warn: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/></svg>'
};

function rosterChangesHtml(side, date){
  const changes = rosterDayChanges(date, side);
  const other = side === 'foh' ? 'boh' : 'foh';
  const otherN = rosterDayChanges(date, other).length;
  if(!changes.length && !otherN) return '';
  const nm = n => `<b>${escapeHtml(suDisplayName(n))}</b>`;
  const placedAt = n => rosterPlacedAt(date, side, n);
  const placed = n => {
    const at = placedAt(n);
    return at.length ? `<span class="su-changes-warn">${RC_ICONS.warn}still placed: ${escapeHtml(at.join(', '))}</span>` : '';
  };
  const stillPlaced = changes.filter(c => (c.kind === 'swap' && placedAt(c.for).length) || (c.kind === 'off' && placedAt(c.name).length)).length;
  const was = t => `<span class="su-changes-was">was ${escapeHtml(t)}</span>`;
  const now = t => `<span class="su-changes-now">now ${escapeHtml(t)}</span>`;
  // The Spanish for a change, on its own line under the English.
  const es = c => {
    const who = suDisplayName(c.name), at = placedAt(c.kind === 'swap' ? c.for : c.name);
    const line = esText('Change ' + c.kind, who, c.kind === 'swap' ? suDisplayName(c.for) : c.kind === 'time' ? c.was : c.span, c.span);
    return esSpan(line + (at.length && (c.kind === 'swap' || c.kind === 'off') ? ` · ${esText('still placed')}: ${at.join(', ')}` : ''), true);
  };
  const line = c => {
    const ic = `<span class="su-changes-ic is-${c.kind}">${RC_ICONS[c.kind] || RC_ICONS.time}</span>`;
    if(c.kind === 'swap') return `<li>${ic}<span>${nm(c.name)} for ${nm(c.for)} <span class="su-changes-now">${escapeHtml(c.span)}</span>${placed(c.for)}${es(c)}</span></li>`;
    if(c.kind === 'on') return `<li>${ic}<span>${nm(c.name)} added <span class="su-changes-now">${escapeHtml(c.span)}</span>${es(c)}</span></li>`;
    if(c.kind === 'off') return `<li>${ic}<span>${nm(c.name)} off ${was(c.span)}${placed(c.name)}${es(c)}</span></li>`;
    return `<li>${ic}<span>${nm(c.name)} <span class="su-changes-times">${was(c.was)} ${now(c.span)}</span>${es(c)}</span></li>`;
  };
  const n = changes.length;
  return `<div class="su-changes ${rcOpen ? 'is-open' : ''}" role="note">
    <button type="button" class="su-changes-head" data-rc-toggle="1" aria-expanded="${rcOpen}">
      <span class="su-changes-title">Shift changes${esHtml('Shift changes')}</span>
      ${n ? `<span class="su-changes-count" aria-label="${n} change${n === 1 ? '' : 's'}">${n}</span>` : ''}
      ${stillPlaced ? `<span class="su-changes-flag">${RC_ICONS.warn}${stillPlaced} still placed${esHtml('N still placed', stillPlaced)}</span>` : ''}
      <span class="su-changes-sub">${n ? `since the schedule was posted${esHtml('since the schedule was posted')}` : `none on ${side.toUpperCase()}${esHtml('none on SIDE', side.toUpperCase())}`}</span>
      <span class="su-changes-chev" aria-hidden="true">▾</span>
    </button>
    ${rcOpen ? `<div class="su-changes-body">
    ${n ? `<ul>${changes.map(line).join('')}</ul>` : ''}
    ${otherN ? `<div class="su-changes-other">${otherN} ${other.toUpperCase()} change${otherN === 1 ? '' : 's'} — switch to ${other.toUpperCase()} to see ${otherN === 1 ? 'it' : 'them'}${esLine('N SIDE changes', otherN, other.toUpperCase())}</div>` : ''}
    ${typeof launchManager !== 'undefined' && launchManager ? `<div class="su-changes-actions">
      <button type="button" data-rc-reset="day" data-rc-date="${escapeHtml(date)}">Reset day</button>
      <button type="button" data-rc-reset="week" data-rc-date="${escapeHtml(date)}">Reset week</button>
      <span>Managers: make the roster as it is now the posted schedule</span>
    </div>` : ''}
    </div>` : ''}
  </div>`;
}

document.getElementById('allDayparts').addEventListener('click', async e=>{
  if(e.target.closest('[data-rc-toggle]')){ rcToggleOpen(); renderAllDayparts(); return; }
  const btn = e.target.closest('[data-rc-reset]');
  if(!btn) return;
  const date = btn.dataset.rcDate;
  const dates = btn.dataset.rcReset === 'week' ? rcWeekDates(date) : [date];
  if(!dates.length) return;
  const span = dates.length > 1 ? `${rcDayLabel(dates[0])} – ${rcDayLabel(dates[dates.length - 1])}` : rcDayLabel(dates[0]);
  if(!confirm(`Use the roster as it is now as the posted schedule for ${span}? Its shift changes clear, and later syncs are compared with it.`)) return;
  rosterResetPosted(dates);
  renderAllDayparts();
  showToast(`✓ Posted schedule reset · ${span}`);
  await saveState();
});
