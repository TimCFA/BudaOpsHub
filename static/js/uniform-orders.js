// ===== UNIFORM ORDERS =====
// The uniform order form, moved into the hub from Connecteam (Tim, Oct 2026).
// Leaders only for now: the Uniforms tab shows once the PIN is entered, and a
// leader fills it in with the team member. Same questions as the Connecteam
// form (full name, role, split between two checks, then the items); Buda FSU
// only, so no store question. The order comes out of the team member's
// paycheck once it's placed.
//
// The Uniforms tab has the form and the order list (New → Ordered → Handed
// out, with a CSV for placing the order). The items, sizes, colors and prices
// are edited in Manage → Uniforms. Until a manager edits them, the list is
// UNIFORM_SEED: the items Connecteam's form showed (Tim's PDF, women's
// outerwear); the rest are added in Manage, never guessed here.
//
// uniformOrders [{id, at, by, name, role, split, lines: [{itemId, item, group,
// color, size, qty, price}], status: 'new' | 'ordered' | 'done', orderedAt,
// doneAt}] and uniformCatalog [{id, group, name, price, colors, sizes}] live
// in the private 'orders' section (manager sessions only). Each line keeps
// the item's name and price as ordered, so a later price change never
// rewrites an old order.

const UNIFORM_GROUPS = ['Outerwear for Women', 'Outerwear for Men', 'Pants, Shorts or Skirts', 'Accessories', 'Shoes'];
const UNIFORM_ROLES = ['Team Member', 'Trainer', 'Team Leader'];
const UNIFORM_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];
const UNIFORM_SEED = [
  {id: 'uw-palomar', group: 'Outerwear for Women', name: 'Palomar Pullover', price: 35, colors: [], sizes: UNIFORM_SIZES},
  {id: 'uw-chapel', group: 'Outerwear for Women', name: 'Chapel Fleece', price: 30, colors: ['Red', 'Blue'], sizes: UNIFORM_SIZES},
  {id: 'uw-softshell', group: 'Outerwear for Women', name: 'Softshell Jacket', price: 30, colors: ['Red', 'Blue'], sizes: UNIFORM_SIZES},
  {id: 'uw-tanasbourne', group: 'Outerwear for Women', name: 'Tanasbourne Rainjacket', price: 70, colors: ['Red', 'Blue'], sizes: UNIFORM_SIZES},
  {id: 'uw-northeast8', group: 'Outerwear for Women', name: 'Northeast 8 Jacket', price: 72.75, colors: ['Blue', 'Red'], sizes: UNIFORM_SIZES},
  {id: 'uw-parka', group: 'Outerwear for Women', name: 'Parka', price: 131.5, colors: [], sizes: UNIFORM_SIZES},
];
const UNIFORM_STATUS = {new: 'New', ordered: 'Ordered', done: 'Handed out'};

function uniformItems(){ return Array.isArray(uniformCatalog) ? uniformCatalog : UNIFORM_SEED; }
function uoEnsureOwnCatalog(){ if(!Array.isArray(uniformCatalog)) uniformCatalog = JSON.parse(JSON.stringify(UNIFORM_SEED)); }

const uoCents = n => Math.round((+n || 0) * 100);
const uoMoney = cents => '$' + (cents / 100).toFixed(2);
function uoLineCents(l){ return uoCents(l.price) * (+l.qty || 0); }
function uoTotalCents(lines){ return (lines || []).reduce((s, l) => s + uoLineCents(l), 0); }
// Split over two checks: the first takes the odd cent.
function uoSplitCents(total){ const first = Math.ceil(total / 2); return [first, total - first]; }
function uoLineText(l){ return `${l.qty} × ${l.item}${l.color ? ', ' + l.color : ''}${l.size ? ', ' + l.size : ''}`; }
function uoId(){ return 'uo-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// Everyone on this week's schedule, for the name box.
function uoRosterNames(){
  const names = new Set();
  [fohRoster, bohRoster].forEach(r => Object.values(r || {}).forEach(day => (Array.isArray(day) ? day : []).forEach(p => { if(p && p.name) names.add(String(p.name).trim()); })));
  return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

// ----- The Uniforms tab -----

let uoPane = 'new';           // 'new' (the form) or 'orders'
let uoFilter = 'open';        // orders shown: 'open' | 'done' | 'all'
let uoDraft = {name: '', role: '', split: '', lines: []};
let uoPicks = {};             // {itemId: {color, size, qty}}: the choices on each item card

function uoShown(){ return typeof launchManager === 'undefined' || !!launchManager; }

function uoOpenCount(){ return uniformOrders.filter(o => o.status !== 'done').length; }

function renderUniformsView(){
  const root = document.getElementById('uniformsRoot');
  if(!root) return;
  if(!uoShown()){ root.innerHTML = ''; return; }
  const open = uoOpenCount();
  root.innerHTML = `
    <div class="uo-head">
      <h2 class="uo-title">Uniform Orders</h2>
      <div class="uo-panes" role="tablist" aria-label="Uniform orders">
        <button type="button" class="uo-pane-btn ${uoPane === 'new' ? 'active' : ''}" role="tab" aria-selected="${uoPane === 'new'}" data-uo-pane="new">New order</button>
        <button type="button" class="uo-pane-btn ${uoPane === 'orders' ? 'active' : ''}" role="tab" aria-selected="${uoPane === 'orders'}" data-uo-pane="orders">Orders${open ? ` <span class="uo-count">${open}</span>` : ''}</button>
      </div>
    </div>
    <div id="uoPaneRoot">${uoPane === 'new' ? uoFormHtml() : uoOrdersHtml()}</div>`;
}

function uoChoice(name, value, cur, label){
  return `<button type="button" class="uo-choice ${value === cur ? 'is-on' : ''}" aria-pressed="${value === cur}" data-uo-set="${escapeHtml(name)}" data-uo-val="${escapeHtml(value)}">${escapeHtml(label || value)}</button>`;
}

function uoItemCardHtml(it){
  const pick = uoPicks[it.id] || {};
  const colors = Array.isArray(it.colors) ? it.colors : [], sizes = Array.isArray(it.sizes) ? it.sizes : [];
  const pickBtn = (kind, v) => `<button type="button" class="uo-pick ${pick[kind] === v ? 'is-on' : ''}" aria-pressed="${pick[kind] === v}" data-uo-pick="${kind}" data-uo-item="${escapeHtml(it.id)}" data-uo-val="${escapeHtml(v)}">${escapeHtml(v)}</button>`;
  return `
    <div class="uo-item" data-uo-card="${escapeHtml(it.id)}">
      <div class="uo-item-top"><b>${escapeHtml(it.name)}</b><span class="uo-price">${uoMoney(uoCents(it.price))}</span></div>
      ${colors.length ? `<div class="uo-pick-row"><span>Color</span>${colors.map(c => pickBtn('color', c)).join('')}</div>` : ''}
      ${sizes.length ? `<div class="uo-pick-row"><span>Size</span>${sizes.map(s => pickBtn('size', s)).join('')}</div>` : ''}
      <div class="uo-item-add">
        <label>Qty <input type="number" min="1" max="20" step="1" inputmode="numeric" value="${escapeHtml(pick.qty || 1)}" data-uo-qty="${escapeHtml(it.id)}"></label>
        <button type="button" class="btn btn-ghost uo-add" data-uo-add="${escapeHtml(it.id)}">Add to order</button>
      </div>
    </div>`;
}

function uoFormHtml(){
  const items = uniformItems();
  const names = uoRosterNames();
  const total = uoTotalCents(uoDraft.lines);
  const [a, b] = uoSplitCents(total);
  const groups = UNIFORM_GROUPS.concat([...new Set(items.map(i => i.group))].filter(g => !UNIFORM_GROUPS.includes(g)))
    .map(g => ({g, list: items.filter(i => i.group === g)})).filter(x => x.list.length);
  return `
    <form class="uo-form" id="uoForm" autocomplete="off" novalidate>
      <p class="uo-intro">Fill this in with the team member. Once the order is placed, it comes out of their paycheck.</p>
      <div class="field"><label for="uoName">Full name</label>
        <input type="text" id="uoName" list="uoNames" maxlength="80" value="${escapeHtml(uoDraft.name)}" placeholder="Type or pick from this week's schedule">
        <datalist id="uoNames">${names.map(n => `<option value="${escapeHtml(n)}"></option>`).join('')}</datalist></div>
      <div class="uo-q"><span class="uo-q-label">Role</span><div class="uo-choices">${UNIFORM_ROLES.map(r => uoChoice('role', r, uoDraft.role)).join('')}</div></div>
      <div class="uo-q"><span class="uo-q-label">Split payment between two checks?</span><div class="uo-choices">${uoChoice('split', 'yes', uoDraft.split, 'Yes')}${uoChoice('split', 'no', uoDraft.split, 'No')}</div></div>
      ${groups.length ? groups.map(({g, list}) => `
        <details class="uo-group" ${uoDraft.lines.some(l => l.group === g) ? 'open' : ''}>
          <summary>${escapeHtml(g)} <small>${list.length} item${list.length === 1 ? '' : 's'}</small></summary>
          <div class="uo-items">${list.map(uoItemCardHtml).join('')}</div>
        </details>`).join('') : '<p class="uo-empty">No uniform items yet. Add them in Manage → Uniforms.</p>'}
      <p class="uo-more">Only the items in Manage → Uniforms show here.</p>
      <section class="uo-cart" aria-live="polite">
        <h3>This order</h3>
        ${uoDraft.lines.length ? `<ul class="uo-lines">${uoDraft.lines.map((l, i) => `
          <li><span>${escapeHtml(uoLineText(l))}</span><b>${uoMoney(uoLineCents(l))}</b><button type="button" class="uo-x" data-uo-remove="${i}" aria-label="Remove ${escapeHtml(l.item)}">${UO_X_ICON}</button></li>`).join('')}</ul>
          <p class="uo-total">Total <b>${uoMoney(total)}</b>${uoDraft.split === 'yes' ? ` <small>${uoMoney(a)} + ${uoMoney(b)} over two checks</small>` : ''}</p>`
          : '<p class="uo-empty">Nothing added yet.</p>'}
        <div class="uo-actions">
          <button type="submit" class="btn btn-primary">Submit order</button>
          ${uoDraft.lines.length || uoDraft.name ? '<button type="button" class="btn btn-ghost" data-uo-reset="1">Start over</button>' : ''}
        </div>
      </section>
    </form>`;
}

const UO_X_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function uoOrdersShown(){
  const list = uniformOrders.filter(o => uoFilter === 'all' || (uoFilter === 'done' ? o.status === 'done' : o.status !== 'done'));
  return list.slice().sort((x, y) => String(y.at).localeCompare(String(x.at)));
}

function uoWhen(iso){
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}

function uoOrderHtml(o){
  const total = uoTotalCents(o.lines);
  const [a, b] = uoSplitCents(total);
  const next = o.status === 'new' ? ['ordered', 'Mark ordered'] : o.status === 'ordered' ? ['done', 'Mark handed out'] : null;
  const back = o.status === 'ordered' ? 'new' : o.status === 'done' ? 'ordered' : null;
  return `
    <li class="uo-order is-${escapeHtml(o.status)}">
      <div class="uo-order-top">
        <b>${escapeHtml(o.name)}</b>
        <span class="uo-status">${escapeHtml(UNIFORM_STATUS[o.status] || o.status)}</span>
      </div>
      <small class="uo-order-meta">${escapeHtml([o.role, uoWhen(o.at) + (o.by ? ' by ' + o.by : ''), o.orderedAt ? 'ordered ' + uoWhen(o.orderedAt) : '', o.doneAt ? 'handed out ' + uoWhen(o.doneAt) : ''].filter(Boolean).join(' · '))}</small>
      <ul class="uo-lines">${(o.lines || []).map(l => `<li><span>${escapeHtml(uoLineText(l))}</span><b>${uoMoney(uoLineCents(l))}</b></li>`).join('')}</ul>
      <p class="uo-total">Total <b>${uoMoney(total)}</b> <small>${o.split ? `${uoMoney(a)} + ${uoMoney(b)} over two checks` : 'one check'}</small></p>
      <div class="uo-actions">
        ${next ? `<button type="button" class="btn btn-primary" data-uo-status="${escapeHtml(o.id)}" data-uo-to="${next[0]}">${next[1]}</button>` : ''}
        ${back ? `<button type="button" class="btn btn-ghost" data-uo-status="${escapeHtml(o.id)}" data-uo-to="${back}">Undo</button>` : ''}
        <button type="button" class="btn btn-ghost uo-delete" data-uo-delete="${escapeHtml(o.id)}">Delete</button>
      </div>
    </li>`;
}

function uoOrdersHtml(){
  const list = uoOrdersShown();
  const chip = (k, label) => `<button type="button" class="uo-choice ${uoFilter === k ? 'is-on' : ''}" aria-pressed="${uoFilter === k}" data-uo-filter="${k}">${label}</button>`;
  return `
    <div class="uo-orders-bar">
      <div class="uo-choices">${chip('open', 'Open')}${chip('done', 'Handed out')}${chip('all', 'All')}</div>
      ${list.length ? '<button type="button" class="btn btn-ghost uo-csv" data-uo-csv="1">Download CSV</button>' : ''}
    </div>
    ${list.length ? `<ul class="uo-orders">${list.map(uoOrderHtml).join('')}</ul>`
      : `<p class="uo-empty">${uoFilter === 'open' ? 'No open orders.' : uoFilter === 'done' ? 'Nothing handed out yet.' : 'No orders yet.'}</p>`}`;
}

// One row per item ordered, for placing the order and for payroll.
function uoCsv(orders){
  const cell = v => { const s = String(v === undefined || v === null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [['Submitted', 'Name', 'Role', 'Item', 'Group', 'Color', 'Size', 'Qty', 'Price', 'Line total', 'Order total', 'Split over two checks', 'Status']];
  orders.forEach(o => {
    const total = uoMoney(uoTotalCents(o.lines));
    (o.lines || []).forEach(l => rows.push([String(o.at || '').slice(0, 10), o.name, o.role, l.item, l.group, l.color, l.size, l.qty,
      uoMoney(uoCents(l.price)), uoMoney(uoLineCents(l)), total, o.split ? 'Yes' : 'No', UNIFORM_STATUS[o.status] || o.status]));
  });
  return rows.map(r => r.map(cell).join(',')).join('\n') + '\n';
}

function uoDownloadCsv(){
  const blob = new Blob([uoCsv(uoOrdersShown())], {type: 'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `uniform-orders-${uoFilter}-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

// The form's answers, checked. {order} or {error}.
function uoReadDraft(){
  const name = String(uoDraft.name || '').trim().replace(/\s+/g, ' ');
  if(!name) return {error: 'Add the team member’s full name.'};
  if(!UNIFORM_ROLES.includes(uoDraft.role)) return {error: 'Pick their role.'};
  if(uoDraft.split !== 'yes' && uoDraft.split !== 'no') return {error: 'Answer whether to split payment between two checks.'};
  if(!uoDraft.lines.length) return {error: 'Add at least one item.'};
  return {order: {name, role: uoDraft.role, split: uoDraft.split === 'yes', lines: uoDraft.lines.map(l => ({...l}))}};
}

// The item card's choices as a line, or an error.
function uoLineFromPick(it, pick){
  const colors = Array.isArray(it.colors) ? it.colors : [], sizes = Array.isArray(it.sizes) ? it.sizes : [];
  if(colors.length && !colors.includes(pick.color)) return {error: `Pick a color for the ${it.name}.`};
  if(sizes.length && !sizes.includes(pick.size)) return {error: `Pick a size for the ${it.name}.`};
  const qty = Math.round(+pick.qty || 1);
  if(qty < 1 || qty > 20) return {error: 'Quantity is 1 to 20.'};
  const line = {itemId: it.id, item: it.name, group: it.group, qty, price: +it.price || 0};
  if(colors.length) line.color = pick.color;
  if(sizes.length) line.size = pick.size;
  return {line};
}

function uoAddLine(line){
  const same = uoDraft.lines.find(l => l.itemId === line.itemId && l.color === line.color && l.size === line.size);
  if(same) same.qty = Math.min(20, same.qty + line.qty); else uoDraft.lines.push(line);
}

function uoRedrawForm(){
  const pane = document.getElementById('uoPaneRoot');
  if(pane && uoPane === 'new') pane.innerHTML = uoFormHtml();
}

// Another device's change: the order list redraws; the form waits while
// it's being typed in.
function uoRerender(){
  const view = document.getElementById('uniformsView');
  if(view && view.classList.contains('active')){
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#uoForm');
    if(uoPane === 'orders' || !typing) renderUniformsView();
  }
  if(typeof renderUniformCatalogManage === 'function' && !uoEditId) renderUniformCatalogManage();
}

document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t || !t.closest('#uniformsRoot')) return;
  const pane = t.closest('[data-uo-pane]');
  if(pane){ uoPane = pane.dataset.uoPane; renderUniformsView(); return; }
  const filter = t.closest('[data-uo-filter]');
  if(filter){ uoFilter = filter.dataset.uoFilter; renderUniformsView(); return; }
  const set = t.closest('[data-uo-set]');
  if(set){ uoDraft[set.dataset.uoSet] = set.dataset.uoVal; uoRedrawForm(); return; }
  const pick = t.closest('[data-uo-pick]');
  if(pick){
    const p = uoPicks[pick.dataset.uoItem] = uoPicks[pick.dataset.uoItem] || {};
    p[pick.dataset.uoPick] = pick.dataset.uoVal;
    pick.parentNode.querySelectorAll('.uo-pick').forEach(b => { const on = b === pick; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
    return;
  }
  const add = t.closest('[data-uo-add]');
  if(add){
    const it = uniformItems().find(i => i.id === add.dataset.uoAdd);
    if(!it) return;
    const {line, error} = uoLineFromPick(it, uoPicks[it.id] || {});
    if(error){ showToast(error); return; }
    uoAddLine(line);
    delete uoPicks[it.id];
    uoRedrawForm();
    showToast(`Added: ${uoLineText(line)}`);
    return;
  }
  const remove = t.closest('[data-uo-remove]');
  if(remove){ uoDraft.lines.splice(+remove.dataset.uoRemove, 1); uoRedrawForm(); return; }
  if(t.closest('[data-uo-reset]')){
    if(uoDraft.lines.length && !confirm('Clear this order and start over?')) return;
    uoDraft = {name: '', role: '', split: '', lines: []}; uoPicks = {}; uoRedrawForm(); return;
  }
  const status = t.closest('[data-uo-status]');
  if(status){
    const o = uniformOrders.find(x => x.id === status.dataset.uoStatus);
    if(!o) return;
    const to = status.dataset.uoTo, now = new Date().toISOString();
    if(to === 'ordered' && o.status === 'new') o.orderedAt = now;
    if(to === 'done') o.doneAt = now;
    if(to === 'new') delete o.orderedAt;
    if(to === 'ordered' && o.status === 'done') delete o.doneAt;
    o.status = to;
    renderUniformsView();
    showToast(`${o.name}: ${UNIFORM_STATUS[to]}`);
    saveState();
    return;
  }
  const del = t.closest('[data-uo-delete]');
  if(del){
    const o = uniformOrders.find(x => x.id === del.dataset.uoDelete);
    if(!o || !confirm(`Delete ${o.name}'s order (${uoMoney(uoTotalCents(o.lines))})?`)) return;
    uniformOrders = uniformOrders.filter(x => x.id !== o.id);
    renderUniformsView();
    showToast('Order deleted');
    saveState();
    return;
  }
  if(t.closest('[data-uo-csv]')) uoDownloadCsv();
});

document.addEventListener('input', e => {
  const t = e.target;
  if(!t || !t.closest || !t.closest('#uniformsRoot')) return;
  if(t.id === 'uoName') uoDraft.name = t.value;
  if(t.dataset.uoQty){ (uoPicks[t.dataset.uoQty] = uoPicks[t.dataset.uoQty] || {}).qty = t.value; }
});

document.addEventListener('submit', e => {
  if(e.target.id !== 'uoForm') return;
  e.preventDefault();
  const {order, error} = uoReadDraft();
  if(error){ showToast(error); return; }
  uniformOrders.push({id: uoId(), at: new Date().toISOString(), by: (typeof getInitials === 'function' && getInitials()) || '', ...order, status: 'new'});
  uoDraft = {name: '', role: '', split: '', lines: []};
  uoPicks = {};
  uoPane = 'orders'; uoFilter = 'open';
  renderUniformsView();
  showToast(`Order saved for ${order.name}`);
  saveState();
});

// ----- Manage → Uniforms: the item list -----

let uoEditId = null;   // the item open in the form ('new' for a new one)

function renderUniformCatalogManage(){
  const root = document.getElementById('uniformCatalogRoot');
  if(!root) return;
  const items = uniformItems();
  const editing = uoEditId === 'new' ? {id: 'new', group: UNIFORM_GROUPS[0], name: '', price: '', colors: [], sizes: UNIFORM_SIZES}
    : uoEditId ? items.find(i => i.id === uoEditId) : null;
  const groups = UNIFORM_GROUPS.concat([...new Set(items.map(i => i.group))].filter(g => !UNIFORM_GROUPS.includes(g)));
  root.innerHTML = `
    <div class="ev-m-bar"><button type="button" class="btn btn-primary ev-m-add" data-uo-edit="new">+ Add item</button></div>
    ${editing ? uoCatalogFormHtml(editing) : ''}
    ${groups.map(g => {
      const list = items.filter(i => i.group === g);
      return `<h4 class="uo-m-group">${escapeHtml(g)}</h4>
        ${list.length ? `<ul class="ev-m-list">${list.map(i => `
          <li class="ev-m-row">
            <div class="ev-m-main"><b>${escapeHtml(i.name)} · ${uoMoney(uoCents(i.price))}</b><small>${escapeHtml([(i.colors || []).join(', '), (i.sizes || []).join(' ')].filter(Boolean).join(' · ') || 'No color or size')}</small></div>
            <button type="button" class="btn btn-ghost ev-m-btn" data-uo-edit="${escapeHtml(i.id)}">Edit</button>
          </li>`).join('')}</ul>` : '<p class="ev-empty">None yet.</p>'}`;
    }).join('')}`;
}

function uoCatalogFormHtml(it){
  const opt = (v, cur) => `<option value="${escapeHtml(v)}" ${v === cur ? 'selected' : ''}>${escapeHtml(v)}</option>`;
  const groups = UNIFORM_GROUPS.includes(it.group) ? UNIFORM_GROUPS : UNIFORM_GROUPS.concat([it.group]);
  return `<form class="ev-form" id="uoCatalogForm" data-uo-id="${escapeHtml(it.id)}">
      <div class="field"><label for="uoItemName">Item</label><input type="text" id="uoItemName" maxlength="80" value="${escapeHtml(it.name || '')}" placeholder="e.g. Chapel Fleece" required></div>
      <div class="ev-form-row">
        <div class="field"><label for="uoItemGroup">Section</label><select id="uoItemGroup">${groups.map(g => opt(g, it.group)).join('')}</select></div>
        <div class="field"><label for="uoItemPrice">Price ($)</label><input type="number" id="uoItemPrice" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(it.price === '' ? '' : it.price)}" required></div>
      </div>
      <div class="field"><label for="uoItemColors">Colors (comma between; blank = no color choice)</label><input type="text" id="uoItemColors" maxlength="120" value="${escapeHtml((it.colors || []).join(', '))}" placeholder="e.g. Red, Blue"></div>
      <div class="field"><label for="uoItemSizes">Sizes (comma between; blank = one size)</label><input type="text" id="uoItemSizes" maxlength="200" value="${escapeHtml((it.sizes || []).join(', '))}"></div>
      <div class="ev-form-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn btn-ghost" data-uo-cancel="1">Cancel</button>
        ${it.id !== 'new' ? '<button type="button" class="btn btn-ghost ev-delete" data-uo-item-delete="1">Delete</button>' : ''}
      </div>
    </form>`;
}

const uoList = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);

function uoReadCatalogForm(){
  const val = id => (document.getElementById(id).value || '').trim();
  const name = val('uoItemName').replace(/\s+/g, ' ');
  const priceText = val('uoItemPrice');
  const price = Math.round(parseFloat(priceText) * 100) / 100;
  if(!name) return {error: 'An item needs a name.'};
  if(priceText === '' || !isFinite(price) || price < 0) return {error: 'Add the price (0 if it’s free).'};
  return {item: {group: val('uoItemGroup') || UNIFORM_GROUPS[0], name, price, colors: uoList(val('uoItemColors')), sizes: uoList(val('uoItemSizes'))}};
}

function uoCatalogChanged(msg){
  uoEditId = null;
  renderUniformCatalogManage();
  const view = document.getElementById('uniformsView');
  if(view && view.classList.contains('active')) renderUniformsView();
  showToast(msg);
  saveState();
}

document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target : null;
  if(!t || !t.closest('#uniformCatalogRoot')) return;
  const edit = t.closest('[data-uo-edit]');
  if(edit){ uoEditId = edit.dataset.uoEdit; renderUniformCatalogManage(); const f = document.getElementById('uoItemName'); if(f) f.focus(); return; }
  if(t.closest('[data-uo-cancel]')){ uoEditId = null; renderUniformCatalogManage(); return; }
  if(t.closest('[data-uo-item-delete]')){
    const it = uniformItems().find(i => i.id === uoEditId);
    if(!it || !confirm(`Remove ${it.name} from the order form? Orders already placed keep it.`)) return;
    uoEnsureOwnCatalog();
    uniformCatalog = uniformCatalog.filter(i => i.id !== it.id);
    uoCatalogChanged('Item removed');
  }
});

document.addEventListener('submit', e => {
  if(e.target.id !== 'uoCatalogForm') return;
  e.preventDefault();
  const {item, error} = uoReadCatalogForm();
  if(error){ showToast(error); return; }
  uoEnsureOwnCatalog();
  const id = e.target.dataset.uoId;
  if(id === 'new'){
    uniformCatalog.push({id: 'uw-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...item});
    uoCatalogChanged('Item added');
  } else {
    uniformCatalog = uniformCatalog.map(i => i.id === id ? {id, ...item} : i);
    uoCatalogChanged('Item saved');
  }
});
