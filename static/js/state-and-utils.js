const SHEET_TITLE = 'CFA Buda Waste Log';
let currentSection = 'foh';
let launchMode;   // undefined = on (the team sees the essentials only); false = off
let entries = [];
let products = [];
let deletedProductIds = []; // ids of default products the user has explicitly removed — never re-added on load
// One-time fixes to saved product lists (see loadState). Bump when adding one;
// a fresh install starts current so the fixes never touch it.
const PRODUCT_FIXES_VERSION = 8;
let productFixesVersion = PRODUCT_FIXES_VERSION;
// Left over from the old Log Waste list (category order per side); still a
// saved key, no longer read. Tracker categories follow WASTE_CAT_ORDER.
let productCategoryOrder = {foh: [], boh: []};
let wasteTarget = 100;
const safeTarget = 4500; // hardcoded — this value never changes, no UI to edit it
let safeCounts = [];
let formDone = false;
let foodSafetyDays = [];
let wasteDays = [];
let rosterPosted = {};   // {date: {foh: [...], boh: [...], at}}: each day's posted schedule (roster-changes.js)
let truckShifts = {};    // {date: [{name, start, end, source: 'schedule' | 'manual', addedBy, addedAt}]}: who's doing truck (truck.js)
let uniformOrders = [];  // uniform orders, newest last (uniform-orders.js); manager sessions only
// Accountability points (points.js), manager sessions only:
// pointsRecords {quarter: {tm: {tm, tmName, events: [...]}}}, pointsUploads
// [{at, by, file, range, runDate, coversTo, added, quarter}] newest first,
// pointsSettings (the rules: graces, break length, quarter), pointsTeam
// {tm: {lang}} (message language), pointsMemos {id: memo} (HR documentation).
let pointsRecords = {};
let pointsUploads = [];
let pointsSettings = {};
let pointsTeam = {};
let pointsMemos = {};
let uniformCatalog = null; // the order form's items; null until a manager edits: UNIFORM_SEED shows
let directors = null;    // [{name, title}] the director team (directors.js); null until edited: DIRECTORS_SEED
let adminShifts = {};    // {date: [{name, start, end}]}: Administrative shifts from the roster import (directors' time)
let leaderNotes = {};    // {leader name: [{text, by, ts, date, type, pec}]}: directors' notes on each leader, newest last (leaders.js)
let leaderRoster = null; // [{name, roles}] the leaders and their PEC roles (leaders.js); null until edited
let roleBoards = {};      // each Team Lead role's week and log (roles.js)
let safeOrders = [];          // change orders placed: [{id, placedAt, by, lines, total, expected, note, status, receivedAt, receivedBy}] (safe-order.js)
let safeOrderSettings = {};   // {par: {'1': bills, Quarters: rolls, ...}, step: {...}}: the change order (safe-order.js)
let positionLists = {};   // {foh: {daypart: [positions]}, boh: {...}}: a daypart directors rearranged (positions-editor.js); one left out keeps zone-reset.js's list
let peaGoals = null;     // {team, leader}: PEAs per quarter the team and each leader aim for; null = PEA_GOALS_SEED
let leaderFocus = {};    // {'<leader key>__2026-Q4': [focus items]}: each leader's focus for the quarter
let teamNotes = {};      // {team member: [{text, by, ts, date, type, tags: ['iPOS:2']}]}: directors' notes on each team member (team-pea.js)
let foodSafetyStreak = 0;
let wasteStreak = 0;
let wasteLogLastClosedOut = null; // timestamp of the last manual export+reset, shown in Manage
let wasteMonthlyHistory = {}; // {"YYYY-MM": {total, fohTotal, bohTotal, entryCount, topProducts, closedOutAt}} — a small permanent summary saved at each monthly close-out, so month-over-month comparisons survive the reset that wipes raw entries

// Any string that came from a user-typed field (EOI submissions, safe count
// notes, etc.) must go through this before being placed in innerHTML —
// otherwise a team member typing e.g. "<img src=x onerror=...>" into a free
// text field would run script in whoever views that submission's browser.
function escapeHtml(str){
  if(str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

// A value handed to an inline handler, e.g. onclick="fn(${jsArg(name)})":
// a quoted JS string, escaped again for the HTML attribute around it, so a
// quote or tag in a name can't break out of either.
function jsArg(value){
  return escapeHtml(JSON.stringify(value === null || value === undefined ? '' : String(value)));
}

// ===== WHO'S DOING THIS (attribution) =====
// Who signed in (accounts.js, from the server) is who the hub writes on what
// they do, and the server stamps it again so a page can't claim anyone else
// (TIM-90; Tim, Oct 25 2026). A shared store device signs as itself ("Kitchen
// iPad"). Typed initials are gone: nobody signed in means the badge says
// "Sign in" and anything that needs a name asks for one (sign-in.js).
const INITIALS_STORAGE_KEY = 'cfaBudaInitials';
let siIdentity = {name: '', device: '', role: '', required: false, known: false};

// Who's doing this: the person signed in on this device, else the shared
// store device, else nobody, and the page asks for a sign-in (sign-in.js).
// Typed initials are gone (Tim, Oct 25 2026: a signed-out iPad still wrote
// his initials on its waste); any left on a device are cleared.
function getInitials(){
  if(siIdentity.name) return siIdentity.name;
  if(siIdentity.device) return siIdentity.device;
  return '';
}
try{ localStorage.removeItem(INITIALS_STORAGE_KEY); }catch(e){ /* nothing kept */ }

function formatShortTime(ts){
  if(!ts) return '';
  return new Date(ts).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
}

function renderInitialsBadge(){
  const badge = document.getElementById('initialsBadge');
  if(!badge) return;
  // Signed in (or a shared device): their first name. Nobody signed in:
  // "Sign in", on every page (Tim, Oct 25 2026). A tap opens the sign-in
  // sheet, not a menu, so no arrow.
  const who = siIdentity.name ? siIdentity.name.split(/\s+/)[0] : siIdentity.device;
  badge.innerHTML = who ? escapeHtml(who) : `Sign in${typeof esLine === 'function' ? esLine('Sign in') : ''}`;
  badge.title = who ? 'Who’s signed in on this device' : 'Sign in with your clock-in PIN or Google';
}

// A change that needs a name (waste, a zone check, a note) opens the
// sign-in sheet and says why; the badge opens it plain.
function beginEditInitials(){
  if(typeof siOpen === 'function') siOpen('Sign in with your clock-in PIN first. You’ll stay signed in on this phone.');
}
const initialsBadgeEl = document.getElementById('initialsBadge');
if(initialsBadgeEl){
  renderInitialsBadge();
  initialsBadgeEl.addEventListener('click', () => { if(typeof siOpen === 'function') siOpen(); });
}

// ----- Who has left (Tim, Oct 25 2026) -----
// Someone logged as a departure in Our Team is off the clock-in PIN list,
// and every list that offers people leaves them out: Set Ups, call-ins,
// Levelset / PEA lists, leaders, points, forms. The server's list
// (/api/team/names `departed`, or Our Team's own data) reaches signed-in
// devices only. teamHasLeft(name, iso): left by that day (after their last
// day); without a day, by today. Someone who gave notice, with a last day
// still to come, is on the team until then (Tim, Oct 26 2026).
let teamLeftList = [];     // [{name, lastDay}]
function teamLeftSet(list){
  teamLeftList = (Array.isArray(list) ? list : []).map(x => typeof x === 'string' ? {name: x, lastDay: ''} : x).filter(x => x && x.name);
  teamLeftSweep();
}
function teamHasLeft(name, iso){
  if(!name || !teamLeftList.length) return false;
  const k = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
  const hit = teamLeftList.find(x => {
    const xk = String(x.name).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
    return xk === k || (typeof rnSame === 'function' && rnSame(x.name, name));
  });
  return !!hit && (!hit.lastDay || (iso || today) > hit.lastDay);
}

// Off the schedule for good (Tim, Oct 30 2026: once their last day has
// passed they come off nearly everything). The device that logged the
// departure took them off the days after their last day then
// (headcount.js hcTakeOffSchedule); this does the same on every device that
// may save Set Ups, whenever the list of who left arrives, so a shift or
// spot that came back (a HotSchedules sync, a departure logged another way)
// goes too. Nothing to do most of the time; one save when there is.
let teamLeftSwept = '';
function teamLeftSweep(){
  if(typeof stateLoaded === 'undefined' || typeof hcTakeOffSchedule !== 'function') return;
  const gone = teamLeftList.filter(x => x.lastDay && x.lastDay < today);
  const key = gone.map(x => x.name + '|' + x.lastDay).sort().join(',');
  if(!gone.length || key === teamLeftSwept) return;
  stateLoaded.then(() => {
    if(!(typeof siLeadOrUp === 'function' && siLeadOrUp())) return;   // a Team Member's phone can't save Set Ups
    if(key === teamLeftSwept) return;
    teamLeftSwept = key;
    let shifts = 0, spots = 0;
    gone.forEach(x => { const r = hcTakeOffSchedule(x.name, x.lastDay); shifts += r.shifts; spots += r.spots; });
    if(!shifts && !spots) return;
    saveState();
    if(typeof stateRerender === 'function') stateRerender();
  });
}

// ----- The phone's keyboard (Tim, Oct 25 2026) -----
// On iOS the keyboard covers the bottom of the screen, and a sheet pinned to
// the bottom (Add Team Member, Sign in, an event, the spot picker) ended up
// under it, the box being typed in out of sight. While the keyboard is up,
// the part of the page still showing (the visual viewport) is kept in --vvt
// and --vvh, the open sheets sit inside it (theme-cfa.css, .kb-open), and
// the box being typed in is scrolled into view.
const KB_SHEETS = '.overlay, .si-sheet, .rn-evs';
function kbSync(){
  const vv = window.visualViewport;
  if(!vv) return;
  const root = document.documentElement;
  const hidden = window.innerHeight - vv.height;          // keyboard (and any zoom)
  root.style.setProperty('--vvt', Math.round(vv.offsetTop) + 'px');
  root.style.setProperty('--vvh', Math.round(vv.height) + 'px');
  root.classList.toggle('kb-open', hidden > 120 && vv.scale <= 1.01);
}
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', kbSync);
  window.visualViewport.addEventListener('scroll', kbSync);
  kbSync();
}
document.addEventListener('focusin', e => {
  const el = e.target;
  if(!el || !el.matches || !el.matches('input, textarea, select') || !el.closest(KB_SHEETS)) return;
  // Once the keyboard is up (iOS takes a moment), bring the box into view.
  setTimeout(() => { kbSync(); el.scrollIntoView({block: 'center'}); }, 350);
});

function toLocalISODate(d){
  // Avoids the classic toISOString() UTC-shift bug, where a local date can
  // silently become the next/previous calendar day depending on timezone
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Reads a stored date as a date on the local calendar. `new Date('2026-09-28')`
// means midnight UTC, which is the evening of the 27th in Texas, so dates
// showed a day early. Other formats go to new Date() as before.
function parseLocalISODate(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s == null ? '' : s).trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
}

// A timestamp as local "YYYY-MM-DD HH:MM" (for exports: sorts correctly and
// shows the store's time, not UTC).
function toLocalDateTime(ts){
  const d = new Date(ts);
  return `${toLocalISODate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Worked out once per page load. storage.js reloads the page after midnight
// (see "NEW DAY") so this never goes stale.
const today = toLocalISODate(new Date());

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getWeekStartDate(offsetWeeks){
  const now = new Date();
  const dow = now.getDay();
  const diffToMonday = (dow === 0) ? -6 : (1 - dow);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday + offsetWeeks * 7);
}

function getWeekDays(offsetWeeks){
  const monday = getWeekStartDate(offsetWeeks);
  return WEEKDAY_NAMES.map((name, i)=>{
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const iso = toLocalISODate(d);
    const shortDate = d.toLocaleDateString('en-US', {month: 'numeric', day: 'numeric'});
    return {weekday: name, date: iso, label: name.slice(0, 3) + ' ' + shortDate};
  });
}

function formatVerboseDate(dateISO){
  const d = new Date(dateISO + 'T00:00:00');
  return d.toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'});
}

function formatLastUpdated(ts){
  if(!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) + ' at ' + d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
}


function touchLastUpdated(dateISO){
  if(!dateISO) return;
  lastUpdated[dateISO] = Date.now();
}

// One-time migration: earlier versions of this app stored rosters/positions/numbers
// under generic weekday names ("Monday") that got overwritten every week. This maps
// any leftover weekday-named data onto this week's actual dates, once, so nothing
// already entered gets silently lost when the app switches to date-based keys.
function migrateLegacyWeekdayKeys(){
  const nameToDate = {};
  getWeekDays(0).forEach(d=>{ nameToDate[d.weekday] = d.date; });
  
  let migrated = false;
  [fohRoster, bohRoster, numbersData].forEach(obj=>{
    WEEKDAY_NAMES.forEach(name=>{
      if(obj[name] !== undefined){
        const dateKey = nameToDate[name];
        if(!obj[dateKey]) obj[dateKey] = obj[name];
        delete obj[name];
        migrated = true;
      }
    });
  });
  
  const remapped = {};
  let posMigrated = false;
  Object.keys(posAssignments).forEach(key=>{
    const parts = key.split('||');
    if(parts.length === 4 && WEEKDAY_NAMES.includes(parts[1])){
      parts[1] = nameToDate[parts[1]];
      remapped[parts.join('||')] = posAssignments[key];
      posMigrated = true;
    } else {
      remapped[key] = posAssignments[key];
    }
  });
  if(posMigrated){
    posAssignments = remapped;
    migrated = true;
  }
  
  return migrated;
}

// Set Ups/Numbers only need two weeks live, so anything older is quietly
// cleaned up rather than accumulating forever. Finished set ups are copied to
// setupHistory (setup-history.js) first, so rotation history isn't lost.
function pruneOldDateData(){
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffISO = toLocalISODate(cutoff);
  const isDateKey = k => /^\d{4}-\d{2}-\d{2}$/.test(k);
  
  let pruned = false;
  [fohRoster, bohRoster, numbersData, lastUpdated, truckShifts, adminShifts].forEach(obj=>{
    Object.keys(obj).forEach(key=>{
      if(isDateKey(key) && key < cutoffISO){
        delete obj[key];
        pruned = true;
      }
    });
  });
  
  Object.keys(posAssignments).forEach(key=>{
    const parts = key.split('||');
    const dateStr = parts[1];
    if(dateStr && isDateKey(dateStr) && dateStr < cutoffISO){
      delete posAssignments[key];
      pruned = true;
    }
  });
  
  return pruned;
}

// ===== ZONE RESET CHECKLISTS =====
const ZONE_CHECKLISTS = {
  'Dining Room': ['Take out trash', 'Sweep floor mats', 'Clean glass & windows', 'Wipe tables & chairs', 'Sweep playscape', 'Wipe high chairs', 'Sweep & mop floors', 'Restock condiment bins', 'Align tables + place flowers', 'Ensure TVs are on'],
  'Restrooms': ['Wipe sinks & counters', 'Clean mirrors', 'Restock paper towels & toilet paper', 'Check soap & sanitizer', 'Restock seat covers', 'Wipe toilets', 'Take out trash', 'Sweep & mop'],
  'Front Counter': ['Restock cubbies', 'Fill ice bins', 'Refill teas & lemonades', 'Take out trash', 'Clean hand sink', 'Wipe surfaces', 'Clean/reset trays', 'Wipe stainless door', 'Clear clutter', 'Sweep & mop'],
  'Bagging Station': ['Restock fridges, bags, toys', 'Open all boxes (bags, toys, etc.)', 'Stock sauces', 'Clear clutter', 'Prep printer paper', 'Refill cubbies', 'Stock hospitality cart', 'Empty trash bins', 'Wipe counters', 'Sweep & mop'],
  'Drinks Zone': ['Wipe staging table', 'Clean ice cream machine', 'Wipe counters', 'Refill teas/lemonades', 'Refill ice cream & shake base', 'Restock lowboys', 'Prep cups & lemonades', 'Take out trash', 'Clean sugar bin', 'Organize shelves', 'Clean lemonade fridge', 'Restock cups', 'Sweep & mop', 'Ensure wallboard displayed'],
  'Outside': ['Sweep lot', 'Remove trash from iPOS areas', 'Check equipment charging', 'Clean OMD trash bin', 'Clean patio tables', 'Sweep patio', 'Empty large trash bins', 'Ensure iPOS coverage'],
  'Soda Room / Tea Station': ['Stock sodas', 'Clean lemonade table', 'Remake lemonades (if needed)', 'Ensure tea lids are on', 'Clean sugar bin', 'Clean sinks'],
  'The Spot': ['Clear clutter', 'Sweep & mop', 'Take out trash']
};
const FINAL_CHECK_ITEMS = ['Floors cleaned', 'Trash taken out', 'Surfaces wiped', 'Fully restocked', 'Smooth transition to next leader?'];
// One line icon per zone (inline SVG, tinted by the text color).
const ZONE_ICONS = {'Dining Room': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3v8"/><path d="M4 3v5a3 3 0 0 0 6 0V3"/><path d="M7 11v10"/><path d="M17 3c-2 1-3 3-3 6v3h3v9"/></svg>', 'Restrooms': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="5" r="2.5"/><path d="M4 21v-7a4 4 0 0 1 8 0v7"/><circle cx="17" cy="5" r="2.5"/><path d="M14 21l1-7h4l1 7"/></svg>', 'Front Counter': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17h16"/><path d="M6 17a6 6 0 0 1 12 0"/><path d="M12 8V6"/><path d="M4 21h16"/></svg>', 'Bagging Station': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8h12l1 13H5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>', 'Drinks Zone': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h12l-1.5 16h-9z"/><path d="M7 10h10"/><path d="M12 2v2"/></svg>', 'Outside': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 16l1.5-6h11L19 16"/><rect x="3" y="16" width="18" height="4" rx="1"/><path d="M7 20v1"/><path d="M17 20v1"/></svg>', 'Soda Room / Tea Station': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2"/><path d="M7 4v2"/><path d="M11 4v2"/></svg>', 'The Spot': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>', 'Final Check': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>'};
const ALL_ZONE_NAMES = Object.keys(ZONE_CHECKLISTS).concat(['Final Check']);

// The spreadsheet reader and the PDF maker load only when a file is read or
// made, not with every page: together they were a fifth of a phone's load
// (Set Ups speed budget, Oct 25 2026). A reader waits for its library here.
const LIBS = {
  xlsx: {src: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', ready: () => window.XLSX, name: 'spreadsheet reader'},
  pdf: {src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', ready: () => window.jspdf, name: 'PDF maker'}
};
const libLoading = {};
function libReady(key){
  const lib = LIBS[key];
  if(lib.ready()) return Promise.resolve();
  if(!libLoading[key]){
    libLoading[key] = new Promise((ok, fail) => {
      const el = document.createElement('script');
      el.src = lib.src;
      el.async = true;
      el.onload = () => lib.ready() ? ok() : fail(new Error(`The ${lib.name} didn’t load. Reload the page and try again.`));
      el.onerror = () => fail(new Error(`The ${lib.name} didn’t load. Check the connection and try again.`));
      document.head.appendChild(el);
    }).catch(e => { delete libLoading[key]; throw e; });   // a later try asks again
  }
  return libLoading[key];
}
function xlsxReady(){ return libReady('xlsx'); }
function pdfReady(){ return libReady('pdf'); }
// Work that can wait until the page is up and quiet.
function afterIdle(fn){
  if(typeof requestIdleCallback === 'function') requestIdleCallback(() => fn(), {timeout: 4000});
  else setTimeout(fn, 1500);
}
