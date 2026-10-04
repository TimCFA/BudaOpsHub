// Shared tile grid used by both Zone Reset (zones) and OE Walkthrough
// (categories) — same underlying pattern (a group of checklist items behind
// a tile that opens a modal), unified into one visual component.
function renderChecklistTiles(containerId, tiles, onClickFn, emptyMessage){
  const container = document.getElementById(containerId);
  if(!container) return;

  if(tiles === null){
    container.innerHTML = `<div class="pos-option-empty" style="width:100%;grid-column:1/-1;">${emptyMessage}</div>`;
    return;
  }

  container.innerHTML = tiles.map(t=>{
    const done = t.total > 0 && t.checked === t.total;
    const pct = t.total > 0 ? Math.round((t.checked / t.total) * 100) : 0;
    return `
      <button type="button" class="checklist-tile ${done ? 'done' : ''}" onclick="${onClickFn}(${jsArg(t.key)})">
        <div class="checklist-tile-top">
          <span class="checklist-tile-icon">${escapeHtml(t.icon || '')}</span>
          <span class="checklist-tile-check">✓</span>
        </div>
        <div class="checklist-tile-name">${escapeHtml(t.name)}</div>
        <div class="checklist-tile-progress-track"><div class="checklist-tile-progress-fill" style="width:${pct}%"></div></div>
        <div class="checklist-tile-count">${t.checked}/${t.total}</div>
      </button>
    `;
  }).join('');
}

function getZoneItems(zoneName){
  return zoneName === 'Final Check' ? FINAL_CHECK_ITEMS : (ZONE_CHECKLISTS[zoneName] || []);
}

function getZoneDayparts(){
  return zoneResetDayparts.map(dp => dp.name);
}

function getZoneCompletion(dateISO, daypart, zoneName){
  const items = getZoneItems(zoneName);
  const state = (zoneChecklistState[dateISO] && zoneChecklistState[dateISO][daypart] && zoneChecklistState[dateISO][daypart][zoneName]) || {};
  const checked = items.filter(item => state[item]).length;
  return {checked, total: items.length};
}

function getOverallCompletion(dateISO){
  let checked = 0, total = 0;
  getZoneDayparts().forEach(daypart=>{
    ALL_ZONE_NAMES.forEach(zone=>{
      const c = getZoneCompletion(dateISO, daypart, zone);
      checked += c.checked;
      total += c.total;
    });
  });
  return total > 0 ? Math.round((checked / total) * 100) : 0;
}

function recomputeChecklistHistory(dateISO){
  zoneChecklistHistory[dateISO] = {overall: getOverallCompletion(dateISO)};
}

function pruneZoneChecklistData(){
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const cutoffISO = toLocalISODate(cutoff);
  let pruned = false;
  Object.keys(zoneChecklistHistory).forEach(key=>{
    if(key < cutoffISO){
      delete zoneChecklistHistory[key];
      pruned = true;
    }
  });
  return pruned;
}

let currentChecklistZone = '';
let currentZoneDaypart = '';
let zoneHandoffChosen = false;   // a handoff tapped this visit (they all start closed; the current one is marked "now")

// Handoffs as sky banners, the same look as the Set Ups dayparts: every
// handoff down the page (Close included, no sideways scrolling), its progress
// and the Lead Captain answerable for it on the banner, tap to open. The page
// opens on the handoff happening now.
const ZR_HANDOFF_SKIES = ['morning', 'midday', 'afternoon', 'dusk', 'night'];

function zrHandoffParts(name){
  const m = name.match(/^(.*?)\s*\(([^)]*)\)$/);
  return m ? {title: m[1].replace(' to ', ' → '), time: m[2]} : {title: name, time: ''};
}

// The handoff under way now, or the next one; after the last, Close.
function zrCurrentHandoff(){
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const toMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const dp = zoneResetDayparts.find(d => mins < toMins(d.time) + 60) || zoneResetDayparts[zoneResetDayparts.length - 1];
  return dp.name;
}

// Today's Lead Captain for a handoff, from Set Ups (FOH), or ''.
function zrHandoffLead(handoff){
  const dp = fohDayparts.find(d => d.name.startsWith(handoff.leadFrom + ' ('));
  return dp ? (posAssignments['foh||' + today + '||' + dp.name + '||' + SU_LEAD_CAPTAIN] || '') : '';
}

function zrHandoffBannersHtml(kind, current, progressFor, bodyHtml){
  const nowName = zrCurrentHandoff();
  return `<div class="su-dp-list zr-dp-list">${zoneResetDayparts.map((dp, i)=>{
    const open = dp.name === current;
    const isNow = dp.name === nowName;
    const {title, time} = zrHandoffParts(dp.name);
    const {checked, total} = progressFor(dp.name);
    const done = total > 0 && checked === total;
    const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
    const sky = ZR_HANDOFF_SKIES[i] || 'midday';
    const lead = zrHandoffLead(dp);
    return `<section class="su-dp su-col-${suDaypartColor(dp.leadFrom)} ${open ? 'is-open' : ''} ${done ? 'is-done' : ''} ${isNow ? 'is-now' : ''}">
      <div class="su-dp-banner">
        <button type="button" class="su-dp-head" data-zr-handoff="${escapeHtml(dp.name)}" aria-expanded="${open}">
          <span class="su-dp-art">${suSkyArt(sky)}</span>
          <span class="su-dp-name">${escapeHtml(title)}${time ? ` <span class="su-dp-time">${escapeHtml(time)}</span>` : ''}${isNow && !done ? '<span class="zr-dp-now">now</span>' : ''}${lead ? `<span class="zr-dp-lead"><span class="su-dp-k">Lead</span> ${escapeHtml(suDisplayName(lead))}</span>` : `<span class="zr-dp-lead is-none">No Lead Captain set</span>`}</span>
          <span class="zr-dp-progress"><span class="zr-dp-track"><span class="zr-dp-bar" style="width:${pct}%"></span></span><span class="su-dp-fill">${done ? '✓ ' : ''}${checked}/${total}</span></span>
          <span class="su-dp-chev" aria-hidden="true">▾</span>
        </button>
      </div>
      ${open ? `<div class="zr-dp-body" data-zr-kind="${kind}">${bodyHtml}</div>` : ''}
    </section>`;
  }).join('')}</div>`;
}

function getHandoffZoneCompletion(dateISO, daypart){
  let checked = 0, total = 0;
  ALL_ZONE_NAMES.forEach(zone=>{
    const c = getZoneCompletion(dateISO, daypart, zone);
    checked += c.checked;
    total += c.total;
  });
  return {checked, total};
}

// Inside the open handoff, zones render as dropdown rows: tap a zone to open
// its checklist in place (one open at a time).
function renderZoneResetCard(){
  const container = document.getElementById('zoneButtonRow');
  const dayState = (zoneChecklistState[today] && zoneChecklistState[today][currentZoneDaypart]) || {};
  const zonesHtml = currentZoneDaypart ? `<div class="zone-acc">${ALL_ZONE_NAMES.map(zone=>{
    const {checked, total} = getZoneCompletion(today, currentZoneDaypart, zone);
    const done = total > 0 && checked === total;
    const open = zone === currentChecklistZone;
    const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
    const state = dayState[zone] || {};
    const body = open ? `<div class="zone-acc-body">${getZoneItems(zone).map((item, i)=>{
      const entry = state[item];
      const isChecked = !!entry;
      const stamp = isChecked ? `<span style="font-size:10px;color:var(--text-tertiary);font-style:italic;margin-left:auto;white-space:nowrap;">${escapeHtml(entry.initials)} · ${formatShortTime(entry.ts)}</span>` : '';
      return `<div class="checklist-item-elevated ${isChecked?'checked':''}" data-zone-item="${i}">
        <input type="checkbox" ${isChecked?'checked':''}>
        <span>${escapeHtml(item)}</span>
        ${stamp}
      </div>`;
    }).join('')}</div>` : '';
    return `
      <div class="zone-acc-item ${open ? 'open' : ''} ${done ? 'done' : ''}" data-zone="${escapeHtml(zone)}">
        <button type="button" class="zone-acc-head" aria-expanded="${open}">
          <span class="zone-acc-icon">${ZONE_ICONS[zone] || ''}</span>
          <span class="zone-acc-name">${escapeHtml(zone)}</span>
          <span class="zone-acc-track"><span class="zone-acc-fill" style="width:${pct}%"></span></span>
          <span class="zone-acc-count">${done ? '✓ ' : ''}${checked}/${total}</span>
          <span class="zone-acc-chevron">▾</span>
        </button>
        ${body}
      </div>`;
  }).join('')}</div>` : '';
  container.innerHTML = zrHandoffBannersHtml('zone', currentZoneDaypart, dp => getHandoffZoneCompletion(today, dp), zonesHtml);

  const overall = getOverallCompletion(today);
  const pctEl = document.getElementById('zoneOverallPct');
  pctEl.textContent = overall + '%';
  pctEl.classList.toggle('high', overall >= 95);
}

document.getElementById('zoneButtonRow').addEventListener('click', async (e)=>{
  const handoff = e.target.closest('[data-zr-handoff]');
  if(handoff){
    const name = handoff.dataset.zrHandoff;
    currentZoneDaypart = currentZoneDaypart === name ? '' : name;
    zoneHandoffChosen = true;
    currentChecklistZone = '';
    renderZoneResetCard();
    const head = [...document.querySelectorAll('#zoneButtonRow [data-zr-handoff]')].find(h => h.dataset.zrHandoff === name);
    if(currentZoneDaypart && head) head.scrollIntoView({block: 'nearest'});
    return;
  }
  const itemEl = e.target.closest('.zone-acc-item');
  if(!itemEl || !currentZoneDaypart) return;
  const zoneName = itemEl.dataset.zone;

  if(e.target.closest('.zone-acc-head')){
    currentChecklistZone = currentChecklistZone === zoneName ? '' : zoneName;
    renderZoneResetCard();
    return;
  }

  const row = e.target.closest('[data-zone-item]');
  if(!row) return;
  e.preventDefault();
  const itemText = getZoneItems(zoneName)[parseInt(row.dataset.zoneItem, 10)];
  if(itemText === undefined) return;
  const daypart = currentZoneDaypart;
  if(!zoneChecklistState[today]) zoneChecklistState[today] = {};
  if(!zoneChecklistState[today][daypart]) zoneChecklistState[today][daypart] = {};
  if(!zoneChecklistState[today][daypart][zoneName]) zoneChecklistState[today][daypart][zoneName] = {};
  const bucket = zoneChecklistState[today][daypart][zoneName];
  if(bucket[itemText]){
    delete bucket[itemText];
  } else {
    const initials = getInitials();
    if(!initials){
      showToast('Set your initials first (top right)');
      beginEditInitials();
      renderZoneResetCard();
      return;
    }
    bucket[itemText] = {initials, ts: Date.now()};
  }
  recomputeChecklistHistory(today);
  renderZoneResetCard();
  await saveState();
});

function renderZoneResetScoreboard(){
  const container = document.getElementById('zoneResetScoreboard');
  // Walk back from today skipping Sundays (always closed) so all 6 bars are
  // real open days, instead of a fixed 7-calendar-day window that wastes a
  // slot on a day the store was never open.
  const days = [];
  const cursor = new Date();
  const todayIso = toLocalISODate(cursor);
  while(days.length < 6){
    if(cursor.getDay() !== 0){
      const iso = toLocalISODate(cursor);
      const pct = zoneChecklistHistory[iso] ? zoneChecklistHistory[iso].overall : null;
      // Today is labeled "Today" and stands out, so it's clear which bar is live.
      const isToday = iso === todayIso;
      days.push({label: isToday ? 'Today' : cursor.toLocaleDateString('en-US', {weekday: 'short'}).slice(0, 1), pct, isToday});
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  days.reverse();
  container.innerHTML = days.map(d=>`
    <div class="scoreboard-day ${d.pct !== null && d.pct >= 95 ? 'star' : ''} ${d.isToday ? 'is-today' : ''}"${d.isToday ? ' aria-current="date"' : ''}>
      ${d.pct !== null && d.pct >= 95 ? '<div class="scoreboard-star">⭐</div>' : ''}
      <div class="scoreboard-day-bar-wrap"><div class="scoreboard-day-bar" style="height:${d.pct || 0}%"></div></div>
      <div class="scoreboard-day-pct">${d.pct !== null ? d.pct + '%' : '—'}</div>
      <div class="scoreboard-day-label">${d.label}</div>
    </div>
  `).join('');
}

function renderZoneResetView(){
  // Every handoff starts closed; the team opens the one they're resetting.
  if(!zoneHandoffChosen) currentZoneDaypart = '';
  renderZoneResetCard();
  renderZoneResetScoreboard();
}



products = wasteDefaultProducts();

// FOH dayparts on Analytics Hub's hours (Tim, Oct 2026): Breakfast to 10:30,
// Lunch to 1, Transition 1–2, Mid 2–5, Dinner 5–8, Close 8 to close.
const fohDayparts = [
  {name: 'Early Breakfast (6:00-8:00)', time: '6:00'},
  {name: 'Breakfast (8:00-10:30)', time: '8:00'},
  {name: 'Lunch (10:30-1:00)', time: '10:30'},
  {name: 'Transition (1:00-2:00)', time: '13:00'},
  {name: 'Mid (2:00-5:00)', time: '14:00'},
  {name: 'Dinner (5:00-8:00)', time: '17:00'},
  {name: 'Close (8:00-10:00)', time: '20:00'},
];

const bohDayparts = [
  {name: 'Early Breakfast (6:00-8:00)', time: '6:00'},
  {name: 'Breakfast (8:00-10:30)', time: '8:00'},
  {name: 'Mid (10:30-2:00)', time: '10:30'},
  {name: 'Afternoon (2:00-5:00)', time: '14:00'},
  {name: 'Dinner (5:00-8:00)', time: '17:00'},
  {name: 'Close (8:00-10:00)', time: '20:00'},
];

// FOH daypart names that changed (Oct 2026). Saved data keyed by the old
// names — assignments, coverage flags, day types, the set-up history — moves
// over when the state loads (storage.js). Keys read section||date||daypart||slot,
// section||date||daypart, or section||daypart||slot; the section decides,
// since BOH keeps an 'Afternoon (2:00-5:00)' of its own.
const SU_DAYPART_RENAMES = {
  foh: {'Breakfast (8:00-11:00)': 'Breakfast (8:00-10:30)', 'Lunch (11:00-2:00)': 'Lunch (10:30-1:00)', 'Afternoon (2:00-5:00)': 'Mid (2:00-5:00)'}
};
function suRenamedKey(key){
  const parts = String(key).split('||');
  const map = SU_DAYPART_RENAMES[parts[0]];
  if(!map) return key;
  const i = parts.findIndex((p, n) => n > 0 && map[p]);
  if(i === -1) return key;
  parts[i] = map[parts[i]];
  return parts.join('||');
}
function suMigrateDaypartNames(){
  let changed = false;
  const remap = obj => {
    if(!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(k => {
      const nk = suRenamedKey(k);
      if(nk === k) return;
      if(obj[nk] === undefined) obj[nk] = obj[k];
      delete obj[k];
      changed = true;
    });
  };
  if(typeof posAssignments !== 'undefined') remap(posAssignments);
  if(typeof posVacancyFlags !== 'undefined') remap(posVacancyFlags);
  if(typeof setupDayTypes !== 'undefined') remap(setupDayTypes);
  if(typeof setupHistory !== 'undefined' && setupHistory && Array.isArray(setupHistory.slots)){
    setupHistory.slots = setupHistory.slots.map(s => { const n = suRenamedKey(s); if(n !== s) changed = true; return n; });
  }
  return changed;
}

// leadFrom: the FOH Set Ups daypart whose Lead Captain owns this reset (the
// leader handing off), shown on the handoff's banner.
const zoneResetDayparts = [
  {name: 'Breakfast to Lunch (10:30am - 11:30am)', time: '10:30', leadFrom: 'Breakfast'},
  {name: 'Lunch to Mid (1:00pm - 2:00pm)', time: '13:00', leadFrom: 'Lunch'},
  {name: 'Mid to Dinner (4:00pm - 5:00pm)', time: '16:00', leadFrom: 'Mid'},
  {name: 'Dinner to Late Night (7:00pm - 8:00pm)', time: '19:00', leadFrom: 'Dinner'},
  {name: 'Close', time: '21:00', leadFrom: 'Close'},
];

// FOH positions per daypart, in the Google Sheet set up's priority order (top
// = most important). Set Ups lists them in this order and never lets a spot
// be skipped for one lower down.
const fohPositions = {
  'Early Breakfast (6:00-8:00)': ['iPOS 1 LANE 1', 'iPOS 2 LANE 2', 'DT Bagger 1', 'Drinks 1', 'OMD 1', 'Drinks 3 / Runner', 'Host 1'],
  'Breakfast (8:00-10:30)': ['iPOS 1 (Captain)', 'iPOS 2 LANE 2', 'DT Bagger 1', 'Drinks 1', 'OMD 1', 'Host 1', 'FC Bagger', 'Drinks 3', 'DT Bagger 2', 'iPOS 3 LANE 3', 'Runner', 'Host 2', 'Drinks 2', 'iPOS 4 LANE 1'],
  'Lunch (10:30-1:00)': ['iPOS 1 (Captain)', 'iPOS 2 LANE 1', 'iPOS 3 LANE 2', 'iPOS 4 LANE 1', 'iPOS 5 LANE 2', 'DT Bagger 1 (Cockpit Cap)', 'DT Bagger 2', 'Drinks 1', 'Drinks 2/Sample Prep', 'OMD 1', 'OMD 2', 'FC Bagger', 'Drinks 3', 'Host 1 (Captain)', 'Host 2', 'Runner', 'Surfer', 'iPOS 6 LANE 1', 'OMD 3', 'Host 3', 'Host 4', 'iPOS 7 LANE 2', 'Traffic Lane 1', 'iPOS 8 LANE 2', 'DT Bagger 4'],
  'Transition (1:00-2:00)': ['iPOS 1 (Captain)', 'iPOS 2 LANE 2', 'iPOS 3 LANE 1', 'DT Bagger 1 (Cockpit Cap)', 'FC Bagger', 'OMD 1', 'Host 1 (Captain)', 'Drinks 1', 'Drink 3', 'Runner', 'Drinks Zone', 'Bagging Zone', 'Front Counter Zone', 'Dinning Room', 'Restroom Zone', 'Lemonades', 'Pouches'],
  'Mid (2:00-5:00)': ['iPOS 1 (Captain)', 'iPOS 2 LANE 2', 'iPOS 3 LANE 1', 'DT Bagger 1', 'Drinks 1', 'OMD 1', 'Host 1', 'FC Bagger', 'Drink 3', 'Host 2', 'Runner', 'iPOS 4 LANE 2', 'DT Bagger 2', 'Drinks 2', 'Shift Lead', 'Breaks', 'iPOS 5 LANE 1', 'DT Bagger 3', 'Host 3', 'iPOS 6 LANE 3', 'iPOS 7 LANE 1', 'Traffic Lane 1', 'Desserts'],
  'Dinner (5:00-8:00)': ['iPOS 1 (Captain)', 'iPOS 2 LANE 2', 'iPOS 3 LANE 2', 'iPOS 4 LANE 1', 'iPOS 5 LANE 2', 'DT Bagger 1 (Captain)', 'DT Bagger 2', 'Drinks 1', 'Drinks 2', 'OMD 1', 'OMD 2', 'FC Bagger', 'Drinks 3', 'Host 1', 'Host 2', 'Runner', 'DT Bagger 3', 'Host 3', 'iPOS 6 LANE 3', 'OMD 3', 'iPOS 7 LANE 1', 'Traffic Lane 1', 'iPOS 8 LANE 2', 'DT Bagger 4'],
  'Close (8:00-10:00)': ['iPOS 1 LANE 1', 'iPOS 2 LANE 2', 'DT Bagger 1', 'Drinks 1', 'OMD', 'Host 1', 'FC Bagger', 'Drinks 3', 'Runner', 'Lemonades', 'Drinks Zone', 'Bagging Zone', 'Front Counter Zone', 'Outside Zone', 'Dinning Room', 'Restroom Zone', 'Floors'],
};

const bohPositions = {
  'Early Breakfast (6:00-8:00)': ['Breader', 'Primary/Machines', 'Secondary', 'Prep', 'Filters'],
  'Breakfast (8:00-10:30)': ['Breader', 'Primary/Machines', 'Secondary', 'Prep', 'Biscuit/Eggs', 'Prep 2', 'Breaks'],
  'Mid (10:30-2:00)': ['Breader1', 'Breader 2', 'Machines', 'Primary 1', 'Fries', 'Secondari 1', 'Primary 2', 'Secondari 2', 'Prep', 'Primari 3'],
  'Afternoon (2:00-5:00)': ['Breader 1', 'Machines', 'Primary 1', 'Fries', 'Secondary 1', 'Breader 2', 'Prep'],
  'Dinner (5:00-8:00)': ['Breader 1', 'Breader 2', 'Machines', 'Primary 1', 'Fries', 'Secondary 1', 'Primary 2', 'Secondary 2', 'Prep'],
  'Close (8:00-10:00)': ['Breader 1', 'Breader 2', 'Machines', 'Primary 1', 'Fries', 'Secondary 1', 'Primary 2', 'Secondary 2', 'Prep', 'Floors', 'Prep/dishes'],
};

const OE_CATEGORY_ICONS = {
  'Guest Experience': '🙂',
  'Team & Positioning': '🧭',
  'Safety & Compliance': '🛡️'
};

const fohOEChecklistData = [
  {cat: 'Guest Experience', items: [
    'Dining room tables & floors clean',
    'Restrooms clean and stocked',
    'Drive-thru timing on pace with target',
    'Order accuracy spot-checked at handoff',
    'Digital/curbside orders staged correctly'
  ]},
  {cat: 'Team & Positioning', items: [
    'Team properly positioned per set-up chart',
    'Breaks on schedule, coverage confirmed',
    'Uniform and grooming standards met'
  ]},
  {cat: 'Safety & Compliance', items: [
    'Handwashing observed at proper intervals',
    'Walkways and exits clear',
    'Equipment in working order'
  ]}
];

const fohLeaderTransitionItems = [
  'Review labor vs. guest count for next daypart',
  'Update communication board',
  'Confirm break coverage plan',
  'Walk drive-thru and confirm timer target',
  'Check dining room + restrooms',
  'Hand off open action items to incoming leader',
  'Confirm cash drawers / safe counts',
  'Review upcoming reservations / large orders'
];

let fohOEDays = [];
let fohOEStreak = 0;
let fohOEChecked = {};
let fohOECheckedDate = null;
let fohLeaderTransitionChecked = {};
let fohLeaderTransitionDate = null;

const growthTrack = [
  {role: 'Team Member', color: '#E31C23', desc: "Lives out our mission of being the most caring brand by winning the hearts of our guests everyday."},
  {role: 'Trainer', color: '#1B3A57', desc: "Develops New Hires. Foundation of leading self. Proven in 5 Key Areas — FOH/BOH. Models the 3-step D.I.R. method. Committed to developing self & others."},
  {role: 'Team Lead', color: '#2E9BC7', desc: "Develops Team Members. Foundation of leading operations. Executes systems, policies, and procedures. Organizes shifts. Supports Directors in departments."},
  {role: 'Director', color: '#8C8C8C', desc: "Develops Supervisors. Foundation of leading a department. Has an ownership mindset. Supports the Executive team in driving culture through vision, values & execution."},
  {role: 'Executive', color: '#6E2C5A', desc: "Develops leaders. Foundation of leading the organization through vision, results & culture. Maximizes profits. Protects the Chick-fil-A brand. Models ownership mindset."}
];

const eoiRoles = {
  'Trainer': {
    from: 'Team Member',
    requirements: [
      'Certified Team Member — FOH or BOH (Pathways complete)',
      "Crushing it on all PEA roles in your section",
      'Models the 3-step D.I.R. (Demonstrate, Involve, Review) training method',
      'Shows commitment to developing self and others',
      'Lives out hospitality, hustle, and humility daily'
    ]
  },
  'Team Lead': {
    from: 'Trainer',
    requirements: [
      'Trainer Certified',
      'Completed 30-Day Trainer trial successfully',
      'Comfortable executing systems, policies, and procedures',
      'Able to organize and run a shift with minimal oversight',
      'Demonstrates readiness to develop other Team Members'
    ]
  },
  'Director': {
    from: 'Team Lead',
    requirements: [
      'Team Lead Certified',
      'Completed 1-Quarter Team Lead trial successfully',
      'Demonstrates an ownership mindset over shift outcomes',
      'Ready to develop Supervisors and lead a full department',
      'Aligned with vision, values, and execution standards'
    ]
  },
  'Executive': {
    from: 'Director',
    requirements: [
      'Director Certified',
      'Completed 2-Quarter Director trial successfully',
      'Demonstrates ability to lead through vision, results & culture',
      'Focused on maximizing profits and protecting the brand',
      'Models ownership mindset at an organizational level'
    ]
  }
};

let currentEOIRole = 'Trainer';
let eoiSubmissions = [];

const fohRoster = {
  Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: []
};
const bohRoster = {
  Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: []
};

let currentPosSection = 'foh';
let breakCountdowns = {};
let completedBreaks = {};
let zoneChecklistState = {};
let zoneChecklistHistory = {};
let numbersData = {};
let lastUpdated = {};
let posAssignments = {};
let posVacancyFlags = {};

const defaultPillars = [
  {
    id: 'pillar1',
    title: 'Develop Exceptional Leaders',
    focus: 'Huddles that make it to the TM, Shift scorecarding, Zone captain rotations / execution',
    goal: '50 Leadership PEAs/QTR, PEA submissions daily',
    initiatives: 'Casey day logging, Director weekly reflection report'
  },
  {
    id: 'pillar2',
    title: 'Build and Retain A High Performing Team',
    focus: 'Leverage CARES Cash, EVP - where are we missing?, Training Guide mastery',
    goal: '15 Daily PEA Submissions, TMs love their job',
    initiatives: 'Dual submissions count as 1 (3H PEA)'
  },
  {
    id: 'pillar3',
    title: 'Deliver Operational Excellence Every Day',
    focus: 'Sub 3-minute SOS, Make speed visible to TMs',
    goal: 'Maintain Top 5% OSAT - Pursuit of 90s Club',
    initiatives: ''
  },
  {
    id: 'pillar4',
    title: 'Steward Resources with Excellence',
    focus: 'Smart Scheduling, Stewardship role, List completion - cleanliness',
    goal: 'Stay visit-ready, 90+ productivity',
    initiatives: ''
  },
  {
    id: 'pillar5',
    title: 'Grow Sales Through Care',
    focus: 'Mobile SOS down to 1:30, Convert scans - TMS, Mobile SBBA events',
    goal: '10% increase Mobile Thru by EOQ, 30% transactions',
    initiatives: 'Share remarkable moments stories'
  },
  {
    id: 'pillar6',
    title: 'Create Meaningful Guest Connections',
    focus: 'OMD hospitality - 5 seconds, Surprise & Delight moments, Daily samples',
    goal: '95% on SmartShop ACE + 2nd Mile',
    initiatives: 'Disney - guest ends interaction'
  }
];

const defaultMetrics = [
  { id: 'metric1', name: 'OSAT +2pt ≤ 20%', standard: '≤ 20%', value: '', rating: 2 },
  { id: 'metric2', name: 'Food Safety Score', standard: '1', value: '', rating: 2 },
  { id: 'metric3', name: 'Drive-Thru Ranking', standard: 'Top 100', value: '', rating: 2 },
  { id: 'metric4', name: 'Food Cost Gap', standard: '0.50%', value: '', rating: 2 },
  { id: 'metric5', name: 'Productivity', standard: '$90+', value: '', rating: 2 }
];

let lxPillars = [];
let lxMetrics = [];
let lxLastUpdated = null;

const defaultGXData = {
  wig: {
    mtdSales: {value: '$402,555', label: 'MTD Sales $'},
    mtdSalesChange: {value: '3.49%', label: 'MTD Sales Change %'},
    ytdSales: {value: '', label: 'YTD Sales $'},
    ytdSalesChange: {value: '', label: 'YTD Sales Change %'}
  },
  dt: {
    market: {value: '9', label: 'Market'},
    state: {value: '57', label: 'State'},
    chain: {value: '305', label: 'Chain'}
  },
  satisfaction: {
    highlySatisfied: {value: '82%', label: '% Highly Satisfied'},
    top5Satisfied: {value: '86%', label: 'Top 5% Highly Satisfied'},
    notSatisfied: {value: '18%', label: '% Not Satisfied'},
    foodSafety: {value: '5', label: 'Food Safety Score'}
  },
  craveable: {
    overallTaste: {value: '81%', top5: '85%', label: 'Overall Taste'},
    tasteFries: {value: '82%', top5: '85%', label: 'Taste - Fries'},
    tasteCFA: {value: '83%', top5: '85%', label: 'Taste - CFA'},
    tasteSpicy: {value: '81%', top5: '84%', label: 'Taste - Spicy'},
    tasteNuggets: {value: '87%', top5: '89%', label: 'Taste - Nuggets'},
    mostRecentQIV: {value: '97.4%', top5: '98%', label: 'Most Recent QIV'},
    tempFries: {value: '80%', top5: '85%', label: 'Temperature - Fries'},
    tempCFA: {value: '80%', top5: '85%', label: 'Temperature - CFA'},
    tempSpicy: {value: '80%', top5: '85%', label: 'Temperature - Spicy'},
    tempNuggets: {value: '80%', top5: '85%', label: 'Temperature - Nuggets'},
    portionSize: {value: '70%', top5: '80%', label: 'Portion Size'},
    smartShopScore: {value: '91%', top5: '93%', label: 'Smart Shop Score'}
  },
  service: {
    fastService: {value: '80%', top5: '85%', label: 'Fast Service'},
    speedOfService: {value: '2:59', top5: '2:45', label: 'Speed of Service'},
    orderAccuracy: {value: '95%', top5: '97%', label: 'Order Accuracy'},
    smartShopScore: {value: '92%', top5: '94%', label: 'Smart Shop Score'}
  },
  welcoming: {
    cleanliness: {value: '82%', top5: '90%', label: 'Cleanliness'},
    smartShopScore: {value: '98%', top5: '99%', label: 'Smart Shop Score'}
  },
  secondMile: {
    opportunities: [
      'Slow down to confirm orders',
      'Use guest names consistently',
      'Provide clear, confident directions to guests'
    ],
    smartShopScore: {value: '87%', label: 'Smart Shop Score'}
  },
  teamMembers: {
    coachingFocus: [
      'Respond with "My Pleasure" when thanked by guests.',
      'Consistently share a smile during interactions.'
    ],
    attentiveCourteous: {value: '84%', label: 'Attentive + Courteous Employees'},
    smartShopScore: {value: '93%', label: 'Smart Shop Score'}
  },
  lastUpdated: null
};

let gxData = JSON.parse(JSON.stringify(defaultGXData));

const defaultTXData = {
  events: [
    {id: 'evt1', name: 'Trainer Trials Begin', date: '2026-09-05'},
    {id: 'evt2', name: '90 Day Engagement', date: '2026-09-15'},
    {id: 'evt3', name: 'Team Leader Evaluations', date: '2026-09-22'},
    {id: 'evt4', name: 'Certification Exam Window', date: '2026-10-01'}
  ],
  trialTrainers: [
    {id: 'trial1', name: 'Jacob Martinez', startDate: '2026-08-15'},
    {id: 'trial2', name: 'Aurora Silva', startDate: '2026-08-18'}
  ],
  certCompetitive: [
    {id: 'cert1', name: 'Carlos Reyes', level: 'Team Leader', targetDate: '2026-09-30'},
    {id: 'cert2', name: 'Nestor Campos', level: 'Trainer', targetDate: '2026-10-15'}
  ],
  celebrations: [
    {id: 'celeb1', name: 'Ki Rodriguez', date: '08-15', type: 'birthday'},
    {id: 'celeb2', name: 'Traci Danmeyer', date: '08-22', type: 'anniversary'},
    {id: 'celeb3', name: 'Ashley Ramirez', date: '08-28', type: 'birthday'}
  ],
  lastUpdated: null
};

let txData = JSON.parse(JSON.stringify(defaultTXData));

// Home screen quotes. Every one is checked against a published source
// (Chick-fil-A's own pages, S. Truett Cathy's books, or the leadership team's
// books); nothing is paraphrased. Add new ones only with a source.
const TRUETT = 'S. Truett Cathy';
const homeQuotes = [
  {text: "Food is essential to life. Therefore, make it good.", author: TRUETT, source: "On the wall of Chick-fil-A restaurants"},
  {text: "We should be about more than just selling chicken. We should be a part of our customers' lives and the communities in which we serve.", author: TRUETT, source: "Chick-fil-A, Who We Are"},
  {text: "How do you know someone needs encouragement? If they're breathing.", author: TRUETT, source: "Chick-fil-A founder"},
  {text: "If you're not having fun, you're not doing it right.", author: TRUETT, source: "Chick-fil-A founder"},
  {text: "If we're willing to do that for the president, why not treat every customer that well?", author: TRUETT, source: "Eat Mor Chikin: Inspire More People"},
  {text: "Nearly every moment of every day we have the opportunity to give something to someone else – our time, our love, our resources.", author: TRUETT, source: "Eat Mor Chikin: Inspire More People"},
  {text: "I delivered each paper as if I were delivering it to the front door of the governor's mansion.", author: TRUETT, source: "On his first job, delivering newspapers"},
  {text: "We built our business and made friends at the same time, always seeking to meet their needs wherever we could.", author: TRUETT, source: "Chick-fil-A founder"},
  {text: "You expect that from a five-star hotel. But to have teenagers in a fast-food atmosphere saying it's their pleasure to serve—that's a real head-turner.", author: TRUETT, source: "On \u201cMy pleasure\u201d"},
  {text: "It's easier to build boys and girls than to mend men and women.", author: TRUETT, source: "It's Better to Build Boys Than Mend Men"},
  {text: "I'd like to be remembered as one who kept my priorities in the right order.", author: TRUETT, source: "Chick-fil-A founder"},
  {text: "We live in a changing world, but we need to be reminded that the important things have not changed.", author: TRUETT, source: "Chick-fil-A founder"},

  {text: "Others control our opportunities, we control our readiness.", author: "Mark Miller", source: "The Heart of Leadership"},
  {text: "When you expect the best from people, you will often see more in them than they see in themselves.", author: "Mark Miller", source: "The Heart of Leadership"},
  {text: "You can lead with or without a title. If you wait until you get a title, you may wait forever.", author: "Mark Miller", source: "The Heart of Leadership"},
  {text: "The best leaders don't blame others. They own their actions and their outcomes.", author: "Mark Miller", source: "The Heart of Leadership"},
  {text: "Getting the right plate to the right person at the right table is service. But genuinely engaging with the person you're serving, so you can make an authentic connection—that's hospitality.", author: "Will Guidara", source: "Unreasonable Hospitality"},
  {text: "A leader's responsibility is to identify the strengths of the people on their team, no matter how buried those strengths might be.", author: "Will Guidara", source: "Unreasonable Hospitality"},
  {text: "It is teamwork that remains the ultimate competitive advantage, both because it is so powerful and so rare.", author: "Patrick Lencioni", source: "The Five Dysfunctions of a Team"},
  {text: "Do what the customer loves, and the money will follow.", author: "Horst Schulze", source: "Excellence Wins"},
  {text: "If you want to change the world, start off by making your bed.", author: "Admiral William H. McRaven", source: "Make Your Bed"},
  {text: "If you want to change the world, get over being a sugar cookie and keep moving forward.", author: "Admiral William H. McRaven", source: "Make Your Bed"},
  {text: "Good is the enemy of great.", author: "Jim Collins", source: "Good to Great"},
  {text: "If you're not keeping score, you're just practicing.", author: "McChesney, Covey & Huling", source: "The 4 Disciplines of Execution"},
  {text: "To achieve a goal you've never achieved before, you must do things you've never done before.", author: "McChesney, Covey & Huling", source: "The 4 Disciplines of Execution"},
  {text: "Fix what bugs you.", author: "Paul Akers", source: "2 Second Lean"},
  {text: "Leadership is not a rank, it is a responsibility. Leadership is not about being in charge, it is about taking care of those in your charge.", author: "Simon Sinek", source: "Leaders Eat Last"},
  {text: "Leaders are not responsible for the results, leaders are responsible for the people who are responsible for the results.", author: "Simon Sinek", source: "The Infinite Game"},
  {text: "There is a difference between a group of people who work together and a group of people who trust each other.", author: "Simon Sinek", source: "The Infinite Game"},
  {text: "To ask, 'What's best for me' is finite thinking. To ask, 'What's best for us' is infinite thinking.", author: "Simon Sinek", source: "The Infinite Game"},
  {text: "You do not rise to the level of your goals. You fall to the level of your systems.", author: "James Clear", source: "Atomic Habits"},
  {text: "Every action you take is a vote for the type of person you wish to become.", author: "James Clear", source: "Atomic Habits"},
  {text: "Leaders who refuse to listen will eventually be surrounded by people who have nothing helpful to say.", author: "Andy Stanley", source: "Andy Stanley Leadership Podcast"},
  {text: "What we want to hear least is generally what we need to hear most.", author: "Andy Stanley", source: "Andy Stanley Leadership Podcast"}
];

// A different quote every time the site is opened: each device remembers its
// place in the list and moves one on at every load, so the quotes cycle
// through instead of starting over at the top. The first open on a device
// starts at a random spot. Tapping the quote shows the next one.
const HOME_QUOTE_KEY = 'cfaBudaQuoteIdx';
let homeQuoteIndex = (()=>{
  let i = NaN;
  try{ i = parseInt(localStorage.getItem(HOME_QUOTE_KEY), 10); }catch(e){ /* storage blocked */ }
  if(!(i >= 0)) i = Math.floor(Math.random() * homeQuotes.length);
  i = i % homeQuotes.length;
  try{ localStorage.setItem(HOME_QUOTE_KEY, String((i + 1) % homeQuotes.length)); }catch(e){ /* fine */ }
  return i;
})();
function homeQuoteCurrent(){ return homeQuotes[homeQuoteIndex % homeQuotes.length]; }
function homeQuoteNext(){
  homeQuoteIndex = (homeQuoteIndex + 1) % homeQuotes.length;
  try{ localStorage.setItem(HOME_QUOTE_KEY, String((homeQuoteIndex + 1) % homeQuotes.length)); }catch(e){ /* fine */ }
}

const defaultHomeData = {
  vision: "***To be the most caring brand in Buda!***\n\nTo give back more, we are focused on growing our influence within our team, business and community through caring!",
  mission: "***WINNING HEARTS EVERY DAY***\n\nWe want to create and foster a culture of connecting every team member's everyday to the shared mission of winning hearts every day.",
  values: "• ***Hospitality*** — Serving with warmth, care, and an others-first mindset. Making everyone feel seen, valued, and welcomed.\n• ***Hustle*** — Working with urgency, energy, and focus. Moving fast without rushing, and striving for excellence.\n• ***Humility*** — Being receptive to feedback with a team-first mindset. Eager to grow while choosing integrity and putting others before self.",
  wins: [
    {id: 'win1', name: 'Casey', role: 'Executive', content: ''},
    {id: 'win2', name: 'Ki', role: 'BOH Director', content: ''},
    {id: 'win3', name: 'Tim', role: 'FOH Director', content: ''}
  ],
  lastUpdated: null
};

let homeData = JSON.parse(JSON.stringify(defaultHomeData));
