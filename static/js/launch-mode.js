// ===== LAUNCH MODE =====
// While the team is getting started, the site shows only Home and the
// essentials: Set Ups, Waste, and Lists. The Lists tab opens Zone Reset &
// Walkthroughs in one tap; Food Safety Walkthrough, Daily Safe Count and the
// Prep Board are pills at the top of each list page. Everything else is still there:
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

const LAUNCH_VIEWS = ['home', 'positions', 'wastelog', 'zonereset', 'foodsafety', 'safecount', 'prepboard', 'manage'];
// Zone Resets and the Leader Transition List share a view; `page` picks
// which of its cards show (data-launch-page on the cards).
const LAUNCH_LISTS = [
  {view: 'zonereset', page: 'zones', label: 'Zone Resets', sub: 'Reinicios'},
  {view: 'zonereset', page: 'leaders', label: 'Leader Transition', sub: 'Transición'},
  {view: 'foodsafety', label: 'Food Safety', sub: 'Seguridad'},
  {view: 'safecount', label: 'Safe Count', sub: 'Caja Fuerte'},
  {view: 'prepboard', label: 'Prep Board', sub: 'Preparación'},
];
let launchManager = false;
let launchListPage = null;   // the page a pill asked for; the tab itself opens the first

// The pill row at the top of a list page, with the open one marked. The
// view's cards for other pages hide on the simplified site (CSS).
function launchSubnavRender(view){
  const here = LAUNCH_LISTS.filter(l => l.view === view);
  if(!here.length) return;
  const page = here.some(l => l.page === launchListPage) ? launchListPage : (here[0].page || '');
  launchListPage = null;
  const root = document.getElementById(view + 'View');
  if(page) root.dataset.launchPage = page; else delete root.dataset.launchPage;
  const nav = root.querySelector('[data-launch-subnav]');
  if(!nav) return;
  nav.innerHTML = LAUNCH_LISTS.map(l => {
    const on = l.view === view && (l.page || '') === page;
    return `<button type="button" class="launch-pill ${on ? 'active' : ''}" aria-current="${on ? 'page' : 'false'}" data-launch-go="${l.view}" data-launch-pick="${l.page || ''}">${l.label}<span>${l.sub}</span></button>`;
  }).join('');
}
document.addEventListener('click', e=>{
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
}

// A manager session found (on load, or the PIN just entered).
async function launchSetManager(isManager){
  launchManager = isManager;
  // Tabs marked .manager-only (the Calendar, Uniforms) show only with the
  // PIN, launch mode or not; Set Ups' event chips follow the same session.
  document.body.classList.toggle('is-manager', !!isManager);
  if(!isManager && ['calendarView', 'uniformsView'].some(id => document.getElementById(id).classList.contains('active'))) launchShowTab('home');
  launchApply();
  if(typeof renderAllDayparts === 'function' && document.getElementById('positionsView').classList.contains('active')) renderAllDayparts();
  // Pick up the private sections this page wasn't sent without a session.
  if(isManager && typeof syncState === 'function') await syncState();
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
