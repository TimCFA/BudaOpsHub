// Runs the Zone Resets page (static/js/zone-page.js) on cases from
// tests/test_zone_reset_flow.py: reads {cases: [{op, at}]} on stdin, writes
// back one result per case. `at` is the store's clock for the case
// (America/Chicago). The real handoffs, zones and lists are loaded; who owns
// a zone and the rest of the page are stubbed. Names are made up. Each case
// starts signed in as a Team Lead (the leaders' view); a case sets acUser or
// launchManager itself to see the team's.
process.env.TZ = 'America/Chicago';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const js = n => fs.readFileSync(path.join(__dirname, '..', 'static', 'js', n), 'utf8');
const RealDate = Date;
const fixedDate = iso => { const T = new RealDate(iso).getTime(); return class extends RealDate { constructor(...a){ if(a.length) super(...a); else super(T); } static now(){ return T; } }; };
const els = {};
const el = id => els[id] || (els[id] = {id, className: '', innerHTML: '', dataset: {}, listeners: {}, addEventListener(t, f){ this.listeners[t] = f; },
  classList: {on: new Set(), add(c){ this.on.add(c); }, remove(c){ this.on.delete(c); }, toggle(c, v){ v ? this.on.add(c) : this.on.delete(c); }, contains(c){ return this.on.has(c); }},
  scrollIntoView(){}, focus(){}});
const ctx = {console, setInterval(){}, els,
  document: {getElementById: el, addEventListener(){}, querySelector: () => null, querySelectorAll: () => [], visibilityState: 'visible'},
  escapeHtml: s => (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch])),
  toLocalISODate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  formatShortTime: ts => ts ? new RealDate(ts).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'}) : '',
  suDisplayName: n => String(n).split(' ')[0], suShortDaypart: n => String(n).split(' (')[0], SU_LEAD_CAPTAIN: 'Lead Captain',
  suDaypartColor: n => n.toLowerCase().charAt(0), suSkyArt: sky => `<svg data-sky="${sky}"></svg>`,
  ZONE_ICONS: {}, toasts: [], showToast(m){ ctx.toasts.push(m); }, saved: 0, saveState: async () => { ctx.saved++; },
  beginEditInitials(){ ctx.asked = (ctx.asked || 0) + 1; }};
vm.createContext(ctx);
const su = js('state-and-utils.js');
vm.runInContext(su.slice(su.indexOf('const ZONE_CHECKLISTS'), su.indexOf('// One line icon per zone')), ctx);
vm.runInContext("const ALL_ZONE_NAMES = Object.keys(ZONE_CHECKLISTS).concat(['Final Check']);", ctx);
const zr = js('zone-reset.js');
vm.runInContext(zr.slice(zr.indexOf('const fohDayparts'), zr.indexOf('// leadFrom:')), ctx);
vm.runInContext(zr.slice(zr.indexOf('const zoneResetDayparts'), zr.indexOf('const fohPositions')), ctx);
vm.runInContext(`
  let today = '', zoneChecklistState = {}, zoneChecklistHistory = {}, posAssignments = {}, initials = 'TL';
  let acUser = null, launchManager = false;
  let owners = {}, setUps = {};            // owners['handoff|zone'] = [names]; setUps[handoff] = true
  function getInitials(){ return initials; }
  function zrZoneOwners(date, h, z){ const all = owners[h + '|' + z] || []; return {all, added: [], dp: {name: 'Lunch (10:30-1:00)'}}; }
  function zrSetupExists(date, h){ return !!setUps[h]; }
  function zrUnownedZones(date, h){ return ALL_ZONE_NAMES.filter(z => !(owners[h + '|' + z] || []).length); }
  function zrHandZone(){} function zrUnhandZone(){}
`, ctx);
// The page's helpers that stay in zone-reset.js, then the page.
vm.runInContext(zr.slice(zr.indexOf('function getZoneItems'), zr.indexOf('function pruneZoneChecklistData')), ctx);
vm.runInContext(zr.slice(zr.indexOf('let currentChecklistZone'), zr.indexOf('function getHandoffZoneCompletion')), ctx);
{ const rn = js('right-now.js'); vm.runInContext(rn.match(/function rnSame\([\s\S]*?\n}\n/)[0], ctx); }   // "Maya Torres" is "Maya Torres Ruiz"
vm.runInContext(js('zone-page.js'), ctx);

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(input.cases.map(c => {
  ctx.Date = fixedDate(c.at || '2026-11-23T12:20:00-06:00');
  vm.runInContext(`today = toLocalISODate(new Date()); zrPageDay = today; zoneChecklistState = {}; zoneChecklistHistory = {}; posAssignments = {}; owners = {}; setUps = {}; initials = 'TL';
    currentZoneDaypart = ''; currentChecklistZone = ''; toasts.length = 0; saved = 0; acUser = {name: 'Priya Shah', role: 'lead'}; launchManager = false;`, ctx);
  return vm.runInContext(`(${c.op})`, ctx)(c);
})));
