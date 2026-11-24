// Page links (Tim, Nov 23 2026): every page has its own address, so the
// phone's back button and swipe-back go to the page before instead of out of
// the hub, a reload stays on the page it was on, and a leader can text a link
// straight to a page. The hub is still one page: the address only follows
// which view is open. Nothing more is loaded or saved for it.
//
// app.py PAGE_PATHS answers every path here with the same page, and
// tests/test_page_links.py checks the two lists match.
const PL_PATHS = {
  home: '/',
  positions: '/setups',
  zonereset: '/lists/zones',
  huddle: '/lists/huddle',
  timers: '/lists/timers',
  foodsafety: '/lists/food-safety',
  safecount: '/lists/safe-count',
  prepboard: '/prep',
  wastelog: '/waste',
  scoreboard: '/scoreboard',
  schedule: '/schedule',
  tasks: '/tasks',
  calendar: '/calendar',
  forms: '/forms',
  headcount: '/team',
  roles: '/roles',
  directors: '/directors',
  knownumbers: '/numbers',
  forecast: '/numbers/forecast',
  cem: '/numbers/cem',
  gx: '/experience/gx',
  tx: '/experience/tx',
  lx: '/experience/lx',
  manage: '/manage'
};

(function(){
  if(typeof activateView !== 'function' || !window.history || !history.pushState) return;
  const views = {};
  Object.keys(PL_PATHS).forEach(v => { views[PL_PATHS[v]] = v; });
  const viewOf = path => views[String(path || '/').replace(/\/+$/, '') || '/'];
  const current = () => { const v = document.querySelector('.view.active'); return v ? v.id.replace(/View$/, '') : 'home'; };

  // A page opened by a tap is a step back can undo; a page the hub opened by
  // itself (a sign-in that moves someone on, a tab that's not theirs, a
  // redraw) replaces the address instead, so back never lands on a page the
  // person didn't choose.
  let lastInput = 0;
  ['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, () => { lastInput = Date.now(); }, true));

  let ready = false;     // the address has been read once the page is up
  let replaying = false; // opening a page from the address (load, back, forward)
  let pending = null;    // the address named a page this device can't open yet

  const open0 = activateView;
  activateView = function(){
    const out = open0.apply(this, arguments);
    if(ready){
      const view = current();
      const path = PL_PATHS[view];
      if(path && path !== location.pathname){
        const tapped = !replaying && Date.now() - lastInput < 1500;
        if(tapped){
          pending = null;
          history.pushState({view}, '', path);
        }else{
          history.replaceState({view}, '', path + location.search + location.hash);
        }
      }
      if(!replaying && pending && Date.now() - lastInput < 1500) pending = null;
    }
    return out;
  };

  function show(view){
    replaying = true;
    try{
      if(typeof launchShowTab === 'function') launchShowTab(view);
      else activateView(view);
    }finally{ replaying = false; }
  }

  // Back and forward.
  window.addEventListener('popstate', () => {
    const view = viewOf(location.pathname) || 'home';
    pending = null;
    if(view !== current()) show(view);
    window.scrollTo(0, 0);
  });

  // A page that needs a session (Directors, Huddle, Know the Numbers…) opens
  // once the sign-in is known, unless the person has moved on by then.
  function retry(){
    if(!pending || pending === current()) { pending = null; return; }
    const want = pending;
    show(want);
    if(current() === want){
      pending = null;
      history.replaceState({view: want}, '', PL_PATHS[want] + location.search + location.hash);
    }
  }
  if(typeof launchSetManager === 'function'){
    const set0 = launchSetManager;
    launchSetManager = async function(){
      const out = await set0.apply(this, arguments);
      retry();
      return out;
    };
  }
  if(typeof acApplyStatus === 'function'){
    const ac0 = acApplyStatus;
    acApplyStatus = function(){
      const out = ac0.apply(this, arguments);
      retry();
      return out;
    };
  }

  // Once every script has run (each page's drawing lives in the later ones),
  // open the page the address names.
  const start = () => {
    ready = true;
    const want = viewOf(location.pathname);
    if(!want){ history.replaceState({view: current()}, '', PL_PATHS[current()] + location.search + location.hash); return; }
    if(want !== current()) show(want);
    if(current() !== want) pending = want;
  };
  if(typeof hubScriptsRan !== 'undefined') hubScriptsRan.then(start); else start();
})();
