// ===== LAUNCH MODE =====
// While the team is getting started, the site shows only Home and the
// essentials: Set Ups, Schedule, Waste, Lists, the Prep Board, the store's
// Calendar and Forms. The Lists tab opens Zone Reset & Walkthroughs in one
// tap; Food Safety Walkthrough and Daily Safe Count are pills at the top of
// each list page. The rest of Tools (Know the Numbers, the Forecast, CEM
// Insights) is on the full site only (Tim, Oct 27 2026). Everything else is still there:
// a device signed in with the manager PIN (Manage tab) sees every tab again,
// and a manager can turn launch mode off for everyone in Manage.
//
// The <body> starts with class "launch-mode" so the full menu never flashes
// on a team member's phone; it comes off once a manager session is found.
// Tabs marked .full-only hide in launch mode, .launch-only ones show only in it.
//
// Private data (PEA ratings, people data) only reaches manager sessions
// (app.py PRIVATE_SECTIONS), so signing in fetches it right away, and
// locking reloads the page to clear it from the device.

const LAUNCH_VIEWS = ['home', 'positions', 'schedule', 'wastelog', 'scoreboard', 'zonereset', 'foodsafety', 'safecount', 'prepboard', 'calendar', 'tasks', 'forms', 'manage', 'headcount'];
// Off the simplified site (Tim, Oct 27 2026): a link to one opens Home.
const LAUNCH_FULL_ONLY_VIEWS = ['knownumbers', 'forecast', 'cem'];
// Zone Resets and the Leader Transition List share a view; `page` picks
// which of its cards show (data-launch-page on the cards).
const LAUNCH_LISTS = [
  {view: 'zonereset', page: 'zones', label: 'Zone Resets', sub: 'Reinicios'},
  {view: 'zonereset', page: 'leaders', label: 'Leader Transition', sub: 'Transición'},
  {view: 'foodsafety', label: 'Food Safety', sub: 'Seguridad'},
  {view: 'safecount', label: 'Safe Count', sub: 'Caja Fuerte'},
];
// Tools (Tim, Oct 23 2026): the pages that work the numbers for us. The
// Forecast and CEM Insights are for the full site (managers).
const LAUNCH_TOOLS = [
  {view: 'prepboard', label: 'Prep Board', sub: 'Preparación'},
  // Know the Numbers (kn-page.js): Team Leads and up, on the full site (Oct 27 2026).
  {view: 'knownumbers', label: 'Know the Numbers', sub: 'Los números', leaders: true, full: true},
  {view: 'forecast', label: 'Sales & Labor Forecast', sub: 'Pronóstico', full: true},
  {view: 'cem', label: 'CEM Insights', sub: 'Encuestas', full: true},
];
// The Waste tab: logging, and the waste scoreboard (Tim, Oct 18 2026). On
// the scoreboard the team sees the Waste panel's waste cards only.
const LAUNCH_WASTE = [
  {view: 'wastelog', label: 'Log Waste', sub: 'Registrar'},
  {view: 'scoreboard', label: 'Scoreboard', sub: 'Tablero'},
];
const LAUNCH_SUBNAVS = [LAUNCH_LISTS, LAUNCH_WASTE, LAUNCH_TOOLS];
let launchManager = false;
let launchListPage = null;   // the page a pill asked for; the tab itself opens the first

// The pill row at the top of a list page, with the open one marked. The
// view's cards for other pages hide on the simplified site (CSS).
function launchSubnavRender(view){
  const group = LAUNCH_SUBNAVS.find(g => g.some(l => l.view === view));
  if(!group) return;
  // Safe Count and the Leader Transition List aren't for Team Members or Trainers.
  const hidden = l => (l.view === 'safecount' && typeof scHidden === 'function' && scHidden())
    || (l.page === 'leaders' && typeof ltHidden === 'function' && ltHidden())
    || (l.full && launchIsOn())
    || (l.leaders && typeof knPageShown === 'function' && !knPageShown());
  const here = group.filter(l => l.view === view && !hidden(l));
  if(!here.length) return;
  const page = here.some(l => l.page === launchListPage) ? launchListPage : (here[0].page || '');
  launchListPage = null;
  const root = document.getElementById(view + 'View');
  if(page) root.dataset.launchPage = page; else delete root.dataset.launchPage;
  const nav = root.querySelector('[data-launch-subnav]');
  if(!nav) return;
  const shown = group.filter(l => !hidden(l));
  // A device nobody signed in on: say where Leader Transition and Safe Count went.
  let hint = nav.nextElementSibling && nav.nextElementSibling.classList.contains('launch-signin-hint') ? nav.nextElementSibling : null;
  const showHint = group === LAUNCH_LISTS && typeof scSignedOut === 'function' && scSignedOut();
  if(showHint && !hint){
    hint = document.createElement('p');
    hint.className = 'launch-signin-hint';
    hint.innerHTML = `Team Leads: <button type="button" data-launch-signin>sign in with your clock-in PIN</button> for Leader Transition and Safe Count.${esLine('Leads sign in hint')}`;
    nav.after(hint);
  }
  if(hint) hint.hidden = !showHint;
  // One page in the group (the team's Tools): no pill row.
  nav.hidden = shown.length < 2;
  nav.innerHTML = shown.map(l => {
    const on = l.view === view && (l.page || '') === page;
    return `<button type="button" class="launch-pill ${on ? 'active' : ''}" aria-current="${on ? 'page' : 'false'}" data-launch-go="${l.view}" data-launch-pick="${l.page || ''}">${l.label}<span>${l.sub}</span></button>`;
  }).join('');
}
document.addEventListener('click', e=>{
  if(e.target.closest('[data-launch-signin]')){
    launchShowTab('manage');
    window.scrollTo({top: 0});
    const pin = document.getElementById('pinInput');
    if(pin) pin.focus();
    return;
  }
  const go = e.target.closest('[data-launch-go]');
  if(go){ launchListPage = go.dataset.launchPick || null; launchShowTab(go.dataset.launchGo); window.scrollTo({top: 0}); }
});

function launchIsOn(){ return launchMode !== false && !launchManager; }

function launchShowTab(view){
  closeAllTabDropdowns();
  clearActiveTabs();
  // The Lists tab stands for every list page (data-views).
  const tab = [...document.querySelectorAll(`.tab[data-view="${view}"], .tab[data-views~="${view}"]`)].find(t => t.offsetParent !== null);
  if(tab){ tab.classList.add('active'); tab.setAttribute('aria-selected', 'true'); }
  const item = [...document.querySelectorAll(`.tab-dropdown-item[data-view="${view}"]`)].find(i => i.closest('.tab-group').offsetParent !== null);
  if(!tab && item) item.closest('.tab-group').classList.add('active');
  activateView(view);
}

function launchApply(){
  const on = launchIsOn();
  document.body.classList.toggle('launch-mode', on);
  const toggle = document.getElementById('launchModeToggle');
  if(toggle) toggle.checked = launchMode !== false;
  if(!on) return;
  // Set Ups opens in the plain set-up sheet; Coach (PEA scores, Plan B)
  // waits until the full site is on.
  if(typeof suMode !== 'undefined' && suMode === 'coach'){
    suMode = 'sheet';
    if(document.getElementById('positionsView').classList.contains('active') && typeof renderAllDayparts === 'function') renderAllDayparts();
  }
  // Showing a page the team can't reach (e.g. after locking Manage on the
  // Scoreboard): go to Set Ups.
  const active = document.querySelector('.view.active');
  const view = active ? active.id.replace(/View$/, '') : '';
  if(!LAUNCH_VIEWS.includes(view)) launchShowTab('positions');
  // Locked while on another scoreboard: back to the Waste one.
  else if(view === 'scoreboard' && typeof activateView === 'function') activateView('scoreboard');
}

// A manager session found (on load, or the PIN just entered).
async function launchSetManager(isManager){
  launchManager = isManager;
  // Tabs marked .manager-only (Directors) show only with the
  // PIN, launch mode or not; Set Ups' event chips follow the same session.
  document.body.classList.toggle('is-manager', !!isManager);
  if(!isManager && document.getElementById('directorsView').classList.contains('active')) launchShowTab('home');
  launchApply();
  if(typeof renderAllDayparts === 'function' && document.getElementById('positionsView').classList.contains('active')) renderAllDayparts();
  // Pick up the private sections this page wasn't sent without a session,
  // and the waste log whole (a team device is sent two days of it).
  if(typeof scSyncVisibility === 'function') scSyncVisibility();
  if(isManager && typeof stateForget === 'function') stateForget(['waste']);
  if(isManager && typeof syncState === 'function') await syncState();
  // Meetings on the Calendar come and go with the session (events.js).
  if(typeof evRerender === 'function') evRerender();
  // The forecast fills Know the Numbers on a manager's device (forecast.js).
  if(isManager && typeof fcAutoCheck === 'function') fcAutoCheck();
  // A week sent from HotSchedules was waiting for a manager.
  if(isManager && typeof hsSyncManagerReady === 'function') hsSyncManagerReady();
}

document.getElementById('launchModeToggle').addEventListener('change', async e=>{
  launchMode = e.target.checked ? undefined : false;
  await saveState();
  launchApply();
  showToast(e.target.checked ? 'Launch mode on — the team sees Home, Set Ups, Waste and Lists' : 'Launch mode off — everyone sees every tab');
});

// Before the saved data arrives, make sure team members start on a page
// they can see.
launchApply();
