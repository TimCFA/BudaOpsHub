// ===== ZONE RESETS: THE PAGE (Tim, Nov 23 2026) =====
// "A lot of information and nothing stands out": the page was one long
// accordion, handoffs that opened into nine zone rows that opened into their
// lists, and it opened itself on the handoff happening now. Now it's three
// steps, each one screen, in Home's language (the banner, the tiles, a small
// label over the words that matter; right-now.js, "The look"):
//   1. The day: the five handoffs, always in the day's order, so each one is
//      always in the same place. Each wears its time of day (its sky and its
//      start time) and says where it stands: done, now, next, not finished.
//      Nothing opens by itself; the one that's up is the bigger card.
//   2. A handoff (a tap): its zones as tiles, who owns each, how far along.
//   3. A zone (a tap): its list on a sheet, with big rows to tick.
// Kept from before: a zone's last tick closes it and says what's left (Tim,
// Oct 18 2026); a zone nobody owns is red and asks for someone; Home's "zone"
// lines open their handoff here (right-now.js rnGo). Changed at Tim's ask:
// the page no longer opens on the current handoff, and the handoffs no longer
// move with the clock (Oct 18 2026: the current one first).
//
// Two views of the same three steps (Tim, Nov 23 2026: "reduce as much noise
// for team members as possible"). Leaders (Team Leads and up, zrLeaderView)
// get the whole picture: the day's share done, the Lead Captain, what needs
// someone in red (no Lead Captain, zones with nobody, a handoff not
// finished), Hand off, who ticked what. Everyone else
// (Team Members, Trainers, a device nobody signed in on) gets only what they
// act on: the handoffs and where each stands, their own zone first and
// marked, the zones, the list. No red but "now", no counts of what's wrong,
// no Hand off. The last six days and their star are for everyone (Tim: the
// team should see them).
//
// The helpers it reads (who owns a zone, how complete, the current handoff)
// stay in zone-reset.js, which Home and Set Ups load first; this file comes
// with the rest.

const ZR_ICON_BACK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
const ZR_ICON_GO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const ZR_ICON_CHECK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ZR_ICON_X = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ZR_ICON_HIST = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 20V11M12 20V4M19 20v-6"/></svg>';
const ZR_ICON_STAR = '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z"/></svg>';
const ZR_STAR = 95;                 // a day at 95% or more earns its star

let zrPageDay = typeof today !== 'undefined' ? today : '';   // a new day starts back on the list
let zrSheetReturn = null;                                     // the tile that opened the sheet: focus goes back to it
let zrEnter = true;                                           // the cards rise in when the page opens or changes step, never on a redraw
function zrArrive(){ zrEnter = true; }                        // navigation.js: the Lists tab was opened

function zrMins(t){ const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); }
// 780 → "1:00"
function zrClock(min){ const h = Math.floor(min / 60) % 24, m = min % 60; return `${h % 12 || 12}:${String(m).padStart(2, '0')}`; }
// 100 → "1 h 40 min"
function zrDur(min){ const m = Math.max(0, Math.round(min)); return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`; }
function zrBar(part, tone){
  const pct = Math.round(Math.max(0, Math.min(1, part)) * 100);
  return `<span class="rn-bar${tone ? ' is-' + tone : ''}" aria-hidden="true"><i style="width:${pct}%"></i></span>`;
}
// Leaders see the whole picture: Team Leads and up, and a manager session
// (the same people the Safe Count shows to; fohoe-and-safecount.js scHidden).
function zrLeaderView(){
  if(typeof launchManager !== 'undefined' && launchManager) return true;
  return typeof acUser !== 'undefined' && !!acUser && !['member', 'trainer'].includes(acUser.role);
}
// Whether the person signed in is one of a zone's owners (names from the PIN
// list and Set Ups can differ by a middle name: right-now.js rnSame).
function zrIsMine(owners){
  const me = typeof acUser !== 'undefined' && acUser && acUser.name ? acUser.name : '';
  if(!me) return false;
  const same = typeof rnSame === 'function' ? rnSame : (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  return owners.some(n => same(n, me));
}
function zrMyZones(handoffName){
  return ALL_ZONE_NAMES.filter(z => zrIsMine(zrZoneOwners(today, handoffName, z).all));
}
function zrInitials(name){
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((w[0] || '').charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : '')).toUpperCase();
}

// Every handoff of the day, in the day's order, with where it stands at
// `nowMin` minutes past midnight:
//   done    every item of every zone ticked
//   now     inside its hour
//   behind  its hour is over and it isn't done (Close runs to the end of the day)
//   next    the first one still to come, when none is on now
//   later   the ones after that
// `up` marks the one card that's bigger: the one on now, else the next.
function zrDay(date, nowMin){
  const list = zoneResetDayparts.map((dp, i) => {
    const start = zrMins(dp.time), end = i === zoneResetDayparts.length - 1 ? 1440 : start + 60;
    const zones = ALL_ZONE_NAMES.map(z => getZoneCompletion(date, dp.name, z));
    const checked = zones.reduce((s, c) => s + c.checked, 0), total = zones.reduce((s, c) => s + c.total, 0);
    const done = total > 0 && checked === total;
    const state = done ? 'done' : nowMin >= start && nowMin < end ? 'now' : nowMin >= end ? 'behind' : 'later';
    return {dp, i, start, end, checked, total, done, state, zonesDone: zones.filter(c => c.total > 0 && c.checked === c.total).length, zonesTotal: zones.length};
  });
  if(!list.some(h => h.state === 'now')){
    const next = list.find(h => h.state === 'later');
    if(next) next.state = 'next';
  }
  list.forEach(h => { h.up = h.state === 'now' || h.state === 'next'; });
  return list;
}

// The small label over a handoff's name: where it stands.
function zrStateLabel(h, nowMin){
  if(h.state === 'done') return 'Done';
  if(h.state === 'now') return h.end < 1440 ? `Now · until ${zrClock(h.end)}` : 'Now';
  if(h.state === 'next') return `Next · in ${zrDur(h.start - nowMin)}`;
  if(h.state === 'behind') return 'Not finished';
  return '';
}

function zrHandoffFacts(h){
  const lead = zrHandoffLead(h.dp);
  const setUp = zrSetupExists(today, h.dp.name);
  const unowned = !h.done && setUp ? zrUnownedZones(today, h.dp.name).length : 0;
  return {lead, setUp, unowned};
}

// ----- 1. The day -----
function zrDayHtml(nowMin){
  const list = zrDay(today, nowMin);
  const leader = zrLeaderView();
  const overall = getOverallCompletion(today);
  const cards = list.map(h => {
    const {title} = zrHandoffParts(h.dp.name);
    const {lead, unowned} = zrHandoffFacts(h);
    const label = zrStateLabel(h, nowMin);
    const busy = h.up || h.state === 'behind';
    const count = h.checked || busy || h.done ? `${h.zonesDone} of ${h.zonesTotal} zones` : '';
    // The cards still to come stay quiet: a name, a time, a leader if there is one.
    // The team's card says their own zone instead, and never what's wrong.
    const mine = leader || h.done ? [] : zrMyZones(h.dp.name);
    const meta = leader ? escapeHtml([count, lead ? `Lead ${suDisplayName(lead)}` : ''].filter(Boolean).join(' · '))
      : mine.length ? `Your zone${mine.length === 1 ? '' : 's'}: <b>${escapeHtml(mine.join(', '))}</b>` : escapeHtml(count);
    const flags = leader && busy ? [!lead ? 'No Lead Captain yet' : '', unowned ? `${unowned} zone${unowned === 1 ? '' : 's'} with nobody` : ''].filter(Boolean) : [];
    const behind = leader && h.state === 'behind';
    return `<button type="button" class="zr-h su-col-${suDaypartColor(h.dp.leadFrom)} is-${h.state === 'behind' && !leader ? 'past' : h.state}${h.up ? ' is-up' : ''}" data-zr-handoff="${escapeHtml(h.dp.name)}">
        <span class="zr-h-sky">${suSkyArt(ZR_HANDOFF_SKIES[h.i] || 'midday')}<b>${zrClock(h.start)}</b></span>
        <span class="zr-h-main">
          ${label ? `<small class="zr-h-k">${h.state === 'done' ? ZR_ICON_CHECK : ''}${escapeHtml(label)}</small>` : ''}
          <b class="zr-h-name">${escapeHtml(title)}</b>
          ${meta ? `<span class="zr-h-meta${mine.length ? ' zr-h-mine' : ''}">${meta}</span>` : ''}
          ${flags.map(f => `<span class="zr-h-flag">${escapeHtml(f)}</span>`).join('')}
          ${h.checked && !h.done || busy ? zrBar(h.total ? h.checked / h.total : 0, behind ? 'bad' : '') : ''}
        </span>
        <span class="zr-h-go">${ZR_ICON_GO}</span>
      </button>`;
  }).join('');
  return `<div class="zr-top">
      <h2 class="rn-kicker">Zone resets · today</h2>
      ${leader ? `<span class="zr-pct${overall >= ZR_STAR ? ' is-high' : ''}"><b>${overall}%</b> done</span>` : ''}
    </div>
    <div class="zr-list">${cards}</div>
    ${zrHistoryHtml()}`;
}

// The last six open days (Sundays are closed), today last: the day's share
// done, a star at 95% or more.
function zrHistoryDays(){
  const days = [], cursor = new Date(), todayIso = toLocalISODate(cursor);
  while(days.length < 6){
    if(cursor.getDay() !== 0){
      const iso = toLocalISODate(cursor);
      days.push({label: iso === todayIso ? 'Today' : cursor.toLocaleDateString('en-US', {weekday: 'short'}), pct: zoneChecklistHistory[iso] ? zoneChecklistHistory[iso].overall : null, isToday: iso === todayIso});
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return days.reverse();
}
function zrHistoryHtml(){
  return `<section class="rn-pea zr-hist" aria-label="Zone resets, the last 6 days">
      <div class="rn-pea-head"><span>${ZR_ICON_HIST}Last 6 days</span><small>${ZR_STAR}% or more earns a star</small></div>
      <div class="zr-hist-grid">${zrHistoryDays().map(d => `<div class="zr-hist-cell${d.pct !== null && d.pct >= ZR_STAR ? ' is-star' : ''}${d.isToday ? ' is-today' : ''}"${d.isToday ? ' aria-current="date"' : ''}>
          <span>${d.pct !== null && d.pct >= ZR_STAR ? ZR_ICON_STAR : ''}${escapeHtml(d.label)}</span><b>${d.pct !== null ? d.pct + '%' : '–'}</b></div>`).join('')}</div>
    </section>`;
}

// ----- 2. A handoff: its zones -----
function zrHandoffHtml(h, nowMin){
  const {title, time} = zrHandoffParts(h.dp.name);
  const {lead, setUp} = zrHandoffFacts(h);
  const leader = zrLeaderView();
  const label = [zrStateLabel(h, nowMin), time].filter(Boolean).join(' · ');
  const tone = h.done ? 'ok' : leader && h.state === 'behind' ? 'bad' : '';
  const zones = ALL_ZONE_NAMES.map(zone => {
    const owners = zrZoneOwners(today, h.dp.name, zone);
    return {zone, owners, mine: !leader && zrIsMine(owners.all)};
  });
  // The team's own zones come first, marked; nobody's zone is a leader's to see.
  const tiles = zones.filter(z => z.mine).concat(zones.filter(z => !z.mine)).map(({zone, owners, mine}) => {
    const {checked, total} = getZoneCompletion(today, h.dp.name, zone);
    const done = total > 0 && checked === total;
    const none = leader && setUp && !owners.all.length && !done;
    const others = mine ? owners.all.filter(n => !zrIsMine([n])) : owners.all;
    const who = mine ? `Your zone${others.length ? ` · with ${others.map(suDisplayName).join(', ')}` : ''}`
      : owners.all.length ? owners.all.map(suDisplayName).join(', ') : none ? 'Nobody yet · tap to pick' : !leader || setUp || done ? '' : `No ${owners.dp ? suShortDaypart(owners.dp.name) : ''} set up yet`;
    return `<button type="button" class="rn-tile zr-zone${done ? ' is-ok' : none ? ' is-bad' : ''}${mine ? ' is-mine' : ''}" data-zone="${escapeHtml(zone)}">
        <span class="zr-zone-top"><i class="rn-ic${done ? ' is-ok' : ''}">${done ? ZR_ICON_CHECK : ZONE_ICONS[zone] || ''}</i><b class="zr-zone-n">${checked}/${total}</b></span>
        <span class="rn-tile-l">${escapeHtml(zone)}</span>
        ${who ? `<small class="rn-tile-d">${escapeHtml(who)}</small>` : ''}
        ${zrBar(total ? checked / total : 0, done ? 'ok' : none ? 'bad' : '')}
      </button>`;
  }).join('');
  return `<button type="button" class="zr-back" data-zr-back>${ZR_ICON_BACK}All handoffs</button>
    <div class="rn-hero zr-hero su-col-${suDaypartColor(h.dp.leadFrom)}${tone ? ' is-' + tone : ''}">
      <span class="zr-hero-sky">${suSkyArt(ZR_HANDOFF_SKIES[h.i] || 'midday')}</span>
      <span class="rn-hero-b">
        ${label ? `<small>${escapeHtml(label)}</small>` : ''}
        <span class="rn-hero-big">${escapeHtml(title)}</span>
        <span class="rn-hero-sub">${escapeHtml([`${h.zonesDone} of ${h.zonesTotal} zones reset`, !leader ? '' : lead ? `Lead ${suDisplayName(lead)}` : h.done ? '' : 'No Lead Captain yet'].filter(Boolean).join(' · '))}</span>
        ${zrBar(h.total ? h.checked / h.total : 0)}
      </span>
    </div>
    <div class="rn-tiles zr-zones">${tiles}</div>`;
}

// ----- 3. A zone: its list, on a sheet -----
function zrSheetHtml(handoffName, zone){
  const {title} = zrHandoffParts(handoffName);
  const items = getZoneItems(zone);
  const state = ((zoneChecklistState[today] || {})[handoffName] || {})[zone] || {};
  const {checked, total} = getZoneCompletion(today, handoffName, zone);
  const owners = zrZoneOwners(today, handoffName, zone);
  const leader = zrLeaderView();
  const none = leader && zrSetupExists(today, handoffName) && !owners.all.length;
  const who = none ? '<span class="zr-owner-none">Nobody owns this reset</span>'
    : owners.all.length ? owners.all.map(n => `<span class="zr-owner${owners.added.includes(n) ? ' is-added' : ''}"><i>${escapeHtml(zrInitials(n))}</i>${escapeHtml(suDisplayName(n))}</span>`).join('')
    : leader ? `<span class="zr-owner-wait">No ${owners.dp ? escapeHtml(suShortDaypart(owners.dp.name)) : ''} set up yet</span>` : '';
  // Handing a zone to someone, and who ticked what, are a leader's (the team just ticks).
  const hand = leader ? `<button type="button" class="zr-owner-hand" data-zr-hand>${owners.all.length ? 'Hand off' : 'Pick someone'}</button>` : '';
  return `<div class="su-pick-head">
      <div class="su-pick-titles"><span class="su-pick-kicker">${escapeHtml(title)} · reset</span><h2 id="zrSheetTitle">${escapeHtml(zone)}</h2></div>
      <button type="button" class="su-sheet-close" data-zr-sheet-close aria-label="Close">${ZR_ICON_X}</button>
    </div>
    <div class="zr-sheet-prog"><b>${checked} of ${total}</b>${zrBar(total ? checked / total : 0, total && checked === total ? 'ok' : '')}</div>
    ${who || hand ? `<div class="zr-owners${none ? ' is-none' : ''}">${who}${hand}</div>` : ''}
    <div class="zr-items">${items.map((item, i) => {
      const entry = state[item];
      return `<button type="button" class="zr-item${entry ? ' is-on' : ''}" data-zone-item="${i}" role="checkbox" aria-checked="${!!entry}">
          <i class="zr-box">${ZR_ICON_CHECK}</i><span class="zr-item-t">${escapeHtml(item)}</span>${entry && leader ? `<small>${escapeHtml(entry.initials)} · ${escapeHtml(formatShortTime(entry.ts))}</small>` : ''}
        </button>`;
    }).join('')}</div>
    <div class="su-pick-foot"><button type="button" class="zr-done" data-zr-sheet-close>Done</button></div>`;
}

// ----- Drawing -----
function renderZoneResetCard(){
  const root = document.getElementById('zoneButtonRow');
  if(!root) return;
  if(zrPageDay !== today){ zrPageDay = today; currentZoneDaypart = ''; currentChecklistZone = ''; }
  const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
  const h = currentZoneDaypart ? zrDay(today, nowMin).find(x => x.dp.name === currentZoneDaypart) : null;
  if(!h){ currentZoneDaypart = ''; currentChecklistZone = ''; }
  if(h && !ALL_ZONE_NAMES.includes(currentChecklistZone)) currentChecklistZone = '';
  root.className = `zr-page${h ? ' is-handoff' : ''}${zrLeaderView() ? '' : ' is-team'}${zrEnter ? ' zr-enter' : ''}`;
  zrEnter = false;
  root.innerHTML = h ? zrHandoffHtml(h, nowMin) : zrDayHtml(nowMin);
  const sheet = document.getElementById('zrZoneSheet');
  if(!sheet) return;
  const open = !!(h && currentChecklistZone);
  if(open) document.getElementById('zrSheetBody').innerHTML = zrSheetHtml(h.dp.name, currentChecklistZone);
  sheet.classList.toggle('active', open);
}
function renderZoneResetView(){ renderZoneResetCard(); }

function zrCloseSheet(){
  currentChecklistZone = '';
  renderZoneResetCard();
  const back = zrSheetReturn && [...document.querySelectorAll('#zoneButtonRow [data-zone]')].find(t => t.dataset.zone === zrSheetReturn);
  zrSheetReturn = null;
  if(back) back.focus();
}

document.getElementById('zoneButtonRow').addEventListener('click', e => {
  const handoff = e.target.closest('[data-zr-handoff]');
  if(handoff || e.target.closest('[data-zr-back]')){
    currentZoneDaypart = handoff ? handoff.dataset.zrHandoff : '';
    currentChecklistZone = '';
    zrEnter = true;
    renderZoneResetCard();
    const card = document.getElementById('zoneResetCard');
    if(card) card.scrollIntoView({block: 'start'});
    return;
  }
  const tile = e.target.closest('[data-zone]');
  if(!tile || !currentZoneDaypart) return;
  currentChecklistZone = tile.dataset.zone;
  zrSheetReturn = currentChecklistZone;
  renderZoneResetCard();
  const x = document.querySelector('#zrZoneSheet [data-zr-sheet-close]');
  if(x) x.focus();
});

document.getElementById('zrZoneSheet').addEventListener('click', async e => {
  if(e.target === e.currentTarget || e.target.closest('[data-zr-sheet-close]')){ zrCloseSheet(); return; }
  const zoneName = currentChecklistZone, daypart = currentZoneDaypart;
  if(!zoneName || !daypart) return;
  if(e.target.closest('[data-zr-hand]')){ if(zrLeaderView()) zrOpenOwnerModal(today, daypart, zoneName, renderZoneResetCard); return; }
  const row = e.target.closest('[data-zone-item]');
  if(!row) return;
  const itemText = getZoneItems(zoneName)[parseInt(row.dataset.zoneItem, 10)];
  if(itemText === undefined) return;
  if(!zoneChecklistState[today]) zoneChecklistState[today] = {};
  if(!zoneChecklistState[today][daypart]) zoneChecklistState[today][daypart] = {};
  if(!zoneChecklistState[today][daypart][zoneName]) zoneChecklistState[today][daypart][zoneName] = {};
  const bucket = zoneChecklistState[today][daypart][zoneName];
  if(bucket[itemText]){
    delete bucket[itemText];
  } else {
    const initials = getInitials();
    if(!initials){
      showToast('Sign in first (top right)');
      beginEditInitials();
      return;
    }
    bucket[itemText] = {initials, ts: Date.now()};
    zrNoteZoneDone(daypart, zoneName);
  }
  recomputeChecklistHistory(today);
  renderZoneResetCard();
  await saveState();
});
document.addEventListener('keydown', e => {
  const sheet = document.getElementById('zrZoneSheet');
  if(e.key === 'Escape' && sheet && sheet.classList.contains('active') && !document.getElementById('zrOwnerModal').classList.contains('active')) zrCloseSheet();
});

// The minute moves on ("Next · in 40 min", "Now"): keep the page current
// while it's the one showing. The sheet keeps its place.
setInterval(() => {
  const view = document.getElementById('zoneresetView');
  if(document.visibilityState === 'visible' && view && view.classList.contains('active')) renderZoneResetCard();
}, 60000);

// The last tick of a zone closes it and says what's left of the handoff
// (Tim, Oct 18 2026), so nobody scrolls past a finished list.
function zrNoteZoneDone(daypart, zoneName){
  const {checked, total} = getZoneCompletion(today, daypart, zoneName);
  if(!total || checked < total) return;
  currentChecklistZone = '';
  zrSheetReturn = null;
  const left = ALL_ZONE_NAMES.filter(z => { const c = getZoneCompletion(today, daypart, z); return c.total && c.checked < c.total; });
  const {title} = zrHandoffParts(daypart);
  showToast(left.length ? `${zoneName} reset ✓ · ${left.length} zone${left.length === 1 ? '' : 's'} left` : `${title}: every zone reset ✓`);
}

// ----- The owner sheet: hand a zone's reset to someone -----
// Lists everyone on the FOH roster during the handoff's daypart, with the
// spot they're working; a tap hands them the zone (on top of whoever holds
// its positions). "Back to the positions only" drops the hand-offs.
let zrOwnerCtx = null;   // {date, handoff, zone, onChange}

function zrOpenOwnerModal(date, handoffName, zone, onChange){
  zrOwnerCtx = {date, handoff: handoffName, zone, onChange};
  zrRenderOwnerModal();
  document.getElementById('zrOwnerModal').classList.add('active');
}

function zrCloseOwnerModal(){
  zrOwnerCtx = null;
  document.getElementById('zrOwnerModal').classList.remove('active');
}

function zrRenderOwnerModal(){
  if(!zrOwnerCtx) return;
  const {date, handoff, zone} = zrOwnerCtx;
  const o = zrZoneOwners(date, handoff, zone);
  const {title} = zrHandoffParts(handoff);
  document.getElementById('zrOwnerKicker').textContent = `${title} · reset`;
  document.getElementById('zrOwnerZone').textContent = zone;
  const dpIndex = o.dp ? fohDayparts.findIndex(d => d.name === o.dp.name) : -1;
  const prefix = o.dp ? 'foh||' + date + '||' + o.dp.name + '||' : '';
  const spotOf = name => {
    if(!o.dp) return '';
    const lo = name.trim().toLowerCase();
    if(suSplitNames(posAssignments[prefix + SU_LEAD_CAPTAIN]).some(n => n.toLowerCase() === lo)) return 'Lead Captain';
    const slot = (fohPositions[o.dp.name] || []).find(sl => suSplitNames(posAssignments[prefix + sl]).some(n => n.toLowerCase() === lo));
    return slot || 'not placed';
  };
  let people = [];
  if(dpIndex !== -1){
    const {startMin, endMin} = daypartTimeWindow(fohDayparts, dpIndex);
    people = (fohRoster[date] || []).filter(p => rosterOverlaps(p, startMin, endMin)).map(p => p.name);
  }
  const have = new Set(o.all.map(n => n.toLowerCase()));
  people = people.filter(n => !have.has(n.trim().toLowerCase())).sort((a, b) => a.localeCompare(b));
  const note = document.getElementById('zrOwnerNote');
  note.textContent = o.all.length
    ? `Owned by ${o.all.map(suDisplayName).join(', ')}. Pick someone to add; the position keeps it too.`
    : `The position that owns this reset is open${o.dp ? ` in the ${suShortDaypart(o.dp.name)} set up` : ''}. Pick someone on the clock.`;
  note.classList.toggle('is-none', !o.all.length);
  document.getElementById('zrOwnerOptions').innerHTML = people.length
    ? people.map(n => `<button type="button" class="pos-option" data-zr-pick="${escapeHtml(n)}"><span class="pos-option-who"><span class="pos-option-name">${escapeHtml(n)}</span></span><span class="pos-option-tag">${escapeHtml(spotOf(n))}</span></button>`).join('')
    : `<div class="pos-option-empty">${o.dp ? 'Nobody else on the roster is here for this handoff' : 'No roster for this day yet'}</div>`;
  document.getElementById('zrOwnerFoot').innerHTML = o.added.length ? `<button type="button" class="su-btn-line" data-zr-unhand="1">Back to the positions only</button>` : '';
}

document.getElementById('zrOwnerModal').addEventListener('click', async (e)=>{
  if(!zrOwnerCtx) return;
  if(e.target === e.currentTarget || e.target.closest('#zrOwnerClose')){ zrCloseOwnerModal(); return; }
  const pick = e.target.closest('[data-zr-pick]');
  const unhand = e.target.closest('[data-zr-unhand]');
  if(!pick && !unhand) return;
  const {date, handoff, zone, onChange} = zrOwnerCtx;
  if(pick){
    zrHandZone(date, handoff, zone, pick.dataset.zrPick);
    showToast(`${suDisplayName(pick.dataset.zrPick)} has ${zone}`);
  } else {
    zrUnhandZone(date, handoff, zone);
  }
  zrCloseOwnerModal();
  if(onChange) onChange();
  await saveState();
});
