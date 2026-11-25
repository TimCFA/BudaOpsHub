// ===== EDIT HOME (Tim, Nov 25 2026) =====
// The sheet behind "Edit Home" at the bottom of the Right Now card: each of
// the person's sections with a switch and up / down arrows (no dragging, on
// a phone), and Reset to default. What the sections are, and how the card
// uses the choice, is right-now.js ("Each person's own Home"). A change
// shows on Home at once and is kept on the phone first, marked unsent, then
// sent to /api/me/home (homePrefs/<Pass id> in Firebase, never a saved-state
// section). An unsent change is sent again until the server has it; with
// nothing unsent, the server's copy wins, so it follows the person to any
// phone. Only someone signed in by name as themselves (rnMayEdit).

const HE_EVERY = 10 * 60 * 1000;     // read the server's copy at most this often
const HE_RETRY = [5000, 30000, 120000];
const HE_ICON_UP = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
const HE_ICON_DOWN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const HE_ICON_LOCK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>';
let heSheet = null;                  // {name, layout, order, hidden} while open
let heRead = {who: '', at: 0};
let heTry = 0, heTimer = null;

function heMe(){
  const v = typeof rnViewer === 'function' ? rnViewer() : null;
  return v && rnMayEdit(v) ? v : null;
}
function heBoh(){ return typeof rnShownSide !== 'undefined' && rnShownSide === 'boh'; }
function heEs(en){ return heBoh() ? esHtml(en) : ''; }
function heRedraw(){
  const home = document.getElementById('homeView');
  if(home && home.classList.contains('active') && typeof renderRightNow === 'function') renderRightNow();
}
function heApi(method, body){
  return fetch('/api/me/home', {method, credentials: 'same-origin', cache: 'no-store',
    headers: body ? {'Content-Type': 'application/json'} : undefined, body: body ? JSON.stringify(body) : undefined})
    .then(r => r.json().catch(() => ({})).then(j => (r.ok ? j : Promise.reject(j))));
}

// From renderRightNow: send what's unsent, else take the server's copy now
// and then.
function heSync(){
  const v = heMe();
  if(!v || typeof fetch !== 'function') return;
  const mine = rnPrefsFor(v.name);
  if(mine && mine.dirty){ heSend(v.name); return; }
  if(heRead.who === v.name && Date.now() - heRead.at < HE_EVERY) return;
  heRead = {who: v.name, at: Date.now()};
  heApi('GET').then(got => {
    const now = heMe();
    if(!now || now.name !== v.name) return;
    const local = rnPrefsFor(v.name);
    if(local && local.dirty) return;
    const was = JSON.stringify(local ? [local.order, local.hidden] : null);
    rnPrefsKeep(v.name, got.at ? {order: got.order || [], hidden: got.hidden || [], at: got.at} : null);
    const is = JSON.stringify(got.at ? [got.order || [], got.hidden || []] : null);
    if(was !== is && !heSheet) heRedraw();
  }).catch(() => { heRead.at = 0; });
}

function heSend(name){
  if(heTimer) return;                       // one at a time; the latest goes
  const mine = rnPrefsFor(name);
  if(!mine || !mine.dirty) return;
  heTimer = setTimeout(() => {
    const now = rnPrefsFor(name);
    if(!now || !now.dirty){ heTimer = null; return; }
    heApi('POST', {order: now.order, hidden: now.hidden}).then(got => {
      heTimer = null; heTry = 0;
      const latest = rnPrefsFor(name);
      // Changed again while this was on its way: send that too.
      if(latest && JSON.stringify([latest.order, latest.hidden]) !== JSON.stringify([now.order, now.hidden])){ heSend(name); return; }
      rnPrefsKeep(name, {order: got.order, hidden: got.hidden, at: got.at});
      heRead = {who: name, at: Date.now()};
    }).catch(() => {
      // Offline or the server is restarting: it stays unsent and goes again.
      heTimer = null;
      const wait = HE_RETRY[Math.min(heTry++, HE_RETRY.length - 1)];
      heTimer = setTimeout(() => { heTimer = null; heSend(name); }, wait);
    });
  }, 600);
}

function heKeep(){
  const s = heSheet;
  const layout = RN_LAYOUTS[s.layout];
  // The default order is kept as none, so the card stays exactly as it
  // draws for everyone; back to the default is kept too, so every phone follows.
  const same = JSON.stringify(s.order) === JSON.stringify(layout);
  rnPrefsKeep(s.name, {order: same ? [] : s.order, hidden: s.hidden, at: Date.now(), dirty: true});
  heSend(s.name);
  heRedraw();
  heDraw();
}

function heOpen(){
  const v = heMe();
  if(!v) return;
  const layout = rnLayoutOf(v), mine = rnPrefsFor(v.name);
  heSheet = {name: v.name, layout, order: rnOrderOf(mine && mine.order, RN_LAYOUTS[layout]), hidden: (mine && mine.hidden || []).slice()};
  let el = document.getElementById('homeEditModal');
  if(!el){
    el = document.createElement('div');
    el.className = 'overlay he-overlay';
    el.id = 'homeEditModal';
    el.innerHTML = '<div class="sheet he-sheet" role="dialog" aria-modal="true" aria-labelledby="heTitle"></div>';
    el.addEventListener('click', heClick);
    document.body.appendChild(el);
  }
  heDraw();
  el.classList.add('active');
  const first = el.querySelector('[data-he-done]');
  if(first) first.focus();
}
function heClose(){
  const el = document.getElementById('homeEditModal');
  if(el) el.classList.remove('active');
  heSheet = null;
  const back = document.querySelector('[data-rn-edit]');
  if(back) back.focus();
}

function heDraw(){
  const el = document.getElementById('homeEditModal');
  if(!el || !heSheet) return;
  const s = heSheet, boh = heBoh(), ids = s.order;
  const label = id => rnItemLabel(id, s.layout);
  const row = (id, i) => {
    if(id === 'more') return `<li class="he-fold"><span>${escapeHtml(label('more'))}${heEs('More about today')}</span><small>Below this line, folded away${heEs('Below this line, folded away')}</small></li>`;
    const on = !s.hidden.includes(id), name = label(id);
    return `<li class="he-row${on ? '' : ' is-off'}">
      <span class="he-name">${escapeHtml(name)}${heEs(name)}</span>
      <span class="he-move">
        <button type="button" class="he-arrow" data-he-up="${i}" aria-label="Move ${escapeHtml(name)} up" ${i === 0 ? 'disabled' : ''}>${HE_ICON_UP}</button>
        <button type="button" class="he-arrow" data-he-down="${i}" aria-label="Move ${escapeHtml(name)} down" ${i === ids.length - 1 ? 'disabled' : ''}>${HE_ICON_DOWN}</button>
      </span>
      <button type="button" class="he-switch" role="switch" aria-checked="${on}" aria-label="Show ${escapeHtml(name)}" data-he-show="${escapeHtml(id)}"><i></i></button>
    </li>`;
  };
  const changed = JSON.stringify(ids) !== JSON.stringify(RN_LAYOUTS[s.layout]) || s.hidden.length;
  el.querySelector('.sheet').innerHTML = `
    <h2 class="he-title" id="heTitle">Edit Home${boh ? esLine('Edit Home') : ''}</h2>
    <p class="he-sub">Pick what shows on your Home, and in what order. Anything that needs you shows anyway.${heEs('Pick what shows on your Home. Anything that needs you shows anyway.')}</p>
    <div class="he-fixed">${HE_ICON_LOCK}<span>Always first: the greeting, the quote and the banner${heEs('Always first: the greeting, the quote and the banner')}</span></div>
    <ul class="he-list">${ids.map(row).join('')}</ul>
    <button type="button" class="btn btn-primary he-done" data-he-done>Done${heEs('Done')}</button>
    <button type="button" class="he-reset" data-he-reset ${changed ? '' : 'disabled'}>Reset to default${heEs('Reset to default')}</button>`;
}

function heClick(e){
  const el = document.getElementById('homeEditModal');
  if(e.target === el || e.target.closest('[data-he-done]')){ heClose(); return; }
  if(!heSheet) return;
  const s = heSheet;
  const swap = (i, j) => { if(j < 0 || j >= s.order.length) return; [s.order[i], s.order[j]] = [s.order[j], s.order[i]]; heKeep(); };
  const up = e.target.closest('[data-he-up]'), down = e.target.closest('[data-he-down]'), show = e.target.closest('[data-he-show]');
  if(up){ const i = +up.dataset.heUp; swap(i, i - 1); heRefocus('up', i - 1); }
  else if(down){ const i = +down.dataset.heDown; swap(i, i + 1); heRefocus('down', i + 1); }
  else if(show){
    const id = show.dataset.heShow;
    s.hidden = s.hidden.includes(id) ? s.hidden.filter(x => x !== id) : [...s.hidden, id];
    heKeep();
    const again = document.querySelector(`[data-he-show="${id}"]`);
    if(again) again.focus();
  }
  else if(e.target.closest('[data-he-reset]')){
    s.order = RN_LAYOUTS[s.layout].slice();
    s.hidden = [];
    heKeep();
  }
}
// The arrow follows the row it moved, so a second tap moves it again.
function heRefocus(dir, i){
  const b = document.querySelector(`[data-he-${dir}="${i}"]`);
  if(b && !b.disabled) b.focus();
  else{ const o = document.querySelector(`[data-he-${dir === 'up' ? 'down' : 'up'}="${i}"]`); if(o) o.focus(); }
}
document.addEventListener('keydown', e => { if(e.key === 'Escape' && heSheet) heClose(); });
