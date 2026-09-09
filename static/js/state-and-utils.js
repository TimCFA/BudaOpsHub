const SHEET_TITLE = 'CFA Buda Waste Log';
let currentSection = 'foh';
let entries = [];
let products = [];
let teamMembers = [];
let wasteTarget = 100;
let safeTarget = 4500;
let safeCounts = [];
let formDone = false;
let foodSafetyDays = [];
let wasteDays = [];
let foodSafetyStreak = 0;
let wasteStreak = 0;

// Any string that came from a user-typed field (EOI submissions, safe count
// notes, etc.) must go through this before being placed in innerHTML —
// otherwise a team member typing e.g. "<img src=x onerror=...>" into a free
// text field would run script in whoever views that submission's browser.
function escapeHtml(str){
  if(str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

const INITIALS_STORAGE_KEY = 'cfaBudaInitials';

function getInitials(){
  return localStorage.getItem(INITIALS_STORAGE_KEY) || '';
}

function setInitials(value){
  // Letters only, capped at 4 chars — keeps it simple and blocks anything odd
  // from ending up in a checklist stamp.
  const cleaned = String(value || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4);
  localStorage.setItem(INITIALS_STORAGE_KEY, cleaned);
  renderInitialsBadge();
  return cleaned;
}

function formatShortTime(ts){
  if(!ts) return '';
  return new Date(ts).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
}

function renderInitialsBadge(){
  const badge = document.getElementById('initialsBadge');
  if(!badge) return;
  const current = getInitials();
  badge.textContent = (current || 'Set initials') + ' ▾';
}

function beginEditInitials(){
  const badge = document.getElementById('initialsBadge');
  if(!badge || badge.querySelector('input')) return;
  const current = getInitials();
  badge.innerHTML = `<input type="text" id="initialsInput" maxlength="4" value="${current}" placeholder="JD" style="width:50px;text-transform:uppercase;font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;border:1px solid var(--cfa-red);border-radius:4px;padding:2px 4px;background:var(--cfa-white);color:var(--text-primary);">`;
  const input = document.getElementById('initialsInput');
  input.focus();
  input.select();
  const commit = () => setInitials(input.value);
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => { if(e.key === 'Enter') commit(); });
}

const initialsBadgeEl = document.getElementById('initialsBadge');
if(initialsBadgeEl){
  renderInitialsBadge();
  initialsBadgeEl.addEventListener('click', beginEditInitials);
  if(!getInitials()) beginEditInitials(); // first-ever load on this device: prompt right away
}

function toLocalISODate(d){
  // Avoids the classic toISOString() UTC-shift bug, where a local date can
  // silently become the next/previous calendar day depending on timezone
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const today = toLocalISODate(new Date());

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getWeekStartDate(offsetWeeks){
  // Returns the Monday of "this week" (or +offsetWeeks weeks from it) as a Date
  const now = new Date();
  const dow = now.getDay(); // 0=Sun..6=Sat
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

let currentWeekOffset = 0; // runtime-only: 0 = this week, 1 = next week

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

// Set Ups/Numbers don't need long-term history, so anything older than 2 weeks
// is quietly cleaned up rather than accumulating forever
function pruneOldDateData(){
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffISO = toLocalISODate(cutoff);
  const isDateKey = k => /^\d{4}-\d{2}-\d{2}$/.test(k);
  
  let pruned = false;
  [fohRoster, bohRoster, numbersData, lastUpdated].forEach(obj=>{
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
const ZONE_ICONS = {
  'Dining Room': '🍽️', 'Restrooms': '🚻', 'Front Counter': '🛎️', 'Bagging Station': '🛍️',
  'Drinks Zone': '🥤', 'Outside': '🅿️', 'Soda Room / Tea Station': '🫖', 'The Spot': '📍', 'Final Check': '✅'
};
const ALL_ZONE_NAMES = Object.keys(ZONE_CHECKLISTS).concat(['Final Check']);

