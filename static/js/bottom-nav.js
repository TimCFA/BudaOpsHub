// The bottom tab bar (Tim, Nov 12 2026): on a touch screen (phones and every
// tablet) Home, Set Ups, Lists and Waste sit in thumb reach, and More opens
// the rest; a computer keeps the tab row at the top. Which one shows is
// CSS's call (theme-cfa.css, "Bottom tab bar": hover:none and pointer:coarse).
// The bar owns no navigation of its own: every button presses the tab it
// stands for in the top row, so the two can never disagree.
(function(){
  const ICON = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    positions: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    zonereset: '<path d="M10 6h11M10 12h11M10 18h11"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
    wastelog: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  const svg = k => `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

  // The four always in the bar. Lists and Waste are the simplified site's
  // tabs; on the full site the same pages live in the OE menu, so the bar
  // presses the same (there hidden) tab and the page opens all the same.
  const MAIN = [
    {view: 'home', label: 'Home', es: 'Inicio'},
    {view: 'positions', label: 'Set Ups', es: 'Configuración'},
    {view: 'zonereset', label: 'Lists', es: 'Listas'},
    {view: 'wastelog', label: 'Waste', es: 'Desperdicio'}
  ];
  const LISTS = ['zonereset', 'timers', 'foodsafety', 'safecount'];

  const tabs = document.querySelector('.tabs');
  if(!tabs) return;

  const bar = document.createElement('nav');
  bar.className = 'bnav';
  bar.setAttribute('aria-label', 'Main');
  bar.innerHTML = MAIN.map(m => `<button type="button" class="bnav-btn" data-bnav="${m.view}"><span class="bnav-ic">${svg(m.view)}</span><span class="bnav-lb">${m.label}</span><span class="bnav-es">${m.es}</span></button>`).join('')
    + `<button type="button" class="bnav-btn" data-bnav="more" aria-haspopup="dialog" aria-expanded="false"><span class="bnav-ic">${svg('more')}<span class="bnav-dot" hidden></span></span><span class="bnav-lb">More</span><span class="bnav-es">Más</span></button>`;
  document.body.appendChild(bar);

  const scrim = document.createElement('div');
  scrim.className = 'bnav-scrim';
  scrim.hidden = true;
  scrim.innerHTML = `<div class="bnav-sheet" role="dialog" aria-modal="true" aria-label="More"><div class="bnav-sheet-head"><h3>More</h3><button type="button" class="bnav-x" data-bnav-close aria-label="Close">${svg('x')}</button></div><div class="bnav-list"></div></div>`;
  document.body.appendChild(scrim);
  const list = scrim.querySelector('.bnav-list');
  const moreBtn = bar.querySelector('[data-bnav="more"]');

  const shown = el => getComputedStyle(el).display !== 'none';
  const mainTab = view => tabs.querySelector(`.tab[data-view="${view}"]`);
  const isMainTab = el => MAIN.some(m => mainTab(m.view) === el);

  function currentView(){
    const v = document.querySelector('.view.active');
    return v ? v.id.replace(/View$/, '') : 'home';
  }
  function barKey(view){
    const launch = typeof launchIsOn === 'function' && launchIsOn();
    if(view === 'home' || view === 'positions') return view;
    if(LISTS.includes(view) || (launch && view === 'prepboard')) return 'zonereset';
    if(view === 'wastelog' || (launch && view === 'scoreboard')) return 'wastelog';
    return 'more';
  }
  function sync(){
    const key = barKey(currentView());
    bar.querySelectorAll('.bnav-btn').forEach(b => {
      const on = b.dataset.bnav === key;
      b.classList.toggle('active', on);
      if(on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    const badge = document.getElementById('tasksTabBadge');
    bar.querySelector('.bnav-dot').hidden = !(badge && !badge.hidden);
  }

  // What More lists: every tab the top row shows that isn't in the bar, in
  // the row's own order, a menu's pages under its name; then dark mode.
  function row(el, label, es, extra){
    const view = el.dataset.view || '';
    return `<button type="button" class="bnav-row${view === currentView() ? ' active' : ''}" data-bnav-go="${rows.push(el) - 1}"><span class="bnav-row-lb">${esc(label)}${extra || ''}</span>${es ? `<span class="bnav-row-es">${esc(es)}</span>` : ''}</button>`;
  }
  let rows = [];
  function fill(){
    rows = [];
    let html = '';
    [...tabs.children].forEach(el => {
      if(!shown(el)) return;
      if(el.classList.contains('tab')){
        if(isMainTab(el)) return;
        const sub = el.querySelector('.sub');
        const badge = el.querySelector('.ps-tab-badge');
        const label = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
        html += row(el, label, sub ? sub.textContent.trim() : '', badge && !badge.hidden ? `<span class="bnav-badge">${esc(badge.textContent)}</span>` : '');
      } else if(el.classList.contains('tab-group')){
        const name = el.querySelector('.tab-group-label');
        const items = [...el.querySelectorAll('.tab-dropdown-item')].filter(shown);
        if(!items.length) return;
        html += `<div class="bnav-group">${esc(name ? name.childNodes[0].textContent.trim() : '')}</div>`;
        items.forEach(it => {
          const sub = it.querySelector('.sub-inline');
          const label = [...it.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
          html += row(it, label, sub ? sub.textContent.trim() : '');
        });
      }
    });
    const theme = document.getElementById('hdrTheme');
    if(theme){
      const dark = document.documentElement.dataset.theme === 'dark';
      html += `<div class="bnav-group">Display</div><button type="button" class="bnav-row" data-bnav-theme role="switch" aria-checked="${dark}"><span class="bnav-row-lb">${svg('moon')} Dark mode</span><span class="bnav-row-es">${dark ? 'On' : 'Off'}</span></button>`;
    }
    list.innerHTML = html;
  }

  function open(){
    fill();
    scrim.hidden = false;
    moreBtn.setAttribute('aria-expanded', 'true');
    const x = scrim.querySelector('[data-bnav-close]');
    if(x) x.focus();
  }
  function close(){
    if(scrim.hidden) return;
    scrim.hidden = true;
    moreBtn.setAttribute('aria-expanded', 'false');
  }

  bar.addEventListener('click', e => {
    const b = e.target.closest('.bnav-btn');
    if(!b) return;
    if(b.dataset.bnav === 'more'){ if(scrim.hidden) open(); else close(); return; }
    close();
    const tab = mainTab(b.dataset.bnav);
    if(tab) tab.click();
    window.scrollTo(0, 0);
    sync();
  });
  scrim.addEventListener('click', e => {
    if(e.target === scrim || e.target.closest('[data-bnav-close]')){ close(); return; }
    if(e.target.closest('[data-bnav-theme]')){
      const theme = document.getElementById('hdrTheme');
      if(theme) theme.click();
      fill();
      return;
    }
    const go = e.target.closest('[data-bnav-go]');
    if(!go) return;
    const el = rows[Number(go.dataset.bnavGo)];
    close();
    if(el) el.click();
    window.scrollTo(0, 0);
    sync();
  });
  document.addEventListener('keydown', e => { if(e.key === 'Escape') close(); });

  // Every way a page opens goes through activateView (navigation.js, which
  // runs before this file): a tap up top, a link from Home, a sign-in. The
  // bar follows them all.
  if(typeof activateView === 'function'){
    const open0 = activateView;
    activateView = function(view){
      const out = open0.apply(this, arguments);
      sync();
      return out;
    };
  }
  const badge = document.getElementById('tasksTabBadge');
  if(badge && typeof MutationObserver === 'function') new MutationObserver(sync).observe(badge, {attributes: true, childList: true});
  window.bnavSync = sync;
  sync();
})();
