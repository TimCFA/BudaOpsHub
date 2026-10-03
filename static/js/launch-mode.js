// ===== LAUNCH MODE =====
// While the team is getting started, the site shows only Home and the three
// essentials: Set Ups, Waste, and Lists (Zone Reset & Walkthroughs, Food
// Safety Walkthrough, Daily Safe Count). Everything else is still there:
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

const LAUNCH_VIEWS = ['home', 'positions', 'wastelog', 'zonereset', 'foodsafety', 'safecount', 'manage'];
let launchManager = false;

function launchIsOn(){ return launchMode !== false && !launchManager; }

function launchShowTab(view){
  closeAllTabDropdowns();
  clearActiveTabs();
  const tab = [...document.querySelectorAll(`.tab[data-view="${view}"]`)].find(t => t.offsetParent !== null);
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
  launchApply();
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
