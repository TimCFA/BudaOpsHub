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

// A person's week, a day a row: their shifts (and which side), or Off.
function tsWeekRows(days, key){
  return days.map(d => {
    const mine = tsShifts(d.iso).filter(s => s.key === key).sort((a, b) => tsStartOf(a) - tsStartOf(b));
    const isToday = d.iso === today;
    return `<li class="ts-day${mine.length ? '' : ' is-off'}${isToday ? ' is-today' : ''}">
      <span class="ts-day-name">${d.short}<small>${escapeHtml(d.date)}</small></span>
      <span class="ts-day-shifts">${mine.length ? mine.map(s => `<b>${(s.blocks || [s]).map(b => escapeHtml(`${b.start}–${b.end}`)).join('<br>')}</b><em>${TS_SIDE_LABEL[s.side]}</em>`).join('<br>') : `Off${esSpan(esText('Off'))}`}</span>
    </li>`;
  }).join('');
}
function tsWeekTotals(days, key){
  const mins = days.reduce((sum, d) => sum + tsShifts(d.iso).filter(s => s.key === key).reduce((a, s) => a + tsMinutes(s), 0), 0);
  const count = days.filter(d => tsShifts(d.iso).some(s => s.key === key)).length;
  return {mins, count, text: `${count} ${count === 1 ? 'shift' : 'shifts'} · ${Math.round(mins / 6) / 10} hrs`};
}

function tsMyWeekHtml(days, me){
  return `<section class="ts-card ts-mine">
    <div class="ts-card-head">
      <div><h3>${escapeHtml(me.person.name)}</h3><p>${tsWeekTotals(days, me.person.key).text}</p></div>
      ${me.signedIn ? '' : `<button type="button" class="ld-link" data-ts-clear>Not you?${esSpan(esText('Not you?'))}</button>`}
    </div>
    <ul class="ts-days">${tsWeekRows(days, me.person.key)}</ul>
  </section>`;
}

// The find box has two jobs (Tim, Oct 26 2026: signed in, there was no way
// to look someone up). Nobody signed in and no name picked: it picks whose
// week the page shows. Otherwise it finds anyone on the week's schedule and
// a tap opens their week in the sheet, as a name on the roster does.
let tsFindMode = 'me';   // 'me' | 'look'
function tsHitsHtml(people){
  const q = tsSearch.trim().toLowerCase();
  if(!q) return '';
  const hits = people.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
  const hit = p => tsFindMode === 'look'
    ? `<button type="button" class="ts-hit" data-ts-person="${escapeHtml(p.name)}">${escapeHtml(p.name)}</button>`
    : `<button type="button" class="ts-hit" data-ts-pick="${escapeHtml(p.key)}">${escapeHtml(p.name)}</button>`;
  return hits.length ? hits.map(hit).join('') : '<p class="ts-none">No one by that name on this week’s schedule.</p>';
}

function tsFindHtml(people, look){
  tsFindMode = look ? 'look' : 'me';
  return `<section class="ts-card ts-find${look ? ' is-look' : ''}">
    <label class="ts-find-label" for="tsSearch">${look ? `Find someone’s shifts${esLine('Find someone’s shifts')}` : `Find your shifts${esLine('Find your shifts')}`}</label>
    <input id="tsSearch" type="search" autocomplete="off" placeholder="${look ? 'Type a name' : 'Type your name'}" value="${escapeHtml(tsSearch)}">
    <div class="ts-hits" id="tsHits">${tsHitsHtml(people)}</div>
    ${look ? '' : '<p class="ts-hint">Or sign in with your clock-in PIN to see your week right away.</p>'}
  </section>`;
}

// Who's working, a day at a time, in the same panel as the Right Now card's
// roster (right-now.js rnRosterHtml; Tim, Oct 25 2026): time first, leaders
// tagged, the viewer marked, and today who's on now. Office shifts only for
// managers, as before.
function tsWhoHtml(days, me){
  if(!tsDay || !days.some(d => d.iso === tsDay)) tsDay = (days.find(d => d.iso >= today) || days[0]).iso;
  const day = days.find(d => d.iso === tsDay);
  const manager = typeof launchManager !== 'undefined' && launchManager;
  const live = tsDay === today && typeof rnDay === 'function' && !rnDay().closed;
  const groups = rnDayRoster(tsDay, live ? rnNowMins() : null).filter(g => g.key !== 'admin' || manager);
  const head = {title: `Who’s on ${tsDay === today ? 'today' : day.long}`, sub: `${day.short}, ${day.date}`};
  return `<section class="ts-card ts-who" id="tsWho">
    <h3>Who's working${esLine("Who's working")}</h3>
    <div class="ts-chips" role="tablist">${days.map(d => `<button type="button" class="ts-chip${d.iso === tsDay ? ' active' : ''}" role="tab" aria-selected="${d.iso === tsDay}" data-ts-day="${d.iso}">${d.short}<small>${escapeHtml(d.date)}</small></button>`).join('')}</div>
    ${groups.length ? rnRosterHtml(groups, head, me, true) : '<p class="ts-none">No one is on the schedule this day.</p>'}
    ${tsOffHtml(days, day)}
  </section>`;
}

// ----- Not working (Tim, Oct 25 2026) -----
// For a leader looking for someone to call in: everyone on the team with no
// shift that day, by the side they usually work (the last four weeks and the
// two on the hub), fewest hours this week first so a call doesn't make
// overtime. The team is the clock-in PIN list (people who left drop off it);
// without it, whoever was on the schedule lately. Leads, directors and the
// admin team only. A name opens that person's week.
const TS_OFF_LOOKBACK = 28;
const TS_OFF_NEAR_MINS = 35 * 60;      // "35 h this week": close to overtime
function tsCanSeeOff(){
  if(typeof launchManager !== 'undefined' && launchManager) return true;
  return typeof siLeadOrUp === 'function' && siLeadOrUp();
}
function tsUsualSides(){
  const from = new Date(today + 'T12:00:00'); from.setDate(from.getDate() - TS_OFF_LOOKBACK);
  const since = toLocalISODate(from), until = tsWeek(1)[5].iso;
  const out = new Map();
  [['FOH', fohRoster], ['BOH', bohRoster], ['Truck', truckShifts]].forEach(([side, src]) => Object.entries(src || {}).forEach(([iso, list]) => {
    if(iso < since || iso > until || !Array.isArray(list)) return;
    list.forEach(p => {
      if(!p || !p.name || p.source === 'manual') return;
      const k = dirKey(p.name);
      const rec = out.get(k) || {name: p.name, FOH: 0, BOH: 0, Truck: 0};
      rec[side]++;
      out.set(k, rec);
    });
  }));
  return out;
}
function tsOffPeople(iso, days){
  const seen = tsUsualSides();
  const pins = typeof tmPinNames !== 'undefined' && tmPinNames ? tmPinNames.filter(p => p.role !== 'admin') : null;
  const team = pins ? pins.map(p => ({name: p.name, role: p.role})) : [...seen.values()].map(r => ({name: r.name, role: ''}));
  const working = tsShifts(iso);
  const onDay = n => working.some(s => s.key === dirKey(n) || rnSame(s.name, n));
  return team.filter(t => !onDay(t.name)).map(t => {
    const rec = seen.get(dirKey(t.name)) || [...seen.values()].find(r => rnSame(r.name, t.name)) || {FOH: 0, BOH: 0, Truck: 0};
    const side = rec.FOH > rec.BOH ? 'FOH' : rec.BOH > rec.FOH ? 'BOH' : rec.FOH ? 'Both' : '';
    const key = rec.name ? dirKey(rec.name) : dirKey(t.name);
    const mins = days.reduce((sum, d) => sum + tsShifts(d.iso).filter(s => s.key === key || rnSame(s.name, t.name)).reduce((a, s) => a + tsMinutes(s), 0), 0);
    return {name: t.name, scheduleName: rec.name || t.name, role: t.role, side, mins};
  });
}
// Who a leader has called for a day, so two leaders don't call the same
// person (Tim, Oct 25 2026): Called, Coming in, or Can't, signed by whoever
// tapped it (the server writes the signed-in name). Saved with Set Ups, so
// it's Team Leads' and up to change, and kept a week.
const TS_CALL_LABELS = {called: 'Called', yes: 'Coming in', no: 'Can’t'};
const TS_CALL_KEEP_DAYS = 7;
function tsCallFor(iso, name){ return ((callIns || {})[iso] || {})[dirKey(name)] || null; }
async function tsCallSet(iso, name, status){
  const key = dirKey(name);
  const cur = tsCallFor(iso, name);
  const day = Object.assign({}, (callIns || {})[iso]);
  if(cur && cur.status === status) delete day[key];        // tap it again to clear
  else day[key] = {name, status, by: getInitials() || '', at: Date.now()};
  const next = {};
  const keepFrom = toLocalISODate(new Date(Date.now() - TS_CALL_KEEP_DAYS * 86400000));
  Object.entries(callIns || {}).forEach(([d, v]) => { if(d >= keepFrom && d !== iso) next[d] = v; });
  if(Object.keys(day).length) next[iso] = day;
  callIns = next;
  renderTeamSchedule();
  await saveState();
}
// From "Coming in": Set Ups on that day and side, Add Team Member open with their name.
function tsAddToSetUps(name, side, iso){
  if(typeof rnOpenSetups !== 'function') return;
  rnOpenSetups(side === 'BOH' ? 'boh' : 'foh', iso, '');
  setTimeout(() => {
    const btn = document.getElementById('btnAddTeamMember');
    if(!btn) return;
    btn.click();
    const box = document.getElementById('addTMName');
    if(box && document.getElementById('addTMModal').classList.contains('active')){
      box.value = name;
      if(typeof tmPickDraw === 'function') tmPickDraw();
      document.getElementById('addTMStart').focus();
    }
  }, 150);
}
function tsClock(ms){ return new Date(ms).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'}).replace(' AM', 'a').replace(' PM', 'p'); }

function tsOffHtml(days, day){
  if(!tsCanSeeOff()) return '';
  if(typeof tmPinNames !== 'undefined' && !tmPinNames && typeof teamNamesLoad === 'function'){
    teamNamesLoad().then(n => { if(n && document.getElementById('tsWho')) renderTeamSchedule(); });
  }
  const off = tsOffPeople(day.iso, days).map(p => Object.assign(p, {call: tsCallFor(day.iso, p.name)}));
  if(!off.length) return '';
  // Coming in first, then those not called yet (fewest hours first), then
  // called, then those who can't.
  const rank = p => !p.call ? 1 : p.call.status === 'yes' ? 0 : p.call.status === 'called' ? 2 : 3;
  const groups = [['FOH', 'FOH'], ['BOH', 'BOH'], ['Both', 'FOH and BOH'], ['', 'Not on the schedule lately']]
    .map(([k, label]) => ({label, people: off.filter(p => p.side === k).sort((a, b) => rank(a) - rank(b) || a.mins - b.mins || a.name.localeCompare(b.name))}))
    .filter(g => g.people.length);
  const hrs = m => `${Math.round(m / 6) / 10} h this week`;
  const roleTag = r => r === 'lead' ? '<span class="rn-rp-tag">Leader</span>' : r === 'trainer' ? '<span class="rn-rp-tag">Trainer</span>' : '';
  const count = st => off.filter(p => p.call && p.call.status === st).length;
  const tally = [['yes', 'coming in'], ['called', 'called'], ['no', 'can’t']].filter(([st]) => count(st)).map(([st, w]) => `${count(st)} ${w}`).join(' · ');
  const row = p => {
    const c = p.call;
    const btn = st => `<button type="button" class="ts-call-btn is-${st}${c && c.status === st ? ' is-on' : ''}" data-ts-call="${st}" data-ts-call-name="${escapeHtml(p.name)}" aria-pressed="${!!(c && c.status === st)}">${TS_CALL_LABELS[st]}</button>`;
    return `<li class="rn-rp ts-off-row${c ? ' is-' + c.status : ''}">
      <span class="ts-off-top"><button type="button" class="ts-off-name" data-ts-person="${escapeHtml(p.scheduleName)}">${escapeHtml(p.name)}</button>${roleTag(p.role)}<span class="ts-off-hrs${p.mins >= TS_OFF_NEAR_MINS ? ' is-near' : ''}">${hrs(p.mins)}</span></span>
      ${c ? `<span class="ts-call-who">${escapeHtml(TS_CALL_LABELS[c.status])}${c.by ? ` · ${escapeHtml(c.by)}` : ''}${c.at ? ` · ${escapeHtml(tsClock(c.at))}` : ''}${c.status === 'yes' ? ` <button type="button" class="ld-link" data-ts-call-add="${escapeHtml(p.name)}" data-ts-call-side="${escapeHtml(p.side)}">Add to Set Ups</button>` : ''}</span>` : ''}
      <span class="ts-call-btns" role="group" aria-label="Call-in for ${escapeHtml(p.name)}">${btn('called')}${btn('yes')}${btn('no')}</span>
    </li>`;
  };
  return `<details class="ts-off"${tsOffOpen ? ' open' : ''} data-ts-off-day="${escapeHtml(day.iso)}">
      <summary><span class="ts-off-h">Not working ${escapeHtml(day.iso === today ? 'today' : day.long)}</span><span class="ts-off-n">${off.length}</span>${tally ? `<span class="ts-off-tally">${escapeHtml(tally)}</span>` : ''}</summary>
      <p class="ts-off-note">For a call-in: fewest hours this week first. Tap Called, Coming in or Can’t so other leaders don’t call the same person.</p>
      <div class="rn-roster-grid ts-off-grid">${groups.map(g => `
        <section class="rn-rg">
          <h3 class="rn-rg-h">${escapeHtml(g.label)}<span>${g.people.length}</span></h3>
          <ul class="rn-rg-list">${g.people.map(row).join('')}
          </ul>
        </section>`).join('')}</div>
    </details>`;
}
let tsOffOpen = false;

// ----- A person's week, from a tapped name -----
function tsPersonOpen(name, from){
  const days = tsWeek(tsOffset);
  const key = (tsPeople(days).find(p => p.key === dirKey(name) || rnSame(p.name, name)) || {key: dirKey(name)}).key;
  const t = tsWeekTotals(days, key);
  let sheet = document.getElementById('tsPersonSheet');
  if(!sheet){
    sheet = document.createElement('div');
    sheet.id = 'tsPersonSheet';
    sheet.className = 'rn-evs ts-person';
    document.body.appendChild(sheet);
    sheet.addEventListener('click', e => { if(e.target === sheet || e.target.closest('[data-ts-person-close]')) tsPersonClose(); });
    document.addEventListener('keydown', e => { if(e.key === 'Escape' && sheet.classList.contains('is-open')) tsPersonClose(); });
  }
  const rows = tsWeekRows(days, key);
  sheet.innerHTML = `<div class="rn-evs-card" role="dialog" aria-modal="true" aria-labelledby="tsPersonName" style="--ev:var(--cfa-navy)">
      <button type="button" class="rn-evs-x" data-ts-person-close aria-label="Close">${typeof RN_ICON_X !== 'undefined' ? RN_ICON_X : '×'}</button>
      <span class="rn-evs-kind"><i aria-hidden="true"></i>${tsOffset ? 'Next week' : 'This week'}</span>
      <h2 id="tsPersonName">${escapeHtml(name)}</h2>
      <p class="rn-evs-when">${escapeHtml(t.text)}</p>
      <ul class="ts-days">${rows}</ul>
    </div>`;
  sheet.classList.add('is-open');
  document.body.classList.add('rn-evs-on');
  tsPersonFrom = from || null;
  const x = sheet.querySelector('[data-ts-person-close]');
  if(x) x.focus();
}
let tsPersonFrom = null;
function tsPersonClose(){
  const sheet = document.getElementById('tsPersonSheet');
  if(!sheet) return;
  sheet.classList.remove('is-open');
  document.body.classList.remove('rn-evs-on');
  if(tsPersonFrom && document.body.contains(tsPersonFrom)) tsPersonFrom.focus();
  tsPersonFrom = null;
}

// From the Right Now card: open the Schedule tab on a day.
function tsShowDay(iso){
  const off = [0, 1].find(o => tsWeek(o).some(d => d.iso === iso));
  if(off === undefined) return;
  tsOffset = off;
  tsDay = iso;
  launchShowTab('schedule');
  const who = document.getElementById('tsWho');
  if(who) who.scrollIntoView({block: 'start'});
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
  // Signed in without a name on the schedule (the manager PIN, a director
  // with no office shift): no week of their own, and the box looks people up.
  const signedIn = typeof rnViewer === 'function' && rnViewer().role !== 'none';
  const mine = me && mineKey ? tsMyWeekHtml(days, me) : me ? `<section class="ts-card ts-mine"><div class="ts-card-head"><div><h3>${escapeHtml(me.person.name)}</h3><p>No shifts this week</p></div></div></section>` : signedIn ? '' : tsFindHtml(people);
  root.innerHTML = head + mine + (me || signedIn ? tsFindHtml(people, true) : '') + tsWhoHtml(days, mineKey && me ? me.person.name : '')
    + '<p class="ts-foot">From the HotSchedules schedule. If a shift looks wrong, check with a leader.</p>';
}

document.addEventListener('click', e => {
  const view = e.target.closest('#scheduleView');
  if(!view) return;
  const week = e.target.closest('[data-ts-week]');
  if(week){ tsOffset = +week.dataset.tsWeek; tsDay = null; renderTeamSchedule(); return; }
  const day = e.target.closest('[data-ts-day]');
  if(day){ tsDay = day.dataset.tsDay; renderTeamSchedule(); return; }
  const call = e.target.closest('[data-ts-call]');
  if(call){ const box = call.closest('[data-ts-off-day]'); tsCallSet(box.dataset.tsOffDay, call.dataset.tsCallName, call.dataset.tsCall); return; }
  const add = e.target.closest('[data-ts-call-add]');
  if(add){ tsAddToSetUps(add.dataset.tsCallAdd, add.dataset.tsCallSide, add.closest('[data-ts-off-day]').dataset.tsOffDay); return; }
  const person = e.target.closest('[data-ts-person]');
  if(person){ tsPersonOpen(person.dataset.tsPerson, person); return; }
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
document.addEventListener('keydown', e => {
  const person = e.target.closest && e.target.closest('#scheduleView [data-ts-person]');
  if(person && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); tsPersonOpen(person.dataset.tsPerson, person); }
});
// The Not working list stays open or closed as the leader left it.
document.addEventListener('toggle', e => { if(e.target.classList && e.target.classList.contains('ts-off')) tsOffOpen = e.target.open; }, true);
