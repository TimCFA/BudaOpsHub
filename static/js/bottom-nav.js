// The bottom tab bar (Tim, Nov 12 2026; a bar for each role and the Hub page,
// Nov 23 2026). On a touch screen four places sit in thumb reach, chosen for
// who is holding the device, and Hub holds the rest; a computer keeps the
// tab row at the top. Which one shows is CSS's call (theme-cfa.css, "Bottom
// tab bar": hover:none and pointer:coarse).
//
// The bars (Tim approved the mock-up, Nov 23 2026):
//   Team Member, Trainer, a signed-out phone: Home, Set Ups, Lists, Waste
//     (Tim, Nov 23 2026: the team logs waste; their Tasks are in Hub)
//   Team Lead:                                Home, Set Ups, Lists, Tasks
//   Director, Admin Team, the manager PIN:    Home, Set Ups, Tasks, Our Team
//   A signed-out kitchen iPad (Right Now on Back): Home, Set Ups, Prep, Waste
//     (Home stays: it is the kitchen's own Right Now card; Food Safety is in Hub)
// then Hub. Hub (/hub) is a page, not a sheet: what you opened lately, a
// search, and every other page in four groups named by the job. A page shows
// there only for those who can open it (the same rules activateView keeps).
(function(){
  const ICON = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    positions: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    zonereset: '<path d="M10 6h11M10 12h11M10 18h11"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
    wastelog: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    tasks: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m8 12 3 3 5-6"/>',
    headcount: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    prepboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h3"/>',
    foodsafety: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    timers: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
    huddle: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    safecount: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M12 9v1"/>',
    schedule: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    roles: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 16.5a3.5 3.5 0 0 1 7 0M15 10h3M15 13h3"/>',
    directors: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>',
    gx: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
    tx: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
    lx: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    forms: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    manage: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    hub: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'
  };
  const svg = (k, s) => `<svg viewBox="0 0 24 24" width="${s || 21}" height="${s || 21}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ICON.chart}</svg>`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

  // Every page, one name each, everywhere (the top row's menus use the same).
  const PAGES = {
    home: {label: 'Home', es: 'Inicio'},
    positions: {label: 'Set Ups', es: 'Configuración'},
    hub: {label: 'Hub', es: 'Todo'},
    zonereset: {label: 'Zone Resets', es: 'Reinicios', bar: 'Lists', barEs: 'Listas', group: 'shift', find: 'lists oe walkthrough zones handoff'},
    timers: {label: 'Timers', es: 'Temporizadores', group: 'shift', find: 'oe'},
    huddle: {label: 'Huddle', es: 'Reunión', group: 'shift', find: 'pre-huddle post-huddle oe'},
    foodsafety: {label: 'Food Safety', es: 'Seguridad Alimentaria', bar: 'Food Safety', barEs: 'Seguridad', group: 'shift', find: 'walkthrough temps oe'},
    safecount: {label: 'Safe Count', es: 'Caja Fuerte', group: 'shift', find: 'cash money'},
    wastelog: {label: 'Waste', es: 'Desperdicio', group: 'shift', find: 'log waste'},
    prepboard: {label: 'Prep Board', es: 'Preparación', bar: 'Prep', barEs: 'Prep', group: 'shift', find: 'kitchen tools'},
    tasks: {label: 'Tasks', es: 'Tareas', group: 'people', find: 'pass tickets'},
    schedule: {label: 'Schedule', es: 'Horario', group: 'people', find: 'shifts who is working'},
    calendar: {label: 'Calendar', es: 'Calendario', group: 'people', find: 'events directors week open door'},
    headcount: {label: 'Our Team', es: 'Equipo', group: 'people', find: 'people pto levels uniform credit headcount'},
    roles: {label: 'Roles', es: 'Roles', group: 'people'},
    directors: {label: 'Directors', es: 'Directores', group: 'people', find: 'pea'},
    scoreboard: {label: 'Scoreboard', es: 'Tableros', group: 'numbers', find: 'waste dashboard'},
    knownumbers: {label: 'Know the Numbers', es: 'Números', group: 'numbers', find: 'productivity sales tools'},
    forecast: {label: 'Forecast', es: 'Pronóstico', group: 'numbers', find: 'tools'},
    cem: {label: 'CEM', es: 'CEM', group: 'numbers', find: 'guest survey osat tools'},
    gx: {label: 'Guest Obsession', es: 'Experiencia', group: 'numbers', find: 'gx experience'},
    tx: {label: 'TX', es: 'Talento', group: 'numbers', find: 'experience levelset talent'},
    lx: {label: 'LX', es: 'Liderazgo', group: 'numbers', find: 'experience leadership'},
    forms: {label: 'Forms', es: 'Formularios', group: 'admin', find: 'uniform orders request'},
    manage: {label: 'Manage', es: 'Gestionar', group: 'admin', find: 'settings uploads sign in pin'}
  };
  const GROUPS = [
    {key: 'shift', label: 'Run the shift', es: 'El turno'},
    {key: 'people', label: 'People', es: 'Equipo'},
    {key: 'numbers', label: 'Numbers', es: 'Números'},
    {key: 'admin', label: 'Admin', es: 'Administración'}
  ];
  // The Lists pages: Lists in the bar stands for them all.
  const LISTS = ['zonereset', 'huddle', 'timers', 'foodsafety', 'safecount'];
  const BADGES = {tasks: 'tasksTabBadge', calendar: 'weekTabBadge'};

  const tabs = document.querySelector('.tabs');
  if(!tabs) return;

  // Who is holding the device.
  function role(){
    const r = (typeof acUser !== 'undefined' && acUser && acUser.role) || '';
    const mgr = typeof launchManager !== 'undefined' && !!launchManager;
    if(['director', 'manager', 'admin'].includes(r) || (mgr && !r)) return 'director';
    if(r === 'lead' || mgr) return 'lead';
    if(!r && typeof rnDeviceSide === 'function' && rnDeviceSide() === 'boh') return 'kitchen';
    return 'member';
  }
  function barFor(who){
    if(who === 'kitchen') return ['home', 'positions', 'prepboard', 'wastelog'];
    if(who === 'director') return ['home', 'positions', 'tasks', typeof hcAllowed === 'function' && hcAllowed() ? 'headcount' : 'calendar'];
    if(who === 'lead') return ['home', 'positions', 'zonereset', 'tasks'];
    return ['home', 'positions', 'zonereset', 'wastelog'];
  }

  // Who can open a page: the same rules activateView keeps (navigation.js).
  function can(view){
    if(typeof launchIsOn === 'function' && launchIsOn() && typeof LAUNCH_VIEWS !== 'undefined' && !LAUNCH_VIEWS.includes(view)) return false;
    const lead = () => !(typeof scHidden === 'function' && scHidden());
    switch(view){
      case 'huddle': case 'safecount': return lead();
      case 'knownumbers': return typeof knPageShown === 'function' ? knPageShown() : false;
      case 'headcount': return typeof hcAllowed === 'function' && hcAllowed();
      case 'roles': return typeof rlShown === 'function' && rlShown();
      case 'directors': return typeof launchManager !== 'undefined' && !!launchManager;
      default: return true;
    }
  }

  function badge(view){
    const b = BADGES[view] && document.getElementById(BADGES[view]);
    return b && !b.hidden && b.textContent.trim() ? b.textContent.trim() : '';
  }
  function currentView(){
    const v = document.querySelector('.view.active');
    return v ? v.id.replace(/View$/, '') : 'home';
  }
  // Every page opens the one way (launch-mode.js): the top row's tab lights up too.
  function go(view){
    if(typeof launchShowTab === 'function') launchShowTab(view);
    window.scrollTo(0, 0);
  }

  const bar = document.createElement('nav');
  bar.className = 'bnav';
  bar.setAttribute('aria-label', 'Main');
  document.body.appendChild(bar);
  let drawn = '';

  function barKey(view, items){
    if(items.includes(view)) return view;
    if(LISTS.includes(view) && items.includes('zonereset')) return 'zonereset';
    return 'hub';
  }
  function sync(){
    const items = barFor(role());
    const key = barKey(currentView(), items);
    const html = items.concat('hub').map(v => {
      const p = PAGES[v], n = badge(v);
      return `<button type="button" class="bnav-btn${v === key ? ' active' : ''}" data-bnav="${v}"${v === key ? ' aria-current="page"' : ''}><span class="bnav-ic">${svg(v)}${n ? `<span class="bnav-count">${esc(n)}</span>` : ''}${v === 'hub' ? '<span class="bnav-dot" hidden></span>' : ''}</span><span class="bnav-lb">${p.bar || p.label}</span><span class="bnav-es">${p.barEs || p.es}</span></button>`;
    }).join('');
    if(html !== drawn){ bar.innerHTML = html; drawn = html; }
    // Something waiting on a page that isn't in the bar.
    const dot = bar.querySelector('.bnav-dot');
    if(dot) dot.hidden = !Object.keys(BADGES).some(v => !items.includes(v) && can(v) && badge(v));
  }

  bar.addEventListener('click', e => {
    const b = e.target.closest('.bnav-btn');
    if(!b) return;
    go(b.dataset.bnav);
  });

  // ----- Hub -----
  const RECENT_KEY = 'cfaBudaRecent';
  function recent(){
    try{ const r = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(r) ? r.filter(v => PAGES[v]) : []; }catch(e){ return []; }
  }
  function noteRecent(view){
    if(!PAGES[view] || view === 'home' || view === 'hub') return;
    try{ localStorage.setItem(RECENT_KEY, JSON.stringify([view].concat(recent().filter(v => v !== view)).slice(0, 6))); }catch(e){ /* this visit only */ }
  }
  let query = '';
  function tile(view){
    const p = PAGES[view], n = badge(view);
    return `<button type="button" class="hub-tile" data-hub-go="${view}"><span class="hub-ic">${svg(view, 19)}</span><span class="hub-tx"><span class="hub-lb">${esc(p.label)}${n ? ` <span class="bnav-badge">${esc(n)}</span>` : ''}</span><span class="hub-es">${esc(p.es)}</span></span></button>`;
  }
  function hubList(){
    const q = query.trim().toLowerCase();
    if(q){
      const hits = Object.keys(PAGES).filter(v => v !== 'hub' && can(v) &&
        (PAGES[v].label + ' ' + PAGES[v].es + ' ' + (PAGES[v].bar || '') + ' ' + (PAGES[v].find || '')).toLowerCase().includes(q));
      return hits.length ? `<div class="hub-tiles">${hits.map(tile).join('')}</div>`
        : `<p class="hub-none">Nothing matches “${esc(query.trim())}”.</p>`;
    }
    let html = '';
    const mine = barFor(role());
    const lately = recent().filter(v => can(v)).slice(0, 4);
    if(lately.length) html += `<section class="hub-grp"><h3 class="hub-h">Recent <i>Reciente</i></h3><div class="hub-recent">${lately.map(v => `<button type="button" class="hub-chip" data-hub-go="${v}">${esc(PAGES[v].label)}</button>`).join('')}</div></section>`;
    GROUPS.forEach(g => {
      const views = Object.keys(PAGES).filter(v => PAGES[v].group === g.key && can(v) && !mine.includes(v));
      if(views.length) html += `<section class="hub-grp"><h3 class="hub-h">${g.label} <i>${g.es}</i></h3><div class="hub-tiles">${views.map(tile).join('')}</div></section>`;
    });
    const dark = document.documentElement.dataset.theme === 'dark';
    html += `<section class="hub-grp"><h3 class="hub-h">Display <i>Pantalla</i></h3><div class="hub-tiles"><button type="button" class="hub-tile" data-hub-theme role="switch" aria-checked="${dark}"><span class="hub-ic">${svg('moon', 19)}</span><span class="hub-tx"><span class="hub-lb">Dark mode</span><span class="hub-es">${dark ? 'On' : 'Off'}</span></span></button></div></section>`;
    return html;
  }
  function renderHub(){
    const root = document.getElementById('hubRoot');
    if(!root) return;
    if(!root.querySelector('.hub-search')){
      root.innerHTML = `<div class="hub-head"><h2 class="hub-title">Hub <span>Todo</span></h2></div>
        <label class="hub-search">${svg('search', 18)}<input type="search" id="hubSearch" placeholder="Find a page" aria-label="Find a page" autocomplete="off" enterkeyhint="go"></label>
        <div class="hub-list" id="hubList"></div>`;
      const input = root.querySelector('#hubSearch');
      input.addEventListener('input', () => { query = input.value; document.getElementById('hubList').innerHTML = hubList(); });
      // Enter opens the first match.
      input.addEventListener('keydown', e => {
        if(e.key !== 'Enter') return;
        const first = root.querySelector('#hubList [data-hub-go]');
        if(first){ e.preventDefault(); input.blur(); go(first.dataset.hubGo); }
      });
      root.addEventListener('click', e => {
        if(e.target.closest('[data-hub-theme]')){
          const theme = document.getElementById('hdrTheme');
          if(theme) theme.click();
          document.getElementById('hubList').innerHTML = hubList();
          return;
        }
        const t = e.target.closest('[data-hub-go]');
        if(t) go(t.dataset.hubGo);
      });
    }
    const input = root.querySelector('#hubSearch');
    if(input.value !== query) input.value = query;
    document.getElementById('hubList').innerHTML = hubList();
  }

  // Every way a page opens goes through activateView (navigation.js, which
  // runs before this file): a tap, a link from Home, a sign-in. The bar
  // follows them all, and Hub draws when it opens.
  if(typeof activateView === 'function'){
    const open0 = activateView;
    activateView = function(view){
      const was = currentView();
      const out = open0.apply(this, arguments);
      const now = currentView();
      if(now === 'hub' && was !== 'hub') query = '';
      if(now === 'hub') renderHub();
      if(now !== was) noteRecent(now);
      sync();
      return out;
    };
  }
  // Who's holding the device can change without a page opening: a sign-in,
  // the manager PIN, the iPad's Front / Back switch.
  ['siRender', 'rnSetDeviceSide'].forEach(name => {
    const f = window[name];
    if(typeof f !== 'function') return;
    window[name] = function(){ const out = f.apply(this, arguments); sync(); if(currentView() === 'hub') renderHub(); return out; };
  });
  if(typeof launchSetManager === 'function'){
    const set0 = launchSetManager;
    launchSetManager = async function(){
      const out = await set0.apply(this, arguments);
      sync();
      if(currentView() === 'hub') renderHub();
      return out;
    };
  }
  Object.values(BADGES).forEach(id => {
    const b = document.getElementById(id);
    if(b && typeof MutationObserver === 'function') new MutationObserver(sync).observe(b, {attributes: true, childList: true, characterData: true, subtree: true});
  });
  window.bnavSync = sync;
  window.bnavPages = PAGES;
  sync();
})();
