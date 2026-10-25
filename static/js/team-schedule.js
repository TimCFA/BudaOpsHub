// ===== SCHEDULE (Tim, Oct 25 2026) =====
// The team's shifts for the week, from the HotSchedules roster the hub
// already keeps for Set Ups (fohRoster / bohRoster, plus the truck and
// office shifts). Written while HotSchedules wasn't showing people their
// shifts: a team member signed in with their clock-in PIN sees their own
// week first; anyone else finds their name. Below it, who's working each
// day. On Sunday (the store is closed) "this week" is the one starting
// Monday.

let tsOffset = 0;          // 0 = this week, 1 = next week
let tsDay = null;          // the day open under "Who's working"
let tsSearch = '';
const TS_NAME_KEY = 'cfaBudaScheduleName';

function tsWeek(offset){
  const now = new Date();
  const dow = now.getDay();
  const toMonday = dow === 0 ? 1 : 1 - dow;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + toMonday + offset * 7);
  return Array.from({length: 6}, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return {iso: toLocalISODate(d), short: d.toLocaleDateString('en-US', {weekday: 'short'}), date: d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'}), long: d.toLocaleDateString('en-US', {weekday: 'long'})};
  });
}

// Everyone's shifts that day: {name, key, side, start, end, blocks}.
const TS_SOURCES = [['FOH', () => fohRoster], ['BOH', () => bohRoster], ['Truck', () => truckShifts], ['Office', () => adminShifts]];
function tsShifts(iso){
  const out = [];
  TS_SOURCES.forEach(([side, get]) => {
    let src;
    try{ src = get(); }catch(e){ src = null; }
    const list = src && Array.isArray(src[iso]) ? src[iso] : [];
    list.forEach(p => { if(p && p.name) out.push({name: p.name, key: dirKey(p.name), side, start: p.start, end: p.end, blocks: Array.isArray(p.blocks) && p.blocks.length ? p.blocks : null}); });
  });
  return out;
}

function tsHasWeek(days){ return days.some(d => tsShifts(d.iso).length); }

// Everyone on the week's schedule, by name.
function tsPeople(days){
  const seen = new Map();
  days.forEach(d => tsShifts(d.iso).forEach(s => { if(!seen.has(s.key)) seen.set(s.key, s.name); }));
  return [...seen.entries()].map(([key, name]) => ({key, name})).sort((a, b) => a.name.localeCompare(b.name));
}

const tsSpan = s => (s.blocks || [s]).map(b => `${b.start}–${b.end}`).join(', ');
function tsMinutes(s){
  return (s.blocks || [s]).reduce((sum, b) => {
    const a = parseShiftTimeToMinutes(b.start); let z = parseShiftTimeToMinutes(b.end);
    if(a === null || z === null) return sum;
    if(z <= a) z += 1440;
    return sum + (z - a);
  }, 0);
}
const tsStartOf = s => { const m = parseShiftTimeToMinutes(s.start); return m === null ? 9999 : m; };
const TS_SIDE_LABEL = {FOH: 'Front', BOH: 'Back', Truck: 'Truck', Office: 'Office'};

// Whose week to show: the signed-in team member, else the name picked on
// this device, else nobody yet.
function tsMe(people){
  const v = typeof rnViewer === 'function' ? rnViewer() : {name: ''};
  if(v.name){
    const hit = people.find(p => p.key === dirKey(v.name)) || people.find(p => typeof rnSame === 'function' && rnSame(p.name, v.name));
    if(hit) return {person: hit, signedIn: true};
  }
  let saved = null;
  try{ saved = localStorage.getItem(TS_NAME_KEY); }catch(e){}
  const hit = saved ? people.find(p => p.key === saved) : null;
  return hit ? {person: hit, signedIn: false} : null;
}

function tsMyWeekHtml(days, me){
  const rows = days.map(d => {
    const mine = tsShifts(d.iso).filter(s => s.key === me.person.key).sort((a, b) => tsStartOf(a) - tsStartOf(b));
    const isToday = d.iso === today;
    return `<li class="ts-day${mine.length ? '' : ' is-off'}${isToday ? ' is-today' : ''}">
      <span class="ts-day-name">${d.short}<small>${escapeHtml(d.date)}</small></span>
      <span class="ts-day-shifts">${mine.length ? mine.map(s => `<b>${(s.blocks || [s]).map(b => escapeHtml(`${b.start}–${b.end}`)).join('<br>')}</b><em>${TS_SIDE_LABEL[s.side]}</em>`).join('<br>') : `Off${esSpan(esText('Off'))}`}</span>
    </li>`;
  }).join('');
  const mins = days.reduce((sum, d) => sum + tsShifts(d.iso).filter(s => s.key === me.person.key).reduce((a, s) => a + tsMinutes(s), 0), 0);
  const count = days.filter(d => tsShifts(d.iso).some(s => s.key === me.person.key)).length;
  return `<section class="ts-card ts-mine">
    <div class="ts-card-head">
      <div><h3>${escapeHtml(me.person.name)}</h3><p>${count} ${count === 1 ? 'shift' : 'shifts'} · ${Math.round(mins / 6) / 10} hrs</p></div>
      ${me.signedIn ? '' : `<button type="button" class="ld-link" data-ts-clear>Not you?${esSpan(esText('Not you?'))}</button>`}
    </div>
    <ul class="ts-days">${rows}</ul>
  </section>`;
}

function tsHitsHtml(people){
  const q = tsSearch.trim().toLowerCase();
  if(!q) return '';
  const hits = people.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
  return hits.length ? hits.map(p => `<button type="button" class="ts-hit" data-ts-pick="${escapeHtml(p.key)}">${escapeHtml(p.name)}</button>`).join('')
    : '<p class="ts-none">No one by that name on this week’s schedule.</p>';
}

function tsFindHtml(people){
  return `<section class="ts-card ts-find">
    <label class="ts-find-label" for="tsSearch">Find your shifts${esLine('Find your shifts')}</label>
    <input id="tsSearch" type="search" autocomplete="off" placeholder="Type your name" value="${escapeHtml(tsSearch)}">
    <div class="ts-hits" id="tsHits">${tsHitsHtml(people)}</div>
    <p class="ts-hint">Or sign in with your clock-in PIN to see your week right away.</p>
  </section>`;
}

function tsWhoHtml(days, meKey){
  if(!tsDay || !days.some(d => d.iso === tsDay)) tsDay = (days.find(d => d.iso >= today) || days[0]).iso;
  const day = days.find(d => d.iso === tsDay);
  const shifts = tsShifts(tsDay).filter(s => s.side !== 'Office');
  const group = side => {
    const list = shifts.filter(s => s.side === side).sort((a, b) => tsStartOf(a) - tsStartOf(b) || a.name.localeCompare(b.name));
    if(!list.length) return '';
    return `<h4>${TS_SIDE_LABEL[side]}${esSpan(esText(TS_SIDE_LABEL[side]))} <small>${list.length}</small></h4>
      <ul class="ts-list">${list.map(s => `<li${s.key === meKey ? ' class="is-me"' : ''}><span>${escapeHtml(s.name)}</span><b>${escapeHtml(tsSpan(s))}</b></li>`).join('')}</ul>`;
  };
  return `<section class="ts-card ts-who">
    <h3>Who's working${esLine("Who's working")}</h3>
    <div class="ts-chips" role="tablist">${days.map(d => `<button type="button" class="ts-chip${d.iso === tsDay ? ' active' : ''}" role="tab" aria-selected="${d.iso === tsDay}" data-ts-day="${d.iso}">${d.short}<small>${escapeHtml(d.date)}</small></button>`).join('')}</div>
    <p class="ts-day-title">${escapeHtml(day.long)}, ${escapeHtml(day.date)}</p>
    ${shifts.length ? group('FOH') + group('BOH') + group('Truck') : '<p class="ts-none">No one is on the schedule this day.</p>'}
  </section>`;
}

function renderTeamSchedule(){
  const root = document.getElementById('scheduleRoot');
  if(!root) return;
  const hasNext = tsHasWeek(tsWeek(1));
  if(tsOffset === 1 && !hasNext) tsOffset = 0;
  const days = tsWeek(tsOffset);
  const people = tsPeople(days);
  const me = tsMe(people) || tsMe(tsPeople(tsWeek(tsOffset ? 0 : 1)));
  const range = `${days[0].short}, ${days[0].date} – ${days[5].short}, ${days[5].date}`;
  const weeks = `<div class="ts-weeks" role="tablist">
      <button type="button" class="ts-week${tsOffset === 0 ? ' active' : ''}" role="tab" aria-selected="${tsOffset === 0}" data-ts-week="0">This week${esSpan(esText('This week'))}</button>
      ${hasNext ? `<button type="button" class="ts-week${tsOffset === 1 ? ' active' : ''}" role="tab" aria-selected="${tsOffset === 1}" data-ts-week="1">Next week${esSpan(esText('Next week'))}</button>` : ''}
    </div>`;
  const head = `<div class="ts-head"><h2>Schedule${esLine('Schedule')}</h2><p>${escapeHtml(range)}</p>${weeks}</div>`;
  if(!people.length){
    root.innerHTML = head + '<section class="ts-card"><p class="ts-none">This week’s schedule isn’t in the hub yet. It comes in from HotSchedules.</p></section>';
    return;
  }
  const mineKey = me && people.some(p => p.key === me.person.key) ? me.person.key : null;
  const mine = me && mineKey ? tsMyWeekHtml(days, me) : me ? `<section class="ts-card ts-mine"><div class="ts-card-head"><div><h3>${escapeHtml(me.person.name)}</h3><p>No shifts this week</p></div></div></section>` : tsFindHtml(people);
  root.innerHTML = head + mine + tsWhoHtml(days, mineKey)
    + '<p class="ts-foot">From the HotSchedules schedule. If a shift looks wrong, check with a leader.</p>';
}

document.addEventListener('click', e => {
  const view = e.target.closest('#scheduleView');
  if(!view) return;
  const week = e.target.closest('[data-ts-week]');
  if(week){ tsOffset = +week.dataset.tsWeek; tsDay = null; renderTeamSchedule(); return; }
  const day = e.target.closest('[data-ts-day]');
  if(day){ tsDay = day.dataset.tsDay; renderTeamSchedule(); return; }
  const pick = e.target.closest('[data-ts-pick]');
  if(pick){
    try{ localStorage.setItem(TS_NAME_KEY, pick.dataset.tsPick); }catch(err){}
    tsSearch = '';
    renderTeamSchedule();
    return;
  }
  if(e.target.closest('[data-ts-clear]')){
    try{ localStorage.removeItem(TS_NAME_KEY); }catch(err){}
    renderTeamSchedule();
    const box = document.getElementById('tsSearch');
    if(box) box.focus();
  }
});
// Typing fills in the matches only, so the box keeps its place.
document.addEventListener('input', e => {
  if(e.target.id !== 'tsSearch') return;
  tsSearch = e.target.value;
  const hits = document.getElementById('tsHits');
  if(hits) hits.innerHTML = tsHitsHtml(tsPeople(tsWeek(tsOffset)));
});
